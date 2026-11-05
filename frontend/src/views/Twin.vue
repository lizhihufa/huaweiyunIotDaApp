<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../api";
import { countAnnotations } from "../twin/assembleFromAnnotations";
import { BUILTIN_PARTS, mergePartOptions } from "../twin/partCatalog";
import { ROOM_FOCUS_PRESETS } from "../twin/buildEnvironments";
import {
  CROP_OPTIONS,
  FARM_CROP_OPTIONS,
  STREET_LAYOUT_OPTIONS,
  defaultSceneConfig,
  mergeSceneConfig,
} from "../twin/sceneConfig";
import { createBuildHistory } from "../twin/buildHistory";
import { findCollision } from "../twin/buildGrid";
import {
  collectAlerts,
  collectDeviceStatuses,
  mergeDemoShadow,
} from "../twin/deviceStatus";
import { PLACE_CATEGORIES, SCENE_KIND_LABEL, resolveSnap } from "../twin/placeCatalog";
import { autotileRoadProps, isRoadNetworkProp } from "../twin/roadAutotile";
import { SCENE_TEMPLATES } from "../twin/sceneTemplates";
import {
  SCENE_TYPES,
  getSceneType,
  sceneTypeFromTemplate,
} from "../twin/sceneTypes";
import { flowSteps, hourLabel, luxFromHour, nextLampState } from "../twin/simulate";
import { useTwinViewer } from "../twin/useTwinViewer";

const route = useRoute();
const router = useRouter();
const canvasRef = ref(null);
const sceneFsRootRef = ref(null); // 仅场景区域全屏（非整站）
const twinList = ref([]);
const project = ref(null);
const busy = ref(false);
const msg = ref("");
const msgType = ref("");
const tab = ref("sim"); // sim | scene
const autoDemo = ref(false);
const history = ref([]); // {t, lux, on}
const sceneLibrary = ref([]);
const deviceLibrary = ref([]);
const placeCategory = ref("road");
const placeBrushId = ref("");
const shadowProps = ref({});
const metricOptions = ref([]);
const buildHist = createBuildHistory();
const canUndo = ref(false);
const canRedo = ref(false);
const paintBatch = ref(null); // 拖拽铺路期间暂存
const templates = SCENE_TEMPLATES;

const viewer = useTwinViewer();
const placeBrush = viewer.placeBrush;
const selectedPropId = viewer.selectedPropId;
const buildMode = viewer.buildMode;
const bulldozeMode = viewer.bulldozeMode;
const fogEnabled = viewer.fogEnabled;
const bulldozeBatch = ref(null);
const sceneFullscreen = ref(false);
const settingsOpen = ref(false);
const consoleTool = ref(""); // road | circuit | water | green | bulldoze | ""
const presentationMode = ref(true); // 演示优先：隐藏建造，突出状态/告警
const autoFlyAlert = ref(true);
const lastFlownAlertId = ref("");
const layerState = viewer.layers;
const placeCats = PLACE_CATEGORIES;

/** 底部控制台主工具（天际线式） */
const CONSOLE_TOOLS = [
  { id: "road", label: "路面", icon: "路", cat: "road" },
  { id: "circuit", label: "电路", icon: "电", cat: "device" },
  { id: "water", label: "水", icon: "水", cat: "greenhouse" },
  { id: "green", label: "绿化", icon: "绿", cat: "decoration" },
  { id: "bulldoze", label: "推土机", icon: "拆", action: "bulldoze" },
];
const annCount = computed(() => countAnnotations(project.value?.annotations || {}));
const sceneTypes = SCENE_TYPES;
const currentSceneId = computed(() =>
  sceneTypeFromTemplate(project.value?.template || project.value?.scene_type || "street")
);
const currentScene = computed(() => getSceneType(currentSceneId.value));
const sceneCfg = computed(() => project.value?.scene_config || {});
const cropOptions = CROP_OPTIONS;
const farmCropOptions = FARM_CROP_OPTIONS;
const streetLayoutOptions = STREET_LAYOUT_OPTIONS;
const roomFocusPresets = ROOM_FOCUS_PRESETS;
const roomFocusId = ref("overview");
const roomSummary = computed(() => {
  const c = sceneCfg.value;
  const base = `${c.bedrooms || 0}室${c.living_rooms || 0}厅 · ${c.floors || 1}层`;
  return c.has_basement ? `${base} · 有地下室` : base;
});
const actuatorLabel = computed(() => {
  const id = currentSceneId.value;
  if (id === "room") return lampOn.value ? "灯已点亮" : "灯已熄灭";
  if (id === "greenhouse" || id === "farm") return lampOn.value ? "执行器已动作" : "执行器待机";
  if (id === "rice_paddy") return lampOn.value ? "闸泵联动中" : "闸泵待机";
  return lampOn.value ? "路灯已点亮" : "路灯已熄灭";
});

const rules = reactive({
  threshold_lx: 80,
  hysteresis: 1.5,
  mode: "auto",
  manual_lamp_on: false,
  sim_hour: 16.9,
});

const lux = computed(() => luxFromHour(rules.sim_hour));
const lampOn = ref(false);

const selectedPlaced = computed(() => {
  const id = selectedPropId.value;
  if (!id || !project.value) return null;
  return (project.value.scene_config?.props || []).find((p) => p.id === id) || null;
});

const selectedBindingValue = computed(() => {
  const prop = selectedPlaced.value?.binding?.property;
  if (!prop) return null;
  const v = effectiveShadow.value?.[prop];
  return v === undefined ? null : v;
});

/** 云端影子 + 本地演示量（无连接也能看状态色） */
const effectiveShadow = computed(() =>
  mergeDemoShadow(shadowProps.value, {
    lux: lux.value,
    lampOn: lampOn.value,
    simHour: rules.sim_hour,
  })
);

const deviceStatuses = computed(() =>
  collectDeviceStatuses(project.value?.scene_config?.props || [], effectiveShadow.value)
);

const twinAlerts = computed(() => collectAlerts(deviceStatuses.value));

const steps = computed(() => flowSteps(lampOn.value, rules.mode));
const periodHint = computed(() => {
  const h = rules.sim_hour;
  if (h >= 10 && h < 15) return "正午";
  if (h >= 16 && h < 19) return "黄昏";
  if (h >= 19 || h < 6) return "夜晚";
  return "白天";
});

const clockLabel = computed(() => `${hourLabel(rules.sim_hour)} · ${periodHint.value}`);

const sensorHudItems = computed(() => {
  const rows = [];
  rows.push({ key: "lux", label: "环境光照", value: `${lux.value}`, unit: "lx" });
  rows.push({
    key: "actuator",
    label: actuatorLabel.value.replace(/已|中/g, "").slice(0, 6) || "执行器",
    value: lampOn.value ? "开" : "关",
    unit: "",
  });
  const shadow = effectiveShadow.value || {};
  const prefer = ["temperature", "humidity", "lux", "soil_moisture", "lamp_on", "relay"];
  const keys = [
    ...prefer.filter((k) => shadow[k] !== undefined),
    ...Object.keys(shadow).filter((k) => !prefer.includes(k)),
  ].slice(0, 8);
  for (const k of keys) {
    const v = shadow[k];
    if (v === null || v === undefined || typeof v === "object") continue;
    rows.push({ key: k, label: k, value: String(v), unit: "" });
  }
  if (twinAlerts.value.length) {
    rows.unshift({
      key: "_alerts",
      label: "告警",
      value: String(twinAlerts.value.length),
      unit: "项",
    });
  }
  return rows;
});

let demoTimer = null;
let histTimer = null;
let shadowTimer = null;

function setMsg(text, type = "") {
  msg.value = text;
  msgType.value = type;
}

async function loadList() {
  const res = await api.twins();
  twinList.value = res.items || [];
}

function ensureAnnotations(item) {
  const ann = item.annotations && typeof item.annotations === "object" ? item.annotations : {};
  item.annotations = {
    front: Array.isArray(ann.front) ? ann.front : [],
    side: Array.isArray(ann.side) ? ann.side : [],
    top: Array.isArray(ann.top) ? ann.top : [],
  };
  if (!Array.isArray(item.parts) || !item.parts.length) {
    const scene = getSceneType(sceneTypeFromTemplate(item.template || item.scene_type));
    item.parts = (scene.parts || BUILTIN_PARTS).map((p) => ({ ...p }));
  } else {
    item.parts = mergePartOptions(item.parts);
  }
  if (!item.scene_type) {
    item.scene_type = sceneTypeFromTemplate(item.template);
  }
  const st = item.scene_type || sceneTypeFromTemplate(item.template);
  item.scene_config = mergeSceneConfig(st, item.scene_config || {});
  if (!item.assembly_model) {
    item.assembly_model =
      st === "street"
        ? { kind: "builtin", id: "street_light" }
        : { kind: "builtin", id: null };
  }
  if (!Array.isArray(item.scene_config.props)) {
    item.scene_config.props = item.scene_config.props || [];
  }
  item.scene_config.props = autotileRoadProps(item.scene_config.props, 2);
  return item;
}

