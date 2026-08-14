export interface TestStep {
  step_no: number
  description: string
  expected_result: string
}

export interface TestCase {
  name: string
  preconditions: string
  steps: TestStep[]
  priority: string
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
}

export interface UploadedMaterial {
  filename: string
  kind: 'text' | 'image'
}
