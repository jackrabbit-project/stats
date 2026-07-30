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

  // Top band
  ctx.fillStyle = CARD_COLORS.green;
  ctx.fillRect(0, 0, CARD_SIZE, 116);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = cardFont(40);
  ctx.textBaseline = 'middle';
  ctx.fillText('ASFA TOP 20', pad, 58);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(`${season.season} SEASON`, CARD_SIZE - pad, 58);
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

  // Breed and region
  ctx.fillStyle = CARD_COLORS.accent;
  ctx.font = cardFont(36);
  const meta = dog.region ? `${dog.breed} · Region ${dog.region}` : dog.breed;
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
  ctx.fillText('in breed', pad + 60 + rankWidth, y + 82);
  if (dog.percentile != null) {
    ctx.fillStyle = CARD_COLORS.green;
    ctx.font = cardFont(44);
    ctx.fillText(
      `${percentileLabel(dog)} of ${dog.total_competing} competing`,
      pad + 60 + rankWidth, y + 132
    );
  }
  y += 210;

  // Stat columns
  const stats = [
    [dog.points, 'TOP 20 POINTS'],
    [dog.bob, 'BEST OF BREED'],
    [dog.bif, 'BEST IN FIELD'],
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

  // Owner. Sits above the footer divider at CARD_SIZE - 128; with the tallest
  // possible stack above it (a call name at full size plus two wrapped lines of
  // registered name) this leaves roughly 20px of clearance.
  ctx.fillStyle = CARD_COLORS.ink;
  const owner = fitText(ctx, dog.owner_raw, inner, 30, 'Segoe UI');
  ctx.font = cardFont(owner, 'Segoe UI');
  ctx.fillText(dog.owner_raw, pad, statTop + 165);

  // Footer
  ctx.fillStyle = CARD_COLORS.line;
  ctx.fillRect(pad, CARD_SIZE - 128, inner, 2);
  ctx.fillStyle = 'rgba(47,47,47,0.65)';
  ctx.font = cardFont(26, 'Segoe UI');
  ctx.fillText(
    `Standings through ${formatDate(season.as_of)} · source: asfa.org`,
    pad, CARD_SIZE - 84
  );
  ctx.fillText('Unofficial fan site · not an ASFA publication', pad, CARD_SIZE - 46);
}

/** Render and download. Waits for the webfont so the card isn't drawn in a fallback. */
function downloadStatCard(dog, season) {
  const render = () => {
    const canvas = document.createElement('canvas');
    drawStatCard(canvas, dog, season);
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${dog.call_name.replace(/[^\w-]+/g, '-').toLowerCase()}-asfa-${season.season}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  if (document.fonts && document.fonts.ready) {
    document.fonts.load('40px Abel').then(render, render);
  } else {
    render();
  }
}
