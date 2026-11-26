# 策略生成覆盖关联与七例复验

关联 [任务归档](../archive/tasks/2026-11-21-backtest-final-seven-recheck.md)、[现行合同](../specs/2026-11-20-backtest-practical-design.md) 与 [上一批独立证据](2026-11-22-backtest-semantic-generation-loop.md)。私有材料位于 `var/acceptance/backtest-practical-20261120`。

## 零调用复现与修复

上一批会话编写的覆盖枚举允许引用未写入定义的 `description`，正式校验拒绝。新增成对检查证实 `tradePlan` 有同样漏洞。修复前定向测试两处预期失败，30项原意检查通过，日志 `t13-v26-pairs-before.log`。带宽额外验证同一合取内不含等值和包含等值不能互换。固定保护继续分别核对首笔成交价、距离、开始保护和是否附送退出逻辑。

V6编写原生Schema将可选字段的存在状态与覆盖枚举关联，先输出定义，再输出覆盖和回读。经实际原生Schema验证，有字段才可引用，未引用的字段仍可省略。局部计划修改保留原冻结基线，以固定保护的即时与延迟成对示例说明同一个退出距离，不将含费用均价用作首笔成交价。普通执行按确认周期提供下一可交易根，分钟开盘不默认跨日。探索保留完整Schema和本次 `dataScope`，只发送一份能力表，示例展示同一合取内的等值边界。

Server定向45项通过，包含实际输出原生Schema、两种保护启用、分钟时钟与28份历史原始回执的零网络核对，报告 `v26-intent-recordings1.json`。Schemas三文件16项通过。首次Server类型错误来自测试未显式检查原生Schema缺失，已修复。Schemas旧保护回归把现用注册表误当V5，已改为校验历史V5注册表，未改V5合同。原失败日志保留。Domain／Schemas构建以及最终Server类型、lint、边界和尺寸检查通过。

七例零调用预检见 `v26-seven-preview1`。相对同样的上一批预检口径，代表探索系统消息减少1016字节，计划修改减少8027字节，普通编写因字段关联增加3415字节。预算继续按实际消息与原生Schema估算。通用用途引用与资格、原意断言和正式编译器保持。

## 目标运行态与固定输入

在 `thesis-ledger-infra` 目录以Node.js 24.22.2和工作区npm镜像执行 `./scripts/sync-code.sh thesis-ledger`，退出0，见 `t13-v26-sync-code.log`。宿主构建、兼容预检与Server／Worker健康检查通过。镜像ID、数据库结构及外部卷保持。本次是容器可写层代码更新。

在主仓执行 `node scripts/local-runtime/run-backtest-practical-readonly.mjs <t13-v26-target-before.json> thesis-ledger-dev-thesis-ledger-1 thesis-ledger-dev-backtest-worker-1`，退出0。每容器1435份编译JS与宿主一致，两个容器分别做两次冻结股票重放。运行检查使用v26／v34，目标运行态无NAV历史样本，原NAV隔离证据保持。

同批候选版本为 `strategy-optimization-v26-comparison-boundaries` 与 `authoring-prompt-v34-linked-coverage`，原意断言 `practical-seven-intent-v1`。执行前固定5244份输入，`v26-seven-final-source-before.json` 摘要 `9dd018eb0b3c7e28d71a9d2c523409ed359530b04bf632ff832b2a8c6e1df99e`。

## 真实复验

在infra目录用 `node scripts/infra.mjs locked --idle -- node <主仓>/scripts/local-runtime/run-backtest-trade-plan-acceptance.mjs <私有输出>/v26-seven-final1` 启动专属隔离库验收。场景 `backtest-practical-v6`，授权登记 `2026-11-22-user-approved-600-linked-coverage-seven`，七例单次上限7。沿用原模型、原生Schema与 `v6-qualification-cache1`，探针0、自动重试0。轮前累计48次，余额552。未知结果或路由、资格变化时停止。

隔离入口退出1，七份HTTP响应全部完成。原生响应7／7，正式编译5／7，独立原意、隔离创建及两次冻结执行4／7。再核对原始说明后业务完整通过为3／7。

| 样本 | 本轮结果 |
| --- | --- |
| 计数确认 | 入场计数和连续条件正确。模型用收盘价等于零代替恒假常量比较，正式编译拒绝。 |
| 带宽与跳空 | 原文的≤与<均保持。模型用绝对价格差比较百分比阈值，正式编译拒绝。 |
| 冻结前高 | 捕获、引用、确认、失效及重复启动正确，但触发和捕获使用含当根的最高价，独立原意检查拒绝。 |
| 多周期累计 | 原意、说明、隔离创建和冻结执行通过。 |
| 会话VWAP | 引用均有对应字段；分钟会话累计均价、偏离比率和下一可交易开盘回读一致。 |
| 仅后复权探索 | 原意、说明、隔离创建和冻结执行通过。 |
| 仅加止损 | 即时保护与首笔成交价锚点正确，基线保持。原始说明用“跌破”，实际为达到或低于止损线，等值说明未通过。 |

核对全部7份实际发送的提示版本、合同时点与请求模型，结果见 `version-route-review.json` 和 `business-review.json`。前后5244份文件及摘要一致，后置清单为 `v26-seven-final-source-after.json`。调用累计55／600，余额545，探针0、重试0、未知0。原始响应、错误和技术结论保留。
