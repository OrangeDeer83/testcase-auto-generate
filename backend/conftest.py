import os

# app.config.Settings 的必要欄位（llm_base_url/llm_api_key/llm_model）沒有預設值，
# CI 跟本機測試環境都沒有 backend/.env，任何測試只要匯入到 app.config（就算是間接透過
# app.main）就會在 import 階段炸掉。這裡給假值墊底，不影響測試邏輯本身。
os.environ.setdefault("LLM_BASE_URL", "http://localhost/fake/v1")
os.environ.setdefault("LLM_API_KEY", "test-key")
os.environ.setdefault("LLM_MODEL", "test-model")
