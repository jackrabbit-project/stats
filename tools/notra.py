"""Fetch NOTRA's Other-Breed grading guide and build the NOTRA oval-racing feed.

The National Oval Track Racing Association (notra.org) sanctions oval racing
for Whippets and, under its own chapter of the rules, for the other sighthound
breeds. The Other-Breed Recorder publishes one workbook, the Other-Breed
grading guide (downloads/OBGradGuid.xlsx, with a PDF copy), "updated after
each meet" and linked from the home page with a "Current as of M/D/YYYY"
label. Two sheets carry the hounds, "Active 2022-2026" and "Inactive
2021-Prior", with the same columns: WAVE, DQ/OC/DNF counts, the legs toward
the Junior and Senior Oval Racer titles, ORC points, National (NORC) points
for this year, prior years and lifetime, and the last three meets as a score,
a status and a date. Two more sheets hold NOTRA's own Top 10 by breed and new
titles for the last two seasons; they are not read.

This script archives a parsed snapshot of each new guide under
data/notra/snapshots/, then rebuilds data/notra.json (active hounds,
standings, owners, movement) and data/notra-registry.json (every hound,
compact) from all snapshots. Whippets, whose guide has its own layout and
rules, are built by tools/notra_whippets.py.

Usage:
    python tools/notra.py                    # fetch, archive if changed, rebuild
    python tools/notra.py --force            # archive even if unchanged
    python tools/notra.py --seen YYYY-MM-DD  # first-seen day for a re-issued guide
    python tools/notra.py --file PATH --date YYYY-MM-DD
    python tools/notra.py --pdf PATH --date YYYY-MM-DD   # a guide posted as a PDF only
    python tools/notra.py --offline          # rebuild from the snapshots alone

A guide the recorder posts only as a PDF (the November 4, 2026 guide went to
the Facebook group, not the website) is the Active sheet printed from Excel:
its rows are read from the PDF, and the Inactive sheet, which the PDF does not
print, comes from the newest workbook on file.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import zipfile
from collections import Counter
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urljoin

import openpyxl
import requests

from racing import (
    DATA, RacingParseError, build_movement, build_owners, cell_num, cell_str,
    compact_registry, cumulative_titles, derive_identity, fetch_bytes, fetch_text,
    file_raw, grade, last_raced, load_snapshots, newest_snapshot, rank_by,
    redate_if_label_stale, sha256, slug, super_level, today, wave, write_json,
    write_snapshot_if_changed,
)

ORG = "notra"
SITE_URL = "https://www.notra.org"
GUIDE_PAGE = "https://www.notra.org/index.html"
DOWNLOADS_PAGE = "https://www.notra.org/Downloads.html"
RULES_URL = "https://www.notra.org/downloads/rulebk1.pdf"
# NOTRA's race calendar: a published Google Sheet embedded on this page.
CALENDAR_PAGE = "https://www.notra.org/RaceDates.html"
CALENDAR_SHEET_RE = re.compile(r'src="(https://docs\.google\.com/spreadsheets/d/e/[^"/]+)/pubhtml')
RAW_DIR = DATA / "notra" / "raw"
SNAPSHOT_DIR = DATA / "notra" / "snapshots"
FEED = DATA / "notra.json"
REGISTRY = DATA / "notra-registry.json"

GUIDE_HREF_RE = re.compile(r'href="([^"]*OBGradGuid\.xlsx?)"', re.IGNORECASE)
# "OB Grading Guide *Current as of 06/10/2026", month first as elsewhere on
# the site (the Whippet guide's label reads 9/24/2026).
LABEL_RE = re.compile(
    r"OB\s+Grading\s+Guide[^<]{0,40}?Current\s+as\s+of\s*(\d{1,2})/(\d{1,2})/(\d{2,4})",
    re.IGNORECASE,
)

# The registration-number prefix names the breed. NOTRA's letters are its own
# (BZ for Borzoi, SA for Saluki, IB for Ibizan Hound), and the Podengo Medio
# turns up as PP and PPm.
PREFIX_BREEDS = {
    "A": "Afghan Hound",
    "AZ": "Azawakh",
    "BA": "Basenji",
    "BZ": "Borzoi",
    "C": "Cirneco dell'Etna",
    "G": "Greyhound",
    "IB": "Ibizan Hound",
    "IG": "Italian Greyhound",
    "IW": "Irish Wolfhound",
    "MA": "Magyar Agar",
    "P": "Pharaoh Hound",
    "PP": "Portuguese Podengo Medio / Grande",
    "PPM": "Portuguese Podengo Medio / Grande",
    "PPP": "Portuguese Podengo Pequeno",
    "R": "Rhodesian Ridgeback",
    "SA": "Saluki",
    "SD": "Scottish Deerhound",
    "SL": "Sloughi",
    "SW": "Silken Windhound",
}

HEADERS = [
    "NRN", "CALL NAME", "WAVE", "DQ/OC/DNF", "FULL NAME", "OWNER", "JOR", "SOR",
    "ORC", "YTD NORC", "PRIOR NORC", "LFTM NORC",
    "REC", "SC-R", "DATE-R", "MID", "SC-M", "DATE-M", "OLD", "SC-O", "DATE-O",
]
MEET_COLUMNS = ((12, 13, 14), (15, 16, 17), (18, 19, 20))   # score, status, date

# A number as the recorder writes it (A-293, IW116, SW-225a: a re-used number
# gets a letter) or a hound still waiting for one: FTE (first time entered)
# and PEND (registration pending) rows, which NOTRA's own Top 10 lists rank
# alongside the numbered hounds.
NRN_RE = re.compile(r"^([A-Za-z]{1,3})-?(\d{1,4})([A-Za-z])?$")
PENDING_RE = re.compile(r"^([A-Za-z]{1,3})-(FTE|PEND)$", re.IGNORECASE)

# Rules, February 2025: 7.4 ORC at 12 ORC points for Other Breeds; 7.5 SORC
# at 30 NORC points and every 30 after; 7.3 Junior Oval Racer after four
# completed meets and Senior Oval Racer after six qualifying legs.
ORC_POINTS = 12
NATIONAL_STEP = 30
JOR_LEGS = 4
SOR_LEGS = 6
EARLIEST_MEET_YEAR = 1992   # NOTRA was formed in 1992

REGISTRY_COLUMNS = [
    "id", "breed_slug", "call_name", "registered_name", "note", "owner_raw", "wave",
    "grade", "orc", "ytd", "prior", "lftm", "jor", "sor", "faults", "rank_breed",
    "rank_all", "rank_career", "meets", "last_raced", "active", "sheet", "duplicate_of",
    "unnumbered",
]


# ------------------------------------------------------------------- fetch

def find_guide_url(html: str, page: str) -> str | None:
    match = GUIDE_HREF_RE.search(html)
    return urljoin(page, match.group(1)) if match else None


def find_label_date(html: str) -> date | None:
    match = LABEL_RE.search(html)
    if not match:
        return None
    month, day, year = (int(part) for part in match.groups())
    if year < 100:
        year += 2000
    return date(year, month, day)


def workbook_modified(path: Path) -> date | None:
    """The workbook's own last-saved date, the fallback when the page label is
    missing; the two agreed (June 10, 2026) when this was written."""
    try:
        with zipfile.ZipFile(path) as book:
            core = book.read("docProps/core.xml").decode("utf-8", "replace")
    except (zipfile.BadZipFile, KeyError):
        return None
    match = re.search(r"<dcterms:modified[^>]*>(\d{4}-\d{2}-\d{2})", core)
    return date.fromisoformat(match.group(1)) if match else None


def fetch() -> tuple[Path, date | None, str]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    home = fetch_text(GUIDE_PAGE)
    url = find_guide_url(home, GUIDE_PAGE) or find_guide_url(fetch_text(DOWNLOADS_PAGE), DOWNLOADS_PAGE)
    if not url:
        raise RacingParseError(
            f"No Other-Breed grading guide link on {GUIDE_PAGE} or {DOWNLOADS_PAGE}. "
            f"The site layout changed; look at it before trusting any parse."
        )
    raw = fetch_bytes(url)
    if not raw.startswith(b"PK"):
        raise RacingParseError("The guide download is not a workbook (no zip signature)")
    # Filed under its date once the date is settled (file_raw).
    target = RAW_DIR / "fetched.xlsx"
    target.write_bytes(raw)
    label = find_label_date(home)
    print(f"Fetched {url}  {len(raw):,} bytes; page label {label or 'not found'}")
    return target, label, url


def read_calendar() -> dict | None:
    """The days NOTRA's race calendar lists a meet the other breeds can run:
    every dated row that is not a Whippet-only meet and not cancelled. Only
    the dates are kept."""
    try:
        match = CALENDAR_SHEET_RE.search(fetch_text(CALENDAR_PAGE))
        if not match:
            print(f"No race calendar sheet on {CALENDAR_PAGE}; dates are read without it.")
            return None
        text = fetch_bytes(f"{match.group(1)}/pub?output=csv").decode("utf-8", "replace")
    except requests.RequestException as error:
        print(f"Could not read NOTRA's race calendar ({error}); dates are read without it.")
        return None
    days = set()
    for row in csv.DictReader(io.StringIO(text)):
        kind, notes = (row.get("Event type") or ""), (row.get("Notes") or "")
        found = re.fullmatch(r"\s*(\d{1,2})/(\d{1,2})/(\d{4})\s*", row.get("Date") or "")
        if not found or "cancel" in (kind + notes).lower() or kind.strip().lower() == "whippet":
            continue
        month, day, year = (int(part) for part in found.groups())
        try:
            days.add(date(year, month, day).isoformat())
        except ValueError:
            continue
    return {"source": CALENDAR_PAGE, "days": sorted(days)}


# --------------------------------------------------------------- PDF guide
#
# The PDF is the Active sheet printed from Excel: one row per line, each
# cell's text drawn as one run of characters, and the header framed by thin
# rectangles at the column edges. A run belongs to the cell its centre falls
# in; a long meet status that touches its score or its date (the narrow score
# column cannot hold "dnf1/2-scr3") is split where each part sits best
# centred in its own cell. Read against the June 10, 2026 guide, which NOTRA
# posted as both PDF and workbook, every cell agrees but three zero NORC
# figures the print leaves blank and the last row, which falls below the
# print area.

PDF_GAP = 1.0                  # points between characters of two different cells
PDF_SCORE_COLUMNS = {12, 15, 18}
PDF_DATE_COLUMNS = {14, 17, 20}
PDF_DATE_RE = re.compile(r"\d{1,2}/\d{1,2}/\d{2,4}")
PDF_NUMBER_RE = re.compile(r"\d+(?:\.\d+)?")


def _pdf_edges(page) -> list[float]:
    xs = sorted({round((r["x0"] + r["x1"]) / 2, 1)
                 for r in page.rects if r["width"] < 1.5 and r["height"] > 5})
    edges: list[float] = []
    for x in xs:
        if not edges or x - edges[-1] > 3:
            edges.append(x)
    return edges


def _pdf_column(x: float, edges: list[float]) -> int:
    if x < edges[0]:
        return 0
    return next((i for i in range(len(HEADERS)) if x < edges[i + 1]), len(HEADERS) - 1)


def _pdf_place(run: list[dict], edges: list[float]) -> list[tuple[int, str]]:
    text = "".join(c["text"] for c in run).strip()
    if not text:
        return []
    x0, x1 = min(c["x0"] for c in run), max(c["x1"] for c in run)
    crosses = [i for i in range(len(HEADERS)) if x0 < edges[i + 1] - 2 and x1 > edges[i + 1] + 2]
    if crosses and 12 <= crosses[0] < len(HEADERS) - 1:
        best = None
        for k in range(1, len(run)):
            left, right = run[:k], run[k:]
            left_text = "".join(c["text"] for c in left).strip()
            right_text = "".join(c["text"] for c in right).strip()
            if not left_text or not right_text:
                continue
            left_col = _pdf_column((left[0]["x0"] + left[-1]["x1"]) / 2, edges)
            right_col = _pdf_column((right[0]["x0"] + right[-1]["x1"]) / 2, edges)
            if right_col != left_col + 1 or left_col < 12:
                continue
            if right_col in PDF_DATE_COLUMNS and not PDF_DATE_RE.fullmatch(right_text):
                continue
            if left_col in PDF_SCORE_COLUMNS and not PDF_NUMBER_RE.fullmatch(left_text):
                continue
            error = sum(abs((part[0]["x0"] + part[-1]["x1"]) / 2 - (edges[col] + edges[col + 1]) / 2)
                        for part, col in ((left, left_col), (right, right_col)))
            if best is None or error < best[0]:
                best = (error, [(left_col, left_text), (right_col, right_text)])
        if best:
            return best[1]
    return [(_pdf_column((x0 + x1) / 2, edges), text)]


def read_pdf_rows(path: Path) -> list[list]:
    """The hound rows of a printed Active sheet, 21 cells each, as text."""
    import pdfplumber  # only a PDF-only guide needs it

    rows: list[list] = []
    with pdfplumber.open(path) as pdf:
        edges = _pdf_edges(pdf.pages[0])
        if len(edges) != len(HEADERS) + 1:
            raise RacingParseError(f"{path.name}: {len(edges) - 1} framed columns, not {len(HEADERS)}")
        for page in pdf.pages:
            if _pdf_edges(page) != edges:
                raise RacingParseError(f"{path.name} page {page.page_number}: the columns moved")
            # A row's characters can sit a fraction of a point apart in height.
            lines: dict[float, list[dict]] = {}
            for char in page.chars:
                top = next((t for t in lines if abs(t - char["top"]) < 2), char["top"])
                lines.setdefault(top, []).append(char)
            texts = {top: "".join(c["text"] for c in chars).replace(" ", "")
                     for top, chars in lines.items()}
            header = [top for top, text in texts.items() if text.startswith("NRNCALLNAME")]
            norc = [top for top, text in texts.items() if text.startswith("NORCNORC")]
            if not header or not norc:
                raise RacingParseError(f"{path.name} page {page.page_number}: no header rows")
            for top in sorted(lines):
                if top <= max(norc) or texts[top].startswith("Page"):
                    continue
                runs, run, previous = [], [], None
                for char in lines[top]:          # drawn cell by cell
                    if previous is not None and abs(char["x0"] - previous["x1"]) > PDF_GAP:
                        runs.append(run)
                        run = []
                    run.append(char)
                    previous = char
                runs.append(run)
                cells = [""] * len(HEADERS)
                for run in runs:
                    for column, text in _pdf_place(run, edges):
                        cells[column] = f"{cells[column]} {text}".strip()
                rows.append([cell or None for cell in cells])
    return rows


# ------------------------------------------------------------------- parse

def _norm_header(value) -> str:
    return re.sub(r"\s+", "", cell_str(value)).upper()


def find_header_row(rows: list[list]) -> int | None:
    for index, row in enumerate(rows[:12]):
        if _norm_header(row[0]) == "NRN" and _norm_header(row[1]) == "CALLNAME":
            return index
    return None


def meet_date(value) -> tuple[str | None, str]:
    """A meet's date as ISO and as published. The recorder types most dates
    (5/24/2026) and Excel holds the rest; a typo (5/24/2206, 9./14/2025)
    stays as text with no date."""
    if isinstance(value, datetime):
        value = value.date()
    if isinstance(value, date):
        return value.isoformat(), f"{value.month}/{value.day}/{value.year}"
    text = cell_str(value)
    match = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", text)
    if match:
        month, day, year = (int(part) for part in match.groups())
        if year < 100:
            year += 2000
        try:
            return date(year, month, day).isoformat(), text
        except ValueError:
            pass
    return None, text


def workbook_sheets(path: Path) -> list[tuple[str, list[list]]]:
    """Each sheet that opens with the guide's header row, rows below it."""
    book = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheets: list[tuple[str, list[list]]] = []
    for sheet in book.worksheets:
        rows = [list(row) for row in sheet.iter_rows(max_col=len(HEADERS), values_only=True)]
        header_index = find_header_row(rows)
        if header_index is None:
            continue
        found = [_norm_header(cell) for cell in rows[header_index]]
        expected = [_norm_header(h) for h in HEADERS]
        if found != expected:
            raise RacingParseError(
                f"sheet {sheet.title!r}: headers {found} differ from {expected}"
            )
        sheets.append((sheet.title, rows[header_index + 1:]))
    book.close()
    if not sheets:
        raise RacingParseError("no sheet opens with the NRN / CALL NAME header row")
    return sheets


