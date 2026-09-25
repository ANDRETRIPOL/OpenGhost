(() => {
'use strict';

const SPRING = [420, 37];
const TRACK = { height: 6, cap: 3 };
const LAND = { knee: 0.8, at: 0.96 };
const REVEAL = [0.92, 0.96];
const SHELL_FADE = [0, 0.35];

const clamp01 = v => Math.min(1, Math.max(0, v));
const phase = (v, from, to) => clamp01((v - from) / (to - from));
const smooth = v => v * v * (3 - 2 * v);
const lerp = (a, b, t) => a + (b - a) * t;
// The spring's slow tail would leave the geometry creeping after it already reads as open, so it lands with zero speed at LAND.at.
const land = m => {
 const { knee, at } = LAND, slope = 2 / (at + knee);
 if (m <= knee) return clamp01(m * slope);
 return 1 - slope * Math.max(0, at - m) ** 2 / (2 * (at - knee));
};
// Segments sit under the track as it fades in, so their alpha keeps the combined coverage equal to the track's own.
const under = (alpha, reveal) => (reveal < 1 ? alpha * (1 - reveal) / (1 - reveal * alpha) : 0);
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
function rgba(color) {
 probe.clearRect(0, 0, 1, 1);
 probe.fillStyle = color;
 probe.fillRect(0, 0, 1, 1);
 const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
 return [r, g, b, a / 255];
}

class EffortMorph {
 constructor({ panel, button, track, fill, levels, onProgress, onLanded, onOpened, onClosed }) {
  Object.assign(this, { panel, button, track, fill, levels, onProgress, onLanded, onOpened, onClosed });
  this.landed = false;
  this.shell = document.createElement('div');
  this.shell.className = 'effort-shell';
  panel.prepend(this.shell);
  this.layer = document.createElement('div');
  this.layer.className = 'effort-morph';
  this.layer.setAttribute('aria-hidden', 'true');
  this.segments = Array.from({ length: levels }, () => this.layer.appendChild(document.createElement('span')));
  track.parentElement.before(this.layer);
  this.m = [0, 0];
  this.target = 0;
  this.plan = null;
  this.raf = 0;
  this.last = 0;
  this.tick = this.tick.bind(this);
 }

 get settled() {
  return !this.raf;
 }

 measure(level) {
  const p = this.panel.getBoundingClientRect(), b = this.button.getBoundingClientRect(), t = this.track.getBoundingClientRect();
  const stops = Array.from({ length: this.levels }, (_, i) => t.left - p.left + t.width * i / (this.levels - 1));
  const lit = rgba(getComputedStyle(this.fill).backgroundColor), dim = rgba(getComputedStyle(this.track, '::before').backgroundColor);
  const top = t.top - p.top + t.height / 2, last = this.levels - 1;
  const parts = stops.map((stop, i) => {
   const left = i === 0 ? stop - TRACK.cap : i === 1 ? stops[0] + TRACK.cap : stops[i - 1];
   const right = i === 0 || i === last ? stop + TRACK.cap : stop;
   return { left, right, color: i <= level ? lit : dim };
  });
  const from = this.button.segmentShapes().map(({ rect, rgb, alpha }) => ({
   left: rect.left - p.left, right: rect.right - p.left, cy: rect.top - p.top + rect.height / 2, height: rect.height, color: [...rgb, alpha],
  }));
  this.plan = {
   width: p.width, height: p.height, top, parts, from,
   button: { left: b.left - p.left, top: b.top - p.top, width: b.width, height: b.height },
  };
  this.render();
 }

 to(target) {
  this.target = target;
  if (!target) this.landed = false;
  if (reducedMotion()) {
   cancelAnimationFrame(this.raf);
   this.raf = 0;
   this.m = [target, 0];
   this.render();
   this.finish();
   return;
  }
  if (!this.raf) {
   this.last = performance.now();
   this.raf = requestAnimationFrame(this.tick);
  }
 }

 tick(now) {
  this.raf = 0;
  const dt = Math.max(0, Math.min((now - this.last) / 1000, 0.032));
  this.last = now;
  const [k, c] = SPRING, steps = Math.max(1, Math.ceil(dt / 0.004)), h = dt / steps, s = this.m;
  for (let i = 0; i < steps; i++) { s[1] += ((this.target - s[0]) * k - s[1] * c) * h; s[0] += s[1] * h; }
  const done = Math.abs(this.target - s[0]) < 0.001 && Math.abs(s[1]) < 0.01;
  if (done) this.m = [this.target, 0];
  this.render();
  if (done) this.finish();
  else this.raf = requestAnimationFrame(this.tick);
 }

 finish() {
  if (this.target) this.onOpened();
  else this.onClosed();
 }

 render() {
  const plan = this.plan;
  if (!plan) return;
  const m = this.m[0], g = land(m), reveal = smooth(phase(m, ...REVEAL));
  const b = plan.button, shell = this.shell.style;
  shell.left = `${lerp(b.left, 0, g)}px`;
  shell.top = `${lerp(b.top, 0, g)}px`;
  shell.width = `${lerp(b.width, plan.width, g)}px`;
  shell.height = `${lerp(b.height, plan.height, g)}px`;
  shell.opacity = smooth(phase(m, ...SHELL_FADE)).toFixed(3);
  this.layer.style.display = reveal < 1 ? '' : 'none';
  this.segments.forEach((seg, i) => {
   const from = plan.from[i], part = plan.parts[i];
   const left = lerp(from.left, part.left, g), right = lerp(from.right, part.right, g), height = lerp(from.height, TRACK.height, g);
   const color = from.color.map((v, k) => lerp(v, part.color[k], g));
   Object.assign(seg.style, {
    left: `${left}px`, width: `${Math.max(height, right - left)}px`, top: `${lerp(from.cy, plan.top, g) - height / 2}px`, height: `${height}px`,
    background: `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${under(color[3], reveal)})`,
   });
  });
  this.track.style.opacity = reveal.toFixed(3);
  this.onProgress(m);
  if (this.target && m >= LAND.at && !this.landed) {
   this.landed = true;
   this.onLanded();
  }
 }
}

window.EffortMorph = EffortMorph;
})();
