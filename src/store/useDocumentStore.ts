import { create } from 'zustand';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PDFDocument, degrees, rgb, StandardFonts, EncryptedPDFError, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, type PDFFont } from '@cantoo/pdf-lib';
import * as fontkit from 'fontkit';
import { PDFDocument as SigningPDFDocument } from 'pdf-lib';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import signpdf from '@signpdf/signpdf';
import { P12Signer } from '@signpdf/signer-p12';
import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  ImageRun,
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom,
} from 'docx';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';
import { removeTextInBands, isInTextBand, type TextBand } from './contentStreamText';
import { FONT_FAMILY_CSS } from '../components/FontFamilyDropdown';
import { compressPdfInPlace, type CompressStats } from './compressPdf';
import { stripUnusedGlyphs } from './fontStrip';
import {
  ASCENT_MULT,
  LINE_BASELINE_RATIO,
  LINE_HEIGHT_MULT,
  collectPageObstacles,
  type PageObstacle,
} from './lineLayout';

export {
  LINE_BASELINE_RATIO,
  fitFontSize,
  lineExtent,
  lineHorizontalLimits,
  lineOverflows,
  planLineWrap,
  type PageObstacle,
  type WrapPlan,
} from './lineLayout';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

// ---------- Annotations ----------
export type AnnotationType = 'highlight' | 'note' | 'ink' | 'text' | 'image' | 'redact';

export interface BaseAnnotation {
  id: string;
  type: AnnotationType;
  page: number; // 1-indexed
  color: string;
}

export interface HighlightAnnotation extends BaseAnnotation {
  type: 'highlight';
  // normalized (0-1) rect relative to page size, so it survives zoom changes
  x: number;
  y: number;
  w: number;
  h: number;
  opacity?: number; // 0.35 = translucent highlight (default), 1 = solid bucket fill
}

export interface NoteAnnotation extends BaseAnnotation {
  type: 'note';
  x: number;
  y: number;
  text: string;
}

export interface InkAnnotation extends BaseAnnotation {
  type: 'ink';
  points: { x: number; y: number }[]; // normalized
}

export type TextFontFamily =
  | 'Helvetica'
  | 'TimesRoman'
  | 'Courier'
  | 'Display'
  | 'Handwriting'
  | 'Condensed'
  | 'Poppins'
  | 'Montserrat'
  | 'Roboto'
  | 'OpenSans'
  | 'Merriweather'
  | 'Lato'
  | 'Barlow'
  | 'FiraSans'
  | 'Ubuntu'
  | 'PTSans'
  | 'PTSerif';

export interface TextBoxAnnotation extends BaseAnnotation {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number; // real point size (e.g. 14 = 14pt), not a display multiplier
  fontFamily?: TextFontFamily;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  bgColor?: string; // set via the Bucket Fill tool
}

export interface ImageAnnotation extends BaseAnnotation {
  type: 'image';
  x: number;
  y: number;
  w: number;
  h: number;
  dataUrl: string; // base64 data URL, png or jpeg
}

export interface RedactionAnnotation extends BaseAnnotation {
  type: 'redact';
  x: number;
  y: number;
  w: number;
  h: number;
  applied: boolean; // true once the page has been flattened/rasterized
}

export type Annotation =
  | HighlightAnnotation
  | NoteAnnotation
  | InkAnnotation
  | TextBoxAnnotation
  | ImageAnnotation
  | RedactionAnnotation;

function hexToRgb01(hex: string) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return rgb(r, g, b);
}

// ---------- Forms ----------
export type FormFieldKind = 'text' | 'checkbox' | 'radio' | 'dropdown';

export interface DetectedFormField {
  id: string; // unique per widget instance, used as React key
  fieldName: string; // the actual PDF field name, used to mutate the field
  kind: FormFieldKind;
  page: number; // 1-indexed
  x: number; // normalized 0-1, left
  y: number; // normalized 0-1, top
  w: number;
  h: number;
  value: string;
  options?: string[]; // dropdown/radio choices
  optionValue?: string; // for radio widgets: the specific export value this widget represents
}

// ---------- OCR ----------
export interface OcrWord {
  text: string;
  x: number; // normalized 0-1
  y: number;
  w: number;
  h: number;
}

// ---------- Saved signatures (persisted in localStorage) ----------
export interface SavedSignature {
  id: string;
  name: string;
  dataUrl: string;
  w: number;
  h: number;
}

const SIGNATURES_KEY = 'pdfsuite:saved-signatures';
const THEME_KEY = 'pdfsuite:theme';
const PROFILE_KEY = 'pdfsuite:profile';

export interface UserProfile {
  name: string;
  email: string;
}

function loadProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistProfile(profile: UserProfile | null) {
  try {
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(PROFILE_KEY);
  } catch {
    // ignore — profile just won't persist this session in private browsing etc.
  }
}

export type Theme = 'light' | 'dark';

function loadTheme(): Theme {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return raw === 'light' || raw === 'dark' ? raw : 'dark';
  } catch {
    return 'dark';
  }
}

function persistTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore — theme just won't persist this session in private browsing etc.
  }
}

