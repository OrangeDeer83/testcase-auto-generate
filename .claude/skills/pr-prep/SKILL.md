---
name: pr-prep
description: PR 從準備到合併整個生命週期都用這個 skill。觸發時機包含使用者提到「PR」「pull request」「發 PR」「開 PR」「準備發 PR」「這個改完可以送 PR 了嗎」「幫我寫 PR 標題/描述」，或使用者準備要執行 `gh pr create` 之前；也包含 PR 開了之後的後續——CI 紅燈要查原因、要設定 branch protection／ruleset 讓 CI 沒過不能合併、合併後要同步回正式環境。即使使用者沒有明講要用這個流程，只要語意上是「要把目前的改動送出去給人審查/合併」或「PR/CI 卡住了」，就該主動觸發。檢查跟產生內容可以自己做，但絕對不要自動執行 `gh pr create`、實際點下合併按鈕、或修改 branch protection 設定——這些都要使用者自己確認後才動手。
---

# PR 準備助手

目的：發 PR 前很容易漏掉一些不該漏的事——夾帶了 `.env`、留了 `console.log`、UI 改了但沒實際點過、標題描述隨便寫兩句讓 reviewer 猜。這個 skill 把這些檢查跑過一輪，並產生 PR 標題與描述草稿，讓使用者確認後自己送出。

跑這個流程前，先確認目前在 git repo 裡（`git rev-parse --is-inside-work-tree`），不是就停下來告訴使用者。

**先確認有沒有分開的開發環境**：跑一下 `git worktree list`。如果使用者習慣把「持續在運行/正式」的環境跟「開發中」的環境分成兩個資料夾（同一個 repo，用 `git worktree` checkout 到不同分支），代表這個流程的所有檢查、commit、push 都應該對著開發用的那個分支/資料夾操作，不要動到正式環境那個資料夾。這種分法完全不影響後面的 PR/CI 流程，只是操作時要認清楚現在是在哪個資料夾底下下指令。

## Step 1：辨識這個 repo 的慣例

不同 repo 的語言/風格不一樣，硬套一套模板只會產生跟 repo 風格不搭的 PR 描述。花點時間偵測：

1. **找專案說明文件**：repo 根目錄有沒有 `CLAUDE.md`、`CONTRIBUTING.md`、`.github/PULL_REQUEST_TEMPLATE.md` 之類的檔案。如果 `.github/PULL_REQUEST_TEMPLATE.md` 存在，優先照它的結構寫，不要自己另外發明格式。
2. **找有沒有現成的 commit message 慣例**：可用的 skills 裡如果有 commit 相關的 skill（例如專門講 commit message 規範的），先看一下它定義的語言/風格，PR 描述通常應該跟 commit message 用同一種語言/同一套 type 詞彙，維持一致。
3. **沒有上述文件時，看 commit history 抓風格**：`git log -20 --oneline`，觀察是中文還是英文、有沒有 `type(scope): subject` 這種前綴慣例。用觀察到的風格寫，不要預設英文。

## Step 2：抓出這次 PR 實際的改動範圍

先確認 base 分支（要合併過去的目標），一般是 `main` 或 `master`；不確定就 `git symbolic-ref refs/remotes/origin/HEAD` 或直接問使用者。抓出範圍：

```
git log <base>..HEAD --oneline
git diff <base>...HEAD --stat
git status
```

如果現在的分支上還沒有任何 commit 領先 base（都還在工作區），先確認使用者是不是還沒 commit，提醒他先照 repo 的 commit 慣例分批 commit 完，再回來走這個流程——PR 內容是根據已經 commit 的東西產生的，不是根據工作區裡還沒定案的改動。

## Step 3：檢查清單

針對 Step 2 抓出的 diff 範圍逐項檢查，每一項都要給明確結論（過 / 有疑慮，附原因），不要只是形式上跑過：

**1. 改動範圍是否聚焦**
看 `git log <base>..HEAD --oneline` 裡的 commit 列表：這些 commit 是不是在講同一件事？如果混雜了明顯不相關的多個主題（例如一個修 bug 又順手重構了另一個模組），提醒使用者考慮拆成多個 PR——reviewer 很難一次審查兩件不相關的事。

