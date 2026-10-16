import { defineConfig, devices } from '@playwright/test'

// Expects the backend on :8000 and the Vite dev server on :5173 (see README), or starts them.
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /smoke/ },
  ],
  webServer: [
    {
      command: process.platform === 'win32' ? '..\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000 --app-dir ../backend' : '../backend/.venv/bin/python -m uvicorn app.main:app --port 8000 --app-dir ../backend',
      url: 'http://127.0.0.1:8000/api/health',
      reuseExistingServer: true,
    },
    { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true },
  ],
})
