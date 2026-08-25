from app.models.material import ParsedMaterial
from app.services.prompt_builder import build_material_content


def test_single_image_material_has_no_group_hint() -> None:
    material = ParsedMaterial(filename="a.png", kind="image", image_data_url="data:image/png;base64,AAA")

    content = build_material_content([material])

    assert content == [
        {"type": "text", "text": "【圖片：a.png】"},
        {"type": "image_url", "image_url": {"url": "data:image/png;base64,AAA"}},
    ]


def test_grouped_image_material_sends_all_images_with_hint() -> None:
    material = ParsedMaterial(
        filename="開關前.png",
        kind="image",
        image_data_url="data:image/png;base64,BEFORE",
        embedded_images=["data:image/png;base64,AFTER"],
    )

    content = build_material_content([material])

    assert content[0] == {"type": "text", "text": "【圖片：開關前.png】"}
    assert content[1] == {"type": "image_url", "image_url": {"url": "data:image/png;base64,BEFORE"}}
    # 主圖跟提示文字之間要有一段說明這是同一組、依序對照，不能讓模型以為是兩張無關的圖。
    assert content[2]["type"] == "text"
    assert "同屬一組" in content[2]["text"]
    assert content[3] == {"type": "image_url", "image_url": {"url": "data:image/png;base64,AFTER"}}


def test_text_material_without_embedded_images_has_no_group_hint() -> None:
    material = ParsedMaterial(filename="spec.pdf", kind="text", text="需求內容")

    content = build_material_content([material])

    assert content == [{"type": "text", "text": "【檔案：spec.pdf】\n需求內容"}]


def test_text_material_embedded_images_sent_with_group_hint() -> None:
    """文字／PDF 素材合併了圖片素材進來（或 PDF 本身內嵌截圖）時，也要有分組提示——
    不能只有圖片素材當主體時才提醒模型這些圖片彼此相關。"""
    material = ParsedMaterial(
        filename="spec.pdf",
        kind="text",
        text="需求內容",
        embedded_images=["data:image/png;base64,SHOT1", "data:image/png;base64,SHOT2"],
    )

    content = build_material_content([material])

    assert content[0] == {"type": "text", "text": "【檔案：spec.pdf】\n需求內容"}
    assert content[1]["type"] == "text"
    assert "同一組" in content[1]["text"]
    assert content[2] == {"type": "image_url", "image_url": {"url": "data:image/png;base64,SHOT1"}}
    assert content[3] == {"type": "image_url", "image_url": {"url": "data:image/png;base64,SHOT2"}}
