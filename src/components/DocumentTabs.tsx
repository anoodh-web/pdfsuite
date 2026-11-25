import { X, FileText } from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';

export default function DocumentTabs() {
  const { documents, activeId, setActiveDocument, requestCloseDocument, unsavedDocs } = useDocumentStore();

  if (documents.length === 0) return null;

  return (
    <div className="flex h-9 items-center gap-1 border-b border-ink-600 bg-ink-900/40 px-2">
      {documents.map((doc) => {
        const unsaved = !!unsavedDocs[doc.id];
        return (
          <div
            key={doc.id}
            onClick={() => setActiveDocument(doc.id)}
            title={unsaved ? `${doc.name} — unsaved changes` : doc.name}
            className={`group flex max-w-[200px] cursor-pointer items-center gap-1.5 rounded-t-md px-2.5 py-1.5 text-xs transition-colors ${
              activeId === doc.id
                ? 'bg-ink-700 text-paper'
                : 'text-muted hover:text-paper'
            }`}
          >
            <FileText size={12} className="shrink-0 text-accent" />
            <span className="truncate">{doc.name}</span>
            {/* a dot marks unsaved edits; it turns into the close button on hover */}
            <span className="relative ml-auto flex h-3 w-3 shrink-0 items-center justify-center">
              {unsaved && (
                <span className="h-2 w-2 rounded-full bg-accent group-hover:hidden" aria-label="Unsaved changes" />
              )}
              <X
                size={12}
                className={`absolute hover:text-signal-danger ${unsaved ? 'hidden group-hover:block' : 'opacity-0 group-hover:opacity-100'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  requestCloseDocument(doc.id);
                }}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}
