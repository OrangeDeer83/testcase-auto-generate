import { expect, test } from '@playwright/test'

test('建立專案 → 新增素材 → 產生測試用例 → 匯出 Excel', async ({ page }) => {
  const projectName = `E2E 測試專案 ${Date.now()}`

  await page.goto('/')
  await page.getByPlaceholder('專案名稱，例如：登入模組').fill(projectName)
  await page.getByRole('button', { name: '建立專案' }).click()

  // 建立完會導到這個專案的素材庫頁（ProjectLayout 的 index route）
  await expect(page.getByRole('heading', { name: '素材庫' })).toBeVisible()

  // 側欄開新對話，會直接導到那個對話的工作區
  await page.getByRole('button', { name: '開新對話' }).click()
  await expect(page.getByRole('heading', { name: '選擇要使用的素材' })).toBeVisible()

  // 貼文字新增素材：會自動加進專案素材庫，並自動勾選給這個對話用
  await page
    .getByPlaceholder('貼上文字新增素材…也可以直接貼上截圖（Ctrl+V）')
    .fill('使用者輸入帳號密碼登入系統，登入成功後應導向首頁。')
  await page.getByRole('button', { name: '加入', exact: true }).click()

  const generateButton = page.getByRole('button', { name: '開始產生測試用例' })
  await expect(generateButton).toBeEnabled()
  await generateButton.click()

  // 假 LLM（e2e/mock-llm/server.py）固定回傳一筆「登入成功」的測試用例。
  // 產生按鈕會先顯示「產生中…」，實際跑完一輪 prompt 組裝＋LLM 呼叫＋
  // 解析回應可能超過預設的 5s，這裡放寬一點等待時間。
  await expect(page.locator('.case-card')).toHaveCount(1, { timeout: 15_000 })
  await expect(page.locator('.case-card input.name-input')).toHaveValue('登入成功')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出 Excel' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('testcases.xlsx')
})
