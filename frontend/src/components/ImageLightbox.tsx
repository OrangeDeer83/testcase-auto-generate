import { useRef, useState } from 'react'
import { ModalOverlay } from './ModalOverlay'

const MIN_ZOOM = 1
const MAX_ZOOM = 4
const ZOOM_STEP = 0.5

interface PanState {
  x: number
  y: number
}

/** 縮圖點擊放大的共用邏輯——素材庫、測試用例的依據圖片、聊天室裡的附加圖片，
 * 三個地方都需要同一套「點縮圖 → 全螢幕看大圖」的行為，抽出來共用，不用三個
 * 地方各自重複一份 state 跟排版。
 *
 * 改成全螢幕深色檢視器（取代原本裝在小彈窗裡、靠捲軸看超出範圍內容的做法）：
 * zoom 的基準（100%）是「填滿視窗寬度」，不是圖片的原始像素尺寸——很多截圖
 * 本身解析度就不高，只用原始尺寸顯示的話會小到看不清楚文字。放大超出可視範圍
 * 時，直接左鍵按住拖曳圖片本身來平移，比原本的捲軸更直覺、也更符合一般圖片
 * 檢視器的操作習慣。 */
export function useImageLightbox() {
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [previewTitle, setPreviewTitle] = useState<string | undefined>(undefined)
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const [pan, setPan] = useState<PanState>({ x: 0, y: 0 })
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const open = (src: string, title?: string) => {
    setPreviewSrc(src)
    setPreviewTitle(title)
    setZoom(MIN_ZOOM)
    setPan({ x: 0, y: 0 })
  }

  const close = () => {
    setPreviewSrc(null)
    setZoom(MIN_ZOOM)
    setPan({ x: 0, y: 0 })
  }

  // 縮放時重置平移位置，避免縮小之後圖片停留在原本放大時拖到的偏移量，
  // 使用者反而要先猜一次圖片被拖去哪裡了才找得回來。
  const zoomIn = () => {
    setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))
    setPan({ x: 0, y: 0 })
  }
  const zoomOut = () => {
    setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))
    setPan({ x: 0, y: 0 })
  }

  // 拖曳平移比照 FloatingChat.tsx 拖拉調整視窗大小的寫法：拖曳中的 mousemove／
  // mouseup 掛在 window 上，這樣滑鼠移動太快、暫時跑出圖片範圍之外也不會中斷。
  const handleImageMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
    setIsDragging(true)

    const handleMove = (moveEvent: MouseEvent) => {
      const start = dragStartRef.current
      if (!start) return
      setPan({ x: start.panX + (moveEvent.clientX - start.x), y: start.panY + (moveEvent.clientY - start.y) })
    }
    const handleUp = () => {
      dragStartRef.current = null
      setIsDragging(false)
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  const lightbox = previewSrc ? (
    <ModalOverlay onClose={close} overlayClassName="image-viewer-overlay" panelClassName="image-viewer-panel">
      <div className="image-viewer-toolbar">
        {previewTitle && <span className="image-viewer-title">{previewTitle}</span>}
        <div className="image-viewer-toolbar-buttons">
          <button type="button" title="縮小" disabled={zoom <= MIN_ZOOM} onClick={zoomOut}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.35-4.35M8 11h6" />
            </svg>
          </button>
          <span className="image-viewer-zoom-level">{Math.round(zoom * 100)}%</span>
          <button type="button" title="放大" disabled={zoom >= MAX_ZOOM} onClick={zoomIn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
            </svg>
          </button>
          <button type="button" title="關閉" onClick={close}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>
      <div className="image-viewer-stage">
        <img
          src={previewSrc}
          alt={previewTitle ?? '圖片預覽'}
          className={isDragging ? 'image-viewer-img dragging' : 'image-viewer-img'}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          onMouseDown={handleImageMouseDown}
          draggable={false}
        />
      </div>
    </ModalOverlay>
  ) : null

  return { open, lightbox }
}
