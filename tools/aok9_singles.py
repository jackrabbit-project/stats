"""Fetch AOK9's Singles sprint records and build the Singles feed.

Singles is AOK9's stake for dogs that cannot run in company (Singles Racing
Rule Book 1.0). Each dog runs alone and is timed, and at every meet the dogs
of a division are placed against one another, by average time or by times
scored program by program; the top placings earn championship points on the
sprint table. Singles runs at the same sanctioned meets as the regular sprint
stakes, under the same meet numbers and the same registration numbers.

R.A.C.E. keeps the records as a public Google Sheet linked from
https://aok9racing.com/documents--forms.html as "Singles Sprint Racing
Records", with an "updated M/D/YY" note beside the link. The workbook's sprint
tab has one row per dog: the average of its last three timed runs (the figure
race secretaries draw heats from), its personal best, Singles breed and mixed
championship points and the National points behind the Supreme Singles titles,
Turtle points, this year's points, and those three runs, each with its meet.
The runs are programs, so all three often come from a single meet. The oval
Singles tab is not read.

This builder runs after tools/aok9.py: it matches each Singles dog to its row
in the sprint registry, so a dog that races both keeps one page.

Usage:
    python tools/aok9_singles.py                    # fetch, archive if changed, rebuild
    python tools/aok9_singles.py --force            # archive even if unchanged
    python tools/aok9_singles.py --file PATH --date YYYY-MM-DD
    python tools/aok9_singles.py --offline          # rebuild from the snapshots alone
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path

import requests

from aok9 import EXPORT_USER_AGENT, LINK_PAGE, SITE_URL, UPDATED_RE, find_header_row
from racing import (
    DATA, RacingParseError, breed_display, cell_num, cell_str, decode_aok9_meet,
    decode_or_keep, derive_identity, fetch_bytes, last_raced, fetch_text, load_snapshots,
    parse_id, section_header, sha256, slug, super_level, today, write_json,
    write_snapshot_if_changed,
)

ORG = "aok9-singles"
SHEET_ID = "155bMTO-jx1Az8RrYc05mS-rYTB7CPLOnFoTJzMf-Imw"
SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?usp=sharing"
EXPORT_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=xlsx"
RULES_URL = (
    "https://aok9racing.com/uploads/1/1/1/1/11113828/"
    "aok9_singles_racing_rule_book_v_1.0.docx.pdf"
)
RAW_DIR = DATA / "aok9-singles" / "raw"
SNAPSHOT_DIR = DATA / "aok9-singles" / "snapshots"
FEED = DATA / "aok9-singles.json"
SPRINT_FEED = DATA / "aok9.json"
SPRINT_REGISTRY = DATA / "aok9-registry.json"

# The workbook's tabs are titled "SinglesRecords- Sprint.xls" and
# "SinglesRecords-Oval"; the sprint one is found by name, not position.
TAB_WORD = "sprint"

HEADERS = {
    0: "REG#", 1: "NAME", 2: "AVG", 3: "REGISTERED NAME", 4: "OWNER",
    5: "SBC", 6: "NSBC", 7: "SMC", 8: "NSMC", 9: "PB", 10: "Turtle", 11: "YTD",
    12: "Fastest", 14: "Time", 15: "Fastest", 17: "Time", 18: "Fastest", 20: "Time",
}
# (meet, unused flag column, time) for each of the last three runs, newest
# first. A meet has up to three programs, so one meet can fill all three.
MEET_COLUMNS = ((12, 13, 14), (15, 16, 17), (18, 19, 20))
WIDTH = 21

CHAMPIONSHIP_POINTS = 12
MIXED_MINIMUM = 2
NATIONAL_STEP = 30


# ------------------------------------------------------------------- rules

def sbc_earned(dog: dict) -> bool:
    """Singles Racing Rule Book 1.0 §5.2: 12 Singles breed points."""
    return (dog.get("sbc") or 0) >= CHAMPIONSHIP_POINTS


def smc_earned(dog: dict) -> bool:
    """§5.3: 12 championship points, at least 2 of them mixed; the rest may be
    breed or mixed. The same combined rule as the sprint MRC."""
    mixed = dog.get("smc") or 0
    return (dog.get("sbc") or 0) + mixed >= CHAMPIONSHIP_POINTS and mixed >= MIXED_MINIMUM


def turtle_earned(dog: dict) -> bool:
    """§5.5: Turtle titles follow the regular stakes, where 12 Turtle points
    make the title the guide records as TRC and every 30 a Supreme Turtle."""
    return (dog.get("turtle") or 0) >= CHAMPIONSHIP_POINTS


def titled(dog: dict) -> dict:
    """§5.4 gives no abbreviation for the Supreme Singles titles or the
    Singles Turtle ones, so they are keyed here by what earns them."""
    return {
        "sbc": sbc_earned(dog),
        "smc": smc_earned(dog),
        "supreme_breed": super_level(dog.get("nsbc"), NATIONAL_STEP),
        "supreme_mixed": super_level(dog.get("nsmc"), NATIONAL_STEP),
        "turtle": turtle_earned(dog),
        "supreme_turtle": super_level(dog.get("turtle"), NATIONAL_STEP),
    }


def mean_time(times: list[float | None]) -> float | None:
    """The published average: the plain mean of the listed times. A time of
    zero is how the sheet writes a run that produced none."""
    usable = [t for t in times if t is not None and t > 0]
    return sum(usable) / len(usable) if usable else None


# ------------------------------------------------------------------- fetch

def find_guide_date(html: str) -> date:
    """The "(updated 9/9/26)" beside the Singles records link."""
    position = html.find(SHEET_ID)
    if position < 0:
        raise RacingParseError(f"The Singles records link is no longer on {LINK_PAGE}")
    window = re.sub(r"<[^>]+>", " ", html[position:position + 600])
    match = UPDATED_RE.search(window)
    if not match:
        raise RacingParseError(
            "No 'updated M/D/YY' beside the Singles records link; pass --date"
        )
    month, day, year = (int(part) for part in match.groups())
    if year < 100:
        year += 2000
    return date(year, month, day)


def fetch() -> tuple[Path, date]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    guide_date = find_guide_date(fetch_text(LINK_PAGE))
    raw = fetch_bytes(EXPORT_URL, user_agent=EXPORT_USER_AGENT)
    if not raw.startswith(b"PK"):
        raise RacingParseError(
            "The export did not return a workbook (no zip signature); Google "
            "may have answered with a sign-in page."
        )
    target = RAW_DIR / f"{guide_date.isoformat()}.xlsx"
    target.write_bytes(raw)
    print(f"Fetched the Singles records updated {guide_date}  {len(raw):,} bytes")
    return target, guide_date


# ------------------------------------------------------------------- parse

def read_tab(path: Path) -> list[list]:
    """Every cell of the sprint Singles tab, formulas as their values."""
    import openpyxl

    book = openpyxl.load_workbook(str(path), read_only=True, data_only=True)
    tabs = [sheet for sheet in book.worksheets if TAB_WORD in sheet.title.lower()]
    if len(tabs) != 1:
        titles = [sheet.title for sheet in book.worksheets]
        book.close()
        raise RacingParseError(f"expected one sprint Singles tab, found tabs {titles}")
    rows = [list(row) for row in tabs[0].iter_rows(values_only=True)]
    book.close()
    return rows


def read_meets(row: list, dog_id: str) -> list[dict]:
    meets = []
    for code_col, _flag_col, time_col in MEET_COLUMNS:
        code = cell_str(row[code_col])
        time = cell_num(row[time_col])
        if not code and time is None:
            continue
        if not code:
            raise RacingParseError(f"{dog_id}: a time without a meet")
        meets.append({"code": code, "time": time})
    return meets


def parse_workbook(path: Path, guide_date: date, date_source: str) -> dict:
    rows = read_tab(path)
    header_index = find_header_row(rows)
    header = rows[header_index]
    for column, expected in HEADERS.items():
        found = cell_str(header[column]) if column < len(header) else ""
        if found != expected:
            raise RacingParseError(f"column {column} reads {found!r}, expected {expected!r}")

    sections: list[dict] = []
    current: dict | None = None
    stray: list[list] = []
    seen: dict[str, int] = {}
    prefix_sections: dict[str, set[str]] = {}
    for row in rows[header_index + 1:]:
        if len(row) < WIDTH:
            row = list(row) + [None] * (WIDTH - len(row))
        header_info = section_header(row, empty_cols=(2, 3, 4))
        if header_info:
            current = {"breed_raw": header_info["breed_raw"],
                       "note": header_info["note"], "dogs": []}
            sections.append(current)
            continue
        parsed = parse_id(row[0])
        if parsed is None:
            if any(cell_str(cell) for cell in row[:5]):
                stray.append([cell_str(cell) for cell in row[:5]])
            continue
        if current is None:
            raise RacingParseError(f"dog {parsed[2]} appears before any breed header")
        dog_id, prefix, raw_id = parsed
        # As in the sprint guide: a number listed twice keeps both rows, the
        # second with a -2 suffix, so nothing is silently merged.
        seen[dog_id] = seen.get(dog_id, 0) + 1
        if seen[dog_id] > 1:
            dog_id = f"{dog_id}-{seen[dog_id]}"
        prefix_sections.setdefault(prefix, set()).add(current["breed_raw"])
        dog = {
            "id": dog_id,
            "prefix": prefix,
            "call_name": cell_str(row[1]),
            "average": cell_num(row[2]),
            "registered_raw": cell_str(row[3]),
            "owner_raw": cell_str(row[4]),
            "sbc": cell_num(row[5]),
            "nsbc": cell_num(row[6]),
            "smc": cell_num(row[7]),
            "nsmc": cell_num(row[8]),
            "pb": cell_num(row[9]),
            "turtle": cell_num(row[10]),
            "ytd": cell_num(row[11]),
            "meets": read_meets(row, dog_id),
        }
        # "DNF" where a time belongs: kept as text beside the empty number.
        for field, column in (("average", 2), ("pb", 9)):
            text = cell_str(row[column])
            if text and dog[field] is None:
                dog[f"{field}_text"] = text
        if raw_id != parsed[0]:
            dog["id_raw"] = raw_id
        if seen[parsed[0]] > 1:
            dog["duplicate_of"] = parsed[0]
        current["dogs"].append(dog)

    if stray:
        raise RacingParseError(f"{len(stray)} rows are neither dogs nor headers, e.g. {stray[:3]}")
    shared = {p: s for p, s in prefix_sections.items() if len(s) > 1}
    if shared:
        raise RacingParseError(f"registration prefixes filed under more than one breed: {shared}")
    if not sections:
        raise RacingParseError("no breed sections found")

    return {
        "org": ORG,
        "guide_date": guide_date.isoformat(),
        "guide_date_source": date_source,
        "season": guide_date.year,
        "source_url": SHEET_URL,
        "source_page": LINK_PAGE,
        "source_file": path.name,
        "sha256": sha256(path.read_bytes()),
        "fetched": today(),
        "columns": [cell_str(cell) for cell in header[:WIDTH]],
        "sections": [s for s in sections if s["dogs"]],
    }


# ------------------------------------------------------------------- build

def _norm(text: str | None) -> str:
    return re.sub(r"[^a-z0-9]", "", (text or "").lower())


def calls_agree(singles: dict, sprint: dict) -> bool:
    """Call names drift by a suffix between the sheets ("Switch", "Switch-E")."""
    a, b = _norm(singles["call_name"]), _norm(sprint["call_name"])
    return bool(a and b and (a.startswith(b) or b.startswith(a)))


def same_dog(singles: dict, sprint: dict) -> bool:
    """One dog on both sheets: the number already matched, so the names only
    have to agree. Registered names drift by a title, so either the call name
    or the start of the registered name agreeing is enough."""
    if calls_agree(singles, sprint):
        return True
    ra, rb = _norm(singles["registered_name"])[:15], _norm(sprint["registered_name"])[:15]
    return bool(ra) and ra == rb


def identity(dog: dict) -> tuple[str, str, str]:
    """What identifies a dog when its number does not: breed, the whole
    registered name and the owner."""
    return (dog["breed_slug"], _norm(dog["registered_name"]), _norm(dog["owner_raw"]))


def sprint_racing(row: dict | None) -> bool:
    """Whether the sprint guide holds any racing for this dog at all."""
    if row is None:
        return False
    if row["meets_breed"] or row["meets_mixed"]:
        return True
    return any((row[field] or 0) > 0 for field in ("brc", "nbrc", "mrc", "nmrc", "trc", "ytd"))


def meet_order(meet: dict) -> tuple:
    """Newest first: the year, then the sanctioned-meet number or the date."""
    return (meet["year"] or 0, meet["seq"] or 0, meet["date"] or "")


def derive(snapshot: dict, sprint_rows: list[dict], sprint_sections: list[dict]) -> list[dict]:
    season = snapshot["season"]

    # A registration prefix names its breed; the sprint registry spells the
    # breeds the way the rest of the AOK9 pages do ("Lurcher / Longdog" where
    # the Singles sheet writes LURCHER), so its names win when it has the prefix.
    breed_of_slug = {section["slug"]: section["breed"] for section in sprint_sections}
    votes: dict[str, Counter] = {}
    for row in sprint_rows:
        prefix = row["id"].split("-", 1)[0]
        votes.setdefault(prefix, Counter())[row["breed_slug"]] += 1
    prefix_slug = {prefix: counter.most_common(1)[0][0] for prefix, counter in votes.items()}

    dogs: list[dict] = []
    for section in snapshot["sections"]:
        for raw in section["dogs"]:
            dog = dict(raw)
            dog["section_raw"] = section["breed_raw"]
            known = prefix_slug.get(dog["prefix"])
            if known:
                dog["breed_slug"] = known
                dog["breed"] = breed_of_slug.get(known, breed_display(section["breed_raw"]))
            else:
                dog["breed"] = breed_display(section["breed_raw"])
                dog["breed_slug"] = slug(dog["breed"])
            derive_identity(dog)

            meets = []
            for meet in dog["meets"]:
                info = decode_or_keep(decode_aok9_meet, meet["code"])
                time = meet["time"] if meet["time"] is not None and meet["time"] > 0 else None
                meets.append({"code": info["code"], "year": info["year"], "seq": info["seq"],
                              "date": info["date"], "time": time})
            dog["meets"] = meets
            dog["last_year"] = max((m["year"] for m in meets if m["year"]), default=None)
            dog["last_raced"] = last_raced(meets)
            dog["recent"] = max((meet_order(m) for m in meets), default=None)

            computed = mean_time([m["time"] for m in meets])
            published = dog["average"]
            if published is not None and published <= 0:
                # A zero average is the sheet's way of saying no time at all.
                published = None
            dog["average"] = round(published, 3) if published is not None else None
            dog["average_computed"] = round(computed, 3) if computed is not None else None
            dog["average_matches"] = (published is not None and computed is not None
                                      and abs(published - computed) <= 0.01)
            if dog["pb"] is not None:
                dog["pb"] = round(dog["pb"], 3)
            dog["titled"] = titled(dog)
            dog["active"] = bool((dog["ytd"] or 0) > 0
                                 or (dog["last_year"] is not None and dog["last_year"] >= season - 1))
            dog["raced"] = any(m["year"] == season for m in meets)
            dog["reg"] = dog.get("duplicate_of") or dog["id"]
            dogs.append(dog)

    join_sprint(dogs, sprint_rows)
    return dogs


def join_sprint(dogs: list[dict], sprint_rows: list[dict]) -> None:
    """One dog, one page: a Singles dog already in the sprint guide takes
    that page's id.

    First by number, confirmed by the names. Then, for a dog whose number
    finds nobody, by breed, whole registered name and owner together with the
    call name: the two sheets mistype a number now and then (BSD-20 on one,
    BSD-2 on the other). A dog matched neither way keeps its own number, or
    that number with -S when the sprint guide gives it to a different dog.
    """
    by_base: dict[str, list[dict]] = {}
    for row in sprint_rows:
        base = re.sub(r"-\d+$", "", row["id"]) if row.get("duplicate_of") else row["id"]
        by_base.setdefault(base, []).append(row)
    by_identity: dict[tuple, list[dict]] = {}
    for row in sprint_rows:
        by_identity.setdefault(identity(row), []).append(row)
    sprint_ids = {row["id"] for row in sprint_rows}
    claimed: set[str] = set()
    twins: dict[int, tuple[dict, str]] = {}

    for index, dog in enumerate(dogs):
        matches = [row for row in by_base.get(dog["reg"], [])
                   if same_dog(dog, row) and row["id"] not in claimed]
        if matches:
            exact = [row for row in matches
                     if _norm(row["registered_name"]) == _norm(dog["registered_name"])]
            twin = (exact or matches)[0]
            twins[index] = (twin, "number")
            claimed.add(twin["id"])
    for index, dog in enumerate(dogs):
        if index in twins or not _norm(dog["registered_name"]):
            continue
        matches = [row for row in by_identity.get(identity(dog), [])
                   if calls_agree(dog, row) and row["id"] not in claimed]
        if len(matches) == 1:
            twins[index] = (matches[0], "name")
            claimed.add(matches[0]["id"])

    used: set[str] = set()
    for index, dog in enumerate(dogs):
        if index in twins:
            twin, how = twins[index]
            dog["id"] = twin["id"]
            dog["sprint"] = True
            dog["joined_by"] = how
            dog["sprint_racing"] = sprint_racing(twin)
        else:
            page_id = dog["reg"]
            suffix = 0
            while page_id in sprint_ids or page_id in used:
                suffix += 1
                page_id = f"{dog['reg']}-S" if suffix == 1 else f"{dog['reg']}-S{suffix}"
            dog["id"] = page_id
            dog["sprint"] = False
            dog["sprint_racing"] = False
        if dog["id"] in used:
            raise RacingParseError(
                f"two Singles rows claim the page {dog['id']}; the sheet lists one dog "
                f"twice or a name match is too loose"
            )
        used.add(dog["id"])


def build(snapshots: list[dict], sprint_feed: dict, sprint_registry: dict) -> dict:
    current = snapshots[-1]
    previous = snapshots[-2] if len(snapshots) > 1 else None
    season = current["season"]

    columns = sprint_registry["columns"]
    sprint_rows = [dict(zip(columns, row)) for row in sprint_registry["rows"]]
    dogs = derive(current, sprint_rows, sprint_feed["sections"])

    sections: dict[str, dict] = {}
    for dog in dogs:
        entry = sections.setdefault(dog["breed_slug"], {
            "breed": dog["breed"], "slug": dog["breed_slug"],
            "listed": 0, "active": 0, "raced": 0, "ytd": 0,
        })
        entry["listed"] += 1
        entry["active"] += dog["active"]
        entry["raced"] += dog["raced"]
        entry["ytd"] += (dog["ytd"] or 0) > 0
    sections_list = sorted(sections.values(), key=lambda s: s["breed"])

    # Singles runs at the sprint meets, so its dogs and meets join the AOK9
    # figures rather than standing apart: a dog racing only Singles is still
    # a dog racing this year, and a meet only Singles results survive from
    # is still a meet.
    sprint_raced = {
        row["id"]: row["breed_slug"] for row in sprint_rows
        if any(m[1] == season for m in row["meets_breed"] + row["meets_mixed"])
    }
    singles_raced = {dog["id"]: dog["breed_slug"] for dog in dogs if dog["raced"]}
    racing = {**sprint_raced, **singles_raced}
    sprint_meets = {
        m[0] for row in sprint_rows for m in row["meets_breed"] + row["meets_mixed"] if m[1] == season
    }
    singles_meets = {m["code"] for dog in dogs for m in dog["meets"] if m["year"] == season}
    combined = {
        "dogs_raced": len(racing),
        "breeds_raced": len(set(racing.values())),
        "meets_this_year": len(sprint_meets | singles_meets),
        "sprint_guide_date": sprint_feed["guide_date"],
    }

    rated = [dog for dog in dogs if dog["average"] is not None]
    stats = {
        "dogs_listed": len(dogs),
        "dogs_duplicate_numbers": sum("duplicate_of" in dog for dog in dogs),
        "dogs_active": sum(dog["active"] for dog in dogs),
        "dogs_raced": sum(dog["raced"] for dog in dogs),
        "breeds_raced": len({dog["breed_slug"] for dog in dogs if dog["raced"]}),
        "dogs_ytd": sum((dog["ytd"] or 0) > 0 for dog in dogs),
        "singles_only_active": sum(dog["active"] and not dog["sprint_racing"] for dog in dogs),
        "titled_sbc": sum(dog["titled"]["sbc"] for dog in dogs),
        "titled_smc": sum(dog["titled"]["smc"] for dog in dogs),
        "titled_supreme": sum(bool(dog["titled"]["supreme_breed"] or dog["titled"]["supreme_mixed"])
                              for dog in dogs),
        "titled_turtle": sum(dog["titled"]["turtle"] for dog in dogs),
        "titled_any": sum(any(dog["titled"].values()) for dog in dogs),
        "meets_listed": sum(len(dog["meets"]) for dog in dogs),
        "meets_undecoded": sum(m["year"] is None for dog in dogs for m in dog["meets"]),
        "average_agreement": round(sum(dog["average_matches"] for dog in rated) / max(1, len(rated)), 4),
    }

    fields = [
        "id", "reg", "sprint", "sprint_racing", "breed", "breed_slug", "call_name",
        "registered_name", "titles", "note", "owner_raw", "owners", "average",
        "average_matches", "pb", "sbc", "nsbc", "smc", "nsmc", "turtle", "ytd",
        "titled", "last_year", "last_raced", "active", "raced",
    ]

    def compact(dog: dict) -> dict:
        row = {field: dog.get(field) for field in fields}
        for extra in ("average_text", "pb_text", "duplicate_of", "joined_by"):
            if dog.get(extra):
                row[extra] = dog[extra]
        if not dog["average_matches"] and dog["average_computed"] is not None:
            row["average_computed"] = dog["average_computed"]
        row["meets"] = [[m["code"], m["year"], m["date"], m["time"]] for m in dog["meets"]]
        return row

    dogs.sort(key=lambda dog: (dog["breed"], dog["call_name"], dog["id"]))
    return {
        "org": "aok9",
        "program": "singles",
        "name": "AOK9 Singles",
        "season": season,
        "guide_date": current["guide_date"],
        "guide_date_source": current["guide_date_source"],
        "previous_guide_date": previous["guide_date"] if previous else None,
        "generated": today(),
        "source_url": SHEET_URL,
        "source_page": LINK_PAGE,
        "site_url": SITE_URL,
        "rules_url": RULES_URL,
        "snapshots": [snap["guide_date"] for snap in snapshots],
        "active_since": f"{season - 1}-01-01",
        "stats": stats,
        "combined": combined,
        "sections": sections_list,
        "meet_columns": ["code", "year", "date", "time"],
        "dogs": [compact(dog) for dog in dogs],
        "notes": [
            "Singles dogs run alone and are timed; at each meet they are placed "
            "against the other dogs in their division, and only the top placings "
            "earn championship points (Singles Racing Rule Book 1.0 ch. IV-V).",
            "The average is the plain mean of the dog's last three timed runs, "
            "the figure race secretaries draw heats from; the runs are programs, "
            "so all three often come from one meet. Singles places dogs only "
            "within a meet, so the site ranks no one by time.",
            "SBC is 12 Singles breed points; SMC is 12 points of which at least 2 "
            "are mixed. Supreme Singles titles come at every 30 National points, "
            "Singles Turtle titles as in the regular stakes; the rule book gives "
            "those no abbreviation.",
        ],
    }


# -------------------------------------------------------------------- main

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--force", action="store_true",
                        help="archive even if the records are unchanged")
    parser.add_argument("--file", type=Path,
                        help="parse this workbook instead of fetching (needs --date)")
    parser.add_argument("--date", type=date.fromisoformat,
                        help="the records' date, when it cannot be read from the link page")
    parser.add_argument("--offline", action="store_true",
                        help="rebuild the feed from archived snapshots without fetching")
    args = parser.parse_args()

    if not (SPRINT_FEED.exists() and SPRINT_REGISTRY.exists()):
        print("The AOK9 sprint feed is missing; run tools/aok9.py first.", file=sys.stderr)
        return 1

    status = 0
    if not args.offline:
        try:
            if args.file:
                if not args.date:
                    parser.error("--file needs --date, the sheet has no date cell of its own")
                path, guide_date, source = args.file, args.date, "cli"
            else:
                path, guide_date = fetch()
                source = "page"
                if args.date:
                    guide_date, source = args.date, "cli"
            snapshot = parse_workbook(path, guide_date, source)
            write_snapshot_if_changed(SNAPSHOT_DIR, snapshot, force=args.force)
        except (requests.RequestException, RacingParseError) as error:
            if not list(SNAPSHOT_DIR.glob("*.json")):
                print(f"Could not read the Singles records and no snapshot exists: {error}",
                      file=sys.stderr)
                return 1
            # Still rebuilt, so the Singles figures follow whatever sprint guide
            # tools/aok9.py just wrote. A changed layout is reported as a
            # failure; a network hiccup is not.
            if isinstance(error, RacingParseError):
                status = 1
            print(f"Could not read the Singles records; rebuilding from archived "
                  f"snapshots. {error}", file=sys.stderr)

    snapshots = load_snapshots(SNAPSHOT_DIR)
    sprint_feed = json.loads(SPRINT_FEED.read_text(encoding="utf-8"))
    sprint_registry = json.loads(SPRINT_REGISTRY.read_text(encoding="utf-8"))
    feed = build(snapshots, sprint_feed, sprint_registry)
    size = write_json(FEED, feed)

    stats, combined = feed["stats"], feed["combined"]
    print(
        f"AOK9 Singles records {feed['guide_date']}: {stats['dogs_listed']} dogs, "
        f"{stats['dogs_active']} active, {stats['dogs_raced']} raced this year "
        f"({stats['singles_only_active']} active dogs race only Singles), "
        f"{stats['dogs_ytd']} with points this year, {stats['titled_any']} titled, "
        f"average agreement {stats['average_agreement']:.1%}"
    )
    print(f"With the sprint guide: {combined['dogs_raced']} dogs and "
          f"{combined['meets_this_year']} meets this year")
    print(f"Wrote {FEED.name} ({size:,} bytes)")
    joined = sum(dog["sprint"] for dog in feed["dogs"])
    renumbered = [f"{dog['reg']} is {dog['id']}" for dog in feed["dogs"] if dog.get("joined_by") == "name"]
    own = [dog["id"] for dog in feed["dogs"] if re.search(r"-S\d*$", dog["id"])]
    print(f"Matched to the sprint registry: {joined}, of them by name where the numbers "
          f"differ: {renumbered}; own pages for numbers the sprint guide gives another "
          f"dog: {own}")
    return status


if __name__ == "__main__":
    sys.exit(main())
