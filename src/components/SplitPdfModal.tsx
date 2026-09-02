import { useState } from 'react';
import { X, Scissors } from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';

export default function SplitPdfModal({
  docId,
  pageCount,
  onClose,
}: {
  docId: string;
  pageCount: number;
  onClose: () => void;
}) {
  const splitDocument = useDocumentStore((s) => s.splitDocument);
  const showToast = useDocumentStore((s) => s.showToast);

  const [mode, setMode] = useState<'every-page' | 'every-n' | 'ranges'>('every-page');
  const [n, setN] = useState(2);
  const [ranges, setRanges] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSplit = async () => {
    setRunning(true);
    setError(null);
    const result = await splitDocument(docId, mode, { n, ranges });
    setRunning(false);
    if (!result.ok) {
      setError(result.error);
      showToast(`Split failed: ${result.error}`, 'error');
      return;
    }
    showToast(
      result.fileCount === 1
        ? 'The file has been successfully split and saved.'
        : `The file has been split into ${result.fileCount} files and saved as a zip.`
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[420px] rounded-lg border border-ink-500 bg-ink-800 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-paper">
            <Scissors size={18} className="text-accent" />
            <h2 className="text-base font-semibold">Split PDF</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-paper">
            <X size={18} />
          </button>
        </div>

        <p className="mb-4 text-xs text-muted">
          This document has {pageCount} page{pageCount === 1 ? '' : 's'}.
        </p>

        <div className="mb-4 space-y-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-ink-500 p-2.5 text-sm text-paper hover:bg-ink-700">
            <input
              type="radio"
              checked={mode === 'every-page'}
              onChange={() => setMode('every-page')}
            />
            Split into individual pages ({pageCount} files)
          </label>

          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-ink-500 p-2.5 text-sm text-paper hover:bg-ink-700">
            <input type="radio" checked={mode === 'every-n'} onChange={() => setMode('every-n')} />
            Every
            <input
              type="number"
              min={1}
              max={pageCount}
              value={n}
              onChange={(e) => setN(Math.max(1, Number(e.target.value) || 1))}
              onClick={(e) => e.stopPropagation()}
              className="w-14 rounded border border-ink-500 bg-ink-900 px-1.5 py-0.5 text-center text-paper"
            />
            pages
          </label>

          <label className="flex cursor-pointer flex-col gap-1.5 rounded-md border border-ink-500 p-2.5 text-sm text-paper hover:bg-ink-700">
            <span className="flex items-center gap-2">
              <input type="radio" checked={mode === 'ranges'} onChange={() => setMode('ranges')} />
              Custom page ranges
            </span>
            <input
              type="text"
              value={ranges}
              onChange={(e) => setRanges(e.target.value)}
              onClick={() => setMode('ranges')}
              placeholder="e.g. 1-3, 5, 7-9"
              className="rounded border border-ink-500 bg-ink-900 px-2 py-1 text-paper placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>
        </div>

        {error && (
          <div className="mb-3 rounded-md border border-signal-danger/40 bg-signal-danger/10 px-3 py-2 text-xs text-signal-danger">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-ink-500 px-3 py-1.5 text-sm text-paper/80 hover:bg-ink-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSplit}
            disabled={running}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dim disabled:opacity-50"
          >
            {running ? 'Splitting…' : 'Split'}
          </button>
        </div>
      </div>
    </div>
  );
}
