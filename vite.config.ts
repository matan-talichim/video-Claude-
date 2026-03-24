import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    hmr: true,
    watch: {
      usePolling: true,
      ignored: [
        '**/server/uploads/**',
        '**/server/data/**',
        '**/server/assets/**',
        '**/edit-history.json',
        '**/reflections-history.json',
        '**/editor-brain.json',
        '**/learning-state.json',
        '**/eval_frames_*/**',
      ],
    },
  },
})
