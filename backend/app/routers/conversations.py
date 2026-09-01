import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from openai import OpenAIError
from pydantic import BaseModel, Field

from app.logging_config import logger
from app.models.conversation import ChatEntry, Conversation, ConversationSummary
from app.models.material import ImageRef
from app.models.test_case import ChatMessage, GenerationResult, TestCase
from app.services import conversation_store, project_store
from app.services.llm_client import stream_chat_completion
from app.services.prompt_builder import (
    LLMResponseParseError,
    build_chat_messages,
    build_messages,
    parse_generation_result,
    resolve_image_numbers,
)
from app.services.test_case_lock import (
    VersionConflictError,
    check_result_version,
    enforce_lock_on_llm_result,
    enforce_lock_on_manual_edit,
    merge_scoped_llm_result,
)

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


@router.get("/{conversation_id}/image-map", response_model=list[ImageRef])
def get_image_map(project_id: str, conversation_id: str):
    """把「圖N」反查回實際素材與網址，讓前端把測試用例的 based_on_images 畫成縮圖。
    每次都用「現在」選取的素材現算，如果素材在產生用例之後被刪除／拆出／合併過，
    編號可能對不上當初產生時的畫面——這是已知限制，不在這次處理範圍內。"""
    _get_project_or_404(project_id)
    conversation = _get_conversation_or_404(project_id, conversation_id)
    materials = _selected_materials(project_id, conversation)
    return resolve_image_numbers(materials)


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


def _sse_event(event: str, data: dict) -> str:
    """組出一個 Server-Sent Events 事件字串。SSE 格式規定每個事件用兩個換行結尾，
    `data:` 這行內容就是一段 JSON，前端逐段收、逐段解析。"""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _stream_llm_events(endpoint: str, conversation_id: str, messages: list[dict]):
    """呼叫模型並把每個文字片段包成 SSE `delta` 事件即時 yield 出去，讓前端能在
    模型還在產生內容的當下就看到，不用像以前一樣整批等完成才有任何畫面回饋
    （見 llm_client.stream_chat_completion 的說明）。用 `return` 帶出完整回應
    文字，呼叫端（見下方兩個 endpoint）用 `yield from` 驅動這個 generator、
    再用一般函式呼叫拿到 return 值的方式取得它：
        raw_response = yield from _stream_llm_events(...)
        if raw_response is None:
            return  # 已經 yield 過 error 事件，呼叫端不用再處理

    呼叫失敗（逾時、連線錯誤、模型服務回傳非 2xx）時不能像以前的一般 HTTP
    回應那樣直接拋 HTTPException：StreamingResponse 一開始輸出，HTTP 狀態碼
    跟標頭就已經送出去了，沒辦法在中途改成錯誤狀態碼。改成 yield 一個 SSE
    `error` 事件、回傳 None，由前端自己判斷這個事件、顯示對應的錯誤訊息，
    語意上等同於原本的 502 錯誤內容。"""
    parts: list[str] = []
    try:
        for chunk in stream_chat_completion(messages):
            parts.append(chunk)
            yield _sse_event("delta", {"text": chunk})
    except OpenAIError as exc:
        logger.error("%s conversation=%s 呼叫模型失敗: %s", endpoint, conversation_id, exc)
        yield _sse_event("error", {"detail": "模型服務暫時無回應，請稍後再試一次"})
        return None
    return "".join(parts)


@router.post("/{conversation_id}/generate")
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

    def event_stream():
        raw_response = yield from _stream_llm_events("POST /generate", conversation_id, messages)
        if raw_response is None:
            return

        try:
            result = parse_generation_result(raw_response)
        except LLMResponseParseError as exc:
            logger.error("POST /generate conversation=%s 解析失敗: %s", conversation_id, exc)
            yield _sse_event("error", {"detail": str(exc)})
            return

        previous_cases = conversation.last_result.test_cases if conversation.last_result else []
        previous_version = conversation.last_result.result_version if conversation.last_result else 0
        result = enforce_lock_on_llm_result(previous_cases, result)
        result.result_version = previous_version + 1
        conversation.last_result = result
        conversation_store.save_conversation(project_id, conversation)
        logger.info(
            "POST /generate conversation=%s 結果: test_cases=%d questions=%d",
            conversation_id, len(result.test_cases), len(result.clarification_questions),
        )
        yield _sse_event("result", result.model_dump())

    return StreamingResponse(event_stream(), media_type="text/event-stream")


