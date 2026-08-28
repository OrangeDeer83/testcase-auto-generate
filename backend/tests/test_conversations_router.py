import pytest
from fastapi import HTTPException
from openai import OpenAIError

from app.routers import conversations


def test_call_llm_returns_content_on_success(monkeypatch) -> None:
    monkeypatch.setattr(conversations, "chat_completion", lambda messages: "raw response")

    assert conversations._call_llm("POST /generate", "conv-1", [{"role": "user", "content": "hi"}]) == "raw response"


def test_call_llm_converts_openai_error_to_friendly_502(monkeypatch) -> None:
    """模型逾時／連線失敗／服務端異常都是 OpenAIError 的子類別，不應該讓原始例外
    直接往上拋變成看不懂的通用 500——要轉成使用者看得懂的訊息。"""

    def _raise(messages):
        raise OpenAIError("Request timed out.")

    monkeypatch.setattr(conversations, "chat_completion", _raise)

    with pytest.raises(HTTPException) as exc_info:
        conversations._call_llm("POST /chat", "conv-1", [{"role": "user", "content": "hi"}])

    assert exc_info.value.status_code == 502
    assert exc_info.value.detail == "模型服務暫時無回應，請稍後再試一次"
