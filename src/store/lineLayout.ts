// Page geometry for the Edit tool: what an edited line can grow into
// without running over other text, photos or shapes, and how a too-long
// line wraps onto the lines below it. Pure functions, no store state.
import type { CachedLine, LineAlign } from './useDocumentStore';

// Shared geometry for detected text lines — used both when computing each
// line's display box (loadPageLines) and when baking edited text back into
// the page (applyRedactions), so the two are provably consistent rather
// than relying on two independently-guessed numbers landing close enough.
// LINE_HEIGHT_MULT is the box height as a multiple of font size; ASCENT_MULT
// is how far the baseline sits below the top of that box. Their ratio is
// where the baseline falls within the box (~0.808, i.e. near the bottom,
// as real text baselines are — not centered).
export const LINE_HEIGHT_MULT = 1.3;
export const ASCENT_MULT = 1.05;
export const LINE_BASELINE_RATIO = ASCENT_MULT / LINE_HEIGHT_MULT;

// A painted image or vector shape, as a normalized (0-1) top-left-origin box.
export interface PageObstacle {
  kind: 'image' | 'shape';
  x: number;
  yTop: number;
  w: number;
  h: number;
}

interface OpList {
  fnArray: number[];
  argsArray: unknown[];
}

function multiply(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

// Every visible image and filled/stroked shape on the page, from pdf.js's
// operator list. Page-sized backgrounds and specks are dropped; clip paths
// and fully transparent paints (Google Slides puts an invisible shape behind
// every text box) aren't seen, so they don't count.
export function collectPageObstacles(
  opList: OpList,
  OPS: Record<string, number>,
  view: number[]
): PageObstacle[] {
  const [vx0, vy0, vx1, vy1] = view;
  const pageW = vx1 - vx0;
  const pageH = vy1 - vy0;
  const out: PageObstacle[] = [];
  type State = { ctm: number[]; fillAlpha: number; strokeAlpha: number };
  let st: State = { ctm: [1, 0, 0, 1, 0, 0], fillAlpha: 1, strokeAlpha: 1 };
  const stack: State[] = [];

  const add = (kind: PageObstacle['kind'], minX: number, minY: number, maxX: number, maxY: number) => {
    const { ctm } = st;
    const corners = [
      [minX, minY],
      [maxX, minY],
      [minX, maxY],
      [maxX, maxY],
    ].map(([x, y]) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]);
    const x0 = Math.max(vx0, Math.min(...corners.map((c) => c[0])));
    const x1 = Math.min(vx1, Math.max(...corners.map((c) => c[0])));
    const y0 = Math.max(vy0, Math.min(...corners.map((c) => c[1])));
    const y1 = Math.min(vy1, Math.max(...corners.map((c) => c[1])));
    if (x1 - x0 < 2 && y1 - y0 < 2) return; // speck
    if (x1 <= x0 && y1 <= y0) return;
    if ((x1 - x0) * (y1 - y0) > pageW * pageH * 0.6) return; // page background
    out.push({ kind, x: (x0 - vx0) / pageW, yTop: (vy1 - y1) / pageH, w: (x1 - x0) / pageW, h: (y1 - y0) / pageH });
  };

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i] as unknown[] | null;
    if (fn === OPS.save) {
      stack.push(st);
      st = { ...st };
    } else if (fn === OPS.restore) {
      st = stack.pop() ?? st;
    } else if (fn === OPS.transform) {
      st.ctm = multiply(st.ctm, args as number[]);
    } else if (fn === OPS.setGState) {
      for (const entry of (args?.[0] as [string, unknown][] | undefined) ?? []) {
        if (entry[0] === 'ca' && typeof entry[1] === 'number') st.fillAlpha = entry[1];
        if (entry[0] === 'CA' && typeof entry[1] === 'number') st.strokeAlpha = entry[1];
      }
    } else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(st);
      st = { ...st };
      const matrix = args?.[0] as number[] | null;
      if (Array.isArray(matrix) && matrix.length === 6) st.ctm = multiply(st.ctm, matrix);
    } else if (fn === OPS.paintFormXObjectEnd) {
      st = stack.pop() ?? st;
    } else if (
      fn === OPS.paintImageXObject ||
      fn === OPS.paintInlineImageXObject ||
      fn === OPS.paintImageMaskXObject ||
      fn === OPS.paintSolidColorImageMask
    ) {
      if (st.fillAlpha > 0.05) add('image', 0, 0, 1, 1); // images are drawn into the unit square
    } else if (fn === OPS.constructPath) {
      // args: [paint op, path data, [minX, minY, maxX, maxY]]
      const paintOp = args?.[0];
      const minMax = args?.[2] as ArrayLike<number> | null;
      if (paintOp === OPS.endPath || !minMax || minMax.length < 4) continue; // a clip, not drawn
      if (![minMax[0], minMax[1], minMax[2], minMax[3]].every(Number.isFinite)) continue;
      const strokes = paintOp === OPS.stroke || paintOp === OPS.closeStroke;
      const fills = paintOp === OPS.fill || paintOp === OPS.eoFill;
      const alpha = strokes ? st.strokeAlpha : fills ? st.fillAlpha : Math.max(st.fillAlpha, st.strokeAlpha);
      if (alpha <= 0.05) continue; // invisible
      add('shape', minMax[0], minMax[1], minMax[2], minMax[3]);
    }
  }
  return out;
}

