/**
 * 设备管网连接：
 * - wire_links：沿电路，开关/传感器 → 执行器
 * - water_links：沿水管，阀/泵等水力设备联动
 * 连通判定：两端贴近对应管网格，且四邻接可达。
 */

import { isActuatorProperty, isBooleanLike, truthyOn } from "./deviceStatus";

const DEFAULT_CIRCUIT_SNAP = 1;
/** 设备到最近管网格的最大吸附距离（米） */
export const CIRCUIT_ATTACH_DIST = 1.25;
export const UTILITY_ATTACH_DIST = CIRCUIT_ATTACH_DIST;

export function listWireLinks(sceneConfig) {
  const list = sceneConfig?.wire_links;
  return Array.isArray(list) ? list.filter((l) => l?.from && l?.to) : [];
}

export function listWaterLinks(sceneConfig) {
  const list = sceneConfig?.water_links;
  return Array.isArray(list) ? list.filter((l) => l?.from && l?.to) : [];
}

export function makeWireLinkId() {
  return `wl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function makeWaterLinkId() {
  return `ww_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function snapCircuitCoord(v, snap = DEFAULT_CIRCUIT_SNAP) {
  const s = Math.max(0.5, Number(snap) || DEFAULT_CIRCUIT_SNAP);
  return Math.round(Number(v) / s) * s;
}

export function circuitCellKey(x, z, snap = DEFAULT_CIRCUIT_SNAP) {
  return `${snapCircuitCoord(x, snap)},${snapCircuitCoord(z, snap)}`;
}

/** 场景中某类管网格坐标集合（circuit | water） */
export function collectUtilityCells(props, kind = "circuit", snap = DEFAULT_CIRCUIT_SNAP) {
  const cells = new Set();
  for (const p of props || []) {
    if (p?.kind !== kind) continue;
    const step = Number(p.snap) > 0 ? Number(p.snap) : snap;
    cells.add(circuitCellKey(p.x, p.z, step));
  }
  return cells;
}

/** 场景中所有电路格坐标集合 */
export function collectCircuitCells(props, snap = DEFAULT_CIRCUIT_SNAP) {
  return collectUtilityCells(props, "circuit", snap);
}

export function collectWaterCells(props, snap = DEFAULT_CIRCUIT_SNAP) {
  return collectUtilityCells(props, "water", snap);
}

/**
 * 找距离 (x,z) 最近的电路格；超出 maxDist 则 null
 * @returns {{ key: string, x: number, z: number, dist: number } | null}
 */
export function nearestCircuitCell(
  x,
  z,
  cells,
  { snap = DEFAULT_CIRCUIT_SNAP, maxDist = CIRCUIT_ATTACH_DIST } = {}
) {
  if (!cells?.size) return null;
  const sx = Number(x) || 0;
  const sz = Number(z) || 0;
  let best = null;
  for (const key of cells) {
    const [cx, cz] = key.split(",").map(Number);
    const dist = Math.hypot(sx - cx, sz - cz);
    if (dist > maxDist) continue;
    if (!best || dist < best.dist) best = { key, x: cx, z: cz, dist };
  }
  // 也允许设备落在格点附近但格集合用不同 snap：再试吸附点本身
  if (!best) {
    const key = circuitCellKey(sx, sz, snap);
    if (cells.has(key)) {
      const [cx, cz] = key.split(",").map(Number);
      best = { key, x: cx, z: cz, dist: Math.hypot(sx - cx, sz - cz) };
    }
  }
  return best;
}

function orthoNeighbors(key, cells, step) {
  const [x, z] = key.split(",").map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return [];
  const cand = [
    circuitCellKey(x, z + step, step),
    circuitCellKey(x + step, z, step),
    circuitCellKey(x, z - step, step),
    circuitCellKey(x - step, z, step),
  ];
  // 兼容集合里坐标浮点写法不一致：再扫一遍距离
  const out = new Set(cand.filter((k) => cells.has(k)));
  for (const n of cells) {
    if (n === key || out.has(n)) continue;
    const [nx, nz] = n.split(",").map(Number);
    const dx = Math.abs(nx - x);
    const dz = Math.abs(nz - z);
    const alongX = Math.abs(dx - step) < 0.05 && dz < 0.05;
    const alongZ = Math.abs(dz - step) < 0.05 && dx < 0.05;
    if (alongX || alongZ) out.add(n);
  }
  return [...out];
}

/** 四邻接 BFS：电路格是否连通 */
export function circuitCellsConnected(cells, startKey, endKey, snap = DEFAULT_CIRCUIT_SNAP) {
  if (!startKey || !endKey || !cells?.size) return false;
  if (startKey === endKey) return true;
  if (!cells.has(startKey) || !cells.has(endKey)) return false;
  const step = Math.max(0.5, Number(snap) || DEFAULT_CIRCUIT_SNAP);
  const q = [startKey];
  const seen = new Set([startKey]);
  while (q.length) {
    const cur = q.shift();
    if (cur === endKey) return true;
    for (const n of orthoNeighbors(cur, cells, step)) {
      if (seen.has(n)) continue;
      seen.add(n);
      q.push(n);
    }
  }
  return false;
}

/**
 * 两台设备是否经指定管网连通
 * @param {'circuit'|'water'} kind
 * @returns {{ ok: boolean, reason?: string, fromCell?: string, toCell?: string }}
 */
export function devicesUtilityConnected(props, fromId, toId, kind = "circuit", opts = {}) {
  const list = Array.isArray(props) ? props : [];
  const byId = Object.fromEntries(list.map((p) => [p.id, p]));
  const a = byId[fromId];
  const b = byId[toId];
  if (!a || !b) return { ok: false, reason: "设备不存在" };

  const snap = opts.snap || DEFAULT_CIRCUIT_SNAP;
  const label = kind === "water" ? "水管" : "电路";
  const cells = collectUtilityCells(list, kind, snap);
  if (!cells.size) {
    return { ok: false, reason: `尚未铺设${label}，请先用「${label}」工具铺线` };
  }

  const ca = nearestCircuitCell(a.x, a.z, cells, {
    snap,
    maxDist: opts.maxDist ?? UTILITY_ATTACH_DIST,
  });
  const cb = nearestCircuitCell(b.x, b.z, cells, {
    snap,
    maxDist: opts.maxDist ?? UTILITY_ATTACH_DIST,
  });
  if (!ca) {
    return { ok: false, reason: `「${a.name || fromId}」附近没有${label}（请靠近${label}格放置）` };
  }
  if (!cb) {
    return { ok: false, reason: `「${b.name || toId}」附近没有${label}（请靠近${label}格放置）` };
  }
  const step =
    Number(list.find((p) => p.kind === kind)?.snap) > 0
      ? Number(list.find((p) => p.kind === kind).snap)
      : snap;
  if (!circuitCellsConnected(cells, ca.key, cb.key, step)) {
    return {
      ok: false,
      reason: `两端${label}未连通，请把${label}铺成连续路径`,
      fromCell: ca.key,
      toCell: cb.key,
    };
  }
  return { ok: true, fromCell: ca.key, toCell: cb.key };
}

/** 两台设备是否经电路管网连通 */
export function devicesCircuitConnected(props, fromId, toId, opts = {}) {
  return devicesUtilityConnected(props, fromId, toId, "circuit", opts);
}

export function devicesWaterConnected(props, fromId, toId, opts = {}) {
  return devicesUtilityConnected(props, fromId, toId, "water", opts);
}

/** 标注每条连线当前是否仍沿电路连通 */
export function annotateWireLinksConnectivity(props, links) {
  return (links || []).map((l) => {
    const r = devicesCircuitConnected(props, l.from, l.to);
    return { ...l, connected: !!r.ok, reason: r.reason || "", network: "circuit", color: r.ok ? 0xfbbf24 : 0xef4444 };
  });
}

export function annotateWaterLinksConnectivity(props, links) {
  return (links || []).map((l) => {
    const r = devicesWaterConnected(props, l.from, l.to);
    return { ...l, connected: !!r.ok, reason: r.reason || "", network: "water", color: r.ok ? 0x38bdf8 : 0xef4444 };
  });
}

export function addWireLink(links, fromId, toId) {
  const from = String(fromId || "");
  const to = String(toId || "");
  if (!from || !to || from === to) return links || [];
  const cur = Array.isArray(links) ? [...links] : [];
  if (cur.some((l) => l.from === from && l.to === to)) return cur;
  cur.push({ id: makeWireLinkId(), from, to });
  return cur;
}

export function addWaterLink(links, fromId, toId) {
  const from = String(fromId || "");
  const to = String(toId || "");
  if (!from || !to || from === to) return links || [];
  const cur = Array.isArray(links) ? [...links] : [];
  if (cur.some((l) => l.from === from && l.to === to)) return cur;
  cur.push({ id: makeWaterLinkId(), from, to });
  return cur;
}

export function removeWireLink(links, linkIdOrPair) {
  const cur = Array.isArray(links) ? links : [];
  if (typeof linkIdOrPair === "string") {
    return cur.filter((l) => l.id !== linkIdOrPair);
  }
  const from = linkIdOrPair?.from;
  const to = linkIdOrPair?.to;
  return cur.filter((l) => !(l.from === from && l.to === to));
}

export const removeWaterLink = removeWireLink;

export function linksFrom(links, propId) {
  return listWireLinks({ wire_links: links }).filter((l) => l.from === propId);
}

export function linksTo(links, propId) {
  return listWireLinks({ wire_links: links }).filter((l) => l.to === propId);
}

/** 开关：可直接通断下游模块 */
export function isSwitchDeviceProp(prop) {
  if (!prop || prop.source !== "device") return false;
  const key = String(prop.binding?.property || "").toLowerCase();
  const kind = String(prop.kind || "").toLowerCase();
  const name = String(prop.name || "").toLowerCase();
  const blob = `${key} ${kind} ${name}`;
  if (/sensor|传感|温湿|光照|土壤|水位|湿度|温度|lux|temp|soil|ph|rain/.test(blob)) {
    return false;
  }
  return /开关|switch|button|按键|relay|继电器/.test(blob) || (key && isActuatorProperty(key) && /开关|switch|relay/.test(blob));
}

/** 传感器：数值量，需阈值才能控制下游开关/模块 */
export function isSensorDeviceProp(prop) {
  if (!prop || prop.source !== "device") return false;
  if (isSwitchDeviceProp(prop)) return false;
  const key = String(prop.binding?.property || "").toLowerCase();
  const kind = String(prop.kind || "").toLowerCase();
  const name = String(prop.name || "").toLowerCase();
  const blob = `${key} ${kind} ${name}`;
  if (/sensor|传感|温湿|光照|土壤|水位|湿度|温度|lux|temp|humid|soil|ph|rain|flow|气压/.test(blob)) {
    return true;
  }
  // 已绑定非执行器数值属性，也当传感器
  if (key && !isActuatorProperty(key)) return true;
  return false;
}

/** 执行器 / 受控模块 */
export function isActuatorDeviceProp(prop) {
  if (!prop || prop.source !== "device") return false;
  if (isSensorDeviceProp(prop)) return false;
  const key = String(prop.binding?.property || "");
  if (key && isActuatorProperty(key)) return true;
  const kind = String(prop.kind || "").toLowerCase();
  const name = String(prop.name || "").toLowerCase();
  return /relay|lamp|灯|泵|阀|fan|执行|actuator|pump|valve|开关|switch/.test(kind + name);
}

/** @returns {'switch'|'sensor'|'actuator'|'device'} */
export function deviceControlRole(prop) {
  if (isSwitchDeviceProp(prop)) return "switch";
  if (isSensorDeviceProp(prop)) return "sensor";
  if (isActuatorDeviceProp(prop)) return "actuator";
  return "device";
}

/** @deprecated 兼容旧名 */
export function isSwitchLikeProp(prop) {
  return isSwitchDeviceProp(prop) || isSensorDeviceProp(prop);
}

/**
 * 传感器控制阈值：只用 binding.controlThreshold（不与告警阈值混用）。
 * controlWhen: 'above' | 'below'（默认 above → 高于阈值开启）
 * controlHysteresis: 可选回差，抑制噪声在阈值附近抖动。
 */
export function getSensorControlRule(prop) {
  const b = prop?.binding || {};
  const thr = Number(b.controlThreshold);
  const when = b.controlWhen === "below" ? "below" : "above";
  const hystRaw = Number(b.controlHysteresis);
  const hysteresis = Number.isFinite(hystRaw) && hystRaw > 0 ? hystRaw : 0;
  if (!Number.isFinite(thr)) {
    return { ok: false, reason: "请先设置控制阈值", threshold: null, when, hysteresis };
  }
  return { ok: true, threshold: thr, when, hysteresis, reason: "" };
}

export function sensorValueToSwitch(value, rule, prevOn = null) {
  const n = Number(value);
  if (!rule?.ok || !Number.isFinite(n)) return null;
  const hyst = rule.hysteresis || 0;
  const wasOn = prevOn === null || prevOn === undefined ? null : truthyOn(prevOn);
  if (rule.when === "below") {
    if (wasOn) {
      // 已开启：高于阈值+回差才关
      return n <= rule.threshold + hyst ? 1 : 0;
    }
    return n <= rule.threshold ? 1 : 0;
  }
  if (wasOn) {
    // 已开启：低于阈值-回差才关
    return n >= rule.threshold - hyst ? 1 : 0;
  }
  return n >= rule.threshold ? 1 : 0;
}

/**
 * 推导应对下游写入的属性列表（单跳）。
 * - 开关：直接同步开/关到模块
 * - 传感器：仅当已设控制阈值时，按阈值开/关下游开关或模块
 * 仅沿电路仍连通的连线会生效。
 * @param {object} [shadow] 当前影子，用于传感器回差（读取下游当前开/关）
 * @returns {Array<{ property: string, value: any, propId: string, linkId?: string, mode?: string }>}
 */
export function resolveLinkedWrites(props, wireLinks, fromPropId, value, shadow = null) {
  const list = Array.isArray(props) ? props : [];
  const byId = Object.fromEntries(list.map((p) => [p.id, p]));
  const from = byId[fromPropId];
  if (!from) return [];
  const role = deviceControlRole(from);
  const outs = [];
  for (const link of linksFrom(wireLinks, fromPropId)) {
    const target = byId[link.to];
    if (!target) continue;
    const property = String(target.binding?.property || "").trim();
    if (!property) continue;
    const path = devicesCircuitConnected(list, fromPropId, link.to);
    if (!path.ok) continue;

    let nextVal = null;
    let mode = role;
    if (role === "switch" || (role !== "sensor" && isBooleanLike(value))) {
      nextVal = truthyOn(value) ? 1 : 0;
      mode = "switch";
    } else if (role === "sensor" || (!isBooleanLike(value) && Number.isFinite(Number(value)))) {
      const rule = getSensorControlRule(from);
      if (!rule.ok) continue;
      const prevOn = shadow ? truthyOn(shadow[property]) : null;
      nextVal = sensorValueToSwitch(value, rule, prevOn);
      mode = "sensor";
      if (nextVal === null) continue;
    } else {
      continue;
    }

    outs.push({ property, value: nextVal, propId: target.id, linkId: link.id, mode });
  }
  return outs;
}

/**
 * 多级连带：传感器→开关→模块 等沿电线继续传播（默认最多 4 跳）。
 * 同一属性多次写入时保留最后一次。
 */
export function resolveLinkedWritesCascade(
  props,
  wireLinks,
  fromPropId,
  value,
  shadow = null,
  { maxDepth = 4 } = {}
) {
  const list = Array.isArray(props) ? props : [];
  const byId = Object.fromEntries(list.map((p) => [p.id, p]));
  const shadowNext = { ...(shadow || {}) };
  const byProp = new Map();
  const queue = [{ id: fromPropId, value, depth: 0 }];
  const started = new Set();

  while (queue.length) {
    const cur = queue.shift();
    if (!cur?.id || cur.depth > maxDepth) continue;
    const visitKey = `${cur.id}:${String(cur.value)}:${cur.depth}`;
    if (started.has(visitKey)) continue;
    started.add(visitKey);

    const outs = resolveLinkedWrites(list, wireLinks, cur.id, cur.value, shadowNext);
    for (const item of outs) {
      byProp.set(item.property, item);
      shadowNext[item.property] = item.value;
      const target = byId[item.propId];
      if (!target) continue;
      const role = deviceControlRole(target);
      // 写入开关后继续向其下游传播；纯执行器一般无出边
      if (role === "switch" || (role !== "sensor" && isBooleanLike(item.value))) {
        queue.push({ id: item.propId, value: item.value, depth: cur.depth + 1 });
      }
    }
  }
  return [...byProp.values()];
}

/** 水力设备：阀 / 泵 / 闸 */
export function isWaterControlProp(prop) {
  if (!prop || prop.source !== "device") return false;
  const key = String(prop.binding?.property || "").toLowerCase();
  const kind = String(prop.kind || "").toLowerCase();
  const name = String(prop.name || "").toLowerCase();
  const blob = `${key} ${kind} ${name}`;
  return /阀|泵|闸|valve|pump|gate|灌溉|排水|进水/.test(blob) || /valve|pump|gate/.test(key);
}

/** 水管联动：单跳通断下游水力设备（须水管连通） */
export function resolveWaterLinkedWrites(props, waterLinks, fromPropId, value, shadow = null) {
  const list = Array.isArray(props) ? props : [];
  const byId = Object.fromEntries(list.map((p) => [p.id, p]));
  const from = byId[fromPropId];
  if (!from || !isWaterControlProp(from)) return [];
  const outs = [];
  for (const link of linksFrom(waterLinks, fromPropId)) {
    const target = byId[link.to];
    if (!target || !isWaterControlProp(target)) continue;
    const property = String(target.binding?.property || "").trim();
    if (!property) continue;
    const path = devicesWaterConnected(list, fromPropId, link.to);
    if (!path.ok) continue;
    const nextVal = truthyOn(value) ? 1 : 0;
    outs.push({
      property,
      value: nextVal,
      propId: target.id,
      linkId: link.id,
      mode: "water",
    });
  }
  return outs;
}

export function resolveWaterLinkedWritesCascade(
  props,
  waterLinks,
  fromPropId,
  value,
  shadow = null,
  { maxDepth = 4 } = {}
) {
  const list = Array.isArray(props) ? props : [];
  const byId = Object.fromEntries(list.map((p) => [p.id, p]));
  const shadowNext = { ...(shadow || {}) };
  const byProp = new Map();
  const queue = [{ id: fromPropId, value, depth: 0 }];
  const started = new Set();
  while (queue.length) {
    const cur = queue.shift();
    if (!cur?.id || cur.depth > maxDepth) continue;
    const visitKey = `${cur.id}:${String(cur.value)}`;
    if (started.has(visitKey)) continue;
    started.add(visitKey);
    const outs = resolveWaterLinkedWrites(list, waterLinks, cur.id, cur.value, shadowNext);
    for (const item of outs) {
      byProp.set(item.property, item);
      shadowNext[item.property] = item.value;
      if (byId[item.propId]) {
        queue.push({ id: item.propId, value: item.value, depth: cur.depth + 1 });
      }
    }
  }
  return [...byProp.values()];
}

/** 下游可选目标：开关→执行器模块；传感器→开关或执行器 */
export function linkableControlTargets(props, fromProp) {
  if (!fromProp) return [];
  const role = deviceControlRole(fromProp);
  return (props || []).filter((p) => {
    if (!p || p.id === fromProp.id || p.source !== "device") return false;
    if (!p.binding?.property) return false;
    if (role === "switch") return isActuatorDeviceProp(p) || isSwitchDeviceProp(p);
    if (role === "sensor") return isSwitchDeviceProp(p) || isActuatorDeviceProp(p);
    return isActuatorDeviceProp(p);
  });
}

/** 水管下游可选：其他已绑定的阀/泵/闸 */
export function linkableWaterTargets(props, fromProp) {
  if (!isWaterControlProp(fromProp)) return [];
  return (props || []).filter((p) => {
    if (!p || p.id === fromProp.id || p.source !== "device") return false;
    if (!p.binding?.property) return false;
    return isWaterControlProp(p);
  });
}
