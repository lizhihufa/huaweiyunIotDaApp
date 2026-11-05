<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { RouterLink } from "vue-router";
import { GridLayout, GridItem } from "grid-layout-plus";
import { api, connectRealtime } from "../api";
import { WIDGET_TYPES, defaultSize, getWidgetType } from "../widgets/types";
import WidgetRenderer from "../widgets/WidgetRenderer.vue";
import { usePropHistory } from "../widgets/usePropHistory";
import { useNoCopy } from "../composables/useNoCopy";
import {
  DEFAULT_SCREEN_THEME,
  FONT_STYLES,
  SCREEN_THEME_PRESETS,
  applyPresetToTheme,
  getScreenPreset,
  mergeScreenTheme,
  screenThemeStyle,
} from "../widgets/screenThemes";
import { clearStartupSessionFlag, fetchStartup, writeStartupLocal } from "../startup";

const pageRoot = ref(null);
useNoCopy(pageRoot);

const dashId = ref("default");
const name = ref("默认大屏");
const layout = ref([]);
const metrics = ref([]);
const propsMap = ref({});
const connected = ref(false);
const msg = ref("");
const msgType = ref("");
const layoutKey = ref(0);
const addType = ref("value");
const theme = reactive({ ...DEFAULT_SCREEN_THEME });
const uploadingBg = ref(false);
const isStartupScreen = ref(false);
const startupBusy = ref(false);
const editorReady = ref(false);
let saveTimer = null;
const { history, pushSample } = usePropHistory();
let ws = null;
let nextI = 1;

const themePreviewStyle = computed(() => screenThemeStyle(theme));

const propertyOptions = computed(() => {
  const map = new Map();
  for (const m of metrics.value) {
    if (!m.property_name) continue;
    map.set(m.property_name, {
      value: m.property_name,
      label: `${m.name || m.property_name} (${m.property_name})`,
    });
  }
  for (const key of Object.keys(propsMap.value || {})) {
    if (map.has(key)) continue;
    map.set(key, {
      value: key,
      label: `${key} · 云端`,
    });
  }
  return [...map.values()];
});

function isMulti(typeId) {
  return !!getWidgetType(typeId).multi;
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
  return {
    ...raw,
    i: String(raw?.i ?? index),
    x: Number.isFinite(x) ? x : (index * 3) % 12,
    y: Number.isFinite(y) ? y : Math.floor(index / 4) * 3,
    w: Number.isFinite(w) && w > 0 ? w : size.w,
    h: Number.isFinite(h) && h > 0 ? h : size.h,
    type,
    title: raw?.title || raw?.property || getWidgetType(type).name,
    property: raw?.property || properties[0] || "",
    properties,
  };
}

function nextBottomY() {
  if (!layout.value.length) return 0;
  return Math.max(
    ...layout.value.map((item) => {
      const y = Number.isFinite(Number(item.y)) ? Number(item.y) : 0;
      const h = Number.isFinite(Number(item.h)) ? Number(item.h) : 1;
      return y + h;
    })
  );
}

function onTypeChange(item) {
  const size = defaultSize(item.type);
  if (item.w < size.w) item.w = size.w;
  if (item.h < size.h) item.h = size.h;
  if (!isMulti(item.type)) {
    item.properties = item.property ? [item.property] : [];
  } else if (!item.properties?.length && item.property) {
    item.properties = [item.property];
  }
  queueSave();
}

function toggleProp(item, key, checked) {
  const set = new Set(item.properties || []);
  if (checked) set.add(key);
  else set.delete(key);
  item.properties = [...set];
  item.property = item.properties[0] || "";
}

function hasProp(item, key) {
  return (item.properties || []).includes(key);
}

async function ensureConnected() {
  const st = await api.status();
  connected.value = !!st.connected;
  if (st.connected) return;
  if (!st.settings_ready) return;
  try {
    const res = await api.connect();
    connected.value = !!res.status?.connected;
  } catch {
    /* 编辑页允许离线排版 */
  }
}

