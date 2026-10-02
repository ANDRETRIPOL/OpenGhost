(() => {
'use strict';

// A dock grown out of a composer button, in the manner of the effort's stage. Its choices stand as icons in a capsule that
// grows out of the button, a glass lens rests over the one in focus, and above the capsule stands that one's name in large
// type with a line under it. The icons fly out of the button, the name's letters out of the lens; when the lens moves on, the
// old name melts away and the next comes out of the glass. Around it the app steps back softly, as around a selection.
// The composer's plus uses it for what can be added or done in a chat, the agent mode for its three modes.

// A real spring, sampled into a linear() easing: how long one swing takes and how much it bounces, 0 settling without
// overshoot. It lasts until it has settled.
function spring(response, bounce = 0) {
 const zeta = 1 - bounce, w = 2 * Math.PI / response, d = w * Math.sqrt(Math.max(0, 1 - zeta * zeta));
 const at = t => d ? 1 - Math.exp(-zeta * w * t) * (Math.cos(d * t) + zeta * w / d * Math.sin(d * t)) : 1 - Math.exp(-w * t) * (1 + w * t);
 const envelope = t => d ? Math.exp(-zeta * w * t) * Math.hypot(1, zeta * w / d) : Math.exp(-w * t) * (1 + w * t);
 let settle = 0.05;
 while (envelope(settle) > 0.002) settle += 0.01;
 const steps = 64;
 const points = Array.from({ length: steps + 1 }, (_, i) => i === steps ? 1 : +at(settle * i / steps).toFixed(4));
 return { easing: `linear(${points.join(', ')})`, duration: Math.round(settle * 1000) };
}

// An icon's place in the capsule and the lens over it; the capsule keeps PAD around its icons.
const SLOT = { width: 46, height: 38 };
const PAD = 5;
// Its edge bends only a thin band, so the icon under it is magnified whole and never drawn into the rim.
const LENS = { width: 42, height: 34, zoom: 1.1, edge: 3.5, band: 5 };
// The button gives way to the capsule, which grows out of it with a little give, and the icons fly out of it one after
// another, nearest first, on a curve bent upward, landing on a soft spring. Once they are nearly there the lens comes up
// over the icon in focus and its name comes out of the glass; the divider and the current choice's dot come in with the
// icons beside them (`mark`, after the icon's own flight has run that share).
const GROW = spring(0.62, 0.12);
const LAND = spring(0.6, 0.1);
const OPEN = { veil: 560, stagger: 50, bend: 0.3, lens: 320, lensDelay: 360, name: 360, hint: 560, mark: 0.5 };
// Closing, the name, the lens, the dot and the divider go first; the icons fly back into the button and the capsule folds
// into it, and the button comes back as the capsule reaches it (`back`, a share of the fold). The veil lifts only once the
// name has nearly gone, so its letters never stand over the bare chat.
const CLOSE = { veil: 440, veilDelay: 170, fly: 420, stagger: 34, fold: 480, foldDelay: 80, back: 0.62, home: 560, landing: 0.5, letters: 200, spacing: 8, spread: 70, lens: 180 };
// A choice made in a choosing dock stays in view a moment before the dock goes, long enough for its name to come out.
const CHOSEN = 560;
// The veil's patch: how far past the name and the capsule it keeps full strength, and over how much it then fades out.
// It grows out of the button from `bloom` of its size.
const HALO = { pad: 18, feather: 64, bloom: 0.45 };
// A name's letters leave the lens small and blurred, are tossed a little past their place and drop into it.
const FLIGHT = { duration: 680, stagger: 26, spread: 240, steps: 18, from: 0.2, swell: 1.08, spin: 20, toss: 0.38, blur: 7 };
const LEAVE = { duration: 230, stagger: 10, rise: 0.45, blur: 8 };
// The lens between icons: a spring with a little overshoot, stretched along the way by its speed, and a press when it names
// something new or something is chosen under it. It names an icon once it is nearly there (NEAR, in icons) or once the focus
// has stayed on it for STAY ms, so a pointer sweeping across the dock doesn't name every icon it passes.
const GLIDE = [260, 28];
const STRETCH = [520, 34];
const PRESS = [420, 30];
const STRETCH_PER_SPEED = 0.03;
const STRETCH_MAX = 0.28;
const PRESS_GROW = 0.1;
const KICK = { name: 8, pick: 14 };
const NEAR = 0.3;
const STAY = 90;
const REVEAL = 0.55;
const EASE = {
 motion: 'cubic-bezier(0.32, 0.72, 0, 1)',
 out: 'cubic-bezier(0.22, 1, 0.36, 1)',
 leave: 'cubic-bezier(0.4, 0, 1, 1)',
 flight: 'cubic-bezier(0.3, 0.6, 0.2, 1)',
 home: 'cubic-bezier(0.55, 0, 0.7, 0.4)',
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const quiet = animation => animation.finished.catch(() => {});
const middle = rect => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
const backOut = v => 1 + 2.2 * (v - 1) ** 3 + 1.2 * (v - 1) ** 2;
const element = (tag, className) => Object.assign(document.createElement(tag), { className });

// A letter's way out of the lens: (dx, dy) is where the lens stands as seen from the letter's place, and the path bends
// toward the side it comes from.
function flight(dx, dy, size) {
 const toss = FLIGHT.toss * size, side = Math.sign(dx) || 1, frames = [];
 const c = { x: dx * 0.3, y: -toss };
 for (let i = 0; i <= FLIGHT.steps; i++) {
  const t = i / FLIGHT.steps, u = 1 - t;
  const x = u * u * dx + 2 * u * t * c.x, y = u * u * dy + 2 * u * t * c.y;
  const grow = t < 0.75 ? FLIGHT.from + (FLIGHT.swell - FLIGHT.from) * (t / 0.75) : FLIGHT.swell + (1 - FLIGHT.swell) * ((t - 0.75) / 0.25);
  frames.push({
   offset: t,
   opacity: Math.min(1, t / 0.18),
   filter: `blur(${(FLIGHT.blur * Math.max(0, 1 - t / 0.7)).toFixed(2)}px)`,
   transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(side * FLIGHT.spin * u * u).toFixed(1)}deg) scale(${grow.toFixed(3)})`,
  });
 }
 return frames;
}

// An icon's way between the button and its place in the capsule, as seen from its place: from (dx, dy), where it is small and
// blurred, along a curve bent upward, to where it stands. `scale` is how big it is at the button's end.
function way(dx, dy, scale, fade = true) {
 const lift = Math.hypot(dx, dy) * OPEN.bend, frames = [];
 for (let i = 0; i <= 16; i++) {
  const t = i / 16, u = 1 - t;
  const x = u * u * dx + 2 * u * t * dx * 0.35, y = u * u * dy + 2 * u * t * (dy * 0.2 - lift);
  frames.push({
   offset: t,
   opacity: fade ? Math.min(1, t / 0.3) : 1,
   filter: fade ? `blur(${(6 * u * u).toFixed(2)}px)` : 'none',
   transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${(scale + (1 - scale) * t).toFixed(3)})`,
  });
 }
 return frames;
}

// The veil over the rest of the app is the one over a reply while a piece of it is selected (--veil): it softens and dims
// what is behind but keeps the background its own color. It blooms out of the button.
function veil() {
 const full = getComputedStyle(document.documentElement).getPropertyValue('--veil').trim();
 const rest = full.replace(/blur\([^)]*\)/g, 'blur(0px)').replace(/(brightness|contrast|saturate)\([^)]*\)/g, '$1(1)');
 return [{ backdropFilter: rest, transform: `scale(${HALO.bloom})` }, { backdropFilter: full, transform: 'none' }];
}

