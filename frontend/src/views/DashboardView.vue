<script setup>
import { computed, inject, onMounted, onUnmounted, ref } from "vue";
import { useRoute } from "vue-router";
import { GridLayout, GridItem } from "grid-layout-plus";
import { api, connectRealtime } from "../api";
import { defaultSize } from "../widgets/types";
import WidgetRenderer from "../widgets/WidgetRenderer.vue";
import { usePropHistory } from "../widgets/usePropHistory";
import { useNoCopy } from "../composables/useNoCopy";
import { DEFAULT_SCREEN_THEME, mergeScreenTheme, screenThemeStyle } from "../widgets/screenThemes";

const CACHE_KEY = "hwy_last_shadow";

const route = useRoute();
const pageRoot = ref(null);
useNoCopy(pageRoot);
const dashId = computed(() => String(route.params.id || "default"));
const name = ref("");
const layout = ref([]);
const propsMap = ref({});
const writableKeys = ref(["fan", "automaticMode"]);
const screenTheme = ref({ ...DEFAULT_SCREEN_THEME });
const connected = ref(false);
const statusText = ref("加载中…");
const error = ref("");
const layoutEditing = ref(false);
const layoutSaving = ref(false);
const layoutMsg = ref("");
const layoutMsgType = ref("");
const layoutKey = ref(0);
const menuOpen = ref(false);
const menuRoot = ref(null);
const desktop = inject("desktop", null);
const osFullscreen = inject("osFullscreen", ref(false));
const isOsFullscreen = computed(() => Boolean(osFullscreen?.value));
let layoutSnapshot = null;
let layoutMsgTimer = null;
const { history, pushSample } = usePropHistory();
let ws = null;
let pollTimer = null;

function flashLayoutMsg(text, type = "ok", ms = 1000) {
  if (layoutMsgTimer) {
    clearTimeout(layoutMsgTimer);
    layoutMsgTimer = null;
  }
  layoutMsg.value = text;
  layoutMsgType.value = type;
  if (!text) return;
  layoutMsgTimer = setTimeout(() => {
    layoutMsg.value = "";
    layoutMsgType.value = "";
    layoutMsgTimer = null;
  }, ms);
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
}

function closeMenu() {
  menuOpen.value = false;
}

async function toggleOsFullscreen() {
  closeMenu();
  if (!desktop?.setFullscreen) return;
  await desktop.setFullscreen(!isOsFullscreen.value);
}

function onKeydown(e) {
  if (e.key === "F11") {
    e.preventDefault();
    toggleOsFullscreen();
  } else if (e.key === "Escape" && isOsFullscreen.value) {
    desktop?.setFullscreen?.(false);
  }
}

function onDocPointerDown(e) {
  if (!menuOpen.value) return;
  const root = menuRoot.value;
  if (root && !root.contains(e.target)) closeMenu();
}

const themedStyle = computed(() => screenThemeStyle(screenTheme.value));

function cloneLayout(list) {
  return JSON.parse(JSON.stringify(list || []));
}

function sanitizeItem(raw, index = 0) {
  const y = Number(raw?.y);
  const x = Number(raw?.x);
  const w = Number(raw?.w);
  const h = Number(raw?.h);
  const type = raw?.type || "value";
  const size = defaultSize(type);
  const properties = Array.isArray(raw?.properties)
    ? raw.properties.filter(Boolean)
    : raw?.property
      ? [raw.property]
      : [];
  const property = raw?.property || properties[0] || raw?.title || "";
  return {
    ...raw,
    i: String(raw?.i ?? index),
    x: Number.isFinite(x) ? x : (index * 3) % 12,
    y: Number.isFinite(y) ? y : Math.floor(index / 4) * 3,
    w: Number.isFinite(w) && w > 0 ? w : size.w,
    h: Number.isFinite(h) && h > 0 ? h : size.h,
    type,
    title: raw?.title || property || type,
    property,
    properties: properties.length ? properties : property ? [property] : [],
  };
}