// The part of a line's box where its glyphs actually are — so a shape that
// merely touches the line above or below isn't mistaken for being on its row.
function glyphBand(line: CachedLine): { top: number; bottom: number } {
  return { top: line.yTop + line.h * 0.15, bottom: line.yTop + line.h * 0.85 };
}

// Normalized (0-1) horizontal room a line can grow into before it would run
// into another text line, an image or a shape on the same row, or off the
// page. A shape the line sits inside (a banner, a button) keeps the text
// within its edges. An image under the line (a photo it's printed on, a
// drop shadow) or a shape it only partly overlaps is treated as background.
export function lineHorizontalLimits(
  lines: CachedLine[],
  line: CachedLine,
  obstacles: PageObstacle[] = []
): { min: number; max: number } {
  const GAP = 0.004;
  const TOL = 0.002;
  let min = 0.01;
  let max = 0.99;
  const left = line.x;
  const right = line.x + line.w;
  const band = glyphBand(line);
  for (const o of lines) {
    if (o.index === line.index) continue;
    if (o.synthetic && !o.text) continue;
    // glyph areas, not whole boxes: with tight line spacing the boxes of
    // consecutive lines overlap, and the line above isn't on this row
    const ob = glyphBand(o);
    if (ob.top >= band.bottom || ob.bottom <= band.top) continue;
    if (o.x >= right) max = Math.min(max, o.x - GAP);
    else if (o.x + o.w <= left) min = Math.max(min, o.x + o.w + GAP);
  }
  for (const o of obstacles) {
    if (o.yTop >= band.bottom || o.yTop + o.h <= band.top) continue; // not on this row
    if (o.x >= right - TOL) max = Math.min(max, o.x - GAP);
    else if (o.x + o.w <= left + TOL) min = Math.max(min, o.x + o.w + GAP);
    else if (
      o.kind === 'shape' &&
      o.x <= left + TOL &&
      o.x + o.w >= right - TOL &&
      o.yTop <= band.top &&
      o.yTop + o.h >= band.bottom
    ) {
      // the line sits inside this shape: stay within it
      min = Math.max(min, o.x + GAP);
      max = Math.min(max, o.x + o.w - GAP);
    }
  }
  // the line's own original extent is always fair game, even if the
  // document already put it closer to an edge than our margin
  return { min: Math.min(min, left), max: Math.max(max, right) };
}

// Where new text of the given normalized width would sit, anchored the way
// the line is aligned.
export function lineExtent(line: CachedLine, align: LineAlign, width: number): { start: number; end: number } {
  if (align === 'right') return { start: line.x + line.w - width, end: line.x + line.w };
  if (align === 'center') {
    const c = line.x + line.w / 2;
    return { start: c - width / 2, end: c + width / 2 };
  }
  return { start: line.x, end: line.x + width };
}

// Widest text (normalized) the line can hold, anchored per its alignment.
export function lineAvailableWidth(
  lines: CachedLine[],
  line: CachedLine,
  align: LineAlign,
  obstacles: PageObstacle[] = []
): number {
  const { min, max } = lineHorizontalLimits(lines, line, obstacles);
  if (align === 'right') return line.x + line.w - min;
  if (align === 'center') return 2 * Math.min(line.x + line.w / 2 - min, max - (line.x + line.w / 2));
  return max - line.x;
}

