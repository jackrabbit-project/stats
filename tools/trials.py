"""Fetch ASFA's monthly trial results and summarize entries by club and region.

Each monthly page at asfa.org/trial/index{MM}{YY}.html opens with a summary
table, one row per trial:

    GAZEHOUNDS OF NEW ENGLAND Jun 06, 2026 Blandford, MA Entry: 53

Only that summary is read. Detailed placements sit below it and are archived
but unused.

Entries are credited to the club's home region, taken from data/clubs.json,
not to the region the venue sits in. Clubs travel: Borzoi Club of America is a
Region 4 club that held its 2026 trial in Nebraska, and Central Coast
Association of Sighthounds is a Region 2 club that ran in Arroyo Grande, which
is geographically Region 10.

Usage:
    python tools/trials.py                # current season
    python tools/trials.py --season 2025
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path

import requests

from names import collapse, slugify
from regions import SOURCE as REGION_SOURCE, as_list as regions_as_list

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "trials" / "raw"
OUTPUT = ROOT / "data" / "trials.json"
CLUBS = ROOT / "data" / "clubs.json"
ALIASES = ROOT / "data" / "club-aliases.json"

INDEX_URL = "https://www.asfa.org/trial/index0111.html"
MONTH_URL = "https://www.asfa.org/trial/index{mm}{yy}.html"
USER_AGENT = (
    "asfa-top20/1.0 (unofficial ASFA Top 20 statistics site; "
    "+https://github.com/jackrabbit-project/asfa-top20)"
)
PAGE_ENCODING = "cp1252"

MONTHS = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
          "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12}

# "Jun 06, 2026" — anchoring on the date is what makes the row splittable.
# Club names contain commas ("IOWA COURSING ASSOCIATION, INC"), so splitting
# on punctuation does not work.
DATE_RE = re.compile(
    r"\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)\s+"
    r"(\d{1,2}),\s*(\d{4})"
)
ENTRY_RE = re.compile(r"Entry:\s*(\d+)", re.IGNORECASE)


class TrialParseError(RuntimeError):
    """Raised when a summary row does not match the shape we rely on."""


def get(url: str) -> str:
    response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=60)
    response.raise_for_status()
    return response.content.decode(PAGE_ENCODING, errors="replace")


def months_published(season: int) -> list[int]:
    """Read the year/month grid rather than probing all twelve URLs."""
    yy = f"{season % 100:02d}"
    html = get(INDEX_URL)
    found = {
        int(match)
        for match in re.findall(rf'href="index(\d{{2}}){yy}\.html"', html)
    }
    return sorted(found)


def load_clubs() -> tuple[dict[str, dict], dict[str, str]]:
    if not CLUBS.exists():
        raise SystemExit("data/clubs.json missing. Run tools/clubs.py first.")
    clubs = json.loads(CLUBS.read_text(encoding="utf-8"))["clubs"]
    by_key = {club["match_key"]: club for club in clubs}

    aliases: dict[str, str] = {}
    if ALIASES.exists():
        aliases = json.loads(ALIASES.read_text(encoding="utf-8")).get("aliases", {})
    return by_key, aliases


def match_key(name: str) -> str:
    """Must mirror clubs.match_key() so the two spellings meet in the middle."""
    from clubs import match_key as _match_key

    return _match_key(name)


def parse_summary_rows(html: str, month: int, season: int) -> list[dict]:
    """Pull the trial summary table out of one monthly page."""
    rows: list[dict] = []
    for tr in re.findall(r"<tr\b[^>]*>(.*?)</tr>", html, re.S | re.I):
        # Summary rows are the ones whose first cell jumps to a detail anchor.
        if not re.search(r'href="#R\d+"', tr):
            continue
        cells = re.findall(r"<td\b[^>]*>(.*?)</td>", tr, re.S | re.I)
        if len(cells) != 2:
            continue

        text = collapse(
            re.sub(r"<[^>]+>", "", cells[1])
            .replace("&nbsp;", " ").replace("&amp;", "&")
        )
        if not text:
            continue

        date_match = DATE_RE.search(text)
        entry_match = ENTRY_RE.search(text)
        if not date_match or not entry_match:
            raise TrialParseError(
                f"{season}-{month:02d}: cannot read summary row: {text!r}"
            )

        month_name, day, year = date_match.groups()
        held = date(int(year), MONTHS[month_name[:3].lower()], int(day))

        club = collapse(text[: date_match.start()])
        location = collapse(text[date_match.end(): entry_match.start()]).rstrip(",")
        note = collapse(text[entry_match.end():])
        if not club:
            raise TrialParseError(f"{season}-{month:02d}: no club name in {text!r}")

        state_match = re.search(r",\s*([A-Za-z]{2})(?:\s+CAN)?$", location)
        rows.append({
            "club_raw": club,
            "date": held.isoformat(),
            "location": location,
            "state": state_match.group(1).upper() if state_match else None,
            "entries": int(entry_match.group(1)),
            "note": note,
        })
    return rows


def attach_regions(trials: list[dict]) -> tuple[list[str], dict[str, dict]]:
    """Resolve each trial's club to the directory. Never guess a region."""
    by_key, aliases = load_clubs()
    unmatched: set[str] = set()
    resolved: dict[str, dict] = {}

    for trial in trials:
        raw = trial["club_raw"]
        target = aliases.get(raw, raw)
        club = by_key.get(match_key(target))

        if club is None:
            unmatched.add(raw)
            trial["club"] = collapse(raw.title())
            trial["club_slug"] = slugify(raw)
            trial["region"] = None
            trial["initials"] = None
        else:
            trial["club"] = club["name"]
            trial["club_slug"] = club["slug"]
            trial["region"] = club["region"]
            trial["initials"] = club["initials"]
            resolved[raw] = club

    return sorted(unmatched), resolved


