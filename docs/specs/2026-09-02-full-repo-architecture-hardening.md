# 全仓架构审查与核心边界加固 Spec

> 日期：2026-09-02  
> 状态：Draft  
> 任务标识：`2026-09-02-full-repo-architecture-hardening`

## 1. 背景

本 Spec 是对 2026-09-02 周审的重新执行。审查基线为当时最新 `main`，本轮不以最近提交、最近 PR 或上一轮遗留项作为范围，而是重新横向检查整个仓库当前状态。

审查覆盖：

- `apps/server`：Ledger、Portfolio、Risk、Performance、Market、Import、Automation、AI、Journal、Notification、Provider、Platform 等服务边界；
- `apps/desktop`、`apps/mobile`：feature 划分、请求层、共享 API Client 使用方式、历史巨型组件拆分结果；
- `packages/domain`、`packages/schemas`、`packages/api-client`、`packages/shared`：职责与 workspace 依赖方向；
- `services/dsa-adapter`：跨仓适配边界；
- Prisma schema / migration、测试结构、`scripts/` 工程守卫和 GitHub Actions；
- 当前 `docs/specs`、`docs/tasks`、`docs/architecture` 与实现的一致性。

本轮目标不是把所有技术债塞进一个实施 PR，而是先完整识别候选项，再按“正确性风险 > 架构扩散风险 > 单纯文件大小”排序，选择可收敛、可验证的一组改进。

## 2. 全仓审查结论

### P0：Portfolio 仍在应用层拼装多个 Ledger V2 写命令

当前 `LedgerService.setPosition()` 已通过 `LedgerV2Repository.withAccountWrite()` 将单次 Baseline Observation、Ledger Revision 与 projection rebuild 放在同一账户写事务中；跨账户写能力也已经存在 `withAccountsWrite()`。

但 `PortfolioService` 仍有两个复合用户意图被拆成多个独立命令：

1. `updatePosition()` 在 `accountId` 或 `symbol` 改变时，先对旧位置执行 `setPosition(..., 0)`，然后再对新位置执行第二个 `setPosition(...)`；
2. `clearPositions()` 先在 Portfolio 层读取持仓，再循环对每个标的调用独立 `setPosition(..., 0)`。

因此当前只有“单个 Ledger 命令原子”，没有“一个用户意图原子”。后续步骤失败时可能留下部分提交；批量清仓还会产生 N 次账户锁定和 N 次 projection rebuild。

这是本轮最高优先级，因为它影响账本事实与读取模型的一致性，而不仅是代码风格。

### P1：RiskService 已成为多职责服务

`apps/server/src/risk/risk.service.ts` 当前同时承载：

- Risk Rule CRUD、版本与 audit；
- rule target / position 校验；
- Security / Account / Portfolio context 聚合与 enrichment；
- stale 校验、holding peak 状态维护；
- rule evaluation 编排；
- RiskEvent 去重与持久化；
- regular / trailing trigger state machine；
- scan orchestration；
- Notification 查询与 enqueue 协调。

该文件已经明显超过项目对 server service 的 600 行 guardrail。现有 ratchet 只保证历史超限文件不继续增长，不能替代职责拆分。这里的问题不是“文件大”本身，而是规则管理、上下文构建、评估、状态持久化和通知编排共享同一个变化边界，后续任何一种规则或通知语义变化都会扩大回归面。

### P1：PerformanceService 同样混合采集、FX、收益与配置职责

`apps/server/src/performance/performance.service.ts` 也已经超过 server service 600 行 guardrail，并同时处理：

- Snapshot capture / history；
- Position + Ledger + Market 数据获取；
- 多币种 FX 解析、历史汇率证据和转换；
- TTWROR / XIRR 输入编排；
- layer / allocation / rebalance 读取；
- TargetAllocation 的保存、聚合和 fallback；
- 多账户、多币种兼容状态。

其中 FX 原语已经存在于 `market/fx-conversion.ts`，说明可以在不引入新框架的前提下，把 Snapshot 生命周期与分析/配置读取拆成更清晰的 application services。

### P2：workspace package 依赖图没有机器级守卫

当前 package 依赖方向总体合理：

- `shared` 无内部 runtime 依赖；
- `domain -> shared`；
- `api-client -> schemas`；
- `dsa-adapter -> domain + schemas`；
- apps 位于 packages 之上。

