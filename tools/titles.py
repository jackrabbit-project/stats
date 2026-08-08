"""Fetch ASFA's title listing and extract the titles earned this season.

The page at asfa.org/titles/index.htm lists every title ASFA has posted since
2016, organized as one block per breed / division, each opened by a header row
(Title | Call Name | {Section} | Date | Owner) and subdivided by title-name
rows ("Field Champion", "Lure Courser Of Merit 3", "Title of Coursing
Proficiency (TCP)", ...). Hound rows carry the call name, the registered name
with registration number, sex and birth date, the date the title was earned,
and the owners.

Only rows earned in the requested season are kept. The page states its own
coverage ("Earned January 1, 2016 through July 31, 2026"); that closing date
becomes as_of, so the site can say exactly what the count covers.

Where a titled hound also appears in the season standings, the row links to
its profile by reusing the same title-stripping match parse.py uses — a name
gains titles as the season runs, so matching is on the stripped core name.

Usage:
    python tools/titles.py                # current season
    python tools/titles.py --season 2025
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
from bs4 import BeautifulSoup

from names import collapse, slugify, split_titles

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "titles" / "raw"
OUTPUT = ROOT / "data" / "titles.json"
SEASON_JSON = ROOT / "data" / "season.json"

URL = "https://www.asfa.org/titles/index.htm"
USER_AGENT = (
    "lure-coursing-stats/1.0 (unofficial ASFA statistics site; "
    "+https://github.com/jackrabbit-project/stats)"
)
PAGE_ENCODING = "cp1252"

MONTHS = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
          "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12}

# Every title block name the page uses, mapped to the abbreviation shown on
# the site. Vocabulary, not heuristics: an unknown block name is an error,
# because silently skipping one would silently drop its titles.
# "Vereran" is the page's own typo for one Saluki block.
TITLE_BLOCKS = {
    "field champion": "FCh",
    "provisional field champion": "PFCh",
    "veteran field champion": "VFCh",
    "vereran field champion": "VFCh",
    "lure courser of merit": "LCM",
    "veteran lure courser of merit": "VLCM",
    "lure chasing instinct": "LCI",
    "lure chasing champion": "LCC",
    "veteran lure chasing champion": "VLCC",
    "lure chasing advanced": "LCA",
    "lure chasing excellent": "LCE",
    "title of coursing proficiency (tcp)": "TCP",
    "title of coursing proficiency": "TCP",
    "coursing proficiency excellent (cpx)": "CPX",
    "coursing proficiency excellent": "CPX",
}

LCI_ABBRS = {"LCI", "LCC", "VLCC", "LCA", "LCE"}
SINGLES_ABBRS = {"TCP", "CPX"}

# "Mar 18, 2018", "Dec 28 2018", "Sep20, 2018", "MAY 03 2026", and dates
# with a trailing annotation ("Apr 4 2026 Provisional TCP"). Anchored at the
# start only: a registered-name cell *ends* with the hound's birth date, so a
# start anchor is what keeps those cells from reading as earned dates.
DATE_WORDY = re.compile(
    r"^([A-Za-z]{3,9})\.?\s*(\d{1,2})[,.]?\s+(\d{4})\b"
)
# "29-Apr-18"
DATE_DASHED = re.compile(r"^(\d{1,2})-([A-Za-z]{3,9})-(\d{2})$")

# The registered-name cell trails off into registration number, sex and birth
# date ("..., HP519599/02, D, Jun 24, 2016"). Registry formats vary too much
# for a prefix list (HP, PAL, RI.H23.018, LG079, PL024-584, V2024 468 ...),
# so the tail is trimmed comma-part by comma-part from the right: a part that
# carries a digit, is a bare sex letter, or reads as a date is registration
# furniture, and the trimming stops at the first part that looks like a name.
def display_name(registered_raw: str) -> str:
    parts = [collapse(p) for p in registered_raw.split(",")]
    while len(parts) > 1:
        tail = parts[-1]
        if (not tail or any(ch.isdigit() for ch in tail)
                or re.fullmatch(r"[DBM]", tail) or parse_date(tail)):
            parts.pop()
        else:
            break
    return collapse(",".join(parts)).rstrip(",")

# The coverage statement the page makes about itself.
COVERAGE = re.compile(
    r"through\s+([A-Za-z]{3,9})\.?\s*(\d{1,2}),?\s+(\d{4})"
)


class TitleParseError(RuntimeError):
    """Raised when the page's shape stops matching what this parser relies on."""


def get(url: str) -> str:
    response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=60)
    response.raise_for_status()
    return response.content.decode(PAGE_ENCODING, errors="replace")