def parse_workbook(path: Path, guide_date: date, date_source: str,
                   source_url: str | None = None) -> dict:
    return parse_sheets(workbook_sheets(path), guide_date, date_source, source_url,
                        path.name, path.read_bytes())


def parse_pdf(pdf_path: Path, workbook_path: Path, guide_date: date) -> dict:
    """A guide posted only as a PDF of the Active sheet. The Inactive sheet,
    which the PDF does not print, and any Active rows below the print area
    (June 10, 2026: the last row, SW-PEND Zula) come from the workbook."""
    printed = read_pdf_rows(pdf_path)
    if not printed:
        raise RacingParseError(f"{pdf_path.name}: no hound rows")
    # Excel prints ### for a number its column is too narrow to show (Lena's
    # and Emira's JOR on November 4, 2026): no value to read, so say which.
    hidden = [f"{row[0]} {row[1]} {HEADERS[i]}" for row in printed
              for i, cell in enumerate(row) if cell and set(cell) == {"#"}]
    if hidden:
        print(f"{len(hidden)} cell(s) print as ### and read as blank: {', '.join(hidden)}")
    sheets = workbook_sheets(workbook_path)
    active = next((i for i, (title, _) in enumerate(sheets)
                   if "active" in title.lower() and "inactive" not in title.lower()), None)
    if active is None:
        raise RacingParseError(f"{workbook_path.name}: no Active sheet to stand in for")
    title, rows = sheets[active]

    def key(row: list) -> tuple[str, str]:
        return cell_str(row[0]), cell_str(row[1])

    listed = [row for row in rows if any(cell_str(cell) for cell in row[:6])]
    at = next((i for i, row in enumerate(listed) if key(row) == key(printed[-1])), None)
    printed_keys = {key(row) for row in printed}
    below = [row for row in (listed[at + 1:] if at is not None else [])
             if key(row) not in printed_keys]
    sheets[active] = (title, printed + below)
    snapshot = parse_sheets(sheets, guide_date, "pdf", None, pdf_path.name, pdf_path.read_bytes())
    snapshot["workbook"] = {
        "file": workbook_path.name,
        "sha256": sha256(workbook_path.read_bytes()),
        "sheets": [name for name, _ in sheets if name != title],
        "rows_below_print": [f"{cell_str(row[0])} {cell_str(row[1])}" for row in below],
    }
    return snapshot


