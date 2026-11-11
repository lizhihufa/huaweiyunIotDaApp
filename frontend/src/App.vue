<script setup>
import { computed, onMounted, onUnmounted, provide, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { api } from "./api";
import { DEFAULT_APPEARANCE, applyAppearance } from "./theme/presets";

const TWIN_SUB_KEY = "hwy_twin_nav_open_v2";

const route = useRoute();
const status = ref({ connected: false, settings_ready: false });
const appearance = ref({ ...DEFAULT_APPEARANCE });
const pageKey = ref(0);
const osFullscreen = ref(false);
/** 默认收起；仅用户主动展开后记住为打开 */
const twinNavOpen = ref(
  typeof localStorage !== "undefined" ? localStorage.getItem(TWIN_SUB_KEY) === "1" : false
);

const fullscreen = computed(() => !!route.meta.fullscreen);
const desktop = typeof window !== "undefined" ? window.hwyDesktop : null;
const hideChrome = computed(() => osFullscreen.value);

const brandTitle = computed(() => appearance.value.brand_title || "华为云IOT");
const brandSubtitle = computed(() => appearance.value.brand_subtitle || "Huawei Cloud IoT");
const brandTagline = computed(() => appearance.value.brand_tagline || "华为云IOT");

async function refreshStatus() {
  try {
    status.value = await api.status();
  } catch {
    /* ignore */
  }
}

async function loadAppearance() {
  try {
    const res = await api.getSettings();
    const next = { ...DEFAULT_APPEARANCE, ...(res.data?.appearance || {}) };
    appearance.value = next;
    applyAppearance(next);
  } catch {
    applyAppearance(DEFAULT_APPEARANCE);
  }
}

function onAppearanceChanged(next) {
  appearance.value = { ...DEFAULT_APPEARANCE, ...next };
  applyAppearance(appearance.value);
}

provide("appearance", appearance);
provide("reloadAppearance", loadAppearance);
provide("desktop", desktop);
provide("osFullscreen", osFullscreen);

watch(
  () => route.path,
  () => {
    // 仅路径切换时重挂载页面；query（如孪生工程 id）变化不拆 DOM，避免退出场景全屏
    pageKey.value += 1;
  }
);

watch(
  () => route.path,
  (path) => {
    // 进入子页时自动展开，避免藏起来找不到
    if (path === "/device-manage" || path === "/scene-manage") {
      twinNavOpen.value = true;
    }
  },
  { immediate: true }
);

watch(twinNavOpen, (open) => {
  try {
    localStorage.setItem(TWIN_SUB_KEY, open ? "1" : "0");
  } catch {
    /* ignore */
  }
});

function toggleTwinNav() {
  twinNavOpen.value = !twinNavOpen.value;
}

watch(fullscreen, async (isScreen) => {
  if (!isScreen && desktop?.setFullscreen && osFullscreen.value) {
    await desktop.setFullscreen(false);
  }
});

let offFs = null;

onMounted(async () => {
  loadAppearance();
  refreshStatus();
  setInterval(refreshStatus, 5000);
  if (desktop?.isFullscreen) {
    osFullscreen.value = await desktop.isFullscreen();
  }
  if (desktop?.onFullscreenChange) {
    offFs = desktop.onFullscreenChange((v) => {
      osFullscreen.value = v;
    });
  }
});

onUnmounted(() => {
  if (typeof offFs === "function") offFs();
});
</script>

<template>
  <div
    v-if="desktop && !hideChrome"
    class="title-drag"
    :class="{ 'on-dark': fullscreen }"
  >
    <div class="win-controls">
      <button type="button" aria-label="最小化" @click="desktop.minimize()">—</button>
      <button type="button" aria-label="最大化" @click="desktop.toggleMaximize()">□</button>
      <button type="button" class="close" aria-label="关闭" @click="desktop.close()">×</button>
    </div>
  </div>

  <div v-if="fullscreen" class="shell shell-fullscreen" :class="{ 'is-os-fs': hideChrome }">
    <router-view />
  </div>
  <div v-else class="layout shell">
    <aside class="side">
      <div class="brand">
        <div class="brand-mark">
          {{ brandTitle }}
          <span>{{ brandSubtitle }}</span>
        </div>
        <div class="brand-sub">{{ brandTagline }}</div>
      </div>

      <div class="status-chip" :class="{ on: status.connected }">
        <span class="pulse"></span>
        <span>{{ status.connected ? "云端已连接 · 轮询中" : "云端未连接" }}</span>
      </div>

      <nav class="nav">
        <router-link to="/monitor">监测控制</router-link>
        <router-link
          to="/twin"
          class="nav-twin"
          :class="{
            open: twinNavOpen,
            'is-twin-child': route.path === '/device-manage' || route.path === '/scene-manage',
          }"
        >
          <span class="nav-twin-label">设备孪生</span>
          <span
            class="nav-fold"
            role="button"
            tabindex="0"
            :title="twinNavOpen ? '收起设备/场景管理' : '展开设备/场景管理'"
            :aria-expanded="twinNavOpen"
            aria-label="展开或收起设备与场景管理"
            @click.stop.prevent="toggleTwinNav"
            @keydown.enter.prevent="toggleTwinNav"
            @keydown.space.prevent="toggleTwinNav"
          >▾</span>
        </router-link>
        <div v-show="twinNavOpen" class="nav-sub-group">
          <router-link to="/device-manage" class="nav-sub">设备管理</router-link>
          <router-link to="/scene-manage" class="nav-sub">场景管理</router-link>
        </div>
        <router-link to="/devices">数据管理</router-link>
        <router-link to="/dashboard">大屏编辑</router-link>
        <router-link to="/settings">系统设置</router-link>
      </nav>

      <div class="side-foot">本机桌面客户端 · 外观与连接配置存本地</div>
    </aside>

    <main class="main">
      <div :key="pageKey" class="page-enter">
        <router-view
          @status-changed="refreshStatus"
          @appearance-changed="onAppearanceChanged"
        />
      </div>
    </main>
  </div>
</template>
