# A01 / A02 父项收口对账

本轮只收口 AI 实验内部冻结比较、模型输入隔离和失败分层实现，不执行真实模型请求，也不签发 `G-AI`。

当前源码重新执行 7 个定向文件：`backtest-configured-run`、`v3-frozen-comparison`、`strategy-optimization-versioned-run`、模型反馈、评价、失败分类和 SDK executor，共 **38 passed / 0 failed**。Server typecheck 已在同一输入的 S07–S09/I01 父项对账中退出 0。

## A01

候选 rebind 只按统一依赖计划重建同坐标信号别名，原协议、区间、成本、记账及历史性质保持；完整输入计划在 Reader/控制面前验证。跨标的/周期继续拒绝，普通配置错误绑定不会被自动修复。

`v3-frozen-comparison` 当前 4 项通过，证明不同预热策略可以复用同一父窗口，但各候选使用独立 Run-owned 冻结引用；执行区间比较指纹稳定。结合 [候选绑定证据](2026-09-27-a01-candidate-binding.md)，A01 完成条件已满足。此前唯一未满足前置 S08 现已收口。

## A02

模型反馈白名单、实际本机 HTTP SDK 请求、评价与失败分类当前 22 项继续通过。封存收益、未来日期、行情/事件、自由诊断和未知字段不会进入模型 messages；合法负收益保留，缺数据/协议不兼容/执行资格/策略表现与模型格式错误分层，不用零收益或零分补造结果。

[隔离 PostgreSQL 证据](2026-09-27-a02-sealed-postgres.md) 已用实际 19 份 migration、68 张表和独立 app role 验证持久化 JSONB → SDK 实收请求投影，以及部分失败、取消、租约恢复、晚到结果、统一揭示等封存生命周期。A01、S07、S08 前置现在均完成，B05 早已完成，因此 A02 父项可以收口。

真实 Provider 的接受、计费、模型行为和完整 AI 实验仍由 `G-AI` 验收；本轮没有恢复已耗尽的真实 AI 请求预算。
