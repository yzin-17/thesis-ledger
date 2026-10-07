# 目标配置版本与并发一致性加固任务

- 日期：2026-09-16
- 复审更新：2026-10-07
- 状态：待实施
- 对应 Spec：`docs/specs/2026-09-16-performance-target-allocation-consistency.md`
- Review 基线：`main@514abeebfe57bac0c16271439d8b777ff3b02a9f`

## 目标

将 `TargetAllocation` 从“应用层约定的版本记录”收敛为具备数据库 identity 约束、原子版本切换、同 identity 并发串行化和真实 PostgreSQL 验收的持久化配置事实，同时保持 Performance UI、再平衡语义和合法 Desktop/API 调用兼容。

## 2026-10-07 全仓复审证据

本轮重新审查当前 main 的完整树，而不是只检查 #41。递归 Git tree 未截断，共 2,574 个条目、2,382 个 blob；覆盖 Server / Desktop / Mobile、workspace packages、DSA adapter、47 个 scripts、60 个 Prisma model、26 个 migration、测试、CI/guardrails，以及 specs/tasks/architecture。

关键结论：

- workspace dependency、Server source boundary、Ledger ownership 与 Backtest/AI/Automation durable lifecycle 仍有现行守卫，没有新的未承接 P0/P1 要求本任务扩大为通用框架。
- 当前 main 已完成大规模 Canonical / Market V3 / NAV Backtest 收敛，相关后续由现有多源行情/剩余验收 Task 承接。
- `TargetAllocation` 仍只有普通 index；`saveTargets()` 仍在 transaction 外执行失活、读版本、创建；读路径仍 tie-break；targets GET/POST 仍没有共用完整 identity parser。
- 当前 Performance 测试目录只有 5 个文件；目标版本测试仍是 fake Prisma，没有 TargetAllocation PostgreSQL 并发、rollback、direct constraint、dirty migration preflight 证据。
- 当前 main push CI run `37120557150` 仍不绿色：lint/typecheck 已通过，但 quality 因 NAV preparation 的跨平台临时目录失败，PostgreSQL service E2E 仍有 Strategy Optimization executionModel fixture 与 timeout 两项失败。Draft PR #46 已承接并用独立绿色 CI 验证这些基线修复，但尚未合入 main。本任务不得复制这些修复，也不得忽略当前 main 红灯。
- `docs/tasks` 已膨胀到 428 个文件、约 3.8 MB；Quality/Integrity 也仍有目录所有权表达问题。这些属于 P2 独立治理，不混入本任务。

因此：当前 CI 基线修复优先由既有 PR/Task 完成；在**尚无其它专项承接的架构 correctness 问题**中，TargetAllocation 仍是最值得推进的 P1。上一轮 PR #41 未处理，本轮继续迭代 #41。

## 执行约束

- 不修改 TTWROR、XIRR、allocation/rebalance 公式或 FX 语义。
- 不把 TargetAllocation 移入 Ledger。
- `mode` 不进入 TargetAllocation identity；显式 portfolio 目标继续由 actual/shadow 共享。
- 不引入通用 VersionedEntity、全局 Lock Service、进程内 mutex 或 Redis 锁替代 PostgreSQL transaction/constraints。
- partial unique index / CHECK 以 raw migration SQL 为数据库 SSOT。
- migration 对历史脏数据 fail closed，不自动删除、重编号或任意合并版本。
- fake Prisma 只能做服务逻辑单测，不能替代并发、rollback、constraint 与 migration 的真实 PostgreSQL 验收。
- 代码、migration、真实 PostgreSQL 验收全部完成前保持 active；完成后按当前文档生命周期规则归档。

## T1：统一 TargetAllocation identity 契约

### 范围

- `packages/schemas/src/performance.ts`
- `apps/server/src/performance/performance.controller.ts`
- 相关 schema/controller 测试

### 实施

1. 提取复用的 target identity 规则：
   - `scope=account` 必须提供 UUID `accountId`；
   - `scope=portfolio` 必须不提供 `accountId`。
2. `performanceTargetsInputSchema` 复用该 identity 规则并扩展 targets。
3. GET `/performance/targets` 使用同一运行时 parser；继续保留现有 mode/fxMerge/baseCurrency 参数。
4. GET 缺省 portfolio 语义保留，但 `accountId + 缺省/portfolio scope` 明确拒绝。
5. 验证 Desktop 当前 fetch/save 始终构造合法组合，无需改 URL 或 payload。

### 验收

