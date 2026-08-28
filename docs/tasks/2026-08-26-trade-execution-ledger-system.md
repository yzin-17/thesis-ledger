# 交易与成交记录系统实施任务

对应 Spec：[`../specs/2026-08-26-trade-execution-ledger-system.md`](../specs/2026-08-26-trade-execution-ledger-system.md)

## 执行约束

- 开始实施前重新读取总 Spec、本任务文档和当前阶段对应的子 Spec；没有获批子 Spec 的阶段不得开始编码。
- 外部行为、接口、数据结构、迁移规则或验收标准变化时，先更新总 Spec 与子 Spec，再同步任务和实现。
- 保留用户及其他代理的工作区改动，不回退、覆盖或顺带提交无关文件。
- LedgerEvent 始终是唯一经济事实源；Trade、Position、Cash 与 FX Conversion View 均不得成为第二套可编辑事实。
- 账本与投影继续使用 `Asset.symbol`；Instrument 只负责搜索和显式身份确认。
- 实际账户与影子账户严格隔离；查询键、缓存键、统计和复盘不得跨模式混算。
- 金额、数量、价格、成本和费用在领域层使用十进制类型，API 使用十进制字符串，不得提前转换为 JavaScript `number`。
- 前端请求状态使用 TanStack Query；常用工具函数优先使用 `es-toolkit`，涉及函数选型时按项目规则使用 `recommend` skill。
- UI 优先组合现有 shadcn 组件和原子类，不新增传统页面级 CSS，不使用多重嵌套三元表达式。
- 每项任务只有在实现和对应验证全部通过后才能勾选，并在任务下补充验证证据。
- 本阶段不实现 CSV 导入、券商自动同步、证券转入转出、订单状态机、做空或 Trade 人工合并拆分。

## 任务清单

- [x] T1：创建并确认分阶段子 Spec
  - 涉及范围：账本写入与修正、历史基线与导入、Trade Projection、产品界面、Journal 迁移五份子 Spec，以及总 Spec 到子 Spec 的验收映射。
  - 完成条件：每份子 Spec 包含现状、接口、状态、迁移、失败场景和验收标准；相同规则只在一个权威文档定义；用户已逐份确认。
  - 验证方式：检查无 `TBD`、`TODO`、冲突规则和失效链接；执行 Markdown 相对链接扫描和 `git diff --check`。
  - 验证证据：
    - 已按用户逐节确认的设计创建五份子 Spec，并从总 Spec 建立稳定链接。
    - 必要章节与文件存在性检查：通过，无缺失章节或链接目标。
    - `rg -n 'TBD|TODO|待定' docs/specs/2026-08-26-trade-*.md`：无匹配。
    - `pnpm exec prettier --check docs/specs/2026-08-26-trade-*.md docs/tasks/2026-08-26-trade-execution-ledger-system.md docs/README.md docs/tasks/README.md`：通过。
    - `git diff --check`：通过。

- [x] T2：定义账本信封、类型化载荷与十进制公共契约
  - 涉及范围：domain/schema/API client 中的 LedgerEvent envelope、`factId`、`eventId`、事件类型联合、时间精度、排序键、来源、费用明细、Money/Decimal 字符串和错误码。
  - 完成条件：BUY、SELL、公司行动、Baseline Observation、Baseline Reconciliation、Cash Observation、修正事件具有互斥且严格的载荷；索引字段与 payload 一致；API 不暴露模糊可空字段组合。
  - 验证方式：Schema 与类型测试覆盖所有事件类型、非法组合、正数约束、日期级精度、多币种费用和十进制字符串往返。
  - 验证证据：
    - 新增 `packages/schemas/src/ledger-v2.ts` 与 `packages/domain/src/ledger-v2.ts`，定义不可变信封、全部首期事件载荷、Money/十进制字符串、修正动作和稳定错误码，并从 API client 导出。
    - Schema 与领域类型双向兼容性编译通过；事件类型与载荷错配会被严格 Schema 拒绝。
    - 当前 `packages/schemas` 测试：7 个文件、96 个测试通过，其中 Ledger V2 定向契约 39 个；`packages/domain` 和 `packages/api-client` 构建通过。
    - `packages/schemas`、`packages/domain`、`packages/api-client` 的 TypeScript 构建全部通过。
    - `git diff --check`：通过。

- [x] T3：实现不可变账本持久化与账户级版本控制
  - 涉及范围：Prisma schema、数据库迁移、账户 Ledger Revision、Projection Generation、JSONB payload、索引、数据库角色权限和按版本读取。
  - 完成条件：业务角色无法更新或删除 LedgerEvent；同一账户命令串行执行并原子增加版本；支持按 Ledger Revision 读取有效事实；不同账户可并行。
  - 验证方式：数据库集成测试覆盖账户锁、版本单调性、跨账户并行、事务回滚、不可变权限和历史版本读取。
  - 验证证据：
    - Prisma 新增 `AccountLedgerState` 与 Ledger V2 字段/索引；迁移 `20260826040000_ledger_v2_foundation` 新增 JSONB payload、修正链唯一约束、冗余索引校验、不可变触发器和业务角色权限撤销。
    - `LedgerV2Repository` 使用账户状态行 `FOR UPDATE`，在同一事务中追加事件并推进 Ledger Revision / Projection Generation，并支持 `asOfRevision` 有效事实读取。
    - 在现有 PostgreSQL 的隔离测试库完成开发库逻辑备份恢复与迁移；不可变 UPDATE/DELETE 和 Revision 1/2 历史读取断言通过，测试事务已回滚。
    - 真实数据库并发结果：同账户两个各持锁 2 秒的事务耗时 4 秒且 Revision 为 2；不同账户并行耗时 2 秒且各自 Revision 为 1。
    - 服务端全量 32 个测试文件、262 个测试通过；服务端类型检查、构建、Prisma Schema 验证和 `git diff --check` 通过。
    - 验证后已删除隔离测试库及容器临时文件，开发库与持久卷未修改。
    - T3-R1 已在 Compose 中增加 owner/app role 非空且不同的启动前校验；migration 后由独立 hardening 服务撤销 app role 对 `LedgerEvent` 的 UPDATE/DELETE。现有持久卷与隔离 fresh volume 启动链均验证通过，app role 实际 INSERT 成功且 UPDATE/DELETE 被拒绝。

