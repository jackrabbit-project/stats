"""Fetch the current ASFA Top 20 standings page and archive it as a snapshot.

The page at asfa.org/20/index.htm is updated roughly monthly during the season.
Each fetch is stored verbatim under data/snapshots/{as_of}.html so that every
number on the site can be traced back to the bytes ASFA actually served, and so
that movement between publications can be computed later.

Usage:
    python tools/fetch.py            # fetch and archive if changed
    python tools/fetch.py --force    # archive even if byte-identical
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from datetime import date
from pathlib import Path

import requests

SOURCE_URL = "https://www.asfa.org/20/index.htm"
SNAPSHOT_DIR = Path(__file__).resolve().parent.parent / "data" / "snapshots"

# Identify the project rather than impersonating a browser. One request per run.
USER_AGENT = (
    "lure-coursing-stats/1.0 (unofficial ASFA statistics site; "
    "+https://github.com/jackrabbit-project/stats)"
)

# The page is legacy Windows-authored HTML with no charset declaration.
PAGE_ENCODING = "cp1252"

MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11,
    "december": 12,
}

# "For period January 1, 2026 through July 17, 2026" — the page states its own
# coverage. Trust that over the wall clock, because a fetch may happen days or
# weeks after ASFA published.
PERIOD_RE = re.compile(
    r"For\s+period\s+(?P<start>\w+\s+\d{1,2},\s*\d{4})\s+through\s+"
    r"(?P<end>\w+\s+\d{1,2},\s*\d{4})",
    re.IGNORECASE,
)


def strip_markup(html: str) -> str:
    """Flatten tags and entities enough to read prose out of the page."""
    text = re.sub(r"<[^>]+>", " ", html)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&")
    return re.sub(r"\s+", " ", text)


def parse_us_date(value: str) -> date:
    match = re.match(r"(\w+)\s+(\d{1,2}),\s*(\d{4})", value.strip())
    if not match:
        raise ValueError(f"unrecognized date: {value!r}")
    month_name, day, year = match.groups()
    month = MONTHS.get(month_name.lower())
    if month is None:
        raise ValueError(f"unrecognized month in date: {value!r}")
    return date(int(year), month, int(day))


def read_period(html: str) -> tuple[int, date]:
    """Return (season, as_of) from the page's own coverage statement."""
    match = PERIOD_RE.search(strip_markup(html))
    if not match:
        raise SystemExit(
            "Could not find the 'For period ... through ...' line. The page "
            "layout has changed; check the source before trusting any parse."
        )
    start = parse_us_date(match.group("start"))
    end = parse_us_date(match.group("end"))
    if end < start:
        raise SystemExit(f"Coverage end {end} precedes start {start}.")
    return start.year, end


def newest_snapshot() -> Path | None:
    existing = sorted(SNAPSHOT_DIR.glob("*.html"))
    return existing[-1] if existing else None


def fetch(force: bool = False) -> Path | None:
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)

    response = requests.get(
        SOURCE_URL, headers={"User-Agent": USER_AGENT}, timeout=30
    )
    response.raise_for_status()
    raw = response.content

    season, as_of = read_period(raw.decode(PAGE_ENCODING, errors="replace"))
    target = SNAPSHOT_DIR / f"{as_of.isoformat()}.html"

    digest = hashlib.sha256(raw).hexdigest()
    previous = newest_snapshot()
    if previous is not None and not force:
        if hashlib.sha256(previous.read_bytes()).hexdigest() == digest:
            print(f"Unchanged since {previous.name} - nothing archived.")
            return None

    if target.exists() and not force:
        print(
            f"{target.name} already exists but its contents differ from the "
            f"live page. ASFA revised a published period in place. "
            f"Re-run with --force to overwrite."
        )
        return None

    # Store the bytes exactly as served; parse.py owns decoding.
    target.write_bytes(raw)
    print(f"Archived {target.name}  season={season}  {len(raw):,} bytes")
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force",
        action="store_true",
        help="archive even if the page is unchanged or the file exists",
    )
    args = parser.parse_args()
    fetch(force=args.force)
    return 0


if __name__ == "__main__":
    sys.exit(main())
