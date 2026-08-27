// crypto.randomUUID() 只在「安全情境」（HTTPS 或 localhost）才存在——透過純 HTTP
// 連到區網 IP（例如同事用 http://10.x.x.x:5173 連線）時，瀏覽器會直接讓這個方法
// 從 crypto 物件上消失，呼叫就會噴 "crypto.randomUUID is not a function"。這裡的
// id 只拿來當 React key／識別本地產生的暫時資料，不需要密碼學等級的隨機性，
// 所以在方法不存在時退回一個到處都能跑的簡易版本。
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
