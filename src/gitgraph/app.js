import { clear, h } from "@/lib/dom";
import { icon } from "@/lib/icons";
import { loadRefs, loadGraph, loadCommitDetail, checkout } from "@/lib/git/data";
import { assignLanes } from "@/lib/git/layout";
import { matchesQuery, tipHashForBranch, reachableFrom } from "@/lib/git/filter";
import { renderGraph, LANE_COLORS } from "@/lib/git/render";

const MAX_COUNT = 300;

export class GitGraphApp {
  constructor(root, { compact = false } = {}) {
    this.root = root;
    this.compact = compact;
    this.allCommits = [];
    this.refs = { root: null, current: null, local: [], remote: [] };
    this.branchFilter = "";
    this.query = "";
    this.pairs = [];
    this.maxCount = MAX_COUNT;
    this.reloadToken = 0;
    this.detailToken = 0;
  }

  async start() {
    this.buildChrome();
    this.subscribe();
    await this.reload();
  }

  buildChrome() {
    clear(this.root);
    this.searchInput = h("input", {
      type: "text",
      placeholder: "Search commits…",
      class:
        "min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-[12px] text-foreground outline-none focus:border-primary",
      oninput: () => this.applyQuery(),
    });
    this.branchSelect = h("select", {
      class: "rounded-md border border-border bg-surface px-1 py-1 text-[12px] text-foreground outline-none",
      onchange: (e) => {
        this.branchFilter = e.target.value;
        this.applyView();
      },
    });
    const refreshBtn = h(
      "button",
      { type: "button", class: "flex h-6 w-6 items-center justify-center rounded-md hover:bg-accent", title: "Refresh", onclick: () => this.reload() },
      icon("refresh", 13),
    );
    const header = h(
      "div",
      { class: "flex items-center gap-2 border-b border-border px-2.5 py-2" },
      icon("search", 13, "text-muted-foreground"),
      this.searchInput,
      this.branchSelect,
      refreshBtn,
    );

    this.graphContainer = h("div", { class: "min-h-0 flex-1 overflow-auto" });
    this.detailDrawer = h("div", {
      class: this.compact
        ? "absolute inset-0 z-10 hidden overflow-auto bg-background"
        : "hidden w-[380px] shrink-0 overflow-auto border-l border-border",
    });

    const body = h(
      "div",
      { class: "relative flex min-h-0 flex-1" },
      this.graphContainer,
      this.detailDrawer,
    );
    this.root.appendChild(h("div", { class: "flex h-full flex-col" }, header, body));
  }

  subscribe() {
    muxy.events.subscribe("command.refresh-graph", () => this.reload());
    muxy.events.subscribe("worktree.headChanged", () => this.reload());
    muxy.onThemeChange(() => this.applyView());
  }

  laneColors() {
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--muxy-accent").trim();
    return [accent || LANE_COLORS[0], ...LANE_COLORS.slice(1)];
  }

  async reload() {
    const token = ++this.reloadToken;
    this.showMessage("Loading…");
    try {
      this.refs = await loadRefs();
      if (token !== this.reloadToken) return;
      if (!this.refs.root) return this.showEmpty("Not a git repository");
      const knownRemotes = this.refs.remote.length
        ? [...new Set(this.refs.remote.map((r) => r.split("/")[0]))]
        : ["origin"];
      this.allCommits = await loadGraph({ maxCount: this.maxCount, knownRemotes });
      if (token !== this.reloadToken) return;
      if (this.allCommits.length === 0) return this.showEmpty("No commits yet");
      this.populateBranches();
      this.applyView();
    } catch (err) {
      if (token === this.reloadToken) this.showError(err);
    }
  }

  populateBranches() {
    const opts = [h("option", { value: "" }, "All branches")];
    for (const b of [...this.refs.local, ...this.refs.remote]) {
      opts.push(h("option", { value: b, selected: b === this.branchFilter ? "true" : null }, b));
    }
    clear(this.branchSelect);
    for (const o of opts) this.branchSelect.appendChild(o);
    this.branchSelect.value = this.branchFilter;
  }

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
      onBranch: (name, kind) => this.checkoutBranch(name, kind),
    });
    if (this.allCommits.length >= this.maxCount) {
      this.graphContainer.appendChild(this.truncationFooter());
    }
    this.applyQuery();
  }

  truncationFooter() {
    return h(
      "div",
      {
        class:
          "flex items-center justify-center gap-2 border-b border-border px-2.5 py-2 text-[11px] text-muted-foreground",
      },
      h("span", null, `Showing first ${this.maxCount} commits`),
      h(
        "button",
        {
          type: "button",
          class:
            "rounded-md bg-surface px-2 py-1 text-[11px] text-foreground hover:bg-accent",
          onclick: () => {
            this.maxCount += MAX_COUNT;
            this.reload();
          },
        },
        "Load more",
      ),
    );
  }

  applyQuery() {
    this.query = this.searchInput.value;
    for (const { commit, el } of this.pairs) {
      el.classList.toggle("opacity-40", !matchesQuery(commit, this.query));
    }
  }

  async openDetail(hash) {
    const token = ++this.detailToken;
    this.detailDrawer.classList.remove("hidden");
    clear(this.detailDrawer);
    this.detailDrawer.appendChild(h("div", { class: "p-3 text-[12px] text-muted-foreground" }, "Loading…"));
    try {
      const d = await loadCommitDetail(hash);
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
            h("div", { class: "text-[14px] font-semibold text-foreground" }, d.subject),
            close,
          ),
          h("div", { class: "font-mono text-[11px] text-muted-foreground" }, `${hash.slice(0, 10)} · ${d.authorName} · ${d.authorDate.slice(0, 10)}`),
          d.body ? h("pre", { class: "whitespace-pre-wrap text-[12px] text-foreground" }, d.body) : null,
          h("pre", { class: "overflow-auto rounded-md border border-border bg-surface p-2 font-mono text-[11px] text-foreground" }, d.diff || "(no changes)"),
        ),
      );
    } catch (err) {
      if (token !== this.detailToken) return;
      clear(this.detailDrawer);
      this.detailDrawer.appendChild(h("div", { class: "p-3 text-[12px] text-diff-remove" }, String(err?.message || err)));
    }
  }

  async checkoutBranch(name, kind) {
    const ok = await muxy.dialog.confirm({
      title: "Checkout branch",
      message: `Switch to "${name}"?`,
    });
    if (!ok) return;
    try {
      const res = await checkout(name, kind);
      if (!res.ok) {
        await muxy.dialog.alert({ title: "Checkout failed", message: res.message || "Unknown error" });
        return;
      }
      await this.reload();
    } catch (err) {
      await muxy.dialog.alert({ title: "Checkout failed", message: String(err?.message || err) });
    }
  }

  showMessage(text) {
    clear(this.graphContainer);
    this.graphContainer.appendChild(h("div", { class: "p-4 text-[12px] text-muted-foreground" }, text));
  }

  showEmpty(text) {
    clear(this.graphContainer);
    this.graphContainer.appendChild(
      h("div", { class: "flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground" },
        icon("git-branch", 24),
        h("div", { class: "text-[12px]" }, text),
      ),
    );
  }

  showError(err) {
    clear(this.graphContainer);
    this.graphContainer.appendChild(
      h("div", { class: "flex h-full flex-col items-center justify-center gap-3 p-6 text-center" },
        h("div", { class: "text-[12px] text-diff-remove" }, String(err?.message || err)),
        h("button", { type: "button", class: "rounded-md bg-primary px-3 py-1.5 text-[12px] text-primary-foreground", onclick: () => this.reload() }, "Retry"),
      ),
    );
  }
}
