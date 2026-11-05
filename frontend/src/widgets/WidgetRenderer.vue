<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import * as echarts from "echarts/core";
import { LineChart, BarChart, GaugeChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { api } from "../api";

echarts.use([
  LineChart,
  BarChart,
  GaugeChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

const DEFAULT_WRITABLE = new Set(["fan", "automaticMode"]);

const props = defineProps({
  item: { type: Object, required: true },
  propsMap: { type: Object, default: () => ({}) },
  history: { type: Array, default: () => [] },
  compact: { type: Boolean, default: false },
  /** 全屏大屏开启时可下发开关 */
  allowControl: { type: Boolean, default: false },
  /** 可写属性名列表（来自数据管理）；为空则用默认 fan / automaticMode */
  writableKeys: { type: Array, default: () => [] },
});

const emit = defineEmits(["props-update", "control-error"]);

const rootEl = ref(null);
const chartEl = ref(null);
const busyKey = ref("");
const controlMsg = ref("");
const editing = ref(false);
const draft = ref("");
let chart = null;
let ro = null;
let resizeTimer = null;

const typeId = computed(() => props.item.type || "value");
const title = computed(() => props.item.title || props.item.property || "未命名");

const propList = computed(() => {
  if (Array.isArray(props.item.properties) && props.item.properties.length) {
    return props.item.properties.filter(Boolean);
  }
  if (props.item.property) return [props.item.property];
  return [];
});

function fmt(v) {
  if (v === undefined || v === null) return "—";
  if (typeof v === "boolean") return v ? "开" : "关";
  if (typeof v === "number") return Number.isInteger(v) ? v : Number(v.toFixed(2));
  return String(v);
}

function isOn(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return ["1", "true", "on", "yes"].includes(v.trim().toLowerCase());
  return !!v;
}

function canControl(key) {
  if (!props.allowControl || !key) return false;
  if (Array.isArray(props.writableKeys) && props.writableKeys.length) {
    return props.writableKeys.includes(key);
  }
  return DEFAULT_WRITABLE.has(key);
}

function startEdit() {
  const key = singleKey.value;
  if (!canControl(key) || busyKey.value) return;
  const current = props.propsMap[key];
  draft.value = current === undefined || current === null ? "" : String(current);
  editing.value = true;
  controlMsg.value = "";
}

function cancelEdit() {
  editing.value = false;
  controlMsg.value = "";
}

async function submitEdit() {
  const key = singleKey.value;
  if (!canControl(key) || busyKey.value) return;
  const raw = String(draft.value).trim();
  const num = Number(raw);
  if (raw === "" || !Number.isFinite(num)) {
    controlMsg.value = "请输入有效数字";
    return;
  }
  busyKey.value = key;
  controlMsg.value = "";
  try {
    const res = await api.setProperty(key, num);
    const data = res.data || { ...props.propsMap, [key]: num };
    emit("props-update", data);
    editing.value = false;
  } catch (e) {
    controlMsg.value = e.message || "下发失败";
    emit("control-error", e.message || "下发失败");
  } finally {
    busyKey.value = "";
  }
}

async function toggleKey(key) {
  if (!canControl(key) || busyKey.value) return;
  const next = !isOn(props.propsMap[key]);
  busyKey.value = key;
  controlMsg.value = "";
  try {
    const res = await api.setProperty(key, next);
    const data = res.data || { ...props.propsMap, [key]: next };
    emit("props-update", data);
  } catch (e) {
    controlMsg.value = e.message || "下发失败";
    emit("control-error", e.message || "下发失败");
  } finally {
    busyKey.value = "";
  }
}

const singleValue = computed(() => {
  const key = propList.value[0];
  return key ? props.propsMap[key] : undefined;
});

const singleKey = computed(() => propList.value[0] || "");
const singleControllable = computed(() => canControl(singleKey.value));

const tableRows = computed(() =>
  propList.value.map((key) => ({
    key,
    value: fmt(props.propsMap[key]),
  }))
);

function cssVar(name, fallback) {
  const el = rootEl.value || document.documentElement;
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function buildOption() {
  const t = typeId.value;
  const accent = cssVar("--sc-accent", cssVar("--accent", "#1f6b52"));
  const accent2 = cssVar("--sc-accent2", cssVar("--straw", "#c9a24a"));
  const ink = cssVar("--sc-text", cssVar("--ink", "#1a2420"));
  const muted = cssVar("--sc-muted", cssVar("--muted", "#6b7c73"));

  if (t === "gauge") {
    const key = propList.value[0];
    const raw = Number(props.propsMap[key]);
    const val = Number.isFinite(raw) ? raw : 0;
    return {
      series: [
        {
          type: "gauge",
          min: 0,
          max: Math.max(100, Math.ceil(val / 10) * 10 || 100),
          progress: { show: true, width: 12 },
          axisLine: { lineStyle: { width: 12 } },
          axisTick: { show: false },
          splitLine: { length: 8 },
          axisLabel: { distance: 14, color: muted, fontSize: 10 },
          pointer: { length: "55%", width: 4 },
          detail: {
            valueAnimation: true,
            formatter: "{value}",
            color: ink,
            fontSize: props.compact ? 16 : 22,
          },
          data: [{ value: Number(val.toFixed(1)), name: key || "" }],
          itemStyle: { color: accent },
        },
      ],
    };
  }

  const palette = [
    accent,
    accent2,
    "#4f8cff",
    "#2ec4a6",
    "#f5b84b",
    "#9b7bff",
    "#ff8fab",
    "#66d9c6",
  ];

  if (t === "line") {
    const keys = propList.value.length ? propList.value : [];
    const hist = props.history || [];
    const times = hist.map((p) =>
      new Date(p.ts).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    );
    const series = keys.map((key, idx) => {
      const color = palette[idx % palette.length];
      return {
        name: key,
        type: "line",
        smooth: true,
        showSymbol: hist.length < 16,
        data: hist.map((p) => {
          const n = Number(p[key]);
          return Number.isFinite(n) ? n : null;
        }),
        lineStyle: { width: 2, color },
        itemStyle: { color },
        areaStyle: keys.length === 1 ? { color, opacity: 0.12 } : undefined,
      };
    });
    return {
      color: palette,
      grid: { left: 40, right: 14, top: keys.length > 1 ? 36 : 24, bottom: 28 },
      legend: keys.length > 1 ? { top: 0, textStyle: { color: muted, fontSize: 10 } } : undefined,
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: times,
        axisLabel: { color: muted, fontSize: 10 },
        axisLine: { lineStyle: { color: muted } },
      },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: { color: muted, fontSize: 10 },
        splitLine: { lineStyle: { color: "rgba(0,0,0,0.06)" } },
      },
      series,
    };
  }

  if (t === "bar") {
    const keys = propList.value;
    const vals = keys.map((k) => {
      const n = Number(props.propsMap[k]);
      return Number.isFinite(n) ? n : 0;
    });
    return {
      color: palette,
      grid: { left: 40, right: 12, top: 20, bottom: 40 },
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: keys,
        axisLabel: { color: muted, fontSize: 10, rotate: keys.length > 4 ? 30 : 0 },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: muted, fontSize: 10 },
        splitLine: { lineStyle: { color: "rgba(0,0,0,0.06)" } },
      },
      series: [
        {
          type: "bar",
          data: vals.map((v, idx) => ({
            value: v,
            itemStyle: { color: palette[idx % palette.length], borderRadius: [4, 4, 0, 0] },
          })),
          barMaxWidth: 36,
        },
      ],
    };
  }

  return null;
}

