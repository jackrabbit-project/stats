"""Fetch the Continental Whippet Alliance's standings and title lists and
build the CWA feed (Whippet racing, beta).

The Continental Whippet Alliance (continentalwhippetalliance.com) races and
shows whippets and recognises both. It publishes no grading guide: no meets,
averages or grades per whippet. What it does publish:

- this year's standings on a page per year (/2026-toptens), as Datawrapper
  charts, each titled with its own date and meet count ("2026 Racing
  Standings as of 7/31/2026 (30 Race Meets)"): Racing (NARX points), High
  Combined (HC wins) and Conformation (not used here: this site covers
  coursing and racing). Each chart serves its data as a tab-separated CSV;
- the all-time racing lists, every whippet with 50 or more NARX points from
  1991 to the end of last year, also split into dogs and bitches, as three
  tabs of one published Google Sheet (/all-time-racing);
- a Google Sheet per title (/titles): ARX, NARX (levels), SRA (levels),
  DPC, DPCX, HC, HCX (levels), TRP and TRPX, each holder with the date or
  year earned.

Nineteen downloads a week, a second or two apart: four pages from CWA's
own site (the standings index, this year's standings page, the titles page
and the all-time page, read for their links), then three charts from
Datawrapper and twelve sheets from Google.

A snapshot per standings date (the newest chart's date) is archived under
data/cwa/snapshots/; later fetches with the same date replace it as titles
are added. data/cwa.json is built from the newest snapshot. The raw
downloads stay out of git (data/cwa/raw/): CWA's pages carry a contact
address. CWA was among the whippet racing bodies the site was asked to add.

Usage:
    python tools/cwa.py               # fetch, archive if changed, rebuild
    python tools/cwa.py --raw         # re-parse the files under data/cwa/raw
    python tools/cwa.py --offline     # rebuild from the snapshots alone
    python tools/cwa.py --force       # archive even if unchanged
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import time
from collections import Counter
from datetime import date, datetime
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from names import split_titles
from racing import (
    DATA, USER_AGENT, VOLATILE_KEYS, RacingParseError, fetch_bytes, load_snapshots,
    sha256, slug, today, write_json,
)

ORG = "cwa"
SITE_URL = "https://www.continentalwhippetalliance.com"
INDEX_URL = f"{SITE_URL}/toptens"
TITLES_URL = f"{SITE_URL}/titles"
ALL_TIME_URL = f"{SITE_URL}/all-time-racing"
SHEET_CSV = "https://docs.google.com/spreadsheets/d/{id}/export?format=csv"
RAW_DIR = DATA / "cwa" / "raw"
SNAPSHOT_DIR = DATA / "cwa" / "snapshots"
FEED = DATA / "cwa.json"

# Google answers a library User-Agent on a sheet export with a sign-in page.
BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0 Safari/537.36"
)

# The titles, in CWA's own order, with their full names as CWA writes them.
TITLES = {
    "ARX": "Award of Racing Excellence",
    "NARX": "National Award of Racing Excellence",
    "SRA": "Superior Racing Award",
    "DPC": "Dual Purpose Champion",
    "DPCX": "Dual Purpose Champion Excellent",
    "HC": "High Combined",
    "HCX": "High Combined Excellent",
    "TRP": "Title of Racing Proficiency",
    "TRPX": "Title of Racing Proficiency Excellent",
}
RACING_TITLES = ("ARX", "NARX", "SRA", "TRP", "TRPX")
TITLE_COLUMNS = ["base", "title", "name", "earned", "year", "owners", "status", "dog"]

STANDINGS_LINK_RE = re.compile(r"^(\d{4}) (Mid-Year|Year-End) Standings$")
CHART_TITLE_RE = re.compile(
    r"(\d{4}) (High Combined|Racing|Conformation) Standings as of "
    r"(\d{1,2})/(\d{1,2})/(\d{4})(?:\s*\((\d+) Race Meets\))?", re.IGNORECASE)
CHART_KINDS = {"high combined": "high_combined", "racing": "racing", "conformation": "conformation"}
CHART_HEADERS = {
    "racing": ["Place", "NARX Points", "Call Name", "Reg Name", "Owner"],
    "high_combined": ["Place", "HC Wins", "Call Name", "Reg Name", "Owner"],
    "conformation": ["Place", "Placement Points", "Call Name", "Reg Name", "Owner"],
}
ALL_TIME_LISTS = {"All Time Top Race Whippets": "all", "All Time Top Race Dogs": "dogs",
                  "All Time Top Race Bitches": "bitches"}
ALL_TIME_PERIOD_RE = re.compile(r"(\d{4}) through ([A-Z][a-z]+ \d{1,2}, \d{4})")
LEVEL_RE = re.compile(r"^(NARX\d?|SRA\d?)\b|^High Combined Excellent(?: (\d+))?$")
# Prefix titles CWA writes run together ("CanCH"); the shared vocabulary
# knows them only as separate words.
EXTRA_PREFIXES = {"canch", "amch", "amcanch", "intch"}


# ------------------------------------------------------------------- fetch

def _get(url: str, browser: bool = False) -> bytes:
    return fetch_bytes(url, user_agent=BROWSER_USER_AGENT if browser else USER_AGENT, timeout=60)


def _soup(raw: bytes) -> BeautifulSoup:
    return BeautifulSoup(raw.decode("utf-8", "replace"), "html.parser")


def standings_link(index_html: bytes) -> tuple[int, str, str]:
    """The newest standings page on the index: (year, kind, absolute URL)."""
    for anchor in _soup(index_html).find_all("a"):
        match = STANDINGS_LINK_RE.match(" ".join(anchor.get_text(" ").split()))
        if match and anchor.get("href"):
            return int(match.group(1)), match.group(2), urljoin(SITE_URL, anchor["href"])
    raise RacingParseError("The standings index lists no Mid-Year or Year-End standings")


def chart_frames(page_html: bytes) -> list[tuple[str, str]]:
    """(chart URL, chart title) for each Datawrapper chart on a standings page."""
    frames = []
    for frame in _soup(page_html).find_all("iframe"):
        src = frame.get("src") or ""
        if "datawrapper.dwcdn.net" in src:
            frames.append((src if src.endswith("/") else src + "/", frame.get("title") or ""))
    if not frames:
        raise RacingParseError("The standings page carries no Datawrapper charts")
    return frames


def chart_name(src: str) -> str:
    """'https://datawrapper.dwcdn.net/q52Ij/3/' -> 'q52Ij-3'."""
    match = re.search(r"dwcdn\.net/([A-Za-z0-9]+)/(\d+)/", src)
    if not match:
        raise RacingParseError(f"Unexpected chart address {src}")
    return f"{match.group(1)}-{match.group(2)}"


def title_sheets(titles_html: bytes) -> dict[str, str]:
    """{code: sheet id} from the titles page's links, matched by their text."""
    sheets = {}
    for anchor in _soup(titles_html).find_all("a"):
        href = anchor.get("href") or ""
        match = re.search(r"docs\.google\.com/spreadsheets/d/([A-Za-z0-9_-]+)", href)
        text = " ".join(anchor.get_text(" ").split())
        code = re.search(r"\(([A-Z]+)\)\s*$", text)
        if match and code and code.group(1) in TITLES:
            sheets[code.group(1)] = match.group(1)
    missing = [code for code in TITLES if code not in sheets]
    if missing:
        raise RacingParseError(f"The titles page no longer links {missing}")
    return sheets


