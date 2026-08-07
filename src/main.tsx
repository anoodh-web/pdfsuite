import './buffer-polyfill';

// Set the theme attribute synchronously, before React mounts, so there's no
// flash of the wrong theme on load (the store's own loadTheme() runs after
// this but reads the same localStorage key, so they stay in sync).
try {
  const saved = localStorage.getItem('pdfsuite:theme');
  document.documentElement.setAttribute('data-theme', saved === 'light' ? 'light' : 'dark');
} catch {
  document.documentElement.setAttribute('data-theme', 'dark');
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
