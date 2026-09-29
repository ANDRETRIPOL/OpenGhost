(() => {
'use strict';

// The effort's stage: the app steps back around the slider, softly, as it does around a selection, and the level's name stands over it.
// The name comes out of the lens: its letters fly up from the glass and settle into place, while the old name melts away.
// It carries the effort itself. It grows heavier and brighter toward the top, leans the way the lens is pushed,
// and every level arrives in its own tempo: Instant all at once, Max letter by letter, and then it breathes with the ghost.
const OPEN = { veil: 460, delay: 150, hint: 220 };
const CLOSE = { veil: 320, letters: 170, stagger: 10 };
// The patch: how far past the name and the slider it keeps full strength, and over how much it then fades out.
// It grows out of the effort button from `bloom` of its size.
const HALO = { pad: 18, feather: 64, bloom: 0.45 };
// A level's flight, from the lowest level to the highest: how long its letters fly and how far apart they leave.
const FLIGHT = { duration: [440, 760], stagger: [0, 44], steps: 18, from: 0.2, swell: 1.08, spin: 26, toss: 0.38, blur: 7 };
const LEAVE = { duration: 190, stagger: 10, rise: 0.45, blur: 8 };
const HINT = { in: 380, out: 150, gap: 110, shift: 5 };
const LEAN = { per: 1.2, max: 6 };
const BREATH = { lift: 0.07, period: 2600, step: 150 };
// Choosing a level leaves a small hysteresis around the middle between two, so a hand resting there doesn't flicker the name,
// and a lens swept fast across several levels names only the one it slows down at (FAST, in levels a second).
const SWITCH = 0.08;
const FAST = 4.5;
const EASE = { out: 'cubic-bezier(0.22, 1, 0.36, 1)', leave: 'cubic-bezier(0.4, 0, 1, 1)', flight: 'cubic-bezier(0.3, 0.6, 0.2, 1)' };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mix = ([a, b], t) => a + (b - a) * t;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const quiet = animation => animation.finished.catch(() => {});
const middle = rect => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

// A letter's way out of the lens: it leaves small and blurred, is tossed a little past its place and drops into it.
// (dx, dy) is where the lens stands as seen from the letter's place; the path bends toward the side it comes from.
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

// The veil over the rest of a reply while a piece of it is selected (--veil): it softens and dims what is behind
// but keeps the background its own color, so the patch has no shape of its own. It blooms out of the effort button.
function veil() {
 const full = getComputedStyle(document.documentElement).getPropertyValue('--veil').trim();
 const rest = full.replace(/blur\([^)]*\)/g, 'blur(0px)').replace(/(brightness|contrast|saturate)\([^)]*\)/g, '$1(1)');
 return [{ backdropFilter: rest, transform: `scale(${HALO.bloom})` }, { backdropFilter: full, transform: 'none' }];
}

// Its edges fade along a smoothstep, like the cut-outs of that veil, so nowhere does it start at a line.
const STEPS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
const shade = t => `rgba(0, 0, 0, ${(t * t * (3 - 2 * t)).toFixed(3)})`;
const ramp = angle => `linear-gradient(${angle}, ${STEPS.map(t => `${shade(t)} ${t * HALO.feather}px`).join(', ')}, ${STEPS.map(t => `${shade(1 - t)} calc(100% - ${(1 - t) * HALO.feather}px)`).join(', ')})`;

const nameOf = level => I18n.has(`effort.${level}`) ? I18n.t(`effort.${level}`) : level.charAt(0).toUpperCase() + level.slice(1);
const hintOf = level => I18n.has(`effort.${level}.hint`) ? I18n.t(`effort.${level}.hint`) : '';

