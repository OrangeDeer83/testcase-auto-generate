from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.session import Session
from app.models.test_case import GenerationResult, QAAnswer
from app.services.llm_client import chat_completion
from app.services.prompt_builder import (
    LLMResponseParseError,
    build_messages,
    parse_generation_result,
)
from app.services.session_store import get_session

router = APIRouter(prefix="/api", tags=["generate"])


def _run_generation(session: Session) -> GenerationResult:
    if not session.materials:
        raise HTTPException(status_code=400, detail="尚未上傳任何素材")

    messages = build_messages(session.materials, session.qa_history)
    raw_response = chat_completion(messages)

    try:
        result = parse_generation_result(raw_response)
    except LLMResponseParseError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    session.last_result = result
    return result


def _get_session_or_404(session_id: str) -> Session:
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session 不存在或已過期")
    return session


@router.post("/sessions/{session_id}/generate", response_model=GenerationResult)
def generate(session_id: str):
    session = _get_session_or_404(session_id)
    return _run_generation(session)


class AnswerPayload(BaseModel):
    answers: list[QAAnswer]


@router.post("/sessions/{session_id}/answers", response_model=GenerationResult)
def submit_answers(session_id: str, payload: AnswerPayload):
    session = _get_session_or_404(session_id)
    session.qa_history.extend(payload.answers)
    return _run_generation(session)


@router.put("/sessions/{session_id}/test-cases", response_model=GenerationResult)
def update_test_cases(session_id: str, payload: GenerationResult):
    """讓前端在使用者手動編輯測試用例表格後，把結果寫回 session，供匯出使用。"""
    session = _get_session_or_404(session_id)
    session.last_result = payload
    return payload
