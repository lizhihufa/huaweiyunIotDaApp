/** 路灯阈值 + 回差规则（对齐参考页逻辑） */

export function luxFromHour(hour) {
  // 简化日照：正午最高，夜晚接近 0
  const h = ((Number(hour) % 24) + 24) % 24;
  const x = (h - 12) / 12; // -1~1 左右
  const day = Math.max(0, Math.cos(x * Math.PI));
  return Math.round(day * day * 980 + (h > 5 && h < 20 ? 8 : 0));
}

export function hourLabel(hour) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * @param {{ lux: number, lampOn: boolean, threshold: number, hysteresis: number, mode: string, manualOn: boolean }} state
 */
export function nextLampState(state) {
  if (state.mode === "manual") {
    return !!state.manualOn;
  }
  const thr = Number(state.threshold) || 80;
  const hy = Math.max(1, Number(state.hysteresis) || 1.5);
  const onThr = thr;
  const offThr = thr * hy;
  if (state.lampOn) {
    return state.lux < offThr;
  }
  return state.lux < onThr;
}

export function flowSteps(lampOn, mode) {
  return [
    { id: 1, label: "光敏采集", active: true },
    { id: 2, label: "STM32", active: true },
    { id: 3, label: "阈值判定", active: true },
    { id: 4, label: "继电器", active: !!lampOn },
    { id: 5, label: "Wi-Fi 上报", active: mode === "auto" || lampOn },
  ];
}