function isChartType(t = typeId.value) {
  return ["gauge", "line", "bar"].includes(t);
}

function disposeChart() {
  if (chart) {
    chart.dispose();
    chart = null;
  }
}

function ensureChart() {
  if (!chartEl.value || !isChartType()) {
    disposeChart();
    return null;
  }
  const el = chartEl.value;
  // 容器尚未布局完成时先不初始化，避免画布锁死成极小尺寸
  if (el.clientWidth < 8 || el.clientHeight < 8) return null;
  if (!chart) chart = echarts.init(el);
  return chart;
}

function renderChart() {
  const inst = ensureChart();
  if (!inst) return;
  const opt = buildOption();
  if (opt) {
    inst.setOption(opt, true);
    inst.resize();
  }
}

function scheduleRender() {
  nextTick(() => {
    requestAnimationFrame(() => {
      renderChart();
      // 网格拖拽/动画结束后再补一次
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (chart && chartEl.value) {
          chart.resize({
            width: chartEl.value.clientWidth,
            height: chartEl.value.clientHeight,
          });
        } else {
          renderChart();
        }
      }, 80);
    });
  });
}

function onResize() {
  if (!chart || !chartEl.value) {
    scheduleRender();
    return;
  }
  chart.resize({
    width: chartEl.value.clientWidth,
    height: chartEl.value.clientHeight,
  });
}

