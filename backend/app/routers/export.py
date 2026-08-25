from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.services import conversation_store, project_store
from app.services.excel_export import to_excel

router = APIRouter(prefix="/api/projects/{project_id}/conversations/{conversation_id}", tags=["export"])


@router.get("/export/excel")
def export_excel(project_id: str, conversation_id: str):
    if not project_store.get_project(project_id):
        raise HTTPException(status_code=404, detail="專案不存在或已被刪除")

    conversation = conversation_store.get_conversation(project_id, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="對話不存在或已被刪除")
    if not conversation.last_result or not conversation.last_result.test_cases:
        raise HTTPException(status_code=400, detail="尚無可匯出的測試用例")

    unlocked = [tc for tc in conversation.last_result.test_cases if not tc.locked]
    if unlocked:
        raise HTTPException(
            status_code=400,
            detail=f"尚有 {len(unlocked)} 筆測試用例尚未鎖定審核，第一筆是「{unlocked[0].name}」",
        )

    content = to_excel(conversation.last_result.test_cases)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=testcases.xlsx"},
    )
