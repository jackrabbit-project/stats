/* Shared plumbing for every page: data loading, chrome, search, formatting.
   No framework and no build step, matching the rest of the project. */

const DATA_URL = 'data/season.json';
const TRIALS_URL = 'data/trials.json';
const EVENTS_URL = 'data/events.json';

let seasonPromise = null;
let trialsPromise = null;
let eventsPromise = null;

function loadJson(url) {
  return fetch(url).then((response) => {
    if (!response.ok) throw new Error(`${response.status} loading ${url}`);
    return response.json();
  });
}

/** Fetch season.json once per page load. */
function loadSeason() {
  if (!seasonPromise) {
    seasonPromise = loadJson(DATA_URL).catch((error) => {
      seasonPromise = null;
      throw error;
    });
  }
  return seasonPromise;
}

/** Trial results, loaded only by the pages that need them.

    Kept out of season.json so a change to ASFA's trial pages cannot take the
    rest of the site down with it. */
function loadTrials() {
  if (!trialsPromise) {
    trialsPromise = loadJson(TRIALS_URL).catch((error) => {
      trialsPromise = null;
      throw error;
    });
  }
  return trialsPromise;
}

/** The trial schedule, loaded only by events.html — same isolation as trials. */
function loadEvents() {
  if (!eventsPromise) {
    eventsPromise = loadJson(EVENTS_URL).catch((error) => {
      eventsPromise = null;
      throw error;
    });
  }
  return eventsPromise;
}

/* ------------------------------------------------------------------- icons */

/* Inline SVG icons, sized to the surrounding text (width/height 1em).
   Stroke glyphs are Lucide (lucide.dev, ISC license); brand glyphs are
   Simple Icons (CC0). Always decorative: aria-hidden, paired with visible
   or .sr-only text at the call site. */

const ICON_STROKES = {
  chevronUp: '<path d="m18 15-6-6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  arrowUp: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  arrowDown: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  minus: '<path d="M5 12h14"/>',
  star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
  download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/>',
  search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  mail: '<path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
};

const ICON_FILLS = {
  facebook: '<path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/>',
  x: '<path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/>',
  whatsapp: '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>',
};

function icon(name, cls = '') {
  const stroke = ICON_STROKES[name];
  const attrs = stroke
    ? 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
    : 'fill="currentColor"';
  return `<svg class="ic${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" width="1em" height="1em" ${attrs} aria-hidden="true">${stroke || ICON_FILLS[name]}</svg>`;
}

/* ---------------------------------------------------------------- utilities */

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function dogUrl(id) {
  return `dog.html?id=${encodeURIComponent(id)}`;
}

function ownerUrl(key) {
  return `kennels.html?owner=${encodeURIComponent(key)}`;
}

function breedUrl(slug) {
  return `browse.html?breed=${encodeURIComponent(slug)}`;
}

/** "Region 8", or an em dash when the owner only ever appears as a co-owner. */
function regionLabel(region) {
  return region == null ? '—' : `Region ${region}`;
}

/** What a rank is measured against: "in breed", "in Singles", "in LCI Large".

    A hound ranked in the Singles stake or an LCI division is not ranked in a
    breed, and saying so on a profile or a stat card is simply wrong. */
function rankContext(dog) {
  return dog.is_breed ? 'in breed' : `in ${dog.breed}`;
}

/** The same thing mid-sentence: "the breed", "the Singles stake", "LCI Large". */
function sectionNoun(dog) {
  if (dog.is_breed) return 'the breed';
  return dog.breed === 'Singles' ? 'the Singles stake' : dog.breed;
}

/** "25 Afghan Hounds", "1 Sloughi", "224 hounds in Singles".

    Breed names pluralize by adding an s; the stake and division names do not
    ("Singless"), so those get a noun of their own. */
function competitorsLabel(section, count) {
  const name = esc(section.breed);
  if (!section.is_breed) {
    return `${count} hound${count === 1 ? '' : 's'} in ${name}`;
  }
  return `${count} ${name}${count === 1 ? '' : 's'}`;
}

