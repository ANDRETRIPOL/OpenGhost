'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('openghost', {
 desktop: true,
 platform: process.platform,
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
 },
 store: {
  read: key => ipcRenderer.invoke('store:read', key),
  write: (key, value) => ipcRenderer.invoke('store:write', key, value),
  remove: key => ipcRenderer.invoke('store:remove', key),
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
