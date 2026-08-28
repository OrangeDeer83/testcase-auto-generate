import { describe, expect, it } from 'vitest'

import {
  OVERLOAD_THRESHOLD_SECONDS,
  estimateProcessingSeconds,
  findLikelyUnrelatedImageMaterials,
  isOverloaded,
} from './materialRisk'
import type { ChatMessage, ImageRef, TestCase, UploadedMaterial } from './types'

function makeTextMaterial(overrides: Partial<UploadedMaterial> = {}): UploadedMaterial {
  return {
    id: crypto.randomUUID(),
    filename: 'spec.xlsx',
    kind: 'text',
    text: '',
    description: '',
    ...overrides,
  }
}

function makeImageMaterial(overrides: Partial<UploadedMaterial> = {}): UploadedMaterial {
  return {
    id: crypto.randomUUID(),
    filename: 'shot.png',
    kind: 'image',
    image_data_url: 'data:image/png;base64,AAA',
    description: '',
    ...overrides,
  }
}

function makeCase(overrides: Partial<TestCase> = {}): TestCase {
  return {
    id: crypto.randomUUID(),
    name: '登入成功',
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

describe('estimateProcessingSeconds / isOverloaded', () => {
  it('少量文字、沒有圖片時，估計時間在門檻以內', () => {
    const material = makeTextMaterial({ text: 'a'.repeat(1000) })
    const input = {
      materials: [material],
      selectedMaterialIds: [material.id],
      testCases: [],
      chatLog: [] as ChatMessage[],
    }

    expect(estimateProcessingSeconds(input)).toBeLessThan(OVERLOAD_THRESHOLD_SECONDS)
    expect(isOverloaded(input)).toBe(false)
  })

  it('重現 2026-08-28 實際逾時事件的素材組合，估計結果會判定為過量', () => {
    // 28 張圖片 + 約 7.8 萬字文字內容（52k 素材文字 + 25k 既有用例 JSON），
    // 對應真實發生過的逾時事件。
    const textMaterial = makeTextMaterial({ text: 'a'.repeat(52000) })
    const imageMaterials = Array.from({ length: 28 }, () => makeImageMaterial())
    const testCases = Array.from({ length: 48 }, () => makeCase({ notes: 'b'.repeat(500) }))

    const input = {
      materials: [textMaterial, ...imageMaterials],
      selectedMaterialIds: [textMaterial.id, ...imageMaterials.map((m) => m.id)],
      testCases,
      chatLog: [] as ChatMessage[],
    }

    expect(isOverloaded(input)).toBe(true)
  })

  it('拿掉圖片、只留同一份文字內容時，不再判定為過量（對應實測拿掉圖片後成功的情況）', () => {
    const textMaterial = makeTextMaterial({ text: 'a'.repeat(52000) })
    const testCases = Array.from({ length: 48 }, () => makeCase({ notes: 'b'.repeat(500) }))

    const input = {
      materials: [textMaterial],
      selectedMaterialIds: [textMaterial.id],
      testCases,
      chatLog: [] as ChatMessage[],
    }

    expect(isOverloaded(input)).toBe(false)
  })

  it('未勾選的素材不計入估算', () => {
    const selected = makeTextMaterial({ text: 'a'.repeat(500) })
    const unselected = makeTextMaterial({ text: 'a'.repeat(200000) })
    const input = {
      materials: [selected, unselected],
      selectedMaterialIds: [selected.id],
      testCases: [],
      chatLog: [] as ChatMessage[],
    }

    expect(estimateProcessingSeconds(input)).toBeLessThan(OVERLOAD_THRESHOLD_SECONDS)
  })
})

describe('findLikelyUnrelatedImageMaterials', () => {
  it('訊息看不出指的是哪一筆用例時，不建議任何項目', () => {
    const image = makeImageMaterial()
    const result = findLikelyUnrelatedImageMaterials(
      '幫我新增一筆測試用例',
      [image],
      [image.id],
      [makeCase({ name: '登入成功' })],
      new Map<number, ImageRef>(),
    )

    expect(result).toEqual([])
  })

  it('訊息用「第N條」指名某筆用例時，只把該用例沒引用到的圖片列為可能無關', () => {
    const relatedImage = makeImageMaterial({ filename: 'related.png' })
    const unrelatedImage = makeImageMaterial({ filename: 'unrelated.png' })
    const testCases = [makeCase({ name: '用例A', based_on_images: [1] })]
    const imageMap = new Map<number, ImageRef>([
      [1, { number: 1, material_id: relatedImage.id, filename: relatedImage.filename, url: '' }],
    ])

    const result = findLikelyUnrelatedImageMaterials(
      '第1條用例幫我補充細節',
      [relatedImage, unrelatedImage],
      [relatedImage.id, unrelatedImage.id],
      testCases,
      imageMap,
    )

    expect(result).toEqual([unrelatedImage])
  })

  it('訊息直接提到用例名稱時，也能正確判斷關聯', () => {
    const relatedImage = makeImageMaterial({ filename: 'related.png' })
    const unrelatedImage = makeImageMaterial({ filename: 'unrelated.png' })
    const testCases = [makeCase({ name: '登入失敗顯示錯誤訊息', based_on_images: [2] })]
    const imageMap = new Map<number, ImageRef>([
      [2, { number: 2, material_id: relatedImage.id, filename: relatedImage.filename, url: '' }],
    ])

    const result = findLikelyUnrelatedImageMaterials(
      '幫我根據「登入失敗顯示錯誤訊息」這筆用例補充邊界值測試',
      [relatedImage, unrelatedImage],
      [relatedImage.id, unrelatedImage.id],
      testCases,
      imageMap,
    )

    expect(result).toEqual([unrelatedImage])
  })

  it('沒有勾選任何圖片類素材時回傳空陣列', () => {
    const textMaterial = makeTextMaterial()
    const result = findLikelyUnrelatedImageMaterials(
      '第1條用例',
      [textMaterial],
      [textMaterial.id],
      [makeCase({ based_on_images: [1] })],
      new Map<number, ImageRef>(),
    )

    expect(result).toEqual([])
  })
})
