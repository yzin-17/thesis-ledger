# Server 模块边界与依赖方向

> 日期：2026-09-02  
> 更新：2026-09-12  
> 状态：Active  
> 适用范围：`apps/server` 与 workspace 内部 runtime dependency  
> 来源：[`2026-09-02-full-repo-architecture-hardening`](../specs/2026-09-02-full-repo-architecture-hardening.md)

## 1. 文档定位

本文是 Server 模块所有权、写边界与依赖方向的 Architecture SSOT。业务字段、HTTP payload、算法细节仍以对应 Spec、Schema 与 Domain 实现为准；本文不复制完整业务协议。

## 2. Ledger 与 Portfolio

### 2.1 所有权

- Ledger V2 是投资事实与持仓投影更新的写入所有者。
- `Position` 是 Ledger 事实重建得到的 projection，不是独立事实源。
- Portfolio 负责接收持仓相关用户意图、完成输入与标的校验，并把写命令交给 Ledger；Portfolio 不直接拥有多事实事务。

### 2.2 复合命令事务

当一个用户意图需要追加多条 Ledger fact 时，事务边界必须位于 Ledger application boundary：

- 单账户复合命令使用 `LedgerV2Repository.withAccountWrite()`；
- 跨账户复合命令使用 `LedgerV2Repository.withAccountsWrite()`；
- `withAccountsWrite()` 对去重后的账户 ID 排序并按该顺序锁定 `AccountLedgerState`；
- 同一账户的一次复合命令内，多条 event 共享该账户的 `nextLedgerRevision` 与 `nextProjectionGeneration`；
- 跨账户命令仍是一个数据库事务，但每个账户使用各自的 next revision / generation；
- 只有实际发生 mutation 的账户推进一次 revision / generation；任何一步失败均由外层数据库事务整体回滚；
- 每个受影响账户在事实追加完成后只进行一次最终 projection rebuild。

### 2.3 经济顺序

同一复合命令内的 `economicOrderKey` 必须表达稳定、可重放的业务顺序。批量命令应使用命令级 ID 加稳定序号构造 key，不能依赖循环之外的提交时序或随机数据库顺序。

当前持仓身份迁移与批量清仓已遵循上述规则；禁止重新在 Portfolio 中用多个独立 `setPosition()` 拼装一个复合用户命令。

## 3. Risk 与 Notification

依赖方向固定为：

```text
Risk -> Notifications -> Provider
```

- Risk 拥有规则、上下文准备、风险事件状态与扫描编排；
- Notification 拥有通知持久化、投递与重试；
- Risk 可以调用 Notification，但 Notification 不得导入或调用 Risk；
- Notification 失败不得反向接管 RiskEvent 的领域状态机。

Risk 内部按变化理由拆分为 Rule、Context、Event 与 orchestration facade；这些服务不得形成互相回调的循环 facade。

## 4. Performance

Performance 是分析/read-model 模块：

- 可以读取 Portfolio、Ledger projection / LedgerEvent 与 Market/FX 数据；
- 不拥有 Ledger 写命令，不得直接追加或修改 Ledger fact；
- Snapshot、Analysis、Layer、Target 可以独立演进，但 Controller-facing contract 由 `PerformanceService` facade 保持；
- 所有 FX conversion 继续复用 `market/fx-conversion.ts`，不得在 Performance 内复制汇率算法。

若未来 Performance 触发投资事实变化，应通过明确的 Ledger command 边界实现，而不是向 Performance 注入数据库写事实的捷径。

## 5. 后台长任务执行生命周期

Automation、AI Optimization、Backtest 等模块可以拥有各自的业务状态机和表，但长任务执行必须遵守同一组可靠性原则：

1. **耐久身份在 PostgreSQL。** scheduled occurrence、run 或 job 必须有数据库可审计身份，不能只依赖 Redis key、进程内 Map 或队列 transport record。
2. **耐久 owner 版本单调递增。** 每次重新 claim 必须生成新的 `executionAttempt`/等价 owner version；transport retry count 不能直接充当数据库 owner。
3. **所有终态写必须 fencing。** success、failure、cancel、requeue、heartbeat 等状态变化必须验证当前 owner，旧 worker 不能覆盖新 owner。
4. **lease 与业务 deadline 分离。** lease 表示 worker 所有权存活，不等于 handler 一定在该时刻被强制停止；AbortSignal 可用于协作取消，但不是正确性的唯一前提。
5. **恢复必须考虑副作用可重放性。** 只有明确幂等或可安全 replay 的任务才能在 owner 丢失后自动重放；无法证明时必须保守进入 `unknown_outcome` 或等价人工确认状态。
6. **Redis/队列是协调或运输层。** Redis TTL、BullMQ attempt、进程局部状态可以优化调度，但不得成为唯一正确性来源。

当前模块实现：

- Backtest：`BacktestJob.executionAttempt` 是 durable owner；BullMQ attempt 仅为 transport metadata。
- Automation：`AutomationRun` 保留公开运行历史；raw-owned `AutomationRunLease` 持有 scheduled occurrence、ownerAttempt、lease 与 recovery policy。
- Strategy Optimization：继续使用自身 raw-owned experiment/attempt 生命周期，不与 Automation/Backtest 合表。

共享的是**生命周期原则**，不是业务表或通用 Job Framework；禁止为了复用而建立 Automation ↔ AI ↔ Backtest 的反向模块依赖。

## 6. Workspace runtime dependency

Workspace runtime graph 以各 package 的 `dependencies`、`optionalDependencies`、`peerDependencies` 为准，`devDependencies` 不参与 runtime cycle 判定。

当前核心方向：

```text
shared
  ↑
domain

schemas -> 外部 schema 依赖
api-client -> schemas
dsa-adapter -> domain + schemas
apps -> packages
services -> packages
```

约束：

- `packages/*` 不得 runtime 依赖 `apps/*` 或 `services/*`；
- `apps/*` 不得 runtime 依赖 `services/*`；
- `services/*` 不得 runtime 依赖 `apps/*`；
- workspace runtime graph 不得出现 cycle。

机器检查入口：

- 源码相对路径边界：`scripts/check-boundaries.mjs`；
- workspace package graph：`scripts/check-workspace-dependencies.mjs`；
- 两者均接入根 `pnpm lint`。

## 7. Ledger V2 与旧写语义

Ledger V2 专用命令已经取代旧的通用 Position Adjustment / LedgerEvent 写入方式：

- 不再公开 `POST /ledger/events` 通用写入口；
- 不再提供 `LedgerService.append()` 通用写方法；
- execution、cash flow、cash transfer、baseline/import/reconciliation 使用各自的 V2 专用命令；
- `/ledger/:accountId/events`、audit、replay 仍是 V2 查询能力，不属于旧写入口。

禁止为了兼容新功能重新引入无类型的通用 LedgerEvent 写 API。

## 8. 变更规则

出现以下情况时必须同步更新本文：

- 新增跨模块写事务或改变事实所有权；
- Risk / Notification 或 Performance / Ledger 的依赖方向变化；
- 后台长任务改变 durable identity、owner fencing、lease 或 recovery 原则；
- workspace runtime dependency 允许关系变化；
- Ledger V2 revision、projection generation 或锁序语义变化。

具体业务协议变化只更新对应 Spec/Schema；除非同时改变模块所有权、依赖方向或后台任务生命周期原则，否则不扩写本文。
