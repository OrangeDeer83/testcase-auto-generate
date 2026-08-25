import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useImageLightbox } from './ImageLightbox'
import type { ImageRef, TestCase, TestStep } from '../types'

interface DragInfo {
  caseIndex: number
  stepIndex: number
}

interface TestCaseTableProps {
  testCases: TestCase[]
  onChange: (testCases: TestCase[]) => void
  highlightedKeys?: Set<string>
  previousValues?: Map<string, string>
  onFieldFocus?: (keys: string[]) => void
  /** 有給值時，展開該筆用例並捲動過去——用於匯出被鎖定檢查擋下時，跳到第一筆未鎖定的用例。 */
  focusCaseIndex?: number | null
  /** 「圖N」編號 → 實際素材縮圖網址的反查表，用來畫每筆用例的「依據圖片」。 */
  imageMap?: Map<number, ImageRef>
}

interface AutoTextAreaProps {
  id?: string
  className?: string
  value: string
  placeholder?: string
  disabled?: boolean
  onChange: (value: string) => void
  onFocus?: () => void
}

/** 高度自動貼合內容的 textarea，不提供手動拖拉調整大小的控制點。 */
function AutoTextArea({ id, className, value, placeholder, disabled, onChange, onFocus }: AutoTextAreaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      id={id}
      rows={1}
      className={`auto-textarea${className ? ` ${className}` : ''}`}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
    />
  )
}

function emptyStep(stepNo: number): TestStep {
  return { step_no: stepNo, description: '', expected_result: '' }
}

function emptyCase(): TestCase {
  return {
    id: crypto.randomUUID(),
    name: '新測試用例',
    module: '',
    preconditions: '',
    priority: 'P2',
    notes: '',
    steps: [emptyStep(1)],
    locked: false,
    based_on_images: [],
  }
}

