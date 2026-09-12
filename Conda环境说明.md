# Windows + Conda：运行、维护、测试与验收

这是[使用指南](使用指南.md)的环境专项补充，不是另一套安装器。产品验收以[Windows 验收清单](review/CHECKLIST_WINDOWS.md)为准；理解代码从[代码复盘指南](代码复盘指南.md)进入。

## 1. 先分清三种“环境”

| 层 | 管理什么 | 本项目怎样使用 |
|---|---|---|
| Node.js + npm | Web Agent 服务、网页代码、扩展和测试 | 必须；依赖在 `webagent-core/agent-host/node_modules`，版本由 `package-lock.json` 锁定 |
| Conda | 你选择的 Python、原生库，也可选装 Node | 可以继续使用；不是必须换成 venv，更不需要激活 `.venv` |
| 被编辑的工作区 | 你的业务代码及其依赖 | 可以是 Python、JS 或其他项目；其测试与 Web Agent 产品测试是两回事 |

Web Agent 的产品入口是 `node src/index.js`，不是 Python 脚本；当前产品没有要用 pip 安装的根 `requirements.txt`。**不要为了运行 Web Agent 就在根目录执行 `pip install -r requirements.txt` 或安装 pytest。** 如果你的业务项目需要它们，请进入那个项目，按它自己的依赖文件安装。

下文命令面向 **Windows 的 Anaconda Prompt / Miniconda Prompt（CMD）**。不要直接复制到 PowerShell、Git Bash 或 WSL；CMD 的 `set`、`%变量%`、`cd /d` 与那些终端不同。路径和环境名是例子，要换成自己的。

## 2. 准备并确认实际解释器

### 2.1 优先复用已有环境

打开 Conda 自带的 Prompt：

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
npm --version
git --version
```

通过标准：Python 路径属于你选定的环境；Node 路径是你有意选择的安装位置，且 npm 能运行。`where` 可以列出多个候选，真正启动的是搜索顺序中的可执行项；`sys.executable` / `process.execPath` 是更直接的证据。

### 2.2 没有合适环境时再新建（可选）

```bat
conda create -n webagent-dev python=3.11
conda activate webagent-dev
```

`3.11` 只是业务 Python 环境示例，不是 Web Agent 的 Python 版本要求。已有项目应以它的 Python 兼容约束为准。

Node 有两种选择，**选一种作为主要来源**：

- 推荐新手：系统安装 Node.js 22（含 npm），Conda 只管理 Python。Node 22 与当前 Windows CI 配置一致；包声明的 `>=18` 是最低约束，不代表建议安装过旧版本。
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

在已激活的 Prompt 中进入**仓库根**：

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

若 Node 只安装在 Conda 环境中，资源管理器双击的快捷方式**不保证能找到它**。先激活环境，再从同一个 Prompt 调用安装目录中的入口，例如：

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

上面是你在 Conda Prompt 中的示例。若 Agent 的 PowerShell 找不到 `conda`，使用第 2 节确认的可执行文件**绝对路径**（下面示例路径必须替换），PowerShell 调用带空格的路径需要 `&`：

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

均从全新打开的 Prompt 开始；记录日期、`git rev-parse HEAD`、Windows/浏览器/VS Code 版本、Conda 环境名、Node/npm/Python 版本。日志中删去 Token、API Key、含密钥的 MCP URL 和个人路径。

| 编号 | 操作 | 通过条件／证据 |
|---|---|---|
| E1 | 按第 2 节激活并诊断 | Python 路径属于所选环境；Node/npm 与预期一致；保存脱敏文本 |
| E2 | 按第 3 节安装、启动经典壳，创建并保存验收文件 | 页面可用，磁盘内容一致；记录启动方式和工作区 |
| E3 | 在实际 Agent 执行路径诊断 Python，再用 `conda run` 重复 | 路径正确；报错/审批/超时不能算通过；PTY 路径另做一次，不用经典命令结果替代 |
| E4 | 按第 6 节跑全量测试 | 退出 0、所有文件通过；记录文件数和日志，不用绿色启动页替代 |
| E5 | 保存后停服务，关闭 Prompt，新开 Prompt 重复激活和启动 | 无需依靠之前窗口的偶然环境；解释器仍正确。若承诺双击启动，再单独验证快捷方式 |
| E6 | 在 4173 检查本说明、源码讲解、中文锚点；再跑产品人工清单 | 记录人工清单各项的通过/失败/未执行，不能只填“全部正常” |

若业务工作区是 Python 项目，再按那个项目的真实测试命令验证一次（例如它确实使用 pytest 且已安装，才运行 `conda run -n 环境名 python -m pytest`）。这份结果与 Web Agent 的 `npm test` 分开记录。

**结论模板：** E1 通过，E2 通过，E3 经典通过/PTY 未执行，E4 失败（附文件名与退出码），E5 未执行，E6 未执行。未执行不等于失败，但更不等于通过。
