"""Fetch NOTRA's Other-Breed grading guide and build the NOTRA oval-racing feed.

The National Oval Track Racing Association (notra.org) sanctions oval racing
for Whippets and, under its own chapter of the rules, for the other sighthound
breeds. The Other-Breed Recorder publishes one workbook, the Other-Breed
grading guide (downloads/OBGradGuid.xlsx, with a PDF copy), "updated after
each meet" and linked from the home page with a "Current as of M/D/YYYY"
label. Two sheets carry the hounds, "Active 2022-2026" and "Inactive
2021-Prior", with the same columns: WAVE, DQ/OC/DNF counts, the legs toward
the Junior and Senior Oval Racer titles, ORC points, National (NORC) points
for this year, prior years and lifetime, and the last three meets as a score,
a status and a date. Two more sheets hold NOTRA's own Top 10 by breed and new
titles for the last two seasons; they are not read.

This script archives a parsed snapshot of each new guide under
data/notra/snapshots/, then rebuilds data/notra.json (active hounds,
standings, owners, movement) and data/notra-registry.json (every hound,
compact) from all snapshots. Whippets, whose guide has its own layout, are
not covered yet.

Usage:
    python tools/notra.py                    # fetch, archive if changed, rebuild
    python tools/notra.py --force            # archive even if unchanged
    python tools/notra.py --seen YYYY-MM-DD  # first-seen day for a re-issued guide
    python tools/notra.py --file PATH --date YYYY-MM-DD
    python tools/notra.py --offline          # rebuild from the snapshots alone
"""

from __future__ import annotations

import argparse
import re
import sys
import zipfile
from collections import Counter
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urljoin

import openpyxl
import requests

from racing import (
    DATA, RacingParseError, build_movement, build_owners, cell_num, cell_str,
    compact_registry, cumulative_titles, derive_identity, fetch_bytes, fetch_text,
    file_raw, grade, last_raced, load_snapshots, rank_by, redate_if_label_stale,
    sha256, slug, super_level, today, wave, write_json, write_snapshot_if_changed,
)

ORG = "notra"
SITE_URL = "https://www.notra.org"
GUIDE_PAGE = "https://www.notra.org/index.html"
DOWNLOADS_PAGE = "https://www.notra.org/Downloads.html"
RULES_URL = "https://www.notra.org/downloads/rulebk1.pdf"
RAW_DIR = DATA / "notra" / "raw"
SNAPSHOT_DIR = DATA / "notra" / "snapshots"
FEED = DATA / "notra.json"
REGISTRY = DATA / "notra-registry.json"

GUIDE_HREF_RE = re.compile(r'href="([^"]*OBGradGuid\.xlsx?)"', re.IGNORECASE)
# "OB Grading Guide *Current as of 06/10/2026", month first as elsewhere on
# the site (the Whippet guide's label reads 9/24/2026).
LABEL_RE = re.compile(
    r"OB\s+Grading\s+Guide[^<]{0,40}?Current\s+as\s+of\s*(\d{1,2})/(\d{1,2})/(\d{2,4})",
    re.IGNORECASE,
)

# The registration-number prefix names the breed. NOTRA's letters are its own
# (BZ for Borzoi, SA for Saluki, IB for Ibizan Hound), and the Podengo Medio
# turns up as PP and PPm.
PREFIX_BREEDS = {
    "A": "Afghan Hound",
    "AZ": "Azawakh",
    "BA": "Basenji",
    "BZ": "Borzoi",
    "C": "Cirneco dell'Etna",
    "G": "Greyhound",
    "IB": "Ibizan Hound",
    "IG": "Italian Greyhound",
    "IW": "Irish Wolfhound",
    "MA": "Magyar Agar",
    "P": "Pharaoh Hound",
    "PP": "Portuguese Podengo Medio / Grande",
    "PPM": "Portuguese Podengo Medio / Grande",
    "PPP": "Portuguese Podengo Pequeno",
    "R": "Rhodesian Ridgeback",
    "SA": "Saluki",
    "SD": "Scottish Deerhound",
    "SL": "Sloughi",
    "SW": "Silken Windhound",
}

