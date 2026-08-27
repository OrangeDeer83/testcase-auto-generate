import { useEffect, useState } from 'react'

const CHANNEL_PREFIX = 'testcase-conversation-presence:'
const HEARTBEAT_INTERVAL_MS = 4000
// 要明顯大於心跳間隔，容許漏掉一兩拍還不算真的離線——太接近心跳間隔的話，
// 只要有一次訊息延遲或分頁被瀏覽器暫時凍結（例如切到背景分頁），就會誤判成已關閉。
const STALE_TIMEOUT_MS = 12000

// 這裡不用 crypto.randomUUID()——同樣的理由：在非安全情境（例如同事用區網 IP
// 連進來）下這個方法會直接不存在。分頁 id 只是拿來在 Map 裡分辨彼此，不需要
// 正式的 UUID 格式，用 Math.random() 拼一段夠不會撞號的字串就好。
function newTabId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/** 用 BroadcastChannel 讓同一個對話的分頁互相「打招呼」，偵測是不是不小心開了
 * 兩個以上的分頁在同一個對話上——這是使用者鎖定狀態互相打架的根本成因（其中一個
 * 分頁的過期快照存檔時把另一個分頁剛做的修改蓋掉），比起處理衝突發生後怎麼救，
 * 在使用者還沒開始編輯前就提醒他「這裡還有另一個分頁」更能從源頭避免問題。
 *
 * 分頁消失的偵測不能只靠關閉時廣播一次「bye」——分頁被瀏覽器強制關閉、當機、
 * 或行動裝置把背景分頁直接砍掉時，這種「離開前主動說一聲」的事件不保證會觸發。
 * 所以改成每個分頁固定心跳廣播自己還活著，其他分頁定期检查「多久沒收到心跳了」，
 * 超過門檻就當它已經不在了——這樣不管分頁是怎麼消失的，提示最終都會自己恢復
 * 正常，不會卡死。 */
export function useDuplicateTabWarning(conversationId: string | undefined): boolean {
  const [hasDuplicate, setHasDuplicate] = useState(false)

  useEffect(() => {
    setHasDuplicate(false)
    if (!conversationId || typeof BroadcastChannel === 'undefined') return

    const myTabId = newTabId()
    const channel = new BroadcastChannel(`${CHANNEL_PREFIX}${conversationId}`)
    const lastSeenAt = new Map<string, number>()

    const pruneAndUpdate = () => {
      const cutoff = Date.now() - STALE_TIMEOUT_MS
      for (const [tabId, seenAt] of lastSeenAt) {
        if (seenAt < cutoff) lastSeenAt.delete(tabId)
      }
      setHasDuplicate(lastSeenAt.size > 0)
    }

    channel.onmessage = (event) => {
      const msg = event.data as { type: string; tabId: string } | undefined
      if (!msg || msg.tabId === myTabId) return
      if (msg.type === 'bye') {
        lastSeenAt.delete(msg.tabId)
        pruneAndUpdate()
        return
      }
      lastSeenAt.set(msg.tabId, Date.now())
      if (msg.type === 'announce') channel.postMessage({ type: 'ack', tabId: myTabId })
      pruneAndUpdate()
    }

    const announce = () => channel.postMessage({ type: 'announce', tabId: myTabId })
    const sayBye = () => channel.postMessage({ type: 'bye', tabId: myTabId })

    announce()
    const heartbeatTimer = setInterval(announce, HEARTBEAT_INTERVAL_MS)
    const pruneTimer = setInterval(pruneAndUpdate, HEARTBEAT_INTERVAL_MS)
    window.addEventListener('beforeunload', sayBye)

    return () => {
      clearInterval(heartbeatTimer)
      clearInterval(pruneTimer)
      window.removeEventListener('beforeunload', sayBye)
      sayBye()
      channel.close()
    }
  }, [conversationId])

  return hasDuplicate
}
