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


class GenerationResult(BaseModel):
    test_cases: list[TestCase] = Field(default_factory=list)
    clarification_questions: list[ClarificationQuestion] = Field(default_factory=list)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
