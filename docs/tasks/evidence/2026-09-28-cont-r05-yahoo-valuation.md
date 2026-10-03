# R05.5 / R05.6 Yahoo 美股估值最小合同

日期：2026-09-28。范围：只为现有 `get_fundamental_context` 选择并接入一个 Yahoo/yfinance US STOCK 估值字段组；不扩展到 HK/JP/KR/TW，不声称历史 PIT 或真实来源准入。

## 选择合同

唯一市场：US STOCK。

唯一字段组：
- `trailingPE` → `pe_ratio`
- `priceToBook` → `pb_ratio`

两者都是无量纲倍数，输出 `ratio_unit=multiple`。本叶**不**纳入 `marketCap`，因此不把交易币种附到该估值块；`currency=None` 是明确合同，不是缺失补零。

Yahoo `.info` 没有提供本叶可验证的发布/修订时刻，所以：
- `observed_at` 仅是本系统实际读取完成时刻；
- `source_available_at=None`；
- `historical_visibility_verified=false`；
- `period_basis=current_info_period_unknown`；
- 不得把当前值回填历史或用于严格 PIT。

当前安装 yfinance 1.7.0 静态源码确认 `Ticker.get_info()` 的核心 quoteSummary 入口为 `https://query2.finance.yahoo.com/v10/finance/quoteSummary/{symbol}`，模块包含 `financialData/quoteType/defaultKeyStatistics/assetProfile/summaryDetail`。静态源码不等于真实网络成功、许可或时点准入。

## 实现

`YfinanceFundamentalAdapter` 新增显式 `valuation` bundle，仅在项目统一 `is_us_stock_code` 判断为 US STOCK 时生成。`AAPL.US` 先去掉显式 `.US` 再按同一 US 身份规则判断；HK 不继承。PE/PB 非有限值不生成估值块。

`DataFetcherManager` 原离岸 valuation 来自可能被多来源补字段的 realtime quote，无法证明 PE/PB 一定属于 Yahoo。本轮在 `market=us` 且 yfinance bundle 提供 PE/PB 时，用该 bundle valuation 覆盖通用 quote valuation，并将 source chain 固定为 `yfinance.info`。两项齐全为 `ok`，仅一项为 `partial`；其他市场和 bundle 无估值时保持原逻辑。

## 红绿与验证

Adapter 既有/并行红例最初证明：US valuation 未生成、HK 无显式空块；另覆盖 `.US` 后缀与非有限值。修后 valuation 相关 **4 passed**。

消费层新增红例让 quote 持有 PE/PB `32.5/58.2`、yfinance bundle 持有 `25.5/8.25`；修前实际返回 quote 的 `32.5`，修后返回 bundle `25.5/8.25`，并保留 `source_available_at=None` 与 `historical_visibility_verified=false`。

完整 `test_yfinance_fundamental_adapter.py` + `test_fundamental_context.py`：**38 passed / 0 failed**。改动文件 critical flake8、`py_compile`、`git diff --check` 均通过。

## 保留门禁

本叶关闭本地 R05.5 选择与 R05.6 Consumer 接线，不执行 Yahoo 真实请求；真实响应身份、连续可用性、条款/许可、来源发布时间/修订、目标运行与 G0-R 仍开放。该 current observation 不进入严格历史回测。

## 收尾复核

用户要求收尾当前执行后，不再开启后继叶。以当前合并输入重新运行 `test_yfinance_fundamental_adapter.py`、`test_yfinance_financial_period.py`、`test_fundamental_context.py`，结果 **48 passed / 0 failed**；随后相关改动文件 critical flake8、`py_compile` 与 `git diff --check` 均退出 0。该复核不改变真实 Yahoo/G0-R/目标运行仍开放的边界。
