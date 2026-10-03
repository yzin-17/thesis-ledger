# R06.19 指定行业成员资金流 Consumer 核对

## 现有消费

第一次按 `stock_sector_fund_flow_summary`、`get_capital_flow_context` 和行业资金流检索 DSA：`data_provider/fundamental_adapter.py` 现只取 `stock_sector_fund_flow_rank(indicator="今日", sector_type="行业资金流")` 生成跨行业 top/bottom；`data_provider/base.py::get_capital_flow_context(stock_code, budget_seconds)` 把单股资金流与跨行业排名组装成当前研究块。`src/agent/tools/data_tools.py::_handle_get_capital_flow(stock_code)` 同样只接股票代码，并展示单股和排名前三；`src/core/pipeline.py` 等研究入口通过相同股票上下文消费。

第二次逐调用签名复核：这些入口均没有行业标识、行业分类体系、行业成员集合或指定行业的消费者输出字段。主仓 `apps/server/src`、`apps/desktop/src` 与 `packages` 未找到该 SDK 接口或行业资金流消费。该检查只说明当前代码没有可复用的明确 Consumer，不证明未来无需此能力。

## 停止条件

安装版 AKShare 的 `stock_sector_fund_flow_summary` 是给定行业的**成员股票**表，默认参数“电源设备”只是 SDK 默认值，不能从当前任意股票代码或跨行业榜单自动推定目标行业。若要 R06.19 接线，需先确定行业标识/分类版本、股票到行业的成员归属与生效日期、所需当日或历史金额口径、明确使用这一表的研究/回测 Consumer。当前这些契约均不存在；不调用默认行业，不把个股名发布成行业名，不把今日快照放进历史回测。

按本轮初次检索和逐签名复核两次相同结论，R06.19 的当前接线记 blocked 并跳过。无生产代码、测试、真实 Provider 或目标部署改动；P02、G0-M 与真实来源时间/金额单位仍开放。
