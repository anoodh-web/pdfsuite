import { useState, useRef, useEffect } from 'react';
import { User, LogOut, Settings, Mail } from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function UserMenu() {
  const { userProfile, signIn, signOut } = useDocumentStore();
  const [open, setOpen] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowSignIn(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSignIn = () => {
    if (!name.trim() || !email.trim()) return;
    signIn(name, email);
    setShowSignIn(false);
    setOpen(false);
    setName('');
    setEmail('');
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o);
          setShowSignIn(!userProfile);
        }}
        className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white hover:brightness-110"
        title={userProfile ? userProfile.name : 'Sign in'}
      >
        {userProfile ? getInitials(userProfile.name) : <User size={13} />}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-md border border-ink-500 bg-ink-700 shadow-2xl">
          {!userProfile || showSignIn ? (
            <div className="p-4">
              <div className="mb-3 text-xs font-medium text-paper">Sign in</div>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                className="mb-2 w-full rounded border border-ink-500 bg-ink-800 px-2.5 py-1.5 text-xs text-paper focus:outline-none"
              />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
                placeholder="Email address"
                type="email"
                className="mb-3 w-full rounded border border-ink-500 bg-ink-800 px-2.5 py-1.5 text-xs text-paper focus:outline-none"
              />
              <button
                disabled={!name.trim() || !email.trim()}
                onClick={handleSignIn}
                className="w-full rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-dim disabled:opacity-40"
              >
                Sign In
              </button>
              <p className="mt-2 text-[10px] leading-snug text-muted">
                This just personalizes the app locally in your browser (e.g. your
                name auto-fills as signer on signatures) — it isn't a secured
                account and doesn't verify your email.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-3 border-b border-ink-600 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">
                  {getInitials(userProfile.name)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-paper">
                    {userProfile.name}
                  </div>
                  <div className="flex items-center gap-1 truncate text-xs text-muted">
                    <Mail size={11} /> {userProfile.email}
                  </div>
                </div>
              </div>
              <div className="p-1.5">
                <button
                  onClick={() => setShowSignIn(true)}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs text-paper/90 hover:bg-ink-600"
                >
                  <Settings size={13} /> Account / Preferences
                </button>
                <button
                  onClick={() => {
                    signOut();
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs text-signal-danger hover:bg-ink-600"
                >
                  <LogOut size={13} /> Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
