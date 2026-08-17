const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** 從剪貼簿資料中取出第一張圖片，包成一個可直接當素材上傳的 File（沒有圖片則回傳 null）。 */
export function getPastedImageFile(clipboardData: DataTransfer | null, namePrefix: string): File | null {
  if (!clipboardData) return null

  for (const item of clipboardData.items) {
    if (!item.type.startsWith('image/')) continue
    const blob = item.getAsFile()
    if (!blob) continue
    const ext = EXTENSION_BY_MIME[item.type] ?? 'png'
    return new File([blob], `${namePrefix}-${Date.now()}.${ext}`, { type: item.type })
  }

  return null
}
