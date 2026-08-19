import time
import uuid
from typing import Literal, Optional

from pydantic import BaseModel, Field


class ParsedMaterial(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str
    kind: Literal["text", "image"]
    text: Optional[str] = None
    image_data_url: Optional[str] = None
    description: str = ""
    created_at: float = Field(default_factory=time.time)
