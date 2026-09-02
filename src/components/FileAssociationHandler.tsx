import { useEffect } from 'react';
import { useDocumentStore } from '../store/useDocumentStore';

// Only meaningful inside the installed desktop app — the browser version
// has no file-association concept, and these Tauri APIs simply don't
// exist there, so this component quietly does nothing rather than error.
function isDesktop() {
  return typeof window !== 'undefined' && !!(window as unknown as { isTauri?: boolean }).isTauri;
}

function filenameFromPath(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || 'document.pdf';
}

export default function FileAssociationHandler() {
  const openFile = useDocumentStore((s) => s.openFile);

  useEffect(() => {
    if (!isDesktop()) return;

    const openFromPath = async (path: string) => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const bytes = await invoke<number[]>('read_file_bytes', { path });
        const file = new File([new Uint8Array(bytes)], filenameFromPath(path), {
          type: 'application/pdf',
        });
        await openFile(file);
      } catch (e) {
        console.warn('Could not open file from Windows file association:', e);
      }
    };

    let unlisten: (() => void) | undefined;

    (async () => {
      // Case 1: the app was just launched by double-clicking a PDF (or
      // "Open with" → PDF Suite Pro) — the path was captured on the Rust
      // side before this frontend even mounted, so we ask for it now
      // rather than relying on an event that could have fired too early.
      const { invoke } = await import('@tauri-apps/api/core');
      const pending = await invoke<string | null>('take_pending_file');
      if (pending) await openFromPath(pending);

      // Case 2: the app was already running and the user opened another
      // PDF via file association — Windows tries to launch a second
      // instance, which the single-instance plugin intercepts and
      // forwards to this already-running window as an event instead.
      const { listen } = await import('@tauri-apps/api/event');
      unlisten = await listen<string>('open-file', (event) => {
        openFromPath(event.payload);
      });
    })();

    return () => unlisten?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
