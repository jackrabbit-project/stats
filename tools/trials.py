"""Fetch ASFA's monthly trial results and summarize entries by club and region.

Each monthly page at asfa.org/trial/index{MM}{YY}.html opens with a summary
table, one row per trial:

    GAZEHOUNDS OF NEW ENGLAND Jun 06, 2026 Blandford, MA Entry: 53

Only that summary is read. Detailed placements sit below it and are archived
but unused.

Entries are credited to the club's home region, taken from data/clubs.json,
not to the region the venue sits in. Clubs travel: Borzoi Club of America is a
Region 4 club that held its 2026 trial in Nebraska. A club's region is
whatever ASFA's current club listing says, for every month at once: the
October 2026 listing moved Central Coast Association of Sighthounds from
Region 2 to Region 10, and its earlier trials moved with it.

Usage:
    python tools/trials.py                # current season
    python tools/trials.py --season 2025
"""

from __future__ import annotations

import argparse
import hashlib
import html as html_module
import json
import re
import sys
import unicodedata
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
    "lure-coursing-stats/1.0 (unofficial ASFA statistics site; "
    "+https://github.com/jackrabbit-project/stats)"
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

# Detail blocks: section headers ("WHIPPET Judge:", "SINGLES Judge:",
# "LCI LARGE Judge:") followed by flight sizes ("Open Flight A(5, 1 NQ)" is a
# flight of five). The trial's published Entry figure counts entered hounds;
# flights count the ones that ran, so an entered hound missing from every
# flight is how the two can differ. A flight is never counted smaller than
# the hounds it places (see parse_program_entries).
PROGRAM_TOKEN_RE = re.compile(
    r"(LCI (?:LARGE|SMALL|SIGHTHOUND MIX))"
    r"|([A-Z][A-Z &().'-]{2,40}?)\s+Judges?:"
    r"|Flight [A-Z]\((\d+)"
)

# ASFA's stakes as its title listing names them: the eligible breeds, the
# Singles stake and the three LCI divisions (Podengo Pequeno runs in the Top 20
# and the results though the title index leaves it out). A results heading is
# matched to one of these by section_name().
SECTIONS = (
    "Afghan Hound", "Azawakh", "Basenji", "Borzoi", "Chart Polski",
    "Cirneco dell'Etna", "Galgo Español", "Greyhound", "Ibizan Hound",
    "Irish Wolfhound", "Italian Greyhound", "Magyar Agar", "Peruvian Inca Orchid",
    "Pharaoh Hound", "Podengo Pequeno", "Rhodesian Ridgeback", "Saluki",
    "Scottish Deerhound", "Silken Windhound", "Sloughi", "Whippet",
    "Singles", "LCI Large", "LCI Small", "LCI Sighthound Mix",
)
SECTION_PROGRAM = {
    "Singles": "singles", "LCI Large": "lci", "LCI Small": "lci", "LCI Sighthound Mix": "lci",
}
MONTH_NAMES = ("January", "February", "March", "April", "May", "June", "July",
               "August", "September", "October", "November", "December")

# A venue whose state ASFA misprinted, keyed by the location exactly as the
# results print it. The location text stays as printed; only the state the
# trial is counted under is set. Greater Twin Cities Whippet Club's September
# 12, 2026 trial reads "Farmington, NMN"; its trial the next day, same field,
# reads "Farmington, MN".
VENUE_STATES = {"Farmington, NMN": "MN"}


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
        # The link is taken as written, typos included ("#R1-" for "#R10" on
        # September 2026); main() pairs a link that names no detail block
        # with its block by club, date and entry instead.
        anchor = re.search(r'href="#R(\d[^"]*)"', tr)
        if not anchor:
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
            "state": VENUE_STATES.get(location) or (state_match.group(1).upper() if state_match else None),
            "entries": int(entry_match.group(1)),
            "note": note,
            "detail_ref": anchor.group(1),
        })
    return rows


