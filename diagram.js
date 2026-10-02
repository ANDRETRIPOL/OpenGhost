(() => {
'use strict';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TEXT = { size: 12.5, line: 17, weight: 500 };
const NODE = { padX: 14, padY: 9, maxWidth: 180, minWidth: 52, radius: 8, detail: 15, part: 3 };
const FLOW_GAP = { rank: 48, rankSide: 58, node: 24, label: 12 };
const ARROW = { length: 6.5, half: 3.4 };
const BULGE = 34;
// A rank that holds a group is tall: an arrow passing it runs straight for its whole height.
const TALL = 90;
const SWEEPS = { order: 12, place: 24 };
const SPRING = [170, 24];
// The hover highlight moves on the sidebar's springs, so rows feel the same everywhere.
const GLIDE = { move: [520, 40], fade: [320, 32] };
const STAGGER = { reveal: 220, live: 90, cap: 1600 };
const ENTER = { node: 460, label: 340, fade: 380, line: 620, grow: 600, arc: 860, speed: 0.6, drawMin: 220, drawMax: 600 };
const EXIT = 260;
const PAD = 18;
const PAD_FLUSH = 10;
const MIN_SCALE = 0.55;
// A scheme written left to right keeps that way while it needs no more than a fifth off its size to fit; past that
// it is stood on end.
const SIDE_FIT = 0.8;
const TURN = { fit: 0.8, gain: 0.1 };
// Groups written one under another make a tall narrow tower: past this height, and this much taller than wide, they
// are set side by side instead, when that fits and takes this much less height.
const BESIDE = { tall: 460, ratio: 1.5, gain: 0.72 };
const CLUSTER = { padX: 14, head: 34, padBottom: 14, empty: 22, min: 130, radius: 12 };
const STATUS_HEIGHT = 56;
const PIE = { radius: 56, width: 12, gap: 0.55, legend: 34, row: 26, swatch: 8, max: 7, table: 320, head: 32 };
const CHART = { plot: 208, bar: 22, labeled: 12, dots: 12, max: 1160, head: 30 };
const SEQ = { head: 34, pad: 14, gap: 132, self: 34 };
const CANDLE = { maxWidth: 1000, price: 236, volume: 46, gap: 12, head: 46, body: 0.6, maxBody: 12 };
const TIMELINE = { col: 200, minCol: 140, line: 17 };
const GANTT = { row: 30, section: 28, bar: 8, axis: 28, maxWidth: 1000, label: 230 };
const MIND = { gapX: 46, gapY: 8, branch: 14 };
const QUAD = { max: 480, min: 280 };
const RADAR = { min: 84, max: 132, levels: 4 };
const CARD = { head: 34, stereo: 44, row: 22, padX: 12, min: 140 };
const LEDGER = { max: 720, head: 30, row: 28, noted: 40, bar: 6, pitch: 13 };
const METRICS = { max: 1100, head: 32, min: 124, gap: 28, sizes: [24, 20, 17, 15] };
const FOOD = { max: 720, ring: 44, width: 9, row: 28, meal: 30, split: 64 };
const FACTS = { max: 720, row: 32 };
const CHECK = { mark: 10, gap: 12 };
const OUTLINE = { indent: 22, gap: 8 };
const MATCH = { row: 32, noted: 46 };
const RANGES = { max: 720, head: 30, row: 44, zone: [0.3, 0.7] };
const BOARD = { min: 150, max: 250, gap: 14, pad: 10, head: 32 };
const STEPS = { max: 720, head: 32, mark: 11, gap: 14 };
const SANKEY = { max: 760, node: 8, gap: 14, lane: 46 };
const HEAT = { cell: 14, gap: 3, row: 28, levels: 4 };
const SCATTER = { plot: 300, max: 720 };
const TREE = { max: 720, low: 220, high: 340, gap: 2 };
const GIT = { max: 720, row: 28, lane: 18 };
const CELLS = { max: 720, min: 34, wide: 120, height: 32, gap: 3 };
const BRACKET = { card: 50, gap: 14, min: 124, max: 200 };
const DAY = 86400000;
const EDIT = { debounce: 90 };
const TOOLS = { width: 68, height: 36, gap: 10, reach: 24 };
const COPIED_TIME = 1600;
const NEAR = 22;
const WIDTH_CACHE = 4000;
// How text is set, as [size, weight]. The stylesheet gives the same numbers to the class each one stands for,
// so what is measured here is what gets drawn.
const FONT = {
 title: [13.5, 650], eyebrow: [10.5, 650], tick: [11, 450], value: [11, 600], small: [11.5, 500], legend: [12, 500], amount: [12, 600],
 cardTitle: [12.5, 650], cardSub: [10.5, 500], cardText: [12, 500], cardMeta: [11, 450], cardBadge: [9.5, 650],
 message: [12, 500], note: [12, 450], period: [13, 650], event: [12.5, 450], task: [12.5, 500], point: [12, 500],
 figure: [24, 650], unit: [12.5, 450], center: [20, 650], row: [12.5, 500], strong: [12.5, 650], step: [13, 500], change: [11.5, 600], cell: [12, 400],
 detail: [11.5, 450],
};
// A drawing is laid out in these sizes and shown larger, so that its text keeps company with the text of the chat:
// by as much as the chat's own type is larger than the type the sizes were drawn for.
const TYPE = { base: 14, min: 1, max: 1.3 };
// Small capitals are spaced by this much of their size.
const TRACK = 0.06;
const LAYERS = ['back', 'edges', 'nodes', 'labels', 'front'];
// Series take the slots of the palette in this order, the same in every drawing, so a colour never changes its meaning.
const SERIES = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'];
// A drawing with one thing to colour leads with the colour of the section it stands in, the one its heading wears;
// the rest of the ring follows in the same order.
const SECTION = { blue: 0, orange: 1, turquoise: 2, lilac: 3, yellow: 4, pink: 5, green: 6 };
const tonesOf = el => { const k = SECTION[/\bt-([a-z]+)\b/.exec(el.className)?.[1]] ?? 0; return [...SERIES.slice(k), ...SERIES.slice(0, k)]; };
// Several things side by side take the palette from its start: only that order keeps every pair apart, and a
// second series must not be mistaken for the section's own colour.
const ring = (tones, count) => count > 1 ? SERIES : tones;
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
 'metrics\nA | 12 kg | +1 | 1, 2, 3\nB | 5 | of 10',
 'bars\nA | 3 | n\nB | 2\ntotal',
 'plan\nMon\n A | 1\nTue\n B: b',
 'steps\nA | 1 min\n ! b\nB',
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
let monoFont = '';
let warmed = false;
const widths = new Map();

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fontFamily = () => family ||= getComputedStyle(document.documentElement).getPropertyValue('--font').trim() || 'system-ui, sans-serif';
const monoFamily = () => monoFont ||= getComputedStyle(document.documentElement).getPropertyValue('--mono-font').trim() || 'ui-monospace, monospace';
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

function textWidth(text, size = TEXT.size, weight = TEXT.weight, mono = false) {
 const key = `${weight} ${size}px ${mono ? monoFamily() : fontFamily()}`;
 const cached = widths.get(key + text);
 if (cached !== undefined) return cached;
 if (!measurer) measurer = document.createElement('canvas').getContext('2d');
 measurer.font = key;
 const width = measurer.measureText(text).width;
 if (widths.size > WIDTH_CACHE) widths.clear();
 widths.set(key + text, width);
 return width;
}

const widthOf = (text, font) => textWidth(text, font[0], font[1]);

// The colour of the series that comes at this place: a slot of the palette while there are slots, grey after that.
// A colour is never used twice in one drawing, so two series can't be taken for one.
const slot = (tones, i) => i < tones.length ? tones[i] : 'mute';

// Small capitals for the names of groups and sections: upper case, spaced a little, and measured with the spacing.
const capsWidth = text => widthOf(text, FONT.eyebrow) + text.length * FONT.eyebrow[0] * TRACK;

function caps(text, max = Infinity) {
 let s = String(text).toUpperCase();
 if (capsWidth(s) <= max) return s;
 while (s.length > 1 && capsWidth(`${s.trimEnd()}…`) > max) s = s.slice(0, -1);
 return `${s.trimEnd()}…`;
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

// A number as people write it: 1 850 kcal, $1,200.50, 4,8 кг, −3.1%. Gives its value and what stands before and after it.
const AMOUNT = /^([^\d+\-−–]*?)([+\-−–]?)\s*(\d{1,3}(?:[ \u00a0\u202f,.']\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(.*)$/;

function amount(text) {
 const m = AMOUNT.exec(String(text).trim());
 if (!m || m[1].trim().length > 3) return null;
 let digits = m[3].replace(/[ \u00a0\u202f']/g, '');
 const comma = digits.lastIndexOf(','), dot = digits.lastIndexOf('.');
 if (comma >= 0 && dot >= 0) digits = comma > dot ? digits.replace(/\./g, '').replace(',', '.') : digits.replace(/,/g, '');
 // A comma before three digits parts thousands, 1,250, unless the number opens with a zero: 0,004 is a fraction.
 else if (comma >= 0) digits = /^[1-9]\d{0,2}(,\d{3})+$/.test(digits) ? digits.replace(/,/g, '') : digits.replace(',', '.');
 else if (/^\d{1,3}(\.\d{3}){2,}$/.test(digits)) digits = digits.replace(/\./g, '');
 const value = parseFloat(digits) * (m[2] && m[2] !== '+' ? -1 : 1);
 return Number.isFinite(value) ? { value, before: m[1].trim(), signed: !!m[2], after: m[4].trim() } : null;
}

// The kinds of our own share one way of writing: `title …` and other words on lines without a bar, and rows of
// cells parted by |.
const bare = raw => raw.trim().replace(/^[-*•]\s+/, '');
const cellsOf = line => line.split(/\s*\|\s*/).map(cell => cell.trim());
const indentOf = raw => raw.match(/^\s*/)[0].replace(/\t/g, '  ').length;

// The cells of a row. Bars part them; a row written without bars, as Name: value (note), is read all the same.
function rowCells(line) {
 if (line.includes('|')) return cellsOf(line);
 const m = /^([^:]{1,60}):\s+(.+)$/.exec(line);
 if (!m) return [line];
 const notes = [], value = m[2].replace(/\s*\(([^()]*)\)/g, (_, note) => { notes.push(note.trim()); return ''; }).trim();
 return [m[1].trim(), value, ...notes];
}

// The name a row of a sum goes by when a model writes the sum out itself. The word ends where its letters do: \b
// knows only Latin letters and would not see the end of a Russian word.
const TOTAL_WORD = /^(total|sum|subtotal|result|итого|итог|всего)(?![\p{L}\d])/iu;
// A row is the sum when that word is all of its name, or when the word opens the name and the number beside it is
// the sum indeed: `Total fat` on a food label is a row like any other.
function sumRow(label, value, sum) {
 const m = TOTAL_WORD.exec(label);
 return !!m && (m[0].length === label.replace(/[:.\s]+$/, '').length || (Number.isFinite(value) && sum !== 0 && Math.abs(value - sum) <= Math.abs(sum) * 0.005));
}

// What the line of a sum is called when the model asked for it with the bare word: the word as written, set with
// a capital; but `total` among rows written in Russian is said in Russian, like the rows.
const sumName = (word, lines) => /^total$/i.test(word) && /[а-яё]/i.test(lines.join(' ')) ? 'Итого' : word[0].toUpperCase() + word.slice(1);

// A value with its unit, written the way the numbers of a drawing are: 11 600 ₽, $1 200, 38,4 s, 12%, −4.
const withUnit = (value, before, after) => `${value < 0 ? '−' : ''}${before}${format(Math.abs(value))}${after ? (/^[%°]/.test(after) ? after : ` ${after}`) : ''}`;

// Numbers the way the system writes them, with a true minus: the hyphen it puts before a negative is shorter and
// sits lower than the minus of the changes drawn beside it. Two decimals are enough, except for a fraction of one:
// 0.004 kept to two would read as zero, so it keeps three digits that say something.
const NUMBER = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }), FRACTION = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 3 });
const format = value => (value && Math.abs(value) < 1 ? FRACTION : NUMBER).format(value).replace(/^-/, '−');
// The same true minus for a number kept as it was written.
const minus = text => String(text).replace(/(^|[\s(<>≤≥~≈])-(?=\d)/g, '$1−');

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
  html += `<div class="dg-tip-row${row.cls ? ` ${row.cls}` : ''}${row.tone ? ` t-${row.tone}` : ''}">${row.tone ? `<i class="is-${row.mark || 'dot'}"></i>` : ''}`
   + `<span>${escapeHtml(row.name || '')}</span><b>${escapeHtml(row.value)}</b></div>`;
 }
 return html;
}

// A legend in a row: each entry is a mark the way its series is drawn (a stroke, a block or a dot) and its name.
function chips(entries, x, y, maxWidth) {
 const items = [];
 let cx = x, cy = y;
 entries.forEach((entry, i) => {
  const w = 18 + widthOf(entry.text, FONT.small) + 16;
  if (cx > x && cx + w - 16 > x + maxWidth) { cx = x; cy += 22; }
  items.push({ key: `chip:${i}`, type: 'chip', layer: 'labels', order: 0.2 + i * 0.1, props: { x: cx, y: cy }, fixed: { text: entry.text, tone: entry.tone, mark: entry.mark || 'dot' } });
  cx += w;
 });
 return { items, height: cy - y + 22, width: Math.max(0, ...items.map(item => item.props.x + 18 + widthOf(item.fixed.text, FONT.small))) - x };
}

// The title of a drawing, on its first line; a long one is cut to the room it has.
function titleOf(text, max = Infinity) {
 const shown = truncate(text, max, ...FONT.title);
 return { item: { key: 'title', type: 'label', order: 0, props: { x: 0, y: 10 }, fixed: { lines: [shown], anchor: 'start', cls: 'dg-title-text' } }, width: widthOf(shown, FONT.title) };
}

function niceCeil(value) {
 if (value <= 0) return 1;
 const mag = 10 ** Math.floor(Math.log10(value)), norm = value / mag;
 return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
}

function decimalsFor(step) {
 return clamp(Math.ceil(-Math.log10(step) + 0.001), 0, 8);
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

// Things come in the way a print develops: they clear and settle, and nothing bounces.
function pop(el, a) {
 if (a >= 1) {
  if (el.__pop !== 1) { el.style.opacity = ''; el.style.transform = ''; el.__pop = 1; }
  return;
 }
 el.__pop = a;
 el.style.opacity = Math.min(1, a * 1.6).toFixed(3);
 el.style.transform = `scale(${(0.94 + 0.06 * easeOut(a)).toFixed(4)})`;
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
  if (label !== undefined) { node.label = cleanLabel(label) || ' '; node.shape = shape; node.raw = label; }
  return node;
 };
 return { nodes, edges, touch };
}

// A block may open with what it is and go on with what it does: **Name** and the rest, or Name: and the rest on
// lines of its own. The name is then set strong and the rest quiet under it. `soft` marks a name and the rest
// written on one line: they part only when the line would have to be broken anyway.
const HEADED = new Set(['rect', 'round', 'stadium', 'subroutine', 'cylinder']);

function headed(raw) {
 const text = String(raw || '').trim().replace(/^"([\s\S]*)"$/, '$1').trim(), broken = /<br\s*\/?>|\\n|\n/i;
 let m = /^\*\*([^*]+)\*\*[\s:—–-]*(?:(?:<br\s*\/?>|\\n)\s*)*([\s\S]+)$/i.exec(text);
 if (m) return { head: cleanLabel(m[1]), detail: cleanLabel(m[2]), soft: false };
 m = /^([^:<\\\n*]{2,36}):\s*(?:(?:<br\s*\/?>|\\n)\s*)*(\S[\s\S]*)$/i.exec(text);
 if (!m || /^\/\//.test(m[2]) || /^\d/.test(m[2]) && /\d$/.test(m[1])) return null;
 return { head: cleanLabel(m[1]), detail: cleanLabel(m[2]), soft: !broken.test(text) };
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
 for (const node of graph.nodes.values()) {
  if (!HEADED.has(node.shape)) continue;
  node.parts = headed(node.raw);
  // A name marked with stars is edited with them, in the table and under a double click, so the mark is kept.
  if (node.parts && /^\s*"?\s*\*\*/.test(node.raw)) node.text = `**${node.parts.head}**\n${node.parts.detail}`;
 }
 return { dir: dir === 'TB' ? 'TD' : dir, nodes: [...graph.nodes.values()], edges: graph.edges, groups: [...groups.values()] };
}

// States and the moves between them. A state may hold states of its own, written in braces after its name: it is
// drawn as a group, and the start and the end written inside it are its own.
function parseState(lines) {
 const graph = graphBuilder(), groups = new Map(), stack = [], names = new Map();
 let dir = 'TD', seq = 0, note = false;
 const claim = node => {
  const group = stack[stack.length - 1];
  node.seq ??= seq++;
  if (group && node.group === undefined) node.group = group.id;
  return node.id;
 };
 const ref = (token, side) => {
  if (token !== '[*]') return claim(graph.touch(token));
  const own = stack[stack.length - 1]?.id, end = side === 'to';
  return claim(graph.touch(`__${end ? 'end' : 'start'}${own ? `@${own}` : ''}`, ' ', end ? 'end' : 'start'));
 };
 for (const raw of lines.slice(1)) {
  const opens = /\{\s*$/.test(raw), line = raw.trim().replace(/[{}]\s*$/, '').trim();
  let m;
  // A note may run over several lines, down to `end note`; none of them is a state.
  if (note) { note = !/^end\s+note\b/i.test(line); continue; }
  if (/^note\b/i.test(line)) { note = !line.includes(':'); continue; }
  if (!line) { if (raw.trim() === '}') stack.pop(); continue; }
  if (/^(--|%%|classDef|class|hide|scale)(\s|$)/i.test(line)) continue;
  if ((m = line.match(/^direction\s+(LR|RL|TB|TD|BT)/i))) {
   const way = m[1].toUpperCase() === 'TB' ? 'TD' : m[1].toUpperCase();
   if (stack.length) stack[stack.length - 1].dir = way;
   else dir = way;
   continue;
  }
  if ((m = line.match(/^state\s+"([^"]+)"\s+as\s+([\p{L}\p{N}_]+)/u) || line.match(/^state\s+()([\p{L}\p{N}_]+)(?:\s*<<\s*(\w+)\s*>>)?/u))) {
   const id = m[2], choice = /^choice$/i.test(m[3] || '');
   if (m[1]) names.set(id, m[1]);
   if (opens) {
    const group = { id, title: '', dir: '', parent: stack[stack.length - 1]?.id || '', seq: seq++ };
    groups.set(id, group);
    stack.push(group);
   } else claim(graph.touch(id, m[1] || (choice ? ' ' : undefined), choice ? 'diamond' : 'round'));
   continue;
  }
  if ((m = line.match(/^(\[\*\]|[\p{L}\p{N}_]+)\s*-->\s*(\[\*\]|[\p{L}\p{N}_]+)\s*(?::\s*(.*))?$/u))) {
   graph.edges.push({ from: ref(m[1], 'from'), to: ref(m[2], 'to'), label: cleanLabel(m[3] || ''), style: 'solid', head: 'arrow', both: false });
   continue;
  }
  if ((m = line.match(/^([\p{L}\p{N}_]+)\s*:\s*(.+)$/u))) { claim(graph.touch(m[1], m[2], 'round')); names.set(m[1], m[2]); }
 }
 // A state has only its id for a name, and an id can't hold a space: its underscores are read as spaces.
 for (const node of graph.nodes.values()) {
  if (node.shape === 'rect') node.shape = 'round';
  if (node.label === node.id) node.label = node.id.replace(/_+/g, ' ');
 }
 // A state that holds others is a group, not a block: it goes by the name it was given.
 for (const group of groups.values()) {
  group.title = cleanLabel(names.get(group.id) || group.id.replace(/_+/g, ' '));
  graph.nodes.delete(group.id);
 }
 if (!graph.nodes.size && !groups.size) return null;
 return { dir, nodes: [...graph.nodes.values()], edges: graph.edges, groups: [...groups.values()] };
}

function parseSequence(lines) {
 const actors = new Map(), events = [], stack = [];
 let numbered = false, title = '';
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
  if ((m = line.match(/^title(?:\s*:\s*|\s+)(.+)$/i))) { title = cleanLabel(m[1]); continue; }
  if (/^(activate|deactivate|accTitle|accDescr|create|destroy|link|links|properties|details)\b/i.test(line)) continue;
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
 return actors.size ? { actors: [...actors.values()], events, numbered, title } : null;
}

function parsePie(lines) {
 let title = ((lines[0].match(/\btitle\s+(.+)$/i) || [])[1]) || '';
 let showData = /\bshowData\b/i.test(lines[0]);
 const items = [];
 for (const raw of lines.slice(1)) {
  const line = raw.trim();
  let m;
  if ((m = line.match(/^title(?:\s*:\s*|\s+)(.+)$/i))) { title = m[1]; continue; }
  if (/^showData$/i.test(line)) { showData = true; continue; }
  if ((m = line.match(/^(?:"([^"]*)"|'([^']*)'|([^:]+?))\s*:\s*([-+]?[\d\s.,]+)\s*%?\s*$/))) {
   const value = number(m[4]);
   if (value > 0) items.push({ label: cleanLabel(m[1] ?? m[2] ?? m[3]), value });
  }
 }
 return items.length ? { title: unquote(title), items, showData } : null;
}

// Besides Mermaid's own lines, a chart takes `area` series, `goal "Name" 2200` for a level to reach,
// `zone "Name" 135 --> 160` for a band of values, and `stacked` or `horizontal`, in the header or on a line of their own.
function parseXY(lines) {
 const data = { title: '', labels: null, xTitle: '', yTitle: '', min: null, max: null, series: [], goals: [], zones: [], marks: [], stacked: /\bstacked\b/i.test(lines[0]), horizontal: /\bhorizontal\b/i.test(lines[0]), log: /\blog\b/i.test(lines[0]) };
 const RANGE_OF = /([-\d.]+(?:e[-+]?\d+)?)\s*-->\s*([-\d.]+(?:e[-+]?\d+)?)/i;
 for (const raw of lines.slice(1)) {
  const line = raw.trim();
  let m;
  if ((m = line.match(/^title(?:\s*:\s*|\s+)(.+)$/i))) { data.title = unquote(m[1]); continue; }
  if (/^stacked$/i.test(line)) { data.stacked = true; continue; }
  if (/^horizontal$/i.test(line)) { data.horizontal = true; continue; }
  if (/^log(arithmic)?$/i.test(line)) { data.log = true; continue; }
  if ((m = line.match(/^x-axis\s*(.*)$/i))) {
   const rest = m[1], list = rest.match(/\[(.*)\]/), range = rest.match(RANGE_OF);
   const name = rest.replace(/\[.*\]/, '').replace(RANGE_OF, '').trim();
   if (name) data.xTitle = unquote(name);
   if (list) data.labels = splitList(list[1]).map(unquote);
   else if (range) data.range = [number(range[1]), number(range[2])];
   continue;
  }
  if ((m = line.match(/^y-axis\s*(.*)$/i))) {
   let rest = m[1];
   const range = rest.match(RANGE_OF);
   if (range) { data.min = number(range[1]); data.max = number(range[2]); rest = rest.replace(RANGE_OF, ''); }
   // The word log after the name asks for a scale in powers of ten.
   if (/(?:^|\s)log(?:arithmic)?\s*$/i.test(rest)) { data.log = true; rest = rest.replace(/(?:^|\s)log(?:arithmic)?\s*$/i, ''); }
   if (rest.trim()) data.yTitle = unquote(rest.trim());
   continue;
  }
  if ((m = line.match(/^(?:goal|target|limit)\b\s*(?:"([^"]*)"\s*)?:?\s*([-+]?[\d.]+(?:e[-+]?\d+)?)\s*$/i))) {
   const value = number(m[2]);
   if (Number.isFinite(value)) data.goals.push({ label: cleanLabel(m[1] || ''), value });
   continue;
  }
  // A band lies between two values of the scale, or between two places on the axis below: numbers, dates or labels.
  // Written as x-zone it is a stretch of that axis whatever its numbers look like.
  if ((m = line.match(/^(x-?zone|span|period|zone|band)\b\s*(?:"([^"]*)"\s*)?:?\s*(.+?)\s*(?:-->|->|\.{2,}|–|—|\sto\s)\s*(.+?)\s*$/i))) {
   data.zones.push({ label: cleanLabel(m[2] || ''), a: unquote(m[3]), b: unquote(m[4]), along: !/^(zone|band)$/i.test(m[1]) });
   continue;
  }
  // A mark is one place on the axis below worth pointing at: the day of a release, the step where a run turns.
  if ((m = line.match(/^(?:mark|marker|event)\b\s*(?:"([^"]*)"\s*)?:?\s*(.+?)\s*$/i))) {
   data.marks.push({ label: cleanLabel(m[1] || ''), at: unquote(m[2]) });
   continue;
  }
  if ((m = line.match(/^(bar|line|area)\b\s*(?:"([^"]*)"\s*)?\[(.*)\]\s*$/i))) {
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
  if ((m = line.match(/^title(?:\s*:\s*|\s+)(.+)$/i))) { data.title = unquote(m[1]); continue; }
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
  if ((m = line.match(/^title(?:\s*:\s*|\s+)(.+)$/i))) { data.title = unquote(m[1]); continue; }
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
  if ((m = line.match(/^title(?:\s*:\s*|\s+)(.+)$/i))) { data.title = unquote(m[1]); continue; }
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
  if ((m = line.match(/^title(?:\s*:\s*|\s+)(.+)$/i))) { data.title = unquote(m[1]); continue; }
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
  if ((m = line.match(/^title(?:\s*:\s*|\s+)(.+)$/i))) { data.title = unquote(m[1]); continue; }
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
 const leadW = Math.max(0, ...rows.map(r => r.lead ? (r.badge ? widthOf(r.lead, FONT.cardBadge) + r.lead.length * 0.4 : textWidth(r.lead, ...FONT.cardMeta, true)) + 8 : 0));
 const textW = Math.max(0, ...rows.map(r => widthOf(r.text, FONT.cardText)));
 const metaW = Math.max(0, ...rows.map(r => r.meta ? textWidth(r.meta, ...FONT.cardMeta, true) : 0));
 const titleW = Math.max(widthOf(title, FONT.cardTitle), sub ? widthOf(sub, FONT.cardSub) : 0);
 const w = Math.ceil(Math.max(CARD.min, titleW + 36, CARD.padX * 2 + leadW + textW + (metaW ? metaW + 22 : 0)));
 const head = sub ? CARD.stereo : CARD.head;
 const split = sep > 0 && sep < rows.length;
 const h = head + (rows.length ? 9 + rows.length * CARD.row + (split ? 9 : 0) : 0);
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
   if (a) open.attrs.push({ ...typedPair(a[1].replace(/~/g, ''), a[2]), keys: (a[3] || '').replace(/\s/g, '').toUpperCase() });
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

// A field written as two words is a type and a name, in either order: the word that looks more like a type is the type,
// and when neither does, the type comes first, as Mermaid has it.
const PRIMITIVE = /^(?:int|integer|bigint|long|short|float|double|number|decimal|numeric|bool|boolean|string|str|text|varchar|char|byte|bytes|void|any|object|json|date|datetime|timestamp|time|uuid|list|array|map|set|dict|enum)(?:\(\d+(?:,\d+)?\))?(?:\[\])?$/i;
const TYPE_SHAPE = /^(?:[A-Z][\w.]*(?:<.*>)?(?:\[\])?|\w+<.*>|\w+\[\])$/;

function typedPair(first, last) {
 const kind = word => PRIMITIVE.test(word) ? 2 : TYPE_SHAPE.test(word) ? 1 : 0;
 return kind(last) > kind(first) ? { name: first, type: last } : { name: last, type: first };
}

function memberRow(text) {
 let s = text.trim().replace(/[$*]$/, '').replace(/~([^~]+)~/g, '<$1>');
 const vis = /^[+\-#~]/.test(s) ? s[0] : '';
 if (vis) s = s.slice(1).trim();
 if (s.includes('(')) {
  const close = s.lastIndexOf(')');
  return { lead: vis, text: s.slice(0, close + 1), meta: s.slice(close + 1).replace(/^[$*]?\s*:?\s*/, '') };
 }
 if (s.includes(':')) { const [name, ...type] = s.split(':'); return { lead: vis, text: name.trim(), meta: type.join(':').trim() }; }
 const words = s.split(/\s+/);
 if (words.length < 2) return { lead: vis, text: s, meta: '' };
 const pair = typedPair(words.slice(0, -1).join(' '), words[words.length - 1]);
 return { lead: vis, text: pair.name, meta: pair.type };
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
   // How many stand at each end is told with the caption, in the order the line is drawn: 1 : *.
   const count = [flip ? m[4] : m[2], flip ? m[2] : m[4]].filter(Boolean).join(' : ');
   edges.push({ from: (flip ? b : a).id, to: (flip ? a : b).id, label: [cleanLabel(m[6] || ''), count].filter(Boolean).join(' · '), style, head: 'none', both: false, ends: flip ? { start: end, end: null } : { start, end } });
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
 if (node.shape === 'start' || node.shape === 'end') { node.lines = []; node.w = node.h = 16; return; }
 node.head = 0;
 const parts = node.parts && (!node.parts.soft || textWidth(node.label) > NODE.maxWidth) ? node.parts : null;
 if (parts) {
  // The name of the block, strong, and under it what it does, set smaller and quiet.
  const head = wrap(parts.head, NODE.maxWidth, ...FONT.strong), detail = wrap(parts.detail, NODE.maxWidth, ...FONT.detail);
  node.lines = [...head, ...detail];
  node.head = head.length;
  const tw = Math.max(...head.map(line => widthOf(line, FONT.strong)), ...detail.map(line => widthOf(line, FONT.detail)));
  node.w = Math.ceil(Math.max(NODE.minWidth, tw + NODE.padX * 2) + (node.shape === 'subroutine' ? 12 : 0));
  node.h = Math.ceil(head.length * TEXT.line + NODE.part + detail.length * NODE.detail + NODE.padY * 2 + (node.shape === 'cylinder' ? 12 : 0));
  return;
 }
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
 // What an arrow says is measured before the blocks are placed. An arrow back over several ranks carries it on
 // its lane, in the rank at the middle of its way, and the lane keeps room for it there.
 for (const link of links) {
  if (!link.label) continue;
  const lines = wrap(link.label, 140, ...FONT.small);
  link.labelLines = lines;
  link.labelW = Math.max(...lines.map(line => widthOf(line, FONT.small))) + 14;
  link.labelH = lines.length * 15 + 6;
  if (!link.back || link.chain.length < 3) continue;
  link.seat = link.chain[Math.floor(link.chain.length / 2)];
  link.seat.cross = Math.max(link.seat.cross, (side ? link.labelH : link.labelW) + 4);
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
 // A block lines up with the blocks it is joined to, not with the bends of an arrow that runs back past it, and
 // where the two want one place the block has it. So a chain keeps a straight spine, and an arrow back to its
 // start runs down its side.
 const solid = (v, near) => { const kept = v.dummy ? near : near.filter(w => !w.dummy || !w.link.back); return kept.length ? kept : near; };
 for (let sweep = 0; sweep < SWEEPS.place; sweep++) {
  const down = sweep % 2 === 0, last = sweep === SWEEPS.place - 1;
  for (let k = 0; k < depth; k++) {
   const layer = layers[down ? k : depth - 1 - k];
   const want = layer.map(v => {
    const near = solid(v, last ? [...v.up, ...v.down] : down ? (v.up.length ? v.up : v.down) : (v.down.length ? v.down : v.up));
    return near.length ? near.reduce((sum, w) => sum + w.x, 0) / near.length : v.x;
   });
   isotonic(layer, want, layer.map(v => v.dummy ? (v.link.back ? 0.001 : 3) : 1), FLOW_GAP.node);
  }
 }

 const labelRoom = new Array(depth).fill(0);
 for (const link of links) {
  if (!link.label || link.seat) continue;
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
  // An arrow back over several ranks runs in a lane beside the blocks. Where the lane lies clear of a block, the
  // arrow leaves it, or comes into it, by the side that faces the lane, away from the arrows that go forward.
  const lane = link.back && chain.length > 2, facing = (v, w) => lane && Math.abs(w.x - v.x) >= v.cross / 2 + 12 ? Math.sign(w.x - v.x) : 0;
  const out = facing(first, chain[1]), into = facing(last, chain[chain.length - 2]);
  return {
   link, chain, out, into,
   start: out ? { x: first.x + out * first.cross / 2, y: first.y } : portFor(first, sign, chain[1]),
   end: into ? { x: last.x + into * last.cross / 2, y: last.y } : portFor(last, -sign, chain[chain.length - 2]),
  };
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
 for (const { link, chain, start, end, out, into } of routes) {
  // Past a tall rank an arrow runs straight for the whole height of it, so its bends fall between the ranks and
  // never across what stands in them. `spans` tells which points belong to each stop of the way.
  const way = Math.sign(chain[chain.length - 1].y - chain[0].y) || 1, spans = [[0, 0]], points = [[start.x, start.y]];
  for (const v of chain.slice(1, -1)) {
   const half = size[v.rank] > TALL ? size[v.rank] / 2 : 0;
   spans.push([points.length, points.length + (half ? 1 : 0)]);
   if (half) points.push([v.x, v.y - way * half], [v.x, v.y + way * half]);
   else points.push([v.x, v.y]);
  }
  spans.push([points.length, points.length]);
  points.push([end.x, end.y]);
  let bulge = null, corner = false;
  if (link.back && chain.length === 2 && twins.has(`${link.v}:${link.u}`)) {
   const edgeX = v => ['diamond', 'circle', 'start', 'end'].includes(v.node.shape) ? v.x : v.x + v.cross / 2 - 12;
   points[0][0] = edgeX(chain[0]);
   points[1][0] = edgeX(chain[1]);
   // A question sends its way back from its own corner, not from the point the way to it comes in at.
   corner = chain[0].node.shape === 'diamond';
   if (corner) points[0] = [chain[0].x + chain[0].cross / 2, chain[0].y];
   bulge = [Math.max(points[0][0], points[1][0]) + BULGE, (points[0][1] + points[1][1]) / 2];
   if (corner) bulge[1] = (chain[0].y + points[1][1]) / 2;
   points.splice(1, 0, bulge);
   maxX = Math.max(maxX, bulge[0] + (side ? link.labelH || 0 : link.labelW || 0) - 4);
  }
  const tail = points[points.length - 1], before = points[points.length - 2];
  const sign = Math.sign(tail[1] - before[1]) || 1;
  if (link.head !== 'none') { if (into) tail[0] += into * ARROW.length; else tail[1] -= sign * ARROW.length; }
  const head0 = points[0], startSign = Math.sign(points[1][1] - head0[1]) || 1;
  if (link.both && link.head !== 'none' && !corner) { if (out) head0[0] += out * ARROW.length; else head0[1] += startSign * ARROW.length; }
  const pts = [];
  for (let i = 0; i < points.length; i++) {
   const [x, y] = map(...points[i]);
   if (!i) { pts.push(x, y); continue; }
   const [px, py] = points[i - 1], [qx, qy] = points[i], mid = (qy - py) / 2;
   // Out of the corner of a question, or out of the side of a block, the way leaves sideways and turns to run
   // beside the blocks; into the side of a block it turns the other way round.
   if ((corner || out) && i === 1) { pts.push(...map(qx, py), ...map(qx, py), x, y); continue; }
   if (into && i === points.length - 1) { pts.push(...map(px, qy), ...map(px, qy), x, y); continue; }
   pts.push(...map(px, py + mid), ...map(qx, qy - mid), x, y);
  }
  const segment = Math.floor((chain.length - 2) / 2), a = points[spans[segment][1]], b = points[spans[segment + 1][0]];
  result.push({
   ...link,
   from: nodes[link.u],
   to: nodes[link.v],
   pts,
   labelAt: bulge ? map(bulge[0] + (side ? link.labelH || 0 : link.labelW || 0) / 2 - 8, bulge[1]) : link.seat ? map(link.seat.x, link.seat.y) : map((a[0] + b[0]) / 2, (a[1] + b[1]) / 2),
   bulged: !!bulge,
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

// Blocks joined each to the next, and the last back to the first, are a cycle and are drawn as one: two rows, or
// two columns, with the arrows running round. `rows` lays it out along the line of reading; the way in then falls
// on the first block and the way round reads from it.
function layoutRing(nodes, edges, rows, first) {
 const n = nodes.length;
 if (n < 3 || n > 10 || edges.length !== n || nodes.some(node => node.cluster || node.card || node.shape === 'start' || node.shape === 'end')) return null;
 const next = new Map(), byId = new Map(nodes.map(node => [node.id, node]));
 for (const e of edges) {
  if (e.lift || e.style === 'hidden' || e.from === e.to || next.has(e.from) || !byId.has(e.from) || !byId.has(e.to)) return null;
  next.set(e.from, e);
 }
 const loop = [];
 for (let at = byId.has(first) ? first : nodes[0].id, k = 0; k < n; k++) {
  const e = next.get(at);
  if (!e || loop.some(step => step.node.id === at)) return null;
  loop.push({ node: byId.get(at), edge: e });
  at = e.to;
 }
 if (loop[n - 1].edge.to !== loop[0].node.id) return null;
 // Along the row a block takes its width, across it its height; turned to columns, the other way round.
 const a = node => rows ? node.w : node.h, c = node => rows ? node.h : node.w, k = Math.ceil(n / 2);
 const slotOf = i => i < k ? i : 2 * k - 1 - i, rowOf = i => i < k ? 0 : 1;
 for (const step of loop) {
  const lines = step.edge.label ? wrap(step.edge.label, 140, ...FONT.small) : null;
  step.lines = lines;
  step.lw = lines ? Math.max(...lines.map(line => widthOf(line, FONT.small))) + 14 : 0;
  step.lh = lines ? lines.length * 15 + 6 : 0;
 }
 // An arrow runs along a row between neighbours, and across between the two rows at their ends.
 const runs = i => rowOf(i) === rowOf((i + 1) % n) && (i + 1) % n !== 0;
 const need = (along, base) => Math.max(base, ...loop.map((step, i) => step.lines && runs(i) === along ? (along === rows ? step.lw : step.lh) + 24 : 0));
 const gapA = need(true, rows ? FLOW_GAP.rankSide : FLOW_GAP.rank), gapC = need(false, rows ? FLOW_GAP.rank : FLOW_GAP.rankSide);
 const size = Array.from({ length: k }, (_, s) => Math.max(...loop.filter((_, i) => slotOf(i) === s).map(step => a(step.node))));
 const at = [];
 size.reduce((sum, w, s) => { at[s] = sum + w / 2; return sum + w + gapA; }, 0);
 const c0 = Math.max(...loop.slice(0, k).map(step => c(step.node))), c1 = Math.max(...loop.slice(k).map(step => c(step.node)));
 const cross = [c0 / 2, c0 + gapC + c1 / 2];
 loop.forEach((step, i) => { step.a = at[slotOf(i)]; step.c = cross[rowOf(i)]; });
 const xy = (pa, pc) => rows ? [pa, pc] : [pc, pa];
 const result = loop.map((step, i) => {
  const to = loop[(i + 1) % n], e = step.edge, cut = e.head !== 'none' ? ARROW.length : 0, lead = e.both && cut ? cut : 0;
  let pts, mid;
  if (runs(i)) {
   const s = Math.sign(to.a - step.a), p = [step.a + s * a(step.node) / 2 + s * lead, step.c], q = [to.a - s * a(to.node) / 2 - s * cut, to.c];
   pts = [...xy(...p), ...straight(...xy(...p), ...xy(...q))];
   mid = xy((p[0] + q[0]) / 2, p[1]);
  } else if (slotOf(i) === slotOf((i + 1) % n)) {
   const s = Math.sign(to.c - step.c), p = [step.a, step.c + s * c(step.node) / 2 + s * lead], q = [to.a, to.c - s * c(to.node) / 2 - s * cut];
   pts = [...xy(...p), ...straight(...xy(...p), ...xy(...q))];
   mid = xy(p[0], (p[1] + q[1]) / 2);
  } else {
   // An odd cycle closes round a corner: out of the side of the last block, and up into the first.
   const p = [step.a - a(step.node) / 2 - lead, step.c], q = [to.a, to.c + c(to.node) / 2 + cut], r = Math.min(14, (p[0] - q[0]) / 2, (p[1] - q[1]) / 2);
   const corner = xy(q[0], p[1]), before = xy(q[0] + r, p[1]), after = xy(q[0], p[1] - r);
   pts = [...xy(...p), ...straight(...xy(...p), ...before), ...corner, ...corner, ...after, ...straight(...after, ...xy(...q))];
   mid = xy(q[0], (p[1] - r + q[1]) / 2);
  }
  return { ...e, from: step.node, to: to.node, pts, labelAt: mid, labelLines: step.lines, labelW: step.lw, labelH: step.lh, bulged: false };
 });
 const along = at[k - 1] + size[k - 1] / 2, across = c0 + gapC + c1;
 // A caption on an arrow at the edge of the cycle may reach past the blocks: the drawing makes room for it.
 let x0 = 0, y0 = 0, x1 = rows ? along : across, y1 = rows ? across : along;
 for (const e of result) {
  if (!e.labelLines) continue;
  x0 = Math.min(x0, e.labelAt[0] - e.labelW / 2);
  x1 = Math.max(x1, e.labelAt[0] + e.labelW / 2);
  y0 = Math.min(y0, e.labelAt[1] - e.labelH / 2);
  y1 = Math.max(y1, e.labelAt[1] + e.labelH / 2);
 }
 return {
  places: loop.map((step, i) => { const [cx, cy] = xy(step.a, step.c); return { node: step.node, cx: cx - x0, cy: cy - y0, rank: i, order: 0 }; }),
  edges: result.map(e => ({ ...e, pts: shiftPts(e.pts, -x0, -y0), labelAt: [e.labelAt[0] - x0, e.labelAt[1] - y0] })),
  width: x1 - x0,
  height: y1 - y0,
  hints: new Map(loop.map(step => [step.node.id, step.c])),
 };
}

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

function layoutGraph(graph, dir, hints, room, pack = false, inner = '') {
 const lying = way => way === 'LR' || way === 'RL';
 // A scheme that is one cycle reads round in the direction it was written; rows too wide for the room give way to
 // columns.
 const wheel = (nodes, edges, way) => {
  const rows = layoutRing(nodes, edges, lying(way));
  return rows && lying(way) && rows.width > room ? layoutRing(nodes, edges, false) : rows;
 };
 if (!graph.groups?.length) {
  const round = wheel(graph.nodes, graph.edges, dir);
  if (round) return round;
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
 // The blocks an arrow comes into from another group, in the order written.
 const entered = lifted.map(({ edge }) => edge.to);

 const lay = (level, levelDir, budget) => {
  for (const kid of level.kids) {
   // `inner` is the way the groups of the scheme run inside when the scheme itself is laid another way.
   kid.layout = lay(kid, kid.dir || (level === root && inner) || levelDir, Math.max(CLUSTER.min, budget - CLUSTER.padX * 2));
   const titleW = kid.title ? capsWidth(kid.title.toUpperCase()) + CLUSTER.padX * 2 : 0;
   kid.w = Math.ceil(Math.max(CLUSTER.min, kid.layout.width + CLUSTER.padX * 2, Math.min(titleW, budget)));
   kid.h = Math.ceil(CLUSTER.head + (kid.layout.height ? kid.layout.height + CLUSTER.padBottom : CLUSTER.empty));
   kid.node = { id: kid.id, label: kid.title, shape: 'cluster', lines: [], w: kid.w, h: kid.h, cluster: kid, seq: kid.seq };
  }
  const members = [...level.nodes, ...level.kids.map(k => k.node)].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  level.used = levelDir;
  if (!members.length) return EMPTY_LAYOUT;
  // A group that is one cycle stands across the way the scheme runs, so the arrow that comes into it meets its
  // first block and the arrow out of it leaves from the far side.
  const round = level === root ? wheel(members, level.edges, levelDir) : layoutRing(members, level.edges, !lying(levelDir), entered.find(id => members.some(node => node.id === id)));
  if (round) return round;
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
 // Groups set side by side stand on one line at the top, like the columns of a table, unless an arrow drawn to a
 // group as a whole would be left behind by the move.
 if (inner && lying(dir)) {
  const held = id => top.edges.some(e => !e.lift && e.style !== 'hidden' && (e.from.id === id || e.to.id === id));
  const kids = top.places.filter(p => p.node.cluster);
  if (kids.length > 1 && !kids.some(p => held(p.node.id))) {
   const head = Math.min(...kids.map(p => p.cy - p.node.h / 2));
   for (const p of kids) p.cy = head + p.node.h / 2;
  }
 }

 const places = [], edges = [], clusters = [], boxes = new Map(), routes = new Map(), merged = new Map(), across = dir === 'LR' || dir === 'RL';
 const put = (level, ox, oy, depth) => {
  for (const [k, v] of level.layout.hints) merged.set(k, v);
  for (const p of level.layout.places) {
   const cx = ox + p.cx, cy = oy + p.cy, n = p.node;
   boxes.set(n.id, { x: cx - n.w / 2, y: cy - n.h / 2, w: n.w, h: n.h });
   if (!n.cluster) { places.push({ node: n, cx, cy, rank: (across ? cx : cy) / 110, order: (across ? cy : cx) / 400 }); continue; }
   const k = n.cluster, x = cx - k.w / 2, y = cy - k.h / 2;
   clusters.push({ id: k.id, title: caps(k.title, k.w - CLUSTER.padX * 2), x, y, w: k.w, h: k.h, depth, rank: (across ? x : y) / 110 });
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
  // The bends of the way between the two groups are kept, but not the bow a pair of opposite arrows is given:
  // these arrows start from their own blocks and seldom share a path.
  if (route && !route.bulged) for (let i = 6; i < route.pts.length - 2; i += 6) inner.push([route.pts[i], route.pts[i + 1]]);
  // Between a block and the edge of its group an arrow runs straight, unless other blocks stand in the way: then it
  // swings into the nearest free lane, or along the edge of the group, so it is never read as coming from them.
  const across = box => side ? [box.y, box.y + box.h] : [box.x, box.x + box.w];
  const within = (box, outer) => box !== outer && box.x >= outer.x && box.y >= outer.y && box.x + box.w <= outer.x + outer.w && box.y + box.h <= outer.y + outer.h;
  const lane = (own, group, dir) => {
   const from = at(own, dir), to = at(group, dir), want = mid(own);
   const ahead = [...boxes.values()].filter(box => box !== own && within(box, group) && !within(own, box) && (dir > 0 ? lo(box)[0] >= from - 1 && lo(box)[0] < to : lo(box)[1] <= from + 1 && lo(box)[1] > to));
   const free = cross => !ahead.some(box => cross > across(box)[0] - 6 && cross < across(box)[1] + 6);
   if (free(want)) return null;
   const [g0, g1] = across(group);
   // A lane across the band where the group's name stands is taken only when there is no other.
   const head = side ? group.y + CLUSTER.head + 10 : -Infinity;
   const lanes = [...ahead.flatMap(box => [across(box)[0] - 10, across(box)[1] + 10]), g0 + 7, g1 - 7].filter(cross => cross >= g0 + 6 && cross <= g1 - 6 && free(cross));
   const options = lanes.some(cross => cross > head) ? lanes.filter(cross => cross > head) : lanes;
   if (!options.length) return null;
   const near = dir > 0 ? Math.min(...ahead.map(box => lo(box)[0])) : Math.max(...ahead.map(box => lo(box)[1]));
   return { cross: options.reduce((best, cross) => Math.abs(cross - want) < Math.abs(best - want) ? cross : best), turn: near - dir * 8 };
  };
  const out = a !== A ? lane(a, A, s) : null, into = b !== B ? lane(b, B, -s) : null;
  // An arrow that comes down into a group through the line of its name would cross the name: it stops at the
  // edge of the group instead, and reads as coming into the group, whose first block stands right under it.
  const name = !side && s > 0 && b !== B && !into ? groups.get(rv)?.title : '';
  const stop = !!name && Math.abs(mid(b) - (B.x + CLUSTER.padX + capsWidth(caps(name, B.w - CLUSTER.padX * 2)) / 2)) < capsWidth(caps(name, B.w - CLUSTER.padX * 2)) / 2 + 6;
  // The way as points; `flat` marks one that is reached in a straight line rather than a bend.
  const way = [{ p: point(mid(a), at(a, s)) }];
  if (out) way.push({ p: point(out.cross, out.turn) }, { p: point(out.cross, at(A, s)), flat: true });
  else if (a !== A) way.push({ p: point(mid(a), at(A, s)), flat: true });
  for (const p of inner) way.push({ p });
  if (into) way.push({ p: point(into.cross, at(B, -s)) }, { p: point(into.cross, into.turn), flat: true });
  else if (b !== B && !stop) way.push({ p: point(mid(b), at(B, -s)) });
  const end = stop ? point(mid(b), at(B, -s)) : point(mid(b), at(b, -s));
  if (edge.head !== 'none') end[M] -= s * ARROW.length;
  if (edge.both && edge.head !== 'none') way[0].p[M] += s * ARROW.length;
  way.push({ p: end, flat: b !== B && !into && !stop });
  const pts = [...way[0].p];
  let label = null, longest = -1;
  for (let i = 1; i < way.length; i++) {
   const p = way[i - 1].p, q = way[i].p, flat = !!way[i].flat;
   pts.push(...(flat ? straight(p[0], p[1], q[0], q[1]) : sCurve(p, q, side)));
   const span = Math.hypot(q[0] - p[0], q[1] - p[1]) - (flat ? 1e4 : 0);
   if (span > longest) { longest = span; label = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; }
  }
  const lines = edge.label ? wrap(edge.label, 140, ...FONT.small) : null;
  edges.push({
   ...edge, from: { id: edge.from }, to: { id: edge.to }, pts, labelAt: label,
   labelLines: lines, labelW: lines ? Math.max(...lines.map(line => widthOf(line, FONT.small))) + 14 : 0, labelH: lines ? lines.length * 15 + 6 : 0,
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
 // A scheme stood on end lies down again the way it was written once the room takes it whole, at full size: a
 // window made wider, or a saved chat that was first measured narrow. Between that and the width that stood it up
 // it stays as it is, so it does not flip at every small change.
 if (turned) {
  const lying = layoutGraph(graph, graph.dir, hints, room);
  if (lying.width <= room) { layout = lying; turned = false; }
 }
 if (turned && layout.width > room) {
  const packed = layoutGraph(graph, alt, hints, room, true), back = layoutGraph(graph, graph.dir, hints, room, true);
  if (packed.width < layout.width) layout = packed;
  if (Math.min(1, room / back.width) > Math.min(1, room / layout.width) + TURN.gain) { layout = back; turned = false; }
 }
 if (side && !turned && layout.width * SIDE_FIT > room) {
  const down = layoutGraph(graph, 'TD', hints, room);
  if (Math.min(1, room / down.width) > room / layout.width + 0.05) { layout = down; turned = true; }
 }
 // Groups that stand in one tall narrow tower are set side by side, each still running down inside: the drawing
 // takes the width it has instead of a long scroll, and the arrows between the groups keep clear of their names.
 let beside = false;
 if (!side && !turned && (graph.groups || []).filter(group => !group.parent).length > 1 && (sideways === 'beside' || (layout.height > BESIDE.tall && layout.height > layout.width * BESIDE.ratio))) {
  const columns = layoutGraph(graph, 'LR', hints, room, false, 'TD');
  if (columns.width * SIDE_FIT <= room && (sideways === 'beside' || columns.height < layout.height * BESIDE.gain)) { layout = columns; beside = true; }
 }
 if (!beside && layout.width > room) {
  const packed = layoutGraph(graph, turned ? alt : graph.dir, hints, room, true);
  if (packed.width < layout.width) layout = packed;
 }
 if (!side && !turned && !beside && layout.width * TURN.fit > room) {
  const across = layoutGraph(graph, alt, hints, room, true);
  if (Math.min(1, room / across.width) > room / layout.width + TURN.gain) { layout = across; turned = true; }
 }
 const accent = tones[0], items = [], rank = new Map(), labels = new Map();
 // A scheme may carry a title, given in the block Mermaid opens a diagram with: it stands over the drawing.
 let dy = 0, corner = null, titleW = 0;
 if (graph.title) {
  const title = titleOf(graph.title, Math.max(240, room - 80));
  items.push(title.item);
  titleW = title.width;
  dy = CHART.head + 6;
  corner = { x: title.width + 16, h: 28 };
 }
 for (const c of layout.clusters || []) {
  rank.set(c.id, c.rank);
  items.push({
   key: `g:${c.id}`, type: 'cluster', order: c.rank - 0.3 + c.depth * 0.1,
   props: { x: c.x, y: c.y + dy, w: c.w, h: c.h },
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
  labels.set(node.id, node.text ?? node.label);
  items.push({
   key: `n:${node.id}`, type: 'node', order: place.rank + place.order * 0.25,
   props: { x: place.cx, y: place.cy + dy, w: node.w, h: node.h },
   fixed: { shape: node.shape, lines: node.lines, head: node.head || 0, tone: accent, id: node.id, key: pseudo || keys.has(node.id), card: node.card || null, cardKey: node.card?.key || '' },
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
   props: { pts: dy ? shiftPts(edge.pts, 0, dy) : edge.pts },
   fixed: { style: edge.style, head: edge.head, both: edge.both, ends: edge.ends || null, tone: accent, a: edge.from.id, b: edge.to.id },
  });
  if (edge.label) {
   items.push({
    key: `l:${key}`, type: 'label', order: order + 0.3,
    props: { x: edge.labelAt[0], y: edge.labelAt[1] + dy },
    fixed: { lines: edge.labelLines, pill: true, w: edge.labelW, h: edge.labelH, lineHeight: 15, cls: 'dg-edge-label', pop: true },
   });
  }
 }
 return { kind: 'flow', dialect, width: Math.max(layout.width, titleW), height: layout.height + dy, items, hints: layout.hints, sideways: beside ? 'beside' : turned ? graph.dir : false, labels, edges: true, corner };
}

function sequenceScene(data, tones) {
 if (!data) return null;
 const actors = data.actors;
 actors.forEach((a, i) => {
  a.index = i;
  a.tone = tones[0];
  a.w = Math.max(84, Math.ceil(textWidth(a.label)) + 28);
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
   e.lines = wrap(e.text, 260, ...FONT.message);
   e.width = Math.max(0, ...e.lines.map(line => widthOf(line, FONT.message))) + (data.numbered ? 56 : 34);
   need(e.from.index, e.to.index, e.width);
  } else if (e.type === 'note') {
   e.lines = wrap(e.text, 210, ...FONT.note);
   e.width = Math.max(...e.lines.map(line => widthOf(line, FONT.note))) + 22;
   if (e.actors.length > 1) need(e.actors[0].index, e.actors[e.actors.length - 1].index, e.width - 40);
  }
 }
 let x = SEQ.pad + actors[0].w / 2;
 actors.forEach((a, i) => { a.x = x; x += gaps[i] || 0; });
 const right = actors[n - 1].x + actors[n - 1].w / 2 + SEQ.pad;
 // A title stands over the people of the exchange.
 const top = data.title ? CHART.head + 6 : 0;
 let y = top + SEQ.head + 20, number = 0, row = 0;
 for (const e of data.events) {
  e.row = row++;
  if (e.type === 'message') {
   e.y = y + e.lines.length * 15 + 5;
   e.number = data.numbered ? ++number : 0;
   y = e.y + (e.from === e.to ? SEQ.self + 14 : 18);
  } else if (e.type === 'note') {
   e.h = e.lines.length * 16 + 12;
   const xs = e.actors.map(a => a.x);
   if (e.side === 'over') {
    e.w = e.actors.length > 1 ? Math.max(...xs) - Math.min(...xs) + 60 : Math.max(e.width, 90);
    e.x = e.actors.length > 1 ? Math.min(...xs) - 30 : xs[0] - e.w / 2;
   } else if (e.side === 'right of') { e.x = xs[0] + 12; e.w = e.width; }
   else { e.x = xs[0] - 12 - e.width; e.w = e.width; }
   e.y = y;
   y += e.h + 12;
  } else if (e.type === 'open') { e.frame.top = y; y += 28; }
  else if (e.type === 'divide') { e.y = y; y += 26; }
  else if (e.type === 'close') { e.frame.bottom = y; y += 12; }
 }
 const bottom = y + 6;
 const notes = data.events.filter(e => e.type === 'note');
 const minX = Math.min(0, ...notes.map(e => e.x - 4)), maxX = Math.max(right, ...notes.map(e => e.x + e.w + 4));
 const sx = v => v - minX;
 const items = [];
 let corner = null, titleW = 0;
 if (data.title) {
  const title = titleOf(data.title, Math.max(240, maxX - minX - 80));
  items.push(title.item);
  titleW = title.width;
  corner = { x: title.width + 16, h: 28 };
 }
 actors.forEach((a, i) => {
  items.push({ key: `a:${a.id}`, type: 'node', order: i * 0.3, props: { x: sx(a.x), y: top + SEQ.head / 2, w: a.w, h: SEQ.head }, fixed: { shape: 'actor', lines: [a.label], tone: a.tone, id: a.id } });
  items.push({ key: `life:${a.id}`, type: 'line', layer: 'back', order: i * 0.3 + 0.4, props: { x1: sx(a.x), y1: top + SEQ.head, x2: sx(a.x), y2: bottom }, fixed: { cls: 'dg-life', tone: a.tone, draw: true } });
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
    props: { x: self ? x1 + SEQ.self + 8 : (x1 + x2) / 2, y: e.y - 7 },
    fixed: { lines: e.lines, anchor: self ? 'start' : 'middle', baseline: 'above', lineHeight: 15, cls: 'dg-message-label' },
   });
   if (e.number) items.push({ key: `mb:${k}`, type: 'badge', order, props: { x: x1 + dir * 14, y: e.y }, fixed: { n: e.number, tone: e.from.tone } });
  } else if (e.type === 'note') {
   items.push({ key: `note:${note++}`, type: 'note', order, props: { x: sx(e.x), y: e.y, w: e.w, h: e.h }, fixed: { lines: e.lines } });
  } else if (e.type === 'open') {
   const fr = e.frame, inset = 8 + fr.depth * 8;
   fr.key = `f:${e.row}`;
   fr.x = sx(inset);
   fr.w = right - inset * 2;
   items.push({ key: fr.key, type: 'frame', order, props: { x: fr.x, y: fr.top, w: fr.w, h: Math.max(20, (fr.bottom ?? bottom) - fr.top) }, fixed: { kind: fr.kind.toUpperCase(), label: fr.label } });
  } else if (e.type === 'divide') {
   const fr = e.frame, k = divider++;
   items.push({ key: `d:${k}`, type: 'line', layer: 'back', order, props: { x1: fr.x, y1: e.y, x2: fr.x + fr.w, y2: e.y }, fixed: { cls: 'dg-divider' } });
   if (e.label) items.push({ key: `dl:${k}`, type: 'label', layer: 'back', order, props: { x: fr.x + 10, y: e.y + 13 }, fixed: { lines: [e.label], anchor: 'start', cls: 'dg-frame-label' } });
  }
 }
 return { kind: 'sequence', width: Math.max(maxX - minX, titleW), height: bottom, items, corner };
}

function pieScene(data, tones, { width }) {
 if (!data) return null;
 // Past seven slices the smallest fold into one: more colours than that stop telling slices apart.
 let entries = data.items;
 if (entries.length > PIE.max) {
  const kept = new Set([...entries].sort((a, b) => b.value - a.value).slice(0, PIE.max - 1));
  const rest = entries.filter(item => !kept.has(item));
  entries = [...entries.filter(item => kept.has(item)), { label: I18n.t('chart.other'), value: rest.reduce((sum, item) => sum + item.value, 0), other: true }];
 }
 const total = entries.reduce((sum, item) => sum + item.value, 0);
 const percents = Math.abs(total - 100) < 0.5, valued = data.showData && !percents;
 const percent = value => `${new Intl.NumberFormat(undefined, { maximumFractionDigits: percents || value / total < 0.1 ? 1 : 0 }).format(value / total * 100)}%`;
 const rows = entries.map(item => ({ label: item.label, value: valued ? format(item.value) : percent(item.value), share: valued ? percent(item.value) : '' }));
 // The ring stands on the left edge of the text, the legend is a small table beside it; in a narrow place it goes under.
 const room = Math.max(240, width), R = PIE.radius, size = (R + PIE.width / 2) * 2, c = size / 2;
 const valueW = Math.max(...rows.map(r => widthOf(r.value, FONT.amount))), shareW = valued ? Math.max(...rows.map(r => widthOf(r.share, FONT.tick))) + 16 : 0;
 const fixedW = PIE.swatch + 10 + 24 + valueW + shareW, natural = fixedW + Math.max(...rows.map(r => widthOf(r.label, FONT.legend)));
 const beside = size + PIE.legend + Math.min(natural, 220) <= room;
 const legendW = Math.min(beside ? room - size - PIE.legend : room, Math.max(natural, PIE.table));
 const items = [], legendH = rows.length * PIE.row;
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, room - 80);
  items.push(title.item);
  top = PIE.head;
  corner = { x: title.width + 16, h: 28 };
 }
 const W = beside ? size + PIE.legend + legendW : Math.max(size, legendW);
 const H = top + (beside ? Math.max(size, legendH) : size + 18 + legendH);
 const donutY = top + (beside ? (H - top - size) / 2 : 0);
 const legendX = beside ? size + PIE.legend : 0, legendY = beside ? top + (H - top - legendH) / 2 : top + size + 18;
 const lead = entries.reduce((best, item, i) => item.value > entries[best].value ? i : best, 0);
 let start = 0;
 entries.forEach((item, i) => {
  const share = item.value / total * 100, tone = item.other ? 'mute' : slot(SERIES, i);
  items.push({
   key: `s:${i}`, type: 'arc', order: start / 100 * 4,
   props: { start, sweep: share },
   fixed: { tone, cx: c, cy: donutY + c, r: R, width: PIE.width, gap: entries.length > 1 ? PIE.gap : 0, index: i, active: i === lead },
  });
  items.push({
   key: `r:${i}`, type: 'legend', order: 0.6 + i * 0.25,
   props: { x: legendX, y: legendY + PIE.row * (i + 0.5) },
   fixed: { label: truncate(rows[i].label, legendW - fixedW, ...FONT.legend), value: rows[i].value, share: rows[i].share, tone, w: legendW, valueX: legendW - shareW, index: i, active: i === lead },
  });
  start += share;
 });
 const centerLabel = label => truncate(label, 2 * R - PIE.width - 22, ...FONT.tick);
 items.push({ key: 'c:v', type: 'label', order: 3, props: { x: c, y: donutY + c - 6 }, fixed: { lines: [percent(entries[lead].value)], cls: 'dg-center-value', pop: true } });
 items.push({ key: 'c:l', type: 'label', order: 3.2, props: { x: c, y: donutY + c + 13 }, fixed: { lines: [centerLabel(entries[lead].label)], cls: 'dg-center-label' } });
 return {
  kind: 'pie', width: W, height: H, items, corner, flush: true,
  pie: { top: lead, value: i => percent(entries[i].value), label: i => centerLabel(entries[i].label), count: entries.length },
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

// Where the labels of an axis stand when they are numbers or dates in rising order: at their own values, so that
// uneven steps stay uneven and a straight relation stays straight. Other labels stand at even steps.
function stampsOf(labels) {
 if (labels.length < 2) return null;
 const numbers = labels.map(text => /^[+\-−]?\d+(?:[.,]\d+)?$/.test(text.replace(/\s/g, '')) ? number(text.replace('−', '-')) : NaN);
 const stamps = numbers.every(Number.isFinite) ? numbers : labels.map(text => parseDate(text) ?? NaN);
 return stamps.every((v, i) => Number.isFinite(v) && (!i || v > stamps[i - 1])) ? stamps : null;
}

// Labels that are all days, or all months, written as dates: an axis says them short, the way a calendar does, and
// the pointer gets the whole date.
function datesOf(labels) {
 const kind = labels.every(text => /^(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{4})$/.test(text.trim())) ? 'day' : labels.every(text => /^\d{4}-\d{1,2}$/.test(text.trim())) ? 'month' : '';
 if (!kind || labels.length < 2) return null;
 const times = labels.map(text => parseDate(text));
 if (!times.every(Number.isFinite)) return null;
 const year = new Set(times.map(time => new Date(time).getUTCFullYear())).size === 1;
 const short = kind === 'day' ? (year ? { day: 'numeric', month: 'short' } : { day: '2-digit', month: '2-digit', year: '2-digit' }) : year ? { month: 'short' } : { month: '2-digit', year: 'numeric' };
 const axis = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', ...short });
 const full = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', month: 'long', year: 'numeric', ...(kind === 'day' ? { day: 'numeric' } : {}) });
 return { axis: times.map(time => axis.format(time)), full: times.map(time => full.format(time)) };
}

function chartScene(data, tones, { width, room = width }) {
 if (!data) return null;
 if (data.horizontal && data.series.every(s => s.type === 'bar')) return ledgerScene(ledgerOf(data), tones, { width });
 const items = [];
 const bars = data.series.filter(s => s.type === 'bar'), lines = data.series.filter(s => s.type !== 'bar');
 const toneOf = new Map(data.series.map((s, i) => [s, slot(ring(tones, data.series.length), i)]));
 const count = data.labels.length, stacked = data.stacked && bars.length > 1;
 const sums = stacked ? data.labels.map((_, i) => bars.reduce((sum, s) => sum + Math.max(0, s.values[i] || 0), 0)) : [];
 const values = [...data.series.flatMap(s => s.values), ...sums], least = Math.min(...values), most = Math.max(...values);
 const stamps = bars.length ? null : stampsOf(data.labels), dated = datesOf(data.labels), shown = dated ? dated.axis : data.labels;
 // Where a band or a mark lies. Written with numbers, a band is a stretch of the scale of values, unless it only
 // makes sense along the axis below: its ends are places there, and as values it would miss the lines or hold
 // them all. Written with dates or with labels of the axis, it lies along the axis.
 const numeric = text => /^[-+−]?[\d.,\s]+(?:e[-+]?\d+)?$/i.test(text) ? number(text.replace('−', '-')) : NaN;
 const timed = text => stamps && dated ? parseDate(text) : null;
 const zones = [], marks = [];
 for (const zone of data.zones) {
  const na = numeric(zone.a), nb = numeric(zone.b), ia = data.labels.indexOf(zone.a), ib = data.labels.indexOf(zone.b), ta = timed(zone.a), tb = timed(zone.b);
  if (ta !== null && tb !== null) zones.push({ label: zone.label, x: [Math.min(ta, tb), Math.max(ta, tb)] });
  else if (Number.isFinite(na) && Number.isFinite(nb)) {
   const from = Math.min(na, nb), to = Math.max(na, nb), numbered = stamps && !dated;
   const onAxis = numbered ? from >= stamps[0] - 1e-9 && to <= stamps[count - 1] + 1e-9 : ia >= 0 && ib >= 0;
   const asValues = to > least && from < most && !(from <= least && to >= most);
   if (zone.along ? !numbered && (ia < 0 || ib < 0) : !onAxis || asValues) zones.push({ label: zone.label, from, to });
   else zones.push(numbered ? { label: zone.label, x: [from, to] } : { label: zone.label, i: [Math.min(ia, ib), Math.max(ia, ib)] });
  } else if (ia >= 0 && ib >= 0) zones.push({ label: zone.label, i: [Math.min(ia, ib), Math.max(ia, ib)] });
 }
 for (const mark of data.marks) {
  const n = numeric(mark.at), i = data.labels.indexOf(mark.at), t = timed(mark.at);
  if (t !== null) marks.push({ label: mark.label, x: t });
  else if (stamps && !dated && Number.isFinite(n)) marks.push({ label: mark.label, x: n });
  else if (i >= 0) marks.push({ label: mark.label, i });
 }
 // What the scale has to hold: every value, the tops of the stacks, the goals and the bands of values. Bars stand
 // on zero; lines alone take the range of their values, so a change shows instead of lying flat far above the floor.
 const all = [...values, ...data.goals.map(g => g.value), ...zones.filter(z => !z.x && !z.i).flatMap(z => [z.from, z.to])];
 const lowest = Math.min(...all), highest = Math.max(...all);
 // Values that run over four orders of magnitude, a loss that falls or blows up, are read on a scale of powers of
 // ten, asked for or not: on an even scale all but the largest would lie on the floor.
 const log = !bars.length && lowest > 0 && (data.log || highest / lowest >= 1e4);
 const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
 const brief = v => Math.abs(v) >= 1e6 ? compact.format(v).replace(/^-/, '−') : format(v);
 let lo, hi, tickText = brief;
 const ticks = [];
 if (log) {
  lo = Math.floor(Math.log10(data.min > 0 ? data.min : lowest) + 1e-9);
  hi = Math.ceil(Math.log10(data.max > 0 ? data.max : highest) - 1e-9);
  if (hi === lo) hi = lo + 1;
  for (let d = lo, each = Math.ceil((hi - lo) / 6); d <= hi; d += each) ticks.push(10 ** d);
  tickText = v => Math.abs(v) >= 1e4 ? compact.format(v) : format(v);
 } else {
  lo = data.min ?? (bars.length || lowest < 0 || lowest < highest * 0.5 ? Math.min(0, lowest) : lowest);
  hi = data.max ?? highest;
  if (hi === lo) hi = lo + 1;
  const step = niceStep(hi - lo);
  if (data.min === null) lo = Math.floor(lo / step + 1e-9) * step;
  if (data.max === null) hi = Math.ceil(hi / step - 1e-9) * step;
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-6; v += step) ticks.push(+v.toFixed(10));
  if (Math.max(Math.abs(lo), Math.abs(hi)) >= 1e4) tickText = v => compact.format(v).replace(/^-/, '−');
 }
 // What stands to the right of the plot: the number each line ends on, and the names of the levels to reach. A long
 // name of a level would take the plot's room, so it goes inside, over its line.
 const ends = lines.map(series => brief(series.values[series.values.length - 1]));
 const goals = data.goals.map(goal => [goal.label, brief(goal.value)].filter(Boolean).join(' ')), aside = text => widthOf(text, FONT.value) <= 96;
 // Bands and marks are tinted with the one colour of the drawing; among several series they stay neutral.
 const zoneCls = data.series.length > 1 ? 'dg-zone is-plain' : 'dg-zone';
 // A scale of powers of ten is said to be one, beside the name of what it measures.
 const yName = [data.yTitle, log ? 'log' : ''].filter(Boolean).join(' · ');
 const left = Math.ceil(Math.max(...ticks.map(t => widthOf(tickText(t), FONT.tick)))) + 10;
 const besides = [...ends, ...goals.filter(aside)];
 const right = besides.length ? Math.ceil(Math.max(...besides.map(text => widthOf(text, FONT.value)))) + 14 : 4;
 // The column of text is room enough for most charts. Bars ask for more when they would grow thin or lose the
 // names under them, and a long run of points when they would crowd; a chart may then take the whole width.
 const labelW = Math.max(...shown.map(l => widthOf(l, FONT.tick)));
 const group = stacked ? 1 : Math.max(1, bars.length), each = bars.length ? Math.max(group * 15 + (group - 1) * 2 + 16, count <= 16 ? labelW + 12 : 0) : count > 48 ? 9 : 0;
 const want = left + right + count * each;
 const W = clamp(want > width * 1.08 ? Math.min(want, room) : width, 300, CHART.max);

 let head = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  head = CHART.head;
  corner = { x: title.width + 16, h: 28 };
 }
 if (data.series.length > 1 && data.series.some(s => s.name)) {
  const row = chips(data.series.map((s, i) => ({ text: s.name || `${i + 1}`, tone: toneOf.get(s), mark: s.type === 'bar' ? 'bar' : 'line' })), 0, head + 9, W);
  items.push(...row.items);
  if (!corner) corner = { x: row.width + 16, h: 20 };
  head += row.height + 2;
 }
 // The unit stands once, over the scale, instead of a title turned on its side.
 if (yName) items.push({ key: 'yt', type: 'label', layer: 'back', order: 0, props: { x: 0, y: head + 8 }, fixed: { lines: [truncate(yName, W * 0.6, ...FONT.tick)], anchor: 'start', cls: 'dg-unit' } });
 // Names of bands and marks stand over the plot and need a line of room there.
 const named = zones.some(z => (z.x || z.i) && z.label) || marks.some(mark => mark.label);
 const top = head + (yName ? 18 : 0) + (named ? 26 : 16), plotH = CHART.plot;
 const plotW = W - left - right, band = plotW / count;
 const share = log ? v => (clamp(Math.log10(Math.max(v, 10 ** lo)), lo, hi) - lo) / (hi - lo) : v => (clamp(v, lo, hi) - lo) / (hi - lo);
 const y = v => top + plotH - share(v) * plotH;
 const zero = log ? top + plotH : y(clamp(0, lo, hi)), floor = log ? 10 ** lo : lo <= 0 && hi >= 0 ? 0 : lo;
 for (const t of ticks) {
  items.push({ key: `g:${t}`, type: 'line', layer: 'back', order: 0, props: { x1: left, y1: y(t), x2: left + plotW, y2: y(t) }, fixed: { cls: t === floor ? 'dg-grid is-zero' : 'dg-grid' } });
  items.push({ key: `t:${t}`, type: 'label', layer: 'back', order: 0, props: { x: left - 8, y: y(t) }, fixed: { lines: [tickText(t)], anchor: 'end', cls: 'dg-tick' } });
 }
 const inset = stamps ? Math.min(16, plotW * 0.04) : 0;
 const along = v => left + inset + clamp((v - stamps[0]) / (stamps[count - 1] - stamps[0]), 0, 1) * (plotW - inset * 2);
 const xAt = stamps ? i => along(stamps[i]) : i => left + band * (i + 0.5);
 // Labels at even steps thin out evenly. Those at their own values are kept wherever they clear the one before and
 // the last one, which always stands: it is where the line has come to.
 const every = Math.max(1, Math.ceil((labelW + 10) / band));
 const end = stamps ? xAt(count - 1) - widthOf(shown[count - 1], FONT.tick) / 2 : Infinity;
 let edge = -Infinity;
 shown.forEach((text, i) => {
  const x = xAt(i), half = widthOf(text, FONT.tick) / 2;
  if (stamps ? i < count - 1 && (x - half < edge + 10 || x + half > end - 10) : i % every) return;
  edge = x + half;
  items.push({ key: `x:${i}`, type: 'label', layer: 'back', order: 0, props: { x, y: top + plotH + 9 }, fixed: { lines: [text], baseline: 'below', cls: 'dg-tick' } });
 });
 if (data.xTitle) items.push({ key: 'xt', type: 'label', layer: 'back', order: 0, props: { x: left + plotW, y: top + plotH + 34 }, fixed: { lines: [truncate(data.xTitle, plotW, ...FONT.tick)], anchor: 'end', cls: 'dg-unit' } });
 const H = top + plotH + 26 + (data.xTitle ? 18 : 0);

 // Bands: across the plot for a stretch of values, down it for a stretch of the axis. A band of values is named
 // inside, at its top; a band of the axis is named over the plot, where no line can run into the name.
 const span = zone => zone.x ? [along(zone.x[0]), along(zone.x[1])] : [xAt(zone.i[0]) - (stamps ? 0 : band / 2), xAt(zone.i[1]) + (stamps ? 0 : band / 2)];
 const over = [];
 zones.forEach((zone, k) => {
  if (zone.x || zone.i) {
   const [x0, x1] = span(zone), text = truncate(zone.label, Math.max(40, left + plotW - x0 - 4), ...FONT.tick);
   items.push({ key: `zone:${k}`, type: 'rect', layer: 'back', order: 0.1, props: { x: x0, y: top, w: Math.max(1, x1 - x0), h: plotH }, fixed: { cls: zoneCls, tone: tones[0], rx: 0 } });
   if (zone.label) {
    items.push({ key: `zonel:${k}`, type: 'label', layer: 'labels', order: 4.4, props: { x: x0 + 2, y: top - 9 }, fixed: { lines: [text], anchor: 'start', cls: 'dg-zone-label' } });
    over.push([x0, x0 + 2 + widthOf(text, FONT.tick)]);
   }
   return;
  }
  const y0 = y(zone.to), y1 = y(zone.from);
  items.push({ key: `zone:${k}`, type: 'rect', layer: 'back', order: 0.1, props: { x: left, y: y0, w: plotW, h: Math.max(1, y1 - y0) }, fixed: { cls: zoneCls, tone: tones[0], rx: 0 } });
  if (zone.label) items.push({ key: `zonel:${k}`, type: 'label', layer: 'labels', order: 4.4, props: { x: left + 6, y: y0 + 10 }, fixed: { lines: [zone.label], anchor: 'start', cls: 'dg-zone-label' } });
 });
 // A mark is a hairline down the plot with its name over it, on the side where there is room; where the name of
 // a band already stands there, the mark's name goes inside the plot.
 marks.forEach((mark, k) => {
  const x = 'i' in mark ? xAt(mark.i) : along(mark.x), side = x > left + plotW * 0.7;
  const text = truncate(mark.label, (side ? x - left : left + plotW + right - x) - 6, ...FONT.value), tw = widthOf(text, FONT.value);
  const from = side ? x - 4 - tw : x + 4, inside = over.some(([a, b]) => from < b + 8 && a < from + tw + 8);
  items.push({ key: `mark:${k}`, type: 'line', layer: 'labels', order: 4.5, props: { x1: x, y1: top, x2: x, y2: top + plotH }, fixed: { cls: 'dg-goal', draw: true } });
  if (mark.label) items.push({ key: `markl:${k}`, type: 'label', layer: 'labels', order: 4.7, props: { x: x + (side ? -4 : 4), y: inside ? top + 10 : top - 9 }, fixed: { lines: [text], anchor: side ? 'end' : 'start', cls: 'dg-goal-label' } });
  if (!inside) over.push([from, from + tw]);
 });

 const gap = group > 1 ? 2 : 0;
 const barW = Math.min(CHART.bar, (band * 0.62 - gap * (group - 1)) / group);
 const single = bars.length === 1 && !lines.length, fits = text => widthOf(text, FONT.value) <= band - 2;
 const labeled = count <= CHART.labeled && (single ? bars[0].values.every(v => fits(brief(v))) : stacked && !lines.length && sums.every(v => fits(brief(v))));
 bars.forEach((series, s) => {
  const tone = toneOf.get(series);
  series.values.forEach((value, i) => {
   let x = xAt(i) - barW / 2, at = y(value), base = zero;
   if (stacked) {
    // Parts of one bar are parted by two pixels of the surface, not by an outline.
    const below = bars.slice(0, s).reduce((sum, other) => sum + Math.max(0, other.values[i] || 0), 0);
    base = y(below) - (s ? 1 : 0);
    at = Math.min(base, y(below + Math.max(0, value)) + (s < bars.length - 1 ? 1 : 0));
   } else x += (s - (group - 1) / 2) * (barW + gap);
   items.push({ key: `b:${s}:${i}`, type: 'bar', order: i * 0.25 + s * 0.12, props: { x, top: at, w: barW, base }, fixed: { tone, r: !stacked || s === bars.length - 1 ? 3 : 0 } });
   if (labeled && single) items.push({ key: `v:${s}:${i}`, type: 'label', layer: 'labels', order: i * 0.25 + 1.6, props: { x: x + barW / 2, y: value >= 0 ? at - 6 : at + 6 }, fixed: { lines: [brief(value)], baseline: value >= 0 ? 'above' : 'below', cls: 'dg-value' } });
  });
 });
 if (labeled && stacked) sums.forEach((sum, i) => items.push({ key: `v:sum:${i}`, type: 'label', layer: 'labels', order: i * 0.25 + 1.8, props: { x: xAt(i), y: y(sum) - 6 }, fixed: { lines: [brief(sum)], baseline: 'above', cls: 'dg-value' } }));

 // Where a name or a number already stands inside the plot: the numbers of points keep clear of these.
 const notes = [], taken = [];
 lines.forEach((series, s) => {
  const tone = toneOf.get(series), n = series.values.length, begin = bars.length ? 1 : 0.2;
  const points = series.values.map((value, i) => [xAt(i), y(value)]);
  const pts = smoothPts(points);
  if (series.type === 'area' || (!bars.length && lines.length === 1)) items.push({ key: `ar:${s}`, type: 'area', layer: 'back', order: 2, props: { pts, base: zero }, fixed: { tone } });
  items.push({ key: `ln:${s}`, type: 'edge', order: begin, props: { pts }, fixed: { style: 'solid', head: 'none', tone, cls: 'dg-stroke', draw: 900 } });
  // A sparse line shows its points; a dense one only where it ends and under the pointer.
  points.forEach(([px, py], i) => {
   const r = i === n - 1 ? 4 : n <= CHART.dots ? 2.75 : 0;
   items.push({ key: `p:${s}:${i}`, type: 'dot', order: begin + (n > 1 ? i / (n - 1) : 0) * 4, props: { x: px, y: py, r }, fixed: { cls: 'dg-point', tone } });
  });
  notes.push({ key: `end:${s}`, text: ends[s], x: points[n - 1][0] + 9, y: points[n - 1][1], cls: 'dg-end' });
 });
 data.goals.forEach((goal, k) => {
  const gy = y(goal.value);
  items.push({ key: `goal:${k}`, type: 'line', layer: 'labels', order: 4.6, props: { x1: left, y1: gy, x2: left + plotW, y2: gy }, fixed: { cls: 'dg-goal', draw: true } });
  if (aside(goals[k])) { notes.push({ key: `goall:${k}`, text: goals[k], x: left + plotW + 8, y: gy, cls: 'dg-goal-label' }); return; }
  const text = truncate([goal.label, brief(goal.value)].filter(Boolean).join(' · '), plotW - 12, ...FONT.value), below = gy < top + 22;
  items.push({ key: `goall:${k}`, type: 'label', layer: 'labels', order: 5.2, props: { x: left + plotW - 4, y: below ? gy + 8 : gy - 7 }, fixed: { lines: [text], anchor: 'end', baseline: below ? 'below' : 'above', cls: 'dg-goal-label' } });
  taken.push({ x0: left + plotW - 4 - widthOf(text, FONT.value), y0: below ? gy + 7 : gy - 21, w: widthOf(text, FONT.value) });
 });
 spread(notes, 14, top, top + plotH);
 for (const note of notes) items.push({ key: note.key, type: 'label', order: 5.2, props: { x: note.x, y: note.y }, fixed: { lines: [note.text], anchor: 'start', cls: note.cls } });
 if (lines.length === 1 && !bars.length) {
  const vs = lines[0].values, n = vs.length, peak = vs.indexOf(Math.max(...vs)), trough = vs.indexOf(Math.min(...vs));
  // A lone line of a few points carries the number of each: it stands on the side the line leaves free, and gives
  // way where two would meet. A longer line names only its highest and its lowest.
  const put = (i, key) => {
   if (i === n - 1) return;
   const px = xAt(i), py = y(vs[i]), text = brief(vs[i]), tw = widthOf(text, FONT.value);
   // A point lying on the floor of the plot needs no number: the scale says what the floor is.
   if (key !== 'ext:hi' && py > top + plotH - 3) return;
   const before = i ? y(vs[i - 1]) : py, after = y(vs[i + 1]);
   // Seen from a point: the line comes down to it, goes up from it, or both, and the number keeps out of its way.
   const down = before < py - 2, up = after < py - 2, under = up && (down || !i);
   if (under && py > top + plotH - 20) return;
   const anchor = under ? 'middle' : down ? 'start' : up ? 'end' : 'middle';
   const x = anchor === 'start' ? px + 5 : anchor === 'end' ? px - 5 : clamp(px, left + tw / 2, left + plotW - tw / 2);
   const box = { x0: anchor === 'start' ? x : anchor === 'end' ? x - tw : x - tw / 2, y0: under ? py + 8 : py - 22, w: tw };
   if (box.x0 < left - 2 || box.x0 + tw > left + plotW + 2 || taken.some(b => box.x0 < b.x0 + b.w + 6 && b.x0 < box.x0 + tw + 6 && Math.abs(b.y0 - box.y0) < 14)) return;
   taken.push(box);
   items.push({ key, type: 'label', order: 5, props: { x, y: py + (under ? 9 : -9) }, fixed: { lines: [text], anchor, baseline: under ? 'below' : 'above', cls: 'dg-value' } });
  };
  if (peak !== trough) { put(peak, 'ext:hi'); put(trough, 'ext:lo'); }
  if (n <= 8 && !log) vs.forEach((_, i) => { if (i !== peak && i !== trough) put(i, `ext:${i}`); });
 }
 const probe = {
  x0: left, x1: left + plotW, y0: top, y1: top + plotH,
  xs: data.labels.map((_, i) => xAt(i)),
  tip: i => ({
   title: dated ? dated.full[i] : data.xTitle && /^[-\d.,\s]+$/.test(data.labels[i]) ? `${data.xTitle} ${data.labels[i]}` : data.labels[i],
   rows: data.series.map(s => ({ tone: toneOf.get(s), mark: s.type === 'bar' ? 'bar' : 'line', name: s.name || data.yTitle, value: Number.isFinite(s.values[i]) ? format(s.values[i]) : '–' })),
  }),
  keys: i => [...bars.map((_, s) => `b:${s}:${i}`), ...lines.map((_, s) => `p:${s}:${i}`)],
 };
 return { kind: 'chart', width: W, height: H, items, probe, corner, flush: true };
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
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  titleW = title.width;
  y0 = 26;
 }
 const change = last.c - first.o, pct = first.o ? change / first.o * 100 : 0;
 const priceText = priceFmt.format(last.c), priceW = widthOf(priceText, FONT.figure);
 const changeText = `${signed(change, priceFmt)} · ${signed(pct, pctFmt)}%`;
 items.push({ key: 'price', type: 'label', order: 0.1, props: { x: 0, y: y0 + 16 }, fixed: { lines: [priceText], anchor: 'start', cls: 'dg-price' } });
 items.push({ key: 'change', type: 'label', order: 0.2, props: { x: priceW + 10, y: y0 + 19 }, fixed: { lines: [changeText], anchor: 'start', cls: `dg-change ${change >= 0 ? 'is-up' : 'is-down'}` } });
 let headW = priceW + 10 + widthOf(changeText, FONT.amount);
 if (data.ma.length) {
  const row = chips(data.ma.map((p, i) => ({ text: `MA ${p}`, tone: slot(tones, i), mark: 'line' })), headW + 22, y0 + 19, Infinity);
  items.push(...row.items);
  headW += 22 + row.width;
 }
 const corner = { x: Math.max(titleW, headW) + 16, h: y0 + 32 };
 const top = y0 + CANDLE.head;
 const ticks = [];
 for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(+v.toFixed(10));
 const tagText = priceFmt.format(last.c), tagW = widthOf(tagText, FONT.value) + 12;
 const axisW = Math.ceil(Math.max(tagW, ...ticks.map(t => widthOf(tickFmt.format(t), FONT.tick)))) + 12;
 const plotW = W - axisW, hasVol = rows.some(r => r.v > 0), maxV = Math.max(1e-9, ...rows.map(r => r.v));
 const volTop = top + CANDLE.price + CANDLE.gap, bottom = hasVol ? volTop + CANDLE.volume : top + CANDLE.price;
 const y = v => top + (hi - v) / (hi - lo) * CANDLE.price;
 const band = plotW / n, bodyW = clamp(band * CANDLE.body, 1.5, CANDLE.maxBody), ly = y(last.c);
 for (const t of ticks) {
  items.push({ key: `g:${t}`, type: 'line', layer: 'back', order: 0, props: { x1: 0, y1: y(t), x2: plotW, y2: y(t) }, fixed: { cls: 'dg-grid' } });
  if (Math.abs(y(t) - ly) > 13) items.push({ key: `t:${t}`, type: 'label', layer: 'back', order: 0, props: { x: plotW + 10, y: y(t) }, fixed: { lines: [tickFmt.format(t)], anchor: 'start', cls: 'dg-tick' } });
 }
 if (hasVol) items.push({ key: 'vsep', type: 'line', layer: 'back', order: 0, props: { x1: 0, y1: volTop - CANDLE.gap / 2, x2: plotW, y2: volTop - CANDLE.gap / 2 }, fixed: { cls: 'dg-grid is-zero' } });
 const labelW = Math.max(...rows.map(r => widthOf(r.axis || r.label, FONT.tick)));
 const every = Math.max(1, Math.ceil((labelW + 16) / band));
 rows.forEach((r, i) => {
  if (i % every || band * (i + 0.5) + labelW / 2 > W) return;
  items.push({ key: `x:${i}`, type: 'label', layer: 'back', order: 0, props: { x: band * (i + 0.5), y: bottom + 9 }, fixed: { lines: [r.axis || r.label], baseline: 'below', cls: 'dg-tick' } });
 });
 rows.forEach((r, i) => {
  const x = band * (i + 0.5), order = 0.5 + i * (4 / n);
  items.push({ key: `k:${i}`, type: 'candle', order, props: { x, o: y(r.o), h: y(r.h), l: y(r.l), c: y(r.c), w: bodyW }, fixed: { cls: dir(r) } });
  if (hasVol) items.push({ key: `vol:${i}`, type: 'column', layer: 'back', order: order + 0.15, props: { x: x - bodyW / 2, top: bottom - CANDLE.volume * r.v / maxV, w: bodyW, base: bottom }, fixed: { cls: `dg-vol ${dir(r)}`, r: 1 } });
 });
 data.ma.forEach((p, k) => {
  const points = [];
  for (let i = p - 1; i < n; i++) {
   let sum = 0;
   for (let j = i - p + 1; j <= i; j++) sum += rows[j].c;
   points.push([band * (i + 0.5), y(sum / p)]);
  }
  if (points.length > 1) items.push({ key: `ma:${p}`, type: 'edge', order: 4.6 + k * 0.2, props: { pts: smoothPts(points) }, fixed: { style: 'solid', head: 'none', tone: slot(tones, k), cls: 'dg-stroke is-ma', draw: 800 } });
 });
 items.push({ key: 'last', type: 'line', layer: 'back', order: 4.8, props: { x1: 0, y1: ly, x2: plotW, y2: ly }, fixed: { cls: `dg-last ${dir(last)}`, draw: true } });
 items.push({ key: 'tag', type: 'label', order: 5.2, props: { x: plotW + 4 + tagW / 2, y: ly }, fixed: { lines: [tagText], pill: true, rx: 4, w: tagW, h: 18, cls: `dg-last-tag ${dir(last)}`, pop: true } });
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
 return { kind: 'candles', width: W, height: bottom + 28, items, probe, corner };
}

function timelineScene(data, tones, { width }) {
 if (!data) return null;
 const accent = tones[0], room = Math.max(280, width - PAD * 2), periods = data.periods, n = periods.length;
 const items = [];
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, room - 80);
  items.push(title.item);
  top = CHART.head + 4;
  corner = { x: title.width + 16, h: 28 };
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
     items.push({ key: `ts:${k}`, type: 'label', layer: 'back', order: i * 0.6, props: { x: x0, y: top + 6 }, fixed: { lines: [caps(periods[i].section, x1 - x0)], anchor: 'start', cls: 'dg-eyebrow' } });
     items.push({ key: `tb:${k}`, type: 'line', layer: 'back', order: i * 0.6, props: { x1: x0, y1: top + 19, x2: x1, y2: top + 19 }, fixed: { cls: 'dg-bracket', draw: true } });
     k++;
    }
    i = j + 1;
   }
   top += 34;
  }
  const labels = periods.map(p => wrap(p.label, colW - 16, ...FONT.period).slice(0, 2));
  const labelH = Math.max(...labels.map(l => l.length)) * 18;
  const axisY = top + labelH + 15;
  items.push({ key: 'axis', type: 'line', layer: 'back', order: 0, props: { x1: colW * 0.5, y1: axisY, x2: W - colW * 0.5, y2: axisY }, fixed: { cls: 'dg-axis-line', draw: true } });
  let bottom = axisY;
  periods.forEach((p, i) => {
   const cx = colW * (i + 0.5), order = 0.3 + i * 0.6;
   items.push({ key: `tp:${i}`, type: 'label', order, props: { x: cx, y: axisY - 15 }, fixed: { lines: labels[i], baseline: 'above', lineHeight: 18, cls: 'dg-period' } });
   items.push({ key: `td:${i}`, type: 'dot', order: order + 0.1, props: { x: cx, y: axisY, r: 4 }, fixed: { cls: 'dg-tl-dot', tone: accent } });
   let ey = axisY + 20;
   p.events.forEach((event, j) => {
    const lines = wrap(event, colW - 22, ...FONT.event);
    items.push({ key: `te:${i}:${j}`, type: 'label', order: order + 0.25 + j * 0.12, props: { x: cx, y: ey }, fixed: { lines, baseline: 'below', lineHeight: TIMELINE.line, cls: j ? 'dg-event' : 'dg-event is-lead' } });
    ey += lines.length * TIMELINE.line + 7;
   });
   bottom = Math.max(bottom, ey - 7);
  });
  return { kind: 'timeline', width: W, height: bottom + 4, items, corner };
 }
 const labelW = Math.min(170, Math.max(...periods.map(p => widthOf(p.label, FONT.period))));
 const lineX = labelW + 20, textX = lineX + 20, W = Math.min(room, 720), textW = W - textX;
 let y = top + 4, section = '', dotTop = null, dotBottom = 0;
 periods.forEach((p, i) => {
  const order = i * 0.5;
  if (p.section && p.section !== section) {
   section = p.section;
   items.push({ key: `ts:${i}`, type: 'label', layer: 'back', order, props: { x: textX, y: y + 6 }, fixed: { lines: [caps(p.section, textW)], anchor: 'start', cls: 'dg-eyebrow' } });
   y += 26;
  }
  const plines = wrap(p.label, labelW, ...FONT.period);
  items.push({ key: `tp:${i}`, type: 'label', order, props: { x: labelW, y }, fixed: { lines: plines, anchor: 'end', baseline: 'below', lineHeight: 18, cls: 'dg-period' } });
  items.push({ key: `td:${i}`, type: 'dot', order: order + 0.1, props: { x: lineX, y: y + 8, r: 4 }, fixed: { cls: 'dg-tl-dot', tone: accent } });
  dotTop ??= y + 8;
  dotBottom = y + 8;
  let ey = y;
  p.events.forEach((event, j) => {
   const lines = wrap(event, textW, ...FONT.event);
   items.push({ key: `te:${i}:${j}`, type: 'label', order: order + 0.2 + j * 0.1, props: { x: textX, y: ey + 1 }, fixed: { lines, anchor: 'start', baseline: 'below', lineHeight: 18, cls: j ? 'dg-event' : 'dg-event is-lead' } });
   ey += lines.length * 18 + 4;
  });
  y = Math.max(ey, y + plines.length * 18) + 14;
 });
 if (n > 1) items.push({ key: 'axis', type: 'line', layer: 'back', order: 0, props: { x1: lineX, y1: dotTop, x2: lineX, y2: dotBottom }, fixed: { cls: 'dg-axis-line', draw: true } });
 return { kind: 'timeline', width: W, height: y - 14, items, corner };
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
 } else if (span <= max * 186 * DAY) {
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
 const tasks = data.tasks, accent = tones[0];
 let lo = Math.min(...tasks.map(t => t.start)), hi = Math.max(...tasks.map(t => t.end));
 if (hi - lo < 36e5) hi = lo + DAY;
 const pad = (hi - lo) * 0.02;
 lo -= pad;
 hi += pad;
 const W = Math.max(440, Math.min(GANTT.maxWidth, width - PAD * 2));
 const labelW = Math.min(GANTT.label, Math.max(96, ...tasks.map(t => widthOf(t.name, FONT.task))) + 26);
 const plotW = W - labelW, x = t => labelW + (t - lo) / (hi - lo) * plotW;
 const hourly = hi - lo <= 2 * DAY;
 const when = new Intl.DateTimeFormat(undefined, hourly ? { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' } : { timeZone: 'UTC', day: 'numeric', month: 'short' });
 const unit = (value, name) => new Intl.NumberFormat(undefined, { style: 'unit', unit: name, unitDisplay: 'short', maximumFractionDigits: 1 }).format(value);
 const dur = ms => ms >= DAY ? unit(ms / DAY, 'day') : unit(ms / 36e5, 'hour');
 const items = [], tips = new Map();
 let head = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  head = CHART.head;
  corner = { x: title.width + 16, h: 28 };
 }
 const rowsTop = head + GANTT.axis;
 let y = rowsTop, section = null, si = 0;
 tasks.forEach((t, i) => {
  if (t.section !== section) {
   section = t.section;
   if (section) {
    if (y > rowsTop) items.push({ key: `gr:${si}`, type: 'line', layer: 'back', order: i * 0.3, props: { x1: 0, y1: y + 4, x2: W, y2: y + 4 }, fixed: { cls: 'dg-sep' } });
    // The name of a section has its line to itself and may run over the plot, past the column of names.
    items.push({ key: `gs:${si}`, type: 'label', order: i * 0.3, props: { x: 0, y: y + GANTT.section / 2 + 6 }, fixed: { lines: [caps(section, Math.max(labelW - 16, W * 0.6))], anchor: 'start', cls: 'dg-eyebrow is-over' } });
    si++;
    y += GANTT.section;
   }
  }
  const cy = y + GANTT.row / 2, order = 0.4 + i * 0.3, tag = name => t.tags.includes(name);
  const cls = `dg-task${tag('done') ? ' is-done' : ''}${tag('crit') ? ' is-crit' : ''}${tag('active') ? ' is-active' : ''}`;
  items.push({ key: `gn:${i}`, type: 'label', order, props: { x: 0, y: cy }, fixed: { lines: [truncate(t.name, labelW - 20, ...FONT.task)], anchor: 'start', cls: `dg-task-name${tag('done') ? ' is-done' : ''}` } });
  const x0 = x(t.start), x1 = Math.max(x0 + 6, x(t.end)), key = `gb:${i}`, milestone = tag('milestone');
  items.push({ key, type: 'span', order: order + 0.1, props: { x: x0, y: cy, w: milestone ? 0 : x1 - x0, h: milestone ? 11 : GANTT.bar }, fixed: { cls, tone: accent, milestone } });
  const last = t.end - t.start >= DAY && !hourly ? t.end - 1 : t.end;
  const text = milestone ? when.format(t.start) : dur(t.end - t.start), tw = widthOf(text, FONT.tick);
  const after = milestone ? x0 + 11 : x1 + 8;
  if (after + tw <= W) items.push({ key: `gd:${i}`, type: 'label', order: order + 0.6, props: { x: after, y: cy }, fixed: { lines: [text], anchor: 'start', cls: 'dg-task-meta' } });
  else if (x0 - 8 - tw >= labelW) items.push({ key: `gd:${i}`, type: 'label', order: order + 0.6, props: { x: x0 - 8, y: cy }, fixed: { lines: [text], anchor: 'end', cls: 'dg-task-meta' } });
  const tip = { title: t.name, rows: [{ name: milestone ? '' : `${when.format(t.start)} – ${when.format(last)}`, value: milestone ? when.format(t.start) : dur(t.end - t.start) }], hot: [key, `gn:${i}`] };
  tips.set(key, tip);
  tips.set(`gn:${i}`, tip);
  y += GANTT.row;
 });
 for (const tick of timeTicks(lo, hi, plotW)) {
  const tx = x(tick.t);
  if (tx < labelW || tx + 6 + widthOf(tick.label, FONT.tick) > W) continue;
  items.push({ key: `gt:${tick.t}`, type: 'line', layer: 'back', order: 0, props: { x1: tx, y1: rowsTop - 8, x2: tx, y2: y }, fixed: { cls: 'dg-grid' } });
  items.push({ key: `gl:${tick.t}`, type: 'label', layer: 'back', order: 0, props: { x: tx + 6, y: head + 11 }, fixed: { lines: [tick.label], anchor: 'start', cls: 'dg-tick' } });
 }
 const now = Date.now();
 if (!data.noToday && !hourly && now > lo && now < hi) {
  const tx = x(now), text = caps(I18n.t('chart.today')), tw = capsWidth(text);
  items.push({ key: 'today', type: 'line', layer: 'nodes', order: 3, props: { x1: tx, y1: rowsTop - 8, x2: tx, y2: y + 2 }, fixed: { cls: 'dg-today', draw: true } });
  items.push({ key: 'today-tag', type: 'label', layer: 'labels', order: 3.4, props: { x: clamp(tx, labelW + tw / 2, W - tw / 2), y: y + 13 }, fixed: { lines: [text], cls: 'dg-today-tag' } });
  y += 22;
 }
 return { kind: 'gantt', width: W, height: y + 4, items, tips, corner };
}

const MIND_TEXT = [[13.5, 650, 19, 220, 30, 18], [12.5, 600, 17, 180, 24, 12], [12.5, 450, 17, 220, 14, 5]];

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
   place(kid, tones[root.children.indexOf(kid) % tones.length], 0.5 + root.children.indexOf(kid) * 0.4);
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
 items.push({ key: 'm:r', type: 'node', order: 0, props: { x: ox, y: oy, w: root.w, h: root.h }, fixed: { shape: 'round', lines: root.lines, tone: tones[0], id: 'r', cls: 'is-root' } });
 for (const node of nodes) {
  const p = node.parent, dir = node.dir;
  const sx = ox + (p === root ? dir * root.w / 2 : p.ax + dir * p.w), sy = oy + (p === root ? clamp(node.y * 0.2, -root.h / 4, root.h / 4) : p.y);
  const ex = ox + node.ax, ey = oy + node.y, mid = (ex - sx) / 2;
  items.push({ key: `mb:${node.path}`, type: 'edge', order: node.order - 0.1, props: { pts: [sx, sy, sx + mid, sy, ex - mid, ey, ex, ey] }, fixed: { style: 'solid', head: 'none', tone: node.tone, cls: `dg-branch is-d${Math.min(node.depth, 3)}`, draw: 420 } });
  if (node.depth === 1) {
   items.push({ key: `m:${node.path}`, type: 'node', order: node.order, props: { x: ox + node.ax + dir * node.w / 2, y: ey, w: node.w, h: node.h }, fixed: { shape: 'round', lines: node.lines, tone: node.tone, id: node.path, cls: 'is-branch' } });
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
  const title = titleOf(data.title, Math.max(160, width - 80));
  items.push(title.item);
  top = CHART.head + 4;
  corner = { x: title.width + 16, h: 28 };
 }
 // Two hairlines cross in the middle; the corner worth going for lies under a faint wash, the rest stay bare.
 const ax = data.y.some(Boolean) ? 24 : 0;
 const S = clamp(width - ax, QUAD.min, QUAD.max), half = S / 2;
 const px = v => ax + clamp01(v) * S, py = v => top + (1 - clamp01(v)) * S;
 items.push({ key: 'q:wash', type: 'rect', layer: 'back', order: 0, props: { x: ax + half, y: top, w: half, h: half }, fixed: { cls: 'dg-quad', rx: 0 } });
 items.push({ key: 'q:h', type: 'line', layer: 'back', order: 0.1, props: { x1: ax, y1: top + half, x2: ax + S, y2: top + half }, fixed: { cls: 'dg-quad-axis', draw: true } });
 items.push({ key: 'q:v', type: 'line', layer: 'back', order: 0.1, props: { x1: ax + half, y1: top + S, x2: ax + half, y2: top }, fixed: { cls: 'dg-quad-axis', draw: true } });
 const cells = [[1, ax + half, top, 'end', 'top'], [2, ax, top, 'start', 'top'], [3, ax, top + half, 'start', 'bottom'], [4, ax + half, top + half, 'end', 'bottom']];
 cells.forEach(([q, x, y, anchor, edge], i) => {
  if (!data.q[q - 1]) return;
  items.push({ key: `ql:${q}`, type: 'label', layer: 'back', order: 0.3 + i * 0.15, props: { x: anchor === 'start' ? x + 10 : x + half - 10, y: edge === 'top' ? y + 14 : y + half - 14 }, fixed: { lines: [caps(data.q[q - 1], half - 24)], anchor, cls: `dg-quad-label${q === 1 ? ' is-lead' : ''}` } });
 });
 const bottom = top + S;
 if (data.x[0]) items.push({ key: 'x0', type: 'label', layer: 'back', order: 0.5, props: { x: ax, y: bottom + 15 }, fixed: { lines: [data.x[0]], anchor: 'start', cls: 'dg-axis-title' } });
 if (data.x[1]) items.push({ key: 'x1', type: 'label', layer: 'back', order: 0.5, props: { x: ax + S, y: bottom + 15 }, fixed: { lines: [`${data.x[1]} →`], anchor: 'end', cls: 'dg-axis-title' } });
 if (data.y[0]) items.push({ key: 'y0', type: 'label', layer: 'back', order: 0.5, props: { x: 8, y: bottom }, fixed: { lines: [data.y[0]], anchor: 'start', rotate: -90, cls: 'dg-axis-title' } });
 if (data.y[1]) items.push({ key: 'y1', type: 'label', layer: 'back', order: 0.5, props: { x: 8, y: top }, fixed: { lines: [`${data.y[1]} →`], anchor: 'end', rotate: -90, cls: 'dg-axis-title' } });
 const boxes = data.points.map(p => ({ x: px(p.x) - 7, y: py(p.y) - 7, w: 14, h: 14 }));
 const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
 data.points.forEach((p, i) => {
  const x = px(p.x), y = py(p.y), tw = widthOf(p.label, FONT.point);
  const options = [[x + 10, y, 'start', x + 10], [x - 10, y, 'end', x - 10 - tw], [x, y - 15, 'middle', x - tw / 2], [x, y + 16, 'middle', x - tw / 2]];
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
  items.push({ key, type: 'dot', order, props: { x, y, r: 4.5 }, fixed: { cls: 'dg-q-point', tone: accent } });
  items.push({ key: `qn:${i}`, type: 'label', order: order + 0.1, props: { x: pick[0], y: pick[1] }, fixed: { lines: [p.label], anchor: pick[2], cls: 'dg-q-name' } });
  const tip = { title: p.label, rows: [{ name: data.x[1] || 'x', value: format(p.x) }, { name: data.y[1] || 'y', value: format(p.y) }], hot: [key, `qn:${i}`] };
  tips.set(key, tip);
  tips.set(`qn:${i}`, tip);
 });
 return { kind: 'quadrant', width: ax + S, height: bottom + (data.x.some(Boolean) ? 26 : 4), items, tips, corner, flush: true };
}

function radarScene(data, tones, { width }) {
 if (!data) return null;
 const n = data.axes.length, items = [], tips = new Map();
 const labelW = Math.min(150, Math.max(...data.axes.map(a => widthOf(a.label, FONT.legend))));
 const R = clamp((Math.min(620, width) - 2 * (labelW + 16)) / 2, RADAR.min, RADAR.max);
 const values = data.curves.flatMap(c => c.data);
 const lo = data.min ?? 0, hi = data.max ?? niceCeil(Math.max(...values, lo + 1));
 const legend = data.curves.length > 1 ? chips(data.curves.map((c, i) => ({ text: c.label, tone: slot(SERIES, i), mark: 'line' })), 0, 0, 600) : null;
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, Math.max(160, width - 80));
  items.push(title.item);
  top = CHART.head;
  corner = { x: title.width + 16, h: 28 };
 }
 const W = Math.max(2 * (labelW + 16 + R), legend ? legend.width : 0), cx = W / 2, cy = top + 22 + R;
 const angle = i => -Math.PI / 2 + i * 2 * Math.PI / n;
 const at = (i, r) => [cx + Math.cos(angle(i)) * r, cy + Math.sin(angle(i)) * r];
 const ring = r => data.circle ? Array.from({ length: 64 }, (_, k) => [cx + Math.cos(k / 64 * 2 * Math.PI) * r, cy + Math.sin(k / 64 * 2 * Math.PI) * r]).flat() : data.axes.flatMap((_, i) => at(i, r));
 for (let k = 1; k <= data.levels; k++) {
  items.push({ key: `rg:${k}`, type: 'poly', layer: 'back', order: k * 0.1, props: { vs: ring(R * k / data.levels) }, fixed: { cx, cy, cls: `dg-radar-grid${k === data.levels ? ' is-outer' : ''}` } });
  if (k < data.levels) items.push({ key: `rt:${k}`, type: 'label', layer: 'front', order: 0.6, props: { x: cx + 5, y: cy - R * k / data.levels - 6 }, fixed: { lines: [format(lo + (hi - lo) * k / data.levels)], anchor: 'start', cls: 'dg-tick is-radar' } });
 }
 let low = cy + R;
 data.axes.forEach((axis, i) => {
  const [x, y] = at(i, R), [lx, ly] = at(i, R + 12), cos = Math.cos(angle(i)), sin = Math.sin(angle(i));
  items.push({ key: `rs:${i}`, type: 'line', layer: 'back', order: 0.2, props: { x1: cx, y1: cy, x2: x, y2: y }, fixed: { cls: 'dg-radar-spoke', draw: true } });
  items.push({ key: `ra:${i}`, type: 'label', layer: 'labels', order: 0.4 + i * 0.05, props: { x: lx, y: ly + sin * 5 }, fixed: { lines: [truncate(axis.label, labelW, ...FONT.legend)], anchor: cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle', cls: 'dg-radar-axis' } });
  low = Math.max(low, ly + sin * 5 + 8);
 });
 data.curves.forEach((curve, c) => {
  const tone = slot(ring(tones, data.curves.length), c), order = 1 + c * 0.5;
  const points = curve.data.map((v, i) => at(i, R * clamp01((v - lo) / (hi - lo))));
  items.push({ key: `rc:${c}`, type: 'poly', order, props: { vs: points.flat() }, fixed: { cx, cy, tone, cls: 'dg-radar-curve' } });
  points.forEach(([x, y], i) => {
   const key = `rp:${c}:${i}`;
   items.push({ key, type: 'dot', layer: 'labels', order: order + 0.6, props: { x, y, r: 2.75 }, fixed: { cls: 'dg-point', tone } });
   tips.set(key, { title: data.axes[i].label, rows: [{ tone, mark: 'line', name: curve.label, value: format(curve.data[i]) }] });
  });
 });
 // The legend clears the lowest label, whatever the number of axes puts there.
 let H = low + 10;
 if (legend) {
  for (const item of legend.items) { item.props.x += (W - legend.width) / 2; item.props.y += H + 12; item.order += 2; }
  items.push(...legend.items);
  H += legend.height + 8;
 }
 return { kind: 'radar', width: W, height: H, items, tips, corner, flush: true };
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
 brand: [15, 650, 20], link: [12.5, 500, 16], h1: [34, 650, 40], h1s: [25, 650, 30], lead: [15, 450, 22], leads: [14, 450, 20],
 h2: [22, 620, 28], h2s: [18, 620, 24], sub: [13.5, 450, 20], title: [14, 600, 20], body: [12.5, 450, 18], small: [12, 500, 16],
 tag: [11, 600, 14], value: [28, 650, 32], price: [24, 650, 28], btn: [13, 600, 18], logo: [15, 650, 18], quote: [13.5, 450, 20], q: [13.5, 600, 20],
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
 warn: 'M0-8.5l9 15.5h-18zM0-3v5M0 4.6v.4',
 bang: 'M0-6v7M0 5v.4',
 cross: 'M-4.5-4.5l9 9M4.5-4.5l-9 9',
 ask: 'M-3.2-3.2a3.3 3.3 0 1 1 5 2.8c-1.2.8-1.8 1.4-1.8 2.9M0 6.2v.4',
 sheet: 'M-6-9h7.5l4.5 4.5v13.5h-12zM1.5-9v4.5h4.5M-3 1h6M-3 4.5h6',
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
    add(`${key}q`, 'label', { x: x + 18, y: y + 40 }, { lines: ['“'], cls: 'dg-wf-quote', anchor: 'start', lineHeight: 40, size: 44, weight: 600 }, d + 0.02);
    if (r.quote) text(`${key}t`, r.quote, WT.quote, 'dg-wf-strong is-soft', x + 20, y + 50, w - 40, { d: d + 0.03 });
    else { skel(`${key}t`, x + 20, y + 56, w - 60, 8, d + 0.03); skel(`${key}u`, x + 20, y + 72, (w - 60) * 0.7, 8, d + 0.04); }
    const ay = y + h - 20 - 17;
    add(`${key}a`, 'dot', { x: x + 37, y: ay, r: 17 }, { cls: 'dg-wf-avatar' }, d + 0.05, 'nodes');
    if (r.name) text(`${key}n`, r.name, [13, 600, 17], 'dg-wf-strong', x + 62, ay - (r.role ? 17 : 8.5), w - 82, { cap: 1, d: d + 0.06 });
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
   const navButtons = s.buttons.slice(0, wide ? 2 : 1), ws = navButtons.map(label => Math.ceil(textWidth(label, 12.5, 600)) + 30);
   const need = ws.reduce((sum, w) => sum + w + 8, 0);
   if (need && right - need >= left) {
    for (let i = navButtons.length - 1; i >= 0; i--) {
     right -= ws[i];
     const primary = i === navButtons.length - 1;
     box(`n${i}`, right, mid - 16, ws[i], 32, `dg-wf-btn${primary ? ' is-primary' : ''}`, 16, 0.12, 'nodes');
     add(`n${i}t`, 'label', { x: right + ws[i] / 2, y: mid }, { lines: [navButtons[i]], cls: primary ? 'dg-wf-on' : 'dg-wf-strong', anchor: 'middle', lineHeight: 16, size: 12.5, weight: 600 }, 0.14);
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
    add(`n${i}`, 'label', { x, y: cy }, { lines: [list[i].n], cls: 'dg-wf-strong', anchor: 'middle', lineHeight: 16, size: 13, weight: 600 }, d + 0.02);
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
  const label = I18n.t(`wf.${s.type}`), lw = Math.ceil(textWidth(label, 11, 600)) + 18;
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
  add('time', 'label', { x: 34, y: WF.status / 2 }, { lines: ['9:41'], cls: 'dg-wf-strong', anchor: 'start', lineHeight: 16, size: 13.5, weight: 600 }, -0.1);
  box('island', cx - 52, 10, 104, 28, 'dg-wf-island', 14, -0.1, 'nodes');
  box('battery', W - 52, WF.status / 2 - 6, 24, 12, 'dg-wf-battery', 4, -0.1, 'nodes');
  box('charge', W - 50, WF.status / 2 - 4, 16, 8, 'dg-wf-charge', 2, -0.1, 'nodes');
  box('home', cx - 62, H - 14, 124, 5, 'dg-wf-home', 2.5, -0.1, 'nodes');
 } else {
  for (let i = 0; i < 3; i++) add(`light${i}`, 'dot', { x: 20 + i * 17, y: WF.bar / 2, r: 5.5 }, { cls: 'dg-wf-light' }, -0.12 + i * 0.02, 'nodes');
  const aw = Math.round(Math.min(340, Math.max(150, W * 0.36))), url = page.title || page.sections.find(s => s.type === 'nav')?.heading || '';
  box('address', cx - aw / 2, WF.bar / 2 - 13, aw, 26, 'dg-wf-address', 9, -0.1, 'nodes');
  if (url) {
   const shown = truncate(url, aw - 48, 12, 500), tw = textWidth(shown, 12, 500);
   glyph('lock', 'lock', cx - tw / 2 - 5, WF.bar / 2, 13, 'is-lock', -0.06);
   add('url', 'label', { x: cx + 5, y: WF.bar / 2 }, { lines: [shown], cls: 'dg-wf-muted', anchor: 'middle', lineHeight: 14, size: 12, weight: 500 }, -0.06);
  } else skel('url', cx - 50, WF.bar / 2 - 4, 100, 8, -0.06);
  rule('bar', 0, WF.bar, W, -0.1);
  corner = { x: cx + aw / 2 + 12, h: WF.bar, inset: 7 };
 }
 return { kind: 'wireframe', width: W, height: H, items, tips, corner, mobile: phone };
}

/* Files: what a folder holds, shown the way a file manager would */

// A handful of entries become tiles with big icons, a longer list becomes rows, and nested entries become a tree.
// Above them a bar shows what takes the space, each kind of file in the color of its icons.
const FV = { max: 760, pad: 16, head: 42, meter: 4, row: 34, indent: 18, cap: 80 };
const FV_KINDS = [
 ['image', ['image'], 'mint'], ['video', ['video'], 'purple'], ['audio', ['audio'], 'pink'], ['archive', ['archive'], 'brown'],
 ['app', ['binary'], 'steel'], ['doc', ['pdf', 'text', 'book', 'sheet', 'slides'], 'blue'], ['code', ['code', 'braces', 'terminal'], 'indigo'], ['font', ['font'], 'gray'],
];
const FV_FOLDER = 'gray';
const FV_UNITS = { b: 1, byte: 1, bytes: 1, k: 1e3, kb: 1e3, kib: 1024, m: 1e6, mb: 1e6, mib: 1048576, g: 1e9, gb: 1e9, gib: 1073741824, t: 1e12, tb: 1e12, tib: 1099511627776, 'б': 1, 'байт': 1, 'кб': 1e3, 'мб': 1e6, 'гб': 1e9, 'тб': 1e12 };
const FV_SIZE = /^(\d{1,3}(?:[ \u00a0,']\d{3})+|\d+(?:[.,]\d+)?)\s*([a-zа-яё]{0,5})\.?$/i;
const FV_COUNT = /^(\d[\d \u00a0,]*)\s*(files?|items?|folders?|entries|objects?|файл\S*|элемент\S*|объект\S*|папк\S*)$/i;

function fvSize(text) {
 const m = FV_SIZE.exec(text.trim()), unit = (m?.[2] || 'b').toLowerCase();
 if (!m || !(unit in FV_UNITS)) return null;
 const digits = /^\d{1,3}([ \u00a0,']\d{3})+$/.test(m[1]) ? m[1].replace(/[ \u00a0,']/g, '') : m[1].replace(',', '.');
 const value = parseFloat(digits);
 return Number.isFinite(value) ? value * FV_UNITS[unit] : null;
}

// Dates as a listing writes them: 2026-09-27 14:05, 27.09.2026 14:05, 9/27/2026 2:05 PM, or words a date parser knows.
function fvDate(text) {
 const s = text.trim();
 let m, y, mo, d, h, mi;
 if ((m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T,]+(\d{1,2}):(\d{2}))?/.exec(s))) [, y, mo, d, h, mi] = m;
 else if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:[ ,]+(\d{1,2}):(\d{2}))?/.exec(s))) [, d, mo, y, h, mi] = m;
 else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ ,]+(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?)?/i.exec(s))) {
  [, mo, d, y, h, mi] = m;
  if (h !== undefined && m[6]) h = +h % 12 + (/p/i.test(m[6]) ? 12 : 0);
 } else if (/\p{L}/u.test(s) && /\d/.test(s) && Number.isFinite(Date.parse(s))) return { t: Date.parse(s), timed: /\d:\d\d/.test(s) };
 else return null;
 if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
 const date = new Date(+y < 100 ? 2000 + +y : +y, mo - 1, +d, +(h || 0), +(mi || 0));
 return { t: date.getTime(), timed: h !== undefined };
}

// Today and yesterday say so, with the time; other days are a short date, with the year once it isn't this one.
function fvWhen({ t, timed }) {
 const date = new Date(t), now = new Date(), midnight = value => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
 const ago = Math.round((midnight(now) - midnight(date)) / DAY);
 if (ago === 0 || ago === 1) {
  const word = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(-ago, 'day');
  const day = word.charAt(0).toUpperCase() + word.slice(1);
  return timed ? `${day}, ${new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date)}` : day;
 }
 return new Intl.DateTimeFormat(undefined, date.getFullYear() === now.getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

// One entry: the name first (a folder ends with / or \), then in any order its size, a count of what it holds,
// the date it changed and any note, separated by |, by · or by tabs.
function fvEntry(line) {
 const parts = line.split(/\s*\|\s*|\s+·\s+|\t+/).map(part => part.trim()).filter(Boolean);
 const raw = cleanLabel(parts.shift() || ''), folder = /[\\/]$/.test(raw);
 const entry = { name: raw.replace(/[\\/]+$/, '') || raw, folder, size: null, count: null, when: null, note: '', children: [] };
 const field = text => {
  const count = FV_COUNT.exec(text);
  if (count) { entry.count = parseInt(count[1].replace(/\D/g, ''), 10); return true; }
  const when = !entry.when && fvDate(text);
  if (when) { entry.when = when; return true; }
  const size = entry.size === null ? fvSize(text) : null;
  if (size !== null) { entry.size = size; return true; }
  return false;
 };
 for (const part of parts) {
  if (field(part)) continue;
  const pieces = part.split(/\s*,\s*/);
  if (pieces.length > 1 && pieces.every(piece => FV_COUNT.test(piece) || fvSize(piece) !== null)) pieces.forEach(field);
  else entry.note = entry.note ? `${entry.note} · ${part}` : part;
 }
 return entry;
}

// Lines under the header: title, path, view (grid, list or tree), more (how many were left out), and the entries,
// nested by indentation under their folders.
function parseFiles(lines) {
 const page = { title: '', path: '', view: '', more: 0, entries: [] }, open = [];
 for (const raw of lines.slice(1)) {
  const indent = raw.length - raw.trimStart().length, line = raw.trim().replace(/^[-*•]\s+/, '');
  const directive = !/[|·\t]/.test(line) && /^(title|path|view|more)(?:\s*:\s*|\s+)(.+)$/i.exec(line);
  if (directive) {
   const key = directive[1].toLowerCase(), value = cleanLabel(directive[2]);
   if (key === 'more') page.more = parseInt(value.replace(/\D/g, ''), 10) || 0;
   else page[key] = key === 'view' ? value.toLowerCase() : value;
   continue;
  }
  const entry = fvEntry(line);
  if (!entry.name) continue;
  while (open.length && open[open.length - 1].indent >= indent) open.pop();
  const parent = open[open.length - 1]?.entry;
  if (parent) { parent.folder = true; parent.children.push(entry); } else page.entries.push(entry);
  open.push({ indent, entry });
 }
 return page.entries.length || page.title || page.path ? page : null;
}

const fvTotal = entry => entry.size ?? (entry.children.length ? entry.children.reduce((sum, child) => sum + (fvTotal(child) || 0), 0) || null : null);

function fvFlatten(entries, depth = 0, out = []) {
 for (const entry of entries) {
  out.push({ entry, depth });
  fvFlatten(entry.children, depth + 1, out);
 }
 return out;
}

function fvKind(entry) {
 if (entry.folder) return 'folder';
 const glyph = FileKinds.describe(entry.name).glyph;
 return FV_KINDS.find(([, glyphs]) => glyphs.includes(glyph))?.[0] || 'other';
}

const fvTone = kind => FileKinds.tones[kind === 'folder' ? FV_FOLDER : FV_KINDS.find(([key]) => key === kind)?.[2] || 'gray'];

// How much an entry is (a folder tells what it holds, a file its size) and when it changed.
function fvMeta(entry) {
 const size = entry.size !== null ? FileKinds.formatSize(Math.round(entry.size)) : '';
 const count = entry.count !== null ? I18n.t(entry.count === 1 ? 'files.item' : 'files.items', { n: format(entry.count) }) : '';
 return { amount: entry.folder ? count || size : size, when: entry.when ? fvWhen(entry.when) : '' };
}

const fvFits = (text, max, size, weight) => textWidth(text, size, weight) <= max;

// The end of a text that fits after an ellipsis, like the tail of a long path.
function fvTail(text, max, size, weight) {
 if (fvFits(text, max, size, weight)) return text;
 let from = 0;
 while (from < text.length - 1 && !fvFits(`…${text.slice(from)}`, max, size, weight)) from++;
 return `…${text.slice(from)}`;
}

// A file name on one line keeps its extension: the middle gives way first.
function fvShort(text, max, size, weight) {
 if (fvFits(text, max, size, weight)) return text;
 const dot = text.lastIndexOf('.'), tail = text.slice(dot > 0 && text.length - dot <= 8 ? Math.max(0, dot - 3) : Math.max(0, text.length - 5));
 let head = text.length - tail.length;
 while (head > 1 && !fvFits(`${text.slice(0, head).trimEnd()}…${tail}`, max, size, weight)) head--;
 return `${text.slice(0, head).trimEnd()}…${tail}`;
}

// A file name on two lines: it breaks at a space or after . _ - where it can, and a name too long for both
// keeps its end on the second line, where the extension is.
function fvLines(text, max, size, weight) {
 if (fvFits(text, max, size, weight)) return [text];
 let cut = text.length;
 while (cut > 1 && !fvFits(text.slice(0, cut).trimEnd(), max, size, weight)) cut--;
 const soft = Math.max(text.lastIndexOf(' ', cut), ...['.', '_', '-'].map(c => text.lastIndexOf(c, cut - 1) + 1));
 if (soft > cut * 0.3) cut = soft;
 const rest = text.slice(cut).trimStart();
 return [text.slice(0, cut).trimEnd(), fvTail(rest, max, size, weight)];
}

function filesScene(page, tones, { width }) {
 if (!page) return null;
 // The card fills the column like a code block: the scene keeps the usual margin, the card reaches into it.
 const W = clamp(width - PAD * 2, 280, FV.max), left = -PAD + FV.pad, right = W + PAD - FV.pad, items = [], tips = new Map();
 const flat = fvFlatten(page.entries), shown = flat.slice(0, FV.cap), hidden = flat.length - shown.length + page.more;
 const tree = page.view === 'tree' || (page.view !== 'list' && flat.some(row => row.depth));
 const files = flat.filter(row => !row.entry.folder).length, folders = flat.length - files;
 const total = page.entries.reduce((sum, entry) => sum + (fvTotal(entry) || 0), 0);

 // One line on top: the folder, its name and where it is, and on the right what it holds.
 const title = page.title || page.path.split(/[\\/]/).filter(Boolean).pop() || I18n.t('files.title');
 const counts = [
  files ? I18n.t(files === 1 ? 'files.file' : 'files.files', { n: format(files) }) : '',
  folders ? I18n.t(folders === 1 ? 'files.folder' : 'files.folders', { n: format(folders) }) : '',
 ].filter(Boolean).join(' · ');
 const size = total ? FileKinds.formatSize(Math.round(total)) : '';
 const sumW = (size ? textWidth(size, 12.5, 650) + (counts ? 16 : 0) : 0) + (counts ? textWidth(counts, 12.5, 500) : 0);
 const nameRoom = right - left - 28 - (sumW ? sumW + 20 : 0), name = truncate(title, Math.max(60, nameRoom * 0.6), 14, 650);
 const pathRoom = nameRoom - textWidth(name, 14, 650) - 10;
 items.push({
  key: 'fv:head', type: 'fhead', order: 0, props: { x: 0, y: 0 },
  fixed: { name, path: page.path && pathRoom > 60 ? fvTail(page.path, pathRoom, 12, 500) : '', size, counts, left, right, nameW: textWidth(name, 14, 650) },
 });
 let y = FV.head;

 // What takes the space: a thin line of the kinds inside, in the colors of their icons, parting the head from the list.
 const kinds = new Map();
 for (const { entry, depth } of flat) {
  const bytes = entry.folder ? (depth === 0 && !entry.children.length ? entry.size : null) : entry.size;
  if (bytes) kinds.set(fvKind(entry), (kinds.get(fvKind(entry)) || 0) + bytes);
 }
 const sized = [...kinds.values()].reduce((sum, bytes) => sum + bytes, 0), list = [...kinds].sort((a, b) => b[1] - a[1]);
 if (sized > 0 && flat.filter(row => row.entry.size).length >= 2) {
  const room = right - left - 2 * (list.length - 1), widths = list.map(([, bytes]) => Math.max(3, bytes / sized * room));
  const fit = room / widths.reduce((sum, w) => sum + w, 0);
  let x = left;
  list.forEach(([kind, bytes], i) => {
   const key = `fv:seg:${kind}`, w = widths[i] * fit;
   items.push({ key, type: 'fseg', order: 0.3 + i * 0.08, props: { x, w }, fixed: { y, h: FV.meter, tone: fvTone(kind) } });
   tips.set(key, { title: I18n.t(`files.kind.${kind}`), rows: [{ name: I18n.t('files.size'), value: FileKinds.formatSize(Math.round(bytes)) }, { name: I18n.t('files.share'), value: `${format(Math.round(bytes / sized * 1000) / 10)}%` }] });
   x += w + 2;
  });
 } else items.push({ key: 'fv:rule', type: 'line', order: 0.3, props: { x1: left, y1: y + FV.meter / 2, x2: right, y2: y + FV.meter / 2 }, fixed: { cls: 'dg-fv-rule' } });
 y += FV.meter + 6;

 // The entries: name, then the date and the size in columns on the right; a tree steps folders in.
 const metas = shown.map(({ entry }) => fvMeta(entry));
 const sizeW = Math.max(0, ...metas.map(meta => meta.amount ? textWidth(meta.amount, 12.5, 550) : 0));
 const dateW = tree ? 0 : Math.max(0, ...metas.map(meta => meta.when ? textWidth(meta.when, 12, 500) : 0));
 const sizeX = right, dateX = right - (sizeW ? sizeW + 22 : 0);
 shown.forEach(({ entry, depth }, i) => {
  const key = `fv:row:${i}:${entry.name}`, indent = tree ? depth * FV.indent : 0, x = left + indent + 26;
  const end = (dateW ? dateX - dateW : sizeW ? sizeX - sizeW : right) - 18;
  const label = fvShort(entry.name, Math.max(40, end - x), 13.5, 500);
  const note = entry.note && textWidth(label, 13.5, 500) + 24 < end - x ? fvShort(entry.note, end - x - textWidth(label, 13.5, 500) - 12, 12, 500) : '';
  items.push({
   key, type: 'frow', order: 0.6 + i * 0.1, props: { x: 0, y: y + i * FV.row },
   fixed: {
    name: entry.name, folder: entry.folder, label, note, labelW: textWidth(label, 13.5, 500), iconX: left + indent, textX: x,
    amount: metas[i].amount, when: dateW ? metas[i].when : '', sizeX, dateX, h: FV.row, plateX: -PAD + 6, plateW: W + PAD * 2 - 12,
    rule: i < shown.length - 1 || hidden > 0 ? x : 0, right,
   },
  });
  // The row already says what a tip would, so it only lights up.
  tips.set(key, { silent: true });
 });
 // In a tree a quiet line runs down from each open folder along what it holds.
 if (tree) {
  shown.forEach(({ entry, depth }, i) => {
   let end = i;
   while (end + 1 < shown.length && shown[end + 1].depth > depth) end++;
   if (end === i) return;
   const x = left + depth * FV.indent + 8;
   items.push({ key: `fv:guide:${i}:${entry.name}`, type: 'line', order: 0.8 + i * 0.1, props: { x1: x, y1: y + i * FV.row + FV.row - 7, x2: x, y2: y + end * FV.row + FV.row / 2 }, fixed: { cls: 'dg-fv-guide', draw: true } });
  });
 }
 y += shown.length * FV.row;
 if (hidden > 0) {
  items.push({ key: 'fv:more', type: 'label', order: 0.6 + shown.length * 0.1, props: { x: left + 26, y: y + FV.row / 2 }, fixed: { lines: [I18n.t('files.more', { n: format(hidden) })], cls: 'dg-fv-more', anchor: 'start' } });
  y += FV.row;
 }
 y += 6;
 // The card goes under everything and grows with the list as the reply comes in.
 items.push({ key: 'fv:card', type: 'fcard', order: 0, props: { x: -PAD, y: -6, w: W + PAD * 2, h: y + 6 }, fixed: {} });
 return { kind: 'files', width: W, height: y, items, tips };
}

/* Figures: numbers that are read rather than plotted */

// Rows of a ledger: a name, its number, then a note. `unit` says what the numbers are, `series A, B` names several
// numbers in a row, `total` adds their sum as a last line.
function parseBars(lines) {
 const data = { title: '', total: null, names: [], rows: [] };
 let unit = '';
 for (const raw of lines.slice(1)) {
  const line = bare(raw);
  let m;
  if (!line.includes('|')) {
   if ((m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.title = unquote(m[1]); continue; }
   if ((m = /^unit(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { unit = unquote(m[1]); continue; }
   if ((m = /^series(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.names = splitList(m[1]).map(unquote); continue; }
   // `total` alone asks for the sum. A word after it is what the line is called; a number after it is the sum as
   // the model counted it, and the line keeps the word as written.
   if ((m = TOTAL_WORD.exec(line)) && !amount(rowCells(line)[1] || '')) {
    const rest = line.slice(m[0].length).replace(/^[:\s]+/, ''), word = sumName(m[1], lines);
    data.total = amount(rest) ? word : unquote(rest) || word;
    continue;
   }
  }
  const cells = rowCells(line), count = Math.max(1, data.names.length), values = [];
  // A sum the model wrote out as a row of its own is the total line, not one more bar: the sum is counted here.
  if (count === 1 && cells.length > 1 && sumRow(unquote(cells[0]), NaN, 0)) { data.total = unquote(cells[0]).replace(/[:.\s]+$/, ''); continue; }
  for (const cell of cells.slice(1, 1 + count)) { const a = amount(cell); if (a) values.push(a); else break; }
  if (values.length) data.rows.push({ label: unquote(cells[0]), values, note: cells.slice(1 + values.length).filter(Boolean).map(unquote).join(' · ') });
 }
 // The same for a row whose name only opens with such a word, `Итого за день`, when its number is the sum of the rest.
 if (data.total === null && data.rows.length > 2 && data.rows.every(row => row.values.length === 1)) {
  const whole = data.rows.reduce((sum, row) => sum + row.values[0].value, 0);
  const at = data.rows.findIndex(row => sumRow(row.label, row.values[0].value, whole - row.values[0].value));
  if (at >= 0) data.total = data.rows.splice(at, 1)[0].label;
 }
 if (!data.rows.length) return null;
 // The unit is the one named, or the one every number carries.
 const first = data.rows[0].values[0], same = key => data.rows.every(row => row.values.every(v => v[key] === first[key])) ? first[key] : '';
 const before = same('before'), after = unit || same('after');
 data.amount = value => withUnit(value, before, after);
 data.unit = { before, after };
 for (const row of data.rows) row.values = row.values.map(v => ({ value: v.value, text: before || after ? data.amount(v.value) : withUnit(v.value, v.before, v.after) }));
 return data;
}

// A bar chart turned on its side is a ledger: its categories become the rows.
function ledgerOf(data) {
 const bars = data.series.filter(s => s.type === 'bar'), text = value => withUnit(value, '', data.yTitle);
 return {
  title: data.title, total: null, names: bars.map(s => s.name), amount: text,
  rows: data.labels.map((label, i) => ({ label, note: '', values: bars.map(s => ({ value: s.values[i], text: Number.isFinite(s.values[i]) ? text(s.values[i]) : '' })) })),
 };
}

// A ledger: names down the left, a thin bar for each number, the numbers in a column on the right.
// One number in a row reads as a ranked list; several become thin bars one under another, with a legend.
function ledgerScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 280, LEDGER.max), items = [], tips = new Map();
 const series = Math.max(1, ...data.rows.map(row => row.values.length)), many = series > 1;
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  top = LEDGER.head;
  corner = { x: title.width + 16, h: 28 };
 }
 if (many && data.names.some(Boolean)) {
  const row = chips(Array.from({ length: series }, (_, k) => ({ text: data.names[k] || `${k + 1}`, tone: slot(SERIES, k), mark: 'bar' })), 0, top + 9, W);
  items.push(...row.items);
  if (!corner) corner = { x: row.width + 16, h: 20 };
  top += row.height + 4;
 }
 const all = data.rows.flatMap(row => row.values.map(v => v.value)).filter(Number.isFinite);
 const lo = Math.min(0, ...all), hi = Math.max(0, ...all), span = hi - lo || 1;
 const sum = data.total !== null && !many ? data.rows.reduce((s, row) => s + (row.values[0]?.value || 0), 0) : null;
 const share = sum ? row => `${format(Math.round(row.values[0].value / sum * 1000) / 10)}%` : null;
 // A unit of several words is said once, over the column of numbers, rather than after every one of them.
 const once = !many && data.unit && !data.unit.before && widthOf(data.unit.after, FONT.amount) > 40 ? data.unit.after : '';
 const said = once ? value => withUnit(value, '', '') : data.amount;
 const texts = data.rows.flatMap(row => row.values.map(v => once ? said(v.value) : v.text));
 const valueW = Math.max(...texts.map(text => widthOf(text, many ? FONT.value : FONT.amount)), sum !== null ? widthOf(said(sum), FONT.strong) : 0);
 const shareW = share ? Math.max(...data.rows.map(row => widthOf(share(row), FONT.tick))) + 14 : 0;
 const labelW = Math.min(W * 0.44, 260, Math.max(...data.rows.map(row => Math.max(widthOf(row.label, FONT.row), row.note ? widthOf(row.note, FONT.tick) : 0))));
 if (once) {
  items.push({ key: 'lu', type: 'label', layer: 'back', order: 0.25, props: { x: W - shareW, y: top + 7 }, fixed: { lines: [truncate(once, W * 0.5, ...FONT.tick)], anchor: 'end', cls: 'dg-row-note' } });
  top += 18;
 }
 // The numbers of a lone series stand in a column; those of several ride at the end of their bars.
 const barX = labelW + 16, barW = Math.max(40, W - shareW - valueW - (many ? 8 : 14) - barX);
 const x = v => barX + (v - lo) / span * barW, zero = x(0);
 let y = top + 2;
 const first = y;
 data.rows.forEach((row, i) => {
  // A note too long for its column takes a second line under the first; past that it is cut.
  const notes = !row.note ? [] : many ? [truncate(row.note, labelW, ...FONT.tick)] : wrap(row.note, labelW, ...FONT.tick), more = notes.length > 1 ? 14 : 0;
  if (notes.length > 2) notes.splice(1, notes.length, truncate(notes.slice(1).join(' '), labelW, ...FONT.tick));
  const h = many ? Math.max(LEDGER.row, series * LEDGER.pitch + 10) : row.note ? LEDGER.noted + more : LEDGER.row, cy = y + h / 2, order = 0.3 + i * 0.12;
  items.push({ key: `lr:${i}`, type: 'hit', layer: 'back', order, props: { x: -8, y, w: W + 16, h }, fixed: {} });
  tips.set(`lr:${i}`, { silent: true });
  items.push({ key: `ln:${i}`, type: 'label', order, props: { x: 0, y: row.note ? cy - 8 - more / 2 : cy }, fixed: { lines: [truncate(row.label, labelW, ...FONT.row)], anchor: 'start', cls: 'dg-row-name' } });
  if (row.note) items.push({ key: `lo:${i}`, type: 'label', order: order + 0.05, props: { x: 0, y: cy + 9 }, fixed: { lines: notes, anchor: 'start', lineHeight: 14, cls: 'dg-row-note' } });
  row.values.forEach((v, k) => {
   if (!Number.isFinite(v.value)) return;
   const by = many ? cy + (k - (series - 1) / 2) * LEDGER.pitch : cy, back = v.value < 0, w = Math.max(2, Math.abs(x(v.value) - zero)), x0 = back ? zero - w : zero;
   items.push({ key: `lb:${i}:${k}`, type: 'span', order: order + 0.1 + k * 0.03, props: { x: x0, y: by, w, h: many ? 5 : LEDGER.bar }, fixed: { cls: 'dg-ledger-bar', tone: slot(ring(tones, series), k), rx: 3, back } });
   if (many) items.push({ key: `lv:${i}:${k}`, type: 'label', order: order + 0.3, props: { x: Math.max(zero, x0 + w) + 6, y: by }, fixed: { lines: [v.text], anchor: 'start', cls: 'dg-value' } });
   else items.push({ key: `lv:${i}`, type: 'label', order: order + 0.3, props: { x: W - shareW, y: cy }, fixed: { lines: [once ? said(v.value) : v.text], anchor: 'end', cls: 'dg-row-value' } });
  });
  if (share) items.push({ key: `ls:${i}`, type: 'label', order: order + 0.35, props: { x: W, y: cy }, fixed: { lines: [share(row)], anchor: 'end', cls: 'dg-row-share' } });
  y += h;
 });
 if (lo < 0) items.push({ key: 'lz', type: 'line', layer: 'back', order: 0.2, props: { x1: zero, y1: first + 4, x2: zero, y2: y - 4 }, fixed: { cls: 'dg-line', draw: true } });
 if (sum !== null) {
  const order = 0.4 + data.rows.length * 0.12;
  items.push({ key: 'lt:rule', type: 'line', layer: 'back', order, props: { x1: 0, y1: y + 6, x2: W, y2: y + 6 }, fixed: { cls: 'dg-line', draw: true } });
  items.push({ key: 'lt:name', type: 'label', order: order + 0.1, props: { x: 0, y: y + 23 }, fixed: { lines: [truncate(data.total, W * 0.6, ...FONT.strong)], anchor: 'start', cls: 'dg-row-total' } });
  items.push({ key: 'lt:value', type: 'label', order: order + 0.2, props: { x: W - shareW, y: y + 23 }, fixed: { lines: [said(sum)], anchor: 'end', cls: 'dg-row-total' } });
  y += 36;
 }
 return { kind: 'ledger', width: W, height: y + 2, items, tips, corner, flush: true };
}

// Figures to take in at a glance. A row is a name and its value and then, in any order: a change (+4.2%, −0.6 kg, with
// good or bad after it to say which way is welcome), a target (of 2200), a run of numbers for a small line of the
// trend, or a note.
function parseMetrics(lines) {
 const data = { title: '', tiles: [] };
 for (const raw of lines.slice(1)) {
  const line = bare(raw);
  let m;
  if (!line.includes('|') && (m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.title = unquote(m[1]); continue; }
  const cells = rowCells(line);
  // Without bars a row is told from a line of prose by its number: `Note: the figures are rounded` is not a figure.
  if (!cells[0] || !cells[1] || (!line.includes('|') && !/\d/.test(cells[1]))) continue;
  const tile = { label: unquote(cells[0]), value: unquote(cells[1]).replace(/^-(?=\d)/, '−'), change: null, target: null, trend: null, note: '' };
  let mood = '';
  for (const cell of cells.slice(2).filter(Boolean)) {
   const run = cell.split(/[\s,;]+/).filter(Boolean).map(number);
   // good or bad in a cell of its own says which way the change is welcome; it is not a note to print.
   if (/^(?:good|bad|warn)$/i.test(cell)) mood = cell.toLowerCase();
   else if (!tile.target && (m = /^(?:of|out of|from|из|\/)\s*(.+)$/i.exec(cell)) && amount(m[1])) tile.target = { value: amount(m[1]).value, text: unquote(cell) };
   else if (!tile.trend && run.length >= 3 && run.every(Number.isFinite)) tile.trend = run;
   else if (!tile.change && (m = /^([+\-−–▲▼↑↓])\s*(.*?)(?:\s+(good|bad))?$/i.exec(cell)) && /\d/.test(m[2])) tile.change = { text: `${'+▲↑'.includes(m[1]) ? '+' : '−'}${m[2]}`, mood: (m[3] || '').toLowerCase() };
   else tile.note = tile.note ? `${tile.note} · ${unquote(cell)}` : unquote(cell);
  }
  // The figure is the leading run with digits in it; what follows it is the unit.
  const split = /^(\S*\d\S*(?:[ \u00a0\u202f]\d\S*)*)\s*(.*)$/.exec(tile.value);
  // A value of several numbers, 7 h 40 min, is one figure: nothing in it is a unit to set small.
  const whole = !split || /\d/.test(split[2]);
  tile.figure = whole ? tile.value : split[1];
  tile.unit = whole ? '' : split[2];
  // Said of a change, it colours the change; said of the figure alone, it puts a mark by its name.
  if (mood && mood !== 'warn' && tile.change && !tile.change.mood) tile.change.mood = mood;
  else if (mood && !tile.change?.mood) tile.mood = mood;
  data.tiles.push(tile);
 }
 return data.tiles.length ? data : null;
}

function metricsScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 260, METRICS.max), n = data.tiles.length, items = [];
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  top = METRICS.head;
  corner = { x: title.width + 16, h: 28 };
 }
 // Tiles stand in rows of equal columns, parted by hairlines; the last row may be shorter, never a lone tile wider.
 const fit = Math.max(1, Math.min(n, 4, Math.floor((W + METRICS.gap) / (METRICS.min + METRICS.gap))));
 const rows = Math.ceil(n / fit), cols = Math.ceil(n / rows), colW = (W - METRICS.gap * (cols - 1)) / cols;
 let y = top + 2;
 for (let r = 0; r < rows; r++) {
  const row = data.tiles.slice(r * cols, r * cols + cols);
  const tall = Math.max(...row.map(tile => 57 + (tile.change || tile.note ? 20 : 0) + (tile.target ? 24 : 0) + (tile.trend ? 36 : 0)));
  if (r) items.push({ key: `mr:${r}`, type: 'line', layer: 'back', order: r, props: { x1: 0, y1: y - 12, x2: W, y2: y - 12 }, fixed: { cls: 'dg-grid', draw: true } });
  row.forEach((tile, k) => {
   const i = r * cols + k, x0 = k * (colW + METRICS.gap), order = 0.2 + i * 0.35, key = `mt:${i}`;
   if (k) items.push({ key: `${key}:rule`, type: 'line', layer: 'back', order, props: { x1: x0 - METRICS.gap / 2, y1: y + 2, x2: x0 - METRICS.gap / 2, y2: y + tall - 6 }, fixed: { cls: 'dg-grid', draw: true } });
   const name = truncate(tile.label, colW - (tile.mood ? 12 : 0), ...FONT.legend);
   items.push({ key: `${key}:name`, type: 'label', order, props: { x: x0, y: y + 8 }, fixed: { lines: [name], anchor: 'start', cls: 'dg-metric-name' } });
   if (tile.mood) items.push({ key: `${key}:mood`, type: 'dot', order: order + 0.03, props: { x: x0 + widthOf(name, FONT.legend) + 9, y: y + 8.5, r: 3.5 }, fixed: { cls: `dg-state is-${tile.mood}` } });
   // The figure keeps its size while it fits the tile, and steps down when it does not.
   const size = METRICS.sizes.find(s => textWidth(tile.figure, s, FONT.figure[1]) + (tile.unit ? textWidth(tile.unit, 12, 450) + 5 : 0) <= colW) || METRICS.sizes[METRICS.sizes.length - 1];
   items.push({ key: `${key}:figure`, type: 'figure', order: order + 0.05, props: { x: x0, y: y + 41 }, fixed: { figure: tile.figure, unit: tile.unit, size } });
   let ty = y + 63;
   if (tile.change || tile.note) {
    let tx = x0;
    if (tile.change) {
     items.push({ key: `${key}:change`, type: 'label', order: order + 0.15, props: { x: tx, y: ty }, fixed: { lines: [tile.change.text], anchor: 'start', cls: `dg-metric-change${tile.change.mood ? ` is-${tile.change.mood}` : ''}` } });
     tx += widthOf(tile.change.text, FONT.change) + 8;
    }
    if (tile.note && colW - (tx - x0) > 30) items.push({ key: `${key}:note`, type: 'label', order: order + 0.2, props: { x: tx, y: ty }, fixed: { lines: [truncate(tile.note, colW - (tx - x0), ...FONT.tick)], anchor: 'start', cls: 'dg-metric-note' } });
    ty += 20;
   }
   const now = amount(tile.figure)?.value;
   if (tile.target && Number.isFinite(now) && tile.target.value > 0) {
    // How far along: a thin track of the accent, filled up to the share reached.
    const part = now / tile.target.value, percent = `${format(Math.round(part * 100))}%`;
    items.push({ key: `${key}:track`, type: 'rect', layer: 'nodes', order: order + 0.2, props: { x: x0, y: ty - 4, w: colW, h: 4 }, fixed: { cls: 'dg-meter-track', tone: tones[0], rx: 2 } });
    items.push({ key: `${key}:fill`, type: 'span', order: order + 0.25, props: { x: x0, y: ty - 2, w: Math.max(3, colW * clamp01(part)), h: 4 }, fixed: { cls: 'dg-meter-fill', tone: tones[0], rx: 2 } });
    items.push({ key: `${key}:part`, type: 'label', order: order + 0.3, props: { x: x0, y: ty + 11 }, fixed: { lines: [percent], anchor: 'start', cls: 'dg-value' } });
    items.push({ key: `${key}:goal`, type: 'label', order: order + 0.3, props: { x: x0 + colW, y: ty + 11 }, fixed: { lines: [truncate(tile.target.text, colW - widthOf(percent, FONT.value) - 10, ...FONT.tick)], anchor: 'end', cls: 'dg-metric-note' } });
    ty += 24;
   }
   if (tile.trend) {
    const v = tile.trend, low = Math.min(...v), high = Math.max(...v), sw = Math.min(colW - 6, 150), sh = 22, base = ty + 4;
    const points = v.map((value, j) => [x0 + sw * j / (v.length - 1), base + sh - (high > low ? (value - low) / (high - low) : 0.5) * sh]);
    items.push({ key: `${key}:trend`, type: 'edge', order: order + 0.3, props: { pts: smoothPts(points) }, fixed: { style: 'solid', head: 'none', tone: tones[0], cls: 'dg-stroke dg-spark', draw: 700 } });
    items.push({ key: `${key}:now`, type: 'dot', order: order + 0.6, props: { x: points[v.length - 1][0], y: points[v.length - 1][1], r: 3 }, fixed: { cls: 'dg-point', tone: tones[0] } });
   }
  });
  y += tall + 18;
 }
 return { kind: 'metrics', width: W, height: y - 18, items, corner, flush: true };
}

// Values against what is normal for them. A row is a name, the value and the range: 130-170, or <5.2, or >30.
// A bound may be said in words, up to 15 or не менее 4,2; the longer sayings come first, so that `не более` is
// not read as `более`.
const BOUND_HIGH = /^(?:<=?|≤|до|не более|не больше|не выше|менее|меньше|ниже|макс\.?|max\.?|under|below|up to|at most|less than|no more than|not more than)\s*(.+)$/i;
const BOUND_LOW = /^(?:>=?|≥|от|не менее|не меньше|не ниже|более|больше|выше|мин\.?|min\.?|over|above|from|at least|more than|no less than|not less than)\s*(.+)$/i;
const RANGE = /^([+\-−]?\d[\d.,]*?)\s*(?:-|–|—|\.{2,}|\s(?:to|до)\s)\s*([+\-−]?\d[\d.,]*)(?![\d.,])/i;

function parseRanges(lines) {
 const data = { title: '', rows: [] };
 for (const raw of lines.slice(1)) {
  const line = bare(raw);
  let m;
  if (!line.includes('|') && (m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.title = unquote(m[1]); continue; }
  const cells = rowCells(line), value = amount(cells[1] || ''), range = (cells[2] || '').replace(/^(?:norm|normal|норма|ref\.?|reference|референс)[:\s]*/i, ''), both = range.replace(/^(?:от|from)\s+/i, '');
  if (!cells[0] || !value) continue;
  let low = null, high = null, unit = '';
  if ((m = RANGE.exec(both))) { low = amount(m[1])?.value ?? null; high = amount(m[2])?.value ?? null; unit = both.slice(m[0].length).trim(); }
  else if ((m = BOUND_HIGH.exec(range))) { high = amount(m[1])?.value ?? null; unit = amount(m[1])?.after || ''; }
  else if ((m = BOUND_LOW.exec(range))) { low = amount(m[1])?.value ?? null; unit = amount(m[1])?.after || ''; }
  if (low === null && high === null) continue;
  if (low !== null && high !== null && low > high) [low, high] = [high, low];
  // A unit written only beside the range belongs to the value as well.
  const text = unquote(cells[1]).replace(/^-(?=\s*\d)/, '−');
  data.rows.push({ label: unquote(cells[0]), value: value.value, text: !value.before && !value.after && /^[^\d(]{1,12}$/.test(unit) ? `${text} ${unit}` : text, low, high });
 }
 return data.rows.length ? data : null;
}

function rangesScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 300, RANGES.max), items = [], tips = new Map();
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  top = RANGES.head;
  corner = { x: title.width + 16, h: 28 };
 }
 const labelW = Math.min(W * 0.34, 220, Math.max(...data.rows.map(row => widthOf(row.label, FONT.row))));
 const valueW = Math.max(...data.rows.map(row => widthOf(row.text, FONT.amount))) + 16;
 const x0 = labelW + 20, x1 = W - valueW - 14, span = x1 - x0, [za, zb] = RANGES.zone;
 // Every normal range lies on the same stretch of its track, so the rows read as one column: left of it is low,
 // right of it is high.
 const at = row => {
  const { low, high, value } = row;
  if (low !== null && high !== null) return clamp(za + (value - low) / (high - low || 1) * (zb - za), 0.02, 0.98);
  if (high !== null) return value <= high ? clamp(zb * value / (high || 1), 0.02, zb) : clamp(zb + (value - high) / (Math.abs(high) || 1) * (zb - za), zb, 0.98);
  return value >= low ? clamp(za + (value - low) / (Math.abs(low) || 1) * (zb - za), za, 0.98) : clamp(za * value / (low || 1), 0.02, za);
 };
 let y = top + 2;
 data.rows.forEach((row, i) => {
  const cy = y + 16, order = 0.3 + i * 0.3, key = `rg:${i}`, t = at(row), out = (row.low !== null && row.value < row.low) || (row.high !== null && row.value > row.high);
  const from = row.low === null ? 0 : za, to = row.high === null ? 1 : zb;
  items.push({ key: `${key}:hit`, type: 'hit', layer: 'back', order, props: { x: -8, y: y - 2, w: W + 16, h: RANGES.row - 4 }, fixed: {} });
  tips.set(`${key}:hit`, { silent: true });
  items.push({ key: `${key}:name`, type: 'label', order, props: { x: 0, y: cy }, fixed: { lines: [truncate(row.label, labelW, ...FONT.row)], anchor: 'start', cls: 'dg-row-name' } });
  items.push({ key: `${key}:track`, type: 'line', layer: 'back', order, props: { x1: x0, y1: cy, x2: x1, y2: cy }, fixed: { cls: 'dg-range-track', draw: true } });
  items.push({ key: `${key}:zone`, type: 'span', layer: 'edges', order: order + 0.1, props: { x: x0 + span * from, y: cy, w: span * (to - from), h: 6 }, fixed: { cls: 'dg-range-zone', rx: 3 } });
  if (row.low !== null) items.push({ key: `${key}:low`, type: 'label', layer: 'back', order: order + 0.15, props: { x: x0 + span * za, y: cy + 15 }, fixed: { lines: [format(row.low)], cls: 'dg-tick' } });
  if (row.high !== null) items.push({ key: `${key}:high`, type: 'label', layer: 'back', order: order + 0.15, props: { x: x0 + span * zb, y: cy + 15 }, fixed: { lines: [format(row.high)], cls: 'dg-tick' } });
  items.push({ key: `${key}:mark`, type: 'dot', order: order + 0.3, props: { x: x0 + span * t, y: cy, r: 5 }, fixed: { cls: `dg-range-mark${out ? ' is-out' : ''}`, tone: tones[0] } });
  items.push({ key: `${key}:value`, type: 'label', order: order + 0.2, props: { x: W, y: cy }, fixed: { lines: [row.text], anchor: 'end', cls: 'dg-row-value' } });
  // Out of range says so twice: the mark changes colour, and an arrow by the number tells which way.
  if (out) items.push({ key: `${key}:way`, type: 'label', order: order + 0.35, props: { x: W - widthOf(row.text, FONT.amount) - 6, y: cy }, fixed: { lines: [row.high !== null && row.value > row.high ? '↑' : '↓'], anchor: 'end', cls: 'dg-range-way' } });
  y += RANGES.row;
 });
 return { kind: 'ranges', width: W, height: y - 8, items, tips, corner, flush: true };
}

/* Plans: what goes where, and what follows what */

// Columns with cards: the days of a week with what to do, stages with their tasks, options side by side.
// A line at the left edge opens a column: its name and, after · or a colon, what it is about. The lines indented
// under it are its cards: a text, then notes after |. Mermaid's kanban is read the same way.
function parseBoard(lines) {
 const data = { title: '', columns: [] };
 let base = null, card = null, deep = 0, plain = null;
 for (const raw of lines.slice(1)) {
  const indent = indentOf(raw), bullet = /^\s*[-*•]\s/.test(raw);
  let line = bare(raw), m, extra = [];
  if (!line) continue;
  if (!data.columns.length && (m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.title = unquote(m[1]); continue; }
  base ??= indent;
  // Mermaid writes a card as id[Text]@{ assigned: 'anna', priority: 'High' }.
  if ((m = /@\{(.*)\}\s*$/.exec(line))) {
   extra = [...m[1].matchAll(/[\w-]+\s*:\s*(?:'([^']*)'|"([^"]*)"|([^,}]+))/g)].map(e => (e[1] ?? e[2] ?? e[3]).trim()).filter(Boolean);
   line = line.slice(0, m.index).trim();
  }
  if ((m = /^[\w-]*\[(.*)\]$/.exec(line))) line = m[1];
  // In a list written flat, without indents, the bullets tell the cards from the columns they belong to.
  if (indent <= base && !(bullet && plain && data.columns.length)) {
   const parts = /^(.+?)\s+(?:·|—|–|\|)\s+(.+)$/.exec(line) || /^([^:]{1,24}):\s+(.+)$/.exec(line);
   data.columns.push({ title: cleanLabel(parts ? parts[1] : line), sub: parts ? cleanLabel(parts[2]) : '', cards: [] });
   plain ??= !bullet;
   card = null;
   continue;
  }
  const column = data.columns[data.columns.length - 1];
  if (card && indent > deep) { card.meta.push(cleanLabel(line)); continue; }
  const cells = cellsOf(line), head = /^([^:|]{1,22}):\s+(.+)$/.exec(cells[0]);
  card = { head: head ? cleanLabel(head[1]) : '', text: cleanLabel(head ? head[2] : cells[0]), meta: [...cells.slice(1).filter(Boolean).map(cleanLabel), ...extra] };
  deep = indent;
  column.cards.push(card);
 }
 return data.columns.length ? data : null;
}

function boardScene(data, tones, { width }) {
 if (!data) return null;
 const room = Math.max(260, width - PAD * 2), n = data.columns.length, items = [], tips = new Map();
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, room - 80);
  items.push(title.item);
  top = BOARD.head;
  corner = { x: title.width + 16, h: 28 };
 }
 // As many columns in a row as fit at a width that reads; more wrap into rows of equal length.
 const fit = Math.max(1, Math.min(n, Math.floor((room + BOARD.gap) / (BOARD.min + BOARD.gap))));
 const rows = Math.ceil(n / fit), per = Math.ceil(n / rows);
 const colW = Math.min(BOARD.max, (room - BOARD.gap * (per - 1)) / per), inner = colW - BOARD.pad * 2;
 let y = top;
 for (let r = 0; r < rows; r++) {
  let tall = 0;
  data.columns.slice(r * per, r * per + per).forEach((column, k) => {
   const c = r * per + k, x0 = k * (colW + BOARD.gap), order = 0.2 + c * 0.3;
   const name = truncate(column.title, colW, ...FONT.strong), nameW = widthOf(name, FONT.strong);
   items.push({ key: `bc:${c}`, type: 'label', order, props: { x: x0, y: y + 9 }, fixed: { lines: [name], anchor: 'start', cls: 'dg-col-name' } });
   let cy = y + 23;
   if (column.sub) {
    // What a column is about stands beside its name when there is room, and under it when there is not.
    const beside = colW - nameW - 8 >= Math.min(64, widthOf(column.sub, FONT.tick));
    items.push({ key: `bc:${c}:sub`, type: 'label', order: order + 0.03, props: { x: beside ? x0 + nameW + 8 : x0, y: beside ? y + 9.5 : y + 26 }, fixed: { lines: [truncate(column.sub, beside ? colW - nameW - 8 : colW, ...FONT.tick)], anchor: 'start', cls: 'dg-col-sub' } });
    if (!beside) cy += 16;
   }
   items.push({ key: `bc:${c}:rule`, type: 'line', layer: 'back', order: order + 0.05, props: { x1: x0, y1: cy, x2: x0 + colW, y2: cy }, fixed: { cls: 'dg-line', draw: true } });
   cy += 10;
   column.cards.forEach((card, j) => {
    const key = `bk:${c}:${j}`, at = order + 0.1 + j * 0.06;
    const text = wrap(card.text, inner, ...FONT.row), meta = card.meta.flatMap(line => wrap(line, inner, ...FONT.tick));
    const h = BOARD.pad * 2 - 2 + (card.head ? 16 : 0) + text.length * 17 + (meta.length ? 3 + meta.length * 15 : 0);
    items.push({ key, type: 'wbox', layer: 'edges', order: at, props: { x: x0, y: cy, w: colW, h }, fixed: { cls: 'dg-plate', rx: 8 } });
    let ty = cy + BOARD.pad - 1;
    if (card.head) {
     items.push({ key: `${key}:h`, type: 'label', order: at + 0.02, props: { x: x0 + BOARD.pad, y: ty + 6 }, fixed: { lines: [caps(card.head, inner)], anchor: 'start', cls: 'dg-eyebrow' } });
     ty += 16;
    }
    items.push({ key: `${key}:t`, type: 'label', order: at + 0.03, props: { x: x0 + BOARD.pad, y: ty }, fixed: { lines: text, anchor: 'start', baseline: 'below', lineHeight: 17, cls: 'dg-row-name' } });
    ty += text.length * 17;
    if (meta.length) items.push({ key: `${key}:m`, type: 'label', order: at + 0.04, props: { x: x0 + BOARD.pad, y: ty + 3 }, fixed: { lines: meta, anchor: 'start', baseline: 'below', lineHeight: 15, cls: 'dg-row-note' } });
    for (const part of [key, `${key}:h`, `${key}:t`, `${key}:m`]) tips.set(part, { silent: true, hot: [key] });
    cy += h + 8;
   });
   tall = Math.max(tall, cy - (column.cards.length ? 8 : 10) - y);
  });
  y += tall + 24;
 }
 return { kind: 'board', width: per * colW + BOARD.gap * (per - 1), height: y - 24, items, tips, corner };
}

// Mermaid's journey: its sections become columns and its tasks cards, each with how it goes, out of five, and who is in it.
function parseJourney(lines) {
 const data = { title: '', columns: [] };
 for (const raw of lines.slice(1)) {
  const line = raw.trim();
  let m;
  if ((m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.title = unquote(m[1]); continue; }
  if ((m = /^section\s+(.+)$/i.exec(line))) { data.columns.push({ title: cleanLabel(m[1]), sub: '', cards: [] }); continue; }
  const parts = line.split(/\s*:\s*/), score = clamp(Math.round(number(parts[1] ?? '')), 0, 5);
  if (!parts[0]) continue;
  if (!data.columns.length) data.columns.push({ title: '', sub: '', cards: [] });
  const rating = Number.isFinite(score) ? `${'●'.repeat(score)}${'○'.repeat(5 - score)}` : '';
  data.columns[data.columns.length - 1].cards.push({ head: '', text: cleanLabel(parts[0]), meta: [[rating, parts.slice(2).join(', ')].filter(Boolean).join(' · ')].filter(Boolean) });
 }
 return data.columns.some(column => column.cards.length) ? data : null;
}

// A procedure: steps in order. A line at the left edge is a step, and after | what it takes: time, tools, a torque.
// The lines indented under it are remarks; one that starts with ! is a warning. A step that starts with [x] is done.
function parseSteps(lines) {
 const data = { title: '', steps: [] };
 let base = null;
 for (const raw of lines.slice(1)) {
  const indent = indentOf(raw), line = bare(raw);
  let m;
  if (!line) continue;
  if (!data.steps.length && !line.includes('|') && (m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.title = unquote(m[1]); continue; }
  base ??= indent;
  const last = data.steps[data.steps.length - 1];
  if (indent > base && last) {
   const warn = /^(?:!+|⚠️?|warning:|caution:|внимание:|осторожно:)\s*/i.exec(line);
   last.notes.push({ text: cleanLabel(line.slice(warn ? warn[0].length : 0)), warn: !!warn });
   continue;
  }
  const cells = cellsOf(line.replace(/^\d{1,2}[.)]\s+/, '')), box = /^(?:\[([ xXvV✓✔])\]|([✓✔✅]))\s*/.exec(cells[0]);
  const text = cleanLabel(box ? cells[0].slice(box[0].length) : cells[0]);
  if (text) data.steps.push({ text, done: !!box && (box[1] ?? 'x') !== ' ', meta: cells.slice(1).filter(Boolean).map(cleanLabel), notes: [] });
 }
 return data.steps.length ? data : null;
}

function stepsScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 280, STEPS.max), items = [], R = STEPS.mark, textX = R * 2 + 14;
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  top = STEPS.head;
  corner = { x: title.width + 16, h: 28 };
 }
 let y = top + 2;
 data.steps.forEach((step, i) => {
  const order = 0.3 + i * 0.45, key = `st:${i}`, cy = y + R;
  // What a step takes stands at the right of its first line; a long list of it goes under the step instead.
  const meta = step.meta.join(' · '), aside = meta && widthOf(meta, FONT.tick) <= W * 0.42;
  const lines = wrap(step.text, W - textX - (aside ? widthOf(meta, FONT.tick) + 18 : 0), ...FONT.step);
  // A step keeps its number until it is done; then a tick takes its place and the step steps back.
  items.push({ key: `${key}:mark`, type: 'dot', layer: 'nodes', order, props: { x: R, y: cy, r: R }, fixed: { cls: step.done ? 'dg-step-mark is-done' : 'dg-step-mark', tone: tones[0] } });
  if (step.done) items.push({ key: `${key}:tick`, type: 'wglyph', order: order + 0.05, props: { x: R, y: cy, s: 15 }, fixed: { icon: 'check', cls: 'is-done', tone: tones[0] } });
  else items.push({ key: `${key}:n`, type: 'label', order: order + 0.05, props: { x: R, y: cy }, fixed: { lines: [String(i + 1)], cls: 'dg-step-n' } });
  items.push({ key: `${key}:t`, type: 'label', order: order + 0.1, props: { x: textX, y: cy - 7 }, fixed: { lines, anchor: 'start', baseline: 'below', lineHeight: 18, cls: step.done ? 'dg-step-text is-done' : 'dg-step-text' } });
  if (aside) items.push({ key: `${key}:meta`, type: 'label', order: order + 0.15, props: { x: W, y: cy }, fixed: { lines: [meta], anchor: 'end', cls: 'dg-step-meta' } });
  let ty = cy - 7 + lines.length * 18;
  if (meta && !aside) {
   const under = wrap(meta, W - textX, ...FONT.tick);
   items.push({ key: `${key}:meta`, type: 'label', order: order + 0.15, props: { x: textX, y: ty + 2 }, fixed: { lines: under, anchor: 'start', baseline: 'below', lineHeight: 15, cls: 'dg-step-meta' } });
   ty += 2 + under.length * 15;
  }
  step.notes.forEach((note, j) => {
   const shift = note.warn ? 20 : 0, text = wrap(note.text, W - textX - shift, ...FONT.note);
   if (note.warn) items.push({ key: `${key}:w${j}`, type: 'wglyph', order: order + 0.2 + j * 0.05, props: { x: textX + 7, y: ty + 12, s: 15 }, fixed: { icon: 'warn', cls: 'is-warn' } });
   items.push({ key: `${key}:o${j}`, type: 'label', order: order + 0.2 + j * 0.05, props: { x: textX + shift, y: ty + 4 }, fixed: { lines: text, anchor: 'start', baseline: 'below', lineHeight: 16, cls: note.warn ? 'dg-step-warn' : 'dg-step-note' } });
   ty += 4 + text.length * 16;
  });
  const bottom = Math.max(ty, cy + R);
  if (i < data.steps.length - 1) items.push({ key: `${key}:rail`, type: 'line', layer: 'back', order: order + 0.2, props: { x1: R, y1: cy + R + 4, x2: R, y2: bottom + STEPS.gap - 4 }, fixed: { cls: 'dg-rail', draw: true } });
  y = bottom + STEPS.gap;
 });
 return { kind: 'steps', width: W, height: y - STEPS.gap, items, corner, flush: true };
}

/* Money and flows */

// How a number comes about: where it starts, what adds to it and what takes away, and where it lands.
// The first row is the start, a signed or a plain number after it is a change, and `total` puts the running sum.
function parseWaterfall(lines) {
 const data = { title: '', unit: '', rows: [] }, units = new Set();
 for (const raw of lines.slice(1)) {
  const line = bare(raw);
  let m;
  if (!line.includes('|')) {
   if ((m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.title = unquote(m[1]); continue; }
   if ((m = /^unit(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.unit = unquote(m[1]); continue; }
  }
  const cells = rowCells(line), total = /^(?:=|total|sum|subtotal|итого|итог|всего)\s*(.*)$/i.exec(cells[1] || '');
  const a = amount(total ? total[1] : cells[1] || '');
  if (cells[0] && (a || total)) data.rows.push({ label: unquote(cells[0]), value: a ? a.value : null, total: !!total, signed: !!a?.signed });
  if (cells[0] && a) units.add(a.before || a.after);
 }
 // The unit every number carries stands once, over the scale.
 if (!data.unit && units.size === 1) data.unit = [...units][0];
 return data.rows.length > 1 ? data : null;
}

function waterfallScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 300, CHART.max), items = [], n = data.rows.length;
 let level = 0;
 const bars = data.rows.map((row, i) => {
  // A bar stands on the floor when it is the start, when it is called a total, and when a model wrote the sum out
  // itself: a last plain number that is the sum so far, or a row named as one.
  const sum = i > 0 && !row.signed && row.value !== null && (sumRow(row.label, row.value, level) || (i === n - 1 && Math.abs(row.value - level) <= Math.abs(level) * 0.005));
  const whole = row.total || sum || (i === 0 && !row.signed), from = whole ? 0 : level, to = whole ? row.value ?? level : level + row.value;
  level = to;
  return { label: row.label, from, to, kind: whole ? 'total' : to >= from ? 'up' : 'down' };
 });
 const all = bars.flatMap(bar => [bar.from, bar.to]);
 let lo = Math.min(0, ...all), hi = Math.max(0, ...all);
 if (hi === lo) hi = lo + 1;
 const step = niceStep(hi - lo);
 lo = Math.floor(lo / step + 1e-9) * step;
 hi = Math.ceil(hi / step - 1e-9) * step;
 const ticks = [];
 for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(+v.toFixed(10));
 let head = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  head = CHART.head;
  corner = { x: title.width + 16, h: 28 };
 }
 if (data.unit) items.push({ key: 'yt', type: 'label', layer: 'back', order: 0, props: { x: 0, y: head + 8 }, fixed: { lines: [data.unit], anchor: 'start', cls: 'dg-unit' } });
 const top = head + (data.unit ? 18 : 0) + 18, plotH = CHART.plot;
 const left = Math.ceil(Math.max(...ticks.map(t => widthOf(format(t), FONT.tick)))) + 10, plotW = W - left - 4, band = plotW / n;
 const y = v => top + plotH - (v - lo) / (hi - lo) * plotH;
 for (const t of ticks) {
  items.push({ key: `g:${t}`, type: 'line', layer: 'back', order: 0, props: { x1: left, y1: y(t), x2: left + plotW, y2: y(t) }, fixed: { cls: t === 0 ? 'dg-grid is-zero' : 'dg-grid' } });
  items.push({ key: `t:${t}`, type: 'label', layer: 'back', order: 0, props: { x: left - 8, y: y(t) }, fixed: { lines: [format(t)], anchor: 'end', cls: 'dg-tick' } });
 }
 const barW = Math.min(34, band * 0.56), names = bars.map(bar => wrap(bar.label, band - 8, ...FONT.tick).slice(0, 2));
 const signed = v => `${v >= 0 ? '+' : '−'}${format(Math.abs(v))}`;
 bars.forEach((bar, i) => {
  const x = left + band * (i + 0.5) - barW / 2, order = 0.3 + i * 0.35;
  items.push({ key: `wb:${i}`, type: 'bar', order, props: { x, top: y(bar.to), w: barW, base: y(bar.from) }, fixed: bar.kind === 'total' ? { tone: tones[0], r: 3 } : { cls: `is-${bar.kind}`, r: 3 } });
  items.push({ key: `wv:${i}`, type: 'label', layer: 'labels', order: order + 0.4, props: { x: x + barW / 2, y: y(Math.max(bar.from, bar.to)) - 6 }, fixed: { lines: [bar.kind === 'total' ? format(bar.to) : signed(bar.to - bar.from)], baseline: 'above', cls: 'dg-value' } });
  // A hairline carries each level over to the next bar, so the eye follows the sum.
  if (i < n - 1) items.push({ key: `wl:${i}`, type: 'line', layer: 'back', order: order + 0.3, props: { x1: x + barW, y1: y(bar.to), x2: left + band * (i + 1.5) - barW / 2, y2: y(bar.to) }, fixed: { cls: 'dg-bridge', draw: true } });
  // A word longer than its bar's place is cut like the rest: it must not run into the name beside it.
  items.push({ key: `x:${i}`, type: 'label', layer: 'back', order: 0, props: { x: left + band * (i + 0.5), y: top + plotH + 9 }, fixed: { lines: names[i].map(line => truncate(line, band - 4, ...FONT.tick)), baseline: 'below', lineHeight: 14, cls: 'dg-tick' } });
 });
 const probe = {
  x0: left, x1: left + plotW, y0: top, y1: top + plotH,
  xs: bars.map((_, i) => left + band * (i + 0.5)),
  tip: i => ({ title: bars[i].label, rows: bars[i].kind === 'total' ? [{ name: I18n.t('chart.total'), value: format(bars[i].to) }] : [{ name: I18n.t('chart.change'), value: signed(bars[i].to - bars[i].from), cls: `is-${bars[i].kind}` }, { name: I18n.t('chart.total'), value: format(bars[i].to) }] }),
  keys: i => [`wb:${i}`],
 };
 return { kind: 'waterfall', width: W, height: top + plotH + 14 + Math.max(...names.map(lines => lines.length)) * 14, items, probe, corner, flush: true };
}

// Stages that each keep a part of the one before: visitors, sign-ups, payments.
function parseFunnel(lines) {
 const data = { title: '', rows: [] };
 for (const raw of lines.slice(1)) {
  const line = bare(raw);
  let m;
  if (!line.includes('|') && (m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.title = unquote(m[1]); continue; }
  const cells = rowCells(line), a = amount(cells[1] || '');
  if (cells[0] && a && a.value >= 0) data.rows.push({ label: unquote(cells[0]), value: a.value, text: withUnit(a.value, a.before, a.after) });
 }
 return data.rows.length > 1 ? data : null;
}

function funnelScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 300, 640), rows = data.rows, items = [], tips = new Map();
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  top = CHART.head;
  corner = { x: title.width + 16, h: 28 };
 }
 const most = Math.max(...rows.map(row => row.value)) || 1, first = rows[0].value || 1;
 const part = (value, of) => `${format(Math.round(value / (of || 1) * 1000) / 10)}%`;
 const labelW = Math.min(W * 0.3, Math.max(...rows.map(row => widthOf(row.label, FONT.row))));
 const valueW = Math.max(...rows.map(row => widthOf(row.text, FONT.amount))), shareW = Math.max(...rows.map(row => widthOf(part(row.value, first), FONT.tick))) + 12;
 const x0 = labelW + 18, x1 = W - valueW - shareW - 18, cx = (x0 + x1) / 2;
 let y = top + 2;
 rows.forEach((row, i) => {
  const cy = y + 10, w = Math.max(6, (x1 - x0) * row.value / most), order = 0.3 + i * 0.4, key = `fn:${i}`;
  // One colour for every stage: where a stage stands and how wide it is already say the rest.
  items.push({ key, type: 'span', order, props: { x: cx - w / 2, y: cy, w, h: 20 }, fixed: { cls: 'dg-funnel-bar', tone: tones[0], rx: 4, mid: true } });
  items.push({ key: `${key}:name`, type: 'label', order, props: { x: 0, y: cy }, fixed: { lines: [truncate(row.label, labelW, ...FONT.row)], anchor: 'start', cls: 'dg-row-name' } });
  items.push({ key: `${key}:value`, type: 'label', order: order + 0.2, props: { x: W - shareW, y: cy }, fixed: { lines: [row.text], anchor: 'end', cls: 'dg-row-value' } });
  items.push({ key: `${key}:share`, type: 'label', order: order + 0.25, props: { x: W, y: cy }, fixed: { lines: [part(row.value, first)], anchor: 'end', cls: 'dg-row-share' } });
  if (i) items.push({ key: `${key}:rate`, type: 'label', layer: 'back', order: order - 0.1, props: { x: cx, y: y - 9 }, fixed: { lines: [`↓ ${part(row.value, rows[i - 1].value)}`], cls: 'dg-funnel-rate' } });
  tips.set(key, { title: row.label, rows: [{ name: I18n.t('edit.value'), value: row.text }, { name: I18n.t('files.share'), value: part(row.value, first) }] });
  y += 38;
 });
 return { kind: 'funnel', width: W, height: y - 18, items, tips, corner, flush: true };
}

// Where something comes from and where it goes: income into spending, traffic into orders.
// Mermaid's lines of source,target,value; `A -> B: 10` and `A | B | 10` are read too.
function parseSankey(lines) {
 const data = { title: '', links: [] };
 for (const raw of lines.slice(1)) {
  const line = raw.trim();
  let m;
  if ((m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.title = unquote(m[1]); continue; }
  const arrow = /^(.+?)\s*(?:-->|->|→)\s*(.+?)\s*[:|,]\s*([^:|,]+)$/.exec(line);
  const cells = arrow ? arrow.slice(1) : line.includes('|') ? cellsOf(line) : splitList(line);
  const value = cells.length >= 3 ? amount(cells[2])?.value : null;
  if (value > 0) data.links.push({ from: unquote(cells[0]), to: unquote(cells[1]), value });
 }
 return data.links.length ? data : null;
}

function sankeyScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 320, SANKEY.max), items = [], tips = new Map(), nodes = new Map();
 const node = name => nodes.get(name) || nodes.set(name, { name, ins: [], outs: [], layer: 0 }).get(name);
 const links = data.links.map((link, i) => ({ ...link, i, a: node(link.from), b: node(link.to) })).filter(link => link.a !== link.b);
 if (!links.length) return null;
 for (const link of links) { link.a.outs.push(link); link.b.ins.push(link); }
 // A node stands one step right of the farthest thing that flows into it; a loop stops pushing after a full round.
 for (let round = 0; round < nodes.size; round++) {
  let moved = false;
  for (const link of links) if (link.b.layer <= link.a.layer && link.a.layer + 1 < nodes.size) { link.b.layer = link.a.layer + 1; moved = true; }
  if (!moved) break;
 }
 const all = [...nodes.values()], depth = Math.max(...all.map(n => n.layer)) + 1;
 const layers = Array.from({ length: depth }, () => []);
 const total = list => list.reduce((sum, link) => sum + link.value, 0);
 for (const n of all) { n.value = Math.max(total(n.ins), total(n.outs)); layers[n.layer].push(n); }
 const H = clamp(Math.max(...layers.map(layer => layer.length)) * SANKEY.lane, 190, 420);
 const scale = Math.min(...layers.map(layer => (H - SANKEY.gap * (layer.length - 1)) / layer.reduce((sum, n) => sum + n.value, 0)));
 const stack = layer => {
  let y = (H - layer.reduce((sum, n) => sum + Math.max(2, n.value * scale), 0) - SANKEY.gap * (layer.length - 1)) / 2;
  for (const n of layer) { n.y = y; n.h = Math.max(2, n.value * scale); y += n.h + SANKEY.gap; }
 };
 layers.forEach(stack);
 // Each node moves toward the middle of what it is tied to, a few passes each way, so bands cross as little as they can.
 for (let sweep = 0; sweep < 6; sweep++) {
  const forward = sweep % 2 === 0;
  for (const layer of forward ? layers.slice(1) : layers.slice(0, -1).reverse()) {
   for (const n of layer) {
    const near = forward ? n.ins.map(link => [link.a, link.value]) : n.outs.map(link => [link.b, link.value]);
    const weight = near.reduce((sum, [, v]) => sum + v, 0);
    n.pull = weight ? near.reduce((sum, [other, v]) => sum + (other.y + other.h / 2) * v, 0) / weight : n.y + n.h / 2;
   }
   layer.sort((p, q) => p.pull - q.pull);
   stack(layer);
  }
 }
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  top = CHART.head + 4;
  corner = { x: title.width + 16, h: 28 };
 }
 const x = layer => depth > 1 ? layer * (W - SANKEY.node) / (depth - 1) : 0;
 for (const n of all) {
  n.outs.sort((p, q) => p.b.y - q.b.y);
  n.ins.sort((p, q) => p.a.y - q.a.y);
  let out = n.y, into = n.y;
  for (const link of n.outs) { link.y0 = out; out += link.value * scale; }
  for (const link of n.ins) { link.y1 = into; into += link.value * scale; }
 }
 for (const link of links) {
  const key = `sk:${link.i}`, h = link.value * scale, x0 = x(link.a.layer) + SANKEY.node, x1 = x(link.b.layer);
  items.push({ key, type: 'ribbon', layer: 'edges', order: 0.4 + link.a.layer * 0.8 + link.y0 / H * 0.5, props: { band: [x0, top + link.y0, top + link.y0 + h, x1, top + link.y1, top + link.y1 + h] }, fixed: { tone: tones[0] } });
  tips.set(key, { title: `${link.from} → ${link.to}`, rows: [{ name: I18n.t('edit.value'), value: format(link.value) }, { name: I18n.t('files.share'), value: `${format(Math.round(link.value / link.a.value * 1000) / 10)}%` }] });
 }
 // Names stand beside their nodes, inside the drawing: to the right of all but the last column.
 const room = depth > 1 ? (W - SANKEY.node) / (depth - 1) - SANKEY.node - 16 : W - 20;
 const shown = n => truncate(n.name, Math.max(40, room - widthOf(format(n.value), FONT.tick) - 8), ...FONT.legend);
 // The names of the last column stand in the same gap as those of the column before it. Where two would meet,
 // the one before gives way: it is cut short, then loses its number, then is left to the pointer.
 const facing = depth > 2 ? layers[depth - 1].map(n => ({ y: top + n.y + n.h / 2, left: x(depth - 1) - 8 - widthOf(format(n.value), FONT.tick) - 6 - widthOf(shown(n), FONT.legend) })) : [];
 for (const n of all) {
  const key = `sn:${n.name}`, nx = x(n.layer), last = n.layer === depth - 1 && depth > 1, cy = top + n.y + n.h / 2, order = 0.2 + n.layer * 0.8;
  items.push({ key, type: 'rect', layer: 'nodes', order, props: { x: nx, y: top + n.y, w: SANKEY.node, h: n.h }, fixed: { cls: 'dg-sankey-node', tone: tones[0], rx: 2 } });
  const text = format(n.value), from = nx + SANKEY.node + 8;
  const span = n.layer === depth - 2 ? Math.min(Infinity, ...facing.filter(box => Math.abs(box.y - cy) < 16).map(box => box.left - 10)) - from : Infinity;
  if (span < 30) continue;
  const valued = span >= widthOf(text, FONT.tick) + 6 + 30;
  const name = Number.isFinite(span) ? truncate(n.name, Math.min(Math.max(40, room - widthOf(text, FONT.tick) - 8), valued ? span - widthOf(text, FONT.tick) - 6 : span), ...FONT.legend) : shown(n), nameW = widthOf(name, FONT.legend);
  items.push({ key: `${key}:name`, type: 'label', order: order + 0.3, props: { x: last ? nx - 8 - widthOf(text, FONT.tick) - 6 : from, y: cy }, fixed: { lines: [name], anchor: last ? 'end' : 'start', cls: 'dg-sankey-name' } });
  if (valued) items.push({ key: `${key}:value`, type: 'label', order: order + 0.35, props: { x: last ? nx - 8 : from + nameW + 6, y: cy }, fixed: { lines: [text], anchor: last ? 'end' : 'start', cls: 'dg-sankey-value' } });
 }
 return { kind: 'sankey', width: W, height: top + H, items, tips, corner, flush: true };
}

/* Tables of marks */

// A value for every day, drawn as a calendar, or a table of rows and columns whose cells are numbers or marks.
// Days are lines of `2026-09-01 | 45`; a table starts with `cols A, B, C` and goes on with `Row | 1 | 0 | 3`.
const MARK_ON = /^(?:x|х|✓|✔|✅|☑|v|yes|y|да|true|on|\+|●|•|★)$/i, MARK_OFF = /^(?:-|–|—|−|✗|✘|✕|×|❌|☐|○|no|n|нет|false|off|·|)$/i;
// An emoji is often followed by a sign that asks for its coloured form; a mark is told without it.
const EMOJI_FORM = new RegExp(String.fromCharCode(0xfe0f), 'g');

function parseHeat(lines) {
 const data = { title: '', unit: '', cols: null, rows: [], days: [] };
 for (const raw of lines.slice(1)) {
  const line = bare(raw);
  let m;
  if (!line.includes('|')) {
   if ((m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) data.title = unquote(m[1]);
   else if ((m = /^unit(?:\s*:\s*|\s+)(.+)$/i.exec(line))) data.unit = unquote(m[1]);
   else if ((m = /^(?:cols|columns)(?:\s*:\s*|\s+)(.+)$/i.exec(line))) data.cols = splitList(m[1]).map(unquote);
   continue;
  }
  const cells = cellsOf(line), day = data.cols ? null : parseDate(cells[0]);
  if (day !== null) { const a = amount(cells[1] || ''); data.days.push({ t: Math.floor(day / DAY) * DAY, value: a ? Math.max(0, a.value) : 0 }); }
  else if (cells[0]) data.rows.push({ label: unquote(cells[0]), cells: cells.slice(1).map(cell => unquote(cell).replace(EMOJI_FORM, '')) });
 }
 if (data.days.length > 1) return { ...data, cols: null };
 if (!data.rows.length) return null;
 const count = Math.max(...data.rows.map(row => row.cells.length));
 data.cols = Array.from({ length: count }, (_, i) => data.cols?.[i] ?? '');
 return data;
}

function heatScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 280, 720), items = [], tips = new Map(), accent = tones[0];
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  top = CHART.head;
  corner = { x: title.width + 16, h: 28 };
 }
 // How strong a cell is: nothing, then four steps of one colour up to the largest value.
 const levelOf = (value, most) => value > 0 ? clamp(Math.ceil(value / most * HEAT.levels), 1, HEAT.levels) : 0;
 if (!data.cols) {
  const days = new Map(data.days.map(day => [day.t, day.value])), times = [...days.keys()].sort((a, b) => a - b);
  const monday = t => t - ((new Date(t).getUTCDay() + 6) % 7) * DAY, start = monday(times[0]), end = times[times.length - 1];
  const weeks = Math.round((monday(end) - start) / (7 * DAY)) + 1, most = Math.max(...days.values()) || 1;
  const gutter = 30, cell = clamp(Math.floor((W - gutter) / weeks) - HEAT.gap, 8, HEAT.cell), pitch = cell + HEAT.gap;
  const weekday = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'short' }), month = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', month: 'short' });
  const full = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
  const gridTop = top + 20;
  for (const row of [0, 2, 4]) items.push({ key: `hw:${row}`, type: 'label', layer: 'back', order: 0.1, props: { x: 0, y: gridTop + row * pitch + cell / 2 }, fixed: { lines: [weekday.format(start + row * DAY)], anchor: 'start', cls: 'dg-tick' } });
  let named = -Infinity;
  for (let w = 0; w < weeks; w++) {
   const first = start + w * 7 * DAY, x = gutter + w * pitch;
   // A month is named over the week it begins in, when there is room since the last name.
   const turn = Array.from({ length: 7 }, (_, d) => first + d * DAY).find(t => new Date(t).getUTCDate() === 1) ?? (w === 0 ? first : null);
   if (turn !== null && turn <= end && x - named >= 30) { items.push({ key: `hm:${w}`, type: 'label', layer: 'back', order: 0.1, props: { x, y: top + 8 }, fixed: { lines: [month.format(turn)], anchor: 'start', cls: 'dg-tick' } }); named = x; }
   for (let d = 0; d < 7; d++) {
    const t = first + d * DAY;
    if (t < times[0] || t > end) continue;
    const value = days.get(t) || 0, key = `hd:${t}`;
    items.push({ key, type: 'rect', layer: 'nodes', order: 0.3 + w * 0.06 + d * 0.01, props: { x, y: gridTop + d * pitch, w: cell, h: cell }, fixed: { cls: `dg-cell is-l${levelOf(value, most)}`, tone: accent, rx: 3 } });
    tips.set(key, { title: full.format(t), rows: [{ name: data.unit || I18n.t('edit.value'), value: format(value) }] });
   }
  }
  const bottom = gridTop + 7 * pitch - HEAT.gap, less = I18n.t('heat.less'), more = I18n.t('heat.more');
  const scaleW = widthOf(less, FONT.tick) + 8 + (HEAT.levels + 1) * (10 + 3) + 5 + widthOf(more, FONT.tick), gridW = gutter + weeks * pitch - HEAT.gap;
  let lx = Math.max(gutter, gridW - scaleW);
  items.push({ key: 'hs:less', type: 'label', layer: 'back', order: 1, props: { x: lx, y: bottom + 18 }, fixed: { lines: [less], anchor: 'start', cls: 'dg-tick' } });
  lx += widthOf(less, FONT.tick) + 8;
  for (let level = 0; level <= HEAT.levels; level++) { items.push({ key: `hs:${level}`, type: 'rect', layer: 'nodes', order: 1 + level * 0.05, props: { x: lx, y: bottom + 13, w: 10, h: 10 }, fixed: { cls: `dg-cell is-l${level}`, tone: accent, rx: 2.5 } }); lx += 13; }
  items.push({ key: 'hs:more', type: 'label', layer: 'back', order: 1.3, props: { x: lx + 5, y: bottom + 18 }, fixed: { lines: [more], anchor: 'start', cls: 'dg-tick' } });
  return { kind: 'heatmap', width: Math.max(gridW, gutter + scaleW), height: bottom + 28, items, tips, corner, flush: true };
 }
 const cols = data.cols, n = cols.length, values = data.rows.flatMap(row => row.cells);
 const marks = values.every(cell => MARK_ON.test(cell) || MARK_OFF.test(cell)), numbers = values.map(cell => amount(cell)?.value).filter(Number.isFinite), most = Math.max(1e-9, ...numbers);
 const labelW = Math.min(W * 0.4, 240, Math.max(...data.rows.map(row => widthOf(row.label, FONT.row)))) + 14;
 const cellW = clamp((W - labelW) / n, 30, 88), gridW = labelW + cellW * n, named = cols.some(Boolean);
 if (named) cols.forEach((name, c) => items.push({ key: `hc:${c}`, type: 'label', layer: 'back', order: 0.1 + c * 0.03, props: { x: labelW + cellW * (c + 0.5), y: top + 8 }, fixed: { lines: [truncate(name, cellW - 6, ...FONT.tick)], cls: 'dg-tick' } }));
 let y = top + (named ? 22 : 2);
 data.rows.forEach((row, r) => {
  const cy = y + HEAT.row / 2, order = 0.3 + r * 0.15, key = `hr:${r}`;
  items.push({ key, type: 'hit', layer: 'back', order, props: { x: -8, y, w: gridW + 16, h: HEAT.row }, fixed: {} });
  tips.set(key, { silent: true });
  if (r) items.push({ key: `${key}:rule`, type: 'line', layer: 'back', order, props: { x1: 0, y1: y, x2: gridW, y2: y }, fixed: { cls: 'dg-grid' } });
  items.push({ key: `${key}:name`, type: 'label', order, props: { x: 0, y: cy }, fixed: { lines: [truncate(row.label, labelW - 14, ...FONT.row)], anchor: 'start', cls: 'dg-row-name' } });
  for (const part of [`${key}:name`, ...cols.map((_, c) => `${key}:${c}`), ...cols.map((_, c) => `${key}:${c}:t`)]) tips.set(part, { silent: true, hot: [key] });
  cols.forEach((_, c) => {
   const cell = row.cells[c] ?? '', cx = labelW + cellW * (c + 0.5), value = amount(cell)?.value;
   if (marks) {
    // A yes is a dot, a no a short dash: a schedule reads at a glance.
    if (MARK_ON.test(cell)) items.push({ key: `${key}:${c}`, type: 'dot', layer: 'nodes', order: order + 0.05 + c * 0.02, props: { x: cx, y: cy, r: 4 }, fixed: { cls: 'dg-cell-dot', tone: accent } });
    else items.push({ key: `${key}:${c}`, type: 'line', layer: 'back', order: order + 0.05, props: { x1: cx - 3, y1: cy, x2: cx + 3, y2: cy }, fixed: { cls: 'dg-cell-off' } });
   } else {
    if (Number.isFinite(value)) items.push({ key: `${key}:${c}`, type: 'rect', layer: 'nodes', order: order + 0.05 + c * 0.02, props: { x: cx - cellW / 2 + 1.5, y: y + 2.5, w: cellW - 3, h: HEAT.row - 5 }, fixed: { cls: `dg-cell is-soft is-l${levelOf(value, most)}`, tone: accent, rx: 4 } });
    if (cell) items.push({ key: `${key}:${c}:t`, type: 'label', order: order + 0.1 + c * 0.02, props: { x: cx, y: cy }, fixed: { lines: [truncate(cell, cellW - 8, ...FONT.value)], cls: 'dg-cell-text' } });
   }
  });
  y += HEAT.row;
 });
 return { kind: 'heatmap', width: gridW, height: y, items, tips, corner, flush: true };
}

// Things placed by two numbers: risk against return, price against mileage. A row is a name, x, y and, if wanted,
// a size and a group; `x-axis` and `y-axis` name the axes, `trend` draws the line the points lean to.
function parseScatter(lines) {
 const data = { title: '', x: '', y: '', trend: false, points: [] };
 for (const raw of lines.slice(1)) {
  const line = bare(raw);
  let m;
  if (!line.includes('|')) {
   if ((m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) data.title = unquote(m[1]);
   else if ((m = /^([xy])-axis(?:\s*:\s*|\s+)(.+)$/i.exec(line))) data[m[1].toLowerCase()] = unquote(m[2]);
   else if (/^trend\b/i.test(line)) data.trend = true;
   continue;
  }
  const cells = cellsOf(line), x = amount(cells[1] || '')?.value, y = amount(cells[2] || '')?.value, size = amount(cells[3] || '')?.value;
  if (cells[0] && Number.isFinite(x) && Number.isFinite(y)) data.points.push({ label: unquote(cells[0]), x, y, size: Number.isFinite(size) ? Math.max(0, size) : null, group: unquote(cells[Number.isFinite(size) ? 4 : 3] || '') });
 }
 return data.points.length ? data : null;
}

function scatterScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 300, SCATTER.max), items = [], tips = new Map(), points = data.points;
 // Any two points may end up side by side, so only three groups get a colour of their own; the rest go grey.
 const groups = [...new Set(points.map(p => p.group).filter(Boolean))], hues = ring(tones, groups.length), toneOf = p => { const k = groups.indexOf(p.group); return k < 0 ? tones[0] : k < 3 ? hues[k] : 'mute'; };
 const axis = values => {
  let lo = Math.min(...values), hi = Math.max(...values);
  if (lo >= 0 && lo < hi * 0.5) lo = 0;
  if (hi === lo) { hi += 1; lo -= lo > 0 ? Math.min(1, lo) : 0; }
  const step = niceStep(hi - lo), ticks = [];
  lo = Math.floor(lo / step + 1e-9) * step;
  hi = Math.ceil(hi / step - 1e-9) * step;
  for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(+v.toFixed(10));
  return { lo, hi, ticks };
 };
 const ax = axis(points.map(p => p.x)), ay = axis(points.map(p => p.y));
 let head = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  head = CHART.head;
  corner = { x: title.width + 16, h: 28 };
 }
 if (groups.length > 1) {
  // The grey points are named too: by their group when it is the only one left, as the rest when there are more.
  const named = groups.slice(0, 3).map((name, k) => ({ text: name, tone: hues[k] }));
  if (groups.length > 3) named.push({ text: groups.length === 4 ? groups[3] : I18n.t('chart.other'), tone: 'mute' });
  const row = chips(named, 0, head + 9, W);
  items.push(...row.items);
  if (!corner) corner = { x: row.width + 16, h: 20 };
  head += row.height + 2;
 }
 if (data.y) items.push({ key: 'yt', type: 'label', layer: 'back', order: 0, props: { x: 0, y: head + 8 }, fixed: { lines: [truncate(data.y, W * 0.6, ...FONT.tick)], anchor: 'start', cls: 'dg-unit' } });
 const top = head + (data.y ? 18 : 0) + 12, plotH = Math.min(SCATTER.plot, W * 0.5);
 const left = Math.ceil(Math.max(...ay.ticks.map(t => widthOf(format(t), FONT.tick)))) + 10, plotW = W - left - 12;
 const px = v => left + (v - ax.lo) / (ax.hi - ax.lo) * plotW, py = v => top + plotH - (v - ay.lo) / (ay.hi - ay.lo) * plotH;
 for (const t of ay.ticks) {
  items.push({ key: `gy:${t}`, type: 'line', layer: 'back', order: 0, props: { x1: left, y1: py(t), x2: left + plotW, y2: py(t) }, fixed: { cls: t === ay.lo ? 'dg-grid is-zero' : 'dg-grid' } });
  items.push({ key: `ty:${t}`, type: 'label', layer: 'back', order: 0, props: { x: left - 8, y: py(t) }, fixed: { lines: [format(t)], anchor: 'end', cls: 'dg-tick' } });
 }
 const tickW = Math.max(...ax.ticks.map(t => widthOf(format(t), FONT.tick))), every = Math.max(1, Math.ceil((tickW + 14) / (plotW / Math.max(1, ax.ticks.length - 1))));
 ax.ticks.forEach((t, i) => {
  items.push({ key: `gx:${t}`, type: 'line', layer: 'back', order: 0, props: { x1: px(t), y1: top, x2: px(t), y2: top + plotH }, fixed: { cls: 'dg-grid is-faint' } });
  if (i % every === 0) items.push({ key: `tx:${t}`, type: 'label', layer: 'back', order: 0, props: { x: px(t), y: top + plotH + 9 }, fixed: { lines: [format(t)], baseline: 'below', cls: 'dg-tick' } });
 });
 if (data.x) items.push({ key: 'xt', type: 'label', layer: 'back', order: 0, props: { x: left + plotW, y: top + plotH + 34 }, fixed: { lines: [truncate(data.x, plotW, ...FONT.tick)], anchor: 'end', cls: 'dg-unit' } });
 if (data.trend && points.length > 2) {
  // The straight line the points lie closest to.
  const n = points.length, mx = points.reduce((s, p) => s + p.x, 0) / n, my = points.reduce((s, p) => s + p.y, 0) / n;
  const sxx = points.reduce((s, p) => s + (p.x - mx) ** 2, 0), slope = sxx ? points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / sxx : 0;
  const yAt = v => clamp(my + slope * (v - mx), ay.lo, ay.hi);
  items.push({ key: 'trend', type: 'line', layer: 'edges', order: 0.6, props: { x1: px(ax.lo), y1: py(yAt(ax.lo)), x2: px(ax.hi), y2: py(yAt(ax.hi)) }, fixed: { cls: 'dg-goal', draw: true } });
 }
 const most = Math.max(...points.map(p => p.size || 0)), radius = p => most && p.size !== null ? 4 + 11 * Math.sqrt(p.size / most) : 4.5;
 // A name keeps clear of every point, by enough that it can't be taken for a neighbour's.
 const boxes = points.map(p => { const r = radius(p) + 5; return { x: px(p.x) - r, y: py(p.y) - r, w: r * 2, h: r * 2 }; });
 const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, near = [];
 points.forEach((p, i) => {
  const x = px(p.x), y = py(p.y), r = radius(p), tw = widthOf(p.label, FONT.point), key = `sp:${i}`, order = 1 + i * 0.12;
  items.push({ key, type: 'dot', layer: 'nodes', order, props: { x, y, r }, fixed: { cls: p.size !== null ? 'dg-q-point is-bubble' : 'dg-q-point', tone: toneOf(p) } });
  // A name goes where it covers nothing: beside its point, over it or under it, moved in from the edge of the plot
  // when it would stick out. With no free place around its point it stays in the tip.
  const mid = clamp(x, left + tw / 2 + 2, left + plotW - tw / 2);
  const options = [[x + r + 6, y, 'start', x + r + 6], [mid, y - r - 9, 'middle', mid - tw / 2], [mid, y + r + 10, 'middle', mid - tw / 2], [x - r - 6, y, 'end', x - r - 6 - tw]];
  const pick = options.find(option => {
   const box = { x: option[3], y: option[1] - 8, w: tw, h: 16 };
   return box.x >= left && box.x + box.w <= left + plotW + 10 && box.y >= top - 6 && box.y + box.h <= top + plotH + 4 && !boxes.some((other, k) => k !== i && hit(box, other));
  });
  if (pick) {
   boxes.push({ x: pick[3], y: pick[1] - 8, w: tw, h: 16 });
   items.push({ key: `${key}:name`, type: 'label', order: order + 0.1, props: { x: pick[0], y: pick[1] }, fixed: { lines: [p.label], anchor: pick[2], cls: 'dg-q-name' } });
  }
  tips.set(key, { title: p.label, rows: [{ name: data.x || 'x', value: format(p.x) }, { name: data.y || 'y', value: format(p.y) }, ...(p.size !== null ? [{ name: I18n.t('files.size'), value: format(p.size) }] : [])], hot: pick ? [key, `${key}:name`] : [key] });
  near.push({ x, y, key });
 });
 return { kind: 'scatter', width: W, height: top + plotH + 26 + (data.x ? 18 : 0), items, tips, near, corner, flush: true };
}

// What a whole is made of, as areas: a portfolio, a budget, a disk. Mermaid's treemap: a name on a line, a value after
// a colon, parts indented under their group.
function parseTreemap(lines) {
 const data = { title: '', groups: [] };
 let base = null, group = null;
 for (const raw of lines.slice(1)) {
  const indent = indentOf(raw), line = bare(raw).replace(/:::[\w-]+\s*$/, '');
  let m;
  if (!line) continue;
  if (!data.groups.length && (m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.title = unquote(m[1]); continue; }
  m = /^(?:"([^"]*)"|'([^']*)'|(.+?))\s*(?:[:|]\s*(.+))?$/.exec(line);
  const name = cleanLabel(m[1] ?? m[2] ?? m[3]), value = m[4] ? amount(m[4])?.value : null;
  base ??= indent;
  if (indent <= base) {
   group = { name, value: value > 0 ? value : 0, parts: [] };
   data.groups.push(group);
  } else if (group && value > 0) group.parts.push({ name, value });
 }
 for (const g of data.groups) if (g.parts.length) g.value = g.parts.reduce((sum, part) => sum + part.value, 0);
 data.groups = data.groups.filter(g => g.value > 0);
 return data.groups.length ? data : null;
}

// Tiles as near to squares as their areas allow: each strip is filled while it keeps the tiles from getting longer.
function squarify(entries, x, y, w, h) {
 const total = entries.reduce((sum, entry) => sum + entry.value, 0) || 1;
 let rest = [...entries].sort((a, b) => b.value - a.value).map(entry => ({ entry, area: entry.value / total * w * h }));
 while (rest.length) {
  const short = Math.max(1e-6, Math.min(w, h)), strip = [];
  let sum = 0, worst = Infinity;
  for (const item of rest) {
   const next = sum + item.area, big = Math.max(item.area, ...strip.map(s => s.area)), small = Math.min(item.area, ...strip.map(s => s.area));
   const ratio = Math.max(short * short * big / (next * next), next * next / (short * short * small));
   if (strip.length && ratio > worst) break;
   strip.push(item);
   sum = next;
   worst = ratio;
  }
  rest = rest.slice(strip.length);
  const thick = sum / short;
  let run = 0;
  for (const item of strip) {
   const length = item.area / thick;
   Object.assign(item.entry, w >= h ? { x, y: y + run, w: thick, h: length } : { x: x + run, y, w: length, h: thick });
   run += length;
  }
  if (w >= h) { x += thick; w -= thick; } else { y += thick; h -= thick; }
 }
}

function treemapScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 280, TREE.max), H = clamp(Math.round(W * 0.48), TREE.low, TREE.high), items = [], tips = new Map();
 const total = data.groups.reduce((sum, g) => sum + g.value, 0), share = value => `${format(Math.round(value / total * 1000) / 10)}%`;
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  top = CHART.head;
  corner = { x: title.width + 16, h: 28 };
 }
 const nested = data.groups.filter(g => g.parts.length);
 if (nested.length > 1) {
  const row = chips(data.groups.map((g, i) => ({ text: g.name, tone: slot(SERIES, i), mark: 'bar' })), 0, top + 9, W);
  items.push(...row.items);
  if (!corner) corner = { x: row.width + 16, h: 20 };
  top += row.height + 6;
 }
 squarify(data.groups, 0, top, W, H);
 data.groups.forEach((g, i) => {
  const tone = slot(ring(tones, data.groups.length), i), parts = g.parts.length ? g.parts : [{ name: g.name, value: g.value, own: true }];
  squarify(parts, g.x, g.y, g.w, g.h);
  [...parts].sort((a, b) => b.value - a.value).forEach((part, k) => {
   // Tiles are parted by two pixels of the surface, and a group is told by its colour alone: the size of a tile
   // is already its area.
   const key = `tm:${i}:${k}`, x = part.x + TREE.gap / 2, y = part.y + TREE.gap / 2, w = Math.max(1, part.w - TREE.gap), h = Math.max(1, part.h - TREE.gap);
   items.push({ key, type: 'rect', layer: 'nodes', order: 0.3 + i * 0.2 + k * 0.05, props: { x, y, w, h }, fixed: { cls: 'dg-tile', tone, rx: 3 } });
   const value = format(part.value), fits = text => widthOf(text, FONT.small) <= w - 14;
   if (h >= 22 && w >= 44) {
    const name = truncate(part.name, w - 14, ...FONT.small);
    items.push({ key: `${key}:name`, type: 'label', order: 0.5 + i * 0.2 + k * 0.05, props: { x: x + 7, y: y + 12 }, fixed: { lines: [name], anchor: 'start', cls: 'dg-tile-name' } });
    if (h >= 40 && fits(value)) items.push({ key: `${key}:value`, type: 'label', order: 0.55 + i * 0.2 + k * 0.05, props: { x: x + 7, y: y + 27 }, fixed: { lines: [value], anchor: 'start', cls: 'dg-tile-value' } });
   }
   const tip = { title: part.own ? part.name : `${g.name} › ${part.name}`, rows: [{ name: I18n.t('edit.value'), value }, { name: I18n.t('files.share'), value: share(part.value) }], hot: [key] };
   for (const id of [key, `${key}:name`, `${key}:value`]) tips.set(id, tip);
  });
 });
 return { kind: 'treemap', width: W, height: top + H, items, tips, corner, flush: true };
}

/* History of a repository: Mermaid's gitGraph, drawn as a log reads */

function parseGit(lines) {
 const commits = [], branches = new Map();
 let current = 'main';
 const branch = name => branches.get(name) || branches.set(name, { name, lane: branches.size, head: null, first: null }).get(name);
 const attrs = text => ({ id: /\bid:\s*"([^"]*)"/.exec(text)?.[1] ?? '', tag: /\btag:\s*"([^"]*)"/.exec(text)?.[1] ?? '', type: (/\btype:\s*(\w+)/.exec(text)?.[1] || 'NORMAL').toUpperCase() });
 const add = (b, parents, more) => {
  const commit = { n: commits.length, branch: b, parents: parents.filter(Boolean), ...more };
  commits.push(commit);
  b.head = commit;
  b.first ??= commit;
  return commit;
 };
 for (const raw of lines.slice(1)) {
  const line = raw.trim();
  let m;
  if ((m = /^commit\b(.*)$/i.exec(line))) { const b = branch(current); add(b, [b.head], attrs(m[1])); }
  else if ((m = /^branch\s+("[^"]+"|\S+)/i.exec(line))) { const from = branch(current), b = branch(unquote(m[1])); b.head ??= from.head; current = b.name; }
  else if ((m = /^(?:checkout|switch)\s+("[^"]+"|\S+)/i.exec(line))) current = branch(unquote(m[1])).name;
  else if ((m = /^merge\s+("[^"]+"|\S+)(.*)$/i.exec(line))) {
   const other = branches.get(unquote(m[1])), b = branch(current);
   if (other?.head) add(b, [b.head, other.head], { ...attrs(m[2]), merge: other.name });
  } else if ((m = /^cherry-pick\b(.*)$/i.exec(line))) { const b = branch(current), a = attrs(m[1]); add(b, [b.head], { ...a, id: '', pick: a.id }); }
 }
 return commits.length ? { commits, branches: [...branches.values()].filter(b => b.first) } : null;
}

function gitScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 300, GIT.max), items = [], tips = new Map(), lanes = new Map(data.branches.map((b, i) => [b, i]));
 const laneX = b => 7 + lanes.get(b) * GIT.lane, toneOf = b => slot(ring(tones, lanes.size), lanes.get(b));
 const textX = 7 + lanes.size * GIT.lane + 6, rowY = commit => commit.n * GIT.row + GIT.row / 2;
 data.commits.forEach((commit, i) => {
  const b = commit.branch, x = laneX(b), y = rowY(commit), tone = toneOf(b), key = `gc:${i}`, order = 0.3 + i * 0.3;
  commit.parents.forEach((parent, k) => {
   // The line of a branch runs straight down; a branch leaving or coming back takes a soft bend between two rows.
   const px = laneX(parent.branch), py = rowY(parent), own = parent.branch === b;
   const pts = own ? [px, py, px, py + (y - py) / 3, x, y - (y - py) / 3, x, y] : [px, py, px, py + GIT.row * 0.7, x, y - GIT.row * 0.7, x, y];
   items.push({ key: `${key}:p${k}`, type: 'edge', layer: 'edges', order: order - 0.15, props: { pts }, fixed: { style: 'solid', head: 'none', tone: own || k === 0 ? tone : toneOf(parent.branch), cls: 'dg-stroke dg-lane', draw: 300 } });
  });
  items.push({ key: `${key}:hit`, type: 'hit', layer: 'back', order, props: { x: -8, y: y - GIT.row / 2, w: W + 16, h: GIT.row }, fixed: {} });
  tips.set(`${key}:hit`, { silent: true });
  items.push({ key, type: 'dot', layer: 'nodes', order, props: { x, y, r: commit.type === 'HIGHLIGHT' ? 5.5 : 4.5 }, fixed: { cls: `dg-commit${commit.merge ? ' is-merge' : ''}`, tone } });
  // After the message come the name of a branch, where it starts, and the tag of a release.
  const pills = [];
  if (b.first === commit) pills.push({ text: b.name, cls: 'dg-tag is-branch', tone });
  if (commit.tag) pills.push({ text: commit.tag, cls: 'dg-tag' });
  const pillW = pills.reduce((sum, pill) => sum + widthOf(pill.text, FONT.value) + 14 + 6, 0);
  const text = commit.id || (commit.merge ? I18n.t('git.merge', { name: commit.merge }) : commit.pick ? I18n.t('git.pick', { name: commit.pick }) : '');
  const shown = truncate(text, Math.max(40, W - textX - pillW), ...FONT.row);
  if (shown) items.push({ key: `${key}:text`, type: 'label', order: order + 0.05, props: { x: textX, y }, fixed: { lines: [shown], anchor: 'start', cls: commit.id ? 'dg-row-name' : 'dg-row-name is-quiet' } });
  let tx = textX + (shown ? widthOf(shown, FONT.row) + 10 : 0);
  pills.forEach((pill, k) => {
   const w = widthOf(pill.text, FONT.value) + 14;
   items.push({ key: `${key}:pill${k}`, type: 'label', order: order + 0.1 + k * 0.05, props: { x: tx + w / 2, y }, fixed: { lines: [pill.text], pill: true, rx: 5, w, h: 18, cls: pill.cls, tone: pill.tone } });
   tx += w + 6;
  });
 });
 return { kind: 'git', width: W, height: data.commits.length * GIT.row, items, tips, flush: true };
}

/* Cells of an algorithm: an array, or a table of them, with pointers under the cells and stretches marked */

// A row is a caption, the values, the pointers as name: index, and the cells to mark as 2..4 or as 1, 3.
// The caption may be left out, and so may what follows the values.
function parseArray(lines) {
 const data = { title: '', rows: [] };
 const spans = text => splitList(text).every(part => /^\d+(?:\s*(?:\.\.+|-|–)\s*\d+)?$/.test(part));
 for (const raw of lines.slice(1)) {
  const line = bare(raw);
  let m;
  if (!line) continue;
  if (!line.includes('|') && (m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.title = unquote(m[1]); continue; }
  const cells = cellsOf(line), at = cells.findIndex(cell => cell.includes(',') || /^\[.*\]$/.test(cell));
  if (at < 0 || at > 1) continue;
  const values = splitList(cells[at].replace(/^\[|\]$/g, '')).map(unquote), marks = new Map(), lit = new Set();
  // With the pointers left out, the cells to mark come right after the values.
  const [pointers, marked] = cells[at + 1] && !cells[at + 2] && spans(cells[at + 1]) ? ['', cells[at + 1]] : [cells[at + 1] || '', cells[at + 2] || ''];
  for (const part of splitList(pointers)) {
   const p = /^(.+?)\s*[:=]\s*(\d+)$/.exec(part);
   if (p) marks.set(+p[2], [...(marks.get(+p[2]) || []), unquote(p[1])]);
  }
  for (const part of splitList(marked)) {
   const span = /^(\d+)(?:\s*(?:\.\.+|-|–)\s*(\d+))?$/.exec(part);
   if (span) for (let i = +span[1]; i <= +(span[2] ?? span[1]) && i < values.length; i++) lit.add(i);
  }
  if (values.length) data.rows.push({ caption: at ? unquote(cells[0]) : '', values, marks, lit });
 }
 return data.rows.length ? data : null;
}

function arrayScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 280, CELLS.max), items = [], tips = new Map(), accent = tones[0];
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  top = CHART.head;
  corner = { x: title.width + 16, h: 28 };
 }
 const most = Math.max(...data.rows.map(row => row.values.length));
 const captionW = Math.min(W * 0.3, Math.max(0, ...data.rows.map(row => row.caption ? widthOf(row.caption, FONT.tick) : 0))), x0 = captionW ? captionW + 14 : 0;
 // Cells are as wide as the longest value asks, and narrower when that many would not fit, but never too narrow
 // for the value itself: a row too long for the column makes the drawing wider, and the view brings it to size.
 const longest = Math.max(...data.rows.flatMap(row => row.values.map(value => textWidth(value, ...FONT.cell, true))));
 const pitch = Math.max(Math.min(clamp(longest + 16, CELLS.min, CELLS.wide) + CELLS.gap, (W - x0 + CELLS.gap) / most), Math.min(longest, CELLS.wide - 16) + 8 + CELLS.gap), cw = pitch - CELLS.gap;
 const fit = value => {
  let text = value;
  while (text.length > 1 && textWidth(text === value ? text : `${text}…`, ...FONT.cell, true) > cw - 6) text = text.slice(0, -1);
  return text === value ? value : `${text}…`;
 };
 for (let i = 0; i < most; i++) items.push({ key: `ai:${i}`, type: 'label', layer: 'back', order: 0.1 + i * 0.02, props: { x: x0 + pitch * i + cw / 2, y: top + 7 }, fixed: { lines: [String(i)], cls: 'dg-tick' } });
 let y = top + 18;
 data.rows.forEach((row, r) => {
  const order = 0.3 + r * 0.4, cy = y + CELLS.height / 2;
  if (row.caption) items.push({ key: `ac:${r}`, type: 'label', order, props: { x: 0, y: cy }, fixed: { lines: [truncate(row.caption, captionW, ...FONT.tick)], anchor: 'start', cls: 'dg-tick' } });
  row.values.forEach((value, i) => {
   const x = x0 + pitch * i, key = `av:${r}:${i}`;
   items.push({ key, type: 'rect', layer: 'nodes', order: order + i * 0.03, props: { x, y, w: cw, h: CELLS.height }, fixed: { cls: row.lit.has(i) ? 'dg-acell is-lit' : 'dg-acell', tone: accent, rx: 5 } });
   items.push({ key: `${key}:t`, type: 'label', order: order + 0.05 + i * 0.03, props: { x: x + cw / 2, y: cy }, fixed: { lines: [fit(value)], cls: 'dg-acell-text' } });
   // A value cut short to fit its cell is told whole under the pointer.
   if (fit(value) !== value) tips.set(key, { title: value, rows: [] });
  });
  // A pointer is a short stroke under its cell and its name under the stroke.
  for (const [i, names] of row.marks) {
   if (i >= row.values.length) continue;
   const x = x0 + pitch * i + cw / 2;
   items.push({ key: `am:${r}:${i}`, type: 'line', layer: 'labels', order: order + 0.3, props: { x1: x, y1: y + CELLS.height + 3, x2: x, y2: y + CELLS.height + 9 }, fixed: { cls: 'dg-apoint', tone: accent, draw: true } });
   items.push({ key: `an:${r}:${i}`, type: 'label', order: order + 0.35, props: { x, y: y + CELLS.height + 17 }, fixed: { lines: [names.join(', ')], cls: 'dg-apoint-name' } });
  }
  y += CELLS.height + (row.marks.size ? 30 : 8);
 });
 return { kind: 'array', width: x0 + pitch * most - CELLS.gap, height: y - 8, items, tips, corner, flush: true };
}

/* A knockout: rounds side by side, each match feeding the next */

// A line at the left edge names a round; the matches of the round are indented under it, as Team 2 - 1 Team,
// or Team - Team while it is not played. A note in brackets after the score tells how a draw was settled.
function parseBracket(lines) {
 const data = { title: '', rounds: [] };
 let base = null;
 for (const raw of lines.slice(1)) {
  const indent = indentOf(raw), line = bare(raw);
  let m;
  if (!line) continue;
  if (!data.rounds.length && (m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.title = unquote(m[1]); continue; }
  base ??= indent;
  if (indent <= base) { data.rounds.push({ name: cleanLabel(line.replace(/:$/, '')), matches: [] }); continue; }
  const round = data.rounds[data.rounds.length - 1];
  if ((m = /^(.+?)\s+(\d+)\s*[-:–—]\s*(\d+)\s+(.+?)(?:\s*\((.+)\))?$/.exec(line))) {
   // A draw is decided by what the note says, when it holds a score of its own: 4-3 on penalties.
   const extra = /(\d+)\s*[-:–]\s*(\d+)/.exec(m[5] || ''), a = +m[2], b = +m[3];
   round.matches.push({ a: cleanLabel(m[1]), b: cleanLabel(m[4]), sa: a, sb: b, note: cleanLabel(m[5] || ''), won: a !== b ? (a > b ? 0 : 1) : extra && +extra[1] !== +extra[2] ? (+extra[1] > +extra[2] ? 0 : 1) : -1 });
  } else if ((m = /^(.+?)\s+(?:vs\.?|v|—|–|-|:)\s+(.+)$/i.exec(line))) round.matches.push({ a: cleanLabel(m[1]), b: cleanLabel(m[2]), sa: null, sb: null, note: '', won: -1 });
  else round.matches.push({ a: cleanLabel(line), b: '', sa: null, sb: null, note: '', won: -1 });
 }
 data.rounds = data.rounds.filter(round => round.matches.length);
 return data.rounds.length ? data : null;
}

function bracketScene(data, tones, { width }) {
 if (!data) return null;
 const rounds = data.rounds, n = rounds.length, room = Math.max(280, width - PAD * 2), items = [], tips = new Map();
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, room - 80);
  items.push(title.item);
  top = CHART.head + 2;
  corner = { x: title.width + 16, h: 28 };
 }
 const nameW = Math.max(...rounds.flatMap(round => round.matches.flatMap(match => [widthOf(match.a, FONT.row), widthOf(match.b, FONT.row)])));
 const gap = clamp((room - BRACKET.max * n) / Math.max(1, n - 1), 22, 44), cardW = clamp(Math.min(nameW + 46, (room - gap * (n - 1)) / n), BRACKET.min, BRACKET.max);
 // A note under a match, how a draw was settled, needs a line of room between the plates.
 const noted = rounds.some(round => round.matches.some(match => match.note)), pitch = BRACKET.card + BRACKET.gap + (noted ? 10 : 0);
 // A match stands midway between the two that feed it; a round that is not half of the one before is stacked evenly
 // beside the middle of it.
 rounds.forEach((round, r) => {
  const prev = rounds[r - 1], count = round.matches.length;
  if (prev && prev.matches.length === count * 2) round.ys = round.matches.map((_, j) => (prev.ys[2 * j] + prev.ys[2 * j + 1]) / 2);
  else {
   const middle = prev ? (Math.min(...prev.ys) + Math.max(...prev.ys)) / 2 : (count - 1) * pitch / 2;
   round.ys = round.matches.map((_, j) => middle + (j - (count - 1) / 2) * pitch);
  }
 });
 const least = Math.min(...rounds.flatMap(round => round.ys)), head = 22;
 rounds.forEach((round, r) => {
  const x = r * (cardW + gap), order = 0.2 + r * 0.9, prev = rounds[r - 1];
  items.push({ key: `br:${r}`, type: 'label', layer: 'back', order, props: { x, y: top + 8 }, fixed: { lines: [caps(round.name, cardW)], anchor: 'start', cls: 'dg-eyebrow' } });
  round.matches.forEach((match, j) => {
   const y = top + head + round.ys[j] - least, key = `bm:${r}:${j}`, at = order + 0.1 + j * 0.08, mark = items.length;
   let cut = false;
   items.push({ key, type: 'wbox', layer: 'edges', order: at, props: { x, y, w: cardW, h: BRACKET.card }, fixed: { cls: 'dg-plate', rx: 8 } });
   items.push({ key: `${key}:rule`, type: 'line', layer: 'nodes', order: at + 0.02, props: { x1: x + 10, y1: y + BRACKET.card / 2, x2: x + cardW - 10, y2: y + BRACKET.card / 2 }, fixed: { cls: 'dg-grid' } });
   [[match.a, match.sa, 0], [match.b, match.sb, 1]].forEach(([name, score, side]) => {
    const cy = y + BRACKET.card / 4 + side * BRACKET.card / 2, out = match.won >= 0 && match.won !== side ? ' is-out' : '';
    const text = score === null ? '' : String(score), span = cardW - 20 - (text ? widthOf(text, FONT.amount) + 10 : 0), shown = truncate(name, span, ...FONT.row);
    cut ||= shown !== name;
    if (name) items.push({ key: `${key}:n${side}`, type: 'label', order: at + 0.04, props: { x: x + 10, y: cy }, fixed: { lines: [shown], anchor: 'start', cls: `dg-team${out}` } });
    if (text) items.push({ key: `${key}:s${side}`, type: 'label', order: at + 0.06, props: { x: x + cardW - 10, y: cy }, fixed: { lines: [text], anchor: 'end', cls: `dg-score${out}` } });
   });
   // A match answers the pointer as one thing, and names cut short to fit its plate are told whole.
   const tip = cut ? { title: [match.a, match.b].filter(Boolean).join(' – '), rows: [], hot: [key] } : { silent: true, hot: [key] };
   for (let k = mark; k < items.length; k++) tips.set(items[k].key, tip);
   if (match.note) items.push({ key: `${key}:note`, type: 'label', layer: 'back', order: at + 0.08, props: { x: x + cardW - 10, y: y + BRACKET.card + 11 }, fixed: { lines: [truncate(match.note, cardW - 20, ...FONT.tick)], anchor: 'end', cls: 'dg-tick' } });
   if (prev && prev.matches.length === round.matches.length * 2) {
    for (const k of [2 * j, 2 * j + 1]) {
     const sy = top + head + prev.ys[k] - least + BRACKET.card / 2, sx = x - gap, mx = x - gap / 2, ty = y + BRACKET.card / 2;
     items.push({ key: `${key}:in${k}`, type: 'edge', layer: 'back', order: at - 0.05, props: { pts: polyline([[sx, sy], [mx, sy], [mx, ty], [x, ty]]) }, fixed: { style: 'solid', head: 'none', cls: 'dg-tie', draw: 320 } });
    }
   }
  });
 });
 const most = Math.max(...rounds.flatMap(round => round.ys));
 return { kind: 'bracket', width: n * cardW + (n - 1) * gap, height: top + head + most - least + BRACKET.card + (noted ? 18 : 0), items, tips, corner };
}

/* Kinds made for one subject: food, papers, matches */

// Food: what a day or a dish gives. A row named for energy is the total, rows named for protein, fat and carbs are
// what it is made of, each with `of N` for the goal; any other row with calories is a meal or a dish, which may
// carry what it gives of the three after a bar: 18 / 12 / 58, or P 18 · F 12 · C 58.
const ENERGY = /^(?:калори|энерги|ккал|calor|energy|kcal)/iu;
const KCAL = /ккал|kcal|cal(?![\p{L}])/iu;
const MACROS = [
 ['protein', /^(?:белк|protein|prot(?![\p{L}])|б(?![\p{L}]))/iu, 4, 's1'],
 ['fat', /^(?:жир|fat|ж(?![\p{L}]))/iu, 9, 's2'],
 ['carbs', /^(?:углевод|carb|у(?![\p{L}]))/iu, 4, 's3'],
];
const GOAL = /^(?:of|out of|from|из|\/|goal|цель|норма)\s*:?\s*(.+)$/i;

function macroSplit(text) {
 const named = {};
 for (const m of text.matchAll(/(?:^|[\s·,;/(])([бжуpfc])[\p{L}.]*\s*:?\s*(\d+(?:[.,]\d+)?)/giu)) named[{ б: 'p', ж: 'f', у: 'c' }[m[1].toLowerCase()] || m[1].toLowerCase()] = number(m[2]);
 if ('p' in named && 'f' in named && 'c' in named) return [named.p, named.f, named.c];
 const plain = /^\s*(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)\s*(?:г|g)?\s*$/i.exec(text);
 return plain ? [number(plain[1]), number(plain[2]), number(plain[3])] : null;
}

function parseNutrition(lines) {
 const data = { title: '', energy: null, macros: [], extras: [], meals: [] };
 for (const raw of lines.slice(1)) {
  const line = bare(raw);
  let m;
  if (!line) continue;
  if (!line.includes('|') && (m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.title = unquote(m[1]); continue; }
  const cells = line.includes('|') ? cellsOf(line) : rowCells(line), name = unquote(cells[0] || ''), value = amount(cells[1] || '');
  if (!name || !value) continue;
  const rest = cells.slice(2).filter(Boolean), goal = rest.map(cell => GOAL.exec(cell)).find(Boolean), aim = goal ? amount(goal[1])?.value ?? null : null;
  const macro = MACROS.find(([, test]) => test.test(name)), energy = KCAL.test(value.after);
  if (ENERGY.test(name)) data.energy = { value: value.value, goal: aim, unit: value.after || '' };
  else if (macro && !energy) data.macros.push({ key: macro[0], name, value: value.value, goal: aim, unit: value.after || '', per: macro[2], tone: macro[3] });
  else if (!energy && value.after) data.extras.push({ name, value: value.value, goal: aim, unit: value.after });
  else {
   const split = rest.map(macroSplit).find(Boolean) || null, head = /^([^:]{1,24}):\s+(.+)$/.exec(name);
   data.meals.push({ name: head ? head[1] : name, text: head ? head[2] : '', kcal: value.value, split, note: rest.filter(cell => !macroSplit(cell) && !GOAL.test(cell)).map(unquote).join(' · ') });
  }
 }
 const order = MACROS.map(([key]) => key);
 data.macros.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
 if (!data.energy) {
  const eaten = data.meals.length ? data.meals.reduce((sum, meal) => sum + meal.kcal, 0) : data.macros.reduce((sum, macro) => sum + macro.value * macro.per, 0);
  if (eaten > 0) data.energy = { value: eaten, goal: null, unit: '' };
 }
 return data.energy ? data : null;
}

function nutritionScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 300, FOOD.max), items = [], tips = new Map(), accent = tones[0];
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  top = CHART.head + 4;
  corner = { x: title.width + 16, h: 28 };
 }
 // The ring is the day's energy: how much of the goal is eaten and, when the three are known, what it is made of.
 const energy = data.energy, R = FOOD.ring, cx = R + FOOD.width / 2, cy = top + R + FOOD.width / 2, D = cx * 2;
 const filled = energy.goal ? clamp01(energy.value / energy.goal) : 1, burn = data.macros.reduce((sum, macro) => sum + macro.value * macro.per, 0);
 items.push({ key: 'nr:track', type: 'arc', order: 0.1, props: { start: 0, sweep: 100 }, fixed: { cx, cy, r: R, width: FOOD.width, tone: 'mute', gap: 0, cls: 'is-track' } });
 if (burn > 0 && data.macros.length > 1) {
  let start = 0;
  data.macros.forEach((macro, k) => {
   const sweep = macro.value * macro.per / burn * filled * 100;
   items.push({ key: `nr:${macro.key}`, type: 'arc', order: 0.3 + k * 0.25, props: { start, sweep }, fixed: { cx, cy, r: R, width: FOOD.width, tone: macro.tone, gap: sweep > 3 ? 0.9 : 0 } });
   start += sweep;
  });
 } else items.push({ key: 'nr:all', type: 'arc', order: 0.3, props: { start: 0, sweep: filled * 100 }, fixed: { cx, cy, r: R, width: FOOD.width, tone: accent, gap: 0 } });
 const unit = energy.unit || (/[а-яё]/i.test(data.title + data.macros.map(macro => macro.name).join('')) ? 'ккал' : 'kcal');
 items.push({ key: 'nr:value', type: 'label', order: 0.6, props: { x: cx, y: cy - 5 }, fixed: { lines: [format(Math.round(energy.value))], cls: 'dg-center-value', pop: true } });
 items.push({ key: 'nr:unit', type: 'label', order: 0.7, props: { x: cx, y: cy + 13 }, fixed: { lines: [unit], cls: 'dg-center-label' } });
 if (energy.goal) {
  const over = energy.value > energy.goal, text = `${format(Math.round(energy.value / energy.goal * 100))}% · ${format(energy.goal)}`;
  items.push({ key: 'nr:goal', type: 'label', order: 0.8, props: { x: cx, y: top + D + 12 }, fixed: { lines: [text], cls: over ? 'dg-metric-change is-bad' : 'dg-metric-note' } });
 }
 // Beside the ring, what the energy is made of: grams, a thin measure against the goal, and how far along it is.
 const rows = [...data.macros, ...data.extras], beside = W >= 430, x0 = beside ? D + 30 : 0, rowH = FOOD.row;
 const nameW = Math.max(0, ...rows.map(row => widthOf(row.name, FONT.legend))), amountOf = row => row.goal ? `${format(row.value)} / ${withUnit(row.goal, '', row.unit)}` : withUnit(row.value, '', row.unit);
 const amountW = Math.max(0, ...rows.map(row => widthOf(amountOf(row), FONT.amount))), tailOf = row => row.goal ? `${format(Math.round(row.value / row.goal * 100))}%` : burn > 0 && row.per ? `${format(Math.round(row.value * row.per / burn * 100))}%` : '';
 const tailW = Math.max(0, ...rows.map(row => widthOf(tailOf(row), FONT.value)));
 let y = beside ? top + Math.max(0, (D - rows.length * rowH) / 2) : top + D + (energy.goal ? 30 : 14);
 const barX = x0 + nameW + 14 + amountW + 14, barW = Math.max(40, W - barX - (tailW ? tailW + 12 : 0));
 rows.forEach((row, i) => {
  const cyRow = y + rowH / 2, order = 0.9 + i * 0.2, key = `nm:${i}`, part = row.goal ? row.value / row.goal : burn > 0 && row.per ? row.value * row.per / burn : 0;
  items.push({ key: `${key}:name`, type: 'label', order, props: { x: x0, y: cyRow }, fixed: { lines: [row.name], anchor: 'start', cls: 'dg-metric-name' } });
  items.push({ key: `${key}:amount`, type: 'label', order: order + 0.05, props: { x: x0 + nameW + 14 + amountW, y: cyRow }, fixed: { lines: [amountOf(row)], anchor: 'end', cls: 'dg-row-value' } });
  // A nutrient with nothing to measure it against is only named with its amount.
  if (row.goal || row.per) {
   items.push({ key: `${key}:track`, type: 'rect', layer: 'nodes', order: order + 0.1, props: { x: barX, y: cyRow - 2.5, w: barW, h: 5 }, fixed: { cls: 'dg-meter-track', tone: row.tone || 'mute', rx: 2.5 } });
   items.push({ key: `${key}:fill`, type: 'span', order: order + 0.15, props: { x: barX, y: cyRow, w: Math.max(3, barW * clamp01(part)), h: 5 }, fixed: { cls: 'dg-meter-fill', tone: row.tone || 'mute', rx: 2.5 } });
  }
  if (tailOf(row)) items.push({ key: `${key}:tail`, type: 'label', order: order + 0.2, props: { x: W, y: cyRow }, fixed: { lines: [tailOf(row)], anchor: 'end', cls: row.goal && row.value > row.goal * 1.05 ? 'dg-value is-over' : 'dg-value' } });
  y += rowH;
 });
 y = Math.max(y, top + D + (energy.goal ? 26 : 8));
 // Under them, the meals: what each was, its calories, what it gave of the three, and its part of the day.
 if (data.meals.length) {
  const whole = data.meals.reduce((sum, meal) => sum + meal.kcal, 0) || 1, splitW = data.meals.some(meal => meal.split) ? FOOD.split + 16 : 0;
  const kcalW = Math.max(...data.meals.map(meal => widthOf(format(meal.kcal), FONT.amount))), shareW = Math.max(...data.meals.map(meal => widthOf(`${format(Math.round(meal.kcal / whole * 100))}%`, FONT.tick))) + 12;
  const room = W - kcalW - shareW - splitW - 14;
  y += 10;
  items.push({ key: 'nl:rule', type: 'line', layer: 'back', order: 1.6, props: { x1: 0, y1: y, x2: W, y2: y }, fixed: { cls: 'dg-line', draw: true } });
  y += 8;
  data.meals.forEach((meal, i) => {
   const sub = [meal.text, meal.note].filter(Boolean).join(' · '), h = sub ? FOOD.meal + 16 : FOOD.meal, cyRow = y + (sub ? 13 : h / 2), order = 1.8 + i * 0.15, key = `nl:${i}`;
   items.push({ key, type: 'hit', layer: 'back', order, props: { x: -8, y, w: W + 16, h }, fixed: {} });
   tips.set(key, { silent: true });
   items.push({ key: `${key}:name`, type: 'label', order, props: { x: 0, y: cyRow }, fixed: { lines: [truncate(meal.name, room, ...FONT.row)], anchor: 'start', cls: 'dg-row-name' } });
   if (sub) items.push({ key: `${key}:sub`, type: 'label', order: order + 0.03, props: { x: 0, y: cyRow + 17 }, fixed: { lines: [truncate(sub, room, ...FONT.tick)], anchor: 'start', cls: 'dg-row-note' } });
   if (meal.split) {
    // What a meal gave of the three, as one thin bar parted in their colours.
    const sum = meal.split.reduce((s, grams, k) => s + grams * MACROS[k][2], 0) || 1;
    let sx = W - shareW - kcalW - 14 - FOOD.split;
    meal.split.forEach((grams, k) => {
     const w = Math.max(2, (FOOD.split - 4) * grams * MACROS[k][2] / sum);
     items.push({ key: `${key}:s${k}`, type: 'span', order: order + 0.06 + k * 0.02, props: { x: sx, y: cyRow, w, h: 5 }, fixed: { cls: 'dg-meter-fill', tone: MACROS[k][3], rx: 2 } });
     sx += w + 2;
    });
   }
   items.push({ key: `${key}:kcal`, type: 'label', order: order + 0.08, props: { x: W - shareW, y: cyRow }, fixed: { lines: [format(meal.kcal)], anchor: 'end', cls: 'dg-row-value' } });
   items.push({ key: `${key}:share`, type: 'label', order: order + 0.1, props: { x: W, y: cyRow }, fixed: { lines: [`${format(Math.round(meal.kcal / whole * 100))}%`], anchor: 'end', cls: 'dg-row-share' } });
   for (const part of [`${key}:name`, `${key}:sub`, `${key}:kcal`, `${key}:share`]) tips.set(part, { silent: true, hot: [key] });
   y += h;
  });
 }
 return { kind: 'nutrition', width: W, height: y + 2, items, tips, corner, flush: true };
}

// What a thing is, at a glance: a paper, a car, a product. A row is a name and what it is; `file` opens the list
// with the file itself, its pages and its size. good, bad or warn after a value puts a mark of that colour by it.
const MOOD = /^(good|bad|warn|ok|хорошо|плохо|внимание)$/i, MOODS = { good: 'good', ok: 'good', хорошо: 'good', bad: 'bad', плохо: 'bad', warn: 'warn', внимание: 'warn' };

function parseFacts(lines) {
 const data = { title: '', file: null, rows: [] };
 for (const raw of lines.slice(1)) {
  const line = bare(raw);
  let m;
  if (!line) continue;
  if (!line.includes('|') && (m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.title = unquote(m[1]); continue; }
  if ((m = /^(?:file|файл|document|документ)(?:\s*:\s*|\s+)(?!\|)(.+)$/i.exec(line)) && !data.file) { const cells = cellsOf(m[1]); data.file = { name: unquote(cells[0]), meta: cells.slice(1).filter(Boolean).map(unquote).join(' · ') }; continue; }
  // Written with a colon, what stands after it is the value whole: its brackets are part of what it says.
  const colon = /^([^:|]{1,60}):\s+(.+)$/.exec(line), cells = line.includes('|') ? cellsOf(line) : colon ? [colon[1].trim(), colon[2].trim()] : [line];
  if (!cells[0] || !cells[1]) continue;
  const mood = cells.slice(2).find(cell => MOOD.test(cell));
  data.rows.push({ label: unquote(cells[0]), value: unquote(cells[1]), note: cells.slice(2).filter(cell => cell && !MOOD.test(cell)).map(unquote).join(' · '), mood: mood ? MOODS[mood.toLowerCase()] : '' });
 }
 return data.rows.length || data.file ? data : null;
}

function factsScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 280, FACTS.max), items = [];
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  top = CHART.head + 2;
  corner = { x: title.width + 16, h: 28 };
 }
 let y = top;
 if (data.file) {
  // The file itself heads the list: a sheet with a turned corner, its name, and what is known of it.
  const metaW = data.file.meta ? widthOf(data.file.meta, FONT.tick) + 12 : 0;
  items.push({ key: 'ff:icon', type: 'wglyph', order: 0.2, props: { x: 9, y: y + 13, s: 26 }, fixed: { icon: 'sheet', cls: 'is-sheet', tone: tones[0] } });
  items.push({ key: 'ff:name', type: 'label', order: 0.25, props: { x: 28, y: y + 13 }, fixed: { lines: [truncate(data.file.name, W - 28 - metaW, ...FONT.strong)], anchor: 'start', cls: 'dg-row-total' } });
  if (data.file.meta) items.push({ key: 'ff:meta', type: 'label', order: 0.3, props: { x: W, y: y + 13 }, fixed: { lines: [truncate(data.file.meta, W * 0.5, ...FONT.tick)], anchor: 'end', cls: 'dg-row-note' } });
  y += 30;
  if (data.rows.length) { items.push({ key: 'ff:rule', type: 'line', layer: 'back', order: 0.3, props: { x1: 0, y1: y, x2: W, y2: y }, fixed: { cls: 'dg-line', draw: true } }); y += 6; }
 }
 // Names stand in a column of small capitals; what each is fills the rest of the line and wraps where it must.
 const labelW = Math.min(W * 0.36, Math.max(60, ...data.rows.map(row => capsWidth(row.label.toUpperCase())))) + 20, valueW = W - labelW;
 data.rows.forEach((row, i) => {
  const order = 0.4 + i * 0.18, key = `fr:${i}`, dot = row.mood ? 14 : 0;
  const lines = wrap(row.value, valueW - dot, ...FONT.row).slice(0, 4), notes = row.note ? wrap(row.note, valueW, ...FONT.tick).slice(0, 2) : [];
  const h = Math.max(FACTS.row, 14 + lines.length * 18 + notes.length * 15);
  if (i) items.push({ key: `${key}:rule`, type: 'line', layer: 'back', order, props: { x1: 0, y1: y, x2: W, y2: y }, fixed: { cls: 'dg-grid' } });
  items.push({ key: `${key}:label`, type: 'label', layer: 'back', order, props: { x: 0, y: y + 14.5 }, fixed: { lines: [caps(row.label, labelW - 12)], anchor: 'start', cls: 'dg-eyebrow' } });
  if (row.mood) items.push({ key: `${key}:mood`, type: 'dot', order: order + 0.03, props: { x: labelW + 4, y: y + 14.5, r: 3.5 }, fixed: { cls: `dg-state is-${row.mood}` } });
  items.push({ key: `${key}:value`, type: 'label', order: order + 0.05, props: { x: labelW + dot, y: y + 7 }, fixed: { lines, anchor: 'start', baseline: 'below', lineHeight: 18, cls: 'dg-row-name' } });
  if (notes.length) items.push({ key: `${key}:note`, type: 'label', order: order + 0.08, props: { x: labelW, y: y + 7 + lines.length * 18 + 1 }, fixed: { lines: notes, anchor: 'start', baseline: 'below', lineHeight: 15, cls: 'dg-row-note' } });
  y += h;
 });
 return { kind: 'facts', width: W, height: y, items, corner, flush: true };
}

// What holds and what does not: claims of a paper, requirements, points of an inspection. A row opens with how it
// stands, [x] yes, [!] mind this, [-] no, [?] not known, [ ] still open, then what it is, and a note after a bar.
const STATE = [
 ['good', /^(?:\[\s*[xXхХvV✓✔+]\s*\]|[✓✔✅☑])\s*/u, 'check'],
 ['warn', /^(?:\[\s*[!~]\s*\]|[⚠❗])\s*/u, 'bang'],
 ['bad', /^(?:\[\s*[-–—✗✘×]\s*\]|[✗✘✕❌⛔])\s*/u, 'cross'],
 ['ask', /^(?:\[\s*\?\s*\]|[❓?])\s*/u, 'ask'],
 ['open', /^(?:\[\s*\]|[☐○])\s*/u, ''],
];
const STATE_WORD = { good: 'good', ok: 'good', yes: 'good', да: 'good', bad: 'bad', no: 'bad', нет: 'bad', warn: 'warn', warning: 'warn', unknown: 'ask', open: 'open' };

function parseChecklist(lines) {
 const data = { title: '', rows: [] };
 let base = null;
 for (const raw of lines.slice(1)) {
  const indent = indentOf(raw);
  // A number before the mark of a row, as in a numbered list, says nothing here and is dropped.
  let line = bare(raw).replace(new RegExp(String.fromCharCode(0xfe0f), 'g'), '').replace(/^\d{1,2}[.)]\s+(?=\[|[✓✔✅☑⚠❗✗✘✕❌⛔❓☐○])/u, ''), m;
  if (!line) continue;
  if (!data.rows.length && !line.includes('|') && (m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.title = unquote(m[1]); continue; }
  base ??= indent;
  const last = data.rows[data.rows.length - 1];
  if (indent > base && last && !STATE.some(([, test]) => test.test(line))) { last.notes.push(cleanLabel(line)); continue; }
  // `[x]` lost its dash to the bullet reader when written as `- [x]`; `[-]` keeps its own.
  let state = STATE.find(([, test]) => test.test(line));
  if (state) line = line.replace(state[1], '');
  const cells = cellsOf(line), word = cells.length > 1 ? STATE_WORD[cells[cells.length - 1].toLowerCase()] : '';
  if (word) cells.pop();
  const text = cleanLabel(cells[0] || '');
  if (text) data.rows.push({ text, state: word || (state ? state[0] : 'open'), aside: cells.slice(1).filter(Boolean).map(cleanLabel).join(' · '), notes: [] });
 }
 return data.rows.length ? data : null;
}

function checklistScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 280, STEPS.max), items = [], R = CHECK.mark, textX = R * 2 + 12;
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  top = STEPS.head;
  corner = { x: title.width + 16, h: 28 };
 }
 // How many of each, told once over the list when it is long enough to want a count.
 const kinds = ['good', 'warn', 'bad', 'ask', 'open'].map(state => [state, data.rows.filter(row => row.state === state).length]).filter(([, n]) => n);
 if (data.rows.length >= 4 && kinds.length > 1) {
  let x = 0;
  kinds.forEach(([state, n], k) => {
   items.push({ key: `ck:tally:${state}`, type: 'dot', order: 0.1 + k * 0.05, props: { x: x + 4, y: top + 9, r: 3.5 }, fixed: { cls: `dg-state is-${state}` } });
   items.push({ key: `ck:count:${state}`, type: 'label', order: 0.12 + k * 0.05, props: { x: x + 13, y: top + 9 }, fixed: { lines: [String(n)], anchor: 'start', cls: 'dg-value' } });
   x += 13 + widthOf(String(n), FONT.value) + 16;
  });
  top += 26;
 }
 let y = top + 2;
 data.rows.forEach((row, i) => {
  const order = 0.3 + i * 0.3, key = `ck:${i}`, cy = y + R, icon = STATE.find(([state]) => state === row.state)[2];
  const aside = row.aside && widthOf(row.aside, FONT.tick) <= W * 0.4;
  const lines = wrap(row.text, W - textX - (aside ? widthOf(row.aside, FONT.tick) + 18 : 0), ...FONT.step);
  items.push({ key: `${key}:mark`, type: 'dot', layer: 'nodes', order, props: { x: R, y: cy, r: R }, fixed: { cls: `dg-check-mark is-${row.state}` } });
  if (icon) items.push({ key: `${key}:icon`, type: 'wglyph', order: order + 0.05, props: { x: R, y: cy, s: 14 }, fixed: { icon, cls: `dg-check-icon is-${row.state}` } });
  items.push({ key: `${key}:t`, type: 'label', order: order + 0.1, props: { x: textX, y: cy - 7 }, fixed: { lines, anchor: 'start', baseline: 'below', lineHeight: 18, cls: row.state === 'open' ? 'dg-step-text is-done' : 'dg-step-text' } });
  if (aside) items.push({ key: `${key}:aside`, type: 'label', order: order + 0.15, props: { x: W, y: cy }, fixed: { lines: [row.aside], anchor: 'end', cls: 'dg-step-meta' } });
  let ty = cy - 7 + lines.length * 18;
  const under = [...(row.aside && !aside ? [row.aside] : []), ...row.notes];
  under.forEach((note, j) => {
   const text = wrap(note, W - textX, ...FONT.note).slice(0, 3);
   items.push({ key: `${key}:o${j}`, type: 'label', order: order + 0.2 + j * 0.05, props: { x: textX, y: ty + 3 }, fixed: { lines: text, anchor: 'start', baseline: 'below', lineHeight: 16, cls: 'dg-step-note' } });
   ty += 3 + text.length * 16;
  });
  y = Math.max(ty, cy + R) + CHECK.gap;
 });
 return { kind: 'checklist', width: W, height: y - CHECK.gap, items, corner, flush: true };
}

// What became different: a name, what it was, an arrow, what it is now, then a note; good or bad says which way
// the change is welcome. Written without an arrow, the second and the third cell are the two values.
const ARROW_SPLIT = /\s*(?:-{1,2}>|=>|→|⟶|➜|➔)\s*/;

function parseChanges(lines) {
 const data = { title: '', rows: [] };
 for (const raw of lines.slice(1)) {
  const line = bare(raw);
  let m;
  if (!line) continue;
  if (!line.includes('|') && (m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.title = unquote(m[1]); continue; }
  const cells = line.includes('|') ? cellsOf(line) : rowCells(line);
  if (!cells[0] || cells.length < 2) continue;
  let rest = cells.slice(1).filter(Boolean), was, now;
  const at = rest.findIndex(cell => ARROW_SPLIT.test(cell));
  if (at >= 0) { [was, now] = rest[at].split(ARROW_SPLIT).map(part => part.trim()); rest.splice(at, 1); }
  else if (rest.length >= 2) { [was, now] = rest; rest = rest.slice(2); }
  else continue;
  const mood = rest.find(cell => MOOD.test(cell));
  data.rows.push({ label: unquote(cells[0]), was: minus(unquote(was.replace(/^(?:было|was|from)\s+/i, ''))), now: minus(unquote(now.replace(/^(?:стало|now|to)\s+/i, ''))), note: rest.filter(cell => !MOOD.test(cell)).map(unquote).join(' · '), mood: mood ? MOODS[mood.toLowerCase()] : '' });
 }
 return data.rows.length ? data : null;
}

function changesScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 300, LEDGER.max), items = [], tips = new Map();
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  top = LEDGER.head;
  corner = { x: title.width + 16, h: 28 };
 }
 // How far the value moved, where both are numbers of one kind: a share of what it was, or the step itself from zero.
 const moved = row => {
  const a = amount(row.was), b = amount(row.now);
  if (!a || !b || a.before !== b.before || (a.after !== b.after && a.after && b.after) || a.value === b.value) return '';
  const step = b.value - a.value, sign = step > 0 ? '+' : '−';
  return a.value ? `${sign}${format(Math.round(Math.abs(step / a.value) * 1000) / 10)}%` : `${sign}${format(Math.abs(step))}`;
 };
 // A value said in many words has a line of its own under the name, was and now side by side there: the short
 // values of the other rows keep their narrow columns, and their names the room.
 const wordy = row => widthOf(row.was, FONT.amount) > W * 0.2 || widthOf(row.now, FONT.strong) > W * 0.26, brief = data.rows.filter(row => !wordy(row));
 const wasW = Math.max(0, ...brief.map(row => widthOf(row.was, FONT.amount))), nowW = Math.max(0, ...brief.map(row => widthOf(row.now, FONT.strong)));
 const moveW = Math.max(0, ...brief.map(row => widthOf(moved(row), FONT.change))), noteW = Math.min(W * 0.26, Math.max(0, ...data.rows.map(row => widthOf(row.note, FONT.tick))));
 const fixedW = wasW + 30 + nowW + (moveW ? moveW + 16 : 0) + (noteW ? noteW + 16 : 0), labelW = Math.min(Math.max(...data.rows.map(row => widthOf(row.label, FONT.row))), Math.max(90, W - fixedW - 16));
 const xWas = labelW + 16 + wasW, xNow = xWas + 30;
 const arrow = (key, order, from, to, cy) => items.push({ key: `${key}:to`, type: 'edge', order: order + 0.06, props: { pts: polyline([[from, cy], [to - ARROW.length, cy]]) }, fixed: { style: 'solid', head: 'arrow', cls: 'dg-turn', grow: true } });
 let y = top + 2;
 data.rows.forEach((row, i) => {
  const long = wordy(row), h = LEDGER.row + 4 + (long ? 20 : 0), cy = y + LEDGER.row / 2 + 2, order = 0.3 + i * 0.14, key = `ch:${i}`;
  const name = truncate(row.label, long ? W - (noteW ? noteW + 16 : 0) : labelW, ...FONT.row), note = row.note ? truncate(row.note, long ? noteW : Math.max(40, W - (xNow + nowW + (moveW ? moveW + 28 : 12))), ...FONT.tick) : '';
  // The line of a wordy row: what it was, cut to half the width if it must be, the arrow, what it is now.
  const was = long ? truncate(row.was, (W - 34) * 0.46, ...FONT.amount) : row.was, wasEnd = widthOf(was, FONT.amount), now = long ? truncate(row.now, W - wasEnd - 34, ...FONT.strong) : row.now;
  const tip = name !== row.label || was !== row.was || now !== row.now ? { title: row.label, rows: [{ name: '', value: `${row.was} → ${row.now}` }], hot: [key] } : { silent: true, hot: [key] };
  items.push({ key, type: 'hit', layer: 'back', order, props: { x: -8, y, w: W + 16, h }, fixed: {} });
  tips.set(key, tip);
  if (i) items.push({ key: `${key}:rule`, type: 'line', layer: 'back', order, props: { x1: 0, y1: y, x2: W, y2: y }, fixed: { cls: 'dg-grid' } });
  items.push({ key: `${key}:name`, type: 'label', order, props: { x: 0, y: cy }, fixed: { lines: [name], anchor: 'start', cls: 'dg-row-name' } });
  const at = long ? cy + 20 : cy, after = long ? wasEnd + 30 + widthOf(now, FONT.strong) : xNow + nowW;
  items.push({ key: `${key}:was`, type: 'label', order: order + 0.04, props: { x: long ? 0 : xWas, y: at }, fixed: { lines: [was], anchor: long ? 'start' : 'end', cls: 'dg-was' } });
  arrow(key, order, (long ? wasEnd : xWas) + 8, (long ? wasEnd + 30 : xNow) - 8, at);
  items.push({ key: `${key}:now`, type: 'label', order: order + 0.08, props: { x: long ? wasEnd + 30 : xNow, y: at }, fixed: { lines: [now], anchor: 'start', cls: 'dg-row-total' } });
  if (!long && moved(row)) items.push({ key: `${key}:move`, type: 'label', order: order + 0.1, props: { x: after + 16, y: at }, fixed: { lines: [moved(row)], anchor: 'start', cls: `dg-metric-change${row.mood ? ` is-${row.mood}` : ''}` } });
  else if (row.mood && after + 16 < W) items.push({ key: `${key}:mood`, type: 'dot', order: order + 0.1, props: { x: after + 12, y: at, r: 3.5 }, fixed: { cls: `dg-state is-${row.mood}` } });
  if (note) items.push({ key: `${key}:note`, type: 'label', order: order + 0.12, props: { x: W, y: cy }, fixed: { lines: [note], anchor: 'end', cls: 'dg-row-note' } });
  for (const part of [`${key}:name`, `${key}:was`, `${key}:now`, `${key}:move`, `${key}:note`]) tips.set(part, tip);
  y += h;
 });
 return { kind: 'changes', width: W, height: y, items, tips, corner, flush: true };
}

// How a paper is built: its parts in order, parts of parts indented under them. A row is the part, then after bars
// where it is (p. 4) and what it says.
const PAGE = /^(?:стр\.?|с\.|p\.?|pp\.?|pages?|страниц[аы]?|§|разд\.?|sec\.?)\s*[\d–—-]+/i, NUMBERED = /^((?:\d+\.)*\d+[.)]?|[IVXLC]+[.)]|[A-ZА-Я][.)])\s+/;

function parseOutline(lines) {
 const data = { title: '', rows: [] };
 let base = null;
 const depths = [];
 for (const raw of lines.slice(1)) {
  const indent = indentOf(raw), line = bare(raw);
  let m;
  if (!line) continue;
  if (!data.rows.length && !line.includes('|') && (m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.title = unquote(m[1]); continue; }
  base ??= indent;
  while (depths.length && depths[depths.length - 1] >= indent) depths.pop();
  const depth = Math.min(3, depths.length);
  depths.push(indent);
  const cells = cellsOf(line), mark = NUMBERED.exec(cells[0]), text = cleanLabel(mark ? cells[0].slice(mark[0].length) : cells[0]);
  // A part numbered 2.1 lies one step in even when the model wrote it flush with the rest.
  const dots = mark ? (mark[1].match(/\d+/g) || []).length - 1 : 0;
  const rest = cells.slice(1).filter(Boolean), where = rest.find(cell => PAGE.test(cell)) || '';
  if (text) data.rows.push({ depth: Math.max(depth, Math.min(3, dots)), mark: mark ? mark[1] : '', text, where: unquote(where), note: rest.filter(cell => cell !== where).map(unquote).join(' · ') });
 }
 return data.rows.length ? data : null;
}

function outlineScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 280, STEPS.max), items = [];
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  top = STEPS.head;
  corner = { x: title.width + 16, h: 28 };
 }
 const markW = Math.max(0, ...data.rows.map(row => widthOf(row.mark, FONT.amount))), whereW = Math.max(0, ...data.rows.map(row => widthOf(row.where, FONT.tick)));
 let y = top + 2, opened = null, rail = null;
 data.rows.forEach((row, i) => {
  const order = 0.3 + i * 0.16, key = `ol:${i}`, x = row.depth * OUTLINE.indent, tx = x + (markW ? markW + 10 : 0), head = row.depth === 0;
  const room = W - tx - (whereW ? whereW + 16 : 0), lines = wrap(row.text, room, ...(head ? FONT.strong : FONT.row)).slice(0, 3), notes = row.note ? wrap(row.note, room, ...FONT.note).slice(0, 3) : [];
  // Each part at the left edge starts under a hairline; the parts under it hang on a rail that runs down from it.
  if (head && i) { items.push({ key: `${key}:rule`, type: 'line', layer: 'back', order, props: { x1: 0, y1: y + 2, x2: W, y2: y + 2 }, fixed: { cls: 'dg-grid' } }); y += 10; }
  if (row.mark) items.push({ key: `${key}:mark`, type: 'label', order, props: { x, y: y + 8.5 }, fixed: { lines: [row.mark], anchor: 'start', cls: head ? 'dg-outline-mark is-head' : 'dg-outline-mark' } });
  else if (!head) items.push({ key: `${key}:dot`, type: 'dot', order, props: { x: x - 8, y: y + 8.5, r: 1.75 }, fixed: { cls: 'dg-outline-dot' } });
  items.push({ key: `${key}:text`, type: 'label', order: order + 0.04, props: { x: tx, y: y + 1 }, fixed: { lines, anchor: 'start', baseline: 'below', lineHeight: 18, cls: head ? 'dg-row-total' : 'dg-row-name' } });
  if (row.where) items.push({ key: `${key}:where`, type: 'label', order: order + 0.08, props: { x: W, y: y + 8.5 }, fixed: { lines: [row.where], anchor: 'end', cls: 'dg-row-note' } });
  let ty = y + 1 + lines.length * 18;
  if (notes.length) { items.push({ key: `${key}:note`, type: 'label', order: order + 0.1, props: { x: tx, y: ty + 1 }, fixed: { lines: notes, anchor: 'start', baseline: 'below', lineHeight: 16, cls: 'dg-step-note' } }); ty += 1 + notes.length * 16; }
  // The parts of a part hang on one rail, which runs down beside them all.
  if (row.depth > 0 && opened !== null) {
   if (rail && rail.of === opened) rail.item.props.y2 = ty;
   else { rail = { of: opened, item: { key: `ol:${opened}:rail`, type: 'line', layer: 'back', order, props: { x1: OUTLINE.indent - 14, y1: y, x2: OUTLINE.indent - 14, y2: ty }, fixed: { cls: 'dg-rail' } } }; items.push(rail.item); }
  }
  if (head) opened = i;
  y = ty + OUTLINE.gap;
 });
 return { kind: 'outline', width: W, height: y - OUTLINE.gap + 2, items, corner, flush: true };
}

// Matches of a day: when, who against whom, what for. A row is the time, the two sides parted by a dash or by the
// score, then the tournament and a note; a star marks the match to watch. A line without bars names a day or a cup.
const SIDES = /^(.+?)\s+(?:(\d+)\s*[:–—-]\s*(\d+)|—|–|-|vs\.?|v|x|:)\s+(.+)$/i;

function parseMatches(lines) {
 const data = { title: '', rows: [] };
 for (const raw of lines.slice(1)) {
  const line = bare(raw);
  let m;
  if (!line) continue;
  if (!data.rows.length && !line.includes('|') && (m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.title = unquote(m[1]); continue; }
  const STAR = /^(?:[*★⭐!]+|top|main|главный)$/iu, all = cellsOf(line.replace(/\s+[*★⭐]\s*$/u, ' | *'));
  const star = all.some(cell => STAR.test(cell)), cells = all.filter((cell, k) => !STAR.test(cell) && (cell || k === 0));
  const time = /^(?:\d{1,2}[:.]\d{2}|\d{1,2}\s?[ap]m|tbd|—|-)$/i.test(cells[0]) ? cells.shift() : '';
  const at = cells.findIndex(cell => SIDES.test(cell));
  if (at < 0) { if (cells.length === 1 && !time) data.rows.push({ head: cleanLabel(cells[0].replace(/:$/, '')) }); continue; }
  const sides = SIDES.exec(cells[at]), rest = cells.filter((_, k) => k !== at).map(cleanLabel).filter(Boolean);
  data.rows.push({ time: time.replace('.', ':'), home: cleanLabel(sides[1]), away: cleanLabel(sides[4]), score: sides[2] !== undefined ? [+sides[2], +sides[3]] : null, what: rest[0] || '', note: rest.slice(1).join(' · '), star });
 }
 return data.rows.some(row => !row.head) ? data : null;
}

function matchesScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 300, LEDGER.max), items = [], tips = new Map(), games = data.rows.filter(row => !row.head);
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  top = LEDGER.head;
  corner = { x: title.width + 16, h: 28 };
 }
 // The two sides face each other across a middle that holds the score, or a dash while the match is not played.
 const timeW = Math.max(0, ...games.map(row => widthOf(row.time, FONT.amount))), x0 = timeW ? timeW + 18 : games.some(row => row.star) ? 14 : 0;
 // The middle is as wide as the widest score: a basketball score takes more room than a football one.
 const whatW = Math.min(W * 0.3, Math.max(0, ...games.map(row => widthOf(row.what, FONT.tick)))), mid = Math.max(44, ...games.map(row => row.score ? widthOf(`${row.score[0]} : ${row.score[1]}`, FONT.amount) + 20 : 0));
 const sideW = Math.max(60, Math.min((W - x0 - mid - (whatW ? whatW + 18 : 0)) / 2, Math.max(...games.flatMap(row => [widthOf(row.home, FONT.strong), widthOf(row.away, FONT.strong)]))));
 const cx = x0 + sideW + mid / 2;
 let y = top + 2, seen = '';
 data.rows.forEach((row, i) => {
  const order = 0.3 + i * 0.14, key = `mt:${i}`;
  if (row.head) {
   items.push({ key, type: 'label', layer: 'back', order, props: { x: 0, y: y + 12 }, fixed: { lines: [caps(row.head, W)], anchor: 'start', cls: 'dg-eyebrow' } });
   y += 26;
   seen = '';
   return;
  }
  const h = row.note ? MATCH.noted : MATCH.row, cy = y + (row.note ? 14 : h / 2), won = row.score ? Math.sign(row.score[0] - row.score[1]) : 0;
  items.push({ key, type: 'hit', layer: 'back', order, props: { x: -8, y, w: W + 16, h }, fixed: {} });
  tips.set(key, { silent: true });
  // The hour is written once for the matches that share it.
  if (row.time && row.time !== seen) items.push({ key: `${key}:time`, type: 'label', order, props: { x: 0, y: cy }, fixed: { lines: [row.time], anchor: 'start', cls: 'dg-match-time' } });
  seen = row.time;
  if (row.star) items.push({ key: `${key}:star`, type: 'dot', order: order + 0.02, props: { x: x0 - 8, y: cy, r: 2.5 }, fixed: { cls: 'dg-point', tone: tones[0] } });
  const name = (text, lead) => truncate(text, sideW, ...(lead ? FONT.strong : FONT.row));
  items.push({ key: `${key}:home`, type: 'label', order: order + 0.04, props: { x: cx - mid / 2, y: cy }, fixed: { lines: [name(row.home, row.star || won > 0)], anchor: 'end', cls: `${row.star || won > 0 ? 'dg-row-total' : 'dg-row-name'}${won < 0 ? ' is-quiet' : ''}` } });
  items.push({ key: `${key}:mid`, type: 'label', order: order + 0.06, props: { x: cx, y: cy }, fixed: { lines: [row.score ? `${row.score[0]} : ${row.score[1]}` : '–'], cls: row.score ? 'dg-score' : 'dg-row-share' } });
  items.push({ key: `${key}:away`, type: 'label', order: order + 0.08, props: { x: cx + mid / 2, y: cy }, fixed: { lines: [name(row.away, row.star || won < 0)], anchor: 'start', cls: `${row.star || won < 0 ? 'dg-row-total' : 'dg-row-name'}${won > 0 ? ' is-quiet' : ''}` } });
  if (row.what) items.push({ key: `${key}:what`, type: 'label', order: order + 0.1, props: { x: W, y: cy }, fixed: { lines: [truncate(row.what, whatW || W * 0.3, ...FONT.tick)], anchor: 'end', cls: 'dg-row-note' } });
  if (row.note) items.push({ key: `${key}:note`, type: 'label', order: order + 0.12, props: { x: cx, y: cy + 16 }, fixed: { lines: [truncate(row.note, W - x0, ...FONT.tick)], cls: 'dg-row-note' } });
  for (const part of [`${key}:time`, `${key}:home`, `${key}:mid`, `${key}:away`, `${key}:what`, `${key}:note`]) tips.set(part, { silent: true, hot: [key] });
  y += h;
 });
 return { kind: 'matches', width: W, height: y, items, tips, corner, flush: true };
}

/* More kinds made for one subject: languages, cooking, devices, travel */

// The cells of a row of these kinds: parted by bars, or written as name: value, or as name — value.
function pairCells(line) {
 if (line.includes('|')) return cellsOf(line);
 if (/^[^:]{1,60}:\s+\S/.test(line)) return rowCells(line);
 const m = /^(.+?)\s+[—–-]\s+(.+)$/.exec(line);
 return m ? [m[1].trim(), m[2].trim()] : [line];
}

// Words to learn: the word, how it is said in brackets or between slashes, what it means, and after that an
// example. A line without bars names a group of words.
const SOUND = /^(?:\[[^\]]+\]|\/[^/]+\/)$/, SOUND_END = /^(.+?)\s*(\[[^\]]+\]|\/[^/\s][^/]*\/)$/;
const SPEECH = /^(?:n|v|adj|adv|prep|conj|pron|num|noun|verb|phr|idiom|сущ|гл|прил|нареч|предл|союз|мест|числ|част|фраза|m|f|nt|pl|м|ж|ср|мн)\.?$/iu;

function parseWords(lines) {
 const data = { title: '', rows: [] };
 for (const raw of lines.slice(1)) {
  const line = bare(raw);
  let m;
  if (!line) continue;
  if (!data.rows.length && !line.includes('|') && (m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.title = unquote(m[1]); continue; }
  const cells = pairCells(line).filter(Boolean);
  if (cells.length < 2) { data.rows.push({ head: cleanLabel(line.replace(/:$/, '')) }); continue; }
  // How a word is said may stand in a cell of its own or right after the word.
  let word = cleanLabel(cells.shift()), sound = cells.find(cell => SOUND.test(cell)) || '';
  if (!sound && (m = SOUND_END.exec(word))) { word = m[1]; sound = m[2]; }
  const speech = cells.find(cell => SPEECH.test(cell)) || '', rest = cells.filter(cell => cell !== sound && cell !== speech).map(cleanLabel);
  if (word) data.rows.push({ word, sound, speech, meaning: rest[0] || '', example: rest.slice(1).join(' — ') });
 }
 return data.rows.some(row => !row.head) ? data : null;
}

function wordsScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 300, LEDGER.max), items = [], tips = new Map(), words = data.rows.filter(row => !row.head);
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  top = LEDGER.head;
  corner = { x: title.width + 16, h: 28 };
 }
 // The words stand in a column of their own, each with how it is said; what they mean starts on one line for all.
 const soundW = row => row.sound ? 8 + widthOf(row.sound, FONT.tick) : 0, speechW = Math.max(0, ...words.map(row => widthOf(row.speech, FONT.tick)));
 const col = Math.min(W * 0.46, Math.max(...words.map(row => widthOf(row.word, FONT.strong) + soundW(row)))) + 24, room = W - col - (speechW ? speechW + 14 : 0);
 let y = top + 2, first = true;
 data.rows.forEach((row, i) => {
  const order = 0.3 + i * 0.12, key = `wd:${i}`;
  if (row.head) {
   items.push({ key, type: 'label', layer: 'back', order, props: { x: 0, y: y + (first ? 9 : 19) }, fixed: { lines: [caps(row.head, W)], anchor: 'start', cls: 'dg-eyebrow' } });
   y += first ? 24 : 34;
   first = true;
   return;
  }
  const meaning = wrap(row.meaning, room, ...FONT.row).slice(0, 3), example = row.example ? wrap(row.example, room, ...FONT.note).slice(0, 3) : [];
  const h = Math.max(32, 14 + meaning.length * 17 + (example.length ? 2 + example.length * 16 : 0)), word = truncate(row.word, col - 24 - soundW(row), ...FONT.strong);
  if (!first) items.push({ key: `${key}:rule`, type: 'line', layer: 'back', order, props: { x1: 0, y1: y, x2: W, y2: y }, fixed: { cls: 'dg-grid' } });
  items.push({ key, type: 'hit', layer: 'back', order, props: { x: -8, y, w: W + 16, h }, fixed: {} });
  tips.set(key, { silent: true });
  items.push({ key: `${key}:word`, type: 'label', order, props: { x: 0, y: y + 15.5 }, fixed: { lines: [word], anchor: 'start', cls: 'dg-row-total' } });
  if (row.sound) items.push({ key: `${key}:sound`, type: 'label', order: order + 0.03, props: { x: widthOf(word, FONT.strong) + 8, y: y + 15.5 }, fixed: { lines: [row.sound], anchor: 'start', cls: 'dg-row-note' } });
  items.push({ key: `${key}:means`, type: 'label', order: order + 0.05, props: { x: col, y: y + 9.5 }, fixed: { lines: meaning, anchor: 'start', baseline: 'below', lineHeight: 17, cls: 'dg-row-name' } });
  if (example.length) items.push({ key: `${key}:say`, type: 'label', order: order + 0.08, props: { x: col, y: y + 11 + meaning.length * 17 }, fixed: { lines: example, anchor: 'start', baseline: 'below', lineHeight: 16, cls: 'dg-step-note' } });
  if (row.speech) items.push({ key: `${key}:kind`, type: 'label', order: order + 0.1, props: { x: W, y: y + 15.5 }, fixed: { lines: [row.speech], anchor: 'end', cls: 'dg-row-note' } });
  for (const part of [`${key}:word`, `${key}:sound`, `${key}:means`, `${key}:say`, `${key}:kind`]) tips.set(part, { silent: true, hot: [key] });
  y += h;
  first = false;
 });
 return { kind: 'words', width: W, height: y, items, tips, corner, flush: true };
}

// A sentence taken apart: its words in a row, under each what it means, and under that what it is. A line that
// opens with = gives the whole sentence in the reader's language. A word between stars is the one to look at.
function parseGloss(lines) {
 const data = { title: '', whole: '' }, tiers = [];
 for (const raw of lines.slice(1)) {
  const line = raw.trim();
  let m;
  if (!line) continue;
  if (!tiers.length && !line.includes('|') && (m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.title = unquote(m[1]); continue; }
  if ((m = /^(?:=+|→|translation\s*:|перевод\s*:)\s*(.+)$/i.exec(line))) { data.whole = unquote(m[1]); continue; }
  // A line without bars is the sentence itself when it comes first, and its translation when it comes after.
  if (!line.includes('|') && tiers.length) { data.whole ||= unquote(line); continue; }
  tiers.push(line.includes('|') ? cellsOf(line) : line.split(/\s+/));
 }
 if (!tiers.length) return null;
 const count = Math.max(...tiers.map(tier => tier.length));
 data.cells = Array.from({ length: count }, (_, i) => {
  const word = tiers[0][i] || '', key = /^\*[^*]+\*$/.test(word);
  return { key, lines: tiers.map((tier, t) => cleanLabel(t ? tier[i] || '' : key ? word.slice(1, -1) : word)) };
 });
 return data;
}

function glossScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 300, LEDGER.max), items = [], depth = data.cells[0].lines.length;
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  top = LEDGER.head;
  corner = { x: title.width + 16, h: 28 };
 }
 // Each word is a small column: the word, a rule under it, then what it means and what it is. The columns run on
 // like the words of a line and turn to the next line where the room ends.
 const fonts = [FONT.period, FONT.row, FONT.tick], rowH = 26 + (depth > 1 ? 20 : 0) + Math.max(0, depth - 2) * 16;
 let x = 0, y = top + 4;
 data.cells.forEach((cell, i) => {
  const w = Math.min(W, Math.max(22, ...cell.lines.map((text, t) => widthOf(text, fonts[Math.min(t, 2)])))), order = 0.3 + i * 0.16, key = `gl:${i}`;
  if (x && x + w > W) { x = 0; y += rowH + 18; }
  items.push({ key: `${key}:word`, type: 'label', order, props: { x, y: y + 9 }, fixed: { lines: [truncate(cell.lines[0], W, ...FONT.period)], anchor: 'start', cls: 'dg-gloss-word' } });
  items.push({ key: `${key}:rule`, type: 'line', layer: 'back', order: order + 0.04, props: { x1: x, y1: y + 22, x2: x + w, y2: y + 22 }, fixed: { cls: cell.key ? 'dg-gloss-rule is-key' : 'dg-gloss-rule', tone: tones[0], draw: true } });
  cell.lines.slice(1).forEach((text, t) => {
   if (text) items.push({ key: `${key}:t${t}`, type: 'label', order: order + 0.08 + t * 0.04, props: { x, y: y + (t ? 36 + 18 + (t - 1) * 16 : 36) }, fixed: { lines: [truncate(text, W, ...fonts[Math.min(t + 1, 2)])], anchor: 'start', cls: t ? 'dg-row-note' : 'dg-gloss-means' } });
  });
  x += w + 18;
 });
 y += rowH;
 if (data.whole) {
  const lines = wrap(data.whole, W, ...FONT.note).slice(0, 4);
  items.push({ key: 'gl:whole', type: 'label', order: 0.4 + data.cells.length * 0.16, props: { x: 0, y: y + 12 }, fixed: { lines, anchor: 'start', baseline: 'below', lineHeight: 16, cls: 'dg-step-note' } });
  y += 12 + lines.length * 16;
 }
 return { kind: 'gloss', width: W, height: y, items, corner, flush: true };
}

// The forms of a word: who, or which case, in the first column, then the form and what it means. `cols` names
// several columns of forms. The part that changes is told from the part that stays: the stem is named by `stem`,
// or it is what the forms of a column share; a part between stars is taken as marked by hand.
function parseForms(lines) {
 const data = { title: '', cols: [], stem: '', rows: [] };
 for (const raw of lines.slice(1)) {
  const line = raw.trim().replace(/^[-•]\s+/, '');
  let m;
  if (!line) continue;
  if (!line.includes('|')) {
   if ((m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) data.title = unquote(m[1]);
   else if ((m = /^(?:cols|columns|series)(?:\s*:\s*|\s+)(.+)$/i.exec(line))) data.cols = splitList(m[1]).map(unquote);
   else if ((m = /^stem(?:\s*:\s*|\s+)(.+)$/i.exec(line))) data.stem = unquote(m[1]).replace(/[-·]$/, '');
   continue;
  }
  const cells = cellsOf(line);
  // A first row that names no one is the row of headings.
  if (!cells[0] && !data.cols.length && !data.rows.length) { data.cols = cells.slice(1).map(unquote); continue; }
  const count = Math.max(1, data.cols.length);
  data.rows.push({ label: cleanLabel(cells[0]), forms: cells.slice(1, 1 + count), note: cells.slice(1 + count).filter(Boolean).map(cleanLabel).join(' · ') });
 }
 return data.rows.length ? data : null;
}

// Where a form parts into what stays and what changes.
function endingsOf(forms, stem) {
 const marked = forms.map(form => /^(.*?)\*([^*]+)\*(.*)$/.exec(form.replace(/\*\*/g, '*')));
 // The spaces round a marked part are kept: they say where it stands among the words of the form.
 const words = forms.map(form => cleanLabel(form)), full = words.filter(Boolean), lower = stem.toLowerCase();
 // A form left unmarked among marked ones still parts after the stem, when one was named.
 if (marked.some(Boolean)) return forms.map((form, i) => {
  if (marked[i]) return { head: marked[i][1].replace(/\*/g, ''), end: marked[i][2], tail: marked[i][3].replace(/\*/g, '') };
  const at = stem && words[i].toLowerCase().startsWith(lower) ? stem.length : 0;
  return { head: at ? words[i].slice(0, at) : words[i], end: at ? words[i].slice(at) : '', tail: '' };
 });
 let shared = 0;
 // What all the forms open with is a stem when there are enough of them to tell, and it is more than a letter.
 if (!stem && full.length >= 3 && full.every(word => !/\s/.test(word))) {
  while (shared < full[0].length && full.every(word => word[shared] && word[shared].toLowerCase() === full[0][shared].toLowerCase())) shared++;
  if (shared < 2 || full.every(word => word.length === shared)) shared = 0;
 }
 return words.map(word => {
  const at = stem ? (word.toLowerCase().startsWith(lower) ? stem.length : 0) : shared;
  return { head: at ? word.slice(0, at) : word, end: at ? word.slice(at) : '', tail: '' };
 });
}

function formsScene(data, tones, { width }) {
 if (!data) return null;
 const items = [], tips = new Map(), count = Math.max(1, ...data.rows.map(row => row.forms.length));
 const columns = Array.from({ length: count }, (_, c) => endingsOf(data.rows.map(row => row.forms[c] || ''), data.stem));
 const formW = part => widthOf(part.head, FONT.step) + widthOf(part.end, FONT.period) + widthOf(part.tail, FONT.step);
 const labelW = Math.max(...data.rows.map(row => widthOf(row.label, FONT.legend))), colW = columns.map((col, c) => Math.max(data.cols[c] ? capsWidth(data.cols[c].toUpperCase()) : 0, ...col.map(formW)));
 const noteW = Math.max(0, ...data.rows.map(row => widthOf(row.note, FONT.tick))), need = labelW + 22 + colW.reduce((sum, w) => sum + w + 28, 0) + (noteW ? Math.min(noteW, 200) : 0);
 // A table of many columns may ask for more than the column of text: it takes what it needs, and is shown
 // smaller where even the whole width is not enough.
 const W = need > width ? Math.min(need, CHART.max) : clamp(width, 280, LEDGER.max);
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  top = LEDGER.head;
  corner = { x: title.width + 16, h: 28 };
 }
 const xs = [];
 colW.reduce((x, w, c) => { xs[c] = x; return x + w + 28; }, Math.min(labelW, W * 0.3) + 22);
 let y = top + 2;
 if (data.cols.some(Boolean)) {
  data.cols.slice(0, count).forEach((name, c) => { if (name) items.push({ key: `fm:col:${c}`, type: 'label', layer: 'back', order: 0.2, props: { x: xs[c], y: y + 9 }, fixed: { lines: [caps(name, colW[c] + 20)], anchor: 'start', cls: 'dg-eyebrow' } }); });
  y += 24;
 }
 data.rows.forEach((row, i) => {
  const cy = y + 15, order = 0.3 + i * 0.12, key = `fm:${i}`;
  if (i) items.push({ key: `${key}:rule`, type: 'line', layer: 'back', order, props: { x1: 0, y1: y, x2: W, y2: y }, fixed: { cls: 'dg-grid' } });
  items.push({ key, type: 'hit', layer: 'back', order, props: { x: -8, y, w: W + 16, h: 30 }, fixed: {} });
  tips.set(key, { silent: true });
  items.push({ key: `${key}:who`, type: 'label', order, props: { x: 0, y: cy }, fixed: { lines: [truncate(row.label, Math.min(labelW, W * 0.3), ...FONT.legend)], anchor: 'start', cls: 'dg-metric-name' } });
  columns.forEach((col, c) => {
   // A space at the end of a part is measured but not drawn: the next part starts past it.
   const part = col[i], headW = widthOf(part.head, FONT.step), endW = widthOf(part.end, FONT.period), lead = widthOf(part.tail, FONT.step) - widthOf(part.tail.trimStart(), FONT.step);
   if (part.head.trim()) items.push({ key: `${key}:h${c}`, type: 'label', order: order + 0.04, props: { x: xs[c], y: cy }, fixed: { lines: [part.head.trimEnd()], anchor: 'start', cls: 'dg-form' } });
   if (part.end) {
    // What changes is set strong and underlined in the colour of the drawing.
    items.push({ key: `${key}:e${c}`, type: 'label', order: order + 0.06, props: { x: xs[c] + headW, y: cy }, fixed: { lines: [part.end], anchor: 'start', cls: 'dg-form-end' } });
    items.push({ key: `${key}:u${c}`, type: 'line', layer: 'back', order: order + 0.08, props: { x1: xs[c] + headW, y1: cy + 10, x2: xs[c] + headW + endW, y2: cy + 10 }, fixed: { cls: 'dg-form-rule', tone: tones[0], draw: true } });
   }
   if (part.tail.trim()) items.push({ key: `${key}:t${c}`, type: 'label', order: order + 0.07, props: { x: xs[c] + headW + endW + lead, y: cy }, fixed: { lines: [part.tail.trim()], anchor: 'start', cls: 'dg-form' } });
   for (const piece of [`${key}:h${c}`, `${key}:e${c}`, `${key}:t${c}`]) tips.set(piece, { silent: true, hot: [key] });
  });
  const free = W - (xs[count - 1] + colW[count - 1] + 20);
  if (row.note && free > 40) items.push({ key: `${key}:note`, type: 'label', order: order + 0.1, props: { x: W, y: cy }, fixed: { lines: [truncate(row.note, free, ...FONT.tick)], anchor: 'end', cls: 'dg-row-note' } });
  tips.set(`${key}:who`, { silent: true, hot: [key] });
  tips.set(`${key}:note`, { silent: true, hot: [key] });
  y += 30;
 });
 return { kind: 'forms', width: W, height: y, items, tips, corner, flush: true };
}

// A dish to cook. `about` says how long it takes, how many it feeds and the like. Under a line that names what
// goes in stand the things with their amounts; under a line that names the steps, what to do, with the time a
// step takes and, after an exclamation mark, what to mind. Without the two lines a row is told by what follows
// its name: an amount makes it a thing that goes in, a time or nothing makes it a thing to do.
const GOES_IN = /^(?:ингредиент|продукт|состав|понадобит|что нужно|нужно|ingredients?|you(?:'ll| will)? need|shopping|for the)/iu;
const TO_DO = /^(?:шаги|шаг|приготовлен|как готовить|способ|порядок|готовим|steps?|method|directions|instructions|preparation|how to)/iu;
// How long: 9 min, 1 ч 20 мин, 0:45. A teaspoon, ч. л., is not an hour.
const TAKES = /\d\s*(?:мин(?:ут[аыу]?)?|час(?:а|ов)?|ч(?!\.?\s*л)|сек(?:унд[аыу]?)?|min(?:ute)?s?|hours?|hrs?|h|sec(?:ond)?s?|s)(?![\p{L}])|\d+:\d{2}/iu;

function parseRecipe(lines) {
 const data = { title: '', about: [], parts: [], steps: [], partsName: '', stepsName: '' }, rows = lines.slice(1);
 let into = '', base = null, nested = false, last = null, set = 0;
 for (let i = 0; i < rows.length; i++) {
  const raw = rows[i], indent = indentOf(raw), line = bare(raw);
  let m;
  if (!line) continue;
  if (!line.includes('|') && (m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.title = unquote(m[1]); continue; }
  if ((m = /^(?:about|meta|info)(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.about.push(...cellsOf(m[1]).filter(Boolean).map(cleanLabel)); continue; }
  base ??= indent;
  // A line at the left edge that names what follows opens a part of the recipe: what goes in, or what to do. It
  // is known by its word, or, in another language, by the rows set in under it.
  const plain = !line.includes('|') && indent <= base && line.length <= 40 && !/\d/.test(line) && !/^!/.test(line);
  const named = plain && (GOES_IN.test(line) || TO_DO.test(line)), opens = plain && i + 1 < rows.length && indentOf(rows[i + 1]) > indent && (nested || !last);
  if (named || opens) {
   into = GOES_IN.test(line) ? 'parts' : TO_DO.test(line) ? 'steps' : data.parts.length || into === 'parts' ? 'steps' : 'parts';
   data[`${into}Name`] = cleanLabel(line.replace(/:$/, ''));
   last = null;
   continue;
  }
  // A line set in under a row is a remark on it; one that opens with ! is what to mind at that step.
  const warn = /^!+\s*/.exec(line);
  if (last && (warn || indent > set)) {
   const text = cleanLabel(warn ? line.slice(warn[0].length) : line);
   if (warn && last.step) last.warn = text;
   else last.note = last.note ? `${last.note} · ${text}` : text;
   continue;
  }
  const numbered = /^\d{1,2}[.)]\s+/.test(line), cells = pairCells(line.replace(/^\d{1,2}[.)]\s+/, '')).filter(Boolean);
  if (!cells.length) continue;
  const kind = into || (numbered || cells.length === 1 || TAKES.test(cells[1]) || !amount(cells[1]) ? 'steps' : 'parts');
  if (kind === 'parts') last = { name: cleanLabel(cells[0]), amount: cleanLabel(cells[1] || ''), note: cells.slice(2).map(cleanLabel).join(' · ') };
  else {
   const mind = cells.find(cell => /^!/.test(cell)), rest = cells.slice(1).filter(cell => cell !== mind).map(cleanLabel), time = rest.find(cell => TAKES.test(cell)) || '';
   last = { step: true, text: cleanLabel(cells[0]), time, note: rest.filter(cell => cell !== time).join(' · '), warn: mind ? cleanLabel(mind.replace(/^!+\s*/, '')) : '' };
  }
  data[kind].push(last);
  set = indent;
  nested ||= indent > base;
 }
 return data.parts.length || data.steps.length ? data : null;
}

function recipeScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 300, LEDGER.max), items = [], tips = new Map();
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  top = LEDGER.head;
  corner = { x: title.width + 16, h: 28 };
 }
 // What the dish asks for, at a glance: one quiet line, its parts set apart by dots.
 if (data.about.length) {
  let x = 0;
  data.about.forEach((text, k) => {
   const w = widthOf(text, FONT.amount);
   if (x + w > W) return;
   if (k) items.push({ key: `rc:dot:${k}`, type: 'dot', order: 0.2, props: { x: x - 9, y: top + 9, r: 1.5 }, fixed: { cls: 'dg-outline-dot' } });
   items.push({ key: `rc:about:${k}`, type: 'label', order: 0.2 + k * 0.05, props: { x, y: top + 9 }, fixed: { lines: [text], anchor: 'start', cls: 'dg-row-value' } });
   x += w + 18;
  });
  top += 28;
 }
 const amountW = Math.max(0, ...data.parts.map(part => widthOf(part.amount, FONT.amount))), nameW = Math.max(0, ...data.parts.map(part => widthOf(part.name, FONT.row)));
 // What goes in stands in a column on the left and what to do beside it; in a narrow place one goes under the other.
 const beside = data.parts.length && data.steps.length && W >= 520, leftW = beside ? clamp(nameW + amountW + 36, 180, W * 0.42) : W, x1 = beside ? leftW + 36 : 0, rightW = W - x1;
 const column = (name, x, y) => {
  if (!name) return y;
  items.push({ key: `rc:head:${x}:${Math.round(y)}`, type: 'label', layer: 'back', order: 0.25, props: { x, y: y + 9 }, fixed: { lines: [caps(name, W - x)], anchor: 'start', cls: 'dg-eyebrow' } });
  return y + 26;
 };
 let ya = column(data.partsName, 0, top + 2);
 data.parts.forEach((part, i) => {
  const key = `rc:p${i}`, order = 0.3 + i * 0.1, h = part.note ? 40 : 26, cy = ya + 13, name = truncate(part.name, leftW - amountW - 20, ...FONT.row), from = widthOf(name, FONT.row) + 8, to = leftW - widthOf(part.amount, FONT.amount) - 8;
  items.push({ key, type: 'hit', layer: 'back', order, props: { x: -8, y: ya, w: leftW + 16, h }, fixed: {} });
  tips.set(key, { silent: true });
  items.push({ key: `${key}:name`, type: 'label', order, props: { x: 0, y: cy }, fixed: { lines: [name], anchor: 'start', cls: 'dg-row-name' } });
  // A row of dots leads the eye from the name to its amount, as on a menu.
  if (part.amount && to - from > 12) items.push({ key: `${key}:lead`, type: 'line', layer: 'back', order: order + 0.03, props: { x1: from, y1: cy + 4, x2: to, y2: cy + 4 }, fixed: { cls: 'dg-leader' } });
  if (part.amount) items.push({ key: `${key}:amount`, type: 'label', order: order + 0.05, props: { x: leftW, y: cy }, fixed: { lines: [part.amount], anchor: 'end', cls: 'dg-row-value' } });
  if (part.note) items.push({ key: `${key}:note`, type: 'label', order: order + 0.07, props: { x: 0, y: cy + 16 }, fixed: { lines: [truncate(part.note, leftW, ...FONT.tick)], anchor: 'start', cls: 'dg-row-note' } });
  for (const piece of [`${key}:name`, `${key}:amount`, `${key}:note`]) tips.set(piece, { silent: true, hot: [key] });
  ya += h;
 });
 let yb = column(data.stepsName, x1, beside ? top + 2 : ya + (data.parts.length && data.steps.length ? 18 : 0));
 const R = 9, textX = x1 + R * 2 + 12;
 data.steps.forEach((step, i) => {
  const key = `rc:s${i}`, order = 0.4 + i * 0.3, cy = yb + R, timeW = step.time ? widthOf(step.time, FONT.tick) + 16 : 0;
  const lines = wrap(step.text, W - textX - timeW, ...FONT.step);
  items.push({ key: `${key}:mark`, type: 'dot', layer: 'nodes', order, props: { x: x1 + R, y: cy, r: R }, fixed: { cls: 'dg-step-mark', tone: tones[0] } });
  items.push({ key: `${key}:n`, type: 'label', order: order + 0.05, props: { x: x1 + R, y: cy }, fixed: { lines: [String(i + 1)], cls: 'dg-step-n' } });
  items.push({ key: `${key}:t`, type: 'label', order: order + 0.1, props: { x: textX, y: cy - 7 }, fixed: { lines, anchor: 'start', baseline: 'below', lineHeight: 18, cls: 'dg-step-text' } });
  if (step.time) items.push({ key: `${key}:time`, type: 'label', order: order + 0.15, props: { x: W, y: cy }, fixed: { lines: [step.time], anchor: 'end', cls: 'dg-step-meta' } });
  let ty = cy - 7 + lines.length * 18;
  if (step.note) {
   const text = wrap(step.note, W - textX, ...FONT.note).slice(0, 3);
   items.push({ key: `${key}:note`, type: 'label', order: order + 0.2, props: { x: textX, y: ty + 3 }, fixed: { lines: text, anchor: 'start', baseline: 'below', lineHeight: 16, cls: 'dg-step-note' } });
   ty += 3 + text.length * 16;
  }
  if (step.warn) {
   const text = wrap(step.warn, W - textX - 20, ...FONT.note).slice(0, 3);
   items.push({ key: `${key}:wi`, type: 'wglyph', order: order + 0.22, props: { x: textX + 7, y: ty + 12, s: 15 }, fixed: { icon: 'warn', cls: 'is-warn' } });
   items.push({ key: `${key}:warn`, type: 'label', order: order + 0.24, props: { x: textX + 20, y: ty + 4 }, fixed: { lines: text, anchor: 'start', baseline: 'below', lineHeight: 16, cls: 'dg-step-warn' } });
   ty += 4 + text.length * 16;
  }
  const bottom = Math.max(ty, cy + R);
  if (i < data.steps.length - 1) items.push({ key: `${key}:rail`, type: 'line', layer: 'back', order: order + 0.2, props: { x1: x1 + R, y1: cy + R + 4, x2: x1 + R, y2: bottom + STEPS.gap - 4 }, fixed: { cls: 'dg-rail', draw: true } });
  yb = bottom + STEPS.gap;
 });
 if (data.steps.length) yb -= STEPS.gap;
 const bottom = beside ? Math.max(ya, yb) : data.steps.length ? yb : ya;
 if (beside) items.push({ key: 'rc:part', type: 'line', layer: 'back', order: 0.25, props: { x1: leftW + 18, y1: top + 4, x2: leftW + 18, y2: bottom }, fixed: { cls: 'dg-grid', draw: true } });
 return { kind: 'recipe', width: W, height: bottom + 2, items, tips, corner, flush: true };
}

// What a thing is put together from: a computer, a kit, an estimate. A row is what the part is for, the part
// itself, then what to know of it and what it costs; `total` adds the costs up. good, warn or bad after a part
// says whether it fits. A line without bars names a group of parts.
const MONEY = /^(?:[₽$€£¥₴₸]|руб|р\.|usd|eur|rub|uah|kzt|pln|тг|грн|zł|сом|сум)/iu;

function parseParts(lines) {
 const data = { title: '', total: null, rows: [] };
 for (const raw of lines.slice(1)) {
  const line = bare(raw);
  let m;
  if (!line) continue;
  if (!line.includes('|')) {
   if ((m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.title = unquote(m[1]); continue; }
   if ((m = TOTAL_WORD.exec(line))) { const rest = line.slice(m[0].length).replace(/^[:\s]+/, ''); data.total = !rest || amount(rest) ? sumName(m[1], lines) : unquote(rest); continue; }
   // A line with nothing after its name names a group; one written as slot: part is a row like the rest.
   if (!/^[^:]{1,40}:\s+\S/.test(line)) { data.rows.push({ head: cleanLabel(line.replace(/:$/, '')) }); continue; }
  }
  const cells = pairCells(line);
  if (sumRow(unquote(cells[0]), NaN, 0)) { data.total = unquote(cells[0]).replace(/[:.\s]+$/, ''); continue; }
  const mood = cells.slice(2).find(cell => MOOD.test(cell)), rest = cells.slice(2).filter(cell => cell && cell !== mood);
  data.rows.push({ slot: cleanLabel(cells[0]), name: cleanLabel(cells[1] || ''), rest, cost: null, mood: mood ? MOODS[mood.toLowerCase()] : '' });
 }
 const parts = data.rows.filter(row => !row.head);
 if (!parts.length) return null;
 // The cost of a part is its last number counted in money. Where a sum is asked for and nothing is counted in
 // money, it is the last number with a unit: the weights of a kit, the watts of a build.
 const pick = money => {
  for (const row of parts) {
   for (let k = row.rest.length - 1; k >= 0 && !row.cost; k--) {
    const a = amount(row.rest[k]);
    if (a && !/\d/.test(a.after) && (money ? MONEY.test(a.before) || MONEY.test(a.after) : a.before || a.after)) { row.cost = { ...a, text: cleanLabel(row.rest[k]) }; row.rest.splice(k, 1); }
   }
  }
 };
 pick(true);
 if (data.total !== null && !parts.some(row => row.cost)) pick(false);
 for (const row of parts) row.note = row.rest.map(cleanLabel).join(' · ');
 return data;
}

function partsScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 300, LEDGER.max), items = [], tips = new Map(), parts = data.rows.filter(row => !row.head), priced = parts.filter(row => row.cost);
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  top = LEDGER.head;
  corner = { x: title.width + 16, h: 28 };
 }
 const first = priced[0]?.cost, same = key => first && priced.every(row => row.cost[key] === first[key]) ? first[key] : '';
 const sum = priced.reduce((s, row) => s + row.cost.value, 0), most = Math.max(1e-9, ...priced.map(row => row.cost.value)), said = value => withUnit(value, same('before'), same('after'));
 const costOf = row => row.cost ? (same('before') || same('after') ? said(row.cost.value) : row.cost.text) : '';
 const slotW = Math.min(W * 0.24, Math.max(...parts.map(row => capsWidth(row.slot.toUpperCase())))) + 18, costW = Math.max(0, ...parts.map(row => widthOf(costOf(row), FONT.amount)), data.total !== null && priced.length ? widthOf(said(sum), FONT.strong) : 0);
 // A thin bar beside each cost shows how much of the largest it is, where there is room for one.
 const meter = priced.length > 1 && W >= 460 ? 56 : 0, room = W - slotW - (costW ? costW + 16 : 0) - (meter ? meter + 14 : 0);
 let y = top + 2, opened = true;
 data.rows.forEach((row, i) => {
  const order = 0.3 + i * 0.12, key = `pt:${i}`;
  if (row.head) {
   // The parts are named in small capitals already, so a group of them is named in plain strong letters.
   items.push({ key, type: 'label', layer: 'back', order, props: { x: 0, y: y + (opened ? 10 : 22) }, fixed: { lines: [truncate(row.head, W, ...FONT.strong)], anchor: 'start', cls: 'dg-row-total' } });
   y += opened ? 26 : 38;
   opened = true;
   return;
  }
  const dot = row.mood ? 13 : 0, notes = row.note ? wrap(row.note, room, ...FONT.tick).slice(0, 2) : [], h = 32 + notes.length * 14, cy = y + 16;
  if (!opened) items.push({ key: `${key}:rule`, type: 'line', layer: 'back', order, props: { x1: 0, y1: y, x2: W, y2: y }, fixed: { cls: 'dg-grid' } });
  items.push({ key, type: 'hit', layer: 'back', order, props: { x: -8, y, w: W + 16, h }, fixed: {} });
  tips.set(key, { silent: true });
  items.push({ key: `${key}:slot`, type: 'label', layer: 'back', order, props: { x: 0, y: cy }, fixed: { lines: [caps(row.slot, slotW - 12)], anchor: 'start', cls: 'dg-eyebrow' } });
  if (row.mood) items.push({ key: `${key}:mood`, type: 'dot', order: order + 0.03, props: { x: slotW + 4, y: cy, r: 3.5 }, fixed: { cls: `dg-state is-${row.mood}` } });
  items.push({ key: `${key}:name`, type: 'label', order: order + 0.04, props: { x: slotW + dot, y: cy }, fixed: { lines: [truncate(row.name, room - dot, ...FONT.strong)], anchor: 'start', cls: 'dg-row-total' } });
  if (notes.length) items.push({ key: `${key}:note`, type: 'label', order: order + 0.06, props: { x: slotW, y: cy + 10 }, fixed: { lines: notes, anchor: 'start', baseline: 'below', lineHeight: 14, cls: 'dg-row-note' } });
  if (row.cost) {
   if (meter) {
    const mx = W - costW - 14 - meter;
    items.push({ key: `${key}:track`, type: 'rect', layer: 'nodes', order: order + 0.08, props: { x: mx, y: cy - 2, w: meter, h: 4 }, fixed: { cls: 'dg-meter-track', tone: tones[0], rx: 2 } });
    items.push({ key: `${key}:fill`, type: 'span', order: order + 0.1, props: { x: mx, y: cy, w: Math.max(3, meter * clamp01(row.cost.value / most)), h: 4 }, fixed: { cls: 'dg-meter-fill', tone: tones[0], rx: 2 } });
   }
   items.push({ key: `${key}:cost`, type: 'label', order: order + 0.12, props: { x: W, y: cy }, fixed: { lines: [costOf(row)], anchor: 'end', cls: 'dg-row-value' } });
  }
  for (const part of [`${key}:slot`, `${key}:name`, `${key}:note`, `${key}:cost`]) tips.set(part, { silent: true, hot: [key] });
  y += h;
  opened = false;
 });
 if (data.total !== null && priced.length) {
  const order = 0.4 + data.rows.length * 0.12;
  items.push({ key: 'pt:sum:rule', type: 'line', layer: 'back', order, props: { x1: 0, y1: y + 6, x2: W, y2: y + 6 }, fixed: { cls: 'dg-line', draw: true } });
  items.push({ key: 'pt:sum:name', type: 'label', order: order + 0.1, props: { x: 0, y: y + 23 }, fixed: { lines: [truncate(data.total, W * 0.6, ...FONT.strong)], anchor: 'start', cls: 'dg-row-total' } });
  items.push({ key: 'pt:sum:value', type: 'label', order: order + 0.2, props: { x: W, y: y + 23 }, fixed: { lines: [said(sum)], anchor: 'end', cls: 'dg-row-total' } });
  y += 36;
 }
 return { kind: 'parts', width: W, height: y, items, tips, corner, flush: true };
}

// Where a setting lives and how to set it: the way to it through the menus, parted by >, then on, off or the
// value to choose, then a note. A line without bars and without a way names a group of settings.
const CRUMB = /\s*(?:>|›|→|➜)\s*|\s+»\s+/, SET_ON = /^(?:on|вкл\.?|включ[а-яё]*|enabled?|yes|да|true|✓|✔|✅)$/iu, SET_OFF = /^(?:off|выкл\.?|выключ[а-яё]*|отключ[а-яё]*|disabled?|no|нет|false|✗|✘|❌)$/iu;

function parseSettings(lines) {
 const data = { title: '', rows: [] };
 for (const raw of lines.slice(1)) {
  const line = bare(raw);
  let m;
  if (!line) continue;
  if (!line.includes('|')) {
   if (!data.rows.length && (m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.title = unquote(m[1]); continue; }
   if (!CRUMB.test(line)) { data.rows.push({ head: cleanLabel(line.replace(/:$/, '')) }); continue; }
  }
  const cells = cellsOf(line), path = cells[0].split(CRUMB).map(cleanLabel).filter(Boolean), value = cleanLabel(cells[1] || '');
  if (!path.length) continue;
  data.rows.push({ name: path[path.length - 1], path: path.slice(0, -1), state: SET_ON.test(value) ? 'on' : SET_OFF.test(value) ? 'off' : '', value, note: cells.slice(2).filter(Boolean).map(cleanLabel).join(' · ') });
 }
 return data.rows.some(row => !row.head) ? data : null;
}

function settingsScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 300, LEDGER.max), items = [], tips = new Map();
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  top = LEDGER.head;
  corner = { x: title.width + 16, h: 28 };
 }
 let y = top + 2, opened = true;
 data.rows.forEach((row, i) => {
  const order = 0.3 + i * 0.14, key = `sg:${i}`;
  if (row.head) {
   items.push({ key, type: 'label', layer: 'back', order, props: { x: 0, y: y + (opened ? 9 : 19) }, fixed: { lines: [caps(row.head, W)], anchor: 'start', cls: 'dg-eyebrow' } });
   y += opened ? 24 : 34;
   opened = true;
   return;
  }
  // The name of the setting, and under it the way to it; at the right, the switch as it should stand or the value.
  const value = row.state ? '' : truncate(row.value, W * 0.4, ...FONT.amount), ctrlW = row.state ? 30 : value ? widthOf(value, FONT.amount) + 18 : 0, room = W - ctrlW - (ctrlW ? 16 : 0);
  const trail = row.path.join(' › '), notes = row.note ? wrap(row.note, room, ...FONT.note).slice(0, 2) : [];
  const h = 30 + (trail ? 15 : 0) + (notes.length ? 2 + notes.length * 16 : 0) + (trail || notes.length ? 5 : 0), cy = y + 15;
  if (!opened) items.push({ key: `${key}:rule`, type: 'line', layer: 'back', order, props: { x1: 0, y1: y, x2: W, y2: y }, fixed: { cls: 'dg-grid' } });
  items.push({ key, type: 'hit', layer: 'back', order, props: { x: -8, y, w: W + 16, h }, fixed: {} });
  tips.set(key, { silent: true });
  items.push({ key: `${key}:name`, type: 'label', order, props: { x: 0, y: cy }, fixed: { lines: [truncate(row.name, room, ...FONT.strong)], anchor: 'start', cls: 'dg-row-total' } });
  if (trail) items.push({ key: `${key}:way`, type: 'label', order: order + 0.04, props: { x: 0, y: cy + 16 }, fixed: { lines: [truncate(trail, room, ...FONT.tick)], anchor: 'start', cls: 'dg-row-note' } });
  if (notes.length) items.push({ key: `${key}:note`, type: 'label', order: order + 0.06, props: { x: 0, y: cy + (trail ? 26 : 11) }, fixed: { lines: notes, anchor: 'start', baseline: 'below', lineHeight: 16, cls: 'dg-step-note' } });
  if (row.state) {
   const on = row.state === 'on';
   items.push({ key: `${key}:track`, type: 'rect', layer: 'nodes', order: order + 0.08, props: { x: W - 30, y: cy - 9, w: 30, h: 18 }, fixed: { cls: on ? 'dg-toggle is-on' : 'dg-toggle', tone: tones[0], rx: 9 } });
   items.push({ key: `${key}:knob`, type: 'dot', order: order + 0.1, props: { x: on ? W - 9 : W - 21, y: cy, r: 6 }, fixed: { cls: on ? 'dg-toggle-knob is-on' : 'dg-toggle-knob' } });
  } else if (value) items.push({ key: `${key}:value`, type: 'label', order: order + 0.08, props: { x: W - ctrlW / 2, y: cy }, fixed: { lines: [value], pill: true, w: ctrlW, h: 22, rx: 7, cls: 'dg-set-value', pop: true } });
  for (const part of [`${key}:name`, `${key}:way`, `${key}:note`, `${key}:value`]) tips.set(part, { silent: true, hot: [key] });
  y += h;
  opened = false;
 });
 return { kind: 'settings', width: W, height: y, items, tips, corner, flush: true };
}

// A journey: the places in order, each with when or how long, and what is there; a line set in under a place
// tells the way on to the next: by what, how long, how far. A line that opens with the word day names a day.
const WAY_ON = /^(?:↓|->|→|=>|~>|\.\.\.|…)\s*/, DAY_NAME = /^(?:день|day|jour|tag|d[ií]a|giorno)\s*\d+/iu;

function parseRoute(lines) {
 const data = { title: '', rows: [] };
 let base = null, set = 0;
 for (const raw of lines.slice(1)) {
  const indent = indentOf(raw), line = bare(raw);
  let m;
  if (!line) continue;
  if (!data.rows.length && !line.includes('|') && (m = /^title(?:\s*:\s*|\s+)(.+)$/i.exec(line))) { data.title = unquote(m[1]); continue; }
  base ??= indent;
  const last = data.rows[data.rows.length - 1];
  if (!line.includes('|') && DAY_NAME.test(line)) { data.rows.push({ head: cleanLabel(line.replace(/:$/, '')) }); continue; }
  if (last && !last.head && (indent > set || WAY_ON.test(line))) {
   const text = cellsOf(line.replace(WAY_ON, '')).filter(Boolean).map(cleanLabel).join(' · ');
   last.leg = last.leg ? `${last.leg} · ${text}` : text;
   continue;
  }
  const cells = pairCells(line);
  // Written with the hour first, the way a timetable is, a row still gives its place first.
  if (cells.length > 1 && /^(?:\d{1,2}[:.]\d{2}(?:\s*[–—-]\s*\d{1,2}[:.]\d{2})?|\d{1,2}\s?[ap]m)$/i.test(cells[0])) cells.splice(0, 2, cells[1], cells[0]);
  set = indent;
  data.rows.push({ place: cleanLabel(cells[0]), when: cleanLabel(cells[1] || ''), note: cells.slice(2).filter(Boolean).map(cleanLabel).join(' · '), leg: '' });
 }
 return data.rows.some(row => !row.head) ? data : null;
}

function routeScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 300, STEPS.max), items = [], tips = new Map(), stops = data.rows.filter(row => !row.head), textX = 26;
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  top = STEPS.head;
  corner = { x: title.width + 16, h: 28 };
 }
 const whenW = Math.max(0, ...stops.map(row => widthOf(row.when, FONT.amount)));
 let y = top + 4, k = 0, from = null;
 data.rows.forEach((row, i) => {
  const order = 0.3 + i * 0.3, key = `rt:${i}`;
  if (row.head) {
   items.push({ key, type: 'label', layer: 'back', order, props: { x: textX, y: y + (i ? 12 : 8) }, fixed: { lines: [caps(row.head, W - textX)], anchor: 'start', cls: 'dg-eyebrow' } });
   y += i ? 30 : 24;
   return;
  }
  const end = k === 0 || k === stops.length - 1, cy = y + 9, r = end ? 5 : 4;
  const notes = row.note ? wrap(row.note, W - textX, ...FONT.note).slice(0, 3) : [];
  // The line of the way runs from stop to stop; where it starts and where it ends are rings.
  if (from !== null) items.push({ key: `${key}:rail`, type: 'line', layer: 'back', order: order - 0.1, props: { x1: 7, y1: from, x2: 7, y2: cy - r - 3 }, fixed: { cls: 'dg-route-rail', tone: tones[0], draw: true } });
  items.push({ key: `${key}:stop`, type: 'dot', layer: 'nodes', order, props: { x: 7, y: cy, r }, fixed: { cls: end ? 'dg-route-stop is-end' : 'dg-route-stop', tone: tones[0] } });
  items.push({ key: `${key}:place`, type: 'label', order: order + 0.05, props: { x: textX, y: cy }, fixed: { lines: [truncate(row.place, W - textX - (whenW ? whenW + 16 : 0), ...FONT.strong)], anchor: 'start', cls: 'dg-row-total' } });
  if (row.when) items.push({ key: `${key}:when`, type: 'label', order: order + 0.08, props: { x: W, y: cy }, fixed: { lines: [row.when], anchor: 'end', cls: 'dg-match-time' } });
  let ty = cy + 10;
  if (notes.length) { items.push({ key: `${key}:note`, type: 'label', order: order + 0.1, props: { x: textX, y: ty + 2 }, fixed: { lines: notes, anchor: 'start', baseline: 'below', lineHeight: 16, cls: 'dg-step-note' } }); ty += 2 + notes.length * 16; }
  from = cy + r + 3;
  if (row.leg && k < stops.length - 1) {
   items.push({ key: `${key}:leg`, type: 'label', layer: 'back', order: order + 0.15, props: { x: textX, y: ty + 16 }, fixed: { lines: [truncate(row.leg, W - textX, ...FONT.small)], anchor: 'start', cls: 'dg-route-leg' } });
   ty += 26;
  }
  y = ty + 14;
  k++;
 });
 return { kind: 'route', width: W, height: y - 14, items, tips, corner, flush: true };
}

// The kinds that keep a title as a line of their own.
const TITLED = /^(pie|xychart|candlestick|candles|ohlc|timeline|gantt|quadrantChart|radar|journey|kanban|sankey|treemap|metrics|bars|ledger|ranges?|plan|board|steps|waterfall|funnel|heatmap|calendar|scatter|array|cells|bracket|nutrition|food|meals?|facts|passport|checklist|checks|changes|diff|outline|contents|matches|fixtures|words|vocab|vocabulary|glossary|gloss|interlinear|forms|conjugation|declension|paradigm|recipe|cooking|parts|build|components|bom|settings|setup|toggles|route|itinerary|trip)/i;
// The block between two lines of --- that Mermaid lets a diagram open with: its title and its settings.
const FRONT = /^\s*---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

// The lines of a diagram without what is not drawn: remarks, settings and that opening block. The title the block
// holds is kept: as a title line where the kind has one, beside the lines for a scheme, which draws it over itself.
function clean(source) {
 const front = FRONT.exec(source), named = front && /^[ \t]*title[ \t]*:[ \t]*(.+?)[ \t]*$/m.exec(front[1]);
 const lines = (front ? source.slice(front[0].length) : source).replace(/%%\{[\s\S]*?\}%%/g, '').split('\n').map(line => line.replace(/%%.*$/, '').replace(/\s+$/, '')).filter(line => line.trim());
 if (named && lines.length) {
  const title = unquote(named[1]), head = lines[0].trim();
  if (!TITLED.test(head)) lines.title = title;
  else if (!/\btitle\b/i.test(head) && !lines.some(line => /^\s*title\b/i.test(line))) lines.splice(1, 0, `title ${title}`);
 }
 return lines;
}

// A scheme takes the title its lines came with, unless it names one itself.
const titled = (graph, lines) => { if (graph && lines.title) graph.title ||= lines.title; return graph; };

const KINDS = [
 [/^(graph|flowchart)\b/i, (lines, tones, options) => flowScene(titled(parseFlow(lines), lines), tones, options, 'flow')],
 [/^stateDiagram(-v2)?\b/i, (lines, tones, options) => flowScene(titled(parseState(lines), lines), tones, options, 'state')],
 [/^sequenceDiagram\b/i, (lines, tones, options) => sequenceScene(titled(parseSequence(lines), lines), tones, options)],
 [/^pie\b/i, (lines, tones, options) => pieScene(parsePie(lines), tones, options), 'column'],
 [/^xychart(-beta)?\b/i, (lines, tones, options) => chartScene(parseXY(lines), tones, options), 'column'],
 [/^(candlestick|candles|ohlc)\b/i, (lines, tones, options) => candleScene(parseCandles(lines), tones, options)],
 [/^timeline\b/i, (lines, tones, options) => timelineScene(parseTimeline(lines), tones, options)],
 [/^gantt\b/i, (lines, tones, options) => ganttScene(parseGantt(lines), tones, options)],
 [/^mindmap\b/i, (lines, tones, options) => mindScene(parseMindmap(lines), tones, options)],
 [/^quadrantChart\b/i, (lines, tones, options) => quadrantScene(parseQuadrant(lines), tones, options), 'column'],
 [/^radar(-beta)?\b/i, (lines, tones, options) => radarScene(parseRadar(lines), tones, options), 'column'],
 [/^erDiagram\b/i, (lines, tones, options) => flowScene(titled(parseER(lines), lines), tones, options, 'er')],
 [/^classDiagram(-v2)?\b/i, (lines, tones, options) => flowScene(titled(parseClass(lines), lines), tones, options, 'class')],
 [/^(wireframe|mockup)\b/i, (lines, tones, options) => wireframeScene(parseWireframe(lines), tones, options), 'plain'],
 [/^(files|folder)\b/i, (lines, tones, options) => filesScene(parseFiles(lines), tones, options), 'plain'],
 [/^metrics\b/i, (lines, tones, options) => metricsScene(parseMetrics(lines), tones, options), 'column'],
 [/^(bars|ledger)\b/i, (lines, tones, options) => ledgerScene(parseBars(lines), tones, options), 'column'],
 [/^ranges?\b/i, (lines, tones, options) => rangesScene(parseRanges(lines), tones, options), 'column'],
 [/^(plan|board|kanban)\b/i, (lines, tones, options) => boardScene(parseBoard(lines), tones, options)],
 [/^steps\b/i, (lines, tones, options) => stepsScene(parseSteps(lines), tones, options), 'column'],
 [/^journey\b/i, (lines, tones, options) => boardScene(parseJourney(lines), tones, options)],
 [/^waterfall\b/i, (lines, tones, options) => waterfallScene(parseWaterfall(lines), tones, options), 'column'],
 [/^funnel\b/i, (lines, tones, options) => funnelScene(parseFunnel(lines), tones, options), 'column'],
 [/^sankey(-beta)?\b/i, (lines, tones, options) => sankeyScene(parseSankey(lines), tones, options), 'column'],
 [/^(heatmap|calendar)\b/i, (lines, tones, options) => heatScene(parseHeat(lines), tones, options), 'column'],
 [/^scatter\b/i, (lines, tones, options) => scatterScene(parseScatter(lines), tones, options), 'column'],
 [/^treemap(-beta)?\b/i, (lines, tones, options) => treemapScene(parseTreemap(lines), tones, options), 'column'],
 [/^gitGraph\b/i, (lines, tones, options) => gitScene(parseGit(lines), tones, options), 'column'],
 [/^(array|cells)\b/i, (lines, tones, options) => arrayScene(parseArray(lines), tones, options), 'column'],
 [/^bracket\b/i, (lines, tones, options) => bracketScene(parseBracket(lines), tones, options)],
 [/^(nutrition|food|meals?)\b/i, (lines, tones, options) => nutritionScene(parseNutrition(lines), tones, options), 'column'],
 [/^(facts|passport)\b/i, (lines, tones, options) => factsScene(parseFacts(lines), tones, options), 'column'],
 [/^(checklist|checks)\b/i, (lines, tones, options) => checklistScene(parseChecklist(lines), tones, options), 'column'],
 [/^(changes|diff)\b/i, (lines, tones, options) => changesScene(parseChanges(lines), tones, options), 'column'],
 [/^(outline|contents)\b/i, (lines, tones, options) => outlineScene(parseOutline(lines), tones, options), 'column'],
 [/^(matches|fixtures)\b/i, (lines, tones, options) => matchesScene(parseMatches(lines), tones, options), 'column'],
 [/^(words|vocab|vocabulary|glossary)\b/i, (lines, tones, options) => wordsScene(parseWords(lines), tones, options), 'column'],
 [/^(gloss|interlinear)\b/i, (lines, tones, options) => glossScene(parseGloss(lines), tones, options), 'column'],
 [/^(forms|conjugation|declension|paradigm)\b/i, (lines, tones, options) => formsScene(parseForms(lines), tones, options), 'column'],
 [/^(recipe|cooking)\b/i, (lines, tones, options) => recipeScene(parseRecipe(lines), tones, options), 'column'],
 [/^(parts|build|components|bom)\b/i, (lines, tones, options) => partsScene(parseParts(lines), tones, options), 'column'],
 [/^(settings|setup|toggles)\b/i, (lines, tones, options) => settingsScene(parseSettings(lines), tones, options), 'column'],
 [/^(route|itinerary|trip)\b/i, (lines, tones, options) => routeScene(parseRoute(lines), tones, options), 'column'],
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
 if (!kind) return null;
 // Widths come in as they are on the screen and go to a scene in the sizes it draws in. A figure is laid out for
 // the column of text and told how much room there is past it; a scheme takes the room whole. The files card
 // and the page sketch are drawn in their own sizes.
 const [, build, place] = kind, zoom = place === 'plain' ? 1 : options.zoom || 1, width = options.width / zoom;
 const column = place === 'column' && options.column ? Math.min(width, options.column / zoom) : width;
 const result = build(lines, tones, { ...options, width: column, room: width });
 if (result) result.zoom = zoom;
 return result;
}

function safeCompile(source, tones, options) {
 try { return compile(source, tones, options); }
 catch (error) { console.warn('Diagram failed', error); return null; }
}

/* Item types */

function buildCard(item) {
 const card = item.spec.fixed.card, body = item.body, x = -card.w / 2, y = -card.h / 2, r = 10;
 item.parts.main = svg('rect', { class: 'dg-shape' }, body);
 if (card.rows.length) {
  svg('path', { class: 'dg-card-head', d: `M${f(x)},${f(y + card.head)} V${f(y + r)} Q${f(x)},${f(y)} ${f(x + r)},${f(y)} H${f(-x - r)} Q${f(-x)},${f(y)} ${f(-x)},${f(y + r)} V${f(y + card.head)} Z` }, body);
  svg('line', { class: 'dg-card-rule', x1: f(x), x2: f(-x), y1: f(y + card.head), y2: f(y + card.head) }, body);
 }
 const titleY = card.rows.length ? y + card.head / 2 : 0;
 if (card.sub) textBlock(body, [card.sub], { cls: 'dg-card-sub' }).setAttribute('transform', `translate(0 ${f(titleY - 8)})`);
 textBlock(body, [card.title], { cls: 'dg-card-title' }).setAttribute('transform', `translate(0 ${f(card.sub ? titleY + 7 : titleY)})`);
 let rowY = y + card.head + 4.5;
 card.rows.forEach((row, i) => {
  if (i === card.sep) {
   svg('line', { class: 'dg-card-rule is-soft', x1: f(x + 10), x2: f(-x - 10), y1: f(rowY + 4.5), y2: f(rowY + 4.5) }, body);
   rowY += 9;
  }
  const cy = rowY + CARD.row / 2, left = x + CARD.padX;
  if (row.lead) textBlock(body, [row.lead], { cls: row.badge ? `dg-card-badge${/PK/.test(row.lead) ? ' is-key' : ''}` : 'dg-card-lead', anchor: 'start', x: f(left) }).setAttribute('transform', `translate(0 ${f(cy)})`);
  textBlock(body, [row.text], { cls: 'dg-card-text', anchor: 'start', x: f(left + card.leadW) }).setAttribute('transform', `translate(0 ${f(cy)})`);
  if (row.meta) textBlock(body, [row.meta], { cls: 'dg-card-meta', anchor: 'end', x: f(-x - CARD.padX) }).setAttribute('transform', `translate(0 ${f(cy)})`);
  rowY += CARD.row;
 });
}

function buildShape(item) {
 const { shape, lines, head } = item.spec.fixed, body = item.body;
 body.replaceChildren();
 item.parts = {};
 if (shape === 'card') { buildCard(item); return; }
 if (shape === 'start') item.parts.dot = svg('circle', { r: 5, class: 'dg-dot' }, body);
 else if (shape === 'end') { svg('circle', { r: 7, class: 'dg-ring' }, body); svg('circle', { r: 3.5, class: 'dg-dot' }, body); }
 else if (shape === 'circle') item.parts.main = svg('circle', { class: 'dg-shape' }, body);
 else item.parts.main = svg(PATH_SHAPES.has(shape) ? 'path' : 'rect', { class: 'dg-shape' }, body);
 if (shape === 'cylinder' || shape === 'subroutine') item.parts.line = svg('path', { class: 'dg-shape-line' }, body);
 if (!lines || !lines.length) return;
 if (!head) { textBlock(body, lines, { cls: 'dg-label', lineHeight: TEXT.line }); return; }
 // The name of the block and, under it, what it does: two sizes of text centred as one.
 const text = svg('text', { 'text-anchor': 'middle', class: 'dg-label' }, body), rest = lines.length - head;
 let y = -(head * TEXT.line + NODE.part + rest * NODE.detail) / 2;
 lines.forEach((line, i) => {
  const h = i < head ? TEXT.line : NODE.detail;
  if (i === head) y += NODE.part;
  svg('tspan', { x: 0, y: f(y + h / 2), 'dominant-baseline': 'central', class: i < head ? 'dg-label-head' : 'dg-label-detail' }, text).textContent = line;
  y += h;
 });
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
  const radius = shape === 'stadium' ? h / 2 : shape === 'round' ? Math.min(12, h / 2) : shape === 'card' ? 10 : NODE.radius;
  setAttrs(main, { x: f(-w / 2), y: f(-h / 2), width: f(w), height: f(h), rx: f(radius) });
 }
 if (line) {
  line.setAttribute('d', shape === 'cylinder'
   ? `M${f(-w / 2)},${f(-h / 2 + 6)} A${f(w / 2)},6 0 0 0 ${f(w / 2)},${f(-h / 2 + 6)}`
   : `M${f(-w / 2 + 6)},${f(-h / 2)} V${f(h / 2)} M${f(w / 2 - 6)},${f(-h / 2)} V${f(h / 2)}`);
 }
}

const growEase = easeOut;

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
   if (!old || old.shape !== fx.shape || String(old.lines) !== String(fx.lines) || old.head !== fx.head || old.cardKey !== fx.cardKey) buildShape(item);
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
   if (fx.pill) svg('rect', { x: f(-fx.w / 2), y: f(-fx.h / 2), width: f(fx.w), height: f(fx.h), rx: fx.rx ?? 6 }, item.body);
   textBlock(item.body, fx.lines, { anchor: fx.anchor || 'middle', baseline: fx.baseline || 'central', lineHeight: fx.lineHeight || 16 });
  },
  enter: () => ENTER.label,
  apply(item, a) {
   const fx = item.spec.fixed;
   item.g.setAttribute('transform', `translate(${f(item.cur.x)} ${f(item.cur.y)})${fx.rotate ? ` rotate(${fx.rotate})` : ''}`);
   if (fx.pop) pop(item.body, a);
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
 // A bar is one flat colour: rounded where the value ends, square where it stands on the baseline.
 bar: {
  create(item, scene) {
   item.el = svg('path', {}, scene.layer('nodes'));
   this.refresh(item);
   return item.el;
  },
  refresh(item) {
   const fx = item.spec.fixed;
   item.el.setAttribute('class', `dg-bar${fx.cls ? ` ${fx.cls}` : ''}${toneClass(fx.tone)}`);
  },
  enter: () => ENTER.grow,
  apply(item, a) {
   const { x, top, w, base } = item.cur, g = a >= 1 ? 1 : growEase(a);
   item.el.setAttribute('d', barPath(x, base + (top - base) * g, w, base, item.spec.fixed.r ?? 3));
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
   item.el.setAttribute('class', `dg-slice t-${fx.tone}${fx.cls ? ` ${fx.cls}` : ''}${fx.active ? ' is-active' : ''}`);
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
 // A row of the table beside a ring: a swatch, the name, the number in its column and, when there is one, the share.
 legend: {
  create(item, scene) {
   item.g = svg('g', {}, scene.layer('labels'));
   item.g.dataset.index = item.spec.fixed.index;
   item.body = svg('g', { class: 'dg-body' }, item.g);
   item.bg = svg('rect', { class: 'dg-legend-bg', x: -8, y: -PIE.row / 2 + 1, height: PIE.row - 2, rx: 7 }, item.body);
   svg('rect', { class: 'dg-swatch', x: 0, y: -PIE.swatch / 2, width: PIE.swatch, height: PIE.swatch, rx: 2.5 }, item.body);
   item.label = svg('text', { class: 'dg-legend-label', x: PIE.swatch + 10, 'dominant-baseline': 'central' }, item.body);
   item.value = svg('text', { class: 'dg-legend-value', 'text-anchor': 'end', 'dominant-baseline': 'central' }, item.body);
   item.share = svg('text', { class: 'dg-legend-share', 'text-anchor': 'end', 'dominant-baseline': 'central' }, item.body);
   this.refresh(item);
   return item.g;
  },
  refresh(item) {
   const fx = item.spec.fixed;
   item.g.setAttribute('class', `dg-legend-row t-${fx.tone}${fx.active ? ' is-active' : ''}`);
   item.label.textContent = fx.label;
   item.value.textContent = fx.value;
   item.value.setAttribute('x', f(fx.valueX));
   item.share.textContent = fx.share || '';
   item.share.setAttribute('x', f(fx.w));
   item.bg.setAttribute('width', f(fx.w + 16));
  },
  enter: () => ENTER.label,
  apply(item, a) {
   item.g.setAttribute('transform', `translate(${f(item.cur.x)} ${f(item.cur.y)})`);
   fade(item.body, a, 0);
   if (a < 1) item.body.style.transform = `translateX(${((1 - easeOut(a)) * -6).toFixed(2)}px)`;
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
   setAttrs(item.el, { cx: f(x), cy: f(y), r: (r * (a >= 1 ? 1 : easeOut(a))).toFixed(2) });
  },
 },
 badge: {
  create(item, scene) {
   item.g = svg('g', {}, scene.layer('labels'));
   item.body = svg('g', { class: 'dg-body' }, item.g);
   svg('circle', { r: 7.5 }, item.body);
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
   pop(item.body, a);
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
 // A frame around part of a sequence: a hairline box, its kind in small capitals and what it is about beside it.
 frame: {
  create(item, scene) {
   item.g = svg('g', { class: 'dg-frame' }, scene.layer('back'));
   item.rect = svg('rect', { rx: 8 }, item.g);
   item.text = svg('text', { 'dominant-baseline': 'central' }, item.g);
   item.kind = svg('tspan', { class: 'dg-frame-kind' }, item.text);
   item.label = svg('tspan', { class: 'dg-frame-label', dx: 7 }, item.text);
   this.refresh(item);
   return item.g;
  },
  refresh(item) {
   const fx = item.spec.fixed;
   item.kind.textContent = fx.kind;
   item.label.textContent = fx.label || '';
  },
  enter: () => ENTER.fade,
  apply(item, a) {
   const { x, y, w, h } = item.cur;
   setAttrs(item.rect, { x: f(x), y: f(y), width: f(w), height: f(h) });
   setAttrs(item.text, { x: f(x + 10), y: f(y + 13) });
   fade(item.g, a, 0);
  },
 },
 cluster: {
  create(item, scene) {
   item.g = svg('g', {}, scene.layer('back'));
   item.rect = svg('rect', { rx: CLUSTER.radius }, item.g);
   // The name lies over the arrows that cross it, with a rim of the surface, so it stays readable.
   item.text = svg('text', { class: 'dg-cluster-title', 'dominant-baseline': 'central' }, scene.layer('labels'));
   item.extra.push(item.text);
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
   fade(item.text, a, 6);
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
   item.el = svg(item.spec.fixed.milestone ? 'path' : 'rect', {}, scene.layer(item.spec.layer || 'nodes'));
   this.refresh(item);
   return item.el;
  },
  refresh(item) {
   const fx = item.spec.fixed;
   item.el.setAttribute('class', `${fx.cls}${fx.milestone ? ' is-milestone' : ''}${toneClass(fx.tone)}`);
  },
  enter: item => item.spec.fixed.milestone ? ENTER.label : ENTER.grow,
  apply(item, a) {
   const { x, y, w, h } = item.cur, fx = item.spec.fixed;
   if (fx.milestone) {
    const s = h / 2 * (a >= 1 ? 1 : easeOut(a));
    item.el.setAttribute('d', `M${f(x)},${f(y - s)} L${f(x + s)},${f(y)} L${f(x)},${f(y + s)} L${f(x - s)},${f(y)} Z`);
    return;
   }
   // A bar grows from where it starts; one that runs back from a zero line grows from its far end, and one that
   // is centred, from its middle.
   const width = Math.max(Math.min(w, h * 0.2), w * (a >= 1 ? 1 : easeOut(a)));
   setAttrs(item.el, { x: f(fx.back ? x + w - width : fx.mid ? x + (w - width) / 2 : x), y: f(y - h / 2), width: f(width), height: f(h), rx: f(Math.min(fx.rx ?? h / 2, width / 2)) });
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
   const vs = item.cur.vs, { cx, cy } = item.spec.fixed, g = a >= 1 ? 1 : easeOut(a);
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
   item.mark = svg('rect', {}, item.body);
   item.text = svg('text', { x: 18, 'dominant-baseline': 'central' }, item.body);
   this.refresh(item);
   return item.g;
  },
  refresh(item) {
   const fx = item.spec.fixed;
   item.g.setAttribute('class', `dg-chip${toneClass(fx.tone)}`);
   // The mark repeats how the series is drawn: a stroke for a line, a block for bars, a dot for points.
   setAttrs(item.mark, fx.mark === 'line' ? { x: 0, y: -1, width: 12, height: 2, rx: 1 } : fx.mark === 'bar' ? { x: 2, y: -4, width: 8, height: 8, rx: 2 } : { x: 2.5, y: -3.5, width: 7, height: 7, rx: 3.5 });
   item.text.textContent = fx.text;
  },
  enter: () => ENTER.label,
  apply(item, a) {
   item.g.setAttribute('transform', `translate(${f(item.cur.x)} ${f(item.cur.y)})`);
   fade(item.body, a, 0);
  },
 },
 // A row that only answers the pointer: nothing of it is drawn, the shared highlight glides to it.
 hit: {
  create(item, scene) {
   item.el = svg('rect', { class: 'dg-hit' }, scene.layer(item.spec.layer || 'back'));
   return item.el;
  },
  enter: () => 0,
  apply(item) {
   const { x, y, w, h } = item.cur;
   setAttrs(item.el, { x: f(x), y: f(y), width: f(Math.max(0, w)), height: f(Math.max(0, h)) });
  },
  glide(item) {
   const { x, y, w, h } = item.to;
   return { x, y: y + 1, w, h: h - 2 };
  },
 },
 // A figure: the number large, its unit small beside it, both on one baseline.
 figure: {
  create(item, scene) {
   item.g = svg('g', { class: 'dg-figure' }, scene.layer('labels'));
   item.body = svg('g', { class: 'dg-body' }, item.g);
   item.text = svg('text', {}, item.body);
   item.num = svg('tspan', { class: 'dg-figure-num' }, item.text);
   item.unit = svg('tspan', { class: 'dg-figure-unit', dx: 5 }, item.text);
   this.refresh(item);
   return item.g;
  },
  refresh(item) {
   const fx = item.spec.fixed;
   item.num.textContent = fx.figure;
   item.num.style.fontSize = `${fx.size}px`;
   item.unit.textContent = fx.unit || '';
  },
  enter: () => ENTER.label,
  apply(item, a) {
   item.g.setAttribute('transform', `translate(${f(item.cur.x)} ${f(item.cur.y)})`);
   fade(item.body, a, 4);
  },
 },
 // A band of a flow between two nodes, as wide at each end as what it carries.
 ribbon: {
  create(item, scene) {
   item.el = svg('path', {}, scene.layer(item.spec.layer || 'edges'));
   this.refresh(item);
   return item.el;
  },
  refresh(item) {
   item.el.setAttribute('class', `dg-ribbon${toneClass(item.spec.fixed.tone)}`);
  },
  enter: () => ENTER.line,
  apply(item, a) {
   const [x0, a0, a1, x1, b0, b1] = item.cur.band, m = (x0 + x1) / 2;
   item.el.setAttribute('d', `M${f(x0)},${f(a0)} C${f(m)},${f(a0)} ${f(m)},${f(b0)} ${f(x1)},${f(b0)} L${f(x1)},${f(b1)} C${f(m)},${f(b1)} ${f(m)},${f(a1)} ${f(x0)},${f(a1)} Z`);
   item.el.style.opacity = a >= 1 ? '' : easeOut(a).toFixed(3);
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
 // Files: a card in the column like a file attachment, a line of what takes the space, and a row for each entry.
 fcard: {
  // Under everything, the rule and a tree's lines too, though it comes last so it can grow with the list.
  create(item, scene) {
   item.el = svg('rect', { class: 'dg-fv-card', rx: 16 });
   scene.layer('back').prepend(item.el);
   return item.el;
  },
  enter: () => ENTER.fade,
  apply(item, a) {
   const { x, y, w, h } = item.cur;
   setAttrs(item.el, { x: f(x), y: f(y), width: f(Math.max(0, w)), height: f(Math.max(0, h)) });
   item.el.style.opacity = a >= 1 ? '' : easeOut(a).toFixed(3);
  },
 },
 fhead: {
  create(item, scene) {
   item.g = svg('g', { class: 'dg-fv-head' }, scene.layer('labels'));
   item.body = svg('g', { class: 'dg-body' }, item.g);
   this.refresh(item);
   return item.g;
  },
  refresh(item) {
   const fx = item.spec.fixed, body = item.body, cy = FV.head / 2 - 3;
   body.replaceChildren();
   fvIcon(body, { folder: true }, fx.left, cy - 9, 18);
   const text = (value, cls, x, anchor = 'start') => svg('text', { class: cls, x: f(x), y: f(cy), 'text-anchor': anchor, 'dominant-baseline': 'central' }, body).textContent = value;
   text(fx.name, 'dg-fv-title', fx.left + 28);
   if (fx.path) text(fx.path, 'dg-fv-path', fx.left + 28 + fx.nameW + 10);
   if (fx.counts) text(fx.counts, 'dg-fv-sum', fx.right, 'end');
   if (fx.size) text(fx.size, 'dg-fv-total', fx.counts ? fx.right - textWidth(fx.counts, 12.5, 500) - 16 : fx.right, 'end');
  },
  enter: () => ENTER.label,
  apply(item, a) {
   item.g.setAttribute('transform', `translate(${f(item.cur.x)} ${f(item.cur.y)})`);
   fade(item.body, a, 3);
  },
 },
 fseg: {
  create(item, scene) {
   item.el = svg('rect', { class: 'dg-fv-seg' }, scene.layer('nodes'));
   this.refresh(item);
   return item.el;
  },
  refresh(item) {
   const fx = item.spec.fixed;
   item.el.style.setProperty('--ft', fx.tone);
   setAttrs(item.el, { y: f(fx.y), height: fx.h, rx: fx.h / 2 });
  },
  enter: () => ENTER.grow,
  apply(item, a) {
   const { x, w } = item.cur;
   setAttrs(item.el, { x: f(x), width: f(Math.max(0, w * (a >= 1 ? 1 : easeOut(a)))) });
  },
 },
 frow: {
  create(item, scene) {
   item.g = svg('g', { class: 'dg-fv-row' }, scene.layer('nodes'));
   item.body = svg('g', { class: 'dg-body' }, item.g);
   this.refresh(item);
   return item.g;
  },
  refresh(item) {
   const fx = item.spec.fixed, body = item.body, cy = fx.h / 2;
   body.replaceChildren();
   svg('rect', { class: 'dg-fv-hit', x: f(fx.plateX), y: 0, width: f(fx.plateW), height: fx.h }, body);
   if (fx.folder) fvIcon(body, fx, fx.iconX, cy - 8, 16);
   else fvIcon(body, fx, fx.iconX + 1, cy - 10, 20);
   const text = (value, cls, x, anchor = 'start') => svg('text', { class: cls, x: f(x), y: f(cy), 'text-anchor': anchor, 'dominant-baseline': 'central' }, body).textContent = value;
   text(fx.label, 'dg-fv-name', fx.textX);
   if (fx.note) text(fx.note, 'dg-fv-note', fx.textX + fx.labelW + 12);
   if (fx.when) text(fx.when, 'dg-fv-date', fx.dateX, 'end');
   if (fx.amount) text(fx.amount, fx.folder ? 'dg-fv-count' : 'dg-fv-size', fx.sizeX, 'end');
   if (fx.rule) svg('line', { class: 'dg-fv-rule', x1: f(fx.rule), x2: f(fx.right), y1: f(fx.h - 0.5), y2: f(fx.h - 0.5) }, body);
  },
  enter: () => ENTER.label,
  apply(item, a) {
   item.g.setAttribute('transform', `translate(${f(item.cur.x)} ${f(item.cur.y)})`);
   fade(item.body, a, 4);
  },
  glide(item) {
   const fx = item.spec.fixed;
   return { x: item.to.x + fx.plateX, y: item.to.y + 1, w: fx.plateW, h: fx.h - 2 };
  },
 },
};

// Files wear the icons attachments have; folders the outline folder of the sidebar. Returns how wide the icon is.
function fvIcon(parent, { name = '', folder }, x, y, h) {
 const holder = svg('g', {}, parent), w = folder ? h : h * 0.8;
 if (folder) holder.setAttribute('class', 'dg-fv-folder');
 holder.innerHTML = folder ? Glyphs.folder : FileKinds.icon(FileKinds.describe(name));
 setAttrs(holder.firstElementChild, { x: f(x), y: f(y), width: f(w), height: f(h) });
 return w;
}

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

function springTo(obj, vel, key, goal, dt, [k, c] = SPRING) {
 let x = obj[key], v = vel[key];
 if (x === goal && !v) return false;
 const steps = Math.max(1, Math.ceil(dt / 0.008)), h = dt / steps;
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

// One highlight for rows that light up under the pointer, like the sidebar's: it glides from row to row instead of
// blinking, comes out where the pointer enters and fades where it leaves.
class Glide {
 constructor(parent) {
  this.el = svg('rect', { class: 'dg-glide', rx: 9 }, parent);
  this.cur = { x: 0, y: 0, w: 0, h: 0, o: 0 };
  this.vel = { x: 0, y: 0, w: 0, h: 0, o: 0 };
  this.box = null;
  this.raf = 0;
  this.last = 0;
  this.tick = this.tick.bind(this);
 }

 to(box) {
  this.box = box;
  if (box && this.cur.o < 0.02) {
   Object.assign(this.cur, box);
   Object.assign(this.vel, { x: 0, y: 0, w: 0, h: 0 });
  }
  if (this.raf) return;
  this.last = performance.now();
  this.raf = requestAnimationFrame(this.tick);
 }

 tick(now) {
  this.raf = 0;
  const dt = clamp((now - this.last) / 1000, 0, 0.032), box = this.box, cur = this.cur;
  this.last = now;
  let moving = false;
  if (reducedMotion()) {
   if (box) Object.assign(cur, box);
   cur.o = box ? 1 : 0;
  } else {
   if (box) for (const key in box) moving = springTo(cur, this.vel, key, box[key], dt, GLIDE.move) || moving;
   moving = springTo(cur, this.vel, 'o', box ? 1 : 0, dt, GLIDE.fade) || moving;
  }
  setAttrs(this.el, { x: f(cur.x), y: f(cur.y), width: f(Math.max(0, cur.w)), height: f(Math.max(0, cur.h)) });
  this.el.style.opacity = clamp(cur.o, 0, 1).toFixed(3);
  if (moving) this.raf = requestAnimationFrame(this.tick);
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
      { kind: 'select', label: 'edit.kind', options: [['line', I18n.t('edit.line')], ['area', I18n.t('edit.area')], ['bar', I18n.t('edit.bar')]] },
      ...d.labels.map(pointCol),
     ],
     rows: d.series.map(s => ({ cells: [s.name, s.type, ...d.labels.map((_, i) => s.values[i] ?? '')] })),
     blank: t => ({ cells: ['', t.rows[t.rows.length - 1]?.cells[1] || 'line', ...t.cols.slice(2).map(() => '')] }),
     blankCol: t => pointCol(nextLabel(t.cols.slice(2).map(col => col.name))),
    }],
    range: [d.min, d.max],
    // What the table has no place for is kept as it was written.
    stacked: d.stacked, horizontal: d.horizontal, log: d.log, goals: d.goals, zones: d.zones, marks: d.marks,
   };
  },
  write(m) {
   const t = m.tables[0], labels = t.cols.slice(2).map(col => col.name), [lo, hi] = m.range;
   const values = t.rows.map(row => row.cells.slice(2).map(numeric));
   const keep = lo !== null && hi !== null && values.flat().every(v => v >= lo && v <= hi);
   const x = valueOf(m, 'x'), y = valueOf(m, 'y'), named = label => label ? ` ${quote(label)}` : '';
   return joinLines([
    `xychart-beta${m.stacked ? ' stacked' : ''}${m.horizontal ? ' horizontal' : ''}${m.log ? ' log' : ''}`,
    valueOf(m, 'title') && `    title ${quote(valueOf(m, 'title'))}`,
    `    x-axis ${x ? `${quote(x)} ` : ''}[${labels.map(quote).join(', ')}]`,
    (y || keep) && `    y-axis${y ? ` ${quote(y)}` : ''}${keep ? ` ${lo} --> ${hi}` : ''}`,
    ...t.rows.map((row, k) => `    ${['bar', 'area'].includes(row.cells[1]) ? row.cells[1] : 'line'}${words(row.cells[0]) ? ` ${quote(row.cells[0])}` : ''} [${values[k].join(', ')}]`),
    ...m.goals.map(goal => `    goal${named(goal.label)} ${goal.value}`),
    ...m.zones.map(zone => `    ${zone.along ? 'x-zone' : 'zone'}${named(zone.label)} ${zone.a} --> ${zone.b}`),
    ...m.marks.map(mark => `    mark${named(mark.label)} ${mark.at}`),
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
      rows: g.nodes.map(n => ({ cells: [n.label.trim() ? n.text ?? n.label : '', ...(grouped ? [n.group || ''] : [])], meta: { id: n.id, shape: n.shape } })),
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
   // States held inside others have no place in the table: such a diagram is edited as code.
   if (!g || g.groups.length) return null;
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
    fields: [field('title', 'edit.title', d.title), field('auto', 'edit.numbers', d.numbered, 'check')],
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
    valueOf(m, 'title') && `    title ${words(valueOf(m, 'title'))}`,
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
 constructor(el, onChange, { instant = false } = {}) {
  this.el = el;
  this.onChange = onChange;
  this.instant = instant;
  this.kind = el.dataset.kind || '';
  this.tones = tonesOf(el);
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
  this.glide = null;
  this.lit = '';
  this.measured = null;
  new ResizeObserver(entries => this.resize(entries[entries.length - 1].contentRect.width)).observe(this.stage);
  this.stage.addEventListener('dblclick', event => this.rename(event));
  this.stage.addEventListener('pointerover', event => this.focusPie(event));
  this.stage.addEventListener('pointerleave', () => this.focusPie(null));
  this.frame.addEventListener('pointermove', event => this.pointer(event));
  this.frame.addEventListener('pointerleave', () => this.pointer(null));
 }

 // A stage that is not on the page yet has no width to tell: it is asked again until it has one.
 available() {
  this.measured ??= this.stage.clientWidth || null;
  return Math.max(260, this.measured || 0);
 }

 // The column of text inside the stage. A drawing has the whole width of the chat to itself, and the text runs
 // down the middle of it; in a list or a quote the stage is no wider than the text.
 column() {
  const room = this.available(), parent = this.el.parentElement;
  const width = this.el.classList.contains('md-wide') && parent ? Math.min(room, Math.max(260, parent.clientWidth)) : room;
  return { left: (room - width) / 2, width };
 }

 // How much larger than drawn a drawing is shown: as the chat's type is to the type its sizes were made for.
 zoom() {
  const size = parseFloat(getComputedStyle(this.el).fontSize) || 16;
  return clamp(size / TYPE.base, TYPE.min, TYPE.max);
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
  // A saved chat is drawn before it is put on the page, so its first layout does not know the width and takes the
  // narrowest. What that layout decided, to stand a scheme on end or where its blocks go, is a guess and is not
  // kept: once the width is known, the scheme is laid out for it afresh.
  const width = this.available(), blind = !this.measured;
  const result = safeCompile(this.source, this.tones, { width, column: this.column().width, zoom: this.zoom(), hints: this.hints, sideways: this.sideways, kind: this.kind });
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
  this.hints = blind ? null : result.hints || null;
  this.sideways = blind ? false : result.sideways || false;
  this.svg.dataset.kind = result.kind;
  // Said aloud, a drawing is its title, or what it is when it has none.
  this.svg.setAttribute('aria-label', result.items.find(item => item.key === 'title')?.fixed.lines[0] || I18n.t('diagram.label'));
  this.showTip(null, null, []);
  this.lit = '';
  if (first) this.hideStatus();
  this.scene.set([this.viewSpec(result), ...result.items], { stagger: first && !this.live ? STAGGER.reveal : STAGGER.live, instant: this.instant });
  this.instant = false;
  if (!this.live) this.ensureTools();
  return true;
 }

 // A figure that belongs to the text stands on the text's own left edge while it fits the column; a figure that
 // needs more room, and every scheme, sits in the middle of the whole width.
 // The tools go beside the drawing where there is room, into the free corner of its first line, or onto a band above it.
 viewSpec(result) {
  const room = this.available(), zoom = result.zoom || 1, flush = !!result.flush, padX = flush ? 0 : PAD, padY = flush ? PAD_FLUSH : PAD;
  const s = Math.max(MIN_SCALE, Math.min(1, (room - padX * 2) / (result.width * zoom))) * zoom;
  const cw = result.width * s, ch = result.height * s, column = this.column();
  const w = Math.max(room, cw + padX * 2), ox = flush && cw <= column.width + 1 ? column.left : Math.max(padX, (w - cw) / 2);
  let band = 0, tx = ox + cw + TOOLS.gap, ty = padY - 3;
  if (tx + TOOLS.width > room) {
   // A drawing too wide for its stage even at its smallest is scrolled sideways: the tools keep to the corner
   // that stays in view instead of leaving with the far edge of the drawing.
   const corner = result.corner, edge = Math.min(ox + cw, room);
   tx = edge - TOOLS.width - (corner?.inset || 0) * s;
   if (corner && edge - ox - TOOLS.width >= corner.x * s && corner.h * s + padY >= TOOLS.height + 2) ty = Math.max(2, padY + (corner.h * s - TOOLS.height) / 2);
   else { band = TOOLS.height + 12 - padY; ty = 4; }
  }
  const props = { ox, s, cw, top: padY + band, h: ch + padY * 2 + band, w, tx, ty };
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
   let key = target.closest?.('[data-key]')?.dataset.key;
   // Points are small: among scattered ones the nearest within reach answers, not only the one hit dead on.
   if (cx !== null && result.near && !result.tips.has(key)) {
    let best = NEAR * NEAR;
    for (const point of result.near) {
     const d = (point.x - cx) ** 2 + (point.y - cy) ** 2;
     if (d < best) { best = d; key = point.key; }
    }
   }
   if (key && result.tips.has(key)) {
    tip = result.tips.get(key);
    keys = tip.hot || [key];
    at = { el: this.scene.items.get(keys[0])?.el, px: cx, py: cy };
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
   this.glideTo(keys);
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
   // A tip stands over a small mark. On a large one, a band or a tile, it keeps by the pointer instead,
   // and in either case it stays inside the drawing.
   const box = at.el.getBoundingClientRect(), stage = this.stage.getBoundingClientRect();
   const large = (box.width > 90 || box.height > 60) && at.px !== undefined;
   const mid = large ? v.ox + at.px * v.s : box.left - stage.left + box.width / 2;
   const top = large ? v.top + at.py * v.s - 6 : box.top - stage.top, bottom = large ? v.top + at.py * v.s + 12 : box.bottom - stage.top;
   x = mid - w / 2;
   y = top - h - 10;
   if (y < 0) y = bottom + 10;
   y = clamp(y, 0, Math.max(0, v.h - h));
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

 // A row that says where its highlight goes gets the shared one; anything else lets it fade.
 glideTo(keys) {
  const item = keys.length === 1 ? this.scene.items.get(keys[0]) : null;
  const box = item?.type.glide?.(item) || null;
  if (!box && !this.glide) return;
  this.glide ??= new Glide(this.scene.layer('back'));
  this.glide.to(box);
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
  // The block a diagram opens with holds its title and settings. The table has no fields for them, so the block
  // stays as it was written.
  const front = FRONT.exec(this.good)?.[0] || '';
  this.schedule(() => `${front}${front && !front.endsWith('\n') ? '\n' : ''}${this.adapter.write(this.model)}`);
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
  nodes.forEach((row, i) => select.add(new Option(words(row.cells[0]).replace(/\*\*/g, '') || `${I18n.t('edit.block')} ${i + 1}`, row.meta.id)));
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
  // A name of several lines is edited as one: a field of one line would drop the breaks without a space.
  input.value = String(this.result.labels.get(id) ?? id).replace(/\n/g, ' ');
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
 // While the opening plays, the warm-up waits for it to end: it would take frames from it.
 if (document.documentElement.classList.contains('is-splash')) {
  window.addEventListener('splashend', prewarm, { once: true });
  return;
 }
 warmed = true;
 const idle = window.requestIdleCallback || (callback => setTimeout(callback, 60));
 idle(() => {
  for (const sample of WARMUP) {
   const host = document.createElement('div');
   const view = new DiagramView(host);
   view.update(sample, false);
   cancelAnimationFrame(view.scene.raf);
   view.scene.raf = 0;
  }
 }, { timeout: 1500 });
}

const view = (el, onChange, options) => new DiagramView(el, onChange, options);

if (document.readyState === 'complete') prewarm();
else window.addEventListener('load', prewarm, { once: true });

window.Diagram = { view, prewarm, compile: safeCompile, renameNode, editorFor, withHeader };
})();