function twinApplyOpts() {
  const p = project.value;
  if (!p) return {};
  return {
    assemblyModel: p.assembly_model,
    sceneProps: p.scene_config?.props || [],
  };
}

function persistCamera() {
  if (!project.value) return;
  const cam = viewer.getCameraState();
  if (!cam) return;
  const sc = project.value.scene_config || {};
  project.value.scene_config = { ...sc, camera: cam, layers: { ...layerState } };
}

async function loadProject(id = "street_light") {
  // 切工程前记下当前镜头
  persistCamera();
  busy.value = true;
  try {
    const res = await api.getTwin(id);
    project.value = ensureAnnotations(res.item);
    Object.assign(rules, res.item.rules || {});
    await mountScene();
    recomputeLamp();
    syncDeviceStatusViz();
    setMsg(`已加载工程「${res.item.name}」`, "ok");
  } catch (e) {
    setMsg(e.message, "err");
  } finally {
    busy.value = false;
  }
}

async function mountScene() {
  await nextTick();
  if (!canvasRef.value || !project.value) return;
  const sceneType = sceneTypeFromTemplate(project.value.template || project.value.scene_type);
  viewer.init(canvasRef.value, {
    views: project.value.views,
    annotations: project.value.annotations,
    sceneType,
    sceneConfig: project.value.scene_config || defaultSceneConfig(sceneType),
  });
  await viewer.applyAnnotations(
    project.value.annotations,
    project.value.views,
    project.value.parts,
    twinApplyOpts()
  );
  viewer.setLampOn(lampOn.value);
  // 恢复图层 / 镜头
  const savedLayers = project.value.scene_config?.layers;
  if (savedLayers && typeof savedLayers === "object") {
    for (const [k, v] of Object.entries(savedLayers)) {
      if (k in layerState) viewer.setLayerVisible(k, !!v);
    }
  }
  const cam = project.value.scene_config?.camera;
  if (cam) {
    nextTick(() => viewer.restoreCameraState(cam));
  } else if (sceneType === "room") {
    nextTick(() => focusRoomSpace("overview"));
  }
}

function applySceneType(sceneId, { replaceParts = true } = {}) {
  if (!project.value) return;
  const meta = getSceneType(sceneId);
  project.value.template = meta.template;
  project.value.scene_type = meta.id;
  project.value.scene_config = defaultSceneConfig(meta.id);
  if (meta.id === "street" && !project.value.assembly_model?.url) {
    project.value.assembly_model = { kind: "builtin", id: "street_light" };
  }
  if (replaceParts) {
    const customs = mergePartOptions(project.value.parts).filter(
      (p) => !p.builtin && (String(p.id).startsWith("c_") || String(p.id).startsWith("lib_"))
    );
    project.value.parts = [
      ...meta.parts.map((p) => ({
        ...p,
        builtin: false,
        hidden: false,
      })),
      ...customs,
    ];
  }
  viewer.setSceneType(meta.id, {
    resetParts: annCount.value === 0,
    sceneConfig: project.value.scene_config,
  });
  if (annCount.value > 0) {
    viewer.applyAnnotations(
      project.value.annotations,
      project.value.views,
      project.value.parts,
      twinApplyOpts()
    );
  }
  recomputeLamp();
  nextTick(() => {
    if (meta.id === "room") {
      focusRoomSpace("overview");
    } else {
      viewer.setCameraPreset("orbit");
    }
  });
  setMsg(`已切换场景「${meta.label}」并自动保存`, "ok");
  queueAutoSave();
}

function focusRoomSpace(id) {
  const preset = ROOM_FOCUS_PRESETS.find((p) => p.id === id) || ROOM_FOCUS_PRESETS[0];
  roomFocusId.value = preset.id;
  viewer.focusLookAt(preset.target, preset.pos);
  setMsg(`查看「${preset.label}」`, "ok");
}

function patchSceneConfig(patch) {
  if (!project.value) return;
  const st = currentSceneId.value;
  project.value.scene_config = mergeSceneConfig(st, {
    ...(project.value.scene_config || {}),
    ...patch,
  });
  viewer.setSceneConfig(project.value.scene_config, { resetParts: false });
  queueAutoSave();
}

function recomputeLamp() {
  // lampOn 由下方赋值；昼夜光照同步
  lampOn.value = nextLampState({
    lux: lux.value,
    lampOn: lampOn.value,
    threshold: rules.threshold_lx,
    hysteresis: rules.hysteresis,
    mode: rules.mode,
    manualOn: rules.manual_lamp_on,
  });
  viewer.setLampOn(lampOn.value);
}

watch(
  () => [rules.sim_hour, rules.threshold_lx, rules.hysteresis, rules.mode, rules.manual_lamp_on],
  () => recomputeLamp()
);

function setPeriod(name) {
  if (name === "noon") rules.sim_hour = 12.2;
  else if (name === "dusk") rules.sim_hour = 17.6;
  else rules.sim_hour = 21.5;
}

function toggleDemo() {
  autoDemo.value = !autoDemo.value;
  if (!autoDemo.value) {
    clearInterval(demoTimer);
    demoTimer = null;
    return;
  }
  demoTimer = setInterval(() => {
    rules.sim_hour = (rules.sim_hour + 0.12) % 24;
  }, 120);
}

let autoSaveTimer = null;
let saving = false;

function buildSaveBody() {
  persistCamera();
  return {
    name: project.value.name,
    template: project.value.template,
    scene_type: project.value.scene_type || sceneTypeFromTemplate(project.value.template),
    scene_config: project.value.scene_config || {},
    views: project.value.views,
    parts: project.value.parts,
    annotations: project.value.annotations || {},
    rules: { ...rules },
    bindings: project.value.bindings,
    assembly_model: project.value.assembly_model || null,
  };
}

async function onUploadAssemblyGlb(ev) {
  const file = ev.target.files?.[0];
  if (!file || !project.value) return;
  busy.value = true;
  try {
    const res = await api.uploadGlb(file);
    project.value.assembly_model = { kind: "glb", url: res.url };
    await viewer.applyAnnotations(
      project.value.annotations,
      project.value.views,
      project.value.parts,
      twinApplyOpts()
    );
    setMsg("已加载整机 GLB（节点名应对应 partId）", "ok");
    queueAutoSave(0);
  } catch (e) {
    setMsg(e.message || "GLB 上传失败", "err");
  } finally {
    busy.value = false;
    ev.target.value = "";
  }
}

function useBuiltinStreetLight() {
  if (!project.value) return;
  project.value.assembly_model = { kind: "builtin", id: "street_light" };
  viewer.applyAnnotations(
    project.value.annotations,
    project.value.views,
    project.value.parts,
    twinApplyOpts()
  );
  queueAutoSave(0);
  setMsg("已使用内置路灯示例模型", "ok");
}

async function loadSceneLibrary() {
  try {
    const [scenes, devices] = await Promise.all([api.libraryScenes(), api.libraryDevices()]);
    sceneLibrary.value = scenes.items || [];
    deviceLibrary.value = devices.items || [];
  } catch {
    sceneLibrary.value = [];
    deviceLibrary.value = [];
  }
}

const placeGridSize = computed(() =>
  Math.max(0.5, Number(sceneCfg.value?.grid_size) || 2)
);

const placePaletteItems = computed(() => {
  const cat = placeCats.find((c) => c.id === placeCategory.value) || placeCats[0];
  const gs = placeGridSize.value;
  if (cat.source === "device") {
    return deviceLibrary.value.map((d) => ({
      id: d.id,
      name: d.name,
      kind: d.kind,
      model: d.model,
      snap: resolveSnap({ source: "device", kind: d.kind }, gs),
      source: "device",
      badge: d.layer || d.kind,
    }));
  }
  return sceneLibrary.value
    .filter((s) => s.kind === cat.id)
    .map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      model: s.model,
      snap: resolveSnap({ kind: s.kind, source: "scene", snap: s.snap }, gs),
      source: "scene",
      badge: SCENE_KIND_LABEL[s.kind] || s.kind,
    }));
});