HEADERS = [
    "NRN", "CALL NAME", "WAVE", "DQ/OC/DNF", "FULL NAME", "OWNER", "JOR", "SOR",
    "ORC", "YTD NORC", "PRIOR NORC", "LFTM NORC",
    "REC", "SC-R", "DATE-R", "MID", "SC-M", "DATE-M", "OLD", "SC-O", "DATE-O",
]
MEET_COLUMNS = ((12, 13, 14), (15, 16, 17), (18, 19, 20))   # score, status, date

# A number as the recorder writes it (A-293, IW116, SW-225a: a re-used number
# gets a letter) or a hound still waiting for one: FTE (first time entered)
# and PEND (registration pending) rows, which NOTRA's own Top 10 lists rank
# alongside the numbered hounds.
NRN_RE = re.compile(r"^([A-Za-z]{1,3})-?(\d{1,4})([A-Za-z])?$")
PENDING_RE = re.compile(r"^([A-Za-z]{1,3})-(FTE|PEND)$", re.IGNORECASE)

# Rules, February 2025: 7.4 ORC at 12 ORC points for Other Breeds; 7.5 SORC
# at 30 NORC points and every 30 after; 7.3 Junior Oval Racer after four
# completed meets and Senior Oval Racer after six qualifying legs.
ORC_POINTS = 12
NATIONAL_STEP = 30
JOR_LEGS = 4
SOR_LEGS = 6
EARLIEST_MEET_YEAR = 1992   # NOTRA was formed in 1992

REGISTRY_COLUMNS = [
    "id", "breed_slug", "call_name", "registered_name", "note", "owner_raw", "wave",
    "grade", "orc", "ytd", "prior", "lftm", "jor", "sor", "faults", "rank_breed",
    "rank_all", "rank_career", "meets", "last_raced", "active", "sheet", "duplicate_of",
]


# ------------------------------------------------------------------- fetch

def find_guide_url(html: str, page: str) -> str | None:
    match = GUIDE_HREF_RE.search(html)
    return urljoin(page, match.group(1)) if match else None


def find_label_date(html: str) -> date | None:
    match = LABEL_RE.search(html)
    if not match:
        return None
    month, day, year = (int(part) for part in match.groups())
    if year < 100:
        year += 2000
    return date(year, month, day)


def workbook_modified(path: Path) -> date | None:
    """The workbook's own last-saved date, the fallback when the page label is
    missing; the two agreed (June 10, 2026) when this was written."""
    try:
        with zipfile.ZipFile(path) as book:
            core = book.read("docProps/core.xml").decode("utf-8", "replace")
    except (zipfile.BadZipFile, KeyError):
        return None
    match = re.search(r"<dcterms:modified[^>]*>(\d{4}-\d{2}-\d{2})", core)
    return date.fromisoformat(match.group(1)) if match else None


def fetch() -> tuple[Path, date | None, str]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    home = fetch_text(GUIDE_PAGE)
    url = find_guide_url(home, GUIDE_PAGE) or find_guide_url(fetch_text(DOWNLOADS_PAGE), DOWNLOADS_PAGE)
    if not url:
        raise RacingParseError(
            f"No Other-Breed grading guide link on {GUIDE_PAGE} or {DOWNLOADS_PAGE}. "
            f"The site layout changed; look at it before trusting any parse."
        )
    raw = fetch_bytes(url)
    if not raw.startswith(b"PK"):
        raise RacingParseError("The guide download is not a workbook (no zip signature)")
    # Filed under its date once the date is settled (file_raw).
    target = RAW_DIR / "fetched.xlsx"
    target.write_bytes(raw)
    label = find_label_date(home)
    print(f"Fetched {url}  {len(raw):,} bytes; page label {label or 'not found'}")
    return target, label, url


# ------------------------------------------------------------------- parse

def _norm_header(value) -> str:
    return re.sub(r"\s+", "", cell_str(value)).upper()


def find_header_row(rows: list[list]) -> int | None:
    for index, row in enumerate(rows[:12]):
        if _norm_header(row[0]) == "NRN" and _norm_header(row[1]) == "CALLNAME":
            return index
    return None


