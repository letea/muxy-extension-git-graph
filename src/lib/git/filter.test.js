import { describe, it, expect } from "vitest";
import { matchesQuery, tipHashForBranch, reachableFrom } from "@/lib/git/filter";

const commit = (over) => ({
  hash: "aaaaaaa", shortHash: "aaaaaaa", parents: [], refs: [],
  authorName: "Ada", authorDate: "", subject: "Fix login", ...over,
});

describe("matchesQuery", () => {
  it("matches subject, author and hash case-insensitively", () => {
    const c = commit({});
    expect(matchesQuery(c, "")).toBe(true);
    expect(matchesQuery(c, "LOGIN")).toBe(true);
    expect(matchesQuery(c, "ada")).toBe(true);
    expect(matchesQuery(c, "aaaa")).toBe(true);
    expect(matchesQuery(c, "zzz")).toBe(false);
  });
  it("matches ref names", () => {
    const c = commit({ refs: [{ name: "feature/x", kind: "branch" }] });
    expect(matchesQuery(c, "feature")).toBe(true);
  });
});

describe("tipHashForBranch / reachableFrom", () => {
  const commits = [
    { hash: "A", parents: ["B"], refs: [{ name: "main", kind: "branch" }] },
    { hash: "B", parents: ["C"], refs: [] },
    { hash: "C", parents: [], refs: [] },
    { hash: "X", parents: ["C"], refs: [{ name: "feature", kind: "branch" }] },
  ];
  it("finds the tip commit for a branch", () => {
    expect(tipHashForBranch(commits, "main")).toBe("A");
    expect(tipHashForBranch(commits, "nope")).toBe(null);
  });
  it("returns only ancestors of the tip in original order", () => {
    expect(reachableFrom(commits, "A").map((c) => c.hash)).toEqual(["A", "B", "C"]);
    expect(reachableFrom(commits, "X").map((c) => c.hash)).toEqual(["C", "X"]);
  });
});