export function TestCaseTable({
  testCases,
  onChange,
  highlightedKeys,
  previousValues,
  onFieldFocus,
  focusCaseIndex,
  imageMap,
}: TestCaseTableProps) {
  const isHighlighted = (key: string) => highlightedKeys?.has(key) ?? false
  const previousValueOf = (key: string) => previousValues?.get(key)
  const focusClears = (keys: string[]) => () => onFieldFocus?.(keys)
  const { open: openPreview, lightbox } = useImageLightbox()

  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(
    () => new Set(testCases.length <= 2 ? testCases.map((_, i) => i) : []),
  )

  // 模型剛改過的用例自動展開，讓使用者不用自己點開就能看到變動內容。
  useEffect(() => {
    if (!highlightedKeys || highlightedKeys.size === 0) return
    setExpandedIndices((prev) => {
      const next = new Set(prev)
      let changed = false
      highlightedKeys.forEach((key) => {
        const match = key.match(/^case:(\d+)/)
        if (match) {
          const index = Number(match[1])
          if (!next.has(index)) {
            next.add(index)
            changed = true
          }
        }
      })
      return changed ? next : prev
    })
  }, [highlightedKeys])

  // 匯出時如果發現有未鎖定的用例會擋下並傳入 focusCaseIndex，這裡負責把它展開、捲動過去，
  // 讓使用者不用自己在一長串用例裡找是哪一筆。
  useEffect(() => {
    if (focusCaseIndex == null) return
    setExpandedIndices((prev) => {
      if (prev.has(focusCaseIndex)) return prev
      const next = new Set(prev)
      next.add(focusCaseIndex)
      return next
    })
    requestAnimationFrame(() => {
      document.getElementById(`field-case:${focusCaseIndex}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    })
  }, [focusCaseIndex])

  const toggleExpanded = (index: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const updateCase = (index: number, patch: Partial<TestCase>) => {
    const next = testCases.slice()
    next[index] = { ...next[index], ...patch }
    onChange(next)
  }

  const toggleLock = (index: number) => {
    updateCase(index, { locked: !testCases[index].locked })
  }

  const updateStep = (caseIndex: number, stepIndex: number, patch: Partial<TestStep>) => {
    const targetCase = testCases[caseIndex]
    const nextSteps = targetCase.steps.slice()
    nextSteps[stepIndex] = { ...nextSteps[stepIndex], ...patch }
    updateCase(caseIndex, { steps: nextSteps })
  }

  const addStep = (caseIndex: number) => {
    const targetCase = testCases[caseIndex]
    const nextStepNo = targetCase.steps.length + 1
    updateCase(caseIndex, { steps: [...targetCase.steps, emptyStep(nextStepNo)] })
  }

  const reorderSteps = (caseIndex: number, fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    const targetCase = testCases[caseIndex]
    const steps = targetCase.steps.slice()
    const [moved] = steps.splice(fromIndex, 1)
    steps.splice(toIndex, 0, moved)
    updateCase(caseIndex, { steps: steps.map((step, idx) => ({ ...step, step_no: idx + 1 })) })
  }

  const removeStep = (caseIndex: number, stepIndex: number) => {
    const targetCase = testCases[caseIndex]
    if (targetCase.steps.length <= 1) return
    const nextSteps = targetCase.steps
      .filter((_, idx) => idx !== stepIndex)
      .map((step, idx) => ({ ...step, step_no: idx + 1 }))
    updateCase(caseIndex, { steps: nextSteps })
  }

  const addCase = () => {
    onChange([...testCases, emptyCase()])
  }

  const removeCase = (caseIndex: number) => {
    if (!window.confirm(`確定要刪除「${testCases[caseIndex].name || '（未命名用例）'}」這筆測試用例嗎？無法復原。`)) {
      return
    }
    onChange(testCases.filter((_, idx) => idx !== caseIndex))
  }

  return (
    <div className="case-list">
      {testCases.map((testCase, caseIndex) => {
        const expanded = expandedIndices.has(caseIndex)
        const stepCount = testCase.steps.length
        const locked = testCase.locked
        return (
        <div
          id={`field-case:${caseIndex}`}
          className={`case-card${isHighlighted(`case:${caseIndex}`) ? ' cell-highlight' : ''}${expanded ? '' : ' case-card-collapsed'}${locked ? ' case-card-locked' : ''}`}
          key={caseIndex}
        >
          <span className="case-number">{caseIndex + 1}</span>
          <div className="case-card-header" onClick={() => toggleExpanded(caseIndex)}>
            {expanded && !locked ? (
              <input
                className="name-input"
                value={testCase.name}
                onChange={(e) => updateCase(caseIndex, { name: e.target.value })}
                onFocus={focusClears([`case:${caseIndex}`])}
                onClick={(e) => e.stopPropagation()}
                placeholder="用例名稱"
              />
            ) : (
              <span className="case-name-display">{testCase.name || '（未命名用例）'}</span>
            )}
            {!expanded && (
              <>
                <span className="case-priority-pill">{testCase.priority || '—'}</span>
                <span className="case-step-count">{stepCount} 個步驟</span>
              </>
            )}
            <button
              type="button"
              className={`case-lock-toggle${locked ? ' case-lock-toggle-locked' : ''}`}
              title={locked ? '解鎖，允許編輯' : '鎖定，標記為已審核'}
              onClick={(e) => {
                e.stopPropagation()
                toggleLock(caseIndex)
              }}
            >
              {locked ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path
                    d="M8 11V7a4 4 0 0 1 8 0v4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path
                    d="M8 11V7a4 4 0 0 1 7.4-2"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              )}
              {locked ? '已鎖定' : '鎖定'}
            </button>
            <button
              type="button"
              className="case-expand-toggle"
              title={expanded ? '收合' : '展開'}
              onClick={(e) => {
                e.stopPropagation()
                toggleExpanded(caseIndex)
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>

          {expanded && (
          <>
          {testCase.based_on_images.length > 0 && (
            <div className="case-based-on-images">
              <span className="case-based-on-images-label">依據圖片：</span>
              {testCase.based_on_images.map((number) => {
                const ref = imageMap?.get(number)
                if (!ref) return null
                return (
                  <span
                    key={number}
                    className="material-thumbnail-wrap case-based-on-image"
                    onClick={() => openPreview(ref.url, `圖${number}：${ref.filename}`)}
                  >
                    <img className="material-thumbnail" src={ref.url} alt={`圖${number}`} />
                    <span className="material-image-number">圖{number}</span>
                  </span>
                )
              })}
            </div>
          )}
          <div className="field-row">
            <label style={{ flex: 1 }}>
              所屬模塊
              <input
                id={`field-case:${caseIndex}:module`}
                className={isHighlighted(`case:${caseIndex}:module`) ? 'cell-highlight' : ''}
                value={testCase.module}
                disabled={locked}
                onChange={(e) => updateCase(caseIndex, { module: e.target.value })}
                onFocus={focusClears([`case:${caseIndex}`, `case:${caseIndex}:module`])}
                placeholder="例如 /模組/子功能"
              />
              {isHighlighted(`case:${caseIndex}:module`) &&
                previousValueOf(`case:${caseIndex}:module`) !== undefined && (
                  <div className="previous-value">
                    原本：{previousValueOf(`case:${caseIndex}:module`) || '（空）'}
                  </div>
                )}
            </label>
            <label>
              優先級
              <input
                id={`field-case:${caseIndex}:priority`}
                className={isHighlighted(`case:${caseIndex}:priority`) ? 'cell-highlight' : ''}
                value={testCase.priority}
                disabled={locked}
                onChange={(e) => updateCase(caseIndex, { priority: e.target.value })}
                onFocus={focusClears([`case:${caseIndex}`, `case:${caseIndex}:priority`])}
                style={{ width: 80 }}
              />
              {isHighlighted(`case:${caseIndex}:priority`) &&
                previousValueOf(`case:${caseIndex}:priority`) !== undefined && (
                  <div className="previous-value">
                    原本：{previousValueOf(`case:${caseIndex}:priority`) || '（空）'}
                  </div>
                )}
            </label>
            <label style={{ flex: 1 }}>
              前置條件
              <input
                id={`field-case:${caseIndex}:preconditions`}
                className={isHighlighted(`case:${caseIndex}:preconditions`) ? 'cell-highlight' : ''}
                value={testCase.preconditions}
                disabled={locked}
                onChange={(e) => updateCase(caseIndex, { preconditions: e.target.value })}
                onFocus={focusClears([`case:${caseIndex}`, `case:${caseIndex}:preconditions`])}
              />
              {isHighlighted(`case:${caseIndex}:preconditions`) &&
                previousValueOf(`case:${caseIndex}:preconditions`) !== undefined && (
                  <div className="previous-value">
                    原本：{previousValueOf(`case:${caseIndex}:preconditions`) || '（空）'}
                  </div>
                )}
            </label>
          </div>

          <table className="testcase-table">
            <thead>
              <tr>
                <th style={{ width: 48 }}>步驟</th>
                <th>描述</th>
                <th>預期結果</th>
                <th style={{ width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {testCase.steps.map((step, stepIndex) => {
                const stepKey = `case:${caseIndex}:step:${stepIndex}`
                const rowHighlighted = isHighlighted(stepKey)
                const prevDescription = previousValueOf(`${stepKey}:description`)
                const prevExpected = previousValueOf(`${stepKey}:expected_result`)
                const isDragging =
                  dragInfo?.caseIndex === caseIndex && dragInfo.stepIndex === stepIndex
                const isDragOver =
                  dragInfo?.caseIndex === caseIndex &&
                  dragOverIndex === stepIndex &&
                  dragInfo.stepIndex !== stepIndex
                return (
                  <tr
                    id={`field-${stepKey}`}
                    key={stepIndex}
                    className={
                      [
                        rowHighlighted ? 'cell-highlight' : '',
                        isDragging ? 'step-dragging' : '',
                        isDragOver ? 'step-drag-over' : '',
                      ]
                        .filter(Boolean)
                        .join(' ') || undefined
                    }
                    onDragOver={(e) => {
                      if (dragInfo?.caseIndex !== caseIndex) return
                      e.preventDefault()
                      if (dragOverIndex !== stepIndex) setDragOverIndex(stepIndex)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (dragInfo?.caseIndex === caseIndex) {
                        reorderSteps(caseIndex, dragInfo.stepIndex, stepIndex)
                      }
                      setDragInfo(null)
                      setDragOverIndex(null)
                    }}
                  >
                    <td
                      className="step-number-cell"
                      draggable={testCase.steps.length > 1 && !locked}
                      onDragStart={() => setDragInfo({ caseIndex, stepIndex })}
                      onDragEnd={() => {
                        setDragInfo(null)
                        setDragOverIndex(null)
                      }}
                    >
                      <span className="step-number-inner">
                        {testCase.steps.length > 1 && !locked && (
                          <span className="step-drag-grip" aria-hidden="true">
                            <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor">
                              <circle cx="2" cy="2" r="1.3" />
                              <circle cx="6" cy="2" r="1.3" />
                              <circle cx="2" cy="7" r="1.3" />
                              <circle cx="6" cy="7" r="1.3" />
                              <circle cx="2" cy="12" r="1.3" />
                              <circle cx="6" cy="12" r="1.3" />
                            </svg>
                          </span>
                        )}
                        {step.step_no}
                      </span>
                    </td>
                    <td>
                      <AutoTextArea
                        id={`field-${stepKey}:description`}
                        className={
                          rowHighlighted || isHighlighted(`${stepKey}:description`)
                            ? 'cell-highlight'
                            : ''
                        }
                        value={step.description}
                        disabled={locked}
                        onChange={(value) =>
                          updateStep(caseIndex, stepIndex, { description: value })
                        }
                        onFocus={focusClears([
                          `case:${caseIndex}`,
                          stepKey,
                          `${stepKey}:description`,
                        ])}
                      />
                      {isHighlighted(`${stepKey}:description`) && prevDescription !== undefined && (
                        <div className="previous-value">原本：{prevDescription || '（空）'}</div>
                      )}
                    </td>
                    <td>
                      <AutoTextArea
                        id={`field-${stepKey}:expected_result`}
                        className={
                          rowHighlighted || isHighlighted(`${stepKey}:expected_result`)
                            ? 'cell-highlight'
                            : ''
                        }
                        value={step.expected_result}
                        disabled={locked}
                        onChange={(value) =>
                          updateStep(caseIndex, stepIndex, { expected_result: value })
                        }
                        onFocus={focusClears([
                          `case:${caseIndex}`,
                          stepKey,
                          `${stepKey}:expected_result`,
                        ])}
                      />
                      {isHighlighted(`${stepKey}:expected_result`) && prevExpected !== undefined && (
                        <div className="previous-value">原本：{prevExpected || '（空）'}</div>
                      )}
                    </td>
                    <td>
                      <button
                        className="secondary"
                        disabled={locked}
                        onClick={() => removeStep(caseIndex, stepIndex)}
                      >
                        刪除
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 8 }}>
            <button className="secondary" disabled={locked} onClick={() => addStep(caseIndex)}>
              + 新增步驟
            </button>
          </div>

          <label style={{ display: 'block', marginTop: 12 }}>
            備註
            <AutoTextArea
              id={`field-case:${caseIndex}:notes`}
              className={`notes-textarea${isHighlighted(`case:${caseIndex}:notes`) ? ' cell-highlight' : ''}`}
              value={testCase.notes}
              disabled={locked}
              onChange={(value) => updateCase(caseIndex, { notes: value })}
              onFocus={focusClears([`case:${caseIndex}`, `case:${caseIndex}:notes`])}
            />
            {isHighlighted(`case:${caseIndex}:notes`) &&
              previousValueOf(`case:${caseIndex}:notes`) !== undefined && (
                <div className="previous-value">
                  原本：{previousValueOf(`case:${caseIndex}:notes`) || '（空）'}
                </div>
              )}
          </label>

          <div className="case-footer">
            <button
              type="button"
              className="case-delete-button"
              disabled={locked}
              onClick={() => removeCase(caseIndex)}
            >
              刪除這筆測試用例
            </button>
          </div>
          </>
          )}
        </div>
        )
      })}

      <button className="secondary" onClick={addCase}>
        + 新增測試用例
      </button>
      {lightbox}
    </div>
  )
}
