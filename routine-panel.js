(() => {
'use strict';

// The routines' panel, of the notes' own glass (notepad.js), in two places:
// - in a chat, from the button at its top right, left of the browser's: the icon, «Routines» and how many are on. The
//   panel lists the chat's routines; a press on one opens it to change, and «New routine» sets one up, run with the
//   chat's model and its effort as they are now.
// - in the sidebar, from the plus of the Routines group: a new routine with a chat of its own, and with its own model
//   and effort, picked here.
// A routine is changed on a page of its own in the same panel (RoutineEditor): what to do, when (once, every so many
// minutes, every day, on days of the week, every month), and for a routine with a chat of its own its model and effort.
const OPEN = { duration: 133, easing: 'cubic-bezier(0.37, 0, 0.63, 1)' };
const CLOSE = { duration: 110, easing: 'ease-out', fill: 'forwards' };
const FROM = { opacity: 0, transform: 'scale(1.09, 0.96)', filter: 'blur(4px)' };
const REST = { opacity: 1, transform: 'none', filter: 'blur(0px)' };
const AWAY = { opacity: 0, transform: 'scale(1.06)', filter: 'blur(12px)' };
const PAGE = { duration: 320, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const ROW = { in: 400, out: 340, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', close: 'cubic-bezier(0.45, 0, 0.2, 1)' };
const EDGE = 8;
// How far right of the sidebar the panel of a new routine stands, as a chat's dots' menu does.
const SIDE_GAP = 16;
const CONFIRM_TIME = 3000;
const PRESETS = [15, 30, 60, 120, 180, 360, 720];
const KINDS = ['once', 'every', 'daily', 'weekly', 'monthly'];
// The week as most of the world's calendars set it out: from Monday.
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const GROUPS = { chatgpt: 'ChatGPT', openai: 'OpenAI API', anthropic: 'Anthropic', deepseek: 'DeepSeek', openrouter: 'OpenRouter', local: 'Local', custom: 'Custom API' };
// From how many models the model list gets a field to find one by its name.
const FIND_FROM = 12;

const CROSS = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>';
const BACK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5"/></svg>';
const PAUSE = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="4" y="3.2" width="2.8" height="9.6" rx="1.1"/><rect x="9.2" y="3.2" width="2.8" height="9.6" rx="1.1"/></svg>';
const PLAY = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M5.2 3.6v8.8a.8.8 0 0 0 1.2.7l7-4.4a.8.8 0 0 0 0-1.4l-7-4.4a.8.8 0 0 0-1.2.7z"/></svg>';
const CHEVRON = '<svg class="routine-chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5 6 7.5l3-3"/></svg>';
const CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3.5 8.4 2.9 2.9 6.1-6.6"/></svg>';
const PLUS = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const element = (tag, className, html) => {
 const el = Object.assign(document.createElement(tag), { className });
 if (html !== undefined) el.innerHTML = html;
 return el;
};
const button = (className, html, label) => {
 const el = element('button', className, html);
 el.type = 'button';
 if (label) el.setAttribute('aria-label', label);
 return el;
};
const quiet = animation => animation.finished.catch(() => {});
const t = (key, vars) => I18n.t(key, vars);
const pad = n => String(n).padStart(2, '0');
const clockOf = minutes => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const midnight = (days = 0) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + days); return d; };
const dayName = (day, style = 'short') => new Intl.DateTimeFormat(I18n.lang, { weekday: style }).format(new Date(2024, 0, 7 + day));

// A time of day as a field of its own: typed, or stepped five minutes at a time with the arrows or the wheel (an hour
// with Shift). What does not read as a time goes back to the last good one.
function timeField(value, onChange, label) {
 const input = element('input', 'routine-time');
 input.type = 'text';
 input.inputMode = 'numeric';
 input.maxLength = 5;
 input.spellcheck = false;
 input.value = value;
 input.setAttribute('aria-label', label);
 let good = value;
 const set = minutes => {
  const m = ((minutes % 1440) + 1440) % 1440;
  input.value = good = clockOf(m);
  onChange(good);
 };
 const read = () => {
  const raw = input.value.trim().replace(/[.,\s-]/g, ':');
  const m = /^(\d{1,2})(?::?(\d{2}))?$/.exec(raw);
  if (m && +m[1] < 24 && (!m[2] || +m[2] < 60)) set(+m[1] * 60 + +(m[2] || 0));
  else input.value = good;
 };
 input.addEventListener('change', read);
 input.addEventListener('blur', read);
 input.addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); read(); return; }
  const step = { ArrowUp: 1, ArrowDown: -1 }[event.key];
  if (!step) return;
  event.preventDefault();
  set(RoutineRule.minutesOf(good) + step * (event.shiftKey ? 60 : 5));
 });
 input.addEventListener('wheel', event => {
  if (document.activeElement !== input) return;
  event.preventDefault();
  set(RoutineRule.minutesOf(good) + (event.deltaY < 0 ? 5 : -5));
 }, { passive: false });
 return input;
}