def meet_date(value) -> tuple[str | None, str]:
    """A meet's date as ISO and as published. The recorder types most dates
    (5/24/2026) and Excel holds the rest; a typo (5/24/2206, 9./14/2025)
    stays as text with no date."""
    if isinstance(value, datetime):
        value = value.date()
    if isinstance(value, date):
        return value.isoformat(), f"{value.month}/{value.day}/{value.year}"
    text = cell_str(value)
    match = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", text)
    if match:
        month, day, year = (int(part) for part in match.groups())
        if year < 100:
            year += 2000
        try:
            return date(year, month, day).isoformat(), text
        except ValueError:
            pass
    return None, text


def parse_workbook(path: Path, guide_date: date, date_source: str,
                   source_url: str | None = None) -> dict:
    book = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheets: list[tuple[str, list[list]]] = []
    for sheet in book.worksheets:
        rows = [list(row) for row in sheet.iter_rows(max_col=len(HEADERS), values_only=True)]
        header_index = find_header_row(rows)
        if header_index is None:
            continue
        found = [_norm_header(cell) for cell in rows[header_index]]
        expected = [_norm_header(h) for h in HEADERS]
        if found != expected:
            raise RacingParseError(
                f"sheet {sheet.title!r}: headers {found} differ from {expected}"
            )
        sheets.append((sheet.title, rows[header_index + 1:]))
    book.close()
    if not sheets:
        raise RacingParseError("no sheet opens with the NRN / CALL NAME header row")

    by_breed: dict[str, list[dict]] = {}
    numbered: dict[str, dict] = {}
    counts: Counter = Counter()
    dropped: list[dict] = []
    stray: list[list] = []
    for title, rows in sheets:
        lowered = title.lower()
        sheet_kind = "inactive" if "inactive" in lowered else "active" if "active" in lowered else title
        for row in rows:
            if not any(cell_str(cell) for cell in row[:6]):
                continue
            raw_id = cell_str(row[0])
            match = NRN_RE.match(raw_id)
            pending = PENDING_RE.match(raw_id)
            if match:
                prefix = match.group(1).upper()
                base = f"{prefix}-{int(match.group(2))}{(match.group(3) or '').upper()}"
            elif pending:
                prefix = pending.group(1).upper()
                base = f"{prefix}-{pending.group(2).upper()}"
            else:
                stray.append([cell_str(cell) for cell in row[:6]])
                continue
            if prefix not in PREFIX_BREEDS:
                raise RacingParseError(
                    f"unknown registration prefix {prefix!r} ({raw_id}) - add it to PREFIX_BREEDS"
                )
            call_name = cell_str(row[1])
            registered_raw = cell_str(row[4])
            if match and base in numbered:
                # The same hound on both sheets (moved to Active, left on
                # Inactive): one record, from the sheet that lists it first.
                first = numbered[base]
                if (first["call_name"].lower() == call_name.lower()
                        or first["registered_raw"].lower() == registered_raw.lower()):
                    dropped.append({"id": base, "sheet": sheet_kind, "call_name": call_name})
                    continue
            counts[base] += 1
            dog_id = base if counts[base] == 1 else f"{base}-{counts[base]}"
            meets = []
            for score_col, status_col, date_col in MEET_COLUMNS:
                score = cell_num(row[score_col])
                status = cell_str(row[status_col])
                when, when_raw = meet_date(row[date_col])
                if score is None and not status and not when_raw:
                    continue
                meets.append({"score": score, "status": status, "date": when, "date_raw": when_raw})
            dog = {
                "id": dog_id,
                "prefix": prefix,
                "sheet": sheet_kind,
                "call_name": call_name,
                "wave": cell_num(row[2]),
                "faults_raw": cell_str(row[3]),
                "registered_raw": registered_raw,
                "owner_raw": cell_str(row[5]),
                "jor": cell_num(row[6]),
                "sor": cell_num(row[7]),
                "orc": cell_num(row[8]),
                "ytd": cell_num(row[9]),
                "prior": cell_num(row[10]),
                "lftm": cell_num(row[11]),
                "meets": meets,
            }
            if raw_id != dog_id:
                dog["id_raw"] = raw_id
            if pending:
                dog["unnumbered"] = True
            if match and counts[base] > 1:
                dog["duplicate_of"] = base
            if match and counts[base] == 1:
                numbered[base] = dog
            by_breed.setdefault(PREFIX_BREEDS[prefix], []).append(dog)

    if stray:
        raise RacingParseError(
            f"{len(stray)} rows are neither hounds nor blank, e.g. {stray[:3]}"
        )
    if not by_breed:
        raise RacingParseError("no hounds found")

    sections = [
        {"breed_raw": breed, "prefixes": sorted({d["prefix"] for d in dogs}), "dogs": dogs}
        for breed, dogs in sorted(by_breed.items())
    ]
    raw = path.read_bytes()
    return {
        "org": ORG,
        "guide_date": guide_date.isoformat(),
        "guide_date_source": date_source,
        "season": guide_date.year,
        "source_url": source_url,
        "source_page": GUIDE_PAGE,
        "source_file": path.name,
        "sha256": sha256(raw),
        "fetched": today(),
        "columns": HEADERS,
        "sheets": [title for title, _ in sheets],
        "dropped": dropped,
        "sections": sections,
    }


