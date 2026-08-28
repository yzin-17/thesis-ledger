# 交易与成交记录系统剩余问题与返工任务

对应 Spec：

- [`交易与成交记录系统`](../specs/2026-08-26-trade-execution-ledger-system.md)
- [`交易账本写入与修正协议`](../specs/2026-08-26-trade-ledger-write-correction.md)
- [`历史基线、导入与对账`](../specs/2026-08-26-trade-baseline-import-reconciliation.md)
- [`Trade Projection 与收益读取模型`](../specs/2026-08-26-trade-projection-read-model.md)
- [`交易与成交记录产品界面`](../specs/2026-08-26-trade-product-experience.md)
- [`Trade 与 Journal 统一及迁移`](../specs/2026-08-26-trade-journal-migration.md)

原始实施任务：[`交易与成交记录系统实施任务`](2026-08-26-trade-execution-ledger-system.md)

## 文档目的与范围

本任务文档根据当前工作树和最后一轮 Standards + Spec Review 整理，作为原始实施任务的后续入口。它只拆分已批准 Spec 中的剩余实现、返工和验收，不新增业务规则；如果修复过程中改变接口、数据结构、权限、状态或验收标准，必须先更新对应 Spec，再同步本任务文档。

当前基线为 `HEAD e9699a5` 加未提交 WIP，包含新建文件和 `thesis-ledger-infra` 的 Compose 改动。最后一轮 Review 使用 `git diff HEAD` 以及工作树新增文件完成；项目没有 `docs/agents/issue-tracker.md`，因此 Review 直接依据仓库 Spec。

## 当前状态概览

| 范围 | 当前状态 | 说明 |
| --- | --- | --- |
| T1：分阶段 Spec | 已完成 | 五份子 Spec、总 Spec 和验收映射已建立。 |
| T2：账本信封与公共契约 | 已完成（本地环境） | Schema、domain、API client 和十进制字符串契约已实现；当前测试、构建和类型检查证据已同步。 |
| T3：不可变持久化与账户版本 | 已完成 | 账本锁、迁移、触发器、Projection Generation 和 owner/app role 边界均已实现并通过验证。 |
| T4：成交命令、幂等与修正 | 已完成 | 专用命令、修正链、跨账户锁和幂等回归已通过当前测试。 |
| T5：旧账本迁移 | 已完成（本地环境） | 映射、未知事件阻断、费用预检、收缩迁移和本地临时隔离数据库完整对账均已完成；正式发布环境不属于当前任务范围。 |
| T6：Baseline 与 ImportDraft | 已完成（本地环境） | 冻结、FULL/PARTIAL、时间精度、回滚、Decimal、来源行持久化、Draft 幂等和 Baseline 批次引用完整性均已通过代码、测试和本地数据库验证。 |
| T7：Baseline 对账 | 已完成 | 确定性候选、账户锁内确认、跨检查点重放、修正链和共享 API client 已实现并通过定向验证。 |
| T8：Trade Projection 领域引擎 | 已完成 | 纯领域重放、Trade 生命周期、来源证据、公司行动、分红和实际/影子隔离已实现；成本/费用/收益由 T9 在同一领域骨架上补齐。 |
| T9：成本、费用和收益守恒 | 已完成 | AVG/FIFO、策略 Revision 固定、费用明细、原币收益、基线估算和舍入尾差已在纯领域层实现并通过测试。 |
| T10 | 已完成 | Position、Trade、Cash 物化投影、账户级 Projection Generation、待结算状态和核心重建已实现并通过 Docker 运行时验收。 |
| T11 | 已完成 | 多币种原币 Cash、独立 FX Conversion View、历史汇率证据、部分可用/缺失状态和运行时验证已完成。 |
| T12 | 已完成 | 服务端专用命令、物化 Trade/账本查询、审计重放、稳定游标和旧引用解析已实现并通过定向测试与本地 Docker 验证。 |
| T13 | 已完成 | 账户数据三页签、成交主录入、修正链、观察校准、ImportDraft/对账入口已实现并通过桌面测试与本地浏览器非写入检查。 |
| T14–T15 | 已完成（本地环境） | 投资组合 Trade 只读读模型和 Journal 统一 Trade Projection 已通过代码、测试、本地 Compose 和本地浏览器列表/详情/响应式验收。 |
| T16–T17 | T16、T17 已完成（本地环境） | 影子差异/切换门禁、迁移手册、全量本地回归和最终一致性 Review 已完成；正式发布环境事项不属于当前任务范围。 |

此前基线结果：server 32 个测试文件/262 个测试、schemas 92 个测试、domain 75 个测试，类型检查、构建、根 lint、32 条迁移矩阵、Compose 配置和 `git diff --check` 均通过。上述历史结果不能替代下列语义阻断项的修复验收。

## 现存问题清单

