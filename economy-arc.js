(() => {
'use strict';

// The economy menu (economy.js): from the button in the composer the window goes under the same veil as the model menu,
// and over it an arc comes up: the arc in the corner of the mini chat, turned to face the other way, made into a thick
// track with a dot at each size the chat can save down to and a white knob. The knob is dragged along it, or a dot or
// its size is pressed; the track behind it fills with a colour that warms from amber to green the further the chat
// saves. Beside the arc stand the size, what it means for this chat's model, and about how much less a long piece of
// work costs with it.
//
// The sizes on the arc are the chat model's own: none past its window, and none past a price step it has (prices.js):
// Claude Haiku 5.5 with its own key has "All" and "under 100K" only, since staying under its step is the saving.
// Above "All" stand Ghost Max and Ghost Max+, the other way: more memory, fuller summaries, for work where the agent
// must miss nothing; each only where it fits the model's window. The track fills from "All" toward the knob: down in
// amber turning green, up in violet.

// The arc, in CSS pixels: it rises straight up from its foot over the composer, and from its middle bends round to the
// right, a quarter of a circle of radius `r`, its head lying flat at the top. `straight` is the straight part, as a
// share of `r`. The track's width, the knob's (smaller than the track, a bead of glass in it); the sizes stand inside the
// bend, `label` from the track; the words begin `words` to the right of the straight part.
const ARC = { r: 150, least: 96, straight: 1, width: 26, knob: 22, label: 12, words: 104, edge: 28, top: 20 };
const OPEN = { veil: 460, draw: 620, dot: 300, dots: 220, stagger: 40, flight: 640, text: 420, textDelay: 200 };
const CLOSE = { veil: 380, veilDelay: 60, draw: 360, flight: 460, text: 200 };
const EASE = {
 motion: 'cubic-bezier(0.32, 0.72, 0, 1)',
 out: 'cubic-bezier(0.22, 1, 0.36, 1)',
 flight: 'cubic-bezier(0.5, 0, 0.18, 1)',
 in: 'cubic-bezier(0.4, 0, 1, 1)',
};
// The knob's springs, as the effort slider's: following a drag, settling on a size, the press that swells it.
const FOLLOW = [1400, 75];
const SETTLE = [320, 26];
const PRESS = [420, 30];
const PRESS_GROW = 0.1;
// Near a size the knob is drawn to it while dragged; past the ends it gives a little, as rubber.
const MAGNET = { reach: 0.45, pull: 0.5 };
const RUBBER = 0.04;
// The colours the track fills with: amber near "All", green at the far end; up from it, a light violet deepening.
const WARM = '#ffc53d', GREEN = '#30d158', VIOLET = '#c4b5fd', DEEP = '#8b5cf6';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rad = deg => deg * Math.PI / 180;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// The colour at a place of the arc, `origin` being where "All" stands: '' at it.
function tintAt(share, origin = 0) {
 if (share > origin + 0.001) {
  const a = (share - origin) / (1 - origin || 1);
  return `color-mix(in oklab, ${WARM} ${Math.round((1 - a) * 100)}%, ${GREEN})`;
 }
 if (share < origin - 0.001) {
  const g = (origin - share) / (origin || 1);
  return `color-mix(in oklab, ${VIOLET} ${Math.round((1 - g) * 100)}%, ${DEEP})`;
 }
 return '';
}

// The veil takes the theme's look (--stage-veil), as the model menu's does.
function veil() {
 const style = getComputedStyle(document.documentElement);
 const filter = style.getPropertyValue('--stage-veil').trim(), color = style.getPropertyValue('--stage-veil-bg').trim();
 const rest = filter.replace(/blur\([^)]*\)/g, 'blur(0px)').replace(/(brightness|contrast|saturate)\([^)]*\)/g, '$1(1)');
 return [{ backdropFilter: rest, backgroundColor: 'transparent' }, { backdropFilter: filter, backgroundColor: color }];
}

