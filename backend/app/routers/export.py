from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse

from app.services.markdown_export import to_markdown
from app.services.session_store import get_session

router = APIRouter(prefix="/api", tags=["export"])


@router.get("/sessions/{session_id}/export")
def export_markdown(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session 不存在或已過期")
    if not session.last_result or not session.last_result.test_cases:
        raise HTTPException(status_code=400, detail="尚無可匯出的測試用例")

    markdown = to_markdown(session.last_result.test_cases)
    return PlainTextResponse(
        content=markdown,
        media_type="text/markdown",
        headers={"Content-Disposition": "attachment; filename=testcases.md"},
    )
