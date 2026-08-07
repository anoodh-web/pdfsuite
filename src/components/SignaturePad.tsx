import { useRef, useState, useEffect } from 'react';
import { Pencil, Type, Upload, X, Star, Trash2 } from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';

type Tab = 'draw' | 'type' | 'upload' | 'saved';

interface Props {
  onConfirm: (dataUrl: string, w: number, h: number) => void;
  onCancel: () => void;
}

function renderTypedSignature(text: string) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const fontSpec = '52px "Segoe Script", "Brush Script MT", "Comic Sans MS", cursive';
  ctx.font = fontSpec;
  const metrics = ctx.measureText(text || 'Signature');
  canvas.width = Math.max(60, Math.ceil(metrics.width) + 24);
  canvas.height = 84;
  ctx.font = fontSpec;
  ctx.fillStyle = '#1B2733';
  ctx.textBaseline = 'middle';
  ctx.fillText(text || 'Signature', 12, canvas.height / 2);
  return { dataUrl: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height };
}

/** Loads an uploaded image (png/jpg/svg) into a canvas so we get a
 * consistent PNG data URL and real pixel dimensions, and — for JPEGs,
 * which never have alpha — nothing special is needed; PNG/SVG already
 * support transparency and pass through as-is once rasterized. */
async function fileToImageData(file: File): Promise<{ dataUrl: string; w: number; h: number }> {
  const rawDataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = rawDataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  // transparent by default — SVG/PNG alpha carries through; JPEG has none anyway
  ctx.drawImage(img, 0, 0);
  return { dataUrl: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height };
}

export default function SignaturePad({ onConfirm, onCancel }: Props) {
  const [tab, setTab] = useState<Tab>('draw');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasStroke = useRef(false);
  const [typedText, setTypedText] = useState('');
  const [uploaded, setUploaded] = useState<{ dataUrl: string; w: number; h: number } | null>(
    null
  );
  const [saveName, setSaveName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { savedSignatures, saveSignature, deleteSavedSignature } = useDocumentStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || tab !== 'draw') return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1B2733';
  }, [tab]);

  const posFromEvent = (e: React.PointerEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = posFromEvent(e, canvas);
    const ctx = canvas.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const canvas = canvasRef.current!;
    const { x, y } = posFromEvent(e, canvas);
    const ctx = canvas.getContext('2d')!;
    ctx.lineTo(x, y);
    ctx.stroke();
    hasStroke.current = true;
  };

  const handlePointerUp = () => {
    drawing.current = false;
  };

  const clearDrawing = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasStroke.current = false;
  };

  const confirmDraw = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStroke.current) return;
    onConfirm(canvas.toDataURL('image/png'), canvas.width, canvas.height);
  };

  const confirmTyped = () => {
    if (!typedText.trim()) return;
    const { dataUrl, w, h } = renderTypedSignature(typedText.trim());
    onConfirm(dataUrl, w, h);
  };

  const confirmUploaded = () => {
    if (!uploaded) return;
    onConfirm(uploaded.dataUrl, uploaded.w, uploaded.h);
  };

  const currentResult = (): { dataUrl: string; w: number; h: number } | null => {
    if (tab === 'draw' && hasStroke.current && canvasRef.current) {
      return {
        dataUrl: canvasRef.current.toDataURL('image/png'),
        w: canvasRef.current.width,
        h: canvasRef.current.height,
      };
    }
    if (tab === 'type' && typedText.trim()) return renderTypedSignature(typedText.trim());
    if (tab === 'upload' && uploaded) return uploaded;
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[420px] rounded-lg border border-ink-500 bg-ink-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-600 px-4 py-3">
          <span className="text-sm font-medium text-paper">Add Signature</span>
          <X size={16} className="cursor-pointer text-muted hover:text-paper" onClick={onCancel} />
        </div>

        <div className="flex gap-1 border-b border-ink-600 px-3 pt-2">
          {[
            { key: 'draw', label: 'Draw', icon: Pencil },
            { key: 'type', label: 'Type', icon: Type },
            { key: 'upload', label: 'Upload', icon: Upload },
            { key: 'saved', label: `Saved (${savedSignatures.length})`, icon: Star },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key as Tab)}
              className={`flex items-center gap-1.5 rounded-t-md px-3 py-1.5 text-xs transition-colors ${
                tab === key ? 'bg-ink-700 text-paper' : 'text-muted hover:text-paper'
              }`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {tab === 'draw' && (
            <>
              <canvas
                ref={canvasRef}
                width={360}
                height={140}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className="w-full touch-none rounded border border-dashed border-ink-500 bg-white"
              />
              <div className="mt-2 flex items-center justify-between">
                <button onClick={clearDrawing} className="text-xs text-muted hover:text-paper">
                  Clear
                </button>
                <span className="text-[10px] text-muted">
                  Mouse, touchpad, stylus, or touch — draw above
                </span>
              </div>
            </>
          )}

          {tab === 'type' && (
            <>
              <input
                autoFocus
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                placeholder="Type your full name"
                className="w-full rounded border border-ink-500 bg-white px-3 py-3 text-lg text-black focus:outline-none"
                style={{ fontFamily: '"Segoe Script","Brush Script MT",cursive' }}
              />
            </>
          )}

          {tab === 'upload' && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) setUploaded(await fileToImageData(file));
                  e.target.value = '';
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded border border-dashed border-ink-500 text-muted hover:border-accent hover:text-accent"
              >
                <Upload size={22} />
                <span className="text-xs">PNG, JPG, or SVG — transparency preserved</span>
              </button>
              {uploaded && (
                <div className="mt-2 flex items-center justify-center rounded border border-ink-500 bg-white p-2">
                  <img src={uploaded.dataUrl} alt="signature preview" className="max-h-16" />
                </div>
              )}
            </>
          )}

          {tab === 'saved' && (
            <div className="max-h-52 space-y-1 overflow-y-auto">
              {savedSignatures.length === 0 && (
                <p className="text-xs text-muted">
                  No saved signatures yet — draw, type, or upload one, then click "Save for
                  reuse" below.
                </p>
              )}
              {savedSignatures.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded p-1.5 hover:bg-ink-600"
                >
                  <button
                    onClick={() => onConfirm(s.dataUrl, s.w, s.h)}
                    className="flex flex-1 items-center gap-2 rounded bg-white px-2 py-1"
                  >
                    <img src={s.dataUrl} alt={s.name} className="h-8" />
                    <span className="text-xs text-black">{s.name}</span>
                  </button>
                  <Trash2
                    size={14}
                    className="ml-2 cursor-pointer text-muted hover:text-signal-danger"
                    onClick={() => deleteSavedSignature(s.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {tab !== 'saved' && (
          <div className="flex items-center justify-between gap-2 border-t border-ink-600 px-4 py-3">
            <div className="flex items-center gap-1.5">
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Save as…"
                className="w-24 rounded bg-ink-700 px-2 py-1 text-[11px] text-paper focus:outline-none"
              />
              <button
                disabled={!saveName.trim() || !currentResult()}
                onClick={() => {
                  const res = currentResult();
                  if (res) {
                    saveSignature(saveName.trim(), res.dataUrl, res.w, res.h);
                    setSaveName('');
                  }
                }}
                className="rounded bg-ink-600 px-2 py-1 text-[11px] text-muted hover:text-paper disabled:opacity-30"
              >
                Save for reuse
              </button>
            </div>
            <button
              onClick={() => {
                if (tab === 'draw') confirmDraw();
                else if (tab === 'type') confirmTyped();
                else confirmUploaded();
              }}
              className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-dim"
            >
              Insert Signature
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
