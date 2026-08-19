import { useLayoutEffect, useRef } from 'react'
import type { TestCase, TestStep } from '../types'

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
    <div className="panel">
      <h2>3. 確認與編輯測試用例</h2>
      <p className="subtitle">
        請檢查 LLM 產出的內容，如有需要可直接修改後再匯出。共 {testCases.length} 筆用例。
      </p>

      {testCases.map((testCase, caseIndex) => (
        <div
          id={`field-case:${caseIndex}`}
          className={`case-card${isHighlighted(`case:${caseIndex}`) ? ' cell-highlight' : ''}`}
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
            <button className="secondary" onClick={() => removeCase(caseIndex)}>
              刪除用例
            </button>
          </div>

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
                return (
                  <tr
                    id={`field-${stepKey}`}
                    key={stepIndex}
                    className={rowHighlighted ? 'cell-highlight' : undefined}
                  >
                    <td>{step.step_no}</td>
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
        </div>
      ))}

      <button className="secondary" onClick={addCase}>
        + 新增測試用例
      </button>
    </div>
  )
}