async function refreshStartupFlag() {
  try {
    const s = await fetchStartup(api);
    const screenId = String(s.screen_id || "default");
    isStartupScreen.value = s.default_page === "screen" && screenId === dashId.value;
  } catch {
    isStartupScreen.value = false;
  }
}

async function onStartupToggle(ev) {
  const on = !!ev.target?.checked;
  startupBusy.value = true;
  const payload = on
    ? { default_page: "screen", screen_id: dashId.value }
    : { default_page: "monitor", screen_id: dashId.value };
  try {
    // 先写本地，保证立刻生效（即使后端进程尚未重载也会跳转）
    writeStartupLocal(payload);
    clearStartupSessionFlag();
    const saved = await api.saveSettings({ startup: payload });
    const remote = saved?.data?.startup;
    if (on && remote?.default_page !== "screen") {
      // 后端未接受 startup 字段时仍保留本地配置，并提示重启
      msg.value =
        "已在本机记住启动大屏。请重启后端（python run.py）以便写入 settings.yaml；之后打开站点即可进大屏";
      msgType.value = "ok";
    } else {
      msg.value = on
        ? "已设为启动默认页：重新打开或访问首页将进入大屏展示"
        : "已取消：启动后进入监测控制页";
      msgType.value = "ok";
    }
    isStartupScreen.value = on;
  } catch (e) {
    // 接口失败时本地仍生效
    writeStartupLocal(payload);
    clearStartupSessionFlag();
    isStartupScreen.value = on;
    msg.value = on
      ? "已在本机记住启动大屏（云端配置暂未写入）。重新打开首页即可进入大屏"
      : e.message || "保存启动页失败";
    msgType.value = "ok";
  } finally {
    startupBusy.value = false;
  }
}

async function load() {
  await ensureConnected();
  const [list, m, shadow, st] = await Promise.all([
    api.dashboards(),
    api.metrics(),
    api.shadow(),
    api.status(),
  ]);
  if (!list.items?.length) {
    dashId.value = "default";
  } else if (!list.items.find((x) => x.id === dashId.value)) {
    dashId.value = list.items[0].id;
  }
  const res = await api.getDashboard(dashId.value);
  name.value = res.item.name || dashId.value;
  layout.value = (res.item.layout || []).map((item, idx) => sanitizeItem(item, idx));
  Object.assign(theme, mergeScreenTheme(res.item.theme || {}));
  nextI =
    layout.value.reduce(
      (acc, x) => Math.max(acc, parseInt(String(x.i).replace(/\D/g, "") || "0", 10)),
      0
    ) + 1;
  metrics.value = m.items || [];
  propsMap.value = shadow.data || {};
  connected.value = !!st.connected || !!shadow.connected;
  if (shadow.data && Object.keys(shadow.data).length) pushSample(shadow.data);
  layoutKey.value += 1;
  await refreshStartupFlag();
  editorReady.value = true;
}

function onPresetChange() {
  const next = applyPresetToTheme(theme, theme.preset_id);
  Object.assign(theme, next);
  msg.value = `已应用主题「${getScreenPreset(theme.preset_id).name}」`;
  msgType.value = "ok";
  queueSave();
}

function clearBg() {
  theme.background_image = "";
  queueSave();
}

async function onUploadBg(ev) {
  const file = ev.target.files?.[0];
  if (!file) return;
  uploadingBg.value = true;
  try {
    const res = await api.uploadBackground(file);
    theme.background_image = res.url;
    msg.value = "大屏背景图已上传并保存";
    msgType.value = "ok";
    queueSave();
  } catch (e) {
    msg.value = e.message;
    msgType.value = "err";
  } finally {
    uploadingBg.value = false;
    ev.target.value = "";
  }
}

