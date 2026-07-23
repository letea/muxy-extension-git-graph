# Uncommitted Changes Row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a gray synthetic row at the top of the commit graph reading `Uncommitted Changes (X)` whenever tracked files have staged/unstaged changes, with a gray line down into HEAD's lane; clicking it shows the changed-file list and diff.

**Architecture:** Two new pure data-loading functions in `data.js` (status count + diff text), a synthetic row object spliced into `layout.rows` by `app.js` (not by `assignLanes`), a render branch in `render.js` for that row shape, and a new drawer-rendering path in `app.js` parallel to the existing commit-detail drawer.

**Tech Stack:** Vanilla JS, Vitest (`describe/it/expect`, `jsdom` environment via `@vitest-environment jsdom` for DOM tests), existing `h`/`clear` dom helpers, `muxy.exec`/`muxy.git` global API (mocked in tests via `globalThis.muxy`).

## Global Constraints

- `X` counts only tracked files with staged and/or unstaged changes (`git diff --name-only HEAD`); untracked files are excluded.
- Gray color for the synthetic row reuses the existing palette gray `#8aa0b0` (`LANE_COLORS[7]` in `render.js`) — no new color constant.
- No new `muxy.events` subscription — the synthetic row recomputes on every existing `reload()` call.
- Follow existing file boundaries: parsing/pure logic in `data.js`, lane/row shape in `layout.js`-adjacent app logic, drawing in `render.js`, orchestration in `app.js`.

---

### Task 1: Data layer — `loadUncommittedStatus` and `loadUncommittedDiff`

**Files:**
- Modify: `src/lib/git/data.js`
- Test: `src/lib/git/data.runners.test.js`

**Interfaces:**
- Consumes: existing `repoRoot()` (private to `data.js`, already used by `loadGraph` etc.) and `muxy.exec`.
- Produces:
  - `loadUncommittedStatus(): Promise<{ count: number, files: string[] }>`
  - `loadUncommittedDiff(): Promise<string>`
  - Both exported from `@/lib/git/data`, both used by `app.js` in Task 3.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/git/data.runners.test.js` (after the existing `checkout` describe block):

```js
describe("loadUncommittedStatus", () => {
  it("runs git diff --name-only HEAD and counts files", async () => {
    globalThis.muxy.exec = vi.fn(async () => ({
      stdout: "src/a.js\nsrc/b.js\n",
      stderr: "",
      exitCode: 0,
    }));
    const status = await loadUncommittedStatus();
    const [argv, opts] = globalThis.muxy.exec.mock.calls[0];
    expect(argv).toEqual(["git", "diff", "--name-only", "HEAD"]);
    expect(opts).toEqual({ cwd: "/repo" });
    expect(status).toEqual({ count: 2, files: ["src/a.js", "src/b.js"] });
  });

  it("returns count 0 for a clean working tree", async () => {
    globalThis.muxy.exec = vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 }));
    expect(await loadUncommittedStatus()).toEqual({ count: 0, files: [] });
  });

  it("tolerates exec rejection (e.g. no HEAD yet)", async () => {
    globalThis.muxy.exec = vi.fn(async () => {
      throw new Error("fatal: bad revision 'HEAD'");
    });
    expect(await loadUncommittedStatus()).toEqual({ count: 0, files: [] });
  });
});

