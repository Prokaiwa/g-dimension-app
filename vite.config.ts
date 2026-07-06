import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// PWA / service worker.
// Goal: make gdimension.app installable ("Add to Home Screen" -> real app icon,
// full-screen) and give Android its native install prompt, which requires a
// service worker with a fetch handler. Configured conservatively on purpose:
//
//  - manifest: false        -> keep the existing hand-written
//                              public/manifest.webmanifest + its <link> in
//                              index.html; the plugin only owns the SW.
//  - injectRegister: null   -> we register the SW manually from src/main.tsx via
//                              `virtual:pwa-register` (bundled module, script-src
//                              'self'), so NO inline <script> is added and the
//                              CSP hash allowlist in vercel.json stays untouched.
//  - precache only small shell assets (not the big lazy route/lib chunks) so the
//                              carefully code-split first load isn't undone;
//                              JS/CSS is runtime-cached as requested instead.
//  - autoUpdate + cleanupOutdatedCaches keep it compatible with the existing
//                              stale-chunk recovery in src/lib/chunkReload.ts
//                              (hashed chunk names mean a new deploy requests new
//                              URLs, so StaleWhileRevalidate never serves stale JS).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      manifest: false,
      includeAssets: [],
      workbox: {
        // Precache only the light app shell + icons — never the heavy chunks
        // (transformers, heic-to, jspdf) so install stays fast.
        globPatterns: ['**/*.{css,ico,svg,woff2,webmanifest}', 'index.html'],
        maximumFileSizeToCacheInBytes: 600 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        inlineWorkboxRuntime: true,
        // CRITICAL: "/" is served the static marketing page (public/marketing.html)
        // by Vercel, NOT the SPA. Empty directoryIndex stops the precached
        // index.html from being served for "/" (workbox would otherwise append
        // "index.html" to the "/" request and match it), and the /^\/$/ denylist
        // entry stops navigateFallback from doing the same. Without both,
        // SW-controlled visitors would get the SPA shell at "/" and RootRedirect
        // could loop. (The option is typed string, so '' — not false — disables it.)
        directoryIndex: '',
        navigateFallback: '/index.html',
        // Never hijack these with the SPA shell — let them hit the network so the
        // marketing page ("/"), the per-build OG injector (api/og.js), the
        // sitemaps, and files with extensions resolve normally.
        navigateFallbackDenylist: [
          /^\/$/,
          /^\/api\//,
          /^\/builds\//,
          /^\/sitemap/,
          /^\/marketing/,
          /\.[^/]+$/,
        ],
        runtimeCaching: [
          {
            urlPattern: ({ request }) =>
              request.destination === 'script' || request.destination === 'style',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'gdim-assets' },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
})
