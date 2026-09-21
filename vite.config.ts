import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: { auth: ['@supabase/supabase-js'] }
      }
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['mark.svg'],
      manifest: {
        name: 'Open Request Workbench',
        short_name: 'OpenRequest',
        description: 'A private, local-first API workbench.',
        theme_color: '#111318',
        background_color: '#111318',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,woff2}']
      }
    })
  ]
})
