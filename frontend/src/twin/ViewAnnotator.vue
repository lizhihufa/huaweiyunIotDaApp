<script setup>
import { computed, ref, watch } from "vue";
import { partLabel as resolveLabel } from "./partCatalog";

const props = defineProps({
  viewKey: { type: String, required: true },
  imageUrl: { type: String, default: "" },
  annotations: { type: Array, default: () => [] },
  /** [{ id, label, shape?, layer? }] */
  partOptions: { type: Array, default: () => [] },
});

const emit = defineEmits(["update:annotations", "add-part"]);

const wrapRef = ref(null);
const drawing = ref(false);
const start = ref(null);
const draft = ref(null);
const activePartId = ref("");
const selectedId = ref(null);
const newPartName = ref("");
const showAdd = ref(false);

const boxes = computed(() => props.annotations || []);
const options = computed(() => props.partOptions || []);

watch(
  options,
  (list) => {
    if (!list.length) return;
    if (!list.some((p) => p.id === activePartId.value)) {
      activePartId.value = list[0].id;
    }
  },
  { immediate: true }
);

watch(
  () => props.imageUrl,
  () => {
    draft.value = null;
    selectedId.value = null;
  }
);

function labelOf(id) {
  return resolveLabel(id, options.value);
}

function relPos(ev) {
  const el = wrapRef.value;
  if (!el) return { x: 0, y: 0 };
  const rect = el.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height));
  return { x, y };
}

function onPointerDown(ev) {
  if (!props.imageUrl || ev.button !== 0) return;
  ev.preventDefault();
  wrapRef.value?.setPointerCapture?.(ev.pointerId);
  drawing.value = true;
  const p = relPos(ev);
  start.value = p;
  draft.value = { x: p.x, y: p.y, w: 0, h: 0 };
  selectedId.value = null;
}

function onPointerMove(ev) {
  if (!drawing.value || !start.value) return;
  const p = relPos(ev);
  const x = Math.min(start.value.x, p.x);
  const y = Math.min(start.value.y, p.y);
  const w = Math.abs(p.x - start.value.x);
  const h = Math.abs(p.y - start.value.y);
  draft.value = { x, y, w, h };
}

function onPointerUp() {
  if (!drawing.value) return;
  drawing.value = false;
  const d = draft.value;
  draft.value = null;
  start.value = null;
  if (!d || d.w < 0.02 || d.h < 0.02) return;
  if (!activePartId.value) return;
  const next = [
    ...boxes.value,
    {
      id: `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      partId: activePartId.value,
      box: [
        Number(d.x.toFixed(4)),
        Number(d.y.toFixed(4)),
        Number(d.w.toFixed(4)),
        Number(d.h.toFixed(4)),
      ],
    },
  ];
  const map = new Map();
  for (const a of next) map.set(a.partId, a);
  emit("update:annotations", [...map.values()]);
}

function removeBox(id) {
  emit(
    "update:annotations",
    boxes.value.filter((a) => a.id !== id)
  );
  if (selectedId.value === id) selectedId.value = null;
}

function clearAll() {
  emit("update:annotations", []);
  selectedId.value = null;
}

function styleBox(box) {
  const [x, y, w, h] = box;
  return {
    left: `${x * 100}%`,
    top: `${y * 100}%`,
    width: `${w * 100}%`,
    height: `${h * 100}%`,
  };
}

function submitAddPart() {
  const name = newPartName.value.trim();
  if (!name) return;
  emit("add-part", { label: name });
  newPartName.value = "";
  showAdd.value = false;
}
</script>

<template>
  <div class="annotator">
    <div class="annotator-toolbar">
      <label>
        框选部件
        <select v-model="activePartId">
          <option v-for="p in options" :key="p.id" :value="p.id">{{ p.label }}</option>
        </select>
      </label>
      <button class="btn" type="button" @click="showAdd = !showAdd">
        {{ showAdd ? "取消" : "新增模块" }}
      </button>
      <button class="btn" type="button" :disabled="!boxes.length" @click="clearAll">清空本图标注</button>
    </div>

    <div v-if="showAdd" class="add-row">
      <input
        v-model="newPartName"
        placeholder="自定义模块名称，如：电源模块"
        @keyup.enter="submitAddPart"
      />
      <button class="btn primary" type="button" :disabled="!newPartName.trim()" @click="submitAddPart">
        添加
      </button>
    </div>

    <div
      v-if="imageUrl"
      ref="wrapRef"
      class="annotator-stage"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <img :src="imageUrl" alt="" draggable="false" />
      <div
        v-for="a in boxes"
        :key="a.id"
        class="ann-box"
        :class="{ active: selectedId === a.id }"
        :style="styleBox(a.box)"
        @pointerdown.stop
        @click.stop="selectedId = a.id"
      >
        <span class="ann-tag">{{ labelOf(a.partId) }}</span>
        <button type="button" class="ann-del" title="删除" @click.stop="removeBox(a.id)">×</button>
      </div>
      <div v-if="draft" class="ann-box draft" :style="styleBox([draft.x, draft.y, draft.w, draft.h])" />
      <div class="ann-tip">按住拖拽画框 · 当前：{{ labelOf(activePartId) || "请选择/新增模块" }}</div>
    </div>
    <div v-else class="annotator-empty meta-text">请先上传本视图图片</div>

    <ul v-if="boxes.length" class="ann-list">
      <li v-for="a in boxes" :key="a.id">
        <strong>{{ labelOf(a.partId) }}</strong>
        <span class="meta-text">
          {{ (a.box[2] * 100).toFixed(0) }}% × {{ (a.box[3] * 100).toFixed(0) }}%
        </span>
        <button class="btn" type="button" @click="removeBox(a.id)">删</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.annotator-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.annotator-toolbar label {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  color: var(--muted);
  flex: 1;
  min-width: 160px;
}
.annotator-toolbar select {
  flex: 1;
  min-width: 120px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--surface-solid);
}
.add-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.add-row input {
  flex: 1;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--surface-solid);
}
.annotator-stage {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--line);
  background: #1a2420;
  touch-action: none;
  user-select: none;
  cursor: crosshair;
}
.annotator-stage img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  background: #111;
}
.ann-box {
  position: absolute;
  border: 2px solid #38bdf8;
  background: rgba(56, 189, 248, 0.18);
  box-sizing: border-box;
}
.ann-box.active {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.2);
}
.ann-box.draft {
  border-style: dashed;
  pointer-events: none;
}
.ann-tag {
  position: absolute;
  left: 0;
  top: 0;
  transform: translateY(-100%);
  font-size: 11px;
  padding: 1px 6px;
  background: #0ea5e9;
  color: #fff;
  border-radius: 4px 4px 0 0;
  white-space: nowrap;
}
.ann-del {
  position: absolute;
  right: -2px;
  top: -2px;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: #b2453a;
  color: #fff;
  cursor: pointer;
  line-height: 1;
  font-size: 12px;
}
.ann-tip {
  position: absolute;
  left: 8px;
  bottom: 8px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.75);
  pointer-events: none;
}
.annotator-empty {
  padding: 28px;
  text-align: center;
  border: 1px dashed var(--line);
  border-radius: 10px;
}
.ann-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: grid;
  gap: 4px;
}
.ann-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.ann-list li .btn {
  margin-left: auto;
  padding: 2px 8px;
}
</style>
