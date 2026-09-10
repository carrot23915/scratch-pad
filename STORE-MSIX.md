# Publishing Scratch Pad Portable as MSIX (Microsoft Store)

## Why MSIX
Microsoft can re-sign MSIX packages for the Store. You do **not** need to buy a code-signing certificate (unlike the MSI/EXE URL path).

## Partner Center identity (required)
In Partner Center open your app → **Product identity** (or App identity) and copy:

- **Package/Identity/Name** → put in `package.json` → `build.appx.identityName`
- **Package/Identity/Publisher** → put in `package.json` → `build.appx.publisher` (looks like `CN=A1B2C3D4-...`)
- **Package/Properties/PublisherDisplayName** → `build.appx.publisherDisplayName`

Rebuild the MSIX after updating those values so they **exactly** match Partner Center, or upload will fail identity checks.

## Build
```bash
npm run build:msix
```

Output: `dist/*.appx` (Store accepts `.appx` / `.msix` style packages from electron-builder’s appx target).

## Upload
1. In Partner Center, use an **MSIX** product/packages flow (not MSI/EXE package URL).
2. Upload the `.appx` / `.msix` file on **Packages**.
3. Privacy URL: https://github.com/carrot23915/scratch-pad/blob/main/PRIVACY.md