function loadSavedSignatures(): SavedSignature[] {
  try {
    const raw = localStorage.getItem(SIGNATURES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistSavedSignatures(sigs: SavedSignature[]) {
  try {
    localStorage.setItem(SIGNATURES_KEY, JSON.stringify(sigs));
  } catch {
    // storage unavailable (private browsing etc.) — fail silently, in-memory state still works this session
  }
}

// ---------- PDF -> Word layout reconstruction helpers ----------
// Pure client-side reconstruction of paragraph structure, alignment, and
// heading levels from PDF.js text positions, plus best-effort inline image
// extraction. This does NOT achieve true table reconstruction (that needs
// real content-stream/grid analysis, a much larger project) — tables come
// out as sequential lines, called out clearly wherever this is surfaced
// in the UI.

interface TextLine {
  text: string;
  x: number; // left edge, PDF points
  right: number; // right edge, PDF points
  y: number; // baseline, PDF points
  fontSize: number;
  color: string; // best-effort detected fill color, hex
  fontFamily: TextFontFamily; // best-effort category, mapped to our closest embeddable equivalent
  bold: boolean; // detected via the font's real base name (e.g. "Helvetica-Bold")
  italic: boolean; // detected the same way (e.g. "Helvetica-Italic")
  weight: number; // 400 regular, 500 medium, 600 semibold, 700 bold
}

export type LineAlign = 'left' | 'center' | 'right';

export interface LineStyleOverride {
  fontFamily: TextFontFamily;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: LineAlign;
}

export interface CachedLine {
  index: number;
  text: string;
  // normalized (0-1) display box, top-left origin — for rendering overlays
  x: number;
  yTop: number;
  w: number;
  h: number;
  // raw PDF-point values — for accurate export baking
  baselinePt: number;
  leftPt: number;
  fontSizePt: number;
  color: string; // best-effort detected original fill color, hex
  fontFamily: TextFontFamily; // best-effort category match, not the exact original typeface
  bold: boolean; // detected original weight is semibold or heavier
  italic: boolean; // detected original slant
  weight: number; // detected original weight: 400, 500, 600 or 700
  // which edge stays put when the text changes length — detected from the
  // neighbouring lines in the same column (see detectLineAlignments)
  align: LineAlign;
  // a line added below a paragraph when edited text wrapped past its last
  // line — there was no text here in the original page
  synthetic?: boolean;
}

// PDFs don't record alignment, so infer it the way a reader would: a line
// is right-aligned if it shares its right edge with a nearby line in the
// same column (and centered if it shares its center), e.g. the stacked
// right-aligned title block on a brochure cover. Neighbours of nearly the
// same width say nothing (all three edges match), so they're skipped.
// Anything undecided stays left-aligned, which is how the editor has
// always behaved.
function detectLineAlignments(lines: CachedLine[], pageWidthPts: number): LineAlign[] {
  const geo = lines.map((l) => {
    const left = l.leftPt;
    const right = l.leftPt + l.w * pageWidthPts;
    return { left, right, center: (left + right) / 2, width: right - left, y: l.baselinePt, size: l.fontSizePt };
  });
  return geo.map((g, i) => {
    const votes = { left: 0, center: 0, right: 0 };
    geo.forEach((o, j) => {
      if (i === j) return;
      const maxSize = Math.max(g.size, o.size);
      if (Math.abs(o.y - g.y) > maxSize * 6) return; // not a neighbour
      if (o.right < g.left || o.left > g.right) return; // different column
      // glyph side-bearings scale with size, so a 36pt title's edge sits a
      // few points off the 12pt lines it's aligned with
      const tol = Math.max(1.5, maxSize * 0.2);
      if (Math.abs(o.width - g.width) <= tol) return; // uninformative
      const diffs: [LineAlign, number][] = [
        ['left', Math.abs(o.left - g.left)],
        ['center', Math.abs(o.center - g.center)],
        ['right', Math.abs(o.right - g.right)],
      ];
      const [best, diff] = diffs.reduce((a, b) => (b[1] < a[1] ? b : a));
      if (diff <= tol) votes[best]++;
    });
    if (votes.right > votes.left && votes.right >= votes.center) return 'right';
    if (votes.center > votes.left && votes.center > votes.right) return 'center';
    return 'left';
  });
}

// Samples the real rendered color around a text box, avoiding its center
// (where the glyphs we're trying to hide actually are) so the "cover"
// drawn behind edited text matches its real surroundings — a colored
// banner, a shaded table row — instead of always being flat white, which
// broke visibly outside a plain white page. Used both for the on-screen
// preview and for what actually gets baked into the saved file, so the
// two agree with each other, not just each independently guessing white.
export function sampleBoxBackgroundColor(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  pw: number,
  ph: number
): string {
  const points: [number, number][] = [
    [px + 1, py + 1],
    [px + pw - 1, py + 1],
    [px + 1, py + ph - 1],
    [px + pw - 1, py + ph - 1],
    [px + pw / 2, py + 1],
    [px + pw / 2, py + ph - 1],
  ];
  const counts = new Map<string, number>();
  for (const [x, y] of points) {
    try {
      const data = ctx.getImageData(Math.max(0, Math.round(x)), Math.max(0, Math.round(y)), 1, 1).data;
      const hex = `#${[data[0], data[1], data[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    } catch {
      // out-of-bounds or tainted canvas — skip this sample point
    }
  }
  let best = '#FFFFFF';
  let bestCount = 0;
  for (const [color, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = color;
    }
  }
  return best;
}

function multiplyMatrix(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

// Best-effort per-line color detection: pdf.js's getTextContent() doesn't
// expose fill color directly, so this walks the raw operator list —
// tracking the current fill color through save/restore and color-setting
// ops — and records the color in effect at each text-draw operation, in
// stream order. That order is then matched positionally against
// getTextContent's items (which are built from the same stream, in the
// same order), giving each text item a color without needing to
// reconstruct exact glyph positions. This is genuinely best-effort: text
// colored via a Pattern or Separation colorspace (rare in ordinary
// documents) isn't resolved and falls back to black, and any place the
// two orderings diverge could mis-attribute a color to a neighboring
// item — acceptable for "detect and reuse the existing color when
// editing," not something to rely on for exact reproduction.
async function extractFillColorsInOrder(
  page: Awaited<ReturnType<PDFDocumentProxy['getPage']>>
): Promise<string[]> {
  const colors: string[] = [];
  try {
    const opList = await page.getOperatorList();
    const OPS = pdfjsLib.OPS;
    let fillColor = '#000000';

    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i];
      const args = opList.argsArray[i] as unknown[];
      if (
        fn === OPS.setFillRGBColor ||
        fn === OPS.setFillGray ||
        fn === OPS.setFillCMYKColor ||
        fn === OPS.setFillColor
      ) {
        // pdf.js's operator list already pre-formats every fill-color op
        // into a ready CSS hex string in args[0] (verified directly
        // against pdf.js's actual output, not assumed) — a Pattern or
        // Separation colorspace is the one case that won't produce a
        // parseable hex string here, in which case the previous color is
        // simply kept rather than guessing.
        if (typeof args?.[0] === 'string' && args[0].startsWith('#')) {
          fillColor = args[0];
        }
      } else if (
        fn === OPS.showText ||
        fn === OPS.showSpacedText ||
        fn === OPS.nextLineShowText ||
        fn === OPS.nextLineSetSpacingShowText
      ) {
        colors.push(fillColor);
      }
    }
  } catch {
    // if this fails for any reason, every line just falls back to black
  }
  return colors;
}

async function extractTextLines(page: Awaited<ReturnType<PDFDocumentProxy['getPage']>>): Promise<TextLine[]> {
  const textContent = await page.getTextContent();
  const colorSamples = await extractFillColorsInOrder(page);
  type Item = { str: string; transform: number[]; width: number; height: number; fontName?: string };
  const styles = (textContent.styles ?? {}) as Record<string, { fontFamily?: string }>;

  // Matches the document's real embedded font by its base name (e.g.
  // "MUFUZY+Poppins-SemiBold") to the same family we bundle, so an edited
  // line keeps its typeface — this was the "font changes when editing"
  // complaint: Google Slides/Canva exports use Poppins, Montserrat etc.,
  // which we ship, but every line was being mapped to Helvetica. Fonts we
  // don't bundle fall back to pdf.js's coarse CSS category (sans-serif /
  // serif / monospace) as before.
  const baseNameByFont = new Map<string, string>();
  const NAMED_FAMILIES: [RegExp, TextFontFamily][] = [
    [/poppins/, 'Poppins'],
    [/montserrat/, 'Montserrat'],
    [/roboto/, 'Roboto'],
    [/open-?sans/, 'OpenSans'],
    [/merriweather/, 'Merriweather'],
    [/lato/, 'Lato'],
    [/barlow/, 'Barlow'],
    [/fira-?sans/, 'FiraSans'],
    [/ubuntu/, 'Ubuntu'],
    [/pt-?serif|ptserif/, 'PTSerif'],
    [/pt-?sans|ptsans/, 'PTSans'],
    [/playfair/, 'Display'],
    [/oswald/, 'Condensed'],
    [/arial|helvetica|liberationsans/, 'Helvetica'],
    [/times|liberationserif/, 'TimesRoman'],
    [/courier/, 'Courier'],
  ];
  const mapFontCategory = (fontName: string | undefined): TextFontFamily => {
    const baseName = fontName ? baseNameByFont.get(fontName) ?? '' : '';
    for (const [re, fam] of NAMED_FAMILIES) {
      if (re.test(baseName)) return fam;
    }
    const family = fontName ? styles[fontName]?.fontFamily ?? '' : '';
    if (family.includes('serif') && !family.includes('sans-serif')) return 'TimesRoman';
    if (family.includes('monospace')) return 'Courier';
    return 'Helvetica';
  };

  // Bold detection: pdf.js's getTextContent()/styles API doesn't expose a
  // weight flag, but the loaded font object (available via commonObjs,
  // keyed by the same fontName each text item references) does have the
  // font's real base name — e.g. "Helvetica-Bold" — which reliably
  // contains "Bold" for the overwhelming majority of real PDFs, since
  // that's standard PDF/PostScript font-naming convention. Verified
  // directly against a real generated PDF before relying on it.
  const boldFontNames = new Set<string>();
  const italicFontNames = new Set<string>();
  // the exact weight, so a SemiBold heading isn't re-set in Bold
  const weightByFont = new Map<string, number>();
  for (const fontName of Object.keys(styles)) {
    try {
      const fontObj = page.commonObjs.get(fontName) as { name?: string } | undefined;
      const baseName = (fontObj?.name ?? '').toLowerCase();
      baseNameByFont.set(fontName, baseName);
      if (/bold|black|heavy|semibold|extrabold/.test(baseName)) {
        boldFontNames.add(fontName);
      }
      if (/italic|oblique/.test(baseName)) {
        italicFontNames.add(fontName);
      }
      weightByFont.set(
        fontName,
        /black|heavy|extrabold|ultrabold/.test(baseName)
          ? 700
          : /semibold|demibold|semi-bold|demi-bold/.test(baseName)
          ? 600
          : /bold/.test(baseName)
          ? 700
          : /medium/.test(baseName)
          ? 500
          : 400
      );
    } catch {
      // font object not resolvable synchronously — leave undetected (falls back to not-bold/not-italic)
    }
  }

  const items = (textContent.items as Item[]).filter((it) => it.str !== undefined);
  const itemColor = new Map<Item, string>();
  // pdf.js's getTextContent() inserts synthetic empty-string "end of line"
  // marker items that don't correspond to an actual showText call in the
  // operator list — verified directly (a 4-line, 4-color test produced 5
  // items, with the extra one being an empty hasEOL marker). Excluding
  // those before zipping against colorSamples is what keeps the two
  // sequences aligned; without it, every color after the first line ends
  // up shifted onto the wrong text.
  const drawableItems = items.filter((it) => it.str !== '');
  drawableItems.forEach((it, i) => itemColor.set(it, colorSamples[i] ?? '#000000'));

  // Group into lines by baseline proximity AND horizontal proximity.
  //
  // This is the fix for a real, confirmed bug: grouping by Y-baseline
  // alone merges content from different table columns whenever they
  // happen to share a baseline — e.g. a "Traveler: ..." field on the
  // left and an unrelated "Agency: ..." field on the right of the same
  // visual row. The two are genuinely separate fields, but shared a
  // baseline in the PDF, so they were being treated as one continuous
  // editable line spanning the entire row width. Editing that merged
  // "line" then collapsed two unrelated fields into a single string,
  // which is exactly the "selects a whole block" and "text shifts out
  // of position" behavior reported — the fix isn't really about
  // selection or repositioning at all, it's that the line was wrong
  // from the moment it was detected.
  //
  // A large horizontal gap at a matching baseline is treated as a
  // column boundary (a new, separate line) rather than the same line —
  // ordinary single-line text essentially never has a gap this size,
  // but two unrelated table columns very commonly do.
  const lines: { y: number; parts: Item[]; minX: number; maxRight: number }[] = [];
  for (const item of items) {
    // Whitespace-only items are excluded here entirely, not just the
    // empty-string EOL markers. pdf.js synthesizes a "space" item to
    // fill any gap between disjoint text-showing operations, and gives
    // it a width equal to the *entire* visual gap — verified directly:
    // a real 236pt gap between two unrelated table-column fields showed
    // up as a single space item with a 236pt-wide box. Letting that
    // synthetic item extend a line's boundary silently absorbed the gap
    // before the next real word could ever be checked against it, which
    // defeated the column-boundary detection below entirely. Real word
    // items alone are enough to detect gaps correctly, and the line-text
    // reconstruction step further down already synthesizes its own
    // spacing from real word positions, so nothing is lost by excluding these.
    if (!item.str.trim()) continue;
    const y = item.transform[5];
    const x = item.transform[4];
    const size = Math.hypot(item.transform[0], item.transform[1]) || 10;
    const itemRight = x + item.width;
    // Same threshold the codebase already uses to decide "this gap looks
    // like a different field, insert a tab rather than a space" — tested
    // directly against the real uploaded ticket: a genuine field boundary
    // (Traveler's value ending, Agency's label starting) measured a
    // 49pt gap at 10pt font, a 4.9x ratio. An arbitrary 12x threshold
    // I'd picked first (calibrated only against my own synthetic test,
    // not a real document) was too generous and still merged them —
    // caught by testing against the actual file, not by assuming the
    // first version was correct.
    const HUGE_GAP = size * 1.8;

    let bestLine: (typeof lines)[number] | undefined;
    let bestGap = Infinity;
    for (const l of lines) {
      if (Math.abs(l.y - y) >= 2.5) continue;
      const gap = x > l.maxRight ? x - l.maxRight : l.minX > itemRight ? l.minX - itemRight : 0;
      if (gap < HUGE_GAP && gap < bestGap) {
        bestGap = gap;
        bestLine = l;
      }
    }

    if (!bestLine) {
      bestLine = { y, parts: [], minX: x, maxRight: itemRight };
      lines.push(bestLine);
    } else {
      bestLine.minX = Math.min(bestLine.minX, x);
      bestLine.maxRight = Math.max(bestLine.maxRight, itemRight);
    }
    bestLine.parts.push(item);
  }

  lines.sort((a, b) => (Math.abs(b.y - a.y) < 2.5 ? a.minX - b.minX : b.y - a.y)); // top to bottom, then left to right within a shared baseline

  return lines.map((line) => {
    line.parts.sort((a, b) => a.transform[4] - b.transform[4]);
    let text = '';
    let prevEnd: number | null = null;
    let minX = Infinity;
    let maxRight = -Infinity;
    let sizeSum = 0;
    const colorCounts = new Map<string, number>();
    const familyCounts = new Map<TextFontFamily, number>();
    let boldParts = 0;
    let italicParts = 0;
    const weightCounts = new Map<number, number>();
    for (const part of line.parts) {
      const x = part.transform[4];
      const size = Math.hypot(part.transform[0], part.transform[1]) || 10;
      if (prevEnd !== null && x - prevEnd > size * 1.8) {
        text += '\t'; // big horizontal gap — likely a column boundary
      } else if (prevEnd !== null && x - prevEnd > size * 0.15) {
        text += ' ';
      }
      text += part.str;
      prevEnd = x + part.width;
      minX = Math.min(minX, x);
      maxRight = Math.max(maxRight, x + part.width);
      sizeSum += size;
      const c = itemColor.get(part) ?? '#000000';
      colorCounts.set(c, (colorCounts.get(c) ?? 0) + 1);
      const fam = mapFontCategory(part.fontName);
      familyCounts.set(fam, (familyCounts.get(fam) ?? 0) + 1);
      if (part.fontName && boldFontNames.has(part.fontName)) boldParts++;
      if (part.fontName && italicFontNames.has(part.fontName)) italicParts++;
      const wt = (part.fontName && weightByFont.get(part.fontName)) || 400;
      weightCounts.set(wt, (weightCounts.get(wt) ?? 0) + 1);
    }
    let color = '#000000';
    let bestColorCount = 0;
    for (const [c, count] of colorCounts) {
      if (count > bestColorCount) {
        bestColorCount = count;
        color = c;
      }
    }
    let fontFamily: TextFontFamily = 'Helvetica';
    let bestFamilyCount = 0;
    for (const [fam, count] of familyCounts) {
      if (count > bestFamilyCount) {
        bestFamilyCount = count;
        fontFamily = fam;
      }
    }
    // majority vote, same as color/family — a line is "bold"/"italic" if
    // most of its characters were drawn with a bold/italic-named font
    const bold = boldParts > line.parts.length / 2;
    const italic = italicParts > line.parts.length / 2;
    let weight = bold ? 700 : 400;
    let bestWeightCount = 0;
    for (const [wt, count] of weightCounts) {
      if (count > bestWeightCount && wt >= 600 === bold) {
        bestWeightCount = count;
        weight = wt;
      }
    }
    return {
      text,
      x: minX,
      right: maxRight,
      y: line.y,
      bold,
      italic,
      weight,
      fontSize: sizeSum / line.parts.length,
      color,
      fontFamily,
    };
  });
}

interface ExtractedImage {
  x: number; // PDF points from left
  yFromTop: number; // PDF points from top
  w: number;
  h: number;
  pngBytes: Uint8Array;
}

// Reads an image file, adds a new page sized to fit it, and draws it full-page
// — shared by both the single-image and bulk multi-image "Create PDF from
// Image" actions so they stay in sync rather than duplicating this logic.
async function embedImageAsPage(pdfDoc: PDFDocument, file: File): Promise<void> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const dims: { w: number; h: number } = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.width, h: img.height });
    img.onerror = reject;
    img.src = dataUrl;
  });

  const base64 = dataUrl.split(',')[1] ?? '';
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const isPng = dataUrl.startsWith('data:image/png');
  const embedded = isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);

  // scale to fit a standard page while preserving aspect ratio
  const maxW = 612;
  const maxH = 792;
  const scale = Math.min(maxW / dims.w, maxH / dims.h, 1);
  const pageW = dims.w * scale;
  const pageH = dims.h * scale;
  const page = pdfDoc.addPage([pageW, pageH]);
  page.drawImage(embedded, { x: 0, y: 0, width: pageW, height: pageH });
}

async function extractPageImages(
  page: Awaited<ReturnType<PDFDocumentProxy['getPage']>>,
  scale: number
): Promise<ExtractedImage[]> {
  const results: ExtractedImage[] = [];
  try {
    const viewport = page.getViewport({ scale });
    const renderCanvas = document.createElement('canvas');
    renderCanvas.width = viewport.width;
    renderCanvas.height = viewport.height;
    const ctx = renderCanvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport, canvas: renderCanvas }).promise;

    const opList = await page.getOperatorList();
    const OPS = pdfjsLib.OPS;
    const pageHeightPts = page.view[3] - page.view[1];
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack: number[][] = [];

    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i];
      const args = opList.argsArray[i];
      if (fn === OPS.save) {
        stack.push(ctm);
      } else if (fn === OPS.restore) {
        ctm = stack.pop() ?? ctm;
      } else if (fn === OPS.transform) {
        ctm = multiplyMatrix(ctm, args as number[]);
      } else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
        // unit square [0,1]x[0,1] mapped through ctm gives the image's
        // placement in PDF page space (points, y-up)
        const corners = [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ].map(([ux, uy]) => [
          ctm[0] * ux + ctm[2] * uy + ctm[4],
          ctm[1] * ux + ctm[3] * uy + ctm[5],
        ]);
        const xs = corners.map((c) => c[0]);
        const ys = corners.map((c) => c[1]);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const w = maxX - minX;
        const h = maxY - minY;
        if (w < 4 || h < 4) continue; // skip specks/hairlines

        const cropX = Math.round(minX * scale);
        const cropY = Math.round((pageHeightPts - maxY) * scale);
        const cropW = Math.max(1, Math.round(w * scale));
        const cropH = Math.max(1, Math.round(h * scale));

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
        const cropCtx = cropCanvas.getContext('2d')!;
        cropCtx.drawImage(renderCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        const dataUrl = cropCanvas.toDataURL('image/png');
        const pngBytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));

        results.push({
          x: minX,
          yFromTop: pageHeightPts - maxY,
          w,
          h,
          pngBytes,
        });
      }
    }
  } catch (e) {
    console.warn('Image extraction failed for a page, continuing without its images:', e);
  }
  return results;
}

// Custom (non-standard) font files, served from /public/fonts and used both
// for on-screen preview (via @font-face in index.css) and for real PDF
// embedding here, so what you see while typing matches the export exactly.
// Each family lists the real faces we ship; a weight/style without its own
// file falls back to the nearest one (see fontFileFor). Display, Handwriting
// and Condensed only have a Regular file — Bold/Italic still show on screen
// (the browser synthesizes them) but export at Regular.
interface FontFaces {
  regular: string;
  italic?: string;
  medium?: string;
  mediumItalic?: string;
  semibold?: string;
  semiboldItalic?: string;
  bold?: string;
  boldItalic?: string;
}
const faces = (name: string, extra: (keyof FontFaces)[]): FontFaces => {
  const file: Record<keyof FontFaces, string> = {
    regular: 'Regular',
    italic: 'Italic',
    medium: 'Medium',
    mediumItalic: 'MediumItalic',
    semibold: 'SemiBold',
    semiboldItalic: 'SemiBoldItalic',
    bold: 'Bold',
    boldItalic: 'BoldItalic',
  };
  const out: FontFaces = { regular: `/fonts/${name}-Regular.ttf` };
  for (const k of extra) out[k] = `/fonts/${name}-${file[k]}.ttf`;
  return out;
};
const CUSTOM_FONT_FILES: Record<string, FontFaces> = {
  Display: { regular: '/fonts/PlayfairDisplay.ttf' },
  Handwriting: { regular: '/fonts/GochiHand.ttf' },
  Condensed: { regular: '/fonts/Oswald.ttf' },
  Poppins: faces('Poppins', ['italic', 'medium', 'mediumItalic', 'semibold', 'semiboldItalic', 'bold', 'boldItalic']),
  Montserrat: faces('Montserrat', ['italic', 'medium', 'mediumItalic', 'semibold', 'semiboldItalic', 'bold', 'boldItalic']),
  Roboto: faces('Roboto', ['italic', 'bold']),
  OpenSans: faces('OpenSans', ['italic', 'bold']),
  Merriweather: faces('Merriweather', ['italic', 'bold']),
  Lato: faces('Lato', ['italic', 'semibold', 'bold', 'boldItalic']),
  Barlow: faces('Barlow', ['italic', 'semibold', 'bold', 'boldItalic']),
  FiraSans: faces('FiraSans', ['italic', 'semibold', 'bold', 'boldItalic']),
  Ubuntu: faces('Ubuntu', ['italic', 'medium', 'bold', 'boldItalic']),
  PTSans: faces('PTSans', ['italic', 'bold', 'boldItalic']),
  PTSerif: faces('PTSerif', ['italic', 'bold', 'boldItalic']),
};

// The shipped face closest to the requested weight (400 regular, 500
// medium, 600 semibold, 700+ bold) and style.
function fontFileFor(files: FontFaces, weight: number, italic: boolean): string {
  if (weight >= 700) return (italic ? files.boldItalic : undefined) ?? files.bold ?? files.semibold ?? files.regular;
  if (weight >= 600) {
    return (italic ? files.semiboldItalic ?? files.boldItalic : undefined) ?? files.semibold ?? files.bold ?? files.regular;
  }
  if (weight >= 500) return (italic ? files.mediumItalic ?? files.italic : undefined) ?? files.medium ?? files.regular;
  return (italic ? files.italic : undefined) ?? files.regular;
}
const fontByteCache = new Map<string, ArrayBuffer>();
async function fetchFontBytes(url: string): Promise<ArrayBuffer> {
  const cached = fontByteCache.get(url);
  if (cached) return cached;
  const res = await fetch(url);
  const bytes = await res.arrayBuffer();
  fontByteCache.set(url, bytes);
  return bytes;
}

const STANDARD_VARIANTS: Record<string, Record<string, StandardFonts>> = {
  Helvetica: {
    '00': StandardFonts.Helvetica,
    '10': StandardFonts.HelveticaBold,
    '01': StandardFonts.HelveticaOblique,
    '11': StandardFonts.HelveticaBoldOblique,
  },
  TimesRoman: {
    '00': StandardFonts.TimesRoman,
    '10': StandardFonts.TimesRomanBold,
    '01': StandardFonts.TimesRomanItalic,
    '11': StandardFonts.TimesRomanBoldItalic,
  },
  Courier: {
    '00': StandardFonts.Courier,
    '10': StandardFonts.CourierBold,
    '01': StandardFonts.CourierOblique,
    '11': StandardFonts.CourierBoldOblique,
  },
};

// Embeds one family/weight/style into pdfDoc, at most once per cache. The
// doc must already have fontkit registered for the non-standard families.
// `weight` defaults to 700/400 from `bold`. Returns null if the font
// couldn't be embedded.
async function embedTextFont(
  pdfDoc: PDFDocument,
  family: TextFontFamily,
  bold: boolean,
  italic: boolean,
  cache: Map<string, PDFFont>,
  weight: number = bold ? 700 : 400
): Promise<PDFFont | null> {
  const combo = `${family}|${weight}|${italic}`;
  const cached = cache.get(combo);
  if (cached) return cached;

  if (STANDARD_VARIANTS[family]) {
    const key = `${weight >= 600 ? '1' : '0'}${italic ? '1' : '0'}`;
    try {
      const f = await pdfDoc.embedFont(STANDARD_VARIANTS[family][key]);
      cache.set(combo, f);
      return f;
    } catch (e) {
      console.warn(`Could not embed ${family} (weight=${weight}, italic=${italic}):`, e);
      return null;
    }
  }

  const files = CUSTOM_FONT_FILES[family];
  if (!files) return null;
  try {
    const bytes = await fetchFontBytes(fontFileFor(files, weight, italic));
    // Subset to just the characters used: a whole font is 75-650KB per
    // face, which made every edited PDF noticeably bigger. (Subsetting used
    // to crash with @pdf-lib/fontkit; upstream fontkit 2 works for all of
    // these files — verified by round-tripping each one through pdf.js.)
    const f = await pdfDoc.embedFont(bytes, { subset: true });
    cache.set(combo, f);
    return f;
  } catch (e) {
    console.warn(`Could not embed the "${family}" font:`, e);
    return null;
  }
}

// ---------- Baking direct line edits (Edit tool) ----------
// One changed line, with its effective style (override, else what was
// detected in the original PDF).
interface LineEditJob {
  line: CachedLine;
  text: string;
  family: TextFontFamily;
  bold: boolean;
  italic: boolean;
  weight: number;
  underline: boolean;
  sizePt: number;
  align: LineAlign;
  // set once drawn — where the new text actually starts/ends
  drawnLeftPt?: number;
  drawnRightPt?: number;
}

// Left edge (PDF points) for new text of `width`, anchored per the job's
// alignment — so a right-aligned title grows leftwards, not off the page.
function alignedLeftPt(job: LineEditJob, width: number, pageWidthPts: number): number {
  const lineWidthPts = job.line.w * pageWidthPts;
  if (job.align === 'right') return job.line.leftPt + lineWidthPts - width;
  if (job.align === 'center') return job.line.leftPt + (lineWidthPts - width) / 2;
  return job.line.leftPt;
}

// Toggling Bold sets a plain bold/regular weight; otherwise the line keeps
// its detected one (Medium, SemiBold...).
export function effectiveLineWeight(line: CachedLine, o?: Partial<LineStyleOverride>): number {
  if (o?.bold !== undefined) return o.bold ? 700 : 400;
  return line.weight ?? (line.bold ? 700 : 400);
}

function collectLineEditJobs(
  lines: CachedLine[],
  edits: Record<number, string>,
  overrides: Record<number, Partial<LineStyleOverride>>
): LineEditJob[] {
  const jobs: LineEditJob[] = [];
  const indices = new Set([...Object.keys(edits).map(Number), ...Object.keys(overrides).map(Number)]);
  for (const idx of indices) {
    const line = lines[idx];
    if (!line) continue;
    const o = overrides[idx];
    const text = edits[idx] ?? line.text;
    if (
      text === line.text &&
      !o?.fontFamily &&
      !o?.fontSize &&
      o?.bold === undefined &&
      o?.italic === undefined &&
      !o?.underline &&
      o?.align === undefined
    ) {
      continue; // nothing actually changed on this line
    }
    jobs.push({
      line,
      text,
      family: o?.fontFamily ?? line.fontFamily,
      bold: o?.bold ?? line.bold,
      italic: o?.italic ?? line.italic,
      weight: effectiveLineWeight(line, o),
      underline: o?.underline ?? false,
      // the line's real detected point size — not re-derived from its box
      // height, which is what made edited lines come out a different size
      sizePt: o?.fontSize ?? line.fontSizePt,
      align: o?.align ?? line.align,
    });
  }
  return jobs;
}

function bandsForJobs(jobs: LineEditJob[], pageWidthPts: number, useDrawnWidth: boolean): TextBand[] {
  return jobs.map((j) => {
    const originalLeft = j.line.leftPt;
    const originalRight = j.line.leftPt + j.line.w * pageWidthPts;
    if (!useDrawnWidth) {
      return { left: originalLeft, right: originalRight, baseline: j.line.baselinePt, size: j.line.fontSizePt };
    }
    return {
      left: Math.min(originalLeft, j.drawnLeftPt ?? originalLeft),
      right: Math.max(originalRight, j.drawnRightPt ?? originalRight),
      baseline: j.line.baselinePt,
      size: j.sizePt, // the new text may have been shrunk to fit
    };
  });
}

// Swaps edited lines in place as real vector text: the original glyphs are
// removed from the page's content stream and the new text drawn at the same
// baseline, size, color and (matched) typeface. Images, links and every
// other line on the page are left byte-for-byte as they were. Returns false
// — with the page untouched — if that can't be done safely.
async function bakeLineEditsAsVector(
  pdfDoc: PDFDocument,
  pageIndex: number,
  jobs: LineEditJob[],
  fontCache: Map<string, PDFFont>
): Promise<boolean> {
  const page = pdfDoc.getPage(pageIndex);
  if (page.getRotation().angle % 360 !== 0) return false;

  const prepared: { job: LineEditJob; font: PDFFont; text: string; width: number }[] = [];
  for (const job of jobs) {
    const font = await embedTextFont(pdfDoc, job.family, job.bold, job.italic, fontCache, job.weight);
    if (!font) return false;
    const text = job.text.replace(/\t/g, '    ');
    let width: number;
    try {
      width = font.widthOfTextAtSize(text, job.sizePt); // throws on characters the font can't encode
    } catch {
      return false;
    }
    prepared.push({ job, font, text, width });
  }

  const pageWidthPts = page.getCropBox().width;
  // lines added by wrapping had no text in the original to remove
  const replaced = jobs.filter((j) => !j.line.synthetic);
  if (replaced.length > 0 && !removeTextInBands(pdfDoc, page, bandsForJobs(replaced, pageWidthPts, false))) {
    return false;
  }

  for (const { job, font, text, width } of prepared) {
    const { baselinePt: y, color } = job.line;
    const x = alignedLeftPt(job, width, pageWidthPts);
    job.drawnLeftPt = x;
    job.drawnRightPt = x + width;
    if (!text.trim()) continue;
    const c = hexToRgb01(color || '#000000');
    page.drawText(text, { x, y, size: job.sizePt, font, color: c });
    if (job.underline) {
      page.drawLine({
        start: { x, y: y - job.sizePt * 0.1 },
        end: { x: x + width, y: y - job.sizePt * 0.1 },
        thickness: Math.max(0.5, job.sizePt * 0.05),
        color: c,
      });
    }
  }
  return true;
}

type ProxyPage = Awaited<ReturnType<PDFDocumentProxy['getPage']>>;

async function textItemsOf(page: ProxyPage) {
  const tc = await page.getTextContent();
  return (tc.items as { str?: string; transform?: number[] }[])
    .filter((it) => it.str && it.str.trim() && it.transform)
    .map((it) => ({
      str: it.str!,
      x: it.transform![4],
      y: it.transform![5],
      size: Math.hypot(it.transform![0], it.transform![1]),
    }));
}

const normalizeForCompare = (s: string) => s.normalize('NFKC').replace(/\s+/g, '');

// Re-reads the baked page's text and confirms the edit did exactly what was
// asked: each edited line now reads as its new text, and every other piece
// of text on the page is still there, unchanged and unmoved.
async function verifyBakedLineEdits(before: ProxyPage, after: ProxyPage, jobs: LineEditJob[]): Promise<boolean> {
  const pageWidthPts = before.view[2] - before.view[0];
  const oldBands = bandsForJobs(jobs, pageWidthPts, false);
  const newBands = bandsForJobs(jobs, pageWidthPts, true);
  const [beforeItems, afterItems] = await Promise.all([textItemsOf(before), textItemsOf(after)]);

  const key = (it: { str: string; x: number; y: number }) => `${it.str}|${Math.round(it.x)}|${Math.round(it.y)}`;
  const outsideBefore = beforeItems
    .filter((it) => !oldBands.some((b) => isInTextBand(b, it.x, it.y, it.size)))
    .map(key)
    .sort();
  const outsideAfter = afterItems
    .filter((it) => !newBands.some((b) => isInTextBand(b, it.x, it.y, it.size)))
    .map(key)
    .sort();
  if (outsideBefore.join('\n') !== outsideAfter.join('\n')) return false;

  return jobs.every((job, i) => {
    const inside = afterItems
      .filter((it) => isInTextBand(newBands[i], it.x, it.y, it.size))
      .sort((a, b) => a.x - b.x)
      .map((it) => it.str)
      .join('');
    return normalizeForCompare(inside) === normalizeForCompare(job.text);
  });
}

// Bakes on a throwaway single-page copy first and verifies the result, so a
// page is only ever edited in place when the outcome is known to be right.
async function canBakeLineEditsAsVector(
  source: PDFDocument,
  pageIndex: number,
  before: ProxyPage,
  jobs: LineEditJob[]
): Promise<boolean> {
  try {
    const probe = await PDFDocument.create();
    probe.registerFontkit(fontkit);
    const [copied] = await probe.copyPages(source, [pageIndex]);
    probe.addPage(copied);
    if (!(await bakeLineEditsAsVector(probe, 0, jobs, new Map()))) return false;
    const proxy = await bytesToProxy(await probe.save());
    try {
      return await verifyBakedLineEdits(before, await proxy.getPage(1), jobs);
    } finally {
      void proxy.loadingTask.destroy();
    }
  } catch (e) {
    console.warn('Vector line edit failed, falling back:', e);
    return false;
  }
}

// Export-time fallback when a page can't take the in-place swap: cover each
// old line with the background color actually behind it, then draw the new
// text on top. The original glyphs stay in the file underneath.
async function coverAndDrawLineEdits(
  pdfDoc: PDFDocument,
  pageIndex: number,
  before: ProxyPage,
  jobs: LineEditJob[],
  fontCache: Map<string, PDFFont>
) {
  const page = pdfDoc.getPage(pageIndex);
  const pageWidthPts = before.view[2] - before.view[0];

  const viewport = before.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  await before.render({ canvasContext: ctx, viewport, canvas }).promise;

  for (const job of jobs) {
    const { baselinePt: y, color } = job.line;
    let font = await embedTextFont(pdfDoc, job.family, job.bold, job.italic, fontCache, job.weight);
    const text = job.text.replace(/\t/g, '    ');
    let width = 0;
    try {
      width = font ? font.widthOfTextAtSize(text, job.sizePt) : 0;
    } catch {
      font = null;
    }
    if (!font) {
      font = await embedTextFont(pdfDoc, 'Helvetica', job.bold, job.italic, fontCache, job.weight);
      try {
        width = font ? font.widthOfTextAtSize(text, job.sizePt) : 0;
      } catch {
        console.warn(`Skipping edited line "${text}": no available font can encode it`);
        continue;
      }
    }

    const x = alignedLeftPt(job, width, pageWidthPts);
    const pad = 2;
    const size = job.line.fontSizePt;
    const x0 = Math.min(job.line.leftPt, x) - pad;
    const x1 = Math.max(job.line.leftPt + job.line.w * pageWidthPts, x + width) + pad;
    const y0 = y - size * 0.25 - pad;
    const y1 = y + size * 1.05 + pad;
    const [vx0, vy0] = viewport.convertToViewportPoint(x0, y1);
    const [vx1, vy1] = viewport.convertToViewportPoint(x1, y0);
    const bg = sampleBoxBackgroundColor(
      ctx,
      Math.min(vx0, vx1),
      Math.min(vy0, vy1),
      Math.abs(vx1 - vx0),
      Math.abs(vy1 - vy0)
    );
    page.drawRectangle({ x: x0, y: y0, width: x1 - x0, height: y1 - y0, color: hexToRgb01(bg) });

    if (!text.trim() || !font) continue;
    const c = hexToRgb01(color || '#000000');
    page.drawText(text, { x, y, size: job.sizePt, font, color: c });
    if (job.underline) {
      page.drawLine({
        start: { x, y: y - job.sizePt * 0.1 },
        end: { x: x + width, y: y - job.sizePt * 0.1 },
        thickness: Math.max(0.5, job.sizePt * 0.05),
        color: c,
      });
    }
  }
}

// ---------- Documents ----------
// Size on disk of each document as opened, for honest compression numbers.
// Keyed by the loaded pdf-lib doc, so it lapses once Apply etc. replace it.
const loadedFileSize = new WeakMap<PDFDocument, number>();

export interface CompressResult extends CompressStats {
  originalSize: number;
  compressedSize: number;
  savedPct: number;
  saved: boolean; // false when nothing smaller could be made, so no file was written
  fontBytesSaved: number; // from removing unused characters from embedded fonts
}

export interface OpenDocument {
  id: string;
  name: string;
  pdfLibDoc: PDFDocument;
  proxy: PDFDocumentProxy;
  pageCount: number;
  wasEncrypted: boolean;
}

type AnnotationsByDoc = Record<string, Record<number, Annotation[]>>;

interface HistoryEntry {
  annotations: AnnotationsByDoc;
  lineEdits: Record<string, Record<number, Record<number, string>>>;
  lineStyleOverrides: Record<string, Record<number, Record<number, Partial<LineStyleOverride>>>>;
  // Present only for actions that mutate the actual PDF document structure
  // (rotate, crop, insert/delete page, form field create/delete) — these
  // bypass the annotation-based history entirely otherwise, since they
  // change doc.pdfLibDoc directly rather than adding an annotation.
  // Capturing the whole document's bytes before the mutation is what lets
  // undo/redo actually restore it, not just the annotation overlay state.
  pdfSnapshot?: { docId: string; bytes: Uint8Array };
}

interface DocumentState {
  documents: OpenDocument[];
  activeId: string | null;
  currentPage: number;
  zoom: number;
  activeRibbonTab: string;
  activeTool: string | null;
  isThumbnailRailOpen: boolean;
  isRightPanelOpen: boolean;
  annotations: AnnotationsByDoc;
  annotationColor: string;
  recentColors: string[];
  textFontSize: number;
  textFontFamily: TextFontFamily;
  textBold: boolean;
  textItalic: boolean;
  textUnderline: boolean;
  pendingCrop: { docId: string; page: number; x: number; y: number; w: number; h: number } | null;
  setPendingCrop: (
    crop: { docId: string; page: number; x: number; y: number; w: number; h: number } | null
  ) => void;
  toast: { message: string; kind: 'success' | 'error' } | null;
  showToast: (message: string, kind?: 'success' | 'error') => void;
  dismissToast: () => void;
  // whichever text box is currently open for editing on the canvas, if
  // any — lets ribbon controls (font family/size/bold/italic/underline)
  // apply live to it, instead of only setting the default for new text
  activeTextBox: { docId: string; page: number; id: string } | null;
  setActiveTextBox: (box: { docId: string; page: number; id: string } | null) => void;
  setTextBoxFontFamily: (docId: string, page: number, id: string, family: TextFontFamily) => void;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  ocrText: Record<string, Record<number, OcrWord[]>>;
  ocrProgress: { active: boolean; label: string; pct: number } | null;
  pendingEncryptedFile: { name: string; bytes: Uint8Array } | null;
  passwordError: string | null;
  savedSignatures: SavedSignature[];
  theme: Theme;
  toggleTheme: () => void;
  userProfile: UserProfile | null;
  signIn: (name: string, email: string) => void;
  signOut: () => void;
  formFields: Record<string, DetectedFormField[]>;
  pageLines: Record<string, Record<number, CachedLine[]>>;
  // images and shapes on each page, so edited text can be kept clear of them
  pageObstacles: Record<string, Record<number, PageObstacle[]>>;
  lineEdits: Record<string, Record<number, Record<number, string>>>;
  // manual overrides on top of the detected style for a line — lets a
  // user change font family/size/bold/italic/underline on existing PDF
  // text, same as they can for a new Type Text box
  lineStyleOverrides: Record<
    string,
    Record<number, Record<number, Partial<LineStyleOverride>>>
  >;
  setLineStyleOverride: (
    docId: string,
    page: number,
    lineIndex: number,
    patch: Partial<LineStyleOverride>
  ) => void;
  // whichever line is currently open for editing, if any — lets ribbon
  // controls (font family/size/bold/italic/underline) apply live to it,
  // the same way activeTextBox does for Type Text boxes
  activeEditLine: { docId: string; page: number; lineIndex: number } | null;
  setActiveEditLine: (line: { docId: string; page: number; lineIndex: number } | null) => void;

  openFile: (file: File) => Promise<void>;
  closeDocument: (id: string) => void;
  setActiveDocument: (id: string) => void;
  setCurrentPage: (page: number) => void;
  setZoom: (zoom: number) => void;
  setActiveRibbonTab: (tab: string) => void;
  setActiveTool: (tool: string | null) => void;
  toggleThumbnailRail: () => void;
  toggleRightPanel: () => void;
  setAnnotationColor: (color: string) => void;
  setTextFontSize: (size: number) => void;
  setTextFontFamily: (family: TextFontFamily) => void;
  setTextBold: (bold: boolean) => void;
  setTextItalic: (italic: boolean) => void;
  setTextUnderline: (underline: boolean) => void;
  toggleTextBoxStyle: (
    docId: string,
    page: number,
    id: string,
    style: 'bold' | 'italic' | 'underline'
  ) => void;
  setTextBoxFontSize: (docId: string, page: number, id: string, size: number) => void;
  setTextBoxBackground: (docId: string, page: number, id: string, color: string | null) => void;

  // page assembly
  rotatePage: (docId: string, pageIndex: number) => Promise<void>;
  deletePage: (docId: string, pageIndex: number) => Promise<void>;
  insertBlankPage: (docId: string, afterIndex: number) => Promise<void>;
  reorderPage: (docId: string, fromIndex: number, toIndex: number) => Promise<void>;
  extractPages: (docId: string, range: number[]) => Promise<void>;
  splitDocument: (
    docId: string,
    mode: 'every-page' | 'every-n' | 'ranges',
    options: { n?: number; ranges?: string }
  ) => Promise<{ ok: true; fileCount: number } | { ok: false; error: string }>;
  mergeAllOpenDocuments: () => Promise<void>;
  mergeSelectedFiles: (
    files: File[]
  ) => Promise<{ ok: true; skipped: string[] } | { ok: false; error: string }>;
  exportDocument: (docId: string) => Promise<void>;
  buildExportBytes: (docId: string) => Promise<Uint8Array | null>;

  // annotations
  addAnnotation: (docId: string, annotation: Annotation) => void;
  updateNoteText: (docId: string, page: number, id: string, text: string) => void;
  updateTextBoxText: (docId: string, page: number, id: string, text: string) => void;
  updateTextBoxPosition: (docId: string, page: number, id: string, x: number, y: number) => void;
  updateImagePosition: (docId: string, page: number, id: string, x: number, y: number) => void;
  updateNotePosition: (docId: string, page: number, id: string, x: number, y: number) => void;
  finalizeSignature: (
    docId: string,
    page: number,
    id: string,
    dataUrl: string,
    w: number,
    h: number
  ) => void;
  deleteAnnotation: (docId: string, page: number, id: string) => void;
  pushStructuralHistory: (docId: string) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  exportToWord: (docId: string) => Promise<void>;
  exportToPng: (docId: string) => Promise<void>;
  addImageAnnotation: (docId: string, file: File) => Promise<void>;
  runOcrOnPage: (docId: string, pageNum: number) => Promise<void>;
  runOcrOnDocument: (docId: string) => Promise<void>;
  applyRedactions: (docId: string) => Promise<void>;
  exportEncrypted: (
    docId: string,
    opts: {
      userPassword: string;
      ownerPassword: string;
      allowPrinting: boolean;
      allowModifying: boolean;
      allowCopying: boolean;
      allowAnnotating: boolean;
    }
  ) => Promise<void>;
  unlockPendingFile: (password: string) => Promise<void>;
  cancelPendingFile: () => void;
  removePassword: (docId: string) => Promise<void>;
  signDocument: (
    docId: string,
    opts: {
      p12Bytes: Uint8Array;
      passphrase: string;
      reason: string;
      location: string;
      signerName: string;
      contactInfo: string;
    }
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  convertViaService: (
    docId: string,
    target: 'docx' | 'xlsx' | 'pptx',
    serviceUrl: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  checkConversionService: (serviceUrl: string) => Promise<boolean>;

  // Forms
  loadFormFields: (docId: string) => Promise<void>;
  setFormFieldValue: (docId: string, fieldId: string, value: string) => void;
  createFormField: (
    docId: string,
    kind: FormFieldKind,
    page: number,
    x: number,
    y: number,
    w: number,
    h: number
  ) => Promise<void>;
  deleteFormField: (docId: string, fieldName: string) => Promise<void>;
  flattenForm: (docId: string) => Promise<void>;
  loadPageLines: (docId: string, pageNum: number) => Promise<void>;
  setLineEdit: (docId: string, page: number, lineIndex: number, text: string) => void;
  // several line texts at once as one undo step, e.g. a line wrapping onto
  // the next ones; newLines are appended to the page's lines first
  setLineEdits: (docId: string, page: number, edits: Record<number, string>, newLines?: CachedLine[]) => void;

  // File tab
  createBlankDocument: () => Promise<void>;
  saveAsWithName: (docId: string, newName: string) => Promise<void>;
  saveAsToLocation: (docId: string) => Promise<'saved' | 'unsupported' | 'cancelled'>;
  getDocumentMetadata: (docId: string) => {
    title: string;
    author: string;
    subject: string;
    keywords: string;
    creator: string;
    producer: string;
    creationDate: string;
    modificationDate: string;
    pageCount: number;
  } | null;
  setDocumentMetadata: (
    docId: string,
    meta: { title: string; author: string; subject: string; keywords: string }
  ) => void;
  getPrintUrl: (docId: string) => Promise<string>;
  getShareFile: (docId: string) => Promise<File>;
  createPdfFromImage: (file: File) => Promise<void>;
  createPdfFromImages: (files: File[]) => Promise<void>;
  compressDocument: (
    docId: string,
    level: 'easy' | 'medium' | 'hard'
  ) => Promise<CompressResult | null>;
  findTextInDocument: (docId: string, query: string, fromPage: number) => Promise<number | null>;
  applyCrop: (
    docId: string,
    page: number,
    xNorm: number,
    yNorm: number,
    wNorm: number,
    hNorm: number
  ) => Promise<void>;
  convertWordToPdf: (file: File) => Promise<{ ok: true } | { ok: false; error: string }>;
  saveSignature: (name: string, dataUrl: string, w: number, h: number) => void;
  deleteSavedSignature: (id: string) => void;
}

// Renders every page of two versions of a document and checks they look the
// same — the safety net for compression steps that rewrite fonts.
async function pagesRenderIdentically(
  a: Uint8Array,
  b: Uint8Array,
  onPage?: (page: number, total: number) => void
): Promise<boolean> {
  const [da, db] = await Promise.all([bytesToProxy(a.slice()), bytesToProxy(b.slice())]);
  try {
    if (da.numPages !== db.numPages) return false;
    const draw = async (doc: PDFDocumentProxy, n: number) => {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    for (let n = 1; n <= da.numPages; n++) {
      onPage?.(n, da.numPages);
      const [pa, pb] = await Promise.all([draw(da, n), draw(db, n)]);
      if (pa.length !== pb.length) return false;
      let differing = 0;
      for (let k = 0; k < pa.length; k += 4) {
        if (Math.abs(pa[k] - pb[k]) > 24 || Math.abs(pa[k + 1] - pb[k + 1]) > 24 || Math.abs(pa[k + 2] - pb[k + 2]) > 24) {
          differing++;
        }
      }
      if (differing > pa.length / 4 / 5000) return false; // more than 0.02% of the page
    }
    return true;
  } finally {
    void da.loadingTask.destroy();
    void db.loadingTask.destroy();
  }
}

async function bytesToProxy(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const copy = bytes.slice(0);
  const task = pdfjsLib.getDocument({ data: copy });
  return task.promise;
}

function downloadBlob(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  activeId: null,
  currentPage: 1,
  zoom: 1,
  activeRibbonTab: 'Home',
  activeTool: 'select',
  isThumbnailRailOpen: true,
  isRightPanelOpen: true,
  annotations: {},
  annotationColor: '#000000',
  recentColors: [],
  textFontSize: 14,
  textFontFamily: 'Helvetica',
  textBold: false,
  textItalic: false,
  textUnderline: false,
  pendingCrop: null,
  toast: null,
  activeTextBox: null,
  undoStack: [],
  redoStack: [],
  ocrText: {},
  ocrProgress: null,
  pendingEncryptedFile: null,
  passwordError: null,
  savedSignatures: loadSavedSignatures(),
  theme: loadTheme(),
  userProfile: loadProfile(),
  formFields: {},
  pageLines: {},
  pageObstacles: {},
  lineEdits: {},
  lineStyleOverrides: {},
  activeEditLine: null,

  openFile: async (file: File) => {
    const buf = new Uint8Array(await file.arrayBuffer());
    let pdfLibDoc: PDFDocument;
    let wasEncrypted = false;
    try {
      pdfLibDoc = await PDFDocument.load(buf, { ignoreEncryption: false });
    } catch (e) {
      if (e instanceof EncryptedPDFError) {
        // Many real-world PDFs (this exact pattern was confirmed against
        // an actual invoice generated by a business PDF tool before
        // shipping this fix) are encrypted with an owner/permissions
        // password but *no* open password at all — the empty string is
        // a fully valid password for them. Adobe and Nitro open these
        // silently, with no prompt, since opening never actually needed
        // a password; only some editing permissions are restricted. The
        // previous code treated "has an /Encrypt dictionary at all" as
        // "ask the user for a password," which is wrong for this very
        // common case — it should only ask when opening genuinely
        // requires a password the empty string doesn't satisfy.
        try {
          pdfLibDoc = await PDFDocument.load(buf, { password: '' });
          wasEncrypted = true;
        } catch {
          // empty password genuinely doesn't work — this one really
          // does need the user to enter something
          set({ pendingEncryptedFile: { name: file.name, bytes: buf }, passwordError: null });
          return;
        }
      } else {
        throw e;
      }
    }
    loadedFileSize.set(pdfLibDoc, buf.length);
    const proxy = await bytesToProxy(buf);
    const doc: OpenDocument = {
      id: `${file.name}-${Date.now()}`,
      name: file.name,
      pdfLibDoc,
      proxy,
      pageCount: proxy.numPages,
      wasEncrypted,
    };
    set((state) => ({
      documents: [...state.documents, doc],
      activeId: doc.id,
      currentPage: 1,
      annotations: { ...state.annotations, [doc.id]: {} },
    }));
  },

  unlockPendingFile: async (password: string) => {
    const pending = get().pendingEncryptedFile;
    if (!pending) return;
    try {
      const pdfLibDoc = await PDFDocument.load(pending.bytes, { password });
      // pdf-lib decrypts on load; re-saving without calling .encrypt() yields
      // an unencrypted proxy for rendering, and an unencrypted export later
      const renderBytes = await pdfLibDoc.save();
      const proxy = await bytesToProxy(renderBytes);
      const doc: OpenDocument = {
        id: `${pending.name}-${Date.now()}`,
        name: pending.name,
        pdfLibDoc,
        proxy,
        pageCount: proxy.numPages,
        wasEncrypted: true,
      };
      set((state) => ({
        documents: [...state.documents, doc],
        activeId: doc.id,
        currentPage: 1,
        annotations: { ...state.annotations, [doc.id]: {} },
        pendingEncryptedFile: null,
        passwordError: null,
      }));
    } catch {
      set({ passwordError: 'Incorrect password. Try again.' });
    }
  },

  cancelPendingFile: () => set({ pendingEncryptedFile: null, passwordError: null }),

  removePassword: async (docId: string) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return;
    // doc.pdfLibDoc already holds decrypted content in memory (it was loaded
    // with the correct password); saving it now, without calling .encrypt(),
    // produces a completely unencrypted copy.
    const bytes = await doc.pdfLibDoc.save();
    downloadBlob(bytes, `unlocked-${doc.name}`);
  },

  // Real cryptographic PKCS#12 digital signature: builds a CMS/PKCS#7
  // detached signature (via node-forge, same primitive Adobe/Acrobat use)
  // over the document bytes, embedded at a placeholder byte range added by
  // @signpdf/placeholder-pdf-lib. This has been independently verified
  // (outside this app, using the pyhanko validator) to produce a signature
  // that is intact, cryptographically valid, and chains to the signing
  // certificate correctly.
  signDocument: async (docId, opts) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return { ok: false, error: 'Document not found.' };

    try {
      // @signpdf/placeholder-pdf-lib does an `instanceof` check against the
      // plain `pdf-lib` package's own classes, so the placeholder step must
      // use that exact package — not our @cantoo/pdf-lib fork used
      // elsewhere in the app for encryption/editing.
      const structuralBytes = await doc.pdfLibDoc.save();
      const signDoc = await SigningPDFDocument.load(structuralBytes);

      pdflibAddPlaceholder({
        pdfDoc: signDoc,
        reason: opts.reason || 'Document approval',
        contactInfo: opts.contactInfo || '',
        name: opts.signerName || 'Signer',
        location: opts.location || '',
        signatureLength: 8192,
      });

      const pdfWithPlaceholder = Buffer.from(
        await signDoc.save({ useObjectStreams: false })
      );

      const signer = new P12Signer(Buffer.from(opts.p12Bytes), {
        passphrase: opts.passphrase,
      });
      const signedBytes: Buffer = await signpdf.sign(pdfWithPlaceholder, signer);

      downloadBlob(new Uint8Array(signedBytes), `signed-${doc.name}`);
      return { ok: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const friendly = /mac|integrity|invalid password|pkcs12/i.test(message)
        ? 'Could not open the certificate — check the .p12/.pfx file and password.'
        : message;
      return { ok: false, error: friendly };
    }
  },

  checkConversionService: async (serviceUrl: string) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(`${serviceUrl}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      return res.ok;
    } catch {
      return false;
    }
  },

  convertViaService: async (docId, target, serviceUrl) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return { ok: false, error: 'Document not found.' };
    try {
      const bytes = await doc.pdfLibDoc.save();
      const form = new FormData();
      form.append('file', new Blob([bytes as BlobPart], { type: 'application/pdf' }), doc.name);
      form.append('target', target);

      const res = await fetch(`${serviceUrl}/convert`, { method: 'POST', body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { ok: false, error: body.error || `Service returned ${res.status}.` };
      }
      const outBytes = new Uint8Array(await res.arrayBuffer());
      const baseName = doc.name.replace(/\.pdf$/i, '');
      downloadBlob(outBytes, `${baseName}.${target}`);
      return { ok: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        error: `Couldn't reach the conversion service at ${serviceUrl}. Is it running? (${message})`,
      };
    }
  },

  // ---------- Forms ----------
  loadFormFields: async (docId) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return;
    try {
      const pdfForm = doc.pdfLibDoc.getForm();
      const pages = doc.pdfLibDoc.getPages();
      const refToIndex = new Map<string, number>();
      pages.forEach((pg, idx) => refToIndex.set(pg.ref.toString(), idx));

      const fields: DetectedFormField[] = [];
      for (const field of pdfForm.getFields()) {
        const name = field.getName();
        let kind: FormFieldKind | null = null;
        let value = '';
        let options: string[] | undefined;

        if (field instanceof PDFTextField) {
          kind = 'text';
          value = field.getText() ?? '';
        } else if (field instanceof PDFCheckBox) {
          kind = 'checkbox';
          value = field.isChecked() ? 'on' : '';
        } else if (field instanceof PDFRadioGroup) {
          kind = 'radio';
          value = field.getSelected() ?? '';
          options = field.getOptions();
        } else if (field instanceof PDFDropdown) {
          kind = 'dropdown';
          const sel = field.getSelected();
          value = sel?.[0] ?? '';
          options = field.getOptions();
        } else {
          continue; // skip push buttons, option lists, signature fields for now
        }

        const widgets = field.acroField.getWidgets();
        for (const widget of widgets) {
          const pageRef = widget.P();
          const pageIndex = pageRef ? refToIndex.get(pageRef.toString()) : undefined;
          if (pageIndex === undefined) continue;
          const page = pages[pageIndex];
          const { width: pw, height: ph } = page.getSize();
          const rect = widget.getRectangle();
          const onValue = kind === 'radio' ? widget.getOnValue()?.asString().replace(/^\//, '') : undefined;
          fields.push({
            id: `${name}__${pageIndex}__${Math.round(rect.x)}__${Math.round(rect.y)}`,
            fieldName: name,
            kind,
            page: pageIndex + 1,
            x: rect.x / pw,
            y: (ph - rect.y - rect.height) / ph,
            w: rect.width / pw,
            h: rect.height / ph,
            value,
            options,
            optionValue: onValue,
          });
        }
      }

      set((s) => ({ formFields: { ...s.formFields, [docId]: fields } }));
    } catch (e) {
      console.warn('Could not load form fields:', e);
      set((s) => ({ formFields: { ...s.formFields, [docId]: [] } }));
    }
  },

  setFormFieldValue: (docId, fieldId, value) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return;
    const existing = (get().formFields[docId] ?? []).find((f) => f.id === fieldId);
    if (!existing) return;

    try {
      const pdfForm = doc.pdfLibDoc.getForm();
      const field = pdfForm.getField(existing.fieldName);
      if (field instanceof PDFTextField) {
        field.setText(value);
      } else if (field instanceof PDFCheckBox) {
        if (value === 'on') field.check();
        else field.uncheck();
      } else if (field instanceof PDFRadioGroup || field instanceof PDFDropdown) {
        field.select(value);
      }
    } catch (e) {
      console.warn('Could not set form field value:', e);
    }

    set((s) => ({
      formFields: {
        ...s.formFields,
        [docId]: (s.formFields[docId] ?? []).map((f) =>
          f.fieldName === existing.fieldName ? { ...f, value } : f
        ),
      },
    }));
  },

  createFormField: async (docId, kind, page, xNorm, yNorm, wNorm, hNorm) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return;
    await get().pushStructuralHistory(docId);

    const pdfForm = doc.pdfLibDoc.getForm();
    const pdfPage = doc.pdfLibDoc.getPage(page - 1);
    const { width: pw, height: ph } = pdfPage.getSize();
    const x = xNorm * pw;
    const w = Math.max(20, wNorm * pw);
    const h = Math.max(14, hNorm * ph);
    const y = ph - yNorm * ph - h;
    const uniqueName = `field_${Date.now()}`;

    if (kind === 'text') {
      const tf = pdfForm.createTextField(uniqueName);
      tf.setText('');
      tf.addToPage(pdfPage, { x, y, width: w, height: h, borderWidth: 1 });
    } else if (kind === 'checkbox') {
      const cb = pdfForm.createCheckBox(uniqueName);
      cb.addToPage(pdfPage, { x, y, width: w, height: h, borderWidth: 1 });
    } else if (kind === 'radio') {
      const rg = pdfForm.createRadioGroup(uniqueName);
      rg.addOptionToPage('Option A', pdfPage, { x, y, width: h, height: h, borderWidth: 1 });
      rg.addOptionToPage('Option B', pdfPage, {
        x: x + h + 8,
        y,
        width: h,
        height: h,
        borderWidth: 1,
      });
    } else if (kind === 'dropdown') {
      const dd = pdfForm.createDropdown(uniqueName);
      dd.addOptions(['Option A', 'Option B', 'Option C']);
      dd.addToPage(pdfPage, { x, y, width: w, height: h, borderWidth: 1 });
    }

    const bytes = await doc.pdfLibDoc.save();
    const proxy = await bytesToProxy(bytes);
    set((s) => ({
      documents: s.documents.map((d) =>
        d.id === docId ? { ...d, proxy, pageCount: proxy.numPages } : d
      ),
    }));
    await get().loadFormFields(docId);
  },

  // Real field removal via pdf-lib's own PDFForm API (removes the field
  // and every widget/appearance tied to it), not just hiding it from the
  // list — this is what "cannot be deleted" was actually missing, since
  // no delete action existed for form fields at all before this.
  deleteFormField: async (docId, fieldName) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return;
    await get().pushStructuralHistory(docId);
    try {
      const pdfForm = doc.pdfLibDoc.getForm();
      const field = pdfForm.getField(fieldName);
      pdfForm.removeField(field);
    } catch (e) {
      console.warn('Could not remove form field:', e);
      return;
    }

    const bytes = await doc.pdfLibDoc.save();
    const proxy = await bytesToProxy(bytes);
    set((s) => ({
      documents: s.documents.map((d) =>
        d.id === docId ? { ...d, proxy, pageCount: proxy.numPages } : d
      ),
    }));
    await get().loadFormFields(docId);
  },

  flattenForm: async (docId) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return;
    const bytes = await doc.pdfLibDoc.save();
    const exportDoc = await PDFDocument.load(bytes);
    exportDoc.getForm().flatten();
    const outBytes = await exportDoc.save();
    downloadBlob(outBytes, `filled-${doc.name}`);
  },

  // ---------- File tab ----------
  createBlankDocument: async () => {
    const blank = await PDFDocument.create();
    blank.addPage([612, 792]); // US Letter
    const profile = get().userProfile;
    if (profile?.name) blank.setAuthor(profile.name);
    const bytes = await blank.save();
    const proxy = await bytesToProxy(bytes);
    const doc: OpenDocument = {
      id: `Untitled-${Date.now()}`,
      name: 'Untitled.pdf',
      pdfLibDoc: blank,
      proxy,
      pageCount: proxy.numPages,
      wasEncrypted: false,
    };
    set((s) => ({
      documents: [...s.documents, doc],
      activeId: doc.id,
      currentPage: 1,
      annotations: { ...s.annotations, [doc.id]: {} },
    }));
  },

  saveAsWithName: async (docId, newName) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return;
    const bytes = await get().buildExportBytes(docId);
    if (!bytes) return;
    const finalName = newName.endsWith('.pdf') ? newName : `${newName}.pdf`;
    downloadBlob(bytes, finalName);
    // reflect the rename in the open tab too
    set((s) => ({
      documents: s.documents.map((d) => (d.id === docId ? { ...d, name: finalName } : d)),
    }));
  },

  // Real destination-folder picker via the File System Access API — a
  // standard browser API, not something requiring a separate native
  // dialog integration. Supported in Chrome/Edge (and therefore the
  // Windows desktop app too, since it runs on WebView2 — Edge's own
  // engine); not supported in Firefox or Safari, where this quietly
  // reports 'unsupported' so the caller can fall back to the existing
  // filename-only Save As flow.
  //
  // The file picker must be requested immediately, before any other
  // async work — browsers only allow it while "user activation" from
  // the actual click is still active, and building the full export
  // (embedding fonts, baking annotations) can take long enough to lose
  // that window if done first.
  saveAsToLocation: async (docId) => {
    const w = window as unknown as {
      showSaveFilePicker?: (opts: {
        suggestedName?: string;
        types?: { description: string; accept: Record<string, string[]> }[];
      }) => Promise<{
        createWritable: () => Promise<{ write: (data: Uint8Array) => Promise<void>; close: () => Promise<void> }>;
        name: string;
      }>;
    };
    if (!w.showSaveFilePicker) return 'unsupported';

    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return 'cancelled';

    let handle;
    try {
      handle = await w.showSaveFilePicker({
        suggestedName: doc.name.endsWith('.pdf') ? doc.name : `${doc.name}.pdf`,
        types: [{ description: 'PDF Document', accept: { 'application/pdf': ['.pdf'] } }],
      });
    } catch (e) {
      // AbortError = user closed the dialog without choosing anything —
      // a normal cancel, not a failure worth surfacing as an error
      if (e instanceof Error && e.name === 'AbortError') return 'cancelled';
      throw e;
    }

    const bytes = await get().buildExportBytes(docId);
    if (!bytes) return 'cancelled';
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();

    set((s) => ({
      documents: s.documents.map((d) => (d.id === docId ? { ...d, name: handle.name } : d)),
    }));
    return 'saved';
  },

  getDocumentMetadata: (docId) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return null;
    const d = doc.pdfLibDoc;
    const fmt = (date: Date | undefined) => (date ? date.toLocaleString() : '—');
    return {
      title: d.getTitle() ?? '',
      author: d.getAuthor() ?? '',
      subject: d.getSubject() ?? '',
      keywords: d.getKeywords() ?? '',
      creator: d.getCreator() ?? '',
      producer: d.getProducer() ?? '',
      creationDate: fmt(d.getCreationDate()),
      modificationDate: fmt(d.getModificationDate()),
      pageCount: doc.pageCount,
    };
  },

  setDocumentMetadata: (docId, meta) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return;
    doc.pdfLibDoc.setTitle(meta.title);
    doc.pdfLibDoc.setAuthor(meta.author);
    doc.pdfLibDoc.setSubject(meta.subject);
    doc.pdfLibDoc.setKeywords(meta.keywords ? meta.keywords.split(',').map((k) => k.trim()) : []);
    doc.pdfLibDoc.setModificationDate(new Date());
  },

  getPrintUrl: async (docId) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) throw new Error('Document not found.');
    const bytes = await doc.pdfLibDoc.save();
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    return URL.createObjectURL(blob);
  },

  getShareFile: async (docId) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) throw new Error('Document not found.');
    const bytes = await doc.pdfLibDoc.save();
    return new File([bytes as BlobPart], doc.name, { type: 'application/pdf' });
  },

  createPdfFromImage: async (file) => {
    const newDoc = await PDFDocument.create();
    await embedImageAsPage(newDoc, file);

    const outBytes = await newDoc.save();
    const proxy = await bytesToProxy(outBytes);
    const newName = `${file.name.replace(/\.(png|jpe?g)$/i, '')}.pdf`;
    const doc: OpenDocument = {
      id: `${file.name}-${Date.now()}`,
      name: newName,
      pdfLibDoc: newDoc,
      proxy,
      pageCount: proxy.numPages,
      wasEncrypted: false,
    };
    set((s) => ({
      documents: [...s.documents, doc],
      activeId: doc.id,
      currentPage: 1,
      annotations: { ...s.annotations, [doc.id]: {} },
    }));
    downloadBlob(outBytes, newName);
  },

  createPdfFromImages: async (files) => {
    if (files.length === 0) return;
    if (files.length === 1) return get().createPdfFromImage(files[0]);

    const newDoc = await PDFDocument.create();
    for (const file of files) {
      try {
        await embedImageAsPage(newDoc, file);
      } catch (e) {
        console.warn(`Skipping "${file.name}" — could not read it as an image:`, e);
      }
    }
    if (newDoc.getPageCount() === 0) return;

    const outBytes = await newDoc.save();
    const proxy = await bytesToProxy(outBytes);
    const newName = `Images (${newDoc.getPageCount()} pages).pdf`;
    const doc: OpenDocument = {
      id: `images-${Date.now()}`,
      name: newName,
      pdfLibDoc: newDoc,
      proxy,
      pageCount: proxy.numPages,
      wasEncrypted: false,
    };
    set((s) => ({
      documents: [...s.documents, doc],
      activeId: doc.id,
      currentPage: 1,
      annotations: { ...s.annotations, [doc.id]: {} },
    }));
    downloadBlob(outBytes, newName);
  },

  // Real image recompression, not a gimmick: most oversized PDFs are large
  // because of embedded photos/scans, not vector text. This measures how
  // much of each page is actually covered by images (walking the content
  // stream operator list, same technique as the Word-export image
  // extractor); pages that are mostly images get rasterized and
  // re-encoded as JPEG at the preset's quality/resolution, while pages
  // that are mostly text are copied through completely unchanged — so
  // text stays sharp, selectable, and searchable, and a text-only PDF
  // doesn't get bloated by being needlessly turned into an image.
  // Real Word -> PDF: mammoth extracts the .docx's actual structure
  // (headings, paragraphs, lists) as HTML, which we then lay out onto real
  // PDF pages ourselves with proper text wrapping and pagination — the
  // output is genuine, selectable/searchable PDF text (drawn with
  // pdf-lib), not a rasterized screenshot of a rendered HTML page. Honest
  // limits: only .docx is supported (the old binary .doc format isn't
  // something this library — or most in-browser tools — can parse; ask
  // the person to re-save as .docx first), and formatting fidelity is
  // structural (headings/paragraphs/lists) rather than pixel-exact
  // (original fonts, exact spacing, and inline run-level bold/italic
  // mixing within a paragraph aren't reproduced — the same category of
  // limitation already disclosed for this app's PDF -> Word direction).
  convertWordToPdf: async (file) => {
    if (/\.doc$/i.test(file.name) && !/\.docx$/i.test(file.name)) {
      return {
        ok: false,
        error: 'Old .doc format isn\u2019t supported — please re-save the file as .docx first.',
      };
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      const html = result.value;

      const parser = new DOMParser();
      const parsed = parser.parseFromString(html, 'text/html');

      type Block = { kind: 'h1' | 'h2' | 'h3' | 'p' | 'li'; text: string };
      const blocks: Block[] = [];
      parsed.body.childNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        const text = (el.textContent ?? '').trim();
        if (!text) return;
        if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
          blocks.push({ kind: tag as 'h1' | 'h2' | 'h3', text });
        } else if (tag === 'h4' || tag === 'h5' || tag === 'h6') {
          blocks.push({ kind: 'h3', text });
        } else if (tag === 'p') {
          blocks.push({ kind: 'p', text });
        } else if (tag === 'ul' || tag === 'ol') {
          el.querySelectorAll('li').forEach((li) => {
            const liText = (li.textContent ?? '').trim();
            if (liText) blocks.push({ kind: 'li', text: liText });
          });
        } else if (tag === 'table') {
          // no real grid layout — extract row text so content isn't lost
          el.querySelectorAll('tr').forEach((tr) => {
            const rowText = Array.from(tr.querySelectorAll('td,th'))
              .map((cell) => (cell.textContent ?? '').trim())
              .filter(Boolean)
              .join('   |   ');
            if (rowText) blocks.push({ kind: 'p', text: rowText });
          });
        }
      });

      if (blocks.length === 0) {
        return { ok: false, error: 'No readable text found in that document.' };
      }

      const pdfDoc = await PDFDocument.create();
      const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const pageW = 612;
      const pageH = 792;
      const margin = 56;
      const maxWidth = pageW - margin * 2;

      let page = pdfDoc.addPage([pageW, pageH]);
      let y = pageH - margin;

      const wrapText = (text: string, f: typeof regular, size: number, maxW: number) => {
        const words = text.split(/\s+/);
        const lines: string[] = [];
        let line = '';
        for (const w of words) {
          const test = line ? `${line} ${w}` : w;
          if (f.widthOfTextAtSize(test, size) > maxW && line) {
            lines.push(line);
            line = w;
          } else {
            line = test;
          }
        }
        if (line) lines.push(line);
        return lines;
      };

      const ensureSpace = (needed: number) => {
        if (y - needed < margin) {
          page = pdfDoc.addPage([pageW, pageH]);
          y = pageH - margin;
        }
      };

      for (const block of blocks) {
        let size = 11;
        let f = regular;
        let lineHeight = 15;
        let spacingBefore = 8;
        let indent = 0;
        let prefix = '';

        if (block.kind === 'h1') {
          size = 20;
          f = bold;
          lineHeight = 26;
          spacingBefore = 18;
        } else if (block.kind === 'h2') {
          size = 16;
          f = bold;
          lineHeight = 21;
          spacingBefore = 15;
        } else if (block.kind === 'h3') {
          size = 13;
          f = bold;
          lineHeight = 18;
          spacingBefore = 13;
        } else if (block.kind === 'li') {
          indent = 16;
          prefix = '\u2022  ';
        }

        y -= spacingBefore;
        const lines = wrapText(prefix + block.text, f, size, maxWidth - indent);
        for (const line of lines) {
          ensureSpace(lineHeight);
          page.drawText(line, {
            x: margin + indent,
            y: y - lineHeight + 4,
            size,
            font: f,
            color: rgb(0, 0, 0),
          });
          y -= lineHeight;
        }
      }

      const outBytes = await pdfDoc.save();
      const proxy = await bytesToProxy(outBytes);
      const newName = `${file.name.replace(/\.docx?$/i, '')}.pdf`;
      const doc: OpenDocument = {
        id: `${file.name}-${Date.now()}`,
        name: newName,
        pdfLibDoc: pdfDoc,
        proxy,
        pageCount: proxy.numPages,
        wasEncrypted: false,
      };
      set((s) => ({
        documents: [...s.documents, doc],
        activeId: doc.id,
        currentPage: 1,
        annotations: { ...s.annotations, [doc.id]: {} },
      }));
      // this was the actual bug: the converted PDF was only ever opened as
      // an in-app tab, never written to disk — despite the success message
      // implying it had been saved. Downloading it here is what makes that
      // message true, and matches how the PDF -> Word/PNG direction already behaves.
      downloadBlob(outBytes, newName);
      return { ok: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: `Could not convert that file: ${message}` };
    }
  },

  compressDocument: async (docId, level) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return null;
    set({ ocrProgress: { active: true, label: 'Compressing', pct: 0 } });
    try {
      const current = await doc.pdfLibDoc.save();
      // compare against the file as it is on disk, not a re-save of it —
      // that's the number the user sees in Explorer
      const originalSize = loadedFileSize.get(doc.pdfLibDoc) ?? current.length;
      const work = await PDFDocument.load(current, { updateMetadata: false });
      const stats = await compressPdfInPlace(work, level, (done, total) =>
        set({
          ocrProgress: {
            active: true,
            label: total ? `Shrinking photos (${done} of ${total})` : 'Compressing',
            pct: total ? Math.round((done / total) * 90) : 50,
          },
        })
      );
      // Embedded fonts: often the bulk of Word/"Print to PDF" output. Only
      // kept if every page still renders pixel-for-pixel the same.
      const beforeFonts = await work.save({ useObjectStreams: true });
      const strip = stripUnusedGlyphs(work);
      let fontBytesSaved = 0;
      if (strip.fonts > 0) {
        const afterFonts = await work.save({ useObjectStreams: true });
        const same = await pagesRenderIdentically(beforeFonts, afterFonts, (p, total) =>
          set({ ocrProgress: { active: true, label: `Checking pages (${p} of ${total})`, pct: 90 + Math.round((p / total) * 10) } })
        );
        if (same) fontBytesSaved = strip.saved;
        else {
          console.warn('Font slimming changed how a page looks; keeping the original fonts.');
          strip.restore();
        }
      }
      const outBytes = await work.save({ useObjectStreams: true });
      set({ ocrProgress: null });
      // never hand back a file that's bigger (or no smaller) than the original
      if (outBytes.length >= originalSize * 0.98) {
        return { originalSize, compressedSize: originalSize, savedPct: 0, saved: false, fontBytesSaved, ...stats };
      }
      downloadBlob(outBytes, `compressed-${level}-${doc.name}`);
      const savedPct = Math.round((1 - outBytes.length / originalSize) * 100);
      return { originalSize, compressedSize: outBytes.length, savedPct, saved: true, fontBytesSaved, ...stats };
    } catch (e) {
      console.error('Compression failed:', e);
      set({ ocrProgress: null });
      return null;
    }
  },

  // Real search, not decorative: walks every page's actual text content
  // (case-insensitive substring match), starting just after the current
  // page and wrapping around, and returns the first page number that
  // contains the query — or null if nothing matches anywhere in the
  // document. Doesn't (yet) highlight the match within the page itself,
  // just navigates you to it.
  findTextInDocument: async (docId, query, fromPage) => {
    const doc = get().documents.find((d) => d.id === docId);
    const q = query.trim().toLowerCase();
    if (!doc || !q) return null;
    const total = doc.pageCount;

    for (let offset = 1; offset <= total; offset++) {
      const p = ((fromPage - 1 + offset) % total) + 1;
      try {
        const page = await doc.proxy.getPage(p);
        const textContent = await page.getTextContent();
        const text = textContent.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .toLowerCase();
        if (text.includes(q)) return p;
      } catch {
        // unreadable page (rare) — just skip it and keep searching
      }
    }
    return null;
  },

  setPendingCrop: (crop) => set({ pendingCrop: crop }),

  showToast: (message, kind = 'success') => {
    set({ toast: { message, kind } });
    // auto-dismiss after a few seconds — errors stay a bit longer since
    // they usually need actual reading, not just a glance
    const duration = kind === 'error' ? 6000 : 3500;
    setTimeout(() => {
      // only clear if this is still the same toast (a newer one hasn't replaced it)
      set((s) => (s.toast?.message === message ? { toast: null } : {}));
    }, duration);
  },

  dismissToast: () => set({ toast: null }),

  // Real PDF cropping via the standard CropBox concept (not a rasterize
  // trick) — content outside the crop rectangle is still technically in
  // the file, just no longer displayed or printed, exactly how Acrobat's
  // own Crop Pages tool works.
  applyCrop: async (docId, pageNum, xNorm, yNorm, wNorm, hNorm) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return;
    await get().pushStructuralHistory(docId);
    const page = doc.pdfLibDoc.getPage(pageNum - 1);
    const { width, height } = page.getSize();

    const cropX = xNorm * width;
    const cropWidth = wNorm * width;
    const cropHeight = hNorm * height;
    // yNorm is measured from the top (like our other overlay coords);
    // CropBox origin is bottom-left, so flip it
    const cropY = height - (yNorm * height) - cropHeight;

    page.setCropBox(cropX, cropY, cropWidth, cropHeight);

    const bytes = await doc.pdfLibDoc.save();
    const proxy = await bytesToProxy(bytes);
    set((s) => ({
      documents: s.documents.map((d) =>
        d.id === docId ? { ...d, proxy, pageCount: proxy.numPages } : d
      ),
      pendingCrop: null,
    }));
  },

  closeDocument: (id: string) => {
    const { documents, activeId } = get();
    const remaining = documents.filter((d) => d.id !== id);
    set({
      documents: remaining,
      activeId: activeId === id ? (remaining[0]?.id ?? null) : activeId,
      currentPage: 1,
    });
  },

  setActiveDocument: (id: string) => set({ activeId: id, currentPage: 1 }),
  setCurrentPage: (page: number) => set({ currentPage: page }),
  setZoom: (zoom: number) => set({ zoom: Math.min(4, Math.max(0.1, zoom)) }),
  setActiveRibbonTab: (tab: string) => set({ activeRibbonTab: tab }),
  setActiveTool: (tool: string | null) => set({ activeTool: tool }),
  toggleThumbnailRail: () => set((s) => ({ isThumbnailRailOpen: !s.isThumbnailRailOpen })),
  toggleRightPanel: () => set((s) => ({ isRightPanelOpen: !s.isRightPanelOpen })),
  setAnnotationColor: (color) => {
    const { recentColors } = get();
    const nextRecent = [color, ...recentColors.filter((c) => c.toLowerCase() !== color.toLowerCase())].slice(0, 8);
    set({ annotationColor: color, recentColors: nextRecent });
  },
  setTextFontSize: (size) => set({ textFontSize: Math.max(6, Math.min(144, size)) }),
  setTextFontFamily: (family) => set({ textFontFamily: family }),
  setTextBold: (bold) => set({ textBold: bold }),
  setTextItalic: (italic) => set({ textItalic: italic }),
  setTextUnderline: (underline) => set({ textUnderline: underline }),

  toggleTextBoxStyle: (docId, page, id, style) => {
    const { annotations } = get();
    const docAnns = { ...(annotations[docId] ?? {}) };
    docAnns[page] = (docAnns[page] ?? []).map((a) => {
      if (a.id !== id || a.type !== 'text') return a;
      if (style === 'bold') return { ...a, bold: !a.bold };
      if (style === 'italic') return { ...a, italic: !a.italic };
      return { ...a, underline: !a.underline };
    });
    set({ annotations: { ...annotations, [docId]: docAnns } });
  },

  setActiveTextBox: (box) => set({ activeTextBox: box }),

  setTextBoxFontFamily: (docId, page, id, family) => {
    const { annotations } = get();
    const docAnns = { ...(annotations[docId] ?? {}) };
    docAnns[page] = (docAnns[page] ?? []).map((a) =>
      a.id === id && a.type === 'text' ? { ...a, fontFamily: family } : a
    );
    set({ annotations: { ...annotations, [docId]: docAnns } });
  },

  setTextBoxFontSize: (docId, page, id, size) => {
    const { annotations } = get();
    const docAnns = { ...(annotations[docId] ?? {}) };
    docAnns[page] = (docAnns[page] ?? []).map((a) =>
      a.id === id && a.type === 'text' ? { ...a, fontSize: Math.max(6, Math.min(144, size)) } : a
    );
    set({ annotations: { ...annotations, [docId]: docAnns } });
  },

  setTextBoxBackground: (docId, page, id, color) => {
    const { annotations } = get();
    const docAnns = { ...(annotations[docId] ?? {}) };
    docAnns[page] = (docAnns[page] ?? []).map((a) =>
      a.id === id && a.type === 'text' ? { ...a, bgColor: color ?? undefined } : a
    );
    set({ annotations: { ...annotations, [docId]: docAnns } });
  },

  // ---------- Page assembly (mutate pdf-lib doc, then re-derive the render proxy) ----------
  rotatePage: async (docId, pageIndex) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return;
    await get().pushStructuralHistory(docId);
    const page = doc.pdfLibDoc.getPage(pageIndex);
    const current = page.getRotation().angle;
    page.setRotation(degrees((current + 90) % 360));
    const bytes = await doc.pdfLibDoc.save();
    const proxy = await bytesToProxy(bytes);
    set((s) => ({
      documents: s.documents.map((d) =>
        d.id === docId ? { ...d, proxy, pageCount: proxy.numPages } : d
      ),
    }));
  },

  deletePage: async (docId, pageIndex) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc || doc.pdfLibDoc.getPageCount() <= 1) return;
    await get().pushStructuralHistory(docId);
    doc.pdfLibDoc.removePage(pageIndex);
    const bytes = await doc.pdfLibDoc.save();
    const proxy = await bytesToProxy(bytes);
    set((s) => ({
      documents: s.documents.map((d) =>
        d.id === docId ? { ...d, proxy, pageCount: proxy.numPages } : d
      ),
      currentPage: Math.min(s.currentPage, proxy.numPages),
    }));
  },

  insertBlankPage: async (docId, afterIndex) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return;
    await get().pushStructuralHistory(docId);
    const ref = doc.pdfLibDoc.getPage(Math.max(0, afterIndex));
    const { width, height } = ref.getSize();
    doc.pdfLibDoc.insertPage(afterIndex + 1, [width, height]);
    const bytes = await doc.pdfLibDoc.save();
    const proxy = await bytesToProxy(bytes);
    set((s) => ({
      documents: s.documents.map((d) =>
        d.id === docId ? { ...d, proxy, pageCount: proxy.numPages } : d
      ),
    }));
  },

  reorderPage: async (docId, fromIndex, toIndex) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc || fromIndex === toIndex) return;
    await get().pushStructuralHistory(docId);
    const count = doc.pdfLibDoc.getPageCount();
    const order = Array.from({ length: count }, (_, i) => i);
    const [moved] = order.splice(fromIndex, 1);
    order.splice(toIndex, 0, moved);

    const newDoc = await PDFDocument.create();
    const copied = await newDoc.copyPages(doc.pdfLibDoc, order);
    copied.forEach((p) => newDoc.addPage(p));
    const bytes = await newDoc.save();
    const proxy = await bytesToProxy(bytes);
    set((s) => ({
      documents: s.documents.map((d) =>
        d.id === docId ? { ...d, pdfLibDoc: newDoc, proxy, pageCount: proxy.numPages } : d
      ),
    }));
  },

  extractPages: async (docId, range) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc || range.length === 0) return;
    const newDoc = await PDFDocument.create();
    const indices = range.map((p) => p - 1);
    const copied = await newDoc.copyPages(doc.pdfLibDoc, indices);
    copied.forEach((p) => newDoc.addPage(p));
    const bytes = await newDoc.save();
    downloadBlob(bytes, `extracted-${range[0]}-${range[range.length - 1]}-${doc.name}`);
  },

  splitDocument: async (docId, mode, options) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return { ok: false, error: 'Document not found.' };
    const pageCount = doc.pdfLibDoc.getPageCount();

    // Each entry is one output file, as a list of 1-indexed page numbers.
    let groups: number[][] = [];

    if (mode === 'every-page') {
      groups = Array.from({ length: pageCount }, (_, i) => [i + 1]);
    } else if (mode === 'every-n') {
      const n = Math.max(1, Math.floor(options.n ?? 1));
      for (let start = 1; start <= pageCount; start += n) {
        const end = Math.min(start + n - 1, pageCount);
        groups.push(Array.from({ length: end - start + 1 }, (_, i) => start + i));
      }
    } else {
      // ranges — e.g. "1-3, 5, 7-9"
      const raw = (options.ranges ?? '').trim();
      if (!raw) return { ok: false, error: 'Enter at least one page or range, e.g. "1-3, 5, 7-9".' };
      const segments = raw.split(',').map((s) => s.trim()).filter(Boolean);
      for (const seg of segments) {
        const rangeMatch = seg.match(/^(\d+)\s*-\s*(\d+)$/);
        const singleMatch = seg.match(/^(\d+)$/);
        if (rangeMatch) {
          const start = Number(rangeMatch[1]);
          const end = Number(rangeMatch[2]);
          if (start < 1 || end > pageCount || start > end) {
            return {
              ok: false,
              error: `"${seg}" is not a valid range for this ${pageCount}-page document.`,
            };
          }
          groups.push(Array.from({ length: end - start + 1 }, (_, i) => start + i));
        } else if (singleMatch) {
          const p = Number(singleMatch[1]);
          if (p < 1 || p > pageCount) {
            return {
              ok: false,
              error: `Page ${p} is out of range for this ${pageCount}-page document.`,
            };
          }
          groups.push([p]);
        } else {
          return {
            ok: false,
            error: `Could not understand "${seg}" — use page numbers and ranges like "1-3, 5, 7-9".`,
          };
        }
      }
    }

    if (groups.length === 0) return { ok: false, error: 'Nothing to split — the document has no pages.' };

    const baseName = doc.name.replace(/\.pdf$/i, '');
    const padWidth = String(groups.length).length;

    // A single output file downloads directly; more than one is bundled
    // into a zip — same convention already used for multi-page PNG export.
    if (groups.length === 1) {
      const newDoc = await PDFDocument.create();
      const copied = await newDoc.copyPages(doc.pdfLibDoc, groups[0].map((p) => p - 1));
      copied.forEach((p) => newDoc.addPage(p));
      const bytes = await newDoc.save();
      downloadBlob(bytes, `${baseName}-p${groups[0][0]}-${groups[0][groups[0].length - 1]}.pdf`);
      return { ok: true, fileCount: 1 };
    }

    const zip = new JSZip();
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const newDoc = await PDFDocument.create();
      const copied = await newDoc.copyPages(doc.pdfLibDoc, group.map((p) => p - 1));
      copied.forEach((p) => newDoc.addPage(p));
      const bytes = await newDoc.save();
      const label =
        group.length === 1 ? `p${group[0]}` : `p${group[0]}-${group[group.length - 1]}`;
      zip.file(`${baseName}-${String(i + 1).padStart(padWidth, '0')}-${label}.pdf`, bytes);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}-split.zip`;
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true, fileCount: groups.length };
  },

  mergeAllOpenDocuments: async () => {
    const { documents } = get();
    if (documents.length < 2) return;
    const newDoc = await PDFDocument.create();
    for (const d of documents) {
      const indices = Array.from({ length: d.pdfLibDoc.getPageCount() }, (_, i) => i);
      const copied = await newDoc.copyPages(d.pdfLibDoc, indices);
      copied.forEach((p) => newDoc.addPage(p));
    }
    const bytes = await newDoc.save();
    const proxy = await bytesToProxy(bytes);
    const merged: OpenDocument = {
      id: `merged-${Date.now()}`,
      name: 'Merged.pdf',
      pdfLibDoc: newDoc,
      proxy,
      pageCount: proxy.numPages,
      wasEncrypted: false,
    };
    set((s) => ({
      documents: [...s.documents, merged],
      activeId: merged.id,
      currentPage: 1,
      annotations: { ...s.annotations, [merged.id]: {} },
    }));
  },

  // Merges files picked directly (they don't need to already be open as
  // tabs first, unlike Combine Open Files above) in exactly the given
  // order. Each file is loaded the same careful way regular Open does —
  // trying an empty password automatically for files that are encrypted
  // but don't actually need one to open (see the false-"Password
  // Protected"-prompt fix) — so a permissions-only-restricted invoice
  // PDF doesn't wrongly get treated as unreadable here either. A file
  // that's genuinely unreadable (real password, corrupted) is skipped
  // with the rest reported back, rather than failing the whole merge.
  mergeSelectedFiles: async (files) => {
    if (files.length < 2) return { ok: false, error: 'Choose at least 2 PDF files to merge.' };

    const newDoc = await PDFDocument.create();
    const skipped: string[] = [];

    for (const file of files) {
      const buf = new Uint8Array(await file.arrayBuffer());
      let loaded: PDFDocument;
      try {
        loaded = await PDFDocument.load(buf, { ignoreEncryption: false });
      } catch (e) {
        if (e instanceof EncryptedPDFError) {
          try {
            loaded = await PDFDocument.load(buf, { password: '' });
          } catch {
            skipped.push(file.name);
            continue;
          }
        } else {
          skipped.push(file.name);
          continue;
        }
      }
      try {
        const indices = Array.from({ length: loaded.getPageCount() }, (_, i) => i);
        const copied = await newDoc.copyPages(loaded, indices);
        copied.forEach((p) => newDoc.addPage(p));
      } catch {
        skipped.push(file.name);
      }
    }

    if (newDoc.getPageCount() === 0) {
      return { ok: false, error: 'None of the selected files could be read.' };
    }

    const bytes = await newDoc.save();
    const proxy = await bytesToProxy(bytes);
    const merged: OpenDocument = {
      id: `merged-${Date.now()}`,
      name: 'Merged.pdf',
      pdfLibDoc: newDoc,
      proxy,
      pageCount: proxy.numPages,
      wasEncrypted: false,
    };
    set((s) => ({
      documents: [...s.documents, merged],
      activeId: merged.id,
      currentPage: 1,
      annotations: { ...s.annotations, [merged.id]: {} },
    }));
    downloadBlob(bytes, 'Merged.pdf');
    return { ok: true, skipped };
  },

  exportDocument: async (docId) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return;
    const outBytes = await get().buildExportBytes(docId);
    if (!outBytes) return;
    downloadBlob(outBytes, doc.name.endsWith('.pdf') ? doc.name : `${doc.name}.pdf`);
  },

  // The real, full export: clones the document, embeds every font actually
  // used, and bakes in every annotation (highlights, text boxes, ink,
  // notes, images), the invisible OCR text layer, and any direct line
  // edits. This used to live directly inside exportDocument, which meant
  // "Save" got all of this but "Save As" — which called a separate,
  // much simpler path — silently skipped all of it. Pulling it out into
  // its own function that both Save and Save As call is what actually
  // fixes that: there's now only one place this logic can exist, so the
  // two can't drift apart again.
  buildExportBytes: async (docId) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return null;

    // Clone the current pdf-lib doc so the in-app working copy (and undo/redo)
    // stays untouched — annotations are only "burned in" on the export copy.
    const structuralBytes = await doc.pdfLibDoc.save();
    const exportDoc = await PDFDocument.load(structuralBytes);
    exportDoc.registerFontkit(fontkit); // needed to embed the custom (non-standard) font families
    const font = await exportDoc.embedFont(StandardFonts.Helvetica);

    // Every family+bold+italic combination actually used, embedded up front
    // so each font file/StandardFont variant is only embedded once.
    const fontCache = new Map<string, PDFFont>();
    for (const pageAnns of Object.values(get().annotations[docId] ?? {})) {
      for (const a of pageAnns) {
        if (a.type === 'text') {
          await embedTextFont(exportDoc, a.fontFamily ?? 'Helvetica', !!a.bold, !!a.italic, fontCache);
        }
      }
    }

    // Bake in direct line edits (Edit tool) that haven't been Applied yet —
    // first, so annotations drawn below still land on top of them. Same
    // in-place vector swap as Apply; if a page can't be done that way, the
    // old line is covered with its own sampled background color and the
    // new text drawn over it.
    const docLines = get().pageLines[docId] ?? {};
    const docLineEdits = get().lineEdits[docId] ?? {};
    const docStyleOverrides = get().lineStyleOverrides[docId] ?? {};
    const lineEditPages = new Set([...Object.keys(docLineEdits), ...Object.keys(docStyleOverrides)].map(Number));
    for (const pageNum of lineEditPages) {
      if (pageNum < 1 || pageNum > exportDoc.getPageCount()) continue;
      const jobs = collectLineEditJobs(
        docLines[pageNum] ?? [],
        docLineEdits[pageNum] ?? {},
        docStyleOverrides[pageNum] ?? {}
      );
      if (jobs.length === 0) continue;
      const before = await doc.proxy.getPage(pageNum);
      if (
        (await canBakeLineEditsAsVector(exportDoc, pageNum - 1, before, jobs)) &&
        (await bakeLineEditsAsVector(exportDoc, pageNum - 1, jobs, fontCache))
      ) {
        continue;
      }
      await coverAndDrawLineEdits(exportDoc, pageNum - 1, before, jobs, fontCache);
    }

    const resolveTextFont = (a: TextBoxAnnotation): PDFFont => {
      const combo = `${a.fontFamily ?? 'Helvetica'}|${!!a.bold}|${!!a.italic}`;
      return fontCache.get(combo) ?? font;
    };

    const docAnnotations = get().annotations[docId] ?? {};
    for (const pageNumStr of Object.keys(docAnnotations)) {
      const pageNum = Number(pageNumStr);
      if (pageNum < 1 || pageNum > exportDoc.getPageCount()) continue;
      const page = exportDoc.getPage(pageNum - 1);
      const { width, height } = page.getSize();

      for (const a of docAnnotations[pageNum]) {
        const color = hexToRgb01(a.color);
        if (a.type === 'highlight') {
          page.drawRectangle({
            x: a.x * width,
            y: height - (a.y + a.h) * height,
            width: a.w * width,
            height: a.h * height,
            color,
            opacity: a.opacity ?? 0.35,
          });
        } else if (a.type === 'ink') {
          for (let i = 0; i < a.points.length - 1; i++) {
            const p1 = a.points[i];
            const p2 = a.points[i + 1];
            page.drawLine({
              start: { x: p1.x * width, y: height - p1.y * height },
              end: { x: p2.x * width, y: height - p2.y * height },
              thickness: 2.5,
              color,
            });
          }
        } else if (a.type === 'text') {
          const fontSize = a.fontSize; // already real points
          const textFont = resolveTextFont(a);
          const textWidth = textFont.widthOfTextAtSize(a.text || ' ', fontSize);
          if (a.bgColor) {
            page.drawRectangle({
              x: a.x * width - 2,
              y: height - a.y * height - fontSize * 1.15,
              width: textWidth + 4,
              height: fontSize * 1.35,
              color: hexToRgb01(a.bgColor),
            });
          }
          page.drawText(a.text || '', {
            x: a.x * width,
            y: height - a.y * height - fontSize,
            size: fontSize,
            font: textFont,
            color,
          });
          if (a.underline && a.text) {
            const underlineY = height - a.y * height - fontSize - fontSize * 0.08;
            page.drawLine({
              start: { x: a.x * width, y: underlineY },
              end: { x: a.x * width + textWidth, y: underlineY },
              thickness: Math.max(0.75, fontSize * 0.05),
              color,
            });
          }
        } else if (a.type === 'note') {
          const cx = a.x * width;
          const cy = height - a.y * height;
          page.drawCircle({ x: cx, y: cy, size: 7, color, opacity: 0.9 });
          if (a.text) {
            const boxW = 130;
            const lines = a.text.match(/.{1,28}(\s|$)/g) ?? [a.text];
            const boxH = 12 + lines.length * 11;
            page.drawRectangle({
              x: cx + 8,
              y: cy - boxH + 6,
              width: boxW,
              height: boxH,
              color: rgb(1, 0.98, 0.85),
              borderColor: color,
              borderWidth: 1,
              opacity: 0.97,
            });
            lines.forEach((line, i) => {
              page.drawText(line.trim(), {
                x: cx + 12,
                y: cy - 6 - i * 11,
                size: 8,
                font,
                color: rgb(0.15, 0.15, 0.15),
              });
            });
          }
        } else if (a.type === 'image') {
          const base64 = a.dataUrl.split(',')[1] ?? '';
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const isPng = a.dataUrl.startsWith('data:image/png');
          const embedded = isPng
            ? await exportDoc.embedPng(bytes)
            : await exportDoc.embedJpg(bytes);
          page.drawImage(embedded, {
            x: a.x * width,
            y: height - (a.y + a.h) * height,
            width: a.w * width,
            height: a.h * height,
          });
        }
      }
    }

    // Bake in the invisible OCR text layer (searchable-PDF trick: real text
    // drawn at 0 opacity directly over the scanned image, at the recognized
    // word positions, so readers can select/search/copy it).
    const docOcr = get().ocrText[docId] ?? {};
    for (const pageNumStr of Object.keys(docOcr)) {
      const pageNum = Number(pageNumStr);
      if (pageNum < 1 || pageNum > exportDoc.getPageCount()) continue;
      const page = exportDoc.getPage(pageNum - 1);
      const { width, height } = page.getSize();
      for (const w of docOcr[pageNum]) {
        if (!w.text.trim()) continue;
        const fontSize = Math.max(6, w.h * height * 0.85);
        page.drawText(w.text, {
          x: w.x * width,
          y: height - (w.y + w.h) * height,
          size: fontSize,
          font,
          opacity: 0, // invisible layer, but present in the content stream
        });
      }
    }

    return exportDoc.save();
  },

  exportToWord: async (docId) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return;

    const EMU_PER_POINT = 12700;
    const TWIPS_PER_POINT = 20;
    const IMAGE_SCALE = 2; // resolution for cropped inline images

    // Pass 1: gather every line across the whole document so we can figure
    // out what the "body text" font size is — headings are detected
    // relative to that, not to an absolute pt value (documents vary).
    const perPageLines: TextLine[][] = [];
    const sizeCounts = new Map<number, number>();
    for (let p = 1; p <= doc.pageCount; p++) {
      const page = await doc.proxy.getPage(p);
      const lines = await extractTextLines(page);
      perPageLines.push(lines);
      for (const line of lines) {
        const rounded = Math.round(line.fontSize * 2) / 2;
        sizeCounts.set(rounded, (sizeCounts.get(rounded) ?? 0) + 1);
      }
    }
    let bodySize = 11;
    let bestCount = 0;
    for (const [size, count] of sizeCounts) {
      if (count > bestCount) {
        bestCount = count;
        bodySize = size;
      }
    }

    const children: Paragraph[] = [];
    let sawAnyText = false;

    for (let p = 1; p <= doc.pageCount; p++) {
      const page = await doc.proxy.getPage(p);
      const lines = perPageLines[p - 1];
      const pageWidthPts = page.view[2] - page.view[0];

      if (lines.length > 0) {
        const leftMargin = Math.min(...lines.map((l) => l.x));
        const contentRight = Math.max(...lines.map((l) => l.right));
        const tolerance = 8;

        let prevY: number | null = null;
        let prevSize = bodySize;
        for (const line of lines) {
          sawAnyText = true;
          const gap = prevY !== null ? prevY - line.y : 0;
          const isNewParagraph = prevY === null || gap > prevSize * 1.6;

          const startsAtLeft = Math.abs(line.x - leftMargin) < tolerance;
          const endsAtRight = Math.abs(line.right - contentRight) < tolerance;
          const centerGapLeft = line.x - leftMargin;
          const centerGapRight = contentRight - line.right;
          let alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT;
          if (!startsAtLeft && endsAtRight) {
            alignment = AlignmentType.RIGHT;
          } else if (
            !startsAtLeft &&
            !endsAtRight &&
            Math.abs(centerGapLeft - centerGapRight) < tolerance * 2
          ) {
            alignment = AlignmentType.CENTER;
          }

          const relativeSize = line.fontSize / bodySize;
          const heading =
            relativeSize >= 1.6
              ? HeadingLevel.HEADING_1
              : relativeSize >= 1.25
              ? HeadingLevel.HEADING_2
              : undefined;

          const run = new TextRun({ text: line.text, size: Math.round(line.fontSize * 2) });

          if (isNewParagraph || !heading) {
            children.push(
              new Paragraph({
                children: [run],
                alignment,
                heading,
                spacing: isNewParagraph ? { before: 120 } : undefined,
              })
            );
          } else {
            // continuation of the same visual paragraph as a soft line break
            children.push(new Paragraph({ children: [run], alignment }));
          }
          prevY = line.y;
          prevSize = line.fontSize;
        }
      }

      // inline images, positioned to match their PDF location
      const images = await extractPageImages(page, IMAGE_SCALE);
      for (const img of images) {
        try {
          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  type: 'png',
                  data: img.pngBytes,
                  transformation: { width: img.w, height: img.h },
                  floating: {
                    horizontalPosition: {
                      relative: HorizontalPositionRelativeFrom.PAGE,
                      offset: Math.round(img.x * EMU_PER_POINT),
                      align: HorizontalPositionAlign.LEFT,
                    },
                    verticalPosition: {
                      relative: VerticalPositionRelativeFrom.PAGE,
                      offset: Math.round(img.yFromTop * EMU_PER_POINT),
                    },
                    wrap: { type: 'none' as never },
                  },
                }),
              ],
            })
          );
        } catch (e) {
          console.warn('Skipping one image that failed to embed:', e);
        }
      }

      if (p < doc.pageCount) {
        children.push(new Paragraph({ children: [], pageBreakBefore: true }));
      }

      void pageWidthPts; // reserved for future per-page section sizing
    }

    if (!sawAnyText && children.length === 0) {
      children.push(
        new Paragraph({
          text: 'No extractable text or images were found in this PDF (it may be a scan — try running OCR first, then re-export).',
        })
      );
    }

    // match page geometry to the source PDF's first page
    const firstPage = await doc.proxy.getPage(1);
    const pageWidthPts = firstPage.view[2] - firstPage.view[0];
    const pageHeightPts = firstPage.view[3] - firstPage.view[1];

    const wordDoc = new DocxDocument({
      sections: [
        {
          properties: {
            page: {
              size: {
                width: Math.round(pageWidthPts * TWIPS_PER_POINT),
                height: Math.round(pageHeightPts * TWIPS_PER_POINT),
              },
              margin: {
                top: Math.round(56.7 * TWIPS_PER_POINT), // ~2cm, PDF margin isn't reliably detectable page-to-page
                bottom: Math.round(56.7 * TWIPS_PER_POINT),
                left: Math.round(56.7 * TWIPS_PER_POINT),
                right: Math.round(56.7 * TWIPS_PER_POINT),
              },
            },
          },
          children,
        },
      ],
    });

    const blob = await Packer.toBlob(wordDoc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.name.replace(/\.pdf$/i, '')}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  },

  exportToPng: async (docId) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return;
    const baseName = doc.name.replace(/\.pdf$/i, '');
    const scale = 2.5; // high enough for print-quality PNGs

    const renderPageToPngBytes = async (pageNum: number): Promise<Uint8Array> => {
      const page = await doc.proxy.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      const dataUrl = canvas.toDataURL('image/png');
      return Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));
    };

    if (doc.pageCount === 1) {
      const bytes = await renderPageToPngBytes(1);
      const blob = new Blob([bytes as BlobPart], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}.png`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const zip = new JSZip();
    for (let p = 1; p <= doc.pageCount; p++) {
      const bytes = await renderPageToPngBytes(p);
      zip.file(`${baseName}-page-${String(p).padStart(3, '0')}.png`, bytes);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}-pages.zip`;
    a.click();
    URL.revokeObjectURL(url);
  },

  addImageAnnotation: async (docId, file) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return;
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    // measure the image to pick a sane default width that preserves aspect ratio
    const dims: { w: number; h: number } = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.width, h: img.height });
      img.src = dataUrl;
    });
    const defaultW = 0.28; // 28% of page width
    const defaultH = defaultW * (dims.h / dims.w);

    get().addAnnotation(docId, {
      id: `${Date.now()}`,
      type: 'image',
      page: get().currentPage,
      color: '#000000',
      x: 0.36,
      y: 0.4,
      w: defaultW,
      h: defaultH,
      dataUrl,
    });
  },

  runOcrOnPage: async (docId, pageNum) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return;
    set({ ocrProgress: { active: true, label: `Reading page ${pageNum}`, pct: 0 } });

    const page = await doc.proxy.getPage(pageNum);
    const scale = 2.5; // higher scale = better OCR accuracy
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const worker = await createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          set({
            ocrProgress: {
              active: true,
              label: `Recognizing text (page ${pageNum})`,
              pct: Math.round(m.progress * 100),
            },
          });
        }
      },
    });

    try {
      const { data } = await worker.recognize(canvas, {}, { blocks: true });
      const words: OcrWord[] = [];
      for (const block of data.blocks ?? []) {
        for (const para of block.paragraphs ?? []) {
          for (const line of para.lines ?? []) {
            for (const w of line.words ?? []) {
              words.push({
                text: w.text,
                x: w.bbox.x0 / viewport.width,
                y: w.bbox.y0 / viewport.height,
                w: (w.bbox.x1 - w.bbox.x0) / viewport.width,
                h: (w.bbox.y1 - w.bbox.y0) / viewport.height,
              });
            }
          }
        }
      }
      set((s) => ({
        ocrText: {
          ...s.ocrText,
          [docId]: { ...(s.ocrText[docId] ?? {}), [pageNum]: words },
        },
      }));
    } finally {
      await worker.terminate();
      set({ ocrProgress: null });
    }
  },

  runOcrOnDocument: async (docId) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return;
    for (let p = 1; p <= doc.pageCount; p++) {
      set({
        ocrProgress: { active: true, label: `Page ${p} of ${doc.pageCount}`, pct: 0 },
      });
      await get().runOcrOnPage(docId, p);
    }
    set({ ocrProgress: null });
  },

  // Real redaction: rather than just drawing a black box (which leaves the
  // original text/vector data underneath, recoverable by anyone who knows
  // to look), we rasterize the *entire page* to a flat image at high
  // resolution, with the redaction boxes burned into the pixels, and then
  // replace the page's content with that image only. The original text and
  // vector content for that page no longer exists anywhere in the file.
  // Trade-off: the whole page becomes an image (loses text-selectability
  // and increases file size) — that trade-off is what makes the removal real.
  applyRedactions: async (docId) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return;
    const docAnns = get().annotations[docId] ?? {};
    const docLineEdits = get().lineEdits[docId] ?? {};
    const docLines = get().pageLines[docId] ?? {};
    const docStyleOverrides = get().lineStyleOverrides[docId] ?? {};

    const redactionPages = Object.keys(docAnns)
      .map(Number)
      .filter((p) => (docAnns[p] ?? []).some((a) => a.type === 'redact' && !a.applied));
    const lineEditPages = Object.keys(docLineEdits)
      .map(Number)
      .filter((p) => Object.keys(docLineEdits[p] ?? {}).length > 0);
    const styleOverridePages = Object.keys(docStyleOverrides)
      .map(Number)
      .filter((p) => Object.keys(docStyleOverrides[p] ?? {}).length > 0);
    const pagesToFlatten = Array.from(
      new Set([...redactionPages, ...lineEditPages, ...styleOverridePages])
    );
    if (pagesToFlatten.length === 0) return;

    // Erase/redact marks only ever whited out the underlying PAGE PIXELS
    // (whatever pdf.js originally rendered there) — they never touched
    // our own annotations (text boxes, ink lines, highlights, images,
    // notes), which are separate overlay objects drawn on top. So typing
    // new text or drawing a line, then erasing over it, correctly whited
    // out the page underneath but left the overlay object sitting there
    // unchanged, which just looked like the erase had failed. Fixed by
    // also removing any of our own overlapping annotations here, using
    // each type's actual geometry (a point-containment check for
    // anchor-only shapes like text boxes/notes/ink points, a real
    // rectangle-overlap test for anything with real width/height).
    //
    // A second, separate case exists too, and was still broken after the
    // first fix: text edited on an *existing* PDF line via the Edit tool
    // (as opposed to a new Type Text box) doesn't live in the annotations
    // array at all — it's tracked in lineEdits/lineStyleOverrides,
    // rendered from pageLines' cached line geometry. Erasing over an
    // edited line needs to clear those entries too, or the edit just
    // keeps rendering from its own separate overlay, unaffected by
    // anything that only ever looked at `annotations`.
    const annotationsAfterErase: Record<number, Annotation[]> = { ...docAnns };
    const lineEditsAfterErase: Record<number, Record<number, string>> = { ...docLineEdits };
    const styleOverridesAfterErase: Record<number, Record<number, Partial<LineStyleOverride>>> = {
      ...docStyleOverrides,
    };
    for (const pageNum of redactionPages) {
      const marks = (docAnns[pageNum] ?? []).filter(
        (a): a is RedactionAnnotation => a.type === 'redact' && !a.applied
      );
      if (marks.length === 0) continue;

      const rectsOverlap = (x: number, y: number, w: number, h: number) =>
        marks.some((m) => x < m.x + m.w && x + w > m.x && y < m.y + m.h && y + h > m.y);
      const pointInsideAnyMark = (x: number, y: number) =>
        marks.some((m) => x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h);

      annotationsAfterErase[pageNum] = (annotationsAfterErase[pageNum] ?? []).filter((a: Annotation) => {
        if (a.type === 'redact') return true; // the marks themselves are handled by the baking loop below
        if (a.type === 'text' || a.type === 'note') return !pointInsideAnyMark(a.x, a.y);
        if (a.type === 'ink') return !a.points.some((p: { x: number; y: number }) => pointInsideAnyMark(p.x, p.y));
        if (a.type === 'highlight' || a.type === 'image') return !rectsOverlap(a.x, a.y, a.w, a.h);
        return true;
      });

      const linesOnPage = docLines[pageNum] ?? [];
      const editedLineIndices = new Set([
        ...Object.keys(lineEditsAfterErase[pageNum] ?? {}).map(Number),
        ...Object.keys(styleOverridesAfterErase[pageNum] ?? {}).map(Number),
      ]);
      for (const idx of editedLineIndices) {
        const line = linesOnPage[idx];
        if (!line) continue;
        if (rectsOverlap(line.x, line.yTop, line.w, line.h)) {
          if (lineEditsAfterErase[pageNum]) {
            const { [idx]: _drop, ...rest } = lineEditsAfterErase[pageNum];
            lineEditsAfterErase[pageNum] = rest;
          }
          if (styleOverridesAfterErase[pageNum]) {
            const { [idx]: _drop2, ...rest2 } = styleOverridesAfterErase[pageNum];
            styleOverridesAfterErase[pageNum] = rest2;
          }
        }
      }
    }
    if (redactionPages.length > 0) {
      set({
        annotations: { ...get().annotations, [docId]: annotationsAfterErase },
        lineEdits: { ...get().lineEdits, [docId]: lineEditsAfterErase },
        lineStyleOverrides: { ...get().lineStyleOverrides, [docId]: styleOverridesAfterErase },
      });
    }

    set({ ocrProgress: { active: true, label: 'Applying changes', pct: 0 } });

    const newDoc = await PDFDocument.create();
    newDoc.registerFontkit(fontkit);
    const totalPages = doc.pdfLibDoc.getPageCount();
    const vectorFontCache = new Map<string, PDFFont>();

    const redactionsOn = (pageNum: number) =>
      (docAnns[pageNum] ?? []).filter((a): a is RedactionAnnotation => a.type === 'redact' && !a.applied);

    // Decide up front which pages are carried over as-is or with their
    // edited lines swapped in place as real vector text (verified on a
    // scratch copy first), so they can all be copied in ONE copyPages call.
    // Copying page by page made pdf-lib duplicate every shared resource — a
    // logo or icon used on all 14 pages was written 14 times, inflating the
    // file by ~60% on every Apply. Pages with redaction marks always
    // rasterize: that's what guarantees the content under a black box is
    // really gone.
    const vectorJobs = new Map<number, LineEditJob[]>(); // page index -> edited lines
    const keepIndices: number[] = [];
    for (let i = 0; i < totalPages; i++) {
      const pageNum = i + 1;
      const editsHere = lineEditsAfterErase[pageNum] ?? {};
      const styleOverridesHere = styleOverridesAfterErase[pageNum] ?? {};
      const hasEdits = Object.keys(editsHere).length > 0 || Object.keys(styleOverridesHere).length > 0;
      if (redactionsOn(pageNum).length > 0) continue;
      if (!hasEdits) {
        keepIndices.push(i);
        continue;
      }
      const jobs = collectLineEditJobs(docLines[pageNum] ?? [], editsHere, styleOverridesHere);
      if (await canBakeLineEditsAsVector(doc.pdfLibDoc, i, await doc.proxy.getPage(pageNum), jobs)) {
        vectorJobs.set(i, jobs);
        keepIndices.push(i);
      }
    }
    const copiedPages = await newDoc.copyPages(doc.pdfLibDoc, keepIndices);
    const copiedByIndex = new Map(keepIndices.map((pageIndex, k) => [pageIndex, copiedPages[k]]));

    for (let i = 0; i < totalPages; i++) {
      const pageNum = i + 1;
      const redactionsHere = redactionsOn(pageNum);
      const editsHere = lineEditsAfterErase[pageNum] ?? {};
      const styleOverridesHere = styleOverridesAfterErase[pageNum] ?? {};
      const linesHere = docLines[pageNum] ?? [];

      const kept = copiedByIndex.get(i);
      const jobs = vectorJobs.get(i);
      if (kept) newDoc.addPage(kept);
      if (kept && (!jobs || (await bakeLineEditsAsVector(newDoc, newDoc.getPageCount() - 1, jobs, vectorFontCache)))) {
        // untouched page copied as-is, or edited lines swapped in place as
        // real text — either way the page keeps its images, links and
        // selectable text
      } else {
        if (kept) newDoc.removePage(newDoc.getPageCount() - 1); // already verified on a scratch copy, so not expected
        // rasterize this page with redactions and/or edited-line
        // replacement text burned directly into the pixels — this is what
        // makes text edits genuinely permanent rather than just visually
        // covered: the original glyphs no longer exist anywhere in the
        // file once this page is flattened. Trade-off, same as redaction:
        // this page becomes an image (loses text-selectability).
        const pdfPage = await doc.proxy.getPage(pageNum);
        const scale = 2.5;
        const viewport = pdfPage.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise;

        for (const r of redactionsHere) {
          ctx.fillStyle = r.color || '#000000';
          // Snap to whole device pixels with a 1px safety margin on every
          // side. My earlier fix added a fixed sub-pixel padding, which
          // doesn't actually guarantee anything — padding a fractional
          // coordinate can still land on a fraction. Floor/ceil is the
          // real guarantee: the fill always fully covers every pixel the
          // erased area touches, with no fractional edge left for the
          // canvas to anti-alias into a visible sliver of the original
          // content.
          const x0 = Math.floor(r.x * viewport.width) - 1;
          const y0 = Math.floor(r.y * viewport.height) - 1;
          const x1 = Math.ceil((r.x + r.w) * viewport.width) + 1;
          const y1 = Math.ceil((r.y + r.h) * viewport.height) + 1;
          ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        }

        const lineIndicesToBake = new Set([
          ...Object.keys(editsHere).map(Number),
          ...Object.keys(styleOverridesHere).map(Number),
        ]);

        for (const idx of lineIndicesToBake) {
          const line = linesHere[idx];
          if (!line) continue;
          const override = styleOverridesHere[idx];
          const newText = editsHere[idx] ?? line.text;
          const effectiveFamily = override?.fontFamily ?? line.fontFamily;
          const effectiveItalic = override?.italic ?? line.italic;
          const effectiveUnderline = override?.underline ?? false;
          const effectiveFontSizePt = override?.fontSize ?? line.fontSizePt;
          // if nothing actually changed (no text edit, no real style
          // override applied), skip re-baking this line at all
          if (
            newText === line.text &&
            !override?.fontFamily &&
            !override?.fontSize &&
            override?.bold === undefined &&
            override?.italic === undefined &&
            !override?.underline &&
            override?.align === undefined
          ) {
            continue;
          }

          const effectiveAlign = override?.align ?? line.align;
          const lineLeftPx = line.x * viewport.width;
          const lineRightPx = (line.x + line.w) * viewport.width;
          const py = line.yTop * viewport.height;
          const ph = line.h * viewport.height;

          // Font/text-stack setup moved up here, before the cover rect is
          // sized — needed so the actual rendered width of the *new* text
          // can be measured first. This is the real bug behind "the edges
          // are going out": the cover rect's width was only ever computed
          // from the ORIGINAL line's detected width (line.w), never from
          // how long the actual edited text turned out to be. Appending
          // text (e.g. "Your trip" -> "Your trip To Dubai on 2026") made
          // the real text far wider than that original width, so the
          // overflow portion rendered directly onto un-recolored original
          // pixels the cover never touched — visible as content "going
          // out" past a correctly-colored patch that was simply too narrow.
          // the line's real point size, not an estimate from its box height
          // (which came out ~8% small and made edited lines visibly shrink)
          const fontPx = effectiveFontSizePt * scale;
          const canvasFontStack = FONT_FAMILY_CSS[effectiveFamily] ?? FONT_FAMILY_CSS.Helvetica;
          const weightPrefix = `${effectiveLineWeight(line, override)} `;
          const stylePrefix = effectiveItalic ? 'italic ' : '';
          ctx.font = `${stylePrefix}${weightPrefix}${fontPx}px ${canvasFontStack}`;
          const measuredTextWidth = newText.trim() ? ctx.measureText(newText).width : 0;
          // anchor the new text the way the line is aligned, and cover both
          // the original line and wherever the new text now reaches
          const textX =
            effectiveAlign === 'right'
              ? lineRightPx - measuredTextWidth
              : effectiveAlign === 'center'
              ? (lineLeftPx + lineRightPx - measuredTextWidth) / 2
              : lineLeftPx;
          const px = Math.min(lineLeftPx, textX);
          const pw = Math.max(Math.max(lineRightPx, textX + measuredTextWidth) - px, 4);

          // Sample the real background right here, before covering it —
          // the canvas still holds the untouched original render at this
          // point, so this reads whatever was actually behind the text
          // (a colored banner, a shaded row, or plain white) rather than
          // assuming white and breaking visibly on anything else.
          //
          // Snapped to whole device pixels with floor/ceil, same fix
          // already proven for the redaction fill elsewhere in this
          // function — a fixed-but-fractional pixel padding (the old
          // "-2 / +4") doesn't actually guarantee full coverage, since
          // padding a fractional coordinate can still land on a fraction.
          const cx0 = Math.floor(px) - 2;
          const cy0 = Math.floor(py) - 2;
          const cx1 = Math.ceil(px + pw) + 2;
          const cy1 = Math.ceil(py + ph) + 2;
          ctx.fillStyle = sampleBoxBackgroundColor(ctx, cx0, cy0, cx1 - cx0, cy1 - cy0);
          ctx.fillRect(cx0, cy0, cx1 - cx0, cy1 - cy0);
          if (newText.trim()) {
            ctx.fillStyle = line.color || '#000000';
            ctx.font = `${stylePrefix}${weightPrefix}${fontPx}px ${canvasFontStack}`;
            ctx.textBaseline = 'alphabetic';
            const textY = py + ph * LINE_BASELINE_RATIO;
            ctx.fillText(newText, textX, textY);
            if (effectiveUnderline) {
              const textWidth = ctx.measureText(newText).width;
              ctx.strokeStyle = line.color || '#000000';
              ctx.lineWidth = Math.max(1, fontPx * 0.05);
              ctx.beginPath();
              const underlineY = textY + fontPx * 0.08;
              ctx.moveTo(textX, underlineY);
              ctx.lineTo(textX + textWidth, underlineY);
              ctx.stroke();
            }
          }
        }

        const pngDataUrl = canvas.toDataURL('image/png');
        const pngBytes = Uint8Array.from(atob(pngDataUrl.split(',')[1]), (c) =>
          c.charCodeAt(0)
        );
        const embedded = await newDoc.embedPng(pngBytes);
        const originalSize = doc.pdfLibDoc.getPage(i).getSize();
        const newPage = newDoc.addPage([originalSize.width, originalSize.height]);
        newPage.drawImage(embedded, {
          x: 0,
          y: 0,
          width: originalSize.width,
          height: originalSize.height,
        });
      }
    }

    const bytes = await newDoc.save();
    const proxy = await bytesToProxy(bytes);

    set((s) => {
      const clearedAnns = { ...(s.annotations[docId] ?? {}) };
      for (const p of pagesToFlatten) {
        // redactions are now physically part of the page image; drop the
        // editable markers and any OCR words that lived on that page
        clearedAnns[p] = (clearedAnns[p] ?? []).filter((a) => a.type !== 'redact');
      }
      const clearedOcr = { ...(s.ocrText[docId] ?? {}) };
      for (const p of pagesToFlatten) delete clearedOcr[p];
      const clearedLineEdits = { ...(s.lineEdits[docId] ?? {}) };
      for (const p of pagesToFlatten) delete clearedLineEdits[p];
      const clearedLines = { ...(s.pageLines[docId] ?? {}) };
      for (const p of pagesToFlatten) delete clearedLines[p]; // re-derive from the new flattened page if revisited
      const clearedObstacles = { ...(s.pageObstacles[docId] ?? {}) };
      for (const p of pagesToFlatten) delete clearedObstacles[p];
      const clearedStyleOverrides = { ...(s.lineStyleOverrides[docId] ?? {}) };
      for (const p of pagesToFlatten) delete clearedStyleOverrides[p];

      // The edits are now part of the page itself, so their overlays and
      // cached line geometry have to go too — these were computed but never
      // returned, which left stale overlays drawn over the new page (at the
      // old line positions) and let a second Apply bake the same edits again.
      return {
        documents: s.documents.map((d) =>
          d.id === docId ? { ...d, pdfLibDoc: newDoc, proxy, pageCount: proxy.numPages } : d
        ),
        annotations: { ...s.annotations, [docId]: clearedAnns },
        ocrText: { ...s.ocrText, [docId]: clearedOcr },
        lineEdits: { ...s.lineEdits, [docId]: clearedLineEdits },
        lineStyleOverrides: { ...s.lineStyleOverrides, [docId]: clearedStyleOverrides },
        pageLines: { ...s.pageLines, [docId]: clearedLines },
        pageObstacles: { ...s.pageObstacles, [docId]: clearedObstacles },
        ocrProgress: null,
      };
    });
  },

  exportEncrypted: async (docId, opts) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return;
    const structuralBytes = await doc.pdfLibDoc.save();
    const exportDoc = await PDFDocument.load(structuralBytes);

    exportDoc.encrypt({
      userPassword: opts.userPassword || undefined,
      ownerPassword: opts.ownerPassword || opts.userPassword || undefined,
      permissions: {
        printing: opts.allowPrinting ? 'highResolution' : undefined,
        modifying: opts.allowModifying,
        copying: opts.allowCopying,
        annotating: opts.allowAnnotating,
        documentAssembly: opts.allowModifying,
        contentAccessibility: true,
        fillingForms: opts.allowAnnotating,
      },
    });

    const bytes = await exportDoc.save();
    downloadBlob(
      bytes,
      doc.name.endsWith('.pdf') ? `protected-${doc.name}` : `protected-${doc.name}.pdf`
    );
  },

  // ---------- Annotations ----------
  addAnnotation: (docId, annotation) => {
    const { annotations, lineEdits, lineStyleOverrides, undoStack } = get();
    set({ undoStack: [...undoStack, { annotations, lineEdits, lineStyleOverrides }], redoStack: [] });
    const docAnns = { ...(annotations[docId] ?? {}) };
    const pageAnns = [...(docAnns[annotation.page] ?? []), annotation];
    docAnns[annotation.page] = pageAnns;
    set({ annotations: { ...annotations, [docId]: docAnns } });
  },

  updateNoteText: (docId, page, id, text) => {
    const { annotations } = get();
    const docAnns = { ...(annotations[docId] ?? {}) };
    docAnns[page] = (docAnns[page] ?? []).map((a) =>
      a.id === id && a.type === 'note' ? { ...a, text } : a
    );
    set({ annotations: { ...annotations, [docId]: docAnns } });
  },

  updateTextBoxText: (docId, page, id, text) => {
    const { annotations } = get();
    const docAnns = { ...(annotations[docId] ?? {}) };
    docAnns[page] = (docAnns[page] ?? []).map((a) =>
      a.id === id && a.type === 'text' ? { ...a, text } : a
    );
    set({ annotations: { ...annotations, [docId]: docAnns } });
  },

  updateTextBoxPosition: (docId, page, id, x, y) => {
    const { annotations } = get();
    const docAnns = { ...(annotations[docId] ?? {}) };
    docAnns[page] = (docAnns[page] ?? []).map((a) =>
      a.id === id && a.type === 'text' ? { ...a, x, y } : a
    );
    set({ annotations: { ...annotations, [docId]: docAnns } });
  },

  updateImagePosition: (docId, page, id, x, y) => {
    const { annotations } = get();
    const docAnns = { ...(annotations[docId] ?? {}) };
    docAnns[page] = (docAnns[page] ?? []).map((a) =>
      a.id === id && a.type === 'image' ? { ...a, x, y } : a
    );
    set({ annotations: { ...annotations, [docId]: docAnns } });
  },

  updateNotePosition: (docId, page, id, x, y) => {
    const { annotations } = get();
    const docAnns = { ...(annotations[docId] ?? {}) };
    docAnns[page] = (docAnns[page] ?? []).map((a) =>
      a.id === id && a.type === 'note' ? { ...a, x, y } : a
    );
    set({ annotations: { ...annotations, [docId]: docAnns } });
  },

  finalizeSignature: (docId, page, id, dataUrl, w, h) => {
    const { annotations } = get();
    const docAnns = { ...(annotations[docId] ?? {}) };
    docAnns[page] = (docAnns[page] ?? []).map((a) =>
      a.id === id && a.type === 'image' ? { ...a, dataUrl, w, h } : a
    );
    set({ annotations: { ...annotations, [docId]: docAnns } });
  },

  saveSignature: (name, dataUrl, w, h) => {
    const sig: SavedSignature = { id: `${Date.now()}`, name, dataUrl, w, h };
    const next = [...get().savedSignatures, sig];
    set({ savedSignatures: next });
    persistSavedSignatures(next);
  },

  deleteSavedSignature: (id) => {
    const next = get().savedSignatures.filter((s) => s.id !== id);
    set({ savedSignatures: next });
    persistSavedSignatures(next);
  },

  toggleTheme: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
    set({ theme: next });
    persistTheme(next);
  },

  signIn: (name, email) => {
    const profile: UserProfile = { name: name.trim(), email: email.trim() };
    set({ userProfile: profile });
    persistProfile(profile);
  },

  signOut: () => {
    set({ userProfile: null });
    persistProfile(null);
  },

  deleteAnnotation: (docId, page, id) => {
    const { annotations, lineEdits, lineStyleOverrides, undoStack } = get();
    set({ undoStack: [...undoStack, { annotations, lineEdits, lineStyleOverrides }], redoStack: [] });
    const docAnns = { ...(annotations[docId] ?? {}) };
    docAnns[page] = (docAnns[page] ?? []).filter((a) => a.id !== id);
    set({ annotations: { ...annotations, [docId]: docAnns } });
  },

  // ---------- Direct line editing ----------
  loadPageLines: async (docId, pageNum) => {
    const doc = get().documents.find((d) => d.id === docId);
    if (!doc) return;
    if (get().pageLines[docId]?.[pageNum]) return; // already cached
    try {
      const page = await doc.proxy.getPage(pageNum);
      const rawLines = await extractTextLines(page);
      const pageWidthPts = page.view[2] - page.view[0];
      const pageHeightPts = page.view[3] - page.view[1];

      const cached: CachedLine[] = rawLines.map((l, idx) => {
        const lineHeightPt = l.fontSize * LINE_HEIGHT_MULT;
        const topPt = pageHeightPts - l.y - l.fontSize * ASCENT_MULT; // approx top of glyph box
        return {
          index: idx,
          text: l.text,
          x: l.x / pageWidthPts,
          yTop: topPt / pageHeightPts,
          w: (l.right - l.x) / pageWidthPts,
          h: lineHeightPt / pageHeightPts,
          baselinePt: l.y,
          leftPt: l.x,
          fontSizePt: l.fontSize,
          color: l.color,
          fontFamily: l.fontFamily,
          bold: l.bold,
          italic: l.italic,
          weight: l.weight,
          align: 'left' as LineAlign,
        };
      });
      detectLineAlignments(cached, pageWidthPts).forEach((align, i) => {
        cached[i].align = align;
      });
      let obstacles: PageObstacle[] = [];
      try {
        obstacles = collectPageObstacles(await page.getOperatorList(), pdfjsLib.OPS, page.view);
      } catch (e) {
        console.warn('Could not read images/shapes for overflow checks:', e);
      }

      set((s) => ({
        pageLines: {
          ...s.pageLines,
          [docId]: { ...(s.pageLines[docId] ?? {}), [pageNum]: cached },
        },
        pageObstacles: {
          ...s.pageObstacles,
          [docId]: { ...(s.pageObstacles[docId] ?? {}), [pageNum]: obstacles },
        },
      }));

      // First look at this document: adopt its dominant body text size as
      // the default for newly-typed text, so new text starts out matching
      // the document's existing styling rather than a fixed generic size.
      // (Font *family* can't be matched this way — see the Edit tab's font
      // family dropdown for what's realistically achievable there.)
      if (pageNum === 1 && cached.length > 0) {
        const sizeCounts = new Map<number, number>();
        for (const line of cached) {
          const rounded = Math.round(line.fontSizePt);
          sizeCounts.set(rounded, (sizeCounts.get(rounded) ?? 0) + 1);
        }
        let bodySize = 14;
        let bestCount = 0;
        for (const [size, count] of sizeCounts) {
          if (count > bestCount) {
            bestCount = count;
            bodySize = size;
          }
        }
        if (bodySize >= 6 && bodySize <= 72) {
          set({ textFontSize: bodySize });
        }
      }
    } catch (e) {
      console.warn('Could not load page lines for direct editing:', e);
    }
  },

  setLineEdit: (docId, page, lineIndex, text) => {
    const { annotations, lineEdits, lineStyleOverrides, undoStack } = get();
    set({ undoStack: [...undoStack, { annotations, lineEdits, lineStyleOverrides }], redoStack: [] });
    const docEdits = { ...(lineEdits[docId] ?? {}) };
    docEdits[page] = { ...(docEdits[page] ?? {}), [lineIndex]: text };
    set({ lineEdits: { ...lineEdits, [docId]: docEdits } });
  },

  setLineEdits: (docId, page, edits, newLines = []) => {
    const { annotations, lineEdits, lineStyleOverrides, pageLines, undoStack } = get();
    set({ undoStack: [...undoStack, { annotations, lineEdits, lineStyleOverrides }], redoStack: [] });
    const docEdits = { ...(lineEdits[docId] ?? {}) };
    docEdits[page] = { ...(docEdits[page] ?? {}), ...edits };
    const update: Partial<DocumentState> = { lineEdits: { ...lineEdits, [docId]: docEdits } };
    if (newLines.length > 0) {
      // undo leaves these in place with no text, which draws nothing
      const docLines = pageLines[docId] ?? {};
      update.pageLines = {
        ...pageLines,
        [docId]: { ...docLines, [page]: [...(docLines[page] ?? []), ...newLines] },
      };
    }
    set(update);
  },

  setLineStyleOverride: (docId, page, lineIndex, patch) => {
    const { lineStyleOverrides } = get();
    const docOverrides = { ...(lineStyleOverrides[docId] ?? {}) };
    const pageOverrides = { ...(docOverrides[page] ?? {}) };
    pageOverrides[lineIndex] = { ...(pageOverrides[lineIndex] ?? {}), ...patch };
    docOverrides[page] = pageOverrides;
    set({ lineStyleOverrides: { ...lineStyleOverrides, [docId]: docOverrides } });
  },

  setActiveEditLine: (line) => set({ activeEditLine: line }),

  pushStructuralHistory: async (docId) => {
    const { documents, annotations, lineEdits, lineStyleOverrides, undoStack } = get();
    const doc = documents.find((d) => d.id === docId);
    if (!doc) return;
    const bytes = await doc.pdfLibDoc.save();
    set({
      undoStack: [
        ...undoStack,
        { annotations, lineEdits, lineStyleOverrides, pdfSnapshot: { docId, bytes } },
      ],
      redoStack: [],
    });
  },

  undo: async () => {
    const { undoStack, redoStack, annotations, lineEdits, lineStyleOverrides, documents } = get();
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];

    let redoSnapshot: HistoryEntry['pdfSnapshot'];
    let nextDocuments = documents;

    if (prev.pdfSnapshot) {
      const { docId, bytes } = prev.pdfSnapshot;
      const doc = documents.find((d) => d.id === docId);
      if (doc) {
        // capture where we're moving away FROM, so redo can put it back
        const currentBytes = await doc.pdfLibDoc.save();
        redoSnapshot = { docId, bytes: currentBytes };
        const restoredPdfDoc = await PDFDocument.load(bytes);
        const proxy = await bytesToProxy(bytes);
        nextDocuments = documents.map((d) =>
          d.id === docId
            ? { ...d, pdfLibDoc: restoredPdfDoc, proxy, pageCount: proxy.numPages }
            : d
        );
        // form fields, if any, were detected from the now-stale document —
        // refresh them against the restored one
        await get().loadFormFields(docId);
      }
    }

    set({
      documents: nextDocuments,
      annotations: prev.annotations,
      lineEdits: prev.lineEdits,
      lineStyleOverrides: prev.lineStyleOverrides,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, { annotations, lineEdits, lineStyleOverrides, pdfSnapshot: redoSnapshot }],
    });
  },

  redo: async () => {
    const { undoStack, redoStack, annotations, lineEdits, lineStyleOverrides, documents } = get();
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];

    let undoSnapshot: HistoryEntry['pdfSnapshot'];
    let nextDocuments = documents;

    if (next.pdfSnapshot) {
      const { docId, bytes } = next.pdfSnapshot;
      const doc = documents.find((d) => d.id === docId);
      if (doc) {
        const currentBytes = await doc.pdfLibDoc.save();
        undoSnapshot = { docId, bytes: currentBytes };
        const restoredPdfDoc = await PDFDocument.load(bytes);
        const proxy = await bytesToProxy(bytes);
        nextDocuments = documents.map((d) =>
          d.id === docId
            ? { ...d, pdfLibDoc: restoredPdfDoc, proxy, pageCount: proxy.numPages }
            : d
        );
        await get().loadFormFields(docId);
      }
    }

    set({
      documents: nextDocuments,
      annotations: next.annotations,
      lineEdits: next.lineEdits,
      lineStyleOverrides: next.lineStyleOverrides,
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, { annotations, lineEdits, lineStyleOverrides, pdfSnapshot: undoSnapshot }],
    });
  },
}));
