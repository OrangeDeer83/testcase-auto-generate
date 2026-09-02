import pytest

from app.models.test_case import ClarificationQuestion, GenerationResult, TestCase, TestStep
from app.services.test_case_lock import (
    VersionConflictError,
    check_result_version,
    enforce_lock_on_llm_result,
    enforce_lock_on_manual_edit,
    merge_scoped_llm_result,
    resolve_related_test_case_ids,
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


def test_check_result_version_matching_passes() -> None:
    check_result_version(previous_version=3, base_version=3)


def test_check_result_version_mismatch_raises() -> None:
    with pytest.raises(VersionConflictError):
        check_result_version(previous_version=3, base_version=2)


def test_resolve_related_ids_returns_none_when_no_pending_questions() -> None:
    cases = [_case(name="用例A")]

    assert resolve_related_test_case_ids(cases, []) is None


def test_resolve_related_ids_returns_none_when_a_question_has_no_tags() -> None:
    """任何一個待處理問題沒標記關聯用例，就整個放棄自動縮小範圍——漏標的代價
    比多送內容更大，寧可退回送完整清單。"""
    cases = [_case(name="用例A"), _case(name="用例B")]
    tagged = ClarificationQuestion(id="q1", question="問題1", related_test_case_names=["用例A"])
    untagged = ClarificationQuestion(id="q2", question="問題2")

    assert resolve_related_test_case_ids(cases, [tagged, untagged]) is None


def test_resolve_related_ids_unions_across_multiple_questions() -> None:
    a, b, c = _case(name="用例A"), _case(name="用例B"), _case(name="用例C")
    q1 = ClarificationQuestion(id="q1", question="問題1", related_test_case_names=["用例A"])
    q2 = ClarificationQuestion(id="q2", question="問題2", related_test_case_names=["用例B", "用例C"])

    resolved = resolve_related_test_case_ids([a, b, c], [q1, q2])

    assert resolved == {a.id, b.id, c.id}


def test_resolve_related_ids_ignores_names_that_no_longer_match() -> None:
    """名稱可能是使用者手動改過、或 LLM 上一輪標記後這筆用例已被刪除——對不到
    就跳過，不當作錯誤；如果整批都對不到，回傳 None 讓呼叫端退回送完整清單。"""
    a = _case(name="用例A")
    q1 = ClarificationQuestion(id="q1", question="問題1", related_test_case_names=["已刪除的用例"])

    assert resolve_related_test_case_ids([a], [q1]) is None


def test_merge_scoped_result_leaves_out_of_scope_cases_untouched() -> None:
    in_scope = _case(name="範圍內")
    out_of_scope = _case(name="範圍外")
    llm_result = GenerationResult(
        test_cases=[in_scope.model_copy(update={"notes": "模型改過"})], clarification_questions=[]
    )

    merged = merge_scoped_llm_result([in_scope, out_of_scope], {in_scope.id}, llm_result)

    names_to_notes = {tc.name: tc.notes for tc in merged.test_cases}
    assert names_to_notes["範圍內"] == "模型改過"
    assert names_to_notes["範圍外"] == ""


def test_merge_scoped_result_omitted_in_scope_case_is_deleted() -> None:
    in_scope = _case(name="範圍內")
    out_of_scope = _case(name="範圍外")
    llm_result = GenerationResult(test_cases=[], clarification_questions=[])

    merged = merge_scoped_llm_result([in_scope, out_of_scope], {in_scope.id}, llm_result)

    assert [tc.name for tc in merged.test_cases] == ["範圍外"]


def test_merge_scoped_result_appends_genuinely_new_case() -> None:
    in_scope = _case(name="範圍內")
    new_case = TestCase(
        name="全新用例",
        steps=[TestStep(step_no=1, description="步驟", expected_result="結果")],
        priority="P2",
    )
    llm_result = GenerationResult(test_cases=[in_scope, new_case], clarification_questions=[])

    merged = merge_scoped_llm_result([in_scope], {in_scope.id}, llm_result)

    assert {tc.name for tc in merged.test_cases} == {"範圍內", "全新用例"}


def test_merge_scoped_result_then_lock_enforcement_still_protects_locked_case() -> None:
    locked = _case(name="鎖定用例", locked=True, step_desc="原始步驟")
    other = _case(name="其他用例")
    llm_attempt = locked.model_copy(update={"locked": True, "notes": "AI 想加的備註"})
    llm_result = GenerationResult(test_cases=[llm_attempt], clarification_questions=[])

    merged = merge_scoped_llm_result([locked, other], {locked.id}, llm_result)
    final = enforce_lock_on_llm_result([locked, other], merged)

    final_by_name = {tc.name: tc for tc in final.test_cases}
    assert final_by_name["鎖定用例"].notes == ""
    assert any("已鎖定審核" in q.question for q in final.clarification_questions)
