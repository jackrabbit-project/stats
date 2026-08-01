/* Shared plumbing for every page: data loading, chrome, search, formatting.
   No framework and no build step, matching the rest of the project. */

const DATA_URL = 'data/season.json';
const TRIALS_URL = 'data/trials.json';

let seasonPromise = null;
let trialsPromise = null;

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
    return '<span class="badge badge-new"><i class="fa-solid fa-star"></i> new</span>';
  }
  const delta = movement.rank_delta;
  if (!delta) return '<span class="badge badge-flat">–</span>';
  const up = delta > 0;
  const icon = up ? 'fa-arrow-up' : 'fa-arrow-down';
  const cls = up ? 'badge-up' : 'badge-down';
  return `<span class="badge ${cls}"><i class="fa-solid ${icon}"></i> ${Math.abs(delta)}</span>`;
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
    const owner = dog.owner_raw.toLowerCase();

    let score = 0;
    if (call === needle) score = 100;
    else if (call.startsWith(needle)) score = 90;
    else if (registered.toLowerCase().startsWith(needle)) score = 80;
    else if (call.includes(needle)) score = 70;
    else if (registered.includes(needle)) score = 60;
    else if (owner.includes(needle)) score = 40;
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
  ['bowen.html', 'Bowen', 'fa-solid fa-calculator'],
  ['about.html', 'About'],
];

function renderChrome(season, current) {
  const links = NAV.map(([href, label, icon]) => {
    const active = href === current;
    return `<a href="${href}" class="px-3 py-2 text-sm font-abel uppercase tracking-widest ${
      active ? 'text-white border-b-2 border-asfa-accent' : 'text-white/75 hover:text-white'
    }">${icon ? `<i class="${icon} mr-1.5" aria-hidden="true"></i>` : ''}${label}</a>`;
  }).join('');

  const header = document.getElementById('site-header');
  if (header) {
    header.innerHTML = `
      <div class="bg-asfa-accent text-white text-xs md:text-sm px-4 py-1.5 text-center">
        <i class="fa-solid fa-circle-info mr-1.5"></i>Unofficial fan site — not an ASFA publication.
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
    footer.innerHTML = `
      <div class="max-w-4xl mx-auto px-4 text-sm text-white/85 space-y-3">
        <p>
          Standings reproduced from the
          <a href="${esc(season.source_url)}" target="_blank" rel="noopener noreferrer" class="underline hover:text-asfa-bg2">ASFA Top 20</a>,
          covering January 1 through ${formatDate(season.as_of)}.
          ASFA's published page is authoritative wherever it disagrees with this one.
        </p>
        <p class="text-xs text-white/65">
          Independent fan project. Not affiliated with, endorsed by, or sponsored by the
          American Sighthound Field Association.
          <a href="about.html" class="underline hover:text-asfa-bg2">How these numbers are built</a> ·
          <a href="mailto:info@gazehound.io" class="underline hover:text-asfa-bg2">Report an error</a> ·
          <a href="https://github.com/jackrabbit-project/asfa-top20" target="_blank" rel="noopener noreferrer" class="underline hover:text-asfa-bg2"><i class="fa-brands fa-github mr-1"></i>Source</a>
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
