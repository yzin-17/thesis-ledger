# 停复牌快照创建与执行本地交付证据

日期：2026-10-06。对应 [主备数据源任务 P5.3b.1](../../archive/tasks/2026-10-06-historical-rules-primary-backup.md) 与 [主备数据源方案](../../specs/2026-10-06-historical-rules-primary-backup.md)。

## 结论与范围

P5.3b.1 已完成本地交付。新建适用的股票固定来源研究快照会整窗读取停复牌状态，独立冻结到 `metadata/trading-status-v3.parquet`，manifest 保存可选引用，结果携带来源、未知日期及未纳入原因。已 finalized 的快照直接复用，不补字段或联网读取。B2 成本版本及旧基准路径保留。

Runner 仅在内存执行视图给已有停牌日 Bar 增加 `suspended`，由既有执行规则拒单；冻结价格、价格输入绑定、执行模型和 RunConfig 身份保持原样。缺 Bar 不生成价格，复牌与 unknown 不清除行情已有约束。基准排除已知停牌日的买卖报价，沿用现有缺日对齐规则。状态不进入策略谓词。

本次使用已有真实公告响应样本、合成价格／日历与临时 Parquet 存储，证明本地创建、执行与重放接缝。Desktop 披露由 P5.3b.2 完成；目标 DSA／Server、真实价格回测与浏览器验收由 P5.4 完成。本次没有更新 Docker、数据库、路由、Provider 或浏览器进程，没有提交或推送。

## 行为证据

- `000995.SZ`、2023-08-16～21 整窗状态读取一次；08-17 已知停牌拒单，不成交。冻结 Bar 与模型内容身份不变，结果来源保留首次历史可见时钟未验证的说明。
- 现有 DAY 订单拒绝后不会因相同目标自动重提。本次保持该行为；从 08-18 复牌日产生的新信号在下一有效开盘 08-21 成交。
- 08-17 没有行情 Bar 时不补价，08-16 信号按原下一有效开盘规则于 08-18 成交。该场景与已有 Bar 的停牌拒单分别验证。
- 全窗 unknown 继续使用已选研究价格，不把 unknown 改成正常，不逐日重新选源。全部来源失败或未配置时冻结未纳入原因，成交、指标、基准和完整性与无已知约束的研究基线一致。
- 测试策略只有开仓、没有平仓，普通基线因 `NO_CLOSED_TRADES` 为 partial；停牌拒绝导致无成交的样本为 unavailable。这是原指标规则的结果，不因研究说明强制 complete，也不因新 warning 强制降级。
- 窗口从停牌日开始时，基准不使用该日报价买入，仍输出有效基准净收益及原执行模型成本身份。
- 先将状态读取、选源及价格读取改为离线失败，再复用已 finalized 快照和重复执行，结果一致，无额外读取。独立读取／冻结 helper 的错误版本、身份、窗口、产物绑定与孤立产物回归继续通过。

## 旧快照精确兼容

在改动生产文件前，用仓库外临时测试实际采集两种旧快照基线；改动后的集成测试直接核对完整 Snapshot 身份及结果校验和，不使用新代码重新定义期望值。

| 旧快照类型 | Snapshot 内容身份 | 结果校验和 | 基准状态 |
| --- | --- | --- | --- |
| 已有 B2 成本版本、无状态引用 | `5282cf476dfa0fb636e81cd563c6b030c3d551150bf5609a3302d9ea6b57aa03` | `f8467595af22acbf` | available |
| 缺成本版本、无状态引用 | `09f5fbd0bc6c8cb56f03435313f94e040cb64d3b63891d31c516a6af479b451c` | `f762c1239b7d6bf0` | unavailable，原成本不支持路径 |

共同 RunConfig 身份：`05214da84a9403d021df1b2ee81668f66c6202e916530db548c77a90210371b7`。两项均通过；新状态读源可用时也不为旧快照补充披露、引用或 warning。

## 验证记录

| 检查 | 命令／输入范围 | 最终结果 |
| --- | --- | --- |
| Schema 定向 | `pnpm --filter @thesis-ledger/schemas exec vitest run test/backtest-trading-status-integration-v3.test.ts test/backtest-trading-status-v3.test.ts test/backtest-snapshot-v3.test.ts --reporter=dot` | 3 文件、12 项通过 |
| Server 定向 | `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/trading-status-execution-v3.test.ts test/backtest/trading-status-snapshot-v3.test.ts test/backtest/public-fees-snapshot-v3.test.ts test/backtest/v3-runner.test.ts test/backtest/v3-sparse-benchmark.test.ts --reporter=dot --maxWorkers=2` | 5 文件、33 项通过 |
| Schema 包级 | `pnpm --filter @thesis-ledger/schemas test` | 66 文件、724 项通过 |
| Server 包级 | `pnpm --filter @thesis-ledger/server exec vitest run --reporter=dot --maxWorkers=2` | 304 文件、2,473 项通过；47 文件／217 项按环境跳过，不计真实运行验收 |
| 静态与构建 | Schema、Server 各自 `typecheck`／`build`；Desktop、Mobile、API Client 各自 `typecheck` | 全部通过；无原生依赖或数据库结构变化 |
| 局部门禁 | 本叶 12 份源码／测试的 ESLint `--max-warnings=0`、Prettier；`check-boundaries.mjs`、`check-workspace-dependencies.mjs`、`check-file-size-guardrails.mjs`；作用域 `git diff --check` | 全部退出 0；9 项其他文件既有尺寸告警保留，没有调整阈值或 ignore |

首轮接入测试暴露完整产物清单未登记状态文件，已在原完整性检查接缝按 manifest 可选引用登记该产物，保留精确清单约束。随后发现测试错误假设 DAY 拒单会自动重提，以及只有开仓的基线会 complete；已按现有规则修正测试并增加独立复牌新信号场景，没有修改撮合器或指标完整性规则。

## 一致性与交接

B4 由另一对话独占目标更新窗口，等待其实际构建、同步、重放与浏览器验收结束后才修改本叶生产写集；现已收到完成及释放确认。B1～B4 证据、版本与任务勾选保留，本叶未把本地修改当作新的目标部署证据。

Builder 394 行、Runner 308 行、新状态执行 helper 56 行；集成 fixture 131 行、执行测试 230 行。新增职责放在明确的 backtest helper，未扩展撮合器或基准费用算法，没有新增跨 feature 依赖。主仓开始时 640 个 dirty 路径，收口检查 645 个，全部并行工作保留。

P5.3b.1 可勾选；P5.3b／P5.3 父项待 P5.3b.2 消费面完成，P5.4／P6 继续保留各自验收。
