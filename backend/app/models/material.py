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
    # PDF 內嵌的圖片（例如截圖）——文字素材才會有值，選取這筆素材時文字跟這些
    # 圖片會一起送給模型，不用在素材庫裡拆成好幾筆分別勾選。
    embedded_images: list[str] = Field(default_factory=list)
    description: str = ""
    created_at: float = Field(default_factory=time.time)