def detail_blocks(html: str) -> list[tuple[str, str]]:
    """Each trial's detail block as (anchor number, flattened text).

    Anchor names repeat: a stray duplicate "R1" often sits a few characters
    after a real anchor. The genuine block starts are strictly increasing
    (R1, R2, R3, ...), so anything out of sequence is markup debris.
    """
    anchors: list[tuple[int, str]] = []
    highest = 0
    for match in re.finditer(r'<a\s+name="R(\d+)"', html):
        number = int(match.group(1))
        if number > highest:
            anchors.append((match.start(), match.group(1)))
            highest = number
    blocks = []
    for i, (start, ref) in enumerate(anchors):
        end = anchors[i + 1][0] if i + 1 < len(anchors) else len(html)
        flat = collapse(
            re.sub(r"<[^>]+>", " ", html[start:end]).replace("&nbsp;", " "))
        blocks.append((ref, flat))
    return blocks


def _club_words(name: str) -> str:
    return " ".join(re.sub(r"[^A-Z0-9]+", " ", name.upper().replace("&AMP;", "&")).split())


def parse_detail_headers(html: str) -> dict[str, tuple[str, int, str]]:
    """Each detail block's own heading: (date, Entry figure, club words),
    keyed by its anchor. The heading repeats the summary row's club, date
    and Entry, which is what lets a mislinked summary row find its block."""
    headers: dict[str, tuple[str, int, str]] = {}
    for ref, flat in detail_blocks(html):
        date_match = DATE_RE.search(flat)
        entry_match = ENTRY_RE.search(flat)
        if not date_match or not entry_match or entry_match.start() < date_match.start():
            continue
        month_name, day, year = date_match.groups()
        held = date(int(year), MONTHS[month_name[:3].lower()], int(day)).isoformat()
        headers[ref] = (held, int(entry_match.group(1)), _club_words(flat[: date_match.start()]))
    return headers


def _plain(text: str) -> str:
    """Upper case, accents dropped, anything but letters and digits a space."""
    text = unicodedata.normalize("NFKD", html_module.unescape(text))
    text = "".join(c for c in text if not unicodedata.combining(c))
    return " ".join(re.sub(r"[^A-Z0-9]+", " ", text.upper()).split())


# The longest name first, so "ITALIAN GREYHOUND" is never read as "GREYHOUND".
_SECTION_KEYS = sorted(((_plain(name), name) for name in SECTIONS), key=lambda kv: -len(kv[0]))


def section_name(heading: str) -> str | None:
    """The ASFA stake a results heading names, or None for Best in Field.

    The heading capture sometimes starts a few tokens early ("NC) GREYHOUND",
    "NQ) WHIPPET", "B BASENJI", "LCI LCI LARGE"), so a heading is matched to
    the longest stake name it ends with. A heading that ends with none comes
    back in title case, to be listed openly as unmatched rather than guessed.
    """
    words = _plain(heading)
    if words == "BEST IN FIELD" or words.endswith(" BEST IN FIELD"):
        return None
    for key, name in _SECTION_KEYS:
        if words == key or words.endswith(" " + key):
            return name
    return words.title()


def _flights(flat: str):
    """Each flight in one trial's detail block as (program, stake, hounds)."""
    program, section = "breed", None
    tokens = list(PROGRAM_TOKEN_RE.finditer(flat))
    for k, token in enumerate(tokens):
        lci, header, flight = token.groups()
        if lci:
            program, section = "lci", section_name(lci)
        elif header:
            section = section_name(header)
            # Classify by content, not by which alternative fired: the
            # header capture sometimes starts a few caps tokens early
            # ("NC) SINGLES"), and a section is what its name says.
            if section in SECTION_PROGRAM:
                program = SECTION_PROGRAM[section]
            elif section in SECTIONS:
                program = "breed"
            elif "SINGLE" in header:
                program = "singles"
            elif "LCI" in header:
                program = "lci"
            else:
                program = "breed"
        elif flight:
            # A flight ran at least as many hounds as it places. ASFA
            # printed one flight "(0)" above a hound placed first with
            # Best of Breed (Azawakh at CLCA, February 22, 2026); the
            # printed size alone made that hound look entered, never ran.
            stop = tokens[k + 1].start() if k + 1 < len(tokens) else len(flat)
            placed = len(re.findall(r"(?:^|\s)\d{1,2}\.\s",
                                    flat[token.end():stop]))
            yield program, section, max(int(flight), placed)