// Choices in a row, one of them taken: the kinds of rule, how often, the days ahead, the efforts.
function choices(className, items, chosen, onPick, { multi = false } = {}) {
 const row = element('div', `routine-choices ${className}`);
 row.setAttribute('role', multi ? 'group' : 'radiogroup');
 for (const item of items) {
  const el = button('routine-choice', escapeHtml(item.label), item.aria || null);
  el.dataset.value = String(item.value);
  el.setAttribute('role', multi ? 'checkbox' : 'radio');
  if (item.title) el.title = item.title;
  row.append(el);
 }
 const paint = value => {
  for (const el of row.children) {
   const on = multi ? value.includes(el.dataset.value) : el.dataset.value === String(value);
   el.classList.toggle('is-on', on);
   el.setAttribute('aria-checked', String(on));
  }
 };
 paint(multi ? chosen.map(String) : chosen);
 row.addEventListener('click', event => {
  const el = event.target.closest('.routine-choice');
  if (!el) return;
  const value = onPick(el.dataset.value);
  if (value !== undefined) paint(multi ? value.map(String) : value);
 });
 row.paint = paint;
 return row;
}

// What a routine is about to be, as the editor holds it: every kind keeps its own settings, so going from one kind to
// another and back loses nothing.
function draftOf(item, settings, chatModel, chatEffort = '') {
 const rule = item?.rule || null, now = new Date();
 const model = chatModel || settings.resolve(settings.model);
 const nextHour = clockOf(Math.min(23, now.getHours() + 1) * 60);
 const d = {
  text: item?.text || '',
  kind: rule?.kind || 'daily',
  once: { day: 0, time: nextHour },
  every: { minutes: 60, days: WEEK.slice(), window: false, from: '09:00', to: '18:00' },
  daily: { time: '09:00' },
  weekly: { days: [1, 2, 3, 4, 5], time: '09:00' },
  monthly: { day: now.getDate(), time: '09:00' },
  model,
  effort: item?.effort || chatEffort || settings.configFor(model).effort,
 };
 if (rule?.kind === 'once') {
  const at = new Date(rule.at), day = Math.round((new Date(at).setHours(0, 0, 0, 0) - midnight().getTime()) / 864e5);
  d.once = { day: Math.max(0, Math.min(6, day)), time: clockOf(at.getHours() * 60 + at.getMinutes()) };
 } else if (rule?.kind === 'every') {
  d.every = { minutes: rule.minutes, days: rule.days || WEEK.slice(), window: !!(rule.from && rule.to), from: rule.from || '09:00', to: rule.to || '18:00' };
 } else if (rule?.kind === 'daily') d.daily = { time: rule.time };
 else if (rule?.kind === 'weekly') d.weekly = { days: rule.days, time: rule.time };
 else if (rule?.kind === 'monthly') d.monthly = { day: rule.day, time: rule.time };
 return d;
}

function ruleOf(d) {
 if (d.kind === 'once') {
  const [h, m] = d.once.time.split(':').map(Number), at = midnight(d.once.day);
  at.setHours(h, m, 0, 0);
  return RoutineRule.clean({ kind: 'once', at: at.getTime() });
 }
 if (d.kind === 'every') return RoutineRule.clean({ kind: 'every', minutes: d.every.minutes, days: d.every.days, ...(d.every.window ? { from: d.every.from, to: d.every.to } : {}) });
 return RoutineRule.clean({ kind: d.kind, ...d[d.kind] });
}

// The highlight of a list follows the pointer on the springs the list of chats has (chat-list.js, row-menu.js): it keeps
// its speed from line to line, and fades in and out.
const GLIDE_SPRING = [520, 40];
const FADE_SPRING = [320, 32];
function spring(s, goal, [k, c], dt) {
 const steps = Math.max(1, Math.ceil(dt / 0.008)), h = dt / steps;
 for (let i = 0; i < steps; i++) { s[1] += ((goal - s[0]) * k - s[1] * c) * h; s[0] += s[1] * h; }
 if (Math.abs(goal - s[0]) < 0.01 && Math.abs(s[1]) < 0.05) { s[0] = goal; s[1] = 0; return false; }
 return true;
}

// The list of models: a small pane of the dots' menu's glass (row-menu.js) under the model's name, its models by
// provider, the chat's own scrollbar beside them, and with many models a field to find one by its name. One highlight
// glides to the model under the pointer or the keys, as in the dots' menu.
class ModelMenu {
 constructor({ settings, onPick }) {
  Object.assign(this, { settings, onPick });
  this.anchor = null;
  this.leaving = null;
  this.g = { y: [0, 0], o: [0, 0] };
  this.pointed = null;
  this.raf = 0;
  this.last = 0;
  this.tick = this.tick.bind(this);
  this.glide = element('span', 'routine-model-glide');
  this.glide.setAttribute('aria-hidden', 'true');
  const root = this.root = element('div', 'routine-model-menu glass-lens');
  root.setAttribute('popover', 'manual');
  root.innerHTML = '<input class="routine-find" type="search" hidden><div class="routine-model-pane"><div class="routine-model-scroll"><div class="routine-model-rows" role="listbox"></div></div><div class="scrollbar routine-model-scrollbar" aria-hidden="true"><div class="scrollbar-thumb"></div></div></div>';
  document.body.append(root);
  this.find = root.querySelector('.routine-find');
  this.find.placeholder = t('routine.findModel');
  this.scroll = root.querySelector('.routine-model-scroll');
  this.rows = root.querySelector('.routine-model-rows');
  this.bar = new Scrollbar(this.scroll, root.querySelector('.routine-model-scrollbar'));
  this.bar.observe(this.rows);
  this.scroll.addEventListener('scroll', () => this.edges(), { passive: true });
  this.find.addEventListener('input', () => this.fill(this.find.value));
  root.addEventListener('click', event => {
   const row = event.target.closest('.routine-model-row');
   if (!row) return;
   this.onPick(row.dataset.model);
   this.close({ focusAnchor: true });
  });
  root.addEventListener('keydown', event => this.onKey(event));
  this.rows.addEventListener('pointermove', event => this.point(event.target.closest?.('.routine-model-row') || null));
  this.rows.addEventListener('pointerleave', () => this.point(null));
  this.rows.addEventListener('focusin', event => this.point(event.target.closest?.('.routine-model-row') || null));
  document.addEventListener('pointerdown', event => {
   if (this.open && !root.contains(event.target) && !this.anchor?.contains(event.target)) this.close();
  }, true);
  window.addEventListener('resize', () => this.close({ instant: true }));
 }

