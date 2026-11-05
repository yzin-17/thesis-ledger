# 历史重放与 PostgreSQL 隔离验证

## 目标运行态历史读取与重放

- 目标 API 成功读取 13 条历史回测详情。8 条成功 V2 结果仍可读；5 条历史封存状态未知的失败记录仍为 `HISTORICAL_REVEAL_UNKNOWN`，未绕过读取限制。
- 在当前 Server 容器内使用实际 `LocalSnapshotStore` 与 `LocalSnapshotRunner`，只读取持久卷中的冻结产物，离线重放全部 8 条成功记录。未经过创建、重试或入队 API，未覆盖历史结果。
- 8 次重放均成功，重放结果校验和同时匹配数据库列与原结果 JSON 中的校验和。样本实际范围均为 CN ETF；不将此结果扩展为其他市场或 NAV 的目标样本证明。
- 重放前后对 14 张账户、账本、持仓、交易相关表计算全表行数及排序行摘要，全部一致。这是本次实际执行前后数据库状态证据，不是静态依赖推断。
- 脱敏输出：`/private/tmp/thesis-ledger-legacy-replay-20260927.log`。临时只读脚本：`/private/tmp/thesis-ledger-legacy-replay-20260927.mjs`。

## 新增 PostgreSQL 集成测试

文件：`apps/server/test/backtest/v3-postgres-isolation.integration.test.ts`。

测试仅接受 loopback 上的 `backtest_v3_fixture`，再次查询实际数据库名后才写入。独立 PostgreSQL 17 顺序应用 19 项当前 migration；账户和 LedgerEvent 使用隔离哨兵，行情和路由修订使用已知 fixture。

3 项真实 Prisma 持久化测试通过：

1. 创建冻结 V3 任务、同请求幂等读取、执行和严格结果持久化；snapshotId、resultChecksum、attempt 与终态一致。
2. 两个执行者同时领取同一数据库任务，只有一个 Runner 实际执行。
3. 执行失败后重试，attempt 从 1 经重试批次递增至 3，复用同一 manifest/snapshotId，未再次调用行情 Reader。

每项结束均核对 Account、AccountLedgerState、LedgerEvent、Position、Trade 的行数和摘要与基线相同。Account/LedgerEvent 有既有哨兵，其他表为空时也检查未新增。队列为明确的投递端口替身，该测试不声称验证了 Redis/BullMQ 投递；数据状态与 CAS 使用真实 PostgreSQL。

首轮测试因未提供队列端口而按产品规则终结为 `QUEUE_UNAVAILABLE`。补齐测试投递端口后 3 项通过；没有修改产品的缺队列拒绝行为。

## 配套回归与边界

- Server：`v2-runner`、`snapshot`、`snapshot-execution-model`、`v2-run-lifecycle` 共 19 项通过，覆盖 NAV 执行竖切、旧快照完整性、模型校验和旧生命周期。
- Domain：`backtest-exchange`、`backtest-simulation`、`backtest-v2` 共 36 项通过，包含 CN/HK/US 原始价格成交及模拟记账。
- 新测试 Server typecheck、定向 ESLint 通过。测试容器已停止并自动删除，仅移除测试自身临时快照目录。
- G-Legacy-pg 子叶完成。完整 G-Legacy 仍需核对 S09/A03 依赖。HiThink 真实正向运行仍受来源准入阻塞。

## 多市场与 NAV 完整冻结重放

2026-09-27 在当前工作区运行：

`pnpm --filter @thesis-ledger/server exec vitest run test/backtest/legacy-exchange-snapshot-replay.test.ts test/backtest/legacy-nav-snapshot-replay.test.ts`

2 个文件、5 项测试全部通过。两组均通过实际 `LocalSnapshotStore` 将 Parquet 产物和 manifest 落盘，使用实际 `LocalSnapshotRunner` 执行，再新建 Store/Runner 从同一目录重放，比较完整结果及校验和。

- CN/HK/US 各一项：冻结原始价格、日历、标的事实及元数据，验证次日开盘买卖、成交价格与交易数量。规则为显式合成样本，只证明旧版冻结消费路径，不作为交易所规则或真实 Provider 证据。
- NAV 两项：完整冻结重放结果稳定；改写净值产物后完整性验证拒绝执行。
- 首轮多市场样本 manifest 使用默认规则版本，与样本 `rules-v1` 不一致而被拒绝；修正样本版本绑定后通过，产品版本校验保持不变。

G-Legacy-frozen 子叶完成。该证据补齐本地完整冻结链路，不扩展目标运行态已有样本的实际市场范围，也不替代 A03 的真实数据库风险应用验证。

两个新增文件已按项目 Prettier 格式化，定向 ESLint 通过。此次仅变更测试及验收文档，无生产源码或运行时输入变化，不重复构建镜像。

## A03 后续验证接缝

已核对现有 `strategy-center-t05-postgres.integration.test.ts`：它替换了 `service.preview`、`store.createFrozenRules` 和 `store.audit`，因此不能作为真实成本重编译和冻结规则落库的组合证明。后续隔离数据库测试需使用实际 `StrategyRiskContextService`、编译器与 Store，并明确保护数据库目标；不得仅重跑 T05 后勾选 A03。

### 真实成本与冻结规则落库组合已通过

新增 `apps/server/test/strategy-optimization/risk-adoption-postgres.integration.test.ts`，在独立 PostgreSQL 17 应用当前全部 migration 后执行，1 项通过。测试仅允许 loopback 的 `risk_adoption_fixture`，连接后再次核对实际数据库名。测试容器已停止并自动删除。

使用实际 Prisma、`StrategyRiskContextService`、风险编译器、Application Service 和 Store，未替换预览、冻结规则写入或审计。唯一行情端口使用确定性 fixture，并断言读取 `adjustment=none`。

