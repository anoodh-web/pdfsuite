import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  decodePDFRawStream,
  type PDFDocument,
  type PDFObject,
} from '@cantoo/pdf-lib';

// Strips the glyphs a PDF never draws out of its embedded TrueType fonts.
//
// Word's "Save as PDF" and "Microsoft Print to PDF" often embed whole font
// files rather than the characters used — a one-page letter can carry 4MB of
// Segoe UI Emoji for a single bullet. Photo compression can't touch that,
// which is why such files came out the same size at every level.
//
// Only the common, unambiguous setup is handled: Type0 fonts with
// Identity-H encoding and an identity CID-to-glyph map, where the 2-byte
// codes in the page's text ARE the glyph numbers. Unused glyphs are emptied
// but keep their numbers, so no text needs rewriting. The caller renders
// every page before and after and calls restore() if anything differs.

const isWhite = (c: number) => c === 0 || c === 9 || c === 10 || c === 12 || c === 13 || c === 32;
const isDelim = (c: number) =>
  c === 0x28 || c === 0x29 || c === 0x3c || c === 0x3e || c === 0x5b || c === 0x5d ||
  c === 0x7b || c === 0x7d || c === 0x2f || c === 0x25;

function streamBytes(obj: PDFObject | undefined): Uint8Array | null {
  if (!(obj instanceof PDFRawStream)) return null;
  try {
    return decodePDFRawStream(obj).decode();
  } catch {
    return null;
  }
}

// Decodes a literal string's bytes (backslash escapes, octal, line continuations).
function literalBytes(src: Uint8Array, start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i < end; i++) {
    const c = src[i];
    if (c !== 0x5c) {
      out.push(c);
      continue;
    }
    const e = src[++i];
    const simple: Record<number, number> = { 0x6e: 10, 0x72: 13, 0x74: 9, 0x62: 8, 0x66: 12 };
    if (e in simple) out.push(simple[e]);
    else if (e >= 0x30 && e <= 0x37) {
      let v = e - 0x30;
      for (let k = 0; k < 2 && src[i + 1] >= 0x30 && src[i + 1] <= 0x37; k++) v = v * 8 + (src[++i] - 0x30);
      out.push(v & 0xff);
    } else if (e === 13) {
      if (src[i + 1] === 10) i++;
    } else if (e !== 10) out.push(e);
  }
  return out;
}

function hexBytes(src: Uint8Array, start: number, end: number): number[] {
  const digits = String.fromCharCode(...src.subarray(start, end)).replace(/[^0-9a-fA-F]/g, '');
  const padded = digits.length % 2 ? digits + '0' : digits;
  const out: number[] = [];
  for (let i = 0; i < padded.length; i += 2) out.push(parseInt(padded.slice(i, i + 2), 16));
  return out;
}

interface StripTarget {
  fileRef: PDFRef;
  used: Set<number>;
}

