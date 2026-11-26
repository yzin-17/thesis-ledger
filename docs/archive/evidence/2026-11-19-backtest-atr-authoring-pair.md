# ATR 保护策略编写成对复验

2026-11-19，T04e.6b 的冻结 ATR 与逐期更新 ATR 均在本轮首次业务生成通过。其余六组复用 11 月 16 日完整成对回执，累计七组、十四份配置通过。[原始矩阵与失败归因](../../evidence/2026-11-15-backtest-trade-plans.md#atr-编写逐期侧的只读归因) · [交易计划 Task](../tasks/2026-11-15-backtest-trade-plans.md)

## 原意和实际输出

两条业务意图与上次逐字相同。两份模型原始响应的提案分别等于适配器输出，其策略定义逐字段等于通过正式编写校验、存入隔离库的配置。两侧均只在空仓时以权益的 20% 买入，普通退出恒假，佣金 0.03%、滑点 0.1%，完整平仓后冷却 10 根日线。仅保护配置不同。两侧入场规则均只有“未持仓”，11 月 16 日原始失败回执保留原判。

| 原始输出 | 生成的保护及中文回读 | 冻结行情下实际全部卖出 | 完整回放校验值 | 实报输入／输出 token |
| --- | --- | --- | --- | --- |
| `frozen-atr` | 首笔实际成交价减委托生成时可见的 2 期 ATR × 2，入场后冻结距离 | 5 月 28 日，6.993 元 | `d44d507f2e98ffcb` | 7,067／5,806 |
| `current-atr` | 最高有效收盘价减当前可见的 2 期 ATR × 2，每个完成收盘重新计算，只收紧，缺值保留已有保护 | 5 月 26 日，8.991 元 | `bbffed9c1c950ee7` | 7,142／3,143 |

两侧均于 5 月 19 日以 10.01 元买入。正式保存事务返回的版本定义与配置相同。每侧均运行冻结快照两次并深比较完整结果，独立执行输出的逐笔成交也与快照结果相同。隔离库为 `ai_provider_concurrency_fixture`，应用 53 项迁移，验收结束由入口清理。

## 实际入口及复用边界

在相邻 `thesis-ledger-infra` 仓库执行，`APP` 为 ThesisLedger 仓库绝对路径。

```sh
rtk proxy env npm_config_registry=https://registry.npmmirror.com \
  BACKTEST_PLAN_ENTRY=authoring BACKTEST_PLAN_SCENARIO=atr-protection \
  BACKTEST_PLAN_CASES=frozen-atr,current-atr BACKTEST_PLAN_GENERATION_MODE=native_schema \
  node scripts/infra.mjs locked --idle -- node "$APP/scripts/local-runtime/run-backtest-trade-plan-acceptance.mjs" \
  "$APP/var/acceptance/backtest-atr-authoring-pair-20261119"
```

命令退出 0，定向集成测试 1／1 通过。实际调用为一次私有格式探针、两次业务生成，各一次传输；两侧均为 `authoring-generation-v5`、`native_schema`，模型为 `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m`。完整 Provider settings 与旧回执相同，业务输出上限仍为 8,192 token，配置费率为零。现行编写提示为 v26，上次为 v24，实际发送的原生 Schema 也有变化。本次确认当前正式入口能按原意完成该组；两次结果不能单独确定旧失败的成因。

逐份核对其余六组成对回执：发现入口的 ATR 和条件保护，编写入口的既有保护和条件保护，修改入口的 ATR 和条件保护。每份均有两条通过记录，旧批次仍为六组通过、一组失败。本轮只新增 ATR 编写这一完整对照。原始请求、响应、交易事件、冻结快照、隔离执行日志及六份旧回执的路径和 SHA-256 均在 `var/acceptance/backtest-atr-authoring-pair-20261119/`，汇总为 `receipt.json` 和 `pair-audit.json`。双容器及四宽页面沿用各自已验样本；本轮未部署、提交或推送，真实 Provider 和历史策略写入为零。
