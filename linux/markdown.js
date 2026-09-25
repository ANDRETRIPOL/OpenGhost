(() => {
'use strict';

const TONES = ['lilac', 'turquoise', 'blue', 'pink', 'yellow', 'orange', 'green'];
const CALLOUTS = { note: 'blue', tip: 'green', important: 'lilac', warning: 'yellow', caution: 'pink' };
const ART_LANGS = new Set(['', 'text', 'txt', 'plain', 'plaintext', 'ascii', 'diagram', 'art', 'tree']);
const DIAGRAM_LANGS = new Set(['mermaid', 'mmd']);
const DIAGRAM_KINDS = {
 flowchart: 'flowchart', graph: 'flowchart', statediagram: 'stateDiagram-v2', 'statediagram-v2': 'stateDiagram-v2', state: 'stateDiagram-v2',
 sequencediagram: 'sequenceDiagram', sequence: 'sequenceDiagram', pie: 'pie', xychart: 'xychart-beta', 'xychart-beta': 'xychart-beta',
 candlestick: 'candlestick', candles: 'candlestick', ohlc: 'candlestick', timeline: 'timeline', gantt: 'gantt', mindmap: 'mindmap',
 quadrantchart: 'quadrantChart', quadrant: 'quadrantChart', radar: 'radar-beta', 'radar-beta': 'radar-beta',
 erdiagram: 'erDiagram', er: 'erDiagram', classdiagram: 'classDiagram', 'classdiagram-v2': 'classDiagram',
 wireframe: 'wireframe', mockup: 'wireframe',
};
const DIAGRAM_HEADER = /^(graph|flowchart|stateDiagram(-v2)?|sequenceDiagram|pie|xychart(-beta)?|candlestick|candles|ohlc|timeline|gantt|mindmap|quadrantChart|radar(-beta)?|erDiagram|classDiagram(-v2)?|wireframe|mockup)\b/i;
const BARE_DIAGRAM = /^((flowchart|graph)\s+(TD|TB|LR|RL|BT)|(sequenceDiagram|stateDiagram(-v2)?|xychart(-beta)?|quadrantChart|radar-beta|erDiagram|classDiagram|mindmap|gantt|timeline|candlestick|wireframe)\b.*|pie(\s+(showData|title\b.*))?)\s*$/;
const PLAIN_LANGS = new Set(['', 'text', 'txt', 'plain', 'plaintext']);
const CALC_LANGS = new Set([...PLAIN_LANGS, 'math', 'calc', 'arithmetic', 'ascii']);
const CALC_MATH = /^[ \d.,+\-−–×xхX*·÷:=|│─━—_‾]*$/;
const CALC_RULE = /^[─━—_‾=-]{2,}$/;
const CALC_OPS = { '+': '+', '-': '−', '−': '−', '–': '−', '×': '×', x: '×', 'х': '×', X: '×', '*': '×', '·': '·', '÷': '÷', ':': ':', '=': '=' };
const CALC = { lines: 40, cols: 48 };
const CALC_MARK = /^\s*(?:[←⟵#—(]|<-|\/\/)/;
const CALC_SIMPLE = /^(\s*)([+\-−–×xхX*·÷]?)(\s*)(\d+(?:[.,]\d+)?)$/;
const SHEET = { lines: 80, width: 110 };
const SHEET_LABEL = /^([^\s:=][^:=]{0,28}?)[ \t]*:[ \t]+(\S.*)$/;
const SHEET_CODE = /[{}<>;`\\[\]|]|[\u2500-\u259f]/;
const SHEET_TOTAL = /^(?:итог|всего|сумма|total|sum|result|ответ|answer)/i;
const SHEET_EXPR = /\d\s*(?:[=+×÷·≈*]|\s[−–-]\s|\s[xх]\s)\s*[$€£¥₽]?\d|=\s*[$€£¥₽]?\d/;
const SHEET_OP = /\s([=+×÷·≈−–*-]|[xх](?=\s+[$€£¥₽]?\d))\s+/g;
const SHEET_NUM = /(?<![\p{L}\d])[$€£¥₽]?\d+(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d+)?(?:[%$€£¥₽]|[kKMBкКмМ](?![\p{L}\d]))?(?![\p{L}\d])/gu;
const CITE = /^[ \t]*(?:—|–|―|--)[ \t]+(\S.*)$/;
const CITE_INLINE = /^(.*[»”"])[ \t]+(?:—|–|―|--?)[ \t]+(\S.*)$/;
const QUOTE_PAIRS = { '«': '»', '“': '”', '„': '“', '"': '"' };
const WIDE_TABLE = { columns: 5, text: { columns: 3, chars: 130, cell: 80 } };
const PSEUDO_HEADING_MAX = 100;
const SETEXT_MAX = 60;
const FLOW = { max: 180, part: 42, min: 3 };
const SAFE_URL = /^(?:https?:|mailto:)/i;

const LIST_ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])(?:([ \t]+)(.*))?$/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const FENCE = /^([ \t]*)(`{3,}|~{3,})[ \t]*([^\s`]*)([^`]*)$/;
const FENCE_CLOSE = /^[ \t]*(`{3,}|~{3,})[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
const TABLE_RULE = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const QUOTE = /^ {0,3}>[ \t]?/;
const CALLOUT = /^\[!(note|tip|important|warning|caution)\][ \t]*(.*)$/i;
const MATH_BLOCK = /^[ \t]*(\$\$|\\\[)(.*)$/;
const BOLD_LINE = /^(\*\*|__)(?=\S)(?:(?!\1).)+?(?<=\S)\1:?$/;
const FLOW_ARROW = /[ \t]+(?:→|->|-->|⟶|=>|⇒|➜|➔|➝)[ \t]+/;
const PARTIAL = /^[ \t]*(?:#{1,6}[ \t]*|[-*+][ \t]*|\d{1,9}[.)]?[ \t]*|(?:>[ \t]*)+(?:[—–―][ \t]*)?|`{1,2}|`{3,}[^`]*|~{1,2}|~{3,}[^~]*|[-*_=](?:[ \t]*[-*_=])*[ \t]*|\$\$?|\\\[?|\\)$/;
const PIPE = /^[ \t]*\|/;
const ART = /[\u2500-\u259f]/;
const ART_ARROWS = /[\u2190-\u21ff\u25b2-\u25c5\u25ba\u25bc\u27f5-\u27ff]+|<?-{1,}>|<-{1,}|={1,}>/g;
const ESCAPABLE = /[!-\/:-@\[-`{-~]/;
const PUNCT = /[!-\/:-@\[-`{-~\u00a1-\u00bf\u2010-\u2027\u2030-\u205e«»]/;
const AUTOLINK = /^(?:https?:\/\/|www\.)[^\s<>"'`]+/;
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

const COPY_ICON = '<svg class="md-copy-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><rect x="5.25" y="5.25" width="8.5" height="8.5" rx="2.25"/><path d="M10.75 3.25a2 2 0 0 0-2-2h-4.5a3 3 0 0 0-3 3v4.5a2 2 0 0 0 2 2"/></svg>'
 + '<svg class="md-check-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>';

const escapeHtml = text => text.replace(/[&<>"]/g, c => ENTITIES[c]);
const isSpace = c => c === undefined || /\s/.test(c);
const isPunct = c => c !== undefined && PUNCT.test(c);
const classes = (...names) => {
 const list = names.filter(Boolean).join(' ');
 return list ? ` class="${list}"` : '';
};
const tone = name => name ? `t-${name}` : '';

function indentOf(line) {
 let n = 0;
 for (const c of line) {
  if (c === ' ') n++;
  else if (c === '\t') n += 4 - n % 4;
  else break;
 }
 return n;
}

function dedent(line, count) {
 let n = 0, k = 0;
 while (k < line.length && n < count) {
  if (line[k] === ' ') n++;
  else if (line[k] === '\t') n += 4 - n % 4;
  else break;
  k++;
 }
 return line.slice(k);
}

function findRun(src, char, length, from) {
 for (let i = src.indexOf(char, from); i >= 0; i = src.indexOf(char, i)) {
  let run = 1;
  while (src[i + run] === char) run++;
  if (run === length) return i;
  i += run;
 }
 return -1;
}

function parseLink(src, i, live) {
 let depth = 0, j = i + 1;
 for (; j < src.length; j++) {
  const c = src[j];
  if (c === '\\') j++;
  else if (c === '[') depth++;
  else if (c === ']') { if (!depth) break; depth--; }
 }
 if (j >= src.length) return live ? { end: src.length, html: '' } : null;
 const label = src.slice(i + 1, j);
 if (src[j + 1] !== '(') return live && j + 1 === src.length ? { end: src.length, html: '' } : null;
 const m = /^\(\s*<?([^\s<>()]*(?:\([^\s<>()]*\)[^\s<>()]*)*)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/.exec(src.slice(j + 1));
 if (!m) {
  if (live && !src.includes(')', j + 1)) return { end: src.length, html: `<a class="is-pending">${inline(label, true)}</a>` };
  return null;
 }
 const href = m[1], end = j + 1 + m[0].length, body = inline(label);
 if (!SAFE_URL.test(href)) return { end, html: body };
 const bare = text => text.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
 if (window.LinkChip && /^https?:/i.test(href) && bare(label) === bare(href)) return { end, html: LinkChip.html(href) };
 return { end, html: `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${body}</a>` };
}

function autolink(src, i, live) {
 if (i && /[\w@/.]/.test(src[i - 1])) return null;
 const m = AUTOLINK.exec(src.slice(i, i + 2048));
 if (!m) return null;
 if (live && i + m[0].length >= src.length) return { end: src.length, html: '' };
 let url = m[0];
 while (/[.,;:!?»"'…*_~]$/.test(url) || url.endsWith(')') && (url.match(/\(/g) || []).length < (url.match(/\)/g) || []).length) url = url.slice(0, -1);
 if (url.length < 8) return null;
 if (window.LinkChip) return { end: i + url.length, html: LinkChip.html(url) };
 const href = url.startsWith('www.') ? `https://${url}` : url;
 return { end: i + url.length, html: `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>` };
}

function inlineMath(src, i) {
 if (src[i + 1] === '$' || isSpace(src[i + 1])) return null;
 for (let j = src.indexOf('$', i + 1); j > 0; j = src.indexOf('$', j + 1)) {
  if (src[j - 1] === '\\') continue;
  const body = src.slice(i + 1, j);
  if (isSpace(src[j - 1]) || /\d/.test(src[j + 1] || '') || body.includes('\n')) return null;
  if (!/[\\^_={}]/.test(body) && !/^[A-Za-z]$/.test(body)) return null;
  return { end: j + 1, html: `<span class="md-imath">${Tex.render(body)}</span>` };
 }
 return null;
}

function emphasis(tokens, live) {
 const stack = [];
 for (const t of tokens) {
  if (!t.delim) continue;
  if (t.close) {
   for (let s = stack.length - 1; s >= 0 && t.count;) {
    const o = stack[s];
    const use = t.delim === '~' ? 2 : o.count >= 2 && t.count >= 2 ? 2 : 1;
    if (o.delim !== t.delim || o.count < use || t.count < use) { s--; continue; }
    const tag = t.delim === '~' ? 'del' : use === 2 ? 'strong' : 'em';
    o.post = `<${tag}>${o.post}`;
    t.pre += `</${tag}>`;
    o.count -= use;
    t.count -= use;
    stack.length = s + 1;
    if (!o.count) { stack.pop(); s--; }
   }
  }
  if (t.open && t.count) stack.push(t);
 }
 let tail = '';
 if (live) {
  for (let s = stack.length - 1; s >= 0; s--) {
   const o = stack[s];
   while (o.count >= (o.delim === '~' ? 2 : 1)) {
    const use = o.delim === '~' ? 2 : Math.min(2, o.count), tag = o.delim === '~' ? 'del' : use === 2 ? 'strong' : 'em';
    o.post = `<${tag}>${o.post}`;
    tail += `</${tag}>`;
    o.count -= use;
   }
  }
 }
 return tokens.map(t => t.delim ? t.pre + t.delim.repeat(t.count) + t.post : t.html).join('') + tail;
}

function inline(src, live = false) {
 const tokens = [];
 let text = '';
 const flush = () => { if (text) { tokens.push({ html: escapeHtml(text) }); text = ''; } };
 const emit = html => { flush(); tokens.push({ html }); };
 const n = src.length;
 for (let i = 0; i < n;) {
  const c = src[i];
  if (c === '\\') {
   const next = src[i + 1];
   if (next === '(' || next === '[') {
    const close = src.indexOf(next === '(' ? '\\)' : '\\]', i + 2);
    if (close >= 0 || live) {
     emit(`<span class="md-imath">${Tex.render(src.slice(i + 2, close >= 0 ? close : n))}</span>`);
     i = close >= 0 ? close + 2 : n;
     continue;
    }
   }
   if (next === undefined) { if (!live) text += c; i++; continue; }
   if (ESCAPABLE.test(next)) { text += next; i += 2; continue; }
   text += c;
   i++;
   continue;
  }
  if (c === '`') {
   let run = 1;
   while (src[i + run] === '`') run++;
   const close = findRun(src, '`', run, i + run);
   if (close >= 0 || live) {
    let body = src.slice(i + run, close >= 0 ? close : n);
    if (/^ [^]*[^ ][^]* $/.test(body)) body = body.slice(1, -1);
    emit(`<code>${escapeHtml(body)}</code>`);
    i = close >= 0 ? close + run : n;
    continue;
   }
   text += src.slice(i, i + run);
   i += run;
   continue;
  }
  if (c === '$') {
   const math = inlineMath(src, i);
   if (math) { emit(math.html); i = math.end; continue; }
  }
  if (c === '[') {
   const link = parseLink(src, i, live);
   if (link) { emit(link.html); i = link.end; continue; }
  }
  if ((c === 'h' || c === 'w') && (src.startsWith('http', i) || src.startsWith('www.', i))) {
   const link = autolink(src, i, live);
   if (link) { emit(link.html); i = link.end; continue; }
  }
  if (c === '*' || c === '_' || c === '~') {
   let run = 1;
   while (src[i + run] === c) run++;
   if (live && i + run === n) { i = n; continue; }
   const before = src[i - 1], after = src[i + run];
   if (c === '~' && run !== 2 || /\d/.test(before) && /\d/.test(after)) { text += src.slice(i, i + run); i += run; continue; }
   const left = !isSpace(after) && (!isPunct(after) || isSpace(before) || isPunct(before));
   const right = !isSpace(before) && (!isPunct(before) || isSpace(after) || isPunct(after));
   flush();
   tokens.push({
    delim: c,
    count: run,
    open: c === '_' ? left && (!right || isPunct(before)) : left,
    close: c === '_' ? right && (!left || isPunct(after)) : right,
    pre: '',
    post: '',
   });
   i += run;
   continue;
  }
  if (c === '\n') { emit('<br>'); i++; continue; }
  text += c;
  i++;
 }
 flush();
 return emphasis(tokens, live);
}

function insideFence(lines, end) {
 let open = null;
 for (let k = 0; k < end; k++) {
  const m = lines[k].match(/^[ \t]*(`{3,}|~{3,})(.*)$/);
  if (!m) continue;
  if (!open) open = m[1];
  else if (m[1][0] === open[0] && m[1].length >= open.length && !m[2].trim()) open = null;
 }
 return open !== null;
}

function holdBack(lines) {
 const last = lines.length - 1;
 if (PARTIAL.test(lines[last])) lines[last] = '';
 let end = last;
 if (!lines[end].trim()) end--;
 let start = end;
 while (start >= 0 && PIPE.test(lines[start])) start--;
 start++;
 if (start > end || insideFence(lines, start)) return;
 const confirmed = start + 1 < last && TABLE_RULE.test(lines[start + 1]);
 if (!confirmed) for (let k = start; k <= end; k++) lines[k] = '';
}

function cells(row) {
 const out = [];
 let cell = '', code = false;
 const body = row.trim().replace(/^\|/, '').replace(/(^|[^\\])\|$/, '$1');
 for (let i = 0; i < body.length; i++) {
  const c = body[i];
  if (c === '\\' && body[i + 1] === '|') { cell += '|'; i++; continue; }
  if (c === '`') code = !code;
  if (c === '|' && !code) { out.push(cell.trim()); cell = ''; continue; }
  cell += c;
 }
 out.push(cell.trim());
 return out;
}

const isTable = (lines, i) => i + 1 < lines.length && lines[i].includes('|') && lines[i + 1].includes('|') && lines[i + 1].includes('-') && TABLE_RULE.test(lines[i + 1]);

function startsBlock(lines, i) {
 const line = lines[i];
 return HEADING.test(line) || FENCE.test(line) || RULE.test(line) || QUOTE.test(line) || MATH_BLOCK.test(line)
  || LIST_ITEM.test(line) || isTable(lines, i);
}

function flowParts(line) {
 if (line.length > FLOW.max || !FLOW_ARROW.test(line)) return null;
 const parts = line.split(FLOW_ARROW).map(part => part.trim());
 if (parts.length < FLOW.min || parts.some(part => !part || part.length > FLOW.part)) return null;
 return parts;
}

function parseList(lines, i) {
 const first = lines[i].match(LIST_ITEM);
 const base = indentOf(first[1]), ordered = /\d/.test(first[2]);
 const start = ordered ? parseInt(first[2], 10) : 1;
 const items = [];
 while (i < lines.length) {
  const m = lines[i].match(LIST_ITEM);
  if (!m || indentOf(m[1]) > base || /\d/.test(m[2]) !== ordered) break;
  const gap = m[3] ? (m[3].length > 4 ? 1 : m[3].length) : 1;
  const column = indentOf(m[1]) + m[2].length + gap;
  const body = [m[4] || ''];
  let j = i + 1;
  for (; j < lines.length; j++) {
   const line = lines[j];
   if (!line.trim()) { body.push(''); continue; }
   const indent = indentOf(line);
   if (indent > base) { body.push(dedent(line, Math.min(indent, column))); continue; }
   if (LIST_ITEM.test(line)) break;
   if (body[body.length - 1].trim() && !startsBlock(lines, j)) { body.push(line.trim()); continue; }
   break;
  }
  while (body.length > 1 && !body[body.length - 1].trim()) body.pop();
  let task = null;
  const box = body[0].match(/^\[([ xX])\](?:[ \t]+(.*))?$/);
  if (box) { task = box[1] !== ' '; body[0] = box[2] || ''; }
  items.push({ body, task });
  i = j;
 }
 return [{ type: 'list', ordered, start, items }, i];
}

function parse(lines, openLine = -1, top = false) {
 const blocks = [];
 const n = lines.length;
 let i = 0;
 const add = (block, from, to) => {
  if (top) block.src = lines.slice(from, to).join('\n');
  blocks.push(block);
 };
 while (i < n) {
  const line = lines[i], from = i;
  if (!line.trim()) { i++; continue; }
  let m = line.match(FENCE);
  if (m && indentOf(m[1]) < 4) {
   const mark = m[2], pad = indentOf(m[1]), body = [];
   let closed = false;
   for (i++; i < n; i++) {
    const close = lines[i].match(FENCE_CLOSE);
    if (close && close[1][0] === mark[0] && close[1].length >= mark.length) { closed = true; i++; break; }
    body.push(dedent(lines[i], pad));
   }
   add({ type: 'code', lang: m[3].toLowerCase(), info: m[4].trim(), body: body.join('\n'), closed }, from, i);
   continue;
  }
  if ((m = line.match(MATH_BLOCK))) {
   const close = m[1] === '$$' ? '$$' : '\\]', body = [];
   let closed = false;
   const at = m[2].indexOf(close);
   if (at >= 0) { body.push(m[2].slice(0, at)); closed = true; i++; }
   else {
    body.push(m[2]);
    for (i++; i < n; i++) {
     const k = lines[i].indexOf(close);
     if (k >= 0) { body.push(lines[i].slice(0, k)); closed = true; i++; break; }
     body.push(lines[i]);
    }
   }
   add({ type: 'math', body: body.join('\n').trim(), closed }, from, i);
   continue;
  }
  if ((m = line.match(HEADING))) {
   i++;
   if (m[2]) add({ type: 'heading', level: m[1].length, text: m[2] }, from, i);
   continue;
  }
  if (RULE.test(line)) { i++; add({ type: 'rule' }, from, i); continue; }
  if (QUOTE.test(line)) {
   const body = [];
   for (; i < n && QUOTE.test(lines[i]); i++) body.push(lines[i].replace(QUOTE, ''));
   add({ type: 'quote', lines: body }, from, i);
   continue;
  }
  if (LIST_ITEM.test(line)) {
   const [block, next] = parseList(lines, i);
   i = next;
   add(block, from, i);
   continue;
  }
  if (isTable(lines, i)) {
   const head = cells(lines[i]);
   const align = cells(lines[i + 1]).map(c => c.endsWith(':') ? (c.startsWith(':') ? 'center' : 'right') : '');
   const rows = [];
   for (i += 2; i < n && lines[i].includes('|') && lines[i].trim(); i++) rows.push(cells(lines[i]));
   add({ type: 'table', head, align, rows }, from, i);
   continue;
  }
  const para = [line.trim()];
  let setext = 0;
  for (i++; i < n; i++) {
   const next = lines[i];
   if (!next.trim()) break;
   const s = next.match(SETEXT);
   if (s && para.length === 1 && (s[1][0] === '=' ? para[0].length <= PSEUDO_HEADING_MAX : para[0].length <= SETEXT_MAX && !/[.!?,;:]$/.test(para[0]))) {
    setext = s[1][0] === '=' ? 1 : 2;
    i++;
    break;
   }
   if (startsBlock(lines, i)) break;
   para.push(next.trim());
  }
  if (setext) { add({ type: 'heading', level: setext, text: para[0] }, from, i); continue; }
  if (top) {
   if (BOLD_LINE.test(para[0]) && para[0].length <= PSEUDO_HEADING_MAX && from !== openLine) {
    add({ type: 'heading', level: 4, text: para.shift(), pseudo: true }, from, from + 1);
    if (!para.length) continue;
   }
   const parts = para.length === 1 && i - 1 !== openLine && flowParts(para[0]);
   if (parts) { add({ type: 'flow', parts }, i - 1, i); continue; }
  }
  add({ type: 'para', lines: para }, i - para.length, i);
 }
 return blocks;
}

function renderAll(blocks, state, live) {
 return blocks.map((block, k) => render(block, state, live && k === blocks.length - 1, false)).join('');
}

function renderCode(block, state, live) {
 const lang = block.lang, t = tone(state.tone || state.tones[0]);
 const kind = DIAGRAM_KINDS[lang] ? `${DIAGRAM_KINDS[lang]} ${block.info || ''}`.trim() : '';
 const bare = PLAIN_LANGS.has(lang) && BARE_DIAGRAM.test((block.body.split('\n').find(line => line.trim()) || '').trim());
 if (DIAGRAM_LANGS.has(lang) || kind || bare) {
  const open = !block.closed && live;
  const body = open ? block.body.split('\n').slice(0, -1).join('\n') : block.body;
  const header = (body.split('\n').find(line => line.trim()) || '').trim();
  const wide = !state.depth && (kind || (header ? DIAGRAM_HEADER.test(header) : open));
  return `<div class="md-diagram ${t}${wide ? ' md-wide' : ''}" data-static data-diagram="${escapeHtml(body)}" data-kind="${escapeHtml(kind)}" data-tone="${Math.max(0, state.heading)}"${open ? ' data-live' : ''}>`
   + `<div class="md-diagram-status">${I18n.t('diagram.building')}</div></div>`;
 }
 if (CALC_LANGS.has(lang)) {
  const open = !block.closed && live, rows = block.body.split('\n'), body = open ? rows.slice(0, -1) : rows;
  const model = calcModel(realign(body.filter(line => line.trim())).join('\n'), !open)
   || (open && rows.length === 1 && /^[ \t]*\d[\d \t]*$/.test(rows[0]) && { rows: [], cols: 1 });
  if (model) return renderCalc(model, t, block.body);
  const sheet = sheetModel(body, !open);
  if (sheet) return renderSheet(sheet, t, block.body);
  if (open && undecided(body.filter(line => line.trim()), rows[rows.length - 1])) return '<div class="md-pending" aria-hidden="true"></div>';
 }
 const first = block.body.split('\n').find(line => line.trim()) || '';
 const art = ART_LANGS.has(lang) && ART.test(first);
 const body = art ? artHtml(block.body) : Highlight.code(block.body, lang);
 const label = lang || (art ? 'diagram' : 'code');
 return `<div${classes('md-code', art && 'is-art', tone(state.tone || (art ? state.tones[0] : '')))}><div class="md-code-bar"><span class="md-code-lang">${escapeHtml(label)}</span>`
  + `<button class="md-copy" type="button" aria-label="${I18n.t('code.copy')}">${COPY_ICON}</button></div><pre><code>${body}</code></pre></div>`;
}

function calcLine(raw) {
 const line = raw.replace(/\t/g, '    ').replace(/\s+$/, '');
 let cut = line.length;
 for (let i = 0; i < line.length; i++) {
  const c = line[i], prev = line[i - 1] || '', next = line[i + 1] || '';
  const times = 'xхX'.includes(c) && !/\p{L}/u.test(prev) && !/\p{L}/u.test(next);
  if ('←⟵#('.includes(c) || (c === '<' && next === '-') || (c === '/' && next === '/') || (c === '—' && prev === ' ' && next === ' ')
   || (/\p{L}/u.test(c) && !times)) { cut = i; break; }
 }
 return { math: line.slice(0, cut).replace(/\s+$/, ''), note: line.slice(cut).replace(/^\s*(?:[←⟵#—]|<-+|\/\/)\s*/, '').trim() };
}

function calcRow(text) {
 const row = { cells: [], rules: [], note: '' };
 if (CALC_RULE.test(text.trim())) {
  row.rule = true;
  row.rules.push([text.length - text.trimStart().length, text.length]);
  return row;
 }
 for (let i = 0; i < text.length; i++) {
  const c = text[i];
  if (c === ' ') continue;
  if (/[\d.,]/.test(c)) { row.cells.push({ c: i, ch: c, type: 'd' }); continue; }
  if (c === '|' || c === '│') { row.cells.push({ c: i, type: 'bar' }); continue; }
  let j = i;
  while (j < text.length && /[─━—_‾=-]/.test(text[j])) j++;
  if (j - i >= 2) { row.rules.push([i, j]); i = j - 1; continue; }
  if (!CALC_OPS[c]) return null;
  row.cells.push({ c: i, ch: CALC_OPS[c], type: 'op' });
 }
 return row;
}

function calcModel(body, done) {
 const lines = body.split('\n').filter(line => line.trim()).map(calcLine);
 if (!lines.length || lines.length > CALC.lines || lines.some(l => !l.math.trim() || !CALC_MATH.test(l.math))) return null;
 const indent = Math.min(...lines.map(l => l.math.length - l.math.trimStart().length));
 const rows = [];
 for (const l of lines) {
  const row = calcRow(l.math.slice(indent));
  if (!row) return null;
  row.note = l.note;
  rows.push(row);
 }
 const has = type => rows.some(row => row.cells.some(cell => cell.type === type));
 const digits = rows.filter(row => row.cells.some(cell => cell.type === 'd')).length;
 const rules = rows.some(row => row.rules.length), ops = has('op'), bars = has('bar');
 const cols = Math.max(...rows.map(row => Math.max(0, ...row.cells.map(cell => cell.c + 1), ...row.rules.map(rule => rule[1]))));
 if (cols > CALC.cols || !digits) return null;
 if (done ? digits < 3 || !rules || !(ops || bars) : rows.length >= 3 && !(rules || ops || bars)) return null;
 const firstRule = rows.findIndex(row => row.rule), lastRule = rows.map(row => !!row.rule).lastIndexOf(true);
 const lone = row => row.cells.every(cell => cell.type === 'd' && !row.cells.some(other => Math.abs(other.c - cell.c) === 1));
 if (firstRule > 2 && lone(rows[0]) && rows[0].cells.length && rows.slice(1, firstRule).filter(row => row.cells.length).length >= 2) rows[0].carry = true;
 rows.forEach((row, r) => {
  if (bars || row.rule || row.carry) return;
  row.stage = firstRule < 0 || r < firstRule ? 'given' : r > lastRule && done ? 'result' : 'step';
 });
 if (bars && done) {
  const bar = Math.min(...rows.flatMap(row => row.cells.filter(cell => cell.type === 'bar').map(cell => cell.c)));
  const under = rows.findIndex(row => row.rules.some(([a]) => a > bar));
  const quotient = rows[under + 1];
  if (under >= 0 && quotient) {
   quotient.split = bar;
   quotient.stage = 'result';
  }
 }
 return { rows, cols };
}

function realign(rows) {
 const parts = rows.map(row => {
  const l = calcLine(row);
  if (CALC_RULE.test(l.math.trim())) return { rule: true, note: l.note };
  const m = l.math.match(CALC_SIMPLE);
  return m && { op: m[2], num: m[4], start: l.math.length - m[4].length, note: l.note };
 });
 if (parts.some(part => !part)) return rows;
 const nums = parts.filter(part => !part.rule);
 if (nums.length < 2 || !nums.some(part => /[.,]/.test(part.num))) return rows;
 const whole = part => { const k = part.num.search(/[.,]/); return k < 0 ? part.num.length : k; };
 if (new Set(nums.map(part => part.start + part.num.length)).size === 1 || new Set(nums.map(part => part.start + whole(part))).size === 1) return rows;
 const head = Math.max(...nums.map(whole)), tail = Math.max(...nums.map(part => part.num.length - whole(part)));
 const pad = nums.some(part => part.op) ? 2 : 0, note = part => part.note ? `  ← ${part.note}` : '';
 return parts.map(part => part.rule ? '─'.repeat(pad + head + tail) + note(part)
  : (part.op || '').padEnd(pad) + ' '.repeat(head - whole(part)) + part.num + note(part));
}

function sheetMath(line) {
 const l = calcLine(line), rest = line.slice(l.math.length);
 if (!l.math.trim() || !CALC_MATH.test(l.math) || !calcRow(l.math)) return null;
 return !l.note || CALC_MARK.test(rest) || /^\s{2}/.test(rest) ? l : null;
}

function sheetLine(raw) {
 const line = raw.replace(/\t/g, '    ').replace(/\s+$/, ''), text = line.trim();
 if (!text) return { kind: 'blank' };
 if (CALC_RULE.test(text)) return { kind: 'rule', line };
 const math = sheetMath(line);
 if (math) return /\d\s*=\s*\d/.test(math.math) ? { kind: 'pair', label: '', value: math.math.trim(), note: math.note } : { kind: 'math', line };
 const m = text.match(SHEET_LABEL);
 if (!m || !/\p{L}/u.test(m[1])) return { kind: 'text', text };
 const value = m[2], v = sheetMath(value);
 if (v && !v.math.includes('=')) return { kind: 'math', line: ' '.repeat(line.length - value.length) + value, label: m[1] };
 return { kind: 'pair', label: m[1], value: v ? v.math.trim() : value, note: v ? v.note : '' };
}

function sheetModel(body, done) {
 if (body.length > SHEET.lines) return null;
 const lines = body.map(sheetLine), items = [];
 const last = () => items[items.length - 1];
 let frag = null;
 const flush = complete => {
  if (!frag) return;
  const model = calcModel(realign(frag.rows).join('\n'), complete);
  if (model) items.push({ type: 'calc', label: frag.label, model });
  else frag.rows.forEach((row, k) => {
   const l = calcLine(row);
   if (!CALC_RULE.test(l.math.trim())) items.push({ type: 'pair', label: k ? '' : frag.label, value: l.math.trim(), note: l.note });
  });
  frag = null;
 };
 for (let i = 0; i < lines.length; i++) {
  const l = lines[i], next = lines[i + 1];
  if (l.kind === 'math') {
   if (frag && !l.label) { frag.rows.push(l.line); continue; }
   flush(true);
   frag = { label: l.label || '', rows: [l.line] };
   continue;
  }
  if (l.kind === 'rule' && frag && (!next || next.kind === 'math' && !next.label)) { frag.rows.push(l.line); continue; }
  flush(true);
  const gap = !items.length || last().type === 'gap' || last().type === 'divider';
  if (l.kind === 'blank') { if (!gap) items.push({ type: 'gap' }); continue; }
  if (l.kind === 'rule') {
   if (last()?.type === 'gap') items.pop();
   if (items.length && last().type !== 'divider') items.push({ type: 'divider' });
   continue;
  }
  const text = l.kind === 'text' ? l.text : `${l.label} ${l.value}`;
  if (text.length > SHEET.width || SHEET_CODE.test(text)) return null;
  if (l.kind === 'text') items.push({ type: 'text', text: l.text, title: gap });
  else items.push({ type: 'pair', label: l.label, value: l.value, note: l.note, total: SHEET_TOTAL.test(l.label) });
 }
 flush(done);
 while (items.length && (last().type === 'gap' || last().type === 'divider')) items.pop();
 const calcs = items.filter(item => item.type === 'calc').length;
 const exprs = items.filter(item => item.type === 'pair' && SHEET_EXPR.test(item.value)).length;
 if (!calcs && exprs < (done ? 2 : 1)) return null;
 return { items, labels: items.some(item => item.label) };
}

function undecided(settled, partial) {
 if (SHEET_CODE.test(partial)) return false;
 if (!settled.length) return true;
 const first = settled[0].trim();
 return settled.length === 1 && first.length <= 60 && !SHEET_CODE.test(first) && sheetLine(first).kind === 'text';
}

function sheetExpr(text, total) {
 const num = part => escapeHtml(part).replace(SHEET_NUM, n => `<span class="md-sheet-num">${n}</span>`);
 const ops = [...text.matchAll(SHEET_OP)];
 if (total && !ops.length) return `<span class="md-sheet-result">${num(text)}</span>`;
 const eq = total && ops[ops.length - 1][1] === '=' ? ops.length - 1 : -1;
 let html = '', at = 0;
 ops.forEach((m, k) => {
  html += `${num(text.slice(at, m.index))} <span class="md-sheet-op">${CALC_OPS[m[1]] || m[1]}</span> `;
  at = m.index + m[0].length;
 });
 const tail = num(text.slice(at));
 return html + (eq >= 0 ? `<span class="md-sheet-result">${tail}</span>` : tail);
}

function sheetTitle(text) {
 const m = text.match(/^(.+?)\s+[—–-]\s+(.+)$/);
 return m ? `${escapeHtml(m[1])}<span class="md-sheet-sub"> — ${escapeHtml(m[2])}</span>` : escapeHtml(text);
}

function renderSheet({ items, labels }, t, source) {
 let html = '';
 for (const item of items) {
  const label = `<span class="md-sheet-label">${escapeHtml(item.label || '')}</span>`;
  if (item.type === 'gap') html += '<i class="md-sheet-gap"></i>';
  else if (item.type === 'divider') html += '<i class="md-sheet-divider"></i>';
  else if (item.type === 'text') html += item.title ? `<div class="md-sheet-title">${sheetTitle(item.text)}</div>` : `<div class="md-sheet-text">${escapeHtml(item.text)}</div>`;
  else if (item.type === 'calc') html += `<div class="md-sheet-row is-calc">${label}${calcGrid(item.model)}</div>`;
  else html += `<div class="md-sheet-row${item.total ? ' is-total' : ''}">${label}<span class="md-sheet-value">${sheetExpr(item.value, item.total)}`
   + `${item.note ? `<span class="md-sheet-note">${inline(item.note)}</span>` : ''}</span></div>`;
 }
 return `<div class="md-calc md-sheet ${t}${labels ? ' has-labels' : ''}"><div class="md-sheet-grid">${html}</div>`
  + `<pre class="md-calc-source" hidden data-nowave>${escapeHtml(source)}</pre>`
  + `<button class="md-copy" type="button" aria-label="${I18n.t('code.copy')}">${COPY_ICON}</button></div>`;
}

function renderCalc(model, t, source) {
 return `<div class="md-calc ${t}" data-nowave>${calcGrid(model)}`
  + `<pre class="md-calc-source" hidden>${escapeHtml(source)}</pre>`
  + `<button class="md-copy" type="button" aria-label="${I18n.t('code.copy')}">${COPY_ICON}</button></div>`;
}

function calcGrid({ rows, cols }) {
 const heights = rows.map(row => row.rule ? 'var(--calc-rule)' : row.carry ? 'var(--calc-carry)' : 'var(--calc-row)').join(' ');
 let html = '', glow = '';
 rows.forEach((row, r) => {
  const line = r + 1, spots = [...row.cells.map(cell => cell.c), ...row.rules.map(rule => rule[1] - 1)];
  const right = Math.max(0, ...spots), stage = row.carry ? ' is-carry' : row.stage ? ` is-${row.stage}` : '';
  const lit = cell => row.stage === 'result' && cell.type === 'd' && (row.split === undefined || cell.c > row.split);
  for (const cell of row.cells) {
   const at = `grid-area:${line}/${cell.c + 1};--d:${right - cell.c}`;
   const own = row.split === undefined ? stage : lit(cell) ? ' is-result' : '';
   html += cell.type === 'bar' ? `<i class="md-calc-bar" style="${at}"></i>`
    : `<span class="md-calc-${cell.type}${own}" style="${at}">${escapeHtml(cell.ch)}</span>`;
  }
  for (const [a, b] of row.rules) html += `<i class="md-calc-rule" style="grid-area:${line}/${a + 1}/${line + 1}/${b + 1}"></i>`;
  if (row.note) html += `<span class="md-calc-note" style="grid-area:${line}/${cols + 1};--d:${right + 2}">${inline(row.note)}</span>`;
  const shown = row.cells.filter(lit).map(cell => cell.c);
  if (shown.length) glow += `<i class="md-calc-glow" style="grid-area:${line}/${Math.min(...shown) + 1}/${line + 1}/${Math.max(...shown) + 2}"></i>`;
 });
 const kinds = Array.from({ length: cols }, () => new Set());
 for (const row of rows) for (const cell of row.cells) kinds[cell.c].add(cell.type === 'd' && /[.,]/.test(cell.ch) ? 'dot' : cell.type);
 const dots = kinds.map(set => set.size === 1 && set.has('dot'));
 const template = dots.some(Boolean) ? `;grid-template-columns:${dots.map(dot => dot ? 'var(--calc-dot)' : 'var(--calc-cell)').join(' ')} auto` : '';
 return `<div class="md-calc-grid" data-nowave style="--cols:${cols};grid-template-rows:${heights}${template}">${html}${glow}</div>`;
}

function artHtml(body) {
 let out = '', last = 0;
 ART_ARROWS.lastIndex = 0;
 const lines = text => escapeHtml(text).replace(/[\u2500-\u259f]+/g, run => `<span class="art-line">${run}</span>`);
 for (let m; (m = ART_ARROWS.exec(body));) {
  out += lines(body.slice(last, m.index)) + `<span class="art-arrow">${escapeHtml(m[0])}</span>`;
  last = ART_ARROWS.lastIndex;
 }
 return out + lines(body.slice(last));
}

function renderList(block, state, live) {
 const tag = block.ordered ? 'ol' : 'ul';
 const start = block.ordered && block.start !== 1 ? ` start="${block.start}" style="counter-reset:md-ol ${block.start - 1}"` : '';
 const inner = { ...state, depth: state.depth + 1 };
 const items = block.items.map((item, k) => {
  const last = live && k === block.items.length - 1;
  const body = renderAll(parse(item.body), inner, last);
  const task = item.task === null ? '' : classes('md-task', item.task && 'is-done');
  return `<li${task}>${task ? '<span class="md-box" aria-hidden="true"></span>' : ''}${body}</li>`;
 }).join('');
 return `<${tag}${classes(state.depth ? '' : tone(state.tone))}${start}>${items}</${tag}>`;
}

function renderQuote(block, state, live) {
 const inner = { ...state, depth: state.depth + 1 };
 const m = block.lines[0].match(CALLOUT);
 if (m) {
  const kind = m[1].toLowerCase(), body = [m[2], ...block.lines.slice(1)];
  return `<blockquote class="md-callout is-${kind} t-${CALLOUTS[kind]}"><div class="md-callout-title">${I18n.t(`callout.${kind}`)}</div>${renderAll(parse(body), inner, live)}</blockquote>`;
 }
 if (state.depth) return `<blockquote>${renderAll(parse(block.lines), inner, live)}</blockquote>`;
 const lines = [...block.lines];
 const trim = () => { while (lines.length && !lines[lines.length - 1].trim()) lines.pop(); };
 trim();
 let cite = '', c;
 if (lines.length > 1 && (c = lines[lines.length - 1].match(CITE))) { cite = c[1]; lines.pop(); trim(); }
 else if (lines.length && (c = lines[lines.length - 1].match(CITE_INLINE))) { cite = c[2]; lines[lines.length - 1] = c[1]; }
 const first = lines.findIndex(line => line.trim());
 if (first >= 0) {
  const head = lines[first].trimStart(), close = QUOTE_PAIRS[head[0]], tail = lines[lines.length - 1].trimEnd();
  if (close && tail.endsWith(close) && (first < lines.length - 1 || tail.length > 1)) {
   lines[first] = head.slice(1);
   lines[lines.length - 1] = lines[lines.length - 1].trimEnd().slice(0, -1);
  }
 }
 return `<blockquote${classes('md-quote', tone(state.tone || state.tones[0]))}>${renderAll(parse(lines), inner, live && !cite)}${cite ? citeHtml(cite, live) : ''}</blockquote>`;
}

function citeHtml(text, live) {
 const at = text.search(/,\s/), name = at > 0 ? text.slice(0, at) : text, role = at > 0 ? text.slice(at + 1).trim() : '';
 return `<footer class="md-cite"><span class="md-cite-text"><span class="md-cite-name">${inline(name, live && !role)}</span>`
  + `${role ? `<span class="md-cite-role">${inline(role, live)}</span>` : ''}</span></footer>`;
}

// A table goes full width when it has many columns or when its longest cells together would not fit the text column.
function wideTable(block) {
 const columns = block.head.length, rule = WIDE_TABLE.text;
 if (columns >= WIDE_TABLE.columns) return true;
 if (columns < rule.columns) return false;
 const plain = text => (text || '').replace(/[*_`~]|\[([^\]]*)\]\([^)]*\)/g, '$1').trim().length;
 const longest = block.head.map((text, k) => Math.min(rule.cell, Math.max(plain(text), ...block.rows.map(row => plain(row[k])))));
 return longest.reduce((sum, n) => sum + n, 0) > rule.chars;
}

function renderTable(block, state, live) {
 const cell = (tag, text, k, isLive) => `<${tag}${block.align[k] ? ` style="text-align:${block.align[k]}"` : ''}>${inline(text || '', isLive)}</${tag}>`;
 const head = `<thead><tr>${block.head.map((text, k) => cell('th', text, k, live && !block.rows.length && k === block.head.length - 1)).join('')}</tr></thead>`;
 const rows = block.rows.map((row, r) => {
  const lastRow = live && r === block.rows.length - 1;
  return `<tr>${block.head.map((_, k) => cell('td', row[k], k, lastRow && k === Math.min(row.length, block.head.length) - 1)).join('')}</tr>`;
 }).join('');
 const wide = !state.depth && wideTable(block);
 return `<div${classes('md-table', wide && 'md-wide', tone(state.tone || state.tones[0]))}><table>${head}<tbody>${rows}</tbody></table></div>`;
}

function render(block, state, live) {
 const t = state.depth ? '' : tone(state.tone);
 switch (block.type) {
  case 'heading': {
   const level = Math.min(block.level, 6), own = tone(state.tone || state.tones[0]);
   return `<h${level}${classes('md-h', own, block.pseudo && 'is-pseudo')}>${inline(block.text, live)}</h${level}>`;
  }
  case 'para':
   return `<p${classes(t)}>${inline(block.lines.join('\n'), live)}</p>`;
  case 'flow': {
   const base = Math.max(0, state.heading), tones = state.tones;
   const parts = block.parts.map((part, k) => (k ? `<span class="md-arrow" style="--k:${k}" aria-hidden="true"></span>` : '')
    + `<span class="md-chip t-${tones[(base + k) % tones.length]}" style="--k:${k}">${inline(part)}</span>`);
   return `<div class="md-flow" data-nowave>${parts.join('')}</div>`;
  }
  case 'list':
   return renderList(block, state, live);
  case 'quote':
   return renderQuote(block, state, live);
  case 'code':
   return renderCode(block, state, live);
  case 'table':
   return renderTable(block, state, live);
  case 'math':
   return `<div class="md-math">${Tex.render(block.body, { display: true })}</div>`;
  case 'rule':
   return '<div class="md-gap" aria-hidden="true"></div>';
 }
 return '';
}

function blocks(text, { live = false, tones = TONES, cache = null } = {}) {
 const lines = text.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n').split('\n');
 const openLine = live ? lines.length - 1 : -1;
 if (live) holdBack(lines);
 const parsed = parse(lines, openLine, true);
 const state = { tones, heading: -1, tone: '', depth: 0 };
 const used = cache && new Map();
 const out = parsed.map((block, k) => {
  if (block.type === 'heading') {
   state.heading++;
   state.tone = tones[state.heading % tones.length];
  }
  const isLive = live && k === parsed.length - 1;
  const key = cache && !isLive ? `${block.type}\u0001${state.heading}\u0001${block.src}` : '';
  const html = (key && cache.get(key)) || render(block, state, isLive);
  if (key) used.set(key, html);
  return html;
 });
 if (cache) {
  cache.clear();
  for (const [key, html] of used) cache.set(key, html);
 }
 return out;
}

const renderText = text => blocks(text).join('');

window.Markdown = { TONES, COPY_ICON, blocks, render: renderText, inline };
})();
