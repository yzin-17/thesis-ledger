# 目标配置版本与并发一致性加固

- 日期：2026-09-16
- 复审更新：2026-10-07
- 状态：待实施
- 来源：当前 `main@514abeebfe57bac0c16271439d8b777ff3b02a9f` 全仓架构复审
- 主要范围：`apps/server/src/performance`、`packages/schemas`、`apps/server/prisma`、Performance 相关测试与 CI
- 关联文档：`docs/specs/2026-08-23-performance-analysis-interaction-design.md`、`docs/architecture/2026-09-02-server-module-boundaries.md`

## 1. 本轮全仓 Review

本轮以当前 main 的完整仓库状态为审查对象，不以最近提交、PR 或上一轮遗留项代替全仓检查。递归 Git tree 未截断，共 2,574 个条目、2,382 个 blob；覆盖：

- Server 436 个源码文件和 327 个测试文件，包含 Ledger、Portfolio、Performance、Risk、Notifications、Market、Backtest、Automation、AI、Strategy Optimization、周期计划、Platform/Quality；
- Desktop 349 个源码文件和 62 个测试文件，包含 Performance、Strategy、Market、Account Data、Portfolio、Journal、AI 等主要 feature；
- Mobile 78 个文件及 Android/iOS 原生工程；
- `packages/domain`、`packages/schemas`、`packages/api-client`、`packages/shared`；
- `services/dsa-adapter`、47 个 scripts、CI/workflows 与工程守卫；
- 60 个 Prisma model、26 个 migration；
- 85 个 specs、428 个 tasks/evidence、8 个 architecture 文档及当前 TODO/归档关系。

当前 main 相比上一轮基线已完成一笔 300 文件规模的 Canonical / Market V3 / NAV Backtest 收敛，但本轮仍以整个当前树为主要证据。

### 1.1 架构结论

当前主体边界继续成立：

1. Ledger 仍是账户投资事实源；Portfolio/Performance 消费事实，不反向拥有 Ledger 交易事实。
2. workspace runtime dependency 继续由 `check-workspace-dependencies.mjs` 检查反向依赖和环。
3. Server source boundary 继续由 `check-boundaries.mjs` 限制 Ledger、Market reader、Backtest、AI、Notifications 等关键方向。
4. Backtest 使用 durable `executionAttempt`；AI Run 保留 claim/lease；Automation durable occurrence/lease 由 raw-owned `AutomationRunLease` 承担。没有证据支持为了本问题再抽象通用 Job Framework。
5. 最新 Canonical / Market V3 / NAV Backtest 工作已有现行 Spec/Task 承接，不重复开题。
6. QualityModule 实际装配 Integrity controller/service；Quality/Integrity 的问题是源码目录与运行时所有权表达不一致，而不是功能未装配。

没有发现需要推翻现有模块划分的大规模架构问题。

### 1.2 当前优先级

1. **工程门禁：当前 main 远端 CI 仍不绿色，但已有明确承接。** 2026-10-03 main push CI run `37120557150` 中 lint/typecheck 已通过；quality 在 NAV preparation 测试的跨平台临时目录上失败；PostgreSQL service E2E 仍有 Strategy Optimization 的 Canonical `executionModel` fixture 与 timeout 两项失败。Draft PR #46 已承接这些基线修复并有独立绿色 CI 证据，但尚未合入 main。它是当前直接 gate，不应在本 PR 复制实现。
2. **P1：TargetAllocation 持久化一致性。** 这是当前尚无其它专项承接、影响持久化正确性最高且范围收敛的问题。
3. **P2：文档维护性。** `docs/tasks` 已有 428 个文件、约 3.8 MB，单个 evidence 超过 600 KB，存在检索与生命周期漂移成本；应独立治理。
4. **P2：Quality/Integrity 目录所有权表达。** 不影响当前运行时装配。
5. 周期现金/基金、Market/Backtest、AI/Strategy Optimization、Journal 均已有当前 Spec/Task 或在途 PR，本轮不重复方案。

因此继续迭代未处理的 PR #41，不另开重复 PR。

## 2. 当前实现证据

### 2.1 保存不是原子操作

`PerformanceTargetService.saveTargets()` 当前依次执行：

1. `updateMany(... active: true)` 将旧目标置为 inactive；
2. `findFirst(... orderBy version desc)` 读取最新版本；
3. `create(version + 1, active: true)` 创建新版本。

三个操作没有位于同一个 PostgreSQL transaction，也没有同 identity 的数据库级串行化。后果包括：

