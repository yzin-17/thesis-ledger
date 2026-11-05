# T6 完整冻结期限的隔离验收

责任入口：[原配置 Task 的 T6.DEADLINE-ISOLATED](../archive/tasks/2026-09-21-ai-provider-model-usage-configuration.md#t6-deadline-isolated)。覆盖测试后保存 Spec 第 6/8/9 项的普通用途完整预算与跨用途共享截止；本记录不代收目标实源门禁。

## 输入与运行边界

按用户完成前四项的指令推进零真实模型工作。使用维护入口 `scripts/test-ai-provider-postgres.mjs test/ai/ai-provider-deadline-postgres.integration.test.ts`，Node v24.19.0、本地 pnpm 11.9.0、offline；专属 tmpfs PostgreSQL、36 份 migration，脚本与测试均确认数据库 ai_provider_concurrency_fixture / fixture_owner。

真实 SDK 只连接所属本机 SSE；两用途依次为研究 V2 的原 Zod 合法内置实例、编写分析合同。第一用途正常返回用量，第二用途每 250ms 输出文本，持续有效进度；无真实模型或计费调用。原隔离配置、合成密文、默认修订 7 和两个空对象按整行冻结，草稿优先级另设为 101，以便检出错误保存。

维护入口新增可选 `AI_PROVIDER_TEST_TIMEOUT_MS`，默认仍 120000ms，明确限制在 120000～900000 的整数；4 个非法输入在任何 Docker 操作前拒绝。完整墙钟样本开启 AI_PROVIDER_WALL_CLOCK_TEST=1，测试进程等待设为 720000ms；应用预算始终为 600000ms，没有放宽生产超时、收尾预留或检查规则。

## 失败、修正与最终结果

首轮于北京时间 21:46 启动，约 300 秒后外层测试客户端 node:fetch 的默认响应头等待到期，报 UND_ERR_HEADERS_TIMEOUT；不能计作应用期限通过。日志与输入保留，没有将这一异常归因于 Provider 或改写生产预算。

将本样本外层 API 客户端改为 node:http，socket 等待 650000ms，仅覆盖两个所属本机地址；SDK/Server、真实时间、冻结预算与原合同保持。局部类型/ESLint 后再次运行完整样本，默认短取消用例及维护入口此前也已回归通过。

北京时间 2026-10-30 22:05～22:15，最终 **1 项通过、0 跳过**。本次期限操作 ID 为 `f5a3a2b3-271a-4cb8-b102-022bb428cfa7`；完整输出由私有 deadline-http-postgres.json 保留。

| 断言 | 实际结果 |
| --- | --- |
| 普通用途计划 | 600 秒，默认最大 6 次，失败即停授权 2 次本机请求 |
| 未加速的执行时间 | 595048.830125ms；600000ms 总预算包含原 5000ms 收尾预留 |
| 跨用途冻结 | 两项 SDK 决策 taskDeadlineAt、executionDeadlineAt 完全相同；第二用途不会重新获得 600 秒 |
| 正常第一用途 | 原研究 V2 Schema 通过；12 输入/9 输出 Token 保留 |
| 持续输出的第二用途 | 按 task_budget_exhausted 失败并断流，未知输入/输出仍为 null；不是 validation_cancelled 或空闲停顿 |
| 停止与持久化 | 无回退、重试或配置保存；原隔离 ProviderConfig/密文/默认保持；成功和失败审计分别保留 |

真实模型 0 次、费用 0；本机假上游 2 条请求。完整日志与失败记录位于 `.recovery-artifacts/first-four-acceptance-20261030T134208Z/`：deadline-command.json、deadline-command-result.json、deadline-http-postgres.json、deadline-isolated.log 及首轮 .attempt-1、静态检查和维护入口默认取消回归日志。预算/Runner/Scope 的执行输入摘要与命令同时冻结；后续诊断身份字段修复不在本样本的期限执行路径。

## 结论

T6.DEADLINE-ISOLATED 的完整普通用途预算和共享截止子场景通过；真实停顿/目标上游及其余协议业务仍归原 Task。目标配置/数据保护由本次分阶段快照独立核对，不以隔离库结果替代目标实测。没有新增真实调用、收费模型或生产数据重建。
