(root => {
'use strict';

// The calendar's arithmetic, read by the page (calendar.js and the agent's tool) and by the app (desktop/calendar.js, which
// keeps the entries and sends their reminders with the window closed). No words and no screen here: days, times of day,
// time zones and repeats, worked out the way RFC 5545 (iCalendar) has them, so an entry of ours and an event read from a
// Google, iCloud or Outlook calendar repeat by the same rules.
//
// A day is 'YYYY-MM-DD'. A wall time is { y, m, d, h, mi } as a clock on the wall shows it in some zone; it becomes a
// moment (milliseconds) only with its zone: 'local' (this computer's), 'UTC', a zone's name ('Europe/Paris'), or a zone
// a calendar describes itself (VTIMEZONE, calendar-ics.js), { observances }.
//
// A repeat is a rule as RFC 5545 has it (RRULE), as an object:
//   { freq: 'daily' | 'weekly' | 'monthly' | 'yearly', interval, count, until, wkst,
//     byday: [{ n, day }], bymonthday: [], bymonth: [], byyearday: [], bysetpos: [], byhour: [], byminute: [] }
// `day` is 0 for Sunday as Date has it, `n` the nth of that day in the month (or the year), negative from its end, 0 for
// every one. `until` is a moment in milliseconds (the last one a repeat may fall on); `count` how many times in all, the
// first time included.

const MINUTE = 60000, HOUR = 60 * MINUTE, DAY = 24 * HOUR, EDGE = 8.64e15 - 2 * DAY;
const pad = n => String(n).padStart(2, '0');
const CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const FREQS = ['daily', 'weekly', 'monthly', 'yearly'];

// Days, as numbers counted from 1970-01-01 (a day number), so that steps of days never meet a change of the clock.
const dayNumber = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / DAY);
const fromNumber = n => { const t = new Date(n * DAY); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
const dayKey = ({ y, m, d }) => `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`;
const parseDay = text => {
 const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ''));
 if (!match) return null;
 const day = { y: +match[1], m: +match[2], d: +match[3] };
 return day.m >= 1 && day.m <= 12 && day.d >= 1 && day.d <= daysIn(day.y, day.m) ? day : null;
};
const parseTime = text => {
 const match = /^(\d{1,2}):(\d{2})$/.exec(String(text || ''));
 if (!match) return null;
 const h = +match[1], mi = +match[2];
 return h <= 23 && mi <= 59 ? { h, mi } : null;
};
const timeKey = ({ h, mi }) => `${pad(h)}:${pad(mi)}`;
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const weekday = ({ y, m, d }) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
const addDays = (day, n) => fromNumber(dayNumber(day.y, day.m, day.d) + n);
const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
// Wall times compare as one number: minutes since 1970 on a clock that never changes.
const wallValue = w => dayNumber(w.y, w.m, w.d) * 1440 + (w.h || 0) * 60 + (w.mi || 0);
const wallFromValue = v => { const day = fromNumber(Math.floor(v / 1440)), rest = v - Math.floor(v / 1440) * 1440; return { ...day, h: Math.floor(rest / 60), mi: rest % 60 }; };

// Zones. A zone's offset from UTC at a moment, in minutes (Paris in winter: 60).
const formats = new Map();
function knownZone(zone) {
 if (typeof zone !== 'string' || !zone || zone === 'local' || zone === 'UTC') return zone === 'UTC' || zone === 'local';
 try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true; } catch { return false; }
}
function format(zone) {
 if (!formats.has(zone)) formats.set(zone, new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }));
 return formats.get(zone);
}
function offset(ms, zone) {
 if (!zone || zone === 'local') return -new Date(ms).getTimezoneOffset();
 if (zone === 'UTC') return 0;
 if (typeof zone === 'object') return described(zone, ms);
 const parts = {};
 for (const part of format(zone).formatToParts(new Date(ms))) parts[part.type] = part.value;
 const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
 return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / MINUTE);
}

