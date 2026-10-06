'use strict';

const { BrowserWindow, app, ipcMain, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

// How large the app is drawn. By itself it fits the screen it stands on: a screen with more room than Full HD, counted in
// the screen's own points (a 4K screen at 100% or 150%, a 1440p screen, a 5K iMac), draws it larger in the same proportion,
// so the chat takes the same share of it as on Full HD. A screen that is only wider (21:9) is measured by its height, and a
// screen smaller than Full HD keeps the app as it is. A size picked by hand, in Settings → Appearance or with Ctrl + and
// Ctrl − (Cmd on a Mac), holds on every screen; Ctrl 0 goes back to fitting the screen.
const BASE = { width: 1920, height: 1080 };
const FIT = { min: 1, max: 2.5, step: 0.05 };
const SIZES = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
// The window can't be made smaller than this, in the page's own points, so a larger app never gets a cramped window.
const SMALLEST = { width: 760, height: 540 };
const TITLE_BAR = 36;

const file = () => path.join(app.getPath('userData'), 'size.json');
let choice = 'auto';

function read() {
 try {
  const saved = JSON.parse(fs.readFileSync(file(), 'utf8')).choice;
  if (saved === 'auto' || SIZES.includes(saved)) choice = saved;
 } catch {}
}

function fit(display) {
 const { width, height } = display.workAreaSize;
 const scale = Math.min(width / BASE.width, height / BASE.height);
 return +(Math.round(Math.min(FIT.max, Math.max(FIT.min, scale)) / FIT.step) * FIT.step).toFixed(2);
}

const displayOf = win => screen.getDisplayMatching(win.getBounds());
const zoomOf = win => choice === 'auto' ? fit(displayOf(win)) : choice;
const titleBar = win => Math.round(TITLE_BAR * (win && !win.isDestroyed() ? win.webContents.getZoomFactor() : 1));
const state = win => ({ choice, zoom: win.webContents.getZoomFactor(), fit: fit(displayOf(win)), sizes: SIZES });

function apply(win) {
 if (!win || win.isDestroyed()) return;
 const zoom = zoomOf(win), contents = win.webContents;
 if (Math.abs(contents.getZoomFactor() - zoom) > 0.001) contents.setZoomFactor(zoom);
 const room = displayOf(win).workAreaSize;
 win.setMinimumSize(Math.min(Math.round(SMALLEST.width * zoom), Math.round(room.width * 0.9)), Math.min(Math.round(SMALLEST.height * zoom), Math.round(room.height * 0.9)));
 // The buttons of the Windows title bar grow with the page's own title bar, which is drawn at the app's size.
 if (process.platform === 'win32') try { win.setTitleBarOverlay({ height: titleBar(win) }); } catch {}
 contents.send('size:changed', state(win));
}

function pick(win, next) {
 if (next !== 'auto' && !SIZES.includes(next)) return;
 choice = next;
 fs.promises.writeFile(file(), JSON.stringify({ choice })).catch(() => {});
 for (const each of BrowserWindow.getAllWindows()) if (each.__sized) apply(each);
 return win ? state(win) : null;
}

// One step up or down from the size the window shows now, fitted or picked.
function step(win, direction) {
 const now = win.webContents.getZoomFactor();
 const next = direction > 0 ? SIZES.find(size => size > now + 0.001) : SIZES.findLast(size => size < now - 0.001);
 if (next) pick(win, next);
}

function setup(fromApp) {
 read();
 ipcMain.handle('size:get', event => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return fromApp(event) && win ? state(win) : null;
 });
 ipcMain.handle('size:set', (event, next) => fromApp(event) ? pick(BrowserWindow.fromWebContents(event.sender), next) : null);
}

let watching = false;

// A screen whose resolution or scale changes, or one plugged in or out, is fitted again. The screen module is only there
// once the app is ready, so it is watched from the first window on.
function watch() {
 if (watching) return;
 watching = true;
 const refit = () => { for (const win of BrowserWindow.getAllWindows()) if (win.__sized) apply(win); };
 screen.on('display-metrics-changed', refit);
 screen.on('display-added', refit);
 screen.on('display-removed', refit);
}

// The size the window opens with, so its first frame is drawn at it, and the window's own size grown in proportion
// (but never past the screen); both are checked again once the page is in.
function initial(width, height) {
 const display = screen.getPrimaryDisplay(), zoom = choice === 'auto' ? fit(display) : choice, room = display.workAreaSize;
 return { zoom, width: Math.min(Math.round(width * zoom), Math.round(room.width * 0.92)), height: Math.min(Math.round(height * zoom), Math.round(room.height * 0.92)) };
}

function attach(win) {
 watch();
 win.__sized = true;
 let display = displayOf(win).id;
 win.webContents.on('did-finish-load', () => apply(win));
 // A window taken to another screen fits that one.
 win.on('moved', () => {
  const now = displayOf(win).id;
  if (now === display) return;
  display = now;
  apply(win);
 });
}

module.exports = { setup, initial, attach, step, pick, titleBar, fit };
