# 华为云监测控制平台（huaweiyunapp）

面向华为云 **IoTDA（设备接入）** 的 Windows **桌面客户端**：在本机配置连接参数并连云，实时查看设备影子属性、下发可写属性，并支持自定义数据大屏。

详细操作步骤与「参数在华为云控制台哪里找」见 **[使用说明.md](./使用说明.md)**。

---

## 功能概览

| 模块 | 说明 |
|------|------|
| 系统设置 | 填写 AK/SK、项目 ID、区域、IoTDA 应用侧 Endpoint、设备/服务 ID；测试连接、连接/断开；界面主题与品牌文案 |
| 监测控制 | 轮询设备影子属性，卡片展示；对可写布尔属性一键下发 |
| 数据管理 | 维护本地设备档案与点位定义；可从云端影子同步点位 |
| 大屏编辑 / 展示 | 拖拽布局、绑定属性、主题与背景；全屏投屏；可设为启动默认页 |
| 设备孪生 | Three.js 参数化样板场景；三视图上传对照；阈值/回差/自动演示模拟；部件点击定位 |

**首期不做：** 固件烧录、设备侧 MQTT 开发、多租户 SaaS、安装包内嵌孪生验证（网页端优先）。

---

## 技术架构

```
桌面窗口（Electron）
        │  内嵌前端 + 本地后端
        ▼
┌─────────────────────────────┐
│  FastAPI 本机服务            │
│  · 系统设置 / 连接管理       │
│  · 业务数据 CRUD             │
│  · 大屏布局配置              │
│  · 云端轮询 → WebSocket 推送 │
│  · 属性下发代理              │
└─────────────┬───────────────┘
              │  华为云 IoTDA 应用侧 API
              ▼
         华为云 IoTDA
              ▲
              │  MQTT（设备侧）
         现场设备 / 网关
```

| 层 | 选型 |
|----|------|
| 桌面壳 | Electron + electron-builder（Windows） |
| 后端 | Python 3.11+ / FastAPI，PyInstaller 打包为 `hwy-backend.exe` |
| 前端 | Vue 3 + Vite + ECharts；大屏布局用 grid-layout-plus |
| 存储 | 本机 YAML / JSON（无数据库） |

**数据落盘：**

| 场景 | 路径 |
|------|------|
| 开发态 | 项目目录 `data/` |
| 安装版客户端 | `%AppData%\huaweiyunapp-desktop\data\` |

主要文件：`settings.yaml`、`catalog.json`、`dashboards/*.json`、可选 `history/*.jsonl`、`uploads/`。

---

## 连接参数一览

在客户端 **系统设置 → 华为云连接参数** 中填写（必填项缺一不可）：

| 参数 | 含义 |
|------|------|
| AK / SK | IAM 访问密钥 |
| 项目 ID | 与 IoTDA 实例同一区域的 Project ID |
| 区域 | 如 `cn-north-4` |
| 物联网平台应用侧接入地址 | 含 `https://`，须为 **iotda-app** 应用侧地址 |
| 派生认证 | 标准版 / 企业版勾选；基础版取消 |
| 默认设备 ID | IoTDA 设备 ID |
| 服务 ID | 物模型中的 service_id |
| 产品 ID | 可选 |

参数在华为云控制台的具体位置见 [使用说明.md](./使用说明.md)。

---

## 目录结构

```
huaweiyunapp/
  README.md
  使用说明.md
  backend/                 # FastAPI
  frontend/                # Vue 3 + Vite
  desktop/                 # Electron 壳与打包配置
  data/                    # 开发态运行数据（勿提交密钥）
  scripts/build-client.ps1 # 一键构建安装包
```

---

## 本地开发启动

### 后端

```bash
cd huaweiyunapp/backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

默认监听 `http://127.0.0.1:8790`。

### 前端

```bash
cd huaweiyunapp/frontend
npm install
npm run dev
```

浏览器打开 Vite 提示地址（默认 `http://127.0.0.1:5173`），接口代理到 8790。

### 推荐使用顺序

1. **系统设置** 填写连接参数 → 保存 → 测试连接 → 连接  
2. **数据管理**（可选）从云端同步点位或手动维护  
3. **监测控制** 查看实时值并下发可写属性  
4. **大屏编辑** 拖拽布局后保存，全屏路径形如 `/screen/default`  

---

## Windows 桌面客户端

通过 **Electron + 内嵌 FastAPI** 打包：安装后从开始菜单 / 桌面快捷方式启动，无需再手动开浏览器。

### 构建

需 Node.js，以及已配置好的 `backend/.venv`：

```powershell
cd huaweiyunapp
powershell -ExecutionPolicy Bypass -File .\scripts\build-client.ps1
```

步骤：前端 `vite build` → PyInstaller 产出 `hwy-backend.exe` → electron-builder 生成解压目录 → Inno Setup 在**仓库根目录**生成 `HuaweiYunMonitor-Setup-*.exe`（每次打包会先删除根目录旧安装包）。

### 开发态跑客户端窗口

```powershell
cd huaweiyunapp\frontend
npm run build
cd ..\desktop
npm install
npm start
```

---

## 安全注意

- AK/SK 仅保存在本机配置文件，接口回显对 SK 脱敏；勿提交到公开仓库。  
- 默认绑定 `127.0.0.1`。  
- 务必使用 **应用侧** Endpoint（含 `iotda-app`），不要填设备侧 MQTT 地址。  
- 标准版 / 基础版对「派生认证」要求不同，测连失败时可对照 [使用说明.md](./使用说明.md) 排查。

---

## 当前进度

已完成：骨架、连云轮询与属性下发、数据管理、大屏编辑/展示、外观主题、Windows 桌面客户端打包、**设备孪生（网页端 P0/P1）**。  

可后续增强：孪生对接 IoTDA 影子、多设备模板库、历史曲线、安装包代码签名。详见 [方案.md](./方案.md)。