**2. 有沒有不該進版控的東西**
看 `git status` 跟 `git diff <base>...HEAD --stat`，留意：
- 憑證/金鑰類：`.env`、`.env.*`（非 `.env.example`）、`*.pem`、`*.key`、`id_rsa*`、檔名含 `secret`/`credential`/`password` 的檔案
- log 檔、暫存檔、build 產物（`dist/`、`build/`、`*.log`、`node_modules/` 等，除非該 repo 明確會把這些納入版控）
- 異常大的檔案（明顯是誤加的二進位檔、資料庫檔、大型媒體檔）
如果 repo 有 `.gitignore`，交叉比對一下這些東西是不是本來就該被排除卻還是進了 diff。抓到就明確列出檔名，不要只講「可能有問題」。

**3. 有沒有殘留的除錯痕跡**
在 diff 內容裡找明顯是除錯用、不該留下的東西：`console.log`/`print` 除錯輸出、`debugger`、被註解掉的整段舊程式碼、寫死的測試用假資料、`TODO`/`FIXME` 看起來是這次改動臨時加的（不是本來就存在的技術債標記）。這項要看實際 diff 內容判斷，不要對每個 `print(` 都反射性報警——先想這行是不是原本就該存在的正常輸出。

**4. UI / 前端改動是否已經實際驗證過**
如果 diff 涉及前端/UI 相關檔案（元件、樣式、頁面路由等），確認這次改動是不是已經在瀏覽器裡實際操作驗證過，而不只是型別檢查或 build 通過。如果無法從對話上下文確認已經測過，明確提醒使用者：「這次改動有 UI 部分，型別檢查過不代表操作起來沒問題，建議送 PR 前實際點過一次」，不要自己假設已經測過。

**5. 測試是否補齊/跑過**
如果 repo 有測試目錄或測試檔案慣例（例如 `tests/`、`__tests__`、`*.test.*`、`*.spec.*`），而這次改動的邏輯層有變動卻沒有對應測試異動，提出來讓使用者決定要不要補；如果 repo 有測試指令（`package.json` 的 `test` script、`pytest` 等），建議實際跑一次確認沒有壞掉。

把以上五項結果整理成一份清單回報給使用者，格式類似：

```
## PR 前檢查
- [x] 改動範圍聚焦：都是圍繞「XXX」這件事
- [ ] 疑似夾帶不該進版控的檔案：backend/.env（新增），建議 git rm --cached 移除
- [x] 沒發現殘留除錯痕跡
- [ ] 有 UI 改動（frontend/src/components/Foo.tsx），需要確認已在瀏覽器測過
- [x] 相關測試已跑過
```

有打勾以外（有疑慮）的項目時，先跟使用者確認要不要處理，不要直接跳過繼續產生 PR 描述——除非使用者明確說「先不管，繼續」。

## Step 4：產生 PR 標題與描述

檢查清單過關（或使用者決定先略過疑慮）之後，根據 Step 2 抓到的 commit 訊息與 diff 內容產生：

**標題**：一句話講清楚這次 PR 做了什麼，控制在 70 字元內。如果 repo 有 `type(scope): subject` 這種 commit 慣例，標題沿用同一套（例如 `feat(前端): 支援貼上截圖當附件`），不要另外發明一套風格。

**描述**：至少包含這兩段（如果 repo 有自己的 PR 模板就照模板結構，不用堅持這兩段名稱）：

```
## Summary
- 改了什麼、為什麼要改（動機比條列改了哪些檔案更重要，diff 本身已經看得出改了什麼檔案）

## Test plan
- 實際怎麼驗證這次改動的（跑了哪些測試、在瀏覽器操作過哪個流程、看過哪些 log）
```

語言跟著 Step 1 偵測到的 repo 慣例走（這個環境常見的情況是 commit message 用繁體中文，PR 描述也應該跟著用繁體中文，除非 repo 明顯是英文專案）。

## Step 5：收尾——絕對不要自己送出

把產生好的標題/描述完整貼給使用者看。確認要送出之後：

