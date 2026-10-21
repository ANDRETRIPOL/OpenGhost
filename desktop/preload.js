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
 // A file or a folder of a list drawn in the chat, opened by a press on it: 'opened', 'shown' in its folder, or 'missing'.
 openPath: target => ipcRenderer.invoke('path:open', target),
 // Whether an agent is at work in this window: while one is, the window is not slowed down when it is out of sight.
 working: working => ipcRenderer.send('app:working', !!working),
 // A finished reply that came while the user was not looking (notify.js), and what has been seen since; the choice of
 // notifications and their sound; a notification pressed, which opens its chat.
 notify: {
  get: () => ipcRenderer.invoke('notify:get'),
  set: next => ipcRenderer.invoke('notify:set', next),
  reply: (key, title, text) => ipcRenderer.invoke('notify:reply', key, title, text),
  seen: keys => ipcRenderer.send('notify:seen', keys),
  onOpen: callback => ipcRenderer.on('notify:open', (event, key) => callback(key)),
 },
 // Routines (desktop/routines.js keeps them and says when one is due): what there is, a new one, a change, one taken
 // away, one run now, those of a chat that is gone; that they changed, that one is due, and that this page can run them.
 // Whether the computer is kept awake for them (desktop/awake.js).
 routines: {
  list: () => ipcRenderer.invoke('routines:list'),
  add: data => ipcRenderer.invoke('routines:add', data),
  update: (id, changes) => ipcRenderer.invoke('routines:update', id, changes),
  remove: id => ipcRenderer.invoke('routines:remove', id),
  now: id => ipcRenderer.invoke('routines:now', id),
  forget: chat => ipcRenderer.invoke('routines:forget', chat),
  onChange: callback => ipcRenderer.on('routines:changed', (event, items) => callback(items)),
  onRun: callback => ipcRenderer.on('routines:run', (event, run) => callback(run)),
  ready: () => ipcRenderer.send('routines:ready'),
  awake: {
   get: () => ipcRenderer.invoke('awake:get'),
   set: next => ipcRenderer.invoke('awake:set', next),
  },
 },
 // Skills (desktop/skills.js): those a chat in a folder can use, the instructions of one; one fetched from a link to be
 // shown to the user, then put in or let go; and that they changed.
 skills: {
  list: folder => ipcRenderer.invoke('skills:list', folder),
  read: (name, folder) => ipcRenderer.invoke('skills:read', name, folder),
  prepare: (url, name) => ipcRenderer.invoke('skills:prepare', url, name),
  commit: token => ipcRenderer.invoke('skills:commit', token),
  discard: token => ipcRenderer.invoke('skills:discard', token),
  onChange: callback => ipcRenderer.on('skills:changed', () => callback()),
 },
 // The same place's path into the clipboard, and a terminal opened there ('opened' or 'missing').
 copyPath: target => ipcRenderer.invoke('path:copy', target),
 terminalAt: target => ipcRenderer.invoke('path:terminal', target),
 // Where chats started without a project folder keep their own folders, and letting go of one that stayed empty.
 chatsFolder: () => ipcRenderer.invoke('folder:chats'),
 releaseFolder: folder => ipcRenderer.invoke('folder:release', folder),
 setTitleBar: (color, symbols) => ipcRenderer.send('window:titlebar', color, symbols),
 setTheme: choice => ipcRenderer.invoke('theme:set', choice),
 // A new version of the app (desktop/update.js): how far it has come, putting it in when it has, and each change.
 update: {
  state: () => ipcRenderer.invoke('update:state'),
  install: () => ipcRenderer.invoke('update:install'),
  onState: callback => ipcRenderer.on('update:state', (event, view) => callback(view)),
 },
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
 // The pictures the agent shows in a chat: one from the internet (with the page it is on) or an image file, kept for
 // the chat; each comes back as { url, width, height } or { error }.
 pictures: {
  web: (chat, url, page, sealed = false) => ipcRenderer.invoke('pictures:web', chat, url, page, sealed),
  file: (chat, file, sealed = false) => ipcRenderer.invoke('pictures:file', chat, file, sealed),
  // A chat with a password: the key for its pictures while it is open (base64 of 32 bytes), forgotten when locked;
  // all its pictures sealed with it or opened with it; and a fork's copies of the pictures of its chat.
  unlock: (chat, raw) => ipcRenderer.invoke('pictures:unlock', chat, raw),
  lock: chat => ipcRenderer.invoke('pictures:lock', chat),
  reseal: (chat, raw, sealing) => ipcRenderer.invoke('pictures:reseal', chat, raw, sealing),
  copy: (from, to) => ipcRenderer.invoke('pictures:copy', from, to),
 },
 // Cut, copy, paste or select all, done by the window where its keyboard is (the menu of a right click).
 edit: action => ipcRenderer.invoke('edit:do', action),
 tools: {
  run: (id, name, args, cwd) => ipcRenderer.invoke('tool:run', id, name, args, cwd),
  cancel: id => ipcRenderer.invoke('tool:cancel', id),
  environment: () => ipcRenderer.invoke('tool:environment'),
  guide: folder => ipcRenderer.invoke('tool:guide', folder),
  mark: folder => ipcRenderer.invoke('tool:mark', folder),
  changed: token => ipcRenderer.invoke('tool:changed', token),
  ports: () => ipcRenderer.invoke('tool:ports'),
 },
 browser: {
  onEvent: callback => ipcRenderer.on('browser:event', (event, data) => callback(data)),
  shown: value => ipcRenderer.send('browser:shown', value),
 },
 llm: {
  start: (id, request) => ipcRenderer.send('llm:start', id, request),
  abort: id => ipcRenderer.send('llm:abort', id),
  onEvent: callback => ipcRenderer.on('llm:event', (event, data) => callback(data)),
  models: (provider, key, extra) => ipcRenderer.invoke('llm:models', provider, key, extra),
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
