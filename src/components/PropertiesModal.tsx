import { useState } from 'react';
import { X, FileText } from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';

interface Props {
  docId: string;
  onClose: () => void;
}

export default function PropertiesModal({ docId, onClose }: Props) {
  const getDocumentMetadata = useDocumentStore((s) => s.getDocumentMetadata);
  const setDocumentMetadata = useDocumentStore((s) => s.setDocumentMetadata);
  const meta = getDocumentMetadata(docId);

  const [title, setTitle] = useState(meta?.title ?? '');
  const [author, setAuthor] = useState(meta?.author ?? '');
  const [subject, setSubject] = useState(meta?.subject ?? '');
  const [keywords, setKeywords] = useState(meta?.keywords ?? '');
  const [saved, setSaved] = useState(false);

  if (!meta) return null;

  const handleSave = () => {
    setDocumentMetadata(docId, { title, author, subject, keywords });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-96 rounded-lg border border-ink-500 bg-ink-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-600 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-paper">
            <FileText size={15} /> Document Properties
          </div>
          <X size={16} className="cursor-pointer text-muted hover:text-paper" onClick={onClose} />
        </div>

        <div className="space-y-3 p-4">
          <div>
            <label className="mb-1 block text-[10px] uppercase text-muted">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded border border-ink-500 bg-ink-700 px-3 py-1.5 text-sm text-paper focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase text-muted">Author</label>
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="w-full rounded border border-ink-500 bg-ink-700 px-3 py-1.5 text-sm text-paper focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase text-muted">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded border border-ink-500 bg-ink-700 px-3 py-1.5 text-sm text-paper focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase text-muted">
              Keywords (comma-separated)
            </label>
            <input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="w-full rounded border border-ink-500 bg-ink-700 px-3 py-1.5 text-sm text-paper focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded bg-ink-700/50 p-3 text-[11px] text-muted">
            <span>Pages</span>
            <span className="text-paper/80">{meta.pageCount}</span>
            <span>Creator</span>
            <span className="text-paper/80">{meta.creator || '—'}</span>
            <span>Producer</span>
            <span className="text-paper/80">{meta.producer || '—'}</span>
            <span>Created</span>
            <span className="text-paper/80">{meta.creationDate}</span>
            <span>Modified</span>
            <span className="text-paper/80">{meta.modificationDate}</span>
          </div>
          <p className="text-[10px] text-muted">
            Editable fields apply to this open document's in-memory copy — use Save As or
            Export to write them into a downloaded file.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-ink-600 px-4 py-3">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-xs text-muted hover:text-paper">
            Close
          </button>
          <button
            onClick={handleSave}
            className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-dim"
          >
            {saved ? 'Saved ✓' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}
