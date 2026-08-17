export interface TestStep {
  step_no: number
  description: string
  expected_result: string
}

export interface TestCase {
  name: string
  module: string
  preconditions: string
  steps: TestStep[]
  priority: string
  notes: string
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
  role: 'user' | 'assistant'
  content: string
  context?: string
  imageUrl?: string
  questions?: ClarificationQuestion[]
}

export interface UploadedMaterial {
  id: string
  filename: string
  kind: 'text' | 'image'
  text?: string
  image_data_url?: string
}
