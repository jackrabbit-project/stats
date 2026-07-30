# ASFA Top 20 — 2026 Season

A searchable, browsable view of the **American Sighthound Field Association Top 20 lure coursing standings**.

ASFA publishes the standings as one long page of stacked breed tables. You cannot search it, look up a single hound, or see where a hound sits against the rest of its breed without counting by hand. This site reads that page and rearranges it.

- **Search** by call name, registered name, or owner
- **Hound profiles** — Bowen points, Best of Breed, Best in Field, and standing within the breed
- **Leaderboards** — most BIF, most BOB, most points, highest breed standing
- **Kennels** — which owners are having the season
- **Regions** — Top 20 standings per region, plus which regions and clubs are drawing the most trial entries
- **Head to head** — two hounds side by side
- **Stat cards** — a shareable PNG per hound, rendered in the browser

**This is an independent, unofficial project. It is not authorized, approved, or endorsed by ASFA, and it is not an ASFA publication.** Wherever this site and [ASFA's published standings](https://www.asfa.org/20/index.htm) disagree, ASFA's page governs.

## Layout

```
index.html  browse.html  dog.html  leaders.html  kennels.html  regions.html
compare.html  about.html
css/site.css          Custom classes on top of Tailwind
js/theme.js           Shared Tailwind palette
js/app.js             Data loading, chrome, search, formatting
js/card.js            Canvas stat-card renderer
tools/                Python ETL — fetch, parse, clubs, trials, build, check
data/snapshots/       Every published standings page, archived verbatim
data/trials/raw/      Every monthly trial results page, archived verbatim
data/clubs/raw/       The ASFA club listing PDF
data/season.json      Standings — loaded by every page
data/trials.json      Trial entries by club and region — loaded by regions.html
data/clubs.json       Club directory: name, region, initials, affiliation only
```

The site itself has no build step and no framework: Tailwind and Font Awesome load from CDNs, the Abel webfont from Google Fonts, everything else is vanilla JavaScript. Python runs offline to produce `data/season.json`.

## Updating the data

```bash
pip install -r requirements.txt
python tools/fetch.py && python tools/clubs.py && python tools/parse.py && python tools/trials.py && python tools/build.py && python tools/check.py
```

`fetch.py` archives the live page under `data/snapshots/{date}.html`, named for the coverage date the page states about itself rather than the wall clock. It skips the write when the page is unchanged. Raw snapshots are committed so every figure on the site traces back to the bytes ASFA served on a given date — and so movement between publications can be computed.

A [weekly workflow](.github/workflows/refresh.yml) runs the same four commands and commits when the standings change.

## Serving locally

```bash
python -m http.server 8765
```

Then open <http://localhost:8765>. The pages fetch `data/season.json`, so opening the files directly with `file://` will not work.

## How the numbers are built

`about.html` is the full account, and it is worth reading before drawing conclusions. The short version:

- **Breed standing** is the only derived figure — rank divided by the number of hounds ASFA reports competing in that breed. Ranked 4th of 25 is *top 16%*.
- **A Top 20 list holds about twenty hounds per breed.** A hound placing 22nd is absent. Totals here cover placings on that list, not a complete competition record.
- **Points do not compare across breeds.** A breed with 200 hounds competing offers far more of them than one with five. Breed standing and Best in Field are the figures that compare fairly.
- **The Singles stake overlaps the breed lists.** Hounds that run Singles are also listed under their breed, sometimes with the same BIF and BOB on both rows. Where sections are combined, the site takes the *maximum* of each figure rather than the sum, so a record can never be inflated by double counting.
- **Identity and owner matching are approximate.** There is no registration number in the published data, and a registered name gains titles mid-season. Titles are stripped to match a hound to itself between updates; owner spellings are merged where the match is mechanical.
- **Two people can share a name.** An owner's home region is taken from rows where they are listed *first* — that is whose region the row carries. A name leading in two regions is two people (K.Sanders has six Basenjis in Region 8 and a Silken Windhound in Region 1) unless a co-owner appears in both, which makes it one person whose hounds live in different places. Thin cases are split and listed in `data/review/owner-splits.csv`.
- **Region means two different things.** In the standings it is the *owner's* region; on trial entries it is the *club's*, from ASFA's club listing. Clubs travel — Borzoi Club of America is a Region 4 club that ran in Nebraska this year — so the two are never combined.
- **No personal contact data.** ASFA's club listing carries liaison names, home addresses, phone numbers and emails. Only club name, region, initials and affiliation are extracted, and `check.py` fails the build if anything else appears in `data/`.

`tools/check.py` re-derives the totals by a different route than `tools/build.py` and fails if the two disagree. It also counts rows straight out of the raw HTML, so a silently dropped row is caught rather than quietly corrupting a leaderboard.

## Reporting an error

Please check against [ASFA's published standings](https://www.asfa.org/20/index.htm) first. If the two disagree, ASFA is right and this site has a bug — please [open an issue](https://github.com/jackrabbit-project/asfa-top20/issues/new) or email **info@gazehound.io**. If ASFA's own listing looks wrong, that goes to the ASFA Records Secretary, not here.

## License

The code is [MIT](LICENSE). The standings data under `data/` is ASFA's and is reproduced with attribution; the Jackrabbit Project icon files are not MIT-licensed. See [LICENSE](LICENSE) for the carve-outs.
