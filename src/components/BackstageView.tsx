import { useState } from 'react';
import {
  X,
  FilePlus,
  FolderOpen,
  Save,
  Download,
  Printer,
  Info,
  Share2,
  Mail,
  Smartphone,
  FileX,
  FileText,
  ChevronRight,
} from 'lucide-react';
import { useDocumentStore, type OpenDocument } from '../store/useDocumentStore';

type Section = 'info' | 'new' | 'open' | 'save' | 'print' | 'share' | 'about';

interface Props {
  documents: OpenDocument[];
  activeDoc: OpenDocument | null;
  onClose: () => void;
  onNew: () => void;
  onOpenFile: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onPrint: () => void;
  onProperties: () => void;
  onShare: () => void;
  onEmail: () => void;
  onCloseDocument: () => void;
  onSwitchDocument: (id: string) => void;
}

const NAV: { key: Section; label: string; icon: typeof FilePlus }[] = [
  { key: 'info', label: 'Info', icon: Info },
  { key: 'new', label: 'New', icon: FilePlus },
  { key: 'open', label: 'Open', icon: FolderOpen },
  { key: 'save', label: 'Save / Export', icon: Save },
  { key: 'print', label: 'Print', icon: Printer },
  { key: 'share', label: 'Share', icon: Share2 },
  { key: 'about', label: 'About', icon: Info },
];

