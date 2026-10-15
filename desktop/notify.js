'use strict';

// A reply that came while the user was not looking at it (the window put away or behind others, or another chat on
// screen): the system's notification says so, and the app's icon counts how many such replies wait to be read, across
// every chat and the mini and quick chats. Only an agent's finished reply counts, never its steps on the way. The
// pages tell which replies came and which were seen (notify.js); here they are counted. Whether there are
// notifications at all and whether they make a sound are the user's choice, kept in notify.json.
const fs = require('node:fs');
const path = require('node:path');
const { app, ipcMain, Notification, nativeImage } = require('electron');

const TITLE = 60;
const BODY = 180;
const DEFAULTS = { on: true, sound: true };

let state = { ...DEFAULTS };
let host = null;
// What waits to be read: a key of the pages' (`chat:<id>`, `mini:<id>`) and how many replies came there.
const unseen = new Map();
// A notification shown is kept until it is done with, or it may be gone before it is pressed.
const shown = new Set();

const file = () => path.join(app.getPath('userData'), 'notify.json');
const clip = (text, max) => {
 const words = String(text || '').replace(/\s+/g, ' ').trim();
 return words.length > max ? `${words.slice(0, max - 1).trimEnd()}…` : words;
};

function load() {
 try {
  const saved = JSON.parse(fs.readFileSync(file(), 'utf8'));
  state = { on: saved.on !== false, sound: saved.sound !== false };
 } catch {}
}

function save() {
 fs.promises.writeFile(file(), JSON.stringify(state)).catch(() => {});
}

function total() {
 let count = 0;
 for (const value of unseen.values()) count += value;
 return count;
}

// The count on the app's icon. Windows has no count of its own for an app: a small round mark with the number is laid
// over the icon in the taskbar, drawn by the main window's page. macOS and Linux show the count themselves.
async function paint() {
 const count = total();
 if (process.platform !== 'win32') {
  try { app.setBadgeCount(count); } catch {}
  return;
 }
 const win = host?.window();
 if (!win || win.isDestroyed()) return;
 if (!count) { win.setOverlayIcon(null, ''); return; }
 const url = await win.webContents.executeJavaScript(`window.Notify?.mark(${count}) || ''`).catch(() => '');
 if (!url || win.isDestroyed() || total() !== count) return;
 win.setOverlayIcon(nativeImage.createFromDataURL(url), count === 1 ? '1 new reply' : `${count} new replies`);
}

function reply(key, title, text) {
 if (!state.on) return { sound: false };
 unseen.set(key, (unseen.get(key) || 0) + 1);
 paint();
 if (Notification.isSupported()) {
  const note = new Notification({ title: clip(title, TITLE) || 'OpenGhost', body: clip(text, BODY), silent: true, icon: host.icon });
  const done = () => shown.delete(note);
  note.on('click', () => { done(); host.open(key); });
  note.on('close', done);
  note.on('failed', done);
  shown.add(note);
  note.show();
 }
 return { sound: state.sound };
}

function seen(keys) {
 let changed = false;
 for (const key of keys) changed = unseen.delete(key) || changed;
 if (changed) paint();
}

// host: { fromApp, window() (the main window, or null), icon, open(key) (shows the app on that chat) }.
function setup(options) {
 host = options;
 load();
 ipcMain.handle('notify:get', event => host.fromApp(event) ? { ...state } : null);
 ipcMain.handle('notify:set', (event, next) => {
  if (!host.fromApp(event) || !next || typeof next !== 'object') return null;
  state = { on: next.on !== false, sound: next.sound !== false };
  save();
  if (!state.on) { unseen.clear(); paint(); }
  return { ...state };
 });
 ipcMain.handle('notify:reply', (event, key, title, text) => host.fromApp(event) && typeof key === 'string' ? reply(key, String(title || ''), String(text || '')) : { sound: false });
 ipcMain.on('notify:seen', (event, keys) => { if (host.fromApp(event) && Array.isArray(keys)) seen(keys.filter(key => typeof key === 'string')); });
}

module.exports = { setup, paint };
