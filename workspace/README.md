# ShunCode 演示工作区

这是挂在编辑器里的本机项目。Chat 模式在侧栏对话；Bridge 把同一套工具通过 MCP 交出去。

## 故意留下的缺陷

`src/calculator.js` 的 `divide` **没有除以零守卫**。  
`tests/calculator.test.js` 期望抛出 `Cannot divide by zero`。

建议路径：

```
Ask 诊断 → Plan 多模型博弈（意见一致再行动）→ Code apply_patch → npm test
```

Ask / Plan 只读。只有 Code 才能改文件、跑终端。

## 内置 Skill

路径：`.shuncode/skills/fix-tests/`  
Skills 就是文件夹。把路径告诉模型即可，Bridge 也能用。
