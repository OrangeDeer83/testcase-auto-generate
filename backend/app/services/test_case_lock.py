import uuid

from app.models.test_case import ClarificationQuestion, GenerationResult, TestCase

_LOCKED_EDIT_NOTICE = (
    "測試用例「{name}」已鎖定審核，AI 嘗試調整但未套用；如需修改請先解鎖再編輯。"
)
_LOCKED_REMOVED_NOTICE = (
    "測試用例「{name}」已鎖定審核，AI 的回覆中沒有保留這筆用例（可能是想刪除或改名），"
    "已自動保留原內容；如需調整請先解鎖。"
)


def _same_content(a: TestCase, b: TestCase) -> bool:
    ignore = {"id", "locked"}
    return a.model_dump(exclude=ignore) == b.model_dump(exclude=ignore)


class VersionConflictError(Exception):
    """整批覆寫測試用例（PUT /test-cases）時，client 送來的 base 版本跟伺服器目前
    版本對不上——代表這個分頁看到的是過期的快照（例如同一個對話被另一個分頁改過），
    直接接受會用舊資料悄悄蓋掉別人剛存的東西。"""


def check_result_version(previous_version: int, base_version: int) -> None:
    if base_version != previous_version:
        raise VersionConflictError(
            f"版本不符：目前版本 {previous_version}，收到的版本 {base_version}"
        )


def enforce_lock_on_manual_edit(
    previous: list[TestCase], incoming: list[TestCase]
) -> list[TestCase]:
    """人工手動編輯（整批 PUT）時，用 id 比對：舊的鎖定用例若新資料仍是鎖定狀態，
    整筆用舊版蓋掉（不管使用者送來的內容差在哪，等於後端強制唯讀）；舊的鎖定用例若
    新資料把它解鎖了，代表這是「解鎖並編輯」的動作，接受新內容。其餘（本來就沒鎖、
    或全新用例）直接接受。新用例沒帶 id 就補一個，避免之後鎖定時對不到。"""
    previous_by_id = {tc.id: tc for tc in previous}
    result: list[TestCase] = []
    for tc in incoming:
        if not tc.id:
            tc = tc.model_copy(update={"id": uuid.uuid4().hex})
        old = previous_by_id.get(tc.id)
        if old and old.locked and tc.locked:
            result.append(old)
        else:
            result.append(tc)
    return result


def enforce_lock_on_llm_result(
    previous: list[TestCase], result: GenerationResult
) -> GenerationResult:
    """LLM 對話式編輯時，LLM 完全不知道 id 的存在，只能用名稱比對。舊的鎖定用例：
    - 新結果裡同名存在 → 整筆換回舊版（保留 id/locked），內容跟 LLM 想給的不同就補一則
      澄清問題，讓使用者知道 AI 想改但被擋下。
    - 新結果裡完全找不到同名的（被改名或刪掉）→ 直接把舊版用例插回去，一樣補澄清問題。
    非鎖定的舊用例／全新用例：照舊比對名稱、盡量沿用舊 id，沒有對應就補新 id。"""
    previous_by_name = {tc.name: tc for tc in previous}
    locked_previous = [tc for tc in previous if tc.locked]

    extra_questions: list[ClarificationQuestion] = []
    final_cases: list[TestCase] = []
    seen_locked_names: set[str] = set()

    for tc in result.test_cases:
        old = previous_by_name.get(tc.name)
        if old and old.locked:
            seen_locked_names.add(tc.name)
            if not _same_content(old, tc):
                extra_questions.append(
                    ClarificationQuestion(
                        id=f"lock-{old.id}",
                        question=_LOCKED_EDIT_NOTICE.format(name=old.name),
                    )
                )
            final_cases.append(old)
        elif old:
            final_cases.append(tc.model_copy(update={"id": old.id, "locked": old.locked}))
        else:
            final_cases.append(tc)

    for old in locked_previous:
        if old.name in seen_locked_names:
            continue
        extra_questions.append(
            ClarificationQuestion(
                id=f"lock-{old.id}",
                question=_LOCKED_REMOVED_NOTICE.format(name=old.name),
            )
        )
        final_cases.append(old)

    return GenerationResult(
        test_cases=final_cases,
        clarification_questions=result.clarification_questions + extra_questions,
    )
