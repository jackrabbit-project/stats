"""Collect the year's AKC lure coursing events and their entry counts from
AKC's Event Search.

Two public sources, both plain HTTP:

* the search behind https://webapps.akc.org/event-search/ answers a JSON
  POST with every event of a type in a date range (club, city, state, event
  number, date). Only the lure coursing type, "Lure Coursing Tests &
  Trials", is asked for, so Coursing Ability Tests and Fast CAT never
  enter;
* each event's page on apps.akc.org lists its competitions ("LC Test
  Sighthound", "LC Trial Whippet", ...) and, once AKC has posted results,
  ends each with "Number of Entries: N   Number of Competitors: M". Until
  then the page carries only the premium list, and the event is recorded as
  not posted, with no counts.

A collection keeps each event's identity and counts, with each trial's
stakes (Open, Special or Veteran, the breed, the starters), nothing else. The
search answer and the pages also carry secretaries' names, phones and
addresses; none of that is read into the rows, and the whole collection is
grepped for such things before it is handed back.

Usage:
    python tools/akc_collect.py                        # Jan 1 of this year to today, to stdout summary
    python tools/akc_collect.py --start 2026-01-01 --end 2026-10-09 --out PATH
"""

from __future__ import annotations

import argparse
import html as html_module
import json
import re
import sys
import time
from datetime import date
from pathlib import Path

import requests

from events import US_STATES
from racing import DATA, USER_AGENT, RacingParseError, today

SOURCE_NAME = "AKC Event Search"
SOURCE_URL = "https://webapps.akc.org/event-search/#/results"
SEARCH_API = "https://webapps.akc.org/event-search/api/search/events"
EVENT_URL = (
    "https://www.apps.akc.org/apps/events/search/index_results.cfm"
    "?action=plan&event_number={number}"
)
RAW_DIR = DATA / "akc" / "raw"

# The competition type exactly as the search form sends it for "Lure
# Coursing Tests & Trials (LC)"; the answer's eventType is "LCTS/LCTR",
# "LCTR" or "LCTS".
COMP_TYPE = "LCTR LCTS"
COMP_LABEL = "Lure Coursing Tests & Trials (LC)"
LC_TYPES = {"LCTR", "LCTS"}
EVENT_NUMBER_RE = re.compile(r"^20\d{8}$")

# On a results page each competition opens "LC Test <breed>" or "LC Trial
# <breed>" ("Sighthound" for an all-breed event), usually followed by its
# judging panel and stakes, sometimes by the counts alone, and ends with
# "Number of Entries". The premium list shown before results are posted
# says "Judge Panel Status" and "Start Date" instead and carries no counts,
# so it yields no sections.
SECTION_RE = re.compile(r"LC (Test|Trial)\s+([A-Za-z][A-Za-z .'\-]{0,40}?)\s+(?=Judging Panel Status:|Number of Entries:)")
COUNTS_RE = re.compile(r"Number of Entries:\s*(\d+)\s*Number of Competitors:\s*(\d+)")

