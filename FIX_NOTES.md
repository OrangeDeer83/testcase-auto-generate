# 修復紀錄

> 記錄每次修 bug／改善 UX 時「為什麼壞掉、怎麼修好的、背後用到什麼可以遷移到其他情境的觀念」，主要是寫給使用者看的學習筆記，也順便讓之後回頭查、或下一個接手的 Claude 不用重新翻一次 diff 才搞懂修法。跟 [PROGRESS.md](PROGRESS.md) 的差異：PROGRESS.md 是變更歷史總覽（做了什麼），這份專注在單一問題的根因、修法、與原理本身。維護方式見 `.claude/skills/fix-notes/SKILL.md`。

## 2026-08-21 素材庫／測試用例表格三項 UX 修正

### 1. 素材卡片可直接刪除，不用先點開

**問題**：素材庫的每張卡片點下去只會打開編輯彈窗，要刪除素材必須先點開、在彈窗裡才找得到刪除鈕。

**修法**：`MaterialGrid.tsx` 的卡片裡加一顆垃圾桶圖示按鈕（沿用 `Sidebar.tsx` 既有的 SVG 路徑跟「hover 才顯示」的樣式模式），按鈕 `onClick` 加 `e.stopPropagation()`，避免冒泡觸發卡片本身「點下去開編輯彈窗」的 onClick；沿用既有的 `onRemoveMaterial` callback 跟 `window.confirm` 二次確認文案（跟原本編輯彈窗裡的刪除鈕維持同一套用詞）。只有 `onRemoveMaterial` prop 有給的地方才會顯示這顆按鈕——對話素材選取畫面（`MaterialSelector`）刻意不給這個 prop，避免在那個畫面誤刪整個專案共用的素材。

**背後的通用觀念**：**事件冒泡（event bubbling）**。整張卡片本身就掛了 `onClick`（點卡片開編輯視窗），垃圾桶按鈕是卡片內部的子元素。子元素被點擊時，瀏覽器預設會讓這個點擊事件沿著 DOM 樹一路往父層「冒泡」上去——不擋的話，點垃圾桶會同時觸發「刪除」跟「打開編輯視窗」兩件事。`e.stopPropagation()` 就是明確告訴瀏覽器「這個事件處理到我這裡就好，不要再往上傳」。這是很常見的模式：只要一個可點擊的容器裡塞了另一個可點擊的小按鈕（刪除鈕、勾選框、連結中的按鈕……），幾乎都要記得擋冒泡，程式碼裡的 checkbox（`onClick={(e) => e.stopPropagation()}`）本來就已經示範過同一招。

**檔案**：`frontend/src/components/MaterialGrid.tsx`（新增刪除按鈕與 `handleDeleteClick`）、`frontend/src/index.css`（新增 `.material-card-delete`，預設 `display: none`，`.material-card:hover` 時才 `display: flex`）

### 2. 彈出視窗在面板內選字、放開在外面會誤觸關閉

**問題**：`MaterialsModal`、`MaterialGrid` 的編輯素材彈窗、`MaterialRow` 的圖片放大預覽，這三個彈窗原本都是在 `.modal-overlay` 上掛 `onClick={onClose}` 判斷「點擊遮罩＝關閉」。但如果使用者在彈窗面板內選取文字、往面板外拖曳才放開滑鼠，瀏覽器合成 `click` 事件時，事件的 `target` 是 mousedown 與 mouseup 兩者的最近共同祖先——也就是遮罩本身——跟真的點擊遮罩沒有任何區別，因此會被誤判成「點擊外部」而意外關閉視窗。同一套邏輯下「縮放說明框」等超出面板範圍的區塊也會有一樣的誤觸風險。

**修法**：抽出共用元件 `ModalOverlay.tsx`，改用 `useRef` 記錄 `mousedown` 事件當下是否真的直接按在遮罩本身（`e.target === e.currentTarget`）——如果 mousedown 的 target 是面板內部的某個子元素（例如文字節點），就代表這是一次「從面板內部開始」的操作，不算「點擊外部」的意圖。`click` 事件觸發時再次確認「mousedown 當時就在遮罩上」且「click 本身的 target 也是遮罩」兩個條件同時成立，才真正呼叫 `onClose()`。三個用到彈窗的地方都換成使用這個共用元件，不再各自重複判斷邏輯。

