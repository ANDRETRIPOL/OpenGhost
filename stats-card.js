(() => {
'use strict';

// A chat's numbers as a card in the chat, for the user only (Chat.postStats). What it spent in tokens, per model and per reply,
// how much of that the provider read from its cache, what its mini chat spent, and how full its context is. The card draws a
// snapshot taken when it was asked for, so it tells the same story whenever the chat is opened again.
const BARS = 40;
const EASE = {
 motion: 'cubic-bezier(0.32, 0.72, 0, 1)',
 out: 'cubic-bezier(0.22, 1, 0.36, 1)',
 flight: 'cubic-bezier(0.5, 0, 0.18, 1)',
 grow: 'cubic-bezier(0.34, 1.26, 0.64, 1)',
 pop: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
 fade: 'cubic-bezier(0.4, 0, 0.2, 1)',
};
// When each part of the card comes in, in ms from the moment it is asked for.
const ENTER = { room: 560, frame: 520, fade: 300, flight: 660, head: 170, count: 220, countFor: 900, grid: 280, bars: 380, spread: 460, x: 560, rows: 540, rowStep: 70, meter: 780, note: 760 };
// And how it goes, in ms from the press on its cross: the card fades as it settles back, then the chat closes its room.
const LEAVE = { fade: 260, settle: 340, scale: 0.96, roomAt: 150, room: 560 };
const ARC = { steps: 18, bend: -0.3, spin: -36 };
const CLOSE = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const compact = (n, digits = 1) => new Intl.NumberFormat(I18n.lang, { notation: 'compact', maximumFractionDigits: n < 1000 ? 0 : digits }).format(n);
// The big number keeps as many decimals as it takes to stay true to the chat: 9.6K, 860K, 1.24M.
const big = n => compact(n, n >= 1e6 ? 2 : n >= 1e5 ? 0 : 1);
const full = n => new Intl.NumberFormat(I18n.lang).format(n);
const share = (part, whole) => whole ? Math.round(part / whole * 100) : 0;
const tone = k => `var(--stats-${(k % 4) + 1})`;
const easeOut = t => 1 - (1 - t) ** 3;

// A round top for the chart and three even steps up to it: 1, 2, 2.5 or 5 times a power of ten.
function scale(max) {
 const raw = Math.max(max, 1) / 3, power = 10 ** Math.floor(Math.log10(raw));
 const step = [1, 2, 2.5, 5, 10].map(k => k * power).find(k => k >= raw - 1e-9);
 return { step, top: step * 3 };
}

// One bar per reply; a long chat groups its replies so the bars stay readable, each group coloured by the model that did most.
function columns(turns) {
 const size = Math.ceil(turns.length / BARS) || 1, out = [];
 for (let at = 0; at < turns.length; at += size) {
  const group = turns.slice(at, at + size), by = new Map();
  for (const turn of group) by.set(turn.m, (by.get(turn.m) || 0) + turn.t);
  out.push({
   first: at + 1,
   last: at + group.length,
   t: group.reduce((sum, turn) => sum + turn.t, 0),
   c: group.reduce((sum, turn) => sum + turn.c, 0),
   m: [...by].sort((a, b) => b[1] - a[1])[0][0],
  });
 }
 return out;
}

// Reply numbers under the bars: every one while they are few, otherwise about five, evenly apart.
function ticks(bars) {
 if (bars.length <= 8) return bars.map((bar, k) => k);
 const every = Math.ceil(bars.length / 5);
 const out = [];
 for (let k = 0; k < bars.length; k += every) out.push(k);
 if (bars.length - 1 - out.at(-1) >= every / 2) out.push(bars.length - 1);
 return out;
}

const replies = bar => bar.first === bar.last ? I18n.t('stats.reply', { n: bar.first }) : I18n.t('stats.replies', { from: bar.first, to: bar.last });

// One line a model: its name, what it spent, and a meter of how much of that the provider read from its cache.
function row({ name, usage, color, k = null }) {
 const spent = usage.input + usage.output;
 const detail = [I18n.t('stats.tokens', { n: full(spent) }), I18n.t(usage.requests === 1 ? 'stats.request' : 'stats.requests', { n: full(usage.requests) })].join(' · ');
 return `<div class="stats-row"${k === null ? '' : ` data-m="${k}"`} style="--c: ${color}" title="${escapeHtml(detail)}">
  <span class="stats-row-name">${escapeHtml(name)}</span>
  <span class="stats-row-value">${compact(spent)}</span>
  <span class="stats-meter"><b style="--p: ${usage.input ? usage.cached / usage.input : 0}"></b></span>
  <span class="stats-row-meta">${escapeHtml(I18n.t('stats.cache', { n: share(usage.cached, usage.input) }))}</span>
 </div>`;
}

function build(stats) {
 const item = document.createElement('div');
 item.className = 'stats-item';
 item.setAttribute('role', 'group');
 item.setAttribute('aria-label', I18n.t('stats.title'));
 const models = stats.models || [], turns = stats.turns || [];
 const spent = models.reduce((sum, model) => sum + model.input + model.output, 0) + (stats.mini ? stats.mini.input + stats.mini.output : 0);
 const context = stats.context || { used: 0, window: 0 };
 // A chat from before the count still has a real number to show: how much of its context it fills.
 const value = spent || context.used, unit = I18n.t(spent ? 'stats.total' : 'stats.inContext');
 const bars = columns(turns), { step, top } = scale(Math.max(0, ...bars.map(bar => bar.t)));
 const chart = bars.length ? `<div class="stats-chart">
   <div class="stats-y" aria-hidden="true">${[3, 2, 1].map(k => `<span>${compact(step * k)}</span>`).join('')}<span>0</span></div>
   <div class="stats-plot">
    <div class="stats-grid" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="stats-bars" style="--n: ${bars.length}">${bars.map((bar, k) => `<span class="stats-bar" data-k="${k}" data-m="${bar.m}" style="--c: ${tone(bar.m)}; --h: ${Math.max(bar.t / top, 0.012)}; --cache: ${bar.t ? bar.c / bar.t : 0}"><i></i></span>`).join('')}</div>
    <div class="stats-tip" aria-hidden="true"><b></b><span></span></div>
   </div>
   <div class="stats-x" aria-hidden="true">${ticks(bars).map(k => `<span style="--at: ${(k + 0.5) / bars.length}">${bars[k].first}</span>`).join('')}</div>
  </div>` : '';
 const rows = [
  ...models.map((model, k) => row({ name: model.name, usage: model, color: tone(k), k })),
  stats.mini ? row({ name: I18n.t('stats.mini'), usage: stats.mini, color: 'var(--stats-neutral)' }) : '',
 ].join('');
 const limit = context.window ? I18n.t('stats.of', { n: compact(context.window) }) : '';
 const note = stats.uncounted ? I18n.t(spent ? 'stats.uncounted' : 'stats.none') : '';
 item.innerHTML = `<div class="stats">
  <div class="stats-card">
   <header class="stats-head">
    <span class="stats-mark">${Glyphs.bars}</span>
    <span class="stats-title">${escapeHtml(I18n.t('stats.title'))}</span>
    <button type="button" class="stats-remove" aria-label="${escapeHtml(I18n.t('stats.remove'))}" title="${escapeHtml(I18n.t('stats.remove'))}">${CLOSE}</button>
   </header>
   <div class="stats-total"><span class="stats-value" title="${escapeHtml(I18n.t('stats.tokens', { n: full(value) }))}">${big(value)}</span><span class="stats-unit">${escapeHtml(unit)}</span></div>
   ${chart}
   <div class="stats-rows">
    ${rows}
    <div class="stats-row is-context${context.window && context.used / context.window > 0.75 ? ' is-high' : ''}">
     ${spent
      ? `<span class="stats-row-name">${escapeHtml(I18n.t('stats.context'))}</span>
     <span class="stats-row-value" title="${escapeHtml(I18n.t('stats.tokens', { n: full(context.used) }))}">${compact(context.used)}${limit ? ` <em>${escapeHtml(limit)}</em>` : ''}</span>`
      // With nothing counted the big number already tells what the context holds; this row tells what it can hold.
      : `<span class="stats-row-name">${escapeHtml(I18n.t('stats.window'))}</span>
     <span class="stats-row-value" title="${escapeHtml(I18n.t('stats.tokens', { n: full(context.window) }))}">${compact(context.window)}</span>`}
     <span class="stats-meter"><b style="--p: ${context.window ? Math.min(1, context.used / context.window) : 0}"></b></span>
     <span class="stats-row-meta">${escapeHtml(I18n.t('stats.fill', { n: share(context.used, context.window) }))}</span>
    </div>
   </div>
   ${note ? `<p class="stats-note">${escapeHtml(note)}</p>` : ''}
  </div>
 </div>`;
 item.__value = value;
 wire(item, bars);
 return item;
}

// Under the pointer a bar tells its reply, and a model's row lights up that model's bars.
function wire(item, bars) {
 const card = item.querySelector('.stats-card'), plot = item.querySelector('.stats-plot'), tip = item.querySelector('.stats-tip');
 item.querySelector('.stats-remove').addEventListener('click', () => item.dispatchEvent(new CustomEvent('stats-remove', { bubbles: true })));
 // Everything of the other models steps back.
 const focus = model => {
  for (const el of card.querySelectorAll('.stats-row[data-m], .stats-bar')) el.classList.toggle('is-dim', model != null && el.dataset.m !== model);
 };
 card.addEventListener('pointerover', event => {
  const bar = event.target.closest('.stats-bar'), keyed = event.target.closest('[data-m]');
  if (bar && plot) {
   const data = bars[Number(bar.dataset.k)], box = plot.getBoundingClientRect(), rect = bar.getBoundingClientRect();
   tip.querySelector('b').textContent = `${replies(data)} · ${compact(data.t)}`;
   tip.querySelector('span').textContent = I18n.t('stats.cache', { n: share(data.c, data.t) });
   plot.querySelector('.stats-bar.is-lit')?.classList.remove('is-lit');
   bar.classList.add('is-lit');
   plot.classList.add('is-probing');
   const half = tip.offsetWidth / 2, x = Math.min(Math.max(rect.left + rect.width / 2 - box.left, half), box.width - half);
   // The first time it shows, the tip appears in place; from bar to bar it glides.
   const jump = !tip.classList.contains('is-shown');
   if (jump) tip.style.transition = 'none';
   tip.style.translate = `${x - half}px ${Math.max(rect.top - box.top - tip.offsetHeight - 8, -tip.offsetHeight - 2)}px`;
   if (jump) {
    void tip.offsetWidth;
    tip.style.transition = '';
   }
   tip.classList.add('is-shown');
  } else if (plot) {
   plot.classList.remove('is-probing');
   plot.querySelector('.stats-bar.is-lit')?.classList.remove('is-lit');
   tip.classList.remove('is-shown');
  }
  focus(bar ? null : keyed?.dataset.m);
 });
 card.addEventListener('pointerleave', () => {
  focus(null);
  if (!plot) return;
  plot.classList.remove('is-probing');
  plot.querySelector('.stats-bar.is-lit')?.classList.remove('is-lit');
  tip.classList.remove('is-shown');
 });
}

// The glyph travels on a curve, bent to one side like the app's other flights, and changes size and colour on the way.
function fly(el, from, to, { duration, color }) {
 const box = el.offsetWidth, dx = to.x - from.x, dy = to.y - from.y;
 const c = { x: (from.x + to.x) / 2 - dy * ARC.bend, y: (from.y + to.y) / 2 + dx * ARC.bend };
 const frames = [];
 for (let i = 0; i <= ARC.steps; i++) {
  const t = i / ARC.steps, u = 1 - t;
  const x = u * u * from.x + 2 * u * t * c.x + t * t * to.x, y = u * u * from.y + 2 * u * t * c.y + t * t * to.y;
  const size = (from.size + (to.size - from.size) * t) / box;
  frames.push({ offset: t, transform: `translate(${x - box / 2}px, ${y - box / 2}px) rotate(${ARC.spin * u}deg) scale(${size})`, color: t < 0.5 ? color[0] : color[1] });
 }
 return el.animate(frames, { duration, easing: EASE.flight, fill: 'both' });
}

const center = rect => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, size: rect.width });

