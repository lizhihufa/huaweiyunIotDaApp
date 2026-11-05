# -*- mode: python ; coding: utf-8 -*-
# PyInstaller (run from backend/):
#   .\.venv\Scripts\pyinstaller packaging\hwy_backend.spec

import sys
from pathlib import Path

block_cipher = None
BACKEND = Path(SPECPATH).resolve().parent

# Conda OpenSSL lives in Library/bin. UPX on these DLLs breaks _ssl with
# "DLL load failed / procedure not found" -- ship originals and disable UPX.
_prefix = Path(sys.base_prefix)
_ssl_bin_dirs = [
    _prefix / "Library" / "bin",
    _prefix / "DLLs",
    _prefix / "bin",
]
_openssl_bins = []
for _name in ("libssl-3-x64.dll", "libcrypto-3-x64.dll"):
    for _dir in _ssl_bin_dirs:
        _cand = _dir / _name
        if _cand.is_file():
            _openssl_bins.append((str(_cand), "."))
            break

a = Analysis(
    [str(BACKEND / "run.py")],
    pathex=[str(BACKEND)],
    binaries=_openssl_bins,
    datas=[],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "multipart",
        "yaml",
        "six",
        "huaweicloudsdkcore",
        "huaweicloudsdkiotda",
        "app.main",
        "services.huawei_iot",
        "services.huawei_errors",
        "services.runtime",
        "services.settings",
        "services.catalog",
        "services.dashboard",
        "services.wipe",
        "storage.files",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="hwy-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="hwy-backend",
)
