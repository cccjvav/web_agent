# Windows + Conda：运行、维护、测试与验收

这是[使用指南](使用指南.md)的环境专项补充，不是另一套安装器。产品验收以[Windows 验收清单](review/CHECKLIST_WINDOWS.md)为准；理解代码从[代码复盘指南](代码复盘指南.md)进入。

第一次实际操作，先按[Windows新手逐步验收](Windows新手逐步验收.md)的顺序执行；本文用来查环境原理与排障。用户已确认完整重启VS Code后npm/npx恢复，旧PATH问题已解决；其他验收项仍须实际记录。

## 1. 先分清三种“环境”

| 层 | 管理什么 | 本项目怎样使用 |
|---|---|---|
| Node.js + npm | Web Agent 服务、网页代码、扩展和测试 | 必须；依赖在 `webagent-core/agent-host/node_modules`，版本由 `package-lock.json` 锁定 |
| Conda | 你选择的 Python、原生库，也可选装 Node | 可以继续使用；不是必须换成 venv，更不需要激活 `.venv` |
| 被编辑的工作区 | 你的业务代码及其依赖 | 可以是 Python、JS 或其他项目；其测试与 Web Agent 产品测试是两回事 |

Web Agent 的产品入口是 `node src/index.js`，不是 Python 脚本；当前产品没有要用 pip 安装的根 `requirements.txt`。**不要为了运行 Web Agent 就在根目录执行 `pip install -r requirements.txt` 或安装 pytest。** 如果你的业务项目需要它们，请进入那个项目，按它自己的依赖文件安装。

下文默认你的实际使用方式：**Windows 桌面 VS Code → 集成终端 Command Prompt（CMD）→ `conda activate`，复用本机已安装的 Node.js/npm**。Anaconda Prompt 仅用于对照诊断，不要求改用它。不要直接复制到 PowerShell、Git Bash 或 WSL；CMD 的 `set`、`%变量%`、`cd /d` 与那些终端不同。路径和环境名是例子，要换成自己的。

## 2. 准备并确认实际解释器

### 2.1 优先复用已有环境

在 VS Code 命令面板执行 `Terminal: Select Default Profile`，选择 **Command Prompt**，关闭旧终端并新建终端。选择的是 CMD 终端，不是 Python 解释器选择器；后者不保证 Node/npm 可用。

在该集成 CMD 终端逐条执行：

```bat
conda info --envs
conda activate 你的环境名
cd /d "D:\projects\web_agent"
where conda
where python
python -c "import sys; print(sys.executable); print(sys.version)"
where node
node -p "process.execPath"
node --version
where npm
where npx
npm --version
npx --version
git --version
```

通过标准：Python 路径属于你选定的环境；Node 路径是你有意选择的安装位置，且 npm 能运行。`where` 可以列出多个候选，真正启动的是搜索顺序中的可执行项；`sys.executable` / `process.execPath` 是更直接的证据。

### 2.2 VS Code 中 npm/npx 不可用，而 Anaconda Prompt 可用

**这是两个 shell 的命令查找环境不同的现象，不能仅凭它判断 Conda 或 Node 损坏。** Anaconda Prompt 通常也是经 Conda 初始化的 CMD，但启动入口、父进程环境、激活脚本可能不同。Conda 激活会调整 PATH，不等于容器隔离，也不会必然隐藏系统 Node。

先分别在 **VS Code 集成 CMD** 和 **能正常使用 npm 的 Anaconda Prompt** 中执行下列命令，尽量激活同一个环境；再比较激活前后结果。每条独立执行，失败也保留报错：

```bat
echo %COMSPEC%
echo %CONDA_PREFIX%
where conda
where node
where npm
where npx
node -p "process.execPath"
node --version
npm --version
npx --version
echo %PATHEXT%
```

`npx --version` 只查版本，不执行或下载项目包。`where` 可能列出多个候选；比较其完整路径，不要只比较版本号。必要时本地查看 `echo %PATH%`，不要把完整环境变量或含个人路径/凭据的日志原样公开。

| 观察结果 | 含义与下一步 |
|---|---|
| VS Code 中 node/npm/npx 全找不到，Prompt 能找到 | 优先怀疑 VS Code 继承旧 PATH 或终端配置覆盖；先按下面顺序重启核对 |
| 两边 node 的实际路径不同 | 使用了系统、Conda 或版本管理器中的不同安装；先确定要用哪一个，不急着重装 |
| node 能运行，where npm/npx 无结果 | node.exe 所在目录未必有 npm.cmd/npx.cmd；检查实际安装是否完整，不能仅凭 node 存在就认定 npm 已装好 |
| 激活前正常，激活后不正常 | 检查该环境的激活脚本、环境变量或重复 Node 安装，是否覆盖而非追加 PATH |
| npm.cmd 能运行但 npm 不行 | 检查 PATHEXT 是否包含 .CMD，以及 CMD 宏/命令同名冲突；不要盲目重置整个 PATHEXT |
| 提示 npm.ps1 禁止运行 | 这是 PowerShell 脚本策略问题，不是当前 CMD 的“不是内部或外部命令”；先确认实际 shell，勿为此全局放宽执行策略 |

