"""Assemble parsed snapshots into the single JSON bundle the site loads.

Reads every data/snapshots/*.json produced by parse.py and writes
data/season.json: the current standings, breed percentiles, owner and region
aggregates, and movement since the previous publication.

Leaderboards are deliberately *not* precomputed. The hound list is small enough
to sort in the browser, and one source of truth beats two that can drift.

Usage:
    python tools/build.py
"""

from __future__ import annotations

import json
import sys
from datetime import date, timezone, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT_DIR = ROOT / "data" / "snapshots"
OUTPUT = ROOT / "data" / "season.json"

SOURCE_URL = "https://www.asfa.org/20/index.htm"


def load_snapshots() -> list[dict]:
    paths = sorted(SNAPSHOT_DIR.glob("*.json"))
    if not paths:
        raise SystemExit("No parsed snapshots. Run tools/parse.py first.")
    snapshots = [json.loads(path.read_text(encoding="utf-8")) for path in paths]
    snapshots.sort(key=lambda snap: snap["as_of"])
    return snapshots


def percentile(rank: int, total_competing: int | None) -> float | None:
    """Share of the breed this hound sits at or above, as a "top N%" figure.

    Denominator is the count ASFA publishes for the breed, not the ~20 hounds
    on the list. Ranking 4th of 25 is top 16%; ranking 4th of the 20 shown
    would misleadingly read as top 20%.
    """
    if not total_competing or rank > total_competing:
        return None
    return round(100.0 * rank / total_competing, 1)


def hound_key(dog: dict) -> str:
    """Group key for the same physical hound appearing in more than one section.

    The Singles stake re-ranks hounds that also compete in their breed stake —
    M.Murray's Saluki "Onyx" is the Singles entry "SA Onyx", with the same six
    BIF on both rows. Summing across sections would double-count, so the site
    groups on registered name plus owner and takes the maximum of each stat
    rather than the sum. That is exact if the two rows describe one record and
    conservative if they do not; it can never inflate.
    """
    owner = dog["owners"][0]["key"] if dog["owners"] else ""
    from names import slugify

    return f"{slugify(dog['core_name'])}|{owner}"


def index_by_id(snapshot: dict) -> dict[str, dict]:
    return {
        dog["id"]: dog
        for section in snapshot["sections"]
        for dog in section["dogs"]
    }


def build_movement(current: dict, previous: dict | None) -> dict[str, dict]:
    """Rank and point deltas against the previous publication."""
    if previous is None:
        return {}

    before = index_by_id(previous)
    movement: dict[str, dict] = {}
    for dog_id, dog in index_by_id(current).items():
        prior = before.get(dog_id)
        if prior is None:
            movement[dog_id] = {
                "since": previous["as_of"],
                "new": True,
                "rank_delta": None,
                "points_delta": None,
            }
            continue
        movement[dog_id] = {
            "since": previous["as_of"],
            "new": False,
            # Positive means the hound climbed: rank 5 -> rank 2 is +3.
            "rank_delta": prior["rank"] - dog["rank"],
            "points_delta": dog["points"] - prior["points"],
        }
    return movement


def dedupe_hounds(dogs: list[dict]) -> list[dict]:
    """Collapse multi-section entries to one record per hound.

    Stats are combined with max(), not sum() — see hound_key() for why.
    """
    grouped: dict[str, dict] = {}
    for dog in dogs:
        existing = grouped.get(dog["hound_key"])
        if existing is None:
            grouped[dog["hound_key"]] = dict(dog)
            continue
        for stat in ("points", "bob", "bif"):
            existing[stat] = max(existing[stat], dog[stat])
        if dog["rank"] < existing["rank"]:
            existing["rank"] = dog["rank"]
    return list(grouped.values())


def build_owners(dogs: list[dict]) -> list[dict]:
    """Aggregate by owning party.

    A co-owned hound counts toward every party named on the row; there is no
    way to apportion it and no reason to try.
    """
    owners: dict[str, dict] = {}
    for dog in dedupe_hounds(dogs):
        for owner in dog["owners"]:
            key = owner["key"]
            record = owners.setdefault(key, {
                "key": key,
                "name": owner["name"],
                "names": set(),
                "hounds": 0,
                "points": 0,
                "bob": 0,
                "bif": 0,
                "firsts": 0,
                "breeds": set(),
                "best_rank": None,
                "dog_ids": [],
            })
            record["names"].add(owner["name"])
            record["hounds"] += 1
            record["points"] += dog["points"]
            record["bob"] += dog["bob"]
            record["bif"] += dog["bif"]
            record["firsts"] += 1 if dog["rank"] == 1 else 0
            record["breeds"].add(dog["breed"])
            record["dog_ids"].append(dog["id"])
            best = record["best_rank"]
            record["best_rank"] = dog["rank"] if best is None else min(best, dog["rank"])

    result = []
    for record in owners.values():
        # Prefer the longest spelling seen; it is usually the most complete.
        record["name"] = max(record["names"], key=len)
        record["breeds"] = sorted(record["breeds"])
        del record["names"]
        result.append(record)

    result.sort(key=lambda r: (-r["points"], -r["hounds"], r["name"]))
    return result