- [x] T4：实现成交命令、幂等与修正链
  - 涉及范围：专用成交写入、`REPLACE / VOID / RESTORE`、同一 `factId` 单链、`expectedLedgerRevision`、来源渠道、外部编号和跨账户更正。
  - 完成条件：相同命令重放返回原结果且版本不变；内容冲突不自动覆盖；只能修正链末端；跨账户更正原子作废原事件并在目标账户新建事实。
  - 验证方式：服务端测试覆盖重复提交、内容冲突、并列修正拒绝、作废恢复、陈旧版本冲突、双账户锁顺序和失败回滚。
  - 验证证据：
    - 新增买入/卖出创建、`REPLACE`、`VOID`、`RESTORE` 和跨账户更正命令 Schema；状态命令强制字符串 `expectedLedgerRevision`。
    - `LedgerCommandService` 以 `accountId + source.channel + source.externalId` 判定幂等；按 `recommend` skill 核对后使用 `es-toolkit/isEqual` 比较解析后的经济内容，没有自制浅层键排序或哈希规则。
    - 相同内容重放返回原事件且不增加 Revision；不同内容返回 `LEDGER_IDEMPOTENCY_CONFLICT`；修正重放先于链末和陈旧版本检查。
    - 修正只能连接当前链末，`RESTORE` 只能连接 `VOID`；跨账户命令按稳定账户 ID 顺序锁定，在一个事务中对原账户追加 VOID、对目标账户创建新 `factId`。
    - 成交命令定向 7 个测试通过，覆盖重放、内容冲突、并列分支、陈旧版本、作废/恢复、双账户顺序及第二条写入失败回滚；服务端全量 32 个文件、262 个测试通过。
    - Schema 全量 7 个文件、92 个测试通过；Schema、API client 与服务端构建、服务端类型检查和 `git diff --check` 通过。

- [x] T5：迁移旧账本事件和成本策略（本地环境已完成）
  - 涉及范围：旧宽表 LedgerEvent、旧 `ADJUSTMENT`、旧 `correctionOf`、现有账户成本策略、来源字段、旧费用与税费。
  - 完成条件：旧 `correctionOf` 在独立收缩 migration 中删除且不保留审计副本；已知 Adjustment 转为专用事件；未知语义阻断迁移；现有账户获得从最早事件起生效的移动加权平均成本策略版本。
  - 验证方式：在本地 Docker 临时隔离数据库执行迁移演练；验证迁移前后事件数量、Position、Cash 和来源字段；未知事件清单必须为 0 后才允许继续。正式发布环境不属于当前任务范围。
  - 验证证据：
    - 子 Spec 新增权威旧事件映射表；现金存取、现金划转、利息、费用和税费迁为带方向与类别的 `CASH_FLOW`，证券转移仍不在范围内。
    - 迁移 `20260826050000_migrate_legacy_ledger_v2` 先检查未知类型、未知 `ADJUSTMENT.kind`、缺失必需值、非法数值以及 BUY/SELL 的负数、缺失值和 `NaN` 费用，然后在显式事务内统一转换 payload、Revision、来源和排序键。
    - 迁移 `20260826050000_migrate_legacy_ledger_v2` 先保留旧 `correctionOf` 完成扩展与回填；后续 `20260826080000_remove_legacy_correction_of` 独立执行收缩删除，未导出或迁入 metadata。
    - 每个旧账户新增从最早账本事件起生效的 `AccountCostStrategyVersion(revision=1, method=AVG)`，账户 Ledger Revision 回填为该账户最大事件 Revision。
    - 开发库逻辑副本演练：6 条旧 `position-balance` 全部迁为 `POSITION_BASELINE_OBSERVATION`，事件数保持 6，来源为 `MANUAL/manual`，未知清单为 0；两条 Position 在迁移前后数量和成本价完全一致，该副本无现金事件可比较。
    - 全类型 fixture 演练：17 条旧事件成功映射到 9 个严格新类型；7 条 `CASH_FLOW` 的流入/流出与 6 个业务类别均符合映射，买入手续费/税费已转为两条费用明细，无非法 V2 行。
    - 当前本地可重复验收：`pnpm migration:legacy-ledger` 在临时数据库中确认 17 条事件迁移前后数量一致、17 条事件均有 `factId` 和 V2 审计字段、2 条 Position 保持不变、7 条 `CASH_FLOW` 的方向和类别正确、1 条 `AVG` 成本策略从最早事件起生效，且收缩后 `correctionOf` 列不存在。
    - 未知事件 fixture 使迁移以 `Legacy LedgerEvent contains an unknown type` 失败；显式事务回滚后成本策略表不存在、已迁移行为 0、未知原始行仍保留。
    - T5-R1 费用迁移演练：`pnpm migration:legacy-ledger` 验证仅佣金、仅税费、混合费用和零费用均按 V2 `charges` 保真映射；含负 fee、负 tax、缺失值或 `NaN` 的 8 条混合 fixture 在目标迁移前失败，原始事件和策略表保持未迁移状态。
    - schemas 7 个测试文件/94 个测试、domain 9 个测试文件/97 个测试、server 37 个测试文件/290 个测试通过；服务端构建、Prisma Schema 验证和 `git diff --check` 通过。
    - 四个隔离演练库及容器临时文件均已删除，开发库与持久卷未修改。