**按风险从低到高修复，每步之后重跑路径诊断：**

1. 保存文件，停止正在使用的服务，**完全退出所有 VS Code 窗口和相关 Code.exe 进程**，再从开始菜单重新打开。安装 Node 或修改 PATH 之后，只新建终端或 Reload Window 不一定刷新 VS Code 父进程环境。不应强杀有未保存内容的进程。
2. 在 VS Code 用户设置和工作区设置中检查 `terminal.integrated.env.windows`、`terminal.integrated.profiles.windows`，是否把 PATH 写死、置空，或指定了特殊启动脚本。记录原配置，只修具体覆盖项，不整份删除设置。
3. 在能够运行 npm 的 Prompt 中根据 `where node/npm/npx` 确认安装目录。例如只有在确认 `C:\Program Files\nodejs` 确实包含 node.exe、npm.cmd、npx.cmd 后，才可在 VS Code CMD 做临时验证：

```bat
set "PATH=C:\Program Files\nodejs;%PATH%"
where node
where npm
where npx
node -p "process.execPath"
npm --version
npx --version
```

   该路径仅是常见例子，不适用于所有安装/版本管理器；要换成已查明的实际目录。此 `set` 仅影响当前 CMD 和随后启动的子进程，不修复父 VS Code 的环境。
4. 若临时补 PATH 后恢复，使用 Windows“编辑账户的环境变量”在适当的用户/系统 Path 中检查并补上**已确认的 Node 安装目录**，保留其他条目，然后完整重启 VS Code。不要用 `setx PATH "%PATH%;..."`，它可能展开、重复甚至截断现有值；也不要添加整个 Conda 环境来凑 PATH。
5. 若实际 Node 目录缺 npm.cmd/npx.cmd，才考虑用所选 Node 安装器修复 npm 组件；版本管理器安装则按其机制修复。不要首先执行 `npm install -g npm`、删除 Conda 环境或再装第二套 Node。

补充对照：完全退出 VS Code 后，在可用的 Anaconda Prompt 里执行 `code .`，若新开的 VS Code 终端可用，则支持“继承环境不同”的判断；**这只是诊断，不是要求你以后必须从 Prompt 启动**。如果 Code 已在后台运行，`code .` 可能复用旧进程，比较无效。

如果 CMD 中连 `conda activate` 都不可用，才另行处理 Conda 的 CMD 初始化：可在能找到 Conda 的 Prompt 中执行 `conda init cmd.exe`，再完整重启 VS Code。该命令会修改 shell 初始化配置，不是 npm 修复命令；你已经能正常激活时不必重复执行。

### 2.3 没有合适环境时再新建（可选）

```bat
conda create -n webagent-dev python=3.11
conda activate webagent-dev
```

`3.11` 只是业务 Python 环境示例，不是 Web Agent 的 Python 版本要求。已有项目应以它的 Python 兼容约束为准。

Node 有两种选择，**选一种作为主要来源**：

- 按你的现有配置优先复用系统安装的 Node.js（含 npm），Conda 只管理 Python，不因 PATH 问题重复安装。若需要新装，推荐 Node.js 22。Node 22 与当前 Windows CI 配置一致；包声明的 `>=18` 是最低约束，不代表建议安装过旧版本。
- 希望连 Node 也隔离：在当前环境执行下面命令。渠道需要联网；若渠道不可达或包解算失败，先修复 Conda 配置，不要随意叠加不明渠道。

```bat
conda install -c conda-forge nodejs=22
where node
node -p "process.execPath"
node --version
npm --version
```

当前 Linux CI 使用 Node 20，Windows CI 使用 Node 22；这不是“所有 Node 版本均已验收”。本轮沙箱没有 Conda，也没有 Windows 桌面；以上 Conda 路径仍需要按第 7 节在本机实测。

## 3. 从源码运行

### 3.1 安装产品依赖

在已激活的 VS Code 集成 CMD 中进入**仓库根**：

```bat
cd /d "D:\projects\web_agent"
npm ci --include=dev --prefix webagent-core/agent-host
```

每条命令结束先看结果，失败就停止，不要把后续启动成功当作安装成功。`npm ci` 按锁文件重建该包的 `node_modules`，不会重建 Conda 环境；`--include=dev` 确保文档校验所需的 Acorn 也安装了。纯运行启动器可能只装生产依赖，不能据此认为文档测试依赖齐全。