| 编号 | 严重度 | 状态 | 位置 | 问题与影响 | 归属任务 |
| --- | --- | --- | --- | --- | --- |
| R-T3-01 | P1 | 已修复 | `thesis-ledger-infra/compose.yml`、`scripts/validate-db-roles.sh`、`scripts/bootstrap-app-role.sql`、`scripts/harden-app-role.sql` | Compose 预检和 bootstrap SQL 均拒绝空值或同名角色；migration 后再次 harden `LedgerEvent` 权限，应用角色只保留业务写入所需权限。 | T3-R1 |
| R-T5-01 | P1 | 已修复 | `20260826050000_migrate_legacy_ledger_v2/migration.sql`、`scripts/legacy-ledger-migration-smoke.mjs` | BUY/SELL 的负数、缺失值和 `NaN` 在事务预检阶段阻断；零费用不生成明细，正费用按类别保真写入 V2 `charges`，失败时不创建策略表或改写原事件。 | T5-R1 |
| R-T6-01 | P1 | 已修复 | `BaselineImportService.createImportDraft` | Draft 创建已在 Serializable 事务内完成完整内容指纹比较和写入；P2002/P2034 竞争会有限重试并返回原 Draft 或稳定冲突。 | T6-R1 |
| R-T6-02 | P2 | 已修复 | `baseline-import-support.ts`、`ledger-v2.repository.ts`、`schema.prisma`、`20260827030000_persist_ledger_source_row_id` | Draft 行的 `sourceRowId` 已持久化到 LedgerEvent；当前有效事件、修正链和导入回滚均可读回，历史事件的 nullable 字段保持为空。 | T6-R2 |
| R-T6-03 | P1 | 已修复 | `ledger.service.ts`、`BaselineImportService`、Baseline migration、`BaselineObservationBatch` schema、V2 Cash Balance Schema | 未知时间的迁移和 Baseline 创建路径现在始终创建 `UNKNOWN` 批次且不伪造时间；Position Baseline 保留有效批次引用，Cash Balance domain/Schema 不再接受 `batchId`，首轮迁移不再生成该字段，repair migration 继续清理历史错误引用；Docker 数据库不变量已通过。 | T6-R4 |
| R-STD-01 | P2 | 已修复 | `portfolio.service.ts`、`performance.service.ts` | 已将当前改动引入的多重嵌套三元改为命名辅助函数和显式分支，并通过定向 ESLint。 | T6-R3 |
| R-STD-02 | P2 | 已修复 | `apps/desktop/src/features/journal/JournalDashboard.tsx`、`journal.mutations.ts` | Journal 复盘快照保存已通过 TanStack Query mutation 发送；成功后失效 Journal 查询根键，保留原有结果展示和失败 Toast 行为。 | T17 |
| R-STD-03 | P2 | 已修复 | `apps/desktop/src/features/portfolio/PortfolioTradeView.tsx` | 账户范围和生命周期两个 Select 的所有 `SelectItem` 均已放入 `SelectGroup`，符合 shadcn 组件组合规范且不改变筛选行为。 | T17 |
| R-STD-04 | P2 | 已修复 | `apps/desktop/src/features/account-data/AccountDataExecutionSheet.tsx` | 成交数量/价格、时间/精度和费用明细的表单网格已改为 `FieldGroup` + `Field`，保留原有字段、校验和布局断点，并补充结构契约测试。 | T17 |
| R-STD-05 | P2 | 已修复 | `apps/desktop/src/features/account-data/AccountDataExecutionSheet.tsx` | 底部操作区的原生 `border-t` 已改为项目 `Separator` 组件，保留原有按钮顺序、间距和提交行为，并补充结构契约断言。 | T17 |
| R-DOC-01 | P2 | 已修复 | `docs/engineering/2026-08-18-database-index-review.md` | 索引说明已同步为 `accountId + sourceChannel + externalId` 唯一约束和 `accountId + sourceChannel + sourceRowId` 来源行索引。 | T6-R3 |
| R-DOC-02 | P2 | 已修复 | 原始实施任务 T2/T3/T4/T5/T6 证据 | 历史任务证据保留其当时的 server 测试与迁移数量，并明确 Compose 演练实际部署的迁移；当前收尾证据已同步为 server 291 个测试、34 条迁移。 | T6-R3 |
| R-FX-01 | P1（T11 范围） | 已修复 | `market/fx-conversion.ts`、`portfolio.service.ts`、`performance.service.ts`、`ledger/cash-projection.ts` | 原币 Cash/Position 先按币种分桶，本位币汇总统一通过按日期解析的 FX Conversion View；成交非同币种费用独立进入费用原币种 Cash/settlement 并保留 `FEE_CURRENCY_MISMATCH`；缺失 FX 保留原币结果和部分状态，已删除直接跨币种求和路径。 | T11 |
| R-VAL-01 | 范围外 | 不纳入当前任务 | 正式发布环境验收 | 生产数据副本、正式发布环境浏览器、在线 FX、进程重启和最终切换/回滚不属于当前任务范围；未来若发布需另立门禁。 | 无 |
| R-CODE-01 | P3 判断项 | 已评估，暂不拆分 | `ImportService`、`PerformanceService` | `ImportService` 当前是显式依赖的组合 Facade，移除后会把 Draft/匹配/提交/回滚四个 Adapter 的编排泄漏到 Controller；`PerformanceService` 虽有 8 个公开方法和快照、FX、目标、分层估值、纯计算等职责簇，但当前没有第二个独立 Adapter 或消费者 seam。依据 deletion test、depth、leverage 和 locality，立即拆分会制造多个浅层模块；后续出现第二个独立消费者、可替换 Adapter 或独立发布/性能边界时再拆分。 | T17 |

## 执行顺序与依赖

