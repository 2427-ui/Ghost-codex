import { defineConfig } from '@playwright/test'
export default defineConfig({ testDir: './tests/desktop', timeout: 180000, workers: 1, reporter: 'list', expect: { timeout: 15000 }, use: { trace: 'retain-on-failure' } })