- [ ] POST account + accountId 通过。
- [ ] POST account 缺 accountId 拒绝。
- [ ] POST portfolio 无 accountId 通过。
- [ ] POST portfolio 携带 accountId 拒绝。
- [ ] GET targets 使用相同 identity 规则。
- [ ] 当前 Desktop account/portfolio 请求兼容。

## T2：增加数据库 identity、version 与 active 不变量

### 范围

- `apps/server/prisma/schema.prisma`
- 新 migration SQL
- `scripts/check-migration-matrix.mjs`（必要时）
- migration / DB constraint 测试

### 实施

1. CHECK：只允许：
   - `scope='account' AND accountId IS NOT NULL`；
   - `scope='portfolio' AND accountId IS NULL`。
2. CHECK：`version > 0`。
3. raw SQL partial unique indexes：
   - account `(accountId, version)` 唯一；
   - portfolio `version` 唯一；
   - account 同 account 最多一条 `active=true`；
   - portfolio singleton 最多一条 `active=true`。
4. 不使用普通 `(scope, accountId, version)` unique 假设 NULL 自动提供 singleton 语义。
5. 创建约束前 fail-closed preflight：检查非法 identity、非正 version、重复 version、多 active。
6. preflight 错误输出足够定位的 record id / identity / version，不自动修复历史。
7. preflight 与 CHECK / partial unique DDL 位于同一显式 PostgreSQL migration transaction。
8. migration matrix 继续承担迁移链静态守卫；实际拒绝行为由真实 PostgreSQL 测试证明。
9. 新 migration 必须位于当前 head `20261001120000_require_explicit_strategy_contract` 之后。若实施时 main 新增 migration，先重新读取实际 head 再命名和验证。

### 验收

- [ ] 干净数据库通过 migration matrix。
- [ ] account 无 accountId 的直接 SQL 被拒绝。
- [ ] portfolio + accountId 的直接 SQL 被拒绝。
- [ ] 非正 version 被拒绝。
- [ ] 同 account 重复 version 被拒绝。
- [ ] portfolio NULL accountId 重复 version 被拒绝。
- [ ] 同 account 第二个 active 被拒绝。
- [ ] portfolio 第二个 active 被拒绝。
- [ ] 预置脏数据时 migration fail closed。
- [ ] preflight 与 DDL 同 transaction，失败不留下半应用结构。

## T3：单 identity 串行化的保存 transaction

### 范围

- `apps/server/src/performance/performance-target.service.ts`
- 必要的 Performance 内部 helper
- Performance 单元测试

### 实施

1. 权重规范化与 100% 校验放在 DB transaction 前。
2. `saveTargets()` 使用单 PostgreSQL transaction。
3. 获取 transaction-scoped advisory lock：
   - `target-allocation:account:<accountId>`
   - `target-allocation:portfolio`
4. 锁覆盖第一次保存无现成 target 行的场景，不只依赖 FOR UPDATE 现存行。
5. 拿锁后重新读取 max version，计算 nextVersion。
6. 同 transaction 内失活旧 active 并创建新 active。
7. create/constraint 失败整体 rollback。
8. DB constraints 是最终 fencing，不把 constraint error 转成伪成功。
9. advisory key helper 只存在 Performance 内部，不复制到 controller/Desktop，也不锁 Account 父行。

### 验收

- [ ] 保存只有一个业务 transaction。
- [ ] 第一次保存也能正确串行化。
- [ ] account A/B 使用不同 identity key。
- [ ] portfolio 与任一 account 使用不同 key。
- [ ] create 失败时旧 active 通过 rollback 保持有效。
- [ ] 正常保存返回唯一 active 的新版本。
- [ ] 权重非法时不进入写 transaction。

## T4：读取不再 tie-break 损坏状态

### 实施

1. 显式读取依赖 DB“最多一条 active”不变量，不把 `orderBy` 当多 active 容错。
2. account 聚合移除 Map first-wins 对重复 active 的隐藏。
3. migration 兼容窗口若发现异常，fail closed 并给出诊断。
4. 保留“显式 portfolio 优先；无显式 portfolio 才聚合 account target”的产品语义。

### 验收

- [ ] 正常单 active 行为不变。
- [ ] 测试不再把多 active 后任选一条当成功。
- [ ] portfolio 优先语义不变。
- [ ] account 聚合不依赖查询顺序掩盖损坏。

## T5：真实 PostgreSQL 并发、rollback 与约束验收

### 范围

- `apps/server/test/performance/`
- 必要的 PostgreSQL fixture/helper
- `.github/workflows/ci.yml`（只接入现有数据库步骤）

### 用例

