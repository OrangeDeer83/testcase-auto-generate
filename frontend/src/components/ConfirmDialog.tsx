import type { ReactNode } from 'react'
import { ModalOverlay } from './ModalOverlay'

interface ConfirmDialogProps {
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** 這個動作是不是有風險（例如刪除、無法復原）——是的話確定按鈕改用警示紅色，
   * 跟畫面上其他「刪除」相關的按鈕（例如用例列表的刪除按鈕）用同一種紅色。 */
  danger?: boolean
  /** 內容比較豐富（例如列出好幾組清單）時，額外加一個 class 讓面板可以比預設寬，
   * 會疊加在基礎的 confirm-dialog-panel 之上，不是取代它。 */
  panelClassName?: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * 取代 window.confirm 的通用確認彈窗。瀏覽器原生的 window.confirm 只有一句純文字、
 * 排版完全交給瀏覽器決定，跟畫面上其他自訂彈窗（例如取消勾選素材的風險警示視窗）
 * 長得不一樣，使用者體驗不一致；這裡統一用同一套 ModalOverlay + modal-header 外殼，
 * 讓「需要使用者確認」這件事在整個畫面上只有一種樣式。
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = '確定',
  cancelLabel = '取消',
  danger = false,
  panelClassName,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <ModalOverlay
      onClose={onCancel}
      panelClassName={panelClassName ? `confirm-dialog-panel ${panelClassName}` : 'confirm-dialog-panel'}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button type="button" className="secondary" onClick={onCancel}>
          關閉
        </button>
      </div>
      <div className="confirm-dialog-message">{message}</div>
      <div className="confirm-dialog-actions">
        <button type="button" className="secondary" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={danger ? 'confirm-dialog-danger-button' : undefined}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </ModalOverlay>
  )
}
