import { useState } from 'react';
import { X, Layers, Loader2, CheckCircle2, AlertTriangle, FileStack } from 'lucide-react';
import { PDFDocument, degrees, rgb } from '@cantoo/pdf-lib';
import JSZip from 'jszip';

type Operation = 'rotate' | 'watermark' | 'protect' | 'merge-all';

interface Props {
  onClose: () => void;
}

interface FileStatus {
  file: File;
  state: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
}

const OPERATIONS: { key: Operation; label: string; description: string }[] = [
  { key: 'rotate', label: 'Rotate all pages 90°', description: 'Rotates every page in every file.' },
  {
    key: 'watermark',
    label: 'Add text watermark',
    description: 'Stamps the same watermark text diagonally across every page.',
  },
  {
    key: 'protect',
    label: 'Password protect',
    description: 'Applies the same open password to every file.',
  },
  {
    key: 'merge-all',
    label: 'Merge into one PDF',
    description: 'Combines all uploaded files, in order, into a single document.',
  },
];

export default function BatchProcessor({ onClose }: Props) {
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [operation, setOperation] = useState<Operation>('rotate');
  const [watermarkText, setWatermarkText] = useState('DRAFT');
  const [password, setPassword] = useState('');
  const [running, setRunning] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [overallError, setOverallError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...picked.map((file) => ({ file, state: 'pending' as const }))]);
    e.target.value = '';
  };

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const processOne = async (file: File): Promise<Uint8Array> => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });

    if (operation === 'rotate') {
      for (const page of doc.getPages()) {
        const current = page.getRotation().angle;
        page.setRotation(degrees((current + 90) % 360));
      }
    } else if (operation === 'watermark') {
      const font = await doc.embedFont('Helvetica-Bold');
      for (const page of doc.getPages()) {
        const { width, height } = page.getSize();
        page.drawText(watermarkText || 'DRAFT', {
          x: width / 2 - (watermarkText.length * 12) / 2,
          y: height / 2,
          size: 48,
          font,
          color: rgb(0.6, 0.6, 0.6),
          opacity: 0.3,
          rotate: degrees(45),
        });
      }
    } else if (operation === 'protect') {
      doc.encrypt({ userPassword: password, permissions: { printing: 'highResolution' } });
    }
    // 'merge-all' is handled separately in runBatch, not per-file

    return doc.save();
  };

  const runBatch = async () => {
    if (files.length === 0) return;
    setRunning(true);
    setOverallError(null);
    setDoneCount(0);

    try {
      if (operation === 'merge-all') {
        const merged = await PDFDocument.create();
        for (let i = 0; i < files.length; i++) {
          setFiles((prev) =>
            prev.map((f, idx) => (idx === i ? { ...f, state: 'processing' } : f))
          );
          const bytes = new Uint8Array(await files[i].file.arrayBuffer());
          const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
          const indices = src.getPages().map((_, pIdx) => pIdx);
          const copied = await merged.copyPages(src, indices);
          copied.forEach((p) => merged.addPage(p));
          setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, state: 'done' } : f)));
          setDoneCount((d) => d + 1);
        }
        const mergedBytes = await merged.save();
        const blob = new Blob([mergedBytes as BlobPart], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'merged-batch.pdf';
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const zip = new JSZip();
        for (let i = 0; i < files.length; i++) {
          setFiles((prev) =>
            prev.map((f, idx) => (idx === i ? { ...f, state: 'processing' } : f))
          );
          try {
            const outBytes = await processOne(files[i].file);
            zip.file(files[i].file.name, outBytes);
            setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, state: 'done' } : f)));
            setDoneCount((d) => d + 1);
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            setFiles((prev) =>
              prev.map((f, idx) => (idx === i ? { ...f, state: 'error', error: message } : f))
            );
          }
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'batch-results.zip';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setOverallError(e instanceof Error ? e.message : String(e));
    }
    setRunning(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex max-h-[85vh] w-[520px] flex-col rounded-lg border border-ink-500 bg-ink-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-600 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-paper">
            <Layers size={15} /> Batch Process
          </div>
          <X size={16} className="cursor-pointer text-muted hover:text-paper" onClick={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <label className="mb-1 block text-[10px] uppercase text-muted">Operation</label>
          <div className="mb-3 grid grid-cols-2 gap-2">
            {OPERATIONS.map((op) => (
              <button
                key={op.key}
                onClick={() => setOperation(op.key)}
                className={`rounded-md border p-2 text-left text-xs transition-colors ${
                  operation === op.key
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-ink-500 text-muted hover:border-ink-400'
                }`}
              >
                <div className="font-medium">{op.label}</div>
                <div className="mt-0.5 text-[10px] opacity-80">{op.description}</div>
              </button>
            ))}
          </div>

          {operation === 'watermark' && (
            <input
              value={watermarkText}
              onChange={(e) => setWatermarkText(e.target.value)}
              placeholder="Watermark text"
              className="mb-3 w-full rounded border border-ink-500 bg-ink-700 px-3 py-1.5 text-sm text-paper focus:outline-none"
            />
          )}
          {operation === 'protect' && (
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password to apply to every file"
              className="mb-3 w-full rounded border border-ink-500 bg-ink-700 px-3 py-1.5 text-sm text-paper focus:outline-none"
            />
          )}

          <label className="mb-1 block text-[10px] uppercase text-muted">Files</label>
          <input
            type="file"
            accept="application/pdf"
            multiple
            onChange={handleFileSelect}
            className="mb-2 block w-full text-xs text-muted file:mr-2 file:rounded file:border-0 file:bg-ink-600 file:px-2 file:py-1 file:text-xs file:text-paper"
          />

          {files.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded border border-dashed border-ink-500 py-8 text-muted">
              <FileStack size={24} />
              <span className="text-xs">Add two or more PDFs to batch-process</span>
            </div>
          ) : (
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {files.map((f, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded bg-ink-700 px-2 py-1.5 text-xs"
                >
                  <span className="truncate text-paper/90">{f.file.name}</span>
                  <div className="flex items-center gap-2">
                    {f.state === 'processing' && (
                      <Loader2 size={12} className="animate-spin text-accent" />
                    )}
                    {f.state === 'done' && <CheckCircle2 size={12} className="text-signal-success" />}
                    {f.state === 'error' && (
                      <span title={f.error}>
                        <AlertTriangle size={12} className="text-signal-danger" />
                      </span>
                    )}
                    {f.state === 'pending' && !running && (
                      <X
                        size={12}
                        className="cursor-pointer text-muted hover:text-signal-danger"
                        onClick={() => removeFile(idx)}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {overallError && (
            <div className="mt-2 flex items-start gap-2 rounded border border-signal-danger/40 bg-signal-danger/10 p-2 text-xs text-signal-danger">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {overallError}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-ink-600 px-4 py-3">
          <span className="text-[11px] text-muted">
            {running ? `Processing ${doneCount}/${files.length}…` : `${files.length} file(s) ready`}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded px-3 py-1.5 text-xs text-muted hover:text-paper">
              Close
            </button>
            <button
              disabled={
                files.length === 0 ||
                running ||
                (operation === 'protect' && !password) ||
                (operation === 'merge-all' && files.length < 2)
              }
              onClick={runBatch}
              className="flex items-center gap-2 rounded bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-dim disabled:opacity-40"
            >
              {running && <Loader2 size={13} className="animate-spin" />}
              Run Batch
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