**背後的通用觀念**：瀏覽器的 `click` 事件不是看「滑鼠放開（`mouseup`）的地方在哪」，而是看 **`mousedown` 按下的元素**跟 **`mouseup` 放開的元素**，兩者「最近的共同祖先」是誰，`click` 就發生在那個祖先身上——這是規格定義好的行為，不是 bug。所以任何「點擊外部關閉」（click-outside-to-close）的實作，只看 `click` 事件的 `target` 都不夠精確，正確做法是額外記錄 `mousedown` 的起點，確認「這次點擊真的從外部開始」才關閉。這是一次學會、到處都能用的模式——很多現成 UI 函式庫的 `useClickOutside` hook，內部也是同樣的邏輯。

**檔案**：新增 `frontend/src/components/ModalOverlay.tsx`；改用它的 `frontend/src/components/MaterialsModal.tsx`、`MaterialGrid.tsx`、`MaterialRow.tsx`

**驗證方式**：瀏覽器裡用 JS 手動 dispatch 事件序列驗證兩種情境——(a) mousedown 的 target 設在面板內的 `<pre>` 文字節點、mouseup／click 的 target 落在遮罩本身：確認彈窗**不會**關閉；(b) mousedown 與 click 都直接發生在遮罩本身：確認彈窗**仍然會**正常關閉，避免修過頭導致「點遮罩想關閉」失效。

### 3. 測試用例展開／收合只有箭頭能點

**問題**：`TestCaseTable.tsx` 裡每筆測試用例的展開/收合只綁在小箭頭 `<button className="case-expand-toggle">` 的 `onClick` 上，點名稱、優先級、步驟數所在的那一整排空白處完全沒反應，點擊熱區太小。

**修法**：把 `onClick={() => toggleExpanded(caseIndex)}` 移到整個 `.case-card-header` 容器上。連帶要處理兩個會被誤觸的子元素：(1) 箭頭按鈕自己的 `onClick` 補上 `e.stopPropagation()`——否則點箭頭時會變成「箭頭自己 toggle 一次 → 事件冒泡到 header 又 toggle 一次」，兩次互相抵銷、畫面看起來沒反應；(2) 展開狀態下顯示的用例名稱 `<input>` 也補上 `e.stopPropagation()`，避免使用者點進輸入框想編輯名稱時誤觸收合。CSS 幫 `.case-card-header` 加 `cursor: pointer` 提示整塊可點，`input.name-input` 覆寫回 `cursor: text` 維持輸入框該有的游標樣式。

**背後的通用觀念**：跟第 1 點是同一個「事件冒泡」原理，但這次是反過來——不是要擋冒泡，而是刻意**利用**冒泡讓「點擊熱區」擴大到整個容器，同時又要防止容器裡原本各自獨立的可點擊子元素（箭頭按鈕、輸入框）被連帶誤觸。判斷準則很單純：一個容器要嘛整個當成一個點擊目標，要嘛容器裡的子元素各自獨立處理自己的點擊——把這兩種模式混在一起用時（容器有 onClick，子元素也有自己的 onClick），子元素就一定要用 `stopPropagation()` 明確表態「我要獨立處理，不要讓外層也跟著反應」，不然行為會變得不可預期（像這裡的兩次 toggle 互相抵銷）。

**檔案**：`frontend/src/components/TestCaseTable.tsx`、`frontend/src/index.css`

---

**這次修改的共通驗證方式**：三項都先在 git worktree 開出的獨立測試環境（port 18002 後端／5175 前端，`feature/material-library-ux-fixes` 分支）用瀏覽器實測過，過程中未動到使用者正在用的主環境（8000／5173）；`npx tsc --noEmit` 型別檢查全數通過。
