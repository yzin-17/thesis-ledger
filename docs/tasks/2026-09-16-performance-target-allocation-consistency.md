# 目标配置版本与并发一致性加固任务

- 日期：2026-09-16
- 复审更新：2026-09-19
- 状态：待实施
- 对应 Spec：`docs/specs/2026-09-16-performance-target-allocation-consistency.md`
- Review 基线：`main@8648d006895e175913db33d52e1f198fe534c96d`

## 目标

将 `TargetAllocation` 从“应用层约定的版本记录”收敛为具备数据库 identity 约束、原子版本切换、同 identity 并发串行化和真实 PostgreSQL 验收的持久化配置事实，同时保持当前 Performance UI、再平衡语义和合法 Desktop/API 调用兼容。

## 执行约束

- 不修改 TTWROR、XIRR、allocation / rebalance 公式或 FX 语义。
- 不把 TargetAllocation 移入 Ledger。
- `mode` 不进入 TargetAllocation identity；显式 portfolio 目标继续由 actual / shadow 共享。
- 不引入通用 VersionedEntity、全局 Lock Service、进程内 mutex 或 Redis 锁替代 PostgreSQL transaction / constraints。
- partial unique index / CHECK 以 raw migration SQL 为数据库 SSOT；不要因为 Prisma DSL 不能表达就退化为应用层约束。
- migration 对历史脏数据必须 fail closed，不自动删除、重编号或任意合并版本。
- fake Prisma 只能做服务逻辑单测，不能替代并发、rollback、constraint 和 migration 的真实 PostgreSQL 验收。
- 本 Task 在代码、migration、真实 PostgreSQL 验收全部完成前保持 active；完成后按当前文档生命周期规则归档。

## T1：统一 TargetAllocation identity 契约

### 范围

- `packages/schemas/src/performance.ts`
- `apps/server/src/performance/performance.controller.ts`
- 相关 schema / controller 测试

### 实施

1. 提取可复用的 target identity 规则，统一约束：
   - `scope=account` 必须提供 UUID `accountId`；
   - `scope=portfolio` 必须不提供 `accountId`。
2. `performanceTargetsInputSchema` 复用该规则并扩展 `targets`。
3. `GET /performance/targets` 使用同一运行时 identity 规则解析 query；继续保留现有 `mode`、`fxMerge`、`baseCurrency` 参数。
4. 保持 GET 默认 portfolio 语义，但 `accountId + 缺省/portfolio scope` 明确拒绝，不能继续形成隐藏非法 identity。
5. 校验 Desktop 当前 `fetchPerformanceTargets()` / save 调用始终构造合法组合，无需改 URL 或 payload。

### 验收

- [ ] POST account + accountId 通过。
- [ ] POST account 缺 accountId 返回校验错误。
- [ ] POST portfolio 无 accountId 通过。
- [ ] POST portfolio 携带 accountId 返回校验错误。
- [ ] GET targets 使用相同 identity 规则。
- [ ] 当前 Desktop account / portfolio 请求保持兼容。

## T2：增加数据库 identity、version 与 active 不变量

### 范围

- `apps/server/prisma/schema.prisma`（仅需要保持模型与 migration 事实一致，不伪造 Prisma 不支持的约束）
- 新 Prisma migration SQL
- `scripts/check-migration-matrix.mjs`（仅在现有矩阵需要适配时）
- migration / DB constraint 测试

### 实施

1. migration 创建 CHECK：只允许：
   - `scope='account' AND accountId IS NOT NULL`；
   - `scope='portfolio' AND accountId IS NULL`。
2. 增加 `version > 0` CHECK。
3. 使用 raw SQL partial unique indexes 分别保护：
   - account：`(accountId, version)` 唯一；
   - portfolio：`version` 唯一；
   - account：同 account 最多一条 `active=true`；
   - portfolio：singleton 最多一条 `active=true`。
4. 不使用普通 `(scope, accountId, version)` unique 假设 NULL 自动具备 singleton 语义。
5. 在创建约束前执行 fail-closed preflight，检查：
   - 非法 scope/accountId；
   - 非正 version；
   - 同 identity 同 version 重复；
   - 同 identity 多 active。
6. preflight 错误必须输出足以定位问题的 identity / version / record id；不得静默修复历史。

### 验收

