import { useState } from 'react';
import { User, Mail } from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';

export default function OnboardingPrompt({ onDone }: { onDone: () => void }) {
  const signIn = useDocumentStore((s) => s.signIn);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const handleContinue = () => {
    if (!name.trim() || !email.trim()) return;
    signIn(name, email);
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-96 rounded-lg border border-ink-500 bg-ink-800 shadow-2xl">
        <div className="flex flex-col items-center gap-3 border-b border-ink-600 px-6 py-6 text-center">
          <img src="/logo-64.png" alt="PDF Suite" className="h-12 w-12" />
          <div>
            <div className="text-xl font-bold text-accent">Welcome to PDF Suite</div>
            <p className="mt-1 text-xs text-muted">
              Let's get you set up — just your name and email to personalize the app.
            </p>
          </div>
        </div>

        <div className="space-y-3 p-6">
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted">
              <User size={12} /> Full name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full rounded border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-paper focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted">
              <Mail size={12} /> Email address
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
              type="email"
              placeholder="jane@company.com"
              className="w-full rounded border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-paper focus:outline-none"
            />
          </div>

          <button
            disabled={!name.trim() || !email.trim()}
            onClick={handleContinue}
            className="w-full rounded-md bg-accent py-2.5 text-sm font-medium text-white hover:bg-accent-dim disabled:opacity-40"
          >
            Get Started
          </button>

          <p className="text-center text-[10px] leading-snug text-muted">
            This personalizes the app locally in your browser (your name auto-fills as
            signer on signatures, and as Author on new documents) — it is not a secured
            account and nothing is sent to a server.
          </p>

          <button
            onClick={onDone}
            className="w-full text-center text-[11px] text-muted underline hover:text-paper"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