# ------------------------------------------------------------------- build

def titles_of(dog: dict) -> list[str]:
    """Titles the points and legs columns say the hound has reached."""
    titles = []
    if (dog.get("orc") or 0) >= ORC_POINTS:
        titles.append("ORC")
    titles.extend(cumulative_titles("SORC", super_level(dog.get("lftm"), NATIONAL_STEP)))
    if (dog.get("jor") or 0) >= JOR_LEGS:
        titles.append("JOR")
    if (dog.get("sor") or 0) >= SOR_LEGS:
        titles.append("SOR")
    return titles


def swap_day_month(iso: str) -> str | None:
    """The same date with day and month the other way round, when that is a
    date at all."""
    year, month, day = (int(part) for part in iso.split("-"))
    if day > 12:
        return None
    return date(year, day, month).isoformat()


def parse_faults(text: str) -> dict | None:
    """The DQ/OC/DNF column: three counts, disqualifications, off-course runs
    and did-not-finishes, as "0/1/2"."""
    match = re.fullmatch(r"\s*(\d+)\s*/\s*(\d+)\s*/\s*(\d+)\s*", text or "")
    if not match:
        return None
    dq, oc, dnf = (int(part) for part in match.groups())
    return {"dq": dq, "oc": oc, "dnf": dnf}


def derive(snapshot: dict) -> list[dict]:
    """Every hound in a snapshot with the site's derived fields and ranks."""
    season = snapshot["season"]
    guide_date = snapshot["guide_date"]
    dogs: list[dict] = []
    for section in snapshot["sections"]:
        for raw in section["dogs"]:
            dog = dict(raw)
            dog["breed"] = section["breed_raw"]
            dog["breed_slug"] = slug(dog["breed"])
            derive_identity(dog)

            meets = []
            for meet in dog["meets"]:
                when, read = meet["date"], None
                # The recorder types month/day/year, and most cells stay text.
                # The cells Excel turned into dates include a few with day and
                # month the other way round: 12/4/2026 in a guide of June 10,
                # 2026, listed between a November and a May meet, is April 12.
                # A date that falls after the guide itself is read the other
                # way round when that lands it inside the guide; the page
                # shows the cell as written and says so.
                if when and when > guide_date:
                    swapped = swap_day_month(when)
                    if swapped and EARLIEST_MEET_YEAR <= int(swapped[:4]) and swapped <= guide_date:
                        when, read = swapped, "day/month"
                # A date the recorder mistyped (year 2206) is kept as written
                # and carries no year.
                if when and not (EARLIEST_MEET_YEAR <= int(when[:4]) and when <= guide_date):
                    when = None
                meets.append({
                    "code": meet["date_raw"] or "undated",
                    "year": int(when[:4]) if when else None,
                    "date": when,
                    "score": meet["score"],
                    "complete": meet["status"].lower() == "n",
                    "status": meet["status"],
                    "read": read,
                })
            dog["meets"] = meets
            dog["last_raced"] = last_raced(meets)
            dog["faults"] = parse_faults(dog.pop("faults_raw"))

            computed = wave([(m["score"], m["complete"]) for m in meets])
            dog["wave_computed"] = round(computed, 6) if computed is not None else None
            dog["wave"] = round(dog["wave"], 6) if dog["wave"] is not None else None
            dog["wave_matches"] = (
                dog["wave"] is not None and computed is not None
                and abs(dog["wave"] - computed) <= 0.01
            )
            dog["grade"] = grade(dog["wave"])
            dog["titled"] = {
                "orc": (dog["orc"] or 0) >= ORC_POINTS,
                "sorc": super_level(dog["lftm"], NATIONAL_STEP),
                "jor": (dog["jor"] or 0) >= JOR_LEGS,
                "sor": (dog["sor"] or 0) >= SOR_LEGS,
            }
            dog["active"] = bool(
                (dog["ytd"] or 0) > 0
                or any(m["year"] is not None and m["year"] >= season - 1 for m in meets)
            )
            dogs.append(dog)

    # Standings: this season's National points within the breed and across
    # breeds, the figure NOTRA's own Top 10 by breed ranks; lifetime National
    # points across the whole registry.
    for breed in {dog["breed"] for dog in dogs}:
        rank_by([dog for dog in dogs if dog["breed"] == breed], "ytd", "rank_breed")
    rank_by(dogs, "ytd", "rank_all")
    rank_by(dogs, "lftm", "rank_career")
    return dogs


