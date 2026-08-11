# Testcase Auto Generate

依據需求規格文件（PDF / Word / Markdown）與 UI 截圖，透過內部部署的 LLM（OpenAI 相容介面，支援 vision）自動產出測試用例草稿；當文件或畫面資訊不足時，系統會以對話方式向使用者提出澄清問題，確認後才生成最終用例，使用者可在網頁上編輯後匯出成 Markdown 檔案。

## 核心欄位（測試用例模板）

- 用例名稱
- 前置條件
- 測試步驟（步驟編號 / 描述 / 預期結果，多列）
- 優先級

## 技術棧

- 後端：Python + FastAPI，透過 OpenAI 相容 API 呼叫公司內部部署模型
- 前端：React + TypeScript + Vite
- 無資料庫，Session 狀態存於後端記憶體，單次使用完即可下載，不保留歷史紀錄

## 專案結構

```
backend/
  app/
    routers/       # upload / chat / generate / export 等 API
    services/
      parsers/      # PDF / Word / Markdown / 圖片 解析
      llm_client.py # OpenAI 相容 LLM client（支援 vision）
      prompt_builder.py
      session_store.py
    models/         # Pydantic schema
    main.py
  requirements.txt
  .env.example
frontend/
  src/
    ...
PROGRESS.md         # 開發進度追蹤
```

## 開發環境設定

見 `backend/.env.example`，複製為 `backend/.env` 並填入內部模型的 `base_url` / `api_key` / `model` 後即可啟動（啟動指令將在後端骨架完成後於此補充）。

## 進度

開發進度請見 [PROGRESS.md](PROGRESS.md)。
