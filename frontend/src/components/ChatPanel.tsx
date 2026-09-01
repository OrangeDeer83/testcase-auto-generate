import { useEffect, useMemo, useRef, useState } from 'react'
import type { ClipboardEvent } from 'react'
import { getPastedImageFile } from '../clipboardImage'
import {
  estimateProcessingSeconds,
  findLikelyRelevantUnselectedMaterials,
  findLikelyUnrelatedImageMaterials,
  isOverloaded,
} from '../materialRisk'
import type { StreamProgressLine } from '../streamProgress'
import { useImageLightbox } from './ImageLightbox'
import { Tooltip } from './Tooltip'
import type { ChatMessage, ImageRef, TestCase, UploadedMaterial } from '../types'

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.xlsx,.md,.markdown,.txt,.png,.jpg,.jpeg'

interface ChatPanelProps {
  log: ChatMessage[]
  busy: boolean
  /** busy 這次是什麼時候開始的（ms 時間戳，busy 為 false 時是 null）——用來算
   * 「思考中」要顯示的已等待秒數，不能自己在這個元件裡從 0 累加：這個元件
   * 收合時會被 unmount，重新展開後從 0 重新算就會讓等待秒數看起來被重置。 */
  busyStartedAt: number | null
  /** 模型串流輸出時，目前已經抓到的「正在寫哪個用例／問題」清單，依序顯示在
   * 「思考中」下面。 */
  streamingLines: StreamProgressLine[]
  onSend: (message: string, file?: File) => void
  materials: UploadedMaterial[]
  selectedMaterialIds: string[]
  testCases: TestCase[]
  imageMap: Map<number, ImageRef>
  onChangeSelectedMaterials: (ids: string[]) => void
  /** 打到一半、還沒送出的草稿——由外層（FloatingChat 往上到 ProjectLayout）
   * 依對話 id 保存並控制，這裡不能自己用 useState，不然這個元件被收合
   * unmount 時草稿就會跟著消失。 */
  draft: string
  onDraftChange: (draft: string) => void
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

export function ChatPanel({
  log,
  busy,
  busyStartedAt,
  streamingLines,
  onSend,
  materials,
  selectedMaterialIds,
  testCases,
  imageMap,
  onChangeSelectedMaterials,
  draft,
  onDraftChange,
}: ChatPanelProps) {
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const [attachedPreviewUrl, setAttachedPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const logEndRef = useRef<HTMLDivElement>(null)
  const { open: openPreview, lightbox } = useImageLightbox()
  // 初始值不能直接寫死 0——如果使用者是在請求已經進行到一半時才（重新）展開
  // 這個元件（例如關閉浮動視窗又重新點開），busyStartedAt 這時已經是稍早的
  // 時間戳，一掛載就該直接算出「已經過了多久」，不是從 0 開始算。
  const [elapsedSeconds, setElapsedSeconds] = useState(() =>
    busyStartedAt ? Math.max(0, Math.floor((Date.now() - busyStartedAt) / 1000)) : 0,
  )

  // 送出前粗估這次請求的內容量會不會讓模型處理逾時（見 materialRisk.ts 的係數
  // 說明），過量就直接擋下送出，而不是讓使用者等到卡住才知道——2026-08-28
  // 曾經因為同一個對話勾了 28 張截圖，讓呼叫模型連續兩次都卡了將近 5 分鐘才
  // 失敗，這裡的目的就是提前攔下同一種情況。
  const overloaded = useMemo(
    () => isOverloaded({ materials, selectedMaterialIds, testCases, chatLog: log }),
    [materials, selectedMaterialIds, testCases, log],
  )
  const estimatedSeconds = useMemo(
    () => estimateProcessingSeconds({ materials, selectedMaterialIds, testCases, chatLog: log }),
    [materials, selectedMaterialIds, testCases, log],
  )
  const unrelatedSuggestions = useMemo(
    () =>
      overloaded
        ? findLikelyUnrelatedImageMaterials(draft, materials, selectedMaterialIds, testCases, imageMap)
        : [],
    [overloaded, draft, materials, selectedMaterialIds, testCases, imageMap],
  )

  const handleUnselectSuggestions = () => {
    const removeIds = new Set(unrelatedSuggestions.map((m) => m.id))
    onChangeSelectedMaterials(selectedMaterialIds.filter((id) => !removeIds.has(id)))
  }

  const handleAddSuggestedMaterials = (suggested: UploadedMaterial[]) => {
    onChangeSelectedMaterials([...selectedMaterialIds, ...suggested.map((m) => m.id)])
  }

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'end' })
  }, [log, busy, streamingLines])

  useEffect(() => {
    if (!busyStartedAt) {
      setElapsedSeconds(0)
      return
    }
    // 每次都用「現在時間 - 請求開始時間」重新算，不是單純累加——這樣不管這個
    // 元件中途有沒有被 unmount 再重新掛載過，算出來的都還是真正經過的秒數。
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - busyStartedAt) / 1000)))
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [busyStartedAt])

  const canSend = (draft.trim() || attachedFile) && !busy && !overloaded

  const attachFile = (file: File) => {
    setAttachedFile(file)
    setAttachedPreviewUrl(isImageFile(file) ? URL.createObjectURL(file) : null)
  }

  const handleAttachFile = (fileList: FileList | null) => {
    const file = fileList?.[0]
    if (!file) return
    attachFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handlePasteImage = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const file = getPastedImageFile(e.clipboardData, '截圖')
    if (!file) return
    e.preventDefault()
    attachFile(file)
  }

  const clearAttachment = () => {
    if (attachedPreviewUrl) URL.revokeObjectURL(attachedPreviewUrl)
    setAttachedFile(null)
    setAttachedPreviewUrl(null)
  }

  const submit = () => {
    if (!canSend) return
    onSend(draft.trim(), attachedFile ?? undefined)
    onDraftChange('')
    setAttachedFile(null)
    setAttachedPreviewUrl(null)
  }

  return (
    <>
      <div className="chat-log">
        {log.map((entry, idx) => (
          <div
            key={idx}
            className={`chat-entry entry-${entry.role}${entry.questions ? ' has-questions' : ''}`}
          >
            {entry.questions ? (
              <div
                className={`question-list${
                  idx === log.length - 1 && entry.role === 'assistant' ? ' question-list-blink' : ''
                }`}
              >
                <div className="question-list-title">
                  {entry.questions.length > 1
                    ? `有 ${entry.questions.length} 個問題需要您協助確認：`
                    : '有一個問題需要您協助確認：'}
                </div>
                {entry.questions.map((q, qIdx) => {
                  const relevantSuggestions = findLikelyRelevantUnselectedMaterials(
                    q,
                    materials,
                    selectedMaterialIds,
                  )
                  return (
                    <div className="question-list-item" key={q.id}>
                      <span className="question-index">Q{qIdx + 1}.</span> {q.question}
                      {q.context && <span className="question-context">依據：{q.context}</span>}
                      {relevantSuggestions.length > 0 && (
                        <div className="question-material-suggestion">
                          <span>
                            💡 素材庫裡的「{relevantSuggestions.map((m) => m.filename).join('、')}」看起來可能跟這個問題有關（僅依檔名／說明文字比對，不保證真的相關），要加入使用中的素材嗎？
                          </span>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => handleAddSuggestedMaterials(relevantSuggestions)}
                          >
                            加入這 {relevantSuggestions.length} 項
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <>
                <div
                  className={`chat-bubble ${entry.role === 'user' ? 'answer' : 'question'}${entry.isError ? ' chat-bubble-error' : ''}`}
                >
                  {entry.isError ? `⚠️ ${entry.content}` : entry.content}
                  {entry.imageUrl && (
                    <img
                      className="chat-bubble-image"
                      src={entry.imageUrl}
                      alt="附加圖片"
                      onClick={() => openPreview(entry.imageUrl!, '附加圖片')}
                    />
                  )}
                </div>
                {entry.context && <div className="chat-bubble context">依據：{entry.context}</div>}
              </>
            )}
          </div>
        ))}
        {busy && (
          <div className="chat-entry entry-assistant">
            <div className="chat-bubble question">
              思考中…{elapsedSeconds > 0 ? `（已等待 ${elapsedSeconds} 秒）` : ''}
              {streamingLines.length > 0 && (
                <ul className="chat-stream-progress">
                  {streamingLines.map((line, idx) => (
                    <li key={idx}>
                      {line.kind === 'test_case' ? '📝' : '❓'} {line.text}
                    </li>
                  ))}
                </ul>
              )}
              {elapsedSeconds >= 20 && (
                <div className="chat-bubble-hint">
                  模型回應時間較長屬正常現象，尤其是附件含較多圖片或文件時，請耐心等候
                </div>
              )}
            </div>
          </div>
        )}
        <div ref={logEndRef} />
      </div>

      {attachedFile && (
        <div className="chat-attachment-preview">
          {attachedPreviewUrl ? (
            <img src={attachedPreviewUrl} alt="待送出的附加圖片" />
          ) : (
            <span>📄</span>
          )}
          <span>{attachedFile.name}</span>
          <button className="secondary" disabled={busy} onClick={clearAttachment}>
            移除附件
          </button>
        </div>
      )}

      {overloaded && (
        <div className="chat-overload-warning">
          <div className="chat-overload-warning-text">
            ⚠️ 目前勾選的素材內容量偏大（估計需要 {Math.round(estimatedSeconds)} 秒以上），容易讓模型處理逾時，暫時無法送出。請先到上方「使用中的素材」取消勾選一些跟這次訊息無關的素材——圖片消耗的資源通常遠高於文字內容，建議優先考慮取消勾選圖片類素材。
          </div>
          {unrelatedSuggestions.length > 0 && (
            <div className="chat-overload-suggestions">
              <span>看起來跟這則訊息無關的素材：{unrelatedSuggestions.map((m) => m.filename).join('、')}</span>
              <button type="button" className="secondary" onClick={handleUnselectSuggestions}>
                取消勾選這 {unrelatedSuggestions.length} 項
              </button>
            </div>
          )}
        </div>
      )}

      <div className="chat-input-row">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          style={{ display: 'none' }}
          onChange={(e) => handleAttachFile(e.target.files)}
        />
        <button
          className="secondary chat-attach-button"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          📎 附加
        </button>
        <textarea
          value={draft}
          disabled={busy}
          placeholder="輸入回答，或下達修改指令…也可以直接貼上截圖（Ctrl+V）"
          onChange={(e) => onDraftChange(e.target.value)}
          onPaste={handlePasteImage}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        {overloaded ? (
          // 這裡刻意不用原生 disabled 屬性——瀏覽器不會對已停用的表單元件觸發
          // mouseover/mouseenter，Tooltip 就永遠不會顯示。改用 aria-disabled
          // 加不掛 onClick，視覺上一樣不可點擊，但滑鼠事件照常觸發。
          <Tooltip label="素材內容量偏大，容易讓模型處理逾時，請先取消勾選部分素材再送出" wrap>
            <button type="button" className="button-disabled-hoverable" aria-disabled="true">
              送出
            </button>
          </Tooltip>
        ) : (
          <button disabled={!canSend} onClick={submit}>
            送出
          </button>
        )}
      </div>
      {lightbox}
    </>
  )
}
