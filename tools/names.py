"""Name normalization for ASFA registered names and owner strings.

Two jobs, both of which exist because the published standings are prose, not a
database export:

1. A hound's registered name carries its titles, and titles accrue *during* the
   season. "Hyflyte Esmeralda" in March is "Hyflyte Esmeralda FCh" in July. To
   recognize the same hound across snapshots we strip titles down to a core
   name and match on that.

2. Owners are free text with inconsistent ordering ("E.& S.Kominek" and
   "S.& E.Kominek" are one household), embedded credentials, and multi-word
   surnames ("Van de Water", "von Broembsen"). Kennel leaderboards need a
   stable key for each owning party.

Neither problem is perfectly solvable from this source. Both are solved well
enough to be useful, with data/aliases.yml as the escape hatch for the rest.
"""

from __future__ import annotations

import re
import unicodedata

# Championship-style titles that appear *before* the registered name. ASFA
# publishes them comma-separated, space-separated, or both.
#
# There is deliberately no catch-all heuristic on this side: a registered name
# may legitimately open with an all-caps kennel abbreviation ("RG On The Stix"),
# and stripping it would be wrong. Vocabulary only.
PREFIX_TITLES = {
    "fc", "dc", "ch", "gch", "gchb", "gchs", "gchp", "gcha", "gchg",
    "bii", "bis", "biss", "rbis", "mbis", "gsw",
    "bif", "mbif", "nbif", "sbif", "nsbif",
    "ckc", "ukc", "akc", "u-ch", "u-gch", "uch", "ugch", "cd-ch",
    "cch", "frch", "frrch", "isws", "iswsch", "asfa",
    "am", "can", "int", "intl", "uk", "mex", "arg", "brz", "aust",
    "dual", "trial",
}

# Performance / working titles that trail the registered name. Compared after
# stripping any trailing digits, so LCM12, LCX5 and CAX3 all match their base.
#
# This list will never be complete — owners keep earning titles from new venues.
# See _looks_like_title() for the fallback that keeps one unknown abbreviation
# from blocking every title to its left.
SUFFIX_TITLES = {
    # Lure coursing / open field
    "lcm", "vlcm", "lcx", "lci", "lcc", "lca", "lce", "fch", "vfch", "fchx",
    "jor", "sor", "sorc", "grc", "sgrc", "orc", "mhd", "dt", "nc",
    # AKC coursing / speed
    "jc", "qc", "sc", "mc", "ca", "caa", "cax", "bcat", "dcat", "fcat",
    "cat", "sccx", "cpx",
    # Obedience / rally / agility / tracking / hunting
    "cd", "cdx", "udx", "ut", "rn", "ra", "re", "rm", "ri", "rae", "bn",
    "na", "naj", "nf", "oa", "oaj", "of", "ax", "axj", "xf", "mx", "mxj",
    "nap", "njp", "oap", "ojp", "axp", "ajp", "td", "tdx", "vst", "jh", "sh",
    # Barn hunt / scent work / farm dog / trick / temperament
    "ratn", "rati", "rato", "rats", "ratm", "ratchx",
    "scn", "sin", "sen", "sbn", "swn", "swa", "sca", "sia", "sea", "sba",
    "sce", "see", "sbe", "scm",
    "fdc", "act1", "act2", "actm", "att", "tt", "thd", "tdi",
    "tkn", "tkp", "tka", "tki", "tke",
    # Versatility / breed-club / miscellaneous
    "cgc", "cgca", "cgcu", "cgu", "ssr", "str", "vc", "vcx", "rd", "hof",
    "vhma", "vhmp", "fits", "fitb", "fitg", "fitl",
}

# Titles are written in caps; registered names are written in title case. A
# trailing all-caps token is therefore almost certainly a title we haven't
# catalogued. Restricted to the suffix side, where over-stripping is harmless:
# core names are only used for matching, never displayed, and parse.py asserts
# that no two hounds in a section collapse to the same id.
_ALL_CAPS_TOKEN = re.compile(r"^[A-Z][A-Z0-9&'./-]{1,9}$")

# Credentials and honorifics attached to owner names.
OWNER_NOISE = re.compile(
    r"\b(?:dr|drs|mr|mrs|ms|dvm|vmd|md|mph|phd|dds|rn|esq|jr|sr|iii|ii)\b\.?",
    re.IGNORECASE,
)


