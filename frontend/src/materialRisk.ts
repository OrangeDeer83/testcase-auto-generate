import type { ChatMessage, ClarificationQuestion, ImageRef, TestCase, UploadedMaterial } from './types'

/**
 * 這些係數是根據 2026-08-28 一次真實逾時事件回推的粗略估計（見 FIX_NOTES.md）：
 * 同一個對話，勾選 28 張圖片＋約 7.8 萬字文字內容時呼叫模型連續兩次都逾時
 * （超過 300 秒），拿掉全部圖片、只留文字後改成 88 秒內成功。不是精確測量值，
 * 只是為了在真的送出前抓出「明顯過量」的情況，不是精算模型實際會花多久——
 * 之後有更多真實案例，再回頭調整這幾個常數。
 */
const BASE_OVERHEAD_SECONDS = 15
const SECONDS_PER_1000_CHARS = 1
const SECONDS_PER_IMAGE = 10
export const OVERLOAD_THRESHOLD_SECONDS = 120

export interface MaterialRiskInput {
  materials: UploadedMaterial[]
  selectedMaterialIds: string[]
  testCases: TestCase[]
  chatLog: ChatMessage[]
}

function countImages(materials: UploadedMaterial[]): number {
  return materials.reduce((count, m) => {
    const own = m.kind === 'image' ? 1 : 0
    const embedded = m.embedded_images?.length ?? 0
    return count + own + embedded
  }, 0)
}

function countTextChars(materials: UploadedMaterial[], testCases: TestCase[], chatLog: ChatMessage[]): number {
  const materialChars = materials.reduce(
    (sum, m) => sum + (m.text?.length ?? 0) + (m.description?.length ?? 0),
    0,
  )
  const testCaseChars = JSON.stringify(testCases).length
  const chatChars = chatLog.reduce((sum, entry) => sum + (entry.content?.length ?? 0), 0)
  return materialChars + testCaseChars + chatChars
}

function selectedMaterials(input: MaterialRiskInput): UploadedMaterial[] {
  return input.materials.filter((m) => input.selectedMaterialIds.includes(m.id))
}

/** 粗估這次呼叫模型大概要花幾秒，只用來判斷「是否明顯過量」，不是精確預測。 */
export function estimateProcessingSeconds(input: MaterialRiskInput): number {
  const selected = selectedMaterials(input)
  const imageCount = countImages(selected)
  const textChars = countTextChars(selected, input.testCases, input.chatLog)
  return BASE_OVERHEAD_SECONDS + (textChars / 1000) * SECONDS_PER_1000_CHARS + imageCount * SECONDS_PER_IMAGE
}

export function isOverloaded(input: MaterialRiskInput): boolean {
  return estimateProcessingSeconds(input) > OVERLOAD_THRESHOLD_SECONDS
}

const TESTCASE_INDEX_PATTERN = /第\s*(\d+)\s*[條筆則]/

function findReferencedTestCase(draftMessage: string, testCases: TestCase[]): TestCase | undefined {
  const indexMatch = draftMessage.match(TESTCASE_INDEX_PATTERN)
  if (indexMatch) {
    const index = Number(indexMatch[1]) - 1
    if (testCases[index]) return testCases[index]
  }
  return testCases.find((tc) => tc.name && draftMessage.includes(tc.name))
}

/**
 * 找出目前勾選、但看起來跟這則訊息無關的圖片類素材，方便使用者快速取消勾選來
 * 縮小這次請求的內容量。只有在訊息裡能明確判斷出「指的是哪一筆測試用例」時
 * 才會給建議（用該用例的 based_on_images 反查哪些素材真的有關聯）——判斷不出來
 * 就完全不建議任何項目，不要用猜的排除掉可能真的需要的素材。
 */
export function findLikelyUnrelatedImageMaterials(
  draftMessage: string,
  materials: UploadedMaterial[],
  selectedMaterialIds: string[],
  testCases: TestCase[],
  imageMap: Map<number, ImageRef>,
): UploadedMaterial[] {
  const selectedImageMaterials = materials.filter(
    (m) => selectedMaterialIds.includes(m.id) && (m.kind === 'image' || (m.embedded_images?.length ?? 0) > 0),
  )
  if (selectedImageMaterials.length === 0) return []

  const referencedCase = findReferencedTestCase(draftMessage, testCases)
  if (!referencedCase) return []

  const relevantMaterialIds = new Set(
    referencedCase.based_on_images
      .map((num) => imageMap.get(num)?.material_id)
      .filter((id): id is string => !!id),
  )

  return selectedImageMaterials.filter((m) => !relevantMaterialIds.has(m.id))
}

function stripExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.')
  return dotIndex > 0 ? filename.slice(0, dotIndex) : filename
}

/** 判斷一則問題的文字裡，有沒有提到某個素材的檔名（去除副檔名）或說明文字——
 * 只做字串比對，不理解語意，中文沒有空白分詞，這是唯一不用猜語意就能做的
 * 判斷方式。任何一邊少於 2 個字就不比對，避免太短的字串到處誤判命中。 */
function questionMentionsMaterial(questionText: string, material: UploadedMaterial): boolean {
  const candidates = [stripExtension(material.filename), material.description]
    .map((s) => s?.trim())
    .filter((s): s is string => !!s && s.length >= 2)
  return candidates.some((candidate) => questionText.includes(candidate))
}

/**
 * 找出目前「沒有勾選」、但看起來跟某個待確認問題有關的素材，提示使用者可能
 * 需要加進來才能回答這個問題。只用問題文字（question + context）跟素材的
 * 檔名／說明做字串比對，判斷不出語意，也不理解圖片實際內容——找不到明確的
 * 文字關聯就不建議任何項目，避免因為「感覺應該相關」就亂猜，誤導使用者。
 */
export function findLikelyRelevantUnselectedMaterials(
  question: ClarificationQuestion,
  materials: UploadedMaterial[],
  selectedMaterialIds: string[],
): UploadedMaterial[] {
  const questionText = `${question.question} ${question.context}`
  const unselected = materials.filter((m) => !selectedMaterialIds.includes(m.id))
  return unselected.filter((m) => questionMentionsMaterial(questionText, m))
}
