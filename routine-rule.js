(root => {
'use strict';

// When a routine runs (routines.js in the page, desktop/routines.js in the app). Read by both sides, so the page shows
// the same next run the app keeps. A rule is one of:
//   { kind: 'once', at }                          at a moment, given in milliseconds
//   { kind: 'every', minutes, days, from, to }    every so many minutes, on those days, between those times of day
//   { kind: 'daily', time }                       every day at a time of day
//   { kind: 'weekly', days, time }                on those days of the week at a time of day
//   { kind: 'monthly', day, time }                on that day of every month (the last one, in a shorter month)
// Days of the week are numbered as Date has them: 0 is Sunday. Times of day are 'HH:MM', in the computer's own time.
// Every so many minutes counts from the start of the window (from midnight without one): every hour runs on the hour,
// every 30 minutes on the hour and at half past, so the times are the same every day and easy to read.
const KINDS = ['once', 'every', 'daily', 'weekly', 'monthly'];
const ALL = [0, 1, 2, 3, 4, 5, 6];
const LEAST = 5, MOST = 24 * 60;
const MINUTE = 60000, DAY = 24 * 60 * MINUTE;
const NAMES = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };

// 'H:MM' or 'HH:MM' as minutes into the day; anything else is null.
function minutesOf(time) {
 const m = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? '').trim());
 if (!m || +m[1] > 23 || +m[2] > 59) return null;
 return +m[1] * 60 + +m[2];
}

const timeOf = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

function daysOf(days) {
 if (!Array.isArray(days)) return ALL.slice();
 const out = new Set();
 for (const day of days) {
  const n = typeof day === 'number' ? day : NAMES[String(day).trim().toLowerCase()];
  if (Number.isInteger(n) && n >= 0 && n <= 6) out.add(n);
 }
 return out.size ? [...out].sort((a, b) => a - b) : ALL.slice();
}

// A rule as the app keeps it, or null when it says nothing that can run. `now` is for a moment given as minutes from now.
function clean(rule, now = Date.now()) {
 if (!rule || typeof rule !== 'object' || !KINDS.includes(rule.kind)) return null;
 if (rule.kind === 'once') {
  let at = Number(rule.at);
  if (!Number.isFinite(at) && typeof rule.at === 'string') at = Date.parse(rule.at);
  if (!Number.isFinite(at) && Number(rule.in_minutes) > 0) at = now + Math.round(Number(rule.in_minutes)) * MINUTE;
  if (!Number.isFinite(at) || at <= 0) return null;
  // To the minute: a run is never asked for at a second within one.
  return { kind: 'once', at: Math.floor(at / MINUTE) * MINUTE };
 }
 const time = minutesOf(rule.time);
 if (rule.kind === 'every') {
  const minutes = Math.round(Number(rule.minutes));
  if (!Number.isFinite(minutes)) return null;
  const from = minutesOf(rule.from), to = minutesOf(rule.to);
  const out = { kind: 'every', minutes: Math.min(MOST, Math.max(LEAST, minutes)), days: daysOf(rule.days) };
  // A window is kept only whole and the right way round.
  if (from !== null && to !== null && to > from) Object.assign(out, { from: timeOf(from), to: timeOf(to) });
  return out;
 }
 if (time === null) return null;
 if (rule.kind === 'daily') return { kind: 'daily', time: timeOf(time) };
 if (rule.kind === 'weekly') return { kind: 'weekly', days: daysOf(rule.days), time: timeOf(time) };
 const day = Math.round(Number(rule.day));
 if (!(day >= 1 && day <= 31)) return null;
 return { kind: 'monthly', day, time: timeOf(time) };
}

// The local midnight `days` days after the one of `t`, kept right over a change of the clocks.
function midnight(t, days = 0) {
 const d = new Date(t);
 d.setHours(0, 0, 0, 0);
 d.setDate(d.getDate() + days);
 return d;
}

function at(day, minutes) {
 const d = new Date(day);
 d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
 return d.getTime();
}

