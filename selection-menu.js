(() => {
'use strict';

const GAP = 8;
const EDGE = 8;
const FADE = 32;
const SOURCE = '.message.is-assistant .message-content';
// The buttons under a message hold none of its words.
const CHROME = '.message-tools, .message-actions';

class SelectionMenu {
 constructor({ onAsk, onMini }) {
  this.onAsk = onAsk;
  this.onMini = onMini;
  this.range = null;
  this.box = null;
  this.text = '';
  this.down = false;
  this.trimming = false;
  this.raf = 0;
  this.focus = new SelectionFocus();
  const el = this.el = document.createElement('div');
  el.className = 'select-menu';
  el.setAttribute('role', 'toolbar');
  el.innerHTML = `<button type="button" class="select-menu-button" data-action="ask">${Glyphs.quote}<span>${I18n.t('select.ask')}</span></button>`
   + `<span class="select-menu-divider" aria-hidden="true"></span>`
   + `<button type="button" class="select-menu-button" data-action="mini">${Glyphs.bubble}<span>${I18n.t('select.mini')}</span></button>`;
  this.mini = el.querySelector('[data-action="mini"]');
  this.divider = el.querySelector('.select-menu-divider');
  el.addEventListener('pointerdown', event => event.preventDefault());
  el.addEventListener('click', event => this.onClick(event));
  document.addEventListener('selectionchange', () => {
   const selection = document.getSelection();
   if (!selection.rangeCount || selection.isCollapsed) this.focus.release();
   this.schedule();
  });
  document.addEventListener('pointerdown', event => {
   if (el.contains(event.target)) return;
   this.down = true;
   if (event.pointerType !== 'mouse') this.hide();
  }, true);
  // Only mousedown knows the click count: the second and third click of a double or triple click just widen the selection.
  document.addEventListener('mousedown', event => {
   if (!el.contains(event.target) && event.detail < 2) this.hide();
  }, true);
  document.addEventListener('pointerup', () => {
   this.down = false;
   this.schedule();
  }, true);
  // Escape lets the selection go along with the menu and the blur, the same as a click elsewhere.
  document.addEventListener('keydown', event => {
   if (event.key !== 'Escape' || !this.shown) return;
   event.preventDefault();
   this.hide();
   document.getSelection().removeAllRanges();
  }, true);
  window.addEventListener('resize', () => this.hide());
 }

 get shown() {
  return this.el.classList.contains('is-shown');
 }

 schedule() {
  cancelAnimationFrame(this.raf);
  this.raf = requestAnimationFrame(() => this.update());
 }

 // A selection often runs on past the reply it starts in: a triple click reaches the next block, a quick drag the scrollbar or the composer.
 // What counts is the reply's own text, so the selection is cut back to the reply, unless the overflow takes in another message.
 source(range) {
  const of = node => (node.nodeType === 1 ? node : node.parentElement)?.closest(SOURCE);
  const start = of(range.startContainer), end = of(range.endContainer);
  if (start && start === end) return { box: start, range };
  const box = start || end;
  if (!box || (start && end) || this.reaches(range, box)) return null;
  // The cut lands on the reply's first or last letter, not on the reply's box, so the trimmed selection stays inside it.
  const texts = document.createTreeWalker(box, NodeFilter.SHOW_TEXT), inner = document.createRange();
  if (start) {
   let last = null;
   while (texts.nextNode()) last = texts.currentNode;
   if (!last) return null;
   inner.setStart(range.startContainer, range.startOffset);
   inner.setEnd(last, last.length);
  } else {
   const first = texts.nextNode();
   if (!first) return null;
   inner.setStart(first, 0);
   inner.setEnd(range.endContainer, range.endOffset);
  }
  return { box, range: inner };
 }

 // Whether the selection takes in words of any message besides this reply.
 reaches(range, box) {
  const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
   if (!node.data.trim() || box.contains(node) || !range.intersectsNode(node)) continue;
   const holder = node.parentElement;
   if (holder?.closest('.message') && !holder.closest(CHROME)) return true;
  }
  return false;
 }

 update() {
  if (this.down) return;
  const selection = document.getSelection();
  if (!selection.rangeCount || selection.isCollapsed) { this.hide(); return; }
  const whole = selection.getRangeAt(0), found = this.source(whole), trimmed = found && found.range !== whole;
  // The selection itself shrinks back to the reply, so the highlight shows just what the menu will quote;
  // the change it makes brings this back round with the trimmed selection. Should it not take, the reply's part is used as it is.
  if (trimmed && !this.trimming) {
   this.trimming = true;
   const inner = found.range, forward = selection.anchorNode === whole.startContainer && selection.anchorOffset === whole.startOffset;
   if (forward) selection.setBaseAndExtent(inner.startContainer, inner.startOffset, inner.endContainer, inner.endOffset);
   else selection.setBaseAndExtent(inner.endContainer, inner.endOffset, inner.startContainer, inner.startOffset);
   return;
  }
  this.trimming = false;
  const text = !found ? '' : trimmed ? found.range.toString().trim() : selection.toString().trim();
  const thread = found?.box.closest('.thread');
  if (!text || !thread) { this.hide(); return; }
  const { box, range } = found;
  this.range = range;
  this.box = box;
  this.text = text;
  this.mini.hidden = this.divider.hidden = !!box.closest('dialog, .mini');
  if (this.el.parentElement !== thread) {
   this.el.classList.remove('is-shown');
   thread.append(this.el);
  }
  // Hidden, the menu is out of the layout; it has to be shown before it can be measured and placed.
  this.el.classList.add('is-shown');
  if (!this.place()) return;
  this.focus.show(range, box);
 }

 // The menu lives inside the scrolled feed, in its content coordinates, so it travels with the text without any work on scroll.
 place() {
  const thread = this.el.parentElement;
  const rects = [...this.range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
  if (!rects.length) { this.hide(); return false; }
  const view = thread.getBoundingClientRect(), first = rects[0], last = rects[rects.length - 1];
  const width = this.el.offsetWidth, height = this.el.offsetHeight;
  let top = first.top - height - GAP;
  const below = top < view.top + FADE;
  if (below) top = last.bottom + GAP;
  this.el.classList.toggle('is-below', below);
  const left = Math.min(Math.max(view.left + EDGE, first.left), view.right - width - EDGE);
  this.el.style.translate = `${Math.round(left - view.left + thread.scrollLeft)}px ${Math.round(top - view.top + thread.scrollTop)}px`;
  return true;
 }

 hide() {
  this.el.classList.remove('is-shown');
  this.range = null;
  this.box = null;
  this.focus.hide();
 }

 onClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button || !this.box) return;
  const { text, box } = this;
  this.hide();
  document.getSelection().removeAllRanges();
  if (button.dataset.action === 'ask') this.onAsk(text, box);
  else this.onMini(text, box);
 }
}

window.SelectionMenu = SelectionMenu;
})();
