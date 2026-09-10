const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let allowClose = false;
const DATA_FILE = () => path.join(app.getPath('userData'), 'scratchpad.json');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 1,
    minHeight: 1,
    resizable: true,
    maximizable: true,
    title: 'Scratch Pad Portable',
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');

  mainWindow.on('close', (e) => {
    if (allowClose) return;
    e.preventDefault();
    mainWindow.webContents.send('app-close-request');
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.on('app-close-response', (_event, shouldClose) => {
  if (!shouldClose || !mainWindow) return;
  allowClose = true;
  mainWindow.close();
});

ipcMain.handle('confirm-close', async (_event, message) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Close and save', 'Close without saving', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    title: 'Scratch Pad Portable',
    message: message || 'Do you want to save your notes before closing?',
    detail: 'Close and save writes a text file to Downloads (same as Export).',
    noLink: true,
  });
  if (result.response === 0) return 'save';
  if (result.response === 1) return 'discard';
  return 'cancel';
});

ipcMain.handle('load-data', async () => {
  try {
    const file = DATA_FILE();
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to load scratchpad data:', e);
  }
  return null;
});

ipcMain.handle('save-data', async (_event, data) => {
  try {
    const file = DATA_FILE();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    return { ok: true };
  } catch (e) {
    console.error('Failed to save scratchpad data:', e);
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('export-notes', async (_event, content) => {
  try {
    const downloads = app.getPath('downloads');
    const dateStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
    const filename = `Scratch Pad Portable Export ${dateStr}.txt`;
    const fullPath = path.join(downloads, filename);
    const normalized = content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    fs.writeFileSync(fullPath, normalized, 'utf8');
    return { ok: true, path: fullPath };
  } catch (e) {
    console.error('Export failed:', e);
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('import-pick-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Scratch Pad Portable Notes',
    filters: [{ name: 'Text Files', extensions: ['txt'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) {
    return { ok: false, canceled: true };
  }
  try {
    const text = fs.readFileSync(result.filePaths[0], 'utf8');
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});