// 500000 → "500K", 1000000 → "1M", 1050000 → "1.05M", 97000 → "97K"; the decimal mark as the app's language writes it.
const number = (value, digits) => value.toLocaleString(I18n.lang || 'en', { maximumFractionDigits: digits });
const short = tokens => tokens >= 1000000 ? `${number(tokens / 1000000, 2)}M` : `${Math.round(tokens / 1000)}K`;
const times = value => number(value, value >= 10 ? 0 : 1);
// In the words under the arc a size is said as people say it, "100 thousand" ("100 тыс."), and as pages of text: a page
// of text is about 500 tokens.
const plain = tokens => new Intl.NumberFormat(I18n.lang || 'en', { notation: 'compact', maximumFractionDigits: 1 }).format(tokens);
const pages = tokens => number(Math.max(10, Math.round(tokens / 500 / 10) * 10), 0);

class EconomyArc {
 // `room`: where the arc may stand, when that is not the chat's whole column (the quick chat's card); `composer`: the
 // composer it stands over.
 constructor({ button, stage, chat, settings, room = null, composer = null }) {
  this.room = room;
  this.composerEl = composer;
  this.r = ARC.r;
  this.button = button;
  this.stage = stage;
  this.chat = chat;
  this.settings = settings;
  this.state = 'closed';
  this.stops = [0];
  this.at = 0;
  this.spring = { t: [0, 0], press: [0, 0] };
  this.goal = { t: 0, press: 0 };
  this.springOf = FOLLOW;
  this.raf = 0;
  this.build();
  button.addEventListener('economy-toggle', event => this.toggle(!!event.detail?.keyboard));
  window.Economy?.onChange(() => this.changed());
  this.tick = this.tick.bind(this);
  this.sync();
 }

 build() {
  this.stage.innerHTML = `
   <div class="economy-veil"></div>
   <svg class="economy-arc" aria-hidden="true"><path class="economy-track"/><path class="economy-fill"/><g class="economy-dots"></g></svg>
   <div class="economy-stops" aria-hidden="true"></div>
   <div class="economy-slider" role="slider" tabindex="0" aria-valuemin="0">
    <span class="economy-knob glass-lens"></span>
   </div>
   <div class="economy-words">
    <div class="economy-value"><span></span></div>
    <p class="economy-about"></p>
    <p class="economy-saving"></p>
   </div>`;
  const $ = selector => this.stage.querySelector(selector);
  this.veilEl = $('.economy-veil');
  this.svg = $('.economy-arc');
  this.track = $('.economy-track');
  this.fill = $('.economy-fill');
  this.dotsEl = $('.economy-dots');
  this.labelsEl = $('.economy-stops');
  this.slider = $('.economy-slider');
  this.knob = $('.economy-knob');
  // The knob is glass, as the effort slider's capsule: the track bends under it.
  if (window.LiquidGlass) new LiquidGlass(this.knob, { width: ARC.knob, height: ARC.knob });
  this.words = $('.economy-words');
  this.value = $('.economy-value');
  this.about = $('.economy-about');
  this.saving = $('.economy-saving');
  this.slider.setAttribute('aria-label', I18n.t('economy'));
  this.stage.addEventListener('pointerdown', event => this.down(event));
  this.stage.addEventListener('pointermove', event => this.move(event));
  this.stage.addEventListener('pointerup', event => this.up(event));
  this.stage.addEventListener('pointercancel', event => this.up(event));
  this.slider.addEventListener('keydown', event => this.key(event));
  this.stage.addEventListener('keydown', event => {
   if (event.key === 'Escape' || event.key === 'Enter') { event.preventDefault(); this.close(true); }
  });
  window.addEventListener('resize', () => { if (this.state === 'open') { this.layout(); this.paint(); } });
 }

 // ---- what the chat on screen has

 get conv() { return this.chat.active; }

 model() {
  const id = this.chat.modelOf(this.conv);
  return { model: this.settings.find(id), window: this.settings.windowOf(id) };
 }

