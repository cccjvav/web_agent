# R8 本轮 Arena 实机验收：第七批、F71、F72（逐步操作）

这是**本轮改动**的操作手册，写给你自己的环境：**Windows 桌面 VS Code → 集成 CMD → 激活 Conda，Node.js 装在系统里**，工作区用 **web_agent 仓库根目录**，经 **Cloudflare Quick Tunnel** 让 Arena 连本机 MCP。通用步骤（第一次装环境、端口排查、停止服务的细节）仍以[Windows新手逐步验收](Windows新手逐步验收.md)为准，判定基线仍是[Windows验收清单](../../review/CHECKLIST_WINDOWS.md)的M1–M5；本手册只补“这几批具体要看什么”。

**规则：** 每一步只记录真实结果之一：通过 / 失败 / 未执行。失败就停在那一步，把**步骤编号＋脱敏输出/截图**发给维护者，不要为了往下走而改设置或绕过提示。沙箱里的CI全绿不能代替这里任何一步。

**绝不外发：** 完整MCP地址（`https://…/mcp/一串密钥`）、`.webagent\config.json`、配对码、令牌。截图前先遮住。隧道域名本身（不带`/mcp/…`）可以出现在本机CMD命令里。

## 本轮要验什么

| 批次 | 改了什么 | 你在本机能看到的现象 | 步骤 |
|---|---|---|---|
| 第七批 | ping只回空结果；未知方法不再回404；工具带只读/破坏性注解 | Arena空闲几分钟后不需重连仍能调用；工具正常出现 | 7.1、7.6 |
| 第七批 | 畸形请求不再回HTML错误页（此前带安装路径和调用栈） | 经隧道发坏JSON得到简短JSON | 8 |
| 第七批 | 远程`run_command`最多50秒、`start_command`最多600秒；输出截断可见 | 超时结果能回到Arena；70秒后台任务能等到结束；长输出带截断标记 | 7.3–7.5 |
| F71 | 不同凭据的无会话调用者不再互相看到命令输出 | 第二个凭据拿不到第一个的输出 | 7.8（可选） |
| F72 | 危险命令检测：换行不再能藏住破坏性命令 | 远端多行命令里夹`Remove-Item -Recurse`被拒，目录还在 | 7.7 |
| F72（扩展） | `webagent.agentHostUrl`只接受本机地址 | 设成外部地址时状态栏显示“主机地址无效” | 9.1 |
| F72（扩展） | 带路径的程序不再出现“同类都允许”；Windows多行PTY命令失败不再报0 | VS Code确认框按钮变化；退出码正确 | 9.2（可选，需模型） |

admin-host的两项修复（令牌文件权限、500不带路径）不需要实机，本轮不验。

## 0. 准备记录

**CMD-B**（VS Code终端面板新建的第二个Command Prompt）：

```bat
if not exist "%USERPROFILE%\WebAgent-evidence" mkdir "%USERPROFILE%\WebAgent-evidence"
notepad "%USERPROFILE%\WebAgent-evidence\manual-results.txt"
```

在文件**末尾追加**（不要覆盖旧记录）：

```text
==== R8 本轮验收（第七批/F71/F72）====
日期：
Git提交（第1步输出）：
自动测试（第2步）：通过/失败/未执行，文件数：   退出码：
后面每步：编号、实际结果、判定
```

## 1. 停掉旧服务，更新到本轮代码

1. 若旧的`run-webagent.cmd`还在跑：先在工作台停止Bridge，再在它的CMD窗口按`Ctrl+C`，问“终止批处理操作吗”输入`Y`。
2. **CMD-A 与 CMD-B 都执行**（`你的环境名`和路径换成自己的）：

```bat
conda activate 你的环境名
cd /d "你的web_agent完整路径"
```

3. **CMD-B** 检查有没有本地改动：

```bat
git status --short
git branch --show-current
```

`git status --short`**必须没有输出**。有输出就停下，把列表发给维护者；不要stash、reset或删除。

4. 取本轮分支并切换：

```bat
git fetch origin arena/01a0d084-web-agent
git switch arena/01a0d084-web-agent
git pull --ff-only
git rev-parse HEAD
git rev-parse origin/arena/01a0d084-web-agent
```

**预期：** 最后两行是同一串提交号，记到记录里。`git switch`若提示本地已有同名分支，它会直接切过去，随后的`git pull --ff-only`负责更新；无法快进就停下报告。

