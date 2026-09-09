const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scratchPad', {
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  exportNotes: (content) => ipcRenderer.invoke('export-notes', content),
  importPickFile: () => ipcRenderer.invoke('import-pick-file'),
  confirmClose: (message) => ipcRenderer.invoke('confirm-close', message),
  onAppCloseRequest: (handler) => {
    ipcRenderer.on('app-close-request', () => handler());
  },
  respondAppClose: (shouldClose) => ipcRenderer.send('app-close-response', shouldClose),
});
