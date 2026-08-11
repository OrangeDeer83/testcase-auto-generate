from openai import OpenAI

from app.config import settings

_client = OpenAI(base_url=settings.llm_base_url, api_key=settings.llm_api_key)


def chat_completion(messages: list[dict], *, temperature: float = 0.2) -> str:
    """Send a chat completion request to the internal OpenAI-compatible model.

    `messages` follows the standard OpenAI chat format; user message content
    can be a plain string or a list of {"type": "text"|"image_url", ...} parts
    for multimodal (vision) input.
    """
    response = _client.chat.completions.create(
        model=settings.llm_model,
        messages=messages,
        temperature=temperature,
    )
    return response.choices[0].message.content or ""
