import type { TestCase } from './types'

function describeStepsDiff(before: TestCase, after: TestCase): string[] {
  const notes: string[] = []

  if (before.steps.length !== after.steps.length) {
    const delta = after.steps.length - before.steps.length
    notes.push(delta > 0 ? `新增了 ${delta} 個步驟` : `刪除了 ${-delta} 個步驟`)
    return notes
  }

  const changedStepNos = after.steps
    .filter((step, idx) => {
      const prev = before.steps[idx]
      return (
        !prev ||
        prev.description !== step.description ||
        prev.expected_result !== step.expected_result
      )
    })
    .map((step) => step.step_no)

  if (changedStepNos.length > 0) {
    notes.push(`步驟 ${changedStepNos.join('、')} 的內容有調整`)
  }

  return notes
}

/** 比對聊天前後的測試用例，回傳人類可讀的異動清單（依用例名稱配對，名稱不變就視為同一筆）。 */
export function diffTestCases(before: TestCase[], after: TestCase[]): string[] {
  const changes: string[] = []
  const beforeByName = new Map(before.map((tc) => [tc.name, tc]))
  const afterByName = new Map(after.map((tc) => [tc.name, tc]))

  for (const tc of after) {
    if (!beforeByName.has(tc.name)) {
      changes.push(`新增用例「${tc.name}」`)
    }
  }

  for (const tc of before) {
    if (!afterByName.has(tc.name)) {
      changes.push(`刪除用例「${tc.name}」`)
    }
  }

  for (const tc of after) {
    const prev = beforeByName.get(tc.name)
    if (!prev) continue

    const fieldNotes: string[] = []
    if (prev.priority !== tc.priority) {
      fieldNotes.push(`優先級從 ${prev.priority || '（空）'} 改成 ${tc.priority || '（空）'}`)
    }
    if (prev.preconditions !== tc.preconditions) {
      fieldNotes.push('前置條件已更新')
    }
    fieldNotes.push(...describeStepsDiff(prev, tc))

    if (fieldNotes.length > 0) {
      changes.push(`「${tc.name}」${fieldNotes.join('、')}`)
    }
  }

  return changes
}

/**
 * 比對聊天前後的測試用例，回傳「哪些具體儲存格變了」的 key 集合，供表格畫面上高亮顯示用。
 * key 是以 after 陣列（也就是聊天後、目前畫面在顯示的陣列）的索引為準：
 *   case:<caseIndex>                                整筆用例是新增的
 *   case:<caseIndex>:priority                        優先級變了
 *   case:<caseIndex>:preconditions                   前置條件變了
 *   case:<caseIndex>:step:<stepIndex>                 整個步驟是新增的
 *   case:<caseIndex>:step:<stepIndex>:description     步驟描述變了
 *   case:<caseIndex>:step:<stepIndex>:expected_result 預期結果變了
 */
export function getChangedCellKeys(before: TestCase[], after: TestCase[]): Set<string> {
  const keys = new Set<string>()
  const beforeByName = new Map(before.map((tc) => [tc.name, tc]))

  after.forEach((tc, caseIndex) => {
    const prev = beforeByName.get(tc.name)
    if (!prev) {
      keys.add(`case:${caseIndex}`)
      return
    }

    if (prev.priority !== tc.priority) keys.add(`case:${caseIndex}:priority`)
    if (prev.preconditions !== tc.preconditions) keys.add(`case:${caseIndex}:preconditions`)

    tc.steps.forEach((step, stepIndex) => {
      const prevStep = prev.steps[stepIndex]
      if (!prevStep) {
        keys.add(`case:${caseIndex}:step:${stepIndex}`)
        return
      }
      if (prevStep.description !== step.description) {
        keys.add(`case:${caseIndex}:step:${stepIndex}:description`)
      }
      if (prevStep.expected_result !== step.expected_result) {
        keys.add(`case:${caseIndex}:step:${stepIndex}:expected_result`)
      }
    })
  })

  return keys
}
