from __future__ import annotations

import uuid
from typing import Any

from app.paths import CATALOG_FILE
from storage.files import read_json, write_json

EMPTY = {"devices": [], "metrics": []}


def load_catalog() -> dict[str, Any]:
    data = read_json(CATALOG_FILE, default=None)
    if not isinstance(data, dict):
        return dict(EMPTY)
    return {
        "devices": list(data.get("devices") or []),
        "metrics": list(data.get("metrics") or []),
    }


def save_catalog(data: dict[str, Any]) -> dict[str, Any]:
    out = {
        "devices": list(data.get("devices") or []),
        "metrics": list(data.get("metrics") or []),
    }
    write_json(CATALOG_FILE, out)
    return out


def list_devices() -> list[dict[str, Any]]:
    return load_catalog()["devices"]


def upsert_device(body: dict[str, Any]) -> dict[str, Any]:
    cat = load_catalog()
    devices = cat["devices"]
    item = dict(body)
    item_id = item.get("id") or str(uuid.uuid4())
    item["id"] = item_id
    for i, d in enumerate(devices):
        if d.get("id") == item_id:
            devices[i] = {**d, **item}
            save_catalog(cat)
            return devices[i]
    devices.append(item)
    save_catalog(cat)
    return item


def delete_device(device_id: str) -> bool:
    cat = load_catalog()
    before = len(cat["devices"])
    cat["devices"] = [d for d in cat["devices"] if d.get("id") != device_id]
    cat["metrics"] = [m for m in cat["metrics"] if m.get("device_ref") != device_id]
    if len(cat["devices"]) == before:
        return False
    save_catalog(cat)
    return True


def list_metrics() -> list[dict[str, Any]]:
    return load_catalog()["metrics"]


def upsert_metric(body: dict[str, Any]) -> dict[str, Any]:
    cat = load_catalog()
    metrics = cat["metrics"]
    item = dict(body)
    item_id = item.get("id") or str(uuid.uuid4())
    item["id"] = item_id
    for i, m in enumerate(metrics):
        if m.get("id") == item_id:
            metrics[i] = {**m, **item}
            save_catalog(cat)
            return metrics[i]
    metrics.append(item)
    save_catalog(cat)
    return item


def delete_metric(metric_id: str) -> bool:
    cat = load_catalog()
    before = len(cat["metrics"])
    cat["metrics"] = [m for m in cat["metrics"] if m.get("id") != metric_id]
    if len(cat["metrics"]) == before:
        return False
    save_catalog(cat)
    return True


_WRITABLE_HINTS = {"fan", "automaticMode"}


def _infer_type(value: Any) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return "number"
    return "string"


def ensure_device_from_settings(huawei: dict[str, Any]) -> dict[str, Any]:
    """若尚无设备档案，用当前连接配置生成一条。"""
    cat = load_catalog()
    device_id = str((huawei or {}).get("device_id") or "").strip()
    service_id = str((huawei or {}).get("service_id") or "").strip()
    if device_id:
        for d in cat["devices"]:
            if d.get("device_id") == device_id:
                return d
    if cat["devices"]:
        return cat["devices"][0]
    item = {
        "id": str(uuid.uuid4()),
        "name": "默认设备",
        "device_id": device_id,
        "service_id": service_id,
        "group": "",
        "location": "",
        "note": "连接时自动创建",
    }
    cat["devices"].append(item)
    save_catalog(cat)
    return item


def import_from_shadow(
    props: dict[str, Any],
    *,
    device_ref: str = "",
    overwrite: bool = False,
    keys: list[str] | None = None,
) -> dict[str, Any]:
    """把影子属性导入为本地点位；默认跳过已存在的 property_name。keys 非空时只导入指定属性。"""
    cat = load_catalog()
    metrics = cat["metrics"]
    by_prop = {str(m.get("property_name") or ""): i for i, m in enumerate(metrics)}
    added: list[dict[str, Any]] = []
    updated: list[dict[str, Any]] = []
    wanted = {str(k) for k in (keys or []) if str(k).strip()}
    source = props or {}
    if wanted:
        source = {k: source[k] for k in wanted if k in source}

    for key, value in source.items():
        name = str(key)
        if not name:
            continue
        item = {
            "name": name,
            "property_name": name,
            "unit": "",
            "type": _infer_type(value),
            "writable": name in _WRITABLE_HINTS,
            "note": "从云端影子同步",
            "device_ref": device_ref,
        }
        if name in _WRITABLE_HINTS:
            item["type"] = "boolean"

        if name in by_prop:
            if not overwrite:
                continue
            idx = by_prop[name]
            old = metrics[idx]
            item["id"] = old.get("id") or str(uuid.uuid4())
            if not device_ref:
                item["device_ref"] = old.get("device_ref") or ""
            metrics[idx] = {**old, **item}
            updated.append(metrics[idx])
        else:
            item["id"] = str(uuid.uuid4())
            metrics.append(item)
            by_prop[name] = len(metrics) - 1
            added.append(item)

    save_catalog(cat)
    return {
        "added": added,
        "updated": updated,
        "skipped": max(0, len(source) - len(added) - len(updated)),
        "metrics": metrics,
        "devices": cat["devices"],
    }
