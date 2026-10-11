"""Fetch the WRA grading guide and the Registrar's Whippet Point Records, and
build the WRA whippet racing feed (Whippet racing, beta).

The Whippet Racing Association (whippetracing.org) keeps its records in a
database that prints, on request, the "Current WRA Grading Guide": every dog
on WRA's active list with its grade, average, the last three meets (a score
and a completion code each, no dates), CR points, WRCh points, national
points this year and lifetime, and a "LAST UPDATED" stamp the Registrar moves
as meets are verified. A second report lists the inactive dogs with the same
first eleven columns. WRA issues no registration numbers, so a dog's call
name is its only key.

WRA's own help sheet, "How to Find the Correct Points for Dogs on the WRA
Site", says the site's WRCh points and every title award it shows are wrong,
and that the Registrar's Whippet Point Records spreadsheet, posted as
Records/GradingGuide.pdf, is the record for CR levels, WRCh points and title
dates. So standings, grades and meets come from the reports, and titles and
WRCh points from the Point Records, joined by call name and confirmed by the
registered name or the owner. The Point Records fold NAWRA's titles into the
same columns (RCh with WRCh, SRCh with WRChX) since the 2017 merger.

This script archives a parsed snapshot under data/wra/snapshots/ whenever
the reports or the Point Records change, then rebuilds data/wra.json (the
dogs on WRA's active list) and data/wra-registry.json (every dog) from all
snapshots. The raw downloads stay out of git (data/wra/raw/). The site
publishes WRA's records at the WRA's invitation.

Usage:
    python tools/wra.py                    # fetch, archive if changed, rebuild
    python tools/wra.py --force            # archive even if unchanged
    python tools/wra.py --offline          # rebuild from the snapshots alone
"""

from __future__ import annotations

import argparse
import io
import re
import sys
from collections import Counter
from datetime import date

import requests
from bs4 import BeautifulSoup

from racing import (
    DATA, RacingParseError, build_movement, build_owners, compact_registry,
    derive_identity, fetch_bytes, load_snapshots, rank_by, redate_if_label_stale,
    sha256, slug, today, write_json, write_snapshot_if_changed,
)

ORG = "wra"
SITE_URL = "https://www.whippetracing.org"
ACTIVE_URL = f"{SITE_URL}/GradingGuide.cfm?rptType=3&dogStatus=1"
INACTIVE_URL = f"{SITE_URL}/GradingGuide.cfm?rptType=S&dogStatus=0"
RECORDS_URL = f"{SITE_URL}/Records/GradingGuide.pdf"
MEETS_URL = f"{SITE_URL}/MeetListDisplay.cfm"
REPORTS_PAGE = f"{SITE_URL}/ReportList.cfm"
RULES_URL = f"{SITE_URL}/Rules/2026Rules/2026-WRA-Rule-Book.pdf"
RAW_DIR = DATA / "wra" / "raw"
SNAPSHOT_DIR = DATA / "wra" / "snapshots"
FEED = DATA / "wra.json"
REGISTRY = DATA / "wra-registry.json"

BREED = "Whippet"
ACTIVE_HEADERS = [
    "Registered Name", "Call Name", "DQ dates", "Meets Run", "CR Pts", "WRCh Pts",
    "N Pts {year}", "N Pts L/T", "Owner", "Grd", "Avg",
    "Meet 1", "C/I", "Meet 2", "C/I", "Meet 3", "C/I",
]
INACTIVE_HEADERS = ACTIVE_HEADERS[:11]
RECORD_HEADERS = [
    "Registered Name", "Call Name", "SR/CR Pts", "CR Rank", "RCh/WRCh Pts", "RCh/WRCh",
    "SRCh/WRChX", "SRCh+/WRChX+", "C/Y Nats", "P/Y Nats", "L/T Nats", "Owner",
]
STAMP_RE = re.compile(r"LAST\s+UPDATED:\s*(\d{1,2})-(\d{1,2})-(\d{4})", re.IGNORECASE)
RECORDS_STAMP_RE = re.compile(r"updated\s+(\d{1,2})/(\d{1,2})/(\d{2,4})", re.IGNORECASE)
MEET_DATE_RE = re.compile(r"^(\d{1,2})-(\d{1,2})-(\d{4})\s*(\*{0,2})")
SHORT_DATE_RE = re.compile(r"(\d{1,2})/(\d{1,2})/(\d{2,4})")
DII_SUFFIX = " (DII)"

