"""Shared helpers for the LGRA and AOK9 grading-guide pipelines.

Neither racing body publishes race-by-race results. What each publishes is one
spreadsheet, the "grading guide", that race secretaries use to seed the first
program of a meet: every registered hound with its WAVE (a weighted average of
its last three meets), its championship and National points, and the codes of
those three meets. tools/lgra.py and tools/aok9.py turn the two guides into
the site's feeds; everything the two have in common lives here.

The rules the arithmetic follows:

* WAVE (LGRA Rule Book 23.2 §4.2.2, AOK9 Sprint Rule Book 3.0 §4.2.2):
  [(meet 1) + 0.7 (meet 2) + 0.5 (meet 3)] / 2.2 over the last three complete
  meets, meet 1 the most recent; two complete meets divide by 1.7; one is the
  score itself; when every listed meet is incomplete, the plain mean.
* Grades (§4.2.2.5 in both): A 11 and up, B 8 to 10.999, C 5.5 to 7.999,
  D below 5.5.
* Superior / Supreme titles accrue in 30-point steps of National points.

Nothing here does I/O against the network or writes files on import.
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests

from names import collapse, slugify, split_owners, split_titles

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

# Identify the project rather than impersonating a browser, as fetch.py does.
USER_AGENT = (
    "gazehound-stats/1.0 (unofficial lure coursing and racing statistics site; "
    "+https://github.com/jackrabbit-project/stats)"
)

# Keys that change on every fetch without the guide itself changing.
VOLATILE_KEYS = ("fetched", "sha256", "source_url", "source_file")

ID_RE = re.compile(r"^([A-Z]{1,8})-{0,2}(\d+)$")


class RacingParseError(RuntimeError):
    """The workbook no longer looks the way the parser expects.

    Raised instead of guessing: a silently half-parsed guide would publish
    wrong standings under a hound's name.
    """


# ---------------------------------------------------------------- arithmetic

def wave(meets: list[tuple[float | None, bool]]) -> float | None:
    """Weighted average of up to three meets, most recent first.

    Each meet is (score, complete). Incomplete meets are skipped, as the rule
    says, unless every listed meet is incomplete.
    """
    listed = [(score, complete) for score, complete in meets if score is not None]
    if not listed:
        return None
    complete = [score for score, done in listed if done]
    if len(complete) >= 3:
        return (complete[0] + 0.7 * complete[1] + 0.5 * complete[2]) / 2.2
    if len(complete) == 2:
        return (complete[0] + 0.7 * complete[1]) / 1.7
    if len(complete) == 1:
        return complete[0]
    return sum(score for score, _ in listed) / len(listed)


def grade(value: float | None) -> str | None:
    if value is None:
        return None
    if value >= 11:
        return "A"
    if value >= 8:
        return "B"
    if value >= 5.5:
        return "C"
    return "D"


def super_level(points: float | None, step: int = 30) -> int:
    """How many 30-point Superior/Supreme increments a points total has reached."""
    if not points or points <= 0:
        return 0
    return int(points // step)


ROMAN = ["", "", " II", " III", " IV", " V", " VI", " VII", " VIII", " IX", " X"]


def level_title(base: str, level: int) -> str:
    """"SGRC", "SGRC II", "SGRC III" ... the way the bodies write repeat titles."""
    if level < len(ROMAN):
        return f"{base}{ROMAN[level]}"
    return f"{base} {level}"


def cumulative_titles(base: str, level: int) -> list[str]:
    return [level_title(base, n) for n in range(1, level + 1)]


def rank_by(dogs: list[dict], field: str, key: str) -> None:
    """Competition ranking on a points field: ties share a rank, the next
    rank skips (8, 8, 10), which is how LGRA's own year-end sheets read.
    Hounds with no points in the field are left unranked (None)."""
    for dog in dogs:
        dog[key] = None
    ordered = sorted(
        (dog for dog in dogs if (dog.get(field) or 0) > 0),
        key=lambda dog: (-dog[field], dog.get("call_name", ""), dog["id"]),
    )
    rank = 0
    previous = None
    for position, dog in enumerate(ordered, 1):
        if dog[field] != previous:
            rank = position
            previous = dog[field]
        dog[key] = rank


# ---------------------------------------------------------------- meet codes

# LGRA meet codes: year letters (A = 1995 ... Z = 2020, AA = 2021, AF = 2026,
# a bijective base 26), a number, and a letter when several meets ran on the
# same day. From 2012 the number is the day of the year (AF249b is the second
# meet of 6 September 2026); before 2012 it was a running count of meets
# within the year, so those codes carry a year but no date.
LGRA_YEAR_BASE = 1994
LGRA_DAY_OF_YEAR_FROM = 2012
LGRA_MEET_RE = re.compile(r"^([A-Z]{1,2})(\d{1,3})([A-Za-z])?$")


def lgra_year(letters: str) -> int:
    index = 0
    for char in letters:
        index = index * 26 + (ord(char) - ord("A") + 1)
    return LGRA_YEAR_BASE + index


def decode_lgra_meet(code: str) -> dict:
    # The registrar types the year letters in either case (K115 and k115),
    # occasionally with a space (I 44) or a trailing annotation (F26-DQ,
    # G70-S) that is not part of the code.
    text = re.sub(r"\s+", "", code).split("-")[0]
    match = LGRA_MEET_RE.match(text) or LGRA_MEET_RE.match(text.upper())
    if not match:
        raise RacingParseError(f"unrecognized LGRA meet code {code!r}")
    letters, number_text, suffix = match.groups()
    letters = letters.upper()
    year = lgra_year(letters)
    number = int(number_text)
    normalized = f"{letters}{number_text}{suffix.lower() if suffix else ''}"
    if year < LGRA_DAY_OF_YEAR_FROM:
        return {"code": normalized, "year": year, "seq": number, "date": None,
                "suffix": suffix.lower() if suffix else None}
    if not 1 <= number <= 366:
        raise RacingParseError(f"day of year out of range in meet code {code!r}")
    when = date(year, 1, 1) + timedelta(days=number - 1)
    if when.year != year:
        raise RacingParseError(f"day 366 in a non-leap year: {code!r}")
    return {"code": normalized, "year": year, "seq": None, "date": when.isoformat(),
            "suffix": suffix.lower() if suffix else None}


# AOK9 meet codes: "2026-S22" is the 22nd sanctioned sprint meet of 2026 (the
# guide carries no date for it). Older rows hold the meet date itself.
AOK9_MEET_RE = re.compile(r"^(\d{4})-S(\d+)([A-Za-z])?$")


def decode_aok9_meet(value) -> dict:
    if isinstance(value, datetime):
        value = value.date()
    if isinstance(value, date):
        return {"code": value.isoformat(), "year": value.year, "seq": None,
                "date": value.isoformat()}
    text = cell_str(value)
    match = AOK9_MEET_RE.match(text)
    if match:
        # 2022-S39d: a letter when one sanctioned meet ran several divisions.
        return {"code": text, "year": int(match.group(1)),
                "seq": int(match.group(2)), "date": None}
    try:
        when = date.fromisoformat(text[:10])
    except ValueError:
        raise RacingParseError(f"unrecognized AOK9 meet code {value!r}") from None
    return {"code": when.isoformat(), "year": when.year, "seq": None,
            "date": when.isoformat()}


def decode_or_keep(decoder, code) -> dict:
    """Decode a meet code, or keep it undated when the registrar's entry is a
    typo (a day 636, "C?"). A handful in 25,000 is not worth failing a build
    over; check.py caps how many are tolerated."""
    try:
        return decoder(code)
    except RacingParseError:
        return {"code": cell_str(code), "year": None, "seq": None,
                "date": None, "undecoded": True}


def last_raced(meets: list[dict]) -> str | None:
    """The date of the newest listed meet, or None when only its year is known.

    AOK9's recent meets carry sanctioned-meet codes (2025-S67) with no date,
    older ones a date. The newest *dated* meet is only the last one raced
    when no undated meet comes from the same year or later; otherwise the
    pages fall back to last_year.
    """
    newest = max((m["date"] for m in meets if m["date"]), default=None)
    undated = [m["year"] for m in meets if m["year"] and not m["date"]]
    if newest is None or (undated and max(undated) >= int(newest[:4])):
        return None
    return newest


# --------------------------------------------------------------- spreadsheets

def cell_str(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return collapse(str(value))


def cell_num(value) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    try:
        return float(str(value).strip())
    except ValueError:
        return None


def read_rows_xls(path: Path) -> list[list]:
    """Every cell of the first sheet of a legacy .xls, dates as datetimes."""
    import xlrd  # only the LGRA guide needs it; keep the import local

    book = xlrd.open_workbook(str(path))
    sheet = book.sheet_by_index(0)
    rows: list[list] = []
    for index in range(sheet.nrows):
        row = []
        for cell in sheet.row(index):
            if cell.ctype == xlrd.XL_CELL_EMPTY:
                row.append(None)
            elif cell.ctype == xlrd.XL_CELL_DATE:
                row.append(xlrd.xldate_as_datetime(cell.value, book.datemode))
            else:
                row.append(cell.value)
        rows.append(row)
    return rows


def read_rows_xlsx(path: Path) -> list[list]:
    """Every cell of the first sheet of an .xlsx, formulas as their values."""
    import openpyxl

    book = openpyxl.load_workbook(str(path), read_only=True, data_only=True)
    sheet = book.worksheets[0]
    rows = [list(row) for row in sheet.iter_rows(values_only=True)]
    book.close()
    return rows


def excel_serial_to_date(value) -> date:
    """A date cell that reached us as a bare serial number (1900 date system)."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    serial = cell_num(value)
    if serial is None:
        raise RacingParseError(f"not a date: {value!r}")
    return date(1899, 12, 30) + timedelta(days=int(serial))