function param(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/** "top 4.2%" — the fair way to compare hounds across breeds of different size. */
function percentileLabel(dog) {
  if (dog.percentile == null) return '—';
  const value = dog.percentile < 10
    ? dog.percentile.toFixed(1)
    : Math.round(dog.percentile);
  return `top ${value}%`;
}

function formatDate(iso) {
  if (!iso) return '';
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

/** Rank movement since the previous ASFA publication. */
function movementBadge(movement) {
  if (!movement) return '';
  if (movement.new) {
    return `<span class="badge badge-new">${icon('star')} new<span class="sr-only"> to the standings</span></span>`;
  }
  const delta = movement.rank_delta;
  if (!delta) {
    return '<span class="badge badge-flat"><span aria-hidden="true">–</span><span class="sr-only">no change</span></span>';
  }
  const up = delta > 0;
  const cls = up ? 'badge-up' : 'badge-down';
  const n = Math.abs(delta);
  return `<span class="badge ${cls}">${icon(up ? 'arrowUp' : 'arrowDown')} ${n}<span class="sr-only"> place${n === 1 ? '' : 's'} ${up ? 'up' : 'down'}</span></span>`;
}

/** BOB and BIF as achievements, zero where the stake cannot award them.

    Hounds run alone in Singles, whose winner "shall not be eligible to compete
    in Best of Breed nor in Best in Field" (Running Rules Ch. V §5(d)), and Best
    of Breed is contested between breed stakes, which the LCI divisions are not.
    ASFA still prints both figures on those rows — they are the hound's
    breed-stake record carried across — so they are shown as published but never
    counted toward a Singles or LCI total. */
function creditable(dog, stat) {
  return dog.is_breed ? dog[stat] : 0;
}

/** A BOB or BIF cell for a table that mixes breed and non-breed rows.

    There is no Best of Breed or Best in Field to win in the Singles stake or an
    LCI division, so those rows get an em dash rather than a number that cannot
    mean what the column header says. */
function awardCell(dog, stat) {
  return dog.is_breed ? dog[stat] : '—';
}

/** Collapse entries that describe one hound ranked in more than one section.

    A hound in the Singles stake is also listed under its breed, with the same
    BIF and BOB on both rows. Stats combine with max(), never sum, so a
    cross-section leaderboard can't inflate a record. */
function groupHounds(dogs) {
  const grouped = new Map();
  for (const dog of dogs) {
    const existing = grouped.get(dog.hound_key);
    if (!existing) {
      grouped.set(dog.hound_key, {
        ...dog,
        bob: creditable(dog, 'bob'),
        bif: creditable(dog, 'bif'),
        entries: [dog],
      });
      continue;
    }
    existing.entries.push(dog);
    existing.points = Math.max(existing.points, dog.points);
    existing.bob = Math.max(existing.bob, creditable(dog, 'bob'));
    existing.bif = Math.max(existing.bif, creditable(dog, 'bif'));
    if (dog.rank < existing.rank) {
      existing.rank = dog.rank;
      existing.percentile = dog.percentile;
      existing.breed = dog.breed;
      existing.breed_slug = dog.breed_slug;
      existing.total_competing = dog.total_competing;
    }
  }
  return [...grouped.values()];
}

/* ------------------------------------------------------------------ search */

function searchDogs(query, dogs, limit = 40) {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];

  const scored = [];
  for (const dog of dogs) {
    const call = dog.call_name.toLowerCase();
    const registered = dog.registered_name.toLowerCase();

    // Owner is deliberately not matched. ASFA publishes owners as initials and
    // a surname ("D.& N.Erickson"), so a search for a full first name never
    // hits and the box reads as broken. Owners are browsable on Kennels.
    let score = 0;
    if (call === needle) score = 100;
    else if (call.startsWith(needle)) score = 90;
    else if (registered.toLowerCase().startsWith(needle)) score = 80;
    else if (call.includes(needle)) score = 70;
    else if (registered.includes(needle)) score = 60;
    else if (dog.breed.toLowerCase().includes(needle)) score = 20;

    if (score) scored.push({ dog, score });
  }

  scored.sort((a, b) => b.score - a.score || a.dog.rank - b.dog.rank);
  return scored.slice(0, limit).map((item) => item.dog);
}

/** Wire an input + results container into a live search box. */
function attachSearch(input, results, dogs, { onEmpty } = {}) {
  const render = () => {
    const matches = searchDogs(input.value, dogs);
    if (!matches.length) {
      results.innerHTML = input.value.trim().length >= 2
        ? '<p class="p-4 text-sm text-asfa-text/60">No hound matches that name.</p>'
        : '';
      results.classList.toggle('hidden', !input.value.trim());
      if (onEmpty) onEmpty();
      return;
    }
    results.classList.remove('hidden');
    results.innerHTML = matches.map((dog) => `
      <a href="${dogUrl(dog.id)}" class="flex items-baseline gap-3 px-4 py-2.5 hover:bg-asfa-bg2 border-b border-asfa-border last:border-0">
        <span class="font-semibold text-asfa-green">${esc(dog.call_name)}</span>
        <span class="text-sm text-asfa-text/70 truncate flex-1">${esc(dog.registered_name)}</span>
        <span class="text-xs uppercase tracking-wide text-asfa-accent whitespace-nowrap">${esc(dog.breed)} #${dog.rank}</span>
      </a>`).join('');
  };

  input.addEventListener('input', render);
  input.addEventListener('focus', render);
  document.addEventListener('click', (event) => {
    if (!results.contains(event.target) && event.target !== input) {
      results.classList.add('hidden');
    }
  });
}

/* ------------------------------------------------------------------ chrome */

const NAV = [
  ['index.html', 'Home'],
  ['browse.html', 'Browse'],
  ['leaders.html', 'Leaders'],
  ['kennels.html', 'Kennels'],
  ['regions.html', 'Regions'],
  ['lci.html', 'LCI'],
  // The stats pages stay up front; Events sits with the reference material.
  ['events.html', 'Events'],
  ['bowen.html', 'Bowen'],
  ['rulebooks.html', 'Rulebooks'],
  ['about.html', 'About'],
];

function renderChrome(season, current) {
  const links = NAV.map(([href, label]) => {
    const active = href === current;
    return `<a href="${href}" class="px-3 py-2 text-sm font-abel uppercase tracking-widest ${
      active ? 'text-white border-b-2 border-asfa-accent' : 'text-white/75 hover:text-white'
    }">${label}</a>`;
  }).join('');

  const header = document.getElementById('site-header');
  if (header) {
    header.innerHTML = `
      <div class="bg-asfa-accent text-white text-xs md:text-sm px-4 py-1.5 text-center">
        Unofficial fan site — not an ASFA publication.
        <a href="about.html#disclaimer" class="underline hover:text-white/80 whitespace-nowrap">Full disclaimer</a>
      </div>
      <div class="bg-asfa-green">
        <div class="max-w-6xl mx-auto px-4 flex flex-wrap items-center gap-x-6 gap-y-1 py-2">
          <a href="index.html" class="flex items-baseline gap-2">
            <span class="font-abel text-xl md:text-2xl text-white tracking-wide">Lure Coursing Stats</span>
            <span class="font-abel text-sm text-asfa-bg2">ASFA standings · ${season ? season.season : ''}</span>
          </a>
          <nav class="flex flex-wrap -mx-1">${links}</nav>
        </div>
      </div>`;
  }

  const footer = document.getElementById('site-footer');
  if (footer && season) {
    // ASFA's own channels, plus the page where changes to this site are
    // announced. Kept above the disclaimer rather than beside the site's own
    // links, so it reads as "where to find ASFA" and not as this site's own.
    const community = `
        <p class="flex flex-wrap gap-x-5 gap-y-1.5">
          <a href="https://www.facebook.com/AmericanSighthoundFieldAssociation" target="_blank" rel="noopener noreferrer" class="underline hover:text-asfa-bg2">${icon('facebook', 'mr-1.5')}Follow ASFA on Facebook</a>
          <a href="https://www.asfa.org" target="_blank" rel="noopener noreferrer" class="underline hover:text-asfa-bg2">${icon('globe', 'mr-1.5')}asfa.org, the official site</a>
          <a href="https://www.facebook.com/groups/1046065245418921" target="_blank" rel="noopener noreferrer" class="underline hover:text-asfa-bg2">${icon('facebook', 'mr-1.5')}Join the ASFA II group</a>
          <a href="https://www.facebook.com/ASFAlureCoursing" target="_blank" rel="noopener noreferrer" class="underline hover:text-asfa-bg2">${icon('facebook', 'mr-1.5')}ASFA Lure Coursing, where updates to this site are posted</a>
        </p>`;

    footer.innerHTML = `
      <div class="max-w-4xl mx-auto px-4 text-sm text-white/85 space-y-3">${community}
        <p>
          Standings reproduced from the
          <a href="${esc(season.source_url)}" target="_blank" rel="noopener noreferrer" class="underline hover:text-asfa-bg2">ASFA Top 20</a>,
          covering January 1 through ${formatDate(season.as_of)}.
          ASFA's published page is authoritative wherever it disagrees with this one.
        </p>
        <p class="text-xs text-white/65">
          Independent fan project. Not affiliated with, endorsed by, or sponsored by the
          American Sighthound Field Association.
        </p>
        <p class="text-xs text-white/65 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-center">
          <a href="about.html" class="underline hover:text-asfa-bg2">How these numbers are built</a>
          <span aria-hidden="true">·</span>
          <a href="mailto:info@gazehound.io" class="underline hover:text-asfa-bg2">Report an error</a>
          <span aria-hidden="true">·</span>
          <a href="https://github.com/jackrabbit-project/jackrabbit" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 hover:text-asfa-bg2 whitespace-nowrap align-middle"><img src="assets/jackrabbit-icon-40.png" alt="" width="16" height="16" class="h-4 w-auto inline-block" aria-hidden="true">The Jackrabbit Project</a>
        </p>
      </div>`;
  }
}

function showFailure(heading, detail, advice) {
  const main = document.getElementById('main');
  if (!main) return;
  main.innerHTML = `<div class="card">
    <h2 class="card-title">${esc(heading)}</h2>
    <p class="text-sm">${esc(detail)}</p>
    <p class="text-sm mt-2 text-asfa-text/70">${advice}</p></div>`;
}

/** Standard page bootstrap: load data, paint chrome, hand control to the page.

    The two ways this can fail want different advice, so they are caught
    separately. Reporting a script error as "could not load the data" sends
    people looking in entirely the wrong place. */
function page(current, render) {
  loadSeason().then(
    (season) => {
      renderChrome(season, current);
      try {
        render(season);
      } catch (error) {
        console.error(error);
        showFailure(
          'This page could not be drawn',
          `The data loaded, but the page script failed: ${error.message}`,
          'If the site was updated recently your browser may be holding an old copy of a '
          + 'script. Reload with <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> '
          + '(<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> on a Mac).'
        );
      }
    },
    (error) => {
      console.error(error);
      renderChrome(null, current);
      showFailure(
        'Data unavailable',
        `Could not load ${DATA_URL}: ${error.message}`,
        'If you are running this locally, serve the folder over HTTP '
        + '(<code>python -m http.server</code>) rather than opening the file directly.'
      );
    }
  );
}

/** Bootstrap for pages whose content is already in the markup.

    rulebook.html and lci-rules.html need no data at all. Routed through
    page(), a failed season.json fetch would call showFailure() and blank out
    the entire rule text over a file those pages never read. So paint and hand
    over first; the season, if it arrives, only fills in the header sub-line. */
function pageStatic(current, render) {
  renderChrome(null, current);
  try {
    render();
  } catch (error) {
    console.error(error);
    showFailure(
      'This page could not be drawn',
      `The page script failed: ${error.message}`,
      'If the site was updated recently your browser may be holding an old copy of a '
      + 'script. Reload with <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> '
      + '(<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> on a Mac).'
    );
  }
  loadSeason().then(
    (season) => renderChrome(season, current),
    (error) => console.warn(`Season unavailable; header shows no season. ${error.message}`)
  );
}