// A wall time in a zone, as a moment. A time the clock skips (spring forward) is read with the offset before the jump,
// and a time it shows twice (fall back) is the first of the two, as RFC 5545 says.
function toMoment(wall, zone = 'local') {
 const { y, m, d, h = 0, mi = 0 } = wall;
 if (!zone || zone === 'local') return new Date(y, m - 1, d, h, mi).getTime();
 const utc = Date.UTC(y, m - 1, d, h, mi);
 if (zone === 'UTC') return utc;
 if (typeof zone === 'object') return describedMoment(zone, wall);
 // The two offsets around the moment: before and after a change, if there is one near.
 const before = offset(utc - DAY, zone), after = offset(utc + DAY, zone);
 const first = utc - before * MINUTE, second = utc - after * MINUTE;
 const fits = t => offset(t, zone) === Math.round((utc - t) / MINUTE);
 if (fits(first)) return first;
 if (fits(second)) return second;
 // In the gap: the offset before the jump.
 return first;
}

// A moment as a wall time in a zone.
function toWall(ms, zone = 'local') {
 if (!zone || zone === 'local') { const t = new Date(ms); return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate(), h: t.getHours(), mi: t.getMinutes() }; }
 const t = new Date(ms + offset(ms, zone) * MINUTE);
 return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes() };
}

// A zone a calendar describes itself (VTIMEZONE): observances { start: wall, rule, rdates: [wall], from, to } with their
// offsets in minutes. The offset at a moment is that of the observance whose latest onset came before it.
function onsets(observance, year) {
 const out = [];
 const from = { y: year - 1, m: 1, d: 1, h: 0, mi: 0 }, to = { y: year + 1, m: 1, d: 1, h: 0, mi: 0 };
 if (observance.rule) for (const wall of expand(observance.rule, observance.start, { to, limit: 4000 })) { if (wallValue(wall) >= wallValue(from)) out.push(wall); }
 else out.push(observance.start);
 for (const wall of observance.rdates || []) out.push(wall);
 return out;
}
function observanceAt(zone, wall) {
 const value = wallValue(wall);
 let best = null;
 for (const observance of zone.observances || []) {
  for (const onset of onsets(observance, wall.y)) {
   // An onset is given in the wall time of the offset before it.
   const at = wallValue(onset);
   if (at <= value && (!best || at > best.at)) best = { at, observance };
  }
 }
 if (best) return best.observance;
 // Before every onset: the earliest observance's offset before it.
 const first = [...(zone.observances || [])].sort((a, b) => wallValue(a.start) - wallValue(b.start))[0];
 return first ? { to: first.from } : { to: 0 };
}
function describedMoment(zone, wall) {
 return Date.UTC(wall.y, wall.m - 1, wall.d, wall.h || 0, wall.mi || 0) - observanceAt(zone, wall).to * MINUTE;
}
function described(zone, ms) {
 // The wall time is not known yet: try each observance's offset, keep the one that agrees with itself.
 for (const observance of zone.observances || []) {
  const t = new Date(ms + observance.to * MINUTE);
  const wall = { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes() };
  if (observanceAt(zone, wall).to === observance.to) return observance.to;
 }
 return zone.observances?.[0]?.to || 0;
}

