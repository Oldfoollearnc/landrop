'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('workspace', {
  state: () => ipcRenderer.invoke('workspace:state'),
  chatSummary: () => ipcRenderer.invoke('workspace:chat-summary'),
  openChat: () => ipcRenderer.invoke('workspace:open-chat'),
  theme: (theme) => ipcRenderer.invoke('workspace:theme', theme),
  setAutostart: (on) => ipcRenderer.invoke('workspace:autostart', on),
  window: (action) => ipcRenderer.invoke('workspace:window', action),
  onEvent: (cb) => ipcRenderer.on('workspace:event', (_e, payload) => cb(payload)),

  remote: {
    state: () => ipcRenderer.invoke('remote:state'),
    discover: () => ipcRenderer.invoke('remote:discover'),
    agent: (on) => ipcRenderer.invoke('remote:agent', on),
    refreshCode: () => ipcRenderer.invoke('remote:refresh-code'),
    connect: (peerId, code, chatOnly) => ipcRenderer.invoke('remote:connect', { peerId, code, chatOnly: !!chatOnly }),
    disconnect: () => ipcRenderer.invoke('remote:disconnect'),
    input: (evt) => ipcRenderer.send('remote:input', evt),
    clipboard: (text) => ipcRenderer.send('remote:clipboard', text),
    setDisplay: (index) => ipcRenderer.send('remote:display', index),
    setQuality: (quality) => ipcRenderer.send('remote:quality', quality),
    endActive: () => ipcRenderer.invoke('remote:end-active'),
    sendDM: (peerId, text) => ipcRenderer.invoke('remote:dm', { peerId, text }),
    pickFile: () => ipcRenderer.invoke('remote:pick-file'),
    sendFilePath: (filePath) => ipcRenderer.invoke('remote:send-file', filePath),
    history: () => ipcRenderer.invoke('remote:history'),
    audit: () => ipcRenderer.invoke('remote:audit'),
    diagnostics: () => ipcRenderer.invoke('remote:diagnostics'),
    exportAudit: () => ipcRenderer.invoke('remote:export-audit'),
    exportDiag: () => ipcRenderer.invoke('remote:export-diag'),
  },
});