def parse_id(value) -> tuple[str, str, str] | None:
    """(normalized id, prefix, raw) for a registration number, else None.

    The guides write A-151; one LGRA row writes B1186 and one AOK9 row
    WH--204. Normalize to the hyphenated form so lookups and links are stable.
    """
    raw = cell_str(value)
    match = ID_RE.match(raw)
    if not match:
        return None
    prefix, number = match.groups()
    return f"{prefix}-{number}", prefix, raw


def section_header(row: list, name_cols=(0, 1), empty_cols=(2, 4)) -> dict | None:
    """The breed name and any note when a row is a section header, else None.

    A header carries the breed in the first cell or, as the LGRA guide does
    for its three youngest breeds, in the NAME cell. What it never carries is
    a registration number or anything in the WAVE and OWNER columns. A note
    beside the name ("*******PROVISIONAL 2018*******") is kept.
    """
    if not row or parse_id(row[0]):
        return None
    names = [cell_str(row[col]) for col in name_cols if col < len(row)]
    names = [name for name in names if name]
    if len(names) != 1:
        return None
    if any(cell_str(row[col]) for col in empty_cols if col < len(row)):
        return None
    name = names[0]
    if not re.search(r"[A-Z]", name) or name != name.upper():
        return None
    notes = [
        cell_str(cell) for index, cell in enumerate(row)
        if index not in name_cols and cell_str(cell)
    ]
    return {"breed_raw": name, "note": collapse(" ".join(notes).strip("* ")) or None}