// Repeats. Every wall time a rule gives from its first one, in order, up to `to` (a wall time) and at most `limit` of
// them. The first time always counts as the first repeat, even when the rule would not give it (RFC 5545).
function expand(rule, start, { to = null, from = null, limit = 2000, zone = 'local' } = {}) {
 const out = [];
 if (!rule || !FREQS.includes(rule.freq)) return [start];
 const interval = Math.max(1, Math.floor(rule.interval || 1));
 const first = wallValue(start), end = to ? wallValue(to) : Infinity;
 const untilValue = Number.isFinite(rule.until) ? rule.until : Infinity;
 const count = rule.count > 0 ? Math.floor(rule.count) : Infinity;
 const bymonth = list(rule.bymonth), bymonthday = list(rule.bymonthday), byyearday = list(rule.byyearday), bysetpos = list(rule.bysetpos);
 const byday = (rule.byday || []).filter(item => item && item.day >= 0 && item.day <= 6).map(item => ({ n: Math.trunc(item.n || 0), day: item.day }));
 const hours = list(rule.byhour).filter(h => h >= 0 && h <= 23), minutes = list(rule.byminute).filter(mi => mi >= 0 && mi <= 59);
 const wkst = Number.isInteger(rule.wkst) ? rule.wkst : 1;
 const times = [];
 for (const h of hours.length ? hours : [start.h || 0]) for (const mi of minutes.length ? minutes : [start.mi || 0]) times.push({ h, mi });
 times.sort((a, b) => a.h * 60 + a.mi - (b.h * 60 + b.mi));
 let made = 0;
 const emit = wall => {
  const value = wallValue(wall);
  if (value > end) return false;
  if (made >= count) return false;
  if (Number.isFinite(untilValue) && toMoment(wall, zone) > untilValue) return false;
  made++;
  if (!from || value >= wallValue(from)) out.push(wall);
  return out.length < limit;
 };
 // The first time is the first repeat whatever the rule says.
 if (!emit(start)) return out;
 const startDay = { y: start.y, m: start.m, d: start.d };
 const days = period => {
  let set = [];
  if (rule.freq === 'daily') {
   set = [period];
   if (bymonth.length) set = set.filter(day => bymonth.includes(day.m));
   if (bymonthday.length) set = set.filter(day => monthdayHits(day, bymonthday));
   if (byday.length) set = set.filter(day => byday.some(item => item.day === weekday(day)));
  } else if (rule.freq === 'weekly') {
   const want = byday.length ? byday.map(item => item.day) : [weekday(startDay)];
   for (let k = 0; k < 7; k++) { const day = addDays(period, k); if (want.includes(weekday(day))) set.push(day); }
   if (bymonth.length) set = set.filter(day => bymonth.includes(day.m));
  } else if (rule.freq === 'monthly') {
   if (bymonth.length && !bymonth.includes(period.m)) return [];
   set = monthDays(period.y, period.m, { bymonthday, byday, fallback: startDay.d });
  } else {
   const year = period.y;
   if (byyearday.length) {
    const total = isLeap(year) ? 366 : 365;
    for (const n of byyearday) { const k = n > 0 ? n : total + n + 1; if (k >= 1 && k <= total) set.push(addDays({ y: year, m: 1, d: 1 }, k - 1)); }
    if (bymonth.length) set = set.filter(day => bymonth.includes(day.m));
    if (bymonthday.length) set = set.filter(day => monthdayHits(day, bymonthday));
    if (byday.length) set = set.filter(day => byday.some(item => item.day === weekday(day)));
   } else if (bymonth.length || bymonthday.length || !byday.length) {
    const months = bymonth.length ? bymonth : [startDay.m];
    for (const m of months) set.push(...monthDays(year, m, { bymonthday, byday: bymonth.length ? byday : byday.map(item => ({ ...item, n: 0 })), fallback: startDay.d }));
    if (!bymonth.length && byday.length && bymonthday.length) set = set.filter(day => byday.some(item => item.day === weekday(day)));
   } else {
    // BYDAY alone in a yearly rule: the nth such day of the year, or every one.
    for (const item of byday) {
     const all = [];
     for (let day = { y: year, m: 1, d: 1 }; day.y === year; day = addDays(day, 1)) if (weekday(day) === item.day) all.push(day);
     if (!item.n) set.push(...all);
     else { const pick = item.n > 0 ? all[item.n - 1] : all[all.length + item.n]; if (pick) set.push(pick); }
    }
   }
  }
  return set;
 };
 // Periods: the day, the week (from its first day, wkst), the month or the year of the first time, then every interval.
 let period;
 if (rule.freq === 'daily') period = startDay;
 else if (rule.freq === 'weekly') period = addDays(startDay, -((weekday(startDay) - wkst + 7) % 7));
 else if (rule.freq === 'monthly') period = { y: startDay.y, m: startDay.m, d: 1 };
 else period = { y: startDay.y, m: 1, d: 1 };
 // A rule with no count can skip the periods before `from` (days and weeks are all the same length).
 let skipped = 0;
 if (from && count === Infinity && (rule.freq === 'daily' || rule.freq === 'weekly')) {
  const step = (rule.freq === 'daily' ? 1 : 7) * interval;
  const gap = dayNumber(from.y, from.m, from.d) - dayNumber(period.y, period.m, period.d);
  const periods = Math.floor(gap / step) - 1;
  if (periods > 0) { period = addDays(period, periods * step); skipped = periods; }
 }
 for (let k = skipped; k < skipped + 20000; k++) {
  if (k !== skipped) {
   if (rule.freq === 'daily') period = addDays(period, interval);
   else if (rule.freq === 'weekly') period = addDays(period, 7 * interval);
   else if (rule.freq === 'monthly') { const m = period.m - 1 + interval; period = { y: period.y + Math.floor(m / 12), m: (m % 12) + 1, d: 1 }; }
   else period = { y: period.y + interval, m: 1, d: 1 };
  }
  if (dayNumber(period.y, period.m, period.d) * 1440 > end) break;
  let set = [];
  for (const day of days(period).sort((a, b) => dayNumber(a.y, a.m, a.d) - dayNumber(b.y, b.m, b.d))) for (const time of times) set.push({ ...day, ...time });
  if (bysetpos.length) { const all = set; set = []; for (const n of bysetpos) { const pick = n > 0 ? all[n - 1] : all[all.length + n]; if (pick && !set.includes(pick)) set.push(pick); } set.sort((a, b) => wallValue(a) - wallValue(b)); }
  for (const wall of set) {
   const value = wallValue(wall);
   if (value <= first) continue;
   if (value > end || made >= count || (Number.isFinite(untilValue) && toMoment(wall, zone) > untilValue)) return out;
   if (!emit(wall)) return out;
  }
 }
 return out;
}

