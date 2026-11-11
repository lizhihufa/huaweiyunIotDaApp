/** 场景类型目录：环境底板 + 建议部件 */

export const SCENE_TYPE_BASES = ["blank", "street", "room", "greenhouse", "farm", "rice_paddy"];

export const SCENE_TYPES = [
  {
    id: "blank",
    label: "空地",
    desc: "平整地面 + 网格，适合自由放置建筑与设备",
    bg: 0xe8eee9,
    fog: 0xe8eee9,
    template: "blank",
    base: "blank",
    builtin: true,
    parts: [],
  },
  {
    id: "street",
    label: "街道 / 路灯",
    desc: "道路、路灯与主控板台，适合照明与市政监测",
    bg: 0xdde6e0,
    fog: 0xdde6e0,
    template: "street_light",
    base: "street",
    builtin: true,
    parts: [
      { id: "pole", label: "灯杆", layer: "结构", shape: "pole" },
      { id: "lamp", label: "路灯灯头", layer: "执行层", shape: "lamp" },
      { id: "base", label: "底座 / 主板", layer: "结构", shape: "box" },
      { id: "mcu", label: "STM32 主控", layer: "控制层", shape: "box" },
      { id: "relay", label: "继电器", layer: "执行层", shape: "box" },
      { id: "wifi", label: "Wi-Fi 模块", layer: "通信层", shape: "box" },
      { id: "ldr", label: "光敏电阻", layer: "传感层", shape: "sensor" },
    ],
  },
  {
    id: "room",
    label: "室内 · 三室一厅",
    desc: "精装三室一厅：客厅、主卧、次卧、厨房与卫生间",
    bg: 0xe8eef5,
    fog: 0xe8eef5,
    template: "room",
    base: "room",
    builtin: true,
    parts: [
      { id: "desk", label: "桌面 / 机柜", layer: "结构", shape: "box" },
      { id: "mcu", label: "主控板", layer: "控制层", shape: "box" },
      { id: "sensor_temp", label: "温湿度传感器", layer: "传感层", shape: "sensor" },
      { id: "camera", label: "摄像头", layer: "传感层", shape: "box" },
      { id: "lamp", label: "室内灯", layer: "执行层", shape: "lamp" },
      { id: "relay", label: "智能插座 / 继电器", layer: "执行层", shape: "box" },
    ],
  },
  {
    id: "greenhouse",
    label: "大棚",
    desc: "拱棚骨架与种植行，适合温室环境与灌溉控制",
    bg: 0xe5f2e8,
    fog: 0xd8ebe0,
    template: "greenhouse",
    base: "greenhouse",
    builtin: true,
    parts: [
      { id: "ridge", label: "棚架 / 立柱", layer: "结构", shape: "pole" },
      { id: "soil_sensor", label: "土壤湿度探头", layer: "传感层", shape: "sensor" },
      { id: "temp_sensor", label: "棚内温湿度", layer: "传感层", shape: "box" },
      { id: "valve", label: "电磁阀 / 灌溉", layer: "执行层", shape: "box" },
      { id: "fan", label: "风机", layer: "执行层", shape: "box" },
      { id: "mcu", label: "田间网关", layer: "控制层", shape: "box" },
    ],
  },
  {
    id: "farm",
    label: "农场 / 旱田",
    desc: "田块、作物行与围栏，适合大田环境监测",
    bg: 0xe9efd8,
    fog: 0xdfe8c8,
    template: "farm",
    base: "farm",
    builtin: true,
    parts: [
      { id: "crop_row", label: "作物行", layer: "结构", shape: "box" },
      { id: "soil_sensor", label: "土壤传感器", layer: "传感层", shape: "sensor" },
      { id: "weather", label: "气象站", layer: "传感层", shape: "box" },
      { id: "pump", label: "水泵", layer: "执行层", shape: "box" },
      { id: "gateway", label: "网关箱", layer: "控制层", shape: "box" },
      { id: "camera", label: "田间摄像头", layer: "传感层", shape: "box" },
    ],
  },
  {
    id: "rice_paddy",
    label: "稻田",
    desc: "水田田埂与稻丛，适合水位 / 水质监测",
    bg: 0xd9ebe6,
    fog: 0xcfe3de,
    template: "rice_paddy",
    base: "rice_paddy",
    builtin: true,
    parts: [
      { id: "ridge", label: "田埂", layer: "结构", shape: "box" },
      { id: "rice", label: "稻丛", layer: "结构", shape: "pole" },
      { id: "water_sensor", label: "水位传感器", layer: "传感层", shape: "sensor" },
      { id: "gate", label: "进排水闸", layer: "执行层", shape: "box" },
      { id: "pump", label: "抽水泵", layer: "执行层", shape: "box" },
      { id: "gateway", label: "田间网关", layer: "控制层", shape: "box" },
    ],
  },
];

