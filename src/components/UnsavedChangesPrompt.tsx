import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';

const isTauri = () => typeof window !== 'undefined' && !!(window as unknown as { isTauri?: boolean }).isTauri;

async function quitApp() {
  if (isTauri()) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().destroy();
  } else {
    window.close();
  }
}

// "Do you want to save your changes before closing?" — for closing one
// document tab, or for closing the whole app window while any open
// document has unsaved edits.
export default function UnsavedChangesPrompt() {
  const closeRequest = useDocumentStore((s) => s.closeRequest);
  const setCloseRequest = useDocumentStore((s) => s.setCloseRequest);
  const documents = useDocumentStore((s) => s.documents);
  const unsavedDocs = useDocumentStore((s) => s.unsavedDocs);
  const [busy, setBusy] = useState(false);
  const saveRef = useRef<HTMLButtonElement>(null);

  // Intercept the window's close button. Registering the listener is what
  // stops Tauri closing on its own; we then either let it go (nothing
  // unsaved) or ask first.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    if (isTauri()) {
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
        getCurrentWindow()
          .onCloseRequested((event) => {
            const s = useDocumentStore.getState();
            if (Object.keys(s.unsavedDocs).length === 0) return; // close normally
            event.preventDefault();
            s.setCloseRequest({ kind: 'app' });
          })
          .then((fn) => {
            if (cancelled) fn();
            else unlisten = fn;
          })
      );
    }
    // browser / dev build: the browser's own "Leave site?" dialog
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(useDocumentStore.getState().unsavedDocs).length === 0) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      cancelled = true;
      unlisten?.();
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  useEffect(() => {
    if (closeRequest) saveRef.current?.focus();
  }, [closeRequest]);

  if (!closeRequest) return null;

  const pending =
    closeRequest.kind === 'doc'
      ? documents.filter((d) => d.id === closeRequest.docId)
      : documents.filter((d) => unsavedDocs[d.id]);
  if (pending.length === 0) {
    // nothing left to ask about (e.g. it was saved meanwhile)
    queueMicrotask(() => setCloseRequest(null));
    return null;
  }

  const finish = async (save: boolean) => {
    const s = useDocumentStore.getState();
    setBusy(true);
    try {
      if (save) {
        for (const d of pending) {
          const ok = await s.exportDocument(d.id);
          if (!ok) return; // save failed — stay open so nothing is lost
        }
      }
      if (closeRequest.kind === 'doc') s.closeDocument(closeRequest.docId);
      setCloseRequest(null);
      if (closeRequest.kind === 'app') await quitApp();
    } finally {
      setBusy(false);
    }
  };

  const title =
    pending.length === 1
      ? `Do you want to save your changes to “${pending[0].name}” before closing?`
      : `Do you want to save your changes to ${pending.length} documents before closing?`;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !busy) setCloseRequest(null);
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-title"
        className="w-full max-w-md rounded-lg border border-ink-500 bg-ink-800 p-5 shadow-2xl"
      >
        <div className="flex gap-3">
          <AlertTriangle size={22} className="mt-0.5 shrink-0 text-accent" />
          <div>
            <h2 id="unsaved-title" className="text-sm font-semibold text-paper">
              {title}
            </h2>
            <p className="mt-1.5 text-xs text-muted">
              Your edits will be lost if you don&rsquo;t save them.
            </p>
            {pending.length > 1 && (
              <ul className="mt-2 max-h-32 list-disc overflow-y-auto pl-4 text-xs text-paper/80">
                {pending.map((d) => (
                  <li key={d.id} className="truncate">
                    {d.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            disabled={busy}
            onClick={() => setCloseRequest(null)}
            className="rounded-md border border-ink-500 px-3 py-1.5 text-xs text-paper/90 hover:bg-ink-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={() => finish(false)}
            className="rounded-md border border-ink-500 px-3 py-1.5 text-xs text-paper/90 hover:bg-ink-700 disabled:opacity-50"
          >
            Don&rsquo;t Save
          </button>
          <button
            ref={saveRef}
            disabled={busy}
            onClick={() => finish(true)}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-dim disabled:opacity-50"
          >
            {busy ? 'Saving…' : pending.length > 1 ? 'Save All' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
