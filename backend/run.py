"""启动后端：python run.py（客户端打包后也可由 Electron 拉起）"""

from __future__ import annotations

import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
if getattr(sys, "frozen", False):
    BACKEND_DIR = Path(sys.executable).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# PyInstaller console=False 时 stdout/stderr 为 None，uvicorn 日志会因 isatty 崩溃
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")

import uvicorn

from services.settings import load_settings


def main() -> None:
    cfg = load_settings()
    host = (cfg.get("server") or {}).get("host", "127.0.0.1")
    port = int(os.environ.get("HWY_PORT") or (cfg.get("server") or {}).get("port", 8790))
    # 打包后不能用字符串 import 路径刷新，直接传 app 对象更稳
    if getattr(sys, "frozen", False):
        from app.main import app

        uvicorn.run(app, host=host, port=port, reload=False, log_level="info")
    else:
        uvicorn.run("app.main:app", host=host, port=port, reload=False, log_level="info")


if __name__ == "__main__":
    main()
