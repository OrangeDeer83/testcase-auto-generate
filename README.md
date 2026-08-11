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

## 開發環境設定與啟動

### 後端

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate   # Windows PowerShell 用 .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env      # 填入內部模型的 base_url / api_key / model
uvicorn app.main:app --reload --port 8000
```

### 前端

```bash
cd frontend
npm install
cp .env.example .env      # 預設指向 http://localhost:8000，如後端 port 不同請調整
npm run dev
```

啟動後開啟 `http://localhost:5173` 即可使用。

## 使用流程

1. **上傳素材**：需求文件（PDF / Word .docx / Markdown / 純文字）與 UI 截圖（PNG / JPG）可一次上傳多個檔案。
2. **產生用例**：LLM 會依模板欄位（用例名稱 / 前置條件 / 測試步驟 / 優先級）產出草稿；若資訊不足或有疑義，**不會自行假設**，而是列出澄清問題。
3. **對話澄清**：以聊天介面逐一回答問題，回答會併入分析內容重新產出，可能反覆多輪直到沒有未決問題。
4. **編輯確認**：於可編輯表格中檢查、增刪測試用例與步驟。
5. **匯出**：確認無誤後一鍵下載 Markdown 檔案；不保留歷史紀錄。

## 已知限制 / 未來可擴充

- 目前僅支援 PDF / Word(.docx) / Markdown / 純文字 / PNG / JPG，PPT 為未來擴充項目。
- 無資料庫、無登入機制，僅供本機/單機使用。
- 優先級（priority）欄位為自由文字，未強制限定為特定等級清單，如團隊有固定分級（如 P0–P3）可自行輸入或之後加上前端下拉選單限制。

## 進度

開發進度請見 [PROGRESS.md](PROGRESS.md)。