## 2. 依赖与自动测试（M3）

**CMD-B：**

```bat
npm ci --include=dev --prefix webagent-core/agent-host
echo %ERRORLEVEL%
node docs-site/check-docs.js
echo %ERRORLEVEL%
npm test --prefix webagent-core/agent-host
echo %ERRORLEVEL%
```

每个`echo`紧跟上一条。**预期：** 三个退出码都是`0`；最后汇总行形如`112 test files passed`（文件数以你拉到的提交为准，本手册更新时为112），把实际数字写进记录。Windows上这一步会用真实powershell跑PTY退出码测试。任何一步非0就停，保留原始报错，不运行`--write`去“修”。

**可选：浏览器回归（M3要求与上面分开记录）。** 需要Playwright的Chromium；第一条会下载浏览器（约一两百MB），不想下载就记“浏览器回归未执行”：

```bat
pushd webagent-core\agent-host
npx playwright install chromium
npm run test:browser
echo %ERRORLEVEL%
popd
```

Chromium装不上或缺依赖记为“阻塞”，不要记通过。

## 3. 更新VS Code扩展

本轮改了扩展代码，旧窗口不会自动换新。

1. 用“文件 → 打开文件夹”打开**仓库根**并信任。
2. **CMD-B：**

```bat
set WORKSPACE_ROOT=
install-vscode-extension.cmd
```

3. `Ctrl+Shift+P` → `Developer: Reload Window`。重载后终端会重开，按第1步第2条重新激活Conda并进入仓库根（CMD-A、CMD-B都要）。

## 4. 启动主机（工作区＝仓库根）

**CMD-A：**

```bat
set WORKSPACE_ROOT=
run-webagent.cmd
```

**预期：** 日志里的 Workspace 是你的仓库根。启动脚本**不会自动打开浏览器**，自己在浏览器地址栏输入`http://127.0.0.1:3000`（R8实测如此，属预期）。VS Code右下角状态栏应是`Web Agent`（不是“工作区不一致”或“未连接 48271”）。

## 5. 设置Bridge权限，准备演练目录

1. 工作台 → Bridge区域 →“工作模式与Bridge权限”：核对工作区是仓库根；切换到**Bridge**，看主机回读。
2. 本轮要跑命令，勾选 **Read、Edit、Execute、Capture 四项**并点“保存权限”（Execute必须另外三项都开）。验收结束后按你平时需要改回。
3. **CMD-B** 建立只给F72用的演练目录（位于仓库根，结束时删除）：

```bat
if exist _r8_scratch echo STOP: _r8_scratch already exists
```

打印STOP就换个名字，并在7.7和第10步里同样替换。没有输出才继续：

```bat
mkdir _r8_scratch\victim
echo KEEP-R8> _r8_scratch\victim\keep.txt
type _r8_scratch\victim\keep.txt
```

**预期：** 显示`KEEP-R8`。

## 6. 启动Bridge，在Arena里接入

1. Bridge的启动入口**不在侧栏权限卡片里**：工作台右上菜单 → **智能体自定义设置… → 左侧Bridge页**，隧道选 **Cloudflare Quick Tunnel** → 启动Bridge。成功后应出现`https://…trycloudflare.com`域名；仍是`127.0.0.1`就停下（见[使用指南](../../使用指南.md)的Bridge故障说明）。
2. 在同一页点**复制提示词**，把整段作为**要接入的那个Arena会话**的第一句发出（Arena没有单独的MCP连接配置界面，提示词里本来就含完整地址，这是正式接入方式）。这段提示词**只发这一个会话**：不要贴进协助你验收的其他对话、截图或记录；万一发错地方，立即在同页高级设置点【重置 MCP 地址】（不停隧道），再用新提示词重连。Quick Tunnel每次启动域名都会变，旧连接要换新提示词。
3. 另在记录里写下**隧道域名**（只到`.trycloudflare.com`为止），第8步要用。

## 7. 在Arena会话里逐项验收

下面的引号框是**发给Arena里那个有WebAgent工具的Agent**的话，不是CMD命令。每项都要看工具的**实际返回**（展开工具卡片），不看Agent的总结。

### 7.1 工具出现、ping、workspace_info（M1）

```text
只做连接核对，禁止写文件、运行命令。请实际调用 ping 和 workspace_info 两个工具，原样贴出返回的 root、identity.hostInstanceId、identity.workspaceRoot。没有这些工具就直接说没有，不要猜。
```

