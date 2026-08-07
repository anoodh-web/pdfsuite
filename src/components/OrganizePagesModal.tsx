import { useEffect, useRef, useState } from 'react';
import { X, RotateCw, Trash2, FileOutput, GripVertical } from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';

interface Props {
  docId: string;
  onClose: () => void;
}

function GridThumbnail({
  docId,
  pageNum,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  docId: string;
  pageNum: number;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const documents = useDocumentStore((s) => s.documents);
  const rotatePage = useDocumentStore((s) => s.rotatePage);
  const deletePage = useDocumentStore((s) => s.deletePage);
  const extractPages = useDocumentStore((s) => s.extractPages);
  const doc = documents.find((d) => d.id === docId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!doc || !canvasRef.current) return;
      const page = await doc.proxy.getPage(pageNum);
      const viewport = page.getViewport({ scale: 0.55 });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx || cancelled) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, pageNum]);

  if (!doc) return null;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`group relative flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors ${
        isDragOver ? 'border-accent bg-accent-soft' : 'border-ink-600 bg-ink-800 hover:border-ink-500'
      }`}
    >
      <GripVertical
        size={14}
        className="absolute left-2 top-2 cursor-grab text-muted opacity-0 group-hover:opacity-70"
      />
      <div className="overflow-hidden rounded border border-ink-500 shadow-md">
        <canvas ref={canvasRef} className="block bg-white" />
      </div>
      <span className="font-mono text-xs text-muted">Page {pageNum}</span>
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => rotatePage(doc.id, pageNum - 1)}
          title="Rotate"
          className="rounded p-1.5 text-muted hover:bg-ink-600 hover:text-paper"
        >
          <RotateCw size={13} />
        </button>
        <button
          onClick={() => extractPages(doc.id, [pageNum])}
          title="Extract"
          className="rounded p-1.5 text-muted hover:bg-ink-600 hover:text-paper"
        >
          <FileOutput size={13} />
        </button>
        <button
          onClick={() => deletePage(doc.id, pageNum - 1)}
          title="Delete"
          className="rounded p-1.5 text-muted hover:bg-ink-600 hover:text-signal-danger"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

export default function OrganizePagesModal({ docId, onClose }: Props) {
  const doc = useDocumentStore((s) => s.documents.find((d) => d.id === docId));
  const reorderPage = useDocumentStore((s) => s.reorderPage);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOverPage, setDragOverPage] = useState<number | null>(null);

  if (!doc) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-8">
      <div className="flex h-full w-full max-w-5xl flex-col rounded-lg border border-ink-500 bg-ink-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-600 px-5 py-3">
          <div>
            <div className="text-sm font-medium text-paper">Organize Pages</div>
            <div className="text-xs text-muted">{doc.name} — {doc.pageCount} pages</div>
          </div>
          <X size={18} className="cursor-pointer text-muted hover:text-paper" onClick={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: doc.pageCount }, (_, i) => i + 1).map((p) => (
              <GridThumbnail
                key={p}
                docId={doc.id}
                pageNum={p}
                isDragOver={dragOverPage === p}
                onDragStart={() => setDragFrom(p)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverPage(p);
                }}
                onDrop={() => {
                  if (dragFrom !== null && dragFrom !== p) {
                    reorderPage(doc.id, dragFrom - 1, p - 1);
                  }
                  setDragFrom(null);
                  setDragOverPage(null);
                }}
              />
            ))}
          </div>
        </div>

        <div className="border-t border-ink-600 px-5 py-2.5 text-[11px] text-muted">
          Drag a page to reorder it. Hover a page for rotate/extract/delete.
        </div>
      </div>
    </div>
  );
}