NOTE_RE = re.compile(r"\s*\(([^)]*[A-Za-z][^)]*)\)\s*")

# A registrar's note is administrative: it carries a date or names a status
# or a change ("CAN NOT RUN UNTIL 3-12-24", "Call name formerly Envy",
# "BANNED FROM RACING", "not one year yet", "Records moved"). Other brackets
# are part of the name as the guide prints it: "Artemis Roam (If You Want
# To)", "Oliver Queen (The Green Arrow)", a country of registration, "(GRC)".
NOTE_WORDS = re.compile(
    r"\d|can\s*not|can't|\brun\b|\brac(?:e|ing)\b|banned|\bname|\bcall\b|"
    r"former|chang|\bold\b|record|moved|\byears?\b",
    re.IGNORECASE)

# Runs of asterisks set a note off ("***(BANNED FROM RACING)***"); they are
# emphasis, never part of a registered name.
EMPHASIS_RE = re.compile(r"\*{2,}")


def strip_note(registered_raw: str) -> tuple[str, str | None]:
    """Pull a registrar's parenthetical note out of a registered name.

    "FC Kominek's Freya FCh MC LCX (DOG CAN NOT RUN UNTIL 3-12-24)" is a name
    and an administrative note; the note is kept, separately.
    """
    notes: list[str] = []

    def take(match: re.Match) -> str:
        inner = collapse(match.group(1))
        if NOTE_WORDS.search(inner):
            notes.append(inner)
            return " "
        return match.group(0)

    name = NOTE_RE.sub(take, collapse(registered_raw))
    name = collapse(EMPHASIS_RE.sub(" ", name))
    return name, ("; ".join(notes) or None)


