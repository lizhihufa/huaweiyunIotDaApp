import { snapCoord } from "./placeCatalog";

/** 占格尺寸（世界单位） */
export function footprintOf(kind, source) {
  if (source === "device") return { w: 1, d: 1 };
  switch (kind) {
    case "road":
      return { w: 2, d: 2 };
    case "circuit":
    case "water":
      return { w: 1, d: 1 };
    case "residential":
      return { w: 3, d: 3 };
    case "greenhouse":
      return { w: 4, d: 3 };
    case "shop":
      return { w: 3, d: 3 };
    case "decoration":
      return { w: 1.5, d: 1.5 };
    default:
      return { w: 2, d: 2 };
  }
}

export function cellKey(x, z, snap = 2) {
  const sx = snapCoord(x, snap);
  const sz = snapCoord(z, snap);
  return `${sx},${sz}`;
}

/** 建筑类是否与已有物体重叠（马路可覆盖马路；装饰可叠放） */
export function findCollision(props, candidate, { ignoreId } = {}) {
  const kind = candidate.kind;
  if (kind === "decoration" || kind === "road" || kind === "circuit" || kind === "water") {
    return null;
  }
  const fp = footprintOf(kind, candidate.source);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  for (const p of props || []) {
    if (ignoreId && p.id === ignoreId) continue;
    if (p.kind === "decoration" || p.kind === "road" || p.kind === "circuit" || p.kind === "water") {
      continue;
    }
    if (p.source === "device" && candidate.source === "device") {
      // 设备之间近距离禁止
      if (Math.hypot((p.x || 0) - candidate.x, (p.z || 0) - candidate.z) < 0.8) return p;
      continue;
    }
    if (p.source === "device") continue;
    const other = footprintOf(p.kind, p.source);
    const ox = Math.abs((p.x || 0) - candidate.x);
    const oz = Math.abs((p.z || 0) - candidate.z);
    if (ox < halfW + other.w / 2 && oz < halfD + other.d / 2) return p;
  }
  return null;
}

/** 拖拽铺路：从 A 到 B 生成网格点 */
export function paintRoadCells(x0, z0, x1, z1, snap = 2) {
  const sx0 = snapCoord(x0, snap);
  const sz0 = snapCoord(z0, snap);
  const sx1 = snapCoord(x1, snap);
  const sz1 = snapCoord(z1, snap);
  const cells = [];
  const dx = Math.sign(sx1 - sx0) || 0;
  const dz = Math.sign(sz1 - sz0) || 0;
  // 先水平再垂直（或反之），保证连通
  let x = sx0;
  let z = sz0;
  cells.push({ x, z });
  while (x !== sx1) {
    x += dx * snap;
    cells.push({ x, z });
  }
  while (z !== sz1) {
    z += dz * snap;
    cells.push({ x, z });
  }
  // 去重
  const seen = new Set();
  return cells.filter((c) => {
    const k = `${c.x},${c.z}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function layerOfProp(p) {
  if (p?.source === "device") return "device";
  if (p?.kind === "road") return "road";
  if (p?.kind === "circuit") return "circuit";
  if (p?.kind === "water") return "water";
  if (p?.kind === "decoration") return "decoration";
  if (p?.kind === "residential" || p?.kind === "greenhouse" || p?.kind === "shop") return "building";
  // 设备库 kind=board/sensor/actuator 但未带 source 时仍归设备层
  if (p?.kind === "board" || p?.kind === "sensor" || p?.kind === "actuator" || p?.kind === "module") {
    return "device";
  }
  return "building";
}
