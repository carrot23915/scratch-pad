# Scratch Pad

Multi-tab notes scratch pad (Electron) with Import/Export.

## Development (Linux)

```bash
cd /workspace/scratch-pad-app
npm start
```

## Windows artifacts

Built under `dist/`:

- **Portable:** `dist/Scratch Pad 1.0.0 Portable.exe` — single-file portable; copy to any Windows PC and run.
- **Zip:** `dist/Scratch Pad-1.0.0-win-x64.zip` — unpack and run `Scratch Pad.exe`.
- **Unpacked:** `dist/win-unpacked/Scratch Pad.exe`

## Export

Export writes automatically to the user's Downloads folder (no save dialog):

`Scratch Pad Export <en-GB-date>.txt`

(`/` in the date is replaced with `-` so the path is valid on Windows, e.g. `Scratch Pad Export 09-09-2026.txt`).

## Data

Tabs persist to `scratchpad.json` under Electron `userData`.
