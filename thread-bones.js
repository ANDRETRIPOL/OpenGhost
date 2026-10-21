(() => {
'use strict';

// The chat while a panel beside it opens or closes (the sidebar on the left, the browser on the right) or the browser
// is dragged wider: the chat's column changes width over many frames, and every message, and the words in the
// composer, would be set anew on each of them. So for that while they step aside, as the words do in the mini chat
// (mini-chat.js, which this follows): the list keeps the width it had and fades out, and each message on screen is
// drawn as grey bars where its lines were, in a column that narrows as the list would; the composer keeps its shape
// and what is in it gives way to a bar. When the panel has come to rest, everything takes its new width once, the
// chat is put back where it was read, and the words return.
const FADE = 200;
// What is in the composer goes faster: it holds its width while the composer narrows round it.
const QUICK = 90;
const BONES = { lines: 12, widths: [100, 94, 98, 89, 96, 91], last: 58 };
const SETTLE = 150;
const MOVES = { right: 'is-browser-open', left: 'is-sidebar-collapsed' };

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const px = (el, name) => parseFloat(getComputedStyle(el).getPropertyValue(name)) || 0;

class ThreadBones {
 constructor({ app, main, thread }) {
  this.app = app;
  this.main = main;
  this.thread = thread;
  this.view = thread.parentElement;
  this.state = null;
  this.timer = 0;
  this.flags = this.read();
  new MutationObserver(() => this.sync()).observe(app, { attributes: true, attributeFilter: ['class'] });
  main.addEventListener('transitionend', event => { if (event.target === main && event.propertyName in MOVES) this.rest(); });
 }

 read() {
  return { right: this.app.classList.contains(MOVES.right), left: this.app.classList.contains(MOVES.left) };
 }

 sync() {
  const flags = this.read(), was = this.flags, dragged = this.app.classList.contains('is-browser-resizing') || this.app.classList.contains('is-sidebar-resizing');
  this.flags = flags;
  if (dragged) { this.veil(); clearTimeout(this.timer); this.held = true; return; }
  if (this.held) { this.held = false; this.unveil(); }
  if (flags.right === was.right && flags.left === was.left) return;
  // How much wider the chat's room is about to be: the browser takes its width and a gap, the sidebar gives its own back.
  let wider = 0;
  if (flags.right !== was.right) wider += (flags.right ? -1 : 1) * (this.length('var(--chat-gap)') + this.length('var(--browser-width, 520px)'));
  if (flags.left !== was.left) wider += (flags.left ? 1 : -1) * (this.length('var(--sidebar-size)') - this.length('var(--chat-gap)'));
  if (reducedMotion() || !this.narrows(wider)) return;
  this.veil();
  // The end of the move is the sign to come back; should it never be told, the words are not left hidden.
  clearTimeout(this.timer);
  this.timer = setTimeout(() => this.unveil(), (px(this.main, '--motion-duration') || 0.6) * 1000 + SETTLE);
 }

 rest() {
  if (!this.state || this.held) return;
  clearTimeout(this.timer);
  this.unveil();
 }

 list() {
  return this.thread.querySelector('.thread-list:not(.is-parked)');
 }

 composer() {
  const composer = this.main.querySelector(':scope > .composer');
  return composer?.offsetWidth ? composer : null;
 }

 // Whether the column of the chat will be another width once the panel is where it is going: in a wide window the
 // column keeps its width and only moves aside, and nothing has to be hidden.
 narrows(wider) {
  const column = this.composer() || this.list();
  if (!column) return false;
  const width = Math.min(this.length('var(--composer-max-width)'), this.thread.clientWidth + wider - 2 * this.length('var(--composer-side-gap)'));
  return Math.abs(width - column.getBoundingClientRect().width) > 1;
 }

 // A length of the chat's own, as the page works it out.
 length(value) {
  const probe = document.createElement('div');
  probe.style.cssText = `position:absolute;visibility:hidden;height:0;width:${value}`;
  this.thread.append(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width;
 }

 veil() {
  if (this.state) return;
  const words = this.veilList(), field = this.veilComposer();
  if (words || field) this.state = { words, field };
 }

 unveil() {
  const state = this.state;
  if (!state) return;
  this.state = null;
  if (state.field) this.unveilComposer(state.field);
  if (state.words) this.unveilList(state.words);
 }

 veilList() {
  const list = this.list();
  if (!list?.childElementCount) return null;
  const frame = this.view.getBoundingClientRect(), column = list.getBoundingClientRect();
  const bones = document.createElement('div'), inner = bones.appendChild(document.createElement('div'));
  bones.className = 'thread-bones';
  inner.className = 'thread-bones-column';
  const inView = r => r.height > 0 && r.bottom > frame.top && r.top < frame.bottom;
  let anchor = null;
  const group = (el, r, className) => {
   if (!anchor) anchor = { el, top: r.top };
   const box = inner.appendChild(document.createElement('div'));
   box.className = className;
   box.style.top = `${(r.top - frame.top).toFixed(1)}px`;
   box.style.height = `${r.height.toFixed(1)}px`;
   return box;
  };
  for (const message of list.children) {
   if (!inView(message.getBoundingClientRect())) continue;
   const bubble = message.matches('.is-user') && message.querySelector('.message-bubble');
   if (bubble) {
    // The user's words keep the shape of their bubble, by the right edge.
    const r = bubble.getBoundingClientRect();
    if (!inView(r)) continue;
    const box = group(bubble, r, 'mini-bone is-bubble');
    box.style.right = `${(column.right - r.right).toFixed(1)}px`;
    box.style.width = `min(${r.width.toFixed(1)}px, 100%)`;
    box.style.borderRadius = getComputedStyle(bubble).borderRadius;
    continue;
   }
   // A reply is drawn block by block, a bar for a line.
   for (const content of message.querySelectorAll('.message-content')) {
    for (const block of content.children.length ? content.children : [content]) {
     const r = block.getBoundingClientRect();
     if (!inView(r)) continue;
     const pitch = parseFloat(getComputedStyle(block).lineHeight) || 24, lines = clamp(Math.round(r.height / pitch), 1, BONES.lines);
     const box = group(block, r, 'mini-lines');
     box.style.left = `${(r.left - column.left).toFixed(1)}px`;
     box.style.right = `${(column.right - r.right).toFixed(1)}px`;
     for (let k = 0; k < lines; k++) {
      const bar = box.appendChild(document.createElement('span'));
      bar.className = 'mini-bone';
      bar.style.width = `${k === lines - 1 && lines > 1 ? BONES.last : BONES.widths[k % BONES.widths.length]}%`;
     }
    }
   }
  }
  if (!inner.childElementCount) return null;
  const thread = this.thread, bottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 2;
  // The list holds its width, so nothing in it is set anew while the column changes. It stays drawn as it is: taken out
  // of the page's work for the while, the whole chat had to be painted afresh when it came back, and on a slow computer
  // the words could be seen settling for a second or two.
  list.style.width = `${column.width}px`;
  this.view.append(bones);
  bones.getBoundingClientRect();
  bones.classList.add('is-shown');
  const fade = list.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE, easing: 'ease', fill: 'forwards' });
  return { list, bones, fade, anchor, bottom };
 }

 unveilList({ list, bones, fade, anchor, bottom }) {
  const thread = this.thread;
  list.style.width = '';
  // Set once at its new width, the chat is put back where it was being read: at its end, or with the same block at the same height.
  if (bottom) thread.scrollTop = thread.scrollHeight;
  else if (anchor?.el.isConnected) thread.scrollTop += anchor.el.getBoundingClientRect().top - anchor.top;
  window.ThreadWindow?.rest(thread);
  fade.cancel();
  list.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE, easing: 'ease' });
  bones.classList.remove('is-shown');
  setTimeout(() => bones.remove(), FADE + 60);
 }

 // The composer keeps its shape and narrows as it would; the field and the buttons in it hold the width they had, so
 // the words written are not set anew, and give way to one bar where the first line was.
 veilComposer() {
  const composer = this.composer();
  if (!composer) return null;
  const parts = [...composer.children].filter(el => el.offsetWidth && el.offsetHeight && getComputedStyle(el).position !== 'absolute');
  if (!parts.length) return null;
  const box = composer.getBoundingClientRect(), field = (composer.querySelector('.composer-field') || parts[0]).getBoundingClientRect();
  const bones = document.createElement('div'), bar = bones.appendChild(document.createElement('span'));
  bones.className = 'composer-bones';
  bones.style.left = `${(field.left - box.left).toFixed(1)}px`;
  bones.style.top = `${(field.top - box.top).toFixed(1)}px`;
  bones.style.height = `${(parseFloat(getComputedStyle(composer).lineHeight) || 24).toFixed(1)}px`;
  bar.className = 'mini-bone';
  const fades = parts.map(el => {
   el.style.width = `${el.getBoundingClientRect().width}px`;
   return el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: QUICK, easing: 'ease', fill: 'forwards' });
  });
  composer.append(bones);
  bones.getBoundingClientRect();
  bones.classList.add('is-shown');
  return { parts, fades, bones };
 }

 unveilComposer({ parts, fades, bones }) {
  for (const [k, el] of parts.entries()) {
   el.style.width = '';
   fades[k].cancel();
   el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE, easing: 'ease' });
  }
  bones.classList.remove('is-shown');
  setTimeout(() => bones.remove(), FADE + 60);
 }
}

window.ThreadBones = ThreadBones;
})();
