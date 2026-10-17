import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { copyFileSync } from 'node:fs';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      // Static hosts without SPA rewrite support serve 404s on deep links
      // (/memories, /memory/<id>, ...). Emitting a 404.html that loads the app
      // covers GitHub Pages-style hosts; most hosts (Netlify, Vercel, Bolt)
      // already fall back to index.html.
      name: 'spa-fallback',
      closeBundle() {
        copyFileSync('dist/index.html', 'dist/404.html');
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