# Words that stay lower case inside a breed name.
_SMALL_WORDS = {"of", "de", "del", "della", "du", "van", "von", "y"}
BREED_NAME_OVERRIDES = {
    "CIRNECO DELL'ETNA": "Cirneco dell'Etna",
    "GALGO ESPAÑOL": "Galgo Español",
    "LURCHER/LONGDOG": "Lurcher / Longdog",
    "MIXED BREED": "Mixed breed",
    "POODLE - MINIATURE": "Poodle (Miniature)",
    "POODLE - STANDARD": "Poodle (Standard)",
    "WELSH CORGI (CARDIGAN/PEMBROKE)": "Welsh Corgi (Cardigan / Pembroke)",
    "PORTUGUESE PODENGO MEDIO/GRANDE": "Portuguese Podengo Medio / Grande",
}


def breed_display(caps: str) -> str:
    text = collapse(caps)
    if text in BREED_NAME_OVERRIDES:
        return BREED_NAME_OVERRIDES[text]
    words = []
    for index, word in enumerate(text.lower().split(" ")):
        if index and word in _SMALL_WORDS:
            words.append(word)
        else:
            words.append("-".join(part[:1].upper() + part[1:] for part in word.split("-")))
    return " ".join(words)


# ----------------------------------------------------------------- snapshots

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _stable(snapshot: dict) -> str:
    """The snapshot with its per-fetch keys removed, as a canonical string."""
    trimmed = {k: v for k, v in snapshot.items() if k not in VOLATILE_KEYS}
    return json.dumps(trimmed, sort_keys=True, ensure_ascii=False)


def dumps_snapshot(snapshot: dict) -> str:
    """JSON with one hound per line.

    Weekly snapshots of a 7,000-row registry differ in a few hundred rows;
    line-aligned records let git store each one as a small delta.
    """
    out = ["{"]
    for key, value in snapshot.items():
        if key == "sections":
            continue
        out.append(f" {json.dumps(key)}: {json.dumps(value, ensure_ascii=False)},")
    out.append(' "sections": [')
    sections = snapshot["sections"]
    for s_index, section in enumerate(sections):
        head = {k: v for k, v in section.items() if k != "dogs"}
        head_json = json.dumps(head, ensure_ascii=False)[1:-1]
        out.append("  {" + head_json + ', "dogs": [')
        dogs = section["dogs"]
        for d_index, dog in enumerate(dogs):
            line = json.dumps(dog, ensure_ascii=False, separators=(",", ":"))
            out.append("   " + line + ("," if d_index < len(dogs) - 1 else ""))
        out.append("  ]}" + ("," if s_index < len(sections) - 1 else ""))
    out.append(" ]")
    out.append("}")
    return "\n".join(out) + "\n"


def newest_snapshot(snapshot_dir: Path) -> Path | None:
    existing = sorted(snapshot_dir.glob("*.json"))
    return existing[-1] if existing else None


def write_snapshot_if_changed(snapshot_dir: Path, snapshot: dict,
                              force: bool = False) -> Path | None:
    """Archive a parsed guide unless it matches the newest one already kept.

    An unchanged guide costs nothing. A guide revised in place under the same
    date replaces that date's snapshot: the registrar's correction is the
    guide now. (LGRA re-uploaded the 9-17-26 guide with changes on September
    21, 2026, and refusing it left the site on the uncorrected copy.)
    """
    snapshot_dir.mkdir(parents=True, exist_ok=True)
    target = snapshot_dir / f"{snapshot['guide_date']}.json"

    previous = newest_snapshot(snapshot_dir)
    if previous is not None and not force:
        kept = json.loads(previous.read_text(encoding="utf-8"))
        if _stable(kept) == _stable(snapshot):
            print(f"Unchanged since {previous.name} - nothing archived.")
            return None

    if target.exists():
        print(f"{target.name}: the registrar revised this guide in place under "
              f"the same date - archiving the revision over it.")

    target.write_text(dumps_snapshot(snapshot), encoding="utf-8")
    hounds = sum(len(section["dogs"]) for section in snapshot["sections"])
    print(f"Archived {target.name}  {hounds:,} hounds  "
          f"{len(snapshot['sections'])} sections")
    return target


def load_snapshots(snapshot_dir: Path) -> list[dict]:
    paths = sorted(snapshot_dir.glob("*.json"))
    if not paths:
        raise SystemExit(f"No snapshots in {snapshot_dir}. Fetch a guide first.")
    snapshots = [json.loads(path.read_text(encoding="utf-8")) for path in paths]
    snapshots.sort(key=lambda snap: snap["guide_date"])
    return snapshots


# ------------------------------------------------------------------ derived

# Owner cells the guides misspell, exactly as printed -> as the owner spells
# it. Applied when the feed is built, so the archived snapshot keeps the
# guide's text and a corrected guide simply stops matching.
OWNER_CORRECTIONS = {
    "Brady/Komineck/Komineck": "Brady/Kominek/Kominek",
    "KominekKominek": "Kominek/Kominek",
}


