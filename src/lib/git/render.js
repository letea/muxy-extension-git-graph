import { clear, h } from "@/lib/dom";
import { icon } from "@/lib/icons";

export const ROW_H = 34;
export const ROW_H_COMPACT = 28;
export const LANE_GAP = 14;
export const LANE_PAD = 12;
export const DOT_R = 4;

// Sanctioned data-viz categorical palette (see Global Constraints). Index 0 is
// overridden at runtime with --muxy-accent by the app.
export const LANE_COLORS = [
  "#4f9dde", "#e0708a", "#57b894", "#d9a441",
  "#9b7ede", "#4bbfc4", "#e07a4b", "#8aa0b0",
];

const SVGNS = "http://www.w3.org/2000/svg";

export function laneX(lane, gap = LANE_GAP, pad = LANE_PAD) {
  return pad + lane * gap;
}

export function graphWidth(laneCount, gap = LANE_GAP, pad = LANE_PAD) {
  return pad * 2 + Math.max(0, laneCount - 1) * gap;
}

function svgEl(tag, attrs) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function colorFor(laneColors, index) {
  return laneColors[index % laneColors.length];
}

// Badge display order: branch (and the attached-HEAD branch it rides on)
// first, then remote, then tag. Stable sort preserves each ref's original
// relative order within its own tier.
const REF_KIND_ORDER = { branch: 0, head: 0, remote: 1, tag: 2 };

function sortRefs(refs) {
  return [...refs].sort((a, b) => (REF_KIND_ORDER[a.kind] ?? 3) - (REF_KIND_ORDER[b.kind] ?? 3));
}

function remoteBranchName(remoteRef) {
  return remoteRef.name.slice(remoteRef.name.indexOf("/") + 1);
}

function remoteName(remoteRef) {
  return remoteRef.name.slice(0, remoteRef.name.indexOf("/"));
}

// A remote-tracking ref adds no information once its local branch is also
// present on the same commit — fold it into one badge, e.g. "3.0.146 |
// origin", so the same branch isn't shown twice. Checkout still targets the
// local branch name.
function mergeLocalRemotePairs(refs) {
  const branches = refs.filter((r) => r.kind === "branch");
  const remotes = refs.filter((r) => r.kind === "remote");
  const others = refs.filter((r) => r.kind !== "branch" && r.kind !== "remote");

  const merged = branches.map((b) => {
    const tracking = remotes.filter((r) => remoteBranchName(r) === b.name);
    if (!tracking.length) return b;
    return {
      name: `${b.name} | ${tracking.map(remoteName).join(", ")}`,
      kind: "branch",
      head: b.head,
      checkoutName: b.name,
    };
  });
  const unmatchedRemotes = remotes.filter((r) => !branches.some((b) => remoteBranchName(r) === b.name));
  return [...merged, ...unmatchedRemotes, ...others];
}

function badge(ref, onBranch, laneColorHex) {
  const kindIcon = ref.kind === "tag" ? "tag" : "git-branch";
  const isHead = ref.head === true || ref.kind === "head";
  // Color every non-HEAD ref (branch, remote, tag) like the lane its commit
  // belongs to, so a badge visually matches the graph line beneath it. HEAD
  // keeps its own prominent accent fill as a "where am I" marker.
  const useLaneColor = !isHead && Boolean(laneColorHex);
  const el = h(
    "span",
    {
      class:
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium " +
        (isHead ? "bg-primary text-primary-foreground" : useLaneColor ? "text-primary-foreground" : "bg-accent text-foreground"),
      title: ref.name,
    },
    icon(kindIcon, 11),
    ref.name,
  );
  if (useLaneColor) el.style.backgroundColor = laneColorHex;
  // Branch, remote, and tag refs are all checkout targets; the caller warns
  // about detached HEAD for tags before actually running the checkout.
  // Checkout requires a double-click — a single click just absorbs the
  // event (no accidental checkout, and it doesn't fall through to the
  // row's onCommit either).
  if (ref.kind === "branch" || ref.kind === "remote" || ref.kind === "tag") {
    el.style.cursor = "pointer";
    el.title = `${ref.name} — double-click to checkout`;
    el.addEventListener("click", (e) => e.stopPropagation());
    el.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      onBranch(ref.checkoutName ?? ref.name, ref.kind);
    });
  }
  return el;
}

function graphCell(row, laneCount, laneColors, rowH, gap) {
  const width = graphWidth(laneCount, gap);
  const svg = svgEl("svg", { width, height: rowH, viewBox: `0 0 ${width} ${rowH}` });
  const mid = rowH / 2;
  const nx = laneX(row.lane, gap);

  for (const p of row.passing) {
    const x = laneX(p.lane, gap);
    svg.appendChild(svgEl("line", { x1: x, y1: 0, x2: x, y2: rowH, stroke: colorFor(laneColors, p.color), "stroke-width": 1.5 }));
  }
  for (const e of row.incoming) {
    const x = laneX(e.fromLane, gap);
    svg.appendChild(svgEl("line", { x1: x, y1: 0, x2: nx, y2: mid, stroke: colorFor(laneColors, e.color), "stroke-width": 1.5 }));
  }
  for (const e of row.outgoing) {
    const x = laneX(e.toLane, gap);
    svg.appendChild(svgEl("line", { x1: nx, y1: mid, x2: x, y2: rowH, stroke: colorFor(laneColors, e.color), "stroke-width": 1.5 }));
  }
  svg.appendChild(svgEl("circle", { cx: nx, cy: mid, r: DOT_R, fill: colorFor(laneColors, row.color) }));
  return svg;
}

export function renderRow(row, laneCount, ctx) {
  const { laneColors, compact, onCommit, onBranch } = ctx;
  const rowH = compact ? ROW_H_COMPACT : ROW_H;
  const gap = LANE_GAP;
  const c = row.commit;

  const nodeColorHex = colorFor(laneColors, row.color);
  const badges = sortRefs(mergeLocalRemotePairs(c.refs)).map((r) => badge(r, onBranch, nodeColorHex));
  const meta = compact
    ? []
    : [
        h("span", { class: "ml-auto shrink-0 text-[11px] text-muted-foreground" }, c.authorName),
        h("span", { class: "shrink-0 font-mono text-[11px] text-muted-foreground" }, c.authorDate.slice(0, 10)),
      ];

  const info = h(
    "div",
    { class: "flex min-w-0 flex-1 items-center gap-2 px-2" },
    ...badges,
    h("span", { class: "truncate text-[12px] text-foreground", title: c.subject }, c.subject),
    ...meta,
    h("span", { class: "shrink-0 font-mono text-[11px] text-muted-foreground" }, c.shortHash),
  );

  const el = h(
    "div",
    {
      "data-row": c.hash,
      role: "button",
      tabindex: 0,
      class: "flex cursor-pointer items-stretch border-b border-border hover:bg-accent",
      style: `height:${rowH}px`,
    },
    graphCell(row, laneCount, laneColors, rowH, gap),
    info,
  );
  el.addEventListener("click", () => onCommit(c.hash));
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onCommit(c.hash);
    }
  });
  return el;
}

export function renderGraph(container, layout, ctx) {
  clear(container);
  const pairs = [];
  for (const row of layout.rows) {
    const el = renderRow(row, layout.laneCount, ctx);
    container.appendChild(el);
    pairs.push({ commit: row.commit, el });
  }
  return pairs;
}
