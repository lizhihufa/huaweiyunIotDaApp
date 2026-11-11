async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: text };
  }
  if (!res.ok) {
    const msg = data?.detail || data?.message || res.statusText;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

export const api = {
  getSettings: () => request("/api/settings"),
  saveSettings: (body) =>
    request("/api/settings", { method: "PUT", body: JSON.stringify(body) }),
  wipeAllData: (confirm) =>
    request("/api/settings/wipe-all", {
      method: "POST",
      body: JSON.stringify({ confirm }),
    }),
  testConnection: () => request("/api/connection/test", { method: "POST" }),
  connect: () => request("/api/connection/connect", { method: "POST" }),
  disconnect: () => request("/api/connection/disconnect", { method: "POST" }),
  status: () => request("/api/connection/status"),
  devices: () => request("/api/devices"),
  saveDevice: (body) =>
    request("/api/devices", { method: "POST", body: JSON.stringify(body) }),
  deleteDevice: (id) => request(`/api/devices/${id}`, { method: "DELETE" }),
  metrics: () => request("/api/metrics"),
  saveMetric: (body) =>
    request("/api/metrics", { method: "POST", body: JSON.stringify(body) }),
  deleteMetric: (id) => request(`/api/metrics/${id}`, { method: "DELETE" }),
  importShadowMetrics: (overwrite = false, keys = null) =>
    request("/api/metrics/import-shadow", {
      method: "POST",
      body: JSON.stringify({ overwrite, ...(keys?.length ? { keys } : {}) }),
    }),
  dashboards: () => request("/api/dashboards"),
  getDashboard: (id) => request(`/api/dashboards/${id}`),
  saveDashboard: (id, body) =>
    request(`/api/dashboards/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  shadow: () => request("/api/runtime/shadow"),
  setProperty: (name, value) =>
    request("/api/runtime/set", {
      method: "POST",
      body: JSON.stringify({ name, value }),
    }),
  uploadBackground: async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/appearance/upload-bg", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.detail || res.statusText);
    }
    return data;
  },
  twins: () => request("/api/twins"),
  getTwin: (id) => request(`/api/twins/${id}`),
  saveTwin: (id, body) =>
    request(`/api/twins/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  createTwin: (body) =>
    request("/api/twins", { method: "POST", body: JSON.stringify(body) }),
  deleteTwin: (id) => request(`/api/twins/${id}`, { method: "DELETE" }),
  uploadTwinView: async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/twins/upload-view", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.detail || res.statusText);
    }
    return data;
  },
  importTwinViewUrl: (url) =>
    request("/api/twins/import-url", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
  libraryDevices: () => request("/api/library/devices"),
  saveLibraryDevice: (body) =>
    request("/api/library/devices", { method: "POST", body: JSON.stringify(body) }),
  updateLibraryDevice: (id, body) =>
    request(`/api/library/devices/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteLibraryDevice: (id) =>
    request(`/api/library/devices/${id}`, { method: "DELETE" }),
  libraryScenes: () => request("/api/library/scenes"),
  saveLibraryScene: (body) =>
    request("/api/library/scenes", { method: "POST", body: JSON.stringify(body) }),
  updateLibraryScene: (id, body) =>
    request(`/api/library/scenes/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteLibraryScene: (id) =>
    request(`/api/library/scenes/${id}`, { method: "DELETE" }),
  librarySceneTypes: () => request("/api/library/scene-types"),
  saveLibrarySceneType: (body) =>
    request("/api/library/scene-types", { method: "POST", body: JSON.stringify(body) }),
  updateLibrarySceneType: (id, body) =>
    request(`/api/library/scene-types/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteLibrarySceneType: (id) =>
    request(`/api/library/scene-types/${id}`, { method: "DELETE" }),
  uploadGlb: async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/library/upload-glb", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.detail || res.statusText);
    }
    return data;
  },
};

export function connectRealtime(onMessage) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws/realtime`);
  ws.onmessage = (ev) => {
    try {
      onMessage(JSON.parse(ev.data));
    } catch {
      /* ignore */
    }
  };
  return ws;
}
