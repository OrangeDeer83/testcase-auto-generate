export interface TestStep {
  step_no: number
  description: string
  expected_result: string
}

export interface TestCase {
  id: string
  name: string
  module: string
  preconditions: string
  steps: TestStep[]
  priority: string
  notes: string
  locked: boolean
  based_on_images: number[]
}

export interface ImageRef {
  number: number
  material_id: string
  filename: string
  url: string
}

export interface ClarificationQuestion {
  id: string
  question: string
  context: string
}

export interface GenerationResult {
  test_cases: TestCase[]
  clarification_questions: ClarificationQuestion[]
  result_version: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  context?: string
  materialId?: string
  imageUrl?: string
  questions?: ClarificationQuestion[]
  /** 這則助手訊息是不是一次失敗的回報（例如模型逾時、連線失敗）——true 的話
   * 畫面上要用醒目的警示樣式顯示，讓使用者在浮動聊天視窗裡就能直接看到「這次
   * 沒有成功」，不用另外去頁面上方找一閃即逝、容易被浮動視窗擋住的錯誤訊息。 */
  isError?: boolean
  /** 這則使用者訊息送出時，是不是限定只針對某幾筆測試用例（見「針對已選用例
   * 提問」）——有值時顯示這幾筆用例的編號／名稱，讓之後回頭看對話紀錄也知道
   * 當初這句話是對著哪幾筆用例說的，不是泛指整個對話。 */
  scopedCaseLabels?: string[]
}

export interface UploadedMaterial {
  id: string
  filename: string
  kind: 'text' | 'image'
  text?: string
  image_data_url?: string
  embedded_images?: string[]
  description: string
}

export interface Project {
  id: string
  name: string
  materialIds: string[]
  createdAt: number
  updatedAt: number
}

export interface ProjectSummary {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  materialCount: number
  conversationCount: number
}

export interface Conversation {
  id: string
  projectId: string
  name: string
  selectedMaterialIds: string[]
  chatLog: ChatMessage[]
  lastResult: GenerationResult | null
  createdAt: number
  updatedAt: number
}

export interface ConversationSummary {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  messageCount: number
  testCaseCount: number
}
