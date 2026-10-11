"""Fetch NOTRA's Whippet grading guide and build the NOTRA Whippets feed
(Whippet racing, beta).

The National Oval Track Racing Association (notra.org) publishes its Whippet
grading guide as an old Excel workbook (downloads/GradGuid.xls, with a PDF
copy), linked from the home page with a "Current as of M/D/YYYY" label. One
sheet carries every whippet that has raced since early 2022: the rating
(the seeding order, 1 is best), grade, NOTRA registration number, names and
owners, handicap points, ORC points, National (NORC) points this season,
from earlier seasons and lifetime, WAVE on the four-program scale (out of
29), the last three meets as a two-letter meet code with the placing,
points and a status flag, and the recorder's notes on titles, off-course
runs, did-not-finishes and disqualifications. Below the dogs, a key dates
every meet code since February 2022.

The whippet rules differ from the Other Breeds' (NOTRA Rules, February 2025):
ORC at 15 ORC points (5.3); SORC at 50 National points for a dog and 30 for a
bitch (5.4), which the guide cannot show because it prints no sex, so the
SORC comes from the recorder's own title record; grades on the four-program
bands A 15.2, B 11, C 7.6 (4.2.2); three-program scores converted by 29/22;
meets of fewer than 15 starters (#n) give OTR points only and are listed but
not graded (1.12, 2.2.3).

This script archives a parsed snapshot of each new guide under
data/notra-whippets/snapshots/ (with the meet key, so codes stay dated after
the guide drops old years), then rebuilds data/notra-whippets.json (active
whippets) and data/notra-whippets-registry.json (every whippet). The raw
workbook stays out of git.

Usage:
    python tools/notra_whippets.py                    # fetch, archive if changed, rebuild
    python tools/notra_whippets.py --force            # archive even if unchanged
    python tools/notra_whippets.py --file PATH --date YYYY-MM-DD
    python tools/notra_whippets.py --offline          # rebuild from the snapshots alone
"""

from __future__ import annotations

import argparse
import re
import struct
import sys
from collections import Counter
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urljoin

import requests

from names import split_owners
from racing import (
    DATA, RacingParseError, build_movement, build_owners, cell_num, cell_str,
    compact_registry, fetch_bytes, fetch_text, file_raw, last_raced, load_snapshots,
    rank_by, read_rows_xls, redate_if_label_stale, sha256, slug, today, write_json,
    write_snapshot_if_changed,
)

ORG = "notra-whippets"
SITE_URL = "https://www.notra.org"
GUIDE_PAGE = "https://www.notra.org/index.html"
RULES_URL = "https://www.notra.org/downloads/rulebk1.pdf"
RAW_DIR = DATA / "notra-whippets" / "raw"
SNAPSHOT_DIR = DATA / "notra-whippets" / "snapshots"
FEED = DATA / "notra-whippets.json"
REGISTRY = DATA / "notra-whippets-registry.json"
BREED = "Whippet"

# The .xls link, not the PDF one beside it, and not OBGradGuid.xlsx; its own
# label carries the date ("Whippet Grading Guide XLS. *Current as of 9/24/2026").
GUIDE_HREF_RE = re.compile(r'href="((?:[^"]*/)?GradGuid\.xls)"', re.IGNORECASE)
LABEL_RE = re.compile(
    r'href="(?:[^"]*/)?GradGuid\.xls"[^>]*>[^<]*?Current\s+as\s+of\s*(\d{1,2})/(\d{1,2})/(\d{2,4})',
    re.IGNORECASE,
)
OLE2 = bytes.fromhex("D0CF11E0A1B11AE1")

HEADERS = [
    "RTG", "GD", "NRN", "REGISTERED NAME", "OWNER", "CALL", "HCP3", "HCP4", "ORC",
    "CURR NORC", "PREV NORC", "LFTM NORC", "WAVE",
    "ON", "PL", "PTS", "I", "CD", "PL", "PTS", "I", "CD", "PL", "PTS", "I",
    "ORC/SORC", "OC/DNF", "DQ", "", "", "", "", "S",
]
MEET_SLOTS = ((13, 14, 15, 16), (17, 18, 19, 20), (21, 22, 23, 24))   # code, place, points, flag
KNOWN_NOTES = ("HIGHLIGHTED DOGS ARE RESTRICTED", "TAB TO COLUMN AA")

