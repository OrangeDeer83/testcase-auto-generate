import { useState } from 'react'
import { ModalOverlay } from './ModalOverlay'

const MIN_ZOOM = 1
const MAX_ZOOM = 3
const ZOOM_STEP = 0.5

/** 縮圖點擊放大的共用邏輯——素材庫、測試用例的依據圖片、聊天室裡的附加圖片，
 * 三個地方都需要同一套「點縮圖 → 用 ModalOverlay 蓋一張大圖」的行為，抽出來共用，
 * 不用三個地方各自重複一份 previewSrc state 跟 Modal 排版。
 *
 * zoom 的基準（100%）是「填滿彈出視窗的寬度」，不是圖片的原始像素尺寸——很多截圖
 * 本身解析度就不高，只用原始尺寸顯示的話在大螢幕上會小到看不清楚文字；放大鈕再從
 * 這個基準往上加碼，超出視窗範圍時交給外層的捲動容器處理，不用另外寫拖曳平移邏輯。 */
export function useImageLightbox() {
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [previewTitle, setPreviewTitle] = useState<string | undefined>(undefined)
  const [zoom, setZoom] = useState(MIN_ZOOM)

  const open = (src: string, title?: string) => {
    setPreviewSrc(src)
    setPreviewTitle(title)
    setZoom(MIN_ZOOM)
  }

  const close = () => {
    setPreviewSrc(null)
    setZoom(MIN_ZOOM)
  }

  const zoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))
  const zoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))

  const lightbox = previewSrc ? (
    <ModalOverlay onClose={close} panelClassName="material-thumbnail-preview">
      <div className="modal-header">
        <h2>{previewTitle ?? '圖片預覽'}</h2>
        <div className="image-preview-toolbar">
          <button
            type="button"
            className="secondary"
            title="縮小"
            disabled={zoom <= MIN_ZOOM}
            onClick={zoomOut}
          >
            −
          </button>
          <span className="image-preview-zoom-level">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="secondary"
            title="放大"
            disabled={zoom >= MAX_ZOOM}
            onClick={zoomIn}
          >
            ＋
          </button>
          <button className="secondary" onClick={close}>
            關閉
          </button>
        </div>
      </div>
      <div className="image-preview-scroll">
        <img src={previewSrc} alt={previewTitle ?? '圖片預覽'} style={{ width: `${zoom * 100}%` }} />
      </div>
    </ModalOverlay>
  ) : null

  return { open, lightbox }
}
