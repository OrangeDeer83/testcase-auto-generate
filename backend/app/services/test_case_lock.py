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


def merge_scoped_llm_result(
    previous: list[TestCase], scoped_ids: set[str], result: GenerationResult
) -> GenerationResult:
    """使用者「針對已選用例提問」時（見 prompt_builder.build_chat_messages 的
    scoped_ids 參數），LLM 只看得到範圍內用例的完整內容，回傳的 test_cases 陣列
    也只會包含範圍內的用例——這裡要把這份「只有一部分」的結果，跟範圍外原封不動
    的既有用例合併回一份完整清單，之後才能照舊流程跑 enforce_lock_on_llm_result、
    存檔、算 diff。範圍外的用例完全不經過這個函式的任何判斷就直接沿用舊版——LLM
    根本沒看過它們的內容，不可能是它主動修改的，混進來比對只會製造誤判。

    在「範圍內」比對用 id（LLM 通常會原封不動帶著看到的 id）：
    - 範圍內的舊用例，LLM 回傳裡有對應 id → 用 LLM 的版本（可能被改過）。
    - 範圍內的舊用例，LLM 回傳裡找不到對應 id → 視為使用者這次要求刪除，不保留。
    - LLM 回傳裡出現不屬於任何既有用例的 id → 全新用例，附加在清單最後。
    """
    previous_ids = {tc.id for tc in previous}
    llm_by_id = {tc.id: tc for tc in result.test_cases}

    merged: list[TestCase] = []
    for tc in previous:
        if tc.id not in scoped_ids:
            merged.append(tc)
            continue
        replacement = llm_by_id.get(tc.id)
        if replacement is not None:
            merged.append(replacement)
        # 範圍內、LLM 沒有回傳對應 id → 視為刪除，不加入 merged

    for tc in result.test_cases:
        if tc.id not in previous_ids:
            merged.append(tc)

    return GenerationResult(
        test_cases=merged,
        clarification_questions=result.clarification_questions,
    )


def enforce_lock_on_llm_result(
    previous: list[TestCase], result: GenerationResult
) -> GenerationResult:
    """LLM 對話式編輯時，優先用 id 比對回舊的用例——LLM 回傳的 JSON 裡通常會原封不動
    帶著看到的 id，只有在它把 id 弄丟時才退回用名稱比對（例如某些完全重寫的舊資料）。
    只靠名稱比對曾經是唯一手段，但這樣一來，只要 LLM 把某筆鎖定用例「連同改名一起」
    調整（例如把「資料交換表中已存在的資料在模型中被刪除」悄悄改名成別的名字），
    比對就會找不到舊用例，讓鎖定保護整個失效、內容跟著被換掉，卻不會觸發任何提示——
    這是真的在正式環境發生過的資料外洩式 bug，因此 id 比對必須放在名稱比對前面。
    舊的鎖定用例：
    - 新結果裡同 id（或找不到 id 時同名）存在 → 整筆換回舊版（保留 id/locked），內容跟
      LLM 想給的不同就補一則澄清問題，讓使用者知道 AI 想改但被擋下。
    - 新結果裡完全找不到對應的（被改名又弄丟 id，或整筆被刪掉）→ 直接把舊版用例插回去，
      一樣補澄清問題。
    非鎖定的舊用例／全新用例：照舊比對、盡量沿用舊 id，沒有對應就補新 id。"""
    previous_by_id = {tc.id: tc for tc in previous}
    previous_by_name = {tc.name: tc for tc in previous}
    locked_previous = [tc for tc in previous if tc.locked]

    extra_questions: list[ClarificationQuestion] = []
    final_cases: list[TestCase] = []
    seen_locked_ids: set[str] = set()

    for tc in result.test_cases:
        old = previous_by_id.get(tc.id) or previous_by_name.get(tc.name)
        if old and old.locked:
            seen_locked_ids.add(old.id)
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
        if old.id in seen_locked_ids:
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
