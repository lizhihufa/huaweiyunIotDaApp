/**
 * 马路自动拼装：按四邻接生成直道 / 弯道 / 丁字 / 十字，并旋转对齐铺设方向。
 * 邻接方向：+Z / +X / -Z / -X（世界坐标）。
 */

export const ROAD_NETWORK_ASSETS = new Set([
  "road_tile",
  "road_straight",
  "road_curve",
  "road_t",
  "road_cross",
]);

const ROAD_NAMES = {
  road_tile: "路端",
  road_straight: "直道",
  road_curve: "弯道",
  road_t: "丁字路口",
  road_cross: "十字路口",
};

const PZ = 1;
const PX = 2;
const NZ = 4;
const NX = 8;

export function isRoadNetworkProp(p) {
  if (!p || p.kind !== "road") return false;
  const id = p.asset_id || p.model?.id;
  return ROAD_NETWORK_ASSETS.has(id);
}

export function isRoadCell(p) {
  return p?.kind === "road";
}

function neighborMask(x, z, roadKeys, snap) {
  let mask = 0;
  if (roadKeys.has(`${x},${z + snap}`)) mask |= PZ;
  if (roadKeys.has(`${x + snap},${z}`)) mask |= PX;
  if (roadKeys.has(`${x},${z - snap}`)) mask |= NZ;
  if (roadKeys.has(`${x - snap},${z}`)) mask |= NX;
  return mask;
}

function bitCount(mask) {
  let n = 0;
  for (let m = mask; m; m >>= 1) n += m & 1;
  return n;
}

/**
 * 默认网格约定（rotY = 0）：
 * - road_tile：向 +Z 伸出的路端
 * - road_straight：沿 Z 轴（±Z）
 * - road_curve：连通 +Z 与 +X
 * - road_t：连通 ±Z 与 +X（缺 -X）
 * - road_cross：四向
 */
export function resolveRoadStyle(mask) {
  const n = bitCount(mask);
  if (n === 0) return { assetId: "road_tile", rotY: 0 };
  if (n === 1) {
    if (mask & PZ) return { assetId: "road_tile", rotY: 0 };
    if (mask & PX) return { assetId: "road_tile", rotY: Math.PI / 2 };
    if (mask & NZ) return { assetId: "road_tile", rotY: Math.PI };
    return { assetId: "road_tile", rotY: -Math.PI / 2 };
  }
  if (n === 2) {
    if (mask === (PZ | NZ)) return { assetId: "road_straight", rotY: 0 };
    if (mask === (PX | NX)) return { assetId: "road_straight", rotY: Math.PI / 2 };
    if (mask === (PZ | PX)) return { assetId: "road_curve", rotY: 0 };
    if (mask === (PX | NZ)) return { assetId: "road_curve", rotY: Math.PI / 2 };
    if (mask === (NZ | NX)) return { assetId: "road_curve", rotY: Math.PI };
    if (mask === (NX | PZ)) return { assetId: "road_curve", rotY: -Math.PI / 2 };
  }
  if (n === 3) {
    if (mask === (PZ | NZ | PX)) return { assetId: "road_t", rotY: 0 };
    if (mask === (PX | NX | NZ)) return { assetId: "road_t", rotY: Math.PI / 2 };
    if (mask === (PZ | NZ | NX)) return { assetId: "road_t", rotY: Math.PI };
    if (mask === (PX | NX | PZ)) return { assetId: "road_t", rotY: -Math.PI / 2 };
  }
  return { assetId: "road_cross", rotY: 0 };
}

function applyStyle(prop, style) {
  const assetId = style.assetId;
  return {
    ...prop,
    asset_id: assetId,
    name: ROAD_NAMES[assetId] || prop.name || "马路",
    model: { kind: "builtin", id: assetId },
    rotY: style.rotY,
  };
}

/**
 * 对 props 中可自动拼装的马路砖按邻接重算类型与朝向。
 * 斑马线 / 人行道 / 停车位 / 桥等特殊砖不改写，但仍作为连通邻居。
 */
export function autotileRoadProps(props, snap = 2) {
  const list = Array.isArray(props) ? props : [];
  const step = Math.max(0.5, Number(snap) || 2);
  const roadKeys = new Set();
  for (const p of list) {
    if (!isRoadCell(p)) continue;
    const x = Number(p.x) || 0;
    const z = Number(p.z) || 0;
    roadKeys.add(`${x},${z}`);
  }

  return list.map((p) => {
    if (!isRoadNetworkProp(p)) return p;
    const x = Number(p.x) || 0;
    const z = Number(p.z) || 0;
    const cellSnap = Number(p.snap) > 0 ? Number(p.snap) : step;
    const style = resolveRoadStyle(neighborMask(x, z, roadKeys, cellSnap));
    return applyStyle(p, style);
  });
}