def all_time_tabs(page_html: bytes) -> list[tuple[str, str]]:
    """(gid, CSV URL) for each published tab on the all-time page."""
    tabs = []
    for frame in _soup(page_html).find_all("iframe"):
        src = frame.get("src") or ""
        match = re.search(r"(https://docs\.google\.com/spreadsheets/d/e/[A-Za-z0-9_-]+)/pubhtml\?gid=(\d+)", src)
        if match:
            tabs.append((match.group(2), f"{match.group(1)}/pub?gid={match.group(2)}&single=true&output=csv"))
    if len(tabs) < 3:
        raise RacingParseError(f"The all-time page shows {len(tabs)} sheet tabs, not three")
    return tabs


def fetch_all() -> dict[str, bytes]:
    """Every document, saved under data/cwa/raw/ by a fixed name."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    files: dict[str, bytes] = {}

    def keep(name: str, url: str, browser: bool = False) -> bytes:
        if files:
            time.sleep(1.5)
        data = _get(url, browser)
        (RAW_DIR / name).write_bytes(data)
        files[name] = data
        print(f"Fetched {url}  {len(data):,} bytes")
        return data

    _, _, page_url = standings_link(keep("index.html", INDEX_URL))
    page = keep("standings.html", page_url)
    for src, _title in chart_frames(page):
        keep(f"chart-{chart_name(src)}.csv", src + "dataset.csv")
    titles = keep("titles.html", TITLES_URL)
    for code, sheet in title_sheets(titles).items():
        keep(f"title-{code.lower()}.csv", SHEET_CSV.format(id=sheet), browser=True)
    for gid, url in all_time_tabs(keep("all-time.html", ALL_TIME_URL)):
        keep(f"all-time-{gid}.csv", url, browser=True)
    return files


# ------------------------------------------------------------------- parse

def _date(month: str, day: str, year: str) -> str:
    return date(int(year), int(month), int(day)).isoformat()


def _number(text: str) -> float:
    try:
        return float(text.replace(",", ""))
    except ValueError as error:
        raise RacingParseError(f"Not a number: {text!r}") from error


def parse_chart(raw: bytes, title: str) -> tuple[str, dict]:
    """One standings chart: its kind and {label, as_of, meets, rows}."""
    match = CHART_TITLE_RE.search(title)
    if not match:
        raise RacingParseError(f"Unexpected chart title {title!r}")
    kind = CHART_KINDS[match.group(2).lower()]
    reader = list(csv.reader(io.StringIO(raw.decode("utf-8-sig", "replace")), delimiter="\t"))
    header = [cell.strip() for cell in reader[0]] if reader else []
    if header != CHART_HEADERS[kind]:
        raise RacingParseError(f"{match.group(2)} chart columns changed: {header}")
    rows = []
    for cells in reader[1:]:
        cells = [cell.strip() for cell in cells]
        if not any(cells):
            continue
        if len(cells) != 5 or not cells[0].isdigit():
            raise RacingParseError(f"{match.group(2)} chart row reads {cells}")
        rows.append({"place": int(cells[0]), "points": _number(cells[1]), "call_name": cells[2],
                     "registered_name": cells[3], "owners": cells[4]})
    return kind, {
        "label": " ".join(title.split()),
        "season": int(match.group(1)),
        "as_of": _date(match.group(3), match.group(4), match.group(5)),
        "meets": int(match.group(6)) if match.group(6) else None,
        "rows": rows,
    }


def parse_all_time(raw: bytes) -> tuple[str, dict]:
    """One all-time tab: which list it is and {criteria, period, through, rows}."""
    reader = [[cell.strip() for cell in row] for row in csv.reader(io.StringIO(raw.decode("utf-8-sig", "replace")))]
    heading = reader[0][0] if reader and reader[0] else ""
    if heading not in ALL_TIME_LISTS:
        raise RacingParseError(f"Unexpected all-time list {heading!r}")
    period = next((m for row in reader[:6] for m in [ALL_TIME_PERIOD_RE.search(row[0] if row else "")] if m), None)
    if not period:
        raise RacingParseError(f"{heading}: no period line")
    through = datetime.strptime(period.group(2), "%B %d, %Y").date().isoformat()
    try:
        start = next(i for i, row in enumerate(reader) if row[:4] == ["Place", "Name", "Owners", "NARX Points"])
    except StopIteration as error:
        raise RacingParseError(f"{heading}: the column headers changed") from error
    rows = []
    for row in reader[start + 1:]:
        if not any(row):
            continue
        if len(row) < 4 or not row[0].isdigit():
            raise RacingParseError(f"{heading}: row reads {row[:4]}")
        rows.append({"place": int(row[0]), "name": " ".join(row[1].split()), "owners": row[2],
                     "points": _number(row[3])})
    return ALL_TIME_LISTS[heading], {"criteria": reader[1][0] if len(reader) > 1 else "",
                                     "period": period.group(0), "through": through, "rows": rows}


def _level(cell: str) -> str | None:
    """A level heading inside a title sheet: 'NARX4 (60-74 NARX points)' ->
    'NARX4'; 'High Combined Excellent 2' -> 'HCX2'."""
    match = LEVEL_RE.match(cell)
    if not match:
        return None
    if match.group(1):
        return match.group(1)
    return f"HCX{match.group(2) or ''}"


def parse_title_sheet(code: str, raw: bytes) -> list[dict]:
    """A title sheet's holders. Three layouts: number, name, date (ARX, TRP,
    DPC, DPCX); number, name, year (HC, HCX); number, year, name, owners
    (NARX, SRA, TRPX). Levels head their own blocks in NARX, SRA and HCX."""
    reader = [[" ".join(cell.split()) for cell in row] for row in csv.reader(io.StringIO(raw.decode("utf-8-sig", "replace")))]
    if not reader or not reader[0] or not reader[0][0].endswith(f"({code})"):
        raise RacingParseError(f"The {code} sheet opens {reader[0][:1] if reader else None}")
    level = code
    rows = []
    for row in reader[2:]:
        cells = row + [""] * (4 - len(row))
        if not any(cells):
            continue
        heading = _level(cells[0])
        if heading:
            level = heading
            continue
        if not cells[0].isdigit():
            raise RacingParseError(f"{code}: unexpected row {cells[:4]}")
        number = int(cells[0])
        name, earned, year, owners, status = "", None, None, None, None
        # "Ineligible 5/13/2012": CWA lists the whippet in sequence with a
        # date, but marks it ineligible for the title. Kept, flagged, and
        # left out of the title counts.
        ineligible = re.fullmatch(r"Ineligible (\d{1,2})/(\d{1,2})/(\d{2}|\d{4})", cells[2], re.IGNORECASE)
        if ineligible:
            # A few are typed with a two-digit year ("9/24/17"); CWA's
            # records start in 1991.
            month, day, yr = ineligible.groups()
            if len(yr) == 2:
                yr = str((1900 if int(yr) >= 90 else 2000) + int(yr))
            cells[2], status = f"{month}/{day}/{yr}", "ineligible"
        if re.fullmatch(r"\d{1,2}/\d{1,2}/\d{4}", cells[2]):
            name = cells[1]
            month, day, yr = cells[2].split("/")
            earned, year = _date(month, day, yr), int(yr)
        elif re.fullmatch(r"(19|20)\d\d", cells[2]):
            name, year = cells[1], int(cells[2])
        elif cells[2]:
            name, owners = cells[2], cells[3] or None
            # The year cell may carry the flag instead: "2013 Ineligible".
            flagged = re.fullmatch(r"((?:19|20)\d\d)\s+Ineligible", cells[1], re.IGNORECASE)
            if flagged:
                year, status = int(flagged.group(1)), "ineligible"
            elif re.fullmatch(r"(19|20)\d\d", cells[1]):
                year = int(cells[1])
            elif cells[1]:
                raise RacingParseError(f"{code}: year reads {cells[1]!r}")
        elif cells[1]:
            name = cells[1]
        if not name:
            continue   # a numbered slot with nobody in it
        rows.append({"number": number, "title": level, "name": name, "earned": earned,
                     "year": year, "owners": owners, "status": status})
    if not rows:
        raise RacingParseError(f"The {code} sheet lists nobody")
    return rows


def parse_all(files: dict[str, bytes]) -> dict:
    season, kind, page_url = standings_link(files["index.html"])
    standings = {}
    for src, title in chart_frames(files["standings.html"]):
        chart_kind, chart = parse_chart(files[f"chart-{chart_name(src)}.csv"], title)
        if chart_kind == "conformation":
            continue   # conformation alone is outside this site's scope
        chart["chart_url"] = src
        standings[chart_kind] = chart
    for needed in ("racing", "high_combined"):
        if needed not in standings:
            raise RacingParseError(f"The standings page has no {needed.replace('_', ' ')} chart")
    titles = {}
    for code, sheet in title_sheets(files["titles.html"]).items():
        titles[code] = {"sheet": sheet, "rows": parse_title_sheet(code, files[f"title-{code.lower()}.csv"])}
    all_time = {}
    for gid, _url in all_time_tabs(files["all-time.html"]):
        which, listing = parse_all_time(files[f"all-time-{gid}.csv"])
        listing["gid"] = gid
        all_time[which] = listing
    if set(all_time) != set(ALL_TIME_LISTS.values()):
        raise RacingParseError(f"All-time lists found: {sorted(all_time)}")
    return {
        "org": ORG,
        "guide_date": max(chart["as_of"] for chart in standings.values()),
        "guide_date_source": "chart",
        "season": season,
        "standings_kind": kind,
        "source_url": page_url,
        "sha256": sha256(files["standings.html"]),
        "fetched": today(),
        "standings": standings,
        "all_time": all_time,
        "titles": titles,
    }


def write_snapshot(snapshot: dict, force: bool = False) -> None:
    """Archive the parse unless it matches the newest snapshot (fetch-time
    keys aside); a change under the same standings date replaces that
    date's file, as titles are added between monthly charts."""
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)

    def stable(snap: dict) -> str:
        return json.dumps({k: v for k, v in snap.items() if k not in VOLATILE_KEYS},
                          sort_keys=True, ensure_ascii=False)

    existing = sorted(SNAPSHOT_DIR.glob("*.json"))
    if existing and not force:
        newest = json.loads(existing[-1].read_text(encoding="utf-8"))
        if stable(newest) == stable(snapshot):
            print(f"Unchanged since {existing[-1].name} - nothing archived.")
            return
    target = SNAPSHOT_DIR / f"{snapshot['guide_date']}.json"
    target.write_text(json.dumps(snapshot, ensure_ascii=False, indent=1) + "\n",
                      encoding="utf-8", newline="\n")
    print(f"Archived {target.name}")


