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
});
