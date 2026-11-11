/**
 * 线性模拟数据源：在指定区间内沿线性轨迹往返，并叠加可控随机扰动。
 * 用于孪生离线演示，不依赖华为云影子。
 */

export const DATA_SOURCE_CLOUD = "cloud";
export const DATA_SOURCE_LINEAR = "linear";

/** 预设通道：属性名 + 线性区间 + 周期与噪声（不含执行器开关，避免与手动/联动抢值） */
export const DEFAULT_LINEAR_CHANNELS = [
  { property: "temperature", min: 16, max: 34, periodSec: 48, noise: 0.35, decimals: 1, phase: 0.12 },
  { property: "humidity", min: 35, max: 85, periodSec: 56, noise: 1.2, decimals: 0, phase: 0.41 },
  { property: "lux", min: 20, max: 900, periodSec: 40, noise: 8, decimals: 0, phase: 0.07 },
  { property: "soil_moisture", min: 20, max: 70, periodSec: 64, noise: 1.5, decimals: 0, phase: 0.63 },
];

/** 由属性名生成稳定相位 [0,1)，避免每次 normalize 抖动 */
export function stablePhase(property) {
  const s = String(property || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export function normalizeLinearChannel(raw, fallback = {}) {
  const property = String(raw?.property || fallback.property || "").trim();
  if (!property) return null;
  const min = Number(raw?.min ?? fallback.min ?? 0);
  const max = Number(raw?.max ?? fallback.max ?? 100);
  const lo = Number.isFinite(min) ? min : 0;
  const hi = Number.isFinite(max) ? max : lo + 1;
  const decRaw = raw?.decimals ?? fallback.decimals;
  const decimals = Number.isFinite(Number(decRaw))
    ? Math.max(0, Math.min(4, Number(decRaw)))
    : 1;
  const phaseRaw = raw?.phase ?? fallback.phase;
  const phase = Number.isFinite(Number(phaseRaw)) ? Number(phaseRaw) : stablePhase(property);
  return {
    property,
    min: Math.min(lo, hi),
    max: Math.max(lo, hi),
    periodSec: Math.max(4, Number(raw?.periodSec ?? fallback.periodSec ?? 40) || 40),
    noise: Math.max(0, Number(raw?.noise ?? fallback.noise ?? 0) || 0),
    decimals,
    boolean: !!(raw?.boolean ?? fallback.boolean),
    phase,
  };
}

export function normalizeLinearChannels(list) {
  const src = Array.isArray(list) && list.length ? list : DEFAULT_LINEAR_CHANNELS;
  const out = [];
  const seen = new Set();
  for (const item of src) {
    const ch = normalizeLinearChannel(item);
    if (!ch || seen.has(ch.property)) continue;
    seen.add(ch.property);
    out.push(ch);
  }
  return out.length ? out : DEFAULT_LINEAR_CHANNELS.map((c) => normalizeLinearChannel(c));
}

/** 三角波 [0,1]：线性上升再线性下降 */
export function triangle01(tSec, periodSec, phase = 0) {
  const p = Math.max(1e-6, periodSec);
  const u = (((tSec / p + phase) % 1) + 1) % 1;
  return u < 0.5 ? u * 2 : (1 - u) * 2;
}

function roundTo(n, decimals) {
  const d = Math.max(0, decimals | 0);
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/**
 * 按已运行秒数采样一条通道。
 * @returns {number|boolean}
 */
export function sampleLinearChannel(ch, elapsedSec, rng = Math.random) {
  const tri = triangle01(elapsedSec, ch.periodSec, ch.phase || 0);
  const span = ch.max - ch.min;
  let v = ch.min + tri * span;
  if (ch.noise > 0) {
    v += (rng() * 2 - 1) * ch.noise;
  }
  if (ch.boolean) {
    const mid = (ch.min + ch.max) / 2;
    return v >= mid ? 1 : 0;
  }
  v = Math.min(ch.max, Math.max(ch.min, v));
  return roundTo(v, ch.decimals);
}

/** 生成整包影子对象 */
export function sampleLinearShadow(channels, elapsedSec, rng = Math.random) {
  const out = {};
  for (const ch of normalizeLinearChannels(channels)) {
    out[ch.property] = sampleLinearChannel(ch, elapsedSec, rng);
  }
  return out;
}

export function isLinearDataSource(source) {
  return String(source || "") === DATA_SOURCE_LINEAR;
}
