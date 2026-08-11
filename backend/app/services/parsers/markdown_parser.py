def extract_markdown_text(content: bytes) -> str:
    return content.decode("utf-8", errors="replace")
