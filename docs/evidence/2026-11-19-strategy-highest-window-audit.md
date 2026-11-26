# 策略最高价窗口接续核对

2026-11-19，对应[上层任务](../archive/tasks/2026-11-13-strategy-definition-authoring.md)的 L01／R11、C02，以及[能力附录](../specs/2026-11-13-strategy-rule-capabilities.md)的窗口与预热断言。本轮完成实现盘点和本地定向验证，未实施历史引用能力。

## 基线与变更

执行目录为 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger`，现有检出 `main@1ed418780d19`，带共享未提交修改。本轮保留既有工作区，仅新增 `apps/server/test/backtest/highest-window.test.ts`、本记录，并原位更新上层 Task 的当前前沿与复核结论。Domain、Schemas 构建更新本地生成产物，不表示目标容器已更新。

## 已支持的行为

| 核对项     | 观察与边界                                                                                                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 正式定义   | 日线来源声明 `high` 与 `close`，`close > Highest(high, 20)` 可通过 `strategySchema`。它表达含当根的最高价对照。                                                                                           |
| 指标窗口   | `backtest-indicators.ts` 的 `contiguousWindow` 使用截至当前索引的 20 个点；`Highest` 复用该窗口，不排除当根。嵌套指标计算与预热已有通用路径。                                                             |
| 准备与预热 | `strategyRequiredLookback` 对此定义返回 20；正式 `planBacktestPriceInputs` 规划 20 期，冻结预算为 19 时以 `INVALID_WARMUP_RANGE` 阻断，预算为 20 时通过。`splitWarmup` 对应开始日前 19 个可用值加当前值。 |
| 严格比较   | 求值器使用十进制比较。阈值为 100 时，收盘 100 不触发，100.00000000000000000001 触发。                                                                                                                     |
| 首窗缺值   | 总观测不足 20 个、首个完整窗口含缺值，指标及正式表达式求值均为 `unavailable`，不把缺值补为零或跳过缺值凑满窗口。                                                                                          |
| 延迟可见性 | 首个完整窗口包含延迟观测时，指标保留最晚 `availableAt`；正式 Server 指标构建和求值不会因整段预计算而提前放行。                                                                                            |

这里的“首窗缺值”不扩展成所有后续缺口的保证：通用 `alignSeriesAt` 会查找最近一个可用旧值，当前不可用时可能回退早前有效指标；本轮没有修改该既有对齐行为。后续历史引用必须明确历史观测身份、缺样本与可见性，不能靠旧值回退冒充上一根。

源码链为 `packages/schemas/src/backtest-expression.ts`、`backtest-expression-validation.ts` → `packages/domain/src/backtest-indicators.ts` → `apps/server/src/backtest/backtest-dependency-price.ts`、`backtest-v2-execution-shared.ts`、`backtest-adjusted-indicators.ts` → `packages/domain/src/backtest-simulation-evaluator.ts`。运行层证据是调用这些正式函数的本地测试，并非实际 Worker 或目标容器验收。

## 首个实际缺口

正式数值合同没有可表达“在同源上一根结束的窗口”的历史引用／窗口终点。`Highest` 仅允许 `period` 参数；增加 `params.offset=1` 被正式策略校验以路径 `entry.right.params.offset`、消息“未知 Indicator 参数”拒绝。当前节点清单没有历史引用；探查写法 `history(periods=1, input=Highest(...))` 在数值 Schema 和正式策略 Schema 均被拒绝。该拼写仅用于结构探查，不是已选扩展协议；缺能力结论还由节点清单、参数校验和构建／求值分支共同支持。

| 独立模拟输入                               | R11 预期             | 当前含当根定义的实际值与结果                              |
| ------------------------------------------ | -------------------- | --------------------------------------------------------- |
| 此前 20 根最高 100，当根最高 110、收盘 105 | 突破，条件为真       | `Highest(20)=110`，`105 > 110` 为假，与原意不同           |
| 此前 20 根最高 100，当根最高 110、收盘 100 | 等值不突破，条件为假 | `Highest(20)=110`，条件为假；这一结果单独不能证明窗口正确 |

新增测试用此前 20 个模拟观测独立计算阈值 100，再以常量阈值确认真／假预期；这只是对照依据，不是历史引用实现，不可拿这份常量定义替代正式策略。

R11 的正确需求是此前 20 个已完成日线观测，加上当根收盘用于比较，至少涉及 21 根观测；此前只有 19 根时不能视为就绪。按来源周期取样，周末无观测不增加期数。现有 `Highest(20)` 的需求为含当前在内的 20 根，二者不得混用。新增模拟序列跨越周末，但不证明真实来源或官方交易日历覆盖。

## 实际验证

以下命令均在上述主仓目录执行、退出 0，使用本地已有依赖，没有安装依赖或请求外部服务。

```sh
rtk proxy env npm_config_registry=https://registry.npmmirror.com pnpm --filter @thesis-ledger/domain exec vitest run test/backtest-indicators.test.ts test/backtest-simulation.test.ts test/backtest-rule-compatibility.test.ts
rtk proxy env npm_config_registry=https://registry.npmmirror.com pnpm --filter @thesis-ledger/domain build
rtk proxy env npm_config_registry=https://registry.npmmirror.com pnpm --filter @thesis-ledger/schemas build
rtk proxy env npm_config_registry=https://registry.npmmirror.com pnpm --filter @thesis-ledger/server exec vitest run test/backtest/highest-window.test.ts test/backtest/indicator-availability.test.ts test/backtest/v2-adjusted-indicators.test.ts test/backtest/backtest-dependency-plan.test.ts
rtk proxy env npm_config_registry=https://registry.npmmirror.com pnpm --filter @thesis-ledger/server exec vitest run test/backtest/highest-window.test.ts
rtk proxy env npm_config_registry=https://registry.npmmirror.com pnpm exec prettier --write apps/server/test/backtest/highest-window.test.ts
```

- Domain 三文件共 39 项通过。
- Server 首次四文件共 24 项通过，当时新增窗口文件为 7 项。随后仅增加正式准备规划／预算一项，受影响的窗口文件重跑 8／8 通过；其余 17 项代码与输入未改，复用首次结果。合计 64 个不同测试通过。
- Domain、Schemas 两包构建通过。未改生产代码，没有扩大到全仓测试、全仓构建或部署。
- 新增 8 项为现有窗口预热、正式准备预算、突破／等值两个对照、严格高精度比较、短样本、首窗缺值及延迟可见性。全部通过表示当前行为已核对，不表示 R11 已实现。

正式 Schema 结构探查使用刚构建的 `packages/schemas/dist/index.js` 和既有 `packages/schemas/fixtures/strategy-authoring.exchange.json`，以 `node --input-type=module -e` 本地读取：分别替换 `entry` 为 `close > Highest(high,20)`、增加 `offset=1`、把右项替换为历史节点。结果依次为接受、拒绝、拒绝；数值 Schema 单独检查历史节点也拒绝。未写入数据库。

## 一致性复核与证据复用

本轮核对结论与现有 Spec 的 C02／R11 一致。首个缺口仍由 L01 持有，后续须先确定历史取样合同，再分别交付执行和消费面；本轮未选择新的 AST 拼写、改变现有 `Highest` 语义或勾选能力完成。

L03、L04、G03 仍由上层 Task 持有原义务。交易计划、日线委托、真实分钟窗口的已验范围复用[归档 Task](../archive/tasks/2026-11-15-backtest-trade-plans.md)；ATR 编写复用[归档成对回执](../archive/evidence/2026-11-19-backtest-atr-authoring-pair.md)，原始失败及回执适用边界保留，不重跑已完成验收。

本轮没有真实模型调用、行情等外部实读、数据库写入、部署、提交或推送。真实模型、保存／冻结／Worker、双端界面与原生设备以及目标运行态均未为 R11 新增验收证据；新增调用或部署须另行授权。本次接续核对完成，策略定义总任务仍未完成。
