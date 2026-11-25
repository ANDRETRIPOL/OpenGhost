(root => {
'use strict';

// Calendars kept elsewhere (Google, iCloud, Outlook), read from their iCalendar text (RFC 5545): the secret address
// a calendar gives for reading it elsewhere, or an .ics file. Read in the app (desktop/calendar.js fetches the address),
// shown in the page beside the user's own entries, never changed here: they belong to the calendar they came from.
//
// parse(text) → { name, zone, entries, skipped }. An entry has the shape of our own (calendar-core.js `occurrences`):
//   { uid, kind: 'event' | 'task', title, note, place, date, time, dur, days, zone, rule, exdates, moved, done, alarms }
// `zone` is the zone's name, 'UTC', 'local', or the zone as the calendar describes it (VTIMEZONE). Times are the calendar's
// own wall times; calendar-core.js turns them into moments.

const Core = root.CalendarCore || (typeof require === 'function' ? require('./calendar-core.js') : null);

// Windows names of zones, which Outlook writes as TZID (with a VTIMEZONE that describes them, read first).
const WINDOWS = {
 'Romance Standard Time': 'Europe/Paris', 'W. Europe Standard Time': 'Europe/Berlin', 'Central Europe Standard Time': 'Europe/Budapest',
 'Central European Standard Time': 'Europe/Warsaw', 'GMT Standard Time': 'Europe/London', 'Greenwich Standard Time': 'Atlantic/Reykjavik',
 'FLE Standard Time': 'Europe/Kyiv', 'E. Europe Standard Time': 'Europe/Chisinau', 'GTB Standard Time': 'Europe/Bucharest',
 'Russian Standard Time': 'Europe/Moscow', 'Turkey Standard Time': 'Europe/Istanbul', 'Israel Standard Time': 'Asia/Jerusalem',
 'Eastern Standard Time': 'America/New_York', 'Central Standard Time': 'America/Chicago', 'Mountain Standard Time': 'America/Denver',
 'Pacific Standard Time': 'America/Los_Angeles', 'Atlantic Standard Time': 'America/Halifax', 'US Mountain Standard Time': 'America/Phoenix',
 'India Standard Time': 'Asia/Kolkata', 'China Standard Time': 'Asia/Shanghai', 'Tokyo Standard Time': 'Asia/Tokyo', 'Korea Standard Time': 'Asia/Seoul',
 'Singapore Standard Time': 'Asia/Singapore', 'Arabian Standard Time': 'Asia/Dubai', 'AUS Eastern Standard Time': 'Australia/Sydney',
 'New Zealand Standard Time': 'Pacific/Auckland', 'E. South America Standard Time': 'America/Sao_Paulo', 'UTC': 'UTC', 'Coordinated Universal Time': 'UTC',
};

// Lines: a line folded over several (a line break and one space or tab) is one line again.
function lines(text) {
 return String(text || '').replace(/^﻿/, '').replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '').split('\n').filter(line => line.trim());
}

// One line: its name, its parameters (a value in double quotes may hold : ; ,), and its value after the first colon
// outside quotes.
function line(text) {
 let k = 0, quoted = false;
 for (; k < text.length; k++) {
  const ch = text[k];
  if (ch === '"') quoted = !quoted;
  else if (ch === ':' && !quoted) break;
 }
 const head = text.slice(0, k), value = text.slice(k + 1);
 const parts = [];
 let part = '';
 quoted = false;
 for (const ch of head) {
  if (ch === '"') { quoted = !quoted; part += ch; }
  else if (ch === ';' && !quoted) { parts.push(part); part = ''; }
  else part += ch;
 }
 parts.push(part);
 const params = {};
 for (const param of parts.slice(1)) {
  const at = param.indexOf('=');
  if (at < 0) continue;
  params[param.slice(0, at).trim().toUpperCase()] = param.slice(at + 1).trim().replace(/^"|"$/g, '');
 }
 return { name: parts[0].trim().toUpperCase(), params, value };
}

// TEXT values: \\ \; \, \n are what they stand for; any other backslash stays as it is.
function unescape(value) {
 return String(value || '').replace(/\\([\\;,nN])/g, (all, ch) => (ch === 'n' || ch === 'N' ? '\n' : ch)).trim();
}

// A DATE or DATE-TIME value: { wall, date: true } for a day, { wall, utc } for a time.
function stamp(value, params = {}) {
 const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(value || '').trim());
 if (!match) return null;
 const wall = { y: +match[1], m: +match[2], d: +match[3], h: match[4] ? +match[4] : 0, mi: match[5] ? +match[5] : 0 };
 const date = params.VALUE === 'DATE' || !match[4];
 return { wall, date, utc: !!match[7] };
}