def build(snapshots: list[dict]) -> tuple[dict, dict]:
    current = snapshots[-1]
    previous = snapshots[-2] if len(snapshots) > 1 else None
    season = current["season"]

    dogs = derive(current)
    prior_dogs = derive(previous) if previous else None
    movement = build_movement(
        dogs, prior_dogs, previous["guide_date"] if previous else None,
        ["wave", "orc", "lftm", "ytd"], titles_of,
    )
    for dog in dogs:
        dog["movement"] = movement.get(dog["id"])

    active = [dog for dog in dogs if dog["active"]]
    owners = build_owners(active, ["ytd", "lftm"], "wave")

    sections = []
    for breed in sorted({dog["breed"] for dog in dogs}):
        members = [dog for dog in dogs if dog["breed"] == breed]
        prefixes = sorted({dog["prefix"] for dog in members})
        leader = min(
            (dog for dog in members if dog["rank_breed"] == 1),
            key=lambda dog: dog["call_name"], default=None,
        )
        sections.append({
            "breed": breed,
            "slug": slug(breed),
            "prefix": prefixes[0],
            "prefixes": prefixes,
            "section_raw": breed,
            "registry": len(members),
            "active": sum(dog["active"] for dog in members),
            "ytd": sum((dog["ytd"] or 0) > 0 for dog in members),
            "titled": sum(dog["titled"]["orc"] for dog in members),
            "leader": {
                "id": leader["id"], "call_name": leader["call_name"],
                "ytd": leader["ytd"],
            } if leader else None,
        })

    # Meets are dated, not coded, so two meets on one day count as one.
    meets_this_year = {
        m["date"] for dog in dogs for m in dog["meets"] if m["year"] == season
    }
    titles_since = [
        {"id": dog["id"], "call_name": dog["call_name"], "breed": dog["breed"],
         "title": title, "since": dog["movement"]["since"]}
        for dog in active if dog["movement"]
        for title in dog["movement"]["new_titles"]
    ]
    titles_since.sort(key=lambda row: (row["breed"], row["call_name"], row["title"]))

    stats = {
        "hounds_registry": len(dogs),
        "hounds_duplicate_numbers": sum("duplicate_of" in dog for dog in dogs),
        "hounds_unnumbered": sum(dog.get("unnumbered", False) for dog in dogs),
        "hounds_dropped": len(current.get("dropped", [])),
        "hounds_active": len(active),
        "hounds_ytd": sum((dog["ytd"] or 0) > 0 for dog in dogs),
        "hounds_raced": sum(any(m["year"] == season for m in dog["meets"]) for dog in dogs),
        "breeds_raced": len({dog["breed"] for dog in dogs
                             if any(m["year"] == season for m in dog["meets"])}),
        "titled_orc": sum(dog["titled"]["orc"] for dog in dogs),
        "titled_sorc": sum(dog["titled"]["sorc"] > 0 for dog in dogs),
        "titled_jor": sum(dog["titled"]["jor"] for dog in dogs),
        "titled_sor": sum(dog["titled"]["sor"] for dog in dogs),
        "breeds": len(sections),
        "breeds_active": sum(section["active"] > 0 for section in sections),
        "breeds_ytd": sum(section["ytd"] > 0 for section in sections),
        "meets_this_year": len(meets_this_year),
        "meets_listed": sum(len(dog["meets"]) for dog in dogs),
        "meets_undecoded": sum(m["year"] is None for dog in dogs for m in dog["meets"]),
        "owners_active": len(owners),
        # Over hounds with meets listed: an inactive hound keeps its WAVE
        # after the recorder clears its meets, so nothing recomputes for it.
        "wave_agreement": round(
            sum(dog["wave_matches"] for dog in dogs if dog["wave"] is not None and dog["meets"])
            / max(1, sum(dog["wave"] is not None and bool(dog["meets"]) for dog in dogs)), 4),
    }

    feed_dog_fields = [
        "id", "breed", "breed_slug", "call_name", "registered_name", "titles",
        "note", "owner_raw", "owners", "wave", "wave_matches", "grade", "orc",
        "ytd", "prior", "lftm", "jor", "sor", "faults", "titled", "rank_breed",
        "rank_all", "rank_career", "meets", "last_raced", "movement", "sheet",
        "duplicate_of", "unnumbered",
    ]

    def pack_meets(dog: dict) -> list[list]:
        return [[m["code"], m["year"], m["date"], m["score"], m["complete"], m["status"], m["read"]]
                for m in dog["meets"]]

    def compact_dog(dog: dict) -> dict:
        row = {field: dog.get(field) for field in feed_dog_fields}
        for optional in ("duplicate_of", "unnumbered"):
            if row[optional] is None:
                del row[optional]
        if not dog["wave_matches"] and dog["wave_computed"] is not None:
            row["wave_computed"] = dog["wave_computed"]
        row["meets"] = pack_meets(dog)
        return row

    feed = {
        "org": ORG,
        "name": "NOTRA",
        "program": "oval racing",
        "season": season,
        "guide_date": current["guide_date"],
        "guide_date_source": current["guide_date_source"],
        "previous_guide_date": previous["guide_date"] if previous else None,
        "generated": today(),
        "source_url": current["source_url"],
        "source_page": GUIDE_PAGE,
        "site_url": SITE_URL,
        "rules_url": RULES_URL,
        "snapshots": [snap["guide_date"] for snap in snapshots],
        "active_since": f"{season - 1}-01-01",
        "stats": stats,
        "sections": sections,
        "dogs": [compact_dog(dog) for dog in active],
        "owners": owners,
        "titles_since_previous": titles_since,
        "meet_columns": ["code", "year", "date", "score", "complete", "status", "read"],
        "notes": [
            "Other Breeds only: the Whippet guide has its own layout and is not "
            "covered yet.",
            "Standings rank this season's National points (the guide's YTD NORC "
            "column) within each breed and across breeds; career standings rank "
            "lifetime National points (LFTM NORC).",
            "WAVE is recomputed from the last three listed meets per NOTRA Rules "
            "4.2.2, counting a meet as complete when its status is n; "
            "wave_matches is false where the recorder's published figure "
            "differs, and the published figure is the one shown. "
            "wave_agreement is measured over hounds with meets listed.",
            "Titles follow the points and legs columns: ORC at 12 ORC points "
            "(rule 7.4), SORC at every 30 lifetime National points (7.5), JOR "
            "after four completed meets and SOR after six legs (7.3).",
            "Meets are dated rather than coded; code is the date cell as written. "
            "A date cell that falls after the guide itself is read with day and "
            "month the other way round when that lands it inside the guide "
            "(12/4/2026 as April 12, read = day/month); a date the recorder "
            "mistyped (5/24/2206) is kept as written and counts as undated. FTE "
            "and PEND rows are hounds without a race number yet; they keep those "
            "labels as their ids, numbered -2, -3 in sheet order.",
        ],
    }

    dogs.sort(key=lambda dog: (dog["breed"], dog["call_name"], dog["id"]))
    registry_rows = []
    for dog in dogs:
        row = dict(dog)
        row["meets"] = pack_meets(dog)
        registry_rows.append(row)
    registry = {
        "org": ORG,
        "guide_date": current["guide_date"],
        "season": season,
        **compact_registry(registry_rows, REGISTRY_COLUMNS),
    }
    return feed, registry


