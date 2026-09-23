# 目标配置版本与并发一致性加固

- 日期：2026-09-16
- 复审更新：2026-09-23
- 状态：待实施
- 来源：当前 `main@fe0e871e37a09964f7a113b82e7d09f6d4d95f7e` 全仓架构复审
- 主要范围：`apps/server/src/performance`、`packages/schemas`、`apps/server/prisma`、Performance 相关测试与 CI
- 关联文档：`docs/specs/2026-08-23-performance-analysis-interaction-design.md`、`docs/architecture/2026-09-02-server-module-boundaries.md`

## 1. 本轮全仓 Review 范围与结论

本次复审重新以当前 `main` 的全仓状态为对象，而不是以上一次 Review、最近提交或最近 PR 为范围。覆盖：

- `apps/server`：模块装配，以及 Ledger / Portfolio / Performance / Risk / Notification / Market / Backtest / Automation / AI / Strategy Optimization / 周期计划等主要边界、事务与状态生命周期；
- `apps/desktop`：feature / request 分层、Performance 目标配置调用链，以及当前 Market / AI / Account Data 客户端交互；
- `apps/mobile`：React Native 客户端依赖、原生 Android 工程与只读组合能力边界；
- `packages/domain`、`packages/schemas`、`packages/api-client`、`packages/shared` 的 runtime dependency 方向与契约职责；
- `services/dsa-adapter` 的 Provider 适配边界与测试；
- `scripts/check-boundaries.mjs`、`scripts/check-workspace-dependencies.mjs`、migration matrix、复杂度、发布与恢复等工程守卫；
- Prisma schema 与当前全部 migrations；
- Server / Desktop / Mobile / Package 测试结构与 `.github/workflows/ci.yml`；
- `docs/specs`、`docs/tasks`、`docs/architecture`、`docs/TODO.md` 与当前实现的对应关系。

当前总体架构方向仍成立：Ledger 继续作为投资事实源，Portfolio 负责用户意图和组合编排，Performance 拥有收益分析与目标配置；Market V2 已把行情事实读取收敛到 `MarketBarReader` 并由工程守卫限制旁路；Backtest / Automation / Strategy Optimization 的后台执行继续遵循 PostgreSQL durable identity / owner fencing 原则；workspace package graph 已有 runtime cycle 与反向依赖机器守卫。未发现需要推翻现有模块划分的大规模架构问题。

### 1.1 当前优先级排序

本轮重新比较当前 main 的候选问题后，优先级如下：

1. **P1：`TargetAllocation` 持久化一致性。** 当前仍存在非原子 active 切换、并发重复 version / 多 active、非法 identity 可进入服务层、读取通过排序掩盖损坏状态，并且没有真实 PostgreSQL 验收。该问题直接影响再平衡目标这一持久配置事实的正确性，且修复范围集中、可独立验证，因此继续作为本轮推进项。
2. **P2：`apps/server/src/integrity` 未装配且与 Quality 存在历史重叠。** 当前 `AppModule` 只装配 `QualityModule`，`integrity` 目录仍保留 controller/service；这是清理与所有权表达问题，但当前不会形成比 TargetAllocation 更高的运行时正确性风险。
3. **P2 / 已有承接：近期 AI Provider 生成模式、探针参数、JSON validated 输出分类等。** 2026-09-21～23 的 AI Provider 变化已由 active Task / review / `docs/TODO.md` 承接；已知 probe 参数、JSON 语义约束、空内容错误分类和 JSON prompt guard 均已有明确触发条件。本轮没有新增足以越过 TargetAllocation 的独立 P0/P1 证据，不重复创建方案。
4. **已有专项：** 周期现金/基金计划、Backtest、Automation、Strategy Optimization、Market V2 均已有当前 Spec/Task 或已实现的 durable lifecycle / reader boundary，不因最近改动而重复开题。

因此，上一轮 PR #41 尚未处理时，本轮继续迭代原 PR，而不是制造新的重复 PR。

### 1.2 2026-09-23 复审确认

相对上一次 #41 review，当前 main 又合入了 AI SDK / Provider mode、自动能力选择与 verified-save 等实现，但以下关键事实未变化：

