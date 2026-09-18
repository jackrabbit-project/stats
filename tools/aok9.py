"""Fetch the AOK9 sprint-racing grading guide and build the AOK9 racing feed.

R.A.C.E.'s AOK9 program (all-breed sprint racing) keeps its grading guide as
a public Google Sheet linked from https://aok9racing.com/documents--forms.html,
where the link text carries the guide's date ("updated 9/9/26"); the sheet
itself has no date cell. Every registered dog is on it with a Breed WAVE and a
Mixed WAVE, Breed and Mixed Racing Championship points, the National points
behind the Supreme titles, Turtle points, this year's points, and the last
three breed-division and mixed-division meets.

Usage:
    python tools/aok9.py                    # fetch, archive if changed, rebuild
    python tools/aok9.py --force            # archive even if unchanged
    python tools/aok9.py --file PATH --date YYYY-MM-DD
    python tools/aok9.py --offline          # rebuild from the snapshots alone
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path

import requests

from racing import (
    DATA, RacingParseError, breed_display, build_movement, build_owners,
    cell_num, cell_str, compact_registry, cumulative_titles, decode_aok9_meet,
    decode_or_keep,
    derive_identity, fetch_bytes, fetch_text, grade, section_header,
    load_snapshots, parse_id, rank_by, read_rows_xlsx, sha256, slug,
    super_level, today, wave, write_json, write_snapshot_if_changed,
)

ORG = "aok9"
SITE_URL = "https://aok9racing.com"
LINK_PAGE = "https://aok9racing.com/documents--forms.html"
SHEET_ID = "1fsoX7xh3Inj9Bgsvzs6GGQp36KSHp7Wwfp_hsBBj7sQ"
SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?usp=sharing"
EXPORT_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=xlsx"
RULES_URL = (
    "https://aok9racing.com/uploads/1/1/1/1/11113828/"
    "aok9_sprint_racing_rule_book_v_3.0.docx.pdf"
)
RAW_DIR = DATA / "aok9" / "raw"
SNAPSHOT_DIR = DATA / "aok9" / "snapshots"
FEED = DATA / "aok9.json"
REGISTRY = DATA / "aok9-registry.json"

# Google's export endpoint answers a plain library User-Agent with a sign-in
# page; a browser-style one gets the workbook. The one deliberate exception to
# the identify-the-project convention in racing.USER_AGENT.
EXPORT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)

UPDATED_RE = re.compile(r"updated\s+(\d{1,2})/(\d{1,2})/(\d{2,4})", re.IGNORECASE)

HEADERS = {
    0: "REG#", 1: "NAME", 2: "BWAVE", 3: "MWAVE", 4: "REGISTERED NAME",
    5: "OWNER", 6: "Career", 7: "BRC", 8: "NBRC", 9: "MRC", 10: "NMRC",
    11: "TRC", 12: "YTD",
    13: "Meet", 15: "Score", 16: "Meet", 18: "Score", 19: "Meet", 21: "Score",
    22: "Meet", 24: "Score", 25: "Meet", 27: "Score", 28: "Meet", 30: "Score",
}
BREED_MEET_COLUMNS = ((13, 14, 15), (16, 17, 18), (19, 20, 21))
MIXED_MEET_COLUMNS = ((22, 23, 24), (25, 26, 27), (28, 29, 30))

CHAMPIONSHIP_POINTS = 12
MRC_MIXED_MINIMUM = 2
NATIONAL_STEP = 30


def brc_earned(dog: dict) -> bool:
    """Sprint Rule Book 3.0 §5.2: 12 BRC points."""
    return (dog.get("brc") or 0) >= CHAMPIONSHIP_POINTS


def mrc_earned(dog: dict) -> bool:
    """§5.3: 12 championship points from either column, at least 2 of them MRC."""
    mixed = dog.get("mrc") or 0
    return (dog.get("brc") or 0) + mixed >= CHAMPIONSHIP_POINTS and mixed >= MRC_MIXED_MINIMUM


def trc_earned(dog: dict) -> bool:
    """12 Turtle points. §5.7 defines the points and §5.8 the Supreme title at 30;
    the 12-point TRC is not spelled out in the rule book but is how the guide's
    registered names record it (every dog at 12+ carries TRC or STRC)."""
    return (dog.get("trc") or 0) >= CHAMPIONSHIP_POINTS

REGISTRY_COLUMNS = [
    "id", "breed_slug", "call_name", "registered_name", "owner_raw", "bwave",
    "mwave", "bgrade", "mgrade", "brc", "nbrc", "mrc", "nmrc", "trc", "ytd",
    "rank_breed", "rank_all", "rank_career_breed", "rank_career_mixed",
    "meets_breed", "meets_mixed", "dq", "last_raced", "last_year", "active",
    "duplicate_of",
]


# ------------------------------------------------------------------- fetch

def find_guide_date(html: str) -> date:
    """The "(updated 9/9/26)" beside the sprint guide's link."""
    position = html.find(SHEET_ID)
    if position < 0:
        raise RacingParseError(f"The sprint guide link is no longer on {LINK_PAGE}")
    window = re.sub(r"<[^>]+>", " ", html[position:position + 600])
    match = UPDATED_RE.search(window)
    if not match:
        raise RacingParseError(
            "No 'updated M/D/YY' beside the sprint guide link; pass --date"
        )
    month, day, year = (int(part) for part in match.groups())
    if year < 100:
        year += 2000
    return date(year, month, day)


