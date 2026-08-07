import { X, FileText } from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';

export default function DocumentTabs() {
  const { documents, activeId, setActiveDocument, closeDocument } = useDocumentStore();

  if (documents.length === 0) return null;

  return (
    <div className="flex h-9 items-center gap-1 border-b border-ink-600 bg-ink-900/40 px-2">
      {documents.map((doc) => (
        <div
          key={doc.id}
          onClick={() => setActiveDocument(doc.id)}
          className={`group flex max-w-[180px] cursor-pointer items-center gap-1.5 rounded-t-md px-2.5 py-1.5 text-xs transition-colors ${
            activeId === doc.id
              ? 'bg-ink-700 text-paper'
              : 'text-muted hover:text-paper'
          }`}
        >
          <FileText size={12} className="shrink-0 text-accent" />
          <span className="truncate">{doc.name}</span>
          <X
            size={12}
            className="ml-auto shrink-0 opacity-0 hover:text-signal-danger group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              closeDocument(doc.id);
            }}
          />
        </div>
      ))}
    </div>
  );
}
