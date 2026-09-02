import { describe, expect, it } from 'vitest'

import {
  describeCaseFieldChanges,
  diffTestCases,
  getChangedCellKeys,
  getPreviousValues,
  getProposedFieldValues,
} from './diffTestCases'
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

  it('偵測新增用例，並附上該用例在聊天後清單裡的編號', () => {
    const before: TestCase[] = []
    const after = [makeCase({ name: '新用例' })]

    expect(diffTestCases(before, after)).toEqual(['第 1 筆・新增用例「新用例」'])
  })

  it('偵測刪除用例', () => {
    const before = [makeCase({ name: '舊用例' })]
    const after: TestCase[] = []

    expect(diffTestCases(before, after)).toEqual(['刪除用例「舊用例」'])
  })

  it('偵測優先級變更並顯示前後值，附上編號', () => {
    const before = [makeCase({ priority: 'P0' })]
    const after = [makeCase({ priority: 'P1' })]

    expect(diffTestCases(before, after)).toEqual(['第 1 筆・「登入成功」優先級從 P0 改成 P1'])
  })

  it('編號反映在聊天後清單裡的位置，不是固定第 1 筆', () => {
    const before = [makeCase({ name: '用例一' }), makeCase({ name: '用例二', priority: 'P0' })]
    const after = [makeCase({ name: '用例一' }), makeCase({ name: '用例二', priority: 'P1' })]

    expect(diffTestCases(before, after)).toEqual(['第 2 筆・「用例二」優先級從 P0 改成 P1'])
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

    expect(diffTestCases(before, after)).toEqual(['第 1 筆・「登入成功」新增了 1 個步驟'])
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

    expect(diffTestCases(before, after)).toEqual(['第 1 筆・「登入成功」步驟 2 的內容有調整'])
  })

  it('用例改名時視為刪除舊的+新增新的（已知限制：依名稱配對）', () => {
    const before = [makeCase({ name: '舊名稱' })]
    const after = [makeCase({ name: '新名稱' })]

    const changes = diffTestCases(before, after)

    expect(changes).toContain('第 1 筆・新增用例「新名稱」')
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

describe('describeCaseFieldChanges', () => {
  it('回傳空陣列當內容完全一樣', () => {
    const tc = makeCase()

    expect(describeCaseFieldChanges(tc, tc)).toEqual([])
  })

  it('偵測改名，即使是同一筆用例（用 id 配對，不靠名稱）', () => {
    const before = makeCase({ name: '舊名稱' })
    const after = makeCase({ ...before, name: '新名稱' })

    const changes = describeCaseFieldChanges(before, after)

    expect(changes).toContain('名稱從「舊名稱」改成「新名稱」')
  })

  it('偵測優先級變更', () => {
    const before = makeCase({ priority: 'P0' })
    const after = makeCase({ ...before, priority: 'P1' })

    expect(describeCaseFieldChanges(before, after)).toContain('優先級從 P0 改成 P1')
  })
})

describe('getProposedFieldValues', () => {
  it('回傳空 Map 當內容完全一樣', () => {
    const tc = makeCase()

    expect(getProposedFieldValues(tc, tc).size).toBe(0)
  })

  it('回傳有變動欄位的建議新值', () => {
    const current = makeCase({ priority: 'P0', notes: '' })
    const proposed = makeCase({ ...current, priority: 'P1', notes: '補充說明' })

    const values = getProposedFieldValues(current, proposed)

    expect(values.get('priority')).toBe('P1')
    expect(values.get('notes')).toBe('補充說明')
    expect(values.has('module')).toBe(false)
  })

  it('回傳有變動步驟的建議新值', () => {
    const current = makeCase()
    const proposed = makeCase({
      ...current,
      steps: [
        current.steps[0],
        { step_no: 2, description: '點擊新版登入按鈕', expected_result: '導向首頁' },
      ],
    })

    const values = getProposedFieldValues(current, proposed)

    expect(values.get('step:1:description')).toBe('點擊新版登入按鈕')
    expect(values.has('step:0:description')).toBe(false)
  })

  it('新增的步驟也回傳建議新值', () => {
    const current = makeCase({ steps: [makeCase().steps[0]] })
    const proposed = makeCase({
      ...current,
      steps: [...current.steps, { step_no: 2, description: '新步驟', expected_result: '新結果' }],
    })

    const values = getProposedFieldValues(current, proposed)

    expect(values.get('step:1:description')).toBe('新步驟')
    expect(values.get('step:1:expected_result')).toBe('新結果')
  })
})