- [ ] 干净数据库可通过现有 migration matrix。
- [ ] account 无 accountId 的直接 SQL 写入被拒绝。
- [ ] portfolio + accountId 的直接 SQL 写入被拒绝。
- [ ] 非正 version 被拒绝。
- [ ] 同 account 重复 version 被拒绝。
- [ ] portfolio `NULL accountId` 重复 version 被拒绝。
- [ ] 同 account 第二个 active 被拒绝。
- [ ] portfolio 第二个 active 被拒绝。
- [ ] 预置历史脏数据时 migration fail closed。

## T3：将保存收敛为同 identity 串行化的单 transaction

### 范围

- `apps/server/src/performance/performance-target.service.ts`
- 必要的 Performance 内部 helper
- Performance 服务单元测试

### 实施

1. 权重规范化与 100% 校验保持在数据库写 transaction 前完成。
2. `saveTargets()` 只使用一个 PostgreSQL transaction 完成版本切换。
3. 对逻辑 identity 获取 transaction-scoped advisory lock：
   - `target-allocation:account:<accountId>`；
   - `target-allocation:portfolio`。
4. 锁必须覆盖第一次保存无现成 target 行的场景；不要只 `FOR UPDATE` 当前 target 行。
5. 拿锁后重新读取最大 version，再生成 `nextVersion`。
6. transaction 内将旧 active 失活并创建新 active；create / constraint 失败时整体 rollback。
7. DB CHECK / unique constraints 是最终 fencing；不要捕获 constraint error 后伪装成功。
8. advisory key 生成集中在 Performance 内部，禁止复制到 controller / Desktop。
9. 不锁 Account 父行，避免把目标配置保存与账户其他写操作无必要耦合。

### 验收

- [ ] 保存只有一个业务 transaction 边界。
- [ ] 第一次保存没有现成 target 行时也能正确串行化。
- [ ] account A / B 使用不同 identity key。
- [ ] portfolio 与任一 account 使用不同 identity key。
- [ ] create 失败时旧 active 自动恢复为 active（通过 rollback，而不是补偿写）。
- [ ] 正常保存返回的新版本为唯一 active。
- [ ] 权重非法时不会进入写 transaction。

## T4：收紧读取路径，不再通过 tie-breaking 容忍损坏状态

### 范围

- `apps/server/src/performance/performance-target.service.ts`
- Performance target / aggregation 单元测试

### 实施

1. 显式 target 读取依赖 DB 的“最多一个 active”不变量，不把 `orderBy` 当作多 active 的容错规则。
2. account target 聚合不再使用 `Map` 的“第一条获胜”语义隐藏重复 active。
3. 如果 migration 前兼容路径仍可能检测到异常，fail closed 并给出明确诊断；不得随机选一条继续计算再平衡。
4. 保留现有产品语义：显式 portfolio 优先；不存在显式 portfolio 时才聚合 account target。

### 验收

- [ ] 正常单 active 行为与当前产品一致。
- [ ] 测试不再把构造多个 active 后“选中一个”当成功条件。
- [ ] 显式 portfolio 优先语义不变。
- [ ] account 聚合结果不依赖查询顺序解决损坏状态。

## T5：新增真实 PostgreSQL 并发、rollback 与约束验收

### 范围

- `apps/server/test/performance/`
- 必要的 Postgres integration fixture/helper
- `.github/workflows/ci.yml`（仅接入现有数据库步骤）

### 实施

新增 TargetAllocation PostgreSQL integration test，至少覆盖：

1. 同一 account 并发 N 次保存；
2. portfolio 并发 N 次保存；
3. account A / B 并发保存；
4. account 与 portfolio 并发保存；
5. 已存在 active 时 transaction 中途失败；
6. DB 直接拒绝非法 identity、非正 version、重复 version、多 active；
7. portfolio `NULL accountId` 的唯一性；
8. migration preflight 对脏数据 fail closed。

最终状态必须检查：

- 成功版本没有重复；
- 同 identity 版本严格递增；
- 最终只有最大版本 active；
- 失败 transaction 没有留下半切换状态；
- 不同 identity 没有被单个全局锁强制串行。

### CI

复用现有 `contracts-and-guardrails` PostgreSQL 16 service 和 migration matrix；可以增加定向环境变量或命令，但不要创建重复数据库 workflow。

### 验收