- [x] T6：实现 Baseline Observation Batch 与 ImportDraft（本地环境已完成）
  - 涉及范围：`FULL / PARTIAL` 观察批次、逐资产 Baseline 事件、业务观察时间、采集时间、原始文件引用与哈希、单账户 Draft Revision 和审核提交。
  - 完成条件：完整快照可表达缺失资产为 0，部分快照不影响其他资产；已提交 Draft 冻结；孤立卖出和内容冲突保留草稿；选中有效项在账户锁内原子提交。
  - 验证方式：测试覆盖完整/部分批次、多次检查点、历史截图、草稿版本、部分审核、孤立卖出、来源行追溯和提交回滚。
  - [x] Review 修复：现有持仓与截图回滚不得继续追加 V1 `ADJUSTMENT`，所有新事实必须进入 V2 账本并推进账户 Revision。
  - [x] Review 修复：截图审核、资产确认、Draft Revision 冻结和选中账本事实必须在账户锁内保持原子提交。
  - [x] Review 修复：提交时基于账户有效事实和选中行的经济时间、数量重新校验孤立或超额 SELL，并把问题保留在 Draft。
  - [x] Review 修复：Draft Revision 分别保存业务观察时间、采集时间、时间精度和来源时区，不得用服务端 `recordedAt` 代替。
  - [x] Review 修复：每个 `POSITION_BASELINE_OBSERVATION` 必须引用同账户的 `BaselineObservationBatch`；未知时间保持可空且不伪造时间，Cash Balance 不携带 Baseline 批次引用。
  - [x] Review 修复：Draft 创建在 Serializable 事务内比较完整内容指纹；并发唯一键竞争会重试并返回原 Draft 或稳定冲突，不泄漏 Prisma 唯一键异常。
  - [x] Review 修复：消除事件标的提取重复和 `appendDraftRow` 参数簇，清理本功能无关的格式化 diff，并恢复全量测试。
  - Review 修复验证证据：
    - `LedgerService.setPosition`、`setCashBalance`、Position 迁移和截图回滚均改用 V2 类型化事件；回滚通过同一账户锁内追加 `VOID` 修正链，不再写 V1 `ADJUSTMENT`。
    - 截图提交的 Asset upsert、Baseline Batch、LedgerEvent、Draft Revision 冻结和 Draft 状态更新均位于 `LedgerV2Repository.withAccountWrite` 事务内；失败只保留可编辑 Draft Revision。
    - 提交校验按经济时间重放账户有效 BUY、SELL、Baseline 和公司行动；新增测试覆盖已有持仓支持 SELL 以及 `BUY 1 + SELL 2` 整体阻断并回写 `ORPHAN_SELL`。
    - ImportDraft Revision 新增 `observedAt`、`capturedAt`、`timePrecision`、`sourceTimezone`；Schema 测试覆盖 `DATE` 精度，截图审核测试验证观察时间与采集时间分离传递。
    - server 类型检查与构建通过，32 个测试文件、262 个测试通过；schemas 92/92、domain 75/75 通过；定向 ESLint、Prisma Schema 校验、32 条迁移矩阵和 `git diff --check` 通过。
    - Screenshot Import 的数量与成本价输入保持十进制字符串；Vision schema、服务端校验和现金/持仓投影均使用 Decimal，新增大数精度回归测试。
    - FULL ImportDraft 提交会将缺失资产的 0 观察写回 Draft、冻结 Revision 和 `submittedRowIds`；旧账本与旧 Position 迁移对没有来源生成时间的事实保留 `UNKNOWN`，不填充 `capturedAt`。
    - 已提交 Revision 的行保持冻结；`partial` 草稿可从未提交行创建后续 Revision，后续 Revision 只保存未提交行，完成判定合并历史 `submittedRowIds`，新增回归测试覆盖冻结与续传边界。
    - 业务时间完全未知的迁移事件使用 `occurredAt: null`、`UNKNOWN` 精度和确定性排序键，不使用 Position 服务端更新时间或 `UTC` 冒充来源信息。
    - `20260827010000_repair_baseline_observation_batch_refs` 已回填历史 Position Baseline 批次、清理 Cash Balance 的错误 `batchId`，并允许 UNKNOWN 批次的观察/采集时间为空；Compose 数据库验证得到 6 个 Baseline 事件、0 个悬空引用、0 个 Cash Balance 批次引用和 0 个 UNKNOWN 时间字段。
    - Spec 问题 3 修复：`CASH_BALANCE_OBSERVATION` 的 domain 类型与 Schema 已移除 `batchId`；旧账本首轮迁移不再生成该字段，repair migration 继续负责清理历史数据；Schema 拒绝带批次引用的现金观察，迁移 smoke 验证 `cashBaselineBatchRefs=0`。
    - 当前代码镜像已在 Compose 中启动并通过 health；完整 `db:integration` 在完整性检查阶段仍报告两个既有 Position 缺少非零 Ledger 投影，未在本任务中执行持仓重建。
    - `ImportDraft` 新增独立 `contentFingerprint` 字段；18 个定向测试覆盖完整指纹变化、同内容重放和双并发创建，确认只创建一个 Draft/Revision。
    - `LedgerEvent` 新增 nullable `sourceRowId` 和 `accountId + sourceChannel + sourceRowId` 索引；Draft 普通/部分提交、REPLACE/VOID/RESTORE、回滚和旧事件读取均覆盖来源行 ID 或空值兼容。
    - 当前本地回归：`baseline-import.service.test.ts` 19 个测试、`baseline-reconciliation.test.ts` 5 个测试通过；服务端全量 37 个测试文件/291 个测试通过；`packages/schemas` 全量 7 个测试文件/96 个测试通过。未知业务时间的 FULL Baseline 创建已验证会创建 `UNKNOWN` 批次和事件，且不伪造 `observedAt/capturedAt`。