// Its edges fade along a smoothstep, like the cut-outs of that veil, so nowhere does it start at a line.
const STEPS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
const shade = t => `rgba(0, 0, 0, ${(t * t * (3 - 2 * t)).toFixed(3)})`;
const ramp = angle => `linear-gradient(${angle}, ${STEPS.map(t => `${shade(t)} ${t * HALO.feather}px`).join(', ')}, ${STEPS.map(t => `${shade(1 - t)} calc(100% - ${(1 - t) * HALO.feather}px)`).join(', ')})`;

// Animates to a look starting from the one on screen, whatever animation had it there.
function restyle(el, to, timing) {
 const style = getComputedStyle(el), start = { opacity: style.opacity, transform: style.transform, filter: style.filter };
 for (const animation of el.getAnimations()) animation.cancel();
 return el.animate([start, to], timing);
}

// A name in large type, the way the effort's stage names its level: its letters fly out of a point (a lens, a padlock) and
// settle into place, and when the next name comes the old one melts away upward. Names stack in their box while one leaves
// and the next arrives.
class StageWord {
 constructor(box) {
  this.box = box;
  this.word = null;
  this.holds = new Set();
 }

 show(text, { from = null, delay = 0, off = false } = {}) {
  this.leave();
  const word = this.word = element('span', 'stage-word');
  word.classList.toggle('is-off', off);
  for (const char of text) word.append(Object.assign(element('span', 'stage-letter'), { textContent: char }));
  this.box.append(word);
  if (reducedMotion() || !from) return;
  // Letters leave the point nearest first, so the word spills out of it toward its place.
  const size = parseFloat(getComputedStyle(this.box).fontSize);
  const letters = [...word.children].map(letter => {
   const at = middle(letter.getBoundingClientRect());
   return { letter, dx: from.x - at.x, dy: from.y - at.y };
  }).sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy));
  const step = Math.min(FLIGHT.stagger, FLIGHT.spread / Math.max(1, letters.length));
  letters.forEach(({ letter, dx, dy }, k) => {
   letter.animate(flight(dx, dy, size), { duration: FLIGHT.duration, delay: delay + k * step, easing: EASE.flight, fill: 'backwards' });
   this.hold(letter, delay + k * step);
  });
 }

 // The old name melts upward like smoke, from wherever its own flight had got to.
 leave() {
  const word = this.word;
  if (!word) return;
  this.word = null;
  if (reducedMotion()) { word.remove(); return; }
  const done = [...word.children].map((letter, k) => restyle(letter,
   { opacity: 0, transform: `translateY(${-LEAVE.rise}em) scale(1.06)`, filter: `blur(${LEAVE.blur}px)` },
   { duration: LEAVE.duration, delay: k * LEAVE.stagger, easing: EASE.leave, fill: 'forwards' }));
  Promise.all(done.map(quiet)).then(() => word.remove());
 }

 // A stage going: the letters dissolve upward, last first, a long name as quickly as a short one, so it is gone before the
 // veil behind it lifts.
 fade() {
  this.letGo();
  if (!this.word || reducedMotion()) return;
  const letters = [...this.word.children].reverse(), step = Math.min(CLOSE.spacing, CLOSE.spread / Math.max(1, letters.length));
  letters.forEach((letter, k) => restyle(letter, { opacity: 0, transform: 'translateY(-0.3em)', filter: 'blur(6px)' },
   { duration: CLOSE.letters, delay: k * step, easing: EASE.leave, fill: 'forwards' }));
 }

 clear() {
  this.letGo();
  this.box.replaceChildren();
  this.word = null;
 }

 // A letter waiting to fly stays hidden until its flight begins: an animation still waiting out its delay can leave it drawn
 // where it ends up for the first frames.
 hold(el, delay) {
  el.style.opacity = '0';
  const timer = setTimeout(() => {
   this.holds.delete(timer);
   el.style.opacity = '';
  }, delay);
  this.holds.add(timer);
 }

 letGo() {
  for (const timer of this.holds) clearTimeout(timer);
  this.holds.clear();
 }
}

