# Skill: 修复失败的单元测试

当用户提到测试失败、除以零、calculator 时，按这个办法做。

## Ask
只读：`list_directory` → `search_files` → `read_files` → `get_diagnostics`。不要 `apply_patch`，不要 `run_command`。

## Plan
从同一起点开独立分支，互不看见对方答案。合并时写清共识与分歧。仓库保持不动。

## Code
1. `read_files` 取 `src/calculator.js` 的 sha256。
2. `apply_patch` 在 `divide` 里加入：

```js
if (b === 0) {
  throw new Error('Cannot divide by zero');
}
```

3. 失败不要部分写入。若 `STALE_FILE`，重新读取再打补丁。
4. `run_command`：`npm test`，确认 5/5。
