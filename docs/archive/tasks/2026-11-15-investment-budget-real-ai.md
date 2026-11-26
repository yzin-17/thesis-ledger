# 投入上限真实 AI 实验验收任务

状态：三组隔离真实 AI 验收已通过，任务完成归档。风险预算、目标波动率复用原通过证据；用户新增授权的百分比修复及一次真实加仓生成已通过，17 笔买入含 6 次加仓，逐笔预算及复跑一致。新旧调用和记录保留，业务库保持只读。最新证据见[百分比修复验收](../../evidence/2026-11-16-strategy-add-percent-semantics.md)，修复运行态已在[对应任务](2026-11-16-strategy-add-percent-semantics.md)收口。下列首轮及重试章节保留此前失败事实。

依据：[验收规格](../../specs/2026-11-15-investment-budget-real-ai.md)。

## 执行清单

- [x] T1 冻结输入：只读导出旧 Run、完整 Artifact、Provider 非凭据配置和原版本／回测摘要；行情行摘要与原证据一致。
- [x] T2 受控接缝：实现隔离实验持久化与冻结 Runner 桥接，固定配置先通过，无模型调用。
- [x] T2a 日期锚点修复：日线当前收盘按已有决策可见时点核对，覆盖日期锚点、真实收盘与未来／缺日门禁；同一港股冻结窗口实际成交。域测试 6/6，受控三组通过，加仓 17 笔买入含 6 次加仓、风险预算 13 笔买入、波动率 113 笔买入含 107 笔低于最高比例的动态目标。
- [x] T3 真实生成：三类均已有真实通过样本，保留每次请求与原始输出；加仓经 2026-11-16 新授权修复复验，未改写旧失败输出。
- [x] T3a 获准重试：加仓与目标波动率各追加一次，300 秒总墙、同一模型、v5 合同和冻结行情；两次均完整生成，没有额外调用。波动率通过，加仓阈值不符意图，整体集成任务退出 1。
- [x] T4 逐笔复核：原完整区间检查全部买入费用、滑点及持仓占用，复跑一致；风险预算 15 笔、目标波动率 113 笔买入及加仓组 17 笔买入含 6 次追加均通过。
- [x] T5 历史与记录：导出全部新实验、候选、AiRun、回测和逐笔报告；获准两次重试及诊断后再次核对，原策略、6 个版本和 14 个回测摘要不变。

## 此前输入与隔离边界

输入：`var/acceptance/investment-budget-real-ai-20261115/input.json`，行情 282 行，SHA-256 为 `f63e1d7fbe5895acf0d63c1fb9e743b352fb902df5f20e0987fc39d2e8930c47`。原策略 6 个版本、14 个回测进入保留核对。

写集包括本次验收脚本、测试与文档，以及预检发现的波动率收盘时点修复；不修改相邻交易计划任务。受控尝试 `controlled` 至 `controlled-5` 全部保留，前四次失败均为接缝／预热／时点问题，未调用模型。`controlled-5` 三组通过并且冻结行摘要一致。

首次 `live` 尝试因工作区 v6 与目标路由 v5 不符，在发送前失败，调用数为零；三个隔离失败实验保留。`live-v5` 使用目标导出的真实 v5 Schema，不修改 Provider 或伪造路由验证。首个加仓请求触及 120 秒总墙，外部结果未知，没有自动重试；另外两类按原计划各一次。错误标签为 `cancelled`，但实际 cause 为 `TimeoutError`，不得解释为用户取消。

历史核对已通过：原策略、6 个版本和 14 个回测全部摘要一致，详见私有 `history-verification.json`。截至此前验收结束，波动率日期锚点修复只有源码、域测试与隔离 Runner 证据；当时为避免连带发布相邻 v6 工作，未更新共享运行态。2026-11-16 的当前合同和运行态见最新修复证据。

## 首轮实际结果

`live-v5` 三次真实调用：加仓与波动率总墙超时，原始尝试为 `unknown_outcome`；风险预算的正式 AiRun 成功，验收误拒绝了“空仓且上穿”的合法组合。修正验收后，`review-v5` 在隔离库恢复原实验和原 AiRun 记录，未重发请求、未改写模型策略。风险预算原样保存候选版本并执行正式完整冻结 Runner，15 笔买入、29 笔成交全部预算检查通过，最小预算余量为 `1.4751860280734e-38` HKD。风险预算生成策略还含下穿 EMA 退出，按原样保留。

私有报告：`var/acceptance/investment-budget-real-ai-20261115/验收报告.md`；详细逐笔核对为 `review-v5/risk-audit.json`。历史后核对 `history-verification-after-initial-ai.json` 再次通过。域定向测试共 15 项、Server 定向 5 项通过，Server 类型检查、新增验收文件 ESLint 与格式检查通过。

