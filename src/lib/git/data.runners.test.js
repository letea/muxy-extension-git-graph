import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadRefs, loadGraph, checkout } from "@/lib/git/data";

const F = "\x1f";
const R = "\x1e";

beforeEach(() => {
  globalThis.muxy = {
    git: {
      repoInfo: vi.fn(async () => ({ root: "/repo", currentBranch: "main" })),
      branches: vi.fn(async () => ["main", "feature/x"]),
      remoteBranches: vi.fn(async () => ["origin/main"]),
    },
    exec: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
  };
});

describe("loadRefs", () => {
  it("aggregates repo root, current, local and remote", async () => {
    const refs = await loadRefs();
    expect(refs).toEqual({
      root: "/repo",
      current: "main",
      local: ["main", "feature/x"],
      remote: ["origin/main"],
    });
  });
});

describe("loadGraph", () => {
  it("runs git log --all with cwd and parses the output", async () => {
    globalThis.muxy.exec = vi.fn(async () => ({
      stdout: `aaa111${F}${F}Ada${F}2026-07-22T10:00:00+08:00${F}${F}Init${R}\n`,
      stderr: "",
      exitCode: 0,
    }));
    const commits = await loadGraph({ maxCount: 50 });
    const [argv, opts] = globalThis.muxy.exec.mock.calls[0];
    expect(argv[0]).toBe("git");
    expect(argv).toContain("--all");
    expect(argv).toContain("--max-count=50");
    expect(opts).toEqual({ cwd: "/repo" });
    expect(commits[0].hash).toBe("aaa111");
  });
});

describe("checkout", () => {
  it("returns ok on exit 0, message on failure", async () => {
    globalThis.muxy.exec = vi.fn(async () => ({ stdout: "", stderr: "boom", exitCode: 1 }));
    const res = await checkout("feature/x");
    expect(res.ok).toBe(false);
    expect(res.message).toBe("boom");
  });
});
