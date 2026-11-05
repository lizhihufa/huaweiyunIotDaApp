/** 场景类型目录：环境底板 + 建议部件 */

export const SCENE_TYPES = [
  {
    id: "blank",
    label: "空地",
    desc: "平整地面 + 网格，适合自由放置建筑与设备",
    bg: 0xe8eee9,
    fog: 0xe8eee9,
    template: "blank",
    parts: [],
  },
  {
    id: "street",
    label: "街道 / 路灯",
    desc: "道路、路灯与主控板台，适合照明与市政监测",
    bg: 0xdde6e0,
    fog: 0xdde6e0,
    template: "street_light",
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

export function getSceneType(id) {
  return SCENE_TYPES.find((s) => s.id === id) || SCENE_TYPES[0];
}

export function sceneTypeFromTemplate(template) {
  const t = String(template || "");
  if (t === "blank" || t === "empty" || t === "flat") return "blank";
  if (t === "street_light" || t === "street") return "street";
  const hit = SCENE_TYPES.find((s) => s.id === t || s.template === t);
  return hit?.id || "street";
}
