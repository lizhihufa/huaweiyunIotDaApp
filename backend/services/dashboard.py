from __future__ import annotations

import re
import uuid
from typing import Any

from app.paths import DASHBOARDS_DIR
from storage.files import read_json, write_json

_SAFE = re.compile(r"^[a-zA-Z0-9_\-]+$")


def _path(dash_id: str):
    if not _SAFE.match(dash_id):
        raise ValueError("非法大屏 ID")
    return DASHBOARDS_DIR / f"{dash_id}.json"


def list_dashboards() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for path in sorted(DASHBOARDS_DIR.glob("*.json")):
        data = read_json(path, default={})
        if not isinstance(data, dict):
            continue
        items.append(
            {
                "id": data.get("id") or path.stem,
                "name": data.get("name") or path.stem,
                "updated_at": data.get("updated_at"),
            }
        )
    return items


def get_dashboard(dash_id: str) -> dict[str, Any] | None:
    path = _path(dash_id)
    if not path.is_file():
        return None
    data = read_json(path, default=None)
    return data if isinstance(data, dict) else None


def save_dashboard(body: dict[str, Any]) -> dict[str, Any]:
    from datetime import datetime, timezone

    item = dict(body)
    item_id = str(item.get("id") or uuid.uuid4())
    if not _SAFE.match(item_id):
        # 允许 uuid，uuid 含 - 已在 SAFE 中
        raise ValueError("非法大屏 ID")
    item["id"] = item_id
    item.setdefault("name", item_id)
    item.setdefault("layout", [])
    item["updated_at"] = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    write_json(_path(item_id), item)
    return item


def delete_dashboard(dash_id: str) -> bool:
    path = _path(dash_id)
    if not path.is_file():
        return False
    path.unlink()
    return True


def ensure_default() -> None:
    if list(DASHBOARDS_DIR.glob("*.json")):
        return
    save_dashboard(
        {
            "id": "default",
            "name": "默认大屏",
            "layout": [],
            "theme": {"background": "#0b1c2c", "accent": "#3dd6c6"},
        }
    )
