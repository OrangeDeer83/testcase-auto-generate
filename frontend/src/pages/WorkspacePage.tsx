import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  generate,
  getConversation,
  getMaterials,
  saveChatLog,
  sendChatMessage,
  updateConversation,
  uploadMaterials,
} from '../api'
import { ChatPanel } from '../components/ChatPanel'
import { ExportButton } from '../components/ExportButton'
import { MaterialSelector } from '../components/MaterialSelector'
import { MaterialsModal } from '../components/MaterialsModal'
import { TestCaseTable } from '../components/TestCaseTable'
import { diffTestCases, getChangedCellKeys, getPreviousValues } from '../diffTestCases'
import type { ChatMessage, GenerationResult, UploadedMaterial } from '../types'

const EMPTY_RESULT: GenerationResult = { test_cases: [], clarification_questions: [] }

function newId(): string {
  return crypto.randomUUID()
}

function describeResult(result: GenerationResult): ChatMessage[] {
  if (result.clarification_questions.length > 0) {
    return [{ id: newId(), role: 'assistant', content: '', questions: result.clarification_questions }]
  }
  return [
    {
      id: newId(),
      role: 'assistant',
      content: `已更新測試用例，目前共 ${result.test_cases.length} 筆，沒有待釐清的問題。`,
    },
  ]
}

/** 把持久化的 chat_log 還原成畫面用的 ChatMessage：有 materialId 的項目去素材清單找回圖片內容，
 * 找不到（素材已被刪除）就讓 imageUrl 維持 undefined，畫面不會壞掉，只是不顯示縮圖。 */
function hydrateChatLog(chatLog: ChatMessage[], materials: UploadedMaterial[]): ChatMessage[] {
  const materialsById = new Map(materials.map((m) => [m.id, m]))
  return chatLog.map((entry) => {
    if (!entry.materialId) return entry
    const material = materialsById.get(entry.materialId)
    return { ...entry, imageUrl: material?.kind === 'image' ? material.image_data_url : undefined }
  })
}