# Rule 7.5.1-7.5.2: CR at 15 race points from completed meets, CRX at 60 more,
# then CRX-II, CRX-III at every further 60. Rule 7.5.3: WRCh at 15 WRCh
# points. Rule 5.2: grades by average, A 15-29, B 10-14.9, C 4-9.9, D 0-3.9.
CR_POINTS = 15
CRX_STEP = 60
WRCH_POINTS = 15
ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII",
         "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"]

REGISTRY_COLUMNS = [
    "id", "breed_slug", "call_name", "registered_name", "note", "owner_raw", "dii",
    "avg", "grade", "cr", "wrch_site", "ytd", "lftm", "meets_run", "exempt", "rank_breed",
    "rank_all", "rank_career", "meets", "dq", "last_raced", "active", "sheet",
    "in_records", "cr_record", "cr_points", "wrch", "nat_record", "titles_record", "titled",
]


# ------------------------------------------------------------------- fetch

def fetch_all() -> dict[str, bytes]:
    """The four documents, one request each: about 4 MB a week."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    files = {}
    for name, url in (("active.html", ACTIVE_URL), ("inactive.html", INACTIVE_URL),
                      ("records.pdf", RECORDS_URL), ("meets.html", MEETS_URL)):
        data = fetch_bytes(url, timeout=120)
        (RAW_DIR / name).write_bytes(data)
        files[name] = data
        print(f"Fetched {url}  {len(data):,} bytes")
    if not files["records.pdf"].startswith(b"%PDF"):
        raise RacingParseError("The Point Records download is not a PDF")
    return files


# ------------------------------------------------------------------- parse

def _clean(text: str) -> str:
    text = text.replace("\xa0", " ").replace("&nbsp;", " ").replace("&nbsp", " ")
    return " ".join(text.split())


def _num(text: str) -> float | None:
    # A stray backtick or quote typed beside a figure ("15.000`") is the
    # spreadsheet's, not part of the number.
    text = _clean(text).strip("*`'\" ")
    if not text:
        return None
    try:
        return float(text)
    except ValueError as error:
        raise RacingParseError(f"not a number: {text!r}") from error


def _us_date(month: str, day: str, year: str, pivot: int) -> str:
    """M/D/YY or M/D/YYYY as ISO; a two-digit year above the pivot is 19xx."""
    y = int(year)
    if y < 100:
        y += 2000 if y <= pivot else 1900
    return date(y, int(month), int(day)).isoformat()


def parse_report(html: str, expected: list[str]) -> tuple[str, int, list[list[str]]]:
    """The stamp, the season the national-points column names, and the rows."""
    soup = BeautifulSoup(html, "html5lib")
    stamp = None
    header = None
    season = None
    rows: list[list[str]] = []
    for tr in soup.find_all("tr"):
        cells = [_clean(cell.get_text(" ")) for cell in tr.find_all(["td", "th"], recursive=False)]
        if not cells:
            continue
        if stamp is None:
            match = STAMP_RE.search(" ".join(cells))
            if match:
                month, day, year = match.groups()
                stamp = date(int(year), int(month), int(day)).isoformat()
                continue
        if header is None:
            if cells[:2] == ["Registered Name", "Call Name"]:
                header = cells
                year_match = re.fullmatch(r"N Pts (\d{4})", cells[6]) if len(cells) > 6 else None
                if not year_match:
                    raise RacingParseError(f"the national points header reads {cells[6:7]}")
                season = int(year_match.group(1))
                want = [h.format(year=season) for h in expected]
                if header != want:
                    raise RacingParseError(f"report headers {header} differ from {want}")
            continue
        if len(cells) == len(expected):
            rows.append(cells)
    if stamp is None or header is None:
        raise RacingParseError("no LAST UPDATED stamp or header row; the report layout changed")
    if not rows:
        raise RacingParseError("the report lists no dogs")
    return stamp, season, rows


def parse_dog(cells: list[str], sheet: str) -> dict:
    registered = cells[0]
    dii = registered.endswith(DII_SUFFIX)
    if dii:
        registered = registered[: -len(DII_SUFFIX)].rstrip()
    meets_run_raw = cells[3]
    meets_run_match = re.fullmatch(r"(\d+)(\*?)", meets_run_raw)
    if meets_run_raw and not meets_run_match:
        raise RacingParseError(f"{cells[1]}: Meets Run reads {meets_run_raw!r}")
    dq = []
    for token in cells[2].split():
        match = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", token)
        if not match:
            raise RacingParseError(f"{cells[1]}: DQ date {token!r}")
        dq.append(_us_date(match.group(1), match.group(2), match.group(3), 0))
    dog = {
        "call_name": cells[1],
        "registered_raw": registered,
        "dii": dii,
        "dq": dq,
        "meets_run": int(meets_run_match.group(1)) if meets_run_match else None,
        "exempt": bool(meets_run_match and meets_run_match.group(2)),
        "cr": _num(cells[4]),
        "wrch_site": _num(cells[5]),
        "ytd": _num(cells[6]),
        "lftm": _num(cells[7]),
        "owner_raw": cells[8],
        "grade": cells[9] or None,
        "avg": _num(cells[10]),
        "sheet": sheet,
    }
    if sheet == "active":
        meets = []
        for score_col in (11, 13, 15):
            status = cells[score_col + 1]
            if not status:
                continue   # no meet in that slot; the score is a 0.000 placeholder
            meets.append({"score": _num(cells[score_col]), "status": status})
        dog["meets"] = meets
    else:
        dog["meets"] = []
    return dog


def drop_reason(dog: dict) -> str | None:
    """WRA's database carries test dogs and duplicate records; they are counted,
    not published."""
    call, registered, owner = dog["call_name"], dog["registered_raw"], dog["owner_raw"]
    if not call or not registered:
        return "blank name"
    if call.upper().startswith("ZZZ") or "fictious" in owner.lower():
        return "test record"
    if re.match(r"^(DUPE|DUPLICATE)\b", call.upper()) or registered.upper().startswith("DUPLICATE"):
        return "marked duplicate"
    return None


def parse_records(raw: bytes) -> tuple[str, list[dict]]:
    """The Registrar's Whippet Point Records: the date it was updated and its rows."""
    import pdfplumber

    rows: list[dict] = []
    stamp = None
    with pdfplumber.open(io.BytesIO(raw)) as pdf:
        first = pdf.pages[0].extract_text() or ""
        match = RECORDS_STAMP_RE.search(first)
        if not match:
            raise RacingParseError("the Point Records carry no 'updated' date")
        pivot = date.today().year % 100
        stamp = _us_date(*match.groups(), pivot)
        for number, page in enumerate(pdf.pages, 1):
            for table in page.extract_tables():
                for row in table:
                    cells = [_clean(cell or "") for cell in row]
                    if cells and cells[0] == "Registered Name":
                        if [c.replace(" ", "") for c in cells] != [h.replace(" ", "") for h in RECORD_HEADERS]:
                            raise RacingParseError(f"Point Records headers changed: {cells}")
                        continue
                    if len(cells) != len(RECORD_HEADERS):
                        raise RacingParseError(f"Point Records page {number}: a row of {len(cells)} cells")
                    if not any(cells):
                        continue
                    plus = [_us_date(*m.groups(), pivot) for m in SHORT_DATE_RE.finditer(cells[7])]

                    def one_date(text: str) -> str | None:
                        found = SHORT_DATE_RE.search(text)
                        return _us_date(*found.groups(), pivot) if found else None

                    rank = cells[3].upper()
                    if rank and not re.fullmatch(r"R|X|\d{1,2}", rank):
                        raise RacingParseError(f"Point Records: CR rank {rank!r} for {cells[1]}")
                    # The Registrar types these by hand: a figure written
                    # "175.5+" or "Hol0" is kept as written beside no value.
                    odd: dict[str, str] = {}

                    def figure(field: str, text: str) -> float | None:
                        try:
                            return _num(text)
                        except RacingParseError:
                            odd[field] = text
                            return None

                    row = {
                        "registered": cells[0], "call": cells[1],
                        "cr_points": figure("cr_points", cells[2]), "cr_rank": rank or None,
                        "wrch_points": figure("wrch_points", cells[4]), "wrch_date": one_date(cells[5]),
                        "wrchx_date": one_date(cells[6]), "wrchx_plus": plus,
                        "cy": figure("cy", cells[8]), "py": figure("py", cells[9]), "lt": figure("lt", cells[10]),
                        "owner": cells[11],
                    }
                    if odd:
                        row["as_written"] = odd
                    rows.append(row)
    if len(rows) < 1000:
        raise RacingParseError(f"only {len(rows)} Point Records rows; the PDF layout changed")
    return stamp, rows


