"""Fetch the LGRA grading guide and build the LGRA racing feed.

The Large Gazehound Racing Association publishes one workbook, the grading
guide, linked from https://lgra.club/grading-guide under a filename that
carries its date (gradingguide_9-17-26.xls). Every registered hound is on it:
WAVE, GRC points, career and current-year National points, the last three
meets. This script archives a parsed snapshot of each new guide under
data/lgra/snapshots/, then rebuilds data/lgra.json (active hounds, standings,
owners, movement) and data/lgra-registry.json (every hound, compact) from all
snapshots.

Usage:
    python tools/lgra.py              # fetch, archive if changed, rebuild
    python tools/lgra.py --force      # archive even if unchanged
    python tools/lgra.py --file PATH  # parse a workbook already on disk
    python tools/lgra.py --offline    # rebuild from the snapshots alone
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
    cell_num, cell_str, compact_registry, cumulative_titles, decode_lgra_meet,
    decode_or_keep, derive_identity, excel_serial_to_date, fetch_bytes, fetch_text, grade,
    section_header, load_snapshots, parse_id, rank_by, read_rows_xls,
    sha256, slug, super_level, today, wave, write_json,
    write_snapshot_if_changed,
)

ORG = "lgra"
SITE_URL = "https://lgra.club"
GUIDE_PAGE = "https://lgra.club/grading-guide"
RULES_URL = "https://lgra.club/files/2024-02/rule_book_23.2.pdf"
RAW_DIR = DATA / "lgra" / "raw"
SNAPSHOT_DIR = DATA / "lgra" / "snapshots"
FEED = DATA / "lgra.json"
REGISTRY = DATA / "lgra-registry.json"

GUIDE_HREF_RE = re.compile(r'href="([^"]*gradingguide[^"]*\.xlsx?)"', re.IGNORECASE)

# The registration-number prefix is the authoritative breed; the section
# headers are only a cross-check. Prefix letters do not follow the header
# order (B is Borzoi, BA is Basenji), and the three youngest breeds' headers
# sit in the NAME column rather than the first one.
PREFIX_BREEDS = {
    "A": "Afghan Hound",
    "AZ": "Azawakh",
    "B": "Borzoi",
    "BA": "Basenji",
    "C": "Cirneco dell'Etna",
    "CP": "Chart Polski",
    "G": "Greyhound",
    "I": "Ibizan Hound",
    "IG": "Italian Greyhound",
    "IW": "Irish Wolfhound",
    "M": "Magyar Agar",
    "P": "Pharaoh Hound",
    "PM": "Portuguese Podengo Medio / Grande",
    "PPP": "Portuguese Podengo Pequeno",
    "R": "Rhodesian Ridgeback",
    "S": "Saluki",
    "SD": "Scottish Deerhound",
    "SL": "Sloughi",
    "SW": "Silken Windhound",
}

# Which header each prefix is filed under in the workbook. check.py asserts
# the same table, so a hound filed under the wrong breed is noticed.
PREFIX_SECTIONS = {
    "A": "AFGHAN", "AZ": "AZAWAKH", "B": "BORZOI", "BA": "BASENJI",
    "C": "CIRNECO DELL'ETNA", "CP": "CHART POLSKI", "G": "GREYHOUND",
    "I": "IBIZAN HOUND", "IG": "ITALIAN GREYHOUND", "IW": "IRISH WOLFHOUND",
    "M": "MAGYAR AGAR", "P": "PHARAOH HOUND", "PM": "PORTUGUESE PODENGO MEDIO",
    "PPP": "PORTUGUESE PODENGO PEQUENO", "R": "RHODESIAN RIDGEBACK",
    "S": "SALUKI", "SD": "SCOTTISH DEERHOUND", "SL": "SLOUGHI",
    "SW": "SILKEN WINDHOUND",
}

HEADERS = {
    1: "NAME", 2: "WAVE", 3: "REGISTERED NAME", 4: "OWNER", 5: "Career",
    6: "GRC", 7: "NGRC", 8: "YTD", 9: "Meet", 11: "Score", 12: "Meet",
    14: "Score", 15: "Meet", 17: "Score",
}
MEET_COLUMNS = ((9, 10, 11), (12, 13, 14), (15, 16, 17))

GRC_POINTS = 12
NATIONAL_STEP = 30

REGISTRY_COLUMNS = [
    "id", "breed_slug", "call_name", "registered_name", "owner_raw", "wave",
    "grade", "grc", "ngrc", "ytd", "rank_breed", "rank_all", "rank_career",
    "meets", "dq", "last_raced", "active", "duplicate_of",
]


# ------------------------------------------------------------------- fetch

def find_guide_url(html: str) -> str:
    match = GUIDE_HREF_RE.search(html)
    if not match:
        raise RacingParseError(
            f"No grading guide link on {GUIDE_PAGE}. The page layout changed; "
            f"look at it before trusting any parse."
        )
    href = match.group(1)
    if href.startswith("/"):
        href = SITE_URL + href
    return href


def fetch() -> Path:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    url = find_guide_url(fetch_text(GUIDE_PAGE))
    raw = fetch_bytes(url)
    name = Path(url.split("?")[0]).name
    target = RAW_DIR / name
    target.write_bytes(raw)
    print(f"Fetched {url}  {len(raw):,} bytes")
    return target


# ------------------------------------------------------------------- parse

def find_header_row(rows: list[list]) -> int:
    for index, row in enumerate(rows[:12]):
        if cell_str(row[1]) == "NAME" and cell_str(row[2]) == "WAVE":
            return index
    raise RacingParseError("header row (NAME, WAVE, ...) not found in the first 12 rows")


def parse_workbook(path: Path, source_url: str | None = None) -> dict:
    rows = read_rows_xls(path)
    header_index = find_header_row(rows)
    header = rows[header_index]
    for column, expected in HEADERS.items():
        found = cell_str(header[column]) if column < len(header) else ""
        if found != expected:
            raise RacingParseError(
                f"column {column} reads {found!r}, expected {expected!r}"
            )

    # The guide's own date sits above the registered-name column.
    date_cell = rows[header_index - 1][3] if header_index else None
    if date_cell in (None, ""):
        raise RacingParseError("guide date cell (row above the headers, column D) is empty")
    guide_date = excel_serial_to_date(date_cell)

    sections: list[dict] = []
    current: dict | None = None
    stray: list[list] = []
    seen: dict[str, int] = {}
    for row in rows[header_index + 1:]:
        header_info = section_header(row, empty_cols=(2, 4))
        if header_info:
            current = {"breed_raw": header_info["breed_raw"],
                       "note": header_info["note"], "dogs": []}
            sections.append(current)
            continue
        parsed = parse_id(row[0])
        if parsed is None:
            if any(cell_str(cell) for cell in row[:5]):
                stray.append([cell_str(cell) for cell in row[:6]])
            continue
        if current is None:
            raise RacingParseError(f"hound {parsed[2]} appears before any breed header")
        dog_id, prefix, raw_id = parsed
        # The registrars re-use a number now and then (two hounds, or one
        # hound entered twice under call-name variants). Every row is kept;
        # the second occurrence gets a -2 suffix so links stay unambiguous.
        seen[dog_id] = seen.get(dog_id, 0) + 1
        if seen[dog_id] > 1:
            dog_id = f"{dog_id}-{seen[dog_id]}"
        if prefix not in PREFIX_BREEDS:
            raise RacingParseError(
                f"unknown registration prefix {prefix!r} ({raw_id}) - add it to PREFIX_BREEDS"
            )
        meets = []
        for code_col, flag_col, score_col in MEET_COLUMNS:
            code = cell_str(row[code_col])
            score = cell_num(row[score_col])
            if not code and score is None:
                continue
            if not code:
                raise RacingParseError(f"{dog_id}: a score without a meet code")
            meets.append({
                "code": code,
                "score": score,
                "complete": cell_str(row[flag_col]).lower() != "y",
            })
        dog = {
            "id": dog_id,
            "prefix": prefix,
            "call_name": cell_str(row[1]),
            "wave": cell_num(row[2]),
            "registered_raw": cell_str(row[3]),
            "owner_raw": cell_str(row[4]),
            "dq_raw": cell_str(row[5]),
            "grc": cell_num(row[6]),
            "ngrc": cell_num(row[7]),
            "ytd": cell_num(row[8]),
            "meets": meets,
        }
        if raw_id != dog_id:
            dog["id_raw"] = raw_id
        if seen[parsed[0]] > 1:
            dog["duplicate_of"] = parsed[0]
        current["dogs"].append(dog)

    if stray:
        raise RacingParseError(
            f"{len(stray)} rows are neither hounds nor headers, e.g. {stray[:3]}"
        )
    if not sections:
        raise RacingParseError("no breed sections found")

    raw = path.read_bytes()
    return {
        "org": ORG,
        "guide_date": guide_date.isoformat(),
        "guide_date_source": "sheet",
        "season": guide_date.year,
        "source_url": source_url,
        "source_page": GUIDE_PAGE,
        "source_file": path.name,
        "sha256": sha256(raw),
        "fetched": today(),
        "columns": [cell_str(cell) for cell in header],
        "sections": sections,
    }


# ------------------------------------------------------------------- build

def titles_of(dog: dict) -> list[str]:
    """Titles the points columns say the hound has reached, cumulatively."""
    titles = []
    if (dog.get("grc") or 0) >= GRC_POINTS:
        titles.append("GRC")
    titles.extend(cumulative_titles("SGRC", super_level(dog.get("ngrc"), NATIONAL_STEP)))
    return titles


def derive(snapshot: dict) -> list[dict]:
    """Every hound in a snapshot with the site's derived fields and ranks."""
    season = snapshot["season"]
    dogs: list[dict] = []
    for section in snapshot["sections"]:
        for raw in section["dogs"]:
            dog = dict(raw)
            dog["section_raw"] = section["breed_raw"]
            dog["breed"] = PREFIX_BREEDS[dog["prefix"]]
            dog["breed_slug"] = slug(dog["breed"])
            derive_identity(dog)

            meets = []
            for meet in dog["meets"]:
                decoded = decode_or_keep(decode_lgra_meet, meet["code"])
                meets.append({
                    "code": decoded["code"], "date": decoded["date"],
                    "year": decoded["year"], "score": meet["score"],
                    "complete": meet["complete"],
                })
            dog["meets"] = meets
            dog["last_raced"] = max((m["date"] for m in meets if m["date"]), default=None)

            dq = []
            for token in re.split(r"[\s,]+", dog.pop("dq_raw").strip()):
                if token:
                    decoded = decode_or_keep(decode_lgra_meet, token)
                    dq.append({"code": decoded["code"], "date": decoded["date"]})
            dog["dq"] = dq

            computed = wave([(m["score"], m["complete"]) for m in meets])
            dog["wave_computed"] = round(computed, 3) if computed is not None else None
            dog["wave"] = round(dog["wave"], 3) if dog["wave"] is not None else None
            dog["wave_matches"] = (
                dog["wave"] is not None and computed is not None
                and abs(dog["wave"] - computed) <= 0.01
            )
            dog["grade"] = grade(dog["wave"])
            dog["titled"] = {
                "grc": (dog["grc"] or 0) >= GRC_POINTS,
                "sgrc": super_level(dog["ngrc"], NATIONAL_STEP),
            }
            dog["active"] = bool(
                (dog["ytd"] or 0) > 0
                or any(m["year"] is not None and m["year"] >= season - 1 for m in meets)
            )
            dogs.append(dog)

    # Standings: this season's National points within the breed and across
    # breeds, the figure LGRA's year-end lists rank by; career National
    # points across the whole registry.
    for breed in {dog["breed"] for dog in dogs}:
        rank_by([dog for dog in dogs if dog["breed"] == breed], "ytd", "rank_breed")
    rank_by(dogs, "ytd", "rank_all")
    rank_by(dogs, "ngrc", "rank_career")
    return dogs