# ------------------------------------------------------------------- build

def core_name(name: str) -> str:
    """The registered name without its titles, for grouping one whippet's
    rows across lists that print different titles after its name."""
    words = name.split()
    while words and words[0].lower().strip(".") in EXTRA_PREFIXES:
        words = words[1:]
    _prefix, core, _suffix = split_titles(" ".join(words))
    return core


def dog_id(name: str) -> str:
    return slug(core_name(name)) or slug(name)


def build(snapshots: list[dict]) -> dict:
    current = snapshots[-1]
    season = current["season"]
    dogs: dict[str, dict] = {}

    def seen(name: str, call_name: str | None = None) -> str:
        key = dog_id(name)
        entry = dogs.setdefault(key, {"id": key, "name": core_name(name) or name, "call_name": None})
        if call_name and not entry["call_name"]:
            entry["call_name"] = call_name
        return key

    standings = {}
    for kind, chart in current["standings"].items():
        rows = [{**row, "dog": seen(row["registered_name"], row["call_name"])} for row in chart["rows"]]
        standings[kind] = {**{k: v for k, v in chart.items() if k != "rows"}, "rows": rows}

    lists = current["all_time"]
    sex = {}
    for which, label in (("dogs", "dog"), ("bitches", "bitch")):
        for row in lists[which]["rows"]:
            sex[dog_id(row["name"])] = label
    all_time = {
        "criteria": lists["all"]["criteria"], "period": lists["all"]["period"],
        "through": lists["all"]["through"],
        "rows": [{**row, "sex": sex.get(dog_id(row["name"])), "dog": seen(row["name"])}
                 for row in lists["all"]["rows"]],
    }

    titles = []
    for code, sheet in current["titles"].items():
        for row in sheet["rows"]:
            titles.append({"base": code, **{k: row[k] for k in ("title", "name", "earned", "year", "owners", "status")},
                           "dog": seen(row["name"])})
    # Newest first: by year, then by date where the sheet gives one.
    titles.sort(key=lambda row: (row["base"], row["name"]))
    titles.sort(key=lambda row: (row["year"] or 0, row["earned"] or ""), reverse=True)

    awarded = [row for row in titles if row["status"] is None]
    this_year = [row for row in awarded if row["year"] == season]
    ordered = sorted(dogs.values(), key=lambda dog: (dog["name"].lower(), dog["id"]))
    index = {dog["id"]: position for position, dog in enumerate(ordered)}
    racing = standings["racing"]
    leader = min(racing["rows"], key=lambda row: (row["place"], row["call_name"]), default=None)
    stats = {
        "season": season,
        "racing_as_of": racing["as_of"],
        "racing_meets": racing["meets"],
        "racing_listed": len(racing["rows"]),
        "high_combined_as_of": standings["high_combined"]["as_of"],
        "high_combined_meets": standings["high_combined"]["meets"],
        "high_combined_listed": len(standings["high_combined"]["rows"]),
        "titles_total": len(awarded),
        "titles_ineligible": len(titles) - len(awarded),
        "titles_this_year": len(this_year),
        "titles_this_year_by_base": dict(Counter(row["base"] for row in this_year)),
        "title_holders": len({row["dog"] for row in awarded}),
        "arx_total": sum(row["base"] == "ARX" for row in awarded),
        "trp_total": sum(row["base"] == "TRP" for row in awarded),
        "dpc_total": sum(row["base"] == "DPC" for row in awarded),
        "all_time_listed": len(all_time["rows"]),
        "latest_title": max((row["earned"] for row in awarded if row["earned"]), default=None),
        "whippets": len(dogs),
        "leader": ({"dog": leader["dog"], "call_name": leader["call_name"], "points": leader["points"]}
                   if leader else None),
    }
    return {
        "org": ORG,
        "name": "CWA",
        "program": "whippet racing",
        "season": season,
        "guide_date": current["guide_date"],
        "guide_date_source": current["guide_date_source"],
        "generated": today(),
        "fetched": current["fetched"],
        "site_url": SITE_URL,
        "standings_url": current["source_url"],
        "titles_url": TITLES_URL,
        "all_time_url": ALL_TIME_URL,
        "snapshots": [snap["guide_date"] for snap in snapshots],
        "stats": stats,
        "title_names": TITLES,
        "racing_titles": list(RACING_TITLES),
        "standings": standings,
        "all_time": all_time,
        # Title rows packed as arrays (title_columns), the whippet as an index
        # into dogs: the list runs to a couple of thousand rows.
        "title_columns": TITLE_COLUMNS,
        "titles": [[row["base"], row["title"], row["name"], row["earned"], row["year"],
                    row["owners"], row["status"], index[row["dog"]]] for row in titles],
        "dogs": ordered,
        "notes": [
            "Standings are CWA's own charts, each with its own date and meet count; "
            "conformation standings are left out. Places are CWA's: ties share a place.",
            "Titles are CWA's title sheets as written: a holder's name carries the "
            "titles it held when the sheet was last edited.",
            "dog groups one whippet's rows across lists by its registered name without "
            "titles; names are shown as each list prints them.",
        ],
    }


