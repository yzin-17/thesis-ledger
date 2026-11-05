# 行情图表后续任务

对应[规格](../../specs/2026-11-04-market-chart-followups.md)及[父任务](2026-11-04-todo-4-15-delivery.md)。状态：已完成，2026-11-05复核归档。

| 执行叶 | 输入与写入责任 | 状态／完成条件 |
| --- | --- | --- |
| C06-A 请求和Server | schemas锚点合同、API Client规划、MarketController／原生及派生读取 | 已完成；锚点合同、Server受控HTTP及API Client18项通过，目标产物摘要一致 |
| C06-B Desktop扩窗 | MarketDetailDialog及最新／分段重试QueryKey和代次 | 已完成；扩窗、分段重试与最新检查回归及实际浏览器拖动固定锚点通过 |
| C04-A 聚合与合同 | Domain分钟桶、市场时钟、schemas展示合同 | 已完成；Domain聚合／时钟／日历、合同和指纹回归通过 |
| C04-B 日历与Server | 已核验港美日历→Session，现有1m整窗reader→聚合→分段详情 | 已完成；整窗读取、完整性／预算／时段／预热及来源绑定通过 |
| C04-C provided-points | schemas／DSA指标周期声明与现有计算器 | 已完成；DSA定向及独立HTTP四周期通过，当前目标与主仓合同消费通过 |
| C04-D Desktop | 周期选择、复权、分钟时间轴与来源披露 | 已完成；分钟能力就绪控制35项、Desktop构建及浏览器通过 |
| C04-R 目标实源 | 现有富途配置和接受样本 | 已完成；13份bars及4份MACD实源通过，富途19/20；Yahoo6/8，5条路由均恢复至187 |
| C05-Q 盘中来源 | refresh规格、整窗selector和当前来源当日字段／时间语义 | 已完成；AAPL／SPY各两次盘中与实际收盘后complete，浏览器使用原始快照验证 |

本轮逐级完成定向、包／边界、正式运行态与浏览器。交易叠加由[独立子任务](2026-11-04-market-trading-overlays.md)持有，详细结果见[最终验收](../../tasks/evidence/2026-11-05-todo-4-15-final-acceptance.md)。

## 目标运行时恢复前沿

2026-11-04已由infra/scripts/sync-code.sh all完成纯代码同步，Server／DSA／Worker曾就绪，三项新增Server编译产物与宿主SHA一致；镜像未更新。随后DSA在ARM64 MiniRacer原生库以SIGTRAP退出（133、非OOM）。匹配上游并发复现，修复与正式恢复由[DSA独立任务](../../../../daily-stock-analysis/docs/archive/tasks/2026-11-05-miniracer-runtime-serialization.md)持有；通过正式sync-code.sh dsa恢复后，目标Linux ARM64的24个真实JS上下文并发回归通过，Control与行情读取恢复。此处复用该证据，不重复构建镜像。

## 实源当前读数与接续

修订185临时补齐授权的5条路由。Yahoo AAPL／STOCK及SPY／ETF各取得两次真实当日qfq日线，间隔228.087／228.171秒，均为incomplete；两类close与volume均更新。原计划北京时间11-05 05:05的观察进程在会话中断后退出，没有该时刻的观测证据。11-05 12:55实际补做同一交易日的收盘后读取，两类均为complete；保守占用6/8，6个成功整窗。Yahoo临时路由于修订186恢复，不改写原计划时间为实际时间。

富途首次503的连接超时事实保留。用户11-05确认OpenD已恢复后，容器TCP可达，沿原配置继续：取得13份真实bars响应，覆盖00700.HK／02800.HK／AAPL.US／SPY.US的15m／30m／60m及00700.HK的5m；四个标的5m MACD均各返回20个有值点，计算输入各自保留预热范围及指纹。5m指标由同一次真实1m整窗先聚合再计算，不额外重复同标bars读取。另一次detail请求因目标目录缺少证券身份而在校验处400，未计为行情成功；仍保守占用次数。

累计富途19/20，其中13份bars和4份指标成功，另2次失败／拒绝保留。全部19份真实bars（含6份Yahoo）与4份指标响应均通过当前TypeScript共享合同解析。四条富途临时路由于修订187恢复，applied、effectiveStale=false，其余路由保持当前值；五条临时路由均已恢复。原件、计数、时序检查与CAS恢复证明位于本轮recovery；详细汇总见[实源证据](../../tasks/evidence/2026-11-05-chart-real-source-acceptance.md)。浏览器和本图表范围的最终门禁已通过，父任务全部结果按独立验收表对账。
