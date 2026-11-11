<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, connectRealtime } from "../api";
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
  anyActuatorOn,
  collectAlerts,
  collectDeviceStatuses,
  isActuatorProperty,
  isBooleanLike,
  mergeDemoShadow,
  truthyOn,
} from "../twin/deviceStatus";
import { resolveIndoorPlace } from "../twin/indoorSnap";
import { PLACE_CATEGORIES, SCENE_KIND_LABEL, resolveSnap } from "../twin/placeCatalog";
import { autotileRoadProps, isRoadNetworkProp } from "../twin/roadAutotile";
import { autotileUtilityProps, isUtilityKind } from "../twin/utilityNetwork";
import {
  addWaterLink,
  addWireLink,
  annotateWaterLinksConnectivity,
  annotateWireLinksConnectivity,
  deviceControlRole,
  devicesCircuitConnected,
  devicesWaterConnected,
  getSensorControlRule,
  isWaterControlProp,
  linkableControlTargets,
  linkableWaterTargets,
  listWaterLinks,
  listWireLinks,
  removeWaterLink,
  removeWireLink,
  resolveLinkedWritesCascade,
  resolveWaterLinkedWritesCascade,
} from "../twin/wireLinks";
import {
  DATA_SOURCE_CLOUD,
  DATA_SOURCE_LINEAR,
  DEFAULT_LINEAR_CHANNELS,
  isLinearDataSource,
  normalizeLinearChannels,
  sampleLinearShadow,
} from "../twin/linearData";
import {
  SCENE_TYPE_BASES,
  SCENE_TYPES,
  getSceneType,
  listSceneTypes,
  resolveEnvId,
  resolveSceneTypeRef,
  sceneTypeFromTemplate,
  setCustomSceneTypeCache,
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
const customSceneTypes = ref([]);
const showSceneTypeForm = ref(false);
const sceneTypeBusy = ref(false);
const sceneTypeForm = reactive({
  id: "",
  name: "",
  desc: "",
  base: "blank",
  bg: "#e8eee9",
  editing: false,
});
const placeCategory = ref("road");
const placeBrushId = ref("");
const shadowProps = ref({});
/** 云端写失败时本地覆盖，保证演示可双向控制 */
const localShadowOverrides = ref({});
const metricOptions = ref([]);
const metricMeta = ref({}); // property -> { writable, type, unit, name }
const shadowConnected = ref(false);
const controlBusy = ref(false);
const draftNumberValue = ref("");
const buildHist = createBuildHistory();
const canUndo = ref(false);
const canRedo = ref(false);
const paintBatch = ref(null); // 拖拽铺路/管网期间暂存
let paintRefreshTimer = null;
let paintRefreshDirty = false;
const tourBusy = ref(false);
let tourToken = 0;

function isPaintNetworkKind(kind) {
  return kind === "road" || isUtilityKind(kind);
}

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
  { id: "device", label: "设备", icon: "设", cat: "device" },
  { id: "circuit", label: "电路", icon: "电", cat: "circuit" },
  { id: "water", label: "水", icon: "水", cat: "water" },
  { id: "green", label: "绿化", icon: "绿", cat: "decoration" },
  { id: "bulldoze", label: "推土机", icon: "拆", action: "bulldoze" },
];
const linkTargetDraft = ref("");
const annCount = computed(() => countAnnotations(project.value?.annotations || {}));
const sceneTypes = computed(() => listSceneTypes(customSceneTypes.value));
const builtinSceneTypes = SCENE_TYPES;
const currentSceneId = computed(() => {
  const raw = project.value?.scene_type || project.value?.template || "street";
  return resolveSceneTypeRef(raw, customSceneTypes.value).id;
});
const currentScene = computed(() => getSceneType(currentSceneId.value, customSceneTypes.value));
const currentEnvId = computed(() => resolveEnvId(currentScene.value, customSceneTypes.value));
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
  const id = currentEnvId.value;
  if (id === "room") return lampOn.value ? "灯已点亮" : "灯已熄灭";
  if (id === "greenhouse" || id === "farm") return lampOn.value ? "执行器已动作" : "执行器待机";
  if (id === "rice_paddy") return lampOn.value ? "闸泵联动中" : "闸泵待机";
  return lampOn.value ? "路灯已点亮" : "路灯已熄灭";
});
const sceneTypeBaseOptions = computed(() =>
  builtinSceneTypes.map((s) => ({ id: s.id, label: s.label }))
);

const rules = reactive({
  threshold_lx: 80,
  hysteresis: 1.5,
  mode: "auto",
  manual_lamp_on: false,
  sim_hour: 16.9,
  /** 数据源：cloud=华为云影子；linear=指定线性随机模拟 */
  data_source: DATA_SOURCE_CLOUD,
  linear_interval_ms: 800,
  linear_channels: DEFAULT_LINEAR_CHANNELS.map((c) => ({ ...c })),
});

const lux = computed(() => luxFromHour(rules.sim_hour));
const lampOn = ref(false);
const linearShadow = ref({});
const linearElapsedSec = ref(0);
let linearTimer = null;
let linearStartedAt = 0;

const usingLinearData = computed(() => isLinearDataSource(rules.data_source));
const linearChannels = computed(() => normalizeLinearChannels(rules.linear_channels));

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

/** 云端影子 / 线性模拟 + 本地演示量 + 本地覆盖（写属性优先） */
const effectiveShadow = computed(() => {
  const base = usingLinearData.value
    ? { ...linearShadow.value }
    : mergeDemoShadow(shadowProps.value, {
        lux: lux.value,
        lampOn: lampOn.value,
        simHour: rules.sim_hour,
      });
  return { ...base, ...localShadowOverrides.value };
});

const dataSourceLabel = computed(() =>
  usingLinearData.value ? "线性模拟" : shadowConnected.value ? "华为云影子" : "华为云（未连）"
);

const selectedBindingKey = computed(() =>
  String(selectedPlaced.value?.binding?.property || "").trim()
);

const selectedIsActuator = computed(() => isActuatorProperty(selectedBindingKey.value));

const selectedDeviceRole = computed(() => deviceControlRole(selectedPlaced.value));

const selectedIsSwitch = computed(() => {
  if (selectedDeviceRole.value === "switch") return true;
  if (selectedDeviceRole.value === "sensor") return false;
  if (!selectedBindingKey.value) return false;
  const v = effectiveShadow.value[selectedBindingKey.value];
  if (v === undefined || v === null) return selectedIsActuator.value;
  return isBooleanLike(v) || selectedIsActuator.value;
});

const selectedIsSensor = computed(() => selectedDeviceRole.value === "sensor");

const selectedThresholds = computed(() => {
  const b = selectedPlaced.value?.binding || {};
  return {
    warnMin: b.warnMin ?? "",
    warnMax: b.warnMax ?? "",
    alarmMin: b.alarmMin ?? "",
    alarmMax: b.alarmMax ?? "",
    controlThreshold: b.controlThreshold ?? "",
    controlWhen: b.controlWhen === "below" ? "below" : "above",
    controlHysteresis: b.controlHysteresis ?? "",
  };
});

const selectedSensorControl = computed(() => getSensorControlRule(selectedPlaced.value));

const selectedIsWaterDevice = computed(() => isWaterControlProp(selectedPlaced.value));

const wireLinks = computed(() => listWireLinks(sceneCfg.value));
const waterLinks = computed(() => listWaterLinks(sceneCfg.value));

const annotatedWireLinks = computed(() =>
  annotateWireLinksConnectivity(project.value?.scene_config?.props || [], wireLinks.value)
);
const annotatedWaterLinks = computed(() =>
  annotateWaterLinksConnectivity(project.value?.scene_config?.props || [], waterLinks.value)
);

const selectedOutgoingLinks = computed(() => {
  const id = selectedPropId.value;
  if (!id) return [];
  const props = project.value?.scene_config?.props || [];
  const byId = Object.fromEntries(props.map((p) => [p.id, p]));
  return annotatedWireLinks.value
    .filter((l) => l.from === id)
    .map((l) => ({
      ...l,
      toName: byId[l.to]?.name || l.to,
      toProperty: byId[l.to]?.binding?.property || "",
    }));
});

const selectedOutgoingWaterLinks = computed(() => {
  const id = selectedPropId.value;
  if (!id) return [];
  const props = project.value?.scene_config?.props || [];
  const byId = Object.fromEntries(props.map((p) => [p.id, p]));
  return annotatedWaterLinks.value
    .filter((l) => l.from === id)
    .map((l) => ({
      ...l,
      toName: byId[l.to]?.name || l.to,
      toProperty: byId[l.to]?.binding?.property || "",
    }));
});

