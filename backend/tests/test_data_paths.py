from pathlib import Path

from pydantic import BaseModel

from app.services import data_paths as paths


class _Dummy(BaseModel):
    value: str


def test_atomic_write_json_then_read_json_roundtrip(tmp_path: Path) -> None:
    target = tmp_path / "sub" / "dummy.json"
    paths.atomic_write_json(target, _Dummy(value="hello"))

    loaded = paths.read_json(target, _Dummy)

    assert loaded is not None
    assert loaded.value == "hello"


def test_atomic_write_json_overwrites_existing_file(tmp_path: Path) -> None:
    # Windows 上 os.rename 遇到同名目的檔會丟 FileExistsError，data_paths 改用
    # os.replace 處理過，這裡驗證第二次寫入真的能覆蓋成功而不是炸掉。
    target = tmp_path / "dummy.json"
    paths.atomic_write_json(target, _Dummy(value="first"))
    paths.atomic_write_json(target, _Dummy(value="second"))

    loaded = paths.read_json(target, _Dummy)

    assert loaded is not None
    assert loaded.value == "second"
    assert list(target.parent.glob("*.tmp-*")) == []


def test_read_json_returns_none_when_file_missing(tmp_path: Path) -> None:
    assert paths.read_json(tmp_path / "missing.json", _Dummy) is None


def test_delete_file_returns_true_when_removed_and_false_when_missing(tmp_path: Path) -> None:
    target = tmp_path / "dummy.json"
    paths.atomic_write_json(target, _Dummy(value="x"))

    assert paths.delete_file(target) is True
    assert not target.exists()
    assert paths.delete_file(target) is False


def test_path_builders_are_consistent() -> None:
    project_id = "proj-1"
    material_id = "mat-1"
    conversation_id = "conv-1"

    assert paths.project_meta_path(project_id) == paths.project_dir(project_id) / "project.json"
    assert (
        paths.material_path(project_id, material_id)
        == paths.materials_dir(project_id) / f"{material_id}.json"
    )
    assert (
        paths.conversation_path(project_id, conversation_id)
        == paths.conversations_dir(project_id) / f"{conversation_id}.json"
    )
