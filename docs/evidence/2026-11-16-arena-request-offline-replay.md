# 旧研究请求离线对照回放

## 范围与结论

对应[活动任务 T2d-CR](../tasks/2026-11-12-arena-replay-live.md)和[规格 AC09](../specs/2026-11-12-arena-replay-live.md)。2026-11-16 按用户授权只读检查当前运行补丁，再以旧冻结请求、既有输出和固定响应验证合同与等待边界。未调用真实模型、远程行情、身份探针、比赛启动或重试；未部署、操作队列或改写业务数据。

结论：当前 Server／Worker 均包含工具能力修正，历史合法输出兼容、不可用工具提前拒绝、SDK 合同一致、长度截断拒绝及工具等待顺序通过。真实模型是否停止重复生成仍未验证，本报告不证明循环根因或比赛追平。

## 当前运行补丁

两容器均已在上次部署验收后重建，不能仅沿用旧容器的证据。本轮实际检查：

| 角色 | 容器 ID | 本次启动时刻（UTC） | 健康 |
| --- | --- | --- | --- |
| Server | `00d1dd669ae287258490a119c865750bce9f4a0cb30236dc4e8cab81a2acfb9d` | `2026-11-15T16:21:49.50892692Z` | `healthy` |
| Worker | `a183e87b459a40b59160c2821a13ab8a79b8350489a5d4dbbf2255e66893be6f` | `2026-11-15T16:21:49.286493545Z` | `healthy` |

镜像均为 `sha256:145d6f91a4ef7c3eaac801f26c89ac42fa446ccfb24c54ff67c03d8b87f0e4c2`。在两容器中直接导入实际编译的合同与消息构造器，四种回放／实时、网页授权开／关组合全部通过。回放仅提供证券搜索、报价及分钟 K 线／指标；实时按冻结授权提供新闻和网页；财务始终排除。提示 Schema、用户能力与合同一致，等待边界存在，冻结授权未被改写。

以下产物在两容器中完全相同，本轮结束时仍未变化。路径前缀：`/app/apps/server/dist/src/model-arena/live/`。

| 产物 | SHA-256 |
| --- | --- |
| `live-research-contract.js` | `041a6f5dc37ebbda1931272f1bd6c0cf6004dfdfbcd98d404b18022b00186556` |
| `live-research-messages.js` | `a6ac5d81a78586cf3fd630844c5630e94400efd4ec4fef581935a8ed3f45cde8` |
| `live-research-call.js` | `f2fab5d7d6bfa8504f355f1b5ccdab6de0635e96ab43fc99661c4e105f478906` |
| `live-research-runner.js` | `370dea6b54af92183894b413a4f301d8e6f5137128d5d7451d4e49258be63022` |

消息文件较[上次部署证据](2026-11-15-arena-tool-capability-local-deployment.md)已有其他任务的更新，本轮以当前实际产物为准。本轮没有重新部署或证明镜像已经包含这次快更。

## 只读验收入口与隔离方式

新增宿主入口 [`arena-request-offline-replay.mjs`](../../scripts/local-runtime/arena-request-offline-replay.mjs)，仅允许 `server|worker` 两个固定容器目标。通过只读 `docker exec -i` 将[检查模块](../../scripts/local-runtime/arena-request-offline-replay-checks.mjs)交给容器中的 Node 解释执行；不写容器文件、不启动应用、不加载真实 Provider 配置。

检查先在 PostgreSQL 事务中执行 `SET TRANSACTION READ ONLY`，只读取指定比赛的冻结周期和审计记录，随后断开真实数据库客户端。此后 Runner 使用独立内存数据库、额度、工具及订单替身；租约更新也只命中内存替身。工具成功数据来自旧消息中的 `toolResults`，不可用分支使用明确的受控异常。

SDK 使用实际部署的 `AiSdkGenerationAdapter`，传输层完全替换为固定内存响应：目标为 `https://offline.invalid/v1`，不使用凭据；全局 `fetch` 一旦被调用就立即抛错。每个固定响应均断言只经过一次注入传输，没有自动重试。报告中的 93 次是固定响应解析检查，不是 93 次模型调用。模拟用量固定为 1，不模拟旧模型推理消耗，也不恢复未留存的采样和聊天模板实参。

工作目录为主仓；最终命令均退出 0：

```sh
rtk proxy node scripts/local-runtime/arena-request-offline-replay.mjs server
rtk proxy node scripts/local-runtime/arena-request-offline-replay.mjs worker
rtk proxy node --check scripts/local-runtime/arena-request-offline-replay.mjs
rtk proxy node --check scripts/local-runtime/arena-request-offline-replay-checks.mjs
rtk proxy /Users/yzin/.volta/bin/pnpm exec prettier --check scripts/local-runtime/arena-request-offline-replay.mjs scripts/local-runtime/arena-request-offline-replay-checks.mjs
```

本轮未修改生产代码或依赖，未重复构建、全量测试或部署。上次 82 项定向检查作为历史实现证据保留，本轮新增结论来自当前运行产物及实际历史样本。

## 四组旧请求对照

时间按 Asia/Shanghai 显示。使用[既有审计](2026-11-15-arena-request-constraints-offline-audit.md)的四组请求，不为获得通过结果改写旧工具、账户或时点。