def fetch() -> tuple[Path, date]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    guide_date = find_guide_date(fetch_text(LINK_PAGE))
    raw = fetch_bytes(EXPORT_URL, user_agent=EXPORT_USER_AGENT)
    if not raw.startswith(b"PK"):
        raise RacingParseError(
            "The export did not return a workbook (no zip signature); Google "
            "may have answered with a sign-in page."
        )
    target = RAW_DIR / f"{guide_date.isoformat()}.xlsx"
    target.write_bytes(raw)
    print(f"Fetched the sprint guide updated {guide_date}  {len(raw):,} bytes")
    return target, guide_date


# ------------------------------------------------------------------- parse

def find_header_row(rows: list[list]) -> int:
    for index, row in enumerate(rows[:12]):
        if cell_str(row[0]) == "REG#" and cell_str(row[1]) == "NAME":
            return index
    raise RacingParseError("header row (REG#, NAME, ...) not found in the first 12 rows")


def read_meets(row: list, columns, dog_id: str) -> list[dict]:
    meets = []
    for code_col, flag_col, score_col in columns:
        code = cell_str(row[code_col]) if code_col < len(row) else ""
        score = cell_num(row[score_col]) if score_col < len(row) else None
        if not code and score is None:
            continue
        if not code:
            raise RacingParseError(f"{dog_id}: a score without a meet code")
        meets.append({
            "code": code,
            "score": score,
            "complete": cell_str(row[flag_col]).lower() != "y",
        })
    return meets


