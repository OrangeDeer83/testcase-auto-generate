import json
import re

from json_repair import repair_json

from collections.abc import Iterator

from app.logging_config import logger
from app.models.material import ImageRef, ParsedMaterial
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
      "notes": "補充備註，例如已知限制、風險或參考說明（若無則留空字串）",
      "based_on_images": [1, 3]
    }
  ],
  "clarification_questions": [
    {"id": "唯一識別碼，例如 q1", "question": "具體的澄清問題", "context": "說明此問題對應到哪份文件/哪張截圖的哪個部分，為何無法確定", "related_test_case_names": ["這個問題影響到的測試用例名稱"]}
  ]
}

規則：
1. 絕對不可以憑空猜測操作步驟、預期結果或業務邏輯。若文件或截圖沒有明確交代（例如：畫面上按鈕功能不明、缺少邊界值定義、流程分支不清楚），必須將該疑問列進 clarification_questions，而不是自行假設答案寫進測試用例。**即使你想得出一個看起來合理的答案，只要同一個地方存在一種以上合理、彼此會導致不同測試結果的解讀方式，也要優先提出澄清問題，不要自己選一種就定案**——寧可多問，也不要讓使用者事後才發現測試用例是照著你自己選的其中一種假設寫的。
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
8. 每筆測試用例如果是根據前面素材內容裡某幾張截圖寫的（例如描述畫面上的元素、狀態、文字、操作結果），把對應的圖片編號（素材內容裡標示的「圖N」，只填數字 N）填進 based_on_images 陣列；如果這筆用例主要是根據文件文字、或不是針對特定某張截圖，based_on_images 留空陣列即可，不要為了填欄位而硬猜。
9. 每個 clarification_questions 都要填 related_test_case_names：列出這個問題會影響到哪幾筆測試用例的名稱（通常是因為這個疑問而暫時留白/不確定的那幾筆）。這個欄位之後會被用來判斷「使用者回答這個問題時，只需要重新看到哪些用例」，**漏列的代價遠大於多列**——不確定某筆用例算不算相關時，寧可列進去，不要為了精簡而漏掉；如果這個問題不是針對特定用例（例如整體性的規格疑問），留空陣列即可。
10. 只回傳 JSON 本身。
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
      "notes": "補充備註，例如已知限制、風險或參考說明（若無則留空字串）",
      "based_on_images": [1, 3]
    }
  ],
  "clarification_questions": [
    {"id": "唯一識別碼，例如 q1", "question": "具體的澄清問題", "context": "說明為何無法確定", "related_test_case_names": ["這個問題影響到的測試用例名稱"]}
  ],
  "needs_full_context": false
}

規則：
1. 絕對不可以憑空猜測。若使用者的指示不夠明確（例如不清楚指的是哪一筆用例、要改成什麼內容），必須在 clarification_questions 中提出具體問題，而不是自行假設。**即使你想得出一個看起來合理的處理方式，只要使用者的指示存在一種以上合理、彼此會導致不同結果的解讀方式，也要優先提出澄清問題確認使用者真正要的是哪一種，不要自己選一種就直接套用**——寧可多問，也不要讓使用者事後才發現測試用例是照著你自己猜的方向改的。
2. 使用者沒有要求變動的測試用例，請維持原樣（包含使用者手動編輯過的內容），不要無故整批重寫或改變順序，除非使用者明確要求。
3. 使用者要求新增用例、修改步驟、調整優先級、刪除用例、調整所屬模塊或備註等，直接反映在回傳的 test_cases 陣列中；務必回傳完整的 test_cases 陣列，不是只回傳被修改的部分。
4. 若目前的測試用例清單是空的（尚未產生過任何用例），請依素材與使用者訊息從頭產生完整用例清單，比照上述相同規則。
5. 逐一檢查「目前尚未解決的澄清問題清單」裡的每一個問題，判斷使用者最新的訊息有沒有真正回答到它：
   - 有明確回答到的，把答案套用到對應的測試用例，並且不要再把這個問題放進回傳的 clarification_questions。
   - 沒有回答到的（例如使用者只回答了其中幾個問題、講了不相關的事、或訊息內容答非所問），這個問題必須**原封不動**保留在回傳的 clarification_questions 中再次提出，絕對不可以因為使用者這次沒提到就默默拿掉、當作已解決，也不可以自己編個答案來讓問題消失。
   - 只有當使用者對某個問題明確表示不需要處理時（例如「不管這個」「先跳過」「這個不重要」「不需要」「不用管」），才可以把那個問題從 clarification_questions 移除，並在對應的測試用例中維持原本已知的資訊，不要自行補上答案。
   - 使用者的訊息如果同時包含新的疑慮或指示，除了處理上述判斷之外，也要正常反映在 test_cases 或新的 clarification_questions 上。
   - **絕對不可以自相矛盾**：如果你在某個問題的 context 欄位裡描述「已解決」「已經處理」「不需要再確認」等意思，就代表這個問題不該再出現在 clarification_questions 陣列裡——已解決的問題就完整移除，不能一邊說已解決一邊又把它留在清單裡再問使用者一次；如果實際上還有殘留的疑慮（例如答案本身又衍生出新的不確定性），context 就不該用「已解決」這種說法，應該具體描述還沒確定的部分是什麼。
   - **不能只檢查「目前尚未解決的澄清問題清單」，也要檢查「先前的對話紀錄」與目前用例的備註（notes）**：即使原始素材文字本身仍然含糊（例如規格文件沒有明確定義某個數值範圍），只要使用者已經在對話中給過明確、具體的答案（例如精確的數字範圍、明確的行為選項），這個主題就已經確定，不可以因為重新讀一次素材、發現素材本身還是沒寫清楚，就把同一個主題重新包裝成新的疑問再問一次。尤其不可以用「這是否為最終規格」「是否為定案」「是否確定」之類的說法，把一個已經有明確答案的問題偽裝成新問題留在 clarification_questions 裡——這跟直接留著原本的問題一樣，都是不該發生的自相矛盾。只有當使用者的最新訊息本身針對同一主題提出新的疑慮、要求修改，或明確表示還不確定時，才可以針對這個主題再次提出問題。
