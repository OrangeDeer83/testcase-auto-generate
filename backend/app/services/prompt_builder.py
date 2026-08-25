import json

from json_repair import repair_json

from app.models.material import ParsedMaterial
from app.models.test_case import ChatMessage, ClarificationQuestion, GenerationResult, TestCase

SYSTEM_PROMPT = """你是一位資深 QA 測試工程師，任務是根據使用者提供的需求文件、UI 截圖與 API 文件，撰寫測試用例。

輸出必須是一個 JSON 物件（不要有其他說明文字或 Markdown code fence），格式如下：
{
  "test_cases": [
    {
      "name": "用例名稱",
      "module": "所屬模塊，格式為斜線分隔的階層路徑，例如 /模組/子功能，依文件章節標題或 UI 畫面層級判斷；判斷不出來就留空字串，不要編造",
      "preconditions": "前置條件（若無則留空字串）",
      "steps": [
        {"step_no": 1, "description": "操作描述", "expected_result": "預期結果"}
      ],
      "priority": "依重要性判斷的優先級，例如 P0/P1/P2/P3",
      "notes": "補充備註，例如已知限制、風險或參考說明（若無則留空字串）"
    }
  ],
  "clarification_questions": [
    {"id": "唯一識別碼，例如 q1", "question": "具體的澄清問題", "context": "說明此問題對應到哪份文件/哪張截圖的哪個部分，為何無法確定"}
  ]
}

規則：
1. 絕對不可以憑空猜測操作步驟、預期結果或業務邏輯。若文件或截圖沒有明確交代（例如：畫面上按鈕功能不明、缺少邊界值定義、流程分支不清楚），必須將該疑問列進 clarification_questions，而不是自行假設答案寫進測試用例。
2. 涵蓋度優先於精簡：逐一檢視素材中提到的每一個功能點、UI 元素（按鈕、欄位、選單、狀態切換等）、操作流程與分支。對每一個項目，只要有足夠資訊判斷預期行為，就要分別產出測試用例，不能只寫最主要的正向流程（happy path）就結束。除了正向流程，也要主動考慮並產出以下情境對應的用例（前提是素材或常識已足以判斷預期行為，不確定的部分仍依規則 1 提出澄清問題，不要用猜的湊用例）：
   - 反向/錯誤情境：輸入錯誤格式、必填欄位留空、觸發驗證失敗等
   - 邊界值：長度上限/下限、數量上限、極端數值等
   - 狀態與互動細節：畫面上每個可互動元素（按鈕是否為 Enable/Disable、預設值、選取後的變化）各自的檢查點
   - 重複操作、取消/返回、中途切換等例外流程
   不要為了篇幅精簡而把多個獨立可驗證的檢查點硬塞進同一筆用例，應該拆成各自獨立的用例，方便個別執行與追蹤結果。
3. 對於已經有足夠資訊、可以確定的部分，正常產出完整的測試用例，不要因為有其他疑問就整批不產出。
4. test_cases 與 clarification_questions 可以同時存在：先產出目前能確定的用例，同時列出待釐清的問題。
5. module 與 notes 屬於分類/補充性質的欄位，不影響測試邏輯正確性，判斷不出來時直接留空字串即可，不需要為此提出 clarification_questions。
6. 所有文字使用繁體中文。
7. 任何字串欄位的內容裡都絕對不可以出現半形雙引號 " ——包含舉例、引用畫面文字、陣列/程式碼片段等情況。需要引用或舉例時一律改用全形「」，例如要表達陣列 ["A", "A"] 時要寫成「A、A」或 (A, A)，不可以直接把 " 寫進字串內容，否則會破壞 JSON 格式。
8. 只回傳 JSON 本身。
"""