function parseColor(v, fallback) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (/^#?[0-9a-fA-F]{6}$/.test(s)) {
      return parseInt(s.replace("#", ""), 16);
    }
  }
  return fallback;
}

/** 将后端自定义条目规范成与内置相同的 meta 形状 */
export function normalizeCustomSceneType(raw) {
  if (!raw || !raw.id) return null;
  const id = String(raw.id);
  if (SCENE_TYPE_BASES.includes(id)) return null;
  const base = SCENE_TYPE_BASES.includes(raw.base) ? raw.base : "blank";
  const baseMeta = SCENE_TYPES.find((s) => s.id === base) || SCENE_TYPES[0];
  const parts =
    Array.isArray(raw.parts) && raw.parts.length
      ? raw.parts.map((p) => ({
          id: String(p.id || "").trim(),
          label: String(p.label || p.id || "").trim(),
          layer: String(p.layer || "自定义").trim(),
          shape: String(p.shape || "box").trim(),
        })).filter((p) => p.id)
      : baseMeta.parts.map((p) => ({ ...p }));
  return {
    id,
    label: String(raw.name || raw.label || id).trim() || id,
    desc: String(raw.desc || "").trim() || `基于「${baseMeta.label}」的自定义场景`,
    bg: parseColor(raw.bg, baseMeta.bg),
    fog: parseColor(raw.fog || raw.bg, baseMeta.fog),
    template: baseMeta.template,
    base,
    builtin: false,
    parts,
  };
}

/** 最近加载的自定义类型缓存，供 sceneConfig / buildEnvironment 无 Vue 上下文时解析 */
let customSceneTypeCache = [];

export function setCustomSceneTypeCache(list) {
  customSceneTypeCache = Array.isArray(list) ? list : [];
}

export function getCustomSceneTypeCache() {
  return customSceneTypeCache;
}

function customsOf(custom) {
  return custom !== undefined && custom !== null ? custom : customSceneTypeCache;
}

export function listSceneTypes(custom) {
  const customs = (customsOf(custom) || [])
    .map(normalizeCustomSceneType)
    .filter(Boolean)
    .filter((c) => !SCENE_TYPES.some((b) => b.id === c.id));
  return [...SCENE_TYPES, ...customs];
}

export function getSceneType(id, custom) {
  const list = listSceneTypes(custom);
  return list.find((s) => s.id === id) || list[0];
}

/** 环境构建用的底板 id（自定义 → base） */
export function resolveEnvId(metaOrId, custom) {
  if (metaOrId && typeof metaOrId === "object") {
    const base = metaOrId.base || metaOrId.id;
    return SCENE_TYPE_BASES.includes(base) ? base : "blank";
  }
  const meta = getSceneType(metaOrId, custom);
  const base = meta?.base || meta?.id;
  return SCENE_TYPE_BASES.includes(base) ? base : "blank";
}

/**
 * 从工程 template / scene_type 解析类型 id。
 * @param {string} template
 * @param {Array} [custom]
 * @returns {{ id: string, missing?: boolean, fallbackFrom?: string }}
 */
export function resolveSceneTypeRef(templateOrType, custom) {
  const t = String(templateOrType || "");
  if (!t) return { id: "street" };
  if (t === "blank" || t === "empty" || t === "flat") return { id: "blank" };
  if (t === "street_light" || t === "street") return { id: "street" };

  const list = listSceneTypes(custom);
  const hit = list.find((s) => s.id === t || s.template === t);
  if (hit) return { id: hit.id };

  // 自定义类型已删除：尽量落到同名底板，否则 blank
  if (SCENE_TYPE_BASES.includes(t)) return { id: t };
  return { id: "blank", missing: true, fallbackFrom: t };
}

export function sceneTypeFromTemplate(template, custom) {
  return resolveSceneTypeRef(template, custom).id;
}
