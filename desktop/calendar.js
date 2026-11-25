'use strict';

// The user's calendar, kept here in the app and not in a window, so that its reminders come on time with the window
// closed to the tray or with no chat open at all: a reminder is the app's own work, no model is asked and no chat is
// started. With the window on screen the page shows it as a card of its own (calendar.js); otherwise the system's
// notification says it, and pressing it opens the calendar at the entry.
//
// What is kept (store `calendar`): { items, tags, feeds, sent, snoozed }.
//   item  { id, kind: 'task' | 'event', title, note, place, date, time, dur, days, zone, rule, exdates, moved, done,
//           doneKeys, remind, tag, priority, by: 'user' | 'agent' | 'import', chat, created, updated }
//         (calendar-core.js reads its times; `remind` is minutes before, null for none; `doneKeys` the times of a repeat
//         ticked off, by their keys)
//   tag   { id, name, tone }
//   feed  { id, name, url, tone, on, fetched, error } — a calendar kept elsewhere (Google, iCloud, Outlook), read from
//         its secret iCalendar address every half hour (calendar-ics.js) and only shown: what it has is in the store
//         `calendar-feeds`, { [id]: entries }. Its events remind in the app they belong to, not here, so nobody gets
//         the same reminder twice.
//   sent  { 'item@key': moment } — reminders given, so none comes twice; snoozed [{ id, key, at }].
const { ipcMain, BrowserWindow, Notification, powerMonitor, net, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const Core = require(path.join(__dirname, '..', 'calendar-core.js'));
const Ics = require(path.join(__dirname, '..', 'calendar-ics.js'));

const KEY = 'calendar', FEEDS = 'calendar-feeds';
const MOST = 5000, TEXT = 300, NOTE = 4000, TAGS = 40, FEED_MOST = 12;
const TICK = 30000, LATE = 10 * 60000, FEED_EVERY = 30 * 60000, FEED_BYTES = 8 * 1024 * 1024;
const TONES = ['blue', 'lilac', 'green', 'pink', 'orange', 'turquoise', 'yellow'];

let page = null, host = null, state = { items: [], tags: [], feeds: [], sent: {}, snoozed: [] }, cache = {}, loaded = null, timer = 0, feedTimer = 0;

const uid = prefix => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const text = (value, most) => String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, most);
const zoneHere = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'; } catch { return 'local'; } };
const mine = event => host.fromApp(event);

// An entry as it may be kept: what it says, checked. Anything wrong in it is left out or makes it no entry.
function clean(data, before = null) {
 const item = { ...(before || {}) };
 const has = key => data && Object.prototype.hasOwnProperty.call(data, key);
 if (!before) {
  item.id = uid('e');
  item.created = Date.now();
  item.by = ['agent', 'import'].includes(data?.by) ? data.by : 'user';
  item.chat = typeof data?.chat === 'string' ? data.chat : null;
  item.zone = typeof data?.zone === 'string' && Core.knownZone(data.zone) ? data.zone : zoneHere();
 }
 if (has('kind') || !before) item.kind = data?.kind === 'event' ? 'event' : 'task';
 if (has('title') || !before) item.title = text(data?.title, TEXT);
 if (!item.title) return null;
 if (has('note')) item.note = text(data.note, NOTE) || undefined;
 if (has('place')) item.place = text(data.place, TEXT) || undefined;
 if (has('date') || !before) item.date = Core.parseDay(data?.date) ? data.date : null;
 if (has('time') || !before) item.time = item.date && Core.parseTime(data?.time) ? data.time : null;
 if (has('dur') || !before) item.dur = Number.isFinite(data?.dur) && data.dur >= 0 ? Math.min(Math.round(data.dur), 60 * 24 * 14) : null;
 if (has('days') || !before) item.days = Number.isFinite(data?.days) && data.days > 1 ? Math.min(Math.round(data.days), 366) : null;
 if (has('rule') || !before) item.rule = item.date ? Core.clean(data?.rule) : null;
 if (has('exdates')) item.exdates = Array.isArray(data.exdates) ? data.exdates.filter(key => typeof key === 'string').slice(-500) : [];
 if (has('moved')) item.moved = data.moved && typeof data.moved === 'object' ? data.moved : {};
 if (has('done') || !before) item.done = !!data?.done;
 if (has('doneKeys')) item.doneKeys = Array.isArray(data.doneKeys) ? data.doneKeys.filter(key => typeof key === 'string').slice(-1000) : [];
 if (has('remind') || !before) item.remind = Number.isFinite(data?.remind) && data.remind >= 0 ? Math.min(Math.round(data.remind), 60 * 24 * 14) : null;
 if (has('tag') || !before) item.tag = typeof data?.tag === 'string' && state.tags.some(tag => tag.id === data.tag) ? data.tag : null;
 if (has('priority') || !before) item.priority = Math.max(0, Math.min(3, Math.round(data?.priority || 0)));
 if (has('zone') && before && typeof data.zone === 'string' && Core.knownZone(data.zone)) item.zone = data.zone;
 // A task with no day waits in the list; an event always has a day.
 if (item.kind === 'event' && !item.date) item.date = Core.dayKey(Core.toWall(Date.now()));
 if (!item.date) { item.time = null; item.rule = null; }
 item.updated = Date.now();
 for (const key of Object.keys(item)) if (item[key] === undefined) delete item[key];
 return item;
}

