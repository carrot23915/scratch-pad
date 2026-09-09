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

Each tab's name is the **first line** of that tab's notes (updates as you type). Empty notes fall back to `Tab N`.

## Data

Tabs persist to `scratchpad.json` under Electron `userData`.
