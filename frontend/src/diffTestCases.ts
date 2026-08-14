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
