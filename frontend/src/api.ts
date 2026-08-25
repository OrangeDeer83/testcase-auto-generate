import type {
  ChatMessage,
  Conversation,
  ConversationSummary,
  GenerationResult,
  Project,
  ProjectSummary,
  TestCase,
  UploadedMaterial,
} from './types'

// VITE_API_BASE_URL 沒設時，用「當初瀏覽器實際打進來的網域／IP」自動組出後端位址，
// 而不是寫死某個 IP——寫死的話換網路環境（DHCP 重新配到不同區網 IP）就會直接連不上。
// 這個 fallback 假設後端固定用 8000 埠；如果後端不是 8000（例如測試環境用 18002），
// 或前後端根本不在同一台主機，就要在 .env 裡明確設定 VITE_API_BASE_URL 覆蓋這個推斷值。
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? `http://${window.location.hostname}:8000`

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(body.detail ?? `請求失敗（${response.status}）`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

// ---- snake_case (後端) <-> camelCase（前端）轉換 ----

function mapProject(raw: any): Project {
  return {
    id: raw.id,
    name: raw.name,
    materialIds: raw.material_ids,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

function mapProjectSummary(raw: any): ProjectSummary {
  return {
    id: raw.id,
    name: raw.name,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    materialCount: raw.material_count,
    conversationCount: raw.conversation_count,
  }
}

function mapChatEntry(raw: any): ChatMessage {
  return {
    id: raw.id,
    role: raw.role,
    content: raw.content,
    context: raw.context || undefined,
    materialId: raw.material_id ?? undefined,
    questions: raw.questions ?? undefined,
  }
}

function toChatEntryPayload(message: ChatMessage) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    context: message.context ?? '',
    material_id: message.materialId ?? null,
    questions: message.questions ?? null,
  }
}

function mapConversation(raw: any): Conversation {
  return {
    id: raw.id,
    projectId: raw.project_id,
    name: raw.name,
    selectedMaterialIds: raw.selected_material_ids,
    chatLog: (raw.chat_log ?? []).map(mapChatEntry),
    lastResult: raw.last_result ?? null,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

function mapConversationSummary(raw: any): ConversationSummary {
  return {
    id: raw.id,
    name: raw.name,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    messageCount: raw.message_count,
    testCaseCount: raw.test_case_count,
  }
}

// ---- Projects ----

export async function createProject(name: string): Promise<Project> {
  const response = await fetch(`${API_BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return mapProject(await handleResponse(response))
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const response = await fetch(`${API_BASE_URL}/api/projects`)
  const raw = await handleResponse<any[]>(response)
  return raw.map(mapProjectSummary)
}

export async function getProject(projectId: string): Promise<Project> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}`)
  return mapProject(await handleResponse(response))
}

export async function renameProject(projectId: string, name: string): Promise<Project> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return mapProject(await handleResponse(response))
}

export async function deleteProject(projectId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}`, { method: 'DELETE' })
  await handleResponse(response)
}

// ---- Materials（專案共用素材庫）----

export async function uploadMaterials(
  projectId: string,
  files: File[],
): Promise<{ uploaded: UploadedMaterial[]; total_materials: number }> {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))

  const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/materials`, {
    method: 'POST',
    body: formData,
  })
  return handleResponse(response)
}

export async function addTextMaterial(
  projectId: string,
  label: string,
  content: string,
): Promise<{ uploaded: UploadedMaterial[]; total_materials: number }> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/materials/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, content }),
  })
  return handleResponse(response)
}

export async function updateMaterial(
  projectId: string,
  materialId: string,
  updates: { filename?: string; description?: string; text?: string },
): Promise<UploadedMaterial> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${projectId}/materials/${materialId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    },
  )
  return handleResponse(response)
}

export async function deleteMaterial(projectId: string, materialId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${projectId}/materials/${materialId}`,
    { method: 'DELETE' },
  )
  await handleResponse(response)
}

/** 把既有的多筆圖片素材（至少 2 筆）合併成一筆——materialIds 第一個當主圖，其餘依序
 * 成為附加圖片，其餘幾筆素材本身會被刪除。用在使用者已經各自貼上/上傳好幾張截圖、
 * 事後才想把其中幾張標記成同一組（例如開關前／開關後）的情境。 */
export async function mergeMaterials(
  projectId: string,
  materialIds: string[],
): Promise<UploadedMaterial> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/materials/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ material_ids: materialIds }),
  })
  return handleResponse(response)
}

/** 把某筆素材 embedded_images 裡第 index 張圖片拆出來，變成一筆獨立的新素材——
 * 取消合併裡的其中一張，不用整組拆散重來。 */
export async function ungroupImage(
  projectId: string,
  materialId: string,
  index: number,
): Promise<{ updated: UploadedMaterial; extracted: UploadedMaterial }> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${projectId}/materials/${materialId}/ungroup`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index }),
    },
  )
  return handleResponse(response)
}

export async function getMaterials(projectId: string): Promise<UploadedMaterial[]> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/materials`)
  return handleResponse(response)
}

// ---- Conversations ----

export async function createConversation(projectId: string, name: string): Promise<Conversation> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return mapConversation(await handleResponse(response))
}

export async function listConversations(projectId: string): Promise<ConversationSummary[]> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/conversations`)
  const raw = await handleResponse<any[]>(response)
  return raw.map(mapConversationSummary)
}

export async function getConversation(projectId: string, conversationId: string): Promise<Conversation> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${projectId}/conversations/${conversationId}`,
  )
  return mapConversation(await handleResponse(response))
}

export async function updateConversation(
  projectId: string,
  conversationId: string,
  updates: { name?: string; selectedMaterialIds?: string[] },
): Promise<Conversation> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${projectId}/conversations/${conversationId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: updates.name,
        selected_material_ids: updates.selectedMaterialIds,
      }),
    },
  )
  return mapConversation(await handleResponse(response))
}

export async function deleteConversation(projectId: string, conversationId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${projectId}/conversations/${conversationId}`,
    { method: 'DELETE' },
  )
  await handleResponse(response)
}

export async function generate(projectId: string, conversationId: string): Promise<GenerationResult> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${projectId}/conversations/${conversationId}/generate`,
    { method: 'POST' },
  )
  return handleResponse(response)
}

export async function sendChatMessage(
  projectId: string,
  conversationId: string,
  message: string,
  currentTestCases: TestCase[],
  attachmentMaterialId?: string,
): Promise<GenerationResult> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${projectId}/conversations/${conversationId}/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        current_test_cases: currentTestCases,
        attachment_material_id: attachmentMaterialId ?? null,
      }),
    },
  )
  return handleResponse(response)
}

export async function updateTestCases(
  projectId: string,
  conversationId: string,
  result: GenerationResult,
): Promise<GenerationResult> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${projectId}/conversations/${conversationId}/test-cases`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    },
  )
  return handleResponse(response)
}

export async function saveChatLog(
  projectId: string,
  conversationId: string,
  chatLog: ChatMessage[],
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${projectId}/conversations/${conversationId}/chat-log`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_log: chatLog.map(toChatEntryPayload) }),
    },
  )
  await handleResponse(response)
}

export async function exportExcel(projectId: string, conversationId: string): Promise<Blob> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${projectId}/conversations/${conversationId}/export/excel`,
  )
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(body.detail ?? `匯出失敗（${response.status}）`)
  }
  return response.blob()
}
