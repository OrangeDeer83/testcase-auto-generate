import time
import uuid

from openai import OpenAI

from app.config import settings
from app.logging_config import logger

_client = OpenAI(base_url=settings.llm_base_url, api_key=settings.llm_api_key)


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


def chat_completion(messages: list[dict], *, temperature: float = 0.2) -> str:
    """Send a chat completion request to the internal OpenAI-compatible model.

    `messages` follows the standard OpenAI chat format; user message content
    can be a plain string or a list of {"type": "text"|"image_url", ...} parts
    for multimodal (vision) input.
    """
    call_id = uuid.uuid4().hex[:8]
    logger.info(
        "LLM 呼叫開始 call_id=%s\n%s", call_id, _summarize_messages_for_log(messages)
    )

    started_at = time.monotonic()
    try:
        response = _client.chat.completions.create(
            model=settings.llm_model,
            messages=messages,
            temperature=temperature,
        )
    except Exception:
        logger.exception("LLM 呼叫失敗 call_id=%s", call_id)
        raise

    content = response.choices[0].message.content or ""
    elapsed_ms = int((time.monotonic() - started_at) * 1000)
    logger.info(
        "LLM 呼叫完成 call_id=%s elapsed_ms=%d\n%s", call_id, elapsed_ms, content
    )
    return content
