import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Never serve API responses or Firebase reserved paths from the service worker cache
        navigateFallbackDenylist: [/^\/api\//, /^\/__\//],
        runtimeCaching: [
          {
            // API routes: always go to network, never cache
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
        ],
      },
      manifest: {
        name: 'LexIA',
        short_name: 'LexIA',
        description: 'Plataforma de IA',
        theme_color: '#1A2E5A',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'favicon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
});
