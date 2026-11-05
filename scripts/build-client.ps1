# 构建 Windows 可安装客户端
# 用法（在仓库根目录 huaweiyunapp 下）：
#   powershell -ExecutionPolicy Bypass -File .\scripts\build-client.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "==> 1/4 构建前端" -ForegroundColor Cyan
Push-Location (Join-Path $Root "frontend")
npm run build
if ($LASTEXITCODE -ne 0) { throw "前端构建失败" }
Pop-Location

$ClientDir = Join-Path $Root "build\client"
$WebDir = Join-Path $ClientDir "web"
$BackendOut = Join-Path $ClientDir "backend"
New-Item -ItemType Directory -Force -Path $WebDir | Out-Null
New-Item -ItemType Directory -Force -Path $BackendOut | Out-Null

Write-Host "==> 复制前端产物到 build/client/web" -ForegroundColor Cyan
Remove-Item -Recurse -Force $WebDir -ErrorAction SilentlyContinue
Copy-Item -Recurse (Join-Path $Root "frontend\dist") $WebDir

Write-Host "==> 2/4 安装 PyInstaller（若需要）" -ForegroundColor Cyan
$Py = Join-Path $Root "backend\.venv\Scripts\python.exe"
$Pip = Join-Path $Root "backend\.venv\Scripts\pip.exe"
if (-not (Test-Path $Py)) { throw "找不到 backend\.venv，请先创建虚拟环境并安装依赖" }
& $Pip install -q "pyinstaller>=6.0" -i https://pypi.org/simple
if ($LASTEXITCODE -ne 0) { throw "安装 pyinstaller 失败" }

Write-Host "==> 3/4 打包后端 exe" -ForegroundColor Cyan
Push-Location (Join-Path $Root "backend")
& $Py -m PyInstaller --noconfirm --clean "packaging\hwy_backend.spec"
if ($LASTEXITCODE -ne 0) { throw "PyInstaller 打包失败" }
Pop-Location

$DistBackend = Join-Path $Root "backend\dist\hwy-backend"
if (-not (Test-Path (Join-Path $DistBackend "hwy-backend.exe"))) {
  throw "未找到 backend\dist\hwy-backend\hwy-backend.exe"
}
Remove-Item -Recurse -Force $BackendOut -ErrorAction SilentlyContinue
Copy-Item -Recurse $DistBackend $BackendOut

Write-Host "==> 4/4 打包 Electron 客户端" -ForegroundColor Cyan
Push-Location (Join-Path $Root "desktop")
if (-not (Test-Path "node_modules")) {
  npm install
  if ($LASTEXITCODE -ne 0) { throw "desktop npm install 失败" }
}
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm run pack
if ($LASTEXITCODE -ne 0) { throw "electron-builder 失败" }
Pop-Location

$Unpacked = Join-Path $Root "desktop\release\win-unpacked"
$Iscc = @(
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
  "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

Write-Host ""
if ($Iscc) {
  Write-Host "==> 清理旧安装包（仓库根目录）" -ForegroundColor Cyan
  Get-ChildItem $Root -Filter "HuaweiYunMonitor-Setup-*.exe" -ErrorAction SilentlyContinue |
    Remove-Item -Force
  # 兼容旧路径：desktop/release 下的安装包一并删掉
  Get-ChildItem (Join-Path $Root "desktop\release") -Filter "HuaweiYunMonitor-Setup-*.exe" -ErrorAction SilentlyContinue |
    Remove-Item -Force

  Write-Host "==> 生成安装程序 → 仓库根目录" -ForegroundColor Cyan
  & $Iscc (Join-Path $Root "desktop\installer.iss")
  if ($LASTEXITCODE -ne 0) { throw "Inno Setup 打包失败" }

  $Setup = Get-ChildItem $Root -Filter "HuaweiYunMonitor-Setup-*.exe" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($Setup) {
    Write-Host ("安装包: " + $Setup.FullName) -ForegroundColor Green
  } else {
    throw "未在仓库根目录找到 HuaweiYunMonitor-Setup-*.exe"
  }
} else {
  Write-Host "未安装 Inno Setup，已生成可运行目录（可直接双击 exe）：" -ForegroundColor Yellow
  Write-Host $Unpacked -ForegroundColor Yellow
  Write-Host "安装 Inno Setup 6 后重新运行本脚本，即可得到安装包。" -ForegroundColor Yellow
}