def build(snapshots: list[dict]) -> tuple[dict, dict]:
    current = snapshots[-1]
    previous = snapshots[-2] if len(snapshots) > 1 else None
    season = current["season"]

    dogs = derive(current)
    prior_dogs = derive(previous) if previous else None
    movement = build_movement(
        dogs, prior_dogs, previous["guide_date"] if previous else None,
        ["wave", "grc", "ngrc", "ytd"], titles_of,
    )
    for dog in dogs:
        dog["movement"] = movement.get(dog["id"])

    active = [dog for dog in dogs if dog["active"]]
    owners = build_owners(active, ["ytd", "ngrc"], "wave")

    sections = []
    for prefix, breed in sorted(PREFIX_BREEDS.items(), key=lambda item: item[1]):
        members = [dog for dog in dogs if dog["prefix"] == prefix]
        leader = min(
            (dog for dog in members if dog["rank_breed"] == 1),
            key=lambda dog: dog["call_name"], default=None,
        )
        sections.append({
            "breed": breed,
            "slug": slug(breed),
            "prefix": prefix,
            "section_raw": PREFIX_SECTIONS[prefix],
            "registry": len(members),
            "active": sum(dog["active"] for dog in members),
            "ytd": sum((dog["ytd"] or 0) > 0 for dog in members),
            "titled": sum(dog["titled"]["grc"] for dog in members),
            "leader": {
                "id": leader["id"], "call_name": leader["call_name"],
                "ytd": leader["ytd"],
            } if leader else None,
        })

    meets_this_year = {
        m["code"] for dog in dogs for m in dog["meets"] if m["year"] == season
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
        "hounds_active": len(active),
        "hounds_ytd": sum((dog["ytd"] or 0) > 0 for dog in dogs),
        "titled_grc": sum(dog["titled"]["grc"] for dog in dogs),
        "titled_sgrc": sum(dog["titled"]["sgrc"] > 0 for dog in dogs),
        "breeds": len(sections),
        "breeds_active": sum(section["active"] > 0 for section in sections),
        "breeds_ytd": sum(section["ytd"] > 0 for section in sections),
        "meets_this_year": len(meets_this_year),
        "meets_listed": sum(len(dog["meets"]) for dog in dogs),
        "meets_undecoded": sum(m["year"] is None for dog in dogs for m in dog["meets"]),
        "owners_active": len(owners),
        "wave_agreement": round(
            sum(dog["wave_matches"] for dog in dogs if dog["wave"] is not None)
            / max(1, sum(dog["wave"] is not None for dog in dogs)), 4),
    }

    # Breed, prefix and core name are recoverable from the id and sections;
    # the recomputed WAVE is only interesting where it disagrees.
    feed_dog_fields = [
        "id", "breed", "breed_slug", "call_name", "registered_name", "titles",
        "note", "owner_raw", "owners", "wave", "wave_matches", "grade", "grc",
        "ngrc", "ytd", "titled", "rank_breed", "rank_all", "rank_career",
        "meets", "last_raced", "dq", "movement", "duplicate_of",
    ]
    def compact_dog(dog: dict) -> dict:
        row = {field: dog.get(field) for field in feed_dog_fields}
        if row["duplicate_of"] is None:
            del row["duplicate_of"]
        if not dog["wave_matches"] and dog["wave_computed"] is not None:
            row["wave_computed"] = dog["wave_computed"]
        row["meets"] = [[m["code"], m["year"], m["date"], m["score"], m["complete"]] for m in dog["meets"]]
        row["dq"] = [[d["code"], d["date"]] for d in dog["dq"]]
        return row

    feed = {
        "org": ORG,
        "name": "LGRA",
        "program": "straight racing",
        "season": season,
        "guide_date": current["guide_date"],
        "previous_guide_date": previous["guide_date"] if previous else None,
        "generated": today(),
        "source_url": current["source_url"],
        "source_page": GUIDE_PAGE,
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
            "Standings rank this season's National points (the guide's YTD "
            "column) within each breed and across breeds; career standings "
            "rank career National points (NGRC).",
            "WAVE is recomputed from the last three listed meets per Rule Book "
            "23.2 §4.2.2; wave_matches is false where the registrar's published "
            "figure differs, and the published figure is the one shown.",
            "Breed comes from the registration prefix; the guide's breed "
            "headers are checked against it.",
        ],
    }

    dogs.sort(key=lambda dog: (dog["breed"], dog["call_name"], dog["id"]))
    registry_rows = []
    for dog in dogs:
        row = dict(dog)
        row["meets"] = [[m["code"], m["year"], m["date"], m["score"], m["complete"]] for m in dog["meets"]]
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
                        help="parse this workbook instead of fetching")
    parser.add_argument("--offline", action="store_true",
                        help="rebuild the feed from archived snapshots without fetching")
    args = parser.parse_args()

    if not args.offline:
        try:
            if args.file:
                path, source_url = args.file, None
            else:
                path = fetch()
                source_url = find_guide_url(fetch_text(GUIDE_PAGE))
            snapshot = parse_workbook(path, source_url)
            write_snapshot_if_changed(SNAPSHOT_DIR, snapshot, force=args.force)
        except requests.RequestException as error:
            if not list(SNAPSHOT_DIR.glob("*.json")):
                print(f"Could not fetch the LGRA guide and no snapshot exists: {error}",
                      file=sys.stderr)
                return 1
            print(f"Could not fetch the LGRA guide; rebuilding from archived "
                  f"snapshots. {error}", file=sys.stderr)

    snapshots = load_snapshots(SNAPSHOT_DIR)
    feed, registry = build(snapshots)
    feed_bytes = write_json(FEED, feed)
    registry_bytes = write_json(REGISTRY, registry)

    stats = feed["stats"]
    print(
        f"LGRA guide {feed['guide_date']}: {stats['hounds_registry']:,} hounds in "
        f"{stats['breeds']} breeds, {stats['hounds_active']:,} active, "
        f"{stats['hounds_ytd']} with points this year, "
        f"{stats['titled_grc']:,} GRC, {stats['titled_sgrc']} SGRC, "
        f"WAVE agreement {stats['wave_agreement']:.1%}"
    )
    print(f"Wrote {FEED.name} ({feed_bytes:,} bytes) and "
          f"{REGISTRY.name} ({registry_bytes:,} bytes)")

    # The owner-split heuristics were tuned on ASFA's owner strings; show the
    # busiest LGRA keys so a formatting difference is noticed, not published.
    top = Counter()
    for owner in feed["owners"]:
        top[f"{owner['key']}  <-  {owner['name']}"] = owner["hounds"]
    print("Busiest owner keys:")
    for line, hounds in top.most_common(12):
        print(f"  {hounds:3d}  {line}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
