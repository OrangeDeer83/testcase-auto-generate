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
- [x] Markdown 匯出功能（/export）— 語法已用 py_compile 驗證，尚未接上真實內部模型實際跑過端對端流程

## 前端
- [x] Vite + React + TS 專案骨架（npm install / tsc -b / npm run build 皆通過）
- [x] 上傳頁面（多檔案）
- [x] 對話式澄清聊天介面
- [x] 可編輯測試用例表格
- [x] 匯出下載按鈕

## 待確認 / 開放項目
- 內部模型的實際 base_url / api_key / model 名稱：待你提供後填入 `backend/.env`，目前程式邏輯尚未實際對接真實模型測試過完整流程（上傳→產生→澄清→匯出）。
- backend 尚未建立 Python 虛擬環境與安裝套件（未執行 `pip install -r requirements.txt`），因為 venv 建立指令先前被你取消；待你確認要不要現在建立。
- PPT 檔案支援尚未實作，列為未來擴充。
