import { describe, expect, it } from 'vitest'

import { countMaterialUsage } from './materialUsage'
import type { ImageRef, TestCase } from './types'

function makeCase(overrides: Partial<TestCase> = {}): TestCase {
  return {
    id: crypto.randomUUID(),
    name: '',
    module: '',
    preconditions: '',
    steps: [],
    priority: 'P0',
    notes: '',
    locked: false,
    based_on_images: [],
    ...overrides,
  }
}

function makeImageRef(number: number, materialId: string): ImageRef {
  return { number, material_id: materialId, filename: `圖${number}.png`, url: '' }
}

describe('countMaterialUsage', () => {
  it('沒有任何用例時回傳空的 Map', () => {
    expect(countMaterialUsage([], new Map())).toEqual(new Map())
  })

  it('計算每個素材被幾筆用例引用', () => {
    const imageMap = new Map<number, ImageRef>([
      [1, makeImageRef(1, 'material-a')],
      [2, makeImageRef(2, 'material-b')],
    ])
    const testCases = [
      makeCase({ based_on_images: [1], locked: true }),
      makeCase({ based_on_images: [1, 2], locked: true }),
      makeCase({ based_on_images: [] }),
    ]

    const result = countMaterialUsage(testCases, imageMap)

    expect(result.get('material-a')?.total).toBe(2)
    expect(result.get('material-b')?.total).toBe(1)
  })

  it('同一筆用例引用同一個素材的多張圖片時，只算一次', () => {
    const imageMap = new Map<number, ImageRef>([
      [1, makeImageRef(1, 'material-a')],
      [2, makeImageRef(2, 'material-a')],
    ])
    const testCases = [makeCase({ based_on_images: [1, 2] })]

    const result = countMaterialUsage(testCases, imageMap)

    expect(result.get('material-a')?.total).toBe(1)
  })

  it('圖片編號在 imageMap 裡查不到時直接忽略，不會報錯', () => {
    const testCases = [makeCase({ based_on_images: [99] })]

    const result = countMaterialUsage(testCases, new Map())

    expect(result.size).toBe(0)
  })

  it('列出引用這個素材、但尚未鎖定的用例名稱', () => {
    const imageMap = new Map<number, ImageRef>([[1, makeImageRef(1, 'material-a')]])
    const testCases = [
      makeCase({ name: '已鎖定的用例', based_on_images: [1], locked: true }),
      makeCase({ name: '尚未鎖定的用例', based_on_images: [1], locked: false }),
    ]

    const result = countMaterialUsage(testCases, imageMap)

    expect(result.get('material-a')).toEqual({ total: 2, unlockedCaseNames: ['尚未鎖定的用例'] })
  })

  it('全部用例都已鎖定時，unlockedCaseNames 是空陣列', () => {
    const imageMap = new Map<number, ImageRef>([[1, makeImageRef(1, 'material-a')]])
    const testCases = [makeCase({ based_on_images: [1], locked: true })]

    const result = countMaterialUsage(testCases, imageMap)

    expect(result.get('material-a')?.unlockedCaseNames).toEqual([])
  })
})
