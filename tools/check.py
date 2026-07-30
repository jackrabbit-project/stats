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
    seen: dict[str, dict] = {}
    for dog in dogs:
        existing = seen.get(dog["hound_key"])
        if existing is None:
            seen[dog["hound_key"]] = dict(dog)
        else:
            for stat in ("points", "bob", "bif"):
                existing[stat] = max(existing[stat], dog[stat])
    unique = list(seen.values())

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
            record = owner_totals.setdefault(
                owner["key"], {"hounds": 0, "points": 0, "bob": 0, "bif": 0}
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

    return check.report()


if __name__ == "__main__":
    sys.exit(main())
