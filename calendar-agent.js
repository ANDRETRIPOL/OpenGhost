(() => {
'use strict';

// The agent's side of the calendar. The agent sees it in a note from the app (today to a week ahead, overdue tasks, tasks
// with no day), sent again only when that changes, and changes it with the calendar tool: every date it gives comes with
// its weekday, and the app checks the two against each other, so a date counted wrong from memory is caught before it is
// written. An entry the user made is moved, changed or taken away only once the user agrees. What the agent did stands in
// the chat as a pill, as the notes' and the routines' do; a press on it opens the calendar on the entry.
const Core = window.CalendarCore;
const Store = window.CalendarStore;
const CODES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const AHEAD = 7;
const MOST = { lines: 80, undated: 25, found: 60, title: 200, note: 2000 };

const english = day => new Date(Date.UTC(day.y, day.m - 1, day.d)).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const weekdayName = day => new Date(Date.UTC(day.y, day.m - 1, day.d)).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
const clock = ms => { const w = Core.toWall(ms); return `${w.h}:${Core.pad(w.mi)}`; };
const zone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'; } catch { return 'local'; } };

const NOTE = {
 head: 'This note comes from the app, not from the user: the user\'s calendar, as it stands now, in their own time.',
 none: '- Nothing from today to a week ahead, nothing overdue, no tasks without a day.',
 now: () => { const now = Date.now(); return `Now: ${english(Core.toWall(now))}, ${clock(now)} (${zone()}).`; },
 unavailable: 'Error: the calendar is not available in this window.',
 action: 'Error: action must be add, edit, move, done, remove or find.',
 title: 'Error: title is empty: say what the entry is.',
 date: 'Error: date must be YYYY-MM-DD.',
 time: 'Error: time must be HH:MM in 24 hours, or empty for no time of day.',
 missing: id => `Error: there is no entry ${id || 'with that id'} in the user's calendar. Its entries come in the app's note, each with its id; use find for other days.`,
 feed: 'Error: that entry comes from another calendar of the user\'s (Google, iCloud, Outlook), shown here read only. It can only be changed there.',
 occurrence: date => `Error: this entry repeats and has no time on ${date}. Give occurrence: the date of a time it falls on, or leave it out for every time.`,
 declined: 'The user declined this change: the entry stays as it was. Do not try again unless they ask.',
};

// Words for a repeat, an entry's when, a reminder, in English for the agent.
function repeatWords(rule) {
 if (!rule) return '';
 const every = rule.interval > 1 ? `every ${rule.interval} ` : 'every ';
 const days = (rule.byday || []).map(item => CODES[item.day]).join(', ');
 const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[rule.freq] || rule.freq;
 const base = rule.interval > 1 ? `${every}${unit}s` : `${every}${unit}`;
 const end = rule.count ? `, ${rule.count} times` : rule.until ? `, until ${english(Core.toWall(rule.until))}` : '';
 return `repeats ${base}${days ? ` on ${days}` : ''}${end}`;
}

function remindWords(minutes) {
 if (minutes == null) return '';
 if (minutes === 0) return 'reminder at the time';
 if (minutes % 1440 === 0) return `reminder ${minutes / 1440} d before`;
 if (minutes % 60 === 0) return `reminder ${minutes / 60} h before`;
 return `reminder ${minutes} min before`;
}

function spanWords(time) {
 if (time.allDay) {
  const days = Math.round((time.end - time.start) / Core.DAY);
  return days > 1 ? `all day, ${days} days` : 'all day';
 }
 if (time.kind === 'task') return `by ${clock(time.start)}`;
 return `${clock(time.start)}–${clock(time.end)}`;
}

// One line of the note for a time of an entry.
function line(time, { day = false } = {}) {
 const item = time.item, parts = [];
 parts.push(time.kind === 'task' ? 'task' : 'event');
 const repeat = repeatWords(item.rule);
 if (repeat) parts.push(repeat);
 if (!time.feed) {
  const remind = remindWords(item.remind);
  if (remind) parts.push(remind);
  if (time.tag) parts.push(`tag ${time.tag.name}`);
  if (item.priority) parts.push(['', 'low', 'medium', 'high'][item.priority] + ' priority');
  if (item.place) parts.push(`at ${item.place}`);
  if (time.done) parts.push('done');
  if (item.by === 'agent') parts.push('added by an agent');
 } else parts.push(`from the user's calendar “${time.feed.name}”, read only`);
 const when = day ? `${english(Core.parseDay(time.day))}, ${time.allDay ? 'no time' : spanWords(time)}` : spanWords(time);
 const id = time.feed ? '' : `[${time.id}${item.rule ? ` · occurrence ${time.day}` : ''}] `;
 const note = !time.feed && item.note ? ` — note: ${item.note.replace(/\s+/g, ' ').slice(0, 160)}` : '';
 return `- ${id}${when} ${time.title} (${parts.join(', ')})${note}`;
}

const startOf = day => Core.toMoment({ ...day, h: 0, mi: 0 }, 'local');

// The note: what the calendar holds from today to a week ahead, the tasks overdue, the tasks with no day.
function lines(now = Date.now()) {
 if (!Store?.available) return '';
 const today = Core.toWall(now), out = [];
 const late = Store.overdue(now);
 if (late.length) {
  out.push('Overdue tasks, not done:');
  for (const time of late.slice(0, 20)) out.push(line(time, { day: true }));
 }
 let count = 0;
 for (let k = 0; k <= AHEAD; k++) {
  const day = Core.addDays(today, k), from = startOf(day), to = startOf(Core.addDays(day, 1)) - 1;
  const times = Store.times(from, to).filter(time => !(time.allDay && time.day < Core.dayKey(day) && time.end <= from));
  const name = `${english(day)}${k === 0 ? ' (today)' : k === 1 ? ' (tomorrow)' : ''}`;
  if (!times.length) { out.push(`${name}: nothing`); continue; }
  out.push(`${name}:`);
  for (const time of times) { if (count++ < MOST.lines) out.push(line(time)); }
 }
 if (count > MOST.lines) out.push(`- …and ${count - MOST.lines} more: use find for the whole list.`);
 const undated = Store.undated().filter(item => !item.done);
 if (undated.length) {
  out.push('Tasks with no day:');
  for (const item of undated.slice(0, MOST.undated)) out.push(`- [${item.id}] ${item.title}${item.priority ? ` (${['', 'low', 'medium', 'high'][item.priority]} priority)` : ''}`);
 }
 const any = late.length || count || undated.length;
 return any ? out.join('\n') : '';
}

// What the agent must be told of the calendar before this request: nothing when it already knows (see Chat.notes).
function note(had) {
 const now = lines();
 const text = now || had ? `${NOTE.head}\n${now || NOTE.none}` : '';
 return text && text !== had ? text : '';
}

// A date and its weekday, checked against each other.
function checkDate(args) {
 if (args.date == null || args.date === '') return { date: undefined };
 const day = Core.parseDay(String(args.date).trim());
 if (!day) return { error: `${NOTE.date} ${NOTE.now()}` };
 const real = CODES[Core.weekday(day)], said = String(args.weekday || '').trim().slice(0, 3).toLowerCase();
 if (!said) return { error: `Error: give weekday with the date. ${args.date} is a ${weekdayName(day)}: check that this is the day the user meant, then call again with weekday "${real}". ${NOTE.now()}` };
 if (said !== real) return { error: `Error: ${args.date} is a ${weekdayName(day)}, not a ${weekdayName(Core.addDays(day, CODES.indexOf(said) - CODES.indexOf(real)))}. Count the date again from today, day by day, and call again. ${NOTE.now()}` };
 return { date: Core.dayKey(day), day };
}

function checkTime(args) {
 if (args.time === undefined) return { time: undefined };
 if (args.time === null || args.time === '') return { time: null };
 const time = Core.parseTime(String(args.time).trim());
 return time ? { time: Core.timeKey(time) } : { error: NOTE.time };
}

function ruleOf(repeat) {
 if (repeat === null || repeat === '' || repeat === 'none') return null;
 if (!repeat || typeof repeat !== 'object') return undefined;
 const freq = String(repeat.freq || repeat.every || '').toLowerCase();
 if (!['daily', 'weekly', 'monthly', 'yearly'].includes(freq)) return null;
 const rule = { freq };
 if (repeat.interval > 1) rule.interval = Math.floor(repeat.interval);
 const days = (Array.isArray(repeat.days) ? repeat.days : []).map(code => CODES.indexOf(String(code).slice(0, 3).toLowerCase())).filter(n => n >= 0);
 if (days.length) rule.byday = days.map(day => ({ n: 0, day }));
 if (repeat.count > 0) rule.count = Math.floor(repeat.count);
 else if (repeat.until) { const until = Core.parseDay(String(repeat.until)); if (until) rule.until = Core.toMoment({ ...until, h: 23, mi: 59 }, 'local'); }
 return Core.clean(rule);
}

function remindOf(value) {
 if (value === undefined) return undefined;
 if (value === null || value === '' || Number(value) < 0) return null;
 const n = Math.round(Number(value));
 return Number.isFinite(n) ? Math.min(n, 60 * 24 * 60) : undefined;
}

// What an entry is now, in the words of the tool's answer.
function told(item, key = null) {
 const first = key ? Store.times(startOf(Core.parseDay(key.slice(0, 10))), startOf(Core.addDays(Core.parseDay(key.slice(0, 10)), 2))).find(time => time.id === item.id && time.key === key) : null;
 const time = first || (item.date ? Store.times(startOf(Core.parseDay(item.date)), startOf(Core.addDays(Core.parseDay(item.date), 400))).find(one => one.id === item.id) : null);
 if (!time) return `[${item.id}] ${item.title} (task with no day)`;
 return line(time, { day: true }).slice(2);
}

// The pill's words: when, in the user's language.
function whenOf(item, key) {
 const fmt = window.CalendarUI?.fmt;
 const day = Core.parseDay((key || item.date || '').slice(0, 10));
 if (!fmt || !day) return '';
 const parts = [fmt.near(day, Core.toWall(Date.now()))];
 const time = key && key.length > 10 ? key.slice(11) : item.time;
 if (time) parts.push(time.replace(/^0/, ''));
 return parts.join(' · ');
}

async function use({ conv, turn, args, mode, ask, waiting }) {
 if (!Store?.available) return NOTE.unavailable;
 await Store.ready;
 const action = String(args.action || '').toLowerCase();
 const pill = (kind, item, key = null) => turn.pills.push({ role: 'calendar', kind, item: item.id, key, title: item.title, when: whenOf(item, key), remind: item.remind ?? null });
 if (action === 'find') return find(args);
 const checked = checkDate(args);
 if (checked.error) return checked.error;
 const time = checkTime(args);
 if (time.error) return time.error;
 if (action === 'add') {
  const title = String(args.title ?? '').trim().slice(0, MOST.title);
  if (!title) return NOTE.title;
  const kind = args.kind === 'task' ? 'task' : args.kind === 'event' ? 'event' : time.time && args.duration ? 'event' : 'task';
  const data = {
   title, kind, date: checked.date ?? null, time: checked.date ? time.time ?? null : null,
   dur: kind === 'event' && time.time ? Math.max(5, Math.round(Number(args.duration) || 60)) : null,
   days: !time.time && args.days > 1 ? Math.floor(args.days) : null,
   rule: checked.date ? ruleOf(args.repeat) ?? null : null, remind: remindOf(args.remind) ?? null,
   note: args.note ? String(args.note).slice(0, MOST.note) : '', place: args.place ? String(args.place).slice(0, 200) : '',
   priority: Math.max(0, Math.min(3, Math.round(Number(args.priority) || 0))), by: 'agent', chat: conv.id,
  };
  if (args.tag) data.tag = (await Store.tagNamed(String(args.tag)))?.id || null;
  // A time already passed today is most likely meant for another day: said so, not refused.
  const start = data.date && data.time ? Core.toMoment({ ...Core.parseDay(data.date), ...Core.parseTime(data.time) }, 'local') : null;
  const answer = await Store.add(data, { undoable: false });
  if (!answer?.item) return `Error: the entry could not be added (${answer?.error || 'unknown'}).`;
  pill('added', answer.item);
  const clash = start && data.kind === 'event' ? Store.times(start, start + (data.dur || 60) * 60000 - 1).filter(one => one.id !== answer.item.id && !one.allDay && one.kind === 'event') : [];
  const past = start && start < Date.now() ? ' Note: that time has already passed today; if the user meant another day, move it.' : '';
  return `Added ${told(answer.item)}. The user sees it in the chat and in their calendar, so there is no need to list it.${clash.length ? ` It meets ${clash.map(one => `“${one.title}” ${spanWords(one)}`).join(', ')}: tell the user.` : ''}${past} ${NOTE.now()}`;
 }
 if (!['edit', 'move', 'done', 'remove'].includes(action)) return NOTE.action;
 const id = String(args.id ?? '').trim().replace(/^\[|\]$/g, '').split(/\s/)[0];
 if (id.includes(':')) return NOTE.feed;
 const item = Store.item(id);
 if (!item) return NOTE.missing(id);
 // One time of a repeat, by the day it falls on; with no day, every time (ticked off: today's).
 let key = null;
 if (item.rule && action !== 'edit') {
  const on = Core.parseDay(String(args.occurrence || '')) || (action === 'done' ? Core.toWall(Date.now()) : null);
  if (on) {
   key = Store.times(startOf(on), startOf(Core.addDays(on, 1)) - 1).find(one => one.id === item.id)?.key || null;
   if (!key) return NOTE.occurrence(Core.dayKey(on));
  }
 }
 // The user's own entry changes only once they agree (in any mode but Full access); ticking one off does not ask.
 if (action !== 'done' && item.by !== 'agent' && mode !== 'full') {
  const held = waiting();
  if (held) return held;
  const to = action === 'move' && (checked.date || time.time) ? whenOf({ date: checked.date || (key || item.date || '').slice(0, 10), time: time.time !== undefined ? time.time : (key && key.length > 10 ? key.slice(11) : item.time) }, null) : '';
  const answer = await ask({ ...args, action, title: item.title, when: [whenOf(item, key) || window.I18n.t('cal.undated'), to].filter(Boolean).join(' → ') });
  if (answer !== 'allow') return answer === 'deny' ? NOTE.declined : answer;
 }
 if (action === 'done') {
  if (item.kind !== 'task') return 'Error: only a task can be ticked off; an event simply passes.';
  const value = args.undone ? false : true;
  await Store.done(item, key, value, { undoable: false });
  pill(value ? 'done' : 'undone', item, key);
  return `${value ? 'Ticked off' : 'Ticked back'}: ${item.title}${key ? ` on ${english(Core.parseDay(key.slice(0, 10)))}` : ''}.`;
 }
 if (action === 'remove') {
  if (key) await Store.skip(item, key, { undoable: false });
  else await Store.remove(item.id, { undoable: false });
  pill('removed', item, key);
  return `Removed: ${item.title}${key ? ` on ${english(Core.parseDay(key.slice(0, 10)))} (the other times stay)` : ''}.`;
 }
 if (action === 'move') {
  const change = {};
  if (checked.date !== undefined) change.date = checked.date;
  if (time.time !== undefined) change.time = time.time;
  if (args.duration) change.dur = Math.max(5, Math.round(Number(args.duration)));
  if (!Object.keys(change).length) return 'Error: say where to move it: date (with weekday), time, or duration.';
  if (!item.date && !change.date) change.date = Core.dayKey(Core.toWall(Date.now()));
  await Store.move(item, key, change, { all: !key, undoable: false });
  const fresh = Store.item(item.id);
  const nowKey = key && fresh.moved?.[key] ? `${fresh.moved[key].date || key.slice(0, 10)}${(fresh.moved[key].time ?? (key.length > 10 ? key.slice(11) : null)) ? `T${fresh.moved[key].time ?? key.slice(11)}` : ''}` : null;
  pill('moved', fresh, key);
  turn.pills.at(-1).when = nowKey ? whenOf({ date: nowKey.slice(0, 10), time: nowKey.length > 10 ? nowKey.slice(11) : null }, null) : whenOf(fresh, null);
  return `Moved: ${told(fresh, key && !nowKey ? key : null)}. ${NOTE.now()}`;
 }
 // edit
 const changes = {};
 if (args.title != null && String(args.title).trim()) changes.title = String(args.title).trim().slice(0, MOST.title);
 if (args.kind === 'task' || args.kind === 'event') changes.kind = args.kind;
 if (args.duration) changes.dur = Math.max(5, Math.round(Number(args.duration)));
 if (args.days > 0) changes.days = Math.floor(args.days);
 const rule = ruleOf(args.repeat);
 if (rule !== undefined) changes.rule = rule;
 const remind = remindOf(args.remind);
 if (remind !== undefined) changes.remind = remind;
 if (args.note != null) changes.note = String(args.note).slice(0, MOST.note);
 if (args.place != null) changes.place = String(args.place).slice(0, 200);
 if (args.priority != null) changes.priority = Math.max(0, Math.min(3, Math.round(Number(args.priority) || 0)));
 if (args.tag !== undefined) changes.tag = args.tag ? (await Store.tagNamed(String(args.tag)))?.id || null : null;
 if (checked.date !== undefined) changes.date = checked.date;
 if (time.time !== undefined) changes.time = time.time;
 if (!Object.keys(changes).length) return 'Error: nothing to change was given.';
 const answer = await Store.update(item.id, changes, { undoable: false });
 if (!answer?.item) return `Error: the entry could not be changed (${answer?.error || 'unknown'}).`;
 pill('changed', answer.item);
 return `Changed: ${told(answer.item)}. ${NOTE.now()}`;
}

// The entries between two days, or with some words in them.
function find(args) {
 const today = Core.toWall(Date.now());
 const from = Core.parseDay(String(args.from || '')) || today;
 const to = Core.parseDay(String(args.to || '')) || Core.addDays(from, 30);
 if (Core.dayNumber(to.y, to.m, to.d) - Core.dayNumber(from.y, from.m, from.d) > 400) return 'Error: look at most 400 days at a time.';
 const words = String(args.text || '').trim().toLowerCase();
 let times = Store.times(startOf(from), startOf(Core.addDays(to, 1)) - 1);
 if (words) times = times.filter(time => `${time.title} ${time.item.note || ''} ${time.item.place || ''}`.toLowerCase().includes(words));
 const undated = words ? Store.undated().filter(item => item.title.toLowerCase().includes(words)) : [];
 if (!times.length && !undated.length) return `Nothing found from ${english(from)} to ${english(to)}${words ? ` with “${args.text}”` : ''}. ${NOTE.now()}`;
 const out = times.slice(0, MOST.found).map(time => line(time, { day: true }));
 if (times.length > MOST.found) out.push(`- …and ${times.length - MOST.found} more: look at fewer days.`);
 for (const item of undated) out.push(`- [${item.id}] ${item.title} (task with no day)`);
 return `From ${english(from)} to ${english(to)}:\n${out.join('\n')}\n${NOTE.now()}`;
}

// In the chat: the notes' black capsule with the calendar's sign, a word for what happened, when in a chip, the title,
// and the small button that opens the calendar on it. Kinds: added, moved, changed, done, undone, removed.
const LABELS = { added: 'cal.pill.added', moved: 'cal.pill.moved', changed: 'cal.pill.changed', done: 'cal.pill.done', undone: 'cal.pill.undone', removed: 'cal.pill.removed' };
const element = (tag, cls) => { const node = document.createElement(tag); if (cls) node.className = cls; return node; };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const CalendarPill = {
 build(entry) {
  const kind = LABELS[entry.kind] ? entry.kind : 'added';
  const el = element('div', `thread-note is-calendar-pill is-cal-${kind}`);
  el.dataset.calendar = entry.item || '';
  el.dataset.key = entry.key || '';
  el.__entry = entry;
  const pill = element('button', 'thread-note-pill');
  pill.type = 'button';
  pill.innerHTML = `<span class="thread-note-sign" aria-hidden="true">${Glyphs.calendar}</span><span class="thread-note-label"></span><span class="routine-middle"><span class="routine-chip"></span><span class="thread-note-text"></span></span><span class="thread-note-go"></span>`;
  pill.querySelector('.thread-note-go').textContent = I18n.t('notes.pill.open');
  const chip = entry.when || '';
  pill.querySelector('.thread-note-label').textContent = I18n.t(LABELS[kind]);
  pill.querySelector('.routine-chip').textContent = chip;
  pill.querySelector('.routine-chip').hidden = !chip;
  const text = pill.querySelector('.thread-note-text');
  text.textContent = entry.title || '';
  pill.setAttribute('aria-label', [I18n.t(LABELS[kind]), entry.when, entry.title].filter(Boolean).join(': '));
  pill.addEventListener('pointerenter', () => { pill.title = text.scrollWidth > text.clientWidth ? text.textContent : ''; });
  el.append(pill);
  return el;
 },

 // Just come into the chat: room is made, the pill settles from the left, the sign's day drops in, the words are written
 // out, as the other pills in the chat come.
 enter(el) {
  if (reduced() || !el.isConnected) return;
  const pill = el.querySelector('.thread-note-pill');
  const height = el.offsetHeight, gap = el.previousElementSibling || el.nextElementSibling ? parseFloat(getComputedStyle(el.parentElement).rowGap) || 0 : 0;
  const free = () => { el.style.overflow = ''; };
  el.style.overflow = 'clip';
  el.animate([{ height: '0px', marginTop: `${-gap}px` }, { height: `${height}px`, marginTop: '0px' }], { duration: 460, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }).finished.then(free, free);
  pill.animate([{ opacity: 0, transform: 'scale(0.9)' }, { opacity: 1, offset: 0.45 }, { opacity: 1, transform: 'none' }], { duration: 520, easing: 'cubic-bezier(0.34, 1.45, 0.64, 1)' });
  el.querySelector('.calendar-today')?.animate([{ transform: 'translateY(-6px) scale(0.4)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, delay: 160, easing: 'cubic-bezier(0.34, 1.45, 0.64, 1)', fill: 'backwards' });
  const shut = 'inset(-6px 100% -6px 0)', open = 'inset(-6px -2px -6px 0)';
  el.querySelector('.thread-note-label').animate([{ clipPath: shut, opacity: 0 }, { opacity: 1, offset: 0.4 }, { clipPath: open, opacity: 1 }], { duration: 320, delay: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' });
  el.querySelector('.routine-chip').animate([{ opacity: 0, transform: 'scale(0.8)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 300, easing: 'cubic-bezier(0.34, 1.45, 0.64, 1)', fill: 'backwards' });
  el.querySelector('.thread-note-text').animate([{ clipPath: shut, opacity: 0 }, { opacity: 1, offset: 0.3 }, { clipPath: open, opacity: 1 }], { duration: 620, delay: 460, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' });
  pill.querySelector('.thread-note-go').animate([{ opacity: 0, transform: 'scale(0.86)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: 560, easing: 'cubic-bezier(0.34, 1.45, 0.64, 1)', fill: 'backwards' });
 },
};

window.CalendarAgent = { note, lines, use, find, checkDate, HEAD: NOTE.head };
window.CalendarPill = CalendarPill;
})();
