# 普通回测研究默认规则验收

日期：2026-11-07。对应[规格](../../specs/2026-11-07-backtest-research-defaults.md)与[任务](../tasks/2026-11-07-backtest-research-defaults.md)。本记录只覆盖本轮研究默认模型、入口披露及原有真实数据门禁的回归，不代表共享工作区全部变更通过。

## 用户选择与根因

用户明确选择“采用研究默认规则”。DSA 将 `executionRules` 标为 `modelAssumption`，将 `historicalTradability` 标为 `criticalFact`；此前自动解析同时要求两者齐备，导致生成模型也受旧历史状态接口和当天保守可用时间阻塞。

本轮默认从保存策略和用户区间生成研究模型，模型阶段不请求 DSA；严格历史规则分支仍保留来源要求。用户日期原样传递给正式准备链。费用、结算、涨跌停和复权假设直接展示并冻结，未配置税费暂不计入的边界明确披露。历史冻结模型不被覆盖。

## 本地验证

| 层级 | 输入与命令 | 结果 |
| --- | --- | --- |
| Server 定向 | `pnpm --filter @thesis-ledger/server exec vitest run`，输入 `strategy-research-model`、`saved-strategy-model`、`backtest-preflight-v3-execution`、`backtest-run-preparation`、`backtest-snapshot-v3-tradability`、`v3-sparse-tradability-runner` | 85 项通过；最终类型及披露调整后两份模型测试另计 18 项通过 |
| Desktop 定向 | `pnpm --filter @thesis-ledger/desktop exec vitest run test/saved-strategy-backtest.ui.test.tsx src/features/strategy/strategy.ui.test.tsx test/backtest-preparation.test.tsx` | 28 项通过；最终加载／重试文案调整后同组再次通过 |
| Schemas 包级 | `pnpm --filter @thesis-ledger/schemas test` | 1489 项通过，3 项既有跳过 |
| API Client 包级 | `pnpm --filter @thesis-ledger/api-client test` | 211 项通过 |
| Desktop 包级 | `pnpm --filter @thesis-ledger/desktop test` | 1684 项通过；之后仅修改加载／重试文案，并通过上述最终定向验证 |
| 构建 | Schemas、API Client、Server、Desktop 的包级构建 | 通过；Desktop 保留既有大体积产物提示 |
| 静态检查 | 修改文件 ESLint；`scripts/check-boundaries.mjs` | 通过；最终两处 Desktop 文案及相应测试 ESLint 再次通过 |

原预检测试继续覆盖未知交易状态、缺行情、未来资料及冻结来源时钟；执行规则测试验证研究模型仍拒绝不可交易与停牌订单。复权模型仅移除归一化坐标下的真实整手／价位约束，原价模型保持现有真实单位准入。没有修改原数据准入、状态判定、队列生命周期或 Provider 开关。

本机日志：`/tmp/backtest-research-server-focused.log`、`/tmp/backtest-research-desktop-final-focused.log`、`/tmp/backtest-research-schemas-suite.log`、`/tmp/backtest-research-api-suite.log`、`/tmp/backtest-research-desktop-suite.log`、`/tmp/backtest-research-eslint.log`、`/tmp/backtest-research-eslint-final.log`。

## 真实运行态与受控浏览器

真实读取截图策略版本 `cdcb774b-3ea8-4f7f-a336-a2579eebfe97`，标的 `600112.SH`，区间 `2026-10-07` 至 `2026-11-07`。`POST /api/v1/backtests/run-config/execution-model`：省略模式和显式研究默认均返回 HTTP 201、`available`、`research-defaults`，区间原样保留；显式严格历史模式仍返回具体资料不足阻断。此接口仅生成设置，不创建任务。结果保存于 `/tmp/backtest-research-runtime-results.json`。

浏览器使用实际 Vite 页面及真实模型解析接口，分别验证 1440、1024、768、390 宽度：默认就绪、假设披露、高级选项展开、复权研究、提交、取消，共 24 组检查通过。主操作可用，无 JSON 输入，研究说明位于高级选项外；窄屏在弹窗内正常滚动，无横向溢出或弹窗越界。已人工查看桌面及窄屏截图。

四次提交均由 Playwright 拦截并返回受控收据，核对日期、策略版本、模型及冻结假设；实际业务写入为零，页面错误为零。结果及截图位于 `/tmp/backtest-research-browser-qa/`。没有创建真实回测、修改真实策略或证明该标的当前区间可产生可交易行情；实际运行仍须通过后续真实数据检查。

## 同步与范围

通过相邻 infra 的 `./scripts/sync-code.sh thesis-ledger` 更新目标运行态，包含最终加载／重试文案；兼容性预检、构建和服务健康检查通过。日志为 `/tmp/backtest-research-sync-code-final.log`。Server 和 Worker 镜像保持 `sha256:744b2fdee55705ffe8fdd2ca62f0ca5c7f4a8cbe6ded00f27e0c0125f235141c`；本次为容器可写层更新，重建后需重新同步或构建镜像。

无数据库结构变更、来源启用、模型调用、真实业务写入或提交推送。实施范围验收完成，未决项为空。
