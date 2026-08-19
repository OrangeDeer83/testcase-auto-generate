import { useState } from 'react'
import { exportExcel, updateTestCases } from '../api'
import type { GenerationResult } from '../types'

interface ExportButtonProps {
  projectId: string
  conversationId: string
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

export function ExportButton({ projectId, conversationId, result, onError }: ExportButtonProps) {
  const [busy, setBusy] = useState(false)

  const handleExport = async () => {
    setBusy(true)
    try {
      await updateTestCases(projectId, conversationId, result)
      const blob = await exportExcel(projectId, conversationId)
      downloadBlob(blob, 'testcases.xlsx')
    } catch (err) {
      onError(err instanceof Error ? err.message : '匯出失敗')
    } finally {
      setBusy(false)
    }
  }

  const disabled = busy || result.test_cases.length === 0

  return (
    <div className="export-buttons">
      <button disabled={disabled} onClick={handleExport}>
        {busy ? '匯出中…' : '匯出成 Excel'}
      </button>
    </div>
  )
}
