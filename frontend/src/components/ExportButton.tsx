import { useState } from 'react'
import { exportExcel, exportMarkdown, updateTestCases } from '../api'
import type { GenerationResult } from '../types'

interface ExportButtonProps {
  sessionId: string
  result: GenerationResult
  onError: (message: string) => void
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function ExportButton({ sessionId, result, onError }: ExportButtonProps) {
  const [busy, setBusy] = useState<'markdown' | 'excel' | null>(null)

  const handleExport = async (format: 'markdown' | 'excel') => {
    setBusy(format)
    try {
      await updateTestCases(sessionId, result)
      if (format === 'markdown') {
        const blob = await exportMarkdown(sessionId)
        downloadBlob(blob, 'testcases.md')
      } else {
        const blob = await exportExcel(sessionId)
        downloadBlob(blob, 'testcases.xlsx')
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : '匯出失敗')
    } finally {
      setBusy(null)
    }
  }

  const disabled = busy !== null || result.test_cases.length === 0

  return (
    <div className="export-buttons">
      <button disabled={disabled} onClick={() => handleExport('markdown')}>
        {busy === 'markdown' ? '匯出中…' : '匯出成 Markdown'}
      </button>
      <button disabled={disabled} onClick={() => handleExport('excel')}>
        {busy === 'excel' ? '匯出中…' : '匯出成 Excel'}
      </button>
    </div>
  )
}