/** 电线下游可选目标（按角色：开关→模块；传感器→开关/模块） */
const linkableActuators = computed(() => {
  const from = selectedPlaced.value;
  const linked = new Set(selectedOutgoingLinks.value.map((l) => l.to));
  return linkableControlTargets(project.value?.scene_config?.props || [], from).filter(
    (p) => !linked.has(p.id)
  );
});

const linkableWaterDevices = computed(() => {
  const from = selectedPlaced.value;
  const linked = new Set(selectedOutgoingWaterLinks.value.map((l) => l.to));
  return linkableWaterTargets(project.value?.scene_config?.props || [], from).filter(
    (p) => !linked.has(p.id)
  );
});

const wireLinkHint = computed(() => {
  const role = selectedDeviceRole.value;
  if (role === "switch") return "电线连接（开关 → 直接控制模块，可多级连带）";
  if (role === "sensor") return "电线连接（传感器 → 阈值控制开关/模块，可多级连带）";
  return "电线连接（→ 下游模块）";
});

const waterLinkDraft = ref("");

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
let realtimeWs = null;

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
  const rawType = item.scene_type || item.template || "street";
  const resolved = resolveSceneTypeRef(rawType, customSceneTypes.value);
  if (resolved.missing) {
    item._sceneTypeMissing = resolved.fallbackFrom;
    item.scene_type = resolved.id;
    item.template = getSceneType(resolved.id, customSceneTypes.value).template;
  } else {
    item._sceneTypeMissing = "";
    item.scene_type = resolved.id;
  }
  const scene = getSceneType(resolved.id, customSceneTypes.value);
  const envId = resolveEnvId(scene, customSceneTypes.value);
  if (!Array.isArray(item.parts) || !item.parts.length) {
    item.parts = (scene.parts || BUILTIN_PARTS).map((p) => ({ ...p }));
  } else {
    item.parts = mergePartOptions(item.parts);
  }
  if (!item.template) {
    item.template = scene.template;
  }
  item.scene_config = mergeSceneConfig(envId, item.scene_config || {});
  if (!item.assembly_model) {
    item.assembly_model =
      envId === "street"
        ? { kind: "builtin", id: "street_light" }
        : { kind: "builtin", id: null };
  }
  if (!Array.isArray(item.scene_config.props)) {
    item.scene_config.props = item.scene_config.props || [];
  }
  item.scene_config.props = autotileUtilityProps(
    autotileRoadProps(item.scene_config.props, 2),
    1
  );
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

async function loadCustomSceneTypes() {
  try {
    const res = await api.librarySceneTypes();
    customSceneTypes.value = res.items || [];
    setCustomSceneTypeCache(customSceneTypes.value);
    viewer.setCustomSceneTypes(customSceneTypes.value);
  } catch {
    customSceneTypes.value = [];
    setCustomSceneTypeCache([]);
    viewer.setCustomSceneTypes([]);
  }
}

async function loadProject(id = "street_light") {
  // 切工程前记下当前镜头
  persistCamera();
  busy.value = true;
  try {
    const res = await api.getTwin(id);
    project.value = ensureAnnotations(res.item);
    Object.assign(rules, res.item.rules || {});
    if (!rules.data_source) rules.data_source = DATA_SOURCE_CLOUD;
    rules.linear_channels = normalizeLinearChannels(rules.linear_channels);
    if (!Number.isFinite(Number(rules.linear_interval_ms))) rules.linear_interval_ms = 800;
    await mountScene();
    if (usingLinearData.value) startLinearData();
    else stopLinearData();
    recomputeLamp();
    syncDeviceStatusViz();
    if (project.value._sceneTypeMissing) {
      setMsg(
        `自定义场景类型「${project.value._sceneTypeMissing}」已不存在，已降级为「${currentScene.value.label}」`,
        "err"
      );
      voidAutoSave(0);
    } else {
      setMsg(`已加载工程「${res.item.name}」`, "ok");
    }
  } catch (e) {
    setMsg(e.message, "err");
  } finally {
    busy.value = false;
  }
}