describe("loadUncommittedDiff", () => {
  it("runs git diff HEAD --no-color and returns raw stdout", async () => {
    globalThis.muxy.exec = vi.fn(async () => ({
      stdout: "diff --git a/x.js b/x.js\n@@ -1 +1 @@\n-old\n+new\n",
      stderr: "",
      exitCode: 0,
    }));
    const diff = await loadUncommittedDiff();
    const [argv, opts] = globalThis.muxy.exec.mock.calls[0];
    expect(argv).toEqual(["git", "diff", "HEAD", "--no-color"]);
    expect(opts).toEqual({ cwd: "/repo" });
    expect(diff).toContain("diff --git a/x.js");
  });

  it("returns empty string on exec rejection", async () => {
    globalThis.muxy.exec = vi.fn(async () => {
      throw new Error("fatal: bad revision 'HEAD'");
    });
    expect(await loadUncommittedDiff()).toBe("");
  });
});
```

Update the top import line of `src/lib/git/data.runners.test.js` to:

```js
import { loadRefs, loadGraph, loadRemoteNames, checkout, loadUncommittedStatus, loadUncommittedDiff } from "@/lib/git/data";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/git/data.runners.test.js`
Expected: FAIL — `loadUncommittedStatus is not a function` / `loadUncommittedDiff is not a function`

- [ ] **Step 3: Implement in `src/lib/git/data.js`**

Add after the `checkout` function at the end of the file:

```js
export async function loadUncommittedStatus() {
  const cwd = await repoRoot();
  try {
    const { stdout } = await muxy.exec(["git", "diff", "--name-only", "HEAD"], { cwd });
    const files = (stdout || "").split("\n").map((s) => s.trim()).filter(Boolean);
    return { count: files.length, files };
  } catch {
    return { count: 0, files: [] };
  }
}

