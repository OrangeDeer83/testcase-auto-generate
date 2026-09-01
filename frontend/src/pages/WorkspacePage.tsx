import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import {
  addTextMaterial,
  deleteMaterial,
  exportExcel,
  generate,
  getConversation,
  getImageMap,
  getMaterials,
  isConflictError,
  mergeMaterials,
  sendChatMessage,
  saveChatLog,
  ungroupImage,
  updateConversation,
  updateMaterial,
  updateTestCases,
  uploadMaterials,
} from '../api'
import { FloatingChat } from '../components/FloatingChat'
import { MaterialSelector } from '../components/MaterialSelector'
import { ModalOverlay } from '../components/ModalOverlay'
import { TestCaseTable } from '../components/TestCaseTable'
import { Tooltip } from '../components/Tooltip'
import { diffTestCases, getChangedCellKeys, getPreviousValues } from '../diffTestCases'
import { newId } from '../id'
import { countMaterialUsage } from '../materialUsage'
import { extractStreamProgress, type StreamProgressLine } from '../streamProgress'
import { useDuplicateTabWarning } from '../useDuplicateTabWarning'
import type { ShellContext } from './ProjectLayout'
import type { ChatMessage, GenerationResult, ImageRef, UploadedMaterial } from '../types'

const EMPTY_RESULT: GenerationResult = { test_cases: [], clarification_questions: [], result_version: 0 }

interface WorkspaceNotice {
  message: string
  focusIndex?: number
  focusToken?: number
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
  const { projectId, materials, refreshShell, setError, draftsByConversation, setDraftForConversation } =
    useOutletContext<ShellContext>()
  const hasDuplicateTab = useDuplicateTabWarning(conversationId)

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
  // 「思考中」計時器要顯示的是「這次請求真正開始的時間點」，不能只靠 ChatPanel
  // 自己內部從 0 累加——使用者關閉浮動聊天視窗時 ChatPanel 會被 unmount，重新
  // 展開後元件重新掛載，內部累加的秒數也會歸零，看起來像「等待時間被重置」。
  // 這個時間戳存在這一層（跟 busy 一樣，不會因為浮動視窗開關而被 unmount），
  // ChatPanel 只要用「現在時間 - 這個時間戳」重新算一次即可，不管中途有沒有
  // 被關閉過，算出來的都還是真正經過的秒數。
  const [busyStartedAt, setBusyStartedAt] = useState<number | null>(null)
  // 模型串流輸出時，目前已經抓到的「正在寫哪個用例／問題」清單——放在這一層
  // 而不是 ChatPanel 自己的 state，理由跟 busyStartedAt 一樣：ChatPanel 收合
  // 時會被 unmount，重新展開不該讓已經看過的進度憑空消失。累積的原始文字
  // 本身放在 ref（streamBufferRef）而不是 state，因為每個 SSE 片段都會觸發
  // 一次，全部塞進 state 會造成過於頻繁的重新渲染；只有「抓出來的清單有變化」
  // 時才真的 setState，天然節流。
  const streamBufferRef = useRef('')
  const [streamingLines, setStreamingLines] = useState<StreamProgressLine[]>([])
  // 「針對已選用例提問」：使用者先在表格裡勾選幾筆用例，再送出訊息，只有這幾筆
  // 的完整內容會送給模型（其餘只送名稱），縮減請求內容量。scopeSelectionMode
  // 控制表格要不要顯示勾選框；scopeSelectedIds 是目前勾選的用例 id；
  // activeScope 是「已經確定要用來限定下一則訊息」的範圍（點了「針對已選提問」
  // 之後才會設定），送出訊息當下才真的套用，送出後自動清空——每次的範圍限定
  // 只對那一則訊息生效，不會不小心沿用到後續完全不相關的訊息。
  const [scopeSelectionMode, setScopeSelectionMode] = useState(false)
  const [scopeSelectedIds, setScopeSelectedIds] = useState<Set<string>>(new Set())
  const [activeScope, setActiveScope] = useState<{ ids: string[]; labels: string[] } | null>(null)
  // FloatingChat 自己管理展開/收合的 state，這裡沒辦法直接呼叫它的 setOpen；
  // 用遞增的 token 當作「請求它打開」的訊號，FloatingChat 用 useEffect 監看
  // 這個值的變化來強制展開。
  const [forceOpenChatToken, setForceOpenChatToken] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [highlightedKeys, setHighlightedKeys] = useState<Set<string>>(new Set())
  const [previousValues, setPreviousValues] = useState<Map<string, string>>(new Map())
  const [showMaterials, setShowMaterials] = useState(false)
  // 匯出時的兩種非阻斷／半阻斷提示（還有用例未鎖定、還有問題未回答）共用同一個狀態、
  // 同一個畫面位置（標題列，跟 error-banner 分開，不會借用通用錯誤狀態）——這樣才能
  // 讓兩者都自動消失：一旦當初觸發的條件不再成立（該用例鎖定了／該問題有新訊息了），
  // 就不用使用者自己意識到要手動關掉。focusIndex/focusToken 只有「還有用例未鎖定」
  // 這種需要捲動跳轉的提示才會帶；token 每次擋下都遞增，避免連續兩次剛好指向同一筆
  // （index 沒變）時，因為值沒變化而不會重新觸發 TestCaseTable 裡的捲動/展開。
  const [workspaceNotice, setWorkspaceNotice] = useState<WorkspaceNotice | null>(null)
  const focusTokenRef = useRef(0)
  const [imageMap, setImageMap] = useState<Map<number, ImageRef>>(new Map())
  // 版本衝突（被別的分頁搶先存檔）發生時的提示——現在已經有分頁警示徽章事先
  // 提醒過使用者了，這裡不用再用會一直卡在畫面上、要手動關掉的通用錯誤橫幅，
  // 改成幾秒後自動消失的輕量 toast。
  const [conflictToast, setConflictToast] = useState<string | null>(null)

