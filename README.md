# PDF Suite (v1.2.11)

## This round

### 1. Fixed — real file preview before conversion
Previously, staging a Word file or image(s) for conversion only showed
the filename as plain text \u2014 no actual visual. Now:
- **Images**: real thumbnails of the selected file(s), generated
  directly from the files you picked (up to 3 shown, "+N" for more)
- **Word files**: a document-style card with the filename and file size

Both appear directly next to the Choose buttons, before you click
Convert \u2014 so you can confirm you picked the right file(s) first.

### 2. Sign-in prompt on launch
A welcome modal now appears automatically the first time you open PDF
Suite (browser or desktop) if you haven't signed in yet \u2014 just Name and
Email, matching the existing sign-in system already used elsewhere in
the app (Section 2.3 of the user manual). Skippable, and honest about
what it actually does: this personalizes the app locally (auto-fills
your name as signer/author), it isn't a secured account system.
"Skip for now" only dismisses it for that session \u2014 a genuinely fresh
launch with no saved profile will show it again, matching "trigger on
launch" rather than a one-time nag you could accidentally dismiss
forever.

### 3. Version bumped to 1.2.11
Updated consistently everywhere the version appears: `package.json`,
the Tauri desktop config (`tauri.conf.json`, `Cargo.toml` \u2014 so a new
desktop build picks it up too), and the File \u2192 About screen.

## Everything else (recap)
Explicit Convert-button workflow with directional arrows, toast
notifications, real Word/Image \u2192 PDF file saving, 5 conversion/
organization tools, burgundy rebrand, expanded font library, ribbon
reorganization, scrolling fixes, PDF compression, viewer, annotations,
OCR, security, signatures, batch processing, forms, light/dark theme,
Tauri 2 desktop packaging.

## Run it

```bash
npm install
npm run dev
```
Open http://localhost:5173/
