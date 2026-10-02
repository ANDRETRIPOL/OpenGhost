(() => {
'use strict';

const EASE = {
 motion: 'cubic-bezier(0.32, 0.72, 0, 1)',
 out: 'cubic-bezier(0.22, 1, 0.36, 1)',
 in: 'cubic-bezier(0.4, 0, 0.9, 0.5)',
 flight: 'cubic-bezier(0.5, 0, 0.18, 1)',
};

// A real spring, sampled into a linear() easing and described the way the system describes its own: how long one swing takes
// and how much it bounces, 0 settling without overshoot. It lasts until it has settled.
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
const SPRING = {
 // The card's capsule growing out of its button, and the lock screen's field out of «View chat».
 glass: spring(0.5, 0.12),
 // A shackle biting shut, and one springing open.
 snap: spring(0.32, 0.3),
 open: spring(0.42, 0.24),
 // A padlock coming to rest where it landed.
 settle: spring(0.45, 0.22),
};
const CONFIRM_TIME = 3000;
// The card stands just right of the chat it belongs to, clear of the list's edge, and keeps clear of the window's edges.
const GAP = 24;
const EDGE = 12;
// Locking: the shackle is seen to bite in the card before the padlock leaves it.
const SHUT_TIME = 260;
// The frost that comes over a chat as it locks; its messages stay under it until then (LOCK_FADE in chat.js is a little longer).
const FROST = 620;
// Opening: the shackle springs open, then the frost thaws, the padlock and the words dissolve and the chat comes forward.
const OPENING = { thaw: 260, duration: 640 };
const FLIGHT = { in: 560, out: 660, back: 460 };
// The shackle, in the symbol's own units: lifted this far and turned this far about its left leg when the padlock is open.
const LIFT = 4;
const TURN = -26;
// The list's small padlock is drawn in a 60 box where this one has 64.
const OUTLINE = 64 / 60;
const ARROW = '<svg class="glyph" viewBox="30 30 60 60" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M42 60h35M63 46l14 14-14 14"/></svg>';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const t = key => escapeHtml(I18n.t(key));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const quiet = animation => animation.finished.catch(() => {});
const center = rect => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
const within = (rect, frame) => ({ left: rect.left - frame.left, top: rect.top - frame.top, right: rect.right - frame.left, bottom: rect.bottom - frame.top });
// Words keep together; each of their letters can rise on its own.
const letters = text => text.split(/(\s+)/).map(part => part.trim()
 ? `<span class="lock-word">${[...part].map(char => `<span class="lock-letter">${escapeHtml(char)}</span>`).join('')}</span>` : part).join('');

// The padlock: drawn in thin lines, the way the system draws its symbols, with a small keyhole like the list's padlock.
function seal(className = '') {
 return `<span class="seal${className ? ` ${className}` : ''}" aria-hidden="true"><svg class="seal-symbol" viewBox="0 0 64 64"><path class="seal-shackle" d="M23 30V22.5a9 9 0 0 1 18 0V30"/><rect class="seal-body" x="15.5" y="30" width="33" height="24" rx="6.5"/><path d="M32 39.5v5"/></svg></span>`;
}

const shackle = amount => `translateY(${(-LIFT * amount).toFixed(3)}px) rotate(${(TURN * amount).toFixed(3)}deg)`;

// How far a padlock stands open, from 0 (shut) to 1 (open); past 1 the shackle comes right out. Given a spring, the shackle
// swings there from wherever it is, even mid-swing.
function setOpen(el, amount, motion = null) {
 const path = el?.querySelector('.seal-shackle');
 if (!path) return;
 const to = shackle(amount), from = motion && !reducedMotion() ? getComputedStyle(path).transform : null;
 for (const animation of path.getAnimations()) animation.cancel();
 path.style.transform = to;
 if (from) path.animate([{ transform: from === 'none' ? shackle(0) : from }, { transform: to }], { ...motion, fill: 'backwards' });
}

// A button's words change by fading in, the button itself staying where and as big as it is.
function relabel(button, key) {
 button.textContent = I18n.t(key);
 if (!reducedMotion()) button.animate([{ color: 'transparent' }, {}], { duration: 260, easing: EASE.out });
}

// A wrong password: the padlock shakes its head, the way the system's symbols do.
function wiggle(el) {
 if (reducedMotion() || !el) return;
 el.querySelector('.seal-symbol')?.animate([
  { rotate: '0deg' }, { rotate: '-10deg' }, { rotate: '8deg' }, { rotate: '-5deg' }, { rotate: '2deg' }, { rotate: '0deg' },
 ], { duration: 540, easing: 'ease-out' });
}

// The field says no the way the login window does: a quick shake that dies away.
function shake(node) {
 if (reducedMotion() || !node) return;
 const frames = Array.from({ length: 31 }, (_, i) => {
  const k = i / 30;
  return { transform: `translateX(${(11 * Math.exp(-4 * k) * Math.sin(k * Math.PI * 7)).toFixed(2)}px)` };
 });
 node.animate(frames, { duration: 600, easing: 'linear' });
}

// Lines come up out of a blur one after another; a title's letters rise on their own, the way the model picker's names do.
function rise(nodes, delay = 0) {
 if (reducedMotion()) return;
 nodes.filter(Boolean).forEach((node, k) => node.animate(
  [{ opacity: 0, transform: 'translateY(8px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
  { duration: 560, delay: delay + k * 60, easing: EASE.out, fill: 'backwards' },
 ));
}

function spell(node, delay = 0) {
 if (reducedMotion() || !node) return;
 const chars = node.querySelectorAll('.lock-letter'), step = Math.min(24, 380 / Math.max(1, chars.length));
 chars.forEach((char, k) => char.animate(
  [{ opacity: 0, transform: 'translateY(0.45em)', filter: 'blur(8px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
  { duration: 600, delay: delay + k * step, easing: EASE.out, fill: 'backwards' },
 ));
}

// The padlock travels on a curve bent to one side, the way the model picker's star flies, growing or shrinking on the way.
function fly(node, from, to, { duration, delay = 0, bend = -0.2, easing = EASE.flight }) {
 const box = node.offsetWidth, dx = to.x - from.x, dy = to.y - from.y;
 const c = { x: (from.x + to.x) / 2 - dy * bend, y: (from.y + to.y) / 2 + dx * bend };
 const frames = [];
 for (let i = 0; i <= 20; i++) {
  const k = i / 20, u = 1 - k;
  const x = u * u * from.x + 2 * u * k * c.x + k * k * to.x, y = u * u * from.y + 2 * u * k * c.y + k * k * to.y;
  const scale = (from.size + (to.size - from.size) * k) / box;
  frames.push({ offset: k, transform: `translate(${(x - box / 2).toFixed(2)}px, ${(y - box / 2).toFixed(2)}px) scale(${scale.toFixed(4)})` });
 }
 return node.animate(frames, { duration, delay, easing, fill: 'both' });
}

// A copy of a padlock that travels between places. It can start or end as the list's small padlock: the two cross over while
// it flies.
function flyer(host, size, amount) {
 const el = document.createElement('div');
 el.className = 'seal-flyer';
 el.style.width = el.style.height = `${size}px`;
 el.innerHTML = `${seal()}<span class="seal-outline">${Glyphs.padlock}</span>`;
 el.firstElementChild.style.setProperty('--seal', `${size}px`);
 host.append(el);
 setOpen(el.firstElementChild, amount);
 return el;
}

// The box a list glyph stands for: one whose padlock is as big as the glyph's.
const boxFor = glyph => glyph.width * OUTLINE;

const LEAVING = {
 outline: [{ opacity: 1, offset: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0, offset: 0.7 }, { opacity: 0, offset: 1 }],
 symbol: [{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.2 }, { opacity: 1, offset: 0.6 }, { opacity: 1, offset: 1 }],
};
const backwards = frames => frames.map(frame => ({ ...frame, offset: 1 - frame.offset })).reverse();

// Leaving the list its padlock gives way to this one; going back to it, the other way round.
function crossover(el, toList, timing) {
 const run = (node, frames) => node?.animate(toList ? backwards(frames) : frames, { ...timing, fill: 'both' });
 run(el.querySelector('.seal-outline'), LEAVING.outline);
 run(el.querySelector('.seal-symbol'), LEAVING.symbol);
}

// A password field that shows what is typed as dots of its own: each one comes in as its character is typed and goes as it is
// deleted, the caret stands where the input's caret is, and a selection lights up the dots it covers. The real input stays on
// top, see-through, so typing, pasting, the keyboard and screen readers all work as in any password field.
class PassField {
 constructor(input) {
  this.input = input;
  this.dots = [];
  this.frozen = false;
  const box = this.box = document.createElement('span');
  box.className = 'pass-dots is-empty';
  box.setAttribute('aria-hidden', 'true');
  box.innerHTML = '<span class="pass-track"><i class="pass-caret"></i></span>';
  this.track = box.firstElementChild;
  this.caret = this.track.firstElementChild;
  input.after(box);
  const sync = () => this.sync();
  for (const type of ['input', 'keyup', 'pointerup', 'select', 'selectionchange', 'focus', 'blur']) input.addEventListener(type, sync);
 }

 sync(animate = true) {
  if (this.frozen) return;
  const value = this.input.value, count = [...value].length, still = !animate || reducedMotion();
  while (this.dots.length < count) {
   const dot = document.createElement('i');
   dot.className = 'pass-dot';
   this.track.insertBefore(dot, this.caret);
   this.dots.push(dot);
   if (!still) dot.animate([{ transform: 'scale(0.2)', opacity: 0, width: '0px', marginRight: '0px' }, { transform: 'none', opacity: 1 }], { duration: 200, easing: EASE.out });
  }
  while (this.dots.length > count) {
   const dot = this.dots.pop();
   if (still) { dot.remove(); continue; }
   dot.classList.add('is-leaving');
   quiet(dot.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(0.2)', opacity: 0, width: '0px', marginRight: '0px' }], { duration: 160, easing: EASE.out, fill: 'forwards' }))
    .then(() => dot.remove());
  }
  // The caret and the selection follow the input's own, counted in characters rather than code units.
  const at = index => [...value.slice(0, index ?? value.length)].length;
  const start = at(this.input.selectionStart), end = at(this.input.selectionEnd);
  this.dots.forEach((dot, k) => dot.classList.toggle('is-selected', start !== end && k >= start && k < end));
  this.track.insertBefore(this.caret, this.dots[end] || null);
  this.box.classList.toggle('is-empty', !count);
  // A password longer than the field slides left, so its end and the caret stay in view.
  requestAnimationFrame(() => {
   const over = Math.max(0, this.track.scrollWidth - this.box.clientWidth);
   this.track.style.transform = over ? `translateX(${-over}px)` : '';
  });
 }

 clear() {
  this.frozen = false;
  this.input.value = '';
  for (const dot of this.dots) dot.remove();
  this.dots = [];
  this.sync(false);
 }

 // The password leaves the input at once, while its dots stay as they are until whatever shows them is gone.
 wipe() {
  this.frozen = true;
  this.input.value = '';
 }

 // The dots leave and the field is empty at once, so a new try can start straight away; what is typed meanwhile shows as soon
 // as they are gone. They fold up where they stand, so the caret glides back to the start with them: wrong, all together after
 // a beat, sinking a little; handed on to the next step, from the last one back, like a quick backspace.
 async flush(kind) {
  const dots = this.dots, wrong = kind === 'fail';
  this.frozen = true;
  this.input.value = '';
  if (!reducedMotion() && dots.length) {
   await Promise.all(dots.map((dot, k) => quiet(dot.animate(
    [{ transform: 'none', opacity: 1 }, { transform: wrong ? 'translateY(3px) scale(0.3)' : 'scale(0.3)', opacity: 0, width: '0px', marginRight: '0px' }],
    { duration: 220, delay: wrong ? 140 : Math.min(dots.length - 1 - k, 16) * 18, easing: EASE.motion, fill: 'forwards' },
   ))));
  }
  for (const dot of dots) dot.remove();
  if (this.dots === dots) this.dots = [];
  this.frozen = false;
  this.sync();
 }
}

// Over a locked chat: frost in the chat's own color, the bare padlock, one line of big type and «View chat». The field for
// the password grows out of those words when they are pressed, or as soon as the password starts being typed.
class LockScreen {
 constructor({ main, chat, composer, onOpen }) {
  Object.assign(this, { main, chat, composer, onOpen });
  this.conv = null;
  this.last = null;
  this.checking = false;
  this.asking = false;
  this.expected = '';
  this.waiting = false;
  this.timers = [];
  const root = this.root = document.createElement('div');
  root.className = 'lock-screen';
  root.hidden = true;
  root.innerHTML = `
   <div class="lock-frost"></div>
   <div class="lock-screen-body">
    ${seal('lock-screen-seal')}
    <h2 class="lock-screen-title">${letters(I18n.t('lock.screen.title'))}</h2>
    <div class="lock-entry">
     <form class="lock-screen-form" autocomplete="off">
      <div class="pass">
       <input class="pass-input lock-screen-input" type="password" spellcheck="false" aria-label="${t('lock.password')}">
       <span class="pass-hint" aria-hidden="true">${t('lock.password')}</span>
       <button class="pass-go lock-screen-go" type="submit" aria-label="${t('lock.open')}" disabled>${ARROW}<i class="pass-spin"></i></button>
      </div>
     </form>
     <button class="lock-view" type="button">${t('lock.view')}</button>
     <p class="lock-screen-error" role="status"></p>
    </div>
   </div>`;
  main.append(root);
  this.frost = root.querySelector('.lock-frost');
  this.body = root.querySelector('.lock-screen-body');
  this.seal = root.querySelector('.lock-screen-seal');
  this.title = root.querySelector('.lock-screen-title');
  this.entry = root.querySelector('.lock-entry');
  this.error = root.querySelector('.lock-screen-error');
  this.form = root.querySelector('.lock-screen-form');
  this.field = root.querySelector('.pass');
  this.input = root.querySelector('.lock-screen-input');
  this.go = root.querySelector('.lock-screen-go');
  this.view = root.querySelector('.lock-view');
  this.pass = new PassField(this.input);
  this.view.addEventListener('click', () => this.ask());
  this.input.addEventListener('input', () => {
   this.go.disabled = !this.input.value;
   this.say('');
  });
  this.form.addEventListener('submit', event => {
   event.preventDefault();
   this.submit();
  });
  // Esc in an empty field puts it away again, back into «View chat».
  this.form.addEventListener('keydown', event => {
   if (event.key !== 'Escape' || this.input.value || this.checking) return;
   event.preventDefault();
   this.unask();
  });
  // Typing the password straight away opens the field, and what is typed goes into it.
  document.addEventListener('keydown', event => {
   if (!this.conv || this.asking || this.checking || event.defaultPrevented || event.isComposing) return;
   if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
   if (event.target !== document.body && !root.contains(event.target)) return;
   // Space on «View chat» presses it, as on any button, rather than typing a space into the field.
   if (event.key === ' ' && event.target === this.view) return;
   this.ask();
  }, true);
 }

 later(fn, ms) {
  this.timers.push(setTimeout(fn, ms));
 }

 // The chat's own color with a see-through share, for the frost to thicken from and thin out to.
 cover(alpha) {
  const [r, g, b] = getComputedStyle(document.documentElement).getPropertyValue('--chat-bg').match(/[\d.]+/g) || [0, 0, 0];
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
 }

 // A line under the field says what went wrong, and goes as soon as typing starts again.
 say(key) {
  if (key) this.error.textContent = I18n.t(key);
  this.error.classList.toggle('is-shown', !!key);
 }

 // The capsule's box, cut in to where «View chat» stands, for the field to grow out of and fold back into.
 inset() {
  const from = this.view.getBoundingClientRect(), to = this.field.getBoundingClientRect(), round = from.height / 2;
  return `inset(${(from.top - to.top).toFixed(1)}px ${(to.right - from.right).toFixed(1)}px ${(to.bottom - from.bottom).toFixed(1)}px ${(from.left - to.left).toFixed(1)}px round ${round}px)`;
 }

 // «View chat» becomes the field: the capsule grows out of the words, which step back, and the caret is there at once.
 ask() {
  if (this.asking || !this.conv) return;
  this.asking = true;
  const inset = reducedMotion() ? '' : this.inset();
  this.root.classList.add('is-asking');
  this.input.focus({ preventScroll: true });
  if (!inset) return;
  this.field.animate([{ clipPath: inset }, { clipPath: `inset(0px 0px 0px 0px round ${this.field.offsetHeight / 2}px)` }], SPRING.glass);
  this.view.animate([{ opacity: 1, filter: 'blur(0)', transform: 'none', visibility: 'visible' }, { opacity: 0, filter: 'blur(4px)', transform: 'scale(0.92)', visibility: 'visible' }], { duration: 200, easing: EASE.out });
  for (const node of [this.field.querySelector('.pass-hint'), this.pass.box]) {
   node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay: 140, easing: EASE.out, fill: 'backwards' });
  }
 }

 // The field folds back into the words it came out of.
 unask() {
  if (!this.asking) return;
  this.asking = false;
  this.pass.clear();
  this.go.disabled = true;
  this.say('');
  this.root.classList.remove('is-asking');
  this.view.focus({ preventScroll: true });
  if (reducedMotion()) return;
  this.field.animate([
   { clipPath: `inset(0px 0px 0px 0px round ${this.field.offsetHeight / 2}px)`, opacity: 1, visibility: 'visible' },
   { clipPath: this.inset(), opacity: 0, visibility: 'visible' },
  ], { duration: 300, easing: EASE.motion });
  this.view.animate([{ opacity: 0, filter: 'blur(4px)', transform: 'scale(0.92)' }, { opacity: 1, filter: 'blur(0)', transform: 'none' }], { duration: 320, delay: 120, easing: EASE.out, fill: 'backwards' });
 }

 reset() {
  for (const timer of this.timers) clearTimeout(timer);
  this.timers = [];
  this.waiting = false;
  this.asking = false;
  for (const animation of this.root.getAnimations({ subtree: true })) animation.cancel();
  this.root.classList.remove('is-checking', 'is-opening', 'is-asking');
  this.seal.style.visibility = '';
  setOpen(this.seal, 0);
  this.say('');
 }

 sync() {
  const conv = this.chat.active, locked = !!conv?.locked, before = this.last;
  this.last = conv;
  if (locked) {
   // The chat that was open a moment ago has just been locked: the frost comes over it and the padlock is seen to shut.
   if (this.conv !== conv) this.show(conv, conv === before && !this.conv);
   return;
  }
  if (this.conv) this.hide(this.conv === conv);
 }

 // The card is about to hand its padlock over: this chat's screen keeps its own out of sight until the flying one lands.
 expect(id) {
  this.expected = id || '';
 }

 // Where the padlock stands, how big it is and how thick its lines are, for one flying in.
 target() {
  const rect = this.seal.getBoundingClientRect();
  return { ...center(rect), size: rect.width, stroke: parseFloat(getComputedStyle(this.seal.querySelector('.seal-symbol')).strokeWidth) };
 }

 land() {
  if (!this.waiting) return;
  this.waiting = false;
  this.seal.style.visibility = '';
  if (!reducedMotion()) this.seal.animate([{ transform: 'scale(1.08)' }, { transform: 'none' }], SPRING.settle);
 }

 show(conv, shutting) {
  const root = this.root, incoming = this.expected === conv.id;
  this.reset();
  this.expected = '';
  this.conv = conv;
  this.pass.clear();
  this.go.disabled = true;
  root.hidden = false;
  this.main.classList.add('is-locked');
  this.composer.inert = true;
  requestAnimationFrame(() => { if (this.conv === conv && !this.asking) this.view.focus({ preventScroll: true }); });
  if (reducedMotion()) return;
  if (shutting) {
   // The chat freezes over: its messages blur and fade under the chat's own color, all that is left once it has set.
   this.frost.animate([
    { backdropFilter: 'blur(0px) saturate(1)', backgroundColor: this.cover(0) },
    { backdropFilter: 'blur(24px) saturate(1.4)', backgroundColor: this.cover(0.45), offset: 0.5 },
    { backdropFilter: 'blur(24px) saturate(1.4)', backgroundColor: this.cover(1) },
   ], { duration: FROST, easing: EASE.motion });
  } else {
   root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: EASE.out });
  }
  if (incoming) {
   // The card's padlock is on its way here, already shut.
   this.waiting = true;
   this.seal.style.visibility = 'hidden';
   spell(this.title, 260);
   rise([this.view], 520);
   return;
  }
  // Seen shutting, the padlock comes in open and bites; otherwise it simply comes up out of the blur, shut.
  this.seal.animate(
   [{ opacity: 0, transform: 'translateY(10px) scale(0.86)', filter: 'blur(8px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
   { duration: 700, easing: EASE.out },
  );
  if (shutting) {
   setOpen(this.seal, 1);
   this.later(() => setOpen(this.seal, 0, SPRING.snap), 380);
  }
  spell(this.title, shutting ? 180 : 90);
  rise([this.view], shutting ? 420 : 300);
 }

 // With the right password the shackle springs open, then the frost thaws off the chat, which comes forward into focus.
 hide(opened) {
  const root = this.root;
  this.conv = null;
  this.waiting = false;
  this.main.classList.remove('is-locked');
  this.composer.inert = false;
  if (!opened || reducedMotion()) {
   this.reset();
   this.pass.clear();
   root.hidden = true;
   return;
  }
  root.classList.remove('is-checking');
  root.classList.add('is-opening');
  setOpen(this.seal, 1, SPRING.open);
  const view = this.main.querySelector('.thread-view'), timing = { duration: OPENING.duration, delay: OPENING.thaw, easing: EASE.motion };
  const thaw = this.frost.animate([
   { backdropFilter: 'blur(24px) saturate(1.4)', backgroundColor: this.cover(1) },
   { backdropFilter: 'blur(24px) saturate(1.4)', backgroundColor: this.cover(0.5), offset: 0.3 },
   { backdropFilter: 'blur(0px) saturate(1)', backgroundColor: this.cover(0) },
  ], { ...timing, fill: 'both' });
  // The padlock and the words let go a moment before the chat shows through, so no trace of them lingers over it.
  this.body.animate([{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'scale(1.06)', filter: 'blur(10px)' }], { duration: 380, delay: OPENING.thaw - 60, easing: EASE.out, fill: 'both' });
  view?.animate([{ transform: 'scale(0.965)', opacity: 0.5 }, { transform: 'none', opacity: 1 }], { ...timing, duration: 760, fill: 'backwards' });
  this.composer.animate([{ transform: 'translateY(16px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { ...timing, duration: 700, delay: OPENING.thaw + 80, fill: 'backwards' });
  thaw.finished.then(() => {
   if (this.conv) return;
   root.hidden = true;
   this.reset();
   this.pass.clear();
  }, () => {});
  this.onOpen?.();
 }

 async submit() {
  const conv = this.conv, password = this.input.value;
  if (!conv || !password || this.checking) return;
  this.checking = true;
  this.root.classList.add('is-checking');
  this.say('');
  let opened = false, broken = false;
  try {
   opened = await this.chat.unlock(conv.id, password);
  } catch {
   broken = true;
  }
  this.checking = false;
  if (opened || this.conv !== conv) return;
  this.root.classList.remove('is-checking');
  this.say(broken ? 'lock.broken' : 'lock.wrong');
  this.go.disabled = true;
  shake(this.field);
  wiggle(this.seal);
  await this.pass.flush('fail');
  this.go.disabled = !this.input.value;
  if (this.conv === conv) this.input.focus({ preventScroll: true });
 }
}

// Beside a chat in the list, in the manner of the effort's stage. A capsule grows out of the chat's lock button and the
// button's padlock flies out into it; over the capsule the step stands in large type, its letters coming out of the padlock,
// with a line under it, and around it the app steps back softly, as around a selection. It puts a password on the chat in two
// steps, the way a passcode is set: typed once, then again. On a chat that already has one, it locks the chat now or takes the
// password off.
class LockCard {
 constructor({ chat, library, scroller, screen }) {
  Object.assign(this, { chat, library, screen });
  this.id = '';
  this.row = null;
  this.button = null;
  this.mode = '';
  this.step = 1;
  this.first = '';
  this.busy = false;
  this.timer = 0;
  this.field = null;
  this.words = null;
  this.plane = null;
  this.leaving = null;
  this.landing = null;
  const root = this.root = document.createElement('div');
  root.className = 'lock-card';
  root.setAttribute('popover', 'manual');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-labelledby', 'lock-card-title');
  root.innerHTML = '<div class="lock-veil"></div><div class="lock-card-body"></div>';
  document.body.append(root);
  const veil = root.querySelector('.lock-veil');
  this.patch = new StageVeil(veil);
  this.body = root.querySelector('.lock-card-body');
  root.addEventListener('submit', event => {
   event.preventDefault();
   this.submit();
  });
  root.addEventListener('click', event => this.onClick(event));
  root.addEventListener('input', () => this.onInput());
  root.addEventListener('keydown', event => this.onKey(event));
  veil.addEventListener('pointerdown', event => {
   event.preventDefault();
   this.close();
  });
  // A press anywhere else puts the card away; the lock button itself toggles it.
  document.addEventListener('pointerdown', event => {
   if (this.id && !root.contains(event.target) && !event.target.closest?.('[data-action="lock"]')) this.close();
  }, true);
  window.addEventListener('resize', () => this.close(true));
  scroller?.addEventListener('scroll', () => this.close(), { passive: true });
  // The title's face is found among the system's fonts ahead of time, so the first card doesn't wait for it.
  requestIdleCallback(() => document.fonts?.load('560 34px "OpenGhost Display"').catch(() => {}));
  // The veil keeps covering the stage when its words take more or less room.
  new ResizeObserver(() => { if (this.id) this.frost(); }).observe(this.body);
 }

 get seal() {
  return this.body.querySelector('.seal');
 }

 get capsule() {
  return this.body.querySelector('.lock-capsule');
 }

 get shell() {
  return this.body.querySelector('.lock-shell');
 }

 open(id, row) {
  if (this.id === id) { this.close(); return; }
  const record = this.library.chat(id);
  if (!record || this.chat.isBusy(id)) return;
  if (this.id) this.close(true);
  else this.hide();
  // A locked chat has nothing to set here: it opens onto its lock screen, where the password goes.
  if (this.chat.isLocked(id)) { this.chat.open(id); return; }
  this.id = id;
  this.row = row;
  this.button = row.querySelector('.chat-action.is-lock');
  this.mode = record.lock ? 'guard' : 'set';
  this.step = 1;
  this.first = '';
  this.render();
  this.root.showPopover();
  this.place();
  row.classList.add('is-carding');
  (this.body.querySelector('.pass-input') || this.body.querySelector('[data-act="lock"]'))?.focus({ preventScroll: true });
  this.title(this.mode === 'set' ? 'lock.set.title' : 'lock.guard.title', { delay: 150, instant: true });
  this.patch.bloom();
  if (!reducedMotion()) this.grow();
 }

 render() {
  const set = this.mode === 'set', key = set ? 'set' : 'guard';
  this.root.classList.toggle('is-set', set);
  this.root.classList.remove('is-busy');
  this.body.innerHTML = `
   <div class="lock-head">
    <span class="lock-card-label" id="lock-card-title"></span>
    <div class="lock-card-title" aria-hidden="true"></div>
    <div class="lock-say">
     <p class="lock-say-text">${t(`lock.${key}.text`)}</p>
     <p class="lock-say-alt lock-card-error" role="status"></p>
    </div>
   </div>
   <div class="lock-capsule">
    <div class="lock-shell"></div>
    ${seal()}
    ${set ? `
    <form class="lock-card-form" autocomplete="off">
     <div class="pass">
      <input class="pass-input lock-card-field" name="password" type="password" spellcheck="false" autocomplete="new-password" aria-label="${t('lock.password')}">
      <span class="pass-hint" aria-hidden="true">${t('lock.password')}</span>
      <button class="pass-go" type="submit" data-act="ok" aria-label="${t('lock.next')}" disabled>${ARROW}<i class="pass-spin"></i></button>
     </div>
    </form>` : `
    <div class="lock-actions">
     <button type="button" class="lock-act is-primary" data-act="lock">${t('lock.now')}</button>
     <span class="lock-divider" aria-hidden="true"></span>
     <button type="button" class="lock-act" data-act="remove">${t('lock.remove')}</button>
    </div>`}
   </div>
   ${set ? `<p class="lock-card-note">${t('lock.set.note')}</p>` : ''}`;
  this.words = new StageWord(this.body.querySelector('.lock-card-title'));
  const input = this.body.querySelector('.pass-input');
  this.field = input ? new PassField(input) : null;
  // A chat without a password shows its padlock open; so does a protected chat while it is open on screen.
  setOpen(this.seal, 1);
 }

 // The step in large type: its letters come out of the padlock, the old step melts away.
 title(key, { delay = 0, instant = false } = {}) {
  const text = I18n.t(key);
  this.body.querySelector('.lock-card-label').textContent = text;
  this.words.show(text, { from: center(this.seal.getBoundingClientRect()), delay });
  this.frost(instant);
 }

 // The capsule stands just right of the list, level with the chat's row when there is room for the title over it, and the
 // stage keeps clear of the window's edges.
 place() {
  const rect = this.row.getBoundingClientRect(), root = this.root, capsule = this.capsule;
  const width = root.offsetWidth, height = root.offsetHeight, level = capsule.offsetTop + capsule.offsetHeight / 2;
  const left = Math.round(Math.min(rect.right + GAP, innerWidth - width - EDGE));
  const top = Math.round(Math.min(Math.max(EDGE, rect.top + rect.height / 2 - level), innerHeight - height - EDGE));
  Object.assign(root.style, { left: `${left}px`, top: `${top}px` });
 }

 // The veil's patch covers the title, its line, the capsule and the note, and grows out of the lock button.
 frost(instant = false) {
  if (!this.id || !this.root.matches(':popover-open')) return;
  const frame = this.root.getBoundingClientRect(), local = el => el && within(el.getBoundingClientRect(), frame);
  const from = this.button?.getBoundingClientRect() || this.capsule.getBoundingClientRect();
  const boxes = [this.words?.word, this.body.querySelector('.lock-say'), this.capsule, this.body.querySelector('.lock-card-note')].map(local);
  this.patch.fit(boxes, { x: from.left + from.width / 2 - frame.left, y: from.top + from.height / 2 - frame.top }, instant);
 }

 // The capsule grows out of the lock button with a little give, the padlock flies out of the button into it, and what the
 // capsule holds comes up as it grows; the title's letters come out of the padlock, the lines under and over follow.
 grow() {
  const from = this.button?.getBoundingClientRect(), to = this.capsule.getBoundingClientRect();
  if (from?.width) {
   this.shell.animate([
    { left: `${from.left - to.left}px`, top: `${from.top - to.top}px`, width: `${from.width}px`, height: `${from.height}px`, opacity: 0 },
    { opacity: 1, offset: 0.1 },
    { left: '0px', top: '0px', width: `${to.width}px`, height: `${to.height}px`, opacity: 1 },
   ], SPRING.glass);
   this.launch();
  } else {
   this.shell.animate([{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }], SPRING.glass);
  }
  // Nothing inside a text field blurs or slides, so the field only fades in.
  this.body.querySelector('.lock-card-form')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, delay: 160, easing: EASE.out, fill: 'backwards' });
  rise([this.body.querySelector('.lock-actions')], 140);
  rise([...this.body.querySelectorAll('.lock-say, .lock-card-note')], 320);
 }

 // The button's padlock lifts off and lands at the capsule's start, opening on the way.
 launch() {
  const glyph = this.button.querySelector('.glyph')?.getBoundingClientRect(), box = this.seal.getBoundingClientRect();
  if (!glyph?.width) return;
  // It leaves at once, with the capsule, and slows as it comes to its place.
  const timing = { duration: FLIGHT.in, easing: EASE.motion };
  const plane = this.plane = flyer(this.root, box.width, 0);
  this.seal.style.visibility = 'hidden';
  this.button.classList.add('is-away');
  crossover(plane, false, timing);
  setOpen(plane.firstElementChild, 1, { ...SPRING.open, delay: 180 });
  fly(plane, { ...center(glyph), size: boxFor(glyph) }, { ...center(box), size: box.width }, { ...timing, bend: 0.16 }).finished.then(() => {
   if (this.plane !== plane) return;
   this.ground();
   this.seal.animate([{ transform: 'scale(1.08)' }, { transform: 'none' }], SPRING.settle);
  }, () => {});
 }

 // A padlock still on its way to the capsule is there at once.
 ground() {
  this.plane?.remove();
  this.plane = null;
  if (this.seal) this.seal.style.visibility = '';
 }

 onInput() {
  if (!this.field || this.busy) return;
  this.body.querySelector('[data-act="ok"]').disabled = !this.field.input.value;
  // Typing again clears what went wrong, and the line goes back to telling the step.
  if (this.body.querySelector('.lock-say').classList.contains('is-wrong')) this.say(this.step === 2 ? 'lock.set.again' : '');
 }

 // The line under the title tells the step, or what went wrong.
 say(key, wrong = false) {
  const saying = this.body.querySelector('.lock-say');
  if (!saying) return;
  if (key) saying.lastElementChild.textContent = I18n.t(key);
  saying.classList.toggle('is-alt', !!key);
  saying.classList.toggle('is-wrong', !!key && wrong);
 }

 // From the first password to its repeat and back: the title changes, the line tells the step, the dots fold away, and the
 // shackle comes most of the way down, ready to bite, or goes back up.
 toStep(step, { error = '', flush = 'step' } = {}) {
  const turned = step !== this.step, second = step === 2, go = this.body.querySelector('[data-act="ok"]');
  this.step = step;
  if (flush) this.field.flush(flush);
  go.setAttribute('aria-label', I18n.t(second ? 'lock.set.ok' : 'lock.next'));
  go.disabled = true;
  this.field.input.setAttribute('aria-label', I18n.t(second ? 'lock.repeat' : 'lock.password'));
  this.say(error || (second ? 'lock.set.again' : ''), !!error);
  if (turned) this.title(second ? 'lock.repeat' : 'lock.set.title');
  setOpen(this.seal, second ? 0.4 : 1, SPRING.snap);
  this.field.input.focus({ preventScroll: true });
 }

 async submit() {
  if (this.mode !== 'set' || this.busy || !this.field) return;
  const value = this.field.input.value;
  if (!value) return;
  if (this.step === 1) {
   this.first = value;
   this.toStep(2);
   return;
  }
  const id = this.id;
  if (value !== this.first) {
   this.first = '';
   shake(this.capsule);
   wiggle(this.seal);
   this.toStep(1, { error: 'lock.mismatch', flush: 'fail' });
   return;
  }
  const seal = this.seal;
  this.first = '';
  this.busy = true;
  this.root.classList.add('is-busy');
  this.field.frozen = true;
  this.field.input.readOnly = true;
  this.say('lock.set.busy');
  setOpen(seal, 0, SPRING.snap);
  // Only the chat on screen has a lock screen for the padlock to fly to.
  if (this.chat.active?.id === id) this.screen?.expect(id);
  const [done] = await Promise.all([this.chat.protect(id, value).catch(() => false), wait(reducedMotion() ? 0 : SHUT_TIME)]);
  this.busy = false;
  if (this.id !== id) {
   this.screen?.expect('');
   this.screen?.land();
   return;
  }
  // Locked, the spinner keeps turning while the stage goes; it only gives way to the arrow if the chat couldn't be locked.
  if (!done) {
   this.root.classList.remove('is-busy');
   this.field.input.readOnly = false;
   this.screen?.expect('');
   this.field.clear();
   this.toStep(1, { error: 'lock.failed', flush: null });
   return;
  }
  this.field.wipe();
  this.depart();
 }

 onClick(event) {
  const button = event.target.closest('[data-act]');
  if (!button || this.busy) return;
  if (button.dataset.act === 'lock') this.lockNow();
  else if (button.dataset.act === 'remove') this.remove(button);
 }

 // The shackle is seen to bite in the capsule; then the chat locks and the padlock flies over to its lock screen.
 lockNow() {
  const id = this.id;
  this.busy = true;
  setOpen(this.seal, 0, SPRING.snap);
  setTimeout(() => {
   this.busy = false;
   if (this.id !== id) return;
   if (this.chat.active?.id === id) this.screen?.expect(id);
   this.chat.lock(id);
   this.depart();
  }, reducedMotion() ? 0 : SHUT_TIME);
 }

 // The stage melts away while its shut padlock flies to where the chat's lock now shows: its lock screen when the chat is on
 // screen, or else the small padlock in its row, which it turns back into on the way.
 depart() {
  const row = this.row, seal = this.seal, screen = this.screen;
  const onScreen = !!screen?.waiting;
  const guard = row?.querySelector('.chat-guard .glyph')?.getBoundingClientRect();
  const target = onScreen ? screen.target() : guard?.width ? { ...center(guard), size: boxFor(guard) } : null;
  const box = seal.getBoundingClientRect();
  this.release();
  if (!onScreen) screen?.expect('');
  if (reducedMotion() || !target) {
   this.hide();
   screen?.land();
   return;
  }
  const plane = this.plane = flyer(this.root, Math.max(box.width, target.size), 0);
  seal.style.visibility = 'hidden';
  if (!onScreen) {
   row.classList.add('is-guard-away');
   crossover(plane, true, { duration: FLIGHT.out, easing: EASE.flight });
  } else {
   // Growing on its way to the locked chat, its lines stay as thin as the padlock's there.
   const symbol = plane.querySelector('.seal-symbol');
   symbol.animate([{ strokeWidth: getComputedStyle(symbol).strokeWidth }, { strokeWidth: `${target.stroke}px` }], { duration: FLIGHT.out, easing: EASE.flight, fill: 'both' });
  }
  this.fade();
  this.capsule.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.96)' }], { duration: 300, delay: 40, easing: EASE.out, fill: 'forwards' });
  this.patch.lift(Dock.lift);
  const landed = this.landing = () => {
   row?.classList.remove('is-guard-away');
   if (onScreen) screen.land();
   else if (!reducedMotion()) row?.querySelector('.chat-guard')?.animate([{ transform: 'scale(1.3)' }, { transform: 'none' }], SPRING.settle);
  };
  quiet(fly(plane, { ...center(box), size: box.width }, target, { duration: FLIGHT.out, bend: onScreen ? 0.16 : -0.2 })).then(() => {
   if (this.landing !== landed) return;
   this.landing = null;
   landed();
   if (!this.id) this.hide();
  });
 }

 // The title dissolves and the lines over and under the capsule fade.
 fade() {
  this.words?.fade();
  for (const el of this.body.querySelectorAll('.lock-say, .lock-card-note')) el.animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(4px)' }], { duration: 200, easing: EASE.out, fill: 'forwards' });
 }

 // Taking the password off asks twice, the way deleting a chat does; then the shackle comes right out and the padlock fades.
 async remove(button) {
  if (!button.classList.contains('is-confirming')) {
   button.classList.add('is-confirming');
   this.relabel(button, 'lock.remove.confirm');
   clearTimeout(this.timer);
   this.timer = setTimeout(() => {
    button.classList.remove('is-confirming');
    this.relabel(button, 'lock.remove');
   }, CONFIRM_TIME);
   return;
  }
  clearTimeout(this.timer);
  const id = this.id;
  this.busy = true;
  const done = await this.chat.unprotect(id).catch(() => false);
  if (done && !reducedMotion() && this.id === id) {
   const seal = this.seal;
   setOpen(seal, 1.7, SPRING.open);
   await quiet(seal.animate([{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'scale(0.86)', filter: 'blur(8px)' }], { duration: 380, delay: 180, easing: EASE.in, fill: 'forwards' }));
  }
  this.busy = false;
  if (this.id !== id) return;
  const row = this.row;
  this.close();
  row?.focus({ preventScroll: true });
 }

 // A button's words change and the capsule around them follows their width.
 relabel(button, key) {
  const from = this.capsule.offsetWidth;
  relabel(button, key);
  const to = this.capsule.offsetWidth;
  if (!reducedMotion() && from !== to) this.shell.animate([{ width: `${from}px` }, { width: `${to}px` }], { duration: 420, easing: EASE.motion });
 }

 onKey(event) {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  const row = this.row;
  this.close();
  row?.focus({ preventScroll: true });
 }

 // The card lets go of its chat: nothing typed into it stays behind.
 release() {
  this.id = '';
  this.first = '';
  clearTimeout(this.timer);
  this.field?.wipe();
  this.row?.classList.remove('is-carding');
  this.button?.classList.remove('is-away');
 }

 // The title dissolves, the padlock flies back into the lock button, shutting on its way, and the capsule folds into the button.
 close(instant = false) {
  if (!this.id) return;
  const button = this.button, glyph = button?.querySelector('.glyph');
  const back = !instant && !reducedMotion() && !!button?.getBoundingClientRect().width;
  this.release();
  if (!back) {
   this.hide();
   return;
  }
  this.ground();
  button.classList.add('is-away');
  for (const el of [this.capsule, this.shell, this.seal, ...this.body.querySelectorAll('.lock-say, .lock-card-note, .lock-card-form, .lock-actions')]) {
   for (const animation of el?.getAnimations() || []) animation.cancel();
  }
  const from = this.capsule.getBoundingClientRect(), to = button.getBoundingClientRect(), mark = glyph?.getBoundingClientRect(), seal = this.seal, box = seal.getBoundingClientRect();
  this.fade();
  this.body.querySelector('.lock-card-form, .lock-actions')?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: EASE.out, fill: 'forwards' });
  const waits = [];
  if (mark?.width) {
   const timing = { duration: FLIGHT.back, easing: EASE.motion };
   const plane = this.plane = flyer(this.root, box.width, 1);
   seal.style.visibility = 'hidden';
   crossover(plane, true, timing);
   setOpen(plane.firstElementChild, 0, SPRING.snap);
   waits.push(quiet(fly(plane, { ...center(box), size: box.width }, { ...center(mark), size: boxFor(mark) }, { ...timing, bend: -0.16 })));
  }
  const fold = this.leaving = this.shell.animate([
   { left: '0px', top: '0px', width: `${from.width}px`, height: `${from.height}px`, opacity: 1 },
   { opacity: 1, offset: 0.7 },
   { left: `${to.left - from.left}px`, top: `${to.top - from.top}px`, width: `${to.width}px`, height: `${to.height}px`, opacity: 0 },
  ], { duration: 380, easing: EASE.motion, fill: 'forwards' });
  waits.push(quiet(fold), quiet(this.patch.lift(Dock.lift)));
  Promise.all(waits).then(() => {
   if (this.leaving !== fold) return;
   this.hide();
   button.classList.remove('is-away');
   glyph?.animate([{ transform: 'scale(0.86)' }, { transform: 'none' }], SPRING.settle);
  });
 }

 // Whatever is still moving comes to rest at once, a padlock still flying lands, and the card is gone.
 hide() {
  const landing = this.landing;
  this.landing = null;
  this.leaving = null;
  landing?.();
  this.ground();
  for (const animation of this.root.getAnimations({ subtree: true })) animation.cancel();
  if (this.root.matches(':popover-open')) this.root.hidePopover();
  this.words?.clear();
  this.words = null;
  this.body.replaceChildren();
  this.field = null;
 }
}

window.LockScreen = LockScreen;
window.LockCard = LockCard;
})();
