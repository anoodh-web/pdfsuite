import type { PDFDocumentProxy } from 'pdfjs-dist';

// A snip is cut from the page re-drawn at print quality, not from the pixels
// on screen, so it stays sharp at any zoom level.
const SNIP_DPI = 220;
const MAX_SIDE_PX = 6000; // keeps a whole-page snip of a huge drawing sane

export interface SnipRect {
  x: number; // fractions of the page, like annotations
  y: number;
  w: number;
  h: number;
}

// The last snip taken, so pasting it back into a PDF keeps its real size
// instead of the generic default image size.
let lastSnip: { pxW: number; pxH: number; widthPt: number } | null = null;

export async function renderSnip(proxy: PDFDocumentProxy, pageNum: number, r: SnipRect): Promise<Blob> {
  const page = await proxy.getPage(pageNum);
  const base = page.getViewport({ scale: 1 });
  const widthPt = r.w * base.width;
  const heightPt = r.h * base.height;
  const scale = Math.min(SNIP_DPI / 72, MAX_SIDE_PX / Math.max(widthPt, heightPt));
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(r.w * viewport.width));
  canvas.height = Math.max(1, Math.round(r.h * viewport.height));
  // shift the page so only the snipped area lands on the canvas
  await page.render({
    canvas,
    viewport,
    transform: [1, 0, 0, 1, -Math.round(r.x * viewport.width), -Math.round(r.y * viewport.height)],
  }).promise;

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image'))), 'image/png')
  );
  lastSnip = { pxW: canvas.width, pxH: canvas.height, widthPt };
  return blob;
}

// Must be called straight from the click/mouse-up that asked for it: the
// clipboard only accepts writes during a user action, which is why the image
// is passed in as a promise rather than awaited first.
export async function copySnip(blob: Promise<Blob>): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Copying images is not supported here');
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

// Width (as a fraction of the page width) for an image pasted onto a page:
// a snip from this app comes back at the size it was cut at; anything else
// (e.g. a Win+Shift+S screenshot) is treated as a 96 dpi screen image.
export function pastedImageWidth(pxW: number, pxH: number, pageWidthPt: number): number {
  const widthPt =
    lastSnip && lastSnip.pxW === pxW && lastSnip.pxH === pxH ? lastSnip.widthPt : pxW * (72 / 96);
  return Math.min(0.9, widthPt / pageWidthPt);
}
