import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';

export default function Toast() {
  const toast = useDocumentStore((s) => s.toast);
  const dismissToast = useDocumentStore((s) => s.dismissToast);

  if (!toast) return null;

  const isError = toast.kind === 'error';

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[9999] flex justify-center">
      <div
        className={`pointer-events-auto flex items-center gap-3 rounded-lg border px-4 py-3 shadow-2xl ${
          isError
            ? 'border-signal-danger/40 bg-ink-800 text-signal-danger'
            : 'border-signal-success/40 bg-ink-800 text-signal-success'
        }`}
      >
        {isError ? <AlertTriangle size={18} className="shrink-0" /> : <CheckCircle2 size={18} className="shrink-0" />}
        <span className="text-sm text-paper">{toast.message}</span>
        <button
          onClick={dismissToast}
          className="ml-1 shrink-0 text-muted hover:text-paper"
          title="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
