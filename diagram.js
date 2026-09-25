(() => {
'use strict';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TEXT = { size: 13, line: 18, weight: 650 };
const NODE = { padX: 16, padY: 10, maxWidth: 176, minWidth: 54, radius: 10 };
const FLOW_GAP = { rank: 54, rankSide: 64, node: 26, label: 14 };
const ARROW = { length: 7.5, half: 4.5 };
const BULGE = 34;
const SWEEPS = { order: 12, place: 24 };
const SPRING = [170, 24];
const STAGGER = { reveal: 220, live: 90, cap: 1600 };
const ENTER = { node: 560, label: 380, fade: 420, line: 700, grow: 720, arc: 950, speed: 0.6, drawMin: 220, drawMax: 650 };
const EXIT = 260;
const PAD = 18;
const MIN_SCALE = 0.55;
const SIDE_FIT = 0.92;
const TURN = { fit: 0.8, gain: 0.1 };
const CLUSTER = { padX: 16, head: 40, padBottom: 16, empty: 24, min: 140, size: 12, weight: 700, radius: 16 };
const STATUS_HEIGHT = 56;
const PIE = { radius: 70, width: 26, gap: 0.9, legend: 40, row: 30, swatch: 10, title: 38 };
const CHART = { height: 280, pad: [22, 14, 44, 14], bar: 38, labeled: 12, maxWidth: 820, title: 38 };
const SEQ = { head: 38, pad: 14, gap: 140, self: 36 };
const CANDLE = { maxWidth: 1000, price: 250, volume: 54, gap: 12, head: 50, body: 0.64, maxBody: 14 };
const TIMELINE = { col: 210, minCol: 150, line: 18 };
const GANTT = { row: 34, section: 34, bar: 18, axis: 34, maxWidth: 1000, label: 240 };
const MIND = { gapX: 46, gapY: 8, branch: 14 };
const QUAD = { max: 540, min: 280, gap: 3 };
const RADAR = { min: 90, max: 150, levels: 4 };
const CARD = { head: 38, stereo: 48, row: 24, padX: 14, min: 150 };
const DAY = 86400000;
const EDIT = { debounce: 90 };
const TOOLS = { width: 68, height: 36, gap: 10, reach: 24 };
const COPIED_TIME = 1600;
const WIDTH_CACHE = 4000;
const LAYERS = ['back', 'edges', 'nodes', 'labels', 'front'];
const PATH_SHAPES = new Set(['diamond', 'hexagon', 'lean', 'flag', 'cylinder']);
const WARMUP = [
 'flowchart TD\nA[Начало] --> B{Проверка}\nB -->|да| C([Готово])\nB -.-> D[(База)]\nD --> A',
 'sequenceDiagram\nautonumber\nA->>B: запрос\nalt ok\nB-->>A: ответ\nend\nNote over A,B: заметка',
 'pie\n"a" : 1\n"b" : 2',
 'xychart-beta\nx-axis [a, b]\nbar [1, 2]\nline [2, 1]',
 'candlestick\n1, 10, 12, 9, 11, 100\n2, 11, 13, 10, 12, 120\nma 2',
 'gantt\ndateFormat YYYY-MM-DD\nsection S\nA :a1, 2024-01-01, 3d\nB :after a1, 2d',
 'mindmap\n  root((r))\n    a\n      b\n    c',
 'erDiagram\nA ||--o{ B : has\nA {\n int id PK\n}',
 'flowchart TD\nsubgraph G["g"]\nA --> B\nend\nG --> C',
 'wireframe\nnav N\n links a, b\n button b\nhero H\n text t\n button b\n image\nfeatures F\n A: a\npricing P\n S*: 1 · a\nfooter F',
];

const ID = /^[\p{L}\p{N}_](?:[\p{L}\p{N}_]|[.\-](?=[\p{L}\p{N}_]))*/u;
const SHAPES = [
 ['(((', [')))'], 'circle'],
 ['((', ['))'], 'circle'],
 ['([', ['])'], 'stadium'],
 ['[[', [']]'], 'subroutine'],
 ['[(', [')]'], 'cylinder'],
 ['[/', ['/]', '\\]'], 'lean'],
 ['[\\', ['\\]', '/]'], 'lean'],
 ['{{', ['}}'], 'hexagon'],
 ['[', [']'], 'rect'],
 ['(', [')'], 'round'],
 ['{', ['}'], 'diamond'],
 ['>', [']'], 'flag'],
];
const LINK_TEXT = /^(<)?(--|==|-\.)[ \t]+(.+?)[ \t]+(-{2,}>|={2,}>|\.-+>|-{3,}|={3,}|\.-+|--[ox]|==[ox])/;
const LINK = /^(<)?(-{2,}>|={2,}>|-\.+->|-{3,}|={3,}|-\.+-|--[ox]|==[ox]|~{3,})(?:[ \t]*\|([^|]*)\|)?/;
const SKIP = /^(classDef|class|style|linkStyle|click|direction|accTitle|accDescr|end|note|%%)\b/i;
const ICONS = {
 edit: '<svg class="dg-icon is-edit" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.2 3.3l2.5 2.5M3 13l.6-3 6.9-6.9a1.4 1.4 0 0 1 2 0l.4.4a1.4 1.4 0 0 1 0 2L6 12.4z"/></svg>'
  + '<svg class="dg-icon is-done" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>',
 copy: '<svg class="dg-icon is-copy" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><rect x="5.25" y="5.25" width="8.5" height="8.5" rx="2.25"/><path d="M10.75 3.25a2 2 0 0 0-2-2h-4.5a3 3 0 0 0-3 3v4.5a2 2 0 0 0 2 2"/></svg>'
  + '<svg class="dg-icon is-copied" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>',
};

let uid = 0;
let measurer = null;
let family = '';
let warmed = false;
const widths = new Map();

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fontFamily = () => family ||= getComputedStyle(document.documentElement).getPropertyValue('--font').trim() || 'system-ui, sans-serif';
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clamp01 = v => clamp(v, 0, 1);
const easeOut = t => 1 - (1 - t) ** 3;
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const backOut = (t, c = 1.6) => 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
const f = v => String(Math.round(v * 10) / 10);

function svg(tag, attrs = {}, parent = null) {
 const node = document.createElementNS(SVG_NS, tag);
 for (const name in attrs) node.setAttribute(name, attrs[name]);
 if (parent) parent.appendChild(node);
 return node;
}

function setAttrs(node, attrs) {
 for (const name in attrs) node.setAttribute(name, attrs[name]);
}

function div(className, parent = null, text = '') {
 const node = document.createElement('div');
 node.className = className;
 if (text) node.textContent = text;
 if (parent) parent.appendChild(node);
 return node;
}

function textWidth(text, size = TEXT.size, weight = TEXT.weight) {
 const key = `${weight} ${size}px ${fontFamily()}`;
 const cached = widths.get(key + text);
 if (cached !== undefined) return cached;
 if (!measurer) measurer = document.createElement('canvas').getContext('2d');
 measurer.font = key;
 const width = measurer.measureText(text).width;
 if (widths.size > WIDTH_CACHE) widths.clear();
 widths.set(key + text, width);
 return width;
}

function wrap(text, max, size, weight) {
 const lines = [];
 for (const paragraph of text.split('\n')) {
  let line = '';
  for (const word of paragraph.split(/\s+/).filter(Boolean)) {
   const next = line ? `${line} ${word}` : word;
   if (line && textWidth(next, size, weight) > max) { lines.push(line); line = word; }
   else line = next;
  }
  lines.push(line);
 }
 return lines;
}

function cleanLabel(text) {
 return (text || '').trim()
  .replace(/^"([\s\S]*)"$/, '$1').replace(/^`([\s\S]*)`$/, '$1')
  .replace(/<br\s*\/?>/gi, '\n').replace(/\\n/g, '\n').replace(/<\/?[a-z][^>]*>/gi, '')
  .replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/`([^`]+)`/g, '$1')
  .replace(/#quot;/g, '"').replace(/#amp;/g, '&').replace(/#lt;/g, '<').replace(/#gt;/g, '>')
  .replace(/#(\d+);/g, (_, code) => String.fromCodePoint(+code))
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/fa:fa-[\w-]+\s*/g, '')
  .trim();
}

function splitStatements(line) {
 const out = [];
 let depth = 0, quote = false, start = 0;
 for (let i = 0; i < line.length; i++) {
  const c = line[i];
  if (c === '"') quote = !quote;
  else if (quote) continue;
  else if ('[({'.includes(c)) depth++;
  else if ('])}'.includes(c)) depth = Math.max(0, depth - 1);
  else if (c === ';' && !depth) { out.push(line.slice(start, i)); start = i + 1; }
 }
 out.push(line.slice(start));
 return out;
}

function splitList(text) {
 const out = [];
 let quote = false, part = '';
 for (const c of text) {
  if (c === '"') quote = !quote;
  if (c === ',' && !quote) { out.push(part.trim()); part = ''; continue; }
  part += c;
 }
 if (part.trim()) out.push(part.trim());
 return out;
}

const unquote = text => cleanLabel(String(text).trim().replace(/^'([\s\S]*)'$/, '$1'));

function number(text) {
 let s = String(text).trim().replace(/\s/g, '');
 s = s.includes('.') ? s.replace(/,/g, '') : s.replace(',', '.');
 return parseFloat(s);
}

const format = value => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);

function truncate(text, max, size, weight) {
 if (textWidth(text, size, weight) <= max) return text;
 let lo = 0, hi = text.length;
 while (lo < hi) {
  const mid = (lo + hi + 1) >> 1;
  if (textWidth(`${text.slice(0, mid).trimEnd()}…`, size, weight) <= max) lo = mid;
  else hi = mid - 1;
 }
 return `${text.slice(0, lo).trimEnd()}…`;
}

function spread(labels, min, lo, hi) {
 const sorted = [...labels].sort((a, b) => a.y - b.y);
 for (let i = 1; i < sorted.length; i++) sorted[i].y = Math.max(sorted[i].y, sorted[i - 1].y + min);
 const over = sorted.length ? sorted[sorted.length - 1].y - hi : 0;
 if (over > 0) for (const label of sorted) label.y -= over;
 for (let i = sorted.length - 2; i >= 0; i--) sorted[i].y = Math.min(sorted[i].y, sorted[i + 1].y - min);
 if (sorted.length && sorted[0].y < lo) {
  const shift = lo - sorted[0].y;
  for (const label of sorted) label.y += shift;
 }
 return labels;
}

const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function tipHtml(tip) {
 let html = tip.title ? `<div class="dg-tip-title">${escapeHtml(tip.title)}</div>` : '';
 for (const row of tip.rows) {
  html += `<div class="dg-tip-row${row.cls ? ` ${row.cls}` : ''}${row.tone ? ` t-${row.tone}` : ''}">${row.tone ? '<i></i>' : ''}`
   + `<span>${escapeHtml(row.name || '')}</span><b>${escapeHtml(row.value)}</b></div>`;
 }
 return html;
}

function chips(entries, x, y, maxWidth) {
 const items = [];
 let cx = x, cy = y;
 entries.forEach((entry, i) => {
  const w = 14 + textWidth(entry.text, 12.5, 650) + 18;
  if (cx > x && cx + w - 18 > x + maxWidth) { cx = x; cy += 24; }
  items.push({ key: `chip:${i}`, type: 'chip', layer: 'labels', order: 0.2 + i * 0.1, props: { x: cx, y: cy }, fixed: { text: entry.text, tone: entry.tone } });
  cx += w;
 });
 return { items, height: cy - y + 24, width: Math.max(0, ...items.map(item => item.props.x + 14 + textWidth(item.fixed.text, 12.5, 650))) - x };
}

function niceCeil(value) {
 if (value <= 0) return 1;
 const mag = 10 ** Math.floor(Math.log10(value)), norm = value / mag;
 return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
}

function decimalsFor(step) {
 return clamp(Math.ceil(-Math.log10(step) + 0.001), 0, 8);
}

function rotate(tones, by) {
 const k = ((by % tones.length) + tones.length) % tones.length;
 return [...tones.slice(k), ...tones.slice(0, k)];
}

/* Cubic paths are flat arrays: x0,y0 then three points per segment */

const segmentCount = pts => (pts.length - 2) / 6;

function splitCubic(p, t) {
 const mix = (a, b) => a + (b - a) * t;
 const [x0, y0, x1, y1, x2, y2, x3, y3] = p;
 const ax = mix(x0, x1), ay = mix(y0, y1), bx = mix(x1, x2), by = mix(y1, y2), cx = mix(x2, x3), cy = mix(y2, y3);
 const dx = mix(ax, bx), dy = mix(ay, by), ex = mix(bx, cx), ey = mix(by, cy), fx = mix(dx, ex), fy = mix(dy, ey);
 return [[x0, y0, ax, ay, dx, dy, fx, fy], [fx, fy, ex, ey, cx, cy, x3, y3]];
}

function resample(pts, count) {
 const n = segmentCount(pts);
 if (n >= count) return pts;
 const out = [pts[0], pts[1]];
 for (let s = 0; s < n; s++) {
  let seg = pts.slice(s * 6, s * 6 + 8);
  const parts = Math.floor(count / n) + (s < count % n ? 1 : 0);
  for (let j = parts; j > 1; j--) {
   const [head, rest] = splitCubic(seg, 1 / j);
   out.push(...head.slice(2));
   seg = rest;
  }
  out.push(...seg.slice(2));
 }
 return out;
}

function pathOf(pts) {
 let d = `M${f(pts[0])},${f(pts[1])}`;
 for (let i = 2; i < pts.length; i += 6) d += ` C${f(pts[i])},${f(pts[i + 1])} ${f(pts[i + 2])},${f(pts[i + 3])} ${f(pts[i + 4])},${f(pts[i + 5])}`;
 return d;
}

const straight = (x1, y1, x2, y2) => [x1 + (x2 - x1) / 3, y1 + (y2 - y1) / 3, x1 + (x2 - x1) * 2 / 3, y1 + (y2 - y1) * 2 / 3, x2, y2];

function polyline(points) {
 const out = [points[0][0], points[0][1]];
 for (let i = 1; i < points.length; i++) out.push(...straight(...points[i - 1], ...points[i]));
 return out;
}

function roughLength(pts) {
 let length = 0;
 for (let i = 2; i < pts.length; i += 6) length += Math.hypot(pts[i + 4] - pts[i - 2], pts[i + 5] - pts[i - 1]);
 return length;
}

function headPath(kind, pts, atStart) {
 const n = pts.length;
 let px, py, qx, qy;
 if (atStart) { px = pts[0]; py = pts[1]; qx = pts[2]; qy = pts[3]; if (Math.hypot(px - qx, py - qy) < 0.01) { qx = pts[6]; qy = pts[7]; } }
 else { px = pts[n - 2]; py = pts[n - 1]; qx = pts[n - 4]; qy = pts[n - 3]; if (Math.hypot(px - qx, py - qy) < 0.01) { qx = pts[n - 8]; qy = pts[n - 7]; } }
 let dx = px - qx, dy = py - qy;
 const length = Math.hypot(dx, dy) || 1;
 dx /= length;
 dy /= length;
 const nx = -dy, ny = dx, L = ARROW.length, H = ARROW.half;
 const at = (back, side = 0) => `${f(px - dx * back + nx * side)},${f(py - dy * back + ny * side)}`;
 const ring = back => { const cx = px - dx * back, cy = py - dy * back; return `M${f(cx - 4)},${f(cy)} a4,4 0 1,0 8,0 a4,4 0 1,0 -8,0`; };
 const bar = back => `M${at(back, 6)} L${at(back, -6)}`;
 const crow = `M${at(0, 7)} L${at(12)} M${at(0)} L${at(12)} M${at(0, -7)} L${at(12)}`;
 switch (kind) {
  case 'arrow': return `M${f(px + dx * L)},${f(py + dy * L)} L${f(px + nx * H)},${f(py + ny * H)} L${f(px - nx * H)},${f(py - ny * H)} Z`;
  case 'open': return `M${f(px + nx * 5)},${f(py + ny * 5)} L${f(px + dx * L)},${f(py + dy * L)} L${f(px - nx * 5)},${f(py - ny * 5)}`;
  case 'circle': { const cx = px + dx * 4, cy = py + dy * 4; return `M${f(cx - 4)},${f(cy)} a4,4 0 1,0 8,0 a4,4 0 1,0 -8,0`; }
  case 'triangle': return `M${at(0)} L${at(12, 7)} L${at(12, -7)} Z`;
  case 'diamond':
  case 'odiamond': return `M${at(0)} L${at(8, 5.5)} L${at(16)} L${at(8, -5.5)} Z`;
  case 'vee': return `M${at(9, 5)} L${at(0)} L${at(9, -5)}`;
  case 'one': return `${bar(7)} ${bar(12)}`;
  case 'zero-one': return `${bar(7)} ${ring(16)}`;
  case 'one-many': return `${crow} ${bar(16)}`;
  case 'zero-many': return `${crow} ${ring(18)}`;
 }
 const cx = px + dx * 4, cy = py + dy * 4;
 return `M${f(cx - 4)},${f(cy - 4)} l8,8 m0,-8 l-8,8`;
}

const HEAD_CLASS = { arrow: 'dg-head', circle: 'dg-head', diamond: 'dg-head', triangle: 'dg-head is-hollow', odiamond: 'dg-head is-hollow', 'zero-one': 'dg-mark is-hollow', 'zero-many': 'dg-mark is-hollow' };

function endsOf(fx) {
 if (fx.ends) return fx.ends;
 const head = fx.head && fx.head !== 'none' ? fx.head : null;
 return { start: fx.both ? head : null, end: head };
}

function textBlock(parent, lines, { cls = '', lineHeight = 16, anchor = 'middle', baseline = 'central', x = 0 } = {}) {
 const text = svg('text', { 'text-anchor': anchor }, parent);
 if (cls) text.setAttribute('class', cls);
 lines.forEach((line, i) => {
  const y = baseline === 'central' ? (i - (lines.length - 1) / 2) * lineHeight
   : baseline === 'above' ? -(lines.length - 1 - i) * lineHeight : i * lineHeight;
  const span = svg('tspan', { x, y: f(y), 'dominant-baseline': baseline === 'central' ? 'central' : baseline === 'above' ? 'auto' : 'hanging' }, text);
  span.textContent = line;
 });
 return text;
}

function pop(el, a, blur = 6) {
 if (a >= 1) {
  if (el.__pop !== 1) { el.style.opacity = ''; el.style.transform = ''; el.style.filter = ''; el.__pop = 1; }
  return;
 }
 el.__pop = a;
 const e = easeOut(a);
 el.style.opacity = Math.min(1, a * 1.8).toFixed(3);
 el.style.transform = `scale(${(0.55 + 0.45 * backOut(a)).toFixed(3)})`;
 el.style.filter = e < 0.99 ? `blur(${((1 - e) * blur).toFixed(2)}px)` : '';
}

function fade(el, a, rise = 0) {
 if (a >= 1) {
  if (el.__fade !== 1) { el.style.opacity = ''; el.style.transform = ''; el.__fade = 1; }
  return;
 }
 el.__fade = a;
 const e = easeOut(a);
 el.style.opacity = e.toFixed(3);
 if (rise) el.style.transform = `translateY(${((1 - e) * rise).toFixed(2)}px)`;
}

/* Parsing */

function graphBuilder() {
 const nodes = new Map(), edges = [];
 const touch = (id, label, shape) => {
  let node = nodes.get(id);
  if (!node) { node = { id, label: id, shape: 'rect' }; nodes.set(id, node); }
  if (label !== undefined) { node.label = cleanLabel(label) || ' '; node.shape = shape; }
  return node;
 };
 return { nodes, edges, touch };
}

function closing(s, start, open, closers) {
 if (open.length === 1 && closers[0].length === 1) {
  const close = closers[0];
  let depth = 0;
  for (let i = start; i < s.length; i++) {
   if (s[i] === '"') { const q = s.indexOf('"', i + 1); if (q > 0) { i = q; continue; } }
   if (s[i] === open) depth++;
   else if (s[i] === close && !depth--) return [i, close];
  }
  return [-1, ''];
 }
 let best = -1, match = '';
 for (const close of closers) {
  const at = s.indexOf(close, start);
  if (at >= 0 && (best < 0 || at < best)) { best = at; match = close; }
 }
 return [best, match];
}

function readNode(cursor, graph) {
 const m = ID.exec(cursor.s.slice(cursor.p));
 if (!m) return null;
 cursor.p += m[0].length;
 let label, shape;
 for (const [open, closers, kind] of SHAPES) {
  if (!cursor.s.startsWith(open, cursor.p)) continue;
  const start = cursor.p + open.length;
  const [end, close] = closing(cursor.s, start, open, closers);
  if (end < 0) continue;
  label = cursor.s.slice(start, end);
  shape = kind;
  cursor.p = end + close.length;
  break;
 }
 const cls = /^:::[\w-]+/.exec(cursor.s.slice(cursor.p));
 if (cls) cursor.p += cls[0].length;
 return graph.touch(m[0], label, shape).id;
}

function skipSpace(cursor) {
 while (cursor.p < cursor.s.length && /\s/.test(cursor.s[cursor.p])) cursor.p++;
}

function readGroup(cursor, graph) {
 const first = readNode(cursor, graph);
 if (!first) return null;
 const group = [first];
 for (;;) {
  const save = cursor.p;
  skipSpace(cursor);
  if (cursor.s[cursor.p] !== '&') { cursor.p = save; break; }
  cursor.p++;
  skipSpace(cursor);
  const next = readNode(cursor, graph);
  if (!next) break;
  group.push(next);
 }
 return group;
}

function readLink(cursor) {
 const rest = cursor.s.slice(cursor.p);
 let m = LINK_TEXT.exec(rest), token, label, both;
 if (m) { both = !!m[1]; token = m[2] + m[4]; label = m[3]; }
 else {
  m = LINK.exec(rest);
  if (!m) return null;
  both = !!m[1];
  token = m[2];
  label = m[3] || '';
 }
 cursor.p += m[0].length;
 return {
  label: cleanLabel(label),
  style: token.includes('~') ? 'hidden' : token.includes('.') ? 'dotted' : token.includes('=') ? 'thick' : 'solid',
  head: token.endsWith('>') ? 'arrow' : token.endsWith('o') ? 'circle' : token.endsWith('x') ? 'cross' : 'none',
  both,
 };
}

function subgraphOf(text, index, parent) {
 text = text.replace(/:::[\w-]+[ \t]*$/, '').trim();
 const m = /^([^\s"[\]]+)[ \t]*\[([\s\S]*)\]$/.exec(text);
 const id = m ? m[1] : /^[\p{L}\p{N}_][\p{L}\p{N}_.\-]*$/u.test(text) ? text : '';
 return { id: id || `__g${index}`, title: cleanLabel(m ? m[2] : text), dir: '', parent: parent?.id || '', seq: 0 };
}

function parseFlow(lines) {
 const dir = ((lines[0].match(/^(?:graph|flowchart)[ \t]+(TB|TD|BT|RL|LR)/i) || [])[1] || 'TD').toUpperCase();
 const graph = graphBuilder(), groups = new Map(), stack = [];
 let seq = 0;
 const claim = ids => {
  const group = stack[stack.length - 1];
  for (const id of ids) {
   const node = graph.nodes.get(id);
   node.seq ??= seq++;
   if (group && node.group === undefined) node.group = group.id;
  }
 };
 for (const raw of lines.slice(1)) {
  const line = raw.trim();
  let m;
  if ((m = /^subgraph\b[ \t]*(.*)$/i.exec(line))) {
   const group = subgraphOf(m[1], groups.size, stack[stack.length - 1]);
   if (groups.has(group.id)) group.id = `${group.id}__${groups.size}`;
   group.seq = seq++;
   groups.set(group.id, group);
   stack.push(group);
   continue;
  }
  if (/^end\b/i.test(line)) { stack.pop(); continue; }
  if ((m = /^direction[ \t]+(TB|TD|BT|RL|LR)\b/i.exec(line))) {
   if (stack.length) stack[stack.length - 1].dir = m[1].toUpperCase() === 'TB' ? 'TD' : m[1].toUpperCase();
   continue;
  }
  if (SKIP.test(line)) continue;
  for (const part of splitStatements(line)) {
   const cursor = { s: part.trim(), p: 0 };
   let left = readGroup(cursor, graph);
   if (left) claim(left);
   while (left) {
    skipSpace(cursor);
    const link = readLink(cursor);
    if (!link) break;
    skipSpace(cursor);
    const right = readGroup(cursor, graph);
    if (!right) break;
    claim(right);
    for (const from of left) for (const to of right) graph.edges.push({ from, to, ...link });
    left = right;
   }
  }
 }
 for (const id of groups.keys()) graph.nodes.delete(id);
 if (!graph.nodes.size && !groups.size) return null;
 return { dir: dir === 'TB' ? 'TD' : dir, nodes: [...graph.nodes.values()], edges: graph.edges, groups: [...groups.values()] };
}

function parseState(lines) {
 const graph = graphBuilder();
 let dir = 'TD';
 const ref = (token, side) => {
  token = token.trim();
  if (token === '[*]') return graph.touch(side === 'from' ? '__start' : '__end', ' ', side === 'from' ? 'start' : 'end').id;
  return graph.touch(token).id;
 };
 for (const raw of lines.slice(1)) {
  const line = raw.trim().replace(/[{}]\s*$/, '').trim();
  let m;
  if (!line || /^(note|end note|--|%%|classDef|class)\b/i.test(line)) continue;
  if ((m = line.match(/^direction\s+(LR|RL|TB|TD|BT)/i))) { dir = m[1].toUpperCase() === 'TB' ? 'TD' : m[1].toUpperCase(); continue; }
  if ((m = line.match(/^state\s+"([^"]+)"\s+as\s+([\p{L}\p{N}_]+)/u))) { graph.touch(m[2], m[1], 'round'); continue; }
  if ((m = line.match(/^state\s+([\p{L}\p{N}_]+)/u))) { graph.touch(m[1]); continue; }
  if ((m = line.match(/^(\[\*\]|[\p{L}\p{N}_]+)\s*-->\s*(\[\*\]|[\p{L}\p{N}_]+)\s*(?::\s*(.*))?$/u))) {
   graph.edges.push({ from: ref(m[1], 'from'), to: ref(m[2], 'to'), label: cleanLabel(m[3] || ''), style: 'solid', head: 'arrow', both: false });
   continue;
  }
  if ((m = line.match(/^([\p{L}\p{N}_]+)\s*:\s*(.+)$/u))) graph.touch(m[1], m[2], 'round');
 }
 for (const node of graph.nodes.values()) if (node.shape === 'rect') node.shape = 'round';
 return graph.nodes.size ? { dir, nodes: [...graph.nodes.values()], edges: graph.edges } : null;
}

function parseSequence(lines) {
 const actors = new Map(), events = [], stack = [];
 let numbered = false;
 const actor = (id, label) => {
  id = id.trim();
  let entry = actors.get(id);
  if (!entry) { entry = { id, label: id }; actors.set(id, entry); }
  if (label) entry.label = cleanLabel(label);
  return entry;
 };
 for (const raw of lines.slice(1)) {
  const line = raw.trim();
  let m;
  if (!line) continue;
  if (/^autonumber\b/i.test(line)) { numbered = true; continue; }
  if (/^(activate|deactivate|title|accTitle|accDescr|create|destroy|link|links|properties|details)\b/i.test(line)) continue;
  if ((m = line.match(/^(participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/i))) { actor(m[2].replace(/^"|"$/g, ''), m[3]); continue; }
  if (/^box\b/i.test(line)) { stack.push(null); continue; }
  if ((m = line.match(/^(loop|alt|opt|par|critical|break|rect)\b\s*(.*)$/i))) {
   const kind = m[1].toLowerCase();
   const frame = { kind, label: kind === 'rect' ? '' : cleanLabel(m[2]), depth: stack.filter(Boolean).length };
   stack.push(frame);
   events.push({ type: 'open', frame });
   continue;
  }
  if ((m = line.match(/^(else|and|option)\b\s*(.*)$/i))) {
   const frame = [...stack].reverse().find(Boolean);
   if (frame) events.push({ type: 'divide', frame, label: cleanLabel(m[2]) });
   continue;
  }
  if (/^end$/i.test(line)) {
   const frame = stack.pop();
   if (frame) events.push({ type: 'close', frame });
   continue;
  }
  if ((m = line.match(/^note\s+(right of|left of|over)\s+([^:]+?)\s*:\s*(.*)$/i))) {
   events.push({ type: 'note', side: m[1].toLowerCase(), actors: m[2].split(',').map(id => actor(id)), text: cleanLabel(m[3]) });
   continue;
  }
  if ((m = line.match(/^(.+?)\s*(--?)(>>|>|x|\))\s*[+-]?\s*(.+?)\s*:\s*(.*)$/))) {
   events.push({ type: 'message', from: actor(m[1]), to: actor(m[4]), dashed: m[2] === '--', head: m[3], text: cleanLabel(m[5]) });
  }
 }
 while (stack.length) { const frame = stack.pop(); if (frame) events.push({ type: 'close', frame }); }
 return actors.size ? { actors: [...actors.values()], events, numbered } : null;
}

function parsePie(lines) {
 let title = ((lines[0].match(/\btitle\s+(.+)$/i) || [])[1]) || '';
 let showData = /\bshowData\b/i.test(lines[0]);
 const items = [];
 for (const raw of lines.slice(1)) {
  const line = raw.trim();
  let m;
  if ((m = line.match(/^title\s+(.+)$/i))) { title = m[1]; continue; }
  if (/^showData$/i.test(line)) { showData = true; continue; }
  if ((m = line.match(/^(?:"([^"]*)"|'([^']*)'|([^:]+?))\s*:\s*([-+]?[\d\s.,]+)\s*%?\s*$/))) {
   const value = number(m[4]);
   if (value > 0) items.push({ label: cleanLabel(m[1] ?? m[2] ?? m[3]), value });
  }
 }
 return items.length ? { title: unquote(title), items, showData } : null;
}

function parseXY(lines) {
 const data = { title: '', labels: null, xTitle: '', yTitle: '', min: null, max: null, series: [] };
 for (const raw of lines.slice(1)) {
  const line = raw.trim();
  let m;
  if ((m = line.match(/^title\s+(.+)$/i))) { data.title = unquote(m[1]); continue; }
  if ((m = line.match(/^x-axis\s*(.*)$/i))) {
   const rest = m[1], list = rest.match(/\[(.*)\]/), range = rest.match(/([-\d.]+)\s*-->\s*([-\d.]+)/);
   const name = rest.replace(/\[.*\]/, '').replace(/([-\d.]+)\s*-->\s*([-\d.]+)/, '').trim();
   if (name) data.xTitle = unquote(name);
   if (list) data.labels = splitList(list[1]).map(unquote);
   else if (range) data.range = [number(range[1]), number(range[2])];
   continue;
  }
  if ((m = line.match(/^y-axis\s*(.*)$/i))) {
   const rest = m[1], range = rest.match(/([-\d.]+)\s*-->\s*([-\d.]+)/);
   if (range) { data.min = number(range[1]); data.max = number(range[2]); }
   const name = rest.replace(/([-\d.]+)\s*-->\s*([-\d.]+)/, '').trim();
   if (name) data.yTitle = unquote(name);
   continue;
  }
  if ((m = line.match(/^(bar|line)\b\s*(?:"([^"]*)"\s*)?\[(.*)\]\s*$/i))) {
   const values = splitList(m[3]).map(number);
   if (values.length && values.every(Number.isFinite)) data.series.push({ type: m[1].toLowerCase(), name: m[2] || '', values });
  }
 }
 if (!data.series.length) return null;
 const count = Math.max(...data.series.map(s => s.values.length));
 if (!data.labels) {
  const [from, to] = data.range || [1, count];
  data.labels = Array.from({ length: count }, (_, i) => format(count > 1 ? from + (to - from) * i / (count - 1) : from));
 }
 while (data.labels.length < count) data.labels.push('');
 return data;
}

const OHLC = { open: 'o', o: 'o', high: 'h', h: 'h', low: 'l', l: 'l', close: 'c', c: 'c', volume: 'v', vol: 'v', v: 'v' };

function parseCandles(lines) {
 const data = { title: '', rows: [], ma: [] };
 let order = ['o', 'h', 'l', 'c', 'v'];
 for (const raw of lines.slice(1)) {
  const line = raw.trim();
  let m;
  if ((m = line.match(/^title\s+(.+)$/i))) { data.title = unquote(m[1]); continue; }
  if ((m = line.match(/^(?:ma|sma)\s+([\d\s,]+)$/i))) { data.ma.push(...m[1].split(/[\s,]+/).map(Number).filter(n => n > 1 && n < 400)); continue; }
  let cells = line.split(/\s*[,;|\t]\s*/).filter(Boolean);
  if (cells.length < 5) {
   const words = line.split(/\s+/);
   let k = words.length;
   while (k > 0 && Number.isFinite(number(words[k - 1])) && words.length - k < 5) k--;
   cells = [words.slice(0, k).join(' '), ...words.slice(k)];
  }
  const head = cells.slice(1).map(cell => OHLC[cell.toLowerCase()]);
  if (head.length >= 4 && head.every(Boolean)) { order = head; continue; }
  const values = cells.slice(1).map(number);
  if (values.length < 4 || !values.slice(0, 4).every(Number.isFinite)) continue;
  const row = { label: unquote(cells[0].replace(/:$/, '')) };
  order.forEach((key, i) => { row[key] = values[i]; });
  row.h = Math.max(row.o, row.h, row.l, row.c);
  row.l = Math.min(row.o, row.h, row.l, row.c);
  row.v = Number.isFinite(row.v) ? Math.max(0, row.v) : 0;
  data.rows.push(row);
 }
 return data.rows.length ? data : null;
}

function parseTimeline(lines) {
 const data = { title: '', periods: [] };
 let section = '';
 for (const raw of lines.slice(1)) {
  const line = raw.trim();
  let m;
  if ((m = line.match(/^title\s+(.+)$/i))) { data.title = unquote(m[1]); continue; }
  if ((m = line.match(/^section\s+(.+)$/i))) { section = unquote(m[1]); continue; }
  const last = data.periods[data.periods.length - 1];
  if (line.startsWith(':')) {
   if (last) last.events.push(...line.slice(1).split(/\s*:\s+/).map(unquote).filter(Boolean));
   continue;
  }
  const [period, ...events] = line.split(/\s*:\s+/);
  data.periods.push({ label: unquote(period), events: events.map(unquote).filter(Boolean), section });
 }
 return data.periods.length ? data : null;
}

const UNIT = { ms: 1, s: 1e3, m: 6e4, min: 6e4, h: 36e5, d: DAY, w: DAY * 7, M: DAY * 30.44, mo: DAY * 30.44, y: DAY * 365.25 };

function parseDate(text, fmt = '') {
 const s = text.trim();
 let m;
 if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/))) return Date.UTC(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
 if ((m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/))) return /^MM/i.test(fmt) ? Date.UTC(+m[3], m[1] - 1, +m[2]) : Date.UTC(+m[3], m[2] - 1, +m[1]);
 if ((m = s.match(/^(\d{4})-(\d{1,2})$/))) return Date.UTC(+m[1], m[2] - 1, 1);
 if ((m = s.match(/^(\d{4})$/)) && /^Y+$/i.test(fmt)) return Date.UTC(+m[1], 0, 1);
 if ((m = s.match(/^(\d{1,2}):(\d{2})$/))) return Date.UTC(1970, 0, 1, +m[1], +m[2]);
 return null;
}

function parseDuration(text) {
 const m = text.trim().match(/^(\d+(?:[.,]\d+)?)\s*(ms|min|mo|s|m|h|d|w|M|y)$/);
 return m ? number(m[1]) * UNIT[m[2]] : null;
}

function parseGantt(lines) {
 const data = { title: '', tasks: [] };
 const ids = new Map();
 let fmt = 'YYYY-MM-DD', section = '', prev = null;
 for (const raw of lines.slice(1)) {
  const line = raw.trim();
  let m;
  if ((m = line.match(/^title\s+(.+)$/i))) { data.title = unquote(m[1]); continue; }
  if ((m = line.match(/^dateFormat\s+(.+)$/i))) { fmt = m[1].trim(); continue; }
  if ((m = line.match(/^section\s+(.+)$/i))) { section = unquote(m[1]); continue; }
  if ((m = line.match(/^todayMarker\s+off\b/i))) { data.noToday = true; continue; }
  if (/^(axisFormat|tickInterval|excludes|includes|weekday|weekend|inclusiveEndDates|topAxis|displayMode|todayMarker|accTitle|accDescr)\b/i.test(line)) continue;
  if (!(m = line.match(/^(.+?)\s*:\s*(.*)$/))) continue;
  const tokens = m[2].split(',').map(token => token.trim()).filter(Boolean), tags = [];
  while (tokens.length && /^(done|active|crit|milestone)$/i.test(tokens[0])) tags.push(tokens.shift().toLowerCase());
  let id = null, from = null, to = null;
  if (tokens.length >= 3) [id, from, to] = tokens;
  else if (tokens.length === 2) [from, to] = tokens;
  else to = tokens[0] || '1d';
  if (from && !/^after\s/i.test(from) && parseDate(from, fmt) === null) { id = from; from = null; }
  let start = null;
  if (from && /^after\s/i.test(from)) {
   const ends = from.slice(6).split(/\s+/).map(ref => ids.get(ref)?.end).filter(Number.isFinite);
   start = ends.length ? Math.max(...ends) : prev?.end ?? null;
  } else if (from) start = parseDate(from, fmt);
  start ??= prev?.end ?? Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  let end = null;
  if (to) {
   const until = to.match(/^until\s+(\S+)/i);
   end = until ? ids.get(until[1])?.start ?? null : parseDuration(to) !== null ? start + parseDuration(to) : parseDate(to, fmt);
  }
  if (end === null || end < start) end = start + (tags.includes('milestone') ? 0 : DAY);
  if (tags.includes('milestone')) end = start;
  const task = { name: cleanLabel(m[1]), section, tags, start, end };
  if (id) ids.set(id, task);
  data.tasks.push(task);
  prev = task;
 }
 return data.tasks.length ? data : null;
}

function mindLabel(text) {
 const s = text.replace(/:::[\w\s-]+$/, '').trim();
 const m = s.match(/^[\p{L}\p{N}_-]*\s*(\(\(|\)\)|\{\{|\(|\)|\[)([\s\S]*?)(\)\)|\(\(|\}\}|\)|\(|\])$/u);
 return cleanLabel(m ? m[2] : s);
}

function parseMindmap(lines) {
 const top = { children: [] }, stack = [{ indent: -1, node: top }];
 for (const raw of lines.slice(1)) {
  const text = raw.trim();
  if (/^::icon\(|^:::|^%%/.test(text)) continue;
  const indent = raw.match(/^\s*/)[0].replace(/\t/g, '    ').length;
  const node = { label: mindLabel(text), children: [] };
  while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
  stack[stack.length - 1].node.children.push(node);
  stack.push({ indent, node });
 }
 const [root, ...rest] = top.children;
 if (!root) return null;
 root.children.push(...rest);
 return root;
}

function parseQuadrant(lines) {
 const data = { title: '', x: ['', ''], y: ['', ''], q: ['', '', '', ''], points: [] };
 for (const raw of lines.slice(1)) {
  const line = raw.trim();
  let m;
  if ((m = line.match(/^title\s+(.+)$/i))) { data.title = unquote(m[1]); continue; }
  if ((m = line.match(/^([xy])-axis\s+(.+?)(?:\s*-->\s*(.+))?$/i))) { data[m[1].toLowerCase()] = [unquote(m[2]), m[3] ? unquote(m[3]) : '']; continue; }
  if ((m = line.match(/^quadrant-([1-4])\s+(.+)$/i))) { data.q[m[1] - 1] = unquote(m[2]); continue; }
  if ((m = line.match(/^(.+?)\s*(?::::[\w-]+)?\s*:\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]/))) {
   const x = number(m[2]), y = number(m[3]);
   if (Number.isFinite(x) && Number.isFinite(y)) data.points.push({ label: unquote(m[1]), x, y });
  }
 }
 const max = Math.max(1, ...data.points.flatMap(p => [p.x, p.y]));
 if (max > 1) for (const p of data.points) { p.x /= max > 10 ? 100 : 10; p.y /= max > 10 ? 100 : 10; }
 return data.points.length || data.q.some(Boolean) ? data : null;
}

const RADAR_ENTRY = /^([\p{L}\p{N}_-]+)(?:\s*\[\s*"?([^"\]]*)"?\s*\])?$/u;

function parseRadar(lines) {
 const data = { title: '', axes: [], curves: [], min: null, max: null, levels: RADAR.levels, circle: false };
 for (const raw of lines.slice(1)) {
  const line = raw.trim();
  let m;
  if ((m = line.match(/^title\s+(.+)$/i))) { data.title = unquote(m[1]); continue; }
  if ((m = line.match(/^axis\s+(.+)$/i))) {
   for (const entry of splitList(m[1])) {
    const e = entry.match(RADAR_ENTRY);
    if (e) data.axes.push({ id: e[1], label: cleanLabel(e[2] || e[1]) });
   }
   continue;
  }
  if ((m = line.match(/^curve\s+([\p{L}\p{N}_-]+)(?:\s*\[\s*"?([^"\]]*)"?\s*\])?\s*\{(.*)\}\s*$/u))) {
   const values = new Map(), list = [];
   for (const part of splitList(m[3])) {
    const kv = part.match(/^([\p{L}\p{N}_-]+)\s*:\s*(.+)$/u);
    if (kv) values.set(kv[1], number(kv[2]));
    else list.push(number(part));
   }
   data.curves.push({ label: cleanLabel(m[2] || m[1]), values, list });
   continue;
  }
  if ((m = line.match(/^(max|min)\s+([-\d.]+)$/i))) { data[m[1].toLowerCase()] = number(m[2]); continue; }
  if ((m = line.match(/^ticks\s+(\d+)$/i))) { data.levels = clamp(+m[1], 2, 8); continue; }
  if (/^graticule\s+circle/i.test(line)) data.circle = true;
 }
 for (const curve of data.curves) curve.data = data.axes.map((axis, i) => curve.values.has(axis.id) ? curve.values.get(axis.id) : curve.list[i] ?? 0).map(v => Number.isFinite(v) ? v : 0);
 return data.axes.length >= 3 && data.curves.length ? data : null;
}

function cardOf(title, sub, rows, sep = -1) {
 const leadW = Math.max(0, ...rows.map(r => r.lead ? textWidth(r.lead, r.badge ? 10 : 12.5, 800) + 8 : 0));
 const textW = Math.max(0, ...rows.map(r => textWidth(r.text, 12.5, 600)));
 const metaW = Math.max(0, ...rows.map(r => r.meta ? textWidth(r.meta, 12, 500) : 0));
 const titleW = Math.max(textWidth(title, 13.5, 750), sub ? textWidth(sub, 11, 650) : 0);
 const w = Math.ceil(Math.max(CARD.min, titleW + 40, CARD.padX * 2 + leadW + textW + (metaW ? metaW + 24 : 0)));
 const head = sub ? CARD.stereo : CARD.head;
 const split = sep > 0 && sep < rows.length;
 const h = head + (rows.length ? 10 + rows.length * CARD.row + (split ? 9 : 0) : 0);
 return { w, h, head, title, sub, rows, sep: split ? sep : -1, leadW, key: JSON.stringify([title, sub, rows, sep]) };
}

function asCard(node, card) {
 node.shape = 'card';
 node.card = card;
 node.lines = [];
 node.w = card.w;
 node.h = card.h;
}

const ER_CARD = { '|o': 'zero-one', 'o|': 'zero-one', '||': 'one', '}o': 'zero-many', 'o{': 'zero-many', '}|': 'one-many', '|{': 'one-many' };

function parseER(lines) {
 const nodes = new Map(), edges = [];
 let open = null, dir = 'LR';
 const entity = token => {
  const m = token.trim().match(/^"?([^"[\]]+?)"?(?:\s*\[\s*"?([^"\]]*)"?\s*\])?$/);
  const id = (m ? m[1] : token).trim();
  let node = nodes.get(id);
  if (!node) { node = { id, label: id, attrs: [] }; nodes.set(id, node); }
  if (m && m[2]) node.label = cleanLabel(m[2]);
  return node;
 };
 for (const raw of lines.slice(1)) {
  const line = raw.trim();
  let m;
  if (open) {
   if (line.startsWith('}')) { open = null; continue; }
   const a = line.match(/^(\S+)\s+([^\s"]+)\s*((?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*)?/i);
   if (a) open.attrs.push({ type: a[1].replace(/~/g, ''), name: a[2], keys: (a[3] || '').replace(/\s/g, '').toUpperCase() });
   continue;
  }
  if ((m = line.match(/^direction\s+(LR|RL|TB|TD|BT)/i))) { dir = m[1].toUpperCase() === 'TB' ? 'TD' : m[1].toUpperCase(); continue; }
  if ((m = line.match(/^(.+?)\s*(\|o|\|\||\}o|\}\|)(--|\.\.)(o\||\|\||o\{|\|\{)\s*(.+?)\s*(?::\s*(.*))?$/))) {
   const a = entity(m[1]), b = entity(m[5]);
   edges.push({ from: a.id, to: b.id, label: unquote(m[6] || ''), style: m[3] === '..' ? 'dashed' : 'solid', head: 'none', both: false, ends: { start: ER_CARD[m[2]], end: ER_CARD[m[4]] } });
   continue;
  }
  if ((m = line.match(/^(.+?)\s*\{\s*(\})?$/))) { const node = entity(m[1]); if (!m[2]) open = node; continue; }
  if (/^[\p{L}\p{N}_-]+$/u.test(line)) entity(line);
 }
 if (!nodes.size) return null;
 for (const node of nodes.values()) asCard(node, cardOf(node.label, '', node.attrs.map(a => ({ lead: a.keys, badge: true, text: a.name, meta: a.type }))));
 return { dir, nodes: [...nodes.values()], edges };
}

const CLASS_OPS = {
 '<|--': ['triangle', null, 'solid'], '--|>': [null, 'triangle', 'solid'], '<|..': ['triangle', null, 'dashed'], '..|>': [null, 'triangle', 'dashed'],
 '*--': ['diamond', null, 'solid'], '--*': [null, 'diamond', 'solid'], 'o--': ['odiamond', null, 'solid'], '--o': [null, 'odiamond', 'solid'],
 '<--': ['vee', null, 'solid'], '-->': [null, 'vee', 'solid'], '<..': ['vee', null, 'dashed'], '..>': [null, 'vee', 'dashed'],
 '--': [null, null, 'solid'], '..': [null, null, 'dashed'],
};
const CLASS_REL = /^(\S+?)\s*(?:"([^"]*)"\s*)?(<\|--|--\|>|<\|\.\.|\.\.\|>|\*--|--\*|o--|--o|<--|-->|<\.\.|\.\.>|--|\.\.)\s*(?:"([^"]*)"\s*)?(\S+?)\s*(?::\s*(.+))?$/;

function memberRow(text) {
 let s = text.trim().replace(/[$*]$/, '').replace(/~([^~]+)~/g, '<$1>');
 const vis = /^[+\-#~]/.test(s) ? s[0] : '';
 if (vis) s = s.slice(1).trim();
 if (s.includes('(')) {
  const close = s.lastIndexOf(')');
  return { lead: vis, text: s.slice(0, close + 1), meta: s.slice(close + 1).replace(/^\s*:?\s*/, '') };
 }
 if (s.includes(':')) { const [name, ...type] = s.split(':'); return { lead: vis, text: name.trim(), meta: type.join(':').trim() }; }
 const words = s.split(/\s+/);
 return words.length > 1 ? { lead: vis, text: words[words.length - 1], meta: words.slice(0, -1).join(' ') } : { lead: vis, text: s, meta: '' };
}

function parseClass(lines) {
 const nodes = new Map(), edges = [];
 let open = null, dir = 'TD';
 const cls = token => {
  let id = token.trim().replace(/^`|`$/g, '').replace(/:::[\w-]+$/, ''), label = '';
  const alias = id.match(/^([\p{L}\p{N}_-]+)\s*\[\s*"?([^"\]]*)"?\s*\]$/u);
  if (alias) { id = alias[1]; label = alias[2]; }
  const generic = id.match(/^([^~]+)~(.+)~$/);
  if (generic) { id = generic[1]; label ||= `${generic[1]}<${generic[2]}>`; }
  let node = nodes.get(id);
  if (!node) { node = { id, label: id, attrs: [], methods: [], stereo: '' }; nodes.set(id, node); }
  if (label) node.label = label;
  return node;
 };
 const member = (node, text) => {
  const s = text.trim();
  if (!s) return;
  const stereo = s.match(/^<<(.+)>>$/);
  if (stereo) node.stereo = stereo[1];
  else (s.includes('(') ? node.methods : node.attrs).push(s);
 };
 for (const raw of lines.slice(1)) {
  const line = raw.trim();
  let m;
  if (open) { if (line.startsWith('}')) open = null; else member(open, line); continue; }
  if ((m = line.match(/^direction\s+(LR|RL|TB|TD|BT)/i))) { dir = m[1].toUpperCase() === 'TB' ? 'TD' : m[1].toUpperCase(); continue; }
  if (/^(note|namespace|classDef|cssClass|style|click|link|callback)\b/i.test(line) || line === '}') continue;
  if ((m = line.match(/^class\s+([^{]+?)\s*(\{)?\s*(\})?$/))) { const node = cls(m[1]); if (m[2] && !m[3]) open = node; continue; }
  if ((m = line.match(/^<<(.+)>>\s+(\S+)$/))) { cls(m[2]).stereo = m[1]; continue; }
  if ((m = line.match(CLASS_REL))) {
   const [start, end, style] = CLASS_OPS[m[3]], a = cls(m[1]), b = cls(m[5]), flip = !start && end && end !== 'vee';
   edges.push({ from: (flip ? b : a).id, to: (flip ? a : b).id, label: cleanLabel(m[6] || ''), style, head: 'none', both: false, ends: flip ? { start: end, end: null } : { start, end } });
   continue;
  }
  if ((m = line.match(/^([\p{L}\p{N}_-]+)\s*:\s*(.+)$/u))) member(cls(m[1]), m[2]);
 }
 if (!nodes.size) return null;
 for (const node of nodes.values()) {
  const rows = [...node.attrs, ...node.methods].map(memberRow);
  asCard(node, cardOf(node.label, node.stereo ? `«${node.stereo}»` : '', rows, node.attrs.length));
 }
 return { dir, nodes: [...nodes.values()], edges };
}

/* Layered layout for flowcharts and state diagrams */

function sizeNode(node) {
 if (node.card) return;
 if (node.shape === 'start' || node.shape === 'end') { node.lines = []; node.w = node.h = 18; return; }
 node.lines = wrap(node.label, NODE.maxWidth);
 const tw = Math.max(...node.lines.map(line => textWidth(line))), th = node.lines.length * TEXT.line;
 let w = Math.max(NODE.minWidth, tw + NODE.padX * 2), h = th + NODE.padY * 2;
 if (node.shape === 'diamond') { const a = tw / 2 + th / 1.2 + 10; w = a * 2; h = a * 1.2; }
 else if (node.shape === 'circle') w = h = Math.max(tw, th) + 30;
 else if (node.shape === 'hexagon') w += h * 0.5;
 else if (node.shape === 'cylinder') h += 12;
 else if (node.shape === 'lean' || node.shape === 'flag') w += 16;
 else if (node.shape === 'subroutine') w += 12;
 node.w = Math.ceil(w);
 node.h = Math.ceil(h);
}

function isotonic(layer, want, weight, gap) {
 const n = layer.length, offset = [0];
 for (let i = 1; i < n; i++) offset[i] = offset[i - 1] + (layer[i - 1].cross + layer[i].cross) / 2 + gap;
 const blocks = [];
 for (let i = 0; i < n; i++) {
  let block = { sum: (want[i] - offset[i]) * weight[i], weight: weight[i], from: i, to: i };
  while (blocks.length && blocks[blocks.length - 1].sum / blocks[blocks.length - 1].weight > block.sum / block.weight) {
   const prev = blocks.pop();
   block = { sum: prev.sum + block.sum, weight: prev.weight + block.weight, from: prev.from, to: block.to };
  }
  blocks.push(block);
 }
 for (const block of blocks) for (let i = block.from; i <= block.to; i++) layer[i].x = block.sum / block.weight + offset[i];
}

function crossings(layers) {
 let count = 0;
 for (let r = 1; r < layers.length; r++) {
  const links = [];
  for (const v of layers[r]) for (const u of v.up) links.push([u.order, v.order]);
  for (let i = 0; i < links.length; i++) for (let j = i + 1; j < links.length; j++) {
   if ((links[i][0] - links[j][0]) * (links[i][1] - links[j][1]) < 0) count++;
  }
 }
 return count;
}

function layoutFlow(graph, dir, hints) {
 const { nodes, edges } = graph, side = dir === 'LR' || dir === 'RL';
 const index = new Map(nodes.map((node, i) => [node.id, i]));
 const n = nodes.length;
 const links = edges.filter(e => e.from !== e.to).map(e => ({ ...e, u: index.get(e.from), v: index.get(e.to) }));
 const out = nodes.map(() => []);
 for (const link of links) out[link.u].push(link);
 const state = new Uint8Array(n);
 const visit = u => {
  state[u] = 1;
  for (const link of out[u]) {
   if (state[link.v] === 1) link.back = true;
   else if (!state[link.v]) visit(link.v);
  }
  state[u] = 2;
 };
 for (let u = 0; u < n; u++) if (!state[u]) visit(u);

 const succ = nodes.map(() => []), pred = nodes.map(() => []);
 for (const link of links) {
  link.a = link.back ? link.v : link.u;
  link.b = link.back ? link.u : link.v;
  succ[link.a].push(link);
  pred[link.b].push(link);
 }
 const rank = new Array(n).fill(0), indegree = pred.map(list => list.length), queue = [];
 for (let u = 0; u < n; u++) if (!indegree[u]) queue.push(u);
 for (let q = 0; q < queue.length; q++) {
  const u = queue[q];
  for (const link of succ[u]) {
   rank[link.b] = Math.max(rank[link.b], rank[u] + 1);
   if (!--indegree[link.b]) queue.push(link.b);
  }
 }
 for (let u = 0; u < n; u++) if (!pred[u].length && succ[u].length) rank[u] = Math.min(...succ[u].map(link => rank[link.b])) - 1;

 const verts = nodes.map((node, i) => ({ node, rank: rank[i], cross: side ? node.h : node.w, main: side ? node.w : node.h, up: [], down: [] }));
 for (const link of links) {
  const chain = [verts[link.a]];
  for (let r = rank[link.a] + 1; r < rank[link.b]; r++) {
   const dummy = { dummy: true, link, rank: r, cross: 12, main: 0, up: [], down: [] };
   verts.push(dummy);
   chain.push(dummy);
  }
  chain.push(verts[link.b]);
  for (let k = 1; k < chain.length; k++) { chain[k - 1].down.push(chain[k]); chain[k].up.push(chain[k - 1]); }
  link.chain = chain;
 }

 const depth = Math.max(...verts.map(v => v.rank)) + 1;
 const layers = Array.from({ length: depth }, () => []);
 const placed = new Set();
 const place = v => {
  if (placed.has(v)) return;
  placed.add(v);
  layers[v.rank].push(v);
  for (const w of v.down) place(w);
 };
 for (const v of verts) if (!v.dummy && !v.up.length) place(v);
 for (const v of verts) place(v);
 if (hints) {
  const hintOf = v => v.dummy ? (hints.get(nodes[v.link.a].id) + hints.get(nodes[v.link.b].id)) / 2 : hints.get(v.node.id);
  for (const layer of layers) {
   layer.forEach((v, i) => { v.seq = i; v.hint = hintOf(v); });
   layer.sort((a, b) => (Number.isFinite(a.hint) && Number.isFinite(b.hint) ? a.hint - b.hint : 0) || a.seq - b.seq);
  }
 }
 const number = () => layers.forEach(layer => layer.forEach((v, i) => { v.order = i; }));
 number();
 let best = layers.map(layer => [...layer]), bestCount = crossings(layers);
 for (let sweep = 0; sweep < SWEEPS.order && bestCount; sweep++) {
  const down = sweep % 2 === 0;
  for (let k = 1; k < depth; k++) {
   const layer = layers[down ? k : depth - 1 - k];
   for (const v of layer) {
    const near = down ? v.up : v.down;
    v.bary = near.length ? near.reduce((sum, w) => sum + w.order, 0) / near.length : v.order;
   }
   layer.sort((a, b) => a.bary - b.bary || a.order - b.order);
   layer.forEach((v, i) => { v.order = i; });
  }
  const count = crossings(layers);
  if (count < bestCount) { bestCount = count; best = layers.map(layer => [...layer]); }
 }
 best.forEach((layer, r) => { layers[r] = layer; });
 number();

 for (const layer of layers) {
  let x = 0;
  for (const v of layer) { v.x = x + v.cross / 2; x += v.cross + FLOW_GAP.node; }
  const shift = (x - FLOW_GAP.node) / 2;
  for (const v of layer) v.x -= shift;
 }
 for (let sweep = 0; sweep < SWEEPS.place; sweep++) {
  const down = sweep % 2 === 0, last = sweep === SWEEPS.place - 1;
  for (let k = 0; k < depth; k++) {
   const layer = layers[down ? k : depth - 1 - k];
   const want = layer.map(v => {
    const near = last ? [...v.up, ...v.down] : down ? (v.up.length ? v.up : v.down) : (v.down.length ? v.down : v.up);
    return near.length ? near.reduce((sum, w) => sum + w.x, 0) / near.length : v.x;
   });
   isotonic(layer, want, layer.map(v => v.dummy ? 3 : 1), FLOW_GAP.node);
  }
 }

 const labelRoom = new Array(depth).fill(0);
 for (const link of links) {
  if (!link.label) continue;
  const lines = wrap(link.label, 140, 12, 600);
  link.labelLines = lines;
  link.labelW = Math.max(...lines.map(line => textWidth(line, 12, 600))) + 16;
  link.labelH = lines.length * 16 + 6;
  const chain = link.back ? [...link.chain].reverse() : link.chain, segment = Math.floor((chain.length - 2) / 2);
  const r = Math.min(chain[segment].rank, chain[segment + 1].rank);
  labelRoom[r] = Math.max(labelRoom[r], (side ? link.labelW : link.labelH) + FLOW_GAP.label);
 }
 const size = layers.map(layer => Math.max(0, ...layer.map(v => v.main)));
 const drawn = new Array(depth).fill(false);
 for (const link of links) if (link.style !== 'hidden') for (let r = rank[link.a]; r < rank[link.b]; r++) drawn[r] = true;
 const gapAfter = r => drawn[r] ? Math.max(side ? FLOW_GAP.rankSide : FLOW_GAP.rank, labelRoom[r] + 24) : FLOW_GAP.node;
 const mainAt = [];
 let cursor = 0;
 for (let r = 0; r < depth; r++) {
  mainAt[r] = cursor + size[r] / 2;
  cursor += size[r] + gapAfter(r);
 }
 for (const v of verts) v.y = mainAt[v.rank];

 const minX = Math.min(...verts.map(v => v.x - v.cross / 2));
 let maxX = Math.max(...verts.map(v => v.x + v.cross / 2));
 const mainEnd = cursor - gapAfter(depth - 1);
 const flipMain = dir === 'BT' || dir === 'RL';
 const map = (x, y) => {
  const cx = x - minX, cy = flipMain ? mainEnd - y : y;
  return side ? [cy, cx] : [cx, cy];
 };

 const ports = new Map();
 const portFor = (v, sign, other) => {
  const key = `${verts.indexOf(v)}:${sign}`;
  if (!ports.has(key)) ports.set(key, []);
  const port = { v, other, x: v.x, y: v.y + sign * v.main / 2 };
  ports.get(key).push(port);
  return port;
 };
 const routes = links.map(link => {
  const chain = link.back ? [...link.chain].reverse() : link.chain;
  const first = chain[0], last = chain[chain.length - 1];
  const sign = chain[1].y > first.y ? 1 : -1;
  return { link, chain, start: portFor(first, sign, chain[1]), end: portFor(last, -sign, chain[chain.length - 2]) };
 });
 for (const list of ports.values()) {
  const v = list[0].v;
  if (list.length < 2 || v.dummy || ['diamond', 'circle', 'start', 'end'].includes(v.node.shape)) continue;
  list.sort((a, b) => a.other.x - b.other.x);
  const span = Math.min(v.cross * 0.56, (list.length - 1) * 16);
  list.forEach((port, i) => { port.x = v.x - span / 2 + span * i / (list.length - 1); });
 }

 const twins = new Set(links.filter(link => !link.back).map(link => `${link.u}:${link.v}`));
 const result = [];
 for (const { link, chain, start, end } of routes) {
  const points = [[start.x, start.y], ...chain.slice(1, -1).map(v => [v.x, v.y]), [end.x, end.y]];
  let bulge = null;
  if (link.back && chain.length === 2 && twins.has(`${link.v}:${link.u}`)) {
   const edgeX = v => ['diamond', 'circle', 'start', 'end'].includes(v.node.shape) ? v.x : v.x + v.cross / 2 - 12;
   points[0][0] = edgeX(chain[0]);
   points[1][0] = edgeX(chain[1]);
   bulge = [Math.max(points[0][0], points[1][0]) + BULGE, (points[0][1] + points[1][1]) / 2];
   points.splice(1, 0, bulge);
   maxX = Math.max(maxX, bulge[0] + (side ? link.labelH || 0 : link.labelW || 0) - 4);
  }
  const tail = points[points.length - 1], before = points[points.length - 2];
  const sign = Math.sign(tail[1] - before[1]) || 1;
  if (link.head !== 'none') tail[1] -= sign * ARROW.length;
  const head0 = points[0], startSign = Math.sign(points[1][1] - head0[1]) || 1;
  if (link.both && link.head !== 'none') head0[1] += startSign * ARROW.length;
  const pts = [];
  for (let i = 0; i < points.length; i++) {
   const [x, y] = map(...points[i]);
   if (!i) { pts.push(x, y); continue; }
   const [px, py] = points[i - 1], [qx, qy] = points[i], mid = (qy - py) / 2;
   pts.push(...map(px, py + mid), ...map(qx, qy - mid), x, y);
  }
  const segment = Math.floor((points.length - 2) / 2), a = points[segment], b = points[segment + 1];
  result.push({
   ...link,
   from: nodes[link.u],
   to: nodes[link.v],
   pts,
   labelAt: bulge ? map(bulge[0] + (side ? link.labelH || 0 : link.labelW || 0) / 2 - 8, bulge[1]) : map((a[0] + b[0]) / 2, (a[1] + b[1]) / 2),
  });
 }
 const places = verts.filter(v => !v.dummy).map(v => {
  const [cx, cy] = map(v.x, v.y);
  return { node: v.node, cx, cy, rank: v.rank, order: v.order };
 });
 return {
  places,
  edges: result,
  width: side ? mainEnd : maxX - minX,
  height: side ? maxX - minX : mainEnd,
  hints: new Map(verts.filter(v => !v.dummy).map(v => [v.node.id, v.x])),
 };
}

const EMPTY_LAYOUT = { places: [], edges: [], width: 0, height: 0, hints: new Map() };
const shiftPts = (pts, dx, dy) => pts.map((v, i) => v + (i % 2 ? dy : dx));

function packLevel(nodes, edges, dir, hints, room, full) {
 const linked = new Set();
 for (const e of edges) if (e.from !== e.to && (e.style !== 'hidden' || e.lift)) { linked.add(e.from); linked.add(e.to); }
 const loose = nodes.filter(n => !linked.has(n.id));
 if (loose.length < 2) return full;
 const core = nodes.filter(n => linked.has(n.id));
 const main = core.length ? layoutFlow({ nodes: core, edges: edges.filter(e => linked.has(e.from) && linked.has(e.to)) }, dir, hints) : EMPTY_LAYOUT;
 const greedy = [];
 for (const n of loose) {
  const row = greedy[greedy.length - 1];
  if (row && row.w + FLOW_GAP.node + n.w <= room) { row.w += FLOW_GAP.node + n.w; row.n++; }
  else greedy.push({ w: n.w, n: 1 });
 }
 const per = Math.ceil(loose.length / greedy.length), rows = [];
 for (const n of loose) {
  const row = rows[rows.length - 1];
  if (row && row.nodes.length < per && row.w + FLOW_GAP.node + n.w <= room) { row.nodes.push(n); row.w += FLOW_GAP.node + n.w; row.h = Math.max(row.h, n.h); }
  else rows.push({ nodes: [n], w: n.w, h: n.h });
 }
 const width = Math.max(main.width, ...rows.map(row => row.w));
 const dx = (width - main.width) / 2, depth = Math.max(-1, ...main.places.map(p => p.rank)) + 1;
 const places = main.places.map(p => ({ ...p, cx: p.cx + dx }));
 let y = main.height ? main.height + FLOW_GAP.rank : 0;
 rows.forEach((row, r) => {
  let x = (width - row.w) / 2;
  row.nodes.forEach((node, i) => {
   places.push({ node, cx: x + node.w / 2, cy: y + row.h / 2, rank: depth + r, order: i });
   x += node.w + FLOW_GAP.node;
  });
  y += row.h + (r < rows.length - 1 ? FLOW_GAP.node : 0);
 });
 return {
  places,
  edges: main.edges.map(e => ({ ...e, pts: shiftPts(e.pts, dx, 0), labelAt: [e.labelAt[0] + dx, e.labelAt[1]] })),
  width,
  height: y,
  hints: new Map([...main.hints, ...places.map(p => [p.node.id, p.cx])]),
 };
}

function sCurve(a, b, side) {
 if (side) { const m = (a[0] + b[0]) / 2; return [m, a[1], m, b[1], b[0], b[1]]; }
 const m = (a[1] + b[1]) / 2;
 return [a[0], m, b[0], m, b[0], b[1]];
}

function layoutGraph(graph, dir, hints, room, pack = false) {
 if (!graph.groups?.length) {
  const layout = graph.nodes.length ? layoutFlow(graph, dir, hints) : EMPTY_LAYOUT;
  return pack && layout.width > room ? packLevel(graph.nodes, graph.edges, dir, hints, room, layout) : layout;
 }
 const groups = new Map(graph.groups.map(g => [g.id, { ...g, nodes: [], kids: [], edges: [] }]));
 const root = { id: '', nodes: [], kids: [], edges: [] };
 const levelOf = id => groups.get(id) || root;
 for (const g of groups.values()) levelOf(g.parent).kids.push(g);
 const byId = new Map(graph.nodes.map(n => [n.id, n]));
 for (const n of graph.nodes) levelOf(n.group).nodes.push(n);
 const up = id => (groups.has(id) ? groups.get(id).parent : byId.get(id)?.group) || '';
 const path = id => { const out = [id]; for (let c = up(id), k = 0; k < 64; c = up(c), k++) { out.push(c); if (!c) break; } return out; };
 const lifted = [];
 graph.edges.forEach(e => {
  if (e.from === e.to) return;
  const pu = path(e.from), pv = path(e.to), lca = pu.slice(1).find(c => pv.slice(1).includes(c)) ?? '';
  const ru = pu[pu.indexOf(lca, 1) - 1], rv = pv[pv.indexOf(lca, 1) - 1];
  if (!ru || !rv || ru === rv) return;
  const level = levelOf(lca);
  if (ru === e.from && rv === e.to) { level.edges.push(e); return; }
  lifted.push({ edge: e, level, ru, rv });
  if (!level.edges.some(x => x.lift && x.from === ru && x.to === rv)) level.edges.push({ from: ru, to: rv, label: e.label, style: 'hidden', head: 'none', lift: true });
 });
 for (const level of [root, ...groups.values()]) {
  level.edges = level.edges.filter(x => !x.lift || !level.edges.some(y => !y.lift && y.from === x.from && y.to === x.to));
 }

 const lay = (level, levelDir, budget) => {
  for (const kid of level.kids) {
   kid.layout = lay(kid, kid.dir || levelDir, Math.max(CLUSTER.min, budget - CLUSTER.padX * 2));
   const titleW = kid.title ? textWidth(kid.title, CLUSTER.size, CLUSTER.weight) + CLUSTER.padX * 2 : 0;
   kid.w = Math.ceil(Math.max(CLUSTER.min, kid.layout.width + CLUSTER.padX * 2, Math.min(titleW, budget)));
   kid.h = Math.ceil(CLUSTER.head + (kid.layout.height ? kid.layout.height + CLUSTER.padBottom : CLUSTER.empty));
   kid.node = { id: kid.id, label: kid.title, shape: 'cluster', lines: [], w: kid.w, h: kid.h, cluster: kid, seq: kid.seq };
  }
  const members = [...level.nodes, ...level.kids.map(k => k.node)].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  level.used = levelDir;
  if (!members.length) return EMPTY_LAYOUT;
  const sub = { nodes: members, edges: level.edges };
  let layout = layoutFlow(sub, levelDir, hints);
  if ((level === root && !pack) || layout.width <= budget) return layout;
  layout = packLevel(members, level.edges, levelDir, hints, budget, layout);
  if (level !== root && layout.width > budget && (levelDir === 'LR' || levelDir === 'RL')) {
   const down = packLevel(members, level.edges, 'TD', hints, budget, layoutFlow(sub, 'TD', hints));
   if (down.width < layout.width) { layout = down; level.used = 'TD'; }
  }
  return layout;
 };
 const top = lay(root, dir, room);

 const places = [], edges = [], clusters = [], boxes = new Map(), routes = new Map(), merged = new Map(), across = dir === 'LR' || dir === 'RL';
 const put = (level, ox, oy, depth) => {
  for (const [k, v] of level.layout.hints) merged.set(k, v);
  for (const p of level.layout.places) {
   const cx = ox + p.cx, cy = oy + p.cy, n = p.node;
   boxes.set(n.id, { x: cx - n.w / 2, y: cy - n.h / 2, w: n.w, h: n.h });
   if (!n.cluster) { places.push({ node: n, cx, cy, rank: (across ? cx : cy) / 110, order: (across ? cy : cx) / 400 }); continue; }
   const k = n.cluster, x = cx - k.w / 2, y = cy - k.h / 2;
   clusters.push({ id: k.id, title: truncate(k.title, k.w - CLUSTER.padX * 2, CLUSTER.size, CLUSTER.weight), x, y, w: k.w, h: k.h, depth, rank: (across ? x : y) / 110 });
   put(k, x + (k.w - k.layout.width) / 2, y + CLUSTER.head, depth + 1);
  }
  for (const e of level.layout.edges) {
   const moved = { ...e, pts: shiftPts(e.pts, ox, oy), labelAt: [e.labelAt[0] + ox, e.labelAt[1] + oy] }, key = `${e.from.id}>${e.to.id}`;
   if (!routes.has(key) || e.lift) routes.set(key, moved);
   if (!e.lift) edges.push(moved);
  }
 };
 root.layout = top;
 put(root, 0, 0, 0);

 for (const { edge, level, ru, rv } of lifted) {
  const a = boxes.get(edge.from), b = boxes.get(edge.to), A = boxes.get(ru), B = boxes.get(rv);
  if (!a || !b || !A || !B) continue;
  const side = level.used === 'LR' || level.used === 'RL', M = side ? 0 : 1;
  const lo = box => side ? [box.x, box.x + box.w] : [box.y, box.y + box.h];
  const mid = box => side ? box.y + box.h / 2 : box.x + box.w / 2;
  const s = (lo(B)[0] + lo(B)[1]) >= (lo(A)[0] + lo(A)[1]) ? 1 : -1;
  const at = (box, sign) => lo(box)[sign > 0 ? 1 : 0];
  const point = (cross, main) => side ? [main, cross] : [cross, main];
  const route = routes.get(`${ru}>${rv}`);
  const inner = [];
  if (route) for (let i = 6; i < route.pts.length - 2; i += 6) inner.push([route.pts[i], route.pts[i + 1]]);
  const way = [point(mid(a), at(a, s))];
  if (a !== A) way.push(point(mid(a), at(A, s)));
  way.push(...inner);
  if (b !== B) way.push(point(mid(b), at(B, -s)));
  const end = point(mid(b), at(b, -s));
  if (edge.head !== 'none') end[M] -= s * ARROW.length;
  if (edge.both && edge.head !== 'none') way[0][M] += s * ARROW.length;
  way.push(end);
  const pts = [...way[0]];
  let label = null, longest = -1;
  for (let i = 1; i < way.length; i++) {
   const p = way[i - 1], q = way[i];
   const flat = (i === 1 && a !== A) || (i === way.length - 1 && b !== B);
   pts.push(...(flat ? straight(p[0], p[1], q[0], q[1]) : sCurve(p, q, side)));
   const span = Math.hypot(q[0] - p[0], q[1] - p[1]) - (flat ? 1e4 : 0);
   if (span > longest) { longest = span; label = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; }
  }
  const lines = edge.label ? wrap(edge.label, 140, 12, 600) : null;
  edges.push({
   ...edge, from: { id: edge.from }, to: { id: edge.to }, pts, labelAt: label,
   labelLines: lines, labelW: lines ? Math.max(...lines.map(line => textWidth(line, 12, 600))) + 16 : 0, labelH: lines ? lines.length * 16 + 6 : 0,
  });
 }
 return { places, edges, clusters, width: top.width, height: top.height, hints: merged };
}

/* Scenes: every kind compiles to keyed items with numeric props that springs animate */

function flowScene(graph, tones, { width, hints, sideways }, dialect) {
 if (!graph) return null;
 for (const node of graph.nodes) sizeNode(node);
 const side = graph.dir === 'LR' || graph.dir === 'RL', alt = side ? 'TD' : 'LR';
 let turned = !!sideways && sideways === graph.dir;
 const room = width - PAD * 2;
 let layout = layoutGraph(graph, turned ? alt : graph.dir, hints, room);
 if (turned && layout.width > room) {
  const packed = layoutGraph(graph, alt, hints, room, true), back = layoutGraph(graph, graph.dir, hints, room, true);
  if (packed.width < layout.width) layout = packed;
  if (Math.min(1, room / back.width) > Math.min(1, room / layout.width) + TURN.gain) { layout = back; turned = false; }
 }
 if (side && !turned && layout.width * SIDE_FIT > room) {
  const down = layoutGraph(graph, 'TD', hints, room);
  if (Math.min(1, room / down.width) > room / layout.width + 0.05) { layout = down; turned = true; }
 }
 if (layout.width > room) {
  const packed = layoutGraph(graph, turned ? alt : graph.dir, hints, room, true);
  if (packed.width < layout.width) layout = packed;
 }
 if (!side && !turned && layout.width * TURN.fit > room) {
  const across = layoutGraph(graph, alt, hints, room, true);
  if (Math.min(1, room / across.width) > room / layout.width + TURN.gain) { layout = across; turned = true; }
 }
 const accent = tones[0], items = [], rank = new Map(), labels = new Map();
 for (const c of layout.clusters || []) {
  rank.set(c.id, c.rank);
  items.push({
   key: `g:${c.id}`, type: 'cluster', order: c.rank - 0.3 + c.depth * 0.1,
   props: { x: c.x, y: c.y, w: c.w, h: c.h },
   fixed: { title: c.title, depth: c.depth },
  });
 }
 const into = new Set(), out = new Set();
 for (const e of graph.edges) {
  if (e.from === e.to) continue;
  out.add(e.from);
  into.add(e.to);
 }
 const real = layout.places.filter(p => p.node.shape !== 'start' && p.node.shape !== 'end');
 const keys = new Set();
 if (dialect === 'flow' && real.length > 3) {
  const sources = real.filter(p => !into.has(p.node.id)), sinks = real.filter(p => !out.has(p.node.id) && into.has(p.node.id));
  if (sources.length <= 2) sources.forEach(p => keys.add(p.node.id));
  if (sinks.length <= 2) sinks.forEach(p => keys.add(p.node.id));
 }
 for (const place of layout.places) {
  const node = place.node, pseudo = node.shape === 'start' || node.shape === 'end';
  rank.set(node.id, place.rank);
  labels.set(node.id, node.label);
  items.push({
   key: `n:${node.id}`, type: 'node', order: place.rank + place.order * 0.25,
   props: { x: place.cx, y: place.cy, w: node.w, h: node.h },
   fixed: { shape: node.shape, lines: node.lines, tone: accent, id: node.id, key: pseudo || keys.has(node.id), card: node.card || null, cardKey: node.card?.key || '' },
  });
 }
 const seen = new Map();
 for (const edge of layout.edges) {
  if (edge.style === 'hidden') continue;
  const base = `${edge.from.id}>${edge.to.id}`, n = seen.get(base) || 0;
  seen.set(base, n + 1);
  const key = `e:${base}:${n}`, order = rank.get(edge.from.id) + 0.55;
  items.push({
   key, type: 'edge', order,
   props: { pts: edge.pts },
   fixed: { style: edge.style, head: edge.head, both: edge.both, ends: edge.ends || null, tone: accent, a: edge.from.id, b: edge.to.id },
  });
  if (edge.label) {
   items.push({
    key: `l:${key}`, type: 'label', order: order + 0.3,
    props: { x: edge.labelAt[0], y: edge.labelAt[1] },
    fixed: { lines: edge.labelLines, pill: true, w: edge.labelW, h: edge.labelH, cls: 'dg-edge-label', pop: true },
   });
  }
 }
 return { kind: 'flow', dialect, width: layout.width, height: layout.height, items, hints: layout.hints, sideways: turned ? graph.dir : false, labels, edges: true };
}

function sequenceScene(data, tones) {
 if (!data) return null;
 const actors = data.actors;
 actors.forEach((a, i) => {
  a.index = i;
  a.tone = tones[0];
  a.w = Math.max(92, Math.ceil(textWidth(a.label)) + 30);
 });
 const n = actors.length, gaps = [];
 for (let i = 0; i < n - 1; i++) gaps[i] = Math.max(SEQ.gap, (actors[i].w + actors[i + 1].w) / 2 + 28);
 const need = (i, j, width) => {
  if (i === j) { if (i < n - 1) gaps[i] = Math.max(gaps[i], width + SEQ.self + 20); return; }
  const [a, b] = i < j ? [i, j] : [j, i];
  let span = 0;
  for (let k = a; k < b; k++) span += gaps[k];
  if (span < width) for (let k = a; k < b; k++) gaps[k] += (width - span) / (b - a);
 };
 for (const e of data.events) {
  if (e.type === 'message') {
   e.lines = wrap(e.text, 260, 12.5, 600);
   e.width = Math.max(0, ...e.lines.map(line => textWidth(line, 12.5, 600))) + (data.numbered ? 58 : 36);
   need(e.from.index, e.to.index, e.width);
  } else if (e.type === 'note') {
   e.lines = wrap(e.text, 200, 12.5, 600);
   e.width = Math.max(...e.lines.map(line => textWidth(line, 12.5, 600))) + 24;
   if (e.actors.length > 1) need(e.actors[0].index, e.actors[e.actors.length - 1].index, e.width - 40);
  }
 }
 let x = SEQ.pad + actors[0].w / 2;
 actors.forEach((a, i) => { a.x = x; x += gaps[i] || 0; });
 const right = actors[n - 1].x + actors[n - 1].w / 2 + SEQ.pad;
 let y = SEQ.head + 22, number = 0, row = 0;
 for (const e of data.events) {
  e.row = row++;
  if (e.type === 'message') {
   e.y = y + e.lines.length * 16 + 4;
   e.number = data.numbered ? ++number : 0;
   y = e.y + (e.from === e.to ? SEQ.self + 14 : 20);
  } else if (e.type === 'note') {
   e.h = e.lines.length * 16 + 14;
   const xs = e.actors.map(a => a.x);
   if (e.side === 'over') {
    e.w = e.actors.length > 1 ? Math.max(...xs) - Math.min(...xs) + 60 : Math.max(e.width, 90);
    e.x = e.actors.length > 1 ? Math.min(...xs) - 30 : xs[0] - e.w / 2;
   } else if (e.side === 'right of') { e.x = xs[0] + 12; e.w = e.width; }
   else { e.x = xs[0] - 12 - e.width; e.w = e.width; }
   e.y = y;
   y += e.h + 12;
  } else if (e.type === 'open') { e.frame.top = y; y += 30; }
  else if (e.type === 'divide') { e.y = y; y += 28; }
  else if (e.type === 'close') { e.frame.bottom = y; y += 14; }
 }
 const bottom = y + 6;
 const notes = data.events.filter(e => e.type === 'note');
 const minX = Math.min(0, ...notes.map(e => e.x - 4)), maxX = Math.max(right, ...notes.map(e => e.x + e.w + 4));
 const sx = v => v - minX;
 const items = [];
 actors.forEach((a, i) => {
  items.push({ key: `a:${a.id}`, type: 'node', order: i * 0.3, props: { x: sx(a.x), y: SEQ.head / 2, w: a.w, h: SEQ.head }, fixed: { shape: 'actor', lines: [a.label], tone: a.tone, id: a.id } });
  items.push({ key: `life:${a.id}`, type: 'line', layer: 'back', order: i * 0.3 + 0.4, props: { x1: sx(a.x), y1: SEQ.head, x2: sx(a.x), y2: bottom }, fixed: { cls: 'dg-life', tone: a.tone, draw: true } });
 });
 const base = 1 + n * 0.3;
 let message = 0, note = 0, divider = 0;
 for (const e of data.events) {
  const order = base + e.row * 0.75;
  if (e.type === 'message') {
   const k = message++, x1 = sx(e.from.x), x2 = sx(e.to.x), self = e.from === e.to, dir = Math.sign(x2 - x1) || 1;
   const head = e.head === '>>' ? 'arrow' : e.head === ')' ? 'open' : e.head === 'x' ? 'cross' : 'none';
   const cut = head === 'arrow' || head === 'open' ? ARROW.length + 1 : 2;
   const pts = self
    ? polyline([[x1, e.y], [x1 + SEQ.self, e.y], [x1 + SEQ.self, e.y + SEQ.self], [x1 + cut + 1, e.y + SEQ.self]])
    : polyline([[x1 + dir * 2, e.y], [x2 - dir * cut, e.y]]);
   items.push({ key: `m:${k}`, type: 'edge', order, props: { pts }, fixed: { style: e.dashed ? 'dashed' : 'solid', head, both: false, tone: e.from.tone, grow: true, cls: 'dg-message' } });
   items.push({
    key: `ml:${k}`, type: 'label', order: order + 0.2,
    props: { x: self ? x1 + SEQ.self + 8 : (x1 + x2) / 2, y: e.y - 8 },
    fixed: { lines: e.lines, anchor: self ? 'start' : 'middle', baseline: 'above', cls: 'dg-message-label' },
   });
   if (e.number) items.push({ key: `mb:${k}`, type: 'badge', order, props: { x: x1 + dir * 14, y: e.y }, fixed: { n: e.number, tone: e.from.tone } });
  } else if (e.type === 'note') {
   items.push({ key: `note:${note++}`, type: 'note', order, props: { x: sx(e.x), y: e.y, w: e.w, h: e.h }, fixed: { lines: e.lines } });
  } else if (e.type === 'open') {
   const fr = e.frame, inset = 8 + fr.depth * 8;
   fr.key = `f:${e.row}`;
   fr.x = sx(inset);
   fr.w = right - inset * 2;
   const tag = `${fr.kind}${fr.label ? ` · ${fr.label}` : ''}`;
   items.push({ key: fr.key, type: 'frame', order, props: { x: fr.x, y: fr.top, w: fr.w, h: Math.max(20, (fr.bottom ?? bottom) - fr.top) }, fixed: { tag, tw: textWidth(tag, 11.5, 700) + 16 } });
  } else if (e.type === 'divide') {
   const fr = e.frame, k = divider++;
   items.push({ key: `d:${k}`, type: 'line', layer: 'back', order, props: { x1: fr.x, y1: e.y, x2: fr.x + fr.w, y2: e.y }, fixed: { cls: 'dg-divider' } });
   if (e.label) items.push({ key: `dl:${k}`, type: 'label', layer: 'back', order, props: { x: fr.x + 10, y: e.y + 14 }, fixed: { lines: [`[${e.label}]`], anchor: 'start', cls: 'dg-frame-label' } });
  }
 }
 return { kind: 'sequence', width: maxX - minX, height: bottom, items };
}

function pieScene(data, tones, { width }) {
 if (!data) return null;
 const total = data.items.reduce((sum, item) => sum + item.value, 0);
 const percents = Math.abs(total - 100) < 0.5;
 const percent = value => `${new Intl.NumberFormat(undefined, { maximumFractionDigits: percents || value / total < 0.1 ? 1 : 0 }).format(value / total * 100)}%`;
 const R = PIE.radius, size = (R + PIE.width / 2) * 2 + 8, c = size / 2;
 const rows = data.items.map(item => ({ label: item.label, value: data.showData && !percents ? `${format(item.value)} · ${percent(item.value)}` : percent(item.value) }));
 const labelW = Math.max(...rows.map(r => textWidth(r.label, 14, 650))), valueW = Math.max(...rows.map(r => textWidth(r.value, 14, 800)));
 const legendW = PIE.swatch + 12 + labelW + 28 + valueW;
 const legendH = rows.length * PIE.row;
 const stacked = size + PIE.legend + legendW > width - PAD * 2;
 const top = data.title ? PIE.title : 0;
 const W = stacked ? Math.max(size, legendW) : size + PIE.legend + legendW;
 const H = top + (stacked ? size + 28 + legendH : Math.max(size, legendH));
 const donutX = stacked ? (W - size) / 2 : 0, donutY = top + (stacked ? 0 : (H - top - size) / 2);
 const legendX = stacked ? (W - legendW) / 2 : size + PIE.legend, legendY = stacked ? top + size + 28 : top + (H - top - legendH) / 2;
 const items = [];
 if (data.title) items.push({ key: 'title', type: 'label', order: 0, props: { x: 0, y: 12 }, fixed: { lines: [data.title], anchor: 'start', cls: 'dg-title-text' } });
 const topIndex = data.items.reduce((best, item, i) => item.value > data.items[best].value ? i : best, 0);
 let start = 0;
 data.items.forEach((item, i) => {
  const share = item.value / total * 100;
  items.push({
   key: `s:${i}`, type: 'arc', order: start / 100 * 4.3,
   props: { start, sweep: share },
   fixed: { tone: tones[i % tones.length], cx: donutX + c, cy: donutY + c, r: R, width: PIE.width, gap: data.items.length > 1 ? PIE.gap : 0, index: i, active: i === topIndex },
  });
  items.push({
   key: `r:${i}`, type: 'legend', order: 0.6 + i * 0.3,
   props: { x: legendX, y: legendY + PIE.row * (i + 0.5) },
   fixed: { label: rows[i].label, value: rows[i].value, tone: tones[i % tones.length], w: legendW, index: i, active: i === topIndex },
  });
  start += share;
 });
 const centerLabel = label => label.length > 16 ? `${label.slice(0, 15)}…` : label;
 items.push({ key: 'c:v', type: 'label', order: 3.2, props: { x: donutX + c, y: donutY + c - 7 }, fixed: { lines: [percent(data.items[topIndex].value)], cls: 'dg-center-value', pop: true } });
 items.push({ key: 'c:l', type: 'label', order: 3.4, props: { x: donutX + c, y: donutY + c + 16 }, fixed: { lines: [centerLabel(data.items[topIndex].label)], cls: 'dg-center-label' } });
 return {
  kind: 'pie', width: W, height: H, items,
  pie: { top: topIndex, value: i => percent(data.items[i].value), label: i => centerLabel(data.items[i].label), count: data.items.length },
 };
}

function niceStep(span) {
 const rough = span / 5, mag = 10 ** Math.floor(Math.log10(rough || 1)), norm = rough / mag;
 return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
}

function smoothPts(points) {
 if (points.length < 3) return polyline(points);
 const pts = [points[0][0], points[0][1]];
 for (let i = 0; i < points.length - 1; i++) {
  const p0 = points[i - 1] || points[i], p1 = points[i], p2 = points[i + 1], p3 = points[i + 2] || p2;
  const lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1]);
  pts.push(p1[0] + (p2[0] - p0[0]) / 6, clamp(p1[1] + (p2[1] - p0[1]) / 6, lo, hi), p2[0] - (p3[0] - p1[0]) / 6, clamp(p2[1] - (p3[1] - p1[1]) / 6, lo, hi), p2[0], p2[1]);
 }
 return pts;
}

function chartScene(data, tones, { width }) {
 if (!data) return null;
 const all = data.series.flatMap(s => s.values), bars = data.series.filter(s => s.type === 'bar'), lines = data.series.filter(s => s.type === 'line');
 const toneOf = new Map(data.series.map((s, i) => [s, tones[i % tones.length]]));
 let lo = data.min ?? Math.min(0, ...all), hi = data.max ?? Math.max(...all);
 if (hi === lo) hi = lo + 1;
 const step = niceStep(hi - lo);
 if (data.min === null) lo = Math.floor(lo / step) * step;
 if (data.max === null) hi = Math.ceil(hi / step) * step;
 const ticks = [];
 for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) ticks.push(+v.toFixed(10));
 const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
 const W = Math.max(300, Math.min(CHART.maxWidth, width - PAD * 2));
 const items = [];
 let head = 0, corner = null;
 if (data.title) {
  items.push({ key: 'title', type: 'label', order: 0, props: { x: 0, y: 12 }, fixed: { lines: [data.title], anchor: 'start', cls: 'dg-title-text' } });
  head = CHART.title;
  corner = { x: textWidth(data.title, 14.5, 800) + 16, h: 26 };
 }
 if (data.series.length > 1 && data.series.some(s => s.name)) {
  const row = chips(data.series.map((s, i) => ({ text: s.name || `${i + 1}`, tone: toneOf.get(s) })), 0, head + 11, W);
  items.push(...row.items);
  if (!corner) corner = { x: row.width + 16, h: 22 };
  head += row.height + 6;
 }
 const ends = lines.length > 1 || (lines.length > 0 && bars.length > 0);
 const endW = ends ? Math.max(...lines.map(s => textWidth(format(s.values[s.values.length - 1]), 11.5, 800))) + 16 : 0;
 const [padTop, padSide, padBottom] = CHART.pad, padRight = Math.max(padSide, endW);
 const top = padTop + head;
 const left = Math.ceil(Math.max(...ticks.map(t => textWidth(compact.format(t), 11.5, 600)))) + 14 + (data.yTitle ? 18 : 0);
 const H = top + CHART.height - padTop + (data.xTitle ? 18 : 0);
 const plotW = W - left - padRight, plotH = H - top - padBottom - (data.xTitle ? 18 : 0);
 const count = data.labels.length, band = plotW / count;
 const y = v => top + plotH - (clamp(v, lo, hi) - lo) / (hi - lo) * plotH;
 const zero = y(clamp(0, lo, hi));
 const labeled = count * Math.max(1, bars.length) <= CHART.labeled;
 for (const t of ticks) {
  items.push({ key: `g:${t}`, type: 'line', layer: 'back', order: 0, props: { x1: left, y1: y(t), x2: left + plotW, y2: y(t) }, fixed: { cls: t === 0 ? 'dg-grid is-zero' : 'dg-grid' } });
  items.push({ key: `t:${t}`, type: 'label', layer: 'back', order: 0, props: { x: left - 10, y: y(t) }, fixed: { lines: [compact.format(t)], anchor: 'end', cls: 'dg-tick' } });
 }
 const every = Math.max(1, Math.ceil(Math.max(...data.labels.map(l => textWidth(l, 11.5, 600))) / (band - 6)));
 data.labels.forEach((text, i) => {
  if (i % every) return;
  items.push({ key: `x:${i}`, type: 'label', layer: 'back', order: 0, props: { x: left + band * (i + 0.5), y: top + plotH + 10 }, fixed: { lines: [text], baseline: 'below', cls: 'dg-tick' } });
 });
 if (data.yTitle) items.push({ key: 'yt', type: 'label', layer: 'back', order: 0, props: { x: 12, y: top + plotH / 2 }, fixed: { lines: [data.yTitle], rotate: -90, cls: 'dg-axis-title' } });
 if (data.xTitle) items.push({ key: 'xt', type: 'label', layer: 'back', order: 0, props: { x: left + plotW / 2, y: H - 8 }, fixed: { lines: [data.xTitle], cls: 'dg-axis-title' } });
 const barW = Math.min(CHART.bar, band * 0.64 / Math.max(1, bars.length));
 bars.forEach((series, s) => {
  const tone = toneOf.get(series);
  series.values.forEach((value, i) => {
   const x = left + band * i + band / 2 - barW * bars.length / 2 + barW * s + 1.5, w = barW - 3, yv = y(value), up = value >= 0;
   items.push({ key: `b:${s}:${i}`, type: 'bar', order: i * 0.25 + s * 0.12, props: { x, top: yv, w, base: zero }, fixed: { tone } });
   if (labeled) items.push({ key: `v:${s}:${i}`, type: 'label', layer: 'labels', order: i * 0.25 + 1.8, props: { x: x + w / 2, y: up ? yv - 8 : yv + 14 }, fixed: { lines: [format(value)], baseline: up ? 'above' : 'below', cls: 'dg-value' } });
  });
 });
 lines.forEach((series, s) => {
  const tone = toneOf.get(series);
  const points = series.values.map((value, i) => [left + band * (i + 0.5), y(value)]);
  const pts = smoothPts(points);
  if (!bars.length && lines.length === 1) items.push({ key: `ar:${s}`, type: 'area', layer: 'back', order: 2, props: { pts, base: zero }, fixed: { tone } });
  items.push({ key: `ln:${s}`, type: 'edge', order: bars.length ? 1 : 0.2, props: { pts }, fixed: { style: 'solid', head: 'none', tone, cls: 'dg-stroke', draw: 900 } });
  points.forEach(([px, py], i) => {
   const at = (bars.length ? 1 : 0.2) + (points.length > 1 ? i / (points.length - 1) : 0) * 4;
   items.push({ key: `p:${s}:${i}`, type: 'dot', order: at, props: { x: px, y: py, r: 3.6 }, fixed: { cls: 'dg-point', tone } });
   if (!ends && labeled) items.push({ key: `pv:${s}:${i}`, type: 'label', order: at + 0.5, props: { x: px, y: py - 11 }, fixed: { lines: [format(series.values[i])], baseline: 'above', cls: 'dg-value' } });
  });
 });
 if (ends) {
  const marks = lines.map((series, s) => {
   const i = series.values.length - 1;
   return { s, tone: toneOf.get(series), text: format(series.values[i]), x: left + band * (i + 0.5) + 10, y: y(series.values[i]) };
  });
  spread(marks, 16, top, top + plotH);
  for (const m of marks) items.push({ key: `end:${m.s}`, type: 'label', order: 5.2, props: { x: m.x, y: m.y }, fixed: { lines: [m.text], anchor: 'start', cls: 'dg-end', tone: m.tone } });
 }
 const probe = {
  x0: left, x1: left + plotW, y0: top, y1: top + plotH,
  xs: data.labels.map((_, i) => left + band * (i + 0.5)),
  tip: i => ({ title: data.xTitle && /^[-\d.,\s]+$/.test(data.labels[i]) ? `${data.xTitle} ${data.labels[i]}` : data.labels[i], rows: data.series.map(s => ({ tone: toneOf.get(s), name: s.name, value: Number.isFinite(s.values[i]) ? format(s.values[i]) : '–' })) }),
  keys: i => [...bars.map((_, s) => `b:${s}:${i}`), ...lines.map((_, s) => `p:${s}:${i}`)],
 };
 return { kind: 'chart', width: W, height: H, items, probe, corner };
}

function candleScene(data, tones, { width }) {
 if (!data) return null;
 const rows = data.rows, n = rows.length, first = rows[0], last = rows[n - 1];
 const W = Math.max(340, Math.min(CANDLE.maxWidth, width - PAD * 2));
 const dir = r => r.c >= r.o ? 'is-up' : 'is-down';
 let lo = Math.min(...rows.map(r => r.l)), hi = Math.max(...rows.map(r => r.h));
 const room = (hi - lo) * 0.08 || Math.abs(hi) * 0.02 || 1;
 lo -= room;
 hi += room;
 const step = niceStep(hi - lo), digits = decimalsFor(step);
 const tickFmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
 const priceFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: Math.abs(last.c) >= 1 ? 2 : 6 });
 const pctFmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
 const volFmt = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 2 });
 const signed = (v, fmt) => `${v >= 0 ? '+' : '−'}${fmt.format(Math.abs(v))}`;
 const times = rows.map(r => parseDate(r.label));
 if (times.every(Number.isFinite)) {
  const intraday = times[n - 1] - times[0] < 3 * DAY, timed = times.some(t => t % DAY);
  const axis = new Intl.DateTimeFormat(undefined, intraday ? { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' } : { timeZone: 'UTC', day: 'numeric', month: 'short' });
  const full = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric', ...(timed ? { hour: '2-digit', minute: '2-digit' } : {}) });
  rows.forEach((r, i) => { r.axis = axis.format(times[i]); r.full = full.format(times[i]); });
 }
 const items = [];
 let y0 = 0, titleW = 0;
 if (data.title) {
  items.push({ key: 'title', type: 'label', order: 0, props: { x: 0, y: 11 }, fixed: { lines: [data.title], anchor: 'start', cls: 'dg-title-text' } });
  titleW = textWidth(data.title, 14.5, 800);
  y0 = 28;
 }
 const change = last.c - first.o, pct = first.o ? change / first.o * 100 : 0;
 const priceText = priceFmt.format(last.c), priceW = textWidth(priceText, 26, 800);
 const changeText = `${signed(change, priceFmt)}  ${signed(pct, pctFmt)}%`;
 items.push({ key: 'price', type: 'label', order: 0.1, props: { x: 0, y: y0 + 16 }, fixed: { lines: [priceText], anchor: 'start', cls: 'dg-price' } });
 items.push({ key: 'change', type: 'label', order: 0.2, props: { x: priceW + 12, y: y0 + 18 }, fixed: { lines: [changeText], anchor: 'start', cls: `dg-change ${change >= 0 ? 'is-up' : 'is-down'}` } });
 let headW = priceW + 12 + textWidth(changeText, 13.5, 700);
 if (data.ma.length) {
  const row = chips(data.ma.map((p, i) => ({ text: `MA ${p}`, tone: tones[i % tones.length] })), headW + 24, y0 + 18, Infinity);
  items.push(...row.items);
  headW += 24 + row.width;
 }
 const corner = { x: Math.max(titleW, headW) + 16, h: y0 + 34 };
 const top = y0 + CANDLE.head;
 const ticks = [];
 for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(+v.toFixed(10));
 const tagText = priceFmt.format(last.c), tagW = textWidth(tagText, 11.5, 800) + 14;
 const axisW = Math.ceil(Math.max(tagW, ...ticks.map(t => textWidth(tickFmt.format(t), 11.5, 600)))) + 12;
 const plotW = W - axisW, hasVol = rows.some(r => r.v > 0), maxV = Math.max(1e-9, ...rows.map(r => r.v));
 const volTop = top + CANDLE.price + CANDLE.gap, bottom = hasVol ? volTop + CANDLE.volume : top + CANDLE.price;
 const y = v => top + (hi - v) / (hi - lo) * CANDLE.price;
 const band = plotW / n, bodyW = clamp(band * CANDLE.body, 1.5, CANDLE.maxBody), ly = y(last.c);
 for (const t of ticks) {
  items.push({ key: `g:${t}`, type: 'line', layer: 'back', order: 0, props: { x1: 0, y1: y(t), x2: plotW, y2: y(t) }, fixed: { cls: 'dg-grid' } });
  if (Math.abs(y(t) - ly) > 14) items.push({ key: `t:${t}`, type: 'label', layer: 'back', order: 0, props: { x: plotW + 10, y: y(t) }, fixed: { lines: [tickFmt.format(t)], anchor: 'start', cls: 'dg-tick' } });
 }
 if (hasVol) items.push({ key: 'vsep', type: 'line', layer: 'back', order: 0, props: { x1: 0, y1: volTop - CANDLE.gap / 2, x2: plotW, y2: volTop - CANDLE.gap / 2 }, fixed: { cls: 'dg-grid is-solid' } });
 const labelW = Math.max(...rows.map(r => textWidth(r.axis || r.label, 11.5, 600)));
 const every = Math.max(1, Math.ceil((labelW + 16) / band));
 rows.forEach((r, i) => {
  if (i % every || band * (i + 0.5) + labelW / 2 > W) return;
  items.push({ key: `x:${i}`, type: 'label', layer: 'back', order: 0, props: { x: band * (i + 0.5), y: bottom + 10 }, fixed: { lines: [r.axis || r.label], baseline: 'below', cls: 'dg-tick' } });
 });
 rows.forEach((r, i) => {
  const x = band * (i + 0.5), order = 0.5 + i * (4 / n);
  items.push({ key: `k:${i}`, type: 'candle', order, props: { x, o: y(r.o), h: y(r.h), l: y(r.l), c: y(r.c), w: bodyW }, fixed: { cls: dir(r) } });
  if (hasVol) items.push({ key: `vol:${i}`, type: 'column', layer: 'back', order: order + 0.15, props: { x: x - bodyW / 2, top: bottom - CANDLE.volume * r.v / maxV, w: bodyW, base: bottom }, fixed: { cls: `dg-vol ${dir(r)}`, r: 1.5 } });
 });
 data.ma.forEach((p, k) => {
  const points = [];
  for (let i = p - 1; i < n; i++) {
   let sum = 0;
   for (let j = i - p + 1; j <= i; j++) sum += rows[j].c;
   points.push([band * (i + 0.5), y(sum / p)]);
  }
  if (points.length > 1) items.push({ key: `ma:${p}`, type: 'edge', order: 4.6 + k * 0.2, props: { pts: smoothPts(points) }, fixed: { style: 'solid', head: 'none', tone: tones[k % tones.length], cls: 'dg-stroke is-ma', draw: 800 } });
 });
 items.push({ key: 'last', type: 'line', layer: 'back', order: 4.8, props: { x1: 0, y1: ly, x2: plotW, y2: ly }, fixed: { cls: `dg-last ${dir(last)}`, draw: true } });
 items.push({ key: 'tag', type: 'label', order: 5.2, props: { x: plotW + 4 + tagW / 2, y: ly }, fixed: { lines: [tagText], pill: true, w: tagW, h: 20, cls: `dg-last-tag ${dir(last)}`, pop: true } });
 const probe = {
  x0: 0, x1: plotW, y0: top, y1: bottom,
  xs: rows.map((_, i) => band * (i + 0.5)),
  tip: i => {
   const r = rows[i], cls = dir(r);
   return {
    title: r.full || r.label,
    rows: [
     { name: I18n.t('chart.open'), value: priceFmt.format(r.o) },
     { name: I18n.t('chart.high'), value: priceFmt.format(r.h) },
     { name: I18n.t('chart.low'), value: priceFmt.format(r.l) },
     { name: I18n.t('chart.close'), value: priceFmt.format(r.c), cls },
     { name: I18n.t('chart.change'), value: `${signed(r.o ? (r.c - r.o) / r.o * 100 : 0, pctFmt)}%`, cls },
     ...(r.v ? [{ name: I18n.t('chart.volume'), value: volFmt.format(r.v) }] : []),
    ],
   };
  },
  keys: i => [`k:${i}`, `vol:${i}`],
 };
 return { kind: 'candles', width: W, height: bottom + 30, items, probe, corner };
}

function timelineScene(data, tones, { width }) {
 if (!data) return null;
 const accent = tones[0], room = Math.max(280, width - PAD * 2), periods = data.periods, n = periods.length;
 const items = [];
 let top = 0, corner = null;
 if (data.title) {
  items.push({ key: 'title', type: 'label', order: 0, props: { x: 0, y: 12 }, fixed: { lines: [data.title], anchor: 'start', cls: 'dg-title-text' } });
  top = CHART.title + 4;
  corner = { x: textWidth(data.title, 14.5, 800) + 16, h: 26 };
 }
 const colW = Math.min(TIMELINE.col, room / n);
 if (colW >= TIMELINE.minCol) {
  const W = colW * n;
  if (periods.some(p => p.section)) {
   let k = 0;
   for (let i = 0; i < n;) {
    let j = i;
    while (j + 1 < n && periods[j + 1].section === periods[i].section) j++;
    if (periods[i].section) {
     const x0 = i * colW + 12, x1 = (j + 1) * colW - 12;
     items.push({ key: `ts:${k}`, type: 'label', layer: 'back', order: i * 0.6, props: { x: x0, y: top + 6 }, fixed: { lines: [truncate(periods[i].section.toUpperCase(), x1 - x0, 11, 750)], anchor: 'start', cls: 'dg-eyebrow' } });
     items.push({ key: `tb:${k}`, type: 'line', layer: 'back', order: i * 0.6, props: { x1: x0, y1: top + 20, x2: x1, y2: top + 20 }, fixed: { cls: 'dg-bracket', draw: true } });
     k++;
    }
    i = j + 1;
   }
   top += 36;
  }
  const labels = periods.map(p => wrap(p.label, colW - 16, 15, 750).slice(0, 2));
  const labelH = Math.max(...labels.map(l => l.length)) * 19;
  const axisY = top + labelH + 16;
  items.push({ key: 'axis', type: 'line', layer: 'back', order: 0, props: { x1: colW * 0.5, y1: axisY, x2: W - colW * 0.5, y2: axisY }, fixed: { cls: 'dg-axis-line', draw: true } });
  let bottom = axisY;
  periods.forEach((p, i) => {
   const cx = colW * (i + 0.5), order = 0.3 + i * 0.6;
   items.push({ key: `tp:${i}`, type: 'label', order, props: { x: cx, y: axisY - 16 }, fixed: { lines: labels[i], baseline: 'above', lineHeight: 19, cls: 'dg-period' } });
   items.push({ key: `td:${i}`, type: 'dot', order: order + 0.1, props: { x: cx, y: axisY, r: 5 }, fixed: { cls: 'dg-tl-dot', tone: accent } });
   let ey = axisY + 22;
   p.events.forEach((event, j) => {
    const lines = wrap(event, colW - 22, 13, 550);
    items.push({ key: `te:${i}:${j}`, type: 'label', order: order + 0.25 + j * 0.12, props: { x: cx, y: ey }, fixed: { lines, baseline: 'below', lineHeight: TIMELINE.line, cls: j ? 'dg-event' : 'dg-event is-lead' } });
    ey += lines.length * TIMELINE.line + 8;
   });
   bottom = Math.max(bottom, ey - 8);
  });
  return { kind: 'timeline', width: W, height: bottom + 4, items, corner };
 }
 const labelW = Math.min(170, Math.max(...periods.map(p => textWidth(p.label, 14, 750))));
 const lineX = labelW + 22, textX = lineX + 22, W = Math.min(room, 760), textW = W - textX;
 let y = top + 4, section = '', dotTop = null, dotBottom = 0;
 periods.forEach((p, i) => {
  const order = i * 0.5;
  if (p.section && p.section !== section) {
   section = p.section;
   items.push({ key: `ts:${i}`, type: 'label', layer: 'back', order, props: { x: textX, y: y + 6 }, fixed: { lines: [p.section.toUpperCase()], anchor: 'start', cls: 'dg-eyebrow' } });
   y += 28;
  }
  const plines = wrap(p.label, labelW, 14, 750);
  items.push({ key: `tp:${i}`, type: 'label', order, props: { x: labelW, y }, fixed: { lines: plines, anchor: 'end', baseline: 'below', lineHeight: 19, cls: 'dg-period is-side' } });
  items.push({ key: `td:${i}`, type: 'dot', order: order + 0.1, props: { x: lineX, y: y + 9, r: 5 }, fixed: { cls: 'dg-tl-dot', tone: accent } });
  dotTop ??= y + 9;
  dotBottom = y + 9;
  let ey = y;
  p.events.forEach((event, j) => {
   const lines = wrap(event, textW, 13, 550);
   items.push({ key: `te:${i}:${j}`, type: 'label', order: order + 0.2 + j * 0.1, props: { x: textX, y: ey + 1 }, fixed: { lines, anchor: 'start', baseline: 'below', lineHeight: 19, cls: j ? 'dg-event' : 'dg-event is-lead' } });
   ey += lines.length * 19 + 5;
  });
  y = Math.max(ey, y + plines.length * 19) + 16;
 });
 if (n > 1) items.push({ key: 'axis', type: 'line', layer: 'back', order: 0, props: { x1: lineX, y1: dotTop, x2: lineX, y2: dotBottom }, fixed: { cls: 'dg-axis-line', draw: true } });
 return { kind: 'timeline', width: W, height: y - 16, items, corner };
}

function timeTicks(lo, hi, plotW) {
 const span = hi - lo, max = Math.max(2, Math.floor(plotW / 78)), out = [];
 const fmt = opts => new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', ...opts });
 if (span <= 2 * DAY) {
  const hours = [1, 2, 3, 6, 12, 24].find(h => span / (h * 36e5) <= max) || 24, step = hours * 36e5, time = fmt({ hour: '2-digit', minute: '2-digit' });
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) out.push({ t, label: time.format(t) });
 } else if (span <= max * DAY * 1.5) {
  const days = Math.max(1, Math.ceil(span / DAY / max)), day = fmt({ day: 'numeric', month: 'short' });
  for (let t = Math.ceil(lo / DAY) * DAY; t <= hi; t += days * DAY) out.push({ t, label: day.format(t) });
 } else if (span <= max * 7 * DAY) {
  const weeks = Math.max(1, Math.ceil(span / (7 * DAY) / max)), day = fmt({ day: 'numeric', month: 'short' });
  let t = Math.ceil(lo / DAY) * DAY;
  while (new Date(t).getUTCDay() !== 1) t += DAY;
  for (; t <= hi; t += weeks * 7 * DAY) out.push({ t, label: day.format(t) });
 } else if (span <= max * 31 * DAY) {
  const months = [1, 2, 3, 6].find(k => span / (k * 30.44 * DAY) <= max) || 12;
  const month = fmt({ month: 'short' }), year = fmt({ month: 'short', year: 'numeric' }), d = new Date(lo);
  for (let k = 1; ; k++) {
   const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1);
   if (t > hi) break;
   const m = new Date(t).getUTCMonth();
   if (m % months) continue;
   out.push({ t, label: (m === 0 || !out.length ? year : month).format(t) });
  }
 } else {
  const years = Math.max(1, Math.ceil(span / (365.25 * DAY) / max)), year = fmt({ year: 'numeric' });
  for (let y = new Date(lo).getUTCFullYear() + 1; Date.UTC(y, 0, 1) <= hi; y += years) out.push({ t: Date.UTC(y, 0, 1), label: year.format(Date.UTC(y, 0, 1)) });
 }
 return out;
}

function ganttScene(data, tones, { width }) {
 if (!data) return null;
 const tasks = data.tasks;
 let lo = Math.min(...tasks.map(t => t.start)), hi = Math.max(...tasks.map(t => t.end));
 if (hi - lo < 36e5) hi = lo + DAY;
 const pad = (hi - lo) * 0.02;
 lo -= pad;
 hi += pad;
 const W = Math.max(440, Math.min(GANTT.maxWidth, width - PAD * 2));
 const labelW = Math.min(GANTT.label, Math.max(96, ...tasks.map(t => textWidth(t.name, 13, 600))) + 28);
 const plotW = W - labelW, x = t => labelW + (t - lo) / (hi - lo) * plotW;
 const hourly = hi - lo <= 2 * DAY;
 const when = new Intl.DateTimeFormat(undefined, hourly ? { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' } : { timeZone: 'UTC', day: 'numeric', month: 'short' });
 const unit = (value, name) => new Intl.NumberFormat(undefined, { style: 'unit', unit: name, unitDisplay: 'short', maximumFractionDigits: 1 }).format(value);
 const dur = ms => ms >= DAY ? unit(ms / DAY, 'day') : unit(ms / 36e5, 'hour');
 const items = [], tips = new Map(), toneOf = new Map();
 let head = 0, corner = null;
 if (data.title) {
  items.push({ key: 'title', type: 'label', order: 0, props: { x: 0, y: 12 }, fixed: { lines: [data.title], anchor: 'start', cls: 'dg-title-text' } });
  head = CHART.title;
  corner = { x: textWidth(data.title, 14.5, 800) + 16, h: 26 };
 }
 const rowsTop = head + GANTT.axis;
 let y = rowsTop, section = null, si = 0;
 tasks.forEach((t, i) => {
  if (t.section !== section) {
   section = t.section;
   if (!toneOf.has(section)) toneOf.set(section, tones[toneOf.size % tones.length]);
   if (section) {
    if (y > rowsTop) items.push({ key: `gr:${si}`, type: 'line', layer: 'back', order: i * 0.3, props: { x1: 0, y1: y + 4, x2: W, y2: y + 4 }, fixed: { cls: 'dg-sep' } });
    items.push({ key: `gs:${si}`, type: 'label', layer: 'back', order: i * 0.3, props: { x: 0, y: y + GANTT.section / 2 + 5 }, fixed: { lines: [truncate(section.toUpperCase(), labelW - 16, 11, 750)], anchor: 'start', cls: 'dg-eyebrow' } });
    si++;
    y += GANTT.section;
   }
  }
  const cy = y + GANTT.row / 2, order = 0.4 + i * 0.3, tag = name => t.tags.includes(name);
  const cls = `dg-task${tag('done') ? ' is-done' : ''}${tag('crit') ? ' is-crit' : ''}${tag('active') ? ' is-active' : ''}`;
  items.push({ key: `gn:${i}`, type: 'label', order, props: { x: 0, y: cy }, fixed: { lines: [truncate(t.name, labelW - 22, 13, 600)], anchor: 'start', cls: `dg-task-name${tag('done') ? ' is-done' : ''}` } });
  const x0 = x(t.start), x1 = Math.max(x0 + 6, x(t.end)), key = `gb:${i}`, milestone = tag('milestone');
  items.push({ key, type: 'span', order: order + 0.1, props: { x: x0, y: cy, w: milestone ? 0 : x1 - x0, h: milestone ? 15 : GANTT.bar }, fixed: { cls, tone: toneOf.get(section), milestone } });
  const last = t.end - t.start >= DAY && !hourly ? t.end - 1 : t.end;
  const text = milestone ? when.format(t.start) : dur(t.end - t.start), tw = textWidth(text, 11.5, 650);
  const after = milestone ? x0 + 13 : x1 + 8;
  if (after + tw <= W) items.push({ key: `gd:${i}`, type: 'label', order: order + 0.6, props: { x: after, y: cy }, fixed: { lines: [text], anchor: 'start', cls: 'dg-task-meta' } });
  else if (x0 - 8 - tw >= labelW) items.push({ key: `gd:${i}`, type: 'label', order: order + 0.6, props: { x: x0 - 8, y: cy }, fixed: { lines: [text], anchor: 'end', cls: 'dg-task-meta' } });
  const tip = { title: t.name, rows: [{ name: milestone ? '' : `${when.format(t.start)} – ${when.format(last)}`, value: milestone ? when.format(t.start) : dur(t.end - t.start) }], hot: [key, `gn:${i}`] };
  tips.set(key, tip);
  tips.set(`gn:${i}`, tip);
  y += GANTT.row;
 });
 for (const tick of timeTicks(lo, hi, plotW)) {
  const tx = x(tick.t);
  if (tx < labelW || tx + 6 + textWidth(tick.label, 11.5, 600) > W) continue;
  items.push({ key: `gt:${tick.t}`, type: 'line', layer: 'back', order: 0, props: { x1: tx, y1: rowsTop - 8, x2: tx, y2: y }, fixed: { cls: 'dg-grid' } });
  items.push({ key: `gl:${tick.t}`, type: 'label', layer: 'back', order: 0, props: { x: tx + 6, y: head + 12 }, fixed: { lines: [tick.label], anchor: 'start', cls: 'dg-tick' } });
 }
 const now = Date.now();
 if (!data.noToday && !hourly && now > lo && now < hi) {
  const tx = x(now), text = I18n.t('chart.today'), tw = textWidth(text, 11, 750) + 14;
  items.push({ key: 'today', type: 'line', layer: 'labels', order: 3, props: { x1: tx, y1: rowsTop - 8, x2: tx, y2: y }, fixed: { cls: 'dg-today', draw: true } });
  items.push({ key: 'today-tag', type: 'label', layer: 'labels', order: 3.4, props: { x: clamp(tx, labelW + tw / 2, W - tw / 2), y: y + 14 }, fixed: { lines: [text], pill: true, w: tw, h: 20, cls: 'dg-today-tag', pop: true } });
  y += 28;
 }
 return { kind: 'gantt', width: W, height: y + 4, items, tips, corner };
}

const MIND_TEXT = [[15, 750, 20, 220, 40, 22], [13.5, 650, 18, 180, 28, 14], [13, 550, 17, 220, 14, 5]];

function mindScene(root, tones) {
 if (!root) return null;
 const measure = (node, depth, path) => {
  const [size, weight, line, max, padX, padY] = MIND_TEXT[Math.min(depth, 2)];
  node.depth = depth;
  node.path = path;
  node.lines = wrap(node.label, max, size, weight);
  node.w = Math.ceil(Math.max(...node.lines.map(l => textWidth(l, size, weight))) + padX);
  node.h = node.lines.length * line + padY;
  node.children.forEach((child, i) => { child.parent = node; measure(child, depth + 1, `${path}.${i}`); });
  node.leaves = node.children.length ? node.children.reduce((sum, child) => sum + child.leaves, 0) : 1;
 };
 measure(root, 0, 'r');
 const right = [], left = [];
 let acc = 0;
 for (const child of root.children) {
  if (acc < root.leaves / 2) { right.push(child); acc += child.leaves; }
  else left.push(child);
 }
 const nodes = [];
 const side = (kids, dir) => {
  if (!kids.length) return;
  const colW = [];
  const walk = node => { colW[node.depth] = Math.max(colW[node.depth] || 0, node.w); node.children.forEach(walk); };
  kids.forEach(walk);
  const colX = [0, root.w / 2 + MIND.gapX];
  for (let d = 2; d < colW.length; d++) colX[d] = colX[d - 1] + colW[d - 1] + MIND.gapX * (d === 2 ? 1 : 0.75);
  let y = 0;
  const place = (node, tone, order) => {
   node.tone = tone;
   node.dir = dir;
   node.ax = dir * colX[node.depth];
   node.order = order;
   if (!node.children.length) { node.y = y + node.h / 2; y += node.h + MIND.gapY; return; }
   node.children.forEach((child, j) => place(child, tone, order + 0.35 + j * 0.12));
   node.y = (node.children[0].y + node.children[node.children.length - 1].y) / 2;
  };
  kids.forEach((kid, i) => {
   if (i) y += MIND.branch;
   place(kid, tones[(root.children.indexOf(kid) + 1) % tones.length], 0.5 + root.children.indexOf(kid) * 0.4);
  });
  const shift = -(y - MIND.gapY) / 2;
  const fix = node => { node.y += shift; nodes.push(node); node.children.forEach(fix); };
  kids.forEach(fix);
 };
 side(right, 1);
 side(left, -1);
 root.y = 0;
 let minX = -root.w / 2, maxX = root.w / 2, minY = -root.h / 2, maxY = root.h / 2;
 for (const node of nodes) {
  const far = node.ax + node.dir * node.w;
  minX = Math.min(minX, node.ax, far);
  maxX = Math.max(maxX, node.ax, far);
  minY = Math.min(minY, node.y - node.h / 2);
  maxY = Math.max(maxY, node.y + node.h / 2);
 }
 const ox = -minX, oy = -minY, items = [];
 items.push({ key: 'm:r', type: 'node', order: 0, props: { x: ox, y: oy, w: root.w, h: root.h }, fixed: { shape: 'stadium', lines: root.lines, tone: tones[0], key: true, id: 'r', cls: 'is-root' } });
 for (const node of nodes) {
  const p = node.parent, dir = node.dir;
  const sx = ox + (p === root ? dir * root.w / 2 : p.ax + dir * p.w), sy = oy + (p === root ? clamp(node.y * 0.2, -root.h / 4, root.h / 4) : p.y);
  const ex = ox + node.ax, ey = oy + node.y, mid = (ex - sx) / 2;
  items.push({ key: `mb:${node.path}`, type: 'edge', order: node.order - 0.1, props: { pts: [sx, sy, sx + mid, sy, ex - mid, ey, ex, ey] }, fixed: { style: 'solid', head: 'none', tone: node.tone, cls: `dg-branch is-d${Math.min(node.depth, 3)}`, draw: 420 } });
  if (node.depth === 1) {
   items.push({ key: `m:${node.path}`, type: 'node', order: node.order, props: { x: ox + node.ax + dir * node.w / 2, y: ey, w: node.w, h: node.h }, fixed: { shape: 'stadium', lines: node.lines, tone: node.tone, id: node.path, cls: 'is-branch' } });
  } else {
   items.push({ key: `md:${node.path}`, type: 'dot', order: node.order, props: { x: ex, y: ey, r: 3 }, fixed: { cls: 'dg-mind-dot', tone: node.tone } });
   items.push({ key: `m:${node.path}`, type: 'label', order: node.order + 0.05, props: { x: ex + dir * 9, y: ey }, fixed: { lines: node.lines, anchor: dir > 0 ? 'start' : 'end', lineHeight: 17, cls: 'dg-mind-leaf' } });
  }
 }
 return { kind: 'mindmap', width: maxX - minX, height: maxY - minY, items };
}

function quadrantScene(data, tones, { width }) {
 if (!data) return null;
 const accent = tones[0], items = [], tips = new Map();
 let top = 0, corner = null;
 if (data.title) {
  items.push({ key: 'title', type: 'label', order: 0, props: { x: 0, y: 12 }, fixed: { lines: [data.title], anchor: 'start', cls: 'dg-title-text' } });
  top = CHART.title + 4;
  corner = { x: textWidth(data.title, 14.5, 800) + 16, h: 26 };
 }
 const ax = data.y.some(Boolean) ? 26 : 0;
 const S = clamp(width - PAD * 2 - ax, QUAD.min, QUAD.max), half = (S - QUAD.gap) / 2;
 const px = v => ax + clamp01(v) * S, py = v => top + (1 - clamp01(v)) * S;
 const cells = [[1, ax + half + QUAD.gap, top, 'end', 'top'], [2, ax, top, 'start', 'top'], [3, ax, top + half + QUAD.gap, 'start', 'bottom'], [4, ax + half + QUAD.gap, top + half + QUAD.gap, 'end', 'bottom']];
 cells.forEach(([q, x, y, anchor, edge], i) => {
  const lead = q === 1 ? ' is-lead' : '';
  items.push({ key: `q:${q}`, type: 'rect', layer: 'back', order: i * 0.15, props: { x, y, w: half, h: half }, fixed: { cls: `dg-quad${lead}`, tone: accent, rx: 14 } });
  if (data.q[q - 1]) items.push({ key: `ql:${q}`, type: 'label', layer: 'back', order: 0.3 + i * 0.15, props: { x: anchor === 'start' ? x + 14 : x + half - 14, y: edge === 'top' ? y + 18 : y + half - 18 }, fixed: { lines: [truncate(data.q[q - 1], half - 28, 12.5, 700)], anchor, cls: `dg-quad-label${lead}`, tone: accent } });
 });
 const bottom = top + S;
 if (data.x[0]) items.push({ key: 'x0', type: 'label', layer: 'back', order: 0.5, props: { x: ax + 2, y: bottom + 16 }, fixed: { lines: [data.x[0]], anchor: 'start', cls: 'dg-axis-title' } });
 if (data.x[1]) items.push({ key: 'x1', type: 'label', layer: 'back', order: 0.5, props: { x: ax + S - 2, y: bottom + 16 }, fixed: { lines: [`${data.x[1]} →`], anchor: 'end', cls: 'dg-axis-title' } });
 if (data.y[0]) items.push({ key: 'y0', type: 'label', layer: 'back', order: 0.5, props: { x: 9, y: bottom - 2 }, fixed: { lines: [data.y[0]], anchor: 'start', rotate: -90, cls: 'dg-axis-title' } });
 if (data.y[1]) items.push({ key: 'y1', type: 'label', layer: 'back', order: 0.5, props: { x: 9, y: top + 2 }, fixed: { lines: [`${data.y[1]} →`], anchor: 'end', rotate: -90, cls: 'dg-axis-title' } });
 const boxes = data.points.map(p => ({ x: px(p.x) - 7, y: py(p.y) - 7, w: 14, h: 14 }));
 const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
 data.points.forEach((p, i) => {
  const x = px(p.x), y = py(p.y), tw = textWidth(p.label, 12.5, 650);
  const options = [[x + 10, y, 'start', x + 10], [x - 10, y, 'end', x - 10 - tw], [x, y - 16, 'middle', x - tw / 2], [x, y + 17, 'middle', x - tw / 2]];
  let pick = options[0];
  for (const option of options) {
   const box = { x: option[3], y: option[1] - 8, w: tw, h: 16 };
   if (box.x < ax || box.x + box.w > ax + S || box.y < top || box.y + box.h > bottom) continue;
   if (boxes.some((other, k) => k !== i && hit(box, other))) continue;
   pick = option;
   break;
  }
  boxes.push({ x: pick[3], y: pick[1] - 8, w: tw, h: 16 });
  const key = `qp:${i}`, order = 1 + i * 0.25;
  items.push({ key, type: 'dot', order, props: { x, y, r: 5.5 }, fixed: { cls: 'dg-q-point', tone: accent } });
  items.push({ key: `qn:${i}`, type: 'label', order: order + 0.1, props: { x: pick[0], y: pick[1] }, fixed: { lines: [p.label], anchor: pick[2], cls: 'dg-q-name' } });
  const tip = { title: p.label, rows: [{ name: data.x[1] || 'x', value: format(p.x) }, { name: data.y[1] || 'y', value: format(p.y) }], hot: [key, `qn:${i}`] };
  tips.set(key, tip);
  tips.set(`qn:${i}`, tip);
 });
 return { kind: 'quadrant', width: ax + S, height: bottom + (data.x.some(Boolean) ? 28 : 4), items, tips, corner };
}

function radarScene(data, tones, { width }) {
 if (!data) return null;
 const n = data.axes.length, items = [], tips = new Map();
 const labelW = Math.min(150, Math.max(...data.axes.map(a => textWidth(a.label, 12.5, 650))));
 const R = clamp((Math.min(660, width - PAD * 2) - 2 * (labelW + 18)) / 2, RADAR.min, RADAR.max);
 const values = data.curves.flatMap(c => c.data);
 const lo = data.min ?? 0, hi = data.max ?? niceCeil(Math.max(...values, lo + 1));
 const legend = data.curves.length > 1 ? chips(data.curves.map((c, i) => ({ text: c.label, tone: tones[i % tones.length] })), 0, 0, 640) : null;
 let top = 0, corner = null;
 if (data.title) {
  items.push({ key: 'title', type: 'label', order: 0, props: { x: 0, y: 12 }, fixed: { lines: [data.title], anchor: 'start', cls: 'dg-title-text' } });
  top = CHART.title;
  corner = { x: textWidth(data.title, 14.5, 800) + 16, h: 26 };
 }
 const W = Math.max(2 * (labelW + 18 + R), legend ? legend.width : 0), cx = W / 2, cy = top + 24 + R;
 const angle = i => -Math.PI / 2 + i * 2 * Math.PI / n;
 const at = (i, r) => [cx + Math.cos(angle(i)) * r, cy + Math.sin(angle(i)) * r];
 const ring = r => data.circle ? Array.from({ length: 64 }, (_, k) => [cx + Math.cos(k / 64 * 2 * Math.PI) * r, cy + Math.sin(k / 64 * 2 * Math.PI) * r]).flat() : data.axes.flatMap((_, i) => at(i, r));
 for (let k = 1; k <= data.levels; k++) {
  items.push({ key: `rg:${k}`, type: 'poly', layer: 'back', order: k * 0.1, props: { vs: ring(R * k / data.levels) }, fixed: { cx, cy, cls: `dg-radar-grid${k === data.levels ? ' is-outer' : ''}` } });
  if (k < data.levels) items.push({ key: `rt:${k}`, type: 'label', layer: 'front', order: 0.6, props: { x: cx + 6, y: cy - R * k / data.levels - 7 }, fixed: { lines: [format(lo + (hi - lo) * k / data.levels)], anchor: 'start', cls: 'dg-tick is-radar' } });
 }
 data.axes.forEach((axis, i) => {
  const [x, y] = at(i, R), [lx, ly] = at(i, R + 14), cos = Math.cos(angle(i)), sin = Math.sin(angle(i));
  items.push({ key: `rs:${i}`, type: 'line', layer: 'back', order: 0.2, props: { x1: cx, y1: cy, x2: x, y2: y }, fixed: { cls: 'dg-radar-spoke', draw: true } });
  items.push({ key: `ra:${i}`, type: 'label', layer: 'labels', order: 0.4 + i * 0.05, props: { x: lx, y: ly + sin * 4 }, fixed: { lines: [truncate(axis.label, labelW, 12.5, 650)], anchor: cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle', cls: 'dg-radar-axis' } });
 });
 data.curves.forEach((curve, c) => {
  const tone = tones[c % tones.length], order = 1 + c * 0.5;
  const points = curve.data.map((v, i) => at(i, R * clamp01((v - lo) / (hi - lo))));
  items.push({ key: `rc:${c}`, type: 'poly', order, props: { vs: points.flat() }, fixed: { cx, cy, tone, cls: 'dg-radar-curve' } });
  points.forEach(([x, y], i) => {
   const key = `rp:${c}:${i}`;
   items.push({ key, type: 'dot', layer: 'labels', order: order + 0.6, props: { x, y, r: 3.2 }, fixed: { cls: 'dg-point', tone } });
   tips.set(key, { title: data.axes[i].label, rows: [{ tone, name: curve.label, value: format(curve.data[i]) }] });
  });
 });
 let H = cy + R + 34;
 if (legend) {
  for (const item of legend.items) { item.props.x += (W - legend.width) / 2; item.props.y += H; item.order += 2; }
  items.push(...legend.items);
  H += legend.height;
 }
 return { kind: 'radar', width: W, height: H, items, tips, corner };
}

/* Wireframes: a website or app screen drawn from a list of sections */

const WF_SECTIONS = {
 nav: 'nav', navbar: 'nav', header: 'nav', menu: 'nav', navigation: 'nav', topbar: 'nav',
 hero: 'hero', banner: 'hero', intro: 'hero', jumbotron: 'hero', welcome: 'hero',
 logos: 'logos', clients: 'logos', partners: 'logos', brands: 'logos', trust: 'logos',
 features: 'features', benefits: 'features', advantages: 'features', services: 'features', pains: 'features', problems: 'features', grid: 'features', why: 'features',
 cards: 'cards', cases: 'cards', products: 'cards', portfolio: 'cards', projects: 'cards', team: 'cards', blog: 'cards', articles: 'cards', catalog: 'cards',
 steps: 'steps', process: 'steps', how: 'steps', workflow: 'steps', timeline: 'steps',
 stats: 'stats', numbers: 'stats', metrics: 'stats', facts: 'stats', kpi: 'stats',
 reviews: 'reviews', testimonials: 'reviews', quotes: 'reviews', feedback: 'reviews',
 pricing: 'pricing', plans: 'pricing', prices: 'pricing', tariffs: 'pricing',
 faq: 'faq', questions: 'faq', accordion: 'faq',
 cta: 'cta', offer: 'cta', action: 'cta', callout: 'cta',
 form: 'form', contact: 'form', contacts: 'form', signup: 'form', subscribe: 'form', lead: 'form', login: 'form', newsletter: 'form',
 gallery: 'gallery', images: 'gallery', photos: 'gallery', showcase: 'gallery',
 section: 'section', about: 'section', content: 'section', split: 'section', block: 'section', story: 'section', feature: 'section',
 footer: 'footer',
};
const WF_TYPES = ['nav', 'hero', 'logos', 'features', 'cards', 'steps', 'stats', 'reviews', 'pricing', 'faq', 'cta', 'form', 'gallery', 'section', 'footer'];
const WF_LISTS = new Set(['nav', 'logos', 'steps', 'form', 'footer', 'gallery']);
const WF_MEDIA = { image: 'image', img: 'image', photo: 'image', picture: 'image', screenshot: 'image', illustration: 'image', video: 'video', map: 'map' };
const WF = { max: 1040, phone: 390, bar: 46, status: 46, home: 30, radius: 14, phoneRadius: 44, btn: 40, gap: 16 };
const WT = {
 brand: [15, 760, 20], link: [12.5, 560, 16], h1: [36, 780, 42], h1s: [26, 780, 31], lead: [15.5, 450, 23], leads: [14.5, 450, 21],
 h2: [23, 760, 29], h2s: [19, 760, 25], sub: [14, 450, 21], title: [14.5, 700, 20], body: [13, 450, 19], small: [12, 560, 16],
 tag: [11.5, 700, 14], value: [30, 780, 34], price: [26, 780, 30], btn: [13.5, 650, 18], logo: [15, 800, 18], quote: [13.5, 500, 20], q: [14, 650, 20],
};
const GLYPHS = {
 image: 'M-9-7h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-18a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2zM-8 5.5l5.2-5.5 3.6 3.6 2.7-2.6 4.8 4.5M2.8-3.2a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0',
 play: 'M0-10a10 10 0 1 1 0 20a10 10 0 1 1 0-20zM-2.6-4.6l7 4.6-7 4.6z',
 pin: 'M0 9c-4.5-4.6-7-8-7-11.5a7 7 0 0 1 14 0c0 3.5-2.5 6.9-7 11.5zM0-5.2a2.3 2.3 0 1 1 0 4.6a2.3 2.3 0 1 1 0-4.6z',
 check: 'M-5 0.5l3.4 3.4 6.6-7',
 plus: 'M-5 0h10M0-5v10',
 minus: 'M-5 0h10',
 menu: 'M-7-5h14M-7 0h14M-7 5h14',
 lock: 'M-4.5-1h9v7h-9zM-3-1v-2.5a3 3 0 0 1 6 0v2.5',
 spark: 'M0-7l1.8 5.2 5.2 1.8-5.2 1.8-1.8 5.2-1.8-5.2-5.2-1.8 5.2-1.8z',
 bolt: 'M1.5-8l-6.5 9h5l-1.5 7 6.5-9h-5z',
 shield: 'M0-8l6.5 2.5v4.5c0 4-2.8 6.8-6.5 8-3.7-1.2-6.5-4-6.5-8v-4.5z',
 chart: 'M-6 6v-5M-2 6v-9M2 6v-6M6 6v-11',
 heart: 'M0 6.5c-4-3-6.8-5.6-6.8-8.6a3.6 3.6 0 0 1 6.8-1.8 3.6 3.6 0 0 1 6.8 1.8c0 3-2.8 5.6-6.8 8.6z',
 clock: 'M0-7.5a7.5 7.5 0 1 1 0 15a7.5 7.5 0 1 1 0-15zM0-4v4l2.8 2',
 star: 'M0-7.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z',
};
const WF_ICONS = ['spark', 'bolt', 'shield', 'chart', 'heart', 'clock', 'star', 'check'];
const WF_AREA = /(comment|message|question|details|коммент|сообщ|вопрос|описан|задач|пожелан|текст)/i;

function wfItem(text) {
 const s = cleanLabel(text), at = s.search(/:\s/);
 return at > 0 ? { title: s.slice(0, at).trim(), desc: s.slice(at + 1).trim() } : { title: s, desc: '' };
}

function wfLine(sec, word, rest, line) {
 const list = text => splitList(text).map(cleanLabel).filter(Boolean);
 if (WF_MEDIA[word]) { sec.media = WF_MEDIA[word]; return; }
 switch (word) {
  case 'title': case 'heading': case 'h1': case 'h2': sec.heading = cleanLabel(rest); return;
  case 'text': case 'subtitle': case 'p': case 'description': case 'lead': if (rest) sec.text.push(cleanLabel(rest)); return;
  case 'button': case 'btn': if (rest) sec.buttons.push(cleanLabel(rest)); return;
  case 'buttons': sec.buttons.push(...list(rest)); return;
  case 'badge': case 'tag': case 'eyebrow': sec.badge = cleanLabel(rest); return;
  case 'links': case 'fields': case 'items': case 'list': sec.items.push(...list(rest).map(wfItem)); return;
  case 'link': case 'field': case 'input': case 'item': if (rest) sec.items.push(wfItem(rest)); return;
 }
 if (WF_LISTS.has(sec.type) && !/:\s/.test(line) && line.includes(',')) sec.items.push(...list(line).map(wfItem));
 else sec.items.push(wfItem(line));
}

function parseWireframe(lines) {
 const page = { title: '', mobile: /\b(mobile|phone|iphone|android|app)\b/i.test(lines[0]), sections: [] };
 const counts = {};
 let base = -1, current = null;
 const open = (type, rest) => {
  const parts = rest.split(/\s+\|\s+/);
  counts[type] = (counts[type] ?? -1) + 1;
  current = { type, key: `${type}${counts[type]}`, n: counts[type], heading: cleanLabel(parts[0] || ''), text: [], items: [], buttons: [], media: '', badge: '' };
  if (parts[1]) current.items.push(...splitList(parts[1]).map(wfItem));
  if (parts[2]) current.buttons.push(...splitList(parts[2]).map(cleanLabel).filter(Boolean));
  page.sections.push(current);
 };
 for (const raw of lines.slice(1)) {
  const indent = raw.match(/^\s*/)[0].replace(/\t/g, '  ').length;
  const line = raw.trim().replace(/^[-*•]\s+/, '');
  if (!line) continue;
  const m = /^([a-z][a-z0-9-]*)(?:\s+(.*))?$/.exec(line);
  const word = m ? m[1] : '', rest = m ? (m[2] || '').trim() : '';
  if (!current && word === 'title') { page.title = cleanLabel(rest); continue; }
  if (!current && (word === 'device' || word === 'mobile' || word === 'desktop')) { page.mobile = /mobile|phone/i.test(`${word} ${rest}`); continue; }
  if (WF_SECTIONS[word] && (!current || indent <= base)) { base = indent; open(WF_SECTIONS[word], rest); continue; }
  if (!current) { base = indent - 1; open('section', ''); }
  wfLine(current, word, rest, line);
 }
 return page.sections.length ? page : null;
}

function wireframeScene(page, tones, { width }) {
 if (!page) return null;
 const phone = page.mobile, room = Math.max(240, width - PAD * 2);
 const W = Math.round(phone ? Math.min(WF.phone, room) : Math.min(WF.max, room));
 const gutter = W >= 720 ? 48 : W >= 520 ? 32 : 20, cw = Math.min(W - gutter * 2, 960), x0 = (W - cw) / 2, cx = W / 2;
 const wide = cw >= 620, pad = wide ? 56 : 36, tone = tones[0], items = [], tips = new Map();
 let scope = 'wf', base = 0, corner = null;

 const add = (name, type, props, fixed, d = 0, layer) => {
  const item = { key: `${scope}:${name}`, type, order: base + d, props, fixed: { ...fixed, tone } };
  if (layer) item.layer = layer;
  items.push(item);
  return item;
 };
 const lines = (str, style, maxW, cap = 0) => {
  let out = wrap(String(str), Math.max(40, maxW), style[0], style[1]);
  if (cap && out.length > cap) { out = out.slice(0, cap); out[cap - 1] = truncate(`${out[cap - 1]}…`, maxW, style[0], style[1]); }
  return out;
 };
 const tall = (str, style, maxW, cap) => str ? lines(str, style, maxW, cap).length * style[2] : 0;
 const text = (name, str, style, cls, x, top, maxW, { anchor = 'start', cap = 0, d = 0 } = {}) => {
  if (!str) return 0;
  const ls = lines(str, style, maxW, cap), h = ls.length * style[2];
  add(name, 'label', { x, y: top + h / 2 }, { lines: ls, cls, anchor, lineHeight: style[2], size: style[0], weight: style[1] }, d);
  return h;
 };
 const box = (name, x, y, w, h, cls, rx = 12, d = 0, layer = 'edges') => add(name, 'wbox', { x, y, w, h }, { cls, rx }, d, layer);
 const glyph = (name, icon, x, y, s, cls = '', d = 0) => add(name, 'wglyph', { x, y, s }, { icon, cls }, d, 'labels');
 const skel = (name, x, y, w, h = 9, d = 0, cls = '') => box(name, x, y, w, h, `dg-wf-skel${cls}`, h / 2, d, 'nodes');
 const rule = (name, x1, y, x2, d = 0) => add(name, 'line', { x1, y1: y, x2, y2: y }, { cls: 'dg-wf-rule' }, d, 'edges');
 const shift = (from, dy, to = items.length) => {
  for (let i = from; i < to; i++) {
   const p = items[i].props;
   if ('y' in p) p.y += dy;
   if ('y1' in p) { p.y1 += dy; p.y2 += dy; }
  }
 };
 const btnW = label => label ? Math.ceil(textWidth(label, WT.btn[0], WT.btn[1])) + 40 : 112;
 const button = (name, label, x, y, w, primary, h = WF.btn, d = 0.2) => {
  box(name, x, y, w, h, `dg-wf-btn${primary ? ' is-primary' : ''}`, h / 2, d, 'nodes');
  if (label) add(`${name}t`, 'label', { x: x + w / 2, y: y + h / 2 }, { lines: [truncate(label, w - 24, WT.btn[0], WT.btn[1])], cls: primary ? 'dg-wf-on' : 'dg-wf-strong', anchor: 'middle', lineHeight: WT.btn[2], size: WT.btn[0], weight: WT.btn[1] }, d + 0.02);
  else skel(`${name}s`, x + w / 2 - 28, y + h / 2 - 4, 56, 8, d + 0.02, primary ? ' is-on' : '');
 };
 const buttons = (name, labels, x, top, maxW, align, d = 0.2) => {
  if (!labels.length) return 0;
  const ws = labels.map(btnW), total = ws.reduce((a, b) => a + b, 0) + 10 * (ws.length - 1);
  if (total <= maxW) {
   let bx = align === 'middle' ? x - total / 2 : x;
   labels.forEach((label, i) => { button(`${name}${i}`, label, bx, top, ws[i], i === 0, WF.btn, d + i * 0.03); bx += ws[i] + 10; });
   return WF.btn;
  }
  const w = Math.min(maxW, 360), left = align === 'middle' ? x - w / 2 : x;
  labels.forEach((label, i) => button(`${name}${i}`, label, left, top + i * (WF.btn + 10), w, i === 0, WF.btn, d + i * 0.03));
  return labels.length * (WF.btn + 10) - 10;
 };
 const pill = (name, label, x, y, align) => {
  const w = Math.ceil(textWidth(label, WT.tag[0], WT.tag[1])) + 22, left = align === 'middle' ? x - w / 2 : x;
  box(name, left, y, w, 24, 'dg-wf-pill', 12, 0, 'nodes');
  add(`${name}t`, 'label', { x: left + w / 2, y: y + 12 }, { lines: [label], cls: 'dg-wf-pill-text', anchor: 'middle', lineHeight: 14, size: WT.tag[0], weight: WT.tag[1] }, 0.02);
  return 24;
 };
 const media = (name, x, y, w, h, kind = 'image', d = 0.15) => {
  box(name, x, y, w, h, 'dg-wf-media', Math.min(14, h / 4), d);
  glyph(`${name}g`, kind === 'video' ? 'play' : kind === 'map' ? 'pin' : 'image', x + w / 2, y + h / 2, Math.min(34, h * 0.35), 'is-media', d + 0.05);
 };
 const header = (s, y, align = 'middle', maxW = Math.min(cw, 640), x = align === 'middle' ? cx : x0) => {
  const start = y;
  if (s.badge) y += pill('badge', s.badge, x, y, align) + 16;
  const h = text('h', s.heading, wide ? WT.h2 : WT.h2s, 'dg-wf-strong', x, y, maxW, { anchor: align });
  y += h;
  const sub = s.text.join(' ');
  if (sub) { if (h) y += 10; y += text('t', sub, WT.sub, 'dg-wf-text', x, y, maxW, { anchor: align, d: 0.05 }); }
  return y > start ? y + (wide ? 32 : 24) : y;
 };
 const colsFor = min => Math.max(1, Math.min(4, Math.floor((cw + WF.gap) / (min + WF.gap))));
 const grid = (name, list, y, maxCols, card) => {
  const n = list.length;
  if (!n) return y;
  const rows = Math.ceil(n / Math.min(maxCols, n)), per = Math.ceil(n / rows), w = (cw - WF.gap * (per - 1)) / per;
  for (let r = 0; r < rows; r++) {
   const row = list.slice(r * per, r * per + per), h = Math.max(...row.map(item => card.measure(item, w)));
   let x = cx - (row.length * w + WF.gap * (row.length - 1)) / 2;
   row.forEach((item, k) => { card.draw(`${name}${r * per + k}`, item, x, y, w, h, r * per + k); x += w + WF.gap; });
   y += h + (r < rows - 1 ? WF.gap : 0);
  }
  return y;
 };
 const blank = n => Array.from({ length: n }, () => ({ title: '', desc: '' }));
 const titleOrSkel = (key, str, style, cls, x, y, w, opts = {}) => {
  if (str) return text(key, str, style, cls, x, y, w, opts);
  skel(key, opts.anchor === 'middle' ? x - w * 0.3 : x, y + 5, w * 0.6, 10, opts.d);
  return 20;
 };

 const cards = {
  feature: {
   measure: (item, w) => 20 + 36 + 16 + (item.title ? tall(item.title, WT.title, w - 40) : 20) + (item.desc ? 6 + tall(item.desc, WT.body, w - 40) : item.title ? 0 : 22) + 24,
   draw(key, item, x, y, w, h, i) {
    const d = 0.08 + i * 0.04;
    box(`${key}c`, x, y, w, h, 'dg-wf-card', 16, d);
    box(`${key}i`, x + 20, y + 20, 36, 36, 'dg-wf-icon', 10, d + 0.02, 'nodes');
    glyph(`${key}g`, WF_ICONS[i % WF_ICONS.length], x + 38, y + 38, 18, 'is-icon', d + 0.03);
    let ty = y + 72;
    ty += titleOrSkel(`${key}t`, item.title, WT.title, 'dg-wf-strong', x + 20, ty, w - 40, { d: d + 0.03 });
    if (item.desc) text(`${key}d`, item.desc, WT.body, 'dg-wf-text', x + 20, ty + 6, w - 40, { d: d + 0.05 });
    else if (!item.title) skel(`${key}d`, x + 20, ty + 8, (w - 40) * 0.85, 8, d + 0.05);
   },
  },
  image: {
   measure: (item, w) => 8 + Math.round((w - 16) * 0.6) + 16 + (item.title ? tall(item.title, WT.title, w - 32) : 20) + (item.desc ? 6 + tall(item.desc, WT.body, w - 32) : 0) + 20,
   draw(key, item, x, y, w, h, i) {
    const d = 0.08 + i * 0.04, mh = Math.round((w - 16) * 0.6);
    box(`${key}c`, x, y, w, h, 'dg-wf-card', 16, d);
    media(`${key}m`, x + 8, y + 8, w - 16, mh, 'image', d + 0.02);
    let ty = y + 8 + mh + 16;
    ty += titleOrSkel(`${key}t`, item.title, WT.title, 'dg-wf-strong', x + 16, ty, w - 32, { d: d + 0.03 });
    if (item.desc) text(`${key}d`, item.desc, WT.body, 'dg-wf-text', x + 16, ty + 6, w - 32, { d: d + 0.05 });
   },
  },
  review: {
   split(item) {
    const quote = item.desc || item.title, who = item.desc ? item.title : '';
    const at = who.indexOf(',');
    return { quote, name: at > 0 ? who.slice(0, at).trim() : who, role: at > 0 ? who.slice(at + 1).trim() : '' };
   },
   measure(item, w) { const r = this.split(item); return 20 + 30 + (r.quote ? tall(r.quote, WT.quote, w - 40) : 40) + 20 + 34 + 20; },
   draw(key, item, x, y, w, h, i) {
    const d = 0.08 + i * 0.05, r = this.split(item);
    box(`${key}c`, x, y, w, h, 'dg-wf-card', 16, d);
    add(`${key}q`, 'label', { x: x + 18, y: y + 40 }, { lines: ['“'], cls: 'dg-wf-quote', anchor: 'start', lineHeight: 40, size: 48, weight: 700 }, d + 0.02);
    if (r.quote) text(`${key}t`, r.quote, WT.quote, 'dg-wf-strong is-soft', x + 20, y + 50, w - 40, { d: d + 0.03 });
    else { skel(`${key}t`, x + 20, y + 56, w - 60, 8, d + 0.03); skel(`${key}u`, x + 20, y + 72, (w - 60) * 0.7, 8, d + 0.04); }
    const ay = y + h - 20 - 17;
    add(`${key}a`, 'dot', { x: x + 37, y: ay, r: 17 }, { cls: 'dg-wf-avatar' }, d + 0.05, 'nodes');
    if (r.name) text(`${key}n`, r.name, [13, 700, 17], 'dg-wf-strong', x + 62, ay - (r.role ? 17 : 8.5), w - 82, { cap: 1, d: d + 0.06 });
    else skel(`${key}n`, x + 62, ay - 4, 90, 8, d + 0.06);
    if (r.role) text(`${key}r`, r.role, WT.small, 'dg-wf-muted', x + 62, ay + 1, w - 82, { cap: 1, d: d + 0.07 });
   },
  },
  plan: {
   split(item) {
    const featured = /(\*|★)\s*$|\((popular|популяр|хит|best|рекоменд)[^)]*\)\s*$/i.test(item.title);
    const name = item.title.replace(/\s*(\*+|★)\s*$|\s*\((popular|популяр|хит|best|рекоменд)[^)]*\)\s*$/i, '').trim();
    const parts = item.desc.split(/\s*[·|;]\s*|,\s+/).map(part => part.trim()).filter(Boolean);
    return { featured, name, price: parts[0] || '', features: parts.slice(1) };
   },
   measure(item, w) {
    const p = this.split(item);
    return 24 + 20 + 8 + WT.price[2] + 20 + p.features.reduce((sum, t) => sum + tall(t, WT.body, w - 72) + 8, 0) + 16 + WF.btn + 24;
   },
   draw(key, item, x, y, w, h, i, s) {
    const d = 0.08 + i * 0.05, p = this.split(item);
    box(`${key}c`, x, y, w, h, `dg-wf-card${p.featured ? ' is-featured' : ''}`, 18, d);
    let ty = y + 24;
    ty += titleOrSkel(`${key}n`, p.name, WT.title, 'dg-wf-text', x + 24, ty, w - 48, { cap: 1, d: d + 0.02 }) + 8;
    ty += p.price ? text(`${key}p`, p.price, WT.price, 'dg-wf-strong', x + 24, ty, w - 48, { cap: 1, d: d + 0.03 }) : (skel(`${key}p`, x + 24, ty + 6, 90, 18, d + 0.03), WT.price[2]);
    ty += 20;
    p.features.forEach((feature, k) => {
     glyph(`${key}k${k}`, 'check', x + 32, ty + WT.body[2] / 2, 15, 'is-check', d + 0.04 + k * 0.02);
     ty += text(`${key}f${k}`, feature, WT.body, 'dg-wf-text', x + 48, ty, w - 72, { d: d + 0.04 + k * 0.02 }) + 8;
    });
    button(`${key}b`, s.buttons[p.featured ? 0 : s.buttons.length - 1] || '', x + 24, y + h - 24 - WF.btn, w - 48, p.featured, WF.btn, d + 0.08);
   },
  },
 };

 const lay = {
  nav(s, y) {
   const h = wide ? 64 : 56, mid = y + h / 2, brand = s.heading;
   box('mark', x0, mid - 11, 22, 22, 'dg-wf-mark', 7, 0, 'nodes');
   let left = x0 + 32, right = x0 + cw;
   if (brand) {
    const bw = Math.min(Math.ceil(textWidth(brand, WT.brand[0], WT.brand[1])), cw * 0.42);
    text('b', brand, WT.brand, 'dg-wf-strong', left, mid - WT.brand[2] / 2, bw + 1, { cap: 1 });
    left += bw;
   } else { skel('b', left, mid - 5, 70, 10); left += 70; }
   left += 28;
   const links = s.items.map(item => item.title).filter(Boolean);
   if (!wide && links.length) { glyph('menu', 'menu', right - 10, mid, 22, '', 0.1); right -= 36; }
   const navButtons = s.buttons.slice(0, wide ? 2 : 1), ws = navButtons.map(label => Math.ceil(textWidth(label, 12.5, 650)) + 30);
   const need = ws.reduce((sum, w) => sum + w + 8, 0);
   if (need && right - need >= left) {
    for (let i = navButtons.length - 1; i >= 0; i--) {
     right -= ws[i];
     const primary = i === navButtons.length - 1;
     box(`n${i}`, right, mid - 16, ws[i], 32, `dg-wf-btn${primary ? ' is-primary' : ''}`, 16, 0.12, 'nodes');
     add(`n${i}t`, 'label', { x: right + ws[i] / 2, y: mid }, { lines: [navButtons[i]], cls: primary ? 'dg-wf-on' : 'dg-wf-strong', anchor: 'middle', lineHeight: 16, size: 12.5, weight: 650 }, 0.14);
     right -= 8;
    }
    right -= 20;
   }
   if (wide && links.length) {
    const lw = links.map(t => Math.ceil(textWidth(t, WT.link[0], WT.link[1]))), gap = 26;
    let n = links.length;
    const span = k => lw.slice(0, k).reduce((sum, w) => sum + w, 0) + gap * (k - 1);
    while (n > 0 && span(n) > right - left) n--;
    let lx = clamp(cx - span(n) / 2, left, right - span(n));
    for (let i = 0; i < n; i++) { text(`l${i}`, links[i], WT.link, 'dg-wf-text', lx, mid - WT.link[2] / 2, lw[i] + 2, { cap: 1, d: 0.05 + i * 0.02 }); lx += lw[i] + gap; }
   }
   rule('rule', 0, y + h, W, 0.1);
   return y + h;
  },
  hero(s, y) {
   const top = y + (wide ? 64 : 40), split = !!s.media && cw >= 700, mark = items.length;
   const colW = split ? Math.floor(cw * 0.5) : Math.min(cw, 720), align = split ? 'start' : 'middle', ax = split ? x0 : cx;
   let ty = top;
   if (s.badge) ty += pill('badge', s.badge, ax, ty, align) + 18;
   if (s.heading) ty += text('h', s.heading, wide ? WT.h1 : WT.h1s, 'dg-wf-strong', ax, ty, colW, { anchor: align });
   else {
    skel('h', split ? ax : ax - colW * 0.4, ty + 4, colW * 0.8, 22);
    skel('h2', split ? ax : ax - colW * 0.28, ty + 36, colW * 0.56, 22, 0.02);
    ty += 60;
   }
   const lead = s.text.join(' ');
   if (lead) ty += 16 + text('t', lead, wide ? WT.lead : WT.leads, 'dg-wf-text', ax, ty + 16, split ? colW - 24 : Math.min(cw, 560), { anchor: align, d: 0.08 });
   if (s.buttons.length) ty += 28 + buttons('b', s.buttons, ax, ty + 28, colW, align, 0.16);
   const trust = s.items.map(item => item.desc ? `${item.title} ${item.desc}` : item.title).filter(Boolean).join('   ·   ');
   if (trust) ty += 18 + text('n', trust, WT.small, 'dg-wf-muted', ax, ty + 18, colW, { anchor: align, d: 0.22 });
   let bottom = ty;
   if (split) {
    const mw = Math.floor(cw * 0.45), mh = Math.round(mw * 0.76), block = ty - top;
    if (mh > block) shift(mark, (mh - block) / 2);
    media('m', x0 + cw - mw, top + Math.max(0, (block - mh) / 2), mw, mh, s.media);
    bottom = top + Math.max(mh, block);
   } else if (s.media) {
    const mh = Math.round(Math.min(cw * 0.5, 420));
    media('m', x0, ty + 40, cw, mh, s.media);
    bottom = ty + 40 + mh;
   }
   return bottom + (wide ? 64 : 40);
  },
  logos(s, y) {
   y += wide ? 40 : 28;
   if (s.heading) y += text('h', s.heading, WT.small, 'dg-wf-muted', cx, y, cw, { anchor: 'middle' }) + 22;
   const names = s.items.map(item => item.title).filter(Boolean);
   const count = names.length === 1 && /^\d+$/.test(names[0]) ? +names[0] : names.length ? 0 : parseInt(s.heading, 10) || 5;
   const entries = count ? Array.from({ length: clamp(count, 1, 12) }, () => '') : names.slice(0, 16);
   const size = entries.map(name => name ? Math.min(160, Math.ceil(textWidth(name, WT.logo[0], WT.logo[1]))) : 86);
   const gap = wide ? 44 : 26, rows = [];
   entries.forEach((_, i) => {
    const row = rows[rows.length - 1];
    if (row && row.w + gap + size[i] <= cw) { row.list.push(i); row.w += gap + size[i]; }
    else rows.push({ list: [i], w: size[i] });
   });
   rows.forEach((row, r) => {
    let x = cx - row.w / 2;
    for (const i of row.list) {
     if (entries[i]) text(`l${i}`, entries[i], WT.logo, 'dg-wf-logo', x, y + 5, size[i] + 2, { cap: 1, d: 0.05 + i * 0.02 });
     else skel(`l${i}`, x, y + 6, size[i], 16, 0.05 + i * 0.02);
     x += size[i] + gap;
    }
    y += 28 + (r < rows.length - 1 ? 14 : 0);
   });
   return y + (wide ? 40 : 28);
  },
  features: (s, y) => grid('c', s.items.length ? s.items : blank(3), header(s, y + pad), colsFor(200), cards.feature) + pad,
  cards: (s, y) => grid('c', s.items.length ? s.items : blank(3), header(s, y + pad), colsFor(220), cards.image) + pad,
  reviews: (s, y) => grid('c', s.items.length ? s.items : blank(3), header(s, y + pad), colsFor(250), cards.review) + pad,
  pricing(s, y) {
   const plan = { measure: (item, w) => cards.plan.measure(item, w), draw: (...args) => cards.plan.draw(...args, s) };
   return grid('c', s.items.length ? s.items : blank(3), header(s, y + pad), colsFor(220), plan) + pad;
  },
  gallery(s, y) {
   const named = s.items.filter(item => item.title && !/^\d+$/.test(item.title));
   const count = s.items.length === 1 && /^\d+$/.test(s.items[0].title) ? clamp(+s.items[0].title, 1, 12) : 6;
   const cell = {
    measure: (item, w) => Math.round(w * 0.72) + (item.title ? 10 + tall(item.title, WT.small, w) : 0),
    draw(key, item, x, y0, w, h, i) {
     media(`${key}m`, x, y0, w, Math.round(w * 0.72), 'image', 0.08 + i * 0.04);
     if (item.title) text(`${key}t`, item.title, WT.small, 'dg-wf-text', x + w / 2, y0 + Math.round(w * 0.72) + 10, w, { anchor: 'middle', d: 0.12 + i * 0.04 });
    },
   };
   return grid('g', named.length ? named : blank(count), header(s, y + pad), cw >= 700 ? 3 : 2, cell) + pad;
  },
  steps(s, y) {
   y = header(s, y + pad);
   const list = (s.items.length ? s.items : blank(3)).map((item, i) => {
    const m = /^(\d{1,2})[.)]?\s+(.+)$/.exec(item.title);
    return { n: m ? String(+m[1]) : String(i + 1), title: m ? m[2] : item.title, desc: item.desc };
   });
   const n = list.length, col = cw / n;
   const circle = (i, x, cy, d) => {
    add(`c${i}`, 'dot', { x, y: cy, r: 19 }, { cls: 'dg-wf-step' }, d, 'nodes');
    add(`n${i}`, 'label', { x, y: cy }, { lines: [list[i].n], cls: 'dg-wf-strong', anchor: 'middle', lineHeight: 16, size: 13.5, weight: 750 }, d + 0.02);
   };
   let bottom = y;
   if (col >= 140) {
    const cy = y + 19;
    list.forEach((step, i) => {
     const mx = x0 + col * (i + 0.5), d = 0.08 + i * 0.07;
     if (i < n - 1) add(`k${i}`, 'line', { x1: mx + 29, y1: cy, x2: mx + col - 29, y2: cy }, { cls: 'dg-wf-rule is-step', draw: true }, d + 0.05, 'edges');
     circle(i, mx, cy, d);
     let ty = cy + 35;
     ty += titleOrSkel(`t${i}`, step.title, WT.title, 'dg-wf-strong', mx, ty, col - 24, { anchor: 'middle', d: d + 0.03 });
     if (step.desc) ty += 6 + text(`d${i}`, step.desc, WT.body, 'dg-wf-text', mx, ty + 6, col - 24, { anchor: 'middle', d: d + 0.05 });
     bottom = Math.max(bottom, ty);
    });
    return bottom + pad;
   }
   let ty = y;
   list.forEach((step, i) => {
    const d = 0.08 + i * 0.07, cy = ty + 19;
    circle(i, x0 + 19, cy, d);
    let h = titleOrSkel(`t${i}`, step.title, WT.title, 'dg-wf-strong', x0 + 56, ty + 9, cw - 56, { d: d + 0.03 });
    if (step.desc) h += 4 + text(`d${i}`, step.desc, WT.body, 'dg-wf-text', x0 + 56, ty + 13 + h, cw - 56, { d: d + 0.05 });
    const block = Math.max(38, 9 + h);
    if (i < n - 1) add(`k${i}`, 'line', { x1: x0 + 19, y1: cy + 25, x2: x0 + 19, y2: ty + block + 22 - 6 }, { cls: 'dg-wf-rule is-step', draw: true }, d + 0.05, 'edges');
    ty += block + 22;
   });
   return ty - 22 + pad;
  },
  stats(s, y) {
   y = header(s, y + pad);
   const list = (s.items.length ? s.items : blank(3)).map(item => {
    if (item.desc) return { value: item.title, label: item.desc };
    const m = /^(\S*\d\S*)\s+(.+)$/.exec(item.title);
    return m ? { value: m[1], label: m[2] } : { value: item.title, label: '' };
   });
   const rows = Math.ceil(list.length / Math.min(list.length, wide ? 4 : 2)), per = Math.ceil(list.length / rows), col = cw / per;
   for (let r = 0; r < rows; r++) {
    const row = list.slice(r * per, r * per + per);
    let h = 0;
    row.forEach((stat, k) => {
     const i = r * per + k, mx = cx + (k - (row.length - 1) / 2) * col, d = 0.08 + i * 0.05;
     let ty = y;
     if (stat.value) ty += text(`v${i}`, stat.value, WT.value, 'dg-wf-strong', mx, ty, col - 16, { anchor: 'middle', cap: 1, d });
     else { skel(`v${i}`, mx - 36, ty + 6, 72, 22, d); ty += WT.value[2]; }
     if (stat.label) ty += 6 + text(`l${i}`, stat.label, WT.small, 'dg-wf-text', mx, ty + 6, col - 24, { anchor: 'middle', d: d + 0.03 });
     h = Math.max(h, ty - y);
    });
    y += h + (r < rows - 1 ? 28 : 0);
   }
   return y + pad;
  },
  faq(s, y) {
   y = header(s, y + pad);
   const w = Math.min(cw, 720), x = cx - w / 2;
   rule('r0', x, y, x + w, 0.05);
   (s.items.length ? s.items : blank(4)).forEach((item, i) => {
    let q = item.title, a = item.desc;
    const k = q.indexOf('?');
    if (!a && k > 0 && k < q.length - 1) { a = q.slice(k + 1).trim(); q = q.slice(0, k + 1); }
    const open = i === 0 && !!a, d = 0.08 + i * 0.05;
    let ty = y + 18;
    const qh = q ? text(`q${i}`, q, WT.q, 'dg-wf-strong', x + 4, ty, w - 56, { d }) : (skel(`q${i}`, x + 4, ty + 6, w * 0.5, 9, d), WT.q[2]);
    glyph(`g${i}`, open ? 'minus' : 'plus', x + w - 14, ty + WT.q[2] / 2, 17, '', d + 0.02);
    ty += qh;
    if (open) ty += 8 + text(`a${i}`, a, WT.body, 'dg-wf-text', x + 4, ty + 8, w - 56, { d: d + 0.03 });
    y = ty + 18;
    rule(`r${i + 1}`, x, y, x + w, d + 0.04);
   });
   return y + pad;
  },
  cta(s, y) {
   const top = y + (wide ? 40 : 24), inner = wide ? 52 : 32, maxW = Math.min(cw - inner * 2, 620);
   const bg = box('bg', x0, top, cw, 0, 'dg-wf-banner', 24, 0);
   let ty = top + inner;
   if (s.heading) ty += text('h', s.heading, wide ? WT.h2 : WT.h2s, 'dg-wf-strong', cx, ty, maxW, { anchor: 'middle', d: 0.04 });
   else { skel('h', cx - maxW * 0.3, ty + 4, maxW * 0.6, 18, 0.04); ty += 26; }
   const sub = s.text.join(' ');
   if (sub) ty += 10 + text('t', sub, WT.sub, 'dg-wf-text', cx, ty + 10, maxW, { anchor: 'middle', d: 0.08 });
   if (s.buttons.length) ty += 26 + buttons('b', s.buttons, cx, ty + 26, cw - inner * 2, 'middle', 0.14);
   bg.props.h = ty + inner - top;
   return ty + inner + (wide ? 40 : 24);
  },
  form(s, y) {
   y += pad;
   const side = cw >= 760 && !!(s.heading || s.text.length), mark = items.length;
   const fw = side ? Math.min(420, Math.floor(cw * 0.46)) : Math.min(cw, 440), fx = side ? x0 + cw - fw : cx - fw / 2;
   const head = side ? header(s, y, 'start', Math.floor(cw * 0.44), x0) - 32 : 0, headEnd = items.length;
   let ty = side ? y : header(s, y);
   (s.items.length ? s.items : blank(2)).forEach((field, i) => {
    const area = WF_AREA.test(field.title), h = area ? 92 : 46, d = 0.1 + i * 0.04;
    box(`f${i}`, fx, ty, fw, h, 'dg-wf-input', 12, d, 'nodes');
    if (field.title) text(`p${i}`, field.title, WT.body, 'dg-wf-muted', fx + 16, ty + (area ? 14 : (h - WT.body[2]) / 2), fw - 32, { cap: 1, d: d + 0.02 });
    else skel(`p${i}`, fx + 16, ty + h / 2 - 4, fw * 0.3, 8, d + 0.02);
    ty += h + 10;
   });
   button('b', s.buttons[0] || '', fx, ty + 4, fw, true, 46, 0.3);
   ty += 50;
   if (side) {
    const headH = head - y, formH = ty - y;
    if (headH < formH) shift(mark, (formH - headH) / 2, headEnd);
    ty = Math.max(ty, head);
   }
   return ty + pad;
  },
  section(s, y) {
   y += pad;
   const split = !!s.media && cw >= 700, mark = items.length;
   const bullets = (x, ty, w, d) => {
    s.items.forEach((item, k) => {
     const str = item.desc ? `${item.title}: ${item.desc}` : item.title;
     glyph(`k${k}`, 'check', x + 7, ty + WT.body[2] / 2, 15, 'is-check', d + k * 0.03);
     ty += text(`i${k}`, str, WT.body, 'dg-wf-text', x + 24, ty, w - 24, { d: d + k * 0.03 }) + 8;
    });
    return ty;
   };
   if (split) {
    const flip = s.n % 2 === 1, tw = Math.floor(cw * 0.48), mw = Math.floor(cw * 0.45);
    const tx = flip ? x0 + cw - tw : x0, mx = flip ? x0 : x0 + cw - mw;
    let ty = y;
    if (s.badge) ty += pill('badge', s.badge, tx, ty, 'start') + 16;
    ty += titleOrSkel('h', s.heading, WT.h2, 'dg-wf-strong', tx, ty, tw, { d: 0.02 });
    s.text.forEach((para, k) => { ty += 12 + text(`p${k}`, para, WT.sub, 'dg-wf-text', tx, ty + 12, tw, { d: 0.05 + k * 0.03 }); });
    if (s.items.length) ty = bullets(tx, ty + 18, tw, 0.1) - 8;
    if (s.buttons.length) ty += 26 + buttons('b', s.buttons, tx, ty + 26, tw, 'start', 0.18);
    const block = ty - y, mh = Math.round(mw * 0.74);
    if (mh > block) shift(mark, (mh - block) / 2);
    media('m', mx, y + Math.max(0, (block - mh) / 2), mw, mh, s.media);
    return y + Math.max(block, mh) + pad;
   }
   const w = Math.min(cw, 600), list = Math.min(w, 460);
   let ty = y;
   const gap = size => { if (ty > y) ty += size; };
   if (s.badge) ty += pill('badge', s.badge, cx, ty, 'middle') + 16;
   if (s.heading) ty += text('h', s.heading, wide ? WT.h2 : WT.h2s, 'dg-wf-strong', cx, ty, w, { anchor: 'middle' });
   s.text.forEach((para, k) => { gap(12); ty += text(`p${k}`, para, WT.sub, 'dg-wf-text', cx, ty, w, { anchor: 'middle', d: 0.05 + k * 0.03 }); });
   if (s.items.length) { gap(24); ty = bullets(cx - list / 2, ty, list, 0.1) - 8; }
   if (s.buttons.length) { gap(26); ty += buttons('b', s.buttons, cx, ty, cw, 'middle', 0.18); }
   if (s.media) { gap(32); const mh = Math.round(Math.min(cw * 0.46, 380)); media('m', x0, ty, cw, mh, s.media); ty += mh; }
   if (ty === y) { skel('h', cx - 120, ty + 4, 240, 16); skel('p', cx - 170, ty + 34, 340, 9, 0.03); ty += 48; }
   return ty + pad;
  },
  footer(s, y) {
   rule('r', 0, y, W);
   y += wide ? 36 : 28;
   const links = s.items.map(item => item.title).filter(Boolean);
   let left = y;
   left += s.heading ? text('b', s.heading, WT.title, 'dg-wf-strong', x0, left, wide ? cw * 0.35 : cw, { cap: 1 }) : 0;
   if (s.text.length) left += 6 + text('t', s.text.join(' '), WT.small, 'dg-wf-muted', x0, left + 6, wide ? cw * 0.4 : cw, { d: 0.05 });
   let right = wide ? y : left + (left > y ? 20 : 0);
   if (links.length) {
    const lw = links.map(t => Math.ceil(textWidth(t, WT.small[0], WT.small[1]))), gap = 24, maxW = wide ? cw * 0.55 : cw, rows = [];
    lw.forEach((w, i) => { const row = rows[rows.length - 1]; if (row && row.w + gap + w <= maxW) { row.list.push(i); row.w += gap + w; } else rows.push({ list: [i], w }); });
    rows.forEach(row => {
     let lx = wide ? x0 + cw - row.w : x0;
     for (const i of row.list) { text(`l${i}`, links[i], WT.small, 'dg-wf-text', lx, right, lw[i] + 2, { cap: 1, d: 0.05 + i * 0.02 }); lx += lw[i] + gap; }
     right += WT.small[2] + 10;
    });
    right -= 10;
   }
   if (!s.heading && !links.length && !s.text.length) { skel('b', x0, y + 4, 90, 10); left = y + 18; }
   return Math.max(left, right) + (wide ? 36 : 28);
  },
 };

 let y = phone ? WF.status : WF.bar;
 page.sections.forEach((s, i) => {
  scope = s.key;
  base = 0.3 + i * 0.5;
  const top = y, mark = items.length;
  y = (lay[s.type] || lay.section)(s, y);
  const band = add('band', 'wbox', { x: 4, y: top + 2, w: W - 8, h: Math.max(8, y - top - 4) }, { cls: 'dg-wf-band', rx: 10 }, -0.02, 'back');
  const label = I18n.t(`wf.${s.type}`), lw = Math.ceil(textWidth(label, 11, 700)) + 18;
  const tag = add('tag', 'label', { x: cx, y: top + 14 }, { lines: [label], pill: true, w: lw, h: 20, cls: 'dg-wf-sectag', anchor: 'middle', lineHeight: 14 }, 0, 'front');
  const hot = [band.key, tag.key];
  for (let k = mark; k < items.length; k++) tips.set(items[k].key, { silent: true, hot });
 });

 scope = 'wf';
 base = 0;
 const H = Math.round(y + (phone ? WF.home : 0));
 box('window', 0, 0, W, H, `dg-wf-window${phone ? ' is-phone' : ''}`, phone ? WF.phoneRadius : WF.radius, -0.2, 'back');
 items.unshift(items.pop());
 if (phone) {
  add('time', 'label', { x: 34, y: WF.status / 2 }, { lines: ['9:41'], cls: 'dg-wf-strong', anchor: 'start', lineHeight: 16, size: 13.5, weight: 700 }, -0.1);
  box('island', cx - 52, 10, 104, 28, 'dg-wf-island', 14, -0.1, 'nodes');
  box('battery', W - 52, WF.status / 2 - 6, 24, 12, 'dg-wf-battery', 4, -0.1, 'nodes');
  box('charge', W - 50, WF.status / 2 - 4, 16, 8, 'dg-wf-charge', 2, -0.1, 'nodes');
  box('home', cx - 62, H - 14, 124, 5, 'dg-wf-home', 2.5, -0.1, 'nodes');
 } else {
  for (let i = 0; i < 3; i++) add(`light${i}`, 'dot', { x: 20 + i * 17, y: WF.bar / 2, r: 5.5 }, { cls: 'dg-wf-light' }, -0.12 + i * 0.02, 'nodes');
  const aw = Math.round(Math.min(340, Math.max(150, W * 0.36))), url = page.title || page.sections.find(s => s.type === 'nav')?.heading || '';
  box('address', cx - aw / 2, WF.bar / 2 - 13, aw, 26, 'dg-wf-address', 9, -0.1, 'nodes');
  if (url) {
   const shown = truncate(url, aw - 48, 12, 600), tw = textWidth(shown, 12, 600);
   glyph('lock', 'lock', cx - tw / 2 - 5, WF.bar / 2, 13, 'is-lock', -0.06);
   add('url', 'label', { x: cx + 5, y: WF.bar / 2 }, { lines: [shown], cls: 'dg-wf-muted', anchor: 'middle', lineHeight: 14, size: 12, weight: 600 }, -0.06);
  } else skel('url', cx - 50, WF.bar / 2 - 4, 100, 8, -0.06);
  rule('bar', 0, WF.bar, W, -0.1);
  corner = { x: cx + aw / 2 + 12, h: WF.bar, inset: 7 };
 }
 return { kind: 'wireframe', width: W, height: H, items, tips, corner, mobile: phone };
}

function clean(source) {
 return source.replace(/%%\{[\s\S]*?\}%%/g, '').split('\n').map(line => line.replace(/%%.*$/, '').replace(/\s+$/, '')).filter(line => line.trim());
}

const KINDS = [
 [/^(graph|flowchart)\b/i, (lines, tones, options) => flowScene(parseFlow(lines), tones, options, 'flow')],
 [/^stateDiagram(-v2)?\b/i, (lines, tones, options) => flowScene(parseState(lines), tones, options, 'state')],
 [/^sequenceDiagram\b/i, (lines, tones, options) => sequenceScene(parseSequence(lines), tones, options)],
 [/^pie\b/i, (lines, tones, options) => pieScene(parsePie(lines), tones, options)],
 [/^xychart(-beta)?\b/i, (lines, tones, options) => chartScene(parseXY(lines), tones, options)],
 [/^(candlestick|candles|ohlc)\b/i, (lines, tones, options) => candleScene(parseCandles(lines), tones, options)],
 [/^timeline\b/i, (lines, tones, options) => timelineScene(parseTimeline(lines), tones, options)],
 [/^gantt\b/i, (lines, tones, options) => ganttScene(parseGantt(lines), tones, options)],
 [/^mindmap\b/i, (lines, tones, options) => mindScene(parseMindmap(lines), tones, options)],
 [/^quadrantChart\b/i, (lines, tones, options) => quadrantScene(parseQuadrant(lines), tones, options)],
 [/^radar(-beta)?\b/i, (lines, tones, options) => radarScene(parseRadar(lines), tones, options)],
 [/^erDiagram\b/i, (lines, tones, options) => flowScene(parseER(lines), tones, options, 'er')],
 [/^classDiagram(-v2)?\b/i, (lines, tones, options) => flowScene(parseClass(lines), tones, options, 'class')],
 [/^(wireframe|mockup)\b/i, (lines, tones, options) => wireframeScene(parseWireframe(lines), tones, options)],
];

function withHeader(source, kind) {
 const first = (clean(source)[0] || '').trim();
 return kind && !KINDS.some(([test]) => test.test(first)) ? `${kind}\n${source}` : source;
}

function compile(source, tones, options) {
 let lines = clean(source);
 if (!lines.length) return null;
 if (options.kind && !KINDS.some(([test]) => test.test(lines[0].trim()))) lines = [options.kind, ...lines];
 const head = lines[0].trim(), kind = KINDS.find(([test]) => test.test(head));
 return kind ? kind[1](lines, tones, options) : null;
}

function safeCompile(source, tones, options) {
 try { return compile(source, tones, options); }
 catch (error) { console.warn('Diagram failed', error); return null; }
}

/* Item types */

function buildCard(item) {
 const card = item.spec.fixed.card, body = item.body, x = -card.w / 2, y = -card.h / 2, r = 12;
 item.parts.main = svg('rect', { class: 'dg-shape' }, body);
 if (card.rows.length) {
  svg('path', { class: 'dg-card-head', d: `M${f(x)},${f(y + card.head)} V${f(y + r)} Q${f(x)},${f(y)} ${f(x + r)},${f(y)} H${f(-x - r)} Q${f(-x)},${f(y)} ${f(-x)},${f(y + r)} V${f(y + card.head)} Z` }, body);
  svg('line', { class: 'dg-card-rule', x1: f(x), x2: f(-x), y1: f(y + card.head), y2: f(y + card.head) }, body);
 }
 const titleY = card.rows.length ? y + card.head / 2 : 0;
 if (card.sub) textBlock(body, [card.sub], { cls: 'dg-card-sub' }).setAttribute('transform', `translate(0 ${f(titleY - 9)})`);
 textBlock(body, [card.title], { cls: 'dg-card-title' }).setAttribute('transform', `translate(0 ${f(card.sub ? titleY + 8 : titleY)})`);
 let rowY = y + card.head + 5;
 card.rows.forEach((row, i) => {
  if (i === card.sep) {
   svg('line', { class: 'dg-card-rule is-soft', x1: f(x + 10), x2: f(-x - 10), y1: f(rowY + 4.5), y2: f(rowY + 4.5) }, body);
   rowY += 9;
  }
  const cy = rowY + CARD.row / 2, left = x + CARD.padX;
  if (row.lead) textBlock(body, [row.lead], { cls: row.badge ? 'dg-card-badge' : 'dg-card-lead', anchor: 'start', x: f(left) }).setAttribute('transform', `translate(0 ${f(cy)})`);
  textBlock(body, [row.text], { cls: 'dg-card-text', anchor: 'start', x: f(left + card.leadW) }).setAttribute('transform', `translate(0 ${f(cy)})`);
  if (row.meta) textBlock(body, [row.meta], { cls: 'dg-card-meta', anchor: 'end', x: f(-x - CARD.padX) }).setAttribute('transform', `translate(0 ${f(cy)})`);
  rowY += CARD.row;
 });
}

function buildShape(item) {
 const { shape, lines } = item.spec.fixed, body = item.body;
 body.replaceChildren();
 item.parts = {};
 if (shape === 'card') { buildCard(item); return; }
 if (shape === 'start') item.parts.dot = svg('circle', { r: 8, class: 'dg-dot' }, body);
 else if (shape === 'end') { svg('circle', { r: 9, class: 'dg-ring' }, body); svg('circle', { r: 5, class: 'dg-dot' }, body); }
 else if (shape === 'circle') item.parts.main = svg('circle', { class: 'dg-shape' }, body);
 else item.parts.main = svg(PATH_SHAPES.has(shape) ? 'path' : 'rect', { class: 'dg-shape' }, body);
 if (shape === 'cylinder' || shape === 'subroutine') item.parts.line = svg('path', { class: 'dg-shape-line' }, body);
 if (lines && lines.length) textBlock(body, lines, { cls: 'dg-label', lineHeight: TEXT.line });
}

function shapePath(shape, w, h) {
 const x = -w / 2, y = -h / 2;
 switch (shape) {
  case 'diamond': return `M0,${f(y)} L${f(-x)},0 L0,${f(-y)} L${f(x)},0 Z`;
  case 'hexagon': { const e = h * 0.3; return `M${f(x + e)},${f(y)} H${f(-x - e)} L${f(-x)},0 L${f(-x - e)},${f(-y)} H${f(x + e)} L${f(x)},0 Z`; }
  case 'lean': return `M${f(x + 12)},${f(y)} H${f(-x)} L${f(-x - 12)},${f(-y)} H${f(x)} Z`;
  case 'flag': return `M${f(x)},${f(y)} H${f(-x)} V${f(-y)} H${f(x)} L${f(x + 10)},0 Z`;
  case 'cylinder': return `M${f(x)},${f(y + 6)} A${f(w / 2)},6 0 0 1 ${f(-x)},${f(y + 6)} V${f(-y - 6)} A${f(w / 2)},6 0 0 1 ${f(x)},${f(-y - 6)} Z`;
 }
 return '';
}

function sizeShape(item, w, h) {
 const { shape } = item.spec.fixed, { main, line } = item.parts;
 if (!main) return;
 if (shape === 'circle') main.setAttribute('r', f(w / 2));
 else if (PATH_SHAPES.has(shape)) main.setAttribute('d', shapePath(shape, w, h));
 else {
  const radius = shape === 'stadium' ? h / 2 : shape === 'round' ? Math.min(16, h / 2) : shape === 'actor' ? 11 : shape === 'card' ? 12 : NODE.radius;
  setAttrs(main, { x: f(-w / 2), y: f(-h / 2), width: f(w), height: f(h), rx: f(radius) });
 }
 if (line) {
  line.setAttribute('d', shape === 'cylinder'
   ? `M${f(-w / 2)},${f(-h / 2 + 6)} A${f(w / 2)},6 0 0 0 ${f(w / 2)},${f(-h / 2 + 6)}`
   : `M${f(-w / 2 + 7)},${f(-h / 2)} V${f(h / 2)} M${f(w / 2 - 7)},${f(-h / 2)} V${f(h / 2)}`);
 }
}

const growEase = t => backOut(t, 1.1);

function barPath(x, top, w, base, radius = 6) {
 const h = Math.abs(base - top);
 if (h < 0.3) return `M${f(x)},${f(base)} h${f(w)}`;
 const r = Math.min(radius, w / 2, h), s = top < base ? 1 : -1;
 return `M${f(x)},${f(base)} V${f(top + s * r)} Q${f(x)},${f(top)} ${f(x + r)},${f(top)} H${f(x + w - r)} Q${f(x + w)},${f(top)} ${f(x + w)},${f(top + s * r)} V${f(base)} Z`;
}

const toneClass = tone => tone ? ` t-${tone}` : '';

const TYPES = {
 view: {
  create: () => null,
  enter: () => 0,
  apply(item, a, scene) { scene.hooks.view(item.cur); },
 },
 node: {
  create(item, scene) {
   item.g = svg('g', {}, scene.layer('nodes'));
   item.g.dataset.key = item.key;
   item.body = svg('g', { class: 'dg-body' }, item.g);
   this.refresh(item);
   return item.g;
  },
  refresh(item, old) {
   const fx = item.spec.fixed;
   item.g.setAttribute('class', `dg-node${fx.key ? ' is-key' : ''}${fx.card ? ' is-card' : ''}${fx.cls ? ` ${fx.cls}` : ''}${toneClass(fx.tone)}`);
   if (!old || old.shape !== fx.shape || String(old.lines) !== String(fx.lines) || old.cardKey !== fx.cardKey) buildShape(item);
  },
  enter: () => ENTER.node,
  apply(item, a) {
   const { x, y, w, h } = item.cur;
   item.g.setAttribute('transform', `translate(${f(x)} ${f(y)})`);
   sizeShape(item, w, h);
   pop(item.body, a);
  },
 },
 edge: {
  create(item, scene) {
   item.g = svg('g', {}, scene.layer(item.spec.layer || 'edges'));
   item.path = svg('path', {}, item.g);
   item.heads = [];
   this.refresh(item);
   return item.g;
  },
  refresh(item) {
   const fx = item.spec.fixed, ends = endsOf(fx), sig = `${ends.start}|${ends.end}`;
   item.g.setAttribute('class', `dg-edge is-${fx.style}${fx.cls ? ` ${fx.cls}` : ''}${toneClass(fx.tone)}`);
   if (item.headSig !== sig) {
    item.headSig = sig;
    for (const head of item.heads) head.el.remove();
    item.heads = [['end', ends.end], ['start', ends.start]].filter(([, kind]) => kind)
     .map(([at, kind]) => ({ at, kind, el: svg('path', { class: HEAD_CLASS[kind] || 'dg-mark' }, item.g) }));
   }
   item.d = '';
  },
  enter(item) {
   const fx = item.spec.fixed;
   return fx.draw || clamp(roughLength(item.cur.pts) / ENTER.speed, ENTER.drawMin, ENTER.drawMax);
  },
  apply(item, a) {
   const fx = item.spec.fixed, pts = item.cur.pts;
   const d = pathOf(pts);
   if (d !== item.d) { item.path.setAttribute('d', d); item.d = d; item.len = 0; }
   for (const head of item.heads) head.el.setAttribute('d', headPath(head.kind, pts, head.at === 'start'));
   if (a >= 1) {
    if (item.drawn !== 1) {
     item.path.style.strokeDasharray = '';
     item.g.style.opacity = '';
     item.g.removeAttribute('transform');
     for (const head of item.heads) head.el.style.opacity = '';
     item.drawn = 1;
    }
    return;
   }
   item.drawn = a;
   const p = easeInOut(a);
   if (fx.grow) item.g.setAttribute('transform', `translate(${f(pts[0])} 0) scale(${p.toFixed(3)} 1) translate(${f(-pts[0])} 0)`);
   else if (fx.style === 'solid' || fx.style === 'thick') {
    item.len ||= item.path.getTotalLength();
    item.path.style.strokeDasharray = `${f(item.len * p)} ${f(item.len + 1)}`;
   } else item.g.style.opacity = p.toFixed(3);
   const shown = clamp01((p - 0.82) / 0.18).toFixed(3);
   for (const head of item.heads) head.el.style.opacity = shown;
  },
 },
 label: {
  create(item, scene) {
   item.g = svg('g', {}, scene.layer(item.spec.layer || 'labels'));
   item.body = svg('g', { class: 'dg-body' }, item.g);
   this.refresh(item);
   return item.g;
  },
  refresh(item) {
   const fx = item.spec.fixed;
   item.g.setAttribute('class', `${fx.cls || 'dg-text'}${toneClass(fx.tone)}`);
   if (fx.size) { item.g.style.fontSize = `${fx.size}px`; item.g.style.fontWeight = fx.weight; }
   item.body.replaceChildren();
   if (fx.pill) svg('rect', { x: f(-fx.w / 2), y: f(-fx.h / 2), width: f(fx.w), height: f(fx.h), rx: 8 }, item.body);
   textBlock(item.body, fx.lines, { anchor: fx.anchor || 'middle', baseline: fx.baseline || 'central', lineHeight: fx.lineHeight || 16 });
  },
  enter: () => ENTER.label,
  apply(item, a) {
   const fx = item.spec.fixed;
   item.g.setAttribute('transform', `translate(${f(item.cur.x)} ${f(item.cur.y)})${fx.rotate ? ` rotate(${fx.rotate})` : ''}`);
   if (fx.pop) pop(item.body, a, 3);
   else fade(item.body, a, 4);
  },
 },
 line: {
  create(item, scene) {
   item.el = svg('line', {}, scene.layer(item.spec.layer || 'back'));
   this.refresh(item);
   return item.el;
  },
  refresh(item) {
   const fx = item.spec.fixed;
   item.el.setAttribute('class', `${fx.cls || ''}${toneClass(fx.tone)}`);
  },
  enter: item => item.spec.fixed.draw ? ENTER.line : ENTER.fade,
  apply(item, a) {
   const { x1, y1, x2, y2 } = item.cur, draw = item.spec.fixed.draw, p = a >= 1 ? 1 : easeOut(a);
   setAttrs(item.el, { x1: f(x1), y1: f(y1), x2: f(draw ? x1 + (x2 - x1) * p : x2), y2: f(draw ? y1 + (y2 - y1) * p : y2) });
   item.el.style.opacity = draw || a >= 1 ? '' : p.toFixed(3);
  },
 },
 bar: {
  create(item, scene) {
   const fx = item.spec.fixed;
   item.grad = svg('linearGradient', { id: scene.uid(), x1: 0, y1: 0, x2: 0, y2: 1 }, scene.defs);
   item.extra.push(item.grad);
   item.stops = [svg('stop', { offset: 0 }, item.grad), svg('stop', { offset: 1 }, item.grad)];
   item.el = svg('path', { class: 'dg-bar', fill: `url(#${item.grad.id})` }, scene.layer('nodes'));
   this.refresh(item);
   return item.el;
  },
  refresh(item) {
   const tone = item.spec.fixed.tone;
   item.stops[0].setAttribute('class', `dg-stop t-${tone}`);
   item.stops[1].setAttribute('class', `dg-stop is-faint t-${tone}`);
  },
  enter: () => ENTER.grow,
  apply(item, a) {
   const { x, top, w, base } = item.cur, g = a >= 1 ? 1 : growEase(a);
   item.el.setAttribute('d', barPath(x, base + (top - base) * g, w, base));
  },
 },
 area: {
  create(item, scene) {
   item.grad = svg('linearGradient', { id: scene.uid(), x1: 0, y1: 0, x2: 0, y2: 1 }, scene.defs);
   item.extra.push(item.grad);
   item.stops = [svg('stop', { offset: 0 }, item.grad), svg('stop', { offset: 1 }, item.grad)];
   item.el = svg('path', { class: 'dg-area', fill: `url(#${item.grad.id})` }, scene.layer(item.spec.layer || 'back'));
   this.refresh(item);
   return item.el;
  },
  refresh(item) {
   const tone = item.spec.fixed.tone;
   item.stops[0].setAttribute('class', `dg-stop is-area t-${tone}`);
   item.stops[1].setAttribute('class', `dg-stop is-clear t-${tone}`);
  },
  enter: () => ENTER.line,
  apply(item, a) {
   const { pts, base } = item.cur, n = pts.length;
   item.el.setAttribute('d', `${pathOf(pts)} L${f(pts[n - 2])},${f(base)} L${f(pts[0])},${f(base)} Z`);
   item.el.style.opacity = a >= 1 ? '' : easeOut(a).toFixed(3);
  },
 },
 arc: {
  create(item, scene) {
   const fx = item.spec.fixed;
   item.el = svg('circle', { cx: f(fx.cx), cy: f(fx.cy), r: fx.r, pathLength: 100, 'stroke-width': fx.width, transform: `rotate(-90 ${f(fx.cx)} ${f(fx.cy)})` }, scene.layer('nodes'));
   item.el.dataset.index = fx.index;
   this.refresh(item);
   return item.el;
  },
  refresh(item) {
   const fx = item.spec.fixed;
   item.el.setAttribute('class', `dg-slice t-${fx.tone}${fx.active ? ' is-active' : ''}`);
   setAttrs(item.el, { cx: f(fx.cx), cy: f(fx.cy), transform: `rotate(-90 ${f(fx.cx)} ${f(fx.cy)})` });
  },
  enter: item => Math.max(120, item.spec.props.sweep / 100 * ENTER.arc),
  apply(item, a) {
   const { start, sweep } = item.cur, gap = item.spec.fixed.gap;
   const length = Math.max(0.001, sweep * (a >= 1 ? 1 : a) - gap);
   item.el.setAttribute('stroke-dasharray', `${length.toFixed(3)} 100`);
   item.el.setAttribute('stroke-dashoffset', (-start).toFixed(3));
  },
 },
 legend: {
  create(item, scene) {
   item.g = svg('g', {}, scene.layer('labels'));
   item.g.dataset.index = item.spec.fixed.index;
   item.body = svg('g', { class: 'dg-body' }, item.g);
   item.bg = svg('rect', { class: 'dg-legend-bg', x: -10, y: -14, height: 28, rx: 9 }, item.body);
   svg('rect', { class: 'dg-swatch', x: 0, y: -5, width: PIE.swatch, height: PIE.swatch, rx: 3 }, item.body);
   item.label = svg('text', { class: 'dg-legend-label', x: PIE.swatch + 12, 'dominant-baseline': 'central' }, item.body);
   item.value = svg('text', { class: 'dg-legend-value', 'text-anchor': 'end', 'dominant-baseline': 'central' }, item.body);
   this.refresh(item);
   return item.g;
  },
  refresh(item) {
   const fx = item.spec.fixed;
   item.g.setAttribute('class', `dg-legend-row t-${fx.tone}${fx.active ? ' is-active' : ''}`);
   item.label.textContent = fx.label;
   item.value.textContent = fx.value;
   item.value.setAttribute('x', f(fx.w));
   item.bg.setAttribute('width', f(fx.w + 20));
  },
  enter: () => ENTER.label,
  apply(item, a) {
   item.g.setAttribute('transform', `translate(${f(item.cur.x)} ${f(item.cur.y)})`);
   fade(item.body, a, 0);
   if (a < 1) item.body.style.transform = `translateX(${((1 - easeOut(a)) * -8).toFixed(2)}px)`;
  },
 },
 dot: {
  create(item, scene) {
   item.el = svg('circle', {}, scene.layer(item.spec.layer || 'labels'));
   this.refresh(item);
   return item.el;
  },
  refresh(item) {
   const fx = item.spec.fixed;
   item.el.setAttribute('class', `${fx.cls || ''}${toneClass(fx.tone)}`);
  },
  enter: () => ENTER.label,
  apply(item, a) {
   const { x, y, r } = item.cur;
   setAttrs(item.el, { cx: f(x), cy: f(y), r: (r * (a >= 1 ? 1 : Math.max(0, backOut(a)))).toFixed(2) });
  },
 },
 badge: {
  create(item, scene) {
   item.g = svg('g', {}, scene.layer('labels'));
   item.body = svg('g', { class: 'dg-body' }, item.g);
   svg('circle', { r: 8 }, item.body);
   item.text = svg('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central' }, item.body);
   this.refresh(item);
   return item.g;
  },
  refresh(item) {
   const fx = item.spec.fixed;
   item.g.setAttribute('class', `dg-badge t-${fx.tone}`);
   item.text.textContent = fx.n;
  },
  enter: () => ENTER.label,
  apply(item, a) {
   item.g.setAttribute('transform', `translate(${f(item.cur.x)} ${f(item.cur.y)})`);
   pop(item.body, a, 2);
  },
 },
 note: {
  create(item, scene) {
   item.g = svg('g', { class: 'dg-note' }, scene.layer('nodes'));
   item.rect = svg('rect', { rx: 9 }, item.g);
   item.holder = svg('g', {}, item.g);
   this.refresh(item);
   return item.g;
  },
  refresh(item) {
   item.holder.replaceChildren();
   textBlock(item.holder, item.spec.fixed.lines, { lineHeight: 16 });
  },
  enter: () => ENTER.fade,
  apply(item, a) {
   const { x, y, w, h } = item.cur;
   setAttrs(item.rect, { x: f(x), y: f(y), width: f(w), height: f(h) });
   item.holder.setAttribute('transform', `translate(${f(x + w / 2)} ${f(y + h / 2)})`);
   fade(item.g, a, 0);
  },
 },
 frame: {
  create(item, scene) {
   item.g = svg('g', { class: 'dg-frame' }, scene.layer('back'));
   item.rect = svg('rect', { rx: 10 }, item.g);
   item.tab = svg('path', { class: 'dg-frame-tab' }, item.g);
   item.text = svg('text', { class: 'dg-frame-label', 'dominant-baseline': 'central' }, item.g);
   this.refresh(item);
   return item.g;
  },
  refresh(item) {
   item.text.textContent = item.spec.fixed.tag;
  },
  enter: () => ENTER.fade,
  apply(item, a) {
   const { x, y, w, h } = item.cur, tw = item.spec.fixed.tw;
   setAttrs(item.rect, { x: f(x), y: f(y), width: f(w), height: f(h) });
   item.tab.setAttribute('d', `M${f(x)},${f(y + 20)} V${f(y + 10)} Q${f(x)},${f(y)} ${f(x + 10)},${f(y)} H${f(x + tw)} V${f(y + 12)} Q${f(x + tw)},${f(y + 20)} ${f(x + tw - 8)},${f(y + 20)} Z`);
   setAttrs(item.text, { x: f(x + 8), y: f(y + 10.5) });
   fade(item.g, a, 0);
  },
 },
 cluster: {
  create(item, scene) {
   item.g = svg('g', {}, scene.layer('back'));
   item.rect = svg('rect', { rx: CLUSTER.radius }, item.g);
   item.text = svg('text', { class: 'dg-cluster-title', 'dominant-baseline': 'central' }, item.g);
   this.refresh(item);
   return item.g;
  },
  refresh(item) {
   const fx = item.spec.fixed;
   item.g.setAttribute('class', `dg-cluster${fx.depth ? ' is-nested' : ''}`);
   item.text.textContent = fx.title;
  },
  enter: () => ENTER.fade,
  apply(item, a) {
   const { x, y, w, h } = item.cur;
   setAttrs(item.rect, { x: f(x), y: f(y), width: f(w), height: f(h) });
   setAttrs(item.text, { x: f(x + CLUSTER.padX), y: f(y + CLUSTER.head / 2 + 1) });
   fade(item.g, a, 6);
  },
 },
 candle: {
  create(item, scene) {
   item.g = svg('g', {}, scene.layer('nodes'));
   item.wick = svg('line', { class: 'dg-wick' }, item.g);
   item.box = svg('rect', { class: 'dg-candle-body', rx: 1.5 }, item.g);
   this.refresh(item);
   return item.g;
  },
  refresh(item) {
   item.g.setAttribute('class', `dg-candle ${item.spec.fixed.cls}`);
  },
  enter: () => ENTER.node,
  apply(item, a) {
   const { x, o, c, h, l, w } = item.cur, g = a >= 1 ? 1 : growEase(a), mid = (o + c) / 2;
   const size = Math.max(1, Math.abs(c - o) * g);
   setAttrs(item.wick, { x1: f(x), x2: f(x), y1: f(mid + (h - mid) * g), y2: f(mid + (l - mid) * g) });
   setAttrs(item.box, { x: f(x - w / 2), width: f(w), y: f(mid - size / 2), height: f(size) });
   item.g.style.opacity = a >= 1 ? '' : clamp01(a * 2.5).toFixed(3);
  },
 },
 column: {
  create(item, scene) {
   item.el = svg('path', {}, scene.layer(item.spec.layer || 'back'));
   this.refresh(item);
   return item.el;
  },
  refresh(item) {
   const fx = item.spec.fixed;
   item.el.setAttribute('class', `${fx.cls || ''}${toneClass(fx.tone)}`);
  },
  enter: () => ENTER.grow,
  apply(item, a) {
   const { x, top, w, base } = item.cur, g = a >= 1 ? 1 : growEase(a);
   item.el.setAttribute('d', barPath(x, base + (top - base) * g, w, base, item.spec.fixed.r));
  },
 },
 span: {
  create(item, scene) {
   item.el = svg(item.spec.fixed.milestone ? 'path' : 'rect', {}, scene.layer('nodes'));
   this.refresh(item);
   return item.el;
  },
  refresh(item) {
   const fx = item.spec.fixed;
   item.el.setAttribute('class', `${fx.cls}${fx.milestone ? ' is-milestone' : ''}${toneClass(fx.tone)}`);
  },
  enter: item => item.spec.fixed.milestone ? ENTER.label : ENTER.grow,
  apply(item, a) {
   const { x, y, w, h } = item.cur;
   if (item.spec.fixed.milestone) {
    const s = h / 2 * (a >= 1 ? 1 : Math.max(0, backOut(a)));
    item.el.setAttribute('d', `M${f(x)},${f(y - s)} L${f(x + s)},${f(y)} L${f(x)},${f(y + s)} L${f(x - s)},${f(y)} Z`);
    return;
   }
   const width = Math.max(h * 0.2, w * (a >= 1 ? 1 : easeOut(a)));
   setAttrs(item.el, { x: f(x), y: f(y - h / 2), width: f(width), height: f(h), rx: f(Math.min(h / 2, width / 2)) });
   item.el.style.opacity = a >= 1 ? '' : clamp01(a * 3).toFixed(3);
  },
 },
 rect: {
  create(item, scene) {
   item.el = svg('rect', {}, scene.layer(item.spec.layer || 'back'));
   this.refresh(item);
   return item.el;
  },
  refresh(item) {
   const fx = item.spec.fixed;
   item.el.setAttribute('class', `${fx.cls || ''}${toneClass(fx.tone)}`);
   item.el.setAttribute('rx', fx.rx ?? 12);
  },
  enter: () => ENTER.fade,
  apply(item, a) {
   const { x, y, w, h } = item.cur;
   setAttrs(item.el, { x: f(x), y: f(y), width: f(w), height: f(h) });
   item.el.style.opacity = a >= 1 ? '' : easeOut(a).toFixed(3);
  },
 },
 poly: {
  create(item, scene) {
   item.el = svg('path', {}, scene.layer(item.spec.layer || 'nodes'));
   this.refresh(item);
   return item.el;
  },
  refresh(item) {
   const fx = item.spec.fixed;
   item.el.setAttribute('class', `${fx.cls || ''}${toneClass(fx.tone)}`);
  },
  enter: () => ENTER.arc,
  apply(item, a) {
   const vs = item.cur.vs, { cx, cy } = item.spec.fixed, g = a >= 1 ? 1 : Math.max(0, backOut(a, 0.9));
   let d = '';
   for (let i = 0; i < vs.length; i += 2) d += `${i ? ' L' : 'M'}${f(cx + (vs[i] - cx) * g)},${f(cy + (vs[i + 1] - cy) * g)}`;
   item.el.setAttribute('d', `${d} Z`);
   item.el.style.opacity = a >= 1 ? '' : clamp01(a * 2).toFixed(3);
  },
 },
 chip: {
  create(item, scene) {
   item.g = svg('g', {}, scene.layer(item.spec.layer || 'labels'));
   item.body = svg('g', { class: 'dg-body' }, item.g);
   svg('circle', { cx: 4, r: 4 }, item.body);
   item.text = svg('text', { x: 14, 'dominant-baseline': 'central' }, item.body);
   this.refresh(item);
   return item.g;
  },
  refresh(item) {
   const fx = item.spec.fixed;
   item.g.setAttribute('class', `dg-chip${toneClass(fx.tone)}`);
   item.text.textContent = fx.text;
  },
  enter: () => ENTER.label,
  apply(item, a) {
   item.g.setAttribute('transform', `translate(${f(item.cur.x)} ${f(item.cur.y)})`);
   fade(item.body, a, 0);
  },
 },
 wbox: {
  create(item, scene) {
   item.el = svg('rect', {}, scene.layer(item.spec.layer || 'edges'));
   this.refresh(item);
   return item.el;
  },
  refresh(item) {
   const fx = item.spec.fixed;
   item.el.setAttribute('class', `${fx.cls || ''}${toneClass(fx.tone)}`);
   item.el.setAttribute('rx', fx.rx ?? 12);
  },
  enter: () => ENTER.fade,
  apply(item, a) {
   const { x, y, w, h } = item.cur;
   setAttrs(item.el, { x: f(x), y: f(y), width: f(Math.max(0, w)), height: f(Math.max(0, h)) });
   fade(item.el, a, 6);
  },
 },
 wglyph: {
  create(item, scene) {
   item.g = svg('g', {}, scene.layer(item.spec.layer || 'labels'));
   item.body = svg('g', {}, item.g);
   item.path = svg('path', {}, item.body);
   this.refresh(item);
   return item.g;
  },
  refresh(item) {
   const fx = item.spec.fixed;
   item.g.setAttribute('class', `dg-wf-glyph${fx.cls ? ` ${fx.cls}` : ''}${toneClass(fx.tone)}`);
   item.path.setAttribute('d', GLYPHS[fx.icon] || '');
  },
  enter: () => ENTER.label,
  apply(item, a) {
   const { x, y, s } = item.cur;
   item.g.setAttribute('transform', `translate(${f(x)} ${f(y)}) scale(${(s / 24).toFixed(3)})`);
   fade(item.body, a, 3);
  },
 },
};

