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

  // 初次產生用例先經過「功能拆分」的規劃步驟（見 FeatureBreakdownPanel）：
  // 假 LLM（e2e/mock-llm/server.py）看到 SYSTEM_PROMPT_FEATURE_BREAKDOWN
  // 特有的 material_filenames 欄位就會回傳一個涵蓋這份素材的功能，確認後
  // 才會針對這個功能呼叫 /generate-scoped 真正產生用例。
  await expect(page.getByRole('heading', { name: '確認功能拆分' })).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.feature-breakdown-card')).toHaveCount(1)
  await page.getByRole('button', { name: '確認，開始產生用例' }).click()

  // 功能拆分完成後對每個功能各自呼叫一次生成（同樣走假 LLM 固定回應），
  // 全部塵埃落定後按「完成」才會合併並提交，正式進入用例列表畫面。
  await expect(page.getByRole('button', { name: '完成' })).toBeEnabled({ timeout: 15_000 })
  await page.getByRole('button', { name: '完成' }).click()

  await expect(page.locator('.case-card')).toHaveCount(1, { timeout: 15_000 })
  await expect(page.locator('.case-card input.name-input')).toHaveValue('登入成功')

  // 匯出前要先鎖定審核，未鎖定的用例會擋下匯出（見「用例鎖定審核」功能）。
  // 按鈕的可及名稱來自可見文字「鎖定」/「已鎖定」，title 只是 tooltip，不算進 accessible name。
  await page.getByRole('button', { name: '鎖定', exact: true }).click()
  await expect(page.getByRole('button', { name: '已鎖定', exact: true })).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出 Excel' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('testcases.xlsx')
})