def parse_sheets(sheets: list[tuple[str, list[list]]], guide_date: date, date_source: str,
                 source_url: str | None, source_file: str, raw: bytes) -> dict:
    by_breed: dict[str, list[dict]] = {}
    numbered: dict[str, dict] = {}
    counts: Counter = Counter()
    dropped: list[dict] = []
    stray: list[list] = []
    for title, rows in sheets:
        lowered = title.lower()
        sheet_kind = "inactive" if "inactive" in lowered else "active" if "active" in lowered else title
        for row in rows:
            if not any(cell_str(cell) for cell in row[:6]):
                continue
            raw_id = cell_str(row[0])
            match = NRN_RE.match(raw_id)
            pending = PENDING_RE.match(raw_id)
            if match:
                prefix = match.group(1).upper()
                base = f"{prefix}-{int(match.group(2))}{(match.group(3) or '').upper()}"
            elif pending:
                prefix = pending.group(1).upper()
                base = f"{prefix}-{pending.group(2).upper()}"
            else:
                stray.append([cell_str(cell) for cell in row[:6]])
                continue
            if prefix not in PREFIX_BREEDS:
                raise RacingParseError(
                    f"unknown registration prefix {prefix!r} ({raw_id}) - add it to PREFIX_BREEDS"
                )
            call_name = cell_str(row[1])
            registered_raw = cell_str(row[4])
            if match and base in numbered:
                # The same hound on both sheets (moved to Active, left on
                # Inactive): one record, from the sheet that lists it first.
                first = numbered[base]
                if (first["call_name"].lower() == call_name.lower()
                        or first["registered_raw"].lower() == registered_raw.lower()):
                    dropped.append({"id": base, "sheet": sheet_kind, "call_name": call_name})
                    continue
            counts[base] += 1
            dog_id = base if counts[base] == 1 else f"{base}-{counts[base]}"
            meets = []
            for score_col, status_col, date_col in MEET_COLUMNS:
                score = cell_num(row[score_col])
                status = cell_str(row[status_col])
                when, when_raw = meet_date(row[date_col])
                if score is None and not status and not when_raw:
                    continue
                meets.append({"score": score, "status": status, "date": when, "date_raw": when_raw})
            dog = {
                "id": dog_id,
                "prefix": prefix,
                "sheet": sheet_kind,
                "call_name": call_name,
                "wave": cell_num(row[2]),
                "faults_raw": cell_str(row[3]),
                "registered_raw": registered_raw,
                "owner_raw": cell_str(row[5]),
                "jor": cell_num(row[6]),
                "sor": cell_num(row[7]),
                "orc": cell_num(row[8]),
                "ytd": cell_num(row[9]),
                "prior": cell_num(row[10]),
                "lftm": cell_num(row[11]),
                "meets": meets,
            }
            if raw_id != dog_id:
                dog["id_raw"] = raw_id
            if pending:
                dog["unnumbered"] = True
            if match and counts[base] > 1:
                dog["duplicate_of"] = base
            if match and counts[base] == 1:
                numbered[base] = dog
            by_breed.setdefault(PREFIX_BREEDS[prefix], []).append(dog)

    if stray:
        raise RacingParseError(
            f"{len(stray)} rows are neither hounds nor blank, e.g. {stray[:3]}"
        )
    if not by_breed:
        raise RacingParseError("no hounds found")

    sections = [
        {"breed_raw": breed, "prefixes": sorted({d["prefix"] for d in dogs}), "dogs": dogs}
        for breed, dogs in sorted(by_breed.items())
    ]
    return {
        "org": ORG,
        "guide_date": guide_date.isoformat(),
        "guide_date_source": date_source,
        "season": guide_date.year,
        "source_url": source_url,
        "source_page": GUIDE_PAGE,
        "source_file": source_file,
        "sha256": sha256(raw),
        "fetched": today(),
        "columns": HEADERS,
        "sheets": [title for title, _ in sheets],
        "dropped": dropped,
        "sections": sections,
    }


