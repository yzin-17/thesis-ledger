# 全产品具名 V1 合同与存量转换

执行见[实施任务](../tasks/2026-11-24-named-v1-cutover.md)。范围包括 ThesisLedger、DSA 和 infra 的现行自有合同。各合同以 `<领域>-<对象>[-<用途>]-v1` 表达身份，并采用该领域现行的最新结构。策略业务版本、应用发版号、经济事实和审计原文按原义解释。

## 合同与验收

| 编号 | 交付 | 完成条件 |
| --- | --- | --- |
| AC1 | 市场与部署联通 | DSA Data 和 Control 位于 `/api/v1`，分别声明 `dsa-data-v1` 和 `dsa-control-v1`。日级观察使用 `market-daily-tradability-window-v1`，研报元数据使用 `market-external-report-metadata-v1`。TS、Python、部署清单和握手相符。旧路由和旧版本协商退役。 |
| AC2 | 账本与组合 | 账本事件信封、业务负载、组合估值快照和导出文件使用各自 V1。信封版本列追加结构迁移，原始事件、金额、修订链和追加写保护逐项对账。独立导出标记 `thesis-ledger-data-export-v1`。 |
| AC3 | 策略和回测 | `strategy-definition-v1` 采用现行 Schema 3 定义。创作、修改和发现分别采用 `strategy-authoring-generation-v1`、`strategy-authoring-modification-v1`、`strategy-discovery-generation-v1`。发现消息按[交易计划规格](2026-11-15-backtest-trade-plans.md)中对应模式的固定样本上限验收。交易与净值回测的作业、结果和快照独立校验。交易快照用 `backtest-trade-snapshot-manifest-v1`，净值快照用 `backtest-nav-snapshot-manifest-v1`。 |
| AC4 | 研究、复盘与 Arena | 冻结输入、生成和结果分别使用 `research-frozen-input-v1`、`research-report-generation-v1`、`research-report-result-v1`。对象与周期复盘使用各自合同。日频模拟、实时比赛及实时研究分别用 `arena-historical-match-protocol-v1`、`arena-live-match-protocol-v1`、`arena-live-research-v1`。桌面与移动端使用现行入口及业务全名。模型用途按原参数绑定到对应合同，过时的就绪证据按当前验证规则处理。 |
| AC5 | 无损转换 | 按原写入结构、来源和引用识别每个对象。允许等价映射以及重建格式相关的摘要和引用。保留原业务事实、结果、金额和 ID。无法证明等价的旧对象及其独占派生数据按审阅清单清除。共享制品由实际引用保护。Arena 历史与暂停待办按 ID 对账。 |
| AC6 | 切换与恢复 | 隔离副本完整演练和恢复后，由 infra 正式 `update.sh all` 执行获准的目标切换。在消费者停止期间对账、备份和迁移 PostgreSQL、SQLite、相关 Redis 队列及文件制品。验证新合同及原暂停状态后开放写入。失效计划或部分写入失败走整批恢复。 |

已知上下文内沿用 `schemaVersion`、`envelopeVersion`、`contractVersion` 等字段的既有类型。独立 JSON 通过完整标识定位合同。错误诊断给出相应合同全名。历史的同名 `v1` 由显式维护程序根据原结构解释。移除常规请求中的旧解析、别名与自动回退。

## 数据边界

旧策略的运行时绑定价格坐标保留 `run`。快照和源证据须能证明与原运行配置一致。后台任务保持尝试次数、预约和暂停状态。模型输出或回测结果未能满足等价条件时按 AC5 处理。账本等现行业务事实的对账失败、I/O 失败和现行对象的外部引用冲突使本次切换停止。待处理对象按有向引用关系审阅，并在切换前核对目标是否偏离预览。

目标数量取自切换时的只读清单。现有工作树中的其他业务改动和既有验收证据作为基线保留。

## 历史行情路由回滚

含退役聚合状态能力的历史策略修订以整版为转换单位。按当前目录中同一市场、资产、Provider 和上游的独立状态能力展开，继承启停及适用来源的主备顺序。已经明确配置的独立能力保留原选择。已核实的旧来源入口合并可映射到现行精确目标，完整策略须通过现行保存校验。

能完整映射的修订保留编号，并更新用于回滚的路由。无法完整映射的修订在私有备份后从产品回滚历史删除。已生效策略和 DSA 用于推导缓存代次的已应用历史按原事实保留。维护入口对真实清单先预览和回滚演练，提交后核对影响范围及候选回滚配置。
