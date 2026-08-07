import { useRef, useState } from 'react';
import { X, ShieldCheck, Upload, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';

interface Props {
  docId: string;
  docName: string;
  onClose: () => void;
}

export default function DigitalSignatureModal({ docId, docName, onClose }: Props) {
  const signDocument = useDocumentStore((s) => s.signDocument);
  const userProfile = useDocumentStore((s) => s.userProfile);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [p12File, setP12File] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [signerName, setSignerName] = useState(userProfile?.name ?? '');
  const [reason, setReason] = useState('I approve this document');
  const [location, setLocation] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [status, setStatus] = useState<'idle' | 'signing' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSign = async () => {
    if (!p12File) return;
    setStatus('signing');
    setErrorMsg('');
    const p12Bytes = new Uint8Array(await p12File.arrayBuffer());
    const result = await signDocument(docId, {
      p12Bytes,
      passphrase,
      reason,
      location,
      signerName: signerName || 'Signer',
      contactInfo,
    });
    if (result.ok) {
      setStatus('done');
    } else {
      setStatus('error');
      setErrorMsg(result.error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[440px] rounded-lg border border-ink-500 bg-ink-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-600 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-paper">
            <ShieldCheck size={15} /> Digital Signature — {docName}
          </div>
          <X size={16} className="cursor-pointer text-muted hover:text-paper" onClick={onClose} />
        </div>

        {status === 'done' ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <CheckCircle2 size={36} className="text-signal-success" />
            <p className="text-sm text-paper">
              Signed and downloaded as <span className="font-medium">signed-{docName}</span>
            </p>
            <p className="text-xs text-muted">
              This is a real cryptographic CMS/PKCS#7 signature — open it in Adobe Reader or
              another PDF viewer with signature panels to inspect it. If your certificate isn't
              from a publicly trusted CA, the viewer will flag it as untrusted (expected for
              self-signed or internal certs) but the signature integrity itself is real.
            </p>
            <button
              onClick={onClose}
              className="mt-2 rounded bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-dim"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-3 p-4">
            <div>
              <label className="mb-1 block text-[10px] uppercase text-muted">
                Certificate (.p12 / .pfx)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".p12,.pfx"
                className="hidden"
                onChange={(e) => setP12File(e.target.files?.[0] ?? null)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center gap-2 rounded border border-dashed border-ink-500 px-3 py-2 text-xs text-muted hover:border-accent hover:text-accent"
              >
                <Upload size={14} />
                {p12File ? p12File.name : 'Choose a .p12 or .pfx certificate file'}
              </button>
            </div>

            <div>
              <label className="mb-1 block text-[10px] uppercase text-muted">
                Certificate password
              </label>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="w-full rounded border border-ink-500 bg-ink-700 px-3 py-1.5 text-sm text-paper focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[10px] uppercase text-muted">Signer name</label>
                <input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full rounded border border-ink-500 bg-ink-700 px-3 py-1.5 text-sm text-paper focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase text-muted">Location</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="City, Country"
                  className="w-full rounded border border-ink-500 bg-ink-700 px-3 py-1.5 text-sm text-paper focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[10px] uppercase text-muted">
                Reason for signing
              </label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded border border-ink-500 bg-ink-700 px-3 py-1.5 text-sm text-paper focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-[10px] uppercase text-muted">
                Contact info (optional)
              </label>
              <input
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
                placeholder="email or phone"
                className="w-full rounded border border-ink-500 bg-ink-700 px-3 py-1.5 text-sm text-paper focus:outline-none"
              />
            </div>

            {status === 'error' && (
              <div className="flex items-start gap-2 rounded border border-signal-danger/40 bg-signal-danger/10 p-2 text-xs text-signal-danger">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {errorMsg}
              </div>
            )}

            <p className="text-[10px] leading-snug text-muted">
              This produces a real CMS/PKCS#7 detached signature over the document, using your
              certificate's private key — the same cryptographic mechanism Adobe Acrobat and
              Nitro use. Your certificate and password stay in your browser; nothing is uploaded.
            </p>

            <div className="flex justify-end gap-2 border-t border-ink-600 pt-3">
              <button onClick={onClose} className="rounded px-3 py-1.5 text-xs text-muted hover:text-paper">
                Cancel
              </button>
              <button
                disabled={!p12File || !passphrase || status === 'signing'}
                onClick={handleSign}
                className="flex items-center gap-2 rounded bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-dim disabled:opacity-40"
              >
                {status === 'signing' && <Loader2 size={13} className="animate-spin" />}
                {status === 'signing' ? 'Signing…' : 'Sign & Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
