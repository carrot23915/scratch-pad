# Scratch Pad Portable

Multi-tab notes app (Electron) with Import/Export. Tab titles come from the first line of each note.

## Development (Linux)

```bash
cd /workspace/scratch-pad-app
npm start
```

## Windows artifacts

Built under `dist/`:

- **Portable:** `dist/Scratch Pad Portable <version>.exe` — single-file; copy to any Windows PC and run.
- **Zip / unpacked:** run `Scratch Pad Portable.exe` inside the build output.

## Export

Export (and **Close and save**) writes automatically to the user's Downloads folder (no save dialog):

`Scratch Pad Portable Export <en-GB-date>.txt`

(`/` in the date is replaced with `-` so the path is valid on Windows, e.g. `Scratch Pad Portable Export 09-09-2026.txt`).

## Tabs

The tab bar **wraps** as you narrow the window (rows / vertical stack) so every tab stays visible without horizontal scrolling.

Each tab's name is the **first line** of that tab's notes (updates as you type). Empty notes show `New Tab`.

Shortcuts: F1 new tab, Ctrl+Shift+T reopen closed tab, Ctrl+F find, Ctrl+= / Ctrl+- / Ctrl+0 notes font size. Middle-click closes a tab; drag to reorder.

## Data

Tabs persist to `scratchpad.json` and settings (save folder, font size, backup options, window bounds) to `settings.json` under Electron `userData`.

Automatic backups (default: daily, keep last 30) are JSON snapshots of all tabs written to `Documents\Scratch Pad Backups` (changeable in Settings), named `ScratchPad-backup-YYYY-MM-DD_HH-mm.json`. They live outside the app data folder so they survive uninstalling the Store version. Restore from Settings.

## Window

The window is freely resizable (no practical minimum size) and remembers its size, position and maximized state.
