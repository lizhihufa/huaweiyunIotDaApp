/**
 * 设备放置物 ↔ 物模型影子：状态色、告警判定。
 */

export const STATUS_COLORS = {
  idle: 0x64748b,
  offline: 0x94a3b8,
  ok: 0x38bdf8,
  on: 0x22c55e,
  off: 0x475569,
  warn: 0xf59e0b,
  alarm: 0xef4444,
};

export function truthyOn(v) {
  return v === true || v === 1 || v === "1" || v === "true" || v === "on" || v === "ON";
}

export function falsyOff(v) {
  return v === false || v === 0 || v === "0" || v === "false" || v === "off" || v === "OFF";
}

/** 布尔型 / 开关型影子值 */
export function isBooleanLike(v) {
  return (
    typeof v === "boolean" ||
    v === 0 ||
    v === 1 ||
    v === "0" ||
    v === "1" ||
    v === "true" ||
    v === "false" ||
    v === "on" ||
    v === "off" ||
    v === "ON" ||
    v === "OFF"
  );
}

/** 执行器类属性：可驱动装配灯 / 泵阀视觉 */
export function isActuatorProperty(key) {
  const k = String(key || "").toLowerCase();
  if (!k) return false;
  return /lamp|relay|light|开关|灯|pump|水泵|valve|阀|fan|风扇|actuator/.test(k);
}

/** 任一已绑定执行器是否为开 */
export function anyActuatorOn(props, shadow = {}) {
  let hit = false;
  for (const p of props || []) {
    const key = String(p?.binding?.property || "").trim();
    if (!key || !isActuatorProperty(key)) continue;
    hit = true;
    if (truthyOn(shadow[key])) return true;
  }
  return hit ? false : null; // null = 无执行器绑定
}

/**
 * 合并云端影子 + 本地演示量（无云端时也能演示）
 */
export function mergeDemoShadow(cloudShadow, { lux, lampOn, simHour } = {}) {
  const out = { ...(cloudShadow || {}) };
  if (out.lux === undefined && lux !== undefined) out.lux = lux;
  if (out.illuminance === undefined && lux !== undefined) out.illuminance = lux;
  if (out.lamp_on === undefined && lampOn !== undefined) out.lamp_on = lampOn ? 1 : 0;
  if (out.relay === undefined && lampOn !== undefined) out.relay = lampOn ? 1 : 0;
  // 简易温湿度随时段波动，便于告警演示
  const h = ((Number(simHour) % 24) + 24) % 24;
  if (out.temperature === undefined) {
    out.temperature = Math.round((18 + Math.sin(((h - 6) / 12) * Math.PI) * 12) * 10) / 10;
  }
  if (out.humidity === undefined) {
    out.humidity = Math.round(45 + Math.cos(((h - 3) / 12) * Math.PI) * 25);
  }
  if (out.soil_moisture === undefined) {
    out.soil_moisture = Math.round(35 + Math.sin(h / 4) * 20);
  }
  return out;
}

export function isDeviceBound(prop) {
  return !!(prop?.binding?.property && String(prop.binding.property).trim());
}

/**
 * @returns {{ level: string, label: string, color: number, value: any, blink?: boolean } | null}
 * 未绑定返回 null（不参与显示）
 */