// The first moment after `after` the rule runs at, or 0 when it runs no more.
function next(rule, after = Date.now()) {
 if (!rule) return 0;
 if (rule.kind === 'once') return rule.at > after ? rule.at : 0;
 if (rule.kind === 'every') {
  const days = new Set(rule.days || ALL), step = rule.minutes * MINUTE;
  const from = minutesOf(rule.from) ?? 0, to = minutesOf(rule.to) ?? MOST - 1;
  for (let k = 0; k <= 8; k++) {
   const day = midnight(after, k);
   if (!days.has(day.getDay())) continue;
   const start = at(day, from), end = at(day, to);
   const n = after < start ? 0 : Math.floor((after - start) / step) + 1;
   const t = start + n * step;
   if (t <= end) return t;
  }
  return 0;
 }
 const minutes = minutesOf(rule.time);
 if (minutes === null) return 0;
 const days = new Set(rule.kind === 'weekly' ? rule.days || ALL : ALL);
 for (let k = 0; k <= 400; k++) {
  const day = midnight(after, k);
  if (rule.kind === 'monthly') {
   const last = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
   if (day.getDate() !== Math.min(rule.day, last)) continue;
  } else if (!days.has(day.getDay())) continue;
  const t = at(day, minutes);
  if (t > after) return t;
 }
 return 0;
}

// The rule in words, in the page's language. `t` is I18n.t; `lang` names the language for the days and the times.
function say(rule, t, lang = 'en') {
 if (!rule) return '';
 const clock = minutes => new Intl.DateTimeFormat(lang, { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60));
 const days = list => {
  const set = [...new Set(list || ALL)].sort((a, b) => a - b), key = set.join('');
  if (key === '0123456') return '';
  if (key === '12345') return t('routine.days.weekdays');
  if (key === '06') return t('routine.days.weekend');
  const name = day => new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(new Date(2024, 0, 7 + day));
  // The week starts on Monday in the words, as it does in most of the world's calendars.
  return [...set.filter(day => day), ...set.filter(day => !day)].map(name).join(', ');
 };
 if (rule.kind === 'once') return t('routine.say.once', { when: when(rule.at, t, lang) });
 if (rule.kind === 'every') {
  const m = rule.minutes, every = m % 60 === 0 ? (m === 60 ? t('routine.say.hour') : t('routine.say.hours', { n: m / 60 })) : t('routine.say.minutes', { n: m });
  const window = rule.from && rule.to ? t('routine.say.window', { from: clock(minutesOf(rule.from)), to: clock(minutesOf(rule.to)) }) : '';
  return [every, window, days(rule.days)].filter(Boolean).join(', ');
 }
 const time = clock(minutesOf(rule.time));
 if (rule.kind === 'daily') return t('routine.say.daily', { time });
 if (rule.kind === 'weekly') {
  const on = days(rule.days);
  return on ? t('routine.say.weekly', { days: on, time }) : t('routine.say.daily', { time });
 }
 return t('routine.say.monthly', { day: rule.day, time });
}

// A moment in words, as near as it is: «14:30» today («today 14:30» with `today`), «tomorrow 9:00», «Fri 9:00» within
// the week, a date after that.
function when(time, t, lang = 'en', now = Date.now(), today = false) {
 if (!time) return '';
 const clock = new Intl.DateTimeFormat(lang, { hour: 'numeric', minute: '2-digit' }).format(new Date(time));
 const days = Math.round((midnight(time).getTime() - midnight(now).getTime()) / DAY);
 if (days === 0) return today ? t('routine.when.today', { time: clock }) : clock;
 if (days === 1) return t('routine.when.tomorrow', { time: clock });
 if (days === -1) return t('routine.when.yesterday', { time: clock });
 if (days > 1 && days < 7) return `${new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(new Date(time))} ${clock}`;
 return `${new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(new Date(time))} ${clock}`;
}

const RoutineRule = { KINDS, ALL, LEAST, MOST, clean, next, say, when, minutesOf, timeOf };
if (typeof module === 'object' && module.exports) module.exports = RoutineRule;
else root.RoutineRule = RoutineRule;
})(typeof window === 'undefined' ? globalThis : window);
