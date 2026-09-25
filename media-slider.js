(() => {
'use strict';

const FRAME = { width: 380, height: 340 };
const RATIO = { single: [0.5, 2.2], many: [0.75, 1.6], fallback: 4 / 3, match: 0.02 };
const FAN = { turn: 5, depth: 3, scale: 0.035, lift: 3, shade: 0.16, spread: 0.4 };
const LEAVE = { shift: 0.9, turn: 9, scale: 0.04, fade: [0.5, 1], reach: 1.5 };
const SPRING = [210, 29];
const SPREAD = [240, 24];
const DRAG_SLOP = 4;
const FLING = 0.22;
const RUBBER = { limit: 0.18, k: 0.55 };
const WHEEL = { end: 100, page: 0.3, nudge: 0.12, fade: 0.6, fresh: 1.8, gap: 140, line: 16, speed: 8 };
const DOTS = { max: 10, size: 6, grow: 10 };
const SAMPLE_WINDOW = 100;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rubber = d => (1 - 1 / (d * RUBBER.k / RUBBER.limit + 1)) * RUBBER.limit;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const CHEVRON = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.5 2.5 4 6l3.5 3.5"/></svg>';

class MediaSlider {
 constructor(images) {
  this.images = images;
  this.count = images.length;
  this.index = 0;
  this.pos = 0;
  this.vel = 0;
  this.spread = [0, 0];
  this.hover = false;
  this.width = 0;
  this.drag = null;
  this.swipe = null;
  this.wheelTimer = 0;
  this.raf = 0;
  this.last = 0;
  this.tick = this.tick.bind(this);
  this.build();
  const first = images[0];
  if (first.width && first.height) this.setRatio(first.width / first.height);
  else {
   this.setRatio(RATIO.fallback);
   this.imgs[0].addEventListener('load', () => this.setRatio(this.imgs[0].naturalWidth / this.imgs[0].naturalHeight), { once: true });
  }
  new ResizeObserver(entries => { this.width = entries[0].contentRect.width; this.render(); }).observe(this.el);
 }

 build() {
  const el = this.el = document.createElement('div');
  el.className = 'media';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-roledescription', 'carousel');
  el.setAttribute('aria-label', I18n.t('media.label'));
  this.cards = [];
  this.shades = [];
  this.imgs = [];
  this.images.forEach((image, k) => {
   const card = document.createElement('figure');
   card.className = 'media-card';
   card.setAttribute('role', 'group');
   card.setAttribute('aria-roledescription', 'slide');
   card.setAttribute('aria-label', I18n.t('media.slide', { n: k + 1, count: this.count }));
   const img = document.createElement('img');
   img.className = 'media-img';
   img.src = image.url;
   img.alt = image.name || '';
   if (image.note) img.title = image.note;
   img.draggable = false;
   img.decoding = 'async';
   const shade = document.createElement('span');
   shade.className = 'media-shade';
   card.append(img, shade);
   el.append(card);
   this.cards.push(card);
   this.shades.push(shade);
   this.imgs.push(img);
  });
  if (this.count < 2) return;
  el.tabIndex = 0;
  el.classList.add('is-many');
  this.prev = this.arrow('is-prev', 'media.prev', -1);
  this.next = this.arrow('is-next', 'media.next', 1);
  const dots = document.createElement('div');
  dots.className = 'media-dots';
  if (this.count <= DOTS.max) {
   this.dots = this.images.map((_, k) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'media-dot';
    dot.setAttribute('aria-label', I18n.t('media.slide', { n: k + 1, count: this.count }));
    dot.addEventListener('click', () => this.go(k));
    dots.append(dot);
    return dot;
   });
  } else {
   this.counter = document.createElement('span');
   this.counter.className = 'media-counter';
   dots.append(this.counter);
  }
  el.append(this.prev, this.next, dots);
  el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { this.hover = true; this.wake(); } });
  el.addEventListener('pointerleave', () => { this.hover = false; this.wake(); });
  el.addEventListener('pointerdown', e => this.onDown(e));
  el.addEventListener('pointermove', e => this.onMove(e));
  el.addEventListener('pointerup', e => this.onUp(e));
  el.addEventListener('pointercancel', e => this.onUp(e));
  el.addEventListener('lostpointercapture', e => this.onUp(e));
  el.addEventListener('wheel', e => this.onWheel(e), { passive: false });
  el.addEventListener('keydown', e => this.onKey(e));
  this.sync();
 }

 arrow(name, label, step) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `media-arrow ${name}`;
  button.setAttribute('aria-label', I18n.t(label));
  button.innerHTML = CHEVRON;
  button.addEventListener('click', () => this.go(this.index + step));
  return button;
 }

 setRatio(raw) {
  if (!Number.isFinite(raw) || raw <= 0) return;
  const [lo, hi] = this.count > 1 ? RATIO.many : RATIO.single, ratio = clamp(raw, lo, hi);
  this.el.style.setProperty('--ratio', ratio.toFixed(4));
  this.el.style.setProperty('--media-w', `${Math.round(Math.min(FRAME.width, FRAME.height * ratio))}px`);
  this.images.forEach((image, k) => {
   const own = image.width && image.height ? image.width / image.height : k === 0 ? raw : 0;
   this.backdrop(k, !own || Math.abs(own - ratio) > RATIO.match);
  });
 }

 backdrop(k, on) {
  const card = this.cards[k], existing = card.querySelector('.media-backdrop');
  if (!on) { existing?.remove(); return; }
  if (existing) return;
  const back = document.createElement('img');
  back.className = 'media-backdrop';
  back.src = this.images[k].url;
  back.alt = '';
  back.draggable = false;
  back.setAttribute('aria-hidden', 'true');
  card.prepend(back);
 }

 go(i) {
  this.index = clamp(i, 0, this.count - 1);
  this.sync();
  this.wake();
 }

 sync() {
  if (this.count < 2) return;
  this.prev.classList.toggle('is-hidden', this.index === 0);
  this.next.classList.toggle('is-hidden', this.index === this.count - 1);
  this.prev.tabIndex = this.index === 0 ? -1 : 0;
  this.next.tabIndex = this.index === this.count - 1 ? -1 : 0;
  this.cards.forEach((card, k) => card.toggleAttribute('inert', k !== this.index));
  if (this.dots) this.dots.forEach((dot, k) => dot.toggleAttribute('aria-current', k === this.index));
  if (this.counter) this.counter.textContent = `${this.index + 1} / ${this.count}`;
 }

 shape(raw) {
  const last = this.count - 1;
  if (raw < 0) return -rubber(-raw);
  if (raw > last) return last + rubber(raw - last);
  return raw;
 }

 get following() {
  return !!(this.drag?.moved || (this.swipe && !this.swipe.done));
 }

 onDown(e) {
  if (e.button !== 0 || e.target.closest('button') || !this.width) return;
  this.drag = { id: e.pointerId, x: e.clientX, from: this.pos, start: this.index, moved: false, samples: [[e.timeStamp, e.clientX]] };
 }

 onMove(e) {
  const drag = this.drag;
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x;
  if (!drag.moved) {
   if (Math.abs(dx) < DRAG_SLOP) return;
   drag.moved = true;
   this.el.setPointerCapture(e.pointerId);
   this.el.classList.add('is-dragging');
  }
  drag.samples.push([e.timeStamp, e.clientX]);
  while (drag.samples.length > 2 && e.timeStamp - drag.samples[0][0] > SAMPLE_WINDOW) drag.samples.shift();
  this.pos = this.shape(drag.from - dx / this.width);
  this.vel = 0;
  this.render();
 }

 onUp(e) {
  const drag = this.drag;
  if (!drag || e.pointerId !== drag.id) return;
  this.drag = null;
  if (!drag.moved) return;
  this.el.classList.remove('is-dragging');
  if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);
  const [t0, x0] = drag.samples[0], [t1, x1] = drag.samples[drag.samples.length - 1];
  this.vel = t1 > t0 ? -(x1 - x0) / (t1 - t0) * 1000 / this.width : 0;
  this.go(clamp(Math.round(this.pos + this.vel * FLING), drag.start - 1, drag.start + 1));
 }

 // A trackpad swipe moves the stack under the fingers and turns one page as soon as the intent is clear:
 // far enough, or already slowing down after the fingers lift. The inertia tail after that is ignored,
 // and deltas that grow again after slowing down start the next swipe.
 onWheel(e) {
  if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || !this.width || this.drag) return;
  e.preventDefault();
  const dx = e.deltaX * (e.deltaMode === 1 ? WHEEL.line : e.deltaMode === 2 ? this.width : 1);
  const size = Math.abs(dx), dir = Math.sign(dx) || 1, now = e.timeStamp;
  let swipe = this.swipe;
  if (swipe) {
   const settled = swipe.done ? now - swipe.doneAt > WHEEL.gap : swipe.fading;
   const fresh = settled && (dir !== swipe.dir || size > swipe.low * WHEEL.fresh + 1.5);
   if (fresh) {
    if (!swipe.done) this.commitSwipe();
    swipe = null;
   } else if (swipe.done) {
    swipe.low = Math.min(swipe.low, size);
    this.armWheelEnd();
    return;
   }
  }
  if (swipe) swipe.speed = swipe.speed * 0.6 + dx / this.width / (Math.max(4, now - swipe.at) / 1000) * 0.4;
  else swipe = this.swipe = { base: this.index, from: this.pos, sum: 0, dir, peak: 0, low: Infinity, fading: false, at: now, speed: 0, done: false, doneAt: 0 };
  swipe.sum += dx;
  swipe.dir = dir;
  swipe.peak = Math.max(swipe.peak, size);
  if (size < swipe.peak * WHEEL.fade) swipe.fading = true;
  if (swipe.fading) swipe.low = Math.min(swipe.low, size);
  swipe.at = now;
  this.pos = this.shape(swipe.from + swipe.sum / this.width);
  this.vel = 0;
  this.render();
  const moved = Math.abs(this.pos - swipe.base);
  if (moved >= WHEEL.page || (swipe.fading && moved >= WHEEL.nudge)) this.commitSwipe();
  this.armWheelEnd();
 }

 commitSwipe() {
  const swipe = this.swipe, moved = this.pos - swipe.base;
  swipe.done = true;
  swipe.doneAt = swipe.at;
  swipe.low = Infinity;
  this.vel = clamp(swipe.speed, -WHEEL.speed, WHEEL.speed);
  this.go(swipe.base + (Math.abs(moved) >= WHEEL.nudge ? Math.sign(moved) : 0));
 }

 armWheelEnd() {
  clearTimeout(this.wheelTimer);
  this.wheelTimer = setTimeout(() => {
   if (this.swipe && !this.swipe.done) this.commitSwipe();
   this.swipe = null;
  }, WHEEL.end);
 }

 onKey(e) {
  const to = { ArrowLeft: this.index - 1, ArrowRight: this.index + 1, Home: 0, End: this.count - 1 }[e.key];
  if (to === undefined) return;
  e.preventDefault();
  this.go(to);
 }

 wake() {
  if (this.raf) return;
  this.last = performance.now();
  this.raf = requestAnimationFrame(this.tick);
 }

 tick(now) {
  this.raf = 0;
  const dt = Math.min(Math.max((now - this.last) / 1000, 0), 0.032);
  this.last = now;
  const spreadGoal = this.hover && !this.drag?.moved ? 1 : 0;
  if (reducedMotion()) {
   this.pos = this.index;
   this.vel = 0;
   this.spread = [0, 0];
   this.render();
   return;
  }
  const steps = Math.max(1, Math.ceil(dt / 0.004)), h = dt / steps, [k, c] = SPRING, [sk, sc] = SPREAD, follow = this.following;
  for (let n = 0; n < steps; n++) {
   if (!follow) {
    this.vel += ((this.index - this.pos) * k - this.vel * c) * h;
    this.pos += this.vel * h;
   }
   this.spread[1] += ((spreadGoal - this.spread[0]) * sk - this.spread[1] * sc) * h;
   this.spread[0] += this.spread[1] * h;
  }
  if (!follow && Math.abs(this.index - this.pos) < 0.0005 && Math.abs(this.vel) < 0.002) { this.pos = this.index; this.vel = 0; }
  const spreading = Math.abs(spreadGoal - this.spread[0]) > 0.001 || Math.abs(this.spread[1]) > 0.005;
  if (!spreading) this.spread = [spreadGoal, 0];
  this.render();
  if (spreading || (!follow && this.pos !== this.index)) this.raf = requestAnimationFrame(this.tick);
 }

 place(k) {
  const d = k - this.pos, w = this.width;
  if (d >= 0) {
   const t = Math.min(d, FAN.depth), open = 1 + FAN.spread * this.spread[0];
   return {
    x: 0, y: -t * FAN.lift * open, turn: t * FAN.turn * open, scale: 1 - t * FAN.scale,
    shade: Math.min(t, 2) * FAN.shade, opacity: 1 - smoothstep(FAN.depth - 1, FAN.depth, d), z: 200 - k,
   };
  }
  const u = Math.min(-d, LEAVE.reach);
  return {
   x: -u * w * LEAVE.shift, y: 0, turn: -u * LEAVE.turn, scale: 1 - u * LEAVE.scale,
   shade: 0, opacity: 1 - smoothstep(LEAVE.fade[0], LEAVE.fade[1], u), z: 300 + k,
  };
 }

 render() {
  if (!this.width) return;
  if (this.count > 1) {
   const ratio = window.devicePixelRatio || 1;
   this.cards.forEach((card, k) => {
    const p = this.place(k), hidden = p.opacity <= 0.001;
    if (card.__hidden !== hidden) { card.style.visibility = hidden ? 'hidden' : ''; card.__hidden = hidden; }
    if (hidden) return;
    if (card.__z !== p.z) { card.style.zIndex = String(p.z); card.__z = p.z; }
    card.style.transform = `translate3d(${Math.round(p.x * ratio) / ratio}px, ${p.y.toFixed(2)}px, 0) rotate(${p.turn.toFixed(3)}deg) scale(${p.scale.toFixed(4)})`;
    card.style.opacity = p.opacity.toFixed(3);
    this.shades[k].style.opacity = p.shade.toFixed(3);
   });
  }
  if (!this.dots) return;
  this.dots.forEach((dot, k) => {
   const near = Math.max(0, 1 - Math.abs(this.pos - k));
   dot.style.setProperty('--near', near.toFixed(3));
   dot.style.width = `${(DOTS.size + DOTS.grow * near).toFixed(2)}px`;
  });
 }
}

window.MediaSlider = MediaSlider;
})();