function save() {
 host.store.write(KEY, state).catch(() => {});
 broadcast();
 schedule();
 host.changed?.();
}

function broadcast() {
 const view = snapshot();
 for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('calendar:changed', view);
}

function snapshot() {
 return { items: state.items, tags: state.tags, feeds: state.feeds.map(feed => ({ ...feed, entries: feed.on ? cache[feed.id] || [] : [] })), zone: zoneHere() };
}

// Reminders. Due when its moment has come and the entry has not begun yet (or began no more than ten minutes ago): a
// reminder missed while the computer slept still comes if it can still help, and an old one never does.
function due(now = Date.now()) {
 const out = [];
 for (const item of state.items) {
  if (item.remind == null || !item.date) continue;
  const lead = item.remind * 60000;
  for (const time of Core.occurrences(item, now - LATE, now + lead + Core.DAY, { limit: 50 })) {
   if (item.kind === 'task' && (item.rule ? (item.doneKeys || []).includes(time.key) : item.done)) continue;
   // A day with no time is reminded at nine in the morning of the day (minus its lead).
   const begins = time.allDay ? time.start + 9 * Core.HOUR : time.start;
   const at = begins - lead, key = `${item.id}@${time.key}`;
   if (at > now || state.sent[key] || now > Math.max(begins, at) + LATE) continue;
   out.push({ item, time, key, begins });
  }
 }
 for (const snooze of state.snoozed) {
  if (snooze.at > now) continue;
  const item = state.items.find(one => one.id === snooze.id);
  if (!item) continue;
  const time = Core.occurrences(item, now - 7 * Core.DAY, now + 7 * Core.DAY, { limit: 200 }).find(one => one.key === snooze.key);
  if (time) out.push({ item, time, key: `${item.id}@${time.key}`, begins: time.allDay ? time.start + 9 * Core.HOUR : time.start, snoozed: true });
 }
 return out;
}

function tick() {
 const now = Date.now(), list = due(now);
 if (!list.length) return schedule();
 for (const one of list) state.sent[one.key] = now;
 state.snoozed = state.snoozed.filter(snooze => snooze.at > now);
 // What was given more than a week ago is forgotten.
 for (const [key, at] of Object.entries(state.sent)) if (now - at > 8 * Core.DAY) delete state.sent[key];
 for (const one of list) remind(one);
 save();
}

// The next moment something is due: the tick comes then, not up to half a minute late.
function schedule() {
 clearTimeout(timer);
 const now = Date.now();
 let next = now + TICK;
 for (const item of state.items) {
  if (item.remind == null || !item.date) continue;
  const time = Core.nextStart(item, now - LATE, { within: 2 * Core.DAY });
  if (!time) continue;
  const at = (time.allDay ? time.start + 9 * Core.HOUR : time.start) - item.remind * 60000;
  if (at > now && at < next) next = at;
 }
 for (const snooze of state.snoozed) if (snooze.at > now && snooze.at < next) next = snooze.at;
 timer = setTimeout(tick, Math.max(500, next - now + 50));
}

function remind({ item, time, key, begins }) {
 const card = { id: item.id, key: time.key, title: item.title, kind: item.kind, begins, end: time.end, allDay: time.allDay, place: item.place || '', tag: item.tag, remind: item.remind, at: Date.now() };
 const win = host.window();
 // On screen and in front: the page shows its own card. Otherwise the system says it.
 if (win && !win.isDestroyed() && win.isVisible() && !win.isMinimized() && win.isFocused() && ready()) {
  page.send('calendar:remind', card);
  return;
 }
 // Not in front: the page keeps the card for when the user is back, and the system says it now.
 if (ready()) page.send('calendar:remind', { ...card, quiet: true });
 if (!Notification.isSupported()) return;
 const words = host.words?.(card) || { title: item.title, body: '' };
 const note = new Notification({ title: words.title, body: words.body, silent: false, icon: host.icon });
 note.on('click', () => host.open({ id: item.id, key: time.key }));
 note.show();
 shown.add(note);
 note.on('close', () => shown.delete(note));
}
const shown = new Set();

