<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { api } from "../api";
import { DEVICE_BUILTIN_OPTIONS } from "../twin/builtinCatalog";

const KIND_LABEL = {
  board: "开发板",
  sensor: "传感器",
  actuator: "执行器",
  module: "模块",
};

const items = ref([]);
const kinds = ref(["board", "sensor", "actuator", "module"]);
const filterKind = ref("all");
const busy = ref(false);
const msg = ref("");
const msgType = ref("");
const showCreate = ref(false);

const form = reactive({
  name: "",
  kind: "board",
  layer: "控制层",
  part_id: "",
  desc: "",
  model: { kind: "builtin", id: "dev_mcu" },
  glbFile: null,
});

function setMsg(text, type = "") {
  msg.value = text;
  msgType.value = type;
}

async function reload() {
  const res = await api.libraryDevices();
  items.value = res.items || [];
  if (res.kinds?.length) kinds.value = res.kinds;
}

const filtered = computed(() => {
  const list = [...items.value].sort((a, b) =>
    String(b.updated_at || "").localeCompare(String(a.updated_at || ""))
  );
  if (filterKind.value === "all") return list;
  return list.filter((x) => x.kind === filterKind.value);
});

function resetForm() {
  form.name = "";
  form.kind = "board";
  form.layer = "控制层";
  form.part_id = "";
  form.desc = "";
  form.model = { kind: "builtin", id: "dev_mcu" };
  form.glbFile = null;
  showCreate.value = false;
}

function onPickGlb(ev) {
  form.glbFile = ev.target.files?.[0] || null;
  ev.target.value = "";
}

async function createDevice() {
  const name = form.name.trim();
  if (!name) {
    setMsg("请填写设备名称", "err");
    return;
  }
  busy.value = true;
  try {
    let model = { ...form.model };
    if (form.glbFile) {
      const up = await api.uploadGlb(form.glbFile);
      model = { kind: "glb", url: up.url };
    }
    await api.saveLibraryDevice({
      name,
      kind: form.kind,
      layer: form.layer,
      part_id: form.part_id.trim() || undefined,
      desc: form.desc,
      model,
      builtin: false,
    });
    setMsg(`已添加设备「${name}」`, "ok");
    resetForm();
    await reload();
  } catch (e) {
    setMsg(e.message || "添加失败", "err");
  } finally {
    busy.value = false;
  }
}

async function removeDevice(item) {
  if (item.builtin) {
    setMsg("内置设备不可删除", "err");
    return;
  }
  if (!window.confirm(`删除设备「${item.name}」？`)) return;
  busy.value = true;
  try {
    await api.deleteLibraryDevice(item.id);
    setMsg(`已删除「${item.name}」`, "ok");
    await reload();
  } catch (e) {
    setMsg(e.message || "删除失败", "err");
  } finally {
    busy.value = false;
  }
}

function modelHint(item) {
  const m = item.model || {};
  if (m.kind === "glb") return "GLB 模型";
  if (m.id === "street_light") return "内置路灯整机";
  return m.id ? `内置 ${m.id}` : "未指定模型";
}

onMounted(async () => {
  try {
    await reload();
  } catch (e) {
    setMsg(e.message, "err");
  }
});
</script>

<template>
  <header class="page-head twin-head">
    <div>
      <p class="page-kicker">Hardware</p>
      <h1 class="page-title">设备管理</h1>
    </div>
    <div class="twin-head-actions">
      <button class="btn primary" type="button" @click="showCreate = !showCreate">
        {{ showCreate ? "收起" : "添加设备模块" }}
      </button>
    </div>
  </header>

  <p class="page-desc">
    管理开发板、传感器、执行器等硬件模块。可挂内置几何或上传 GLB（节点名建议 = partId），供设备孪生装配使用。
  </p>
  <div v-if="msg" class="msg" :class="msgType">{{ msg }}</div>

  <section v-if="showCreate" class="panel create-panel">
    <h3>新建设备模块</h3>
    <div class="grid-2">
      <div class="field">
        <label>名称</label>
        <input v-model="form.name" placeholder="如：ESP32 开发板" />
      </div>
      <div class="field">
        <label>类型</label>
        <select v-model="form.kind">
          <option v-for="k in kinds" :key="k" :value="k">{{ KIND_LABEL[k] || k }}</option>
        </select>
      </div>
      <div class="field">
        <label>层级</label>
        <input v-model="form.layer" placeholder="控制层 / 传感层 / 执行层" />
      </div>
      <div class="field">
        <label>默认 partId</label>
        <input v-model="form.part_id" placeholder="如 mcu、ldr、relay" />
      </div>
    </div>
    <div class="field">
      <label>说明</label>
      <input v-model="form.desc" placeholder="可选" />
    </div>
    <div class="field">
      <label>模型</label>
      <div class="row-actions">
        <select v-model="form.model.id" :disabled="!!form.glbFile">
          <option v-for="o in DEVICE_BUILTIN_OPTIONS" :key="o.id" :value="o.id">
            内置 · {{ o.label }}
          </option>
        </select>
        <label class="btn">
          {{ form.glbFile ? form.glbFile.name : "或上传 GLB" }}
          <input type="file" accept=".glb,.gltf" hidden :disabled="busy" @change="onPickGlb" />
        </label>
        <button v-if="form.glbFile" class="btn" type="button" @click="form.glbFile = null">清除文件</button>
      </div>
    </div>
    <div class="row-actions">
      <button class="btn primary" type="button" :disabled="busy" @click="createDevice">保存</button>
      <button class="btn" type="button" :disabled="busy" @click="resetForm">取消</button>
    </div>
  </section>

  <div class="section-bar" style="margin-bottom: 10px">
    <button
      v-for="k in ['all', ...kinds]"
      :key="k"
      class="btn"
      type="button"
      :class="{ primary: filterKind === k }"
      @click="filterKind = k"
    >
      {{ k === "all" ? "全部" : KIND_LABEL[k] || k }}
    </button>
  </div>

  <section class="panel">
    <h3>设备列表</h3>
    <div v-if="!filtered.length" class="msg">暂无设备模块。</div>
    <ul v-else class="dev-list">
      <li v-for="item in filtered" :key="item.id">
        <div class="dev-main">
          <strong>{{ item.name }}</strong>
          <small>
            {{ KIND_LABEL[item.kind] || item.kind }}
            · {{ item.layer || "—" }}
            · partId={{ item.part_id || "—" }}
            · {{ modelHint(item) }}
            <template v-if="item.builtin"> · 内置</template>
          </small>
          <span class="meta-text">{{ item.desc || item.id }}</span>
        </div>
        <div class="dev-actions">
          <button
            class="btn"
            type="button"
            :disabled="busy || item.builtin"
            @click="removeDevice(item)"
          >
            删除
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
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
}
.create-panel {
  margin-bottom: 14px;
}
.dev-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.dev-list li {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  flex-wrap: wrap;
}
.dev-main {
  flex: 1;
  min-width: 180px;
  display: grid;
  gap: 2px;
}
.dev-main strong {
  font-size: 15px;
}
.dev-main small {
  color: var(--muted);
}
.dev-actions {
  display: flex;
  gap: 6px;
}
.field {
  margin-bottom: 10px;
}
.field label {
  display: block;
  margin-bottom: 4px;
  font-size: 0.85rem;
  color: var(--muted);
}
.field input,
.field select {
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--surface-solid);
}
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
@media (max-width: 720px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }
}
</style>
