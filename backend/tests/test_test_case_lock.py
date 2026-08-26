import pytest

from app.models.test_case import ClarificationQuestion, GenerationResult, TestCase, TestStep
from app.services.test_case_lock import (
    VersionConflictError,
    check_result_version,
    enforce_lock_on_llm_result,
    enforce_lock_on_manual_edit,
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
