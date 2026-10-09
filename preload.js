const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scratchPad', {
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  exportNotes: (content) => ipcRenderer.invoke('export-notes', content),
  importPickFile: () => ipcRenderer.invoke('import-pick-file'),
  confirmClose: (payload) => ipcRenderer.invoke('confirm-close', payload),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  pickExportFolder: () => ipcRenderer.invoke('pick-export-folder'),
  resetExportFolder: () => ipcRenderer.invoke('reset-export-folder'),
  setFontSize: (size) => ipcRenderer.invoke('set-font-size', size),
  setFontFamily: (family) => ipcRenderer.invoke('set-font-family', family),
  setBackupOptions: (opts) => ipcRenderer.invoke('set-backup-options', opts),
  pickBackupFolder: () => ipcRenderer.invoke('pick-backup-folder'),
  resetBackupFolder: () => ipcRenderer.invoke('reset-backup-folder'),
  openBackupFolder: () => ipcRenderer.invoke('open-backup-folder'),
  backupNow: (data) => ipcRenderer.invoke('backup-now', data),
  restoreBackup: (current) => ipcRenderer.invoke('restore-backup', current),
  onBackupStatus: (handler) => {
    ipcRenderer.on('backup-status', (_e, status) => handler(status));
  },
  onAppCloseRequest: (handler) => {
    ipcRenderer.on('app-close-request', () => handler());
  },
  respondAppClose: (shouldClose) => ipcRenderer.send('app-close-response', shouldClose),
});