# Rules, February 2025: 5.3 ORC at 15 points; 4.2.2 four-program grade bands.
ORC_POINTS = 15
GRADE_BANDS = ((15.2, "A"), (11.0, "B"), (7.6, "C"))
EARLIEST_MEET_YEAR = 1992

REGISTRY_COLUMNS = [
    "id", "breed_slug", "call_name", "registered_name", "owner_raw", "rating", "wave",
    "grade", "orc", "ytd", "prior", "lftm", "hcp3", "hcp4", "rank_breed", "rank_all",
    "rank_career", "meets", "last_raced", "last_year", "active", "restricted", "title_record",
    "faults", "titled",
]


# ------------------------------------------------------------------- fetch

def find_guide(html: str) -> tuple[str | None, date | None]:
    match = GUIDE_HREF_RE.search(html)
    url = urljoin(GUIDE_PAGE, match.group(1)) if match else None
    label = LABEL_RE.search(html)
    when = None
    if label:
        month, day, year = (int(part) for part in label.groups())
        when = date(year + 2000 if year < 100 else year, month, day)
    return url, when


def header_date(data: bytes) -> date | None:
    """The date typed into the print header ("&L9/24/2026 ..."), the
    workbook's only date of its own, read from the BIFF HEADER record."""
    import xlrd.compdoc

    try:
        stream = xlrd.compdoc.CompDoc(data).get_named_stream("Workbook")
    except Exception:   # noqa: BLE001 - a fallback, never fatal
        return None
    pos = 0
    while stream and pos + 4 <= len(stream):
        kind, length = struct.unpack_from("<HH", stream, pos)
        body = stream[pos + 4: pos + 4 + length]
        pos += 4 + length
        if kind != 0x0014 or len(body) < 3:
            continue
        count, flags = struct.unpack_from("<H", body, 0)[0], body[2]
        raw = body[3:]
        text = raw[: 2 * count].decode("utf-16-le", "replace") if flags & 1 else raw[:count].decode("latin-1", "replace")
        match = re.search(r"&L\s*(\d{1,2})/(\d{1,2})/(\d{2,4})", text)
        if match:
            month, day, year = (int(part) for part in match.groups())
            return date(year + 2000 if year < 100 else year, month, day)
    return None


def fetch() -> tuple[Path, date | None, str]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    home = fetch_text(GUIDE_PAGE)
    url, label = find_guide(home)
    if not url:
        raise RacingParseError(f"No GradGuid.xls link on {GUIDE_PAGE}; the site layout changed.")
    raw = fetch_bytes(url)
    if not raw.startswith(OLE2):
        raise RacingParseError("The Whippet guide download is not an Excel workbook")
    target = RAW_DIR / "fetched.xls"
    target.write_bytes(raw)
    print(f"Fetched {url}  {len(raw):,} bytes; page label {label or 'not found'}")
    return target, label, url


# ------------------------------------------------------------------- parse

def _text(value) -> str:
    return " ".join(cell_str(value).split())


def _number(value):
    """A figure as the recorder typed it, a stray backtick ("`15") dropped."""
    if isinstance(value, str):
        value = value.strip().strip("`'")
        if not value:
            return None
    return cell_num(value)


