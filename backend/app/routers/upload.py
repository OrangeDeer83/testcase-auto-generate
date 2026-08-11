from fastapi import APIRouter, File, HTTPException, UploadFile

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
        uploaded.append({"filename": material.filename, "kind": material.kind})

    return {"uploaded": uploaded, "total_materials": len(session.materials)}
