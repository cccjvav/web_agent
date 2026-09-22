# Skill: 测绿就提交

当改产品源码、测试已绿，或用户说「及时提交」「不要攒」「补回来」「沙盒丢了未提交」时，按这个办法做。不要等「全部修复结束」才 commit，也不要等全部结束才写 Skill。

**教训（真发生过）：** 沙盒/工作树被 `git reset --hard` 或会话重建后，**未 commit 的改动会整棵丢掉**。GitHub PAT、用量、admin-host、工作台诚实 UI 曾因此要重写一遍。已经 push 到当前分支的提交还在。

## Ask

只读：`git status`、`git diff`、最近测试输出。不要 `apply_patch`，不要 `git commit`。

## Plan

列出将进哪一次 commit 的文件（宁可小包、多次）。不要把无关的大重构塞进同一包。仓库保持不动。

## Code

1. **一块测绿就提交。** `cd webagent-core/agent-host && npm test`（或根目录 `run-tests.cmd`）通过后，立刻 `git add` 这一块相关文件 → `git commit` → `git push origin` **当前会话分支**（以当前Arena会话提供的固定分支为准，不沿用历史会话名）。不要等 GitHub + 用量 + admin + 假 UI + 文档 + Skill 攒成一次超大提交。
2. **未跟踪的新文件必须 `git add`。** 只改已跟踪文件却忘了 add `src/auth/` 这类新目录，reset 后一样没了。
3. **不要用工作区当备份。** `.webagent/config.json` 进 gitignore；PAT 本来就不该落盘。至少保留**已成功push且核对远端SHA的commit**；工作文件、本地Git对象与依赖可能分别恢复，不能仅凭旧的commit输出断言当前对象还在。
4. **写 Skill 也可以在中途。** 用户点名「记成教训」时立刻写，不要放到全部功能做完。本文件就是这条规则本身。
5. **push 只推当前分支。** 不切 `main`，不开别的分支名。
6. 推送失败须明确区分“文件已保存/本地提交/远端已推”；GitHub认证错误请用户在Arena重连，不索取密码或令牌。恢复前先核对并备份现有改动，不用reset --hard/git clean来消除状态差异。

禁止：测红还 commit；把 `node_modules/`、`bin/code-server-dist/`、`image-search/`、真实 PAT、`admin-host/data/` 加进提交；为了「一次交齐」把已绿的块继续留在工作树。

提交信息写这一块实际做了什么（中英均可），不要写「WIP 全部做完再改」。
