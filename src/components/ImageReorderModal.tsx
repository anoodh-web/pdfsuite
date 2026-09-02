import { useState, useEffect } from 'react';
import { X, GripVertical } from 'lucide-react';

interface Props {
  files: File[];
  onConfirm: (reordered: File[]) => void;
  onClose: () => void;
}

export default function ImageReorderModal({ files, onConfirm, onClose }: Props) {
  const [order, setOrder] = useState(files);
  const [urls, setUrls] = useState<string[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    const newUrls = order.map((f) => URL.createObjectURL(f));
    setUrls(newUrls);
    return () => newUrls.forEach((u) => URL.revokeObjectURL(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  const moveTo = (from: number, to: number) => {
    if (from === to) return;
    setOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[520px] rounded-lg border border-ink-500 bg-ink-800 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-paper">Reorder Images</h2>
          <button onClick={onClose} className="text-muted hover:text-paper">
            <X size={18} />
          </button>
        </div>

        <p className="mb-4 text-xs text-muted">
          Drag to set the exact order pages should appear in the PDF. Your file picker's
          selection order isn't always reliable, so this gives you direct control.
        </p>

        <div className="mb-4 grid max-h-96 grid-cols-4 gap-3 overflow-y-auto">
          {order.map((file, i) => (
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
              className={`group relative cursor-move rounded-md border-2 p-1 ${
                dragIndex === i ? 'border-accent opacity-50' : 'border-ink-500'
              }`}
            >
              <div className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                {i + 1}
              </div>
              <img
                src={urls[i]}
                alt={file.name}
                className="h-20 w-full rounded object-cover"
              />
              <div className="mt-1 flex items-center gap-1 truncate text-[10px] text-muted">
                <GripVertical size={10} className="shrink-0" />
                <span className="truncate">{file.name}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-ink-500 px-3 py-1.5 text-sm text-paper/80 hover:bg-ink-700"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(order)}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dim"
          >
            Use This Order
          </button>
        </div>
      </div>
    </div>
  );
}
