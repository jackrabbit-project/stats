/* Search and navigation for the long rule documents.

   The text is in the page as ordinary markup so it reads, prints and links
   without JavaScript. Search walks text nodes and wraps hits in <mark>, which
   keeps the document structure intact — a naive innerHTML replace would break
   any tag whose attributes happened to contain the search term. */

function initRulebook() {
  const doc = document.getElementById('doc');
  const input = document.getElementById('q');
  const countEl = document.getElementById('count');
  const prevBtn = document.getElementById('prev');
  const nextBtn = document.getElementById('next');
  const wholeEl = document.getElementById('whole');
  const caseEl = document.getElementById('case');
  const onlyEl = document.getElementById('only');
  if (!doc || !input) return;

  const sections = [...doc.querySelectorAll('section[data-chapter]')];

  // Contents, built from the document so the two can never drift apart.
  const toc = document.getElementById('toc');
  if (toc) {
    toc.innerHTML = sections.map((section) =>
      `<li><a href="#${section.id}" class="lnk">${esc(section.dataset.chapter)}</a></li>`
    ).join('');
  }

  // Keep a clean copy of each section so a new search starts from unmarked text.
  const pristine = new Map(sections.map((section) => [section, section.innerHTML]));

  let hits = [];
  let position = -1;

  function reset() {
    for (const [section, html] of pristine) {
      if (section.innerHTML !== html) section.innerHTML = html;
      section.classList.remove('hidden');
    }
    hits = [];
    position = -1;
  }

  function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlight(section, pattern) {
    const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
    const targets = [];
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.trim() && pattern.test(node.nodeValue)) targets.push(node);
      pattern.lastIndex = 0;
    }

    let found = 0;
    for (const text of targets) {
      const fragment = document.createDocumentFragment();
      let last = 0;
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text.nodeValue))) {
        fragment.append(text.nodeValue.slice(last, match.index));
        const mark = document.createElement('mark');
        mark.textContent = match[0];
        fragment.append(mark);
        last = match.index + match[0].length;
        found += 1;
        if (match[0].length === 0) pattern.lastIndex += 1;   // guard
      }
      fragment.append(text.nodeValue.slice(last));
      text.parentNode.replaceChild(fragment, text);
    }
    return found;
  }

  function run() {
    const term = input.value.trim();
    reset();

    if (term.length < 2) {
      countEl.textContent = '';
      prevBtn.disabled = nextBtn.disabled = true;
      return;
    }

    const body = wholeEl.checked ? `\\b${escapeRegex(term)}\\b` : escapeRegex(term);
    const pattern = new RegExp(body, caseEl.checked ? 'g' : 'gi');

    let matchedSections = 0;
    for (const section of sections) {
      const found = highlight(section, pattern);
      if (found) matchedSections += 1;
      else if (onlyEl.checked) section.classList.add('hidden');
    }

    hits = [...doc.querySelectorAll('mark')];
    position = -1;
    countEl.textContent = hits.length
      ? `${hits.length} match${hits.length === 1 ? '' : 'es'} in ${matchedSections} chapter${matchedSections === 1 ? '' : 's'}`
      : 'no matches';
    prevBtn.disabled = nextBtn.disabled = hits.length === 0;
    if (hits.length) step(1);
  }

  function step(direction) {
    if (!hits.length) return;
    if (position >= 0 && hits[position]) hits[position].classList.remove('mark-active');
    position = (position + direction + hits.length) % hits.length;
    const hit = hits[position];
    hit.classList.add('mark-active');
    hit.scrollIntoView({
      block: 'center',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
    countEl.textContent = `${position + 1} of ${hits.length}`;
  }

  let timer;
  const debounced = () => { clearTimeout(timer); timer = setTimeout(run, 180); };

  input.addEventListener('input', debounced);
  for (const toggle of [wholeEl, caseEl, onlyEl]) toggle.addEventListener('change', run);
  nextBtn.addEventListener('click', () => step(1));
  prevBtn.addEventListener('click', () => step(-1));
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    step(event.shiftKey ? -1 : 1);
  });

  // Deep link: rulebook.html?q=best+in+field runs the search on load.
  const preset = param('q');
  if (preset) { input.value = preset; run(); }
}
