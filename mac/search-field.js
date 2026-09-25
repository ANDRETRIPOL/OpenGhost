(() => {
'use strict';

const OPEN = [300, 28];
const CLOSE = [340, 30];
const SQUASH = { perSpeed: 0.012, max: 0.08, spring: [520, 34] };
const CIRCLE = { until: 0.2, scale: 0.8 };
const LETTER = { lead: 2, ramp: 56, rise: 4, blur: 3 };
const INTENT = { enter: 60, leave: 140 };
const CARET_GAP = 3;

const clamp01 = v => Math.min(1, Math.max(0, v));
const phase = (v, from, to) => clamp01((v - from) / (to - from));
const smooth = v => v * v * (3 - 2 * v);
const lerp = (a, b, t) => a + (b - a) * t;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

class SearchField {
 constructor({ root, button, input, clear }) {
  Object.assign(this, { root, button, input, clear });
  this.shell = document.createElement('span');
  this.shell.className = 'sidebar-search-shell';
  root.prepend(this.shell);
  this.placeholder = document.createElement('span');
  this.placeholder.className = 'sidebar-search-placeholder';
  this.placeholder.setAttribute('aria-hidden', 'true');
  this.letters = Array.from(input.placeholder, char => {
   const letter = document.createElement('span');
   letter.textContent = char;
   return this.placeholder.appendChild(letter);
  });
  input.after(this.placeholder);
  this.m = [0, 0];
  this.squash = [0, 0];
  this.target = 0;
  this.hovered = false;
  this.focused = false;
  this.timer = 0;
  this.geo = null;
  this.raf = 0;
  this.last = 0;
  this.tick = this.tick.bind(this);

  root.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') this.hover(true); });
  root.addEventListener('pointerleave', () => this.hover(false));
  button.addEventListener('search-open', () => this.focus());
  input.addEventListener('focus', () => { this.focused = true; this.update(); });
  input.addEventListener('blur', () => { this.focused = false; this.update(); });
  input.addEventListener('input', () => this.update());
  input.addEventListener('keydown', e => this.onKey(e));
  clear.addEventListener('pointerdown', e => e.preventDefault());
  clear.addEventListener('click', () => this.clearQuery());
  new ResizeObserver(() => this.measure()).observe(root);
  document.fonts?.ready.then(() => this.measure());
  this.update();
 }

 focus() {
  this.input.inert = false;
  this.input.focus();
 }

 hover(on) {
  clearTimeout(this.timer);
  this.timer = setTimeout(() => {
   this.hovered = on;
   this.update();
  }, on ? INTENT.enter : INTENT.leave);
 }

 update() {
  const filled = this.input.value !== '';
  const open = this.hovered || this.focused || filled;
  this.root.classList.toggle('is-expanded', open);
  this.root.classList.toggle('has-value', filled);
  this.input.inert = !open;
  this.to(open ? 1 : 0);
 }

 onKey(e) {
  if (e.key !== 'Escape') return;
  e.preventDefault();
  if (this.input.value) this.clearQuery();
  else this.button.focus();
 }

 clearQuery() {
  this.input.value = '';
  this.input.dispatchEvent(new Event('input', { bubbles: true }));
 }

 measure() {
  const style = getComputedStyle(this.input);
  this.placeholder.style.left = `${this.input.offsetLeft + parseFloat(style.paddingLeft) + CARET_GAP}px`;
  const left = this.placeholder.offsetLeft;
  this.geo = {
   base: this.button.offsetWidth,
   full: this.root.clientWidth,
   letters: this.letters.map(letter => left + letter.offsetLeft + letter.offsetWidth / 2),
  };
  this.render();
 }

 to(target) {
  this.target = target;
  if (reducedMotion()) {
   cancelAnimationFrame(this.raf);
   this.raf = 0;
   this.m = [target, 0];
   this.squash = [0, 0];
   this.render();
   return;
  }
  if (!this.raf && this.m[0] !== target) {
   this.last = performance.now();
   this.raf = requestAnimationFrame(this.tick);
  }
 }

 tick(now) {
  this.raf = 0;
  const dt = Math.max(0, Math.min((now - this.last) / 1000, 0.032));
  this.last = now;
  const [k, c] = this.target ? OPEN : CLOSE, [qk, qc] = SQUASH.spring;
  const steps = Math.max(1, Math.ceil(dt / 0.004)), h = dt / steps, m = this.m, q = this.squash;
  for (let i = 0; i < steps; i++) {
   m[1] += ((this.target - m[0]) * k - m[1] * c) * h;
   m[0] += m[1] * h;
   q[1] += ((Math.min(SQUASH.max, Math.abs(m[1]) * SQUASH.perSpeed) - q[0]) * qk - q[1] * qc) * h;
   q[0] += q[1] * h;
  }
  const done = Math.abs(this.target - m[0]) < 0.0005 && Math.abs(m[1]) < 0.005 && Math.abs(q[0]) < 0.001 && Math.abs(q[1]) < 0.01;
  if (done) {
   this.m = [this.target, 0];
   this.squash = [0, 0];
  }
  this.render();
  if (!done) this.raf = requestAnimationFrame(this.tick);
 }

 render() {
  if (!this.geo) return;
  const { base, full, letters } = this.geo, m = this.m[0];
  const width = Math.max(base, lerp(base, full, m));
  const appear = smooth(phase(m, 0, CIRCLE.until)), scale = lerp(CIRCLE.scale, 1, appear), squash = this.squash[0];
  const shell = this.shell.style;
  shell.width = `${width}px`;
  shell.opacity = appear.toFixed(3);
  shell.transform = appear < 1 || squash > 0.0005 ? `scale(${scale.toFixed(4)}, ${(scale * (1 - squash)).toFixed(4)})` : '';
  this.letters.forEach((letter, i) => {
   const shown = smooth(clamp01((width - letters[i] - LETTER.lead) / LETTER.ramp)), rest = 1 - shown, style = letter.style;
   style.opacity = shown.toFixed(3);
   style.transform = rest ? `translateY(${(rest * LETTER.rise).toFixed(2)}px)` : '';
   style.filter = shown && rest ? `blur(${(rest * LETTER.blur).toFixed(2)}px)` : '';
  });
 }
}

window.SearchField = SearchField;
})();