watch(typeId, (now, prev) => {
  if (now !== prev) disposeChart();
  scheduleRender();
});

watch(
  () => [props.item, props.propsMap, props.history, props.item?.w, props.item?.h],
  () => scheduleRender(),
  { deep: true }
);

watch(chartEl, (el, prev) => {
  if (ro) {
    if (prev) ro.unobserve(prev);
    if (el) ro.observe(el);
  }
  scheduleRender();
});

onMounted(() => {
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => onResize());
    if (rootEl.value) ro.observe(rootEl.value);
    if (chartEl.value) ro.observe(chartEl.value);
  }
  scheduleRender();
  window.addEventListener("resize", onResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", onResize);
  clearTimeout(resizeTimer);
  ro?.disconnect();
  ro = null;
  disposeChart();
});
</script>

<template>
  <div
    ref="rootEl"
    class="widget"
    :class="{
      compact,
      chartish: isChartType(),
      'is-switch': typeId === 'status' || typeId === 'setpoint' || (typeId === 'value' && singleControllable),
    }"
  >
    <div
      v-if="!(typeId === 'status' && propList.length === 1) && typeId !== 'setpoint' && !(typeId === 'value' && singleControllable)"
      class="widget-title"
    >
      {{ title }}
    </div>

    <!-- 数值卡：可写布尔 → 大号开关面板 -->
    <div v-if="typeId === 'value'" class="widget-value">
      <template v-if="singleControllable">
        <button
          type="button"
          class="switch-panel"
          :class="{ on: isOn(singleValue), busy: busyKey === singleKey }"
          :disabled="!!busyKey"
          @click.stop="toggleKey(singleKey)"
        >
          <div class="switch-panel-top">
            <span class="switch-label">{{ title || singleKey }}</span>
            <span class="switch-badge" :class="{ on: isOn(singleValue) }">
              {{ isOn(singleValue) ? "运行中" : "已关闭" }}
            </span>
          </div>
          <div class="switch-panel-mid">
            <span class="switch-hero" :class="{ on: isOn(singleValue) }">
              {{ isOn(singleValue) ? "开" : "关" }}
            </span>
            <span class="switch-track" :class="{ on: isOn(singleValue) }">
              <span class="switch-thumb" />
            </span>
          </div>
          <div class="switch-panel-foot">
            <span class="prop-code">{{ singleKey }}</span>
            <span class="hint">{{ busyKey === singleKey ? "下发中…" : "点击切换" }}</span>
          </div>
        </button>
        <div v-if="controlMsg" class="ctrl-err">{{ controlMsg }}</div>
      </template>
      <template v-else>
        {{ fmt(singleValue) }}
        <small v-if="propList[0]">{{ propList[0] }}</small>
      </template>
    </div>

    <!-- 阈值卡：编辑数值并下发 -->
    <div v-else-if="typeId === 'setpoint'" class="widget-status solo">
      <div class="switch-panel setpoint-panel">
        <div class="switch-panel-top">
          <span class="switch-label">{{ title || singleKey || "阈值" }}</span>
          <span class="switch-badge">当前值</span>
        </div>
        <div v-if="!editing" class="switch-panel-mid setpoint-mid">
          <span class="switch-hero num">{{ fmt(singleValue) }}</span>
        </div>
        <label v-else class="setpoint-edit" @mousedown.stop @click.stop>
          <input
            v-model="draft"
            class="setpoint-input"
            type="number"
            step="any"
            inputmode="decimal"
            :disabled="!!busyKey"
            @keydown.enter.prevent="submitEdit"
            @keydown.esc.prevent="cancelEdit"
          />
        </label>
        <div class="switch-panel-foot setpoint-foot">
          <span class="prop-code">{{ singleKey || "未绑定属性" }}</span>
          <span v-if="!editing" class="setpoint-actions">
            <button
              type="button"
              class="setpoint-btn"
              :disabled="!singleControllable || !!busyKey"
              @click.stop="startEdit"
            >
              编辑
            </button>
          </span>
          <span v-else class="setpoint-actions">
            <button type="button" class="setpoint-btn ghost" :disabled="!!busyKey" @click.stop="cancelEdit">
              取消
            </button>
            <button type="button" class="setpoint-btn" :disabled="!!busyKey" @click.stop="submitEdit">
              {{ busyKey ? "下发中…" : "下发" }}
            </button>
          </span>
        </div>
        <div v-if="!singleKey" class="hint">请绑定一个数值属性</div>
        <div v-else-if="!allowControl" class="hint">全屏大屏可编辑并下发</div>
        <div v-else-if="!singleControllable" class="hint">该属性未标记为可写</div>
      </div>
      <div v-if="controlMsg" class="ctrl-err">{{ controlMsg }}</div>
    </div>

    <!-- 状态灯 / 开关 -->
    <div v-else-if="typeId === 'status'" class="widget-status" :class="{ solo: propList.length === 1 }">
      <!-- 单开关：铺满卡片 -->
      <button
        v-if="propList.length === 1 && canControl(propList[0])"
        type="button"
        class="switch-panel"
        :class="{ on: isOn(propsMap[propList[0]]), busy: busyKey === propList[0] }"
        :disabled="!!busyKey"
        @click.stop="toggleKey(propList[0])"
      >
        <div class="switch-panel-top">
          <span class="switch-label">{{ title || propList[0] }}</span>
          <span class="switch-badge" :class="{ on: isOn(propsMap[propList[0]]) }">
            {{ isOn(propsMap[propList[0]]) ? "运行中" : "已关闭" }}
          </span>
        </div>
        <div class="switch-panel-mid">
          <span class="switch-hero" :class="{ on: isOn(propsMap[propList[0]]) }">
            {{ isOn(propsMap[propList[0]]) ? "开" : "关" }}
          </span>
          <span class="switch-track" :class="{ on: isOn(propsMap[propList[0]]) }">
            <span class="switch-thumb" />
          </span>
        </div>
        <div class="switch-panel-foot">
          <span class="prop-code">{{ propList[0] }}</span>
          <span class="hint">{{ busyKey === propList[0] ? "下发中…" : "点击切换" }}</span>
        </div>
      </button>

      <!-- 只读单状态 -->
      <div
        v-else-if="propList.length === 1"
        class="switch-panel readonly"
        :class="{ on: isOn(propsMap[propList[0]]) }"
      >
        <div class="switch-panel-top">
          <span class="switch-label">{{ title || propList[0] }}</span>
          <span class="switch-badge" :class="{ on: isOn(propsMap[propList[0]]) }">
            {{ isOn(propsMap[propList[0]]) ? "开启" : "关闭" }}
          </span>
        </div>
        <div class="switch-panel-mid">
          <span class="switch-hero" :class="{ on: isOn(propsMap[propList[0]]) }">
            {{ isOn(propsMap[propList[0]]) ? "开" : "关" }}
          </span>
        </div>
        <div class="switch-panel-foot">
          <span class="prop-code">{{ propList[0] }}</span>
          <span class="hint">只读状态</span>
        </div>
      </div>

      <!-- 多开关列表 -->
      <template v-else>
        <button
          v-for="key in propList"
          :key="key"
          type="button"
          class="status-tile"
          :class="{
            on: isOn(propsMap[key]),
            controllable: canControl(key),
            busy: busyKey === key,
          }"
          :disabled="!canControl(key) || !!busyKey"
          @click.stop="canControl(key) && toggleKey(key)"
        >
          <span class="tile-icon" :class="{ on: isOn(propsMap[key]) }">
            <span class="tile-core" />
          </span>
          <span class="tile-meta">
            <span class="tile-name">{{ key }}</span>
            <span class="tile-state">{{ isOn(propsMap[key]) ? "开" : "关" }}</span>
          </span>
          <span v-if="canControl(key)" class="switch-track sm" :class="{ on: isOn(propsMap[key]) }">
            <span class="switch-thumb" />
          </span>
        </button>
      </template>

      <div v-if="!propList.length" class="empty">请选择布尔/开关属性</div>
      <div v-if="controlMsg" class="ctrl-err">{{ controlMsg }}</div>
    </div>

    <div v-else-if="typeId === 'table'" class="widget-table">
      <table>
        <thead>
          <tr>
            <th>属性</th>
            <th>值</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in tableRows" :key="row.key">
            <td>{{ row.key }}</td>
            <td>{{ row.value }}</td>
          </tr>
          <tr v-if="!tableRows.length">
            <td colspan="2" class="empty">请选择要展示的属性</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else ref="chartEl" class="widget-chart" />
  </div>