/* Scene: reconciles keyed items and animates them */

function clone(props) {
 const out = {};
 for (const key in props) out[key] = Array.isArray(props[key]) ? props[key].slice() : props[key];
 return out;
}

function zero(props) {
 const out = {};
 for (const key in props) out[key] = Array.isArray(props[key]) ? props[key].map(() => 0) : 0;
 return out;
}

function sameFixed(a, b) {
 if (a === b) return true;
 const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
 for (const key of keys) {
  const x = a?.[key], y = b?.[key];
  if (Array.isArray(x) || Array.isArray(y) ? String(x) !== String(y) : x !== y) return false;
 }
 return true;
}

function springTo(obj, vel, key, goal, dt) {
 let x = obj[key], v = vel[key];
 if (x === goal && !v) return false;
 const [k, c] = SPRING, steps = Math.max(1, Math.ceil(dt / 0.008)), h = dt / steps;
 for (let i = 0; i < steps; i++) { v += ((goal - x) * k - v * c) * h; x += v * h; }
 if (Math.abs(goal - x) < 0.02 && Math.abs(v) < 0.05) { obj[key] = goal; vel[key] = 0; return false; }
 obj[key] = x;
 vel[key] = v;
 return true;
}

function stepProps(cur, vel, to, dt) {
 let moving = false;
 for (const key in to) {
  const goal = to[key];
  if (Array.isArray(goal)) {
   const c = cur[key], v = vel[key];
   for (let i = 0; i < goal.length; i++) if (springTo(c, v, i, goal[i], dt)) moving = true;
  } else if (springTo(cur, vel, key, goal, dt)) moving = true;
 }
 return moving;
}

