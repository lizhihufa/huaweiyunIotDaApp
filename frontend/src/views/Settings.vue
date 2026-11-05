<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { api } from "../api";
import {
  DEFAULT_APPEARANCE,
  THEME_PRESETS,
  applyAppearance,
  getPreset,
} from "../theme/presets";

const emit = defineEmits(["status-changed", "appearance-changed"]);

const form = reactive({
  huawei: {
    ak: "",
    sk: "",
    project_id: "",
    region: "cn-north-4",
    iotda_endpoint: "",
    use_derived_auth: true,
    device_id: "",
    service_id: "",
    product_id: "",
  },
  poll: { interval_sec: 2, history_enabled: false },
  server: { host: "127.0.0.1", port: 8790 },
});

const appearance = reactive({ ...DEFAULT_APPEARANCE });

const status = ref({});
const message = ref("");
const msgType = ref("");
const appearMsg = ref("");
const appearMsgType = ref("");
const busy = ref(false);
const uploading = ref(false);
const wipeConfirm = ref("");
const wipeBusy = ref(false);
const wipeMsg = ref("");
const wipeMsgType = ref("");

function setMsg(text, type = "") {
  message.value = text;
  msgType.value = type;
}

function previewLive() {
  applyAppearance({ ...appearance });
  emit("appearance-changed", { ...appearance });
}

watch(
  () => ({ ...appearance }),
  () => previewLive(),
  { deep: true }
);

const buttonPicker = computed({
  get: () => appearance.button_color || getPreset(appearance.theme_id).vars.accent,
  set: (v) => {
    appearance.button_color = v;
  },
});

const borderPicker = computed({
  get: () => appearance.border_color || getPreset(appearance.theme_id).vars.ink,
  set: (v) => {
    appearance.border_color = v;
  },
});

function selectTheme(id) {
  appearance.theme_id = id;
  const preset = getPreset(id);
  previewLive();
  appearMsg.value = `已切换主题「${preset.name}」`;
  appearMsgType.value = "ok";
}

function clearBg() {
  appearance.background_image = "";
}

async function onUploadBg(ev) {
  const file = ev.target.files?.[0];
  if (!file) return;
  uploading.value = true;
  try {
    const res = await api.uploadBackground(file);
    appearance.background_image = res.url;
    appearMsg.value = "系统背景图已上传，请点「保存外观」写入配置";
    appearMsgType.value = "ok";
  } catch (e) {
    appearMsg.value = e.message;
    appearMsgType.value = "err";
  } finally {
    uploading.value = false;
    ev.target.value = "";
  }
}

async function load() {
  const res = await api.getSettings();
  Object.assign(form.huawei, res.data.huawei || {});
  Object.assign(form.poll, res.data.poll || {});
  Object.assign(form.server, res.data.server || {});
  Object.assign(appearance, DEFAULT_APPEARANCE, res.data.appearance || {});
  status.value = await api.status();
  previewLive();
}

async function save() {
  busy.value = true;
  try {
    await api.saveSettings({
      huawei: { ...form.huawei },
      poll: { ...form.poll },
      server: { ...form.server },
      appearance: { ...appearance },
    });
    setMsg("设置已保存到 data/settings.yaml", "ok");
    appearMsg.value = "外观已保存";
    appearMsgType.value = "ok";
    emit("status-changed");
    emit("appearance-changed", { ...appearance });
    await load();
  } catch (e) {
    setMsg(e.message, "err");
  } finally {
    busy.value = false;
  }
}

async function saveAppearanceOnly() {
  busy.value = true;
  try {
    await api.saveSettings({ appearance: { ...appearance } });
    appearMsg.value = "外观已保存";
    appearMsgType.value = "ok";
    emit("appearance-changed", { ...appearance });
  } catch (e) {
    appearMsg.value = e.message;
    appearMsgType.value = "err";
  } finally {
    busy.value = false;
  }
}

async function testConn() {
  busy.value = true;
  try {
    await api.saveSettings({ huawei: { ...form.huawei }, poll: { ...form.poll } });
    const res = await api.testConnection();
    setMsg(res.message || (res.ok ? "成功" : "失败"), res.ok ? "ok" : "err");
  } catch (e) {
    setMsg(e.message, "err");
  } finally {
    busy.value = false;
  }
}

async function connect() {
  busy.value = true;
  try {
    await api.saveSettings({ huawei: { ...form.huawei }, poll: { ...form.poll } });
    const res = await api.connect();
    status.value = res.status;
    setMsg(res.status?.message || "已连接并开始轮询", "ok");
    // 若后端自动纠正了派生认证，刷新表单
    await load();
    emit("status-changed");
  } catch (e) {
    setMsg(e.message, "err");
  } finally {
    busy.value = false;
  }
}

function clearBrowserCaches() {
  try {
    localStorage.removeItem("hwy_startup");
    localStorage.removeItem("hwy_last_shadow");
    sessionStorage.removeItem("hwy_startup_applied");
  } catch {
    /* ignore */
  }
}