# -------------------------------------------------------------------- main

def read_raw() -> dict[str, bytes]:
    return {path.name: path.read_bytes() for path in RAW_DIR.iterdir() if path.is_file()}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--force", action="store_true", help="archive even if unchanged")
    parser.add_argument("--offline", action="store_true",
                        help="rebuild the feed from archived snapshots without fetching")
    parser.add_argument("--raw", action="store_true",
                        help="re-parse the files already under data/cwa/raw instead of fetching")
    args = parser.parse_args()

    if not args.offline:
        try:
            files = read_raw() if args.raw else fetch_all()
            snapshot = parse_all(files)
            if args.raw:
                snapshot["fetched"] = date.fromtimestamp(
                    (RAW_DIR / "standings.html").stat().st_mtime).isoformat()
            write_snapshot(snapshot, force=args.force)
        except requests.RequestException as error:
            if not list(SNAPSHOT_DIR.glob("*.json")):
                print(f"Could not fetch from CWA and no snapshot exists: {error}", file=sys.stderr)
                return 1
            print(f"Could not fetch from CWA; rebuilding from archived snapshots. {error}",
                  file=sys.stderr)

    snapshots = load_snapshots(SNAPSHOT_DIR)
    feed = build(snapshots)
    size = write_json(FEED, feed)
    stats = feed["stats"]
    print(
        f"CWA standings {feed['guide_date']}: racing as of {stats['racing_as_of']} "
        f"({stats['racing_listed']} listed, {stats['racing_meets']} meets), High Combined as of "
        f"{stats['high_combined_as_of']} ({stats['high_combined_listed']} listed); "
        f"{stats['titles_total']:,} titles ({stats['titles_this_year']} in {stats['season']}), "
        f"{stats['all_time_listed']} on the all-time list, {stats['whippets']:,} whippets"
    )
    print(f"Wrote {FEED.name} ({size:,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
