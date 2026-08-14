import type { TestCase, TestStep } from '../types'

interface TestCaseTableProps {
  testCases: TestCase[]
  onChange: (testCases: TestCase[]) => void
  highlightedKeys?: Set<string>
}

function emptyStep(stepNo: number): TestStep {
  return { step_no: stepNo, description: '', expected_result: '' }
}

function emptyCase(): TestCase {
  return { name: '新測試用例', preconditions: '', priority: 'P2', steps: [emptyStep(1)] }
}

export function TestCaseTable({ testCases, onChange, highlightedKeys }: TestCaseTableProps) {
  const isHighlighted = (key: string) => highlightedKeys?.has(key) ?? false
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
      <p className="subtitle">請檢查 LLM 產出的內容，如有需要可直接修改後再匯出。</p>

      {testCases.map((testCase, caseIndex) => (
        <div
          className={`case-card${isHighlighted(`case:${caseIndex}`) ? ' cell-highlight' : ''}`}
          key={caseIndex}
        >
          <div className="case-card-header">
            <input
              className="name-input"
              value={testCase.name}
              onChange={(e) => updateCase(caseIndex, { name: e.target.value })}
              placeholder="用例名稱"
            />
            <button className="secondary" onClick={() => removeCase(caseIndex)}>
              刪除用例
            </button>
          </div>

          <div className="field-row">
            <label>
              優先級
              <input
                className={isHighlighted(`case:${caseIndex}:priority`) ? 'cell-highlight' : ''}
                value={testCase.priority}
                onChange={(e) => updateCase(caseIndex, { priority: e.target.value })}
                style={{ width: 80 }}
              />
            </label>
            <label style={{ flex: 1 }}>
              前置條件
              <input
                className={isHighlighted(`case:${caseIndex}:preconditions`) ? 'cell-highlight' : ''}
                value={testCase.preconditions}
                onChange={(e) => updateCase(caseIndex, { preconditions: e.target.value })}
              />
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
                return (
                  <tr key={stepIndex} className={rowHighlighted ? 'cell-highlight' : undefined}>
                    <td>{step.step_no}</td>
                    <td>
                      <textarea
                        className={
                          rowHighlighted || isHighlighted(`${stepKey}:description`)
                            ? 'cell-highlight'
                            : ''
                        }
                        value={step.description}
                        onChange={(e) =>
                          updateStep(caseIndex, stepIndex, { description: e.target.value })
                        }
                      />
                    </td>
                    <td>
                      <textarea
                        className={
                          rowHighlighted || isHighlighted(`${stepKey}:expected_result`)
                            ? 'cell-highlight'
                            : ''
                        }
                        value={step.expected_result}
                        onChange={(e) =>
                          updateStep(caseIndex, stepIndex, { expected_result: e.target.value })
                        }
                      />
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
        </div>
      ))}

      <button className="secondary" onClick={addCase}>
        + 新增測試用例
      </button>
    </div>
  )
}
