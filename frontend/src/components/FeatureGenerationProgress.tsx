import { useEffect, useRef, useState } from 'react'
import { generateScoped } from '../api'
import { extractStreamProgress } from '../streamProgress'
import { mergeFeatureResults } from '../mergeFeatureResults'
import type { FeatureBreakdownItem, GenerationResult } from '../types'

/** 同時最多幾個功能一起送出——平行送出是為了縮短總等待時間，但無上限地一次
 * 送出全部功能，可能瞬間對內部 LLM 服務送出過多請求，這裡設一個簡單的併發
 * 上限當作保護，不是嚴謹的流量控制。 */
const MAX_CONCURRENT = 4

interface FeatureProgress {
  status: 'pending' | 'running' | 'done' | 'error'
  lines: ReturnType<typeof extractStreamProgress>
  result?: GenerationResult
  error?: string
}

interface FeatureGenerationProgressProps {
  projectId: string
  conversationId: string
  features: FeatureBreakdownItem[]
  onComplete: (merged: GenerationResult) => void
}

/** 使用者在 FeatureBreakdownPanel 按下確認後，對每個功能各自呼叫一次
 * /generate-scoped（平行送出，見 MAX_CONCURRENT），畫面上各自顯示進度；
 * 單一功能失敗不擋住其他功能，全部塵埃落定後才讓使用者按下「完成」，
 * 由呼叫端（WorkspacePage）合併結果並透過既有的 updateTestCases 一次提交。 */
export function FeatureGenerationProgress({
  projectId,
  conversationId,
  features,
  onComplete,
}: FeatureGenerationProgressProps) {
  const [progress, setProgress] = useState<Record<string, FeatureProgress>>(() =>
    Object.fromEntries(features.map((f) => [f.id, { status: 'pending', lines: [] }])),
  )
  const startedRef = useRef(false)

  const runFeature = (feature: FeatureBreakdownItem) => {
    setProgress((prev) => ({ ...prev, [feature.id]: { status: 'running', lines: [] } }))
    let buffer = ''
    return generateScoped(projectId, conversationId, feature.id, (text) => {
      buffer += text
      const lines = extractStreamProgress(buffer)
      setProgress((prev) =>
        lines.length > (prev[feature.id]?.lines.length ?? 0)
          ? { ...prev, [feature.id]: { ...prev[feature.id], status: 'running', lines } }
          : prev,
      )
    })
      .then((result) => {
        setProgress((prev) => ({
          ...prev,
          [feature.id]: { status: 'done', lines: prev[feature.id]?.lines ?? [], result },
        }))
      })
      .catch((err) => {
        setProgress((prev) => ({
          ...prev,
          [feature.id]: {
            status: 'error',
            lines: prev[feature.id]?.lines ?? [],
            error: err instanceof Error ? err.message : '產生失敗',
          },
        }))
      })
  }

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    const queue = [...features]
    const next = (): Promise<void> => {
      const feature = queue.shift()
      if (!feature) return Promise.resolve()
      return runFeature(feature).then(next)
    }
    Array.from({ length: Math.min(MAX_CONCURRENT, features.length) }, next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const allSettled = features.every(
    (f) => progress[f.id]?.status === 'done' || progress[f.id]?.status === 'error',
  )
  const hasError = features.some((f) => progress[f.id]?.status === 'error')

  const handleFinish = () => {
    const results = features
      .map((f) => progress[f.id]?.result)
      .filter((r): r is GenerationResult => !!r)
    onComplete(mergeFeatureResults(results))
  }

  return (
    <div className="feature-generation-progress">
      <p className="subtitle" style={{ marginTop: 0 }}>
        正在依功能各自產生測試用例（同時最多 {MAX_CONCURRENT} 個）…
      </p>
      <ul className="feature-generation-list">
        {features.map((feature) => {
          const state = progress[feature.id]
          return (
            <li
              key={feature.id}
              className={`feature-generation-item feature-generation-item-${state?.status ?? 'pending'}`}
            >
              <div className="feature-generation-item-header">
                <span className="feature-generation-item-name">{feature.name}</span>
                <span className="feature-generation-item-status">
                  {state?.status === 'pending' && '等待中'}
                  {state?.status === 'running' && '產生中…'}
                  {state?.status === 'done' && `完成 ${state.result?.test_cases.length ?? 0} 筆`}
                  {state?.status === 'error' && '失敗'}
                </span>
              </div>
              {state?.status === 'running' && state.lines.length > 0 && (
                <ul className="feature-generation-item-lines">
                  {state.lines.slice(-3).map((line, idx) => (
                    <li key={idx}>
                      {line.kind === 'question' ? '❓' : '📝'} {line.text}
                    </li>
                  ))}
                </ul>
              )}
              {state?.status === 'error' && (
                <div className="feature-generation-item-error">
                  <span>{state.error}</span>
                  <button type="button" className="secondary" onClick={() => runFeature(feature)}>
                    重試
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {allSettled && (
        <div className="feature-generation-actions">
          {hasError && (
            <p className="feature-generation-warning">部分功能產生失敗，繼續的話會忽略失敗的功能（不會產生它們的用例）。</p>
          )}
          <button type="button" onClick={handleFinish}>
            {hasError ? '忽略失敗的功能，完成產生' : '完成'}
          </button>
        </div>
      )}
    </div>
  )
}
