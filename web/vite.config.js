import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Two pages: the site and the launch trailer (/trailer.html).
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), trailer: resolve(__dirname, 'trailer.html') },
    },
  },
});
