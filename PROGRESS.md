# 開發進度

> 每完成一項打勾並簡短註記。此檔案為手動維護的進度總覽，細節請對照 git log。

## 初始化
- [x] git repo 初始化、專案目錄骨架、.gitignore、README

## 後端
- [x] FastAPI 專案骨架與設定（.env 讀取、CORS）
- [x] 文件解析模組（PDF / Word / Markdown / 圖片）
- [x] LLM client（OpenAI 相容介面，支援 vision）
- [x] 測試用例 schema 與 prompt builder（含「不可臆測，須提出澄清問題」規則）
- [x] session store 與對話式澄清流程（/upload /generate /answers /test-cases）
- [x] Markdown 匯出功能（/export）
- [x] 端對端驗證：已對接真實內部模型（Qwen3.5-122B-A10B，OpenAI 相容 `/itllm/v1`），跑過完整流程（上傳 → 產生 → 對已知資訊正確產出用例、對不確定資訊正確提出澄清問題 → 回答後重新產生 → 匯出 Markdown），結果符合預期

## 前端
- [x] Vite + React + TS 專案骨架（npm install / tsc -b / npm run build 皆通過）
- [x] 上傳頁面（多檔案）
- [x] 對話式澄清聊天介面
- [x] 可編輯測試用例表格
- [x] 匯出下載按鈕
- [x] 瀏覽器實測：上傳 → 問題顯示 → 多輪問答 → 編輯表格 → 匯出，整條流程跑通。過程中發現並修正一個真實 bug：`ClarifyChat` 原本只渲染已回答的問題，使用者在回答前看不到當前問題內容（`frontend/src/components/ClarifyChat.tsx`）

## 待確認 / 開放項目
- PPT 檔案支援尚未實作，列為未來擴充。
- `requirements.txt` 原本鎖死版本號，因本機 Python 3.14 太新導致 pydantic-core 編譯失敗，已改為下限版本（`>=`），未來如需重現穩定版本建議另外鎖定實際安裝到的版本號。
- `LLM_BASE_URL` 需含 `/v1` 尾碼（例：`http://10.136.217.41/itllm/v1`），SDK 會自動接上 `/chat/completions`，這點已記錄在 `.env.example` 註解中。
- 前端（`npm run dev`）尚未實際在瀏覽器中操作驗證，只驗證了型別檢查與 production build 成功；後端 API 已用 curl 端對端驗證通過。
