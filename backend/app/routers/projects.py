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


@router.patch("/{project_id}/materials/{material_id}", response_model=ParsedMaterial)
def update_material(project_id: str, material_id: str, payload: MaterialUpdatePayload):
    _get_project_or_404(project_id)

    filename = None
    if payload.filename is not None:
        filename = payload.filename.strip()
        if not filename:
            raise HTTPException(status_code=400, detail="檔名不可為空")

    description = payload.description.strip() if payload.description is not None else None

    material = project_store.update_material(
        project_id, material_id, filename=filename, description=description
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
