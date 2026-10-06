'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const Tools = require('./tools');
const Browser = require('./browser');
const LLM = require('./llm');
const Keys = require('./keys');
const Pdf = require('./pdf');
const Size = require('./size');

const APP_ID = 'com.openghost.app';
const ROOT = path.join(__dirname, '..');
// Windows takes the .ico; macOS and Linux take the .png.
const ICON = path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const TITLE_BAR = { height: 36 };
// The theme picked in Settings → Appearance. The window is painted before the page loads,
// so these colors repeat --chat-bg and --titlebar-symbols from styles.css.
const THEMES = {
 choices: ['system', 'light', 'dark'],
 dark: { background: '#191919', symbols: '#9a9a9a' },
 light: { background: '#ffffff', symbols: '#5c5c5c' },
};
const STORE_KEY = /^[a-z0-9-]+(\/[a-z0-9-]+)?$/;

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
app.setAppUserModelId(APP_ID);
// Windows and Linux show no menu bar: copying, pasting and undo work in the page by themselves. macOS delivers Cmd+C, Cmd+V,
// Cmd+A, Cmd+Z, Cmd+Q, Cmd+H and Cmd+M only through the menu at the top of the screen, so there the app keeps the standard
// app, edit and window menus.
Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null);

const themeFile = () => path.join(app.getPath('userData'), 'theme.json');

function readTheme() {
 try {
  const { choice } = JSON.parse(fs.readFileSync(themeFile(), 'utf8'));
  if (THEMES.choices.includes(choice)) return choice;
 } catch {}
 return 'dark';
}

// 'system' lets the page and the sites in the built-in browser follow the computer; light and dark hold them to one look.
nativeTheme.themeSource = readTheme();
const look = () => THEMES[nativeTheme.shouldUseDarkColors ? 'dark' : 'light'];

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
 const size = Size.initial(1280, 840);
 const win = new BrowserWindow({
  width: size.width,
  height: size.height,
  minWidth: 760,
  minHeight: 540,
  show: false,
  title: 'OpenGhost',
  icon: ICON,
  backgroundColor: look().background,
  // Linux window managers draw their own title bar; Windows and macOS get the app's own.
  ...(process.platform === 'linux' ? {} : {
   titleBarStyle: 'hidden',
   titleBarOverlay: { color: look().background, symbolColor: look().symbols, height: Math.round(TITLE_BAR.height * size.zoom) },
  }),
  webPreferences: {
   zoomFactor: size.zoom,
   preload: path.join(__dirname, 'preload.js'),
   contextIsolation: true,
   sandbox: true,
   spellcheck: true,
   webviewTag: true,
  },
 });
 win.once('ready-to-show', () => win.show());
 Size.attach(win);
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
  // Cmd on macOS, Ctrl elsewhere.
  const command = input.meta || input.control;
  if (key === 'f12' || (command && input.shift && key === 'i') || (input.meta && input.alt && key === 'i')) {
   win.webContents.toggleDevTools();
   event.preventDefault();
  } else if (key === 'f5' || (command && !input.shift && key === 'r')) {
   win.webContents.reload();
   event.preventDefault();
  } else if (command && !input.alt && (key === '=' || key === '+' || key === '-' || key === '0')) {
   if (key === '0') Size.pick(win, 'auto');
   else Size.step(win, key === '-' ? -1 : 1);
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
ipcMain.handle('folder:chats', () => Tools.CHATS);
ipcMain.handle('folder:release', (event, folder) => fromApp(event) && Tools.release(folder));
ipcMain.handle('store:read', (event, key) => readStore(key));
ipcMain.handle('store:write', (event, key, value) => writeStore(key, value));
ipcMain.handle('store:remove', (event, key) => removeStore(key));
// The page sends its background once it opens and whenever the theme changes: the title bar buttons sit on it,
// and the window shows it wherever the page has not painted yet, as while resizing.
ipcMain.on('window:titlebar', (event, color, symbols) => {
 const win = BrowserWindow.fromWebContents(event.sender);
 const hex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
 if (!win || !hex(color)) return;
 win.setBackgroundColor(color);
 if (process.platform === 'linux' || typeof win.setTitleBarOverlay !== 'function') return;
 win.setTitleBarOverlay({ color, symbolColor: hex(symbols) ? symbols : look().symbols, height: Size.titleBar(win) });
});

const fromApp = event => event.sender.getType() === 'window' && event.senderFrame?.url.startsWith('file:');
// macOS asks the user before an app first opens Desktop, Documents, Downloads or another disk, whatever the agent's own
// permission mode says; no app can answer for the user. With Full Disk Access given to OpenGhost once it no longer asks.
// Whether it is given can only be told by trying: the system's own record of permissions is readable with it alone.
const FULL_DISK = 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles';
function diskAccess() {
 if (process.platform !== 'darwin') return null;
 try {
  fs.accessSync(path.join(app.getPath('home'), 'Library', 'Application Support', 'com.apple.TCC', 'TCC.db'), fs.constants.R_OK);
  return { full: true };
 } catch {
  return { full: false };
 }
}
ipcMain.handle('access:state', event => fromApp(event) ? diskAccess() : null);
ipcMain.handle('access:open', event => { if (fromApp(event) && process.platform === 'darwin') shell.openExternal(FULL_DISK); });

// Answers whether the app ends up dark: for 'system' only this side knows what the computer uses right now.
ipcMain.handle('theme:set', (event, choice) => {
 if (fromApp(event) && THEMES.choices.includes(choice) && nativeTheme.themeSource !== choice) {
  nativeTheme.themeSource = choice;
  fs.promises.writeFile(themeFile(), JSON.stringify({ choice })).catch(() => {});
 }
 return nativeTheme.shouldUseDarkColors;
});
ipcMain.handle('tool:run', (event, id, name, args, cwd) => fromApp(event) ? Tools.runTool(id, name, args, cwd, event.sender) : { error: 'Not allowed' });
ipcMain.on('browser:shown', (event, value) => { if (fromApp(event)) Browser.setShown(value); });
ipcMain.handle('tool:cancel', (event, id) => { if (fromApp(event)) Tools.cancel(id); });
ipcMain.handle('tool:environment', event => fromApp(event) ? Tools.environment() : null);
ipcMain.handle('tool:guide', (event, folder) => fromApp(event) ? Tools.guide(folder) : null);
ipcMain.handle('pdf:read', (event, source) => fromApp(event) ? Pdf.read(source) : { text: '', reason: 'unreadable' });
LLM.register(fromApp);
Keys.register(fromApp);
Size.setup(fromApp);

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
  Keys.load();
  win = createWindow();
  win.on('closed', () => {
   win = null;
   Tools.cancelAll();
   LLM.cancelAll();
   Pdf.cancelAll();
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