def parse_meets(html: str, season: int, stamp: str) -> list[str]:
    """This season's verified meet dates, up to the report's stamp. The list
    names clubs, venues and race secretaries; only the dates are kept."""
    soup = BeautifulSoup(html, "html5lib")
    dates = []
    for tr in soup.find_all("tr"):
        cells = [_clean(cell.get_text(" ")) for cell in tr.find_all(["td", "th"], recursive=False)]
        if not cells:
            continue
        match = MEET_DATE_RE.match(cells[0])
        if not match:
            continue
        month, day, year, marks = match.groups()
        when = date(int(year), int(month), int(day)).isoformat()
        if int(year) == season and marks and when <= stamp:
            dates.append(when)
    return sorted(dates)


# ----------------------------------------------------------- the join

def _key(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (text or "").lower())


def _surname(owner: str) -> str:
    return _key(owner.split(",")[0])


def _names_agree(a: str, b: str) -> bool:
    """Registered names agree on their opening: the PDF cuts long names short."""
    ka, kb = _key(a), _key(b)
    n = min(len(ka), len(kb), 16)
    return n >= 6 and ka[:n] == kb[:n]


def _same_name(a: str, b: str) -> bool:
    """The whole registered name, allowing for the PDF cutting a long one short."""
    ka, kb = _key(a), _key(b)
    if ka == kb:
        return len(ka) >= 8
    shorter = min(len(ka), len(kb))
    return shorter >= 20 and ka[:shorter] == kb[:shorter]