def _isimage_material(material) -> bool:
    return material.kind == "image"


class ChatPayload(BaseModel):
    message: str
    current_test_cases: list[TestCase] = Field(default_factory=list)
    attachment_material_id: str | None = None
    # 使用者「針對已選用例提問」時帶來的用例 id 清單——有給值時，送給模型的
    # prompt 只會包含這幾筆用例的完整內容（其餘只送名稱），縮減請求大小；
    # current_test_cases 仍然是完整清單，只是「要不要把完整內容送進 prompt」
    # 這件事分開由這個欄位控制，事後合併回傳結果時還是靠完整的 current_test_cases。
    scoped_test_case_ids: list[str] | None = None


@router.post("/{conversation_id}/chat")
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

    scoped_ids = set(payload.scoped_test_case_ids) if payload.scoped_test_case_ids else None

    logger.info(
        "POST /chat project=%s conversation=%s message=%r current_test_cases=%d pending_questions=%d"
        " scoped=%s",
        project_id, conversation_id, final_message, len(payload.current_test_cases), len(pending_questions),
        len(scoped_ids) if scoped_ids else 0,
    )

    messages = build_chat_messages(
        materials, payload.current_test_cases, pending_questions, prior_history, final_message, scoped_ids
    )

    def event_stream():
        raw_response = yield from _stream_llm_events("POST /chat", conversation_id, messages)
        if raw_response is None:
            return

        try:
            result = parse_generation_result(raw_response)
        except LLMResponseParseError as exc:
            logger.error("POST /chat conversation=%s 解析失敗: %s", conversation_id, exc)
            yield _sse_event("error", {"detail": str(exc)})
            return

        if scoped_ids:
            # LLM 只看得到範圍內用例，回傳的 test_cases 也只有範圍內的部分，
            # 要先合併回完整清單，下面的鎖定保護／存檔才能照舊流程處理。
            result = merge_scoped_llm_result(payload.current_test_cases, scoped_ids, result)

        # 鎖定保護要跟 LLM 實際看到的內容用同一份「之前」基準（payload.current_test_cases，
        # 上面 build_chat_messages 也是用這份），不能用 conversation.last_result.test_cases。
        # 前端手動編輯表格是 debounce 1 秒後才真的存檔（見 WorkspacePage.tsx 的自動存檔
        # effect），如果使用者編輯後不到 1 秒就送出聊天訊息，伺服器端這時候存的
        # last_result 可能還是編輯前的舊內容；用它當基準比對，會把使用者剛做的合法編輯
        # 誤判成「跟舊版不同」，連鎖定用例本身都沒被 LLM 動過，也會被這份過期基準覆蓋掉。
        previous_cases = payload.current_test_cases
        previous_version = conversation.last_result.result_version if conversation.last_result else 0
        result = enforce_lock_on_llm_result(previous_cases, result)
        result.result_version = previous_version + 1
        conversation.last_result = result
        conversation.llm_history.append(ChatMessage(role="user", content=final_message))
        conversation.llm_history.append(
            ChatMessage(role="assistant", content=_summarize_for_history(result))
        )
        conversation_store.save_conversation(project_id, conversation)
        logger.info(
            "POST /chat conversation=%s 結果: test_cases=%d questions=%d",
            conversation_id, len(result.test_cases), len(result.clarification_questions),
        )
        yield _sse_event("result", result.model_dump())

    return StreamingResponse(event_stream(), media_type="text/event-stream")


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
    previous_version = conversation.last_result.result_version if conversation.last_result else 0
    try:
        check_result_version(previous_version, payload.result_version)
    except VersionConflictError as exc:
        raise HTTPException(
            status_code=409,
            detail="這個對話的測試用例已經在別的分頁被修改過，請重新整理後再繼續編輯。",
        ) from exc
    payload.test_cases = enforce_lock_on_manual_edit(previous_cases, payload.test_cases)
    payload.result_version = previous_version + 1
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
