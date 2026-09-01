import json

from app.models.material import ParsedMaterial
from app.models.test_case import TestCase, TestStep
from app.services.prompt_builder import (
    build_chat_messages,
    build_material_content,
    parse_generation_result,
    resolve_image_numbers,
)


def test_single_image_material_has_no_group_hint_but_is_still_numbered() -> None:
    material = ParsedMaterial(filename="a.png", kind="image", image_data_url="data:image/png;base64,AAA")

    content = build_material_content([material])

    assert content == [
        {"type": "text", "text": "【圖片：a.png】"},
        {"type": "text", "text": "圖1："},
        {"type": "image_url", "image_url": {"url": "data:image/png;base64,AAA"}},
    ]


def test_grouped_image_material_numbers_every_image_starting_from_primary() -> None:
    material = ParsedMaterial(
        filename="開關前.png",
        kind="image",
        image_data_url="data:image/png;base64,BEFORE",
        embedded_images=["data:image/png;base64,AFTER"],
    )

    content = build_material_content([material])

    assert content[0] == {"type": "text", "text": "【圖片：開關前.png】"}
    # 主圖跟提示文字之間要有一段說明這是同一組、依序對照，不能讓模型以為是兩張無關的圖，
    # 且提示文字裡要教模型用「圖N」引用，不要用「上圖」「下圖」這種對不回去的說法。
    assert content[1]["type"] == "text"
    assert "同屬一組" in content[1]["text"]
    assert "圖1、圖2" in content[1]["text"]
    # 每張圖片前面都要有自己的編號標記，主圖是圖1、附加的是圖2，模型才有辦法精確引用。
    assert content[2] == {"type": "text", "text": "圖1："}
    assert content[3] == {"type": "image_url", "image_url": {"url": "data:image/png;base64,BEFORE"}}
    assert content[4] == {"type": "text", "text": "圖2："}
    assert content[5] == {"type": "image_url", "image_url": {"url": "data:image/png;base64,AFTER"}}


def test_text_material_without_embedded_images_has_no_group_hint() -> None:
    material = ParsedMaterial(filename="spec.pdf", kind="text", text="需求內容")

    content = build_material_content([material])

    assert content == [{"type": "text", "text": "【檔案：spec.pdf】\n需求內容"}]


def test_text_material_embedded_images_numbered_starting_from_one() -> None:
    """文字／PDF 素材合併了圖片進來（或 PDF 本身內嵌截圖）時，附加的圖片從圖1開始
    編號（文字素材沒有自己的主圖，不像圖片素材那樣主圖要先佔掉圖1）。"""
    material = ParsedMaterial(
        filename="spec.pdf",
        kind="text",
        text="需求內容",
        embedded_images=["data:image/png;base64,SHOT1", "data:image/png;base64,SHOT2"],
    )

    content = build_material_content([material])

    assert content[0] == {"type": "text", "text": "【檔案：spec.pdf】\n需求內容"}
    assert content[1]["type"] == "text"
    assert "同一組" in content[1]["text"]
    assert "圖1、圖2" in content[1]["text"]
    assert content[2] == {"type": "text", "text": "圖1："}
    assert content[3] == {"type": "image_url", "image_url": {"url": "data:image/png;base64,SHOT1"}}
    assert content[4] == {"type": "text", "text": "圖2："}
    assert content[5] == {"type": "image_url", "image_url": {"url": "data:image/png;base64,SHOT2"}}


def test_numbering_is_continuous_across_multiple_materials() -> None:
    """編號要跨素材連續遞增，不能每個素材各自從圖1開始——不然同一個 prompt 裡會出現
    兩個「圖1」，模型引用時分不清指的是哪個素材底下的那張圖。"""
    first = ParsedMaterial(filename="a.png", kind="image", image_data_url="data:image/png;base64,A")
    second = ParsedMaterial(
        filename="spec.pdf",
        kind="text",
        text="需求內容",
        embedded_images=["data:image/png;base64,B"],
    )

    content = build_material_content([first, second])

    assert {"type": "text", "text": "圖1："} in content
    assert {"type": "image_url", "image_url": {"url": "data:image/png;base64,A"}} in content
    assert {"type": "text", "text": "圖2："} in content
    assert {"type": "image_url", "image_url": {"url": "data:image/png;base64,B"}} in content


def test_resolve_image_numbers_matches_prompt_numbering() -> None:
    first = ParsedMaterial(filename="a.png", kind="image", image_data_url="data:image/png;base64,A")
    second = ParsedMaterial(
        filename="spec.pdf",
        kind="text",
        text="需求內容",
        embedded_images=["data:image/png;base64,B", "data:image/png;base64,C"],
    )

    refs = resolve_image_numbers([first, second])

    assert [(r.number, r.material_id, r.filename, r.url) for r in refs] == [
        (1, first.id, "a.png", "data:image/png;base64,A"),
        (2, second.id, "spec.pdf", "data:image/png;base64,B"),
        (3, second.id, "spec.pdf", "data:image/png;base64,C"),
    ]