- create 失败后旧 active 已永久失活；
- 并发请求可能读取同一个最新 version 并生成相同 nextVersion；
- 并发请求可能留下多条 active；
- API 成功响应与数据库最终唯一 active 之间缺少 durable fencing。

### 2.2 数据库未表达 identity / version / active 不变量

当前 `TargetAllocation` 只有普通 `@@index([scope, accountId, active])`，没有：

- `scope=account` 必须有 `accountId`、`scope=portfolio` 必须没有 `accountId` 的 CHECK；
- `version > 0` CHECK；
- 同 identity + version 唯一约束；
- 同 identity 最多一条 `active=true` 的约束。

portfolio 使用 `accountId = NULL`，不能依赖普通联合 unique 获得 singleton 语义。Prisma DSL 也不能完整表达本方案需要的 partial unique index / CHECK，因此 raw migration SQL 是这些数据库不变量的 SSOT。

### 2.3 HTTP identity 契约不一致

`performanceSeriesQuerySchema` 已有 account/portfolio 的 `scope + accountId` 组合规则，但 `performanceTargetsInputSchema` 没有同等约束；GET targets 也没有使用同一份运行时 identity parser。TypeScript 参数类型不能代替 HTTP 运行时校验。

### 2.4 读取路径会掩盖损坏状态

显式 target 读取仍通过 `findFirst(active=true, orderBy version desc)` 选一条；account 聚合读取所有 active 后按 version 排序，再用 Map 的 first-wins 行为选择记录。若库中已有重复 active，读取层会隐藏不变量破坏而不是 fail closed。

### 2.5 测试缺少真实 PostgreSQL correctness 证据

当前 Performance 测试目录只有 5 个文件；目标版本测试通过 fake Prisma 验证正常顺序下 version+1，无法证明：

- 同 identity 并发保存收敛；
- create/constraint 失败时旧 active rollback；
- 数据库直接拒绝非法 identity、重复 version、第二条 active；
- portfolio NULL accountId 不会绕过唯一性；
- migration 对历史脏数据 fail closed。

现有 CI 已有 PostgreSQL service、migration matrix 与数据库集成测试入口，因此无需新建平行基础设施。

### 2.6 调用方兼容性

Desktop 当前根据 accountId 构造 account/portfolio scope，合法调用不依赖非法组合。PerformanceService 只是委托 PerformanceTargetService；`packages/api-client` 当前没有额外 TargetAllocation 写入事实源。Account 永久删除继续由 TargetAllocation 的 Account FK/Restrict 参与关联保护。此次改造不改变 URL、目标权重含义、FX、TTWROR/XIRR 或实际/影子组合语义。

## 3. 正确性目标

对每个 TargetAllocation 逻辑 identity，系统必须始终满足：

1. identity 合法；
2. version 为正整数且同 identity 唯一；
3. 最多一个 active；
4. 新版本创建与旧版本失活原子提交；
5. 同 identity 并发保存产生唯一、单调版本序列；
6. 保存失败不破坏此前有效配置；
7. 读取层不通过排序或 first-wins 掩盖损坏状态。

合法 identity 只有：

| scope | accountId | identity |
| --- | --- | --- |
| account | 必须非空 | `account:<uuid>` |
| portfolio | 必须为空 | `portfolio` |

`mode` 不进入 identity；显式 portfolio 目标继续由 actual/shadow 共享。

## 4. 方案

### 4.1 统一 API identity

提取可复用 target identity schema，GET/POST 共用：

- account 必须提供 UUID accountId；
- portfolio 必须不提供 accountId；
- GET 缺省仍是 portfolio，但 accountId + portfolio/缺省 scope 明确拒绝；
- Desktop 合法流程无需改变 URL 或 payload。

### 4.2 数据库 fencing

在新 migration 中：

1. 同一显式 PostgreSQL migration transaction 内先执行 fail-closed preflight，再创建约束。
2. CHECK：只允许合法 scope/accountId 组合。
3. CHECK：`version > 0`。
4. account partial unique：`(accountId, version)`。
5. portfolio partial unique：`version`。
6. account partial unique：同 account 最多一个 active。
7. portfolio partial unique：singleton 最多一个 active。
8. 发现历史非法 identity、重复 version、多 active 时 migration 失败并给出可定位 id/identity/version，不自动删改历史。

新 migration 必须位于当前 head `20261001120000_require_explicit_strategy_contract` 之后；若实施时 main 已新增 migration，必须先重新读取实际 head 再命名和验证。

