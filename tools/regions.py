"""ASFA's ten regions, as defined in the Constitution.

Source: ASFA Constitution & By-Laws (rev. 08/01/2024), Article V, Section 3,
pages 6-7 - "They shall represent the various regions of the country as
defined below".

Reproduced here so the site can label a region rather than print a bare
number. Note that Regions 2 and 10 are NOT clean state lists: California and
Nevada are split between them by county and highway. That is why club region
comes from ASFA's club listing (see tools/clubs.py) and is never derived from
a venue's state.
"""

from __future__ import annotations

REGIONS: dict[int, dict] = {
    1: {
        "states": ["Alaska", "Idaho", "Montana", "Oregon", "Washington"],
        "note": None,
    },
    2: {
        "states": ["Northern California", "Northern Nevada"],
        "note": ("California north from the southern boundary of Monterey, Kings, "
                 "Tulare and Inyo counties; Nevada north of Hwy 6."),
    },
    3: {
        "states": ["Colorado", "New Mexico", "Utah", "Wyoming"],
        "note": None,
    },
    4: {
        "states": ["Arkansas", "Louisiana", "Oklahoma", "Texas"],
        "note": None,
    },
    5: {
        "states": ["Iowa", "Kansas", "Minnesota", "Missouri", "Nebraska",
                   "North Dakota", "South Dakota"],
        "note": None,
    },
    6: {
        "states": ["Illinois", "Indiana", "Kentucky", "Michigan", "Ohio",
                   "Wisconsin"],
        "note": None,
    },
    7: {
        "states": ["Alabama", "Florida", "Georgia", "Mississippi",
                   "North Carolina", "South Carolina", "Tennessee"],
        "note": None,
    },
    8: {
        "states": ["Delaware", "District of Columbia", "Maryland", "New Jersey",
                   "Pennsylvania", "Virginia", "West Virginia"],
        "note": None,
    },
    9: {
        "states": ["Connecticut", "Maine", "Massachusetts", "New Hampshire",
                   "New York", "Rhode Island", "Vermont", "Ontario (Canada)"],
        "note": None,
    },
    10: {
        "states": ["Arizona", "Southern California", "Hawaii", "Southern Nevada"],
        "note": ("Arizona; California south from the northern boundary of San Luis "
                 "Obispo, Kern and San Bernardino counties; Hawaii; Nevada south "
                 "of Hwy 6."),
    },
}

SOURCE = ("ASFA Constitution & By-Laws, rev. 08/01/2024, Article V, Section 3")


def as_list() -> list[dict]:
    """Region definitions as a JSON-serializable list."""
    return [
        {"region": number, "states": entry["states"], "note": entry["note"]}
        for number, entry in sorted(REGIONS.items())
    ]
