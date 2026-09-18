/* The LGRA and AOK9 racing pages: what the two programs have in common, the
   table of where they differ, and the two page renderers (overview, hound).
   Loaded after app.js; plain globals like the rest of the site. */

/* --------------------------------------------------------------- programs */

const ORGS = {
  lgra: {
    key: 'lgra',
    name: 'LGRA',
    fullName: 'Large Gazehound Racing Association',
    program: 'straight racing',
    page: 'lgra.html',
    noun: 'hound', nouns: 'hounds',
    waves: [['wave', 'WAVE', 'grade']],
    seasonLabel: 'National points this year',
    careers: [['ngrc', 'rank_career', 'Career National points', 'sgrc', 'SGRC']],
    champion: [['grc', 'GRC', 'Gazehound Racing Champion', 12]],
    supreme: [['ngrc', 'sgrc', 'SGRC', 'Superior Gazehound Racing Champion', 30]],
    tiles: (dog) => [
      [ptsLabel(dog.ytd), 'National points this year'],
      [ptsLabel(dog.ngrc), 'career National points'],
      [`${ptsLabel(dog.grc)} / 12`, 'GRC points'],
    ],
    streams: [['meets', 'Last three meets']],
    browse: [
      ['rank_breed', 'Rank', 'num', 1],
      ['call_name', 'Call name', '', 1],
      ['registered_name', 'Registered name', '', 1],
      ['owner_raw', 'Owner', '', 1],
      ['ytd', 'This year', 'num', -1],
      ['ngrc', 'Career', 'num', -1],
      ['grc', 'GRC pts', 'num', -1],
      ['wave', 'WAVE', 'num', -1],
      ['last_raced', 'Last raced', '', -1],
    ],
    rules: 'LGRA Rule Book 23.2',
    photo: {
      src: 'assets/hero-lgra.jpg',
      alt: 'Three Afghan Hounds in numbered racing blankets and muzzles breaking from the starting boxes',
      credit: null,
      position: 'object-[50%_62%]',
    },
  },
  aok9: {
    key: 'aok9',
    name: 'AOK9',
    fullName: 'AOK9 program of Racing and Coursing Enthusiasts (R.A.C.E.)',
    program: 'sprint racing',
    page: 'aok9.html',
    noun: 'dog', nouns: 'dogs',
    waves: [['bwave', 'Breed WAVE', 'bgrade'], ['mwave', 'Mixed WAVE', 'mgrade']],
    seasonLabel: 'points this year',
    careers: [
      ['nbrc', 'rank_career_breed', 'Career National Breed points', 'sbrc', 'SBRC'],
      ['nmrc', 'rank_career_mixed', 'Career National Mixed points', 'smrc', 'SMRC'],
    ],
    champion: [
      ['brc', 'BRC', 'Breed Racing Champion', 12],
      ['mrc', 'MRC', 'Mixed Racing Champion', 12],
    ],
    supreme: [
      ['nbrc', 'sbrc', 'SBRC', 'Supreme Breed Racing Champion', 30],
      ['nmrc', 'smrc', 'SMRC', 'Supreme Mixed Racing Champion', 30],
      ['trc', 'strc', 'STRC', 'Supreme Turtle Racing Champion', 30],
    ],
    tiles: (dog) => [
      [ptsLabel(dog.ytd), 'points this year'],
      [`${ptsLabel(dog.brc)} / 12`, 'BRC points'],
      [`${ptsLabel(dog.mrc)} / 12`, 'MRC points'],
      [ptsLabel(dog.nbrc), 'National Breed points'],
      [ptsLabel(dog.nmrc), 'National Mixed points'],
      [ptsLabel(dog.trc), 'Turtle points'],
    ],
    streams: [
      ['meets_breed', 'Last three breed-division meets'],
      ['meets_mixed', 'Last three mixed-division meets'],
    ],
    browse: [
      ['rank_breed', 'Rank', 'num', 1],
      ['call_name', 'Call name', '', 1],
      ['registered_name', 'Registered name', '', 1],
      ['owner_raw', 'Owner', '', 1],
      ['ytd', 'This year', 'num', -1],
      ['nbrc', 'Career breed', 'num', -1],
      ['nmrc', 'Career mixed', 'num', -1],
      ['brc', 'BRC', 'num', -1],
      ['mrc', 'MRC', 'num', -1],
      ['bwave', 'Breed WAVE', 'num', -1],
      ['mwave', 'Mixed WAVE', 'num', -1],
      ['last_raced', 'Last raced', '', -1],
    ],
    rules: 'AOK9 Sprint Racing Rule Book 3.0',
  },
};

/* ---------------------------------------------------------------- helpers */

function racingDogUrl(org, id) {
  return `racing-dog.html?org=${org}&id=${encodeURIComponent(id)}`;
}

function racingBreedUrl(org, slug) {
  return `${org}.html?breed=${encodeURIComponent(slug)}#browse`;
}

function racingOwnerUrl(org, key) {
  return `${org}.html?owner=${encodeURIComponent(key)}#browse`;
}