  useEffect(() => {
    if (!conflictToast) return
    const timer = setTimeout(() => setConflictToast(null), 4000)
    return () => clearTimeout(timer)
  }, [conflictToast])

  useEffect(() => {
    if (!workspaceNotice) return
    if (workspaceNotice.focusIndex != null) {
      if (
        result.test_cases[workspaceNotice.focusIndex]?.locked ||
        result.test_cases.every((tc) => tc.locked)
      ) {
        setWorkspaceNotice(null)
      }
      return
    }
    const lastEntry = chatLog[chatLog.length - 1]
    const hasUnanswered = lastEntry?.role === 'assistant' && (lastEntry.questions?.length ?? 0) > 0
    if (!hasUnanswered) setWorkspaceNotice(null)
  }, [result, chatLog, workspaceNotice])

  useEffect(() => {
    if (!projectId || !conversationId) return
    setLoaded(false)
    setHighlightedKeys(new Set())
    setPreviousValues(new Map())
    skipNextAutosaveRef.current = true
    Promise.all([
      getMaterials(projectId),
      getConversation(projectId, conversationId),
      getImageMap(projectId, conversationId),
    ])
      .then(([mats, conversation, refs]) => {
        setConversationName(conversation.name)
        savedNameRef.current = conversation.name
        setSelectedMaterialIds(conversation.selectedMaterialIds)
        setResult(conversation.lastResult ?? EMPTY_RESULT)
        setChatLog(hydrateChatLog(conversation.chatLog, mats))
        setImageMap(new Map(refs.map((ref) => [ref.number, ref])))
        setLoaded(true)
      })
      .catch((err) => setError(err instanceof Error ? err.message : '讀取對話失敗'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, conversationId])

  // 存檔基準版本（result_version）跟伺服器目前版本對不上時，代表這個分頁看到的
  // 是過期快照（例如同一個對話被另一個分頁改過），後端會擋下（409）不讓覆蓋。
  // 這種情況下把最新內容重新抓回來蓋掉本地這份過期狀態，並提示使用者——比起
  // 讓使用者的編輯內容默默生效、或默默消失，誠實告知「已經被別人改過」更安全。
  const reloadResultAfterConflict = async (pid: string, cid: string) => {
    try {
      const conversation = await getConversation(pid, cid)
      skipNextAutosaveRef.current = true
      setResult(conversation.lastResult ?? EMPTY_RESULT)
    } catch {
      // 重新載入也失敗就算了，至少已經擋下了這次會覆蓋掉別人修改的存檔
    }
  }

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
      updateTestCases(projectId, conversationId, result)
        .then((saved) => {
          skipNextAutosaveRef.current = true
          setResult((prev) => ({ ...prev, result_version: saved.result_version }))
        })
        .catch(async (err) => {
          if (isConflictError(err)) {
            await reloadResultAfterConflict(projectId, conversationId)
            setConflictToast('已載入其他分頁的最新內容，剛才的編輯請重新套用一次')
            return
          }
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

  const handleRemoveMaterial = async (id: string) => {
    setError(null)
    try {
      await deleteMaterial(projectId, id)
      await refreshShell()
      // 後端刪除時已經清掉所有對話（含這個對話）persist 過的勾選狀態，這裡只是讓
      // 畫面上的本地狀態同步跟上，避免之後使用者又勾了別的素材時，把這個已經不存在
      // 的 id 原封不動地一起存回去。
      setSelectedMaterialIds((prev) => prev.filter((existing) => existing !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除素材失敗')
    }
  }

  const handleMergeMaterials = async (ids: string[]) => {
    setError(null)
    try {
      await mergeMaterials(projectId, ids)
      await refreshShell()
      // 被合併掉的那幾筆 id 已經不存在了，道理同上——同步一次本地的勾選狀態，
      // 只留下合併後還存在的主圖 id（如果它本來就有被勾選的話）。
      const mergedAwayIds = ids.slice(1)
      setSelectedMaterialIds((prev) => prev.filter((existing) => !mergedAwayIds.includes(existing)))
    } catch (err) {
      setError(err instanceof Error ? err.message : '合併素材失敗')
    }
  }

  const handleUngroupImage = async (materialId: string, index: number) => {
    setError(null)
    try {
      await ungroupImage(projectId, materialId, index)
      await refreshShell()
    } catch (err) {
      setError(err instanceof Error ? err.message : '拆出圖片失敗')
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

  // 模型串流輸出的每個片段都會呼叫這裡一次；只有「抓出來的清單長度變多」才
  // setState 觸發重新渲染，避免每個字元都重繪一次畫面。
  const handleStreamDelta = (text: string) => {
    streamBufferRef.current += text
    const lines = extractStreamProgress(streamBufferRef.current)
    setStreamingLines((prev) => (lines.length > prev.length ? lines : prev))
  }

  const resetStreamProgress = () => {
    streamBufferRef.current = ''
    setStreamingLines([])
  }

  const toggleScopeSelectionMode = () => {
    setScopeSelectionMode((prev) => !prev)
    setScopeSelectedIds(new Set())
  }

  const toggleScopeSelected = (caseId: string) => {
    setScopeSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(caseId)) next.delete(caseId)
      else next.add(caseId)
      return next
    })
  }

  const handleAskAboutSelected = () => {
    const ids = Array.from(scopeSelectedIds)
    if (ids.length === 0) return
    const labels = result.test_cases
      .map((tc, idx) => ({ tc, idx }))
      .filter(({ tc }) => scopeSelectedIds.has(tc.id))
      .map(({ tc, idx }) => `第 ${idx + 1} 筆：${tc.name || '（未命名用例）'}`)
    setActiveScope({ ids, labels })
    setScopeSelectionMode(false)
    setScopeSelectedIds(new Set())
    setForceOpenChatToken((t) => t + 1)
  }

  const handleGenerate = async () => {
    if (selectedMaterialIds.length === 0) {
      setError('請先勾選至少一項素材再產生測試用例')
      return
    }
    setBusy(true)
    setBusyStartedAt(Date.now())
    resetStreamProgress()
    setError(null)
    try {
      const res = await generate(projectId, conversationId, handleStreamDelta)
      setResult(res)
      const log = describeResult(res)
      setChatLog(log)
      await persistChatLog(log)
      const refs = await getImageMap(projectId, conversationId)
      setImageMap(new Map(refs.map((ref) => [ref.number, ref])))
    } catch (err) {
      setError(err instanceof Error ? err.message : '產生失敗')
    } finally {
      setBusy(false)
      setBusyStartedAt(null)
      resetStreamProgress()
    }
  }

  const handleSendMessage = async (message: string, file?: File) => {
    setBusy(true)
    setBusyStartedAt(Date.now())
    resetStreamProgress()
    setError(null)
    // 送出當下就把範圍「鎖」成一份快照，不要在整個 async 流程裡一路讀 activeScope
    // 這個 state——避免使用者在等待回應期間又做了其他操作、不小心改到這次已經
    // 送出去的請求所依據的範圍。
    const scopeAtSendTime = activeScope
    // 送出失敗時（例如模型逾時）要能在對話紀錄裡插入一則錯誤訊息，所以這裡要在
    // try/catch 外面保留一份「目前為止已經確定要顯示」的紀錄；catch 拿不到 try
    // 區塊內用 const 宣告的 logWithUserMessage，用這個外層變數代替。
    let logSoFar = chatLog
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
          scopedCaseLabels: scopeAtSendTime?.labels,
        }
      } else {
        attachmentEntry = { id: newId(), role: 'user', content: message, scopedCaseLabels: scopeAtSendTime?.labels }
      }

      const logWithUserMessage = [...chatLog, attachmentEntry]
      logSoFar = logWithUserMessage
      setChatLog(logWithUserMessage)

      const beforeTestCases = result.test_cases
      const res = await sendChatMessage(
        projectId,
        conversationId,
        message,
        beforeTestCases,
        attachmentMaterialId,
        handleStreamDelta,
        scopeAtSendTime?.ids,
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

      if (attachmentMaterialId) {
        const refs = await getImageMap(projectId, conversationId)
        setImageMap(new Map(refs.map((ref) => [ref.number, ref])))
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '送出訊息失敗'
      setError(message)
      // 「思考中」的計時器一消失（busy 變 false），使用者眼前的浮動聊天視窗
      // 就什麼都看不到了——頁面上方的 error-banner 常常被浮動視窗擋住或不在
      // 視野範圍內，等於沒通知到。改成直接在對話紀錄裡插入一則錯誤訊息，
      // 顯示在原本「思考中」泡泡的同一個位置，使用者不用移開視線就看得到。
      const logWithError: ChatMessage[] = [
        ...logSoFar,
        { id: newId(), role: 'assistant', content: message, isError: true },
      ]
      setChatLog(logWithError)
      await persistChatLog(logWithError)
    } finally {
      setBusy(false)
      setBusyStartedAt(null)
      resetStreamProgress()
      // 範圍限定只對這一則訊息生效，不管成功失敗，送出後都要清掉，避免不小心
      // 沿用到下一則完全不相關的訊息上。
      setActiveScope(null)
    }
  }

  const handleExport = async () => {
    const firstUnlockedIndex = result.test_cases.findIndex((tc) => !tc.locked)
    if (firstUnlockedIndex !== -1) {
      focusTokenRef.current += 1
      setWorkspaceNotice({
        message: '⚠️ 有用例未鎖定',
        focusIndex: firstUnlockedIndex,
        focusToken: focusTokenRef.current,
      })
      return
    }

    setExporting(true)
    setError(null)
    try {
      const lastEntry = chatLog[chatLog.length - 1]
      if (lastEntry?.role === 'assistant' && (lastEntry.questions?.length ?? 0) > 0) {
        setWorkspaceNotice({ message: '⚠️ 有問題未回答' })
      }
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
      if (isConflictError(err)) {
        await reloadResultAfterConflict(projectId, conversationId)
        setConflictToast('已載入其他分頁的最新內容，請確認鎖定狀態後再匯出一次')
      } else {
        setError(err instanceof Error ? err.message : '匯出失敗')
      }
    } finally {
      setExporting(false)
    }
  }

  const hasResult = result.test_cases.length > 0 || result.clarification_questions.length > 0
  const lockedCount = result.test_cases.filter((tc) => tc.locked).length
  const allLocked = result.test_cases.length > 0 && lockedCount === result.test_cases.length
  const materialUsageCounts = useMemo(
    () => countMaterialUsage(result.test_cases, imageMap),
    [result.test_cases, imageMap],
  )

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
          {hasDuplicateTab && (
            <Tooltip
              placement="bottom"
              wrap
              label="同一個對話同時開著多個分頁，較晚存檔的一邊可能會因為版本衝突而無法套用（畫面會自動被另一邊的最新內容取代），建議只留一個分頁操作，避免白改"
            >
              <div className="workspace-duplicate-tab-warning">⚠️ 有其他分頁開著</div>
            </Tooltip>
          )}
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
          onRemoveMaterial={handleRemoveMaterial}
          onMergeMaterials={handleMergeMaterials}
          onUngroupImage={handleUngroupImage}
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
        <span className={`workspace-lock-progress${allLocked ? ' workspace-lock-progress-complete' : ''}`}>
          已鎖定 {lockedCount}/{result.test_cases.length} 筆
        </span>
        {hasDuplicateTab && (
          <Tooltip
            placement="bottom"
            wrap
            label="同一個對話同時開著多個分頁，較晚存檔的一邊可能會因為版本衝突而無法套用（畫面會自動被另一邊的最新內容取代），建議只留一個分頁操作，避免白改"
          >
            <div className="workspace-duplicate-tab-warning">⚠️ 有其他分頁開著</div>
          </Tooltip>
        )}
        {workspaceNotice && (
          <div className="workspace-notice">
            <Tooltip
              placement="bottom"
              wrap
              label={
                workspaceNotice.focusIndex != null
                  ? '還有測試用例尚未鎖定審核，已為您跳到第一筆未鎖定的用例——鎖定後這則提示會自動消失'
                  : '目前有尚未回答的澄清問題，建議確認後再匯出（本次仍會照常匯出）'
              }
            >
              <span>{workspaceNotice.message}</span>
            </Tooltip>
            <Tooltip placement="bottom" label="關閉提示">
              <button
                type="button"
                className="workspace-notice-close"
                onClick={() => setWorkspaceNotice(null)}
              >
                ✕
              </button>
            </Tooltip>
          </div>
        )}
        <div className="workspace-actions">
          <Tooltip label="勾選幾筆用例，只針對這幾筆提問——縮減送給模型的內容量，也讓問題明確指定是哪幾筆">
            <button
              type="button"
              className={`secondary${scopeSelectionMode ? ' workspace-scope-toggle-active' : ''}`}
              onClick={toggleScopeSelectionMode}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
              </svg>
              {scopeSelectionMode ? '取消選取' : '選取用例提問'}
            </button>
          </Tooltip>
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

      {scopeSelectionMode && (
        <div className="workspace-scope-bar">
          <span>
            {scopeSelectedIds.size > 0 ? `已選 ${scopeSelectedIds.size} 筆用例` : '請在下方勾選要提問的用例'}
          </span>
          <button type="button" disabled={scopeSelectedIds.size === 0} onClick={handleAskAboutSelected}>
            針對已選提問
          </button>
        </div>
      )}

      <div className="workspace-cases-scroll">
        <TestCaseTable
          testCases={result.test_cases}
          onChange={(testCases) => setResult({ ...result, test_cases: testCases })}
          highlightedKeys={highlightedKeys}
          previousValues={previousValues}
          onFieldFocus={clearHighlight}
          focusCaseIndex={workspaceNotice?.focusIndex ?? null}
          focusToken={workspaceNotice?.focusToken}
          imageMap={imageMap}
          scopeSelectionMode={scopeSelectionMode}
          scopeSelectedIds={scopeSelectedIds}
          onToggleScopeSelected={toggleScopeSelected}
        />
      </div>

      <FloatingChat
        log={chatLog}
        busy={busy}
        busyStartedAt={busyStartedAt}
        streamingLines={streamingLines}
        onSend={handleSendMessage}
        materials={materials}
        selectedMaterialIds={selectedMaterialIds}
        testCases={result.test_cases}
        imageMap={imageMap}
        onChangeSelectedMaterials={handleSelectedMaterialsChange}
        draft={draftsByConversation[conversationId] ?? ''}
        onDraftChange={(draft) => setDraftForConversation(conversationId, draft)}
        forceOpenToken={forceOpenChatToken}
        activeScope={activeScope}
        onClearScope={() => setActiveScope(null)}
      />

      {showMaterials && (
        <ModalOverlay onClose={() => setShowMaterials(false)}>
          <div className="modal-header">
            <h2>調整這個對話使用中的素材</h2>
            <button className="secondary" onClick={() => setShowMaterials(false)}>
              關閉
            </button>
          </div>
          <MaterialSelector
            materials={materials}
            selectedIds={selectedMaterialIds}
            busy={busy}
            onChange={handleSelectedMaterialsChange}
            onUpdateMaterial={handleUpdateMaterial}
            onAddFiles={handleAddFilesToSelector}
            onAddText={handleAddTextToSelector}
            onRemoveMaterial={handleRemoveMaterial}
            onMergeMaterials={handleMergeMaterials}
            onUngroupImage={handleUngroupImage}
            usageCounts={materialUsageCounts}
          />
        </ModalOverlay>
      )}

      {conflictToast && <div className="conflict-toast">{conflictToast}</div>}
    </div>
  )
}
