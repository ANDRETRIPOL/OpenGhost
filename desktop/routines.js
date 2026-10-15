'use strict';

// Routines: what the agent does by itself, on time (routine-rule.js says when). They are kept here, in the app and not in
// a window, so that they run with the window minimized, closed to the tray, or not made yet: when one is due, the main
// window is made if it is not there (unseen) and its page is told to run it in the routine's chat. While a routine is
// on the app stays in the tray when its window is closed, and the computer is kept awake (awake.js).
//
// A routine: { id, text, chat, own, effort, rule, paused, by, created, next, last, runs }. `own`: the chat was made for
// the routine (from the sidebar) and not the one it was asked for in. `next` is when it runs next: 0 for one that will
// not run again (a one-time routine that has run).
//
// Missed runs (the computer was off or asleep, or the app closed): a routine runs once when the app is back, not once
// for every run it missed, and goes on from then. Talking in a routine's chat does not move its times.
const { ipcMain, BrowserWindow, powerMonitor } = require('electron');
const path = require('node:path');
const Rule = require(path.join(__dirname, '..', 'routine-rule.js'));
const Awake = require('./awake');

const KEY = 'routines';
const TICK = 20000;
const TEXT_MAX = 2000;
const MOST = 50;

let host = null, items = [], loaded = null, timer = 0;
// Runs asked of the page but not taken yet: a page that is loading takes them once it says it is ready.
const waiting = [];
let ready = null;

const uid = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const live = item => !item.paused && item.next > 0;
const clean = text => String(text ?? '').replace(/\r\n?/g, '\n').trim().slice(0, TEXT_MAX);

function save() {
 host.store.write(KEY, { version: 1, items }).catch(() => {});
 for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('routines:changed', items);
 Awake.hold(items.some(live));
 host.changed?.();
}

function schedule(item, after = Date.now()) {
 item.next = item.paused ? item.next : Rule.next(item.rule, after);
}

// Due ones run. A routine is marked as run before the page takes it, so a page that fails can never run it twice.
function tick() {
 const now = Date.now();
 let changed = false;
 for (const item of items) {
  if (!live(item) || item.next > now) continue;
  item.last = now;
  item.runs = (item.runs || 0) + 1;
  item.next = Rule.next(item.rule, now);
  changed = true;
  deliver({ id: item.id, at: now });
 }
 if (changed) save();
}

// The run goes to the main window's page, which is made, unseen, when the app has none.
function deliver(run) {
 waiting.push(run);
 if (ready && !ready.isDestroyed()) flush();
 else host.wake();
}

function flush() {
 while (waiting.length && ready && !ready.isDestroyed()) ready.send('routines:run', waiting.shift());
}

const mine = event => host.fromApp(event);

function add(data) {
 if (items.length >= MOST) return { error: 'full' };
 const text = clean(data?.text), rule = Rule.clean(data?.rule);
 if (!text) return { error: 'text' };
 if (!rule) return { error: 'rule' };
 if (typeof data.chat !== 'string' || !data.chat) return { error: 'chat' };
 const item = {
  id: uid(), text, chat: data.chat, own: !!data.own, effort: typeof data.effort === 'string' ? data.effort : '',
  rule, paused: false, by: data.by === 'agent' ? 'agent' : 'user', created: Date.now(), next: 0, last: 0, runs: 0,
 };
 schedule(item);
 // A moment already gone: nothing would ever run.
 if (!item.next) return { error: 'past' };
 items.push(item);
 save();
 return { item };
}

function update(id, changes = {}) {
 const item = items.find(one => one.id === id);
 if (!item) return { error: 'none' };
 if ('text' in changes) {
  const text = clean(changes.text);
  if (!text) return { error: 'text' };
  item.text = text;
 }
 if ('effort' in changes && typeof changes.effort === 'string') item.effort = changes.effort;
 let moved = false;
 if ('rule' in changes) {
  const rule = Rule.clean(changes.rule);
  if (!rule) return { error: 'rule' };
  if (rule.kind === 'once' && !Rule.next(rule, Date.now())) return { error: 'past' };
  item.rule = rule;
  moved = true;
 }
 if ('paused' in changes) {
  const paused = !!changes.paused;
  if (paused !== item.paused) moved = true;
  item.paused = paused;
 }
 // Times are worked out anew only when the rule changes or the routine comes back from a pause: from now on.
 if (moved && !item.paused) item.next = Rule.next(item.rule, Date.now());
 save();
 return { item };
}

function remove(id) {
 const before = items.length;
 items = items.filter(one => one.id !== id);
 if (items.length !== before) save();
 return { ok: items.length !== before };
}

module.exports = {
 // host: { store: { read, write }, fromApp, window() — the main window if there is one, wake() — makes it, unseen, if
 // there is none }.
 setup(options) {
  host = options;
  Awake.setup({ dry: options.dry });
  loaded = host.store.read(KEY).then(data => {
   items = (Array.isArray(data?.items) ? data.items : []).filter(item => item?.id && item.rule && typeof item.chat === 'string');
   for (const item of items) if (item.paused === undefined) item.paused = false;
   Awake.hold(items.some(live));
   tick();
  }).catch(() => {});
  timer = setInterval(tick, TICK);
  // Back from sleep, or the clock changed: what is due runs now, not at the next tick.
  powerMonitor.on('resume', tick);
  powerMonitor.on('unlock-screen', tick);
  ipcMain.handle('routines:list', async event => { if (!mine(event)) return null; await loaded; return items; });
  ipcMain.handle('routines:add', async (event, data) => { if (!mine(event)) return null; await loaded; return add(data); });
  ipcMain.handle('routines:update', async (event, id, changes) => { if (!mine(event)) return null; await loaded; return update(id, changes); });
  ipcMain.handle('routines:remove', async (event, id) => { if (!mine(event)) return null; await loaded; return remove(id); });
  // A routine run now, by hand: it runs as at its time, and its times stay as they were.
  ipcMain.handle('routines:now', async (event, id) => {
   if (!mine(event)) return null;
   await loaded;
   const item = items.find(one => one.id === id);
   if (!item) return { error: 'none' };
   item.last = Date.now();
   item.runs = (item.runs || 0) + 1;
   save();
   deliver({ id: item.id, at: item.last, now: true });
   return { item };
  });
  // The chat a routine runs in is gone: its routines go with it.
  ipcMain.handle('routines:forget', async (event, chat) => {
   if (!mine(event)) return null;
   await loaded;
   const before = items.length;
   items = items.filter(one => one.chat !== chat);
   if (items.length !== before) save();
   return true;
  });
  // The main window's page has read its chats and can run routines; it says so each time it is loaded.
  ipcMain.on('routines:ready', event => {
   if (!mine(event) || event.sender !== host.window()?.webContents) return;
   ready = event.sender;
   flush();
  });
  ipcMain.handle('awake:get', event => mine(event) ? Awake.state : null);
  ipcMain.handle('awake:set', (event, next) => mine(event) && next && typeof next === 'object' ? Awake.set(next) : null);
 },
 // The main window's page is gone or being read anew: runs wait until it says it is ready again.
 unready() {
  ready = null;
 },
 // Whether the app is to stay in the tray with its window closed: a routine is on.
 get alive() {
  return items.some(live);
 },
 stop() {
  clearInterval(timer);
 },
};