def _us_date(text: str, year_hint: int | None = None) -> str | None:
    """The first M/D/YY (or M/D/YYYY) in a key line, or the "1013/24" slip."""
    match = re.search(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", text)
    if match:
        month, day, year = (int(part) for part in match.groups())
    else:
        slip = re.search(r"(?<!\d)(\d{1,2})(\d{2})/(\d{2})(?!\d)", text)
        if not slip:
            return None
        month, day, year = (int(part) for part in slip.groups())
    if year < 100:
        year += 2000 if year < 90 else 1900
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def parse_key(rows: list[list]) -> dict:
    """The meet key under the dogs: each code's date and club, newest first
    under numeric year headers; OTR-only meets as #n; cancelled meets have no
    code and are skipped."""
    key: dict[str, dict] = {}
    year = None
    for row in rows:
        cell = row[3] if len(row) > 3 else None
        if isinstance(cell, float) and 1990 <= cell <= 2100:
            year = int(cell)
            continue
        text = _text(cell)
        if not text or any(text.upper().startswith(note) for note in KNOWN_NOTES):
            continue
        if re.search(r"CANCEL|NO WHIPPETS|SWEPT", text, re.IGNORECASE):
            continue
        match = re.match(r"^(#\d+[A-Z]?|[A-Z]{2})\s*[-=]?\s*(.*)$", text)
        if not match:
            continue
        code, rest = match.group(1), match.group(2)
        when = _us_date(rest)
        club = re.split(r"\s*[-=]?\s*\d", rest, maxsplit=1)[0].strip(" -=") or None
        entry = {"date": when, "year": int(when[:4]) if when else year, "club": club,
                 "otr_only": code.startswith("#"), "text": text}
        key.setdefault(code, entry)
    return key


def restricted_rows(path: Path, first: int, last: int) -> set[int]:
    """Rows filled like the legend's XXXX cell: dogs restricted from entry
    under rule 6.2. Read from the cell formats; a reader without them gives
    none rather than a guess."""
    try:
        import xlrd

        book = xlrd.open_workbook(str(path), formatting_info=True)
        sheet = book.sheet_by_index(0)
        legend = None
        for index in range(last + 1, sheet.nrows):
            if _text(sheet.cell_value(index, 2)).upper() == "XXXX":
                legend = book.xf_list[sheet.cell_xf_index(index, 2)].background.pattern_colour_index
                break
        if legend is None:
            return set()
        return {index for index in range(first, last + 1)
                if book.xf_list[sheet.cell_xf_index(index, 2)].background.pattern_colour_index == legend}
    except Exception:   # noqa: BLE001 - optional detail
        return set()


TITLE_ORC_RE = re.compile(r"^\s*([A-Z]{2})\s*[-=]\s*(\d{1,2}/\d{1,2}/\d{2,4})")
TITLE_SORC_RE = re.compile(r"SORC\s*-\s*(?:([A-Z]{2})\s*-\s*)?(\d{1,2}/\d{1,2}/\d{2,4})", re.IGNORECASE)


def parse_title_record(text: str) -> dict | None:
    """Column Z: "HT-3/7/20" (where and when the ORC was earned), optionally
    ";SORC-[CODE-]M/D/YY". Kept as written beside what it says."""
    if not text:
        return None
    orc = TITLE_ORC_RE.search(text)
    sorc = TITLE_SORC_RE.search(text)
    return {
        "raw": text,
        "orc_meet": orc.group(1) if orc else None,
        "orc_date": _us_date(orc.group(2)) if orc else None,
        "sorc": bool(sorc),
        "sorc_meet": sorc.group(1) if sorc else None,
        "sorc_date": _us_date(sorc.group(2)) if sorc else None,
    }


def parse_workbook(path: Path, guide_date: date, date_source: str,
                   source_url: str | None = None) -> dict:
    rows = read_rows_xls(path)
    if not rows:
        raise RacingParseError("the workbook is empty")
    header = [_text(cell).upper() for cell in rows[0]]
    header += [""] * (len(HEADERS) - len(header))
    if header[: len(HEADERS)] != HEADERS:
        raise RacingParseError(f"Whippet guide headers {header} differ from {HEADERS}")

    dogs: list[dict] = []
    index = 1
    while index < len(rows) and isinstance(rows[index][2], float):
        row = rows[index] + [None] * (len(HEADERS) - len(rows[index]))
        nrn = int(row[2])
        meets = []
        for code_col, place_col, points_col, flag_col in MEET_SLOTS:
            code = _text(row[code_col]).upper()
            if not code:
                continue   # an empty slot (99 / 0.0 / N filler, or a stray #n in PL)
            place = _number(row[place_col])
            meets.append({
                "code": code,
                "placing": int(place) if place is not None else None,
                "score": _number(row[points_col]),
                "status": _text(row[flag_col]).upper(),
            })
        wave_cell = row[12]
        rating = _number(row[0]) if not isinstance(row[0], str) or row[0].strip() else None
        dogs.append({
            "id": str(nrn),
            "nrn": nrn,
            "rating": int(rating) if rating is not None else None,
            "grade": _text(row[1]) or None,
            "registered_raw": _text(row[3]),
            "owner_raw": _text(row[4]),
            "call_name": _text(row[5]),
            "hcp3": _number(row[6]),
            "hcp4": _number(row[7]),
            "orc": _number(row[8]),
            "ytd": _number(row[9]),
            "prior": _number(row[10]),
            "lftm": _number(row[11]),
            "wave": None if isinstance(wave_cell, str) and wave_cell.strip().lower().startswith("x") else _number(wave_cell),
            "meets": meets,
            "title_raw": _text(row[25]),
            "faults_raw": _text(row[26]),
            "dq_raw": _text(row[27]),
            "prefix": "W",
        })
        index += 1
    last_dog_row = index - 1
    if not dogs:
        raise RacingParseError("no whippets found")
    ids = Counter(dog["id"] for dog in dogs)
    if any(n > 1 for n in ids.values()):
        raise RacingParseError(f"registration numbers listed twice: {[k for k, n in ids.items() if n > 1][:5]}")

    key = parse_key(rows[index:])
    for dog_index in restricted_rows(path, 1, last_dog_row):
        dogs[dog_index - 1]["restricted"] = True
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
        "meet_key": key,
        "sections": [{"breed_raw": BREED, "prefixes": ["W"], "dogs": dogs}],
    }


