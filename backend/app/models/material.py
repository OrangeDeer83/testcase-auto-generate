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
    # 跟這筆素材綁在一起、一併送給模型的額外圖片。兩種來源：(1) PDF 內嵌的圖片
    # （文字素材才會有，parsers/__init__.py 解析 PDF 時填入）；(2) 使用者上傳時勾選
    # 「合併成一組」的圖片（圖片素材才會有，routers/projects.py 的 group 分支填入，
    # 例如同一畫面「開關前／開關後」的對照截圖）。不管哪種來源，選取這筆素材時，這裡的
    # 圖片都會依陣列順序跟主要內容一起送給模型，不用在素材庫裡拆成好幾筆分別勾選。
    embedded_images: list[str] = Field(default_factory=list)
    description: str = ""
    created_at: float = Field(default_factory=time.time)
