export function matchesQuery(commit, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return true;
  const hay = [
    commit.subject,
    commit.authorName,
    commit.hash,
    commit.shortHash,
    ...commit.refs.map((r) => r.name),
  ];
  return hay.some((s) => String(s ?? "").toLowerCase().includes(q));
}

export function tipHashForBranch(commits, branchName) {
  for (const c of commits) {
    if (c.refs.some((r) => r.name === branchName)) return c.hash;
  }
  return null;
}

export function reachableFrom(commits, tipHash) {
  const byHash = new Map(commits.map((c) => [c.hash, c]));
  const keep = new Set();
  const stack = [tipHash];
  while (stack.length) {
    const h = stack.pop();
    if (keep.has(h) || !byHash.has(h)) continue;
    keep.add(h);
    for (const p of byHash.get(h).parents) stack.push(p);
  }
  return commits.filter((c) => keep.has(c.hash));
}