1. **先清除正确性阻断**：T6-R2、T6-R3、T7、T8、T9、T10、T11、T12、T13、T14 和 T15 已完成并通过定向验证；当前本地任务已收尾，不涉及生产切换。T3-R1、T5-R1、T6-R1、T6-R2、T6-R4 与 R-FX-01 已完成代码、离线验证和必要的本地 Docker 运行时验证。
2. **再完成核心领域与读模型**：T7 → T8 → T9 → T10 → T11 → T12。T8/T9 依赖 T7 的基线对账语义，T10 依赖 T8/T9，T11 和 T12 依赖原币投影边界稳定；T13 已消费 T12 的服务端接口，下一步 T14 继续依赖这些稳定接口。
3. **再迁移产品入口**：T13 与 T14 依赖 T12 的稳定 API；T15 依赖 T8–T12 的统一 Trade Projection 和证据指纹，当前均已完成。
4. **最后执行本地切换和关闭**：T16 → T17。正式发布环境门禁不属于当前任务范围。

## 返工与剩余实施任务

- [x] **T3-R1：收紧数据库角色边界**
  - 涉及范围：`thesis-ledger-infra` 的 owner/app role 配置、bootstrap SQL、Compose 启动命令和示例环境变量。
  - 完成条件：应用角色和 owner 必须是不同非空角色；缺失、相同或无法 bootstrap 时启动前 fail-fast；应用角色仍可写入业务表但不能 UPDATE/DELETE `LedgerEvent`；持久卷已有数据库的密码变更行为有明确说明。
  - 验证方式：fresh volume 与已有 volume 各执行一次 Compose 配置/启动演练；以 app role 断言 LedgerEvent UPDATE/DELETE 失败、专用追加成功；补充相同角色和缺失配置的失败测试。
  - 验证证据：新增 `db-role-validation`、`db-migrate` 和 `db-permission-hardening` 启动链；应用容器不再接收 owner 连接串。角色预检单测、正常 Compose 配置、同名角色失败、缺失角色 Compose 解析失败均通过；已有持久卷和隔离 fresh volume 均完成 `db-bootstrap → Prisma migration → permission hardening` 演练，当次运行成功执行 31 条迁移，app role 实际 `INSERT=true`、`UPDATE=false`、`DELETE=false`，以 app role 执行 UPDATE/DELETE 均被 PostgreSQL 拒绝。当前工作树的 migration matrix 为 32 条，新增迁移尚未部署到该持久卷。owner/app 密码在 README 和更新流程中说明：owner 密码由已有卷保持，app 密码由 bootstrap 同步轮换。

- [x] **T5-R1：阻断并保真迁移负费用**
  - 涉及范围：旧 LedgerEvent 迁移预检、BUY/SELL 费用明细映射、迁移 fixture、回滚断言和迁移说明。
  - 完成条件：任何负 `fee` / `tax`、缺失或非法费用值在修改数据前阻断；合法零费用和正费用完整映射为 V2 charge；失败事务不改变原表、策略表或 LedgerEvent。
  - 验证方式：增加负 fee、负 tax、零费用、正费用和混合费用 fixture；执行迁移成功/失败演练，核对事件数量、费用明细、未知清单和事务回滚。
  - 验证证据：迁移事务开头新增 fee/tax 预检，拒绝负数、`NULL` 和 `NaN`；BUY/SELL 费用映射改为仅对严格正值生成 `COMMISSION`/`TAX` 明细，零值生成空数组。`legacy-ledger-migration-fees.sql` 覆盖仅佣金、仅税费、混合费用和零费用，`legacy-ledger-migration-invalid-fees.sql` 覆盖合法/非法混合、负 fee、负 tax、缺失值和 `NaN`。
  - `pnpm migration:legacy-ledger` 通过：4 条合法旧事件全部转为 V2，4 个费用事件的明细类别和金额匹配；8 条含非法费用的混合 fixture 在目标迁移前失败，原始事件仍为 8 条 legacy、`factId` 为空、策略表不存在；未知类型 fixture 同样失败并保持原始行不变。演练只使用带时间戳的隔离数据库，未修改开发库或持久卷。

- [x] **T6-R1：修复 ImportDraft 幂等与并发语义**
  - 涉及范围：Draft 创建事务、幂等键和内容指纹、并发唯一键冲突处理、重放响应及测试。
  - 完成条件：同一幂等键的查找、内容比较和创建在可串行化边界内完成；指纹覆盖账户、来源渠道、范围、原始证据哈希、解析版本、时间字段、来源时区和规范化行内容；同内容重放返回原 Draft/Revision，不同内容返回稳定冲突，并发请求不会泄漏 Prisma 唯一键错误。
  - 验证方式：增加同内容重放、同键不同 rows、不同 scope/时间/来源、双并发创建和失败重试测试；验证只创建一个 Draft/Revision，且响应稳定。
  - 验证证据：`contentFingerprint` 已独立持久化，创建查找、内容比较和写入均在 `Serializable` 事务中；`P2002/P2034` 竞争最多重试 3 次，最终回读已创建 Draft 或返回稳定 `IMPORT_DRAFT_CONCURRENCY_CONFLICT`。定向测试 18/18、server 全量 262/262、typecheck、build、Prisma validate、32 条 migration matrix、定向 Prettier 和 `git diff --check` 均通过。

