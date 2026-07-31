"""Independently verify data/season.json against the archived snapshots.

build.py and this script derive the same numbers by different routes. If they
disagree, one of them has a bug — which is the point.

Usage:
    python tools/check.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT_DIR = ROOT / "data" / "snapshots"
SEASON = ROOT / "data" / "season.json"

PAGE_ENCODING = "cp1252"


class Checker:
    def __init__(self) -> None:
        self.failures: list[str] = []
        self.checks = 0

    def expect(self, condition: bool, message: str) -> None:
        self.checks += 1
        if not condition:
            self.failures.append(message)

    def report(self) -> int:
        if self.failures:
            print(f"FAILED - {len(self.failures)} of {self.checks} checks:\n")
            for failure in self.failures:
                print(f"  - {failure}")
            return 1
        print(f"All {self.checks} checks passed.")
        return 0


def count_html_rows(path: Path) -> tuple[int, int]:
    """Count data rows and sections straight out of the HTML, ignoring parse.py.

    Deliberately crude: if the careful parser silently drops rows, a crude count
    is what catches it.
    """
    html = path.read_bytes().decode(PAGE_ENCODING)
    # Back up to the opening <tr of the first header row, or its own row is
    # left without a start tag and goes uncounted.
    marker = html.find('class="tableheader"')
    body = html[html.rfind("<tr", 0, marker):]
    rows = re.findall(r"<tr\b[^>]*>(.*?)</tr>", body, re.DOTALL | re.IGNORECASE)

    sections = data_rows = 0
    for row in rows:
        cells = re.findall(r"<td\b[^>]*>(.*?)</td>", row, re.DOTALL | re.IGNORECASE)
        if len(cells) != 8:
            continue
        text = [re.sub(r"<[^>]+>", "", c).replace("&nbsp;", " ").strip() for c in cells]
        if "total competing" in " ".join(text).lower():
            sections += 1
        elif any(text):
            data_rows += 1
    return sections, data_rows


def main() -> int:
    if not SEASON.exists():
        print("data/season.json missing. Run tools/build.py first.", file=sys.stderr)
        return 1

    season = json.loads(SEASON.read_text(encoding="utf-8"))
    check = Checker()
    dogs = season["dogs"]

    # 1. Row counts survive the round trip from raw HTML to season.json.
    latest_html = SNAPSHOT_DIR / f"{season['as_of']}.html"
    html_sections, html_rows = count_html_rows(latest_html)
    check.expect(
        html_sections == len(season["sections"]),
        f"section count: HTML has {html_sections}, season.json has "
        f"{len(season['sections'])}",
    )
    check.expect(
        html_rows == season["stats"]["entries"],
        f"entry count: HTML has {html_rows}, season.json has "
        f"{season['stats']['entries']}",
    )

    # 2. Every hound belongs to a declared section, and section counts add up.
    by_section: dict[str, int] = {}
    for dog in dogs:
        by_section[dog["breed_slug"]] = by_section.get(dog["breed_slug"], 0) + 1
    for section in season["sections"]:
        check.expect(
            by_section.get(section["slug"], 0) == section["ranked"],
            f"{section['breed']}: section says {section['ranked']} ranked, "
            f"dogs list has {by_section.get(section['slug'], 0)}",
        )
        if section["total_competing"] is not None:
            check.expect(
                section["ranked"] <= section["total_competing"],
                f"{section['breed']}: {section['ranked']} ranked exceeds "
                f"{section['total_competing']} competing",
            )

    # 3. Percentiles are consistent with rank and the published denominator.
    for dog in dogs:
        if dog["percentile"] is None:
            check.expect(
                not dog["total_competing"] or dog["rank"] > dog["total_competing"],
                f"{dog['call_name']} ({dog['breed']}): percentile is null but "
                f"rank {dog['rank']} of {dog['total_competing']} is computable",
            )
            continue
        expected = round(100.0 * dog["rank"] / dog["total_competing"], 1)
        check.expect(
            dog["percentile"] == expected,
            f"{dog['call_name']} ({dog['breed']}): percentile "
            f"{dog['percentile']} != {expected}",
        )
        check.expect(
            0 < dog["percentile"] <= 100,
            f"{dog['call_name']} ({dog['breed']}): percentile out of range",
        )

    # 4. Rank 1 is always the best percentile within its section.
    for section in season["sections"]:
        members = [d for d in dogs if d["breed_slug"] == section["slug"]]
        scored = [d for d in members if d["percentile"] is not None]
        if scored:
            best = min(scored, key=lambda d: d["percentile"])
            check.expect(
                best["rank"] == 1,
                f"{section['breed']}: best percentile belongs to rank "
                f"{best['rank']}, not rank 1",
            )

    # 5. Season totals equal a naive re-sum over deduplicated hounds.
    # BOB and BIF cannot be won in the Singles stake or the LCI divisions
    # (Running Rules Ch. V §5(d), §10, §11), so they are credited only from
    # breed sections - see creditable() in build.py.
    def credit(dog: dict, stat: str) -> int:
        return dog[stat] if dog["is_breed"] else 0

    seen: dict[str, dict] = {}
    for dog in dogs:
        existing = seen.get(dog["hound_key"])
        if existing is None:
            record = dict(dog)
            record["bob"] = credit(dog, "bob")
            record["bif"] = credit(dog, "bif")
            seen[dog["hound_key"]] = record
        else:
            existing["points"] = max(existing["points"], dog["points"])
            existing["bob"] = max(existing["bob"], credit(dog, "bob"))
            existing["bif"] = max(existing["bif"], credit(dog, "bif"))
    unique = list(seen.values())

    # No aggregate may carry a BOB or BIF from a section that cannot award one.
    breed_only = {
        stat: sum(d[stat] for d in dogs if d["is_breed"]) for stat in ("bob", "bif")
    }
    for stat in ("bob", "bif"):
        check.expect(
            season["stats"][stat] == breed_only[stat],
            f"stats.{stat} is {season['stats'][stat]} but breed sections hold "
            f"{breed_only[stat]} - a non-breed section is being credited",
        )
    for region in season["regions"]:
        for stat in ("bob", "bif"):
            expected = sum(
                credit(d, stat) for d in unique if d["region"] == region["region"]
            )
            check.expect(
                region[stat] == expected,
                f"region {region['region']}: {stat} is {region[stat]}, "
                f"breed-only re-sum says {expected}",
            )

    for stat in ("points", "bob", "bif"):
        total = sum(d[stat] for d in unique)
        check.expect(
            season["stats"][stat] == total,
            f"stats.{stat}: season.json says {season['stats'][stat]}, "
            f"re-sum says {total}",
        )
    check.expect(
        season["stats"]["hounds_ranked"] == len(unique),
        f"stats.hounds_ranked: {season['stats']['hounds_ranked']} != {len(unique)}",
    )

    # 6. Owner aggregates match a re-sum, and no hound is double counted.
    owner_totals: dict[str, dict] = {}
    for dog in unique:
        for owner in dog["owners"]:
            # Aggregate by person ("entity"), not by name ("key") - one name
            # can cover two owners in different regions.
            record = owner_totals.setdefault(
                owner["entity"], {"hounds": 0, "points": 0, "bob": 0, "bif": 0}
            )
            record["hounds"] += 1
            for stat in ("points", "bob", "bif"):
                record[stat] += dog[stat]

    check.expect(
        len(owner_totals) == len(season["owners"]),
        f"owner count: {len(season['owners'])} in season.json, "
        f"{len(owner_totals)} recomputed",
    )
    for owner in season["owners"]:
        expected = owner_totals.get(owner["key"])
        if expected is None:
            check.expect(False, f"owner {owner['key']} not found in re-sum")
            continue
        for stat in ("hounds", "points", "bob", "bif"):
            check.expect(
                owner[stat] == expected[stat],
                f"owner {owner['name']}: {stat} is {owner[stat]}, "
                f"re-sum says {expected[stat]}",
            )

    # 7. Movement matches a direct diff of the two newest snapshots.
    if season["previous_as_of"]:
        prev = json.loads(
            (SNAPSHOT_DIR / f"{season['previous_as_of']}.json").read_text("utf-8")
        )
        before = {
            d["id"]: d for s in prev["sections"] for d in s["dogs"]
        }
        for dog in dogs:
            movement = dog["movement"]
            check.expect(movement is not None, f"{dog['id']}: movement missing")
            if movement is None:
                continue
            prior = before.get(dog["id"])
            if prior is None:
                check.expect(
                    movement["new"], f"{dog['id']}: absent before but not flagged new"
                )
            else:
                check.expect(
                    movement["rank_delta"] == prior["rank"] - dog["rank"],
                    f"{dog['id']}: rank_delta {movement['rank_delta']} != "
                    f"{prior['rank'] - dog['rank']}",
                )
                check.expect(
                    movement["points_delta"] == dog["points"] - prior["points"],
                    f"{dog['id']}: points_delta mismatch",
                )
    else:
        check.expect(
            all(d["movement"] is None for d in dogs),
            "only one snapshot exists but movement data is present",
        )

    # 8. Ids are unique.
    ids = [d["id"] for d in dogs]
    check.expect(len(ids) == len(set(ids)), "duplicate dog ids in season.json")

    # 9. Owner identity: one entity never spans two home regions, every owner
    #    mention on a hound resolves to a real owner record, and a split name
    #    really does have distinct regions.
    by_entity = {owner["key"]: owner for owner in season["owners"]}
    for dog in dogs:
        for owner in dog["owners"]:
            check.expect(
                owner["entity"] in by_entity,
                f"{dog['id']}: owner entity {owner['entity']} has no owner record",
            )
    for owner in season["owners"]:
        member_regions = {
            dog["region"]
            for dog in dogs
            for mention in dog["owners"]
            if mention["entity"] == owner["key"] and dog["region"] is not None
        }
        if owner["region"] is not None:
            check.expect(
                owner["region"] in member_regions or not member_regions,
                f"owner {owner['name']} is Region {owner['region']} but their "
                f"hounds carry {sorted(member_regions)}",
            )

    split_names: dict[str, list] = {}
    for owner in season["owners"]:
        split_names.setdefault(owner["owner_key"], []).append(owner)
    for owner_key, entities in split_names.items():
        if len(entities) == 1:
            continue
        regions = [e["region"] for e in entities]
        check.expect(
            len(regions) == len(set(regions)),
            f"{owner_key} is split into entities sharing a region: {regions}",
        )

    check_trials(check)
    return check.report()


def check_trials(check: Checker) -> None:
    """Verify data/trials.json against the archived monthly pages."""
    path = ROOT / "data" / "trials.json"
    if not path.exists():
        check.expect(False, "data/trials.json missing - run tools/trials.py")
        return

    trials = json.loads(path.read_text(encoding="utf-8"))
    rows = trials["trials"]

    # Crude count straight out of the raw HTML, independent of trials.py.
    raw_dir = ROOT / "data" / "trials" / "raw"
    counted = 0
    for month in trials["months"]:
        page = raw_dir / f"{month}.html"
        if not page.exists():
            check.expect(False, f"archived page missing: {page.name}")
            continue
        html = page.read_bytes().decode("cp1252", errors="replace")
        for tr in re.findall(r"<tr\b[^>]*>(.*?)</tr>", html, re.DOTALL | re.I):
            if not re.search(r'href="#R\d+"', tr):
                continue
            cells = re.findall(r"<td\b[^>]*>(.*?)</td>", tr, re.DOTALL | re.I)
            if len(cells) == 2 and re.search(r"Entry:\s*\d+", cells[1]):
                counted += 1
    check.expect(
        counted == len(rows),
        f"trial count: raw HTML has {counted}, trials.json has {len(rows)}",
    )

    check.expect(
        trials["stats"]["entries"] == sum(r["entries"] for r in rows),
        "trials stats.entries does not match a re-sum of the trial rows",
    )

    # Region and club aggregates must re-sum exactly.
    for bucket, key in (("by_region", "region"), ("by_club", "club_slug")):
        totals: dict = {}
        for row in rows:
            totals[row[key]] = totals.get(row[key], 0) + row["entries"]
        for entry in trials[bucket]:
            lookup = entry["region"] if bucket == "by_region" else entry["slug"]
            check.expect(
                entry["entries"] == totals.get(lookup),
                f"{bucket} {lookup}: {entry['entries']} != re-sum "
                f"{totals.get(lookup)}",
            )

    # Every trial is either assigned a region or openly unassigned.
    for row in rows:
        if row["region"] is None:
            check.expect(
                row["club_raw"] in trials["unmatched_clubs"],
                f"{row['club_raw']} has no region but is not listed as unmatched",
            )
        else:
            check.expect(
                1 <= row["region"] <= 10,
                f"{row['club_raw']}: region {row['region']} out of range",
            )

    # The club listing must carry no liaison contact data.
    clubs_path = ROOT / "data" / "clubs.json"
    if clubs_path.exists():
        text = clubs_path.read_text(encoding="utf-8")
        for label, pattern in (
            ("email address", r"[\w.+-]+@[\w-]+\.[\w.]+"),
            ("phone number", r"\(\d{3}\)\s*\d{3}-\d{4}"),
            ("street address", r"\b\d+\s+\w+\s+(?:Street|St|Road|Rd|Drive|Dr|"
                              r"Avenue|Ave|Lane|Ln|Court|Ct|Place|Pl|Circle)\b"),
        ):
            found = re.findall(pattern, text, re.IGNORECASE)
            # The source_url and note field legitimately contain neither.
            check.expect(
                not found,
                f"data/clubs.json contains a {label}: {found[:2]} - the club "
                f"listing's contact columns must never be extracted",
            )


if __name__ == "__main__":
    sys.exit(main())