### 4.3 单 identity 串行化 transaction

`saveTargets()`：

1. 权重规范化/100% 校验先于数据库 transaction。
2. 开启单 PostgreSQL transaction。
3. 使用 transaction-scoped advisory lock 锁定规范化 identity：
   - `target-allocation:account:<accountId>`
   - `target-allocation:portfolio`
4. 拿锁后重新读取最大 version。
5. transaction 内失活旧 active 并创建 next version。
6. 任一步失败整体 rollback。
7. DB constraints 继续作为最终 fencing，不捕获 constraint error 后伪装成功。

advisory lock 解决“第一次保存无现成行可 FOR UPDATE”的问题；不同 account 与 portfolio 不应被一个全局锁强制串行。

### 4.4 读取 fail closed

数据库约束落地后，不再把 orderBy/Map 当损坏状态容错：

- 正常路径假定最多一个 active；
- migration 兼容窗口若检测到异常，明确报错；
- 保持“显式 portfolio 优先；无显式 portfolio 才聚合 account target”的产品语义。

### 4.5 真实 PostgreSQL 验收

新增定向 integration test，至少覆盖：

- 同 account 并发 N 次保存；
- portfolio 并发 N 次保存；
- account A/B 并发；
- account 与 portfolio 并发；
- transaction 中途失败 rollback；
- 直接 SQL 拒绝非法 identity、非正 version、重复 version、多 active；
- portfolio NULL identity 唯一性；
- migration dirty-data preflight fail closed；
- 不同 identity 没有被全局锁误串行。

复用现有 PostgreSQL CI，不新建平行 workflow。

## 5. 非目标

- 不重做 Performance UI/Sheet；
- 不修改 TTWROR、XIRR、allocation/rebalance 算法或 FX 语义；
- 不把 mode 加入 TargetAllocation identity；
- 不把 TargetAllocation 移入 Ledger；
- 不提供目标历史回滚 UI；
- 不抽象通用 VersionedEntity、Lock Service 或 Job Framework；
- 不顺带处理 Journal、Market、AI、周期计划、Quality/Integrity 或 docs evidence 清理。

## 6. 迁移、并发与兼容风险

| 风险 | 处理 |
| --- | --- |
| 历史已有非法 identity / 重复 version / 多 active | migration preflight fail closed，人工明确修复 |
| PostgreSQL NULL 绕过普通 unique | account/portfolio 分离 partial unique index |
| Prisma DSL 无法表达部分约束 | raw migration SQL 为 DB SSOT，真实 PG 测试守护 |
| preflight 与 DDL 分步产生竞争窗口 | 同一显式 migration transaction |
| 第一次保存无现成 target 行 | transaction-scoped advisory lock |
| 锁范围过大 | identity 级 key，不用全局锁 |
| create 失败导致旧目标消失 | 失活和创建单 transaction rollback |
| API 收紧影响客户端 | 只拒绝领域非法组合，先验证 Desktop/API client |
| 读取继续掩盖脏状态 | 移除 first-wins/tie-break 容错，异常 fail closed |

## 7. 验收标准

- GET/POST 使用同一 Target identity 规则；
- 数据库拒绝非法 identity、非正/重复 version 和第二条 active；
- 保存只有一个业务 transaction，并对同 identity 串行化；
- 同 identity 并发稳定得到单调唯一版本和唯一 active；
- 保存失败后此前 active 不变；
- portfolio NULL identity 被数据库正确保护；
- 读取不再通过排序/Map 隐藏损坏状态；
- migration preflight 与 DDL 同 transaction，能从当前 migration head 升级；
- 新增真实 PostgreSQL 测试接入现有 CI；
- 合法 Desktop 流程、Account 删除关联保护、Performance 所有权和 workspace 依赖方向不变；
- PR diff 不包含无关大规模重构；
- 完成前重新检查当前 main/PR 全量 CI。不能用 Draft PR #46 的结果替代本 PR 的最终验收，也不能通过跳过 gate 制造绿色。

## 8. 与现有文档的关系

`2026-08-23-performance-analysis-interaction-design.md` 的“已实施”继续表示交互与正常业务路径已落地；本 Spec 专门补齐 TargetAllocation 的数据库并发与版本正确性。实现完成后应在旧 Performance Spec 增加后续关系说明，并按当前文档生命周期规则归档本 Task；在代码、migration 与真实 PostgreSQL 验收完成前，本 Task 保持 active。
