(() => {
'use strict';

// What OpenGhost remembers about the user from all chats: one memory, a short record for each thing. The agent of any chat
// reads it (it comes in a note from the app, see `notes` in chat.js) and keeps it with its memory tool; the user reads
// and edits it in Settings → Memory, and can switch it off or empty it there.
// It stays one whole in two ways. The agent is told to change the record a new thing belongs to rather than write a
// second one; and once the memory has grown crowded, the app has a model write it anew, shorter (see `tidy`).
const KEY = 'memory';
const SAVE_DELAY = 400;
const LIMITS = { text: 400, records: 60, crowded: 28, chars: 3600 };
const TIDY = {
 prompt: 'You keep an AI assistant\'s memory of one user in order. Below are its records, the oldest first, a line each. Write the memory anew as one whole: put records about the same thing together into one, drop what is said twice, and where two disagree keep only what the later one says, with no word of the earlier. Lose no fact that is said once. Every record stays one or two plain sentences about the user, in the language it is written in. Answer with a JSON array of strings and nothing else.',
 tokens: 3000,
};

const clean = text => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.text);

class Memory {
 constructor(store) {
  this.store = store;
  this.on = true;
  this.items = [];
  this.next = 1;
  this.listeners = new Set();
  this.timer = 0;
  this.tidying = null;
  this.ready = this.load();
 }

 async load() {
  const saved = await this.store.read(KEY).catch(() => null);
  this.on = saved?.on !== false;
  this.items = (Array.isArray(saved?.items) ? saved.items : []).filter(item => item?.id && typeof item.text === 'string' && item.text.trim()).slice(0, LIMITS.records);
  this.next = Math.max(Number(saved?.next) || 1, ...this.items.map(item => Number(String(item.id).slice(1)) + 1 || 1));
  this.emit();
 }

 get limits() {
  return LIMITS;
 }

 onChange(listener) {
  this.listeners.add(listener);
  return () => this.listeners.delete(listener);
 }

 emit(change = null) {
  for (const listener of this.listeners) listener(change);
 }

 save(now = false) {
  clearTimeout(this.timer);
  this.timer = 0;
  const write = () => this.store.write(KEY, { version: 1, on: this.on, next: this.next, items: this.items }).catch(() => {});
  if (now) write();
  else this.timer = setTimeout(write, SAVE_DELAY);
 }

 flush() {
  if (this.timer) this.save(true);
 }

 changed(change) {
  this.save();
  this.emit(change);
 }

 setOn(on) {
  if (this.on === !!on) return;
  this.on = !!on;
  this.changed({ kind: 'on' });
 }

 find(id) {
  return this.items.find(item => item.id === id) || null;
 }

 get full() {
  return this.items.length >= LIMITS.records;
 }

 // `by`: 'agent' or 'user'.
 add(text, by = 'user') {
  const value = clean(text);
  if (!value || this.full) return null;
  const item = { id: `m${this.next++}`, text: value, at: Date.now(), by };
  this.items.push(item);
  this.changed({ kind: 'add', item });
  return item;
 }

 update(id, text, by = 'user') {
  const item = this.find(id), value = clean(text);
  if (!item || !value) return null;
  if (value === item.text) return item;
  Object.assign(item, { text: value, at: Date.now(), by });
  this.changed({ kind: 'update', item });
  return item;
 }

 remove(id) {
  const at = this.items.findIndex(item => item.id === id);
  if (at < 0) return null;
  const [item] = this.items.splice(at, 1);
  this.changed({ kind: 'remove', item });
  return item;
 }

 clear() {
  if (!this.items.length) return;
  this.items = [];
  this.changed({ kind: 'clear' });
 }

 // The memory as the agent reads it: a line for each record, with its id.
 lines() {
  return this.items.map(item => `- [${item.id}] ${item.text}`).join('\n');
 }

 // Grown past what reads as one whole: time to have it written anew.
 get crowded() {
  return this.on && !this.tidying && (this.items.length > LIMITS.crowded || this.items.reduce((sum, item) => sum + item.text.length, 0) > LIMITS.chars);
 }

 // The memory written anew by a model, as one whole. `complete` sends messages to a model and gives its answer. What
 // comes back replaces the records it was made from only when it is a shorter list of plain records; records added or
 // changed meanwhile, by the user or another chat, stay as they are.
 tidy(complete) {
  if (this.tidying || this.items.length < 2) return this.tidying || Promise.resolve(false);
  const before = this.items.map(item => ({ ...item }));
  const task = (async () => {
   let answer = '';
   try {
    answer = await complete([{ role: 'system', content: TIDY.prompt }, { role: 'user', content: before.map(item => `- ${item.text}`).join('\n') }], TIDY.tokens);
   } catch {
    return false;
   }
   let list = null;
   try { list = JSON.parse(String(answer).slice(String(answer).indexOf('['), String(answer).lastIndexOf(']') + 1)); } catch {}
   const records = Array.isArray(list) ? list.filter(text => typeof text === 'string').map(clean).filter(Boolean) : [];
   if (!records.length || records.length >= before.length) return false;
   const same = item => before.some(old => old.id === item.id && old.text === item.text);
   if (!this.on || before.some(old => !this.find(old.id))) return false;
   const later = this.items.filter(item => !same(item)), at = Date.now();
   this.items = [...records.map(text => ({ id: `m${this.next++}`, text, at, by: 'agent' })), ...later].slice(0, LIMITS.records);
   this.changed({ kind: 'tidy' });
   return true;
  })();
  this.tidying = task.finally(() => { this.tidying = null; });
  return this.tidying;
 }
}

// That the agent changed the memory, as a small pill in the chat, in the manner of the notes' pill: a sign and two words,
// «Memory updated». One pill for a reply, however many records went in or out while it was written; what they were is
// in the settings, which a press on the pill opens, and under the pointer.
const SIGN = '<svg class="glyph glyph-memory" viewBox="30 30 60 60" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="memory-leaf" pathLength="1" d="M43 39h34v43l-17-12.5L43 82z"/><path class="memory-mark" pathLength="1" d="M53 52h14"/></svg>';
const PILL = { room: 360, settle: 520, stroke: 460, signAt: 140, strokeStep: 240, moment: 560, wordsAt: 220, words: 520 };
// The sign's moment, once it is drawn: the leaf dips as if a page were slipped under its ribbon, and comes back.
const MOMENT = { duration: 760, frames: [{ transform: 'none' }, { transform: 'translateY(2.5px) scaleY(0.94)', offset: 0.3 }, { transform: 'translateY(-1px)', offset: 0.62 }, { transform: 'none' }] };
const EASE = { motion: 'cubic-bezier(0.32, 0.72, 0, 1)', pop: 'cubic-bezier(0.34, 1.45, 0.64, 1)', out: 'cubic-bezier(0.22, 1, 0.36, 1)' };
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const MemoryPill = {
 build(entry) {
  const el = document.createElement('div');
  el.className = 'thread-note is-memory';
  el.innerHTML = `<button type="button" class="thread-note-pill"><span class="thread-note-sign" aria-hidden="true">${SIGN}</span><span class="thread-note-text"></span></button>`;
  const pill = el.firstChild;
  pill.querySelector('.thread-note-text').textContent = I18n.t('memory.pill');
  pill.addEventListener('click', () => MemoryPill.onOpen?.());
  MemoryPill.paint(el, entry);
  return el;
 },

 // What went into the memory is told under the pointer.
 paint(el, entry) {
  el.firstChild.title = entry.text || '';
 },

 // Just come into the chat: the chat makes room, the pill settles in from the left, its sign is drawn and has its
 // moment, the words are written out from the left, and the light the colour of ice runs once round its edge.
 enter(el) {
  if (reducedMotion() || !el.isConnected) return;
  const pill = el.firstChild, sign = pill.querySelector('.glyph-memory'), height = el.offsetHeight;
  const gap = el.previousElementSibling || el.nextElementSibling ? parseFloat(getComputedStyle(el.parentElement).rowGap) || 0 : 0;
  const free = () => { el.style.overflow = ''; };
  el.style.overflow = 'clip';
  el.animate([{ height: '0px', marginTop: `${-gap}px` }, { height: `${height}px`, marginTop: '0px' }], { duration: PILL.room, easing: EASE.motion }).finished.then(free, free);
  pill.animate([{ opacity: 0, transform: 'scale(0.9)' }, { opacity: 1, offset: 0.45 }, { opacity: 1, transform: 'none' }], { duration: PILL.settle, easing: EASE.pop });
  [...sign.querySelectorAll('path')].forEach((path, k) => path.animate([{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: PILL.stroke, delay: PILL.signAt + k * PILL.strokeStep, easing: EASE.motion, fill: 'backwards' }));
  sign.animate(MOMENT.frames, { duration: MOMENT.duration, delay: PILL.signAt + PILL.moment, easing: 'ease-in-out' });
  const shut = 'inset(-6px 100% -6px 0)', open = 'inset(-6px -2px -6px 0)';
  pill.querySelector('.thread-note-text').animate([{ clipPath: shut, opacity: 0 }, { opacity: 1, offset: 0.35 }, { clipPath: open, opacity: 1 }], { duration: PILL.words, delay: PILL.wordsAt, easing: EASE.out, fill: 'backwards' });
  window.NotePill?.light(pill);
 },

 // The pill of a reply takes in what the agent remembered after it was shown: the sign has its moment again and the
 // light runs once more.
 update(el, entry) {
  MemoryPill.paint(el, entry);
  if (reducedMotion() || !el.isConnected) return;
  el.querySelector('.glyph-memory').animate(MOMENT.frames, { duration: MOMENT.duration, easing: 'ease-in-out' });
  window.NotePill?.light(el.firstChild);
 },
};

window.Memory = new Memory(window.ChatStore);
window.MemoryPill = MemoryPill;
})();