class Scene {
 constructor(canvas, defs, hooks) {
  this.canvas = canvas;
  this.defs = defs;
  this.hooks = hooks;
  this.layers = new Map(LAYERS.map(name => [name, svg('g', { class: `dg-layer is-${name}` }, canvas)]));
  this.items = new Map();
  this.raf = 0;
  this.last = 0;
  this.tick = this.tick.bind(this);
 }

 layer(name) {
  return this.layers.get(name) || this.layers.get('front');
 }

 uid() {
  return `dg-${++uid}`;
 }

 hot(key, on) {
  const item = this.items.get(key);
  if (item) (item.g || item.el).classList.toggle('is-hot', on);
 }

 patch(key, changes) {
  const item = this.items.get(key);
  if (!item) return;
  const old = item.spec.fixed;
  item.spec = { ...item.spec, fixed: { ...old, ...changes } };
  item.type.refresh?.(item, old, this);
  item.dirty = true;
  this.wake();
 }

 set(specs, { stagger = 0, instant = false } = {}) {
  const now = performance.now(), reduced = instant || reducedMotion(), seen = new Set(), fresh = [];
  for (const spec of specs) {
   seen.add(spec.key);
   let item = this.items.get(spec.key);
   if (item && item.spec.type !== spec.type) { this.destroy(item); item = null; }
   if (!item) {
    const start = spec.initial || spec.props;
    item = { key: spec.key, spec, type: TYPES[spec.type], cur: clone(start), vel: zero(start), to: clone(spec.props), extra: [], appear: 0, from: 0, goal: 1, begin: now, dur: 0 };
    item.el = item.type.create(item, this);
    if (item.el) item.el.dataset.key = spec.key;
    this.items.set(spec.key, item);
    fresh.push(item);
   } else {
    const old = item.spec.fixed;
    item.spec = spec;
    if (!sameFixed(old, spec.fixed)) item.type.refresh?.(item, old, this);
    this.retarget(item, spec.props);
    if (item.goal !== 1) { item.from = item.appear; item.goal = 1; item.begin = now; item.dur = EXIT; }
   }
   if (reduced) { item.cur = clone(item.to); item.vel = zero(item.to); }
   item.dirty = true;
  }
  const first = fresh.length ? Math.min(...fresh.map(item => item.spec.order || 0)) : 0;
  for (const item of fresh) {
   item.begin = now + Math.min(STAGGER.cap, ((item.spec.order || 0) - first) * stagger);
   item.dur = reduced ? 0 : item.type.enter(item);
   if (reduced || !item.dur) item.appear = 1;
   item.type.apply(item, item.appear, this);
  }
  for (const item of this.items.values()) {
   if (seen.has(item.key) || item.goal === 0) continue;
   item.from = item.appear;
   item.goal = 0;
   item.begin = now;
   item.dur = reduced ? 0 : EXIT;
  }
  this.wake();
 }