def _owner_agrees(dog_owner: str, record_owner: str) -> bool:
    surname = _surname(dog_owner)
    return bool(surname) and surname in _key(record_owner)


def join_records(dogs: list[dict], records: list[dict]) -> tuple[int, list[str]]:
    """Attach each dog's Point Records row: same call name, confirmed by the
    registered name or the owner; then, for the rest, the one unclaimed row
    with the same registered name and owner (the PDF's call name differs)."""
    by_call: dict[str, list[int]] = {}
    for index, record in enumerate(records):
        by_call.setdefault(_key(record["call"]), []).append(index)
    claimed: set[int] = set()
    for dog in dogs:
        dog["record"] = None
        for index in by_call.get(_key(dog["call_name"]), []):
            record = records[index]
            if index in claimed:
                continue
            if _names_agree(dog["registered_raw"], record["registered"]) or _owner_agrees(dog["owner_raw"], record["owner"]):
                dog["record"] = index
                claimed.add(index)
                break
    for dog in dogs:
        if dog["record"] is not None:
            continue
        # The PDF's call name differs ("Dub Dub" for "Wubba Lubba Dub Dub").
        # The same registered name and owner settle it; so does the very same
        # registered name alone when no other unclaimed row carries it (the
        # owner can be spelled "Leary" for O'Leary).
        found = [index for index, record in enumerate(records)
                 if index not in claimed and _names_agree(dog["registered_raw"], record["registered"])
                 and _owner_agrees(dog["owner_raw"], record["owner"])]
        if not found:
            found = [index for index, record in enumerate(records)
                     if index not in claimed and _same_name(dog["registered_raw"], record["registered"])]
        if len(found) == 1:
            dog["record"] = found[0]
            claimed.add(found[0])
    for dog in dogs:
        index = dog.pop("record")
        dog["record"] = {k: v for k, v in records[index].items() if k not in ("registered", "owner")} if index is not None else None
    unmatched = [dog["call_name"] for dog in dogs if dog["record"] is None and dog["sheet"] == "active"]
    return len(claimed), unmatched