- 真实持仓数量 10、成本 200，原始行情 184，编译后的百分比止损评价为触发、收益率 −0.08。
- 策略同时含绝对价离场 1.5、模拟数量 1000000；仅生成一条成本百分比规则，并实际持久化 RiskRule 和应用计划。
- 创建停用的风险应用前后，Account、Position、LedgerEvent、Trade 的行数及完整行摘要一致。Account/Position 有非空哨兵；另外两表为空时验证未新增。

该测试证明停用采纳与真实成本读取的组合，不证明自动监控启用或目标运行态交互；A03 父项保持未勾选，继续补齐剩余边界。

### 成本变化、非法风险及账户隔离补充

同一测试文件扩充为 5 项，重新在应用全部 migration 的独立 PostgreSQL 17 运行，全部通过；Server typecheck、定向 ESLint 通过，测试容器已清理。

- 同时建立 actual 成本 200、数量 10，以及 shadow 成本 1.5、数量 900 的非空持仓。actual 的评价仍为 −0.08，创建采纳前后两账户及持仓完整摘要相同。
- 将 actual 成本改为 100 后，旧预览提交被拒绝；新预览收益率为 0.84，预览哈希改变，已存在的 RiskRule 完整内容不变。该成本更新仅属于隔离测试准备，测试结束恢复。
- 将三种非法风险分别持久化为测试策略版本，再直接调用创建服务：绝对止损价、百分比止损混入绝对价、固定数量风险，均在规则落库前拒绝。已存在规则与四张真实域表摘要保持不变。

上述轮次摘要表范围为 Account、Position、LedgerEvent、Trade；后续扩展见下节。

### 启用采纳与完整事实表范围

当前套件已扩充为 6 项，独立 PostgreSQL 17 重跑全部通过。新增日线 `enabled=true` 采纳，实际创建启用应用和一条启用百分比 RiskRule，阈值仍为 −0.08。该证据覆盖启用配置的创建，不表示后台定时评价或外部通知已运行。

前后摘要扩展到 16 张表：Account、Position、LedgerEvent、Trade、AccountLedgerState、TradeEntryLeg、TradeBaselineComponent、TradeCorporateActionAdjustment、TradeCloseSlice、TradeCloseAllocation、TradeDividendAttribution、TradeEvidenceSource、PortfolioSnapshot、JournalEntry、JournalReviewSnapshot、TradePlan。Account/Position 包含 actual/shadow 非空哨兵，PortfolioSnapshot/JournalEntry 亦有非空既有记录，其余表检查未新增事实。所有正常采纳、失效预览和非法提交场景的摘要均保持一致。

首轮 Portfolio 哨兵使用了非法 source/valuation 枚举而被数据库约束拒绝；按现有 migration 枚举修正样本后 6 项通过，未修改或放宽数据库约束。Server typecheck 与定向 ESLint 通过；此次只改测试和文档，无生产源码更新，测试容器已停止并删除。

A03 已取得采纳服务与真实数据库组合证据，父项最终关闭仍需随 C01/B01 依赖和完整 V-Server 门禁核对。完整 G-Legacy 的 S09 依赖继续保持独立验收。

## 包级回归与 V2/V3 事件样本修正

执行 `pnpm --filter @thesis-ledger/server test`：1352 项通过、68 项按环境条件跳过、1 项失败，日志 `/private/tmp/a03-server-suite-20260927.log`。跳过的数据库测试不计为通过；上述 A03 6 项另有实际隔离数据库执行证据。

唯一失败来自 `v2-execution.test.ts` 的 V3 raw 对照分支，V2 分支本身通过。原测试把无明确生效日的旧事件直接交给 V3，并假设两个版本收益一致。按新事件协议，V3 必须在明确生效日的冻结开盘记账，不能继续复用旧午夜事件假设。

保持 V2 原样本无 effectiveDate，单独复制 V3 行并添加明确的 `2026-09-10` 生效日。V2 收益率仍为 `0.0989010989010989011`；V3 对持有的 100 份记入每份 1 元分红，收益率为 `0.1988011988011988012`。成交比较保持不变，收益分别用精确数值断言。未修改产品代码或降低生效日期校验。

两次修正后的定向回归 3/3 通过。全包结果仍以上述失败批次为准，需下一次完整重跑确认；父项尚未关闭。

### 最终全包复核与 A03 收口

2026-09-27 修正后的 `pnpm --filter @thesis-ledger/server test` 完成：195 文件、1353 项通过；20 文件、68 项按环境条件跳过，0 失败。日志 `/private/tmp/a03-server-suite-final-20260927.log`。Server typecheck 与两个改动测试文件的 ESLint 通过。该轮没有启用数据库测试环境变量，A03 的 6 项真实 PostgreSQL 结果沿用上文独立执行证据，未把跳过计为通过。

核对 C01/B01 已完成的价格单位契约与规则兼容输入，以及 Spec §11.2、AC15/AC16、A03 所列可转换百分比、非法价格/数量、直接服务提交、既有规则和真实域隔离条件，A03 关闭。后台调度/通知不属于本项新增的采纳语义验收，不据此新增阻塞条件；真实 Provider、目标 UI、完整 G-Legacy 和 I01 保持独立开放。

I01 下一接缝已核对：现有 V3 PostgreSQL 测试使用 `ensureEnqueued` 替身，缺少真实 BullMQ 投递与 Worker 执行证据。生产入口为 `backtest-bull-queue.ts`、`backtest-queue.service.ts`、`backtest-worker.main.ts` 和 `backtest.processor.ts`；后续需使用隔离 Redis/PostgreSQL 与实际处理链，不能将直接调用 `runV2` 宣称为队列验收。