 // The sizes this chat's model can save down to: none at or past where it is summarized anyway, none past its price
 // step, and the step itself in their place.
 stopsFor() {
  const E = window.Economy, { model, window: size } = this.model();
  if (!E) return [0];
  // A step is offered while staying under it leaves room above what every request carries; a size, while it leaves the
  // work its room (economy.js).
  const base = this.conv?.base || 0, full = Math.floor(size * 0.9), step = E.stepOf(model), under = E.under(step);
  const kept = step && step < full && under - base >= E.stepRoom;
  const top = kept ? under : full;
  const sizes = E.stops.filter(value => value && value < top && value >= base + E.room);
  // Ghost Max, as -1 and -2, where the level fits this model's window with what every request of this chat carries.
  const ghosts = [2, 1].filter(level => E.ghostFits(level, size, base, this.conv?.brief?.length || 0)).map(level => -level);
  return [...ghosts, 0, ...(kept ? [step] : []), ...sizes];
 }

 // Where "All" stands on the arc, as an index and as a share of it.
 get origin() { return Math.max(0, this.stops.indexOf(0)); }

 // The stop the chat stands at: its Ghost Max, or its size, or "All".
 placeOf() {
  const ghost = this.chat.ghostOf?.(this.conv) || 0;
  if (ghost) { const at = this.stops.indexOf(-ghost); return at >= 0 ? at : this.origin; }
  return this.stopOf(this.chat.economyOf(this.conv));
 }

 // The stop the chat's size stands at: the largest stop not past it.
 stopOf(value) {
  const origin = this.origin;
  if (!value || this.stops.length <= origin + 1) return origin;
  const { model, window: size } = this.model(), base = this.conv?.base || 0;
  const plan = window.Economy?.limit(model, value, size, base);
  if (!plan?.on) return origin;
  let best = origin + 1;
  for (let i = origin + 1; i < this.stops.length; i++) if (window.Economy.limit(model, this.stops[i], size, base).limit >= plan.limit) best = i;
  return best;
 }

 // Prices came, or the size changed elsewhere: an open arc takes the sizes the model now has, a closed one its button.
 changed() {
  if (this.state === 'closed') { this.sync(); return; }
  const stops = this.stopsFor();
  if (stops.join() !== this.stops.join() && !this.dragging) {
   this.stops = stops;
   this.at = this.committed = this.placeOf();
   this.goal.t = this.shareOf(this.at);
   this.place();
   this.wake();
  }
  this.describe(false);
 }

 // The button follows the chat on screen.
 sync() {
  // While the agent works the size stays as it is, as the model does (model-stage.js): a summary may be under way.
  const locked = !!this.chat.busy;
  this.button.toggleAttribute('disabled', locked);
  this.button.title = locked ? I18n.t('economy.locked') : '';
  if (locked && (this.state === 'open' || this.state === 'opening')) this.close();
  if (!this.conv) return;
  this.stops = this.stopsFor();
  const index = this.placeOf(), share = this.shareOf(index);
  this.button.setPlace?.(share, tintAt(share, this.shareOf(this.origin)), this.state === 'closed' && !this.synced);
  this.synced = true;
 }

 // ---- the arc's geometry

