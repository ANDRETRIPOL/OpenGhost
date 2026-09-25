(() => {
'use strict';

const EFFORTS = ['none', 'low', 'high', 'max'];
const LAST = EFFORTS.length - 1;
const DEFAULT = EFFORTS.indexOf('high');
const FOLLOW = [1400, 75];
const SETTLE = [320, 26];
const STRETCH = [520, 34];
const PRESS = [420, 30];
const LENS = { width: 36, height: 24 };
const PRESS_GROW = 0.1;
const TRACK_CAP = 3;
const GRAB_SLOP = 6;
const MAGNET = { reach: 0.22, pull: 0.45 };
const RUBBER = { limit: 0.16, k: 0.55 };
const FLING = 0.06;
const STRETCH_PER_SPEED = 0.035;
const STRETCH_MAX = 0.3;
const PAINT_ZONE = { enter: LAST - 0.4, leave: LAST - 0.6 };
const LENS_REVEAL = { from: 0.88, fade: 0.96, scale: 0.55 };
const PAINT_FADE = [0.55, 1];
const PAINT_ARRIVE = [0.92, 0.96];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const backOut = v => 1 + 2.2 * (v - 1) ** 3 + 1.2 * (v - 1) ** 2;
const rubber = d => (1 - 1 / (d * RUBBER.k / RUBBER.limit + 1)) * RUBBER.limit;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

class EffortSlider {
 constructor({ button, panel, settings }) {
  this.button = button;
  this.panel = panel;
  this.settings = settings;
  this.slider = panel.querySelector('.effort-slider');
  this.track = panel.querySelector('.effort-track');
  this.fill = panel.querySelector('.effort-fill');
  this.thumb = panel.querySelector('.effort-thumb');
  this.thumb.style.width = `${LENS.width}px`;
  this.thumb.style.height = `${LENS.height}px`;
  new LiquidGlass(this.thumb, LENS);
  this.paint = new EffortPaint(panel);
  this.painted = false;
  this.opened = false;
  this.lens = 0;
  this.morph = new EffortMorph({
   panel, button, track: this.track, fill: this.fill, levels: EFFORTS.length,
   onProgress: m => this.onMorph(m),
   onLanded: () => this.paint.bloomIn(),
   onOpened: () => this.onOpened(),
   onClosed: () => this.onClosed(),
  });
  this.track.style.setProperty('--last', LAST);
  this.ticks = EFFORTS.slice(1, -1).map((_, k) => {
   const tick = document.createElement('span');
   tick.className = 'effort-tick';
   tick.style.setProperty('--i', k + 1);
   this.track.append(tick);
   return tick;
  });
  const saved = EFFORTS.indexOf(settings.effort);
  this.value = saved < 0 ? DEFAULT : saved;
  this.pos = this.value;
  this.vel = 0;
  this.goal = this.value;
  this.stretch = [0, 0];
  this.press = [0, 0];
  this.drag = null;
  this.geo = null;
  this.raf = 0;
  this.last = 0;
  this.tick = this.tick.bind(this);

  button.addEventListener('effort-toggle', e => this.toggle(e.detail.keyboard));
  this.slider.addEventListener('pointerdown', e => this.onDown(e));
  this.slider.addEventListener('pointermove', e => this.onMove(e));
  this.slider.addEventListener('pointerup', e => this.onUp(e));
  this.slider.addEventListener('pointercancel', e => this.onUp(e));
  this.slider.addEventListener('lostpointercapture', e => this.onUp(e));
  this.slider.addEventListener('keydown', e => this.onKey(e));
  window.addEventListener('resize', () => { this.measureOrigin(); this.render(); });
  document.addEventListener('pointerdown', e => {
   const path = e.composedPath();
   if (this.isOpen && !path.includes(panel) && !path.includes(button)) this.close();
  }, true);

  this.commit(this.value);
  button.setLevel(this.value, true);
 }

 get isOpen() {
  return this.opened;
 }

 toggle(keyboard) {
  if (this.opened) this.close(keyboard);
  else this.open();
 }

 open() {
  this.opened = true;
  if (!this.panel.matches(':popover-open')) {
   this.panel.showPopover();
   this.geo = { left: this.track.offsetLeft, width: this.track.offsetWidth, origin: this.slider.getBoundingClientRect().left };
   this.pos = this.goal = this.value;
   this.vel = 0;
   this.stretch = [0, 0];
   this.press = [0, 0];
   this.paint.layout({ width: this.panel.offsetWidth, height: this.panel.offsetHeight, lensRight: this.slider.offsetLeft + this.x(LAST) + LENS.width / 2 });
   this.painted = this.value === LAST;
   if (this.painted) this.paint.ready();
   else this.paint.set(false, true);
   this.paint.fade(0);
   this.panel.style.setProperty('--shell-paint', this.painted ? 1 : 0);
   this.render();
   this.morph.measure(this.value);
  }
  this.button.setAttribute('expanded', '');
  this.button.hideSegments(true);
  this.morph.to(1);
  this.slider.focus({ preventScroll: true });
 }

 close(focusButton = false) {
  if (!this.opened) return;
  this.opened = false;
  if (this.drag) this.release();
  this.panel.style.setProperty('--shell-paint', this.paint.full ? 1 : 0);
  if (this.morph.settled) this.morph.measure(this.value);
  this.morph.to(0);
  if (focusButton) this.button.focus();
 }

 onOpened() {
  this.panel.style.setProperty('--shell-paint', 0);
  this.paint.fade(1);
  this.syncPaint();
 }

 onClosed() {
  this.panel.hidePopover();
  this.button.hideSegments(false);
  this.button.removeAttribute('expanded');
  this.paint.park();
  this.paint.set(false, true);
  this.painted = false;
 }

 onMorph(m) {
  this.lens = m;
  this.thumb.style.opacity = smoothstep(LENS_REVEAL.from, LENS_REVEAL.fade, m).toFixed(3);
  this.paint.fade(smoothstep(...(this.opened ? PAINT_ARRIVE : PAINT_FADE), m));
  this.render();
 }

 syncPaint() {
  if (!this.opened || !this.morph.settled) return;
  const level = this.drag ? this.goal : this.value;
  const on = level > (this.painted ? PAINT_ZONE.leave : PAINT_ZONE.enter);
  if (on === this.painted) return;
  this.painted = on;
  this.paint.set(on);
 }

 x(pos) {
  return this.geo.left + pos / LAST * this.geo.width;
 }

 // The glass reads its backdrop on the device pixel grid, so a lens resting between pixels makes the refraction shimmer.
 snap(x) {
  const ratio = window.devicePixelRatio || 1, origin = this.geo.origin;
  return Math.round((origin + x) * ratio) / ratio - origin;
 }

 measureOrigin() {
  if (this.geo && this.panel.matches(':popover-open')) this.geo.origin = this.slider.getBoundingClientRect().left;
 }

 pointerPos(e) {
  const rect = this.slider.getBoundingClientRect(), scale = rect.width / this.slider.offsetWidth || 1;
  return ((e.clientX - rect.left) / scale - this.geo.left) / this.geo.width * LAST;
 }

 shape(raw) {
  if (raw < 0) return -rubber(-raw);
  if (raw > LAST) return LAST + rubber(raw - LAST);
  const d = raw - Math.round(raw);
  return raw - d * MAGNET.pull * (1 - smoothstep(0, MAGNET.reach, Math.abs(d)));
 }

 onDown(e) {
  if (e.button !== 0 || !this.geo) return;
  e.preventDefault();
  this.slider.focus({ preventScroll: true });
  this.slider.setPointerCapture(e.pointerId);
  const raw = this.pointerPos(e);
  const onThumb = Math.abs(raw - this.pos) / LAST * this.geo.width <= LENS.width / 2 + GRAB_SLOP;
  this.drag = { id: e.pointerId, offset: onThumb ? raw - this.pos : 0 };
  this.panel.classList.add('is-dragging');
  this.goal = this.shape(raw - this.drag.offset);
  this.wake();
 }

 onMove(e) {
  if (!this.drag || e.pointerId !== this.drag.id) return;
  this.goal = this.shape(this.pointerPos(e) - this.drag.offset);
  this.syncPaint();
  this.wake();
 }

 onUp(e) {
  if (this.drag && e.pointerId === this.drag.id) this.release();
 }

 release() {
  const id = this.drag.id;
  this.drag = null;
  if (this.slider.hasPointerCapture(id)) this.slider.releasePointerCapture(id);
  this.panel.classList.remove('is-dragging');
  this.moveTo(Math.round(clamp(this.goal + this.vel * FLING, 0, LAST)));
 }

 moveTo(i) {
  this.goal = i;
  this.commit(i);
  this.syncPaint();
  this.wake();
 }

 onKey(e) {
  const step = { ArrowLeft: -1, ArrowDown: -1, PageDown: -1, ArrowRight: 1, ArrowUp: 1, PageUp: 1 }[e.key];
  const to = step ? clamp(this.value + step, 0, LAST) : { Home: 0, End: LAST }[e.key];
  if (to !== undefined) { e.preventDefault(); if (!this.drag) this.moveTo(to); }
  else if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); this.close(true); }
  else if (e.key === 'Tab') this.close();
 }

 commit(i) {
  const value = EFFORTS[i], name = I18n.t(`effort.${value}`);
  this.value = i;
  if (value !== this.settings.effort) this.settings.setEffort(value);
  this.slider.setAttribute('aria-valuenow', String(i));
  this.slider.setAttribute('aria-valuetext', name);
  this.button.setAttribute('label', I18n.t('effort.current', { name }));
 }

 wake() {
  if (this.raf || !this.geo) return;
  this.last = performance.now();
  this.raf = requestAnimationFrame(this.tick);
 }

 tick(now) {
  this.raf = 0;
  const dt = Math.max(0, Math.min((now - this.last) / 1000, 0.032));
  this.last = now;
  const pressGoal = this.drag ? 1 : 0;
  if (reducedMotion()) {
   this.pos = this.goal;
   this.vel = 0;
   this.stretch = [0, 0];
   this.press = [pressGoal, 0];
   this.render();
   return;
  }
  const [k, c] = this.drag ? FOLLOW : SETTLE;
  const steps = Math.max(1, Math.ceil(dt / 0.004)), h = dt / steps;
  for (let n = 0; n < steps; n++) {
   this.vel += ((this.goal - this.pos) * k - this.vel * c) * h;
   this.pos += this.vel * h;
   this.spring(this.stretch, Math.min(STRETCH_MAX, Math.abs(this.vel) * STRETCH_PER_SPEED), STRETCH, h);
   this.spring(this.press, pressGoal, PRESS, h);
  }
  const moving = this.drag || Math.abs(this.goal - this.pos) > 0.0005 || Math.abs(this.vel) > 0.002
   || Math.abs(this.stretch[0]) > 0.001 || Math.abs(this.stretch[1]) > 0.005
   || Math.abs(pressGoal - this.press[0]) > 0.001 || Math.abs(this.press[1]) > 0.005;
  if (!moving) {
   this.pos = this.goal;
   this.vel = 0;
   this.stretch = [0, 0];
   this.press = [pressGoal, 0];
  }
  this.render();
  if (moving) this.raf = requestAnimationFrame(this.tick);
 }

 spring(s, goal, [k, c], h) {
  s[1] += ((goal - s[0]) * k - s[1] * c) * h;
  s[0] += s[1] * h;
 }

 render() {
  if (!this.geo) return;
  const appear = LENS_REVEAL.scale + (1 - LENS_REVEAL.scale) * backOut(clamp((this.lens - LENS_REVEAL.from) / (1 - LENS_REVEAL.from), 0, 1));
  const x = this.snap(this.x(this.pos)), grow = (1 + PRESS_GROW * clamp(this.press[0], 0, 1.2)) * appear, stretch = this.stretch[0];
  this.thumb.style.transform = `translate(${x - LENS.width / 2}px, ${-LENS.height / 2}px) scale(${grow * (1 + stretch)}, ${grow * (1 - 0.35 * stretch)})`;
  this.fill.style.setProperty('--fill-cut', `${this.geo.width + TRACK_CAP - Math.max(0, x - this.geo.left)}px`);
  this.ticks.forEach((tick, k) => tick.style.setProperty('--under', clamp((this.pos - k - 1) * 6 + 0.5, 0, 1).toFixed(3)));
  this.button.setLevel(clamp(this.pos, 0, LAST));
 }
}

window.EffortSlider = EffortSlider;
})();
