"""Build data/akc.json, the AKC lure coursing entries feed.

The rows come from akc_collect.py: one per AKC lure coursing event of the
year, from AKC's Event Search, with the entry and competitor counts from
that event's results page. By default this collects afresh (every event
from January 1 to today), files the rows under data/akc/raw/<date>.json
when they differ from the newest collection, and rebuilds the feed. Every
figure the site shows (the totals, the by-month table, the trial, club and
state rankings) is computed here from the rows; check.py re-derives them
from the committed collection on its own.

Usage:
    python tools/akc.py                     # collect, archive if changed, rebuild
    python tools/akc.py --offline           # rebuild from the newest archived collection
    python tools/akc.py --file PATH         # build from this collection file
    python tools/akc.py --start 2026-01-01 --end 2026-10-09   # collect another period
    python tools/akc.py --force             # archive even if unchanged
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

import requests

from akc_collect import EVENT_NUMBER_RE, RAW_DIR, SOURCE_NAME, SOURCE_URL, collect
from events import US_STATES
from racing import DATA, RacingParseError, sha256, today, write_json

ORG = "akc"
FEED = DATA / "akc.json"
MONTH_LABELS = ["January", "February", "March", "April", "May", "June", "July",
                "August", "September", "October", "November", "December"]
ROW_FIELDS = ("date", "day", "club", "city", "state", "event_number", "scope", "specialty",
              "trial_entries", "trial_competitors", "test_entries", "test_competitors",
              "total_entries", "results_posted", "url")
COUNT_FIELDS = ("trial_entries", "trial_competitors", "test_entries", "test_competitors", "total_entries")


# -------------------------------------------------------------- collection
def read_collection(path: Path) -> dict:
    """A collection file, checked row by row before anything is built on it."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except ValueError as error:
        raise RacingParseError(f"{path.name}: not JSON: {error}") from error
    for key in ("collected", "period", "events"):
        if key not in data:
            raise RacingParseError(f"{path.name}: no {key!r}")
    period = data["period"]
    start, end, collected = period.get("start"), period.get("end"), data["collected"]
    for value in (start, end, collected):
        try:
            date.fromisoformat(value)
        except (TypeError, ValueError) as error:
            raise RacingParseError(f"{path.name}: unreadable date {value!r}") from error
    if not start <= end <= collected:
        raise RacingParseError(f"{path.name}: period {start}..{end} and collected {collected} out of order")
    events = data["events"]
    if not isinstance(events, list) or not events:
        raise RacingParseError(f"{path.name}: no event rows")
    seen: set[str] = set()
    for event in events:
        missing = [f for f in ROW_FIELDS if f not in event]
        if missing:
            raise RacingParseError(f"{path.name}: a row lacks {missing}")
        when = event["date"]
        try:
            weekday = date.fromisoformat(when).strftime("%a")
        except (TypeError, ValueError) as error:
            raise RacingParseError(f"{path.name}: unreadable event date {when!r}") from error
        number = str(event["event_number"])
        if not EVENT_NUMBER_RE.match(number):
            raise RacingParseError(f"{when}: unexpected AKC event number {number!r}")
        if number in seen:
            raise RacingParseError(f"event number {number} appears twice")
        seen.add(number)
        if not start <= when <= end:
            raise RacingParseError(f"{number}: {when} is outside the period {start}..{end}")
        if event["day"] != weekday:
            raise RacingParseError(f"{number}: the day says {event['day']!r}, the date is a {weekday}")
        if event["state"] not in US_STATES:
            raise RacingParseError(f"{number}: unknown state {event['state']!r}")
        if not event["club"] or not event["city"]:
            raise RacingParseError(f"{number}: club or city missing")
        for field in COUNT_FIELDS:
            value = event[field]
            if value is not None and (isinstance(value, bool) or not isinstance(value, int) or value < 0):
                raise RacingParseError(f"{number}: {field} is {value!r}, not a count")
        scope = event["scope"]
        if scope is not None and not isinstance(scope, str):
            raise RacingParseError(f"{number}: scope {scope!r}")
        if event["specialty"] != (scope is not None and scope.lower() != "all-breed"):
            raise RacingParseError(f"{number}: the specialty flag does not follow the scope {scope!r}")
        if not event["results_posted"]:
            if any(event[f] is not None for f in COUNT_FIELDS):
                raise RacingParseError(f"{number}: counts on an event whose results are not posted")
        else:
            expected_total = (event["trial_entries"] or 0) + (event["test_entries"] or 0)
            if (event["total_entries"] or 0) != expected_total:
                raise RacingParseError(f"{number}: total {event['total_entries']} is not trial + test = {expected_total}")
            if ((event["trial_competitors"] or 0) > (event["trial_entries"] or 0)
                    or (event["test_competitors"] or 0) > (event["test_entries"] or 0)):
                raise RacingParseError(f"{number}: more competitors than entries")
        if number not in str(event["url"]):
            raise RacingParseError(f"{number}: the event link {event['url']} is for another event")
    events.sort(key=lambda e: (e["date"], e["event_number"]))
    return data