function list(value) {
 return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [];
}

function monthdayHits(day, bymonthday) {
 const total = daysIn(day.y, day.m);
 return bymonthday.some(n => (n > 0 ? n : total + n + 1) === day.d);
}

// The days of a month a rule names: by their numbers, by their days of the week (the nth one, or all), or the first
// time's own number (none when the month is too short for it: 31 April is no day, RFC 5545).
function monthDays(y, m, { bymonthday, byday, fallback }) {
 const total = daysIn(y, m), out = [];
 if (bymonthday.length) {
  for (const n of bymonthday) { const d = n > 0 ? n : total + n + 1; if (d >= 1 && d <= total) out.push({ y, m, d }); }
  return byday.length ? out.filter(day => byday.some(item => item.day === weekday(day))) : out;
 }
 if (byday.length) {
  for (const item of byday) {
   const all = [];
   for (let d = 1; d <= total; d++) if (weekday({ y, m, d }) === item.day) all.push({ y, m, d });
   if (!item.n) out.push(...all);
   else { const pick = item.n > 0 ? all[item.n - 1] : all[all.length + item.n]; if (pick) out.push(pick); }
  }
  return out;
 }
 return fallback <= total ? [{ y, m, d: fallback }] : [];
}

// RRULE text, both ways. Only the four repeats a calendar of days has; a rule by the hour or the minute is not one.
function parseRule(text, { zone = 'local' } = {}) {
 const rule = {};
 for (const part of String(text || '').split(';')) {
  const [rawKey, rawValue = ''] = part.split('=');
  const key = rawKey.trim().toUpperCase(), value = rawValue.trim();
  if (key === 'FREQ') rule.freq = value.toLowerCase();
  else if (key === 'INTERVAL') rule.interval = Math.max(1, parseInt(value, 10) || 1);
  else if (key === 'COUNT') rule.count = Math.max(1, parseInt(value, 10) || 1);
  else if (key === 'UNTIL') rule.until = untilMoment(value, zone);
  else if (key === 'WKST') rule.wkst = Math.max(0, CODES.indexOf(value.toUpperCase()));
  else if (key === 'BYDAY') rule.byday = value.split(',').map(item => /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(item.trim())).filter(Boolean).map(match => ({ n: match[1] ? parseInt(match[1], 10) : 0, day: CODES.indexOf(match[2].toUpperCase()) }));
  else if (['BYMONTHDAY', 'BYMONTH', 'BYYEARDAY', 'BYSETPOS', 'BYHOUR', 'BYMINUTE'].includes(key)) rule[key.toLowerCase()] = value.split(',').map(item => parseInt(item, 10)).filter(Number.isFinite);
  else if (key === 'BYWEEKNO' || key === 'BYSECOND') rule.unsupported = true;
 }
 if (!FREQS.includes(rule.freq) || rule.unsupported) return null;
 return clean(rule);
}

