# Git Graph — 設計文件

日期：2026-07-22
狀態：已核准，待撰寫實作計畫

## 目標

在 Muxy 的 git-graph 擴充套件中提供一個 **commit graph（提交圖）** 功能，用經典
鐵軌線（railroad）視覺化畫出專案內**所有 refs**（local branches + remote + tags）
的提交歷史，讓使用者清楚看到每個分支的分支/合併脈絡與狀態。

## 需求（已與使用者確認）

1. **核心視覺**：commit graph — 每個 commit 一個節點，用彩色線段連出分支的分岔與合併。
2. **範圍**：所有 refs（local branches、remote branches、tags）。
3. **介面**：兩個，共用同一 graph 繪製模組
   - 全寬 **Tab**：完整 graph（主要介面）。
   - 右側 **Panel**：精簡版（較窄、橫向捲動）。
4. **互動**（全部保留）：
   - 點 commit → 展開詳情：完整 hash、作者、日期、完整 message、變動檔案 / diff。
   - 點 branch 標籤 → checkout 到該分支（會跳確認）。
   - 頂部搜尋 / 過濾：依 commit message / 作者 / hash 過濾；可只看某分支。
5. **主題**：全部使用 `var(--muxy-*)`；graph lane 使用一組貼合主題的分類色（唯一例外）。

## 方案決策

採用**方案 B**：以 `muxy.exec` 執行 `git log --all` 取得跨所有 refs 的 commits，
自寫純函式 lane 佈局引擎，用 SVG + 主題變數繪製。

**為何不用純 `muxy.git.log`**：文件確認 `muxy.git.log` 只跟隨目前 HEAD 的祖先鏈，
僅接受 `maxCount` / `skip`，無 `--all` 等價選項，畫不出所有 refs。

**為何不用第三方套件（如 @gitgraph/js）**：bundle 變重、樣式難貼合 Muxy 主題、
點擊對應到 commit 的互動較難掌控。

`muxy.git.*` 仍用於它擅長的事：分支清單、repoInfo、diff、checkout（結構化且有快取）。

## 架構

### 模組切分（`src/gitgraph/`）

| 模組 | 職責 | 相依 |
|---|---|---|
| `data.js` | `muxy.exec` 跑 `git log --all` 並解析成 commit 物件；`loadBranches` / `loadCommitDetail` 走 `muxy.git.*` | muxy.exec, muxy.git |
| `layout.js` | **核心**：commit DAG → 每個 commit 的 lane（欄索引）+ 要畫的線段。純函式，無 DOM / 無 muxy | 無 |
| `render.js` | layout + commits → DOM：左側 SVG 鐵軌線、右側每列 refs 徽章 / subject / 作者 / 相對時間 / short hash | lib/dom, lib/icons |
| `app.js` | 控制器：載入 → 佈局 → 繪製；搜尋 / 過濾；點擊（詳情 / checkout）；refresh；訂閱 `worktree.headChanged` 自動刷新 | 以上全部 |
| `tab.js` | Tab 掛載點，`new GitGraphApp(root, { compact: false })` | app |
| `panel.js` | Panel 掛載點，`new GitGraphApp(root, { compact: true })` | app |

各模組單一職責、介面清楚、可獨立理解與測試。核心複雜度集中在 `layout.js`，
它被刻意設計成純函式以便完整單元測試。

### 資料模型

```
Commit = {
  hash: string,          // 完整 40 字元
  shortHash: string,
  parents: string[],     // parent 完整 hashes（0=root, 1=一般, 2+=merge）
  refs: Ref[],           // 指向此 commit 的 refs
  authorName: string,
  authorDate: string,    // ISO 8601
  subject: string,
}
Ref = { name: string, kind: "branch" | "remote" | "tag" | "head" }

LayoutRow = {
  commit: Commit,
  lane: number,          // 此 commit 節點所在欄
  color: number,         // lane 顏色索引
  edges: Edge[],         // 此列往下要畫的線段
}
Edge = { fromLane: number, toLane: number, color: number }
```

### 資料流

1. `app.load()` → `data.loadGraph({ maxCount })`
   - `muxy.exec(['git','log','--all','--parents','--date=iso-strict',
     '--pretty=format:%H%x1f%P%x1f%an%x1f%aI%x1f%D%x1f%s%x1e'])`（在 repo cwd）
   - 純函式 `parseGitLog(stdout)` → `Commit[]`（解析 `%x1f` 欄位分隔、`%x1e` 記錄分隔、
     由 `%D` 裝飾解析 refs 種類）。
2. `layout.assignLanes(commits)` → `LayoutRow[]`（純函式）。
3. `render.draw(container, rows, { compact })` → 產生 DOM。
4. 點 commit → `data.loadCommitDetail(hash)`（`muxy.git.diff` + `git show --stat`）→ 顯示在
   Tab 側欄 / Panel 展開列。
