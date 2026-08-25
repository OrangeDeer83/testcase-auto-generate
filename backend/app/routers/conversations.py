from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.logging_config import logger
from app.models.conversation import ChatEntry, Conversation, ConversationSummary
from app.models.test_case import ChatMessage, GenerationResult, TestCase
from app.services import conversation_store, project_store
from app.services.llm_client import chat_completion
from app.services.prompt_builder import (
    LLMResponseParseError,
    build_chat_messages,
    build_messages,
    parse_generation_result,
)
from app.services.test_case_lock import enforce_lock_on_llm_result, enforce_lock_on_manual_edit

router = APIRouter(prefix="/api/projects/{project_id}/conversations", tags=["conversations"])


def _get_project_or_404(project_id: str):
    project = project_store.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="專案不存在或已被刪除")
    return project


def _get_conversation_or_404(project_id: str, conversation_id: str) -> Conversation:
    conversation = conversation_store.get_conversation(project_id, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="對話不存在或已被刪除")
    return conversation


def _selected_materials(project_id: str, conversation: Conversation):
    materials_by_id = {m.id: m for m in project_store.list_materials(project_id)}
    return [
        materials_by_id[mid] for mid in conversation.selected_material_ids if mid in materials_by_id
    ]


class ConversationCreatePayload(BaseModel):
    name: str = "新對話"


@router.post("", response_model=Conversation)
def create_conversation(project_id: str, payload: ConversationCreatePayload):
    _get_project_or_404(project_id)
    name = payload.name.strip() or "新對話"
    return conversation_store.create_conversation(project_id, name, [])


@router.get("", response_model=list[ConversationSummary])
def list_conversations(project_id: str):
    _get_project_or_404(project_id)
    return conversation_store.list_conversations(project_id)


@router.get("/{conversation_id}", response_model=Conversation)
def get_conversation(project_id: str, conversation_id: str):
    _get_project_or_404(project_id)
    return _get_conversation_or_404(project_id, conversation_id)


class ConversationUpdatePayload(BaseModel):
    name: str | None = None
    selected_material_ids: list[str] | None = None


@router.patch("/{conversation_id}", response_model=Conversation)
def update_conversation(project_id: str, conversation_id: str, payload: ConversationUpdatePayload):
    _get_project_or_404(project_id)
    _get_conversation_or_404(project_id, conversation_id)

    name = None
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="對話名稱不可為空")

    return conversation_store.update_conversation(
        project_id, conversation_id, name=name, selected_material_ids=payload.selected_material_ids
    )


@router.delete("/{conversation_id}", status_code=204)
def delete_conversation(project_id: str, conversation_id: str):
    _get_project_or_404(project_id)
    if not conversation_store.delete_conversation(project_id, conversation_id):
        raise HTTPException(status_code=404, detail="對話不存在或已被刪除")


@router.post("/{conversation_id}/generate", response_model=GenerationResult)
def generate(project_id: str, conversation_id: str):
    _get_project_or_404(project_id)
    conversation = _get_conversation_or_404(project_id, conversation_id)

    materials = _selected_materials(project_id, conversation)
    if not materials:
        raise HTTPException(status_code=400, detail="這個對話尚未選擇任何素材")

    logger.info(
        "POST /generate project=%s conversation=%s materials=%d",
        project_id, conversation_id, len(materials),
    )

    messages = build_messages(materials)
    raw_response = chat_completion(messages)

    try:
        result = parse_generation_result(raw_response)
    except LLMResponseParseError as exc:
        logger.error("POST /generate conversation=%s 解析失敗: %s", conversation_id, exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    previous_cases = conversation.last_result.test_cases if conversation.last_result else []
    result = enforce_lock_on_llm_result(previous_cases, result)
    conversation.last_result = result
    conversation_store.save_conversation(project_id, conversation)
    logger.info(
        "POST /generate conversation=%s 結果: test_cases=%d questions=%d",
        conversation_id, len(result.test_cases), len(result.clarification_questions),
    )
    return result


def _isimage_material(material) -> bool:
    return material.kind == "image"


class ChatPayload(BaseModel):
    message: str
    current_test_cases: list[TestCase] = Field(default_factory=list)
    attachment_material_id: str | None = None


@router.post("/{conversation_id}/chat", response_model=GenerationResult)
def chat(project_id: str, conversation_id: str, payload: ChatPayload):
    _get_project_or_404(project_id)
    conversation = _get_conversation_or_404(project_id, conversation_id)

    materials = _selected_materials(project_id, conversation)
    if not materials:
        raise HTTPException(status_code=400, detail="這個對話尚未選擇任何素材")

    final_message = payload.message
    if payload.attachment_material_id:
        attachment = project_store.get_material(project_id, payload.attachment_material_id)
        if attachment:
            kind_label = "圖片" if _isimage_material(attachment) else "文件"
            final_message = (
                f"{payload.message}（已附上{kind_label}：{attachment.filename}）"
                if payload.message
                else f"（附上{kind_label}：{attachment.filename}，請參考內容回答）"
            )

    pending_questions = conversation.last_result.clarification_questions if conversation.last_result else []
    prior_history = list(conversation.llm_history)
    conversation.llm_history.append(ChatMessage(role="user", content=final_message))

    logger.info(
        "POST /chat project=%s conversation=%s message=%r current_test_cases=%d pending_questions=%d",
        project_id, conversation_id, final_message, len(payload.current_test_cases), len(pending_questions),
    )

    messages = build_chat_messages(
        materials, payload.current_test_cases, pending_questions, prior_history, final_message
    )
    raw_response = chat_completion(messages)

    try:
        result = parse_generation_result(raw_response)
    except LLMResponseParseError as exc:
        logger.error("POST /chat conversation=%s 解析失敗: %s", conversation_id, exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    previous_cases = conversation.last_result.test_cases if conversation.last_result else []
    result = enforce_lock_on_llm_result(previous_cases, result)
    conversation.last_result = result
    conversation.llm_history.append(
        ChatMessage(role="assistant", content=_summarize_for_history(result))
    )
    conversation_store.save_conversation(project_id, conversation)
    logger.info(
        "POST /chat conversation=%s 結果: test_cases=%d questions=%d",
        conversation_id, len(result.test_cases), len(result.clarification_questions),
    )
    return result


def _summarize_for_history(result: GenerationResult) -> str:
    parts = [f"已更新測試用例，目前共 {len(result.test_cases)} 筆。"]
    if result.clarification_questions:
        questions = "；".join(q.question for q in result.clarification_questions)
        parts.append(f"仍有 {len(result.clarification_questions)} 個待釐清問題：{questions}")
    return " ".join(parts)


@router.put("/{conversation_id}/test-cases", response_model=GenerationResult)
def update_test_cases(project_id: str, conversation_id: str, payload: GenerationResult):
    _get_project_or_404(project_id)
    conversation = _get_conversation_or_404(project_id, conversation_id)
    previous_cases = conversation.last_result.test_cases if conversation.last_result else []
    payload.test_cases = enforce_lock_on_manual_edit(previous_cases, payload.test_cases)
    conversation.last_result = payload
    conversation_store.save_conversation(project_id, conversation)
    return payload


class ChatLogPayload(BaseModel):
    chat_log: list[ChatEntry]


@router.put("/{conversation_id}/chat-log", response_model=list[ChatEntry])
def update_chat_log(project_id: str, conversation_id: str, payload: ChatLogPayload):
    _get_project_or_404(project_id)
    conversation = _get_conversation_or_404(project_id, conversation_id)
    conversation.chat_log = payload.chat_log
    conversation_store.save_conversation(project_id, conversation)
    return payload.chat_log
