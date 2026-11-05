from __future__ import annotations

from copy import deepcopy
from typing import Any

from app.paths import SETTINGS_FILE
from storage.files import read_yaml, write_yaml

DEFAULT_SETTINGS: dict[str, Any] = {
    "huawei": {
        "ak": "",
        "sk": "",
        "project_id": "",
        "region": "cn-north-4",
        "iotda_endpoint": "",
        "use_derived_auth": True,
        "device_id": "",
        "service_id": "",
        "product_id": "",
    },
    "poll": {
        "interval_sec": 2,
        "history_enabled": False,
    },
    "server": {
        "host": "127.0.0.1",
        "port": 8790,
    },
    "appearance": {
        "theme_id": "silo_sage",
        "brand_title": "华为云IOT",
        "brand_subtitle": "Huawei Cloud IoT",
        "brand_tagline": "华为云IOT",
        "button_color": "",
        "border_color": "",
        "background_image": "",
        "background_overlay": 0.72,
    },
    # default_page: monitor | screen；screen 时用 screen_id
    "startup": {
        "default_page": "monitor",
        "screen_id": "default",
    },
}


def _merge(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    out = deepcopy(base)
    for key, value in (overlay or {}).items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _merge(out[key], value)
        else:
            out[key] = value
    return out


def load_settings() -> dict[str, Any]:
    return _merge(DEFAULT_SETTINGS, read_yaml(SETTINGS_FILE))


def save_settings(data: dict[str, Any]) -> dict[str, Any]:
    current = load_settings()
    merged = _merge(current, data)

    # 脱敏回写：若前端提交的 sk 为掩码，保留原 sk
    hw_in = data.get("huawei") or {}
    hw_cur = current.get("huawei") or {}
    sk = hw_in.get("sk")
    if sk is None or _is_masked(sk):
        merged.setdefault("huawei", {})["sk"] = hw_cur.get("sk", "")

    write_yaml(SETTINGS_FILE, merged)
    return merged


def _is_masked(value: Any) -> bool:
    if not isinstance(value, str) or not value:
        return False
    return set(value) <= {"*"} or value.startswith("****")


def mask_settings(settings: dict[str, Any]) -> dict[str, Any]:
    out = deepcopy(settings)
    sk = (out.get("huawei") or {}).get("sk") or ""
    if sk:
        out["huawei"]["sk"] = "****" + sk[-4:] if len(sk) > 4 else "****"
    return out


def settings_ready(settings: dict[str, Any] | None = None) -> tuple[bool, str]:
    s = settings or load_settings()
    hw = s.get("huawei") or {}
    required = ["ak", "sk", "project_id", "iotda_endpoint", "device_id", "service_id"]
    missing = [k for k in required if not str(hw.get(k) or "").strip()]
    if missing:
        return False, "缺少配置: " + ", ".join(missing)
    return True, ""