# ------------------------------------------------------------------- build

def titles_of(dog: dict) -> list[str]:
    """Titles the points and legs columns say the hound has reached."""
    titles = []
    if (dog.get("orc") or 0) >= ORC_POINTS:
        titles.append("ORC")
    titles.extend(cumulative_titles("SORC", super_level(dog.get("lftm"), NATIONAL_STEP)))
    if (dog.get("jor") or 0) >= JOR_LEGS:
        titles.append("JOR")
    if (dog.get("sor") or 0) >= SOR_LEGS:
        titles.append("SOR")
    return titles


def swap_day_month(iso: str) -> str | None:
    """The same date with day and month the other way round, when that is a
    date at all."""
    year, month, day = (int(part) for part in iso.split("-"))
    if day > 12:
        return None
    return date(year, day, month).isoformat()


def order_dates(meets: list[dict], guide_date: str) -> list[dict]:
    """The guide lists a hound's meets newest first. A date that reads either
    way round (1/3/2026: January 3 or March 1) and sits out of that order is
    read the other way round when that single change, and no other, puts the
    row back in order: 1/3/2026 listed above 8/2/2026 (February 8) is March 1.
    Rows the guide itself lists out of order (a Saturday after its Sunday)
    stay as written."""
    def in_order(dates: list[str | None]) -> bool:
        known = [when for when in dates if when]
        return all(newer >= older for newer, older in zip(known, known[1:]))

    dates = [meet["date"] for meet in meets]
    if in_order(dates):
        return meets
    fixes = []
    for index, meet in enumerate(meets):
        if not meet["date"] or meet["read"]:
            continue
        other = swap_day_month(meet["date"])
        if not other or other == meet["date"] or not (
                EARLIEST_MEET_YEAR <= int(other[:4]) and other <= guide_date):
            continue
        if in_order(dates[:index] + [other] + dates[index + 1:]):
            fixes.append((index, other))
    if len(fixes) == 1:
        index, other = fixes[0]
        meets[index] = {**meets[index], "date": other, "year": int(other[:4]), "read": "order"}
    return meets


