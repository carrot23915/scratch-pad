const { app, BrowserWindow, ipcMain, dialog, Menu, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

let mainWindow;
let allowClose = false;
let settings = null;
let latestData = null;
let boundsTimer = null;
let backupTimer = null;

const DATA_FILE = () => path.join(app.getPath('userData'), 'scratchpad.json');
const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');

const DEFAULT_WIDTH = 900;
const DEFAULT_HEIGHT = 700;
const FONT_MIN = 10;
const FONT_MAX = 28;
const FONT_DEFAULT = 13;
const KEEP_DEFAULT = 30;
const KEEP_MAX = 999;

const BACKUP_INTERVALS = {
  off: 0,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
};
const BACKUP_FILE_RE = /^ScratchPad-backup-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}(?:-\d+)?\.json$/;

// ---------- Settings ----------

function defaultBackupFolder() {
  return path.join(app.getPath('documents'), 'Scratch Pad Backups');
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function nonEmptyString(value, fallback) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function normalizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const out = {
    exportFolder: nonEmptyString(s.exportFolder, app.getPath('downloads')),
    fontSize: clampInt(s.fontSize, FONT_MIN, FONT_MAX, FONT_DEFAULT),
    backupInterval: Object.prototype.hasOwnProperty.call(BACKUP_INTERVALS, s.backupInterval) ? s.backupInterval : '1d',
    backupFolder: nonEmptyString(s.backupFolder, defaultBackupFolder()),
    backupKeep: clampInt(s.backupKeep, 1, KEEP_MAX, KEEP_DEFAULT),
    lastBackupAt: typeof s.lastBackupAt === 'string' ? s.lastBackupAt : null,
    lastBackupHash: typeof s.lastBackupHash === 'string' ? s.lastBackupHash : null,
    windowBounds: null,
    windowMaximized: !!s.windowMaximized,
  };
  const b = s.windowBounds;
  if (b && [b.x, b.y, b.width, b.height].every((v) => Number.isFinite(v))) {
    out.windowBounds = {
      x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height),
    };
  }
  return out;
}