function pickPlaceBrush(item) {
  if (!item) {
    viewer.clearPlaceBrush();
    placeBrushId.value = "";
    return;
  }
  if (placeBrushId.value === item.id) {
    viewer.clearPlaceBrush();
    placeBrushId.value = "";
    return;
  }
  if (bulldozeMode.value) viewer.setBulldozeMode(false);
  placeBrushId.value = item.id;
  const snap = resolveSnap(item, placeGridSize.value);
  viewer.setPlaceBrush({
    assetId: item.id,
    name: item.name,
    model: item.model,
    snap,
    source: item.source,
    kind: item.kind,
  });
  setMsg(`放置「${item.name}」：吸附网格 ${snap} · 点击地面放下 · Esc 取消`, "ok");
}

function syncHistFlags() {
  canUndo.value = buildHist.canUndo;
  canRedo.value = buildHist.canRedo;
}

function pushHistBeforeChange() {
  if (!project.value) return;
  buildHist.push(project.value.scene_config?.props || []);
  syncHistFlags();
}

async function refreshPropsOnly() {
  if (!project.value) return;
  await viewer.applyScenePropList(project.value.scene_config?.props || []);
  viewer.setDayNight(rules.sim_hour, lampOn.value);
  syncDeviceStatusViz();
}

function finalizeProps(nextProps) {
  const snap = placeGridSize.value || 2;
  return autotileRoadProps(nextProps, snap);
}

async function commitProps(nextProps, { history = true, msgText } = {}) {
  if (!project.value) return;
  if (history) pushHistBeforeChange();
  const props = finalizeProps(nextProps);
  patchSceneConfig({ props });
  await refreshPropsOnly();
  if (msgText) setMsg(msgText, "ok");
}

function makePropItem(brush, x, y, z) {
  // 室内设备用更细吸附，便于摆桌面/墙边
  const indoorDevice =
    currentSceneId.value === "room" && (brush.source === "device" || brush.kind === "device");
  const snap = indoorDevice ? 0.5 : resolveSnap(brush, placeGridSize.value);
  return {
    id: `${brush.assetId}_${Date.now().toString(36).slice(-5)}_${Math.random().toString(36).slice(2, 5)}`,
    asset_id: brush.assetId,
    name: brush.name,
    model: brush.model,
    source: brush.source,
    kind: brush.kind,
    x,
    y: y || 0,
    z,
    snap,
    scale: brush.source === "device" ? 1.2 : 1,
    rotY: 0,
    binding: brush.source === "device" ? { property: "" } : undefined,
  };
}

async function placeAtPoint({ x, y, z, brush, paint }) {
  if (!project.value || !brush) return;
  const props = [...(project.value.scene_config.props || [])];

  if (brush.kind === "road" && brush.snap) {
    const idx = props.findIndex(
      (p) => p.kind === "road" && Math.abs(p.x - x) < 0.01 && Math.abs(p.z - z) < 0.01
    );
    if (idx >= 0) props.splice(idx, 1);
  } else {
    const hit = findCollision(props, { x, z, kind: brush.kind, source: brush.source });
    if (hit) {
      setMsg(`与「${hit.name}」重叠，无法放置`, "err");
      return;
    }
  }

  const item = makePropItem(brush, x, y, z);
  props.push(item);
  const next = finalizeProps(props);

  // 拖拽铺路：合并撤销；重建走串行队列，避免马路几何被 dispose 掉
  if (paint && brush.kind === "road") {
    if (!paintBatch.value) {
      pushHistBeforeChange();
      paintBatch.value = true;
    }
    patchSceneConfig({ props: next });
    viewer.applyScenePropList(next);
    return;
  }

  const label =
    brush.kind === "road" && isRoadNetworkProp(item)
      ? "马路（按铺设方向自动接道）"
      : brush.name;
  await commitProps(next, { history: true, msgText: `已放置「${label}」` });
}

function onPaintEnd() {
  if (paintBatch.value) {
    paintBatch.value = null;
    syncHistFlags();
    setMsg("铺路完成", "ok");
    queueAutoSave(0);
  }
}

async function removeSceneProp(propId, opts = {}) {
  if (!project.value || !propId) return;
  const props = finalizeProps(
    (project.value.scene_config.props || []).filter((p) => p.id !== propId)
  );
  // 推土机长按拆除：只改数据，松手后统一重建（避免拖过漏删 / 闪烁）
  if (opts.paint) {
    if (!bulldozeBatch.value) {
      pushHistBeforeChange();
      bulldozeBatch.value = true;
    }
    patchSceneConfig({ props });
    viewer.selectProp(null);
    return;
  }
  await commitProps(props, { msgText: "已拆除" });
  viewer.selectProp(null);
}

async function onBulldozeEnd() {
  if (bulldozeBatch.value) {
    bulldozeBatch.value = null;
    await refreshPropsOnly();
    syncHistFlags();
    setMsg("拆除完成", "ok");
    queueAutoSave(0);
  }
}

async function removeSelectedProp() {
  if (selectedPropId.value) await removeSceneProp(selectedPropId.value);
}

async function movePropTo({ id, x, y, z }) {
  if (!project.value || !id) return;
  const list = project.value.scene_config.props || [];
  const cur = list.find((p) => p.id === id);
  if (!cur) return;
  if (cur.kind !== "road") {
    const hit = findCollision(
      list.filter((q) => q.id !== id),
      { x, z, kind: cur.kind, source: cur.source }
    );
    if (hit) {
      setMsg(`与「${hit.name}」重叠，无法移动`, "err");
      await refreshPropsOnly();
      return;
    }
  }
  const props = finalizeProps(
    list.map((p) => (p.id === id ? { ...p, x, y: y || 0, z } : p))
  );
  await commitProps(props, { msgText: "已移动" });
}

async function undoBuild() {
  if (!project.value) return;
  const prev = buildHist.undo(project.value.scene_config?.props || []);
  if (!prev) return;
  patchSceneConfig({ props: prev });
  await refreshPropsOnly();
  syncHistFlags();
  setMsg("已撤销", "ok");
}

async function redoBuild() {
  if (!project.value) return;
  const next = buildHist.redo(project.value.scene_config?.props || []);
  if (!next) return;
  patchSceneConfig({ props: next });
  await refreshPropsOnly();
  syncHistFlags();
  setMsg("已重做", "ok");
}

function closeConsoleTools() {
  consoleTool.value = "";
  if (bulldozeMode.value) viewer.setBulldozeMode(false);
  pickPlaceBrush(null);
  if (buildMode.value) viewer.setBuildMode(false);
}

function selectConsoleTool(tool) {
  if (!tool) {
    closeConsoleTools();
    return;
  }
  if (consoleTool.value === tool.id) {
    closeConsoleTools();
    presentationMode.value = true;
    setMsg("已退出建造工具 · 演示模式", "ok");
    return;
  }
  presentationMode.value = false;
  consoleTool.value = tool.id;
  settingsOpen.value = false;
  if (tool.action === "bulldoze") {
    pickPlaceBrush(null);
    if (!buildMode.value) viewer.setBuildMode(true);
    viewer.setBulldozeMode(true);
    setMsg("推土机：单击或拖过拆除 · 再点一次退出", "ok");
    return;
  }
  if (bulldozeMode.value) viewer.setBulldozeMode(false);
  placeCategory.value = tool.cat;
  if (!buildMode.value) viewer.setBuildMode(true);
  pickPlaceBrush(null);
  // 路面 / 绿化 / 电路 / 水：自动拿起默认笔刷，减少一次点击
  nextTick(() => {
    let pick = null;
    if (tool.cat === "road") {
      pick =
        placePaletteItems.value.find((i) => i.id === "road_tile") ||
        placePaletteItems.value[0];
      if (pick) pickPlaceBrush(pick);
      setMsg("路面：拖拽铺设，弯道/路口按方向自动成型", "ok");
      return;
    }
    if (tool.cat === "decoration") {
      pick =
        placePaletteItems.value.find((i) => /tree|grass|花|树|草/i.test(i.id + i.name)) ||
        placePaletteItems.value[0];
      if (pick) pickPlaceBrush(pick);
      setMsg("绿化：点选地面刷树/草", "ok");
      return;
    }
    if (tool.cat === "device") {
      pick =
        placePaletteItems.value.find((i) => /relay|灯|开关|mcu|esp/i.test(i.id + i.name)) ||
        placePaletteItems.value[0];
      if (pick) pickPlaceBrush(pick);
      setMsg("电路：放置设备后可在检视器绑定物模型属性", "ok");
      return;
    }
    if (tool.cat === "greenhouse") {
      pick =
        placePaletteItems.value.find((i) => /pump|valve|soil|水|泵|阀/i.test(i.id + i.name)) ||
        placePaletteItems.value[0];
      if (pick) pickPlaceBrush(pick);
      setMsg("水系统：放置泵阀/传感器，绑定土壤湿度等属性", "ok");
      return;
    }
    setMsg(`已选择「${tool.label}」：在面板点选模型后点击地面放置`, "ok");
  });
}

