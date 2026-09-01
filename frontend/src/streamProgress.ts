export interface StreamProgressLine {
  kind: 'test_case' | 'question'
  text: string
}

// 只抓「已經確定寫完的完整字串值」，例如 `"name": "登入成功"` 裡的
// `登入成功`——不去嘗試解析／修復還沒寫完的 JSON 結構本身（那是後端
// parse_generation_result 事後才做、而且要拿到完整回應才能做的事）。這裡純粹
// 是把模型目前已經吐出來、可以確定的內容轉成一句話顯示給使用者看，抓不到就
// 不顯示，不去猜測或編造內容，符合這個專案「不可以亂猜」的核心原則。
const NAME_PATTERN = /"name"\s*:\s*"((?:[^"\\]|\\.)*)"/g
const QUESTION_PATTERN = /"question"\s*:\s*"((?:[^"\\]|\\.)*)"/g

function unescapeJsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`)
  } catch {
    return raw
  }
}

/**
 * 從模型還在串流輸出、尚未完整的 JSON 文字裡，抓出「目前已經寫出來的測試用例
 * 名稱／澄清問題」，轉成人類看得懂的進度描述。純函式：同一份 buffer 永遠抓出
 * 同一份結果，呼叫端（ChatPanel）負責決定多久重新抓一次、以及只顯示「新出現」
 * 的項目。
 */
export function extractStreamProgress(buffer: string): StreamProgressLine[] {
  const lines: StreamProgressLine[] = []
  for (const match of buffer.matchAll(NAME_PATTERN)) {
    lines.push({ kind: 'test_case', text: unescapeJsonString(match[1]) })
  }
  for (const match of buffer.matchAll(QUESTION_PATTERN)) {
    lines.push({ kind: 'question', text: unescapeJsonString(match[1]) })
  }
  return lines
}