- `PerformanceTargetService.saveTargets()` 仍是三个彼此独立的 Prisma 操作，没有 transaction 或 identity lock；
- `TargetAllocation` 仍只有普通索引，没有 identity CHECK、正 version CHECK、版本唯一和单 active 数据库约束；
- `performanceTargetsInputSchema` 仍未复用 `performanceSeriesQuerySchema` 已有的 `scope + accountId` identity 规则；
- `GET /performance/targets` 仍直接依赖 controller 参数类型，没有统一运行时 target identity parser；
- `apps/server/test/performance/` 当前只有普通 Performance 单元/服务测试，没有 TargetAllocation PostgreSQL 并发测试；
- CI 的 PostgreSQL 16 job 已运行 Strategy Optimization / Automation 数据库 E2E，但尚未运行 TargetAllocation 数据库验收。

所以本 Spec 的问题定义与方案仍成立，不需要因当前 main 的后续变化扩大范围。

## 2. 当前实现证据

### 2.1 保存不是原子操作

`apps/server/src/performance/performance-target.service.ts` 的 `saveTargets()` 当前依次执行：

1. `updateMany(... active: true)` 将旧目标置为 inactive；
2. `findFirst(... orderBy version desc)` 读取最新版本；
3. `create(version + 1, active: true)` 创建新版本。

三个数据库操作没有位于同一 transaction。因此：

- 第二或第三步失败时，旧有效目标可能已经被永久失活；
- 两个并发请求可以同时读到相同最新版本并生成同一个 `nextVersion`；
- 两个并发请求可能各自留下 `active=true` 行；
- API 返回成功与数据库最终唯一 active 之间没有持久化 fencing。

### 2.2 数据库没有保护 identity / version / active

当前 `TargetAllocation` 为：

```prisma
model TargetAllocation {
  id        String   @id @default(uuid()) @db.Uuid
  scope     String
  accountId String?  @db.Uuid
  version   Int      @default(1)
  targets   Json
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  account   Account? @relation(fields: [accountId], references: [id], onDelete: Restrict)

  @@index([scope, accountId, active])
}
```

缺少：

- `scope=account` 必须带 `accountId`、`scope=portfolio` 必须不带 `accountId` 的 CHECK；
- 同一逻辑身份的 `(identity, version)` 唯一约束；
- 同一逻辑身份最多一条 `active=true` 的唯一约束；
- `version > 0` 的持久化保护。

`portfolio` 使用 `accountId = NULL`。PostgreSQL 普通 unique 对 NULL 的语义意味着简单增加 `@@unique([scope, accountId, version])` 不能可靠表达 singleton portfolio 的版本唯一性，必须用 raw SQL partial unique index 或等价数据库约束。

Prisma schema 当前也无法原生表达本方案需要的 partial unique index / CHECK；因此这些数据库不变量以 migration SQL 为 SSOT，schema 只保留可表达的字段与普通索引，不伪造 Prisma 层已经声明了数据库约束。

### 2.3 HTTP 对 identity 的校验不一致

`packages/schemas/src/performance.ts` 中 `performanceSeriesQuerySchema` 已通过 `superRefine` 明确：

- `scope=account` 必须提供 UUID `accountId`；
- `scope=portfolio` 不能提供 `accountId`。

但 `performanceTargetsInputSchema` 目前只把 `accountId` 声明为 optional，没有同样的 identity 规则。`POST /performance/targets` 直接解析这一 schema，因此当前会接受领域上非法的组合。

`GET /performance/targets` 也没有使用同一份运行时 target identity schema，而是 controller 参数类型 + 默认 `scope='portfolio'` 后直接传入 service。TypeScript 类型不能替代 HTTP 运行时验证。

### 2.4 读取路径掩盖损坏状态

`targets()` 当前：

- 显式目标使用 `findFirst({ active: true, orderBy: { version: 'desc' } })`；
- account 聚合读取所有 active 后按 `accountId + version desc` 排序，再用 `Map` 让第一条获胜。

如果数据库已经存在多 active 或同版本冲突，读取层会“选出一条”而不是暴露违反不变量的状态，导致结果依赖排序细节。

### 2.5 测试仍主要是 fake Prisma

`apps/server/test/performance/services.test.ts` 的目标配置版本测试通过 fake Prisma 模拟 `updateMany -> findFirst -> create`，能证明普通顺序下版本加一，却不能证明：

