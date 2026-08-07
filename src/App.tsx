import { useEffect } from 'react';
import Ribbon from './components/Ribbon';
import ThumbnailRail from './components/ThumbnailRail';
import DocumentTabs from './components/DocumentTabs';
import Canvas from './components/Canvas';
import RightPanel from './components/RightPanel';
import StatusBar from './components/StatusBar';
import PasswordPrompt from './components/PasswordPrompt';
import BottomDock from './components/BottomDock';
import { useDocumentStore } from './store/useDocumentStore';

export default function App() {
  const theme = useDocumentStore((s) => s.theme);

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
    </div>
  );
}
