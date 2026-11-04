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

// Real PDF compression: shrinks what actually makes PDFs big — photos stored
// at far more detail than they're shown at — while leaving text, vector art,
// links and fonts exactly as they are (still sharp and selectable).
//
// The old approach rasterized every page that was "mostly image" into one
// big JPEG. On text-heavy files no page qualified, so every level produced
// the identical file; on image pages the Easy preset's large high-quality
// JPEG often came out bigger than the original photo.
//
// Here each embedded photo is resampled to the level's target resolution
// for the size it's actually drawn at on the page, re-encoded as JPEG at
// the level's quality, and only swapped in when the result is genuinely
// smaller. Uncompressed streams get deflated and unreachable objects
// dropped, too.

export type CompressLevel = 'easy' | 'medium' | 'hard';

export const COMPRESS_PRESETS: Record<CompressLevel, { dpi: number; quality: number; maxPx: number }> = {
  easy: { dpi: 200, quality: 0.82, maxPx: 3000 },
  medium: { dpi: 144, quality: 0.68, maxPx: 2000 },
  hard: { dpi: 96, quality: 0.5, maxPx: 1300 },
};

export interface CompressStats {
  images: number; // photos considered
  recompressed: number; // photos actually replaced with a smaller version
  objectsRemoved: number; // unreachable objects dropped
}

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
// same row-vector convention as the PDF spec: [a b c d e f], cm does CTM = M x CTM
const mul = (m1: Matrix, m2: Matrix): Matrix => [
  m1[0] * m2[0] + m1[1] * m2[2],
  m1[0] * m2[1] + m1[1] * m2[3],
  m1[2] * m2[0] + m1[3] * m2[2],
  m1[2] * m2[1] + m1[3] * m2[3],
  m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
  m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
];

const isWhite = (c: number) => c === 0 || c === 9 || c === 10 || c === 12 || c === 13 || c === 32;
const isDelim = (c: number) =>
  c === 0x28 || c === 0x29 || c === 0x3c || c === 0x3e || c === 0x5b || c === 0x5d ||
  c === 0x7b || c === 0x7d || c === 0x2f || c === 0x25;

function streamBytes(obj: PDFObject | undefined): Uint8Array | null {
  if (!(obj instanceof PDFRawStream)) return null;
  try {
    return decodePDFRawStream(obj).decode();
  } catch {
    return null; // a filter pdf-lib can't decode
  }
}

const lookupDict = (doc: PDFDocument, o: PDFObject | undefined): PDFDict | undefined => {
  const v = o instanceof PDFRef ? doc.context.lookup(o) : o;
  return v instanceof PDFDict ? v : undefined;
};

