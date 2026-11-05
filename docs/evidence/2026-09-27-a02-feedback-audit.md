# A02 模型反馈与失败分类补验

当前工作区定向验证：模型反馈投影 4 项、结果评价 9 项、失败分类 2 项、本地 SDK HTTP 执行器 7 项，共 22 项通过。

验证覆盖开发/验证指标白名单、非法指标及未知字段拒绝、固定供应商快照的非严格历史性质说明，以及实际 SDK 请求在本机 127.0.0.1 接收后的投影核验。亏损保留真实负收益；缺指标、缺换手率、不完整数据、损坏 V3 协议、未知版本和执行资格失败分别分类，不以零分或零收益进入排名。SDK 用量结算、未知结果和连接中断保持单请求边界。

命令为 Server vitest 的 `strategy-optimization-model-feedback`、`strategy-optimization-evaluation`、`strategy-optimization-failure`、`strategy-optimization-sdk-executor.integration` 四个测试文件。本地 HTTP 由测试临时创建，不调用真实模型、不创建目标 AI 实验或使用真实凭据。

A02 仍依赖未完成的 A01/S07，封存访问与揭示生命周期的真实数据库组合门禁也未由这些测试证明，故保持未完成。G-Math 已在主任务完成，本轮未重复运行或重开该门禁。

后续更新：[`A02-sealed-pg`](2026-09-27-a02-sealed-postgres.md) 已在独立完整 PostgreSQL 与应用角色中补齐 5 项：实际 JSONB 指标到 SDK 实收请求投影，以及封存访问/揭示生命周期。它与本页 22 项不重叠；A02 的真实来源/Worker、A01/S07 前置仍开放。
