import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadRefs, loadGraph, loadRemoteNames, checkout, loadUncommittedStatus, loadUncommittedDiff } from "@/lib/git/data";

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

  it("tolerates remoteBranches rejection (no origin remote)", async () => {
    globalThis.muxy.git.remoteBranches = vi.fn(async () => {
      throw new Error("fatal: 'origin' does not appear to be a git repository");
    });
    const refs = await loadRefs();
    expect(refs).toEqual({
      root: "/repo",
      current: "main",
      local: ["main", "feature/x"],
      remote: [],
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

describe("loadRemoteNames", () => {
  it("runs `git remote` and parses one name per line", async () => {
    globalThis.muxy.exec = vi.fn(async () => ({ stdout: "origin\nupstream\n", stderr: "", exitCode: 0 }));
    const names = await loadRemoteNames();
    const [argv, opts] = globalThis.muxy.exec.mock.calls[0];
    expect(argv).toEqual(["git", "remote"]);
    expect(opts).toEqual({ cwd: "/repo" });
    expect(names).toEqual(["origin", "upstream"]);
  });

  it("returns [] for a repo with no remotes", async () => {
    globalThis.muxy.exec = vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 }));
    expect(await loadRemoteNames()).toEqual([]);
  });

  it("tolerates exec rejection", async () => {
    globalThis.muxy.exec = vi.fn(async () => {
      throw new Error("boom");
    });
    expect(await loadRemoteNames()).toEqual([]);
  });
});

describe("checkout", () => {
  it("preserves slashes in local branch names", async () => {
    const res = await checkout("feature/x", "branch");
    const argv = globalThis.muxy.exec.mock.calls[0][0];
    expect(argv).toEqual(["git", "checkout", "feature/x"]);
    expect(res.ok).toBe(true);
  });

  it("strips remote prefix from remote refs", async () => {
    const res = await checkout("origin/main", "remote");
    const argv = globalThis.muxy.exec.mock.calls[0][0];
    expect(argv).toEqual(["git", "checkout", "main"]);
    expect(res.ok).toBe(true);
  });

  it("maps non-zero exitCode to ok:false with stderr message", async () => {
    globalThis.muxy.exec = vi.fn(async () => ({ stdout: "", stderr: "boom", exitCode: 1 }));
    const res = await checkout("some-ref", "branch");
    expect(res.ok).toBe(false);
    expect(res.message).toBe("boom");
  });
});

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