class EffortStage {
 constructor(panel, { onDismiss, lens }) {
  this.panel = panel;
  this.lens = lens;
  this.veil = document.createElement('div');
  this.veil.className = 'effort-veil';
  this.veil.style.maskImage = `${ramp('90deg')}, ${ramp('180deg')}`;
  this.veil.addEventListener('pointerdown', event => {
   event.preventDefault();
   onDismiss();
  });
  this.title = document.createElement('div');
  this.title.className = 'effort-title';
  this.title.setAttribute('aria-hidden', 'true');
  this.title.innerHTML = '<div class="effort-word-box"></div><div class="effort-hint-box"></div>';
  this.wordBox = this.title.querySelector('.effort-word-box');
  this.hintBox = this.title.querySelector('.effort-hint-box');
  panel.prepend(this.veil);
  panel.append(this.title);
  this.word = null;
  this.hint = null;
  this.index = -1;
 }

 // The app frosts over around the slider, and the name comes out of the lens in its level's tempo.
 open({ index, levels }) {
  this.clear();
  this.show({ index, levels, dir: 1, delay: OPEN.delay, instant: true });
  if (!reducedMotion()) this.veil.animate(veil(), { duration: OPEN.veil, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'both' });
  else this.veil.animate(veil().slice(1), { duration: 0, fill: 'both' });
 }

 // The letters dissolve upward, last first, and the app comes back out of the veil.
 close() {
  this.index = -1;
  if (reducedMotion()) return;
  if (this.word) {
   const letters = [...this.word.children].reverse();
   letters.forEach((letter, k) => this.from(letter, { opacity: 0, transform: 'translateY(-0.3em)', filter: 'blur(6px)' },
    { duration: CLOSE.letters, delay: k * CLOSE.stagger, easing: 'ease-in', fill: 'forwards' }));
  }
  this.hint?.animate([{ opacity: 0, filter: 'blur(4px)' }], { duration: HINT.out, fill: 'forwards' });
  this.veil.animate(veil().reverse(), { duration: CLOSE.veil, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'both' });
 }

 // Once the panel is gone, nothing of this visit is left for the next one.
 clear() {
  for (const animation of [...this.veil.getAnimations(), ...this.title.getAnimations({ subtree: true })]) animation.cancel();
  this.wordBox.replaceChildren();
  this.hintBox.replaceChildren();
  this.word = null;
  this.hint = null;
  this.index = -1;
 }

 // Where the lens is heading picks the name. Answers whether a new name came out, so the lens can give a small start.
 aim(goal, levels, speed = 0) {
  const max = levels.length - 1, at = clamp(goal, 0, max), index = Math.round(at);
  if (this.index < 0 || speed > FAST || index === this.index || Math.abs(at - this.index) < 0.5 + SWITCH) return false;
  this.show({ index, levels, dir: Math.sign(index - this.index) });
  return true;
 }