# ------------------------------------------------------------------- snapshot

def parse_all(files: dict[str, bytes]) -> dict:
    active_html = files["active.html"].decode("utf-8", "replace")
    inactive_html = files["inactive.html"].decode("utf-8", "replace")
    stamp, season, active_rows = parse_report(active_html, ACTIVE_HEADERS)
    stamp_inactive, season_inactive, inactive_rows = parse_report(inactive_html, INACTIVE_HEADERS)
    if (stamp_inactive, season_inactive) != (stamp, season):
        print(f"Note: the inactive report is stamped {stamp_inactive}, the active one {stamp}.")
    records_date, records = parse_records(files["records.pdf"])
    meet_dates = parse_meets(files["meets.html"].decode("utf-8", "replace"), season, stamp)

    dogs: list[dict] = []
    dropped: list[dict] = []
    for sheet, rows in (("active", active_rows), ("inactive", inactive_rows)):
        for cells in rows:
            dog = parse_dog(cells, sheet)
            reason = drop_reason(dog)
            if reason:
                dropped.append({"sheet": sheet, "call_name": dog["call_name"], "reason": reason})
                continue
            dogs.append(dog)
    # The call name is WRA's only key; it never repeats across the two reports
    # as written (though "Dinah" and "Dina-H" are two dogs).
    counts = Counter(" ".join(dog["call_name"].lower().split()) for dog in dogs)
    repeated = [name for name, n in counts.items() if n > 1]
    if repeated:
        raise RacingParseError(f"call names listed twice: {repeated[:5]}")
    ids: set[str] = set()
    for dog in dogs:
        base = slug(dog["call_name"]) or "dog"
        dog_id, n = base, 1
        while dog_id in ids:
            n += 1
            dog_id = f"{base}-{n}"
        ids.add(dog_id)
        dog["id"] = dog_id
        dog["prefix"] = "W"
    matched, unmatched = join_records(dogs, records)

    return {
        "org": ORG,
        "guide_date": stamp,
        "guide_date_source": "report",
        "season": season,
        "records_date": records_date,
        "source_url": ACTIVE_URL,
        "source_page": REPORTS_PAGE,
        "records_url": RECORDS_URL,
        "source_file": "active.html",
        "sha256": sha256(files["active.html"]),
        "fetched": today(),
        "meet_dates": meet_dates,
        "records": {"rows": len(records), "matched": matched, "unmatched_active": unmatched},
        "dropped": dropped,
        "sections": [{"breed_raw": BREED, "prefixes": ["W"], "dogs": dogs}],
    }


# ------------------------------------------------------------------- build

