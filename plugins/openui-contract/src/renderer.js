/**
 * The renderer half: draws an `openui` fence inside a sandboxed iframe.
 *
 * It receives the growing text of the fence — `complete: false` while the answer streams —
 * and parses it itself with the same parser the plugin's tool uses. That is the whole
 * reason the contract travels as text rather than as a pre-parsed tree: the renderer knows
 * what a valid boundary is in its own language.
 *
 * Nothing here can reach the app: Mercury serves this file with a CSP that blocks every
 * network call, and hosts it in `<iframe sandbox="allow-scripts">`, so there is no session
 * cookie and no app DOM to touch.
 */
import { renderSpec } from './parse.js';

const HOST = window.parent;
let theme = null;
let lastSignature = '';
let lastPayload = null;
let lastWidth = 0;

const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === '') continue;
    if (key === 'style') Object.assign(node.style, value);
    else if (key === 'class') node.className = value;
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
};

function reportHeight() {
  const px = Math.ceil(document.body.getBoundingClientRect().height) + 2;
  HOST.postMessage({ v: 1, type: 'height', px }, '*');
}

function money(number) {
  return Number.isFinite(number) ? String(Math.round(number)) : '0';
}

/** Round tick steps (1, 2, 5 × 10^k): labels read 0/5/10, never 0/2/5/7/9. */
function niceStep(raw) {
  if (!(raw > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

function chart(node) {
  // Draw at the width we actually have: a fixed viewBox scaled down to a narrow column
  // turns 10 px labels into 5 px smudges.
  const width = Math.max(240, Math.round(document.body.clientWidth || 640));
  const height = 170;
  const pad = { top: 10, right: 16, bottom: 22, left: 40 };
  const values = (node.values || []).map(Number).filter(Number.isFinite);
  const dataMax = Math.max(...values, 1);
  const step = niceStep(Math.max(dataMax / 4, 1));
  const max = Math.ceil(dataMax / step) * step;
  const ticks = [];
  for (let value = 0; value <= max + 1e-9; value += step) ticks.push(value);

  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const y = (value) => pad.top + (1 - value / max) * plotHeight;
  const slot = plotWidth / Math.max(values.length, 1);
  const barWidth = Math.min(38, slot * 0.55);
  const svgNs = 'http://www.w3.org/2000/svg';
  const svgNode = (tag, attrs, text) => {
    const item = document.createElementNS(svgNs, tag);
    for (const [key, value] of Object.entries(attrs)) if (value !== undefined) item.setAttribute(key, String(value));
    if (text !== undefined) item.textContent = text;
    return item;
  };

  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', node.title || 'chart');

  for (const tick of ticks) {
    svg.append(svgNode('line', { x1: pad.left, x2: width - pad.right, y1: y(tick), y2: y(tick), stroke: theme.border, 'stroke-width': 1 }));
    svg.append(svgNode('text', { x: pad.left - 8, y: y(tick) + 3.5, 'text-anchor': 'end', fill: theme.muted, 'font-size': 11, 'font-family': theme.mono }, money(tick)));
  }

  if (node.kind === 'line') {
    const points = values.map((value, index) => {
      const x = values.length === 1 ? pad.left + plotWidth / 2 : pad.left + (plotWidth / (values.length - 1)) * index;
      return `${x},${y(value)}`;
    });
    svg.append(svgNode('polyline', { points: points.join(' '), fill: 'none', stroke: theme.accent, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
    values.forEach((value, index) => {
      const x = values.length === 1 ? pad.left + plotWidth / 2 : pad.left + (plotWidth / (values.length - 1)) * index;
      svg.append(svgNode('circle', { cx: x, cy: y(value), r: 3.5, fill: theme.surface, stroke: theme.accent, 'stroke-width': 2 }));
    });
  } else {
    values.forEach((value, index) => {
      const left = pad.left + slot * index + (slot - barWidth) / 2;
      const top = y(value);
      svg.append(svgNode('rect', { x: left, y: top, width: barWidth, height: Math.max(1, pad.top + plotHeight - top), rx: 4, fill: theme.accent }));
    });
  }

  (node.labels || []).forEach((label, index) => {
    const x = node.kind === 'line'
      ? (values.length === 1 ? pad.left + plotWidth / 2 : pad.left + (plotWidth / (values.length - 1)) * index)
      : pad.left + slot * index + slot / 2;
    const anchor = index === 0 ? 'start' : index === (node.labels.length - 1) ? 'end' : 'middle';
    svg.append(svgNode('text', { x, y: height - 6, 'text-anchor': anchor, fill: theme.muted, 'font-size': 11, 'font-family': theme.mono }, label));
  });

  return el('div', { class: 'card' },
    node.title ? el('div', { class: 'card-title' }, node.title) : null,
    node.unit ? el('div', { class: 'unit' }, `en ${node.unit}`) : null,
    svg);
}

function numericColumn(rows, index) {
  return rows.length > 0 && rows.every((row) => /^-?\d+([.,]\d+)?$/.test(String(row[index] ?? '').trim()));
}

function nodeView(node) {
  switch (node.type) {
    case 'Stack':
      return el('div', { class: 'stack' }, node.children.map(nodeView));

    case 'Paragraph': {
      const tag = node.variant === 'h1' ? 'h1' : node.variant === 'h2' ? 'h2' : node.variant === 'h3' ? 'h3' : 'p';
      return el(tag, { class: `text ${node.variant}${node.muted ? ' muted' : ''}` }, node.text);
    }

    case 'Card':
      return el('div', { class: `card${node.tone && node.tone !== 'neutral' ? ` tone-${node.tone}` : ''}` },
        node.title ? el('div', { class: 'card-title' }, node.title) : null,
        node.body ? el('div', { class: 'muted' }, node.body) : null);

    case 'KeyValue':
      return el('div', { class: 'kv' },
        el('span', { class: 'muted' }, node.label),
        el('span', { class: node.highlight ? 'accent strong' : '' }, node.value));

    case 'Table': {
      const rows = node.rows || [];
      const table = el('table', {},
        node.caption ? el('caption', { class: 'muted' }, node.caption) : null,
        el('thead', {}, el('tr', {}, (node.columns || []).map((title, index) =>
          el('th', { class: numericColumn(rows, index) ? 'num' : '' }, title)))),
        el('tbody', {}, rows.map((row) => el('tr', {}, (node.columns || []).map((_, index) =>
          el('td', { class: numericColumn(rows, index) ? 'num' : '' }, row[index] ?? ''))))));
      return el('div', { class: 'card' }, table);
    }

    case 'Bullets':
      return el('div', { class: 'card' },
        el(node.ordered ? 'ol' : 'ul', {}, (node.items || []).map((item) => el('li', {}, item))));

    case 'Stat':
      return el('div', { class: 'card' },
        el('div', { class: 'stat' },
          el('span', { class: `stat-value${node.tone && node.tone !== 'neutral' ? ` tone-${node.tone}` : ''}` }, node.value),
          node.delta ? el('span', { class: 'muted small' }, node.delta) : null),
        el('div', { class: 'muted small' }, node.label));

    case 'Snippet':
      return el('div', { class: 'card code' },
        el('div', { class: 'code-bar' },
          el('span', { class: 'muted small' }, node.title || ''),
          el('span', { class: 'muted small mono' }, node.language || 'text')),
        el('pre', {}, node.code));

    case 'Chart':
      return chart(node);

    default:
      return null;
  }
}

function draw(payload) {
  lastPayload = payload;
  lastWidth = document.body.clientWidth;
  theme = payload.theme || { text: '#e8e8e6', muted: '#8b98aa', surface: '#0f1720', border: '#1d2530', accent: '#00d4ff', danger: '#ff6b6b', mono: 'monospace', dark: true };
  document.documentElement.style.setProperty('--text', theme.text);
  document.documentElement.style.setProperty('--muted', theme.muted);
  document.documentElement.style.setProperty('--surface', theme.surface);
  document.documentElement.style.setProperty('--border', theme.border);
  document.documentElement.style.setProperty('--accent', theme.accent);
  document.documentElement.style.setProperty('--danger', theme.danger);

  const partial = payload.complete === false;
  const result = renderSpec(payload.text || '', { partial });
  const signature = JSON.stringify(result.ok ? result.tree : result.errors);
  if (signature === lastSignature) return; // nothing new to say: no repaint, no height churn
  lastSignature = signature;

  const root = document.getElementById('root');
  root.replaceChildren();

  if (result.ok && result.tree) {
    root.append(nodeView(result.tree));
  } else if (partial) {
    // Mid-stream a half-written statement is normal. Say nothing, keep the last frame.
    root.append(el('div', { class: 'pending' }, '…'));
  } else {
    const reason = (result.errors && result.errors[0]?.message) || 'spec refusée';
    HOST.postMessage({ v: 1, type: 'error', message: reason }, '*');
    root.append(el('div', { class: 'card muted small' }, `openui — non rendu : ${reason}`));
  }
  reportHeight();
}

window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.v !== 1) return;
  if (data.type === 'render') draw(data);
});

// A width change is a relayout, not a nudge: the chart draws at the real width, so it has
// to be redrawn (and the fence re-measured) when the pane is resized or the sidebar toggles.
new ResizeObserver(() => {
  if (!lastPayload) return reportHeight();
  if (document.body.clientWidth !== lastWidth) {
    lastSignature = '';
    draw(lastPayload);
    return;
  }
  reportHeight();
}).observe(document.body);
HOST.postMessage({ v: 1, type: 'ready' }, '*');
