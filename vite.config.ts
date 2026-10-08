import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative base so the app works from any folder (e.g. GitHub Pages /repo-name/).
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Picture Word Books',
        short_name: 'Picture Books',
        description: 'Turn any children’s book into a picture-supported book: every word gets an AAC symbol.',
        theme_color: '#2f6fdb',
        background_color: '#fffaf2',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything the app needs offline: code, Mulberry symbols and the OCR engine.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,json,gz,webmanifest}'],
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname === 'static.arasaac.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'arasaac-images',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 20000 },
            },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
});
