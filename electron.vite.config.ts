import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const patchedPurifier = join(dirname(require.resolve('dompurify')), 'purify.es.mjs')

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()], build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } } },
  renderer: { plugins: [{
    name: 'monaco-patched-dompurify', enforce: 'pre',
    resolveId(source, importer) {
      if (source.endsWith('/dompurify/dompurify.js') && importer?.replaceAll('\\', '/').includes('/monaco-editor/')) return patchedPurifier
    }
  }, react(), tailwindcss()] }
})
