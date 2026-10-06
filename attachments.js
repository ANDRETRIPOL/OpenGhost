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
// Lines of text beside a text cursor: the card goes back to being text you can edit.
const UNPASTE_ICON = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 3.5h4.5M1.5 6.5h3M1.5 9.5h4"/><path d="M9 3v6.5M7.9 3h2.2M7.9 9.5h2.2"/></svg>';
// A pasted text this long comes in as a card, like a file, rather than filling the message.
const PASTE = { lines: 50, chars: 3000 };
const PASTED = 'Pasted text.txt';
// Videos the built-in decoder reads come in as a photo's card with a frame of them; others are a file's card from the start.
const FRAMED = new Set(['mp4', 'm4v', 'mov', 'webm', 'mkv']);

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const hasFiles = e => Array.from(e.dataTransfer?.types || []).includes('Files');
const lineCount = text => { let n = 1; for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) n++; return n; };
// The model sees only the name of a file it can't read, and of a video with no place on the disk to watch it from.
// A file the model gets nothing of but its name. A PDF with no text whose pages go as pictures is not one.
const blind = payload => (payload?.type === 'none' && !payload.pictures?.length) || (payload?.type === 'video' && !payload.path);
const pagesLabel = count => count ? I18n.t(count === 1 ? 'attach.page' : 'attach.pages', { n: count }) : '';

// What a pasted text's card says under its first line: how many lines, or for a single long one, its size.
function pastedLabel(pasted, size) {
 return pasted.lines > 1 ? I18n.t('attach.pastedLines', { n: pasted.lines.toLocaleString(I18n.lang) }) : I18n.t('attach.pastedSize', { size: FileKinds.formatSize(size) });
}

function element(tag, className, text) {
 const el = document.createElement(tag);
 el.className = className;
 if (text !== undefined) el.textContent = text;
 return el;
}

function thumb(url) {
 const img = element('img', 'attachment-thumb');
 img.src = url;
 img.alt = '';
 img.draggable = false;
 return img;
}

const duration = item => item.duration ? FileKinds.formatDuration(item.duration) : '';

