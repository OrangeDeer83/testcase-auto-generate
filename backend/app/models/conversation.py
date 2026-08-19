import time
import uuid
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.models.test_case import ChatMessage, ClarificationQuestion, GenerationResult


class ChatEntry(BaseModel):
    """完整可回溯的畫面聊天紀錄，前端算好整包存下來，不影響餵給 LLM 用的 ChatMessage。"""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role: Literal["user", "assistant"]
    content: str = ""
    context: str = ""
    material_id: Optional[str] = None
    questions: Optional[list[ClarificationQuestion]] = None
    created_at: float = Field(default_factory=time.time)


class Conversation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    project_id: str
    name: str
    selected_material_ids: list[str] = Field(default_factory=list)
    chat_log: list[ChatEntry] = Field(default_factory=list)
    llm_history: list[ChatMessage] = Field(default_factory=list)
    last_result: Optional[GenerationResult] = None
    created_at: float = Field(default_factory=time.time)
    updated_at: float = Field(default_factory=time.time)
    schema_version: int = 1


class ConversationSummary(BaseModel):
    id: str
    name: str
    created_at: float
    updated_at: float
    message_count: int
    test_case_count: int