 layout() {
  const main = this.button.closest('.main') || document.querySelector('.main');
  const composer = this.composerEl || main?.querySelector('.composer') || main;
  const box = composer.getBoundingClientRect(), area = this.room?.() || main.getBoundingClientRect();
  // The arc stands over the composer's left part, where its button is, its foot clear of the composer and its head
  // clear of the top of the chat: in a low window it is drawn smaller. `x0` is the straight part's line, `ym` where it
  // begins to bend (its centre is `r` to the right of that), `y0` the head's height.
  const tall = box.top - ARC.edge - (area.top + ARC.top);
  this.r = Math.round(clamp((tall - ARC.width) / (1 + ARC.straight), ARC.least, ARC.r));
  this.straight = Math.round(this.r * ARC.straight);
  this.x0 = Math.round(box.left + ARC.edge + ARC.width / 2);
  this.ym = Math.round(box.top - ARC.edge - ARC.width / 2 - this.straight);
  this.y0 = this.ym - this.r;
  this.bend = Math.PI * this.r / 2;
  this.span = this.bend + this.straight;
  // In the quick chat the veil covers the card, not the screen.
  if (this.room) Object.assign(this.veilEl.style, { inset: `${area.top}px ${innerWidth - area.right}px ${innerHeight - area.bottom}px ${area.left}px`, borderRadius: '22px' });
  this.svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
  this.svg.setAttribute('width', window.innerWidth);
  this.svg.setAttribute('height', window.innerHeight);
  const d = `M${this.x0 + this.r} ${this.y0}A${this.r} ${this.r} 0 0 0 ${this.x0} ${this.ym}V${this.ym + this.straight}`;
  this.track.setAttribute('d', d);
  this.fill.setAttribute('d', d);
  this.length = this.track.getTotalLength();
  const left = Math.round(this.x0 + ARC.words);
  this.words.style.left = `${left}px`;
  this.words.style.top = `${Math.round(this.ym + this.straight * 0.45)}px`;
  const wide = Math.round(clamp(area.right - left - 20, 160, 280));
  this.words.style.width = `${wide}px`;
  // In a narrow room (the quick chat's card) the words are set smaller, the size on one line.
  this.words.classList.toggle('is-narrow', wide < 230);
  this.place();
 }

 // A point of the arc at a share of its length from its head, `inset` in from it toward the inside of the bend. Past
 // either end it goes on as the arc would: further round the bend over the head, straight down past the foot.
 point(t, inset = 0) {
  const s = t * this.span;
  if (s >= this.bend) return [this.x0 + inset, this.ym + s - this.bend];
  const a = s / this.r, r = this.r - inset;
  return [this.x0 + this.r - r * Math.sin(a), this.ym - r * Math.cos(a)];
 }

 shareOf(index) { return this.stops.length > 1 ? index / (this.stops.length - 1) : 0; }

 // The dots, and the sizes beside them inside the arc's bend.
 place() {
  this.dotsEl.innerHTML = this.stops.map((size, i) => {
   const [x, y] = this.point(this.shareOf(i));
   return `<circle class="economy-dot" data-i="${i}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3.5"/>`;
  }).join('');
  this.labelsEl.innerHTML = this.stops.map((size, i) => {
   const [x, y] = this.point(this.shareOf(i), ARC.width / 2 + ARC.label);
   const name = size < 0 ? I18n.t(size === -1 ? 'economy.max' : 'economy.maxplus') : size ? short(size) : I18n.t('economy.all');
   return `<button type="button" class="economy-stop${size < 0 ? ' is-ghost' : ''}" data-i="${i}" tabindex="-1" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px">${name}</button>`;
  }).join('');
 }

 // ---- open and close

 toggle(keyboard = false) {
  if (this.state === 'open' || this.state === 'opening') this.close(true);
  else this.open(keyboard);
 }

