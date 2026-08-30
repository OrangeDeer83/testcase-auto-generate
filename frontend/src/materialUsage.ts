import type { ImageRef, TestCase } from './types'

export interface MaterialUsage {
  /** 引用這個素材的用例總數。 */
  total: number
  /** 引用這個素材、且「已經鎖定」的用例名稱——鎖定機制會擋下任何改動，
   * 這些用例不受取消勾選素材影響，列出來讓使用者安心確認。 */
  lockedCaseNames: string[]
  /** 引用這個素材、但「目前沒有鎖定」的用例名稱——這些用例之後如果再跟模型
   * 對話，模型會失去這個素材的依據，可能因此重新提出疑問、或改動內容時
   * 無法再對照原始素材確認，需要使用者先確認過再決定要不要取消勾選。 */
  unlockedCaseNames: string[]
}

/**
 * 精確計算每個素材被幾筆「目前」的測試用例引用過（based_on_images 反查回
 * material_id）——這是可以從既有資料直接算出來的事實，不是猜測。用來在素材
 * 選取畫面標示「已被引用」還是「尚未被引用」，幫助使用者判斷哪些素材目前
 * 看起來還沒真的用到、可以放心取消勾選來減少送給模型的內容量；也用來在
 * 使用者想取消勾選「有未鎖定用例在用」的素材時提出警示。
 *
 * 同一筆用例如果透過好幾個圖片編號引用到同一個素材（例如一份素材裡有好幾張
 * 內嵌截圖），只算一次，避免同一筆用例把同一個素材的引用次數灌水。
 */
export function countMaterialUsage(testCases: TestCase[], imageMap: Map<number, ImageRef>): Map<string, MaterialUsage> {
  const usage = new Map<string, MaterialUsage>()
  for (const testCase of testCases) {
    const materialIds = new Set(
      testCase.based_on_images
        .map((num) => imageMap.get(num)?.material_id)
        .filter((id): id is string => !!id),
    )
    materialIds.forEach((id) => {
      const entry = usage.get(id) ?? { total: 0, lockedCaseNames: [], unlockedCaseNames: [] }
      entry.total += 1
      const name = testCase.name || '（未命名用例）'
      if (testCase.locked) entry.lockedCaseNames.push(name)
      else entry.unlockedCaseNames.push(name)
      usage.set(id, entry)
    })
  }
  return usage
}