def parse_program_entries(html: str) -> dict[str, dict]:
    """Sum each trial's flight sizes by program, keyed by its detail anchor.

    The summary's Entry figure includes every program run at the trial —
    regular breed stakes, Singles and LCI together — which is why the split
    has to be re-derived from the flights rather than read off the page.
    """
    tallies: dict[str, dict] = {}
    for ref, flat in detail_blocks(html):
        tally = {"breed": 0, "singles": 0, "lci": 0}
        for program, _, hounds in _flights(flat):
            tally[program] += hounds
        tallies[ref] = tally
    return tallies


def parse_section_entries(html: str) -> dict[str, dict[str, int]]:
    """The same flights summed by stake (each breed, Singles, each LCI
    division), keyed by detail anchor. Stakes with no hounds are left out."""
    tallies: dict[str, dict[str, int]] = {}
    for ref, flat in detail_blocks(html):
        tally: Counter = Counter()
        for _, section, hounds in _flights(flat):
            if section is None:
                raise TrialParseError(f"R{ref}: a flight sits outside any stake heading")
            tally[section] += hounds
        tallies[ref] = {name: n for name, n in sorted(tally.items(), key=lambda kv: (-kv[1], kv[0])) if n}
    return tallies


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
            "trials": 0, "entries": 0, "largest": 0, "venues": Counter(),
        })
        club["trials"] += 1
        club["entries"] += trial["entries"]
        club["largest"] = max(club["largest"], trial["entries"])
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
        club["average_entry"] = round(club["entries"] / club["trials"], 1)
        clubs.append(club)
    competition_rank(clubs, "entries")
    clubs.sort(key=lambda c: (-c["entries"], c["club"]))

    regions = []
    for region in by_region.values():
        region["clubs"] = len(region["clubs"])
        region["average_entry"] = round(region["entries"] / region["trials"], 1)
        regions.append(region)
    # Unassigned (region None) sorts last.
    regions.sort(key=lambda r: (r["region"] is None, r["region"] or 0))

    return clubs, regions


def competition_rank(rows: list[dict], field: str) -> None:
    """Ties share a rank and the next rank skips, as ASFA's Top 20 ranks."""
    previous, rank = None, 0
    for position, row in enumerate(sorted(rows, key=lambda r: -r[field]), 1):
        if row[field] != previous:
            rank, previous = position, row[field]
        row["rank"] = rank


