"""極簡假 LLM server，只給 E2E 測試用。

不管收到什麼 prompt，一律回傳固定的 OpenAI 相容 chat completion 回應，
讓 backend 呼叫 LLM 的那段程式碼可以在 CI 環境下正常跑完整條流程，
不需要連到真正的公司內部模型。只用標準函式庫，不用額外裝套件。
"""

import http.server
import json
import os

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
        self.rfile.read(length)  # 不需要真的看 prompt 內容，一律回固定的用例
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
                            "content": json.dumps(CANNED_RESULT, ensure_ascii=False),
                        },
                        "finish_reason": "stop",
                    }
                ],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            },
        )

    def log_message(self, format: str, *args: object) -> None:
        pass  # 安靜一點，CI log 不用被灌爆


def main() -> None:
    port = int(os.environ.get("PORT", "8090"))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