 retarget(item, props) {
  const to = clone(props);
  if (to.pts && item.cur.pts && to.pts.length !== item.cur.pts.length) {
   const count = Math.max(segmentCount(to.pts), segmentCount(item.cur.pts));
   item.cur.pts = resample(item.cur.pts, count);
   item.vel.pts = resample(item.vel.pts, count);
   to.pts = resample(to.pts, count);
  }
  for (const key in to) {
   const list = Array.isArray(to[key]);
   if (!(key in item.cur) || (list && item.cur[key].length !== to[key].length)) {
    item.cur[key] = list ? to[key].slice() : to[key];
    item.vel[key] = list ? to[key].map(() => 0) : 0;
   }
  }
  item.to = to;
 }

 wake() {
  if (this.raf) return;
  this.last = performance.now();
  this.raf = requestAnimationFrame(this.tick);
 }

 tick(now) {
  this.raf = 0;
  const dt = clamp((now - this.last) / 1000, 0, 0.05);
  this.last = now;
  let busy = false;
  for (const item of [...this.items.values()]) {
   const moving = stepProps(item.cur, item.vel, item.to, dt);
   let pending = false;
   if (item.appear !== item.goal) {
    const t = item.dur ? (now - item.begin) / item.dur : 1;
    item.appear = t >= 1 ? item.goal : t <= 0 ? item.from : item.from + (item.goal - item.from) * t;
    pending = item.appear !== item.goal;
    item.dirty = true;
   }
   if (moving || item.dirty) { item.type.apply(item, item.appear, this); item.dirty = false; }
   if (item.goal === 0 && item.appear === 0) { this.destroy(item); continue; }
   if (moving || pending) busy = true;
  }
  this.hooks.frame?.();
  if (busy) this.raf = requestAnimationFrame(this.tick);
 }