但 `scripts/check-boundaries.mjs` 只检查相对路径 import，并在遇到非相对 specifier 时直接跳过，因此不会验证 `@thesis-ledger/*` workspace alias / `package.json` dependency graph，也不会主动阻止 runtime dependency cycle。

当前没有发现已经形成的错误 package 环，但随着 package 数增加，现有 guardrail 无法阻止未来反向依赖。

### P2：Ledger V2 仍保留失效的旧 HTTP 写入口

`POST /ledger/events` 仍由 `LedgerController` 暴露，但 `LedgerService.append()` 已固定拒绝并要求使用专用 V2 命令。V2 专用 execution / cash / baseline endpoints 已经存在，因此当前 API surface 同时存在“可发现但永远失败”的旧写入口。

这不是本轮 P0，但属于 V1 -> V2 收敛未完全结束的契约债。应在确认 Desktop/Mobile/API Client/外部脚本没有依赖后，选择删除 endpoint 或以明确、可测试的 deprecation contract 过渡，而不是无限期保留一个普通 400 失败入口。

## 3. 已检查但本轮不作为改造重点的区域

### Desktop / Mobile

`2026-08-23-large-component-split` 的主要实现已经完成：旧 `legacy-pages.tsx` 已被领域 feature 取代，Desktop 请求层已围绕 API Client + Query/Mutation 收敛，Mobile 入口也已拆出 Portfolio / Risk 等组件。

因此本轮不重复提出“再拆一次前端页面”。仍存在 bundle warning、真实浏览器/设备 smoke 等运行验收项，但它们不是本轮最重要的代码架构问题。

### AI / Automation / Import / Market

这些区域虽然也存在中大型文件，但当前已经形成多个职责服务，例如 AI 的 executor / run service / provider registry / tool runtime，Automation 的 runtime / scheduler / workflow runner，Import 的 draft / commit / rollback，Market 的 storage / detail / catalog / control。与 Risk / Performance 相比，职责边界已经更清晰，因此不因为文件大小机械重构。

### Ledger Baseline Import

`baseline-import.service.ts` 仍然较大，但它正处于 Ledger V2 的事实写入、Draft Revision 与 reconciliation 迁移链路中，且周边已经有 support / reconciliation / repository / projection 分层。本轮先修复明确的复合事务边界，避免同时打开另一条高风险迁移链。

### API Client

`packages/api-client/src/index.ts` 集中了多个 namespace，但目前统一了 schema parse、request、异常处理与客户端契约，没有发现反向依赖或第二套请求实现。它属于可继续观察的组织债，不优先于 Server 正确性和职责边界问题。

## 4. Spec / 设计文档一致性检查

### 4.1 Ledger V2 的原子性原则实现不完整

`2026-08-26-trade-execution-ledger-system` 及写入/修正子 Spec 已将 LedgerEvent 定义为唯一经济事实源，并要求账户级串行写入、Revision 与核心 projection 原子提交。

单个 `setPosition()` 已符合这一方向，但 Portfolio 通过两个或 N 个独立命令表达一个用户意图，说明“事务边界归属 Ledger 写命令层”还没有覆盖所有调用方。

本轮需要补的是调用方边界，不是重新设计 Ledger V2。

### 4.2 旧 Position Entry 文档已被 V2 覆盖，后续不能再按 V1 Adjustment 语义扩展

现有 V2 主 Spec 已明确覆盖旧 Position Entry 中的 Adjustment 写入描述。后续 Portfolio 修复必须继续生成 V2 Baseline Observation，不得为了方便事务处理恢复旧 LedgerEvent V1 写法。

### 4.3 前端巨型组件拆分已经完成，不应重复生成同类 Spec

`2026-08-23-large-component-split` Task 已将 T1-T7 与 Review 修复项标记完成。当前仓库结构也已不存在原来的 `legacy-pages.tsx`。因此本轮如果再次提出同一方案会形成重复文档，而不是新增价值。

### 4.4 Server 内部模块职责缺少当前 Architecture SSOT

当前 `docs/architecture/` 主要记录 DSA、Provider 与版本兼容边界，对 Server 内部的 Ledger / Portfolio / Risk / Performance / Notification 等模块依赖方向没有一份当前 SSOT。实际约束一部分隐藏在 Nest Module，一部分隐藏在 `check-boundaries.mjs`。

本轮实施后应补一份简洁的 Server module boundary 文档，避免依赖规则只存在于脚本代码中。

## 5. 本轮选择范围

### 立即实施范围

