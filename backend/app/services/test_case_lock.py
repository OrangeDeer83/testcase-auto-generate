import uuid

from app.models.test_case import ClarificationQuestion, GenerationResult, PendingChange, TestCase

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


def resolve_related_test_case_ids(
    current_test_cases: list[TestCase], pending_questions: list[ClarificationQuestion]
) -> set[str] | None:
    """把「目前尚未解決的澄清問題」自己標記的 related_test_case_names（模型上一輪
    自己填的，見 prompt_builder 的 SYSTEM_PROMPT/SYSTEM_PROMPT_CHAT 規則）解析成
    這一輪自動縮小範圍要用的用例 id 集合。用名稱比對而不是直接要模型記 id，是因為
    用例剛建立的當下模型根本還沒看過後端指派的 id（同一輪回應裡新用例跟提到它的
    問題是一起產生的），只有名稱是模型當下就知道、記得住的（跟 enforce_lock_on_
    llm_result 的名稱比對 fallback 同樣考量）。

    任何一個待處理問題沒有標記 related_test_case_names，或标记的名稱一個都對不到
    現有用例，就整個放棄自動縮小範圍、回傳 None（呼叫端會退回送完整清單）——
    漏標的代價是「這次沒能正確縮小範圍」，比「誤判縮小、導致使用者的回覆送到
    模型手上時看不到真正需要的用例內容」安全得多。"""
    if not pending_questions:
        return None
    by_name = {tc.name: tc.id for tc in current_test_cases}
    ids: set[str] = set()
    for question in pending_questions:
        if not question.related_test_case_names:
            return None
        for name in question.related_test_case_names:
            tc_id = by_name.get(name)
            if tc_id:
                ids.add(tc_id)
    return ids or None


def merge_scoped_llm_result(
    previous: list[TestCase], scoped_ids: set[str], result: GenerationResult
) -> GenerationResult:
    """自動縮小範圍送出的聊天請求，LLM 只看得到 `scoped_ids` 這些用例，回傳的
    test_cases 陣列也只包含這些用例——這裡把它跟範圍外、原封不動的舊用例合併回
    一份完整清單，範圍外的用例一律保持原樣（LLM 看不到內容，本來就不可能正確
    修改它們，呼叫端不應該相信它回傳的任何範圍外內容）。"""
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


def compute_pending_changes(
    previous: list[TestCase], proposed: list[TestCase]
) -> list[PendingChange]:
    """把 AI 這次提出的完整用例清單（`proposed`，已經過 enforce_lock_on_llm_result
    保護，鎖定用例一定跟 `previous` 裡的內容一模一樣）跟目前已確認套用的清單
    （`previous`）比對，算出「有變動的部分」，包成一筆一筆的 PendingChange，
    交給使用者個別確認要不要套用——聊天回覆不再像以前一樣直接覆蓋 test_cases。
    用 id 比對（不是名稱），道理跟 merge_scoped_llm_result／
    enforce_lock_on_llm_result 一樣：名稱可能被同一次回覆一起改掉，用 id 才不會
    把「改名」誤判成「刪除一筆、新增一筆」。"""
    previous_by_id = {tc.id: tc for tc in previous}
    proposed_ids = {tc.id for tc in proposed}

    changes: list[PendingChange] = []
    for tc in proposed:
        old = previous_by_id.get(tc.id)
        if old is None:
            changes.append(PendingChange(id=tc.id, action="add", data=tc))
        elif old != tc:
            changes.append(PendingChange(id=tc.id, action="update", data=tc))

    for tc in previous:
        if tc.id not in proposed_ids:
            changes.append(PendingChange(id=tc.id, action="delete", data=None))

    return changes


def merge_pending_changes(
    existing: list[PendingChange], new: list[PendingChange]
) -> list[PendingChange]:
    """允許同時累積好幾筆不同用例的待確認建議（使用者可以先不理上一輪的建議、
    繼續往下聊），但同一筆用例只保留「最新一輪」的建議——如果使用者還沒套用
    第一次的建議，AI 這次又針對同一筆用例提出新的建議，用新的蓋掉舊的，不是
    疊加成兩筆互相衝突的待確認項目。"""
    by_id = {change.id: change for change in existing}
    for change in new:
        by_id[change.id] = change
    return list(by_id.values())


class PendingChangeNotFoundError(Exception):
    pass


class LockedCaseConflictError(Exception):
    """套用當下才發現目標用例已經被鎖定（例如建議提出之後、使用者套用之前，
    另一個分頁把這筆用例鎖定了）——鎖定保護必須在套用當下也守住一次，不能只
    信任建議產生當時的狀態。"""


def apply_pending_change(
    test_cases: list[TestCase], pending_changes: list[PendingChange], change_id: str
) -> tuple[list[TestCase], list[PendingChange]]:
    """把某一筆待確認建議實際套用進正式的用例清單，回傳（套用後的用例清單、
    移除這筆之後剩下的待確認清單）。呼叫端負責存檔跟版本號遞增。"""
    change = next((c for c in pending_changes if c.id == change_id), None)
    if change is None:
        raise PendingChangeNotFoundError(change_id)
    remaining = [c for c in pending_changes if c.id != change_id]

    if change.action == "add":
        assert change.data is not None
        return [*test_cases, change.data], remaining

    target = next((tc for tc in test_cases if tc.id == change_id), None)
    if target is not None and target.locked:
        raise LockedCaseConflictError(change_id)

    if change.action == "delete":
        return [tc for tc in test_cases if tc.id != change_id], remaining

    assert change.data is not None
    updated = [change.data if tc.id == change_id else tc for tc in test_cases]
    return updated, remaining


def dismiss_pending_change(
    pending_changes: list[PendingChange], change_id: str
) -> list[PendingChange]:
    """忽略某一筆待確認建議，不套用、直接從清單移除，正式的用例內容維持原樣。"""
    remaining = [c for c in pending_changes if c.id != change_id]
    if len(remaining) == len(pending_changes):
        raise PendingChangeNotFoundError(change_id)
    return remaining
