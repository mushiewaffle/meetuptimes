import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  build: {
    outDir: 'docs'
  },
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt', 'icons/*.png'],
      // skipWaiting + clientsClaim so a new build activates immediately
      // instead of waiting for the old service worker to release. The
      // previous default left users on stale cached bundles for hours
      // after a deploy — most notably making the map-revert change look
      // like the live site was still broken because the old JS bundle
      // (with FestivalMap modal + map-column references to a now-deleted
      // /edc-map-2026.jpg) kept being served from cache.
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'EDC 2026 · Find sets and meetup times with friends',
        short_name: 'EDC 2026',
        description: 'Pick your sets, share with friends, find your overlap and meetup windows for EDC Las Vegas 2026.',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        icons: [
          {
            src: 'icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})
