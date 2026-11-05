"""清空本地数据文件，恢复为出厂默认。"""

from __future__ import annotations

import shutil
from copy import deepcopy
from pathlib import Path
from typing import Any

from app.paths import (
    CATALOG_FILE,
    DASHBOARDS_DIR,
    DATA,
    LIBRARY_DIR,
    SETTINGS_FILE,
    TWINS_DIR,
    UPLOADS_DIR,
)
from services import dashboard, library, twin
from services.settings import DEFAULT_SETTINGS
from storage.files import write_json, write_yaml


def _clear_dir(path: Path) -> int:
    if not path.is_dir():
        path.mkdir(parents=True, exist_ok=True)
        return 0
    removed = 0
    for child in path.iterdir():
        if child.is_file():
            child.unlink(missing_ok=True)
            removed += 1
        elif child.is_dir():
            shutil.rmtree(child, ignore_errors=True)
            removed += 1
    return removed


def wipe_all_data() -> dict[str, Any]:
    """删除设置、点位目录、大屏、上传图、历史，并重建空默认。"""
    history_dir = DATA / "history"

    removed = {
        "settings": False,
        "catalog": False,
        "dashboards": 0,
        "uploads": 0,
        "history": 0,
        "twins": 0,
        "library": 0,
    }

    if SETTINGS_FILE.is_file():
        SETTINGS_FILE.unlink(missing_ok=True)
        removed["settings"] = True

    if CATALOG_FILE.is_file():
        CATALOG_FILE.unlink(missing_ok=True)
        removed["catalog"] = True

    removed["dashboards"] = _clear_dir(DASHBOARDS_DIR)
    removed["uploads"] = _clear_dir(UPLOADS_DIR)
    removed["history"] = _clear_dir(history_dir)
    removed["twins"] = _clear_dir(TWINS_DIR)
    removed["library"] = _clear_dir(LIBRARY_DIR)

    # 重建默认文件
    write_yaml(SETTINGS_FILE, deepcopy(DEFAULT_SETTINGS))
    write_json(CATALOG_FILE, {"devices": [], "metrics": []})
    dashboard.ensure_default()
    twin.ensure_default()
    library.ensure_default()

    return {"ok": True, "removed": removed}