function addWidget(typeId = addType.value) {
  const type = getWidgetType(typeId);
  const size = defaultSize(typeId);
  const first = propertyOptions.value[0]?.value || "";
  const allKeys = propertyOptions.value.map((o) => o.value);
  const properties = type.multi ? allKeys.slice(0, 6) : first ? [first] : [];
  const item = sanitizeItem(
    {
      i: String(nextI++),
      x: (layout.value.length * 3) % 12,
      y: nextBottomY(),
      w: size.w,
      h: size.h,
      type: typeId,
      title: `${type.name}${layout.value.length + 1}`,
      property: properties[0] || "",
      properties,
    },
    layout.value.length
  );
  layout.value = [...layout.value, item];
  msg.value = `已添加「${type.name}」`;
  msgType.value = "ok";
  queueSave();
}

function addAllValueCards() {
  const keys = Object.keys(propsMap.value || {});
  if (!keys.length) {
    msg.value = "暂无云端属性，请先连接";
    msgType.value = "err";
    return;
  }
  const existing = new Set(
    layout.value.filter((x) => x.type === "value").map((x) => x.property).filter(Boolean)
  );
  const additions = [];
  let y = nextBottomY();
  keys.forEach((key) => {
    if (existing.has(key)) return;
    const col = (layout.value.length + additions.length) % 4;
    if (col === 0 && additions.length) y += 3;
    additions.push(
      sanitizeItem(
        {
          i: String(nextI++),
          x: col * 3,
          y,
          w: 3,
          h: 3,
          type: "value",
          title: key,
          property: key,
          properties: [key],
        },
        layout.value.length + additions.length
      )
    );
  });
  if (!additions.length) {
    msg.value = "布局中已包含全部数值卡";
    msgType.value = "ok";
    return;
  }
  layout.value = [...layout.value, ...additions];
  msg.value = `已添加 ${additions.length} 个数值卡`;
  msgType.value = "ok";
  queueSave();
}

async function refreshCloud() {
  try {
    const [shadow, st, m] = await Promise.all([api.shadow(), api.status(), api.metrics()]);
    propsMap.value = shadow.data || {};
    connected.value = !!st.connected;
    metrics.value = m.items || [];
    if (shadow.data) pushSample(shadow.data);
    msg.value = connected.value
      ? `已刷新，共 ${Object.keys(propsMap.value).length} 个云端属性`
      : "未连接，仅显示本地缓存";
    msgType.value = connected.value ? "ok" : "err";
  } catch (e) {
    msg.value = e.message;
    msgType.value = "err";
  }
}

function queueSave() {
  if (!editorReady.value) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    save({ quiet: true });
  }, 200);
}

function onEditorFocusOut(ev) {
  const el = ev.target;
  if (!el || el.type === "file") return;
  queueSave();
}

function onEditorChange(ev) {
  const el = ev.target;
  if (!el || el.type === "file") return;
  const type = el.type || "";
  if (el.tagName === "SELECT" || type === "checkbox" || type === "range" || type === "color") {
    queueSave();
  }
}

async function save({ quiet = false } = {}) {
  try {
    const clean = layout.value.map((item, idx) => sanitizeItem(item, idx));
    await api.saveDashboard(dashId.value, {
      id: dashId.value,
      name: name.value,
      layout: clean,
      theme: { ...theme },
    });
    if (!quiet) {
      msg.value = "大屏与主题已保存";
      msgType.value = "ok";
    }
  } catch (e) {
    msg.value = e.message;
    msgType.value = "err";
  }
}

function removeItem(i) {
  layout.value = layout.value.filter((x) => x.i !== i);
  msg.value = "已删除组件";
  msgType.value = "ok";
  queueSave();
}

onMounted(async () => {
  await load();
  ws = connectRealtime((msgData) => {
    if (msgData.type === "props" || msgData.type === "hello") {
      propsMap.value = msgData.data || propsMap.value;
      if (msgData.data) pushSample(msgData.data);
      if (msgData.status) connected.value = !!msgData.status.connected;
    } else if (msgData.type === "status") {
      connected.value = !!msgData.data?.connected;
      if (msgData.props) {
        propsMap.value = msgData.props;
        pushSample(msgData.props);
      }
    }
  });
});