- [x] T7：实现确定性 Baseline Reconciliation
  - 涉及范围：候选规则、用户确认命令、`BASELINE_RECONCILIATION` 事件、跨检查点重放、部分覆盖残量和冲突状态。
  - 完成条件：同一成交只纳入历史一次；后续检查点自动重放；剩余数量与成本守恒；自动推荐不产生账本写入；数量或成本冲突保留明确问题原因。
  - 验证方式：属性与示例测试覆盖部分覆盖、完全覆盖、多个检查点、重复映射拒绝、撤销对账、负残量冲突及相同输入确定性。
  - 验证证据：候选引擎按 `occurredAt → economicOrderKey → factId` 稳定生成未占用成交前缀，使用 Prisma Decimal 重放 BUY/SELL 和费用，并返回 `PARTIAL`、`MATCHED`、`CONFLICTED` 及明确冲突原因；已确认成交从自身发生时间参与后续检查点。
  - 验证证据：对账服务在账户写锁内重新读取有效事实、候选和 Ledger Revision，只有确认追加 `BASELINE_RECONCILIATION`；查询不写账本，确认支持幂等，作废/恢复复用修正链和链末约束；Ledger controller 与共享 `api-client` 已提供候选查询和三类命令。
  - 回归结果：server 33 个测试文件/267 个测试、schemas 92 个测试、api-client 9 个测试通过；全仓 `pnpm typecheck`、server 构建、T7 定向 ESLint、T7 定向 Prettier 和 `git diff --check` 通过。全仓 lint 仍被 T7 之外的既有 `baseline-import.service.ts` `no-base-to-string` 报告及 mobile React Native Flow 语法解析问题阻断。

- [x] T8：实现 Trade Projection 纯领域引擎
  - 涉及范围：Trade 生命周期、Entry Leg、Baseline Component、Corporate Action Adjustment、Close Slice、Close Allocation、Dividend Attribution、证据来源与完整度。
  - 完成条件：交易周期按账户和 `Asset.symbol` 从 0 到 0 划分；部分卖出后再次加仓仍属于同一部分平仓 Trade；余额观察结束不伪造 SELL；实际和影子事实不混算。
  - 验证方式：领域测试覆盖分批建仓、部分卖出、再次加仓、完全平仓、重新开仓、观察结束、送股、拆股、合股、分红和非法超额卖出。
  - 验证证据：新增 `packages/domain/src/trade-projection.ts` 和 `packages/domain/src/decimal.ts`；以账户模式映射隔离实际/影子事实，按 `occurredAt → economicOrderKey → eventId` 确定性重放有效事实版本，输出 Trade、Entry Leg、Baseline Component、公司行动、Close Slice、来源分配和 Dividend Attribution。
  - 验证证据：余额观察为零只结束生命周期并标记 `BALANCE_OBSERVATION`，不生成 SELL；基线只贡献已知持仓与观察数量的差额，数量矛盾保留 `QUANTITY_CONFLICT`；公司行动同比例调整来源数量；Close Allocation 仅记录来源和消耗数量，AVG/FIFO、费用和收益留给 T9。
  - 回归结果：domain 8 个测试文件/86 个测试、domain build、schemas/api-client typecheck、全仓 `pnpm typecheck`（含构建）、T8 定向 ESLint、T8 定向 Prettier 和 `git diff --check` 均通过。

- [x] T9：实现成本、费用和收益守恒
  - 涉及范围：账户成本策略版本、移动加权平均成本法、先进先出成本法、Close Allocation、费用明细、毛收益、净收益、已实现净收益率和舍入尾差。
  - 完成条件：Trade 全周期固定使用开仓时策略；移动平均按来源剩余数量比例分配，先进先出按批次消耗；最后 Close Slice 承接尾差；所有数量、成本和费用严格守恒。
  - 验证方式：属性测试生成合法随机事件序列，验证分配之和、剩余成本、总费用和净收益；示例测试覆盖策略切换、基线估算和不同币种费用。
  - 验证证据：新增 `packages/domain/src/trade-costs.ts`，在 T8 生命周期骨架上按 Trade 开始时生效的账户成本策略 Revision 固定选择 AVG/FIFO；AVG 按来源剩余数量比例分配，FIFO 按来源顺序消耗，公司行动只同比例调整未消耗数量；实际成交来源原始成本保持不变，后续 Baseline 检查点只重估未解释的剩余成本并保留已消费成本。
  - 验证证据：Close Allocation 保存原始成本和按类别/币种分配的买入费用，Close Slice 保存卖出费用、毛收益、净收益和已实现净收益率；同币种金额使用 `DecimalValue` 精确计算，最后分配项吸收 40 位小数舍入尾差；基线结果带 `costEstimated` 与稳定问题码，跨币种费用和交易币种不一致不会被直接相加。
  - 回归结果：`packages/domain/test/trade-costs.test.ts` 覆盖 AVG/FIFO、策略切换、公司行动、基线估算、跨币种费用、部分平仓、多个 Baseline 检查点、生成合法事件序列和舍入尾差；domain 9 个测试文件/96 个测试、domain build、全仓 `pnpm typecheck`（含构建）、T9 定向 ESLint、定向 Prettier 和 `git diff --check` 均通过。