def aggregate(trials: list[dict]) -> tuple[list[dict], list[dict]]:
    by_club: dict[str, dict] = {}
    by_region: dict[int | None, dict] = {}

    for trial in trials:
        club = by_club.setdefault(trial["club_slug"], {
            "club": trial["club"], "slug": trial["club_slug"],
            "initials": trial["initials"], "region": trial["region"],
            "trials": 0, "entries": 0, "venues": Counter(),
        })
        club["trials"] += 1
        club["entries"] += trial["entries"]
        club["venues"][trial["location"]] += 1

        region = by_region.setdefault(trial["region"], {
            "region": trial["region"], "trials": 0, "entries": 0, "clubs": set(),
        })
        region["trials"] += 1
        region["entries"] += trial["entries"]
        region["clubs"].add(trial["club_slug"])

    clubs = []
    for club in by_club.values():
        # ASFA's trial results spell the same venue several ways
        # ("Littlestown" / "Littlesstown"), so report the most-used spelling
        # and a count rather than listing every variant as a separate field.
        venues = club.pop("venues")
        primary, _ = max(venues.items(), key=lambda kv: (kv[1], kv[0]))
        club["venue"] = primary
        club["venue_count"] = len(venues)
        clubs.append(club)
    clubs.sort(key=lambda c: (-c["entries"], c["club"]))

    regions = []
    for region in by_region.values():
        region["clubs"] = len(region["clubs"])
        region["average_entry"] = round(region["entries"] / region["trials"], 1)
        regions.append(region)
    # Unassigned (region None) sorts last.
    regions.sort(key=lambda r: (r["region"] is None, r["region"] or 0))

    return clubs, regions


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, default=None,
                        help="season year (defaults to the current year)")
    args = parser.parse_args()

    season = args.season or datetime.now(timezone.utc).year
    yy = f"{season % 100:02d}"
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    months = months_published(season)
    if not months:
        raise SystemExit(f"No monthly trial pages listed for {season}.")

    trials: list[dict] = []
    fetched = 0
    for month in months:
        url = MONTH_URL.format(mm=f"{month:02d}", yy=yy)
        html = get(url)
        raw = html.encode(PAGE_ENCODING, errors="replace")

        target = RAW_DIR / f"{season}-{month:02d}.html"
        digest = hashlib.sha256(raw).hexdigest()
        if not target.exists() or hashlib.sha256(
                target.read_bytes()).hexdigest() != digest:
            target.write_bytes(raw)
            fetched += 1

        trials.extend(parse_summary_rows(html, month, season))

    trials.sort(key=lambda t: (t["date"], t["club_raw"]))
    unmatched, _ = attach_regions(trials)
    clubs, region_totals = aggregate(trials)

    assigned = [t for t in trials if t["region"] is not None]
    bundle = {
        "season": season,
        "as_of": max(t["date"] for t in trials),
        "generated": datetime.now(timezone.utc).date().isoformat(),
        "source_url": INDEX_URL,
        "months": [f"{season}-{m:02d}" for m in months],
        "region_source": REGION_SOURCE,
        "stats": {
            "trials": len(trials),
            "entries": sum(t["entries"] for t in trials),
            "clubs": len(clubs),
            "unassigned_trials": len(trials) - len(assigned),
            "unassigned_entries": sum(
                t["entries"] for t in trials if t["region"] is None),
        },
        "unmatched_clubs": unmatched,
        "regions": regions_as_list(),
        "by_region": region_totals,
        "by_club": clubs,
        "trials": trials,
    }
    OUTPUT.write_text(
        json.dumps(bundle, indent=2, ensure_ascii=False), encoding="utf-8")

    stats = bundle["stats"]
    print(
        f"{OUTPUT.relative_to(ROOT)}  season {season}, "
        f"{len(months)} month(s), {fetched} page(s) archived\n"
        f"  {stats['trials']} trials, {stats['entries']:,} entries, "
        f"{stats['clubs']} clubs, through {bundle['as_of']}"
    )
    if unmatched:
        print(f"  {len(unmatched)} club(s) unmatched -> no region:")
        for name in unmatched:
            print(f"     {name}")
        print("  Add a mapping to data/club-aliases.json.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