// The soft patch of the selection's veil behind a stage. It covers what the stage shows and fades out around it, blooms out
// of the control the stage grew from, and lifts when the stage goes.
class StageVeil {
 constructor(el) {
  this.el = el;
  el.style.maskImage = `${ramp('90deg')}, ${ramp('180deg')}`;
 }

 // Covers the boxes (in the stage's own frame) and grows out of `origin` (a point in the same frame). A new name moves it
 // along, wider for a long one.
 fit(boxes, origin, instant = false) {
  const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const r of boxes) {
   if (!r) continue;
   box.left = Math.min(box.left, r.left);
   box.top = Math.min(box.top, r.top);
   box.right = Math.max(box.right, r.right);
   box.bottom = Math.max(box.bottom, r.bottom);
  }
  if (!Number.isFinite(box.left)) return;
  const edge = HALO.pad + HALO.feather, left = box.left - edge, top = box.top - edge, style = this.el.style;
  if (instant) style.transition = 'none';
  Object.assign(style, {
   left: `${left}px`,
   top: `${top}px`,
   width: `${box.right - box.left + edge * 2}px`,
   height: `${box.bottom - box.top + edge * 2}px`,
   transformOrigin: `${origin.x - left}px ${origin.y - top}px`,
  });
  if (!instant) return;
  void this.el.offsetWidth;
  style.transition = '';
 }

 bloom() {
  if (reducedMotion()) return this.el.animate(veil().slice(1), { duration: 0, fill: 'both' });
  return this.el.animate(veil(), { duration: OPEN.veil, easing: EASE.motion, fill: 'both' });
 }

 lift(delay = 0) {
  return this.el.animate(veil().reverse(), { duration: CLOSE.veil, delay, easing: EASE.motion, fill: 'both' });
 }
}

// Where a box stands in a frame's own coordinates.
const within = (rect, frame) => ({ left: rect.left - frame.left, top: rect.top - frame.top, right: rect.right - frame.left, bottom: rect.bottom - frame.top });

