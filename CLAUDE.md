# 給接手這個專案的 Claude（不管在哪台機器上）

這份筆記是給你（Claude Code）看的，目的是讓你打開這個專案不用重新摸索，直接知道現在狀態、怎麼跑起來、有什麼地雷。詳細變更歷史請查 [PROGRESS.md](PROGRESS.md)，使用方式請查 [README.md](README.md)，這裡只放「現在馬上需要知道」的事。

## 這是什麼

依據需求文件（PDF/Word/Excel/Markdown/貼上的文字）跟 UI 截圖，透過公司內部部署的 LLM 自動產出測試用例，可匯出成 Markdown 或 Excel（.xlsx，欄位對應公司用例管理系統的匯入格式：用例名稱/所屬模塊/前置條件/步驟描述/預期結果/用例等級/備註）。核心原則：**LLM 不可以亂猜**，資訊不足就要用對話方式問清楚，使用者也可以隨時用聊天下指令請它批次修改多筆用例。

## 現在的狀態

已經是**完整可跑、對接真實內部模型驗證過**的狀態，不是半成品。後端、前端、跟真實 LLM 的端對端流程都在瀏覽器裡實測過。目前沒有正在進行到一半的功能——如果使用者接下來提新需求，就是全新的一輪，不用擔心有斷頭的工作。

## 怎麼啟動（最短路徑）

**後端**（需要先有 `backend/.env`，見下方「地雷」）：
```bash
cd backend
python -m venv .venv
.venv/Scripts/activate   # Windows PowerShell 用 .venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**前端**：
```bash
cd frontend
npm install
cp .env.example .env      # 預設指向 http://localhost:8000
npm run dev
```

開 `http://localhost:5173`。

## 地雷 / 一定要知道的事

1. **`backend/.env` 不在版控裡**，換一台機器一定要自己重建（複製 `backend/.env.example`），裡面要填：
   - `LLM_BASE_URL`：內部模型的 endpoint，**結尾一定要有 `/v1`**（例如 `http://10.136.217.41/itllm/v1`）。少了 `/v1` 不會報連線錯誤，而是回一個容易誤導人的 nginx 405。
   - `LLM_API_KEY`、`LLM_MODEL`
   - 這把金鑰是敏感資訊：不要主動去讀這個檔案內容印出來，也不要幫使用者把它貼進聊天視窗以外的地方。
2. **`requirements.txt` 用的是版本下限（`>=`）不是鎖死版本**，因為本機 Python 3.14 太新，鎖死的 `pydantic==2.9.2` 沒有預編譯 wheel 會編譯失敗。換機器如果 Python 版本較舊，理論上也還是能裝，但沒重新驗證過。
3. 沒有資料庫，但**不是存在後端記憶體**——2026-08-19 起改成檔案式持久化（`backend/app/services/{data_paths,project_store,conversation_store}.py`），資料存在 `backend/data/projects/{id}/{project.json, materials/*.json, conversations/*.json}`（不進 git，比照 `backend/logs/` 處理）。重啟後端資料不會消失，使用者可以離開後回來繼續同一個專案/對話。
4. `backend/logs/app.log` 有每次呼叫模型的完整 request/response 記錄（不進 git），畫面結果跟預期不符時先看這個，不要用猜的。

## 專案結構速覽

```
backend/app/
  routers/        projects（專案 CRUD + 素材管理）、conversations（對話 CRUD/產生/聊天）、
                   export（掛在對話底下：GET /api/projects/{id}/conversations/{id}/export/excel）
  services/
    parsers/       PDF/Word/Excel/Markdown/圖片 解析
    llm_client.py  OpenAI 相容 client（支援 vision），呼叫前後會寫 log
    prompt_builder.py  SYSTEM_PROMPT（初次產生）+ SYSTEM_PROMPT_CHAT（對話式編輯）
    excel_export.py    TestCase 清單 → .xlsx（sheet「Test Cases」，欄位對應用例管理系統匯入格式）
    markdown_export.py Markdown 匯出邏輯還在，但目前沒有對應路由（見下方已知限制）
    data_paths.py / project_store.py / conversation_store.py
                        檔案式持久化儲存層（見上方地雷第 3 點），data_paths.py 提供 atomic
                        write（os.replace）跟 RLock，project_store/conversation_store 是各自的 CRUD
  models/          Pydantic schema：Project、Conversation（取代舊的 session.py）、
                   ParsedMaterial（有 id）、TestCase（沒有 id，欄位含 module/notes）
frontend/src/
  App.tsx          react-router-dom 路由設定：/（HomePage）→ /projects/:id（ProjectPage）
                   → /projects/:id/conversations/:id（WorkspacePage）
  pages/           HomePage（專案列表/建立/刪除）、ProjectPage（素材庫+對話列表）、
                   WorkspacePage（聊天+表格，原本的主要工作畫面，含直接用網址重整還原邏輯）
  diffTestCases.ts 純前端比對聊天前後 test_cases 差異（依用例「名稱」配對，不是穩定 id）
  components/      ChatPanel / TestCaseTable / MaterialLibraryPanel / MaterialSelector /
                   MaterialRow / MaterialsModal / ExportButton
```

## 已知限制（如果使用者抱怨這些，不用意外）

- `diffTestCases.ts` 用**用例名稱**配對變動前後是不是同一筆，如果 LLM 把某筆用例名稱也一起改了，會被誤判成「刪除舊的+新增新的」而不是「重新命名」。之前有丟一個背景任務評估要不要幫 `TestCase` 加穩定 id，可以去確認那個任務的結論。
- PPT 檔案還不支援，只有 PDF/Word(.docx)/Excel(.xlsx)/Markdown/純文字/PNG/JPG；.xls（舊版 Excel 格式）也不支援，只吃 .xlsx。
- 優先級（priority）欄位是自由文字，沒有強制限定成 P0–P3 之類的清單。

## 給你（Claude）的提醒

- git commit 訊息一律用繁體中文，遵守 commit-convention 那套 Angular 慣例規則，而且**改動範圍不要一次太大**，做完一個有獨立意義的小改動就先 commit。
- 這個 repo 有自己的 `.claude/skills/`（目前收了 `commit-convention`、`pr-prep` 兩個），是使用者刻意在收集的「coding 專用 skill」集合，跟使用者機器上的全域 `~/.claude/skills/` 是各自獨立的複製，**不會自動同步**——改進了其中一份的內容，記得問一下要不要也同步更新另一份，不然兩邊會慢慢長歪。專案內的這份會跟著 repo 進版控、換機器/換人 clone 都會自動帶到。
- 這個 repo 已經開始用 PR + CI + branch protection 的流程（`.github/workflows/ci.yml`，check 名稱 `frontend`/`backend`，`master` 有設 branch ruleset 要求兩個 check 都過），不是每次都直接 commit 到 `master`；細節、什麼時候該走完整流程參考 `pr-prep` skill。
- 這個專案的 UI/邏輯改動，改完要實際在瀏覽器裡點過一次再回報完成，不要只憑型別檢查或 build 過就說做完了——這個專案的歷史上已經因為只信任型別檢查而漏掉好幾個真的會影響操作體驗的 bug（例如聊天泡泡沒有依角色左右對齊、欄位編號跳號）。
