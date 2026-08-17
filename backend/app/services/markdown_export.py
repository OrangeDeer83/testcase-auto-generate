from app.models.test_case import TestCase


def _escape_cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", "<br>")


def to_markdown(test_cases: list[TestCase]) -> str:
    sections: list[str] = []

    for idx, case in enumerate(test_cases, start=1):
        lines = [f"## {idx}. {case.name}", "", f"- 優先級：{case.priority}"]
        if case.module:
            lines.append(f"- 所屬模塊：{case.module}")
        if case.preconditions:
            lines.append(f"- 前置條件：{case.preconditions}")
        lines.append("")
        lines.append("| 步驟 | 描述 | 預期結果 |")
        lines.append("| --- | --- | --- |")
        for step in case.steps:
            lines.append(
                f"| {step.step_no} | {_escape_cell(step.description)} "
                f"| {_escape_cell(step.expected_result)} |"
            )
        if case.notes:
            lines.append("")
            lines.append(f"- 備註：{case.notes}")
        lines.append("")
        sections.append("\n".join(lines))

    return "\n".join(sections)
