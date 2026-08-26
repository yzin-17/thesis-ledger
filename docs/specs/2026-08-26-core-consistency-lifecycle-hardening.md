# Core Consistency & Lifecycle Hardening Spec

> 日期：2026-08-26
> 状态：Draft
> 主题：核心投影一致性、任务生命周期与架构边界加固

## 1. 背景

本 Spec 来自 2026-08-26 对 `main` 分支的全仓代码架构 Review，优先检查模块边界、依赖方向、领域模型、事务语义、任务生命周期和长期维护性，并对照现有 Spec / Task / Architecture 文档核验实现完成度。

本轮不重新设计产品功能，不引入无关的大规模重构；目标是收敛当前已经暴露、且会影响一致性或可恢复性的结构性问题。

## 2. 本轮确认的问题

### P0 — Ledger 事件缺少稳定业务顺序

当前 `LedgerEvent` 以 `occurredAt` 表示业务时间，并以 `createdAt` 等字段参与查询排序，但模型中没有同一账户/同一业务时间内的稳定序号。

风险：

- 同一 `occurredAt` 下多条 BUY / SELL / ADJUSTMENT / CASH 事件的投影顺序依赖数据库写入时间或其他非业务字段；
- 导入、迁移、重放或并发写入时，不能保证完全相同的事件顺序；
- Position、Cash、Journal 等基于 Ledger 的投影可能在边界数据上失去可复现性。

### P1 — Backtest `running` 生命周期只存在于单进程内存

当前 `BacktestService` 通过数据库状态从 `queued` 切换为 `running`，但执行期取消依赖进程内 `Map<string, AbortController>`。

当前没有持久化的：

- worker / lease owner；
- lease expiry；
- heartbeat；
- stale running recovery；
- crash 后重新入队策略。

风险：

- Server 进程在任务执行中退出后，任务可能永久停留在 `running`；
- 多实例部署时另一个实例无法判断任务是否仍被真实 worker 持有；
- 跨进程取消只有数据库状态变化，没有可靠的执行中断语义。

### P1 — `clearPositions()` 缺少整批事务语义

当前 Portfolio 批量清仓逐条调用 `LedgerService.setPosition()`，每条持仓各自进入独立事务。

风险：

- 中间任一持仓处理失败时，前面的持仓已经清零，后面的仍保留；
- API 返回错误时账户进入“部分清仓”中间态；
- 该语义与单笔 `movePosition()` 已实现的原子性方向不一致。

### P2 — 架构边界守卫没有覆盖 workspace 包依赖图

当前 `scripts/check-boundaries.mjs` 只检查相对路径 import 的 app / service 跨层关系，对 `@thesis-ledger/*` workspace package import 不建模。

因此它无法阻止：

- 基础包反向依赖上层包；
- package 之间形成新的依赖环；
- server / client 通过 workspace alias 绕过预期分层。

现状 package 依赖仍较简单，但守卫能力与项目当前模块化程度不匹配。

## 3. Spec 完成度偏差

### 3.1 Backtest Worker 的“已覆盖”需要收紧

现有 Spec 追踪矩阵把 Backtest Worker 归入已覆盖能力，但当前实现只确认：

- 有 `BacktestJob` 持久化；
- 有 `queued -> running -> terminal` 基础状态；
- 有本地 worker 接口与单进程执行。

尚未完成的是“可恢复的持久化 worker lifecycle”。因此后续文档应区分：

- **执行能力已实现**；
- **进程崩溃 / 多实例下的任务生命周期仍未闭环**。

### 3.2 Ledger 投影一致性仍有顺序语义缺口

Ledger 已是事实源，Position / Cash 等投影已经围绕它收敛；但同时间事件稳定顺序尚未进入领域不变量与 Schema，因此“可重放、可复现”仍有未闭环边界。

### 3.3 批量写操作的事务边界没有形成统一约束

单笔持仓身份迁移已经采用 Ledger transaction helper，但批量清仓仍由 Portfolio 编排多个独立事务，说明“跨多条 Ledger 写入的原子操作必须由 Ledger 层统一拥有事务”还没有形成稳定架构规则。

## 4. 目标

本阶段只完成以下四个目标：

1. 为 Ledger 建立稳定、可重放的事件顺序语义；
2. 为 Backtest 建立可恢复的持久化运行生命周期；
3. 把批量清仓收敛为 Ledger 层拥有的单事务操作；
4. 将现有 import boundary guard 扩展为可验证的 workspace package 依赖边界。

## 5. 非目标

本阶段不做：

- 重写 Ledger / Position / Journal 领域模型；
- 引入新的通用消息队列框架；
- 把 Backtest、AI、Automation 强行合并成一个大型 job abstraction；
- 重构 DSA；
- 重做 Desktop / Mobile 页面；
- 迁移所有 Server service 到新的 repository / use-case 分层；
- 为了“统一”而抽象尚未出现第二个稳定用例的通用框架。

## 6. 方案

### 6.1 Ledger 稳定序号

为 `LedgerEvent` 增加稳定业务序号，例如 `sequence` / `ordinal`。