1. 同 account 并发 N 次保存。
2. portfolio 并发 N 次保存。
3. account A/B 并发。
4. account 与 portfolio 并发。
5. 已存在 active 时 transaction 中途失败。
6. DB 直接拒绝非法 identity、非正 version、重复 version、多 active。
7. portfolio NULL identity 唯一性。
8. migration preflight 对脏数据 fail closed。

最终状态检查：

- 成功 version 无重复；
- 同 identity version 严格递增；
- 最终只有最大 version active；
- 失败 transaction 不留半切换；
- 不同 identity 没被全局锁强制串行。

### CI

复用现有 contracts-and-guardrails PostgreSQL service 与 migration matrix；把 TargetAllocation 定向测试接入现有数据库步骤，不创建重复 workflow。

### 验收

- [ ] 测试使用真实 PostgreSQL。
- [ ] 同 identity 并发可重复稳定运行。
- [ ] rollback 以数据库最终状态证明。
- [ ] constraint 测试绕过 service 直接写 DB。
- [ ] dirty migration preflight 有真实 DB 证据。
- [ ] 新测试接入现有 CI。

## T6：同步文档完成度

### 范围

- `docs/specs/2026-08-23-performance-analysis-interaction-design.md`
- 本 Spec / Task
- `docs/tasks/README.md`
- 完成后的 archive

### 实施

1. 旧 Performance 交互 Spec 增加后续关系说明：交互已实施，TargetAllocation 持久化并发正确性由本 Spec 收口。
2. 代码/migration/PostgreSQL 验收完成前，本任务留在“当前仍在实施”。
3. 不改写旧历史证据，只纠正容易让人误解为持久化保证已完成的描述。
4. 全部 AC 完成后按 Documentation Guide 归档 Task，并从 active index 移除。

## T7：最终全仓影响复查与质量验证

### 调用方复查

至少重新检查：

- `apps/server/src/performance` 全部 target 读写；
- `apps/desktop/src/features/performance` fetch/save/query invalidation；
- `packages/schemas` performance 契约导出；
- `packages/api-client` 对 Performance 的实际暴露；
- Account 永久删除的 TargetAllocation FK/Restrict；
- `docs/architecture/2026-09-02-server-module-boundaries.md`；
- migration matrix、CI PostgreSQL 步骤与 Performance 测试目录；
- seed/script/test 中直接操作 TargetAllocation 的路径。

### 质量验证

至少执行：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm migration:matrix
```

并运行新增 PostgreSQL 定向测试和 `git diff --check`。

### 完成条件

- [ ] PR diff 无无关大规模重构。
- [ ] 没遗漏 TargetAllocation 写入调用方。
- [ ] 没新增跨模块反向依赖。
- [ ] migration 从实施时当前 head 正常升级。
- [ ] 合法 Desktop 流程兼容。
- [ ] 每个 AC 都有代码、migration 或测试证据。
- [ ] TargetAllocation PostgreSQL 定向测试独立稳定绿色。
- [ ] 完成前重新检查当前 main/PR 全量 CI；若仍有 base failure，明确归属，不把本 Task 标记“已实施/完成”。
- [ ] 禁止通过跳过 lint/test、移除 PostgreSQL E2E 或弱化 guardrail 制造绿色。

## 风险清单

| 风险 | 处理 |
| --- | --- |
| 历史非法 identity / 重复 version / 多 active | migration preflight fail closed |
| NULL 绕过普通 unique | account/portfolio 分离 partial unique |
| Prisma 无法表达 CHECK/partial index | raw migration 为 DB SSOT + 真 PG 测试 |
| preflight 与 DDL 分步竞争 | 单 migration transaction |
| 第一次保存无行可锁 | transaction-scoped advisory lock |
| 锁范围过大 | identity 级 key，不用全局锁 |
| create 失败导致旧目标消失 | 单 transaction rollback |
| API 收紧破坏客户端 | 只拒绝领域非法组合，先验证调用方 |
| 读取继续隐藏脏状态 | 移除 first-wins/tie-break |
| 过度抽象 | helper 仅留 Performance 内部 |

## 本轮不顺带处理

- 当前 main CI 的 NAV temp-path 与 Strategy Optimization fixture/timeout 已由 Draft PR #46 承接。
- 周期现金/基金 materialization 一致性已有独立专项。
- Market V3 / Canonical / NAV Backtest 由现有 multi-source Task 承接。
- AI/Strategy Optimization 继续使用各自 lifecycle，不抽通用 Job Framework。
- Quality/Integrity 只记录 P2 目录所有权表达问题。
- docs/tasks/evidence 体量与生命周期治理作为 P2 后续独立收敛。

这些事项均不混入 #41，避免把一个可独立验证的持久化 correctness PR 扩成无关重构。
