import type { GenerationResult } from './types'

/** 把「依功能各自產生」的多個 GenerationResult 合併成一份，準備透過既有的
 * updateTestCases（PUT /test-cases）一次提交——這是對話第一次產生用例
 * （之前沒有 last_result），result_version 固定從 0 開始即可，跟原本
 * 單次 /generate 的行為一致。純函式，方便寫測試，不用啟動整個元件。 */
export function mergeFeatureResults(results: GenerationResult[]): GenerationResult {
  return {
    test_cases: results.flatMap((r) => r.test_cases),
    clarification_questions: results.flatMap((r) => r.clarification_questions),
    result_version: 0,
    pending_changes: [],
  }
}
