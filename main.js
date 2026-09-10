const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let allowClose = false;

const DATA_FILE = () => path.join(app.getPath('userData'), 'scratchpad.json');
const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');

function defaultSettings() {
  return { exportFolder: app.getPath('downloads') };
}

function loadSettings() {
  try {
    const file = SETTINGS_FILE();
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      const folder = typeof parsed.exportFolder === 'string' && parsed.exportFolder.trim()
        ? parsed.exportFolder
        : app.getPath('downloads');
      return { exportFolder: folder };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return defaultSettings();
}

function saveSettings(settings) {
  const file = SETTINGS_FILE();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(settings, null, 2), 'utf8');
}

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

ipcMain.handle('confirm-close', async (_event, payload) => {
  const message = typeof payload === 'string' ? payload : (payload && payload.message);
  const allowDiscard = typeof payload === 'object' && payload ? payload.allowDiscard !== false : true;
  const buttons = allowDiscard
    ? ['Close and save', 'Close without saving', 'Cancel']
    : ['Close and save', 'Cancel'];
  const cancelId = allowDiscard ? 2 : 1;
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons,
    defaultId: 0,
    cancelId,
    title: 'Scratch Pad Portable',
    message: message || 'Do you want to save your notes before closing?',
    detail: 'Close and save writes a text file to your chosen save folder (same as Export).',
    noLink: true,
  });
  if (result.response === 0) return 'save';
  if (allowDiscard && result.response === 1) return 'discard';
  return 'cancel';
});

ipcMain.handle('get-settings', async () => loadSettings());

ipcMain.handle('pick-export-folder', async () => {
  const current = loadSettings();
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose folder for exported notes',
    defaultPath: current.exportFolder || app.getPath('downloads'),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths.length) {
    return { ok: false, canceled: true, settings: current };
  }
  const settings = { exportFolder: result.filePaths[0] };
  saveSettings(settings);
  return { ok: true, settings };
});

ipcMain.handle('reset-export-folder', async () => {
  const settings = defaultSettings();
  saveSettings(settings);
  return { ok: true, settings };
});

ipcMain.handle('load-data', async () => {
  try {
    const file = DATA_FILE();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
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
    const settings = loadSettings();
    let folder = settings.exportFolder || app.getPath('downloads');
    if (!fs.existsSync(folder)) {
      folder = app.getPath('downloads');
    }
    const dateStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
    const filename = `Scratch Pad Portable Export ${dateStr}.txt`;
    const fullPath = path.join(folder, filename);
    const normalized = content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    fs.mkdirSync(folder, { recursive: true });
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
