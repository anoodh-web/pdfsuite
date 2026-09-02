# How to Request Changes to PDF Suite Pro

A quick reference for the ongoing development workflow, so this doesn't
need to be reconstructed from chat history every time.

## 1. Request the change

Describe what you want, or attach a screenshot if something looks wrong
or you want it to match a reference image. No special format needed —
bug reports, feature requests, or "make X look like Y" all work.

## 2. Receive and install the update

Every change comes as a zip with a summary of what changed and what to
test.

```powershell
cd "C:\Users\anoodh\Documents\PDFSuite"
# extract the zip, copy its contents in, choose "Replace" when prompted
npm install
```

## 3. Test in the browser (fastest way to check anything)

```powershell
npm run dev
```
Open http://localhost:5173/ — this always reflects the latest code
immediately, no build step needed.

## 4. Save it in git once you're happy

```powershell
git add .
git commit -m "short description of what changed"
git push
```

## 5. Updating the desktop app

Two options:

**A. Quick manual install** — no publishing, just a local build:
```powershell
npm run tauri build
```
Installer lands in `src-tauri\target\release\bundle\nsis\...exe` (or
`\msi\...msi`). Install directly on whatever machines need it — no
uninstall required first, since installing over an existing version
upgrades it in place.

**B. Auto-update via GitHub Release** — pushes the update to every
machine already running 2.0.6+ automatically, without visiting each one:

1. Bump the version number in all three places (must match exactly):
   - `package.json` → `"version"`
   - `src-tauri/tauri.conf.json` → `"version"`
   - `src-tauri/Cargo.toml` → `version = "..."`
2. In the **same PowerShell window** you'll build from:
   ```powershell
   $env:TAURI_SIGNING_PRIVATE_KEY = "<the private key>"
   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
   ```
   Verify it's actually set before building:
   ```powershell
   echo $env:TAURI_SIGNING_PRIVATE_KEY
   ```
3. Build:
   ```powershell
   npm run tauri build
   ```
   Press **Enter** at the "Decrypting updater signing key" password
   prompt (empty password — always).
4. In `src-tauri\target\release\bundle\nsis\`, open the `.sig` file,
   copy its full contents.
5. Create/edit `latest.json` in that same folder:
   ```json
   {
     "version": "X.Y.Z",
     "notes": "What changed in this release.",
     "pub_date": "2026-MM-DDT00:00:00Z",
     "platforms": {
       "windows-x86_64": {
         "signature": "<paste the .sig file's contents>",
         "url": "https://github.com/anoodh-web/pdfsuite/releases/download/vX.Y.Z/PDF.Suite.Pro_X.Y.Z_x64-setup.exe"
       }
     }
   }
   ```
6. Go to `https://github.com/anoodh-web/pdfsuite/releases/new`, tag it
   `vX.Y.Z`, and **drag both the `.exe` and `latest.json` into the
   Assets upload box** — not the description/notes text field, that's
   a dead end that looks like it worked but doesn't.
7. Publish. Verify it's actually live before telling anyone to update:
   ```
   https://github.com/anoodh-web/pdfsuite/releases/download/vX.Y.Z/latest.json
   ```
   Should show real JSON, not a 404.
8. On a machine running an older version: File → About → Check for
   Updates.

## 6. Updating the user manual

Just ask — "update the manual for these changes." I regenerate it
directly from the current state of the app, not from old chat context,
so it always reflects what's actually shipped.

## Keep this safe

Your updater private key (needed for step 5B above) should live in a
password manager or encrypted note — not just in old chat messages,
which may not remain accessible indefinitely. If it's ever lost, the
fix is a new keypair plus one final manual reinstall on every machine.
