import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The 3D stage chunk is three.js itself (~295 kB gzip). It is already lazy-loaded behind the countdown.
  build: { chunkSizeWarningLimit: 1200 },
})
