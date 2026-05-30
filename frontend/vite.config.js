/* global process */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)))

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const defaultBasePath = repositoryName ? `/${repositoryName}/` : '/BrushBeats/'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || defaultBasePath,
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version)
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
})