### 3.2 创建独立验收工作区并启动

```bat
mkdir "%USERPROFILE%\WebAgent-acceptance"
run-webagent.cmd "%USERPROFILE%\WebAgent-acceptance"
```

目录已存在时不必重复 `mkdir`。从这里启动的经典工作台，默认在浏览器打开 `http://127.0.0.1:3000`；保留启动窗口以便看错误和停止服务。验收中只编辑该临时目录，不用你的重要项目练手。

若要网页 VS Code 模式，先停止上一种模式，再运行：

```bat
run-webagent-vscode.cmd "%USERPROFILE%\WebAgent-acceptance"
```

这会走 code-server 编排，首次下载还需要网络。不要同时运行两种壳，它们默认使用相同端口。下载失败、缺 PTY 后端或浏览器无法打开，应分别记录，**不要用“Node 能运行”推断这些功能通过**。遇到平台不兼容，保留日志；桌面 VS Code + 侧载扩展是另一条需单独验收的路径，见[扩展说明](webagent-core/extension/README.md)。

### 3.3 安装版与快捷方式

安装版不适合做源码开发/全量测试：测试文件并非完整随包交付。修改和测试应在 Git checkout 中进行。

若 Node 只安装在 Conda 环境中，资源管理器双击的快捷方式**不保证能找到它**。先激活环境，再从同一个已核验的 CMD 调用安装目录中的入口，例如：

```bat
conda activate webagent-dev
call "C:\Program Files\WebAgent\run-webagent.cmd" "%USERPROFILE%\WebAgent-acceptance"
```

安装位置可能不同，以你的实际位置为准。不要把整个 Conda 环境目录永久塞进系统 PATH 来“修复”所有快捷方式；这容易混用 Python 和 DLL。桌面 VS Code 已在后台运行时，也可能沿用旧进程的环境；保存所有文件、退出相关 VS Code 窗口后，再从激活后的 Prompt 启动，随后仍要在实际终端核对解释器。

## 4. Agent 命令不等于你的 Prompt

**激活只影响当前 shell 及其之后启动的子进程。** 经典命令执行器在 Windows 新建 `powershell.exe -NoProfile -NonInteractive`；它保留大部分环境变量，但移除名称符合凭据规则的变量。没有加载 Profile，就不能假设 PowerShell 已初始化 `conda activate`。PTY 路径还受 VS Code 进程、所选终端及 shell integration 影响。

先在本机工作台请求执行无副作用诊断：

```text
python -c "import sys; print(sys.executable)"
```

核对输出是否与第 2 节相同。只看到 UI 上的环境名、`CONDA_PREFIX` 或提示符，不足以证明实际 Python 正确。

更确定的方式是在每次独立命令里使用 `conda run`：

```bat
conda run -n webagent-dev --no-capture-output python -c "import sys; print(sys.executable)"
```

上面是你在 VS Code 集成 CMD 中的示例。若 Agent 的 PowerShell 找不到 `conda`，使用第 2 节确认的可执行文件**绝对路径**（下面示例路径必须替换），PowerShell 调用带空格的路径需要 `&`：

```powershell
& 'C:\Users\你的用户名\miniconda3\Scripts\conda.exe' run -n webagent-dev --no-capture-output python -c "import sys; print(sys.executable)"
```

前缀环境可用 `conda run -p '环境绝对路径' ...` 代替 `-n`。`--no-capture-output` 让运行中的输出直接传出，不是取消超时。产品自身的命令时限仍生效。

不要在第一次 `run_command` 中激活、第二次调用中就假定仍然激活；独立调用通常是新进程。`conda run` 在指定环境执行命令，不会永久改变父进程的环境。也不要为了跑环境命令绕过本地审批；遇到拒绝先看策略说明，勿改为远程执行危险操作。

## 5. 日常维护与恢复

| 操作 | 做法 | 注意 |
|---|---|---|
| 开始工作 | 激活环境，确认解释器，进入仓库 | 系统/Conda 双 Node 并存时尤其要检查 |
| 同步项目 | 先 `git status`，保存个人改动，再按分支策略同步 | 不要为更新代码强行 reset/删除工作区 |
| npm 锁文件变化 | 重跑第 3.1 节 `npm ci`，再测产品 | `conda update` 不能代替 npm 依赖安装 |
| 增加 Python 依赖 | 在业务环境按业务项目依赖文件安装 | 不往 Web Agent 产品包混装 Python 依赖 |
| Node 主版本变化 | 检查实际路径，重装该包依赖并全量回归 | 不混用另一个平台拷来的 node_modules |
| 出现坏配置 | 停服务，备份原配置，保留报错再诊断 | 不直接删 `.webagent`；它可能含密钥及用户状态 |
| 升级/卸载 | 按验收清单 D2–D4 | 用户运行时与工作区不会因为卸载就都消失 |

