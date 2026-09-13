import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:8000' } },
  // OLA4: chunks independientes para no servir leaflet/vendor en diferido
  // dentro del bundle inicial. (Vite 8/Rolldown: advancedChunks en vez de manualChunks.)
  build: {
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: 'vendor', test: /node_modules[\\/](react|react-dom|react-router-dom|axios)[\\/]/ },
            { name: 'leaflet', test: /node_modules[\\/](leaflet|react-leaflet)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
  },
})
