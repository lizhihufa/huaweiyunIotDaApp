/**
 * 室内放置吸附：桌面高度 / 靠墙，避免设备只能贴地。
 * 坐标约定对齐 buildEnvironments 三室一厅平面。
 */

/** @type {{ id: string, x0: number, x1: number, z0: number, z1: number, y: number, label: string }[]} */
const DESK_ZONES = [
  // 客厅茶几
  { id: "living_table", x0: -2.6, x1: -1.4, z0: 2.5, z1: 3.3, y: 0.48, label: "茶几" },
  // 客厅电视柜
  { id: "tv_unit", x0: -3.1, x1: -0.9, z0: 0.3, z1: 0.85, y: 0.65, label: "电视柜" },
  // 餐厅桌
  { id: "dining", x0: 0.0, x1: 1.8, z0: 1.5, z1: 2.5, y: 0.82, label: "餐桌" },
  // 主卧书桌
  { id: "master_desk", x0: -7.5, x1: -6.1, z0: -2.4, z1: -1.5, y: 0.82, label: "主卧书桌" },
  // 次卧1书桌
  { id: "bed1_desk", x0: 0.1, x1: 1.5, z0: -5.0, z1: -4.2, y: 0.82, label: "次卧书桌" },
  // 厨房台面
  { id: "kitchen", x0: 3.9, x1: 7.1, z0: 3.8, z1: 4.6, y: 1.02, label: "厨台" },
];

const WALLS = [
  // 北墙内侧
  { axis: "z", pos: -5.6, x0: -7.8, x1: 7.8, y: 1.35, rotY: 0, inward: 1 },
  // 南墙内侧
  { axis: "z", pos: 5.6, x0: -7.8, x1: 7.8, y: 1.35, rotY: Math.PI, inward: -1 },
  // 西墙内侧（客厅侧，阳台门除外大致可贴）
  { axis: "x", pos: -7.9, z0: -5.5, z1: 1.2, y: 1.35, rotY: Math.PI / 2, inward: 1 },
  // 东墙内侧
  { axis: "x", pos: 7.9, z0: -5.5, z1: 5.5, y: 1.35, rotY: -Math.PI / 2, inward: -1 },
];

function inRange(v, a, b, pad = 0.15) {
  return v >= Math.min(a, b) - pad && v <= Math.max(a, b) + pad;
}

/**
 * @returns {{ x: number, y: number, z: number, rotY: number, surface: string } | null}
 */
export function resolveIndoorPlace(x, z, { preferWall = false } = {}) {
  const sx = Number(x) || 0;
  const sz = Number(z) || 0;

  if (!preferWall) {
    for (const d of DESK_ZONES) {
      if (inRange(sx, d.x0, d.x1) && inRange(sz, d.z0, d.z1)) {
        return {
          x: (d.x0 + d.x1) / 2,
          y: d.y,
          z: (d.z0 + d.z1) / 2,
          rotY: 0,
          surface: d.label,
        };
      }
    }
  }

  let best = null;
  let bestDist = 0.55;
  for (const w of WALLS) {
    if (w.axis === "z") {
      if (!inRange(sx, w.x0, w.x1, 0.3)) continue;
      const dist = Math.abs(sz - w.pos);
      if (dist < bestDist) {
        bestDist = dist;
        best = {
          x: sx,
          y: w.y,
          z: w.pos + w.inward * 0.22,
          rotY: w.rotY,
          surface: "墙面",
        };
      }
    } else {
      if (!inRange(sz, w.z0, w.z1, 0.3)) continue;
      const dist = Math.abs(sx - w.pos);
      if (dist < bestDist) {
        bestDist = dist;
        best = {
          x: w.pos + w.inward * 0.22,
          y: w.y,
          z: sz,
          rotY: w.rotY,
          surface: "墙面",
        };
      }
    }
  }
  return best;
}
