<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { api } from "../api";
import { PLACE_CATEGORIES, SCENE_KIND_LABEL } from "../twin/placeCatalog";
import { SCENE_BUILTIN_OPTIONS } from "../twin/builtinCatalog";

const KIND_LABEL = SCENE_KIND_LABEL;

const BUILTIN_OPTIONS = SCENE_BUILTIN_OPTIONS.map((o) => ({
  id: o.id,
  label: `内置 · ${o.label}`,
}));

const items = ref([]);
const kinds = ref(PLACE_CATEGORIES.filter((c) => c.source === "scene").map((c) => c.id));
const filterKind = ref("all");
const busy = ref(false);
const msg = ref("");
const msgType = ref("");
const showCreate = ref(false);

const form = reactive({
  name: "",
  kind: "decoration",
  desc: "",
  modelId: "scene_tree",
  glbFile: null,
});

function setMsg(text, type = "") {
  msg.value = text;
  msgType.value = type;
}

async function reload() {
  const res = await api.libraryScenes();
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
  form.kind = "decoration";
  form.desc = "";
  form.modelId = "scene_tree";
  form.glbFile = null;
  showCreate.value = false;
}

function onPickGlb(ev) {
  form.glbFile = ev.target.files?.[0] || null;
  ev.target.value = "";
}

async function createItem() {
  const name = form.name.trim();
  if (!name) {
    setMsg("请填写素材名称", "err");
    return;
  }
  busy.value = true;
  try {
    let model = { kind: "builtin", id: form.modelId };
    if (form.glbFile) {
      const up = await api.uploadGlb(form.glbFile);
      model = { kind: "glb", url: up.url };
    }
    await api.saveLibraryScene({
      name,
      kind: form.kind,
      desc: form.desc,
      model,
      builtin: false,
    });
    setMsg(`已添加场景素材「${name}」`, "ok");
    resetForm();
    await reload();
  } catch (e) {
    setMsg(e.message || "添加失败", "err");
  } finally {
    busy.value = false;
  }
}

async function removeItem(item) {
  if (item.builtin) {
    setMsg("内置素材不可删除", "err");
    return;
  }
  if (!window.confirm(`删除「${item.name}」？`)) return;
  busy.value = true;
  try {
    await api.deleteLibraryScene(item.id);
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
  if (m.kind === "glb" || m.kind === "gltf") {
    const name = String(m.url || "").split("/").pop() || "GLB";
    return m.fit ? `精细 GLB · ${name} · fit ${m.fit}` : `精细 GLB · ${name}`;
  }
  return m.id || "—";
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
      <p class="page-kicker">Environment</p>
      <h1 class="page-title">场景管理</h1>
    </div>
    <div class="twin-head-actions">
      <button class="btn primary" type="button" @click="showCreate = !showCreate">
        {{ showCreate ? "收起" : "添加场景素材" }}
      </button>
    </div>
  </header>

  <p class="page-desc">
    按分区管理可建造物体。内置已含若干 Kenney CC0 精细 GLB（住宅/树/路灯/沙发等）；也可上传自己的 .glb。在「设备孪生」编辑模式选板放置。
  </p>
  <div v-if="msg" class="msg" :class="msgType">{{ msg }}</div>

  <section v-if="showCreate" class="panel create-panel">
    <h3>新建场景素材</h3>
    <div class="grid-2">
      <div class="field">
        <label>名称</label>
        <input v-model="form.name" placeholder="如：小住宅、马路砖" />
      </div>
      <div class="field">
        <label>分区</label>
        <select v-model="form.kind">
          <option v-for="k in kinds" :key="k" :value="k">{{ KIND_LABEL[k] || k }}</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label>说明</label>
      <input v-model="form.desc" placeholder="可选" />
    </div>
    <div class="field">
      <label>模型</label>
      <div class="row-actions">
        <select v-model="form.modelId" :disabled="!!form.glbFile">
          <option v-for="o in BUILTIN_OPTIONS" :key="o.id" :value="o.id">{{ o.label }}</option>
        </select>
        <label class="btn">
          {{ form.glbFile ? form.glbFile.name : "或上传 GLB" }}
          <input type="file" accept=".glb,.gltf" hidden :disabled="busy" @change="onPickGlb" />
        </label>
        <button v-if="form.glbFile" class="btn" type="button" @click="form.glbFile = null">清除文件</button>
      </div>
    </div>
    <div class="row-actions">
      <button class="btn primary" type="button" :disabled="busy" @click="createItem">保存</button>
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
    <h3>素材列表</h3>
    <div v-if="!filtered.length" class="msg">暂无场景素材。</div>
    <ul v-else class="dev-list">
      <li v-for="item in filtered" :key="item.id">
        <div class="dev-main">
          <strong>{{ item.name }}</strong>
          <small>
            {{ KIND_LABEL[item.kind] || item.kind }}
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
            @click="removeItem(item)"
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
