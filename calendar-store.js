(() => {
'use strict';

// The calendar as the page has it: what desktop/calendar.js keeps, read once and kept up to date, and every change asked
// of it. The page (calendar.js) and the agent's tool (calendar-agent.js) both read and change the calendar here. A change
// the user makes by hand can be taken back (Ctrl+Z): each one leaves how to undo it.
const Core = window.CalendarCore;
const bridge = window.openghost?.calendar || null;
const TONES = ['blue', 'lilac', 'green', 'pink', 'orange', 'turquoise', 'yellow'];
const UNDO_MOST = 40;

class Store {
 constructor() {
  this.view = { items: [], tags: [], feeds: [], zone: 'local' };
  this.listeners = new Set();
  this.undo = [];
  this.available = !!bridge;
  this.ready = bridge ? bridge.get().then(view => { if (view) this.take(view); }).catch(() => {}) : Promise.resolve();
  bridge?.onChange(view => this.take(view));
 }

 take(view) {
  const before = this.view;
  this.view = view;
  for (const listen of this.listeners) listen(view, before);
 }

 on(listen) {
  this.listeners.add(listen);
  return () => this.listeners.delete(listen);
 }

 get items() { return this.view.items; }
 get tags() { return this.view.tags; }
 get feeds() { return this.view.feeds; }
 item(id) { return this.view.items.find(item => item.id === id) || null; }
 tag(id) { return this.view.tags.find(tag => tag.id === id) || null; }
 feed(id) { return this.view.feeds.find(feed => feed.id === id) || null; }

 // Every time of every entry between two moments, the user's own and those of the calendars shown, in order:
 //   { uid, id, key, item, feed, kind, title, start, end, allDay, day, done, tone, priority, by, repeat }
 times(from, to) {
  const out = [];
  for (const item of this.view.items) {
   if (!item.date) continue;
   for (const time of Core.occurrences(item, from, to, { limit: 400 })) out.push(this.time(item, time, null));
  }
  for (const feed of this.view.feeds) {
   if (!feed.on) continue;
   for (const entry of feed.entries || []) {
    if (!entry.date || !entry.title) continue;
    for (const time of Core.occurrences(entry, from, to, { limit: 200 })) out.push(this.time(entry, time, feed));
   }
  }
  return out.sort((a, b) => (b.allDay - a.allDay) || a.start - b.start || a.title.localeCompare(b.title));
 }

 time(item, time, feed) {
  const id = feed ? `${feed.id}:${item.uid || item.title}` : item.id;
  const done = item.kind === 'task' && (item.rule ? (item.doneKeys || []).includes(time.key) : !!item.done);
  return {
   uid: `${id}|${time.key}`, id, key: time.key, item, feed, kind: item.kind || 'event', title: time.title || item.title,
   start: time.start, end: item.kind === 'task' && !item.dur && !time.allDay ? time.start + 30 * 60000 : time.end, allDay: time.allDay, day: time.day, done, by: item.by || '', repeat: !!item.rule,
   tone: feed ? feed.tone : this.tag(item.tag)?.tone || '', tag: feed ? null : this.tag(item.tag), priority: item.priority || 0,
  };
 }

 // The user's tasks with no day, waiting in the list.
 undated() {
  return this.view.items.filter(item => item.kind === 'task' && !item.date);
 }

 // Tasks whose day has passed and that are not done. A repeat that was missed is not one: a habit's missed day is gone,
 // it does not pile up.
 overdue(now = Date.now()) {
  const today = Core.dayKey(Core.toWall(now));
  return this.view.items.filter(item => item.kind === 'task' && item.date && !item.rule && !item.done && item.date < today)
   .map(item => this.time(item, Core.occurrences(item, 0, 8.64e15, { limit: 1 })[0] || { key: item.date, start: 0, end: 0, allDay: !item.time, day: item.date }, null));
 }

 // Changes. Each returns what desktop/calendar.js answered; `undoable` leaves how to take it back.
 async add(data, { undoable = true } = {}) {
  const answer = await bridge.add(data);
  if (answer?.item && undoable) this.remember(() => bridge.remove(answer.item.id));
  return answer;
 }

 async update(id, changes, { undoable = true } = {}) {
  const before = this.item(id);
  const answer = await bridge.update(id, changes);
  if (answer?.item && before && undoable) this.remember(() => bridge.restore(before));
  return answer;
 }

 async remove(id, { undoable = true } = {}) {
  const before = this.item(id);
  const answer = await bridge.remove(id);
  if (answer?.ok && before && undoable) this.remember(() => bridge.restore(before));
  return answer;
 }

 // One time of an entry ticked off or back. A repeat keeps the times done by their keys.
 async done(item, key, value = true, options) {
  if (!item || item.kind !== 'task') return null;
  if (item.rule) {
   const keys = new Set(item.doneKeys || []);
   if (value) keys.add(key); else keys.delete(key);
   return this.update(item.id, { doneKeys: [...keys] }, options);
  }
  return this.update(item.id, { done: value }, options);
 }

 // One time of a repeat moved (or the entry itself, when it does not repeat): a new day, time or length.
 async move(item, key, { date, time, dur, days }, { all = false, ...options } = {}) {
  if (!item) return null;
  if (item.rule && !all) {
   const moved = { ...(item.moved || {}) };
   const was = moved[key] || {};
   moved[key] = { ...was, ...(date !== undefined ? { date } : {}), ...(time !== undefined ? { time } : {}), ...(dur !== undefined ? { dur: time === null ? days ?? 1 : dur } : {}) };
   return this.update(item.id, { moved }, options);
  }
  const changes = {};
  if (date !== undefined) changes.date = date;
  if (time !== undefined) changes.time = time;
  if (dur !== undefined) changes.dur = dur;
  if (days !== undefined) changes.days = days;
  return this.update(item.id, changes, options);
 }

 // One time of a repeat left out.
 async skip(item, key, options) {
  const exdates = [...new Set([...(item.exdates || []), key])];
  return this.update(item.id, { exdates }, options);
 }

 remember(revert) {
  this.undo.push(revert);
  if (this.undo.length > UNDO_MOST) this.undo.shift();
 }

 async takeBack() {
  const revert = this.undo.pop();
  if (!revert) return false;
  await revert();
  return true;
 }

 // Tags. The first time the calendar opens it has a few to start with, in the user's language.
 async seedTags(names) {
  if (this.view.tags.length) return;
  await bridge.tags(names.map((name, k) => ({ name, tone: TONES[k % TONES.length] })));
 }

 async tagNamed(name) {
  const clean = String(name || '').trim().replace(/^#/, '').slice(0, 40);
  if (!clean) return null;
  const found = this.view.tags.find(tag => tag.name.toLowerCase() === clean.toLowerCase());
  if (found) return found;
  const tone = TONES.find(one => !this.view.tags.some(tag => tag.tone === one)) || TONES[this.view.tags.length % TONES.length];
  const answer = await bridge.tags([...this.view.tags, { name: clean[0].toUpperCase() + clean.slice(1), tone }]);
  return answer?.tags?.find(tag => tag.name.toLowerCase() === clean.toLowerCase()) || null;
 }

 setTags(tags) { return bridge.tags(tags); }
 snooze(id, key, minutes) { return bridge.snooze(id, key, minutes); }
 connect(data) { return bridge.feed(data); }
 feedUpdate(id, changes) { return bridge.feedUpdate(id, changes); }
 feedRemove(id) { return bridge.feedRemove(id); }
 feedRefresh(id) { return bridge.feedRefresh(id); }
 importFile() { return bridge.import(); }
}

window.CalendarStore = new Store();
window.CalendarStore.TONES = TONES;
})();
