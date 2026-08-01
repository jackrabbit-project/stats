/* Shareable stat card, rendered to a canvas and downloaded as a PNG.
   No server and no image pipeline — everything happens in the browser. */

const CARD_SIZE = 1080;

const CARD_COLORS = {
  paper: '#F7F5EF',
  panel: '#E8EFEA',
  green: '#2C6E49',
  accent: '#A44A2F',
  ink: '#2F2F2F',
  line: '#D6DCD7',
};

function cardFont(size, family = 'Abel', weight = '') {
  return `${weight} ${size}px "${family}", "Segoe UI", Helvetica, Arial, sans-serif`.trim();
}

/** Shrink text until it fits, so long registered names never overflow. */
function fitText(ctx, text, maxWidth, startSize, family, weight) {
  let size = startSize;
  ctx.font = cardFont(size, family, weight);
  while (ctx.measureText(text).width > maxWidth && size > 14) {
    size -= 2;
    ctx.font = cardFont(size, family, weight);
  }
  return size;
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawStatCard(canvas, dog, season) {
  const ctx = canvas.getContext('2d');
  canvas.width = CARD_SIZE;
  canvas.height = CARD_SIZE;

  const pad = 72;
  const inner = CARD_SIZE - pad * 2;

  ctx.fillStyle = CARD_COLORS.paper;
  ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);

  // Top band. The site's own name leads; ASFA names the dataset on the right.
  // A card travels without the page around it, so this band is the one place
  // the project has to identify itself rather than lead with someone else's.
  ctx.fillStyle = CARD_COLORS.green;
  ctx.fillRect(0, 0, CARD_SIZE, 116);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = cardFont(40);
  ctx.fillText('LURE COURSING STATS', pad, 58);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = cardFont(32);
  ctx.fillText(`ASFA TOP 20 · ${season.season}`, CARD_SIZE - pad, 58);
  ctx.textAlign = 'left';

  let y = 220;

  // Call name
  ctx.fillStyle = CARD_COLORS.green;
  const nameSize = fitText(ctx, dog.call_name, inner, 116, 'Abel');
  ctx.fillText(dog.call_name, pad, y);
  y += nameSize * 0.55 + 34;

  // Registered name, wrapped
  ctx.fillStyle = CARD_COLORS.ink;
  ctx.font = cardFont(34, 'Segoe UI');
  for (const line of wrapText(ctx, dog.registered_name, inner).slice(0, 2)) {
    ctx.fillText(line, pad, y);
    y += 44;
  }

  // Section, region, and any other section the same hound is ranked in. A
  // hound running the Singles stake is usually also listed under its breed,
  // and a card that shows only one of the two misrepresents the season.
  const alsoRanked = (season.dogs || []).filter(
    (other) => other.hound_key === dog.hound_key && other.id !== dog.id
  );
  let meta = dog.region ? `${dog.breed} · Region ${dog.region}` : dog.breed;
  if (alsoRanked.length) {
    meta += ` · also #${alsoRanked[0].rank} in ${alsoRanked[0].breed}`;
  }
  ctx.fillStyle = CARD_COLORS.accent;
  const metaSize = fitText(ctx, meta.toUpperCase(), inner, 36, 'Abel');
  ctx.font = cardFont(metaSize);
  ctx.fillText(meta.toUpperCase(), pad, y + 12);
  y += 78;

  // Rank block
  ctx.fillStyle = CARD_COLORS.panel;
  ctx.fillRect(pad, y, inner, 210);
  ctx.strokeStyle = CARD_COLORS.line;
  ctx.lineWidth = 2;
  ctx.strokeRect(pad, y, inner, 210);

  ctx.fillStyle = CARD_COLORS.accent;
  ctx.font = cardFont(150);
  ctx.fillText(`#${dog.rank}`, pad + 40, y + 100);

  const rankWidth = ctx.measureText(`#${dog.rank}`).width;
  ctx.fillStyle = CARD_COLORS.ink;
  ctx.font = cardFont(34, 'Segoe UI');
  ctx.fillText(rankContext(dog), pad + 60 + rankWidth, y + 82);
  if (dog.percentile != null) {
    ctx.fillStyle = CARD_COLORS.green;
    ctx.font = cardFont(44);
    ctx.fillText(
      `${percentileLabel(dog)} of ${dog.total_competing} competing`,
      pad + 60 + rankWidth, y + 132
    );
  }
  y += 210;

  // Stat columns. Best of Breed and Best in Field cannot be won in the Singles
  // stake or an LCI division (Running Rules Ch. V §5(d), §10, §11), so a card
  // for one of those hounds must not print them as its record — that is the
  // claim most likely to travel once the card is shared without its page.
  const stats = dog.is_breed
    ? [
        [dog.points, 'TOP 20 POINTS'],
        [dog.bob, 'BEST OF BREED'],
        [dog.bif, 'BEST IN FIELD'],
      ]
    : [
        [dog.points, 'TOP 20 POINTS'],
        [dog.total_competing ?? '—', 'HOUNDS COMPETING'],
      ];
  const columnWidth = inner / stats.length;
  const statTop = y + 60;
  stats.forEach(([value, label], index) => {
    const centre = pad + columnWidth * index + columnWidth / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = CARD_COLORS.green;
    ctx.font = cardFont(96);
    ctx.fillText(String(value), centre, statTop + 40);
    ctx.fillStyle = CARD_COLORS.ink;
    ctx.font = cardFont(26, 'Segoe UI');
    ctx.fillText(label, centre, statTop + 108);
  });
  ctx.textAlign = 'left';

  // Owner, labelled so the name is not mistaken for anything else. Sits above
  // the footer divider at CARD_SIZE - 128; with the tallest possible stack
  // above it (a call name at full size plus two wrapped lines of registered
  // name) this leaves roughly 20px of clearance.
  const ownerY = statTop + 165;
  ctx.fillStyle = 'rgba(47,47,47,0.55)';
  ctx.font = cardFont(24, 'Segoe UI');
  ctx.fillText('OWNER', pad, ownerY);
  const labelWidth = ctx.measureText('OWNER').width + 16;

  ctx.fillStyle = CARD_COLORS.ink;
  const ownerSize = fitText(ctx, dog.owner_raw, inner - labelWidth, 30, 'Segoe UI');
  ctx.font = cardFont(ownerSize, 'Segoe UI');
  ctx.fillText(dog.owner_raw, pad + labelWidth, ownerY);

  // Footer
  ctx.fillStyle = CARD_COLORS.line;
  ctx.fillRect(pad, CARD_SIZE - 128, inner, 2);
  ctx.fillStyle = 'rgba(47,47,47,0.65)';
  ctx.font = cardFont(26, 'Segoe UI');
  // "unofficial" rides on the line that was already here rather than taking a
  // second one. A card travels without the page around it, so this is the only
  // place it can say the site is not ASFA's.
  ctx.fillText(
    `Standings through ${formatDate(season.as_of)} · unofficial · source: asfa.org`,
    pad, CARD_SIZE - 84
  );
}

