<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { RouterLink } from "vue-router";
import { api, connectRealtime } from "../api";

const devices = ref([]);
const metrics = ref([]);
const propsMap = ref({});
const connected = ref(false);
const msg = ref("");
const msgType = ref("");
const syncing = ref(false);
const picking = ref("");
let ws = null;

const deviceForm = reactive({
  id: "",
  name: "",
  device_id: "",
  service_id: "",
  group: "",
  location: "",
  note: "",
});

const metricForm = reactive({
  id: "",
  device_ref: "",
  name: "",
  property_name: "",
  unit: "",
  type: "number",
  writable: false,
  note: "",
});

const cloudEntries = computed(() =>
  Object.keys(propsMap.value || {}).map((k) => ({
    key: k,
    value: propsMap.value[k],
    imported: metrics.value.some((m) => m.property_name === k),
  }))
);

function formatValue(v) {
  if (v === undefined || v === null) return "—";
  if (typeof v === "boolean") return v ? "开" : "关";
  return String(v);
}

async function reload() {
  const [d, m, shadow, st] = await Promise.all([
    api.devices(),
    api.metrics(),
    api.shadow(),
    api.status(),
  ]);
  devices.value = d.items || [];
  metrics.value = m.items || [];
  propsMap.value = shadow.data || {};
  connected.value = !!st.connected;
}

function editDevice(d) {
  Object.assign(deviceForm, {
    id: d.id || "",
    name: d.name || "",
    device_id: d.device_id || "",
    service_id: d.service_id || "",
    group: d.group || "",
    location: d.location || "",
    note: d.note || "",
  });
}

function resetDevice() {
  Object.assign(deviceForm, {
    id: "",
    name: "",
    device_id: "",
    service_id: "",
    group: "",
    location: "",
    note: "",
  });
}

async function saveDevice() {
  try {
    const body = { ...deviceForm };
    if (!body.id) delete body.id;
    await api.saveDevice(body);
    msg.value = "设备已保存";
    msgType.value = "ok";
    resetDevice();
    await reload();
  } catch (e) {
    msg.value = e.message;
    msgType.value = "err";
  }
}

async function removeDevice(id) {
  if (!confirm("删除该设备及其关联点位？")) return;
  await api.deleteDevice(id);
  await reload();
}

function editMetric(m) {
  Object.assign(metricForm, {
    id: m.id || "",
    device_ref: m.device_ref || "",
    name: m.name || "",
    property_name: m.property_name || "",
    unit: m.unit || "",
    type: m.type || "number",
    writable: !!m.writable,
    note: m.note || "",
  });
}

function resetMetric() {
  Object.assign(metricForm, {
    id: "",
    device_ref: devices.value[0]?.id || "",
    name: "",
    property_name: "",
    unit: "",
    type: "number",
    writable: false,
    note: "",
  });
}

function fillMetricFromCloud(key) {
  const v = propsMap.value[key];
  const existing = metrics.value.find((m) => m.property_name === key);
  if (existing) {
    editMetric(existing);
    return;
  }
  metricForm.id = "";
  metricForm.property_name = key;
  metricForm.name = key;
  metricForm.unit = "";
  metricForm.note = "从云端选用";
  if (typeof v === "boolean") {
    metricForm.type = "boolean";
    metricForm.writable = key === "fan" || key === "automaticMode";
  } else if (typeof v === "number") {
    metricForm.type = "number";
    metricForm.writable = false;
  } else {
    metricForm.type = "string";
    metricForm.writable = false;
  }
}

async function pickCloudProp(key) {
  if (metrics.value.some((m) => m.property_name === key)) return;
  picking.value = key;
  try {
    const res = await api.importShadowMetrics(false, [key]);
    if (Array.isArray(res.metrics)) metrics.value = res.metrics;
    if (Array.isArray(res.devices)) devices.value = res.devices;
    if (!res.added?.length) {
      msg.value = `「${key}」未能导入，请确认已连接且有实时数据`;
      msgType.value = "err";
    }
  } catch (e) {
    msg.value = e.message;
    msgType.value = "err";
  } finally {
    picking.value = "";
  }
}

async function saveMetric() {
  try {
    const body = { ...metricForm };
    if (!body.id) delete body.id;
    await api.saveMetric(body);
    msg.value = "点位已保存";
    msgType.value = "ok";
    resetMetric();
    await reload();
  } catch (e) {
    msg.value = e.message;
    msgType.value = "err";
  }
}

async function removeMetric(id) {
  await api.deleteMetric(id);
  await reload();
}

async function syncFromCloud(overwrite = false) {
  syncing.value = true;
  try {
    const res = await api.importShadowMetrics(overwrite);
    msg.value = `已同步：新增 ${res.added?.length || 0}，更新 ${res.updated?.length || 0}，跳过 ${res.skipped || 0}`;
    msgType.value = "ok";
    await reload();
    resetMetric();
  } catch (e) {
    msg.value = e.message;
    msgType.value = "err";
  } finally {
    syncing.value = false;
  }
}

function deviceName(id) {
  return devices.value.find((d) => d.id === id)?.name || id || "—";
}

onMounted(async () => {
  await reload();
  resetMetric();
  ws = connectRealtime((m) => {
    if (m.type === "props" || m.type === "hello") {
      propsMap.value = m.data || propsMap.value;
      if (m.status) connected.value = !!m.status.connected;
    } else if (m.type === "status") {
      connected.value = !!m.data?.connected;
      if (m.props) propsMap.value = m.props;
    }
  });
});

