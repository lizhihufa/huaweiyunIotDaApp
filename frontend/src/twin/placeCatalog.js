/** 天际线式放置分区 */

export const PLACE_CATEGORIES = [
  { id: "residential", label: "住宅", source: "scene", hint: "住宅建筑" },
  { id: "greenhouse", label: "大棚", source: "scene", hint: "温室与棚内作物" },
  { id: "shop", label: "商店", source: "scene", hint: "商铺与市集" },
  { id: "decoration", label: "装饰", source: "scene", hint: "花、草、树等" },
  { id: "road", label: "马路", source: "scene", hint: "拖拽铺路，弯道/路口自动成型" },
  { id: "circuit", label: "电路", source: "scene", hint: "拖拽铺电路，自动接弯/三通" },
  { id: "water", label: "水管", source: "scene", hint: "拖拽铺水管，自动接弯/三通" },
  { id: "device", label: "设备", source: "device", hint: "开发板 / 传感器 / 执行器" },
];

export const SCENE_KIND_LABEL = Object.fromEntries(
  PLACE_CATEGORIES.filter((c) => c.source === "scene").map((c) => [c.id, c.label])
);

/** 与地面 GridHelper 一致的基础格距 */
export const GRID_SNAP = 2;

export function snapCoord(v, snap = 0) {
  if (!snap || snap <= 0) return v;
  return Math.round(v / snap) * snap;
}

/**
 * 按类型解析吸附步长（建筑/设备/马路均对齐地面网格）
 * @param {{ kind?: string, source?: string, snap?: number }|null} item
 * @param {number} [gridSize]
 */
export function resolveSnap(item, gridSize = GRID_SNAP) {
  const base = Math.max(0.5, Number(gridSize) || GRID_SNAP);
  // 库里显式 snap（如马路 2）优先，但不得为 0
  if (item?.snap && Number(item.snap) > 0) return Number(item.snap);
  // 建筑 / 设备 / 马路一律贴齐地面网格；装饰可用半格
  if (item?.source === "device") return base;
  switch (item?.kind) {
    case "road":
    case "residential":
    case "greenhouse":
    case "shop":
      return base;
    case "circuit":
    case "water":
      return Math.min(1, base);
    case "decoration":
      return Math.min(1, base);
    default:
      return base;
  }
}

/** 将世界坐标吸附到网格，返回 { x, z } */
export function snapToGrid(x, z, item, gridSize = GRID_SNAP) {
  const snap = resolveSnap(item, gridSize);
  return { x: snapCoord(x, snap), z: snapCoord(z, snap), snap };
}
