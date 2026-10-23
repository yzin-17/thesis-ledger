# 指标可见性修复证据

> 主题日期：2026-10-18；实际运行至 2026-10-19（Asia/Shanghai）。状态只由[Task](../2026-10-18-indicator-availability-correctness.md)维护。

## 当前写集与版本

Domain `backtest-indicators.ts`：RSI 数值状态同步保留上一输出的完整时钟，在输入中断时共同重置；period=1 的旧状态系数为 0，不额外保留无数值影响的前缀。ATR 核对当前及实际前收状态，TR 合并两者时钟，非法 OHLC 返回不可用。未改 RSI 平滑、EMA 种子或 MACD 缩放。

Server 正式调用链是 `LocalSnapshotV3Runner → runExchangeVertical → buildPointInTimeIndicatorSeries → indicatorSeriesFor → evaluateIndicator`。文件名含 v2 的分派仍是当前路径。指标缓存是一次助手调用内的 Map；没有持久跨 Run 缓存。新 Runner 身份为 `thesis-ledger-v3-local-runner-v3`，Snapshot 输入协议不变。旧已完成 Run 保持只读；旧绑定版本的 queued Run 明确失败，failed retry 拒绝跨版本，保留旧结果与版本，需显式新建 Run。

## 原反例及定向结果

- 修复前 `pnpm --filter @thesis-ledger/domain exec vitest run test/backtest-indicators.test.ts`：新增三项全部失败，11 个旧项通过。RSI 丢首点时钟、ATR 丢前收时钟、unavailable OHLC 被复活均复现。
- 修复后 `pnpm --filter @thesis-ledger/domain exec vitest run test/backtest-indicators.test.ts test/backtest-indicator-availability.test.ts`：2 文件、19 项通过。保留原 `[100,90,91,92,93]` 与首点改 1000 的数值；两者实际可用时间均保留 Jan10。覆盖 researchClock、嵌套 EMA/RSI、中断重新预热、追加未来输入与 EMA 对照。
- `pnpm --filter @thesis-ledger/domain build`：通过，保证 Server 消费的是更新后的 Domain 包。
- `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/v3-indicator-availability.test.ts test/backtest/indicator-engine-version.test.ts test/backtest/indicator-availability.test.ts test/backtest/v3-runner.test.ts test/backtest/v3-run-lifecycle.test.ts test/backtest/v3-research-execution.test.ts test/backtest/v2-adjusted-indicators.test.ts`：7 文件、35 项通过。

## 消费证明的精确范围

Server 延迟种子负例保持原审查的共同预计算锚点 Jan10，检查 Jan5，ATR 检查 Jan2；全 tick 与同锚点子 tick 均不提前接受。若计算窗口只到 Jan5，现有 `buildSeriesVariantsAt` 会先将首点排为 unavailable 并重新预热，可能得到不依赖首点的不同合法结果；不能将其误认作原递归泄漏，也不能拿不同锚点数值直接作一致性比较。

完整 V3 专用测试通过真实 Snapshot 构建、产物落盘、校验、Runner 和 Domain 执行，再从磁盘离线重放；覆盖嵌套 RSI/EMA 与 ATR，输入 manifest 不变，未重新读取来源。V3 固定快照研究按显式 researchClock 模拟决策可见性，不等于严格历史 PIT。直接用 ATR 与无单位常量比较被现有价格单位门禁拒绝；测试改用同价格单位 close 比较，未放宽门禁。

## 包级检查与剩余门禁

IVA3 的本地消费与兼容断言已补齐：

- `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/backtest-nav-offline.test.ts test/backtest/backtest-nav-visibility.test.ts test/backtest/backtest-nav-consumption.test.ts`：3 文件 41 项通过，含真实 Parquet 冻结、可见性和离线回放。
- `pnpm --filter @thesis-ledger/schemas exec vitest run test/performance-correctness.test.ts test/strategy-authoring.test.ts test/strategy-authoring-output.test.ts`：33 项通过，其中策略编写保护 30 项。其后 Schema 全量 101 文件 1,129 项通过，包含新增新闻合同；没有放宽 OHLCV 约束。
- Domain 全量 49 文件 441 项通过；后续最终 ATR 前收合法性检查后，重跑本主题 19 项并重新构建通过。Server 最终受影响集合 40 文件 433 项通过，包含本主题 7 文件与上述 NAV 回归；新增新闻错误分类的后续 61 项另行验证，没有改动指标输入。
- Server 和 Desktop 的正常类型检查、构建通过；边界、workspace 依赖与文件尺寸检查通过。`runBacktestAttempt` 按执行前置职责提取后复杂度为 29，较本轮添加版本分支时的 33 收敛；未提高阈值。
- 本轮新模块和受影响源码定向 lint 无错误；全仓 `lint-workspace.mjs --guardrails` 尚未通过，剩余三处既有错误位于 `portfolio.account-actions.ts:60/106/141`（`no-floating-promises`），该文件未由本轮修改。文件尺寸检查保留 8 个旧文件警告；未提供有效基线的这次检查不能单独证明所有旧文件 ratchet，本轮修改的大文件已缩小。

上述本地阶段未运行 IVAG。初次 Docker 只读连接在沙箱内外均失败；2026-10-19 续做时确认环境已恢复，其他主题的隔离 PostgreSQL 不能算作本主题目标证据。该阶段未更新目标或执行 Worker 验收，没有操作 daemon、来源或模型。旧 Run、Snapshot 和成功结果保持，未批量宣告历史受影响，未提交或发布。

## 2026-10-19 目标关闭证据

IVAG 已在正式保留更新后的目标 Worker 完成 RSI（嵌套 EMA）与 ATR 的实际构建、冻结、执行、SQL 终态和离线重放。旧 queued/succeeded/failed/cancelled Run 的计算身份、结果和快照保护通过；生产原 71 个 Run 与 642 个快照另经数据保护核对。IVA-AC6 通过，输入为明示合成来源材料，实源和模型调用为 0。候选指纹、命令和清理见[三项 P0 目标验收记录](2026-10-19-p0-target-acceptance.md)。
