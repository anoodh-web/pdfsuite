import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { X, Upload, Columns2, Layers as OverlayIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import type { OpenDocument } from '../store/useDocumentStore';

interface Props {
  docA: OpenDocument;
  onClose: () => void;
}

type Mode = 'side-by-side' | 'overlay';

export default function ComparePdfModal({ docA, onClose }: Props) {
  const [docB, setDocB] = useState<{ name: string; proxy: pdfjsLib.PDFDocumentProxy } | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<Mode>('overlay');
  const [diffStats, setDiffStats] = useState<{ percent: number } | null>(null);

  const canvasA = useRef<HTMLCanvasElement>(null);
  const canvasB = useRef<HTMLCanvasElement>(null);
  const canvasDiff = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxPage = Math.min(docA.pageCount, docB?.proxy.numPages ?? docA.pageCount);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const proxy = await pdfjsLib.getDocument({ data: bytes }).promise;
      setDocB({ name: file.name, proxy });
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that PDF.');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!docB) return;
    let cancelled = false;

    (async () => {
      const scale = 1.4;
      const [pageA, pageB] = await Promise.all([
        docA.proxy.getPage(page),
        docB.proxy.getPage(Math.min(page, docB.proxy.numPages)),
      ]);
      const vpA = pageA.getViewport({ scale });
      const vpB = pageB.getViewport({ scale });
      const w = Math.max(vpA.width, vpB.width);
      const h = Math.max(vpA.height, vpB.height);

      if (cancelled) return;

      const cA = canvasA.current!;
      const cB = canvasB.current!;
      cA.width = w;
      cA.height = h;
      cB.width = w;
      cB.height = h;
      const ctxA = cA.getContext('2d')!;
      const ctxB = cB.getContext('2d')!;
      ctxA.fillStyle = '#FFFFFF';
      ctxA.fillRect(0, 0, w, h);
      ctxB.fillStyle = '#FFFFFF';
      ctxB.fillRect(0, 0, w, h);
      await pageA.render({ canvasContext: ctxA, viewport: vpA, canvas: cA }).promise;
      await pageB.render({ canvasContext: ctxB, viewport: vpB, canvas: cB }).promise;

      if (cancelled) return;

      const dataA = ctxA.getImageData(0, 0, w, h);
      const dataB = ctxB.getImageData(0, 0, w, h);
      const cDiff = canvasDiff.current!;
      cDiff.width = w;
      cDiff.height = h;
      const ctxDiff = cDiff.getContext('2d')!;
      ctxDiff.drawImage(cA, 0, 0);
      const diffImg = ctxDiff.getImageData(0, 0, w, h);

      let diffPixels = 0;
      const totalPixels = w * h;
      for (let i = 0; i < dataA.data.length; i += 4) {
        const dr = Math.abs(dataA.data[i] - dataB.data[i]);
        const dg = Math.abs(dataA.data[i + 1] - dataB.data[i + 1]);
        const db = Math.abs(dataA.data[i + 2] - dataB.data[i + 2]);
        if (dr + dg + db > 40) {
          diffImg.data[i] = 227;
          diffImg.data[i + 1] = 60;
          diffImg.data[i + 2] = 60;
          diffImg.data[i + 3] = 255;
          diffPixels++;
        }
      }
      ctxDiff.putImageData(diffImg, 0, 0);
      setDiffStats({ percent: Math.round((diffPixels / totalPixels) * 1000) / 10 });
    })();

    return () => {
      cancelled = true;
    };
  }, [docA, docB, page]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
      <div className="flex h-full w-full max-w-6xl flex-col rounded-lg border border-ink-500 bg-ink-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-600 px-5 py-3">
          <div>
            <div className="text-sm font-medium text-paper">Compare PDF</div>
            <div className="text-xs text-muted">
              {docA.name} {docB ? `vs. ${docB.name}` : ''}
            </div>
          </div>
          <X size={18} className="cursor-pointer text-muted hover:text-paper" onClick={onClose} />
        </div>

        {!docB ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-dim disabled:opacity-50"
            >
              <Upload size={16} /> {loading ? 'Loading…' : 'Choose a PDF to compare against'}
            </button>
            <p className="text-xs text-muted">
              Comparing against: <span className="text-paper/80">{docA.name}</span>
            </p>
            {error && <p className="text-xs text-signal-danger">{error}</p>}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-ink-600 px-5 py-2">
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded p-1 text-muted hover:bg-ink-700 hover:text-paper disabled:opacity-30"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="font-mono text-xs text-muted">
                  Page {page} of {maxPage}
                </span>
                <button
                  disabled={page >= maxPage}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded p-1 text-muted hover:bg-ink-700 hover:text-paper disabled:opacity-30"
                >
                  <ChevronRight size={16} />
                </button>
                {diffStats && (
                  <span className="ml-3 text-xs text-muted">
                    {diffStats.percent === 0 ? (
                      <span className="text-signal-success">Pages are visually identical</span>
                    ) : (
                      <span>
                        <span className="text-signal-danger">{diffStats.percent}%</span> of this
                        page differs
                      </span>
                    )}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 rounded-md bg-ink-700 p-1">
                <button
                  onClick={() => setMode('side-by-side')}
                  className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs ${
                    mode === 'side-by-side' ? 'bg-accent text-white' : 'text-muted hover:text-paper'
                  }`}
                >
                  <Columns2 size={13} /> Side by Side
                </button>
                <button
                  onClick={() => setMode('overlay')}
                  className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs ${
                    mode === 'overlay' ? 'bg-accent text-white' : 'text-muted hover:text-paper'
                  }`}
                >
                  <OverlayIcon size={13} /> Highlight Differences
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-ink-900/60 p-6">
              <div className={mode === 'side-by-side' ? 'flex justify-center gap-6' : 'hidden'}>
                <div className="text-center">
                  <div className="mb-1 text-xs text-muted">{docA.name}</div>
                  <canvas ref={canvasA} className="border border-ink-600 shadow-lg" />
                </div>
                <div className="text-center">
                  <div className="mb-1 text-xs text-muted">{docB.name}</div>
                  <canvas ref={canvasB} className="border border-ink-600 shadow-lg" />
                </div>
              </div>
              <div className={mode === 'overlay' ? 'flex justify-center' : 'hidden'}>
                <div className="text-center">
                  <div className="mb-1 text-xs text-muted">
                    {docA.name} — differences highlighted in red
                  </div>
                  <canvas ref={canvasDiff} className="border border-ink-600 shadow-lg" />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
