"""Fetch ASFA's trial schedule and turn it into data/events.json.

The page at asfa.org/event/index.htm lists the season's trials month by month.
Event rows have a fixed 13-cell shape:

    day1..day7 | type | club (links premium) | venue | state | region | go

The same 13-cell shape also carries each month's weekday strip
("F S S M T W T | Type | Club | ..."), told apart by its day cells being
letters rather than numbers.

Months are delimited by header rows reading "January y 2026" (sic — the page
really does say that). Cancellations appear as "LEGS Cancelled" inside the
club cell. Some region numbers carry an unexplained asterisk ("6*"); it is
stripped rather than reproduced, because reprinting a mark ASFA never defines
would invite wrong guesses.

Usage:
    python tools/events.py
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import requests

from regions import SOURCE as REGION_SOURCE, as_list as regions_as_list

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "events" / "raw"
OUTPUT = ROOT / "data" / "events.json"
CLUBS = ROOT / "data" / "clubs.json"

SOURCE_URL = "https://www.asfa.org/event/index.htm"
USER_AGENT = (
    "lure-coursing-stats/1.0 (unofficial ASFA statistics site; "
    "+https://github.com/jackrabbit-project/stats)"
)
PAGE_ENCODING = "cp1252"

MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11,
    "december": 12,
}

# "January y 2026" — the page's own month headers, stray "y" included.
MONTH_HEADER_RE = re.compile(
    r"^(January|February|March|April|May|June|July|August|September|October|"
    r"November|December)\s+y?\s*(\d{4})$",
    re.IGNORECASE,
)

US_STATES = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI",
    "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN",
    "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH",
    "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA",
    "WV", "WI", "WY",
    # Ontario clubs run under Region 9.
    "ON",
}


class EventParseError(RuntimeError):
    """Raised when a row does not match the shape this parser relies on."""


def get(url: str) -> str:
    response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=60)
    response.raise_for_status()
    return response.content.decode(PAGE_ENCODING, errors="replace")


def strip_tags(html: str) -> str:
    text = re.sub(r"<[^>]+>", " ", html)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&")
    return re.sub(r"\s+", " ", text).strip()


def load_club_names() -> dict[str, str]:
    """initials -> full club name, from the club listing already on disk."""
    if not CLUBS.exists():
        raise SystemExit("data/clubs.json missing. Run tools/clubs.py first.")
    clubs = json.loads(CLUBS.read_text(encoding="utf-8"))["clubs"]
    return {c["initials"]: c["name"] for c in clubs if c.get("initials")}


def parse_rows(html: str) -> tuple[list[dict], int]:
    """Walk every <tr>; month headers set context, 14-cell rows are events.

    Returns (events, month_header_count) so the caller can sanity-check that
    the page still has twelve month sections.
    """
    events: list[dict] = []
    month: int | None = None
    year: int | None = None
    headers = 0

    for tr in re.findall(r"<tr\b[^>]*>(.*?)</tr>", html, re.S | re.I):
        flat = strip_tags(tr)
        header = MONTH_HEADER_RE.match(flat)
        if header:
            month = MONTHS[header.group(1).lower()]
            year = int(header.group(2))
            headers += 1
            continue

        cells = re.findall(r"<td\b[^>]*>(.*?)</td>", tr, re.S | re.I)
        if len(cells) != 13:
            continue  # navigation, banners, month strip
        texts = [strip_tags(c) for c in cells]

        # Day columns: cells 0..6. Empty means no event; letters mean it is the
        # month's weekday header strip ("F S S M T W T").
        days = [t for t in texts[0:7] if t]
        if not days:
            continue
        if not all(re.fullmatch(r"\d{1,2}", d) for d in days):
            if all(re.fullmatch(r"[A-Za-z]+", d) for d in days):
                continue  # weekday strip
            raise EventParseError(f"{year}-{month:02d}: non-numeric day in {flat!r}")
        if month is None or year is None:
            raise EventParseError(f"Event row before any month header: {flat!r}")

        type_ = texts[7]
        club_raw = texts[8]
        venue = texts[9]
        state = texts[10].upper() or None
        region_raw = texts[11]

        if state is not None and state not in US_STATES:
            raise EventParseError(f"{year}-{month:02d}: unknown state {state!r} in {flat!r}")

        cancelled = bool(re.search(r"\bcancell?ed\b", club_raw, re.I))
        # "(Specialty)", "(National Specialty)", and one row with the closing
        # parenthesis missing — "IWCA (National Specialty".
        spec_m = re.search(r"\(\s*(National\s+)?Specialty\)?", club_raw, re.I)
        specialty = spec_m is not None
        national = bool(spec_m and spec_m.group(1))
        initials = re.sub(r"\bcancell?ed\b", "", club_raw, flags=re.I)
        initials = re.sub(r"\(\s*(National\s+)?Specialty\)?", "", initials, flags=re.I).strip()

        region_m = re.fullmatch(r"(\d{1,2})\*?", region_raw)
        region = int(region_m.group(1)) if region_m else None
        if region is not None and not 1 <= region <= 10:
            raise EventParseError(f"{year}-{month:02d}: region {region} out of range in {flat!r}")

        # The premium link lives on the club cell (and again on the go button).
        href_m = re.search(r'href="([^"]+\.pdf)"', cells[8], re.I) or re.search(
            r'href="([^"]+\.pdf)"', cells[12], re.I
        )
        premium = None
        if href_m:
            premium = href_m.group(1).replace(" ", "%20")
            if not premium.startswith("http"):
                premium = "https://www.asfa.org/event/" + premium

        start = date(year, month, int(days[0]))
        end = date(year, month, int(days[-1]))
        if end < start:
            raise EventParseError(f"{year}-{month:02d}: days out of order in {flat!r}")

        events.append({
            "start": start.isoformat(),
            "end": end.isoformat(),
            "type": type_,
            "initials": initials,
            "specialty": specialty,
            "national": national,
            "cancelled": cancelled,
            "venue": venue,
            "state": state,
            "region": region,
            "premium_url": premium,
        })

    return events, headers


def share_weekend_premiums(events: list[dict]) -> None:
    """Attach a weekend's premium to its link-less sibling rows.

    Clubs running back-to-back one-day trials publish one premium covering
    both, but ASFA's schedule attaches the link only to one row (GONE's
    Starkville September weekend: the PDF names both Sep 5 and Sep 6, the
    page links only Sep 5). Propagate only under tight constraints -- same
    initials, same state, dates adjacent within one day, and exactly one
    distinct premium among those neighbours -- and mark the row, so this
    stays auditable inference rather than a silent guess.
    """
    from datetime import date

    def d(s: str) -> date:
        return date.fromisoformat(s)

    for event in events:
        if event["premium_url"]:
            event["premium_inferred"] = False
            continue
        urls = {
            s["premium_url"]
            for s in events
            if s is not event
            and s["initials"] == event["initials"]
            and s["state"] == event["state"]
            and s["premium_url"]
            and (
                abs((d(s["start"]) - d(event["end"])).days) <= 1
                or abs((d(event["start"]) - d(s["end"])).days) <= 1
            )
        }
        if len(urls) == 1:
            event["premium_url"] = urls.pop()
            event["premium_inferred"] = True
        else:
            event["premium_inferred"] = False


def main() -> int:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    html = get(SOURCE_URL)

    raw = html.encode(PAGE_ENCODING, errors="replace")
    digest = hashlib.sha256(raw).hexdigest()
    existing = sorted(RAW_DIR.glob("*.html"))
    if not existing or hashlib.sha256(existing[-1].read_bytes()).hexdigest() != digest:
        target = RAW_DIR / f"{datetime.now(timezone.utc).date().isoformat()}.html"
        target.write_bytes(raw)
        print(f"Archived {target.relative_to(ROOT)}")
        existing = sorted(RAW_DIR.glob("*.html"))

    # Dated from the newest archive, not the wall clock, so an unchanged page
    # produces an unchanged events.json and the weekly workflow stays quiet.
    fetched = existing[-1].stem

    events, headers = parse_rows(html)
    if headers < 12:
        raise SystemExit(
            f"Only {headers} month headers found (expected 12). "
            "The page layout has changed; check before trusting this parse."
        )
    if not events:
        raise SystemExit("No event rows parsed. The page layout has changed.")

    share_weekend_premiums(events)

    names = load_club_names()
    # Rows that are not member clubs and so cannot resolve via clubs.json.
    # ACOD and the II are ASFA's own events; naming them is not a guess.
    names.setdefault("ACOD", "Annual Convention of Delegates")
    names.setdefault("ASFA International Invit.", "ASFA International Invitational")
    unmatched = sorted({e["initials"] for e in events if e["initials"] not in names})
    for event in events:
        # Unmatched initials stay as published rather than being guessed at.
        event["club"] = names.get(event["initials"], event["initials"])

    events.sort(key=lambda e: (e["start"], e["initials"]))
    seasons = sorted({int(e["start"][:4]) for e in events})

    # The calendar PDF's filename carries a revision date, so discover it.
    pdf_m = re.search(r'href="([^"]*Calendar[^"]*\.pdf)"', html, re.I)
    calendar_pdf = None
    if pdf_m:
        calendar_pdf = pdf_m.group(1).replace(" ", "%20")
        if not calendar_pdf.startswith("http"):
            calendar_pdf = "https://www.asfa.org/event/" + calendar_pdf

    bundle = {
        "seasons": seasons,
        "fetched": fetched,
        "source_url": SOURCE_URL,
        "calendar_pdf_url": calendar_pdf,
        "region_source": REGION_SOURCE,
        "regions": regions_as_list(),
        "stats": {
            "events": len(events),
            "cancelled": sum(1 for e in events if e["cancelled"]),
            "with_premium": sum(1 for e in events if e["premium_url"]),
        },
        "unmatched_initials": unmatched,
        "events": events,
    }
    OUTPUT.write_text(
        json.dumps(bundle, indent=2, ensure_ascii=False), encoding="utf-8")

    s = bundle["stats"]
    print(
        f"{OUTPUT.relative_to(ROOT)}  {s['events']} events "
        f"({s['cancelled']} cancelled, {s['with_premium']} with premiums), "
        f"seasons {seasons}"
    )
    if unmatched:
        print(f"  {len(unmatched)} initials not in clubs.json (shown as-is):")
        for i in unmatched:
            print(f"     {i}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