onUnmounted(() => {
  if (saveTimer) clearTimeout(saveTimer);
  if (ws) ws.close();
});
</script>

<template>
  <div ref="pageRoot" class="no-copy-page" @focusout="onEditorFocusOut" @change="onEditorChange">
  <header class="page-head">
    <p class="page-kicker">Screen</p>
    <h1 class="page-title">大屏编辑</h1>
  </header>

  <div class="section-bar">
    <span class="badge dot" :class="connected ? 'on' : 'off'">
      {{ connected ? "已连接 · 实时刷新" : "未连接" }}
    </span>
    <span class="meta-text">可选属性 {{ propertyOptions.length }} · 组件 {{ layout.length }}</span>
    <button class="btn" type="button" @click="refreshCloud">刷新云端数据</button>
    <button class="btn" type="button" :disabled="!connected" @click="addAllValueCards">
      一键添加全部数值卡
    </button>
  </div>

  <section class="panel">
    <div class="grid-2">
      <div class="field">
        <label>标题</label>
        <input v-model="name" placeholder="大屏标题" @blur="queueSave" />
      </div>
      <div class="field">
        <label>展示方式</label>
        <select v-model="addType">
          <option v-for="t in WIDGET_TYPES" :key="t.id" :value="t.id">
            {{ t.name }} — {{ t.desc }}
          </option>
        </select>
      </div>
    </div>

    <div class="row-actions">
      <button class="btn primary" type="button" @click="addWidget()">
        添加「{{ getWidgetType(addType).name }}」
      </button>
      <router-link class="btn" :to="`/screen/${dashId}`">全屏预览</router-link>
    </div>
    <label class="startup-toggle">
      <input
        type="checkbox"
        :checked="isStartupScreen"
        :disabled="startupBusy"
        @change="onStartupToggle"
      />
      <span>设为启动默认页（打开软件即进入此大屏展示）</span>
    </label>
    <div v-if="msg" class="msg" :class="msgType">{{ msg }}</div>
  </section>

  <section class="panel">
    <h3>大屏主题</h3>
    <div class="grid-2">
      <div class="field">
        <label>主题预设</label>
        <select v-model="theme.preset_id" @change="onPresetChange">
          <option v-for="p in SCREEN_THEME_PRESETS" :key="p.id" :value="p.id">
            {{ p.name }}（{{ p.source }}）
          </option>
        </select>
      </div>
      <div class="field">
        <label>字体样式</label>
        <select v-model="theme.font_style">
          <option v-for="f in FONT_STYLES" :key="f.id" :value="f.id">{{ f.label }}</option>
        </select>
      </div>
      <div class="field">
        <label>背景色</label>
        <div class="color-row">
          <input v-model="theme.background" type="color" class="color-input" />
          <input v-model="theme.background" class="color-text" />
        </div>
      </div>
      <div class="field">
        <label>卡片背景</label>
        <input v-model="theme.card_bg" placeholder="支持 rgba(...) 或 #hex" />
      </div>
      <div class="field">
        <label>卡片 / 图表边框</label>
        <div class="color-row">
          <input v-model="theme.chart_border" type="color" class="color-input" />
          <input v-model="theme.chart_border" class="color-text" />
        </div>
      </div>
      <div class="field">
        <label>强调色</label>
        <div class="color-row">
          <input v-model="theme.accent" type="color" class="color-input" />
          <input v-model="theme.accent" class="color-text" />
        </div>
      </div>
      <div class="field">
        <label>辅助强调色</label>
        <div class="color-row">
          <input v-model="theme.accent2" type="color" class="color-input" />
          <input v-model="theme.accent2" class="color-text" />
        </div>
      </div>
      <div class="field">
        <label>标题颜色</label>
        <div class="color-row">
          <input v-model="theme.title_color" type="color" class="color-input" />
          <input v-model="theme.title_color" class="color-text" />
        </div>
      </div>
      <div class="field">
        <label>正文颜色</label>
        <div class="color-row">
          <input v-model="theme.text_color" type="color" class="color-input" />
          <input v-model="theme.text_color" class="color-text" />
        </div>
      </div>
      <div class="field">
        <label>次要文字颜色</label>
        <div class="color-row">
          <input v-model="theme.muted_color" type="color" class="color-input" />
          <input v-model="theme.muted_color" class="color-text" />
        </div>
      </div>
      <div class="field">
        <label>大标题字号（{{ theme.title_size }}px）</label>
        <input v-model.number="theme.title_size" type="range" min="20" max="56" step="1" />
      </div>
      <div class="field">
        <label>卡片标题字号（{{ theme.card_title_size }}px）</label>
        <input v-model.number="theme.card_title_size" type="range" min="11" max="22" step="1" />
      </div>
      <div class="field">
        <label>数值字号（{{ theme.value_size }}px）</label>
        <input v-model.number="theme.value_size" type="range" min="18" max="56" step="1" />
      </div>
      <div class="field">
        <label>卡片圆角（{{ theme.card_radius }}px）</label>
        <input v-model.number="theme.card_radius" type="range" min="0" max="28" step="1" />
      </div>
      <div class="field">
        <label>
          <input v-model="theme.card_shadow" type="checkbox" />
          卡片阴影
        </label>
      </div>
      <div class="field" style="grid-column: 1 / -1">
        <label>大屏背景图 URL（仅全屏大屏，与系统背景独立）</label>
        <input v-model="theme.background_image" placeholder="https://... 或 /media/xxx.jpg" />
      </div>
      <div class="field">
        <label>大屏背景遮罩（{{ theme.background_overlay }}）</label>
        <input
          v-model.number="theme.background_overlay"
          type="range"
          min="0.2"
          max="0.9"
          step="0.01"
        />
      </div>
      <div class="field">
        <label>上传大屏背景图</label>
        <input type="file" accept="image/*" :disabled="uploadingBg" @change="onUploadBg" />
      </div>
    </div>
    <div class="row-actions">
      <button class="btn" type="button" @click="clearBg">清除大屏背景</button>
    </div>
    <div class="theme-preview" :style="themePreviewStyle">
      <div class="theme-preview-card">
        <div class="k">预览卡片</div>
        <div class="v">26.5</div>
      </div>
    </div>
  </section>

  <section class="panel canvas-panel">
    <GridLayout
      :key="layoutKey"
      v-model:layout="layout"
      :col-num="12"
      :row-height="52"
      :is-draggable="true"
      :is-resizable="true"
      :margin="[12, 12]"
      :use-css-transforms="true"
      :vertical-compact="true"
      @layout-updated="queueSave"
    >
      <GridItem
        v-for="item in layout"
        :key="item.i"
        :i="item.i"
        :x="item.x"
        :y="item.y"
        :w="item.w"
        :h="item.h"
      >
        <div class="card editor-tile">
          <button class="btn danger tile-close" type="button" @click.stop="removeItem(item.i)">
            删除
          </button>

          <div class="field">
            <label>展示方式</label>
            <select v-model="item.type" @mousedown.stop @change="onTypeChange(item)">
              <option v-for="t in WIDGET_TYPES" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </div>

          <div class="field">
            <label>标题</label>
            <input v-model="item.title" @mousedown.stop />
          </div>

          <div v-if="!isMulti(item.type)" class="field">
            <label>绑定属性</label>
            <select
              v-model="item.property"
              @mousedown.stop
              @change="item.properties = item.property ? [item.property] : []"
            >
              <option value="">未绑定</option>
              <option v-for="opt in propertyOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>

          <div v-else class="field multi-props" @mousedown.stop>
            <label>绑定属性（可多选）</label>
            <div class="prop-checks">
              <label v-for="opt in propertyOptions" :key="opt.value" class="check">
                <input
                  type="checkbox"
                  :checked="hasProp(item, opt.value)"
                  @change="toggleProp(item, opt.value, $event.target.checked)"
                />
                {{ opt.value }}
              </label>
              <span v-if="!propertyOptions.length" class="meta-text">暂无属性，请先连接或同步点位</span>
            </div>
          </div>

          <div class="preview-box">
            <WidgetRenderer
              :item="item"
              :props-map="propsMap"
              :history="history"
              compact
            />
          </div>
        </div>
      </GridItem>
    </GridLayout>
    <div v-if="!layout.length" class="empty-hint">
      先选一种展示方式，再点「添加」。可随时在卡片里切换图表 / 表格 / 数值等。
    </div>
  </section>
  </div>
