import { useEffect, useRef, useState } from 'react';
import { Files, Bookmark, Paperclip, PenSquare, X, RotateCw, Trash2, FilePlus, FileOutput, GripVertical } from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';

function Thumbnail({
  pageNum,
  isActive,
  onClick,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver,
}: {
  pageNum: number;
  isActive: boolean;
  onClick: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  isDragOver: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { documents, activeId, rotatePage, deletePage, insertBlankPage, extractPages } =
    useDocumentStore();
  const doc = documents.find((d) => d.id === activeId);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!doc || !canvasRef.current) return;
      const page = await doc.proxy.getPage(pageNum);
      const viewport = page.getViewport({ scale: 0.22 });
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
      className={`group relative flex flex-col items-center gap-1 rounded-md p-1.5 transition-colors ${
        isActive ? 'bg-accent-soft' : 'hover:bg-ink-600'
      } ${isDragOver ? 'ring-2 ring-accent' : ''}`}
    >
      <button onClick={onClick} className="flex flex-col items-center gap-1">
        <div
          className={`overflow-hidden rounded border shadow-sm ${
            isActive ? 'border-accent' : 'border-ink-500'
          }`}
        >
          <canvas ref={canvasRef} className="block bg-white" />
        </div>
        <span className={`text-[10px] font-mono ${isActive ? 'text-accent' : 'text-muted'}`}>
          {pageNum}
        </span>
      </button>

      <GripVertical
        size={11}
        className="absolute left-0.5 top-0.5 cursor-grab text-muted opacity-0 group-hover:opacity-70"
      />

      <button
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        className="absolute right-0.5 top-0.5 rounded bg-ink-800/80 px-1 text-[10px] text-muted opacity-0 hover:text-paper group-hover:opacity-100"
      >
        •••
      </button>

      {menuOpen && (
        <div
          onMouseLeave={() => setMenuOpen(false)}
          className="absolute right-0 top-6 z-20 w-32 rounded-md border border-ink-500 bg-ink-700 p-1 shadow-xl"
        >
          <button
            onClick={() => {
              rotatePage(doc.id, pageNum - 1);
              setMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] text-muted hover:bg-ink-600 hover:text-paper"
          >
            <RotateCw size={12} /> Rotate
          </button>
          <button
            onClick={() => {
              insertBlankPage(doc.id, pageNum - 1);
              setMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] text-muted hover:bg-ink-600 hover:text-paper"
          >
            <FilePlus size={12} /> Insert blank after
          </button>
          <button
            onClick={() => {
              extractPages(doc.id, [pageNum]);
              setMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] text-muted hover:bg-ink-600 hover:text-paper"
          >
            <FileOutput size={12} /> Extract page
          </button>
          <button
            onClick={() => {
              deletePage(doc.id, pageNum - 1);
              setMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] text-signal-danger hover:bg-ink-600"
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

export default function ThumbnailRail() {
  const {
    documents,
    activeId,
    currentPage,
    setCurrentPage,
    isThumbnailRailOpen,
    reorderPage,
  } = useDocumentStore();
  const [dockTab, setDockTab] = useState<'pages' | 'bookmarks' | 'attachments' | 'signatures'>(
    'pages'
  );
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOverPage, setDragOverPage] = useState<number | null>(null);
  const doc = documents.find((d) => d.id === activeId);

  if (!isThumbnailRailOpen) return null;

  return (
    <div className="flex h-full">
      <div className="flex w-10 flex-col items-center gap-1 border-r border-ink-600 bg-ink-800 py-2">
        {[
          { key: 'pages', icon: Files },
          { key: 'bookmarks', icon: Bookmark },
          { key: 'attachments', icon: Paperclip },
          { key: 'signatures', icon: PenSquare },
        ].map(({ key, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setDockTab(key as typeof dockTab)}
            className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
              dockTab === key
                ? 'bg-accent-soft text-accent'
                : 'text-muted hover:bg-ink-600 hover:text-paper'
            }`}
          >
            <Icon size={16} strokeWidth={1.75} />
          </button>
        ))}
      </div>

      <div className="flex w-52 flex-col bg-ink-800">
        <div className="flex items-center justify-between border-b border-ink-600 px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">{dockTab}</span>
          <X size={14} className="cursor-pointer text-muted hover:text-paper" />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {dockTab === 'pages' && doc ? (
            <div className="grid grid-cols-1 gap-2">
              {Array.from({ length: doc.pageCount }, (_, i) => i + 1).map((p) => (
                <Thumbnail
                  key={p}
                  pageNum={p}
                  isActive={p === currentPage}
                  onClick={() => setCurrentPage(p)}
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
          ) : (
            <p className="px-1 text-xs text-muted">
              {doc ? 'Nothing here yet.' : 'Open a document to see pages.'}
            </p>
          )}
        </div>
        {doc && (
          <div className="border-t border-ink-600 px-2 py-1.5 text-[10px] text-muted">
            Drag a thumbnail to reorder · ••• for more actions
          </div>
        )}
      </div>
    </div>
  );
}
