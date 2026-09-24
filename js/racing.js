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
    calendar: 'https://lgra.club/calendar',
  },
  aok9: {
    key: 'aok9',
    name: 'AOK9',
    fullName: 'AOK9 program of Racing and Coursing Enthusiasts (R.A.C.E.)',
    program: 'sprint racing',
    page: 'aok9.html',
    noun: 'dog', nouns: 'dogs',
    waves: [['bwave', 'Breed WAVE', 'bgrade'], ['mwave', 'Mixed WAVE', 'mgrade']],
    seasonLabel: 'National points this year',
    careers: [
      ['nbrc', 'rank_career_breed', 'Career National Breed points', 'sbrc', 'SBRC'],
      ['nmrc', 'rank_career_mixed', 'Career National Mixed points', 'smrc', 'SMRC'],
    ],
    // [field, label, name, need, rule?]. MRC (Sprint Rule Book 3.0 §5.3) is
    // 12 points from both columns with at least 2 of them MRC, so it carries
    // its own value and done rules; the others are field >= need.
    champion: [
      ['brc', 'BRC', 'Breed Racing Champion', 12],
      ['mrc', 'MRC', 'Mixed Racing Champion', 12, {
        value: (dog) => (dog.brc || 0) + (dog.mrc || 0),
        done: (dog) => (dog.brc || 0) + (dog.mrc || 0) >= 12 && (dog.mrc || 0) >= 2,
        note: 'BRC and MRC points together, at least 2 of them MRC',
      }],
      ['trc', 'TRC', 'Turtle Racing Champion', 12],
    ],
    supreme: [
      ['nbrc', 'sbrc', 'SBRC', 'Supreme Breed Racing Champion', 30],
      ['nmrc', 'smrc', 'SMRC', 'Supreme Mixed Racing Champion', 30],
      ['trc', 'strc', 'STRC', 'Supreme Turtle Racing Champion', 30],
    ],
    tiles: (dog) => [
      [ptsLabel(dog.ytd), 'National points this year'],
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
    calendar: 'https://aok9racing.com/calendar.html',
  },
};

/* ---------------------------------------------------------------- helpers */

function racingBreedUrl(org, slug) {
  return `${org}.html?breed=${encodeURIComponent(slug)}#browse`;
}