</template>

<style scoped>
.no-copy-page {
  user-select: none;
  -webkit-user-select: none;
}

.startup-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  cursor: pointer;
  color: var(--ink);
  font-size: 0.95rem;
  user-select: none;
}

.startup-toggle input {
  width: 16px;
  height: 16px;
  accent-color: var(--accent, #1f6b52);
}

.no-copy-page :deep(input),
.no-copy-page :deep(textarea),
.no-copy-page :deep(select) {
  user-select: text;
  -webkit-user-select: text;
}

.canvas-panel {
  min-height: 480px;
  background:
    linear-gradient(rgba(31, 107, 82, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(31, 107, 82, 0.04) 1px, transparent 1px),
    var(--surface);
  background-size: 24px 24px, 24px 24px, auto;
}

.canvas-panel :deep(.vgl-layout) {
  min-height: 320px;
}

.editor-tile {
  height: 100%;
  position: relative;
  padding-top: 36px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
  /* 实底，避免网格线透出来看起来像「特性条」 */
  background: var(--surface-solid, #fffaf3);
  /* 编辑卡片禁用底部装饰条：滚动时会错位叠在内容上 */
  transform: none;
  animation: none;
}

.editor-tile::after {
  display: none;
}

.editor-tile:hover {
  transform: none;
}

.tile-close {
  position: absolute;
  right: 10px;
  top: 10px;
  padding: 4px 10px;
  font-size: 0.78rem;
  z-index: 2;
}

.preview-box {
  flex: 1 1 auto;
  min-height: 140px;
  min-width: 0;
  height: 100%;
  border: 1px dashed var(--line);
  border-radius: 10px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.35);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.preview-box :deep(.widget) {
  flex: 1;
  min-height: 0;
}

.prop-checks {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  max-height: 88px;
  overflow: auto;
  padding: 6px 0;
}

.color-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.color-input {
  width: 48px;
  height: 40px;
  padding: 2px;
  border-radius: 8px;
  border: 1px solid var(--line-strong);
  background: var(--surface-solid);
  cursor: pointer;
}

.color-text {
  flex: 1;
}

.theme-preview {
  margin-top: 16px;
  min-height: 140px;
  border-radius: 14px;
  padding: 20px;
  display: flex;
  align-items: center;
}

.theme-preview-card {
  min-width: 160px;
  padding: 16px 18px;
  border-radius: var(--sc-radius, 14px);
  background: var(--sc-card);
  border: 1px solid var(--sc-chart-border);
  box-shadow: var(--sc-shadow);
  color: var(--sc-text);
  font-family: var(--sc-font);
}

.theme-preview-card .k {
  color: var(--sc-muted);
  font-size: var(--sc-card-title-size);
}

.theme-preview-card .v {
  margin-top: 8px;
  color: var(--sc-accent);
  font-size: var(--sc-value-size);
  font-weight: 700;
  line-height: 1.1;
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.78rem;
  color: var(--ink-soft);
  margin: 0;
}

:deep(.vgl-item--placeholder) {
  background: rgba(31, 107, 82, 0.16) !important;
  border-radius: 14px;
}
</style>