- PostgreSQL 并发保存收敛；
- create 失败时旧 active 回滚；
- 数据库直接拒绝非法 identity、重复 version 或第二个 active；
- portfolio `NULL accountId` 不会绕过唯一性；
- migration 对历史脏数据 fail closed。

当前 `apps/server/test/performance/` 只有 `fx-conversion.test.ts`、`services.test.ts`、`valuation-series.test.ts`；CI 已有 PostgreSQL 16 service、migration matrix 和定向数据库集成测试入口，因此无需新建平行基础设施。

### 2.6 Desktop 合法调用链与本方案兼容

Desktop `fetchPerformanceTargets()` 会根据是否存在 `accountId` 显式构造 `scope=account|portfolio`；保存请求也使用同一语义。当前合法 Desktop 流程不依赖非法 scope/accountId 组合。因此收紧 Server 契约属于错误输入拒绝，不要求改变产品交互或 URL。

### 2.7 文档完成度仍高于持久化保证

`docs/specs/2026-08-23-performance-analysis-interaction-design.md` 状态为“已实施”，并明确了：

- 单账户保存 account 级目标；
- 全部账户保存 portfolio 级目标；
- 保存生成新版本；
- 显式 portfolio 目标优先于 account 聚合目标。

这些交互与普通读取行为已经落地，但“版本”仍只是应用层递增字段，没有并发唯一性和原子 active 切换保证。因此旧 Spec 的“已实施”只能表示交互与正常路径已实施，本 Spec 负责补齐持久化正确性闭环。

## 3. 问题定义

`TargetAllocation` 是 Performance 模块用于再平衡建议的持久化配置事实。对同一逻辑身份，系统必须始终满足：

1. identity 合法；
2. 每个 version 唯一且为正整数；
3. 最多一个 version 为 active；
4. 新版本创建与旧版本失活原子提交；
5. 同 identity 并发保存收敛为唯一、单调的版本序列；
6. 保存失败不能破坏此前有效配置；
7. 读取层不通过 tie-breaking 掩盖数据库损坏状态。

当前实现无法保证 2–7，并且 API 允许违反 1 的输入。

## 4. 目标

1. 明确定义 `TargetAllocation` 的逻辑 identity 与数据库不变量。
2. 将保存改为单 PostgreSQL transaction、同 identity 串行化的版本切换。
3. 使用 DB CHECK / partial unique index 作为最终 fencing，而不是依赖应用查询顺序。
4. 统一 GET / POST 对 `scope + accountId` 的运行时校验。
5. 对历史脏数据采用 migration preflight fail closed，不静默删改历史。
6. 增加真实 PostgreSQL 并发、回滚、约束和迁移验收，并接入现有 CI。
7. 保持 Desktop 合法调用、目标权重语义、显式 portfolio 优先级和 API URL 兼容。

## 5. 非目标

- 不重做 Performance UI 或目标配置 Sheet。
- 不修改 TTWROR、XIRR、allocation / rebalance 公式或 FX 规则。
- 不把 `mode` 加入 TargetAllocation identity；显式 portfolio 目标继续由 actual / shadow 共享。
- 不把 TargetAllocation 移入 Ledger。
- 不提供目标历史回滚 UI。
- 不引入通用 VersionedEntity、全局 Lock Service 或跨领域事务框架。
- 不顺带清理 `integrity`、AI Provider、周期计划、Market 或其他无关技术债。

## 6. 领域 identity 与不变量

只存在两种合法 identity：

| scope | accountId | identity |
| --- | --- | --- |
| `account` | 必须非空 | `account:<accountId>` |
| `portfolio` | 必须为空 | `portfolio` |

`mode` 不属于 identity。

对每个 identity：

- `(identity, version)` 必须唯一；
- `version > 0` 且成功保存后单调递增；
- `active=true` 最多一条；
- 成功保存后新版本是唯一 active；
- 事务失败后旧 active 保持不变；
- 读取不得把多 active / 重复版本当正常状态。

## 7. 方案

### 7.1 统一 target identity 契约

在 `packages/schemas/src/performance.ts` 提取可复用的 target identity 规则，例如 `performanceTargetIdentitySchema`：

- account 必须提供 UUID `accountId`；
- portfolio 必须不提供 `accountId`。

