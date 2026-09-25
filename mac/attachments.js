(() => {
'use strict';

const MAX_ITEMS = 20;
const LEAVE = {
 duration: 220,
 easing: 'cubic-bezier(0.3, 0, 0.4, 1)',
 frames: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.72)' }],
};
const GLIDE = { duration: 460, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };
const REOPEN_GUARD = 350;
const DROP_ART = ['photo.jpg', 'main.py', 'report.pdf'];
const REMOVE_ICON = '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M2.6 2.6l4.8 4.8M7.4 2.6 2.6 7.4"/></svg>';
const NOTE_ICON = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 9.5l.5-2 5.2-5.2a1.1 1.1 0 0 1 1.5 0 1.1 1.1 0 0 1 0 1.5L4.5 9z"/></svg>';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const hasFiles = e => Array.from(e.dataTransfer?.types || []).includes('Files');

function element(tag, className, text) {
 const el = document.createElement(tag);
 el.className = className;
 if (text !== undefined) el.textContent = text;
 return el;
}

class Attachments {
 constructor({ tray, picker, panel, main, zone, input, onChange, isActive = () => true }) {
  this.isActive = isActive;
  this.tray = tray;
  this.row = tray.querySelector('.attachments-row');
  this.picker = picker;
  this.panel = panel;
  this.main = main;
  this.zone = zone;
  this.input = input;
  this.onChange = onChange;
  this.items = [];
  this.editing = null;
  this.cancelled = false;
  this.closed = { item: null, at: 0 };
  this.depth = 0;
  this.noteInput = panel.querySelector('.note-input');
  this.noteTitle = panel.querySelector('.note-title');
  this.noteThumb = panel.querySelector('.note-thumb');
  this.height = new SmoothHeight(tray, this.row);
  new ResizeObserver(() => this.syncFade()).observe(this.row);
  this.row.addEventListener('scroll', () => this.syncFade(), { passive: true });
  this.row.addEventListener('wheel', e => this.onWheel(e), { passive: false });
  picker.addEventListener('change', () => {
   this.add(picker.files);
   picker.value = '';
   input.focus();
  });
  input.addEventListener('paste', e => this.onPaste(e));
  panel.addEventListener('beforetoggle', e => { if (e.newState === 'closed') this.onNoteClosing(); });
  panel.addEventListener('toggle', e => { if (e.newState === 'closed' && !this.editing) this.restoreFocus(); });
  this.noteInput.addEventListener('keydown', e => this.onNoteKey(e));
  panel.querySelector('.note-done').addEventListener('click', () => panel.hidePopover());
  this.zone.querySelector('.drop-art').innerHTML = DROP_ART.map(name => FileKinds.icon(FileKinds.describe(name))).join('');
  this.drag = {
   dragenter: e => this.onDragEnter(e),
   dragover: e => this.onDragOver(e),
   dragleave: e => this.onDragLeave(e),
   drop: e => this.onDrop(e),
  };
  for (const [type, handler] of Object.entries(this.drag)) window.addEventListener(type, handler);
 }

 destroy() {
  for (const [type, handler] of Object.entries(this.drag)) window.removeEventListener(type, handler);
  for (const item of this.take()) if (item.url) URL.revokeObjectURL(item.url);
 }

 get count() {
  return this.items.length;
 }

 pick() {
  this.picker.click();
 }

 add(files) {
  const list = Array.from(files || []).slice(0, Math.max(0, MAX_ITEMS - this.items.length));
  if (!list.length) return;
  const added = [];
  for (const file of list) {
   const info = FileKinds.describe(file.name, file.type);
   const item = { file, name: file.name || 'image.png', size: file.size, info, image: info.glyph === 'image', url: '', note: '', payload: null };
   if (item.image) item.url = URL.createObjectURL(file);
   item.ready = AttachmentReader.read(file, info).then(payload => this.loaded(item, payload));
   item.el = this.chip(item);
   this.items.push(item);
   added.push(item.ready);
   this.row.append(item.el);
  }
  this.height.onResize(this.row.getBoundingClientRect().height);
  this.revealEnd();
  Promise.all(added).then(() => this.revealEnd());
  this.onChange();
 }

 revealEnd() {
  this.row.scrollTo({ left: this.row.scrollWidth, behavior: reducedMotion() ? 'auto' : 'smooth' });
 }

 loaded(item, payload) {
  item.payload = payload;
  if (payload.type === 'image') {
   item.width = payload.width;
   item.height = payload.height;
  } else if (item.image) {
   URL.revokeObjectURL(item.url);
   item.image = false;
   item.url = '';
   if (item.el.isConnected) {
    const chip = this.chip(item, false);
    item.el.replaceWith(chip);
    item.el = chip;
   }
  }
  if (item.el.isConnected) this.paintMeta(item);
  return payload;
 }

 chip(item, animate = true) {
  const el = element('div', `attachment ${item.image ? 'is-image' : 'is-file'}${animate && !reducedMotion() ? ' is-entering' : ''}`);
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', item.name);
  if (item.image) {
   const img = element('img', 'attachment-thumb');
   img.src = item.url;
   img.alt = '';
   img.draggable = false;
   el.append(img);
  } else {
   el.insertAdjacentHTML('beforeend', FileKinds.icon(item.info));
   const text = element('div', 'attachment-text');
   text.append(element('div', 'attachment-name', item.name), element('div', 'attachment-meta'));
   el.append(text);
  }
  const note = element('button', 'attachment-note');
  note.type = 'button';
  note.innerHTML = NOTE_ICON;
  note.addEventListener('click', () => this.openNote(item));
  const remove = element('button', 'attachment-remove');
  remove.type = 'button';
  remove.innerHTML = REMOVE_ICON;
  remove.setAttribute('aria-label', I18n.t('attach.remove', { name: item.name }));
  remove.addEventListener('click', e => this.remove(item, e.detail === 0));
  el.append(note, remove);
  el.addEventListener('animationend', () => el.classList.remove('is-entering'), { once: true });
  item.el = el;
  this.paintMeta(item);
  return el;
 }

 paintMeta(item) {
  const el = item.el, note = el.querySelector('.attachment-note'), meta = el.querySelector('.attachment-meta');
  el.classList.toggle('has-note', !!item.note);
  el.classList.toggle('is-unreadable', item.payload?.type === 'none');
  el.title = item.payload?.type === 'none' ? I18n.t('attach.unreadable') : item.note || '';
  note.setAttribute('aria-label', I18n.t(item.note ? 'note.edit' : 'note.add', { name: item.name }));
  if (!meta) return;
  meta.replaceChildren();
  if (item.note) {
   meta.insertAdjacentHTML('beforeend', NOTE_ICON);
   meta.append(element('span', 'attachment-note-text', item.note));
  } else {
   meta.textContent = `${item.info.name} · ${FileKinds.formatSize(item.size)}`;
   if (item.payload?.type === 'none') meta.append(element('span', 'attachment-flag', ` · ${I18n.t('attach.nameOnly')}`));
  }
 }

 remove(item, keyboard = false) {
  const at = this.items.indexOf(item);
  if (at < 0) return;
  this.items.splice(at, 1);
  if (this.editing === item) this.panel.hidePopover();
  if (item.url) URL.revokeObjectURL(item.url);
  const el = item.el;
  this.onChange();
  if (keyboard && this.items.length) this.items[Math.min(at, this.items.length - 1)].el.querySelector('.attachment-remove').focus({ preventScroll: true });
  else this.input.focus({ preventScroll: true });
  if (reducedMotion()) { el.remove(); return; }
  el.getAnimations().forEach(animation => animation.cancel());
  el.classList.remove('is-entering');
  el.style.pointerEvents = 'none';
  if (!this.items.length) {
   this.height.onResize(0);
   el.animate(LEAVE.frames, { ...LEAVE, fill: 'forwards' }).finished.then(() => el.remove());
   return;
  }
  const others = this.items.map(other => other.el), before = others.map(other => other.getBoundingClientRect().left);
  const from = el.getBoundingClientRect().left, left = el.offsetLeft, top = el.offsetTop, width = el.offsetWidth;
  Object.assign(el.style, { position: 'absolute', left: `${left}px`, top: `${top}px`, width: `${width}px`, zIndex: '0' });
  const drift = from - el.getBoundingClientRect().left;
  if (drift) el.style.left = `${left + drift}px`;
  others.forEach((other, k) => {
   const dx = before[k] - other.getBoundingClientRect().left;
   if (Math.abs(dx) > 0.5) other.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], GLIDE);
  });
  el.animate(LEAVE.frames, { ...LEAVE, fill: 'forwards' }).finished.then(() => el.remove());
 }

 take() {
  const items = this.items;
  if (this.editing) this.panel.hidePopover();
  this.items = [];
  this.row.replaceChildren();
  this.onChange();
  return items;
 }

 syncFade() {
  const row = this.row, over = row.scrollWidth - row.clientWidth;
  row.classList.toggle('fade-start', over > 1 && row.scrollLeft > 1);
  row.classList.toggle('fade-end', over > 1 && row.scrollLeft < over - 1);
 }

 onWheel(e) {
  const row = this.row;
  if (row.scrollWidth <= row.clientWidth || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
  e.preventDefault();
  row.scrollLeft += e.deltaY;
 }

 onPaste(e) {
  const files = Array.from(e.clipboardData?.files || []);
  if (!files.length || e.clipboardData.getData('text/plain')) return;
  e.preventDefault();
  this.add(files);
 }

 openNote(item) {
  if (this.closed.item === item && performance.now() - this.closed.at < REOPEN_GUARD) return;
  const panel = this.panel;
  if (this.editing) panel.hidePopover();
  for (const other of this.items) other.el.style.removeProperty('anchor-name');
  this.editing = item;
  this.cancelled = false;
  item.el.style.setProperty('anchor-name', '--attachment-note');
  this.noteTitle.textContent = item.name;
  this.noteThumb.replaceChildren();
  if (item.image) {
   const img = element('img', '');
   img.src = item.url;
   img.alt = '';
   this.noteThumb.append(img);
  } else {
   this.noteThumb.innerHTML = FileKinds.icon(item.info);
  }
  this.noteInput.value = item.note;
  item.el.classList.add('is-editing');
  if (!panel.matches(':popover-open')) panel.showPopover();
  this.noteInput.focus({ preventScroll: true });
  this.noteInput.setSelectionRange(item.note.length, item.note.length);
 }

 onNoteKey(e) {
  if (e.key === 'Escape') this.cancelled = true;
  else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
   e.preventDefault();
   this.panel.hidePopover();
  }
 }

 onNoteClosing() {
  const item = this.editing;
  if (!item) return;
  this.editing = null;
  this.closed = { item, at: performance.now() };
  item.el.classList.remove('is-editing');
  if (!this.cancelled && this.items.includes(item)) {
   item.note = this.noteInput.value.trim().replace(/\n{3,}/g, '\n\n');
   this.paintMeta(item);
   this.onChange();
  }
  setTimeout(() => { if (this.editing !== item) item.el.style.removeProperty('anchor-name'); }, 400);
 }

 restoreFocus() {
  const focus = document.activeElement;
  if (!focus || focus === document.body || this.panel.contains(focus) || this.tray.contains(focus)) this.input.focus({ preventScroll: true });
 }

 setDropping(on) {
  this.main.classList.toggle('is-dropping', on);
 }

 onDragEnter(e) {
  if (!hasFiles(e) || !this.isActive()) return;
  e.preventDefault();
  if (this.depth++ === 0) this.setDropping(true);
 }

 onDragOver(e) {
  if (!hasFiles(e) || !this.isActive()) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
 }

 onDragLeave(e) {
  if (!hasFiles(e) || !this.depth) return;
  if (--this.depth <= 0) {
   this.depth = 0;
   this.setDropping(false);
  }
 }

 onDrop(e) {
  if (!hasFiles(e) || !this.isActive()) return;
  e.preventDefault();
  this.depth = 0;
  this.setDropping(false);
  this.add(e.dataTransfer.files);
  this.input.focus({ preventScroll: true });
 }
}

window.Attachments = Attachments;
})();