# ------------------------------------------------------------------- build
def competition_rank(rows: list[dict], field: str) -> None:
    """RANK() as a spreadsheet does it: ties share a rank, the next rank
    skips. Rows without a value stay unranked."""
    ordered = sorted((r for r in rows if r.get(field) is not None), key=lambda r: -r[field])
    previous = None
    rank = 0
    for position, row in enumerate(ordered, 1):
        if row[field] != previous:
            rank, previous = position, row[field]
        row["rank"] = rank
    for row in rows:
        row.setdefault("rank", None)


def _round(value: float | None, places: int = 3) -> float | None:
    return None if value is None else round(value, places)


def build(collection: dict, source_file: str, digest: str) -> dict:
    events = collection["events"]
    period = {"start": collection["period"]["start"], "end": collection["period"]["end"]}
    season = int(period["start"][:4])

    posted = [e for e in events if e["results_posted"]]
    held = [e for e in posted if e["trial_entries"] is not None]
    trial_sum = sum(e["trial_entries"] for e in held)
    stats = {
        "events": len(events),
        "with_results": len(posted),
        "without_results": len(events) - len(posted),
        "events_with_trial": len(held),
        "trial_entries": trial_sum,
        "trial_competitors": sum(e["trial_competitors"] or 0 for e in posted),
        "test_entries": sum(e["test_entries"] or 0 for e in posted),
        "test_competitors": sum(e["test_competitors"] or 0 for e in posted),
        "total_entries": sum(e["total_entries"] or 0 for e in posted),
        "avg_trial_entries": _round(trial_sum / len(held)) if held else None,
        "largest_trial": max((e["trial_entries"] for e in held), default=None),
        "smallest_trial": min((e["trial_entries"] for e in held), default=None),
        "clubs": len({e["club"] for e in events}),
        "states": len({e["state"] for e in events}),
        "specialties": sum(e["specialty"] for e in events),
    }

    by_month = []
    start, end = period["start"][:7], period["end"][:7]
    year, month = int(start[:4]), int(start[5:7])
    while f"{year:04d}-{month:02d}" <= end:
        key = f"{year:04d}-{month:02d}"
        rows = [e for e in events if e["date"].startswith(key)]
        rows_posted = [e for e in rows if e["results_posted"]]
        rows_held = [e for e in rows_posted if e["trial_entries"] is not None]
        entries = sum(e["trial_entries"] for e in rows_held)
        tests = sum(e["test_entries"] or 0 for e in rows_posted)
        by_month.append({
            "month": key, "label": MONTH_LABELS[month - 1],
            "events": len(rows), "with_results": len(rows_posted),
            "trial_entries": entries, "test_entries": tests, "total_entries": entries + tests,
            "avg_trial_entries": _round(entries / len(rows_held)) if rows_held else None,
        })
        month += 1
        if month == 13:
            year, month = year + 1, 1

    trials = [{
        "event_number": e["event_number"], "date": e["date"], "club": e["club"], "city": e["city"],
        "state": e["state"], "scope": e["scope"], "trial_entries": e["trial_entries"],
        "trial_competitors": e["trial_competitors"], "test_entries": e["test_entries"],
    } for e in held]
    competition_rank(trials, "trial_entries")
    trials.sort(key=lambda t: (t["rank"], t["date"], t["event_number"]))

    def aggregate(key_field: str) -> list[dict]:
        groups: dict[str, dict] = {}
        for e in events:
            group = groups.setdefault(e[key_field], {
                key_field: e[key_field], "events": 0, "with_results": 0, "trials": 0,
                "trial_entries": 0, "largest_trial": None, "test_entries": 0, "states": set(),
            })
            group["events"] += 1
            group["states"].add(e["state"])
            if not e["results_posted"]:
                continue
            group["with_results"] += 1
            group["test_entries"] += e["test_entries"] or 0
            if e["trial_entries"] is not None:
                group["trials"] += 1
                group["trial_entries"] += e["trial_entries"]
                group["largest_trial"] = max(group["largest_trial"] or 0, e["trial_entries"])
        rows = []
        for group in groups.values():
            group["states"] = sorted(group["states"])
            group["avg_trial_entries"] = (
                _round(group["trial_entries"] / group["trials"]) if group["trials"] else None)
            # Only a club or state with a posted trial has a ranking figure.
            group["_rank_on"] = group["trial_entries"] if group["trials"] else None
            rows.append(group)
        competition_rank(rows, "_rank_on")
        for row in rows:
            del row["_rank_on"]
        rows.sort(key=lambda r: (r["rank"] is None, r["rank"] or 0, -r["events"], r[key_field]))
        return rows

    clubs = aggregate("club")
    for club in clubs:
        del club["events"], club["with_results"]
    states = aggregate("state")
    for state in states:
        del state["states"]

    return {
        "org": ORG,
        "name": "AKC",
        "program": "lure coursing",
        "season": season,
        "collected": collection["collected"],
        "period": period,
        "generated": today(),
        "source": {"name": SOURCE_NAME, "url": SOURCE_URL, "file": source_file, "sha256": digest},
        "stats": stats,
        "by_month": by_month,
        "rankings": {"trials": trials, "clubs": clubs, "states": states},
        "events": events,
    }


