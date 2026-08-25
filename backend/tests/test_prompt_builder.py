from app.models.material import ParsedMaterial
from app.services.prompt_builder import build_material_content


def test_single_image_material_has_no_group_hint() -> None:
    material = ParsedMaterial(filename="a.png", kind="image", image_data_url="data:image/png;base64,AAA")

    content = build_material_content([material])

    assert content == [
        {"type": "text", "text": "【圖片：a.png】"},
        {"type": "image_url", "image_url": {"url": "data:image/png;base64,AAA"}},
    ]


def test_grouped_image_material_numbers_every_image_starting_from_primary() -> None:
    material = ParsedMaterial(
        filename="開關前.png",
        kind="image",
        image_data_url="data:image/png;base64,BEFORE",
        embedded_images=["data:image/png;base64,AFTER"],
    )

    content = build_material_content([material])

    assert content[0] == {"type": "text", "text": "【圖片：開關前.png】"}
    # 主圖跟提示文字之間要有一段說明這是同一組、依序對照，不能讓模型以為是兩張無關的圖，
    # 且提示文字裡要教模型用「圖N」引用，不要用「上圖」「下圖」這種對不回去的說法。
    assert content[1]["type"] == "text"
    assert "同屬一組" in content[1]["text"]
    assert "圖1、圖2" in content[1]["text"]
    # 每張圖片前面都要有自己的編號標記，主圖是圖1、附加的是圖2，模型才有辦法精確引用。
    assert content[2] == {"type": "text", "text": "圖1："}
    assert content[3] == {"type": "image_url", "image_url": {"url": "data:image/png;base64,BEFORE"}}
    assert content[4] == {"type": "text", "text": "圖2："}
    assert content[5] == {"type": "image_url", "image_url": {"url": "data:image/png;base64,AFTER"}}


def test_text_material_without_embedded_images_has_no_group_hint() -> None:
    material = ParsedMaterial(filename="spec.pdf", kind="text", text="需求內容")

    content = build_material_content([material])

    assert content == [{"type": "text", "text": "【檔案：spec.pdf】\n需求內容"}]


def test_text_material_embedded_images_numbered_starting_from_one() -> None:
    """文字／PDF 素材合併了圖片進來（或 PDF 本身內嵌截圖）時，附加的圖片從圖1開始
    編號（文字素材沒有自己的主圖，不像圖片素材那樣主圖要先佔掉圖1）。"""
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
    assert "圖1、圖2" in content[1]["text"]
    assert content[2] == {"type": "text", "text": "圖1："}
    assert content[3] == {"type": "image_url", "image_url": {"url": "data:image/png;base64,SHOT1"}}
    assert content[4] == {"type": "text", "text": "圖2："}
    assert content[5] == {"type": "image_url", "image_url": {"url": "data:image/png;base64,SHOT2"}}