function applyProps(data) {
  if (!data || typeof data !== "object") return;
  const keys = Object.keys(data);
  if (!keys.length) return;
  propsMap.value = { ...data };
  pushSample(data);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    /* ignore */
  }
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed?.data && typeof parsed.data === "object") {
      propsMap.value = parsed.data;
      pushSample(parsed.data);
      statusText.value = "显示本地缓存，正在尝试连云…";
    }
  } catch {
    /* ignore */
  }
}

const hasLiveData = computed(() => Object.keys(propsMap.value || {}).length > 0);

async function ensureConnected() {
  const st = await api.status();
  connected.value = !!st.connected;
  if (st.connected) {
    statusText.value = "已连接 · 实时刷新";
    return true;
  }
  if (!st.settings_ready) {
    statusText.value = "未配置连接参数，请到系统设置填写后再打开大屏";
    error.value = st.settings_message || "配置不完整";
    return false;
  }
  statusText.value = "正在连接华为云…";
  try {
    const res = await api.connect();
    connected.value = !!res.status?.connected;
    statusText.value = connected.value ? "已连接 · 实时刷新" : "连接失败";
    if (!connected.value) {
      error.value = res.status?.error || "连接失败";
    } else {
      error.value = "";
    }
    return connected.value;
  } catch (e) {
    statusText.value = "自动连接失败";
    error.value = e.message;
    return false;
  }
}

async function refreshShadow() {
  try {
    const shadow = await api.shadow();
    connected.value = !!shadow.connected;
    if (shadow.data && Object.keys(shadow.data).length) {
      applyProps(shadow.data);
      statusText.value = connected.value
        ? `实时 · ${shadow.ts || ""}`
        : "已有缓存数据";
      error.value = "";
    } else if (connected.value) {
      statusText.value = "已连接，等待设备上报…";
    }
    if (shadow.error) error.value = shadow.error;
  } catch (e) {
    error.value = e.message;
  }
}

function onPropsUpdate(data) {
  applyProps(data);
}

function onControlError(message) {
  error.value = message;
}

function startLayoutEdit() {
  closeMenu();
  layoutSnapshot = cloneLayout(layout.value);
  layoutEditing.value = true;
  flashLayoutMsg("", "");
  layoutKey.value += 1;
}

async function reconnectFromMenu() {
  closeMenu();
  await ensureConnected();
  await refreshShadow();
}

function cancelLayoutEdit() {
  if (layoutSnapshot) {
    layout.value = cloneLayout(layoutSnapshot).map((item, idx) => sanitizeItem(item, idx));
  }
  layoutSnapshot = null;
  layoutEditing.value = false;
  flashLayoutMsg("已取消布局调整", "");
  layoutKey.value += 1;
}

async function saveLayoutEdit() {
  layoutSaving.value = true;
  flashLayoutMsg("", "");
  try {
    const clean = layout.value.map((item, idx) => sanitizeItem(item, idx));
    layout.value = clean;
    await api.saveDashboard(dashId.value, {
      id: dashId.value,
      name: name.value,
      layout: clean,
      theme: { ...screenTheme.value },
    });
    layoutSnapshot = null;
    layoutEditing.value = false;
    flashLayoutMsg("布局已保存", "ok", 1000);
    layoutKey.value += 1;
  } catch (e) {
    flashLayoutMsg(e.message || "保存失败", "err", 1000);
  } finally {
    layoutSaving.value = false;
  }
}

async function load() {
  const id = dashId.value;
  const [res, metricsRes] = await Promise.all([api.getDashboard(id), api.metrics()]);
  name.value = res.item.name || id;
  layout.value = (res.item.layout || []).map((item, idx) => sanitizeItem(item, idx));
  screenTheme.value = mergeScreenTheme(res.item.theme || {});
  const fromMetrics = (metricsRes.items || [])
    .filter((m) => m.writable && m.property_name)
    .map((m) => m.property_name);
  writableKeys.value = fromMetrics.length
    ? [...new Set(fromMetrics)]
    : ["fan", "automaticMode"];
  layoutKey.value += 1;
}

