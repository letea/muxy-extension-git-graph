// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { assignLanes } from "@/lib/git/layout";
import { renderGraph, graphWidth, laneX } from "@/lib/git/render";

const c = (hash, parents = [], refs = []) => ({
  hash, shortHash: hash.slice(0, 7), parents, refs,
  authorName: "Ada", authorDate: "2026-07-22T10:00:00+08:00", subject: "msg " + hash,
});

describe("geometry", () => {
  it("computes lane x and graph width", () => {
    expect(laneX(0)).toBe(12);
    expect(laneX(1)).toBe(26);
    expect(graphWidth(1)).toBe(24);
    expect(graphWidth(3)).toBe(52);
  });
});

describe("renderGraph", () => {
  it("renders one row per commit with an svg and a branch badge", () => {
    const commits = [c("aaa111", ["bbb222"], [{ name: "main", kind: "branch", head: true }]), c("bbb222", [])];
    const layout = assignLanes(commits);
    const container = document.createElement("div");
    const clicked = [];
    const pairs = renderGraph(container, layout, {
      laneColors: ["#111", "#222", "#333", "#444", "#555", "#666", "#777", "#888"],
      compact: false,
      onCommit: (hash) => clicked.push(hash),
      onBranch: () => {},
    });
    expect(pairs).toHaveLength(2);
    expect(container.querySelectorAll("[data-row]").length).toBe(2);
    expect(container.querySelectorAll("svg").length).toBe(3);
    expect(container.textContent).toContain("main");
    // clicking a row reports its commit
    container.querySelector("[data-row]").click();
    expect(clicked[0]).toBe("aaa111");
  });

  it("gives a detached HEAD badge the same prominent style as an attached HEAD branch", () => {
    const attached = c("aaa111", [], [{ name: "main", kind: "branch", head: true }]);
    const detached = c("bbb222", [], [{ name: "HEAD", kind: "head" }]);
    const layout = assignLanes([attached, detached]);
    const container = document.createElement("div");
    renderGraph(container, layout, {
      laneColors: ["#111", "#222", "#333", "#444", "#555", "#666", "#777", "#888"],
      compact: false,
      onCommit: () => {},
      onBranch: () => {},
    });
    const badges = [...container.querySelectorAll("[data-row] span")];
    const mainBadge = badges.find((b) => b.textContent.includes("main"));
    const headBadge = badges.find((b) => b.textContent.includes("HEAD"));
    expect(mainBadge.className).toContain("bg-primary");
    expect(headBadge.className).toContain("bg-primary");
  });

  it("makes rows keyboard-operable (role, tabindex, Enter/Space triggers onCommit)", () => {
    const commits = [c("aaa111", ["bbb222"], []), c("bbb222", [])];
    const layout = assignLanes(commits);
    const container = document.createElement("div");
    const clicked = [];
    renderGraph(container, layout, {
      laneColors: ["#111", "#222", "#333", "#444", "#555", "#666", "#777", "#888"],
      compact: false,
      onCommit: (hash) => clicked.push(hash),
      onBranch: () => {},
    });
    const row = container.querySelector("[data-row]");
    expect(row.getAttribute("role")).toBe("button");
    expect(row.getAttribute("tabindex")).toBe("0");

    row.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(clicked).toEqual(["aaa111"]);

    row.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(clicked).toEqual(["aaa111", "aaa111"]);

    // an unrelated key must not trigger onCommit
    row.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(clicked).toEqual(["aaa111", "aaa111"]);
  });

  it("colors non-HEAD branch, remote, and tag badges by their commit's lane color", () => {
    // Two independent-root commits land on two different lanes/colors.
    // "origin/other" deliberately doesn't match "main", so branch and remote
    // stay separate badges here (see the merge-specific tests below).
    const commits = [
      c("aaa111", [], [{ name: "v1.0", kind: "tag" }]),
      c("bbb222", [], [{ name: "main", kind: "branch" }, { name: "origin/other", kind: "remote" }]),
      c("ccc333", ["aaa111"], []), // forces aaa111 and bbb222 into distinct lanes
    ];
    const laneColors = ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666", "#777777", "#888888"];
    const layout = assignLanes(commits);
    const container = document.createElement("div");
    renderGraph(container, layout, {
      laneColors,
      compact: false,
      onCommit: () => {},
      onBranch: () => {},
    });
    const badges = [...container.querySelectorAll("[data-row] span")];
    const tagBadge = badges.find((b) => b.textContent.includes("v1.0"));
    const branchBadge = badges.find((b) => b.textContent.includes("main") && !b.textContent.includes("origin"));
    const remoteBadge = badges.find((b) => b.textContent.includes("origin/other"));

    const expectFor = (badge, hash) => {
      const row = layout.rows.find((r) => r.commit.hash === hash);
      const expectedHex = laneColors[row.color % laneColors.length];
      const probe = document.createElement("div");
      probe.style.backgroundColor = expectedHex;
      expect(badge.style.backgroundColor).toBe(probe.style.backgroundColor);
      expect(badge.className).not.toContain("bg-accent");
    };
    expectFor(tagBadge, "aaa111");
    expectFor(branchBadge, "bbb222");
    expectFor(remoteBadge, "bbb222");
  });

  it("orders badges branch, then remote, then tag regardless of input order", () => {
    const commits = [
      c("aaa111", [], [
        { name: "v1.0", kind: "tag" },
        { name: "origin/main", kind: "remote" },
        { name: "feature", kind: "branch" },
      ]),
    ];
    const layout = assignLanes(commits);
    const container = document.createElement("div");
    renderGraph(container, layout, {
      laneColors: ["#111", "#222", "#333", "#444", "#555", "#666", "#777", "#888"],
      compact: false,
      onCommit: () => {},
      onBranch: () => {},
    });
    const badgeTexts = [...container.querySelectorAll("[data-row] span")]
      .filter((s) => s.querySelector("svg"))
      .map((b) => b.textContent);
    expect(badgeTexts).toEqual(["feature", "origin/main", "v1.0"]);
  });

  it("keeps a HEAD branch first among branches, preserving decoration order within each tier", () => {
    // Mirrors git's "HEAD -> main, origin/main, tag: v1.0, feature/x" decoration
    // order. main/origin/main are a matching pair, so they merge into one badge
    // (see the merge-specific tests below) — feature/x has no remote and stays
    // its own badge, still sorted into the same branch tier, after the merged one.
    const commits = [
      c("aaa111", [], [
        { name: "main", kind: "branch", head: true },
        { name: "origin/main", kind: "remote" },
        { name: "v1.0", kind: "tag" },
        { name: "feature/x", kind: "branch" },
      ]),
    ];
    const layout = assignLanes(commits);
    const container = document.createElement("div");
    renderGraph(container, layout, {
      laneColors: ["#111", "#222", "#333", "#444", "#555", "#666", "#777", "#888"],
      compact: false,
      onCommit: () => {},
      onBranch: () => {},
    });
    const badgeTexts = [...container.querySelectorAll("[data-row] span")]
      .filter((s) => s.querySelector("svg"))
      .map((b) => b.textContent);
    expect(badgeTexts).toEqual(["main | origin", "feature/x", "v1.0"]);
  });

  it("merges a local branch with its matching remote into one badge", () => {
    const commits = [
      c("aaa111", [], [
        { name: "3.0.146", kind: "branch" },
        { name: "origin/3.0.146", kind: "remote" },
      ]),
    ];
    const layout = assignLanes(commits);
    const container = document.createElement("div");
    const branchCalls = [];
    renderGraph(container, layout, {
      laneColors: ["#111", "#222", "#333", "#444", "#555", "#666", "#777", "#888"],
      compact: false,
      onCommit: () => {},
      onBranch: (name, kind) => branchCalls.push({ name, kind }),
    });
    const badges = [...container.querySelectorAll("[data-row] span")].filter((s) => s.querySelector("svg"));
    expect(badges).toHaveLength(1);
    expect(badges[0].textContent).toBe("3.0.146 | origin");
    badges[0].click();
    // checkout must target the local branch name, not the merged label
    expect(branchCalls).toEqual([{ name: "3.0.146", kind: "branch" }]);
  });

  it("merges multiple remotes tracking the same local branch", () => {
    const commits = [
      c("aaa111", [], [
        { name: "main", kind: "branch" },
        { name: "origin/main", kind: "remote" },
        { name: "upstream/main", kind: "remote" },
      ]),
    ];
    const layout = assignLanes(commits);
    const container = document.createElement("div");
    renderGraph(container, layout, {
      laneColors: ["#111", "#222", "#333", "#444", "#555", "#666", "#777", "#888"],
      compact: false,
      onCommit: () => {},
      onBranch: () => {},
    });
    const badges = [...container.querySelectorAll("[data-row] span")].filter((s) => s.querySelector("svg"));
    expect(badges).toHaveLength(1);
    expect(badges[0].textContent).toBe("main | origin, upstream");
  });

  it("leaves an unmatched local branch or remote as its own badge", () => {
    const commits = [
      c("aaa111", [], [{ name: "main", kind: "branch" }]),
      c("bbb222", [], [{ name: "origin/develop", kind: "remote" }]),
    ];
    const layout = assignLanes(commits);
    const container = document.createElement("div");
    const branchCalls = [];
    renderGraph(container, layout, {
      laneColors: ["#111", "#222", "#333", "#444", "#555", "#666", "#777", "#888"],
      compact: false,
      onCommit: () => {},
      onBranch: (name, kind) => branchCalls.push({ name, kind }),
    });
    const badges = [...container.querySelectorAll("[data-row] span")].filter((s) => s.querySelector("svg"));
    expect(badges.map((b) => b.textContent)).toEqual(["main", "origin/develop"]);
    badges[1].click();
    expect(branchCalls).toEqual([{ name: "origin/develop", kind: "remote" }]);
  });

  it("keeps HEAD prominence and branch sort tier on a merged badge, alongside a tag", () => {
    const commits = [
      c("aaa111", [], [
        { name: "v1.0", kind: "tag" },
        { name: "origin/main", kind: "remote" },
        { name: "main", kind: "branch", head: true },
      ]),
    ];
    const layout = assignLanes(commits);
    const container = document.createElement("div");
    renderGraph(container, layout, {
      laneColors: ["#111", "#222", "#333", "#444", "#555", "#666", "#777", "#888"],
      compact: false,
      onCommit: () => {},
      onBranch: () => {},
    });
    const badges = [...container.querySelectorAll("[data-row] span")].filter((s) => s.querySelector("svg"));
    expect(badges.map((b) => b.textContent)).toEqual(["main | origin", "v1.0"]);
    expect(badges[0].className).toContain("bg-primary");
  });

  it("clicking a branch badge fires onBranch with name and kind, not onCommit", () => {
    const commits = [c("aaa111", ["bbb222"], [{ name: "main", kind: "branch", head: true }]), c("bbb222", [])];
    const layout = assignLanes(commits);
    const container = document.createElement("div");
    const branchCalls = [];
    const commitCalls = [];
    renderGraph(container, layout, {
      laneColors: ["#111", "#222", "#333", "#444", "#555", "#666", "#777", "#888"],
      compact: false,
      onCommit: (hash) => commitCalls.push(hash),
      onBranch: (name, kind) => branchCalls.push({ name, kind }),
    });
    // find the branch badge span and click it
    const badge = container.querySelector("[data-row] span");
    badge.click();
    // onBranch should be called with ref name and kind
    expect(branchCalls).toEqual([{ name: "main", kind: "branch" }]);
    // onCommit should NOT be called (stopPropagation prevents it)
    expect(commitCalls).toEqual([]);
  });

  it("clicking a tag badge fires onBranch with name and kind, not onCommit", () => {
    const commits = [c("aaa111", ["bbb222"], [{ name: "v1.0", kind: "tag" }]), c("bbb222", [])];
    const layout = assignLanes(commits);
    const container = document.createElement("div");
    const branchCalls = [];
    const commitCalls = [];
    renderGraph(container, layout, {
      laneColors: ["#111", "#222", "#333", "#444", "#555", "#666", "#777", "#888"],
      compact: false,
      onCommit: (hash) => commitCalls.push(hash),
      onBranch: (name, kind) => branchCalls.push({ name, kind }),
    });
    const badge = container.querySelector("[data-row] span");
    badge.click();
    expect(branchCalls).toEqual([{ name: "v1.0", kind: "tag" }]);
    expect(commitCalls).toEqual([]);
  });
});
