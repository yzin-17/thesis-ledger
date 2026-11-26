# 回测比较回读与研究坐标七例复验

关联 [归档任务](../archive/tasks/2026-11-21-backtest-final-seven-recheck.md)、[现行合同](../specs/2026-11-20-backtest-practical-design.md) 与 [v27／v35原始失败](2026-11-22-backtest-scoped-expressions-recheck.md)。

## 零模型调用验证

同一组收盘与均线操作数分别放在逐根 `compare.gt` 和 `cross.above`，既有中文回读分别为“高于”与“上穿”。读取真实会话回执，模型原输出 `actual` 在仅有后复权分钟的冻结范围被拒绝；仅测试副本选择 `research` 时编译通过。网络次数为0，原始文件和内存原输出不变，原失败并未改判。

探索说明引用程序现有比较与交叉词汇，优先输出数学符号，强调连续比较逐根判断；原生 `reason` 字段补充对应注解。编写的正常生成及其来源坐标字段明确纯指标、会话累计和相对比例使用研究坐标，明确原价需求才用实际。只改说明及字段注解，未改变合法原生Schema分支、资格及正式策略读取。两包构建，Server定向50项、Domain回读5项、Schemas定向6项、Server类型、lint、边界及尺寸检查通过。七例预检调用0，七例原文及冻结数据范围与v27预检一致。

## 正式运行与复验计划

在infra以Node.js 24.22.2及工作区npm镜像执行 `./scripts/sync-code.sh thesis-ledger`，退出0，日志 `t13-v28-sync-code.log`。在主仓执行 `node scripts/local-runtime/run-backtest-practical-readonly.mjs <t13-v28-target-before.json> thesis-ledger-dev-thesis-ledger-1 thesis-ledger-dev-backtest-worker-1`，退出0。两容器的编译产物与宿主一致，旧冻结股票分别重放两次。本次为容器可写层更新，镜像保持。

前置清单为 `v28-seven-final-source-before.json`，5246份输入摘要 `f87ff1baaee7018d1d5afb02068fe73896d236aef6073709508023409ad55e01`。固定 `strategy-optimization-v28-comparison-readback`／`authoring-prompt-v36-research-coordinate`。主要私有材料位于 `var/acceptance/backtest-practical-20261120`。

在infra执行 `node scripts/infra.mjs locked --idle -- node <主仓>/scripts/local-runtime/run-backtest-trade-plan-acceptance.mjs <私有输出>/v28-seven-final1`。场景 `backtest-practical-v6`，七例各一次，上限7，沿用原模型、原生Schema及 `v6-qualification-cache1`，授权记录 `2026-11-22-user-approved-600-comparison-readback-seven`。本轮前累计62／600，余额538，新增探针0、自动重试0。未知结果或路由、资格变化时停止。

## 同版本实际结果

验收入口退出0，日志 `t13-v28-seven-final1.log`。全部七次均完整响应，正式编译、独立原意、隔离创建、两次冻结执行和原始说明逐例均通过，最终7／7。所有结果来自 `v28-seven-final1` 一批。

| 样本 | 核对结果 |
| --- | --- |
| 计数确认 | 最近5根至少3根收阳，连续3根收盘分别高于各自EMA20，普通退出恒假。原始说明准确区分比较与上穿。 |
| 带宽与跳空 | 保留总体标准差／均线、分位数和比例跳空公式。带宽含等值，跳空严格小于。 |
| 冻结前高 | 触发及捕获都排除当根，保留10根、非同根确认、失效和可重复启动。 |
| 多周期累计 | 日线与最新可见小时分别比较，小时无额外lag。锚点带时区，仅前一日累计使用日线lag。 |
| 会话VWAP | 使用已冻结的research一分钟来源，偏离公式、覆盖引用和下一可交易分钟开盘说明一致。 |
| 仅后复权探索 | 实际只使用后复权日线，保留严格入场和退出比较及比例仓位。 |
| 仅加止损 | 首笔成交价锚定，立即启用，收盘达到或低于止损线后在下一可交易开盘清仓。基线及入场政策保持。 |

执行后 `v28-seven-final-source-after.json` 与前置5246份文件清单完全相同。七份实际请求与记录消息一致，核对了模型回传身份、原生Schema和版本，见私有 `version-route-review.json` 与 `business-review.json`。本次继续工作共三个各七次的修复版本批次，累计69／600，余额531。各批均为0探针、0自动重试、0未知。先前失败保留在其独立证据中，最终通过仅使用本批七份新回执。

## 一致性复核

当前合同、最终测试、宿主编译与Server／Worker运行态一致，每服务独立核对1435份编译JS及两次冻结股票重放。交易规则由本批模型直接生成，业务验收只写专属隔离库。已通过全部最终七例门禁，任务归档。目标运行态的NAV历史样本仍为空，NAV保留此前隔离证据；外部时点数据、全市场历史证券池和组合／多腿执行仍按现行规格边界处理。
