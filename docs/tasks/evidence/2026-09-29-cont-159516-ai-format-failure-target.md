# 159516 目标 AI 格式失败与请求边界证据

## 范围与目标运行态

本次沿用普通 draft 策略版本 `08ac7d30-d1a0-4ba2-8d7e-338cebe4c9e4`、`159516.SZ` 前复权固定供应商快照和既有开发／验证分段。通过产品 `validation-plan`、`test-and-save` 入口临时配置无凭据的 `format-fixture-20260929` Provider；验证调用成功后，受控 HTTP 接收端切换为返回完整但不符合候选 schema 的 `{"changes":"not-an-array"}`。请求经目标 Server 容器实际发出，目标 Worker 执行基线。接收端只保存请求结构与 SHA256，不保存提示词原文。

第一次实验 `526ef5a5-3549-4df4-b76d-ff7794771e51` 使模型调用以 `schema_invalid` 失败：`AiRun.errorCode=optimization_schema_invalid`，13 个输入、5 个输出 token，1 次调用、0 个候选；开发／验证基线 Run `a017a8bc-3e3a-4a68-aa01-6a533317e461`、`fca73cda-69ba-46c7-a36b-6c98347757f7` 均 `succeeded/complete`。它暴露实验总停止原因误报 `no_valid_candidate`。保留这条终态作为发现证据，没有改写历史记录。

修复后，第二次实验 `f82bd3c0-9e3d-479a-aee9-ac89600a32b0` 在同一目标运行态以 `failed/model_format_failure` 收敛；`AiRun.errorCode=optimization_schema_invalid`，仍为 1 次调用、13/5 token、0 个候选。开发／验证基线 Run `1e57396a-641c-4f07-b892-b1c01848e27a`、`0992915b-67bc-4446-8f75-8b75f08c739e` 均 `succeeded/complete`，无候选或封存测试回测。目标浏览器详情明确显示“模型输出格式无效，未生成候选”。独立普通 Run `e2195b91-4cff-4dc5-9db2-0df01cf43d83` 仍为 `succeeded/complete`，结果校验值 `9a3601bd4fb550a1`。

## 实际请求边界

两次负例的目标 Server 出站 HTTP 请求结构相同：消息角色为 `system`、`user`；用户负载键仅为 `authorizedParameters`、`baselineMetrics`、`modelKey`、`objective`、`priorCandidates`、`round`、`semanticVersion`、`strategy`。`baselineMetrics` 仅有 `development`、`validation`，历史候选数为 0。接收端脱敏检查 `bars`、`eventCount`、`events`、`futureHigh`、`overall`、`test` 均不存在；请求 SHA256 均为 `1a776612a637deb39dd92890918c54339adbef3d3ac3b503592266566ec57a29`。这证明目标 Server 至受控 Provider 的实际序列化边界；先前 LMStudio 成功实验的原始出站请求尚未逐字节捕获，因此不将此证据宣称为 LMStudio 请求审计。

## 代码、验证和清理

`strategy-optimization-attempt-lifecycle.ts` 持久化结构化模型错误码；`strategy-optimization-proposal-stage.ts` 根据全部尝试和候选存在性判定 `model_format_failure`、`model_generation_failed` 或 `no_valid_candidate`；Desktop 详情新增对应中文标签。定向 Server 12 项、Desktop 6 项通过；本地 HTTP SDK 集成 8 项通过；隔离 PostgreSQL 使用当前 SQL head `20260928140000_market_window_catalog_revision_bigint`，相关集成 3 项通过。Server typecheck、受影响文件 ESLint/Prettier、Server 与 Desktop build、模块边界及以 HEAD 为基线的尺寸 ratchet 通过。通过官方 `sync-code.sh thesis-ledger` 更新目标 Server/Worker 可写层，二者 healthy；本次未重建镜像，镜像摘要不作为新版本发布证据。

临时 Provider 已通过带 `expectedRevision` 的产品删除 API 移除，列表确认不存在，原 `lmstudio` Provider 仍 enabled；接收端进程已停止、端口不可达。两条失败实验保留为审计证据。`G-AI-format-failure` 可关闭；真实 LMStudio 出站请求的直接脱敏审计及 `G-AI` 总门禁继续开放。