</template>

<style scoped>
.widget {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  box-sizing: border-box;
}

.widget.chartish {
  position: relative;
}

.widget-title {
  font-size: var(--sc-card-title-size, 0.82rem);
  color: var(--sc-muted, var(--muted));
  letter-spacing: 0.02em;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.widget-value {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  font-family: var(--sc-font, var(--font-num));
  font-size: var(--sc-value-size, clamp(1.6rem, 3vw, 2.4rem));
  font-weight: 700;
  color: var(--sc-accent, var(--accent-deep));
  line-height: 1.1;
}

.widget-value small {
  margin-top: 8px;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--muted);
}

.widget.compact .widget-value {
  font-size: 1.45rem;
}

.widget-chart {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  min-height: 0;
  height: 100%;
  position: relative;
}

.widget.compact .widget-chart {
  min-height: 100px;
}

.widget:not(.compact) .widget-chart {
  min-height: 140px;
}

.widget-table {
  flex: 1;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.35);
}

.widget-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.widget-table th,
.widget-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--line);
  text-align: left;
}

.widget-table th {
  color: var(--muted);
  font-weight: 500;
  background: rgba(0, 0, 0, 0.03);
}

.widget.is-switch {
  gap: 0;
}

.widget-status {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow: auto;
}

.widget-status.solo {
  overflow: hidden;
}

