import mimetypes
from pathlib import Path

from app.models.material import ParsedMaterial
from app.services.parsers.docx_parser import extract_docx_text
from app.services.parsers.image_parser import to_image_data_url
from app.services.parsers.markdown_parser import extract_markdown_text
from app.services.parsers.pdf_parser import extract_pdf_text

SUPPORTED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg"}


class UnsupportedFileTypeError(ValueError):
    pass


def parse_upload(filename: str, content: bytes) -> ParsedMaterial:
    ext = Path(filename).suffix.lower()

    if ext == ".pdf":
        return ParsedMaterial(filename=filename, kind="text", text=extract_pdf_text(content))
    if ext == ".docx":
        return ParsedMaterial(filename=filename, kind="text", text=extract_docx_text(content))
    if ext in (".md", ".markdown", ".txt"):
        return ParsedMaterial(filename=filename, kind="text", text=extract_markdown_text(content))
    if ext in SUPPORTED_IMAGE_EXTENSIONS:
        mime_type = mimetypes.guess_type(filename)[0] or "image/png"
        return ParsedMaterial(
            filename=filename, kind="image", image_data_url=to_image_data_url(content, mime_type)
        )

    raise UnsupportedFileTypeError(f"不支援的檔案格式：{ext or filename}")