function loadSettings() {
  if (settings) return settings;
  let raw = null;
  try {
    const file = SETTINGS_FILE();
    if (fs.existsSync(file)) raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  settings = normalizeSettings(raw);
  return settings;
}

function writeSettings() {
  try {
    const file = SETTINGS_FILE();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(settings, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

function updateSettings(patch) {
  settings = normalizeSettings({ ...loadSettings(), ...patch });
  writeSettings();
  return settings;
}

// What the renderer is allowed to see
function publicSettings() {
  const s = loadSettings();
  return {
    exportFolder: s.exportFolder,
    fontSize: s.fontSize,
    fontMin: FONT_MIN,
    fontMax: FONT_MAX,
    fontDefault: FONT_DEFAULT,
    backupInterval: s.backupInterval,
    backupFolder: s.backupFolder,
    backupKeep: s.backupKeep,
    lastBackupAt: s.lastBackupAt,
  };
}

// ---------- Window bounds ----------

function boundsVisible(b) {
  if (!b || b.width < 100 || b.height < 80) return false;
  // Require a decent chunk of the title bar area to be on a connected display
  const strip = { x: b.x, y: b.y, width: b.width, height: 40 };
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    const w = Math.min(strip.x + strip.width, a.x + a.width) - Math.max(strip.x, a.x);
    const h = Math.min(strip.y + strip.height, a.y + a.height) - Math.max(strip.y, a.y);
    return w >= 100 && h >= 20;
  });
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const b = mainWindow.getNormalBounds();
    updateSettings({ windowBounds: b, windowMaximized: mainWindow.isMaximized() });
  } catch (e) {
    console.error('Failed to save window state:', e);
  }
}

function scheduleWindowStateSave() {
  clearTimeout(boundsTimer);
  boundsTimer = setTimeout(saveWindowState, 500);
}

// ---------- Backups ----------

function tabsOf(data) {
  return data && Array.isArray(data.tabs) ? data.tabs : [];
}

function contentHash(data) {
  const tabs = tabsOf(data).map((t) => [String((t && t.name) || ''), String((t && t.notes) || '')]);
  return crypto.createHash('sha256').update(JSON.stringify(tabs)).digest('hex');
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function backupStamp(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`;
}

function backupFileName(stamp, n) {
  return `ScratchPad-backup-${stamp}${n > 1 ? `-${n}` : ''}.json`;
}

// Parse an app-made backup name into a sortable key (timestamp + same-minute counter)
function backupKey(name) {
  const m = /^ScratchPad-backup-(\d{4}-\d{2}-\d{2}_\d{2}-\d{2})(?:-(\d+))?\.json$/.exec(name);
  return m ? { stamp: m[1], n: m[2] ? Number(m[2]) : 1 } : null;
}

function compareBackupsNewestFirst(a, b) {
  if (a.key.stamp !== b.key.stamp) return a.key.stamp < b.key.stamp ? 1 : -1;
  return b.key.n - a.key.n;
}

function listBackups(folder) {
  return fs.readdirSync(folder)
    .filter((f) => BACKUP_FILE_RE.test(f))
    .map((f) => ({ name: f, full: path.join(folder, f), key: backupKey(f) }))
    .filter((f) => f.key)
    .sort(compareBackupsNewestFirst);
}

function pruneBackups(folder, keep) {
  try {
    listBackups(folder).slice(keep).forEach((f) => {
      try { fs.unlinkSync(f.full); } catch (e) { console.error('Failed to delete old backup:', e); }
    });
  } catch (e) {
    console.error('Failed to prune backups:', e);
  }
}

// Writes a full snapshot of all tabs. Returns { ok, path } / { ok, skipped } / { ok:false, error }.
function writeBackup(data, { force = false } = {}) {
  try {
    const tabs = tabsOf(data);
    if (!tabs.length) return { ok: true, skipped: true };
    const s = loadSettings();
    const hash = contentHash(data);
    if (!force && hash === s.lastBackupHash) return { ok: true, skipped: true };
    const folder = s.backupFolder || defaultBackupFolder();
    fs.mkdirSync(folder, { recursive: true });
    const now = new Date();
    const stamp = backupStamp(now);
    // Same minute as an existing backup: use the next counter so names keep sorting by age
    let n = 1;
    listBackups(folder).forEach((f) => {
      if (f.key.stamp === stamp && f.key.n >= n) n = f.key.n + 1;
    });
    let full = path.join(folder, backupFileName(stamp, n));
    while (fs.existsSync(full)) {
      n += 1;
      full = path.join(folder, backupFileName(stamp, n));
    }
    const payload = {
      app: 'Scratch Pad Portable',
      type: 'scratchpad-backup',
      version: 1,
      createdAt: now.toISOString(),
      activeIndex: typeof data.activeIndex === 'number' ? data.activeIndex : 0,
      tabs: tabs.map((t) => ({ name: String((t && t.name) || ''), notes: String((t && t.notes) || '') })),
    };
    fs.writeFileSync(full, JSON.stringify(payload, null, 2), 'utf8');
    updateSettings({ lastBackupAt: now.toISOString(), lastBackupHash: hash });
    pruneBackups(folder, s.backupKeep);
    return { ok: true, path: full };
  } catch (e) {
    console.error('Backup failed:', e);
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

function currentData() {
  if (latestData) return latestData;
  try {
    const file = DATA_FILE();
    if (fs.existsSync(file)) latestData = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('Failed to read notes for backup:', e);
  }
  return latestData;
}

function notifyBackup(result) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('backup-status', {
    ok: result.ok,
    skipped: !!result.skipped,
    path: result.path || null,
    error: result.error || null,
    lastBackupAt: loadSettings().lastBackupAt,
  });
}

function backupIfDue() {
  const s = loadSettings();
  const interval = BACKUP_INTERVALS[s.backupInterval] || 0;
  if (!interval) return;
  const last = s.lastBackupAt ? Date.parse(s.lastBackupAt) : 0;
  if (last && Date.now() - last < interval) return;
  const result = writeBackup(currentData());
  if (!result.skipped) notifyBackup(result);
}

function startBackupTimer() {
  clearInterval(backupTimer);
  setTimeout(backupIfDue, 10 * 1000);
  backupTimer = setInterval(backupIfDue, 60 * 1000);
}

function validateBackup(parsed) {
  const tabs = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.tabs) ? parsed.tabs : null;
  if (!tabs || !tabs.length) return null;
  if (tabs.length > 5000) return null;
  for (const t of tabs) {
    if (!t || typeof t !== 'object' || typeof t.notes !== 'string') return null;
    if (t.name !== undefined && typeof t.name !== 'string') return null;
  }
  const activeIndex = parsed && typeof parsed.activeIndex === 'number' && parsed.activeIndex >= 0 && parsed.activeIndex < tabs.length
    ? Math.floor(parsed.activeIndex)
    : 0;
  return { tabs: tabs.map((t) => ({ name: t.name || '', notes: t.notes })), activeIndex };
}

// ---------- Spell check + context menu ----------

function setupSpellcheck(win) {
  const ses = win.webContents.session;
  try {
    const wanted = ['en-AU', 'en-GB', 'en-US'];
    const available = Array.isArray(ses.availableSpellCheckerLanguages) ? ses.availableSpellCheckerLanguages : [];
    const langs = available.length ? wanted.filter((l) => available.includes(l)) : wanted;
    if (langs.length) {
      try {
        ses.setSpellCheckerLanguages(langs);
      } catch (e) {
        try { ses.setSpellCheckerLanguages(['en-US']); } catch (_) { /* OS spellchecker decides */ }
      }
    }
  } catch (e) {
    console.error('Spellchecker language setup skipped:', e);
  }

  win.webContents.on('context-menu', (_event, params) => {
    const template = [];
    const flags = params.editFlags || {};
    if (params.isEditable && params.misspelledWord) {
      const suggestions = (params.dictionarySuggestions || []).slice(0, 6);
      if (suggestions.length) {
        suggestions.forEach((s) => {
          template.push({ label: s, click: () => win.webContents.replaceMisspelling(s) });
        });
      } else {
        template.push({ label: 'No suggestions', enabled: false });
      }
      template.push({
        label: 'Add to dictionary',
        click: () => {
          try { ses.addWordToSpellCheckerDictionary(params.misspelledWord); } catch (e) { console.error(e); }
        },
      });
      template.push({ type: 'separator' });
    }
    if (params.isEditable) {
      template.push(
        { role: 'cut', enabled: !!flags.canCut },
        { role: 'copy', enabled: !!flags.canCopy },
        { role: 'paste', enabled: !!flags.canPaste },
        { type: 'separator' },
        { role: 'selectAll', enabled: flags.canSelectAll !== false },
      );
    } else if (params.selectionText) {
      template.push({ role: 'copy', enabled: !!flags.canCopy });
    } else {
      return; // nothing useful to offer outside text fields
    }
    Menu.buildFromTemplate(template).popup({ window: win });
  });
}

// ---------- Window ----------

function createWindow() {
  const s = loadSettings();
  const opts = {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: 1,
    minHeight: 1,
    resizable: true,
    maximizable: true,
    show: false,
    title: 'Scratch Pad Portable',
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  };
  if (s.windowBounds && boundsVisible(s.windowBounds)) {
    Object.assign(opts, s.windowBounds);
  } else {
    opts.center = true;
  }

  mainWindow = new BrowserWindow(opts);
  mainWindow.setMenuBarVisibility(false);
  setupSpellcheck(mainWindow);
  mainWindow.loadFile('index.html');

  let shown = false;
  const showWindow = () => {
    if (shown || !mainWindow || mainWindow.isDestroyed()) return;
    shown = true;
    if (s.windowMaximized && s.windowBounds && boundsVisible(s.windowBounds)) mainWindow.maximize();
    mainWindow.show();
  };
  mainWindow.once('ready-to-show', showWindow);
  setTimeout(showWindow, 5000); // safety net if ready-to-show never fires

  ['resize', 'move', 'maximize', 'unmaximize'].forEach((ev) => {
    mainWindow.on(ev, scheduleWindowStateSave);
  });

  mainWindow.on('close', (e) => {
    if (allowClose) {
      clearTimeout(boundsTimer);
      saveWindowState();
      return;
    }
    e.preventDefault();
    mainWindow.webContents.send('app-close-request');
  });
}

app.whenReady().then(() => {
  // No application menu: removes the default (hidden) menu's accelerators such as
  // Ctrl+= / Ctrl+- / Ctrl+0 page zoom, Ctrl+R reload and Ctrl+W, which would clash
  // with the app's own shortcuts. Text editing shortcuts still work in Chromium.
  Menu.setApplicationMenu(null);
  loadSettings();
  currentData();
  createWindow();
  startBackupTimer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.on('app-close-response', (_event, shouldClose) => {
  if (!shouldClose || !mainWindow) return;
  // Final backup if enabled and notes changed since the last one (skips otherwise)
  const s = loadSettings();
  if (BACKUP_INTERVALS[s.backupInterval]) writeBackup(currentData());
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

ipcMain.handle('get-settings', async () => publicSettings());

ipcMain.handle('pick-export-folder', async () => {
  const current = loadSettings();
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose folder for exported notes',
    defaultPath: current.exportFolder || app.getPath('downloads'),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths.length) {
    return { ok: false, canceled: true, settings: publicSettings() };
  }
  updateSettings({ exportFolder: result.filePaths[0] });
  return { ok: true, settings: publicSettings() };
});

ipcMain.handle('reset-export-folder', async () => {
  updateSettings({ exportFolder: app.getPath('downloads') });
  return { ok: true, settings: publicSettings() };
});

ipcMain.handle('set-font-size', async (_event, size) => {
  updateSettings({ fontSize: size });
  return { ok: true, settings: publicSettings() };
});

ipcMain.handle('set-backup-options', async (_event, opts) => {
  const patch = {};
  if (opts && typeof opts.interval === 'string') patch.backupInterval = opts.interval;
  if (opts && opts.keep !== undefined) patch.backupKeep = opts.keep;
  const before = loadSettings().backupKeep;
  updateSettings(patch);
  const s = loadSettings();
  if (s.backupKeep < before) pruneBackups(s.backupFolder, s.backupKeep);
  return { ok: true, settings: publicSettings() };
});

ipcMain.handle('pick-backup-folder', async () => {
  const current = loadSettings();
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose folder for automatic backups',
    defaultPath: current.backupFolder || defaultBackupFolder(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths.length) {
    return { ok: false, canceled: true, settings: publicSettings() };
  }
  // New folder: make sure the next backup is written there even if nothing changed
  updateSettings({ backupFolder: result.filePaths[0], lastBackupHash: null });
  return { ok: true, settings: publicSettings() };
});

ipcMain.handle('reset-backup-folder', async () => {
  updateSettings({ backupFolder: defaultBackupFolder(), lastBackupHash: null });
  return { ok: true, settings: publicSettings() };
});

ipcMain.handle('open-backup-folder', async () => {
  try {
    const folder = loadSettings().backupFolder || defaultBackupFolder();
    fs.mkdirSync(folder, { recursive: true });
    const err = await shell.openPath(folder);
    return err ? { ok: false, error: err } : { ok: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
});

ipcMain.handle('backup-now', async (_event, data) => {
  if (data && Array.isArray(data.tabs)) latestData = data;
  const result = writeBackup(currentData(), { force: true });
  return { ...result, settings: publicSettings() };
});

ipcMain.handle('restore-backup', async (_event, current) => {
  try {
    if (current && Array.isArray(current.tabs)) latestData = current;
    const folder = loadSettings().backupFolder || defaultBackupFolder();
    try { fs.mkdirSync(folder, { recursive: true }); } catch (_) { /* dialog still works */ }
    const pick = await dialog.showOpenDialog(mainWindow, {
      title: 'Restore Scratch Pad backup',
      defaultPath: folder,
      filters: [{ name: 'Scratch Pad backups', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (pick.canceled || !pick.filePaths.length) return { ok: false, canceled: true };

    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(pick.filePaths[0], 'utf8'));
    } catch (e) {
      return { ok: false, error: 'That file is not a valid Scratch Pad backup (could not read JSON).' };
    }
    const restored = validateBackup(parsed);
    if (!restored) return { ok: false, error: 'That file is not a valid Scratch Pad backup.' };

    const confirm = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Restore', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      title: 'Scratch Pad Portable',
      message: 'This replaces your current tabs. A backup of your current tabs will be made first.',
      detail: `Restore ${restored.tabs.length} tab(s) from ${path.basename(pick.filePaths[0])}?`,
      noLink: true,
    });
    if (confirm.response !== 0) return { ok: false, canceled: true };

    const pre = writeBackup(currentData(), { force: true });
    if (!pre.ok) return { ok: false, error: `Could not back up current tabs first: ${pre.error}` };

    return { ok: true, data: restored, preBackupPath: pre.path || null, settings: publicSettings() };
  } catch (e) {
    console.error('Restore failed:', e);
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
});

ipcMain.handle('load-data', async () => {
  try {
    const file = DATA_FILE();
    if (fs.existsSync(file)) {
      latestData = JSON.parse(fs.readFileSync(file, 'utf8'));
      return latestData;
    }
  } catch (e) {
    console.error('Failed to load scratchpad data:', e);
  }
  return null;
});

ipcMain.handle('save-data', async (_event, data) => {
  try {
    latestData = data;
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
    const s = loadSettings();
    let folder = s.exportFolder || app.getPath('downloads');
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
