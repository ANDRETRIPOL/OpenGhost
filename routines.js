(() => {
'use strict';

// Routines as the page sees them: the app keeps them and runs them (desktop/routines.js); here they are read, shown,
// set up, changed and taken away, and told to the agent of their chat. RoutinePill is how one stands in the chat.
const bridge = window.openghost?.routines;
const listeners = new Set();
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const element = (tag, className) => Object.assign(document.createElement(tag), { className });

const Routines = {
 items: [],
 available: !!bridge,
 ready: Promise.resolve(),

 load() {
  if (!bridge) return this.ready;
  bridge.onChange(items => this.take(items));
  return this.ready = bridge.list().then(items => this.take(items)).catch(() => {});
 },

 take(items) {
  this.items = Array.isArray(items) ? items : [];
  for (const listener of listeners) listener(this.items);
 },

 // Told whenever the routines change, from here or from the app.
 watch(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
 },

 find(id) {
  return this.items.find(item => item.id === id) || null;
 },

 of(chat) {
  return this.items.filter(item => item.chat === chat);
 },

 // On, and with a run ahead of it.
 live(item) {
  return !!item && !item.paused && item.next > 0;
 },

 async add(data) {
  const result = await bridge?.add(data);
  if (result?.item) this.merge(result.item);
  return result || { error: 'none' };
 },

 async update(id, changes) {
  const result = await bridge?.update(id, changes);
  if (result?.item) this.merge(result.item);
  return result || { error: 'none' };
 },

 async remove(id) {
  const result = await bridge?.remove(id);
  this.take(this.items.filter(item => item.id !== id));
  return result;
 },

 now(id) {
  return bridge?.now(id);
 },

 // The chat is gone: its routines go with it.
 forget(chat) {
  if (!this.of(chat).length) return;
  this.take(this.items.filter(item => item.chat !== chat));
  bridge?.forget(chat).catch(() => {});
 },

 // What the app answered lands here at once, before its word that the list changed.
 merge(item) {
  const at = this.items.findIndex(one => one.id === item.id);
  const items = this.items.slice();
  if (at < 0) items.push(item);
  else items[at] = item;
  this.take(items);
 },

 // A rule in the user's words, as a phrase of its own: from a capital letter.
 say(rule) {
  const words = RoutineRule.say(rule, I18n.t, I18n.lang);
  return words.charAt(0).toLocaleUpperCase(I18n.lang) + words.slice(1);
 },

 when(time, today = false) {
  return RoutineRule.when(time, I18n.t, I18n.lang, Date.now(), today);
 },

 // How a routine stands, in a line: how often and when next; paused; or done, for one that ran its only time.
 meta(item) {
  if (!item) return '';
  if (item.paused) return I18n.t('routine.meta.paused', { rule: this.say(item.rule) });
  if (!item.next) return item.last ? I18n.t('routine.meta.done', { when: this.when(item.last) }) : this.say(item.rule);
  return I18n.t('routine.meta.next', { rule: this.say(item.rule), when: this.when(item.next) });
 },

 // Time goes by on the routine's clock: the minute hand goes once round the clock's middle and comes to rest where it
 // set out, so nothing jumps when it is done; the hour hand and the rest of the sign stay as they are.
 turn(svg, { duration = 900, delay = 0 } = {}) {
  if (!svg || reducedMotion()) return;
  svg.querySelector('.routine-minute')?.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration, delay, easing: 'cubic-bezier(0.45, 0, 0.2, 1)' });
 },

 // A rule in English, for the agent, whatever the user's language.
 english(rule) {
  return RoutineRule.say(rule, englishT, 'en-GB');
 },

 // The routines of a chat as its agent is told of them: a line each, with the id, how often and the task.
 lines(chat) {
  return this.of(chat).map(item => {
   const state = item.paused ? ' (paused)' : item.next ? '' : ' (done: it ran its only time)';
   return `- [${item.id}] ${this.english(item.rule)}${state}: ${item.text.replace(/\s*\n\s*/g, ' / ')}`;
  }).join('\n');
 },
};

// The words of a rule in English, for the agent, whatever the user's language.
const ENGLISH = {
 'routine.days.weekdays': 'on weekdays', 'routine.days.weekend': 'at weekends',
 'routine.say.once': 'once, {when}', 'routine.say.hour': 'every hour', 'routine.say.hours': 'every {n} hours', 'routine.say.minutes': 'every {n} minutes',
 'routine.say.window': 'from {from} to {to}', 'routine.say.daily': 'every day at {time}', 'routine.say.weekly': '{days} at {time}', 'routine.say.monthly': 'on day {day} of every month at {time}',
 'routine.when.tomorrow': 'tomorrow {time}', 'routine.when.yesterday': 'yesterday {time}',
};
function englishT(key, vars = {}) {
 return (ENGLISH[key] || key).replace(/\{(\w+)\}/g, (all, name) => name in vars ? vars[name] : all);
}

