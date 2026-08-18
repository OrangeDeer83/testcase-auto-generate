import time
import uuid

from pydantic import BaseModel, Field


class Project(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    material_ids: list[str] = Field(default_factory=list)
    created_at: float = Field(default_factory=time.time)
    updated_at: float = Field(default_factory=time.time)
    schema_version: int = 1


class ProjectSummary(BaseModel):
    id: str
    name: str
    created_at: float
    updated_at: float
    material_count: int
    conversation_count: int