 destroy(item) {
  item.el?.remove();
  for (const extra of item.extra) extra.remove();
  this.items.delete(item.key);
 }
}

/* Editing helpers */

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function renameNode(source, id, label, dialect) {
 const safe = /[[\]{}()<>|"#;:&]/.test(label) ? `"${label.replace(/"/g, '#quot;')}"` : label;
 const name = escapeRegExp(id);
 if (dialect === 'state') {
  const line = new RegExp(`^([ \\t]*)${name}[ \\t]*:.*$`, 'mu');
  if (line.test(source)) return source.replace(line, `$1${id} : ${label}`);
  return `${source.replace(/\s*$/, '')}\n    ${id} : ${label}`;
 }
 const defined = new RegExp(`(^|[^\\p{L}\\p{N}_])${name}(\\(\\(\\(|\\(\\(|\\(\\[|\\[\\[|\\[\\(|\\[\\/|\\[\\\\|\\{\\{|\\[|\\(|\\{|>)`, 'u');
 const m = defined.exec(source);
 if (m) {
  const open = m[2], at = m.index + m[1].length + id.length + open.length;
  const shape = SHAPES.find(entry => entry[0] === open);
  const [end] = closing(source, at, open, shape[1]);
  if (end >= 0) return source.slice(0, at) + safe + source.slice(end);
 }
 const bare = new RegExp(`(^|[^\\p{L}\\p{N}_])(${name})(?![\\p{L}\\p{N}_])`, 'mu');
 const lines = source.split('\n');
 for (let i = 1; i < lines.length; i++) {
  if (bare.test(lines[i])) { lines[i] = lines[i].replace(bare, `$1$2[${safe}]`); return lines.join('\n'); }
 }
 return source;
}

/* Visual editing: each kind reads its source into fields and tables and writes them back */

const quote = text => `"${String(text ?? '').replace(/"/g, "'").replace(/\n/g, ' ')}"`;
const numeric = value => { const n = number(String(value ?? '')); return Number.isFinite(n) ? n : 0; };
const joinLines = parts => parts.filter(part => typeof part === 'string' && part).join('\n');
const field = (key, label, value, kind = 'text', options = null) => ({ key, label, value: value ?? '', kind, options });
const valueOf = (model, key) => model.fields.find(entry => entry.key === key)?.value ?? '';
const words = text => String(text ?? '').replace(/\n/g, ' ').trim();
const isoDay = t => new Date(t).toISOString().slice(0, 10);
const freshId = (rows, prefix) => { let k = rows.length + 1; const taken = new Set(rows.map(row => row.meta.id)); while (taken.has(`${prefix}${k}`)) k++; return `${prefix}${k}`; };
const seriesCol = name => ({ kind: 'number', head: true, name });
const pointCol = name => ({ kind: 'number', head: true, name, narrow: true });
const nextLabel = names => { const last = String(names[names.length - 1] ?? '').trim(), n = Number(last); return last && Number.isInteger(n) ? String(n + 1) : ''; };
const SHAPE_WRAP = { rect: ['[', ']'], round: ['(', ')'], stadium: ['([', '])'], subroutine: ['[[', ']]'], cylinder: ['[(', ')]'], circle: ['((', '))'], diamond: ['{', '}'], hexagon: ['{{', '}}'], lean: ['[/', '/]'], flag: ['>', ']'] };
const ARROW_TOKENS = { solid: ['---', '-->'], dotted: ['-.-', '-.->'], thick: ['===', '==>'] };
const GANTT_STATUS = ['', 'active', 'done', 'crit', 'milestone'];
const DIRECTIONS = () => [['TD', I18n.t('edit.down')], ['LR', I18n.t('edit.right')]];

const EDITORS = {
 chart: {
  read(source) {
   const d = parseXY(clean(source));
   if (!d) return null;
   return {
    fields: [field('title', 'edit.title', d.title), field('x', 'edit.xaxis', d.xTitle), field('y', 'edit.yaxis', d.yTitle)],
    tables: [{
     title: 'edit.data', lock: 2, add: 'edit.addSeries', addCol: 'edit.addPoint',
     cols: [
      { kind: 'text', label: 'edit.series', placeholder: I18n.t('edit.series') },
      { kind: 'select', label: 'edit.kind', options: [['line', I18n.t('edit.line')], ['bar', I18n.t('edit.bar')]] },
      ...d.labels.map(pointCol),
     ],
     rows: d.series.map(s => ({ cells: [s.name, s.type, ...d.labels.map((_, i) => s.values[i] ?? '')] })),
     blank: t => ({ cells: ['', t.rows[t.rows.length - 1]?.cells[1] || 'line', ...t.cols.slice(2).map(() => '')] }),
     blankCol: t => pointCol(nextLabel(t.cols.slice(2).map(col => col.name))),
    }],
    range: [d.min, d.max],
   };
  },
  write(m) {
   const t = m.tables[0], labels = t.cols.slice(2).map(col => col.name), [lo, hi] = m.range;
   const values = t.rows.map(row => row.cells.slice(2).map(numeric));
   const keep = lo !== null && hi !== null && values.flat().every(v => v >= lo && v <= hi);
   const x = valueOf(m, 'x'), y = valueOf(m, 'y');
   return joinLines([
    'xychart-beta',
    valueOf(m, 'title') && `    title ${quote(valueOf(m, 'title'))}`,
    `    x-axis ${x ? `${quote(x)} ` : ''}[${labels.map(quote).join(', ')}]`,
    (y || keep) && `    y-axis${y ? ` ${quote(y)}` : ''}${keep ? ` ${lo} --> ${hi}` : ''}`,
    ...t.rows.map((row, k) => `    ${row.cells[1] === 'bar' ? 'bar' : 'line'}${words(row.cells[0]) ? ` ${quote(row.cells[0])}` : ''} [${values[k].join(', ')}]`),
   ]);
  },
 },
 pie: {
  read(source) {
   const d = parsePie(clean(source));
   if (!d) return null;
   return {
    fields: [field('title', 'edit.title', d.title)],
    tables: [{
     title: 'edit.slices', add: 'edit.addSlice',
     cols: [{ kind: 'text', label: 'edit.label' }, { kind: 'number', label: 'edit.value' }],
     rows: d.items.map(item => ({ cells: [item.label, item.value] })),
     blank: () => ({ cells: ['', ''] }),
    }],
    showData: d.showData,
   };
  },
  write(m) {
   return joinLines([
    `pie${m.showData ? ' showData' : ''}`,
    valueOf(m, 'title') && `    title ${words(valueOf(m, 'title'))}`,
    ...m.tables[0].rows.filter(row => numeric(row.cells[1]) > 0).map(row => `    ${quote(row.cells[0] || '–')} : ${numeric(row.cells[1])}`),
   ]);
  },
 },
 candles: {
  read(source) {
   const d = parseCandles(clean(source));
   if (!d) return null;
   return {
    fields: [field('title', 'edit.title', d.title), field('ma', 'edit.ma', d.ma.join(', '))],
    tables: [{
     title: 'edit.candles', add: 'edit.addCandle',
     cols: ['edit.date', 'chart.open', 'chart.high', 'chart.low', 'chart.close', 'chart.volume'].map((label, i) => ({ kind: i ? 'number' : 'text', label })),
     rows: d.rows.map(r => ({ cells: [r.label, r.o, r.h, r.l, r.c, r.v || ''] })),
     blank: t => { const c = t.rows[t.rows.length - 1]?.cells[4] ?? ''; return { cells: ['', c, c, c, c, ''] }; },
    }],
   };
  },
  write(m) {
   const ma = String(valueOf(m, 'ma')).split(/[\s,;]+/).map(Number).filter(n => n > 1);
   return joinLines([
    'candlestick',
    valueOf(m, 'title') && `    title ${words(valueOf(m, 'title'))}`,
    ma.length > 0 && `    ma ${ma.join(', ')}`,
    ...m.tables[0].rows.map(row => `    ${words(row.cells[0]).replace(/[,;|]/g, ' ') || '–'}, ${[1, 2, 3, 4].map(k => numeric(row.cells[k])).join(', ')}${String(row.cells[5] ?? '').trim() ? `, ${numeric(row.cells[5])}` : ''}`),
   ]);
  },
 },
 radar: {
  read(source) {
   const d = parseRadar(clean(source));
   if (!d) return null;
   return {
    fields: [field('title', 'edit.title', d.title), field('max', 'edit.max', d.max ?? '', 'number')],
    tables: [{
     title: 'edit.criteria', lock: 1, min: 3, add: 'edit.addCriterion', addCol: 'edit.addOption',
     cols: [{ kind: 'text', label: 'edit.criterion' }, ...d.curves.map(c => seriesCol(c.label))],
     rows: d.axes.map((axis, i) => ({ cells: [axis.label, ...d.curves.map(c => c.data[i])] })),
     blank: t => ({ cells: ['', ...t.cols.slice(1).map(() => '')] }),
     blankCol: t => seriesCol(`${I18n.t('edit.option')} ${t.cols.length}`),
    }],
    min: d.min, circle: d.circle, levels: d.levels,
   };
  },
  write(m) {
   const t = m.tables[0], max = String(valueOf(m, 'max')).trim();
   return joinLines([
    'radar-beta',
    valueOf(m, 'title') && `    title ${quote(valueOf(m, 'title'))}`,
    `    axis ${t.rows.map((row, i) => `a${i}[${quote(row.cells[0] || '–')}]`).join(', ')}`,
    ...t.cols.slice(1).map((col, k) => `    curve c${k}[${quote(col.name || '–')}]{${t.rows.map(row => numeric(row.cells[k + 1])).join(', ')}}`),
    max && `    max ${numeric(max)}`,
    m.min !== null && `    min ${m.min}`,
    m.circle && '    graticule circle',
    m.levels !== RADAR.levels && `    ticks ${m.levels}`,
   ]);
  },
 },
 quadrant: {
  read(source) {
   const d = parseQuadrant(clean(source));
   if (!d) return null;
   return {
    fields: [
     field('title', 'edit.title', d.title), field('x0', 'edit.xLow', d.x[0]), field('x1', 'edit.xHigh', d.x[1]), field('y0', 'edit.yLow', d.y[0]), field('y1', 'edit.yHigh', d.y[1]),
     ...[2, 1, 3, 4].map(q => field(`q${q}`, `edit.q${q}`, d.q[q - 1])),
    ],
    tables: [{
     title: 'edit.points', min: 0, add: 'edit.addPoint',
     cols: [{ kind: 'text', label: 'edit.label' }, { kind: 'number', label: 'edit.px' }, { kind: 'number', label: 'edit.py' }],
     rows: d.points.map(p => ({ cells: [p.label, +p.x.toFixed(3), +p.y.toFixed(3)] })),
     blank: () => ({ cells: ['', 0.5, 0.5] }),
    }],
   };
  },
  write(m) {
   const g = key => words(valueOf(m, key)), axis = (a, b) => `${a || '–'}${b ? ` --> ${b}` : ''}`;
   return joinLines([
    'quadrantChart',
    g('title') && `    title ${g('title')}`,
    (g('x0') || g('x1')) && `    x-axis ${axis(g('x0'), g('x1'))}`,
    (g('y0') || g('y1')) && `    y-axis ${axis(g('y0'), g('y1'))}`,
    ...[1, 2, 3, 4].map(q => g(`q${q}`) && `    quadrant-${q} ${g(`q${q}`)}`),
    ...m.tables[0].rows.map(row => `    ${words(row.cells[0]).replace(/:/g, ' ') || '–'}: [${clamp01(numeric(row.cells[1]))}, ${clamp01(numeric(row.cells[2]))}]`),
   ]);
  },
 },
 gantt: {
  read(source) {
   const d = parseGantt(clean(source));
   if (!d) return null;
   const options = GANTT_STATUS.map(value => [value, I18n.t(`status.${value || 'none'}`)]);
   return {
    fields: [field('title', 'edit.title', d.title)],
    tables: [{
     title: 'edit.tasks', add: 'edit.addTask', focus: 1,
     cols: [{ kind: 'text', label: 'edit.section' }, { kind: 'text', label: 'edit.task', wide: true }, { kind: 'text', label: 'edit.start' }, { kind: 'number', label: 'edit.days' }, { kind: 'select', label: 'edit.status', options }],
     rows: d.tasks.map(t => ({ cells: [t.section, t.name, isoDay(t.start), +((t.end - t.start) / DAY).toFixed(2), t.tags.includes('milestone') ? 'milestone' : t.tags[0] || ''] })),
     blank: t => {
      const last = t.rows[t.rows.length - 1]?.cells, start = last ? (parseDate(last[2]) ?? Date.now()) + numeric(last[3]) * DAY : Date.now();
      return { cells: [last?.[0] || '', '', isoDay(start), 5, ''] };
     },
    }],
    noToday: d.noToday,
   };
  },
  write(m) {
   const out = ['gantt'];
   if (valueOf(m, 'title')) out.push(`    title ${words(valueOf(m, 'title'))}`);
   out.push('    dateFormat YYYY-MM-DD');
   if (m.noToday) out.push('    todayMarker off');
   let section = null;
   for (const row of m.tables[0].rows) {
    const name = words(row.cells[1]).replace(/:/g, ' ') || '–', status = row.cells[4];
    if (words(row.cells[0]) !== section && (words(row.cells[0]) || section)) { section = words(row.cells[0]); out.push(`    section ${section || '–'}`); }
    out.push(`    ${name} :${status ? `${status}, ` : ''}${words(row.cells[2])}, ${status === 'milestone' ? 0 : Math.max(0.1, numeric(row.cells[3]) || 1)}d`);
   }
   return out.join('\n');
  },
 },
 timeline: {
  read(source) {
   const d = parseTimeline(clean(source));
   if (!d) return null;
   return {
    fields: [field('title', 'edit.title', d.title)],
    tables: [{
     title: 'edit.events', add: 'edit.addEvent', focus: 1,
     cols: [{ kind: 'text', label: 'edit.section' }, { kind: 'text', label: 'edit.when' }, { kind: 'text', label: 'edit.what', wide: true }],
     rows: d.periods.map(p => ({ cells: [p.section, p.label, p.events.join('; ')] })),
     blank: t => ({ cells: [t.rows[t.rows.length - 1]?.cells[0] || '', '', ''] }),
    }],
   };
  },
  write(m) {
   const out = ['timeline'];
   if (valueOf(m, 'title')) out.push(`    title ${words(valueOf(m, 'title'))}`);
   let section = '';
   for (const row of m.tables[0].rows) {
    if (words(row.cells[0]) && words(row.cells[0]) !== section) { section = words(row.cells[0]); out.push(`    section ${section}`); }
    const events = String(row.cells[2] ?? '').split(';').map(e => words(e).replace(/:\s/g, ' - ')).filter(Boolean);
    out.push(`    ${words(row.cells[1]).replace(/:\s/g, ' ') || '–'}${events.map(e => ` : ${e}`).join('')}`);
   }
   return out.join('\n');
  },
 },
 flow: {
  read(source) {
   const g = parseFlow(clean(source));
   if (!g) return null;
   const groups = g.groups, grouped = groups.length > 0;
   const cols = [{ kind: 'text', label: 'edit.text', wide: true }];
   if (grouped) cols.push({ kind: 'select', label: 'edit.group', width: '34%', options: [['', I18n.t('edit.noGroup')], ...groups.map(x => [x.id, x.title || x.id])] });
   return {
    fields: [field('dir', 'edit.direction', g.dir === 'LR' || g.dir === 'RL' ? 'LR' : 'TD', 'select', DIRECTIONS())],
    groups,
    tables: [
     {
      key: 'nodes', title: 'edit.blocks', add: 'edit.addBlock', cols,
      rows: g.nodes.map(n => ({ cells: [n.label.trim() ? n.label : '', ...(grouped ? [n.group || ''] : [])], meta: { id: n.id, shape: n.shape } })),
      blank: t => ({ cells: ['', ...(grouped ? [t.rows[t.rows.length - 1]?.cells[1] || ''] : [])], meta: { id: freshId(t.rows, 'n'), shape: 'rect' } }),
     },
     {
      key: 'links', title: 'edit.links', min: 0, add: 'edit.addLink',
      cols: [{ kind: 'node', label: 'edit.from', width: '38%' }, { kind: 'node', label: 'edit.to', width: '38%' }, { kind: 'text', label: 'edit.caption', width: '24%' }],
      rows: g.edges.map(e => ({ cells: [e.from, e.to, e.label], meta: { style: e.style, head: e.head, both: e.both } })),
      blank: (t, m) => { const ids = m.tables[0].rows.map(row => row.meta.id); return { cells: [ids[ids.length - 2] ?? ids[0], ids[ids.length - 1] ?? ids[0], ''], meta: { style: 'solid', head: 'arrow' } }; },
     },
    ],
   };
  },
  write(m) {
   const [nodes, links] = m.tables, groups = m.groups || [], ids = new Set([...nodes.rows.map(row => row.meta.id), ...groups.map(g => g.id)]);
   const label = text => `"${String(text || ' ').replace(/"/g, '#quot;').replace(/\n/g, '<br/>')}"`;
   const arrow = meta => {
    if (meta.style === 'hidden') return '~~~';
    if (meta.head === 'circle') return '--o';
    if (meta.head === 'cross') return '--x';
    const token = (ARROW_TOKENS[meta.style] || ARROW_TOKENS.solid)[meta.head === 'none' ? 0 : 1];
    return meta.both && meta.head === 'arrow' ? `<${token}` : token;
   };
   const known = new Set(groups.map(g => g.id)), home = row => groups.length && known.has(row.cells[1]) ? row.cells[1] : '';
   const define = (row, pad) => { const [open, close] = SHAPE_WRAP[row.meta.shape] || SHAPE_WRAP.rect; return `${pad}${row.meta.id}${open}${label(row.cells[0])}${close}`; };
   const body = (parent, pad) => [
    ...nodes.rows.filter(row => home(row) === parent).map(row => define(row, pad)),
    ...groups.filter(g => (known.has(g.parent) ? g.parent : '') === parent).flatMap(g => [
     `${pad}subgraph ${g.id.startsWith('__g') ? label(g.title) : `${g.id}[${label(g.title)}]`}`,
     g.dir && `${pad}    direction ${g.dir}`,
     ...body(g.id, `${pad}    `),
     `${pad}end`,
    ]),
   ];
   return joinLines([
    `flowchart ${valueOf(m, 'dir')}`,
    ...body('', '    '),
    ...links.rows.filter(row => ids.has(row.cells[0]) && ids.has(row.cells[1])).map(row => {
     const text = words(row.cells[2]).replace(/\|/g, '/');
     return `    ${row.cells[0]} ${arrow(row.meta || {})}${text ? `|${text}|` : ''} ${row.cells[1]}`;
    }),
   ]);
  },
 },
 state: {
  read(source) {
   const g = parseState(clean(source));
   if (!g) return null;
   const id = node => node === '__start' || node === '__end' ? '[*]' : node;
   return {
    fields: [field('dir', 'edit.direction', g.dir === 'LR' ? 'LR' : 'TD', 'select', DIRECTIONS())],
    tables: [
     {
      key: 'nodes', title: 'edit.states', add: 'edit.addState',
      cols: [{ kind: 'text', label: 'edit.text', wide: true }],
      rows: g.nodes.filter(n => !n.id.startsWith('__')).map(n => ({ cells: [n.label], meta: { id: n.id } })),
      blank: t => ({ cells: [''], meta: { id: freshId(t.rows, 's') } }),
     },
     {
      key: 'links', title: 'edit.links', min: 0, add: 'edit.addLink',
      cols: [{ kind: 'node', pseudo: 'start', label: 'edit.from', width: '38%' }, { kind: 'node', pseudo: 'end', label: 'edit.to', width: '38%' }, { kind: 'text', label: 'edit.caption', width: '24%' }],
      rows: g.edges.map(e => ({ cells: [id(e.from), id(e.to), e.label] })),
      blank: (t, m) => { const ids = m.tables[0].rows.map(row => row.meta.id); return { cells: [ids[ids.length - 1] ?? '[*]', '[*]', ''] }; },
     },
    ],
   };
  },
  write(m) {
   const [nodes, links] = m.tables, ids = new Set(['[*]', ...nodes.rows.map(row => row.meta.id)]);
   return joinLines([
    'stateDiagram-v2',
    valueOf(m, 'dir') === 'LR' && '    direction LR',
    ...nodes.rows.map(row => `    ${row.meta.id} : ${words(row.cells[0]) || row.meta.id}`),
    ...links.rows.filter(row => ids.has(row.cells[0]) && ids.has(row.cells[1])).map(row => `    ${row.cells[0]} --> ${row.cells[1]}${words(row.cells[2]) ? ` : ${words(row.cells[2])}` : ''}`),
   ]);
  },
 },
 sequence: {
  read(source) {
   const d = parseSequence(clean(source));
   if (!d || d.events.some(e => e.type !== 'message')) return null;
   return {
    fields: [field('auto', 'edit.numbers', d.numbered, 'check')],
    tables: [
     {
      key: 'nodes', title: 'edit.people', add: 'edit.addPerson',
      cols: [{ kind: 'text', label: 'edit.label', wide: true }],
      rows: d.actors.map(a => ({ cells: [a.label], meta: { id: a.id } })),
      blank: t => ({ cells: [''], meta: { id: freshId(t.rows, 'p') } }),
     },
     {
      key: 'links', title: 'edit.messages', min: 0, add: 'edit.addMessage',
      cols: [{ kind: 'node', label: 'edit.from' }, { kind: 'node', label: 'edit.to' }, { kind: 'text', label: 'edit.text', wide: true }, { kind: 'check', label: 'edit.reply' }],
      rows: d.events.map(e => ({ cells: [e.from.id, e.to.id, e.text, e.dashed], meta: { head: e.head } })),
      blank: (t, m) => { const ids = m.tables[0].rows.map(row => row.meta.id); return { cells: [ids[0], ids[1] ?? ids[0], '', false], meta: { head: '>>' } }; },
     },
    ],
   };
  },
  write(m) {
   const [people, messages] = m.tables, ids = new Set(people.rows.map(row => row.meta.id));
   return joinLines([
    'sequenceDiagram',
    valueOf(m, 'auto') && '    autonumber',
    ...people.rows.map(row => `    participant ${row.meta.id} as ${words(row.cells[0]) || row.meta.id}`),
    ...messages.rows.filter(row => ids.has(row.cells[0]) && ids.has(row.cells[1])).map(row => `    ${row.cells[0]}${row.cells[3] ? '--' : '-'}${row.meta?.head || '>>'}${row.cells[1]}: ${words(row.cells[2])}`),
   ]);
  },
 },
 mindmap: {
  read(source) {
   const root = parseMindmap(clean(source));
   if (!root) return null;
   const out = [];
   const walk = (node, depth) => { out.push(`${'  '.repeat(depth)}${words(node.label)}`); node.children.forEach(child => walk(child, depth + 1)); };
   walk(root, 0);
   return { fields: [], tables: [], outline: out.join('\n') };
  },
  write(m) {
   const rows = m.outline.split('\n').filter(line => line.trim());
   if (!rows.length) return 'mindmap\n  root((–))';
   const depth = line => line.match(/^\s*/)[0].replace(/\t/g, '  ').length;
   const base = depth(rows[0]);
   let k = 0;
   return ['mindmap', ...rows.map((line, i) => {
    const text = line.trim();
    if (!i) return `  root((${text.replace(/[()]/g, ' ').trim() || '–'}))`;
    const body = /[()[\]{}]/.test(text) ? `n${++k}["${text.replace(/"/g, "'")}"]` : text;
    return `${' '.repeat(4 + Math.max(0, depth(line) - base))}${body}`;
   })].join('\n');
  },
 },
 wireframe: {
  read(source) {
   const page = parseWireframe(clean(source));
   if (!page) return null;
   const itemText = item => (item.desc ? `${item.title}: ${item.desc}` : item.title).replace(/;/g, ',');
   return {
    fields: [
     field('title', 'edit.page', page.title),
     field('device', 'edit.device', page.mobile ? 'mobile' : 'desktop', 'select', [['desktop', I18n.t('edit.desktop')], ['mobile', I18n.t('edit.mobile')]]),
    ],
    tables: [{
     title: 'edit.sections', add: 'edit.addSection', focus: 1,
     cols: [
      { kind: 'select', label: 'edit.sectionKind', width: '15%', options: WF_TYPES.map(type => [type, I18n.t(`wf.${type}`)]) },
      { kind: 'text', label: 'edit.heading', width: '22%' },
      { kind: 'text', label: 'edit.subtitle', width: '20%' },
      { kind: 'text', label: 'edit.items', width: '25%' },
      { kind: 'text', label: 'edit.buttons', width: '12%' },
      { kind: 'check', label: 'edit.picture', width: '6%' },
     ],
     rows: page.sections.map(s => ({
      cells: [s.type, s.heading, s.text.join(' '), s.items.map(itemText).join('; '), s.buttons.map(b => b.replace(/,/g, ' ')).join(', '), !!s.media],
      meta: { media: s.media, badge: s.badge },
     })),
     blank: () => ({ cells: ['features', '', '', '', '', false], meta: {} }),
    }],
   };
  },
  write(m) {
   const flat = text => words(text).replace(/\s+\|\s+/g, ' / ');
   const keyword = /^([a-z][a-z0-9-]*)(\s|$)/;
   const out = [`wireframe${valueOf(m, 'device') === 'mobile' ? ' mobile' : ''}`];
   if (flat(valueOf(m, 'title'))) out.push(`    title ${flat(valueOf(m, 'title'))}`);
   for (const row of m.tables[0].rows) {
    const [type, heading, sub, list, labels, picture] = row.cells, meta = row.meta || {};
    out.push(`    ${WF_TYPES.includes(type) ? type : 'section'}${flat(heading) ? ` ${flat(heading)}` : ''}`);
    if (meta.badge) out.push(`        badge ${flat(meta.badge)}`);
    if (flat(sub)) out.push(`        text ${flat(sub)}`);
    for (const item of String(list ?? '').split(';').map(flat).filter(Boolean)) {
     const guarded = keyword.test(item) || (WF_LISTS.has(type) && item.includes(',') && !/:\s/.test(item));
     out.push(`        ${guarded ? 'item ' : ''}${item}`);
    }
    for (const label of splitList(String(labels ?? '')).map(flat).filter(Boolean)) out.push(`        button ${label}`);
    if (picture) out.push(`        ${meta.media || 'image'}`);
   }
   return out.join('\n');
  },
 },
};

function outlineKey(event, area) {
 const { value, selectionStart: start, selectionEnd: end } = area;
 const from = value.lastIndexOf('\n', start - 1) + 1;
 if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.isComposing) {
  event.preventDefault();
  area.setRangeText(`\n${value.slice(from, start).match(/^\s*/)[0]}`, start, end, 'end');
  area.dispatchEvent(new Event('input'));
  return;
 }
 if (event.key !== 'Tab') return;
 event.preventDefault();
 const stop = value.indexOf('\n', end), to = stop < 0 ? value.length : stop;
 const lines = value.slice(from, to).split('\n');
 const next = lines.map(line => event.shiftKey ? line.replace(/^ {1,2}/, '') : `  ${line}`);
 area.setRangeText(next.join('\n'), from, to, start === end ? 'preserve' : 'select');
 if (start === end) {
  const caret = Math.max(from, start + next[0].length - lines[0].length);
  area.setSelectionRange(caret, caret);
 }
 area.dispatchEvent(new Event('input'));
}

function editorFor(result) {
 if (!result) return null;
 if (result.kind === 'flow') return EDITORS[result.dialect] || null;
 return EDITORS[result.kind] || null;
}
/* View: one live diagram inside a message */

class DiagramView {
 constructor(el, tones, onChange, { instant = false } = {}) {
  this.el = el;
  this.onChange = onChange;
  this.instant = instant;
  this.kind = el.dataset.kind || '';
  this.tones = rotate(tones, +el.dataset.tone || 0);
  el.replaceChildren();
  this.frame = div('dg-host', el);
  this.stage = div('dg-stage', this.frame);
  this.svg = svg('svg', { class: 'dg-svg', height: STATUS_HEIGHT, role: 'img' }, this.stage);
  const defs = svg('defs', {}, this.svg);
  this.canvas = svg('g', {}, this.svg);
  this.status = div('dg-status', this.stage, I18n.t('diagram.building'));
  this.scene = new Scene(this.canvas, defs, { view: v => this.applyView(v), frame: () => { if (!this.editing) this.onChange?.(); } });
  this.source = null;
  this.good = '';
  this.result = null;
  this.live = true;
  this.editing = false;
  this.hints = null;
  this.sideways = false;
  this.width = 0;
  this.stageLeft = 0;
  this.stageTop = 0;
  this.view = null;
  this.timer = 0;
  this.hotKeys = [];
  this.hotSig = '';
  this.lit = '';
  this.measured = null;
  new ResizeObserver(entries => this.resize(entries[entries.length - 1].contentRect.width)).observe(this.stage);
  this.stage.addEventListener('dblclick', event => this.rename(event));
  this.stage.addEventListener('pointerover', event => this.focusPie(event));
  this.stage.addEventListener('pointerleave', () => this.focusPie(null));
  this.frame.addEventListener('pointermove', event => this.pointer(event));
  this.frame.addEventListener('pointerleave', () => this.pointer(null));
 }

 available() {
  this.measured ??= this.stage.clientWidth;
  return Math.max(260, this.measured);
 }

 update(source, live = false) {
  const changed = source !== this.source;
  this.source = source;
  this.live = live;
  this.frame.classList.toggle('is-live', live);
  if (!changed && this.result) { if (!live) this.ensureTools(); return true; }
  return this.render();
 }

 render() {
  const result = safeCompile(this.source, this.tones, { width: this.available(), hints: this.hints, sideways: this.sideways, kind: this.kind });
  if (!result) {
   if (this.editing) this.setHint(I18n.t('diagram.error'));
   else if (!this.live && !this.result) this.fallback();
   return false;
  }
  this.setHint('');
  if (this.fallbackEl) { this.fallbackEl.remove(); this.fallbackEl = null; this.stage.hidden = false; }
  const first = !this.result;
  this.result = result;
  this.good = this.source;
  this.hints = result.hints || null;
  this.sideways = result.sideways || false;
  this.svg.dataset.kind = result.kind;
  this.showTip(null, null, []);
  this.lit = '';
  if (first) this.hideStatus();
  this.scene.set([this.viewSpec(result), ...result.items], { stagger: first && !this.live ? STAGGER.reveal : STAGGER.live, instant: this.instant });
  this.instant = false;
  if (!this.live) this.ensureTools();
  return true;
 }

 viewSpec(result) {
  const room = this.available();
  const s = Math.max(MIN_SCALE, Math.min(1, (room - PAD * 2) / result.width));
  const cw = result.width * s, ch = result.height * s;
  const w = Math.max(room, cw + PAD * 2), ox = (w - cw) / 2;
  let band = 0, tx = ox + cw + TOOLS.gap, ty = PAD - 3;
  if (tx + TOOLS.width > w) {
   const corner = result.corner;
   tx = ox + cw - TOOLS.width - (corner?.inset || 0) * s;
   if (corner && cw - TOOLS.width >= corner.x * s && corner.h * s + PAD >= TOOLS.height + 2) ty = Math.max(2, PAD + (corner.h * s - TOOLS.height) / 2);
   else { band = TOOLS.height + 12 - PAD; ty = 4; }
  }
  const props = { ox, s, cw, top: PAD + band, h: ch + PAD * 2 + band, w, tx, ty };
  return { key: '__view', type: 'view', props, initial: this.view ? null : { ...props, h: STATUS_HEIGHT }, fixed: {} };
 }

 applyView(v) {
  this.view = v;
  setAttrs(this.svg, { width: f(v.w), height: f(v.h), viewBox: `0 0 ${f(v.w)} ${f(v.h)}` });
  this.canvas.setAttribute('transform', `translate(${f(v.ox)} ${f(v.top)}) scale(${v.s.toFixed(4)})`);
  if (this.tools) this.tools.style.transform = `translate(${f(this.stageLeft + v.tx)}px, ${f(this.stageTop + v.ty)}px)`;
 }

 resize(width) {
  this.stageLeft = this.stage.offsetLeft;
  this.stageTop = this.stage.offsetTop;
  this.measured = Math.round(width);
  const room = this.available();
  if (Math.abs(room - this.width) < 2) { if (this.view) this.applyView(this.view); return; }
  this.width = room;
  if (this.result) this.render();
 }

 pointer(event) {
  const v = this.view;
  let inside = false, cx = null, cy = null;
  if (event && v && this.result && !this.live) {
   const box = this.stage.getBoundingClientRect(), x = event.clientX - box.left, y = event.clientY - box.top;
   const left = Math.min(v.ox, v.tx) - TOOLS.reach, right = Math.max(v.ox + v.cw, v.tx + TOOLS.width) + TOOLS.reach;
   inside = x >= left && x <= right && y >= 0 && y <= v.h + 4;
   if (inside) { cx = (x - v.ox) / v.s; cy = (y - v.top) / v.s; }
  }
  this.frame.classList.toggle('is-hover', inside);
  this.light(inside ? event.target.closest?.('.dg-node') : null);
  this.probe(cx, cy, inside ? event.target : null);
 }

 light(g) {
  const id = g && this.result?.edges ? this.scene.items.get(g.dataset.key)?.spec.fixed.id || '' : '';
  if (id === this.lit) return;
  this.lit = id;
  for (const item of this.scene.items.values()) {
   const fx = item.spec.fixed;
   if (item.spec.type === 'edge' && 'a' in fx) item.g.classList.toggle('is-lit', !!id && (fx.a === id || fx.b === id));
  }
  this.svg.classList.toggle('is-lighting', !!id);
 }

 probe(cx, cy, target) {
  const result = this.result, p = result?.probe;
  let tip = null, keys = [], at = null;
  if (cx !== null && p && cx >= p.x0 - 8 && cx <= p.x1 + 8 && cy >= p.y0 - 16 && cy <= p.y1 + 8) {
   let i = 0, best = Infinity;
   p.xs.forEach((x, k) => { const d = Math.abs(x - cx); if (d < best) { best = d; i = k; } });
   tip = p.tip(i);
   keys = p.keys(i);
   at = { x: p.xs[i], y0: p.y0, y1: p.y1 };
  } else if (target && result?.tips) {
   const key = target.closest?.('[data-key]')?.dataset.key;
   if (key && result.tips.has(key)) {
    tip = result.tips.get(key);
    keys = tip.hot || [key];
    at = { el: this.scene.items.get(keys[0])?.el };
   }
  }
  if (tip?.silent) { tip = null; at = null; }
  this.showTip(tip, at, keys);
 }

 showTip(tip, at, keys) {
  const sig = keys.join('|');
  if (sig !== this.hotSig) {
   for (const key of this.hotKeys) this.scene.hot(key, false);
   for (const key of keys) this.scene.hot(key, true);
   this.hotKeys = keys;
   this.hotSig = sig;
   this.svg.classList.toggle('is-probing', keys.length > 0);
  }
  if (!tip || !at || (!at.el && at.x === undefined)) {
   this.tipEl?.classList.remove('is-shown');
   this.ruleEl?.classList.remove('is-shown');
   return;
  }
  if (!this.tipEl) {
   this.ruleEl = div('dg-rule', this.stage);
   this.tipEl = div('dg-tip', this.stage);
  }
  const fresh = !this.tipEl.classList.contains('is-shown');
  if (this.tipSig !== sig) { this.tipSig = sig; this.tipEl.innerHTML = tipHtml(tip); }
  const v = this.view, w = this.tipEl.offsetWidth, h = this.tipEl.offsetHeight;
  let x, y;
  if (at.el) {
   const box = at.el.getBoundingClientRect(), stage = this.stage.getBoundingClientRect();
   x = box.left - stage.left + box.width / 2 - w / 2;
   y = box.top - stage.top - h - 10;
   if (y < 0) y = box.bottom - stage.top + 10;
   this.ruleEl.classList.remove('is-shown');
  } else {
   const px = v.ox + at.x * v.s, top = v.top + at.y0 * v.s, bottom = v.top + at.y1 * v.s;
   x = px + 14;
   if (x + w > v.w - 2) x = px - 14 - w;
   y = top;
   this.ruleEl.classList.toggle('is-gliding', !fresh);
   this.ruleEl.style.transform = `translate(${f(px)}px, ${f(top)}px)`;
   this.ruleEl.style.height = `${f(bottom - top)}px`;
   this.ruleEl.classList.add('is-shown');
  }
  this.tipEl.classList.toggle('is-gliding', !fresh);
  this.tipEl.style.transform = `translate(${f(clamp(x, 0, Math.max(0, v.w - w)))}px, ${f(y)}px)`;
  this.tipEl.classList.add('is-shown');
 }

 hideStatus() {
  const status = this.status;
  if (!status) return;
  this.status = null;
  if (reducedMotion() || this.instant) { status.remove(); return; }
  status.animate([{ opacity: 1 }, { opacity: 0, filter: 'blur(4px)' }], { duration: 260, easing: 'ease-out', fill: 'forwards' })
   .finished.then(() => status.remove(), () => {});
 }

 fallback() {
  this.hideStatus();
  this.stage.hidden = true;
  const root = this.fallbackEl = div('md-code dg-fallback', this.frame);
  const bar = div('md-code-bar', root);
  const lang = document.createElement('span');
  lang.className = 'md-code-lang';
  lang.textContent = this.kind || 'mermaid';
  bar.append(lang);
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = this.source;
  pre.append(code);
  root.append(pre);
 }

 ensureTools() {
  if (this.tools || !this.result) return;
  const tools = this.tools = div('dg-tools glass-lens', this.frame);
  tools.innerHTML = `<button type="button" class="dg-tool" data-action="edit" aria-label="${I18n.t('diagram.edit')}">${ICONS.edit}</button>`
   + `<button type="button" class="dg-tool" data-action="copy" aria-label="${I18n.t('diagram.copy')}">${ICONS.copy}</button>`;
  if (window.LiquidGlass) new LiquidGlass(tools, TOOLS);
  tools.addEventListener('click', event => {
   const button = event.target.closest('.dg-tool');
   if (!button) return;
   if (button.dataset.action === 'edit') this.editing ? this.closeEditor() : this.openEditor();
   else this.copy(button);
  });
  if (this.view) this.applyView(this.view);
 }

 async copy(button) {
  try { await navigator.clipboard.writeText(this.good || this.source); } catch { return; }
  button.classList.add('is-done');
  clearTimeout(button.doneTimer);
  button.doneTimer = setTimeout(() => button.classList.remove('is-done'), COPIED_TIME);
 }

 openEditor() {
  if (this.editing || this.live) return;
  this.editing = true;
  this.original = this.good;
  this.adapter = editorFor(this.result);
  if (!this.editor) this.buildEditor();
  const editor = this.editor;
  editor.getAnimations().forEach(animation => animation.cancel());
  this.frame.classList.add('is-editing');
  this.tools.querySelector('[data-action="edit"]').setAttribute('aria-label', I18n.t('diagram.done'));
  const visual = !!this.adapter?.read(withHeader(this.good, this.kind));
  this.modes.hidden = !visual;
  this.setMode(visual ? 'data' : 'code');
  this.syncReset();
  editor.hidden = false;
  const height = editor.offsetHeight;
  if (!reducedMotion()) editor.animate([{ height: '0px', opacity: 0 }, { height: `${height}px`, opacity: 1 }], { duration: 420, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
  (visual ? editor : this.code).focus({ preventScroll: true });
 }

 buildEditor() {
  const editor = this.editor = div('dg-editor', this.frame);
  editor.hidden = true;
  editor.tabIndex = -1;
  const bar = div('dg-editor-bar', editor);
  this.modes = div('dg-modes', bar);
  for (const mode of ['data', 'code']) this.button(this.modes, '', I18n.t(mode === 'data' ? 'edit.visual' : 'edit.code'), () => this.setMode(mode, true)).dataset.mode = mode;
  div('dg-editor-space', bar);
  this.resetButton = this.button(bar, 'dg-editor-button', I18n.t('edit.reset'), () => this.resetEdits());
  this.button(bar, 'dg-editor-button is-primary', I18n.t('edit.done'), () => this.closeEditor());
  this.form = div('dg-form', editor);
  const wrap = div('dg-code-wrap', editor);
  this.code = document.createElement('textarea');
  this.code.className = 'dg-code';
  this.code.spellcheck = false;
  this.code.setAttribute('autocapitalize', 'off');
  this.code.setAttribute('aria-label', I18n.t('diagram.edit'));
  wrap.append(this.code);
  this.hint = div('dg-hint', editor);
  this.code.addEventListener('input', () => this.schedule(() => this.code.value));
  this.code.addEventListener('keydown', event => {
   if (event.key !== 'Tab' || event.shiftKey) return;
   event.preventDefault();
   this.code.setRangeText('  ', this.code.selectionStart, this.code.selectionEnd, 'end');
   this.code.dispatchEvent(new Event('input'));
  });
  editor.addEventListener('keydown', event => {
   if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) { event.preventDefault(); this.closeEditor(); }
  });
 }

 button(parent, className, text, action) {
  const button = document.createElement('button');
  button.type = 'button';
  if (className) button.className = className;
  button.textContent = text;
  button.addEventListener('click', action);
  parent.append(button);
  return button;
 }

 schedule(read) {
  this.pending = read;
  clearTimeout(this.timer);
  this.timer = setTimeout(() => this.flush(), EDIT.debounce);
 }

 flush() {
  clearTimeout(this.timer);
  const read = this.pending;
  if (!read) return;
  this.pending = null;
  this.source = read();
  this.render();
  this.syncReset();
 }

 syncReset() {
  if (this.resetButton) this.resetButton.disabled = this.good === this.original && !this.pending;
 }

 setMode(mode, user = false) {
  this.flush();
  const before = user && !this.editor.hidden ? this.editor.offsetHeight : 0;
  if (mode === 'data') {
   const model = this.adapter?.read(withHeader(this.good, this.kind));
   if (model) { this.model = model; this.buildForm(); }
   else mode = 'code';
  }
  if (mode === 'code') this.code.value = this.good;
  this.mode = mode;
  this.editor.dataset.mode = mode;
  for (const button of this.modes.children) button.classList.toggle('is-active', button.dataset.mode === mode);
  this.setHint('');
  if (before && !reducedMotion()) {
   const after = this.editor.offsetHeight;
   if (after !== before) this.editor.animate([{ height: `${before}px` }, { height: `${after}px` }], { duration: 360, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
  }
  if (user && mode === 'code') this.code.focus({ preventScroll: true });
 }

 edited() {
  this.schedule(() => this.adapter.write(this.model));
 }

 buildForm() {
  const m = this.model, form = this.form;
  form.replaceChildren();
  if (m.fields.length) {
   const grid = div('dg-fields', form);
   for (const entry of m.fields) {
    const row = document.createElement('label');
    row.className = `dg-field${entry.kind === 'check' ? ' is-check' : ''}`;
    const name = document.createElement('span');
    name.textContent = I18n.t(entry.label);
    row.append(name, this.control(entry.kind, entry.value, value => { entry.value = value; this.edited(); }, entry.options));
    grid.append(row);
   }
  }
  if (m.outline !== undefined) {
   const box = div('dg-outline', form);
   const area = document.createElement('textarea');
   area.className = 'dg-code is-outline';
   area.spellcheck = false;
   area.value = m.outline;
   area.addEventListener('input', () => { m.outline = area.value; this.edited(); });
   area.addEventListener('keydown', event => outlineKey(event, area));
   box.append(area);
   div('dg-note-text', box, I18n.t('edit.outlineHint'));
  }
  if (m.tables.length) {
   const grid = div(`dg-tables${m.tables.length > 1 ? ' is-pair' : ''}`, form);
   m.tables.forEach((table, index) => grid.append(this.table(table, index)));
  }
 }

 control(kind, value, onChange, options, placeholder = '') {
  if (kind === 'select') {
   const select = document.createElement('select');
   select.className = 'dg-input is-select';
   for (const [key, label] of options) select.add(new Option(label, key));
   select.value = value;
   select.addEventListener('change', () => onChange(select.value));
   return select;
  }
  if (kind === 'check') {
   const box = document.createElement('input');
   box.type = 'checkbox';
   box.className = 'dg-check';
   box.checked = !!value;
   box.addEventListener('change', () => onChange(box.checked));
   return box;
  }
  const input = document.createElement('input');
  input.type = 'text';
  input.className = `dg-input${kind === 'number' ? ' is-number' : ''}`;
  input.value = String(value ?? '').replace(/\n/g, ' ');
  input.placeholder = placeholder;
  input.spellcheck = false;
  if (kind === 'number') input.inputMode = 'decimal';
  input.addEventListener('input', () => {
   if (kind === 'number') input.classList.toggle('is-bad', input.value.trim() !== '' && !Number.isFinite(number(input.value)));
   onChange(input.value);
  });
  return input;
 }

 table(t, index) {
  const block = div('dg-table-block');
  block.dataset.index = index;
  if (t.title) div('dg-section-title', block, I18n.t(t.title));
  const scroll = div('dg-table-scroll', block);
  const table = document.createElement('table');
  table.className = 'dg-table';
  scroll.append(table);
  const head = table.createTHead().insertRow(), lock = t.lock ?? 0;
  t.cols.forEach((col, ci) => {
   const th = document.createElement('th');
   if (col.wide || col.narrow) th.className = col.wide ? 'is-wide' : 'is-narrow';
   if (col.width) th.style.width = col.width;
   if (col.head) {
    const cell = div('dg-head-cell', th);
    const name = this.control('text', col.name, value => { col.name = value; this.edited(); });
    name.classList.add('is-head');
    cell.append(name);
    if (ci >= lock && t.cols.length > lock + 1) cell.append(this.removeButton(() => { t.cols.splice(ci, 1); t.rows.forEach(row => row.cells.splice(ci, 1)); this.structure(index); }));
   } else th.textContent = I18n.t(col.label);
   head.append(th);
  });
  head.append(document.createElement('th'));
  const body = table.createTBody(), min = t.min ?? 1;
  t.rows.forEach((row, ri) => {
   const tr = body.insertRow();
   if (row.fresh) { tr.className = 'is-new'; delete row.fresh; }
   t.cols.forEach((col, ci) => {
    const set = value => { row.cells[ci] = value; if (t.key === 'nodes') this.syncNodes(); this.edited(); };
    const control = col.kind === 'node' ? this.nodeSelect(col, row.cells[ci], set) : this.control(col.kind, row.cells[ci], set, col.options, col.placeholder || '');
    control.dataset.row = ri;
    control.dataset.col = ci;
    const td = tr.insertCell();
    if (col.narrow) td.className = 'is-narrow';
    td.append(control);
   });
   const tools = tr.insertCell();
   tools.className = 'dg-row-tools';
   if (t.rows.length > min) tools.append(this.removeButton(() => this.removeRow(t, index, ri)));
  });
  table.addEventListener('keydown', event => this.gridKey(event, t, index));
  const actions = div('dg-table-actions', block);
  this.button(actions, 'dg-add', I18n.t(t.add), () => this.addRow(t, index));
  if (t.addCol) this.button(actions, 'dg-add', I18n.t(t.addCol), () => {
   t.cols.push(t.blankCol(t));
   t.rows.forEach(row => row.cells.push(''));
   this.structure(index, 'thead th:nth-last-child(2) input');
  });
  return block;
 }

 removeButton(action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dg-remove';
  button.setAttribute('aria-label', I18n.t('edit.remove'));
  button.innerHTML = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"/></svg>';
  button.addEventListener('click', action);
  return button;
 }

 nodeSelect(col, value, onChange) {
  const select = document.createElement('select');
  select.className = 'dg-input is-select';
  select.dataset.node = col.pseudo || '';
  this.fillNodes(select, value);
  select.addEventListener('change', () => onChange(select.value));
  return select;
 }

 fillNodes(select, value = select.value) {
  const pseudo = select.dataset.node, nodes = this.model.tables.find(t => t.key === 'nodes').rows;
  select.replaceChildren();
  if (pseudo) select.add(new Option(I18n.t(pseudo === 'start' ? 'edit.startState' : 'edit.endState'), '[*]'));
  nodes.forEach((row, i) => select.add(new Option(words(row.cells[0]) || `${I18n.t('edit.block')} ${i + 1}`, row.meta.id)));
  for (const group of this.model.groups || []) select.add(new Option(`${I18n.t('edit.group')}: ${group.title || group.id}`, group.id));
  select.value = value;
 }

 syncNodes() {
  for (const select of this.form.querySelectorAll('select[data-node]')) this.fillNodes(select);
 }

 addRow(t, index, col = t.focus ?? 0) {
  const row = t.blank(t, this.model);
  row.fresh = true;
  t.rows.push(row);
  this.structure(index, `tbody [data-row="${t.rows.length - 1}"][data-col="${col}"]`);
 }

 removeRow(t, index, ri) {
  const [row] = t.rows.splice(ri, 1);
  if (t.key === 'nodes') {
   const links = this.model.tables.find(other => other.key === 'links');
   if (links) links.rows = links.rows.filter(link => link.cells[0] !== row.meta.id && link.cells[1] !== row.meta.id);
  }
  this.structure(index);
 }

 structure(index, focus = '') {
  const tables = this.model.tables, rebuild = [index];
  if (tables[index].key === 'nodes') rebuild.push(tables.findIndex(t => t.key === 'links'));
  for (const k of rebuild) {
   if (k < 0) continue;
   const next = this.table(tables[k], k);
   this.form.querySelector(`.dg-table-block[data-index="${k}"]`).replaceWith(next);
   if (k === index && focus) next.querySelector(focus)?.focus();
  }
  this.edited();
 }

 gridKey(event, t, index) {
  const el = event.target;
  if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || el.tagName !== 'INPUT' || el.dataset.row === undefined) return;
  event.preventDefault();
  const row = +el.dataset.row + 1, col = +el.dataset.col;
  if (row >= t.rows.length) this.addRow(t, index, col);
  else el.closest('tbody').querySelector(`[data-row="${row}"][data-col="${col}"]`)?.focus();
 }

 resetEdits() {
  clearTimeout(this.timer);
  this.pending = null;
  this.source = this.original;
  this.render();
  this.setMode(this.mode);
  this.syncReset();
 }

 setHint(text) {
  if (!this.hint) return;
  this.hint.textContent = text;
  this.hint.classList.toggle('is-shown', !!text);
 }

 closeEditor() {
  if (!this.editing) return;
  this.flush();
  this.editing = false;
  this.source = this.good;
  this.frame.classList.remove('is-editing');
  this.setHint('');
  this.tools.querySelector('[data-action="edit"]').setAttribute('aria-label', I18n.t('diagram.edit'));
  const editor = this.editor;
  if (editor.contains(document.activeElement)) document.activeElement.blur();
  if (reducedMotion()) editor.hidden = true;
  else {
   const animation = editor.animate([{ height: `${editor.offsetHeight}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 300, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' });
   animation.finished.then(() => { if (!this.editing) editor.hidden = true; animation.cancel(); }, () => {});
  }
  this.commit(this.original);
 }

 commit(from) {
  if (from === this.good) return;
  this.el.dispatchEvent(new CustomEvent('diagram-edit', { bubbles: true, detail: { from, to: this.good } }));
 }

 rename(event) {
  if (this.live || !this.result || !['flow', 'state'].includes(this.result.dialect)) return;
  const g = event.target.closest('.dg-node');
  const item = g && this.scene.items.get(g.dataset.key);
  const id = item?.spec.fixed.id;
  if (!id || id.startsWith('__') || !this.view) return;
  const v = this.view, input = document.createElement('input');
  input.className = 'dg-rename';
  input.value = this.result.labels.get(id) ?? id;
  const width = Math.max(item.cur.w * v.s + 24, 150);
  input.style.width = `${width}px`;
  input.style.left = `${v.ox + item.cur.x * v.s - width / 2}px`;
  input.style.top = `${v.top + item.cur.y * v.s - 17}px`;
  this.stage.append(input);
  input.focus();
  input.select();
  const before = input.value;
  let done = false;
  const finish = save => {
   if (done) return;
   done = true;
   const value = input.value.trim();
   input.remove();
   if (!save || !value || value === before) return;
   const from = this.good;
   this.source = renameNode(this.good, id, value, this.result.dialect);
   this.render();
   if (this.editing) { this.setMode(this.mode); this.syncReset(); }
   else this.commit(from);
  };
  input.addEventListener('keydown', e => {
   if (e.key === 'Enter') { e.preventDefault(); finish(true); }
   else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
 }

 focusPie(event) {
  const pie = this.result?.pie;
  if (!pie) return;
  const target = event?.target.closest?.('[data-index]');
  const index = target ? +target.dataset.index : pie.top;
  if (index === this.focused) return;
  this.focused = index;
  for (let i = 0; i < pie.count; i++) {
   this.scene.patch(`s:${i}`, { active: i === index });
   this.scene.patch(`r:${i}`, { active: i === index });
  }
  this.scene.patch('c:v', { lines: [pie.value(index)] });
  this.scene.patch('c:l', { lines: [pie.label(index)] });
 }
}

function prewarm() {
 if (warmed) return;
 warmed = true;
 const idle = window.requestIdleCallback || (callback => setTimeout(callback, 60));
 idle(() => {
  for (const sample of WARMUP) {
   const host = document.createElement('div');
   const view = new DiagramView(host, Markdown.TONES);
   view.update(sample, false);
   cancelAnimationFrame(view.scene.raf);
   view.scene.raf = 0;
  }
 }, { timeout: 1500 });
}

const view = (el, tones, onChange, options) => new DiagramView(el, tones, onChange, options);

if (document.readyState === 'complete') prewarm();
else window.addEventListener('load', prewarm, { once: true });

window.Diagram = { view, prewarm, compile: safeCompile, renameNode, editorFor, withHeader };
})();