def clean(cell: str) -> str:
    text = re.sub(r"<[^>]+>", " ", cell)
    text = (text.replace("&nbsp;", " ").replace("&amp;", "&")
                .replace("&rsquo;", "'").replace("&#39;", "'"))
    return collapse(text)


def parse_date(text: str) -> date | None:
    text = collapse(text).strip(".")
    match = DATE_WORDY.match(text)
    if match:
        month_name, day, year = match.groups()
        month = MONTHS.get(month_name[:3].lower())
        if month:
            return date(int(year), month, int(day))
    match = DATE_DASHED.match(text)
    if match:
        day, month_name, yy = match.groups()
        month = MONTHS.get(month_name[:3].lower())
        if month:
            return date(2000 + int(yy), month, int(day))
    # "Sep20, 2018" — the space between month and day is missing.
    match = re.match(r"^([A-Za-z]{3})(\d{1,2}),?\s+(\d{4})$", text)
    if match:
        month_name, day, year = match.groups()
        month = MONTHS.get(month_name.lower())
        if month:
            return date(int(year), month, int(day))
    return None


def coverage_date(html: str) -> str:
    text = clean(html)
    match = COVERAGE.search(text)
    if not match:
        raise TitleParseError("cannot find the page's 'through {date}' coverage line")
    month_name, day, year = match.groups()
    return date(int(year), MONTHS[month_name[:3].lower()], int(day)).isoformat()


def parse_rows(html: str) -> list[dict]:
    """Walk the page's rows with a two-level state machine: section, then title.

    The page is FrontPage-era markup with tables nested inside table cells, so
    rows are taken from a real parser rather than a regex: every <tr> in the
    document, reading only its direct-child cells and skipping wrapper rows
    whose cells just hold further tables.
    """
    # html5lib, not html.parser: the page leaves table rows unclosed the way
    # FrontPage did, and only a browser-grade repair pass reconstructs every
    # record row. html.parser silently loses about a third of them.
    soup = BeautifulSoup(html, "html5lib")
    section: str | None = None
    title_abbr: str | None = None
    title_name: str | None = None
    rows: list[dict] = []

    for tr in soup.find_all("tr"):
        tds = tr.find_all("td", recursive=False)
        if any(td.find("table") for td in tds):
            continue  # wrapper row; its content arrives via the inner rows
        filled = [collapse(td.get_text(" ").replace("\xa0", " ")) for td in tds]
        filled = [c for c in filled if c]
        if not filled:
            continue

        # A section opens with its column-header row; the section name sits in
        # the middle, between "Call Name" and "Date".
        lowered = [c.lower() for c in filled]
        if "date" in lowered and "owner" in lowered:
            names = [c for c in filled
                     if c.lower() not in ("title", "call", "name", "call name",
                                          "date", "owner", "earned")]
            if len(names) == 1:
                section = names[0]
                title_abbr = title_name = None
            continue

        # A title block header is a single filled cell from the vocabulary.
        if len(filled) == 1:
            base = re.sub(r"\s+\d+$", "", filled[0]).lower()
            if base in TITLE_BLOCKS:
                tier = re.search(r"(\d+)$", filled[0])
                title_abbr = TITLE_BLOCKS[base] + (tier.group(1) if tier else "")
                title_name = filled[0]
            continue

        if section is None or title_abbr is None or len(filled) < 3:
            continue

        # A hound row: call name, registered line, an earned date, owners.
        # One row occasionally carries two records back to back, so every
        # date-shaped cell (with at least a registered name before it) starts
        # a record of its own. A few rows omit the call-name cell entirely,
        # which is why a date at index 1 still counts.
        date_indices = [i for i, cell in enumerate(filled)
                        if i >= 1 and parse_date(cell)]
        for j, di in enumerate(date_indices):
            next_call = date_indices[j + 1] - 2 if j + 1 < len(date_indices) \
                else len(filled)
            prev_end = date_indices[j - 1] if j else -1
            registered_raw = filled[di - 1]
            # The call name is the single cell before the registered name;
            # anything earlier is another record's tail, orphaned into this
            # row by the markup repair.
            call_name = filled[di - 2] if di - 2 > prev_end else ""
            owners_raw = collapse(" ".join(filled[di + 1:next_call]))
            registered_name = display_name(registered_raw)

            rows.append({
                "section": section,
                "title": title_name,
                "title_abbr": title_abbr,
                "call_name": call_name,
                "registered_name": registered_name,
                "registered_raw": registered_raw,
                "date": parse_date(filled[di]).isoformat(),
                "owners_raw": owners_raw,
            })
    return rows


