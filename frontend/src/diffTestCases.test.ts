import { describe, expect, it } from 'vitest'

import { diffTestCases, getChangedCellKeys, getPreviousValues } from './diffTestCases'
import type { TestCase } from './types'

function makeCase(overrides: Partial<TestCase> = {}): TestCase {
  return {
    id: crypto.randomUUID(),
    name: '登入成功',
    module: '/登入功能',
    preconditions: '使用者已註冊帳號',
    steps: [
      { step_no: 1, description: '輸入帳號密碼', expected_result: '欄位顯示已輸入內容' },
      { step_no: 2, description: '點擊登入按鈕', expected_result: '導向首頁' },
    ],
    priority: 'P0',
    notes: '',
    locked: false,
    based_on_images: [],
    ...overrides,
  }
}

describe('diffTestCases', () => {
  it('回傳空陣列當前後完全一樣', () => {
    const before = [makeCase()]
    const after = [makeCase()]

    expect(diffTestCases(before, after)).toEqual([])
  })

  it('偵測新增用例', () => {
    const before: TestCase[] = []
    const after = [makeCase({ name: '新用例' })]

    expect(diffTestCases(before, after)).toEqual(['新增用例「新用例」'])
  })

  it('偵測刪除用例', () => {
    const before = [makeCase({ name: '舊用例' })]
    const after: TestCase[] = []

    expect(diffTestCases(before, after)).toEqual(['刪除用例「舊用例」'])
  })

  it('偵測優先級變更並顯示前後值', () => {
    const before = [makeCase({ priority: 'P0' })]
    const after = [makeCase({ priority: 'P1' })]

    expect(diffTestCases(before, after)).toEqual(['「登入成功」優先級從 P0 改成 P1'])
  })

  it('偵測步驟數量變化', () => {
    const before = [makeCase()]
    const after = [
      makeCase({
        steps: [
          { step_no: 1, description: '輸入帳號密碼', expected_result: '欄位顯示已輸入內容' },
          { step_no: 2, description: '點擊登入按鈕', expected_result: '導向首頁' },
          { step_no: 3, description: '確認歡迎訊息', expected_result: '顯示使用者名稱' },
        ],
      }),
    ]

    expect(diffTestCases(before, after)).toEqual(['「登入成功」新增了 1 個步驟'])
  })

  it('偵測特定步驟內容變化並回報步驟編號', () => {
    const before = [makeCase()]
    const after = [
      makeCase({
        steps: [
          { step_no: 1, description: '輸入帳號密碼', expected_result: '欄位顯示已輸入內容' },
          { step_no: 2, description: '點擊登入按鈕（改版後的新按鈕文字）', expected_result: '導向首頁' },
        ],
      }),
    ]

    expect(diffTestCases(before, after)).toEqual(['「登入成功」步驟 2 的內容有調整'])
  })

  it('用例改名時視為刪除舊的+新增新的（已知限制：依名稱配對）', () => {
    const before = [makeCase({ name: '舊名稱' })]
    const after = [makeCase({ name: '新名稱' })]

    const changes = diffTestCases(before, after)

    expect(changes).toContain('新增用例「新名稱」')
    expect(changes).toContain('刪除用例「舊名稱」')
  })
})

describe('getChangedCellKeys', () => {
  it('整筆新增的用例回傳 case:<index> key', () => {
    const keys = getChangedCellKeys([], [makeCase()])

    expect(keys.has('case:0')).toBe(true)
  })

  it('欄位變更回傳對應的 case:<index>:<field> key', () => {
    const before = [makeCase({ priority: 'P0', notes: '' })]
    const after = [makeCase({ priority: 'P1', notes: '補充說明' })]

    const keys = getChangedCellKeys(before, after)

    expect(keys.has('case:0:priority')).toBe(true)
    expect(keys.has('case:0:notes')).toBe(true)
    expect(keys.has('case:0:module')).toBe(false)
  })

  it('步驟描述變更回傳對應的 step key', () => {
    const before = [makeCase()]
    const after = [
      makeCase({
        steps: [
          { step_no: 1, description: '輸入帳號密碼', expected_result: '欄位顯示已輸入內容' },
          { step_no: 2, description: '點擊新版登入按鈕', expected_result: '導向首頁' },
        ],
      }),
    ]

    const keys = getChangedCellKeys(before, after)

    expect(keys.has('case:0:step:1:description')).toBe(true)
    expect(keys.has('case:0:step:0:description')).toBe(false)
  })
})

describe('getPreviousValues', () => {
  it('記錄變更前的欄位值供畫面顯示舊值', () => {
    const before = [makeCase({ priority: 'P0' })]
    const after = [makeCase({ priority: 'P1' })]

    const values = getPreviousValues(before, after)

    expect(values.get('case:0:priority')).toBe('P0')
  })

  it('整筆新增的用例沒有舊值可顯示', () => {
    const values = getPreviousValues([], [makeCase()])

    expect(values.size).toBe(0)
  })
})
