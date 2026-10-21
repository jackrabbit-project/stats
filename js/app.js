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

/** The racing feeds, one promise each, same isolation. AOK9's Singles
    records are a feed of their own, read beside the sprint one. */
const RACING_URLS = {
  lgra: 'data/lgra.json', aok9: 'data/aok9.json', 'aok9-singles': 'data/aok9-singles.json',
  notra: 'data/notra.json', wra: 'data/wra.json', 'notra-whippets': 'data/notra-whippets.json',
};
/* The racing programs in the order the site shows them: feed key, the badge
   the search wears, the guide each is reproduced from. racing.js holds the
   full table (ORGS); this short one serves the chrome and the search, which
   every page loads. WRA and NOTRA's Whippets make up the Whippet racing
   section. */
const RACING_PROGRAMS = [
  ['lgra', 'LGRA', 'LGRA grading guide'],
  ['aok9', 'AOK9', 'AOK9 sprint racing grading guide'],
  ['notra', 'NOTRA OB', 'NOTRA Other-Breed grading guide'],
  ['wra', 'WRA', 'WRA grading guide'],
  ['notra-whippets', 'NOTRA Whippets', 'NOTRA Whippet grading guide'],
];
const isRacingSection = (key) => RACING_PROGRAMS.some(([org]) => org === key);
// One breed each: their leaders lead the whippets, not "all breeds".
const WHIPPET_PROGRAMS = new Set(['wra', 'notra-whippets']);
const racingPromises = {};

function loadRacing(org) {
  const url = RACING_URLS[org];
  if (!url) return Promise.reject(new Error(`unknown racing program ${org}`));
  if (!racingPromises[org]) {
    racingPromises[org] = loadJson(url).catch((error) => {
      delete racingPromises[org];
      throw error;
    });
  }
  return racingPromises[org];
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
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
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

/** An owner line as the source prints it, with each owner's name a link
    to its kennel where there is one (href null keeps a name plain). The
    names are wrapped where they stand in the line, so its own separators
    stay; a name the line does not carry as given falls back to the names
    joined by commas. */
function linkOwners(raw, owners) {
  const text = raw || '';
  if (!owners || !owners.some((owner) => owner.href)) return esc(text);
  const link = ({ name, href }) => (href ? `<a href="${esc(href)}" class="lnk">${esc(name)}</a>` : esc(name));
  let html = '';
  let at = 0;
  for (const owner of owners) {
    const index = text.indexOf(owner.name, at);
    if (index < 0) return owners.map(link).join(', ');
    html += esc(text.slice(at, index)) + link(owner);
    at = index + owner.name.length;
  }
  return html + esc(text.slice(at));
}

/** An ASFA hound's owners as the standings print them, each linked to its
    kennel on the Kennels page. */
const asfaKennels = new WeakMap();
function asfaOwners(dog, season) {
  if (!asfaKennels.has(season)) asfaKennels.set(season, new Set((season.owners || []).map((owner) => owner.key)));
  const kennels = asfaKennels.get(season);
  return linkSlashOwners(dog.owner_raw, dog.owners || [],
    (owner) => (kennels.has(owner.entity) ? ownerUrl(owner.entity) : null));
}

/** Owners printed with "/" between them, as ASFA's standings and the
    racing guides print them: every printed name links to the kennel of the
    owner it names, matched by name or else by surname, so a couple or a
    repeated surname the parser folded into one owner ("E.Kominek/S.Kominek",
    "Kominek/Kominek") links in full. */
function linkSlashOwners(raw, owners, hrefOf) {
  const surname = (name) => name.slice(name.lastIndexOf('.') + 1).trim().toLowerCase();
  const parts = (raw || '').split('/').map((part) => part.trim()).filter(Boolean);
  return linkOwners(raw, parts.map((part) => {
    const owner = owners.find((o) => o.name === part)
      || owners.find((o) => o.name.toLowerCase() === part.toLowerCase())
      || owners.find((o) => surname(o.name) === surname(part));
    return { name: part, href: owner ? hrefOf(owner) : null };
  }));
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

/** A racing guide's date as words: "dated September 9, 2026", or with
    word "of", "of September 9, 2026". AOK9 and NOTRA date their sheets only
    by a label beside the link; a sheet re-issued under an unmoved label
    carries the day the site first saw it (guide_date_source "seen") and
    reads "as of October 2, 2026" instead. */
function guideDate(feed, word = 'dated') {
  return `${feed.guide_date_source === 'seen' ? 'as of' : word} ${formatDate(feed.guide_date)}`;
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

  scored.sort((a, b) => b.score - a.score
    || (a.dog.order ?? a.dog.rank ?? 0) - (b.dog.order ?? b.dog.rank ?? 0));
  return scored.slice(0, limit).map((item) => item.dog);
}

/** One result row: the ASFA shape by default; the hub supplies its own. */
function searchRow(dog) {
  return `
      <a href="${dogUrl(dog.id)}" class="flex items-baseline gap-3 px-4 py-2.5 hover:bg-asfa-bg2 border-b border-asfa-border last:border-0">
        <span class="font-semibold text-asfa-green">${esc(dog.call_name)}</span>
        <span class="text-sm text-asfa-text/70 truncate flex-1">${esc(dog.registered_name)}</span>
        <span class="text-xs uppercase tracking-wide text-asfa-accent whitespace-nowrap">${esc(dog.breed)} #${dog.rank}</span>
      </a>`;
}

/** Wire an input + results container into a live search box. */
/* `fallback(query)` may return a promise of further rows: the hub uses it to
   reach the racing registries, so a dog with nothing recorded yet is still
   found by name. Its rows are appended under the main matches, with a note,
   or shown alone when the main list has none. */
function attachSearch(input, results, dogs, {
  onEmpty, row = searchRow, empty = 'No hound matches that name.', fallback = null, fallbackNote = '',
} = {}) {
  let pending = 0;
  const render = () => {
    const query = input.value.trim();
    const matches = searchDogs(input.value, dogs);
    const token = ++pending;
    if (!matches.length) {
      results.innerHTML = query.length >= 2
        ? `<p class="p-4 text-sm text-asfa-text/60">${esc(empty)}${fallback ? ' Searching the full registry…' : ''}</p>`
        : '';
      results.classList.toggle('hidden', !query);
      if (onEmpty) onEmpty();
    } else {
      results.classList.remove('hidden');
      results.innerHTML = matches.map(row).join('');
    }
    if (!fallback || query.length < 2) return;
    fallback(query).then((extra) => {
      if (token !== pending || input.value.trim() !== query) return;
      if (!extra.length) {
        if (!matches.length) results.innerHTML = `<p class="p-4 text-sm text-asfa-text/60">${esc(empty)} Nothing in the full registry either.</p>`;
        return;
      }
      const block = `<p class="px-4 pt-3 pb-1 text-xs text-asfa-text/60${matches.length ? ' border-t border-asfa-border' : ''}">${esc(fallbackNote)}</p>${extra.map(row).join('')}`;
      if (matches.length) results.insertAdjacentHTML('beforeend', block);
      else results.innerHTML = block;
    }).catch(() => {
      if (token === pending && !matches.length) results.innerHTML = `<p class="p-4 text-sm text-asfa-text/60">${esc(empty)}</p>`;
    });
  };

  input.addEventListener('input', render);
  input.addEventListener('focus', render);
  document.addEventListener('click', (event) => {
    if (!results.contains(event.target) && event.target !== input) {
      results.classList.add('hidden');
    }
  });
}

/* ------------------------------------------------------------ site search */

/* One search over every program, in the header of every page: ASFA's ranked
   hounds, LGRA, AOK9 and NOTRA dogs racing lately, AOK9 Singles dogs, and, below
   them, dogs not racing lately from the racing registries. The hub's big
   search box uses the same index. */

function racingDogUrl(org, id) {
  return `racing-dog.html?org=${org}&id=${encodeURIComponent(id)}`;
}

/** Registry rows become objects shaped like feed dogs (minus owners,
    titles and movement, which only the active feed carries). */
function inflateRegistry(registry) {
  const columns = registry.columns;
  return registry.rows.map((row) => Object.fromEntries(columns.map((col, i) => [col, row[i]])));
}

const registryPromises = {};
function loadRegistry(org) {
  if (!registryPromises[org]) {
    registryPromises[org] = loadJson(`data/${org}-registry.json`)
      .then(inflateRegistry)
      .catch((error) => {
        delete registryPromises[org];
        throw error;
      });
  }
  return registryPromises[org];
}

function searchEntry(dog, program, href, meta, order) {
  return {
    id: dog.id, call_name: dog.call_name, registered_name: dog.registered_name,
    breed: dog.breed, program, href, meta, order,
  };
}

/** Every hound racing or ranked lately, as search entries. */
function buildSearchEntries(feeds) {
  const { asfa, singles } = feeds;
  const entries = [];
  if (asfa) {
    for (const dog of asfa.dogs) {
      entries.push(searchEntry(dog, 'ASFA', dogUrl(dog.id), `${dog.breed} #${dog.rank}`, dog.rank));
    }
  }
  for (const [org, name] of RACING_PROGRAMS) {
    const feed = feeds[org];
    if (!feed) continue;
    for (const dog of feed.dogs) {
      entries.push(searchEntry(dog, name, racingDogUrl(org, dog.id),
        dog.rank_breed ? `${dog.breed} #${dog.rank_breed}` : dog.breed, dog.rank_all ?? 100000));
    }
  }
  // CWA's whippets on its current grading guide; each opens its CWA page.
  if (feeds.cwa) entries.push(...cwaSearchEntries(feeds.cwa));
  // AOK9 Singles dogs racing lately that the sprint list does not carry: a
  // dog that races only Singles is found by name and opens its Singles record.
  if (singles) {
    const listed = new Set(entries.map((entry) => `${entry.program}|${entry.id}`));
    for (const dog of singles.dogs) {
      if (!dog.active || listed.has(`AOK9|${dog.id}`)) continue;
      listed.add(`AOK9|${dog.id}`);
      entries.push(searchEntry(dog, 'AOK9', racingDogUrl('aok9', dog.id), `${dog.breed} · Singles`, 100001));
    }
  }
  return entries;
}

/** CWA's whippets on its current grading guide as search entries: the
    racing standings first, then the rest by grade. */
function cwaSearchEntries(cwa) {
  const points = (value) => (Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100));
  const racing = new Map(cwa.standings.racing.rows.map((row) => [row.dog, row]));
  const order = { A: 1, B: 2, C: 3, D: 4, FTE: 5 };
  return cwa.whippets.map((row) => {
    const w = Object.fromEntries(cwa.whippet_columns.map((col, i) => [col, row[i]]));
    const r = racing.get(w.id);
    const meta = r ? `Whippet #${r.place} · ${points(r.points)} NARX pts`
      : w.grade === 'FTE' ? 'Whippet · first time entered' : w.grade ? `Whippet · grade ${w.grade}` : 'Whippet';
    return searchEntry(cwaSearchDog(w), 'CWA', `cwa.html?dog=${encodeURIComponent(w.id)}`, meta,
      r ? r.place : 1000 + (order[w.grade] || 6));
  });
}

/** A CWA whippet in the shape the search matches: the archived guide
    and the lists often give no call name, so the registered name stands in. */
function cwaSearchDog(w) {
  const registered = w.registered_name || w.name || '';
  return { id: w.id, call_name: w.call_name || registered, registered_name: registered, breed: 'Whippet' };
}

/** Dogs not racing lately: AOK9 Singles first, then the racing registries,
    never one already in `entries`. The registries load on the first call,
    so a dog registered with nothing recorded is still found. */
async function searchDormant(query, feeds, entries, program = '') {
  const { singles } = feeds;
  const want = (name) => !program || program === name;
  const listed = new Set(entries.map((entry) => `${entry.program}|${entry.id}`));
  const found = [];
  if (singles && want('AOK9')) {
    const quiet = singles.dogs.filter((dog) => !listed.has(`AOK9|${dog.id}`)).map((dog) =>
      // The Singles sheet lists each dog's three fastest runs, so their year
      // says when it last set one, not when it last raced.
      searchEntry(dog, 'AOK9', racingDogUrl('aok9', dog.id),
        `${dog.breed} · Singles${dog.last_year ? ` · fastest runs to ${dog.last_year}` : ''}`, 1e6));
    found.push(...searchDogs(query, quiet, 20));
  }
  const offered = new Set(found.map((dog) => `${dog.program}|${dog.id}`));
  for (const [org, name] of RACING_PROGRAMS) {
    const feed = feeds[org];
    if (!feed || !want(name)) continue;
    const breeds = new Map(feed.sections.map((s) => [s.slug, s.breed]));
    const rows = await loadRegistry(org);
    const dormant = rows.filter((dog) => !dog.active
      && !listed.has(`${name}|${dog.id}`) && !offered.has(`${name}|${dog.id}`)).map((dog) => {
      const breed = breeds.get(dog.breed_slug) || dog.breed_slug;
      // AOK9's registry keeps a year for undated meets; the others a date.
      // WRA's inactive list carries no meets at all.
      const year = dog.last_year || (dog.last_raced ? dog.last_raced.slice(0, 4) : null);
      return searchEntry({ ...dog, breed }, name, racingDogUrl(org, dog.id),
        `${breed} · ${year ? `last raced ${year}` : org === 'wra' ? 'inactive list' : 'no meets recorded'}`, 1e6);
    });
    found.push(...searchDogs(query, dormant, 20));
  }
  // CWA's archived guide and the whippets found only on its lists.
  if (feeds.cwa && want('CWA')) {
    const rows = await loadRegistry('cwa');
    const quiet = rows.filter((w) => !listed.has(`CWA|${w.id}`)).map((w) =>
      searchEntry(cwaSearchDog(w), 'CWA', `cwa.html?dog=${encodeURIComponent(w.id)}`,
        w.on === 'archive' ? `Whippet · archived guide${w.year_last_run ? `, last ran ${w.year_last_run}` : ''}` : 'Whippet · CWA titles', 1e6));
    found.push(...searchDogs(query, quiet, 20));
  }
  return found.slice(0, 40);
}

/** Before anything is typed: the season's leaders, a few per program. */
function searchLeaders(feeds, program, count) {
  const { asfa } = feeds;
  const want = (name) => !program || program === name;
  const points = (value) => (Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100));
  const groups = [];
  if (asfa && want('ASFA')) {
    const top = groupHounds(asfa.dogs).filter((dog) => dog.percentile != null && dog.is_breed)
      .sort((a, b) => a.percentile - b.percentile || b.points - a.points).slice(0, count);
    if (top.length) {
      groups.push(['ASFA · highest standing in breed', top.map((dog) =>
        searchEntry(dog, 'ASFA', dogUrl(dog.id), `${dog.breed} #${dog.rank} · ${percentileLabel(dog)}`, dog.rank))]);
    }
  }
  for (const [org, name] of RACING_PROGRAMS) {
    const feed = feeds[org];
    if (!feed || !want(name)) continue;
    const top = feed.dogs.filter((dog) => dog.rank_all)
      .sort((a, b) => a.rank_all - b.rank_all || a.call_name.localeCompare(b.call_name)).slice(0, count);
    if (top.length) {
      groups.push([`${name} · leading ${WHIPPET_PROGRAMS.has(org) ? 'the whippets' : 'all breeds'} this year`, top.map((dog) =>
        searchEntry(dog, name, racingDogUrl(org, dog.id), `${dog.breed} · ${points(dog.ytd)} pts`, dog.rank_all))]);
    }
  }
  if (feeds.cwa && want('CWA')) {
    const top = feeds.cwa.standings.racing.rows.slice(0, count);
    if (top.length) {
      groups.push(['CWA · leading the racing standings', top.map((row) =>
        searchEntry({ id: row.dog, call_name: row.call_name, registered_name: row.registered_name, breed: 'Whippet' },
          'CWA', `cwa.html?dog=${encodeURIComponent(row.dog)}`, `Whippet · ${points(row.points)} NARX pts`, row.place))]);
    }
  }
  return groups;
}

