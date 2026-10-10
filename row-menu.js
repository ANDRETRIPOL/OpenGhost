(() => {
'use strict';

// The small menu of a chat's row in the sidebar. The row itself keeps two buttons, the pin and three dots; the dots
// call this menu, which stands over the chat right beside the row: rename, the password, delete. It is the app's glass
// and comes and goes as the search and the usage panel do. Deleting asks twice, the way it always has: the first press
// turns the line into the question, the second deletes.
const OPEN = { duration: 133, easing: 'cubic-bezier(0.37, 0, 0.63, 1)' };
const CLOSE = { duration: 110, easing: 'ease-out', fill: 'forwards' };
const FROM = { opacity: 0, transform: 'scale(1.09, 0.96)', filter: 'blur(4px)' };
const REST = { opacity: 1, transform: 'none', filter: 'blur(0px)' };
const AWAY = { opacity: 0, transform: 'scale(1.06)', filter: 'blur(12px)' };
const CONFIRM_TIME = 4000;
// The menu keeps this far from the row and from the window's edges.
const GAP = 16;
const EDGE = 8;

// The highlight follows the pointer on the springs the list of chats has: it keeps its speed from line to line, and
// fades in and out.
const GLIDE_SPRING = [520, 40];
const FADE_SPRING = [320, 32];
function spring(s, goal, [k, c], dt) {
 const steps = Math.max(1, Math.ceil(dt / 0.008)), h = dt / steps;
 for (let i = 0; i < steps; i++) { s[1] += ((goal - s[0]) * k - s[1] * c) * h; s[0] += s[1] * h; }
 if (Math.abs(goal - s[0]) < 0.01 && Math.abs(s[1]) < 0.05) { s[0] = goal; s[1] = 0; return false; }
 return true;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

class RowMenu {
 // items(id): the lines to show, each { name, label, icon, disabled }; act(name, id, row): one was chosen.
 constructor({ items, act, scroller }) {
  Object.assign(this, { items, act });
  this.id = '';
  this.row = null;
  this.button = null;
  this.armed = null;
  this.timer = 0;
  this.leaving = null;
  // The highlight: where it is and how fast it goes, how much of it shows, and the line it is going to.
  this.g = { y: [0, 0], o: [0, 0] };
  this.pointed = null;
  this.raf = 0;
  this.last = 0;
  this.tick = this.tick.bind(this);
  const root = this.root = Object.assign(document.createElement('div'), { className: 'row-menu glass-lens' });
  root.setAttribute('popover', 'manual');
  root.setAttribute('role', 'menu');
  document.body.append(root);
  root.addEventListener('click', event => {
   const line = event.target.closest('.row-menu-line');
   if (line && !line.disabled) this.choose(line);
  });
  root.addEventListener('keydown', event => this.onKey(event));
  root.addEventListener('pointermove', event => this.point(event.target.closest?.('.row-menu-line:not(:disabled)') || null));
  root.addEventListener('pointerleave', () => this.point(null));
  root.addEventListener('focusin', event => this.point(event.target.closest?.('.row-menu-line') || null));
  // A press anywhere else puts the menu away; the dots themselves toggle it.
  document.addEventListener('pointerdown', event => {
   if (this.id && !root.contains(event.target) && !event.target.closest?.('[data-action="more"]')) this.close();
  }, true);
  window.addEventListener('resize', () => this.close(true));
  scroller?.addEventListener('scroll', () => this.close(), { passive: true });
 }

 toggle(id, row, button) {
  if (this.id === id) { this.close(); return; }
  this.open(id, row, button);
 }

 open(id, row, button) {
  if (this.id) this.finish();
  const lines = this.items(id);
  if (!lines?.length) return;
  Object.assign(this, { id, row, button });
  this.glide = Object.assign(document.createElement('span'), { className: 'row-menu-glide' });
  this.glide.setAttribute('aria-hidden', 'true');
  this.g = { y: [0, 0], o: [0, 0] };
  this.pointed = null;
  this.root.replaceChildren(this.glide, ...lines.map(({ name, label, icon, disabled }) => {
   const line = Object.assign(document.createElement('button'), { type: 'button', className: `row-menu-line is-${name}`, disabled: !!disabled });
   line.dataset.name = name;
   line.setAttribute('role', 'menuitem');
   line.innerHTML = `${icon}<span class="row-menu-word"></span>`;
   line.querySelector('.row-menu-word').textContent = label;
   return line;
  }));
  this.root.showPopover();
  this.place();
  row.classList.add('is-carding');
  button.setAttribute('aria-expanded', 'true');
  this.root.querySelector('.row-menu-line:not(:disabled)')?.focus({ preventScroll: true });
  this.root.animate(reducedMotion() ? [{ opacity: 0 }, { opacity: 1 }] : [FROM, REST], OPEN);
 }

 // The menu stands just right of the list, level with the row, inside the window.
 place() {
  const rect = this.row.getBoundingClientRect(), root = this.root;
  const left = Math.round(Math.min(rect.right + GAP, innerWidth - root.offsetWidth - EDGE));
  const top = Math.round(Math.min(Math.max(EDGE, rect.top + rect.height / 2 - 24), innerHeight - root.offsetHeight - EDGE));
  Object.assign(root.style, { left: `${left}px`, top: `${top}px` });
 }

 // The highlight goes to the line under the pointer or the keys.
 point(line) {
  if (line === this.pointed) return;
  this.pointed = line;
  if (this.raf) return;
  this.last = performance.now();
  this.raf = requestAnimationFrame(this.tick);
 }

 tick(now) {
  this.raf = 0;
  const glide = this.glide, line = this.pointed?.isConnected ? this.pointed : null;
  if (!glide?.isConnected) return;
  const dt = Math.min(Math.max((now - this.last) / 1000, 0), 0.032), g = this.g;
  this.last = now;
  let moving = false;
  if (reducedMotion()) {
   if (line) g.y = [line.offsetTop, 0];
   g.o = [line ? 1 : 0, 0];
  } else {
   // Coming in, it appears on its line and fades up there; it slides only from line to line.
   if (line && g.o[0] < 0.02) g.y = [line.offsetTop, 0];
   if (line) moving = spring(g.y, line.offsetTop, GLIDE_SPRING, dt) || moving;
   moving = spring(g.o, line ? 1 : 0, FADE_SPRING, dt) || moving;
  }
  glide.style.transform = `translateY(${g.y[0].toFixed(2)}px)`;
  glide.style.opacity = Math.min(1, Math.max(0, g.o[0])).toFixed(3);
  if (moving) this.raf = requestAnimationFrame(this.tick);
 }

 choose(line) {
  const name = line.dataset.name;
  // Deleting asks twice.
  if (name === 'delete' && this.armed !== line) {
   this.armed = line;
   line.classList.add('is-confirming');
   line.querySelector('.row-menu-word').textContent = I18n.t('chat.deleteConfirm');
   clearTimeout(this.timer);
   this.timer = setTimeout(() => {
    if (this.armed !== line) return;
    this.armed = null;
    line.classList.remove('is-confirming');
    line.querySelector('.row-menu-word').textContent = I18n.t('chat.delete');
   }, CONFIRM_TIME);
   return;
  }
  const { id, row } = this;
  this.close(true);
  this.act(name, id, row);
 }

 onKey(event) {
  if (event.key === 'Escape') {
   event.preventDefault();
   const row = this.row;
   this.close();
   row?.focus({ preventScroll: true });
   return;
  }
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (!step) return;
  event.preventDefault();
  const lines = [...this.root.querySelectorAll('.row-menu-line:not(:disabled)')], at = lines.indexOf(document.activeElement);
  lines[(Math.max(0, at) + step + lines.length) % lines.length]?.focus({ preventScroll: true });
 }

 close(instant = false) {
  if (!this.id) return;
  this.release();
  if (instant || !this.root.matches(':popover-open')) { this.finish(); return; }
  const gone = this.leaving = this.root.animate(reducedMotion() ? { opacity: 0 } : AWAY, CLOSE);
  const done = () => { if (this.leaving === gone) this.finish(); };
  gone.finished.then(done, done);
 }

 // The menu lets go of its row.
 release() {
  clearTimeout(this.timer);
  this.armed = null;
  this.row?.classList.remove('is-carding');
  this.button?.setAttribute('aria-expanded', 'false');
  this.id = '';
 }

 finish() {
  if (this.id) this.release();
  this.leaving = null;
  for (const animation of this.root.getAnimations()) animation.cancel();
  if (this.root.matches(':popover-open')) this.root.hidePopover();
 }
}

window.RowMenu = RowMenu;
})();