export function lineOverflows(
  lines: CachedLine[],
  line: CachedLine,
  align: LineAlign,
  width: number,
  obstacles: PageObstacle[] = []
): boolean {
  const extent = lineExtent(line, align, width);
  const limits = lineHorizontalLimits(lines, line, obstacles);
  return extent.start < limits.min - 0.001 || extent.end > limits.max + 0.001;
}

// Largest point size (in 0.5pt steps, at least half the original) at which
// text measuring `width` at `sizePt` fits inside the line's limits.
export function fitFontSize(
  lines: CachedLine[],
  line: CachedLine,
  align: LineAlign,
  width: number,
  sizePt: number,
  obstacles: PageObstacle[] = []
): number {
  const available = lineAvailableWidth(lines, line, align, obstacles);
  if (width <= available) return sizePt;
  const fitted = Math.floor(((sizePt * available) / width) * 2) / 2;
  return Math.max(fitted, Math.ceil(line.fontSizePt / 2));
}

// ---------- Wrapping onto following lines ----------

export interface LineStyle {
  family: CachedLine['fontFamily'];
  bold: boolean;
  italic: boolean;
  sizePt: number;
  align: LineAlign;
}

export interface WrapContext {
  lines: CachedLine[];
  obstacles: PageObstacle[];
  pageWidthPts: number;
  pageHeightPts: number;
  textOf: (line: CachedLine) => string; // current text (with edits)
  styleOf: (line: CachedLine) => LineStyle; // effective style (with overrides)
  measure: (line: CachedLine, text: string) => number; // normalized width in that line's style
}

export interface WrapPlan {
  edits: Record<number, string>; // line index -> new text
  newLines: CachedLine[]; // lines to add below the paragraph
}

const BULLET = /^\s*([•●▪◦‣■□➢►▶✓✔–—*-]|\d{1,2}[.)])\s+/;
const BULLET_ONLY = /^\s*([•●▪◦‣■□➢►▶✓✔–—*-]|\d{1,2}[.)])\s*$/;
const MAX_NEW_LINES = 8;

const edgeOf = (l: CachedLine, align: LineAlign) =>
  align === 'right' ? l.x + l.w : align === 'center' ? l.x + l.w / 2 : l.x;

// The lines below `start` that read as the rest of its paragraph: same
// column and alignment, same size, evenly spaced, and not a new bullet.
function paragraphContinuation(ctx: WrapContext, start: CachedLine): CachedLine[] {
  const { align, sizePt } = ctx.styleOf(start);
  const tol = Math.max(1.5, sizePt * 0.3) / ctx.pageWidthPts;
  const result: CachedLine[] = [];
  let prev = start;
  let leading: number | null = null;
  for (;;) {
    let next: CachedLine | null = null;
    for (const l of ctx.lines) {
      if (l === prev || l.baselinePt >= prev.baselinePt - 0.5) continue; // must be below
      const gap = prev.baselinePt - l.baselinePt;
      if (gap > sizePt * 2.2) continue;
      if (next && prev.baselinePt - next.baselinePt <= gap) continue; // keep the nearest
      // the nearest line below has to overlap this column at all
      if (l.x > start.x + Math.max(start.w, tol) || l.x + l.w < start.x) continue;
      next = l;
    }
    if (!next) break;
    const style = ctx.styleOf(next);
    const text = ctx.textOf(next);
    const gap = prev.baselinePt - next.baselinePt;
    if (Math.abs(style.sizePt - sizePt) > sizePt * 0.15) break;
    if (style.align !== align && !next.synthetic) {
      // alignment is guessed per line; accept a line that matches the edge
      if (Math.abs(edgeOf(next, align) - edgeOf(start, align)) > tol) break;
    }
    if (leading !== null && Math.abs(gap - leading) > leading * 0.25) break;
    if (text.includes('\t') || BULLET.test(text)) break;
    if (!next.synthetic) {
      // A list looks like a paragraph geometrically. A bullet drawn beside
      // the next line (a "●" text line, or a small icon) starts a new item.
      const nextRow = glyphBand(next);
      const onRow = (o: { yTop: number; h: number }) => o.yTop < nextRow.bottom && o.yTop + o.h > nextRow.top;
      const justLeft = (o: { x: number; w: number }) =>
        o.x + o.w <= next.x + 0.001 && next.x - (o.x + o.w) < (sizePt * 3) / ctx.pageWidthPts;
      const marker =
        ctx.lines.some((o) => o !== next && BULLET_ONLY.test(o.text) && onRow(o) && justLeft(o)) ||
        ctx.obstacles.some((o) => o.w * ctx.pageWidthPts < sizePt * 2 && onRow(o) && justLeft(o));
      if (marker) break;
      // Otherwise tell them apart the way the author's line break does: if
      // the next line's first word would have fit at the end of this one,
      // the break was deliberate.
      const prevWidth = prev === start || !prev.synthetic ? prev.w : ctx.measure(prev, ctx.textOf(prev));
      const lines = [...result, start, next];
      const firstWord = text.trim().split(/\s+/)[0] ?? '';
      const room =
        align === 'left'
          ? Math.max(...lines.map((l) => l.x + l.w)) - (prev.x + prevWidth)
          : Math.max(...lines.map((l) => l.w)) - prevWidth;
      if (firstWord && ctx.measure(prev, ` ${firstWord}`) <= room) break;
    }
    if (align === 'left') {
      // continuation lines may hang-indent under a bullet, but never start left of it
      if (next.x < start.x - tol || next.x > start.x + (sizePt * 4) / ctx.pageWidthPts) break;
    } else if (Math.abs(edgeOf(next, align) - edgeOf(start, align)) > tol) {
      break;
    }
    result.push(next);
    leading = gap;
    prev = next;
  }
  return result;
}