def build_regions(dogs: list[dict]) -> list[dict]:
    regions: dict[int, dict] = {}
    for dog in dedupe_hounds(dogs):
        if dog["region"] is None:
            continue
        record = regions.setdefault(dog["region"], {
            "region": dog["region"], "hounds": 0,
            "points": 0, "bob": 0, "bif": 0, "firsts": 0,
        })
        record["hounds"] += 1
        record["points"] += dog["points"]
        record["bob"] += dog["bob"]
        record["bif"] += dog["bif"]
        record["firsts"] += 1 if dog["rank"] == 1 else 0
    return [regions[key] for key in sorted(regions)]


def build(snapshots: list[dict]) -> dict:
    current = snapshots[-1]
    previous = snapshots[-2] if len(snapshots) > 1 else None
    movement = build_movement(current, previous)

    sections = []
    dogs = []
    for section in current["sections"]:
        sections.append({
            "breed": section["breed"],
            "slug": section["breed_slug"],
            "is_breed": section["is_breed"],
            "total_competing": section["total_competing"],
            "ranked": len(section["dogs"]),
        })
        for dog in section["dogs"]:
            dogs.append({
                "id": dog["id"],
                "hound_key": hound_key(dog),
                "breed": section["breed"],
                "breed_slug": section["breed_slug"],
                "is_breed": section["is_breed"],
                "total_competing": section["total_competing"],
                "rank": dog["rank"],
                "call_name": dog["call_name"],
                "registered_name": dog["registered_name"],
                "core_name": dog["core_name"],
                "owner_raw": dog["owner_raw"],
                "owners": dog["owners"],
                "region": dog["region"],
                "points": dog["points"],
                "bob": dog["bob"],
                "bif": dog["bif"],
                "provisional": dog["provisional"],
                "percentile": percentile(dog["rank"], section["total_competing"]),
                "movement": movement.get(dog["id"]),
            })

    unique = dedupe_hounds(dogs)
    stats = {
        # "entries" counts rows as published; a hound ranked in both its breed
        # and the Singles stake appears twice. "hounds" counts individuals.
        "entries": len(dogs),
        "hounds_ranked": len(unique),
        "sections": len(sections),
        "sections_with_hounds": sum(1 for s in sections if s["ranked"]),
        # The Singles stake draws from the breed sections rather than adding
        # new hounds, so it is left out of the population total. Every other
        # section counts a distinct set of hounds.
        "total_competing": sum(
            s["total_competing"] or 0
            for s in sections
            if s["breed"] != "Singles"
        ),
        "points": sum(dog["points"] for dog in unique),
        "bob": sum(dog["bob"] for dog in unique),
        "bif": sum(dog["bif"] for dog in unique),
        "hounds_with_bif": sum(1 for dog in unique if dog["bif"]),
        "owners": len({o["key"] for dog in unique for o in dog["owners"]}),
    }

    return {
        "season": current["season"],
        "as_of": current["as_of"],
        "previous_as_of": previous["as_of"] if previous else None,
        "generated": datetime.now(timezone.utc).date().isoformat(),
        "source_url": SOURCE_URL,
        "snapshots": [snap["as_of"] for snap in snapshots],
        "stats": stats,
        "sections": sections,
        "dogs": dogs,
        "owners": build_owners(dogs),
        "regions": build_regions(dogs),
    }


def main() -> int:
    bundle = build(load_snapshots())
    OUTPUT.write_text(
        json.dumps(bundle, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    size_kb = OUTPUT.stat().st_size / 1024
    stats = bundle["stats"]
    print(
        f"{OUTPUT.relative_to(ROOT)}  {size_kb:.0f} KB\n"
        f"  season {bundle['season']} through {bundle['as_of']}"
        f"  ({len(bundle['snapshots'])} snapshot(s))\n"
        f"  {stats['hounds_ranked']} hounds ranked across "
        f"{stats['sections_with_hounds']} of {stats['sections']} sections\n"
        f"  {stats['points']} points, {stats['bob']} BOB, {stats['bif']} BIF "
        f"held by {stats['hounds_with_bif']} hounds, {stats['owners']} owners"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
