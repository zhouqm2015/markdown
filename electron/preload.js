'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shellApi', {
  notifyPage: (page) => ipcRenderer.send('page-changed', page),
  onNavigate: (callback) => {
    ipcRenderer.on('navigate-page', (_event, page) => callback(page));
  },
  onReload: (callback) => {
    ipcRenderer.on('reload-content', (_event, force) => callback(!!force));
  },
});