可在**仓库外**保存环境清单，方便复现：

```bat
mkdir "%USERPROFILE%\WebAgent-evidence"
conda env export --from-history > "%USERPROFILE%\WebAgent-evidence\environment-history.yml"
conda list --explicit > "%USERPROFILE%\WebAgent-evidence\conda-explicit-win.txt"
conda list --revisions
```

`--from-history` 记录显式请求的 Conda 依赖，不是所有传递依赖或 pip 包的锁文件；必要时另保存完整 `conda env export`，检查其 pip 节。`--explicit` 更接近当前平台的包清单，不能拿 Windows 导出直接保证 Linux 重建。导出可能含用户名、prefix、私有渠道 URL 或凭据，分享前必须检查并脱敏；不要直接提交。

恢复时优先用备份清单创建**新的测试环境**、核对解释器并测试，确认没问题后才替换日常环境。`conda install --revision 编号` 只涉及 Conda 的修订记录，不负责回滚源码、npm 或全部 pip 改动。不要把删除环境当成第一排障步骤。

## 6. 产品测试与文档维护

以下均在仓库根的已激活 Prompt 运行，每条成功再继续：

```bat
node docs-site/check-docs.js
npm test --prefix webagent-core/agent-host
echo %ERRORLEVEL%
```

通过标准：校验退出 0，runner 汇总没有失败文件，测试退出 0。文件数以当前输出为准，不照抄旧报告数字。筛选测试只用于定位，不替代全量：

```bat
npm test --prefix webagent-core/agent-host -- --filter=installerPackaging
```

如果要保留测试日志：

```bat
npm test --prefix webagent-core/agent-host > "%USERPROFILE%\WebAgent-evidence\product-tests.txt" 2>&1
set "TEST_EXIT=%ERRORLEVEL%"
type "%USERPROFILE%\WebAgent-evidence\product-tests.txt"
echo TestExit=%TEST_EXIT%
```

先创建 evidence 目录；`set TEST_EXIT` 必须紧接测试，不能在中间插别的命令。先检查原始状态再使用生成器；否则 `--write` 会更新清单，让你看不见原来的漂移。

修改源码/文档后，完成正文审查再执行：

```bat
node docs-site/check-docs.js --write
node docs-site/build.js
node docs-site/check-docs.js
npm test --prefix webagent-core/agent-host
git diff --check
git status --short
```

本地查看文档：

```bat
node docs-site/serve.js
```

访问 `http://127.0.0.1:4173`。它只提供文档，不会启动产品，也不会激活 Conda。默认本机监听即可；不要为了手机 MCP 把工作台或文档服务器公开。

## 7. Conda 专项验收（E1–E6）

均从重新启动的 VS Code、新建的集成 CMD 终端开始；记录日期、`git rev-parse HEAD`、Windows/浏览器/VS Code 版本、Conda 环境名、Node/npm/Python 版本。日志中删去 Token、API Key、含密钥的 MCP URL 和个人路径。

| 编号 | 操作 | 通过条件／证据 |
|---|---|---|
| E1 | 在 VS Code 集成 CMD 按第 2 节激活并诊断；出现差异时对照 Anaconda Prompt | Python 路径属于所选环境；node/npm/npx 路径与版本符合选择；记录激活前后结果及启动方式 |
| E2 | 按第 3 节安装、启动经典壳，创建并保存验收文件 | 页面可用，磁盘内容一致；记录启动方式和工作区 |
| E3 | 在实际 Agent 执行路径诊断 Python，再用 `conda run` 重复 | 路径正确；报错/审批/超时不能算通过；PTY 路径另做一次，不用经典命令结果替代 |
| E4 | 按第 6 节跑全量测试 | 退出 0、所有文件通过；记录文件数和日志，不用绿色启动页替代 |
| E5 | 保存后停服务，完全退出 VS Code，重新打开集成 CMD 重复激活和启动 | 无需依靠之前窗口的偶然环境；解释器仍正确。若承诺双击启动，再单独验证快捷方式 |
| E6 | 在 4173 检查本说明、源码讲解、中文锚点；再跑产品人工清单 | 记录人工清单各项的通过/失败/未执行，不能只填“全部正常” |

若业务工作区是 Python 项目，再按那个项目的真实测试命令验证一次（例如它确实使用 pytest 且已安装，才运行 `conda run -n 环境名 python -m pytest`）。这份结果与 Web Agent 的 `npm test` 分开记录。

**结论模板：** E1 通过，E2 通过，E3 经典通过/PTY 未执行，E4 失败（附文件名与退出码），E5 未执行，E6 未执行。未执行不等于失败，但更不等于通过。