- [ ] 测试使用真实 PostgreSQL。
- [ ] 同 identity 并发可重复稳定运行。
- [ ] rollback 验证基于数据库最终状态。
- [ ] DB constraint 测试直接绕过 service 写入。
- [ ] migration preflight 有真实数据库证据。
- [ ] 新测试接入现有 CI 数据库步骤。

## T6：同步文档完成度与生命周期

### 范围

- `docs/specs/2026-08-23-performance-analysis-interaction-design.md`
- `docs/specs/2026-09-16-performance-target-allocation-consistency.md`
- `docs/tasks/2026-09-16-performance-target-allocation-consistency.md`
- `docs/tasks/README.md`
- `docs/archive/tasks/`（仅完成后）

### 实施

1. 在旧 Performance 交互 Spec 增加后续关系说明：交互已实施，但 TargetAllocation 持久化并发一致性由本 Spec 收口。
2. 本任务在代码 / migration / PostgreSQL 验收完成前保持在 `docs/tasks/README.md` 的“当前仍在实施”。
3. 不修改旧文档历史验收证据，只修正容易被理解为“持久化保证也已全部完成”的描述。
4. 全部验收完成后：
   - 更新本 Spec 状态；
   - 将完成 Task 按当前文档生命周期规则迁入 `docs/archive/tasks/`；
   - 从 active task index 移除。

### 验收

- [ ] 旧交互 Spec 与本 correctness Spec 的职责不冲突。
- [ ] active task index 能定位本任务。
- [ ] “已实施”只在真实数据库验收完成后更新。
- [ ] 完成后的归档符合当前 `docs/DOCUMENTATION-GUIDE.md`。

## T7：最终全仓影响复查与质量验证

### 重新检查调用方

至少复查：

- `apps/server/src/performance` 全部 target 读写调用；
- `apps/desktop/src/features/performance` 的 fetch / save / mutation invalidation；
- `packages/schemas` 的 performance 契约导出；
- `packages/api-client` 是否暴露或依赖该契约；
- Account 永久删除对 `TargetAllocation.accountId` 的 FK / Restrict 语义；
- `docs/architecture/2026-09-02-server-module-boundaries.md` 的 Performance 所有权；
- migration matrix、CI PostgreSQL 步骤和 Performance 测试目录；
- seed / script / test 中任何直接操作 `TargetAllocation` 的路径。

### 质量命令

至少执行：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm migration:matrix
```

并执行新增 PostgreSQL 定向测试和：

```bash
git diff --check
```

### 完成条件

- [ ] PR diff 不包含无关重构。
- [ ] 没有遗漏新的 TargetAllocation 写入调用方。
- [ ] 没有新增跨模块反向依赖。
- [ ] migration 能从当前支持的历史矩阵升级。
- [ ] 合法 Desktop 流程兼容。
- [ ] 本 Spec 每个验收项都有代码、migration 或测试证据。

## 风险清单

| 风险 | 处理 |
| --- | --- |
| 历史已有非法 identity / 重复 version / 多 active | migration preflight fail closed，人工明确修复 |
| PostgreSQL NULL 绕过普通 unique | account / portfolio 使用各自 partial unique index |
| Prisma DSL 不表达 partial index / CHECK | raw migration 为数据库 SSOT，并由真实 DB 测试守护 |
| 第一次保存无 target 行可锁 | transaction-scoped advisory lock |
| 锁范围过大 | key 按规范化 identity 生成，不使用全局锁 |
| advisory key 偶发碰撞 | 最多额外串行；DB constraints 继续负责 correctness |
| create 失败导致旧目标消失 | 失活与创建位于同一 transaction，异常整体 rollback |
| API 收紧破坏客户端 | 只拒绝领域非法组合；先验证 Desktop/API client 当前调用 |
| 读取继续掩盖脏状态 | 删除“第一条获胜”的容错语义，异常 fail closed |
| 为复用而引入过度抽象 | helper 仅留在 Performance 内部 |

## 本轮不顺带处理

以下事项在当前全仓复审中被重新检查，但不属于本任务：

- `apps/server/src/integrity` 未装配且与 Quality 的历史重叠；后续独立清理。
- 周期现金 / 基金计划一致性已有独立设计，不在本 PR 重复。
- Backtest / Automation / Strategy Optimization durable lifecycle 按各自边界继续演进。
- Market V2 的路由、分页、分钟线等后续事项由对应 active Task / `docs/TODO.md` 承接。

这些候选项不应被混入本 PR，以免把一个可独立验证的持久化正确性任务扩大为无关重构。
