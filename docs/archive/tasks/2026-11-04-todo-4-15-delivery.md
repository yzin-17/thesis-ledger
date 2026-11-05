# 第4至15项延期任务交付

对应[总体规格](../../specs/2026-11-04-todo-4-15-delivery.md)。状态：已完成，2026-11-05复核后归档。用户确认的现有中港美股票／ETF和当前券商有界扩展、其余11项均已逐项验收；原TODO第1～3项保持延期。

## 共享基线

本轮开始三仓HEAD为 `da002744bd317b7754832c6ac41d169bcf005e27`／`dd26571509e842ab230c393f5f339911ea98425d`／`3f661df1deb3de894755dcc66e584abb4165d014`，暂存区均空；4710／8862／230个已有文件摘要及原TODO快照位于 `.recovery-artifacts/todo-4-15-delivery-20261104/`。复用当前checkout，不覆盖投资组合账户筛选及其他并发修改。起点尚未发来源或模型请求；后续实际来源、预算、部署与结果由下列各叶及证据持有，不把起点记录当成当前调用数。


## 独立完成责任

| 编号／组 | 唯一实施责任 | 最终状态 |
| --- | --- | --- |
| <a id="market-chart-minute-period"></a>4／分钟周期 | [分钟周期子任务](2026-11-04-market-chart-followups.md) | 已完成：聚合、日历、指标、17个富途成功实源响应与页面通过 |
| <a id="market-chart-intraday-daily-bar"></a>5／盘中日线 | [盘中日线子任务](2026-11-04-market-chart-followups.md) | 已完成：股票／ETF各两次盘中与实际收盘后读取、页面通过 |
| <a id="market-detail-pagination-anchor"></a>6／历史锚点 | [历史锚点子任务](2026-11-04-market-chart-followups.md) | 已完成：HTTP／客户端与浏览器90→180固定锚点通过 |
| <a id="market-chart-trading-overlays"></a>7／交易叠加 | [交易叠加子任务](2026-11-04-market-trading-overlays.md) | 已完成：真实只读账本及图表标记、参考线、测量、切换清理通过 |
| <a id="backtest-market-rules-expansion"></a>8／规则费用扩展 | [规则费用扩展子任务](2026-11-05-etf-public-fee-slices.md) | 已完成：三个ETF切片、执行冻结及目标精确能力读取通过 |
| <a id="market-batch-catalog"></a>9／显式批量行情 | [显式批量行情子任务](2026-11-04-batch-quotes-valuation.md) | 已完成：明确集合、去重、逐证券失败与真实DB消费者通过 |
| <a id="portfolio-valuation-followups"></a>10／组合性能 | [组合性能子任务](2026-11-04-batch-quotes-valuation.md) | 已完成：真实DB基线、批量去重与金额／缺价／查询语义回归通过 |
| <a id="ai-provider-probe-route-parameters"></a>11／用途探针参数 | [用途探针参数子任务](2026-11-04-ai-generation-contract-hardening.md) | 已完成：SDK参数／指纹、编辑往返及保存配置的LM Studio真实测试通过 |
| <a id="ai-generation-contract-semantic-refinements"></a>12／生成语义约束 | [生成语义约束子任务](2026-11-04-ai-generation-contract-hardening.md) | 已完成：正值／比例等价正则与跨字段反例、共享包通过 |
| <a id="ai-provider-json-text-error-classification"></a>13／空JSON分类 | [空JSON分类子任务](2026-11-04-ai-generation-contract-hardening.md) | 已完成：validation／schema_invalid及完成、用量和费用事实回归通过 |
| <a id="ai-provider-json-validated-prompt-guard"></a>14／字段提示守卫 | [字段提示守卫子任务](2026-11-04-ai-generation-contract-hardening.md) | 已完成：统一提示及预算前／SDK边界缺失、过期零派发通过 |
| <a id="historical-rule-update-monitoring"></a>15／规则更新监测 | [规则更新监测子任务](2026-11-05-rule-source-monitoring.md) | 已完成：真实手动检查、版本、跨重启持久化及页面通过；定期关闭 |

## 最终一致性复核

AC04～AC15、各子任务与DSA前置均完成。命令、输入、运行态、浏览器、来源次数及数据保护由[最终验收](../../evidence/2026-11-05-todo-4-15-final-acceptance.md)和[单一最终复核](../reviews/2026-11-05-todo-4-15-delivery-review.md)持有；[使用说明](../../guides/market-chart-and-rule-monitor.md)描述当前产品行为。

富途19/20、Yahoo6/8及失败事实保留，5条临时路由恢复至187；当前真实ETF报价准入不足按单证券失败保留。规则监测配置保持关闭，LM Studio本次保存配置的用途测试通过，未增加付费模型或通知。8张金融表摘要一致，三仓HEAD与暂存不变；其他任务的并发修改保留。正式快更不作为生产镜像或CI证明。

完成的父／子任务移动正文至归档，当前任务目录不保留跳转壳；旧TODO义务直接追溯本表稳定标识。
