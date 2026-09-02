# PDF Suite Pro (v2.0.7)

## This round: PDF Merge tool (the last of the 4 requested items)

Page Layout tab \u2192 Merge PDFs. A genuinely self-contained tool, distinct
from the existing "Combine Open Files":

- **Combine Open Files** (already existed) \u2014 merges whatever documents
  you already have open as tabs
- **Merge PDFs** (new) \u2014 pick files directly from a file picker, no
  need to open each one as a tab first, then drag them into the exact
  order you want before merging

## What it does
1. Click "Add PDF Files" \u2014 pick 2 or more, repeat to add more from
   different folders if needed
2. Drag to reorder \u2014 numbered positions show exactly what order pages
   will end up in
3. Remove any file with the X before merging, if you picked the wrong one
4. Merge \u2014 opens the combined result in the app and saves it as
   "Merged.pdf"

## Verified before shipping, not just assumed correct
Built 3 distinct test PDFs (different page counts) and merged them in a
deliberately non-alphabetical order (C, then A, then B) \u2014 confirmed the
output has exactly the right total page count, and separately extracted
the text from every page in the result to confirm the actual page
*order* matches exactly what was requested, not upload order or
alphabetical order.

Also tested the error-handling path specifically: mixed one genuinely
corrupt file in with a valid one, confirmed the valid file's pages still
merge in successfully and the corrupt one is cleanly skipped and
reported \u2014 rather than either silently dropping it with no explanation,
or failing the entire merge over one bad file.

One more thing carried over deliberately: each file is loaded the same
careful way the false-"Password Protected"-prompt fix taught this app to
open files \u2014 trying an empty password automatically first \u2014 so an
invoice-style PDF with only owner/permissions restrictions merges in
correctly too, not just files with no security settings at all.

## Recap of everything from this round (all 4 items now complete)
"Save As" now genuinely preserves all your changes (was silently
skipping annotation baking before). JPG-to-PDF conversion has a real
drag-to-reorder step. Save As can prompt for a real destination folder
in Chrome/Edge and the desktop app. Merge PDFs is new.

## What to test
Page Layout \u2192 Merge PDFs \u2192 pick 3 files from different sources \u2192 drag
them into a specific order \u2192 Merge \u2192 confirm the resulting page order
in the app matches what you set, not upload order.

## Run it

```bash
npm install
npm run dev
```
Open http://localhost:5173/
