'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const { pathToFileURL } = require('url');

contextBridge.exposeInMainWorld('api', {
  state: () => ipcRenderer.invoke('state'),
  onEvent: (cb) => ipcRenderer.on('ev', (_e, payload) => cb(payload)),
  toFileUrl: (p) => pathToFileURL(String(p)).href,

  sendText: (text) => ipcRenderer.send('send-text', text),
  pickFiles: (kind) => ipcRenderer.invoke('pick-files', kind),
  sendPaths: (paths) => ipcRenderer.invoke('send-paths', paths),
  sendImageBuffer: (buffer, name) => ipcRenderer.invoke('send-image-buffer', buffer, name),
  deleteMsg: (id, purge) => ipcRenderer.send('delete', { id, purge }),
  markSeen: (ids) => ipcRenderer.send('seen', ids),
  copyText: (t) => ipcRenderer.send('copy-text', t),
  copyImage: (p) => ipcRenderer.invoke('copy-image', p),
  openPath: (p) => ipcRenderer.send('open-path', p),
  reveal: (p) => ipcRenderer.send('reveal', p),
  saveAs: (id) => ipcRenderer.invoke('save-as', { id }),

  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  setAutostart: (on) => ipcRenderer.invoke('settings:autostart', on),
  chooseSaveDir: () => ipcRenderer.invoke('settings:save-dir'),
  chooseNic: (name) => ipcRenderer.invoke('settings:nic', name),
  clearHistory: (purgeFiles) => ipcRenderer.invoke('settings:clear', purgeFiles),
  resetToken: () => ipcRenderer.invoke('settings:reset-token'),
  openSaveDir: () => ipcRenderer.invoke('settings:open-save-dir'),
  openDataDir: () => ipcRenderer.invoke('settings:open-data-dir'),
  openFirewall: () => ipcRenderer.invoke('open-firewall'),

  setMode: (m) => ipcRenderer.send('mode', m),
  hide: () => ipcRenderer.send('hide'),
  togglePin: () => ipcRenderer.send('toggle-pin'),
});
