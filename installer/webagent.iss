; Web Agent Windows 安装器（第四阶段 S4-1，用户点名「Windows 安装包」）
; 路线：Inno Setup 6 —— 单文件 exe 安装器 + 标准卸载；**不是 Electron**（任务书红线）。
; 不捆绑 Node（前置检查 + check-env.cmd 指引）；code-server 仍按既定 gitignore 规则首跑自下载。
; 编译（Windows + Inno Setup 6）：installer\build-installer.cmd
;#define AppVer "2026.09.07"

[Setup]
AppId={{8f3c1d2e-5b6a-4c7d-9e0f-1a2b3c4d5e6f}
AppName=Web Agent
AppVersion={#AppVer}
AppPublisher=Web Agent (local repo tool)
DefaultDirName={autopf}\WebAgent
DefaultGroupName=Web Agent
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=output
OutputBaseFilename=webagent-setup-{#AppVer}
Compression=lzma2/max
SolidCompression=yes
UninstallDisplayIcon={app}\run-webagent-vscode.cmd
ChangesEnvironment=no
LicenseFile=..\SECURITY.md

[Languages]
Name: "chs"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[Files]
; 仓库主体（排除运行时产物与隐私文件；workspace 只带骨架 README，见下一条）
Source: "..\*"; DestDir: "{app}"; Flags: createallsubdirs recursesubdirs; Excludes: "\.git\*,\.git,node_modules\*,.npm\*,.cache\*,.local\*,code-server-app\*,bin\code-server-runtime\*,!bin\code-server-runtime\package.json,*.log,*.tar.gz,*.tmp.*,dist\*,build\*,out\*,workspace\*,manager\privacy.md,installer\output\*,review\shuncode-ui\*"
Source: "..\workspace\README.md"; DestDir: "{app}\workspace"; Flags: confirmoverwrite skipifsourcedoesntexist

[Icons]
; 默认壳 = Code-OSS（用户点名「vscode 复刻的编辑器」当门面）
Name: "{autodesktop}\Web Agent (VS Code 壳)"; Filename: "{app}\run-webagent-vscode.cmd"; WorkingDir: "{app}"
Name: "{group}\Web Agent (VS Code 壳)"; Filename: "{app}\run-webagent-vscode.cmd"; WorkingDir: "{app}"
Name: "{group}\经典工作台（备用）"; Filename: "{app}\run-webagent.cmd"; WorkingDir: "{app}"
Name: "{group}\环境自检 check-env"; Filename: "{app}\check-env.cmd"; WorkingDir: "{app}"
Name: "{group}\卸载 Web Agent"; Filename: "{uninstallexe}"

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
