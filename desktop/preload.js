'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('openghost', {
 desktop: true,
 platform: process.platform,
 glass: process.argv.includes('--openghost-glass'),
 // The quick chat. Whether this window is its own, and the clear room that window keeps round the chat's card (above
 // it, at its sides, below it); its settings; what its window and the main one tell each other.
 quick: process.argv.includes('--openghost-quick'),
 quickRoom: (found => found ? found.slice(found.indexOf('=') + 1).split(',').map(Number) : null)(process.argv.find(item => item.startsWith('--openghost-quick-room='))),
 quickChat: {
  get: () => ipcRenderer.invoke('quick:get'),
  set: next => ipcRenderer.invoke('quick:set', next),
  // The quick window's page: put the window away, the card has gone, the pointer is over the card or clear of it, the
  // card is dragged by its head, the card's new size, this chat goes on in the app, the app's settings are wanted.
  hide: () => ipcRenderer.send('quick:hide'),
  gone: () => ipcRenderer.send('quick:gone'),
  over: over => ipcRenderer.send('quick:over', !!over),
  drag: (phase, dx = 0, dy = 0) => ipcRenderer.send('quick:drag', phase, dx, dy),
  size: (size, done) => ipcRenderer.send('quick:size', size, !!done),
  expand: id => ipcRenderer.send('quick:expand', id),
  settings: what => ipcRenderer.send('quick:settings', what),
  working: working => ipcRenderer.send('quick:working', !!working),
  // A photo opened large stands in a window of its own: what to show, stop showing, and what that window says back.
  photo: data => ipcRenderer.send('quick:photo', data),
  photoClose: () => ipcRenderer.send('quick:photo-close'),
  onPhotoTurned: callback => ipcRenderer.on('quick:photo-turned', (event, index) => callback(index)),
  onPhotoClosed: callback => ipcRenderer.on('quick:photo-closed', (event, index) => callback(index)),
  onShown: callback => ipcRenderer.on('quick:shown', (event, data) => callback(data)),
  onAway: callback => ipcRenderer.on('quick:away', () => callback()),
  onClaim: callback => ipcRenderer.on('quick:claim', async (event, id, chat) => {
   let held = false;
   try { held = await callback(chat); } catch {}
   ipcRenderer.send('quick:answer', id, held === true);
  }),
  // The main window's page: whether the quick window keeps a chat (its agent is at work in it there), a chat sent on
  // from the quick window, the settings asked for from there.
  claim: id => ipcRenderer.invoke('quick:claim', id),
  onOpen: callback => ipcRenderer.on('quick:open', (event, id) => callback(id)),
  onSettings: callback => ipcRenderer.on('quick:settings', (event, what) => callback(what)),
 },
 // Where a dropped or picked file lives on disk, so the agent can open it again later.
 pathOf: file => {
  try { return webUtils.getPathForFile(file) || ''; } catch { return ''; }
 },
 // A PDF's text, by its place on the disk or by its bytes; the viewer that reads it lives in the main process.
 readPdf: source => ipcRenderer.invoke('pdf:read', source),
 pickFolder: () => ipcRenderer.invoke('folder:pick'),
 revealFolder: folder => ipcRenderer.invoke('folder:reveal', folder),
 // Where chats started without a project folder keep their own folders, and letting go of one that stayed empty.
 chatsFolder: () => ipcRenderer.invoke('folder:chats'),
 releaseFolder: folder => ipcRenderer.invoke('folder:release', folder),
 setTitleBar: (color, symbols) => ipcRenderer.send('window:titlebar', color, symbols),
 setTheme: choice => ipcRenderer.invoke('theme:set', choice),
 // The language the page speaks, for what the main process itself puts on screen; and what the About page shows.
 lang: { set: next => ipcRenderer.invoke('lang:set', next) },
 about: () => ipcRenderer.invoke('app:about'),
 // How large the app is drawn: fitted to the screen ('auto') or a size picked by hand (see desktop/size.js).
 size: {
  get: () => ipcRenderer.invoke('size:get'),
  set: choice => ipcRenderer.invoke('size:set', choice),
  onChange: callback => ipcRenderer.on('size:changed', (event, state) => callback(state)),
 },
 // On a Mac: whether the system lets the app into every folder without asking, and the system's page where that is set.
 access: {
  state: () => ipcRenderer.invoke('access:state'),
  open: () => ipcRenderer.invoke('access:open'),
  restart: () => ipcRenderer.invoke('access:restart'),
 },
 store: {
  read: key => ipcRenderer.invoke('store:read', key),
  write: (key, value) => ipcRenderer.invoke('store:write', key, value),
  remove: key => ipcRenderer.invoke('store:remove', key),
  // Another window of the app wrote this key.
  onChange: callback => ipcRenderer.on('store:changed', (event, key) => callback(key)),
 },
 tools: {
  run: (id, name, args, cwd) => ipcRenderer.invoke('tool:run', id, name, args, cwd),
  cancel: id => ipcRenderer.invoke('tool:cancel', id),
  environment: () => ipcRenderer.invoke('tool:environment'),
  guide: folder => ipcRenderer.invoke('tool:guide', folder),
 },
 browser: {
  onEvent: callback => ipcRenderer.on('browser:event', (event, data) => callback(data)),
  shown: value => ipcRenderer.send('browser:shown', value),
 },
 llm: {
  start: (id, request) => ipcRenderer.send('llm:start', id, request),
  abort: id => ipcRenderer.send('llm:abort', id),
  onEvent: callback => ipcRenderer.on('llm:event', (event, data) => callback(data)),
  models: (provider, key) => ipcRenderer.invoke('llm:models', provider, key),
  account: (provider, key) => ipcRenderer.invoke('llm:account', provider, key),
 },
 // The keys come from the main process's memory, read before the window opened, so asking for them never waits on the disk.
 keys: {
  read: () => ipcRenderer.sendSync('keys:read'),
  write: (provider, key) => ipcRenderer.invoke('keys:write', provider, key),
 },
 auth: {
  login: () => ipcRenderer.invoke('auth:login'),
  cancel: () => ipcRenderer.invoke('auth:cancel'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  status: () => ipcRenderer.invoke('auth:status'),
  limits: () => ipcRenderer.invoke('auth:limits'),
 },
});