async function wipeAllData() {
  if (wipeConfirm.value.trim() !== "删除全部") {
    wipeMsg.value = "请先在输入框中输入：删除全部";
    wipeMsgType.value = "err";
    return;
  }
  if (!window.confirm("确定删除全部本地数据？此操作不可恢复。")) {
    return;
  }
  wipeBusy.value = true;
  wipeMsg.value = "";
  try {
    const res = await api.wipeAllData("删除全部");
    clearBrowserCaches();
    Object.assign(form.huawei, {
      ak: "",
      sk: "",
      project_id: "",
      region: "cn-north-4",
      iotda_endpoint: "",
      use_derived_auth: true,
      device_id: "",
      service_id: "",
      product_id: "",
    });
    Object.assign(form.poll, { interval_sec: 2, history_enabled: false });
    Object.assign(form.server, { host: "127.0.0.1", port: 8790 });
    Object.assign(appearance, { ...DEFAULT_APPEARANCE });
    wipeConfirm.value = "";
    status.value = res.status || { connected: false };
    previewLive();
    emit("status-changed");
    emit("appearance-changed", { ...appearance });
    wipeMsg.value = res.message || "本地数据已全部清空";
    wipeMsgType.value = "ok";
    setMsg(wipeMsg.value, "ok");
    await load();
  } catch (e) {
    wipeMsg.value = e.message || "清空失败";
    wipeMsgType.value = "err";
  } finally {
    wipeBusy.value = false;
  }
}

