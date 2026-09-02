import { useEffect, useRef } from 'react'
import type { MouseEvent, ReactNode } from 'react'

interface ModalOverlayProps {
  onClose: () => void
  panelClassName?: string
  overlayClassName?: string
  children: ReactNode
}

// 模組層級、所有 ModalOverlay 實例共用的一份堆疊，記錄目前疊著的視窗、由外到內
// 的掛載順序——不能放在元件的 state 或 ref 裡，因為要跨越不同視窗各自獨立的
// React 元件實例才能知道「還有沒有別的視窗疊在我上面」。
let modalStack: symbol[] = []

/**
 * 點擊遮罩關閉彈出視窗的共用外殼。
 *
 * 不能只判斷 click 事件的 target 是不是遮罩本身：在面板內選取文字時，如果放開滑鼠的
 * 位置剛好落在面板外的遮罩上，瀏覽器合成出的 click 事件 target 會是 mousedown/mouseup
 * 兩者的最近共同祖先（也就是遮罩），跟真正點擊遮罩沒有兩樣，會誤觸關閉。因此改成記錄
 * mousedown 當下是否真的按在遮罩本身，只有這樣才視為使用者想點擊外部關閉。
 */
export function ModalOverlay({ onClose, panelClassName, overlayClassName, children }: ModalOverlayProps) {
  const mouseDownOnOverlay = useRef(false)
  // 掛載順序當作這個視窗在堆疊裡的識別——用來判斷「按 Esc 時我是不是最上層」。
  const stackIdRef = useRef(Symbol('modal'))

  useEffect(() => {
    modalStack.push(stackIdRef.current)
    return () => {
      modalStack = modalStack.filter((id) => id !== stackIdRef.current)
    }
  }, [])

  // 按 Esc 關閉——這是共用外殼，圖片放大檢視、素材編輯、確認彈窗等所有走
  // ModalOverlay 的視窗都會一起拿到這個行為，不用每個呼叫端各自接一份鍵盤事件。
  // 這些視窗有機會疊在一起（例如編輯素材視窗裡點縮圖再開圖片放大檢視），
  // 只讓「目前最上層」的那一個回應 Esc，一次只關掉最外面那一層，不是同時
  // 把整疊視窗都關掉。
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (modalStack[modalStack.length - 1] !== stackIdRef.current) return
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className={overlayClassName ? `modal-overlay ${overlayClassName}` : 'modal-overlay'}
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
