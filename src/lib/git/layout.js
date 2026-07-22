export const PALETTE_SIZE = 8;

function firstFree(lanes) {
  for (let i = 0; i < lanes.length; i++) if (lanes[i] === null) return i;
  return lanes.length;
}

export function assignLanes(commits) {
  const lanes = []; // ({ hash, color } | null)[]
  const rows = [];
  let laneCount = 0;
  let colorCounter = 0;
  const newColor = () => colorCounter++ % PALETTE_SIZE;

  for (const commit of commits) {
    const before = lanes.slice();

    const waiting = [];
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] && lanes[i].hash === commit.hash) waiting.push(i);
    }

    let nodeLane;
    let nodeColor;
    if (waiting.length === 0) {
      nodeLane = firstFree(lanes);
      nodeColor = newColor();
    } else {
      nodeLane = waiting[0];
      nodeColor = lanes[nodeLane].color;
    }

    const incoming = waiting.map((i) => ({ fromLane: i, color: before[i].color }));

    for (const i of waiting) lanes[i] = null;
    while (lanes.length <= nodeLane) lanes.push(null);
    lanes[nodeLane] = null;

    const outgoing = [];
    commit.parents.forEach((parentHash, idx) => {
      if (idx === 0) {
        lanes[nodeLane] = { hash: parentHash, color: nodeColor };
        outgoing.push({ toLane: nodeLane, color: nodeColor });
      } else {
        let target = lanes.findIndex((l) => l && l.hash === parentHash);
        if (target === -1) {
          target = firstFree(lanes);
          while (lanes.length <= target) lanes.push(null);
          lanes[target] = { hash: parentHash, color: newColor() };
        }
        outgoing.push({ toLane: target, color: lanes[target].color });
      }
    });

    const passing = [];
    for (let i = 0; i < before.length; i++) {
      if (before[i] && i !== nodeLane && !waiting.includes(i)) {
        passing.push({ lane: i, color: before[i].color });
      }
    }

    const used = [
      nodeLane,
      ...incoming.map((e) => e.fromLane),
      ...outgoing.map((e) => e.toLane),
      ...passing.map((e) => e.lane),
    ];
    laneCount = Math.max(laneCount, ...used.map((n) => n + 1));

    rows.push({ commit, lane: nodeLane, color: nodeColor, incoming, outgoing, passing });
  }

  return { rows, laneCount };
}
