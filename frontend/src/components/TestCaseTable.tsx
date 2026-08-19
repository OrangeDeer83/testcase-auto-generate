import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { TestCase, TestStep } from '../types'

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
}

interface AutoTextAreaProps {
  id?: string
  className?: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
  onFocus?: () => void
}

/** 高度自動貼合內容的 textarea，不提供手動拖拉調整大小的控制點。 */
function AutoTextArea({ id, className, value, placeholder, onChange, onFocus }: AutoTextAreaProps) {
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
    name: '新測試用例',
    module: '',
    preconditions: '',
    priority: 'P2',
    notes: '',
    steps: [emptyStep(1)],
  }
}

export function TestCaseTable({
  testCases,
  onChange,
  highlightedKeys,
  previousValues,
  onFieldFocus,
}: TestCaseTableProps) {
  const isHighlighted = (key: string) => highlightedKeys?.has(key) ?? false
  const previousValueOf = (key: string) => previousValues?.get(key)
  const focusClears = (keys: string[]) => () => onFieldFocus?.(keys)

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
    onChange(testCases.filter((_, idx) => idx !== caseIndex))
  }

  return (
    <div className="case-list">
      {testCases.map((testCase, caseIndex) => {
        const expanded = expandedIndices.has(caseIndex)
        const stepCount = testCase.steps.length
        return (
        <div
          id={`field-case:${caseIndex}`}
          className={`case-card${isHighlighted(`case:${caseIndex}`) ? ' cell-highlight' : ''}${expanded ? '' : ' case-card-collapsed'}`}
          key={caseIndex}
        >
          <span className="case-number">{caseIndex + 1}</span>
          <div className="case-card-header">
            <input
              className="name-input"
              value={testCase.name}
              onChange={(e) => updateCase(caseIndex, { name: e.target.value })}
              onFocus={focusClears([`case:${caseIndex}`])}
              placeholder="用例名稱"
            />
            {!expanded && (
              <>
                <span className="case-priority-pill">{testCase.priority || '—'}</span>
                <span className="case-step-count">{stepCount} 個步驟</span>
              </>
            )}
            <button
              type="button"
              className="case-expand-toggle"
              title={expanded ? '收合' : '展開'}
              onClick={() => toggleExpanded(caseIndex)}
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
            {expanded && (
              <button className="secondary" onClick={() => removeCase(caseIndex)}>
                刪除用例
              </button>
            )}
          </div>

          {expanded && (
          <>
          <div className="field-row">
            <label style={{ flex: 1 }}>
              所屬模塊
              <input
                id={`field-case:${caseIndex}:module`}
                className={isHighlighted(`case:${caseIndex}:module`) ? 'cell-highlight' : ''}
                value={testCase.module}
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
                      draggable={testCase.steps.length > 1}
                      onDragStart={() => setDragInfo({ caseIndex, stepIndex })}
                      onDragEnd={() => {
                        setDragInfo(null)
                        setDragOverIndex(null)
                      }}
                    >
                      {testCase.steps.length > 1 && (
                        <span className="step-drag-grip" aria-hidden="true">
                          ⠿
                        </span>
                      )}
                      {step.step_no}
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
                      <button className="secondary" onClick={() => removeStep(caseIndex, stepIndex)}>
                        刪除
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 8 }}>
            <button className="secondary" onClick={() => addStep(caseIndex)}>
              + 新增步驟
            </button>
          </div>

          <label style={{ display: 'block', marginTop: 12 }}>
            備註
            <AutoTextArea
              id={`field-case:${caseIndex}:notes`}
              className={`notes-textarea${isHighlighted(`case:${caseIndex}:notes`) ? ' cell-highlight' : ''}`}
              value={testCase.notes}
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
          </>
          )}
        </div>
        )
      })}

      <button className="secondary" onClick={addCase}>
        + 新增測試用例
      </button>
    </div>
  )
}
