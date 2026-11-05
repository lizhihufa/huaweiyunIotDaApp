; Inno Setup 6 脚本。electron-builder 打出 win-unpacked 后执行本脚本生成安装包。

#define MyAppName "华为云监测控制平台"
#define MyAppVersion "0.1.0"
#define MyAppExeName "华为云监测控制平台.exe"

[Setup]
AppId={{A7C3E91B-4D2F-4B8A-9E11-6F0C2D8A71B4}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppName}
DefaultDirName={localappdata}\HuaweiYunMonitor
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
; 安装包输出到仓库根目录（相对本 .iss 所在 desktop/）
OutputDir=..
OutputBaseFilename=HuaweiYunMonitor-Setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
UninstallDisplayName={#MyAppName}
SetupIconFile=build\icon.ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut / 创建桌面快捷方式"; GroupDescription: "Additional icons:"

[Files]
Source: "release\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName} / 启动应用"; Flags: nowait postinstall skipifsilent