 get open() {
  return this.root.matches(':popover-open') && !this.leaving;
 }

 show(anchor, chosen) {
  if (this.leaving) this.finish();
  this.anchor = anchor;
  this.chosen = chosen;
  const many = this.settings.models.length > FIND_FROM;
  this.find.hidden = !many;
  this.find.value = '';
  this.fill();
  this.root.showPopover();
  this.place();
  this.bar.update();
  this.edges();
  const row = this.rows.querySelector('[aria-selected="true"]');
  if (row) this.scroll.scrollTop = Math.max(0, row.offsetTop - this.scroll.clientHeight / 2 + row.offsetHeight / 2);
  (many ? this.find : row || this.rows.querySelector('.routine-model-row'))?.focus({ preventScroll: true });
  this.root.animate(reducedMotion() ? [{ opacity: 0 }, { opacity: 1 }] : [FROM, REST], OPEN);
 }

 fill(query = '') {
  const models = this.settings.models, providers = [...new Set(models.map(model => model.provider))], q = query.trim().toLowerCase(), out = [];
  for (const provider of providers) {
   const own = models.filter(model => model.provider === provider && (!q || (model.name || model.id).toLowerCase().includes(q)));
   if (!own.length) continue;
   if (providers.length > 1) out.push(element('div', 'routine-model-group', escapeHtml(GROUPS[provider] || provider)));
   for (const model of own) {
    const row = button('routine-model-row', `<span>${escapeHtml(model.name || model.id)}</span>${model.id === this.chosen ? CHECK : ''}`);
    row.dataset.model = model.id;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(model.id === this.chosen));
    out.push(row);
   }
  }
  if (!out.length) out.push(element('div', 'routine-model-none', escapeHtml(t('routine.noMatch'))));
  this.rows.replaceChildren(this.glide, ...out);
  this.g = { y: [0, 0], o: [0, 0] };
  this.pointed = null;
  this.paintGlide();
  this.scroll.scrollTop = 0;
  this.bar.update();
  this.edges();
 }

 // The highlight goes to the line under the pointer or the keys.
 point(row) {
  if (row === this.pointed) return;
  this.pointed = row;
  if (this.raf) return;
  this.last = performance.now();
  this.raf = requestAnimationFrame(this.tick);
 }

 tick(now) {
  this.raf = 0;
  const row = this.pointed?.isConnected ? this.pointed : null, g = this.g;
  const dt = Math.min(Math.max((now - this.last) / 1000, 0), 0.032);
  this.last = now;
  let moving = false;
  if (reducedMotion()) {
   if (row) g.y = [row.offsetTop, 0];
   g.o = [row ? 1 : 0, 0];
  } else {
   // Coming in, it appears on its line and fades up there; it slides only from line to line.
   if (row && g.o[0] < 0.02) g.y = [row.offsetTop, 0];
   if (row) moving = spring(g.y, row.offsetTop, GLIDE_SPRING, dt) || moving;
   moving = spring(g.o, row ? 1 : 0, FADE_SPRING, dt) || moving;
  }
  this.paintGlide();
  if (moving) this.raf = requestAnimationFrame(this.tick);
 }

 paintGlide() {
  this.glide.style.transform = `translateY(${this.g.y[0].toFixed(2)}px)`;
  this.glide.style.opacity = Math.min(1, Math.max(0, this.g.o[0])).toFixed(3);
 }

 // Under the model's name, or over it where the window has no room below.
 place() {
  const a = this.anchor.getBoundingClientRect(), root = this.root, h = root.offsetHeight, w = root.offsetWidth;
  const below = a.bottom + 6 + h <= innerHeight - EDGE;
  const top = below ? a.bottom + 6 : Math.max(EDGE, a.top - 6 - h);
  Object.assign(root.style, { left: `${Math.round(Math.max(EDGE, Math.min(a.left, innerWidth - w - EDGE)))}px`, top: `${Math.round(top)}px` });
 }

 // Where the list goes on past its edge, it fades out there.
 edges() {
  const { scrollTop, scrollHeight, clientHeight } = this.scroll;
  this.scroll.classList.toggle('is-cut-top', scrollTop > 1);
  this.scroll.classList.toggle('is-cut-bottom', scrollHeight - scrollTop - clientHeight > 1);
 }

 onKey(event) {
  if (event.key === 'Escape') {
   event.preventDefault();
   event.stopPropagation();
   this.close({ focusAnchor: true });
   return;
  }
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (!step) return;
  event.preventDefault();
  const rows = [...this.rows.querySelectorAll('.routine-model-row')], at = rows.indexOf(document.activeElement);
  rows[at < 0 ? (step > 0 ? 0 : rows.length - 1) : (at + step + rows.length) % rows.length]?.focus();
 }

 close({ instant = false, focusAnchor = false } = {}) {
  if (!this.root.matches(':popover-open') || this.leaving) return;
  this.anchor?.setAttribute('aria-expanded', 'false');
  this.anchor?.classList.remove('is-open');
  if (focusAnchor) this.anchor?.focus({ preventScroll: true });
  if (instant || reducedMotion()) { this.finish(); return; }
  const gone = this.leaving = this.root.animate(AWAY, CLOSE);
  quiet(gone).then(() => { if (this.leaving === gone) this.finish(); });
 }

 finish() {
  this.leaving = null;
  for (const animation of this.root.getAnimations()) animation.cancel();
  if (this.root.matches(':popover-open')) this.root.hidePopover();
 }
}