def cr_titles(rank: str | None) -> list[str]:
    """The CR rank as the Registrar writes it: R = CR, X = CRX, 2 = CRX-II."""
    if not rank:
        return []
    if rank == "R":
        return ["CR"]
    if rank == "X":
        return ["CR", "CRX"]
    level = int(rank)
    return ["CR", "CRX"] + [f"CRX-{ROMAN[n]}" for n in range(2, level + 1)]


def record_titles(record: dict | None) -> list[list]:
    """[title, date or None] from the Point Records, in the order earned."""
    if not record:
        return []
    out = [[title, None] for title in cr_titles(record["cr_rank"])]
    if record["wrch_date"]:
        out.append(["WRCh", record["wrch_date"]])
    if record["wrchx_date"]:
        out.append(["WRChX", record["wrchx_date"]])
        for n, when in enumerate(record["wrchx_plus"], 2):
            out.append([f"WRChX-{ROMAN[n]}", when])
    return out


def titles_of(dog: dict) -> list[str]:
    return [title for title, _ in dog["titles_record"]]


def average(meets: list[dict]) -> float:
    """Rule 5.2: the mean of the completed meets among the last three; with
    none completed, the mean of the incomplete ones; with no meet, 0."""
    complete = [m["score"] for m in meets if m["complete"] and m["score"] is not None]
    if complete:
        return sum(complete) / len(complete)
    listed = [m["score"] for m in meets if m["score"] is not None]
    return sum(listed) / len(listed) if listed else 0.0


def grade_band(value: float | None) -> str | None:
    if value is None:
        return None
    return "A" if value >= 15 else "B" if value >= 10 else "C" if value >= 4 else "D"