def parse_faults(text: str) -> dict | None:
    """The DQ/OC/DNF column: three counts, disqualifications, off-course runs
    and did-not-finishes, as "0/1/2"."""
    match = re.fullmatch(r"\s*(\d+)\s*/\s*(\d+)\s*/\s*(\d+)\s*", text or "")
    if not match:
        return None
    dq, oc, dnf = (int(part) for part in match.groups())
    return {"dq": dq, "oc": oc, "dnf": dnf}


def derive(snapshot: dict) -> list[dict]:
    """Every hound in a snapshot with the site's derived fields and ranks."""
    season = snapshot["season"]
    guide_date = snapshot["guide_date"]
    calendar = set((snapshot.get("calendar") or {}).get("days", []))
    dogs: list[dict] = []
    for section in snapshot["sections"]:
        for raw in section["dogs"]:
            dog = dict(raw)
            dog["breed"] = section["breed_raw"]
            dog["breed_slug"] = slug(dog["breed"])
            derive_identity(dog)

            meets = []
            for meet in dog["meets"]:
                when, read = meet["date"], None
                # The recorder types month/day/year, and most cells stay text.
                # The cells Excel turned into dates include a few with day and
                # month the other way round: 12/4/2026 in a guide of June 10,
                # 2026, listed between a November and a May meet, is April 12.
                # A date that falls after the guide itself is read the other
                # way round when that lands it inside the guide; the page
                # shows the cell as written and says so.
                if when and when > guide_date:
                    swapped = swap_day_month(when)
                    if swapped and EARLIEST_MEET_YEAR <= int(swapped[:4]) and swapped <= guide_date:
                        when, read = swapped, "day/month"
                # Some of the November 4, 2026 guide's dates are typed day
                # first (4/7/2026 for SWEPT's July 4 meet). A date that is a
                # day on NOTRA's race calendar only the other way round is
                # read that way.
                elif when and calendar and when not in calendar:
                    swapped = swap_day_month(when)
                    if swapped and swapped in calendar and swapped <= guide_date:
                        when, read = swapped, "calendar"
                # A date the recorder mistyped (year 2206) is kept as written
                # and carries no year.
                if when and not (EARLIEST_MEET_YEAR <= int(when[:4]) and when <= guide_date):
                    when = None
                meets.append({
                    "code": meet["date_raw"] or "undated",
                    "year": int(when[:4]) if when else None,
                    "date": when,
                    "score": meet["score"],
                    "complete": meet["status"].lower() == "n",
                    "status": meet["status"],
                    "read": read,
                })
            dog["meets"] = order_dates(meets, guide_date)
            dog["last_raced"] = last_raced(dog["meets"])
            dog["faults"] = parse_faults(dog.pop("faults_raw"))

            computed = wave([(m["score"], m["complete"]) for m in meets])
            dog["wave_computed"] = round(computed, 6) if computed is not None else None
            dog["wave"] = round(dog["wave"], 6) if dog["wave"] is not None else None
            dog["wave_matches"] = (
                dog["wave"] is not None and computed is not None
                and abs(dog["wave"] - computed) <= 0.01
            )
            dog["grade"] = grade(dog["wave"])
            dog["titled"] = {
                "orc": (dog["orc"] or 0) >= ORC_POINTS,
                "sorc": super_level(dog["lftm"], NATIONAL_STEP),
                "jor": (dog["jor"] or 0) >= JOR_LEGS,
                "sor": (dog["sor"] or 0) >= SOR_LEGS,
            }
            dog["active"] = bool(
                (dog["ytd"] or 0) > 0
                or any(m["year"] is not None and m["year"] >= season - 1 for m in meets)
            )
            dogs.append(dog)

    # Standings: this season's National points within the breed and across
    # breeds, the figure NOTRA's own Top 10 by breed ranks; lifetime National
    # points across the whole registry.
    for breed in {dog["breed"] for dog in dogs}:
        rank_by([dog for dog in dogs if dog["breed"] == breed], "ytd", "rank_breed")
    rank_by(dogs, "ytd", "rank_all")
    rank_by(dogs, "lftm", "rank_career")
    return dogs


