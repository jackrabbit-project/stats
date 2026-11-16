"""Build data/nlcc.json, the National Lure Coursing Club's records.

NLCC Records is the club's own spreadsheet. Its Meets List names each meeting
(a number such as 2024-03, the date, the club, the event, the format and the
judges) and its Dog Stats lists each hound by breed and call name: the date
of its first meeting, the meetings it has run, the latest of them, and the
courses it has run, won, lost and drawn, with its win percentage, wins over
courses run. The page shows the sheet as kept; the one figure added here is a
ranking by win percentage among hounds with at least MIN_COURSES courses,
which NLCC's records do not make.

The sheet is not public: it is exported through an account the club shared it
with and passed with --file. Each export is parsed into a snapshot under
data/nlcc/snapshots/<as-of>.json (the workbook itself stays out of git) and
the feed is rebuilt from the newest snapshot. Run without --file, the script
tries the sheet's own export link, which answers once the sheet is shared to
anyone with the link, and otherwise rebuilds from the snapshots on file.

Usage:
    python tools/nlcc.py --file PATH --date YYYY-MM-DD   # an export, as of the sheet's last edit
    python tools/nlcc.py                                 # the export link, else the snapshots
    python tools/nlcc.py --offline                       # rebuild from the newest snapshot
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path

import openpyxl
import requests

from racing import DATA, RacingParseError, cell_str, fetch_bytes, sha256, slug, today, write_json

ORG = "nlcc"
SHEET_ID = "1MuaGo9ndRhnZNPnUroXZ6RA74d8KrGo0f2wR5yXjhd4"
EXPORT_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=xlsx"
# Google answers a library's user agent with a sign-in page (see aok9.py).
EXPORT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
RAW_DIR = DATA / "nlcc" / "raw"
SNAPSHOT_DIR = DATA / "nlcc" / "snapshots"
FEED = DATA / "nlcc.json"

MEETS_SHEET = "Meets List"
DOGS_SHEET = "Dog Stats"
MEETS_HEADERS = ["Meeting Number", "Date of Meeting", "Club Name", "Event Name",
                 "Meeting Format", "Judge(s)"]
DOGS_HEADERS = ["Breed", "Dog Name", "Date of First Meeting", "Total Meets Ran",
                "Most Recent Meeting", "Courses Ran", "Win", "Loss", "Draw", "Win Percentage"]
# The fewest courses a hound needs to be ranked by win percentage: below
# it, one lucky course would top the table.
MIN_COURSES = 5


# ------------------------------------------------------------------- parse

def _rows(book, title: str, headers: list[str]) -> list[list]:
    if title not in book.sheetnames:
        raise RacingParseError(f"no {title!r} sheet; the workbook has {book.sheetnames}")
    rows = [list(row) for row in book[title].iter_rows(max_col=len(headers), values_only=True)]
    found = [cell_str(cell) for cell in rows[0]] if rows else []
    if found != headers:
        raise RacingParseError(f"{title}: headers {found} differ from {headers}")
    return [row for row in rows[1:] if any(cell_str(cell) for cell in row)]


def _date(value, where: str) -> str | None:
    if value is None or cell_str(value) == "":
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    raise RacingParseError(f"{where}: {value!r} is not a date")


def _count(value, where: str) -> int | None:
    if value is None or cell_str(value) == "":
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool) and float(value).is_integer():
        return int(value)
    raise RacingParseError(f"{where}: {value!r} is not a whole number")


def meeting_code(value, where: str) -> str:
    """A meeting number as the sheet writes it, 2024-03. The Meets List's
    cells turned into dates on the way in (2024-03 reads as March 1, 2024),
    so a date cell is written back as its year and month."""
    if isinstance(value, datetime):
        return f"{value.year}-{value.month:02d}"
    text = cell_str(value)
    if len(text) == 7 and text[4] == "-" and text[:4].isdigit() and text[5:].isdigit():
        return text
    raise RacingParseError(f"{where}: {value!r} is not a meeting number")


def parse_workbook(path: Path, as_of: date) -> dict:
    book = openpyxl.load_workbook(path, data_only=True)
    meetings = []
    for index, row in enumerate(_rows(book, MEETS_SHEET, MEETS_HEADERS), 2):
        where = f"{MEETS_SHEET} row {index}"
        code, when, club, event, form, judges = row
        meetings.append({
            "code": meeting_code(code, where),
            "date": _date(when, where),
            "club": cell_str(club),
            "event": cell_str(event),
            "format": cell_str(form),
            "judges": cell_str(judges) or None,
        })
    codes = [m["code"] for m in meetings]
    if len(set(codes)) != len(codes):
        raise RacingParseError(f"{MEETS_SHEET}: a meeting number is listed twice")

    dogs = []
    for index, row in enumerate(_rows(book, DOGS_SHEET, DOGS_HEADERS), 2):
        where = f"{DOGS_SHEET} row {index}"
        breed, name, first, meets, latest, courses, wins, losses, draws, pct = row
        if not cell_str(breed) or not cell_str(name):
            continue
        latest_code = cell_str(latest) or None
        if latest_code and latest_code not in codes:
            raise RacingParseError(f"{where}: latest meeting {latest_code} is not on the {MEETS_SHEET}")
        # The win percentage as the sheet shows it; #DIV/0! (no courses) and
        # blank cells read as no figure.
        published = float(pct) if isinstance(pct, (int, float)) and not isinstance(pct, bool) else None
        dogs.append({
            "breed": cell_str(breed),
            "call_name": cell_str(name),
            "first_meeting": _date(first, where),
            "meets": _count(meets, where),
            "latest_meeting": latest_code,
            "courses": _count(courses, where),
            "wins": _count(wins, where),
            "losses": _count(losses, where),
            "draws": _count(draws, where),
            "win_pct": published,
        })
    if not dogs:
        raise RacingParseError(f"{DOGS_SHEET}: no hounds")
    raw = path.read_bytes()
    return {
        "org": ORG,
        "as_of": as_of.isoformat(),
        "source_file": path.name,
        "sha256": sha256(raw),
        "fetched": today(),
        "meetings": meetings,
        "dogs": dogs,
    }


# ------------------------------------------------------------------- build

def rank_win_pct(dogs: list[dict]) -> None:
    """Competition ranking on win percentage among hounds with MIN_COURSES
    courses or more: ties share a rank and the next skips (1, 2, 2, 4)."""
    for dog in dogs:
        dog["rank"] = None
    eligible = sorted(
        (dog for dog in dogs if (dog["courses"] or 0) >= MIN_COURSES and dog["win_pct"] is not None),
        key=lambda dog: (-dog["win_pct"], -(dog["wins"] or 0), -(dog["courses"] or 0), dog["call_name"]),
    )
    rank, previous = 0, None
    for position, dog in enumerate(eligible, 1):
        # Compared as the sheet shows them, so 3 of 5 and 6 of 10 tie.
        shown = round(dog["win_pct"], 6)
        if shown != previous:
            rank, previous = position, shown
        dog["rank"] = rank


def build(snapshot: dict) -> dict:
    dates = {m["code"]: m["date"] for m in snapshot["meetings"]}
    dogs = []
    for raw in snapshot["dogs"]:
        dog = dict(raw)
        dog["id"] = f"{slug(dog['breed'])}--{slug(dog['call_name'])}"
        dog["latest_date"] = dates.get(dog["latest_meeting"])
        dogs.append(dog)
    ids = [dog["id"] for dog in dogs]
    if len(set(ids)) != len(ids):
        raise RacingParseError("two hounds share a breed and call name")
    rank_win_pct(dogs)

    breeds = []
    for breed in sorted({dog["breed"] for dog in dogs}):
        members = [dog for dog in dogs if dog["breed"] == breed]
        courses = sum(dog["courses"] or 0 for dog in members)
        wins = sum(dog["wins"] or 0 for dog in members)
        breeds.append({
            "breed": breed,
            "hounds": len(members),
            "courses": courses,
            "wins": wins,
            "losses": sum(dog["losses"] or 0 for dog in members),
            "draws": sum(dog["draws"] or 0 for dog in members),
            "win_pct": wins / courses if courses else None,
        })

    meetings = snapshot["meetings"]
    stats = {
        "hounds": len(dogs),
        "hounds_with_courses": sum((dog["courses"] or 0) > 0 for dog in dogs),
        "hounds_ranked": sum(dog["rank"] is not None for dog in dogs),
        "breeds": len(breeds),
        "meetings": len(meetings),
        "clubs": len({m["club"] for m in meetings}),
        "first_meeting": min(m["date"] for m in meetings if m["date"]),
        "latest_meeting": max(m["date"] for m in meetings if m["date"]),
        "courses": sum(dog["courses"] or 0 for dog in dogs),
        "wins": sum(dog["wins"] or 0 for dog in dogs),
    }
    return {
        "org": ORG,
        "name": "NLCC",
        "full_name": "National Lure Coursing Club",
        "season": int(snapshot["as_of"][:4]),
        "as_of": snapshot["as_of"],
        "generated": today(),
        "source": {"name": "NLCC Records", "file": snapshot["source_file"], "sha256": snapshot["sha256"]},
        "snapshots": sorted(path.stem for path in SNAPSHOT_DIR.glob("*.json")),
        "min_courses": MIN_COURSES,
        "stats": stats,
        "breeds": breeds,
        "meetings": meetings,
        "dogs": dogs,
        "notes": [
            "Figures are NLCC Records as kept: a hound's win percentage is its wins over "
            "its courses run, so a draw counts as a course run without a win.",
            f"rank is this site's, not NLCC's: hounds with at least {MIN_COURSES} courses "
            "by win percentage, ties sharing a rank; others are unranked.",
            "Hounds are listed by breed and call name, as the records list them.",
        ],
    }


# -------------------------------------------------------------------- main

def write_snapshot(snapshot: dict) -> None:
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    target = SNAPSHOT_DIR / f"{snapshot['as_of']}.json"
    stable = lambda snap: {k: v for k, v in snap.items() if k not in ("fetched", "sha256", "source_file")}
    existing = sorted(SNAPSHOT_DIR.glob("*.json"))
    if existing:
        kept = json.loads(existing[-1].read_text(encoding="utf-8"))
        if stable(kept) == stable(snapshot):
            print(f"Unchanged since {existing[-1].name} - nothing archived.")
            return
    target.write_text(json.dumps(snapshot, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Archived {target.name}: {len(snapshot['dogs'])} hounds, {len(snapshot['meetings'])} meetings")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--file", type=Path, help="an export of the NLCC Records sheet (needs --date)")
    parser.add_argument("--date", type=date.fromisoformat,
                        help="the day the sheet was last edited, which dates the records")
    parser.add_argument("--offline", action="store_true", help="rebuild from the newest snapshot")
    args = parser.parse_args()

    if args.file:
        if not args.date:
            parser.error("--file needs --date, the day the sheet was last edited")
        write_snapshot(parse_workbook(args.file, args.date))
    elif not args.offline:
        try:
            raw = fetch_bytes(EXPORT_URL, user_agent=EXPORT_USER_AGENT)
            if not raw.startswith(b"PK"):
                raise RacingParseError("the sheet answers with a sign-in page: it is not shared "
                                       "to anyone with the link")
            RAW_DIR.mkdir(parents=True, exist_ok=True)
            path = RAW_DIR / "fetched.xlsx"
            path.write_bytes(raw)
            write_snapshot(parse_workbook(path, args.date or date.fromisoformat(today())))
        except (requests.RequestException, RacingParseError) as error:
            print(f"Could not read the NLCC Records sheet ({error}); rebuilding from the "
                  f"snapshots on file.", file=sys.stderr)

    snapshots = sorted(SNAPSHOT_DIR.glob("*.json"))
    if not snapshots:
        print("No NLCC snapshot on file; export the sheet and pass --file.", file=sys.stderr)
        return 1
    feed = build(json.loads(snapshots[-1].read_text(encoding="utf-8")))
    size = write_json(FEED, feed)
    stats = feed["stats"]
    print(f"NLCC Records as of {feed['as_of']}: {stats['hounds']} hounds in {stats['breeds']} breeds, "
          f"{stats['meetings']} meetings from {stats['first_meeting']} to {stats['latest_meeting']}, "
          f"{stats['hounds_ranked']} ranked ({MIN_COURSES}+ courses); wrote nlcc.json ({size:,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