POST input 在该 identity 上扩展 `targets`；GET query 复用同一 identity 规则，并继续扩展现有 `mode` / `fxMerge` / `baseCurrency` 参数。不要复制两套 `superRefine`。

保持 GET 默认 portfolio 的现有行为，但 `accountId` 与缺省/portfolio scope 的非法组合必须被明确拒绝，不能继续形成 `portfolio + accountId` 的隐藏 identity。

### 7.2 migration 建立数据库不变量

新增 raw SQL migration，按 account / portfolio 分别建立约束：

1. CHECK：只允许 `account + accountId 非空` 或 `portfolio + accountId 为空`；
2. CHECK：`version > 0`；
3. account `(accountId, version)` partial unique；
4. portfolio `version` partial unique；
5. account `accountId` 在 `active=true` 条件下 partial unique；
6. portfolio singleton 在 `active=true` 条件下 partial unique。

示意：

```sql
CREATE UNIQUE INDEX ... ON "TargetAllocation" ("accountId", "version")
WHERE "scope" = 'account';

CREATE UNIQUE INDEX ... ON "TargetAllocation" ("version")
WHERE "scope" = 'portfolio' AND "accountId" IS NULL;

CREATE UNIQUE INDEX ... ON "TargetAllocation" ("accountId")
WHERE "scope" = 'account' AND "active" = true;

CREATE UNIQUE INDEX ... ON "TargetAllocation" ("scope")
WHERE "scope" = 'portfolio' AND "accountId" IS NULL AND "active" = true;
```

数据库 migration 是 partial index / CHECK 的事实源；不要因为 Prisma DSL 不能表达这些约束而退化为只在 service 中校验。

### 7.3 migration 前置检查必须 fail closed

在创建约束前检查并定位：

- 非法 scope/accountId；
- 非正 version；
- 同 identity + version 重复；
- 同 identity 多 active。

发现任一脏数据时 migration 失败，并输出足够定位问题的 identity / version / id 信息。不得自动删除、覆盖、重新编号或任意选择“赢家”。如果真实环境存在脏数据，先通过独立、可审计的一次性修复明确决策，再重新执行约束 migration。

### 7.4 保存收敛为 transaction + 同 identity 串行化

权重规范化与 100% 校验继续在进入数据库写事务前完成。数据库流程：

1. 开启一个 Prisma/PostgreSQL transaction；
2. 对规范化 identity 获取 transaction-scoped advisory lock；
3. 拿锁后重新读取当前最大 version；
4. 将当前 active 置为 false；
5. 创建 `nextVersion = maxVersion + 1` 且 `active=true` 的新行；
6. 提交。

建议锁 identity：

- `target-allocation:account:<accountId>`；
- `target-allocation:portfolio`。

锁实现必须是 transaction-scoped。可以使用 PostgreSQL 稳定文本哈希生成 advisory key；哈希碰撞最多导致无关 identity 被额外串行，不得影响正确性，最终正确性仍由数据库 unique / CHECK fencing 保证。

只锁现有 `TargetAllocation` 行不足以覆盖第一次保存时没有可锁行的竞争；锁 `Account` 父行又会无必要地耦合账户删除等写操作，因此使用独立 identity advisory lock 更符合当前边界。

操作顺序允许先失活旧行再创建新行，但两步必须处于同一 transaction：create / constraint 失败时失活必须一起回滚。

### 7.5 读取不再容忍损坏状态

约束上线后：

- 显式 target 读取基于“最多一条 active”的 DB 不变量；
- account 聚合不再使用 `Map` 的“第一条获胜”作为容错策略；
- 若实现阶段需要兼容 migration 前状态，检测到多个 active 时 fail closed 并给出诊断，不随机返回其中一条；
- 保持显式 portfolio 优先、无显式 portfolio 时才按 account target 聚合的产品语义。

### 7.6 不扩大公共抽象

StrategyVersion、PortfolioSnapshot、ProviderPolicyRevision 等模型也具有版本概念，但 identity、切换、回滚和并发语义不同。本任务只在 Performance 内部建立必要 helper，不抽象通用 VersionedEntity / Lock Framework。

## 8. 测试与验证

### 8.1 契约测试

至少覆盖：

- POST account + accountId 通过；
- POST account 缺 accountId 拒绝；
- POST portfolio 无 accountId 通过；
- POST portfolio + accountId 拒绝；
- GET 使用相同 identity 规则；
- Desktop 当前合法 account / portfolio 请求保持可解析。