def parse_workbook(path: Path, guide_date: date, date_source: str) -> dict:
    rows = read_rows_xlsx(path)
    header_index = find_header_row(rows)
    header = rows[header_index]
    for column, expected in HEADERS.items():
        found = cell_str(header[column]) if column < len(header) else ""
        if found != expected:
            raise RacingParseError(
                f"column {column} reads {found!r}, expected {expected!r}"
            )

    sections: list[dict] = []
    current: dict | None = None
    stray: list[list] = []
    seen: dict[str, int] = {}
    prefix_sections: dict[str, set[str]] = {}
    for row in rows[header_index + 1:]:
        if len(row) < 31:
            row = list(row) + [None] * (31 - len(row))
        header_info = section_header(row, empty_cols=(2, 3, 5))
        if header_info:
            current = {"breed_raw": header_info["breed_raw"],
                       "note": header_info["note"], "dogs": []}
            sections.append(current)
            continue
        parsed = parse_id(row[0])
        if parsed is None:
            if any(cell_str(cell) for cell in row[:6]):
                stray.append([cell_str(cell) for cell in row[:6]])
            continue
        if current is None:
            raise RacingParseError(f"dog {parsed[2]} appears before any breed header")
        dog_id, prefix, raw_id = parsed
        # The registrars re-use a number now and then (two hounds, or one
        # hound entered twice under call-name variants). Every row is kept;
        # the second occurrence gets a -2 suffix so links stay unambiguous.
        seen[dog_id] = seen.get(dog_id, 0) + 1
        if seen[dog_id] > 1:
            dog_id = f"{dog_id}-{seen[dog_id]}"
        prefix_sections.setdefault(prefix, set()).add(current["breed_raw"])
        dq_tokens = []
        raw_dq = row[6]
        if raw_dq not in (None, ""):
            dq_tokens = cell_str(raw_dq).split()
        dog = {
            "id": dog_id,
            "prefix": prefix,
            "call_name": cell_str(row[1]),
            "bwave": cell_num(row[2]),
            "mwave": cell_num(row[3]),
            "registered_raw": cell_str(row[4]),
            "owner_raw": cell_str(row[5]),
            "dq_raw": " ".join(dq_tokens),
            "brc": cell_num(row[7]),
            "nbrc": cell_num(row[8]),
            "mrc": cell_num(row[9]),
            "nmrc": cell_num(row[10]),
            "trc": cell_num(row[11]),
            "ytd": cell_num(row[12]),
            "meets_breed": read_meets(row, BREED_MEET_COLUMNS, dog_id),
            "meets_mixed": read_meets(row, MIXED_MEET_COLUMNS, dog_id),
        }
        if raw_id != dog_id:
            dog["id_raw"] = raw_id
        if seen[parsed[0]] > 1:
            dog["duplicate_of"] = parsed[0]
        current["dogs"].append(dog)

    if stray:
        raise RacingParseError(
            f"{len(stray)} rows are neither dogs nor headers, e.g. {stray[:3]}"
        )
    shared = {p: s for p, s in prefix_sections.items() if len(s) > 1}
    if shared:
        raise RacingParseError(
            f"registration prefixes filed under more than one breed: {shared}"
        )
    if not sections:
        raise RacingParseError("no breed sections found")

    raw = path.read_bytes()
    return {
        "org": ORG,
        "guide_date": guide_date.isoformat(),
        "guide_date_source": date_source,
        "season": guide_date.year,
        "source_url": SHEET_URL,
        "source_page": LINK_PAGE,
        "source_file": path.name,
        "sha256": sha256(raw),
        "fetched": today(),
        "columns": [cell_str(cell) for cell in header],
        "sections": sections,
    }


# ------------------------------------------------------------------- build

def titles_of(dog: dict) -> list[str]:
    titles = []
    if brc_earned(dog):
        titles.append("BRC")
    if mrc_earned(dog):
        titles.append("MRC")
    if trc_earned(dog):
        titles.append("TRC")
    titles.extend(cumulative_titles("SBRC", super_level(dog.get("nbrc"), NATIONAL_STEP)))
    titles.extend(cumulative_titles("SMRC", super_level(dog.get("nmrc"), NATIONAL_STEP)))
    titles.extend(cumulative_titles("STRC", super_level(dog.get("trc"), NATIONAL_STEP)))
    return titles


def decode_meets(meets: list[dict]) -> list[dict]:
    decoded = []
    for meet in meets:
        info = decode_or_keep(decode_aok9_meet, meet["code"])
        decoded.append({
            "code": info["code"], "date": info["date"], "year": info["year"],
            "seq": info["seq"], "score": meet["score"], "complete": meet["complete"],
        })
    return decoded