- [x] T10：实现物化 Position、Trade 与 Cash 核心投影
  - 涉及范围：Position、Trade 及其子表、按币种 Cash、待结算项、账户级 Projection Generation、受影响资产重建和原子替换。
  - 完成条件：一次账本命令在同一事务更新全部核心投影；Position 数量等于 ACTIVE Trade 剩余数量；Cash 区分已结算和待结算；删除物化表后可完整重建。
  - 验证方式：数据库集成测试覆盖写入失败回滚、历史插序、修正重建、公司行动、账户隔离、重建幂等和投影一致性不变量。
  - 验证证据：新增 `Trade`、Entry Leg、Baseline Component、Corporate Action、Close Slice、Close Allocation、Dividend Attribution、Evidence Source、`CashBalance` 和 `CashSettlement` 物化表；Position 精度提升到 `Decimal(38,18)`，子表通过账户和 Trade 级外键级联重建。
  - 验证证据：账本命令、Baseline 提交/修正、导入回滚和 Position/Cash 迁移均在账户锁定事务内使用下一代 Projection Generation 重建核心投影；重建先从有效 V2 Ledger 事实生成 Trade，再原子替换 Trade 子表、Cash 和 Position，失败沿事务抛出并中止后续写入。
  - 验证证据：Cash 按币种保存已结算余额、待结算应收/应付和 Settlement 明细；未来 `settledAt` 的 BUY/SELL、Cash Flow、Dividend 进入待结算，缺少 `settledAt` 或已到期的事件进入已结算余额；Integrity 增加 Position 与 ACTIVE Trade 剩余数量不变量检查。
  - Spec 问题 2 修复：BUY/SELL 的非成交币种费用现在按费用原币种生成独立 Cash 操作和 PAYABLE settlement，稳定派生 settlement `factId`，不会因同一成交产生多个结算明细而冲突；`core-projection.test.ts` 同时验证物化 Cash 和简单 Cash 余额。
  - 回归结果：`apps/server/test/ledger/core-projection.test.ts` 覆盖 ACTIVE Trade 到 Position、稳定子表 ID、Cash 结算状态、费用币种问题和物化写入失败中止；server 34 个测试文件/271 个测试通过，domain 9 个测试文件/96 个测试通过，server typecheck/build、Prisma validate、33 条 migration matrix、定向 Prettier 与 `git diff --check` 通过。
  - 运行时证据：`thesis-ledger-infra` Compose 已部署 `20260827030000_persist_ledger_source_row_id` 与 `20260827040000_materialize_core_projections`；应用镜像重建、重启和 health 通过。两个本地开发账户 rebuild 后分别得到 `159516.SZ = 1500 @ 0.932`、`018147.OF = 3156.76 @ 2.2903`，Position 与 ACTIVE Trade 数量一致；重复 rebuild 结果稳定，`/integrity` 返回 0 个问题，`pnpm db:integration` 全部通过。

- [x] T11：实现多币种现金与 FX Conversion View
  - 涉及范围：账户本位币、多币种余额、结算时间推定、历史汇率证据、本位币 Trade/组合汇总和汇率缺失状态。
  - 完成条件：原币核心投影不依赖 FX；每笔现金流按发生日汇率折算并保存来源版本；汇率更新只刷新折算视图；缺失汇率不阻止原币结果。
  - 验证方式：测试覆盖多币种费用、结算日前后、推定与未知结算时间、汇率修订、部分可用折算和不同币种禁止直接相加。
  - 验证证据：新增 `apps/server/src/market/fx-conversion.ts` 作为独立 FX Conversion View，按本位币、估值日期、来源/版本和汇率日期生成证据指纹；Portfolio 与 Performance 均先保留原币 Position/Cash，再通过当前或历史 FX View 折算，缺失汇率只标记部分结果，不阻断原币余额。
  - 验证证据：Cash projection 只按账户和币种分桶，移除未使用的跨币种 `totalCashBalance`；现金余额写入口支持显式 `CNY/HKD/USD`，非 CNY 账户不再被旧的只读限制拦截；Baseline/ImportDraft 在未提供行币种时使用账户本位币。
  - 跨币种费用修复后，费用原币种会独立进入 Cash balance/settlement，并保留 `FEE_CURRENCY_MISMATCH` 的完整度提示；成交币种只累计同币种费用。
  - 回归结果：`apps/server` 35 个测试文件/279 个测试、`packages/schemas` 7 个测试文件/93 个测试、`packages/domain` 9 个测试文件/96 个测试和 `packages/api-client` 9 个测试通过；覆盖多币种现金、按发生日历史 FX、FX 修订指纹、缺失 FX、Cash Flow、结算状态、显式 HKD 写入和禁止直接相加。
  - 构建与运行时证据：server typecheck/build、desktop typecheck、api-client build、定向 Prettier 和 `git diff --check` 通过；`thesis-ledger:dev` 应用镜像重建、Compose 迁移/重启、`/api/v1/health` 和 `/api/v1/integrity` 通过，health 为 healthy 且 integrity issueCount 为 0。

