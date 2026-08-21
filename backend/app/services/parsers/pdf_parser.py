import io

import pdfplumber
import pymupdf

# 小於這個尺寸（單邊像素）的內嵌圖片通常是圖示、項目符號、分隔線這類裝飾性小圖，
# 不是有意義的截圖，抽取出來只會製造雜訊，所以濾掉。
MIN_EMBEDDED_IMAGE_SIZE = 80


def extract_pdf_text(content: bytes) -> str:
    text_parts: list[str] = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    return "\n\n".join(text_parts)


def extract_pdf_images(content: bytes) -> list[tuple[bytes, str]]:
    """抽取 PDF 內嵌的圖片，回傳 (原始 bytes, 副檔名) 的清單。
    同一張圖出現在多頁（例如每頁都有的頁首 Logo）只算一次。
    """
    images: list[tuple[bytes, str]] = []
    seen_xrefs: set[int] = set()
    with pymupdf.open(stream=content, filetype="pdf") as doc:
        for page in doc:
            page_images = page.get_images(full=True)
            # 有些圖片本身只是另一張圖的透明遮罩（soft mask），不是獨立的畫面內容，
            # 不濾掉的話一張截圖會被拆成「底色」+「遮罩」兩張重複的圖片。
            mask_xrefs = {img[1] for img in page_images if img[1]}
            for img in page_images:
                xref = img[0]
                if xref in seen_xrefs or xref in mask_xrefs:
                    continue
                seen_xrefs.add(xref)
                extracted = doc.extract_image(xref)
                if (
                    extracted["width"] < MIN_EMBEDDED_IMAGE_SIZE
                    or extracted["height"] < MIN_EMBEDDED_IMAGE_SIZE
                ):
                    continue
                images.append((extracted["image"], extracted["ext"]))
    return images