| 回放时刻 | 原截断请求 | 旧正常 JSON 对照 | 新合同下的对照结果 |
| --- | --- | --- | --- |
| 11 月 3 日 10:45 | `6c066acb-a259-4499-ac44-05fdae74517e` | `dc4a5e96-537d-4e62-ac1d-8941dd14a8af` | 报价工具请求通过 |
| 11 月 6 日 14:30 | `53368c38-2223-4e6f-963f-70b3bbccac6e` | `d799edb9-545b-4c5a-9d6b-c356207364f7` | 报价工具请求通过 |
| 11 月 6 日 14:45 | `991757ff-169f-4f4f-bf0b-771f5af9c3cc` | `ac21bfbe-140d-429e-95c6-7adf56157b78` | 批次含两项日线请求，按预期拒绝 |
| 11 月 10 日 13:01 | `72df5e24-e09a-4a7d-b14f-a5e46c5f803f` | `bc1d15d7-976d-420c-935a-f6d77f162db1` | 工具请求通过；所属周期最终失败，不算成功决策 |

四组各自 `asOf` 相同；旧请求之间仍有账户 revision／预约差异，11 月 3 日另有会话字段差异，不称为完全相同输入。

每个失败及正常请求分别构造两份消息：

1. 从其原冻结协议、账户、时点构造当前部署提示。
2. 保留旧业务提示前缀和原用户内容，仅替换输出 Schema、加入从当前提示提取的等待／能力说明，并添加 `capabilities`。断言删除新能力字段后用户内容与原文解析对象完全一致；原始消息和记录不修改。

两份消息使用同一当前 scoped Schema；分别经过 `native_schema`、`json_validated`、`json_mode` 三种模式。捕获的实际 HTTP 请求必须保留完整消息，原生结构化模式发送的 Schema 与提示 Schema 除 SDK 的 `$schema` 草案声明外一致；没有额外原生工具定义、`tool_choice` 或停止串。

旧冻结合同为 `arena-live-research-v2`，当前运行合同为 `arena-live-research-v5`。上面的第二份消息是受控的字段投影，Schema 使用当前合同，不是历史 HTTP 原文重发，也不是只改变一个模型变量的因果实验。同期其他业务扩展仍存在：按相同 JSON 序列化口径，旧 Schema 为 5044 字符，当前通用 Schema 为 8543 字符，当前回放 scoped Schema 为 7961 字符。工具收窄减少当前 Schema 的 582 字符，但整体 Schema 仍比旧 v2 大；不能据此声称总提示已经缩短或更不易循环。

## 旧输出与执行边界结果

读取到 63 个历史周期、143 笔模型调用，含 139 笔旧有效 JSON。两容器结果完全一致：

| 检查 | 每个容器的结果 |
| --- | --- |
| 当前通用合同校验旧输出 | 139／139 通过 |
| 当前 scoped 合同校验旧输出 | 132 通过，其中工具回复 62、决策回复 70 |
| 有意收窄 | 7 个工具批次拒绝，共 15 项日线子请求；其余子请求逐项符合当前能力 |
| 三模式固定响应 | 共 93 次：36 次正常通过、33 次按预期 `schema_invalid`、24 次按预期 `output_truncated` |
| 工具执行前拒绝 | 上述 7 个旧日线批次均仅进行一次内存回复读取；没有执行工具、预留工具额度或提交订单 |
| 工具等待 | 两个历史成功周期，各测成功／不可用，共 4 个场景；结果未返回时没有第二次回复读取、结算或决策提交 |
| 工具结果交付 | 结果返回后才继续，保留原工具请求、原回放时点；成功数据与已有 `toolResults` 一致，再提交原决策到内存替身 |
| 真实模型及外联 | 0 次真实模型调用；进程全局 `fetch` 触发次数为 0 |

70 笔决策通过只代表结构合同兼容，不重新认证其交易和预约业务有效性。等待场景沿用两个历史成功周期的原决策；并未触发真实订单提交。11 月 6 日 14:45 的成功周期只有包含日线的工具批次，因此该周期用于拒绝路径，不删改子请求来构造等待成功路径。11 月 10 日正常 JSON 所属周期已经失败，也不计入成功周期等待样本。

旧四次截断均未留存输出正文。长度拒绝检查根据原 `finishReason=length` 元数据构造固定控制响应：分别返回空正文和一份本来合法的报价 JSON，三种模式均必须报 `output_truncated`。这没有恢复或重新生成旧推理，也没有把可解析但截断的输出算作成功。

### 验收脚本自身的两次失败

首次将四个旧正常对照全部假定为新合同可接受，实际因 11 月 6 日 14:45 的日线批次被拒绝而失败；修正的是验收预期，保留原输出和生产校验。第二次要求三个历史成功周期都有可用的工具等待样本，实际该周期只有日线批次，断言失败。逐笔读取该周期确认后，将它明确留在提前拒绝路径，等待路径只使用其余两个合法样本。最终两容器均通过，没有放宽产品合同、删除旧请求或发送模型重试。

## 数据保护和最终一致性

本轮基线中历史回放比赛已经为 `ended`，不是上次验收时的 `running`；本轮没有改变它的状态。三场比赛在本次检查前后的状态、协议、剩余额度、账户、游标、完整周期／请求审计摘要完全相同：

| 比赛 | 本轮前后状态 | 周期数 | 已记录模型调用数 |
| --- | --- | ---: | ---: |
| 历史回放 `6f41c462…` | `ended` | 63 | 143 |
| 美股比赛 `91d6e8f0…` | `running` | 18 | 50 |
| 原 `test` `a36c2d69…` | `paused` | 0 | 0 |

`AiRun` 前后均为取消 1、失败 29、成功 26；`AiInvocation=3`、`AiInvocationFact=6` 均未增加。冻结记录的内存 SHA-256 未变化。两容器 ID、启动时刻、健康和本次四个关键产物保持一致。没有把本轮开始前其他任务产生的状态变化归于本轮。

当前写集仅两个只读验收脚本、活动任务和本证据，保持共享工作区其他未提交修改。本叶验证通过，原历史来源、模型循环、比赛追平与实时衔接仍未验收；活动总任务不归档。后续真实请求须另有明确授权，不能从本次离线授权推导。
