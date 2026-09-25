'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('openghost', {
 desktop: true,
 pickFolder: () => ipcRenderer.invoke('folder:pick'),
 revealFolder: folder => ipcRenderer.invoke('folder:reveal', folder),
 setTitleBar: color => ipcRenderer.send('window:titlebar', color),
 store: {
  read: key => ipcRenderer.invoke('store:read', key),
  write: (key, value) => ipcRenderer.invoke('store:write', key, value),
  remove: key => ipcRenderer.invoke('store:remove', key),
 },
 tools: {
  run: (id, name, args, cwd) => ipcRenderer.invoke('tool:run', id, name, args, cwd),
  cancel: id => ipcRenderer.invoke('tool:cancel', id),
  environment: () => ipcRenderer.invoke('tool:environment'),
 },
 browser: {
  onEvent: callback => ipcRenderer.on('browser:event', (event, data) => callback(data)),
  shown: value => ipcRenderer.send('browser:shown', value),
 },
});
