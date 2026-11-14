# 原价参考冻结子窗口验收

核验日期：2026-11-12（Asia/Shanghai）。规格：[冻结子窗口校验](../../specs/2026-11-12-price-research-frozen-subwindow.md)。

## 失败事实与根因

- 原任务：`a05c404c-f72e-4624-9ad1-e2839166b613`，标的 `300058.SZ`，状态 `failed`，错误 `DATA_UNAVAILABLE`，摘要为“不复权参考行情与准备时的冻结版本不一致”。
- 原实验：`f2120385-11f7-40b2-9ce5-d59279fcf209`，AI 调用次数为 0，尚未进入候选生成。
- 原价父窗口为 2025-10-31 至 2026-11-10，身份 `1a5b4371819005d2bef096d438b6c779efa064cd4d14050ccf194f42a8508acb`；开发区间读取到 2026-05-14，产生独立子窗口身份 `893340f4d61463546b78b2848df1689bea78f9ea5a57212c2548fb4bd7922ba9`。
- Market 已成功从父窗口裁剪，Backtest 却要求子窗口身份及内容哈希等于父窗口，导致正常分段被误判。原价来源为 `hithink/hithink-financial-api`，后复权来源为 `futu/futu`，本次没有更改来源选择。

## 实现与定向验证

`backtest-price-research-input.ts` 使用 Reader 已验证的父引用匹配配置，在证据行中分别保留父引用 `sourceFrozenWindowRef` 和实际子窗口 `frozenWindowRef`。离线校验独立核对父引用、子窗口身份、完整响应哈希和行情行。整窗仍沿用原证据布局，旧整窗快照兼容。

新测试使用实际 `deriveFrozenMarketWindowViewV3` 裁剪响应，覆盖分段构建、错误父引用、父引用哈希／子窗口哈希／完整响应／行情行篡改，以及两次离线重放。临时恢复旧比较表达式时，测试准确复现原错误；修复后通过。

验证命令与范围：

- `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/price-research-subwindow.test.ts test/backtest/price-research-snapshot.test.ts test/backtest/price-research-pair.test.ts test/market/market-frozen-window-reader-v3.test.ts`：4 个文件、28 项测试通过。
- `pnpm --filter @thesis-ledger/server build`：通过，包含测试类型检查。新测试最初有可选字段类型错误，补齐已知存在的冻结引用断言后构建通过。
- `pnpm exec eslint apps/server/src/backtest/backtest-price-research-input.ts apps/server/test/backtest/price-research-subwindow.test.ts`：通过。两个运行脚本被仓库 ESLint 配置忽略，另以 `node --check` 检查通过。
- `node scripts/check-boundaries.mjs`：通过。没有新增跨领域依赖或需要新增的旁路模式。
- `node scripts/check-file-size-guardrails.mjs`：通过，保留 6 个其他既有文件警告；本次 helper 为 210 行，测试为 154 行。
- 本次路径的 `git diff --check`：通过。工作区既有未提交修改保留，未执行提交或推送。

## 运行态同步

在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh thesis-ledger`，无额外行为参数，退出 0。兼容性预检、workspace 构建、Server／Worker 更新和健康检查通过；没有数据库结构或外部卷变更。镜像 ID 保持不变，本次为容器可写层代码快更。

独立检查 Server 与 Worker 均健康。宿主构建产物及两个容器中的 `apps/server/dist/src/backtest/backtest-price-research-input.js` 的 SHA-256 均为 `33869521f66a2fc4c4e123507454a10b7d04f61770fd05fc02355b962f42a2a2`。

## 原失败输入的实际复算

从主仓执行：

```sh
node scripts/local-runtime/verify-price-research-live.mjs --run-id a05c404c-f72e-4624-9ad1-e2839166b613 --frozen-input --output /tmp/price-research-subwindow-a05c404c-20261112-diagnostic.json
```

正式运行包装直接复用原任务的策略版本、运行配置和冻结价格；临时快照清理后退出 0。当前路由修订 199，两套冻结价格各 128 根 Bar，开发区间为 2025-11-16 至 2026-05-14。计算得到 117 个权益点、116 次模拟成交；两次离线运行校验和均为 `320c7f631f57fd3a`，计算完整性为 `complete`。这些是原冻结输入的研究模型复算结果，没有保存为正式回测或实验结果。

首轮验收报告 `/tmp/price-research-subwindow-a05c404c-20261112.json` 中两套冻结行情均已通过，但后续独立状态接口返回格式错误，退出 1；增加来源诊断后的一次复验通过。成功报告仍记录公共费用来源不可用、3 项可选状态事实未取得及上市日期未知，按现有模型与警告规则处理。这不证明外部状态来源持续可用，也未放宽格式校验或启用任何新能力。

业务摘要核对覆盖 Strategy、StrategyVersion、BacktestJob、Account、LedgerEvent、DesiredProviderPolicy 及其修订、OptimizationExperiment、OptimizationAttempt、AiRun；前后行数与内容摘要一致，`businessStateUnchanged=true`。独立查询确认原任务及实验仍为 `failed`，AI 调用次数仍为 0。

## 验收结论

AC1、AC2、AC3 通过。此次修复验收覆盖冻结输入、快照、离线计算以及目标 Server／Worker 代码同步；没有恢复真实实验或调用 AI，不宣称新的完整 AI 实验已经运行成功。界面及原生配置未修改，浏览器布局与 Native compile 不适用。