// What a routine did in the chat, as a capsule like the notes' ones: its sign, a word for what happened and, in a chip,
// how often it runs (or, for a run, when it ran), then its task, and the small white button that opens the routine.
// Kinds: set, changed, paused, resumed, removed, ran.
const PILL = { room: 460, settle: 520, rim: 520, signAt: 100, wordsAt: 200, label: 320, chipAt: 300, words: 620 };
const LABELS = { set: 'routine.pill.set', changed: 'routine.pill.changed', paused: 'routine.pill.paused', resumed: 'routine.pill.resumed', removed: 'routine.pill.removed', ran: 'routine.pill.ran' };

const RoutinePill = {
 build(entry) {
  const kind = LABELS[entry.kind] ? entry.kind : 'set';
  const el = element('div', `thread-note is-routine is-${kind}`);
  el.dataset.routine = entry.routine || '';
  el.__entry = entry;
  const pill = element('button', 'thread-note-pill');
  pill.type = 'button';
  pill.innerHTML = `<span class="thread-note-sign" aria-hidden="true">${Glyphs.routine}</span><span class="thread-note-label"></span><span class="routine-chip"></span><span class="thread-note-text"></span><span class="thread-note-go"></span>`;
  pill.querySelector('.thread-note-go').textContent = I18n.t('notes.pill.open');
  const chip = kind === 'ran' ? Routines.when(entry.at) : entry.say || '';
  pill.querySelector('.thread-note-label').textContent = I18n.t(LABELS[kind]);
  pill.querySelector('.routine-chip').textContent = chip;
  pill.querySelector('.routine-chip').hidden = !chip;
  const text = pill.querySelector('.thread-note-text');
  text.textContent = entry.text || '';
  pill.setAttribute('aria-label', [I18n.t(LABELS[kind]), chip, entry.text].filter(Boolean).join(': '));
  // A task too long for the pill is told in full under the pointer.
  pill.addEventListener('pointerenter', () => { pill.title = text.scrollWidth > text.clientWidth ? text.textContent : ''; });
  el.append(pill);
  return el;
 },

 // Just come into the chat: the chat makes room, the pill settles from the left, the clock's rim is drawn round and its
 // hands go round once, the word and the chip come up, and the task is written out from the left.
 enter(el) {
  if (reducedMotion() || !el.isConnected) return;
  const pill = el.querySelector('.thread-note-pill');
  const height = el.offsetHeight, gap = el.previousElementSibling || el.nextElementSibling ? parseFloat(getComputedStyle(el.parentElement).rowGap) || 0 : 0;
  const free = () => { el.style.overflow = ''; };
  el.style.overflow = 'clip';
  el.animate([{ height: '0px', marginTop: `${-gap}px` }, { height: `${height}px`, marginTop: '0px' }], { duration: PILL.room, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }).finished.then(free, free);
  pill.animate([{ opacity: 0, transform: 'scale(0.9)' }, { opacity: 1, offset: 0.45 }, { opacity: 1, transform: 'none' }], { duration: PILL.settle, easing: 'cubic-bezier(0.34, 1.45, 0.64, 1)' });
  el.querySelector('.routine-rim')?.animate([{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: PILL.rim, delay: PILL.signAt, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'backwards' });
  el.querySelector('.routine-arrow')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: PILL.signAt + PILL.rim * 0.8, easing: 'ease-out', fill: 'backwards' });
  Routines.turn(el.querySelector('.glyph-routine'), { delay: PILL.signAt + 120 });
  const shut = 'inset(-6px 100% -6px 0)', open = 'inset(-6px -2px -6px 0)';
  el.querySelector('.thread-note-label').animate([{ clipPath: shut, opacity: 0 }, { opacity: 1, offset: 0.4 }, { clipPath: open, opacity: 1 }], { duration: PILL.label, delay: PILL.wordsAt, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' });
  el.querySelector('.routine-chip').animate([{ opacity: 0, transform: 'scale(0.8)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: PILL.chipAt, easing: 'cubic-bezier(0.34, 1.45, 0.64, 1)', fill: 'backwards' });
  el.querySelector('.thread-note-text').animate([{ clipPath: shut, opacity: 0 }, { opacity: 1, offset: 0.3 }, { clipPath: open, opacity: 1 }], { duration: PILL.words, delay: PILL.chipAt + 160, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' });
  pill.querySelector('.thread-note-go').animate([{ opacity: 0, transform: 'scale(0.86)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: PILL.chipAt + 260, easing: 'cubic-bezier(0.34, 1.45, 0.64, 1)', fill: 'backwards' });
 },
};

window.Routines = Routines;
window.RoutinePill = RoutinePill;
})();
