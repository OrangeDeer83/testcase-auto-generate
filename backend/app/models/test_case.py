import uuid
from typing import Literal

from pydantic import BaseModel, Field


class TestStep(BaseModel):
    step_no: int
    description: str
    expected_result: str


class TestCase(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    name: str
    module: str = ""
    preconditions: str = ""
    steps: list[TestStep]
    priority: str
    notes: str = ""
    locked: bool = False
    based_on_images: list[int] = Field(default_factory=list)


class ClarificationQuestion(BaseModel):
    id: str
    question: str
    context: str = ""
    # 用「名稱」而不是內部 id：模型看得到、也記得住的只有名稱（新建立的用例在
    # 這一輪回應當下根本還沒有 id，id 是後端事後才指派的），跟 diffTestCases.ts／
    # enforce_lock_on_llm_result 既有的名稱比對邏輯一致，靠這個名稱清單解析出
    # 後續自動縮小範圍時要用的實際 id（見 conversations.py 的
    # resolve_related_test_case_ids）。
    related_test_case_names: list[str] = Field(default_factory=list)


class PendingChange(BaseModel):
    """聊天式編輯時，AI 提出的一筆待人工確認的用例變更——聊天回覆不會直接套用
    到正式的 test_cases 清單，而是先累積在這裡，使用者在畫面上個別點「套用」
    才會真的生效（見 conversations.py 的 apply/dismiss endpoint）。`id` 對應
    目標用例的 id（action="add" 時是這筆新用例被指派的 id）；action="delete"
    時 `data` 是 None，其餘動作 `data` 是 AI 建議的完整用例內容。"""

    id: str
    action: Literal["add", "update", "delete"]
    data: TestCase | None = None


class GenerationResult(BaseModel):
    test_cases: list[TestCase] = Field(default_factory=list)
    clarification_questions: list[ClarificationQuestion] = Field(default_factory=list)
    result_version: int = 0
    # 只在「自動縮小範圍」的聊天請求中有意義：模型發現使用者這次的訊息牽涉到
    # 範圍外的用例、看不到的內容不夠處理時回報 true，後端據此自動用完整清單
    # 重新問一次（見 conversations.py 的 _chat_with_auto_scope），不會持久化
    # 保留，下一輪一律重新視為 false。
    needs_full_context: bool = False
    # 聊天式編輯尚未被使用者確認套用的建議變更列表；只有初次產生（/generate）
    # 沒有這個概念，一律直接寫進 test_cases（沒有「之前」可以比較）。
    pending_changes: list[PendingChange] = Field(default_factory=list)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