5. 點 branch → `muxy.git.checkout(name)`（會跳確認）→ 成功後刷新。
6. 搜尋輸入 → 純過濾函式 → 重新佈局 + 繪製子集。

### Lane 佈局演算法（`layout.js`）

輸入為 topological（`git log` 已由新到舊排序）的 commits。逐列由上（最新）往下：

- 維護一組「作用中 lane」，每個 lane 記錄它目前在等待的 commit hash。
- 對每個 commit：找到等待它的 lane（若無則配一個新 lane，通常是分支頂端）作為它的節點欄。
- commit 的每個 parent：第一個 parent 沿用同一 lane；其餘 parent（merge）配到新 lane 或
  併入已存在該 parent 的 lane。
- 產生此列的 edges（本列 lane → 下列 lane 的連線），供 SVG 繪製。
- lane 顏色索引在配置新 lane 時循環指派。

此演算法純資料進出，便於用固定 DAG fixture 驗證 lane / edge / color 指派。

### 繪製（`render.js`）

- 每列一個 row：左側固定寬度的 graph 欄（SVG，畫節點圓點 + 進出線段），
  右側 commit 資訊（refs 徽章、subject、作者、相對時間、short hash 用 monospace）。
- SVG 線段顏色來自一組主題感知的分類色陣列（見下）；節點圓點使用其 lane 色。
- `compact` 模式：欄較窄、字較小、隱藏次要欄位（作者/日期改成 tooltip），容器可橫向捲動。

## 主題與顏色

- 所有 chrome 顏色一律 `var(--muxy-*)`，不寫 hex。
- **例外**：graph lane 分類色——以 `--muxy-accent` 為首，搭配數個柔和、主題感知的色相，
  作為循環調色盤區分不同分支線。這是資料視覺化的正當分類色需求。
- 因 SVG 顏色不會自動吃 CSS 變數，於 `muxy.onThemeChange` 時重讀主題並重繪 SVG 顏色。
- 尺寸、字級、圖示、圓角一律取自 muxy-extension skill 的 scale。

## 介面宣告（manifest，`package.json` 的 `muxy` 物件）

移除 starter 的 Hello 樣板，改為：

- `tabTypes`：一個全寬 tab，欄位 `{ id: "graph", title: "Git Graph", entry: "<tab html>",
  defaultData?: { compact: false } }`。無 `icon` 欄位（改由 `muxy.tabs.setIcon()` 於執行期設定）。
- `panels`：一個 git-graph panel（右側 pinned），header 有 refresh 按鈕。
- `commands`：
  - 開啟 tab：`{ id, title, action: { kind: "openTab", tabType: "graph" }, defaultShortcut }`。
  - 切換 panel：`{ action: { kind: "togglePanel", panel: "graph" }, defaultShortcut }`。
  - refresh 命令（供 panel/tab header 按鈕與快捷鍵）。
- `topbarItems`：入口按鈕，`command` 指向「開啟 tab」命令。
- `permissions`：`git:read`、`git:write`、`commands:exec`、`panels:write`、
  `tabs:write`（執行期 `setTitle`/`setIcon`）、`worktrees:read`。
- `events`：`worktree.headChanged`（自動刷新）。

已向 Muxy 文件確認：exec 權限字串為 `commands:exec`；全寬 tab 以 `tabTypes` 陣列宣告，
可用命令的 `action.kind: "openTab"` 或 `muxy.tabs.open({ kind: "extensionWebView",
extension: { id, tabType, data } })` 開啟。

## 錯誤處理與邊界

- **非 git repo / 無 commit**：友善空狀態（圖示 + 說明），不報錯。
- **exec 失敗**：錯誤狀態顯示訊息 + 「重試」按鈕。
- **大 repo**：`maxCount` 預設上限（如 300）；提供「載入更多」以 `skip` 分頁往下取。
  超過上限時明確標示尚有更多而非靜默截斷。
- **checkout 失敗 / 使用者取消**：還原狀態、顯示提示，不當機。
- **remote workspace**：`muxy.exec` 由 Muxy 在 SSH 端代理執行，路徑為遠端路徑，程式碼
  對本地 / 遠端一致，無需特別處理。

## 測試策略

- **`layout.js`（最高價值）**：以手寫 DAG fixtures（線性、分岔、合併、多 root、
  交錯分支）驗證每列的 lane / edges / color 指派。
- **`data.js` 解析器**：以樣本 `git log` 輸出字串驗證 `parseGitLog` 產出正確 `Commit[]`
  （含 merge 的多 parent、`%D` 各種 ref 種類、空 refs）。
- **搜尋 / 過濾**：純過濾函式的單元測試。
- **render / app**：jsdom smoke 或手動；主要靠 build 後在 Muxy 中 Reload 實測。

## YAGNI / 非目標

- 不做 commit 的 rebase / reset / cherry-pick 等寫入操作（只做 checkout）。
- 不做圖形化的拖拉合併。
- 不內建第三方 graph 套件。
- v1 不做跨 repo / 多專案聚合，只針對目前作用中的 workspace。
