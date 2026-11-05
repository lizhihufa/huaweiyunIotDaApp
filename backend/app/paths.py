"""项目路径：backend/app → 项目根 huaweiyunapp；客户端打包后由环境变量覆盖。"""

from __future__ import annotations

import os
import sys
from pathlib import Path


def _frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def project_root() -> Path:
    env = os.environ.get("HWY_APP_ROOT")
    if env:
        return Path(env).resolve()
    if _frozen():
        # PyInstaller onedir：可执行文件所在目录即资源根
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[2]


def data_dir() -> Path:
    env = os.environ.get("HWY_DATA_DIR")
    if env:
        p = Path(env).resolve()
    else:
        p = project_root() / "data"
    p.mkdir(parents=True, exist_ok=True)
    (p / "dashboards").mkdir(parents=True, exist_ok=True)
    (p / "history").mkdir(parents=True, exist_ok=True)
    (p / "uploads").mkdir(parents=True, exist_ok=True)
    (p / "twins").mkdir(parents=True, exist_ok=True)
    (p / "library").mkdir(parents=True, exist_ok=True)
    return p


def frontend_dist() -> Path:
    env = os.environ.get("HWY_FRONTEND_DIST")
    if env:
        return Path(env).resolve()
    root = project_root()
    for candidate in (root / "web", root / "frontend" / "dist", root / "dist"):
        if candidate.is_dir():
            return candidate
    return root / "frontend" / "dist"


ROOT = project_root()
DATA = data_dir()
SETTINGS_FILE = DATA / "settings.yaml"
CATALOG_FILE = DATA / "catalog.json"
DASHBOARDS_DIR = DATA / "dashboards"
UPLOADS_DIR = DATA / "uploads"
TWINS_DIR = DATA / "twins"
LIBRARY_DIR = DATA / "library"
FRONTEND_DIST = frontend_dist()
