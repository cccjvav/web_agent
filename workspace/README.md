# ShunCode 演示工作区

这是挂在编辑器里的本机项目。Chat 模式在侧栏对话；Bridge 把同一套工具通过 MCP 交出去。

## 计算器

`src/calculator.js` 的 `divide` 在除数为 0 时抛出 `Cannot divide by zero`。  
`npm test` 覆盖加减乘除与该守卫。

## 内置 Skill

路径：`.shuncode/skills/fix-tests/`  
Skills 就是文件夹。把路径告诉模型即可，Bridge 也能用。
