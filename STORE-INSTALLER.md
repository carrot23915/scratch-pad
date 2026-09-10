# Scratch Pad Portable — Installer return codes (Microsoft Store)

Contact: Phoenixms@outlook.com

This document describes EXE installer exit codes for Store package submission.

Scratch Pad Portable is distributed as a Windows **EXE** built with electron-builder.

## Recommended installer (NSIS)

When using the NSIS installer produced by electron-builder, silent install is typically:

```text
ScratchPadSetup.exe /S
```

### Standard return codes

| Scenario | Return code |
| --- | --- |
| Installation successful | `0` |
| Installation cancelled by user | `1` |
| Installation failed / aborted by script | `2` |
| Application already exists | *(not used — installer upgrades/overwrites; leave blank or omit)* |
| Installation already in progress | *(not used — leave blank or omit)* |
| Disk space is full | *(not used — leave blank or omit)* |
| Reboot required | *(not used — leave blank or omit)* |
| Network failure | *(not used — offline installer; leave blank or omit)* |
| Package rejected during installation | *(not used — leave blank or omit)* |

Only fill Store fields for codes your installer actually returns. Prefer entering **0** for success and **1** for user cancel; leave other scenarios empty unless you confirm those codes.

## Portable EXE note

The “portable” single-file `.exe` launches the app and does **not** behave like a classic installer (no silent `/S` install into Program Files). For Store MSI/EXE listing, prefer the **NSIS** setup EXE with silent parameter `/S`, Authenticode-signed, hosted at a stable HTTPS URL.
