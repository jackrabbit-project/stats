"""Read AKC's Single Stakes Results and keep each sheet's count.

AKC posts its lure coursing Singles stakes apart from Event Search: one PDF
per stake, listed by year and month on SINGLES_URL and posted a month or more
after the trial. A sheet heads "LURE COURSING - SINGLE STAKES" and gives the
club, the AKC event number (most print "Event Number:", some only
"Number:"), the date, the number of starters and the judge, then the
placings: five at most, never every starter, so Singles cannot be split by
breed. Only the count is kept: the sheet's file and link, club, event number,
date and starters. Judges, hounds and owners are never stored.

The record, data/akc/singles.json, lists every sheet read for the season. A
sheet already on file is not downloaded again, so a quiet week costs the
listing page alone; a sheet AKC takes down leaves the record with a notice.
tools/akc.py matches each sheet to its trial and adds the starters to the
AKC figures.

Usage:
    python tools/akc_singles.py                 # read new sheets for this year
    python tools/akc_singles.py --season 2026
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
import time
from datetime import date
from pathlib import Path

import requests

from racing import DATA, USER_AGENT, RacingParseError, today

SINGLES_NAME = "AKC Single Stakes Results"
SINGLES_URL = "https://www.akc.org/sports/coursing/lure-coursing/single-stakes-results/"
RECORD = DATA / "akc" / "singles.json"

# The listing links each sheet as /wp-content/uploads/<year>/<month>/<file>.pdf,
# the file named for the trial date ("6.26.26-American-Whippet-Club-Inc.pdf").
# The file name only picks the season's sheets; the date printed on the sheet
# is the one kept (the AWC sheet above is dated 06/27/26).
SHEET_LINK_RE = re.compile(
    r'href="(https://www\.akc\.org/wp-content/uploads/\d{4}/\d{2}/([^"/?#]+\.pdf))"', re.I)
FILE_DATE_RE = re.compile(r"^(\d{1,2})\.(\d{1,2})\.(\d{2})[-.]")

TITLE_RE = re.compile(r"LURE\s+COURSING\s*-\s*SINGLES?\s+STAKES?", re.I)
CLUB_RE = re.compile(r"Club\s*Name:?\s*(.+?)\s+(?:Event\s+)?Number:", re.I)
NUMBER_RE = re.compile(r"Number:?\s*(20\d{8})\b")
DATE_RE = re.compile(r"Date:?\s*(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b")
STARTERS_RE = re.compile(r"No\.?\s*of\s*Starters:?\s*(\d+)", re.I)


def season_sheets(listing: str, season: int) -> list[tuple[str, str]]:
    """(link, file) for each sheet whose file name dates it to the season,
    in page order, each once."""
    seen: set[str] = set()
    sheets = []
    for link, name in SHEET_LINK_RE.findall(listing):
        match = FILE_DATE_RE.match(name)
        if not match or 2000 + int(match.group(3)) != season or link in seen:
            continue
        seen.add(link)
        sheets.append((link, name))
    return sheets


def read_sheet(pdf: bytes, name: str) -> dict:
    """The count on one sheet: club, event number, date and starters."""
    import pdfplumber

    if not pdf.startswith(b"%PDF"):
        raise RacingParseError(f"{name}: not a PDF")
    try:
        with pdfplumber.open(io.BytesIO(pdf)) as document:
            text = "\n".join(page.extract_text() or "" for page in document.pages)
    except Exception as error:  # pdfminer raises its own types for a damaged file
        raise RacingParseError(f"{name}: unreadable PDF ({error})") from error
    if not TITLE_RE.search(text):
        raise RacingParseError(f"{name}: not headed LURE COURSING - SINGLE STAKES")
    if len(TITLE_RE.findall(text)) > 1:
        raise RacingParseError(f"{name}: more than one stake on the sheet")
    starters = STARTERS_RE.search(text)
    when = DATE_RE.search(text)
    if not starters or not when:
        raise RacingParseError(f"{name}: no {'starters' if not starters else 'date'} on the sheet")
    month, day, year = (int(part) for part in when.groups())
    if year < 100:
        year += 2000
    club = CLUB_RE.search(text)
    number = NUMBER_RE.search(text)
    return {
        "club": " ".join(club.group(1).split()) if club else None,
        "event_number": number.group(1) if number else None,
        "date": date(year, month, day).isoformat(),
        "starters": int(starters.group(1)),
    }


def load_record() -> dict | None:
    if not RECORD.exists():
        return None
    return json.loads(RECORD.read_text(encoding="utf-8"))


def write_record(record: dict) -> None:
    RECORD.parent.mkdir(parents=True, exist_ok=True)
    # LF everywhere, like the collections: check.py hashes nothing here, but
    # a stable file keeps a quiet week out of the commit.
    with open(RECORD, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(record, indent=1, ensure_ascii=False) + "\n")


def update(season: int, delay: float = 1.0) -> dict:
    """Read the listing and any sheet not yet on file; return the record."""
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    response = session.get(SINGLES_URL, timeout=60)
    response.raise_for_status()
    listed = season_sheets(response.text, season)
    if not listed:
        raise RacingParseError(f"No {season} sheets on {SINGLES_URL}; has the page changed?")

    previous = load_record()
    known = {}
    if previous and previous.get("season") == season:
        known = {sheet["url"]: sheet for sheet in previous["sheets"]}
    sheets, new = [], 0
    for link, name in listed:
        if link in known:
            sheets.append(known[link])
            continue
        pdf = session.get(link, timeout=60)
        pdf.raise_for_status()
        time.sleep(delay)
        # A sheet that cannot be read is left off the record, so it is tried
        # again next week; the rest still count.
        try:
            sheet = read_sheet(pdf.content, name)
            if int(sheet["date"][:4]) != season:
                raise RacingParseError(f"{name}: dated {sheet['date']}, outside {season}")
        except RacingParseError as error:
            print(f"Skipped a Singles sheet: {error}", file=sys.stderr)
            continue
        sheets.append({"file": name, "url": link, **sheet})
        new += 1
    gone = sorted(set(known) - {link for link, _ in listed})
    for link in gone:
        print(f"AKC no longer lists {link.rsplit('/', 1)[-1]}; dropped from the record.")
    sheets.sort(key=lambda s: (s["date"], s["file"]))
    record = {
        "source": {"name": SINGLES_NAME, "url": SINGLES_URL},
        "season": season,
        "read": today(),
        "sheets": sheets,
    }
    if previous and previous.get("season") == season and previous["sheets"] == sheets:
        record["read"] = previous["read"]
    print(f"AKC Singles {season}: {len(sheets)} sheets ({new} new), "
          f"{sum(s['starters'] for s in sheets)} starters, latest {sheets[-1]['date'] if sheets else None}")
    return record


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--season", type=int, default=date.today().year)
    parser.add_argument("--delay", type=float, default=1.0, help="seconds between sheets")
    args = parser.parse_args()
    try:
        record = update(args.season, delay=args.delay)
    except (requests.RequestException, RacingParseError) as error:
        print(f"Could not read AKC's Singles results: {error}", file=sys.stderr)
        return 1
    write_record(record)
    return 0


if __name__ == "__main__":
    sys.exit(main())
