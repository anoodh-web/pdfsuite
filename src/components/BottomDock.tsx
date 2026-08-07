import { useRef } from 'react';
import { Home, FolderOpen, LayoutGrid, Share2, Star } from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';

export default function BottomDock() {
  const { createBlankDocument, openFile, setActiveRibbonTab, toggleRightPanel } =
    useDocumentStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const items = [
    { icon: Home, label: 'New', onClick: () => createBlankDocument() },
    { icon: FolderOpen, label: 'Open', onClick: () => fileInputRef.current?.click() },
    { icon: LayoutGrid, label: 'Organize Pages', onClick: () => setActiveRibbonTab('Page Layout') },
    { icon: Share2, label: 'Share', onClick: () => setActiveRibbonTab('Share') },
    { icon: Star, label: 'Tools', onClick: () => toggleRightPanel() },
  ];

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) await openFile(file);
          e.target.value = '';
        }}
      />
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-ink-500 bg-ink-800/95 px-3 py-2 shadow-2xl backdrop-blur">
        {items.map(({ icon: Icon, label, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            title={label}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white transition-transform hover:scale-110 hover:bg-accent-dim"
          >
            <Icon size={16} />
          </button>
        ))}
      </div>
    </div>
  );
}
