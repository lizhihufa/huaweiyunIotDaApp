/** 各场景可配置项默认值与选项 */

import { resolveEnvId } from "./sceneTypes";

export const CROP_OPTIONS = [
  { id: "tomato", label: "番茄", color: 0xc23b22, leaf: 0x3f8f4a, height: 0.85 },
  { id: "cucumber", label: "黄瓜", color: 0x6bbf4e, leaf: 0x3f8f4a, height: 0.95 },
  { id: "lettuce", label: "生菜", color: 0x7ec850, leaf: 0x5fa84a, height: 0.35 },
  { id: "chili", label: "辣椒", color: 0xe11d48, leaf: 0x3f7d2a, height: 0.7 },
  { id: "strawberry", label: "草莓", color: 0xe11d48, leaf: 0x4a8f32, height: 0.3 },
  { id: "flower", label: "花卉", color: 0xf472b6, leaf: 0x3f8f4a, height: 0.55 },
];

export const FARM_CROP_OPTIONS = [
  { id: "wheat", label: "小麦", color: 0xd4a017, leaf: 0xc9a24a, height: 0.95 },
  { id: "corn", label: "玉米", color: 0xf5c542, leaf: 0x3f7d2a, height: 1.35 },
  { id: "soybean", label: "大豆", color: 0xb8a04a, leaf: 0x4a8f32, height: 0.7 },
  { id: "cotton", label: "棉花", color: 0xf8fafc, leaf: 0x3f8f4a, height: 0.85 },
  { id: "vegetables", label: "蔬菜", color: 0x5fa84a, leaf: 0x3f7d2a, height: 0.55 },
  { id: "fruit_trees", label: "果树", color: 0xe11d48, leaf: 0x2f6b3a, height: 1.6 },
];

export const STREET_LAYOUT_OPTIONS = [
  { id: "roadside", label: "路边单行道" },
  { id: "crossroad", label: "十字路口" },
];

export function defaultSceneConfig(sceneType = "street") {
  const common = { props: [] };
  const env = resolveEnvId(sceneType);
  switch (env) {
    case "blank":
      return {
        ...common,
        grid_size: 2,
      };
    case "room":
      return {
        ...common,
        bedrooms: 3,
        living_rooms: 1,
        floors: 1,
        has_basement: false,
      };
    case "street":
      return {
        ...common,
        street_layout: "roadside",
      };
    case "greenhouse":
      return {
        ...common,
        crop: "tomato",
      };
    case "farm":
      return {
        ...common,
        crop: "wheat",
      };
    case "rice_paddy":
      return {
        ...common,
        has_canal: true,
      };
    default:
      return { ...common };
  }
}

export function mergeSceneConfig(sceneType, overlay = {}) {
  const env = resolveEnvId(sceneType);
  return { ...defaultSceneConfig(env), ...(overlay || {}) };
}

export function cropMeta(list, id) {
  return list.find((c) => c.id === id) || list[0];
}
