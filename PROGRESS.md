# 開發進度

> 每完成一項打勾並簡短註記。此檔案為手動維護的進度總覽，細節請對照 git log。

## 初始化
- [x] git repo 初始化、專案目錄骨架、.gitignore、README

## 後端
- [ ] FastAPI 專案骨架與設定（.env 讀取、CORS）
- [ ] 文件解析模組（PDF / Word / Markdown / 圖片）
- [ ] LLM client（OpenAI 相容介面，支援 vision）
- [ ] 測試用例 schema 與 prompt builder
- [ ] session store 與對話式澄清流程（/upload /chat /generate）
- [ ] Markdown 匯出功能（/export）

## 前端
- [ ] Vite + React + TS 專案骨架
- [ ] 上傳頁面（多檔案）
- [ ] 對話式澄清聊天介面
- [ ] 可編輯測試用例表格
- [ ] 匯出下載按鈕

## 待確認 / 開放問題
- 內部模型的實際 base_url / api_key / model 名稱：待你提供後填入 `backend/.env`