6. 如果訊息中有列出「已鎖定審核」的用例名稱清單，這些用例已經過人工審核確認，絕對不可以修改它們的任何欄位、也不可以刪除或改名；使用者的指示如果會影響到它們，不要直接改，改成在 clarification_questions 提出問題向使用者確認要不要先解鎖。
7. 每筆測試用例如果是根據前面素材內容裡某幾張截圖寫的，把對應的圖片編號（素材內容裡標示的「圖N」，只填數字 N）填進 based_on_images 陣列；不是針對特定截圖的用例留空陣列即可。新增或修改用例時要重新判斷這個欄位，不要照抄舊值。
8. 所有文字使用繁體中文。
9. 任何字串欄位的內容裡都絕對不可以出現半形雙引號 " ——包含舉例、引用畫面文字、陣列/程式碼片段等情況。需要引用或舉例時一律改用全形「」，例如要表達陣列 ["A", "A"] 時要寫成「A、A」或 (A, A)，不可以直接把 " 寫進字串內容，否則會破壞 JSON 格式。
10. 每個 clarification_questions 都要填 related_test_case_names（規則同產生用例時），漏列的代價遠大於多列，不確定就列進去。
11. 如果你這次收到的「目前的測試用例清單」被告知只是「本次範圍」（訊息裡會有明確說明），而使用者最新的訊息內容明顯牽涉到範圍外的用例、或要求的操作範圍明顯比「本次範圍」更大（例如要求批次調整很多筆、或提到了範圍清單以外的用例名稱），你在目前資訊下沒辦法正確處理，不要嘗試用猜的處理，也不要因此把任何澄清問題當作已解決移除；把 needs_full_context 設為 true，test_cases 維持只回傳你看得到的「本次範圍」（不變即可），系統會自動改用完整清單重新問你一次。除此之外的所有情況 needs_full_context 都是 false。
12. 只回傳 JSON 本身。
"""


def _iter_numbered_images(
    materials: list[ParsedMaterial],
) -> Iterator[tuple[int, ParsedMaterial, str]]:
    """依序走訪每個素材會送給模型的圖片（圖片素材的主圖、以及每個素材的附加圖片），
    配上跨素材連續遞增的編號——不會像之前那樣每個素材各自從 1 開始，同一個 prompt
    裡才不會出現兩個「圖1」，模型引用時不會有歧義。build_material_content 組 prompt
    文字、resolve_image_numbers 反查真實圖片網址，都共用這個走訪順序跟編號，兩邊才會
    永遠對得起來，不用各寫一份重複又容易長歪的走訪邏輯。"""
    number = 1
    for material in materials:
        if material.kind == "image" and material.image_data_url:
            yield number, material, material.image_data_url
            number += 1
        for url in material.embedded_images:
            yield number, material, url
            number += 1


def resolve_image_numbers(materials: list[ParsedMaterial]) -> list[ImageRef]:
    """把「圖N」反查回實際素材與網址，供前端把測試用例的 based_on_images 畫成縮圖。"""
    return [
        ImageRef(number=number, material_id=material.id, filename=material.filename, url=url)
        for number, material, url in _iter_numbered_images(materials)
    ]


def build_material_content(materials: list[ParsedMaterial]) -> list[dict]:
    numbers_by_material: dict[str, list[int]] = {}
    for number, material, _url in _iter_numbered_images(materials):
        numbers_by_material.setdefault(material.id, []).append(number)

    content: list[dict] = []
    for material in materials:
        label = "檔案" if material.kind == "text" else "圖片"
        header = f"【{label}：{material.filename}】"
        if material.description:
            header += f"\n使用者說明：{material.description}"
        numbers = numbers_by_material.get(material.id, [])

        if material.kind == "text":
            content.append({"type": "text", "text": f"{header}\n{material.text}"})
            if material.embedded_images:
                # 純文字素材沒有自己的主圖，numbers 就是附加圖片各自的編號。
                content.append(
                    {
                        "type": "text",
                        "text": (
                            f"（以下 {len(material.embedded_images)} 張圖片跟這份素材是同一組，"
                            f"依序編號為圖{numbers[0]}、圖{numbers[0] + 1}……可能是文件內夾帶的截圖，"
                            "也可能是使用者額外標記為相關的畫面，請對照上面的文字內容一併理解。"
                            "如果在測試用例、備註或澄清問題裡需要指出是哪一張，請直接用「圖N」這種"
                            "編號稱呼，不要用「上圖」「下圖」這種畫面上根本沒有編號可以對應的說法）"
                        ),
                    }
                )
                for number, image_url in zip(numbers, material.embedded_images):
                    content.append({"type": "text", "text": f"圖{number}："})
                    content.append({"type": "image_url", "image_url": {"url": image_url}})
        else:
            content.append({"type": "text", "text": header})
            if material.embedded_images:
                # 有附加圖片時，numbers[0] 是主圖的編號，numbers[1:] 依序是附加圖片。
                content.append(
                    {
                        "type": "text",
                        "text": (
                            f"（以下共 {len(material.embedded_images) + 1} 張圖片同屬一組，"
                            f"依序編號為圖{numbers[0]}、圖{numbers[0] + 1}……通常代表同一畫面在不同"
                            "狀態或操作前後的對照，請對照理解，不要當成互不相關的獨立畫面。如果在"
                            "測試用例、備註或澄清問題裡需要指出是哪一張，請直接用「圖N」這種編號"
                            "稱呼，不要用「上圖」「下圖」這種畫面上根本沒有編號可以對應的說法）"
                        ),
                    }
                )
                content.append({"type": "text", "text": f"圖{numbers[0]}："})
                content.append({"type": "image_url", "image_url": {"url": material.image_data_url}})
                for number, image_url in zip(numbers[1:], material.embedded_images):
                    content.append({"type": "text", "text": f"圖{number}："})
                    content.append({"type": "image_url", "image_url": {"url": image_url}})
            else:
                content.append({"type": "text", "text": f"圖{numbers[0]}："})
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
    pending_questions: list[ClarificationQuestion],
    chat_history: list[ChatMessage],
    latest_message: str,
    scoped_ids: set[str] | None = None,
) -> list[dict]:
    """`scoped_ids` 有給值時，代表使用者正在回覆「目前尚未解決的澄清問題」，這些
    問題在上一輪由模型自己標記了 related_test_case_names（見 resolve_related_
    test_case_ids），範圍就是那些用例的 id——目的是縮減送給模型的內容量：大部分
    體積來自每筆用例完整的步驟描述，範圍外的用例只送名稱，不送步驟細節。範圍外
    的用例名稱清單還是會送，讓模型至少知道「還有哪些用例存在」；模型若判斷這次
    訊息其實牽涉到範圍外的內容，應該回報 needs_full_context=true，由呼叫端（見
    routers/conversations.py）自動改用完整清單重新問一次，不是自己用猜的處理。"""
    user_content = build_material_content(materials)

    if scoped_ids:
        in_scope = [tc for tc in current_test_cases if tc.id in scoped_ids]
        out_of_scope = [tc for tc in current_test_cases if tc.id not in scoped_ids]
        test_cases_json = json.dumps([tc.model_dump() for tc in in_scope], ensure_ascii=False)
        user_content.append(
            {
                "type": "text",
                "text": (
                    "使用者正在回覆先前的澄清問題，這是「本次範圍」的測試用例完整內容"
                    "（JSON，只包含跟待回答問題相關的用例）：\n" + test_cases_json
                ),
            }
        )
        if out_of_scope:
            other_names = "\n".join(f"- {tc.name}" for tc in out_of_scope)
            user_content.append(
                {
                    "type": "text",
                    "text": (
                        "除了本次範圍之外，這個對話裡還有以下測試用例（只列名稱，不含步驟細節，"
                        "本次不需要處理，你看不到它們的實際內容，回傳的 test_cases 陣列裡也不需要"
                        "包含它們）：\n" + other_names
                    ),
                }
            )
        user_content.append(
            {
                "type": "text",
                "text": (
                    "回傳的 test_cases 陣列**只需要包含「本次範圍」裡的用例**（可以修改內容、"
                    "也可以省略某一筆代表要刪除它），不要把範圍外的用例也放進來，也不要為了範圍外"
                    "的內容新增用例，除非使用者這次的訊息本身明確要求新增一筆全新的用例。"
                ),
            }
        )
        user_content.append(
            {
                "type": "text",
                "text": (
                    "**重要，務必遵守**：使用者這次的訊息如果不是單純在回答上面的待處理問題，"
                    "而是提出了新的指示，你必須先判斷這個指示要處理的範圍是不是超出「本次範圍」。"
                    "常見訊號：訊息裡出現「所有」「全部」「每一筆」「批次」等字眼；或指示內容"
                    "要看過全部用例的某個欄位（優先級、模塊、名稱……）才能判斷哪些用例該被處理"
                    "——例如「把所有 P0 用例改成 P1」，你必須看過全部用例的優先級欄位才知道哪些"
                    "是 P0，光看「本次範圍」這一兩筆完全不夠判斷。只要出現這類跡象，不管你能不能"
                    "在「本次範圍」裡湊出一個看起來合理的答案，都**絕對不准**只處理看得到的這幾筆"
                    "就當作完成——那等於用猜的決定「範圍外的用例符不符合這個指示」，是本專案絕對"
                    "禁止的行為，比留一個問題不回答更嚴重。這種情況下把 needs_full_context 設為"
                    "true，test_cases 維持「本次範圍」原樣即可，系統會自動改用完整清單重新問你"
                    "一次，使用者不需要自己發現問題、也不會因此被打斷操作。"
                ),
            }
        )
        locked_names = [tc.name for tc in in_scope if tc.locked]
    else:
        test_cases_json = json.dumps(
            [tc.model_dump() for tc in current_test_cases], ensure_ascii=False
        )
        user_content.append({"type": "text", "text": f"目前的測試用例清單（JSON）：\n{test_cases_json}"})
        locked_names = [tc.name for tc in current_test_cases if tc.locked]

    if locked_names:
        user_content.append(
            {
                "type": "text",
                "text": (
                    "以下用例已鎖定審核，絕對不可以修改或刪除，若使用者的指示會影響到它們，"
                    "改成在 clarification_questions 提出問題確認：\n"
                    + "\n".join(f"- {name}" for name in locked_names)
                ),
            }
        )

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


# 模型偶爾會在某個問題的 context 裡自己寫「已解決」，卻仍把這個問題留在
# clarification_questions 陣列裡再問使用者一次——這是模型輸出前後矛盾，不是
# 使用者需要再次確認的真問題。SYSTEM_PROMPT_CHAT 規則 5 已經明文禁止這種情況，
# 但模型不見得每次都遵守，這裡當作最後一道防線過濾掉，不然使用者會一直看到
# 自己已經回答過的問題。
_RESOLVED_CONTEXT_PATTERN = re.compile(r"已(?:經)?(?:解決|排除|處理|不需要(?:再)?(?:確認|澄清))")

# 另一種變形更難用單一關鍵字抓：模型在 context 裡明確引用了使用者先前給過的具體
# 答案（「使用者回覆」「依據使用者」等字樣），卻又把問題重新包裝成「這是否為最終
# 規格／是否為定案／是否確定」這種 meta 問題留著——語意上跟直接寫「已解決」是同一
# 種自相矛盾，只是換了說法逃過上面那個規則，真實案例中觀察到模型會這樣反覆對已經
# 給過精確數字答案的問題（例如 UUID 範圍、起始位址上限）持續要求「再確認一次」。
# 這裡要求「引用過使用者答覆」與「仍在問是否為最終」同時出現才過濾，避免誤殺真正
# 還沒有答案、只是剛好提到「最終規格」字樣的問題。
_RECONFIRMATION_LOOP_PATTERN = re.compile(
    r"(使用者回覆|依據使用者|使用者已回覆|使用者表示|使用者說).*?(是否為最終規格|是否為定案|是否確定|是否為最終版本)",
    re.DOTALL,
)


def _drop_self_contradicting_questions(result: GenerationResult) -> GenerationResult:
    kept = []
    for question in result.clarification_questions:
        if not question.context:
            kept.append(question)
            continue
        if _RESOLVED_CONTEXT_PATTERN.search(question.context):
            logger.warning(
                "clarification_question 自相矛盾（context 說已解決卻仍留在清單中），已濾掉: id=%s question=%r context=%r",
                question.id, question.question, question.context,
            )
            continue
        if _RECONFIRMATION_LOOP_PATTERN.search(question.context):
            logger.warning(
                "clarification_question 自相矛盾（context 引用過使用者答覆卻又問是否為最終），已濾掉: id=%s question=%r context=%r",
                question.id, question.question, question.context,
            )
            continue
        kept.append(question)
    result.clarification_questions = kept
    return result


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

    result = GenerationResult.model_validate(data)
    return _drop_self_contradicting_questions(result)