function untilMoment(value, zone) {
 const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value);
 if (!match) return undefined;
 const wall = { y: +match[1], m: +match[2], d: +match[3], h: match[4] ? +match[4] : 23, mi: match[5] ? +match[5] : 59 };
 return match[7] ? Date.UTC(wall.y, wall.m - 1, wall.d, wall.h, wall.mi, +match[6]) : toMoment(wall, zone) + (match[4] ? 0 : 59 * 1000);
}

function formatRule(rule) {
 if (!rule) return '';
 const parts = [`FREQ=${rule.freq.toUpperCase()}`];
 if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
 if (rule.count) parts.push(`COUNT=${rule.count}`);
 if (Number.isFinite(rule.until)) { const t = new Date(rule.until); parts.push(`UNTIL=${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}${pad(t.getUTCSeconds())}Z`); }
 if (rule.byday?.length) parts.push(`BYDAY=${rule.byday.map(item => `${item.n || ''}${CODES[item.day]}`).join(',')}`);
 for (const key of ['bymonthday', 'bymonth', 'byyearday', 'bysetpos', 'byhour', 'byminute']) if (rule[key]?.length) parts.push(`${key.toUpperCase()}=${rule[key].join(',')}`);
 if (Number.isInteger(rule.wkst) && rule.wkst !== 1) parts.push(`WKST=${CODES[rule.wkst]}`);
 return parts.join(';');
}

// A rule as it is kept: only what it says, numbers as numbers. Anything else is no rule.
function clean(rule) {
 if (!rule || typeof rule !== 'object' || !FREQS.includes(rule.freq)) return null;
 const out = { freq: rule.freq };
 if (rule.interval > 1) out.interval = Math.min(999, Math.floor(rule.interval));
 if (rule.count > 0) out.count = Math.min(9999, Math.floor(rule.count));
 else if (Number.isFinite(rule.until)) out.until = rule.until;
 const byday = (Array.isArray(rule.byday) ? rule.byday : []).map(item => typeof item === 'number' ? { n: 0, day: item } : item).filter(item => item && Number.isInteger(item.day) && item.day >= 0 && item.day <= 6).map(item => ({ n: Math.max(-53, Math.min(53, Math.trunc(item.n || 0))), day: item.day }));
 if (byday.length) out.byday = byday;
 const ranges = { bymonthday: [-31, 31], bymonth: [1, 12], byyearday: [-366, 366], bysetpos: [-366, 366], byhour: [0, 23], byminute: [0, 59] };
 for (const [key, [low, high]] of Object.entries(ranges)) { const values = list(rule[key]).map(Math.trunc).filter(n => n >= low && n <= high && n !== 0 || (n === 0 && low === 0)); if (values.length) out[key] = [...new Set(values)]; }
 if (Number.isInteger(rule.wkst) && rule.wkst >= 0 && rule.wkst <= 6 && rule.wkst !== 1) out.wkst = rule.wkst;
 return out;
}

