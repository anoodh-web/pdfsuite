# PDF Suite Pro (v1.2.11)

## This round: full Edit-tool typography parity

### 1. Bold weight preservation — the actual fix
Real, verified detection: pdf.js exposes each font's genuine base name
via `page.commonObjs` (e.g. "Helvetica-Bold"), confirmed against a real
generated test PDF before relying on it. Editing existing bold text now
correctly recognizes it was bold and keeps it that way, instead of
silently dropping to regular weight. Italic detection added the same
way, for the same reason.

### 2. Full formatting parity between Type Text and Edit
Font Family, Font Size, Bold, Italic, and Underline now all work
identically whether you're in a new Type Text box or editing existing
PDF text with the Edit tool:

- Each line you edit now has its own small B/I/U toggle buttons, right
  next to it, same as text boxes already had
- The ribbon's Format controls (Font Family/Size/Bold/Italic/Underline)
  now reach whichever *line* you have open for editing too, not just
  text boxes \u2014 same fix pattern as two rounds ago, extended to cover
  this second, separate editing surface
- Changes actually save: a genuine override system now sits on top of
  the detected original style, and export baking was rewritten to
  resolve and apply it \u2014 including for lines where you only changed
  formatting without touching the text itself, which the previous code
  silently ignored entirely

### Real bug caught and fixed during this work, not after
While restructuring the export-baking loop, a leftover extra closing
brace broke the whole build. Rather than guessing at a fix, I wrote a
short script to count brace depth line-by-line through the function and
pinpoint exactly where the structure diverged from what it should be,
confirmed the diagnosis, fixed it, and rebuilt clean before packaging
this.

## Recap of what's already fixed in earlier checkpoints (included here)
Select tool now enables real native text selection over the PDF's
actual content (not just our own annotations), erase/redaction border
(real pixel-rounding fix), text-edit clipping, sticky notes draggable,
form fields deletable, Font Family/Bold/Italic/Underline live on the
active text box.

## Still open
Expanding the font library further, and signature fonts in the Type
Signature modal.

## Run it

```bash
npm install
npm run dev
```
Open http://localhost:5173/