- [x] **T6-R2：持久化来源行追踪**
  - 涉及范围：LedgerEvent/来源模型、迁移、V2 repository 映射、有效事件与审计读取契约。
  - 完成条件：`sourceRowId` 能从 Draft 行写入 LedgerEvent，并在当前有效事件、完整修正链和回滚读取中读回；历史没有该字段的事件保持可读且明确为空；字段与来源渠道、外部编号组合具备必要索引或查询覆盖。
  - 验证方式：新增 schema/repository/服务端回归测试，覆盖普通提交、部分提交、REPLACE/VOID/RESTORE、回滚和旧迁移事件；执行迁移矩阵并核对来源行 ID。
  - 验证证据：`LedgerEvent.sourceRowId` 使用 nullable 字段保存来源行，新增 `accountId + sourceChannel + sourceRowId` 索引，既有 `accountId + sourceChannel + externalId` 唯一查询保持不变；V2 repository 在追加、有效事件读取和修正目标读取中双向映射该字段，导入回滚的 `VOID` 版本继承原始来源行。
  - 回归结果：普通 FULL 提交、PARTIAL 提交、SELL 提交和后续 Revision 均核对 Draft `rowId`；REPLACE/VOID/RESTORE 链和截图回滚均核对来源行；旧事件 `sourceRowId = NULL` 仍可读取且 V2 来源不伪造该字段。server 32 个测试文件/262 个测试、TypeScript、Prisma validate、32 条 migration matrix、定向 Prettier 和 `git diff --check` 通过。
  - 当前限制：新迁移尚未部署到开发持久卷；该卷已有 `20260826050000_migrate_legacy_ledger_v2` checksum 与工作树不一致，本次未修改 `_prisma_migrations`，发布前需在数据库副本或经批准的迁移历史对齐流程中部署。

- [x] **T6-R3：清理标准与证据漂移**
  - 涉及范围：多重嵌套三元、数据库索引说明、原始任务测试计数和相关 Markdown 链接。
  - 完成条件：当前改动不再引入多重嵌套三元；索引文档与 Prisma/migration 一致；所有已勾选任务的测试数量、命令和结果与当前工作树一致；不修改无关历史文档。
  - 验证方式：定向 ESLint、Markdown 链接扫描、`prettier --check`、`git diff --check`，并重新运行受影响 package 测试。
  - 验证证据：`portfolio.service.ts` 与 `performance.service.ts` 的 `no-nested-ternary` 定向 ESLint 通过；数据库索引说明已与 Prisma schema 和 `sourceRowId` migration 对齐；3 个相关 Markdown 文档共检查 8 个本地链接且缺失 0 个；当前 server 全量为 32 个测试文件/262 个测试、迁移矩阵为 32 条，定向 Prettier 和 `git diff --check` 通过。

- [x] **T6-R4：修复 BaselineObservationBatch 引用完整性**
  - 覆盖验收标准：AC9、AC10（见 `docs/specs/2026-08-26-trade-baseline-import-reconciliation.md`）。
  - 涉及范围：`LedgerService` 的未知时间写入路径、`BaselineObservationBatch` 可空时间字段、历史 Baseline 引用回填 migration、Cash Balance 悬空引用清理和回归测试。
  - 完成条件：每个 Position Baseline 事件的 `payload.batchId` 都对应同账户的持久化批次；未知来源时间保持 `UNKNOWN` 且不伪造时间；历史迁移可重复执行并不再留下悬空引用；Cash Balance 不再携带不属于其契约的 Baseline 批次引用。
  - 验证方式：定向 server 回归测试、Prisma schema 校验、migration 静态/数据库 smoke 校验、`prettier --check` 与 `git diff --check`。
  - 验证证据：server 32 个测试文件/262 个测试通过；server typecheck、build、Prisma validate、migration matrix 32 条迁移、定向 Prettier 与 `git diff --check` 均通过。Compose 当次已部署 31 条迁移；数据库复核结果为 `baseline_events=6`、`dangling_baseline=0`、`cash_batch_refs=0`、`unknown_batches_with_time=0`。
  - 补充证据：`packages/schemas` 96 个测试通过，其中新增回归拒绝 `CASH_BALANCE_OBSERVATION.payload.batchId`；`pnpm migration:legacy-ledger` 的全类型 fixture 验证 `cashBaselineBatchRefs=0`。
  - 当前状态：已完成。完整 `db:integration` 在后续完整性检查阶段仍报告 2 个既有 Position 没有非零 Ledger 投影；该问题来自当前 `IntegrityService` 对 V2 Baseline 事件的读取路径，不影响本任务的批次引用不变量，也未在本任务中执行持仓重建。