def build(snapshots: list[dict]) -> tuple[dict, dict]:
    current = snapshots[-1]
    previous = snapshots[-2] if len(snapshots) > 1 else None
    season = current["season"]

    dogs = derive(current)
    prior_dogs = derive(previous) if previous else None
    movement = build_movement(
        dogs, prior_dogs, previous["guide_date"] if previous else None,
        ["wave", "orc", "lftm", "ytd"], titles_of,
    )
    for dog in dogs:
        dog["movement"] = movement.get(dog["id"])

    active = [dog for dog in dogs if dog["active"]]
    owners = build_owners(active, ["ytd", "lftm"], "wave")

    sections = []
    for breed in sorted({dog["breed"] for dog in dogs}):
        members = [dog for dog in dogs if dog["breed"] == breed]
        prefixes = sorted({dog["prefix"] for dog in members})
        leader = min(
            (dog for dog in members if dog["rank_breed"] == 1),
            key=lambda dog: dog["call_name"], default=None,
        )
        sections.append({
            "breed": breed,
            "slug": slug(breed),
            "prefix": prefixes[0],
            "prefixes": prefixes,
            "section_raw": breed,
            "registry": len(members),
            "active": sum(dog["active"] for dog in members),
            "ytd": sum((dog["ytd"] or 0) > 0 for dog in members),
            "titled": sum(dog["titled"]["orc"] for dog in members),
            "leader": {
                "id": leader["id"], "call_name": leader["call_name"],
                "ytd": leader["ytd"],
            } if leader else None,
        })

    # Meets are dated, not coded, so two meets on one day count as one.
    meets_this_year = {
        m["date"] for dog in dogs for m in dog["meets"] if m["year"] == season
    }
    titles_since = [
        {"id": dog["id"], "call_name": dog["call_name"], "breed": dog["breed"],
         "title": title, "since": dog["movement"]["since"]}
        for dog in active if dog["movement"]
        for title in dog["movement"]["new_titles"]
    ]
    titles_since.sort(key=lambda row: (row["breed"], row["call_name"], row["title"]))

    stats = {
        "hounds_registry": len(dogs),
        "hounds_duplicate_numbers": sum("duplicate_of" in dog for dog in dogs),
        "hounds_unnumbered": sum(dog.get("unnumbered", False) for dog in dogs),
        "hounds_dropped": len(current.get("dropped", [])),
        "hounds_active": len(active),
        "hounds_ytd": sum((dog["ytd"] or 0) > 0 for dog in dogs),
        "hounds_raced": sum(any(m["year"] == season for m in dog["meets"]) for dog in dogs),
        "breeds_raced": len({dog["breed"] for dog in dogs
                             if any(m["year"] == season for m in dog["meets"])}),
        "titled_orc": sum(dog["titled"]["orc"] for dog in dogs),
        "titled_sorc": sum(dog["titled"]["sorc"] > 0 for dog in dogs),
        "titled_jor": sum(dog["titled"]["jor"] for dog in dogs),
        "titled_sor": sum(dog["titled"]["sor"] for dog in dogs),
        "breeds": len(sections),
        "breeds_active": sum(section["active"] > 0 for section in sections),
        "breeds_ytd": sum(section["ytd"] > 0 for section in sections),
        "meets_this_year": len(meets_this_year),
        "meets_listed": sum(len(dog["meets"]) for dog in dogs),
        "meets_undecoded": sum(m["year"] is None for dog in dogs for m in dog["meets"]),
        "owners_active": len(owners),
        # Over hounds with meets listed: an inactive hound keeps its WAVE
        # after the recorder clears its meets, so nothing recomputes for it.
        "wave_agreement": round(
            sum(dog["wave_matches"] for dog in dogs if dog["wave"] is not None and dog["meets"])
            / max(1, sum(dog["wave"] is not None and bool(dog["meets"]) for dog in dogs)), 4),
    }

    feed_dog_fields = [
        "id", "breed", "breed_slug", "call_name", "registered_name", "titles",
        "note", "owner_raw", "owners", "wave", "wave_matches", "grade", "orc",
        "ytd", "prior", "lftm", "jor", "sor", "faults", "titled", "rank_breed",
        "rank_all", "rank_career", "meets", "last_raced", "movement", "sheet",
        "duplicate_of", "unnumbered",
    ]

    def pack_meets(dog: dict) -> list[list]:
        return [[m["code"], m["year"], m["date"], m["score"], m["complete"], m["status"], m["read"]]
                for m in dog["meets"]]

    def compact_dog(dog: dict) -> dict:
        row = {field: dog.get(field) for field in feed_dog_fields}
        for optional in ("duplicate_of", "unnumbered"):
            if row[optional] is None:
                del row[optional]
        if not dog["wave_matches"] and dog["wave_computed"] is not None:
            row["wave_computed"] = dog["wave_computed"]
        row["meets"] = pack_meets(dog)
        return row

    feed = {
        "org": ORG,
        "name": "NOTRA",
        "program": "oval racing",
        "season": season,
        "guide_date": current["guide_date"],
        "guide_date_source": current["guide_date_source"],
        "previous_guide_date": previous["guide_date"] if previous else None,
        "generated": today(),
        "source_url": current["source_url"],
        "source_page": GUIDE_PAGE,
        "site_url": SITE_URL,
        "rules_url": RULES_URL,
        # A guide posted only as a PDF: where, and the workbook its Inactive
        # sheet comes from.
        "pdf": ({"posted_in": current.get("posted_in"),
                 "workbook_date": Path(current["workbook"]["file"]).stem}
                if current["guide_date_source"] == "pdf" else None),
        "calendar_url": (current.get("calendar") or {}).get("source"),
        "snapshots": [snap["guide_date"] for snap in snapshots],
        "active_since": f"{season - 1}-01-01",
        "stats": stats,
        "sections": sections,
        "dogs": [compact_dog(dog) for dog in active],
        "owners": owners,
        "titles_since_previous": titles_since,
        "meet_columns": ["code", "year", "date", "score", "complete", "status", "read"],
        "notes": [
            "Other Breeds only: NOTRA's Whippet guide, with its own layout and "
            "rules, is built separately (tools/notra_whippets.py).",
            "Standings rank this season's National points (the guide's YTD NORC "
            "column) within each breed and across breeds; career standings rank "
            "lifetime National points (LFTM NORC).",
            "WAVE is recomputed from the last three listed meets per NOTRA Rules "
            "4.2.2, counting a meet as complete when its status is n; "
            "wave_matches is false where the recorder's published figure "
            "differs, and the published figure is the one shown. "
            "wave_agreement is measured over hounds with meets listed.",
            "Titles follow the points and legs columns: ORC at 12 ORC points "
            "(rule 7.4), SORC at every 30 lifetime National points (7.5), JOR "
            "after four completed meets and SOR after six legs (7.3).",
            "Meets are dated rather than coded; code is the date cell as written. "
            "A date cell that falls after the guide itself is read with day and "
            "month the other way round when that lands it inside the guide "
            "(12/4/2026 as April 12, read = day/month). The guide lists a hound's "
            "meets newest first, so a date that reads either way round and sits out "
            "of that order is read the other way round when that single change puts "
            "the row back in order (1/3/2026 above February 8 is March 1, read = "
            "order). A date the recorder mistyped (5/24/2206) is kept as written "
            "and counts as undated. FTE "
            "and PEND rows are hounds without a race number yet; they keep those "
            "labels as their ids, numbered -2, -3 in sheet order.",
        ],
    }

    dogs.sort(key=lambda dog: (dog["breed"], dog["call_name"], dog["id"]))
    registry_rows = []
    for dog in dogs:
        row = dict(dog)
        row["meets"] = pack_meets(dog)
        registry_rows.append(row)
    registry = {
        "org": ORG,
        "guide_date": current["guide_date"],
        "season": season,
        **compact_registry(registry_rows, REGISTRY_COLUMNS),
    }
    return feed, registry