function enterPresentationMode() {
  closeConsoleTools();
  presentationMode.value = true;
  settingsOpen.value = false;
  setMsg("演示模式：显示设备状态与告警，点击告警可飞镜", "ok");
}

function syncDeviceStatusViz() {
  viewer.applyDeviceStatuses(deviceStatuses.value);
}

function flyToAlert(alert) {
  if (!alert?.id) return;
  lastFlownAlertId.value = alert.id;
  const ok = viewer.focusProp(alert.id);
  setMsg(
    ok ? `飞镜 → ${alert.name}（${alert.label}）` : `未找到设备「${alert.name}」`,
    ok ? "ok" : "err"
  );
}

function toggleBuildMode() {
  if (buildMode.value || consoleTool.value) {
    closeConsoleTools();
    setMsg("已关闭操作台 · 演示模式", "ok");
    return;
  }
  selectConsoleTool(CONSOLE_TOOLS[0]);
}

function toggleBulldoze() {
  selectConsoleTool(CONSOLE_TOOLS.find((t) => t.id === "bulldoze"));
}

function toggleSettings() {
  settingsOpen.value = !settingsOpen.value;
  if (settingsOpen.value) {
    if (bulldozeMode.value) viewer.setBulldozeMode(false);
    // 设置打开时不强制退出放置，仅关闭推土机
  }
}

function toggleFog() {
  viewer.setFogEnabled(!fogEnabled.value);
  setMsg(fogEnabled.value ? "已开启远景雾效" : "已关闭远景雾效", "ok");
}

function refreshCanvasAfterFs() {
  nextTick(() => {
    window.dispatchEvent(new Event("resize"));
  });
}

function getFsElement() {
  return (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement ||
    null
  );
}

function isSceneElementFullscreen() {
  const fs = getFsElement();
  const root = sceneFsRootRef.value;
  return !!(fs && root && (fs === root || root.contains(fs)));
}

async function enterSceneFullscreen() {
  const el = sceneFsRootRef.value;
  if (!el) return false;
  const req =
    el.requestFullscreen ||
    el.webkitRequestFullscreen ||
    el.msRequestFullscreen;
  if (!req) return false;
  await req.call(el);
  return true;
}

async function exitSceneFullscreen() {
  if (!getFsElement()) return;
  const exit =
    document.exitFullscreen ||
    document.webkitExitFullscreen ||
    document.msExitFullscreen;
  if (exit) await exit.call(document);
}

async function toggleSceneFullscreen() {
  try {
    if (isSceneElementFullscreen() || sceneFullscreen.value) {
      await exitSceneFullscreen();
      sceneFullscreen.value = false;
      setMsg("已退出场景全屏", "ok");
    } else {
      const ok = await enterSceneFullscreen();
      sceneFullscreen.value = true;
      setMsg(ok ? "场景已全屏" : "已铺满场景区域", "ok");
    }
  } catch {
    // 权限失败时仍用 CSS 铺满场景区
    sceneFullscreen.value = !sceneFullscreen.value;
    setMsg(sceneFullscreen.value ? "场景已铺满" : "已退出场景全屏", "ok");
  }
  refreshCanvasAfterFs();
}

function onDomFullscreenChange() {
  const on = isSceneElementFullscreen();
  if (sceneFullscreen.value !== on) {
    sceneFullscreen.value = on;
    refreshCanvasAfterFs();
  }
}

async function applyTemplate(tpl) {
  if (!project.value || !tpl) return;
  if (tpl.id === "room_iot_demo" && currentSceneId.value !== "room") {
    applySceneType("room", { replaceParts: false });
  }
  const props = tpl.apply();
  await commitProps(props, { msgText: `已应用模板「${tpl.label}」` });
  nextTick(() => syncDeviceStatusViz());
}

function exportProject() {
  if (!project.value) return;
  const blob = new Blob([JSON.stringify(buildSaveBody(), null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${project.value.id || "twin"}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  setMsg("工程已导出", "ok");
}

async function importProject(ev) {
  const file = ev.target.files?.[0];
  ev.target.value = "";
  if (!file || !project.value) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    pushHistBeforeChange();
    if (data.scene_config) project.value.scene_config = mergeSceneConfig(currentSceneId.value, data.scene_config);
    if (data.parts) project.value.parts = data.parts;
    if (data.annotations) project.value.annotations = data.annotations;
    if (data.views) project.value.views = data.views;
    if (data.assembly_model) project.value.assembly_model = data.assembly_model;
    if (data.rules) Object.assign(rules, data.rules);
    if (data.bindings) project.value.bindings = data.bindings;
    await mountScene();
    queueAutoSave(0);
    setMsg("工程已导入", "ok");
  } catch (e) {
    setMsg(e.message || "导入失败", "err");
  }
}

function bindSelectedProperty(name) {
  if (!project.value || !selectedPropId.value) return;
  const props = (project.value.scene_config.props || []).map((p) => {
    if (p.id !== selectedPropId.value) return p;
    return { ...p, binding: { property: name || "" } };
  });
  patchSceneConfig({ props });
  queueAutoSave(0);
}

async function refreshShadow() {
  try {
    const [shadow, metrics] = await Promise.all([api.shadow(), api.metrics()]);
    shadowProps.value = shadow.data || {};
    metricOptions.value = (metrics.items || metrics.metrics || metrics || [])
      .map((m) => m.property_name || m.name)
      .filter(Boolean);
    for (const k of Object.keys(effectiveShadow.value)) {
      if (!metricOptions.value.includes(k)) metricOptions.value.push(k);
    }
  } catch {
    /* ignore */
  }
  syncDeviceStatusViz();
}

/** 静默自动保存（选择/改配置后立即落盘，无需点按钮） */
function queueAutoSave(delayMs = 280) {
  if (!project.value) return;
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    autoSave().catch(() => {});
  }, delayMs);
}

async function autoSave() {
  if (!project.value || saving) {
    if (saving) queueAutoSave(400);
    return;
  }
  saving = true;
  const id = project.value.id;
  try {
    const res = await api.saveTwin(id, buildSaveBody());
    if (project.value?.id === id && res.item?.updated_at) {
      project.value.updated_at = res.item.updated_at;
    }
  } catch (e) {
    setMsg(e.message || "自动保存失败", "err");
  } finally {
    saving = false;
  }
}

async function saveProject() {
  if (!project.value) return;
  clearTimeout(autoSaveTimer);
  busy.value = true;
  try {
    const res = await api.saveTwin(project.value.id, buildSaveBody());
    project.value = ensureAnnotations(res.item);
    setMsg("孪生工程已保存", "ok");
    await loadList();
  } catch (e) {
    setMsg(e.message, "err");
  } finally {
    busy.value = false;
  }
}

function pushHistory() {
  history.value.push({
    t: hourLabel(rules.sim_hour),
    lux: lux.value,
    on: lampOn.value,
  });
  if (history.value.length > 48) history.value.shift();
}

watch(
  () => [rules.sim_hour, lampOn.value],
  () => {
    viewer.setDayNight(rules.sim_hour, lampOn.value);
    syncDeviceStatusViz();
  }
);

watch(selectedPropId, () => {
  if (selectedPropId.value) refreshShadow();
});

watch(bulldozeMode, (on) => {
  if (on) consoleTool.value = "bulldoze";
  else if (consoleTool.value === "bulldoze") consoleTool.value = "";
});

