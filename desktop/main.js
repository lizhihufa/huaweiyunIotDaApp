const { app, BrowserWindow, dialog, shell, ipcMain } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const net = require("net");
const fs = require("fs");

const PORT = Number(process.env.HWY_PORT || 8790);
const HOST = "127.0.0.1";
const BASE = `http://${HOST}:${PORT}`;

let mainWindow = null;
let backendProc = null;
let quitting = false;

function isDev() {
  return !app.isPackaged;
}

function resourcesRoot() {
  if (isDev()) {
    return path.join(__dirname, "..");
  }
  return process.resourcesPath;
}

function backendCommand() {
  const root = resourcesRoot();
  if (isDev()) {
    const py = path.join(root, "backend", ".venv", "Scripts", "python.exe");
    const run = path.join(root, "backend", "run.py");
    if (fs.existsSync(py) && fs.existsSync(run)) {
      return { cmd: py, args: [run], cwd: path.join(root, "backend") };
    }
    return { cmd: "python", args: [run], cwd: path.join(root, "backend") };
  }
  const exe = path.join(root, "backend", "hwy-backend.exe");
  return { cmd: exe, args: [], cwd: path.join(root, "backend") };
}

function appEnv() {
  const root = resourcesRoot();
  const dataDir = path.join(app.getPath("userData"), "data");
  const webDir = isDev()
    ? path.join(root, "frontend", "dist")
    : path.join(root, "web");
  return {
    ...process.env,
    HWY_APP_ROOT: root,
    HWY_DATA_DIR: dataDir,
    HWY_FRONTEND_DIST: webDir,
    HWY_PORT: String(PORT),
  };
}

function backendAlive() {
  return Boolean(backendProc && backendProc.exitCode === null && !backendProc.killed);
}

function portInUse(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: HOST, port }, () => {
      sock.destroy();
      resolve(true);
    });
    sock.on("error", () => resolve(false));
  });
}

function waitForHealth(timeoutMs = 45000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const failBackend = () => {
      const code = backendProc?.exitCode;
      if (code === 3) {
        reject(
          new Error(
            `端口 ${PORT} 已被占用。请关闭其它本应用实例，或结束占用该端口的 python/后端进程后重试。`
          )
        );
        return;
      }
      reject(new Error(`后端进程已退出（代码 ${code ?? "未知"}）`));
    };
    const tick = () => {
      if (!backendAlive()) {
        failBackend();
        return;
      }
      const req = http.get(`${BASE}/api/health`, (res) => {
        res.resume();
        if (!backendAlive()) {
          failBackend();
          return;
        }
        if (res.statusCode && res.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });
      req.on("error", retry);
      req.setTimeout(2000, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (!backendAlive()) {
        failBackend();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`后端启动超时。请检查端口 ${PORT} 是否被占用。`));
        return;
      }
      setTimeout(tick, 400);
    };
    tick();
  });
}

function startBackend() {
  const { cmd, args, cwd } = backendCommand();
  if (!fs.existsSync(cmd) && path.extname(cmd).toLowerCase() === ".exe") {
    throw new Error(`找不到后端程序：${cmd}`);
  }
  backendProc = spawn(cmd, args, {
    cwd,
    env: appEnv(),
    windowsHide: true,
    stdio: "ignore",
  });
  backendProc.on("exit", (code) => {
    backendProc = null;
    if (!quitting && mainWindow) {
      const tip =
        code === 3
          ? `端口 ${PORT} 已被占用。请关闭其它本应用实例或占用该端口的程序后重试。`
          : `服务进程结束（代码 ${code ?? "未知"}）。请重新打开应用。`;
      dialog.showErrorBox("后端已退出", tip);
    }
  });
}

function stopBackend() {
  if (!backendProc) return;
  try {
    backendProc.kill();
  } catch {
    /* ignore */
  }
  backendProc = null;
}

function iconPath() {
  const candidates = [
    path.join(__dirname, "build", "icon.png"),
    path.join(__dirname, "build", "icon.ico"),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

function createWindow() {
  const opts = {
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    title: "华为云监测控制平台",
    backgroundColor: "#0e1624",
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
  const icon = iconPath();
  if (icon) opts.icon = icon;

  mainWindow = new BrowserWindow(opts);

  mainWindow.on("enter-full-screen", () => {
    mainWindow.webContents.send("win:fullscreen-changed", true);
  });
  mainWindow.on("leave-full-screen", () => {
    mainWindow.webContents.send("win:fullscreen-changed", false);
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.loadURL(BASE);
}

async function boot() {
  try {
    if (await portInUse(PORT)) {
      dialog.showErrorBox(
        "启动失败",
        `端口 ${PORT} 已被占用。\n请关闭其它「华为云监测控制平台」窗口，或结束占用该端口的 python / 后端进程后重试。`
      );
      app.quit();
      return;
    }
    startBackend();
    await waitForHealth();
    createWindow();
  } catch (err) {
    stopBackend();
    dialog.showErrorBox("启动失败", err.message || String(err));
    app.quit();
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  ipcMain.on("win:minimize", () => mainWindow?.minimize());
  ipcMain.on("win:toggle-maximize", () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on("win:close", () => mainWindow?.close());
  ipcMain.handle("win:set-fullscreen", (_event, value) => {
    if (!mainWindow) return false;
    mainWindow.setFullScreen(Boolean(value));
    return mainWindow.isFullScreen();
  });
  ipcMain.handle("win:is-fullscreen", () => Boolean(mainWindow?.isFullScreen()));

  app.whenReady().then(boot);

  app.on("before-quit", () => {
    quitting = true;
    stopBackend();
  });

  app.on("window-all-closed", () => {
    quitting = true;
    stopBackend();
    app.quit();
  });
}