def newest_guide() -> dict | None:
    newest = newest_snapshot(SNAPSHOT_DIR)
    return json.loads(newest.read_text(encoding="utf-8")) if newest else None


def without_calendar(snapshot: dict) -> dict:
    return {k: v for k, v in snapshot.items()
            if k not in ("calendar", "fetched", "sha256", "source_url", "source_file")}


def guide_content(snapshot: dict) -> dict:
    """What a guide says: no calendar, per-fetch keys or date."""
    return {k: v for k, v in without_calendar(snapshot).items()
            if k not in ("guide_date", "guide_date_source", "season")}


def retire_pdf_readings() -> None:
    """A guide read from its PDF stands in until NOTRA posts the workbook.
    Once a workbook guide of the same date or later is the newest on file,
    the PDF reading goes: the workbook carries the same guide in full
    (November 5, 2026's carried November 4's), and leaving the PDF's rounded
    figures as the previous guide would make movement and new titles out of
    rounding and print blanks."""
    newest = newest_guide()
    if newest is None or newest["guide_date_source"] == "pdf":
        return
    for path in sorted(SNAPSHOT_DIR.glob("*.json")):
        kept = json.loads(path.read_text(encoding="utf-8"))
        if kept["guide_date_source"] == "pdf" and kept["guide_date"] <= newest["guide_date"]:
            path.unlink()
            print(f"Retired {path.name}, the PDF reading of a guide whose workbook "
                  f"({newest['guide_date']}) is now on file.")


def older_guide_on_file(snapshot: dict) -> bool:
    """The website's guide is older than the newest one archived (a guide
    posted only as a PDF) and says just what its own snapshot says: keep it
    from being re-dated as new and displacing the newer guide."""
    newest = newest_snapshot(SNAPSHOT_DIR)
    same_day = SNAPSHOT_DIR / f"{snapshot['guide_date']}.json"
    if newest is None or not same_day.exists() or newest == same_day:
        return False
    kept = json.loads(same_day.read_text(encoding="utf-8"))
    return without_calendar(kept) == without_calendar(snapshot)


