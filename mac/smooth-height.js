(() => {
'use strict';

const SPRING = [260, 32];

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

class SmoothHeight {
 constructor(box, content) {
  this.box = box;
  this.h = null;
  this.v = 0;
  this.goal = 0;
  this.raf = 0;
  this.last = 0;
  this.tick = this.tick.bind(this);
  new ResizeObserver(entries => this.onResize(entries[entries.length - 1].borderBoxSize[0].blockSize)).observe(content);
 }

 onResize(goal) {
  if (goal === this.goal && this.h !== null) return;
  this.goal = goal;
  if (this.h === null || reducedMotion()) { this.snap(); return; }
  this.render();
  this.wake();
 }

 snap() {
  cancelAnimationFrame(this.raf);
  this.raf = 0;
  this.h = this.goal;
  this.v = 0;
  this.box.style.height = '';
 }

 render() {
  const dpr = window.devicePixelRatio || 1;
  this.box.style.height = `${Math.round(this.h * dpr) / dpr}px`;
 }

 wake() {
  if (this.raf) return;
  this.last = performance.now();
  this.raf = requestAnimationFrame(this.tick);
 }

 tick(now) {
  this.raf = 0;
  const dt = Math.min((now - this.last) / 1000, .032), [k, c] = SPRING;
  this.last = now;
  const steps = Math.max(1, Math.ceil(dt / .008)), step = dt / steps;
  for (let i = 0; i < steps; i++) { this.v += ((this.goal - this.h) * k - this.v * c) * step; this.h += this.v * step; }
  if (Math.abs(this.goal - this.h) < .1 && Math.abs(this.v) < .1) { this.snap(); return; }
  this.render();
  this.raf = requestAnimationFrame(this.tick);
 }
}

window.SmoothHeight = SmoothHeight;
})();
