import { describe, expect, it } from 'vitest'

import { extractStreamProgress } from './streamProgress'

describe('extractStreamProgress', () => {
  it('空字串回傳空陣列', () => {
    expect(extractStreamProgress('')).toEqual([])
  })

  it('抓出已經寫完的測試用例名稱', () => {
    const buffer = '{"test_cases": [{"id": "a", "name": "登入成功", "steps": ['
    expect(extractStreamProgress(buffer)).toEqual([{ kind: 'test_case', text: '登入成功' }])
  })

  it('還沒寫完（沒有結尾引號）的欄位不會被抓到', () => {
    const buffer = '{"test_cases": [{"id": "a", "name": "登入成'
    expect(extractStreamProgress(buffer)).toEqual([])
  })

  it('依序抓出多筆測試用例名稱', () => {
    const buffer =
      '{"test_cases": [{"name": "登入成功", "x": 1}, {"name": "登入失敗顯示錯誤訊息", "x": 2}]}'
    expect(extractStreamProgress(buffer)).toEqual([
      { kind: 'test_case', text: '登入成功' },
      { kind: 'test_case', text: '登入失敗顯示錯誤訊息' },
    ])
  })

  it('同時抓出測試用例名稱與澄清問題', () => {
    const buffer =
      '{"test_cases": [{"name": "登入成功"}], "clarification_questions": [{"id": "q1", "question": "逾時時間是多久？"'
    expect(extractStreamProgress(buffer)).toEqual([
      { kind: 'test_case', text: '登入成功' },
      { kind: 'question', text: '逾時時間是多久？' },
    ])
  })

  it('還原字串裡的跳脫字元（例如引號、換行）', () => {
    const buffer = String.raw`{"name": "包含 \"引號\" 的名稱"}`
    expect(extractStreamProgress(buffer)).toEqual([
      { kind: 'test_case', text: '包含 "引號" 的名稱' },
    ])
  })
})