1. P0：Ledger-owned 原子持仓身份迁移；
2. P0/P1：Ledger-owned 原子批量清仓，并把 rebuild 收敛为每账户一次；
3. P1：按职责拆分 RiskService；
4. P1：按职责拆分 PerformanceService；
5. P2：增加 workspace runtime dependency graph guard；
6. P2：审计并收敛旧 `/ledger/events` 写入口；
7. 同步 Server module boundary Architecture SSOT。

### 为什么这些可以放在同一份计划

它们共同解决当前 Server 的“边界只靠调用习惯而非显式所有权”问题：

- Ledger：事务所有权泄漏到 Portfolio；
- Risk / Performance：业务职责所有权过度集中；
- packages：依赖方向没有机器级所有权约束；
- API：V2 已替代 V1，但旧入口所有权没有完全收口。

实施仍应拆成多个小代码 PR，不要求一次性大改。

## 6. 非目标

- 不重写 Ledger V2 / Trade Projection / Cash Projection；
- 不引入通用 Command Bus、Unit of Work、Saga、Repository Framework；
- 不重做 Desktop / Mobile UI；
- 不把 Risk / Performance 领域逻辑迁出 `packages/domain` 或反向搬入 domain；
- 不改变现有 HTTP response shape，除明确处理已失效的 `/ledger/events`；
- 不重构 DSA；
- 不把所有超过阈值的文件一次拆完；
- 不为“对称”创建没有独立变化理由的 service。

## 7. 设计方案

### 7.1 Ledger 复合持仓命令

#### 原子持仓迁移

在 Ledger application boundary 增加窄命令，例如 `movePositionBaseline()`：

- 同账户换 symbol：一个 `withAccountWrite()`；
- 跨账户：一个 `withAccountsWrite()`；
- 同一数据库事务内追加旧位置归零和新位置 Baseline Observation；
- 每个受影响账户只 rebuild 一次；
- 全部成功后共同提交；任一步失败全部回滚；
- 不要求两个账户共享一个 Ledger Revision，但两个账户的 revision advancement 必须随同一 DB transaction 共同成功或失败。

#### 原子批量清仓

在 Ledger 层增加 `clearPositions(accountId)` 或等价窄命令：

- 在账户写事务内读取当前 Position；
- 按稳定 symbol 顺序生成 quantity=0 Baseline Observation；
- 明确一次命令内多事件的 Revision / `economicOrderKey` 规则；
- 事件全部追加后只执行一次 projection rebuild；
- `PortfolioService.clearPositions()` 不再事务外读取 + 循环调用单写命令。

### 7.2 RiskService 以变化理由拆分

不创建“万能 manager”。建议最少拆成：

- `RiskRuleService`：Rule CRUD、target validation、version、audit；
- `RiskContextService`：scan input parse、Security/Account/Portfolio context derive/enrich、holding peak 输入准备；
- `RiskEventService`：trigger state、RiskEvent dedupe/persistence、regular/trailing 状态迁移；
- `RiskService` 保留为 scan/test orchestration facade，调用 domain `evaluateCompleteRule()` 与 NotificationService。

约束：

- Rule、Event 与 Notification 的数据库语义保持不变；
- 不移动 domain rule evaluator；
- Controller API 不变；
- 拆分后每个 service 有独立测试入口，主 facade 不再拥有底层 Prisma delegate 适配细节。

### 7.3 PerformanceService 分离 Snapshot 生命周期与分析读取

建议最小拆分：

- `PerformanceSnapshotService`：capture、history、snapshot persistence / native currency materialization；
- `PerformanceAnalysisService`：summary、TTWROR/XIRR 输入编排、layers/allocation/rebalance；
- `PerformanceTargetService`：TargetAllocation 保存与多账户目标聚合（只有在拆分时确认其变化理由足够独立才单列，否则先归 Analysis）；
- `PerformanceService` 可保留为兼容 facade，Controller 无需一次性重写。

继续复用 `market/fx-conversion.ts`，不复制 FX 算法或创建第二套汇率抽象。

### 7.4 Workspace dependency graph guard

扩展 `check-boundaries.mjs` 或新增同级脚本，读取 workspace `package.json`：

- runtime graph 至少覆盖 `dependencies`、`optionalDependencies`、`peerDependencies`；
- 检测 `@thesis-ledger/*` runtime dependency cycle；
- 禁止 packages 反向依赖 `apps/*` / `services/*`；
- 固化当前允许关系：`shared` 为底层，`domain -> shared`，`api-client -> schemas`，adapter 可以依赖 domain/schemas；
- devDependency 作为测试/构建依赖单独验证，不与 runtime graph 混为一谈；
- 接入现有 `pnpm lint` / CI quality gate。

