(() => {
'use strict';

// The menu a right click brings: cut, copy, paste and select all in a field (the composer, an API key in the settings,
// any other), copy over words selected in the chat. It is the menu of a chat's three dots (row-menu.js), its glass, its
// lines and its highlight, standing at the pointer. The field keeps the keyboard the whole time; what is chosen is done
// to it by the window itself, as the keys would (desktop/main.js, edit:do).
const OPEN = { duration: 133, easing: 'cubic-bezier(0.37, 0, 0.63, 1)' };
const CLOSE = { duration: 110, easing: 'ease-out', fill: 'forwards' };
const FROM = { opacity: 0, transform: 'scale(0.96)', filter: 'blur(4px)' };
const REST = { opacity: 1, transform: 'none', filter: 'blur(0px)' };
const AWAY = { opacity: 0, transform: 'scale(1.03)', filter: 'blur(8px)' };
// The menu stands this far off the pointer and keeps this far from the window's edges.
const OFF = 4;
const EDGE = 8;
const GLIDE_SPRING = [520, 40];
const FADE_SPRING = [320, 32];
// Fields with words in them, of the kinds input has.
const WORDS = new Set(['', 'text', 'password', 'search', 'email', 'url', 'tel', 'number']);
const svg = body => `<svg class="glyph" viewBox="30 30 60 60" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const SIGNS = {
 cut: svg('<circle cx="46" cy="72" r="7"/><circle cx="74" cy="72" r="7"/><path d="M50.5 66.5 71 39M69.5 66.5 49 39"/>'),
 copy: Glyphs.copy,
 paste: svg('<path d="M53 40h-6a5 5 0 0 0-5 5v31a5 5 0 0 0 5 5h26a5 5 0 0 0 5-5V45a5 5 0 0 0-5-5h-6"/><rect x="52" y="36" width="16" height="9" rx="3"/>'),
 selectAll: svg('<path d="M45 40h-1a4 4 0 0 0-4 4v1M55 40h10M75 40h1a4 4 0 0 1 4 4v1M80 55v10M80 75v1a4 4 0 0 1-4 4h-1M65 80H55M45 80h-1a4 4 0 0 1-4-4v-1M40 65V55"/>'),
};

function spring(s, goal, [k, c], dt) {
 const steps = Math.max(1, Math.ceil(dt / 0.008)), h = dt / steps;
 for (let i = 0; i < steps; i++) { s[1] += ((goal - s[0]) * k - s[1] * c) * h; s[0] += s[1] * h; }
 if (Math.abs(goal - s[0]) < 0.01 && Math.abs(s[1]) < 0.05) { s[0] = goal; s[1] = 0; return false; }
 return true;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

class EditMenu {
 constructor() {
  this.target = null;
  this.leaving = null;
  this.g = { y: [0, 0], o: [0, 0] };
  this.pointed = null;
  this.raf = 0;
  this.last = 0;
  this.tick = this.tick.bind(this);
  const root = this.root = Object.assign(document.createElement('div'), { className: 'row-menu glass-lens edit-menu' });
  root.setAttribute('popover', 'manual');
  root.setAttribute('role', 'menu');
  document.body.append(root);
  // The field keeps the keyboard: a press on the menu takes nothing from it.
  root.addEventListener('pointerdown', event => event.preventDefault());
  root.addEventListener('click', event => {
   const line = event.target.closest('.row-menu-line');
   if (line && !line.disabled) this.choose(line.dataset.name);
  });
  root.addEventListener('pointermove', event => this.point(event.target.closest?.('.row-menu-line:not(:disabled)') || null));
  root.addEventListener('pointerleave', () => this.point(null));
  document.addEventListener('contextmenu', event => this.open(event));
  document.addEventListener('pointerdown', event => { if (this.target && !root.contains(event.target)) this.close(); }, true);
  document.addEventListener('keydown', event => this.onKey(event), true);
  document.addEventListener('scroll', () => this.close(), { capture: true, passive: true });
  window.addEventListener('resize', () => this.close(true));
  window.addEventListener('blur', () => this.close(true));
 }

 // What was right-clicked: a field with words, or words selected anywhere else. Nothing else has a menu.
 open(event) {
  const field = event.target.closest?.('input, textarea, [contenteditable]:not([contenteditable="false"])');
  const kind = field && (field.tagName !== 'INPUT' || WORDS.has((field.getAttribute('type') || '').toLowerCase())) ? field : null;
  const selection = document.getSelection(), picked = !kind && selection.rangeCount && !selection.isCollapsed && String(selection).trim();
  if (!kind && !picked) { this.close(true); return; }
  event.preventDefault();
  if (this.target) this.finish();
  this.target = kind ? this.fieldState(kind) : { range: selection.getRangeAt(0).cloneRange() };
  const lines = kind ? this.fieldLines(this.target) : [{ name: 'copy' }];
  this.glide = Object.assign(document.createElement('span'), { className: 'row-menu-glide' });
  this.glide.setAttribute('aria-hidden', 'true');
  this.g = { y: [0, 0], o: [0, 0] };
  this.pointed = null;
  this.root.replaceChildren(this.glide, ...lines.map(({ name, disabled }) => {
   const line = Object.assign(document.createElement('button'), { type: 'button', className: `row-menu-line is-${name}`, disabled: !!disabled, tabIndex: -1 });
   line.dataset.name = name;
   line.setAttribute('role', 'menuitem');
   line.innerHTML = `${SIGNS[name]}<span class="row-menu-word"></span>`;
   line.querySelector('.row-menu-word').textContent = I18n.t(`edit.${name}`);
   return line;
  }));
  // Over a dialog (the settings) the rest of the page can't be pressed: the menu stands in it.
  const host = (kind || event.target).closest?.('dialog[open]') || document.body;
  if (this.root.parentElement !== host) host.append(this.root);
  this.root.showPopover();
  this.place(event.clientX, event.clientY);
  // Over the clear sidebar of a window of glass it needs a ground under it to be frosted there (glass-ground.js).
  this.grounded = window.GlassGround?.hold(this.root);
  this.root.animate(reducedMotion() ? [{ opacity: 0 }, { opacity: 1 }] : [FROM, REST], OPEN);
 }

 // A field as it was when the menu came: where its words were selected, so that what is chosen acts on just them.
 fieldState(field) {
  const state = { field, value: field.isContentEditable ? field.textContent : field.value };
  if (field.isContentEditable) {
   const selection = document.getSelection();
   state.range = selection.rangeCount && field.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null;
   state.picked = !!state.range && !state.range.collapsed;
  } else {
   state.start = field.selectionStart;
   state.end = field.selectionEnd;
   state.picked = state.start !== null && state.start !== state.end;
  }
  return state;
 }

 fieldLines({ field, picked, value }) {
  const locked = field.readOnly || field.disabled || field.getAttribute('aria-disabled') === 'true';
  // A password's letters are never taken out of its field.
  const secret = field.tagName === 'INPUT' && (field.getAttribute('type') || '').toLowerCase() === 'password';
  return [
   { name: 'cut', disabled: !picked || secret || locked },
   { name: 'copy', disabled: !picked || secret },
   { name: 'paste', disabled: locked },
   { name: 'selectAll', disabled: !value },
  ];
 }

 place(x, y) {
  const root = this.root, width = root.offsetWidth, height = root.offsetHeight;
  const left = x + OFF + width > innerWidth - EDGE ? Math.max(EDGE, x - OFF - width) : x + OFF;
  const top = y + OFF + height > innerHeight - EDGE ? Math.max(EDGE, y - OFF - height) : y + OFF;
  Object.assign(root.style, { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` });
 }

 point(line) {
  if (line === this.pointed) return;
  this.pointed = line;
  if (this.raf) return;
  this.last = performance.now();
  this.raf = requestAnimationFrame(this.tick);
 }

 tick(now) {
  this.raf = 0;
  const glide = this.glide, line = this.pointed?.isConnected ? this.pointed : null;
  if (!glide?.isConnected) return;
  const dt = Math.min(Math.max((now - this.last) / 1000, 0), 0.032), g = this.g;
  this.last = now;
  let moving = false;
  if (reducedMotion()) {
   if (line) g.y = [line.offsetTop, 0];
   g.o = [line ? 1 : 0, 0];
  } else {
   if (line && g.o[0] < 0.02) g.y = [line.offsetTop, 0];
   if (line) moving = spring(g.y, line.offsetTop, GLIDE_SPRING, dt) || moving;
   moving = spring(g.o, line ? 1 : 0, FADE_SPRING, dt) || moving;
  }
  glide.style.transform = `translateY(${g.y[0].toFixed(2)}px)`;
  glide.style.opacity = Math.min(1, Math.max(0, g.o[0])).toFixed(3);
  if (moving) this.raf = requestAnimationFrame(this.tick);
 }

 // The keys move the highlight and choose; Escape puts the menu away. The field keeps the keyboard meanwhile.
 onKey(event) {
  if (!this.target) return;
  const lines = [...this.root.querySelectorAll('.row-menu-line:not(:disabled)')];
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); return; }
  if (event.key === 'Enter' && this.pointed) { event.preventDefault(); event.stopPropagation(); this.choose(this.pointed.dataset.name); return; }
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (!step || !lines.length) { this.close(true); return; }
  event.preventDefault();
  event.stopPropagation();
  const at = lines.indexOf(this.pointed);
  this.point(lines[at < 0 ? (step > 0 ? 0 : lines.length - 1) : (at + step + lines.length) % lines.length]);
 }

 // What is chosen is done where the menu was called: the field's words as they were selected, or the chat's.
 choose(name) {
  const target = this.target;
  this.close(true);
  if (!target) return;
  if (target.field) {
   const field = target.field;
   field.focus({ preventScroll: true });
   if (target.range) { const selection = document.getSelection(); selection.removeAllRanges(); selection.addRange(target.range); }
   else if (target.start !== undefined && target.start !== null) field.setSelectionRange(target.start, target.end);
  } else if (target.range) {
   const selection = document.getSelection();
   selection.removeAllRanges();
   selection.addRange(target.range);
  }
  window.openghost?.edit?.(name);
 }

 close(instant = false) {
  if (!this.target) return;
  this.target = null;
  this.grounded?.();
  this.grounded = null;
  if (instant || !this.root.matches(':popover-open')) { this.finish(); return; }
  const gone = this.leaving = this.root.animate(reducedMotion() ? { opacity: 0 } : AWAY, CLOSE);
  const done = () => { if (this.leaving === gone) this.finish(); };
  gone.finished.then(done, done);
 }

 finish() {
  this.grounded?.();
  this.grounded = null;
  this.target = null;
  this.leaving = null;
  for (const animation of this.root.getAnimations()) animation.cancel();
  if (this.root.matches(':popover-open')) this.root.hidePopover();
 }
}

window.EditMenu = EditMenu;
})();
