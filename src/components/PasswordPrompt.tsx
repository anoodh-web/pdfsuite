import { useState } from 'react';
import { Lock, X } from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';

export default function PasswordPrompt() {
  const { pendingEncryptedFile, passwordError, unlockPendingFile, cancelPendingFile } =
    useDocumentStore();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  if (!pendingEncryptedFile) return null;

  const handleSubmit = async () => {
    setBusy(true);
    await unlockPendingFile(password);
    setBusy(false);
    setPassword('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-80 rounded-lg border border-ink-500 bg-ink-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-600 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-paper">
            <Lock size={14} /> Password Protected
          </div>
          <X
            size={16}
            className="cursor-pointer text-muted hover:text-paper"
            onClick={cancelPendingFile}
          />
        </div>
        <div className="p-4">
          <p className="mb-3 text-xs text-muted">
            <span className="text-paper/90">{pendingEncryptedFile.name}</span> is
            password-protected. Enter the password to open it.
          </p>
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="Password"
            className="w-full rounded border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-paper focus:outline-none"
          />
          {passwordError && (
            <p className="mt-2 text-xs text-signal-danger">{passwordError}</p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-600 px-4 py-3">
          <button
            onClick={cancelPendingFile}
            className="rounded px-3 py-1.5 text-xs text-muted hover:text-paper"
          >
            Cancel
          </button>
          <button
            disabled={!password || busy}
            onClick={handleSubmit}
            className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-dim disabled:opacity-40"
          >
            {busy ? 'Opening…' : 'Open'}
          </button>
        </div>
      </div>
    </div>
  );
}
