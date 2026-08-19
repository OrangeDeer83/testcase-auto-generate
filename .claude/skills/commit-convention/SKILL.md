---
name: commit-convention
description: Use whenever writing, drafting, or generating a git commit message in ANY project — triggers on "commit", "commit 一下", "幫我 commit", "寫 commit message", or any time a commit is about to be created via git commit. Enforces the Angular-style commit message convention (type(scope): subject / body / footer) with Traditional Chinese subject and body text. Apply automatically to every commit from now on, not just when the user explicitly references this convention or asks for it by name.
---

# Commit Message 規範

依據 Angular commit message 慣例（中文詮釋版：https://wadehuanglearning.blogspot.com/2019/05/commit-commit-commit-why-what-commit.html）撰寫 commit message。目的是讓 git log 本身成為一份可查閱的專案歷史，而不只是「把程式碼傳上去」的紀錄——之後回頭看，光讀 commit message 就該能理解「為什麼改」跟「改了什麼」，不用重新去讀一次 diff。

## 訊息結構

```
<type>(<scope>): <subject>

<body>

<footer>
```

- `scope`、`body`、`footer` 都是可選的；一個單純到不需要解釋原因的小改動，只寫 header 一行也可以。
- body 與 footer 之間、header 與 body 之間都要空一行。

## Commit 的粒度與頻率

- 不要把很多不同性質的改動累積到最後才一次 commit。做完一個有獨立意義、可以被驗證的小改動就先 commit，不要等整個大任務都做完才回頭補一個巨大的 commit。
- 拿到一個範圍較大的任務時，主動把它拆成幾個有意義的小步驟，每完成一步就 commit 一次，而不是悶頭把所有步驟做完才一次進行。
- 判斷要不要拆開的簡單方法：這個 commit 的 diff 攤開來，如果要跳到好幾個不相關的地方才能看懂它在做什麼，就代表塞太多了，該拆成多個 commit。
- 這跟 subject「一句話講清楚、只做一件事」是同一個精神的延伸——commit 應該小到能被一句話講清楚，而不是先累積一堆改動，再想辦法用一句話勉強概括。

## Header

### type（必要，英文關鍵字，不要翻譯）

從下列選一個最貼切的：

| type | 意義 |
| --- | --- |
| `feat` | 新增/修改功能 (feature) |
| `fix` | 修補 bug (bug fix) |
| `docs` | 文件 (documentation) |
| `style` | 格式（不影響程式碼運行的變動，例如空白、排版、缺分號等） |
| `refactor` | 重構（既不是新增功能，也不是修補 bug 的程式碼變動） |
| `perf` | 改善效能 |
| `test` | 增加或修改測試 |
| `chore` | 建構程序或輔助工具的變動（maintain） |
| `revert` | 撤銷回覆先前的 commit |

type 存在的意義是讓 code review 的人一眼知道該用什麼態度看這個 commit——看到 `fix` 會認真檢查邊界情況，看到 `style` 就不用逐行推敲邏輯。選 type 時想一下：這個改動如果被審查，審查者最應該關注的是什麼？

`revert` 的格式是 `revert: <被撤銷的原本 header>`，並在 body 寫「回覆版本：<被撤銷的 commit hash>」。

### scope（可選）

commit 影響的範圍，例如模組名稱、資料庫層、某個元件。專案沒有明確分層或改動橫跨太多地方時可以省略，不要為了填而硬湊一個。

### subject（必要，繁體中文）

- 一句話講清楚這次改動做了什麼，不超過 50 個字元，結尾不加句號。
- 每個 commit 只做一件有獨立意義的事——如果發現 subject 裡出現「並且」「同時」串起兩件不相干的事，通常代表這應該拆成兩個 commit。

## Body（建議寫，除非改動小到不需要解釋）

- 用繁體中文說明這次改動的 **Why**（為什麼要改，通常比"改了什麼"更值得寫，因為 diff 已經能看出改了什麼，但看不出動機）與 **What**（具體做了什麼、跟先前行為有什麼不同）。
- 可以分段落、分行，每行不超過 72 個字元，方便在終端機裡不換行閱讀。
- 如果是修 bug，說明原本的錯誤現象/根因；如果是新功能，說明為什麼需要這個功能、解決了什麼問題。

## Footer（視情況）

- 有對應的任務或 issue 編號就填上，方便之後追蹤這次改動的來源。
- 有不相容的重大變動（例如改了 API 介面、資料庫 schema），以 `BREAKING CHANGE:` 開頭另起一段，描述變動內容、原因、以及別人要怎麼遷移。

## 範例

**範例一：修 bug，需要解釋根因**

```
fix(前端): 修正澄清問題不會顯示給使用者的問題

ClarifyChat 原本只渲染已回答的問題歷史，導致使用者在回答之前
完全看不到 LLM 提出的當前問題內容，只能盲目輸入。改成同時渲染
尚未回答的當前問題與其依據說明，回答後才併入歷史紀錄。
```

**範例二：新增功能，一行講清楚即可（不需要 body）**

```
feat(上傳): 新增可貼上文字的動態欄位
```

**範例三：重構，body 說明動機**

```
refactor(用例編輯): 統一澄清問答與用例修改為單一對話端點

原本一次性回答問題的 /answers 端點只能用在初次產生用例時，使用者
產生用例後想再用自然語言批次調整多筆用例就沒有對應介面。改成一個
可重複呼叫的 /chat 端點，每次都帶上目前完整的用例狀態（包含使用者
手動編輯過的內容）與素材重新請模型判斷，同一支端點就能同時處理
回答疑問與下達修改指令兩種情境。
```

## 給模型的提醒

- 寫 commit message 前，先看一下 `git diff` / `git status` 的實際內容，不要用猜的，subject 跟 body 都要對得上真正的改動。
- 進行多步驟任務時，每完成一個有獨立意義的小階段，就主動提議先 commit 這部分，不要等到整個任務結束、累積一堆改動才一次處理。
- 如果打開 `git status` 發現已經有好幾件不相干的改動堆在一起，先跟使用者確認要不要拆成多個 commit，再分別 `git add` 特定檔案分次 commit，而不是全部塞進一個又臭又長的 commit。
- type 關鍵字維持英文（feat/fix/docs 等），subject 與 body 的敘述文字一律用繁體中文。
