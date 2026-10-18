import { defineConfig, devices } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'

// End-to-end tests run against their own backend (port 8001) with a throwaway data directory and
// their own Vite server (port 5174), so they never touch your development database.
const dataDir = path.join(os.tmpdir(), `rc-e2e-${Date.now()}`)
const python = JSON.stringify(path.resolve('..', 'backend', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'))

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 2, // more workers make cold Vite starts flaky on a laptop that also runs the dev servers
  reporter: 'list',
  use: { baseURL: 'http://localhost:5174', trace: 'retain-on-failure' },
  projects: [
    // Registers the first (admin) user on the empty test database and saves the signed-in session.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: 'e2e/.auth/admin.json' }, testIgnore: [/auth\.setup\.ts/, /test-mode/, /invoicing/], dependencies: ['setup'] },
    { name: 'mobile', use: { ...devices['Pixel 7'], storageState: 'e2e/.auth/admin.json' }, testMatch: /smoke/, dependencies: ['setup'] },
    // Test Mode and invoicing change the shared admin's plan, so they run one at a time after everything else.
    { name: 'test-mode', use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/admin.json' }, testMatch: /test-mode/, dependencies: ['desktop', 'mobile'] },
    { name: 'invoicing', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: 'e2e/.auth/admin.json' }, testMatch: /invoicing/, dependencies: ['test-mode'] },
  ],
  webServer: [
    {
      command: `${python} -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --app-dir ${JSON.stringify(path.resolve("..", "backend"))}`,
      url: 'http://127.0.0.1:8001/api/health',
      // Offline: never the model server or key from a local .env.
      env: { RC_DATA_DIR: dataDir, RC_WHISPER_ENABLED: 'false', RC_OLLAMA_URL: 'http://127.0.0.1:9', OLLAMA_API_KEY: '' },
      reuseExistingServer: false,
    },
    {
      command: 'npx vite --port 5174 --strictPort',
      url: 'http://localhost:5174',
      env: { RC_API_URL: 'http://127.0.0.1:8001' },
      reuseExistingServer: false,
    },
  ],
})
