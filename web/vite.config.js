import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Pages: the site, the launch trailer (/trailer.html) and the ads (/ad.html, /ad2.html).
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), trailer: resolve(__dirname, 'trailer.html'), ad: resolve(__dirname, 'ad.html'), ad2: resolve(__dirname, 'ad2.html') },
    },
  },
});
