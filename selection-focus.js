(() => {
'use strict';

// While a piece of a reply is selected, the rest of the feed steps back behind a soft blur.
// The veil lives inside the scrolled feed and the selection is cut out of it, so scrolling moves both together with no work per frame.
const IN = { duration: 520, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const OUT = { duration: 420, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' };
const PAD = { x: 2, y: 3 };
// Sideways the blur eases in over several letters; up and down the fade stays within the gap between lines, so a neighbouring line never shows through.
const FEATHER = { x: 56, y: 5 };
const JOIN = 16;
const STEPS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// How the feed steps back comes from the theme (--veil); the same filters at rest start and end it, so they blend smoothly.
function veilFilters() {
 const full = getComputedStyle(document.documentElement).getPropertyValue('--veil').trim();
 const rest = full.replace(/blur\([^)]*\)/g, 'blur(0px)').replace(/(brightness|contrast|saturate)\([^)]*\)/g, '$1(1)');
 return [{ backdropFilter: rest }, { backdropFilter: full }];
}
const px = value => `${Math.round(value * 2) / 2}px`;
const shade = t => `rgba(0, 0, 0, ${(t * t * (3 - 2 * t)).toFixed(3)})`;
// The edges of a cut-out follow a smoothstep: beside the first and last letters the blur eases in over FEATHER.x instead of starting at a line.
const BAND = `linear-gradient(90deg, ${STEPS.map(t => `${shade(t)} ${t * FEATHER.x}px`).join(', ')}, ${STEPS.map(t => `${shade(1 - t)} calc(100% - ${(1 - t) * FEATHER.x}px)`).join(', ')})`;
const RISE = `linear-gradient(${STEPS.map(t => `${shade(t)} ${t * 100}%`).join(', ')})`;
const FALL = `linear-gradient(${STEPS.map(t => `${shade(1 - t)} ${t * 100}%`).join(', ')})`;

// Rects on one line merge into a band; lines closer than JOIN close up into one lit block, so nothing between them blurs.
function bands(rects) {
 const lines = [];
 for (const rect of rects.sort((a, b) => a.top - b.top)) {
  const line = lines.find(item => Math.min(item.bottom, rect.bottom) - Math.max(item.top, rect.top) > 0.5 * Math.min(item.bottom - item.top, rect.bottom - rect.top));
  if (line) Object.assign(line, { left: Math.min(line.left, rect.left), right: Math.max(line.right, rect.right), top: Math.min(line.top, rect.top), bottom: Math.max(line.bottom, rect.bottom) });
  else lines.push({ ...rect });
 }
 lines.sort((a, b) => a.top - b.top);
 for (let i = 0; i + 1 < lines.length; i++) {
  const a = lines[i], b = lines[i + 1], gap = b.top - a.bottom;
  if (gap > JOIN) continue;
  if (gap > 0) a.bottom = b.top = (a.bottom + b.top) / 2;
  a.joinedBottom = b.joinedTop = true;
 }
 return lines;
}

class SelectionFocus {
 constructor() {
  this.veil = null;
  this.leaving = null;
  this.picked = null;
  this.room = null;
  this.thread = null;
  this.list = null;
  this.range = null;
  this.frame = 0;
  this.watch = new ResizeObserver(() => this.schedule());
 }

 show(range, box) {
  const thread = box.closest('.thread'), list = box.closest('.thread-list');
  if (!thread || !list) { this.hide(); return; }
  this.range = range;
  if (this.veil && this.thread === thread && this.list === list) {
   if (this.draw()) this.pick(box);
   return;
  }
  this.drop(this.veil);
  this.thread = thread;
  this.list = list;
  this.room = thread.closest('.main, .mini-main');
  // Selecting again right after letting go picks the fading veil back up instead of starting from sharp.
  const back = this.leaving?.parentElement === thread ? this.leaving : null;
  const veil = back || document.createElement('div');
  this.leaving = back ? null : this.leaving;
  if (!back) {
   veil.className = 'select-focus';
   veil.setAttribute('aria-hidden', 'true');
   thread.append(veil);
  }
  this.veil = veil;
  this.watch.observe(list);
  if (!this.draw()) return;
  this.pick(box);
  // The composer and the floating scroll button blur along with the feed, through CSS filters on the same timing.
  this.room?.classList.add('is-veiled');
  if (reducedMotion()) { veil.getAnimations().forEach(animation => animation.cancel()); return; }
  const [rest, full] = veilFilters();
  const from = back ? getComputedStyle(veil).backdropFilter : rest.backdropFilter;
  veil.getAnimations().forEach(animation => animation.cancel());
  veil.animate([{ backdropFilter: from }, full], IN);
 }

 hide() {
  this.room?.classList.remove('is-veiled');
  const veil = this.veil;
  if (!veil) return;
  this.veil = null;
  this.range = null;
  this.watch.disconnect();
  cancelAnimationFrame(this.frame);
  if (reducedMotion()) { veil.remove(); return; }
  this.drop(this.leaving);
  this.leaving = veil;
  const from = getComputedStyle(veil).backdropFilter;
  veil.getAnimations().forEach(animation => animation.cancel());
  veil.animate([{ backdropFilter: from }, veilFilters()[0]], { ...OUT, fill: 'forwards' }).finished.then(() => {
   if (this.leaving === veil) this.drop(veil);
  }, () => {});
 }

 // The blue wash comes back only once the selection itself is gone: a press on the selected words keeps them selected
 // until the button is let go, and the wash must not flash in that moment.
 release() {
  this.pick(null);
 }

 // The reply holding the selection loses its blue wash while the veil is up.
 pick(box) {
  if (this.picked === box) return;
  this.picked?.classList.remove('select-held');
  this.picked = box;
  box?.classList.add('select-held');
 }

 drop(veil) {
  if (!veil) return;
  veil.remove();
  if (this.leaving === veil) this.leaving = null;
 }

 schedule() {
  cancelAnimationFrame(this.frame);
  this.frame = requestAnimationFrame(() => this.draw());
 }

 // Measures the selection against the veil and cuts it out: every band is a soft-edged hole in the mask.
 draw() {
  const veil = this.veil, list = this.list, range = this.range;
  if (!veil || !range) return false;
  veil.style.top = px(list.offsetTop);
  veil.style.height = px(list.offsetHeight);
  const origin = veil.getBoundingClientRect();
  const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0)
   .map(rect => ({ left: rect.left - origin.left, right: rect.right - origin.left, top: rect.top - origin.top, bottom: rect.bottom - origin.top }));
  if (!rects.length) { this.hide(); return false; }
  const images = ['linear-gradient(#000 0 0)'], sizes = ['100% 100%'], places = ['0 0'], ops = ['subtract'];
  const cut = (image, x, y, width, height) => {
   images.push(image);
   sizes.push(`${px(width)} ${px(height)}`);
   places.push(`${px(x)} ${px(y)}`);
   ops.push('add');
  };
  for (const line of bands(rects)) {
   const x = line.left - PAD.x - FEATHER.x, width = line.right - line.left + 2 * (PAD.x + FEATHER.x);
   const top = line.top - (line.joinedTop ? 0 : PAD.y), bottom = line.bottom + (line.joinedBottom ? 0 : PAD.y);
   cut(BAND, x, top, width, bottom - top);
   if (!line.joinedTop) cut(RISE, x + FEATHER.x, top - FEATHER.y, width - 2 * FEATHER.x, FEATHER.y);
   if (!line.joinedBottom) cut(FALL, x + FEATHER.x, bottom, width - 2 * FEATHER.x, FEATHER.y);
  }
  Object.assign(veil.style, {
   maskImage: images.join(', '),
   maskSize: sizes.join(', '),
   maskPosition: places.join(', '),
   maskRepeat: 'no-repeat',
   maskComposite: ops.join(', '),
  });
  return true;
 }
}

window.SelectionFocus = SelectionFocus;
})();