class Dock {
 // items: [{ id, glyph, name, hint, tone, group, flies }]: icons of different groups stand apart; `flies` marks one whose icon
 // leaves for somewhere else when chosen, so it doesn't fly back into the button. A choosing dock (`choice`) has one current
 // item: the lens rests on it, a dot stands under it, and its icon goes home into the button when the dock closes.
 // The button itself gives way while the dock is out: onToggle(true) is the owner's cue to let it go, onReturn to bring it
 // back as the capsule reaches it, or as the current icon lands in it.
 constructor({ button, host = document.body, anchor, label, items, choice = false, source = null, onPick = () => {}, onOpen = null, onToggle = null, onReturn = null }) {
  Object.assign(this, { button, choice, onPick, onOpen, onToggle, onReturn });
  this.source = source || (() => button);
  this.state = 'closed';
  this.items = [];
  this.current = null;
  this.focused = -1;
  this.focusedAt = 0;
  this.named = -1;
  this.slots = [];
  this.pos = 0;
  this.vel = 0;
  this.goal = 0;
  this.stretch = [0, 0];
  this.press = [0, 0];
  this.reveal = 1;
  this.revealAt = 0;
  this.raf = 0;
  this.last = 0;
  this.holds = new Set();
  this.returned = true;
  this.backTimer = 0;
  this.home = null;
  this.origin = null;
  this.tick = this.tick.bind(this);
  const panel = this.panel = element('div', 'dock');
  panel.setAttribute('popover', 'manual');
  panel.setAttribute('role', 'menu');
  panel.setAttribute('aria-label', label);
  panel.style.setProperty('position-anchor', anchor);
  panel.innerHTML = '<div class="dock-veil"></div><div class="dock-shell"></div><div class="dock-row"></div><span class="dock-lens glass-lens" aria-hidden="true"></span><div class="dock-title" aria-hidden="true"><div class="dock-word-box"></div><div class="dock-hint-box"></div></div>';
  this.veil = panel.querySelector('.dock-veil');
  this.shell = panel.querySelector('.dock-shell');
  this.row = panel.querySelector('.dock-row');
  this.lens = panel.querySelector('.dock-lens');
  this.title = panel.querySelector('.dock-title');
  this.wordBox = panel.querySelector('.dock-word-box');
  this.hintBox = panel.querySelector('.dock-hint-box');
  this.patch = new StageVeil(this.veil);
  this.words = new StageWord(this.wordBox);
  this.lens.style.width = `${LENS.width}px`;
  this.lens.style.height = `${LENS.height}px`;
  new LiquidGlass(this.lens, LENS);
  for (const item of items) this.add(item);
  if (choice) this.dot = this.row.appendChild(element('span', 'dock-dot'));
  host.append(panel);

  panel.addEventListener('pointerover', event => {
   const el = event.target.closest('.dock-item');
   if (el && this.state === 'open' && !this.choosing) this.focus(this.index(el));
  });
  // Leaving the icons, a choosing dock's lens goes back to the current one.
  this.row.addEventListener('pointerleave', () => {
   if (this.choice && this.state === 'open' && !this.choosing) this.focus(this.index(this.current));
  });
  panel.addEventListener('click', event => {
   const el = event.target.closest('.dock-item');
   if (el) this.pick(this.index(el), event.detail === 0);
  });
  panel.addEventListener('keydown', event => this.onKey(event));
  this.veil.addEventListener('pointerdown', event => {
   event.preventDefault();
   this.close();
  });
  // A press anywhere else puts the dock away; the button itself toggles it.
  this.outside = event => {
   if (this.state !== 'open') return;
   const path = event.composedPath();
   if (!path.includes(panel) && !path.includes(button)) this.close();
  };
  document.addEventListener('pointerdown', this.outside, true);
  // A window changing size moves the button out from under the stage, so the dock goes.
  this.resized = () => this.close();
  window.addEventListener('resize', this.resized);
 }

 get open() {
  return this.state === 'open';
 }

 add({ id, glyph, name, hint = '', tone = '', group = 0, flies = false }) {
  const before = this.items.at(-1), divider = before && before.group !== group ? this.row.appendChild(element('span', 'dock-divider')) : null;
  const el = element('button', 'dock-item');
  el.type = 'button';
  el.tabIndex = -1;
  el.dataset.item = id;
  if (tone) el.dataset.tone = tone;
  el.setAttribute('role', this.choice ? 'menuitemradio' : 'menuitem');
  el.innerHTML = `<span class="dock-glyph">${glyph}</span>`;
  this.row.append(el);
  const note = this.hintBox.appendChild(element('span', 'dock-hint'));
  if (tone) note.dataset.tone = tone;
  this.items.push({ id, name: '', hint: '', tone, group, flies, el, note, divider, hidden: false, disabled: false });
  this.set(id, { name, hint });
 }

 item(id) {
  return this.items.find(item => item.id === id);
 }

 index(el) {
  return this.items.findIndex(item => item.el === el || item.id === el);
 }