export function WorkspacePage() {
  const { projectId, conversationId } = useParams<{ projectId: string; conversationId: string }>()
  const navigate = useNavigate()

  const [materials, setMaterials] = useState<UploadedMaterial[]>([])
  const [conversationName, setConversationName] = useState('')
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([])
  const [result, setResult] = useState<GenerationResult>(EMPTY_RESULT)
  const [chatLog, setChatLog] = useState<ChatMessage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [highlightedKeys, setHighlightedKeys] = useState<Set<string>>(new Set())
  const [previousValues, setPreviousValues] = useState<Map<string, string>>(new Map())
  const [showMaterials, setShowMaterials] = useState(false)

  useEffect(() => {
    if (!projectId || !conversationId) return
    setLoaded(false)
    setHighlightedKeys(new Set())
    setPreviousValues(new Map())
    Promise.all([getMaterials(projectId), getConversation(projectId, conversationId)])
      .then(([mats, conversation]) => {
        setMaterials(mats)
        setConversationName(conversation.name)
        setSelectedMaterialIds(conversation.selectedMaterialIds)
        setResult(conversation.lastResult ?? EMPTY_RESULT)
        setChatLog(hydrateChatLog(conversation.chatLog, mats))
        setLoaded(true)
      })
      .catch((err) => setError(err instanceof Error ? err.message : '讀取對話失敗'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, conversationId])

  if (!projectId || !conversationId) return null

  const persistChatLog = async (log: ChatMessage[]) => {
    try {
      await saveChatLog(projectId, conversationId, log)
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存聊天紀錄失敗')
    }
  }

  const clearHighlight = (keys: string[]) => {
    setHighlightedKeys((prev) => {
      if (keys.every((key) => !prev.has(key))) return prev
      const next = new Set(prev)
      keys.forEach((key) => next.delete(key))
      return next
    })
  }

  const scrollToFirstChange = (keys: Set<string>) => {
    const first = Array.from(keys)[0]
    if (!first) return
    requestAnimationFrame(() => {
      document.getElementById(`field-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  const handleSelectedMaterialsChange = async (ids: string[]) => {
    setSelectedMaterialIds(ids)
    try {
      await updateConversation(projectId, conversationId, { selectedMaterialIds: ids })
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新素材選取失敗')
    }
  }

  const handleGenerate = async () => {
    if (selectedMaterialIds.length === 0) {
      setError('請先勾選至少一項素材再產生測試用例')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await generate(projectId, conversationId)
      setResult(res)
      const log = describeResult(res)
      setChatLog(log)
      await persistChatLog(log)
    } catch (err) {
      setError(err instanceof Error ? err.message : '產生失敗')
    } finally {
      setBusy(false)
    }
  }

  const handleSendMessage = async (message: string, file?: File) => {
    setBusy(true)
    setError(null)
    try {
      let attachmentMaterialId: string | undefined
      let attachmentEntry: ChatMessage | null = null

      if (file) {
        const uploadRes = await uploadMaterials(projectId, [file])
        const uploaded = uploadRes.uploaded[0]
        attachmentMaterialId = uploaded.id

        const nextSelected = [...selectedMaterialIds, uploaded.id]
        setSelectedMaterialIds(nextSelected)
        await updateConversation(projectId, conversationId, { selectedMaterialIds: nextSelected })

        const refreshedMaterials = await getMaterials(projectId)
        setMaterials(refreshedMaterials)
        const material = refreshedMaterials.find((m) => m.id === uploaded.id)
        attachmentEntry = {
          id: newId(),
          role: 'user',
          content: message || `（附上：${uploaded.filename}）`,
          materialId: uploaded.id,
          imageUrl: material?.kind === 'image' ? material.image_data_url : undefined,
        }
      } else {
        attachmentEntry = { id: newId(), role: 'user', content: message }
      }

      const logWithUserMessage = [...chatLog, attachmentEntry]
      setChatLog(logWithUserMessage)

      const beforeTestCases = result.test_cases
      const res = await sendChatMessage(
        projectId,
        conversationId,
        message,
        beforeTestCases,
        attachmentMaterialId,
      )
      setResult(res)

      const changes = diffTestCases(beforeTestCases, res.test_cases)
      const changeSummary: ChatMessage[] =
        changes.length > 0
          ? [{ id: newId(), role: 'assistant', content: `本次變動：\n${changes.map((c) => `・${c}`).join('\n')}` }]
          : []

      const changedKeys = getChangedCellKeys(beforeTestCases, res.test_cases)
      setHighlightedKeys(changedKeys)
      setPreviousValues(getPreviousValues(beforeTestCases, res.test_cases))
      scrollToFirstChange(changedKeys)

      const finalLog = [...logWithUserMessage, ...changeSummary, ...describeResult(res)]
      setChatLog(finalLog)
      await persistChatLog(finalLog)
    } catch (err) {
      setError(err instanceof Error ? err.message : '送出訊息失敗')
    } finally {
      setBusy(false)
    }
  }

  const hasResult = result.test_cases.length > 0 || result.clarification_questions.length > 0

  return (
    <div className={hasResult ? 'app-shell app-shell-wide' : 'app-shell'}>
      <div className="app-header">
        <div className="app-header-row">
          <h1>{conversationName || '對話'}</h1>
          <button className="secondary" onClick={() => navigate(`/projects/${projectId}`)}>
            ← 回專案
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!loaded && <p className="subtitle">載入中…</p>}

      {loaded && !hasResult && (
        <div className="panel">
          <h2>選擇要使用的素材</h2>
          <p className="subtitle">
            這個對話會把勾選的素材送給模型參考——專案裡新增的素材不會自動加進來，避免每次都把不相關的東西一起送給模型。
          </p>
          <MaterialSelector
            materials={materials}
            selectedIds={selectedMaterialIds}
            busy={busy}
            onChange={handleSelectedMaterialsChange}
          />
          <div className="toolbar">
            <span className="subtitle">已選擇 {selectedMaterialIds.length} 項素材</span>
            <button disabled={busy || selectedMaterialIds.length === 0} onClick={handleGenerate}>
              {busy ? '產生中…' : '開始產生測試用例'}
            </button>
          </div>
        </div>
      )}

      {loaded && hasResult && (
        <div className="workspace-layout">
          <div className="workspace-chat-col">
            <button className="secondary materials-toggle" onClick={() => setShowMaterials(true)}>
              📎 查看使用中的素材（{selectedMaterialIds.length}）
            </button>
            <ChatPanel log={chatLog} busy={busy} onSend={handleSendMessage} />
          </div>
          <div className="workspace-table-col">
            <TestCaseTable
              testCases={result.test_cases}
              onChange={(testCases) => setResult({ ...result, test_cases: testCases })}
              highlightedKeys={highlightedKeys}
              previousValues={previousValues}
              onFieldFocus={clearHighlight}
            />
            <ExportButton projectId={projectId} conversationId={conversationId} result={result} onError={setError} />
          </div>
        </div>
      )}

      {showMaterials && (
        <MaterialsModal
          materials={materials.filter((m) => selectedMaterialIds.includes(m.id))}
          onClose={() => setShowMaterials(false)}
        />
      )}
    </div>
  )
}
