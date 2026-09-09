const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scratchPad', {
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  exportNotes: (content) => ipcRenderer.invoke('export-notes', content),
  importPickFile: () => ipcRenderer.invoke('import-pick-file'),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
});