def summaries(trials: list[dict], months: list[str]) -> dict:
    """The season by month, by venue state and by stake."""
    by_month = []
    for key in months:
        rows = [t for t in trials if t["date"].startswith(key)]
        entries = sum(t["entries"] for t in rows)
        by_month.append({
            "month": key, "label": MONTH_NAMES[int(key[5:7]) - 1],
            "trials": len(rows), "entries": entries,
            **{p: sum(t["by_program"][p] for t in rows) for p in ("breed", "singles", "lci", "absent")},
            "average_entry": round(entries / len(rows), 1) if rows else None,
        })

    states: dict[str, dict] = {}
    for t in trials:
        state = states.setdefault(t["state"] or "", {
            "state": t["state"], "trials": 0, "entries": 0, "largest": 0, "clubs": set()})
        state["trials"] += 1
        state["entries"] += t["entries"]
        state["largest"] = max(state["largest"], t["entries"])
        state["clubs"].add(t["club_slug"])
    by_state = []
    for state in states.values():
        state["clubs"] = len(state["clubs"])
        state["average_entry"] = round(state["entries"] / state["trials"], 1)
        by_state.append(state)
    competition_rank(by_state, "entries")
    by_state.sort(key=lambda s: (s["rank"], -s["trials"], s["state"] or ""))

    stakes: dict[str, dict] = {}
    for t in trials:
        for name, hounds in t["by_breed"].items():
            stake = stakes.setdefault(name, {
                "breed": name, "program": SECTION_PROGRAM.get(name, "breed"),
                "known": name in SECTIONS, "trials": 0, "entries": 0, "largest": 0})
            stake["trials"] += 1
            stake["entries"] += hounds
            stake["largest"] = max(stake["largest"], hounds)
    by_breed = []
    for stake in stakes.values():
        stake["average_entry"] = round(stake["entries"] / stake["trials"], 1)
        by_breed.append(stake)
    competition_rank(by_breed, "entries")
    by_breed.sort(key=lambda s: (s["rank"], -s["trials"], s["breed"]))
    return {"by_month": by_month, "by_state": by_state, "by_breed": by_breed}


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

        month_rows = parse_summary_rows(html, month, season)
        programs = parse_program_entries(html)
        sections = parse_section_entries(html)
        headers = parse_detail_headers(html)
        claimed = {row["detail_ref"] for row in month_rows if row["detail_ref"] in programs}
        for row in month_rows:
            ref = row.pop("detail_ref")
            if ref not in programs:
                # A summary link that names no detail block (ASFA's typo):
                # the one unclaimed block whose heading has the same club,
                # date and Entry figure is this trial's.
                want = (row["date"], row["entries"], _club_words(row["club_raw"]))
                matches = [r for r, head in headers.items() if head == want and r not in claimed]
                if len(matches) != 1:
                    raise TrialParseError(
                        f"{season}-{month:02d}: {row['club_raw']} links to '#R{ref}', which is "
                        f"not a detail block, and {len(matches)} unclaimed blocks match it")
                print(f"  {season}-{month:02d}: {row['club_raw']} {row['date']} links to "
                      f"'#R{ref}' on ASFA's page; paired with block R{matches[0]} by club, date and entry")
                ref = matches[0]
                claimed.add(ref)
            tally = programs.get(ref)
            if tally is None:
                raise TrialParseError(
                    f"{season}-{month:02d}: {row['club_raw']} has no detail block")
            ran = sum(tally.values())
            if ran > row["entries"]:
                raise TrialParseError(
                    f"{season}-{month:02d}: {row['club_raw']} flights sum to "
                    f"{ran} but Entry says {row['entries']}")
            # Entered hounds missing from every flight would be entered, never
            # ran; their program is unknowable, so they are carried separately
            # rather than guessed into one.
            row["by_program"] = {**tally, "absent": row["entries"] - ran}
            # The same flights by stake; they must add up to the same hounds.
            row["by_breed"] = sections[ref]
            if sum(row["by_breed"].values()) != ran:
                raise TrialParseError(
                    f"{season}-{month:02d}: {row['club_raw']} stakes sum to "
                    f"{sum(row['by_breed'].values())}, programs to {ran}")
            # Straight to the trial's own results on ASFA's page, by its
            # detail anchor (the right one even where ASFA's index link is not).
            row["results_url"] = f"{url}#R{ref}"
        trials.extend(month_rows)

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
            "by_program": {
                key: sum(t["by_program"][key] for t in trials)
                for key in ("breed", "singles", "lci", "absent")
            },
        },
        "unmatched_clubs": unmatched,
        "unmatched_sections": sorted({name for t in trials for name in t["by_breed"]} - set(SECTIONS)),
        "regions": regions_as_list(),
        "by_region": region_totals,
        "by_club": clubs,
        **summaries(trials, [f"{season}-{m:02d}" for m in months]),
        "trials": trials,
    }
    OUTPUT.write_text(
        json.dumps(bundle, indent=2, ensure_ascii=False), encoding="utf-8")

    stats = bundle["stats"]
    print(
        f"{OUTPUT.relative_to(ROOT)}  season {season}, "
        f"{len(months)} month(s), {fetched} page(s) archived\n"
        f"  {stats['trials']} trials, {stats['entries']:,} entries, "
        f"{stats['clubs']} clubs, through {bundle['as_of']}\n"
        f"  by program: {stats['by_program']}"
    )
    if unmatched:
        print(f"  {len(unmatched)} club(s) unmatched -> no region:")
        for name in unmatched:
            print(f"     {name}")
        print("  Add a mapping to data/club-aliases.json.")
    unread = [t for t in trials if not t["state"]]
    if unread:
        print(f"  {len(unread)} venue(s) with no readable state (counted under '-' by state): "
              f"{[(t['date'], t['location']) for t in unread]}")
        print("  Add the location to VENUE_STATES in tools/trials.py if it is a misprint.")
    if bundle["unmatched_sections"]:
        print(f"  {len(bundle['unmatched_sections'])} results heading(s) match no ASFA stake "
              f"(shown as they are): {bundle['unmatched_sections']}")
        print("  Add the stake to SECTIONS in tools/trials.py if ASFA has added one.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