- [x] **T7：实现确定性 Baseline Reconciliation**
  - 涉及范围：候选生成、用户确认命令、`BASELINE_RECONCILIATION`、多检查点重放、残量和冲突状态。
  - 完成条件：同一成交只覆盖一次；推荐不写账本；确认后数量、成本守恒；负残量、重复覆盖和成本冲突保留明确状态。
  - 验证方式：属性测试与示例测试覆盖部分/完整覆盖、多检查点、撤销对账、重复映射和确定性重放。
  - 验证证据：新增 `baseline-reconciliation.ts`，以 `occurredAt → economicOrderKey → factId` 稳定排序，按账户、`Asset.symbol` 和经济时间生成未占用成交的有序前缀；使用 Prisma Decimal 重放 BUY/SELL、费用、跨检查点残量和冲突原因，已确认成交从自身发生时间参与后续检查点。
  - 验证证据：新增 `BaselineReconciliationService`，候选查询只读；确认在 `LedgerV2Repository.withAccountWrite` 内重新读取有效事实、校验候选和 Ledger Revision 后追加一条 `BASELINE_RECONCILIATION`；作废/恢复沿用同一事实修正链、链末校验和幂等协议。
  - 验证证据：Ledger controller 暴露候选查询、确认、作废、恢复；共享 `api-client` 增加同一契约的查询与命令封装。测试覆盖部分/完整覆盖、顺序置换确定性、跨检查点重放、SELL 成本基准、负残量冲突、候选不写入、确认幂等、重复覆盖拒绝和作废恢复。
  - 回归结果：server 33 个测试文件/267 个测试、schemas 92 个测试、api-client 9 个测试通过；全仓 `pnpm typecheck` 通过，server 构建通过，T7 相关文件定向 ESLint 与 Prettier 通过，`git diff --check` 通过。全仓 `pnpm lint` 仍被 T7 之外的既有 `baseline-import.service.ts` `no-base-to-string` 报告及 `apps/mobile/node_modules/react-native/index.js` Flow 语法解析问题阻断。

- [x] **T8：实现 Trade Projection 领域引擎**
  - 涉及范围：Trade 生命周期、Entry Leg、Baseline Component、Corporate Action、Close Slice、证据完整度和实际/影子隔离。
  - 完成条件：按账户和 `Asset.symbol` 从 0 到 0 划分周期；部分卖出后加仓不重开；余额观察结束不伪造 SELL；Position 数量与 ACTIVE Trade 剩余数量可核对。
  - 验证方式：领域测试覆盖分批建仓、部分/完全平仓、重新开仓、观察结束、送股、拆股、合股、分红和超额卖出。
  - 验证证据：`packages/domain/src/trade-projection.ts` 接收已去重的有效 V2 事实并按账户模式、账户和 `Asset.symbol` 分组，确定性输出 Trade 生命周期、Entry Leg、Baseline Component、公司行动、Close Slice、来源消耗、Dividend Attribution、证据来源和完整度。
  - 验证证据：零余额观察只以 `BALANCE_OBSERVATION` 结束当前 Trade，不创建 SELL；部分 SELL 后 BUY 保持同一 Trade；完全平仓后 BUY 创建新周期；基线只纳入观察与已知持仓的差额，数量冲突不静默修正；AVG/FIFO、费用与收益计算明确留给 T9。
  - 回归结果：domain 8 个测试文件/86 个测试通过；domain build、schemas/api-client typecheck、全仓 `pnpm typecheck`（含构建）、T8 定向 ESLint、T8 定向 Prettier 和 `git diff --check` 均通过。

- [x] **T9：实现成本、费用和收益守恒**
  - 涉及范围：AVG/FIFO 策略版本、Close Allocation、费用明细、毛/净收益、收益率和尾差。
  - 完成条件：Trade 固定使用开仓策略；数量、成本、费用和收益严格守恒；最后一个 Close Slice 承接尾差；不同币种费用不被错误折算或相加。
  - 验证方式：合法随机事件属性测试、策略切换、基线估算、部分平仓和多币种费用示例测试。
  - 验证证据：新增 `packages/domain/src/trade-costs.ts`，在 T8 生命周期骨架上按 Trade 开始时生效的账户成本策略 Revision 固定选择 AVG/FIFO；AVG 按来源剩余数量比例分配，FIFO 按来源顺序消耗，公司行动只同比例调整未消耗数量，来源原始成本保持不变。
  - 验证证据：Close Allocation 保存原始成本和按类别/币种分配的买入费用，Close Slice 保存卖出费用、毛收益、净收益和已实现净收益率；同币种金额使用 `DecimalValue` 精确计算，最后分配项吸收 40 位小数舍入尾差；基线结果带 `costEstimated` 与稳定问题码，跨币种费用和交易币种不一致不会被直接相加。
  - 回归结果：`packages/domain/test/trade-costs.test.ts` 覆盖 AVG/FIFO、策略切换、公司行动、基线估算、跨币种费用、部分平仓、生成合法事件序列和舍入尾差；domain 9 个测试文件/95 个测试、domain build、全仓 `pnpm typecheck`（含构建）、T9 定向 ESLint、定向 Prettier 和 `git diff --check` 均通过。