export async function loadUncommittedDiff() {
  const cwd = await repoRoot();
  try {
    const { stdout } = await muxy.exec(["git", "diff", "HEAD", "--no-color"], { cwd });
    return stdout || "";
  } catch {
    return "";
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/git/data.runners.test.js`
Expected: PASS (all tests including the new ones)

- [ ] **Step 5: Commit**

```bash
git add src/lib/git/data.js src/lib/git/data.runners.test.js
git commit -m "feat: load uncommitted status and diff from git"
```

---

### Task 2: Render — synthetic uncommitted row

**Files:**
- Modify: `src/lib/git/render.js`
- Test: `src/lib/git/render.dom.test.js`

**Interfaces:**
- Consumes: nothing new from other files; operates on a plain row object.
- Produces: `renderRow`/`graphCell` branch on `row.isUncommitted === true`. The expected shape of such a row (used by `app.js` in Task 3):
  ```js
  {
    isUncommitted: true,
    count: number,
    lane: number,        // HEAD's lane index
    incoming: [],
    outgoing: [{ toLane: number }],  // omit or [] if HEAD lane unknown
    passing: [],
  }
  ```
  `ctx.onUncommittedClick: () => void` — new required context field for `renderGraph`/`renderRow` when a synthetic row is present (existing `onCommit`/`onBranch` stay as-is for normal rows).

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/git/render.dom.test.js`, inside the `describe("renderGraph", ...)` block (append as new `it` blocks before the closing `});` of that describe):

```js
  it("renders a synthetic uncommitted row in gray with the count text, and wires its click handler", () => {
    const commits = [c("aaa111", [], [{ name: "main", kind: "branch", head: true }])];
    const layout = assignLanes(commits);
    const uncommittedRow = {
      isUncommitted: true,
      count: 3,
      lane: layout.rows[0].lane,
      incoming: [],
      outgoing: [{ toLane: layout.rows[0].lane }],
      passing: [],
    };
    layout.rows.unshift(uncommittedRow);
    const container = document.createElement("div");
    const uncommittedClicks = [];
    const commitClicks = [];
    renderGraph(container, layout, {
      laneColors: ["#111", "#222", "#333", "#444", "#555", "#666", "#777", "#888"],
      compact: false,
      onCommit: (hash) => commitClicks.push(hash),
      onBranch: () => {},
      onUncommittedClick: () => uncommittedClicks.push(true),
    });
    const rows = container.querySelectorAll("[data-row], [data-uncommitted-row]");
    expect(rows).toHaveLength(2);
    const topRow = container.querySelector("[data-uncommitted-row]");
    expect(topRow.textContent).toContain("Uncommitted Changes (3)");
    topRow.click();
    expect(uncommittedClicks).toEqual([true]);
    expect(commitClicks).toEqual([]);
  });

  it("draws the uncommitted row's line and dot in the muted gray palette color", () => {
    const commits = [c("aaa111", [], [])];
    const layout = assignLanes(commits);
    const uncommittedRow = {
      isUncommitted: true,
      count: 1,
      lane: 0,
      incoming: [],
      outgoing: [{ toLane: 0 }],
      passing: [],
    };
    layout.rows.unshift(uncommittedRow);
    const container = document.createElement("div");
    const laneColors = ["#111", "#222", "#333", "#444", "#555", "#666", "#777", "#888"];
    renderGraph(container, layout, {
      laneColors,
      compact: false,
      onCommit: () => {},
      onBranch: () => {},
      onUncommittedClick: () => {},
    });
    const topRow = container.querySelector("[data-uncommitted-row]");
    const svg = topRow.querySelector("svg");
    const path = svg.querySelector("path");
    const circle = svg.querySelector("circle");
    expect(path.getAttribute("stroke")).toBe("#8aa0b0");
    expect(circle.getAttribute("fill")).toBe("#8aa0b0");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/git/render.dom.test.js`
Expected: FAIL — no `[data-uncommitted-row]` element exists yet, text doesn't match.

- [ ] **Step 3: Implement in `src/lib/git/render.js`**

Add a constant near the top, after `LANE_COLORS`:

```js
export const UNCOMMITTED_GRAY = "#8aa0b0";
```

Add a new function above `graphCell` (after `isHeadCommit`):

```js
function uncommittedGraphCell(row, laneCount, rowH, gap) {
  const width = graphWidth(laneCount, gap);
  const svg = svgEl("svg", { width, height: rowH, viewBox: `0 0 ${width} ${rowH}` });
  const mid = rowH / 2;
  const nx = laneX(row.lane, gap);

  for (const e of row.outgoing) {
    const x = laneX(e.toLane, gap);
    const d = `M ${nx} ${mid} C ${nx} ${mid}, ${x} ${mid}, ${x} ${rowH}`;
    svg.appendChild(svgEl("path", { d, fill: "none", stroke: UNCOMMITTED_GRAY, "stroke-width": 1.5 }));
  }
  svg.appendChild(svgEl("circle", { cx: nx, cy: mid, r: DOT_R, fill: UNCOMMITTED_GRAY }));
  return svg;
}

function renderUncommittedRow(row, laneCount, ctx) {
  const rowH = ctx.compact ? ROW_H_COMPACT : ROW_H;
  const gap = LANE_GAP;
  const info = h(
    "div",
    { class: "flex min-w-0 flex-1 items-center gap-2 px-2" },
    h("span", { class: "truncate text-[12px] font-medium text-muted-foreground" }, `Uncommitted Changes (${row.count})`),
  );
  const el = h(
    "div",
    {
      "data-uncommitted-row": "true",
      role: "button",
      tabindex: 0,
      class: "flex cursor-pointer items-stretch border-b border-border hover:bg-accent",
      style: `height:${rowH}px`,
    },
    uncommittedGraphCell(row, laneCount, rowH, gap),
    info,
  );
  el.addEventListener("click", () => ctx.onUncommittedClick());
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      ctx.onUncommittedClick();
    }
  });
  return el;
}
```

Modify `renderGraph` to branch per row:

```js
export function renderGraph(container, layout, ctx) {
  clear(container);
  const pairs = [];
  for (const row of layout.rows) {
    if (row.isUncommitted) {
      container.appendChild(renderUncommittedRow(row, layout.laneCount, ctx));
      continue;
    }
    const el = renderRow(row, layout.laneCount, ctx);
    container.appendChild(el);
    pairs.push({ commit: row.commit, el });
  }
  return pairs;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/git/render.dom.test.js`
Expected: PASS (all tests including the two new ones)

- [ ] **Step 5: Commit**

```bash
git add src/lib/git/render.js src/lib/git/render.dom.test.js
git commit -m "feat: render a gray synthetic row for uncommitted changes"
```

---

### Task 3: Wire uncommitted status into `GitGraphApp`

**Files:**
- Modify: `src/gitgraph/app.js`

**Interfaces:**
- Consumes: `loadUncommittedStatus`, `loadUncommittedDiff` from Task 1 (`@/lib/git/data`); `renderGraph`'s new `ctx.onUncommittedClick` and the synthetic row shape from Task 2.
- Produces: no new public interface — this is the top-level app; manual verification only (existing test suite covers `data.js`/`render.js`, `app.js` has no dedicated test file today, consistent with current repo state).

- [ ] **Step 1: Import the new data functions**

In `src/gitgraph/app.js`, change the import line:

```js
import { loadRefs, loadGraph, loadRemoteNames, loadCommitDetail, checkout } from "@/lib/git/data";
```

to:

```js
import { loadRefs, loadGraph, loadRemoteNames, loadCommitDetail, checkout, loadUncommittedStatus, loadUncommittedDiff } from "@/lib/git/data";
```

- [ ] **Step 2: Add a helper to find HEAD's lane and build the synthetic row**

Add this method to the `GitGraphApp` class, right after `applyView()`:

```js
  headLaneFor(layout) {
    const headRow = layout.rows.find(
      (r) => !r.isUncommitted && r.commit.refs.some((ref) => ref.head === true || ref.kind === "head"),
    );
    return headRow ? headRow.lane : null;
  }
```

- [ ] **Step 3: Fetch uncommitted status and splice in the row inside `applyView`**

Modify `applyView()` (currently at `src/gitgraph/app.js:117-134`) from:

```js
  applyView() {
    let commits = this.allCommits;
    if (this.branchFilter) {
      const tip = tipHashForBranch(this.allCommits, this.branchFilter);
      commits = tip ? reachableFrom(this.allCommits, tip) : this.allCommits;
    }
    const layout = assignLanes(commits);
    this.pairs = renderGraph(this.graphContainer, layout, {
      laneColors: this.laneColors(),
      compact: this.compact,
      onCommit: (hash) => this.openDetail(hash),
      onBranch: (name, kind) => this.checkoutRef(name, kind),
    });
    if (this.allCommits.length >= this.maxCount) {
      this.graphContainer.appendChild(this.truncationFooter());
    }
    this.applyQuery();
  }
```

to:

```js
  applyView() {
    let commits = this.allCommits;
    if (this.branchFilter) {
      const tip = tipHashForBranch(this.allCommits, this.branchFilter);
      commits = tip ? reachableFrom(this.allCommits, tip) : this.allCommits;
    }
    const layout = assignLanes(commits);
    if (this.uncommittedCount > 0) {
      const headLane = this.headLaneFor(layout);
      layout.rows.unshift({
        isUncommitted: true,
        count: this.uncommittedCount,
        lane: headLane ?? 0,
        incoming: [],
        outgoing: headLane === null ? [] : [{ toLane: headLane }],
        passing: [],
      });
    }
    this.pairs = renderGraph(this.graphContainer, layout, {
      laneColors: this.laneColors(),
      compact: this.compact,
      onCommit: (hash) => this.openDetail(hash),
      onBranch: (name, kind) => this.checkoutRef(name, kind),
      onUncommittedClick: () => this.openUncommittedDetail(),
    });
    if (this.allCommits.length >= this.maxCount) {
      this.graphContainer.appendChild(this.truncationFooter());
    }
    this.applyQuery();
  }
```

- [ ] **Step 4: Fetch `uncommittedCount` during `reload()`**

Modify `reload()` (currently at `src/gitgraph/app.js:87-105`). Change:

```js
      this.allCommits = await loadGraph({ maxCount: this.maxCount, knownRemotes });
      if (token !== this.reloadToken) return;
      if (this.allCommits.length === 0) return this.showEmpty("No commits yet");
      this.populateBranches();
      this.applyView();
```

to:

```js
      this.allCommits = await loadGraph({ maxCount: this.maxCount, knownRemotes });
      if (token !== this.reloadToken) return;
      if (this.allCommits.length === 0) return this.showEmpty("No commits yet");
      const { count } = await loadUncommittedStatus();
      if (token !== this.reloadToken) return;
      this.uncommittedCount = count;
      this.populateBranches();
      this.applyView();
```

Also initialize the field in the constructor. Change (in `constructor`, currently `src/gitgraph/app.js:11-22`):

```js
    this.maxCount = MAX_COUNT;
    this.reloadToken = 0;
    this.detailToken = 0;
```

to:

```js
    this.maxCount = MAX_COUNT;
    this.uncommittedCount = 0;
    this.reloadToken = 0;
    this.detailToken = 0;
```

- [ ] **Step 5: Add `openUncommittedDetail()` to show the file list and diff**

Add this method right after `openDetail()` (after its closing brace, currently ending at `src/gitgraph/app.js:203`):

```js
  async openUncommittedDetail() {
    const token = ++this.detailToken;
    this.detailDrawer.classList.remove("hidden");
    clear(this.detailDrawer);
    this.detailDrawer.appendChild(h("div", { class: "p-3 text-[12px] text-muted-foreground" }, "Loading…"));
    try {
      const [{ count, files }, diff] = await Promise.all([loadUncommittedStatus(), loadUncommittedDiff()]);
      if (token !== this.detailToken) return;
      clear(this.detailDrawer);
      const close = h(
        "button",
        { type: "button", class: "flex h-6 w-6 items-center justify-center rounded-md hover:bg-accent", title: "Close", onclick: () => this.detailDrawer.classList.add("hidden") },
        icon("close", 13),
      );
      this.detailDrawer.appendChild(
        h(
          "div",
          { class: "flex flex-col gap-2 p-3" },
          h("div", { class: "flex items-start justify-between gap-2" },
            h("div", { class: "text-[14px] font-semibold text-foreground" }, `Uncommitted Changes (${count})`),
            close,
          ),
          h(
            "ul",
            { class: "flex flex-col gap-0.5 font-mono text-[11px] text-muted-foreground" },
            ...files.map((f) => h("li", null, f)),
          ),
          h("pre", { class: "overflow-auto rounded-md border border-border bg-surface p-2 font-mono text-[11px] text-foreground" }, diff || "(no changes)"),
        ),
      );
    } catch (err) {
      if (token !== this.detailToken) return;
      clear(this.detailDrawer);
      this.detailDrawer.appendChild(h("div", { class: "p-3 text-[12px] text-diff-remove" }, String(err?.message || err)));
    }
  }
```

- [ ] **Step 6: Run the full test suite to confirm no regressions**

Run: `npx vitest run`
Expected: PASS — all existing suites (`data.test.js`, `data.runners.test.js`, `layout.test.js`, `render.dom.test.js`, `filter.test.js`) plus the Task 1/2 additions stay green. `app.js` has no dedicated automated test, so this step is the regression gate for it.

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, open the panel against a repo with uncommitted changes to a tracked file (e.g. edit any file in this repo without committing).
Expected:
- A gray row reading `Uncommitted Changes (N)` appears at the very top of the graph, with a gray line running down into the lane of the checked-out commit (the one with the ring marker).
- Clicking the row opens the right-hand drawer showing the changed file list and the diff.
- Committing the change (or `git checkout -- .`) and clicking Refresh makes the row disappear.

- [ ] **Step 8: Commit**

```bash
git add src/gitgraph/app.js
git commit -m "feat: show uncommitted changes as a row atop the graph"
```

---

## Self-Review Notes

- Spec coverage: data layer (Task 1), synthetic row layout/render (Task 2), app wiring + click-to-detail behavior (Task 3) all covered. HEAD-not-in-window degenerate case handled via `headLane ?? 0` with empty `outgoing` when null.
- Placeholder scan: none — all steps have complete code.
- Type consistency: `loadUncommittedStatus()` returns `{ count, files }` consistently used in Task 3's `reload()` (destructures `count`) and `openUncommittedDetail()` (destructures `count, files`). `onUncommittedClick` name matches between Task 2's `render.js` and Task 3's `app.js` usage.