.setpoint-mid {
  align-items: center;
  justify-content: center;
}

.switch-hero.num {
  font-family: var(--sc-font, var(--font-num));
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
  color: var(--sc-accent, var(--accent-deep));
}

.setpoint-edit {
  flex: 1;
  display: flex;
  align-items: center;
  min-height: 0;
}

.setpoint-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--sc-accent, var(--accent)) 55%, var(--line));
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--sc-text, var(--ink));
  font-family: var(--sc-font, var(--font-num));
  font-size: clamp(1.4rem, 2.4vw, 2rem);
  font-weight: 700;
  padding: 8px 12px;
}

.setpoint-foot {
  align-items: center;
  gap: 8px;
}

.setpoint-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.setpoint-btn {
  border: 0;
  border-radius: 999px;
  padding: 6px 14px;
  background: var(--sc-accent, var(--accent));
  color: #fff;
  font-size: 0.82rem;
  cursor: pointer;
}

.setpoint-btn.ghost {
  background: transparent;
  color: var(--sc-text, var(--ink));
  border: 1px solid var(--line);
}

.setpoint-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.switch-panel.setpoint-panel,
.switch-panel.setpoint-panel:hover,
.switch-panel.setpoint-panel:active {
  cursor: default;
  transform: none;
}

.widget-value:has(.switch-panel) {
  justify-content: stretch;
}

.switch-panel {
  flex: 1;
  width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 12px;
  border: 1px solid color-mix(in srgb, var(--sc-border, var(--line)) 80%, transparent);
  border-radius: calc(var(--sc-radius, 14px) - 4px);
  background:
    linear-gradient(
      160deg,
      color-mix(in srgb, var(--sc-accent, var(--accent)) 14%, transparent),
      transparent 55%
    ),
    color-mix(in srgb, var(--sc-card, #fff) 55%, transparent);
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease;
}

.switch-panel:hover:not(:disabled) {
  border-color: var(--sc-accent, var(--accent));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--sc-accent, var(--accent)) 35%, transparent);
}

.switch-panel:active:not(:disabled) {
  transform: scale(0.985);
}

