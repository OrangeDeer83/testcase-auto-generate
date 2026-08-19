import shutil
import time

from app.models.material import ParsedMaterial
from app.models.project import Project, ProjectSummary
from app.services import data_paths as paths


def create_project(name: str) -> Project:
    project = Project(name=name)
    with paths.lock():
        paths.atomic_write_json(paths.project_meta_path(project.id), project)
    return project


def get_project(project_id: str) -> Project | None:
    return paths.read_json(paths.project_meta_path(project_id), Project)


def _conversation_count(project_id: str) -> int:
    conv_dir = paths.conversations_dir(project_id)
    if not conv_dir.exists():
        return 0
    return sum(1 for _ in conv_dir.glob("*.json"))


def list_projects() -> list[ProjectSummary]:
    if not paths.PROJECTS_DIR.exists():
        return []
    summaries: list[ProjectSummary] = []
    for meta_path in paths.PROJECTS_DIR.glob("*/project.json"):
        project = paths.read_json(meta_path, Project)
        if not project:
            continue
        summaries.append(
            ProjectSummary(
                id=project.id,
                name=project.name,
                created_at=project.created_at,
                updated_at=project.updated_at,
                material_count=len(project.material_ids),
                conversation_count=_conversation_count(project.id),
            )
        )
    summaries.sort(key=lambda s: s.updated_at, reverse=True)
    return summaries


def update_project(project_id: str, name: str) -> Project | None:
    with paths.lock():
        project = get_project(project_id)
        if not project:
            return None
        project.name = name
        project.updated_at = time.time()
        paths.atomic_write_json(paths.project_meta_path(project_id), project)
    return project


def delete_project(project_id: str) -> bool:
    with paths.lock():
        project_dir = paths.project_dir(project_id)
        if not project_dir.exists():
            return False
        shutil.rmtree(project_dir)
    return True


def _touch_project(project_id: str) -> None:
    project = get_project(project_id)
    if project:
        project.updated_at = time.time()
        paths.atomic_write_json(paths.project_meta_path(project_id), project)


def list_materials(project_id: str) -> list[ParsedMaterial]:
    project = get_project(project_id)
    if not project:
        return []
    materials: list[ParsedMaterial] = []
    for material_id in project.material_ids:
        material = paths.read_json(paths.material_path(project_id, material_id), ParsedMaterial)
        if material:
            materials.append(material)
    return materials


def get_material(project_id: str, material_id: str) -> ParsedMaterial | None:
    return paths.read_json(paths.material_path(project_id, material_id), ParsedMaterial)


def _split_filename(filename: str) -> tuple[str, str]:
    idx = filename.rfind(".")
    if idx <= 0 or idx == len(filename) - 1:
        return filename, ""
    return filename[:idx], filename[idx:]


def _existing_filenames(project_id: str, exclude_material_id: str | None = None) -> set[str]:
    return {
        m.filename.lower() for m in list_materials(project_id) if m.id != exclude_material_id
    }


def filename_exists(
    project_id: str, filename: str, exclude_material_id: str | None = None
) -> bool:
    return filename.lower() in _existing_filenames(project_id, exclude_material_id)


def make_unique_filename(
    project_id: str, filename: str, exclude_material_id: str | None = None
) -> str:
    """素材名稱不能重複：自動加上 (2)、(3)... 直到不衝突為止，用於新增素材時避免打斷操作。"""
    existing = _existing_filenames(project_id, exclude_material_id)
    if filename.lower() not in existing:
        return filename
    base, ext = _split_filename(filename)
    n = 2
    while True:
        candidate = f"{base} ({n}){ext}"
        if candidate.lower() not in existing:
            return candidate
        n += 1


def add_material(project_id: str, material: ParsedMaterial) -> ParsedMaterial | None:
    with paths.lock():
        project = get_project(project_id)
        if not project:
            return None
        paths.atomic_write_json(paths.material_path(project_id, material.id), material)
        project.material_ids.append(material.id)
        project.updated_at = time.time()
        paths.atomic_write_json(paths.project_meta_path(project_id), project)
    return material


def update_material(
    project_id: str,
    material_id: str,
    filename: str | None = None,
    description: str | None = None,
    text: str | None = None,
) -> ParsedMaterial | None:
    with paths.lock():
        material = get_material(project_id, material_id)
        if not material:
            return None
        if filename is not None:
            material.filename = filename
        if description is not None:
            material.description = description
        if text is not None:
            material.text = text
        paths.atomic_write_json(paths.material_path(project_id, material_id), material)
        _touch_project(project_id)
    return material


def delete_material(project_id: str, material_id: str) -> bool:
    from app.services import conversation_store  # 延遲匯入，避免循環匯入

    with paths.lock():
        project = get_project(project_id)
        if not project or material_id not in project.material_ids:
            return False
        paths.delete_file(paths.material_path(project_id, material_id))
        project.material_ids = [m for m in project.material_ids if m != material_id]
        project.updated_at = time.time()
        paths.atomic_write_json(paths.project_meta_path(project_id), project)
        conversation_store.remove_material_from_all_conversations(project_id, material_id)
    return True