onMounted(async () => {
  document.addEventListener("pointerdown", onDocPointerDown);
  document.addEventListener("keydown", onKeydown);
  loadCache();
  try {
    await load();
    await ensureConnected();
    await refreshShadow();
  } catch (e) {
    error.value = e.message;
  }

  ws = connectRealtime((msg) => {
    if (msg.type === "props") {
      applyProps(msg.data);
      connected.value = true;
      statusText.value = `实时 · ${msg.ts || ""}`;
    } else if (msg.type === "hello") {
      if (msg.data) applyProps(msg.data);
      if (msg.status) {
        connected.value = !!msg.status.connected;
        if (connected.value) statusText.value = "已连接 · 实时刷新";
      }
    } else if (msg.type === "status") {
      connected.value = !!msg.data?.connected;
      if (msg.props) applyProps(msg.props);
    } else if (msg.type === "error") {
      error.value = msg.message || "轮询错误";
    }
  });

  pollTimer = setInterval(refreshShadow, 2000);
});

onUnmounted(() => {
  document.removeEventListener("pointerdown", onDocPointerDown);
  document.removeEventListener("keydown", onKeydown);
  if (layoutMsgTimer) clearTimeout(layoutMsgTimer);
  if (ws) ws.close();
  if (pollTimer) clearInterval(pollTimer);
  if (desktop?.setFullscreen && isOsFullscreen.value) {
    desktop.setFullscreen(false);
  }
});
</script>

<template>
  <div
    ref="pageRoot"
    class="fullscreen screen-themed no-copy-page"
    :class="{ 'layout-editing': layoutEditing }"
    :style="themedStyle"
  >
    <div class="screen-head">
      <div>
        <p class="page-kicker">Live Screen</p>
        <h1 class="page-title">{{ name }}</h1>
        <p class="screen-status">
          <span class="badge dot" :class="connected ? 'on' : 'off'">
            {{ connected ? "已连接" : "未连接" }}
          </span>
          <span class="meta-text">{{ statusText }}</span>
        </p>
      </div>
      <div class="screen-actions">
        <template v-if="layoutEditing">
          <button
            class="btn primary"
            type="button"
            :disabled="layoutSaving"
            @click="saveLayoutEdit"
          >
            {{ layoutSaving ? "保存中…" : "保存布局" }}
          </button>
          <button class="btn" type="button" :disabled="layoutSaving" @click="cancelLayoutEdit">
            取消
          </button>
        </template>
        <template v-else>
          <button
            v-if="desktop?.setFullscreen"
            class="btn"
            type="button"
            @click="toggleOsFullscreen"
          >
            {{ isOsFullscreen ? "退出全屏" : "全屏" }}
          </button>
          <div ref="menuRoot" class="screen-menu">
            <button
              class="btn menu-trigger"
              type="button"
              aria-label="更多操作"
              :aria-expanded="menuOpen"
              @click.stop="toggleMenu"
            >
              <span class="menu-dots" aria-hidden="true">
                <i /><i /><i />
              </span>
            </button>
            <div v-if="menuOpen" class="menu-panel" role="menu">
              <button class="menu-item" type="button" role="menuitem" @click="startLayoutEdit">
                布局
              </button>
              <button class="menu-item" type="button" role="menuitem" @click="reconnectFromMenu">
                重新连接
              </button>
              <router-link class="menu-item" to="/dashboard" role="menuitem" @click="closeMenu">
                返回编辑
              </router-link>
            </div>
          </div>
        </template>
      </div>
    </div>

    <p v-if="layoutEditing" class="layout-banner">
      布局模式：拖动卡片移动位置，拖右下角调整大小。开关等控件已暂时锁定，保存后恢复。
    </p>
    <p v-if="layoutMsg" class="msg" :class="layoutMsgType">{{ layoutMsg }}</p>
    <p v-if="error" class="msg err">{{ error }}</p>
    <p v-if="!hasLiveData" class="msg">
      暂无实时数据。请确认系统设置已连接，且设备已上报属性；也可点右上角「重新连接」。
    </p>

    <GridLayout
      :key="layoutKey"
      v-model:layout="layout"
      :col-num="12"
      :row-height="72"
      :is-draggable="layoutEditing"
      :is-resizable="layoutEditing"
      :margin="[14, 14]"
      :use-css-transforms="true"
      :vertical-compact="true"
    >
      <GridItem
        v-for="item in layout"
        :key="item.i"
        :i="item.i"
        :x="item.x"
        :y="item.y"
        :w="item.w"
        :h="item.h"
        :static="!layoutEditing"
      >
        <div class="screen-card" :class="{ 'is-layouting': layoutEditing }">
          <div v-if="layoutEditing" class="layout-grip" aria-hidden="true">⋮⋮</div>
          <div class="screen-card-body" :class="{ 'pointer-locked': layoutEditing }">
            <WidgetRenderer
              :item="item"
              :props-map="propsMap"
              :history="history"
              :allow-control="!layoutEditing"
              :writable-keys="writableKeys"
              @props-update="onPropsUpdate"
              @control-error="onControlError"
            />
          </div>
        </div>
      </GridItem>
    </GridLayout>
  </div>
