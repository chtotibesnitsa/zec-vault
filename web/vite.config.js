import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

// Dev only: /render.html path-traces the 3D objects and POSTs each finished
// image here, which writes it to public/renders/. The site ships the images.
const saveRenders = {
  name: 'save-renders',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__render/save', (req, res) => {
      const name = new URL(req.url, 'http://x').searchParams.get('name') || '';
      if (req.method !== 'POST' || !/^[a-z0-9-]+\.(webp|png|json)$/.test(name)) {
        res.statusCode = 400;
        return res.end('bad request');
      }
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const dir = resolve(__dirname, 'public/renders');
        mkdirSync(dir, { recursive: true });
        writeFileSync(resolve(dir, name), Buffer.concat(chunks));
        res.end('ok');
      });
    });
  },
};

// Pages: the site, the launch trailer (/trailer.html) and the ads (/ad.html, /ad2.html).
export default defineConfig({
  plugins: [react(), saveRenders],
  build: {
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), trailer: resolve(__dirname, 'trailer.html'), ad: resolve(__dirname, 'ad.html'), ad2: resolve(__dirname, 'ad2.html') },
    },
  },
});