约束：

- 排序主键为 `occurredAt ASC, sequence ASC`；
- sequence 必须是持久化业务字段，不能用随机 UUID 代替；
- 对现有历史记录进行确定性回填；
- 新写入路径必须保证同一账户下序号不会冲突；
- 投影、查询、测试统一使用同一排序规则。

建议优先采用“账户内单调 sequence”，而不是依赖 `createdAt` 精度。

### 6.2 Backtest lease / heartbeat / recovery

在现有 `BacktestJob` 上增量增加运行生命周期字段，不新增第二套 Job 表：

- `workerId` / `leaseOwner`；
- `leaseExpiresAt`；
- `heartbeatAt`；
- `attempts`；
- 必要时增加 `lastError` / recovery reason。

运行规则：

1. worker 通过条件更新从 `queued` 获取 lease；
2. 执行期间周期性续租；
3. terminal 状态清理 lease；
4. recovery 扫描过期 `running` job；
5. 未超过最大重试次数时重新进入 `queued`，否则进入 `failed`；
6. cancel 仍以数据库状态为 SSOT，本地 `AbortController` 只作为当前进程的快速中断手段。

该实现应复用 AI Worker 已有的 lease / recovery 经验，但不要求抽象为同一套通用基类。

### 6.3 Ledger 批量持仓清空事务

在 `LedgerService` 增加批量操作，例如：

- `clearPositions(accountId)`；或
- 更窄的 transaction helper，仅服务当前批量清仓用例。

要求：

- 一次数据库事务内读取目标持仓；
- 写入全部 position-balance ADJUSTMENT；
- 只在批量写入完成后统一 rebuild；
- 任一持仓失败时整批回滚；
- Portfolio 只调用 Ledger 暴露的业务操作，不自行编排多条 Ledger transaction。

### 6.4 Workspace 依赖边界

扩展 `scripts/check-boundaries.mjs` 或增加独立脚本，至少建立以下允许关系：

```text
shared
  ↑
domain      schemas
  ↑           ↑
server / api-client / adapters
```

具体关系以实际 package 职责为准，但应满足：

- `shared` 不依赖其他内部 package；
- `domain` 不依赖 app / adapter / API client；
- `schemas` 不引入运行时 domain 依赖；
- `api-client` 不反向依赖 server；
- services / apps 不被 packages 反向引用；
- 新增 workspace 依赖环时 CI 失败。

实现可以基于 package.json dependency graph，而不是尝试解析所有 TS alias import。

## 7. 架构规则

本阶段实施后形成以下长期规则：

1. **Ledger 重放顺序属于领域事实，不属于数据库偶然顺序。**
2. **持久化 Job 的 `running` 必须可恢复，不能只靠进程内状态。**
3. **一次用户意图对应多条 Ledger 写入时，事务边界由 Ledger 层拥有。**
4. **workspace package 的依赖方向必须机器可验证。**

## 8. 验收标准

### Ledger

- 同一账户、同一 `occurredAt` 的多事件在重复 rebuild 后结果完全一致；
- 历史记录迁移后顺序确定；
- AVG / FIFO / Cash 等相关投影测试覆盖同时间事件。

### Backtest

- worker crash 后过期任务可自动恢复；
- 多 worker 不能同时获得同一 job；
- heartbeat 能延长有效 lease；
- cancelled job 不会被 recovery 重新执行；
- 超过 retry 上限后进入 `failed`。

### Portfolio / Ledger

- 批量清仓任意一条失败时所有持仓保持原状态；
- 成功时所有目标持仓一次性清空；
- Portfolio 不再循环调用多个独立 `setPosition()` 事务。

### Architecture Guard

- 合法现有依赖通过；
- 构造一个 package 反向依赖 fixture 时检查失败；
- 构造 dependency cycle 时检查失败；
- CI / `pnpm lint` 能执行该守卫。

## 9. 验证方式

确定性验证：

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm contract:test`
- `pnpm migration:matrix`
- `pnpm guardrails:complexity`

重点新增测试：

- Ledger same-timestamp deterministic projection；
- Backtest lease acquire / heartbeat / stale recovery / cancel；
- Portfolio clearPositions rollback；
- workspace dependency graph fixtures。

## 10. 风险与迁移

### 数据库迁移风险

Ledger sequence 与 Backtest lease 字段都涉及 Prisma migration。迁移必须：

- 支持已有数据；
- 提供确定性回填；
- 不把历史 `running` job 直接误判为仍有效 lease。

### 并发风险

sequence 分配和 lease 获取必须依赖数据库原子条件，不能采用“先查最大值再普通 insert/update”的无锁实现。

### 范围风险

不要借本任务重新设计所有异步任务或所有 service 分层。先关闭已经确认的四个缺口，再决定是否存在足够重复模式值得抽象。

## 11. 优先级

1. P0：Ledger 稳定事件顺序；
2. P1：Backtest lease / recovery；
3. P1：批量清仓原子事务；
4. P2：workspace 依赖边界守卫。