- [x] **T10：实现物化 Position、Trade 与 Cash 投影**
  - 涉及范围：物化表、Projection Generation、受影响资产重建、原子替换、待结算项和完整重建。
  - 完成条件：一次账本命令在同一事务更新所有核心投影；Cash 区分币种与结算状态；删除物化表后能从 Ledger 完整重建；修正和历史插序不会产生不同步投影。
  - 验证方式：数据库集成测试覆盖失败回滚、历史插序、修正重建、公司行动、账户隔离、重建幂等和一致性不变量。
  - 验证证据：新增 `Trade`、Entry Leg、Baseline Component、Corporate Action、Close Slice、Close Allocation、Dividend Attribution、Evidence Source、`CashBalance` 和 `CashSettlement` 表；Position 使用 `Decimal(38,18)`，Trade 子表使用账户/Trade 外键级联替换，所有核心表携带 Projection Generation。
  - 验证证据：账本成交命令、Baseline 提交/修正、导入回滚和迁移入口在账户锁定事务内调用统一核心重建；同一事务按有效 V2 Ledger 事实重放 Trade，再替换 Trade 子表、Cash 和 Position，物化写入失败会中止后续写入并由事务边界回滚。
  - 验证证据：Cash materializer 按币种分离 settled、pending receivable/payable 和明细；未来结算时间保持 PENDING，缺失或已到期结算时间进入 SETTLED；Integrity 检查 Position 数量与 ACTIVE Trade 剩余数量。
  - Spec 问题 2 修复：成交费用按原币种拆分 Cash 操作；成交币种只承担同币种费用，非成交币种费用生成独立 PAYABLE settlement 和稳定派生 `factId`，并由核心投影测试覆盖。
  - 回归结果：domain 9 个测试文件/96 个测试、server 34 个测试文件/271 个测试、server typecheck/build、Prisma validate、33 条 migration matrix、定向 Prettier 和 `git diff --check` 通过；`core-projection.test.ts` 覆盖 Position/Trade/Cash、稳定 ID、Pending settlement 和失败中止。
  - 运行时结果：Compose 镜像重建、迁移、权限 hardening、health 和两个本地开发账户 rebuild 通过；`159516.SZ` 重建为 1500 股、平均成本 0.932，`018147.OF` 重建为 3156.76 股、平均成本 2.2903；重复 rebuild 结果稳定，`/integrity` 为 healthy 且 0 个问题，`pnpm db:integration` 通过。

- [x] **T11：实现多币种现金与 FX Conversion View**
  - 涉及范围：原币 Cash、账户本位币、结算时间、历史汇率证据、部分可用和缺失 FX 状态。
  - 完成条件：核心原币投影不依赖 FX；本位币只通过独立 View 折算；每笔现金流保存汇率来源/版本；缺失汇率不阻止原币结果；删除 R-FX-01 的直接相加路径。
  - 验证方式：多币种费用、结算日前后、推定结算、汇率修订、部分可用和禁止直接相加测试。
  - 验证证据：`apps/server/src/market/fx-conversion.ts` 统一生成当前/历史 FX Conversion View 与 evidenceVersion；Portfolio、Performance 和 Cash projection 按币种保留原始金额，跨币种汇总只消费可用 FX 转换结果。
  - 验证证据：现金写入支持显式 `CNY/HKD/USD`，非 CNY 账户及导入入口不再被旧只读限制阻断；账户本位币作为未显式提供币种时的默认值。
  - 回归结果：server 35 个测试文件/279 个测试、schemas 93 个测试、domain 96 个测试、api-client 9 个测试通过；覆盖多币种现金、历史 FX、FX 修订、缺失 FX、结算、Cash Flow、显式 HKD 写入和禁止直接相加。
  - 运行时结果：应用镜像重建、Compose 迁移/重启、`/api/v1/health` 和 `/api/v1/integrity` 通过；health 为 healthy，integrity issueCount 为 0。

- [x] **T12：实现服务端命令与查询 API**
  - 涉及范围：成交、修正、Baseline、对账、ImportDraft、有效账本、审计、Trade 列表/详情和旧引用解析。
  - 完成条件：普通客户端不能提交任意 LedgerEvent；金额和 Revision 使用字符串；游标绑定账户 Projection Generation；旧引用仅在唯一证据下重定向；错误码和权限边界稳定。
  - 验证方式：Controller/service/contract 测试覆盖权限、Schema 错误、幂等、版本冲突、分页世代、账户/模式隔离和旧链接歧义。
  - 验证证据：`LedgerController` 已将成交、修正、作废、恢复、跨账户移动、Baseline、ImportDraft、对账、有效账本、审计和重放收敛为专用 V2 路由；Controller 层先做 Schema 解析，旧通用 LedgerEvent 写入口明确返回错误。
  - 验证证据：`TradeQueryService` 读取物化 Trade 及全部证据子表，列表游标绑定账户/模式与账户级 Projection Generation；世代变化、查询范围变化或游标锚点消失会要求刷新；旧引用只在全部 factId 唯一匹配当前 Trade 时重定向，歧义和无匹配均保留旧快照。
  - 验证证据：`LedgerQueryService` 提供有效事件、修正链审计和 Ledger Revision 重放；Ledger/Trade/API client 的金额、数量、比率和 Revision 公共契约使用十进制字符串或非负整数字符串，并统一保留稳定错误码。
  - 回归结果：server 37 个测试文件/287 个测试、schemas 7 个测试文件/94 个测试、api-client 10 个测试通过；覆盖 Schema 错误、通用写入拒绝、幂等/版本冲突、分页世代、账户/模式隔离、Legacy 事件精度和旧链接歧义；定向 ESLint、Prettier、`git diff --check` 和根 `pnpm typecheck`（含构建）通过。
  - 运行时结果：应用镜像重建、Compose migration 和权限 hardening 通过，应用容器为 healthy；`/api/v1/health` healthy，`/api/v1/integrity` 的 `issueCount` 为 0；Trade 列表、非法专用命令 400 和旧通用 LedgerEvent 写入口 400 均已完成冒烟验证。

