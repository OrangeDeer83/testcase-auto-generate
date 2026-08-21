import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const repoRoot = path.resolve(__dirname, '..')
const backendDir = path.join(repoRoot, 'backend')
const frontendDir = path.join(repoRoot, 'frontend')

// 本機開發用 backend/.venv 跑；CI（見 .github/workflows/ci.yml 的 e2e job）
// 是直接把套件裝進系統 Python，沒有 venv，這裡就退回吃 PATH 上的 python。
const venvPython =
  process.platform === 'win32'
    ? path.join(backendDir, '.venv', 'Scripts', 'python.exe')
    : path.join(backendDir, '.venv', 'bin', 'python')
const backendPython = fs.existsSync(venvPython) ? venvPython : 'python'

const MOCK_LLM_PORT = 8090
const BACKEND_PORT = 8099
const FRONTEND_PORT = 4173

const reuseExistingServer = !process.env.CI

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${FRONTEND_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // 假 LLM，回傳固定的測試用例 JSON，不需要連公司內部的真實模型
      command: `"${backendPython}" mock-llm/server.py`,
      cwd: __dirname,
      env: { PORT: String(MOCK_LLM_PORT) },
      url: `http://127.0.0.1:${MOCK_LLM_PORT}/health`,
      reuseExistingServer,
      timeout: 20_000,
    },
    {
      command: `"${backendPython}" -m uvicorn app.main:app --port ${BACKEND_PORT}`,
      cwd: backendDir,
      env: {
        LLM_BASE_URL: `http://127.0.0.1:${MOCK_LLM_PORT}/v1`,
        LLM_API_KEY: 'test-key',
        LLM_MODEL: 'mock-model',
        CORS_ORIGINS: `http://127.0.0.1:${FRONTEND_PORT},http://localhost:${FRONTEND_PORT}`,
        // 獨立的暫存資料目錄，跑完即丟，不會跟開發時手動啟動的 backend
        // 寫進同一份 backend/data。
        APP_DATA_DIR: path.join(__dirname, '.tmp-data'),
      },
      url: `http://127.0.0.1:${BACKEND_PORT}/health`,
      reuseExistingServer,
      timeout: 30_000,
    },
    {
      // 用 --mode e2e 讀 frontend/.env.e2e，把 API base URL 指到上面這個
      // 專用的 backend，不會受開發用的 frontend/.env 影響。
      command: `npm run dev -- --mode e2e --port ${FRONTEND_PORT} --strictPort`,
      cwd: frontendDir,
      url: `http://127.0.0.1:${FRONTEND_PORT}`,
      reuseExistingServer,
      timeout: 30_000,
    },
  ],
})
