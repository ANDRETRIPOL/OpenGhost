(() => {
'use strict';

const NS = 'http://www.w3.org/2000/svg';
const POUR_TIME = 1.25;
const DRAIN_TIME = 0.75;
const BLEED = { x: 40, y: 18 };
const GHOST = { width: 17, aspect: 70 / 64, gap: 6, margin: 13 };
const FRONT = [
 { y: 0.22, r: 0.62, lead: 10, phase: 0 },
 { y: 0.5, r: 0.7, lead: 18, phase: 1.7 },
 { y: 0.78, r: 0.6, lead: 8, phase: 3.1 },
 { y: 0.36, r: 0.5, lead: 14, phase: 4.4 },
];
const TONGUE = { reach: 14, radius: 0.6, drip: 10, dripRadius: 0.34 };
const BLOOM = { time: 0.8, stagger: 0.5, body: 0.6 };
const CLOUD = {
 spacing: 32, swell: 1.8, drift: 4, bob: 1.6, speed: [0.7, 1.4], lead: 0.1, spread: 0.3,
 roll: { amp: 3, speed: 1.1, length: 140 },
 top: { inset: 8, radius: [12, 16], shift: 0, amp: 1 },
 bottom: { inset: 7, radius: [8, 11], shift: Math.PI, amp: 0.5 },
 ends: { inset: 10, spread: 7, radius: [12, 14], shift: Math.PI / 2, amp: 0.8 },
};
const SIZES = new Set(['r', 'rx', 'width', 'height']);
const TAU = Math.PI * 2;

const clamp01 = v => Math.min(1, Math.max(0, v));
const phase = (t, from, to) => clamp01((t - from) / (to - from));
const smooth = v => v * v * (3 - 2 * v);
const backOut = v => 1 + 2.2 * (v - 1) ** 3 + 1.2 * (v - 1) ** 2;
const random = (min, max) => min + Math.random() * (max - min);
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function svg(tag, attrs = {}) {
 const el = document.createElementNS(NS, tag);
 for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
 return el;
}

class EffortPaint {
 constructor(panel) {
  this.panel = panel;
  this.root = svg('svg', { class: 'effort-paint', 'aria-hidden': 'true' });
  this.filter = svg('filter', { id: 'effort-paint-oil', filterUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' });
  this.filter.innerHTML = `
   <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur"/>
   <feColorMatrix in="blur" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 22 -9" result="goo"/>
   <feGaussianBlur in="goo" stdDeviation="1.2" result="relief"/>
   <feDiffuseLighting in="relief" surfaceScale="2.2" diffuseConstant="1.4142" lighting-color="rgb(250, 250, 250)" result="shade"><feDistantLight azimuth="225" elevation="45"/></feDiffuseLighting>
   <feSpecularLighting in="relief" surfaceScale="2.2" specularConstant="0.55" specularExponent="30" lighting-color="#fff" result="gloss"><feDistantLight azimuth="225" elevation="25"/></feSpecularLighting>
   <feComposite in="shade" in2="goo" operator="in" result="paint"/>
   <feComposite in="gloss" in2="goo" operator="in" result="shine"/>
   <feComposite in="shine" in2="paint" operator="arithmetic" k2="1" k3="1"/>`;
  const defs = svg('defs');
  defs.append(this.filter);
  this.group = svg('g', { filter: 'url(#effort-paint-oil)', fill: '#fff' });
  this.body = svg('rect');
  this.front = FRONT.map(() => svg('circle'));
  this.tongue = svg('circle');
  this.drip = svg('circle');
  this.group.append(this.body, ...this.front, this.tongue, this.drip);
  this.root.append(defs, this.group);
  this.holder = document.createElement('span');
  this.holder.className = 'effort-ghost';
  this.holder.setAttribute('aria-hidden', 'true');
  panel.prepend(this.root);
  panel.append(this.holder);
  this.puffs = [];
  this.ghost = null;
  this.geo = null;
  this.t = 0;
  this.target = 0;
  this.bloom = 1;
  this.blooming = false;
  this.raf = 0;
  this.last = 0;
  this.tick = this.tick.bind(this);
 }

 layout({ width, height, lensRight }) {
  const gx = lensRight + GHOST.gap + GHOST.width / 2;
  const end = gx + GHOST.width / 2 + GHOST.margin;
  this.geo = { width, height, gx, end };
  const box = { x: -BLEED.x, y: -BLEED.y, width: end + BLEED.x * 2, height: height + BLEED.y * 2 };
  this.root.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
  Object.assign(this.root.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.width}px`, height: `${box.height}px` });
  for (const name of ['x', 'y', 'width', 'height']) this.filter.setAttribute(name, box[name]);
  Object.assign(this.holder.style, { left: `${gx}px`, top: `${height / 2}px`, width: `${GHOST.width}px`, height: `${GHOST.width * GHOST.aspect}px` });
  this.layoutCloud();
 }

 layoutCloud() {
  const { height: H, end } = this.geo, R = H / 2;
  const { top, bottom, ends } = CLOUD, count = Math.max(3, Math.round((end - 2 * R) / CLOUD.spacing));
  const spots = [];
  for (let i = 0; i < count; i++) {
   const x = R + (end - 2 * R) * (i + 0.5) / count;
   spots.push([x + random(-4, 4), top.inset, top], [x + random(-6, 6), H - bottom.inset, bottom]);
  }
  for (const x of [ends.inset, end - ends.inset]) spots.push([x, R - ends.spread, ends], [x, R + ends.spread, ends]);
  for (const puff of this.puffs) puff.el.remove();
  this.puffs = spots.map(([x, y, row]) => ({
   el: this.group.appendChild(svg('circle')), x, y, r: random(...row.radius), shift: row.shift, amp: row.amp,
   phase: [random(0, TAU), random(0, TAU), random(0, TAU)],
   speed: [random(...CLOUD.speed), random(...CLOUD.speed), random(...CLOUD.speed)],
  }));
 }

 get full() {
  return this.t === 1 && this.target === 1;
 }

 set(on, instant = false) {
  this.target = on ? 1 : 0;
  if (on) this.bloom = 1;
  if (instant || reducedMotion()) {
   this.t = this.target;
   this.render(performance.now());
  }
  this.wake();
 }

 ready() {
  this.target = 1;
  this.t = 1;
  this.bloom = 0;
  this.blooming = false;
  this.render(performance.now());
 }

 bloomIn() {
  this.blooming = true;
  if (reducedMotion()) this.bloom = 1;
  this.render(performance.now());
  this.wake();
 }

 fade(value) {
  this.panel.style.setProperty('--paint-fade', value.toFixed(3));
 }

 park() {
  cancelAnimationFrame(this.raf);
  this.raf = 0;
  this.ghostVisible(false);
 }

 get alive() {
  return this.target === 1 && !reducedMotion();
 }

 wake() {
  if (this.raf || !this.geo || (this.t === this.target && !this.alive) || reducedMotion()) return;
  this.last = performance.now();
  this.raf = requestAnimationFrame(this.tick);
 }

 tick(now) {
  this.raf = 0;
  const dt = Math.max(0, Math.min((now - this.last) / 1000, 0.05));
  this.last = now;
  const rate = this.target > this.t ? 1 / POUR_TIME : -1 / DRAIN_TIME;
  this.t = rate > 0 ? Math.min(this.target, this.t + rate * dt) : Math.max(this.target, this.t + rate * dt);
  if (this.blooming) this.bloom = Math.min(1, this.bloom + dt / BLOOM.time);
  this.render(now);
  if (this.t !== this.target || this.alive) this.raf = requestAnimationFrame(this.tick);
 }

 ghostVisible(on) {
  if (on && !this.ghost) {
   this.ghost = document.createElement('ghost-thinking');
   this.holder.append(this.ghost);
  } else if (!on && this.ghost) {
   this.ghost.remove();
   this.ghost = null;
  }
 }

 render(now) {
  if (!this.geo) return;
  const t = this.t, bloom = this.bloom, { width: W, height: H, gx, end } = this.geo, R = H / 2, gy = R, time = now / 1000;
  this.root.style.display = t > 0 ? '' : 'none';
  this.panel.style.setProperty('--paint', smooth(phase(t, 0.3, 0.9)).toFixed(3));
  this.ghostVisible(t > 0);
  this.holder.style.setProperty('--ghost-appear', (phase(t, 0.05, 0.25) * smooth(phase(bloom, 0.25, 0.6))).toFixed(3));
  this.holder.style.transform = `translate(-50%, -50%) scale(${Math.max(0, backOut(phase(t, 0.08, 0.38)) * backOut(phase(bloom, 0.25, 0.75))).toFixed(3)})`;
  if (t <= 0) return;

  const drop = (R + 1) * Math.max(0, backOut(phase(t, 0, 0.3)));
  const flood = phase(t, 0.22, 1), spread = smooth(flood), wave = Math.sin(Math.PI * flood), absorb = 1 - smooth(phase(flood, 0.65, 1));
  const right = W - R + (end - W) * smooth(phase(bloom, 0, BLOOM.body)), source = Math.min(gx, end - R);
  const left = source - (source - R + 1) * spread;
  this.shape(this.body, { x: left - drop, y: gy - drop, width: right - left + drop * 2, height: drop * 2, rx: drop });
  this.front.forEach((blob, i) => {
   const f = FRONT[i];
   this.shape(blob, {
    cx: left - f.lead * wave + Math.sin(time * 1.9 + f.phase) * 3 * wave,
    cy: gy + (f.y - 0.5) * H * (drop / R) + Math.sin(time * 2.3 + f.phase) * 2 * wave,
    r: f.r * drop * absorb,
   });
  });
  const flow = phase(t, 0.1, 0.65), settle = end - R * 0.8 - gx;
  const reach = settle * flow + (end - gx + TONGUE.reach - settle) * Math.sin(Math.PI * flow) ** 1.2;
  this.shape(this.tongue, { cx: gx + reach, cy: gy + 3, r: R * TONGUE.radius * smooth(phase(flow, 0, 0.2)) * smooth(phase(bloom, 0, BLOOM.body)) });
  this.shape(this.drip, {
   cx: gx + reach * 0.75 - 4,
   cy: H - 4 + TONGUE.drip * Math.sin(Math.PI * flow),
   r: R * TONGUE.dripRadius * smooth(phase(flow, 0.1, 0.35)) * (1 - smooth(phase(flow, 0.75, 1))),
  });
  const { roll, lead, spread: width } = CLOUD, grown = Math.min(1, drop / R);
  for (const puff of this.puffs) {
   const [a, b, c] = puff.phase, [sa, sb, sc] = puff.speed;
   const arrival = clamp01((source - puff.x) / (source - R + 1)) * (1 - width + lead);
   const late = (1 - puff.x / end) * BLOOM.stagger;
   const presence = smooth(clamp01((spread - arrival + lead) / width)) * grown * smooth(phase(bloom, late, late + 1 - BLOOM.stagger));
   const wave = Math.sin(time * roll.speed - puff.x / roll.length * TAU + puff.shift);
   this.shape(puff.el, {
    cx: puff.x + Math.sin(time * sa + a) * CLOUD.drift,
    cy: puff.y + Math.sin(time * sb + b) * CLOUD.bob * puff.amp,
    r: presence * (puff.r + (wave * roll.amp + Math.sin(time * sc + c) * CLOUD.swell) * puff.amp),
   });
  }
 }

 shape(el, attrs) {
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, (SIZES.has(name) ? Math.max(0, value) : value).toFixed(2));
 }
}

window.EffortPaint = EffortPaint;
})();