### 8.2 服务单元测试

至少覆盖：

- 权重校验发生在 transaction 前；
- account / portfolio identity 生成稳定且互不冲突；
- 保存只有一个业务 transaction 边界；
- create 失败向上返回错误，不伪装成功。

### 8.3 真实 PostgreSQL 集成测试

复用现有 CI PostgreSQL 16 service，至少覆盖：

1. 同 account 并发 N 次保存：成功版本无重复、严格递增，最终仅最大版本 active；
2. portfolio 并发 N 次保存：同样收敛；
3. account A / B 并发：证明不是全局 mutex；
4. account 与 portfolio 并发：互不错误阻塞；
5. 已有 active 时注入事务中途失败：旧 active 仍为 true；
6. 直接 SQL 插入非法 identity、重复 version、第二个 active：DB 拒绝；
7. portfolio `NULL accountId` 重复 version：DB 拒绝；
8. migration preflight 对构造的历史脏数据 fail closed。

测试必须断言数据库最终状态，不只断言 HTTP / service 返回值。

### 8.4 CI 与全量质量

把新增 Postgres test 加入现有 `contracts-and-guardrails` 的数据库步骤，不创建新的孤立 workflow。实施 PR 至少执行：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm migration:matrix
```

并执行新增 TargetAllocation PostgreSQL 定向测试与 `git diff --check`。

## 9. 验收标准

1. API 无法创建非法 scope/accountId 组合。
2. DB 自身无法保存非法 identity 或非正 version。
3. 同 identity 不可能存在重复 version。
4. 同 identity 不可能存在两个 active。
5. 同 identity 并发保存收敛为唯一、有序版本序列。
6. 保存任一步失败都不会让旧 active 永久失活。
7. portfolio 的 NULL accountId 不绕过唯一性。
8. 不同 identity 不被单一全局锁串行化。
9. 读取层不通过排序 / Map 隐藏损坏状态。
10. Desktop 合法保存/读取和显式 portfolio 优先语义保持兼容。
11. 真实 PostgreSQL 测试证明并发、rollback、DB fencing 和 migration preflight。
12. migration 对历史脏数据 fail closed，不静默修改历史。

## 10. 风险与兼容性

| 风险 | 处理 |
| --- | --- |
| 历史已有非法 identity / 重复 version / 多 active | migration preflight fail closed，人工明确修复 |
| PostgreSQL NULL 绕过普通 unique | account / portfolio 使用各自 partial unique index |
| 第一次保存没有可锁 target 行 | transaction-scoped advisory lock |
| advisory key 冲突或范围过大 | identity 级稳定 key；DB constraint 为最终 fencing；禁止全局锁 |
| create 失败后旧 target 消失 | 失活与创建位于同一 transaction，异常整体 rollback |
| Prisma DSL 不能表达 partial index / CHECK | raw migration 为数据库不变量 SSOT，并由 migration / Postgres test 验证 |
| API 收紧影响客户端 | 只拒绝领域非法组合；当前 Desktop 显式构造合法 scope/accountId |
| 为复用引入过度抽象 | helper 保持 Performance 内部，不建设通用版本/锁框架 |

## 11. 与现有 Spec / Architecture 的关系

- `2026-08-23-performance-analysis-interaction-design.md`：继续作为页面与目标配置交互 SSOT；其“已实施”不等于并发持久化闭环已完成。本 Spec 是后续 correctness hardening。
- `2026-09-02-server-module-boundaries.md`：不改变依赖方向；Performance 继续拥有 TargetAllocation，不向 Ledger 注入目标配置写入。
- Ledger / Portfolio 原子写入原则：仅复用“跨记录状态切换必须由 transaction + DB invariants 保护”的原则，不复用 Ledger 领域实现。
- Backtest / Automation / Strategy Optimization：仅参考 durable state/fencing 原则，不引入跨模块 Job/Lock 依赖。
- AI Provider / Market 等近期变化：保持由各自 active Spec/Task/TODO 承接，不把它们与本持久化正确性任务耦合。
- 文档生命周期治理：本任务在代码、migration、真实 PostgreSQL 验收全部完成前保持 active；完成后按当前 docs 规则归档 Task，并在相关旧 Spec 中补后续关系说明。
