import { useState } from 'react';
import { RefreshCw, Download, CheckCircle2 } from 'lucide-react';

type Status = 'idle' | 'checking' | 'upToDate' | 'available' | 'downloading' | 'error';

export default function UpdateChecker() {
  const [status, setStatus] = useState<Status>('idle');
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Only meaningful inside the installed desktop app — the browser
  // version has no update mechanism, and this API simply doesn't exist
  // there, so this whole feature quietly does nothing rather than error.
  let isDesktop = false;
  try {
    // dynamic require avoided on purpose — these are static imports at
    // module load time below; this flag just gates whether we call them
    isDesktop = typeof window !== 'undefined' && !!(window as unknown as { isTauri?: boolean }).isTauri;
  } catch {
    isDesktop = false;
  }

  const handleCheck = async () => {
    setStatus('checking');
    setErrorMsg(null);
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (update) {
        setUpdateVersion(update.version);
        setStatus('available');
      } else {
        setStatus('upToDate');
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  };

  const handleInstall = async () => {
    setStatus('downloading');
    setProgress(0);
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const { relaunch } = await import('@tauri-apps/plugin-process');
      const update = await check();
      if (!update) {
        setStatus('upToDate');
        return;
      }
      let downloaded = 0;
      let total = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0;
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          if (total > 0) setProgress(Math.round((downloaded / total) * 100));
        }
      });
      await relaunch();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  };

  if (!isDesktop) {
    return (
      <p className="text-xs text-muted">
        Automatic updates are only available in the installed desktop app.
      </p>
    );
  }

  return (
    <div>
      {status === 'idle' && (
        <button
          onClick={handleCheck}
          className="flex items-center gap-1.5 rounded-md border border-ink-500 px-3 py-1.5 text-xs text-paper/90 hover:bg-ink-700"
        >
          <RefreshCw size={13} /> Check for Updates
        </button>
      )}
      {status === 'checking' && (
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <RefreshCw size={13} className="animate-spin" /> Checking…
        </span>
      )}
      {status === 'upToDate' && (
        <span className="flex items-center gap-1.5 text-xs text-signal-success">
          <CheckCircle2 size={13} /> You're on the latest version.
        </span>
      )}
      {status === 'available' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-accent">Version {updateVersion} is available.</span>
          <button
            onClick={handleInstall}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-dim"
          >
            <Download size={13} /> Download & Install
          </button>
        </div>
      )}
      {status === 'downloading' && (
        <span className="text-xs text-accent">
          Downloading… {progress > 0 ? `${progress}%` : ''} (app will restart automatically)
        </span>
      )}
      {status === 'error' && (
        <span className="text-xs text-signal-danger">Update check failed: {errorMsg}</span>
      )}
    </div>
  );
}
