"""连接状态、轮询、WebSocket 广播。"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket

from services.huawei_errors import format_huawei_error, looks_like_standard_iotda_endpoint, parse_huawei_error
from services.huawei_iot import HuaweiIoTClient
from services.settings import load_settings, save_settings, settings_ready

log = logging.getLogger("hwy.runtime")


class RuntimeState:
    def __init__(self) -> None:
        self.connected: bool = False
        self.client: HuaweiIoTClient | None = None
        self.latest: dict[str, Any] = {}
        self.error: str | None = None
        self.last_ok_at: str | None = None
        self.ws_clients: set[WebSocket] = set()
        self._poll_task: asyncio.Task | None = None

    def status(self) -> dict[str, Any]:
        ready, reason = settings_ready()
        return {
            "connected": self.connected,
            "settings_ready": ready,
            "settings_message": reason,
            "error": self.error,
            "last_ok_at": self.last_ok_at,
            "property_count": len(self.latest),
        }


runtime = RuntimeState()


async def broadcast(payload: dict[str, Any]) -> None:
    dead: list[WebSocket] = []
    for ws in list(runtime.ws_clients):
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        runtime.ws_clients.discard(ws)


async def poll_loop() -> None:
    while runtime.connected:
        settings = load_settings()
        interval = float((settings.get("poll") or {}).get("interval_sec", 2))
        try:
            if runtime.client is None:
                raise RuntimeError("客户端未初始化")
            props = await asyncio.to_thread(runtime.client.get_reported_properties)
            ts = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
            runtime.latest = props
            runtime.error = None
            runtime.last_ok_at = ts
            await broadcast({"type": "props", "data": props, "ts": ts})
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            hw = (load_settings().get("huawei") or {})
            friendly = format_huawei_error(exc, hw)
            runtime.error = friendly
            log.warning("poll failed: %s", exc)
            await broadcast({"type": "error", "message": friendly})
        await asyncio.sleep(max(0.5, interval))


def _is_auth_error(exc: BaseException) -> bool:
    info = parse_huawei_error(exc)
    code = str(info.get("error_code") or "").upper()
    msg = str(info.get("error_msg") or info.get("raw") or "").lower()
    if code in {"APIGW.0301", "APIG.0301", "IOTDA.000002", "IOTDA.001003"}:
        return True
    return "authentication" in msg or "signature" in msg or "鉴权" in msg


async def _probe_shadow(hw: dict[str, Any]) -> tuple[HuaweiIoTClient, dict[str, Any]]:
    client = HuaweiIoTClient(hw)
    props = await asyncio.to_thread(client.get_reported_properties)
    return client, props


async def _probe_with_derived_fallback(
    hw: dict[str, Any],
) -> tuple[HuaweiIoTClient, dict[str, Any], dict[str, Any], str | None]:
    """先按当前派生认证设置探测；鉴权失败则自动翻转再试一次。"""
    first_exc: BaseException | None = None
    try:
        client, props = await _probe_shadow(hw)
        return client, props, hw, None
    except Exception as exc:
        first_exc = exc
        if not _is_auth_error(exc):
            raise

    flipped = dict(hw)
    flipped["use_derived_auth"] = not bool(hw.get("use_derived_auth", True))
    try:
        client, props = await _probe_shadow(flipped)
    except Exception:
        # 翻转也失败：用第一次错误（带原配置）提示
        raise first_exc from None

    note = (
        "已自动勾选【派生认证】并连接成功（标准版/企业版需要开启）"
        if flipped["use_derived_auth"]
        else "已自动取消【派生认证】并连接成功（基础版需关闭）"
    )
    # 写回正确设置，避免下次再失败
    save_settings({"huawei": {"use_derived_auth": flipped["use_derived_auth"]}})
    return client, props, flipped, note


async def connect() -> dict[str, Any]:
    ready, reason = settings_ready()
    if not ready:
        raise ValueError(reason)

    await disconnect()

    settings = load_settings()
    hw = dict(settings["huawei"] or {})
    # 标准版地址默认建议开派生；若用户关了会在 fallback 里自动打开
    if looks_like_standard_iotda_endpoint(str(hw.get("iotda_endpoint") or "")) and "use_derived_auth" not in hw:
        hw["use_derived_auth"] = True

    try:
        client, props, hw_used, note = await _probe_with_derived_fallback(hw)
    except Exception as exc:
        runtime.connected = False
        runtime.client = None
        friendly = format_huawei_error(exc, hw)
        runtime.error = friendly
        raise RuntimeError(friendly) from exc

    runtime.client = client
    runtime.latest = props
    runtime.error = None
    runtime.connected = True
    runtime.last_ok_at = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    runtime._poll_task = asyncio.create_task(poll_loop())
    await broadcast(
        {
            "type": "status",
            "data": runtime.status(),
            "props": runtime.latest,
            "ts": runtime.last_ok_at,
        }
    )
    status = runtime.status()
    if note:
        status = {**status, "message": note}
    return status


async def disconnect() -> dict[str, Any]:
    runtime.connected = False
    task = runtime._poll_task
    runtime._poll_task = None
    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        except Exception:
            pass
    runtime.client = None
    status = runtime.status()
    await broadcast({"type": "status", "data": status})
    return status


async def test_connection() -> dict[str, Any]:
    ready, reason = settings_ready()
    if not ready:
        return {"ok": False, "message": reason}
    settings = load_settings()
    hw = dict(settings.get("huawei") or {})
    try:
        _client, props, _hw_used, note = await _probe_with_derived_fallback(hw)
        msg = f"连接成功，读到 {len(props)} 个属性"
        if note:
            msg = f"{msg}。{note}"
        return {"ok": True, "message": msg, "properties": props}
    except Exception as exc:
        return {"ok": False, "message": format_huawei_error(exc, hw)}