# ------------------------------------------------------------------- build

def grade_band(value: float | None) -> str | None:
    if value is None:
        return None
    rounded = round(value, 2)
    for floor, letter in GRADE_BANDS:
        if rounded >= floor:
            return letter
    return "D"


def wave(meets: list[dict]) -> float:
    """Rule 4.2.2 as the recorder applies it: over the graded meets (#n
    OTR-only meets are listed but not graded), (m1 + 0.7 m2 + 0.5 m3) / 2.2
    across the completed ones (N, or F: completed with a fault in the final
    program), 1.7 for two, the score for one. With none completed, the plain
    mean of the scratches only when all three slots hold a graded meet;
    otherwise 0."""
    graded = [m for m in meets if m["graded"]]
    complete = [m["score"] for m in graded if m["complete"] and m["score"] is not None]
    weights = (1.0, 0.7, 0.5)
    if complete:
        used = complete[:3]
        return sum(s * w for s, w in zip(used, weights)) / sum(weights[: len(used)])
    if len(graded) == 3 and all(m["score"] is not None for m in graded):
        return sum(m["score"] for m in graded) / 3
    return 0.0


def titles_of(dog: dict) -> list[str]:
    titles = []
    if (dog.get("orc") or 0) >= ORC_POINTS:
        titles.append("ORC")
    if dog.get("title_record") and dog["title_record"]["sorc"]:
        titles.append("SORC")
    return titles


def derive(snapshot: dict) -> list[dict]:
    season = snapshot["season"]
    guide_date = snapshot["guide_date"]
    key = snapshot["meet_key"]
    dogs: list[dict] = []
    for section in snapshot["sections"]:
        for raw in section["dogs"]:
            dog = dict(raw)
            dog["breed"] = BREED
            dog["breed_slug"] = slug(BREED)
            # Names and owners as printed: the guide's names carry no titles,
            # and splitting capitals into "titles" would mangle them.
            dog["registered_name"] = dog.pop("registered_raw")
            dog["core_name"] = dog["registered_name"]
            dog["titles"] = []
            dog["note"] = None
            dog["owners"] = split_owners(dog["owner_raw"])
            meets = []
            for meet in raw["meets"]:
                entry = key.get(meet["code"])
                when = entry["date"] if entry else None
                if when and not (EARLIEST_MEET_YEAR <= int(when[:4]) and when <= guide_date):
                    when = None
                year = int(when[:4]) if when else (entry["year"] if entry and entry["otr_only"] else None)
                meets.append({
                    "code": meet["code"], "year": year, "date": when, "score": meet["score"],
                    "complete": meet["status"] in ("N", "F"), "status": meet["status"], "read": None,
                    "placing": meet["placing"], "graded": not meet["code"].startswith("#"),
                })
            dog["meets"] = meets
            dog["last_raced"] = last_raced(meets)
            # An OTR-only meet can carry a year and no date (#16, 2026): the
            # pages then show the year, as they do for AOK9's undated codes.
            dog["last_year"] = max((m["year"] for m in meets if m["year"]), default=None)
            computed = wave(meets)
            dog["wave_computed"] = round(computed, 6)
            dog["wave"] = round(dog["wave"], 6) if dog["wave"] is not None else None
            dog["wave_matches"] = dog["wave"] is not None and abs(dog["wave"] - computed) <= 0.01
            dog["title_record"] = parse_title_record(dog.pop("title_raw"))
            dog["titled"] = {"orc": (dog["orc"] or 0) >= ORC_POINTS,
                             "sorc": bool(dog["title_record"] and dog["title_record"]["sorc"])}
            dog["faults"] = {"oc_dnf": dog.pop("faults_raw") or None, "dq": dog.pop("dq_raw") or None}
            dog["restricted"] = bool(dog.get("restricted"))
            # An OTR-only meet is still a meet raced: it counts toward active
            # and toward racing this year, though it is never graded.
            dog["active"] = bool(
                (dog["ytd"] or 0) > 0
                or any(m["year"] is not None and m["year"] >= season - 1 for m in meets)
            )
            dogs.append(dog)
    rank_by(dogs, "ytd", "rank_breed")
    rank_by(dogs, "ytd", "rank_all")
    rank_by(dogs, "lftm", "rank_career")
    return dogs


