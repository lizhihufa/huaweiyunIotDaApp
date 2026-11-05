/** 一键场景模板（props 列表） */

import { autotileRoadProps } from "./roadAutotile";

function road(x, z, asset = "road_tile") {
  return {
    id: `tpl_${asset}_${x}_${z}`,
    asset_id: asset,
    name: asset === "road_sidewalk" ? "人行道" : "马路",
    model: { kind: "builtin", id: asset },
    source: "scene",
    kind: "road",
    x,
    y: 0,
    z,
    snap: 2,
    scale: 1,
    rotY: 0,
  };
}

function tree(x, z, i = 0) {
  return {
    id: `tpl_tree_${i}_${x}_${z}`,
    asset_id: "tree_deciduous",
    name: "阔叶树",
    model: { kind: "builtin", id: "scene_tree" },
    source: "scene",
    kind: "decoration",
    x,
    y: 0,
    z,
    scale: 1,
    rotY: 0,
  };
}

function house(x, z, i = 0) {
  return {
    id: `tpl_house_${i}`,
    asset_id: "house_small",
    name: "小住宅",
    model: { kind: "builtin", id: "bld_house_small" },
    source: "scene",
    kind: "residential",
    x,
    y: 0,
    z,
    scale: 1,
    rotY: 0,
  };
}

function device(id, name, modelId, x, z, property, extra = {}) {
  return {
    id,
    asset_id: modelId,
    name,
    model: { kind: "builtin", id: modelId },
    source: "device",
    kind: "device",
    x,
    y: 0,
    z,
    snap: 1,
    scale: 1.2,
    rotY: 0,
    binding: property
      ? {
          property,
          ...(extra.warnMax != null ? { warnMax: extra.warnMax } : {}),
          ...(extra.alarmMax != null ? { alarmMax: extra.alarmMax } : {}),
          ...(extra.warnMin != null ? { warnMin: extra.warnMin } : {}),
          ...(extra.alarmMin != null ? { alarmMin: extra.alarmMin } : {}),
        }
      : { property: "" },
  };
}

export const SCENE_TEMPLATES = [
  {
    id: "street_cross",
    label: "路灯路口",
    desc: "十字马路 + 行道树 + 两侧住宅",
    apply() {
      const props = [
        road(0, 0),
        road(0, 2),
        road(0, -2),
        road(2, 0),
        road(-2, 0),
        road(0, 4),
        road(0, -4),
        road(4, 0),
        road(-4, 0),
        tree(3, 3, 1),
        tree(-3, 3, 2),
        tree(3, -3, 3),
        tree(-3, -3, 4),
        house(6, 4, 1),
        house(-6, 4, 2),
        house(6, -5, 3),
        {
          id: "tpl_shop_1",
          asset_id: "shop_small",
          name: "小商店",
          model: { kind: "builtin", id: "bld_shop" },
          source: "scene",
          kind: "shop",
          x: -6,
          y: 0,
          z: -5,
          scale: 1,
          rotY: 0,
        },
        device("tpl_dev_mcu", "路口主控", "dev_mcu", 1.5, 1.5, "lux"),
        device("tpl_dev_ldr", "光敏节点", "dev_ldr", -1.5, 1.5, "lux", { warnMin: 40, alarmMin: 15 }),
        device("tpl_dev_relay", "灯控继电器", "dev_relay", 0, -1.5, "lamp_on"),
      ];
      return autotileRoadProps(props, 2);
    },
  },
  {
    id: "greenhouse_yard",
    label: "大棚一区",
    desc: "拱棚 + 番茄架 + 土壤监测设备",
    apply() {
      return [
        {
          id: "tpl_gh_1",
          asset_id: "greenhouse_tunnel",
          name: "拱形大棚",
          model: { kind: "builtin", id: "bld_greenhouse" },
          source: "scene",
          kind: "greenhouse",
          x: 0,
          y: 0,
          z: 0,
          scale: 1,
          rotY: 0,
        },
        {
          id: "tpl_tomato_1",
          asset_id: "crop_tomato",
          name: "番茄架",
          model: { kind: "builtin", id: "scene_tomato" },
          source: "scene",
          kind: "greenhouse",
          x: -1,
          y: 0,
          z: 0,
          scale: 1,
          rotY: 0,
        },
        {
          id: "tpl_tomato_2",
          asset_id: "crop_tomato",
          name: "番茄架",
          model: { kind: "builtin", id: "scene_tomato" },
          source: "scene",
          kind: "greenhouse",
          x: 1,
          y: 0,
          z: 0,
          scale: 1,
          rotY: 0,
        },
        road(-6, 0, "road_sidewalk"),
        road(-6, 2, "road_sidewalk"),
        road(-6, -2, "road_sidewalk"),
        tree(-8, 3, 1),
        tree(-8, -3, 2),
        {
          id: "tpl_grass_1",
          asset_id: "grass_patch",
          name: "草地块",
          model: { kind: "builtin", id: "scene_grass" },
          source: "scene",
          kind: "decoration",
          x: 5,
          y: 0,
          z: 4,
          scale: 1,
          rotY: 0,
        },
        device("tpl_gh_soil", "土壤湿度", "dev_soil", -2.5, 2, "soil_moisture", {
          warnMin: 35,
          alarmMin: 20,
        }),
        device("tpl_gh_dht", "棚内温湿度", "dev_dht22", 2.5, 2, "temperature", {
          warnMax: 32,
          alarmMax: 40,
        }),
        device("tpl_gh_pump", "灌溉水泵", "dev_pump", 0, 3.5, "relay"),
      ];
    },
  },
  {
    id: "room_iot_demo",
    label: "室内监测演示",
    desc: "三室一厅内预置温湿度 / 光照 / 继电器，可直接告警飞镜",
    apply() {
      return [
        device("tpl_room_temp", "客厅温湿度", "dev_dht22", -2, 2.8, "temperature", {
          warnMax: 32,
          alarmMax: 38,
        }),
        device("tpl_room_lux", "客厅光照", "dev_bh1750", -3.5, 3.5, "lux", {
          warnMin: 40,
          alarmMin: 15,
        }),
        device("tpl_room_relay", "智能插座", "dev_relay", 0.5, 4.2, "lamp_on"),
        device("tpl_room_pir", "门厅人体感应", "dev_pir", -1.2, 5.0, "humidity", {
          warnMax: 80,
          alarmMax: 90,
        }),
        device("tpl_room_mcu", "主卧网关", "dev_esp32", -5.5, -2.2, "temperature"),
      ];
    },
  },
  {
    id: "empty_plot",
    label: "清空建造物",
    desc: "仅清除已放置的场景/设备物体，不影响整机装配",
    apply() {
      return [];
    },
  },
];

export function getSceneTemplate(id) {
  return SCENE_TEMPLATES.find((t) => t.id === id) || SCENE_TEMPLATES[0];
}
