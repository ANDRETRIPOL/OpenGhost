(() => {
'use strict';

// The opening. Night falls over the window and mist drifts through it, with motes of light in the air. The ghost comes
// out of the mist far off and sweeps round the middle on a narrowing spiral, growing as it nears, a soft trail of light
// behind it that the mist gives way to. It lands in the middle in a ring of light and takes its name, then flies into the
// empty chat. Times are in ms from the first smooth frame.
// `scale`: the mist is drawn at this share of the screen's pixels, `low` without a GPU, so it keeps up.
const MIST = { show: 700, scale: 0.6, low: 0.35 };
// The way in: a spiral from `from` degrees, turning `turn` degrees round the middle as it narrows from `reach` of the
// window's width; the ghost starts at `size` of its size, comes out of the mist over the first `appear` of the way and
// leans into the turns by up to `tilt` degrees.
const FLIGHT = { at: 220, duration: 1650, from: 128, turn: 335, reach: 0.56, power: 1.3, ease: 2.2, size: 0.42, appear: 0.16, tilt: 16, gaze: [4, 2.4] };
const LAND = FLIGHT.at + FLIGHT.duration;
// The trail: the way the ghost came over the last `life` s, its points `bunch`ed close near the ghost, where it is
// brightest; it spreads to `reach` px either side.
const TRAIL = { life: 0.9, bunch: 1.6, reach: 140 };
// Without WebGL a soft light in the middle stands in for the mist, and swells as the ghost lands.
const AURA = { rise: 900, swellAt: LAND - 120, swell: 1400 };
// The scene starts once frames come evenly: while the app is still busy opening, a moment of it would be lost. It also
// waits for the mist's shader, for `compile` ms at most; a slower one is left out.
const START = { even: 3, frame: 24, wait: 700, compile: 1500 };
const SHIFT = { duration: 640, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
// `spread`: how much farther apart the letters start, in em, before they draw together.
const WORD = { gap: 22, delay: 40, stagger: 30, duration: 560, track: 960, spread: 0.265, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' };
const HOLD = 200;
// The ghost blinks a moment after it lands.
const BLINK = 200;
const OPEN = { duration: 760, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
// How the name leaves when the app opens, and when the ghost sets off for the chat.
const LEAVE = { word: 200, haze: 0.35, fly: 90 };
const GAZE = { word: [4, 0.4], land: [0, 1.4] };

const root = document.documentElement;
const splash = document.querySelector('.splash');
// The window's title bar starts in the splash color and takes the app background once the app opens.
const bar = () => window.Theme?.titleBar();

const clamp = v => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const out = t => 1 - (1 - t) ** 3;
const channels = color => (/rgba?\(([^)]+)\)/.exec(color)?.[1] || '0, 0, 0').split(',').map(Number);

// The app is on its own from here; work held back while the opening played can start.
function finish() {
 root.classList.remove('is-splash');
 splash?.remove();
 bar();
 window.dispatchEvent(new Event('splashend'));
}

if (!splash || !root.classList.contains('is-splash')) {
 finish();
 return;
}

let skip = null;
const skipped = new Promise(resolve => { skip = resolve; });
const wait = ms => Promise.race([new Promise(resolve => setTimeout(resolve, ms)), skipped]);
const settle = () => { for (const animation of splash.getAnimations({ subtree: true })) animation.finish(); };

// Where the ghost is at `u` (0 to 1) of its way in, from the middle of the window: a spiral that narrows to the middle,
// wider than tall like the window.
function spot(u, w, h) {
 const angle = (FLIGHT.from + FLIGHT.turn * u) * Math.PI / 180, r = FLIGHT.reach * w * (1 - u) ** FLIGHT.power;
 return { x: Math.cos(angle) * r, y: Math.sin(angle) * r * h / w * 1.15 };
}

// The ghost at scene time `t` on its way in: where it is from the middle, how big, how far out of the mist, and its
// speed in px per ms.
function pose(t, w, h) {
 const q = clamp((t - FLIGHT.at) / FLIGHT.duration), u = 1 - (1 - q) ** FLIGHT.ease;
 const here = spot(u, w, h), ahead = spot(Math.min(1, u + 0.01), w, h);
 const pace = FLIGHT.ease * (1 - q) ** (FLIGHT.ease - 1) / FLIGHT.duration / 0.01;
 return {
  q, x: here.x, y: here.y, vx: (ahead.x - here.x) * pace, vy: (ahead.y - here.y) * pace,
  scale: lerp(FLIGHT.size, 1, out(u)), presence: smooth(clamp(q / FLIGHT.appear)),
 };
}

class Stage {
 constructor({ fly, ghost }) {
  Object.assign(this, { fly, ghost, t0: 0, raf: 0, landed: 0, even: 0, first: 0, seen: 0, tilt: 0 });
  this.canvas = splash.querySelector('.splash-mist');
  this.aura = splash.querySelector('.splash-aura');
  this.at = { x: 0, y: 0, scale: FLIGHT.size, presence: 0 };
  this.done = new Promise(resolve => { this.onLand = resolve; });
  this.mist = window.SplashMist || null;
  this.gl = null;
  this.frame = this.frame.bind(this);
  this.resize = () => this.layout();
  addEventListener('resize', this.resize);
 }

 // The mist's shader, compiled early, with the theme's colors. Without WebGL, or with a shader that didn't compile in
 // time, there is no mist, and the soft light stands in.
 setup() {
  if (this.mist) try {
   const { gl, program } = this.mist;
   const failed = this.mist.failed();
   if (failed) throw new Error(failed);
   gl.useProgram(program);
   gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
   gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
   const corner = gl.getAttribLocation(program, 'corner');
   gl.enableVertexAttribArray(corner);
   gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
   const names = ['view', 'density', 'time', 'show', 'pulse', 'count', 'life', 'ghost', 'box', 'trail', 'base', 'night', 'deep', 'lit', 'glow', 'core', 'mistAlpha', 'glowAlpha', 'trailGlow', 'shade', 'motes'];
   this.u = Object.fromEntries(names.map(name => [name, gl.getUniformLocation(program, name)]));
   const style = getComputedStyle(splash), color = name => channels(style.getPropertyValue(name)).slice(0, 3).map(v => v / 255);
   for (const [name, token] of [['base', '--chat-bg'], ['night', '--splash-night'], ['deep', '--splash-mist-deep'], ['lit', '--splash-mist-lit'], ['glow', '--splash-glow'], ['core', '--splash-core']]) gl.uniform3fv(this.u[name], color(token));
   for (const [name, token] of [['mistAlpha', '--splash-mist-alpha'], ['glowAlpha', '--splash-glow-alpha'], ['trailGlow', '--splash-trail'], ['shade', '--splash-shade'], ['motes', '--splash-motes']]) gl.uniform1f(this.u[name], parseFloat(style.getPropertyValue(token)) || 0);
   gl.uniform1f(this.u.life, TRAIL.life);
   const info = gl.getExtension('WEBGL_debug_renderer_info'), renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
   this.quality = /swiftshader|llvmpipe|software/i.test(renderer) ? MIST.low : MIST.scale;
   this.gl = gl;
  } catch {
   this.mist = null;
  }
  if (!this.gl) this.canvas.hidden = true;
  this.layout();
 }

 layout() {
  const w = innerWidth, h = innerHeight;
  Object.assign(this, { w, h });
  if (!this.gl) return;
  this.canvas.width = Math.max(1, Math.round(w * (devicePixelRatio || 1) * this.quality));
  this.canvas.height = Math.max(1, Math.round(h * (devicePixelRatio || 1) * this.quality));
  this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
 }

 start() {
  this.raf = requestAnimationFrame(this.frame);
 }

 // The scene starts once a few frames in a row come on time, or after a short wait at most.
 ready(now) {
  this.first ||= now;
  this.even = !this.seen || now - this.seen < START.frame ? this.even + 1 : 0;
  this.seen = now;
  if (this.mist && !this.mist.done()) {
   if (now - this.first < START.compile) return false;
   this.mist = null;
  }
  if (this.even < START.even && now - this.first < START.wait) return false;
  this.setup();
  this.t0 = now;
  if (!this.gl) {
   const rest = { opacity: 0.62, transform: 'scale(0.96)' };
   this.aura.animate([{ opacity: 0, transform: 'scale(0.84)' }, rest], { duration: AURA.rise, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' });
   this.aura.animate([rest, { opacity: 1, transform: 'scale(1.07)', offset: 0.28 }, { opacity: 0.82, transform: 'scale(1)' }], { duration: AURA.swell, delay: AURA.swellAt, easing: 'ease-in-out', fill: 'forwards' });
  }
  return true;
 }

 frame(now) {
  this.raf = 0;
  if (!splash.isConnected) return;
  if (!this.t0 && !this.ready(now)) {
   this.raf = requestAnimationFrame(this.frame);
   return;
  }
  const t = now - this.t0;
  if (!this.landed) this.travel(t);
  if (this.gl) this.draw(t);
  this.raf = requestAnimationFrame(this.frame);
 }

 // The ghost on its way in: along the spiral, growing as it nears, coming out of the mist at first, leaning into the
 // turns and looking where it goes.
 travel(t) {
  const now = pose(t, this.w, this.h);
  if (now.q >= 1) return this.land(t);
  if (now.q <= 0) return;
  const speed = Math.hypot(now.vx, now.vy) || 1;
  this.tilt = lerp(this.tilt, Math.max(-1, Math.min(1, now.vx / 1.4)) * FLIGHT.tilt, 0.2);
  this.fly.style.transform = `translate(${now.x.toFixed(2)}px, ${now.y.toFixed(2)}px) rotate(${this.tilt.toFixed(2)}deg) scale(${now.scale.toFixed(4)})`;
  this.fly.style.opacity = now.presence.toFixed(3);
  this.ghost.look(now.vx / speed * FLIGHT.gaze[0], now.vy / speed * FLIGHT.gaze[1], 200);
  this.at = { x: this.w / 2 + now.x, y: this.h / 2 + now.y, scale: now.scale, presence: now.presence };
 }

 // The ghost settles in the middle, where its own place is.
 land(t) {
  this.landed = t;
  this.fly.style.removeProperty('transform');
  this.fly.style.opacity = '1';
  this.onLand();
 }

 draw(t) {
  const gl = this.gl, u = this.u;
  // Once landed, the light follows the ghost as it makes room for its name.
  if (this.landed) {
   const box = this.ghost.getBoundingClientRect();
   this.at = { x: box.left + box.width / 2, y: box.top + box.height / 2, scale: 1, presence: 1 };
  }
  // The trail is taken from the way itself, so it is as smooth as the flight; once the ghost has landed, it ages behind it.
  const keep = this.mist.keep, points = new Float32Array(keep * 3), end = Math.min(t, LAND);
  let count = 0, [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let k = 0; k < keep && !this.cut && t - end < TRAIL.life * 1000; k++) {
   const when = end - TRAIL.life * 1000 * (k / (keep - 1)) ** TRAIL.bunch;
   if (when < FLIGHT.at) break;
   const p = pose(when, this.w, this.h), x = this.w / 2 + p.x, y = this.h / 2 + p.y;
   // A stretch flown while the ghost was still coming out of the mist counts as older, so the trail starts faint.
   points.set([x, y, (t - when) / 1000 + (1 - p.presence) * TRAIL.life], count++ * 3);
   [left, top, right, bottom] = [Math.min(left, x), Math.min(top, y), Math.max(right, x), Math.max(bottom, y)];
  }
  gl.uniform2f(u.view, this.w, this.h);
  gl.uniform1f(u.density, this.canvas.width / this.w);
  gl.uniform1f(u.time, t / 1000);
  gl.uniform1f(u.show, smooth(clamp(t / MIST.show)));
  gl.uniform1f(u.pulse, this.landed ? (t - this.landed) / 1000 : -1);
  gl.uniform4f(u.ghost, this.at.x, this.at.y, this.at.scale, this.at.presence);
  gl.uniform3fv(u.trail, points);
  gl.uniform1f(u.count, count);
  if (count > 1) gl.uniform4f(u.box, left - TRAIL.reach, top - TRAIL.reach, right + TRAIL.reach, bottom + TRAIL.reach);
  else gl.uniform4f(u.box, -1, -1, -1, -1);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
 }

 // Straight to the ghost in its place, with the mist already in.
 skip() {
  // Skipped before the scene began: the mist comes in only if its shader is ready.
  if (!this.t0) {
   if (this.mist && !this.mist.done()) this.mist = null;
   this.setup();
  }
  if (!this.landed) {
   const now = performance.now();
   // The ghost never flew this way, so it leaves no trail.
   this.cut = true;
   this.t0 = this.t0 ? Math.min(this.t0, now - MIST.show) : now - MIST.show;
   this.land(now - this.t0);
  }
  for (const animation of this.aura.getAnimations()) animation.finish();
  if (!this.gl) this.aura.style.opacity = '0.82';
  this.raf ||= requestAnimationFrame(this.frame);
 }

 stop() {
  cancelAnimationFrame(this.raf);
  this.raf = 0;
  removeEventListener('resize', this.resize);
 }
}

async function play() {
 const fly = splash.querySelector('.splash-fly'), box = splash.querySelector('.splash-ghost');
 const word = splash.querySelector('.splash-word'), ghost = splash.querySelector('ghost-thinking');
 await customElements.whenDefined('ghost-thinking');
 // The name, and under it the same name out of focus: soft letters painted once, which the sharp ones fade in over.
 // A blur that changes as it plays would be painted anew on every frame.
 const haze = word.cloneNode(false), text = word.textContent;
 haze.classList.add('splash-haze');
 word.after(haze);
 const split = el => {
  const spans = [...text].map(char => {
   const letter = document.createElement('span');
   letter.textContent = char;
   return letter;
  });
  el.replaceChildren(...spans);
  el.classList.add('is-set');
  return spans;
 };
 const letters = split(word), soft = split(haze);

 const stage = new Stage({ fly, ghost });
 stage.start();
 if (await Promise.race([stage.done.then(() => false), skipped.then(() => true)])) stage.skip();
 setTimeout(() => ghost.blink(), BLINK);

 // The ghost makes room and its name comes into focus beside it, the letters drawing together as they sharpen.
 const size = fly.offsetWidth, shift = (WORD.gap + word.offsetWidth) / 2;
 word.style.left = haze.style.left = `calc(50% - ${shift}px + ${size / 2 + WORD.gap}px)`;
 ghost.look(...GAZE.word, 2000);
 box.animate({ translate: ['0 0', `${-shift}px 0`] }, { ...SHIFT, fill: 'forwards' });
 // Each letter moves on its own, so drawing them together never lays the word out again.
 const spread = parseFloat(getComputedStyle(word).fontSize) * WORD.spread;
 letters.forEach((letter, k) => {
  const timing = { duration: WORD.duration, delay: WORD.delay + k * WORD.stagger, easing: 'ease-out', fill: 'both' };
  for (const el of [letter, soft[k]]) el.animate([{ transform: `translateX(${k * spread}px)` }, { transform: 'none' }], { duration: WORD.track, easing: WORD.easing, fill: 'both' });
  soft[k].animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], timing);
  letter.animate([{ opacity: 0 }, { opacity: 0, offset: 0.18 }, { opacity: 1 }], timing);
 });
 await wait(WORD.delay + letters.length * WORD.stagger + WORD.duration + HOLD);
 settle();
 await open(fly, word, soft, ghost);
 stage.stop();
 finish();
}

function open(fly, word, soft, ghost) {
 splash.classList.add('is-opening');
 const welcome = document.querySelector('.main.is-empty .welcome'), mark = welcome?.querySelector('ghost-thinking');
 for (const animation of welcome?.getAnimations() || []) animation.finish();
 const target = welcome && getComputedStyle(welcome).display !== 'none' ? welcome.querySelector('.welcome-flight').getBoundingClientRect() : null;
 const now = fly.getBoundingClientRect(), current = splash.querySelector('.splash-ghost-body').getBoundingClientRect();
 const app = document.querySelector('.app');
 // The name goes out of focus as it leaves: the sharp letters fade and the soft ones show for a moment. The ghost sets
 // off once the name is half gone, so it doesn't fly across it.
 word.animate([{ opacity: 1, transform: 'translateY(-54%)' }, { opacity: 0, transform: 'translateY(-54%) scale(0.98)' }], { duration: LEAVE.word, easing: 'ease-out', fill: 'forwards' });
 for (const letter of soft) letter.animate([{ opacity: 0 }, { opacity: LEAVE.haze, offset: 0.3 }, { opacity: 0 }], { duration: LEAVE.word + 60, easing: 'ease-out', fill: 'forwards' });
 splash.querySelector('.splash-bg').animate([{ opacity: 1 }, { opacity: 0 }], { duration: OPEN.duration, delay: 80, easing: 'ease', fill: 'forwards' });
 app.animate([{ opacity: 0, transform: 'scale(0.975)' }, { opacity: 1, transform: 'none' }], OPEN);
 setTimeout(bar, OPEN.duration / 2);
 if (!target) return fly.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(0.8)' }], { ...OPEN, fill: 'forwards' }).finished;
 const s = target.width / current.width, origin = { x: now.left + now.width / 2, y: now.top + now.height / 2 };
 const center = { x: current.left + current.width / 2, y: current.top + current.height / 2 };
 const dx = target.left + target.width / 2 - origin.x - s * (center.x - origin.x), dy = target.top + target.height / 2 - origin.y - s * (center.y - origin.y);
 ghost.look(...GAZE.land, OPEN.duration + 400);
 if (mark) {
  mark.start = ghost.start;
  mark.look?.(...GAZE.land, OPEN.duration + 1200);
 }
 return fly.animate({ translate: ['0 0', `${dx}px ${dy}px`], scale: [1, s] }, { ...OPEN, delay: LEAVE.fly, fill: 'both' }).finished;
}

splash.addEventListener('pointerdown', () => skip());
window.addEventListener('keydown', () => skip(), { once: true });
play().catch(finish);
})();