export function evaluateDeviceStatus(prop, shadow = {}) {
  const key = String(prop?.binding?.property || "").trim();
  if (!key) return null;
  const v = shadow[key];
  if (v === undefined || v === null || v === "") {
    return { level: "offline", label: `${key} · 无数据`, color: STATUS_COLORS.offline, value: null };
  }

  const bind = prop.binding || {};
  if (truthyOn(v) || falsyOff(v)) {
    const on = truthyOn(v);
    return {
      level: on ? "on" : "off",
      label: `${key} · ${on ? "开" : "关"}`,
      color: on ? STATUS_COLORS.on : STATUS_COLORS.off,
      value: v,
    };
  }

  const num = Number(v);
  if (!Number.isFinite(num)) {
    return {
      level: "ok",
      label: `${key} · ${String(v)}`,
      color: STATUS_COLORS.ok,
      value: v,
    };
  }

  const k = String(key).toLowerCase();
  const alarmMax = Number(bind.alarmMax);
  const alarmMin = Number(bind.alarmMin);
  const warnMax = Number(bind.warnMax);
  const warnMin = Number(bind.warnMin);

  if (Number.isFinite(alarmMax) && num >= alarmMax) {
    return { level: "alarm", label: `${key} · ${num}↑`, color: STATUS_COLORS.alarm, value: num, blink: true };
  }
  if (Number.isFinite(alarmMin) && num <= alarmMin) {
    return { level: "alarm", label: `${key} · ${num}↓`, color: STATUS_COLORS.alarm, value: num, blink: true };
  }
  if (Number.isFinite(warnMax) && num >= warnMax) {
    return { level: "warn", label: `${key} · ${num}`, color: STATUS_COLORS.warn, value: num, blink: true };
  }
  if (Number.isFinite(warnMin) && num <= warnMin) {
    return { level: "warn", label: `${key} · ${num}`, color: STATUS_COLORS.warn, value: num, blink: true };
  }

  // 按属性名推断默认阈值
  if (k.includes("temp") || k.includes("温度")) {
    if (num >= 40) return { level: "alarm", label: `高温 ${num}℃`, color: STATUS_COLORS.alarm, value: num, blink: true };
    if (num >= 32) return { level: "warn", label: `偏热 ${num}℃`, color: STATUS_COLORS.warn, value: num, blink: true };
    if (num <= 5) return { level: "warn", label: `偏冷 ${num}℃`, color: STATUS_COLORS.warn, value: num, blink: true };
    return { level: "ok", label: `${num}℃`, color: STATUS_COLORS.ok, value: num };
  }
  if (k.includes("hum") || k.includes("湿")) {
    if (num >= 90 || num <= 15) {
      return { level: "alarm", label: `湿度 ${num}%`, color: STATUS_COLORS.alarm, value: num, blink: true };
    }
    if (num >= 80 || num <= 25) {
      return { level: "warn", label: `湿度 ${num}%`, color: STATUS_COLORS.warn, value: num, blink: true };
    }
    return { level: "ok", label: `${num}%`, color: STATUS_COLORS.ok, value: num };
  }
  if (k.includes("lux") || k.includes("光") || k.includes("illum")) {
    if (num < 20) return { level: "warn", label: `偏暗 ${num}lx`, color: STATUS_COLORS.warn, value: num, blink: true };
    return { level: "ok", label: `${num}lx`, color: STATUS_COLORS.ok, value: num };
  }
  if (k.includes("soil") || k.includes("土壤")) {
    if (num < 20) return { level: "alarm", label: `干旱 ${num}`, color: STATUS_COLORS.alarm, value: num, blink: true };
    if (num < 35) return { level: "warn", label: `偏干 ${num}`, color: STATUS_COLORS.warn, value: num, blink: true };
    return { level: "ok", label: `${num}`, color: STATUS_COLORS.ok, value: num };
  }

  return {
    level: "ok",
    label: `${key} · ${num}`,
    color: STATUS_COLORS.ok,
    value: num,
  };
}

export function collectDeviceStatuses(props, shadow) {
  const list = [];
  for (const p of props || []) {
    if (p.source !== "device" && p.kind !== "device") continue;
    if (!isDeviceBound(p)) continue;
    const st = evaluateDeviceStatus(p, shadow);
    if (!st) continue;
    list.push({
      id: p.id,
      name: p.name || p.asset_id || p.id,
      x: p.x || 0,
      y: p.y || 0,
      z: p.z || 0,
      binding: p.binding?.property || "",
      ...st,
    });
  }
  return list;
}

export function collectAlerts(statuses) {
  return (statuses || [])
    .filter((s) => s.level === "alarm" || s.level === "warn")
    .sort((a, b) => (a.level === "alarm" ? -1 : 1) - (b.level === "alarm" ? -1 : 1));
}
