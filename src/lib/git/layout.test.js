import { describe, it, expect } from "vitest";
import { assignLanes, PALETTE_SIZE } from "@/lib/git/layout";

const c = (hash, parents = []) => ({ hash, parents });

describe("assignLanes", () => {
  it("keeps a linear history in lane 0", () => {
    const { rows, laneCount } = assignLanes([c("A", ["B"]), c("B", ["C"]), c("C", [])]);
    expect(rows.map((r) => r.lane)).toEqual([0, 0, 0]);
    expect(laneCount).toBe(1);
    expect(rows[0].outgoing).toEqual([{ toLane: 0, color: 0 }]);
    expect(rows[2].outgoing).toEqual([]); // root has no parents
  });

  it("gives a second branch tip its own lane and merges into the ancestor", () => {
    // A and B are both children of C; A listed first.
    const { rows, laneCount } = assignLanes([c("A", ["C"]), c("B", ["C"]), c("C", [])]);
    expect(laneCount).toBe(2);
    expect(rows[0].lane).toBe(0);
    expect(rows[1].lane).toBe(1);
    expect(rows[1].color).not.toBe(rows[0].color);
    // C collapses both lanes back in
    expect(rows[2].lane).toBe(0);
    expect(rows[2].incoming.map((e) => e.fromLane).sort()).toEqual([0, 1]);
  });

  it("routes a merge commit's second parent to a new lane", () => {
    // M merges A and B; both descend from C.
    const commits = [c("M", ["A", "B"]), c("A", ["C"]), c("B", ["C"]), c("C", [])];
    const { rows } = assignLanes(commits);
    const m = rows[0];
    expect(m.lane).toBe(0);
    expect(m.outgoing).toHaveLength(2);
    expect(m.outgoing[0].toLane).toBe(0);
    expect(m.outgoing[1].toLane).toBe(1);
    // B passes lane 1 while A sits in lane 0
    const a = rows[1];
    expect(a.passing.some((p) => p.lane === 1)).toBe(true);
  });

  it("caps colors to the palette size", () => {
    const commits = [];
    for (let i = 0; i < PALETTE_SIZE + 3; i++) commits.push(c("t" + i, []));
    const { rows } = assignLanes(commits);
    for (const r of rows) expect(r.color).toBeLessThan(PALETTE_SIZE);
  });
});
