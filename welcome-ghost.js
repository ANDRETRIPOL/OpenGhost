(() => {
'use strict';

const LEAVE_TIME = 520;
const FLIGHT = {
 duration: 720,
 x: 'cubic-bezier(0.5, 0, 0.3, 1)',
 y: 'cubic-bezier(0.25, 0.7, 0.3, 1)',
 scale: 'cubic-bezier(0.45, 0, 0.3, 1)',
 tilt: 8,
};
const HANDOFF = { duration: 160, easing: 'ease', fill: 'forwards' };
const EYES = { x: 4, up: 2.4, down: 2.2, center: 0.49, reach: 90 };
const TYPING_GAZE = 1400;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

class WelcomeGhost {
 constructor({ main, root, input }) {
  this.main = main;
  this.root = root;
  this.flight = root.querySelector('.welcome-flight');
  this.ghost = null;
  this.shown = false;
  this.generation = 0;
  this.timer = 0;
  this.frame = 0;
  new MutationObserver(() => this.sync()).observe(main, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('pointermove', event => this.lookAt(event.clientX, event.clientY), { passive: true });
  input.addEventListener('input', () => {
   if (this.shown) this.ghost?.look(0, EYES.down, TYPING_GAZE);
  });
  this.sync();
 }

 sync() {
  const empty = this.main.classList.contains('is-empty');
  if (empty === this.shown) return;
  this.shown = empty;
  if (empty) this.enter();
  else this.leave();
 }

 enter() {
  this.reset();
  this.ghost = document.createElement('ghost-thinking');
  this.flight.append(this.ghost);
  void this.root.offsetWidth;
  this.root.classList.add('is-shown');
 }

 leave() {
  const generation = this.generation, ghost = this.ghost, status = this.status();
  // A window too low for the welcome hides it; with nothing on screen to fly, the thread's own ghost shows at once.
  if (!ghost || reducedMotion() || !this.flight.getBoundingClientRect().width) { this.reset(); return; }
  if (!status) {
   this.root.classList.replace('is-shown', 'is-leaving');
   ghost.look(0, -EYES.up, LEAVE_TIME);
   this.timer = setTimeout(() => this.reset(), LEAVE_TIME);
   return;
  }
  this.root.classList.replace('is-shown', 'is-flying');
  // The welcome stands where the composer's height puts it, and a long message leaves a shorter composer behind: its place
  // is held for the flight. Wherever the agent's ghost moves meanwhile, the flight bends to meet it (see follow).
  this.root.style.top = `${this.root.offsetTop}px`;
  this.root.style.left = `${this.root.offsetLeft}px`;
  status.classList.add('is-arriving');
  for (const animation of status.getAnimations()) animation.finish();
  const target = status.querySelector('ghost-thinking');
  const from = this.flight.getBoundingClientRect(), to = target.getBoundingClientRect();
  const dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const timing = { duration: FLIGHT.duration, fill: 'forwards' }, len = Math.hypot(dx, dy) || 1;
  ghost.look(dx / len * EYES.x, dy / len * EYES.up, FLIGHT.duration);
  const flight = this.root.animate({ translate: ['0 0', `${dx}px 0`] }, { ...timing, easing: FLIGHT.x });
  const fall = this.flight.animate({ translate: ['0 0', `0 ${dy}px`] }, { ...timing, easing: FLIGHT.y });
  this.flight.animate({ scale: [1, to.width / from.width] }, { ...timing, easing: FLIGHT.scale });
  this.flight.animate({ rotate: ['0deg', `${Math.sign(dx) * FLIGHT.tilt}deg`, '0deg'], offset: [0, 0.4, 1] }, { duration: FLIGHT.duration, easing: 'ease-in-out' });
  this.follow(generation, target, to, flight, fall);
  flight.finished.then(() => {
   if (generation !== this.generation) return;
   status.classList.remove('is-arriving');
   return this.root.animate({ opacity: [1, 0] }, HANDOFF).finished.then(() => {
    if (generation === this.generation) this.reset();
   });
  }).catch(() => {});
 }

 // How far the agent's ghost has moved since the flight set off, added in step with the flight along each axis, so the
 // welcome lands on it wherever it is now and stays on it while it fades.
 follow(generation, target, to, flight, fall) {
  const step = () => {
   if (generation !== this.generation) return;
   const now = target.getBoundingClientRect(), x = now.left - to.left, y = now.top - to.top;
   const along = animation => animation.effect.getComputedTiming().progress ?? 1;
   this.root.style.transform = x || y ? `translate(${x * along(flight)}px, ${y * along(fall)}px)` : '';
   this.frame = requestAnimationFrame(step);
  };
  this.frame = requestAnimationFrame(step);
 }

 status() {
  const status = this.main.querySelector('.thread-list:not(.is-parked) > .message.is-assistant:last-child > .message-status');
  return status && !status.classList.contains('is-leaving') && status.querySelector('ghost-thinking') ? status : null;
 }

 reset() {
  this.generation++;
  clearTimeout(this.timer);
  cancelAnimationFrame(this.frame);
  this.root.style.top = this.root.style.left = this.root.style.transform = '';
  for (const animation of this.root.getAnimations({ subtree: true })) animation.cancel();
  for (const status of this.main.querySelectorAll('.message-status.is-arriving')) status.classList.remove('is-arriving');
  this.root.classList.remove('is-shown', 'is-leaving', 'is-flying');
  this.ghost?.remove();
  this.ghost = null;
 }

 lookAt(x, y) {
  if (!this.shown || !this.ghost) return;
  const box = this.root.getBoundingClientRect();
  const dx = x - (box.left + box.width / 2), dy = y - (box.top + box.height * EYES.center);
  const len = Math.hypot(dx, dy) || 1, reach = len / (len + EYES.reach);
  this.ghost.look(dx / len * reach * EYES.x, dy / len * reach * (dy < 0 ? EYES.up : EYES.down));
 }
}

window.WelcomeGhost = WelcomeGhost;
})();
