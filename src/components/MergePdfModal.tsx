import { useRef, useState } from 'react';
import { X, FileStack, GripVertical, Plus } from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';

export default function MergePdfModal({ onClose }: { onClose: () => void }) {
  const mergeSelectedFiles = useDocumentStore((s) => s.mergeSelectedFiles);
  const showToast = useDocumentStore((s) => s.showToast);

  const [files, setFiles] = useState<File[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const pdfsOnly = Array.from(newFiles).filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    setFiles((prev) => [...prev, ...pdfsOnly]);
    setError(null);
  };

  const removeAt = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const moveTo = (from: number, to: number) => {
    if (from === to) return;
    setFiles((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleMerge = async () => {
    if (files.length < 2) {
      setError('Add at least 2 PDF files to merge.');
      return;
    }
    setRunning(true);
    setError(null);
    const result = await mergeSelectedFiles(files);
    setRunning(false);
    if (!result.ok) {
      setError(result.error);
      showToast(`Merge failed: ${result.error}`, 'error');
      return;
    }
    if (result.skipped.length > 0) {
      showToast(
        `Merged successfully, but couldn't read: ${result.skipped.join(', ')}`,
        'error'
      );
    } else {
      showToast('The files have been successfully merged and saved.');
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[520px] rounded-lg border border-ink-500 bg-ink-800 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-paper">
            <FileStack size={18} className="text-accent" />
            <h2 className="text-base font-semibold">Merge PDFs</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-paper">
            <X size={18} />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-ink-500 py-2.5 text-xs text-paper/80 hover:border-accent hover:text-accent"
        >
          <Plus size={14} /> Add PDF Files
        </button>

        {files.length > 0 && (
          <>
            <p className="mb-2 text-xs text-muted">Drag to set the order they\u2019ll be merged in:</p>
            <div className="mb-4 max-h-64 space-y-1.5 overflow-y-auto">
              {files.map((file, i) => (
                <div
                  key={`${file.name}-${file.lastModified}-${i}`}
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null) moveTo(dragIndex, i);
                    setDragIndex(null);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  className={`flex cursor-move items-center gap-2 rounded-md border p-2 ${
                    dragIndex === i ? 'border-accent opacity-50' : 'border-ink-500'
                  }`}
                >
                  <GripVertical size={14} className="shrink-0 text-muted" />
                  <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white">
                    {i + 1}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-xs text-paper/90">{file.name}</span>
                  <X
                    size={13}
                    className="shrink-0 cursor-pointer text-muted hover:text-signal-danger"
                    onClick={() => removeAt(i)}
                  />
                </div>
              ))}
            </div>
          </>
        )}

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
            onClick={handleMerge}
            disabled={running || files.length < 2}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dim disabled:opacity-50"
          >
            {running ? 'Merging…' : 'Merge'}
          </button>
        </div>
      </div>
    </div>
  );
}
