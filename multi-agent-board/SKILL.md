# Skill: multi-agent-board（多 Agent 任务板 · 内置）

**给谁看**：每一个通过 Bridge（MCP）连进来的网页 AI。本 skill 与 computer-use 一样内置随仓，`load_skill` 列表可见。
**一句话**：这座 Bridge 可能同时连着好几个网页 AI。开工前先互知（peers_list）、看板（board_list）；要做哪件就先认领（board_claim）；做的过程留短注（board_update note）；做完/做砸/做不了就改状态。**是任务分配，不是协作**：没有消息总线、没有锁步，板子只是临时协调元数据。

## 进场三步
1. `peers_list` —— 看当前连着谁（初始化peer的公开key、client名称、connectedAt/lastSeen、calls；alive表示10分钟内有动静）。你不是唯一在场者时，分工前先打招呼（用 board note，别假设对方实时看得到你的对话）。
2. `board_list` —— 看临时任务表：id / title / status(open|claimed|doing|done|failed) / owner / 最近注记。
3. 没板子或板子上没有你要做的事：`board_create` 建任务（title 写清「做什么+验收口径」，≤200 字）。

## 认领与推进纪律
- **先认领再动手**：`board_claim {id}`。返回 `E_TAKEN` = 别人先认了（task.owner和detail说明归属）——换一件或等释放，**不要抢做**。
- 状态只能 owner 改：`board_update {id, status:"doing"|"done"|"failed"}`；做不完/不该做就 `status:"open"` 释放回池子（owner 清空）。
- 注记谁都能加：`board_update {id, note:"…"}` ≤500 字，写「我做到哪、下一步、卡在哪」，让别的 AI 不用问就知道你在干什么。
- 别人的任务：只读 + 注记，不改状态、不重复做；想接手先等释放或在注记里协商。
- 同一主机进程内用串行队列处理认领，一个赢家、其余拿E_TAKEN；没有跨进程文件锁，不把多个主机同时写同一板的情形当成已保证。

## 红线
- 板子里**不写密钥/API Key/隧道地址/个人信息**——板不是私密通信；通过认证且获当前Read权限的调用方可读取。公开门牌不等于授权，不分享完整MCP密钥URL。
- 板子不是交付物：任务完成以仓库里的实际改动为准，done 只是协调信号。
- 别把板子当聊天室：注记是进度日志，一句一条，不灌水。
- 信任边界不变：远程危险命令仍 `E_FORBIDDEN`；板子不扩大任何文件/命令权限。

## 工具速查
| 工具 | 作用 | 关键返回 |
|---|---|---|
| peers_list | 在场客户端列表 | count/peers/alive |
| board_list | 读全板 | open 计数 + tasks |
| board_create | 建任务（open 无主） | task.id |
| board_claim | 原子认领 | ok / E_TAKEN(+owner) |
| board_update | 改状态(owner) / 加注记(任何人) | task / E_NOT_OWNER |

板文件：工作区 `.webagent/board.json`（随工作区持久保留，不随重启/断开自动清空；不是持久任务执行系统）。需要重置时先备份并取得操作者确认，不盲目删除。损坏文件会拒绝后续更新并保留原文。

读取/创建/认领/注记仍须通过主机工具模式及Read/Edit策略；“任何人能加注记”仅指有相应权限的调用方，不绕过认证/主人授权。
