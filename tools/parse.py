"""Parse an archived ASFA Top 20 snapshot into structured rows.

The page is one long HTML table. Breed sections are delimited by header rows
carrying class="tableheader", whose third cell holds the breed name and the
"total competing: N" count. Every row — header and data alike — has exactly
eight cells:

    Rank | Call Name | Registered Name | Owner | Region | Top 20 Pts | BOB | BIF

Usage:
    python tools/parse.py                    # parse every snapshot
    python tools/parse.py 2026-07-17         # parse one
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup

from names import collapse, slugify, split_owners, split_titles

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT_DIR = ROOT / "data" / "snapshots"

PAGE_ENCODING = "cp1252"

# Sections that are stakes or grouped divisions rather than a single breed.
# Published verbatim; grouped here only so the UI can label them honestly.
NON_BREED_SECTIONS = {
    "Singles",
    "LCI Large",
    "LCI Small",
    "LCI Sighthound Mix",
}

TOTAL_COMPETING_RE = re.compile(r"total\s+competing:\s*(\d+)?", re.IGNORECASE)

COLUMNS = ("rank", "call_name", "registered_name", "owner",
           "region", "points", "bob", "bif")


class ParseError(RuntimeError):
    """Raised when the page no longer matches the structure we rely on."""


def cell_text(cell) -> str:
    return collapse(cell.get_text(" ", strip=True))


def as_int(value: str, field: str, context: str) -> int:
    if not re.fullmatch(r"\d+", value or ""):
        raise ParseError(f"{context}: {field} is not an integer: {value!r}")
    return int(value)


def parse_section_header(text: str) -> tuple[str, int | None]:
    """Pull breed name and competitor count out of a header cell."""
    match = TOTAL_COMPETING_RE.search(text)
    if not match:
        raise ParseError(f"header cell has no 'total competing': {text!r}")
    breed = collapse(text[: match.start()])
    if not breed:
        raise ParseError(f"header cell has no breed name: {text!r}")
    total = int(match.group(1)) if match.group(1) else None
    return breed, total


def validate_ranks(breed: str, rows: list[dict]) -> None:
    """Ranks must form a valid competition sequence: 1,2,2,4 — never 1,2,2,3.

    Ties are common (three hounds can share rank 1), so this is the only
    structural check that catches a dropped or duplicated row.
    """
    if not rows:
        return
    ranks = [row["rank"] for row in rows]
    if ranks[0] != 1:
        raise ParseError(f"{breed}: first rank is {ranks[0]}, expected 1")

    expected = 1
    index = 0
    while index < len(ranks):
        rank = ranks[index]
        if rank != expected:
            raise ParseError(
                f"{breed}: rank {rank} at position {index + 1}, expected {expected} "
                f"(sequence: {ranks})"
            )
        tied = 1
        while index + tied < len(ranks) and ranks[index + tied] == rank:
            tied += 1
        index += tied
        expected = rank + tied


def parse_html(html: str, as_of: str, season: int, source: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")

    first_header = soup.find("tr", class_="tableheader")
    if first_header is None:
        raise ParseError("no rows with class='tableheader' — page layout changed")

    table = first_header.find_parent("table")
    if table is None:
        raise ParseError("header row has no parent table")

    sections: list[dict] = []
    current: dict | None = None

    for tr in table.find_all("tr"):
        cells = [cell_text(td) for td in tr.find_all("td")]
        if len(cells) != len(COLUMNS):
            raise ParseError(
                f"row has {len(cells)} cells, expected {len(COLUMNS)}: {cells}"
            )

        if "tableheader" in (tr.get("class") or []):
            breed, total = parse_section_header(cells[2])
            current = {
                "breed": breed,
                "breed_slug": slugify(breed),
                "is_breed": breed not in NON_BREED_SECTIONS,
                "total_competing": total,
                "dogs": [],
            }
            sections.append(current)
            continue

        # Each section ends with an empty spacer row.
        if not any(cell for cell in cells):
            continue

        if current is None:
            raise ParseError(f"data row before any section header: {cells}")

        context = f"{current['breed']} row {len(current['dogs']) + 1}"

        # ASFA marks provisional entries with a leading asterisk on the name.
        registered_raw = cells[2]
        provisional = registered_raw.startswith("*") or cells[1].startswith("*")
        registered_raw = registered_raw.lstrip("* ").strip()
        call_name = cells[1].lstrip("* ").strip()

        prefixes, core, suffixes = split_titles(registered_raw)
        # Region is genuinely blank for some hounds; points are never blank.
        region = int(cells[4]) if re.fullmatch(r"\d+", cells[4] or "") else None

        current["dogs"].append({
            "rank": as_int(cells[0], "rank", context),
            "call_name": call_name,
            "registered_name": registered_raw,
            "core_name": core,
            "titles_prefix": prefixes,
            "titles_suffix": suffixes,
            "owner_raw": cells[3],
            "owners": split_owners(cells[3]),
            "region": region,
            "points": as_int(cells[5], "points", context),
            "bob": as_int(cells[6], "bob", context),
            "bif": as_int(cells[7], "bif", context),
            "provisional": provisional,
            "id": f"{slugify(core or registered_raw)}--{slugify(current['breed'])}",
        })

    for section in sections:
        validate_ranks(section["breed"], section["dogs"])
        total = section["total_competing"]
        listed = len(section["dogs"])
        if total is not None and listed > total:
            raise ParseError(
                f"{section['breed']}: {listed} hounds listed but only {total} "
                f"reported competing"
            )

        ids = [dog["id"] for dog in section["dogs"]]
        duplicates = {i for i in ids if ids.count(i) > 1}
        if duplicates:
            raise ParseError(
                f"{section['breed']}: two hounds normalize to the same id "
                f"{sorted(duplicates)} — add an override to data/aliases.yml"
            )

    return {
        "season": season,
        "as_of": as_of,
        "source": source,
        "sections": sections,
    }


def read_period(html: str) -> tuple[int, str]:
    """Reuse the page's own coverage statement rather than the filename."""
    from fetch import read_period as _read_period

    season, end = _read_period(html)
    return season, end.isoformat()


def parse_snapshot(path: Path) -> dict:
    html = path.read_bytes().decode(PAGE_ENCODING)
    season, as_of = read_period(html)
    if as_of != path.stem:
        raise ParseError(
            f"{path.name} states coverage through {as_of} — filename and "
            f"content disagree"
        )
    return parse_html(html, as_of=as_of, season=season, source=path.name)


def main(argv: list[str]) -> int:
    wanted = argv[1:]
    paths = (
        [SNAPSHOT_DIR / f"{stem}.html" for stem in wanted]
        if wanted
        else sorted(SNAPSHOT_DIR.glob("*.html"))
    )
    if not paths:
        print("No snapshots found. Run tools/fetch.py first.", file=sys.stderr)
        return 1

    for path in paths:
        if not path.exists():
            print(f"Missing snapshot: {path}", file=sys.stderr)
            return 1
        parsed = parse_snapshot(path)
        out = path.with_suffix(".json")
        out.write_text(
            json.dumps(parsed, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        dogs = sum(len(s["dogs"]) for s in parsed["sections"])
        empty = sum(1 for s in parsed["sections"] if not s["dogs"])
        print(
            f"{path.name}: {len(parsed['sections'])} sections "
            f"({empty} with no ranked hounds), {dogs} hounds -> {out.name}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