function onBuildHotkeys(ev) {
  const tag = (ev.target && ev.target.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA" || ev.target?.isContentEditable) return;
  if (ev.key === "F11") {
    ev.preventDefault();
    toggleSceneFullscreen();
    return;
  }
  if (ev.key === "Escape" && sceneFullscreen.value && !bulldozeMode.value && !placeBrush.value) {
    toggleSceneFullscreen();
    return;
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") {
    ev.preventDefault();
    if (ev.shiftKey) redoBuild();
    else undoBuild();
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "y") {
    ev.preventDefault();
    redoBuild();
  }
}

watch(
  deviceStatuses,
  () => {
    syncDeviceStatusViz();
  },
  { deep: true }
);

watch(twinAlerts, (list) => {
  if (!autoFlyAlert.value || !presentationMode.value || !list?.length) return;
  const top = list[0];
  if (top.id && top.id !== lastFlownAlertId.value && top.level === "alarm") {
    flyToAlert(top);
  }
});

onMounted(async () => {
  viewer.setOnPlace(placeAtPoint);
  viewer.setOnDeleteProp((id, opts) => removeSceneProp(id, opts));
  viewer.setOnPaintEnd(onPaintEnd);
  viewer.setOnMoveProp(movePropTo);
  viewer.setOnBulldozeEnd(onBulldozeEnd);
  window.addEventListener("keydown", onBuildHotkeys);
  document.addEventListener("fullscreenchange", onDomFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onDomFullscreenChange);
  await loadList();
  await loadSceneLibrary();
  await refreshShadow();
  const qid = String(route.query.id || "").trim();
  const qtab = String(route.query.tab || "").trim();
  const first = twinList.value[0]?.id || "street_light";
  await loadProject(qid || first);
  viewer.setFogEnabled(false);
  viewer.setDayNight(rules.sim_hour, lampOn.value);
  if (qtab && ["scene", "sim"].includes(qtab)) {
    tab.value = qtab;
  } else if (qtab) {
    tab.value = "sim";
  }
  histTimer = setInterval(pushHistory, 800);
  shadowTimer = setInterval(() => {
    refreshShadow().catch(() => {});
  }, 2500);
});

async function onSelectProject(id) {
  const next = String(id || "").trim();
  if (!next) return;
  await loadProject(next);
  router.replace({ path: "/twin", query: { id: next, tab: tab.value } });
}

watch(
  () => route.query.id,
  async (id) => {
    const next = String(id || "").trim();
    if (next && next !== project.value?.id) {
      await loadProject(next);
    }
    const qtab = String(route.query.tab || "").trim();
    if (qtab && ["scene", "sim"].includes(qtab)) {
      tab.value = qtab;
    } else if (qtab) {
      tab.value = "sim";
    }
  }
);

onUnmounted(() => {
  persistCamera();
  window.removeEventListener("keydown", onBuildHotkeys);
  document.removeEventListener("fullscreenchange", onDomFullscreenChange);
  document.removeEventListener("webkitfullscreenchange", onDomFullscreenChange);
  if (sceneFullscreen.value || isSceneElementFullscreen()) {
    exitSceneFullscreen().catch(() => {});
  }
  clearInterval(demoTimer);
  clearInterval(histTimer);
  clearInterval(shadowTimer);
  clearTimeout(autoSaveTimer);
});
</script>

<template>
  <div class="twin-page">
    <header class="page-head twin-head">
      <div>
        <p class="page-kicker">Digital Twin</p>
        <h1 class="page-title">设备孪生</h1>
      </div>
      <div class="twin-head-actions">
        <select
          class="twin-select"
          :disabled="busy || !twinList.length"
          :value="project?.id"
          @change="onSelectProject($event.target.value)"
        >
          <option v-for="t in twinList" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
        <router-link class="btn" to="/device-manage">设备管理</router-link>
        <router-link class="btn" to="/scene-manage">场景管理</router-link>
        <button class="btn" type="button" :disabled="busy" @click="saveProject">保存工程</button>
      </div>
    </header>

    <div v-if="msg" class="msg" :class="msgType">{{ msg }}</div>

    <div class="twin-layout">
      <section class="twin-stage panel">
        <div class="twin-stage-bar">
          <span class="badge dot" :class="lampOn ? 'on' : 'off'">{{ actuatorLabel }}</span>
          <span class="meta-text">{{ currentScene.label }} · {{ clockLabel }}</span>
          <div class="twin-cam">
            <button class="btn" type="button" :class="{ primary: buildMode }" @click="toggleBuildMode">
              {{ buildMode ? "关闭操作台" : "打开操作台" }}
            </button>
            <button class="btn" type="button" @click="viewer.setCameraPreset('orbit')">全景</button>
            <button class="btn" type="button" @click="viewer.setCameraPreset('top')">俯视</button>
            <button class="btn" type="button" @click="viewer.setCameraPreset('lamp')">特写</button>
            <button class="btn" type="button" @click="viewer.setCameraPreset('board')">装配</button>
            <button class="btn primary" type="button" @click="toggleSceneFullscreen">场景全屏</button>
          </div>
        </div>
        <div ref="sceneFsRootRef" class="twin-canvas-wrap" :class="{ 'is-fs-root': sceneFullscreen }">
          <canvas ref="canvasRef" class="twin-canvas" />

          <div class="hud-sensors">
            <div class="hud-sensors-title">传感数据</div>
            <div v-for="s in sensorHudItems" :key="s.key" class="hud-sensor-row">
              <span>{{ s.label }}</span>
              <strong>{{ s.value }}<small v-if="s.unit"> {{ s.unit }}</small></strong>
            </div>
          </div>

          <div v-if="deviceStatuses.length" class="hud-alerts">
            <div class="hud-alerts-head">
              <strong>设备状态</strong>
              <button
                class="btn"
                type="button"
                :class="{ primary: presentationMode }"
                @click="presentationMode ? (presentationMode = false) : enterPresentationMode()"
              >
                {{ presentationMode ? "演示中" : "演示" }}
              </button>
            </div>
            <label class="hud-alerts-opt">
              <input v-model="autoFlyAlert" type="checkbox" />
              告警自动飞镜
            </label>
            <button
              v-for="a in twinAlerts.slice(0, 6)"
              :key="a.id"
              type="button"
              class="hud-alert-item"
              :class="a.level"
              @click="flyToAlert(a)"
            >
              <span class="dot" />
              <span class="txt">
                <strong>{{ a.name }}</strong>
                <small>{{ a.label }}</small>
              </span>
            </button>
            <p v-if="!twinAlerts.length" class="meta-text" style="margin: 4px 0 0">
              已绑定 {{ deviceStatuses.length }} 台 · 运行正常
            </p>
          </div>

          <button
            v-if="sceneFullscreen"
            class="hud-fs-exit btn"
            type="button"
            @click="toggleSceneFullscreen"
          >
            退出全屏
          </button>

          <div class="twin-hint">
            <template v-if="bulldozeMode">推土机 · 单击/拖过拆除 · B / Esc 退出</template>
            <template v-else-if="placeBrush">放置「{{ placeBrush.name }}」· Esc 取消</template>
            <template v-else-if="buildMode">放置模式 · 底部选工具后点选素材</template>
            <template v-else>演示模式 · 底部控制台切换工程 / 建造</template>
          </div>

          <div v-if="selectedPlaced && buildMode" class="prop-inspector">
            <strong>{{ selectedPlaced.name }}</strong>
            <span class="meta-text">{{ selectedPlaced.kind || selectedPlaced.source }}</span>
            <div class="row-actions" style="margin-top: 6px; flex-wrap: wrap">
              <button class="btn" type="button" @click="removeSelectedProp">删除</button>
            </div>
            <template v-if="selectedPlaced.source === 'device'">
              <label class="bind-row">
                物模型属性
                <select
                  :value="selectedPlaced.binding?.property || ''"
                  @change="bindSelectedProperty($event.target.value)"
                >
                  <option value="">未绑定</option>
                  <option v-for="k in metricOptions" :key="k" :value="k">{{ k }}</option>
                </select>
              </label>
              <span v-if="selectedPlaced.binding?.property" class="bind-val">
                当前值：{{ selectedBindingValue === null ? "—" : selectedBindingValue }}
              </span>
            </template>
          </div>

          <!-- 选板浮层：选中路面/电路等工具时出现在控制台上方 -->
          <div
            v-if="buildMode && consoleTool && consoleTool !== 'bulldoze'"
            class="cs-palette"
          >
            <div class="build-items">
              <button
                v-for="item in placePaletteItems"
                :key="item.id"
                type="button"
                class="build-item"
                :class="{ active: placeBrushId === item.id }"
                :title="item.badge"
                @click="pickPlaceBrush(item)"
              >
                <strong>{{ item.name }}</strong>
                <small>{{ item.badge }}</small>
              </button>
              <span v-if="!placePaletteItems.length" class="meta-text">该分类暂无素材</span>
            </div>
            <div class="build-tools">
              <button class="btn" type="button" :disabled="!canUndo" @click="undoBuild">撤销</button>
              <button class="btn" type="button" :disabled="!canRedo" @click="redoBuild">重做</button>
              <button class="btn" type="button" :disabled="!selectedPropId" @click="removeSelectedProp">删除</button>
              <button class="btn" type="button" @click="pickPlaceBrush(null)">取消</button>
            </div>
          </div>

          <!-- 设置面板 -->
          <div v-if="settingsOpen" class="cs-settings">
            <div class="cs-settings-head">
              <strong>工程设置</strong>
              <button class="btn" type="button" @click="settingsOpen = false">关闭</button>
            </div>
            <div class="cs-settings-body">
              <div class="field">
                <label>当前工程</label>
                <select
                  class="twin-select"
                  :disabled="busy || !twinList.length"
                  :value="project?.id"
                  @change="onSelectProject($event.target.value)"
                >
                  <option v-for="t in twinList" :key="t.id" :value="t.id">{{ t.name }}</option>
                </select>
              </div>
              <div class="field">
                <label>雾效</label>
                <button class="btn" type="button" :class="{ primary: !fogEnabled }" @click="toggleFog">
                  {{ fogEnabled ? "雾效开" : "雾效关" }}
                </button>
              </div>
              <div class="field">
                <label>图层</label>
                <div class="layer-row" style="border: none; margin: 0; padding: 0">
                  <label v-for="(lab, key) in { assembly: '装配', building: '建筑', decoration: '装饰', road: '马路', device: '设备' }" :key="key">
                    <input
                      type="checkbox"
                      :checked="layerState[key]"
                      @change="viewer.setLayerVisible(key, $event.target.checked)"
                    />
                    {{ lab }}
                  </label>
                </div>
              </div>
              <div class="row-actions" style="flex-wrap: wrap">
                <button class="btn" type="button" @click="viewer.setCameraPreset('orbit')">全景</button>
                <button class="btn" type="button" @click="viewer.setCameraPreset('top')">俯视</button>
                <button class="btn" type="button" @click="toggleSceneFullscreen">
                  {{ sceneFullscreen ? "退出全屏" : "全屏" }}
                </button>
                <button class="btn" type="button" :disabled="busy" @click="saveProject">保存</button>
                <button class="btn" type="button" @click="exportProject">导出</button>
                <label class="btn">
                  导入
                  <input type="file" accept="application/json,.json" hidden @change="importProject" />
                </label>
              </div>
              <div class="row-actions" style="flex-wrap: wrap">
                <router-link class="btn" to="/device-manage">设备管理</router-link>
                <router-link class="btn" to="/scene-manage">场景管理</router-link>
                <button class="btn" type="button" @click="tab = 'scene'; settingsOpen = false">场景面板</button>
                <button class="btn" type="button" @click="tab = 'sim'; settingsOpen = false">控制台面板</button>
              </div>
            </div>
          </div>

          <!-- 天际线式底部控制台 -->
          <div class="cs-console">
            <div class="cs-left">
              <select
                class="cs-process"
                :disabled="busy || !twinList.length"
                :value="project?.id"
                title="切换已有工程"
                @change="onSelectProject($event.target.value)"
              >
                <option v-for="t in twinList" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
            </div>

            <div class="cs-time">
              <button
                class="cs-icon-btn"
                type="button"
                :class="{ on: autoDemo }"
                :title="autoDemo ? '暂停演示' : '自动演示'"
                @click="toggleDemo"
              >
                {{ autoDemo ? "❚❚" : "▶" }}
              </button>
              <div class="cs-clock">
                <strong>{{ hourLabel(rules.sim_hour) }}</strong>
                <small>{{ periodHint }} · {{ currentScene.label }}</small>
              </div>
              <input
                class="cs-hour"
                v-model.number="rules.sim_hour"
                type="range"
                min="0"
                max="23.9"
                step="0.1"
                title="模拟时间"
              />
            </div>

            <div class="cs-tools">
              <button
                v-for="t in CONSOLE_TOOLS"
                :key="t.id"
                type="button"
                class="cs-tool"
                :class="{
                  active: consoleTool === t.id,
                  danger: t.id === 'bulldoze' && bulldozeMode,
                }"
                :title="t.label"
                @click="selectConsoleTool(t)"
              >
                <span class="cs-tool-ico">{{ t.icon }}</span>
                <span class="cs-tool-lab">{{ t.label }}</span>
              </button>
            </div>

            <div class="cs-name" :title="project?.name || ''">
              {{ project?.name || "未命名工程" }}
            </div>

            <div class="cs-right">
              <button
                class="cs-icon-btn"
                type="button"
                :class="{ on: settingsOpen }"
                title="设置"
                @click="toggleSettings"
              >
                ⚙
              </button>
              <button
                class="cs-icon-btn"
                type="button"
                :class="{ on: sceneFullscreen }"
                :title="sceneFullscreen ? '退出全屏' : '全屏'"
                @click="toggleSceneFullscreen"
              >
                {{ sceneFullscreen ? "⛶" : "⛶" }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <aside class="twin-side">
        <div class="twin-tabs twin-tabs-2">
          <button type="button" :class="{ active: tab === 'scene' }" @click="tab = 'scene'">场景</button>
          <button type="button" :class="{ active: tab === 'sim' }" @click="tab = 'sim'">控制台</button>
        </div>

        <section v-show="tab === 'scene'" class="panel twin-panel">
          <h3>工程模板</h3>
          <p class="page-desc" style="margin-top: 0">一键布置常见场景（会替换已放置建造物，不影响整机装配）。</p>
          <div class="row-actions" style="margin-bottom: 12px; flex-wrap: wrap">
            <button
              v-for="t in templates"
              :key="t.id"
              class="btn"
              type="button"
              :title="t.desc"
              @click="applyTemplate(t)"
            >
              {{ t.label }}
            </button>
          </div>

          <h3>整机装配（设备孪生）</h3>
          <p class="page-desc" style="margin-top: 0">
            选择内置路灯或上传 GLB。三视图 / 图库 / 部件请到「设备管理」「场景管理」。城市场景用左侧底部选板建造。
          </p>
          <div class="row-actions" style="margin-bottom: 12px; flex-wrap: wrap">
            <button class="btn primary" type="button" @click="useBuiltinStreetLight">内置路灯示例</button>
            <label class="btn">
              上传 GLB
              <input type="file" accept=".glb,.gltf" hidden :disabled="busy" @change="onUploadAssemblyGlb" />
            </label>
            <span class="meta-text">
              当前：
              {{
                project?.assembly_model?.kind === "glb"
                  ? "已上传 GLB"
                  : project?.assembly_model?.id || "默认程序化"
              }}
            </span>
          </div>
          <h3>场景类型</h3>
          <p class="page-desc" style="margin-top: 0">
            「空地」为平整网格地面，可自由放置；其他类型带预设环境。修改后左侧 3D 会立即重建。
          </p>
          <div class="scene-grid">
            <button
              v-for="s in sceneTypes"
              :key="s.id"
              type="button"
              class="scene-card"
              :class="{ active: currentSceneId === s.id }"
              @click="applySceneType(s.id)"
            >
              <strong>{{ s.label }}</strong>
              <small>{{ s.desc }}</small>
            </button>
          </div>

          <div v-if="currentSceneId === 'room'" class="scene-opts">
            <h4 class="sub-h">分房间查看</h4>
            <p class="meta-text" style="margin: 0 0 8px">
              点击下方空间，镜头飞入单独查看（含窗户与阳台）
            </p>
            <div class="chip-grid room-focus-grid">
              <button
                v-for="p in roomFocusPresets"
                :key="p.id"
                type="button"
                class="chip"
                :class="{ active: roomFocusId === p.id }"
                @click="focusRoomSpace(p.id)"
              >
                {{ p.label }}
              </button>
            </div>
            <h4 class="sub-h">室内户型（默认三室一厅精装）</h4>
            <p class="meta-text" style="margin: 0 0 8px">{{ roomSummary }}</p>
            <div class="grid-2">
              <div class="field">
                <label>室（卧室）</label>
                <input
                  type="number"
                  min="1"
                  max="6"
                  :value="sceneCfg.bedrooms"
                  @change="patchSceneConfig({ bedrooms: Number($event.target.value) || 1 })"
                />
              </div>
              <div class="field">
                <label>厅</label>
                <input
                  type="number"
                  min="0"
                  max="3"
                  :value="sceneCfg.living_rooms"
                  @change="patchSceneConfig({ living_rooms: Number($event.target.value) || 0 })"
                />
              </div>
              <div class="field">
                <label>楼层数</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  :value="sceneCfg.floors"
                  @change="patchSceneConfig({ floors: Number($event.target.value) || 1 })"
                />
              </div>
              <div class="field">
                <label>地下室</label>
                <label class="check-row">
                  <input
                    type="checkbox"
                    :checked="!!sceneCfg.has_basement"
                    @change="patchSceneConfig({ has_basement: $event.target.checked })"
                  />
                  有地下室
                </label>
              </div>
            </div>
          </div>

          <div v-else-if="currentSceneId === 'street'" class="scene-opts">
            <h4 class="sub-h">街道形态</h4>
            <div class="mode-row">
              <button
                v-for="opt in streetLayoutOptions"
                :key="opt.id"
                type="button"
                class="mode-btn"
                :class="{ active: sceneCfg.street_layout === opt.id }"
                @click="patchSceneConfig({ street_layout: opt.id })"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <div v-else-if="currentSceneId === 'greenhouse'" class="scene-opts">
            <h4 class="sub-h">大棚作物</h4>
            <div class="chip-grid">
              <button
                v-for="c in cropOptions"
                :key="c.id"
                type="button"
                class="chip"
                :class="{ active: sceneCfg.crop === c.id }"
                @click="patchSceneConfig({ crop: c.id })"
              >
                {{ c.label }}
              </button>
            </div>
          </div>

          <div v-else-if="currentSceneId === 'farm'" class="scene-opts">
            <h4 class="sub-h">农场种植</h4>
            <div class="chip-grid">
              <button
                v-for="c in farmCropOptions"
                :key="c.id"
                type="button"
                class="chip"
                :class="{ active: sceneCfg.crop === c.id }"
                @click="patchSceneConfig({ crop: c.id })"
              >
                {{ c.label }}
              </button>
            </div>
          </div>

          <div v-else-if="currentSceneId === 'rice_paddy'" class="scene-opts">
            <h4 class="sub-h">稻田水系</h4>
            <label class="check-row">
              <input
                type="checkbox"
                :checked="sceneCfg.has_canal !== false"
                @change="patchSceneConfig({ has_canal: $event.target.checked })"
              />
              显示主渠 / 支渠水渠
            </label>
            <p class="meta-text" style="margin-top: 8px">默认开启田边主渠与进出水支渠。</p>
          </div>

          <p class="meta-text" style="margin-top: 12px">
            当前：{{ currentScene.label }}。选择后立即生效并自动保存。
          </p>

          <h4 class="sub-h" style="margin-top: 16px">建造（天际线式）</h4>
          <p class="meta-text">
            在左侧 3D 画面底部选板：住宅 / 大棚 / 商店 / 装饰 / 马路 / 设备，点选后在地面点击放置。
            马路按网格拖拽铺设，会按铺设方向自动出现直道、拐角、丁字与十字路口。
          </p>
          <p class="meta-text">已放置 {{ (sceneCfg.props || []).length }} 个物体。</p>
          <ul v-if="(sceneCfg.props || []).length" class="prop-list">
            <li v-for="p in sceneCfg.props" :key="p.id">
              <span>{{ p.name || p.asset_id }} · {{ p.kind || p.source || "—" }}</span>
              <button class="btn" type="button" @click="removeSceneProp(p.id)">移除</button>
            </li>
          </ul>
        </section>

        <section v-show="tab === 'sim'" class="panel twin-panel">
          <div class="sim-badge">SIMULATING</div>
          <h3>现场控制台</h3>
          <p class="page-desc" style="margin-top: 0">
            环境光照自适应 · 光敏 → 阈值 → 继电器 → 上报
          </p>

          <div class="field">
            <label>模拟时间（{{ hourLabel(rules.sim_hour) }}）</label>
            <input v-model.number="rules.sim_hour" type="range" min="0" max="23.9" step="0.1" />
          </div>
          <div class="row-actions" style="margin-top: 8px">
            <button class="btn" type="button" @click="setPeriod('noon')">正午</button>
            <button class="btn" type="button" @click="setPeriod('dusk')">黄昏</button>
            <button class="btn" type="button" @click="setPeriod('night')">夜晚</button>
            <button class="btn primary" type="button" @click="toggleDemo">
              {{ autoDemo ? "停止演示" : "自动演示" }}
            </button>
          </div>

          <div class="sim-metrics">
            <div>
              <div class="k">环境光照</div>
              <div class="v">{{ lux }} <small>lx</small></div>
            </div>
            <div>
              <div class="k">开灯阈值</div>
              <div class="v">{{ rules.threshold_lx }} <small>lx</small></div>
            </div>
          </div>

          <div class="grid-2" style="margin-top: 12px">
            <div class="field">
              <label>阈值 (lx)</label>
              <input v-model.number="rules.threshold_lx" type="number" min="1" max="500" />
            </div>
            <div class="field">
              <label>回差倍数</label>
              <input v-model.number="rules.hysteresis" type="number" min="1" max="5" step="0.1" />
            </div>
          </div>

          <div class="field" style="margin-top: 8px">
            <label>工作模式</label>
            <div class="mode-row">
              <button
                type="button"
                class="mode-btn"
                :class="{ active: rules.mode === 'auto' }"
                @click="rules.mode = 'auto'"
              >
                自动
              </button>
              <button
                type="button"
                class="mode-btn"
                :class="{ active: rules.mode === 'manual' }"
                @click="rules.mode = 'manual'"
              >
                手动
              </button>
            </div>
          </div>

          <div v-if="rules.mode === 'manual'" class="row-actions">
            <button
              class="btn primary"
              type="button"
              @click="rules.manual_lamp_on = !rules.manual_lamp_on"
            >
              {{ rules.manual_lamp_on ? "手动关灯" : "手动开灯" }}
            </button>
          </div>

          <h4 class="sub-h">系统数据流</h4>
          <ol class="flow">
            <li v-for="s in steps" :key="s.id" :class="{ on: s.active }">
              <span>{{ s.id }}</span>{{ s.label }}
            </li>
          </ol>

          <h4 class="sub-h">近期光照采样</h4>
          <div class="hist">
            <div
              v-for="(h, i) in history"
              :key="i"
              class="hist-bar"
              :class="{ lit: h.on }"
              :style="{ height: `${Math.max(8, (h.lux / 1000) * 100)}%` }"
              :title="`${h.t} · ${h.lux}lx`"
            />
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.twin-page {
  min-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
}
.twin-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.twin-head-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.twin-select {
  min-width: 160px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line);
  background: var(--surface-solid);
}
.twin-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
}
.twin-stage {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px;
}
.twin-stage-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
}
.twin-cam {
  margin-left: auto;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.twin-canvas-wrap {
  position: relative;
  flex: 1;
  min-height: 420px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--line);
  background: linear-gradient(160deg, #e8f0ea, #d5e0d8 50%, #cfd8d3);
}
.twin-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.twin-hint {
  position: absolute;
  left: 12px;
  top: 10px;
  right: 12px;
  font-size: 12px;
  color: rgba(26, 36, 32, 0.7);
  pointer-events: none;
  z-index: 4;
}
.twin-side {
  flex: 0 0 auto;
  min-height: 0;
  max-height: min(38vh, 380px);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.twin-tabs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  flex: 0 0 auto;
}
.twin-tabs-2 {
  grid-template-columns: repeat(2, 1fr);
}
.scene-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
}
.scene-card {
  text-align: left;
  border: 1px solid var(--line);
  background: var(--surface-solid);
  border-radius: 12px;
  padding: 12px;
  cursor: pointer;
  display: grid;
  gap: 4px;
}
.scene-card strong {
  font-size: 14px;
}
.scene-card small {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
}
.scene-card.active {
  border-color: transparent;
  background: var(--accent-soft);
  color: var(--accent-deep);
}
.scene-card.active small {
  color: var(--accent-deep);
  opacity: 0.85;
}
.scene-opts {
  margin-top: 14px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
}
.chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  border: 1px solid var(--line);
  background: var(--surface-solid);
  border-radius: 999px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
}
.chip.active {
  background: var(--accent);
  color: #fff;
  border-color: transparent;
}
.room-focus-grid {
  margin-bottom: 4px;
}
.check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  margin-top: 6px;
}
.twin-tabs button {
  border: 1px solid var(--line);
  background: var(--surface);
  border-radius: 999px;
  padding: 8px 6px;
  cursor: pointer;
  color: var(--ink-soft);
}
.twin-tabs button.active {
  background: var(--accent-soft);
  color: var(--accent-deep);
  border-color: transparent;
  font-weight: 600;
}
.twin-panel {
  flex: 1;
  overflow: auto;
  min-height: 0;
  max-height: 100%;
}
.sim-badge {
  display: inline-block;
  font-size: 11px;
  letter-spacing: 0.12em;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(31, 107, 82, 0.12);
  color: var(--accent-deep);
  margin-bottom: 8px;
}
.sim-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 14px;
}
.sim-metrics .k {
  font-size: 12px;
  color: var(--muted);
}
.sim-metrics .v {
  font-family: var(--font-num);
  font-size: 28px;
  font-weight: 600;
  line-height: 1.1;
}
.sim-metrics small {
  font-size: 13px;
  color: var(--muted);
}
.mode-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.mode-btn {
  border: 1px solid var(--line);
  background: var(--surface-solid);
  border-radius: var(--radius-sm);
  padding: 10px;
  cursor: pointer;
}
.mode-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: transparent;
}
.sub-h {
  margin: 18px 0 8px;
  font-size: 13px;
  color: var(--muted);
  font-weight: 600;
}
.flow {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.flow li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--surface-2);
  color: var(--muted);
  font-size: 13px;
}
.flow li.on {
  background: var(--accent-soft);
  color: var(--accent-deep);
  font-weight: 600;
}
.flow li span {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.7);
  font-size: 12px;
}
.hist {
  height: 72px;
  display: flex;
  align-items: flex-end;
  gap: 2px;
  padding: 6px;
  border-radius: 10px;
  background: var(--surface-2);
}
.hist-bar {
  flex: 1;
  min-width: 3px;
  border-radius: 2px 2px 0 0;
  background: rgba(31, 107, 82, 0.35);
}
.hist-bar.lit {
  background: var(--straw);
}
.prop-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
  max-height: 160px;
  overflow: auto;
}
.prop-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 13px;
}
.hud-sensors {
  position: absolute;
  top: 14px;
  right: 12px;
  z-index: 7;
  min-width: 148px;
  max-width: 220px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.35);
  backdrop-filter: blur(10px);
  display: grid;
  gap: 6px;
  pointer-events: none;
}
.hud-sensors-title {
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--muted);
  text-transform: uppercase;
}
.hud-sensor-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  color: var(--ink-soft);
}
.hud-sensor-row strong {
  color: var(--ink);
  font-weight: 600;
  font-family: var(--font-num);
}
.hud-sensor-row small {
  font-weight: 500;
  color: var(--muted);
}
.hud-alerts {
  position: absolute;
  top: 14px;
  left: 12px;
  z-index: 7;
  min-width: 180px;
  max-width: 260px;
  max-height: min(46vh, 360px);
  overflow: auto;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(10px);
  display: grid;
  gap: 6px;
  pointer-events: auto;
}
.hud-alerts-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.hud-alerts-head strong {
  font-size: 13px;
}
.hud-alerts-opt {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}
.hud-alert-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  text-align: left;
  border: 1px solid var(--line);
  background: var(--surface-solid);
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
}
.hud-alert-item .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 5px;
  flex-shrink: 0;
  background: var(--straw);
}
.hud-alert-item.warn .dot {
  background: #f59e0b;
}
.hud-alert-item.alarm .dot {
  background: #ef4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.25);
}
.hud-alert-item .txt {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.hud-alert-item strong {
  font-size: 13px;
}
.hud-alert-item small {
  color: var(--muted);
  font-size: 12px;
}
.hud-fs-exit {
  position: absolute;
  top: 14px;
  left: 12px;
  z-index: 8;
}
.twin-canvas-wrap:fullscreen .hud-fs-exit,
.twin-canvas-wrap.is-fs-root .hud-fs-exit {
  left: auto;
  right: 12px;
  top: 14px;
}
/* —— 天际线式底部控制台 —— */
.cs-console {
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  z-index: 8;
  width: min(1080px, calc(100% - 20px));
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 16px;
  background: rgba(22, 28, 36, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(14px);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
  color: #e8eef5;
  pointer-events: auto;
}
.cs-left {
  flex: 0 0 auto;
  max-width: 150px;
}
.cs-process {
  width: 100%;
  max-width: 150px;
  padding: 7px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: #f1f5f9;
  font-size: 12px;
}
.cs-process option {
  color: #0f172a;
}
.cs-time {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 1 220px;
  min-width: 0;
}
.cs-clock {
  display: grid;
  gap: 1px;
  min-width: 0;
}
.cs-clock strong {
  font-family: var(--font-num);
  font-size: 15px;
  line-height: 1.1;
  white-space: nowrap;
}
.cs-clock small {
  font-size: 10px;
  color: rgba(226, 232, 240, 0.7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cs-hour {
  width: 72px;
  accent-color: #38bdf8;
}
.cs-tools {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
}
.cs-tool {
  display: grid;
  gap: 2px;
  justify-items: center;
  min-width: 52px;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: #e2e8f0;
  cursor: pointer;
}
.cs-tool:hover {
  background: rgba(255, 255, 255, 0.1);
}
.cs-tool.active {
  background: rgba(56, 189, 248, 0.22);
  border-color: rgba(56, 189, 248, 0.45);
  color: #fff;
}
.cs-tool.danger {
  background: rgba(248, 113, 113, 0.25);
  border-color: rgba(248, 113, 113, 0.5);
}
.cs-tool-ico {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.12);
  font-size: 12px;
  font-weight: 700;
}
.cs-tool-lab {
  font-size: 10px;
  letter-spacing: 0.02em;
}
.cs-name {
  flex: 0 1 120px;
  min-width: 0;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 12px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cs-right {
  display: flex;
  gap: 6px;
  flex: 0 0 auto;
}
.cs-icon-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
  cursor: pointer;
  display: grid;
  place-items: center;
  font-size: 14px;
}
.cs-icon-btn.on {
  background: rgba(56, 189, 248, 0.28);
  border-color: rgba(56, 189, 248, 0.5);
}
.cs-palette {
  position: absolute;
  left: 50%;
  bottom: 78px;
  transform: translateX(-50%);
  z-index: 7;
  width: min(920px, calc(100% - 24px));
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(22, 28, 36, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(12px);
  color: #e2e8f0;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
}
.cs-palette .build-item {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.14);
  color: #f1f5f9;
}
.cs-palette .build-item small {
  color: rgba(226, 232, 240, 0.65);
}
.cs-palette .build-item.active {
  background: rgba(56, 189, 248, 0.22);
  outline-color: #38bdf8;
}
.cs-palette .meta-text {
  color: rgba(226, 232, 240, 0.7);
}
.cs-settings {
  position: absolute;
  right: 12px;
  bottom: 78px;
  z-index: 9;
  width: min(360px, calc(100% - 24px));
  padding: 12px;
  border-radius: 14px;
  background: rgba(22, 28, 36, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(14px);
  color: #e2e8f0;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.3);
}
.cs-settings-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.cs-settings-body {
  display: grid;
  gap: 10px;
}
.cs-settings .field label {
  color: rgba(226, 232, 240, 0.75);
}
.cs-settings .layer-row {
  color: #e2e8f0;
}
.cs-settings .twin-select {
  width: 100%;
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
  border-color: rgba(255, 255, 255, 0.18);
}
/* 仅场景画布进入浏览器全屏（非整站） */
.twin-canvas-wrap:fullscreen,
.twin-canvas-wrap:-webkit-full-screen,
.twin-canvas-wrap.is-fs-root {
  width: 100vw;
  height: 100vh;
  max-width: none;
  max-height: none;
  border-radius: 0;
  border: none;
  background: #0f172a;
}
.twin-canvas-wrap:fullscreen .twin-canvas,
.twin-canvas-wrap:-webkit-full-screen .twin-canvas,
.twin-canvas-wrap.is-fs-root .twin-canvas {
  width: 100%;
  height: 100%;
}
.cs-palette .build-items {
  margin-bottom: 6px;
}
.build-cats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.build-cats button {
  border: 1px solid var(--line);
  background: var(--surface-solid);
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12px;
  cursor: pointer;
}
.build-cats button.active {
  background: var(--accent-soft);
  color: var(--accent-deep);
  border-color: transparent;
  font-weight: 600;
}
.build-items {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 4px;
  min-height: 54px;
  align-items: stretch;
}
.build-item {
  flex: 0 0 auto;
  min-width: 88px;
  max-width: 120px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  border-radius: 10px;
  padding: 6px 8px;
  text-align: left;
  cursor: pointer;
  display: grid;
  gap: 2px;
}
.build-item strong {
  font-size: 12px;
  line-height: 1.2;
}
.build-item small {
  color: var(--muted);
  font-size: 10px;
}
.build-item.active {
  outline: 2px solid var(--accent);
  background: var(--accent-soft);
}
.build-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.layer-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  margin: 0 0 8px;
  padding: 4px 2px 8px;
  border-bottom: 1px dashed var(--line);
  font-size: 12px;
  color: var(--ink-soft);
}
.layer-row label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  user-select: none;
}
.layer-row input {
  accent-color: var(--accent);
}
.prop-inspector {
  position: absolute;
  top: 14px;
  left: 12px;
  z-index: 6;
  min-width: 180px;
  max-width: 240px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12);
  display: grid;
  gap: 6px;
  font-size: 13px;
}
.prop-inspector strong {
  font-size: 14px;
}
.bind-row {
  display: grid;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
}
.bind-row select {
  width: 100%;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--surface-solid);
  color: var(--ink);
}
.bind-val {
  font-size: 12px;
  color: var(--accent-deep);
  font-weight: 600;
}
@media (max-width: 900px) {
  .twin-page {
    overflow: auto;
  }
  .twin-layout {
    overflow: visible;
  }
  .twin-stage {
    flex: 0 0 auto;
  }
  .twin-canvas-wrap {
    min-height: 320px;
    height: 48vh;
  }
  .twin-side {
    max-height: none;
  }
  .prop-inspector {
    left: 12px;
    right: 12px;
    max-width: none;
  }
}
</style>