async function mountScene() {
  await nextTick();
  if (!canvasRef.value || !project.value) return;
  const sceneType = currentSceneId.value;
  const envId = currentEnvId.value;
  viewer.setCustomSceneTypes(customSceneTypes.value);
  viewer.init(canvasRef.value, {
    views: project.value.views,
    annotations: project.value.annotations,
    sceneType,
    sceneConfig: project.value.scene_config || defaultSceneConfig(envId),
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
  // 设备 / 绿化图层强制开启，避免旧工程 layers 关闭导致放置不可见
  viewer.setLayerVisible("device", true);
  viewer.setLayerVisible("decoration", true);
  viewer.setLayerVisible("road", true);
  viewer.setLayerVisible("building", true);
  viewer.setLayerVisible("water", true);
  const cam = project.value.scene_config?.camera;
  if (cam) {
    nextTick(() => viewer.restoreCameraState(cam));
  } else if (envId === "room") {
    nextTick(() => focusRoomSpace("overview"));
  }
  viewer.setCircuitVisible(false);
  refreshWireLinkLines();
}

function applySceneType(sceneId, { replaceParts = true } = {}) {
  if (!project.value) return;
  const meta = getSceneType(sceneId, customSceneTypes.value);
  const envId = resolveEnvId(meta, customSceneTypes.value);
  project.value.template = meta.template;
  project.value.scene_type = meta.id;
  project.value._sceneTypeMissing = "";
  project.value.scene_config = defaultSceneConfig(envId);
  if (envId === "street" && !project.value.assembly_model?.url) {
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
    if (envId === "room") {
      focusRoomSpace("overview");
    } else {
      viewer.setCameraPreset("orbit");
    }
  });
  setMsg(`已切换场景「${meta.label}」并自动保存`, "ok");
  voidAutoSave();
}

function resetSceneTypeForm() {
  sceneTypeForm.id = "";
  sceneTypeForm.name = "";
  sceneTypeForm.desc = "";
  sceneTypeForm.base = "blank";
  sceneTypeForm.bg = "#e8eee9";
  sceneTypeForm.editing = false;
  showSceneTypeForm.value = false;
}

function openCreateSceneType() {
  resetSceneTypeForm();
  showSceneTypeForm.value = true;
  const baseMeta = getSceneType(sceneTypeForm.base);
  sceneTypeForm.bg = "#" + (baseMeta.bg >>> 0).toString(16).padStart(6, "0");
}

function openEditSceneType(meta) {
  if (!meta || meta.builtin) return;
  sceneTypeForm.editing = true;
  sceneTypeForm.id = meta.id;
  sceneTypeForm.name = meta.label;
  sceneTypeForm.desc = meta.desc || "";
  sceneTypeForm.base = meta.base || "blank";
  sceneTypeForm.bg =
    typeof meta.bg === "number"
      ? "#" + (meta.bg >>> 0).toString(16).padStart(6, "0")
      : String(meta.bg || "#e8eee9");
  showSceneTypeForm.value = true;
}

function onSceneTypeBaseChange() {
  if (sceneTypeForm.editing) return;
  const baseMeta = getSceneType(sceneTypeForm.base);
  sceneTypeForm.bg = "#" + (baseMeta.bg >>> 0).toString(16).padStart(6, "0");
}

async function saveSceneTypeForm() {
  const name = sceneTypeForm.name.trim();
  if (!name) {
    setMsg("请填写场景类型名称", "err");
    return;
  }
  const editing = sceneTypeForm.editing;
  const editId = sceneTypeForm.id;
  const base = SCENE_TYPE_BASES.includes(sceneTypeForm.base)
    ? sceneTypeForm.base
    : "blank";
  const baseMeta = getSceneType(base);
  const body = {
    id: editing ? editId : undefined,
    name,
    desc: sceneTypeForm.desc.trim(),
    base,
    bg: sceneTypeForm.bg || undefined,
    parts: (baseMeta.parts || []).map((p) => ({ ...p })),
  };
  sceneTypeBusy.value = true;
  try {
    let saved;
    if (editing) {
      saved = await api.updateLibrarySceneType(editId, body);
    } else {
      saved = await api.saveLibrarySceneType(body);
    }
    await loadCustomSceneTypes();
    const savedId = saved?.item?.id || editId;
    resetSceneTypeForm();
    setMsg(editing ? "场景类型已更新" : "场景类型已创建", "ok");
    if (savedId) applySceneType(savedId);
  } catch (e) {
    setMsg(e.message || "保存失败", "err");
  } finally {
    sceneTypeBusy.value = false;
  }
}

async function removeCustomSceneType(meta) {
  if (!meta || meta.builtin) return;
  if (!window.confirm(`删除自定义场景类型「${meta.label}」？引用它的工程将降级到空地。`)) {
    return;
  }
  sceneTypeBusy.value = true;
  try {
    await api.deleteLibrarySceneType(meta.id);
    const wasActive = currentSceneId.value === meta.id;
    await loadCustomSceneTypes();
    if (wasActive) applySceneType("blank");
    setMsg(`已删除「${meta.label}」`, "ok");
  } catch (e) {
    setMsg(e.message || "删除失败", "err");
  } finally {
    sceneTypeBusy.value = false;
  }
}

function focusRoomSpace(id) {
  const preset = ROOM_FOCUS_PRESETS.find((p) => p.id === id) || ROOM_FOCUS_PRESETS[0];
  roomFocusId.value = preset.id;
  viewer.focusLookAt(preset.target, preset.pos);
  setMsg(`查看「${preset.label}」`, "ok");
}

function patchSceneConfig(patch) {
  if (!project.value) return;
  const st = currentEnvId.value;
  project.value.scene_config = mergeSceneConfig(st, {
    ...(project.value.scene_config || {}),
    ...patch,
  });
  // 仅改 props / 连线时不要重建整套环境（会导致放置物闪没或竞态）
  const keys = Object.keys(patch || {});
  const propsOnly =
    keys.length > 0 &&
    keys.every((k) => k === "props" || k === "wire_links" || k === "water_links");
  if (!propsOnly) {
    viewer.setSceneConfig(project.value.scene_config, { resetParts: false });
  }
  voidAutoSave();
}

function recomputeLamp() {
  // 规则判定 + 已绑定执行器影子（任一开则亮）
  const byRule = nextLampState({
    lux: lux.value,
    lampOn: lampOn.value,
    threshold: rules.threshold_lx,
    hysteresis: rules.hysteresis,
    mode: rules.mode,
    manualOn: rules.manual_lamp_on,
  });
  const act = anyActuatorOn(project.value?.scene_config?.props || [], effectiveShadow.value);
  lampOn.value = act === null ? byRule : byRule || act === true;
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

function persistLinearChannels() {
  rules.linear_channels = normalizeLinearChannels(rules.linear_channels);
}

function tickLinearData() {
  if (!usingLinearData.value) return;
  if (!linearStartedAt) linearStartedAt = performance.now();
  linearElapsedSec.value = (performance.now() - linearStartedAt) / 1000;
  // 先清掉「已被线性通道覆盖」的手动覆盖，避免关掉线性源后残留；
  // 但保留不在通道列表里的键（例如联动写入的执行器）。
  const sample = sampleLinearShadow(rules.linear_channels, linearElapsedSec.value);
  const channelKeys = new Set(Object.keys(sample));
  if (Object.keys(localShadowOverrides.value).length) {
    const next = { ...localShadowOverrides.value };
    for (const k of channelKeys) delete next[k];
    localShadowOverrides.value = next;
  }
  linearShadow.value = sample;
  syncDeviceStatusViz();
  recomputeLamp();
  syncDraftNumber();
  void evalSensorWireLinks([...channelKeys]);
}

function stopLinearData() {
  clearInterval(linearTimer);
  linearTimer = null;
}

function startLinearData() {
  stopLinearData();
  if (!usingLinearData.value) return;
  persistLinearChannels();
  linearStartedAt = performance.now();
  tickLinearData();
  const ms = Math.max(200, Number(rules.linear_interval_ms) || 800);
  linearTimer = setInterval(tickLinearData, ms);
}

function setDataSource(source) {
  const next = isLinearDataSource(source) ? DATA_SOURCE_LINEAR : DATA_SOURCE_CLOUD;
  rules.data_source = next;
  localShadowOverrides.value = {};
  if (next === DATA_SOURCE_LINEAR) {
    if (!Array.isArray(rules.linear_channels) || !rules.linear_channels.length) {
      rules.linear_channels = DEFAULT_LINEAR_CHANNELS.map((c) => ({ ...c }));
    }
    persistLinearChannels();
    startLinearData();
    setMsg("已切换为线性模拟数据（不读华为云）", "ok");
  } else {
    stopLinearData();
    refreshShadow().catch(() => {});
    setMsg("已切换为华为云影子数据", "ok");
  }
  queueAutoSave(0);
}

function addLinearChannel() {
  const used = new Set(linearChannels.value.map((c) => c.property));
  const hint =
    metricOptions.value.find((k) => !used.has(k)) ||
    `metric_${linearChannels.value.length + 1}`;
  rules.linear_channels = [
    ...linearChannels.value,
    {
      property: hint,
      min: 0,
      max: 100,
      periodSec: 40,
      noise: 1,
      decimals: 1,
      boolean: false,
    },
  ];
  persistLinearChannels();
  if (usingLinearData.value) startLinearData();
  queueAutoSave(0);
}

function removeLinearChannel(idx) {
  const list = [...linearChannels.value];
  list.splice(idx, 1);
  rules.linear_channels = list.length
    ? list
    : DEFAULT_LINEAR_CHANNELS.map((c) => ({ ...c }));
  persistLinearChannels();
  if (usingLinearData.value) startLinearData();
  queueAutoSave(0);
}

function patchLinearChannel(idx, fields) {
  const list = linearChannels.value.map((c, i) =>
    i === idx ? { ...c, ...fields } : { ...c }
  );
  rules.linear_channels = normalizeLinearChannels(list);
  if (usingLinearData.value) tickLinearData();
  queueAutoSave(400);
}

function resetLinearChannels() {
  rules.linear_channels = DEFAULT_LINEAR_CHANNELS.map((c) => ({ ...c }));
  persistLinearChannels();
  if (usingLinearData.value) startLinearData();
  setMsg("已恢复默认线性通道", "ok");
  queueAutoSave(0);
}

let autoSaveTimer = null;
let saving = false;

function buildSaveBody() {
  persistCamera();
  return {
    name: project.value.name,
    template: project.value.template,
    scene_type:
      project.value.scene_type ||
      sceneTypeFromTemplate(project.value.template, customSceneTypes.value),
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

/** 直道/路口等由自动拼装生成，面板只留一块「马路砖」 */
const MERGED_ROAD_VARIANTS = new Set([
  "road_straight",
  "road_cross",
  "road_t",
  "road_curve",
]);

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
    .filter((s) => !(s.kind === "road" && MERGED_ROAD_VARIANTS.has(s.id)))
    .map((s) => {
      const isGlb = s.model?.kind === "glb" || s.model?.kind === "gltf";
      const name =
        s.id === "road_tile" || s.model?.id === "road_tile"
          ? "马路砖（点到点 / 自动成型）"
          : s.id === "util_circuit" || s.model?.id === "util_circuit"
            ? "电路（点到点 / 自动接管）"
            : s.id === "util_water" || s.model?.id === "util_water"
              ? "水管（点到点 / 自动接管）"
              : s.name;
      return {
        id: s.id,
        name,
        kind: s.kind,
        model: s.model,
        snap: resolveSnap({ kind: s.kind, source: "scene", snap: s.snap }, gs),
        source: "scene",
        badge: isGlb
          ? `精细 · ${SCENE_KIND_LABEL[s.kind] || s.kind}`
          : SCENE_KIND_LABEL[s.kind] || s.kind,
      };
    });
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
  syncCircuitVisibility();
}

function finalizeProps(nextProps) {
  const snap = placeGridSize.value || 2;
  const withRoads = autotileRoadProps(nextProps, snap);
  return autotileUtilityProps(withRoads, 1);
}

function clearPaintRefreshTimer() {
  if (paintRefreshTimer) {
    clearTimeout(paintRefreshTimer);
    paintRefreshTimer = null;
  }
  paintRefreshDirty = false;
}

/** 铺设拖拽中节流重建，松手再完整刷一次 */
function schedulePaintRefresh() {
  paintRefreshDirty = true;
  if (paintRefreshTimer) return;
  paintRefreshTimer = setTimeout(async () => {
    paintRefreshTimer = null;
    if (!paintRefreshDirty || !project.value) return;
    paintRefreshDirty = false;
    const props = project.value.scene_config?.props || [];
    await viewer.applyScenePropList(props);
    viewer.setDayNight(rules.sim_hour, lampOn.value);
    syncDeviceStatusViz();
    if (paintRefreshDirty) schedulePaintRefresh();
  }, 140);
}

async function commitProps(nextProps, { history = true, msgText } = {}) {
  if (!project.value) return;
  if (history) pushHistBeforeChange();
  const props = finalizeProps(nextProps);
  patchSceneConfig({ props });
  await refreshPropsOnly();
  if (msgText) setMsg(msgText, "ok");
}

function makePropItem(brush, x, y, z, rotY = 0) {
  // 室内设备用更细吸附，便于摆桌面/墙边
  const indoorDevice =
    currentEnvId.value === "room" && (brush.source === "device" || brush.kind === "device");
  const snap = indoorDevice
    ? 0.5
    : isUtilityKind(brush.kind)
      ? 1
      : resolveSnap(brush, placeGridSize.value);
  const lift =
    brush.source === "device" ? 0.02 : brush.kind === "decoration" ? 0.01 : y || 0;
  const model =
    brush.model && (brush.model.kind || brush.model.url || brush.model.id)
      ? { ...brush.model }
      : { kind: "builtin", id: brush.assetId };
  return {
    id: `${brush.assetId}_${Date.now().toString(36).slice(-5)}_${Math.random().toString(36).slice(2, 5)}`,
    asset_id: brush.assetId,
    name: brush.name,
    model,
    source: brush.source,
    kind: brush.kind,
    x,
    y: lift,
    z,
    snap,
    scale: brush.source === "device" ? 1.6 : brush.kind === "decoration" ? 1.15 : 1,
    rotY: rotY || 0,
    binding: brush.source === "device" ? { property: "" } : undefined,
  };
}

async function placeAtPoint({ x, y, z, brush, paint }) {
  if (!project.value || !brush) return;
  let px = x;
  let py = y || 0;
  let pz = z;
  let rotY = 0;

  // 室内设备：桌面 / 靠墙吸附
  if (
    currentEnvId.value === "room" &&
    (brush.source === "device" || brush.kind === "device") &&
    !paint
  ) {
    const indoor = resolveIndoorPlace(px, pz);
    if (indoor) {
      px = indoor.x;
      py = indoor.y;
      pz = indoor.z;
      rotY = indoor.rotY || 0;
      setMsg(`已吸附到「${indoor.surface}」`, "ok");
    }
  }

  const props = [...(project.value.scene_config.props || [])];

  if (isPaintNetworkKind(brush.kind)) {
    const idx = props.findIndex(
      (p) =>
        p.kind === brush.kind &&
        Math.abs(p.x - px) < 0.01 &&
        Math.abs(p.z - pz) < 0.01
    );
    if (idx >= 0) props.splice(idx, 1);
  } else {
    const hit = findCollision(props, { x: px, z: pz, kind: brush.kind, source: brush.source });
    if (hit) {
      setMsg(`与「${hit.name}」重叠，无法放置`, "err");
      return;
    }
  }

  const item = makePropItem(brush, px, py, pz, rotY);
  props.push(item);
  const next = finalizeProps(props);

  // 拖拽铺路/管网：合并撤销；重建节流，松手再完整刷新
  if (paint && isPaintNetworkKind(brush.kind)) {
    if (!paintBatch.value) {
      pushHistBeforeChange();
      paintBatch.value = brush.kind;
    }
    patchSceneConfig({ props: next });
    schedulePaintRefresh();
    return;
  }

  const label =
    brush.kind === "road" && isRoadNetworkProp(item)
      ? "马路（按铺设方向自动接道）"
      : isUtilityKind(brush.kind)
        ? `${brush.name}（自动接管）`
        : brush.name;
  await commitProps(next, { history: true, msgText: `已放置「${label}」` });
  // 选中刚放置的物体，确认已进场景
  viewer.selectProp(item.id);
}

async function onPaintEnd() {
  if (paintBatch.value) {
    const kind = paintBatch.value;
    paintBatch.value = null;
    clearPaintRefreshTimer();
    await refreshPropsOnly();
    syncHistFlags();
    const done =
      kind === "road" ? "铺路完成" : kind === "circuit" ? "电路铺设完成" : kind === "water" ? "水管铺设完成" : "铺设完成";
    setMsg(done, "ok");
    queueAutoSave(0);
  }
}

/** 点到点：一次提交整条折线格子 */
async function placePathCells({ cells, brush }) {
  if (!project.value || !brush || !cells?.length) return;
  pushHistBeforeChange();
  let props = [...(project.value.scene_config.props || [])];
  for (const c of cells) {
    const idx = props.findIndex(
      (p) =>
        p.kind === brush.kind &&
        Math.abs((p.x || 0) - c.x) < 0.01 &&
        Math.abs((p.z || 0) - c.z) < 0.01
    );
    if (idx >= 0) props.splice(idx, 1);
    props.push(makePropItem(brush, c.x, 0, c.z, 0));
  }
  props = finalizeProps(props);
  patchSceneConfig({ props });
  clearPaintRefreshTimer();
  await refreshPropsOnly();
  syncHistFlags();
  const label =
    brush.kind === "road" ? "马路" : brush.kind === "circuit" ? "电路" : brush.kind === "water" ? "水管" : brush.name;
  setMsg(`已点到点铺设「${label}」· ${cells.length} 格`, "ok");
  queueAutoSave(0);
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
  let mx = x;
  let my = y || 0;
  let mz = z;
  let mRot = cur.rotY || 0;
  if (currentEnvId.value === "room" && cur.source === "device") {
    const indoor = resolveIndoorPlace(mx, mz);
    if (indoor) {
      mx = indoor.x;
      my = indoor.y;
      mz = indoor.z;
      mRot = indoor.rotY || 0;
    }
  }
  if (!isPaintNetworkKind(cur.kind)) {
    const hit = findCollision(
      list.filter((q) => q.id !== id),
      { x: mx, z: mz, kind: cur.kind, source: cur.source }
    );
    if (hit) {
      setMsg(`与「${hit.name}」重叠，无法移动`, "err");
      await refreshPropsOnly();
      return;
    }
  }
  const props = finalizeProps(
    list.map((p) => (p.id === id ? { ...p, x: mx, y: my, z: mz, rotY: mRot } : p))
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

function refreshWireLinkLines() {
  const showLinks =
    consoleTool.value === "circuit" ||
    consoleTool.value === "water" ||
    placeBrush.value?.kind === "circuit" ||
    placeBrush.value?.kind === "water";
  const merged = [...annotatedWireLinks.value, ...annotatedWaterLinks.value];
  viewer.syncWireLinkLines(merged, project.value?.scene_config?.props || [], {
    visible: showLinks,
  });
}

function syncCircuitVisibility() {
  const showCircuit =
    consoleTool.value === "circuit" || placeBrush.value?.kind === "circuit";
  viewer.setCircuitVisible(showCircuit);
  refreshWireLinkLines();
}

function closeConsoleTools() {
  consoleTool.value = "";
  if (bulldozeMode.value) viewer.setBulldozeMode(false);
  pickPlaceBrush(null);
  if (buildMode.value) viewer.setBuildMode(false);
  syncCircuitVisibility();
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
    syncCircuitVisibility();
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
    syncCircuitVisibility();
    return;
  }
  if (bulldozeMode.value) viewer.setBulldozeMode(false);
  placeCategory.value = tool.cat;
  if (!buildMode.value) viewer.setBuildMode(true);
  pickPlaceBrush(null);
  syncCircuitVisibility();
  // 路面 / 绿化 / 电路 / 水 / 设备：自动拿起默认笔刷，减少一次点击
  nextTick(() => {
    let pick = null;
    if (tool.cat === "road") {
      pick =
        placePaletteItems.value.find((i) => i.id === "road_tile") ||
        placePaletteItems.value[0];
      if (pick) pickPlaceBrush(pick);
      setMsg("路面：单击两点连铺（半透明预览）· 也可拖拽；弯道/路口自动成型", "ok");
      return;
    }
    if (tool.cat === "device") {
      pick = placePaletteItems.value[0];
      if (pick) pickPlaceBrush(pick);
      setMsg("设备：单击地面放置，绑定属性后可用电线连到开关", "ok");
      return;
    }
    if (tool.cat === "circuit") {
      pick =
        placePaletteItems.value.find((i) => i.id === "util_circuit") ||
        placePaletteItems.value[0];
      if (pick) pickPlaceBrush(pick);
      setMsg("电路：单击两点连铺（半透明预览）· 也可拖拽；仅编辑时可见", "ok");
      syncCircuitVisibility();
      return;
    }
    if (tool.cat === "water") {
      pick =
        placePaletteItems.value.find((i) => i.id === "util_water") ||
        placePaletteItems.value[0];
      if (pick) pickPlaceBrush(pick);
      setMsg("水管：单击两点连铺（半透明预览）· 也可拖拽；阀/泵可沿线联动", "ok");
      return;
    }
    if (tool.cat === "decoration") {
      pick =
        placePaletteItems.value.find((i) => /tree|grass|花|树|草/i.test(i.id + i.name)) ||
        placePaletteItems.value[0];
      if (pick) pickPlaceBrush(pick);
      setMsg("绿化：单击地面放置树/草（半透明预览跟随光标）", "ok");
      return;
    }
    setMsg(`已选择「${tool.label}」：在面板点选模型后点击地面放置`, "ok");
  });
}

function enterPresentationMode() {
  closeConsoleTools();
  presentationMode.value = true;
  settingsOpen.value = false;
  viewer.setCircuitVisible(false);
  refreshWireLinkLines();
  setMsg("演示模式：电路已隐藏 · 状态/告警优先", "ok");
}

function connectSelectedWire() {
  const from = selectedPropId.value;
  const to = linkTargetDraft.value;
  if (!from || !to) {
    setMsg(selectedIsSensor.value ? "请选择要连接的开关/模块" : "请选择要连接的受控模块", "err");
    return;
  }
  const path = devicesCircuitConnected(
    project.value?.scene_config?.props || [],
    from,
    to
  );
  if (!path.ok) {
    setMsg(path.reason || "电路未连通，无法接线", "err");
    viewer.setCircuitVisible(true);
    refreshWireLinkLines();
    return;
  }
  const next = addWireLink(wireLinks.value, from, to);
  patchSceneConfig({ wire_links: next });
  linkTargetDraft.value = "";
  viewer.setCircuitVisible(true);
  refreshWireLinkLines();
  const role = deviceControlRole(selectedPlaced.value);
  setMsg(
    role === "sensor"
      ? "已沿电路接通：传感器达控制阈值后将联动下游"
      : "已沿电路接通：开关动作将直控下游模块",
    "ok"
  );
  queueAutoSave(0);
}

function disconnectWire(linkId) {
  const next = removeWireLink(wireLinks.value, linkId);
  patchSceneConfig({ wire_links: next });
  refreshWireLinkLines();
  setMsg("已断开电线", "ok");
  queueAutoSave(0);
}

function connectSelectedWater() {
  const from = selectedPropId.value;
  const to = waterLinkDraft.value;
  if (!from || !to) {
    setMsg("请选择要连接的阀/泵/闸", "err");
    return;
  }
  if (!selectedIsWaterDevice.value) {
    setMsg("当前设备不是阀/泵/闸，无法沿水管连线", "err");
    return;
  }
  const path = devicesWaterConnected(
    project.value?.scene_config?.props || [],
    from,
    to
  );
  if (!path.ok) {
    setMsg(path.reason || "水管未连通，无法连接", "err");
    refreshWireLinkLines();
    return;
  }
  const next = addWaterLink(waterLinks.value, from, to);
  patchSceneConfig({ water_links: next });
  waterLinkDraft.value = "";
  if (consoleTool.value !== "water") {
    // 临时显示连线：切到水工具可见逻辑由 refresh 控制；此处强制刷新
  }
  refreshWireLinkLines();
  setMsg("已沿水管接通：开/关将联动下游阀泵", "ok");
  queueAutoSave(0);
}

function disconnectWater(linkId) {
  const next = removeWaterLink(waterLinks.value, linkId);
  patchSceneConfig({ water_links: next });
  refreshWireLinkLines();
  setMsg("已断开水管连线", "ok");
  queueAutoSave(0);
}

function enterEditMode() {
  presentationMode.value = false;
  selectConsoleTool(CONSOLE_TOOLS[0]);
  setMsg("编辑模式：底部工具可铺路 / 管网 / 绿化", "ok");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 一键巡检：按预设镜头顺序飞镜 */
async function playInspectionTour() {
  if (tourBusy.value) {
    tourToken += 1;
    tourBusy.value = false;
    setMsg("巡检已停止", "ok");
    return;
  }
  enterPresentationMode();
  const token = ++tourToken;
  tourBusy.value = true;

  const roomStops = ROOM_FOCUS_PRESETS.filter((p) => p.id !== "overview").map((p) => ({
    label: p.label,
    target: p.target,
    pos: p.pos,
  }));
  const outdoorStops = [
    { label: "全景", preset: "orbit" },
    { label: "俯视", preset: "top" },
    { label: "特写", preset: "lamp" },
    { label: "装配", preset: "board" },
  ];
  const stops =
    currentEnvId.value === "room"
      ? [{ label: "全屋俯视", target: ROOM_FOCUS_PRESETS[0].target, pos: ROOM_FOCUS_PRESETS[0].pos }, ...roomStops]
      : outdoorStops;

  setMsg("开始巡检…", "ok");
  for (const stop of stops) {
    if (token !== tourToken) return;
    if (stop.preset) {
      viewer.setCameraPreset(stop.preset);
    } else {
      viewer.focusLookAt(stop.target, stop.pos);
      roomFocusId.value =
        ROOM_FOCUS_PRESETS.find((p) => p.label === stop.label)?.id || roomFocusId.value;
    }
    setMsg(`巡检 · ${stop.label}`, "ok");
    await sleep(1600);
  }
  if (token !== tourToken) return;
  tourBusy.value = false;
  setMsg("巡检完成", "ok");
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
  if (buildMode.value || consoleTool.value || !presentationMode.value) {
    closeConsoleTools();
    presentationMode.value = true;
    setMsg("已关闭操作台 · 演示模式", "ok");
    return;
  }
  enterEditMode();
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
    const prev = p.binding || {};
    const property = name || "";
    return {
      ...p,
      binding: property
        ? {
            property,
            warnMin: prev.warnMin,
            warnMax: prev.warnMax,
            alarmMin: prev.alarmMin,
            alarmMax: prev.alarmMax,
            controlThreshold: prev.controlThreshold,
            controlWhen: prev.controlWhen,
            controlHysteresis: prev.controlHysteresis,
          }
        : { property: "" },
    };
  });
  patchSceneConfig({ props });
  queueAutoSave(0);
  nextTick(() => {
    syncDeviceStatusViz();
    recomputeLamp();
    syncDraftNumber();
  });
}

function patchSelectedBinding(fields = {}) {
  if (!project.value || !selectedPropId.value) return;
  const props = (project.value.scene_config.props || []).map((p) => {
    if (p.id !== selectedPropId.value) return p;
    const prev = { ...(p.binding || {}) };
    for (const [k, raw] of Object.entries(fields)) {
      if (raw === "" || raw === null || raw === undefined) {
        delete prev[k];
      } else {
        const n = Number(raw);
        prev[k] = Number.isFinite(n) ? n : raw;
      }
    }
    return { ...p, binding: prev };
  });
  patchSceneConfig({ props });
  queueAutoSave(0);
  nextTick(() => syncDeviceStatusViz());
}

function syncDraftNumber() {
  const key = selectedBindingKey.value;
  if (!key) {
    draftNumberValue.value = "";
    return;
  }
  const v = effectiveShadow.value[key];
  draftNumberValue.value = v === undefined || v === null ? "" : String(v);
}

async function writeOneProperty(key, value) {
  if (usingLinearData.value) {
    localShadowOverrides.value = { ...localShadowOverrides.value, [key]: value };
    linearShadow.value = { ...linearShadow.value, [key]: value };
    return false;
  }
  try {
    const res = await api.setProperty(key, value);
    if (res?.data && typeof res.data === "object") {
      shadowProps.value = { ...shadowProps.value, ...res.data };
    } else {
      shadowProps.value = { ...shadowProps.value, [key]: value };
    }
    const next = { ...localShadowOverrides.value };
    delete next[key];
    localShadowOverrides.value = next;
    shadowConnected.value = true;
    return true;
  } catch (e) {
    localShadowOverrides.value = { ...localShadowOverrides.value, [key]: value };
    shadowProps.value = { ...shadowProps.value, [key]: value };
    return false;
  }
}

async function writeShadowProperty(name, value, { fromPropId } = {}) {
  const key = String(name || "").trim();
  if (!key) return false;
  controlBusy.value = true;
  try {
    const cloudOk = await writeOneProperty(key, value);
    const sourceId =
      fromPropId ||
      (selectedBindingKey.value === key ? selectedPropId.value : "") ||
      "";
    const props = project.value?.scene_config?.props || [];
    const shadowNow = effectiveShadow.value;
    const linkedWire = sourceId
      ? resolveLinkedWritesCascade(props, wireLinks.value, sourceId, value, shadowNow)
      : [];
    const linkedWater = sourceId
      ? resolveWaterLinkedWritesCascade(props, waterLinks.value, sourceId, value, shadowNow)
      : [];
    const linked = [...linkedWire, ...linkedWater];
    // 同属性去重，后写覆盖
    const byProp = new Map();
    for (const item of linked) byProp.set(item.property, item);
    const linkedUnique = [...byProp.values()];
    for (const item of linkedUnique) {
      await writeOneProperty(item.property, item.value);
    }
    const pendingWire = sourceId
      ? annotateWireLinksConnectivity(
          props,
          wireLinks.value.filter((l) => l.from === sourceId)
        )
      : [];
    const pendingWater = sourceId
      ? annotateWaterLinksConnectivity(
          props,
          waterLinks.value.filter((l) => l.from === sourceId)
        )
      : [];
    const broken =
      pendingWire.filter((l) => !l.connected).length +
      pendingWater.filter((l) => !l.connected).length;
    let linkHint = "";
    if (linkedUnique.length) linkHint = ` · 联动 ${linkedUnique.length} 路`;
    else if (broken) linkHint = ` · ${broken} 路断路未联动（请检查电路/水管）`;
    setMsg(
      usingLinearData.value
        ? `线性模拟写入 ${key} = ${String(value)}${linkHint}`
        : cloudOk
          ? `已下发 ${key} = ${String(value)}${linkHint}`
          : `本地演示写入 ${key}${linkHint}`,
      "ok"
    );
    return true;
  } finally {
    controlBusy.value = false;
    syncDeviceStatusViz();
    recomputeLamp();
    syncDraftNumber();
  }
}

async function toggleSelectedActuator() {
  const key = selectedBindingKey.value;
  if (!key) return;
  const cur = effectiveShadow.value[key];
  const next = !truthyOn(cur);
  // 云端布尔；本地演示也可用 1/0
  const payload = typeof cur === "boolean" || cur === true || cur === false ? next : next ? 1 : 0;
  await writeShadowProperty(key, payload, { fromPropId: selectedPropId.value });
}

async function applySelectedNumber() {
  const key = selectedBindingKey.value;
  if (!key) return;
  const n = Number(draftNumberValue.value);
  if (!Number.isFinite(n)) {
    setMsg("请输入有效数字", "err");
    return;
  }
  await writeShadowProperty(key, n, { fromPropId: selectedPropId.value });
}

function onRealtimeMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  if (usingLinearData.value) {
    if (msg.status) shadowConnected.value = !!msg.status.connected;
    if (msg.type === "hello" && msg.status) shadowConnected.value = !!msg.status.connected;
    return;
  }
  if (msg.type === "props" || msg.type === "hello") {
    let changed = null;
    if (msg.data && typeof msg.data === "object") {
      changed = Object.keys(msg.data);
      shadowProps.value = { ...shadowProps.value, ...msg.data };
      // 云端推送覆盖同名本地演示覆盖
      const next = { ...localShadowOverrides.value };
      for (const k of changed) delete next[k];
      localShadowOverrides.value = next;
    }
    if (msg.status) shadowConnected.value = !!msg.status.connected;
    if (msg.type === "hello" && msg.status) shadowConnected.value = !!msg.status.connected;
    syncDeviceStatusViz();
    recomputeLamp();
    syncDraftNumber();
    if (changed?.length) void evalSensorWireLinks(changed);
  } else if (msg.type === "status") {
    shadowConnected.value = !!(msg.data?.connected ?? msg.status?.connected);
    if (msg.props && typeof msg.props === "object") {
      const changed = Object.keys(msg.props);
      shadowProps.value = { ...shadowProps.value, ...msg.props };
      syncDeviceStatusViz();
      recomputeLamp();
      if (changed.length) void evalSensorWireLinks(changed);
    }
  }
}

async function refreshShadow() {
  try {
    const metrics = await api.metrics().catch(() => ({ items: [] }));
    const items = metrics.items || metrics.metrics || metrics || [];
    const meta = {};
    metricOptions.value = items
      .map((m) => {
        const name = m.property_name || m.name;
        if (name) {
          meta[name] = {
            writable: !!m.writable,
            type: m.type || "number",
            unit: m.unit || "",
            label: m.name || name,
          };
        }
        return name;
      })
      .filter(Boolean);
    metricMeta.value = meta;

    if (!usingLinearData.value) {
      const [shadow, st] = await Promise.all([
        api.shadow(),
        api.status().catch(() => null),
      ]);
      shadowProps.value = shadow.data || {};
      shadowConnected.value = !!(st?.connected ?? shadow.connected);
    } else {
      const st = await api.status().catch(() => null);
      if (st) shadowConnected.value = !!st.connected;
    }

    for (const k of Object.keys(effectiveShadow.value)) {
      if (!metricOptions.value.includes(k)) metricOptions.value.push(k);
    }
    for (const ch of linearChannels.value) {
      if (ch.property && !metricOptions.value.includes(ch.property)) {
        metricOptions.value.push(ch.property);
      }
    }
  } catch {
    /* ignore */
  }
  syncDeviceStatusViz();
  recomputeLamp();
  syncDraftNumber();
  if (!usingLinearData.value) void evalSensorWireLinks();
}

/** 静默自动保存（选择/改配置后立即落盘，无需点按钮） */
function queueAutoSave(delayMs = 280) {
  if (!project.value) return;
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    autoSave().catch(() => {});
  }, delayMs);
}