此前用户明确允许的下一步：保持同一模型、真实 v5 合同及冻结行情，仅在隔离测试中设置 `INVESTMENT_AI_CASES=add,volatility`、`INVESTMENT_AI_TIMEOUT_MS=300000`，各重试一次，共新增两次调用，无自动重试，不修改产品时限或 Provider 配置。输出使用新的 `retry-v5-300` 目录，不覆盖首轮记录。

## 获准重试实际结果

两次重试均成功生成。加仓计划 `gainPercent.value="0.5"` 在执行器和中文回读中均表示上涨 50%，与自然语言的 0.5% 不符；没有人工改写为 `0.005`。验收检查拒绝后，额外执行零模型调用的负例诊断，直接复核原 AiRun 输出并原样冻结回放，得到 11 笔首次买入、0 次加仓、21 笔成交。首次 20% 投入未超限，但实际加仓未得到验收，T3／T4 保持未完成。

波动率真实计划完全符合十九个收益、二十个收盘、目标年化 10%、最高 50%、每日主动增减的请求。完整冻结回放 113 笔买入、95 笔卖出，其中 107 笔买入使用低于 50% 的动态目标；每笔含费用和滑点均严格不超目标，无容忍误差，复跑一致。新版本 `99ca804b-6068-4fb3-af18-aba3d7998820`，回测 `c377fcd5-8e2e-4249-827f-194581984c74`。完整记录见 `retry-v5-300/records.json`，逐笔报告 `retry-v5-300/volatility-audit.json`。

负例诊断测试 `test/backtest/investment-budget-rejected-model.test.ts` 通过，表示错误阈值被正确识别，并非加仓验收通过；当时 Server 类型检查、该文件 ESLint 通过。原记录核对 `history-verification-after-approved-retry.json` 通过。该轮授权共五次真实调用全部执行，未额外调用；当时剩余的加仓语义及真实复验由 2026-11-16 新授权任务完成，旧失败未改写。

## 本轮命令与边界

执行目录均为 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger`。以下模型命令使用仓库正式隔离 PostgreSQL 入口，应用 53 个 migration 后运行真实 Server 服务类与冻结 Runner，结束后清理隔离容器；没有写业务库或更新共享运行态。

```sh
rtk proxy env INVESTMENT_AI_DIRECTORY=/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/var/acceptance/investment-budget-real-ai-20261115 INVESTMENT_AI_DEPLOYED_SCHEMA=1 INVESTMENT_AI_LIVE=1 INVESTMENT_AI_CASES=add,volatility INVESTMENT_AI_TIMEOUT_MS=300000 INVESTMENT_AI_LABEL=retry-v5-300 AI_PROVIDER_TEST_TIMEOUT_MS=900000 node scripts/test-ai-provider-postgres.mjs test/backtest/investment-budget-model.integration.test.ts
```

退出 1：加仓意图检查失败；波动率完整链路通过。`receipt.json` 证明实际只发送两次请求，总墙 300 秒，无自动重试。

```sh
rtk proxy env INVESTMENT_AI_DIRECTORY=/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/var/acceptance/investment-budget-real-ai-20261115 INVESTMENT_AI_REJECTED_CAPTURE=retry-v5-300 pnpm --filter @thesis-ledger/server exec vitest run test/backtest/investment-budget-rejected-model.test.ts
rtk proxy node scripts/local-runtime/verify-investment-history.mjs var/acceptance/investment-budget-real-ai-20261115 history-verification-after-approved-retry.json
rtk proxy pnpm --filter @thesis-ledger/server exec tsc --noEmit
rtk proxy pnpm --filter @thesis-ledger/server exec eslint test/backtest/investment-budget-rejected-model.test.ts
```

以上四项退出均为 0。负例回放由正式 V3 Runner 独立执行两次并比较结果，直接比较原 AiRun 输出、原 282 行行情及可比输入指纹；逐笔预算校验使用十进制重建现金、持仓和含费用支出。共享容器没有部署证据，不能将本次隔离结果提升为产品入口或 v6 通过。

## 最终一致性 Review

- [x] 三类均有真实输出及正式冻结 Runner 通过证据，实际加仓、风险预算和主动波动率调整达到验收要求。
- [x] 原 282 行行情及依赖复用，逐笔含费用和滑点不超限，复跑一致；各次授权独立计数，旧失败保留。
- [x] 原策略、6 个版本及 14 条回测在后续修复和运行态更新后仍不变；隔离服务、产品入口及投资绩效的证据边界明确。
- [x] 最终代码、运行态及文档一致性由关联修复任务复核通过；无本任务未决事项，工作区修改保持未提交。

结论：通过；具体新记录、实际命令和本地运行态证据见统一验收报告。需求规格继续保留为验收合同。