.switch-panel.on {
  background:
    linear-gradient(
      160deg,
      color-mix(in srgb, var(--sc-accent, var(--accent)) 28%, transparent),
      color-mix(in srgb, var(--sc-accent, var(--accent)) 6%, transparent) 60%
    ),
    color-mix(in srgb, var(--sc-card, #fff) 45%, transparent);
  border-color: color-mix(in srgb, var(--sc-accent, var(--accent)) 55%, transparent);
}

.switch-panel.busy {
  opacity: 0.7;
  cursor: wait;
}

.switch-panel.readonly {
  cursor: default;
}

.switch-panel.readonly:hover {
  border-color: color-mix(in srgb, var(--sc-border, var(--line)) 80%, transparent);
  box-shadow: none;
}

.switch-panel-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.switch-label {
  font-size: calc(var(--sc-card-title-size, 13px) + 2px);
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--sc-text, var(--ink));
}

.switch-badge {
  flex-shrink: 0;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  color: var(--sc-muted, var(--muted));
  background: color-mix(in srgb, var(--sc-muted, #888) 16%, transparent);
  border: 1px solid color-mix(in srgb, var(--sc-muted, #888) 22%, transparent);
}

.switch-badge.on {
  color: var(--sc-accent, var(--accent));
  background: color-mix(in srgb, var(--sc-accent, var(--accent)) 18%, transparent);
  border-color: color-mix(in srgb, var(--sc-accent, var(--accent)) 35%, transparent);
}

.switch-panel-mid {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 72px;
}

.widget.compact .switch-panel-mid {
  min-height: 48px;
}

.switch-hero {
  font-family: var(--sc-font, var(--font-num));
  font-size: clamp(2.4rem, 5vw, 3.4rem);
  font-weight: 700;
  line-height: 1;
  color: color-mix(in srgb, var(--sc-muted, var(--muted)) 75%, transparent);
  letter-spacing: 0.08em;
}

.switch-hero.on {
  color: var(--sc-accent, var(--accent));
  text-shadow: 0 0 24px color-mix(in srgb, var(--sc-accent, var(--accent)) 35%, transparent);
}

.widget.compact .switch-hero {
  font-size: 2rem;
}

.switch-track {
  position: relative;
  width: 64px;
  height: 34px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--sc-muted, #888) 35%, #666);
  flex-shrink: 0;
  transition: background 0.2s ease;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.25);
}

.switch-track.on {
  background: var(--sc-accent, var(--accent));
}

.switch-track.sm {
  width: 48px;
  height: 26px;
}

.switch-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  transition: transform 0.2s ease;
}

.switch-track.on .switch-thumb {
  transform: translateX(30px);
}

.switch-track.sm .switch-thumb {
  width: 20px;
  height: 20px;
}

.switch-track.sm.on .switch-thumb {
  transform: translateX(22px);
}

.switch-panel-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px solid color-mix(in srgb, var(--sc-border, var(--line)) 70%, transparent);
}

.prop-code {
  font-family: var(--font-num);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  color: var(--sc-muted, var(--muted));
  text-transform: none;
}

.hint {
  font-size: 0.72rem;
  color: var(--sc-muted, var(--muted));
}

.status-tile {
  display: grid;
  grid-template-columns: 36px 1fr auto;
  gap: 12px;
  align-items: center;
  width: 100%;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--sc-border, var(--line)) 85%, transparent);
  background: color-mix(in srgb, var(--sc-card, #fff) 40%, transparent);
  color: inherit;
  text-align: left;
  cursor: default;
}

.status-tile.controllable {
  cursor: pointer;
}

.status-tile.controllable:hover {
  border-color: var(--sc-accent, var(--accent));
}

.status-tile.on {
  background: color-mix(in srgb, var(--sc-accent, var(--accent)) 12%, transparent);
  border-color: color-mix(in srgb, var(--sc-accent, var(--accent)) 40%, transparent);
}

.status-tile.busy {
  opacity: 0.65;
  cursor: wait;
}

.tile-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--sc-muted, #888) 22%, transparent);
}

.tile-icon.on {
  background: color-mix(in srgb, var(--sc-accent, var(--accent)) 22%, transparent);
}

.tile-core {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--sc-muted, #888) 70%, #fff);
}

.tile-icon.on .tile-core {
  background: var(--sc-accent, var(--accent));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--sc-accent, var(--accent)) 22%, transparent);
}

.tile-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.tile-name {
  font-weight: 600;
  font-size: 0.92rem;
  color: var(--sc-text, var(--ink));
}

.tile-state {
  font-size: 0.75rem;
  color: var(--sc-muted, var(--muted));
}

.status-tile.on .tile-state {
  color: var(--sc-accent, var(--accent));
}

.empty {
  color: var(--muted);
  font-size: 0.84rem;
  text-align: center;
  padding: 12px;
}

.ctrl-err {
  margin-top: 6px;
  font-size: 0.75rem;
  color: var(--danger, #b2453a);
  line-height: 1.35;
  word-break: break-all;
}
</style>