// Calendars kept elsewhere, read from their addresses.
async function fetchFeed(url) {
 const response = await net.fetch(url, { headers: { Accept: 'text/calendar, */*' }, signal: AbortSignal.timeout(25000) });
 if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
 const length = Number(response.headers.get('content-length') || 0);
 if (length > FEED_BYTES) throw new Error('too big');
 const body = await response.text();
 if (body.length > FEED_BYTES) throw new Error('too big');
 if (!/BEGIN:VCALENDAR/i.test(body)) throw new Error('not a calendar');
 return Ics.parse(body);
}

async function refresh(feed) {
 try {
  const read = await fetchFeed(feed.url);
  cache[feed.id] = read.entries;
  if (!feed.name && read.name) feed.name = text(read.name, 80);
  feed.fetched = Date.now();
  feed.error = '';
 } catch (error) {
  feed.error = String(error?.message || error).slice(0, 120);
 }
 host.store.write(FEEDS, cache).catch(() => {});
}

async function refreshAll() {
 for (const feed of state.feeds) if (feed.on) await refresh(feed);
 save();
}

// Entries of another calendar copied into this one: each becomes the user's own, as it was there.
function adopt(entries) {
 let added = 0;
 for (const entry of entries) {
  if (state.items.length >= MOST) break;
  if (!entry.title) continue;
  // The same entry read twice is not copied twice.
  if (entry.uid && state.items.some(item => item.source === entry.uid)) continue;
  const item = clean({ ...entry, by: 'import', remind: entry.alarms?.[0] ?? null, zone: typeof entry.zone === 'string' ? entry.zone : undefined });
  if (!item) continue;
  if (entry.moved) item.moved = entry.moved;
  if (entry.exdates) item.exdates = entry.exdates;
  if (entry.uid) item.source = entry.uid;
  // A zone the calendar describes itself cannot be kept by name: its times are kept as this computer shows them.
  if (typeof entry.zone === 'object' && entry.time) {
   const wall = Core.toWall(Core.toMoment({ ...Core.parseDay(entry.date), ...Core.parseTime(entry.time) }, entry.zone));
   item.date = Core.dayKey(wall);
   item.time = Core.timeKey(wall);
  }
  state.items.push(item);
  added++;
 }
 return added;
}

// The main window's page shows reminders once it has said it can; read anew, it says so again.
function ready() {
 return !!page && !page.isDestroyed() && page === host.window()?.webContents;
}

function handle(name, fn) {
 ipcMain.handle(`calendar:${name}`, async (event, ...args) => { if (!mine(event)) return null; await loaded; return fn(...args); });
}