// The lines above `start` in the same paragraph, nearest first.
function paragraphAbove(ctx: WrapContext, start: CachedLine): CachedLine[] {
  const { sizePt } = ctx.styleOf(start);
  const result: CachedLine[] = [];
  let cur = start;
  while (result.length < 20) {
    let above: CachedLine | null = null;
    for (const l of ctx.lines) {
      if (l === cur || l.synthetic || l.baselinePt <= cur.baselinePt + 0.5) continue;
      const gap = l.baselinePt - cur.baselinePt;
      if (gap > sizePt * 2.2) continue;
      if (above && above.baselinePt - cur.baselinePt <= gap) continue;
      if (l.x > cur.x + Math.max(cur.w, 0.002) || l.x + l.w < cur.x) continue;
      above = l;
    }
    if (!above || paragraphContinuation(ctx, above)[0] !== cur) break;
    result.push(above);
    cur = above;
  }
  return result;
}

const rectsOverlap = (
  a: { x: number; yTop: number; w: number; h: number },
  b: { x: number; yTop: number; w: number; h: number }
) => a.x < b.x + b.w && a.x + a.w > b.x && a.yTop < b.yTop + b.h && a.yTop + a.h > b.yTop;

// Reflows `text` (the new text of `start`) together with the rest of its
// paragraph so every line fits, adding lines below where there's free room.
// Returns null when it can't: the text has tab-separated columns, a single
// word is wider than the line, or there's no space below for what's left.
export function planLineWrap(ctx: WrapContext, start: CachedLine, text: string): WrapPlan | null {
  if (text.includes('\t')) return null;
  const startStyle = ctx.styleOf(start);
  const align = startStyle.align;
  const para = paragraphContinuation(ctx, start);
  const targets: CachedLine[] = [start, ...para];
  const words = [text, ...para.map((l) => ctx.textOf(l))]
    .join(' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 2) return null;

  // wrap to the paragraph's existing column width when it has one, rather
  // than to all the free space beside it (lines an earlier wrap added don't
  // say anything about the column)
  const column = [...paragraphAbove(ctx, start), start, ...para.filter((l) => !l.synthetic)];
  const columnCap = (line: CachedLine) => {
    if (column.length < 2) return Infinity;
    if (align === 'left') return Math.max(...column.map((l) => l.x + l.w)) - line.x;
    return Math.max(...column.map((l) => l.w));
  };
  const last = targets[targets.length - 1];
  const leadingPts =
    para.length > 0 ? (start.baselinePt - last.baselinePt) / para.length : startStyle.sizePt * 1.2;

  // new lines hang under the text after a bullet, if there is one
  const bullet = align === 'left' ? BULLET.exec(ctx.textOf(start)) ?? BULLET.exec(text) : null;
  const newLineX =
    align === 'left'
      ? para.length > 0
        ? last.x
        : start.x + (bullet ? ctx.measure(start, bullet[0]) : 0)
      : edgeOf(start, align);

  const lastStyle = ctx.styleOf(last);
  // k = how many lines below the paragraph's last line
  const makeLine = (k: number): CachedLine => {
    const sizePt = lastStyle.sizePt;
    const baselinePt = last.baselinePt - leadingPts * k;
    const topPt = ctx.pageHeightPts - baselinePt - sizePt * ASCENT_MULT;
    return {
      ...last,
      index: ctx.lines.length + newLines.length,
      text: '',
      x: newLineX,
      w: 0,
      yTop: topPt / ctx.pageHeightPts,
      h: (sizePt * LINE_HEIGHT_MULT) / ctx.pageHeightPts,
      baselinePt,
      leftPt: newLineX * ctx.pageWidthPts,
      fontSizePt: sizePt,
      fontFamily: lastStyle.family,
      bold: lastStyle.bold,
      italic: lastStyle.italic,
      align,
      synthetic: true,
    };
  };

  const edits: Record<number, string> = {};
  const newLines: CachedLine[] = [];
  const allLines = () => [...ctx.lines, ...newLines];
  const paraCount = targets.length;
  let w = 0;
  for (let t = 0; w < words.length; t++) {
    let line: CachedLine;
    const isNew = t >= targets.length;
    if (!isNew) {
      line = targets[t];
    } else {
      if (t - paraCount >= MAX_NEW_LINES) return null;
      line = makeLine(t - paraCount + 1);
      if (line.yTop + line.h > 0.99) return null; // off the bottom of the page
    }
    const maxWidth = Math.min(columnCap(line), lineAvailableWidth(allLines(), line, align, ctx.obstacles));
    let lineText = words[w];
    if (ctx.measure(line, lineText) > maxWidth + 0.001) return null; // one word too wide to wrap
    w++;
    while (w < words.length) {
      const candidate = `${lineText} ${words[w]}`;
      if (ctx.measure(line, candidate) > maxWidth + 0.001) break;
      lineText = candidate;
      w++;
    }
    if (isNew) {
      // the new line must land in empty space
      const width = ctx.measure(line, lineText);
      const ext = lineExtent(line, align, width);
      const band = glyphBand(line);
      const box = { x: ext.start, w: ext.end - ext.start, yTop: band.top, h: band.bottom - band.top };
      const blocked =
        ctx.lines.some((o) => {
          if (targets.includes(o) || (o.synthetic && !ctx.textOf(o))) return false;
          const ob = glyphBand(o);
          return rectsOverlap(box, { x: o.x, w: o.w, yTop: ob.top, h: ob.bottom - ob.top });
        }) ||
        ctx.obstacles.some((o) => {
          if (!rectsOverlap(box, o)) return false;
          // an image under the paragraph (a photo, its drop shadow) is background
          if (o.kind === 'image') return !targets.some((l) => rectsOverlap(l, o));
          // so is a panel the whole paragraph sits on
          return !targets.every(
            (l) =>
              l.x >= o.x - 0.002 && l.x + l.w <= o.x + o.w + 0.002 && l.yTop >= o.yTop && l.yTop + l.h <= o.yTop + o.h
          );
        });
      if (blocked) return null;
      // reuse a line an earlier wrap already added here
      const existing = ctx.lines.find(
        (o) => o.synthetic && Math.abs(o.baselinePt - line.baselinePt) < 0.5 && Math.abs(o.x - line.x) < 0.002
      );
      if (existing) edits[existing.index] = lineText;
      else {
        newLines.push(line);
        edits[line.index] = lineText;
      }
      targets.push(existing ?? line);
    } else if (lineText !== ctx.textOf(line) || line === start) {
      edits[line.index] = lineText;
    }
  }
  // paragraph lines the text no longer reaches are emptied
  for (const l of targets) {
    if (!(l.index in edits) && ctx.textOf(l)) edits[l.index] = '';
  }
  return { edits, newLines };
}