def build(snapshots: list[dict]) -> tuple[dict, dict]:
    current = snapshots[-1]
    previous = snapshots[-2] if len(snapshots) > 1 else None
    season = current["season"]
    dogs = derive(current)
    prior_dogs = derive(previous) if previous else None
    movement = build_movement(dogs, prior_dogs, previous["guide_date"] if previous else None,
                              ["wave", "orc", "lftm", "ytd"], titles_of)
    for dog in dogs:
        dog["movement"] = movement.get(dog["id"])

    active = [dog for dog in dogs if dog["active"]]
    owners = build_owners(active, ["ytd", "lftm"], "wave")
    leader = min((dog for dog in dogs if dog["rank_breed"] == 1),
                 key=lambda dog: dog["call_name"], default=None)
    sections = [{
        "breed": BREED, "slug": slug(BREED), "prefix": "W", "prefixes": ["W"],
        "section_raw": BREED, "registry": len(dogs), "active": len(active),
        "ytd": sum((dog["ytd"] or 0) > 0 for dog in dogs),
        "titled": sum(dog["titled"]["orc"] for dog in dogs),
        "leader": {"id": leader["id"], "call_name": leader["call_name"], "ytd": leader["ytd"]} if leader else None,
    }]
    meets_this_year = {m["code"] for dog in dogs for m in dog["meets"] if m["year"] == season}
    titles_since = [
        {"id": dog["id"], "call_name": dog["call_name"], "breed": BREED, "title": title,
         "since": dog["movement"]["since"]}
        for dog in active if dog["movement"] for title in dog["movement"]["new_titles"]
    ]
    titles_since.sort(key=lambda row: (row["call_name"], row["title"]))
    rated = [dog for dog in dogs if dog["wave"] is not None]
    stats = {
        "hounds_registry": len(dogs),
        "hounds_duplicate_numbers": 0,
        "hounds_unnumbered": 0,
        "hounds_dropped": 0,
        "hounds_active": len(active),
        "hounds_ytd": sum((dog["ytd"] or 0) > 0 for dog in dogs),
        "hounds_raced": sum(any(m["year"] == season for m in dog["meets"]) for dog in dogs),
        "breeds_raced": 1 if any(any(m["year"] == season for m in dog["meets"]) for dog in dogs) else 0,
        "hounds_rated": len(rated),
        "hounds_restricted": sum(dog["restricted"] for dog in dogs),
        "titled_orc": sum(dog["titled"]["orc"] for dog in dogs),
        "titled_sorc": sum(dog["titled"]["sorc"] for dog in dogs),
        "breeds": 1,
        "breeds_active": 1,
        "breeds_ytd": 1 if any((dog["ytd"] or 0) > 0 for dog in dogs) else 0,
        "meets_this_year": len(meets_this_year),
        "meets_listed": sum(len(dog["meets"]) for dog in dogs),
        "meets_undecoded": sum(m["year"] is None for dog in dogs for m in dog["meets"]),
        "owners_active": len(owners),
        "wave_agreement": round(sum(dog["wave_matches"] for dog in rated) / max(1, len(rated)), 4),
    }
    feed_fields = [
        "id", "breed", "breed_slug", "call_name", "registered_name", "titles", "note",
        "owner_raw", "owners", "rating", "wave", "wave_matches", "grade", "orc", "ytd",
        "prior", "lftm", "hcp3", "hcp4", "titled", "title_record", "faults", "restricted",
        "rank_breed", "rank_all", "rank_career", "meets", "last_raced", "last_year", "movement",
    ]

    def pack_meets(dog: dict) -> list[list]:
        return [[m["code"], m["year"], m["date"], m["score"], m["complete"], m["status"], m["read"],
                 m["placing"], m["graded"]] for m in dog["meets"]]

    def compact(dog: dict) -> dict:
        row = {field: dog.get(field) for field in feed_fields}
        if not dog["wave_matches"] and dog["wave"] is not None:
            row["wave_computed"] = dog["wave_computed"]
        row["meets"] = pack_meets(dog)
        return row

    feed = {
        "org": ORG,
        "name": "NOTRA Whippets",
        "program": "whippet oval racing",
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
        "dogs": [compact(dog) for dog in active],
        "owners": owners,
        "titles_since_previous": titles_since,
        "meet_columns": ["code", "year", "date", "score", "complete", "status", "read", "placing", "graded"],
        "notes": [
            "Standings rank this season's National points (Curr NORC); career "
            "standings rank lifetime National points (Lftm NORC).",
            "Meet codes are dated from the guide's own meet key; #n meets are "
            "OTR-only (fewer than 15 starters), listed but not graded.",
            "WAVE is recomputed per rule 4.2.2 as the recorder applies it (graded "
            "meets only; N and F complete; scratches averaged only when all three "
            "slots hold graded meets); wave_matches flags the recorder's figure "
            "where it differs, and the published figure is the one shown.",
            "ORC at 15 ORC points (5.3). The SORC (5.4: 50 National points for a "
            "dog, 30 for a bitch) comes from the recorder's title record, since "
            "the guide prints no sex; levels beyond SORC are not recorded.",
        ],
    }
    dogs.sort(key=lambda dog: (dog["call_name"], dog["id"]))
    registry_rows = []
    for dog in dogs:
        row = dict(dog)
        row["meets"] = pack_meets(dog)
        registry_rows.append(row)
    registry = {"org": ORG, "guide_date": current["guide_date"], "season": season,
                **compact_registry(registry_rows, REGISTRY_COLUMNS)}
    return feed, registry


