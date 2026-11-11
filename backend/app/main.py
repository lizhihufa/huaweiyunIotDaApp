"""FastAPI 入口：设置、连接、目录、大屏、运行时、WebSocket。"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.paths import CATALOG_FILE, LIBRARY_DIR, UPLOADS_DIR, frontend_dist
from services import catalog, dashboard, library, twin
from services import runtime as rt
from services.settings import load_settings, mask_settings, save_settings, settings_ready
from services.wipe import wipe_all_data
from storage.files import write_json

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("hwy")

app = FastAPI(title="华为云统一监测控制平台", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SettingsBody(BaseModel):
    huawei: dict[str, Any] | None = None
    poll: dict[str, Any] | None = None
    server: dict[str, Any] | None = None
    appearance: dict[str, Any] | None = None
    startup: dict[str, Any] | None = None


class WipeBody(BaseModel):
    confirm: str = ""


class SetPropertyBody(BaseModel):
    name: str
    value: Any


class DeviceBody(BaseModel):
    id: str | None = None
    name: str = ""
    device_id: str = ""
    service_id: str = ""
    group: str = ""
    location: str = ""
    note: str = ""


class MetricBody(BaseModel):
    id: str | None = None
    device_ref: str = ""
    name: str = ""
    property_name: str = ""
    unit: str = ""
    type: str = "number"
    writable: bool = False
    note: str = ""


class DashboardBody(BaseModel):
    id: str | None = None
    name: str = "未命名大屏"
    layout: list[dict[str, Any]] = Field(default_factory=list)
    theme: dict[str, Any] = Field(default_factory=dict)


class TwinBody(BaseModel):
    id: str | None = None
    name: str | None = None
    template: str | None = None
    scene_type: str | None = None
    scene_config: dict[str, Any] | None = None
    views: dict[str, Any] | None = None
    parts: list[dict[str, Any]] | None = None
    annotations: dict[str, Any] | None = None
    rules: dict[str, Any] | None = None
    bindings: dict[str, Any] | None = None
    camera: dict[str, Any] | None = None
    assembly_model: dict[str, Any] | None = None


class LibraryDeviceBody(BaseModel):
    id: str | None = None
    name: str = ""
    kind: str = "module"
    layer: str = "自定义"
    part_id: str | None = None
    model: dict[str, Any] | None = None
    desc: str = ""
    builtin: bool | None = None


class LibrarySceneBody(BaseModel):
    id: str | None = None
    name: str = ""
    kind: str = "prop"
    model: dict[str, Any] | None = None
    desc: str = ""
    builtin: bool | None = None


class LibrarySceneTypeBody(BaseModel):
    id: str | None = None
    name: str = ""
    desc: str = ""
    base: str = "blank"
    bg: str | None = None
    fog: str | None = None
    parts: list[dict[str, Any]] = Field(default_factory=list)


@app.on_event("startup")
async def on_startup() -> None:
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    LIBRARY_DIR.mkdir(parents=True, exist_ok=True)
    dashboard.ensure_default()
    twin.ensure_default()
    library.ensure_default()
    if not CATALOG_FILE.is_file():
        write_json(CATALOG_FILE, {"devices": [], "metrics": []})
    log.info("huaweiyunapp backend ready")


# 本地上传的背景图等静态资源
app.mount("/media", StaticFiles(directory=str(UPLOADS_DIR)), name="media")


@app.get("/api/health")
async def health() -> dict[str, Any]:
    ready, reason = settings_ready()
    return {"ok": True, "settings_ready": ready, "message": reason, **rt.runtime.status()}


@app.get("/api/settings")
async def get_settings() -> dict[str, Any]:
    return {"data": mask_settings(load_settings())}


@app.put("/api/settings")
async def put_settings(body: SettingsBody) -> dict[str, Any]:
    payload = {k: v for k, v in body.model_dump().items() if v is not None}
    saved = save_settings(payload)
    return {"ok": True, "data": mask_settings(saved)}


@app.post("/api/settings/wipe-all")
async def wipe_all_settings(body: WipeBody) -> dict[str, Any]:
    """清空本地全部业务数据（设置、点位、大屏、上传图、历史）。"""
    if (body.confirm or "").strip() != "删除全部":
        raise HTTPException(400, "请输入确认语：删除全部")
    try:
        await rt.disconnect()
    except Exception:
        pass
    result = wipe_all_data()
    return {
        "ok": True,
        "message": "本地数据已全部清空并恢复默认",
        **result,
        "status": rt.runtime.status(),
    }


@app.post("/api/appearance/upload-bg")
async def upload_background(file: UploadFile = File(...)) -> dict[str, Any]:
    """上传背景图到 data/uploads，仅返回 URL，不写入任何配置。

    系统背景由设置页写入 appearance；大屏背景由大屏编辑写入 dashboard.theme。
    """
    name = file.filename or "bg.bin"
    suffix = Path(name).suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        raise HTTPException(400, "仅支持 jpg / png / webp / gif")
    content = await file.read()
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(400, "图片不能超过 8MB")
    filename = f"bg_{uuid.uuid4().hex[:12]}{suffix}"
    path = UPLOADS_DIR / filename
    path.write_bytes(content)
    url = f"/media/{filename}"
    return {"ok": True, "url": url}


@app.post("/api/connection/test")
async def connection_test() -> dict[str, Any]:
    return await rt.test_connection()


@app.post("/api/connection/connect")
async def connection_connect() -> dict[str, Any]:
    try:
        status = await rt.connect()
        return {"ok": True, "status": status}
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(502, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, f"连接失败: {exc}") from exc


@app.post("/api/connection/disconnect")
async def connection_disconnect() -> dict[str, Any]:
    status = await rt.disconnect()
    return {"ok": True, "status": status}


@app.get("/api/connection/status")
async def connection_status() -> dict[str, Any]:
    return rt.runtime.status()


@app.get("/api/devices")
async def get_devices() -> dict[str, Any]:
    return {"items": catalog.list_devices()}


@app.post("/api/devices")
async def post_device(body: DeviceBody) -> dict[str, Any]:
    item = catalog.upsert_device(body.model_dump())
    return {"ok": True, "item": item}


@app.delete("/api/devices/{device_id}")
async def remove_device(device_id: str) -> dict[str, Any]:
    if not catalog.delete_device(device_id):
        raise HTTPException(404, "设备不存在")
    return {"ok": True}


@app.get("/api/metrics")
async def get_metrics() -> dict[str, Any]:
    return {"items": catalog.list_metrics()}


@app.post("/api/metrics")
async def post_metric(body: MetricBody) -> dict[str, Any]:
    item = catalog.upsert_metric(body.model_dump())
    return {"ok": True, "item": item}


@app.delete("/api/metrics/{metric_id}")
async def remove_metric(metric_id: str) -> dict[str, Any]:
    if not catalog.delete_metric(metric_id):
        raise HTTPException(404, "点位不存在")
    return {"ok": True}


@app.get("/api/dashboards")
async def get_dashboards() -> dict[str, Any]:
    return {"items": dashboard.list_dashboards()}


@app.get("/api/dashboards/{dash_id}")
async def get_dashboard(dash_id: str) -> dict[str, Any]:
    try:
        item = dashboard.get_dashboard(dash_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not item:
        raise HTTPException(404, "大屏不存在")
    return {"item": item}


@app.put("/api/dashboards/{dash_id}")
async def put_dashboard(dash_id: str, body: DashboardBody) -> dict[str, Any]:
    payload = body.model_dump()
    payload["id"] = dash_id
    try:
        item = dashboard.save_dashboard(payload)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "item": item}


@app.post("/api/dashboards")
async def create_dashboard(body: DashboardBody) -> dict[str, Any]:
    try:
        item = dashboard.save_dashboard(body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "item": item}


@app.delete("/api/dashboards/{dash_id}")
async def remove_dashboard(dash_id: str) -> dict[str, Any]:
    try:
        ok = dashboard.delete_dashboard(dash_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not ok:
        raise HTTPException(404, "大屏不存在")
    return {"ok": True}


@app.get("/api/twins")
async def get_twins() -> dict[str, Any]:
    return {"items": twin.list_twins()}


@app.get("/api/twins/{twin_id}")
async def get_twin(twin_id: str) -> dict[str, Any]:
    try:
        item = twin.get_twin(twin_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not item:
        raise HTTPException(404, "孪生工程不存在")
    return {"item": item}


@app.put("/api/twins/{twin_id}")
async def put_twin(twin_id: str, body: TwinBody) -> dict[str, Any]:
    payload = {k: v for k, v in body.model_dump().items() if v is not None}
    payload["id"] = twin_id
    try:
        item = twin.save_twin(payload)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "item": item}


@app.post("/api/twins")
async def create_twin(body: TwinBody) -> dict[str, Any]:
    payload = {k: v for k, v in body.model_dump().items() if v is not None}
    try:
        item = twin.save_twin(payload)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "item": item}


@app.delete("/api/twins/{twin_id}")
async def remove_twin(twin_id: str) -> dict[str, Any]:
    try:
        ok = twin.delete_twin(twin_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not ok:
        raise HTTPException(404, "孪生工程不存在")
    return {"ok": True}


@app.post("/api/twins/upload-view")
async def upload_twin_view(file: UploadFile = File(...)) -> dict[str, Any]:
    """上传三视图图片到 data/uploads，返回 /media URL。"""
    name = file.filename or "view.bin"
    suffix = Path(name).suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        raise HTTPException(400, "仅支持 jpg / png / webp / gif")
    content = await file.read()
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(400, "图片不能超过 8MB")
    filename = f"twin_{uuid.uuid4().hex[:12]}{suffix}"
    path = UPLOADS_DIR / filename
    path.write_bytes(content)
    return {"ok": True, "url": f"/media/{filename}"}


@app.post("/api/library/upload-glb")
async def upload_library_glb(file: UploadFile = File(...)) -> dict[str, Any]:
    """上传 GLB/GLTF 模型到 data/uploads，返回 /media URL。"""
    name = file.filename or "model.glb"
    suffix = Path(name).suffix.lower()
    if suffix not in {".glb", ".gltf"}:
        raise HTTPException(400, "仅支持 .glb / .gltf")
    content = await file.read()
    if len(content) > 32 * 1024 * 1024:
        raise HTTPException(400, "模型不能超过 32MB")
    filename = f"model_{uuid.uuid4().hex[:12]}{suffix}"
    path = UPLOADS_DIR / filename
    path.write_bytes(content)
    return {"ok": True, "url": f"/media/{filename}", "filename": name}


@app.get("/api/library/devices")
async def get_library_devices() -> dict[str, Any]:
    return {"items": library.list_devices(), "kinds": list(library.DEVICE_KINDS)}


@app.post("/api/library/devices")
async def create_library_device(body: LibraryDeviceBody) -> dict[str, Any]:
    try:
        item = library.save_device(body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "item": item}


@app.put("/api/library/devices/{item_id}")
async def put_library_device(item_id: str, body: LibraryDeviceBody) -> dict[str, Any]:
    payload = body.model_dump()
    payload["id"] = item_id
    try:
        item = library.save_device(payload)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "item": item}


@app.delete("/api/library/devices/{item_id}")
async def remove_library_device(item_id: str) -> dict[str, Any]:
    try:
        ok = library.delete_device(item_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not ok:
        raise HTTPException(404, "设备不存在")
    return {"ok": True}


@app.get("/api/library/scenes")
async def get_library_scenes() -> dict[str, Any]:
    return {"items": library.list_scenes(), "kinds": list(library.SCENE_KINDS)}


@app.post("/api/library/scenes")
async def create_library_scene(body: LibrarySceneBody) -> dict[str, Any]:
    try:
        item = library.save_scene(body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "item": item}


@app.put("/api/library/scenes/{item_id}")
async def put_library_scene(item_id: str, body: LibrarySceneBody) -> dict[str, Any]:
    payload = body.model_dump()
    payload["id"] = item_id
    try:
        item = library.save_scene(payload)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "item": item}


@app.delete("/api/library/scenes/{item_id}")
async def remove_library_scene(item_id: str) -> dict[str, Any]:
    try:
        ok = library.delete_scene(item_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not ok:
        raise HTTPException(404, "场景素材不存在")
    return {"ok": True}


@app.get("/api/library/scene-types")
async def get_library_scene_types() -> dict[str, Any]:
    return {
        "items": library.list_scene_types(),
        "bases": list(library.SCENE_TYPE_BASES),
    }


@app.post("/api/library/scene-types")
async def create_library_scene_type(body: LibrarySceneTypeBody) -> dict[str, Any]:
    try:
        item = library.save_scene_type(body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "item": item}


@app.put("/api/library/scene-types/{item_id}")
async def put_library_scene_type(item_id: str, body: LibrarySceneTypeBody) -> dict[str, Any]:
    payload = body.model_dump()
    payload["id"] = item_id
    try:
        item = library.save_scene_type(payload)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "item": item}


@app.delete("/api/library/scene-types/{item_id}")
async def remove_library_scene_type(item_id: str) -> dict[str, Any]:
    try:
        ok = library.delete_scene_type(item_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not ok:
        raise HTTPException(404, "场景类型不存在")
    return {"ok": True}


class TwinImportUrlBody(BaseModel):
    url: str


def _is_safe_image_url(url: str) -> bool:
    from urllib.parse import urlparse

    try:
        u = urlparse(url.strip())
    except Exception:
        return False
    if u.scheme not in {"http", "https"}:
        return False
    host = (u.hostname or "").lower()
    if not host or host in {"localhost", "127.0.0.1", "0.0.0.0", "::1"}:
        return False
    if host.endswith(".local") or host.startswith("192.168.") or host.startswith("10."):
        return False
    if host.startswith("172.") and len(host.split(".")) >= 2:
        try:
            second = int(host.split(".")[1])
            if 16 <= second <= 31:
                return False
        except ValueError:
            pass
    return True


@app.post("/api/twins/import-url")
async def import_twin_view_url(body: TwinImportUrlBody) -> dict[str, Any]:
    """从公网图片 URL 下载到本地 uploads（用于常见模块网络参考图）。"""
    import asyncio
    from urllib.error import HTTPError, URLError
    from urllib.request import Request, urlopen

    url = (body.url or "").strip()
    if not url or not _is_safe_image_url(url):
        raise HTTPException(400, "仅允许公网 http/https 图片地址")

    def _download() -> tuple[bytes, str]:
        req = Request(url, headers={"User-Agent": "huaweiyunapp-twin/0.1"})
        with urlopen(req, timeout=20) as resp:  # noqa: S310 已做 URL 白名单校验
            ctype = (resp.headers.get_content_type() or "").lower()
            data = resp.read(8 * 1024 * 1024 + 1)
            return data, ctype

    try:
        content, ctype = await asyncio.to_thread(_download)
    except HTTPError as exc:
        raise HTTPException(502, f"下载失败 HTTP {exc.code}") from exc
    except URLError as exc:
        raise HTTPException(502, f"下载失败: {exc.reason}") from exc
    except Exception as exc:
        raise HTTPException(502, f"下载失败: {exc}") from exc

    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(400, "图片不能超过 8MB")
    suffix_map = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }
    suffix = suffix_map.get(ctype)
    if not suffix:
        low = url.lower().split("?")[0]
        for ext in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
            if low.endswith(ext):
                suffix = ".jpg" if ext == ".jpeg" else ext
                break
    if not suffix:
        raise HTTPException(400, "目标不是常见图片类型（jpg/png/webp/gif）")
    if not (
        content.startswith(b"\xff\xd8")
        or content.startswith(b"\x89PNG")
        or content.startswith(b"GIF8")
        or content.startswith(b"RIFF")
    ):
        raise HTTPException(400, "下载内容不像有效图片")
    filename = f"twin_{uuid.uuid4().hex[:12]}{suffix}"
    path = UPLOADS_DIR / filename
    path.write_bytes(content)
    return {"ok": True, "url": f"/media/{filename}", "source": url}


@app.get("/api/runtime/shadow")
async def runtime_shadow() -> dict[str, Any]:

    return {
        "data": rt.runtime.latest,
        "error": rt.runtime.error,
        "connected": rt.runtime.connected,
        "ts": rt.runtime.last_ok_at,
    }


class ImportShadowBody(BaseModel):
    overwrite: bool = False
    device_ref: str | None = None
    keys: list[str] | None = None


@app.post("/api/metrics/import-shadow")
async def import_metrics_from_shadow(body: ImportShadowBody | None = None) -> dict[str, Any]:
    """把当前连接缓存的影子属性导入为本地点位。"""
    body = body or ImportShadowBody()
    if not rt.runtime.connected:
        raise HTTPException(503, "未连接，请先在系统设置中连接")
    props = rt.runtime.latest or {}
    if not props:
        raise HTTPException(400, "暂无影子数据，请稍候再试或确认设备已上报")

    settings = load_settings()
    device = catalog.ensure_device_from_settings(settings.get("huawei") or {})
    device_ref = (body.device_ref or "").strip() or device.get("id") or ""
    result = catalog.import_from_shadow(
        props,
        device_ref=device_ref,
        overwrite=bool(body.overwrite),
        keys=body.keys,
    )
    return {"ok": True, **result}


@app.post("/api/runtime/set")
async def runtime_set(body: SetPropertyBody) -> dict[str, Any]:
    if not rt.runtime.connected or rt.runtime.client is None:
        raise HTTPException(503, "未连接，请先在系统设置中连接")
    try:
        import asyncio

        await asyncio.to_thread(rt.runtime.client.set_properties, {body.name: body.value})
        rt.runtime.latest[body.name] = body.value
        await rt.broadcast({"type": "props", "data": rt.runtime.latest, "ts": rt.runtime.last_ok_at})
        return {"ok": True, "data": rt.runtime.latest}
    except Exception as exc:
        from services.huawei_errors import format_huawei_error
        from services.settings import load_settings

        hw = (load_settings().get("huawei") or {})
        raise HTTPException(502, format_huawei_error(exc, hw)) from exc


@app.websocket("/ws/realtime")
async def ws_realtime(ws: WebSocket) -> None:
    await ws.accept()
    rt.runtime.ws_clients.add(ws)
    await ws.send_json(
        {
            "type": "hello",
            "status": rt.runtime.status(),
            "data": rt.runtime.latest,
            "ts": rt.runtime.last_ok_at,
            "error": rt.runtime.error,
        }
    )
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        rt.runtime.ws_clients.discard(ws)


# 生产：托管前端构建产物（开发用 Vite；客户端用 HWY_FRONTEND_DIST / web）
_FRONTEND_DIST = frontend_dist()
if _FRONTEND_DIST.is_dir():
    assets = _FRONTEND_DIST / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets)), name="assets")

    @app.get("/")
    async def index() -> FileResponse:
        return FileResponse(_FRONTEND_DIST / "index.html")

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str) -> FileResponse:
        candidate = _FRONTEND_DIST / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_FRONTEND_DIST / "index.html")