function racingOwnerUrl(org, key) {
  return `${org}.html?owner=${encodeURIComponent(key)}#kennels`;
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

function progressBar(value, need, label, opts = {}) {
  const done = opts.done !== undefined ? opts.done : (value || 0) >= need;
  const pct = Math.max(0, Math.min(100, ((value || 0) / need) * 100));
  return `
    <div class="mt-3">
      <div class="flex justify-between text-sm">
        <span class="font-semibold">${label}</span>
        <span class="text-asfa-text/70">${ptsLabel(value || 0)} / ${need}${done ? ' · earned' : ''}</span>
      </div>
      ${opts.note ? `<p class="text-xs text-asfa-text/60">${opts.note}</p>` : ''}
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
  for (const [field, label, name, need, rule] of spec.champion) {
    const earned = rule ? rule.done(dog) : (dog[field] || 0) >= need;
    if (earned) out.push(`<span class="badge badge-t-fch" title="${name}">${label}</span>`);
  }
  for (const [, key, label, name] of spec.supreme) {
    const level = (dog.titled && dog.titled[key]) || 0;
    if (level > 0) {
      out.push(`<span class="badge badge-t-lcm" title="${name}">${label}${level > 1 ? level : ''}</span>`);
    }
  }
  return out.join(' ');
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

function renderRacingOverview(org, feed, main, singles = null) {
  const spec = ORGS[org];
  const season = feed.season;
  const stats = feed.stats;
  const dogs = feed.dogs.map((dog) => ({ ...dog, breed_lc: dog.breed.toLowerCase() }));
  const byId = new Map(dogs.map((dog) => [dog.id, dog]));
  const sections = feed.sections;
  const hasPrevious = Boolean(feed.previous_guide_date);
  const nouns = spec.nouns;

  document.title = `${spec.name} ${spec.program} standings — Gazehound Stats`;

  // Singles runs at the same AOK9 meets, so its dogs and meets count in the
  // program's totals; the Singles feed carries the combined figures.
  const combined = singles && singles.combined;
  const tiles = [
    [combined ? combined.dogs_raced : stats.hounds_raced, `${nouns} racing this year`],
    [stats.hounds_ytd, `${nouns} with points this year`],
    [combined ? combined.breeds_raced : stats.breeds_raced, 'breeds racing this year'],
    [combined ? combined.meets_this_year : stats.meets_this_year, `meets this year`],
    ...(org === 'lgra'
      ? [[stats.titled_grc.toLocaleString('en-US'), 'GRC titled, all time']]
      : [[stats.titled_champion, 'BRC or MRC titled, all time']]),
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
        <a href="${spec.page}#standings" class="lnk text-sm inline-block mt-3">Full standings by breed →</a>
      </div>`;

  // With two career streams (AOK9) the boards stack in one column, so each
  // is shorter; LGRA's single board keeps ten rows.
  const careerRows = spec.careers.length > 1 ? 5 : 10;
  const careerBoards = spec.careers.map(([field, rankKey, label, supremeKey, supremeLabel]) => {
    const top = dogs.filter((dog) => dog[rankKey])
      .sort((a, b) => a[rankKey] - b[rankKey] || a.call_name.localeCompare(b.call_name))
      .slice(0, careerRows);
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
        <a href="${spec.calendar}" class="lnk whitespace-nowrap" target="_blank" rel="noopener noreferrer">${spec.name} race calendar →</a>
      </p>
    </div>


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
      ${spec.careers.length > 1 ? `<div class="space-y-6">${careerBoards}</div>` : careerBoards}
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
    </section>

    <section id="kennels" class="space-y-6">
    <div id="kennel-focus" class="hidden space-y-6"></div>
    <div id="kennel-list" class="card">
      <h2 class="card-title">Kennels</h2>
      <label class="block mb-3">
        <span class="sr-only">Search kennels by owner surname</span>
        <input id="owner-search" type="search" autocomplete="off" placeholder="Search ${feed.owners.length} kennels of active ${nouns} by surname…" class="w-full field px-3 py-2">
      </label>
      <div id="owner-table"></div>
      <p class="text-xs text-asfa-text/55 mt-3">
        The guide prints a surname and nothing else, so a kennel here is a surname within a
        breed: two Joneses racing Pharaoh Hounds share a line, and one owner racing two breeds
        gets two. A co-owned ${spec.noun} counts for every surname on its row.
      </p>
    </div>
    </section>

    ${org === 'aok9' ? '<section id="singles" class="space-y-6"></section>' : ''}

    <section id="about" class="space-y-6">${aboutRacing(org, feed, singles)}</section>`;

  /* The nav's entries are tabs: one section shows at a time, chosen by the
     hash, the way the ASFA side splits its pages. AOK9 adds Singles. */
  const TABS = ['overview', 'standings', 'browse', 'kennels',
    ...(org === 'aok9' ? ['singles'] : []), 'about'];
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
        .map((section) => `<option value="${section.slug}" ${
          section.slug === activeSlug ? 'selected' : ''}>${esc(section.breed)} · ${countLabel(section)}</option>`)
        .join('');
      breedSelect.value = activeSlug || '';
      return;
    }
    grid.innerHTML = sections.map((section) => {
      const active = section.slug === activeSlug;
      return `<button data-slug="${section.slug}"
        class="chip text-sm ${active ? 'chip-selected' : ''} ${section.active ? '' : 'text-asfa-text/60'}" aria-pressed="${active ? 'true' : 'false'}">
        <span class="block font-semibold leading-tight">${esc(section.breed)}</span>
        <span class="block text-xs text-asfa-muted">${countLabel(section)}</span>
      </button>`;
    }).join('');
    grid.querySelectorAll('button[data-slug]').forEach((button) => {
      button.addEventListener('click', () => select(button.dataset.slug));
    });
  }

  function rowsFor(slug) {
    const section = sections.find((s) => s.slug === slug);
    // A breed with nobody active (the four Taigans, last raced 2023) has
    // nothing in the feed; its registry is the only thing worth showing.
    const wantAll = showAll || (section && section.active === 0);
    const base = wantAll && registryDogs ? registryDogs : dogs;
    return base.filter((dog) => dog.breed_slug === slug);
  }

  function loadRegistryThen(after) {
    loadRegistry(org).then((all) => {
      const names = new Map(sections.map((s) => [s.slug, s.breed]));
      registryDogs = all.map((dog) => ({ ...dog, breed: names.get(dog.breed_slug) || dog.breed_slug }));
      after();
    }).catch((error) => {
      console.error(error);
      const note = panel.querySelector('#registry-note');
      if (note) note.textContent = 'The registry could not be loaded.';
    });
  }

  // Sprint dogs that also race Singles lately carry a small badge to their
  // Singles record; the two tables stay apart.
  const singlesIds = new Set(singles ? singles.dogs.filter((d) => d.sprint && d.active).map((d) => d.id) : []);

  /* One table row, shared by the breed table and a kennel's hound list. */
  function browseRow(dog, columns) {
    return `
          <tr class="${dog.active === false ? 'text-asfa-text/60' : ''}">
            ${columns.map(([key, , cls]) => {
              if (key === 'call_name') return `<td><a href="${racingDogUrl(org, dog.id)}" class="lnk font-semibold">${esc(dog.call_name)}</a>${
                dog.active === false ? ' <span class="badge badge-flat">inactive</span>' : ''}${
                singlesIds.has(dog.id) ? ` <a href="${racingDogUrl(org, dog.id)}#singles" class="badge badge-flat" title="Also races Singles">Singles</a>` : ''}</td>`;
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
          </tr>`;
  }

  function paintTable() {
    const section = sections.find((s) => s.slug === currentSlug);
    if (!section) { panel.innerHTML = ''; return; }
    const registryOnly = section.active === 0;
    if (registryOnly && !registryDogs) {
      panel.innerHTML = `
        <h3 class="font-display text-xl text-asfa-text">${esc(section.breed)}</h3>
        <p class="text-sm text-asfa-text/70 mt-1" id="registry-note">Loading the registry…</p>`;
      loadRegistryThen(paintTable);
      return;
    }
    const rows = sortRows(rowsFor(currentSlug), spec.browse, sort);
    const columns = spec.browse;
    panel.innerHTML = `
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h3 class="font-display text-xl text-asfa-text">${esc(section.breed)}</h3>
        <p class="text-sm text-asfa-text/70">${section.ytd} with points this year · ${section.active} active · ${section.registry} all time</p>
      </div>
      <div class="tbl-wrap mt-3"><table class="tbl">
        ${sortableHead(columns, sort, hasPrevious ? '<th scope="col" class="num">Since</th>' : '')}
        <tbody>${rows.map((dog) => browseRow(dog, columns)).join('')}</tbody>
      </table></div>
      ${registryOnly ? `
        <p class="text-sm mt-3 text-asfa-text/70">
          No ${esc(section.breed)} has raced since ${feed.active_since.slice(0, 4)}; every
          ${esc(section.breed)} ever registered is shown.
        </p>` : `
        <p class="text-sm mt-3 no-print">
          ${showAll
            ? `Showing every ${esc(section.breed)} ever registered. <button type="button" id="registry-toggle" class="lnk">Active ${nouns} only</button>`
            : `<button type="button" id="registry-toggle" class="lnk">Show all ${section.registry} ${esc(section.breed)} ${nouns} ever registered</button>`}
        </p>`}`;
    wireSort(panel, columns, sort, paintTable);
    const toggle = panel.querySelector('#registry-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        if (showAll) { showAll = false; paintTable(); return; }
        toggle.textContent = 'Loading the registry…';
        loadRegistryThen(() => { showAll = true; paintTable(); });
      });
    }
  }

  function select(slug) {
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
  const initial = sections.find((s) => s.slug === requested)
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
        <thead><tr><th scope="col">Kennel</th><th scope="col">Breed</th><th scope="col" class="num">${nouns.charAt(0).toUpperCase() + nouns.slice(1)}</th>
          <th scope="col" class="num">This year</th><th scope="col" class="num">Career</th></tr></thead>
        <tbody>${shown.map((owner) => `
          <tr>
            <td><a href="${racingOwnerUrl(org, owner.key)}" class="lnk font-semibold" data-owner="${esc(owner.key)}">${esc(owner.name)}</a></td>
            <td><a href="${racingBreedUrl(org, owner.breed_slug)}" class="lnk">${esc(owner.breed)}</a></td>
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
        url.hash = '#kennels';
        history.replaceState(null, '', url);
        paintKennel();
        window.scrollTo({ top: 0, behavior: 'instant' });
      });
    });
  }

  /* One kennel, the way the ASFA kennels page shows one: its card, then its
     hounds as a sortable table, in place of the kennel list. */
  const kennelFocus = document.getElementById('kennel-focus');
  const kennelList = document.getElementById('kennel-list');
  const kennelSort = { key: 'ytd', dir: -1 };
  const [waveField, waveTitle] = spec.waves[0];
  const careerLabel = spec.careers[0][2].replace(/^Career /, 'career ');
  function paintKennel() {
    const owner = ownerKey && feed.owners.find((o) => o.key === ownerKey);
    kennelFocus.classList.toggle('hidden', !owner);
    kennelList.classList.toggle('hidden', !!owner);
    if (!owner) { kennelFocus.innerHTML = ''; return; }
    const columns = spec.browse;
    const rows = sortRows(dogs.filter((dog) => owner.dog_ids.includes(dog.id)), columns, kennelSort);
    kennelFocus.innerHTML = `
      <nav class="text-sm text-asfa-text/70"><a href="${spec.page}#kennels" class="lnk" id="kennel-back">Kennels</a> › ${esc(owner.name)}</nav>
      <section class="card">
        <h2 class="card-title">${esc(owner.name)}</h2>
        <p class="text-sm text-asfa-text/70"><a href="${racingBreedUrl(org, owner.breed_slug)}" class="lnk">${esc(owner.breed)}</a></p>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <div class="tile"><div class="tile-value">${owner.hounds}</div><div class="tile-label">active ${owner.hounds === 1 ? spec.noun : nouns}</div></div>
          <div class="tile"><div class="tile-value">${ptsLabel(owner.ytd)}</div><div class="tile-label">${spec.seasonLabel}</div></div>
          <div class="tile"><div class="tile-value">${ptsLabel(owner[sumField])}</div><div class="tile-label">${careerLabel}</div></div>
          <div class="tile"><div class="tile-value">${waveLabel(owner[`best_${waveField}`])}</div><div class="tile-label">best ${waveTitle}</div></div>
        </div>
      </section>
      <section class="card">
        <h2 class="card-title">${nouns.charAt(0).toUpperCase() + nouns.slice(1)}</h2>
        <div class="tbl-wrap"><table class="tbl">
          ${sortableHead(columns, kennelSort, hasPrevious ? '<th scope="col" class="num">Since</th>' : '')}
          <tbody>${rows.map((dog) => browseRow(dog, columns)).join('')}</tbody>
        </table></div>
        <p class="text-xs text-asfa-text/55 mt-3">
          A co-owned ${spec.noun} is listed under every surname on its guide row, so totals
          across kennels add to more than the breed total.
        </p>
      </section>`;
    wireSort(kennelFocus, columns, kennelSort, paintKennel);
    kennelFocus.querySelector('#kennel-back').addEventListener('click', (event) => {
      event.preventDefault();
      ownerKey = null;
      const url = new URL(window.location);
      url.searchParams.delete('owner');
      url.hash = '#kennels';
      history.replaceState(null, '', url);
      paintKennel();
    });
  }
  ownerSearch.addEventListener('input', paintOwners);
  paintOwners();
  paintKennel();

  if (org === 'aok9') renderSinglesTab(singles, document.getElementById('singles'));
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

function aboutRacing(org, feed, singles = null) {
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
        eligible starters.
      </p>
      ${pointsTable()}
      ${org === 'lgra' ? `
      <p class="text-sm leading-relaxed mt-3">
        <strong>GRC</strong>, Gazehound Racing Champion: 12 GRC points, which only untitled
        hounds can earn. <strong>National points</strong> use the same table, go to titled and
        untitled hounds alike, and are what the standings here rank; 30 of them make a
        <strong>SGRC</strong>, Superior Gazehound Racing Champion, with SGRC II, III and so on at
        each further 30. <strong>JSR</strong> and <strong>SSR</strong> merit titles are earned
        by legs and are not tracked in the guide.
      </p>` : `
      <p class="text-sm leading-relaxed mt-3">
        Dogs race in a <strong>breed division</strong> when enough of their breed enter, and
        otherwise in a <strong>mixed division</strong>, so each dog carries two records.
        Championship points come from the table above and only untitled dogs earn them:
        <strong>BRC</strong> (Breed Racing Champion) is 12 BRC points from breed divisions;
        <strong>MRC</strong> (Mixed Racing Champion) is 12 BRC and MRC points together, at
        least 2 of them MRC. <strong>National points</strong> use the same table for the same
        placings, go to titled and untitled dogs alike, and never stop: National Breed points
        from breed divisions, National Mixed points from mixed divisions. The two together,
        earned this season, are the National points the standings here rank. Every 30 National
        Breed points make a <strong>SBRC</strong> (Supreme Breed Racing Champion) and every 30
        National Mixed points a <strong>SMRC</strong>, with II, III and so on. <strong>Turtle
        points</strong> go to the last-place finisher of a division, worth what first place was;
        12 make a <strong>TRC</strong> (Turtle Racing Champion) and 30 a <strong>STRC</strong>.
      </p>`}
    </section>
    <section class="card">
      <h2 class="card-title">What the guide cannot tell you</h2>
      <ul class="text-sm space-y-3">
        <li><strong>There is no race-by-race record.</strong> The guide keeps a ${spec.noun}'s last
          three meets and its running totals, nothing older and no times.</li>
        <li><strong>Points do not compare across breeds.</strong> A breed that fills a program
          most weekends offers far more of them than one that rarely races.</li>
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
        codes and scores of its last three meets. The arithmetic follows the
        <a href="${esc(feed.rules_url)}" class="lnk" target="_blank" rel="noopener noreferrer">LGRA Rule Book</a>
        (release 23.2).
      </p>
      <ul class="text-sm leading-relaxed list-disc pl-5 mt-2 space-y-1">
        <li><strong>Standings</strong> rank the guide's YTD column, this year's National points, within each breed and across breeds. LGRA's own year-end Top 10 lists rank the same figure.</li>
        <li><strong>Career standings</strong> rank career National points (the NGRC column) across every hound ever registered.</li>
        <li><strong>Titles</strong> are read from the points columns: 12 GRC points is a GRC, every 30 National points a further SGRC. The registrar's certificate is the record.</li>
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
        The guide's date is read from the "updated" note beside its link.
      </p>
      <p class="text-sm leading-relaxed mt-3">
        The <a href="https://docs.google.com/spreadsheets/d/155bMTO-jx1Az8RrYc05mS-rYTB7CPLOnFoTJzMf-Imw/edit?usp=sharing" class="lnk" target="_blank" rel="noopener noreferrer">Singles sprint records</a>
        are a separate spreadsheet with their own <a href="aok9.html#singles" class="lnk">Singles</a> tab.
        Singles runs at the same meets as the regular stakes, so ${singles
          ? `the dogs, breeds and meets counted this year include it: ${singles.combined.dogs_raced} dogs where the sprint guide alone lists ${feed.stats.hounds_raced}`
          : 'the dogs, breeds and meets counted this year include it when its records load'}.
        AOK9's oval and lure coursing records are not covered.
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

function renderRacingDog(org, feed, main, singles = null) {
  const spec = ORGS[org];
  const id = param('id');
  const active = feed.dogs.find((dog) => dog.id === id);
  const sdog = singles ? singles.dogs.find((dog) => dog.id === id) : null;

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
      ? dog.owners.map((owner) => `<a href="${racingOwnerUrl(org, `${owner.key}|${dog.breed_slug}`)}" class="lnk">${esc(owner.name)}</a>`).join(', ')
      : esc(dog.owner_raw);

    const titleProgress = [
      ...spec.champion.map(([field, label, name, need, rule]) => progressBar(
        rule ? rule.value(dog) : dog[field], need, `${label} · ${name}`,
        rule ? { done: rule.done(dog), note: rule.note } : {})),
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
          ${hasCardRecord(org, dog) ? cardButton() : ''}
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

      ${sdog ? `
      <div id="singles" class="space-y-6 pt-2">
        <div>
          <h2 class="font-display text-2xl text-asfa-text">Singles</h2>
          <p class="text-sm text-asfa-text/70 mt-1">${esc(dog.call_name)} also races Singles: alone on the track, timed, and placed against the other dogs of its division at each meet.</p>
          ${singlesNumberNote(sdog) ? `<p class="text-xs text-asfa-text/65 mt-1">${singlesNumberNote(sdog)}</p>` : ''}
          ${typeof openRacingCard === 'function' && (sdog.pb != null || sdog.average != null)
            ? `<button type="button" id="singles-card-btn" class="btn mt-3 no-print">${icon('share', 'mr-1')}Singles stat card</button>` : ''}
        </div>
        ${singlesSummaryCard(sdog)}
        ${singlesCards(sdog, singles)}
      </div>` : ''}

      <p class="text-xs text-asfa-text/55">
        Figures as published in the ${spec.name} grading guide dated ${formatDate(feed.guide_date)}${
          sdog ? ` and the Singles sprint records dated ${formatDate(singles.guide_date)}` : ''}.
        <a href="${spec.page}#about" class="lnk">What the columns mean</a>.
      </p>`;
    const cardBtn = main.querySelector('#card-btn');
    if (cardBtn) cardBtn.addEventListener('click', () => openRacingCard(racingCardSpec(org, dog, feed, sdog, singles)));
    const singlesBtn = main.querySelector('#singles-card-btn');
    if (singlesBtn) singlesBtn.addEventListener('click', () => openRacingCard(singlesCardSpec(sdog, singles)));
  };

  if (active) { draw(active, false); return; }
  // A Singles dog the sprint guide does not know: its Singles record is its page.
  if (sdog && !sdog.sprint) { renderSinglesDog(sdog, singles, main); return; }

  main.innerHTML = `<div class="card"><p class="text-sm text-asfa-text/70">Looking up ${esc(id || '')} in the ${spec.name} registry…</p></div>`;
  loadRegistry(org).then((all) => {
    const found = all.find((dog) => dog.id === id);
    // Listed in the sprint guide with nothing raced there: a Singles dog.
    if (sdog && (!found || !hasSprintRecord(found))) { renderSinglesDog(sdog, singles, main); return; }
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

/* ------------------------------------------------------------- AOK9 Singles */

/* Singles is AOK9's stake for dogs that cannot run in company (Singles Racing
   Rule Book 1.0). Each dog runs alone and is timed, and at each meet it is
   placed against the other dogs of its division; only placings earn points.
   The sheet keeps each dog's last three timed runs and their average, the
   figure heats are drawn from. Tracks run 150 to 300 yards and times from
   different tracks do not compare, so nothing here ranks dogs by time. */

function timeLabel(value) {
  if (value == null) return '—';
  return `${(Math.round(value * 100) / 100).toFixed(2)} s`;
}

function romanLevel(n) {
  const numerals = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  return numerals[n] || String(n);
}

/** Whether the sprint guide holds any racing for this dog at all. */
function hasSprintRecord(dog) {
  if ((dog.meets_breed && dog.meets_breed.length) || (dog.meets_mixed && dog.meets_mixed.length)) return true;
  return ['brc', 'nbrc', 'mrc', 'nmrc', 'trc', 'ytd'].some((field) => (dog[field] || 0) > 0);
}

/** Newest listed run first: the year, then the sanctioned-meet number, then
    the date the oldest rows carry instead. */
function runKey(code, year, date) {
  const seq = Number((/-S(\d+)/.exec(code || '') || [])[1] || 0);
  return `${String(year || 0).padStart(4, '0')}-${String(seq).padStart(3, '0')}-${date || ''}`;
}

function singlesRecencyKey(sdog) {
  return sdog.meets.reduce((best, [code, year, date]) => {
    const key = runKey(code, year, date);
    return key > best ? key : best;
  }, '');
}

function byRecency(a, b) {
  const ka = singlesRecencyKey(a);
  const kb = singlesRecencyKey(b);
  return ka < kb ? 1 : ka > kb ? -1 : a.call_name.localeCompare(b.call_name);
}

function singlesLastRun(sfeed, sdog) {
  const runs = unpackMeets(sfeed, sdog.meets);
  if (!runs.length) return '—';
  const newest = runs.reduce((best, run) =>
    (runKey(run.code, run.year, run.date) > runKey(best.code, best.year, best.date) ? run : best));
  return meetLabel(newest, 'aok9');
}

function pbLabel(sdog) {
  return sdog.pb != null ? timeLabel(sdog.pb) : esc(sdog.pb_text || '—');
}

/** Titles the Singles points columns say this dog holds. The rule book names
    SBC and SMC; the Supreme and Turtle titles have no abbreviation there, so
    they are written out. */
function singlesTitleBadges(sdog) {
  const t = sdog.titled || {};
  const out = [];
  if (t.sbc) out.push('<span class="badge badge-t-fch" title="Singles Breed Champion">SBC</span>');
  if (t.smc) out.push('<span class="badge badge-t-fch" title="Singles Mixed Champion">SMC</span>');
  if (t.turtle) out.push('<span class="badge badge-t-fch" title="12 Singles Turtle points">Singles Turtle</span>');
  [['supreme_breed', 'Supreme Singles, breed'], ['supreme_mixed', 'Supreme Singles, mixed'],
    ['supreme_turtle', 'Supreme Singles Turtle']].forEach(([key, words]) => {
    if (t[key]) out.push(`<span class="badge badge-t-lcm">${words}${t[key] > 1 ? ` ${romanLevel(t[key])}` : ''}</span>`);
  });
  return out.join(' ');
}

/** Singles Racing Rule Book 1.0 ch. V: SBC at 12 breed points, SMC at 12
    points with at least 2 mixed, Supreme titles every 30 National points, and
    Turtle titles as in the regular stakes: 12 points, then every 30. */
function singlesProgress(sdog) {
  const sbc = sdog.sbc || 0;
  const smc = sdog.smc || 0;
  const bars = [
    progressBar(sbc, 12, 'SBC · Singles Breed Champion'),
    progressBar(sbc + smc, 12, 'SMC · Singles Mixed Champion',
      { done: sdog.titled.smc, note: 'Singles breed and mixed points together, at least 2 of them mixed' }),
    progressBar(sdog.turtle, 12, 'Singles Turtle · 12 Turtle points'),
  ];
  [['nsbc', 'supreme_breed', 'Supreme Singles · National breed points'],
    ['nsmc', 'supreme_mixed', 'Supreme Singles · National mixed points'],
    ['turtle', 'supreme_turtle', 'Supreme Singles Turtle · Turtle points']].forEach(([field, key, words]) => {
    const level = sdog.titled[key] || 0;
    const earned = level ? ` · ${romanLevel(level)} earned` : '';
    bars.push(progressBar(sdog[field], (level + 1) * 30, `${words}${earned}`));
  });
  return bars.join('');
}

/** The average spelled out: the plain mean of the runs listed. */
function singlesArithmetic(runs) {
  const times = runs.map((run) => run.time).filter((t) => t != null);
  if (!times.length) return '';
  if (times.length === 1) return `the one timed run, ${timeLabel(times[0])}`;
  const mean = times.reduce((sum, t) => sum + t, 0) / times.length;
  const exact = (t) => String(Math.round(t * 1000) / 1000);
  return `(${times.map(exact).join(' + ')}) ÷ ${times.length} = ${timeLabel(mean)}`;
}

function singlesTiles(sdog, { average = true } = {}) {
  return [
    [pbLabel(sdog), 'personal best'],
    ...(average ? [[timeLabel(sdog.average), 'Singles average']] : []),
    [ptsLabel(sdog.ytd), 'Singles points this year'],
    [`${ptsLabel(sdog.sbc)} / 12`, 'SBC points'],
    [`${ptsLabel(sdog.smc)} / 12`, 'SMC points'],
    [ptsLabel(sdog.turtle), 'Turtle points'],
  ].map(([value, label]) =>
    `<div class="tile"><div class="tile-value">${value}</div><div class="tile-label">${label}</div></div>`).join('');
}

/** When the two sheets number a dog differently, say so; which one is the
    typo is the registrar's to settle. */
function singlesNumberNote(sdog) {
  if (sdog.joined_by === 'name' && sdog.reg !== sdog.id) {
    return `The Singles records number this dog ${esc(sdog.reg)} and the sprint guide ${esc(sdog.id)}; the name, breed and owner match, so both records are shown here.`;
  }
  if (!sdog.sprint && sdog.id !== sdog.reg) {
    return `The sprint guide gives ${esc(sdog.reg)} to a different dog, so this page is ${esc(sdog.id)}.`;
  }
  return '';
}

function singlesSummaryCard(sdog) {
  const badges = singlesTitleBadges(sdog);
  return `
    <section class="card">
      <h2 class="card-title">Singles record</h2>
      ${badges ? `<p class="text-xs text-asfa-text/70 mb-3">Titles by the Singles points columns: ${badges}</p>` : ''}
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3">${singlesTiles(sdog)}</div>
    </section>`;
}

/** The cards every Singles record shows: the average, title progress, the
    runs behind the average, and the breed's other Singles dogs. */
function singlesCards(sdog, sfeed) {
  const runs = unpackMeets(sfeed, sdog.meets);
  const average = `
    <section class="card">
      <div class="flex flex-wrap items-baseline gap-3">
        <h2 class="card-title mb-0">Singles average</h2>
        <span class="font-display text-3xl text-asfa-accent">${timeLabel(sdog.average)}</span>
      </div>
      ${sdog.average == null ? `<p class="text-sm text-asfa-text/70 mt-2">No average on record${
        sdog.average_text ? `; the sheet reads ${esc(sdog.average_text)}` : ''}.</p>` : ''}
      ${runs.some((run) => run.time != null) ? `<p class="text-sm text-asfa-text/80 mt-2">From the last three runs: ${singlesArithmetic(runs)}.</p>` : ''}
      ${sdog.average != null && sdog.average_computed != null ? `
        <p class="text-xs text-asfa-text/65 mt-2">
          The sheet publishes ${timeLabel(sdog.average)}; the runs it lists average ${timeLabel(sdog.average_computed)}.
          The registrar's figure is the one shown and the one heats are drawn from.
        </p>` : ''}
      <p class="text-xs text-asfa-text/60 mt-2">
        The figure race secretaries draw Singles heats from. AOK9 tracks run 150 to 300 yards,
        so it compares fairly only with times from the same track.
      </p>
    </section>`;

  const progress = `
    <section class="card">
      <h2 class="card-title">Progress toward Singles titles</h2>
      <p class="text-xs text-asfa-text/60">Read from the Singles points columns; the AOK9 registrar's certificate is the record.</p>
      ${singlesProgress(sdog)}
    </section>`;

  const times = runs.map((run) => run.time).filter((t) => t != null);
  const fastest = times.length ? Math.min(...times) : null;
  const beaten = sdog.pb != null && fastest != null && fastest < sdog.pb - 0.0005;
  const best = (run) => !beaten && sdog.pb != null && run.time != null && Math.abs(run.time - sdog.pb) < 0.0005;
  const runsCard = `
    <section class="card">
      <h2 class="card-title">Last three Singles runs</h2>
      ${runs.length ? `
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th scope="col">Meet</th><th scope="col">Code</th><th scope="col" class="num">Time</th></tr></thead>
        <tbody>${runs.map((run) => `
          <tr>
            <td class="whitespace-nowrap">${meetLabel(run, 'aok9')}</td>
            <td class="font-mono text-xs">${esc(run.code)}</td>
            <td class="num font-semibold">${run.time != null ? timeLabel(run.time) : '<span class="text-asfa-text/60">no time</span>'}${
              best(run) ? ' <span class="badge badge-new">personal best</span>' : ''}</td>
          </tr>`).join('')}</tbody>
      </table></div>
      <p class="text-xs text-asfa-text/60 mt-2">A meet runs up to three programs, so one meet can supply all three runs.</p>
      ${beaten ? `<p class="text-xs text-asfa-text/65 mt-1">The sheet's personal best, ${timeLabel(sdog.pb)}, is slower than the ${timeLabel(fastest)} run it lists. The registrar's figure is the one shown above.</p>` : ''}`
      : '<p class="text-sm text-asfa-text/70">No runs listed.</p>'}
    </section>`;

  const mates = sfeed.dogs
    .filter((d) => d.breed_slug === sdog.breed_slug && d.active && d.id !== sdog.id)
    .sort(byRecency).slice(0, 25);
  const matesCard = mates.length ? `
    <section class="card">
      <h2 class="card-title">Other ${esc(sdog.breed)} dogs racing Singles</h2>
      <p class="text-xs text-asfa-text/60 mb-3">Most recent racing first. Singles places dogs against each other only within a meet, so this is not a ranking.</p>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th scope="col">Dog</th><th scope="col">Owner</th><th scope="col" class="num">Average</th>
          <th scope="col" class="num">Personal best</th><th scope="col">Last run</th></tr></thead>
        <tbody>${mates.map((d) => `
          <tr>
            <td><a href="${racingDogUrl('aok9', d.id)}" class="lnk font-semibold">${esc(d.call_name)}</a></td>
            <td class="text-asfa-text/80">${esc(d.owner_raw)}</td>
            <td class="num">${timeLabel(d.average)}</td>
            <td class="num">${pbLabel(d)}</td>
            <td class="whitespace-nowrap">${singlesLastRun(sfeed, d)}</td>
          </tr>`).join('')}</tbody>
      </table></div>
    </section>` : '';

  return average + progress + runsCard + matesCard;
}

/** The page of a dog the sprint guide holds nothing for: its Singles record
    laid out like any other AOK9 dog's, minus the sprint cards. */
function renderSinglesDog(sdog, sfeed, main) {
  document.title = `${sdog.call_name} — ${sdog.breed} — AOK9 Singles — Gazehound Stats`;
  const badges = singlesTitleBadges(sdog);
  const numberNote = singlesNumberNote(sdog);
  main.innerHTML = `
    <nav class="text-sm text-asfa-text/70">
      <a href="aok9.html" class="lnk">AOK9</a> ›
      <a href="aok9.html#singles" class="lnk">Singles</a> ›
      <a href="aok9.html?singles=${encodeURIComponent(sdog.breed_slug)}#singles" class="lnk">${esc(sdog.breed)}</a>
    </nav>

    <section class="card">
      <div class="flex flex-wrap items-start gap-4">
        <div class="text-center shrink-0 w-28">
          <div class="rank-pill">${sdog.average != null ? (Math.round(sdog.average * 100) / 100).toFixed(2) : '—'}</div>
          <div class="text-xs uppercase tracking-widest text-asfa-text/60 mt-1">seconds, Singles average</div>
        </div>
        <div class="flex-1 min-w-[16rem]">
          <h1 class="font-display text-3xl text-asfa-text leading-tight">${esc(sdog.call_name)}</h1>
          <p class="text-asfa-text/85">${esc(sdog.registered_name)}</p>
          ${badges ? `<p class="text-xs text-asfa-text/70 mt-1">Titles by the Singles points columns: ${badges}</p>` : ''}
          <p class="text-sm text-asfa-text/70 mt-1">
            <a href="aok9.html?singles=${encodeURIComponent(sdog.breed_slug)}#singles" class="lnk">${esc(sdog.breed)}</a>
            · <span class="font-mono text-xs">${esc(sdog.sprint ? sdog.id : sdog.reg)}</span>
            · <span class="badge badge-flat">Singles</span>${sdog.active ? '' : ' <span class="badge badge-flat">inactive</span>'}
          </p>
          ${numberNote ? `<p class="text-xs text-asfa-text/65 mt-1">${numberNote}</p>` : ''}
          <p class="text-sm mt-1">Owned by ${esc(sdog.owner_raw)}</p>
          ${sdog.note ? `<p class="text-xs text-asfa-text/65 mt-1">Registrar's note: ${esc(sdog.note)}</p>` : ''}
          <p class="text-sm text-asfa-text/70 mt-2">Races Singles: alone on the track, timed, and placed against the other dogs of its division at each meet.</p>
        </div>
        ${sdog.pb != null || sdog.average != null ? cardButton() : ''}
      </div>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5">${singlesTiles(sdog, { average: false })}</div>
    </section>

    ${singlesCards(sdog, sfeed)}

    <p class="text-xs text-asfa-text/55">
      Figures as published in the AOK9 Singles sprint records dated ${formatDate(sfeed.guide_date)}.
      <a href="aok9.html#singles" class="lnk">How Singles works</a>.
    </p>`;
  const cardBtn = main.querySelector('#card-btn');
  if (cardBtn) cardBtn.addEventListener('click', () => openRacingCard(singlesCardSpec(sdog, sfeed)));
}

/** The Singles tab of the AOK9 page: what only Singles has. No standings;
    Singles places dogs only within a meet, so titles, progress toward them,
    and each breed's dogs by recent racing. */
function renderSinglesTab(sfeed, container) {
  if (!container) return;
  if (!sfeed) {
    container.innerHTML = `
      <div class="card">
        <h2 class="card-title">Singles</h2>
        <p class="text-sm text-asfa-text/70">The Singles records could not be loaded just now. The rest of the page is unaffected.</p>
      </div>`;
    return;
  }
  const stats = sfeed.stats;
  const dogs = sfeed.dogs;
  const onTheWay = dogs.filter((d) => d.active && ((d.sbc || 0) + (d.smc || 0)) > 0 && !(d.titled.sbc && d.titled.smc))
    .sort((a, b) => ((b.sbc || 0) + (b.smc || 0)) - ((a.sbc || 0) + (a.smc || 0))
      || (b.sbc || 0) - (a.sbc || 0) || a.call_name.localeCompare(b.call_name));
  const sections = [...sfeed.sections].sort((a, b) =>
    b.raced - a.raced || b.active - a.active || a.breed.localeCompare(b.breed));
  const countLabel = (s) => s.raced ? `${s.raced} racing this year` : s.active ? `${s.active} active` : `${s.listed} listed`;
  const tile = (value, label) =>
    `<div class="tile"><div class="tile-value">${value}</div><div class="tile-label">${label}</div></div>`;

  container.innerHTML = `
    <div>
      <h2 class="font-display text-2xl text-asfa-text">Singles</h2>
      <p class="text-sm text-asfa-text/70 mt-1">
        For dogs that can't run in company: each runs alone and is timed, and at every meet it is
        placed against the other dogs of its division. From the
        <a href="${esc(sfeed.source_url)}" class="lnk" target="_blank" rel="noopener noreferrer">Singles sprint records</a>
        dated ${formatDate(sfeed.guide_date)}.
      </p>
    </div>

    <section id="singles-tiles" class="grid grid-cols-2 md:grid-cols-3 gap-3">
      ${tile(stats.dogs_raced, 'dogs racing Singles this year')}
      ${tile(stats.breeds_raced, 'breeds racing Singles this year')}
      <a href="#singles" id="singles-way-link" class="tile block hover:border-asfa-accent" title="See every dog on its way to a Singles title">
        <div class="tile-value">${onTheWay.length}</div>
        <div class="tile-label">on their way to a title →</div>
      </a>
    </section>

    <div class="card">
      <h2 class="card-title">Singles – browse by breed</h2>
      <p class="text-xs text-asfa-text/60 mb-3">
        Most recent racing first. Singles places dogs against each other only within a meet, on
        that day's track, so this list is not a ranking.
      </p>
      <label class="block mb-3">
        <span class="sr-only">Breed</span>
        <select id="singles-breed" class="select w-full sm:w-auto sm:min-w-[20rem] px-3 py-2">
          ${sections.map((s) => `<option value="${s.slug}">${esc(s.breed)} · ${countLabel(s)}</option>`).join('')}
        </select>
      </label>
      <div id="singles-panel"></div>
    </div>

    <div class="card" id="singles-on-the-way" tabindex="-1">
      <h2 class="card-title">On their way to a title</h2>
      <p class="text-xs text-asfa-text/60 mb-3">Dogs racing lately, by points toward SBC and SMC. Twelve make either title; SMC counts breed and mixed points together, at least 2 of them mixed.</p>
      <div id="singles-way-panel"></div>
    </div>

    <section class="card">
      <h2 class="card-title">How Singles works</h2>
      <ul class="text-sm leading-relaxed list-disc pl-5 space-y-2">
        <li><strong>Placings, not times, earn points.</strong> At each meet a Singles dog runs up to
          three programs alone. Its division is placed either by average time or by scoring each
          program's times like a regular stake. The top four placings earn points on the sprint
          table; last place earns Turtle points.</li>
        <li><strong>The average is a seeding figure.</strong> It is the plain mean of the dog's last
          three timed runs, and race secretaries draw heats from it. A meet runs up to three
          programs, so all three runs often come from one meet. AOK9 tracks run 150 to 300 yards,
          so averages from different tracks do not compare, and this site ranks no one by time.</li>
        <li><strong>Titles.</strong> SBC, Singles Breed Champion, is 12 points from breed divisions.
          SMC, Singles Mixed Champion, is 12 points with at least 2 from mixed divisions. Supreme
          Singles titles come at every 30 National points, and Singles Turtle titles follow the
          regular stakes: 12 Turtle points, then every 30. The rule book gives the Supreme and
          Turtle titles no abbreviation, so they are written out here. Companion titles earned in
          Singles carry an "-S" and are not in the records.</li>
        <li><strong>Where it comes from.</strong> The
          <a href="${esc(sfeed.source_url)}" class="lnk" target="_blank" rel="noopener noreferrer">Singles sprint records</a>
          are a public spreadsheet from R.A.C.E.'s AOK9 program, read under the
          <a href="${esc(sfeed.rules_url)}" class="lnk" target="_blank" rel="noopener noreferrer">Singles Racing Rule Book</a>.
          A dog that races both Singles and the regular stakes keeps one page with both records.
          Where this site and the records disagree, the records govern.</li>
      </ul>
    </section>`;

  animateTiles(document.getElementById('singles-tiles'));

  /* ----- on their way to a title: the 25 closest, every one on request */
  const wayPanel = container.querySelector('#singles-way-panel');
  let wayAll = false;
  function paintWay() {
    if (!onTheWay.length) {
      wayPanel.innerHTML = '<p class="text-sm text-asfa-text/70">No dog racing lately has Singles points yet.</p>';
      return;
    }
    const shown = wayAll ? onTheWay : onTheWay.slice(0, 25);
    wayPanel.innerHTML = `
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th scope="col">Dog</th><th scope="col">Breed</th><th scope="col" class="num">SBC</th><th scope="col" class="num">SMC</th></tr></thead>
        <tbody>${shown.map((d) => `
          <tr>
            <td><a href="${racingDogUrl('aok9', d.id)}${d.sprint_racing ? '#singles' : ''}" class="lnk font-semibold">${esc(d.call_name)}</a></td>
            <td class="text-asfa-text/80">${esc(d.breed)}</td>
            <td class="num">${d.titled.sbc ? '<span class="badge badge-t-fch">SBC</span>' : `${ptsLabel(d.sbc || 0)} / 12`}</td>
            <td class="num">${d.titled.smc ? '<span class="badge badge-t-fch">SMC</span>' : `${ptsLabel((d.sbc || 0) + (d.smc || 0))} / 12`}</td>
          </tr>`).join('')}</tbody>
      </table></div>
      ${onTheWay.length > 25 ? `<p class="text-sm mt-3 no-print">${wayAll
        ? `Showing all ${onTheWay.length}. <button type="button" id="singles-way-toggle" class="lnk">The 25 closest only</button>`
        : `The 25 closest of ${onTheWay.length}. <button type="button" id="singles-way-toggle" class="lnk">Show all ${onTheWay.length}</button>`}</p>` : ''}`;
    const toggle = wayPanel.querySelector('#singles-way-toggle');
    if (toggle) toggle.addEventListener('click', () => { wayAll = !wayAll; paintWay(); });
  }
  paintWay();

  // The counter opens the full list and brings it into view. The hash stays
  // #singles, so the tab does not change under it.
  container.querySelector('#singles-way-link').addEventListener('click', (event) => {
    event.preventDefault();
    wayAll = true;
    paintWay();
    const box = container.querySelector('#singles-on-the-way');
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    box.focus({ preventScroll: true });
  });

  const select = container.querySelector('#singles-breed');
  const panel = container.querySelector('#singles-panel');
  let showAll = false;

  function paint() {
    const section = sfeed.sections.find((s) => s.slug === select.value);
    if (!section) { panel.innerHTML = ''; return; }
    const members = dogs.filter((d) => d.breed_slug === section.slug);
    const activeMembers = members.filter((d) => d.active);
    const everyone = showAll || !activeMembers.length;
    const rows = (everyone ? members : activeMembers).sort(byRecency);
    panel.innerHTML = `
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h3 class="font-display text-xl text-asfa-text">${esc(section.breed)}</h3>
        <p class="text-sm text-asfa-text/70">${section.raced} racing this year · ${section.active} active · ${section.listed} listed</p>
      </div>
      <div class="tbl-wrap mt-3"><table class="tbl">
        <thead><tr><th scope="col">Dog</th><th scope="col">Registered name</th><th scope="col">Owner</th>
          <th scope="col" class="num">Average</th><th scope="col" class="num">Personal best</th>
          <th scope="col">Last run</th><th scope="col">Titles</th></tr></thead>
        <tbody>${rows.map((d) => `
          <tr class="${d.active ? '' : 'text-asfa-text/60'}">
            <td><a href="${racingDogUrl('aok9', d.id)}${d.sprint_racing ? '#singles' : ''}" class="lnk font-semibold">${esc(d.call_name)}</a></td>
            <td class="text-asfa-text/80">${esc(d.registered_name)}</td>
            <td class="text-asfa-text/80">${esc(d.owner_raw)}</td>
            <td class="num">${timeLabel(d.average)}</td>
            <td class="num">${pbLabel(d)}</td>
            <td class="whitespace-nowrap">${singlesLastRun(sfeed, d)}</td>
            <td>${singlesTitleBadges(d)}</td>
          </tr>`).join('')}</tbody>
      </table></div>
      ${activeMembers.length && activeMembers.length < members.length ? `
        <p class="text-sm mt-3 no-print">${showAll
          ? `Showing every ${esc(section.breed)} dog the records list. <button type="button" id="singles-toggle" class="lnk">Dogs racing lately only</button>`
          : `<button type="button" id="singles-toggle" class="lnk">Show all ${section.listed} ${esc(section.breed)} dogs the records list</button>`}</p>`
        : !activeMembers.length ? `<p class="text-sm mt-3 text-asfa-text/70">No ${esc(section.breed)} has raced Singles since ${sfeed.active_since.slice(0, 4)}; every one the records list is shown.</p>` : ''}`;
    const toggle = panel.querySelector('#singles-toggle');
    if (toggle) toggle.addEventListener('click', () => { showAll = !showAll; paint(); });
  }

  const requested = param('singles');
  select.value = sfeed.sections.some((s) => s.slug === requested) ? requested : sections[0].slug;
  select.addEventListener('change', () => {
    showAll = false;
    const url = new URL(window.location);
    url.searchParams.set('singles', select.value);
    url.hash = '#singles';
    history.replaceState(null, '', url);
    paint();
  });
  paint();
}

/* ------------------------------------------------------------- stat cards */

/* What a racing hound's stat card says. The card itself is drawn by
   drawRacingCard in card.js; these decide the words and figures. */

function cardStem(name) {
  return name.replace(/[^\w-]+/g, '-').toLowerCase().replace(/^-|-$/g, '') || 'hound';
}

function cardSource(feed) {
  return (feed.site_url || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
}

/** The WAVE a card shows: LGRA has one; AOK9 the breed WAVE, else the mixed. */
function cardWave(org, dog) {
  const [field, title, gradeField] = org === 'aok9' && dog.bwave == null && dog.mwave != null
    ? ORGS.aok9.waves[1] : ORGS[org].waves[0];
  return { value: dog[field], title, grade: dog[gradeField] };
}

/** Whether a sprint record has anything worth a card. */
function hasCardRecord(org, dog) {
  const career = org === 'lgra' ? dog.ngrc : (dog.nbrc || 0) + (dog.nmrc || 0);
  return Boolean(dog.rank_breed || cardWave(org, dog).value != null || career);
}

/** An LGRA or AOK9 sprint card. The headline is the breed standing this year,
    as on the ASFA card; without points this year it is the WAVE. A dog that
    also races Singles gets its personal best as a third headline line. */
function racingCardSpec(org, dog, feed, sdog = null, sfeed = null) {
  const spec = ORGS[org];
  const wave = cardWave(org, dog);
  const career = org === 'lgra' ? (dog.ngrc || 0) : (dog.nbrc || 0) + (dog.nmrc || 0);
  const waveLabelText = wave.value != null && wave.grade ? `${wave.title} · grade ${wave.grade}` : wave.title;
  // Singles runs at the same meets, so a Singles run counts as racing.
  const lastRaced = Math.max(Number(dog.last_raced ? dog.last_raced.slice(0, 4) : dog.last_year) || 0,
    (sdog && sdog.last_year) || 0) || null;
  let headline;
  let figures;
  if (dog.rank_breed) {
    headline = {
      big: `#${dog.rank_breed}`,
      line1: `in ${dog.breed} this year`,
      line2: `#${dog.rank_all} of ${feed.stats.hounds_ytd} across every breed`,
    };
    figures = [
      [ptsLabel(dog.ytd || 0), 'NATIONAL PTS THIS YEAR'],
      [waveLabel(wave.value), waveLabelText.toUpperCase()],
      [ptsLabel(career), 'CAREER NATIONAL PTS'],
    ];
  } else {
    headline = wave.value != null
      ? { big: waveLabel(wave.value), line1: wave.grade ? `${wave.title}, grade ${wave.grade}` : wave.title,
          line2: 'no National points yet this year' }
      : { big: ptsLabel(career), line1: 'career National points', line2: 'no National points yet this year' };
    const championship = org === 'lgra' ? ['grc', 'GRC PTS'] : ['brc', 'BRC PTS'];
    figures = [
      [ptsLabel(career), 'CAREER NATIONAL PTS'],
      [`${ptsLabel(dog[championship[0]] || 0)} / 12`, championship[1]],
      [lastRaced || '—', 'LAST RACED'],
    ];
  }
  if (sdog && sdog.pb != null) {
    headline.line3 = `SINGLES · PERSONAL BEST ${timeLabel(sdog.pb).toUpperCase()}`;
  }
  const program = `${spec.name} ${spec.program}`;
  const sameDay = sdog && sfeed && sfeed.guide_date === feed.guide_date;
  const footer = sdog && sfeed
    ? (sameDay
      ? `Grading guide and Singles records of ${formatDate(feed.guide_date)} · source: ${cardSource(feed)}`
      : `Grading guide of ${formatDate(feed.guide_date)}, Singles records of ${formatDate(sfeed.guide_date)} · ${cardSource(feed)}`)
    : `Grading guide of ${formatDate(feed.guide_date)} · source: ${cardSource(feed)}`;
  return {
    band: `${program} · ${feed.season}`.toUpperCase(),
    callName: dog.call_name,
    registeredName: dog.registered_name,
    meta: `${dog.breed} · ${dog.duplicate_of || dog.id}`,
    headline,
    figures,
    owner: dog.owner_raw,
    footer,
    share: {
      name: dog.call_name,
      filename: `${cardStem(dog.call_name)}-${org}-${feed.season}.png`,
      shareTitle: `${dog.call_name} — Gazehound Stats`,
      shareText: dog.rank_breed
        ? `${dog.call_name}, #${dog.rank_breed} in ${dog.breed} this year in ${program}, on ${ptsLabel(dog.ytd)} National points.`
        : `${dog.call_name}, ${program}: ${headline.line1} ${headline.big}.`,
    },
  };
}

/** A card for a dog whose racing is Singles alone. No standing: Singles
    places dogs only within a meet, so the headline is the personal best. */
function singlesCardSpec(sdog, sfeed) {
  const combined = (sdog.sbc || 0) + (sdog.smc || 0);
  const headline = sdog.pb != null
    ? { big: (Math.round(sdog.pb * 100) / 100).toFixed(2), line1: 'seconds, personal best',
        line2: sdog.average != null ? `Singles average ${timeLabel(sdog.average)}` : 'no Singles average on record' }
    : { big: sdog.average != null ? (Math.round(sdog.average * 100) / 100).toFixed(2) : '—',
        line1: 'seconds, Singles average', line2: 'no personal best on record' };
  return {
    band: `AOK9 Singles · ${sfeed.season}`.toUpperCase(),
    callName: sdog.call_name,
    registeredName: sdog.registered_name,
    meta: `${sdog.breed} · ${sdog.sprint ? sdog.id : sdog.reg}`,
    headline,
    figures: [
      [ptsLabel(sdog.ytd || 0), 'SINGLES PTS THIS YEAR'],
      [`${ptsLabel(sdog.sbc || 0)} / 12`, sdog.titled.sbc ? 'SBC · EARNED' : 'TOWARD SBC'],
      [`${ptsLabel(combined)} / 12`, sdog.titled.smc ? 'SMC · EARNED' : 'TOWARD SMC'],
    ],
    owner: sdog.owner_raw,
    footer: `Singles records of ${formatDate(sfeed.guide_date)} · source: ${cardSource(sfeed)}`,
    share: {
      name: sdog.call_name,
      filename: `${cardStem(sdog.call_name)}-aok9-singles-${sfeed.season}.png`,
      shareTitle: `${sdog.call_name} — Gazehound Stats`,
      shareText: sdog.pb != null
        ? `${sdog.call_name}, AOK9 Singles personal best ${timeLabel(sdog.pb)}.`
        : `${sdog.call_name}, AOK9 Singles average ${timeLabel(sdog.average)}.`,
    },
  };
}

/** The Stat card button, where card.js is loaded and the record has one. */
function cardButton() {
  return typeof openRacingCard === 'function'
    ? `<div class="flex gap-2 no-print"><button type="button" id="card-btn" class="btn btn-primary">${icon('share', 'mr-1')}Stat card</button></div>`
    : '';
}
