import type { ImageRef, TestCase } from './types'

/**
 * 精確計算每個素材被幾筆「目前」的測試用例引用過（based_on_images 反查回
 * material_id）——這是可以從既有資料直接算出來的事實，不是猜測。用來在素材
 * 選取畫面標示「已被引用」還是「尚未被引用」，幫助使用者判斷哪些素材目前
 * 看起來還沒真的用到、可以放心取消勾選來減少送給模型的內容量。
 *
 * 同一筆用例如果透過好幾個圖片編號引用到同一個素材（例如一份素材裡有好幾張
 * 內嵌截圖），只算一次，避免同一筆用例把同一個素材的引用次數灌水。
 */
export function countMaterialUsage(testCases: TestCase[], imageMap: Map<number, ImageRef>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const testCase of testCases) {
    const materialIds = new Set(
      testCase.based_on_images
        .map((num) => imageMap.get(num)?.material_id)
        .filter((id): id is string => !!id),
    )
    materialIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1))
  }
  return counts
}