def test_parse_generation_result_drops_questions_the_model_marked_as_resolved() -> None:
    """模型偶爾會在 context 裡寫「此問題已解決」，卻仍把問題留在 clarification_questions
    裡再問一次——這種自相矛盾的輸出要被過濾掉，不然使用者會一直看到自己已經回答過的問題。"""
    raw = json.dumps(
        {
            "test_cases": [],
            "clarification_questions": [
                {
                    "id": "q1",
                    "question": "錯誤提示的文案是什麼？",
                    "context": "使用者回覆會有錯誤提示，但當前版本暫不支援。此問題已解決，但需確認測試步驟是否需調整。",
                },
                {
                    "id": "q2",
                    "question": "UUID 的有效範圍是多少？",
                    "context": "規格中未說明格式與範圍，仍待使用者確認。",
                },
            ],
        }
    )

    result = parse_generation_result(raw)

    assert [q.id for q in result.clarification_questions] == ["q2"]


def test_parse_generation_result_keeps_questions_without_resolved_wording() -> None:
    raw = json.dumps(
        {
            "test_cases": [],
            "clarification_questions": [
                {"id": "q1", "question": "邊界值是多少？", "context": ""},
            ],
        }
    )

    result = parse_generation_result(raw)

    assert [q.id for q in result.clarification_questions] == ["q1"]


def test_parse_generation_result_drops_reconfirmation_loop_questions() -> None:
    """真實事故：模型對已經給過精確數字答案的問題（UUID 範圍、起始位址上限），
    不寫「已解決」，而是換句話說成「使用者回覆⋯，需確認此範圍是否為最終規格」，
    藉此逃過只認「已解決」關鍵字的過濾，讓使用者被同一批問題反覆詢問。"""
    raw = json.dumps(
        {
            "test_cases": [],
            "clarification_questions": [
                {
                    "id": "q2_uuid_range",
                    "question": "UUID 欄位的有效範圍是多少？",
                    "context": "使用者回覆 Q2 會設定為只能輸入大於等於 1 的數字，上限 1 ~ 247，需確認此範圍是否為最終規格。",
                },
                {
                    "id": "q4_starting_address",
                    "question": "起始位址欄位的有效範圍是多少？",
                    "context": "依據使用者回覆，UI 會限制只能輸入大於或等於 0 的整數，上限為 65535，需確認此限制是否為最終規格。",
                },
                {
                    "id": "q5_still_open",
                    "question": "匯出檔案的具體格式為何？",
                    "context": "規格明確指出檔案格式未明確定義，是否為最終規格目前無從判斷，使用者尚未回答。",
                },
            ],
        }
    )

    result = parse_generation_result(raw)

    assert [q.id for q in result.clarification_questions] == ["q5_still_open"]


def _tc(name: str, locked: bool = False) -> TestCase:
    return TestCase(
        name=name,
        steps=[TestStep(step_no=1, description="點擊登入按鈕", expected_result="導向首頁")],
        priority="P1",
        locked=locked,
    )


def _user_text_blocks(messages: list[dict]) -> list[str]:
    return [item["text"] for item in messages[1]["content"] if item["type"] == "text"]


def test_build_chat_messages_without_scope_sends_full_list() -> None:
    """沒有指定範圍時，行為要跟這個功能出現之前完全一樣——這是最基本的相容性
    保證，不能因為新增了 scoped_ids 這個參數就悄悄改變預設路徑的輸出。"""
    cases = [_tc("用例A"), _tc("用例B", locked=True)]

    messages = build_chat_messages([], cases, [], [], "hi")

    blocks = _user_text_blocks(messages)
    assert any("目前的測試用例清單（JSON）" in b and "用例A" in b and "用例B" in b for b in blocks)
    assert any("以下用例已鎖定審核" in b and "用例B" in b for b in blocks)
    assert not any("本次範圍" in b for b in blocks)


def test_build_chat_messages_with_scope_only_sends_full_content_for_selected() -> None:
    in_scope = _tc("被選中的用例")
    out_of_scope = _tc("沒被選中的用例")

    messages = build_chat_messages(
        [], [in_scope, out_of_scope], [], [], "hi", {in_scope.id}
    )

    blocks = _user_text_blocks(messages)
    scope_block = next(b for b in blocks if "本次範圍」的完整內容" in b)
    assert "被選中的用例" in scope_block
    assert "沒被選中的用例" not in scope_block

    other_block = next(b for b in blocks if "只列名稱" in b)
    assert "沒被選中的用例" in other_block
    # 名稱清單不該帶出步驟內容，確認真的只送了名稱、沒有夾帶完整 JSON。
    assert "點擊登入按鈕" not in other_block


def test_build_chat_messages_with_scope_locked_list_excludes_out_of_scope() -> None:
    """範圍外的用例即使是鎖定的，也不需要出現在「已鎖定審核」清單裡——它們本來
    就不會被合併邏輯動到，列出來只是干擾模型的雜訊。"""
    in_scope = _tc("範圍內未鎖定")
    out_of_scope_locked = _tc("範圍外已鎖定", locked=True)

    messages = build_chat_messages(
        [], [in_scope, out_of_scope_locked], [], [], "hi", {in_scope.id}
    )

    blocks = _user_text_blocks(messages)
    assert not any("已鎖定審核" in b for b in blocks)
