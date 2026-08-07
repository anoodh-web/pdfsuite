import {
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Minus,
  Plus,
} from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';

export default function StatusBar() {
  const { documents, activeId, currentPage, setCurrentPage, zoom, setZoom } =
    useDocumentStore();
  const doc = documents.find((d) => d.id === activeId);
  const pageCount = doc?.pageCount ?? 0;

  const go = (p: number) => setCurrentPage(Math.min(Math.max(1, p), pageCount || 1));

  return (
    <div className="flex h-9 items-center justify-between border-t border-ink-600 bg-ink-800 px-3 text-muted">
      <div className="flex items-center gap-1">
        <button
          disabled={!doc}
          onClick={() => go(1)}
          className="rounded p-1 hover:bg-ink-600 hover:text-paper disabled:opacity-30"
        >
          <ChevronsLeft size={14} />
        </button>
        <button
          disabled={!doc}
          onClick={() => go(currentPage - 1)}
          className="rounded p-1 hover:bg-ink-600 hover:text-paper disabled:opacity-30"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="mx-2 font-mono text-xs">
          {doc ? `${currentPage} of ${pageCount}` : '— of —'}
        </span>
        <button
          disabled={!doc}
          onClick={() => go(currentPage + 1)}
          className="rounded p-1 hover:bg-ink-600 hover:text-paper disabled:opacity-30"
        >
          <ChevronRight size={14} />
        </button>
        <button
          disabled={!doc}
          onClick={() => go(pageCount)}
          className="rounded p-1 hover:bg-ink-600 hover:text-paper disabled:opacity-30"
        >
          <ChevronsRight size={14} />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setZoom(zoom - 0.1)}
          className="rounded p-1 hover:bg-ink-600 hover:text-paper"
        >
          <Minus size={14} />
        </button>
        <span className="w-10 text-center font-mono text-xs">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom(zoom + 0.1)}
          className="rounded p-1 hover:bg-ink-600 hover:text-paper"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
