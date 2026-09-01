import pytest

from app.models.test_case import ClarificationQuestion, GenerationResult, TestCase, TestStep
from app.services.test_case_lock import (
    VersionConflictError,
    check_result_version,
    enforce_lock_on_llm_result,
    enforce_lock_on_manual_edit,
    merge_scoped_llm_result,
)


def _case(name="用例A", locked=False, step_desc="步驟一", **kwargs) -> TestCase:
    return TestCase(
        name=name,
        steps=[TestStep(step_no=1, description=step_desc, expected_result="預期結果")],
        priority="P1",
        locked=locked,
        **kwargs,
    )


def test_manual_edit_locked_case_content_is_ignored() -> None:
    old = _case(locked=True)
    attempted = old.model_copy(update={"name": "被改過的名字", "locked": True})

    result = enforce_lock_on_manual_edit([old], [attempted])

    assert result[0].name == "用例A"
    assert result[0].locked is True


def test_manual_edit_unlocking_accepts_new_content() -> None:
    old = _case(locked=True)
    unlocked_edit = old.model_copy(update={"name": "改名成功", "locked": False})

    result = enforce_lock_on_manual_edit([old], [unlocked_edit])

    assert result[0].name == "改名成功"
    assert result[0].locked is False


def test_manual_edit_unlocked_case_accepts_new_content() -> None:
    old = _case(locked=False)
    edited = old.model_copy(update={"name": "自由編輯"})

    result = enforce_lock_on_manual_edit([old], [edited])

    assert result[0].name == "自由編輯"


def test_manual_edit_assigns_id_to_new_case_without_one() -> None:
    new_case = _case().model_copy(update={"id": ""})

    result = enforce_lock_on_manual_edit([], [new_case])

    assert result[0].id


def test_llm_result_locked_case_content_reverted_and_question_added() -> None:
    old = _case(locked=True, step_desc="原始步驟")
    llm_attempt = old.model_copy(update={"locked": True, "notes": "AI 想加的備註"})
    result = GenerationResult(test_cases=[llm_attempt], clarification_questions=[])

    final = enforce_lock_on_llm_result([old], result)

    assert final.test_cases[0].notes == ""
    assert any("已鎖定審核" in q.question for q in final.clarification_questions)


def test_llm_result_locked_case_removed_by_llm_is_restored() -> None:
    old = _case(name="鎖定用例", locked=True)
    result = GenerationResult(test_cases=[], clarification_questions=[])

    final = enforce_lock_on_llm_result([old], result)

    assert len(final.test_cases) == 1
    assert final.test_cases[0].name == "鎖定用例"
    assert any("鎖定用例" in q.question for q in final.clarification_questions)


def test_llm_result_locked_case_renamed_by_llm_is_still_protected() -> None:
    """真實事故：LLM 把鎖定用例的名字也一起改掉，但保留了原本看到的 id。舊版邏輯只靠
    名稱比對，會找不到舊用例、讓鎖定保護整個失效（改名+改內容都被悄悄接受，且不會有
    任何提示）。新版邏輯優先用 id 比對，即使改名也要能抓到、擋下這次修改。"""
    old = _case(name="資料交換表中已存在的資料在模型中被刪除", locked=True, step_desc="原始步驟")
    renamed_attempt = old.model_copy(
        update={"name": "Communication Config 模型節點刪除後更新", "locked": False, "notes": "AI 偷改的內容"}
    )
    result = GenerationResult(test_cases=[renamed_attempt], clarification_questions=[])

    final = enforce_lock_on_llm_result([old], result)

    assert len(final.test_cases) == 1
    assert final.test_cases[0].name == "資料交換表中已存在的資料在模型中被刪除"
    assert final.test_cases[0].locked is True
    assert final.test_cases[0].notes == ""
    assert any("已鎖定審核" in q.question for q in final.clarification_questions)


def test_llm_result_unlocked_case_keeps_previous_id() -> None:
    old = _case(name="用例B", locked=False)
    llm_new = TestCase(
        name="用例B",
        steps=[TestStep(step_no=1, description="新的步驟", expected_result="新的結果")],
        priority="P2",
    )
    result = GenerationResult(test_cases=[llm_new], clarification_questions=[])

    final = enforce_lock_on_llm_result([old], result)

    assert final.test_cases[0].id == old.id
    assert final.test_cases[0].steps[0].description == "新的步驟"


