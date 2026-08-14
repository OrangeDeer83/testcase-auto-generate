from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.logging_config import logger
from app.models.session import Session
from app.models.test_case import ChatMessage, GenerationResult, TestCase
from app.services.llm_client import chat_completion
from app.services.prompt_builder import (
    LLMResponseParseError,
    build_chat_messages,
    build_messages,
    parse_generation_result,
)
from app.services.session_store import get_session

router = APIRouter(prefix="/api", tags=["generate"])


def _get_session_or_404(session_id: str) -> Session:
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session 不存在或已過期")
    return session


def _summarize_for_history(result: GenerationResult) -> str:
    parts = [f"已更新測試用例，目前共 {len(result.test_cases)} 筆。"]
    if result.clarification_questions:
        questions = "；".join(q.question for q in result.clarification_questions)
        parts.append(f"仍有 {len(result.clarification_questions)} 個待釐清問題：{questions}")
    return " ".join(parts)


@router.post("/sessions/{session_id}/generate", response_model=GenerationResult)
def generate(session_id: str):
    session = _get_session_or_404(session_id)
    if not session.materials:
        raise HTTPException(status_code=400, detail="尚未上傳任何素材")

    logger.info(
        "POST /generate session=%s materials=%d", session_id, len(session.materials)
    )

    messages = build_messages(session.materials)
    raw_response = chat_completion(messages)

    try:
        result = parse_generation_result(raw_response)
    except LLMResponseParseError as exc:
        logger.error("POST /generate session=%s 解析失敗: %s", session_id, exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    session.last_result = result
    logger.info(
        "POST /generate session=%s 結果: test_cases=%d questions=%d",
        session_id,
        len(result.test_cases),
        len(result.clarification_questions),
    )
    return result


class ChatPayload(BaseModel):
    message: str
    current_test_cases: list[TestCase] = Field(default_factory=list)


@router.post("/sessions/{session_id}/chat", response_model=GenerationResult)
def chat(session_id: str, payload: ChatPayload):
    session = _get_session_or_404(session_id)
    if not session.materials:
        raise HTTPException(status_code=400, detail="尚未上傳任何素材")

    pending_questions = session.last_result.clarification_questions if session.last_result else []

    prior_history = list(session.chat_history)
    session.chat_history.append(ChatMessage(role="user", content=payload.message))

    logger.info(
        "POST /chat session=%s message=%r current_test_cases=%d pending_questions=%d",
        session_id,
        payload.message,
        len(payload.current_test_cases),
        len(pending_questions),
    )

    messages = build_chat_messages(
        session.materials, payload.current_test_cases, pending_questions, prior_history, payload.message
    )
    raw_response = chat_completion(messages)

    try:
        result = parse_generation_result(raw_response)
    except LLMResponseParseError as exc:
        logger.error("POST /chat session=%s 解析失敗: %s", session_id, exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    session.last_result = result
    session.chat_history.append(ChatMessage(role="assistant", content=_summarize_for_history(result)))
    logger.info(
        "POST /chat session=%s 結果: test_cases=%d questions=%d",
        session_id,
        len(result.test_cases),
        len(result.clarification_questions),
    )
    return result


@router.put("/sessions/{session_id}/test-cases", response_model=GenerationResult)
def update_test_cases(session_id: str, payload: GenerationResult):
    """讓前端在使用者手動編輯測試用例表格後，把結果寫回 session，供匯出使用。"""
    session = _get_session_or_404(session_id)
    session.last_result = payload
    return payload
