from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.models.material import ParsedMaterial
from app.models.project import Project, ProjectSummary
from app.services import project_store
from app.services.parsers import UnsupportedFileTypeError, parse_upload

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _get_project_or_404(project_id: str) -> Project:
    project = project_store.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="專案不存在或已被刪除")
    return project


class ProjectCreatePayload(BaseModel):
    name: str


@router.post("", response_model=Project)
def create_project(payload: ProjectCreatePayload):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="專案名稱不可為空")
    return project_store.create_project(name)


@router.get("", response_model=list[ProjectSummary])
def list_projects():
    return project_store.list_projects()


@router.get("/{project_id}", response_model=Project)
def get_project(project_id: str):
    return _get_project_or_404(project_id)


class ProjectUpdatePayload(BaseModel):
    name: str


@router.patch("/{project_id}", response_model=Project)
def update_project(project_id: str, payload: ProjectUpdatePayload):
    _get_project_or_404(project_id)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="專案名稱不可為空")
    return project_store.update_project(project_id, name)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str):
    _get_project_or_404(project_id)
    project_store.delete_project(project_id)


@router.get("/{project_id}/materials", response_model=list[ParsedMaterial])
def list_materials(project_id: str):
    _get_project_or_404(project_id)
    return project_store.list_materials(project_id)


@router.post("/{project_id}/materials")
async def upload_materials(project_id: str, files: list[UploadFile] = File(...)):
    project = _get_project_or_404(project_id)

    uploaded = []
    for file in files:
        content = await file.read()
        try:
            material = parse_upload(file.filename or "unnamed", content)
        except UnsupportedFileTypeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        material.filename = project_store.make_unique_filename(project_id, material.filename)
        project_store.add_material(project_id, material)
        uploaded.append({"id": material.id, "filename": material.filename, "kind": material.kind})

    project = project_store.get_project(project_id)
    return {"uploaded": uploaded, "total_materials": len(project.material_ids)}


class TextMaterialPayload(BaseModel):
    label: str = "文字輸入"
    content: str


@router.post("/{project_id}/materials/text")
def add_text_material(project_id: str, payload: TextMaterialPayload):
    _get_project_or_404(project_id)

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="文字內容不可為空")

    label = payload.label.strip() or "文字輸入"
    label = project_store.make_unique_filename(project_id, label)
    material = ParsedMaterial(filename=label, kind="text", text=content)
    project_store.add_material(project_id, material)

    project = project_store.get_project(project_id)
    return {
        "uploaded": [{"id": material.id, "filename": material.filename, "kind": material.kind}],
        "total_materials": len(project.material_ids),
    }


class MaterialUpdatePayload(BaseModel):
    filename: str | None = None
    description: str | None = None
    text: str | None = None


@router.patch("/{project_id}/materials/{material_id}", response_model=ParsedMaterial)
def update_material(project_id: str, material_id: str, payload: MaterialUpdatePayload):
    _get_project_or_404(project_id)

    filename = None
    if payload.filename is not None:
        filename = payload.filename.strip()
        if not filename:
            raise HTTPException(status_code=400, detail="檔名不可為空")
        if project_store.filename_exists(project_id, filename, exclude_material_id=material_id):
            raise HTTPException(status_code=400, detail=f"已經有素材叫做「{filename}」，請換一個名稱")

    description = payload.description.strip() if payload.description is not None else None

    text = None
    if payload.text is not None:
        existing = project_store.get_material(project_id, material_id)
        if existing and existing.kind != "text":
            raise HTTPException(status_code=400, detail="只有純文字素材可以直接修改內容")
        text = payload.text

    material = project_store.update_material(
        project_id, material_id, filename=filename, description=description, text=text
    )
    if not material:
        raise HTTPException(status_code=404, detail="找不到這個素材")
    return material


@router.delete("/{project_id}/materials/{material_id}")
def delete_material(project_id: str, material_id: str):
    _get_project_or_404(project_id)
    if not project_store.delete_material(project_id, material_id):
        raise HTTPException(status_code=404, detail="找不到這個素材")
    project = project_store.get_project(project_id)
    return {"total_materials": len(project.material_ids)}


class MergeMaterialsPayload(BaseModel):
    material_ids: list[str]


@router.post("/{project_id}/materials/merge", response_model=ParsedMaterial)
def merge_materials(project_id: str, payload: MergeMaterialsPayload):
    """把使用者事後在素材庫裡選取的多筆既有素材合併成一筆——用在「同一畫面開關前／
    開關後」這種需要讓模型知道彼此相關的對照截圖，也可以是一份需求文件／PDF 搭配
    幾張相關截圖。不限於上傳當下就一次選好幾個檔案，也支援先各自貼上／上傳，之後
    再回頭選取合併的用法。選取順序決定合併結果：第一筆選的當主體（可以是文字／PDF
    素材，也可以是圖片素材），之後選的每一筆都必須是圖片素材。"""
    _get_project_or_404(project_id)
    if len(payload.material_ids) < 2:
        raise HTTPException(status_code=400, detail="合併成一組至少要選 2 筆素材")
    merged = project_store.merge_materials(project_id, payload.material_ids)
    if not merged:
        raise HTTPException(
            status_code=400,
            detail="合併失敗，請確認選取的素材都存在，且第一筆以外都是圖片素材",
        )
    return merged


class UngroupImagePayload(BaseModel):
    index: int


@router.post("/{project_id}/materials/{material_id}/ungroup")
def ungroup_image(project_id: str, material_id: str, payload: UngroupImagePayload):
    """把某筆素材 embedded_images 裡的第 index 張圖片拆出來，變成一筆獨立的新素材，
    原本那筆素材則移除這張圖片——用來取消合併裡的其中一張，不用整組拆散重來。"""
    _get_project_or_404(project_id)
    result = project_store.ungroup_image(project_id, material_id, payload.index)
    if not result:
        raise HTTPException(status_code=400, detail="拆出失敗，請確認素材與圖片索引存在")
    updated, extracted = result
    return {"updated": updated, "extracted": extracted}