function later(el, keyframes, delay, duration, easing = EASE.out) {
 return el.animate(keyframes, { delay, duration, easing, fill: 'backwards' });
}

// The card comes in from what asked for it. The chat opens room at its end while its messages glide up; the card grows in
// that room, the chart glyph flies from the menu into the card's corner, and then the numbers arrive in order: the total counts
// up, the grid draws itself, the bars rise one after another, the cache meters fill.
function enter(item, { from = null, pin = () => {} } = {}) {
 pin();
 if (reducedMotion()) return;
 const frame = item.querySelector('.stats'), mark = item.querySelector('.stats-mark');
 const height = item.offsetHeight, gap = parseFloat(getComputedStyle(item.parentElement).rowGap) || 0;
 const target = mark.getBoundingClientRect(), box = frame.getBoundingClientRect();
 frame.style.transformOrigin = `${target.left + target.width / 2 - box.left}px ${target.top + target.height / 2 - box.top}px`;
 item.style.overflow = 'clip';
 const room = item.animate([{ height: '0px', marginTop: `${-gap}px` }, { height: `${height}px`, marginTop: '0px' }], { duration: ENTER.room, easing: EASE.motion });
 room.finished.then(() => { item.style.overflow = ''; }, () => { item.style.overflow = ''; });
 frame.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ENTER.fade, easing: 'ease-out' });
 frame.animate([{ transform: 'scale(0.9)' }, { transform: 'none' }], { duration: ENTER.frame + 180, easing: EASE.grow });

 if (from) {
  const flyer = document.createElement('div');
  flyer.className = 'stats-flyer';
  flyer.setAttribute('popover', 'manual');
  flyer.innerHTML = Glyphs.bars;
  document.body.append(flyer);
  flyer.showPopover();
  mark.style.opacity = '0';
  const color = [from.color || getComputedStyle(mark).color, getComputedStyle(mark).color];
  fly(flyer, from, center(target), { duration: ENTER.flight, color }).finished.then(() => {
   mark.style.opacity = '';
   mark.animate([{ transform: 'scale(1.25)' }, { transform: 'none' }], { duration: 420, easing: EASE.pop });
   flyer.remove();
  }, () => { mark.style.opacity = ''; flyer.remove(); });
 } else {
  later(mark, [{ opacity: 0, transform: 'scale(0.5)' }, { opacity: 1, transform: 'none' }], ENTER.head, 420, EASE.pop);
 }
 later(item.querySelector('.stats-title'), [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], ENTER.head, 380);
 count(item.querySelector('.stats-value'), item.__value);
 later(item.querySelector('.stats-unit'), [{ opacity: 0, transform: 'translateX(-4px)' }, { opacity: 1, transform: 'none' }], ENTER.count + 60, 420);
 item.querySelectorAll('.stats-grid i').forEach((line, k) => later(line, [{ transform: 'scaleX(0)' }, { transform: 'none' }], ENTER.grid + k * 40, 520, EASE.motion));
 const axis = item.querySelector('.stats-y');
 if (axis) later(axis, [{ opacity: 0 }, { opacity: 1 }], ENTER.grid + 80, 360);
 const bars = [...item.querySelectorAll('.stats-bar')], step = Math.min(26, ENTER.spread / Math.max(1, bars.length));
 bars.forEach((bar, k) => later(bar, [{ transform: 'scaleY(0)' }, { transform: 'none' }], ENTER.bars + k * step, 560, EASE.grow));
 const x = item.querySelector('.stats-x');
 if (x) later(x, [{ opacity: 0 }, { opacity: 1 }], ENTER.x, 400);
 item.querySelectorAll('.stats-row').forEach((line, k) => {
  const at = ENTER.rows + k * ENTER.rowStep;
  later(line, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], at, 460);
  const meter = line.querySelector('.stats-meter b');
  if (meter) later(meter, [{ transform: 'scaleX(0)' }, { transform: 'none' }], at + 80, ENTER.meter, EASE.motion);
 });
 const note = item.querySelector('.stats-note');
 if (note) later(note, [{ opacity: 0 }, { opacity: 1 }], ENTER.note, 420);
}

