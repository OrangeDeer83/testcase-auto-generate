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

export interface ClarificationQuestion {
  id: string
  question: string
  context: string
}

export interface GenerationResult {
  test_cases: TestCase[]
  clarification_questions: ClarificationQuestion[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  context?: string
  materialId?: string
  imageUrl?: string
  questions?: ClarificationQuestion[]
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