/** The feeds behind the header search, fetched the first time it opens. A
    page's own feed is already in hand, so only the others are fetched. */
function loadSearchFeeds() {
  if (!loadSearchFeeds.promise) {
    loadSearchFeeds.promise = Promise.allSettled([
      loadSeason(), loadRacing('lgra'), loadRacing('aok9'), loadRacing('aok9-singles'), loadRacing('notra'),
      loadRacing('wra'), loadRacing('notra-whippets'), loadCwa(),
    ]).then((results) => {
      const [asfa, lgra, aok9, singles, notra, wra, notraWhippets, cwa] = results.map((result) =>
        (result.status === 'fulfilled' ? result.value : null));
      const feeds = { asfa, lgra, aok9, singles, notra, wra, 'notra-whippets': notraWhippets, cwa };
      return { feeds, entries: buildSearchEntries(feeds) };
    });
  }
  return loadSearchFeeds.promise;
}

const SEARCH_PROGRAMS = [['', 'All'], ['ASFA', 'ASFA'], ...RACING_PROGRAMS.map(([, name]) => [name, name]), ['CWA', 'CWA']];

/** CWA's lists, fetched once per page. */
function loadCwa() {
  if (!loadCwa.promise) {
    loadCwa.promise = loadJson('data/cwa.json').catch((error) => {
      loadCwa.promise = null;
      throw error;
    });
  }
  return loadCwa.promise;
}
let siteSearch = null;

/* The panel is built on first open and kept: it floats over the page near
   the top, the way a command palette does, with the page dimmed behind it. */
