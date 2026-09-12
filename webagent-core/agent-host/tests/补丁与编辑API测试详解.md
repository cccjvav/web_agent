# 补丁冲突、搜索上限与编辑器HTTP存储测试

两文件都使用真实临时磁盘；不读写用户仓库文件。原子替换失败等补充证据见[存储完整性与预算测试](存储完整性与预算测试详解.md)。

## patchEngine.test.js

[源码](patchEngine.test.js)异步**main**按链构造fixture，无额外测试框架；每个try/catch仅把期望错误转布尔，紧接assert，防没有抛错也被当成功。

| 链与输入 | 调用/结果/不变量 |
|---|---|
| sample.js含add | readFile返回hash和正文，SEARCH/REPLACE按hash改为Number(a)+Number(b) |
| 携旧read.hash反改 | STALE_FILE；随后省expectedHash改为减法可复用最近patched hash |
| 从未读的orphan.js | HASH_REQUIRED并detail.currentHash；提示不等于自动解锁覆盖 |
| 正确hash但SEARCH不存在 | Patch conflict |
| grep/find | 普通function add可找，(a+)+ regex拒ReDoS；五文件max3→三项truncated，恰三文件max3→非truncated |
| 2MiB大文件/needle/含NUL二进制 | needle仍找到，skippedLarge≥1，二进制跳过或零匹配 |
| 新文件unified diff | 拒且不创建；空SEARCH的REPLACE、纯正文可新建并标isNewFile |
| CRLF win.js | LF写法SEARCH能匹配，结果精确等于全CRLF预期，不只检查含一个CRLF |
| dup.js有两处相同SEARCH | 默认拒matched 2 times且原文不变，occurrence:2只改第二处 |
| race.js同hash两Promise并发补丁 | allSettled筛选恰一success、一STALE_FILE，结果只能2或3，不能混合 |
| V4A *** Begin Patch | looksLikeV4A识别；已有文件E_BAD_ARGS/V4A且retryHint提SEARCH，原文保持；新文件也拒且不存在 |

computeHash导入但本文件没有直接调用，版本来自readFile；样例正文里的add不是测试辅助函数，也未执行该JS计算结果。成功rm tmp，main.catch打印exit1，无finally；并发只测一个Node进程内锁，不能外推跨进程协同或断电一致性。

## apiFiles.test.js

[源码](apiFiles.test.js)的**request(server,method,urlPath,body)**真实本机HTTP，按JSON字节设长度，data累计、end解析（坏JSON为null）、error reject。异步**main**搭Express JSON/API路由，随机端口，workspace指tmp。

1. PUT notes.md：200/success/hash，磁盘正文准确且无.tmp.残留。
2. PUT .env：≥400且敏感/ACCESS_DENIED等错误，文件不存在；PUT ../outside.txt：≥400/outside。
3. PUT已有notes携deadbeef：409/STALE_FILE，原正文保持，防UI冲突静默覆盖。
4. POST skills demo-skill：200且真实SKILL.md存在；GET列表有demo、相对skillFile与绝对skillFileAbs。
5. GET notes：原文和hash返回，供下一次编辑版本控制。
6. POST model完整元数据和假apiKey，GET status：模型存在，group/contextSize/caps/pricing保留，hasKey真但无apiKey字段。测试仅保存/脱敏，不访问模型baseUrl。

finally关server、rm tmp；catch exit1。这里直挂router，不是完整index的Origin/Host保护测试，也不运行浏览器编辑器；并发保存与dirty保留另见editorRuntime。

## 验证

分别filter patchEngine/apiFiles，或`npm test --prefix webagent-core/agent-host`。CRLF fixture能在Linux执行，不代表真实Windows权限、杀毒软件占用或编辑器焦点验收。
