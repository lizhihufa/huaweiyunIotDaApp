import { ref } from "vue";

const MAX = 60;

/** 简易时序缓存：每次影子更新追加一点 */
export function usePropHistory() {
  const history = ref([]);

  function pushSample(props) {
    if (!props || typeof props !== "object") return;
    const ts = Date.now();
    const point = { ts, ...props };
    const next = [...history.value, point];
    if (next.length > MAX) next.splice(0, next.length - MAX);
    history.value = next;
  }

  function series(property) {
    return history.value
      .map((p) => {
        const v = p[property];
        if (v === undefined || v === null || typeof v === "boolean") return null;
        const n = Number(v);
        return Number.isFinite(n) ? { ts: p.ts, value: n } : null;
      })
      .filter(Boolean);
  }

  return { history, pushSample, series };
}