 // What an item says, whether it shows and whether it can be chosen. A disabled item can still take the lens, so its line
 // can tell why it waits.
 set(id, { name, hint, disabled, hidden } = {}) {
  const item = this.item(id);
  if (!item) return;
  if (name !== undefined) {
   item.name = name;
   item.el.setAttribute('aria-label', name);
  }
  if (hint !== undefined) {
   item.hint = hint;
   item.note.textContent = hint;
   if (hint) item.el.setAttribute('aria-description', hint);
   else item.el.removeAttribute('aria-description');
  }
  if (disabled !== undefined) {
   item.disabled = !!disabled;
   item.el.setAttribute('aria-disabled', String(!!disabled));
  }
  if (hidden !== undefined) {
   item.hidden = !!hidden;
   item.el.hidden = item.note.hidden = !!hidden;
  }
  // A divider stands only between two icons that show.
  let seen = false;
  for (const entry of this.items) {
   if (entry.divider) entry.divider.hidden = entry.hidden || !seen;
   seen ||= !entry.hidden;
  }
  if (this.state === 'open' && this.named === this.items.indexOf(item) && (name !== undefined || disabled !== undefined)) this.name(this.named);
 }

 // The current item of a choosing dock: its dot, and what a screen reader hears as checked.
 setCurrent(id) {
  this.current = id;
  for (const item of this.items) item.el.setAttribute('aria-checked', String(item.id === id));
  this.placeDot();
 }

 shown() {
  return this.items.filter(item => !item.hidden);
 }

 toggle(keyboard = false) {
  if (this.state === 'open') this.close({ focusButton: keyboard });
  else this.show();
 }

 show() {
  if (this.state === 'open') return;
  if (this.state === 'closing') this.finish();
  this.onOpen?.();
  const shown = this.shown();
  if (!shown.length) return;
  this.state = 'open';
  this.choosing = false;
  this.home = this.button.getBoundingClientRect();
  this.origin = this.source().getBoundingClientRect();
  this.panel.showPopover();
  this.align();
  this.measure();
  const start = this.choice && this.item(this.current) && !this.item(this.current).hidden ? this.index(this.current) : this.items.indexOf(shown.find(item => !item.disabled) || shown[0]);
  this.focused = -1;
  this.named = -1;
  this.focus(start);
  this.pos = this.goal;
  this.vel = 0;
  this.stretch = [0, 0];
  this.press = [0, 0];
  this.placeDot(true);
  this.onToggle?.(true);
  const still = reducedMotion();
  this.reveal = still ? 1 : 0;
  // Counted from the lens's own first frame, on the clock its frames keep.
  this.revealAt = -1;
  this.lens.getAnimations().forEach(animation => animation.cancel());
  // The lens is placed before its name comes out of it, and it mustn't name its icon a second time meanwhile.
  this.named = start;
  this.render();
  this.hintBox.style.setProperty('--hint-delay', `${OPEN.hint}ms`);
  this.name(start, { delay: OPEN.name, instant: true });
  if (still) {
   this.patch.bloom();
   return;
  }
  this.grow();
  this.wake();
 }

 // The first icon's place stands over the button's own glyph, so the capsule rises straight out of it.
 align() {
  this.panel.style.marginLeft = '0px';
  const anchor = this.home, from = middle(this.origin);
  const first = this.shown()[0]?.el, offset = first ? this.row.offsetLeft + first.offsetLeft + first.offsetWidth / 2 : PAD + SLOT.width / 2;
  this.panel.style.marginLeft = `${(from.x - anchor.left - offset).toFixed(1)}px`;
 }

 // Where each shown icon's middle stands in the capsule.
 measure() {
  this.slots = this.shown().map(item => this.row.offsetLeft + item.el.offsetLeft + item.el.offsetWidth / 2);
 }

 slot(index) {
  return this.shown().indexOf(this.items[index]);
 }

 x(pos) {
  const slots = this.slots, last = slots.length - 1;
  if (!slots.length) return 0;
  if (pos <= 0) return slots[0] + pos * (slots[1] - slots[0] || SLOT.width);
  if (pos >= last) return slots[last] + (pos - last) * (slots[last] - slots[last - 1] || SLOT.width);
  const i = Math.floor(pos), t = pos - i;
  return slots[i] + (slots[i + 1] - slots[i]) * t;
 }

 // The glass reads its backdrop on the device pixel grid, so a lens resting between pixels would make the refraction shimmer.
 snap(x) {
  const ratio = window.devicePixelRatio || 1, origin = this.panel.getBoundingClientRect().left;
  return Math.round((origin + x) * ratio) / ratio - origin;
 }

 placeDot(instant = false) {
  if (!this.dot) return;
  const item = this.item(this.current), shown = item && !item.hidden;
  this.dot.hidden = !shown;
  if (!shown || this.state !== 'open') return;
  const style = this.dot.style;
  if (instant) style.transition = 'none';
  style.translate = `${item.el.offsetLeft + item.el.offsetWidth / 2 - 2}px 0`;
  this.dot.classList.toggle('is-warn', item.tone === 'warn');
  if (!instant) return;
  void this.dot.offsetWidth;
  style.transition = '';
 }

