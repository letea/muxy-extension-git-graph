import { describe, it, expect } from "vitest";
import { parseRefs, parseGitLog, parseCommitShow, LOG_FORMAT } from "@/lib/git/data";

const F = "\x1f";
const R = "\x1e";

describe("parseRefs", () => {
  it("parses head, branch, remote, tag", () => {
    const refs = parseRefs("HEAD -> main, origin/main, tag: v1.0, feature/x");
    expect(refs).toEqual([
      { name: "main", kind: "branch", head: true },
      { name: "origin/main", kind: "remote" },
      { name: "v1.0", kind: "tag" },
      { name: "feature/x", kind: "branch" },
    ]);
  });

  it("handles detached HEAD and empty", () => {
    expect(parseRefs("HEAD")).toEqual([{ name: "HEAD", kind: "head" }]);
    expect(parseRefs("")).toEqual([]);
  });

  it("treats slash tokens with unknown first segment as branches", () => {
    const refs = parseRefs("feature/x");
    expect(refs).toEqual([{ name: "feature/x", kind: "branch" }]);
  });

  it("recognizes origin as a remote by default", () => {
    const refs = parseRefs("origin/main");
    expect(refs).toEqual([{ name: "origin/main", kind: "remote" }]);
  });

  it("uses caller-supplied remotes list", () => {
    const refs = parseRefs("teamfork/main", ["teamfork"]);
    expect(refs).toEqual([{ name: "teamfork/main", kind: "remote" }]);
  });
});

describe("parseGitLog", () => {
  it("parses fields, parents, refs and skips blanks", () => {
    const stdout =
      `aaa111${F}bbb222 ccc333${F}Ada${F}2026-07-22T10:00:00+08:00${F}HEAD -> main${F}Merge stuff${R}\n` +
      `bbb222${F}${F}Bo${F}2026-07-21T09:00:00+08:00${F}${F}Root commit${R}\n`;
    const commits = parseGitLog(stdout);
    expect(commits).toHaveLength(2);
    expect(commits[0]).toEqual({
      hash: "aaa111",
      shortHash: "aaa111",
      parents: ["bbb222", "ccc333"],
      refs: [{ name: "main", kind: "branch", head: true }],
      authorName: "Ada",
      authorDate: "2026-07-22T10:00:00+08:00",
      subject: "Merge stuff",
    });
    expect(commits[1].parents).toEqual([]);
    expect(commits[1].refs).toEqual([]);
  });

  it("returns [] for empty output", () => {
    expect(parseGitLog("")).toEqual([]);
  });

  it("threads knownRemotes to parseRefs", () => {
    const stdout = `aaa111${F}${F}Ada${F}2026-07-22T10:00:00+08:00${F}upstream/main${F}Some commit${R}\n`;
    const commits = parseGitLog(stdout, ["upstream"]);
    expect(commits[0].refs).toEqual([{ name: "upstream/main", kind: "remote" }]);

    const defaultCommits = parseGitLog(stdout);
    expect(defaultCommits[0].refs).toEqual([{ name: "upstream/main", kind: "branch" }]);
  });
});

describe("parseCommitShow", () => {
  it("splits header fields from the diff", () => {
    const stdout =
      `Ada${F}2026-07-22T10:00:00+08:00${F}Fix bug${F}Body line 1\nBody line 2${R}\n` +
      `diff --git a/x.js b/x.js\n@@ -1 +1 @@\n-old\n+new\n`;
    const d = parseCommitShow(stdout);
    expect(d.authorName).toBe("Ada");
    expect(d.subject).toBe("Fix bug");
    expect(d.body).toBe("Body line 1\nBody line 2");
    expect(d.diff).toContain("diff --git a/x.js");
  });

  it("returns empty diff when no record separator present", () => {
    const stdout = `Ada${F}2026-07-22T10:00:00+08:00${F}Subject only${F}`;
    const d = parseCommitShow(stdout);
    expect(d.authorName).toBe("Ada");
    expect(d.diff).toBe("");
  });
});

it("LOG_FORMAT uses the field and record separators", () => {
  expect(LOG_FORMAT).toContain("%x1f");
  expect(LOG_FORMAT).toContain("%x1e");
});
