"""驗證「依功能拆分、平行產生用例」這組新端點的行為：/feature-breakdown 會把模型
回傳的檔名反查成 material_id 並持久化；/generate-scoped 只回傳單一功能的生成結果、
刻意不寫入 conversation.last_result（合併與提交交給前端在全部功能都完成後透過既有
的 PUT /test-cases 一次做完，見 conversations.py 的說明）。"""

import asyncio
import json
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.models.material import ParsedMaterial
from app.models.test_case import FeatureBreakdownItem, TestCase, TestStep
from app.routers import conversations
from app.services import conversation_store, project_store
from app.services import data_paths as paths


@pytest.fixture(autouse=True)
def isolated_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(paths, "DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(paths, "PROJECTS_DIR", tmp_path / "data" / "projects")


def _setup_conversation():
    project = project_store.create_project("測試專案")
    login = project_store.add_material(
        project.id, ParsedMaterial(filename="登入.png", kind="image", image_data_url="data:image/png;base64,A")
    )
    home = project_store.add_material(
        project.id, ParsedMaterial(filename="首頁.png", kind="image", image_data_url="data:image/png;base64,B")
    )
    conversation = conversation_store.create_conversation(
        project.id, "對話", [login.id, home.id]
    )
    return project, conversation, login, home


async def _drain(response) -> list[str]:
    events: list[str] = []
    async for chunk in response.body_iterator:
        events.append(chunk if isinstance(chunk, str) else chunk.decode())
    return events


def test_generate_feature_breakdown_persists_resolved_material_ids(monkeypatch) -> None:
    project, conversation, login, home = _setup_conversation()

    def fake_stream(messages):
        yield json.dumps(
            {
                "features": [
                    {"name": "登入", "description": "登入流程", "material_filenames": ["登入.png"]},
                    {"name": "首頁", "description": "登入後首頁", "material_filenames": ["首頁.png"]},
                ]
            }
        )

    monkeypatch.setattr(conversations, "stream_chat_completion", fake_stream)

    response = conversations.generate_feature_breakdown(project.id, conversation.id)
    events = asyncio.run(_drain(response))

    assert any(e.startswith("event: result") for e in events)

    persisted = conversation_store.get_conversation(project.id, conversation.id)
    assert persisted.feature_breakdown is not None
    assert [f.name for f in persisted.feature_breakdown] == ["登入", "首頁"]
    assert persisted.feature_breakdown[0].material_ids == [login.id]
    assert persisted.feature_breakdown[1].material_ids == [home.id]


def test_generate_feature_breakdown_requires_selected_materials() -> None:
    project = project_store.create_project("空專案")
    conversation = conversation_store.create_conversation(project.id, "對話", [])

    with pytest.raises(HTTPException) as exc_info:
        conversations.generate_feature_breakdown(project.id, conversation.id)

    assert exc_info.value.status_code == 400


def test_update_feature_breakdown_overwrites_persisted_list() -> None:
    project, conversation, login, home = _setup_conversation()

    payload = conversations.FeatureBreakdownUpdatePayload(
        features=[
            FeatureBreakdownItem(name="登入（改名後）", description="", material_ids=[login.id, home.id]),
        ]
    )
    result = conversations.update_feature_breakdown(project.id, conversation.id, payload)

    assert [f.name for f in result.features] == ["登入（改名後）"]

    persisted = conversation_store.get_conversation(project.id, conversation.id)
    assert persisted.feature_breakdown is not None
    assert persisted.feature_breakdown[0].name == "登入（改名後）"
    assert persisted.feature_breakdown[0].material_ids == [login.id, home.id]


def test_generate_scoped_returns_result_without_persisting_last_result(monkeypatch) -> None:
    project, conversation, login, home = _setup_conversation()
    feature = FeatureBreakdownItem(name="登入", description="登入流程", material_ids=[login.id])
    conversation.feature_breakdown = [feature]
    conversation_store.save_conversation(project.id, conversation)

    case = TestCase(
        name="登入成功",
        steps=[TestStep(step_no=1, description="輸入帳密", expected_result="登入成功")],
        priority="P1",
    )

    def fake_stream(messages):
        yield json.dumps(
            {"test_cases": [case.model_dump()], "clarification_questions": []}
        )

    monkeypatch.setattr(conversations, "stream_chat_completion", fake_stream)

    payload = conversations.GenerateScopedPayload(feature_id=feature.id)
    response = conversations.generate_scoped(project.id, conversation.id, payload)
    events = asyncio.run(_drain(response))

    result_events = [e for e in events if e.startswith("event: result")]
    assert len(result_events) == 1
    assert "登入成功" in result_events[0]

    # 這支端點不應該動到 conversation.last_result——合併與提交是前端在全部功能
    # 都完成後，透過既有的 PUT /test-cases 一次做完。
    persisted = conversation_store.get_conversation(project.id, conversation.id)
    assert persisted.last_result is None


def test_generate_scoped_404_for_unknown_feature_id() -> None:
    project, conversation, login, home = _setup_conversation()
    conversation.feature_breakdown = [
        FeatureBreakdownItem(name="登入", description="", material_ids=[login.id])
    ]
    conversation_store.save_conversation(project.id, conversation)

    payload = conversations.GenerateScopedPayload(feature_id="不存在的-id")

    with pytest.raises(HTTPException) as exc_info:
        conversations.generate_scoped(project.id, conversation.id, payload)

    assert exc_info.value.status_code == 404
