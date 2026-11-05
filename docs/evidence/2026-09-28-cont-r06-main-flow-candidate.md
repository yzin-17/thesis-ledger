# R06.15–17 备用资金流候选失配证据

## 核对

DSA 当前安装版 AKShare 为 1.18.94，`stock_main_fund_flow` 在 `akshare/stock/stock_fund_em.py` 中存在，但函数只接受 `symbol` 市场类别（默认“全部股票”），请求 EastMoney `push2.eastmoney.com/api/qt/clist/get` 全市场排名。转换后的单行虽有六位 `代码`，输出仅为今日/5日/10日的主力**净占比**、排名、涨跌幅及价格/板块，没有单股主力净流入净额或交易日期。AKShare [官方文档的输入输出表](https://akshare.akfamily.xyz/data/stock/stock.html)对这些字段和百分比单位给出相同定义；此官方核对作为安装版源码发现后的独立复核。

`AkshareFundamentalAdapter.get_capital_flow()` 当前仅请求 `stock_individual_fund_flow(stock, market)`，并未调用 `stock_main_fund_flow`；既有离线作用域测试还断言不得发生该股票回退。能力目录旧文案把它写作“候选二并抽取净额”，与当前源码和 SDK 合同均不一致。

## 结论

R06.15–17 原提议的该接口不能满足最新日、5 日或 10 日**净额**能力，均按此候选 `unavailable` 记录并跳过接线；排名百分比不能填充 `main_net_inflow`、`inflow_5d` 或 `inflow_10d`。未来若要备用来源，需另选 endpoint 并独立核对原响应证券身份、金额单位、日期/可见时刻、覆盖与真实准入。本轮无真实请求、生产源码修改或 G0-M 准入证据。