function buildSiteSearch() {
  const overlay = document.createElement('div');
  overlay.id = 'site-search';
  overlay.className = 'search-overlay hidden';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Search hounds');
  overlay.innerHTML = `
    <div class="search-panel">
      <div class="search-field">
        ${icon('search')}
        <input id="site-search-input" type="search" autocomplete="off" spellcheck="false" enterkeyhint="go"
               placeholder="Search hounds by name" aria-label="Search hounds by call name or registered name"
               role="combobox" aria-expanded="true" aria-controls="site-search-list" aria-autocomplete="list">
        <button type="button" class="search-close" data-close><span class="kbd" aria-hidden="true">Esc</span><span class="sr-only">Close search</span></button>
      </div>
      <div class="search-tabs" role="tablist" aria-label="Program">
        ${SEARCH_PROGRAMS.map(([value, label], index) => `<button type="button" role="tab" class="tab${index ? '' : ' tab-active'}"
          aria-selected="${index ? 'false' : 'true'}" data-program="${value}">${label}</button>`).join('')}
      </div>
      <div id="site-search-list" class="search-list" role="listbox" aria-label="Hounds"></div>
      <div class="search-foot" aria-hidden="true">
        <span><span class="kbd">↑</span> <span class="kbd">↓</span> move</span>
        <span><span class="kbd">Enter</span> open</span>
        <span><span class="kbd">Esc</span> close</span>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const input = overlay.querySelector('#site-search-input');
  const list = overlay.querySelector('#site-search-list');
  const state = { overlay, input, list, program: '', data: null, active: -1, token: 0, returnTo: null };

  const option = (dog) => `
    <a role="option" aria-selected="false" href="${dog.href}" class="search-option">
      <span class="flex items-center gap-2 min-w-0">
        <span class="font-semibold text-asfa-green truncate">${esc(dog.call_name)}</span>
        <span class="badge badge-flat shrink-0">${dog.program}</span>
      </span>
      <span class="block text-xs text-asfa-text/65 truncate mt-0.5"><span class="font-mono uppercase tracking-wide text-asfa-accent">${esc(dog.meta)}</span> · ${esc(dog.registered_name)}</span>
    </a>`;
  const note = (text) => `<p class="search-note">${text}</p>`;

  function options() {
    return [...list.querySelectorAll('.search-option')];
  }

  function highlight(index) {
    const all = options();
    state.active = all.length ? Math.max(0, Math.min(index, all.length - 1)) : -1;
    all.forEach((el, i) => {
      el.id = `site-search-option-${i}`;
      el.setAttribute('aria-selected', i === state.active ? 'true' : 'false');
    });
    if (state.active >= 0) {
      input.setAttribute('aria-activedescendant', all[state.active].id);
      all[state.active].scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function render() {
    const query = input.value.trim();
    state.token += 1;
    const token = state.token;
    const data = state.data;
    if (!data) { list.innerHTML = note('Loading hounds…'); highlight(-1); return; }
    const program = state.program;
    const where = program ? ` in ${program}` : '';

    if (query.length < 2) {
      const groups = searchLeaders(data.feeds, program, program ? 6 : 2);
      list.innerHTML = groups.length
        ? groups.map(([label, dogs]) => `<p class="search-group">${esc(label)}</p>${dogs.map(option).join('')}`).join('')
          + note('Type a call name or registered name. ASFA lists each breed\'s Top 20; LGRA, AOK9 and NOTRA list every dog.')
        : note('The standings could not be loaded just now.');
      highlight(-1);
      return;
    }

    const pool = program ? data.entries.filter((entry) => entry.program === program) : data.entries;
    const matches = searchDogs(query, pool, 30);
    list.innerHTML = matches.length
      ? matches.map(option).join('')
      : note(`Nothing racing or ranked lately matches “${esc(query)}”${where}. Looking further back…`);
    highlight(matches.length ? 0 : -1);

    searchDormant(query, data.feeds, data.entries, program).then((extra) => {
      if (token !== state.token) return;
      if (!extra.length) {
        if (!matches.length) {
          list.innerHTML = note(`No hound matches “${esc(query)}”${where}.${
            !program || program === 'ASFA' ? " ASFA lists only each breed's Top 20." : ''}`);
        }
        return;
      }
      if (!matches.length) list.innerHTML = '';
      list.insertAdjacentHTML('beforeend',
        `<p class="search-group">Not racing lately</p>${extra.map(option).join('')}`);
      highlight(state.active >= 0 ? state.active : 0);
    }).catch((error) => console.warn(error));
  }
  state.render = render;

  input.addEventListener('input', render);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); highlight(state.active + 1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); highlight(state.active - 1); }
    else if (event.key === 'Enter') {
      const chosen = options()[state.active >= 0 ? state.active : 0];
      if (chosen) { event.preventDefault(); window.location.assign(chosen.href); }
    }
  });
  list.addEventListener('mousemove', (event) => {
    const hovered = event.target.closest('.search-option');
    const index = hovered ? options().indexOf(hovered) : -1;
    if (index >= 0 && index !== state.active) highlight(index);
  });
  overlay.querySelectorAll('[data-program]').forEach((tab) => {
    tab.addEventListener('click', () => {
      state.program = tab.dataset.program;
      overlay.querySelectorAll('[data-program]').forEach((other) => {
        const on = other === tab;
        other.classList.toggle('tab-active', on);
        other.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      render();
      input.focus();
    });
  });
  overlay.querySelector('[data-close]').addEventListener('click', closeSiteSearch);
  // A click on the dimmed page, outside the panel, closes it.
  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) closeSiteSearch();
  });
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); closeSiteSearch(); return; }
    if (event.key !== 'Tab') return;
    // Keep keyboard focus inside the panel while it is open.
    const focusable = [...overlay.querySelectorAll('input, button, a[href]')]
      .filter((el) => el.offsetParent !== null);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  return state;
}

function openSiteSearch(returnTo) {
  if (!siteSearch) siteSearch = buildSiteSearch();
  if (!siteSearch.overlay.classList.contains('hidden')) return;
  siteSearch.returnTo = returnTo || document.activeElement;
  siteSearch.overlay.classList.remove('hidden');
  document.documentElement.style.overflow = 'hidden';
  siteSearch.input.focus();
  siteSearch.input.select();
  siteSearch.render();
  if (!siteSearch.data) {
    loadSearchFeeds().then((data) => {
      siteSearch.data = data;
      siteSearch.render();
    });
  }
}

function closeSiteSearch() {
  if (!siteSearch || siteSearch.overlay.classList.contains('hidden')) return;
  siteSearch.overlay.classList.add('hidden');
  document.documentElement.style.overflow = '';
  const back = siteSearch.returnTo;
  if (back && document.contains(back) && typeof back.focus === 'function') back.focus();
}

/** The header's search box opens the panel; so do "/" and Ctrl+K (Cmd+K on
    a Mac) from anywhere on the page that is not already a text field. */
function initSiteSearch(trigger) {
  if (trigger) trigger.addEventListener('click', () => openSiteSearch(trigger));
  if (initSiteSearch.keysBound) return;
  initSiteSearch.keysBound = true;
  document.addEventListener('keydown', (event) => {
    if (siteSearch && !siteSearch.overlay.classList.contains('hidden')) return;
    const target = event.target;
    const typing = target instanceof HTMLElement
      && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    const commandK = (event.key === 'k' || event.key === 'K') && (event.ctrlKey || event.metaKey) && !event.altKey;
    const slash = event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (commandK || slash) {
      event.preventDefault();
      openSiteSearch(document.getElementById('site-search-open'));
    }
  });
}

/* ------------------------------------------------------------------ chrome */

const NAV_ASFA = [
  ['asfa.html', 'Overview'],
  ['browse.html', 'Standings'],
  ['leaders.html', 'Leaders'],
  ['kennels.html', 'Kennels'],
  ['regions.html', 'Regions'],
  ['trials.html', 'Trials'],
  ['lci.html', 'LCI'],
  // The stats pages stay up front; Events sits with the reference material.
  ['events.html', 'Events'],
  ['bowen.html', 'Bowen'],
  ['rulebooks.html', 'Rulebooks'],
  ['about.html', 'About'],
];
const NAV_LGRA = [
  ['lgra.html', 'Overview'],
  ['lgra.html#standings', 'Standings'],
  ['lgra.html#browse', 'Browse'],
  ['lgra.html#kennels', 'Kennels'],
  ['lgra.html#about', 'About'],
];
const NAV_AOK9 = [
  ['aok9.html', 'Overview'],
  ['aok9.html#standings', 'Standings'],
  ['aok9.html#browse', 'Browse'],
  ['aok9.html#kennels', 'Kennels'],
  ['aok9.html#singles', 'Singles'],
  ['aok9.html#about', 'About'],
];
const NAV_NOTRA = [
  ['notra.html', 'Overview'],
  ['notra.html#standings', 'Standings'],
  ['notra.html#browse', 'Browse'],
  ['notra.html#kennels', 'Kennels'],
  ['notra.html#about', 'About'],
];
/* Whippet racing gathers several bodies' records in one section: its nav
   names the bodies, and each body's page carries its own tabs (overview,
   standings, browse, kennels, about) inside the page. */
const NAV_WHIPPETS = [
  ['wra.html', 'WRA'],
  ['notra-whippets.html', 'NOTRA Whippets'],
  ['cwa.html', 'CWA'],
];
const NAV_HUB = [
  ['index.html', 'Home'],
  ['asfa.html', 'ASFA coursing'],
  ['lgra.html', 'LGRA racing'],
  ['aok9.html', 'AOK9 racing'],
  ['notra.html', 'NOTRA OB racing'],
  ['wra.html', 'Whippet racing'],
  ['akc.html', 'AKC stats'],
];

/* The site is four programs under one roof, plus the AKC entries page. Each has its own home, nav
   and footer source line; the wordmark always leads back to the hub, and
   the footer's disclaimer link goes to the section's own account. */
const seasonOf = (feed) => (feed && feed.season) || new Date().getFullYear();

/* The tagline (program and season) takes the program's colour, the same one
   its hub card wears: rust for ASFA, slate for LGRA, moss for AOK9, amber
   for NOTRA. */
const SECTIONS = {
  hub: {
    home: 'index.html', nav: NAV_HUB,
    program: 'Lure coursing and racing',
    color: 'text-asfa-text', line: 'border-asfa-text',
    disclaimer: 'about.html#disclaimer',
  },
  asfa: {
    home: 'asfa.html', nav: NAV_ASFA,
    program: 'ASFA lure coursing',
    color: 'text-asfa-accent', line: 'border-asfa-accent',
    disclaimer: 'about.html#disclaimer',
  },
  lgra: {
    home: 'lgra.html', nav: NAV_LGRA,
    program: 'LGRA straight racing',
    color: 'text-asfa-slate', line: 'border-asfa-slate',
    disclaimer: 'lgra.html#about',
  },
  aok9: {
    home: 'aok9.html', nav: NAV_AOK9,
    program: 'AOK9 sprint racing',
    color: 'text-asfa-green', line: 'border-asfa-green',
    disclaimer: 'aok9.html#about',
  },
  notra: {
    home: 'notra.html', nav: NAV_NOTRA,
    program: 'NOTRA OB racing',
    color: 'text-asfa-amber', line: 'border-asfa-amber',
    disclaimer: 'notra.html#about',
  },
  // Whippet racing, in beta: one entry in the program menu (WRA's page is
  // its home), one plum colour, the bodies as tabs. Each body keeps its own
  // section key so its pages load its own feed and footer source line.
  wra: {
    home: 'wra.html', nav: NAV_WHIPPETS,
    program: 'Whippet racing', beta: true, group: 'whippets',
    color: 'text-asfa-whippet', line: 'border-asfa-whippet',
    disclaimer: 'wra.html#about',
  },
  'notra-whippets': {
    home: 'notra-whippets.html', nav: NAV_WHIPPETS,
    program: 'Whippet racing', beta: true, group: 'whippets',
    color: 'text-asfa-whippet', line: 'border-asfa-whippet',
    disclaimer: 'notra-whippets.html#about',
    menu: false,
  },
  // CWA: its grading guides, standings and title lists, on one page of its
  // own (cwa.html) in the same section.
  cwa: {
    home: 'cwa.html', nav: NAV_WHIPPETS,
    program: 'Whippet racing', beta: true, group: 'whippets',
    color: 'text-asfa-whippet', line: 'border-asfa-whippet',
    disclaimer: 'cwa.html#disclaimer', about: 'cwa.html#about',
    menu: false,
  },
  // AKC lure coursing entries: one page of event-level counts, not a
  // program. It wears the hub's nav and AKC's own blue, sits outside the
  // program menu, and is reached from the ASFA Regions page.
  akc: {
    home: 'akc.html', nav: NAV_HUB,
    program: 'AKC lure coursing',
    color: 'text-asfa-akc', line: 'border-asfa-akc',
    disclaimer: 'akc.html#about', about: 'akc.html#about',
    menu: false,
  },
};
const PAGE_SECTIONS = {
  'index.html': 'hub', 'lgra.html': 'lgra', 'aok9.html': 'aok9', 'notra.html': 'notra', 'akc.html': 'akc',
  'wra.html': 'wra', 'notra-whippets.html': 'notra-whippets', 'cwa.html': 'cwa',
};

function sectionOf(current) {
  if (current === 'racing-dog.html') {
    const org = param('org');
    return isRacingSection(org) ? org : 'hub';
  }
  return PAGE_SECTIONS[current] || 'asfa';
}


/* The Jackrabbit mark: running rabbit in a broken circle, one path (the body
   path of the mark; the ear and paw details are drawn only in the two-colour
   icon files under assets/). Drawn once here and used in the header lockup
   and the footer credit. In the header it takes the section's colour, like
   the programme line beside it: rust for ASFA, slate for LGRA, moss for AOK9,
   amber for NOTRA, plain ink on the hub. */
const JACKRABBIT_PATH = 'M252.12 467.83C212.79 466.27 174.08 452.83 144.12 430.31C135.87 424.11 127.74 416.69 125.63 413.43C124.53 411.72 125.57 412.21 134.89 417.76C174.01 441.06 208.38 451.48 248.38 452.17C329.10 453.55 402.31 408.94 439.42 335.75C443.78 327.15 446.62 320.69 451.49 308.25C455.76 297.32 456.26 296.86 455.49 304.54C453.96 319.88 447.44 340.64 438.62 358.26C403.86 427.67 330.23 470.93 252.12 467.83ZM217.25 402.27C213.76 401.20 211.55 398.61 210.52 394.38C208.81 387.29 206.32 384.63 201.14 384.32C198.70 384.17 194.16 384.55 190.88 385.17C186.47 386.00 170.18 385.95 165.88 385.09C164.78 384.87 163.20 384.61 162.38 384.51C160.95 384.33 159.70 383.99 156.88 383.00C154.96 382.33 151.49 380.99 151.03 380.75C150.81 380.63 149.44 379.95 148.00 379.25C140.68 375.67 136.02 372.23 128.60 364.95L125.07 361.48L123.97 361.65C123.37 361.75 122.59 361.93 122.25 362.06C119.29 363.16 110.47 363.51 106.33 362.68C95.76 360.56 86.89 353.48 82.61 343.75C82.10 342.58 80.87 340.39 79.88 338.88C75.81 332.64 74.83 328.99 75.86 324.05C77.17 317.83 83.81 313.98 90.34 315.64C93.73 316.51 101.70 320.18 103.17 321.55C104.06 322.38 104.46 322.01 104.22 320.59C103.28 314.96 103.00 305.79 103.63 301.12C103.83 299.61 104.00 297.59 104.01 296.62C104.01 295.42 104.17 294.56 104.50 293.88C104.79 293.28 104.99 292.33 104.99 291.53C105.00 290.79 105.22 289.33 105.48 288.28C105.75 287.23 106.21 285.31 106.50 284.00C106.79 282.69 107.20 281.23 107.40 280.75C107.59 280.27 107.91 279.31 108.11 278.62C108.61 276.83 109.46 274.48 109.72 274.15C109.84 274.00 110.03 273.48 110.13 273.01C110.23 272.53 110.41 271.97 110.52 271.76C110.64 271.55 111.09 270.53 111.52 269.50C112.41 267.40 114.14 263.83 115.29 261.75C117.23 258.23 119.44 254.54 120.22 253.51C120.70 252.89 121.38 251.91 121.75 251.33C122.13 250.74 122.79 249.84 123.23 249.32C123.68 248.80 124.57 247.68 125.21 246.83C130.68 239.57 137.73 232.63 146.12 226.23C148.95 224.09 154.84 220.00 155.11 220.00C155.18 220.00 156.45 219.23 157.93 218.28C164.06 214.38 175.71 209.17 183.88 206.69C184.56 206.48 185.97 206.06 187.00 205.75C188.03 205.44 189.38 205.03 190.00 204.83C190.62 204.62 191.99 204.31 193.05 204.12C194.11 203.93 195.20 203.66 195.47 203.52C195.74 203.37 197.02 203.14 198.30 203.00C199.58 202.87 201.02 202.65 201.50 202.52C205.45 201.44 220.62 200.71 227.76 201.26C236.28 201.90 240.51 202.31 242.08 202.64C243.02 202.84 244.12 203.00 244.52 203.00C244.93 203.00 245.90 203.22 246.69 203.50C247.47 203.77 248.51 204.00 248.99 204.00C249.48 204.00 250.66 204.22 251.63 204.50C252.59 204.78 253.71 205.00 254.12 205.01C254.54 205.01 255.32 205.23 255.88 205.50C256.43 205.77 257.24 205.99 257.68 205.99C258.12 206.00 258.96 206.16 259.55 206.36C260.14 206.56 261.30 206.89 262.12 207.09C264.30 207.63 269.25 209.14 270.26 209.58C270.73 209.78 272.14 210.25 273.38 210.62C274.61 210.99 275.85 211.41 276.12 211.56C276.39 211.71 277.12 211.97 277.74 212.14C278.37 212.32 279.49 212.70 280.25 213.01C281.01 213.31 282.07 213.71 282.62 213.91C283.18 214.10 283.85 214.37 284.12 214.50C284.64 214.74 285.97 215.20 289.88 216.50C291.11 216.92 292.33 217.37 292.57 217.51C294.00 218.33 299.01 219.66 304.30 220.63C308.77 221.46 314.82 220.17 318.39 217.63C323.22 214.20 325.76 210.53 327.35 204.70C328.14 201.80 328.15 201.43 327.46 199.44C326.18 195.70 320.77 191.22 314.88 189.00C314.05 188.69 312.31 187.99 311.00 187.44C309.69 186.90 307.95 186.17 307.12 185.83C306.30 185.49 305.27 185.05 304.84 184.85C304.40 184.66 303.90 184.50 303.71 184.50C303.52 184.50 302.95 184.27 302.43 184.00C301.92 183.72 301.38 183.50 301.22 183.50C301.07 183.50 299.86 182.99 298.53 182.36C297.21 181.73 295.79 181.06 295.38 180.87C285.62 176.40 279.16 172.29 271.25 165.51C265.23 160.34 258.58 152.58 253.99 145.36C252.85 143.58 251.71 141.80 251.44 141.41C249.27 138.26 246.74 132.92 244.98 127.75C243.92 124.67 243.91 124.58 243.89 121.11C243.88 117.24 243.92 117.10 245.65 115.37C247.54 113.47 248.79 113.13 253.88 113.13C258.58 113.13 259.08 113.20 264.88 114.68C268.21 115.53 272.09 116.83 275.88 118.37C278.80 119.55 281.23 120.67 287.50 123.70C290.44 125.12 294.08 127.10 294.75 127.63C294.96 127.80 295.74 128.27 296.50 128.68C298.10 129.54 300.67 131.21 303.04 132.92C303.96 133.58 305.65 134.80 306.79 135.62C315.32 141.73 327.77 154.16 338.85 167.62C344.24 174.17 345.56 175.85 346.95 177.92C348.40 180.09 349.00 180.79 349.00 180.33C349.00 179.97 347.51 176.46 346.75 175.02C346.35 174.25 345.58 172.72 345.04 171.62C342.65 166.69 340.11 162.23 336.70 156.97C326.78 141.65 312.42 129.04 294.27 119.69C292.68 118.87 291.09 118.04 290.75 117.85C290.41 117.67 288.94 116.96 287.50 116.29C284.52 114.90 282.74 113.29 281.76 111.11C280.66 108.64 279.08 104.58 278.51 102.75C278.19 101.72 277.78 100.42 277.60 99.88C276.20 95.69 276.53 90.32 278.33 87.95C282.37 82.66 294.39 85.54 308.12 95.10C313.14 98.59 322.24 106.46 324.40 109.18C324.92 109.84 326.26 111.33 327.38 112.50C329.38 114.59 333.55 119.68 335.27 122.12C337.50 125.28 342.69 134.15 344.43 137.75C347.21 143.54 350.50 150.99 350.50 151.51C350.50 151.67 350.66 152.10 350.86 152.46C351.31 153.28 352.16 155.35 353.38 158.62C353.90 160.00 354.71 162.03 355.18 163.12C355.66 164.22 356.44 166.14 356.92 167.38C357.40 168.61 357.89 169.74 357.99 169.88C358.10 170.01 358.27 170.41 358.37 170.75C358.76 172.08 361.69 176.65 363.03 178.01C365.22 180.24 368.15 181.66 371.75 182.23C372.64 182.38 373.77 182.61 374.25 182.75C374.73 182.89 375.61 183.00 376.21 183.00C376.80 183.00 378.55 183.21 380.08 183.48C381.62 183.74 383.49 184.03 384.23 184.12C384.98 184.21 385.80 184.39 386.05 184.53C386.31 184.67 387.16 184.88 387.93 185.01C388.70 185.13 389.91 185.46 390.61 185.73C391.30 185.99 392.80 186.50 393.94 186.86C402.62 189.58 410.65 196.15 416.55 205.38C417.17 206.35 418.62 208.68 419.77 210.58C420.93 212.47 422.17 214.50 422.52 215.08C423.32 216.38 429.20 224.47 431.10 226.88C434.51 231.20 436.15 234.14 436.51 236.61C437.11 240.72 435.56 244.69 430.95 250.82C426.11 257.25 421.89 261.12 417.88 262.81C414.66 264.17 413.76 264.50 413.26 264.50C412.97 264.50 411.87 264.72 410.81 264.98C409.56 265.29 407.10 265.56 403.88 265.73C393.89 266.28 392.38 266.49 387.90 267.92C381.11 270.08 375.35 276.06 371.50 284.96C370.54 287.17 365.37 297.62 363.86 300.38C363.27 301.48 362.60 302.71 362.40 303.12C359.68 308.51 351.02 319.50 344.47 325.88C340.95 329.30 333.55 335.43 331.18 336.89C330.52 337.29 329.51 337.97 328.93 338.39C325.61 340.79 318.56 344.46 316.93 344.64C315.56 344.79 307.02 344.39 304.25 344.04C303.21 343.91 301.63 343.96 299.88 344.16C298.36 344.34 296.31 344.49 295.31 344.49C294.31 344.50 292.45 344.71 291.18 344.98C289.91 345.24 287.98 345.59 286.88 345.75C284.86 346.06 281.38 346.72 278.62 347.33C277.80 347.52 276.76 347.85 276.32 348.08C275.88 348.31 275.32 348.50 275.07 348.50C274.83 348.50 273.78 348.73 272.75 349.01C269.01 350.04 267.36 350.52 266.62 350.80C266.21 350.95 265.35 351.12 264.71 351.19C262.98 351.35 262.96 351.26 262.88 343.90C262.83 339.02 262.73 337.29 262.41 336.13C262.18 335.32 262.00 334.02 262.00 333.25C262.00 332.48 261.77 331.22 261.50 330.44C261.23 329.65 261.00 328.64 261.00 328.19C261.01 327.74 260.79 326.64 260.52 325.75C260.25 324.86 259.68 322.94 259.24 321.50C258.81 320.06 258.31 318.31 258.13 317.62C257.83 316.46 257.46 315.57 255.82 312.00C252.54 304.84 249.31 299.87 244.41 294.44C237.74 287.06 231.25 282.65 222.88 279.79C221.64 279.37 219.84 278.74 218.88 278.39C214.25 276.70 203.69 276.00 196.49 276.89C192.86 277.34 192.38 277.59 194.41 278.00C195.22 278.16 196.32 278.39 196.88 278.50C197.43 278.62 198.55 278.79 199.38 278.88C201.29 279.08 206.36 280.16 207.50 280.60C207.98 280.79 208.82 281.05 209.38 281.19C211.46 281.72 214.47 282.87 217.14 284.16C218.39 284.76 219.48 285.25 219.57 285.25C219.65 285.25 220.43 285.66 221.30 286.15C223.98 287.69 224.11 287.79 230.70 292.83C233.37 294.87 237.77 299.92 240.78 304.40C242.64 307.17 246.27 314.56 247.36 317.81C248.59 321.48 249.50 324.65 249.50 325.30C249.50 325.60 249.71 326.52 249.98 327.36C251.83 333.28 251.88 350.97 250.07 358.12C249.86 358.95 249.60 360.19 249.49 360.88C249.39 361.56 249.05 362.97 248.75 364.00C247.63 367.81 247.73 368.01 250.22 367.08C251.13 366.74 252.38 366.32 253.01 366.14C253.63 365.97 254.36 365.70 254.63 365.54C254.90 365.39 256.02 364.97 257.12 364.61C258.23 364.25 259.58 363.74 260.14 363.48C260.70 363.21 261.38 363.00 261.64 363.00C261.91 363.00 263.22 362.55 264.56 362.00C265.90 361.45 267.24 361.00 267.53 361.00C267.81 361.00 268.40 360.84 268.84 360.64C270.20 360.01 271.82 359.46 273.40 359.11C274.23 358.92 275.24 358.59 275.65 358.38C276.05 358.17 276.69 358.00 277.07 358.00C277.46 358.00 278.08 357.84 278.45 357.65C279.06 357.34 281.44 356.73 286.50 355.61C287.39 355.41 289.08 355.13 290.25 354.99C291.42 354.85 292.71 354.62 293.12 354.48C294.33 354.07 300.55 353.76 304.88 353.90C308.87 354.03 310.28 354.27 314.50 355.52C315.39 355.79 316.22 356.01 316.34 356.00C317.04 355.99 322.97 358.97 324.95 360.32C337.41 368.89 333.53 377.59 316.33 379.63C314.71 379.83 311.07 379.99 308.25 379.99C302.51 379.99 297.78 380.31 292.70 381.02C290.81 381.28 288.61 381.50 287.81 381.50C287.01 381.50 285.74 381.66 284.99 381.86C284.24 382.05 282.89 382.28 282.00 382.38C281.11 382.47 279.59 382.75 278.62 383.00C275.38 383.86 273.63 384.24 272.25 384.40C271.49 384.49 270.37 384.76 269.75 385.01C269.13 385.26 268.22 385.53 267.73 385.61C267.24 385.69 266.00 386.04 264.98 386.40C263.96 386.75 262.56 387.20 261.88 387.39C261.19 387.59 260.40 387.85 260.12 387.97C259.85 388.09 258.61 388.50 257.38 388.87C256.14 389.24 254.79 389.70 254.38 389.88C252.98 390.50 250.63 391.45 249.25 391.97C245.94 393.20 244.52 393.79 242.88 394.61C241.91 395.10 241.04 395.49 240.95 395.50C240.85 395.50 239.95 395.88 238.95 396.35C237.94 396.82 236.39 397.51 235.50 397.89C234.61 398.27 233.31 398.83 232.62 399.13C231.94 399.44 230.96 399.87 230.46 400.10C229.96 400.32 229.38 400.50 229.16 400.50C228.95 400.50 228.71 400.61 228.63 400.74C228.55 400.88 227.95 401.15 227.30 401.36C226.65 401.56 225.68 401.89 225.12 402.10C224.05 402.51 218.42 402.62 217.25 402.27ZM55.19 293.11C53.91 290.58 51.87 282.50 50.65 275.12C44.85 240.09 49.86 201.70 64.69 167.55C105.92 72.60 212.22 23.51 310.81 53.90C336.77 61.90 364.68 77.64 378.94 92.32C382.53 96.01 382.11 95.89 371.75 90.14C359.63 83.42 353.11 80.17 343.88 76.26C287.72 52.48 225.35 53.78 171.62 79.85C108.02 110.71 65.10 171.80 56.89 243.12C55.60 254.36 55.16 270.31 55.74 285.17C56.06 293.26 55.96 294.63 55.19 293.11Z';

function jackrabbitMark(cls, size) {
  return `<svg class="${cls}" width="${size}" height="${Math.round(size * 424 / 408)}" viewBox="48 44 408 424" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="${JACKRABBIT_PATH}"/></svg>`;
}

/* ----------------------------------------------------------------- countup */

/* The hub's headline figures roll up to their value as they scroll into
   view: from halfway, over a second and a half, easing out, so the motion
   reads as a settle rather than a spin. Only the hub does this; every other
   page prints its figures as they are. Reduced-motion users get the final
   value at once. */
function countUp(el, to, { from = 0.5, duration = 1.5, separator = false } = {}) {
  const fmt = (n) => {
    const rounded = Math.round(n);
    return separator ? rounded.toLocaleString('en-US') : String(rounded);
  };
  if (!('IntersectionObserver' in window)
      || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = fmt(to);
    return;
  }
  const start = to * from;
  el.textContent = fmt(start);
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    observer.disconnect();
    const began = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - began) / (duration * 1000));
      el.textContent = fmt(start + (to - start) * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  observer.observe(el);
}

/** Roll up every figure tile in a container, each once. */
function animateTiles(container) {
  if (!container) return;
  container.querySelectorAll('.tile').forEach((tile) => {
    const valueEl = tile.querySelector('.tile-value');
    if (!valueEl || valueEl.dataset.counted) return;
    const raw = valueEl.textContent.trim();
    const target = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(target) || raw === '') return;
    valueEl.dataset.counted = '1';
    countUp(valueEl, target, { separator: raw.includes(',') });
  });
}

/** Sortable table head: the titles.html pattern, once. A column without a
    key is a plain heading; `columns` rows are [key, label, class, natural
    direction]. */
function sortableHead(columns, sort, extra = '') {
  return `<thead><tr>${columns.map(([key, label, cls]) => (key ?
    `<th scope="col" class="sortable ${cls}" aria-sort="${
      sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}">
      <button type="button" class="th-btn" data-key="${key}">${label}${
        sort.key === key ? icon(sort.dir === 1 ? 'chevronUp' : 'chevronDown') : ''}</button></th>`
    : `<th scope="col" class="${cls}">${label}</th>`)).join('')}${extra}</tr></thead>`;
}

function wireSort(container, columns, sort, repaint) {
  container.querySelectorAll('button[data-key]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = button.dataset.key;
      const natural = (columns.find(([key]) => key === next) || [])[3] || 1;
      if (sort.key === next) sort.dir = -sort.dir;
      else { sort.key = next; sort.dir = natural; }
      repaint();
    });
  });
}

/* ------------------------------------------------------------------- theme */

/* Three states: follow the device (the default, no attribute), dark, light.
   js/theme.js re-applies the saved override before first paint on every page;
   this button cycles the states and keeps the browser-chrome color in step.
   The icon names the state you are IN, the label the switch a click makes. */
const THEME_STATES = {
  auto: { glyph: 'monitor', label: 'Theme follows your device. Switch to dark.' },
  dark: { glyph: 'moon', label: 'Dark theme. Switch to light.' },
  light: { glyph: 'sun', label: 'Light theme. Follow the device again.' },
};

function themeApply(state) {
  const root = document.documentElement;
  if (state === 'dark' || state === 'light') {
    root.dataset.theme = state;
    try { localStorage.setItem('theme', state); } catch (e) { /* private mode */ }
  } else {
    delete root.dataset.theme;
    try { localStorage.removeItem('theme'); } catch (e) { /* private mode */ }
  }
  // Keep the browser chrome (mobile address bar) on the effective color: an
  // override pins both theme-color metas, auto restores their media split.
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    const forDark = (meta.getAttribute('media') || '').includes('dark');
    const dark = state === 'dark'
      || (state !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    meta.setAttribute('content',
      (state === 'dark' || state === 'light' ? dark : forDark) ? '#1B1917' : '#F7F5EF');
  });
}

function initThemeToggle(button) {
  if (!button) return;
  const state = () => document.documentElement.dataset.theme || 'auto';
  const paint = () => {
    const { glyph, label } = THEME_STATES[state()];
    button.innerHTML = icon(glyph);
    button.setAttribute('aria-label', label);
    button.title = label;
  };
  button.addEventListener('click', () => {
    const order = ['auto', 'dark', 'light'];
    themeApply(order[(order.indexOf(state()) + 1) % order.length]);
    paint();
  });
  themeApply(state()); // sync the theme-color metas with any saved override
  paint();
}

/** Is this nav entry the page being shown? Entries may carry a hash
    (lgra.html#browse); the plain entry is active only while no hashed
    sibling is. */
function navActive(href, current, nav) {
  const [path, hash] = href.split('#');
  if (path !== current) return false;
  if (hash) return location.hash === `#${hash}`;
  return !nav.some(([other]) => {
    const otherHash = other.split('#')[1];
    return otherHash && location.hash === `#${otherHash}`;
  });
}

