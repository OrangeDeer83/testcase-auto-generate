import { useState } from 'react'
import { createSession, generate, submitAnswers, uploadMaterials } from './api'
import { ClarifyChat, type ChatEntry } from './components/ClarifyChat'
import { ExportButton } from './components/ExportButton'
import { TestCaseTable } from './components/TestCaseTable'
import { UploadPanel } from './components/UploadPanel'
import type { ClarificationQuestion, GenerationResult, QAAnswer, UploadedMaterial } from './types'

type Stage = 'upload' | 'clarify' | 'review'

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [materials, setMaterials] = useState<UploadedMaterial[]>([])
  const [stage, setStage] = useState<Stage>('upload')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GenerationResult | null>(null)

  const [chatLog, setChatLog] = useState<ChatEntry[]>([])
  const [currentQuestion, setCurrentQuestion] = useState<ClarificationQuestion | null>(null)
  const [queue, setQueue] = useState<ClarificationQuestion[]>([])
  const [collectedAnswers, setCollectedAnswers] = useState<QAAnswer[]>([])

  const ensureSession = async (): Promise<string> => {
    if (sessionId) return sessionId
    const id = await createSession()
    setSessionId(id)
    return id
  }

  const applyResult = (res: GenerationResult) => {
    setResult(res)
    if (res.clarification_questions.length > 0) {
      const [first, ...rest] = res.clarification_questions
      setCurrentQuestion(first)
      setQueue(rest)
      setCollectedAnswers([])
      setStage('clarify')
    } else {
      setCurrentQuestion(null)
      setQueue([])
      setStage('review')
    }
  }

  const handleUpload = async (files: File[]) => {
    setBusy(true)
    setError(null)
    try {
      const id = await ensureSession()
      const res = await uploadMaterials(id, files)
      setMaterials((prev) => [...prev, ...res.uploaded])
    } catch (err) {
      setError(err instanceof Error ? err.message : '上傳失敗')
    } finally {
      setBusy(false)
    }
  }

  const handleGenerate = async () => {
    if (!sessionId) return
    setBusy(true)
    setError(null)
    try {
      const res = await generate(sessionId)
      applyResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : '產生失敗')
    } finally {
      setBusy(false)
    }
  }

  const handleAnswer = async (answer: string) => {
    if (!currentQuestion || !sessionId) return

    setChatLog((prev) => [...prev, { question: currentQuestion, answer }])
    const newAnswers = [
      ...collectedAnswers,
      { question_id: currentQuestion.id, question: currentQuestion.question, answer },
    ]

    if (queue.length > 0) {
      const [next, ...rest] = queue
      setCurrentQuestion(next)
      setQueue(rest)
      setCollectedAnswers(newAnswers)
      return
    }

    setCurrentQuestion(null)
    setBusy(true)
    setError(null)
    try {
      const res = await submitAnswers(sessionId, newAnswers)
      setCollectedAnswers([])
      applyResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : '送出回答失敗')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1>測試用例自動產生</h1>
      <p className="subtitle">上傳需求文件或 UI 截圖，自動生成可編輯的測試用例。</p>

      {error && <div className="error-banner">{error}</div>}

      {stage === 'upload' && (
        <UploadPanel
          materials={materials}
          busy={busy}
          onUpload={handleUpload}
          onGenerate={handleGenerate}
        />
      )}

      {stage === 'clarify' && (
        <ClarifyChat
          log={chatLog}
          currentQuestion={currentQuestion}
          busy={busy}
          onAnswer={handleAnswer}
        />
      )}

      {stage === 'review' && result && sessionId && (
        <>
          <TestCaseTable
            testCases={result.test_cases}
            onChange={(testCases) => setResult({ ...result, test_cases: testCases })}
          />
          <ExportButton sessionId={sessionId} result={result} onError={setError} />
        </>
      )}
    </>
  )
}