// The page a routine is set up or changed on.
class RoutineEditor {
 constructor({ settings, onSave, onRemove, onRun, onBack }) {
  Object.assign(this, { settings, onSave, onRemove, onRun, onBack });
  this.el = element('div', 'routine-editor');
  this.item = null;
  this.draft = null;
  this.withModel = false;
  this.confirm = 0;
 }

 // item: the routine to change, or none for a new one. withModel: its model and effort are picked here.
 load(item, { withModel = false, model = '', effort = '' } = {}) {
  this.item = item;
  this.withModel = withModel;
  this.draft = draftOf(item, this.settings, model, effort);
  this.build();
 }

 build() {
  const d = this.draft, el = this.el;
  this.menu?.close({ instant: true });
  el.replaceChildren();
  const field = element('div', 'routine-field');
  this.text = element('textarea', 'routine-text');
  this.text.rows = 3;
  this.text.spellcheck = true;
  this.text.placeholder = t('routine.placeholder');
  this.text.setAttribute('aria-label', t('routine.task'));
  this.text.value = d.text;
  this.text.addEventListener('input', () => { d.text = this.text.value; this.sync(); });
  this.text.addEventListener('keydown', event => {
   if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); this.save(); }
  });
  field.append(this.text);
  const when = element('section', 'routine-section');
  when.append(element('div', 'routine-label', escapeHtml(t('routine.when'))));
  this.kinds = choices('routine-kinds', KINDS.map(kind => ({ value: kind, label: t(`routine.kind.${kind}`) })), d.kind, value => { d.kind = value; this.detail(); this.sync(); return value; });
  this.detailEl = element('div', 'routine-detail');
  when.append(this.kinds, this.detailEl);
  el.append(field, when);
  if (this.withModel) el.append(this.modelSection());
  // When it runs first, on a line of its own; under it one row of buttons of one size: run now and remove for a
  // routine there is, and the one that keeps it at the end.
  this.summary = element('div', 'routine-summary');
  const foot = element('div', 'routine-foot');
  if (this.item) {
   const run = button('routine-action', escapeHtml(t('routine.runNow')));
   run.addEventListener('click', () => this.onRun?.(this.item));
   this.removeButton = button('routine-action is-remove', escapeHtml(t('routine.remove')));
   this.removeButton.addEventListener('click', () => this.askRemove());
   foot.append(run, this.removeButton);
  }
  this.saveButton = button('routine-action routine-save', escapeHtml(t(this.item ? 'routine.save' : 'routine.create')));
  this.saveButton.addEventListener('click', () => this.save());
  foot.append(this.saveButton);
  el.append(this.summary, foot);
  this.detail();
  this.sync();
 }

 // What the chosen kind asks for: the day and the time, how often and when, the days, the day of the month.
 detail() {
  const d = this.draft, box = this.detailEl, row = (label, ...parts) => {
   const line = element('div', 'routine-line');
   if (label) line.append(element('span', 'routine-line-label', escapeHtml(label)));
   line.append(...parts);
   return line;
  };
  const at = (key, value) => timeField(value, time => { d[key].time = time; this.sync(); }, t('routine.at'));
  const days = (list, onPick) => choices('routine-days', WEEK.map(day => ({ value: day, label: dayName(day, 'narrow'), aria: dayName(day, 'long'), title: dayName(day, 'long') })), list, value => onPick(+value), { multi: true });
  const toggle = list => value => {
   const set = new Set(list);
   if (set.has(value) && set.size > 1) set.delete(value);
   else set.add(value);
   list.splice(0, list.length, ...WEEK.filter(day => set.has(day)));
   this.sync();
   return list;
  };
  const parts = [];
  if (d.kind === 'once') {
   const ahead = Array.from({ length: 7 }, (_, k) => {
    const day = midnight(k);
    const label = k === 0 ? t('routine.today') : k === 1 ? t('routine.tomorrow') : `${dayName(day.getDay())} ${day.getDate()}`;
    return { value: k, label };
   });
   parts.push(choices('routine-ahead', ahead, d.once.day, value => { d.once.day = +value; this.sync(); return +value; }));
   parts.push(row(t('routine.at'), at('once', d.once.time)));
  } else if (d.kind === 'every') {
   const often = PRESETS.map(m => ({ value: m, label: m % 60 ? t('routine.short.minutes', { n: m }) : t('routine.short.hours', { n: m / 60 }) }));
   parts.push(choices('routine-often', often, d.every.minutes, value => { d.every.minutes = +value; this.sync(); return +value; }));
   const hours = choices('routine-hours', [{ value: 'all', label: t('routine.allDay') }, { value: 'window', label: t('routine.between') }], d.every.window ? 'window' : 'all', value => {
    d.every.window = value === 'window';
    span.hidden = !d.every.window;
    this.sync();
    return value;
   });
   const span = element('span', 'routine-span');
   span.append(timeField(d.every.from, time => { d.every.from = time; this.sync(); }, t('routine.from')), element('span', 'routine-dash', '–'), timeField(d.every.to, time => { d.every.to = time; this.sync(); }, t('routine.to')));
   span.hidden = !d.every.window;
   parts.push(row('', hours, span));
   parts.push(days(d.every.days, toggle(d.every.days)));
  } else if (d.kind === 'daily') {
   parts.push(row(t('routine.at'), at('daily', d.daily.time)));
  } else if (d.kind === 'weekly') {
   parts.push(days(d.weekly.days, toggle(d.weekly.days)));
   parts.push(row(t('routine.at'), at('weekly', d.weekly.time)));
  } else {
   const stepper = element('span', 'routine-stepper');
   const less = button('routine-step', '−', t('routine.dayLess')), more = button('routine-step', '+', t('routine.dayMore'));
   const value = element('span', 'routine-step-value');
   const show = () => { value.textContent = t('routine.dayOf', { day: d.monthly.day }); };
   less.addEventListener('click', () => { d.monthly.day = d.monthly.day > 1 ? d.monthly.day - 1 : 31; show(); this.sync(); });
   more.addEventListener('click', () => { d.monthly.day = d.monthly.day < 31 ? d.monthly.day + 1 : 1; show(); this.sync(); });
   show();
   stepper.append(less, value, more);
   parts.push(row(t('routine.day'), stepper), row(t('routine.at'), at('monthly', d.monthly.time)));
  }
  box.replaceChildren(...parts);
 }

 // The model and the effort of a routine with a chat of its own: the model's name opens the list of models, and the
 // efforts follow the model picked.
 modelSection() {
  const d = this.draft, section = element('section', 'routine-section routine-ai');
  const head = element('div', 'routine-line');
  head.append(element('span', 'routine-line-label', escapeHtml(t('routine.model'))));
  this.modelButton = button('routine-model', '');
  this.modelButton.setAttribute('aria-haspopup', 'listbox');
  this.modelButton.setAttribute('aria-expanded', 'false');
  this.modelButton.addEventListener('click', () => this.models(!this.menu?.open));
  head.append(this.modelButton);
  const efforts = element('div', 'routine-line');
  efforts.append(element('span', 'routine-line-label', escapeHtml(t('routine.effort'))));
  this.effortBox = element('span', 'routine-effort-box');
  efforts.append(this.effortBox);
  section.append(head, efforts);
  this.paintModel();
  return section;
 }

 paintModel() {
  const d = this.draft, model = this.settings.find(d.model), config = this.settings.configFor(d.model);
  this.modelButton.innerHTML = `<span class="routine-model-name">${escapeHtml(model?.name || t('routine.noModelName'))}</span>${CHEVRON}`;
  const efforts = config.efforts || [];
  if (!efforts.includes(d.effort)) d.effort = config.effort;
  this.effortBox.replaceChildren(efforts.length > 1 ? this.effortBar(efforts) : element('span', 'routine-effort-name', escapeHtml(t(`effort.${efforts[0] || 'auto'}`))));
 }

 // The effort as the composer's own button shows it: a short dash for each step, lit up to the one taken, and its name.
 effortBar(efforts) {
  const d = this.draft, bar = element('span', 'routine-effort'), marks = element('span', 'routine-effort-marks'), name = element('span', 'routine-effort-name');
  marks.setAttribute('role', 'radiogroup');
  marks.setAttribute('aria-label', t('routine.effort'));
  for (const level of efforts) {
   const mark = button('routine-effort-mark', '<i></i>', t(`effort.${level}`));
   mark.dataset.value = level;
   mark.title = `${t(`effort.${level}`)}: ${t(`effort.${level}.hint`)}`;
   mark.setAttribute('role', 'radio');
   marks.append(mark);
  }
  const paint = () => {
   const at = efforts.indexOf(d.effort);
   [...marks.children].forEach((mark, k) => {
    mark.classList.toggle('is-on', k <= at);
    mark.setAttribute('aria-checked', String(k === at));
   });
   name.textContent = t(`effort.${d.effort}`);
  };
  marks.addEventListener('click', event => {
   const mark = event.target.closest('.routine-effort-mark');
   if (!mark) return;
   d.effort = mark.dataset.value;
   paint();
   if (!reducedMotion()) name.animate([{ opacity: 0, transform: 'translateY(3px)', filter: 'blur(3px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 260, easing: ROW.easing });
  });
  paint();
  bar.append(marks, name);
  return bar;
 }

 // The list of models opens under the name, as a menu of its own.
 models(open) {
  this.menu ||= new ModelMenu({ settings: this.settings, onPick: id => { this.draft.model = id; this.paintModel(); } });
  if (!open) { this.menu.close(); return; }
  this.modelButton.setAttribute('aria-expanded', 'true');
  this.modelButton.classList.add('is-open');
  this.menu.show(this.modelButton, this.draft.model);
 }

 // The line beside the button says when the routine runs first, as the controls above have it; the button waits for a
 // task and a time ahead.
 sync() {
  const d = this.draft, rule = ruleOf(d), next = rule && RoutineRule.next(rule, Date.now());
  const ok = !!d.text.trim() && !!next;
  this.saveButton.disabled = !ok;
  this.summary.classList.toggle('is-wrong', !!rule && !next);
  this.summary.textContent = !rule ? '' : !next ? t('routine.passed') : t(this.item ? 'routine.next' : 'routine.first', { when: Routines.when(next, true) });
 }

 value() {
  const d = this.draft, rule = ruleOf(d);
  if (!d.text.trim() || !rule || !RoutineRule.next(rule, Date.now())) return null;
  return { text: d.text.trim(), rule, model: d.model, effort: d.effort };
 }

 save() {
  const value = this.value();
  if (value) this.onSave?.(value, this.item);
 }

 // Taking a routine away asks once more, in the button itself, for a moment.
 askRemove() {
  if (this.confirm) { clearTimeout(this.confirm); this.confirm = 0; this.onRemove?.(this.item); return; }
  this.removeButton.textContent = t('routine.removeConfirm');
  this.removeButton.classList.add('is-confirming');
  this.confirm = setTimeout(() => {
   this.confirm = 0;
   this.removeButton.textContent = t('routine.remove');
   this.removeButton.classList.remove('is-confirming');
  }, CONFIRM_TIME);
 }

 focus() {
  this.text.focus({ preventScroll: true });
  this.text.setSelectionRange(this.text.value.length, this.text.value.length);
 }
}

class RoutinePanel {
 // mode 'chat': the button in the chat and the chat's routines; mode 'new': a routine with a chat of its own, from the
 // sidebar (onCreate makes it).
 constructor({ chat, settings, button: pill = null, mode = 'chat', onCreate = null, onOpenChat = null }) {
  Object.assign(this, { chat, settings, pill, mode, onCreate, onOpenChat });
  this.state = 'closed';
  this.page = 'list';
  this.conv = null;
  this.anchor = null;
  this.leaving = null;
  const root = this.root = element('div', 'routines glass-lens');
  root.setAttribute('popover', 'manual');
  root.setAttribute('role', 'dialog');
  root.innerHTML = `
   <div class="routines-head">
    <button type="button" class="routines-back" aria-label="${escapeHtml(t('routine.back'))}">${BACK}</button>
    <div class="routines-title"></div>
    <button type="button" class="routines-close" aria-label="${escapeHtml(t('routine.close'))}">${CROSS}</button>
   </div>
   <div class="routines-body"><div class="routines-page"></div></div>`;
  document.body.append(root);
  this.titleEl = root.querySelector('.routines-title');
  this.back = root.querySelector('.routines-back');
  this.body = root.querySelector('.routines-body');
  this.pageEl = root.querySelector('.routines-page');
  this.list = element('ul', 'routines-list');
  this.list.setAttribute('role', 'list');
  this.newButton = button('routines-new', `${PLUS}<span>${escapeHtml(t('routine.new'))}</span>`);
  this.listPage = element('div', 'routines-list-page');
  this.listPage.append(this.list, this.newButton);
  this.editor = new RoutineEditor({
   settings,
   onSave: (value, item) => this.save(value, item),
   onRemove: item => this.remove(item),
   onRun: item => this.run(item),
  });
  root.querySelector('.routines-close').addEventListener('click', event => this.close({ focusAnchor: event.detail === 0 }));
  this.back.addEventListener('click', () => this.show('list'));
  this.newButton.addEventListener('click', () => this.edit(null));
  this.list.addEventListener('click', event => this.onList(event));
  document.addEventListener('keydown', event => {
   if (event.key !== 'Escape' || event.defaultPrevented || this.state !== 'open') return;
   event.preventDefault();
   if (this.page === 'edit' && this.mode === 'chat') this.show('list');
   else this.close({ focusAnchor: true });
  });
  // A press anywhere else puts the panel away; one in its list of models is the panel's own.
  document.addEventListener('pointerdown', event => {
   if (this.state !== 'open') return;
   const path = event.composedPath();
   if (!path.includes(root) && !path.includes(this.anchor) && !path.includes(this.pill) && !(this.editor.menu && path.includes(this.editor.menu.root))) this.close();
  }, true);
  window.addEventListener('resize', () => this.close({ instant: true }));
  if (pill) {
   pill.innerHTML = `<span class="routines-pill-icon">${Glyphs.routine}</span><span class="routines-pill-label">${escapeHtml(t('routine.title'))}</span><span class="routines-pill-count" aria-hidden="true" hidden></span>`;
   pill.setAttribute('aria-haspopup', 'dialog');
   pill.setAttribute('aria-expanded', 'false');
   this.count = pill.querySelector('.routines-pill-count');
   pill.addEventListener('click', event => this.state === 'open' ? this.close({ focusAnchor: event.detail === 0 }) : this.open());
   // Under the pointer the clock's hands go round once, about its middle.
   pill.addEventListener('pointerenter', () => {
    const glyph = pill.querySelector('.glyph-routine');
    if (!glyph?.querySelector('.routine-minute')?.getAnimations().length) Routines.turn(glyph, { duration: 800 });
   });
  }
  Routines.watch(() => this.refresh());
  // Every half minute «next at» moves on.
  setInterval(() => { if (this.state === 'open' && this.page === 'list') this.paintList(); }, 30000);
 }

 // The button stands in a chat that has routines, with how many are on in its disc.
 sync() {
  if (!this.pill) return;
  const conv = this.chat.active, items = conv?.record && !conv.locked ? Routines.of(conv.id) : [];
  const there = items.length > 0, pill = this.pill;
  if (there && pill.hidden && !reducedMotion()) {
   pill.animate([{ opacity: 0, transform: 'scale(0.86)' }, { opacity: 1, transform: 'none' }], { duration: 460, easing: 'cubic-bezier(0.34, 1.45, 0.64, 1)' });
   const rim = pill.querySelector('.routine-rim');
   rim?.animate([{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: 620, delay: 80, easing: ROW.easing, fill: 'backwards' });
  }
  pill.hidden = !there;
  const live = items.filter(item => Routines.live(item)).length;
  const was = this.count.textContent;
  this.count.textContent = live;
  this.count.hidden = !live;
  if (live) Figures.center(this.count);
  pill.classList.toggle('has-count', live > 0);
  pill.setAttribute('aria-label', t(live ? 'routine.open.count' : 'routine.open', { n: live }));
  if (was && was !== String(live) && live && !reducedMotion()) this.count.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 620, easing: 'cubic-bezier(0.34, 1.45, 0.64, 1)' });
  if (this.state === 'open' && this.mode === 'chat' && (this.conv !== conv || !there)) this.close({ instant: true });
 }

 refresh() {
  this.sync();
  if (this.state !== 'open' || this.mode !== 'chat') return;
  if (this.page === 'list') this.paintList();
  else if (this.editor.item && !Routines.find(this.editor.item.id)) this.show('list');
 }

 // The chat's routines open on their list; from the sidebar the panel opens on a new routine.
 open({ anchor = null, show = '' } = {}) {
  if (this.state === 'closing') this.finish();
  if (this.state === 'open') return;
  if (this.mode === 'chat') {
   const conv = this.chat.active;
   if (!conv?.record || conv.locked || this.pill.hidden) return;
   this.conv = conv;
   this.anchor = this.pill;
  } else {
   this.anchor = anchor;
  }
  if (!this.settings.models.length) { this.settings.open(t('settings.key.needed')); return; }
  this.state = 'open';
  this.root.classList.toggle('is-new', this.mode === 'new');
  const target = show && Routines.find(show);
  if (this.mode === 'new') this.fill('new');
  else if (target) this.fill('edit', target);
  else this.fill('list');
  this.root.showPopover();
  this.place();
  this.pill?.setAttribute('aria-expanded', 'true');
  this.pill?.classList.add('is-away');
  this.root.animate(reducedMotion() ? [{ opacity: 0 }, { opacity: 1 }] : [FROM, REST], OPEN);
  if (this.page === 'edit') this.editor.focus();
  else this.list.querySelector('.routines-main')?.focus({ preventScroll: true });
 }

 // The panel stands on its button's corner, opening leftwards and down. From the sidebar it stands just right of the
 // sidebar, level with the routines' group, as a chat's dots' menu does (row-menu.js): over the chat its glass blurs
 // what is behind it, which over the sidebar of a window of glass it cannot. It keeps within the window.
 place() {
  const a = this.anchor.getBoundingClientRect(), style = this.root.style, width = this.root.offsetWidth;
  const left = this.mode === 'chat' ? a.right - width : (this.anchor.closest('.sidebar')?.getBoundingClientRect().right ?? a.right) + SIDE_GAP;
  style.left = `${Math.round(Math.max(EDGE, Math.min(left, innerWidth - width - EDGE)))}px`;
  const top = Math.max(EDGE, Math.min(this.mode === 'chat' ? a.top : a.top - 4, innerHeight - this.root.offsetHeight - EDGE));
  style.top = `${Math.round(top)}px`;
  style.setProperty('--routines-room', `${Math.round(innerHeight - top - EDGE)}px`);
 }

 // What the panel holds: the list, a routine being changed, or a new one.
 fill(page, item = null) {
  this.page = page === 'list' ? 'list' : 'edit';
  this.back.hidden = this.mode !== 'chat' || page === 'list';
  if (page === 'list') {
   this.titleEl.textContent = t('routine.title');
   this.paintList();
   this.pageEl.replaceChildren(this.listPage);
   return;
  }
  this.titleEl.textContent = t(item ? 'routine.edit' : 'routine.newTitle');
  const own = this.mode === 'new' || !!item?.own;
  const model = this.mode === 'new' ? '' : this.chat.modelOf(this.conv);
  this.editor.load(item, { withModel: own, model: own && item ? this.chat.library.chat(item.chat)?.model || model : model, effort: this.mode === 'new' ? '' : this.chat.config(this.conv).effort });
  this.pageEl.replaceChildren(this.editor.el);
 }

 // One page gives way to the other: the panel's height goes from the one to the other, and the new page comes in
 // from the side it is on.
 show(page, item = null) {
  if (this.state !== 'open') return;
  const from = this.body.offsetHeight, forward = page !== 'list';
  this.fill(page, item);
  this.place();
  if (page === 'list') this.list.querySelector('.routines-main')?.focus({ preventScroll: true });
  else this.editor.focus();
  if (reducedMotion()) return;
  const to = this.body.offsetHeight;
  this.body.animate([{ height: `${from}px` }, { height: `${to}px` }], PAGE);
  this.pageEl.animate([{ opacity: 0, transform: `translateX(${forward ? 18 : -18}px)`, filter: 'blur(3px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], PAGE);
 }

 edit(item) {
  this.show('edit', item);
 }

 paintList() {
  const items = this.conv ? Routines.of(this.conv.id) : [];
  const rows = items.map(item => {
   let row = [...this.list.children].find(el => el.dataset.id === item.id);
   if (!row) {
    row = element('li', 'routines-item');
    row.dataset.id = item.id;
    row.innerHTML = `<span class="routines-sign" aria-hidden="true">${Glyphs.routine}</span><button type="button" class="routines-main"><span class="routines-text"></span><span class="routines-meta"></span></button><button type="button" class="routines-pause"></button>`;
   }
   const live = Routines.live(item);
   row.classList.toggle('is-paused', item.paused);
   row.classList.toggle('is-done', !item.paused && !item.next);
   row.querySelector('.routines-text').textContent = item.text;
   row.querySelector('.routines-meta').textContent = Routines.meta(item);
   row.querySelector('.routines-main').setAttribute('aria-label', `${item.text}. ${Routines.meta(item)}`);
   const pause = row.querySelector('.routines-pause');
   pause.innerHTML = item.paused ? PLAY : PAUSE;
   pause.hidden = !item.paused && !live;
   const label = t(item.paused ? 'routine.resume' : 'routine.pause');
   pause.setAttribute('aria-label', label);
   pause.title = label;
   return row;
  });
  this.list.replaceChildren(...rows);
 }

 onList(event) {
  const row = event.target.closest('.routines-item'), item = row && Routines.find(row.dataset.id);
  if (!item) return;
  if (event.target.closest('.routines-pause')) {
   Routines.update(item.id, { paused: !item.paused });
   if (!reducedMotion()) row.querySelector('.routines-sign').animate([{ transform: 'scale(0.8)' }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(0.34, 1.45, 0.64, 1)' });
   return;
  }
  if (event.target.closest('.routines-main')) this.edit(item);
 }

 async save(value, item) {
  if (this.mode === 'new') {
   const done = await this.onCreate?.(value);
   if (done) this.close();
   return;
  }
  const conv = this.conv;
  if (!conv?.record) return;
  // A routine with a chat of its own keeps that chat's model and effort together.
  if (item?.own && !conv.turn) this.chat.library.update(conv.id, { ...(value.model ? { model: value.model } : {}), ...(value.effort ? { effort: value.effort } : {}) });
  const result = item
   ? await Routines.update(item.id, { text: value.text, rule: value.rule, ...(item.own ? { effort: value.effort } : {}) })
   : await Routines.add({ text: value.text, rule: value.rule, chat: conv.id, own: false, effort: this.chat.config(conv).effort, by: 'user' });
  if (!result.item) { this.editor.summary.textContent = t('routine.failed'); return; }
  this.chat.markRoutine(conv, item ? 'changed' : 'set', result.item);
  this.show('list');
  const row = [...this.list.children].find(el => el.dataset.id === result.item.id);
  if (row && !reducedMotion()) row.animate([{ backgroundColor: 'var(--plate-over)' }, {}], { duration: 1200, easing: 'ease-out' });
 }

 async remove(item) {
  await Routines.remove(item.id);
  const conv = this.conv;
  if (conv?.record) this.chat.markRoutine(conv, 'removed', item);
  // A chat made for the routine stays, with what it found: it is a chat like any other now.
  if (item.own && this.chat.library.chat(item.chat)) this.chat.library.update(item.chat, { routine: false });
  if (Routines.of(conv?.id).length) this.show('list');
  else this.close();
 }

 run(item) {
  Routines.now(item.id);
  this.close();
 }

 close({ instant = false, focusAnchor = false } = {}) {
  if (this.state !== 'open') return;
  this.state = 'closing';
  this.pill?.setAttribute('aria-expanded', 'false');
  if (instant || reducedMotion()) { this.finish(focusAnchor); return; }
  const gone = this.leaving = this.root.animate(AWAY, CLOSE);
  quiet(gone).then(() => { if (this.leaving === gone) this.finish(focusAnchor); });
 }

 finish(focusAnchor = false) {
  this.state = 'closed';
  this.leaving = null;
  this.editor.menu?.close({ instant: true });
  this.pill?.classList.remove('is-away');
  for (const animation of this.root.getAnimations({ subtree: true })) animation.cancel();
  if (this.root.matches(':popover-open')) this.root.hidePopover();
  this.body.style.height = '';
  const anchor = this.anchor;
  this.conv = null;
  this.anchor = null;
  if (focusAnchor && anchor?.isConnected) anchor.focus({ preventScroll: true });
 }
}

window.RoutinePanel = RoutinePanel;
})();
