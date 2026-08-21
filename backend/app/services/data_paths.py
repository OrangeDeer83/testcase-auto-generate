import os
import uuid
from pathlib import Path
from threading import RLock
from typing import TypeVar

from pydantic import BaseModel

BACKEND_DIR = Path(__file__).resolve().parents[2]
# APP_DATA_DIR 可覆寫資料目錄位置，讓 E2E 測試能指到獨立的暫存目錄，
# 不會跟開發時手動啟動的 backend 寫進同一份 backend/data。
DATA_DIR = Path(os.environ.get("APP_DATA_DIR", str(BACKEND_DIR / "data")))
PROJECTS_DIR = DATA_DIR / "projects"

T = TypeVar("T", bound=BaseModel)

# RLock（可重入鎖）：project_store 刪素材時會在持有鎖的情況下呼叫
# conversation_store 清理懸空參照，兩邊都會嘗試取鎖，一般 Lock 會死鎖。
_lock = RLock()


def lock() -> RLock:
    return _lock


def project_dir(project_id: str) -> Path:
    return PROJECTS_DIR / project_id


def project_meta_path(project_id: str) -> Path:
    return project_dir(project_id) / "project.json"


def materials_dir(project_id: str) -> Path:
    return project_dir(project_id) / "materials"


def material_path(project_id: str, material_id: str) -> Path:
    return materials_dir(project_id) / f"{material_id}.json"


def conversations_dir(project_id: str) -> Path:
    return project_dir(project_id) / "conversations"


def conversation_path(project_id: str, conversation_id: str) -> Path:
    return conversations_dir(project_id) / f"{conversation_id}.json"


def atomic_write_json(path: Path, data: BaseModel) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(f"{path.name}.tmp-{uuid.uuid4().hex}")
    tmp_path.write_text(data.model_dump_json(indent=2), encoding="utf-8")
    os.replace(tmp_path, path)  # os.replace（不是 os.rename）：Windows 上目的檔存在時 rename 會丟 FileExistsError


def read_json(path: Path, model_cls: type[T]) -> T | None:
    if not path.exists():
        return None
    return model_cls.model_validate_json(path.read_text(encoding="utf-8"))


def delete_file(path: Path) -> bool:
    if not path.exists():
        return False
    path.unlink()
    return True
