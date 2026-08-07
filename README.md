# PDF Suite

## This round: header restyle, hero typography, dock, and default color

### 1. Top navigation bar — now solid burgundy, always
The title bar and tab strip are now a fixed burgundy background with
white text/icons — matching your reference image — regardless of the
light/dark theme toggle. This is deliberately scoped to just those two
rows: the icon toolbar strip underneath (where the actual tool buttons
live) stays theme-reactive as before, same as in your reference image
where that row is still light/white.

### 2. Bottom quick-access dock
A floating burgundy pill of five circular icon buttons, centered at the
bottom of the canvas area — New, Open, Organize Pages, Share, and a Tools
panel toggle. All wired to real actions (nothing decorative).

### 3. Hero greeting — Times New Roman
"Welcome back, [name]!" now renders in Times New Roman specifically, as
requested, instead of the app's default UI font.

### 4. Default text/highlight color — now black
Changed the shared default annotation color from the previous yellow
(`#F5C242`) to black (`#000000`), as specified. One thing worth knowing:
this app uses a single shared "current color" across the Highlight,
Type Text, Sticky Note, Fill, and Ink tools (the same swatch you see in
the Edit tab's color picker) rather than a separate default per tool —
so this change affects all of them, not just text. If you'd rather
Highlight specifically defaulted to something else (yellow is the
conventional highlighter color) while Type Text defaults to black, that
would mean splitting them into separate defaults — say the word and I'll
do that instead.

## Everything else (recap)
5 new tools (Word/Image to PDF, Crop, Compare, Organize Pages),
personalized welcome screen, burgundy rebrand, expanded font library,
ribbon reorganization, scrolling fixes, PDF compression, viewer, page
assembly, annotations, OCR, security, signatures, batch processing,
fillable/creatable form fields, direct per-line text editing, light/dark
theme, Tauri 2 desktop packaging scaffold.

## Run it

```bash
npm install
npm run dev
```
Open http://localhost:5173/
