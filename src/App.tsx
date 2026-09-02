import { useEffect, useState } from 'react';
import Ribbon from './components/Ribbon';
import ThumbnailRail from './components/ThumbnailRail';
import DocumentTabs from './components/DocumentTabs';
import Canvas from './components/Canvas';
import RightPanel from './components/RightPanel';
import StatusBar from './components/StatusBar';
import PasswordPrompt from './components/PasswordPrompt';
import BottomDock from './components/BottomDock';
import Toast from './components/Toast';
import OnboardingPrompt from './components/OnboardingPrompt';
import FileAssociationHandler from './components/FileAssociationHandler';
import { useDocumentStore } from './store/useDocumentStore';

export default function App() {
  const theme = useDocumentStore((s) => s.theme);
  const userProfile = useDocumentStore((s) => s.userProfile);
  // "Skip for now" only dismisses it for this session — a genuinely fresh
  // launch (new browser session, or reopening the desktop app) with no
  // saved profile will show it again, matching "trigger immediately on
  // launch" rather than a one-time nag that can be permanently avoided.
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div className="flex h-screen flex-col bg-ink-900 font-ui text-paper">
      <Ribbon />
      <div className="flex min-h-0 flex-1">
        <ThumbnailRail />
        <div className="relative flex min-w-0 flex-1 flex-col">
          <DocumentTabs />
          <Canvas />
          <BottomDock />
        </div>
        <RightPanel />
      </div>
      <StatusBar />
      <PasswordPrompt />
      <Toast />
      <FileAssociationHandler />
      {!userProfile && !onboardingDismissed && (
        <OnboardingPrompt onDone={() => setOnboardingDismissed(true)} />
      )}
    </div>
  );
}