// An entry's times between two moments. An entry (ours, desktop/calendar.js, or one read from a calendar, calendar-ics.js):
//   { date, time, dur, zone, rule, exdates: [key], moved: { key: { date, time, dur, cancelled } } }
// With no time it takes the whole day (and `days` days, 1 when not said). Each time:
//   { key, day, start, end, allDay } — `key` names the time among the repeats ('YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM' as the
// rule gave it, before any move), so a repeat can be ticked off, moved or left out alone.
function occurrences(entry, fromMs, toMs, { limit = 500 } = {}) {
 const day = parseDay(entry?.date);
 if (!day) return [];
 const time = parseTime(entry.time), allDay = !time;
 const zone = allDay ? 'local' : entry.zone || 'local';
 const start = { ...day, h: time ? time.h : 0, mi: time ? time.mi : 0 };
 const length = allDay ? Math.max(1, Math.floor(entry.days || 1)) * DAY : Math.max(0, Math.floor(entry.dur ?? 60)) * MINUTE;
 // The wall times to look among: a little before `from` (a long entry that began before it still shows), up to `to`.
 // "From now on, whenever" is asked as the last moment a date can hold, so both ends stay inside dates' range.
 const fromWall = toWall(Math.max(-EDGE, fromMs - length - DAY), zone), toWall_ = toWall(Math.min(EDGE, toMs + DAY), zone);
 const walls = entry.rule ? expand(entry.rule, start, { from: fromWall, to: toWall_, limit: limit * 4, zone }) : [start];
 const skip = new Set(entry.exdates || []), moved = entry.moved || {}, out = [];
 const keyOf = wall => allDay ? dayKey(wall) : `${dayKey(wall)}T${timeKey(wall)}`;
 const push = (wall, key, change) => {
  const changedDay = change?.date ? parseDay(change.date) : null, changedTime = change && 'time' in change ? parseTime(change.time) : null;
  const at = changedDay ? { ...changedDay, h: (changedTime || wall).h, mi: (changedTime || wall).mi } : changedTime ? { ...wall, ...changedTime } : wall;
  const whole = change && 'time' in change ? !changedTime : allDay;
  const begins = whole ? toMoment({ ...at, h: 0, mi: 0 }, 'local') : toMoment(at, zone);
  const span = change?.dur != null ? (whole ? Math.max(1, change.dur) * DAY : change.dur * MINUTE) : (whole && !allDay ? DAY : length);
  const ends = whole ? toMoment({ ...addDays(at, Math.round(span / DAY)), h: 0, mi: 0 }, 'local') : begins + span;
  if (ends < fromMs || begins > toMs || (ends === begins ? begins < fromMs : ends <= fromMs)) return;
  out.push({ key, day: dayKey(at), start: begins, end: ends, allDay: whole, ...(change?.title ? { title: change.title } : {}) });
 };
 for (const wall of walls) {
  const key = keyOf(wall);
  if (skip.has(key)) continue;
  const change = moved[key];
  if (change?.cancelled) continue;
  push(wall, key, change);
  if (out.length >= limit) break;
 }
 return out.sort((a, b) => a.start - b.start);
}

// The next time an entry begins after a moment (a reminder's time is found from it), or null.
function nextStart(entry, after, { within = 400 * DAY } = {}) {
 const times = occurrences(entry, after, after + within, { limit: 50 });
 return times.find(time => time.start > after) || null;
}

const CalendarCore = {
 MINUTE, HOUR, DAY, CODES, FREQS,
 pad, dayNumber, fromNumber, dayKey, parseDay, parseTime, timeKey, daysIn, weekday, addDays, wallValue, wallFromValue,
 knownZone, offset, toMoment, toWall, expand, parseRule, formatRule, clean, occurrences, nextStart,
};
if (typeof module === 'object' && module.exports) module.exports = CalendarCore;
else root.CalendarCore = CalendarCore;
})(typeof window === 'undefined' ? globalThis : window);