def collapse(text: str) -> str:
    """Collapse runs of whitespace, including the non-breaking spaces ASFA uses."""
    return re.sub(r"\s+", " ", (text or "").replace("\xa0", " ")).strip()


def slugify(text: str) -> str:
    """Lowercase ASCII slug. Punctuation inside kennel names is noise for matching."""
    normalized = unicodedata.normalize("NFKD", text or "")
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")
    return slug


def _parts(token: str) -> list[str]:
    """Split a compound title token: "ISWS/UKC" and "FCh&NC" are each two titles."""
    return [part for part in re.split(r"[/&]", token.strip(".,")) if part]


def _is_prefix_title(token: str) -> bool:
    parts = _parts(token)
    return bool(parts) and all(part.lower() in PREFIX_TITLES for part in parts)


def _is_suffix_title(token: str) -> bool:
    stripped = token.strip(".,")
    parts = _parts(stripped)
    # LCM12 -> lcm, CAX3 -> cax, LCX2 -> lcx
    if parts and all(
        re.sub(r"\d+$", "", part.lower()) in SUFFIX_TITLES for part in parts
    ):
        return True
    return bool(_ALL_CAPS_TOKEN.match(stripped))


def split_titles(registered_name: str) -> tuple[list[str], str, list[str]]:
    """Split a registered name into (prefix titles, core name, suffix titles).

    2025 and earlier put a comma before the suffix titles; 2026 does not
    ("FC Pace Dei Vignazzi SC STR"). So commas are treated as ordinary
    separators and titles are identified by vocabulary from both ends inward.
    """
    text = collapse((registered_name or "").replace(",", " "))
    if not text:
        return [], "", []

    tokens = text.split(" ")
    start, end = 0, len(tokens)

    while start < end and _is_prefix_title(tokens[start]):
        start += 1
    while end > start and _is_suffix_title(tokens[end - 1]):
        end -= 1

    core = " ".join(tokens[start:end]).strip()
    if not core:
        # Every token looked like a title. Trust the source over the vocabulary.
        return [], collapse(registered_name.replace(",", " ")), []

    return tokens[:start], core, tokens[end:]


# A leading run of initials: "E.& S." or "J. & K." or the comma-typo form
# "L & J.". Greedy, so the whole run is consumed and only the surname is left.
# A dot (or an immediately following "&") is required, otherwise the leading
# letter of an unpunctuated kennel name is mistaken for an initial and
# "Kaije KNLs" keys as "aije-knls|k".
_INITIALS_RE = re.compile(r"^((?:[A-Za-z]\.\s*&?\s*|[A-Za-z]\s*&\s*)+)([A-Za-z].*)$")


def owner_key(entity: str) -> str:
    """Stable key for one owning party, order-insensitive across initials.

    "E.& S.Kominek" and "S.& E.Kominek" both key to "kominek|e.s", because the
    standings spell the same household both ways from year to year.
    """
    text = OWNER_NOISE.sub(" ", collapse(entity).replace(",", " "))
    text = collapse(text.strip(" .&"))
    if not text:
        return ""

    initials: list[str] = []
    surname = text
    match = _INITIALS_RE.match(text)
    if match:
        head, tail = match.groups()
        # Only treat the head as initials if a real surname follows.
        if len(collapse(tail)) > 1:
            initials = sorted({c.lower() for c in re.findall(r"\b([A-Za-z])\b", head)})
            surname = collapse(tail)

    surname_slug = slugify(surname)
    if not surname_slug:
        return ""
    return f"{surname_slug}|{'.'.join(initials)}" if initials else surname_slug


def split_owners(owner_raw: str) -> list[dict[str, str]]:
    """Split an owner cell into the distinct parties it names.

    "D.& N.Erickson/S.& E.Kominek" is two households; both co-own the hound and
    both should get credit on a kennel leaderboard.
    """
    text = collapse(owner_raw)
    if not text:
        return []

    entities = []
    seen = set()
    for part in re.split(r"\s*/\s*", text):
        part = collapse(part)
        if not part:
            continue
        key = owner_key(part)
        if not key or key in seen:
            continue
        seen.add(key)
        entities.append({"key": key, "name": part})
    return entities
