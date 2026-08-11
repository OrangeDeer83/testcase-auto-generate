import json

from app.models.material import ParsedMaterial
from app.models.test_case import GenerationResult, QAAnswer

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
4. 若使用者已針對先前的疑問提供回答，請將回答納入考量，更新/補完對應的測試用例，並且不要在 clarification_questions 中重複列出已回答的問題。
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


def build_messages(materials: list[ParsedMaterial], qa_history: list[QAAnswer]) -> list[dict]:
    user_content = build_material_content(materials)

    if qa_history:
        qa_text = "\n".join(f"Q: {item.question}\nA: {item.answer}" for item in qa_history)
        user_content.append(
            {
                "type": "text",
                "text": (
                    "以下是先前針對疑問的補充回答，請據此更新/補完測試用例，"
                    "並移除已回答的澄清問題：\n" + qa_text
                ),
            }
        )

    return [
        {"role": "system", "content": SYSTEM_PROMPT},
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