/* The active tab's underline takes the section's colour (rust ASFA, slate
   LGRA, moss AOK9, amber NOTRA), the same code as the subtitle and the hub
   cards. */
function paintNav(navEl, current, nav, line = 'border-asfa-accent') {
  navEl.querySelectorAll('a[href]').forEach((link) => {
    const active = navActive(link.getAttribute('href'), current, nav);
    link.className = `pill-hover shrink-0 px-2.5 py-2.5 font-mono text-xs uppercase tracking-[0.1em] border-b-2 ${
      active ? `text-asfa-text ${line}` : 'text-asfa-muted border-transparent hover:text-asfa-text'}`;
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

/* Every body's own channels, shown in the footer of every page. LGRA has no
   Facebook page of its own; the public results-and-brags group covers LGRA,
   AOK9 and Other-Breed NOTRA racing alike, so it sits under LGRA. */
const FOOTER_LINKS = [
  ['ASFA lure coursing', [
    ['globe', 'asfa.org, the official site', 'https://www.asfa.org'],
    ['link', 'Trial calendar (Events page)', 'events.html'],
    ['facebook', 'ASFA on Facebook', 'https://www.facebook.com/AmericanSighthoundFieldAssociation'],
    ['facebook', 'ASFA II group', 'https://www.facebook.com/groups/1046065245418921'],
  ]],
  ['LGRA straight racing', [
    ['globe', 'lgra.club, the official site', 'https://lgra.club'],
    ['link', 'Race calendar', 'https://lgra.club/calendar'],
    ['facebook', 'LGRA / AOK9 / OB NOTRA group', 'https://www.facebook.com/groups/1265142357415139'],
  ]],
  ['AOK9 sprint racing', [
    ['globe', 'aok9racing.com, the official site', 'https://aok9racing.com'],
    ['link', 'Race calendar', 'https://aok9racing.com/calendar.html'],
    ['facebook', 'R.A.C.E. & AOK9 Racing group', 'https://www.facebook.com/groups/772408469471681'],
  ]],
  ['NOTRA OB racing', [
    ['globe', 'notra.org, the official site', 'https://www.notra.org'],
    ['link', 'Race dates', 'https://www.notra.org/RaceDates.html'],
    ['facebook', 'Notra OB Racing group', 'https://www.facebook.com/groups/notraob'],
  ]],
  ['Whippet racing', [
    ['globe', 'whippetracing.org, the WRA site', 'https://www.whippetracing.org'],
    ['link', 'WRA race meets', 'https://www.whippetracing.org/MeetListDisplay.cfm'],
    ['link', 'NOTRA race dates', 'https://www.notra.org/RaceDates.html'],
    ['globe', 'continentalwhippetalliance.com, the CWA site', 'https://www.continentalwhippetalliance.com'],
  ]],
];

function footerLinks() {
  return `
        <div class="grid sm:grid-cols-2 lg:grid-cols-5 gap-x-6 gap-y-4">${FOOTER_LINKS.map(([heading, links]) => `
          <div>
            <p class="font-mono text-[10px] uppercase tracking-widest text-asfa-wellink/60 mb-1.5">${heading}</p>
            <ul class="space-y-1">${links.map(([glyph, label, href]) => `
              <li><a href="${href}"${href.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : ''} class="underline hover:text-asfa-wellink">${icon(glyph, 'mr-1.5')}${label}</a></li>`).join('')}
            </ul>
          </div>`).join('')}
        </div>`;
}

/** Where this section's figures come from. The links above and the
    affiliation line below are the same on every page. */
function footerSource(sectionKey, feed) {
  const link = (href, text) =>
    `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" class="underline hover:text-asfa-wellink">${text}</a>`;
  if (sectionKey === 'asfa') {
    return feed ? `
        <p>
          Standings reproduced from the ${link(feed.source_url, 'ASFA Top 20')},
          covering January 1 through ${formatDate(feed.as_of)}.
          ASFA's published page is authoritative wherever it disagrees with this one.
        </p>` : `
        <p>Standings reproduced from the ASFA Top 20. ASFA's published page is authoritative
          wherever it disagrees with this one.</p>`;
  }
  if (sectionKey === 'akc') {
    return feed ? `
        <p>
          Event entry counts compiled from the American Kennel Club's public
          ${link(feed.source.url, 'Event Search')}, events from ${formatDate(feed.period.start)}
          through ${formatDate(feed.period.end)}, collected ${formatDate(feed.collected)}${
          feed.singles_source ? `, and its ${link(feed.singles_source.url, 'Single Stakes Results')},
          posted through ${formatDate(feed.singles_source.through)}` : ''}.
          AKC's event pages are authoritative wherever they disagree with this one.
        </p>` : `
        <p>Event entry counts compiled from the American Kennel Club's public Event Search.
          AKC's event pages are authoritative wherever they disagree with this one.</p>`;
  }
  if (sectionKey === 'cwa') {
    return feed ? `
        <p>
          Grading guides, standings, the all-time list and titles reproduced from the Continental
          Whippet Alliance at ${link(feed.site_url, 'continentalwhippetalliance.com')}: the grading guide
          updated ${formatDate(feed.stats.guide_updated)}, racing standings as of ${formatDate(feed.stats.racing_as_of)},
          High Combined as of ${formatDate(feed.stats.high_combined_as_of)}, titles read ${formatDate(feed.fetched)}.
          CWA's own records are authoritative wherever they disagree with this page.
        </p>` : `
        <p>Grading guides, standings and titles reproduced from the Continental Whippet Alliance.
          CWA's own records are authoritative wherever they disagree with this page.</p>`;
  }
  const racing = RACING_PROGRAMS.find(([org]) => org === sectionKey);
  if (racing) {
    const guide = racing[2];
    return feed ? `
        <p>
          Figures reproduced from the ${link(feed.source_url, guide)}
          ${guideDate(feed)}${feed.records_url ? `, with titles from the ${link(feed.records_url, "Registrar's Whippet Point Records")}
          of ${formatDate(feed.records_date)}` : ''}, published at
          ${link(feed.source_page, esc(feed.source_page.replace(/^https?:\/\//, '')))}.
          The published ${feed.records_url ? 'records are' : 'guide is'} authoritative wherever ${feed.records_url ? 'they disagree' : 'it disagrees'} with this page.
        </p>` : `
        <p>Figures reproduced from the ${guide}. The published guide is authoritative
          wherever it disagrees with this page.</p>`;
  }
  return `
        <p>
          Figures reproduced from ASFA's Top 20 standings, the LGRA, AOK9, NOTRA, WRA and CWA
          grading guides, and CWA's standings and title lists. Each body's own publication
          is authoritative wherever it disagrees with this site.
        </p>`;
}

/** The subtitle under the wordmark opens a short menu of the programs.

    One click switches sport from any page. Escape and a click elsewhere
    close it; arrow keys walk the items; focus returns to the button. */
function initProgramMenu(header) {
  const button = header.querySelector('#program-menu-button');
  const menu = header.querySelector('#program-menu');
  if (!button || !menu) return;
  const items = () => [...menu.querySelectorAll('[role="menuitem"]')];
  const open = (focusIndex = 0) => {
    menu.classList.remove('hidden');
    button.setAttribute('aria-expanded', 'true');
    const list = items();
    if (list.length) list[Math.max(0, Math.min(focusIndex, list.length - 1))].focus();
  };
  const close = (refocus = false) => {
    menu.classList.add('hidden');
    button.setAttribute('aria-expanded', 'false');
    if (refocus) button.focus();
  };
  button.addEventListener('click', () => {
    if (menu.classList.contains('hidden')) open();
    else close();
  });
  button.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); open(0); }
    if (event.key === 'ArrowUp') { event.preventDefault(); open(items().length - 1); }
  });
  menu.addEventListener('keydown', (event) => {
    const list = items();
    const index = list.indexOf(document.activeElement);
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); list[(index + 1) % list.length].focus(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); list[(index - 1 + list.length) % list.length].focus(); }
    else if (event.key === 'Tab') close();
  });
  document.addEventListener('click', (event) => {
    if (!menu.contains(event.target) && !button.contains(event.target)) close();
  });
}

