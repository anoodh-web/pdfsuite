# Auto-Updates — Publishing Guide

This covers how the auto-updater actually works now that it's wired in,
and exactly what you need to do each time you want to push a new
version out to everyone's installed desktop app without them manually
reinstalling.

## How it works, in short

1. You build the app with a **signing key** (already generated for you —
   see below) so update packages can be verified as genuinely from you,
   not tampered with.
2. You publish the built installer + a small `latest.json` manifest file
   to a **GitHub Release**.
3. Every installed copy of PDF Suite Pro periodically checks that
   Release for a `latest.json` with a newer version number, and if
   found, offers to download and install it automatically — no manual
   rebuild-and-redistribute needed ever again.

## One-time setup — your signing key

I generated a real Ed25519 signing keypair for this. The **public key**
is already embedded in `src-tauri/tauri.conf.json` (safe — that's what
lets installed copies verify an update is genuinely yours). The
**private key** was deliberately *not* included in this zip, since
anyone who has it could sign a fake "update" that your app would trust.
I've given it to you separately, in chat — **save it somewhere secure
and never commit it to GitHub.** If you lose it, you can't sign future
updates with the same identity (you'd need to generate a new keypair
and update the public key in `tauri.conf.json`, and everyone's existing
install would need one final manual reinstall to pick up the new key).

Set it as an environment variable before building a release:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "<paste the private key file's full contents here>"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
```

(The password is empty because the key was generated without one, for
simplicity — you can regenerate with a password later if you want an
extra layer of protection; ask if you'd like help with that.)

## Every time you want to publish a new version

**1. Bump the version number** in three places (they need to match):
   - `package.json` → `"version"`
   - `src-tauri/tauri.conf.json` → `"version"`
   - `src-tauri/Cargo.toml` → `version = "..."`

**2. Build, with signing enabled:**
```powershell
npm run tauri build
```
With the environment variables from above set, this automatically
produces, alongside the usual `.msi`/`.exe`:
```
src-tauri\target\release\bundle\msi\PDF Suite Pro_1.x.x_x64_en-US.msi.zip
src-tauri\target\release\bundle\msi\PDF Suite Pro_1.x.x_x64_en-US.msi.zip.sig
src-tauri\target\release\bundle\nsis\PDF Suite Pro_1.x.x_x64-setup.exe.zip
src-tauri\target\release\bundle\nsis\PDF Suite Pro_1.x.x_x64-setup.exe.zip.sig
```
The `.zip` files are what the updater actually downloads (a signed
wrapper around the installer); the `.sig` files are the signatures.

**3. Create `latest.json`** — this is the manifest the updater checks.
Create a file with this exact structure (adjust version/date/notes):

```json
{
  "version": "1.x.x",
  "notes": "Short description of what changed in this release.",
  "pub_date": "2026-08-14T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<paste the full contents of the .msi.zip.sig file here>",
      "url": "https://github.com/anoodh-web/pdfsuite/releases/download/v1.x.x/PDF.Suite.Pro_1.x.x_x64_en-US.msi.zip"
    }
  }
}
```

**4. Create a GitHub Release**, tagged `v1.x.x` (matching the version),
and upload all of these as release assets:
   - `latest.json`
   - the `.msi.zip` and `.msi.zip.sig`
   - (optionally the `.exe.zip`/`.sig` too, and a plain, unsigned
     `.msi`/`.exe` copy for anyone installing fresh rather than updating)

That's it — once that Release is published, everyone's installed app
will detect it (via File → About → Check for Updates, or whatever
automatic check interval you set) and offer to install it.

## Where to check for updates in the app

**File → About → "Check for Updates"** — click it, and if a newer
version is published, you'll see a "Download & Install" button. The app
downloads, installs, and restarts itself automatically. This only
appears in the installed desktop app; the browser version has no update
mechanism (there's nothing to update — it's always whatever's currently
deployed).

## Worth automating later

Manually building, zipping signatures, and writing `latest.json` by
hand is tedious and error-prone once you're doing it regularly. Tauri
has an official GitHub Action (`tauri-apps/tauri-action`) that automates
this entire process — builds, signs, and publishes the Release
automatically whenever you push a version-tagged commit. Worth setting
up once you're doing this more than a couple of times; ask if you want
that built out.
