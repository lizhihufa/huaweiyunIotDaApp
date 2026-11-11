/**
 * 电路 / 水管：按邻接自动接成直段、弯头、三通、十字（单格示意管网）。
 */

export const UTILITY_KINDS = new Set(["circuit", "water"]);

const UTILITY_ASSETS = {
  circuit: {
    end: "util_circuit",
    straight: "util_circuit_s",
    curve: "util_circuit_c",
    t: "util_circuit_t",
    cross: "util_circuit_x",
    names: {
      util_circuit: "电路端",
      util_circuit_s: "电路直段",
      util_circuit_c: "电路弯头",
      util_circuit_t: "电路三通",
      util_circuit_x: "电路交叉",
    },
  },
  water: {
    end: "util_water",
    straight: "util_water_s",
    curve: "util_water_c",
    t: "util_water_t",
    cross: "util_water_x",
    names: {
      util_water: "水管端",
      util_water_s: "水管直段",
      util_water_c: "水管弯头",
      util_water_t: "水管三通",
      util_water_x: "水管交叉",
    },
  },
};

export const UTILITY_NETWORK_ASSETS = new Set(
  Object.values(UTILITY_ASSETS).flatMap((u) => Object.keys(u.names))
);

const PZ = 1;
const PX = 2;
const NZ = 4;
const NX = 8;

export function isUtilityKind(kind) {
  return UTILITY_KINDS.has(kind);
}

export function isUtilityNetworkProp(p) {
  if (!p || !isUtilityKind(p.kind)) return false;
  const id = p.asset_id || p.model?.id;
  return UTILITY_NETWORK_ASSETS.has(id) || isUtilityKind(p.kind);
}

function bitCount(mask) {
  let n = 0;
  for (let m = mask; m; m >>= 1) n += m & 1;
  return n;
}

function neighborMask(x, z, keys, snap) {
  let mask = 0;
  if (keys.has(`${x},${z + snap}`)) mask |= PZ;
  if (keys.has(`${x + snap},${z}`)) mask |= PX;
  if (keys.has(`${x},${z - snap}`)) mask |= NZ;
  if (keys.has(`${x - snap},${z}`)) mask |= NX;
  return mask;
}

function resolveStyle(mask, pack) {
  const n = bitCount(mask);
  if (n === 0) return { assetId: pack.end, rotY: 0 };
  if (n === 1) {
    if (mask & PZ) return { assetId: pack.end, rotY: 0 };
    if (mask & PX) return { assetId: pack.end, rotY: Math.PI / 2 };
    if (mask & NZ) return { assetId: pack.end, rotY: Math.PI };
    return { assetId: pack.end, rotY: -Math.PI / 2 };
  }
  if (n === 2) {
    if (mask === (PZ | NZ)) return { assetId: pack.straight, rotY: 0 };
    if (mask === (PX | NX)) return { assetId: pack.straight, rotY: Math.PI / 2 };
    if (mask === (PZ | PX)) return { assetId: pack.curve, rotY: 0 };
    if (mask === (PX | NZ)) return { assetId: pack.curve, rotY: Math.PI / 2 };
    if (mask === (NZ | NX)) return { assetId: pack.curve, rotY: Math.PI };
    if (mask === (NX | PZ)) return { assetId: pack.curve, rotY: -Math.PI / 2 };
  }
  if (n === 3) {
    if (mask === (PZ | NZ | PX)) return { assetId: pack.t, rotY: 0 };
    if (mask === (PX | NX | NZ)) return { assetId: pack.t, rotY: Math.PI / 2 };
    if (mask === (PZ | NZ | NX)) return { assetId: pack.t, rotY: Math.PI };
    if (mask === (PX | NX | PZ)) return { assetId: pack.t, rotY: -Math.PI / 2 };
  }
  return { assetId: pack.cross, rotY: 0 };
}

export function autotileUtilityProps(props, snap = 1) {
  const list = Array.isArray(props) ? props : [];
  const stepDefault = Math.max(0.5, Number(snap) || 1);
  const byKind = { circuit: new Set(), water: new Set() };
  for (const p of list) {
    if (!isUtilityKind(p.kind)) continue;
    const x = Number(p.x) || 0;
    const z = Number(p.z) || 0;
    byKind[p.kind].add(`${x},${z}`);
  }

  return list.map((p) => {
    if (!isUtilityNetworkProp(p)) return p;
    const pack = UTILITY_ASSETS[p.kind];
    if (!pack) return p;
    const x = Number(p.x) || 0;
    const z = Number(p.z) || 0;
    const cellSnap = Number(p.snap) > 0 ? Number(p.snap) : stepDefault;
    const style = resolveStyle(neighborMask(x, z, byKind[p.kind], cellSnap), pack);
    return {
      ...p,
      asset_id: style.assetId,
      name: pack.names[style.assetId] || p.name,
      model: { kind: "builtin", id: style.assetId },
      rotY: style.rotY,
    };
  });
}
