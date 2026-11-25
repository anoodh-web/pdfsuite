import { CheckCircle2, AlertTriangle, Loader2, X } from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';

// One notification at a time, bottom-centre: green for success, red for
// errors, and a spinner while something slow (like saving) is running.
export default function Toast() {
  const toast = useDocumentStore((s) => s.toast);
  const dismissToast = useDocumentStore((s) => s.dismissToast);

  if (!toast) return null;

  const isError = toast.kind === 'error';
  const isBusy = toast.kind === 'busy';
  const bar = isError ? 'bg-signal-danger' : isBusy ? 'bg-accent' : 'bg-signal-success';

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[9999] flex justify-center px-4">
      <div
        key={toast.id}
        role={isError ? 'alert' : 'status'}
        aria-live={isError ? 'assertive' : 'polite'}
        className="toast-in pointer-events-auto flex max-w-xl items-center gap-3 overflow-hidden rounded-lg border border-ink-500 bg-ink-800 py-3 pr-3 shadow-2xl"
      >
        <span className={`w-1.5 self-stretch ${bar}`} />
        {isBusy ? (
          <Loader2 size={20} className="shrink-0 animate-spin text-accent" />
        ) : isError ? (
          <AlertTriangle size={20} className="shrink-0 text-signal-danger" />
        ) : (
          <CheckCircle2 size={20} className="shrink-0 text-signal-success" />
        )}
        <span className="text-sm font-medium text-paper">{toast.message}</span>
        {!isBusy && (
          <button onClick={dismissToast} className="ml-1 shrink-0 text-muted hover:text-paper" title="Dismiss">
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