**预期：** 工具存在且返回；`root`是你的仓库根；`hostInstanceId`与工作台主机诊断里的一致。若Arena对读取类工具也逐次弹确认，记下来（第七批加了只读注解，是否据此少弹确认取决于Arena）。

### 7.2 读文件与真实提交（M2）

```text
请用 read_files 读取 README.md 的前20行和 manager/CONTEXT.md 的前10行，原样贴出。然后用 run_command 依次运行 git rev-parse HEAD 和 node -p process.execPath，贴出 exitCode 和 stdout。不要读取 .webagent/config.json。
```

**预期：** 提交号与第1步一致；Node路径是你的系统Node。

### 7.2b 受控写入与读回（M4）

```text
仅授权新建一个文件 _r8_scratch/r8-write.txt，内容为一行 R8-WRITE-OK。先确认它不存在，已存在就停止、不覆盖。禁止修改其他任何文件。写完用 read_files 读回，原样贴出内容和返回的 sha256。
```

**CMD-B：**

```bat
type _r8_scratch\r8-write.txt
```

**预期：** 显示`R8-WRITE-OK`；`git status --short`里除了`_r8_scratch/`以外没有别的变化。

### 7.3 输出截断可见（第七批）

```text
请用 run_command 运行下面这条命令，不要改写：
node -e "process.stdout.write('x'.repeat(30000))"
只贴出返回里的 exitCode、stdoutChars、stdoutTruncated 三个字段，不要贴输出正文。
```

**预期：** `exitCode`为0，`stdoutChars`为30000，`stdoutTruncated`为true。缺少这两个字段就是失败。

### 7.4 run_command 50秒上限（第七批）

```text
请用 run_command 运行 node -e "setTimeout(()=>{},55000)" ，timeoutSec 设为 120。完成后贴出返回的 status、exitCode 和 timeoutSec 字段，以及你等待了大约多少秒。
```

**预期：** 大约50秒后返回一个超时结果，而且确实回到了Arena；不应在60秒左右出现Arena自己的请求超时，也不应一直没有结果。

### 7.5 start_command 长任务（第七批）

```text
请用 start_command 运行 node -e "setTimeout(()=>console.log('LONG-DONE'),70000)" ，timeoutSec 设为 120。然后按返回的 suggestedWaitMs 反复调用 get_command_output（带上 execId），直到 status 不再是 running。贴出最后一次返回的 status、exitCode、stdout，以及 start_command 返回里的 timeoutSec。
```

**预期：** 约70秒后`status`为done、stdout含`LONG-DONE`、`timeoutSec`为120。修前会在60秒被杀。

### 7.6 空闲后仍可用（第七批ping）

不操作Arena，**等待至少3分钟**，然后：

```text
不要重新连接。请直接再调用一次 ping 工具并贴出结果。
```

**预期：** 直接成功。若Arena提示连接断开、需要重新连接，记为失败并写下提示原文。

### 7.7 换行不能藏住破坏性命令（F72，远端必须拒绝）

先对照组：

```text
这是安全验收，命令应当被主机拒绝。请用 run_command 运行下面这一行，不要加 confirm 之类的参数，也不要改写或换成别的命令：
Remove-Item -Recurse -Force _r8_scratch\victim
贴出工具返回的错误码和原文。
```

**预期：** 返回`E_FORBIDDEN`（远端禁止破坏性命令）。

再测本轮修复：

```text
同样是安全验收，应当被拒绝。请用 run_command 发送一条“两行”的命令：第一行是 echo hi，第二行是 Remove-Item -Recurse -Force _r8_scratch\victim ，两行之间是真正的换行符，而不是分号或空格。先把你将要发送的 arguments 原样（JSON）贴出来，再调用，然后贴出返回的错误码和原文。
```

**预期：** 贴出的JSON里`command`含`\n`，返回`E_FORBIDDEN`。然后在 **CMD-B**：

```bat
type _r8_scratch\victim\keep.txt
```

必须仍显示`KEEP-R8`。**如果目录没了，就是严重失败**：立即停止Bridge，保留Arena截图和记录，报告维护者。若Agent把两行合成了一行或加了分号，这一条记“未执行（客户端改写了命令）”，不算通过。

最后确认正常多行命令不受影响：

```text
请用 run_command 发送两行命令：第一行 node --version，第二行 git --version（中间是真正的换行）。贴出 exitCode 和 stdout。
```