- **有 `gh` CLI 且已登入**（`gh auth status` 確認）：使用者同意後可以用 `gh pr create --title "<標題>" --body "<描述>"` 直接開，不用使用者手動貼內容。
- **沒有 `gh` CLI，也沒有能操作的已登入瀏覽器**：不要嘗試自己硬闖 GitHub 網頁（不能替使用者輸入帳密登入）。改成：先確認 head 分支已經 push 到 remote（`git push -u origin <branch>`，一樣要先取得同意），然後把連結連同已經產生好的標題/描述一起貼給使用者，讓他自己開瀏覽器點連結、按下 Create pull request。
  - **優先給預先帶好標題/描述的連結**，不要讓使用者手動複製貼上：GitHub 的 compare 頁面支援用 query string 帶入表單內容，格式是 `https://github.com/<owner>/<repo>/compare/<base>...<head>?quick_pull=1&title=<url-encoded 標題>&body=<url-encoded 描述>`。標題跟描述都要正確 URL-encode（含中文、換行、`#`、`&` 等符號），不要手動拼字串湊編碼，用 Bash 起一段小 script（例如 Python 的 `urllib.parse.urlencode`）產生，避免編錯壞掉整條連結。
  - 這條連結即使很長（幾千字元）通常也不是問題，但一定要提醒使用者：**這是預先帶好內容的連結，不是已經送出的 PR**，他自己點開、看過欄位內容、按下 Create pull request 才算數。
  - 因為你自己的瀏覽器工具通常沒有登入使用者的 GitHub 帳號，點開這條連結大概率只能看到公開的 compare/diff 頁（看得到 commit 列表、改動檔案數，可以拿來核對範圍是否跟本地一致），看不到「Create pull request」表單本身，所以**不要宣稱已經幫使用者驗證過標題/描述真的有帶進表單**——誠實講清楚驗證到哪一步（連結有效、compare 範圍正確），哪一步只能請使用者自己確認（表單有沒有真的預填成功）。
  - 保險起見，同時把純文字版的標題/描述也貼給使用者，讓他在預填連結萬一沒生效（例如瀏覽器擋掉過長 URL、或欄位沒帶到）時可以直接手動貼上，不用回頭再要一次。

不管走哪條路，都不要在使用者還沒看過內容、沒有明確說「可以送出」之前就建立 PR。這跟建立分支、push 到 remote 之類會影響共享狀態的操作一樣，都需要先取得使用者的明確同意，而且「push 分支」跟「開 PR」是兩個各自需要同意的動作，即使使用者已經同意了其中一個，也不代表另一個自動獲得同意。

## Step 6：PR 開了之後

PR 開出來不代表這個流程結束，通常還有後續：

**CI 會自動重跑，不用手動觸發**：如果 repo 有 `.github/workflows/` 底下設定了 `on: pull_request` 觸發，之後只要這個分支有新 commit push 上去，GitHub 就會自動重新跑一次 CI（`synchronize` 事件），不需要使用者或你手動重新觸發，也不需要重新開一個 PR。

**CI 紅燈時怎麼查原因**：
- 有 `gh` CLI：直接 `gh run view <run-id> --log-failed` 或 `gh pr checks` 拿到失敗細節。
- 沒有 `gh` CLI：GitHub Actions 的完整 log 需要登入權限，WebFetch 這類匿名讀取工具即使對公開 repo 也只能透過 `https://api.github.com/repos/<owner>/<repo>/actions/runs` 系列端點看到「哪個 job/step 失敗」，看不到實際錯誤訊息內文（`.../actions/jobs/<id>/logs` 會回 403）。這種情況下，把 run 的網頁連結（`https://github.com/<owner>/<repo>/actions/runs/<run-id>/job/<job-id>`）給使用者，請他展開失敗的步驟、把錯誤訊息貼過來，你再照一般除錯流程去讀對應的原始碼、判斷根因、修正。
- 修完之後正常 commit + push 到同一個分支就好，CI 會自動重跑，不用重新走一次 Step 1-5。

**要讓「CI 沒過就不能合併」，需要額外設定 branch protection／ruleset**：這不是 CI 檔案本身會做的事，要去 repo 的 `Settings → Branches`（或新版 UI 的 `Settings → Rules → Rulesets`）設定，這一步是「變更共享 repo 設定」，一樣需要使用者自己在網頁上操作或明確同意才能做，而且要提醒兩個常見地雷：
- Required status checks 用的 check 名稱要「已經真的跑過至少一次」才會出現在搜尋選單裡（GitHub 需要先看過這個 check 名稱），所以通常要先讓 PR 觸發過一次 CI，才能回頭設定必要檢查。
- 新版 Rulesets UI 如果沒有在 **Target branches** 指定套用的分支（例如 `master`/`main`），或 **Enforcement status** 沒設成 **Active**，規則存了也不會生效，GitHub 會提示「This ruleset does not target any resources」。

**合併之後**：如果使用者是用前面提到的「開發環境／正式環境分開資料夾」方式工作，提醒他回到正式環境那個資料夾執行 `git checkout <base> && git pull`，讓正式環境同步到剛合併進去的內容；開發用的分支/worktree 如果確定用不到了，可以視情況清掉（`git worktree remove`、`git branch -d`），但這屬於刪除操作，一樣先確認使用者要不要清、不要自己直接刪。