### 7.5 V2 旧写入口收敛

先做调用方审计：Desktop、Mobile、API Client、tests、scripts、docs 均确认不再依赖 `POST /ledger/events`。

之后二选一：

1. 无兼容需求：删除 Controller endpoint 与 `LedgerService.append()`；
2. 仍需短期兼容：返回明确、结构化的 deprecated/removed contract，并给出删除版本；不得继续保留普通 BadRequest 作为永久行为。

最终选择写入 Architecture/API 文档并有 contract test。

## 8. 长期架构规则

1. **一个用户意图需要写多个 Ledger 事实时，事务由 Ledger application boundary 拥有。**
2. **Facade 可以编排，但不能同时拥有规则生命周期、上下文构建、持久化状态机和外部通知的全部细节。**
3. **Server service 超过 guardrail 时，新增需求必须优先沿已有变化理由拆分，而不是继续在 legacy oversized baseline 上堆逻辑。**
4. **workspace runtime dependency direction 必须机器可验证。**
5. **被新版本替代的公共入口必须显式删除或弃用，不能长期保持“可调用但永远失败”。**

## 9. 验收标准

### Ledger / Portfolio

- identity move 任一步失败时旧/新账户均无部分提交；
- clearPositions 任一事件或 rebuild 失败时整批回滚；
- 同一账户批量清仓只做一次最终 rebuild；
- Portfolio 不再编排两个或 N 个独立 `setPosition()`。

### Risk

- Controller contract、Rule CRUD/audit、scan/test、regular/trailing trigger、dedupe 和 notification 行为不变；
- Risk orchestration facade 不再直接包含完整 Rule CRUD + context + event state machine 的实现；
- 拆出的 service 各自有回归测试；
- 不新增新的 >600 行 server service。

### Performance

- capture/history/summary/targets/layers/allocation/rebalance 结果与拆分前一致；
- mixed-currency / FX blocked / partial data 行为保持；
- Snapshot 与 Analysis 具备独立测试边界；
- 不复制 `fx-conversion` 逻辑；
- 不新增新的 >600 行 server service。

### Package Guard

- 当前 runtime graph 通过；
- 人工 fixture 的反向依赖与 cycle 必须失败；
- CI 可阻止新增错误 workspace runtime dependency。

### API / Docs

- `/ledger/events` 的最终状态有 contract test 与文档；
- 新增简洁 Server module boundary Architecture SSOT；
- Spec / Task 不再宣称已被 V2 替代的 V1 方案仍待实施。

## 10. 验证方式

每个实施 PR 至少执行其受影响范围测试；最终收口执行：

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm contract:test`
- `pnpm migration:matrix`（仅有 schema/migration 变化时）
- `pnpm guardrails:complexity`

另外要求：

- Ledger rollback / account lock ordering / rebuild count 定向测试；
- Risk regular + trailing state transition 与 notification retry 定向测试；
- Performance mixed-currency / historical FX / target aggregation 定向测试；
- workspace dependency graph fixture 测试；
- `/ledger/events` contract test。

## 11. 风险与控制

- Risk / Performance 拆分是结构重构，不应与业务功能修改混在同一代码 PR；先 characterization tests，再移动职责；
- Ledger 跨账户事务会延长双账户锁持有时间，命令必须保持窄且沿 Repository 稳定锁序；
- 批量 Baseline Observation 需要先确定多事件 Revision 语义，禁止通过退回多个事务规避；
- Performance 拆分过程中不能把 FX 逻辑复制到新 service；
- Risk 拆分不能改变通知失败时“风险事件已记录、通知可重试”的现有语义；
- package guard 首次落地应以当前合法 graph 为基线，不借机做无证据的大规模依赖迁移。

## 12. 推荐实施顺序

1. P0：Ledger 复合命令 Revision 语义 + atomic move / clear；
2. P1：RiskService characterization + 分层拆分；
3. P1：PerformanceService characterization + Snapshot / Analysis 拆分；
4. P2：workspace dependency guard；
5. P2：旧 `/ledger/events` endpoint 收敛；
6. Architecture SSOT 与最终全仓回归。

每一步可以独立成小 PR；后一步不得作为前一步扩大范围的理由。