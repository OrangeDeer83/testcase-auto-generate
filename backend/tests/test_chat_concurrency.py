"""驗證 POST /chat 在等待模型回覆期間，如果測試用例被其他請求（例如另一個分頁的
PUT /test-cases）改過，不會用等待前的舊快照悄悄蓋掉那筆改動——見 conversations.py
的 chat() 內、呼叫 _stream_llm_events 之後重新讀取 conversation 再比對版本那段。"""

import asyncio
import json
from pathlib import Path

import pytest

from app.models.material import ParsedMaterial
from app.models.test_case import GenerationResult, TestCase, TestStep
from app.routers import conversations
from app.services import conversation_store, project_store
from app.services import data_paths as paths


@pytest.fixture(autouse=True)
def isolated_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(paths, "DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(paths, "PROJECTS_DIR", tmp_path / "data" / "projects")


def _setup_conversation():
    project = project_store.create_project("測試專案")
    material = project_store.add_material(
        project.id, ParsedMaterial(filename="a.txt", kind="text", text="需求內容")
    )
    conversation = conversation_store.create_conversation(project.id, "對話", [material.id])
    case = TestCase(
        name="案例A",
        steps=[TestStep(step_no=1, description="d", expected_result="e")],
        priority="P2",
    )
    conversation.last_result = GenerationResult(test_cases=[case], result_version=1)
    conversation_store.save_conversation(project.id, conversation)
    return project, conversation, case


async def _drain(response) -> list[str]:
    events: list[str] = []
    async for chunk in response.body_iterator:
        events.append(chunk if isinstance(chunk, str) else chunk.decode())
    return events


def _fake_llm_response(cases: list[TestCase]) -> str:
    return json.dumps(
        {
            "test_cases": [c.model_dump() for c in cases],
            "clarification_questions": [],
        }
    )


def test_chat_discards_result_when_test_cases_changed_during_wait(monkeypatch) -> None:
    project, conversation, case = _setup_conversation()

    def fake_stream(messages):
        # 模擬另一個分頁在模型思考的這段時間，搶先用 PUT /test-cases 存檔成功。
        concurrent_case = case.model_copy(update={"name": "案例A（手動改過）"})
        conversations.update_test_cases(
            project.id,
            conversation.id,
            GenerationResult(test_cases=[concurrent_case], result_version=1),
        )
        yield _fake_llm_response([case.model_copy(update={"priority": "P1"})])

    monkeypatch.setattr(conversations, "stream_chat_completion", fake_stream)

    payload = conversations.ChatPayload(message="把優先級改成 P1", current_test_cases=[case])
    response = conversations.chat(project.id, conversation.id, payload)
    events = asyncio.run(_drain(response))

    assert any('event: error' in e and '已經被修改' in e for e in events)
    assert not any(e.startswith('event: result') for e in events)

    persisted = conversation_store.get_conversation(project.id, conversation.id)
    assert persisted.last_result.result_version == 2
    assert persisted.last_result.test_cases[0].name == "案例A（手動改過）"
    assert persisted.last_result.pending_changes == []


def test_chat_commits_normally_when_nothing_changed_during_wait(monkeypatch) -> None:
    project, conversation, case = _setup_conversation()

    def fake_stream(messages):
        yield _fake_llm_response([case.model_copy(update={"priority": "P1"})])

    monkeypatch.setattr(conversations, "stream_chat_completion", fake_stream)

    payload = conversations.ChatPayload(message="把優先級改成 P1", current_test_cases=[case])
    response = conversations.chat(project.id, conversation.id, payload)
    events = asyncio.run(_drain(response))

    assert any(e.startswith('event: result') for e in events)

    persisted = conversation_store.get_conversation(project.id, conversation.id)
    assert persisted.last_result.result_version == 1
    assert persisted.last_result.test_cases[0].name == "案例A"
    assert len(persisted.last_result.pending_changes) == 1
    assert persisted.last_result.pending_changes[0].action == "update"
