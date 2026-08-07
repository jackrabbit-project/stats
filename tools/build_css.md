# How the CSS is built

The site's stylesheet, `css/app.css`, is **compiled and checked in** — pages
load it like any static file, and deploys need no build step. What gets
compiled:

- `css/input.css` — the source. Design tokens (CSS custom properties holding
  bare RGB triplets, light and dark), `@font-face` rules, and every site
  component class (`.card`, `.tbl`, `.badge`, …).
- `tailwind.config.js` — maps the `asfa-*` color names used in markup onto
  those tokens via `rgb(var(--x) / <alpha-value>)`, which is what keeps
  opacity-modifier classes like `text-asfa-text/60` working.
- Tailwind scans `./*.html` and `./js/*.js` for class names and emits only
  the utilities actually used. All class usage in this repo is literal
  strings (no runtime concatenation), so the scan is complete.

## Rebuilding

Any time `input.css`, `tailwind.config.js`, or class usage in HTML/JS
changes:

    powershell -ExecutionPolicy Bypass -File tools/build_css.ps1

Add `-Watch` to rebuild on every save while working. The script downloads
the standalone Tailwind CLI (pinned **v3.4.17**, the same major version the
old Play CDN served) into `tools/bin/` on first run; that directory is
gitignored. Commit the regenerated `css/app.css` together with the source
change.

**If you add a new Tailwind utility class to any HTML or JS file, the
rebuild is required** — otherwise the class silently does nothing in
production.

## Sanity checks after a rebuild

- `css/app.css` still contains `.hidden{` and `.sr-only{` — four JS files
  toggle `.hidden`, and screen-reader labels rely on `.sr-only`. Both are
  Tailwind-generated and disappear if their literal names ever vanish from
  the scanned files.
- The page renders identically at http://localhost:8765 via
  `python tools/serve.py`.

## Why not the CDN?

The site previously loaded `cdn.tailwindcss.com` (the Play CDN) plus a
runtime config in `js/theme.js`. That compiled the CSS in the browser on
every page view: ~300 KB of JavaScript, a flash of unstyled content, and a
hard dependency on a third-party CDN that Tailwind documents as "not for
production." The compiled file is a few KB, renders instantly, and works
even if every CDN on earth is down.

## Fonts

Webfonts are self-hosted in `assets/fonts/` and declared in
`css/input.css`. To re-download or add subsets, request the family CSS from
the Google Fonts API with a modern-browser `User-Agent` header and fetch the
`latin` woff2 URLs it returns, e.g.:

    https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&display=swap
    https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,100..900&display=swap
    https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap

(Fonts are licensed under the SIL Open Font License; self-hosting is
permitted and expected.)
