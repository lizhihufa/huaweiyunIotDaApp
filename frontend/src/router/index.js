import { createRouter, createWebHistory } from "vue-router";
import { api } from "../api";
import {
  fetchStartup,
  markStartupApplied,
  resolveScreenPath,
  wasStartupApplied,
} from "../startup";
import Settings from "../views/Settings.vue";
import Devices from "../views/Devices.vue";
import Monitor from "../views/Monitor.vue";
import DashboardEditor from "../views/DashboardEditor.vue";
import DashboardView from "../views/DashboardView.vue";

const Twin = () => import("../views/Twin.vue");
const DeviceManage = () => import("../views/DeviceManage.vue");
const SceneManage = () => import("../views/SceneManage.vue");

async function resolveHome(to, from, next) {
  try {
    const startup = await fetchStartup(api);
    const screenPath = resolveScreenPath(startup);
    if (screenPath) {
      markStartupApplied();
      return next({ path: screenPath, replace: true });
    }
  } catch {
    /* 回落监测页 */
  }
  markStartupApplied();
  return next({ path: "/monitor", replace: true });
}

/** 新开标签/刷新后首次进入管理页时，若已设大屏为启动页则跳转 */
async function applyStartupOnce(to, from, next) {
  if (to.meta?.fullscreen || to.path.startsWith("/screen/")) {
    return next();
  }
  if (wasStartupApplied()) {
    return next();
  }
  // 仅对常见入口生效，避免从侧栏点进设置时被强行带走
  const entryPaths = new Set(["/", "/monitor"]);
  if (!entryPaths.has(to.path)) {
    markStartupApplied();
    return next();
  }
  try {
    const startup = await fetchStartup(api);
    const screenPath = resolveScreenPath(startup);
    if (screenPath) {
      markStartupApplied();
      return next({ path: screenPath, replace: true });
    }
  } catch {
    /* ignore */
  }
  markStartupApplied();
  return next();
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: { render: () => null },
      beforeEnter: resolveHome,
    },
    { path: "/settings", component: Settings, meta: { title: "系统设置" } },
    { path: "/devices", component: Devices, meta: { title: "数据管理" } },
    { path: "/monitor", component: Monitor, meta: { title: "监测控制" } },
    { path: "/twin", component: Twin, meta: { title: "设备孪生" } },
    {
      path: "/device-manage",
      component: DeviceManage,
      meta: { title: "设备管理", group: "twin" },
    },
    {
      path: "/scene-manage",
      component: SceneManage,
      meta: { title: "场景管理", group: "twin" },
    },
    { path: "/dashboard", component: DashboardEditor, meta: { title: "大屏编辑" } },
    {
      path: "/screen/:id",
      component: DashboardView,
      meta: { title: "大屏展示", fullscreen: true },
    },
  ],
});

router.beforeEach(applyStartupOnce);

export default router;