def derive(snapshot: dict) -> list[dict]:
    season = snapshot["season"]
    dogs: list[dict] = []
    for section in snapshot["sections"]:
        breed = breed_display(section["breed_raw"])
        for raw in section["dogs"]:
            dog = dict(raw)
            dog["section_raw"] = section["breed_raw"]
            dog["breed"] = breed
            dog["breed_slug"] = slug(breed)
            derive_identity(dog)

            dog["meets_breed"] = decode_meets(dog["meets_breed"])
            dog["meets_mixed"] = decode_meets(dog["meets_mixed"])
            every = dog["meets_breed"] + dog["meets_mixed"]
            dog["last_raced"] = max((m["date"] for m in every if m["date"]), default=None)
            dog["last_year"] = max((m["year"] for m in every if m["year"]), default=None)

            dq = []
            for token in re.split(r"[\s,]+", dog.pop("dq_raw").strip()):
                if token:
                    info = decode_or_keep(decode_aok9_meet, token)
                    dq.append({"code": info["code"], "date": info["date"]})
            dog["dq"] = dq

            for stream, meets in (("bwave", dog["meets_breed"]), ("mwave", dog["meets_mixed"])):
                computed = wave([(m["score"], m["complete"]) for m in meets])
                published = dog[stream]
                dog[f"{stream}_computed"] = round(computed, 3) if computed is not None else None
                dog[stream] = round(published, 3) if published is not None else None
                dog[f"{stream}_matches"] = (
                    published is not None and computed is not None
                    and abs(published - computed) <= 0.01
                )
            dog["bgrade"] = grade(dog["bwave"])
            dog["mgrade"] = grade(dog["mwave"])
            dog["titled"] = {
                "brc": brc_earned(dog),
                "mrc": mrc_earned(dog),
                "trc": trc_earned(dog),
                "sbrc": super_level(dog["nbrc"], NATIONAL_STEP),
                "smrc": super_level(dog["nmrc"], NATIONAL_STEP),
                "strc": super_level(dog["trc"], NATIONAL_STEP),
            }
            dog["active"] = bool(
                (dog["ytd"] or 0) > 0
                or (dog["last_year"] is not None and dog["last_year"] >= season - 1)
            )
            dogs.append(dog)

    for breed in {dog["breed"] for dog in dogs}:
        rank_by([dog for dog in dogs if dog["breed"] == breed], "ytd", "rank_breed")
    rank_by(dogs, "ytd", "rank_all")
    rank_by(dogs, "nbrc", "rank_career_breed")
    rank_by(dogs, "nmrc", "rank_career_mixed")
    return dogs