def derive_identity(dog: dict) -> None:
    """Registered name, titles, owners: the part both bodies share."""
    name, note = strip_note(dog.pop("registered_raw"))
    prefix_titles, core, suffix_titles = split_titles(name)
    dog["registered_name"] = name
    dog["core_name"] = core
    dog["titles"] = prefix_titles + suffix_titles
    dog["note"] = note
    if dog["owner_raw"] in OWNER_CORRECTIONS:
        dog["owner_raw"] = OWNER_CORRECTIONS[dog["owner_raw"]]
    dog["owners"] = split_owners(dog["owner_raw"])


def build_movement(current: list[dict], previous: list[dict] | None,
                   since: str | None, fields: list[str],
                   titles_of) -> dict[str, dict]:
    """Per-hound change against the previous guide.

    Positive rank deltas mean the hound climbed, as on the ASFA side.
    """
    if previous is None or since is None:
        return {}
    before = {dog["id"]: dog for dog in previous}
    movement: dict[str, dict] = {}
    for dog in current:
        prior = before.get(dog["id"])
        if prior is None:
            entry = {"since": since, "new": True, "rank_breed_delta": None,
                     "new_titles": titles_of(dog)}
            for field in fields:
                entry[f"{field}_delta"] = None
            movement[dog["id"]] = entry
            continue
        entry = {"since": since, "new": False}
        if dog.get("rank_breed") and prior.get("rank_breed"):
            entry["rank_breed_delta"] = prior["rank_breed"] - dog["rank_breed"]
        else:
            entry["rank_breed_delta"] = None
        for field in fields:
            now, then = dog.get(field), prior.get(field)
            entry[f"{field}_delta"] = (
                round(now - then, 3) if now is not None and then is not None else None
            )
        entry["new_titles"] = [
            title for title in titles_of(dog) if title not in set(titles_of(prior))
        ]
        movement[dog["id"]] = entry
    return movement


def build_owners(dogs: list[dict], sum_fields: list[str],
                 best_field: str) -> list[dict]:
    """Owner aggregates over the active hounds, one row per surname per breed.

    The guides print a bare surname, no initials and no region, so a surname
    alone cannot tell two households apart; "Jones" covered five breeds and
    at least three families. Racing households are nearly all one breed, so
    the surname within a breed is the closest thing to a person the data
    allows. A genuine multi-breed owner shows as one row per breed.
    """
    owners: dict[str, dict] = {}
    for dog in dogs:
        for party in dog["owners"]:
            key = f"{party['key']}|{dog['breed_slug']}"
            entry = owners.setdefault(key, {
                "key": key, "surname_key": party["key"], "name": party["name"],
                "breed": dog["breed"], "breed_slug": dog["breed_slug"], "hounds": 0,
                **{field: 0.0 for field in sum_fields},
                f"best_{best_field}": None, "breeds": set(), "dog_ids": [],
            })
            entry["hounds"] += 1
            entry["dog_ids"].append(dog["id"])
            entry["breeds"].add(dog["breed"])
            for field in sum_fields:
                entry[field] += dog.get(field) or 0
            best = dog.get(best_field)
            if best is not None:
                current = entry[f"best_{best_field}"]
                entry[f"best_{best_field}"] = best if current is None else max(current, best)
    rows = []
    for entry in owners.values():
        entry["breeds"] = sorted(entry["breeds"])
        for field in sum_fields:
            entry[field] = round(entry[field], 3)
        rows.append(entry)
    rows.sort(key=lambda row: (-row[sum_fields[0]], -row["hounds"], row["name"]))
    return rows


def compact_registry(dogs: list[dict], columns: list[str]) -> dict:
    return {"columns": columns, "rows": [[dog.get(col) for col in columns] for dog in dogs]}


def write_json(path: Path, payload: dict) -> int:
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    path.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8"))


def fetch_bytes(url: str, user_agent: str = USER_AGENT, timeout: int = 60) -> bytes:
    response = requests.get(url, headers={"User-Agent": user_agent}, timeout=timeout)
    response.raise_for_status()
    return response.content


def fetch_text(url: str, user_agent: str = USER_AGENT, timeout: int = 30) -> str:
    response = requests.get(url, headers={"User-Agent": user_agent}, timeout=timeout)
    response.raise_for_status()
    return response.text


def slug(text: str) -> str:
    return slugify(text)
