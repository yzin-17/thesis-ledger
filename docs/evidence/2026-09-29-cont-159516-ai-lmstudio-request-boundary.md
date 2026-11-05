# 159516 真实 LMStudio 请求边界与封存实验

## 方法与请求证据

目标 Server 使用临时 Provider `lmstudio-audit-20260929` 的 `parameter_optimization` 路由，指向仅透传至原 LMStudio `http://192.168.5.20:6789/v1` 的本机代理。代理先经目标 Server 的 `validation-plan`、`test-and-save` 完成一次模型路由验证，再在新实验中转发一次模型调用；两次请求均由目标容器实际发送。代理只保存结构、时间和请求 SHA256，不保存提示词原文或模型响应。原 `lmstudio` Provider 配置没有修改。

真实优化请求于 `2026-09-28T16:47:18.692242+00:00` 到达代理，目标模型为 `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive`，请求 SHA256 为 `1c19b367d76fa321a6e09a89d2e997e36d7f3e82cd90487b38579cd579e5441d`。消息角色仅有 `system`、`user`；用户负载键仅有 `authorizedParameters`、`baselineMetrics`、`modelKey`、`objective`、`priorCandidates`、`round`、`semanticVersion`、`strategy`；基线指标分段仅有 `development`、`validation`，历史候选数为 0。对实际序列化负载检查 `bars`、`eventCount`、`events`、`futureHigh`、`overall`、`test` 均不存在。此请求由透传代理原样送达真实 LMStudio，模型返回后实验继续完成，故证据覆盖实际模型调用的发送边界。

## 目标实验与普通 Run

实验 `421ab313-8723-462c-beaa-3a1bec5d2202` 使用普通策略版本 `08ac7d30-d1a0-4ba2-8d7e-338cebe4c9e4` 和既有 `159516.SZ` 前复权固定快照协议。最终 `succeeded/completed`，1 次模型调用成功，报告输入 649、输出 2062 token；候选 `2a86e884-da56-449f-a02b-f38159950119` 进入封存测试，累计 6 条回测 Run 全部 `succeeded/complete`，引擎均为 `thesis-ledger-v3-local-runner-v2`。

基线开发／验证／测试 Run 分别为 `30813834-5dd6-4699-832c-ff33bbcccfbd`、`0763975c-b126-4501-8737-9d7ea7d8a248`、`29d76a2f-d16a-48c6-a843-a45e28f85a2c`；候选对应 Run 为 `53584e70-56e7-4ba6-a181-3c458fb92134`、`6cdd0e8c-9cc5-40e5-8e56-ce05d1cb4e6a`、`cce3097c-5dba-40b4-b535-ef437a3c42b0`。封存测试基线收益 `0.00201546394763358065`、最大回撤 `-0.06029579067121729238`；候选收益 `0.00131681678192893193`、最大回撤 `-0.08441410693970420933`，故未采纳。既有普通 Run `e2195b91-4cff-4dc5-9db2-0df01cf43d83` 仍 `succeeded`，校验值 `9a3601bd4fb550a1`。

## 门禁与清理

此前[真实成功实验与 8/8 冻结重放](2026-09-28-cont-159516-ai-sealed-experiment.md)证明多候选比较、单候选封存测试、执行版本与冻结重放；[目标格式失败反例](2026-09-29-cont-159516-ai-format-failure-target.md)证明格式错误独立终态、预算记账和普通 Run 隔离。本次直接补足真实 LMStudio 出站请求边界。临时 Provider 已按版本删除，列表确认不存在，原 `lmstudio` 仍 enabled；代理进程结束、端口不可达。保留实验与脱敏记录作为证据；本门禁不签发严格历史时点资格，也不覆盖 M2/M3 或整个 AC01–AC20。
