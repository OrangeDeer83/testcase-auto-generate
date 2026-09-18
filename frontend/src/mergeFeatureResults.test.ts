import { describe, expect, it } from 'vitest'

import { mergeFeatureResults } from './mergeFeatureResults'
import type { GenerationResult, TestCase } from './types'

function makeCase(name: string): TestCase {
  return {
    id: crypto.randomUUID(),
    name,
    module: '',
    preconditions: '',
    steps: [],
    priority: 'P0',
    notes: '',
    locked: false,
    based_on_images: [],
  }
}

function makeResult(overrides: Partial<GenerationResult> = {}): GenerationResult {
  return {
    test_cases: [],
    clarification_questions: [],
    result_version: 99,
    pending_changes: [{ id: 'x', action: 'add', data: null }],
    ...overrides,
  }
}

describe('mergeFeatureResults', () => {
  it('沒有任何功能結果時回傳空清單', () => {
    expect(mergeFeatureResults([])).toEqual({
      test_cases: [],
      clarification_questions: [],
      result_version: 0,
      pending_changes: [],
    })
  })

  it('依序串接每個功能的 test_cases 與 clarification_questions', () => {
    const a = makeResult({
      test_cases: [makeCase('A1'), makeCase('A2')],
      clarification_questions: [{ id: 'qa', question: '問題A', context: '' }],
    })
    const b = makeResult({
      test_cases: [makeCase('B1')],
      clarification_questions: [{ id: 'qb', question: '問題B', context: '' }],
    })

    const merged = mergeFeatureResults([a, b])

    expect(merged.test_cases.map((tc) => tc.name)).toEqual(['A1', 'A2', 'B1'])
    expect(merged.clarification_questions.map((q) => q.id)).toEqual(['qa', 'qb'])
  })

  it('合併結果一律視為對話第一次產生用例：result_version 固定為 0、不帶入任何 pending_changes', () => {
    const merged = mergeFeatureResults([makeResult(), makeResult()])

    expect(merged.result_version).toBe(0)
    expect(merged.pending_changes).toEqual([])
  })
})
