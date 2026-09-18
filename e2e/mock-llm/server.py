"""極簡假 LLM server，只給 E2E 測試用。

不管收到什麼 prompt，一律回傳固定的 OpenAI 相容 chat completion 回應，
讓 backend 呼叫 LLM 的那段程式碼可以在 CI 環境下正常跑完整條流程，
不需要連到真正的公司內部模型。只用標準函式庫，不用額外裝套件。
"""

import http.server
import json
import os
import re

CANNED_RESULT = {
    "test_cases": [
        {
            "name": "登入成功",
            "module": "登入",
            "preconditions": "已有註冊帳號",
            "priority": "P1",
            "notes": "",
            "steps": [
                {
                    "step_no": 1,
                    "description": "輸入正確的帳號密碼並送出",
                    "expected_result": "成功登入並導向首頁",
                }
            ],
        }
    ],
    "clarification_questions": [],
}

# /feature-breakdown 用的是另一份系統提示（SYSTEM_PROMPT_FEATURE_BREAKDOWN），
# 期待的回應格式是 {"features": [...]}，不是 test_cases——固定回傳同一份
# CANNED_RESULT 會讓 parse_feature_breakdown 找不到 "features" 欄位、拆出一份
# 空清單，畫面卡在「確認功能拆分」（沒有任何功能可以確認）永遠不會產生用例。
# 用 SYSTEM_PROMPT_FEATURE_BREAKDOWN 才有的欄位名稱（material_filenames）當
# 標記，判斷這次請求是不是功能拆分；素材檔名則直接從請求內容裡的
# 「【檔案：...】／【圖片：...】」標頭反查回來，不寫死成任何特定測試案例
# 用的素材名稱，換一份 e2e 素材內容也不用回頭改這裡。
_MATERIAL_HEADER_PATTERN = re.compile(r"【(?:檔案|圖片)：([^】]+)】")


def _request_text(payload: dict) -> str:
    parts: list[str] = []
    for message in payload.get("messages", []):
        content = message.get("content")
        if isinstance(content, str):
            parts.append(content)
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    parts.append(block.get("text", ""))
    return "\n".join(parts)


def _canned_response_for(payload: dict) -> dict:
    text = _request_text(payload)
    if "material_filenames" not in text:
        return CANNED_RESULT
    filenames = _MATERIAL_HEADER_PATTERN.findall(text)
    return {
        "features": [
            {
                "name": "登入",
                "description": "登入流程",
                "material_filenames": filenames,
            }
        ]
    }


class Handler(http.server.BaseHTTPRequestHandler):
    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        self._send_json(200, {"status": "ok"})

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        # 2026-09-01 起 backend 一律用 stream=True 呼叫（見 llm_client.py 的
        # stream_chat_completion），要看請求體裡的 stream 欄位決定回傳格式，
        # 不然 OpenAI SDK 的串流用戶端會拿到一個它看不懂的純 JSON 回應，
        # 整個呼叫直接失敗——這正是這個檔案改成分辨 stream 之前，CI 的
        # golden-path e2e 測試會炸掉的原因。
        try:
            payload = json.loads(body or b"{}")
        except json.JSONDecodeError:
            payload = {}
        stream_requested = payload.get("stream", False)
        canned = _canned_response_for(payload)

        if stream_requested:
            self._send_stream(canned)
        else:
            self._send_json(
                200,
                {
                    "id": "chatcmpl-mock",
                    "object": "chat.completion",
                    "created": 0,
                    "model": "mock-model",
                    "choices": [
                        {
                            "index": 0,
                            "message": {
                                "role": "assistant",
                                "content": json.dumps(canned, ensure_ascii=False),
                            },
                            "finish_reason": "stop",
                        }
                    ],
                    "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
                },
            )

    def _send_stream(self, canned: dict) -> None:
        """回傳 OpenAI 相容的串流格式（Server-Sent Events，每個事件是一個
        chat.completion.chunk），把固定回覆內容拆成幾段模擬真正串流逐字送出的
        樣子，順便讓這個假 server 也能驗證前端「即時抓取正在產生的內容」那段
        邏輯（見 frontend/src/streamProgress.ts）不會在串流情境下整個掛掉。"""
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()

        content = json.dumps(canned, ensure_ascii=False)
        chunk_size = max(1, len(content) // 8)
        pieces = [content[i : i + chunk_size] for i in range(0, len(content), chunk_size)]

        def _write_chunk(delta: dict, finish_reason: str | None) -> None:
            payload = {
                "id": "chatcmpl-mock",
                "object": "chat.completion.chunk",
                "created": 0,
                "model": "mock-model",
                "choices": [{"index": 0, "delta": delta, "finish_reason": finish_reason}],
            }
            self.wfile.write(f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8"))

        _write_chunk({"role": "assistant"}, None)
        for piece in pieces:
            _write_chunk({"content": piece}, None)
        _write_chunk({}, "stop")
        self.wfile.write(b"data: [DONE]\n\n")

    def log_message(self, format: str, *args: object) -> None:
        pass  # 安靜一點，CI log 不用被灌爆


def main() -> None:
    port = int(os.environ.get("PORT", "8090"))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
