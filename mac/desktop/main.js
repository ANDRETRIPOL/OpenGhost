'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const Tools = require('./tools');
const Browser = require('./browser');

const APP_ID = 'com.openghost.app';
const ROOT = path.join(__dirname, '..');
const ICON = path.join(__dirname, 'icon.png');
const CHAT_BG = '#191919';
const TITLE_BAR = { height: 36, symbolColor: '#9a9a9a' };
const STORE_KEY = /^[a-z0-9-]+(\/[a-z0-9-]+)?$/;

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
app.setAppUserModelId(APP_ID);
nativeTheme.themeSource = 'dark';
Menu.setApplicationMenu(null);

function createShortcut() {
 const link = path.join(app.getPath('desktop'), 'OpenGhost.lnk');
 const ok = shell.writeShortcutLink(link, 'create', {
  target: process.execPath,
  args: `"${ROOT}"`,
  cwd: ROOT,
  icon: ICON,
  iconIndex: 0,
  appUserModelId: APP_ID,
  description: 'OpenGhost',
 });
 console.log(ok ? `Shortcut: ${link}` : 'Could not create the shortcut');
}

const storeDir = () => path.join(app.getPath('userData'), 'store');
const writes = new Map();

function storeFile(key) {
 if (typeof key !== 'string' || !STORE_KEY.test(key)) throw new Error(`Bad store key: ${key}`);
 return path.join(storeDir(), `${key}.json`);
}

async function readStore(key) {
 try {
  return JSON.parse(await fs.promises.readFile(storeFile(key), 'utf8'));
 } catch (error) {
  if (error.code === 'ENOENT') return null;
  throw error;
 }
}

function writeStore(key, value) {
 const file = storeFile(key), data = JSON.stringify(value);
 const next = (writes.get(file) || Promise.resolve()).catch(() => {}).then(async () => {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  await fs.promises.writeFile(temp, data, 'utf8');
  await fs.promises.rename(temp, file);
 });
 writes.set(file, next);
 next.finally(() => { if (writes.get(file) === next) writes.delete(file); }).catch(() => {});
 return next;
}

async function removeStore(key) {
 const file = storeFile(key);
 await (writes.get(file) || Promise.resolve()).catch(() => {});
 await fs.promises.rm(file, { force: true });
}

function external(url) {
 if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
}

function createWindow() {
 const win = new BrowserWindow({
  width: 1280,
  height: 840,
  minWidth: 760,
  minHeight: 540,
  show: false,
  title: 'OpenGhost',
  icon: ICON,
  backgroundColor: CHAT_BG,
  titleBarStyle: 'hidden',
  titleBarOverlay: { color: CHAT_BG, symbolColor: TITLE_BAR.symbolColor, height: TITLE_BAR.height },
  webPreferences: {
   preload: path.join(__dirname, 'preload.js'),
   contextIsolation: true,
   sandbox: true,
   spellcheck: true,
   webviewTag: true,
  },
 });
 win.once('ready-to-show', () => win.show());
 win.webContents.on('will-attach-webview', (event, prefs, params) => {
  if (!Browser.guard(win.webContents, prefs, params)) event.preventDefault();
 });
 win.webContents.on('did-attach-webview', (event, guest) => Browser.adopt(win.webContents, guest));
 win.webContents.setWindowOpenHandler(({ url }) => {
  external(url);
  return { action: 'deny' };
 });
 win.webContents.on('will-navigate', (event, url) => {
  if (url === win.webContents.getURL()) return;
  event.preventDefault();
  external(url);
 });
 win.webContents.on('before-input-event', (event, input) => {
  if (input.type !== 'keyDown') return;
  const key = input.key.toLowerCase();
  const command = input.meta || input.control;
  if (key === 'f12' || (command && input.shift && key === 'i') || (input.meta && input.alt && key === 'i')) {
   win.webContents.toggleDevTools();
   event.preventDefault();
  } else if (key === 'f5' || (command && !input.shift && key === 'r')) {
   win.webContents.reload();
   event.preventDefault();
  }
 });
 win.loadFile(path.join(ROOT, 'index.html'));
 return win;
}

ipcMain.handle('folder:pick', async event => {
 const win = BrowserWindow.fromWebContents(event.sender);
 const result = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory', 'promptToCreate'] });
 if (result.canceled || !result.filePaths.length) return null;
 const folder = result.filePaths[0];
 await fs.promises.mkdir(folder, { recursive: true });
 return { path: folder, name: path.basename(folder) || folder };
});

ipcMain.handle('folder:reveal', (event, folder) => typeof folder === 'string' && shell.openPath(folder));
ipcMain.handle('store:read', (event, key) => readStore(key));
ipcMain.handle('store:write', (event, key, value) => writeStore(key, value));
ipcMain.handle('store:remove', (event, key) => removeStore(key));
ipcMain.on('window:titlebar', (event, color) => {
 const win = BrowserWindow.fromWebContents(event.sender);
 if (win && typeof win.setTitleBarOverlay === 'function' && typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) win.setTitleBarOverlay({ color, symbolColor: TITLE_BAR.symbolColor, height: TITLE_BAR.height });
});

const fromApp = event => event.sender.getType() === 'window' && event.senderFrame?.url.startsWith('file:');
ipcMain.handle('tool:run', (event, id, name, args, cwd) => fromApp(event) ? Tools.runTool(id, name, args, cwd, event.sender) : { error: 'Not allowed' });
ipcMain.on('browser:shown', (event, value) => { if (fromApp(event)) Browser.setShown(value); });
ipcMain.handle('tool:cancel', (event, id) => { if (fromApp(event)) Tools.cancel(id); });
ipcMain.handle('tool:environment', event => fromApp(event) ? Tools.environment() : null);

if (process.argv.includes('--create-shortcut')) {
 app.whenReady().then(() => {
  createShortcut();
  app.quit();
 });
} else if (!app.requestSingleInstanceLock()) {
 app.quit();
} else {
 let win = null;
 app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
 });
 app.whenReady().then(() => {
  Browser.setup();
  win = createWindow();
  win.on('closed', () => {
   win = null;
   Tools.cancelAll();
  });
 });
 app.on('window-all-closed', () => app.quit());
 app.on('before-quit', event => {
  Tools.cancelAll();
  if (!writes.size) return;
  event.preventDefault();
  Promise.allSettled([...writes.values()]).then(() => app.quit());
 });
}
