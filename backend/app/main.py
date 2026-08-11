from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import export, generate, upload

app = FastAPI(title="Testcase Auto Generate API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(generate.router)
app.include_router(export.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