// Largest size (in points) each image XObject is drawn at anywhere in the
// document, found by following q/Q/cm/Do through page and form content.
function measureImagePlacements(doc: PDFDocument): Map<PDFRef, { w: number; h: number }> {
  const sizes = new Map<PDFRef, { w: number; h: number }>();
  const visitedForms = new Set<PDFRef>();

  const scan = (bytes: Uint8Array, resources: PDFDict | undefined, start: Matrix, depth: number) => {
    const xobjects = resources ? lookupDict(doc, resources.get(PDFName.of('XObject'))) : undefined;
    let ctm = start;
    const stack: Matrix[] = [];
    const nums: number[] = [];
    let lastName = '';
    let i = 0;
    const n = bytes.length;
    while (i < n) {
      const c = bytes[i];
      if (isWhite(c)) {
        i++;
        continue;
      }
      if (c === 0x25) {
        while (i < n && bytes[i] !== 10 && bytes[i] !== 13) i++;
        continue;
      }
      if (c === 0x28) {
        let depthP = 0;
        while (i < n) {
          if (bytes[i] === 0x5c) {
            i += 2;
            continue;
          }
          if (bytes[i] === 0x28) depthP++;
          else if (bytes[i] === 0x29 && --depthP === 0) {
            i++;
            break;
          }
          i++;
        }
        nums.length = 0;
        continue;
      }
      if (c === 0x3c && bytes[i + 1] !== 0x3c) {
        while (i < n && bytes[i] !== 0x3e) i++;
        i++;
        nums.length = 0;
        continue;
      }
      if (c === 0x2f) {
        const s = ++i;
        while (i < n && !isWhite(bytes[i]) && !isDelim(bytes[i])) i++;
        lastName = String.fromCharCode(...bytes.subarray(s, i));
        continue;
      }
      if (isDelim(c)) {
        i++;
        continue;
      }
      const s = i;
      while (i < n && !isWhite(bytes[i]) && !isDelim(bytes[i])) i++;
      const word = String.fromCharCode(...bytes.subarray(s, i));
      const num = Number(word);
      if (word !== '' && !Number.isNaN(num)) {
        nums.push(num);
        if (nums.length > 6) nums.shift();
        continue;
      }
      if (word === 'q') stack.push(ctm);
      else if (word === 'Q') ctm = stack.pop() ?? ctm;
      else if (word === 'cm' && nums.length === 6) ctm = mul(nums.slice() as Matrix, ctm);
      else if (word === 'BI') {
        // inline image: skip its binary data up to a standalone EI
        while (i < n) {
          if (
            bytes[i] === 0x45 && bytes[i + 1] === 0x49 &&
            isWhite(bytes[i - 1]) && (i + 2 >= n || isWhite(bytes[i + 2]))
          ) {
            i += 2;
            break;
          }
          i++;
        }
      } else if (word === 'Do' && xobjects) {
        const ref = xobjects.get(PDFName.of(lastName));
        const xo = ref instanceof PDFRef ? doc.context.lookup(ref) : undefined;
        if (ref instanceof PDFRef && xo instanceof PDFRawStream) {
          const subtype = xo.dict.get(PDFName.of('Subtype'));
          if (subtype === PDFName.of('Image')) {
            const w = Math.hypot(ctm[0], ctm[1]);
            const h = Math.hypot(ctm[2], ctm[3]);
            const prev = sizes.get(ref);
            sizes.set(ref, { w: Math.max(w, prev?.w ?? 0), h: Math.max(h, prev?.h ?? 0) });
          } else if (subtype === PDFName.of('Form') && depth < 6 && !visitedForms.has(ref)) {
            visitedForms.add(ref); // a form shown several times at different sizes is measured once
            const m = xo.dict.get(PDFName.of('Matrix'));
            const matrix =
              m instanceof PDFArray && m.size() === 6
                ? (m.asArray().map((v) => (v instanceof PDFNumber ? v.asNumber() : 0)) as Matrix)
                : IDENTITY;
            const inner = streamBytes(xo);
            const formRes = lookupDict(doc, xo.dict.get(PDFName.of('Resources'))) ?? resources;
            if (inner) scan(inner, formRes, mul(matrix, ctm), depth + 1);
          }
        }
      }
      nums.length = 0;
    }
  };

  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    const parts = streams.map((s) => streamBytes(s instanceof PDFRef ? doc.context.lookup(s) : s));
    if (parts.some((p) => !p)) continue;
    const total = parts.reduce((k, p) => k + p!.length + 1, 0);
    const all = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
      all.set(p!, off);
      all[off + p!.length] = 10;
      off += p!.length + 1;
    }
    try {
      scan(all, page.node.Resources(), IDENTITY, 0);
    } catch {
      // unmeasurable page: its images just fall back to the level's pixel cap
    }
  }
  return sizes;
}

// Undoes PNG row predictors (DecodeParms /Predictor 10-15), which pdf-lib's
// Flate decoder leaves in place.
function unpredictPng(data: Uint8Array, colors: number, width: number, height: number): Uint8Array | null {
  const bpp = colors;
  const rowLen = width * colors;
  if (data.length < (rowLen + 1) * height) return null;
  const out = new Uint8Array(rowLen * height);
  for (let y = 0; y < height; y++) {
    const type = data[y * (rowLen + 1)];
    const src = y * (rowLen + 1) + 1;
    const dst = y * rowLen;
    for (let x = 0; x < rowLen; x++) {
      const raw = data[src + x];
      const a = x >= bpp ? out[dst + x - bpp] : 0;
      const b = y > 0 ? out[dst - rowLen + x] : 0;
      const cc = x >= bpp && y > 0 ? out[dst - rowLen + x - bpp] : 0;
      let v: number;
      if (type === 0) v = raw;
      else if (type === 1) v = raw + a;
      else if (type === 2) v = raw + b;
      else if (type === 3) v = raw + ((a + b) >> 1);
      else if (type === 4) {
        const p = a + b - cc;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - cc);
        v = raw + (pa <= pb && pa <= pc ? a : pb <= pc ? b : cc);
      } else return null;
      out[dst + x] = v & 0xff;
    }
  }
  return out;
}