def derive(snapshot: dict) -> list[dict]:
    dogs: list[dict] = []
    order = ["Latest meet", "Meet 2", "Meet 3"]
    for section in snapshot["sections"]:
        for raw in section["dogs"]:
            dog = {k: v for k, v in raw.items()}
            dog["breed"] = BREED
            dog["breed_slug"] = slug(BREED)
            derive_identity(dog)
            dog["meets"] = [
                {"code": order[i], "year": None, "date": None, "score": m["score"],
                 "complete": m["status"] == "C", "status": m["status"], "read": None}
                for i, m in enumerate(raw["meets"])
            ]
            dog["last_raced"] = None
            computed = average(dog["meets"])
            dog["avg_computed"] = round(computed, 6)
            dog["avg"] = round(dog["avg"], 6) if dog["avg"] is not None else None
            dog["avg_matches"] = dog["avg"] is not None and abs(dog["avg"] - computed) <= 0.01
            dog["titles_record"] = record_titles(dog["record"])
            record = dog["record"] or {}
            # Title points are the Registrar's: the report's CR column reads 0
            # for every WRCh holder, and WRA's help sheet calls its WRCh column
            # wrong. The report's own figures stay as cr and wrch_site.
            dog["in_records"] = bool(dog["record"])
            dog["cr_record"] = record.get("cr_points")
            # The CR points shown: the Registrar's, or the report's for a
            # whippet the Point Records do not list (none of those holds a
            # title or a WRCh point).
            dog["cr_points"] = dog["cr_record"] if dog["in_records"] else dog["cr"]
            dog["wrch"] = record.get("wrch_points")
            dog["nat_record"] = record.get("lt")
            cr_level = len(cr_titles(record.get("cr_rank")))
            dog["titled"] = {
                "cr": cr_level,
                "wrch": bool(record.get("wrch_date")),
                "wrchx": (1 + len(record.get("wrchx_plus") or [])) if record.get("wrchx_date") else 0,
            }
            dog["active"] = dog["sheet"] == "active"
            dog["dq"] = [["DQ", when] for when in raw["dq"]]
            dogs.append(dog)
    # One breed: the breed and overall standings are the same ranking.
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
                              ["avg", "cr", "lftm", "ytd"], titles_of)
    for dog in dogs:
        dog["movement"] = movement.get(dog["id"])

    active = [dog for dog in dogs if dog["active"]]
    owners = build_owners(active, ["ytd", "lftm"], "avg")
    leader = min((dog for dog in dogs if dog["rank_breed"] == 1),
                 key=lambda dog: dog["call_name"], default=None)
    sections = [{
        "breed": BREED, "slug": slug(BREED), "prefix": "W", "prefixes": ["W"],
        "section_raw": BREED, "registry": len(dogs),
        "active": len(active), "ytd": sum((dog["ytd"] or 0) > 0 for dog in dogs),
        "titled": sum(dog["titled"]["wrch"] for dog in dogs),
        "leader": {"id": leader["id"], "call_name": leader["call_name"], "ytd": leader["ytd"]} if leader else None,
    }]
    titles_since = [
        {"id": dog["id"], "call_name": dog["call_name"], "breed": BREED, "title": title,
         "since": dog["movement"]["since"]}
        for dog in active if dog["movement"] for title in dog["movement"]["new_titles"]
    ]
    titles_since.sort(key=lambda row: (row["call_name"], row["title"]))
    this_year = str(season)
    grades = Counter(dog["grade"] for dog in active)
    stats = {
        "hounds_registry": len(dogs),
        "hounds_duplicate_numbers": 0,
        "hounds_dropped": len(current["dropped"]),
        "hounds_active": len(active),
        "hounds_ytd": sum((dog["ytd"] or 0) > 0 for dog in dogs),
        "hounds_raced": None,          # the report dates no meets
        "breeds_raced": None,
        "hounds_dii": sum(dog["dii"] for dog in active),
        "grades_active": dict(sorted(grades.items(), key=lambda kv: str(kv[0]))),
        "titled_cr": sum(dog["titled"]["cr"] > 0 for dog in dogs),
        "titled_wrch": sum(dog["titled"]["wrch"] for dog in dogs),
        "titled_wrchx": sum(dog["titled"]["wrchx"] > 0 for dog in dogs),
        "wrch_this_year": sum(any(t == "WRCh" and (d or "").startswith(this_year) for t, d in dog["titles_record"]) for dog in dogs),
        "records_rows": current["records"]["rows"],
        "records_matched": current["records"]["matched"],
        "records_unmatched_active": len(current["records"]["unmatched_active"]),
        "breeds": 1,
        "breeds_active": 1,
        "breeds_ytd": 1 if any((dog["ytd"] or 0) > 0 for dog in dogs) else 0,
        "meets_this_year": len(current["meet_dates"]),
        "meets_listed": sum(len(dog["meets"]) for dog in dogs),
        "meets_undecoded": sum(len(dog["meets"]) for dog in dogs),
        "owners_active": len(owners),
        "wave_agreement": round(sum(dog["avg_matches"] for dog in active) / max(1, len(active)), 4),
    }

    feed_fields = [
        "id", "breed", "breed_slug", "call_name", "registered_name", "titles", "note",
        "owner_raw", "owners", "dii", "avg", "avg_matches", "grade", "cr", "wrch_site",
        "in_records", "cr_record", "cr_points", "wrch", "nat_record", "ytd", "lftm",
        "meets_run", "exempt",
        "titled", "titles_record", "rank_breed", "rank_all", "rank_career", "meets", "dq",
        "last_raced", "movement", "sheet",
    ]

    def pack_meets(dog: dict) -> list[list]:
        return [[m["code"], m["year"], m["date"], m["score"], m["complete"], m["status"], m["read"]]
                for m in dog["meets"]]

    def compact(dog: dict) -> dict:
        row = {field: dog.get(field) for field in feed_fields}
        if not dog["avg_matches"]:
            row["avg_computed"] = dog["avg_computed"]
        row["meets"] = pack_meets(dog)
        return row

    feed = {
        "org": ORG,
        "name": "WRA",
        "program": "whippet racing",
        "season": season,
        "guide_date": current["guide_date"],
        "guide_date_source": current["guide_date_source"],
        "records_date": current["records_date"],
        "previous_guide_date": previous["guide_date"] if previous else None,
        "generated": today(),
        "source_url": current["source_url"],
        "source_page": REPORTS_PAGE,
        "records_url": RECORDS_URL,
        "site_url": SITE_URL,
        "rules_url": RULES_URL,
        "snapshots": [snap["guide_date"] for snap in snapshots],
        "active_since": None,
        "stats": stats,
        "sections": sections,
        "dogs": [compact(dog) for dog in active],
        "owners": owners,
        "titles_since_previous": titles_since,
        "meet_columns": ["code", "year", "date", "score", "complete", "status", "read"],
        "dq_columns": ["code", "date"],
        "unmatched_records": current["records"]["unmatched_active"],
        "notes": [
            "Standings, grades, averages, CR points and national points are the WRA "
            "grading guide report's; titles and WRCh points are the Registrar's "
            "Whippet Point Records, which WRA's help sheet names as the record.",
            "The report lists each dog's last three adult meets as scores and "
            "completion codes (C completed; SCR, PSCR, DNF, DQ incomplete), newest "
            "first, with no dates; last_raced is therefore unknown.",
            "avg is recomputed per rule 5.2 (the mean of the completed meets, else "
            "of the incomplete ones, else 0); avg_matches flags the Registrar's figure "
            "where it differs, and the published figure is the one shown.",
            "Active means WRA's own active list. Test records and duplicate records in "
            "WRA's database are dropped and counted.",
        ],
    }

    dogs.sort(key=lambda dog: (dog["call_name"].lower(), dog["id"]))
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
    parser.add_argument("--offline", action="store_true",
                        help="rebuild the feed from archived snapshots without fetching")
    parser.add_argument("--raw", action="store_true",
                        help="re-parse the files already under data/wra/raw instead of fetching")
    args = parser.parse_args()

    if not args.offline:
        try:
            if args.raw:
                files = {name: (RAW_DIR / name).read_bytes()
                         for name in ("active.html", "inactive.html", "records.pdf", "meets.html")}
            else:
                files = fetch_all()
            snapshot = parse_all(files)
            snapshot = redate_if_label_stale(SNAPSHOT_DIR, snapshot, today())
            write_snapshot_if_changed(SNAPSHOT_DIR, snapshot, force=args.force)
        except requests.RequestException as error:
            if not list(SNAPSHOT_DIR.glob("*.json")):
                print(f"Could not fetch from WRA and no snapshot exists: {error}", file=sys.stderr)
                return 1
            print(f"Could not fetch from WRA; rebuilding from archived snapshots. {error}",
                  file=sys.stderr)

    snapshots = load_snapshots(SNAPSHOT_DIR)
    feed, registry = build(snapshots)
    feed_bytes = write_json(FEED, feed)
    registry_bytes = write_json(REGISTRY, registry)
    stats = feed["stats"]
    print(
        f"WRA grading guide {feed['guide_date']} (Point Records {feed['records_date']}): "
        f"{stats['hounds_registry']:,} whippets, {stats['hounds_active']:,} on the active list, "
        f"{stats['hounds_ytd']} with national points this year, {stats['meets_this_year']} meets "
        f"this year, {stats['titled_wrch']} WRCh, {stats['titled_cr']} CR, "
        f"{stats['hounds_dropped']} test or duplicate records dropped; Point Records matched "
        f"{stats['records_matched']:,} of {stats['records_rows']:,} rows, "
        f"{stats['records_unmatched_active']} active dogs without one; average agreement "
        f"{stats['wave_agreement']:.1%}"
    )
    print(f"Wrote {FEED.name} ({feed_bytes:,} bytes) and {REGISTRY.name} ({registry_bytes:,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