</template>

<style scoped>
.no-copy-page {
  user-select: none;
  -webkit-user-select: none;
}

.screen-status {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 8px 0 0;
}

.screen-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  position: relative;
}

.screen-menu {
  position: relative;
}

.menu-trigger {
  width: 42px;
  height: 42px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: color-mix(in srgb, var(--sc-card, rgba(255, 255, 255, 0.88)) 88%, transparent);
  border: 1px solid color-mix(in srgb, var(--sc-border, #fff) 45%, transparent);
  color: var(--sc-title, #fff);
}

.menu-dots {
  display: flex;
  flex-direction: column;
  gap: 3px;
  align-items: center;
}

.menu-dots i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  display: block;
}

.menu-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 40;
  min-width: 148px;
  padding: 6px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--sc-card, #1c2418) 94%, #000);
  border: 1px solid color-mix(in srgb, var(--sc-border, #fff) 40%, transparent);
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.menu-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--sc-text, #f4f4f0);
  font: inherit;
  font-size: 0.95rem;
  cursor: pointer;
  text-decoration: none;
  box-sizing: border-box;
}

.menu-item:hover {
  background: color-mix(in srgb, var(--sc-accent, #c9a24a) 22%, transparent);
  color: var(--sc-title, #fff);
}

.layout-banner {
  margin: 0 0 14px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px dashed color-mix(in srgb, var(--sc-accent, #c9a24a) 55%, transparent);
  background: color-mix(in srgb, var(--sc-accent, #c9a24a) 16%, transparent);
  color: var(--sc-title, #fff);
  font-size: 0.92rem;
}

.screen-card {
  position: relative;
}

.screen-card.is-layouting {
  outline: 1.5px dashed color-mix(in srgb, var(--sc-accent, #c9a24a) 70%, transparent);
  outline-offset: -2px;
  cursor: grab;
}

.screen-card.is-layouting:active {
  cursor: grabbing;
}

.layout-grip {
  position: absolute;
  top: 8px;
  right: 10px;
  z-index: 2;
  font-size: 0.85rem;
  letter-spacing: -2px;
  opacity: 0.55;
  color: var(--sc-muted, #aaa);
  pointer-events: none;
}

.screen-card-body {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.screen-card-body.pointer-locked {
  pointer-events: none;
}

.layout-editing :deep(.vgl-item) {
  transition: box-shadow 0.15s ease;
}

.layout-editing :deep(.vgl-item--resizing),
.layout-editing :deep(.vgl-item--dragging) {
  z-index: 20;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.28);
}

.layout-editing :deep(.vgl-item__resizer) {
  width: 18px;
  height: 18px;
  right: 4px;
  bottom: 4px;
  border-right: 3px solid color-mix(in srgb, var(--sc-accent, #c9a24a) 85%, #fff);
  border-bottom: 3px solid color-mix(in srgb, var(--sc-accent, #c9a24a) 85%, #fff);
  opacity: 0.95;
}
</style>
