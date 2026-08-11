import { useState } from 'react'
import { exportMarkdown, updateTestCases } from '../api'
import type { GenerationResult } from '../types'

interface ExportButtonProps {
  sessionId: string
  result: GenerationResult
  onError: (message: string) => void
}

export function ExportButton({ sessionId, result, onError }: ExportButtonProps) {
  const [busy, setBusy] = useState(false)

  const handleExport = async () => {
    setBusy(true)
    try {
      await updateTestCases(sessionId, result)
      const blob = await exportMarkdown(sessionId)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'testcases.md'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      onError(err instanceof Error ? err.message : '匯出失敗')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button disabled={busy || result.test_cases.length === 0} onClick={handleExport}>
      {busy ? '匯出中…' : '匯出成 Markdown'}
    </button>
  )
}
