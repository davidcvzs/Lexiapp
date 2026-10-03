import { defineConfig, loadEnv } from 'vite';
import { validateFrontendEnvironment } from './server/config/environment.ts';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const errors = validateFrontendEnvironment({ ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env });
    if (errors.length) throw new Error(errors.join('\n'));
  }
  return {
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
        navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/__(?:\/|$)/],
        runtimeCaching: [
          {
            // API routes: always go to network, never cache
            urlPattern: ({ url }) => url.pathname === '/api' || url.pathname.startsWith('/api/'),
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
}; });
