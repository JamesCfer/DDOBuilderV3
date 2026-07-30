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
  try {
    const v = fs.readFileSync(path.resolve(__dirname, '..', 'VERSION'), 'utf-8').trim()
    if (v) return v
  } catch { /* no VERSION file either */ }
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
    },
  },
  build: {
    outDir: 'dist',
  },
})