# Each trial stake is a link into its placements ("Open WHIPPETS",
# "Special BASENJIS", "Open Veteran WHIPPETS"), then its judges, then
# "(N Starters)". The starters of a trial's stakes add up to its Number of
# Competitors. Test stakes (Junior and Qualified Courser) link with
# comp_type=LCTS and are not split by breed.
STAKE_LINK_RE = re.compile(r'<a\b[^>]*href="[^"]*[?&]comp_type=LCTR\b[^"]*"[^>]*>(.*?)</a>', re.S | re.I)
STAKE_LABEL_RE = re.compile(r"^(Open Veteran|Special Veteran|Veteran|Open|Special)\s+(\S.*)$")
STARTERS_RE = re.compile(r"\((\d+)\s+Starters?\)")
# AKC names a stake's breed in the plural, in capitals; the table shows the
# breed as AKC's breed list names it.
AKC_BREEDS = {
    "AFGHAN HOUNDS": "Afghan Hound", "AZAWAKHS": "Azawakh", "BASENJIS": "Basenji",
    "BORZOIS": "Borzoi", "CIRNECHI DELL'ETNA": "Cirneco dell'Etna", "GREYHOUNDS": "Greyhound",
    "IBIZAN HOUNDS": "Ibizan Hound", "IRISH WOLFHOUNDS": "Irish Wolfhound",
    "ITALIAN GREYHOUNDS": "Italian Greyhound", "PHARAOH HOUNDS": "Pharaoh Hound",
    "RHODESIAN RIDGEBACKS": "Rhodesian Ridgeback", "SALUKIS": "Saluki",
    "SCOTTISH DEERHOUNDS": "Scottish Deerhound", "SLOUGHIS": "Sloughi", "WHIPPETS": "Whippet",
    "SILKEN WINDHOUNDS": "Silken Windhound", "PORTUGUESE PODENGOS": "Portuguese Podengo",
}
DIVISION_RE = re.compile(r"\s+DIV\.?\s*[A-Z0-9]+$")

