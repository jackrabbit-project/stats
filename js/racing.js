/* The LGRA, AOK9 and NOTRA racing pages: what the programs have in common,
   the table of where they differ, and the two page renderers (overview,
   hound). Loaded after app.js; plain globals like the rest of the site. */

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
    guideName: 'LGRA grading guide',
    officer: 'registrar',
    titledTile: (stats) => [stats.titled_grc.toLocaleString('en-US'), 'GRC titled, all time'],
    titledKeys: ['grc'], titledLabel: 'GRC titled',
    agreement: (stats) => `${Math.round(stats.wave_agreement * 100)}%`,
    careerOf: (dog) => dog.ngrc || 0,
    cardChampion: ['grc', 'GRC PTS'],
    waveMax: 22,
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
        pending: (dog) => mixedNeeded(dog.mrc, 'MRC'),
        note: (dog) => `${ptsLabel(dog.brc || 0)} BRC + ${ptsLabel(dog.mrc || 0)} MRC points; the title needs 12, at least 2 of them MRC`,
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
      // As the guide lists it. MRC points alone never make the title (§5.3
      // counts BRC points too), so no "/ 12" here; the MRC bar has the total.
      [ptsLabel(dog.mrc), 'MRC points'],
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
    guideName: 'AOK9 sprint racing grading guide',
    officer: 'registrar',
    titledTile: (stats) => [stats.titled_champion, 'BRC or MRC titled, all time'],
    titledKeys: ['brc', 'mrc'], titledLabel: 'BRC or MRC titled',
    agreement: (stats) => `${Math.round(stats.bwave_agreement * 100)}% (breed) and ${Math.round(stats.mwave_agreement * 100)}% (mixed)`,
    careerOf: (dog) => (dog.nbrc || 0) + (dog.nmrc || 0),
    cardChampion: ['brc', 'BRC PTS'],
    waveMax: 22,
  },
  notra: {
    key: 'notra',
    // "NOTRA OB" (NOTRA's own word for its Other-Breed guide) tells these
    // pages from NOTRA Whippets wherever the two sit side by side.
    name: 'NOTRA OB',
    fullName: 'National Oval Track Racing Association',
    program: 'oval racing',
    title: 'NOTRA OB racing',
    page: 'notra.html',
    noun: 'hound', nouns: 'hounds',
    waves: [['wave', 'WAVE', 'grade']],
    seasonLabel: 'National points this year',
    careers: [['lftm', 'rank_career', 'Career National points', 'sorc', 'SORC']],
    // NOTRA Rules (Feb 2025) 7.4 and 7.5 for Other Breeds: ORC at 12 ORC
    // points, SORC at every 30 lifetime National points. The merit titles
    // (7.3) are earned by legs the guide counts: four completed meets for
    // Junior Oval Racer, six qualifying legs for Senior.
    champion: [['orc', 'ORC', 'Oval Racing Champion', 12]],
    supreme: [['lftm', 'sorc', 'SORC', 'Supreme Oval Racing Champion', 30]],
    merit: [['jor', 'JOR', 'Junior Oval Racer', 4, 'completed meets'], ['sor', 'SOR', 'Senior Oval Racer', 6, 'legs']],
    tiles: (dog) => [
      [ptsLabel(dog.ytd), 'National points this year'],
      [ptsLabel(dog.lftm), 'career National points'],
      [`${ptsLabel(dog.orc)} / 12`, 'ORC points'],
      [ptsLabel(dog.prior), 'National points, prior years'],
    ],
    streams: [['meets', 'Last three meets']],
    browse: [
      ['rank_breed', 'Rank', 'num', 1],
      ['call_name', 'Call name', '', 1],
      ['registered_name', 'Registered name', '', 1],
      ['owner_raw', 'Owner', '', 1],
      ['ytd', 'This year', 'num', -1],
      ['lftm', 'Career', 'num', -1],
      ['orc', 'ORC pts', 'num', -1],
      ['wave', 'WAVE', 'num', -1],
      ['last_raced', 'Last raced', '', -1],
    ],
    rules: 'NOTRA Rules, February 2025',
    calendar: 'https://www.notra.org/RaceDates.html',
    calendarLabel: 'NOTRA race calendar',
    intro: (feed) => `${feed.season} oval racing standings for every sighthound breed but the Whippet, from NOTRA's
        Other-Breed (OB) grading guide ${guideDate(feed)}, as published by
        <a href="${esc(feed.site_url)}" class="lnk" target="_blank" rel="noopener noreferrer">${esc(feed.site_url.replace(/^https?:\/\//, ''))}</a>.`,
    overviewNote: () => crossLink(
      '<strong>Whippets have pages of their own.</strong> NOTRA keeps a separate Whippet grading guide with its own rules; its standings, ratings and titles are under NOTRA Whippets, in the Whippet racing section.',
      'notra-whippets.html', 'NOTRA Whippets', 'whippet'),
    guideName: 'NOTRA Other-Breed grading guide',
    officer: 'recorder',
    titledTile: (stats) => [stats.titled_orc, 'ORC titled, all time'],
    titledKeys: ['orc'], titledLabel: 'ORC titled',
    agreement: (stats) => `${Math.round(stats.wave_agreement * 100)}%`,
    careerOf: (dog) => dog.lftm || 0,
    cardChampion: ['orc', 'ORC PTS'],
    waveMax: 22,
    // The guide counts a hound's disqualifications, off-course runs and
    // did-not-finishes instead of listing the meets, and gives each listed
    // meet a status the recorder wrote (n, y, scr2, dnf, oc, dq).
    faults: true,
    meetStatus: true,
  },
  /* Whippet racing (beta). WRA's grading guide is two web reports, the
     active and the inactive list, with the Registrar's Whippet Point Records
     beside them (2026 WRA Rule Book). One breed; no race numbers, so the
     call name is the key; meets are scores without dates; an average stands
     in for the WAVE (rule 5.2); titles are the Point Records'. */
  wra: {
    key: 'wra',
    name: 'WRA',
    fullName: 'Whippet Racing Association',
    program: 'whippet racing',
    title: 'WRA whippet racing',
    page: 'wra.html',
    noun: 'whippet', nouns: 'whippets',
    singleBreed: true,
    subTabs: 'whippet',
    noIds: true,
    waves: [['avg', 'Average', 'grade']],
    waveMax: 29,
    gradeBands: [[4, 'C'], [10, 'B'], [15, 'A']],
    seasonLabel: 'National points this year',
    careers: [['lftm', 'rank_career', 'Career National points', null, null]],
    careerNote: 'Fifty lifetime National points make a WRChX for a dog and thirty for a bitch (rule 7.5.4); the title shown is the Registrar\'s.',
    champion: [],
    supreme: [],
    titleInUse: wraTitleInUse,
    titlesLabel: 'Title in use, from the Registrar\'s Point Records',
    titlesBoardNote: 'From consecutive copies of the Registrar\'s Point Records.',
    titleProgress: wraTitleProgress,
    progressNote: 'Titles and title points from the Registrar\'s Whippet Point Records, which WRA names as the correct record; the Registrar\'s records govern.',
    tiles: (dog) => [
      [ptsLabel(dog.ytd), 'National points this year'],
      [ptsLabel(dog.lftm), 'career National points'],
      [ptsLabel(dog.cr_points), 'CR points'],
      [dog.titled && dog.titled.wrch ? 'WRCh' : `${ptsLabel(wraWrchPoints(dog) || 0)} / 15`, 'WRCh points'],
    ],
    streams: [['meets', 'Last three meets']],
    browse: [
      ['rank_breed', 'Rank', 'num', 1],
      ['call_name', 'Call name', '', 1],
      ['registered_name', 'Registered name', '', 1],
      ['owner_raw', 'Owner', '', 1],
      ['ytd', 'This year', 'num', -1],
      ['lftm', 'Career', 'num', -1],
      ['cr_points', 'CR pts', 'num', -1],
      ['avg', 'Average', 'num', -1],
      ['meets_run', 'Meets', 'num', -1],
      ['last_raced', 'Last raced', '', -1],
    ],
    meetStatus: true,
    meetCodeHeader: null,
    statusLegend: 'C completed the meet; SCR scratched; PSCR scratched, most likely in the paddock (rule 3.2.3; WRA publishes no legend); DNF did not finish; DQ disqualified. Newest first; the report gives no dates, and puppy races are not listed.',
    plainMean: true,
    averageRule: 'rule 5.2',
    ownArithmetic: true,
    dogNote: (dog) => [
      dog.dii ? 'Approved for Division II (rule 7.5.5); DII points and titles are on the DII Registrar\'s lists, not here.' : '',
      dog.meets_run != null ? `${dog.meets_run} meet${dog.meets_run === 1 ? '' : 's'} run, puppy races included${
        dog.exempt ? '; exempt from height measurement (rule 3.2.2.5)' : ''}.` : '',
    ].filter(Boolean).join(' '),
    // Racing this year is a last meet in the season on WRA's Meets Run by
    // Dog page; WRA's active list (1,196) is a status, not recent racing.
    overviewTiles: (stats) => [
      [stats.hounds_raced ?? '—', 'whippets racing this year'],
      [stats.hounds_ytd, 'with National points this year'],
      [stats.meets_this_year, 'meets this year'],
      [stats.wrch_this_year, 'WRCh titles earned this year'],
      [stats.titled_wrch, 'WRCh titled, all time'],
    ],
    hubTiles: (stats) => [
      [stats.hounds_raced ?? '—', 'whippets racing this year'],
      [stats.hounds_ytd, 'with points this year'],
      [stats.meets_this_year, 'meets this year'],
      [stats.titled_wrch, 'WRCh titled, all time'],
    ],
    intro: (feed) => `${feed.season} standings from WRA's grading guide ${guideDate(feed)}, and titles from the
        Registrar's Whippet Point Records of ${formatDate(feed.records_date)}, as published by
        <a href="${esc(feed.site_url)}" class="lnk" target="_blank" rel="noopener noreferrer">whippetracing.org</a>.`,
    browseNote: () => 'Whippets on WRA\'s active list',
    kennelNote: 'The report prints a surname and an initial, so a kennel here is that name: two owners who share both share a line. A co-owned whippet counts for every name on its row.',
    rules: '2026 WRA Rule Book',
    calendar: 'https://www.whippetracing.org/MeetListDisplay.cfm',
    calendarLabel: 'WRA race meets',
    guideName: 'WRA grading guide',
    officer: 'Registrar',
    titledTile: (stats) => [stats.titled_wrch, 'WRCh titled, all time'],
    titledKeys: ['wrch'], titledLabel: 'WRCh titled',
    agreement: (stats) => `${Math.round(stats.wave_agreement * 1000) / 10}%`,
    careerOf: (dog) => dog.lftm || 0,
    noCard: true,
    hubSub: 'Straight racing',
    hubLine: 'WRA · NOTRA Whippets · CWA',
    coverageWord: 'guide',
  },
  /* NOTRA's Whippet guide (NOTRA Rules, February 2025): its own layout and
     rules beside the Other-Breed guide. Scores out of 29 (four programs; a
     three-program score is scaled by 29/22), grade bands at 15.2, 11 and
     7.6, an ORC at 15 points, a SORC at 50 or 30 points by sex (which the
     guide does not print, so the recorder's title record decides), a rating
     that seeds, OTR-only meets listed but not graded. */
  'notra-whippets': {
    key: 'notra-whippets',
    name: 'NOTRA Whippets',
    fullName: 'National Oval Track Racing Association',
    program: 'whippet oval racing',
    title: 'NOTRA whippet oval racing',
    page: 'notra-whippets.html',
    noun: 'whippet', nouns: 'whippets',
    singleBreed: true,
    subTabs: 'whippet',
    waves: [['wave', 'WAVE', 'grade']],
    waveMax: 29,
    gradeBands: [[7.6, 'C'], [11, 'B'], [15.2, 'A']],
    seasonLabel: 'National points this year',
    careers: [['lftm', 'rank_career', 'Career National points', 'sorc', 'SORC']],
    careerNote: 'Fifty lifetime National points make a SORC for a dog and thirty for a bitch (rule 5.4); the guide prints no sex, so the title shown is the recorder\'s.',
    champion: [['orc', 'ORC', 'Oval Racing Champion', 15]],
    supreme: [],
    titleInUse: notraWhippetTitleInUse,
    titlesLabel: 'Title in use',
    titleProgress: notraWhippetProgress,
    progressNote: 'ORC points from the points column, the SORC from the recorder\'s title record in the guide; the NOTRA Whippet Recorder\'s certificate is the record.',
    tiles: (dog) => [
      [ptsLabel(dog.ytd), 'National points this year'],
      [ptsLabel(dog.lftm), 'career National points'],
      [`${ptsLabel(dog.orc)} / 15`, 'ORC points'],
      [dog.rating ?? '—', 'rating'],
    ],
    streams: [['meets', 'Last three meets']],
    browse: [
      ['rank_breed', 'Rank', 'num', 1],
      ['call_name', 'Call name', '', 1],
      ['registered_name', 'Registered name', '', 1],
      ['owner_raw', 'Owner', '', 1],
      ['ytd', 'This year', 'num', -1],
      ['lftm', 'Career', 'num', -1],
      ['orc', 'ORC pts', 'num', -1],
      ['wave', 'WAVE', 'num', -1],
      ['rating', 'Rating', 'num', 1],
      ['last_raced', 'Last raced', '', -1],
    ],
    meetStatus: true,
    meetCodeHeader: 'Code',
    meetPlacing: true,
    statusLegend: 'N completed every program; F completed, with an off-course run or a did-not-finish in the final program; S scratched; D disqualified; X as the recorder writes it. Place is the final placing in the meet.',
    ownArithmetic: true,
    faultsView: notraWhippetFaults,
    overviewNote: () => crossLink(
      '<strong>Other breeds have pages of their own.</strong> NOTRA\'s Other-Breed (OB) guide covers every other sighthound breed; its standings are under NOTRA OB racing.',
      'notra.html', 'NOTRA OB racing', 'amber'),
    dogNote: (dog) => (dog.restricted ? 'Restricted from entry under rule 6.2, as the guide marks it.' : ''),
    intro: (feed) => `${feed.season} standings from NOTRA's Whippet grading guide ${guideDate(feed)}, as published by
        <a href="${esc(feed.site_url)}" class="lnk" target="_blank" rel="noopener noreferrer">notra.org</a>.`,
    kennelNote: 'The guide prints a surname and nothing else, so a kennel here is a surname: two Joneses share a line. A co-owned whippet counts for every surname on its row.',
    rules: 'NOTRA Rules, February 2025',
    calendar: 'https://www.notra.org/RaceDates.html',
    calendarLabel: 'NOTRA race dates',
    guideName: 'NOTRA Whippet grading guide',
    officer: 'recorder',
    titledTile: (stats) => [stats.titled_orc, 'ORC titled, all time'],
    titledKeys: ['orc'], titledLabel: 'ORC titled',
    agreement: (stats) => `${Math.round(stats.wave_agreement * 1000) / 10}%`,
    careerOf: (dog) => dog.lftm || 0,
    noCard: true,
    hubSub: 'Oval racing',
    coverageWord: 'guide',
  },
};

