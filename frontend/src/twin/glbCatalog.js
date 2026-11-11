/**
 * 预置精细模型（Kenney CC0），放在 frontend/public/models/kenney/
 * fit：归一化后最长边（米），便于和程序化场景对齐
 */

export const GLB_SHOWCASE = {
  building_a: {
    url: "/models/kenney/building-type-a.glb",
    fit: 5.2,
    label: "精细住宅 A",
  },
  tree_detailed: {
    url: "/models/kenney/tree_detailed.glb",
    fit: 3.6,
    label: "精细树木",
  },
  street_light: {
    url: "/models/kenney/light-square.glb",
    fit: 4.2,
    label: "精细路灯",
  },
  sofa: {
    url: "/models/kenney/lounge-sofa.glb",
    fit: 2.2,
    label: "沙发",
  },
  desk: {
    url: "/models/kenney/desk.glb",
    fit: 1.6,
    label: "书桌",
  },
  coffee_table: {
    url: "/models/kenney/table-coffee.glb",
    fit: 1.1,
    label: "茶几",
  },
  bench: {
    url: "/models/kenney/bench.glb",
    fit: 1.5,
    label: "长椅",
  },
};

export function glbModel(key) {
  const item = GLB_SHOWCASE[key];
  if (!item) return null;
  return { kind: "glb", url: item.url, fit: item.fit };
}
