import type { GenerationResult, QAAnswer, UploadedMaterial } from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(body.detail ?? `請求失敗（${response.status}）`)
  }
  return response.json() as Promise<T>
}

export async function createSession(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/sessions`, { method: 'POST' })
  const data = await handleResponse<{ session_id: string }>(response)
  return data.session_id
}

export async function uploadMaterials(
  sessionId: string,
  files: File[],
): Promise<{ uploaded: UploadedMaterial[]; total_materials: number }> {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))

  const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/materials`, {
    method: 'POST',
    body: formData,
  })
  return handleResponse(response)
}

export async function generate(sessionId: string): Promise<GenerationResult> {
  const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/generate`, {
    method: 'POST',
  })
  return handleResponse(response)
}

export async function submitAnswers(
  sessionId: string,
  answers: QAAnswer[],
): Promise<GenerationResult> {
  const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/answers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  })
  return handleResponse(response)
}

export async function updateTestCases(
  sessionId: string,
  result: GenerationResult,
): Promise<GenerationResult> {
  const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/test-cases`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
  })
  return handleResponse(response)
}

export async function exportMarkdown(sessionId: string): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/export`)
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(body.detail ?? `匯出失敗（${response.status}）`)
  }
  return response.blob()
}