// Walks every content stream (pages, forms, patterns, annotation
// appearances) and records which 2-byte codes are shown with each eligible
// font. Fonts referenced anywhere we can't account for are marked unsafe.
function collectUsedGlyphs(doc: PDFDocument): Map<string, StripTarget> {
  const ctx = doc.context;
  const L = (o: PDFObject | undefined) => (o instanceof PDFRef ? ctx.lookup(o) : o);

  // font dict ref -> its FontFile2 target (only for the Identity-H case)
  const byFont = new Map<string, StripTarget>();
  const targets = new Map<string, StripTarget>();
  const unsafe = new Set<string>();
  for (const [ref, o] of ctx.enumerateIndirectObjects()) {
    if (!(o instanceof PDFDict) || o.get(PDFName.of('Type')) !== PDFName.of('Font')) continue;
    const sub = o.get(PDFName.of('Subtype'));
    const fileOf = (fdRef: PDFObject | undefined) => {
      const fd = L(fdRef);
      return fd instanceof PDFDict ? fd.get(PDFName.of('FontFile2')) : undefined;
    };
    if (sub === PDFName.of('Type0')) {
      const descArr = L(o.get(PDFName.of('DescendantFonts')));
      const desc = descArr instanceof PDFArray ? L(descArr.get(0)) : undefined;
      if (!(desc instanceof PDFDict)) continue;
      const file = fileOf(desc.get(PDFName.of('FontDescriptor')));
      if (!(file instanceof PDFRef)) continue;
      const c2g = desc.get(PDFName.of('CIDToGIDMap'));
      const ok =
        o.get(PDFName.of('Encoding')) === PDFName.of('Identity-H') &&
        desc.get(PDFName.of('Subtype')) === PDFName.of('CIDFontType2') &&
        (c2g === undefined || c2g === PDFName.of('Identity'));
      if (!ok) {
        unsafe.add(file.toString());
        continue;
      }
      const t = targets.get(file.toString()) ?? { fileRef: file, used: new Set<number>() };
      targets.set(file.toString(), t);
      byFont.set(ref.toString(), t);
    } else {
      // the same font file used by a simple font: glyph use isn't tracked
      const file = fileOf(o.get(PDFName.of('FontDescriptor')));
      if (file instanceof PDFRef) unsafe.add(file.toString());
    }
  }
  if (targets.size === 0) return targets;

  // fonts a form field could type new text with must keep every glyph
  const acro = L(doc.catalog.get(PDFName.of('AcroForm')));
  if (acro instanceof PDFDict) {
    const dr = L(acro.get(PDFName.of('DR')));
    const fonts = dr instanceof PDFDict ? L(dr.get(PDFName.of('Font'))) : undefined;
    if (fonts instanceof PDFDict) {
      for (const [, v] of fonts.entries()) {
        const t = v instanceof PDFRef ? byFont.get(v.toString()) : undefined;
        if (t) unsafe.add(t.fileRef.toString());
      }
    }
  }

  const seenStreams = new Set<string>();
  const scanStream = (stream: PDFObject | undefined, inherited: PDFDict | undefined, key?: string) => {
    if (key) {
      if (seenStreams.has(key)) return;
      seenStreams.add(key);
    }
    const s = stream instanceof PDFRawStream ? stream : undefined;
    const own = s ? L(s.dict.get(PDFName.of('Resources'))) : undefined;
    const bytes = streamBytes(s);
    if (bytes) scanContent(bytes, own instanceof PDFDict ? own : inherited);
  };

  const scanResources = (res: PDFDict | undefined) => {
    if (!res) return;
    for (const kind of ['XObject', 'Pattern']) {
      const dict = L(res.get(PDFName.of(kind)));
      if (!(dict instanceof PDFDict)) continue;
      for (const [, v] of dict.entries()) {
        const o = L(v);
        if (o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) {
          scanStream(o, res, v instanceof PDFRef ? v.toString() : undefined);
        }
      }
    }
  };

  const scanContent = (src: Uint8Array, res: PDFDict | undefined) => {
    const fonts = res ? L(res.get(PDFName.of('Font'))) : undefined;
    let current: StripTarget | undefined;
    const fontStack: (StripTarget | undefined)[] = []; // the font is part of the q/Q graphics state
    let pendingName = '';
    const strings: number[][] = [];
    let i = 0;
    const n = src.length;
    const record = () => {
      if (!current) return;
      for (const b of strings) for (let k = 0; k + 1 < b.length; k += 2) current.used.add((b[k] << 8) | b[k + 1]);
    };
    while (i < n) {
      const c = src[i];
      if (isWhite(c)) {
        i++;
        continue;
      }
      if (c === 0x25) {
        while (i < n && src[i] !== 10 && src[i] !== 13) i++;
        continue;
      }
      if (c === 0x28) {
        let depth = 0;
        const s = i + 1;
        while (i < n) {
          if (src[i] === 0x5c) {
            i += 2;
            continue;
          }
          if (src[i] === 0x28) depth++;
          else if (src[i] === 0x29 && --depth === 0) break;
          i++;
        }
        strings.push(literalBytes(src, s, i));
        i++;
        continue;
      }
      if (c === 0x3c && src[i + 1] !== 0x3c) {
        const s = i + 1;
        while (i < n && src[i] !== 0x3e) i++;
        strings.push(hexBytes(src, s, i));
        i++;
        continue;
      }
      if (c === 0x2f) {
        const s = ++i;
        while (i < n && !isWhite(src[i]) && !isDelim(src[i])) i++;
        pendingName = String.fromCharCode(...src.subarray(s, i));
        continue;
      }
      if (isDelim(c)) {
        i++;
        continue;
      }
      const s = i;
      while (i < n && !isWhite(src[i]) && !isDelim(src[i])) i++;
      const word = String.fromCharCode(...src.subarray(s, i));
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) continue;
      if (word === 'q') fontStack.push(current);
      else if (word === 'Q') current = fontStack.length ? fontStack.pop() : current;
      else if (word === 'Tf') {
        const ref = fonts instanceof PDFDict ? fonts.get(PDFName.of(pendingName)) : undefined;
        current = ref instanceof PDFRef ? byFont.get(ref.toString()) : undefined;
      } else if (word === 'Tj' || word === 'TJ' || word === "'" || word === '"') {
        record();
      } else if (word === 'BI') {
        while (i < n) {
          if (src[i] === 0x45 && src[i + 1] === 0x49 && isWhite(src[i - 1]) && (i + 2 >= n || isWhite(src[i + 2]))) {
            i += 2;
            break;
          }
          i++;
        }
      }
      strings.length = 0;
    }
    scanResources(res);
  };

  for (const page of doc.getPages()) {
    const res = page.node.Resources();
    const contents = page.node.Contents();
    const parts = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    const chunks = parts.map((p) => streamBytes(L(p))).filter((b): b is Uint8Array => !!b);
    const all = new Uint8Array(chunks.reduce((k, b) => k + b.length + 1, 0));
    let off = 0;
    for (const b of chunks) {
      all.set(b, off);
      all[off + b.length] = 10;
      off += b.length + 1;
    }
    scanContent(all, res);

    const annots = L(page.node.get(PDFName.of('Annots')));
    if (annots instanceof PDFArray) {
      for (const a of annots.asArray()) {
        const annot = L(a);
        const ap = annot instanceof PDFDict ? L(annot.get(PDFName.of('AP'))) : undefined;
        if (!(ap instanceof PDFDict)) continue;
        for (const [, v] of ap.entries()) {
          const o = L(v);
          if (o instanceof PDFRawStream) scanStream(o, res, v instanceof PDFRef ? v.toString() : undefined);
          else if (o instanceof PDFDict) {
            for (const [, w] of o.entries()) scanStream(L(w), res, w instanceof PDFRef ? w.toString() : undefined);
          }
        }
      }
    }
  }

  for (const key of unsafe) targets.delete(key);
  return targets;
}

