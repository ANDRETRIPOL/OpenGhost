(() => {
'use strict';

const GAP = 8;
const EDGE = 8;
const SOURCE = '.message.is-assistant .message-content';

class SelectionMenu {
 constructor({ onAsk, onMini }) {
  this.onAsk = onAsk;
  this.onMini = onMini;
  this.range = null;
  this.box = null;
  this.text = '';
  this.down = false;
  this.raf = 0;
  const el = this.el = document.createElement('div');
  el.className = 'select-menu';
  el.popover = 'manual';
  el.setAttribute('role', 'toolbar');
  el.innerHTML = `<button type="button" class="select-menu-button" data-action="ask">${Glyphs.quote}<span>${I18n.t('select.ask')}</span></button>`
   + `<span class="select-menu-divider" aria-hidden="true"></span>`
   + `<button type="button" class="select-menu-button" data-action="mini">${Glyphs.bubble}<span>${I18n.t('select.mini')}</span></button>`;
  this.mini = el.querySelector('[data-action="mini"]');
  this.divider = el.querySelector('.select-menu-divider');
  document.body.append(el);
  el.addEventListener('pointerdown', event => event.preventDefault());
  el.addEventListener('click', event => this.onClick(event));
  document.addEventListener('selectionchange', () => this.schedule());
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
  document.addEventListener('keydown', event => { if (event.key === 'Escape') this.hide(); }, true);
  document.addEventListener('scroll', () => { if (this.shown) this.place(); }, true);
  window.addEventListener('resize', () => this.hide());
 }

 get shown() {
  return this.el.matches(':popover-open');
 }

 schedule() {
  cancelAnimationFrame(this.raf);
  this.raf = requestAnimationFrame(() => this.update());
 }

 // A triple click selects up to the start of the next block, which may lie outside the reply; such a tail is fine as long as it holds no text.
 source(range) {
  const of = node => (node.nodeType === 1 ? node : node.parentElement)?.closest(SOURCE);
  const start = of(range.startContainer), end = of(range.endContainer);
  if (start && start === end) return { box: start, range };
  const box = start || end;
  if (!box || (start && end)) return null;
  const inner = document.createRange();
  inner.selectNodeContents(box);
  if (start) inner.setStart(range.startContainer, range.startOffset);
  else inner.setEnd(range.endContainer, range.endOffset);
  return inner.toString().trim() === range.toString().trim() ? { box, range: inner } : null;
 }

 update() {
  if (this.down) return;
  const selection = document.getSelection();
  if (!selection.rangeCount || selection.isCollapsed) { this.hide(); return; }
  const found = this.source(selection.getRangeAt(0));
  const text = found ? selection.toString().trim() : '';
  if (!text) { this.hide(); return; }
  const { box, range } = found;
  this.range = range;
  this.box = box;
  this.text = text;
  const layer = box.closest('dialog') || document.body;
  this.mini.hidden = this.divider.hidden = layer !== document.body;
  if (this.el.parentElement !== layer) {
   this.hide();
   layer.append(this.el);
  }
  if (!this.shown) this.el.showPopover();
  this.place();
 }

 place() {
  const rects = [...this.range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
  if (!rects.length) { this.hide(); return; }
  const first = rects[0], last = rects[rects.length - 1], width = this.el.offsetWidth, height = this.el.offsetHeight;
  if (last.bottom < 0 || first.top > innerHeight) { this.el.style.visibility = 'hidden'; return; }
  let top = first.top - height - GAP;
  const below = top < EDGE;
  if (below) top = last.bottom + GAP;
  this.el.classList.toggle('is-below', below);
  const left = Math.min(Math.max(EDGE, first.left), innerWidth - width - EDGE);
  this.el.style.visibility = '';
  this.el.style.translate = `${Math.round(left)}px ${Math.round(top)}px`;
 }

 hide() {
  if (this.shown) this.el.hidePopover();
  this.range = null;
  this.box = null;
  if (!this.el.parentElement?.isConnected) document.body.append(this.el);
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
