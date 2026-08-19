import time

from app.models.conversation import Conversation, ConversationSummary
from app.services import data_paths as paths


def create_conversation(project_id: str, name: str, selected_material_ids: list[str]) -> Conversation:
    conversation = Conversation(
        project_id=project_id, name=name, selected_material_ids=selected_material_ids
    )
    with paths.lock():
        paths.atomic_write_json(paths.conversation_path(project_id, conversation.id), conversation)
    return conversation


def get_conversation(project_id: str, conversation_id: str) -> Conversation | None:
    return paths.read_json(paths.conversation_path(project_id, conversation_id), Conversation)


def list_conversations(project_id: str) -> list[ConversationSummary]:
    conv_dir = paths.conversations_dir(project_id)
    if not conv_dir.exists():
        return []
    summaries: list[ConversationSummary] = []
    for conv_path in conv_dir.glob("*.json"):
        conversation = paths.read_json(conv_path, Conversation)
        if not conversation:
            continue
        summaries.append(
            ConversationSummary(
                id=conversation.id,
                name=conversation.name,
                created_at=conversation.created_at,
                updated_at=conversation.updated_at,
                message_count=len(conversation.chat_log),
                test_case_count=len(conversation.last_result.test_cases) if conversation.last_result else 0,
            )
        )
    summaries.sort(key=lambda s: s.updated_at, reverse=True)
    return summaries


def save_conversation(project_id: str, conversation: Conversation) -> None:
    conversation.updated_at = time.time()
    with paths.lock():
        paths.atomic_write_json(paths.conversation_path(project_id, conversation.id), conversation)


def update_conversation(
    project_id: str,
    conversation_id: str,
    name: str | None = None,
    selected_material_ids: list[str] | None = None,
) -> Conversation | None:
    with paths.lock():
        conversation = get_conversation(project_id, conversation_id)
        if not conversation:
            return None
        if name is not None:
            conversation.name = name
        if selected_material_ids is not None:
            conversation.selected_material_ids = selected_material_ids
        conversation.updated_at = time.time()
        paths.atomic_write_json(paths.conversation_path(project_id, conversation_id), conversation)
    return conversation


def delete_conversation(project_id: str, conversation_id: str) -> bool:
    with paths.lock():
        return paths.delete_file(paths.conversation_path(project_id, conversation_id))


def remove_material_from_all_conversations(project_id: str, material_id: str) -> None:
    """刪素材時呼叫：把該素材從所有對話的 selected_material_ids 移除。
    歷史 chat_log 裡的 material_id 參照刻意保留、不清除，前端顯示時要自行處理找不到的情況。
    """
    conv_dir = paths.conversations_dir(project_id)
    if not conv_dir.exists():
        return
    with paths.lock():
        for conv_path in conv_dir.glob("*.json"):
            conversation = paths.read_json(conv_path, Conversation)
            if not conversation or material_id not in conversation.selected_material_ids:
                continue
            conversation.selected_material_ids = [
                m for m in conversation.selected_material_ids if m != material_id
            ]
            paths.atomic_write_json(conv_path, conversation)