# -------------------------------------------------------------------- main

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--force", action="store_true",
                        help="archive even if the guide is unchanged")
    parser.add_argument("--file", type=Path,
                        help="parse this workbook instead of fetching (needs --date)")
    parser.add_argument("--date", type=date.fromisoformat,
                        help="the guide's date, when it cannot be read from the home page")
    parser.add_argument("--offline", action="store_true",
                        help="rebuild the feed from archived snapshots without fetching")
    parser.add_argument("--seen", type=lambda text: date.fromisoformat(text).isoformat(),
                        help="the day a changed guide under an unmoved label was first "
                             "seen (default: today, UTC)")
    args = parser.parse_args()

    if not args.offline:
        try:
            if args.file:
                if not args.date:
                    parser.error("--file needs --date, the guide has no date cell of its own")
                path, guide_date, source, source_url = args.file, args.date, "cli", None
            else:
                path, label, source_url = fetch()
                if args.date:
                    guide_date, source = args.date, "cli"
                elif label:
                    guide_date, source = label, "page"
                else:
                    guide_date, source = workbook_modified(path), "workbook"
                    if guide_date is None:
                        raise RacingParseError("no 'Current as of' label and no workbook date; pass --date")
                saved = workbook_modified(path)
                if saved and label and abs((saved - label).days) > 14:
                    print(f"Note: the page label says {label} but the workbook was saved {saved}.")
            snapshot = parse_workbook(path, guide_date, source, source_url)
            if source != "cli":
                snapshot = redate_if_label_stale(SNAPSHOT_DIR, snapshot, args.seen or today())
            if not args.file:
                file_raw(path, snapshot)
            write_snapshot_if_changed(SNAPSHOT_DIR, snapshot, force=args.force)
        except requests.RequestException as error:
            if not list(SNAPSHOT_DIR.glob("*.json")):
                print(f"Could not fetch the NOTRA guide and no snapshot exists: {error}",
                      file=sys.stderr)
                return 1
            print(f"Could not fetch the NOTRA guide; rebuilding from archived "
                  f"snapshots. {error}", file=sys.stderr)

    snapshots = load_snapshots(SNAPSHOT_DIR)
    feed, registry = build(snapshots)
    feed_bytes = write_json(FEED, feed)
    registry_bytes = write_json(REGISTRY, registry)

    stats = feed["stats"]
    print(
        f"NOTRA Other-Breed guide {feed['guide_date']}: {stats['hounds_registry']:,} hounds in "
        f"{stats['breeds']} breeds ({stats['hounds_unnumbered']} unnumbered, "
        f"{stats['hounds_dropped']} listed twice), {stats['hounds_active']:,} active, "
        f"{stats['hounds_ytd']} with points this year, "
        f"{stats['titled_orc']} ORC, {stats['titled_sorc']} SORC, "
        f"{stats['titled_jor']} JOR, {stats['titled_sor']} SOR, "
        f"WAVE agreement {stats['wave_agreement']:.1%}, "
        f"{stats['meets_undecoded']} undated meets"
    )
    print(f"Wrote {FEED.name} ({feed_bytes:,} bytes) and "
          f"{REGISTRY.name} ({registry_bytes:,} bytes)")

    top = Counter()
    for owner in feed["owners"]:
        top[f"{owner['key']}  <-  {owner['name']}"] = owner["hounds"]
    print("Busiest owner keys:")
    for line, hounds in top.most_common(10):
        print(f"  {hounds:3d}  {line}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