/* ---------------------------------------------------------------- helpers */

function racingBreedUrl(org, slug) {
  return `${org}.html?breed=${encodeURIComponent(slug)}#browse`;
}

/* Each program's kennels by key ("surname|breed"), set when its page
   renders, so an owner links only to a kennel its Kennels tab can open. */
const KENNELS = {};
function racingKennels(org, feed) {
  if (feed && feed.owners) KENNELS[org] = new Set(feed.owners.map((owner) => owner.key));
  return KENNELS[org] || new Set();
}

/** A dog's owners as its guide prints them, each linked to the kennel the
    program lists for that owner and breed. */
function racingOwners(org, dog) {
  const kennels = KENNELS[org] || new Set();
  return linkSlashOwners(dog.owner_raw, dog.owners || [], (owner) => {
    const key = `${owner.key}|${dog.breed_slug}`;
    return kennels.has(key) ? racingOwnerUrl(org, key) : null;
  });
}

function racingOwnerUrl(org, key) {
  return `${org}.html?owner=${encodeURIComponent(key)}#kennels`;
}

/** "12", "12.5", "—": points are halves and quarters, never long decimals. */
function ptsLabel(value) {
  if (value == null) return '—';
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/** A WAVE to two places, as the guides print it: half up on the decimal
    value. Rounding value * 100 in binary put 12.765 at 1276.4999... and
    printed 12.76; shifting the decimal point in the string keeps it exact. */
function waveLabel(value) {
  if (value == null) return '—';
  return Number(`${Math.round(Number(`${value}e2`))}e-2`).toFixed(2).replace(/\.?0+$/, '');
}

/** Grade bands from rule 4.2.2.5, on the existing badge pairs so dark mode
    needs nothing new: A green, B amber, C rust, D neutral. */
function gradeBadge(grade) {
  if (!grade) return '';
  const cls = { A: 'badge-t-fch', B: 'badge-t-lcm', C: 'badge-t-tcp', D: 'badge-flat' }[grade] || 'badge-flat';
  return `<span class="badge ${cls}" title="Grade ${grade}">${grade}</span>`;
}

/** A 0 to 22 bar with the grade boundaries ticked on it; a program scored
    out of 29 (NOTRA's four-program whippet meets) scales the ticks with it. */
function waveBar(value, max = 22, bands = null, title = 'WAVE') {
  if (value == null) return '';
  const pct = (n) => `${Math.max(0, Math.min(100, (n / max) * 100))}%`;
  const at = (n) => Math.round(n * max / 22 * 10) / 10;
  const tick = (n, label) => `
    <span class="absolute top-0 bottom-0 border-l border-asfa-border" style="left:${pct(n)}" aria-hidden="true"></span>
    <span class="absolute -bottom-4 text-[10px] font-mono text-asfa-text/55 -translate-x-1/2" style="left:${pct(n)}" aria-hidden="true">${label}</span>`;
  // A program with bands of its own (NOTRA's four-program whippet column,
  // WRA's average) ticks them as its rules print them.
  const ticks = bands || [[at(5.5), 'C'], [at(8), 'B'], [at(11), 'A']];
  return `
    <div class="relative h-3 bg-asfa-bg2 border border-asfa-border mt-3 mb-5" role="img" aria-label="${title} ${waveLabel(value)} of a possible ${max}">
      <div class="h-full bg-asfa-accent" style="width:${pct(value)}"></div>
      ${ticks.map(([n, label]) => tick(n, label)).join('')}
      <span class="absolute -bottom-4 right-0 text-[10px] font-mono text-asfa-text/55" aria-hidden="true">${max}</span>
    </div>`;
}

function progressBar(value, need, label, opts = {}) {
  const done = opts.done !== undefined ? opts.done : (value || 0) >= need;
  const pct = Math.max(0, Math.min(100, ((value || 0) / need) * 100));
  return `
    <div class="mt-3">
      <div class="flex justify-between text-sm">
        <span class="font-semibold">${label}</span>
        <span class="text-asfa-text/70">${ptsLabel(value || 0)} / ${need}${done ? ' · earned' : opts.pending ? ` · ${opts.pending}` : ''}</span>
      </div>
      ${opts.note ? `<p class="text-xs text-asfa-text/60">${opts.note}</p>` : ''}
      <div class="h-2 bg-asfa-bg2 border border-asfa-border mt-1" role="img" aria-label="${label}: ${ptsLabel(value || 0)} of ${need}">
        <div class="h-full ${done ? 'bg-asfa-green' : 'bg-asfa-accent'}" style="width:${pct}%"></div>
      </div>
    </div>`;
}

/** Progress toward a title whose mark depends on sex, which neither
    whippet body publishes (WRA's WRChX, rule 7.5.4; NOTRA's whippet SORC,
    rule 5.4): one bar to the dog's mark with the bitch's mark ticked on it,
    both labelled, so an owner reads the one that applies. */
function twoMarkBar(value, bitch, dog, label, note = '') {
  const v = value || 0;
  const pct = (n) => Math.max(0, Math.min(100, (n / dog) * 100));
  return `
    <div class="mt-3">
      <div class="flex flex-wrap justify-between gap-x-3 text-sm">
        <span class="font-semibold">${label}</span>
        <span class="text-asfa-text/70">${ptsLabel(v)} lifetime National points</span>
      </div>
      <div class="relative h-2 bg-asfa-bg2 border border-asfa-border mt-1 mb-5" role="img"
           aria-label="${label}: ${ptsLabel(v)} lifetime National points; the mark is ${bitch} for a bitch, ${dog} for a dog">
        <div class="h-full bg-asfa-accent" style="width:${pct(v)}%"></div>
        <span class="absolute -top-1 -bottom-1 border-l-2 border-asfa-text/60" style="left:${pct(bitch)}%" aria-hidden="true"></span>
        <span class="absolute -bottom-4 text-[10px] font-mono text-asfa-text/60 -translate-x-1/2 whitespace-nowrap" style="left:${pct(bitch)}%" aria-hidden="true">bitch ${bitch}</span>
        <span class="absolute -bottom-4 right-0 text-[10px] font-mono text-asfa-text/60 whitespace-nowrap" aria-hidden="true">dog ${dog}</span>
      </div>
      ${note ? `<p class="text-xs text-asfa-text/60">${note}</p>` : ''}
    </div>`;
}

/** MRC and SMC need 12 points together and at least 2 of them mixed. With the
    12 there but not the 2, the bar is full yet the title is not earned; say
    what is missing instead of leaving "12 / 12" to puzzle over. */
function mixedShortfall(breed, mixed, word) {
  const short = 2 - (mixed || 0);
  if ((breed || 0) + (mixed || 0) < 12 || short <= 0) return '';
  return `${ptsLabel(short)} more ${word} point${short === 1 ? '' : 's'} needed`;
}

/** What an MRC or SMC bar still lacks: at least 2 of its 12 points must be
    mixed (§5.3 in both rule books), however many breed points it holds. The
    bar counts breed points too, so without this 5 BRC points read as 5 MRC. */
function mixedNeeded(mixed, word) {
  const short = 2 - (mixed || 0);
  if (short <= 0) return '';
  return mixed ? `needs ${ptsLabel(short)} more ${word} point${short === 1 ? '' : 's'}` : `needs 2 ${word} points`;
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

/** The number the guide prints for a hound: a duplicate's shared number,
    or an unnumbered hound's label (NOTRA lists a hound as FTE, first time
    entered, or PEND, registration pending, until it has a race number; the
    site numbers those -2, -3 to tell them apart). */
function publishedId(dog) {
  if (dog.duplicate_of) return dog.duplicate_of;
  return dog.unnumbered ? dog.id.replace(/-\d+$/, '') : dog.id;
}

function idNote(dog) {
  if (dog.duplicate_of) return 'a number the guide lists twice';
  if (dog.unnumbered) return /FTE/.test(dog.id) ? 'no race number yet: first time entered' : 'no race number yet: registration pending';
  return '';
}

/** What to call a meet: its date when the code carries one, otherwise the
    year and the registrar's number. WRA's report dates no meet: its slots
    are "Latest meet", "Meet 2", "Meet 3". */
function meetLabel(meet, org) {
  if (meet.date) return formatDateShort(meet.date);
  if (org === 'wra') return meet.code;
  if (org === 'notra-whippets' && /^#/.test(meet.code)) return meet.year ? `${meet.year}, OTR-only meet` : 'OTR-only meet';
  if (org === 'aok9') {
    const match = /^(\d{4})-S(\d+)/.exec(meet.code);
    if (match) return `${match[1]}, sanctioned meet ${Number(match[2])}`;
  }
  if (meet.year) return `${meet.year}, meet ${meet.code.replace(/^[A-Za-z]+/, '')}`;
  return 'undated';
}

/** The arithmetic spelled out for a program's own rule: WRA's average (rule
    5.2) is a plain mean; NOTRA's whippet WAVE leaves OTR-only meets out and,
    with nothing completed, averages scratches only across three graded
    meets, as the recorder does. */
function averageArithmetic(org, meets) {
  const r = (x) => waveLabel(x);
  const n = (x) => ptsLabel(x);
  if (org === 'wra') {
    const complete = meets.filter((m) => m.complete && m.score != null).map((m) => m.score);
    const listed = meets.filter((m) => m.score != null).map((m) => m.score);
    if (complete.length) {
      return complete.length === 1 ? `the one completed meet, ${n(complete[0])}`
        : `(${complete.map(n).join(' + ')}) ÷ ${complete.length} = ${r(complete.reduce((a, b) => a + b, 0) / complete.length)}`;
    }
    if (listed.length) return `no meet completed, so the mean of the incomplete ones: ${r(listed.reduce((a, b) => a + b, 0) / listed.length)}`;
    return '';
  }
  const graded = meets.filter((m) => m.graded !== false);
  const skipped = meets.length - graded.length;
  const note = skipped ? ` (${skipped === 1 ? 'the OTR-only meet is' : `${skipped} OTR-only meets are`} left out)` : '';
  const completeMeets = graded.filter((m) => m.complete && m.score != null);
  if (!completeMeets.length) {
    if (graded.length === 3 && graded.every((m) => m.score != null)) {
      return `every graded meet was a scratch, so the plain mean: ${r(graded.reduce((s, m) => s + m.score, 0) / 3)}${note}`;
    }
    return `no completed graded meet${note}`;
  }
  return `${waveArithmetic(completeMeets)}${note}`;
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

/** Titles the points columns say this hound holds, as badges. A whippet
    shows one, the title in use (WRA rule 7.2, NOTRA rule 5.6). */
function titleBadges(org, dog) {
  const spec = ORGS[org];
  if (spec.titleInUse) {
    const held = spec.titleInUse(dog);
    return held ? `<span class="badge ${held.cls} normal-case" title="${esc(held.name)}">${esc(held.title)}</span>` : '';
  }
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

/** A prominent pointer between NOTRA's two guides, at the top of each
    overview: the text, then a button in the other section's colour. */
function crossLink(text, href, label, colour) {
  return `
    <div class="callout callout-${colour} flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <p class="text-sm leading-relaxed max-w-prose">${text}</p>
      <a href="${href}" class="btn shrink-0 text-asfa-${colour}">${label} →</a>
    </div>`;
}

/* ------------------------------------------------- whippet title helpers */

/** WRA rule 7.2: each title replaces the one before it in use (the CRX the
    CR, the WRCh the CRX, the WRChX the WRCh), so a whippet carries one. */
function wraTitleInUse(dog) {
  const titles = (dog.titles_record || []).map(([title]) => title);
  const last = (re) => titles.filter((title) => re.test(title)).pop();
  const title = last(/^WRChX/) || last(/^WRCh$/) || last(/^CR/);
  if (!title) return null;
  return {
    title,
    cls: /^WRChX/.test(title) ? 'badge-t-lcm' : /^WRCh/.test(title) ? 'badge-t-fch' : 'badge-t-tcp',
    name: /^WRChX/.test(title) ? 'Whippet Race Champion Excellent' : /^WRCh/.test(title) ? 'Whippet Race Champion'
      : /^CRX/.test(title) ? 'Companion Racer Excellent' : 'Companion Racer',
  };
}

/** WRCh points: the Registrar's, or the report's for a whippet the Point
    Records do not list. */
function wraWrchPoints(dog) {
  return dog.in_records ? dog.wrch : dog.wrch_site;
}

/** The CR ladder by level: 1 CR, 2 CRX, 3 CRX-II and on. */
function wraCrTitle(level) {
  if (level <= 0) return '';
  if (level === 1) return 'CR';
  return level === 2 ? 'CRX' : `CRX-${romanLevel(level - 1)}`;
}

/** The WRA title ladders (rules 7.5.1 to 7.5.4), read from the Registrar's
    Point Records: the CR and CRX run on race points from completed meets and
    close at the WRCh; the WRCh needs 15 WRCh points; the WRChX runs on
    lifetime National points, 50 for a dog and 30 for a bitch, and neither
    list says which a whippet is, so its bar marks both. */
function wraTitleProgress(dog, feed) {
  const titles = dog.titles_record || [];
  const dateOf = (name) => (titles.find(([title]) => title === name) || [])[1];
  const out = [];
  const wrch = Boolean(dog.titled && dog.titled.wrch);
  const wrchPts = wraWrchPoints(dog);
  out.push(progressBar(wrch ? (wrchPts ?? 15) : wrchPts, 15, 'WRCh · Whippet Race Champion', {
    done: wrch,
    pending: !wrch && (wrchPts || 0) >= 15 ? 'no title date in the record yet' : '',
    note: wrch && dateOf('WRCh') ? `Earned ${formatDate(dateOf('WRCh'))}.` : '',
  }));
  const level = (dog.titled && dog.titled.cr) || 0;
  if (wrch) {
    if (level) {
      out.push(`<p class="text-sm mt-3"><span class="font-semibold">CR titles</span>
        <span class="text-asfa-text/70">· ${wraCrTitle(level)} before the WRCh; the CRX titles go only to whippets without one (rule 7.5.2).</span></p>`);
    }
  } else {
    const need = level === 0 ? 15 : 75 + 60 * (level - 1);
    const name = level === 0 ? 'Companion Racer' : 'Companion Racer Excellent';
    // The record's level governs: points past the mark without the next
    // title in the record are shown as such, not as earned.
    out.push(progressBar(dog.cr_points, need, `${wraCrTitle(level + 1)} · ${name}${level ? ` (${wraCrTitle(level)} earned)` : ''}`, {
      done: false,
      pending: (dog.cr_points || 0) >= need ? 'not yet in the record' : '',
      note: 'Race points from completed meets (rules 7.5.1 and 7.5.2).',
    }));
  }
  // The report's lifetime figure, as the tiles and career standings show it;
  // the Registrar's Point Records differ for a few older whippets, and the
  // line names their figure then rather than silently swapping one in.
  const nat = dog.lftm || 0;
  const registrar = dog.in_records && dog.nat_record != null && Math.abs(dog.nat_record - nat) > 0.01
    ? dog.nat_record : null;
  const xTitles = titles.filter(([title]) => /^WRChX/.test(title));
  // The next WRChX level: the first at 50 / 30, each further one 50 / 30 on.
  const next = xTitles.length + 1;
  const xName = (n) => (n === 1 ? 'WRChX' : `WRChX-${romanLevel(n)}`);
  out.push(twoMarkBar(nat, 30 * next, 50 * next,
    `${xName(next)} · Whippet Race Champion Excellent${xTitles.length ? ` (${xName(xTitles.length)} earned)` : ''}`,
    [
      xTitles.length ? `${xTitles.map(([title, when]) => `${esc(title)}${when ? ` ${formatDate(when)}` : ''}`).join('; ')}.` : '',
      registrar != null ? `The Registrar's Point Records list ${ptsLabel(registrar)} lifetime National points.` : '',
      'Fifty lifetime National points for a dog, thirty for a bitch, and again at each further fifty or thirty (rule 7.5.4). Neither list gives a whippet\'s sex, so the bar marks both.',
    ].filter(Boolean).join(' ')));
  out.push(`<p class="text-xs text-asfa-text/60 mt-3">${titles.length
    ? `On record: ${titles.map(([title, when]) => `${esc(title)}${when ? ` (${formatDateShort(when)})` : ''}`).join(', ')}.`
    : dog.in_records ? 'No titles on record.'
      : `Not in the Registrar's Point Records${feed && feed.records_date ? ` of ${formatDate(feed.records_date)}` : ''}; the bars use the report's own columns.`}</p>`);
  return out.join('');
}

/** NOTRA rule 5.6: a whippet shows one NOTRA suffix, its highest. */
function notraWhippetTitleInUse(dog) {
  if (dog.titled && dog.titled.sorc) return { title: 'SORC', cls: 'badge-t-lcm', name: 'Supreme Oval Racing Champion' };
  if (dog.titled && dog.titled.orc) return { title: 'ORC', cls: 'badge-t-fch', name: 'Oval Racing Champion' };
  return null;
}

/** NOTRA whippet titles (rules 5.3 and 5.4): the ORC on 15 ORC points; the
    SORC on lifetime National points, 50 for a dog and 30 for a bitch, which
    the guide cannot tell apart, so the recorder's title record decides. */
function notraWhippetProgress(dog) {
  const record = dog.title_record || {};
  const orc = Boolean(dog.titled && dog.titled.orc);
  const sorc = Boolean(dog.titled && dog.titled.sorc);
  const where = (meet, when) => `${meet ? ` at meet ${esc(meet)}` : ''}${when ? `, ${formatDate(when)}` : ''}`;
  return [
    progressBar(dog.orc, 15, 'ORC · Oval Racing Champion', {
      done: orc,
      note: orc && (record.orc_meet || record.orc_date) ? `Earned${where(record.orc_meet, record.orc_date)}.` : '',
    }),
    // The guide records the SORC itself and nothing beyond, so a holder's
    // bar runs on to SORC II at 100 / 60.
    twoMarkBar(dog.lftm || 0, sorc ? 60 : 30, sorc ? 100 : 50,
      `${sorc ? 'SORC II' : 'SORC'} · Supreme Oval Racing Champion${sorc ? ' (SORC earned)' : ''}`,
      [
        sorc ? `SORC earned${where(record.sorc_meet, record.sorc_date)}, by the recorder's title record; the guide records no SORC II or higher.` : '',
        'Fifty lifetime National points for a dog, thirty for a bitch, and again at each further fifty or thirty (rule 5.4). The guide prints no sex, so the bar marks both.',
      ].filter(Boolean).join(' ')),
  ].join('');
}

/** NOTRA's Whippet guide writes faults out rather than counting them. */
function notraWhippetFaults(dog) {
  const faults = dog.faults || {};
  if (!faults.oc_dnf && !faults.dq) return '<p class="text-sm text-asfa-text/70">None recorded.</p>';
  return `
    ${faults.oc_dnf ? `<p class="text-sm"><span class="font-semibold">Off course and did not finish:</span> <span class="font-mono text-xs">${esc(faults.oc_dnf)}</span></p>` : ''}
    ${faults.dq ? `<p class="text-sm mt-1"><span class="font-semibold">Disqualifications:</span> <span class="font-mono text-xs">${esc(faults.dq)}</span></p>` : ''}
    <p class="text-xs text-asfa-text/60 mt-2">As the recorder writes them: the meet code, then OC (off course), DNF (did not finish) or DQ,
      with the program and the number of programs in the meet, so DNF 3/4 is the third of four.</p>`;
}

/* sortableHead and wireSort live in app.js; sortRows stays here for its
   racing-specific tiebreaks. */
function sortRows(rows, columns, sort) {
  const col = columns.find(([key]) => key === sort.key) || columns[0];
  const key = col[0];
  // A dog whose newest AOK9 meet is an undated code (2025-S67) has only a
  // last_year; "2025" sorts among that year, just below its dated meets.
  const value = (row) => (key === 'last_raced' && row.last_raced == null && row.last_year != null
    ? String(row.last_year) : row[key]);
  return [...rows].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string') return sort.dir * av.localeCompare(bv);
    return sort.dir * (av - bv) || (a.rank_breed ?? 1e9) - (b.rank_breed ?? 1e9);
  });
}

/* ----------------------------------------------------------- overview page */

function renderRacingOverview(org, feed, main, singles = null) {
  racingKennels(org, feed);
  const spec = ORGS[org];
  const season = feed.season;
  const stats = feed.stats;
  const dogs = feed.dogs.map((dog) => ({ ...dog, breed_lc: dog.breed.toLowerCase() }));
  const byId = new Map(dogs.map((dog) => [dog.id, dog]));
  const sections = feed.sections;
  const hasPrevious = Boolean(feed.previous_guide_date);
  const nouns = spec.nouns;

  document.title = `${spec.title || `${spec.name} ${spec.program}`} standings — Gazehound Stats`;

  // Singles runs at the same AOK9 meets, so its dogs and meets count in the
  // program's totals; the Singles feed carries the combined figures.
  const combined = singles && singles.combined;
  // A one-breed program (the whippet bodies) has no breeds to count or
  // compare: its tiles, standings and browse speak of the one breed.
  const single = Boolean(spec.singleBreed);
  const tiles = spec.overviewTiles ? spec.overviewTiles(stats) : [
    [combined ? combined.dogs_raced : stats.hounds_raced, `${nouns} racing this year`],
    [stats.hounds_ytd, `${nouns} with points this year`],
    single ? [stats.hounds_active, `active ${nouns}`]
      : [combined ? combined.breeds_raced : stats.breeds_raced, 'breeds racing this year'],
    [combined ? combined.meets_this_year : stats.meets_this_year, `meets this year`],
    spec.titledTile(stats),
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
  const leadersBoard = single ? '' : `
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
        <p class="text-xs text-asfa-text/60 mb-3">All-time totals. Rank is against every ${spec.noun} ever registered; only ${nouns} still racing are listed, so retired ${nouns} hold the gaps. ${spec.careerNote || `Thirty points make a ${supremeLabel}, sixty a ${supremeLabel}2, and so on.`}</p>
        ${top.length ? `<div class="tbl-wrap"><table class="tbl">
          <thead><tr><th scope="col" class="num">Rank</th><th scope="col">${spec.noun[0].toUpperCase() + spec.noun.slice(1)}</th>${single ? '' : '<th scope="col">Breed</th>'}<th scope="col" class="num">Points</th><th scope="col">Title</th></tr></thead>
          <tbody>${top.map((dog) => `
            <tr>
              <td class="num font-semibold">${dog[rankKey]}</td>
              <td><a href="${racingDogUrl(org, dog.id)}" class="lnk font-semibold">${esc(dog.call_name)}</a></td>
              ${single ? '' : `<td class="text-asfa-text/80">${esc(dog.breed)}</td>`}
              <td class="num font-semibold text-asfa-accent">${ptsLabel(dog[field])}</td>
              <td>${spec.titleInUse ? titleBadges(org, dog) : dog.titled[supremeKey] ? `<span class="badge badge-t-lcm">${supremeLabel}${dog.titled[supremeKey] > 1 ? dog.titled[supremeKey] : ''}</span>` : ''}</td>
            </tr>`).join('')}</tbody>
        </table></div>` : `<p class="text-sm text-asfa-text/70">None recorded.</p>`}
      </div>`;
  }).join('');

  const newTitles = feed.titles_since_previous || [];
  const titlesBoard = hasPrevious ? `
      <div class="card">
        <h2 class="card-title">New titles since ${formatDate(feed.previous_guide_date)}</h2>
        <p class="text-xs text-asfa-text/60 mb-3">${spec.titlesBoardNote || 'Read from the points columns of consecutive guides.'}</p>
        ${newTitles.length ? `<div class="tbl-wrap"><table class="tbl"><tbody>${newTitles.slice(0, 40).map((row) => `
          <tr><td><a href="${racingDogUrl(org, row.id)}" class="lnk font-semibold">${esc(row.call_name)}</a></td>
              ${single ? '' : `<td class="text-asfa-text/80">${esc(row.breed)}</td>`}
              <td class="num"><span class="badge badge-t-fch">${esc(row.title)}</span></td></tr>`).join('')}</tbody></table></div>`
          : `<p class="text-sm text-asfa-text/70">No new titles between the two guides.</p>`}
      </div>` : '';

  // One-breed programs: every dog with points this year, ranked, in place of
  // the per-breed cards.
  const Noun = spec.noun[0].toUpperCase() + spec.noun.slice(1);
  const fullStandings = single ? dogs.filter((dog) => dog.rank_all)
    .sort((a, b) => a.rank_all - b.rank_all || a.call_name.localeCompare(b.call_name)) : [];
  const waveKey = spec.waves[0][0];
  const gradeKey = spec.waves[0][2];
  const standingsTable = `
      <div class="card">
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th scope="col" class="num">Rank</th><th scope="col">${Noun}</th><th scope="col">Registered name</th>
            <th scope="col">Owner</th><th scope="col" class="num">Points</th><th scope="col" class="num">${spec.waves[0][1]}</th></tr></thead>
          <tbody>${fullStandings.map((dog) => `
            <tr>
              <td class="num font-semibold">${dog.rank_all}</td>
              <td><a href="${racingDogUrl(org, dog.id)}" class="lnk font-semibold">${esc(dog.call_name)}</a></td>
              <td class="text-asfa-text/80">${esc(dog.registered_name)}</td>
              <td class="text-asfa-text/80">${racingOwners(org, dog)}</td>
              <td class="num font-semibold text-asfa-accent">${ptsLabel(dog.ytd)}</td>
              <td class="num">${waveLabel(dog[waveKey])} ${gradeBadge(dog[gradeKey])}</td>
            </tr>`).join('')}</tbody>
        </table></div>
      </div>`;

  /* The whippet bodies share one section whose header nav names the bodies,
     so each body's own tabs sit at the top of its page. */
  const TAB_LABELS = [['overview', 'Overview'], ['standings', 'Standings'], ['browse', 'Browse'], ['kennels', 'Kennels'], ['about', 'About']];
  const subTabs = spec.subTabs ? `
    <nav class="flex flex-wrap gap-2 no-print subtabs-${spec.subTabs}" aria-label="${esc(spec.name)} pages" id="sub-tabs">
      ${TAB_LABELS.map(([id, label]) => `<a href="#${id}" class="tab" data-tab="${id}">${label}</a>`).join('')}
    </nav>` : '';

  main.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="font-display text-3xl text-asfa-text">${spec.title || `${spec.name} ${spec.program}`}</h1>
        <p class="text-sm text-asfa-text/70 mt-1">
          ${spec.intro ? spec.intro(feed) : `${season} standings from the grading guide ${guideDate(feed)}, as published by
          <a href="${esc(feed.site_url)}" class="lnk" target="_blank" rel="noopener noreferrer">${esc(feed.site_url.replace(/^https?:\/\//, ''))}</a>.`}
        </p>
      </div>
      ${calendarButton(spec.calendar, spec.calendarLabel || `${spec.name} race calendar`, org)}
    </div>
    ${subTabs}

    <section id="overview" class="space-y-8">
    ${spec.overviewNote ? spec.overviewNote(feed) : ''}
    <section id="tiles" class="grid grid-cols-2 md:grid-cols-5 gap-3">
      ${tiles.map(([value, label]) =>
        `<div class="tile"><div class="tile-value">${value}</div><div class="tile-label">${label}</div></div>`).join('')}
    </section>

    <section class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="card md:row-span-2">
        <h2 class="card-title">${single ? 'Standings' : 'All-breed standings'}</h2>
        <p class="text-xs text-asfa-text/60 mb-3">${spec.seasonLabel}${single ? '' : ', all breeds'}.</p>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th scope="col" class="num">Rank</th><th scope="col">${Noun}</th>${single ? '' : '<th scope="col">Breed</th>'}<th scope="col" class="num">Points</th></tr></thead>
          <tbody>${allBreed.map((dog) => `
            <tr>
              <td class="num font-semibold">${dog.rank_all}</td>
              <td><a href="${racingDogUrl(org, dog.id)}" class="lnk font-semibold">${esc(dog.call_name)}</a></td>
              ${single ? '' : `<td class="text-asfa-text/80">${esc(dog.breed)}</td>`}
              <td class="num font-semibold text-asfa-accent">${ptsLabel(dog.ytd)}</td>
            </tr>`).join('')}</tbody>
        </table></div>
        ${single && fullStandings.length > allBreed.length ? `<a href="${spec.page}#standings" class="lnk text-sm inline-block mt-3">All ${fullStandings.length} with points →</a>` : ''}
      </div>
      ${leadersBoard}
      ${single ? `${careerBoards}<div class="space-y-6">${titlesBoard}</div>` : `<div class="space-y-6">${careerBoards}${titlesBoard}</div>`}
    </section>
    </section>

    <section id="standings" class="space-y-4">
      <div>
        <h2 class="font-display text-2xl text-asfa-text">${single ? 'Standings' : 'Standings by breed'}</h2>
        <p class="text-sm text-asfa-text/70 mt-1">Ranked by ${spec.seasonLabel}${single ? '; ties share a rank' : ''}.</p>
      </div>
      ${single
        ? (fullStandings.length ? standingsTable : `<p class="text-sm text-asfa-text/70">No ${nouns} have points yet this year.</p>`)
        : rankedSections.length
          ? `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${standingsCards}</div>`
          : `<p class="text-sm text-asfa-text/70">No ${nouns} have points yet this year.</p>`}
    </section>

    <section id="browse" class="space-y-6">
    <div class="card">
      <h2 class="card-title">${single ? `Browse ${nouns}` : 'Browse by breed'}</h2>
      <p class="text-xs text-asfa-text/60 mb-3">
        ${spec.browseNote ? spec.browseNote(feed) : `${nouns.charAt(0).toUpperCase() + nouns.slice(1)} active since ${formatDate(feed.active_since)}`}; the whole
        registry (${stats.hounds_registry.toLocaleString('en-US')} ${nouns}) is a click away below the table.
      </p>
      ${single ? '' : sections.length > 30 ? `
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
        ${spec.kennelNote || `The guide prints a surname and nothing else, so a kennel here is a surname within a
        breed: two Joneses racing Pharaoh Hounds share a line, and one owner racing two breeds
        gets two. A co-owned ${spec.noun} counts for every surname on its row.`}
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
    document.querySelectorAll('#sub-tabs a[data-tab]').forEach((link) => {
      const on = link.dataset.tab === tab;
      link.classList.toggle('tab-active', on);
      if (on) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    // After the browser's own jump to the anchor, and without the page's smooth
    // scrolling, so the page heading stays in view.
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'instant' }), 0);
  }
  showTab();
  window.addEventListener('hashchange', showTab);


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
    if (!grid) return;   // a one-breed program has no breed chips
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
              if (key === 'registered_name') return `<td class="text-asfa-text/80">${esc(dog[key])}</td>`;
              if (key === 'owner_raw') return `<td class="text-asfa-text/80">${racingOwners(org, dog)}</td>`;
              if (key === 'last_raced') return `<td class="whitespace-nowrap">${dog.last_raced ? formatDateShort(dog.last_raced) : (dog.last_year ? dog.last_year : '—')}</td>`;
              if (key === 'rank_breed') return `<td class="num font-semibold">${dog.rank_breed ?? '—'}</td>`;
              const waveSpec = spec.waves.find(([f]) => f === key);
              if (waveSpec) {
                return `<td class="num">${waveLabel(dog[key])} ${gradeBadge(dog[waveSpec[2]])}</td>`;
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
        ${single ? '' : `<h3 class="font-display text-xl text-asfa-text">${esc(section.breed)}</h3>`}
        <p class="text-sm text-asfa-text/70">${section.ytd} with points this year · ${section.active.toLocaleString('en-US')} active · ${section.registry.toLocaleString('en-US')} all time</p>
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
            ? `Showing every ${single ? spec.noun : esc(section.breed)} ever registered. <button type="button" id="registry-toggle" class="lnk">Active ${nouns} only</button>`
            : `<button type="button" id="registry-toggle" class="lnk">Show all ${section.registry.toLocaleString('en-US')} ${single ? '' : `${esc(section.breed)} `}${nouns} ever registered</button>`}
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
        <thead><tr><th scope="col">Kennel</th>${single ? '' : '<th scope="col">Breed</th>'}<th scope="col" class="num">${nouns.charAt(0).toUpperCase() + nouns.slice(1)}</th>
          <th scope="col" class="num">This year</th><th scope="col" class="num">Career</th></tr></thead>
        <tbody>${shown.map((owner) => `
          <tr>
            <td><a href="${racingOwnerUrl(org, owner.key)}" class="lnk font-semibold" data-owner="${esc(owner.key)}">${esc(owner.name)}</a></td>
            ${single ? '' : `<td><a href="${racingBreedUrl(org, owner.breed_slug)}" class="lnk">${esc(owner.breed)}</a></td>`}
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
  // Championship titles among the kennel's active dogs: the overview tile's
  // count, scoped to one kennel.
  const { titledKeys, titledLabel } = spec;
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
        ${single ? '' : `<p class="text-sm text-asfa-text/70"><a href="${racingBreedUrl(org, owner.breed_slug)}" class="lnk">${esc(owner.breed)}</a></p>`}
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <div class="tile"><div class="tile-value">${owner.hounds}</div><div class="tile-label">active ${owner.hounds === 1 ? spec.noun : nouns}</div></div>
          <div class="tile"><div class="tile-value">${ptsLabel(owner.ytd)}</div><div class="tile-label">${spec.seasonLabel}</div></div>
          <div class="tile"><div class="tile-value">${ptsLabel(owner[sumField])}</div><div class="tile-label">${careerLabel}</div></div>
          <div class="tile"><div class="tile-value">${rows.filter((dog) => titledKeys.some((key) => dog.titled[key])).length}</div><div class="tile-label">${titledLabel}</div></div>
        </div>
      </section>
      <section class="card">
        <h2 class="card-title">${nouns.charAt(0).toUpperCase() + nouns.slice(1)}</h2>
        <div class="tbl-wrap"><table class="tbl">
          ${sortableHead(columns, kennelSort, hasPrevious ? '<th scope="col" class="num">Since</th>' : '')}
          <tbody>${rows.map((dog) => browseRow(dog, columns)).join('')}</tbody>
        </table></div>
        <p class="text-xs text-asfa-text/55 mt-3">
          A co-owned ${spec.noun} is listed under every ${single && org === 'wra' ? 'name' : 'surname'} on its guide row, so totals
          across kennels add to more than the ${single ? '' : 'breed '}total.
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

/* Points by entry: LGRA (rule book ch. V) and AOK9 (Sprint Rule Book 3.0 ch.
   V) share one table, by eligible entry with a fourth place from 41 up; NOTRA's
   Other-Breed table (rules 7.4) runs by starters, three places, to 22 and up. */
const POINTS_BY_ENTRY = {
  columns: ['Entry', 'High score', 'Second', 'Third', 'Fourth'],
  rows: [
    ['2 – 4', '1', '0.5', '', ''], ['5 – 7', '2', '1', '', ''], ['8 – 10', '3', '1.5', '0.5', ''],
    ['11 – 15', '4', '2', '1', ''], ['16 – 21', '5', '3', '1.5', ''], ['22 – 30', '6', '4', '2', ''],
    ['31 – 40', '7', '5', '3', ''], ['41 or more', '8', '6', '4', '2'],
  ],
};
const POINTS_BY_STARTERS = {
  columns: ['Starters', 'High score', 'Second', 'Third'],
  rows: [
    ['2', '1', '', ''], ['3 – 4', '1', '0.5', ''], ['5 – 7', '2', '1', ''], ['8 – 10', '3', '1.5', '0.5'],
    ['11 – 15', '4', '2', '1'], ['16 – 21', '5', '3', '1.5'], ['22 or more', '6', '4', '2'],
  ],
};

/* WRA (rules 7.3 and 7.4): WRCh and National points by adult starters, to
   the whippets with the most race points at the meet, five places from 80
   up. NOTRA's Whippet chart (rules 5.3 and 5.4): by starters from 15 up,
   four places. */
const POINTS_WRA = {
  columns: ['Adult starters', 'High score', 'Second', 'Third', 'Fourth', 'Fifth'],
  rows: [
    ['15 – 19', '2', '', '', '', ''], ['20 – 29', '3', '1', '', '', ''], ['30 – 39', '4', '2', '', '', ''],
    ['40 – 49', '5', '3', '1', '', ''], ['50 – 59', '6', '4', '2', '', ''], ['60 – 69', '7', '5', '3', '1', ''],
    ['70 – 79', '8', '6', '4', '2', ''], ['80 or more', '8', '6', '4', '3', '2'],
  ],
};
const POINTS_WHIPPET = {
  columns: ['Starters', 'First', 'Second', 'Third', 'Fourth'],
  rows: [
    ['15 – 19', '2', '', '', ''], ['20 – 29', '3', '1', '', ''], ['30 – 39', '4', '2', '', ''],
    ['40 – 49', '5', '3', '1', ''], ['50 – 59', '6', '4', '2', ''], ['60 or more', '7', '5', '3', '1'],
  ],
};

function pointsTable(table = POINTS_BY_ENTRY) {
  return `
    <div class="tbl-wrap mt-2"><table class="tbl">
      <thead><tr>${table.columns.map((col, i) => `<th scope="col"${i ? ' class="num"' : ''}>${col}</th>`).join('')}</tr></thead>
      <tbody>${table.rows.map((row) => `<tr>${row.map((cell, i) => `<td class="${i ? 'num' : ''}">${cell || '—'}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
}

/* The About tab's program-specific text. Each rule book has its own
   numbering and vocabulary, so these are written out per program rather
   than templated; the shared WAVE arithmetic and the common caveats sit in
   aboutRacing below. */
const ABOUT = {
  lgra: {
    waveNote: 'winning the high-point race in all three programs pays 8, 6 and 8 points; figure 8.2A in the rule book',
    gradeRule: 'rule 4.2.2.5',
    points: POINTS_BY_ENTRY,
    pointsIntro: `In each breed at a meet, the top two to four finishers earn points, depending on the
        entry. Championship points count the eligible entrants (titled hounds placed above the
        first untitled one are left out); National points count every starter. A hound that does
        not finish all races, finishes last, or beats no one earns neither.`,
    titles: `
      <p class="text-sm leading-relaxed mt-3">
        <strong>GRC</strong>, Gazehound Racing Champion: 12 GRC points, which only untitled
        hounds can earn. <strong>National points</strong> use the same values, go to titled and
        untitled hounds alike, and are what the standings here rank; 30 of them make a
        <strong>SGRC</strong>, Superior Gazehound Racing Champion, with SGRC II, III and so on at
        each further 30. <strong>JSR</strong> and <strong>SSR</strong> merit titles are earned
        by legs and are not tracked in the guide.
      </p>`,
    cannot: [],
    source: (feed) => `
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
        <li><strong>Standings</strong> rank the guide's YTD column, this year's National points, within each breed and across breeds. LGRA's own year-end lists ("Top LGRA Dogs", by breed and across breeds) rank the same figure.</li>
        <li><strong>Career standings</strong> rank career National points (the NGRC column) across every hound ever registered.</li>
        <li><strong>Titles</strong> are read from the points columns: 12 GRC points is a GRC, every 30 National points a further SGRC. The registrar's certificate is the record.</li>
      </ul>`,
    disclaimer: `
      <p class="text-sm leading-relaxed">
        These pages are an independent, unofficial project. They are <strong>not authorized,
        approved, or endorsed by the Large Gazehound Racing Association</strong>, and they are not
        an LGRA publication, service, or software. LGRA's name is used only to identify the source
        of the grading guide and the rule book cited here. The grading guide is LGRA's work and
        remains LGRA's property; it is reproduced with attribution and a link to the original.
        Wherever this site and the published guide disagree, <strong>the guide governs</strong>,
        and questions about a hound's record go to the LGRA Registrar/Recorder, not here.
      </p>`,
  },
  aok9: {
    waveNote: 'winning the high-point race in all three programs pays 8, 6 and 8 points; figure 8.2A in the rule book',
    gradeRule: 'rule 4.2.2.5',
    points: POINTS_BY_ENTRY,
    pointsIntro: `In each division at a meet, the top two to four finishers earn points, depending on the
        entry. Championship points count the eligible entrants (titled dogs placed above the first
        untitled one are left out); National points count every starter. A dog that does not
        finish all races, finishes last, or beats no one earns neither.`,
    titles: `
      <p class="text-sm leading-relaxed mt-3">
        Dogs race in a <strong>breed division</strong> when enough of their breed enter, and
        otherwise in a <strong>mixed division</strong>, so each dog carries two records.
        Championship points come from the table above and only untitled dogs earn them:
        <strong>BRC</strong> (Breed Racing Champion) is 12 BRC points from breed divisions;
        <strong>MRC</strong> (Mixed Racing Champion) is 12 BRC and MRC points together, at
        least 2 of them MRC. <strong>National points</strong> use the same values for the same
        placings, go to titled and untitled dogs alike, and never stop: National Breed points
        from breed divisions, National Mixed points from mixed divisions. The two together,
        earned this season, are the National points the standings here rank. Every 30 National
        Breed points make a <strong>SBRC</strong> (Supreme Breed Racing Champion) and every 30
        National Mixed points a <strong>SMRC</strong>, with II, III and so on. <strong>Turtle
        points</strong> go to the last-place finisher of a division, worth what first place was;
        12 make a <strong>TRC</strong> (Turtle Racing Champion) and 30 a <strong>STRC</strong>.
      </p>`,
    cannot: [`<li><strong>Companion titles are not tracked here.</strong> NSR, ESR and
          MSR (Novice, Expert and Master Sprint Racer, with "-S" when earned in Singles) come from
          the number of meets a dog completes, which the guide does not count, and AOK9 awards
          them when the owner applies. A dog that holds one shows it in its registered name.</li>`],
    source: (feed, singles) => `
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
      </p>`,
    disclaimer: `
      <p class="text-sm leading-relaxed">
        These pages are an independent, unofficial project. They are <strong>not authorized,
        approved, or endorsed by Racing and Coursing Enthusiasts (R.A.C.E.)</strong> or its AOK9
        program, and they are not an AOK9 publication, service, or software. The AOK9 name is
        used only to identify the source of the grading guide and the rule book cited here. The
        grading guide is R.A.C.E.'s work and remains its property; it is reproduced with
        attribution and a link to the original. Wherever this site and the published guide
        disagree, <strong>the guide governs</strong>, and questions about a dog's record go to
        the AOK9 National Racing Director, not here.
      </p>`,
  },
  notra: {
    waveNote: 'winning the high-point race in all three programs pays 8, 6 and 8 points; table 4-3 of the rules',
    gradeRule: 'rule 4.2.2',
    points: POINTS_BY_STARTERS,
    pointsIntro: `In each breed at a meet, the top three finishers earn points, depending on the number
        of starters (rules 7.4 and 7.5). ORC points count toward the title and stop at 12;
        National (NORC) points go to every hound and never stop. A hound that does not
        complete every program, finishes last, or beats no one earns neither.`,
    titles: `
      <p class="text-sm leading-relaxed mt-3">
        <strong>ORC</strong>, Oval Racing Champion: 12 ORC points (rule 7.4). <strong>National
        points</strong> use the same values, go to titled and untitled hounds alike, and are what
        the standings here rank; every 30 lifetime National points make a <strong>SORC</strong>,
        Supreme Oval Racing Champion, with SORC II, III and so on (rule 7.5). Two merit titles are
        earned by legs the guide counts (rule 7.3): <strong>JOR</strong>, Junior Oval Racer, after
        four meets completed without a disqualification, scratch, off-course run or did-not-finish,
        and <strong>SOR</strong>, Senior Oval Racer, after six legs, a leg being such a meet
        finished in the top half of the hounds that ran every heat.
      </p>`,
    cannot: [`<li><strong>Whippets have pages of their own.</strong> NOTRA keeps a separate Whippet
          guide with its own layout and rules (a rating as well as a WAVE, scores out of 29, an
          ORC at 15 points); it is on <a href="notra-whippets.html" class="lnk">NOTRA Whippets</a>,
          in the Whippet racing section. These pages cover the Other-Breed guide.</li>`],
    source: (feed) => `
      <p class="text-sm leading-relaxed">
        The National Oval Track Racing Association's Other-Breed Recorder publishes one workbook,
        the <a href="${esc(feed.source_page)}" class="lnk" target="_blank" rel="noopener noreferrer">Other-Breed grading guide</a>,
        updated after each meet, that race secretaries use to seed the first program. Its two
        sheets list every hound registered, active and inactive, with its WAVE, its ORC points,
        its National points for this year, prior years and lifetime, its legs toward the Junior
        and Senior Oval Racer titles, its DQ/OC/DNF counts, and the score, status and date of
        its last three meets. The arithmetic follows the
        <a href="${esc(feed.rules_url)}" class="lnk" target="_blank" rel="noopener noreferrer">NOTRA Rules</a>
        (February 2025). The guide's date is read from the "Current as of" note beside its link.
      </p>
      <ul class="text-sm leading-relaxed list-disc pl-5 mt-2 space-y-1">
        <li><strong>Standings</strong> rank the guide's YTD NORC column, this year's National points, within each breed and across breeds. NOTRA's own Top 10 by breed, kept in the same workbook, ranks the same figure.</li>
        <li><strong>Career standings</strong> rank lifetime National points (the LFTM NORC column) across every hound registered.</li>
        <li><strong>Titles</strong> are read from the points and legs columns: 12 ORC points is an ORC, every 30 lifetime National points a further SORC, four completed meets a JOR, six legs a SOR. The recorder's certificate is the record.</li>
        <li><strong>Hounds without a race number</strong> (FTE, first time entered; PEND, registration pending) are listed as the guide lists them, under those labels.</li>
      </ul>`,
    disclaimer: `
      <p class="text-sm leading-relaxed">
        These pages are an independent, unofficial project. They are <strong>not authorized,
        approved, or endorsed by the National Oval Track Racing Association</strong>, and they are
        not a NOTRA publication, service, or software. NOTRA's name is used only to identify the
        source of the grading guide and the rules cited here. The grading guide is NOTRA's work
        and remains NOTRA's property; it is reproduced with attribution and a link to the
        original. Wherever this site and the published guide disagree, <strong>the guide
        governs</strong>, and questions about a hound's record go to the NOTRA Other-Breed
        Recorder, not here.
      </p>`,
  },
  wra: {
    waveCard: (feed) => `
    <section class="card">
      <h2 class="card-title">Average and grades</h2>
      <p class="text-sm leading-relaxed">
        A meet's score is the race points a whippet earns there, by its place in each race, out
        of a possible 29 (rule 5.4). Its average is the mean of the completed meets among its last
        three meets; with none completed, the mean of the incomplete ones, where it scratched,
        did not finish or was disqualified; with no meet, 0 (rule 5.2). Puppy races are not
        graded and never count:
      </p>
      <p class="font-mono text-sm mt-2 p-3 bg-asfa-bg2 border border-asfa-border">
        Average = (sum of the completed meets) ÷ (number of completed meets)
      </p>
      <p class="text-sm leading-relaxed mt-2">
        The grade is a band on it: <strong>A</strong> 15 and up, <strong>B</strong> 10 to 14.9,
        <strong>C</strong> 4 to 9.9, <strong>D</strong> below 4 (rule 5.2). A whippet drops one
        grade for each year in which it has not completed a meet, so a grade can sit below its
        average's band. <strong>F</strong>, which the rule book does not define, appears only on
        whippets that have not yet raced outside puppy races; a first-time entrant races as a D.
      </p>
      <p class="text-sm leading-relaxed mt-2">
        This site recomputes every average from the three meets the report lists and shows the
        Registrar's published figure. The two agree for ${ORGS.wra.agreement(feed.stats)} of the
        whippets on the active list; where they differ, a whippet's page says so, and the
        published figure governs.
      </p>
    </section>`,
    points: POINTS_WRA,
    pointsIntro: `WRCh points and National points go to the whippets with the most race points at a
        meet, by the number of adult starters (rules 7.3 and 7.4). WRCh points go only to
        whippets without a WRCh: when the top scorer holds one, they pass to the next whippet
        without one. National points go to titled and untitled whippets alike. CR points are the
        race points themselves, from completed meets (rule 7.5.1).`,
    titles: `
      <p class="text-sm leading-relaxed mt-3">
        <strong>CR</strong>, Companion Racer: 15 race points from completed meets (rule 7.5.1).
        <strong>CRX</strong>, Companion Racer Excellent: 60 more, 75 in all, then CRX-II, CRX-III
        and so on at each further 60, for whippets without a WRCh or WRChX (rule 7.5.2).
        <strong>WRCh</strong>, Whippet Race Champion: 15 WRCh points (rule 7.5.3).
        <strong>WRChX</strong>, Whippet Race Champion Excellent: 50 lifetime National points for a
        dog or 30 for a bitch, with WRChX-II, -III and so on at each further 50 or 30 (rule 7.5.4).
        Each title replaces the one before it in use (rule 7.2), so a whippet here carries one,
        its highest; its page lists every title on record with its date. The Point Records also
        carry the points and titles of NAWRA, which merged into the WRA in 2017.
      </p>`,
    cannot: [
      `<li><strong>Few meet dates.</strong> The report lists a whippet's last three meets as scores
          and completion codes, newest first, with no dates or clubs. The one date these pages
          have is a whippet's last meet, from WRA's Meets Run by Dog page, which lists only the
          whippets that raced in the last two years.</li>`,
      `<li><strong>No race numbers.</strong> WRA issues none, so the call name is the key: a
          whippet's page address is built from it.</li>`,
      `<li><strong>No sex.</strong> Neither list gives it, and the WRChX needs it (50 points for a
          dog, 30 for a bitch), so WRChX titles here are the Registrar's, never computed.</li>`,
      (feed) => {
        const missing = feed.dogs.filter((dog) => !dog.in_records);
        const pointed = missing.filter((dog) => (dog.wrch_site || 0) > 0 || (dog.cr || 0) >= 15).length;
        return `<li><strong>Not every whippet is in the Point Records.</strong> ${missing.length} whippets
          on the active list have no row there; ${pointed
            ? `${pointed} of them have title points on the report`
            : 'none of them has a title or a WRCh point on the report'}, and their pages use the
          report's own figures.</li>`;
      },
      `<li><strong>Division II and puppy racing are not covered.</strong> DII points and titles are
          on the DII Registrar's lists (rule 7.5.5), and puppy races are not on the report.</li>`,
    ],
    source: (feed) => `
      <p class="text-sm leading-relaxed">
        The Whippet Racing Association publishes its
        <a href="${esc(feed.source_page)}" class="lnk" target="_blank" rel="noopener noreferrer">grading guide</a>
        as two reports, the active list and the inactive list, stamped with the date the Registrar
        last updated them. Together they list every whippet registered, with its grade and
        average, its CR, WRCh and National points, and, on the active list, the scores and
        completion codes of its last three meets, puppy races aside. Beside them the Registrar keeps the
        <a href="${esc(feed.records_url)}" class="lnk" target="_blank" rel="noopener noreferrer">Whippet Point Records</a>,
        which WRA's own help sheet names as the correct record of points and titles. The
        arithmetic follows the
        <a href="${esc(feed.rules_url)}" class="lnk" target="_blank" rel="noopener noreferrer">2026 WRA Rule Book</a>.
      </p>
      <ul class="text-sm leading-relaxed list-disc pl-5 mt-2 space-y-1">
        <li><strong>Standings</strong> rank the report's "N Pts ${feed.season}" column, this year's National points.</li>
        <li><strong>Career standings</strong> rank lifetime National points (the "N Pts L/T" column) across every whippet registered.</li>
        <li><strong>Titles and title points</strong> are the Point Records': the report's CR column reads 0 once a whippet has 15 WRCh points, and the help sheet calls the report's WRCh points wrong. Each row of the Point Records is matched to the report by call name, with the registered name and owner to confirm it.</li>
        <li><strong>Meets this year</strong> counts the meets marked verified on WRA's <a href="${ORGS.wra.calendar}" class="lnk" target="_blank" rel="noopener noreferrer">meet list</a>.</li>
        <li><strong>Racing this year</strong> counts the whippets whose last meet, on WRA's <a href="${esc(feed.meets_run_url)}" class="lnk" target="_blank" rel="noopener noreferrer">Meets Run by Dog</a> page${
          feed.meets_run_date ? ` as read on ${formatDate(feed.meets_run_date)}` : ''}, falls in ${feed.season}, puppy races included. The same page gives each whippet's <strong>last raced</strong> date.</li>
        <li><strong>Active</strong> means WRA's own active list, a status WRA keeps, not recent racing: ${feed.stats.hounds_active.toLocaleString('en-US')} whippets, ${
          feed.stats.raced_two_years != null ? `${feed.stats.raced_two_years} of them raced in the last two years` : 'many of them not raced in years'}. Test records and duplicate records in WRA's database are left out.</li>
      </ul>`,
    disclaimer: `
      <p class="text-sm leading-relaxed">
        These pages are an independent, unofficial project, added at the WRA's request. They are
        not a WRA publication, service, or software, and they are not endorsed by the Whippet
        Racing Association. The WRA's name is used only to identify the source of the reports,
        the Point Records and the rule book cited here. Those are the WRA's work and remain its
        property; they are reproduced with attribution and links to the originals. Wherever this
        site and the WRA's own records disagree, <strong>the WRA's records govern</strong>, and
        questions about a whippet's record go to the WRA Registrar, not here.
      </p>`,
  },
  'notra-whippets': {
    waveCard: (feed) => `
    <section class="card">
      <h2 class="card-title">WAVE, grades and rating</h2>
      <p class="text-sm leading-relaxed">
        WAVE is the weighted average of the completed meets among a whippet's last three, out of a
        possible 29: winning the high-point race in all four programs pays 8, 5, 8 and 8 points
        (table 4-4), and a three-program score is scaled up by 29 ÷ 22 first, as the guide prints
        it (rule 4.2.2):
      </p>
      <p class="font-mono text-sm mt-2 p-3 bg-asfa-bg2 border border-asfa-border">
        WAVE = (meet 1 + 0.7 × meet 2 + 0.5 × meet 3) ÷ 2.2
      </p>
      <p class="text-sm leading-relaxed mt-2">
        with meet 1 the most recent. Two completed meets divide by 1.7; one is the score itself.
        The recorder counts a meet marked N or F as completed. OTR-only meets, with fewer than 15
        starters, are listed but not graded (rule 2.2.3). With nothing completed, the recorder
        averages the scratches only when all three listed meets are graded ones, and this site
        does the same. The grade is a band on the four-program column of rule 4.2.2:
        <strong>A</strong> 15.2 and up, <strong>B</strong> 11 up to 15.2, <strong>C</strong> 7.6
        up to 11, <strong>D</strong> below 7.6. Whippets are seeded by the guide's
        <strong>rating</strong>, 1 the highest, which follows the WAVE (rule 4.2.3.4).
      </p>
      <p class="text-sm leading-relaxed mt-2">
        This site recomputes every WAVE from the three meets the guide lists and shows the
        recorder's published figure. The two agree for ${ORGS['notra-whippets'].agreement(feed.stats)}
        of whippets; where they differ, a whippet's page says so, and the published figure governs.
      </p>
    </section>`,
    points: POINTS_WHIPPET,
    pointsIntro: `At a meet with 15 or more whippet starters, the top finishers earn points by the
        number of starters (rule 5.3); smaller meets pay OTR points only and are not graded (rule
        2.2.3). ORC points go only to untitled whippets and stop at 15; National (NORC) points go
        to the first four by the same chart, titled or not (rule 5.4). Tied places split the
        points.`,
    titles: `
      <p class="text-sm leading-relaxed mt-3">
        <strong>ORC</strong>, Oval Racing Champion: 15 ORC points (rule 5.3), where other breeds
        need 12. <strong>SORC</strong>, Supreme Oval Racing Champion: 50 lifetime National points
        for a dog or 30 for a bitch, with SORC II, III and so on at each further 50 or 30 (rule
        5.4). A whippet shows one NOTRA suffix, its highest (rule 5.6). The OTR and OTRM titles
        (rule 5.5) and the Division II titles (rule 5.7) are kept on separate lists, not in the
        guide.
      </p>`,
    cannot: [
      `<li><strong>The guide prints no sex.</strong> The SORC needs 50 points for a dog and 30 for a
          bitch, so it is taken from the recorder's title record in the guide; SORC II and higher
          are not recorded there.</li>`,
      `<li><strong>OTR-only meets</strong> (fewer than 15 starters, coded #1, #2 and so on) are shown
          on a whippet's page but not graded, as in the guide.</li>`,
      `<li><strong>Older meets are undated.</strong> The guide's meet key starts in February 2022, so
          an older code shows without a date.</li>`,
      `<li><strong>Restricted whippets</strong>, shaded in the guide under rule 6.2, say so on their
          pages.</li>`,
    ],
    source: (feed) => `
      <p class="text-sm leading-relaxed">
        NOTRA's Whippet Recorder publishes the
        <a href="${esc(feed.source_page)}" class="lnk" target="_blank" rel="noopener noreferrer">Whippet grading guide</a>,
        a spreadsheet updated after each meet. It lists the whippets racing in recent seasons with
        their rating, grade and WAVE, ORC points, National points for this year, earlier years
        and lifetime, handicap points, the code, placing, score and status of their last three
        meets, and their title, off-course, did-not-finish and disqualification records. A key
        below the whippets dates each meet code. The arithmetic follows the
        <a href="${esc(feed.rules_url)}" class="lnk" target="_blank" rel="noopener noreferrer">NOTRA Rules</a>
        (February 2025). The guide's date is read from the "Current as of" note beside its link.
      </p>
      <ul class="text-sm leading-relaxed list-disc pl-5 mt-2 space-y-1">
        <li><strong>Standings</strong> rank the guide's Curr NORC column, this year's National points.</li>
        <li><strong>Career standings</strong> rank lifetime National points (the Lftm NORC column).</li>
        <li><strong>Titles:</strong> 15 ORC points is an ORC; the SORC is the recorder's title record. The recorder's certificate is the record.</li>
        <li><strong>Active</strong> means National points this year, or a meet since the start of last season; an OTR-only meet counts as racing, though it is never graded.</li>
        <li>Every other breed is on <a href="notra.html" class="lnk">NOTRA OB racing</a>, from NOTRA's Other-Breed guide.</li>
      </ul>`,
    disclaimer: `
      <p class="text-sm leading-relaxed">
        These pages are an independent, unofficial project. They are <strong>not authorized,
        approved, or endorsed by the National Oval Track Racing Association</strong>, and they are
        not a NOTRA publication, service, or software. NOTRA's name is used only to identify the
        source of the grading guide and the rules cited here. The grading guide is NOTRA's work
        and remains NOTRA's property; it is reproduced with attribution and a link to the
        original. Wherever this site and the published guide disagree, <strong>the guide
        governs</strong>, and questions about a whippet's record go to the NOTRA Whippet
        Recorder, not here.
      </p>`,
  },
};

function aboutRacing(org, feed, singles = null) {
  const spec = ORGS[org];
  const about = ABOUT[org];
  const waveCard = about.waveCard ? about.waveCard(feed) : `
    <section class="card">
      <h2 class="card-title">WAVE and grades</h2>
      <p class="text-sm leading-relaxed">
        WAVE is the weighted average of the complete meets among a ${spec.noun}'s last three,
        out of a possible ${spec.waveMax} (${about.waveNote}):
      </p>
      <p class="font-mono text-sm mt-2 p-3 bg-asfa-bg2 border border-asfa-border">
        WAVE = (meet 1 + 0.7 × meet 2 + 0.5 × meet 3) ÷ 2.2
      </p>
      <p class="text-sm leading-relaxed mt-2">
        with meet 1 the most recent. Two complete meets divide by 1.7; one is the score
        itself; a meet marked incomplete is skipped unless every listed meet is (rule 4.2.2).
        Race secretaries use the WAVE to seed the first program. The grade is a band on it:
        <strong>A</strong> 11 and up, <strong>B</strong> 8 to 10.999, <strong>C</strong> 5.5
        to 7.999, <strong>D</strong> below 5.5 (${about.gradeRule}).
      </p>
      <p class="text-sm leading-relaxed mt-2">
        This site recomputes every WAVE from the three meets the guide lists and shows the
        ${spec.officer}'s published figure. The two agree for ${spec.agreement(feed.stats)} of
        ${spec.nouns}; where they differ, a ${spec.noun}'s page says so, and the published
        figure governs.
      </p>
    </section>`;
  const common = `
    ${waveCard}
    <section class="card">
      <h2 class="card-title">Points and titles</h2>
      <p class="text-sm leading-relaxed">
        ${about.pointsIntro}
      </p>
      ${pointsTable(about.points)}
      ${about.titles}
    </section>
    <section class="card">
      <h2 class="card-title">What the guide cannot tell you</h2>
      <ul class="text-sm space-y-3">
        <li><strong>There is no race-by-race record.</strong> The guide keeps a ${spec.noun}'s last
          three meets and its running totals, nothing older and no times.</li>
        ${spec.singleBreed ? '' : `<li><strong>Points do not compare across breeds.</strong> A breed that fills a program
          most weekends offers far more of them than one that rarely races.</li>`}
        ${about.cannot.map((item) => (typeof item === 'function' ? item(feed) : item)).join('')}
      </ul>
    </section>
    <section class="card">
      <h2 class="card-title">Where the numbers come from</h2>
      ${about.source(feed, singles)}
      <p class="text-sm leading-relaxed mt-3">
        A parsed copy of each new guide is archived by date so movement between guides can be
        shown. The whole method, code included, is on
        <a href="https://github.com/jackrabbit-project/stats" class="lnk" target="_blank" rel="noopener noreferrer">GitHub</a>.
      </p>
    </section>
    <section class="card" id="disclaimer">
      <h2 class="card-title">Disclaimer</h2>
      ${about.disclaimer}
      <p class="text-sm mt-3">
        Corrections: <a href="mailto:info@gazehound.io" class="lnk">info@gazehound.io</a>
      </p>
    </section>`;
  return common;
}

/* --------------------------------------------------------------- dog page */

function renderRacingDog(org, feed, main, singles = null) {
  racingKennels(org, feed);
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
    const dq = feed.dq_columns ? unpackDq(feed, dog.dq) : [];
    const primary = meetsByStream[0][2];
    const [waveField, waveTitle, gradeField] = spec.waves[0];

    document.title = `${dog.call_name} — ${dog.breed} — ${spec.name} — Gazehound Stats`;

    const move = dog.movement;
    let movementLine = '';
    if (move && !move.new) {
      const parts = [];
      const rank = move.rank_breed_delta;
      const within = spec.singleBreed ? 'in the standings' : 'in the breed';
      if (rank > 0) parts.push(`climbed ${rank} place${rank === 1 ? '' : 's'} ${within}`);
      else if (rank < 0) parts.push(`fell ${-rank} place${rank === -1 ? '' : 's'} ${within}`);
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
      ? (spec.singleBreed ? 'this year' : `in ${esc(dog.breed)} this year`)
      : 'no points this year';

    const rankLine = dog.rank_breed && spec.singleBreed
      ? `Ranked <strong>#${dog.rank_breed}</strong> of ${feed.stats.hounds_ytd} ${spec.nouns} with points this year,
         on <strong>${ptsLabel(dog.ytd)}</strong> ${spec.seasonLabel}.`
      : dog.rank_breed
      ? `Ranked <strong>#${dog.rank_breed}</strong> of ${feed.sections.find((s) => s.slug === dog.breed_slug)?.ytd ?? '?'} ${esc(dog.breed)}
         ${spec.nouns} with points this year, and <strong>#${dog.rank_all}</strong> of ${feed.stats.hounds_ytd} across every breed,
         on <strong>${ptsLabel(dog.ytd)}</strong> ${spec.seasonLabel}.`
      : `No ${spec.seasonLabel} yet${dog.last_raced || dog.last_year ? `; last listed meet ${dog.last_raced ? formatDateShort(dog.last_raced) : dog.last_year}` : ''}.`;

    const titleProgress = spec.titleProgress ? spec.titleProgress(dog, feed) : [
      ...spec.champion.map(([field, label, name, need, rule]) => progressBar(
        rule ? rule.value(dog) : dog[field], need, `${label} · ${name}`,
        rule ? { done: rule.done(dog), note: rule.note ? rule.note(dog) : '', pending: rule.pending ? rule.pending(dog) : '' } : {})),
      ...spec.supreme.map(([field, key, label, name, step]) => {
        const level = Math.floor((dog[field] || 0) / step);
        const next = `${label}${level + 1 > 1 ? level + 1 : ''}`;
        const earned = level ? ` (${label}${level > 1 ? level : ''} earned)` : '';
        return progressBar(dog[field], (level + 1) * step, `${next} · ${name}${earned}`);
      }),
      ...(spec.merit || []).map(([field, label, name, need, unit]) =>
        progressBar(dog[field], need, `${label} · ${name}`, { note: `${need} ${unit}, as the guide counts them` })),
    ].join('');

    const meetTables = meetsByStream.map(([field, label, meets]) => {
      const complete = meets.filter((m) => m.graded !== false && m.complete && m.score != null);
      const weights = ['1', '0.7', '0.5'];
      let used = 0;
      return `
        <section class="card">
          <h2 class="card-title">${label}</h2>
          ${meets.length ? `
          <div class="tbl-wrap"><table class="tbl">
            <thead><tr><th scope="col">Meet</th>${spec.meetCodeHeader === null ? '' : `<th scope="col">${spec.meetCodeHeader || (spec.meetStatus ? 'Date as written' : 'Code')}</th>`}${
              spec.meetPlacing ? '<th scope="col" class="num">Place</th>' : ''}<th scope="col" class="num">Score</th>${
              spec.meetStatus ? '<th scope="col">Status</th>' : ''}<th scope="col">Counted</th></tr></thead>
            <tbody>${meets.map((meet) => {
              const graded = meet.graded !== false;
              const counted = graded && meet.complete && meet.score != null && (complete.length ? used < 3 : false);
              const weight = counted && !spec.plainMean ? weights[used++] : null;
              const countedCell = !graded
                ? '<span class="badge badge-flat">OTR only</span> <span class="text-xs text-asfa-text/60">not graded, rule 2.2.3</span>'
                : meet.complete
                  ? (spec.plainMean ? 'in the average' : weight ? `× ${weight}` : '—')
                  // With no complete meet listed, the rule takes the plain mean
                  // of the incomplete ones, so they count rather than drop out.
                  : `<span class="badge badge-prov">incomplete</span> <span class="text-xs text-asfa-text/60">${
                    complete.length || meet.score == null ? 'excluded' : 'in the plain mean'}, ${spec.averageRule || 'rule 4.2.2'}</span>`;
              return `
              <tr>
                <td class="whitespace-nowrap">${meetLabel(meet, org)}</td>
                ${spec.meetCodeHeader === null ? '' : `<td class="font-mono text-xs">${esc(meet.code)}</td>`}
                ${spec.meetPlacing ? `<td class="num">${meet.placing == null || meet.placing === 99 ? '—' : meet.placing}</td>` : ''}
                <td class="num font-semibold">${ptsLabel(meet.score)}</td>
                ${spec.meetStatus ? `<td class="font-mono text-xs">${esc(meet.status || '')}</td>` : ''}
                <td>${countedCell}</td>
              </tr>`;
            }).join('')}</tbody>
          </table></div>${spec.statusLegend ? `
          <p class="text-xs text-asfa-text/65 mt-2">${spec.statusLegend}</p>` : ''}${meets.some((m) => m.read) ? `
          <p class="text-xs text-asfa-text/65 mt-2">${meets.filter((m) => m.read).map((m) =>
            `<span class="font-mono">${esc(m.code)}</span> is read as ${formatDateShort(m.date)}: ${m.read === 'order'
              ? 'the guide lists meets newest first, and only that reading keeps them in order'
              : "the cell falls after the guide's own date, so its day and month are taken the other way round"}.`).join(' ')}</p>` : ''}` : `<p class="text-sm text-asfa-text/70">No meets listed.</p>`}
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
          ${value == null ? `<p class="text-sm text-asfa-text/70 mt-2">No ${title} on record.</p>` : waveBar(value, spec.waveMax, spec.gradeBands, title)}
          ${meets.length ? `<p class="text-sm text-asfa-text/80 mt-2">From the last three meets: ${spec.ownArithmetic ? averageArithmetic(org, meets) : waveArithmetic(meets)}.</p>` : ''}
          ${value != null && matches === false && computed != null ? `
            <p class="text-xs text-asfa-text/65 mt-2">
              The guide publishes ${waveLabel(value)}; the three meets it lists compute to ${waveLabel(computed)}.
              The ${spec.officer}'s figure is the one shown and the one that seeds a meet.
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
            ${titleBadges(org, dog) ? `<p class="text-xs text-asfa-text/70 mt-1">${spec.titlesLabel || 'Titles by the points columns'}: ${titleBadges(org, dog)}</p>` : ''}
            <p class="text-sm text-asfa-text/70 mt-1">
              <a href="${racingBreedUrl(org, dog.breed_slug)}" class="lnk">${esc(dog.breed)}</a>${spec.noIds ? '' : `
              · <span class="font-mono text-xs">${esc(publishedId(dog))}</span>${
                idNote(dog) ? ` <span class="text-xs">(${idNote(dog)})</span>` : ''}`}
              ${fromRegistry ? ' · <span class="badge badge-flat">inactive</span>' : ''}
            </p>
            <p class="text-sm mt-1">Owned by ${racingOwners(org, dog)}</p>
            ${spec.dogNote && spec.dogNote(dog) ? `<p class="text-xs text-asfa-text/65 mt-1">${spec.dogNote(dog)}</p>` : ''}
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
        ${spec.careers.some(([, rankKey]) => dog[rankKey]) ? `<p class="text-sm mt-2">Career: ${spec.careers.map(([field, rankKey, label]) =>
          dog[rankKey] ? `<strong>#${dog[rankKey]}</strong> of every ${spec.noun} ever registered on ${ptsLabel(dog[field])} ${label.replace('Career ', '')}` : null
        ).filter(Boolean).join('; ')}.</p>` : ''}
      </section>

      ${waveCards}

      <section class="card">
        <h2 class="card-title">Progress toward titles</h2>
        <p class="text-xs text-asfa-text/60">${spec.progressNote || `Read from the points columns; the ${spec.name} ${spec.officer}'s certificate is the record.`}</p>
        ${titleProgress}
      </section>

      ${meetTables}

      <section class="card">
        ${spec.faultsView ? `
        <h2 class="card-title">Faults on record</h2>
        ${spec.faultsView(dog)}` : spec.faults ? `
        <h2 class="card-title">Faults on record</h2>
        ${dog.faults ? `<p class="text-sm">${ptsLabel(dog.faults.dq)} disqualification${dog.faults.dq === 1 ? '' : 's'} ·
          ${ptsLabel(dog.faults.oc)} off course · ${ptsLabel(dog.faults.dnf)} did not finish
          <span class="text-xs text-asfa-text/60">(the guide's DQ/OC/DNF column)</span></p>`
          : `<p class="text-sm text-asfa-text/70">None recorded.</p>`}` : `
        <h2 class="card-title">Disqualifications</h2>
        ${dq.length ? `<p class="text-sm">${dq.map((d) => `<span class="font-mono text-xs">${esc(d.code)}</span>${d.date ? ` (${formatDateShort(d.date)})` : ''}`).join(', ')}</p>`
          : `<p class="text-sm text-asfa-text/70">None recorded.</p>`}`}
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
              <td class="text-asfa-text/80">${racingOwners(org, other)}</td>
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
        Figures as published in the ${spec.singleBreed ? spec.guideName : `${spec.name} grading guide`} ${guideDate(feed)}${
          sdog ? ` and the Singles sprint records ${guideDate(singles)}` : ''}${
          feed.records_date ? `, titles from the Registrar's Whippet Point Records of ${formatDate(feed.records_date)}` : ''}.
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
   The sheet keeps each dog's three fastest timed runs, newest first, and
   their average ("FASTEST AVG"), the figure heats are drawn from. Singles
   places dogs only within a meet, so nothing here ranks dogs by time. */

function timeLabel(value) {
  if (value == null) return '—';
  return `${(Math.round(value * 100) / 100).toFixed(2)} s`;
}

function romanLevel(n) {
  const numerals = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
    'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
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

/** The newest of the dog's three fastest runs (the sheet's "Recent Fastest").
    Not necessarily its last race: a slower run since is not listed. */
function singlesRecentFastest(sfeed, sdog) {
  const runs = unpackMeets(sfeed, sdog.meets);
  if (!runs.length) return '—';
  const newest = runs.reduce((best, run) =>
    (runKey(run.code, run.year, run.date) > runKey(best.code, best.year, best.date) ? run : best));
  return meetLabel(newest, 'aok9');
}

function pbLabel(sdog) {
  return sdog.pb != null ? timeLabel(sdog.pb) : esc(sdog.pb_text || '—');
}

function averageLabel(sdog) {
  return sdog.average != null ? timeLabel(sdog.average) : esc(sdog.average_text || '—');
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
      { done: sdog.titled.smc, pending: mixedNeeded(smc, 'SMC'),
        note: `${ptsLabel(sbc)} SBC + ${ptsLabel(smc)} SMC points; the title needs 12, at least 2 of them SMC` }),
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
    // As the records list it. SMC points alone never make the title (§5.3
    // counts SBC points too), so no "/ 12" here; the SMC bar has the total.
    [ptsLabel(sdog.smc), 'SMC points'],
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
      ${runs.some((run) => run.time != null) ? `<p class="text-sm text-asfa-text/80 mt-2">From its three fastest runs: ${singlesArithmetic(runs)}.</p>` : ''}
      ${sdog.average != null && sdog.average_computed != null ? `
        <p class="text-xs text-asfa-text/65 mt-2">
          The sheet publishes ${timeLabel(sdog.average)}; the runs it lists average ${timeLabel(sdog.average_computed)}.
          The registrar's figure is the one shown and the one heats are drawn from.
        </p>` : ''}
      <p class="text-xs text-asfa-text/60 mt-2">
        The figure race secretaries draw Singles heats from.
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
      <h2 class="card-title">Three fastest Singles runs</h2>
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
      <p class="text-xs text-asfa-text/60 mt-2">Newest first, as the records list them. A meet runs up to three programs, so one meet can supply all three runs.</p>
      ${beaten ? `<p class="text-xs text-asfa-text/65 mt-1">The sheet's personal best, ${timeLabel(sdog.pb)}, is slower than the ${timeLabel(fastest)} run it lists. The registrar's figure is the one shown above.</p>` : ''}`
      : '<p class="text-sm text-asfa-text/70">No runs listed.</p>'}
    </section>`;

  const mates = sfeed.dogs
    .filter((d) => d.breed_slug === sdog.breed_slug && d.active && d.id !== sdog.id)
    .sort(byRecency).slice(0, 25);
  const matesCard = mates.length ? `
    <section class="card">
      <h2 class="card-title">Other ${esc(sdog.breed)} dogs racing Singles</h2>
      <p class="text-xs text-asfa-text/60 mb-3">Ordered by the newest of each dog's three fastest runs.</p>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th scope="col">Dog</th><th scope="col">Owner</th><th scope="col" class="num">Average</th>
          <th scope="col" class="num">Personal best</th><th scope="col">Recent fastest</th></tr></thead>
        <tbody>${mates.map((d) => `
          <tr>
            <td><a href="${racingDogUrl('aok9', d.id)}" class="lnk font-semibold">${esc(d.call_name)}</a></td>
            <td class="text-asfa-text/80">${racingOwners('aok9', d)}</td>
            <td class="num">${averageLabel(d)}</td>
            <td class="num">${pbLabel(d)}</td>
            <td class="whitespace-nowrap">${singlesRecentFastest(sfeed, d)}</td>
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
  // singles_name: the Singles records give the name without titles the sprint
  // guide writes after it, and the name shown is the sprint guide's.
  const leftOff = sdog.singles_name
    ? sdog.registered_name.trim().split(/\s+/).slice(sdog.singles_name.trim().split(/\s+/).length).join(' ')
    : '';
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
          ${leftOff ? `<p class="text-xs text-asfa-text/65 mt-1">Name as in AOK9's sprint grading guide; the Singles records leave off ${esc(leftOff)}.</p>` : ''}
          ${badges ? `<p class="text-xs text-asfa-text/70 mt-1">Titles by the Singles points columns: ${badges}</p>` : ''}
          <p class="text-sm text-asfa-text/70 mt-1">
            <a href="aok9.html?singles=${encodeURIComponent(sdog.breed_slug)}#singles" class="lnk">${esc(sdog.breed)}</a>
            · <span class="font-mono text-xs">${esc(sdog.sprint ? sdog.id : sdog.reg)}</span>
            · <span class="badge badge-flat">Singles</span>${sdog.active ? '' : ' <span class="badge badge-flat">inactive</span>'}
          </p>
          ${numberNote ? `<p class="text-xs text-asfa-text/65 mt-1">${numberNote}</p>` : ''}
          <p class="text-sm mt-1">Owned by ${racingOwners('aok9', sdog)}</p>
          ${sdog.note ? `<p class="text-xs text-asfa-text/65 mt-1">Registrar's note: ${esc(sdog.note)}</p>` : ''}
          <p class="text-sm text-asfa-text/70 mt-2">Races Singles: alone on the track, timed, and placed against the other dogs of its division at each meet.</p>
        </div>
        ${sdog.pb != null || sdog.average != null ? cardButton() : ''}
      </div>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5">${singlesTiles(sdog, { average: false })}</div>
    </section>

    ${singlesCards(sdog, sfeed)}

    <p class="text-xs text-asfa-text/55">
      Figures as published in the AOK9 Singles sprint records ${guideDate(sfeed)}.
      <a href="aok9.html#singles" class="lnk">How Singles works</a>.
    </p>`;
  const cardBtn = main.querySelector('#card-btn');
  if (cardBtn) cardBtn.addEventListener('click', () => openRacingCard(singlesCardSpec(sdog, sfeed)));
}

/** The Singles tab of the AOK9 page: what only Singles has. No standings;
    Singles places dogs only within a meet, so titles, progress toward them,
    and each breed's dogs, newest fast runs first, sortable. */
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
        ${guideDate(sfeed)}.
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
        Ordered by the newest of each dog's three fastest runs. Click a column heading to sort,
        for example by average time.
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
          three programs alone. Its division is placed either by average time (a dog may drop its
          slowest time) or by scoring each program's times like a regular stake. Points go to the
          top two to four placings, depending on how many dogs are eligible, on the same table as
          the sprint stakes; last place earns as many Turtle points as the winner.</li>
        <li><strong>The average is a seeding figure.</strong> It is the plain mean of the dog's three
          fastest timed runs, and race secretaries draw heats from it. The records list those three
          runs newest first; a meet runs up to three programs, so all three can come from one
          meet. A slower run since is not listed, so a dog counts as racing this year with a listed
          run or points from this year. Singles places dogs against each other only within a
          meet, so this site gives no one a rank by time; the breed table can be sorted by time
          to compare.</li>
        <li><strong>Titles.</strong> SBC, Singles Breed Champion, is 12 points from breed divisions.
          SMC, Singles Mixed Champion, is 12 points with at least 2 from mixed divisions. Supreme
          Singles titles come at every 30 National points, and Singles Turtle titles follow the
          regular stakes: 12 Turtle points, then every 30. The rule book gives the Supreme and
          Turtle titles no abbreviation, so they are written out here.</li>
        <li><strong>Where it comes from.</strong> The
          <a href="${esc(sfeed.source_url)}" class="lnk" target="_blank" rel="noopener noreferrer">Singles sprint records</a>
          are a public spreadsheet from R.A.C.E.'s AOK9 program, read under the
          <a href="${esc(sfeed.rules_url)}" class="lnk" target="_blank" rel="noopener noreferrer">Singles Racing Rule Book</a>.
          A dog that races both Singles and the regular stakes keeps one page with both records.
          Where this site and the records disagree, the records govern.</li>
      </ul>
    </section>`;


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
            <td class="num">${d.titled.smc ? '<span class="badge badge-t-fch">SMC</span>'
              : mixedShortfall(d.sbc, d.smc, 'mixed') ? `${ptsLabel(d.smc || 0)} / 2 mixed`
              : `${ptsLabel((d.sbc || 0) + (d.smc || 0))} / 12`}</td>
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

  /* The breed table sorts on request, never by default: it opens on the
     newest of each dog's three fastest runs, and a time sort is a comparison,
     not a ranking. Each column is [key, label, class, first direction]; times
     start fastest first. */
  const columns = [
    ['call_name', 'Dog', '', 1],
    [null, 'Registered name', ''],
    ['owner_raw', 'Owner', '', 1],
    ['average', 'Average', 'num', 1],
    ['pb', 'Personal best', 'num', 1],
    ['recent', 'Recent fastest', '', -1],
    [null, 'Titles', ''],
  ];
  const sort = { key: 'recent', dir: -1 };
  const valueOf = (d) => (sort.key === 'recent' ? singlesRecencyKey(d) || null : d[sort.key]);
  // A dog with no value (no time yet, a DNF) stays below the rest either way;
  // ties fall back to the newest fast run.
  const bySort = (a, b) => {
    const av = valueOf(a);
    const bv = valueOf(b);
    if (av == null || bv == null) return (av == null) - (bv == null) || byRecency(a, b);
    const order = sort.key === 'recent' ? (av < bv ? -1 : av > bv ? 1 : 0)
      : typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return sort.dir * order || byRecency(a, b);
  };

  function paint() {
    const section = sfeed.sections.find((s) => s.slug === select.value);
    if (!section) { panel.innerHTML = ''; return; }
    const members = dogs.filter((d) => d.breed_slug === section.slug);
    const activeMembers = members.filter((d) => d.active);
    const everyone = showAll || !activeMembers.length;
    const rows = [...(everyone ? members : activeMembers)].sort(bySort);
    panel.innerHTML = `
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h3 class="font-display text-xl text-asfa-text">${esc(section.breed)}</h3>
        <p class="text-sm text-asfa-text/70">${section.raced} racing this year · ${section.active} active · ${section.listed} listed</p>
      </div>
      <div class="tbl-wrap mt-3"><table class="tbl">
        ${sortableHead(columns, sort)}
        <tbody>${rows.map((d) => `
          <tr class="${d.active ? '' : 'text-asfa-text/60'}">
            <td><a href="${racingDogUrl('aok9', d.id)}${d.sprint_racing ? '#singles' : ''}" class="lnk font-semibold">${esc(d.call_name)}</a></td>
            <td class="text-asfa-text/80">${esc(d.registered_name)}</td>
            <td class="text-asfa-text/80">${racingOwners('aok9', d)}</td>
            <td class="num">${averageLabel(d)}</td>
            <td class="num">${pbLabel(d)}</td>
            <td class="whitespace-nowrap">${singlesRecentFastest(sfeed, d)}</td>
            <td>${singlesTitleBadges(d)}</td>
          </tr>`).join('')}</tbody>
      </table></div>
      ${activeMembers.length && activeMembers.length < members.length ? `
        <p class="text-sm mt-3 no-print">${showAll
          ? `Showing every ${esc(section.breed)} dog the records list. <button type="button" id="singles-toggle" class="lnk">Dogs racing lately only</button>`
          : `<button type="button" id="singles-toggle" class="lnk">Show all ${section.listed} ${esc(section.breed)} dogs the records list</button>`}</p>`
        : !activeMembers.length ? `<p class="text-sm mt-3 text-asfa-text/70">No ${esc(section.breed)} has raced Singles since ${sfeed.active_since.slice(0, 4)}; every one the records list is shown.</p>` : ''}`;
    // The repaint replaces the heading buttons; keep keyboard focus on the one used.
    wireSort(panel, columns, sort, () => {
      paint();
      panel.querySelector(`button[data-key="${sort.key}"]`)?.focus();
    });
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

/** Whether a racing record has anything worth a card. */
function hasCardRecord(org, dog) {
  if (ORGS[org].noCard) return false;
  return Boolean(dog.rank_breed || cardWave(org, dog).value != null || ORGS[org].careerOf(dog));
}

/** An LGRA or AOK9 sprint card. The headline is the breed standing this year,
    as on the ASFA card; without points this year it is the WAVE. A dog that
    also races Singles gets its personal best as a third headline line. */
function racingCardSpec(org, dog, feed, sdog = null, sfeed = null) {
  const spec = ORGS[org];
  const wave = cardWave(org, dog);
  const career = spec.careerOf(dog);
  const waveLabelText = wave.value != null && wave.grade ? `${wave.title} · grade ${wave.grade}` : wave.title;
  // Singles runs at the same meets, so Singles racing counts. Its sheet lists
  // only the three fastest runs, so points this year show racing this year.
  const lastRaced = Math.max(Number(dog.last_raced ? dog.last_raced.slice(0, 4) : dog.last_year) || 0,
    (sdog && (sdog.raced ? feed.season : sdog.last_year)) || 0) || null;
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
    const championship = spec.cardChampion;
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
      ? `Grading guide and Singles records ${guideDate(feed, 'of')} · source: ${cardSource(feed)}`
      : `Grading guide ${guideDate(feed, 'of')}, Singles records ${guideDate(sfeed, 'of')} · ${cardSource(feed)}`)
    : `Grading guide ${guideDate(feed, 'of')} · source: ${cardSource(feed)}`;
  return {
    band: `${program} · ${feed.season}`.toUpperCase(),
    callName: dog.call_name,
    registeredName: dog.registered_name,
    meta: `${dog.breed} · ${publishedId(dog)}`,
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
      // With 12 points together but under 2 mixed, the mixed points are what is short.
      mixedShortfall(sdog.sbc, sdog.smc, 'mixed')
        ? [`${ptsLabel(sdog.smc || 0)} / 2`, 'MIXED PTS FOR SMC']
        : [`${ptsLabel(combined)} / 12`, sdog.titled.smc ? 'SMC · EARNED' : 'TOWARD SMC'],
    ],
    owner: sdog.owner_raw,
    footer: `Singles records ${guideDate(sfeed, 'of')} · source: ${cardSource(sfeed)}`,
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