function cardFilename(dog, season) {
  const stem = dog.call_name.replace(/[^\w-]+/g, '-').toLowerCase().replace(/^-|-$/g, '');
  return `${stem}-asfa-${season.season}.png`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function closeStatCard() {
  const existing = document.getElementById('card-modal');
  if (existing) {
    URL.revokeObjectURL(existing.dataset.objectUrl);
    existing.remove();
  }
  document.removeEventListener('keydown', onCardKeydown);
}

function onCardKeydown(event) {
  if (event.key === 'Escape') closeStatCard();
}

/** Show the rendered card so it can be looked at before it goes anywhere.

    Sharing options are offered only where they actually work. Facebook's share
    endpoint takes a URL and scrapes og:image from it — it cannot accept an
    image from the page — and Instagram has no web posting interface at all. On
    a phone the native share sheet does reach both, via navigator.share with the
    file attached, so that is what the Share button uses; it is hidden where the
    browser cannot do it rather than failing on click. */
function showCardModal(dog, season, blob) {
  closeStatCard();
  const objectUrl = URL.createObjectURL(blob);
  const filename = cardFilename(dog, season);
  const file = new File([blob], filename, { type: 'image/png' });
  const canShareFile = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  const canCopy = !!(navigator.clipboard && window.ClipboardItem && window.isSecureContext);

  const modal = document.createElement('div');
  modal.id = 'card-modal';
  modal.className = 'modal-backdrop';
  modal.dataset.objectUrl = objectUrl;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', `Stat card for ${dog.call_name}`);

  modal.innerHTML = `
    <div class="modal-panel">
      <div class="flex items-baseline justify-between gap-3 px-4 py-3 border-b border-asfa-border">
        <h2 class="font-abel text-xl text-asfa-green">${esc(dog.call_name)} — stat card</h2>
        <button data-act="close" class="text-asfa-text/60 hover:text-asfa-accent text-xl leading-none" aria-label="Close">&times;</button>
      </div>
      <img src="${objectUrl}" alt="Stat card for ${esc(dog.call_name)}" class="modal-card-img">
      <div class="px-4 py-3 border-t border-asfa-border flex flex-wrap gap-2">
        <button data-act="download" class="px-3 py-2 bg-asfa-green text-white text-sm hover:bg-asfa-greenHover">
          <i class="fa-solid fa-download mr-1"></i>Download</button>
        ${canCopy ? `<button data-act="copy" class="px-3 py-2 border border-asfa-green text-asfa-green text-sm hover:bg-asfa-bg2">
          <i class="fa-regular fa-copy mr-1"></i>Copy image</button>` : ''}
        ${canShareFile ? `<button data-act="share" class="px-3 py-2 border border-asfa-green text-asfa-green text-sm hover:bg-asfa-bg2">
          <i class="fa-solid fa-share-nodes mr-1"></i>Share</button>` : ''}
        <span data-role="status" class="text-xs text-asfa-text/60 self-center ml-auto"></span>
      </div>
    </div>`;

  const status = modal.querySelector('[data-role="status"]');
  const say = (message) => {
    status.textContent = message;
    setTimeout(() => { if (status.textContent === message) status.textContent = ''; }, 2500);
  };

  modal.addEventListener('click', async (event) => {
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (!act && event.target !== modal) return;
    if (act === 'close' || !act) { closeStatCard(); return; }

    if (act === 'download') {
      downloadBlob(blob, filename);
      say('Saved');
    } else if (act === 'copy') {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        say('Copied');
      } catch (error) {
        console.error(error);
        say('Copy failed');
      }
    } else if (act === 'share') {
      try {
        await navigator.share({
          files: [file],
          title: `${dog.call_name} — Lure Coursing Stats`,
          text: `${dog.call_name}, #${dog.rank} ${rankContext(dog)} in the ${season.season} ASFA standings.`,
        });
      } catch (error) {
        if (error.name !== 'AbortError') { console.error(error); say('Share failed'); }
      }
    }
  });

  document.body.appendChild(modal);
  document.addEventListener('keydown', onCardKeydown);
  modal.querySelector('[data-act="close"]').focus();
}

/** Render the card and show it. Waits for the webfont so it isn't drawn in a fallback. */
function openStatCard(dog, season) {
  const render = () => {
    const canvas = document.createElement('canvas');
    drawStatCard(canvas, dog, season);
    canvas.toBlob((blob) => showCardModal(dog, season, blob), 'image/png');
  };

  if (document.fonts && document.fonts.load) {
    document.fonts.load('40px Abel').then(render, render);
  } else {
    render();
  }
}
