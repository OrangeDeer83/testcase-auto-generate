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
      makeCase({ based_on_images: [1] }),
      makeCase({ based_on_images: [1, 2] }),
      makeCase({ based_on_images: [] }),
    ]

    const result = countMaterialUsage(testCases, imageMap)

    expect(result.get('material-a')).toBe(2)
    expect(result.get('material-b')).toBe(1)
  })

  it('同一筆用例引用同一個素材的多張圖片時，只算一次', () => {
    const imageMap = new Map<number, ImageRef>([
      [1, makeImageRef(1, 'material-a')],
      [2, makeImageRef(2, 'material-a')],
    ])
    const testCases = [makeCase({ based_on_images: [1, 2] })]

    const result = countMaterialUsage(testCases, imageMap)

    expect(result.get('material-a')).toBe(1)
  })

  it('圖片編號在 imageMap 裡查不到時直接忽略，不會報錯', () => {
    const testCases = [makeCase({ based_on_images: [99] })]

    const result = countMaterialUsage(testCases, new Map())

    expect(result.size).toBe(0)
  })
})