/** @deprecated 兼容旧调用名 */
const voidAutoSave = queueAutoSave;

/**
 * 传感器影子变化时：按控制阈值自动写入下游开关/模块（仅电路连通的电线）。
 * 开关手动下发已由 writeShadowProperty 内 resolveLinkedWritesCascade 处理。
 */
let sensorLinkEvalBusy = false;
async function evalSensorWireLinks(changedKeys) {
  if (sensorLinkEvalBusy || controlBusy.value) return;
  const props = project.value?.scene_config?.props || [];
  const links = wireLinks.value;
  if (!props.length || !links.length) return;
  // 云端模式只用真实影子+本地覆盖，避免 mergeDemoShadow 的填充值误触发联动
  const shadow = usingLinearData.value
    ? effectiveShadow.value || {}
    : { ...(shadowProps.value || {}), ...(localShadowOverrides.value || {}) };
  const keySet =
    changedKeys && changedKeys.length ? new Set(changedKeys.map(String)) : null;
  const jobs = [];
  for (const p of props) {
    if (deviceControlRole(p) !== "sensor") continue;
    const propKey = String(p.binding?.property || "").trim();
    if (!propKey) continue;
    if (keySet && !keySet.has(propKey)) continue;
    if (!getSensorControlRule(p).ok) continue;
    const val = shadow[propKey];
    if (val === undefined || val === null) continue;
    const linked = resolveLinkedWritesCascade(props, links, p.id, val, shadow);
    for (const item of linked) {
      const cur = shadow[item.property];
      const wantOn = truthyOn(item.value);
      if (cur !== undefined && truthyOn(cur) === wantOn) continue;
      jobs.push(item);
    }
  }
  if (!jobs.length) return;
  // 同属性去重
  const byProp = new Map();
  for (const item of jobs) byProp.set(item.property, item);
  const uniqueJobs = [...byProp.values()];
  sensorLinkEvalBusy = true;
  try {
    for (const item of uniqueJobs) {
      await writeOneProperty(item.property, item.value);
    }
  } finally {
    sensorLinkEvalBusy = false;
    syncDeviceStatusViz();
    recomputeLamp();
  }
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

watch([consoleTool, placeBrush], () => {
  syncCircuitVisibility();
});

watch(
  () => [wireLinks.value, waterLinks.value, project.value?.scene_config?.props],
  () => refreshWireLinkLines(),
  { deep: true }
);

watch(selectedPropId, () => {
  if (selectedPropId.value) {
    refreshShadow();
    syncDraftNumber();
  }
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
  viewer.setOnPlacePath(placePathCells);
  viewer.setOnDeleteProp((id, opts) => removeSceneProp(id, opts));
  viewer.setOnPaintEnd(onPaintEnd);
  viewer.setOnMoveProp(movePropTo);
  viewer.setOnBulldozeEnd(onBulldozeEnd);
  window.addEventListener("keydown", onBuildHotkeys);
  document.addEventListener("fullscreenchange", onDomFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onDomFullscreenChange);
  await loadList();
  await loadCustomSceneTypes();
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
  if (usingLinearData.value) startLinearData();
  shadowTimer = setInterval(() => {
    if (usingLinearData.value) return;
    refreshShadow().catch(() => {});
  }, 2500);
  try {
    realtimeWs = connectRealtime(onRealtimeMessage);
  } catch {
    realtimeWs = null;
  }
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
  tourToken += 1;
  tourBusy.value = false;
  clearPaintRefreshTimer();
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
  stopLinearData();
  clearTimeout(autoSaveTimer);
  try {
    realtimeWs?.close?.();
  } catch {
    /* ignore */
  }
  realtimeWs = null;
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
            <button
              class="btn"
              type="button"
              :class="{ primary: presentationMode }"
              @click="enterPresentationMode"
            >
              演示
            </button>
            <button
              class="btn"
              type="button"
              :class="{ primary: !presentationMode }"
              @click="toggleBuildMode"
            >
              {{ presentationMode ? "编辑" : "关闭编辑" }}
            </button>
            <button
              class="btn"
              type="button"
              :class="{ primary: tourBusy }"
              :disabled="busy"
              @click="playInspectionTour"
            >
              {{ tourBusy ? "停止巡检" : "一键巡检" }}
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
              <span class="meta-text">{{ presentationMode ? "演示中" : "编辑中" }}</span>
            </div>
            <label class="hud-alerts-opt">
              <input v-model="autoFlyAlert" type="checkbox" />
              告警自动飞镜
            </label>
            <button
              class="btn"
              type="button"
              style="margin-top: 6px; width: 100%"
              :class="{ primary: tourBusy }"
              @click="playInspectionTour"
            >
              {{ tourBusy ? "停止巡检" : "一键巡检" }}
            </button>
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
            <template v-else-if="placeBrush?.kind === 'circuit'">铺电路「{{ placeBrush.name }}」· 仅此时可见 · Esc 取消</template>
            <template v-else-if="placeBrush">放置「{{ placeBrush.name }}」· Esc 取消</template>
            <template v-else-if="!presentationMode">编辑模式 · 设备/电路可连线联动开关</template>
            <template v-else>演示模式 · 电路已隐藏 · 点「编辑」建造</template>
          </div>

          <div v-if="selectedPlaced" class="prop-inspector">
            <strong>{{ selectedPlaced.name }}</strong>
            <span class="meta-text">
              {{ selectedPlaced.kind || selectedPlaced.source }}
              <template v-if="selectedPlaced.source === 'device'">
                · {{ dataSourceLabel }}
              </template>
            </span>
            <div v-if="buildMode" class="row-actions" style="margin-top: 6px; flex-wrap: wrap">
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

              <div class="bind-row" style="margin-top: 8px">
                <span class="meta-text">{{ wireLinkHint }}</span>
                <div class="bind-control" style="margin-top: 4px">
                  <select v-model="linkTargetDraft" style="flex: 1; min-width: 0">
                    <option value="">
                      {{ selectedIsSensor ? "选择开关/模块…" : "选择受控模块…" }}
                    </option>
                    <option v-for="a in linkableActuators" :key="a.id" :value="a.id">
                      {{ a.name }} · {{ a.binding?.property }}
                    </option>
                  </select>
                  <button
                    class="btn primary"
                    type="button"
                    :disabled="!linkTargetDraft"
                    @click="connectSelectedWire"
                  >
                    连接
                  </button>
                </div>
                <div
                  v-for="l in selectedOutgoingLinks"
                  :key="l.id"
                  class="bind-control"
                  style="margin-top: 4px"
                >
                  <span class="bind-val" :style="{ color: l.connected ? '' : '#ef4444' }">
                    → {{ l.toName }}（{{ l.toProperty || "未绑定" }}）
                    {{ l.connected ? "· 已连通" : "· 断路" }}
                  </span>
                  <button class="btn" type="button" @click="disconnectWire(l.id)">断开</button>
                </div>
                <p class="meta-text" style="margin: 4px 0 0">
                  须先铺连续电路，两端设备靠近电路格才能接线。开关可直控下游；传感器须设控制阈值后才联动（支持多级连带）。黄线在「电路」工具下可见（通=黄 / 断=红）。
                </p>
              </div>

              <div v-if="selectedIsWaterDevice" class="bind-row" style="margin-top: 8px">
                <span class="meta-text">水管连接（阀/泵/闸联动）</span>
                <div class="bind-control" style="margin-top: 4px">
                  <select v-model="waterLinkDraft" style="flex: 1; min-width: 0">
                    <option value="">选择下游阀/泵…</option>
                    <option v-for="a in linkableWaterDevices" :key="a.id" :value="a.id">
                      {{ a.name }} · {{ a.binding?.property }}
                    </option>
                  </select>
                  <button
                    class="btn primary"
                    type="button"
                    :disabled="!waterLinkDraft"
                    @click="connectSelectedWater"
                  >
                    连接
                  </button>
                </div>
                <div
                  v-for="l in selectedOutgoingWaterLinks"
                  :key="l.id"
                  class="bind-control"
                  style="margin-top: 4px"
                >
                  <span class="bind-val" :style="{ color: l.connected ? '' : '#ef4444' }">
                    → {{ l.toName }}（{{ l.toProperty || "未绑定" }}）
                    {{ l.connected ? "· 已连通" : "· 断管" }}
                  </span>
                  <button class="btn" type="button" @click="disconnectWater(l.id)">断开</button>
                </div>
                <p class="meta-text" style="margin: 4px 0 0">
                  须先铺连续水管，两端靠近水管格。蓝线在「水」工具下可见（通=蓝 / 断=红）。
                </p>
              </div>

              <template v-if="selectedBindingKey">
                <span class="bind-val">
                  当前值：{{ selectedBindingValue === null ? "—" : selectedBindingValue }}
                </span>

                <!-- 双向控制 -->
                <div class="bind-control">
                  <button
                    v-if="selectedIsSwitch || selectedIsWaterDevice"
                    class="btn primary"
                    type="button"
                    :disabled="controlBusy"
                    @click="toggleSelectedActuator"
                  >
                    {{ truthyOn(selectedBindingValue) ? "关闭" : "开启" }}
                  </button>
                  <template v-else>
                    <input
                      v-model="draftNumberValue"
                      class="bind-num"
                      type="number"
                      step="any"
                      :disabled="controlBusy"
                      @keyup.enter="applySelectedNumber"
                    />
                    <button
                      class="btn primary"
                      type="button"
                      :disabled="controlBusy"
                      @click="applySelectedNumber"
                    >
                      下发
                    </button>
                  </template>
                </div>

                <!-- 传感器控制阈值：高于/低于则开/关下游开关或模块 -->
                <div v-if="selectedIsSensor" class="bind-thresholds">
                  <span class="meta-text">控制阈值（联动电线）</span>
                  <div class="th-grid">
                    <label>
                      阈值
                      <input
                        type="number"
                        step="any"
                        :value="selectedThresholds.controlThreshold"
                        @change="patchSelectedBinding({ controlThreshold: $event.target.value })"
                      />
                    </label>
                    <label>
                      条件
                      <select
                        :value="selectedThresholds.controlWhen"
                        @change="patchSelectedBinding({ controlWhen: $event.target.value })"
                      >
                        <option value="above">≥ 阈值开启</option>
                        <option value="below">≤ 阈值开启</option>
                      </select>
                    </label>
                    <label>
                      回差
                      <input
                        type="number"
                        min="0"
                        step="any"
                        :value="selectedThresholds.controlHysteresis"
                        @change="patchSelectedBinding({ controlHysteresis: $event.target.value })"
                      />
                    </label>
                  </div>
                  <p class="meta-text" style="margin: 4px 0 0">
                    <template v-if="selectedSensorControl.ok">
                      当前规则有效：数值{{ selectedThresholds.controlWhen === "below" ? "≤" : "≥" }}
                      {{ selectedSensorControl.threshold }} 时开启下游
                      <template v-if="selectedSensorControl.hysteresis">
                        · 回差 {{ selectedSensorControl.hysteresis }}
                      </template>
                    </template>
                    <template v-else>{{ selectedSensorControl.reason }}</template>
                  </p>
                </div>

                <!-- 告警阈值（数值型） -->
                <div v-if="!selectedIsSwitch" class="bind-thresholds">
                  <span class="meta-text">告警阈值</span>
                  <div class="th-grid">
                    <label>
                      预警↓
                      <input
                        type="number"
                        step="any"
                        :value="selectedThresholds.warnMin"
                        @change="patchSelectedBinding({ warnMin: $event.target.value })"
                      />
                    </label>
                    <label>
                      预警↑
                      <input
                        type="number"
                        step="any"
                        :value="selectedThresholds.warnMax"
                        @change="patchSelectedBinding({ warnMax: $event.target.value })"
                      />
                    </label>
                    <label>
                      告警↓
                      <input
                        type="number"
                        step="any"
                        :value="selectedThresholds.alarmMin"
                        @change="patchSelectedBinding({ alarmMin: $event.target.value })"
                      />
                    </label>
                    <label>
                      告警↑
                      <input
                        type="number"
                        step="any"
                        :value="selectedThresholds.alarmMax"
                        @change="patchSelectedBinding({ alarmMax: $event.target.value })"
                      />
                    </label>
                  </div>
                </div>
                <p v-if="selectedIsActuator" class="meta-text" style="margin: 4px 0 0">
                  执行器属性会联动整机灯光 / 状态灯
                </p>
              </template>
            </template>
          </div>

          <!-- 选板浮层：编辑模式下选中路面/电路等工具时出现 -->
          <div
            v-if="!presentationMode && consoleTool && consoleTool !== 'bulldoze'"
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
                  <label v-for="(lab, key) in { assembly: '装配', building: '建筑', decoration: '装饰', road: '马路', circuit: '电路', device: '设备' }" :key="key">
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

            <div v-if="!presentationMode" class="cs-tools">
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
            <div v-else class="cs-tools cs-tools-demo">
              <button
                type="button"
                class="cs-tool"
                :class="{ active: tourBusy }"
                title="一键巡检"
                @click="playInspectionTour"
              >
                <span class="cs-tool-ico">巡</span>
                <span class="cs-tool-lab">{{ tourBusy ? "停止" : "巡检" }}</span>
              </button>
              <button
                type="button"
                class="cs-tool"
                title="进入编辑"
                @click="enterEditMode"
              >
                <span class="cs-tool-ico">建</span>
                <span class="cs-tool-lab">编辑</span>
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
          <h3>整机装配（设备孪生）</h3>
          <p class="page-desc" style="margin-top: 0">
            整机可选内置路灯或上传 GLB。场景里带「精细」角标的是 Kenney CC0 低模；也可在「场景管理」继续上传自己的 GLB。
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
            内置类型带预设环境；也可新建自定义类型（选底板 + 命名）。切换后左侧 3D 立即重建。
          </p>
          <div class="row-actions" style="margin-bottom: 10px; flex-wrap: wrap">
            <button class="btn primary" type="button" :disabled="sceneTypeBusy" @click="openCreateSceneType">
              新建场景类型
            </button>
            <button
              v-if="showSceneTypeForm"
              class="btn"
              type="button"
              :disabled="sceneTypeBusy"
              @click="resetSceneTypeForm"
            >
              取消
            </button>
          </div>
          <div v-if="showSceneTypeForm" class="scene-type-form panel" style="margin-bottom: 12px; padding: 12px">
            <div class="grid-2">
              <div class="field">
                <label>名称</label>
                <input v-model="sceneTypeForm.name" placeholder="如：办公演示园区" />
              </div>
              <div class="field">
                <label>底板环境</label>
                <select v-model="sceneTypeForm.base" @change="onSceneTypeBaseChange">
                  <option v-for="b in sceneTypeBaseOptions" :key="b.id" :value="b.id">{{ b.label }}</option>
                </select>
              </div>
            </div>
            <div class="field">
              <label>说明</label>
              <input v-model="sceneTypeForm.desc" placeholder="可选" />
            </div>
            <div class="field">
              <label>背景色</label>
              <input v-model="sceneTypeForm.bg" type="color" style="width: 64px; height: 36px; padding: 2px" />
            </div>
            <div class="row-actions">
              <button class="btn primary" type="button" :disabled="sceneTypeBusy" @click="saveSceneTypeForm">
                {{ sceneTypeForm.editing ? "保存修改" : "创建并切换" }}
              </button>
            </div>
          </div>
          <div class="scene-grid">
            <div
              v-for="s in sceneTypes"
              :key="s.id"
              class="scene-card"
              :class="{ active: currentSceneId === s.id, custom: !s.builtin }"
            >
              <button type="button" class="scene-card-main" @click="applySceneType(s.id)">
                <strong>
                  {{ s.label }}
                  <span v-if="!s.builtin" class="scene-card-tag">自定义</span>
                </strong>
                <small>{{ s.desc }}</small>
              </button>
              <div v-if="!s.builtin" class="scene-card-actions">
                <button class="btn" type="button" :disabled="sceneTypeBusy" @click.stop="openEditSceneType(s)">
                  编辑
                </button>
                <button class="btn" type="button" :disabled="sceneTypeBusy" @click.stop="removeCustomSceneType(s)">
                  删除
                </button>
              </div>
            </div>
          </div>

          <div v-if="currentEnvId === 'room'" class="scene-opts">
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
            <div class="row-actions" style="margin: 8px 0 0; flex-wrap: wrap">
              <button class="btn primary" type="button" @click="playInspectionTour">
                {{ tourBusy ? "停止巡检" : "一键巡检全屋" }}
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

          <div v-else-if="currentEnvId === 'street'" class="scene-opts">
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

          <div v-else-if="currentEnvId === 'greenhouse'" class="scene-opts">
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

          <div v-else-if="currentEnvId === 'farm'" class="scene-opts">
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

          <div v-else-if="currentEnvId === 'rice_paddy'" class="scene-opts">
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
            当前：{{ currentScene.label }}<template v-if="!currentScene.builtin">（自定义 · 底板 {{ currentEnvId }}）</template>。选择后立即生效并自动保存。
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
            <label>数据源</label>
            <div class="mode-row">
              <button
                type="button"
                class="mode-btn"
                :class="{ active: !usingLinearData }"
                @click="setDataSource('cloud')"
              >
                华为云
              </button>
              <button
                type="button"
                class="mode-btn"
                :class="{ active: usingLinearData }"
                @click="setDataSource('linear')"
              >
                线性模拟
              </button>
            </div>
            <p class="meta-text" style="margin: 6px 0 0">
              当前：{{ dataSourceLabel }}。线性模式在指定区间内往返采样并叠加随机扰动，写入仅本地生效。
            </p>
          </div>

          <div v-if="usingLinearData" class="field" style="margin-top: 10px">
            <label>刷新间隔（ms）</label>
            <input
              v-model.number="rules.linear_interval_ms"
              type="number"
              min="200"
              max="5000"
              step="100"
              @change="startLinearData(); voidAutoSave(0)"
            />
            <div class="row-actions" style="margin-top: 8px; flex-wrap: wrap">
              <button class="btn" type="button" @click="addLinearChannel">添加通道</button>
              <button class="btn" type="button" @click="resetLinearChannels">恢复默认</button>
            </div>
            <div
              v-for="(ch, idx) in linearChannels"
              :key="`${ch.property}_${idx}`"
              class="linear-ch"
            >
              <label>
                属性
                <input
                  :value="ch.property"
                  @change="patchLinearChannel(idx, { property: $event.target.value })"
                />
              </label>
              <label>
                下限
                <input
                  type="number"
                  step="any"
                  :value="ch.min"
                  @change="patchLinearChannel(idx, { min: Number($event.target.value) })"
                />
              </label>
              <label>
                上限
                <input
                  type="number"
                  step="any"
                  :value="ch.max"
                  @change="patchLinearChannel(idx, { max: Number($event.target.value) })"
                />
              </label>
              <label>
                周期(s)
                <input
                  type="number"
                  min="4"
                  step="1"
                  :value="ch.periodSec"
                  @change="patchLinearChannel(idx, { periodSec: Number($event.target.value) })"
                />
              </label>
              <label>
                噪声
                <input
                  type="number"
                  min="0"
                  step="any"
                  :value="ch.noise"
                  @change="patchLinearChannel(idx, { noise: Number($event.target.value) })"
                />
              </label>
              <label class="linear-ch-bool">
                <input
                  type="checkbox"
                  :checked="!!ch.boolean"
                  @change="patchLinearChannel(idx, { boolean: $event.target.checked })"
                />
                开关量
              </label>
              <button class="btn" type="button" @click="removeLinearChannel(idx)">删</button>
            </div>
          </div>

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
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: hidden;
}
.scene-card.custom {
  border-style: dashed;
}
.scene-card-main {
  display: grid;
  gap: 4px;
  text-align: left;
  padding: 12px;
  border: 0;
  background: transparent;
  cursor: pointer;
  color: inherit;
  font: inherit;
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
.scene-card-tag {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--accent, #0ea5e9);
}
.scene-card-actions {
  display: flex;
  gap: 6px;
  padding: 0 10px 10px;
}
.scene-type-form .field {
  margin-bottom: 8px;
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
.linear-ch {
  display: grid;
  grid-template-columns: 1.2fr repeat(4, 0.7fr) auto auto;
  gap: 6px;
  align-items: end;
  margin-top: 8px;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}
.linear-ch label {
  display: grid;
  gap: 2px;
  font-size: 11px;
  color: var(--muted);
}
.linear-ch input[type="number"],
.linear-ch input[type="text"],
.linear-ch input:not([type]) {
  width: 100%;
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface-solid);
}
.linear-ch-bool {
  display: flex !important;
  align-items: center;
  gap: 4px;
  padding-bottom: 6px;
}
@media (max-width: 1100px) {
  .linear-ch {
    grid-template-columns: 1fr 1fr;
  }
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
.bind-control {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}
.bind-num {
  flex: 1;
  min-width: 72px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--surface-solid);
}
.bind-thresholds {
  display: grid;
  gap: 6px;
}
.th-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.th-grid label {
  display: grid;
  gap: 2px;
  font-size: 11px;
  color: var(--muted);
}
.th-grid input {
  width: 100%;
  padding: 5px 6px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--surface-solid);
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
