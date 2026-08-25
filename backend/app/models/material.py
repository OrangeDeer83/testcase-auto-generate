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
    # （文字素材才會有，parsers/__init__.py 解析 PDF 時填入）；(2) 使用者在素材庫裡
    # 事後選取多筆既有的圖片素材、按下「合併成一組」（圖片素材才會有，project_store.py
    # 的 merge_materials 填入，例如同一畫面「開關前／開關後」的對照截圖，不限於上傳
    # 當下就要選好——先各自貼上截圖、之後再回頭合併也可以）。不管哪種來源，選取這筆
    # 素材時，這裡的圖片都會依陣列順序跟主要內容一起送給模型，不用在素材庫裡拆成好幾筆
    # 分別勾選。
    embedded_images: list[str] = Field(default_factory=list)
    description: str = ""
    created_at: float = Field(default_factory=time.time)