def build(snapshots: list[dict]) -> tuple[dict, dict]:
    current = snapshots[-1]
    previous = snapshots[-2] if len(snapshots) > 1 else None
    season = current["season"]

    dogs = derive(current)
    prior_dogs = derive(previous) if previous else None
    movement = build_movement(
        dogs, prior_dogs, previous["guide_date"] if previous else None,
        ["bwave", "mwave", "brc", "mrc", "nbrc", "nmrc", "trc", "ytd"], titles_of,
    )
    for dog in dogs:
        dog["movement"] = movement.get(dog["id"])

    active = [dog for dog in dogs if dog["active"]]
    owners = build_owners(active, ["ytd", "nbrc", "nmrc"], "bwave")

    sections = []
    for section in current["sections"]:
        breed = breed_display(section["breed_raw"])
        members = [dog for dog in dogs if dog["section_raw"] == section["breed_raw"]]
        leader = min(
            (dog for dog in members if dog["rank_breed"] == 1),
            key=lambda dog: dog["call_name"], default=None,
        )
        sections.append({
            "breed": breed,
            "slug": slug(breed),
            "prefix": members[0]["prefix"] if members else None,
            "section_raw": section["breed_raw"],
            "registry": len(members),
            "active": sum(dog["active"] for dog in members),
            "ytd": sum((dog["ytd"] or 0) > 0 for dog in members),
            "titled": sum(dog["titled"]["brc"] or dog["titled"]["mrc"] for dog in members),
            "leader": {
                "id": leader["id"], "call_name": leader["call_name"],
                "ytd": leader["ytd"],
            } if leader else None,
        })
    sections.sort(key=lambda section: section["breed"])

    meets_this_year = {
        m["code"] for dog in dogs
        for m in dog["meets_breed"] + dog["meets_mixed"] if m["year"] == season
    }
    titles_since = [
        {"id": dog["id"], "call_name": dog["call_name"], "breed": dog["breed"],
         "title": title, "since": dog["movement"]["since"]}
        for dog in active if dog["movement"]
        for title in dog["movement"]["new_titles"]
    ]
    titles_since.sort(key=lambda row: (row["breed"], row["call_name"], row["title"]))

    def agreement(stream: str) -> float:
        rated = [dog for dog in dogs if dog[stream] is not None]
        return round(sum(dog[f"{stream}_matches"] for dog in rated) / max(1, len(rated)), 4)

    stats = {
        "hounds_registry": len(dogs),
        "hounds_duplicate_numbers": sum("duplicate_of" in dog for dog in dogs),
        "hounds_active": len(active),
        "hounds_ytd": sum((dog["ytd"] or 0) > 0 for dog in dogs),
        # Raced this year: a listed meet in the season, points or not.
        "hounds_raced": sum(
            any(m["year"] == season for m in dog["meets_breed"] + dog["meets_mixed"])
            for dog in dogs),
        "breeds_raced": len({
            dog["breed"] for dog in dogs
            if any(m["year"] == season for m in dog["meets_breed"] + dog["meets_mixed"])}),
        "titled_brc": sum(dog["titled"]["brc"] for dog in dogs),
        "titled_mrc": sum(dog["titled"]["mrc"] for dog in dogs),
        "titled_trc": sum(dog["titled"]["trc"] for dog in dogs),
        # Distinct dogs with a regular championship (BRC or MRC).
        "titled_champion": sum(dog["titled"]["brc"] or dog["titled"]["mrc"] for dog in dogs),
        "titled_sbrc": sum(dog["titled"]["sbrc"] > 0 for dog in dogs),
        "titled_smrc": sum(dog["titled"]["smrc"] > 0 for dog in dogs),
        "titled_strc": sum(dog["titled"]["strc"] > 0 for dog in dogs),
        "breeds": len(sections),
        "breeds_active": sum(section["active"] > 0 for section in sections),
        "breeds_ytd": sum(section["ytd"] > 0 for section in sections),
        "meets_this_year": len(meets_this_year),
        "meets_listed": sum(len(dog["meets_breed"]) + len(dog["meets_mixed"]) for dog in dogs),
        "meets_undecoded": sum(
            m["year"] is None for dog in dogs for m in dog["meets_breed"] + dog["meets_mixed"]),
        "owners_active": len(owners),
        "bwave_agreement": agreement("bwave"),
        "mwave_agreement": agreement("mwave"),
    }

    feed_dog_fields = [
        "id", "breed", "breed_slug", "call_name", "registered_name", "titles",
        "note", "owner_raw", "owners", "bwave", "bwave_matches", "mwave",
        "mwave_matches", "bgrade", "mgrade", "brc", "nbrc", "mrc", "nmrc", "trc",
        "ytd", "titled", "rank_breed", "rank_all", "rank_career_breed",
        "rank_career_mixed", "meets_breed", "meets_mixed", "last_raced",
        "last_year", "dq", "movement", "duplicate_of",
    ]
    def compact_dog(dog: dict) -> dict:
        row = {field: dog.get(field) for field in feed_dog_fields}
        if row["duplicate_of"] is None:
            del row["duplicate_of"]
        if not dog["bwave_matches"] and dog["bwave_computed"] is not None:
            row["bwave_computed"] = dog["bwave_computed"]
        if not dog["mwave_matches"] and dog["mwave_computed"] is not None:
            row["mwave_computed"] = dog["mwave_computed"]
        for stream in ("meets_breed", "meets_mixed"):
            row[stream] = [[m["code"], m["year"], m["date"], m["score"], m["complete"]] for m in dog[stream]]
        row["dq"] = [[d["code"], d["date"]] for d in dog["dq"]]
        return row

    feed = {
        "org": ORG,
        "name": "AOK9",
        "program": "sprint racing",
        "season": season,
        "guide_date": current["guide_date"],
        "guide_date_source": current["guide_date_source"],
        "previous_guide_date": previous["guide_date"] if previous else None,
        "generated": today(),
        "source_url": SHEET_URL,
        "source_page": LINK_PAGE,
        "site_url": SITE_URL,
        "rules_url": RULES_URL,
        "snapshots": [snap["guide_date"] for snap in snapshots],
        "active_since": f"{season - 1}-01-01",
        "stats": stats,
        "sections": sections,
        "dogs": [compact_dog(dog) for dog in active],
        "owners": owners,
        "titles_since_previous": titles_since,
        "meet_columns": ["code", "year", "date", "score", "complete"],
        "dq_columns": ["code", "date"],
        "notes": [
            "Standings rank this season's points (the guide's YTD column) "
            "within each breed and across breeds; career standings rank "
            "National Breed points (NBRC) and National Mixed points (NMRC).",
            "Breed WAVE and Mixed WAVE are recomputed from the last three "
            "listed meets of each kind per Sprint Rule Book 3.0 §4.2.2; the "
            "published figure is the one shown where they differ.",
            "MRC follows Sprint Rule Book 3.0 §5.3: 12 championship points from "
            "the BRC and MRC columns together, at least 2 of them MRC points. "
            "TRC at 12 Turtle points is not spelled out in the rule book but is "
            "how the guide's registered names record it. Companion titles "
            "(NSR, ESR, MSR) are applied for by owners and are not in the guide.",
        ],
    }

    dogs.sort(key=lambda dog: (dog["breed"], dog["call_name"], dog["id"]))
    registry_rows = []
    for dog in dogs:
        row = dict(dog)
        for stream in ("meets_breed", "meets_mixed"):
            row[stream] = [[m["code"], m["year"], m["date"], m["score"], m["complete"]] for m in dog[stream]]
        row["dq"] = [[d["code"], d["date"]] for d in dog["dq"]]
        registry_rows.append(row)
    registry = {
        "org": ORG,
        "guide_date": current["guide_date"],
        "season": season,
        **compact_registry(registry_rows, REGISTRY_COLUMNS),
    }
    return feed, registry


