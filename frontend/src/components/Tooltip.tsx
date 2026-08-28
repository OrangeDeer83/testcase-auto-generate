import { cloneElement, isValidElement, useRef, useState } from 'react'
import type { FocusEvent, MouseEvent, ReactElement } from 'react'
import { createPortal } from 'react-dom'

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

type AnchorProps = {
  ref?: unknown
  onMouseEnter?: (e: MouseEvent) => void
  onMouseLeave?: (e: MouseEvent) => void
  onFocus?: (e: FocusEvent) => void
  onBlur?: (e: FocusEvent) => void
}

const GAP = 10

/**
 * 全站統一的 hover 提示元件——不要用瀏覽器原生的 title 屬性，樣式沒辦法跟畫面
 * 其他地方一致，也沒辦法換行顯示比較長的說明文字。
 *
 * 用 cloneElement 把量測用的 ref 跟滑鼠/焦點事件直接掛在子元素本身，不另外包一層
 * <span>：一開始的版本包了 anchor span，結果讓好幾個依賴「跟父層 flex/寬度 100%
 * 直接關聯」的既有樣式壞掉（例如 project-switcher-trigger 的 width:100%、
 * material-card-delete 的 position:absolute 定位基準），多包一層容器就會在
 * 排版樹裡插入一個沒被那些樣式規則預期到的節點。改成 cloneElement 之後子元素在
 * DOM 裡的位置完全不變，量測跟事件監聽都是直接發生在它自己身上。
 *
 * 提示框本身透過 portal 掛到 document.body 上，不受任何祖先容器的
 * overflow:hidden／overflow:auto 影響（例如側欄收合時的圖示清單、表格儲存格）。
 */
export function Tooltip({
  label,
  meta,
  placement = 'top',
  wrap = false,
  children,
}: {
  label: string
  meta?: string
  placement?: TooltipPlacement
  wrap?: boolean
  children: ReactElement
}) {
  const anchorRef = useRef<HTMLElement | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const show = () => {
    const rect = anchorRef.current?.getBoundingClientRect()
    if (!rect) return
    if (placement === 'right') {
      setPos({ top: rect.top + rect.height / 2, left: rect.right + GAP })
    } else if (placement === 'left') {
      setPos({ top: rect.top + rect.height / 2, left: rect.left - GAP })
    } else if (placement === 'bottom') {
      setPos({ top: rect.bottom + GAP, left: rect.left + rect.width / 2 })
    } else {
      setPos({ top: rect.top - GAP, left: rect.left + rect.width / 2 })
    }
  }
  const hide = () => setPos(null)

  if (!isValidElement(children)) return children

  const child = children as ReactElement<AnchorProps>
  const originalRef = child.props.ref
  const anchor = cloneElement(child, {
    ref: (node: HTMLElement | null) => {
      anchorRef.current = node
      if (typeof originalRef === 'function') originalRef(node)
      else if (originalRef && typeof originalRef === 'object') {
        ;(originalRef as { current: HTMLElement | null }).current = node
      }
    },
    onMouseEnter: (e: MouseEvent) => {
      child.props.onMouseEnter?.(e)
      show()
    },
    onMouseLeave: (e: MouseEvent) => {
      child.props.onMouseLeave?.(e)
      hide()
    },
    onFocus: (e: FocusEvent) => {
      child.props.onFocus?.(e)
      show()
    },
    onBlur: (e: FocusEvent) => {
      child.props.onBlur?.(e)
      hide()
    },
  } as AnchorProps)

  return (
    <>
      {anchor}
      {pos &&
        createPortal(
          <div
            className={`hover-tooltip hover-tooltip-${placement}${wrap ? ' hover-tooltip-wrap' : ''}`}
            role="tooltip"
            style={{ top: pos.top, left: pos.left }}
          >
            <span className="hover-tooltip-title">{label}</span>
            {meta && <span className="hover-tooltip-meta">{meta}</span>}
          </div>,
          document.body,
        )}
    </>
  )
}
