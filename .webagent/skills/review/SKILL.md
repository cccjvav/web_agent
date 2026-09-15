# Skill: review

当用户提到审查、code review、找风险、看 diff、合并前检查时，按这个办法做。默认只读。

## Ask

只读：`git_status` → `git_diff` → `list_directory` → `search_files` → `read_files`。不要 `apply_patch`，不要 `write_file`，不要 `run_command`。

## Plan

从同一起点列出风险与建议，互不改仓库。写清：会坏的路径、缺测试、敏感文件、权限/注入。

## Code

用户明确说「按审查意见改」之后才动手。

1. `workspace_info` 看根目录、技术栈、测试命令。
2. `git_status` / `git_diff`。不是 git 仓库时会返回 `available:false`，改用 `list_directory` + `search_files`，不要擅自 `git init`。
3. `read_files` 打开改动文件（记下 sha256）。
4. 输出审查：按文件列出问题（严重 / 建议 / 风格），每条给路径+原因+改法。不要空夸。
5. 只有用户要修时：`apply_patch`（可复用刚读的 hash）→ 跑工作区声明的测试命令。
