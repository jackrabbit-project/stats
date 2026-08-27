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

/* The Jackrabbit mark: running rabbit in a broken circle, one path. Drawn
   once here and used in the header lockup and the footer credit. */
const JACKRABBIT_PATH = 'M 440.8 372.8 C 437.2 366.4 424.8 348.0 419.8 341.0 C 414.7 334.0 413.5 333.5 410.5 331.0 C 407.5 328.5 404.5 327.1 401.8 325.8 C 399.0 324.4 399.0 324.1 394.0 323.0 C 389.0 321.9 376.6 320.4 372.0 319.0 C 367.4 317.6 368.0 316.5 366.5 314.8 C 365.0 313.0 365.0 313.7 362.8 308.5 C 360.5 303.3 355.8 290.4 352.8 283.5 C 349.7 276.6 347.3 272.1 344.5 267.2 C 341.7 262.4 339.0 258.5 335.8 254.5 C 332.5 250.5 328.7 246.5 325.2 243.2 C 321.8 240.0 318.6 237.2 315.2 234.8 C 311.9 232.2 308.5 230.0 305.2 228.2 C 302.0 226.5 298.5 224.8 295.5 224.0 C 292.5 223.2 289.1 223.0 287.0 223.2 C 284.9 223.5 283.9 224.2 283.0 225.8 C 282.1 227.3 281.5 230.4 281.5 232.8 C 281.5 235.1 282.0 236.9 283.0 239.8 C 284.0 242.6 286.1 247.9 287.2 250.0 C 288.4 252.1 285.5 250.0 289.8 252.5 C 294.0 255.0 305.6 260.2 312.5 265.0 C 319.4 269.8 325.9 275.2 331.2 281.0 C 336.6 286.8 341.0 293.3 344.8 299.5 C 348.5 305.7 352.9 315.8 354.0 318.0 C 353.9 318.0 354.0 319.5 352.8 318.0 C 351.5 316.5 350.0 313.3 346.8 309.2 C 343.5 305.2 338.2 298.8 333.5 293.8 C 328.8 288.7 323.0 283.0 318.5 279.0 C 314.0 275.0 310.6 272.6 306.8 270.0 C 302.9 267.4 300.4 265.8 295.5 263.2 C 290.6 260.8 283.0 257.0 277.5 255.0 C 272.0 253.0 266.6 251.7 262.8 251.0 C 258.9 250.3 256.5 250.7 254.5 251.0 C 252.5 251.3 251.5 252.2 250.5 253.0 C 249.5 253.8 249.0 254.1 248.8 255.8 C 248.5 257.4 248.5 260.4 249.0 263.0 C 249.5 265.6 250.3 267.8 252.0 271.2 C 253.7 274.7 256.4 279.6 259.2 283.8 C 262.1 287.9 266.4 293.2 269.0 296.2 C 271.6 299.3 271.4 299.4 275.0 302.2 C 278.6 305.1 285.1 310.2 290.5 313.5 C 295.9 316.8 302.3 319.5 307.5 321.8 C 312.7 324.0 317.6 324.9 321.5 327.0 C 325.4 329.1 329.1 332.5 331.0 334.2 C 332.9 336.0 332.5 336.7 332.8 337.8 C 333.0 338.8 333.0 339.3 332.8 340.8 C 332.5 342.2 331.9 344.4 331.0 346.2 C 330.1 348.1 329.2 350.0 327.5 351.8 C 325.8 353.5 323.0 355.8 320.8 357.0 C 318.5 358.2 315.8 358.5 314.0 358.8 C 312.2 359.0 312.0 359.1 309.8 358.8 C 307.5 358.4 305.4 358.4 300.5 356.8 C 295.6 355.1 287.0 351.3 280.2 349.0 C 273.5 346.7 265.9 344.5 260.0 343.0 C 254.1 341.5 249.9 340.7 244.8 340.0 C 239.6 339.3 234.1 338.9 229.0 338.8 C 223.9 338.6 219.0 338.9 214.2 339.2 C 209.5 339.6 205.5 340.0 200.8 341.0 C 196.0 342.0 190.2 343.8 185.8 345.2 C 181.3 346.8 178.7 347.7 174.0 350.0 C 169.3 352.3 162.2 356.2 157.8 359.0 C 153.3 361.8 150.9 363.7 147.2 366.8 C 143.6 369.8 139.6 373.2 135.8 377.5 C 131.9 381.8 127.3 387.5 124.0 392.5 C 120.7 397.5 118.3 402.0 116.0 407.8 C 113.7 413.5 111.3 420.6 110.0 426.8 C 108.7 432.9 108.1 439.3 108.0 444.8 C 107.9 450.2 109.2 456.7 109.2 459.2 C 109.3 461.8 108.6 459.9 108.5 460.0 C 107.5 459.4 102.2 456.1 99.8 455.0 C 97.3 453.9 96.1 453.4 94.0 453.2 C 91.9 453.1 88.9 453.6 87.2 454.0 C 85.6 454.4 85.3 454.7 84.2 455.8 C 83.2 456.8 81.7 458.8 81.0 460.2 C 80.3 461.7 80.2 462.7 80.2 464.2 C 80.2 465.8 78.9 465.5 81.0 469.8 C 83.1 474.0 90.1 485.8 93.0 490.0 C 95.9 494.2 95.6 493.1 98.2 494.8 C 100.9 496.4 106.0 498.8 109.0 499.8 C 112.0 500.8 113.0 500.9 116.5 500.8 C 120.0 500.6 126.2 498.0 129.8 499.0 C 133.3 500.0 134.9 504.3 137.8 506.8 C 140.6 509.2 143.8 511.8 147.0 513.8 C 150.2 515.8 153.7 517.4 156.8 518.8 C 159.8 520.1 161.8 521.0 165.2 521.8 C 168.7 522.5 170.3 523.2 177.5 523.2 C 184.7 523.3 202.6 521.6 208.5 522.0 C 214.4 522.4 211.6 523.1 213.0 525.5 C 214.4 527.9 215.5 533.9 217.0 536.2 C 218.5 538.6 219.7 539.2 221.8 539.8 C 223.8 540.3 223.1 541.9 229.5 539.8 C 235.9 537.6 252.4 529.7 260.0 526.8 C 267.6 523.8 270.0 523.3 275.0 522.0 C 280.0 520.7 284.3 519.8 290.0 519.0 C 295.7 518.2 304.0 517.5 309.0 517.2 C 314.0 517.0 316.8 517.5 320.0 517.2 C 323.2 517.0 326.0 516.4 328.2 515.8 C 330.5 515.1 332.0 514.3 333.2 513.5 C 334.5 512.7 335.2 512.2 335.8 511.0 C 336.3 509.8 336.8 507.7 336.8 506.5 C 336.7 505.3 337.0 505.3 335.5 503.8 C 334.0 502.2 330.3 498.6 328.0 497.0 C 325.7 495.4 324.2 494.9 321.8 494.0 C 319.3 493.1 317.0 492.1 313.5 491.8 C 310.0 491.4 305.3 491.4 301.0 491.8 C 296.7 492.1 295.8 491.7 287.8 494.0 C 279.8 496.3 257.1 504.2 253.0 505.5 C 252.9 505.3 251.8 506.9 252.2 504.0 C 252.7 501.1 255.2 493.4 255.8 488.2 C 256.3 483.1 256.2 478.2 255.8 473.2 C 255.3 468.3 254.7 463.8 253.0 458.8 C 251.3 453.7 248.7 447.4 245.8 442.8 C 242.8 438.1 238.5 433.7 235.5 430.8 C 232.5 427.8 231.2 427.0 227.8 425.0 C 224.2 423.0 219.5 420.5 214.5 419.0 C 209.5 417.5 200.4 416.4 197.5 415.8 C 194.6 415.1 197.3 415.1 197.2 415.0 C 198.4 414.9 203.8 413.9 206.8 413.8 C 209.8 413.6 212.2 413.6 215.2 414.0 C 218.2 414.4 220.7 414.5 224.8 416.0 C 228.8 417.5 235.2 420.1 239.5 423.0 C 243.8 425.9 247.7 430.1 250.8 433.5 C 253.8 436.9 255.7 440.0 257.8 443.5 C 259.8 447.0 261.5 450.5 263.0 454.8 C 264.5 459.0 265.9 463.1 266.8 468.8 C 267.6 474.4 268.1 486.2 268.2 488.5 C 268.5 488.5 267.7 489.4 270.0 488.8 C 272.3 488.1 277.7 485.9 282.2 484.8 C 286.8 483.6 293.3 482.6 297.2 482.0 C 301.2 481.4 301.8 481.2 306.0 481.2 C 310.2 481.2 317.6 483.2 322.8 482.0 C 327.9 480.8 333.0 476.3 336.8 473.8 C 340.5 471.2 342.6 469.4 345.5 466.8 C 348.4 464.1 350.9 462.0 354.2 458.0 C 357.6 454.0 361.8 449.4 365.8 442.8 C 369.7 436.1 375.0 423.6 378.0 418.2 C 381.0 412.9 381.8 412.6 383.5 410.8 C 385.2 408.9 386.7 408.0 388.2 407.0 C 389.8 406.0 391.1 405.5 392.8 405.0 C 394.4 404.5 394.6 404.1 398.2 403.8 C 401.9 403.4 410.2 403.6 414.8 402.8 C 419.3 401.9 422.8 400.2 425.5 398.8 C 428.2 397.2 429.1 396.2 431.2 393.8 C 433.4 391.3 436.9 386.7 438.5 384.2 C 440.1 381.8 440.4 381.2 440.8 379.2 C 441.1 377.3 444.2 379.1 440.8 372.8 Z  M 294.2 529.8 C 293.8 529.7 292.8 528.8 290.0 529.0 C 287.2 529.2 282.1 530.0 277.8 531.0 C 273.4 532.0 267.8 533.6 263.8 535.0 C 259.7 536.4 257.0 536.6 253.5 539.2 C 250.0 541.9 245.1 548.0 243.0 550.8 C 240.9 553.5 241.3 554.0 241.0 555.5 C 240.7 557.0 240.8 558.7 241.0 559.8 C 241.2 560.8 241.0 561.0 242.0 562.0 C 243.0 563.0 245.4 565.1 247.2 565.8 C 249.1 566.4 249.9 566.9 253.2 565.8 C 256.6 564.6 263.5 560.9 267.2 558.8 C 271.0 556.6 272.6 555.2 275.5 552.8 C 278.4 550.3 281.9 547.3 284.8 544.2 C 287.6 541.2 291.2 536.7 292.8 534.2 C 294.3 531.8 294.1 530.3 294.2 529.8 Z  M 380.8 242.0 C 377.7 239.8 363.5 228.7 354.2 223.0 C 345.0 217.3 332.5 211.5 325.0 208.0 C 317.5 204.5 314.7 203.8 309.0 202.0 C 303.3 200.2 298.7 198.5 291.0 197.0 C 283.3 195.5 271.2 193.7 262.8 193.0 C 254.3 192.3 246.2 192.6 240.2 192.8 C 234.3 192.9 233.9 192.8 227.2 193.8 C 220.6 194.8 208.2 196.9 200.5 198.8 C 192.8 200.6 186.1 203.1 180.8 205.0 C 175.4 206.9 174.6 207.0 168.5 210.0 C 162.4 213.0 150.3 219.5 144.2 223.0 C 138.2 226.5 136.7 227.7 132.2 231.0 C 127.8 234.3 123.5 237.4 117.5 243.0 C 111.5 248.6 102.9 257.1 96.5 264.8 C 90.1 272.4 84.4 280.0 79.0 289.0 C 73.6 298.0 67.5 311.2 64.0 319.0 C 60.5 326.8 60.0 328.8 58.0 335.8 C 56.0 342.7 53.4 353.0 52.0 360.8 C 50.6 368.5 50.1 375.6 49.8 382.2 C 49.4 388.9 49.5 395.2 49.8 400.8 C 50.0 406.3 50.1 409.4 51.0 415.8 C 51.9 422.1 54.2 435.1 55.0 439.0 C 55.8 442.9 55.7 439.2 55.8 439.2 C 55.6 438.0 54.9 433.9 54.8 428.5 C 54.6 423.1 54.2 415.1 54.8 407.0 C 55.3 398.9 56.0 389.8 58.0 379.8 C 60.0 369.7 63.6 356.5 67.0 346.8 C 70.4 337.0 74.8 328.2 78.2 321.0 C 81.8 313.8 85.1 308.3 88.0 303.5 C 90.9 298.7 91.5 297.5 95.8 292.0 C 100.0 286.5 108.5 275.8 113.2 270.2 C 118.0 264.8 119.9 263.2 124.5 259.0 C 129.1 254.8 135.0 249.5 141.0 245.0 C 147.0 240.5 153.2 236.2 160.2 232.0 C 167.3 227.8 175.4 223.2 183.5 219.8 C 191.6 216.2 200.0 213.5 209.0 211.0 C 218.0 208.5 228.1 206.2 237.8 205.0 C 247.4 203.8 257.0 203.4 267.0 203.8 C 277.0 204.1 287.5 205.2 297.5 207.0 C 307.5 208.8 317.5 211.4 327.2 214.8 C 337.0 218.1 347.1 222.5 356.0 227.0 C 364.9 231.5 377.9 240.2 380.8 242.0 Z  M 453.8 448.5 C 452.8 451.1 449.2 463.0 446.0 470.5 C 442.8 478.0 439.1 485.7 434.8 493.2 C 430.4 500.8 425.0 508.8 419.8 515.8 C 414.5 522.7 409.0 529.0 403.2 535.0 C 397.5 541.0 392.4 546.0 385.0 552.0 C 377.6 558.0 367.3 565.4 358.8 570.8 C 350.2 576.1 341.1 580.5 333.5 584.0 C 325.9 587.5 319.6 589.6 313.2 591.8 C 306.9 593.9 302.5 595.2 295.2 596.8 C 288.0 598.2 277.7 600.0 270.0 600.8 C 262.3 601.5 257.6 601.8 249.0 601.5 C 240.4 601.2 227.6 600.2 218.2 598.8 C 208.9 597.3 200.6 595.0 192.8 592.8 C 184.9 590.5 178.4 588.2 171.0 585.0 C 163.6 581.8 155.8 578.0 148.5 573.8 C 141.2 569.5 129.5 561.2 127.0 559.5 C 129.6 561.6 142.0 572.4 149.5 577.8 C 157.0 583.1 163.9 587.3 172.0 591.5 C 180.1 595.7 189.5 599.7 198.0 602.8 C 206.5 605.8 213.8 607.9 223.0 609.8 C 232.2 611.6 245.1 613.1 253.5 613.8 C 261.9 614.4 265.0 614.4 273.2 613.8 C 281.5 613.1 295.2 611.2 303.2 609.8 C 311.3 608.2 316.3 606.4 321.8 604.8 C 327.2 603.1 330.5 602.0 335.8 599.8 C 341.0 597.5 346.4 595.2 353.0 591.5 C 359.6 587.8 368.8 582.4 375.5 577.8 C 382.2 573.1 386.9 569.3 393.0 563.5 C 399.1 557.7 406.3 550.3 412.2 543.0 C 418.2 535.7 424.0 527.6 428.8 519.8 C 433.5 511.9 437.4 503.6 440.8 495.8 C 444.1 487.9 446.7 479.5 448.8 472.8 C 450.8 466.0 452.2 459.3 453.0 455.2 C 453.8 451.2 453.7 449.3 453.8 448.5 Z ';

