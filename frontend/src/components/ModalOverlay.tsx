import { useRef } from 'react'
import type { MouseEvent, ReactNode } from 'react'

interface ModalOverlayProps {
  onClose: () => void
  panelClassName?: string
  children: ReactNode
}

/**
 * 點擊遮罩關閉彈出視窗的共用外殼。
 *
 * 不能只判斷 click 事件的 target 是不是遮罩本身：在面板內選取文字時，如果放開滑鼠的
 * 位置剛好落在面板外的遮罩上，瀏覽器合成出的 click 事件 target 會是 mousedown/mouseup
 * 兩者的最近共同祖先（也就是遮罩），跟真正點擊遮罩沒有兩樣，會誤觸關閉。因此改成記錄
 * mousedown 當下是否真的按在遮罩本身，只有這樣才視為使用者想點擊外部關閉。
 */
export function ModalOverlay({ onClose, panelClassName, children }: ModalOverlayProps) {
  const mouseDownOnOverlay = useRef(false)

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e: MouseEvent<HTMLDivElement>) => {
        mouseDownOnOverlay.current = e.target === e.currentTarget
      }}
      onClick={(e: MouseEvent<HTMLDivElement>) => {
        if (mouseDownOnOverlay.current && e.target === e.currentTarget) onClose()
      }}
    >
      <div className={panelClassName ? `modal-panel ${panelClassName}` : 'modal-panel'} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