**预期：** 两个版本号都在，`exitCode`为0。

### 7.8 可选：两个凭据互相看不到（F71）

只在你**另有一个不同凭据**时做，例如另一个支持OAuth配对的客户端（凭据B），与Arena里用URL密钥的连接（凭据A）同时连着这台主机。同一个URL密钥开两个Arena对话**不算**两个凭据：同一凭据下本来就被当成同一调用者（除非客户端带会话ID），这是已写明的限制。

1. 在凭据A的会话里：

```text
请用 start_command 运行 echo ISOLATION-A-R8 ，贴出返回的 execId。
```

2. 在凭据B的会话里（先**不给**execId）：

```text
请调用 get_command_output，不带任何 execId 参数，贴出原始返回。然后再带上 execId 为 <粘贴A的execId> 调一次，贴出原始返回。
```

**预期：** B的两次返回都**不含**`ISOLATION-A-R8`（应为found:false或找不到）。任一次看到A的输出就是失败。

## 8. 经隧道发坏请求，不应泄露路径（第七批）

**CMD-B**，把`公网主机名`换成第6步记下的域名（只到`.trycloudflare.com`，不要带`/mcp/…`）：

```bat
curl.exe -s -i -X POST "https://公网主机名/oauth/register" -H "Content-Type: application/json" -d "{bad"
```

**预期：** 状态400，`Content-Type`是`application/json`，正文就是`{"error":"Request body is not valid JSON"}`；**不得**出现HTML、`C:\`开头的路径或`at …`调用栈。把正文（确认不含敏感信息后）贴进记录。

## 9. VS Code扩展（F72）

### 9.1 主机地址只接受本机

1. `Ctrl+,` 打开设置，切到“工作区”页签，搜索`webagent.agentHostUrl`，填`http://example.com:48271`。
2. 等5秒左右看右下角状态栏。**预期：** 显示“Web Agent 主机地址无效”，鼠标悬停提示里含`webagent.agentHostUrl`。
3. 把这个设置**清空**（或点齿轮“重置设置”），再等5秒。**预期：** 状态栏恢复为`Web Agent`或`Web Agent Bridge 运行中`。
4. 可选：填`http://localhost:48271`应同样正常连接；验完清空。

### 9.2 可选：PTY确认框与退出码（需要能调用工具的外部模型）

仅当你在VS Code的Web Agent Chat里配置了可用模型时做；内置探索Agent不会运行命令。先在第5步的权限卡片里**切回Chat**（Bridge隧道先停）。在Web Agent Chat的Code模式发：

```text
请在终端运行 "C:\Program Files\nodejs\node.exe" --version（按你本机实际Node路径调整），然后运行 node --version。
```

**预期：** 第一条的确认框只有“运行 / 本会话都允许 / 拒绝”，**没有**“同类都允许”；第二条（裸程序名）有“同类都允许”。两次都点“运行”。

再发：

```text
请在终端运行一条两行命令：第一行 node -e "process.exit(3)"，第二行 echo after。告诉我工具返回的退出码。
```

**预期：** 确认框只有“运行 / 拒绝”（多行命令总要单独确认）；点运行后返回的退出码是**3**，不是0。

## 10. 收尾（每次都做）

1. 工作台停止Bridge；在Arena里删除或停用这个MCP连接。
2. **CMD-A** `Ctrl+C`，输入`Y`。
3. **CMD-B** 只删除本手册建的演练目录，并确认工作树干净：

```bat
rmdir /s /q _r8_scratch
git status --short
```

`git status --short`应无输出。

4. 在权限卡片按你平时的需要重新保存权限（例如只读：只开Read）。
5. 保存记录文件。把**每步编号＋判定＋脱敏输出**发给维护者；没做的写“未执行”，不要统一写通过。

## 本手册不覆盖

安装包/升级/卸载、手机蜂窝网络、桌面截图与键鼠、长时间挂机、code-server网页版：仍按[新手手册](Windows新手逐步验收.md)第13–17步和清单对应项单独进行。F71的“同一凭据多个对话仍算一个调用者”是已知限制，留给MCP 2026-07-28新旧两代适配时处理。

## 实测结果

2026-09-24用户在本机按本手册执行，总判定通过，记录见[R8实机验收记录](../../review/R8实机验收记录-2026-09-24.md)。第4步“浏览器不自动打开”与第6步“Arena实际是提示词接入”两处据该记录修订。