# -------------------------------------------------------------------- main

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--force", action="store_true", help="archive even if unchanged")
    parser.add_argument("--file", type=Path, help="parse this workbook instead of fetching")
    parser.add_argument("--date", type=date.fromisoformat, help="the guide's date")
    parser.add_argument("--offline", action="store_true",
                        help="rebuild the feed from archived snapshots without fetching")
    parser.add_argument("--seen", type=lambda text: date.fromisoformat(text).isoformat(),
                        help="the day a changed guide under an unmoved label was first seen")
    args = parser.parse_args()

    if not args.offline:
        try:
            if args.file:
                path, source_url = args.file, None
                label = None
            else:
                path, label, source_url = fetch()
            data = path.read_bytes()
            typed = header_date(data)
            if args.date:
                guide_date, source = args.date, "cli"
            elif label:
                guide_date, source = label, "page"
            elif typed:
                guide_date, source = typed, "workbook"
            else:
                raise RacingParseError("no 'Current as of' label and no header date; pass --date")
            if typed and label and typed != label:
                print(f"Note: the page label says {label} but the workbook's header reads {typed}.")
            snapshot = parse_workbook(path, guide_date, source, source_url)
            if source != "cli":
                snapshot = redate_if_label_stale(SNAPSHOT_DIR, snapshot, args.seen or today())
            if not args.file:
                file_raw(path, snapshot)
            write_snapshot_if_changed(SNAPSHOT_DIR, snapshot, force=args.force)
        except requests.RequestException as error:
            if not list(SNAPSHOT_DIR.glob("*.json")):
                print(f"Could not fetch the NOTRA Whippet guide and no snapshot exists: {error}",
                      file=sys.stderr)
                return 1
            print(f"Could not fetch the NOTRA Whippet guide; rebuilding from archived snapshots. "
                  f"{error}", file=sys.stderr)

    snapshots = load_snapshots(SNAPSHOT_DIR)
    feed, registry = build(snapshots)
    feed_bytes = write_json(FEED, feed)
    registry_bytes = write_json(REGISTRY, registry)
    stats = feed["stats"]
    print(
        f"NOTRA Whippet guide {feed['guide_date']}: {stats['hounds_registry']:,} whippets, "
        f"{stats['hounds_active']} active, {stats['hounds_raced']} raced this year, "
        f"{stats['hounds_ytd']} with National points this year, {stats['meets_this_year']} meets "
        f"this year, {stats['titled_orc']} ORC, {stats['titled_sorc']} SORC, "
        f"{stats['hounds_rated']} rated, {stats['hounds_restricted']} restricted, "
        f"WAVE agreement {stats['wave_agreement']:.1%}, {stats['meets_undecoded']} undated meets"
    )
    print(f"Wrote {FEED.name} ({feed_bytes:,} bytes) and {REGISTRY.name} ({registry_bytes:,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