// ---------- TrueType rewriting ----------
const DROP_TABLES = new Set([
  'DSIG', 'GSUB', 'GPOS', 'GDEF', 'BASE', 'JSTF', 'MATH', 'COLR', 'CPAL', 'EBDT', 'EBLC', 'EBSC',
  'CBDT', 'CBLC', 'sbix', 'SVG ', 'hdmx', 'LTSH', 'VDMX', 'kern', 'morx', 'feat', 'meta', 'STAT',
  'MVAR', 'fvar', 'gvar', 'avar', 'HVAR', 'VVAR', 'cvar', 'PCLT', 'vhea', 'vmtx',
]);

const tableChecksum = (b: Uint8Array) => {
  let sum = 0;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let i = 0; i < b.length; i += 4) {
    const word = i + 4 <= b.length ? v.getUint32(i) : ((b[i] << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0)) >>> 0;
    sum = (sum + word) >>> 0;
  }
  return sum;
};

// Returns a copy of the font keeping only the outlines of `used` glyphs (plus
// .notdef and any composite parts), or null if it isn't a plain TrueType.
export function stripTrueType(font: Uint8Array, used: Set<number>): Uint8Array | null {
  const v = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const version = v.getUint32(0);
  if (version !== 0x00010000 && version !== 0x74727565) return null;
  const numTables = v.getUint16(4);
  const tables = new Map<string, Uint8Array>();
  for (let t = 0; t < numTables; t++) {
    const rec = 12 + t * 16;
    const tag = String.fromCharCode(font[rec], font[rec + 1], font[rec + 2], font[rec + 3]);
    const off = v.getUint32(rec + 8);
    const len = v.getUint32(rec + 12);
    if (off + len > font.length) return null;
    tables.set(tag, font.subarray(off, off + len));
  }
  const head = tables.get('head');
  const maxp = tables.get('maxp');
  const loca = tables.get('loca');
  const glyf = tables.get('glyf');
  if (!head || !maxp || !loca || !glyf) return null;
  const numGlyphs = new DataView(maxp.buffer, maxp.byteOffset).getUint16(4);
  const longLoca = new DataView(head.buffer, head.byteOffset).getInt16(50) === 1;
  const lv = new DataView(loca.buffer, loca.byteOffset, loca.byteLength);
  const offsetOf = (g: number) => (longLoca ? lv.getUint32(g * 4) : lv.getUint16(g * 2) * 2);
  if (loca.length < (numGlyphs + 1) * (longLoca ? 4 : 2)) return null;
  const glyphData = (g: number) => glyf.subarray(offsetOf(g), offsetOf(g + 1));

  // keep .notdef, every used glyph and the parts composites are built from
  const keep = new Set<number>([0]);
  const queue = [...used].filter((g) => g < numGlyphs);
  while (queue.length) {
    const g = queue.pop()!;
    if (keep.has(g) && g !== 0) continue;
    keep.add(g);
    const d = glyphData(g);
    if (d.length < 10) continue;
    const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
    if (dv.getInt16(0) >= 0) continue; // simple glyph
    let p = 10;
    for (;;) {
      if (p + 4 > d.length) return null;
      const flags = dv.getUint16(p);
      const comp = dv.getUint16(p + 2);
      if (comp < numGlyphs && !keep.has(comp)) queue.push(comp);
      p += 4 + (flags & 0x0001 ? 4 : 2);
      if (flags & 0x0008) p += 2;
      else if (flags & 0x0040) p += 4;
      else if (flags & 0x0080) p += 8;
      if (!(flags & 0x0020)) break;
    }
  }

  // rebuild glyf + a long-format loca with the same glyph numbering
  const parts: Uint8Array[] = [];
  const newLoca = new Uint8Array((numGlyphs + 1) * 4);
  const nlv = new DataView(newLoca.buffer);
  let pos = 0;
  for (let g = 0; g < numGlyphs; g++) {
    nlv.setUint32(g * 4, pos);
    if (!keep.has(g)) continue;
    const d = glyphData(g);
    const padded = (d.length + 3) & ~3;
    const copy = new Uint8Array(padded);
    copy.set(d);
    parts.push(copy);
    pos += padded;
  }
  nlv.setUint32(numGlyphs * 4, pos);
  const newGlyf = new Uint8Array(pos);
  let o = 0;
  for (const p of parts) {
    newGlyf.set(p, o);
    o += p.length;
  }
  const newHead = head.slice();
  const hv = new DataView(newHead.buffer);
  hv.setInt16(50, 1); // indexToLocFormat: long
  hv.setUint32(8, 0); // checkSumAdjustment, set below

  const out = new Map<string, Uint8Array>();
  for (const [tag, data] of tables) {
    if (DROP_TABLES.has(tag)) continue;
    out.set(tag, tag === 'glyf' ? newGlyf : tag === 'loca' ? newLoca : tag === 'head' ? newHead : data);
  }
  const tags = [...out.keys()].sort();
  const n = tags.length;
  let total = 12 + n * 16;
  for (const t of tags) total += (out.get(t)!.length + 3) & ~3;
  const file = new Uint8Array(total);
  const fv = new DataView(file.buffer);
  let es = 0;
  while (1 << (es + 1) <= n) es++;
  fv.setUint32(0, 0x00010000);
  fv.setUint16(4, n);
  fv.setUint16(6, (1 << es) * 16);
  fv.setUint16(8, es);
  fv.setUint16(10, n * 16 - (1 << es) * 16);
  let offset = 12 + n * 16;
  let headOffset = 0;
  tags.forEach((t, k) => {
    const data = out.get(t)!;
    const rec = 12 + k * 16;
    for (let c = 0; c < 4; c++) file[rec + c] = t.charCodeAt(c);
    fv.setUint32(rec + 4, tableChecksum(data));
    fv.setUint32(rec + 8, offset);
    fv.setUint32(rec + 12, data.length);
    file.set(data, offset);
    if (t === 'head') headOffset = offset;
    offset += (data.length + 3) & ~3;
  });
  fv.setUint32(headOffset + 8, (0xb1b0afba - tableChecksum(file)) >>> 0);
  return file;
}

