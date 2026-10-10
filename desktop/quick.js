'use strict';

// The quick chat: a small window of its own that a key combination brings up over whatever is on screen, with the main
// window open or not. For that the app stays in the tray once its window is closed. The window is made once and then
// only shown and hidden, so it comes at once, and an agent at work in it goes on while it is out of sight. With no
// agent at work a window out of sight sleeps: its page draws nothing and runs next to nothing.
//
// The window is the size of the chat's card and the clear room round it that the card's shadow falls into; it has no
// frame and no ground of its own. The page draws the card in it (quick-chat.js) and holds the pointer when the card is
// dragged by its head or sized by the arc in its corner: it says how far the pointer has gone, and the window follows.
// Whatever opens over the chat opens inside this window, so it keeps to the card by itself; only a photo opened large
// has a window of its own, as it may be larger than the card.
const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, nativeImage, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const Lang = require('./lang');

// The card as it first comes and the least it shrinks to.
const CARD = { width: 380, height: 540, minWidth: 340, minHeight: 380 };
// The clear room round the card: above it, at its sides and under it. Linux has no way to let the pointer through a
// clear part of a window, so there the window is the card itself.
const ROOM = process.platform === 'linux' ? { top: 0, side: 0, bottom: 0 } : { top: 50, side: 80, bottom: 110 };
// Where the card's middle stands on the screen when nothing else is known, as shares of the screen's working area.
const SPOT = { fx: 0.5, fy: 0.46 };
const DEFAULTS = { on: true, shortcut: 'Alt+Space', startup: false, width: CARD.width, height: CARD.height, ...SPOT };
// Windows and macOS can start an app with the computer; on Linux that is the desktop's own setting.
const STARTUP = process.platform !== 'linux';
const HIDDEN = '--hidden';
// How long the page has to take the card off and draw itself empty before the window goes anyway, and how long the page
// is waited for to answer.
const LEAVE = 1000;
const ANSWER = 800;
// What a combination is made of, as Electron names it.
const MODS = ['Command', 'Control', 'Ctrl', 'Alt', 'Option', 'Shift', 'Super', 'Meta', 'CommandOrControl', 'CmdOrCtrl'];
const KEY = /^([A-Z0-9]|F([1-9]|1\d|2[0-4])|Space|Tab|Enter|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Up|Down|Left|Right|[`\-=\[\]\\;',./])$/;

const clamp = (value, low, high) => Math.min(Math.max(low, high), Math.max(low, value));
const share = value => Number.isFinite(value) ? clamp(value, 0, 1) : null;

// The page is drawn at the app's own size (zoom), which grows with the screen. The card's size and the room round it
// are kept in the page's points; the window is that many times larger on the screen.
const grown = (box, zoom) => Object.fromEntries(Object.entries(box).map(([key, value]) => [key, value * zoom]));

// The window's box for a card of this size whose middle stands at the shares fx, fy of the working area: the card keeps
// inside the area, the room round it may hang over the edge.
function boxAt(area, card, at, zoom = 1) {
 const room = grown(ROOM, zoom), wide = card.width * zoom, tall = card.height * zoom;
 const left = clamp(area.x + area.width * at.fx - wide / 2, area.x, area.x + area.width - wide);
 const top = clamp(area.y + area.height * at.fy - tall / 2, area.y, area.y + area.height - tall);
 return { x: Math.round(left - room.side), y: Math.round(top - room.top), width: Math.round(wide + 2 * room.side), height: Math.round(tall + room.top + room.bottom) };
}

// Where the card's middle is in the working area, for a window's box.
function spotOf(area, box, zoom = 1) {
 const room = grown(ROOM, zoom);
 const cx = box.x + room.side + (box.width - 2 * room.side) / 2, cy = box.y + room.top + (box.height - room.top - room.bottom) / 2;
 return { fx: clamp((cx - area.x) / area.width, 0, 1), fy: clamp((cy - area.y) / area.height, 0, 1) };
}

// The card's size as the arc asks for it, in the page's points: no smaller than it may be, and no further than the
// screen's edge from where the card's upper left corner stands.
function cardFor(area, box, size, zoom = 1) {
 const room = grown(ROOM, zoom), left = box.x + room.side, top = box.y + room.top;
 return {
  width: Math.round(clamp(Number(size.width) || 0, CARD.minWidth, (area.x + area.width - left) / zoom)),
  height: Math.round(clamp(Number(size.height) || 0, CARD.minHeight, (area.y + area.height - top) / zoom)),
 };
}

let host = null, config = { ...DEFAULTS }, win = null, tray = null, failed = false, quitting = false;
// The window is on its way out (the page is taking the card off), and when it was last seen.
let leaving = 0, lastSeen = 0, saving = 0;
// The window's box when the card was taken by its head.
let held = null;
// How large the page is drawn on the screen the window stands on.
let zoom = 1;
const waiting = new Map();
let asked = 0;
// The photo's window, the photo being looked at (where its frame stands and how large it may be), and the wait for its
// page to take the frame off. The frame may reach over this share of the screen, keeps this far from its edge, and has
// this much clear room round it for its shadow.
let photo = null, viewing = null, parting = 0;
// Whether an agent is at work in the quick window's page, and the wait before the page is let sleep once it is not.
let working = false, resting = 0;
const REST = 8000;
const REACH = 0.74, EDGE = 8, PART = 450;
const SHADE = { top: 30, side: 50, bottom: 70 };

const file = () => path.join(app.getPath('userData'), 'quick.json');
const keep = () => fs.promises.writeFile(file(), JSON.stringify(config)).catch(() => {});
const keepSoon = () => { clearTimeout(saving); saving = setTimeout(keep, 400); };

// A combination is one key with at least one of Ctrl, Alt, Shift or the system key; a function key may stand alone.
function valid(shortcut) {
 if (typeof shortcut !== 'string' || shortcut.length > 60) return false;
 const parts = shortcut.split('+'), key = parts.pop();
 return KEY.test(key) && parts.every(part => MODS.includes(part)) && new Set(parts).size === parts.length && (parts.length > 0 || /^F\d+$/.test(key));
}

function read() {
 let saved = {};
 try { saved = JSON.parse(fs.readFileSync(file(), 'utf8')) || {}; } catch {}
 return {
  on: saved.on !== false,
  shortcut: valid(saved.shortcut) ? saved.shortcut : DEFAULTS.shortcut,
  startup: !!saved.startup,
  width: Math.round(clamp(Number(saved.width) || CARD.width, CARD.minWidth, 2000)),
  height: Math.round(clamp(Number(saved.height) || CARD.height, CARD.minHeight, 2000)),
  fx: share(saved.fx) ?? SPOT.fx,
  fy: share(saved.fy) ?? SPOT.fy,
 };
}

const state = () => ({ on: config.on, shortcut: config.shortcut, startup: config.startup, failed, canStart: STARTUP && app.isPackaged, platform: process.platform });

function bind() {
 globalShortcut.unregisterAll();
 failed = false;
 if (!config.on) return;
 try { failed = !globalShortcut.register(config.shortcut, toggle); } catch { failed = true; }
}

function startup() {
 if (!STARTUP || !app.isPackaged) return;
 try { app.setLoginItemSettings({ openAtLogin: config.on && config.startup, args: [HIDDEN] }); } catch {}
}

const zoomOn = display => Number(host.zoom?.(display)) || 1;

function create() {
 zoom = zoomOn(screen.getPrimaryDisplay());
 win = new BrowserWindow({
  ...boxAt(screen.getPrimaryDisplay().workArea, config, config, zoom),
  show: false,
  // Made ahead of its first call, the page draws nothing until it is called.
  paintWhenInitiallyHidden: false,
  title: 'OpenGhost',
  icon: host.icon,
  frame: false,
  transparent: true,
  hasShadow: false,
  backgroundColor: '#00000000',
  resizable: false,
  maximizable: false,
  minimizable: false,
  fullscreenable: false,
  skipTaskbar: true,
  alwaysOnTop: true,
  webPreferences: {
   zoomFactor: zoom,
   additionalArguments: ['--openghost-quick', `--openghost-quick-room=${ROOM.top},${ROOM.side},${ROOM.bottom}`],
   preload: host.preload,
   contextIsolation: true,
   sandbox: true,
   spellcheck: true,
  },
 });
 win.setAlwaysOnTop(true, 'floating');
 if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
 win.on('close', event => {
  if (quitting) return;
  event.preventDefault();
  hide();
 });
 win.on('closed', () => { win = null; working = false; clearTimeout(resting); });
 // Dragged by its head to a new place, the window comes there the next time.
 win.on('moved', remember);
 win.webContents.setWindowOpenHandler(({ url }) => {
  host.external(url);
  return { action: 'deny' };
 });
 win.webContents.on('will-navigate', (event, url) => {
  if (url === win.webContents.getURL()) return;
  event.preventDefault();
  host.external(url);
 });
 win.webContents.on('before-input-event', (event, input) => {
  if (input.type === 'keyDown' && (input.key === 'F12' || ((input.meta || input.control) && input.shift && input.key.toLowerCase() === 'i'))) win.webContents.toggleDevTools({ mode: 'detach' });
 });
 win.loadFile(host.page);
 return win;
}

// Out of sight the page sleeps, as any hidden page does: no frames are drawn and its clocks all but stop. Only while an
// agent is at work in it is it kept awake, and a little after, so what the agent wrote is saved and the chat named.
function wake(on) {
 clearTimeout(resting);
 if (!win || win.isDestroyed()) return;
 if (on) {
  if (win.webContents.getBackgroundThrottling()) win.webContents.setBackgroundThrottling(false);
  return;
 }
 resting = setTimeout(rest, REST);
}

// Letting a page sleep wakes it when its window is out of sight (Electron shows the page to itself as it changes the
// setting), and only a window going out of sight puts it to sleep. So a window already out of sight is shown clear,
// taking no pointer and no keys, and hidden again in the same breath. Linux cannot make a window clear: there the page
// sleeps from the next time the window is put away.
function rest() {
 if (!win || win.isDestroyed() || working || win.webContents.getBackgroundThrottling()) return;
 win.webContents.setBackgroundThrottling(true);
 if (win.isVisible() || process.platform === 'linux') return;
 win.setOpacity(0);
 win.setIgnoreMouseEvents(true);
 win.showInactive();
 win.hide();
 win.setOpacity(1);
}

function remember() {
 if (!win || win.isDestroyed()) return;
 const box = win.getBounds();
 Object.assign(config, spotOf(screen.getDisplayMatching(box).workArea, box, zoom));
 keepSoon();
}

// The window comes on the screen the pointer is on, the card where it was left on a screen, drawn at the size the app
// is drawn at on that screen.
function place() {
 const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
 zoom = zoomOn(display);
 if (Math.abs(win.webContents.getZoomFactor() - zoom) > 0.001) win.webContents.setZoomFactor(zoom);
 win.setBounds(boxAt(display.workArea, config, config, zoom));
}

// Clear of the card the window is not there for the pointer: what is behind it gets the press. The pointer's moves
// still reach the page, which says when it is over the card again.
function pass(through) {
 if (!win || process.platform === 'linux') return;
 win.setIgnoreMouseEvents(through, { forward: true });
}

function show() {
 if (!config.on) return;
 if (!win) create();
 const reveal = () => {
  if (!win) return;
  // Called back while it was going, it stays.
  if (leaving) { clearTimeout(leaving); leaving = 0; }
  const shown = win.isVisible();
  if (!shown) {
   place();
   pass(false);
  }
  win.show();
  win.focus();
  win.webContents.send('quick:shown', { away: shown || !lastSeen ? 0 : Date.now() - lastSeen });
  lastSeen = Date.now();
 };
 if (win.webContents.isLoading()) win.webContents.once('did-finish-load', reveal);
 else reveal();
}

// The page takes the card off first, the way the mini chat closes, and says when it is gone.
function hide() {
 if (!win?.isVisible() || leaving) return;
 photoClosed(null);
 win.webContents.send('quick:away');
 leaving = setTimeout(gone, LEAVE);
}

function gone() {
 if (!leaving) return;
 clearTimeout(leaving);
 leaving = 0;
 lastSeen = Date.now();
 if (win && !win.isDestroyed()) win.hide();
}

function toggle() {
 if (win?.isVisible() && (win.isFocused() || photo?.isFocused()) && !leaving) hide();
 else show();
}

// Asks the quick window's page a question and waits a moment for its answer.
function ask(channel, value) {
 if (!win || win.isDestroyed() || win.webContents.isLoading()) return Promise.resolve(null);
 const id = ++asked;
 return new Promise(resolve => {
  const timer = setTimeout(() => { waiting.delete(id); resolve(null); }, ANSWER);
  waiting.set(id, answer => { clearTimeout(timer); resolve(answer); });
  win.webContents.send(channel, id, value);
 });
}

// A photo opened in the quick chat stands in a window of its own over it (quick-photo.html), so it may be larger than
// the card: a clear window the size of the photo's frame and the room its shadow falls into, its middle on the card's
// middle, kept inside the screen. Made at the first photo and then only shown and hidden.
function photoWindow() {
 if (photo) return photo;
 photo = new BrowserWindow({
  width: 400,
  height: 400,
  show: false,
  parent: win,
  title: 'OpenGhost',
  icon: host.icon,
  frame: false,
  transparent: true,
  hasShadow: false,
  backgroundColor: '#00000000',
  resizable: false,
  maximizable: false,
  minimizable: false,
  fullscreenable: false,
  skipTaskbar: true,
  alwaysOnTop: true,
  webPreferences: { zoomFactor: zoom, preload: path.join(__dirname, 'photo-preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
 });
 photo.setAlwaysOnTop(true, 'pop-up-menu');
 photo.on('close', event => {
  if (quitting) return;
  event.preventDefault();
  photoClosed(null);
 });
 const made = photo;
 photo.on('closed', () => { if (photo === made) { photo = null; viewing = null; } });
 photo.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
 photo.webContents.on('will-navigate', event => event.preventDefault());
 photo.loadFile(path.join(path.dirname(host.page), 'quick-photo.html'));
 return photo;
}

// How large a photo's frame may be, in the page's points, on the screen the chat stands on.
function photoOpen(data) {
 if (!win?.isVisible() || !data || !Array.isArray(data.items) || !data.items.length || data.items.length > 60) return;
 const items = data.items.filter(item => item && typeof item.url === 'string').map(item => ({ url: item.url, name: String(item.name || '').slice(0, 200), width: Number(item.width) || 0, height: Number(item.height) || 0 }));
 if (!items.length) return;
 const box = win.getBounds(), area = screen.getDisplayMatching(box).workArea, room = grown(ROOM, zoom);
 const max = { width: Math.floor(area.width * REACH / zoom), height: Math.floor(area.height * REACH / zoom) };
 viewing = { area, max, cx: box.x + box.width / 2, cy: box.y + room.top + (box.height - room.top - room.bottom) / 2 };
 clearTimeout(parting);
 const page = photoWindow().webContents;
 const tell = () => page.send('photo:show', { items, index: Number(data.index) || 0, theme: data.theme, label: data.label, close: data.close, prev: data.prev, next: data.next, max, shade: SHADE });
 if (page.isLoading()) page.once('did-finish-load', tell);
 else tell();
}

// The page has worked out the frame for the photo it shows: the window takes it and comes up.
function photoSize(width, height) {
 if (!viewing || !photo) return;
 const { area, max, cx, cy } = viewing;
 const wide = clamp(Number(width) || 0, 120, max.width) * zoom, tall = clamp(Number(height) || 0, 120, max.height) * zoom, shade = grown(SHADE, zoom);
 const left = clamp(cx - wide / 2, area.x + EDGE, area.x + area.width - wide - EDGE), top = clamp(cy - tall / 2, area.y + EDGE, area.y + area.height - tall - EDGE);
 if (Math.abs(photo.webContents.getZoomFactor() - zoom) > 0.001) photo.webContents.setZoomFactor(zoom);
 photo.setBounds({ x: Math.round(left - shade.side), y: Math.round(top - shade.top), width: Math.round(wide + 2 * shade.side), height: Math.round(tall + shade.top + shade.bottom) });
 if (!photo.isVisible()) photo.show();
 photo.focus();
 photo.webContents.send('photo:placed');
}

// The photo's page takes the frame off first; it says when it is gone, or the window goes without it.
function photoLeave() {
 if (!viewing || !photo) return;
 photo.webContents.send('photo:leave');
 clearTimeout(parting);
 parting = setTimeout(() => photoClosed(null), PART);
}

function photoClosed(index) {
 clearTimeout(parting);
 if (!viewing) return;
 viewing = null;
 if (photo && !photo.isDestroyed()) photo.hide();
 if (win && !win.isDestroyed()) {
  win.webContents.send('quick:photo-closed', Number.isInteger(index) ? index : null);
  if (win.isVisible() && !leaving) win.focus();
 }
}

function trayMenu() {
 return Menu.buildFromTemplate([
  { label: Lang.t('tray.open'), click: () => host.showMain() },
  { label: Lang.t('tray.quick'), accelerator: failed ? undefined : config.shortcut, click: show },
  { type: 'separator' },
  { label: Lang.t('tray.quit'), click: () => app.quit() },
 ]);
}

function dress() {
 if (!config.on) {
  tray?.destroy();
  tray = null;
  if (win) {
   const old = win;
   quitting = true;
   photo?.destroy();
   old.destroy();
   quitting = false;
   win = null;
  }
  return;
 }
 if (!host.trayIcon) return;
 if (!tray) {
  const image = nativeImage.createFromPath(host.trayIcon);
  tray = new Tray(process.platform === 'win32' ? image : image.resize({ width: 18, height: 18 }));
  tray.setToolTip('OpenGhost');
  tray.on('click', () => host.showMain());
 }
 tray.setContextMenu(trayMenu());
}

function apply(next) {
 const before = config.shortcut;
 config = { ...config, on: next.on !== false, shortcut: valid(next.shortcut) ? next.shortcut : before, startup: !!next.startup };
 bind();
 // A combination the system would not give is not kept: the one before it comes back.
 const refused = failed && config.on && config.shortcut !== before ? config.shortcut : '';
 if (refused) {
  config.shortcut = before;
  bind();
 }
 dress();
 startup();
 keep();
 return refused ? { ...state(), refused } : state();
}

function setup(options) {
 host = options;
 config = read();
 bind();
 dress();
 app.on('before-quit', () => { quitting = true; });
 app.on('will-quit', () => globalShortcut.unregisterAll());
 const fromApp = options.fromApp, mine = event => fromApp(event) && !!win && event.sender === win.webContents;
 ipcMain.handle('quick:get', event => fromApp(event) ? state() : null);
 ipcMain.handle('quick:set', (event, next) => fromApp(event) && next && typeof next === 'object' ? apply(next) : null);
 ipcMain.on('quick:hide', event => { if (mine(event)) hide(); });
 ipcMain.on('quick:gone', event => { if (mine(event)) gone(); });
 ipcMain.on('quick:over', (event, over) => { if (mine(event)) pass(!over); });
 ipcMain.on('quick:working', (event, on) => {
  if (!mine(event)) return;
  working = !!on;
  wake(working);
 });
 // The head: the page says how far the pointer has gone since it took hold, and the card goes that far, never out of
 // the screen the pointer is on. Pressed twice, the head sends the card back to where it first stood.
 ipcMain.on('quick:drag', (event, phase, dx, dy) => {
  if (!mine(event)) return;
  if (phase === 'start') { held = win.getBounds(); return; }
  if (phase === 'home') {
   Object.assign(config, SPOT);
   place();
   keep();
   return;
  }
  if (!held) return;
  if (phase !== 'move') {
   held = null;
   remember();
   return;
  }
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea, room = grown(ROOM, zoom);
  const wide = held.width - 2 * room.side, tall = held.height - room.top - room.bottom;
  const left = clamp(held.x + room.side + (Number(dx) || 0) * zoom, area.x, area.x + area.width - wide);
  const top = clamp(held.y + room.top + (Number(dy) || 0) * zoom, area.y, area.y + area.height - tall);
  win.setBounds({ x: Math.round(left - room.side), y: Math.round(top - room.top), width: held.width, height: held.height });
 });
 // The arc in the card's corner: the card takes the size asked for, its upper left corner staying in place. Pressed
 // twice, the arc gives the card the size it first came with, about its own middle.
 ipcMain.on('quick:size', (event, size, done) => {
  if (!mine(event)) return;
  if (size === null) {
   const now = win.getBounds(), spot = spotOf(screen.getDisplayMatching(now).workArea, now, zoom);
   Object.assign(config, { width: CARD.width, height: CARD.height }, spot);
   win.setBounds(boxAt(screen.getDisplayMatching(now).workArea, config, spot, zoom));
   keep();
   return;
  }
  if (!size || typeof size !== 'object') return;
  const box = win.getBounds(), area = screen.getDisplayMatching(box).workArea;
  Object.assign(config, cardFor(area, box, size, zoom));
  const next = { x: box.x, y: box.y, width: Math.round((config.width + 2 * ROOM.side) * zoom), height: Math.round((config.height + ROOM.top + ROOM.bottom) * zoom) };
  win.setBounds(next);
  if (!done) return;
  Object.assign(config, spotOf(area, next, zoom));
  keep();
 });
 ipcMain.on('quick:answer', (event, id, answer) => {
  if (!mine(event)) return;
  waiting.get(id)?.(answer);
  waiting.delete(id);
 });
 // The quick chat goes on in the main window: the quick window has let go of it, the main one opens it.
 ipcMain.on('quick:expand', (event, id) => {
  if (!mine(event) || typeof id !== 'string') return;
  hide();
  host.showMain(main => main.webContents.send('quick:open', id));
 });
 // What the quick chat has no room for (the keys of a provider, the memory) is shown in the main window's settings.
 ipcMain.on('quick:settings', (event, what) => {
  if (!mine(event)) return;
  hide();
  host.showMain(main => main.webContents.send('quick:settings', what && typeof what === 'object' ? what : {}));
 });
 // The main window is about to open a chat started in the quick window. A chat is written from one window only: if the
 // quick window's agent is at work in it, that window comes up with it instead; otherwise it lets go of the chat.
 ipcMain.handle('quick:claim', async (event, id) => {
  if (!fromApp(event) || !win || event.sender === win.webContents || typeof id !== 'string') return false;
  const held = await ask('quick:claim', id) === true;
  if (held) show();
  return held;
 });
 // A photo opened in the quick chat: the chat's page says what to show and when to stop, the photo's page says the
 // size of its frame, which photo it has turned to, and that it has gone.
 const photos = event => fromApp(event) && !!photo && event.sender === photo.webContents;
 ipcMain.on('quick:photo', (event, data) => { if (mine(event)) photoOpen(data); });
 ipcMain.on('quick:photo-close', event => { if (mine(event)) photoLeave(); });
 ipcMain.on('photo:size', (event, width, height) => { if (photos(event)) photoSize(width, height); });
 ipcMain.on('photo:turned', (event, index) => { if (photos(event) && viewing && win && Number.isInteger(index)) win.webContents.send('quick:photo-turned', index); });
 ipcMain.on('photo:close', (event, index) => { if (photos(event)) photoClosed(index); });
 // Made ahead of the first call, once the app has settled, so the first call does not wait for the page.
 if (config.on) setTimeout(() => { if (config.on && !win) create(); }, 2500);
}

// The language has changed: the tray's menu is written anew, and the quick chat's window is made anew unless it is in
// sight or its agent is at work in it (then it keeps the old language until the app opens next). Made anew, not read
// anew: a page read anew in the same window no longer gets the pointer's moves sent on to it while the window lets the
// pointer through, so it could never say the pointer is back over the card, and the card took no press again.
function relabel() {
 if (tray) tray.setContextMenu(trayMenu());
 if (!win || win.isDestroyed() || working || win.isVisible()) return;
 win.destroy();
 win = null;
 if (config.on) create();
}

module.exports = {
 setup,
 relabel,
 show,
 hide,
 toggle,
 get on() { return config.on; },
 get window() { return win; },
 get photoWindow() { return photo; },
 // Started with the computer, the app waits in the tray without its window.
 get startHidden() { return config.on && process.argv.includes(HIDDEN); },
 geometry: { CARD, ROOM, boxAt, spotOf, cardFor },
};