# -------------------------------------------------------------------- main

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--force", action="store_true",
                        help="archive even if the guide is unchanged")
    parser.add_argument("--file", type=Path,
                        help="parse this workbook instead of fetching (needs --date)")
    parser.add_argument("--pdf", type=Path,
                        help="parse a guide posted only as a PDF (needs --date); the Inactive "
                             "sheet comes from the newest workbook in data/notra/raw")
    parser.add_argument("--posted-in", default="NOTRA's Facebook group",
                        help="where the PDF was posted, as the site should say it")
    parser.add_argument("--date", type=date.fromisoformat,
                        help="the guide's date, when it cannot be read from the home page")
    parser.add_argument("--offline", action="store_true",
                        help="rebuild the feed from archived snapshots without fetching")
    parser.add_argument("--seen", type=lambda text: date.fromisoformat(text).isoformat(),
                        help="the day a changed guide under an unmoved label was first "
                             "seen (default: today, UTC)")
    args = parser.parse_args()

    if args.pdf:
        if not args.date:
            parser.error("--pdf needs --date, the guide's own date")
        workbooks = sorted(RAW_DIR.glob("*.xlsx"))
        if not workbooks:
            parser.error(f"--pdf needs a workbook in {RAW_DIR} for the Inactive sheet")
        snapshot = parse_pdf(args.pdf, workbooks[-1], args.date)
        snapshot["posted_in"] = args.posted_in
        snapshot["calendar"] = read_calendar()
        print(f"Read {args.pdf.name}: Inactive sheet from {workbooks[-1].name}; "
              f"{len(snapshot['workbook']['rows_below_print'])} row(s) below the print area kept")
        write_snapshot_if_changed(SNAPSHOT_DIR, snapshot, force=args.force)
    elif not args.offline:
        try:
            if args.file:
                if not args.date:
                    parser.error("--file needs --date, the guide has no date cell of its own")
                path, guide_date, source, source_url = args.file, args.date, "cli", None
            else:
                path, label, source_url = fetch()
                if args.date:
                    guide_date, source = args.date, "cli"
                elif label:
                    guide_date, source = label, "page"
                else:
                    guide_date, source = workbook_modified(path), "workbook"
                    if guide_date is None:
                        raise RacingParseError("no 'Current as of' label and no workbook date; pass --date")
                saved = workbook_modified(path)
                if saved and label and abs((saved - label).days) > 14:
                    print(f"Note: the page label says {label} but the workbook was saved {saved}.")
            snapshot = parse_workbook(path, guide_date, source, source_url)
            if older_guide_on_file(snapshot):
                print(f"notra.org still carries the guide of {snapshot['guide_date']}, which is "
                      f"on file; a newer guide is archived. Nothing archived.")
                if not args.file:
                    path.unlink(missing_ok=True)
            else:
                kept = newest_guide()
                # An unchanged guide keeps the race calendar it was read
                # against, so the comparisons below see only the guide.
                if kept and guide_content(kept) == guide_content(snapshot):
                    snapshot["calendar"] = kept.get("calendar")
                # The workbook of a guide first read from its PDF is that
                # guide: it is not re-dated against the PDF reading.
                if source != "cli" and not (kept and kept["guide_date_source"] == "pdf"
                                            and snapshot["guide_date"] >= kept["guide_date"]):
                    snapshot = redate_if_label_stale(SNAPSHOT_DIR, snapshot, args.seen or today())
                # A guide that says anything new is read against the race
                # calendar of the day.
                if "calendar" not in snapshot:
                    snapshot["calendar"] = read_calendar()
                if not args.file:
                    file_raw(path, snapshot)
                write_snapshot_if_changed(SNAPSHOT_DIR, snapshot, force=args.force)
            retire_pdf_readings()
        except requests.RequestException as error:
            if not list(SNAPSHOT_DIR.glob("*.json")):
                print(f"Could not fetch the NOTRA guide and no snapshot exists: {error}",
                      file=sys.stderr)
                return 1
            print(f"Could not fetch the NOTRA guide; rebuilding from archived "
                  f"snapshots. {error}", file=sys.stderr)

    snapshots = load_snapshots(SNAPSHOT_DIR)
    feed, registry = build(snapshots)
    feed_bytes = write_json(FEED, feed)
    registry_bytes = write_json(REGISTRY, registry)

    stats = feed["stats"]
    print(
        f"NOTRA Other-Breed guide {feed['guide_date']}: {stats['hounds_registry']:,} hounds in "
        f"{stats['breeds']} breeds ({stats['hounds_unnumbered']} unnumbered, "
        f"{stats['hounds_dropped']} listed twice), {stats['hounds_active']:,} active, "
        f"{stats['hounds_ytd']} with points this year, "
        f"{stats['titled_orc']} ORC, {stats['titled_sorc']} SORC, "
        f"{stats['titled_jor']} JOR, {stats['titled_sor']} SOR, "
        f"WAVE agreement {stats['wave_agreement']:.1%}, "
        f"{stats['meets_undecoded']} undated meets"
    )
    print(f"Wrote {FEED.name} ({feed_bytes:,} bytes) and "
          f"{REGISTRY.name} ({registry_bytes:,} bytes)")

    top = Counter()
    for owner in feed["owners"]:
        top[f"{owner['key']}  <-  {owner['name']}"] = owner["hounds"]
    print("Busiest owner keys:")
    for line, hounds in top.most_common(10):
        print(f"  {hounds:3d}  {line}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