// Strips every eligible embedded font in place. Returns how many bytes it
// saved and a restore() that puts all the original font files back.
export function stripUnusedGlyphs(doc: PDFDocument): { saved: number; fonts: number; restore: () => void } {
  const ctx = doc.context;
  const originals: [PDFRef, PDFObject][] = [];
  let saved = 0;
  for (const t of collectUsedGlyphs(doc).values()) {
    const stream = ctx.lookup(t.fileRef);
    if (!(stream instanceof PDFRawStream) || t.used.size === 0) continue;
    const bytes = streamBytes(stream);
    if (!bytes || bytes.length < 20 * 1024) continue; // already small: likely subset by its creator
    let stripped: Uint8Array | null = null;
    try {
      stripped = stripTrueType(bytes, t.used);
    } catch {
      stripped = null;
    }
    if (!stripped) continue;
    const next = ctx.flateStream(stripped);
    for (const [k, val] of stream.dict.entries()) {
      const key = k.toString();
      if (key !== '/Length' && key !== '/Filter' && key !== '/DecodeParms' && key !== '/Length1') next.dict.set(k, val);
    }
    next.dict.set(PDFName.of('Length1'), PDFNumber.of(stripped.length));
    if (next.contents.length >= stream.contents.length) continue;
    originals.push([t.fileRef, stream]);
    saved += stream.contents.length - next.contents.length;
    ctx.assign(t.fileRef, next);
  }
  return {
    saved,
    fonts: originals.length,
    restore: () => {
      for (const [ref, obj] of originals) ctx.assign(ref, obj);
    },
  };
}