const num = (o: PDFObject | undefined) => (o instanceof PDFNumber ? o.asNumber() : undefined);

// Components of an image's colour space we can safely re-encode as JPEG:
// 1 (gray) or 3 (RGB), including ICC-based equivalents. CMYK, Indexed,
// Separation etc. are left alone.
function colorComponents(doc: PDFDocument, cs: PDFObject | undefined): number | null {
  const v = cs instanceof PDFRef ? doc.context.lookup(cs) : cs;
  if (v === PDFName.of('DeviceRGB') || v === PDFName.of('CalRGB')) return 3;
  if (v === PDFName.of('DeviceGray') || v === PDFName.of('CalGray')) return 1;
  if (v instanceof PDFArray && v.get(0) === PDFName.of('ICCBased')) {
    const icc = doc.context.lookup(v.get(1));
    const n = icc instanceof PDFRawStream ? num(icc.dict.get(PDFName.of('N'))) : undefined;
    return n === 3 || n === 1 ? n : null;
  }
  return null;
}

const filterNames = (f: PDFObject | undefined): string[] =>
  f instanceof PDFName ? [f.toString()] : f instanceof PDFArray ? f.asArray().map((x) => String(x)) : [];

async function encodeJpeg(
  source: CanvasImageSource,
  width: number,
  height: number,
  quality: number
): Promise<Uint8Array | null> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

async function decodeImage(
  stream: PDFRawStream,
  kind: 'jpeg' | 'flate',
  w: number,
  h: number,
  comps: number
): Promise<CanvasImageSource | null> {
  if (kind === 'jpeg') {
    return createImageBitmap(new Blob([stream.contents as BlobPart], { type: 'image/jpeg' }));
  }
  let raw = decodePDFRawStream(stream).decode();
  const parms = stream.dict.get(PDFName.of('DecodeParms'));
  const predictor = parms instanceof PDFDict ? num(parms.get(PDFName.of('Predictor'))) ?? 1 : 1;
  if (predictor >= 10) {
    const un = unpredictPng(raw, comps, w, h);
    if (!un) return null;
    raw = un;
  } else if (predictor !== 1) {
    return null; // TIFF predictor: rare, not worth it
  }
  if (raw.length < w * h * comps) return null;
  const rgba = new ImageData(w, h);
  const px = rgba.data;
  for (let p = 0, q = 0; p < w * h; p++, q += comps) {
    px[p * 4] = raw[q];
    px[p * 4 + 1] = comps === 3 ? raw[q + 1] : raw[q];
    px[p * 4 + 2] = comps === 3 ? raw[q + 2] : raw[q];
    px[p * 4 + 3] = 255;
  }
  return createImageBitmap(rgba);
}

// Objects not reachable from the document catalog (left behind by earlier
// edits or incremental saves) still get written out by pdf-lib otherwise.
function pruneUnreachable(doc: PDFDocument): number {
  const ctx = doc.context;
  const reachable = new Set<string>();
  const queue: PDFObject[] = [ctx.trailerInfo.Root, ctx.trailerInfo.Info].filter(Boolean) as PDFObject[];
  while (queue.length) {
    const o = queue.pop()!;
    if (o instanceof PDFRef) {
      const key = o.toString();
      if (reachable.has(key)) continue;
      reachable.add(key);
      const target = ctx.lookup(o);
      if (target) queue.push(target);
    } else if (o instanceof PDFDict) {
      for (const [, v] of o.entries()) queue.push(v);
    } else if (o instanceof PDFArray) {
      for (const v of o.asArray()) queue.push(v);
    } else if (o instanceof PDFRawStream || (o as { dict?: unknown }).dict instanceof PDFDict) {
      queue.push((o as unknown as { dict: PDFDict }).dict);
    }
  }
  let removed = 0;
  for (const [ref] of ctx.enumerateIndirectObjects()) {
    if (!reachable.has(ref.toString())) {
      ctx.delete(ref);
      removed++;
    }
  }
  return removed;
}

