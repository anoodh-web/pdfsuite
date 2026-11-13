import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // node-forge / @signpdf packages check for the Node.js `global` object
    global: 'globalThis',
    // single source of truth for the version shown in About
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
