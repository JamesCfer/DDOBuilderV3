import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

function readVersion(): string {
  // V3's version is the most recently MERGED PR number — every merge to main
  // is a squash commit whose subject ends in "(#NNN)". Scan recent history so
  // work-in-progress commits on a feature branch don't hide it.
  try {
    const subjects = execSync('git log -50 --pretty=%s', {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString()
    const m = subjects.match(/\(#(\d+)\)/)
    if (m) return `#${m[1]}`
  } catch { /* not a git checkout — fall through */ }
  // webapp/VERSION is COMMITTED and updated with each PR, so deployments
  // without git metadata (zip downloads, Docker contexts that exclude .git,
  // standalone webapp/ deploys) still get a real version.
  for (const file of [path.resolve(__dirname, 'VERSION'), path.resolve(__dirname, '..', 'VERSION')]) {
    try {
      const v = fs.readFileSync(file, 'utf-8').trim()
      if (v) return v
    } catch { /* try next */ }
  }
  return 'unknown'
}

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILDER_VERSION__: JSON.stringify(readVersion()),
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
