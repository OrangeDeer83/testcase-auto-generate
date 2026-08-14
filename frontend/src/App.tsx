import { useState } from 'react'
import { addTextMaterial, createSession, generate, sendChatMessage, uploadMaterials } from './api'
import { ChatPanel } from './components/ChatPanel'
import { ExportButton } from './components/ExportButton'
import { TestCaseTable } from './components/TestCaseTable'
import { UploadPanel, type TextMaterialDraft } from './components/UploadPanel'
import type { ChatMessage, GenerationResult, UploadedMaterial } from './types'

type Stage = 'upload' | 'workspace'

function describeResult(result: GenerationResult): ChatMessage[] {
  if (result.clarification_questions.length > 0) {
    return result.clarification_questions.map((q) => ({
      role: 'assistant' as const,
      content: q.context ? `${q.question}\n依據：${q.context}` : q.question,
    }))
  }
  return [
    {
      role: 'assistant',
      content: `已更新測試用例，目前共 ${result.test_cases.length} 筆，沒有待釐清的問題。`,
    },
  ]
}

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [materials, setMaterials] = useState<UploadedMaterial[]>([])
  const [stage, setStage] = useState<Stage>('upload')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [chatLog, setChatLog] = useState<ChatMessage[]>([])

  const ensureSession = async (): Promise<string> => {
    if (sessionId) return sessionId
    const id = await createSession()
    setSessionId(id)
    return id
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

  const handleGenerate = async (textMaterials: TextMaterialDraft[]) => {
    setBusy(true)
    setError(null)
    try {
      const id = await ensureSession()
      for (const draft of textMaterials) {
        const res = await addTextMaterial(id, draft.label, draft.content)
        setMaterials((prev) => [...prev, ...res.uploaded])
      }
      const res = await generate(id)
      setResult(res)
      setChatLog(describeResult(res))
      setStage('workspace')
    } catch (err) {
      setError(err instanceof Error ? err.message : '產生失敗')
    } finally {
      setBusy(false)
    }
  }

  const handleSendMessage = async (message: string) => {
    if (!sessionId || !result) return
    setChatLog((prev) => [...prev, { role: 'user', content: message }])
    setBusy(true)
    setError(null)
    try {
      const res = await sendChatMessage(sessionId, message, result.test_cases)
      setResult(res)
      setChatLog((prev) => [...prev, ...describeResult(res)])
    } catch (err) {
      setError(err instanceof Error ? err.message : '送出訊息失敗')
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

      {stage === 'workspace' && result && sessionId && (
        <>
          <ChatPanel log={chatLog} busy={busy} onSend={handleSendMessage} />
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
