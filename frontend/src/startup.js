/** 启动默认页：服务端 settings.startup + localStorage 双写，避免后端未重载时失效 */

const STORAGE_KEY = "hwy_startup";
const SESSION_KEY = "hwy_startup_applied";

export function readStartupLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStartupLocal(startup) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(startup || {}));
  } catch {
    /* ignore */
  }
}

export function clearStartupSessionFlag() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function markStartupApplied() {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function wasStartupApplied() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function resolveScreenPath(startup) {
  const s = startup || {};
  if (s.default_page !== "screen") return null;
  const id = String(s.screen_id || "default").trim() || "default";
  return `/screen/${id}`;
}

export async function fetchStartup(api) {
  let remote = null;
  try {
    const res = await api.getSettings();
    remote = res.data?.startup || null;
  } catch {
    remote = null;
  }
  const local = readStartupLocal();
  // 远端明确为 screen 优先；否则用本地备份
  if (remote?.default_page === "screen") return remote;
  if (local?.default_page === "screen") return local;
  return remote || local || { default_page: "monitor", screen_id: "default" };
}
