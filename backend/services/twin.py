"""设备孪生工程：三视图、部件标注、模拟规则（本地 JSON）。"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any

from app.paths import TWINS_DIR
from storage.files import read_json, write_json

_SAFE = re.compile(r"^[a-zA-Z0-9_\-]+$")

DEFAULT_RULES: dict[str, Any] = {
    "threshold_lx": 80,
    "hysteresis": 1.5,
    "mode": "auto",  # auto | manual
    "manual_lamp_on": False,
    "sim_hour": 16.9,
}

DEFAULT_PARTS: list[dict[str, Any]] = [
    {"id": "ldr", "label": "光敏电阻", "layer": "传感层", "template": "sensor"},
    {"id": "mcu", "label": "STM32 主控", "layer": "控制层", "template": "board"},
    {"id": "relay", "label": "继电器", "layer": "执行层", "template": "relay"},
    {"id": "wifi", "label": "Wi-Fi 模块", "layer": "通信层", "template": "module"},
    {"id": "lamp", "label": "路灯灯头", "layer": "执行层", "template": "lamp"},
    {"id": "pole", "label": "灯杆", "layer": "结构", "template": "pole"},
    {"id": "base", "label": "底座 / 场景", "layer": "结构", "template": "base"},
]


def _now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _path(twin_id: str):
    if not _SAFE.match(twin_id):
        raise ValueError("非法孪生工程 ID")
    return TWINS_DIR / f"{twin_id}.json"


SCENE_PRESETS: list[dict[str, Any]] = [
    {
        "id": "street_light",
        "name": "智能路灯 · 街道",
        "template": "street_light",
        "scene_type": "street",
        "parts": [dict(p) for p in DEFAULT_PARTS],
    },
    {
        "id": "room_demo",
        "name": "室内房间监测",
        "template": "room",
        "scene_type": "room",
        "parts": [
            {"id": "desk", "label": "桌面 / 机柜", "layer": "结构", "shape": "box"},
            {"id": "mcu", "label": "主控板", "layer": "控制层", "shape": "box"},
            {"id": "sensor_temp", "label": "温湿度传感器", "layer": "传感层", "shape": "sensor"},
            {"id": "camera", "label": "摄像头", "layer": "传感层", "shape": "box"},
            {"id": "lamp", "label": "室内灯", "layer": "执行层", "shape": "lamp"},
            {"id": "relay", "label": "智能插座 / 继电器", "layer": "执行层", "shape": "box"},
        ],
    },
    {
        "id": "greenhouse_demo",
        "name": "大棚环境控制",
        "template": "greenhouse",
        "scene_type": "greenhouse",
        "parts": [
            {"id": "ridge", "label": "棚架 / 立柱", "layer": "结构", "shape": "pole"},
            {"id": "soil_sensor", "label": "土壤湿度探头", "layer": "传感层", "shape": "sensor"},
            {"id": "temp_sensor", "label": "棚内温湿度", "layer": "传感层", "shape": "box"},
            {"id": "valve", "label": "电磁阀 / 灌溉", "layer": "执行层", "shape": "box"},
            {"id": "fan", "label": "风机", "layer": "执行层", "shape": "box"},
            {"id": "mcu", "label": "田间网关", "layer": "控制层", "shape": "box"},
        ],
    },
    {
        "id": "farm_demo",
        "name": "农场 / 旱田",
        "template": "farm",
        "scene_type": "farm",
        "parts": [
            {"id": "crop_row", "label": "作物行", "layer": "结构", "shape": "box"},
            {"id": "soil_sensor", "label": "土壤传感器", "layer": "传感层", "shape": "sensor"},
            {"id": "weather", "label": "气象站", "layer": "传感层", "shape": "box"},
            {"id": "pump", "label": "水泵", "layer": "执行层", "shape": "box"},
            {"id": "gateway", "label": "网关箱", "layer": "控制层", "shape": "box"},
            {"id": "camera", "label": "田间摄像头", "layer": "传感层", "shape": "box"},
        ],
    },
    {
        "id": "rice_paddy_demo",
        "name": "稻田水位监测",
        "template": "rice_paddy",
        "scene_type": "rice_paddy",
        "parts": [
            {"id": "ridge", "label": "田埂", "layer": "结构", "shape": "box"},
            {"id": "rice", "label": "稻丛", "layer": "结构", "shape": "pole"},
            {"id": "water_sensor", "label": "水位传感器", "layer": "传感层", "shape": "sensor"},
            {"id": "gate", "label": "进排水闸", "layer": "执行层", "shape": "box"},
            {"id": "pump", "label": "抽水泵", "layer": "执行层", "shape": "box"},
            {"id": "gateway", "label": "田间网关", "layer": "控制层", "shape": "box"},
        ],
    },
]


def default_project(
    twin_id: str = "street_light",
    name: str = "智能路灯 · 街道",
    *,
    template: str = "street_light",
    scene_type: str = "street",
    parts: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "id": twin_id,
        "name": name,
        "template": template,
        "scene_type": scene_type,
        "scene_config": {},
        "views": {"front": "", "side": "", "top": ""},
        "parts": [dict(p) for p in (parts if parts is not None else DEFAULT_PARTS)],
        "annotations": {},
        "rules": dict(DEFAULT_RULES),
        "bindings": {
            "illuminance": "sim.lux",
            "lamp_on": "part.lamp.emissive",
            "relay_on": "part.relay.active",
        },
        "camera": {"preset": "orbit"},
        "assembly_model": (
            {"kind": "builtin", "id": "street_light"}
            if scene_type == "street" or template == "street_light"
            else None
        ),
        "updated_at": _now(),
    }


def list_twins() -> list[dict[str, Any]]:
    TWINS_DIR.mkdir(parents=True, exist_ok=True)
    items: list[dict[str, Any]] = []
    for path in sorted(TWINS_DIR.glob("*.json")):
        data = read_json(path, default={})
        if not isinstance(data, dict):
            continue
        views = data.get("views") or {}
        anns = data.get("annotations") or {}
        ann_count = sum(len(anns.get(k) or []) for k in ("front", "side", "top"))
        items.append(
            {
                "id": data.get("id") or path.stem,
                "name": data.get("name") or path.stem,
                "template": data.get("template") or "street_light",
                "scene_type": data.get("scene_type")
                or data.get("template")
                or "street_light",
                "updated_at": data.get("updated_at"),
                "has_views": bool(any(views.get(k) for k in ("front", "side", "top"))),
                "annotation_count": ann_count,
                "parts_count": len(data.get("parts") or []),
            }
        )
    return items


def get_twin(twin_id: str) -> dict[str, Any] | None:
    path = _path(twin_id)
    if not path.is_file():
        return None
    data = read_json(path, default=None)
    return data if isinstance(data, dict) else None


def save_twin(body: dict[str, Any]) -> dict[str, Any]:
    item = dict(body)
    item_id = str(item.get("id") or uuid.uuid4())
    if not _SAFE.match(item_id):
        raise ValueError("非法孪生工程 ID")
    base = default_project(item_id, str(item.get("name") or item_id))
    # 浅合并顶层；views/rules/annotations 整段覆盖（若提供）
    for key in ("name", "template", "scene_type", "camera"):
        if key in item and item[key] is not None:
            base[key] = item[key]
    if isinstance(item.get("scene_config"), dict):
        base["scene_config"] = item["scene_config"]
    if isinstance(item.get("views"), dict):
        base["views"] = {**base["views"], **item["views"]}
    if isinstance(item.get("parts"), list):
        base["parts"] = item["parts"]
    if isinstance(item.get("annotations"), dict):
        base["annotations"] = item["annotations"]
    if isinstance(item.get("rules"), dict):
        base["rules"] = {**base["rules"], **item["rules"]}
    if isinstance(item.get("bindings"), dict):
        base["bindings"] = {**base["bindings"], **item["bindings"]}
    if "assembly_model" in item:
        base["assembly_model"] = item.get("assembly_model")
    base["id"] = item_id
    base["updated_at"] = _now()
    write_json(_path(item_id), base)
    return base


def delete_twin(twin_id: str) -> bool:
    path = _path(twin_id)
    if not path.is_file():
        return False
    path.unlink()
    return True


def ensure_default() -> None:
    TWINS_DIR.mkdir(parents=True, exist_ok=True)
    existing = {p.stem for p in TWINS_DIR.glob("*.json")}
    if not existing:
        for preset in SCENE_PRESETS:
            save_twin(
                default_project(
                    preset["id"],
                    preset["name"],
                    template=preset["template"],
                    scene_type=preset["scene_type"],
                    parts=preset["parts"],
                )
            )
        return
    # 已有工程时，补齐缺失的场景样板（不覆盖用户已改文件）
    for preset in SCENE_PRESETS:
        if preset["id"] in existing:
            continue
        save_twin(
            default_project(
                preset["id"],
                preset["name"],
                template=preset["template"],
                scene_type=preset["scene_type"],
                parts=preset["parts"],
            )
        )