def test_llm_result_preserves_existing_questions() -> None:
    existing_question = ClarificationQuestion(id="q1", question="既有問題")
    result = GenerationResult(test_cases=[], clarification_questions=[existing_question])

    final = enforce_lock_on_llm_result([], result)

    assert final.clarification_questions == [existing_question]


def test_merge_scoped_result_leaves_out_of_scope_cases_untouched() -> None:
    """「針對已選用例提問」時，LLM 根本沒看過範圍外用例的內容，混進比對只會製造
    誤判——範圍外的用例不管 LLM 回傳了什麼，都要原封不動沿用舊版。"""
    in_scope = _case(name="範圍內用例", step_desc="舊步驟")
    out_of_scope = _case(name="範圍外用例", step_desc="不應該被動到")
    llm_edit = in_scope.model_copy(update={"steps": [
        TestStep(step_no=1, description="LLM 改過的步驟", expected_result="新結果")
    ]})
    result = GenerationResult(test_cases=[llm_edit], clarification_questions=[])

    merged = merge_scoped_llm_result([in_scope, out_of_scope], {in_scope.id}, result)

    assert len(merged.test_cases) == 2
    out = next(tc for tc in merged.test_cases if tc.name == "範圍外用例")
    assert out.steps[0].description == "不應該被動到"
    edited = next(tc for tc in merged.test_cases if tc.name == "範圍內用例")
    assert edited.steps[0].description == "LLM 改過的步驟"


def test_merge_scoped_result_omitted_in_scope_case_is_deleted() -> None:
    """範圍內的用例，LLM 回傳裡沒有對應 id，視為使用者這次要求刪除。"""
    in_scope = _case(name="要刪除的用例")
    result = GenerationResult(test_cases=[], clarification_questions=[])

    merged = merge_scoped_llm_result([in_scope], {in_scope.id}, result)

    assert merged.test_cases == []


def test_merge_scoped_result_appends_genuinely_new_case() -> None:
    """LLM 回傳裡出現不屬於任何既有用例的 id，代表使用者這次要求新增一筆全新的用例。"""
    in_scope = _case(name="既有用例")
    brand_new = TestCase(
        name="全新用例",
        steps=[TestStep(step_no=1, description="步驟", expected_result="結果")],
        priority="P2",
    )
    result = GenerationResult(test_cases=[in_scope, brand_new], clarification_questions=[])

    merged = merge_scoped_llm_result([in_scope], {in_scope.id}, result)

    names = {tc.name for tc in merged.test_cases}
    assert names == {"既有用例", "全新用例"}


def test_merge_scoped_result_then_lock_enforcement_still_protects_locked_case() -> None:
    """完整串起實際呼叫端（routers/conversations.py）的順序：先合併範圍內結果，
    再跑既有的鎖定保護，確認組合起來還是能正確擋下 LLM 想改動的鎖定用例。"""
    locked_in_scope = _case(name="鎖定用例", locked=True, step_desc="原始步驟")
    out_of_scope = _case(name="範圍外用例")
    llm_attempt = locked_in_scope.model_copy(update={"notes": "AI 想加的備註"})
    result = GenerationResult(test_cases=[llm_attempt], clarification_questions=[])

    merged = merge_scoped_llm_result(
        [locked_in_scope, out_of_scope], {locked_in_scope.id}, result
    )
    final = enforce_lock_on_llm_result([locked_in_scope, out_of_scope], merged)

    assert len(final.test_cases) == 2
    locked_result = next(tc for tc in final.test_cases if tc.name == "鎖定用例")
    assert locked_result.notes == ""
    assert any("已鎖定審核" in q.question for q in final.clarification_questions)


def test_check_result_version_matching_passes() -> None:
    check_result_version(previous_version=3, base_version=3)


def test_check_result_version_mismatch_raises() -> None:
    with pytest.raises(VersionConflictError):
        check_result_version(previous_version=3, base_version=2)