- [x] **T13：重构账户数据录入界面**
  - 涉及范围：账户数据三页签、成交主入口、成交表单、修正链、其他账本事件、持仓校准和 ImportDraft/对账入口。
  - 完成条件：默认进入成交记录；持仓校准明确是观察检查点；成交列表默认当前有效版本且可展开历史；现金按币种区分已结算和待结算。
  - 验证方式：TanStack Query 组件测试覆盖加载、空态、失败、账户/模式切换、成交提交、版本冲突、修正、作废、恢复和对账确认；浏览器检查可访问性。
  - 验证证据：账户数据模块已拆分为页面编排、页签区块、成交/审计/对账/现金 Sheet、纯类型与 helper 以及 API/query/mutation 模块；默认成交记录、实际/模拟模式、按账户隔离的 query key、当前有效事件列表、审计修正链、观察型 Position/Cash、ImportDraft 与显式对账确认入口均已实现。桌面端 16 个测试文件/99 个测试、typecheck/build、定向 ESLint、定向 Prettier 和 `git diff --check` 通过；本地浏览器检查覆盖三页签、成交表单、持仓观察、现金分层、ImportDraft 和对账入口，四个主要时间/数值字段各有唯一可访问标签且数量输入获得焦点，未执行写入型浏览器操作。

- [x] **T14：实现投资组合 Trade 列表与详情（本地环境已完成）**
  - 涉及范围：投资组合“交易”页签、筛选、游标、Trade 详情、Entry/Close/Allocation/公司行动/分红时间线和证据入口。
  - 完成条件：Trade 只读；完整 Trade 与 Close Slice 分别提供复盘入口；基线估算、证据不完整、汇率缺失和统计排除原因可见。
  - 验证方式：组件测试覆盖 OPEN、部分平仓、真实结束、观察结束、Baseline、FX 不可用、旧游标和旧链接；浏览器检查列表、详情和响应式布局。
  - 验证证据：新增 `PortfolioTradeView`、`PortfolioTradeDetailSheet`、Trade API/query 模块，并将 Portfolio 的“总览 / 交易”保持为同级页签；列表只读、支持账户/模式/标的/生命周期筛选和 Generation 游标，详情展示 Entry Leg、Baseline、Close Slice、Allocation、公司行动、分红和证据来源，Trade Cycle 与 Close Slice 分别链接 Journal 复盘。
  - 回归结果：桌面端 18 个测试文件/102 个测试、desktop typecheck/build、T14 定向 ESLint、Prettier 和 `git diff --check` 通过；server Trade 查询测试覆盖列表、详情、模式隔离、Generation 游标和旧引用解析。
  - 运行时结果：新应用镜像和 34 条 migration 部署到本地 Compose 后，`/api/v1/portfolio/trades` 与 Trade 详情接口均可读取当前持久化投影；实际账户、ACTIVE/ENDED、Baseline 估算和排除原因均按十进制字符串返回。
  - 浏览器验收结果：本地 Vite `/portfolio` 已通过交易页签、账户/标的/生命周期筛选、实际/模拟隔离、进行中/余额观察结束详情、Journal 复盘跳转和 390×844 响应式检查；页面无横向溢出，表格使用局部滚动，控制台无 error/warning，未执行写入型浏览器操作。

- [x] **T15：迁移 Journal 到统一 Trade Projection**
  - 涉及范围：完整 Trade/Close Slice 复盘、TradePlan、统计、Projection Fingerprint、旧候选和 AI/Journal 快照。
  - 完成条件：Journal 不再自行从 Ledger 拼装；完整 Trade 胜率与 Close Slice 指标分离；旧候选按 SELL 事实 ID 确定性迁移，歧义保留 legacy；相关投影变化能标记过期。
  - 验证方式：domain/server/desktop 测试覆盖两级复盘、计划继承、统计资格、指纹过期、无关标的不触发过期和 legacy 人工确认。
  - 验证证据：`JournalService` 只通过 `TradeQueryService` 读取物化 Trade/Close Slice，不再直接查询 `LedgerEvent`；旧 `projectCompletedTrades` 实现及重复测试 fixture 已删除。完整 Trade 与 Close Slice 分层候选、显式 `TradePlan.tradeId`/事件证据关联、统计资格、legacy 人工确认和 Journal Review Snapshot 持久化均已接入。投影指纹变化才使相关快照过期，账户级 Generation 变化但 Trade 指纹不变不会误过期。
  - 回归结果：server Journal 5 个定向测试通过，server 全量 37 个测试文件/290 个测试、schemas 7 个测试文件/94 个测试、api-client 10 个测试、desktop 18 个测试文件/102 个测试通过；server typecheck/build、Prisma schema validate、定向 ESLint/Prettier 和 `git diff --check` 通过。

