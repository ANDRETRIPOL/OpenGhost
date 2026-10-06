(() => {
'use strict';

// The notes a user keeps beside a chat: things to come back to, to add later, to keep in mind. They live with the chat
// (Chat's pad): the agent reads them in a note from the app and brings one up when its moment has come, and here the
// user writes, rewrites, ticks off and takes away their own.
//
// The notes come out in the manner of the effort's stage, from their button beside the sidebar's at the top of the chat.
// The button's glyph stays where it stood and «Notes» comes out of it in large type, with a line under it; below, a sheet
// grows out of the button: the field a new note is written in, and under it the notes, the latest first. Around it the
// app steps back softly, as around a selection.
const EASE = {
 motion: 'cubic-bezier(0.32, 0.72, 0, 1)',
 out: 'cubic-bezier(0.22, 1, 0.36, 1)',
 pop: 'cubic-bezier(0.34, 1.45, 0.64, 1)',
 // Room being given up: it starts gently and settles, where room being made starts at once.
 close: 'cubic-bezier(0.45, 0, 0.2, 1)',
};
const GROW = Dock.spring(0.56, 0.12);
// Opening: when the name's letters leave the glyph, when the line under it comes in, when the field shows, and when the
// notes come down (the ones nearest the field first, a step apart).
const OPEN = { title: 120, hint: 300, field: 170, rows: 150, rowStep: 42, rowFor: 460 };
const CLOSE = { body: 130, fold: 400, foldDelay: 50 };
// A note coming into the list makes its own room, and one leaving closes it; so does the list itself, with its first
// note and its last.
const ROW = { in: 400, out: 340 };
// How far the stage reaches past the button, to its left and over it.
const INSET = 6;
// The veil begins this far inside the stage's left edge, so it fades out before the sidebar's button, which stays sharp.
const SHY = 70;
// A pill of the notes in the chat, as it comes in: the chat makes room, the pill settles, its sign is drawn and has its
// moment (the pencil writes, or knocks), what it says is written out from the left, and a light runs round its edge.
const PILL = { room: 460, settle: 520, stroke: 360, strokeStep: 110, signAt: 120, moment: 560, wordsAt: 200, label: 320, words: 620, lightAt: 240, rim: 520 };
// The light: a bright head with a tail that thins out behind it, and its glow about the head. Each stroke by its length
// along the edge (px), all with their heads together. The light runs at `speed` px/ms, no shorter than `least` ms and no
// longer than `most`; no stroke is longer than `share` of the edge.
const LIGHT = { strokes: [['glow', 34], ['halo', 24], ['tail', 150], ['mid', 62], ['head', 18]], speed: 0.5, least: 1100, most: 1800, share: 0.42 };
const SVG = 'http://www.w3.org/2000/svg';

const TICK = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle class="tick-ring" cx="10" cy="10" r="7.25" stroke="currentColor" stroke-width="1.5"/><circle class="tick-fill" cx="10" cy="10" r="8"/><path class="tick-check" pathLength="1" d="M6.3 10.3l2.5 2.5 4.9-5.4" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CROSS = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>';
const ARROW = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 13V3.4M3.8 7.4 8 3.2l4.2 4.2"/></svg>';
const CHECK = '<svg class="glyph glyph-done" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path pathLength="1" d="M5.5 12.6l4.2 4.2 8.8-9.6"/></svg>';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const quiet = animation => animation.finished.catch(() => {});
const within = (rect, frame) => ({ left: rect.left - frame.left, top: rect.top - frame.top, right: rect.right - frame.left, bottom: rect.bottom - frame.top });
const element = (tag, className) => Object.assign(document.createElement(tag), { className });

class Notepad {
 constructor({ chat, thread, button }) {
  Object.assign(this, { chat, button });
  this.conv = null;
  this.state = 'closed';
  this.home = null;
  this.pose = 0;
  this.leaving = null;
  const root = this.root = element('div', 'notepad is-empty');
  root.setAttribute('popover', 'manual');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', I18n.t('notes.title'));
  root.innerHTML = `
   <div class="notepad-veil"></div>
   <div class="notepad-head">
    <button type="button" class="notepad-mark" aria-label="${escapeHtml(I18n.t('notes.close'))}"></button>
    <div class="notepad-word" aria-hidden="true"></div>
   </div>
   <p class="notepad-hint">${escapeHtml(I18n.t('notes.hint'))}</p>
   <div class="notepad-sheet">
    <div class="notepad-shell"></div>
    <div class="notepad-body">
     <form class="notepad-form" autocomplete="off">
      <textarea class="notepad-input" rows="1" spellcheck="true" placeholder="${escapeHtml(I18n.t('notes.placeholder'))}" aria-label="${escapeHtml(I18n.t('notes.new'))}"></textarea>
      <button type="submit" class="notepad-add" aria-label="${escapeHtml(I18n.t('notes.add'))}" disabled>${ARROW}</button>
     </form>
     <div class="notepad-pane">
      <div class="notepad-scroll"><ul class="notepad-list" role="list"></ul></div>
      <div class="scrollbar notepad-scrollbar" aria-hidden="true"><div class="scrollbar-thumb"></div></div>
     </div>
    </div>
   </div>`;
  document.body.append(root);
  const $ = selector => root.querySelector(selector);
  this.veil = $('.notepad-veil');
  this.patch = new StageVeil(this.veil);
  this.head = $('.notepad-head');
  this.words = new StageWord($('.notepad-word'));
  this.hint = $('.notepad-hint');
  this.sheet = $('.notepad-sheet');
  this.shell = $('.notepad-shell');
  this.pane = $('.notepad-pane');
  this.scroll = $('.notepad-scroll');
  this.list = $('.notepad-list');
  this.form = $('.notepad-form');
  this.mark = $('.notepad-mark');
  this.input = $('.notepad-input');
  this.add = $('.notepad-add');
  this.bar = new Scrollbar(this.scroll, $('.notepad-scrollbar'));
  this.bar.observe(this.list);
  this.scroll.addEventListener('scroll', () => this.edges(), { passive: true });
  new ResizeObserver(() => this.edges()).observe(this.list);

  button.addEventListener('notes-toggle', event => this.toggle(!!event.detail?.keyboard));
  this.mark.addEventListener('click', event => this.close({ focusButton: event.detail === 0 }));
  this.form.addEventListener('submit', event => {
   event.preventDefault();
   this.write();
  });
  this.input.addEventListener('input', () => this.syncForm());
  this.input.addEventListener('keydown', event => {
   if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
   event.preventDefault();
   this.write();
  });
  this.list.addEventListener('click', event => this.onClick(event));
  this.list.addEventListener('keydown', event => this.onTextKey(event));
  this.list.addEventListener('focusout', event => this.keep(event.target.closest?.('.notepad-text')));
  // Escape puts the notes away wherever the keyboard is, also after a press on a row has left it nowhere.
  document.addEventListener('keydown', event => {
   if (event.key !== 'Escape' || event.defaultPrevented || this.state !== 'open') return;
   event.preventDefault();
   this.close({ focusButton: true });
  });
  // The keyboard walking on past the stage puts it away.
  root.addEventListener('focusout', event => {
   if (this.state === 'open' && event.relatedTarget instanceof Node && !root.contains(event.relatedTarget)) this.close();
  });
  this.veil.addEventListener('pointerdown', event => {
   event.preventDefault();
   this.close();
  });
  // A press anywhere else puts the notes away; the button itself toggles them.
  document.addEventListener('pointerdown', event => {
   if (this.state !== 'open') return;
   const path = event.composedPath();
   if (!path.includes(root) && !path.includes(button)) this.close();
  }, true);
  window.addEventListener('resize', () => this.close({ instant: true }));
  // A pill of the notes in the chat opens them at its note.
  thread.addEventListener('click', event => {
   const pill = event.target.closest('.thread-note-pill')?.closest('.thread-note');
   if (pill && !pill.classList.contains('is-memory')) this.open({ show: pill.dataset.note });
  });
  // The veil keeps covering the stage as notes come and go.
  new ResizeObserver(() => { if (this.state === 'open') this.frost(); }).observe(this.sheet);
  requestIdleCallback(() => document.fonts?.load('560 34px "OpenGhost Display"').catch(() => {}));
 }

 // What the button shows for the chat on screen: it is there once the chat exists and is open, and says how many notes
 // still wait. It comes in softly the first time.
 sync() {
  const conv = this.chat.active, there = !!conv?.record && !conv.locked && !!conv.pad, button = this.button;
  if (there && button.hidden && !reducedMotion()) button.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'ease-out' });
  button.hidden = !there;
  button.setAttribute('count', there ? conv.pad.items.filter(note => !note.done).length : 0);
  if (this.state !== 'closed' && (this.conv !== conv || !there)) this.close({ instant: true });
 }

 // The notes changed, by the user's hand here or the agent's from the chat. The button gives its flourish when it is the
 // agent that brought a note up or wrote one down.
 onNotes(conv, { kind, note }) {
  if (conv === this.chat.active) {
   this.sync();
   if (kind === 'remind' || (kind === 'add' && note.by === 'agent')) this.button.ring();
  }
  if (this.state !== 'open' || conv !== this.conv) return;
  const row = this.rowOf(note.id);
  if (kind === 'add') this.enter(this.row(note));
  else if (kind === 'remove') this.leave(row);
  else if (row) this.paint(row, note);
 }

 toggle(keyboard = false) {
  if (this.state === 'open') this.close({ focusButton: keyboard });
  else this.open();
 }

 // show: the id of a note to bring into view and light up for a moment.
 open({ show = '' } = {}) {
  const conv = this.chat.active;
  if (!conv?.pad || conv.locked || this.button.hidden) return;
  if (this.state === 'closing') this.finish();
  if (this.state === 'open') { this.reveal(show); return; }
  this.conv = conv;
  this.state = 'open';
  this.home = this.button.getBoundingClientRect();
  this.pose = this.button.pose;
  // The latest note stands first, right under the field it was written in.
  this.list.replaceChildren(...conv.pad.items.map(note => this.row(note)).reverse());
  this.root.classList.toggle('is-empty', !conv.pad.items.length);
  this.input.value = '';
  this.syncForm();
  this.mark.replaceChildren(this.button.copy());
  this.root.showPopover();
  this.place();
  this.button.setAttribute('open', '');
  this.button.classList.add('is-away');
  this.scroll.scrollTop = 0;
  this.edges();
  this.input.focus({ preventScroll: true });
  const from = { x: this.home.left + this.home.width / 2, y: this.home.top + this.home.height / 2 };
  this.words.show(I18n.t('notes.title'), { from, delay: OPEN.title });
  this.frost(true);
  this.patch.bloom();
  if (!reducedMotion()) this.grow();
  this.reveal(show);
 }

 // The stage's own glyph lies exactly over the button's: the stage takes the button's measures for that, and its place.
 place() {
  const home = this.home, style = this.root.style, icon = getComputedStyle(this.button);
  style.left = `${Math.round(Math.max(INSET, Math.min(home.left - INSET, innerWidth - this.root.offsetWidth - INSET)))}px`;
  style.top = `${Math.round(home.top - INSET)}px`;
  style.setProperty('--notepad-room', `${Math.round(innerHeight - home.bottom)}px`);
  style.setProperty('--notepad-mark', `${home.width}px`);
  style.setProperty('--notepad-icon', icon.getPropertyValue('--icon-size').trim() || '22px');
  style.setProperty('--icon-opacity', icon.getPropertyValue('--icon-opacity').trim() || '0.55');
 }

 // The veil's patch covers the glyph and the name, the line under them and the sheet; it grows out of the button.
 frost(instant = false) {
  if (this.state === 'closed' || !this.root.matches(':popover-open')) return;
  const frame = this.root.getBoundingClientRect(), from = this.home;
  const local = el => {
   if (!el) return null;
   const box = within(el.getBoundingClientRect(), frame);
   return { ...box, left: Math.min(box.right, Math.max(box.left, SHY)) };
  };
  this.patch.fit([this.head, this.words.word, this.hint, this.sheet].map(local), { x: from.left + from.width / 2 - frame.left, y: from.top + from.height / 2 - frame.top }, instant);
 }

 // The sheet grows out of the button with a little give, and what it holds comes in as it grows: the notes nearest the
 // field first. Nothing inside a text field slides or blurs, so the field only fades in.
 grow() {
  const from = this.home, to = this.sheet.getBoundingClientRect();
  this.shell.animate([
   { left: `${from.left - to.left}px`, top: `${from.top - to.top}px`, width: `${from.width}px`, height: `${from.height}px`, opacity: 0 },
   { opacity: 1, offset: 0.12 },
   { left: '0px', top: '0px', width: `${to.width}px`, height: `${to.height}px`, opacity: 1 },
  ], GROW);
  const rows = [...this.list.children].slice(0, 14).map((row, k) => row.animate(
   [{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }],
   { duration: OPEN.rowFor, delay: OPEN.rows + k * OPEN.rowStep, easing: EASE.out, fill: 'backwards' },
  ));
  Promise.all(rows.map(quiet)).then(() => this.bar.update());
  for (const el of [this.input, this.add]) el.animate([{ opacity: 0 }, {}], { duration: 360, delay: OPEN.field, easing: EASE.out, fill: 'backwards' });
  this.hint.animate([{ opacity: 0, transform: 'translateY(-5px)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: OPEN.hint, easing: EASE.out, fill: 'backwards' });
 }

 // The note asked for comes into view and lights up for a moment.
 reveal(id) {
  const row = id && this.rowOf(id);
  if (!row) return;
  row.scrollIntoView({ block: 'nearest' });
  if (!reducedMotion()) row.animate([{ backgroundColor: 'rgba(var(--fg-rgb), 0)' }, { backgroundColor: 'rgba(var(--fg-rgb), 0.09)', offset: 0.25 }, { backgroundColor: 'rgba(var(--fg-rgb), 0)' }], { duration: 1500, delay: 420, easing: 'ease-out' });
 }

 // Everything goes back where it came from: the name melts away, what the sheet holds fades, the sheet folds into the
 // button. The stage's glyph stands until the very end, and then the button is there in its place, the same glyph.
 close({ instant = false, focusButton = false } = {}) {
  if (this.state !== 'open') return;
  // A note being rewritten is kept as it reads now.
  this.keep(document.activeElement?.closest?.('.notepad-text'));
  this.state = 'closing';
  this.button.removeAttribute('open');
  this.root.classList.add('is-closing');
  if (instant || reducedMotion()) { this.finish(focusButton); return; }
  this.words.fade();
  for (const el of [this.form, this.pane, this.hint]) {
   const from = getComputedStyle(el).opacity;
   for (const animation of el.getAnimations()) animation.cancel();
   el.animate([{ opacity: from }, { opacity: 0 }], { duration: CLOSE.body, easing: 'ease-in', fill: 'forwards' });
  }
  const from = this.sheet.getBoundingClientRect(), to = this.button.getBoundingClientRect();
  for (const animation of this.shell.getAnimations()) animation.cancel();
  const fold = this.leaving = this.shell.animate([
   { left: '0px', top: '0px', width: `${from.width}px`, height: `${from.height}px`, opacity: 1 },
   { opacity: 1, offset: 0.6 },
   { left: `${to.left - from.left}px`, top: `${to.top - from.top}px`, width: `${to.width}px`, height: `${to.height}px`, opacity: 0 },
  ], { duration: CLOSE.fold, delay: CLOSE.foldDelay, easing: EASE.motion, fill: 'forwards' });
  Promise.all([quiet(fold), quiet(this.patch.lift(Dock.lift))]).then(() => {
   if (this.leaving === fold) this.finish(focusButton);
  });
 }

 finish(focusButton = false) {
  this.state = 'closed';
  this.leaving = null;
  // The button is back before the stage goes, its pencil where the stage's stood, so the glyph never leaves the eye.
  this.button.pose = this.pose;
  this.button.classList.remove('is-away');
  for (const animation of this.root.getAnimations({ subtree: true })) animation.cancel();
  if (this.root.matches(':popover-open')) this.root.hidePopover();
  this.words.clear();
  this.list.replaceChildren();
  this.root.classList.remove('is-closing');
  this.conv = null;
  if (focusButton) this.button.focus({ preventScroll: true });
 }

 // Where the list runs on past its edge, it fades out there instead of being cut.
 edges() {
  const { scrollTop, scrollHeight, clientHeight } = this.scroll;
  this.scroll.classList.toggle('is-cut-top', scrollTop > 1);
  this.scroll.classList.toggle('is-cut-bottom', scrollHeight - scrollTop - clientHeight > 1);
 }

 rowOf(id) {
  return [...this.list.children].find(row => row.dataset.id === id) || null;
 }

 row(note) {
  const row = element('li', 'notepad-item');
  row.dataset.id = note.id;
  row.innerHTML = `<button type="button" class="notepad-tick" role="checkbox">${TICK}</button>`
   + '<div class="notepad-text" contenteditable="plaintext-only" role="textbox" aria-multiline="true" spellcheck="false"></div>'
   + `<span class="notepad-by" title="${escapeHtml(I18n.t('notes.agent'))}">${Glyphs.ghost}</span>`
   + `<button type="button" class="notepad-remove" aria-label="${escapeHtml(I18n.t('notes.remove'))}" title="${escapeHtml(I18n.t('notes.remove'))}">${CROSS}</button>`;
  row.querySelector('.notepad-text').setAttribute('aria-label', I18n.t('notes.edit'));
  this.paint(row, note);
  return row;
 }

 // A row as its note stands: ticked off, brought up by the agent and waiting for a word, written down by the agent.
 paint(row, note) {
  const text = row.querySelector('.notepad-text'), tick = row.querySelector('.notepad-tick'), waits = !!note.reminded && !note.done;
  row.classList.toggle('is-done', note.done);
  row.classList.toggle('is-reminded', waits);
  row.classList.toggle('is-agent', note.by === 'agent');
  if (document.activeElement !== text && text.textContent !== note.text) text.textContent = note.text;
  tick.setAttribute('aria-checked', String(note.done));
  tick.setAttribute('aria-label', I18n.t(note.done ? 'notes.undone' : 'notes.done'));
  tick.title = waits ? I18n.t('notes.reminded') : '';
 }

 // The list itself comes and goes with its first note and its last: its room opens or closes in one move, the line over
 // it and its padding included, so the sheet never jumps by what is left of them.
 room(open) {
  const pane = this.pane, done = () => { pane.style.overflow = ''; this.bar.update(); this.edges(); };
  for (const animation of pane.getAnimations()) animation.cancel();
  pane.style.overflow = 'clip';
  const height = `${pane.offsetHeight}px`, frames = [{ height: '0px', opacity: 0 }, { height, opacity: 1 }];
  return pane.animate(open ? frames : frames.reverse(), { duration: open ? ROW.in : ROW.out, easing: open ? EASE.motion : EASE.close, fill: open ? 'none' : 'forwards' }).finished.then(done, done);
 }

 // A new note comes in at the top of the list, under the field, and makes its own room there.
 enter(row) {
  const first = this.root.classList.contains('is-empty');
  this.list.prepend(row);
  this.root.classList.remove('is-empty');
  this.scroll.scrollTop = 0;
  if (reducedMotion()) return;
  const text = row.querySelector('.notepad-text');
  text.animate([{ transform: 'translateY(-10px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: ROW.in + 60, easing: EASE.out });
  row.querySelector('.notepad-tick').animate([{ transform: 'scale(0.4)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: ROW.in + 120, easing: EASE.pop });
  if (first) { this.room(true); return; }
  const done = () => { row.style.overflow = ''; this.bar.update(); };
  row.style.overflow = 'clip';
  row.animate([{ height: '0px' }, { height: `${row.offsetHeight}px` }], { duration: ROW.in, easing: EASE.motion }).finished.then(done, done);
 }

 leave(row) {
  if (!row) return;
  const last = this.list.children.length === 1;
  const gone = () => {
   row.remove();
   if (last) {
    this.root.classList.add('is-empty');
    for (const animation of this.pane.getAnimations()) animation.cancel();
   }
   this.bar.update();
  };
  // The keyboard does not stay on a row that is going.
  if (row.contains(document.activeElement)) this.input.focus({ preventScroll: true });
  if (reducedMotion()) { gone(); return; }
  row.style.pointerEvents = 'none';
  if (last) { this.room(false).then(gone); return; }
  row.style.overflow = 'clip';
  row.animate([{ height: `${row.offsetHeight}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: ROW.out, easing: EASE.close, fill: 'forwards' }).finished.then(gone, gone);
 }

 write() {
  if (!this.conv || !this.input.value.trim()) return;
  this.chat.addNote(this.conv, this.input.value);
  this.input.value = '';
  this.syncForm();
 }

 syncForm() {
  this.add.disabled = !this.input.value.trim();
 }

 onClick(event) {
  const row = event.target.closest('.notepad-item'), note = row && this.conv?.pad.items.find(item => item.id === row.dataset.id);
  if (!note) return;
  if (event.target.closest('.notepad-tick')) this.chat.checkNote(this.conv, note.id, !note.done);
  else if (event.target.closest('.notepad-remove')) this.chat.removeNote(this.conv, note.id);
 }

 // A note is rewritten where it stands: Enter keeps the new words, Escape the old ones, and leaving it keeps them too.
 onTextKey(event) {
  const text = event.target.closest?.('.notepad-text');
  if (!text) return;
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
   event.preventDefault();
   this.keep(text);
   this.input.focus({ preventScroll: true });
  } else if (event.key === 'Escape') {
   event.preventDefault();
   event.stopPropagation();
   const note = this.conv?.pad.items.find(item => item.id === text.closest('.notepad-item').dataset.id);
   if (note) text.textContent = note.text;
   this.input.focus({ preventScroll: true });
  }
 }

 // A note is kept as it reads now; rewritten to nothing, it is gone. The row then shows the note as it is kept, trimmed.
 keep(text) {
  const row = text?.closest('.notepad-item');
  if (!row || !this.conv) return;
  this.chat.editNote(this.conv, row.dataset.id, text.innerText);
  const note = this.conv.pad.items.find(item => item.id === row.dataset.id);
  if (note && text.textContent !== note.text) text.textContent = note.text;
 }
}

// What the agent did with the notes, as a small pill in the chat, in the manner of a link's chip: the notes' own sign,
// what happened («Noted» for a note it wrote down when asked to, «Reminder» for one it brought up) and the note in the
// user's own words, on one line. It stands with the agent's words and is as quiet as they are; what marks its coming is
// a thin light the colour of ice that runs once round its edge. A press on it opens the notes at its note.
const KINDS = {
 reminder: { name: 'remind', label: 'notes.reminder' },
 noted: { name: 'add', label: 'notes.noted' },
};
// The pencil's moment: writing a note down it runs along a line and back; bringing one up it knocks on the sheet twice.
const MOMENT = {
 add: { duration: 900, frames: [{ transform: 'none' }, { transform: 'translate(1px, 1px) rotate(-9deg)', offset: 0.22 }, { transform: 'translate(6px, 0) rotate(-5deg)', offset: 0.55 }, { transform: 'translate(2px, 1px) rotate(-8deg)', offset: 0.78 }, { transform: 'none' }] },
 remind: { duration: 820, frames: [{ transform: 'none' }, { transform: 'rotate(-15deg)', offset: 0.2 }, { transform: 'none', offset: 0.4 }, { transform: 'rotate(-10deg)', offset: 0.6 }, { transform: 'none', offset: 0.8 }, { transform: 'none' }] },
};

const NotePill = {
 build(entry) {
  const kind = KINDS[entry.role] || KINDS.reminder;
  const el = element('div', `thread-note is-${kind.name}`);
  el.dataset.note = entry.note || '';
  el.__entry = entry;
  const pill = element('button', 'thread-note-pill');
  pill.type = 'button';
  pill.innerHTML = `<span class="thread-note-sign" aria-hidden="true">${Glyphs.notes}${CHECK}</span><span class="thread-note-label"></span><span class="thread-note-text"></span>`;
  const text = pill.querySelector('.thread-note-text');
  text.textContent = entry.text || '';
  // A note too long for the pill is told in full under the pointer.
  pill.addEventListener('pointerenter', () => { pill.title = text.scrollWidth > text.clientWidth ? text.textContent : ''; });
  el.append(pill);
  NotePill.mark(el, false);
  return el;
 },

 // Whether the note of a reminder has been ticked off since: the sign gives way to a tick and the pill grows quiet.
 mark(el, done) {
  const kind = KINDS[el.__entry?.role] || KINDS.reminder, was = el.classList.contains('is-done');
  el.classList.toggle('is-done', done);
  const label = I18n.t(done ? 'notes.reminder.done' : kind.label);
  el.querySelector('.thread-note-label').textContent = label;
  el.querySelector('.thread-note-pill').setAttribute('aria-label', `${label}: ${el.__entry?.text || ''}`);
  if (done && !was && el.isConnected && !reducedMotion()) {
   el.querySelector('.glyph-done path').animate([{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: 420, delay: 120, easing: EASE.motion, fill: 'backwards' });
  }
 },

 // Just come into the chat: the chat makes room for the pill, the pill settles into it from the left, its sign is drawn
 // and the pencil has its moment, what the pill says is written out from the left, and the light runs round its edge.
 enter(el) {
  if (reducedMotion() || !el.isConnected) return;
  const pill = el.querySelector('.thread-note-pill'), sign = el.querySelector('.thread-note-sign'), kind = el.classList.contains('is-add') ? 'add' : 'remind';
  const height = el.offsetHeight, gap = el.previousElementSibling || el.nextElementSibling ? parseFloat(getComputedStyle(el.parentElement).rowGap) || 0 : 0;
  const free = () => { el.style.overflow = ''; };
  el.style.overflow = 'clip';
  el.animate([{ height: '0px', marginTop: `${-gap}px` }, { height: `${height}px`, marginTop: '0px' }], { duration: PILL.room, easing: EASE.motion }).finished.then(free, free);
  pill.animate([{ opacity: 0, transform: 'scale(0.9)' }, { opacity: 1, offset: 0.45 }, { opacity: 1, transform: 'none' }], { duration: PILL.settle, easing: EASE.pop });
  const strokes = [...sign.querySelectorAll('.glyph-notes path')];
  strokes.forEach((path, k) => path.animate([{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: PILL.stroke, delay: PILL.signAt + k * PILL.strokeStep, easing: EASE.motion, fill: 'backwards' }));
  const moment = MOMENT[kind];
  sign.querySelector('.notes-pen').animate(moment.frames, { duration: moment.duration, delay: PILL.signAt + PILL.moment, easing: 'ease-in-out' });
  // Nothing of a letter is cut above or below the line while it is written out.
  const shut = 'inset(-6px 100% -6px 0)', open = 'inset(-6px -2px -6px 0)';
  el.querySelector('.thread-note-label').animate([{ clipPath: shut, opacity: 0 }, { opacity: 1, offset: 0.4 }, { clipPath: open, opacity: 1 }], { duration: PILL.label, delay: PILL.wordsAt, easing: EASE.out, fill: 'backwards' });
  el.querySelector('.thread-note-text').animate([{ clipPath: shut, opacity: 0 }, { opacity: 1, offset: 0.3 }, { clipPath: open, opacity: 1 }], { duration: PILL.words, delay: PILL.wordsAt + PILL.label * 0.6, easing: EASE.out, fill: 'backwards' });
  NotePill.light(pill);
 },

 // The light the colour of ice: it leaves the pill's upper left corner, runs once round the edge and is gone where it
 // began. It is a few strokes laid along the edge, their heads together; behind it the edge keeps a breath of its colour
 // for a moment.
 light(pill) {
  const width = pill.offsetWidth, height = pill.offsetHeight, radius = Math.max(0, (parseFloat(getComputedStyle(pill).borderTopLeftRadius) || 0) - 0.5);
  if (width < 4 || height < 4) return;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'thread-note-light');
  svg.setAttribute('aria-hidden', 'true');
  const rects = LIGHT.strokes.map(([name]) => {
   const rect = document.createElementNS(SVG, 'rect');
   for (const [key, value] of Object.entries({ class: `is-${name}`, x: 0.5, y: 0.5, width: width - 1, height: height - 1, rx: radius, pathLength: 1 })) rect.setAttribute(key, value);
   svg.append(rect);
   return rect;
  });
  pill.append(svg);
  // Lengths are shares of the edge, as the strokes count it: the whole way round is 1.
  const edge = rects[0].getTotalLength() || 2 * (width + height);
  const lengths = LIGHT.strokes.map(([, length]) => Math.min(LIGHT.share, length / edge)), reach = Math.max(...lengths);
  const duration = Math.min(LIGHT.most, Math.max(LIGHT.least, edge * (1 + reach) / LIGHT.speed));
  const run = { duration, delay: PILL.lightAt, easing: 'cubic-bezier(0.42, 0, 0.3, 1)', fill: 'both' };
  rects.forEach((rect, k) => {
   const length = lengths[k];
   rect.style.strokeDasharray = `${length} 3`;
   // The head goes from just before the corner to a full round on, and as far again as the longest stroke, so the last
   // of the tail is gone too. A stroke `length` long with its head at h is drawn from h - length on.
   rect.animate({ strokeDashoffset: [length + 0.01, length - 1 - reach - 0.01] }, run);
  });
  const done = () => svg.remove();
  svg.animate([{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.84 }, { opacity: 0 }], { ...run, easing: 'linear' }).finished.then(done, done);
  pill.animate([{ boxShadow: 'inset 0 0 0 1px rgba(var(--ice-glow-rgb), 0)' }, { boxShadow: 'inset 0 0 0 1px rgba(var(--ice-glow-rgb), 0.3)', offset: 0.42 }, { boxShadow: 'inset 0 0 0 1px rgba(var(--ice-glow-rgb), 0)' }], { duration: duration + PILL.rim, delay: PILL.lightAt, easing: 'ease-in-out' });
 },
};

window.Notepad = Notepad;
window.NotePill = NotePill;
})();