// A DURATION value, in minutes (weeks and days as so many days).
function duration(value) {
 const match = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(value || '').trim());
 if (!match) return null;
 const minutes = (+match[2] || 0) * 10080 + (+match[3] || 0) * 1440 + (+match[4] || 0) * 60 + (+match[5] || 0) + Math.round((+match[6] || 0) / 60);
 return match[1] === '-' ? -minutes : minutes;
}

const offsetMinutes = value => {
 const match = /^([+-])(\d{2})(\d{2})(\d{2})?$/.exec(String(value || '').trim());
 return match ? (match[1] === '-' ? -1 : 1) * (+match[2] * 60 + +match[3]) : 0;
};

function parse(text) {
 const stack = [], zones = {}, events = [], todos = [];
 let calendar = { name: '', zone: '' }, skipped = 0;
 for (const raw of lines(text)) {
  const { name, params, value } = line(raw);
  if (name === 'BEGIN') { stack.push({ type: value.trim().toUpperCase(), props: [], children: [] }); continue; }
  if (name === 'END') {
   const done = stack.pop();
   if (!done) continue;
   const parent = stack[stack.length - 1];
   if (parent) parent.children.push(done);
   if (done.type === 'VTIMEZONE') { const zone = readZone(done); if (zone) zones[zone.id] = zone.zone; }
   else if (done.type === 'VEVENT') events.push(done);
   else if (done.type === 'VTODO') todos.push(done);
   continue;
  }
  const top = stack[stack.length - 1];
  if (!top) continue;
  if (top.type === 'VCALENDAR') {
   if (name === 'X-WR-CALNAME') calendar.name = unescape(value);
   if (name === 'X-WR-TIMEZONE') calendar.zone = value.trim();
  }
  top.props.push({ name, params, value });
 }
 const zoneOf = (params, fallback = 'local') => {
  const id = String(params.TZID || '').replace(/^\//, '');
  if (!id) return fallback;
  if (Core.knownZone(id)) return id;
  if (WINDOWS[id] && Core.knownZone(WINDOWS[id])) return WINDOWS[id];
  if (zones[id]) return zones[id];
  return 'local';
 };
 const floating = calendar.zone && Core.knownZone(calendar.zone) ? calendar.zone : 'local';
 const entries = [], overrides = [];
 for (const component of [...events, ...todos]) {
  const entry = readEntry(component, zoneOf, floating);
  if (!entry) { skipped++; continue; }
  // A whole event called off is not shown; one time of a repeat called off is left out of it, below.
  if (entry.recurrence) overrides.push(entry);
  else if (entry.cancelled) continue;
  else entries.push(entry);
 }
 // One time of a repeat changed or called off (RECURRENCE-ID): it goes to the repeat it belongs to, as a move.
 for (const change of overrides) {
  const master = entries.find(entry => entry.uid === change.uid && entry.rule);
  if (!master) { if (!change.cancelled) { delete change.recurrence; entries.push(change); } continue; }
  const key = keyIn(change.recurrence, master);
  if (!key) continue;
  master.moved ||= {};
  if (change.cancelled) { master.moved[key] = { cancelled: true }; continue; }
  const begins = Core.toMoment(change.start, change.zone);
  const wall = change.allDay ? change.start : Core.toWall(begins, master.zone);
  master.moved[key] = { date: Core.dayKey(wall), time: change.allDay ? null : Core.timeKey(wall), dur: change.allDay ? change.days : change.dur, title: change.title !== master.title ? change.title : undefined };
 }
 for (const entry of entries) { delete entry.start; delete entry.recurrence; delete entry.allDay; delete entry.cancelled; }
 return { name: calendar.name, zone: calendar.zone, entries, skipped };
}

// The key a moment has among a repeat's times (calendar-core.js `occurrences`), as the repeat's own zone shows it.
function keyIn(when, master) {
 if (!when) return '';
 if (when.date) return Core.dayKey(when.wall);
 const wall = when.utc ? Core.toWall(Date.UTC(when.wall.y, when.wall.m - 1, when.wall.d, when.wall.h, when.wall.mi), master.zone) : Core.toWall(Core.toMoment(when.wall, when.zone || master.zone), master.zone);
 return `${Core.dayKey(wall)}T${Core.timeKey(wall)}`;
}

function readEntry(component, zoneOf, floating) {
 const get = name => component.props.find(prop => prop.name === name);
 const all = name => component.props.filter(prop => prop.name === name);
 const todo = component.type === 'VTODO';
 const startProp = get('DTSTART') || (todo ? get('DUE') : null);
 const uid = (get('UID')?.value || '').trim();
 const status = (get('STATUS')?.value || '').trim().toUpperCase();
 const title = unescape(get('SUMMARY')?.value) || '';
 const base = { uid, kind: todo ? 'task' : 'event', title, note: unescape(get('DESCRIPTION')?.value), place: unescape(get('LOCATION')?.value) };
 if (todo && !startProp) return { ...base, date: null, time: null, done: status === 'COMPLETED' || !!get('COMPLETED') };
 const start = startProp ? stamp(startProp.value, startProp.params) : null;
 if (!start) return null;
 const zone = start.date ? 'local' : start.utc ? 'UTC' : zoneOf(startProp.params, floating);
 const entry = { ...base, zone, start: start.wall, allDay: start.date, cancelled: status === 'CANCELLED' };
 entry.date = Core.dayKey(start.wall);
 entry.time = start.date ? null : Core.timeKey(start.wall);
 // How long: to DTEND (not part of it), or for DURATION; a day with no end is one day, a time with no end none.
 const endProp = get(todo ? 'DUE' : 'DTEND'), length = get('DURATION');
 const end = endProp && endProp !== startProp ? stamp(endProp.value, endProp.params) : null;
 if (start.date) {
  const days = end?.date ? Core.dayNumber(end.wall.y, end.wall.m, end.wall.d) - Core.dayNumber(start.wall.y, start.wall.m, start.wall.d) : length ? Math.round(duration(length.value) / 1440) : 1;
  entry.days = Math.max(1, days || 1);
 } else {
  const begins = Core.toMoment(start.wall, zone);
  const ends = end && !end.date ? Core.toMoment(end.wall, end.utc ? 'UTC' : zoneOf(endProp.params, floating)) : null;
  entry.dur = ends != null ? Math.max(0, Math.round((ends - begins) / 60000)) : length ? Math.max(0, duration(length.value) || 0) : 0;
 }
 const rrule = get('RRULE');
 if (rrule) {
  entry.rule = Core.parseRule(rrule.value, { zone });
  // A repeat this calendar cannot follow is shown once, at its first time.
  if (!entry.rule) delete entry.rule;
 }
 const keys = [];
 for (const prop of all('EXDATE')) for (const value of prop.value.split(',')) {
  const when = stamp(value, prop.params);
  if (!when) continue;
  keys.push(keyIn({ ...when, zone: when.utc ? 'UTC' : zoneOf(prop.params, zone) }, entry));
 }
 if (keys.length) entry.exdates = keys;
 const recurrence = get('RECURRENCE-ID');
 if (recurrence) { const when = stamp(recurrence.value, recurrence.params); if (when) entry.recurrence = { ...when, zone: when.utc ? 'UTC' : zoneOf(recurrence.params, zone) }; }
 // Reminders the calendar keeps: minutes before the start.
 const alarms = component.children.filter(child => child.type === 'VALARM').map(alarm => {
  const trigger = alarm.props.find(prop => prop.name === 'TRIGGER');
  if (!trigger || trigger.params.VALUE === 'DATE-TIME' || trigger.params.RELATED === 'END') return null;
  const minutes = duration(trigger.value);
  return minutes != null && minutes <= 0 ? -minutes : null;
 }).filter(minutes => minutes != null);
 if (alarms.length) entry.alarms = alarms;
 if (todo) entry.done = status === 'COMPLETED' || !!get('COMPLETED');
 return entry;
}

// A VTIMEZONE: its observances with their onsets and offsets.
function readZone(component) {
 const id = (component.props.find(prop => prop.name === 'TZID')?.value || '').trim().replace(/^\//, '');
 if (!id) return null;
 const observances = [];
 for (const child of component.children) {
  if (child.type !== 'STANDARD' && child.type !== 'DAYLIGHT') continue;
  const get = name => child.props.find(prop => prop.name === name);
  const start = stamp(get('DTSTART')?.value);
  if (!start) continue;
  const rrule = get('RRULE');
  observances.push({
   start: start.wall, rule: rrule ? Core.parseRule(rrule.value, { zone: 'UTC' }) : null,
   rdates: child.props.filter(prop => prop.name === 'RDATE').flatMap(prop => prop.value.split(',').map(value => stamp(value)?.wall).filter(Boolean)),
   from: offsetMinutes(get('TZOFFSETFROM')?.value), to: offsetMinutes(get('TZOFFSETTO')?.value),
  });
 }
 return observances.length ? { id, zone: { observances } } : null;
}

// Addresses as people paste them: webcal:// is https://.
function address(text) {
 const value = String(text || '').trim().replace(/^webcals?:\/\//i, 'https://');
 try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.href : ''; } catch { return ''; }
}

const CalendarIcs = { parse, address, lines, line, unescape, duration };
if (typeof module === 'object' && module.exports) module.exports = CalendarIcs;
else root.CalendarIcs = CalendarIcs;
})(typeof window === 'undefined' ? globalThis : window);
