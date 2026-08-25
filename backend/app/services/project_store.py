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


def merge_materials(project_id: str, material_ids: list[str]) -> ParsedMaterial | None:
    """把 material_ids 依序合併成一筆：第一筆當主體（filename/description/text／
    image_data_url 都維持第一筆的，可以是文字／PDF 素材，也可以是圖片素材），其餘
    依序放進主體的 embedded_images，其餘素材本身接著被刪除（沿用 delete_material，
    連帶清掉各對話裡對它們的勾選狀態）。只有「其餘」這幾筆必須是圖片素材——文字內容
    沒辦法變成 embedded_images 裡的一張圖，所以只有第一筆（主體）可以是文字／PDF，
    第二筆以後一律要是圖片。任何一筆不存在、或第二筆以後出現非圖片素材，整個合併都
    不執行，回傳 None。"""
    with paths.lock():
        project = get_project(project_id)
        if not project:
            return None
        materials = [get_material(project_id, mid) for mid in material_ids]
        if any(m is None for m in materials):
            return None

        primary, *rest = materials
        if any(m.kind != "image" for m in rest):
            return None
        merged_images = list(primary.embedded_images)
        for m in rest:
            if m.image_data_url:
                merged_images.append(m.image_data_url)
            merged_images.extend(m.embedded_images)
        primary.embedded_images = merged_images
        paths.atomic_write_json(paths.material_path(project_id, primary.id), primary)
        _touch_project(project_id)

    for m in rest:
        delete_material(project_id, m.id)

    return primary


def ungroup_image(
    project_id: str, material_id: str, index: int
) -> tuple[ParsedMaterial, ParsedMaterial] | None:
    """把 material_id 這筆素材 embedded_images 陣列裡第 index 張圖片拆出來，變成一筆
    獨立的新素材（回到跟合併之前一樣、各自獨立的狀態），原本那筆素材則移除這張圖片。
    index 超出範圍或素材不存在都回傳 None、不做任何變動。回傳 (更新後的原素材, 新拆出
    的素材)。"""
    with paths.lock():
        project = get_project(project_id)
        if not project:
            return None
        material = get_material(project_id, material_id)
        if not material:
            return None
        if index < 0 or index >= len(material.embedded_images):
            return None

        image_url = material.embedded_images[index]
        material.embedded_images = [
            url for i, url in enumerate(material.embedded_images) if i != index
        ]
        paths.atomic_write_json(paths.material_path(project_id, material.id), material)

        new_material = ParsedMaterial(
            filename=make_unique_filename(project_id, f"{material.filename}（拆出的圖片）"),
            kind="image",
            image_data_url=image_url,
        )
        paths.atomic_write_json(paths.material_path(project_id, new_material.id), new_material)
        project.material_ids.append(new_material.id)
        project.updated_at = time.time()
        paths.atomic_write_json(paths.project_meta_path(project_id), project)

    return material, new_material


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