 show({ index, levels, dir, delay = 0, instant = false }) {
  const level = levels[index], top = index === levels.length - 1, t = levels.length > 1 ? index / (levels.length - 1) : 1;
  this.leave();
  this.index = index;
  const word = this.word = document.createElement('span');
  word.className = 'effort-word';
  word.style.setProperty('--level-heat', t.toFixed(3));
  for (const char of nameOf(level)) word.append(Object.assign(document.createElement('span'), { className: 'effort-letter', textContent: char }));
  this.wordBox.append(word);
  this.swapHint(hintOf(level), dir, delay);
  this.frost(instant || reducedMotion());
  if (reducedMotion()) return;
  // Letters leave the lens nearest first, so the word spills out of the glass toward its place.
  const lens = middle(this.lens()), size = parseFloat(getComputedStyle(this.wordBox).fontSize);
  const letters = [...word.children].map(letter => {
   const at = middle(letter.getBoundingClientRect());
   return { letter, dx: lens.x - at.x, dy: lens.y - at.y };
  }).sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy));
  const duration = mix(FLIGHT.duration, t), stagger = mix(FLIGHT.stagger, t);
  letters.forEach(({ letter, dx, dy }, k) => letter.animate(flight(dx, dy, size), { duration, delay: delay + k * stagger, easing: EASE.flight, fill: 'backwards' }));
  if (top) this.breathe(word, delay + duration + stagger * (letters.length - 1));
 }

 // The frosted patch covers the name, its line and the slider, and fades out around them. A new name moves it along,
 // wider for a long one; it grows out of the corner of the panel that sits on the effort button.
 frost(instant) {
  const panel = this.panel.getBoundingClientRect(), box = { left: 0, top: 0, right: panel.width, bottom: panel.height };
  for (const el of [this.word, this.hint]) {
   if (!el) continue;
   const r = el.getBoundingClientRect();
   box.left = Math.min(box.left, r.left - panel.left);
   box.top = Math.min(box.top, r.top - panel.top);
   box.right = Math.max(box.right, r.right - panel.left);
   box.bottom = Math.max(box.bottom, r.bottom - panel.top);
  }
  const edge = HALO.pad + HALO.feather, left = box.left - edge, top = box.top - edge, style = this.veil.style;
  if (instant) style.transition = 'none';
  Object.assign(style, {
   left: `${left}px`,
   top: `${top}px`,
   width: `${box.right - box.left + edge * 2}px`,
   height: `${box.bottom - box.top + edge * 2}px`,
   transformOrigin: `${panel.width - left}px ${panel.height - top}px`,
  });
  if (!instant) return;
  void this.veil.offsetWidth;
  style.transition = '';
 }

 // The old name melts upward like smoke, from wherever its own flight had got to.
 leave() {
  const word = this.word;
  if (!word) return;
  this.word = null;
  if (reducedMotion()) { word.remove(); return; }
  const done = [...word.children].map((letter, k) => this.from(letter,
   { opacity: 0, transform: `translateY(${-LEAVE.rise}em) scale(1.06)`, filter: `blur(${LEAVE.blur}px)` },
   { duration: LEAVE.duration, delay: k * LEAVE.stagger, easing: EASE.leave, fill: 'forwards' }));
  Promise.all(done.map(quiet)).then(() => word.remove());
 }

 // Animates to a look starting from the one on screen, whatever animation had it there.
 from(el, to, timing) {
  const style = getComputedStyle(el), start = { opacity: style.opacity, transform: style.transform, filter: style.filter };
  for (const animation of el.getAnimations()) animation.cancel();
  return el.animate([start, to], timing);
 }

 // The line under the name hands over in turn: the old one is gone before the new one comes, so they never read on top of each other.
 swapHint(text, dir, delay) {
  const old = this.hint;
  if (old) {
   if (reducedMotion()) old.remove();
   else quiet(this.from(old, { opacity: 0, filter: 'blur(3px)', transform: `translateY(${-dir * HINT.shift}px)` }, { duration: HINT.out, easing: 'ease-in', fill: 'forwards' })).then(() => old.remove());
  }
  this.hint = null;
  if (!text) return;
  const hint = this.hint = Object.assign(document.createElement('span'), { className: 'effort-hint', textContent: text });
  this.hintBox.append(hint);
  if (!reducedMotion()) hint.animate(
   [{ opacity: 0, filter: 'blur(3px)', transform: `translateY(${dir * HINT.shift}px)` }, { opacity: 1, filter: 'blur(0)', transform: 'none' }],
   { duration: HINT.in, delay: delay ? delay + OPEN.hint : HINT.gap, easing: EASE.out, fill: 'backwards' },
  );
 }

 // The lens drives the name between levels: dragged toward the next level, the word grows heavier or lighter toward it
 // (`strain`, in parts of the whole scale), and it leans the way the lens moves (`speed`, in levels a second).
 follow(strain, speed) {
  this.word?.style.setProperty('--strain', strain.toFixed(3));
  this.title.style.setProperty('--lean', `${clamp(-speed * LEAN.per, -LEAN.max, LEAN.max).toFixed(2)}deg`);
 }

 // At the top the name breathes along with the ghost: once it has arrived, its letters rise and settle one after another.
 // Leaving takes the breath with it, since a word lets go of all its animations.
 breathe(word, after) {
  [...word.children].forEach((letter, k) => letter.animate(
   [{ transform: 'none' }, { transform: `translateY(${-BREATH.lift}em)`, offset: 0.5 }, { transform: 'none' }],
   { duration: BREATH.period, delay: after + k * BREATH.step, iterations: Infinity, easing: 'ease-in-out', composite: 'add' },
  ));
 }
}

EffortStage.nameOf = nameOf;
window.EffortStage = EffortStage;
})();
