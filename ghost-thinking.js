(() => {
'use strict';

const EYE_Y = 29.5;
const EYE_X = [17, 41];
const POSES = [
 { x: 0, y: 0, sx: 1, sy: 1 },
 { x: -4, y: 0, sx: 1, sy: 1 },
 { x: 4, y: 0, sx: 1, sy: 1 },
 { x: -3.2, y: -2.4, sx: 1, sy: 1 },
 { x: 3.2, y: -2.4, sx: 1, sy: 1 },
 { x: -2.6, y: 1.8, sx: 1, sy: 1 },
 { x: 2.6, y: 1.8, sx: 1, sy: 1 },
 { x: 0, y: 1.2, sx: 1.14, sy: 0.34 },
 { x: -3.5, y: 0.8, sx: 1.1, sy: 0.42 },
 { x: 3.5, y: 0.8, sx: 1.1, sy: 0.42 },
 { x: 0, y: -0.8, sx: 1.24, sy: 1.34 },
 { x: 0, y: -1.6, sx: 1.18, sy: 1.26 },
];
const MOVE_SPRING = [260, 24];
const SHAPE_SPRING = [320, 26];
const HOLD = [650, 1500];
const BLINK_EVERY = [2200, 4800];
const BLINK_DURATION = 150;
const FLOAT = { period: 2.6, amp: 1.6 };
const SWAY = { period: 1.3, amp: 1.3 };
const GAZE_HOLD = 1800;

const STYLE = `
:host{display:block}
svg{display:block;width:100%;height:100%;overflow:visible}
.shape{fill:rgb(var(--ghost-rgb,250,250,250))}
.eye{fill:var(--ghost-eye,rgb(25,25,25))}
`;

const random = ([min, max]) => min + Math.random() * (max - min);
const fixed = n => n.toFixed(2);

function bodyPath(s) {
 const left = (5 + s) / 2, right = (5 - s) / 2;
 return `M0 29A29 29 0 0 1 58 29L58 57A${fixed(right)} ${fixed(right)} 0 0 1 ${fixed(53 + s)} 57`
  + `A6 6 0 0 0 ${fixed(41 + s)} 57A3 3 0 0 1 ${fixed(35 + s)} 57`
  + `A6 6 0 0 0 ${fixed(23 + s)} 57A3 3 0 0 1 ${fixed(17 + s)} 57`
  + `A6 6 0 0 0 ${fixed(5 + s)} 57A${fixed(left)} ${fixed(left)} 0 0 1 0 57Z`;
}

class GhostThinking extends HTMLElement {
 constructor() {
  super();
  this.attachShadow({ mode: 'open' }).innerHTML = `<style>${STYLE}</style>
   <svg viewBox="-3 -5 64 70" aria-hidden="true"><g class="body"><path class="shape" d="${bodyPath(0)}"/>
   <ellipse class="eye" rx="3.8" ry="4.1" transform="translate(${EYE_X[0]} ${EYE_Y})"/><ellipse class="eye" rx="3.8" ry="4.1" transform="translate(${EYE_X[1]} ${EYE_Y})"/></g></svg>`;
  this.body = this.shadowRoot.querySelector('.body');
  this.shape = this.shadowRoot.querySelector('.shape');
  this.eyes = [...this.shadowRoot.querySelectorAll('.eye')];
  this.raf = 0;
  this.tick = this.tick.bind(this);
 }

 connectedCallback() {
  this.setAttribute('role', 'img');
  this.setAttribute('aria-label', I18n.t('chat.thinking'));
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const now = performance.now();
  this.start = now;
  this.last = now;
  this.pose = POSES[0];
  this.nextPose = now + random(HOLD) * 0.6;
  this.nextBlink = now + random(BLINK_EVERY) * 0.5;
  this.blinkAt = -Infinity;
  this.eye = { x: [0, 0], y: [0, 0], sx: [1, 0], sy: [1, 0] };
  this.raf = requestAnimationFrame(this.tick);
 }

 disconnectedCallback() {
  cancelAnimationFrame(this.raf);
  this.raf = 0;
 }

 look(x, y, hold = GAZE_HOLD) {
  this.gaze = { x, y, sx: 1, sy: 1 };
  this.gazeUntil = performance.now() + hold;
 }

 pickPose() {
  if (this.pose !== POSES[0] && Math.random() < 0.3) return POSES[0];
  let pose;
  do pose = POSES[1 + Math.floor(Math.random() * (POSES.length - 1))]; while (pose === this.pose);
  return pose;
 }

 tick(now) {
  const dt = Math.min((now - this.last) / 1000, 0.032);
  this.last = now;
  if (this.gaze && now >= this.gazeUntil) {
   this.gaze = null;
   this.nextPose = now + random(HOLD) * 0.5;
  }
  if (!this.gaze && now >= this.nextPose) {
   this.pose = this.pickPose();
   this.nextPose = now + random(HOLD);
  }
  const pose = this.gaze || this.pose;
  if (now >= this.nextBlink) {
   this.blinkAt = now;
   this.nextBlink = now + random(BLINK_EVERY);
  }
  const steps = Math.max(1, Math.ceil(dt / 0.008)), step = dt / steps;
  for (const name of ['x', 'y', 'sx', 'sy']) {
   const s = this.eye[name], [k, c] = name.length === 1 ? MOVE_SPRING : SHAPE_SPRING, goal = pose[name];
   for (let i = 0; i < steps; i++) { s[1] += ((goal - s[0]) * k - s[1] * c) * step; s[0] += s[1] * step; }
  }
  const blinkT = (now - this.blinkAt) / BLINK_DURATION;
  const blink = blinkT < 1 ? 1 - 0.92 * Math.sin(Math.PI * blinkT) : 1;
  const t = (now - this.start) / 1000;
  const float = Math.sin(t * 2 * Math.PI / FLOAT.period) * FLOAT.amp;
  const sway = Math.sin(t * 2 * Math.PI / SWAY.period) * SWAY.amp;
  const { x, y, sx, sy } = this.eye;
  this.body.setAttribute('transform', `translate(0 ${fixed(float)})`);
  this.shape.setAttribute('d', bodyPath(sway));
  for (let i = 0; i < 2; i++) {
   this.eyes[i].setAttribute('transform', `translate(${fixed(EYE_X[i] + x[0])} ${fixed(EYE_Y + y[0])}) scale(${sx[0].toFixed(3)} ${Math.max(0.05, sy[0] * blink).toFixed(3)})`);
  }
  this.raf = requestAnimationFrame(this.tick);
 }
}

if (!customElements.get('ghost-thinking')) customElements.define('ghost-thinking', GhostThinking);
})();
