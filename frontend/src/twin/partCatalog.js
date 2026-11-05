/** 内置部件（可删可留；用户还可自定义） */
export const BUILTIN_PARTS = [
  { id: "pole", label: "灯杆", layer: "结构", shape: "pole", builtin: true },
  { id: "lamp", label: "路灯灯头", layer: "执行层", shape: "lamp", builtin: true },
  { id: "base", label: "底座 / 主板", layer: "结构", shape: "box", builtin: true },
  { id: "mcu", label: "STM32 主控", layer: "控制层", shape: "box", builtin: true },
  { id: "relay", label: "继电器", layer: "执行层", shape: "box", builtin: true },
  { id: "wifi", label: "Wi-Fi 模块", layer: "通信层", shape: "box", builtin: true },
  { id: "ldr", label: "光敏电阻", layer: "传感层", shape: "sensor", builtin: true },
];

/** @deprecated 兼容旧引用 */
export const PART_OPTIONS = BUILTIN_PARTS;

const SHAPES = [
  { id: "box", label: "方块" },
  { id: "pole", label: "立柱/圆柱" },
  { id: "lamp", label: "灯头" },
  { id: "sensor", label: "传感器圆帽" },
];

export function shapeOptions() {
  return SHAPES;
}

export function slugifyPartId(name) {
  const base = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_\u4e00-\u9fff-]/g, "")
    .replace(/_+/g, "_")
    .slice(0, 24);
  const ascii = base.replace(/[\u4e00-\u9fff]/g, "") || "part";
  return `c_${ascii}_${Date.now().toString(36).slice(-4)}`;
}

export function mergePartOptions(projectParts = []) {
  const map = new Map();
  const list = projectParts || [];
  // 若工程已有 parts，以工程为准（可隐藏内置）；否则灌入全部内置
  if (!list.length) {
    return BUILTIN_PARTS.map((p) => ({ ...p, hidden: false }));
  }
  for (const p of list) {
    if (!p?.id) continue;
    const builtin = BUILTIN_PARTS.find((b) => b.id === p.id);
    map.set(p.id, {
      ...(builtin || {}),
      ...p,
      builtin: !!builtin,
      label: p.label || builtin?.label || p.id,
      layer: p.layer || builtin?.layer || "自定义",
      shape: p.shape || builtin?.shape || "box",
      hidden: !!p.hidden,
    });
  }
  // 补上工程里还没有的内置项（新版本新增的默认模块）
  for (const b of BUILTIN_PARTS) {
    if (!map.has(b.id)) {
      map.set(b.id, { ...b, hidden: false });
    }
  }
  return [...map.values()];
}

export function visiblePartOptions(projectParts = []) {
  return mergePartOptions(projectParts).filter((p) => !p.hidden);
}

export function partLabel(id, projectParts = []) {
  return mergePartOptions(projectParts).find((p) => p.id === id)?.label || id;
}

export function labelsMap(projectParts = []) {
  const out = {};
  for (const p of mergePartOptions(projectParts)) {
    if (p.hidden) continue;
    out[p.id] = p.label;
  }
  return out;
}

export function shapesMap(projectParts = []) {
  const out = {};
  for (const p of mergePartOptions(projectParts)) {
    if (p.hidden) continue;
    out[p.id] = p.shape || "box";
  }
  return out;
}
