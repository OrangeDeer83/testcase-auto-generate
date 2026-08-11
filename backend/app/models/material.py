from typing import Literal, Optional

from pydantic import BaseModel


class ParsedMaterial(BaseModel):
    filename: str
    kind: Literal["text", "image"]
    text: Optional[str] = None
    image_data_url: Optional[str] = None