# -------------------------------------------------------------------- main

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--force", action="store_true",
                        help="archive even if the guide is unchanged or the date exists")
    parser.add_argument("--file", type=Path,
                        help="parse this workbook instead of fetching (needs --date)")
    parser.add_argument("--date", type=date.fromisoformat,
                        help="the guide's date, when it cannot be read from the link page")
    parser.add_argument("--offline", action="store_true",
                        help="rebuild the feed from archived snapshots without fetching")
    args = parser.parse_args()

    if not args.offline:
        try:
            if args.file:
                if not args.date:
                    parser.error("--file needs --date, the guide has no date cell of its own")
                path, guide_date, source = args.file, args.date, "cli"
            else:
                path, guide_date = fetch()
                source = "page"
                if args.date:
                    guide_date, source = args.date, "cli"
            snapshot = parse_workbook(path, guide_date, source)
            write_snapshot_if_changed(SNAPSHOT_DIR, snapshot, force=args.force)
        except requests.RequestException as error:
            if not list(SNAPSHOT_DIR.glob("*.json")):
                print(f"Could not fetch the AOK9 guide and no snapshot exists: {error}",
                      file=sys.stderr)
                return 1
            print(f"Could not fetch the AOK9 guide; rebuilding from archived "
                  f"snapshots. {error}", file=sys.stderr)

    snapshots = load_snapshots(SNAPSHOT_DIR)
    feed, registry = build(snapshots)
    feed_bytes = write_json(FEED, feed)
    registry_bytes = write_json(REGISTRY, registry)

    stats = feed["stats"]
    print(
        f"AOK9 sprint guide {feed['guide_date']}: {stats['hounds_registry']:,} dogs in "
        f"{stats['breeds']} breeds, {stats['hounds_active']:,} active, "
        f"{stats['hounds_ytd']} with points this year, "
        f"{stats['titled_brc']} BRC, {stats['titled_mrc']} MRC, {stats['titled_trc']} TRC, "
        f"BWAVE agreement {stats['bwave_agreement']:.1%}, "
        f"MWAVE agreement {stats['mwave_agreement']:.1%}"
    )
    print(f"Wrote {FEED.name} ({feed_bytes:,} bytes) and "
          f"{REGISTRY.name} ({registry_bytes:,} bytes)")

    top = Counter()
    for owner in feed["owners"]:
        top[f"{owner['key']}  <-  {owner['name']}"] = owner["hounds"]
    print("Busiest owner keys:")
    for line, hounds in top.most_common(12):
        print(f"  {hounds:3d}  {line}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
