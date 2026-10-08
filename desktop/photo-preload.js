'use strict';

// The bridge of the quick chat's photo window (quick-photo.html): what to show, when the window stands ready, and what
// the page says back.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('photoView', {
 onShow: callback => ipcRenderer.on('photo:show', (event, data) => callback(data)),
 onPlaced: callback => ipcRenderer.on('photo:placed', () => callback()),
 onLeave: callback => ipcRenderer.on('photo:leave', () => callback()),
 size: (width, height) => ipcRenderer.send('photo:size', width, height),
 turned: index => ipcRenderer.send('photo:turned', index),
 close: index => ipcRenderer.send('photo:close', index),
});