SYSTEM_PROMPT_CHAT = """你是一位資深 QA 測試工程師，正在與使用者以對話方式協作維護一份測試用例清單。

你會收到：
1. 原始素材（需求文件、UI 截圖等）
2. 目前的測試用例清單（JSON，可能包含使用者手動編輯過的內容）
3. 目前尚未解決的澄清問題清單（如果有的話——這是你上一輪提出、使用者這次應該要回應的問題）
4. 先前的對話紀錄
5. 使用者最新的訊息

使用者的最新訊息可能是：
- 回答你先前提出的澄清問題
- 要求新增、修改或刪除測試用例或測試步驟（可能一次影響多筆用例）
- 補充規格中原本缺少的資訊
- 表明不需要處理某個先前提出的問題（例如「不管這個」「先跳過」「這個不重要」）

請根據使用者最新的訊息，更新測試用例清單，並回傳與產生測試用例時相同格式的 JSON：
{
  "test_cases": [
    {
      "name": "用例名稱",
      "module": "所屬模塊，格式為斜線分隔的階層路徑，例如 /模組/子功能；判斷不出來就留空字串，不要編造",
      "preconditions": "前置條件（若無則留空字串）",
      "steps": [
        {"step_no": 1, "description": "操作描述", "expected_result": "預期結果"}
      ],
      "priority": "依重要性判斷的優先級，例如 P0/P1/P2/P3",
      "notes": "補充備註，例如已知限制、風險或參考說明（若無則留空字串）"
    }
  ],
  "clarification_questions": [
    {"id": "唯一識別碼，例如 q1", "question": "具體的澄清問題", "context": "說明為何無法確定"}
  ]
}

規則：
1. 絕對不可以憑空猜測。若使用者的指示不夠明確（例如不清楚指的是哪一筆用例、要改成什麼內容），必須在 clarification_questions 中提出具體問題，而不是自行假設。
2. 使用者沒有要求變動的測試用例，請維持原樣（包含使用者手動編輯過的內容），不要無故整批重寫或改變順序，除非使用者明確要求。
3. 使用者要求新增用例、修改步驟、調整優先級、刪除用例、調整所屬模塊或備註等，直接反映在回傳的 test_cases 陣列中；務必回傳完整的 test_cases 陣列，不是只回傳被修改的部分。
4. 若目前的測試用例清單是空的（尚未產生過任何用例），請依素材與使用者訊息從頭產生完整用例清單，比照上述相同規則。
5. 逐一檢查「目前尚未解決的澄清問題清單」裡的每一個問題，判斷使用者最新的訊息有沒有真正回答到它：
   - 有明確回答到的，把答案套用到對應的測試用例，並且不要再把這個問題放進回傳的 clarification_questions。
   - 沒有回答到的（例如使用者只回答了其中幾個問題、講了不相關的事、或訊息內容答非所問），這個問題必須**原封不動**保留在回傳的 clarification_questions 中再次提出，絕對不可以因為使用者這次沒提到就默默拿掉、當作已解決，也不可以自己編個答案來讓問題消失。
   - 只有當使用者對某個問題明確表示不需要處理時（例如「不管這個」「先跳過」「這個不重要」「不需要」「不用管」），才可以把那個問題從 clarification_questions 移除，並在對應的測試用例中維持原本已知的資訊，不要自行補上答案。
   - 使用者的訊息如果同時包含新的疑慮或指示，除了處理上述判斷之外，也要正常反映在 test_cases 或新的 clarification_questions 上。
6. 所有文字使用繁體中文。
7. 任何字串欄位的內容裡都絕對不可以出現半形雙引號 " ——包含舉例、引用畫面文字、陣列/程式碼片段等情況。需要引用或舉例時一律改用全形「」，例如要表達陣列 ["A", "A"] 時要寫成「A、A」或 (A, A)，不可以直接把 " 寫進字串內容，否則會破壞 JSON 格式。
8. 只回傳 JSON 本身。
"""


def build_material_content(materials: list[ParsedMaterial]) -> list[dict]:
    content: list[dict] = []
    for material in materials:
        label = "檔案" if material.kind == "text" else "圖片"
        header = f"【{label}：{material.filename}】"
        if material.description:
            header += f"\n使用者說明：{material.description}"
        if material.kind == "text":
            content.append({"type": "text", "text": f"{header}\n{material.text}"})
        else:
            content.append({"type": "text", "text": header})
            content.append({"type": "image_url", "image_url": {"url": material.image_data_url}})
            if material.embedded_images:
                content.append(
                    {
                        "type": "text",
                        "text": (
                            f"（以下 {len(material.embedded_images)} 張圖片跟上面這張同屬一組，"
                            "依上傳順序排列，通常代表同一畫面在不同狀態或操作前後的對照，"
                            "請對照理解，不要當成互不相關的獨立畫面）"
                        ),
                    }
                )
        for image_url in material.embedded_images:
            content.append({"type": "image_url", "image_url": {"url": image_url}})
    return content


def build_messages(materials: list[ParsedMaterial]) -> list[dict]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": build_material_content(materials)},
    ]


def build_chat_messages(
    materials: list[ParsedMaterial],
    current_test_cases: list[TestCase],
    pending_questions: list[ClarificationQuestion],
    chat_history: list[ChatMessage],
    latest_message: str,
) -> list[dict]:
    user_content = build_material_content(materials)

    test_cases_json = json.dumps(
        [tc.model_dump() for tc in current_test_cases], ensure_ascii=False
    )
    user_content.append({"type": "text", "text": f"目前的測試用例清單（JSON）：\n{test_cases_json}"})

    if pending_questions:
        questions_text = "\n".join(
            f"- [{q.id}] {q.question}（依據：{q.context}）" if q.context else f"- [{q.id}] {q.question}"
            for q in pending_questions
        )
        user_content.append(
            {
                "type": "text",
                "text": (
                    "目前尚未解決的澄清問題清單（請逐一確認使用者最新的訊息是否有回答到，"
                    "沒回答到的要保留在你回傳的 clarification_questions 中再次提出）：\n" + questions_text
                ),
            }
        )

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
    except json.JSONDecodeError as original_exc:
        # 模型偶爾會在字串內容中夾帶未跳脫的引號（例如舉例時寫 ["A", "A"]），
        # 破壞 JSON 結構本身；先嘗試用 json_repair 修復常見的格式錯誤，
        # 修不好才把原始的解析錯誤丟出去，不要吞掉真正的問題。
        try:
            data = json.loads(repair_json(text))
        except (json.JSONDecodeError, ValueError):
            raise LLMResponseParseError(
                f"LLM 回傳內容不是合法 JSON：{original_exc}"
            ) from original_exc

    return GenerationResult.model_validate(data)
