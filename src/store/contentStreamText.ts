import {
  PDFArray,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
  type PDFDocument,
  type PDFPage,
  type PDFStream,
} from '@cantoo/pdf-lib';

// Removes the original glyphs of edited text lines straight out of a page's
// content stream, so an edited line can be redrawn as real vector text in
// its place — instead of rasterizing the whole page (which blurred photos,
// broke links and made every word unselectable) or painting an opaque patch
// over the old text (which showed up as a visible block on photos and
// gradients).
//
// A "band" is one edited line, in PDF user space: the line's baseline, its
// left/right extent and its font size. Every text-showing operator whose
// starting point lands inside a band is dropped. This only works when each
// removed operator is followed by a fresh positioning operator (or the end
// of its text block) — otherwise the text after it would shift left — so
// anything we can't prove safe returns false and the caller falls back to
// the old rasterize path. Google Slides, Word, Canva and most PDF
// generators position every text run individually, which is the case this
// is built for.

export interface TextBand {
  left: number;
  right: number;
  baseline: number;
  size: number;
}

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function mul(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

// Whether a text run starting at (x, y) with the given size belongs to the
// band's line. Shared with the post-edit verification so both agree.
export function isInTextBand(band: TextBand, x: number, y: number, size: number): boolean {
  return (
    Math.abs(y - band.baseline) <= band.size * 0.35 &&
    x >= band.left - band.size * 0.3 &&
    x <= band.right &&
    Math.abs(size - band.size) <= band.size * 0.3
  );
}

function verticallyInAnyBand(bands: TextBand[], y: number): boolean {
  return bands.some((b) => Math.abs(y - b.baseline) <= b.size * 0.35);
}

// ---------- tokenizer (bytes, not strings: content streams are binary) ----------
const isWhite = (c: number) => c === 0 || c === 9 || c === 10 || c === 12 || c === 13 || c === 32;
const isDelim = (c: number) =>
  c === 0x28 || c === 0x29 || c === 0x3c || c === 0x3e || c === 0x5b || c === 0x5d ||
  c === 0x7b || c === 0x7d || c === 0x2f || c === 0x25;
const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;

interface Operand {
  start: number;
  end: number;
  num?: number;
  isMark?: 'array' | 'dict';
}

// Checked by shape rather than instanceof: a page copied in from another
// document, or pdf-lib being bundled twice, can hand us objects from a
// different copy of the class.
function readStreamBytes(stream: PDFStream): Uint8Array | null {
  // A raw (loaded-from-file) stream must be decoded through its /Filter —
  // its getUnencodedContents() returns the still-compressed bytes.
  const s = stream as unknown as { getUnencodedContents?: () => Uint8Array; contents?: Uint8Array };
  if (s.contents instanceof Uint8Array) return decodePDFRawStream(stream as PDFRawStream).decode();
  if (s.getUnencodedContents) return s.getUnencodedContents();
  return null;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

const ascii = (s: string) => Uint8Array.from(s, (ch) => ch.charCodeAt(0));

export function removeTextInBands(doc: PDFDocument, page: PDFPage, bands: TextBand[]): boolean {
  if (bands.length === 0) return true;

  const contents = page.node.Contents();
  if (!contents) return false;
  const streams: PDFStream[] =
    typeof (contents as PDFArray).asArray === 'function'
      ? (contents as PDFArray).asArray().map((r) => doc.context.lookup(r) as PDFStream)
      : [contents as PDFStream];

  const chunks: Uint8Array[] = [];
  try {
    for (const s of streams) {
      const bytes = readStreamBytes(s);
      if (!bytes) return false;
      chunks.push(bytes, ascii('\n'));
    }
  } catch {
    return false; // unsupported filter — leave the page alone
  }
  const src = concatBytes(chunks);

  // graphics/text state
  let ctm: Matrix = IDENTITY;
  const ctmStack: Matrix[] = [];
  let tm: Matrix = IDENTITY;
  let tlm: Matrix = IDENTITY;
  let fontSize = 0;
  let leading = 0;
  let rise = 0;
  let removedNeedsReposition = false; // a dropped Tj/TJ must be followed by a re-position
  let positionUnknown = false; // a kept Tj/TJ advanced the cursor by an amount we don't track
  const hitBands = new Set<number>();

  const out: Uint8Array[] = [];
  let copiedUpTo = 0;
  const replaceSpan = (start: number, end: number, replacement: string) => {
    out.push(src.subarray(copiedUpTo, start), ascii(replacement));
    copiedUpTo = end;
  };

  const operands: Operand[] = [];
  const nums = (n: number): number[] | null => {
    if (operands.length < n) return null;
    const vals = operands.slice(-n).map((o) => o.num);
    return vals.every((v) => v !== undefined) ? (vals as number[]) : null;
  };
  const textMoveTo = (tx: number, ty: number) => {
    tlm = mul([1, 0, 0, 1, tx, ty], tlm);
    tm = tlm;
    removedNeedsReposition = false;
    positionUnknown = false;
  };

  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (isWhite(c)) {
      i++;
      continue;
    }
    if (c === 0x25) {
      // comment
      while (i < n && src[i] !== 10 && src[i] !== 13) i++;
      continue;
    }
    const start = i;
    if (c === 0x28) {
      // literal string, nested parens + backslash escapes
      let depth = 0;
      while (i < n) {
        const ch = src[i];
        if (ch === 0x5c) {
          i += 2;
          continue;
        }
        if (ch === 0x28) depth++;
        else if (ch === 0x29) {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        i++;
      }
      operands.push({ start, end: i });
      continue;
    }
    if (c === 0x3c) {
      if (src[i + 1] === 0x3c) {
        operands.push({ start, end: i + 2, isMark: 'dict' });
        i += 2;
        continue;
      }
      while (i < n && src[i] !== 0x3e) i++;
      i++;
      operands.push({ start, end: i });
      continue;
    }
    if (c === 0x3e && src[i + 1] === 0x3e) {
      i += 2;
      let k = operands.length - 1;
      while (k >= 0 && operands[k].isMark !== 'dict') k--;
      if (k < 0) return false;
      const markStart = operands[k].start;
      operands.length = k;
      operands.push({ start: markStart, end: i });
      continue;
    }
    if (c === 0x5b) {
      operands.push({ start, end: i + 1, isMark: 'array' });
      i++;
      continue;
    }
    if (c === 0x5d) {
      i++;
      let k = operands.length - 1;
      while (k >= 0 && operands[k].isMark !== 'array') k--;
      if (k < 0) return false;
      const markStart = operands[k].start;
      operands.length = k;
      operands.push({ start: markStart, end: i });
      continue;
    }
    if (c === 0x2f) {
      i++;
      while (i < n && !isWhite(src[i]) && !isDelim(src[i])) i++;
      operands.push({ start, end: i });
      continue;
    }
    if (c === 0x7b || c === 0x7d) {
      i++;
      continue; // PostScript calculator braces never appear in page content
    }

    // bare word: number, keyword operand, or operator
    while (i < n && !isWhite(src[i]) && !isDelim(src[i])) i++;
    if (i === start) return false; // stray delimiter (e.g. an unmatched ")") — malformed content
    let word = '';
    for (let k = start; k < i; k++) word += String.fromCharCode(src[k]);
    if (NUMBER_RE.test(word)) {
      operands.push({ start, end: i, num: parseFloat(word) });
      continue;
    }
    if (word === 'true' || word === 'false' || word === 'null') {
      operands.push({ start, end: i });
      continue;
    }

    // ---- operator ----
    // inside an array/dict an operator-looking word is malformed content
    if (operands.some((o) => o.isMark)) return false;
    const opStart = operands.length > 0 ? operands[0].start : start;
    const opEnd = i;

    switch (word) {
      case 'q':
        ctmStack.push(ctm);
        break;
      case 'Q':
        ctm = ctmStack.pop() ?? IDENTITY;
        break;
      case 'cm': {
        const v = nums(6);
        if (!v) return false;
        ctm = mul(v as Matrix, ctm);
        break;
      }
      case 'BT':
        tm = IDENTITY;
        tlm = IDENTITY;
        removedNeedsReposition = false;
        positionUnknown = false;
        break;
      case 'ET':
        removedNeedsReposition = false;
        positionUnknown = false;
        break;
      case 'Tf': {
        const v = nums(1);
        if (!v) return false;
        fontSize = v[0];
        break;
      }
      case 'TL': {
        const v = nums(1);
        if (!v) return false;
        leading = v[0];
        break;
      }
      case 'Ts': {
        const v = nums(1);
        if (!v) return false;
        rise = v[0];
        break;
      }
      case 'Tm': {
        const v = nums(6);
        if (!v) return false;
        tlm = v as Matrix;
        tm = tlm;
        removedNeedsReposition = false;
        positionUnknown = false;
        break;
      }
      case 'Td':
      case 'TD': {
        const v = nums(2);
        if (!v) return false;
        if (word === 'TD') leading = -v[1];
        textMoveTo(v[0], v[1]);
        break;
      }
      case 'T*':
        textMoveTo(0, -leading);
        break;
      case 'Tj':
      case 'TJ':
      case "'":
      case '"': {
        if (word === "'" || word === '"') textMoveTo(0, -leading);
        const trm = mul(tm, ctm);
        const x = rise * trm[2] + trm[4];
        const y = rise * trm[3] + trm[5];
        const size = Math.abs(fontSize) * Math.hypot(trm[2], trm[3]);

        if (positionUnknown) {
          // this run continues from wherever the previous one ended; we
          // don't track glyph advances, so if that could be on an edited
          // line we can't tell whether it belongs to it
          if (verticallyInAnyBand(bands, y)) return false;
          break;
        }
        const bandIdx = bands.findIndex((b) => isInTextBand(b, x, y, size));
        if (bandIdx === -1) {
          if (removedNeedsReposition) return false;
          if (word === 'Tj' || word === 'TJ') positionUnknown = true;
          break;
        }

        hitBands.add(bandIdx);
        if (word === 'Tj' || word === 'TJ') {
          replaceSpan(opStart, opEnd, '');
          removedNeedsReposition = true;
        } else if (word === "'") {
          replaceSpan(opStart, opEnd, 'T*');
        } else {
          // aw ac string "  ==  aw Tw ac Tc T* (string Tj), minus the string
          if (operands.length < 3) return false;
          const aw = src.subarray(operands[operands.length - 3].start, operands[operands.length - 3].end);
          const ac = src.subarray(operands[operands.length - 2].start, operands[operands.length - 2].end);
          out.push(src.subarray(copiedUpTo, opStart), aw, ascii(' Tw '), ac, ascii(' Tc T*'));
          copiedUpTo = opEnd;
        }
        break;
      }
      case 'BI': {
        // inline image: skip the binary payload between ID and EI
        const idPos = indexOfWord(src, 'ID', i);
        if (idPos < 0) return false;
        let j = idPos + 3;
        while (j < n - 1) {
          if (src[j] === 0x45 && src[j + 1] === 0x49 && isWhite(src[j - 1]) && (j + 2 >= n || isWhite(src[j + 2]))) break;
          j++;
        }
        if (j >= n - 1) return false;
        i = j + 2;
        break;
      }
      default:
        break;
    }
    operands.length = 0;
  }

  if (hitBands.size !== bands.length) return false;

  out.push(src.subarray(copiedUpTo));
  // Wrap in q/Q so any graphics state the original content leaves behind
  // (an unbalanced cm, a clip) can't leak into the replacement text drawn
  // after it.
  const rewritten = concatBytes([ascii('q\n'), ...out, ascii('\nQ\n')]);
  const ref = doc.context.register(doc.context.flateStream(rewritten));
  // kept as an array: pdf-lib's addContentStream() pushes onto it
  page.node.set(PDFName.of('Contents'), doc.context.obj([ref]));
  // pdf-lib caches the stream that drawText() etc. append to; if this page
  // was drawn on before, that cached stream was just folded into the
  // rewrite above and is no longer in /Contents — drop it so the next draw
  // starts a fresh one instead of silently writing into an orphan.
  const cache = page as unknown as { contentStream?: unknown; contentStreamRef?: unknown };
  cache.contentStream = undefined;
  cache.contentStreamRef = undefined;
  return true;
}

function indexOfWord(src: Uint8Array, word: string, from: number): number {
  const a = word.charCodeAt(0);
  const b = word.charCodeAt(1);
  for (let j = from; j < src.length - 1; j++) {
    if (
      src[j] === a &&
      src[j + 1] === b &&
      (j === 0 || isWhite(src[j - 1]) || isDelim(src[j - 1])) &&
      (j + 2 >= src.length || isWhite(src[j + 2]))
    ) {
      return j;
    }
  }
  return -1;
}