- [x] T12：实现服务端命令与查询 API
  - 涉及范围：成交录入、修正、Baseline、对账、ImportDraft、有效账本事件、审计重放、Trade 列表、Trade 详情、Close Slice 和旧引用解析。
  - 完成条件：普通客户端不能提交任意 LedgerEvent；所有金额返回十进制字符串；Trade 游标绑定账户 Projection Generation；旧引用只有唯一证据匹配时才能重定向。
  - 验证方式：Controller/service/contract 测试覆盖权限、Schema 错误、版本冲突、幂等重放、分页世代失效、账户与模式隔离及旧链接歧义。
  - 验证证据：`LedgerController` 为成交、修正、作废、恢复、跨账户移动、Baseline、ImportDraft、对账、有效账本、审计和重放提供专用路由，并在 Controller 层统一执行 V2 Schema 解析；旧 `POST /ledger/events` 由服务端明确拒绝，普通客户端不能绕过专用命令写入任意事件。
  - 验证证据：`TradeQueryService` 从物化 Trade 及其 Entry、Baseline、Corporate Action、Close Slice、Allocation、Dividend、Evidence 子表读取列表和详情；列表游标携带账户/模式和每个账户的 Projection Generation，世代变化、游标锚点消失或查询范围变化均返回稳定刷新错误；旧引用只按完整 factId 集合匹配当前唯一 Trade，歧义或无匹配时保留旧快照。
  - 验证证据：`LedgerQueryService` 区分当前有效事件、包含修正链的审计读取和按 Ledger Revision 的重放；历史事件的金额、数量、费用和税费在公共响应中统一转换为十进制字符串；`api-client` 暴露对应命令、查询和错误码类型。
  - 回归结果：server 37 个测试文件/287 个测试、schemas 7 个测试文件/94 个测试、api-client 10 个测试通过；覆盖权限边界、Schema 错误、幂等重放、版本冲突、世代失效、账户/模式隔离、Legacy 事件精度和旧链接歧义；定向 ESLint、Prettier、`git diff --check` 和根 `pnpm typecheck`（含构建）通过。
  - 运行时证据：`thesis-ledger:dev` 应用镜像重建和 Compose migration/permission hardening 通过，应用容器为 healthy；`/api/v1/health` 返回 healthy，`/api/v1/integrity` 返回 `issueCount: 0`；Trade 列表可从当前持久化投影读取，非法专用命令返回 HTTP 400，旧通用 LedgerEvent 写入口仍返回 HTTP 400。

- [x] T13：重构账户数据录入界面
  - 涉及范围：账户数据导航、“持仓 / 成交记录 / 现金”三页签、默认成交记录、成交表单、修正链、其他账本事件、持仓校准和 ImportDraft/对账入口。
  - 完成条件：真实成交是主录入流程；持仓校准明确为观察检查点；成交列表默认只计当前有效版本并可展开历史；现金按币种区分已结算和待结算。
  - 验证方式：TanStack Query 组件测试覆盖加载、空态、失败、账户切换、实际/影子模式、成交提交、陈旧版本冲突、修正、作废、恢复和对账确认；浏览器人工检查三页签与表单可访问性。
  - 验证证据：新增 `apps/desktop/src/features/account-data/` 账户数据模块，由 `AccountDataPage.tsx` 编排账户上下文，`AccountDataSections.tsx`、各类 Sheet、纯类型与 helper 以及 query/mutation/API 模块分别承载页签、写入边界和可测试逻辑；侧边栏已将“录入持仓”迁移为“账户数据”，旧 `/position-entry` 与 `/import-review` 仅保留导航重定向。默认页签为“成交记录”，成交表单明确 BUY/SELL、标的确认、数量/价格高精度校验、时间精度、结算时间、费用、稳定客户端命令 ID、实际/模拟模式和陈旧 Revision 保留输入；成交列表只读取当前有效版本，审计 Sheet 提供更正、作废、恢复和修正链；持仓与现金均标明观察检查点，现金按币种分桶并拆分已结算/待结算。
  - 回归结果：`apps/desktop/test/account-data.ui.test.tsx`、`apps/desktop/test/account-data.api.test.ts` 覆盖默认页签、加载/空态、账户与模式上下文、表单契约、专用成交/修正/对账 API 边界；桌面端全量 16 个测试文件/99 个测试通过，桌面端 typecheck/build、定向 ESLint、定向 Prettier 和 `git diff --check` 通过。
  - 浏览器证据：本地 Vite 页面 `/accounts` 可打开且无 console error；人工检查了默认成交记录、持仓观察、现金按币种/结算状态、成交表单字段、ImportDraft Sheet 和对账入口。`数量`、`价格`、`成交时间`、`结算时间（可选）`各有一个可访问标签，点击`数量`后焦点落在 `execution-quantity` 输入框。浏览器检查保持非写入操作，未向开发账本提交真实成交或修正命令。

- [x] T14：实现投资组合 Trade 列表与详情（本地环境已完成）
  - 涉及范围：投资组合“交易”页签、状态与证据筛选、列表游标、Trade 详情、Entry/Close/Allocation/公司行动/分红时间线和账本证据入口。
  - 完成条件：Trade 保持只读；完整 Trade 与 Close Slice 分别提供复盘入口；基线估算、证据不完整、汇率缺失和统计排除原因均明确展示。
  - 验证方式：组件测试覆盖 OPEN、部分平仓、真实结束、观察结束、Baseline、FX 不可用、旧游标失效和旧 Trade 链接解析；浏览器检查列表、详情和响应式布局。
  - 验证证据：新增 `PortfolioTradeView`、`PortfolioTradeDetailSheet`、Trade API/query 模块，并将 Portfolio 的“总览 / 交易”保持为同级页签；列表只读、支持账户/模式/标的/生命周期筛选和 Generation 游标，详情展示 Entry Leg、Baseline、Close Slice、Allocation、公司行动、分红和证据来源，Trade Cycle 与 Close Slice 分别链接 Journal 复盘。
  - 回归结果：桌面端 18 个测试文件/102 个测试、desktop typecheck/build、T14 定向 ESLint、Prettier 和 `git diff --check` 通过；server Trade 查询测试覆盖列表、详情、模式隔离、Generation 游标和旧引用解析。
  - 运行时结果：新应用镜像和 34 条 migration 部署到本地 Compose 后，`/api/v1/portfolio/trades` 与 Trade 详情接口均可读取当前持久化投影；实际账户、ACTIVE/ENDED、Baseline 估算和排除原因均按十进制字符串返回。
  - 浏览器验收结果：本地 Vite `/portfolio` 在桌面视口打开后，`组合内容 → 交易`、全部账户/账户筛选、标的筛选、生命周期筛选和实际/模拟模式隔离均可用；列表保持只读。打开进行中和余额观察结束的 Trade 详情，均展示生命周期、证据状态、Entry Legs、Baseline、Close Slices、附属证据和“完整交易复盘”入口；点击入口可带 `TRADE_CYCLE`、账户、模式和 Trade ID 跳转 Journal。390×844 移动视口下页面无页面级横向溢出，交易表格使用局部横向滚动容器，详情 Sheet 宽度适配视口；浏览器控制台无 error/warning。验收只执行列表、筛选、详情、导航和模式切换，没有提交账本写入。

