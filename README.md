# PDF Suite Pro (v2.0.8)

## This round: 3 real fixes for how text/annotations move around the page

### 1. Fixed \u2014 clumsy dragging, root-caused
Found it directly in the code: text boxes, sticky notes, and images were
all using the browser's native HTML5 drag-and-drop (`draggable` +
`onDragEnd`). That API only ever updates position once, at the moment
you release the mouse \u2014 while dragging, the browser shows its own
semi-transparent "ghost" following the cursor, completely disconnected
from the real element, which then just jumps to its final spot on drop.
That disconnect is exactly what "clumsy" describes.

Replaced it with a real pointer-tracking drag: the actual element now
follows your cursor continuously and precisely while you drag, the same
way Sejda (and most purpose-built editors) behave. Applied consistently
to text boxes, sticky notes, and images \u2014 not just the one you
mentioned, since all three had the identical underlying problem.

### 2. Added \u2014 keyboard arrow-key nudging
Select a text box, note, or image, then use the arrow keys to nudge it
into position \u2014 small steps normally, larger steps with Shift held
(same convention as Figma and most design tools). Arrow keys only take
over for nudging when something is actually selected; with nothing
selected, they still navigate pages as before, so nothing existing
broke.

### 3. Added \u2014 Tick and Dot stamp tools
Edit tab \u2192 Markup group \u2192 **Tick** and **Dot**. Click anywhere on the
page \u2014 including directly inside a printed checkbox or circle on a
scanned/flat form \u2014 to stamp a checkmark or filled dot exactly there.
Useful for filling out forms that don't have real interactive form
fields, just printed boxes on the page. Built on the same text-annotation
system as everything else, so a stamped tick or dot is fully draggable
and keyboard-nudgeable too, in case the placement needs a small nudge
after stamping.

## What to test
1. Drag a text box, sticky note, and an inserted image \u2014 should all feel
   smooth and precise now, following your cursor in real time
2. Select any of those and use arrow keys to nudge position \u2014 try Shift
   for bigger steps
3. Edit tab \u2192 Tick / Dot \u2192 click inside a printed box on a scanned form
   \u2192 confirm it lands right where you clicked, and can be dragged/nudged
   afterward if it needs adjusting

## Run it

```bash
npm install
npm run dev
```
Open http://localhost:5173/
