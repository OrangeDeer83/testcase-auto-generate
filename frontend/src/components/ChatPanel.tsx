import { useEffect, useMemo, useRef, useState } from 'react'
import type { ClipboardEvent } from 'react'
import { getPastedImageFile } from '../clipboardImage'
import { estimateProcessingSeconds, findLikelyUnrelatedImageMaterials, isOverloaded } from '../materialRisk'
import { useImageLightbox } from './ImageLightbox'
import { Tooltip } from './Tooltip'
import type { ChatMessage, ImageRef, TestCase, UploadedMaterial } from '../types'

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.xlsx,.md,.markdown,.txt,.png,.jpg,.jpeg'

interface ChatPanelProps {
  log: ChatMessage[]
  busy: boolean
  onSend: (message: string, file?: File) => void
  materials: UploadedMaterial[]
  selectedMaterialIds: string[]
  testCases: TestCase[]
  imageMap: Map<number, ImageRef>
  onDeselectMaterials: (ids: string[]) => void
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

export function ChatPanel({
  log,
  busy,
  onSend,
  materials,
  selectedMaterialIds,
  testCases,
  imageMap,
  onDeselectMaterials,
}: ChatPanelProps) {
  const [draft, setDraft] = useState('')
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const [attachedPreviewUrl, setAttachedPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const logEndRef = useRef<HTMLDivElement>(null)
  const { open: openPreview, lightbox } = useImageLightbox()
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

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
    onDeselectMaterials(selectedMaterialIds.filter((id) => !removeIds.has(id)))
  }

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'end' })
  }, [log, busy])

  useEffect(() => {
    if (!busy) {
      setElapsedSeconds(0)
      return
    }
    setElapsedSeconds(0)
    const timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [busy])

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
    setDraft('')
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
                {entry.questions.map((q, qIdx) => (
                  <div className="question-list-item" key={q.id}>
                    <span className="question-index">Q{qIdx + 1}.</span> {q.question}
                    {q.context && <span className="question-context">依據：{q.context}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className={`chat-bubble ${entry.role === 'user' ? 'answer' : 'question'}`}>
                  {entry.content}
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
            ⚠️ 目前勾選的素材內容量偏大（估計需要 {Math.round(estimatedSeconds)} 秒以上），容易讓模型處理逾時，暫時無法送出。請先取消勾選一些跟這次訊息無關的素材。
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
          onChange={(e) => setDraft(e.target.value)}
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