async function disconnect() {
  busy.value = true;
  try {
    const res = await api.disconnect();
    status.value = res.status;
    setMsg("已断开连接", "ok");
    emit("status-changed");
  } catch (e) {
    setMsg(e.message, "err");
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <header class="page-head">
    <p class="page-kicker">Settings</p>
    <h1 class="page-title">系统设置</h1>
  </header>

  <div class="section-bar">
    <span class="badge dot" :class="status.connected ? 'on' : 'off'">
      {{ status.connected ? "已连接" : "未连接" }}
    </span>
    <span class="badge">配置{{ status.settings_ready ? "完整" : "不完整" }}</span>
    <span v-if="status.error" class="meta-text">{{ status.error }}</span>
  </div>

  <section class="panel">
    <h3>界面主题</h3>
    <p class="page-desc" style="margin: 0 0 16px">
      配色整理自 ColorBlend / ColorVio / ColorsWall / Color Agent 等公开色板，可一键切换后再微调。
    </p>
    <div class="theme-grid">
      <button
        v-for="t in THEME_PRESETS"
        :key="t.id"
        type="button"
        class="theme-card"
        :class="{ active: appearance.theme_id === t.id }"
        @click="selectTheme(t.id)"
      >
        <div
          class="theme-swatch"
          :style="{
            background: `linear-gradient(135deg, ${t.vars.accent} 0%, ${t.vars.straw} 45%, ${t.vars.bg1} 100%)`,
          }"
        />
        <div class="theme-meta">
          <strong>{{ t.name }}</strong>
          <small>{{ t.source }}</small>
        </div>
      </button>
    </div>

    <div class="grid-2" style="margin-top: 18px">
      <div class="field">
        <label>主标题</label>
        <input v-model="appearance.brand_title" placeholder="华为云IOT" />
      </div>
      <div class="field">
        <label>副标题</label>
        <input v-model="appearance.brand_subtitle" placeholder="Huawei Cloud IoT" />
      </div>
      <div class="field" style="grid-column: 1 / -1">
        <label>标语 / Tagline</label>
        <input v-model="appearance.brand_tagline" placeholder="华为云IOT" />
      </div>
      <div class="field">
        <label>按钮颜色</label>
        <div class="color-row">
          <input v-model="buttonPicker" type="color" class="color-input" />
          <input
            v-model="appearance.button_color"
            placeholder="留空则用主题默认"
            class="color-text"
          />
          <button class="btn" type="button" @click="appearance.button_color = ''">重置</button>
        </div>
      </div>
      <div class="field">
        <label>边框颜色</label>
        <div class="color-row">
          <input v-model="borderPicker" type="color" class="color-input" />
          <input
            v-model="appearance.border_color"
            placeholder="留空则用主题默认"
            class="color-text"
          />
          <button class="btn" type="button" @click="appearance.border_color = ''">重置</button>
        </div>
      </div>
      <div class="field" style="grid-column: 1 / -1">
        <label>系统背景图 URL（管理页 / 侧栏，与大屏无关）</label>
        <input
          v-model="appearance.background_image"
          placeholder="https://... 或 /media/xxx.jpg"
        />
      </div>
      <div class="field">
        <label>系统背景遮罩（{{ appearance.background_overlay }}）</label>
        <input
          v-model.number="appearance.background_overlay"
          type="range"
          min="0.35"
          max="0.92"
          step="0.01"
        />
      </div>
      <div class="field">
        <label>上传系统背景图</label>
        <input type="file" accept="image/*" :disabled="uploading" @change="onUploadBg" />
      </div>
    </div>

    <div class="row-actions">
      <button class="btn" type="button" @click="clearBg">清除系统背景</button>
      <button class="btn primary" type="button" :disabled="busy" @click="saveAppearanceOnly">
        保存外观
      </button>
    </div>
    <div v-if="appearMsg" class="msg" :class="appearMsgType">{{ appearMsg }}</div>
    <div v-if="appearance.background_image" class="bg-preview">
      <img :src="appearance.background_image" alt="背景预览" />
    </div>
  </section>

  <section class="panel">
    <h3>华为云连接参数</h3>
    <div class="grid-2">
      <div class="field">
        <label>AK</label>
        <input v-model="form.huawei.ak" autocomplete="off" />
      </div>
      <div class="field">
        <label>SK（已保存时为脱敏，保留掩码则不修改）</label>
        <input v-model="form.huawei.sk" type="password" autocomplete="new-password" />
      </div>
      <div class="field">
        <label>项目 ID</label>
        <input v-model="form.huawei.project_id" />
      </div>
      <div class="field">
        <label>区域</label>
        <input v-model="form.huawei.region" placeholder="例如 cn-north-4" />
      </div>
      <div class="field" style="grid-column: 1 / -1">
        <label>物联网平台应用侧接入地址（含 https://，须使用 iotda-app）</label>
        <input
          v-model="form.huawei.iotda_endpoint"
          placeholder="https://xxxx.st1.iotda-app.cn-north-4.myhuaweicloud.com"
        />
      </div>
      <div class="field derived-field" style="grid-column: 1 / -1">
        <label class="derived-row">
          <input v-model="form.huawei.use_derived_auth" type="checkbox" />
          <span class="derived-copy">
            <strong>派生认证</strong>
            <small>标准版 / 企业版必须勾选（接入地址含 st1.iotda-app）；基础版取消勾选。</small>
          </span>
        </label>
      </div>
      <div class="field">
        <label>默认设备 ID</label>
        <input v-model="form.huawei.device_id" />
      </div>
      <div class="field">
        <label>服务 ID</label>
        <input v-model="form.huawei.service_id" />
      </div>
      <div class="field">
        <label>产品 ID（可选）</label>
        <input v-model="form.huawei.product_id" />
      </div>
    </div>
  </section>

  <section class="panel">
    <h3>运行参数</h3>
    <div class="grid-2">
      <div class="field">
        <label>轮询间隔（秒）</label>
        <input v-model.number="form.poll.interval_sec" type="number" min="1" />
      </div>
      <div class="field">
        <label>服务端口（重启 run.py 后生效）</label>
        <input v-model.number="form.server.port" type="number" />
      </div>
    </div>
    <div class="row-actions">
      <button class="btn primary" :disabled="busy" @click="save">保存全部设置</button>
      <button class="btn" :disabled="busy" @click="testConn">测试连接</button>
      <button class="btn primary" :disabled="busy" @click="connect">连接</button>
      <button class="btn" :disabled="busy" @click="disconnect">断开</button>
    </div>
    <div v-if="message" class="msg" :class="msgType">{{ message }}</div>
  </section>

  <section class="panel danger-zone">
    <h3>危险操作</h3>
    <p class="page-desc" style="margin-top: 0">
      删除全部本地数据：连接配置、外观、启动页、设备点位、大屏布局与主题、上传背景图、历史缓存。
      不可恢复，云端设备数据不受影响。
    </p>
    <div class="field">
      <label>请输入「删除全部」以确认</label>
      <input v-model="wipeConfirm" placeholder="删除全部" autocomplete="off" />
    </div>
    <div class="row-actions">
      <button
        class="btn danger"
        type="button"
        :disabled="wipeBusy || wipeConfirm.trim() !== '删除全部'"
        @click="wipeAllData"
      >
        {{ wipeBusy ? "正在删除…" : "删除所有数据" }}
      </button>
    </div>
    <div v-if="wipeMsg" class="msg" :class="wipeMsgType">{{ wipeMsg }}</div>
  </section>
</template>

<style scoped>
.danger-zone {
  border-color: rgba(178, 69, 58, 0.28);
}

.danger-zone h3 {
  color: var(--danger, #b2453a);
}

.derived-field {
  margin: 0;
}

.derived-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin: 0;
  padding: 12px 14px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-solid);
  color: var(--ink);
  cursor: pointer;
}

.derived-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.derived-copy strong {
  font-size: 0.95rem;
  font-weight: 650;
  color: var(--ink);
}

.derived-copy small {
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--muted);
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.theme-card {
  text-align: left;
  border: 1px solid var(--line-strong);
  background: var(--surface-solid);
  border-radius: 12px;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  color: inherit;
  transition: transform 0.2s var(--ease), border-color 0.2s;
}

.theme-card:hover {
  transform: translateY(-2px);
  border-color: var(--accent);
}

.theme-card.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.theme-swatch {
  height: 56px;
}

.theme-meta {
  padding: 10px 12px 12px;
}

.theme-meta strong {
  display: block;
  font-size: 0.92rem;
}

.theme-meta small {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  font-size: 0.72rem;
  line-height: 1.35;
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

.bg-preview {
  margin-top: 14px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--line);
  max-height: 180px;
}

.bg-preview img {
  display: block;
  width: 100%;
  height: 180px;
  object-fit: cover;
}
</style>
