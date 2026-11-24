import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readBuildInfo } from './src/server/buildInfo'

const buildInfo = readBuildInfo(__dirname)

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILDER_VERSION__: JSON.stringify(buildInfo.version),
    __BUILDER_RELEASE__: JSON.stringify(buildInfo.release ?? ''),
    __BUILDER_UPDATED__: JSON.stringify(buildInfo.updated ?? ''),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Icon assets (DdoIcon) are served by the Express API server; without
      // this proxy the dev server answers /images/* with index.html and every
      // icon falls back to its two-letter placeholder.
      '/images': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