// The cross takes the card away the way it came, the other way round. The card fades and settles back a little where it
// stands, and as it goes the chat closes the room it held, gliding over it in one soft move with the gap before it, so nothing
// jumps when the card is gone. The room is clipped only once the card is nearly gone: its shadow is not cut while it shows,
// and what is left of it does not hold the chat's height.
function leave(item) {
 if (!item.isConnected) return;
 if (reducedMotion()) { item.remove(); return; }
 const frame = item.querySelector('.stats'), height = item.offsetHeight;
 const gap = item.previousElementSibling || item.nextElementSibling ? parseFloat(getComputedStyle(item.parentElement).rowGap) || 0 : 0;
 item.style.pointerEvents = 'none';
 frame.style.transformOrigin = '50% 50%';
 frame.animate([{ opacity: 1 }, { opacity: 0 }], { duration: LEAVE.fade, easing: EASE.fade, fill: 'forwards' });
 frame.animate([{ transform: 'none' }, { transform: `scale(${LEAVE.scale})` }], { duration: LEAVE.settle, easing: EASE.out, fill: 'forwards' });
 const room = item.animate([{ height: `${height}px`, marginTop: '0px' }, { height: '0px', marginTop: `${-gap}px` }], { delay: LEAVE.roomAt, duration: LEAVE.room, easing: EASE.flight, fill: 'forwards' });
 setTimeout(() => { item.style.overflow = 'clip'; }, LEAVE.roomAt);
 room.finished.then(() => item.remove(), () => item.remove());
}

// The total counts up to itself. The number keeps its final width all the way, so the words after it never shift.
function count(el, value) {
 const text = el.textContent;
 el.style.minWidth = `${el.getBoundingClientRect().width}px`;
 el.textContent = big(0);
 const start = performance.now() + ENTER.count;
 const tick = now => {
  if (!el.isConnected) return;
  const t = Math.min(1, Math.max(0, (now - start) / ENTER.countFor));
  el.textContent = t < 1 ? big(Math.round(value * easeOut(t))) : text;
  if (t < 1) requestAnimationFrame(tick);
  else el.style.minWidth = '';
 };
 requestAnimationFrame(tick);
}

window.StatsCard = { build, enter, leave };
})();