function renderChrome(feed, current, sectionKey = sectionOf(current)) {
  const section = SECTIONS[sectionKey];
  const links = section.nav.map(([href, label]) =>
    `<a href="${href}" class="shrink-0 px-2.5 py-2.5 font-mono text-xs uppercase tracking-[0.1em] border-b-2 text-asfa-muted border-transparent hover:text-asfa-text">${label}</a>`
  ).join('');

  const header = document.getElementById('site-header');
  if (header) {
    header.innerHTML = `
      <a href="#main" class="skip-link">Skip to content</a>
      <div class="bg-asfa-paper border-b border-asfa-border">
        <div class="max-w-6xl mx-auto px-4">
          <div class="flex items-center gap-2 sm:gap-3 pt-3 pb-1">
          <div class="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <a href="index.html" class="shrink-0" aria-label="Gazehound Stats home">${jackrabbitMark(`block ${section.color}`, 32)}</a>
            <span class="flex flex-col min-w-0">
              <a href="index.html" class="font-display font-semibold text-xl leading-tight text-asfa-text whitespace-nowrap">Gazehound Stats</a>
              <span class="relative">
                <button type="button" id="program-menu-button" aria-haspopup="menu" aria-expanded="false" aria-controls="program-menu"
                        class="max-w-full font-mono text-[11px] font-semibold uppercase tracking-widest ${section.color} whitespace-nowrap inline-flex items-center gap-1 hover:underline"><span class="truncate">${section.program}${section.beta ? ' · beta' : ''}<span class="tagline-year tagline-year-${sectionKey}"> · ${seasonOf(feed)}</span></span>${icon('chevronDown')}</button>
                <div id="program-menu" role="menu" aria-label="Switch program" class="hidden absolute left-0 top-full mt-1.5 z-30 min-w-[15rem] bg-asfa-surface border border-asfa-border shadow-sm py-1">
                  ${Object.entries(SECTIONS).filter(([, s]) => s.menu !== false).map(([key, s]) => {
                    const here = key === sectionKey || Boolean(s.group && s.group === section.group);
                    return `
                  <a role="menuitem" href="${s.home}" ${here ? 'aria-current="page"' : ''}
                     class="pill-hover pill-row block px-4 py-2 font-mono text-[11px] uppercase tracking-widest ${s.color} focus:outline-none">${
                       key === 'hub' ? 'Home · all programs' : s.program}${s.beta ? ' · beta' : ''}${
                       here ? ' <span class="text-asfa-muted" aria-hidden="true">✓</span>' : ''}</a>`;
                  }).join('')}
                </div>
              </span>
            </span>
          </div>
          <div class="ml-auto flex items-center gap-1 shrink-0">
            <button type="button" id="site-search-open" class="search-trigger" aria-haspopup="dialog"
                    aria-keyshortcuts="/ Control+K" aria-label="Search hounds">
              ${icon('search')}<span class="search-trigger-label">Search hounds</span><span class="kbd search-trigger-kbd" aria-hidden="true">/</span>
            </button>
            <button id="theme-toggle" type="button" class="shrink-0 p-1.5 sm:p-2 text-base text-asfa-muted hover:text-asfa-text"></button>
          </div>
          </div>
          <nav class="nav-scroll edge-fade flex flex-nowrap lg:flex-wrap overflow-x-auto lg:overflow-visible -mx-4 px-4 lg:mr-0 lg:-ml-2.5 lg:px-0" aria-label="Site">${links}</nav>
        </div>
      </div>`;
    initThemeToggle(header.querySelector('#theme-toggle'));
    initProgramMenu(header);
    initSiteSearch(header.querySelector('#site-search-open'));

    const nav = header.querySelector('nav');
    paintNav(nav, current, section.nav, section.line);
    if (!renderChrome.hashBound) {
      renderChrome.hashBound = true;
      window.addEventListener('hashchange', () => {
        const liveNav = document.querySelector('#site-header nav');
        if (liveNav) paintNav(liveNav, current, section.nav, section.line);
      });
    }

    // On a phone the nav is one scrolling line; start it with the current
    // page's link in view rather than always parked at Home.
    const activeLink = nav && [...nav.children].find((a) => a.getAttribute('aria-current'));
    if (nav && activeLink && nav.scrollWidth > nav.clientWidth) {
      const offset = activeLink.getBoundingClientRect().left - nav.getBoundingClientRect().left;
      nav.scrollLeft = Math.max(0, offset - (nav.clientWidth - activeLink.offsetWidth) / 2);
    }
  }

  const footer = document.getElementById('site-footer');
  if (footer) {
    // The racing sections explain themselves on their own About tab;
    // about.html is the ASFA side's account.
    const aboutHref = section.about || (isRacingSection(sectionKey) ? `${sectionKey}.html#about` : 'about.html');
    // The hub has no About of its own: it points at each section's account.
    const howBuilt = sectionKey === 'hub'
      ? `How these numbers are built:
          <a href="about.html" class="underline hover:text-asfa-wellink">ASFA</a>
          ${RACING_PROGRAMS.map(([org, name]) =>
            `<a href="${org}.html#about" class="underline hover:text-asfa-wellink">${name}</a>`).join('\n          ')}
          <a href="cwa.html#about" class="underline hover:text-asfa-wellink">CWA</a>`
      : `<a href="${aboutHref}" class="underline hover:text-asfa-wellink">How these numbers are built</a>`;
    footer.innerHTML = `
      <div class="max-w-4xl mx-auto px-4 text-sm text-asfa-wellink/85 space-y-4">${footerLinks()}${footerSource(sectionKey, feed)}
        <p class="text-xs text-asfa-wellink/65">
          <span class="font-semibold text-asfa-wellink/85">Unofficial fan site</span> — not an ASFA, LGRA, AOK9, NOTRA, WRA${
            sectionKey === 'akc' ? ', CWA or AKC' : ' or CWA'} publication.
          Not affiliated with, endorsed by, or sponsored by the American Sighthound Field
          Association, the Large Gazehound Racing Association, Racing and Coursing
          Enthusiasts (R.A.C.E.), which runs the AOK9 program, the National Oval Track
          Racing Association, the Whippet Racing Association, ${sectionKey === 'akc' ? 'the Continental Whippet Alliance, or the American Kennel Club. "AKC" and "American Kennel Club" are marks of the American Kennel Club, used here only to identify the source of the event listings.' : 'or the Continental Whippet Alliance.'}
          ${sectionKey === 'hub' ? '' : `<a href="${section.disclaimer}" class="underline hover:text-asfa-wellink whitespace-nowrap">Full disclaimer</a>`}
        </p>
        <p class="text-xs text-asfa-wellink/65 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-center">
          ${howBuilt}
          <span aria-hidden="true">·</span>
          <a href="mailto:info@gazehound.io" class="underline hover:text-asfa-wellink">Report an error</a>
          <span aria-hidden="true">·</span>
          <a href="https://github.com/jackrabbit-project/jackrabbit" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 hover:text-asfa-wellink whitespace-nowrap align-middle">${jackrabbitMark('ic', 15)}The Jackrabbit Project</a>
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

    rulebook.html needs no data at all. Routed through page(), a failed
    season.json fetch would call showFailure() and blank out the entire rule
    text over a file that page never reads. So paint and hand over first; the
    season, if it arrives, only fills in the header sub-line. */
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

/** Bootstrap for a page drawn from one feed: the racing sections and the
    AKC entries page. `load` is the feed's promise, `url` names it in the
    failure message. render() may return a promise, for a page that waits
    on a second feed; a failure either way shows the same message. */
function pageFeed(current, sectionKey, url, render, load = loadJson(url)) {
  load.then(
    (feed) => {
      renderChrome(feed, current, sectionKey);
      Promise.resolve().then(() => render(feed)).catch((error) => {
        console.error(error);
        showFailure(
          'This page could not be drawn',
          `The data loaded, but the page script failed: ${error.message}`,
          'If the site was updated recently your browser may be holding an old copy of a '
          + 'script. Reload with <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> '
          + '(<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> on a Mac).'
        );
      });
    },
    (error) => {
      console.error(error);
      renderChrome(null, current, sectionKey);
      showFailure(
        'Data unavailable',
        `Could not load ${url}: ${error.message}`,
        'If you are running this locally, serve the folder over HTTP '
        + '(<code>python tools/serve.py</code>) rather than opening the file directly.'
      );
    }
  );
}

/** Bootstrap for lgra.html, aok9.html, notra.html and racing-dog.html: one
    racing feed, through the memoised loader the search shares. */
function pageRacing(current, org, render) {
  pageFeed(current, org, RACING_URLS[org] || org, render, loadRacing(org));
}

/** Bootstrap for the hub: every feed, each allowed to fail on its own.

    The chrome paints first so the page is never blank while the feeds load;
    render() receives whichever feeds arrived and null for the rest. */
function pageHub(render) {
  renderChrome(null, 'index.html', 'hub');
  Promise.allSettled([
    loadSeason(), loadRacing('lgra'), loadRacing('aok9'), loadTrials(), loadRacing('aok9-singles'), loadRacing('notra'),
    loadRacing('wra'), loadRacing('notra-whippets'), loadCwa(),
  ]).then((results) => {
    const [asfa, lgra, aok9, trials, singles, notra, wra, notraWhippets, cwa] = results.map((result) => {
      if (result.status === 'rejected') console.warn(result.reason);
      return result.status === 'fulfilled' ? result.value : null;
    });
    try {
      render({ asfa, lgra, aok9, trials, singles, notra, wra, notraWhippets, cwa });
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
  });
}

/* Table fit ---------------------------------------------------------- */

/** On a wide screen a table does not scroll inside its card (so its header
    row can stick to the viewport), which assumes every table fits. One that
    would not, measured with one-line headers, is marked .tbl-tight and
    wraps its headers instead of spilling past the card's edge: AOK9's
    thirteen columns once a "Since" column joins them. Narrower screens
    scroll the wrapper and are left alone. Runs after any render that adds
    or reveals a table, and on resize. */
const WIDE_TABLES = window.matchMedia('(min-width: 1200px)');

function fitTables() {
  document.querySelectorAll('.tbl-wrap > .tbl').forEach((table) => {
    const wrap = table.parentElement;
    table.classList.remove('tbl-tight');
    if (WIDE_TABLES.matches && wrap.clientWidth > 0 && table.offsetWidth > wrap.clientWidth + 1) {
      table.classList.add('tbl-tight');
    }
  });
}

let fitTablesPending = false;
function scheduleFitTables() {
  if (fitTablesPending) return;
  fitTablesPending = true;
  requestAnimationFrame(() => { fitTablesPending = false; fitTables(); });
}

new MutationObserver((records) => {
  // The class flips fitTables makes on the tables themselves are not a reason to run again.
  if (records.every((r) => r.type === 'attributes' && r.target.matches('table.tbl'))) return;
  scheduleFitTables();
}).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
window.addEventListener('resize', scheduleFitTables);
WIDE_TABLES.addEventListener('change', scheduleFitTables);
// A table measured in the fallback font can fit and then widen when the web
// fonts arrive, with nothing in the DOM to notice; measure again then.
window.addEventListener('load', scheduleFitTables);
if (document.fonts) {
  document.fonts.ready.then(scheduleFitTables);
  document.fonts.addEventListener('loadingdone', scheduleFitTables);
}