- [x] **T16：执行影子投影、历史对比与分阶段切换（本地环境已完成）**
  - 涉及范围：全量影子重建、Position/成本/Cash/收益/Journal 差异、读取开关、迁移门禁、回滚和旧路径删除。
  - 完成条件：差异全部分类；迁移缺陷和算法缺陷清零；按 Trade 查询、账户数据、投资组合、Journal 顺序切换；不通过修改原始事实静默配平。
  - 验证方式：在本地 Docker 环境执行影子迁移、逐账户不变量、切换和回滚演练；形成可追溯差异报告。正式发布环境不属于当前任务范围。
  - 验证证据：新增 `projection-shadow-diff.mjs`、`projection-shadow-rebuild.mjs`、`projection-switch-gate.mjs` 及 domain 差异分类/切换门禁；差异分为预期粒度、证据不足、FX 缺口、迁移缺陷、算法缺陷和未分类，迁移/算法/未分类阻断；shadow rebuild 在事务内回滚并输出逐账户稳定性报告，`sourceLedgerMutated` 固定为 `false`。固定快照差异为全零，unified 四阶段门禁允许通过；开发 Compose 两个账户的回滚重建均 `rolledBack=true`、稳定报告 `PASS`。
  - 本地验收结果：固定快照差异六类计数均为 0；unified 四阶段和 legacy 回滚门禁均通过，修改原始 Ledger 的危险路径被拒绝；Compose 内 2 个账户的回滚重建均 `rolledBack=true`、差异为 0、稳定性 `PASS`，health 为 `healthy`，integrity 为 `issueCount=0`。
  - 范围说明：生产数据副本提交型迁移、完整性能/并发演练、真实在线 FX、分阶段发布和旧镜像回滚属于正式发布范围外事项；相关操作仍记录在 [`Trade Projection 影子迁移与分阶段切换手册`](../operations/2026-08-28-trade-projection-cutover.md) 中，但不作为当前任务门禁。

- [x] **T17：完成文档、运行时验收和最终一致性 Review（本地环境已完成）**
  - 涉及范围：Spec、任务证据、领域/API/用户文档、迁移手册、真实数据库、并发、浏览器、FX 和最终 Review。
  - 完成条件：当前 Spec 范围内的本地验收标准都有实现与证据；正式发布环境属于非目标；所有 P1/P2 已修复。
  - 验证方式：运行受影响包测试、类型检查、构建、格式、ESLint、Markdown 链接扫描和 `git diff --check`，并完成 Spec/任务/实现三方核对。
  - 验证证据：新增 [`Trade Projection 影子迁移与分阶段切换手册`](../operations/2026-08-28-trade-projection-cutover.md)，并同步环境变量、迁移矩阵、总 Spec 与本任务证据；确定性测试和本地 Compose/浏览器运行态证据已完整记录，正式发布环境不纳入当前验收。
  - 本地最终回归：`pnpm test`、`pnpm typecheck`、34 条 migration matrix、全仓 ESLint、定向 Prettier、脚本语法检查和 `git diff --check` 均通过；当前 server 为 291 个测试、schemas 为 96 个测试；T5/T6/T14/T16 本地运行态证据已同步。

## 完成规则

- 任务只有在实现、对应测试和必要运行时验收均通过后才能勾选。
- 返工任务完成后，必须同步更新原始实施任务中 T3/T5/T6 的状态和验证证据；不能只在本文件勾选。
- 任何 P1 未处理前，不得宣称账本不可变边界、历史迁移或 ImportDraft 已完成。
- T14–T17 是原始 Spec 的剩余实施；当前任务仅要求本地数据库、浏览器和运行态验收，正式发布环境的生产数据副本、在线 FX、分阶段切换和最终回滚不在范围内。
- 保留当前工作树中与本任务无关的用户改动，不回退、不覆盖、不删除持久卷。

## 最终一致性 Review

- [x] Spec 当前范围内的全部验收标准均有实现和本地证据
- [x] 所有已勾选任务均有验证证据
- [x] 返工没有引入超出 Spec 的新范围
- [x] 测试、迁移、配置和文档已同步更新
- [x] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

- 结论：本轮 Standards + Spec 一致性 Review 已完成；T2、T3-R1、T5、T5-R1、T6、T6-R1、T6-R2、T6-R3、T6-R4、T7、T8、T9、T10、T11、T12、T13、T14、T15、T16 与 T17 已完成并通过代码、测试和本地运行态验证。当前 Spec 范围内的本地任务已收尾，正式发布环境明确不在范围内。
- 发现的问题：T10 发现的后续 Baseline 绝对成本重复累加已修复为检查点重估；`db:integration` 的两个既有 Position 不一致已通过核心重建修复；R-FX-01 已通过原币分桶和独立 FX Conversion View 修复；旧 `projectCompletedTrades` 路径及重复 fixture 已删除，当前完整性检查为 healthy；R-STD-02 已修复为 TanStack Query mutation，Journal 快照保存成功后会失效候选查询；R-STD-03 已为 PortfolioTradeView 的两个 Select 补齐 SelectGroup；R-STD-04 已将 AccountDataExecutionSheet 的表单网格改为 FieldGroup/Field 组合；R-STD-05 已将底部操作区的 border-t 改为 Separator。R-CODE-01 已完成结构评估：`ImportService` 保留为组合 Facade，`PerformanceService` 暂不拆分，触发条件已记录。
- 遗留风险：当前 Spec 范围内没有未处理的阻断项。正式发布环境事项已明确列为范围外；当前开发持久卷已成功应用第 34 条 migration。全量 `pnpm format` 仍报告 49 个既有文件格式差异，本轮未覆盖无关文件。
  - 验证命令与结果：domain 9 个测试文件/97 个测试、server 37 个测试文件/291 个测试、schemas 7 个测试文件/96 个测试、api-client 10 个测试、desktop 18 个测试文件/103 个测试通过；server typecheck/build、Prisma schema validate、34 条 migration matrix、定向 ESLint/Prettier、根脚本 `node --check`、固定快照 diff/switch gate、Compose migration/permission hardening/health/integrity 和逐账户事务回滚 shadow rebuild 均通过。