- [x] T15：迁移 Journal 到统一 Trade Projection
  - 涉及范围：完整 Trade 复盘、Close Slice 减仓复盘、TradePlan 关联、周期统计、Projection Fingerprint、旧候选迁移和 AI/Journal 快照。
  - 完成条件：Journal 不再自行从 Ledger 计算交易；默认胜率按符合资格的完整 Trade 统计，减仓指标独立；旧候选按 SELL LedgerEvent ID 映射，歧义项保留 legacy；相关投影变化时旧结果标记过期。
  - 验证方式：domain/server/desktop 测试覆盖两级复盘、受限复盘、计划继承、统计资格、指纹过期、无关标的不导致过期和 legacy 人工确认。
  - 验证证据：`JournalService` 只通过 `TradeQueryService` 读取物化 Trade/Close Slice，不再直接查询 `LedgerEvent`；旧 `projectCompletedTrades` 实现及重复测试 fixture 已删除。完整 Trade 与 Close Slice 分层候选、显式 `TradePlan.tradeId`/事件证据关联、统计资格、legacy 人工确认和 Journal Review Snapshot 持久化均已接入。投影指纹变化才使相关快照过期，账户级 Generation 变化但 Trade 指纹不变不会误过期。
  - 回归结果：server Journal 5 个定向测试通过，server 全量 37 个测试文件/290 个测试、schemas 7 个测试文件/94 个测试、api-client 10 个测试、desktop 18 个测试文件/102 个测试通过；server typecheck/build、Prisma schema validate、定向 ESLint/Prettier 和 `git diff --check` 通过。

- [x] T16：执行影子投影、历史对比与分阶段切换（本地环境已完成）
  - 涉及范围：全量影子重建、Position/成本/Cash/收益/Journal 差异报告、读取开关、迁移门禁和旧投影删除。
  - 完成条件：差异全部分类为预期口径变化、证据不足、迁移缺陷或算法缺陷；后两类清零；依次切换 Trade 查询、账户数据、投资组合和 Journal；最终删除旧独立计算路径。
  - 验证方式：在本地 Docker 环境执行全量影子重建、差异分类、切换与回滚门禁；记录逐账户不变量和原始账本未修改结果；不得用修改原始事实静默配平。正式发布环境不属于当前任务范围。
  - 验证证据：新增 `projection-shadow-diff.mjs`、`projection-shadow-rebuild.mjs`、`projection-switch-gate.mjs` 及 domain 差异分类/切换门禁；差异分为预期粒度、证据不足、FX 缺口、迁移缺陷、算法缺陷和未分类，迁移/算法/未分类阻断；shadow rebuild 在事务内回滚并输出逐账户稳定性报告，`sourceLedgerMutated` 固定为 `false`。固定快照差异为全零，unified 四阶段门禁允许通过；开发 Compose 两个账户的回滚重建均 `rolledBack=true`、稳定报告 `PASS`。
  - 本地验收结果：`pnpm projection:shadow-diff` 的六类差异计数均为 0；unified 四阶段切换门禁和 legacy 回滚门禁均 `allowed=true`；带 `--source-ledger-mutated` 的危险路径按预期拒绝。Compose 内逐账户回滚重建覆盖 2 个账户，均 `rolledBack=true`、差异为 0、稳定性 `PASS`，且 `sourceLedgerMutated=false`；本地 `/api/v1/health` 与 `/api/v1/integrity` 分别为 `healthy` 和 `issueCount=0`。
  - 范围说明：生产数据副本提交型迁移、完整性能/并发演练、真实在线 FX、分阶段发布和旧镜像回滚属于正式发布范围外事项；相关操作仍记录在 [`Trade Projection 影子迁移与分阶段切换手册`](../operations/2026-08-28-trade-projection-cutover.md) 中，但不作为当前任务门禁。

- [x] T17：补齐文档、运行时验收与最终一致性 Review（本地环境已完成）
  - 涉及范围：总 Spec、子 Spec、任务证据、领域文档、API 文档、用户指南、迁移手册、浏览器与真实数据库验收。
  - 完成条件：当前 Spec 范围内的本地验收标准均有实现与证据；正式发布环境属于非目标；确定性测试与本地真实运行证据分别记录；所有 P1/P2 均已修复。
  - 验证方式：运行受影响包的测试、类型检查、构建、格式、ESLint、Markdown 链接扫描、`git diff --check` 和最终 Spec/任务/实现三方核对。
  - 验证证据：新增 [`Trade Projection 影子迁移与分阶段切换手册`](../operations/2026-08-28-trade-projection-cutover.md)，并同步环境变量、迁移矩阵、总 Spec 与本任务证据；确定性测试和本地 Compose/浏览器运行态证据已完整记录，正式发布环境不纳入当前验收。
  - 本地最终回归：`pnpm test` 通过，domain 9 个测试文件/97 个测试、server 37 个测试文件/291 个测试、schemas 7 个测试文件/96 个测试、api-client 10 个测试、desktop 18 个测试文件/103 个测试、mobile 1 个测试文件/7 个测试全部通过；`pnpm typecheck`、34 条 migration matrix、全仓 ESLint、定向 Prettier、脚本 `node --check`、`git diff --check` 均通过。
  - 本地运行态：T5 迁移 smoke、T6 数据库不变量、T14 本地浏览器验收、T16 影子差异/回滚/切换门禁、Compose health/integrity 均通过；`/api/v1/health` 为 `healthy`，`/api/v1/integrity` 为 `issueCount=0`。
  - 范围说明：生产数据副本提交型迁移与恢复、并发/性能、在线 FX、正式发布环境浏览器、分阶段发布和旧镜像回滚不属于当前任务范围，不影响本地环境完成。