class Attachments {
 constructor({ tray, picker, panel, main, zone, input, onChange, onText, isActive = () => true }) {
  this.isActive = isActive;
  this.onText = onText;
  this.plainPaste = false;
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
  // Ahead of the text's own paste handling, so a long text becomes a card before anything turns its links into chips.
  input.addEventListener('paste', e => this.onPaste(e), true);
  input.addEventListener('keydown', e => { this.plainPaste = e.code === 'KeyV' && e.shiftKey && (e.ctrlKey || e.metaKey); });
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

 // The system's file window: for photos and videos it offers only those.
 pick(kind = 'files') {
  this.picker.accept = kind === 'photos' ? 'image/*,video/*' : '';
  this.picker.click();
 }

 add(files, extra = {}) {
  const list = Array.from(files || []).slice(0, Math.max(0, MAX_ITEMS - this.items.length));
  if (!list.length) return;
  const added = [];
  for (const file of list) {
   const info = FileKinds.describe(file.name, file.type);
   const item = { file, name: file.name || 'image.png', size: file.size, info, image: info.glyph === 'image', video: info.glyph === 'video' && FRAMED.has(info.ext), url: '', note: '', payload: null, ...extra };
   if (item.image) item.url = URL.createObjectURL(file);
   item.ready = AttachmentReader.read(file, info, { video: true, pictures: true }).then(payload => this.loaded(item, payload));
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
  } else if (payload.type === 'video') {
   Object.assign(item, { width: payload.width, height: payload.height, duration: payload.duration, url: payload.poster });
   // A video that turns out to have no frame to show becomes a file's card, and one that has, a photo's.
   if (item.video !== !!payload.poster) {
    item.video = !!payload.poster;
    this.rechip(item);
   } else if (item.video && item.el.isConnected) {
    this.paintFrame(item);
   }
  } else if (item.image) {
   URL.revokeObjectURL(item.url);
   item.image = false;
   item.url = '';
   this.rechip(item);
  }
  if (item.el.isConnected) this.paintMeta(item);
  return payload;
 }

 // The card takes its new shape in place; `chip` points the item at the new card, so the old one is held first.
 rechip(item) {
  const old = item.el;
  if (old.isConnected) old.replaceWith(this.chip(item, false));
 }

 // A video's card shows its frame once it is taken, with the video's length over it.
 paintFrame(item) {
  const el = item.el;
  if (!el.querySelector('.attachment-thumb')) el.prepend(thumb(item.url));
  el.querySelector('.attachment-duration').textContent = duration(item);
 }

 chip(item, animate = true) {
  const el = element('div', `attachment ${item.image || item.video ? 'is-image' : 'is-file'}${item.video ? ' is-video' : ''}${item.pasted ? ' is-pasted' : ''}${animate && !reducedMotion() ? ' is-entering' : ''}`);
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', item.name);
  if (item.image || item.video) {
   if (item.url) el.append(thumb(item.url));
   if (item.video) el.append(element('span', 'attachment-duration', duration(item)));
  } else {
   el.insertAdjacentHTML('beforeend', FileKinds.icon(item.info));
   // Pasted text shows its first line, and the whole card is a button that puts the text back into the message.
   const text = element(item.pasted ? 'button' : 'div', 'attachment-text');
   text.append(element('div', 'attachment-name', item.pasted?.preview || item.name), element('div', 'attachment-meta'));
   el.append(text);
   if (item.pasted) {
    text.type = 'button';
    text.setAttribute('aria-label', `${I18n.t('attach.unpaste')}: ${item.pasted.preview}`);
    el.addEventListener('click', e => { if (!e.target.closest('.attachment-note, .attachment-remove')) this.unpaste(item); });
   }
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
  el.classList.toggle('is-unreadable', blind(item.payload));
  el.title = blind(item.payload) ? I18n.t('attach.unreadable') : item.note || '';
  note.setAttribute('aria-label', I18n.t(item.note ? 'note.edit' : 'note.add', { name: item.name }));
  if (!meta) return;
  meta.replaceChildren();
  // A pasted text's line swaps, under the pointer, for what a click does.
  const line = item.pasted ? element('span', 'attachment-meta-line') : meta;
  if (item.note) {
   line.insertAdjacentHTML('beforeend', NOTE_ICON);
   line.append(element('span', 'attachment-note-text', item.note));
  } else if (item.pasted) {
   line.textContent = pastedLabel(item.pasted, item.size);
  } else {
   meta.textContent = [item.info.name, pagesLabel(item.payload?.pages || 0), duration(item), FileKinds.formatSize(item.size)].filter(Boolean).join(' · ');
   if (blind(item.payload)) meta.append(element('span', 'attachment-flag', ` · ${I18n.t('attach.nameOnly')}`));
  }
  if (!item.pasted) return;
  const hint = element('span', 'attachment-unpaste');
  hint.innerHTML = UNPASTE_ICON;
  hint.append(I18n.t('attach.unpaste'));
  meta.append(line, hint);
 }

 // A long pasted text comes in as a card of its own, with its first line and how long it is.
 addText(text, note = '') {
  const clean = text.replace(/\r\n?/g, '\n');
  const preview = (clean.split('\n', 20).find(line => line.trim()) || clean).trim().replace(/\s+/g, ' ').slice(0, 160);
  this.add([new File([clean], PASTED, { type: 'text/plain' })], { pasted: { text: clean, lines: lineCount(clean), preview }, note });
 }

 // The text goes back into the message where the caret is, and the card leaves the way a removed one does;
 // Ctrl+Z right after brings the card back, note and all.
 unpaste(item) {
  const { text } = item.pasted, note = item.note;
  this.remove(item);
  this.onText?.(text, () => this.addText(text, note));
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

 // The files of a message taken back to be rewritten return to the tray, ahead of what was added since.
 give(items) {
  const back = items.filter(item => !this.items.includes(item));
  if (!back.length) return;
  for (const item of back) this.chip(item);
  this.items.unshift(...back);
  this.row.prepend(...back.map(item => item.el));
  this.height.onResize(this.row.getBoundingClientRect().height);
  this.onChange();
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

 // Files paste in as cards; so does a long text, unless it came with Ctrl+Shift+V, which puts it in as it is.
 onPaste(e) {
  const plain = this.plainPaste;
  this.plainPaste = false;
  const files = Array.from(e.clipboardData?.files || []), text = e.clipboardData?.getData('text/plain') || '';
  if (files.length && !text) {
   e.preventDefault();
   this.add(files);
  } else if (text && !plain && this.onText && this.items.length < MAX_ITEMS && (text.length > PASTE.chars || lineCount(text) > PASTE.lines)) {
   e.preventDefault();
   this.addText(text);
  }
 }

 openNote(item) {
  if (this.closed.item === item && performance.now() - this.closed.at < REOPEN_GUARD) return;
  const panel = this.panel;
  if (this.editing) panel.hidePopover();
  for (const other of this.items) other.el.style.removeProperty('anchor-name');
  this.editing = item;
  this.cancelled = false;
  item.el.style.setProperty('anchor-name', '--attachment-note');
  this.noteTitle.textContent = item.pasted?.preview || item.name;
  this.noteThumb.replaceChildren();
  if ((item.image || item.video) && item.url) {
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
  if (!hasFiles(e) || !this.isActive(e)) return;
  e.preventDefault();
  if (this.depth++ === 0) this.setDropping(true);
 }

 onDragOver(e) {
  if (!hasFiles(e) || !this.isActive(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
 }

 onDragLeave(e) {
  if (!hasFiles(e) || !this.depth || !this.isActive(e)) return;
  if (--this.depth <= 0) {
   this.depth = 0;
   this.setDropping(false);
  }
 }

 onDrop(e) {
  if (!hasFiles(e) || !this.isActive(e)) return;
  e.preventDefault();
  this.depth = 0;
  this.setDropping(false);
  this.add(e.dataTransfer.files);
  this.input.focus({ preventScroll: true });
 }
}

Attachments.pastedLabel = pastedLabel;
Attachments.pagesLabel = pagesLabel;
window.Attachments = Attachments;
})();
