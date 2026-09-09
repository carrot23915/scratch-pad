const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
const DATA_FILE = () => path.join(app.getPath('userData'), 'scratchpad.json');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 500,
    minHeight: 400,
    title: 'Scratch Pad',
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
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
    // en-GB is typically DD/MM/YYYY; '/' is illegal in Windows filenames
    const dateStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
    const filename = `Scratch Pad Export ${dateStr}.txt`;
    const fullPath = path.join(downloads, filename);
    // Ensure CRLF line endings
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
    title: 'Import Scratch Pad Notes',
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

ipcMain.handle('copy-text', async (_event, text) => {
  clipboard.writeText(text || '');
  return { ok: true };
});
