import { useState } from 'react'
import { ModalOverlay } from './ModalOverlay'

/** 縮圖點擊放大的共用邏輯——素材庫、測試用例的依據圖片、聊天室裡的附加圖片，
 * 三個地方都需要同一套「點縮圖 → 用 ModalOverlay 蓋一張大圖」的行為，抽出來共用，
 * 不用三個地方各自重複一份 previewSrc state 跟 Modal 排版。 */
export function useImageLightbox() {
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [previewTitle, setPreviewTitle] = useState<string | undefined>(undefined)

  const open = (src: string, title?: string) => {
    setPreviewSrc(src)
    setPreviewTitle(title)
  }

  const lightbox = previewSrc ? (
    <ModalOverlay onClose={() => setPreviewSrc(null)} panelClassName="material-thumbnail-preview">
      <div className="modal-header">
        <h2>{previewTitle ?? '圖片預覽'}</h2>
        <button className="secondary" onClick={() => setPreviewSrc(null)}>
          關閉
        </button>
      </div>
      <img src={previewSrc} alt={previewTitle ?? '圖片預覽'} />
    </ModalOverlay>
  ) : null

  return { open, lightbox }
}