onUnmounted(() => {
  if (ws) ws.close();
});
</script>

<template>
  <header class="page-head">
    <p class="page-kicker">Catalog</p>
    <h1 class="page-title">数据管理</h1>
  </header>

  <div class="section-bar">
    <span class="badge dot" :class="connected ? 'on' : 'off'">
      {{ connected ? "已连接 · 可同步" : "未连接" }}
    </span>
    <span class="meta-text">云端属性 {{ cloudEntries.length }} 个</span>
    <button class="btn primary" :disabled="!connected || syncing" @click="syncFromCloud(false)">
      从云端同步点位
    </button>
    <button class="btn" :disabled="!connected || syncing" @click="syncFromCloud(true)">
      同步并覆盖已有
    </button>
  </div>

  <div v-if="msg" class="msg" :class="msgType">{{ msg }}</div>
  <div v-if="!connected" class="msg">
    请先到 <RouterLink to="/settings">系统设置</RouterLink> 连接，即可在此拉取全部影子数据。
  </div>

  <section v-if="cloudEntries.length" class="panel">
    <h3>云端实时属性</h3>
    <p class="page-desc" style="margin-top: 0">点「选用」会把该属性加入点位，状态变为已导入。</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>属性名</th>
            <th>当前值</th>
            <th>状态</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in cloudEntries" :key="row.key">
            <td>{{ row.key }}</td>
            <td>{{ formatValue(row.value) }}</td>
            <td>{{ row.imported ? "已导入" : "未导入" }}</td>
            <td>
              <button
                class="btn"
                type="button"
                :disabled="picking === row.key"
                @click="pickCloudProp(row.key)"
              >
                {{ row.imported ? "已选用" : "选用" }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <section class="panel">
    <h3>设备档案</h3>
    <div class="grid-2">
      <div class="field"><label>名称</label><input v-model="deviceForm.name" /></div>
      <div class="field"><label>云端 Device ID</label><input v-model="deviceForm.device_id" /></div>
      <div class="field"><label>Service ID</label><input v-model="deviceForm.service_id" /></div>
      <div class="field"><label>分组</label><input v-model="deviceForm.group" /></div>
      <div class="field"><label>位置</label><input v-model="deviceForm.location" /></div>
      <div class="field"><label>备注</label><input v-model="deviceForm.note" /></div>
    </div>
    <div class="row-actions">
      <button class="btn primary" @click="saveDevice">保存设备</button>
      <button class="btn" @click="resetDevice">新建</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>名称</th>
            <th>Device ID</th>
            <th>Service</th>
            <th>分组</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!devices.length">
            <td colspan="5" style="color: var(--muted)">暂无设备；同步点位时会按连接配置自动创建。</td>
          </tr>
          <tr v-for="d in devices" :key="d.id">
            <td>{{ d.name }}</td>
            <td>{{ d.device_id }}</td>
            <td>{{ d.service_id }}</td>
            <td>{{ d.group || "—" }}</td>
            <td>
              <button class="btn" @click="editDevice(d)">编辑</button>
              <button class="btn danger" @click="removeDevice(d.id)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <section class="panel">
    <h3>点位 / 指标</h3>
    <div class="grid-2">
      <div class="field">
        <label>所属设备</label>
        <select v-model="metricForm.device_ref">
          <option value="">未关联</option>
          <option v-for="d in devices" :key="d.id" :value="d.id">{{ d.name }}</option>
        </select>
      </div>
      <div class="field"><label>显示名称</label><input v-model="metricForm.name" /></div>
      <div class="field">
        <label>云端属性名</label>
        <select
          v-if="cloudEntries.length"
          v-model="metricForm.property_name"
          @change="metricForm.property_name && fillMetricFromCloud(metricForm.property_name)"
        >
          <option value="">手动选择 / 输入</option>
          <option v-for="row in cloudEntries" :key="row.key" :value="row.key">
            {{ row.key }} = {{ formatValue(row.value) }}
          </option>
        </select>
        <input
          v-else
          v-model="metricForm.property_name"
          placeholder="连接后可从云端列表选择"
        />
      </div>
      <div class="field"><label>单位</label><input v-model="metricForm.unit" /></div>
      <div class="field">
        <label>类型</label>
        <select v-model="metricForm.type">
          <option value="number">number</option>
          <option value="boolean">boolean</option>
          <option value="string">string</option>
        </select>
      </div>
      <div class="field">
        <label>
          <input v-model="metricForm.writable" type="checkbox" />
          可写（支持下发）
        </label>
      </div>
    </div>
    <div class="row-actions">
      <button class="btn primary" @click="saveMetric">保存点位</button>
      <button class="btn" @click="resetMetric">新建</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>名称</th>
            <th>属性</th>
            <th>当前值</th>
            <th>设备</th>
            <th>类型</th>
            <th>可写</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!metrics.length">
            <td colspan="7" style="color: var(--muted)">暂无点位，连接后点「从云端同步点位」。</td>
          </tr>
          <tr v-for="m in metrics" :key="m.id">
            <td>{{ m.name }}</td>
            <td>{{ m.property_name }}</td>
            <td>{{ formatValue(propsMap[m.property_name]) }}</td>
            <td>{{ deviceName(m.device_ref) }}</td>
            <td>{{ m.type }}</td>
            <td>{{ m.writable ? "是" : "否" }}</td>
            <td>
              <button class="btn" @click="editMetric(m)">编辑</button>
              <button class="btn danger" @click="removeMetric(m.id)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