/** "12", "12.5", "—": points are halves and quarters, never long decimals. */
function ptsLabel(value) {
  if (value == null) return '—';
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function waveLabel(value) {
  if (value == null) return '—';
  return (Math.round(value * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
}

/** Grade bands from rule 4.2.2.5, on the existing badge pairs so dark mode
    needs nothing new: A green, B amber, C rust, D neutral. */
function gradeBadge(grade) {
  if (!grade) return '';
  const cls = { A: 'badge-t-fch', B: 'badge-t-lcm', C: 'badge-t-tcp', D: 'badge-flat' }[grade] || 'badge-flat';
  return `<span class="badge ${cls}" title="Grade ${grade}">${grade}</span>`;
}

/** A 0 to 22 bar with the grade boundaries ticked on it. */
function waveBar(value) {
  if (value == null) return '';
  const pct = (n) => `${Math.max(0, Math.min(100, (n / 22) * 100))}%`;
  const tick = (n, label) => `
    <span class="absolute top-0 bottom-0 border-l border-asfa-border" style="left:${pct(n)}" aria-hidden="true"></span>
    <span class="absolute -bottom-4 text-[10px] font-mono text-asfa-text/55 -translate-x-1/2" style="left:${pct(n)}" aria-hidden="true">${label}</span>`;
  return `
    <div class="relative h-3 bg-asfa-bg2 border border-asfa-border mt-3 mb-5" role="img" aria-label="WAVE ${waveLabel(value)} of a possible 22">
      <div class="h-full bg-asfa-accent" style="width:${pct(value)}"></div>
      ${tick(5.5, 'C')}${tick(8, 'B')}${tick(11, 'A')}
      <span class="absolute -bottom-4 right-0 text-[10px] font-mono text-asfa-text/55" aria-hidden="true">22</span>
    </div>`;
}

function progressBar(value, need, label) {
  const done = (value || 0) >= need;
  const pct = Math.max(0, Math.min(100, ((value || 0) / need) * 100));
  return `
    <div class="mt-3">
      <div class="flex justify-between text-sm">
        <span class="font-semibold">${label}</span>
        <span class="text-asfa-text/70">${ptsLabel(value || 0)} / ${need}${done ? ' · earned' : ''}</span>
      </div>
      <div class="h-2 bg-asfa-bg2 border border-asfa-border mt-1" role="img" aria-label="${label}: ${ptsLabel(value || 0)} of ${need}">
        <div class="h-full ${done ? 'bg-asfa-green' : 'bg-asfa-accent'}" style="width:${pct}%"></div>
      </div>
    </div>`;
}

function formatDateShort(iso) {
  if (!iso) return '';
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

/** Unpack a compact meet row using the feed's own column list. */
function unpackMeets(feed, rows) {
  return (rows || []).map((row) => Object.fromEntries(feed.meet_columns.map((col, i) => [col, row[i]])));
}

function unpackDq(feed, rows) {
  return (rows || []).map((row) => Object.fromEntries(feed.dq_columns.map((col, i) => [col, row[i]])));
}

/** What to call a meet: its date when the code carries one, otherwise the
    year and the registrar's number. */
function meetLabel(meet, org) {
  if (meet.date) return formatDateShort(meet.date);
  if (org === 'aok9') {
    const match = /^(\d{4})-S(\d+)/.exec(meet.code);
    if (match) return `${match[1]}, sanctioned meet ${Number(match[2])}`;
  }
  if (meet.year) return `${meet.year}, meet ${meet.code.replace(/^[A-Za-z]+/, '')}`;
  return 'undated';
}

/** The WAVE arithmetic spelled out, per rule 4.2.2. */
function waveArithmetic(meets) {
  const listed = meets.filter((m) => m.score != null);
  if (!listed.length) return '';
  const complete = listed.filter((m) => m.complete).map((m) => m.score);
  const n = (x) => ptsLabel(x);
  const r = (x) => waveLabel(x);
  if (complete.length >= 3) {
    const [a, b, c] = complete;
    return `(${n(a)} + 0.7 × ${n(b)} + 0.5 × ${n(c)}) ÷ 2.2 = ${r((a + 0.7 * b + 0.5 * c) / 2.2)}`;
  }
  if (complete.length === 2) {
    const [a, b] = complete;
    return `(${n(a)} + 0.7 × ${n(b)}) ÷ 1.7 = ${r((a + 0.7 * b) / 1.7)}`;
  }
  if (complete.length === 1) return `the one complete meet, ${n(complete[0])}`;
  const mean = listed.reduce((sum, m) => sum + m.score, 0) / listed.length;
  return `every listed meet was incomplete, so the plain mean: ${r(mean)}`;
}

function deltaBadge(delta, digits = 0) {
  if (delta == null) return '';
  if (!delta) return '<span class="badge badge-flat"><span aria-hidden="true">–</span><span class="sr-only">no change</span></span>';
  const up = delta > 0;
  const n = Math.abs(delta).toFixed(digits).replace(/\.?0+$/, '');
  return `<span class="badge ${up ? 'badge-up' : 'badge-down'}">${icon(up ? 'arrowUp' : 'arrowDown')} ${n}</span>`;
}

function movementCell(dog) {
  const move = dog.movement;
  if (!move) return '';
  if (move.new) return `<span class="badge badge-new">${icon('star')} new</span>`;
  if (move.rank_breed_delta != null) return deltaBadge(move.rank_breed_delta);
  if (move.ytd_delta) return deltaBadge(move.ytd_delta, 2);
  return '<span class="badge badge-flat"><span aria-hidden="true">–</span><span class="sr-only">no change</span></span>';
}

/** Titles the points columns say this hound holds, as badges. */
function titleBadges(org, dog) {
  const spec = ORGS[org];
  const out = [];
  for (const [field, label, name] of spec.champion) {
    if ((dog[field] || 0) >= 12) out.push(`<span class="badge badge-t-fch" title="${name}">${label}</span>`);
  }
  for (const [, key, label, name] of spec.supreme) {
    const level = (dog.titled && dog.titled[key]) || 0;
    if (level > 0) {
      out.push(`<span class="badge badge-t-lcm" title="${name}">${label}${level > 1 ? level : ''}</span>`);
    }
  }
  return out.join(' ');
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

/** Sortable table head: the titles.html pattern, once. */
function sortableHead(columns, sort, extra = '') {
  return `<thead><tr>${columns.map(([key, label, cls]) =>
    `<th scope="col" class="sortable ${cls}" aria-sort="${
      sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}">
      <button type="button" class="th-btn" data-key="${key}">${label}${
        sort.key === key ? icon(sort.dir === 1 ? 'chevronUp' : 'chevronDown') : ''}</button></th>`).join('')}${extra}</tr></thead>`;
}

function sortRows(rows, columns, sort) {
  const col = columns.find(([key]) => key === sort.key) || columns[0];
  const key = col[0];
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string') return sort.dir * av.localeCompare(bv);
    return sort.dir * (av - bv) || (a.rank_breed ?? 1e9) - (b.rank_breed ?? 1e9);
  });
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

/* ----------------------------------------------------------- overview page */

function renderRacingOverview(org, feed, main) {
  const spec = ORGS[org];
  const season = feed.season;
  const stats = feed.stats;
  const dogs = feed.dogs.map((dog) => ({ ...dog, breed_lc: dog.breed.toLowerCase() }));
  const byId = new Map(dogs.map((dog) => [dog.id, dog]));
  const sections = feed.sections;
  const hasPrevious = Boolean(feed.previous_guide_date);
  const nouns = spec.nouns;

  document.title = `${spec.name} ${spec.program} standings — Gazehound Stats`;

  const tiles = [
    [stats.hounds_ytd, `${nouns} racing this year`],
    [stats.hounds_active, `${nouns} active since ${feed.active_since.slice(0, 4)}`],
    [stats.breeds_ytd, 'breeds racing this year'],
    [stats.meets_this_year, `meets this year`],
    ...(org === 'lgra'
      ? [[stats.titled_grc.toLocaleString('en-US'), 'GRC titled, all time']]
      : [[stats.titled_brc + stats.titled_mrc, 'BRC and MRC titled, all time']]),
  ];

  const rankedSections = sections.filter((s) => s.ytd > 0)
    .sort((a, b) => b.ytd - a.ytd || a.breed.localeCompare(b.breed));

  const standingsCards = rankedSections.map((section) => {
    const top = dogs.filter((dog) => dog.breed_slug === section.slug && dog.rank_breed)
      .sort((a, b) => a.rank_breed - b.rank_breed || a.call_name.localeCompare(b.call_name))
      .slice(0, 5);
    const wave = spec.waves[0][0];
    const grade = spec.waves[0][2];
    return `
      <div class="card">
        <div class="flex items-baseline justify-between gap-2">
          <h3 class="card-title mb-0"><a href="${racingBreedUrl(org, section.slug)}" class="hover:text-asfa-accent">${esc(section.breed)}</a></h3>
          <span class="text-xs text-asfa-text/60 whitespace-nowrap">${section.ytd} with points</span>
        </div>
        <div class="mt-3">${top.map((dog) => `
          <a href="${racingDogUrl(org, dog.id)}" class="flex items-baseline gap-2 py-1.5 border-b border-asfa-border last:border-0 hover:bg-asfa-bg2 -mx-1 px-1">
            <span class="font-display text-lg text-asfa-accent w-7 shrink-0">${dog.rank_breed}</span>
            <span class="font-semibold text-asfa-green truncate">${esc(dog.call_name)}</span>
            <span class="text-xs text-asfa-text/70 ml-auto whitespace-nowrap">${ptsLabel(dog.ytd)} pts${
              dog[wave] != null ? ` · ${gradeBadge(dog[grade])}` : ''}</span>
          </a>`).join('')}</div>
        ${section.ytd > 5 ? `<a href="${racingBreedUrl(org, section.slug)}" class="lnk text-sm inline-block mt-3">All ${section.ytd} →</a>` : ''}
      </div>`;
  }).join('');

  const allBreed = dogs.filter((dog) => dog.rank_all)
    .sort((a, b) => a.rank_all - b.rank_all || a.call_name.localeCompare(b.call_name))
    .slice(0, 20);

  // The hound at the top of each breed's standings, one line per breed.
  const leaders = sections.filter((s) => s.leader)
    .sort((a, b) => b.leader.ytd - a.leader.ytd || a.breed.localeCompare(b.breed));
  const leadersBoard = `
      <div class="card">
        <h2 class="card-title">Breed leaders</h2>
        <p class="text-xs text-asfa-text/60 mb-3">The ${spec.noun} at the top of each breed's standings, by ${spec.seasonLabel}.</p>
        ${leaders.length ? `<div class="tbl-wrap"><table class="tbl">
          <thead><tr><th scope="col">${spec.noun[0].toUpperCase() + spec.noun.slice(1)}</th><th scope="col">Breed</th><th scope="col" class="num">Points</th></tr></thead>
          <tbody>${leaders.map((section) => `
            <tr>
              <td><a href="${racingDogUrl(org, section.leader.id)}" class="lnk font-semibold">${esc(section.leader.call_name)}</a></td>
              <td><a href="${racingBreedUrl(org, section.slug)}" class="lnk">${esc(section.breed)}</a></td>
              <td class="num font-semibold text-asfa-accent">${ptsLabel(section.leader.ytd)}</td>
            </tr>`).join('')}</tbody>
        </table></div>` : `<p class="text-sm text-asfa-text/70">No ${nouns} have points yet this year.</p>`}
      </div>`;

  const careerBoards = spec.careers.map(([field, rankKey, label, supremeKey, supremeLabel]) => {
    const top = dogs.filter((dog) => dog[rankKey])
      .sort((a, b) => a[rankKey] - b[rankKey] || a.call_name.localeCompare(b.call_name))
      .slice(0, 10);
    return `
      <div class="card">
        <h2 class="card-title">${label}</h2>
        <p class="text-xs text-asfa-text/60 mb-3">All-time totals. Rank is against every ${spec.noun} ever registered; only ${nouns} still racing are listed, so retired ${nouns} hold the gaps. Thirty points make a ${supremeLabel}, sixty a ${supremeLabel}2, and so on.</p>
        ${top.length ? `<div class="tbl-wrap"><table class="tbl">
          <thead><tr><th scope="col" class="num">Rank</th><th scope="col">${spec.noun[0].toUpperCase() + spec.noun.slice(1)}</th><th scope="col">Breed</th><th scope="col" class="num">Points</th><th scope="col">Title</th></tr></thead>
          <tbody>${top.map((dog) => `
            <tr>
              <td class="num font-semibold">${dog[rankKey]}</td>
              <td><a href="${racingDogUrl(org, dog.id)}" class="lnk font-semibold">${esc(dog.call_name)}</a></td>
              <td class="text-asfa-text/80">${esc(dog.breed)}</td>
              <td class="num font-semibold text-asfa-accent">${ptsLabel(dog[field])}</td>
              <td>${dog.titled[supremeKey] ? `<span class="badge badge-t-lcm">${supremeLabel}${dog.titled[supremeKey] > 1 ? dog.titled[supremeKey] : ''}</span>` : ''}</td>
            </tr>`).join('')}</tbody>
        </table></div>` : `<p class="text-sm text-asfa-text/70">None recorded.</p>`}
      </div>`;
  }).join('');

  const newTitles = feed.titles_since_previous || [];
  const titlesBoard = hasPrevious ? `
      <div class="card">
        <h2 class="card-title">New titles since ${formatDate(feed.previous_guide_date)}</h2>
        <p class="text-xs text-asfa-text/60 mb-3">Read from the points columns of consecutive guides.</p>
        ${newTitles.length ? `<div class="tbl-wrap"><table class="tbl"><tbody>${newTitles.slice(0, 40).map((row) => `
          <tr><td><a href="${racingDogUrl(org, row.id)}" class="lnk font-semibold">${esc(row.call_name)}</a></td>
              <td class="text-asfa-text/80">${esc(row.breed)}</td>
              <td class="num"><span class="badge badge-t-fch">${esc(row.title)}</span></td></tr>`).join('')}</tbody></table></div>`
          : `<p class="text-sm text-asfa-text/70">No new titles between the two guides.</p>`}
      </div>` : '';

  main.innerHTML = `
    <div>
      <h1 class="font-display text-3xl text-asfa-text">${spec.name} ${spec.program}</h1>
      <p class="text-sm text-asfa-text/70 mt-1">
        ${season} standings from the grading guide dated ${formatDate(feed.guide_date)}, as published by
        <a href="${esc(feed.site_url)}" class="lnk" target="_blank" rel="noopener noreferrer">${esc(feed.site_url.replace(/^https?:\/\//, ''))}</a>.
      </p>
    </div>

    ${spec.photo ? `
    <figure class="hidden">
      <img src="${spec.photo.src}" alt="${esc(spec.photo.alt)}"
           class="w-full aspect-[3/1] object-cover ${spec.photo.position} border border-asfa-border"
           onload="this.parentElement.classList.remove('hidden')">
      ${spec.photo.credit ? `<figcaption class="text-right font-mono text-[10px] uppercase tracking-widest text-asfa-muted mt-1.5">${esc(spec.photo.credit)}</figcaption>` : ''}
    </figure>` : ''}

    <section id="overview" class="space-y-8">
    <section id="tiles" class="grid grid-cols-2 md:grid-cols-5 gap-3">
      ${tiles.map(([value, label]) =>
        `<div class="tile"><div class="tile-value">${value}</div><div class="tile-label">${label}</div></div>`).join('')}
    </section>

    <section class="grid md:grid-cols-3 gap-6">
      <div class="card md:row-span-2">
        <h2 class="card-title">All-breed standings</h2>
        <p class="text-xs text-asfa-text/60 mb-3">${spec.seasonLabel}, all breeds.</p>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th scope="col" class="num">Rank</th><th scope="col">${spec.noun[0].toUpperCase() + spec.noun.slice(1)}</th><th scope="col">Breed</th><th scope="col" class="num">Points</th></tr></thead>
          <tbody>${allBreed.map((dog) => `
            <tr>
              <td class="num font-semibold">${dog.rank_all}</td>
              <td><a href="${racingDogUrl(org, dog.id)}" class="lnk font-semibold">${esc(dog.call_name)}</a></td>
              <td class="text-asfa-text/80">${esc(dog.breed)}</td>
              <td class="num font-semibold text-asfa-accent">${ptsLabel(dog.ytd)}</td>
            </tr>`).join('')}</tbody>
        </table></div>
      </div>
      ${leadersBoard}
      ${careerBoards}
      ${titlesBoard}
    </section>
    </section>

    <section id="standings" class="space-y-4">
      <div>
        <h2 class="font-display text-2xl text-asfa-text">Standings by breed</h2>
        <p class="text-sm text-asfa-text/70 mt-1">Ranked by ${spec.seasonLabel}.</p>
      </div>
      ${rankedSections.length
        ? `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${standingsCards}</div>`
        : `<p class="text-sm text-asfa-text/70">No ${nouns} have points yet this year.</p>`}
    </section>

    <section id="browse" class="space-y-6">
    <div class="card">
      <h2 class="card-title">Browse by breed</h2>
      <p class="text-xs text-asfa-text/60 mb-3">
        ${nouns.charAt(0).toUpperCase() + nouns.slice(1)} active since ${formatDate(feed.active_since)}; the whole
        registry (${stats.hounds_registry.toLocaleString('en-US')} ${nouns}) is a click away below the table.
      </p>
      ${sections.length > 30 ? `
        <label class="block mb-3">
          <span class="sr-only">Breed</span>
          <select id="breed-select" class="select w-full sm:w-auto sm:min-w-[20rem] px-3 py-2"></select>
        </label>` : `
        <div id="breed-grid" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2"></div>`}
      <div id="table-panel" class="mt-4"></div>
    </div>

    <div class="card">
      <h2 class="card-title">Kennels</h2>
      <label class="block mb-3">
        <span class="sr-only">Search kennels by owner surname</span>
        <input id="owner-search" type="search" autocomplete="off" placeholder="Search ${feed.owners.length} kennels of active ${nouns} by surname…" class="w-full field px-3 py-2">
      </label>
      <div id="owner-table"></div>
      <p class="text-xs text-asfa-text/55 mt-3">
        Owner is the only ownership field the guide prints, so these are owning parties rather
        than kennel prefixes. A co-owned ${spec.noun} counts for every owner named on the row.
        Points are summed across breeds; treat the ${nouns} column as the sturdier measure.
      </p>
    </div>
    </section>

    <section id="about" class="space-y-6">${aboutRacing(org, feed)}</section>`;

  /* The nav's four entries are tabs: one section shows at a time, chosen by
     the hash, the way the ASFA side splits its pages. */
  const TABS = ['overview', 'standings', 'browse', 'about'];
  function showTab() {
    const wanted = location.hash.slice(1);
    const tab = TABS.includes(wanted) ? wanted : 'overview';
    TABS.forEach((id) => document.getElementById(id).classList.toggle('hidden', id !== tab));
    // After the browser's own jump to the anchor, and without the page's smooth
    // scrolling, so the page heading stays in view.
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'instant' }), 0);
  }
  showTab();
  window.addEventListener('hashchange', showTab);

  animateTiles(document.getElementById('tiles'));

  /* ----- browse: breed chips + sortable table, with the registry on demand */
  const grid = document.getElementById('breed-grid');
  const breedSelect = document.getElementById('breed-select');
  const panel = document.getElementById('table-panel');
  const sort = { key: 'rank_breed', dir: 1 };
  let registryDogs = null;
  let showAll = false;
  let currentSlug = null;
  let ownerKey = param('owner');

  const countLabel = (section) => section.ytd ? `${section.ytd} with points`
    : section.active ? `${section.active} active` : `${section.registry} all time`;

  /* AOK9 lists 118 breeds, most of them a dog or two: a dropdown, not a wall
     of chips. Breeds with points this year come first. */
  function paintGrid(activeSlug) {
    if (breedSelect) {
      const order = (a, b) => (b.ytd > 0) - (a.ytd > 0) || (b.active > 0) - (a.active > 0)
        || a.breed.localeCompare(b.breed);
      breedSelect.innerHTML = `<option value="">Choose a breed…</option>` + [...sections].sort(order)
        .map((section) => `<option value="${section.slug}" ${section.active === 0 ? 'disabled' : ''} ${
          section.slug === activeSlug ? 'selected' : ''}>${esc(section.breed)} · ${countLabel(section)}</option>`)
        .join('');
      breedSelect.value = activeSlug || '';
      return;
    }
    grid.innerHTML = sections.map((section) => {
      const active = section.slug === activeSlug;
      const disabled = section.active === 0;
      return `<button data-slug="${section.slug}" ${disabled ? 'disabled' : ''}
        class="chip text-sm ${active ? 'chip-selected' : ''}" aria-pressed="${active ? 'true' : 'false'}">
        <span class="block font-semibold leading-tight">${esc(section.breed)}</span>
        <span class="block text-xs text-asfa-muted">${countLabel(section)}</span>
      </button>`;
    }).join('');
    grid.querySelectorAll('button[data-slug]').forEach((button) => {
      button.addEventListener('click', () => select(button.dataset.slug));
    });
  }

  function rowsFor(slug) {
    if (ownerKey) {
      const owner = feed.owners.find((o) => o.key === ownerKey);
      return owner ? dogs.filter((dog) => owner.dog_ids.includes(dog.id)) : [];
    }
    const base = showAll && registryDogs ? registryDogs : dogs;
    return base.filter((dog) => dog.breed_slug === slug);
  }

  function paintTable() {
    const section = sections.find((s) => s.slug === currentSlug);
    const owner = ownerKey && feed.owners.find((o) => o.key === ownerKey);
    if (!section && !owner) { panel.innerHTML = ''; return; }
    const rows = sortRows(rowsFor(currentSlug), spec.browse, sort);
    const columns = owner ? [['breed', 'Breed', '', 1], ...spec.browse] : spec.browse;
    const heading = owner ? `Owned by ${esc(owner.name)}` : esc(section.breed);
    const subtitle = owner
      ? `${rows.length} active ${rows.length === 1 ? spec.noun : nouns}`
      : `${section.ytd} with points this year · ${section.active} active · ${section.registry} all time`;
    panel.innerHTML = `
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h3 class="font-display text-xl text-asfa-text">${heading}</h3>
        <p class="text-sm text-asfa-text/70">${subtitle}</p>
      </div>
      ${owner ? `<p class="text-sm mt-1"><a href="${spec.page}#browse" class="lnk" id="owner-clear">Back to breeds →</a></p>` : ''}
      <div class="tbl-wrap mt-3"><table class="tbl">
        ${sortableHead(columns, sort, hasPrevious ? '<th scope="col" class="num">Since</th>' : '')}
        <tbody>${rows.map((dog) => `
          <tr class="${dog.active === false ? 'text-asfa-text/60' : ''}">
            ${columns.map(([key, , cls]) => {
              if (key === 'call_name') return `<td><a href="${racingDogUrl(org, dog.id)}" class="lnk font-semibold">${esc(dog.call_name)}</a>${
                dog.active === false ? ' <span class="badge badge-flat">inactive</span>' : ''}</td>`;
              if (key === 'breed') return `<td><a href="${racingBreedUrl(org, dog.breed_slug)}" class="lnk">${esc(dog.breed)}</a></td>`;
              if (key === 'registered_name' || key === 'owner_raw') return `<td class="text-asfa-text/80">${esc(dog[key])}</td>`;
              if (key === 'last_raced') return `<td class="whitespace-nowrap">${dog.last_raced ? formatDateShort(dog.last_raced) : (dog.last_year ? dog.last_year : '—')}</td>`;
              if (key === 'rank_breed') return `<td class="num font-semibold">${dog.rank_breed ?? '—'}</td>`;
              if (key.endsWith('wave')) {
                const gradeField = spec.waves.find(([f]) => f === key)[2];
                return `<td class="num">${waveLabel(dog[key])} ${gradeBadge(dog[gradeField])}</td>`;
              }
              return `<td class="num ${key === 'ytd' ? 'font-semibold' : ''}">${ptsLabel(dog[key])}</td>`;
            }).join('')}
            ${hasPrevious ? `<td class="num">${movementCell(dog)}</td>` : ''}
          </tr>`).join('')}</tbody>
      </table></div>
      ${!owner && section ? `
        <p class="text-sm mt-3 no-print">
          ${showAll
            ? `Showing every ${esc(section.breed)} ever registered. <button type="button" id="registry-toggle" class="lnk">Active ${nouns} only</button>`
            : `<button type="button" id="registry-toggle" class="lnk">Show all ${section.registry} ${esc(section.breed)} ${nouns} ever registered</button>`}
        </p>` : ''}`;
    wireSort(panel, columns, sort, paintTable);
    const toggle = panel.querySelector('#registry-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        if (showAll) { showAll = false; paintTable(); return; }
        toggle.textContent = 'Loading the registry…';
        loadRegistry(org).then((all) => {
          const names = new Map(sections.map((s) => [s.slug, s.breed]));
          registryDogs = all.map((dog) => ({ ...dog, breed: names.get(dog.breed_slug) || dog.breed_slug }));
          showAll = true;
          paintTable();
        }).catch((error) => {
          console.error(error);
          toggle.textContent = 'The registry could not be loaded';
        });
      });
    }
    const clear = panel.querySelector('#owner-clear');
    if (clear) {
      clear.addEventListener('click', (event) => {
        event.preventDefault();
        ownerKey = null;
        select(currentSlug || (sections.find((s) => s.ytd) || sections[0]).slug);
      });
    }
  }

  function select(slug) {
    ownerKey = null;
    currentSlug = slug;
    const url = new URL(window.location);
    url.searchParams.set('breed', slug);
    url.searchParams.delete('owner');
    url.hash = '#browse';
    history.replaceState(null, '', url);
    paintGrid(slug);
    paintTable();
  }

  if (breedSelect) {
    breedSelect.addEventListener('change', () => {
      if (breedSelect.value) select(breedSelect.value);
    });
  }

  const requested = param('breed');
  const initial = sections.find((s) => s.slug === requested && s.active)
    || sections.find((s) => s.ytd) || sections.find((s) => s.active);
  currentSlug = initial ? initial.slug : null;
  paintGrid(currentSlug);
  paintTable();

  /* ----- owners */
  const ownerTable = document.getElementById('owner-table');
  const ownerSearch = document.getElementById('owner-search');
  const sumField = spec.careers[0][0];
  function paintOwners() {
    const needle = ownerSearch.value.trim().toLowerCase();
    const found = feed.owners.filter((o) => !needle || o.name.toLowerCase().includes(needle));
    const shown = found.slice(0, needle ? 200 : 25);
    ownerTable.innerHTML = shown.length ? `
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th scope="col">Kennel</th><th scope="col">Breeds</th><th scope="col" class="num">${nouns.charAt(0).toUpperCase() + nouns.slice(1)}</th>
          <th scope="col" class="num">This year</th><th scope="col" class="num">Career</th></tr></thead>
        <tbody>${shown.map((owner) => `
          <tr>
            <td><a href="${racingOwnerUrl(org, owner.key)}" class="lnk font-semibold" data-owner="${esc(owner.key)}">${esc(owner.name)}</a></td>
            <td class="text-asfa-text/75 text-xs">${owner.breeds.slice(0, 3).map(esc).join(', ')}${owner.breeds.length > 3 ? ` +${owner.breeds.length - 3}` : ''}</td>
            <td class="num">${owner.hounds}</td>
            <td class="num font-semibold">${ptsLabel(owner.ytd)}</td>
            <td class="num">${ptsLabel(owner[sumField])}</td>
          </tr>`).join('')}</tbody>
      </table></div>
      <p class="text-xs text-asfa-text/55 mt-2">${needle ? `${found.length} matching` : 'Top 25 by points this year'}; kennels with active ${nouns} only.</p>`
      : `<p class="text-sm text-asfa-text/70 py-3">No kennel matching “${esc(ownerSearch.value)}”. The guides print a surname, so try that on its own.</p>`;
    ownerTable.querySelectorAll('a[data-owner]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        ownerKey = link.dataset.owner;
        const url = new URL(window.location);
        url.searchParams.set('owner', ownerKey);
        url.searchParams.delete('breed');
        url.hash = '#browse';
        history.replaceState(null, '', url);
        paintGrid(null);
        paintTable();
        document.getElementById('browse').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }
  ownerSearch.addEventListener('input', paintOwners);
  paintOwners();
  if (ownerKey) { paintGrid(null); paintTable(); }
}

/* ------------------------------------------------------------- about text */

function pointsTable() {
  const rows = [
    ['2 – 4', '1', '0.5', '', ''], ['5 – 7', '2', '1', '', ''], ['8 – 10', '3', '1.5', '0.5', ''],
    ['11 – 15', '4', '2', '1', ''], ['16 – 21', '5', '3', '1.5', ''], ['22 – 30', '6', '4', '2', ''],
    ['31 – 40', '7', '5', '3', ''], ['41 or more', '8', '6', '4', '2'],
  ];
  return `
    <div class="tbl-wrap mt-2"><table class="tbl">
      <thead><tr><th scope="col">Eligible entry</th><th scope="col" class="num">High score</th><th scope="col" class="num">Second</th><th scope="col" class="num">Third</th><th scope="col" class="num">Fourth</th></tr></thead>
      <tbody>${rows.map((row) => `<tr>${row.map((cell, i) => `<td class="${i ? 'num' : ''}">${cell || '—'}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
}

function aboutRacing(org, feed) {
  const spec = ORGS[org];
  const common = `
    <section class="card">
      <h2 class="card-title">WAVE and grades</h2>
      <p class="text-sm leading-relaxed">
        WAVE is the weighted average of a ${spec.noun}'s last three completed meets, out of a
        possible 22 (three programs, up to 7⅓ points each, rounded by the registrar):
      </p>
      <p class="font-mono text-sm mt-2 p-3 bg-asfa-bg2 border border-asfa-border">
        WAVE = (meet 1 + 0.7 × meet 2 + 0.5 × meet 3) ÷ 2.2
      </p>
      <p class="text-sm leading-relaxed mt-2">
        with meet 1 the most recent. Two complete meets divide by 1.7; one is the score
        itself; a meet marked incomplete is skipped unless every listed meet is (rule 4.2.2).
        Race secretaries use the WAVE to seed the first program. The grade is a band on it:
        <strong>A</strong> 11 and up, <strong>B</strong> 8 to 10.999, <strong>C</strong> 5.5
        to 7.999, <strong>D</strong> below 5.5 (rule 4.2.2.5).
      </p>
      <p class="text-sm leading-relaxed mt-2">
        This site recomputes every WAVE from the three meets the guide lists and shows the
        registrar's published figure. The two agree for ${
          org === 'lgra' ? `${Math.round(feed.stats.wave_agreement * 100)}%` :
          `${Math.round(feed.stats.bwave_agreement * 100)}% (breed) and ${Math.round(feed.stats.mwave_agreement * 100)}% (mixed)`} of
        ${spec.nouns}; where they differ, a ${spec.noun}'s page says so, and the published
        figure governs.
      </p>
    </section>
    <section class="card">
      <h2 class="card-title">Points and titles</h2>
      <p class="text-sm leading-relaxed">
        At each meet the top four finishers earn championship points scaled to the number of
        eligible starters (${spec.rules}, chapter V). A ${spec.noun} that does not finish every
        race, finishes last, or beats nobody earns none.
      </p>
      ${pointsTable()}
      ${org === 'lgra' ? `
      <p class="text-sm leading-relaxed mt-3">
        <strong>GRC</strong>, Gazehound Racing Champion: 12 GRC points, which only untitled
        hounds can earn. <strong>National points</strong> use the same table, go to titled and
        untitled hounds alike, and are what the standings here rank; 30 of them make a
        <strong>SGRC</strong>, Superior Gazehound Racing Champion, with SGRC II, III and so on at
        each further 30. <strong>JSR</strong> and <strong>SSR</strong> merit titles are earned
        by legs and are not tracked in the guide; where an owner has added one to a registered
        name it appears as written.
      </p>` : `
      <p class="text-sm leading-relaxed mt-3">
        Dogs race in a <strong>breed division</strong> when enough of their breed enter, and
        otherwise in a <strong>mixed division</strong>, so each dog carries two records.
        <strong>BRC</strong> (Breed Racing Champion) is 12 points from breed divisions;
        <strong>MRC</strong> (Mixed Racing Champion) is 12 points of which at least 2 are from
        mixed divisions, a split the guide does not show. <strong>National points</strong> go to
        titled and untitled dogs alike and are what the standings here rank; every 30 in breed
        divisions make a <strong>SBRC</strong> (Supreme Breed Racing Champion) and every 30 in
        mixed divisions a <strong>SMRC</strong>, with II, III and so on. <strong>Turtle
        points</strong> go to the last-place finisher of a division, worth what first place was,
        and 30 make a <strong>STRC</strong>. The companion titles NSR, ESR and MSR (6, 12 and 30
        meets completed) are applied for by owners and are not in the guide.
      </p>`}
    </section>
    ${org === 'aok9' ? `
    <section class="card">
      <h2 class="card-title">Meet codes</h2>
      <p class="text-sm leading-relaxed">
        The guide names a meet by a code such as <span class="font-mono">2026-S22</span>: the
        year and the running number of the sanctioned sprint meet, with a letter when one meet
        ran several divisions. The guide gives no date for these; only the oldest rows carry
        the meet date itself.
      </p>
    </section>` : ''}
    <section class="card">
      <h2 class="card-title">What the guide cannot tell you</h2>
      <ul class="text-sm space-y-3">
        <li><strong>There is no race-by-race record.</strong> The guide keeps a ${spec.noun}'s last
          three meets and its running totals, nothing older and no times.</li>
        <li><strong>Points do not compare across breeds.</strong> A breed that fills a program
          most weekends offers far more of them than one that rarely races.</li>
        <li><strong>The registrar's figure governs.</strong> Where a WAVE or a title does not
          match the arithmetic, the guide is treated as right and this site says where it
          differs.</li>
        ${org === 'lgra' ? `
        <li><strong>Breed comes from the registration prefix</strong> (A-151 is an Afghan
          Hound, SW-802 a Silken Windhound); the guide's breed headers are checked against
          it.</li>` : `
        <li><strong>Breed is whatever the owner registered.</strong> The guide lists 118 breeds
          and a mixed-breed section; the site keeps the registrar's spelling.</li>`}
        <li><strong>Active</strong> here means a meet listed in ${feed.season - 1} or ${feed.season},
          or points this year. Every ${spec.noun} ever registered is in the registry behind
          the browse table.</li>
      </ul>
    </section>
    <section class="card">
      <h2 class="card-title">Where the numbers come from</h2>
      ${org === 'lgra' ? `
      <p class="text-sm leading-relaxed">
        The Large Gazehound Racing Association publishes one workbook, the
        <a href="https://lgra.club/grading-guide" class="lnk" target="_blank" rel="noopener noreferrer">grading guide</a>,
        that race secretaries use to seed the first program of a meet. Every hound ever registered
        is on it: its WAVE, its GRC points, its career and current-year National points, and the
        codes and scores of its last three meets. These pages are that workbook made searchable,
        with the arithmetic in the
        <a href="${esc(feed.rules_url)}" class="lnk" target="_blank" rel="noopener noreferrer">LGRA Rule Book</a>
        (release 23.2) applied to it.
      </p>
      <ul class="text-sm leading-relaxed list-disc pl-5 mt-2 space-y-1">
        <li><strong>Standings</strong> rank the guide's YTD column, this year's National points, within each breed and across breeds. LGRA's own year-end Top 10 lists rank the same figure.</li>
        <li><strong>Career standings</strong> rank career National points (the NGRC column) across every hound ever registered.</li>
        <li><strong>Titles</strong> are read from the points columns: 12 GRC points is a GRC, every 30 National points a further SGRC. The registrar's certificate is the record.</li>
        <li><strong>Breed</strong> comes from the registration prefix (A-151 is an Afghan Hound, SW-802 a Silken Windhound), checked against the guide's own headers.</li>
      </ul>` : `
      <p class="text-sm leading-relaxed">
        R.A.C.E.'s AOK9 program opens sprint racing to every breed. Its
        <a href="${esc(feed.source_page)}" class="lnk" target="_blank" rel="noopener noreferrer">sprint racing grading guide</a>
        is a public spreadsheet with two records per dog, one for breed divisions and one for
        mixed divisions, each with its own WAVE and championship points, plus National points,
        Turtle points and this year's points. These pages apply the
        <a href="${esc(feed.rules_url)}" class="lnk" target="_blank" rel="noopener noreferrer">AOK9 Sprint Racing Rule Book</a>
        (release 3.0) to it: standings on the YTD column, career standings on National Breed and
        National Mixed points, WAVE recomputed and compared, titles read from the points columns.
        The guide's date is read from the "updated" note beside its link. Only the sprint guide is
        covered; AOK9's oval, singles and lure coursing records are separate spreadsheets.
      </p>`}
      <p class="text-sm leading-relaxed mt-3">
        A parsed copy of each new guide is archived by date so movement between guides can be
        shown. The workbook's header rows, which carry the registrar's mailing details, are never
        copied, and the build fails if an email address, phone number or street address turns up
        anywhere in the published data. The whole method, code included, is on
        <a href="https://github.com/jackrabbit-project/stats" class="lnk" target="_blank" rel="noopener noreferrer">GitHub</a>.
      </p>
    </section>
    <section class="card" id="disclaimer">
      <h2 class="card-title">Disclaimer</h2>
      ${org === 'lgra' ? `
      <p class="text-sm leading-relaxed">
        These pages are an independent, unofficial project. They are <strong>not authorized,
        approved, or endorsed by the Large Gazehound Racing Association</strong>, and they are not
        an LGRA publication, service, or software. LGRA's name is used only to identify the source
        of the grading guide and the rule book cited here. The grading guide is LGRA's work and
        remains LGRA's property; it is reproduced with attribution and a link to the original.
        Wherever this site and the published guide disagree, <strong>the guide governs</strong>,
        and questions about a hound's record go to the LGRA Registrar/Recorder, not here.
      </p>` : `
      <p class="text-sm leading-relaxed">
        These pages are an independent, unofficial project. They are <strong>not authorized,
        approved, or endorsed by Racing and Coursing Enthusiasts (R.A.C.E.)</strong> or its AOK9
        program, and they are not an AOK9 publication, service, or software. The AOK9 name is
        used only to identify the source of the grading guide and the rule book cited here. The
        grading guide is R.A.C.E.'s work and remains its property; it is reproduced with
        attribution and a link to the original. Wherever this site and the published guide
        disagree, <strong>the guide governs</strong>, and questions about a dog's record go to
        the AOK9 National Racing Director, not here.
      </p>`}
      <p class="text-sm mt-3">
        Corrections: <a href="mailto:info@gazehound.io" class="lnk">info@gazehound.io</a>
      </p>
    </section>`;
  return common;
}

/* --------------------------------------------------------------- dog page */

function renderRacingDog(org, feed, main) {
  const spec = ORGS[org];
  const id = param('id');
  const active = feed.dogs.find((dog) => dog.id === id);

  const draw = (dog, fromRegistry) => {
    if (!dog.breed) {
      const section = feed.sections.find((s) => s.slug === dog.breed_slug);
      dog.breed = section ? section.breed : dog.breed_slug;
    }
    const meetsByStream = spec.streams.map(([field, label]) => [field, label, unpackMeets(feed, dog[field])]);
    const dq = unpackDq(feed, dog.dq);
    const primary = meetsByStream[0][2];
    const [waveField, waveTitle, gradeField] = spec.waves[0];

    document.title = `${dog.call_name} — ${dog.breed} — ${spec.name} — Gazehound Stats`;

    const move = dog.movement;
    let movementLine = '';
    if (move && !move.new) {
      const parts = [];
      const rank = move.rank_breed_delta;
      if (rank > 0) parts.push(`climbed ${rank} place${rank === 1 ? '' : 's'} in the breed`);
      else if (rank < 0) parts.push(`fell ${-rank} place${rank === -1 ? '' : 's'} in the breed`);
      if (move.ytd_delta) parts.push(`gained ${ptsLabel(move.ytd_delta)} point${move.ytd_delta === 1 ? '' : 's'} this year`);
      if (move.new_titles && move.new_titles.length) parts.push(`earned ${move.new_titles.join(', ')}`);
      if (parts.length) movementLine = `${parts.join(', ')} since the guide of ${formatDate(move.since)}`;
    } else if (move && move.new) {
      movementLine = `New to the guide since ${formatDate(move.since)}`;
    }

    const standing = dog.rank_breed
      ? `#${dog.rank_breed}`
      : '—';
    const standingContext = dog.rank_breed
      ? `in ${esc(dog.breed)} this year`
      : 'no points this year';

    const rankLine = dog.rank_breed
      ? `Ranked <strong>#${dog.rank_breed}</strong> of ${feed.sections.find((s) => s.slug === dog.breed_slug)?.ytd ?? '?'} ${esc(dog.breed)}
         ${spec.nouns} with points this year, and <strong>#${dog.rank_all}</strong> of ${feed.stats.hounds_ytd} across every breed,
         on <strong>${ptsLabel(dog.ytd)}</strong> ${spec.seasonLabel}.`
      : `No ${spec.seasonLabel} yet${dog.last_raced || dog.last_year ? `; last listed meet ${dog.last_raced ? formatDateShort(dog.last_raced) : dog.last_year}` : ''}.`;

    const ownersLine = dog.owners && dog.owners.length
      ? dog.owners.map((owner) => `<a href="${racingOwnerUrl(org, owner.key)}" class="lnk">${esc(owner.name)}</a>`).join(', ')
      : esc(dog.owner_raw);

    const titleProgress = [
      ...spec.champion.map(([field, label, name, need]) => progressBar(dog[field], need, `${label} · ${name}`)),
      ...spec.supreme.map(([field, key, label, name, step]) => {
        const level = Math.floor((dog[field] || 0) / step);
        const next = `${label}${level + 1 > 1 ? level + 1 : ''}`;
        const earned = level ? ` (${label}${level > 1 ? level : ''} earned)` : '';
        return progressBar(dog[field], (level + 1) * step, `${next} · ${name}${earned}`);
      }),
    ].join('');

    const meetTables = meetsByStream.map(([field, label, meets]) => {
      const complete = meets.filter((m) => m.complete && m.score != null);
      const weights = ['1', '0.7', '0.5'];
      let used = 0;
      return `
        <section class="card">
          <h2 class="card-title">${label}</h2>
          ${meets.length ? `
          <div class="tbl-wrap"><table class="tbl">
            <thead><tr><th scope="col">Meet</th><th scope="col">Code</th><th scope="col" class="num">Score</th><th scope="col">Counted</th></tr></thead>
            <tbody>${meets.map((meet) => {
              const counted = meet.complete && meet.score != null && (complete.length ? used < 3 : false);
              const weight = counted ? weights[used++] : null;
              return `
              <tr>
                <td class="whitespace-nowrap">${meetLabel(meet, org)}</td>
                <td class="font-mono text-xs">${esc(meet.code)}</td>
                <td class="num font-semibold">${ptsLabel(meet.score)}</td>
                <td>${meet.complete
                  ? (weight ? `× ${weight}` : '—')
                  : '<span class="badge badge-prov">incomplete</span> <span class="text-xs text-asfa-text/60">excluded, rule 4.2.2</span>'}</td>
              </tr>`;
            }).join('')}</tbody>
          </table></div>` : `<p class="text-sm text-asfa-text/70">No meets listed.</p>`}
        </section>`;
    }).join('');

    const waveCards = spec.waves.map(([field, title, gField], index) => {
      const meets = meetsByStream[index][2];
      const value = dog[field];
      const computed = dog[`${field}_computed`];
      const matches = dog[`${field}_matches`];
      return `
        <section class="card">
          <div class="flex flex-wrap items-baseline gap-3">
            <h2 class="card-title mb-0">${title}</h2>
            <span class="font-display text-3xl text-asfa-accent">${waveLabel(value)}</span>
            ${gradeBadge(dog[gField])}
          </div>
          ${value == null ? `<p class="text-sm text-asfa-text/70 mt-2">No ${title} on record.</p>` : waveBar(value)}
          ${meets.length ? `<p class="text-sm text-asfa-text/80 mt-2">From the last three meets: ${waveArithmetic(meets)}.</p>` : ''}
          ${value != null && matches === false && computed != null ? `
            <p class="text-xs text-asfa-text/65 mt-2">
              The guide publishes ${waveLabel(value)}; the three meets it lists compute to ${waveLabel(computed)}.
              The registrar's figure is the one shown and the one that seeds a meet.
            </p>` : ''}
        </section>`;
    }).join('');

    const breedMates = (feed.dogs.filter((d) => d.breed_slug === dog.breed_slug && d.rank_breed) || [])
      .sort((a, b) => a.rank_breed - b.rank_breed || a.call_name.localeCompare(b.call_name))
      .slice(0, 25);

    main.innerHTML = `
      <nav class="text-sm text-asfa-text/70">
        <a href="${spec.page}" class="lnk">${spec.name}</a> ›
        <a href="${racingBreedUrl(org, dog.breed_slug)}" class="lnk">${esc(dog.breed)}</a>
      </nav>

      <section class="card">
        <div class="flex flex-wrap items-start gap-4">
          <div class="text-center shrink-0 w-24">
            <div class="rank-pill">${standing}</div>
            <div class="text-xs uppercase tracking-widest text-asfa-text/60 mt-1">${standingContext}</div>
          </div>
          <div class="flex-1 min-w-[16rem]">
            <h1 class="font-display text-3xl text-asfa-text leading-tight">${esc(dog.call_name)}</h1>
            <p class="text-asfa-text/85">${esc(dog.registered_name)}</p>
            ${titleBadges(org, dog) ? `<p class="text-xs text-asfa-text/70 mt-1">Titles by the points columns: ${titleBadges(org, dog)}</p>` : ''}
            <p class="text-sm text-asfa-text/70 mt-1">
              <a href="${racingBreedUrl(org, dog.breed_slug)}" class="lnk">${esc(dog.breed)}</a>
              · <span class="font-mono text-xs">${esc(dog.duplicate_of || dog.id)}</span>${
                dog.duplicate_of ? ` <span class="text-xs">(a number the guide lists twice)</span>` : ''}
              ${fromRegistry ? ' · <span class="badge badge-flat">inactive</span>' : ''}
            </p>
            <p class="text-sm mt-1">Owned by ${ownersLine}</p>
            ${dog.note ? `<p class="text-xs text-asfa-text/65 mt-1">Registrar's note: ${esc(dog.note)}</p>` : ''}
            ${movementLine ? `<p class="text-sm mt-2">${movementCell(dog)} <span class="text-asfa-text/70">${esc(movementLine)}</span></p>` : ''}
          </div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-${Math.min(4, spec.tiles(dog).length)} gap-3 mt-5">
          ${spec.tiles(dog).map(([value, label]) =>
            `<div class="tile"><div class="tile-value">${value}</div><div class="tile-label">${label}</div></div>`).join('')}
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">Standing</h2>
        <p class="text-sm">${rankLine}</p>
        ${dog.rank_career || dog.rank_career_breed ? `<p class="text-sm mt-2">Career: ${spec.careers.map(([field, rankKey, label]) =>
          dog[rankKey] ? `<strong>#${dog[rankKey]}</strong> of every ${spec.noun} ever registered on ${ptsLabel(dog[field])} ${label.replace('Career ', '')}` : null
        ).filter(Boolean).join('; ')}.</p>` : ''}
      </section>

      ${waveCards}

      <section class="card">
        <h2 class="card-title">Progress toward titles</h2>
        <p class="text-xs text-asfa-text/60">Read from the points columns; the ${spec.name} registrar's certificate is the record.</p>
        ${titleProgress}
      </section>

      ${meetTables}

      <section class="card">
        <h2 class="card-title">Disqualifications</h2>
        ${dq.length ? `<p class="text-sm">${dq.map((d) => `<span class="font-mono text-xs">${esc(d.code)}</span>${d.date ? ` (${formatDateShort(d.date)})` : ''}`).join(', ')}</p>`
          : `<p class="text-sm text-asfa-text/70">None recorded.</p>`}
      </section>

      ${breedMates.length ? `
      <section class="card">
        <h2 class="card-title">${esc(dog.breed)} standings this year</h2>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th scope="col" class="num">Rank</th><th scope="col">${spec.noun.charAt(0).toUpperCase() + spec.noun.slice(1)}</th><th scope="col">Owner</th>
            <th scope="col" class="num">Points</th><th scope="col" class="num">${waveTitle}</th></tr></thead>
          <tbody>${breedMates.map((other) => `
            <tr class="${other.id === dog.id ? 'bg-asfa-bg2 font-semibold' : ''}">
              <td class="num">${other.rank_breed}</td>
              <td>${other.id === dog.id ? esc(other.call_name) : `<a href="${racingDogUrl(org, other.id)}" class="lnk">${esc(other.call_name)}</a>`}</td>
              <td class="text-asfa-text/80">${esc(other.owner_raw)}</td>
              <td class="num">${ptsLabel(other.ytd)}</td>
              <td class="num">${waveLabel(other[waveField])} ${gradeBadge(other[gradeField])}</td>
            </tr>`).join('')}</tbody>
        </table></div>
      </section>` : ''}

      <p class="text-xs text-asfa-text/55">
        Figures as published in the ${spec.name} grading guide dated ${formatDate(feed.guide_date)}.
        <a href="${spec.page}#about" class="lnk">What the columns mean</a>.
      </p>`;
  };

  if (active) { draw(active, false); return; }

  main.innerHTML = `<div class="card"><p class="text-sm text-asfa-text/70">Looking up ${esc(id || '')} in the ${spec.name} registry…</p></div>`;
  loadRegistry(org).then((all) => {
    const found = all.find((dog) => dog.id === id);
    if (!found) {
      main.innerHTML = `<div class="card">
        <h1 class="card-title">${spec.noun.charAt(0).toUpperCase() + spec.noun.slice(1)} not found</h1>
        <p class="text-sm">No ${spec.noun} in the ${spec.name} grading guide matches
        <code>${esc(id || '(no id given)')}</code>.</p>
        <p class="text-sm mt-2"><a href="${spec.page}#browse" class="lnk">Browse by breed →</a></p>
      </div>`;
      return;
    }
    draw(found, true);
  }).catch((error) => {
    console.error(error);
    showFailure('Registry unavailable', `Could not load data/${org}-registry.json: ${error.message}`,
      'Try again in a moment.');
  });
}
