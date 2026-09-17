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

/** 聊天式編輯時，AI 提出但使用者還沒點「套用」的一筆用例變更——`id` 對應
 * 目標用例的 id（action 為 'add' 時是這筆新用例被指派的 id）；action 為
 * 'delete' 時 `data` 是 null，其餘動作 `data` 是 AI 建議的完整用例內容。 */
export interface PendingChange {
  id: string
  action: 'add' | 'update' | 'delete'
  data: TestCase | null
}

export interface GenerationResult {
  test_cases: TestCase[]
  clarification_questions: ClarificationQuestion[]
  result_version: number
  pending_changes: PendingChange[]
}

/** 初次產生用例前的規劃步驟：把選取的素材拆成功能範圍，使用者確認/調整過後，
 * 才針對每個功能各自呼叫一次生成（見 FeatureGenerationProgress）。materialIds
 * 可能跟其他功能重疊（例如共用的登入頁面），也可能只涵蓋一部分已選素材。 */
export interface FeatureBreakdownItem {
  id: string
  name: string
  description: string
  materialIds: string[]
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
  featureBreakdown: FeatureBreakdownItem[] | null
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
