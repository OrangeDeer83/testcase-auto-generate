import { useEffect, useRef, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import {
  addTextMaterial,
  exportExcel,
  generate,
  getConversation,
  getMaterials,
  sendChatMessage,
  saveChatLog,
  updateConversation,
  updateMaterial,
  updateTestCases,
  uploadMaterials,
} from '../api'
import { FloatingChat } from '../components/FloatingChat'
import { MaterialSelector } from '../components/MaterialSelector'
import { MaterialsModal } from '../components/MaterialsModal'
import { TestCaseTable } from '../components/TestCaseTable'
import { diffTestCases, getChangedCellKeys, getPreviousValues } from '../diffTestCases'
import type { ShellContext } from './ProjectLayout'
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
  const { conversationId } = useParams<{ conversationId: string }>()
  const { projectId, materials, refreshShell, setError } = useOutletContext<ShellContext>()

  const [conversationName, setConversationName] = useState('')
  // conversationName 是輸入框當下顯示的值，每次打字 onChange 都會同步更新；
  // 這裡要另外記「後端目前實際存的名字」，commitRename 才能判斷使用者是否真的
  // 改了名字——如果直接拿 conversationName 比較，因為它自己就是打字當下的值，
  // 判斷永遠會是「沒改變」，導致重新命名永遠不會真的送出去存。
  const savedNameRef = useRef('')
  // 剛從後端載入（或切換對話）時 result 也會變動一次，但那次不是使用者手動編輯，
  // 不該觸發自動存檔；用這個旗標讓自動存檔的 effect 跳過緊接在載入之後的那一次。
  const skipNextAutosaveRef = useRef(true)
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([])
  const [result, setResult] = useState<GenerationResult>(EMPTY_RESULT)
  const [chatLog, setChatLog] = useState<ChatMessage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [highlightedKeys, setHighlightedKeys] = useState<Set<string>>(new Set())
  const [previousValues, setPreviousValues] = useState<Map<string, string>>(new Map())
  const [showMaterials, setShowMaterials] = useState(false)

  useEffect(() => {
    if (!projectId || !conversationId) return
    setLoaded(false)
    setHighlightedKeys(new Set())
    setPreviousValues(new Map())
    skipNextAutosaveRef.current = true
    Promise.all([getMaterials(projectId), getConversation(projectId, conversationId)])
      .then(([mats, conversation]) => {
        setConversationName(conversation.name)
        savedNameRef.current = conversation.name
        setSelectedMaterialIds(conversation.selectedMaterialIds)
        setResult(conversation.lastResult ?? EMPTY_RESULT)
        setChatLog(hydrateChatLog(conversation.chatLog, mats))
        setLoaded(true)
      })
      .catch((err) => setError(err instanceof Error ? err.message : '讀取對話失敗'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, conversationId])

  // 使用者在表格裡手動編輯（新增/刪除步驟或用例、改欄位文字）只會更新這裡的
  // React 狀態，不會自動存回後端——後端真正落地寫檔只發生在送出聊天訊息、
  // 或按下匯出的當下。這個 effect 補上「手動編輯也要存檔」：debounce 一段時間
  // 沒有新的編輯動作，才真的呼叫 API，避免打字時每個按鍵都送一次請求。
  useEffect(() => {
    if (!loaded || !projectId || !conversationId) return
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false
      return
    }
    const timer = setTimeout(() => {
      updateTestCases(projectId, conversationId, result).catch((err) => {
        setError(err instanceof Error ? err.message : '自動儲存測試用例失敗')
      })
    }, 1000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, loaded])

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

  const commitRename = async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === savedNameRef.current) {
      setConversationName(savedNameRef.current)
      return
    }
    setConversationName(trimmed)
    try {
      await updateConversation(projectId, conversationId, { name: trimmed })
      savedNameRef.current = trimmed
      await refreshShell()
    } catch (err) {
      setError(err instanceof Error ? err.message : '重新命名對話失敗')
      setConversationName(savedNameRef.current)
    }
  }

  const handleSelectedMaterialsChange = async (ids: string[]) => {
    setSelectedMaterialIds(ids)
    try {
      await updateConversation(projectId, conversationId, { selectedMaterialIds: ids })
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新素材選取失敗')
    }
  }

  const handleUpdateMaterial = async (
    id: string,
    updates: { filename?: string; description?: string; text?: string },
  ): Promise<boolean> => {
    setError(null)
    try {
      await updateMaterial(projectId, id, updates)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新素材失敗')
      return false
    } finally {
      await refreshShell()
    }
  }

  const handleAddFilesToSelector = async (files: File[]) => {
    setError(null)
    try {
      const res = await uploadMaterials(projectId, files)
      await refreshShell()
      const newIds = res.uploaded.map((u) => u.id)
      const nextSelected = [...selectedMaterialIds, ...newIds]
      setSelectedMaterialIds(nextSelected)
      await updateConversation(projectId, conversationId, { selectedMaterialIds: nextSelected })
    } catch (err) {
      setError(err instanceof Error ? err.message : '新增素材失敗')
    }
  }

  const handleAddTextToSelector = async (label: string, content: string) => {
    setError(null)
    try {
      const res = await addTextMaterial(projectId, label, content)
      await refreshShell()
      const newIds = res.uploaded.map((u) => u.id)
      const nextSelected = [...selectedMaterialIds, ...newIds]
      setSelectedMaterialIds(nextSelected)
      await updateConversation(projectId, conversationId, { selectedMaterialIds: nextSelected })
    } catch (err) {
      setError(err instanceof Error ? err.message : '新增素材失敗')
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
        await refreshShell()
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

  const handleExport = async () => {
    setExporting(true)
    setError(null)
    try {
      await updateTestCases(projectId, conversationId, result)
      const blob = await exportExcel(projectId, conversationId)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'testcases.xlsx'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : '匯出失敗')
    } finally {
      setExporting(false)
    }
  }

  const hasResult = result.test_cases.length > 0 || result.clarification_questions.length > 0

  if (!loaded) return <p className="subtitle">載入中…</p>

  if (!hasResult) {
    return (
      <div className="panel">
        <div className="workspace-title-row">
          <input
            className="workspace-title-input"
            value={conversationName}
            onChange={(e) => setConversationName(e.target.value)}
            onBlur={(e) => commitRename(e.target.value)}
          />
        </div>
        <h2>選擇要使用的素材</h2>
        <p className="subtitle">
          這個對話會把勾選的素材送給模型參考——專案裡新增的素材不會自動加進來，避免每次都把不相關的東西一起送給模型。
        </p>
        <MaterialSelector
          materials={materials}
          selectedIds={selectedMaterialIds}
          busy={busy}
          onChange={handleSelectedMaterialsChange}
          onUpdateMaterial={handleUpdateMaterial}
          onAddFiles={handleAddFilesToSelector}
          onAddText={handleAddTextToSelector}
        />
        <div className="toolbar">
          <span className="subtitle">已選擇 {selectedMaterialIds.length} 項素材</span>
          <button disabled={busy || selectedMaterialIds.length === 0} onClick={handleGenerate}>
            {busy ? '產生中…' : '開始產生測試用例'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="workspace-view">
      <div className="workspace-title-row">
        <input
          className="workspace-title-input"
          value={conversationName}
          onChange={(e) => setConversationName(e.target.value)}
          onBlur={(e) => commitRename(e.target.value)}
        />
        <span className="subtitle workspace-count">共 {result.test_cases.length} 筆用例</span>
        <div className="workspace-actions">
          <button className="secondary" onClick={() => setShowMaterials(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1c2733" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            使用中的素材（{selectedMaterialIds.length}）
          </button>
          <button
            className="workspace-export-button"
            disabled={exporting || result.test_cases.length === 0}
            onClick={handleExport}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
            </svg>
            {exporting ? '匯出中…' : '匯出 Excel'}
          </button>
        </div>
      </div>

      <div className="workspace-cases-scroll">
        <TestCaseTable
          testCases={result.test_cases}
          onChange={(testCases) => setResult({ ...result, test_cases: testCases })}
          highlightedKeys={highlightedKeys}
          previousValues={previousValues}
          onFieldFocus={clearHighlight}
        />
      </div>

      <FloatingChat log={chatLog} busy={busy} onSend={handleSendMessage} />

      {showMaterials && (
        <MaterialsModal
          materials={materials.filter((m) => selectedMaterialIds.includes(m.id))}
          title="這個對話使用中的素材"
          onClose={() => setShowMaterials(false)}
        />
      )}
    </div>
  )
}