def program_of(row: dict) -> str:
    if row["title_abbr"].rstrip("0123456789") in LCI_ABBRS:
        return "lci"
    if row["title_abbr"] in SINGLES_ABBRS:
        return "singles"
    return "breed"


def attach_dogs(rows: list[dict]) -> int:
    """Link titled hounds to season profiles by stripped core name.

    The title listing and the standings are typed separately and disagree on
    spelling more often than one would hope ("Risse"/"Rise", "Lazlo"/
    "Laszlo", a kennel name garbled outright). After the exact match, two
    conservative fallbacks run, both confined to the row's own section and
    both requiring a unique winner: the call name, and then a close
    similarity on the registered-name slug. No candidate, no link.
    """
    if not SEASON_JSON.exists():
        for row in rows:
            row["dog_id"] = None
        return 0

    import difflib

    season = json.loads(SEASON_JSON.read_text(encoding="utf-8"))
    by_slug: dict[str, list[dict]] = {}
    by_call: dict[tuple[str, str], list[dict]] = {}
    by_section: dict[str, list[tuple[str, dict]]] = {}
    for dog in season["dogs"]:
        slug = dog["id"].rsplit("--", 1)[0]
        breed = dog["breed"].lower()
        by_slug.setdefault(slug, []).append(dog)
        by_call.setdefault((slugify(dog["call_name"]), breed), []).append(dog)
        by_section.setdefault(breed, []).append((slug, dog))

    matched = 0
    for row in rows:
        section = row["section"].lower()
        _, core, _ = split_titles(row["registered_name"])
        slug = slugify(core)

        pick = None
        candidates = by_slug.get(slug, [])
        for dog in candidates:
            if dog["breed"].lower() == section:
                pick = dog
                break
        if pick is None and candidates:
            # Ranked under a different section (a Singles title for a hound
            # listed under its breed, say) — the profile is the same hound.
            pick = candidates[0]

        if pick is None:
            calls = by_call.get((slugify(row["call_name"]), section), [])
            if len(calls) == 1:
                pick = calls[0]

        if pick is None:
            pool = by_section.get(section, [])
            close = [d for s, d in pool
                     if difflib.SequenceMatcher(None, slug, s).ratio() >= 0.87]
            if len(close) == 1:
                pick = close[0]

        row["dog_id"] = pick["id"] if pick else None
        matched += 1 if pick else 0
    return matched


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, default=None,
                        help="season year (defaults to the current year)")
    args = parser.parse_args()
    season = args.season or datetime.now(timezone.utc).year

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    html = get(URL)
    as_of = coverage_date(html)

    raw = html.encode(PAGE_ENCODING, errors="replace")
    target = RAW_DIR / f"{as_of}.html"
    digest = hashlib.sha256(raw).hexdigest()
    archived = False
    if not target.exists() or hashlib.sha256(
            target.read_bytes()).hexdigest() != digest:
        target.write_bytes(raw)
        archived = True

    everything = parse_rows(html)
    if not everything:
        raise TitleParseError("no title rows parsed — the page layout changed")

    rows = [r for r in everything if r["date"].startswith(f"{season}-")]
    for row in rows:
        row["program"] = program_of(row)
        # The section must agree with what the title itself implies; a
        # disagreement means a row was attributed to the wrong block.
        if row["program"] == "lci" and not row["section"].startswith("LCI"):
            raise TitleParseError(
                f"{row['call_name']}: LCI title under section {row['section']}")
        if row["program"] == "singles" and row["section"] != "Singles":
            raise TitleParseError(
                f"{row['call_name']}: Singles title under {row['section']}")
    rows.sort(key=lambda r: (r["date"], r["section"], r["call_name"]))

    matched = attach_dogs(rows)

    bundle = {
        "season": season,
        "as_of": as_of,
        "generated": datetime.now(timezone.utc).date().isoformat(),
        "source_url": URL,
        "stats": {
            "total": len(rows),
            "by_program": dict(Counter(r["program"] for r in rows)),
            "by_title": dict(Counter(r["title_abbr"] for r in rows)),
            "by_section": dict(Counter(r["section"] for r in rows)),
            "matched_to_profiles": matched,
        },
        "titles": rows,
    }
    OUTPUT.write_text(
        json.dumps(bundle, indent=2, ensure_ascii=False), encoding="utf-8")

    stats = bundle["stats"]
    print(
        f"{OUTPUT.relative_to(ROOT)}  season {season}, through {as_of}"
        f"{' (page archived)' if archived else ''}\n"
        f"  {stats['total']} titles: {stats['by_program']}\n"
        f"  {matched} linked to season profiles"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
