from pathlib import Path

import pytest

from app.models.material import ParsedMaterial
from app.services import data_paths as paths
from app.services import project_store


@pytest.fixture(autouse=True)
def isolated_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """把 data_paths 的儲存根目錄導向暫存資料夾，避免測試寫到真正的 backend/data/。"""
    monkeypatch.setattr(paths, "DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(paths, "PROJECTS_DIR", tmp_path / "data" / "projects")


def test_create_and_get_project() -> None:
    project = project_store.create_project("我的專案")

    fetched = project_store.get_project(project.id)

    assert fetched is not None
    assert fetched.name == "我的專案"
    assert fetched.material_ids == []


def test_get_project_returns_none_when_missing() -> None:
    assert project_store.get_project("does-not-exist") is None


def test_list_projects_reports_material_and_conversation_counts() -> None:
    project = project_store.create_project("專案A")
    project_store.add_material(project.id, ParsedMaterial(filename="a.txt", kind="text", text="hi"))

    summaries = project_store.list_projects()

    assert len(summaries) == 1
    assert summaries[0].id == project.id
    assert summaries[0].material_count == 1
    assert summaries[0].conversation_count == 0


def test_update_project_changes_name_and_bumps_updated_at() -> None:
    project = project_store.create_project("舊名字")
    original_updated_at = project.updated_at

    updated = project_store.update_project(project.id, "新名字")

    assert updated is not None
    assert updated.name == "新名字"
    assert updated.updated_at >= original_updated_at


def test_update_project_returns_none_when_missing() -> None:
    assert project_store.update_project("does-not-exist", "x") is None


def test_delete_project_removes_directory_and_future_lookups_fail() -> None:
    project = project_store.create_project("要刪除的專案")

    assert project_store.delete_project(project.id) is True
    assert project_store.get_project(project.id) is None
    assert project_store.delete_project(project.id) is False


def test_add_material_appends_to_project_and_is_listable() -> None:
    project = project_store.create_project("專案")
    material = ParsedMaterial(filename="spec.pdf", kind="text", text="需求內容")

    added = project_store.add_material(project.id, material)

    assert added is not None
    materials = project_store.list_materials(project.id)
    assert [m.id for m in materials] == [material.id]

    refreshed_project = project_store.get_project(project.id)
    assert refreshed_project is not None
    assert material.id in refreshed_project.material_ids


def test_add_material_returns_none_when_project_missing() -> None:
    material = ParsedMaterial(filename="a.txt", kind="text", text="x")
    assert project_store.add_material("does-not-exist", material) is None


def test_update_material_only_changes_provided_fields() -> None:
    project = project_store.create_project("專案")
    material = project_store.add_material(
        project.id,
        ParsedMaterial(filename="orig.txt", kind="text", text="原始內容", description="原始說明"),
    )
    assert material is not None

    updated = project_store.update_material(project.id, material.id, text="新內容")

    assert updated is not None
    assert updated.text == "新內容"
    assert updated.filename == "orig.txt"
    assert updated.description == "原始說明"


def test_delete_material_removes_from_project_material_ids() -> None:
    project = project_store.create_project("專案")
    material = project_store.add_material(project.id, ParsedMaterial(filename="a.txt", kind="text", text="x"))
    assert material is not None

    assert project_store.delete_material(project.id, material.id) is True

    refreshed_project = project_store.get_project(project.id)
    assert refreshed_project is not None
    assert material.id not in refreshed_project.material_ids
    assert project_store.get_material(project.id, material.id) is None


def test_delete_material_returns_false_when_material_not_in_project() -> None:
    project = project_store.create_project("專案")
    assert project_store.delete_material(project.id, "does-not-exist") is False


def test_make_unique_filename_returns_original_when_no_conflict() -> None:
    project = project_store.create_project("專案")
    assert project_store.make_unique_filename(project.id, "a.txt") == "a.txt"


def test_make_unique_filename_appends_numeric_suffix_on_conflict() -> None:
    project = project_store.create_project("專案")
    project_store.add_material(project.id, ParsedMaterial(filename="a.txt", kind="text", text="x"))

    assert project_store.make_unique_filename(project.id, "a.txt") == "a (2).txt"


def test_make_unique_filename_skips_taken_suffixes_until_free() -> None:
    project = project_store.create_project("專案")
    project_store.add_material(project.id, ParsedMaterial(filename="a.txt", kind="text", text="x"))
    project_store.add_material(project.id, ParsedMaterial(filename="a (2).txt", kind="text", text="x"))

    assert project_store.make_unique_filename(project.id, "a.txt") == "a (3).txt"


def test_make_unique_filename_is_case_insensitive() -> None:
    project = project_store.create_project("專案")
    project_store.add_material(project.id, ParsedMaterial(filename="A.txt", kind="text", text="x"))

    assert project_store.make_unique_filename(project.id, "a.txt") == "a (2).txt"


def test_make_unique_filename_excludes_given_material_id() -> None:
    project = project_store.create_project("專案")
    material = project_store.add_material(
        project.id, ParsedMaterial(filename="a.txt", kind="text", text="x")
    )
    assert material is not None

    # 排除自己之後，跟自己同名不算衝突，改名時用來允許「改成跟原本一樣的名字」。
    assert (
        project_store.make_unique_filename(project.id, "a.txt", exclude_material_id=material.id)
        == "a.txt"
    )


def test_filename_exists_checks_case_insensitively_and_excludes_given_id() -> None:
    project = project_store.create_project("專案")
    material = project_store.add_material(
        project.id, ParsedMaterial(filename="a.txt", kind="text", text="x")
    )
    assert material is not None

    assert project_store.filename_exists(project.id, "A.TXT") is True
    assert (
        project_store.filename_exists(project.id, "A.TXT", exclude_material_id=material.id)
        is False
    )
    assert project_store.filename_exists(project.id, "b.txt") is False
