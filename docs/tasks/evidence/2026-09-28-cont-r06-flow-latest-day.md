# R06.12 个股资金流最新日选行本地证据

## 范围与来源

本叶只处理 DSA `AkshareFundamentalAdapter.get_capital_flow()` 读取安装版 AKShare 1.18.94 `stock_individual_fund_flow` 转换表。安装版源码请求 EastMoney `push2his.eastmoney.com/api/qt/stock/fflow/daykline/get`，转换后有 `日期`、`主力净流入-净额`、`主力净流入-净占比` 等每日列，未提供 5/10 日累计列。AKShare [官方个股资金流接口文档](https://akshare.akfamily.xyz/data/stock/stock.html)列出每日样本及净额/净占比的区分；其净额单位未被本轮证明。本轮没有新增真实来源请求，不能由 SDK 函数名推定原响应证券身份。

## 实施与反例

- DSA 新 `data_provider/eastmoney_individual_fund_flow_rows.py` 逐行核验有效且不重复的日期，按最大日期选原行，只接受最新日有限的 `主力净流入-净额`；列缺失或重复、任何坏日期、最新日金额无效都拒绝整块股票流。保留交易日，`source_available_at` 为未知，金额单位显式为未知。
- `fundamental_adapter.py` 股票接缝使用该读取器，拒绝时追加 `capital_stock:invalid_daily_rows`；行业排名继续独立读取，未恢复其他股票 endpoint。
- 合成表覆盖乱序、比例列排在净额之前、重复/无效日期、SDK `NaT`、缺净额、最新日 `NaN`/浮点转换溢出、重复金额列和 5 日干扰列。5/10 日输出始终未知，不从每日值推算。两个既有请求作用域/研究 Consumer 测试的成功 fixture 补上安装版存在的日期列。

## 验证及边界

- 新测试修前出现 7 处失败，证实首行/模糊字段行为；修后 7 项定向通过。
- 扩展相邻首次为 2 个旧 fixture 子测试失败，原因是旧成功表缺 `日期`；仅补该 fixture，唯一重跑 `44 passed`。补 SDK `NaT` 边界后同一 44 项仍通过。
- 极大整数反例首次在 pandas 默认建表时溢出；仅一次将该测试列改为 `object` 后准确暴露读取器溢出，再把转换异常归一为无效金额，完整相邻仍为 `44 passed`。该夹具重试不是来源请求或官方全包重试。
- 新 helper 与相关测试完整 `flake8` 通过；旧适配器关键 `E9,F63,F7,F82`、`py_compile`、`git diff --check` 通过。旧大文件本轮 715→711 行。
- 未执行真实来源、目标容器、官方已失败的 DSA 全包、历史 PIT 或消费者浏览器验收。日期是交易日，不是发布/可见时刻；金额单位、净额算法、原响应完整证券身份和修订仍不明。R06.12 完整数值合同、G0-M/P02、R06.13/14 的新接口选择与整体验收保持开放。
