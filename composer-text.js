(() => {
'use strict';

const CHAR_DURATION = 0.22;
const RISE = 0.35;
const BLUR = 2;
const GHOST_DURATION = 240;
const GHOST_WAVE = 300;
const MAX_MANUAL_DELETE = 200;
const HOLD_HEIGHT = 150;
const LINK_IN = 420;
const LINK_BOX = { icon: 14, gap: 6, pad: 7, min: 3, size: '14px', weight: 500 };
const FIGURE = '\u2007';
const THIN = '\u202f';
const JOINER = '\u2060';
const QUOTE_MAX = 6000;
const LINK_OUT = { duration: 260, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)', fill: 'forwards' };
const MANUAL_DELETE = /^delete(Content|Word|SoftLine|HardLine)(Backward|Forward)$/;
const TYPED_URL = /(?:^|\s)((?:https?:\/\/|www\.)\S+)$/i;

const escapeHtml = text => text.replace(/[&<>]/g, c => c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;');
const escapeAttr = text => escapeHtml(text).replace(/"/g, '&quot;');
const easeOut = t => 1 - (1 - t) ** 3;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isHighSurrogate = code => code >= 0xd800 && code < 0xdc00;

class ComposerText {
 constructor(input, mirror) {
  this.input = input;
  this.mirror = mirror;
  this.lines = mirror.querySelector('.composer-mirror-lines');
  this.ghosts = input.parentElement.querySelector('.composer-ghosts');
  this.value = input.value;
  this.paraStarts = [0];
  this.seg = null;
  this.wave = null;
  this.pending = null;
  this.viewHeight = input.clientHeight;
  this.holdTimer = 0;
  this.clearingTimer = 0;
  this.raf = 0;
  this.links = [];
  this.known = new Map();
  this.removed = [];
  this.incoming = null;
  this.ruler = null;
  this.caret = null;
  this.quotes = 0;
  this.tick = this.tick.bind(this);
  this.selection = () => this.onSelection();
  input.addEventListener('beforeinput', e => this.onBeforeInput(e));
  input.addEventListener('input', () => this.onInput());
  input.addEventListener('scroll', () => this.onScroll());
  input.addEventListener('paste', e => this.onPaste(e));
  input.addEventListener('copy', e => this.onCopy(e, false));
  input.addEventListener('cut', e => this.onCopy(e, true));
  document.addEventListener('selectionchange', this.selection);
  new ResizeObserver(() => { this.viewHeight = input.clientHeight; }).observe(input);
  this.refresh();
 }

 refresh() {
  this.value = this.input.value;
  this.seg = null;
  this.links = this.recall(0, this.value.length, []);
  this.index();
  this.renderAll(performance.now());
 }

 text(from = 0, to = this.value.length) {
  let out = '', at = from;
  for (const link of this.links) {
   if (link.to <= at || link.from >= to) continue;
   out += this.value.slice(at, link.from) + link.url;
   at = link.to;
  }
  return out + this.value.slice(at, Math.max(at, to));
 }

 onBeforeInput(e) {
  const input = this.input, start = input.selectionStart, end = input.selectionEnd, type = e.inputType;
  this.pending = { type, collapsed: start === end, start, end };
  if (start !== end || this.incoming) return;
  const link = /^delete(Content|Word)Backward$/.test(type) ? this.links.find(l => l.to === start)
   : /^delete(Content|Word)Forward$/.test(type) ? this.links.find(l => l.from === start) : null;
  if (link) {
   e.preventDefault();
   this.pending = null;
   this.removeLink(link);
   return;
  }
  if (type !== 'insertText' || e.data !== ' ') return;
  const m = input.value.slice(0, start).match(TYPED_URL);
  if (!m || !LinkChip.find(m[1]).length) return;
  e.preventDefault();
  this.pending = null;
  this.insertLinks(`${m[1]} `, start - m[1].length, start);
 }

 onPaste(e) {
  const text = e.clipboardData?.getData('text/plain');
  if (!text || !LinkChip.find(text).length) return;
  e.preventDefault();
  this.insertLinks(text.replace(/\r\n?/g, '\n'), this.input.selectionStart, this.input.selectionEnd);
 }

 measure(text, weight, size) {
  const style = getComputedStyle(this.input);
  this.ruler ||= document.createElement('canvas').getContext('2d');
  this.ruler.font = `${style.fontStyle} ${weight || style.fontWeight} ${size || style.fontSize} ${style.fontFamily}`;
  return this.ruler.measureText(text).width;
 }

 destroy() {
  document.removeEventListener('selectionchange', this.selection);
  cancelAnimationFrame(this.raf);
 }

 // Every quote has the same label, so a unique run of zero-width joiners keeps its piece distinct for undo and paste.
 token(url, label = LinkChip.label(url), kind = 'link') {
  const wide = this.measure(FIGURE), thin = this.measure(THIN) || wide;
  const body = LINK_BOX.icon + LINK_BOX.gap + this.measure(label, LINK_BOX.weight, LINK_BOX.size), want = body + LINK_BOX.pad * 2;
  const wides = Math.max(LINK_BOX.min, Math.floor(want / wide)), thins = Math.max(0, Math.ceil((want - wides * wide) / thin));
  const tag = kind === 'quote' ? JOINER.repeat(++this.quotes) : '';
  return { piece: FIGURE.repeat(wides) + THIN.repeat(thins) + tag, url: kind === 'quote' ? url : LinkChip.href(url), label, kind, pad: (wides * wide + thins * thin - body) / 2 };
 }

 insertQuote(text) {
  const quote = text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, QUOTE_MAX);
  if (!quote) return;
  const token = this.token(`\n${quote.split('\n').map(line => `> ${line}`.trimEnd()).join('\n')}\n\n`, I18n.t('quote.chip'), 'quote');
  this.known.set(token.piece, token);
  let at = 0;
  for (const link of this.links) if (link.kind === 'quote' && link.from === at) at = link.to + (this.value[link.to] === ' ' ? 1 : 0);
  const input = this.input;
  input.focus({ preventScroll: true });
  input.setSelectionRange(at, at);
  this.incoming = [{ ...token, offset: 0 }];
  document.execCommand('insertText', false, `${token.piece} `);
  this.incoming = null;
  input.setSelectionRange(input.value.length, input.value.length);
 }

 insertLinks(text, from, to) {
  const tokens = [];
  let out = '', last = 0;
  for (const { index, url } of LinkChip.find(text)) {
   out += text.slice(last, index);
   const token = this.token(url);
   tokens.push({ ...token, offset: out.length });
   this.known.set(token.piece, token);
   out += token.piece;
   last = index + url.length;
  }
  out += text.slice(last);
  if (last === text.length && to === this.input.value.length) out += ' ';
  this.input.setSelectionRange(from, to);
  this.incoming = tokens;
  document.execCommand('insertText', false, out);
  this.incoming = null;
 }

 removeLink(link) {
  this.holdHeight();
  this.ghostLink(link);
  const field = this.input.parentElement;
  field.classList.add('is-clearing');
  clearTimeout(this.clearingTimer);
  this.clearingTimer = setTimeout(() => field.classList.remove('is-clearing'), LINK_OUT.duration);
  this.input.setSelectionRange(link.from, link.to);
  document.execCommand('delete');
 }

 ghostLink(link) {
  const span = this.lines.querySelector(`.composer-link[data-from="${link.from}"]`);
  if (!span || reducedMotion()) return;
  const box = this.ghosts.getBoundingClientRect(), rect = span.getBoundingClientRect(), ghost = span.cloneNode(true);
  ghost.classList.remove('is-new');
  ghost.classList.add('composer-link-ghost');
  ghost.style.animationDelay = '';
  ghost.style.left = `${rect.left - box.left}px`;
  ghost.style.top = `${rect.top - box.top}px`;
  this.ghosts.append(ghost);
  ghost.animate([{ opacity: 1, transform: 'none', filter: 'blur(0px)' }, { opacity: 0, transform: 'scale(0.8)', filter: 'blur(2px)' }], LINK_OUT)
   .finished.then(() => ghost.remove());
 }

 onCopy(e, cut) {
  const { selectionStart: from, selectionEnd: to } = this.input;
  if (from === to || !this.links.some(link => link.from < to && link.to > from)) return;
  e.preventDefault();
  e.clipboardData.setData('text/plain', this.text(from, to));
  if (cut) document.execCommand('delete');
 }

 onSelection() {
  const input = this.input;
  if (document.activeElement !== input) return;
  const prev = this.caret, s = input.selectionStart, t = input.selectionEnd, dir = input.selectionDirection;
  this.caret = { s, t };
  const inside = p => this.links.find(link => p > link.from && p < link.to);
  let ns = s, nt = t;
  if (s === t) {
   const link = inside(s);
   if (link) {
    const was = prev && prev.s === prev.t ? prev.s : -1;
    ns = nt = was === link.from ? link.to : was === link.to ? link.from : s - link.from < link.to - s ? link.from : link.to;
   }
  } else {
   const a = inside(s), b = inside(t);
   if (a) ns = dir === 'backward' && prev && s > prev.s ? a.to : a.from;
   if (b) nt = dir !== 'backward' && prev && t < prev.t ? b.from : b.to;
  }
  if (ns === s && nt === t) return;
  input.setSelectionRange(ns, nt, dir);
  this.caret = { s: ns, t: nt };
 }

 editRange(pending, old, next) {
  if (!pending) return null;
  const deleting = pending.type.startsWith('delete') && pending.collapsed;
  const removed = deleting ? old.length - next.length : pending.end - pending.start;
  const at = deleting && pending.type.endsWith('Backward') ? pending.start - removed : pending.start;
  const inserted = next.length - old.length + removed;
  if (at < 0 || removed < 0 || inserted < 0) return null;
  if (old.slice(0, at) !== next.slice(0, at) || old.slice(at + removed) !== next.slice(at + inserted)) return null;
  return { at, removed, inserted };
 }

 shiftLinks({ at, removed, inserted }, now) {
  const delta = inserted - removed, links = [];
  for (const link of this.links) {
   if (link.to <= at) links.push(link);
   else if (link.from >= at + removed) links.push({ ...link, from: link.from + delta, to: link.to + delta });
   else this.removed.push(link);
  }
  this.removed.splice(0, this.removed.length - 50);
  if (this.incoming) for (const t of this.incoming) links.push({ ...t, from: at + t.offset, to: at + t.offset + t.piece.length, born: now });
  else if (inserted > 2) links.push(...this.recall(at, at + inserted, links));
  this.links = links.sort((a, b) => a.from - b.from);
 }

 recall(from, to, links) {
  const found = [], text = this.value.slice(from, to);
  const pieces = [...new Set([...this.removed.map(link => link.piece), ...this.known.keys()])].sort((a, b) => b.length - a.length);
  for (const piece of pieces) {
   for (let k = text.indexOf(piece); k >= 0; k = text.indexOf(piece, k + piece.length)) {
    const a = from + k, b = a + piece.length;
    if ([...links, ...found].some(link => link.from < b && link.to > a)) continue;
    const back = this.removed.findLastIndex(link => link.piece === piece);
    const source = back >= 0 ? this.removed.splice(back, 1)[0] : this.known.get(piece);
    found.push({ ...source, from: a, to: b, born: 0 });
   }
  }
  return found;
 }

 onScroll() {
  this.mirror.scrollTop = this.input.scrollTop;
 }

 onInput() {
  const pending = this.pending;
  this.pending = null;
  const now = performance.now(), old = this.value, next = this.input.value;
  if (old === next) return;
  const min = Math.min(old.length, next.length);
  let at = 0;
  while (at < min && old.charCodeAt(at) === next.charCodeAt(at)) at++;
  let tail = 0;
  while (tail < min - at && old.charCodeAt(old.length - 1 - tail) === next.charCodeAt(next.length - 1 - tail)) tail++;
  const removed = old.length - at - tail, inserted = next.length - at - tail;
  const animate = pending !== null && !reducedMotion();
  const typed = animate && pending.type === 'insertText' && inserted > 0 && inserted <= 2;
  const erased = animate && !inserted && pending.collapsed && MANUAL_DELETE.test(pending.type) && removed <= MAX_MANUAL_DELETE;
  if (erased) {
   this.holdHeight();
   this.spawnGhosts(old, at, at + removed);
  }
  const first = this.paraAt(at), oldLast = this.paraAt(at + removed);
  this.value = next;
  this.shiftLinks(this.editRange(pending, old, next) || { at, removed, inserted }, now);
  const full = this.applyEdit(at, removed, inserted, now, typed);
  this.index();
  if (full) this.renderAll(now);
  else this.replaceParagraphs(first, oldLast, this.paraAt(at + inserted), now);
  this.wake();
 }

 applyEdit(at, removed, inserted, now, typed) {
  const seg = this.seg;
  if (seg) {
   const end = seg.from + seg.starts.length;
   if (typed && !removed && at === end) { this.extend(inserted, now); return false; }
   if (!inserted && at >= end) return false;
   if (!inserted && at >= seg.from && at + removed === end) {
    seg.starts.length -= removed;
    if (!seg.starts.length) this.seg = null;
    return false;
   }
   if (!inserted && at + removed <= seg.from) {
    seg.from -= removed;
    if (this.wave) { this.wave.a -= removed; this.wave.b -= removed; this.wave.end -= removed; }
    return false;
   }
   this.seg = null;
   if (!typed) return true;
  }
  if (typed) {
   this.seg = { from: at, starts: [] };
   this.extend(inserted, now);
  }
  return !!seg;
 }

 extend(count, now) {
  const seg = this.seg;
  const t0 = Math.max(now / 1000, seg.starts.length ? seg.starts[seg.starts.length - 1] : 0);
  for (let i = 0; i < count; i++) seg.starts.push(t0);
 }

 index() {
  const starts = [0];
  for (let i = this.value.indexOf('\n'); i !== -1; i = this.value.indexOf('\n', i + 1)) starts.push(i + 1);
  this.paraStarts = starts;
 }

 paraEnd(i) {
  return i + 1 < this.paraStarts.length ? this.paraStarts[i + 1] - 1 : this.value.length;
 }

 paraAt(index) {
  const starts = this.paraStarts;
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= index) lo = mid; else hi = mid - 1; }
  return lo;
 }

 currentWave(now) {
  const seg = this.seg;
  if (!seg) return null;
  const t = now / 1000, s = seg.starts, n = s.length;
  let lo = 0, hi = n;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (t - s[mid] >= CHAR_DURATION) lo = mid + 1; else hi = mid; }
  if (lo >= n) { this.seg = null; return null; }
  const a = lo;
  hi = n;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid] <= t) lo = mid + 1; else hi = mid; }
  return { a: seg.from + a, b: seg.from + lo, end: seg.from + n, t };
 }

 paragraphHtml(i, w) {
  const start = this.paraStarts[i], end = this.paraEnd(i);
  if (start === end) return '<div>\u200b</div>';
  let html = '', at = start;
  for (const link of this.links) {
   if (link.from < start || link.to > end) continue;
   html += this.rangeHtml(at, link.from, w) + this.linkHtml(link, w);
   at = link.to;
  }
  return `<div>${html}${this.rangeHtml(at, end, w)}</div>`;
 }

 linkHtml(link, w) {
  const age = performance.now() - link.born, fresh = link.born && age < LINK_IN && !reducedMotion();
  const style = `--pad:${link.pad.toFixed(2)}px${fresh ? `;animation-delay:${-Math.round(age)}ms` : ''}`;
  const icon = link.kind === 'quote' ? `<span class="composer-quote-icon">${Glyphs.quote}</span>` : `<span class="link-chip-icon" data-host="${escapeAttr(LinkChip.host(link.url))}"></span>`;
  return `<span class="composer-link${link.kind === 'quote' ? ' is-quote' : ''}${fresh ? ' is-new' : ''}" data-from="${link.from}" data-label="${escapeAttr(link.label)}" style="${style}">`
   + `${icon}${this.rangeHtml(link.from, link.to, w)}</span>`;
 }

 rangeHtml(start, end, w) {
  if (start >= end) return '';
  if (!w || w.end <= start || w.a >= end) return escapeHtml(this.value.slice(start, end));
  let html = '';
  const plain = (x, y) => { if (x < y) html += escapeHtml(this.value.slice(x, y)); };
  plain(start, Math.min(end, w.a));
  for (let i2 = Math.max(start, w.a), stop = Math.min(end, w.b); i2 < stop; i2++) {
   const width = isHighSurrogate(this.value.charCodeAt(i2)) && i2 + 1 < end ? 2 : 1;
   const p = easeOut(Math.min(1, Math.max(0, (w.t - this.seg.starts[i2 - this.seg.from]) / CHAR_DURATION)));
   html += `<span class="composer-wave" style="opacity:${p.toFixed(3)};top:${((1 - p) * RISE).toFixed(3)}em;filter:blur(${((1 - p) * BLUR).toFixed(2)}px)">${escapeHtml(this.value.slice(i2, i2 + width))}</span>`;
   i2 += width - 1;
  }
  const ha = Math.max(start, w.b), hb = Math.min(end, w.end);
  if (ha < hb) html += `<span class="composer-hidden">${escapeHtml(this.value.slice(ha, hb))}</span>`;
  plain(Math.max(start, w.end), end);
  return html;
 }

 renderAll(now) {
  const w = this.currentWave(now);
  let html = '';
  for (let i = 0; i < this.paraStarts.length; i++) html += this.paragraphHtml(i, w);
  this.lines.innerHTML = html;
  this.wave = w;
  this.mirror.scrollTop = this.input.scrollTop;
 }

 replaceParagraphs(first, oldLast, newLast, now) {
  const w = this.currentWave(now), kids = this.lines.children;
  let html = '';
  for (let i = first; i <= newLast; i++) html += this.paragraphHtml(i, w);
  const template = document.createElement('template');
  template.innerHTML = html;
  const ref = kids[oldLast + 1] || null;
  for (let i = Math.min(oldLast, kids.length - 1); i >= first; i--) kids[i].remove();
  this.lines.insertBefore(template.content, ref);
  this.wave = w;
  this.mirror.scrollTop = this.input.scrollTop;
 }

 renderFrame(now) {
  const prev = this.wave, w = this.currentWave(now);
  this.wave = w;
  const from = Math.min(prev ? prev.a : Infinity, w ? w.a : Infinity);
  const to = Math.max(prev ? prev.end : -Infinity, w ? w.end : -Infinity);
  if (from > to) return;
  const first = this.paraAt(from), last = this.paraAt(Math.min(this.value.length, to));
  for (let i = first; i <= last; i++) {
   const el = this.lines.children[i];
   if (el) el.outerHTML = this.paragraphHtml(i, w);
  }
 }

 charNode(index) {
  const i = this.paraAt(index), el = this.lines.children[i];
  if (!el || index >= this.paraEnd(i)) return null;
  let local = index - this.paraStarts[i];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
   if (local < node.length) return { node, offset: local };
   local -= node.length;
  }
  return null;
 }

 holdHeight() {
  const input = this.input;
  clearTimeout(this.holdTimer);
  if (input.clientHeight < this.viewHeight) input.style.minHeight = `${this.viewHeight}px`;
  this.holdTimer = setTimeout(() => { input.style.minHeight = ''; }, HOLD_HEIGHT);
 }

 firstVisibleIndex(viewTop) {
  const kids = this.lines.children;
  let lo = 0, hi = kids.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1, el = kids[mid]; if (el.offsetTop + el.offsetHeight <= viewTop) lo = mid + 1; else hi = mid; }
  return this.paraStarts[lo] || 0;
 }

 spawnGhosts(old, from, to) {
  const box = this.ghosts.getBoundingClientRect();
  const range = document.createRange(), ghosts = [];
  for (let i = Math.max(from, this.firstVisibleIndex(this.mirror.scrollTop)); i < to; i++) {
   const ch = old[i];
   if (ch === '\n' || ch === ' ' || ch === '\t') continue;
   if (this.wave && i >= this.wave.b && i < this.wave.end) continue;
   const pos = this.charNode(i);
   if (!pos) continue;
   const width = isHighSurrogate(old.charCodeAt(i)) ? 2 : 1;
   range.setStart(pos.node, pos.offset);
   range.setEnd(pos.node, Math.min(pos.node.length, pos.offset + width));
   const r = range.getBoundingClientRect(), top = r.top - box.top;
   if (top > this.viewHeight) break;
   if (top + r.height >= 0 && r.width) ghosts.push({ text: old.slice(i, i + width), left: r.left - box.left, top });
   i += width - 1;
  }
  if (!ghosts.length) return;
  const n = ghosts.length, stagger = n > 1 ? Math.min(12, GHOST_WAVE / n) : 0;
  const batch = document.createElement('div');
  batch.innerHTML = ghosts.map((g, k) => `<span class="composer-ghost" style="left:${g.left}px;top:${g.top}px;animation-delay:${Math.round((n - 1 - k) * stagger)}ms">${escapeHtml(g.text)}</span>`).join('');
  this.ghosts.appendChild(batch);
  const field = this.input.parentElement, total = GHOST_DURATION + n * stagger;
  field.classList.add('is-clearing');
  clearTimeout(this.clearingTimer);
  this.clearingTimer = setTimeout(() => field.classList.remove('is-clearing'), total);
  setTimeout(() => batch.remove(), total + 100);
 }

 wake() {
  if (this.raf || !this.seg) return;
  this.raf = requestAnimationFrame(this.tick);
 }

 tick(now) {
  this.raf = 0;
  if (this.seg || this.wave) this.renderFrame(now);
  if (this.seg) this.raf = requestAnimationFrame(this.tick);
 }
}

window.ComposerText = ComposerText;
})();