export async function compressPdfInPlace(
  doc: PDFDocument,
  level: CompressLevel,
  onProgress?: (done: number, total: number) => void
): Promise<CompressStats> {
  const preset = COMPRESS_PRESETS[level];
  const ctx = doc.context;
  const stats: CompressStats = { images: 0, recompressed: 0, objectsRemoved: 0 };
  // an encrypted file's objects are only reachable through keys we don't follow
  if (!ctx.trailerInfo.Encrypt) stats.objectsRemoved = pruneUnreachable(doc);
  const placements = measureImagePlacements(doc);

  // masks hold transparency, not pictures — JPEG artifacts there show as fringes
  const maskRefs = new Set<string>();
  const imageRefs: PDFRef[] = [];
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || obj.dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
    imageRefs.push(ref);
    for (const key of ['SMask', 'Mask']) {
      const m = obj.dict.get(PDFName.of(key));
      if (m instanceof PDFRef) maskRefs.add(m.toString());
    }
  }

  let done = 0;
  for (const ref of imageRefs) {
    onProgress?.(done++, imageRefs.length);
    if (maskRefs.has(ref.toString())) continue;
    const stream = ctx.lookup(ref);
    if (!(stream instanceof PDFRawStream)) continue;
    const d = stream.dict;
    const w = num(d.get(PDFName.of('Width')));
    const h = num(d.get(PDFName.of('Height')));
    if (!w || !h) continue;
    if (d.get(PDFName.of('ImageMask')) !== undefined && String(d.get(PDFName.of('ImageMask'))) === 'true') continue;
    if (num(d.get(PDFName.of('BitsPerComponent'))) !== 8 || d.get(PDFName.of('Decode'))) continue;
    const filters = filterNames(d.get(PDFName.of('Filter')));
    const kind =
      filters.length === 1 && filters[0] === '/DCTDecode'
        ? 'jpeg'
        : filters.length === 1 && filters[0] === '/FlateDecode'
        ? 'flate'
        : null;
    const comps = colorComponents(doc, d.get(PDFName.of('ColorSpace')));
    if (!kind || !comps) continue;
    const oldLen = stream.contents.length;
    if (oldLen < 16 * 1024) continue; // icons and logos: nothing to gain
    stats.images++;

    // target pixel size: the level's resolution at the size it's shown at
    const shown = placements.get(ref);
    let scale = Math.min(1, preset.maxPx / Math.max(w, h));
    if (shown && shown.w > 0 && shown.h > 0) {
      scale = Math.min(scale, Math.max((shown.w / 72) * preset.dpi / w, (shown.h / 72) * preset.dpi / h));
    }
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));

    try {
      const source = await decodeImage(stream, kind, w, h, comps);
      if (!source) continue;
      const jpg = await encodeJpeg(source, tw, th, preset.quality);
      if ('close' in source && typeof source.close === 'function') source.close();
      if (!jpg || jpg.length > oldLen * 0.9) continue; // not worth it — keep the original

      const nd = PDFDict.withContext(ctx);
      for (const [k, v] of d.entries()) {
        const key = k.toString();
        if (['/Filter', '/DecodeParms', '/Length', '/Width', '/Height', '/ColorSpace', '/BitsPerComponent'].includes(key)) continue;
        nd.set(k, v);
      }
      nd.set(PDFName.of('Width'), PDFNumber.of(tw));
      nd.set(PDFName.of('Height'), PDFNumber.of(th));
      nd.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
      // canvas output is always 3-channel sRGB; an RGB ICC profile still applies
      nd.set(PDFName.of('ColorSpace'), comps === 3 ? d.get(PDFName.of('ColorSpace'))! : PDFName.of('DeviceRGB'));
      nd.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
      ctx.assign(ref, PDFRawStream.of(nd, jpg));
      stats.recompressed++;
    } catch (e) {
      console.warn('Skipping an image that could not be recompressed:', e);
    }
  }
  onProgress?.(imageRefs.length, imageRefs.length);

  // deflate anything stored uncompressed (content, fonts, raw images...)
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || obj.dict.get(PDFName.of('Filter')) || obj.contents.length < 512) continue;
    const type = obj.dict.get(PDFName.of('Type'));
    if (type === PDFName.of('XRef') || type === PDFName.of('ObjStm') || type === PDFName.of('Metadata')) continue;
    const flated = ctx.flateStream(obj.contents);
    if (flated.contents.length >= obj.contents.length * 0.95) continue;
    for (const [k, v] of obj.dict.entries()) {
      if (k.toString() !== '/Length') flated.dict.set(k, v);
    }
    ctx.assign(ref, flated);
  }
  return stats;
}