export default function BackstageView({
  documents,
  activeDoc,
  onClose,
  onNew,
  onOpenFile,
  onSave,
  onSaveAs,
  onPrint,
  onProperties,
  onShare,
  onEmail,
  onCloseDocument,
  onSwitchDocument,
}: Props) {
  const [section, setSection] = useState<Section>('info');
  const metaGetter = useDocumentStore((s) => s.getDocumentMetadata);
  const meta = activeDoc ? metaGetter(activeDoc.id) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-900">
      {/* branded header */}
      <div className="flex items-center gap-3 border-b border-ink-600 bg-ink-800 px-6 py-5">
        <img src="/logo-128.png" alt="PDF Suite" className="h-12 w-12" />
        <span className="font-ui text-3xl font-bold text-accent">PDF Suite</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* left nav */}
        <div className="flex w-56 flex-col bg-ink-800">
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-5 py-4 text-sm text-paper/80 hover:bg-ink-700"
          >
            <ChevronRight size={16} className="rotate-180" /> Back
          </button>
          <div className="mt-2 flex flex-col">
            {NAV.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setSection(key)}
                className={`flex items-center gap-3 px-5 py-3 text-left text-sm transition-colors ${
                  section === key
                    ? 'bg-accent text-white'
                    : 'text-paper/80 hover:bg-ink-700 hover:text-paper'
                }`}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
          <div className="mt-auto px-5 py-4 text-[10px] text-muted">
            {activeDoc ? activeDoc.name : 'No document open'}
          </div>
        </div>

        {/* right content pane */}
        <div className="relative flex-1 overflow-y-auto p-10">
        <button
          onClick={onClose}
          className="absolute right-6 top-5 text-muted hover:text-paper"
        >
          <X size={20} />
        </button>

        {section === 'info' && (
          <div className="max-w-xl">
            <h1 className="mb-6 text-2xl font-semibold text-paper">Document Info</h1>
            {activeDoc && meta ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-ink-600 bg-ink-800 p-5">
                  <div className="mb-1 flex items-center gap-2 text-paper">
                    <FileText size={16} className="text-accent" />
                    <span className="font-medium">{activeDoc.name}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 pt-3 text-sm text-muted">
                    <span>Pages</span>
                    <span className="text-paper/80">{meta.pageCount}</span>
                    <span>Title</span>
                    <span className="text-paper/80">{meta.title || '—'}</span>
                    <span>Author</span>
                    <span className="text-paper/80">{meta.author || '—'}</span>
                    <span>Created</span>
                    <span className="text-paper/80">{meta.creationDate}</span>
                    <span>Modified</span>
                    <span className="text-paper/80">{meta.modificationDate}</span>
                  </div>
                </div>
                <button
                  onClick={onProperties}
                  className="rounded-md bg-ink-700 px-4 py-2 text-sm text-paper hover:bg-ink-600"
                >
                  Edit Properties…
                </button>
                <button
                  onClick={onCloseDocument}
                  className="ml-2 flex items-center gap-2 rounded-md bg-ink-700 px-4 py-2 text-sm text-paper hover:bg-ink-600"
                >
                  <FileX size={14} /> Close Document
                </button>
              </div>
            ) : (
              <p className="text-muted">No document is currently open.</p>
            )}
          </div>
        )}

        {section === 'new' && (
          <div className="max-w-xl">
            <h1 className="mb-6 text-2xl font-semibold text-paper">New</h1>
            <button
              onClick={onNew}
              className="flex w-64 flex-col items-start gap-2 rounded-lg border border-ink-600 bg-ink-800 p-5 text-left hover:border-accent"
            >
              <FilePlus size={28} className="text-accent" />
              <span className="font-medium text-paper">Blank Document</span>
              <span className="text-xs text-muted">US Letter, one page</span>
            </button>
          </div>
        )}

        {section === 'open' && (
          <div className="max-w-xl">
            <h1 className="mb-6 text-2xl font-semibold text-paper">Open</h1>
            <button
              onClick={onOpenFile}
              className="mb-6 flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-dim"
            >
              <FolderOpen size={16} /> Browse for a PDF…
            </button>

            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Currently Open
            </h2>
            {documents.length === 0 ? (
              <p className="text-sm text-muted">Nothing open yet.</p>
            ) : (
              <div className="space-y-1">
                {documents.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => onSwitchDocument(d.id)}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-ink-700 ${
                      activeDoc?.id === d.id ? 'bg-ink-700 text-paper' : 'text-paper/80'
                    }`}
                  >
                    <FileText size={14} className="text-accent" /> {d.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {section === 'save' && (
          <div className="max-w-xl">
            <h1 className="mb-6 text-2xl font-semibold text-paper">Save / Export</h1>
            <div className="space-y-2">
              <button
                disabled={!activeDoc}
                onClick={onSave}
                className="flex w-full items-center gap-3 rounded-md border border-ink-600 bg-ink-800 px-4 py-3 text-left text-sm text-paper hover:border-accent disabled:opacity-40"
              >
                <Save size={16} className="text-accent" />
                <div>
                  <div className="font-medium">Save</div>
                  <div className="text-xs text-muted">Download this document as-is</div>
                </div>
              </button>
              <button
                disabled={!activeDoc}
                onClick={onSaveAs}
                className="flex w-full items-center gap-3 rounded-md border border-ink-600 bg-ink-800 px-4 py-3 text-left text-sm text-paper hover:border-accent disabled:opacity-40"
              >
                <Download size={16} className="text-accent" />
                <div>
                  <div className="font-medium">Save As…</div>
                  <div className="text-xs text-muted">Rename before downloading</div>
                </div>
              </button>
            </div>
          </div>
        )}

        {section === 'print' && (
          <div className="max-w-xl">
            <h1 className="mb-6 text-2xl font-semibold text-paper">Print</h1>
            <button
              disabled={!activeDoc}
              onClick={onPrint}
              className="flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-dim disabled:opacity-40"
            >
              <Printer size={16} /> Print…
            </button>
            <p className="mt-3 max-w-sm text-xs text-muted">
              Opens the document in a new tab and triggers your browser's native print dialog.
            </p>
          </div>
        )}

        {section === 'share' && (
          <div className="max-w-xl">
            <h1 className="mb-6 text-2xl font-semibold text-paper">Share</h1>
            <div className="space-y-2">
              <button
                disabled={!activeDoc}
                onClick={onShare}
                className="flex w-full items-center gap-3 rounded-md border border-ink-600 bg-ink-800 px-4 py-3 text-left text-sm text-paper hover:border-accent disabled:opacity-40"
              >
                <Smartphone size={16} className="text-accent" />
                <div>
                  <div className="font-medium">Share…</div>
                  <div className="text-xs text-muted">
                    Hand the file to your device's native share sheet
                  </div>
                </div>
              </button>
              <button
                disabled={!activeDoc}
                onClick={onEmail}
                className="flex w-full items-center gap-3 rounded-md border border-ink-600 bg-ink-800 px-4 py-3 text-left text-sm text-paper hover:border-accent disabled:opacity-40"
              >
                <Mail size={16} className="text-accent" />
                <div>
                  <div className="font-medium">Email</div>
                  <div className="text-xs text-muted">
                    Opens your mail app — attach the file manually after Save As
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}
        {section === 'about' && (
          <div className="max-w-xl">
            <h1 className="mb-6 text-2xl font-semibold text-paper">About</h1>
            <div className="flex items-start gap-5 rounded-lg border border-ink-600 bg-ink-800 p-6">
              <img src="/logo-256.png" alt="PDF Suite" className="h-20 w-20 shrink-0" />
              <div>
                <div className="text-xl font-bold text-accent">PDF Suite</div>
                <div className="mb-3 text-xs text-muted">Version 1.0.0</div>
                <div className="space-y-1 text-sm text-paper/80">
                  <div>Developed &amp; Engineered by AD Labs</div>
                  <div>Lead Developer: Anoodh</div>
                </div>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
