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

    # 10. Owner merges (a bare surname into its initialed entity, a single
    #     initial into its household), re-derived from the raw snapshot where
    #     the pre-merge keys survive. The recorded merge set must equal a
    #     fresh computation of the rule — nothing merged that should not be,
    #     nothing left unmerged that qualifies.
    merges = season["review"].get("owner_merges", {})
    snap_path = ROOT / "data" / "snapshots" / f"{season['as_of']}.json"
    snapshot = json.loads(snap_path.read_text(encoding="utf-8"))
    raw_keys: set[str] = set()
    first_listed: dict[str, set] = {}
    for sec in snapshot["sections"]:
        for dog in sec["dogs"]:
            if not dog["owners"]:
                continue
            raw_keys.update(m["key"] for m in dog["owners"])
            if dog.get("region") is not None:
                first_listed.setdefault(
                    dog["owners"][0]["key"], set()).add(dog["region"])
    def initials_of(key: str) -> list[str]:
        return key.split("|", 1)[1].split(".") if "|" in key else []

    expected: dict[str, str] = {}
    for key in sorted(raw_keys):
        surname = key.split("|", 1)[0]
        initials = initials_of(key)
        if len(initials) > 1:
            continue
        if not initials:
            rivals = [k for k in raw_keys
                      if "|" in k and k.split("|", 1)[0] == surname]
        else:
            rivals = [k for k in raw_keys
                      if len(initials_of(k)) > 1 and k.split("|", 1)[0] == surname
                      and initials[0] in initials_of(k)]
        if len(rivals) == 1 and first_listed.get(key, set()) <= \
                first_listed.get(rivals[0], set()):
            expected[key] = rivals[0]
    check.expect(
        merges == expected,
        f"owner merges disagree with re-derivation: "
        f"recorded {merges}, expected {expected}",
    )
    merged_away = set(merges)
    check.expect(
        not any(m["key"] in merged_away for d in dogs for m in d["owners"]),
        "a merged owner key survived into season.json",
    )
    check.expect(
        all(len({m["key"] for m in d["owners"]}) == len(d["owners"]) for d in dogs),
        "a hound lists the same owner entity twice",
    )

    check_trials(check)
    check_events(check)
    check_titles(check)
    check_racing(check, "lgra")
    check_racing(check, "aok9")
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

    # Program split: each trial's flights plus its absentees equal its Entry
    # figure, and the season totals re-derive by a different route — splitting
    # the flat page at its Entry: markers instead of the detail anchors
    # trials.py walks.
    derived = {"breed": 0, "singles": 0, "lci": 0}
    token_re = re.compile(
        r"(LCI (?:LARGE|SMALL|SIGHTHOUND MIX))"
        r"|([A-Z][A-Z &().'-]{2,40}?)\s+Judges?:"
        r"|Flight [A-Z]\((\d+)")
    for month in trials["months"]:
        page = raw_dir / f"{month}.html"
        if not page.exists():
            continue
        flat = page.read_bytes().decode("cp1252", errors="replace")
        flat = re.sub(r"<[^>]+>", " ", flat).replace("&nbsp;", " ")
        flat = re.sub(r"\s+", " ", flat)
        parts = re.split(r"Entry:\s*(\d+)", flat)
        for idx in range(1, len(parts) - 1, 2):
            block = parts[idx + 1]
            if "Judge" not in block:
                continue
            program = "breed"
            for token in token_re.finditer(block):
                lci, header, flight = token.groups()
                if lci:
                    program = "lci"
                elif header:
                    program = ("singles" if "SINGLE" in header
                               else "lci" if "LCI" in header else "breed")
                elif flight:
                    derived[program] += int(flight)
    for key in ("breed", "singles", "lci"):
        check.expect(
            trials["stats"]["by_program"][key] == derived[key],
            f"by_program.{key}: trials.json says "
            f"{trials['stats']['by_program'][key]}, Entry-split re-derivation "
            f"says {derived[key]}",
        )
    for row in rows:
        split = row["by_program"]
        check.expect(
            all(v >= 0 for v in split.values())
            and sum(split.values()) == row["entries"],
            f"{row['date']} {row['club_raw']}: program split {split} does not "
            f"reconcile with Entry {row['entries']}",
        )
    for key in ("breed", "singles", "lci", "absent"):
        check.expect(
            trials["stats"]["by_program"][key]
            == sum(r["by_program"][key] for r in rows),
            f"stats.by_program.{key} does not re-sum from the trial rows",
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


def check_events(check: Checker) -> None:
    """Verify data/events.json against the archived schedule page."""
    path = ROOT / "data" / "events.json"
    if not path.exists():
        check.expect(False, "data/events.json missing - run tools/events.py")
        return

    feed = json.loads(path.read_text(encoding="utf-8"))
    events = feed["events"]

    # Crude row count straight from the newest archived page: 13-cell rows whose
    # day cells hold at least one number, skipping the weekday header strips.
    raw_dir = ROOT / "data" / "events" / "raw"
    pages = sorted(raw_dir.glob("*.html"))
    if not pages:
        check.expect(False, "no archived schedule page under data/events/raw/")
        return
    html = pages[-1].read_bytes().decode("cp1252", errors="replace")
    counted = 0
    for tr in re.findall(r"<tr\b[^>]*>(.*?)</tr>", html, re.DOTALL | re.I):
        cells = re.findall(r"<td\b[^>]*>(.*?)</td>", tr, re.DOTALL | re.I)
        if len(cells) != 13:
            continue
        days = [re.sub(r"<[^>]+>", "", c).replace("&nbsp;", " ").strip()
                for c in cells[0:7]]
        days = [d for d in days if d]
        if days and all(re.fullmatch(r"\d{1,2}", d) for d in days):
            counted += 1
    check.expect(
        counted == len(events),
        f"event count: raw HTML has {counted}, events.json has {len(events)}",
    )

    check.expect(
        feed["stats"]["events"] == len(events)
        and feed["stats"]["cancelled"] == sum(1 for e in events if e["cancelled"])
        and feed["stats"]["with_premium"] == sum(1 for e in events if e["premium_url"]),
        "events stats do not re-sum from the rows",
    )

    iso = re.compile(r"\d{4}-\d{2}-\d{2}$")
    for event in events:
        tag = f"{event['start']} {event['initials']}"
        check.expect(
            bool(iso.match(event["start"])) and bool(iso.match(event["end"]))
            and event["start"] <= event["end"],
            f"{tag}: bad date range {event['start']}..{event['end']}",
        )
        check.expect(
            event["region"] is None or 1 <= event["region"] <= 10,
            f"{tag}: region {event['region']} out of range",
        )
        check.expect(
            event["state"] is None or re.fullmatch(r"[A-Z]{2}", event["state"]) is not None,
            f"{tag}: state {event['state']!r} is not a 2-letter code",
        )
        check.expect(
            event["premium_url"] is None
            or event["premium_url"].startswith("https://www.asfa.org/"),
            f"{tag}: premium URL off-site: {event['premium_url']}",
        )
        check.expect(
            event["club"] != "" and event["initials"] != "",
            f"{tag}: empty club",
        )

    # An inferred premium is only legitimate when a same-club, same-state
    # neighbour within one day carries that exact URL natively.
    from datetime import date as _date
    for event in events:
        if not event.get("premium_inferred"):
            continue
        tag = f"{event['start']} {event['initials']}"
        native = [
            s for s in events
            if s is not event
            and s["initials"] == event["initials"]
            and s["state"] == event["state"]
            and s["premium_url"] == event["premium_url"]
            and not s.get("premium_inferred")
            and (
                abs((_date.fromisoformat(s["start"])
                     - _date.fromisoformat(event["end"])).days) <= 1
                or abs((_date.fromisoformat(event["start"])
                        - _date.fromisoformat(s["end"])).days) <= 1
            )
        ]
        check.expect(
            bool(native),
            f"{tag}: inferred premium has no adjacent native source",
        )

    # Every unmatched abbreviation must still appear as its own club name -
    # shown as published, never guessed into a different club.
    names = {e["initials"]: e["club"] for e in events}
    for initials in feed["unmatched_initials"]:
        check.expect(
            names.get(initials) == initials,
            f"unmatched {initials} was renamed to {names.get(initials)!r}",
        )

    # The privacy rule extends to the schedule feed.
    text = path.read_text(encoding="utf-8")
    for label, pattern in (
        ("email address", r"[\w.+-]+@[\w-]+\.[\w.]+"),
        ("phone number", r"\(\d{3}\)\s*\d{3}-\d{4}"),
    ):
        found = re.findall(pattern, text, re.IGNORECASE)
        check.expect(
            not found,
            f"data/events.json contains a {label}: {found[:2]}",
        )


def check_titles(check: Checker) -> None:
    """Verify data/titles.json against the archived title listing."""
    path = ROOT / "data" / "titles.json"
    if not path.exists():
        check.expect(False, "data/titles.json missing - run tools/titles.py")
        return

    feed = json.loads(path.read_text(encoding="utf-8"))
    rows = feed["titles"]
    season = feed["season"]

    raw_path = ROOT / "data" / "titles" / "raw" / f"{feed['as_of']}.html"
    if not raw_path.exists():
        check.expect(False, f"archived title page missing: {raw_path.name}")
        return

    # Crude count straight out of the raw page, independent of titles.py: a
    # titled hound cannot have been *born* this season (hounds enter at a
    # year old), so every mention of the season year is an earned date -
    # except the navigation's "{year} ASFA II" link and the page's own
    # "through {date}, {year}" coverage line.
    text = raw_path.read_bytes().decode("cp1252", errors="replace")
    text = re.sub(r"<script.*?</script>|<style.*?</style>", " ", text,
                  flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text).replace("&nbsp;", " ")
    text = re.sub(r"\s+", " ", text)
    counted = len(re.findall(rf"\b{season}\b", text))
    counted += len(re.findall(rf"\b\d{{1,2}}-[A-Za-z]{{3,9}}-{season % 100}\b", text))
    counted -= len(re.findall(rf"{season}\s*ASFA\s*II\b", text))
    counted -= len(re.findall(
        rf"through\s+[A-Za-z]{{3,9}}\.?\s*\d{{1,2}},?\s+{season}", text))
    check.expect(
        counted == len(rows),
        f"title count: raw page has {counted} season dates, titles.json has "
        f"{len(rows)}",
    )

    # Stats re-sum from the rows.
    from collections import Counter as _Counter
    stats = feed["stats"]
    check.expect(stats["total"] == len(rows), "titles stats.total mismatch")
    for bucket, key in (("by_program", "program"), ("by_title", "title_abbr"),
                        ("by_section", "section")):
        check.expect(
            stats[bucket] == dict(_Counter(r[key] for r in rows)),
            f"titles stats.{bucket} does not re-sum from the rows",
        )
    check.expect(
        stats["matched_to_profiles"] == sum(1 for r in rows if r["dog_id"]),
        "titles stats.matched_to_profiles mismatch",
    )

    # Program, section and title must tell one story per row, and dates must
    # sit inside the season and the page's stated coverage.
    lci_abbrs = {"LCI", "LCC", "VLCC", "LCA", "LCE"}
    for row in rows:
        tag = f"{row['call_name']} ({row['section']})"
        base = row["title_abbr"].rstrip("0123456789")
        expected_program = ("lci" if base in lci_abbrs
                            else "singles" if base in ("TCP", "CPX")
                            else "breed")
        check.expect(row["program"] == expected_program,
                     f"{tag}: program {row['program']} != {expected_program}")
        if expected_program == "lci":
            check.expect(row["section"].startswith("LCI"),
                         f"{tag}: LCI title outside an LCI section")
        elif expected_program == "singles":
            check.expect(row["section"] == "Singles",
                         f"{tag}: Singles title outside the Singles section")
        else:
            check.expect(
                not row["section"].startswith("LCI")
                and row["section"] != "Singles",
                f"{tag}: breed title inside {row['section']}")
        check.expect(
            row["date"].startswith(f"{season}-") and row["date"] <= feed["as_of"],
            f"{tag}: date {row['date']} outside season/coverage")
        check.expect(bool(row["registered_name"]), f"{tag}: empty registered name")

    # No record parsed twice, and every profile link points at a real hound.
    keys = [(r["section"], r["title_abbr"], r["registered_raw"]) for r in rows]
    check.expect(len(keys) == len(set(keys)), "duplicate title rows parsed")
    season_ids = {
        d["id"] for d in json.loads(SEASON.read_text(encoding="utf-8"))["dogs"]
    }
    for row in rows:
        if row["dog_id"] is not None:
            check.expect(row["dog_id"] in season_ids,
                         f"{row['call_name']}: dog_id {row['dog_id']} not in season.json")

    # The privacy rule extends to the titles feed.
    body = path.read_text(encoding="utf-8")
    for label, pattern in (
        ("email address", r"[\w.+-]+@[\w-]+\.[\w.]+"),
        ("phone number", r"\(\d{3}\)\s*\d{3}-\d{4}"),
    ):
        found = re.findall(pattern, body, re.IGNORECASE)
        check.expect(
            not found,
            f"data/titles.json contains a {label}: {found[:2]}",
        )


RACING = {
    # Everything a re-derivation needs, restated here rather than imported
    # from tools/racing.py: two routes to the same numbers is the point.
    "lgra": {
        "waves": ["wave"],
        "meet_streams": ["meets"],
        "champion": [("grc", "titled_grc", "grc")],
        "supreme": [("ngrc", "sgrc")],
        "career_ranks": [("ngrc", "rank_career")],
        "owner_sums": ["ytd", "ngrc"],
        "owner_best": "wave",
        "wave_agreement": 0.98,
        "expected_sections": {
            "A": "AFGHAN", "AZ": "AZAWAKH", "B": "BORZOI", "BA": "BASENJI",
            "C": "CIRNECO DELL'ETNA", "CP": "CHART POLSKI", "G": "GREYHOUND",
            "I": "IBIZAN HOUND", "IG": "ITALIAN GREYHOUND", "IW": "IRISH WOLFHOUND",
            "M": "MAGYAR AGAR", "P": "PHARAOH HOUND",
            "PM": "PORTUGUESE PODENGO MEDIO", "PPP": "PORTUGUESE PODENGO PEQUENO",
            "R": "RHODESIAN RIDGEBACK", "S": "SALUKI", "SD": "SCOTTISH DEERHOUND",
            "SL": "SLOUGHI", "SW": "SILKEN WINDHOUND",
        },
    },
    "aok9": {
        "waves": ["bwave", "mwave"],
        "meet_streams": ["meets_breed", "meets_mixed"],
        "champion": [("brc", "titled_brc", "brc"), ("mrc", "titled_mrc", "mrc")],
        "supreme": [("nbrc", "sbrc"), ("nmrc", "smrc"), ("trc", "strc")],
        "career_ranks": [("nbrc", "rank_career_breed"), ("nmrc", "rank_career_mixed")],
        "owner_sums": ["ytd", "nbrc", "nmrc"],
        "owner_best": "bwave",
        # AOK9's registrar overrides the arithmetic far more often than
        # LGRA's (published figures with no score listed, older rows not
        # recomputed); 85% agreement is what the guide actually shows.
        "wave_agreement": 0.85,
        "expected_sections": None,
    },
}

# LGRA year letters, enumerated rather than computed: A..Z then AA..AZ.
_LGRA_LETTERS = [chr(c) for c in range(ord("A"), ord("Z") + 1)]
_LGRA_LETTERS += ["A" + chr(c) for c in range(ord("A"), ord("Z") + 1)]
LGRA_YEARS = {letters: 1995 + index for index, letters in enumerate(_LGRA_LETTERS)}


def _racing_wave(meets: list[list]) -> float | None:
    """[(m1) + 0.7 (m2) + 0.5 (m3)] / 2.2 over complete meets, written as a loop."""
    scores = [(row[3], row[4]) for row in meets if row[3] is not None]
    if not scores:
        return None
    complete = [score for score, done in scores if done]
    if not complete:
        return sum(score for score, _ in scores) / len(scores)
    total = weight_sum = 0.0
    for score, weight in zip(complete[:3], (1.0, 0.7, 0.5)):
        total += score * weight
        weight_sum += weight
    return total / weight_sum


def _racing_rank(rows: list[dict], field: str) -> dict[str, int | None]:
    """Competition ranking, ties share, zero and missing unranked."""
    ranked = sorted(
        (row for row in rows if (row.get(field) or 0) > 0),
        key=lambda row: -row[field],
    )
    result: dict[str, int | None] = {row["id"]: None for row in rows}
    last_value, last_rank = None, 0
    for position, row in enumerate(ranked, 1):
        if row[field] != last_value:
            last_value, last_rank = row[field], position
        result[row["id"]] = last_rank
    return result


def check_racing(check: Checker, org: str) -> None:
    """Re-derive data/<org>.json and its registry from the archived snapshot."""
    import datetime as dt

    spec = RACING[org]
    feed_path = ROOT / "data" / f"{org}.json"
    registry_path = ROOT / "data" / f"{org}-registry.json"
    snapshot_dir = ROOT / "data" / org / "snapshots"
    check.expect(feed_path.exists() and registry_path.exists(),
                 f"{org}: feed or registry missing; run tools/{org}.py")
    if not (feed_path.exists() and registry_path.exists()):
        return
    feed = json.loads(feed_path.read_text(encoding="utf-8"))
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    columns = registry["columns"]
    rows = [dict(zip(columns, row)) for row in registry["rows"]]
    by_id = {row["id"]: row for row in rows}
    stats = feed["stats"]
    season = feed["season"]
    label = feed["name"]

    snapshot_path = snapshot_dir / f"{feed['guide_date']}.json"
    check.expect(snapshot_path.exists(), f"{label}: snapshot {snapshot_path.name} missing")
    snapshot = (json.loads(snapshot_path.read_text(encoding="utf-8"))
                if snapshot_path.exists() else None)
    check.expect(
        feed["snapshots"] == sorted(p.stem for p in snapshot_dir.glob("*.json")),
        f"{label}: feed.snapshots does not list the archived snapshots",
    )

    # 1. Counts survive snapshot -> registry -> feed, and every hound sits
    #    under the breed header its registration prefix expects.
    if snapshot:
        snapshot_ids = [dog["id"] for section in snapshot["sections"] for dog in section["dogs"]]
        check.expect(len(snapshot_ids) == len(rows) == stats["hounds_registry"],
                     f"{label}: registry {len(rows)} vs snapshot {len(snapshot_ids)} "
                     f"vs stats {stats['hounds_registry']}")
        check.expect(set(snapshot_ids) == set(by_id),
                     f"{label}: registry ids differ from the snapshot")
        expected_sections = spec["expected_sections"]
        if expected_sections:
            for section in snapshot["sections"]:
                prefixes = {dog["prefix"] for dog in section["dogs"]}
                check.expect(
                    all(expected_sections.get(p) == section["breed_raw"] for p in prefixes),
                    f"{label}: {sorted(prefixes)} filed under {section['breed_raw']!r}",
                )
            check.expect(
                {s["breed_raw"] for s in snapshot["sections"]} == set(expected_sections.values()),
                f"{label}: the guide's breed headers changed",
            )
        else:
            homes: dict[str, set[str]] = {}
            for section in snapshot["sections"]:
                for dog in section["dogs"]:
                    homes.setdefault(dog["prefix"], set()).add(section["breed_raw"])
            check.expect(all(len(v) == 1 for v in homes.values()),
                         f"{label}: a registration prefix appears under two breeds")
    check.expect(len(set(by_id)) == len(rows), f"{label}: duplicate ids in the registry")
    check.expect(all(re.match(r"^[A-Z]{1,8}-\d+(-\d+)?$", row["id"]) for row in rows),
                 f"{label}: an id does not look like PREFIX-NUMBER")
    duplicates = [row for row in rows if row.get("duplicate_of")]
    check.expect(all(row["id"].startswith(row["duplicate_of"] + "-") for row in duplicates),
                 f"{label}: a duplicate_of does not match its id")
    check.expect(len(duplicates) == stats["hounds_duplicate_numbers"],
                 f"{label}: stats.hounds_duplicate_numbers is {stats['hounds_duplicate_numbers']}, "
                 f"registry has {len(duplicates)}")

    sections = feed["sections"]
    check.expect(stats["breeds"] == len(sections), f"{label}: stats.breeds != len(sections)")
    check.expect(sum(s["registry"] for s in sections) == len(rows),
                 f"{label}: section registry counts do not sum to the registry")
    by_slug: dict[str, list[dict]] = {}
    for row in rows:
        by_slug.setdefault(row["breed_slug"], []).append(row)
    check.expect({s["slug"] for s in sections} == set(by_slug),
                 f"{label}: section slugs differ from the registry's breed slugs")

    # 2. The feed is the active subset, and agrees with the registry.
    active_rows = [row for row in rows if row["active"]]
    check.expect(len(feed["dogs"]) == len(active_rows) == stats["hounds_active"],
                 f"{label}: feed dogs {len(feed['dogs'])} vs active registry rows "
                 f"{len(active_rows)} vs stats {stats['hounds_active']}")
    shared = ["call_name", "registered_name", "owner_raw", "ytd", "rank_breed",
              "rank_all", "last_raced"] + spec["waves"]
    for dog in feed["dogs"]:
        row = by_id.get(dog["id"])
        check.expect(row is not None and all(dog.get(f) == row.get(f) for f in shared),
                     f"{label}: {dog['id']} differs between feed and registry")
    check.expect(stats["hounds_ytd"] == sum((row["ytd"] or 0) > 0 for row in rows),
                 f"{label}: stats.hounds_ytd is not the count of hounds with points")
    raced = [row for row in rows
             if any(meet[1] == season for stream in spec["meet_streams"] for meet in row[stream])]
    check.expect(stats["hounds_raced"] == len(raced),
                 f"{label}: stats.hounds_raced {stats['hounds_raced']} vs {len(raced)} re-counted")
    check.expect(stats["breeds_raced"] == len({row["breed_slug"] for row in raced}),
                 f"{label}: stats.breeds_raced disagrees with a re-count")
    check.expect(stats["hounds_ytd"] <= stats["hounds_raced"] <= stats["hounds_active"],
                 f"{label}: points {stats['hounds_ytd']} / raced {stats['hounds_raced']} / "
                 f"active {stats['hounds_active']} are out of order")
    for section in sections:
        members = by_slug.get(section["slug"], [])
        check.expect(section["registry"] == len(members)
                     and section["active"] == sum(bool(m["active"]) for m in members)
                     and section["ytd"] == sum((m["ytd"] or 0) > 0 for m in members),
                     f"{label}: section counts wrong for {section['breed']}")

    # 3. Standings: competition ranking on this season's points, per breed
    #    and overall, and on career points.
    for slug, members in by_slug.items():
        expected = _racing_rank(members, "ytd")
        check.expect(all(m["rank_breed"] == expected[m["id"]] for m in members),
                     f"{label}: breed standings disagree for {slug}")
        leaders = sorted((m for m in members if m["rank_breed"] == 1),
                         key=lambda m: m["call_name"])
        section = next(s for s in sections if s["slug"] == slug)
        check.expect(
            (section["leader"] or {}).get("id") == (leaders[0]["id"] if leaders else None),
            f"{label}: section leader wrong for {slug}",
        )
    expected_all = _racing_rank(rows, "ytd")
    check.expect(all(row["rank_all"] == expected_all[row["id"]] for row in rows),
                 f"{label}: all-breed standings disagree")
    check.expect(any(row["rank_all"] == 1 for row in rows) == (stats["hounds_ytd"] > 0),
                 f"{label}: nobody ranked first although hounds have points")
    for field, key in spec["career_ranks"]:
        expected_career = _racing_rank(rows, field)
        check.expect(all(row[key] == expected_career[row["id"]] for row in rows),
                     f"{label}: career standings ({key}) disagree")

    # 4. WAVE arithmetic, with the registrar's overrides tolerated in bulk
    #    but flagged one by one; grades follow the bands.
    for wave_field, stream in zip(spec["waves"], spec["meet_streams"]):
        rated = [row for row in rows if row[wave_field] is not None]
        agree = 0
        for row in rated:
            computed = _racing_wave(row[stream])
            if computed is not None and abs(computed - row[wave_field]) <= 0.01:
                agree += 1
        share = agree / max(1, len(rated))
        check.expect(share >= spec["wave_agreement"],
                     f"{label}: {wave_field} agrees with the rule for only {share:.1%}")
        for dog in feed["dogs"]:
            computed = _racing_wave(by_id[dog["id"]][stream])
            matches = (dog[wave_field] is not None and computed is not None
                       and abs(computed - dog[wave_field]) <= 0.01)
            check.expect(dog[f"{wave_field}_matches"] == matches,
                         f"{label}: {dog['id']} {wave_field}_matches flag is wrong")
        grade_field = {"wave": "grade", "bwave": "bgrade", "mwave": "mgrade"}[wave_field]
        for row in rows:
            value = row[wave_field]
            expected = (None if value is None else "A" if value >= 11 else "B" if value >= 8
                        else "C" if value >= 5.5 else "D")
            check.expect(row[grade_field] == expected,
                         f"{label}: {row['id']} grade {row[grade_field]} for WAVE {value}")

    # 5. Meet codes decode to plausible years and, where the scheme gives
    #    one, dates. LGRA numbered meets sequentially before 2012 and by
    #    day of the year since; AOK9 numbers them sequentially and dates
    #    only its oldest rows.
    guide_date = dt.date.fromisoformat(feed["guide_date"])
    listed = undecoded = weekend = dated = 0
    this_year: set[str] = set()
    for row in rows:
        for stream in spec["meet_streams"]:
            for code, year, when, _score, _complete in row[stream]:
                listed += 1
                if year is None:
                    undecoded += 1
                    continue
                check.expect(1995 <= year <= season, f"{label}: meet {code} year {year} out of range")
                if year == season:
                    this_year.add(code)
                if org == "lgra":
                    match = re.match(r"^([A-Z]{1,2})(\d{1,3})", code)
                    check.expect(bool(match) and LGRA_YEARS.get(match.group(1)) == year,
                                 f"{label}: meet {code} year {year} does not match its letters")
                    check.expect((when is not None) == (year >= 2012),
                                 f"{label}: meet {code} dated {when} for year {year}")
                if when is None:
                    continue
                dated += 1
                day = dt.date.fromisoformat(when)
                check.expect(day.year == year, f"{label}: meet {code} date {when} is not in {year}")
                check.expect(day <= guide_date, f"{label}: meet {code} dated after the guide")
                if org == "lgra":
                    check.expect(day.timetuple().tm_yday == int(match.group(2)),
                                 f"{label}: meet {code} decodes to {when}, not its own day number")
                    weekend += day.weekday() >= 5
    check.expect(listed == stats["meets_listed"] and undecoded == stats["meets_undecoded"],
                 f"{label}: meet counts {listed}/{undecoded} vs stats "
                 f"{stats['meets_listed']}/{stats['meets_undecoded']}")
    check.expect(undecoded <= max(5, listed * 0.002),
                 f"{label}: {undecoded} undecodable meet codes of {listed}")
    if org == "lgra":
        check.expect(weekend / max(1, dated) >= 0.85,
                     f"{label}: only {weekend / max(1, dated):.0%} of dated meets fall on a weekend")
    check.expect(len(this_year) == stats["meets_this_year"],
                 f"{label}: meets this year {len(this_year)} vs stats {stats['meets_this_year']}")

    # 6. Titles follow the points columns.
    for field, stat_key, flag in spec["champion"]:
        check.expect(stats[stat_key] == sum((row[field] or 0) >= 12 for row in rows),
                     f"{label}: stats.{stat_key} is not the count of hounds at 12 {field} points")
        for dog in feed["dogs"]:
            check.expect(dog["titled"][flag] == ((dog[field] or 0) >= 12),
                         f"{label}: {dog['id']} titled.{flag} disagrees with {field}")
    for field, flag in spec["supreme"]:
        for dog in feed["dogs"]:
            level = int((dog[field] or 0) // 30)
            check.expect(dog["titled"][flag] == level,
                         f"{label}: {dog['id']} titled.{flag} != {field} // 30")
    if org == "lgra":
        named = [dog for dog in feed["dogs"]
                 if any(re.match(r"^S?GRC\d*$", t, re.IGNORECASE) for t in dog["titles"])]
        agree = sum((dog["grc"] or 0) >= 12 for dog in named)
        check.expect(agree >= 0.95 * len(named),
                     f"{label}: {len(named) - agree} hounds carry GRC in their name "
                     f"without 12 points")

    # 7. Owners re-summed over the active hounds, one row per surname per breed.
    expected_owners: dict[str, dict] = {}
    for dog in feed["dogs"]:
        for party in dog["owners"]:
            entry = expected_owners.setdefault(
                f"{party['key']}|{dog['breed_slug']}",
                {"hounds": 0, "best": None, **{f: 0.0 for f in spec["owner_sums"]}})
            entry["hounds"] += 1
            for f in spec["owner_sums"]:
                entry[f] += dog.get(f) or 0
            best = dog.get(spec["owner_best"])
            if best is not None:
                entry["best"] = best if entry["best"] is None else max(entry["best"], best)
    check.expect(len(feed["owners"]) == len(expected_owners) == stats["owners_active"],
                 f"{label}: owner count {len(feed['owners'])} vs {len(expected_owners)}")
    for owner in feed["owners"]:
        expected = expected_owners.get(owner["key"])
        check.expect(owner["key"] == f"{owner['surname_key']}|{owner['breed_slug']}"
                     and owner["breeds"] == [owner["breed"]],
                     f"{label}: owner {owner['key']} is not one surname within one breed")
        check.expect(
            expected is not None and owner["hounds"] == expected["hounds"]
            and all(abs(owner[f] - expected[f]) < 0.001 for f in spec["owner_sums"])
            and owner[f"best_{spec['owner_best']}"] == expected["best"],
            f"{label}: owner {owner['key']} aggregates disagree",
        )

    # 8. Movement against the previous snapshot, or none at all.
    previous = feed["previous_guide_date"]
    if previous is None:
        check.expect(all(dog["movement"] is None for dog in feed["dogs"]),
                     f"{label}: movement present without a previous guide")
        check.expect(feed["titles_since_previous"] == [],
                     f"{label}: titles_since_previous without a previous guide")
    else:
        prior = json.loads((snapshot_dir / f"{previous}.json").read_text(encoding="utf-8"))
        prior_ids = {dog["id"]: dog for section in prior["sections"] for dog in section["dogs"]}
        for dog in feed["dogs"]:
            move = dog["movement"]
            before = prior_ids.get(dog["id"])
            check.expect(move is not None and move["since"] == previous
                         and move["new"] == (before is None),
                         f"{label}: {dog['id']} movement.new is wrong")
            if before is not None and move:
                expected_delta = (round(dog["ytd"] - before["ytd"], 3)
                                  if dog["ytd"] is not None and before["ytd"] is not None
                                  else None)
                check.expect(move["ytd_delta"] == expected_delta,
                             f"{label}: {dog['id']} ytd_delta disagrees")

    # 9. Nothing personal beyond names travels into the published data.
    for path in (feed_path, registry_path, snapshot_path):
        if not path.exists():
            continue
        body = path.read_text(encoding="utf-8")
        for name, pattern in (
            ("email address", r"[\w.+-]+@[\w-]+\.[\w.]+"),
            ("phone number", r"\(\d{3}\)\s*\d{3}-\d{4}"),
            ("street address",
             r"\b\d{2,5}\s+\w+\s+(?:Ave|Avenue|St|Street|Rd|Road|Dr|Drive|Ln|Lane)\b"),
        ):
            found = re.findall(pattern, body, re.IGNORECASE)
            check.expect(not found, f"{label}: {path.name} contains a {name}: {found[:2]}")


if __name__ == "__main__":
    sys.exit(main())