function jackrabbitMark(cls, size) {
  return `<svg class="${cls}" width="${size}" height="${Math.round(size * 438 / 420)}" viewBox="42 185 420 438" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="${JACKRABBIT_PATH}"/></svg>`;
}

/* ----------------------------------------------------------------- countup */

/* Rolls a headline number up from zero — an ease-out ramp on
   requestAnimationFrame, started when the element scrolls into view.
   Dependency-free on purpose; reduced-motion users get the final value
   immediately. */
function countUp(el, to, { duration = 1.1, separator = false } = {}) {
  const fmt = (n) => {
    const rounded = Math.round(n);
    return separator ? rounded.toLocaleString('en-US') : String(rounded);
  };
  if (!('IntersectionObserver' in window)
      || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = fmt(to);
    return;
  }
  el.textContent = fmt(0);
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    observer.disconnect();
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / (duration * 1000));
      el.textContent = fmt(to * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  observer.observe(el);
}

/* The home tiles repaint when the titles feed lands, so remember what has
   already rolled: a repainted tile keeps its final value and only genuinely
   new tiles animate. */
const countedTiles = new Map();

function animateTiles(container) {
  if (!container) return;
  container.querySelectorAll('.tile').forEach((tile) => {
    const valueEl = tile.querySelector('.tile-value');
    const label = tile.querySelector('.tile-label')?.textContent ?? '';
    if (!valueEl) return;
    const raw = valueEl.textContent.trim();
    const target = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(target) || raw === '') return;
    if (countedTiles.get(label) === target) return;
    countedTiles.set(label, target);
    countUp(valueEl, target, { separator: raw.includes(',') });
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

function renderChrome(season, current) {
  const links = NAV.map(([href, label]) => {
    const active = href === current;
    return `<a href="${href}" class="shrink-0 px-2.5 py-2.5 font-mono text-xs uppercase tracking-[0.1em] border-b-2 ${
      active ? 'text-asfa-text border-asfa-accent' : 'text-asfa-muted border-transparent hover:text-asfa-text'
    }">${label}</a>`;
  }).join('');

  const header = document.getElementById('site-header');
  if (header) {
    header.innerHTML = `
      <a href="#main" class="skip-link">Skip to content</a>
      <div class="bg-asfa-paper border-b border-asfa-border px-4 py-1.5 text-center font-mono text-[11px] uppercase tracking-widest text-asfa-muted">
        <span class="text-asfa-accent">Unofficial fan site</span> — not an ASFA publication.
        <a href="about.html#disclaimer" class="underline hover:text-asfa-text whitespace-nowrap">Full disclaimer</a>
      </div>
      <div class="bg-asfa-paper border-b border-asfa-border">
        <div class="max-w-6xl mx-auto px-4 pt-3 lg:pt-0 lg:py-1.5 flex flex-col lg:flex-row lg:items-center gap-x-8 relative">
          <a href="index.html" class="flex items-center gap-2.5 shrink-0 pr-10 lg:pr-0">
            ${jackrabbitMark('shrink-0 text-asfa-accent', 32)}
            <span class="flex flex-col">
              <span class="font-display font-semibold text-xl leading-tight text-asfa-text whitespace-nowrap">Lure Coursing Stats</span>
              <span class="font-mono text-[10px] uppercase tracking-widest text-asfa-muted whitespace-nowrap">ASFA standings · ${season ? season.season : ''}</span>
            </span>
          </a>
          <nav class="nav-scroll edge-fade flex flex-nowrap lg:flex-wrap overflow-x-auto lg:overflow-visible -mx-4 px-4 lg:mx-0 lg:px-0" aria-label="Site">${links}</nav>
          <button id="theme-toggle" type="button" class="absolute right-3 top-2.5 lg:static lg:order-last lg:ml-auto shrink-0 p-2 text-base text-asfa-muted hover:text-asfa-text"></button>
        </div>
      </div>`;
    initThemeToggle(header.querySelector('#theme-toggle'));

    // On a phone the nav is one scrolling line; start it with the current
    // page's link in view rather than always parked at Home.
    const nav = header.querySelector('nav');
    const activeLink = nav && [...nav.children].find((a) => a.getAttribute('href') === current);
    if (nav && activeLink && nav.scrollWidth > nav.clientWidth) {
      const offset = activeLink.getBoundingClientRect().left - nav.getBoundingClientRect().left;
      nav.scrollLeft = Math.max(0, offset - (nav.clientWidth - activeLink.offsetWidth) / 2);
    }
  }

  const footer = document.getElementById('site-footer');
  if (footer && season) {
    // ASFA's own channels, plus the page where changes to this site are
    // announced. Kept above the disclaimer rather than beside the site's own
    // links, so it reads as "where to find ASFA" and not as this site's own.
    const community = `
        <p class="flex flex-wrap gap-x-5 gap-y-1.5">
          <a href="https://www.facebook.com/AmericanSighthoundFieldAssociation" target="_blank" rel="noopener noreferrer" class="underline hover:text-asfa-wellink">${icon('facebook', 'mr-1.5')}Follow ASFA on Facebook</a>
          <a href="https://www.asfa.org" target="_blank" rel="noopener noreferrer" class="underline hover:text-asfa-wellink">${icon('globe', 'mr-1.5')}asfa.org, the official site</a>
          <a href="https://www.facebook.com/groups/1046065245418921" target="_blank" rel="noopener noreferrer" class="underline hover:text-asfa-wellink">${icon('facebook', 'mr-1.5')}Join the ASFA II group</a>
          <a href="https://www.facebook.com/ASFAlureCoursing" target="_blank" rel="noopener noreferrer" class="underline hover:text-asfa-wellink">${icon('facebook', 'mr-1.5')}ASFA Lure Coursing, where updates to this site are posted</a>
        </p>`;

    footer.innerHTML = `
      <div class="max-w-4xl mx-auto px-4 text-sm text-asfa-wellink/85 space-y-3">${community}
        <p>
          Standings reproduced from the
          <a href="${esc(season.source_url)}" target="_blank" rel="noopener noreferrer" class="underline hover:text-asfa-wellink">ASFA Top 20</a>,
          covering January 1 through ${formatDate(season.as_of)}.
          ASFA's published page is authoritative wherever it disagrees with this one.
        </p>
        <p class="text-xs text-asfa-wellink/65">
          Independent fan project. Not affiliated with, endorsed by, or sponsored by the
          American Sighthound Field Association.
        </p>
        <p class="text-xs text-asfa-wellink/65 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-center">
          <a href="about.html" class="underline hover:text-asfa-wellink">How these numbers are built</a>
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
