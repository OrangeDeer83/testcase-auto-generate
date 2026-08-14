from typing import Literal

from pydantic import BaseModel, Field


class TestStep(BaseModel):
    step_no: int
    description: str
    expected_result: str


class TestCase(BaseModel):
    name: str
    preconditions: str = ""
    steps: list[TestStep]
    priority: str


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
