import time
import uuid

from pydantic import BaseModel, Field

from app.models.material import ParsedMaterial
from app.models.test_case import GenerationResult, QAAnswer


class Session(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    materials: list[ParsedMaterial] = Field(default_factory=list)
    qa_history: list[QAAnswer] = Field(default_factory=list)
    last_result: GenerationResult | None = None
    created_at: float = Field(default_factory=time.time)
    last_active_at: float = Field(default_factory=time.time)