# The collection is committed, so it is checked for the contact details
# the racing workbooks are kept out of git for.
PRIVATE_PATTERNS = (
    ("email address", re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")),
    ("phone number", re.compile(r"\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}")),
    ("street address", re.compile(
        r"\b\d{1,5}\s+\w+\s+(St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Way|Ct|Court)\b",
        re.IGNORECASE)),
)


def assert_no_personal_data(text: str, what: str = "the collection") -> None:
    for label, pattern in PRIVATE_PATTERNS:
        if pattern.search(text):
            raise RacingParseError(
                f"{what} contains something that looks like a {label}; it is committed "
                f"to the repo, so this cannot be written")


def _us_date(iso: str) -> str:
    """The search form's date format."""
    d = date.fromisoformat(iso)
    return f"{d.month:02d}/{d.day:02d}/{d.year}"


# ------------------------------------------------------------------ search
def search_body(start: str, end: str) -> dict:
    return {
        "address": {
            "eventSetting": {"indoor": True, "outdoor": True, "outsideCovered": True},
            "location": {"cityState": "", "latitude": 0, "longitude": 0, "zipCode": None},
            "radius": "any", "searchByState": False, "searchByCity": False,
            "searchText": "All Cities & States",
        },
        "breedCode": "999", "breedName": "Any AKC Recognized or FSS Breed", "breedId": "ANY_AKC_FSS",
        "dateRange": {"from": _us_date(start), "to": _us_date(end), "type": "event"},
        "competition": {
            "items": [{"selected": True, "value": {"compType": COMP_TYPE}, "label": COMP_LABEL}],
            "filters": [],
        },
    }


def search_events(session: requests.Session, start: str, end: str) -> list[dict]:
    """Every lure coursing event listed for the period: identity only."""
    response = session.post(SEARCH_API, json=search_body(start, end), timeout=90)
    response.raise_for_status()
    try:
        listed = response.json().get("events")
    except ValueError as error:
        raise RacingParseError(f"the event search did not answer with JSON: {error}") from error
    if not isinstance(listed, list):
        raise RacingParseError("the event search answered without an events list")
    events: list[dict] = []
    seen: set[str] = set()
    for item in listed:
        number = str(item.get("eventNumber") or "").strip()
        if not EVENT_NUMBER_RE.match(number):
            raise RacingParseError(f"unexpected AKC event number {item.get('eventNumber')!r}")
        if number in seen:
            raise RacingParseError(f"event number {number} listed twice")
        seen.add(number)
        types = {t for t in re.split(r"[/\s]+", str(item.get("eventType") or "").strip()) if t}
        if not types or not types <= LC_TYPES:
            raise RacingParseError(f"{number}: event type {item.get('eventType')!r} is not lure coursing")
        when = str(item.get("startDate") or "")[:10]
        try:
            date.fromisoformat(when)
        except ValueError as error:
            raise RacingParseError(f"{number}: unreadable date {item.get('startDate')!r}") from error
        if not start <= when <= end:
            raise RacingParseError(f"{number}: {when} is outside {start}..{end}")
        state = str(item.get("state") or "").strip()
        if state not in US_STATES:
            raise RacingParseError(f"{number}: unknown state {state!r}")
        club = " ".join(str(item.get("clubName") or "").split())
        city = " ".join(str(item.get("city") or "").split())
        if not club or not city:
            raise RacingParseError(f"{number}: club or city missing from the listing")
        events.append({
            "event_number": number, "date": when, "club": club, "city": city, "state": state,
            "event_type": "/".join(sorted(types)), "status": " ".join(str(item.get("eventStatus") or "").split()),
        })
    events.sort(key=lambda e: (e["date"], e["event_number"]))
    return events


# ------------------------------------------------------------------- pages
def fetch_page(session: requests.Session, number: str, attempts: int = 3) -> str:
    url = EVENT_URL.format(number=number)
    for attempt in range(1, attempts + 1):
        try:
            response = session.get(url, timeout=60)
            response.raise_for_status()
            if number not in response.text:
                raise RacingParseError(f"{number}: AKC answered with a page that does not mention the event")
            return response.text
        except (requests.RequestException, RacingParseError):
            if attempt == attempts:
                raise
            time.sleep(2 * attempt)
    raise AssertionError("unreachable")


def page_text(html: str) -> str:
    text = re.sub(r"<script.*?</script>", " ", html, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html_module.unescape(text)
    return re.sub(r"\s+", " ", text)


def parse_sections(html: str) -> list[dict]:
    """The competitions on an event page with their counts, in page order.
    A competition whose results are not up yet has no counts."""
    text = page_text(html)
    heads = list(SECTION_RE.finditer(text))
    sections = []
    for index, head in enumerate(heads):
        stop = heads[index + 1].start() if index + 1 < len(heads) else len(text)
        counts = COUNTS_RE.search(text, head.end(), stop)
        sections.append({
            "kind": head.group(1).lower(),
            "breed": " ".join(head.group(2).split()),
            "entries": int(counts.group(1)) if counts else None,
            "competitors": int(counts.group(2)) if counts else None,
        })
    return sections


def breed_name(text: str) -> str:
    """'IBIZAN HOUNDS' -> 'Ibizan Hound'. A large stake split into
    divisions ('WHIPPETS Div. A') counts under its breed. A breed not in the
    list keeps AKC's words, title-cased, less the plural s."""
    key = DIVISION_RE.sub("", " ".join(text.upper().split()))
    if key in AKC_BREEDS:
        return AKC_BREEDS[key]
    words = key.title().split()
    if words and words[-1].endswith("s") and not words[-1].endswith("ss"):
        words[-1] = words[-1][:-1]
    return " ".join(words)


def parse_stakes(html: str) -> list[list] | None:
    """Each trial stake on an event page as [stake, breed, starters], in
    page order; the stake is Open, Special or Veteran. None when a stake
    cannot be read (a label of another shape, or no starters count)."""
    links = list(STAKE_LINK_RE.finditer(html))
    stakes = []
    for index, link in enumerate(links):
        label = " ".join(html_module.unescape(re.sub(r"<[^>]+>", " ", link.group(1))).split())
        stop = links[index + 1].start() if index + 1 < len(links) else len(html)
        following = html_module.unescape(re.sub(r"<[^>]+>", " ", html[link.end():stop]))
        named = STAKE_LABEL_RE.match(label)
        count = STARTERS_RE.search(following)
        if not named or not count:
            return None
        stake = "Veteran" if "Veteran" in named.group(1) else named.group(1)
        stakes.append([stake, breed_name(named.group(2)), int(count.group(1))])
    return stakes


def row_from(event: dict, sections: list[dict], stakes: list[list] | None = None) -> dict:
    """One event row in the shape the feed and the checks expect. The
    trial's stakes are kept only when their starters add up to AKC's
    Number of Competitors; otherwise trial_stakes is None and the trial is
    left out of the counts by breed."""
    trials = [s for s in sections if s["kind"] == "trial" and s["entries"] is not None]
    tests = [s for s in sections if s["kind"] == "test" and s["entries"] is not None]
    posted = bool(trials or tests)

    def total(items: list[dict], key: str) -> int | None:
        return sum(s[key] for s in items) if items else None

    scope = None
    named = trials or tests
    if named:
        breeds = sorted({s["breed"] for s in named})
        if any(b.lower() == "sighthound" for b in breeds):
            scope = "All-breed"
        else:
            scope = ", ".join(breeds) + " specialty"
    trial_entries = total(trials, "entries")
    trial_competitors = total(trials, "competitors")
    test_entries = total(tests, "entries")
    if not trials:
        trial_stakes = []
    elif stakes and sum(stake[2] for stake in stakes) == trial_competitors:
        trial_stakes = stakes
    else:
        trial_stakes = None
    when = event["date"]
    return {
        "date": when,
        "day": date.fromisoformat(when).strftime("%a"),
        "club": event["club"],
        "city": event["city"],
        "state": event["state"],
        "event_number": event["event_number"],
        "event_type": event["event_type"],
        "scope": scope,
        "specialty": scope is not None and scope.lower() != "all-breed",
        "trial_entries": trial_entries,
        "trial_competitors": trial_competitors,
        "test_entries": test_entries,
        "test_competitors": total(tests, "competitors"),
        "total_entries": (trial_entries or 0) + (test_entries or 0) if posted else None,
        "results_posted": posted,
        "url": EVENT_URL.format(number=event["event_number"]),
        "trial_stakes": trial_stakes,
    }


# ----------------------------------------------------------------- collect
def collect(start: str, end: str, delay: float = 0.5, limit: int | None = None, log=print) -> dict:
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    events = search_events(session, start, end)
    log(f"AKC Event Search: {len(events)} lure coursing events {start}..{end}")
    if limit:
        events = events[:limit]
    rows = []
    for event in events:
        page = fetch_page(session, event["event_number"])
        rows.append(row_from(event, parse_sections(page), parse_stakes(page)))
        if delay:
            time.sleep(delay)
    posted = sum(1 for r in rows if r["results_posted"])
    split = sum(1 for r in rows if r["trial_stakes"])
    unsplit = sum(1 for r in rows if r["trial_stakes"] is None)
    log(f"Read {len(rows)} event pages: {posted} with results posted, {split} trials split by breed"
        + (f", {unsplit} without a full list of stakes" if unsplit else ""))
    collection = {
        "collected": today(),
        "period": {"start": start, "end": end},
        "source": {"name": SOURCE_NAME, "url": SOURCE_URL, "search": SEARCH_API, "event_url": EVENT_URL},
        "events": rows,
    }
    assert_no_personal_data(json.dumps(collection, ensure_ascii=False))
    return collection


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    year = date.today().year
    parser.add_argument("--start", default=f"{year}-01-01", help="first event date, ISO (default: January 1 of this year)")
    parser.add_argument("--end", default=today(), help="last event date, ISO (default: today)")
    parser.add_argument("--out", type=Path, help="write the collection here (default: data/akc/raw/<today>.json)")
    parser.add_argument("--delay", type=float, default=0.5, help="seconds between event pages")
    parser.add_argument("--limit", type=int, help="read only the first N events (for trying things out)")
    args = parser.parse_args()
    collection = collect(args.start, args.end, delay=args.delay, limit=args.limit)
    out = args.out or RAW_DIR / f"{collection['collected']}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(collection, indent=1, ensure_ascii=False) + "\n")
    print(f"Wrote {out}  {len(collection['events'])} events")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (requests.RequestException, RacingParseError) as error:
        print(f"Collection failed: {error}", file=sys.stderr)
        sys.exit(1)
