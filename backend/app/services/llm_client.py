import time
import uuid
from collections.abc import Iterator

from openai import OpenAI

from app.config import settings
from app.logging_config import logger

# 官方預設是 600 秒逾時、失敗時自動重試 2 次（最多 3 次嘗試），三次都卡滿逾時
# 上限的話，使用者實際上會空等將近 30 分鐘才看到錯誤——這正是內部模型服務
# 一度不穩時實際發生的情況（見 FIX_NOTES.md）。原本改成 150 秒逾時＋重試 1 次，
# 但 2026-09-01 從 log 觀察到內部模型服務本身變慢了：即使是很普通大小的請求
# （2 張圖片、十幾萬字元），也常常需要 200～300 秒才有回應，而 timeout=150
# 搭配 max_retries=1 代表「兩次各自都只有 150 秒預算」——重試不會延續前一次
# 已經跑到一半的進度，是完全重新發送一次請求，如果模型服務本來就需要
# 200 秒以上才會回應，兩次各 150 秒的機會都不夠用，反而穩定失敗。改成單次
# 給更長的預算（280 秒）、不自動重試：最差情況下使用者等待的總時間比之前的
# 150×2=300 秒還短，但單次嘗試的時間預算大幅提高，能吃下大多數目前觀察到
# 的正常回應時間。使用者原本就會在畫面上看到「模型服務暫時無回應」的提示、
# 自行決定要不要手動重新送出，拿掉自動重試不影響這個手動重試的路徑。
_client = OpenAI(
    base_url=settings.llm_base_url,
    api_key=settings.llm_api_key,
    timeout=280.0,
    max_retries=0,
)


def _summarize_messages_for_log(messages: list[dict]) -> str:
    """把要送給 LLM 的 messages 轉成可讀文字，圖片內容(base64)不記錄，只記數量。"""
    parts: list[str] = []
    for message in messages:
        role = message.get("role")
        content = message.get("content")
        if isinstance(content, str):
            parts.append(f"[{role}]\n{content}")
            continue

        text_bits: list[str] = []
        image_count = 0
        for item in content:
            if item.get("type") == "text":
                text_bits.append(item.get("text", ""))
            elif item.get("type") == "image_url":
                image_count += 1
        body = "\n".join(text_bits)
        if image_count:
            body += f"\n[附帶 {image_count} 張圖片，內容未記錄]"
        parts.append(f"[{role}]\n{body}")
    return "\n\n".join(parts)


def stream_chat_completion(messages: list[dict], *, temperature: float = 0.2) -> Iterator[str]:
    """Send a chat completion request to the internal OpenAI-compatible model,
    yielding text chunks as they arrive instead of waiting for the full reply.

    `messages` follows the standard OpenAI chat format; user message content
    can be a plain string or a list of {"type": "text"|"image_url", ...} parts
    for multimodal (vision) input.

    改成串流（stream=True）是因為原本整批等完整回應才回傳，前端在這幾分鐘裡
    完全看不到任何內容、只能顯示一個單純的「思考中」計時器，使用者反映感覺不到
    模型「正在運作」。串流之後，呼叫端（見 routers/conversations.py）可以邊收
    邊往前端轉送，前端再從陸續收到的片段裡即時抓出已經寫完的用例名稱／問題內容
    顯示給使用者看，是「照實描述」正在產生的內容，不是憑空編造的進度文字。
    """
    call_id = uuid.uuid4().hex[:8]
    logger.info(
        "LLM 呼叫開始 call_id=%s\n%s", call_id, _summarize_messages_for_log(messages)
    )

    started_at = time.monotonic()
    full_parts: list[str] = []
    try:
        stream = _client.chat.completions.create(
            model=settings.llm_model,
            messages=messages,
            temperature=temperature,
            stream=True,
        )
        for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta.content
            if not delta:
                continue
            full_parts.append(delta)
            yield delta
    except Exception:
        logger.exception("LLM 呼叫失敗 call_id=%s", call_id)
        raise

    elapsed_ms = int((time.monotonic() - started_at) * 1000)
    logger.info(
        "LLM 呼叫完成 call_id=%s elapsed_ms=%d\n%s", call_id, elapsed_ms, "".join(full_parts)
    )
