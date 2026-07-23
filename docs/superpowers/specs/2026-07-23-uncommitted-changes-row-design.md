# Uncommitted Changes Row — Design

## Problem

The graph currently only shows committed history. When the working tree has
uncommitted changes, there's no indication of that in the graph, so users
can't see at a glance that HEAD isn't a clean checkout.

## Goal

When the working tree has uncommitted changes to tracked files, show a gray
synthetic row at the very top of the graph reading `Uncommitted Changes (X)`,
with a gray line connecting down into HEAD's lane. Clicking the row shows the
list of changed files and their diff.

## Scope of "X"

`X` counts tracked files with staged and/or unstaged modifications — i.e.
`git diff --name-only HEAD`. Untracked (new, unadded) files are **not**
counted or included.

## Data layer (`src/lib/git/data.js`)

- `loadUncommittedStatus(cwd)` — runs `git diff --name-only HEAD`, splits
  stdout into a file list, returns `{ count, files }`. If `HEAD` doesn't
  exist yet (brand-new repo, no commits), or the command errors, return
  `{ count: 0, files: [] }`.
- `loadUncommittedDiff(cwd)` — runs `git diff HEAD --no-color`, returns the
  raw diff text (empty string on error/no HEAD).

Both take `cwd` the same way existing functions resolve it via
`repoRoot()`.

## Layout (`src/lib/git/layout.js`)

`assignLanes` gains an optional third concern: the caller (app.js) computes
uncommitted status separately and, if `count > 0`, prepends a synthetic row
to `layout.rows` after calling `assignLanes` on the real commits:

```js
{
  isUncommitted: true,
  count,
  lane: <lane of current HEAD commit>,
  color: null,               // signals "render gray, not palette color"
  incoming: [],
  outgoing: [{ toLane: <HEAD lane>, color: null }],
  passing: [],
}
```

The HEAD lane is found by scanning the already-computed `rows` for the row
whose `commit.refs` contains a `head: true` or `kind: "head"` ref (same
helper as `isHeadCommit` in render.js). If HEAD isn't in the loaded window
(shouldn't normally happen) or there are no commits at all, skip the
synthetic row's `outgoing` (draw just a floating dot, no line down) — this
is a degenerate edge case, not a target scenario.

`assignLanes` itself is unchanged; the synthetic row is spliced in by the
caller (`app.js`), keeping `layout.js` focused purely on real commit lanes.

## Render (`src/lib/git/render.js`)

- `graphCell` and `renderRow` branch on `row.isUncommitted`:
  - Line/dot color is a fixed gray (reuse `LANE_COLORS[7]` `#8aa0b0`, already
    the muted gray in the palette — no new color introduced).
  - Dot is a plain filled circle (no HEAD-style ring; the ring is reserved
    for the actual checked-out commit).
  - The info cell shows only the text `Uncommitted Changes (${count})` in
    place of badges/subject/meta/hash.
  - Row click calls `ctx.onUncommittedClick()` instead of `ctx.onCommit`.

## App wiring (`src/gitgraph/app.js`)

- `reload()`/`applyView()`: after computing `layout` for the current commit
  set, call `loadUncommittedStatus()`. If `count > 0`, build and unshift the
  synthetic row (as above) before calling `renderGraph`.
- Re-check uncommitted status on the same triggers that already reload the
  graph (`command.refresh-graph`, `worktree.headChanged`) — no new
  subscription needed since `reload()` already re-runs `applyView()`.
- New `onUncommittedClick` handler mirrors `openDetail`, but:
  - Calls `loadUncommittedDiff()` instead of `loadCommitDetail(hash)`.
  - Calls `loadUncommittedStatus()` for the file list.
  - Renders a drawer with just: close button, `Uncommitted Changes (X)`
    header, file list, and diff `<pre>` block (no author/date line, since
    there's no commit metadata).

## Testing

- `layout.test.js`: no changes needed (synthetic row isn't part of
  `assignLanes`).
- New unit coverage for `loadUncommittedStatus`/`loadUncommittedDiff` parsing
  logic (pure string-splitting, easily testable without mocking `muxy.exec`
  by testing a small parse helper directly, matching the existing pattern in
  `data.test.js` for parsing functions vs. runner functions in
  `data.runners.test.js`).
- `render.dom.test.js`: add a case rendering a synthetic uncommitted row and
  asserting the gray line/dot and count text appear.

## Out of scope

- Untracked file counting/listing.
- Showing uncommitted changes when the loaded commit window doesn't include
  current HEAD (falls back to a floating dot with no connecting line).
