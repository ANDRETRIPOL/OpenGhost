(() => {
'use strict';

const PACE = { lag: 0.28, drain: 0.14, min: 40, max: 2400, smooth: 0.1 };
const WAVE = { duration: 220, max: 90, spread: 50 };
const GROW_SETTLE = 300;
const SWAP = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const XHTML = 'http://www.w3.org/1999/xhtml';
const SPACE = /^\s+$/;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const isHigh = code => code >= 0xd800 && code < 0xdc00;
const isRun = node => node.nodeType === 3 || node.__wave === true;
const skipOverlays = node => { while (node && node.__overlay) node = node.nextSibling; return node; };
const move = (parent, node) => parent.moveBefore ? parent.moveBefore(node, null) : parent.appendChild(node);

function shuffle(list, random = Math.random) {
 const out = [...list];
 for (let i = out.length - 1; i > 0; i--) {
  const j = Math.floor(random() * (i + 1));
  [out[i], out[j]] = [out[j], out[i]];
 }
 return out;
}

function seeded(text) {
 let h = 2166136261;
 for (let i = 0; i < text.length; i += 5) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
 return () => {
  h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^= h >>> 16) >>> 0) / 4294967296;
 };
}

class StreamView {
 static render(root, source) {
  const tones = shuffle(Markdown.TONES, seeded(source));
  root.innerHTML = Markdown.blocks(source, { live: false, tones, cache: new Map() }).join('');
  if (!window.Diagram) return;
  for (const el of root.querySelectorAll('.md-diagram')) {
   el.__source = el.dataset.diagram || '';
   el.__live = false;
   el.__view = Diagram.view(el, tones, null, { instant: true });
   el.__view.update(el.__source, false);
  }
 }

 constructor(root, { onChange } = {}) {
  this.root = root;
  this.onChange = onChange;
  this.tones = shuffle(Markdown.TONES);
  this.cache = new Map();
  this.template = document.createElement('template');
  this.source = '';
  this.shown = 0;
  this.rate = 0;
  this.done = false;
  this.painted = -1;
  this.final = false;
  this.alive = [];
  this.heading = null;
  this.settling = [];
  this.raf = 0;
  this.last = 0;
  this.tick = this.tick.bind(this);
  this.finished = new Promise(resolve => { this.resolve = resolve; });
 }

 push(source) {
  this.source = source;
  this.wake();
 }

 finish() {
  this.done = true;
  this.wake();
  return this.finished;
 }

 wake() {
  if (this.raf) return;
  this.last = performance.now();
  this.raf = requestAnimationFrame(this.tick);
 }

 tick(now) {
  this.raf = 0;
  if (!this.root.isConnected) { this.resolve(); return; }
  const dt = Math.min(Math.max((now - this.last) / 1000, 0), 0.05);
  this.last = now;
  this.advance(dt);
  const end = this.source.length, count = this.cut();
  const final = this.done && count === end;
  if (count !== this.painted || final !== this.final) this.paint(count, final, now, dt);
  this.sweep(now);
  this.settle(now);
  if (count < end || this.alive.length || this.settling.length) this.raf = requestAnimationFrame(this.tick);
  else if (final) this.resolve();
 }

 advance(dt) {
  const end = this.source.length;
  if (reducedMotion()) { this.shown = end; return; }
  const backlog = end - this.shown;
  const want = Math.min(PACE.max, Math.max(PACE.min, backlog / (this.done ? PACE.drain : PACE.lag)));
  this.rate += (want - this.rate) * (1 - Math.exp(-dt / PACE.smooth));
  if (backlog > 0) this.shown = Math.min(end, this.shown + Math.max(PACE.min, this.rate) * dt);
 }

 cut() {
  const src = this.source;
  let n = Math.min(src.length, Math.floor(this.shown));
  if (n > 0 && n < src.length && isHigh(src.charCodeAt(n - 1))) n++;
  return n;
 }

 paint(count, final, now, dt) {
  this.painted = count;
  this.final = final;
  const blocks = Markdown.blocks(this.source.slice(0, count), { live: !final, tones: this.tones, cache: this.cache });
  const wave = { spans: [], animate: !reducedMotion() };
  const kids = this.root.children;
  let diagrams = false;
  for (let k = 0; k < blocks.length; k++) {
   const html = blocks[k], el = kids[k];
   if (el && el.__html === html) continue;
   const target = this.parse(html);
   const node = el ? this.patch(el, target, wave) : this.root.appendChild(this.create(target, wave));
   node.__html = html;
   if (html.includes('md-diagram')) diagrams = true;
  }
  while (kids.length > blocks.length) kids[kids.length - 1].remove();
  this.stagger(wave.spans, now, dt);
  if (diagrams && window.Diagram) {
   Diagram.prewarm();
   for (const el of this.root.querySelectorAll('.md-diagram')) {
    const source = el.dataset.diagram || '', live = el.hasAttribute('data-live');
    if (el.__source === source && el.__live === live) continue;
    el.__source = source;
    el.__live = live;
    el.__view ||= Diagram.view(el, this.tones, this.onChange);
    el.__view.update(source, live);
   }
  }
  this.track(final ? null : this.root.lastElementChild, now);
  if (this.onChange) this.onChange();
 }

 parse(html) {
  this.template.innerHTML = html;
  return this.template.content.firstElementChild;
 }

