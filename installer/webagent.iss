; Web Agent Windows 安装器（第四阶段 S4-1，用户点名「Windows 安装包」）
; 路线：Inno Setup 6 —— 单文件 exe 安装器 + 标准卸载；**不是 Electron**（任务书红线）。
; 不捆绑 Node（前置检查 + check-env.cmd 指引）；code-server 仍按既定 gitignore 规则首跑自下载。
; 编译（Windows + Inno Setup 6）：installer\build-installer.cmd
; P5-1 安装器对齐（对照 review/shuncode-ui/ 19–25 安装系列，ShunCode 同 Inno 工具）：
;   用户/系统双安装模式、真许可页（LICENSE=ISC）+ 安全边界说明页（SECURITY.md）、
;   「用 Web Agent 打开」文件/目录上下文菜单、打开方式注册（不劫持双击默认）、
;   PATH 附加任务（卸载时 [Code] 精确摘除）、app 窗口桌面快捷方式任务。
;#define AppVer "2026.09.07"

[Setup]
AppId={{8f3c1d2e-5b6a-4c7d-9e0f-1a2b3c4d5e6f}
AppName=Web Agent
AppVersion={#AppVer}
AppPublisher=Web Agent (local repo tool)
DefaultDirName={autopf}\WebAgent
DefaultGroupName=Web Agent
PrivilegesRequired=lowest
; 双安装模式：默认用户级；对话框允许选「为所有用户安装」（系统级，对照 ShunCode 21 图）
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=output
OutputBaseFilename=webagent-setup-{#AppVer}
Compression=lzma2/max
SolidCompression=yes
UninstallDisplayIcon={app}\run-webagent-vscode.cmd
; PATH 附加任务改环境变量后广播 WM_SETTINGCHANGE，新终端即刻生效
ChangesEnvironment=yes
; 许可页=真许可证（ISC）；安全边界（隧道=施工证等）放安装前说明页
LicenseFile=..\LICENSE
InfoBeforeFile=..\SECURITY.md

[Languages]
Name: "chs"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[Tasks]
; 附加任务集对照 ShunCode 23 图（其与 VS Code 官方同构）；默认全勾选
Name: "desktopicon"; Description: "创建桌面快捷方式（VS Code 壳）"; GroupDescription: "附加图标:"
Name: "appwindow"; Description: "创建桌面快捷方式：app 窗口（浏览器 --app 模式，无边框独立窗口）"; GroupDescription: "附加图标:"
Name: "ctxmenu"; Description: "将""用 Web Agent 打开""添加到文件与目录的上下文菜单，并注册为文本类文件的打开方式（不劫持双击默认）"; GroupDescription: "其他:"
Name: "addpath"; Description: "添加到 PATH（任意终端可直接 run-webagent；卸载时自动摘除）"; GroupDescription: "其他:"

[Files]
; 仓库主体（排除运行时产物与隐私文件；workspace 只带骨架 README，见下一条）
Source: "..\*"; DestDir: "{app}"; Flags: createallsubdirs recursesubdirs; Excludes: "\.git\*,\.git,node_modules\*,.npm\*,.cache\*,.local\*,code-server-app\*,bin\code-server-runtime\*,!bin\code-server-runtime\package.json,*.log,*.tar.gz,*.tmp.*,dist\*,build\*,out\*,workspace\*,manager\privacy.md,installer\output\*,review\shuncode-ui\*"
Source: "..\workspace\README.md"; DestDir: "{app}\workspace"; Flags: confirmoverwrite skipifsourcedoesntexist

[Icons]
; 默认壳 = Code-OSS（用户点名「vscode 复刻的编辑器」当门面）
Name: "{autodesktop}\Web Agent (VS Code 壳)"; Filename: "{app}\run-webagent-vscode.cmd"; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{autodesktop}\Web Agent (app 窗口)"; Filename: "{app}\run-webagent-appwindow.cmd"; WorkingDir: "{app}"; Tasks: appwindow
Name: "{group}\Web Agent (VS Code 壳)"; Filename: "{app}\run-webagent-vscode.cmd"; WorkingDir: "{app}"
Name: "{group}\经典工作台（备用）"; Filename: "{app}\run-webagent.cmd"; WorkingDir: "{app}"
Name: "{group}\环境自检 check-env"; Filename: "{app}\check-env.cmd"; WorkingDir: "{app}"
Name: "{group}\卸载 Web Agent"; Filename: "{uninstallexe}"

[Registry]
; 上下文菜单（HKCU\Software\Classes：用户级与系统级安装都对当前用户生效；卸载 uninsdeletekey 清干净）
Root: HKCU; Subkey: "Software\Classes\*\shell\WebAgentOpen"; ValueType: string; ValueData: "用 Web Agent 打开"; Flags: uninsdeletekey; Tasks: ctxmenu
Root: HKCU; Subkey: "Software\Classes\*\shell\WebAgentOpen\command"; ValueType: string; ValueData: """{app}\run-webagent-vscode.cmd"" ""%1"""; Tasks: ctxmenu
Root: HKCU; Subkey: "Software\Classes\Directory\shell\WebAgentOpen"; ValueType: string; ValueData: "用 Web Agent 打开"; Flags: uninsdeletekey; Tasks: ctxmenu
Root: HKCU; Subkey: "Software\Classes\Directory\shell\WebAgentOpen\command"; ValueType: string; ValueData: """{app}\run-webagent-vscode.cmd"" ""%V"""; Tasks: ctxmenu
; 打开方式注册：ProgID + 常见文本扩展名 OpenWithProgids（只进「打开方式」菜单，不动默认关联）
Root: HKCU; Subkey: "Software\Classes\WebAgent.OpenWith"; ValueType: string; ValueData: "Web Agent 工作区"; Flags: uninsdeletekey; Tasks: ctxmenu
Root: HKCU; Subkey: "Software\Classes\WebAgent.OpenWith\shell\open\command"; ValueType: string; ValueData: """{app}\run-webagent-vscode.cmd"" ""%1"""; Tasks: ctxmenu
Root: HKCU; Subkey: "Software\Classes\.md\OpenWithProgids"; ValueType: string; ValueName: "WebAgent.OpenWith"; ValueData: ""; Flags: uninsdeletevalue; Tasks: ctxmenu
Root: HKCU; Subkey: "Software\Classes\.txt\OpenWithProgids"; ValueType: string; ValueName: "WebAgent.OpenWith"; ValueData: ""; Flags: uninsdeletevalue; Tasks: ctxmenu
Root: HKCU; Subkey: "Software\Classes\.js\OpenWithProgids"; ValueType: string; ValueName: "WebAgent.OpenWith"; ValueData: ""; Flags: uninsdeletevalue; Tasks: ctxmenu
Root: HKCU; Subkey: "Software\Classes\.json\OpenWithProgids"; ValueType: string; ValueName: "WebAgent.OpenWith"; ValueData: ""; Flags: uninsdeletevalue; Tasks: ctxmenu
Root: HKCU; Subkey: "Software\Classes\.py\OpenWithProgids"; ValueType: string; ValueName: "WebAgent.OpenWith"; ValueData: ""; Flags: uninsdeletevalue; Tasks: ctxmenu
Root: HKCU; Subkey: "Software\Classes\.html\OpenWithProgids"; ValueType: string; ValueName: "WebAgent.OpenWith"; ValueData: ""; Flags: uninsdeletevalue; Tasks: ctxmenu
Root: HKCU; Subkey: "Software\Classes\.css\OpenWithProgids"; ValueType: string; ValueName: "WebAgent.OpenWith"; ValueData: ""; Flags: uninsdeletevalue; Tasks: ctxmenu
; PATH：{olddata} 保留原值追加；卸载由 [Code] 精确摘除（不能 uninsdeletevalue 整值删）
Root: HKCU; Subkey: "Environment"; ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}"; Tasks: addpath

[Run]
Filename: "{app}\run-webagent-vscode.cmd"; Description: "立即启动（VS Code 壳）"; Flags: postinstall skipifsilent shellexec runasoriginaluser; WorkingDir: "{app}"

[UninstallDelete]
; 只清运行时产物；**workspace 是用户的仓库，卸载不动**
Type: filesandordirs; Name: "{app}\webagent-core\agent-host\node_modules"
Type: filesandordirs; Name: "{app}\bin\code-server-runtime"
Type: filesandordirs; Name: "{app}\code-server-app"
Type: filesandordirs; Name: "{app}\.cache"
Type: filesandordirs; Name: "{app}\.local"

[Code]
// 前置检查：Node.js 在 PATH 或注册表里；缺则警告但不拦安装（check-env.cmd 会给指引）
function NodePresent(): Boolean;
var
  P: String;
begin
  Result := (RegQueryStringValue(HKLM, 'SOFTWARE\Node.js', 'InstallPath', P))
         or (RegQueryStringValue(HKLM32, 'SOFTWARE\Node.js', 'InstallPath', P));
  if not Result then
    Result := (ShellExec('cmd.exe', '/c where node >nul 2>&1', '', '', SW_HIDE, ewWaitUntilTerminated, 0));
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
  if not NodePresent() then
    MsgBox('未检测到 Node.js（>=18）。安装会继续，但首次启动前请先装 Node LTS，或运行安装目录里的 check-env.cmd。', mbInformation, MB_OK);
end;

// PATH 幂等：覆盖安装前先把本目录的旧条目摘掉，避免 {olddata};{app} 叠加出重复段
procedure StripAppFromPath();
var
  P: String;
  AppDir: String;
begin
  AppDir := ExpandConstant('{app}');
  if RegQueryStringValue(HKCU, 'Environment', 'Path', P) then begin
    StringChangeEx(P, ';' + AppDir, '', False);
    StringChangeEx(P, AppDir + ';', '', False);
    if P = AppDir then P := '';
    RegWriteExpandStringValue(HKCU, 'Environment', 'Path', P);
  end;
end;

procedure PrepareToInstall(var NeedsRestart: Boolean);
begin
  StripAppFromPath();
end;

// 卸载：精确摘除 PATH 里的本目录（绝不整值删除用户 Path）
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
    StripAppFromPath();
end;
