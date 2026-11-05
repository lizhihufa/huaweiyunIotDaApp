<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { api, connectRealtime } from "../api";

const status = ref({ connected: false, settings_ready: false });
const props = ref({});
const metrics = ref([]);
const error = ref("");
const ts = ref("");
let ws = null;

const entries = computed(() => {
  const map = props.value || {};
  if (metrics.value.length) {
    return metrics.value.map((m) => ({
      key: m.property_name,
      label: m.name || m.property_name,
      unit: m.unit || "",
      writable: !!m.writable,
      type: m.type || "number",
      value: map[m.property_name],
    }));
  }
  return Object.keys(map).map((k) => ({
    key: k,
    label: k,
    unit: "",
    writable: typeof map[k] === "boolean",
    type: typeof map[k] === "boolean" ? "boolean" : "number",
    value: map[k],
  }));
});

async function refresh() {
  status.value = await api.status();
  const shadow = await api.shadow();
  props.value = shadow.data || {};
  error.value = shadow.error || "";
  ts.value = shadow.ts || "";
  const m = await api.metrics();
  metrics.value = m.items || [];
}

async function toggle(item) {
  if (!item.writable) return;
  const next = !Boolean(item.value);
  try {
    const res = await api.setProperty(item.key, next);
    props.value = res.data || props.value;
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(async () => {
  await refresh();
  ws = connectRealtime((msg) => {
    if (msg.type === "props") {
      props.value = msg.data || {};
      ts.value = msg.ts || ts.value;
      error.value = "";
    } else if (msg.type === "error") {
      error.value = msg.message || "轮询错误";
    } else if (msg.type === "status") {
      status.value = msg.data || status.value;
      if (msg.props) props.value = msg.props;
    } else if (msg.type === "hello") {
      status.value = msg.status || status.value;
      props.value = msg.data || {};
      ts.value = msg.ts || "";
      error.value = msg.error || "";
    }
  });
});

onUnmounted(() => {
  if (ws) ws.close();
});
</script>

<template>
  <header class="page-head">
    <p class="page-kicker">Realtime</p>
    <h1 class="page-title">监测控制</h1>
  </header>

  <div class="section-bar">
    <span class="badge dot" :class="status.connected ? 'on' : 'off'">
      {{ status.connected ? "轮询中" : "未连接" }}
    </span>
    <span class="meta-text">最近更新 {{ ts || "—" }}</span>
  </div>

  <div v-if="!status.settings_ready" class="msg">
    请先到 <RouterLink to="/settings">系统设置</RouterLink> 填写参数并连接。
  </div>
  <div v-else-if="!status.connected" class="msg">
    配置已就绪，请到 <RouterLink to="/settings">系统设置</RouterLink> 点击「连接」。
  </div>
  <div v-if="error" class="msg err">{{ error }}</div>

  <div v-if="entries.length" class="cards" style="margin-top: 18px">
    <div
      v-for="(item, idx) in entries"
      :key="item.key"
      class="card"
      :style="{ animationDelay: `${idx * 40}ms` }"
    >
      <div class="k">
        {{ item.label }}
        <span v-if="item.unit"> · {{ item.unit }}</span>
      </div>
      <div class="v">
        <template v-if="item.type === 'boolean' || typeof item.value === 'boolean'">
          {{ item.value ? "开" : "关" }}
        </template>
        <template v-else>
          {{ item.value === undefined || item.value === null ? "—" : item.value }}
        </template>
      </div>
      <button
        v-if="item.writable"
        class="btn"
        :disabled="!status.connected"
        @click="toggle(item)"
      >
        切换状态
      </button>
    </div>
  </div>
  <div v-else-if="status.connected" class="empty-hint" style="margin-top: 18px">
    暂无属性数据，确认设备已上报影子，或在数据管理中添加点位。
  </div>
</template>
