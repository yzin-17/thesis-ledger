# R04.1 基金持仓来源年份与披露边界

日期：2026-09-28。范围：完善现有 AKShare/EastMoney `fund_portfolio_hold_em` 持仓 Consumer 的年份回退证据，不新增 wire 字段、不请求真实来源、不授予 G0-M。

## 已有正确边界

现有持仓链已经验证：
- Provider 非空响应必须包含股票代码、名称、季度和占净值比例；
- 季度必须唯一可解析，API 只发布最新季度；
- 同季度代码重复拒绝，不合并权重；
- 权重按 Provider 的 0–100 百分数校验，API 再除以 100；同季度合计不得超过 100%；
- `disclosureDate` 在只有季度事实时保持 `null`，`fetchedAt` 单独记录抓取时刻，不拿抓取时刻伪造披露日。

当前安装版 AKShare 静态源码明确：`fund_portfolio_hold_em(symbol,date)` 的 `date` 是查询年份，源码文档指向 EastMoney `fundf10`；原 `占净值比例` 字符串去掉 `%` 后转换成数值。这与现有百分数→比例消费一致。未发网络请求。

## 本轮缺口与实现

原 Fetcher 直接按部署机 `datetime.now().year` 请求今年，空时请求去年；一旦返回 DataFrame，请求年份和来源观测时间就丢失，也没有验证非空响应中的季度确实属于请求年份。

新增纯 helper `data_provider/fund_holdings_source.py`：
- 上海时区决定“今年”；
- 只有空结果允许回退上一年；
- 非空响应先复用完整 holding row 校验，再要求所有季度年份等于请求年份；错年/坏行立即失败，不用下一次请求掩盖；
- 成功 DataFrame 的内部 `attrs` 保留 `sourceEndpoint=akshare/eastmoney:fund_portfolio_hold_em`、`sourceQueryYear`、UTC `sourceObservedAt`；共享 FundHoldingsV1 wire 不扩字段，API 仍由 `reportPeriod/disclosureDate/fetchedAt` 表达公开合同。

Fetcher 改为只调用该 helper，AKShare 请求次数和“今年空→去年”顺序不变。

## 红绿与验证

helper 的 6 个纯合同例先通过；Fetcher 集成红例修前 **1 failed / 6 passed**，失败点为回退 2025 后没有 `sourceQueryYear`。接线后完整范围：

- `test_fund_holdings_source.py`：7 项；
- `test_thesis_ledger_holding_rows.py`：19 项；
- `test_fund_holdings_disclosure_time.py`：1 项；
- Provider runtime 实际 FUND_HOLDINGS 路由：1 项；
- 合计 **28 passed / 0 failed**。

critical flake8、`py_compile`、`git diff --check` 均通过。`akshare_fetcher.py` 当前仍低于本批开始前的 2630 行基线，年份/来源职责放入独立 helper。

## 保留门禁

本叶证明本地来源年份、权重语义、报告期和抓取/披露时间不会互相冒充。仍未证明 EastMoney 对目标基金的真实权限、完整持仓覆盖、实际披露发布时间、历史修订或连续可用性；`sourceObservedAt` 是本次抓取观察，不是历史披露时刻。R04.1 的真实 G0-M/G-M3 保留开放。