 patch(el, target, wave) {
  if (el.tagName !== target.tagName) {
   if (!SWAP.has(el.tagName) || !SWAP.has(target.tagName)) {
    const node = this.create(target, wave);
    el.replaceWith(node);
    return node;
   }
   const node = document.createElement(target.tagName);
   el.before(node);
   for (const child of [...el.childNodes]) move(node, child);
   el.remove();
   el = node;
  }
  this.attributes(el, target);
  if (target.hasAttribute('data-static')) return el;
  this.children(el, target, target.hasAttribute('data-nowave') ? { spans: wave.spans, animate: false } : wave);
  return el;
 }

 attributes(el, target) {
  for (const { name, value } of target.attributes) if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  for (const name of el.getAttributeNames()) if (name !== 'style' && !target.hasAttribute(name)) el.removeAttribute(name);
 }

 children(parent, target, wave) {
  let d = skipOverlays(parent.firstChild);
  for (let t = target.firstChild; t; t = t.nextSibling) {
   if (t.nodeType === 3) {
    const run = [];
    let have = '';
    while (d && isRun(d)) { run.push(d); have += d.textContent; d = skipOverlays(d.nextSibling); }
    this.text(parent, run, have, t.data, d, wave);
    continue;
   }
   if (t.nodeType !== 1) continue;
   while (d && isRun(d)) { const next = skipOverlays(d.nextSibling); d.remove(); d = next; }
   if (d) {
    const next = skipOverlays(d.nextSibling);
    this.patch(d, t, wave);
    d = next;
   } else {
    parent.appendChild(this.create(t, wave));
   }
  }
  while (d) { const next = skipOverlays(d.nextSibling); d.remove(); d = next; }
 }

 text(parent, run, have, want, ref, wave) {
  if (have === want) return;
  if (want.startsWith(have)) { parent.insertBefore(this.fragment(want.slice(have.length), wave), ref); return; }
  let same = 0;
  while (same < have.length && same < want.length && have.charCodeAt(same) === want.charCodeAt(same)) same++;
  if (same && isHigh(want.charCodeAt(same - 1))) same--;
  let kept = 0, k = 0;
  for (; k < run.length; k++) {
   const length = run[k].textContent.length;
   if (kept + length > same) break;
   kept += length;
  }
  for (let j = k; j < run.length; j++) run[j].remove();
  if (same > kept) parent.insertBefore(document.createTextNode(want.slice(kept, same)), ref);
  parent.insertBefore(this.fragment(want.slice(same), wave), ref);
 }

 fragment(text, wave) {
  const frag = document.createDocumentFragment();
  if (!text) return frag;
  if (!wave.animate) { frag.append(text); return frag; }
  let plain = '';
  for (const { segment } of segmenter.segment(text)) {
   if (SPACE.test(segment)) { plain += segment; continue; }
   if (plain) { frag.append(plain); plain = ''; }
   const span = document.createElement('span');
   span.className = 'md-w';
   span.__wave = true;
   span.textContent = segment;
   frag.append(span);
   wave.spans.push(span);
  }
  if (plain) frag.append(plain);
  return frag;
 }

 create(target, wave) {
  const node = document.importNode(target, true);
  if (wave.animate && !target.hasAttribute('data-nowave') && !target.hasAttribute('data-static')) this.waveTree(node, wave);
  return node;
 }

 waveTree(node, wave) {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
   acceptNode: n => n.nodeType === 3 ? NodeFilter.FILTER_ACCEPT
    : n.namespaceURI !== XHTML || n.hasAttribute('data-nowave') || n.hasAttribute('data-static') ? NodeFilter.FILTER_REJECT
    : NodeFilter.FILTER_SKIP,
  });
  const texts = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.data.trim()) texts.push(n);
  for (const text of texts) text.replaceWith(this.fragment(text.data, wave));
 }

 stagger(spans, now, dt) {
  const n = spans.length;
  if (!n) return;
  const skip = Math.max(0, n - WAVE.max), count = n - skip;
  for (let k = 0; k < skip; k++) spans[k].replaceWith(...spans[k].childNodes);
  const spread = Math.min(dt * 1000, WAVE.spread);
  for (let k = skip; k < n; k++) {
   const lead = spread * (1 - (k - skip + 1) / count);
   spans[k].style.animationDelay = `${-lead.toFixed(1)}ms`;
   this.alive.push({ el: spans[k], until: now + WAVE.duration - lead });
  }
 }

 sweep(now) {
  const alive = this.alive;
  let k = 0;
  const parents = new Set();
  while (k < alive.length && alive[k].until <= now) {
   const { el } = alive[k++];
   const parent = el.parentNode;
   if (!parent) continue;
   el.replaceWith(...el.childNodes);
   parents.add(parent);
  }
  if (!k) return;
  alive.splice(0, k);
  for (const parent of parents) parent.normalize();
 }

 track(last, now) {
  const heading = last && last.classList.contains('md-h') ? last : null;
  if (this.heading && this.heading !== heading) this.settling.push({ el: this.heading, until: now + GROW_SETTLE });
  this.heading = heading;
  if (heading && !reducedMotion()) heading.style.setProperty('--md-w', `${heading.offsetWidth}px`);
 }

 settle(now) {
  if (!this.settling.length) return;
  this.settling = this.settling.filter(({ el, until }) => {
   if (until > now) return true;
   if (el !== this.heading) el.style.removeProperty('--md-w');
   return false;
  });
 }
}

window.StreamView = StreamView;
})();