module.exports = {
 // host: { store: { read, write }, fromApp, window(), open({ id, key }) (shows the
 // calendar at an entry), words(card) → { title, body } (the system notification's words, in the user's language), icon,
 // changed() }.
 setup(options) {
  host = options;
  loaded = Promise.all([host.store.read(KEY), host.store.read(FEEDS)]).then(([data, feeds]) => {
   if (data && typeof data === 'object') {
    state.items = Array.isArray(data.items) ? data.items.filter(item => item?.id && item.title) : [];
    state.tags = Array.isArray(data.tags) ? data.tags.filter(tag => tag?.id && tag.name) : [];
    state.feeds = Array.isArray(data.feeds) ? data.feeds.filter(feed => feed?.id && feed.url) : [];
    state.sent = data.sent && typeof data.sent === 'object' ? data.sent : {};
    state.snoozed = Array.isArray(data.snoozed) ? data.snoozed : [];
   }
   cache = feeds && typeof feeds === 'object' ? feeds : {};
   tick();
   refreshAll();
  }).catch(() => {});
  feedTimer = setInterval(() => { refreshAll(); }, FEED_EVERY);
  powerMonitor.on('resume', () => { tick(); refreshAll(); });
  powerMonitor.on('unlock-screen', tick);
  ipcMain.on('calendar:ready', event => { if (mine(event)) page = event.sender; });
  handle('get', () => snapshot());
  handle('add', data => {
   if (state.items.length >= MOST) return { error: 'full' };
   const item = clean(data);
   if (!item) return { error: 'title' };
   state.items.push(item);
   save();
   return { item };
  });
  handle('update', (id, changes) => {
   const at = state.items.findIndex(one => one.id === id);
   if (at < 0) return { error: 'none' };
   const item = clean(changes || {}, state.items[at]);
   if (!item) return { error: 'title' };
   state.items[at] = item;
   // A time moved: a reminder already given for it may come again at the new time.
   for (const key of Object.keys(state.sent)) if (key.startsWith(`${id}@`)) delete state.sent[key];
   save();
   return { item };
  });
  handle('remove', id => {
   const before = state.items.length;
   state.items = state.items.filter(one => one.id !== id);
   state.snoozed = state.snoozed.filter(one => one.id !== id);
   if (state.items.length !== before) save();
   return { ok: state.items.length !== before };
  });
  // Entries put back as they were (the page's undo): the whole entry, kept again under its own id.
  handle('restore', data => {
   if (!data?.id || typeof data.id !== 'string') return { error: 'none' };
   const item = clean(data, { id: data.id, created: data.created || Date.now(), by: data.by || 'user', chat: data.chat || null, zone: Core.knownZone(data.zone) ? data.zone : zoneHere() });
   if (!item) return { error: 'title' };
   const at = state.items.findIndex(one => one.id === item.id);
   if (at >= 0) state.items[at] = item; else state.items.push(item);
   save();
   return { item };
  });
  handle('tags', tags => {
   if (!Array.isArray(tags)) return { error: 'tags' };
   state.tags = tags.slice(0, TAGS).map(tag => ({ id: typeof tag.id === 'string' ? tag.id : uid('t'), name: text(tag.name, 40), tone: TONES.includes(tag.tone) ? tag.tone : 'blue' })).filter(tag => tag.name);
   for (const item of state.items) if (item.tag && !state.tags.some(tag => tag.id === item.tag)) item.tag = null;
   save();
   return { tags: state.tags };
  });
  handle('snooze', (id, key, minutes) => {
   if (!state.items.some(one => one.id === id) || typeof key !== 'string') return { error: 'none' };
   state.snoozed = state.snoozed.filter(one => !(one.id === id && one.key === key));
   state.snoozed.push({ id, key, at: Date.now() + Math.max(1, Math.min(24 * 60, Math.round(minutes || 10))) * 60000 });
   save();
   return { ok: true };
  });
  // Another calendar: shown and kept up to date, or copied in once.
  handle('feed', async ({ url, name, tone, copy } = {}) => {
   const address = Ics.address(url);
   if (!address) return { error: 'address' };
   let read;
   try { read = await fetchFeed(address); } catch (error) { return { error: 'fetch', detail: String(error?.message || error).slice(0, 120) }; }
   if (copy) { const added = adopt(read.entries); save(); return { added, name: read.name }; }
   if (state.feeds.length >= FEED_MOST) return { error: 'full' };
   if (state.feeds.some(feed => feed.url === address)) return { error: 'same' };
   const feed = { id: uid('f'), name: text(name, 80) || text(read.name, 80) || new URL(address).hostname, url: address, tone: TONES.includes(tone) ? tone : TONES[state.feeds.length % TONES.length], on: true, fetched: Date.now(), error: '' };
   cache[feed.id] = read.entries;
   state.feeds.push(feed);
   host.store.write(FEEDS, cache).catch(() => {});
   save();
   return { feed: { ...feed, entries: read.entries } };
  });
  handle('feed-update', (id, changes = {}) => {
   const feed = state.feeds.find(one => one.id === id);
   if (!feed) return { error: 'none' };
   if ('name' in changes) feed.name = text(changes.name, 80) || feed.name;
   if ('tone' in changes && TONES.includes(changes.tone)) feed.tone = changes.tone;
   if ('on' in changes) feed.on = !!changes.on;
   save();
   return { feed };
  });
  handle('feed-remove', id => {
   state.feeds = state.feeds.filter(one => one.id !== id);
   delete cache[id];
   host.store.write(FEEDS, cache).catch(() => {});
   save();
   return { ok: true };
  });
  handle('feed-refresh', async id => {
   const feed = state.feeds.find(one => one.id === id);
   if (!feed) return { error: 'none' };
   await refresh(feed);
   save();
   return { feed };
  });
  // An .ics file the user picks, copied in.
  handle('import', async () => {
   const win = host.window();
   const choice = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'iCalendar', extensions: ['ics', 'ical', 'ifb', 'icalendar'] }] });
   if (choice.canceled || !choice.filePaths[0]) return { canceled: true };
   try {
    const stat = await fs.promises.stat(choice.filePaths[0]);
    if (stat.size > FEED_BYTES) return { error: 'big' };
    const read = Ics.parse(await fs.promises.readFile(choice.filePaths[0], 'utf8'));
    const added = adopt(read.entries);
    save();
    return { added, name: read.name };
   } catch (error) {
    return { error: 'read', detail: String(error?.message || error).slice(0, 120) };
   }
  });
 },
 unready() {
  page = null;
 },
 // Whether the app is to stay in the tray with its window closed: a reminder is still to come.
 get alive() {
  const now = Date.now();
  return state.items.some(item => item.remind != null && item.date && (item.rule || Core.nextStart(item, now, { within: 400 * Core.DAY })));
 },
 // What the agent is told of the calendar is made in the page; this is for tests.
 _state: () => state,
 stop() {
  clearTimeout(timer);
  clearInterval(feedTimer);
 },
};