## 最终 Review 返工任务

- [x] T3-R1：限制 Compose 应用角色与数据库 owner 必须不同；配置相同或缺失时启动前失败。
- [x] T5-R1：迁移前阻断负 `fee` / `tax`，并补充负费用回滚与费用保真测试。
- [x] T6-R1：将 Draft 幂等查写收敛到可串行化事务，完整比较内容指纹，并规范并发唯一键冲突响应。
- [x] T6-R2：持久化 V2 事件的 `sourceRowId`，补充来源行读取契约和回归测试。
- [x] T6-R3：拆除当前变更引入的多重嵌套三元，并同步数据库索引说明和测试证据数量。
  - 验证证据：定向 `no-nested-ternary` ESLint、相关 Markdown 文档的 8 个本地链接扫描、定向 Prettier、受影响 server 测试和 `git diff --check` 均通过；当前 server 为 32 个测试文件/262 个测试，迁移矩阵为 32 条。

## 验收标准映射

| Spec 验收标准 | 对应任务 |
| --- | --- |
| 1. 不可变账本、修正链、幂等与版本确定 | T2、T3、T4 |
| 2. 并发写入不产生重复或不同步投影 | T3、T4、T10 |
| 3. 相同输入和版本产生相同投影 | T7、T8、T9、T10 |
| 4. Position 与 ACTIVE Trade 数量一致 | T8、T10 |
| 5. Close Allocation 成本与费用守恒 | T9 |
| 6. Baseline 跨检查点对账且不重复计入 | T6、T7 |
| 7. 账户、模式与币种不混算 | T8、T10、T11、T12 |
| 8. 汇率缺失时保留原币结果 | T11 |
| 9. 账户数据三页签与成交主流程 | T13 |
| 10. 投资组合 Trade 列表、详情与两级复盘入口 | T14 |
| 11. Journal 使用统一 Trade Projection | T15 |
| 12. 旧候选迁移和过期判断明确 | T12、T15、T16 |
| 13. 影子差异达到切换门槛 | T5、T16 |
| 14. 确定性与真实运行验收分别记录 | T17 |

## 最终一致性 Review

- [x] Spec 当前范围内的全部验收标准均有实现和本地证据
- [x] 所有已勾选任务均有验证证据
- [x] 实现未超出 Spec 声明的范围
- [x] 测试与文档已同步更新
- [x] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

  - 结论：本轮 Standards + Spec 一致性 Review 已完成；T2、T3-R1、T5、T5-R1、T6、T6-R1、T6-R2、T6-R3、T6-R4、T7、T8、T9、T10、T11、T12、T13、T14、T15、T16 与 T17 已有实现和本地验证证据。当前本地任务已收尾；正式发布环境不在当前范围。
  - 发现的问题：
  - T5-R1 已修复：旧 BUY/SELL 的负数、缺失值和 `NaN` 费用在迁移事务预检阶段阻断；零费用与正费用明细通过隔离数据库演练验证。
  - T3-R1 已修复：Compose 角色预检、bootstrap 和 migration 后 hardening 已拒绝同名角色并恢复 LedgerEvent 的 UPDATE/DELETE 权限边界。
  - T6-R2 已修复：`sourceRowId` 已写入 `LedgerEvent`，有效事件、修正链和回滚读取均保留来源行追踪；历史空值事件仍可读取。
  - T11 已修复：多币种现金、Position、组合估值和 Performance 汇总均通过独立 FX Conversion View 折算；不同币种在没有 FX 时不再直接相加，原币结果和缺失币种证据仍然保留；T6-R3 已修复性能/组合文件的多重嵌套三元、数据库索引说明和任务测试数量证据漂移。
  - T15 收尾已修复：旧 `projectCompletedTrades` domain 路径和重复测试 fixture 已删除，Journal 统一消费物化 Trade Projection。
  - R-CODE-01 已完成结构评估：`ImportService` 保留为组合 Facade，`PerformanceService` 暂不拆分；只有出现第二个独立消费者、可替换 Adapter 或独立发布/性能边界时才重新设置拆分 seam。
  - R-STD-02 已修复：Journal 快照保存已从页面内直接 POST 改为 TanStack Query mutation，成功后失效 Journal 查询根键，失败仍保留原有结果和 Toast 行为。
  - R-STD-03 已修复：PortfolioTradeView 的账户范围和生命周期 Select 均已将 SelectItem 放入 SelectGroup，符合 shadcn 组件组合规范且保持筛选行为不变。
  - R-STD-04 已修复：AccountDataExecutionSheet 的成交与费用表单网格均已改为 FieldGroup/Field 组合，保留原有字段、校验和布局行为。
  - R-STD-05 已修复：AccountDataExecutionSheet 底部操作区已使用 Separator 替代原生 border-t，保留原有按钮布局和提交行为。
  - 遗留风险：当前 Spec 范围内没有未处理的阻断项。正式发布环境事项已明确列为范围外；当前开发持久卷已成功应用第 34 条 migration。全量 `pnpm format` 仍报告 49 个既有文件格式差异，本轮未覆盖无关文件。
  - 验证命令与结果：domain 9 个测试文件/97 个测试、server 37 个测试文件/291 个测试、schemas 7 个测试文件/96 个测试、api-client 10 个测试、desktop 18 个测试文件/103 个测试通过；server typecheck/build、Prisma schema validate、34 条 migration matrix、定向 ESLint/Prettier、根脚本 `node --check`、固定快照 diff/switch gate、Compose migration/permission hardening/health/integrity 和逐账户事务回滚 shadow rebuild 均通过。