 // The capsule grows out of the button, the veil blooms out of it, and the icons fly out of it to their places.
 grow() {
  const panel = this.panel.getBoundingClientRect(), button = this.home, from = middle(this.origin);
  this.shell.animate([
   { left: `${button.left - panel.left}px`, top: `${button.top - panel.top}px`, width: `${button.width}px`, height: `${button.height}px`, opacity: 0 },
   { opacity: 1, offset: 0.1 },
   { left: '0px', top: '0px', width: `${panel.width}px`, height: `${panel.height}px`, opacity: 1 },
  ], GROW);
  this.patch.bloom();
  const shown = this.shown().map(item => {
   const glyph = item.el.querySelector('.dock-glyph'), at = middle(glyph.getBoundingClientRect());
   return { item, glyph, dx: from.x - at.x, dy: from.y - at.y };
  }).sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy));
  const landed = new Map();
  shown.forEach(({ item, glyph, dx, dy }, k) => {
   const delay = 30 + k * OPEN.stagger;
   glyph.animate(way(dx, dy, 0.35), { ...LAND, delay, fill: 'backwards' });
   this.hold(glyph, delay);
   landed.set(item, delay + LAND.duration * OPEN.mark);
  });
  // A divider comes in once the icons on both sides of it are nearly in place, the dot once its icon is.
  for (const item of this.shown()) {
   if (!item.divider || item.divider.hidden) continue;
   const before = this.shown()[this.shown().indexOf(item) - 1], delay = Math.max(landed.get(item), landed.get(before) || 0);
   item.divider.animate([{ opacity: 0, transform: 'scaleY(0.2)' }, { opacity: 1, transform: 'none' }], { duration: 460, delay, easing: EASE.out, fill: 'backwards' });
   this.hold(item.divider, delay);
  }
  const current = this.item(this.current);
  if (this.dot && current && landed.has(current)) {
   const delay = landed.get(current);
   this.dot.animate([{ opacity: 0, scale: 0 }, { opacity: 1, scale: 1.4, offset: 0.55 }, { opacity: 1, scale: 1 }], { duration: 520, delay, easing: EASE.out, fill: 'backwards' });
   this.hold(this.dot, delay);
  }
 }

 focus(index) {
  const item = this.items[index];
  if (!item || item.hidden) return;
  if (index !== this.focused) {
   this.focused = index;
   for (const entry of this.items) {
    entry.el.tabIndex = entry === item ? 0 : -1;
    entry.el.classList.toggle('is-focus', entry === item);
   }
   this.goal = this.slot(index);
   this.focusedAt = performance.now();
   this.wake();
  }
  if (document.activeElement !== item.el) item.el.focus({ preventScroll: true });
 }

 onKey(event) {
  if (event.key === 'Escape' || event.key === 'Tab') {
   event.preventDefault();
   event.stopPropagation();
   this.close({ focusButton: true });
   return;
  }
  if (this.state !== 'open' || this.choosing) return;
  const shown = this.shown(), k = shown.indexOf(this.items[this.focused]);
  const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
  const to = step ? (k + step + shown.length) % shown.length : { Home: 0, End: shown.length - 1 }[event.key];
  if (to === undefined) return;
  event.preventDefault();
  this.focus(this.items.indexOf(shown[to]));
 }

 // Choosing: the lens gives a little under the press. A choosing dock moves its dot there and stays a moment; the plus's dock
 // goes at once, and what was chosen happens as it goes.
 pick(index, keyboard = false) {
  const item = this.items[index];
  if (!item || item.hidden || this.state !== 'open' || this.choosing) return;
  this.focus(index);
  if (item.disabled) return;
  const glyph = item.el.querySelector('.dock-glyph').getBoundingClientRect();
  const from = { ...middle(glyph), size: glyph.width, color: getComputedStyle(item.el).color };
  this.kick(KICK.pick);
  if (this.choice) {
   this.choosing = true;
   this.setCurrent(item.id);
   this.onPick(item.id, { from, keyboard });
   setTimeout(() => {
    this.choosing = false;
    this.close({ focusButton: keyboard });
   }, reducedMotion() ? 0 : CHOSEN);
   return;
  }
  this.close({ keep: item.flies ? item.id : null });
  this.onPick(item.id, { from, keyboard });
 }

 // Everything goes back where it came from: the name melts up, the lens lets go, the icons fly back into the button and the
 // capsule folds into it. In a choosing dock only the current icon goes home, into the button, where it stays; the others
 // fade where they stand.
 close({ focusButton = false, keep = null } = {}) {
  if (this.state !== 'open') return;
  this.state = 'closing';
  this.returned = false;
  this.letGo();
  this.onToggle?.(false);
  if (reducedMotion()) {
   this.finish(focusButton);
   return;
  }
  const waits = [];
  this.fade();
  const marks = [this.lens, this.dot, ...this.items.map(item => item.divider)].filter(el => el && !el.hidden);
  for (const el of marks) {
   const from = getComputedStyle(el).opacity;
   for (const animation of el.getAnimations()) if (el !== this.lens) animation.cancel();
   waits.push(quiet(el.animate([{ opacity: from }, { opacity: 0 }], { duration: CLOSE.lens, easing: 'ease-in', fill: 'forwards' })));
  }
  const panel = this.panel.getBoundingClientRect(), button = this.home, home = this.origin, to = middle(home);
  const shown = this.shown().map(item => {
   const glyph = item.el.querySelector('.dock-glyph'), at = middle(glyph.getBoundingClientRect());
   return { item, glyph, dx: to.x - at.x, dy: to.y - at.y, size: glyph.getBoundingClientRect().width };
  }).sort((a, b) => Math.hypot(b.dx, b.dy) - Math.hypot(a.dx, a.dy));
  let homing = null;
  shown.forEach(({ item, glyph, dx, dy, size }, k) => {
   for (const animation of glyph.getAnimations()) animation.cancel();
   if (item.id === keep) { glyph.style.opacity = '0'; return; }
   if (this.choice) {
    // The current icon goes home whole, and lands as the button's own glyph.
    if (item.id === this.current) homing = glyph.animate(way(dx, dy, home.width / size, false).reverse().map((frame, i, all) => ({ ...frame, offset: i / (all.length - 1) })), { duration: CLOSE.home, easing: EASE.motion, fill: 'forwards' });
    else waits.push(quiet(glyph.animate([{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'scale(0.6)', filter: 'blur(4px)' }], { duration: CLOSE.lens + 60, easing: 'ease-in', fill: 'forwards' })));
    return;
   }
   waits.push(quiet(glyph.animate(way(dx, dy, 0.35).reverse().map((frame, i, all) => ({ ...frame, offset: i / (all.length - 1) })), { duration: CLOSE.fly, delay: k * CLOSE.stagger, easing: EASE.home, fill: 'forwards' })));
  });
  waits.push(quiet(this.shell.animate([
   { left: '0px', top: '0px', width: `${panel.width}px`, height: `${panel.height}px`, opacity: 1 },
   { opacity: 1, offset: 0.6 },
   { left: `${button.left - panel.left}px`, top: `${button.top - panel.top}px`, width: `${button.width}px`, height: `${button.height}px`, opacity: 0 },
  ], { duration: CLOSE.fold, delay: CLOSE.foldDelay, easing: EASE.motion, fill: 'forwards' })));
  waits.push(quiet(this.patch.lift(CLOSE.veilDelay)));
  // The button comes back as the capsule reaches it, or as the current icon arrives in it: the icon's flight is nearly over
  // (`landing`) well before its easing's long tail is.
  if (homing) waits.push(quiet(homing));
  this.backTimer = setTimeout(() => this.back(), homing ? CLOSE.home * CLOSE.landing : CLOSE.foldDelay + CLOSE.fold * CLOSE.back);
  Promise.all(waits).then(() => {
   if (this.state === 'closing') this.finish(focusButton);
  });
 }

 // The button is given back once a closing dock no longer needs its place.
 back() {
  clearTimeout(this.backTimer);
  if (this.returned) return;
  this.returned = true;
  this.onReturn?.();
 }

 finish(focusButton = false) {
  this.state = 'closed';
  this.letGo();
  this.back();
  this.choosing = false;
  cancelAnimationFrame(this.raf);
  this.raf = 0;
  for (const animation of this.panel.getAnimations({ subtree: true })) animation.cancel();
  for (const el of [this.dot, ...this.items.map(item => item.divider)]) if (el) el.style.opacity = '';
  for (const item of this.items) {
   item.el.querySelector('.dock-glyph').style.opacity = '';
   item.el.tabIndex = -1;
  }
  if (this.panel.matches(':popover-open')) this.panel.hidePopover();
  this.words.clear();
  this.named = -1;
  for (const item of this.items) item.note.classList.remove('is-shown');
  if (focusButton) this.button.focus({ preventScroll: true });
 }

 destroy() {
  document.removeEventListener('pointerdown', this.outside, true);
  window.removeEventListener('resize', this.resized);
  if (this.state !== 'closed') this.finish();
  this.panel.remove();
 }

 // A figure waiting to fly stays hidden until its flight begins: an animation still waiting out its delay can leave it drawn
 // where it ends up for the first frames.
 hold(el, delay) {
  el.style.opacity = '0';
  const timer = setTimeout(() => {
   this.holds.delete(timer);
   el.style.opacity = '';
  }, delay);
  this.holds.add(timer);
 }

 letGo() {
  for (const timer of this.holds) clearTimeout(timer);
  this.holds.clear();
 }

 kick(amount) {
  if (reducedMotion()) return;
  this.press[1] += amount;
  this.wake();
 }

 wake() {
  if (this.raf || this.state === 'closed') return;
  this.last = performance.now();
  this.raf = requestAnimationFrame(this.tick);
 }

 tick(now) {
  this.raf = 0;
  const dt = Math.max(0, Math.min((now - this.last) / 1000, 0.032));
  this.last = now;
  if (reducedMotion()) {
   this.pos = this.goal;
   this.vel = 0;
   this.stretch = [0, 0];
   this.press = [0, 0];
   this.reveal = 1;
   this.render();
   return;
  }
  const steps = Math.max(1, Math.ceil(dt / 0.004)), h = dt / steps, [k, c] = GLIDE;
  for (let n = 0; n < steps; n++) {
   this.vel += ((this.goal - this.pos) * k - this.vel * c) * h;
   this.pos += this.vel * h;
   this.spring(this.stretch, Math.min(STRETCH_MAX, Math.abs(this.vel) * STRETCH_PER_SPEED), STRETCH, h);
   this.spring(this.press, 0, PRESS, h);
  }
  if (this.revealAt < 0) this.revealAt = now + OPEN.lensDelay;
  this.reveal = clamp((now - this.revealAt) / OPEN.lens, 0, 1);
  const moving = this.reveal < 1 || Math.abs(this.goal - this.pos) > 0.0005 || Math.abs(this.vel) > 0.002
   || Math.abs(this.stretch[0]) > 0.001 || Math.abs(this.stretch[1]) > 0.005 || Math.abs(this.press[0]) > 0.001 || Math.abs(this.press[1]) > 0.005;
  if (!moving) {
   this.pos = this.goal;
   this.vel = 0;
   this.stretch = [0, 0];
   this.press = [0, 0];
  }
  this.render();
  if (moving && this.state !== 'closed') this.raf = requestAnimationFrame(this.tick);
 }

 spring(s, goal, [k, c], h) {
  s[1] += ((goal - s[0]) * k - s[1] * c) * h;
  s[0] += s[1] * h;
 }

 render() {
  if (!this.slots.length) return;
  const appear = REVEAL + (1 - REVEAL) * backOut(this.reveal), grow = (1 + PRESS_GROW * clamp(this.press[0], -0.5, 1.2)) * appear;
  const x = this.snap(this.x(this.pos)), s = this.stretch[0];
  this.lens.style.transform = `translate(${x - LENS.width / 2}px, ${-LENS.height / 2}px) scale(${(grow * (1 + s)).toFixed(4)}, ${(grow * (1 - 0.35 * s)).toFixed(4)})`;
  this.lens.style.opacity = clamp(this.reveal * 2.5, 0, 1).toFixed(3);
  this.aim();
 }

 // The name follows the lens: a new one comes out once the lens has nearly reached its icon, or the focus has stayed there.
 aim() {
  if (this.state !== 'open' || this.named === this.focused || this.focused < 0) return;
  const at = this.slot(this.focused);
  if (Math.abs(this.pos - at) > NEAR && performance.now() - this.focusedAt < STAY) return;
  this.name(this.focused);
  this.kick(KICK.name);
 }

 // The name of the icon in focus, out of the lens letter by letter, and its line under it; the old name melts away.
 name(index, { delay = 0, instant = false } = {}) {
  const item = this.items[index];
  if (!item) return;
  this.named = index;
  for (const entry of this.items) entry.note.classList.toggle('is-shown', entry === item && !!item.hint);
  this.words.show(item.name, { from: middle(this.lens.getBoundingClientRect()), delay, off: item.disabled });
  this.frost(instant || reducedMotion());
  if (!instant) this.hintBox.style.removeProperty('--hint-delay');
 }

 // Closing, the name dissolves and its line fades.
 fade() {
  for (const item of this.items) item.note.classList.remove('is-shown');
  this.words.fade();
 }

 // The veil's patch covers the name, its line and the capsule; it grows out of the button.
 frost(instant) {
  const panel = this.panel.getBoundingClientRect(), note = this.items[this.named]?.note, from = middle(this.origin || this.source().getBoundingClientRect());
  const boxes = [{ left: 0, top: 0, right: panel.width, bottom: panel.height }];
  for (const el of [this.words.word, note?.classList.contains('is-shown') ? note : null]) if (el) boxes.push(within(el.getBoundingClientRect(), panel));
  this.patch.fit(boxes, { x: from.x - panel.left, y: from.y - panel.top }, instant);
 }
}

Dock.spring = spring;
// How long a stage's veil waits for its words to go before it lifts.
Dock.lift = CLOSE.veilDelay;
window.Dock = Dock;
window.StageWord = StageWord;
window.StageVeil = StageVeil;
})();
