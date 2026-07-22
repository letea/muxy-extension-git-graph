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
});

it("LOG_FORMAT uses the field and record separators", () => {
  expect(LOG_FORMAT).toContain("%x1f");
  expect(LOG_FORMAT).toContain("%x1e");
});
