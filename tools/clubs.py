"""Extract the ASFA club directory: club name, region, initials, affiliation.

ASFA publishes a club listing PDF whose Region column is the authoritative
club-to-region mapping. Deriving region from a venue's state would be wrong:
the Constitution splits California and Nevada between Regions 2 and 10 by
county and highway, and clubs travel outside their own region to hold trials.

PRIVACY: that PDF also carries each club liaison's name, home address, phone
number and email. None of it is needed here and none of it is written to
data/. Only the first four columns are read; see KEEP_COLUMNS.

Usage:
    python tools/clubs.py            # fetch and extract if the listing changed
    python tools/clubs.py --force
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import pdfplumber
import requests

from names import collapse, slugify

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "clubs" / "raw"
OUTPUT = ROOT / "data" / "clubs.json"

CLUBS_PAGE = "https://www.asfa.org/clubs/index.htm"
USER_AGENT = (
    "lure-coursing-stats/1.0 (unofficial ASFA statistics site; "
    "+https://github.com/jackrabbit-project/stats)"
)
PAGE_ENCODING = "cp1252"

# The only columns read out of the PDF. Everything to the right of these is
# personal contact information and is deliberately never touched.
KEEP_COLUMNS = ("Club Name", "Region", "Club Initials", "Affiliation")

AFFILIATION = {
    "M": "Member",
    "A": "Affiliate",
    "AP": "Applied",
    "FTA": "Fast Track Affiliate",
    "FTAP": "Fast Track Applied",
}

# Words that carry no signal when matching a club name from the trial results
# against the club directory: "COURSING HOUNDS ASSOCIATION OF MID-POTOMAC" has
# to reach "Coursing Hounds of the Mid-Potomac".
MATCH_NOISE = {
    "the", "of", "a", "an", "and", "inc", "club", "association", "assn",
    "society", "organization", "org", "coursing", "lure", "sighthound",
    "sighthounds", "gazehound", "gazehounds", "hound", "hounds",
}


def find_pdf_url() -> str:
    """The listing's filename carries a date, so discover it rather than pin it."""
    response = requests.get(CLUBS_PAGE, headers={"User-Agent": USER_AGENT}, timeout=30)
    response.raise_for_status()
    html = response.content.decode(PAGE_ENCODING, errors="replace")

    candidates = [
        href for href in re.findall(r'href="([^"]+\.pdf)"', html, re.IGNORECASE)
        if "club" in href.lower() and "suspension" not in href.lower()
    ]
    if not candidates:
        raise SystemExit(
            "No club listing PDF found on the clubs page. The page layout "
            "changed; check it before trusting any extraction."
        )
    return urljoin(CLUBS_PAGE, candidates[0])


def unwrap(cell: str | None) -> str:
    """Undo the PDF's mid-cell line wrapping.

    A name broken after a hyphen ("Mid-\\nPotomac") must close up, not gain a
    space; anywhere else the break stands in for one.
    """
    text = (cell or "").replace("-\n", "-")
    return collapse(text.replace("\n", " "))


def match_key(name: str) -> str:
    """Normalized token set for matching a club across ASFA's two spellings."""
    words = re.findall(r"[a-z0-9]+", collapse(name).lower())
    kept = [word for word in words if word not in MATCH_NOISE]
    return " ".join(sorted(kept or words))


def extract(pdf_path: Path) -> list[dict]:
    clubs: list[dict] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            table = page.extract_table()
            if not table:
                continue
            for row in table:
                if not row or not row[0]:
                    continue
                # Header cells arrive as "Club\nInitials"; normalize before compare.
                if unwrap(row[0]) == "Club Name":
                    header = [unwrap(cell) for cell in row]
                    if header[: len(KEEP_COLUMNS)] != list(KEEP_COLUMNS):
                        raise SystemExit(
                            f"Club listing columns changed: {header[:6]}. Refusing "
                            f"to extract, because the column order is what keeps "
                            f"liaison contact data out of this repository."
                        )
                    continue

                # Cell text wraps mid-name in the PDF.
                name = unwrap(row[0])
                region_raw = unwrap(row[1])
                initials = unwrap(row[2])
                affiliation = unwrap(row[3])

                if not re.fullmatch(r"\d{1,2}", region_raw):
                    raise SystemExit(f"{name!r}: region is not a number: {region_raw!r}")

                clubs.append({
                    "name": name,
                    "slug": slugify(name),
                    "initials": initials,
                    "affiliation": affiliation,
                    "affiliation_label": AFFILIATION.get(affiliation, affiliation),
                    "region": int(region_raw),
                    "match_key": match_key(name),
                })

    if not clubs:
        raise SystemExit("No club rows extracted; the PDF layout changed.")

    # Two clubs collapsing to one match key would silently misfile a trial's
    # entries into the wrong region. Refuse rather than pick.
    keys: dict[str, str] = {}
    for club in clubs:
        clash = keys.get(club["match_key"])
        if clash:
            raise SystemExit(
                f"{club['name']!r} and {clash!r} normalize to the same match key "
                f"{club['match_key']!r}. Narrow MATCH_NOISE before continuing."
            )
        keys[club["match_key"]] = club["name"]

    return clubs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true",
                        help="re-extract even if the PDF is unchanged")
    args = parser.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    url = find_pdf_url()

    response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=60)
    response.raise_for_status()
    raw = response.content

    name = re.sub(r"[^\w.-]+", "-", url.rsplit("/", 1)[-1])
    target = RAW_DIR / name
    digest = hashlib.sha256(raw).hexdigest()

    if target.exists() and not args.force:
        if hashlib.sha256(target.read_bytes()).hexdigest() == digest:
            print(f"{name} unchanged.")
        else:
            print(f"{name} changed in place; re-run with --force to overwrite.")
            return 0
    else:
        target.write_bytes(raw)
        print(f"Archived {name} ({len(raw):,} bytes)")

    clubs = extract(target)
    clubs.sort(key=lambda club: club["name"])

    OUTPUT.write_text(json.dumps({
        "source_url": url,
        "source_file": name,
        "generated": datetime.now(timezone.utc).date().isoformat(),
        "note": (
            "Club name, region, initials and affiliation only. The source PDF "
            "also lists liaison names, addresses, phone numbers and email "
            "addresses; those are deliberately not extracted or stored."
        ),
        "clubs": clubs,
    }, indent=2, ensure_ascii=False), encoding="utf-8")

    by_region: dict[int, int] = {}
    for club in clubs:
        by_region[club["region"]] = by_region.get(club["region"], 0) + 1
    print(f"{len(clubs)} clubs -> {OUTPUT.relative_to(ROOT)}")
    print("  per region: " + "  ".join(
        f"R{region}:{by_region[region]}" for region in sorted(by_region)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
