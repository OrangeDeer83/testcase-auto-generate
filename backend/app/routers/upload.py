from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.models.material import ParsedMaterial
from app.services.parsers import UnsupportedFileTypeError, parse_upload
from app.services.session_store import create_session, get_session

router = APIRouter(prefix="/api", tags=["upload"])


@router.post("/sessions")
def create_new_session():
    session = create_session()
    return {"session_id": session.id}


@router.post("/sessions/{session_id}/materials")
async def upload_materials(session_id: str, files: list[UploadFile] = File(...)):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session 不存在或已過期")

    uploaded = []
    for file in files:
        content = await file.read()
        try:
            material = parse_upload(file.filename or "unnamed", content)
        except UnsupportedFileTypeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        session.materials.append(material)
        uploaded.append({"id": material.id, "filename": material.filename, "kind": material.kind})

    return {"uploaded": uploaded, "total_materials": len(session.materials)}


class TextMaterialPayload(BaseModel):
    label: str = "文字輸入"
    content: str


@router.post("/sessions/{session_id}/materials/text")
def add_text_material(session_id: str, payload: TextMaterialPayload):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session 不存在或已過期")

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="文字內容不可為空")

    label = payload.label.strip() or "文字輸入"
    material = ParsedMaterial(filename=label, kind="text", text=content)
    session.materials.append(material)

    return {
        "uploaded": [{"id": material.id, "filename": material.filename, "kind": material.kind}],
        "total_materials": len(session.materials),
    }


@router.delete("/sessions/{session_id}/materials/{material_id}")
def delete_material(session_id: str, material_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session 不存在或已過期")

    before = len(session.materials)
    session.materials = [m for m in session.materials if m.id != material_id]
    if len(session.materials) == before:
        raise HTTPException(status_code=404, detail="找不到這個素材")

    return {"total_materials": len(session.materials)}
