(() => {
'use strict';

// The button for a new version of the app, at the top right of the chat, left of the globe (and of the routines'
// button when that is there). desktop/update.js fetches the version in the background; while it comes the button is
// glass, like the buttons beside it, with a ring and the share in figures, each figure that changes turning over: the
// old one goes up into a blur and the new one comes up out of one. Once all of it has come and matched its sum, the
// ring closes and the button turns solid, the colour of the send button, and says Update. Pressed while an agent is at
// work it says it waits for the agent, and puts the version in once the agent has finished; pressed again, it does not.
const RING = { size: 16, stroke: 2.2 };
const ROLL = { duration: 380, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' };
const RISE = 0.62, BLUR = 3;
// The share is shown at this pace at most, however fast it comes, so that each turn of a figure is seen whole.
const PACE = 220;
// From one face to the next the button grows or shrinks to it as the old words go up into a blur, the new come up.
const MORPH = { duration: 420, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const WORD = { duration: 340, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
// It comes as the routines' button does, and goes quicker.
const POP = { duration: 460, easing: 'cubic-bezier(0.34, 1.45, 0.64, 1)' };
const AWAY = { duration: 180, easing: 'ease-in', fill: 'forwards' };
const GAP = 8;
// The face each phase wears: going in, it still says Update.
const FACES = { down: 'down', ready: 'ready', going: 'ready', after: 'after' };

const ARROW = '<svg class="update-arrow" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7.5"/><path d="M8 11.6V4.8M5.1 7.5 8 4.6l2.9 2.9"/></svg>';
const CLOCK = '<svg class="update-clock" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.6"/><path class="update-clock-hand" d="M8 8V4.6"/><path d="M8 8l2.1 1.3"/></svg>';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const element = (tag, className, text = '') => Object.assign(document.createElement(tag), { className, textContent: text });
const quiet = animation => animation.finished.catch(() => {});

class UpdatePill {
 // bridge: window.openghost.update. onMove: the button came, went or changed its width (the plan's island keeps
 // clear of it).
 constructor({ main, bridge, onMove = () => {} }) {
  this.main = main;
  this.bridge = bridge;
  this.onMove = onMove;
  this.view = { phase: 'none' };
  this.face = null;
  this.shown = null;
  this.pending = null;
  this.paced = 0;
  const pill = this.pill = element('button', 'update-pill glass-lens');
  pill.type = 'button';
  pill.hidden = true;
  const middle = RING.size / 2, r = middle - RING.stroke / 2 - 0.4;
  // A round end of the arc reaches half the stroke beyond it at either end: the arc is drawn shorter by the stroke and
  // started half a stroke on, so that what is seen is the share itself, and the ring closes only when all has come.
  this.cap = RING.stroke / (2 * Math.PI * r);
  this.faces = {
   down: this.make('down', `<svg class="update-ring" width="${RING.size}" height="${RING.size}" viewBox="0 0 ${RING.size} ${RING.size}" aria-hidden="true"><circle class="update-ring-track" cx="${middle}" cy="${middle}" r="${r}" stroke-width="${RING.stroke}"/><circle class="update-ring-arc" cx="${middle}" cy="${middle}" r="${r}" stroke-width="${RING.stroke}" pathLength="1" stroke-dashoffset="${-this.cap / 2}" transform="rotate(-90 ${middle} ${middle})"/></svg><span class="update-figures" aria-hidden="true"><span class="update-digits"></span><span class="update-sign">%</span></span>`),
   ready: this.make('ready', ARROW, I18n.t('update.ready')),
   after: this.make('after', CLOCK, I18n.t('update.after')),
  };
  this.arc = pill.querySelector('.update-ring-arc');
  this.digits = pill.querySelector('.update-digits');
  pill.addEventListener('click', () => {
   if (!['ready', 'after'].includes(this.view.phase)) return;
   Promise.resolve(this.bridge.install()).then(view => view && this.take(view)).catch(() => {});
  });
  // It stands left of the routines' button when that is there, of the globe when not; both can come and go, and the
  // routines' one changes its width with its count.
  const neighbours = main.querySelectorAll(':scope > .routines-pill, :scope > .browser-tools');
  const watch = new ResizeObserver(() => this.place());
  const seen = new MutationObserver(() => this.place());
  for (const el of neighbours) {
   watch.observe(el);
   seen.observe(el, { attributes: true, attributeFilter: ['hidden'], subtree: true });
  }
  watch.observe(main);
  watch.observe(pill);
  main.querySelector(':scope > .browser-tools')?.before(pill);
  bridge.onState(view => this.take(view));
  Promise.resolve(bridge.state()).then(view => view && this.take(view)).catch(() => {});
 }

 make(name, html, word = '') {
  const face = element('span', `update-face is-${name}`);
  face.innerHTML = html;
  if (word) face.append(element('span', 'update-word', word));
  face.hidden = true;
  this.pill.append(face);
  return face;
 }

 place() {
  const pill = this.pill;
  if (pill.hidden) return;
  const seen = el => el && !el.hidden && el.getClientRects().length > 0;
  const routines = this.main.querySelector(':scope > .routines-pill');
  const globe = this.main.querySelector(':scope > .browser-tools browser-toggle');
  const beside = seen(routines) ? routines : seen(globe) ? this.main.querySelector(':scope > .browser-tools') : null;
  const box = this.main.getBoundingClientRect();
  pill.style.right = beside ? `${Math.round(box.right - beside.getBoundingClientRect().left + GAP)}px` : '';
  this.onMove();
 }

 take(view) {
  this.view = view;
  const pill = this.pill;
  const words = {
   down: () => I18n.t('update.down', { version: view.version, percent: Math.floor(view.share * 100) }),
   ready: () => I18n.t(view.platform === 'darwin' ? 'update.ready.mac' : view.platform === 'linux' ? 'update.ready.linux' : 'update.ready.win', { version: view.version }),
   going: () => I18n.t('update.going', { version: view.version }),
   after: () => I18n.t('update.after.hint'),
  };
  if (view.phase === 'none') {
   this.hide();
   return;
  }
  pill.title = words[view.phase]();
  pill.setAttribute('aria-label', pill.title);
  pill.disabled = view.phase === 'going';
  if (pill.hidden) {
   this.show(view);
   return;
  }
  const face = FACES[view.phase];
  if (face === 'down') {
   this.to('down');
   this.share(view.share);
  } else if (this.face === 'down') {
   // The last of it is seen come: the figures turn to the whole and the ring closes before the button changes.
   this.share(1, true);
   clearTimeout(this.closing);
   this.closing = setTimeout(() => this.to(face), reducedMotion() ? 0 : ROLL.duration + 160);
  } else this.to(face);
  this.dress();
 }

 // Solid once it can be put in; still (no press, no light under the pointer) while it comes and while it goes in.
 dress() {
  const { phase } = this.view;
  this.pill.classList.toggle('is-solid', this.face === 'ready' && (phase === 'ready' || phase === 'going'));
  this.pill.classList.toggle('is-still', this.face === 'down' || phase === 'going');
 }

 show(view) {
  const pill = this.pill;
  pill.getAnimations().forEach(animation => animation.cancel());
  pill.hidden = false;
  this.face = null;
  this.shown = null;
  this.to(FACES[view.phase], false);
  if (view.phase === 'down') this.share(view.share, true);
  this.place();
  if (!reducedMotion()) pill.animate([{ opacity: 0, transform: 'scale(0.86)' }, { opacity: 1, transform: 'none' }], POP);
 }

 hide() {
  const pill = this.pill;
  clearTimeout(this.closing);
  clearTimeout(this.pacing);
  this.pending = null;
  if (pill.hidden) return;
  const gone = () => { pill.hidden = true; this.face = null; pill.style.right = ''; this.onMove(); };
  if (reducedMotion()) { gone(); return; }
  quiet(pill.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.86)' }], AWAY)).then(() => {
   if (this.view.phase !== 'none') return;
   pill.getAnimations().forEach(animation => animation.cancel());
   gone();
  });
 }

 // One face in place of another: the button grows or shrinks from the one width to the other, cut by its own edge
 // meanwhile, as the old face goes up into a blur and the new comes up out of one.
 to(name, move = true) {
  if (this.face === name) return;
  const pill = this.pill, old = this.face && this.faces[this.face], next = this.faces[name];
  clearTimeout(this.closing);
  this.face = name;
  this.dress();
  for (const face of Object.values(this.faces)) face.getAnimations().forEach(animation => animation.cancel());
  if (!old || !move || reducedMotion()) {
   for (const [key, face] of Object.entries(this.faces)) { face.hidden = key !== name; face.classList.remove('is-leaving'); }
   return;
  }
  const from = pill.offsetWidth;
  // The old face keeps its place against the right edge, where the button stands, while the button changes under it.
  old.style.right = `${from - old.offsetLeft - old.offsetWidth}px`;
  old.classList.add('is-leaving');
  next.hidden = false;
  const to = pill.offsetWidth;
  pill.classList.add('is-moving');
  quiet(pill.animate([{ width: `${from}px` }, { width: `${to}px` }], MORPH)).then(() => pill.classList.remove('is-moving'));
  quiet(old.animate([{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'translateY(-7px)', filter: 'blur(3px)' }], { ...WORD, fill: 'forwards' })).then(() => {
   if (this.face === name) { old.hidden = true; old.classList.remove('is-leaving'); old.style.right = ''; }
  });
  next.animate([{ opacity: 0, transform: 'translateY(7px)', filter: 'blur(3px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { ...WORD, delay: 60, fill: 'backwards' });
  this.place();
 }

 // The share: the ring at once (it moves on smoothly by itself), the figures at their pace.
 share(share, now = false) {
  const length = share > 0 ? Math.max(0, Math.min(1, share) - this.cap) : 0;
  this.arc.style.strokeDasharray = `${length} 1`;
  this.arc.style.opacity = share > 0 ? '' : '0';
  const text = String(Math.floor(Math.min(1, share) * 100));
  this.pending = text;
  const wait = now ? 0 : Math.max(0, this.paced + PACE - performance.now());
  clearTimeout(this.pacing);
  if (!wait) this.figures();
  else this.pacing = setTimeout(() => this.figures(), wait);
 }

 // The figures, right to the left: each that changed turns over; one that is new (from 9 to 10) opens its own room as
 // it comes.
 figures() {
  const text = this.pending;
  this.pending = null;
  if (text === null || text === this.shown) return;
  this.paced = performance.now();
  const first = this.shown === null, box = this.digits, still = first || reducedMotion();
  this.shown = text;
  const chars = [...text], slots = [...box.children];
  while (slots.length > chars.length) slots.shift().remove();
  while (slots.length < chars.length) {
   const slot = element('span', 'update-digit');
   box.prepend(slot);
   slots.unshift(slot);
   if (!still) slot.dataset.fresh = '1';
  }
  slots.forEach((slot, i) => {
   const char = chars[i];
   if (slot.dataset.char === char) return;
   slot.dataset.char = char;
   const old = slot.querySelector('.update-glyph:not(.is-leaving)'), glyph = element('span', 'update-glyph', char);
   if (still || !old) {
    slot.querySelectorAll('.update-glyph').forEach(each => each.remove());
    slot.append(glyph);
   } else {
    old.classList.add('is-leaving');
    slot.append(glyph);
    quiet(old.animate([{ transform: 'none', filter: 'blur(0)', opacity: 1 }, { transform: `translateY(${-RISE}em)`, filter: `blur(${BLUR}px)`, opacity: 0 }], { ...ROLL, fill: 'forwards' })).then(() => old.remove());
   }
   if (!still) glyph.animate([{ transform: `translateY(${RISE}em)`, filter: `blur(${BLUR}px)`, opacity: 0 }, { transform: 'none', filter: 'blur(0)', opacity: 1 }], ROLL);
   if (slot.dataset.fresh) {
    delete slot.dataset.fresh;
    quiet(slot.animate([{ width: '0px' }, { width: `${glyph.offsetWidth}px` }], ROLL)).then(() => this.onMove());
   }
  });
 }
}

window.UpdatePill = UpdatePill;
})();
