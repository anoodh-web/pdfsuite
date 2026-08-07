import { useState } from 'react';
import { X, Save } from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';

interface Props {
  docId: string;
  currentName: string;
  onClose: () => void;
}

export default function SaveAsModal({ docId, currentName, onClose }: Props) {
  const saveAsWithName = useDocumentStore((s) => s.saveAsWithName);
  const [name, setName] = useState(currentName.replace(/\.pdf$/i, ''));

  const handleSave = () => {
    if (!name.trim()) return;
    saveAsWithName(docId, name.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-80 rounded-lg border border-ink-500 bg-ink-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-600 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-paper">
            <Save size={15} /> Save As
          </div>
          <X size={16} className="cursor-pointer text-muted hover:text-paper" onClick={onClose} />
        </div>
        <div className="p-4">
          <label className="mb-1 block text-[10px] uppercase text-muted">File name</label>
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="w-full rounded border border-ink-500 bg-ink-700 px-3 py-1.5 text-sm text-paper focus:outline-none"
            />
            <span className="text-xs text-muted">.pdf</span>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-600 px-4 py-3">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-xs text-muted hover:text-paper">
            Cancel
          </button>
          <button
            disabled={!name.trim()}
            onClick={handleSave}
            className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-dim disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
