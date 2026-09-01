from openai import OpenAIError

from app.routers import conversations


def _drive_generator(gen):
    """把一個 generator 完整跑完，回傳 (yield 過的所有值, return 的值)——標準
    generator 沒辦法直接用 for 迴圈拿到 return value，要接住 StopIteration.value。"""
    yielded = []
    try:
        while True:
            yielded.append(next(gen))
    except StopIteration as stop:
        return yielded, stop.value


def test_stream_llm_events_yields_deltas_and_returns_joined_text(monkeypatch) -> None:
    monkeypatch.setattr(
        conversations, "stream_chat_completion", lambda messages: iter(["第一段", "第二段"])
    )

    gen = conversations._stream_llm_events("POST /chat", "conv-1", [{"role": "user", "content": "hi"}])
    yielded, raw_response = _drive_generator(gen)

    assert yielded == [
        conversations._sse_event("delta", {"text": "第一段"}),
        conversations._sse_event("delta", {"text": "第二段"}),
    ]
    assert raw_response == "第一段第二段"


def test_stream_llm_events_converts_openai_error_to_friendly_sse_error(monkeypatch) -> None:
    """模型逾時／連線失敗／服務端異常都是 OpenAIError 的子類別，不應該讓原始例外
    直接往上拋變成看不懂的通用 500——串流已經開始輸出，沒辦法再改狀態碼，要轉成
    一個使用者看得懂的 SSE error 事件，呼叫端（event_stream）看到 return None
    就知道不能再往下處理。"""

    def _raise(messages):
        raise OpenAIError("Request timed out.")
        yield  # pragma: no cover - 讓這個函式本身是 generator，呼叫時才會拋例外

    monkeypatch.setattr(conversations, "stream_chat_completion", _raise)

    gen = conversations._stream_llm_events("POST /chat", "conv-1", [{"role": "user", "content": "hi"}])
    yielded, raw_response = _drive_generator(gen)

    assert yielded == [
        conversations._sse_event("error", {"detail": "模型服務暫時無回應，請稍後再試一次"})
    ]
    assert raw_response is None
