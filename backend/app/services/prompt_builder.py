import json

from app.models.material import ParsedMaterial
from app.models.test_case import ChatMessage, GenerationResult, TestCase

SYSTEM_PROMPT = """你是一位資深 QA 測試工程師，任務是根據使用者提供的需求文件、UI 截圖與 API 文件，撰寫測試用例。

輸出必須是一個 JSON 物件（不要有其他說明文字或 Markdown code fence），格式如下：
{
  "test_cases": [
    {
      "name": "用例名稱",
      "preconditions": "前置條件（若無則留空字串）",
      "steps": [
        {"step_no": 1, "description": "操作描述", "expected_result": "預期結果"}
      ],
      "priority": "依重要性判斷的優先級，例如 P0/P1/P2/P3"
    }
  ],
  "clarification_questions": [
    {"id": "唯一識別碼，例如 q1", "question": "具體的澄清問題", "context": "說明此問題對應到哪份文件/哪張截圖的哪個部分，為何無法確定"}
  ]
}

規則：
1. 絕對不可以憑空猜測操作步驟、預期結果或業務邏輯。若文件或截圖沒有明確交代（例如：畫面上按鈕功能不明、缺少邊界值定義、流程分支不清楚），必須將該疑問列進 clarification_questions，而不是自行假設答案寫進測試用例。
2. 對於已經有足夠資訊、可以確定的部分，正常產出完整的測試用例，不要因為有其他疑問就整批不產出。
3. test_cases 與 clarification_questions 可以同時存在：先產出目前能確定的用例，同時列出待釐清的問題。
4. 所有文字使用繁體中文。
5. 只回傳 JSON 本身。
"""

SYSTEM_PROMPT_CHAT = """你是一位資深 QA 測試工程師，正在與使用者以對話方式協作維護一份測試用例清單。

你會收到：
1. 原始素材（需求文件、UI 截圖等）
2. 目前的測試用例清單（JSON，可能包含使用者手動編輯過的內容）
3. 先前的對話紀錄
4. 使用者最新的訊息

使用者的最新訊息可能是：
- 回答你先前提出的澄清問題
- 要求新增、修改或刪除測試用例或測試步驟（可能一次影響多筆用例）
- 補充規格中原本缺少的資訊

請根據使用者最新的訊息，更新測試用例清單，並回傳與產生測試用例時相同格式的 JSON：
{
  "test_cases": [
    {
      "name": "用例名稱",
      "preconditions": "前置條件（若無則留空字串）",
      "steps": [
        {"step_no": 1, "description": "操作描述", "expected_result": "預期結果"}
      ],
      "priority": "依重要性判斷的優先級，例如 P0/P1/P2/P3"
    }
  ],
  "clarification_questions": [
    {"id": "唯一識別碼，例如 q1", "question": "具體的澄清問題", "context": "說明為何無法確定"}
  ]
}

規則：
1. 絕對不可以憑空猜測。若使用者的指示不夠明確（例如不清楚指的是哪一筆用例、要改成什麼內容），必須在 clarification_questions 中提出具體問題，而不是自行假設。
2. 使用者沒有要求變動的測試用例，請維持原樣（包含使用者手動編輯過的內容），不要無故整批重寫或改變順序，除非使用者明確要求。
3. 使用者要求新增用例、修改步驟、調整優先級、刪除用例等，直接反映在回傳的 test_cases 陣列中；務必回傳完整的 test_cases 陣列，不是只回傳被修改的部分。
4. 若目前的測試用例清單是空的（尚未產生過任何用例），請依素材與使用者訊息從頭產生完整用例清單，比照上述相同規則。
5. 所有文字使用繁體中文。
6. 只回傳 JSON 本身。
"""


def build_material_content(materials: list[ParsedMaterial]) -> list[dict]:
    content: list[dict] = []
    for material in materials:
        if material.kind == "text":
            content.append(
                {"type": "text", "text": f"【檔案：{material.filename}】\n{material.text}"}
            )
        else:
            content.append({"type": "text", "text": f"【圖片：{material.filename}】"})
            content.append({"type": "image_url", "image_url": {"url": material.image_data_url}})
    return content


def build_messages(materials: list[ParsedMaterial]) -> list[dict]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": build_material_content(materials)},
    ]


def build_chat_messages(
    materials: list[ParsedMaterial],
    current_test_cases: list[TestCase],
    chat_history: list[ChatMessage],
    latest_message: str,
) -> list[dict]:
    user_content = build_material_content(materials)

    test_cases_json = json.dumps(
        [tc.model_dump() for tc in current_test_cases], ensure_ascii=False
    )
    user_content.append({"type": "text", "text": f"目前的測試用例清單（JSON）：\n{test_cases_json}"})

    if chat_history:
        history_text = "\n".join(
            f"{'使用者' if m.role == 'user' else '你'}：{m.content}" for m in chat_history
        )
        user_content.append({"type": "text", "text": f"先前的對話紀錄：\n{history_text}"})

    user_content.append({"type": "text", "text": f"使用者最新的訊息：\n{latest_message}"})

    return [
        {"role": "system", "content": SYSTEM_PROMPT_CHAT},
        {"role": "user", "content": user_content},
    ]


class LLMResponseParseError(ValueError):
    pass


def parse_generation_result(raw_response: str) -> GenerationResult:
    text = raw_response.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise LLMResponseParseError(f"LLM 回傳內容不是合法 JSON：{exc}") from exc

    return GenerationResult.model_validate(data)
