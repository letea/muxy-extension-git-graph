# Git Graph

A Muxy extension that draws a commit graph (railroad-style) across **every
ref in the repo** — local branches, remote-tracking branches, and tags —
so you can see how branches diverge and merge at a glance.

```bash
npm install
npm run build
```

After rebuilding, click **Reload** in the Muxy Extensions modal to pick up
changes (`npm run dev` runs Vite's dev server for fast iteration; `npm test`
runs the test suite).

## Features

- **Full graph, two surfaces.** A full-width **tab** (topbar icon or
  `cmd+shift+g`) shows the complete graph; a compact, pinned right **panel**
  shows the same view narrower. Both are driven by the same controller.
- **Commit detail.** Click a commit to open its full message, author/date,
  and diff.
- **Branch checkout.** Click a branch or remote badge to check it out
  (confirms first).
- **Search & filter.** Filter by commit message, author, hash, or ref name;
  or narrow the graph to a single branch's ancestry.
- **Ref badges.**
  - Colored to match the graph line/lane the commit sits on.
  - Ordered branch → remote → tag.
  - A local branch and its same-named remote merge into one badge, e.g.
    `3.0.146 | origin` (multiple tracking remotes join with `, `).
  - HEAD (attached or detached) gets a distinct, prominent accent color so
    you can always tell where you are.
- **Theme-aware.** Follows Muxy's live theme; the one saturated accent color
  is reserved for HEAD, and the graph re-renders on theme change.
- **Large repos.** Loads the most recent 300 commits with a "Load more"
  control instead of silently truncating.
- **Auto-refresh** on `worktree.headChanged` (e.g. a `git checkout` in a
  terminal), and tolerates repos with no configured remote.

## Architecture

`muxy.exec` runs `git log --all`, `git show`, `git remote`, and
`git checkout` directly (the extension only needs `commands:exec`, not
`git:write`); `muxy.git.repoInfo`/`branches`/`remoteBranches` supply
structured reads. A pure lane-assignment engine turns the commit DAG into
per-row lane/edge data, which an SVG renderer draws with Muxy's theme
variables. One `GitGraphApp` controller (search, commit detail, checkout,
refresh, theme reactivity) drives both the tab and the panel.

## Layout

- `tab/index.html`, `panel/index.html` — entry HTML for the two surfaces.
- `src/entries/tab.js`, `src/entries/panel.js` — mount `GitGraphApp` with
  the right `compact` flag; the tab entry also sets its runtime icon.
- `src/gitgraph/app.js` — the controller: load → layout → render, search,
  branch filter, commit detail, checkout, refresh, theme changes.
- `src/lib/git/data.js` — `git log`/`git show` parsers (pure) plus the
  `muxy.exec`/`muxy.git` wrappers that load refs, the graph, commit detail,
  and perform checkout.
- `src/lib/git/layout.js` — the pure lane-assignment engine (commit DAG →
  per-row lane/edge data).
- `src/lib/git/filter.js` — search-query matching and branch-ancestry
  filtering (pure).
- `src/lib/git/render.js` — SVG graph lines/dots and ref badge rendering
  (color, ordering, local/remote merging).
- `src/lib/dom.js`, `src/lib/icons.js` — small DOM-building and icon
  helpers shared across the UI.
- `src/styles/global.css` — Tailwind, with `--color-*` mapped to the app's
  `--muxy-*` theme tokens so utilities like `bg-primary` and
  `text-muted-foreground` follow the active theme.
- `scripts/copy-manifest.mjs` — copies `package.json` into `dist/` after
  the Vite build, so the published `dist/` is a self-contained,
  installable folder. `build` runs it.
- `*.test.js` / `*.dom.test.js` — Vitest unit tests (jsdom only for the
  DOM-touching renderer); run with `npm test`.

See the [extension docs](https://github.com/muxy-app/muxy/tree/main/docs/extensions).