 open(keyboard = false) {
  if (this.state !== 'closed' || !this.conv || this.chat.busy) return;
  this.state = 'opening';
  this.stops = this.stopsFor();
  this.at = this.placeOf();
  this.committed = this.at;
  const share = this.shareOf(this.at);
  this.spring.t = [share, 0];
  this.goal.t = share;
  this.stage.showPopover();
  this.stage.classList.add('is-open');
  // In a window of glass the page takes an opaque ground meanwhile, as under the model menu, so the veil softens the
  // sidebar and the title bar too (styles.css, is-staging).
  document.documentElement.classList.add('is-staging');
  this.button.setAttribute('expanded', '');
  this.layout();
  this.describe(true);
  this.paint();
  this.slider.focus({ preventScroll: true });
  // What every request of this chat carries is counted anew: the sizes too small for it go, and the words say it.
  this.chat.baseOf?.(this.conv).then(() => { if (this.state !== 'closed') this.changed(); }).catch(() => {});
  const quick = reducedMotion();
  this.veilEl.getAnimations().forEach(a => a.cancel());
  this.veilEl.animate(veil(), { duration: quick ? 1 : OPEN.veil, easing: EASE.motion, fill: 'forwards' });
  if (quick) { this.state = 'open'; return; }
  // The track draws itself in from its start, the fill with it.
  this.track.style.strokeDasharray = `${this.length}`;
  this.track.animate([{ strokeDashoffset: this.length }, { strokeDashoffset: 0 }], { duration: OPEN.draw, easing: EASE.out, delay: 40, fill: 'backwards' });
  this.fill.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN.draw, easing: EASE.out, delay: 120, fill: 'backwards' });
  [...this.dotsEl.children].forEach((dot, i) => dot.animate([{ opacity: 0, transform: 'scale(0)' }, { opacity: 1, transform: 'scale(1)' }], { duration: OPEN.dot, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', delay: OPEN.dots + i * OPEN.stagger, fill: 'backwards' }));
  [...this.labelsEl.children].forEach((label, i) => label.animate([{ opacity: 0, filter: 'blur(4px)', transform: 'translateX(-6px)' }, { opacity: 1, filter: 'blur(0)', transform: 'none' }], { duration: OPEN.text, easing: EASE.out, delay: OPEN.dots + 60 + i * OPEN.stagger, fill: 'backwards' }));
  this.words.animate([{ opacity: 0, filter: 'blur(8px)', transform: 'translate(-10px, -50%)' }, { opacity: 1, filter: 'blur(0)', transform: 'translate(0, -50%)' }], { duration: OPEN.text, easing: EASE.out, delay: OPEN.textDelay, fill: 'backwards' });
  this.fly(true).then(() => { if (this.state === 'opening') this.state = 'open'; });
 }

 // The knob flies between the button and its place on the arc, as a model's name flies between its button and the list.
 fly(out) {
  const from = this.button.knobBox?.();
  const [x, y] = this.point(this.spring.t[0]);
  if (!from || !from.width) return Promise.resolve();
  const scale = from.width / ARC.knob, dx = from.left + from.width / 2 - x, dy = from.top + from.height / 2 - y;
  const away = `translate(${dx}px, ${dy}px) scale(${scale})`, home = 'translate(0, 0) scale(1)';
  this.button.hideKnob?.(true);
  const tint = tintAt(this.spring.t[0], this.shareOf(this.origin)) || 'rgb(var(--composer-fg-rgb))', timing = { duration: out ? OPEN.flight : CLOSE.flight, easing: EASE.flight };
  // The knob is the button's small one on its way: in that one's colour there, white on the arc.
  this.knob.animate([{ backgroundColor: out ? tint : 'transparent' }, { backgroundColor: out ? 'transparent' : tint }], timing);
  const flight = this.knob.animate([{ transform: out ? away : home }, { transform: out ? home : away }], { ...timing, composite: 'add' });
  return flight.finished.catch(() => {}).then(() => { if (out) this.button.hideKnob?.(false); });
 }

 close(focusButton = false) {
  if (this.state === 'closed' || this.state === 'closing') return;
  this.commit();
  this.state = 'closing';
  this.button.removeAttribute('expanded');
  this.dragging = null;
  const done = () => {
   if (this.state !== 'closing') return;
   this.state = 'closed';
   this.stage.classList.remove('is-open');
   if (!document.querySelector('.model-stage:popover-open')) document.documentElement.classList.remove('is-staging');
   this.veilEl.getAnimations().forEach(a => a.cancel());
   this.stage.hidePopover();
   this.button.hideKnob?.(false);
   this.sync();
   if (focusButton) this.button.focus?.({ preventScroll: true });
  };
  if (reducedMotion()) { done(); return; }
  const [rest, dim] = veil();
  this.veilEl.animate([dim, rest], { duration: CLOSE.veil, easing: EASE.motion, delay: CLOSE.veilDelay, fill: 'forwards' });
  this.track.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: -this.length }], { duration: CLOSE.draw, easing: EASE.in, fill: 'forwards' });
  this.fill.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CLOSE.draw * 0.7, easing: EASE.in, fill: 'forwards' });
  for (const el of [...this.dotsEl.children, ...this.labelsEl.children, this.words]) el.animate([{ opacity: 1 }, { opacity: 0, filter: 'blur(6px)' }], { duration: CLOSE.text, easing: 'ease-out', fill: 'forwards' });
  this.fly(false).then(() => {
   for (const el of [this.track, this.fill, ...this.dotsEl.children, ...this.labelsEl.children, this.words, this.knob]) el.getAnimations().forEach(a => a.cancel());
   done();
  });
  setTimeout(done, CLOSE.veil + CLOSE.veilDelay + 200);
 }

 // ---- the knob

 nearest(share) {
  return Math.round(clamp(share, 0, 1) * (this.stops.length - 1));
 }

 // A point of the page as a share of the arc, or null when it is far from the track.
 shareAt(x, y, loose = false) {
  // Below where it bends the arc is its straight line; above, the bend round its centre. Past the head a point counts
  // as further round, past the foot as further down, for the knob to give a little there.
  let s, off;
  if (y >= this.ym) { s = this.bend + y - this.ym; off = Math.abs(x - this.x0); }
  else {
   const dx = this.x0 + this.r - x, dy = this.ym - y;
   s = Math.atan2(dx, dy) * this.r;
   off = Math.abs(Math.hypot(dx, dy) - this.r);
  }
  if (!loose && off > ARC.width) return null;
  return s / this.span;
 }

 down(event) {
  if (event.button !== 0 || this.state === 'closing') return;
  const stop = event.target.closest('.economy-stop');
  if (stop) { event.preventDefault(); this.go(Number(stop.dataset.i)); return; }
  if (event.target.closest('.economy-words')) return;
  const share = this.shareAt(event.clientX, event.clientY);
  if (share === null) { this.close(); return; }
  event.preventDefault();
  this.stage.setPointerCapture?.(event.pointerId);
  this.dragging = { id: event.pointerId };
  this.goal.press = 1;
  this.springOf = FOLLOW;
  this.aim(share);
 }

 move(event) {
  if (!this.dragging || event.pointerId !== this.dragging.id) return;
  const share = this.shareAt(event.clientX, event.clientY, true);
  if (share !== null) this.aim(share);
 }

 up(event) {
  if (!this.dragging || event.pointerId !== this.dragging.id) return;
  this.dragging = null;
  this.goal.press = 0;
  this.go(this.nearest(this.goal.t));
 }

 // While dragged the knob follows the pointer, drawn a little to the nearest size and giving at the ends.
 aim(share) {
  const steps = this.stops.length - 1;
  let t = share;
  if (t < 0) t = -RUBBER * (1 - 1 / (1 - t * 8));
  else if (t > 1) t = 1 + RUBBER * (1 - 1 / (1 + (t - 1) * 8));
  if (steps > 0 && t >= 0 && t <= 1) {
   const near = Math.round(t * steps) / steps, off = (t - near) * steps;
   if (Math.abs(off) < MAGNET.reach) t = near + (t - near) * (1 - MAGNET.pull * (1 - Math.abs(off) / MAGNET.reach));
  }
  this.goal.t = t;
  const index = this.nearest(t);
  if (index !== this.at) { this.at = index; this.describe(false); }
  this.wake();
 }

 // The knob settles on a size, and the chat takes it.
 go(index) {
  this.at = clamp(index, 0, this.stops.length - 1);
  this.goal.t = this.shareOf(this.at);
  this.springOf = SETTLE;
  this.describe(false);
  this.commit();
  this.wake();
 }

 commit() {
  if (this.committed === this.at) return;
  this.committed = this.at;
  const value = this.stops[this.at] || 0;
  if (value < 0) this.chat.setGhost(-value);
  else this.chat.setEconomy(value);
 }

 key(event) {
  const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
  if (step) { event.preventDefault(); this.go(this.at + step); return; }
  if (event.key === 'Home') { event.preventDefault(); this.go(0); }
  if (event.key === 'End') { event.preventDefault(); this.go(this.stops.length - 1); }
 }

 wake() {
  if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.tick); }
 }

 tick(now) {
  this.raf = 0;
  const dt = Math.min(Math.max((now - this.last) / 1000, 0), 0.032);
  this.last = now;
  let moving = false;
  for (const [name, [k, c]] of [['t', this.springOf], ['press', PRESS]]) {
   const s = this.spring[name], goal = this.goal[name];
   if (reducedMotion()) { s[0] = goal; s[1] = 0; continue; }
   const steps = Math.max(1, Math.ceil(dt / 0.008)), h = dt / steps;
   for (let i = 0; i < steps; i++) { s[1] += ((goal - s[0]) * k - s[1] * c) * h; s[0] += s[1] * h; }
   if (Math.abs(goal - s[0]) > 0.0004 || Math.abs(s[1]) > 0.002) moving = true;
   else { s[0] = goal; s[1] = 0; }
  }
  this.paint();
  if (moving) this.raf = requestAnimationFrame(this.tick);
 }

 // The knob where its spring has it, the fill up to it in the colour of that place.
 paint() {
  const t = this.spring.t[0], shown = clamp(t, 0, 1);
  const [x, y] = this.point(t);
  this.knob.style.left = `${x.toFixed(2)}px`;
  this.knob.style.top = `${y.toFixed(2)}px`;
  this.knob.style.scale = String(1 + PRESS_GROW * this.spring.press[0]);
  const origin = this.shareOf(this.origin), tint = tintAt(shown, origin);
  this.stage.style.setProperty('--economy-tint', tint || 'transparent');
  // The fill runs from "All" to the knob, down or up.
  const from = Math.min(origin, shown), to = Math.max(origin, shown);
  this.fill.style.strokeDasharray = `${(this.length * (to - from)).toFixed(2)} ${this.length + 1}`;
  this.fill.style.strokeDashoffset = `${(-this.length * from).toFixed(2)}`;
  this.fill.style.visibility = to - from > 0.002 ? '' : 'hidden';
  for (const dot of this.dotsEl.children) {
   const at = this.shareOf(Number(dot.dataset.i));
   dot.classList.toggle('is-under', at >= from - 0.001 && at <= to + 0.001 && to - from > 0.002);
   // The dot the knob stands on is under it, and would show round its edge.
   dot.classList.toggle('is-covered', Math.abs(at - t) < 0.02);
  }
  for (const label of this.labelsEl.children) label.classList.toggle('is-here', Number(label.dataset.i) === this.at);
  this.slider.setAttribute('aria-valuemax', String(this.stops.length - 1));
  this.slider.setAttribute('aria-valuenow', String(this.at));
 }

 // ---- the words

 describe(first) {
  const E = window.Economy, { model, window: size } = this.model(), value = this.stops[this.at] || 0, base = this.conv?.base || 0;
  const name = model?.name || '';
  let title, about;
  const plan = E?.limit(model, Math.max(0, value), size, base);
  if (value < 0) {
   // Ghost Max: what the memory holds, and what it costs once full.
   const level = -value, g = E.ghost(level);
   title = I18n.t(level === 1 ? 'economy.ghost' : 'economy.ghostplus');
   about = I18n.t('economy.ghost.about', { chars: number(g.record, 0), pages: pages(E.recordTokens(g.record)) });
   const step = E.stepOf(model), price = E.priceOf(model)?.price, over = price?.over?.find(item => item.at === step);
   if (step && over?.in && price?.in) about += ` ${I18n.t('economy.ghost.step', { model: name, step: plain(step), times: times(over.in / price.in) })}`;
   this.swap(this.value, title, first, 'roll');
   this.swap(this.about, about, first);
   this.swap(this.saving, I18n.t('economy.ghost.cost', { extra: plain(Math.round(E.ghostExtra(level) / 1000) * 1000) }), first);
   this.slider.setAttribute('aria-valuetext', `${title}. ${about}`);
   return;
  }
  if (!value || !plan?.on) {
   title = I18n.t('economy.off');
   about = I18n.t('economy.off.about', { window: plain(size), pages: pages(size) });
  } else if (plan.by === 'step') {
   title = I18n.t('economy.under', { size: short(plan.step) });
   const price = E.priceOf(model)?.price, over = price?.over?.find(item => item.at === plan.step);
   about = over?.in && price?.in ? I18n.t('economy.step.times', { model: name, step: plain(plan.step), times: times(over.in / price.in) }) : I18n.t('economy.step', { model: name, step: plain(plan.step) });
  } else {
   title = I18n.t('economy.upto', { size: short(plan.limit) });
   about = I18n.t('economy.about', { size: plain(plan.limit), pages: pages(plan.limit) });
  }
  // What every request carries whatever is said, once it is a good part of the size.
  if (plan?.on && base >= 8000) about += ` ${I18n.t('economy.base', { base: plain(Math.round(base / 1000) * 1000) })}`;
  const saved = value ? E?.saving(model, value, size, base) : null;
  const saving = saved && saved.times >= 1.15 ? this.savingWords(saved) : '';
  this.slider.setAttribute('aria-valuetext', `${title}. ${about}${saving ? ` ${saving}` : ''}`);
  this.swap(this.value, title, first, 'roll');
  this.swap(this.about, about, first);
  this.swap(this.saving, saving, first);
 }

 // "About 1.7× less", in the words the app's language has for that number ("в 1,7 раза", "в 12 раз").
 savingWords(saved) {
  const rounded = saved.times >= 10 ? Math.round(saved.times) : Math.round(saved.times * 10) / 10;
  const base = saved.kind === 'limit' ? 'economy.saving.limit' : 'economy.saving';
  let form = 'other';
  try { form = new Intl.PluralRules(I18n.lang).select(rounded); } catch {}
  return I18n.t(I18n.has(`${base}.${form}`) ? `${base}.${form}` : base, { times: times(rounded) });
 }

 // New words come in place of the old: the size rolls, the rest fades through a blur.
 // A change already on its way is never cut off halfway: the words asked for meanwhile wait, and come in at its end.
 swap(el, text, instant, kind = 'fade') {
  const target = kind === 'roll' ? el.firstElementChild : el;
  if ((target.next ?? target.textContent) === text) return;
  if (instant || reducedMotion() || !target.textContent) {
   target.getAnimations().forEach(a => a.cancel());
   target.next = undefined;
   target.busy = false;
   target.textContent = text;
   return;
  }
  target.next = text;
  if (target.busy) return;
  target.busy = true;
  const down = kind === 'roll' && this.lastAt !== undefined && this.at < this.lastAt;
  this.lastAt = this.at;
  const away = kind === 'roll' ? { opacity: 0, transform: `translateY(${down ? 8 : -8}px)`, filter: 'blur(3px)' } : { opacity: 0, filter: 'blur(4px)' };
  const from = kind === 'roll' ? { opacity: 0, transform: `translateY(${down ? -8 : 8}px)`, filter: 'blur(3px)' } : { opacity: 0, filter: 'blur(4px)' };
  const done = () => {
   target.busy = false;
   // Asked for something else while it came in: that follows now.
   if (target.next !== undefined && target.next !== target.textContent) { const next = target.next; target.next = undefined; this.swap(el, next, false, kind); }
   else target.next = undefined;
  };
  target.animate([{ opacity: 1, transform: 'none', filter: 'blur(0)' }, away], { duration: 110, easing: EASE.in, fill: 'forwards' }).finished.then(() => {
   target.textContent = target.next ?? text;
   target.next = undefined;
   target.getAnimations().forEach(a => a.cancel());
   target.animate([from, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 240, easing: EASE.out }).finished.then(done, done);
  }, () => { target.textContent = target.next ?? text; done(); });
 }
}

window.EconomyArc = EconomyArc;
})();