# ----------------------------------------------------------------- archive
def newest_raw() -> Path | None:
    files = sorted(RAW_DIR.glob("*.json"))
    return files[-1] if files else None


def archive(collection: dict, force: bool = False) -> Path:
    """File the collection under its date. Rows identical to the newest
    archived collection are not filed again, so a quiet week changes
    nothing; a changed collection under the same date replaces the file
    with a notice, as the racing snapshots do."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    target = RAW_DIR / f"{collection['collected']}.json"
    previous = newest_raw()
    if previous is not None and not force:
        if read_collection(previous)["events"] == collection["events"]:
            print(f"Unchanged since {previous.name} - nothing archived.")
            return previous
    if target.exists():
        print(f"{target.name}: the collection was revised under the same date - replacing it.")
    # LF on every platform: the feed carries the file's sha256, and check.py
    # recomputes it wherever the repo is checked out.
    with open(target, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(collection, indent=1, ensure_ascii=False) + "\n")
    print(f"Archived {target.name}  {len(collection['events'])} events")
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    year = date.today().year
    parser.add_argument("--file", type=Path, help="build from this collection file instead of collecting")
    parser.add_argument("--offline", action="store_true",
                        help="rebuild from the newest archived collection without collecting")
    parser.add_argument("--start", default=f"{year}-01-01", help="first event date to collect, ISO")
    parser.add_argument("--end", default=today(), help="last event date to collect, ISO (default: today)")
    parser.add_argument("--delay", type=float, default=0.5, help="seconds between event pages")
    parser.add_argument("--force", action="store_true", help="archive even if unchanged")
    args = parser.parse_args()

    if args.offline:
        source_path = newest_raw()
        if source_path is None:
            print("No archived collection under data/akc/raw; collect first.", file=sys.stderr)
            return 1
        collection = read_collection(source_path)
    elif args.file:
        source_path = args.file
        collection = read_collection(source_path)
    else:
        try:
            collection = collect(args.start, args.end, delay=args.delay)
        except (requests.RequestException, RacingParseError) as error:
            source_path = newest_raw()
            if source_path is None:
                print(f"Could not collect from AKC and nothing is archived: {error}", file=sys.stderr)
                return 1
            print(f"Could not collect from AKC; rebuilding from {source_path.name}. {error}", file=sys.stderr)
            collection = read_collection(source_path)
        else:
            source_path = archive(collection, force=args.force)
            collection = read_collection(source_path)

    feed = build(collection, source_path.name, sha256(source_path.read_bytes()))
    size = write_json(FEED, feed)
    stats = feed["stats"]
    print(
        f"AKC entries collected {feed['collected']}: {stats['events']} events "
        f"({stats['with_results']} with results), {stats['trial_entries']:,} LC trial entries, "
        f"{stats['test_entries']:,} test entries, average trial {stats['avg_trial_entries']}, "
        f"{stats['clubs']} clubs in {stats['states']} states; feed {size:,} bytes"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
