# R02.14 TickFlow CN 指数报价合同

日期：2026-09-28。范围：收紧既有 `TickFlowFetcher.get_main_indices` 的指数身份、provider timestamp 和单位语义；不调用真实 TickFlow，不验证 Key/套餐/权限。

## 当前实现输入

当前安装包：`tickflow 0.1.25`。既有 Consumer 为 `DataFetcherManager.get_main_indices(region='cn') → MarketAnalyzer`；固定 6 个 CN 主指数 symbol：上证、深成、创业板、科创50、上证50、沪深300。

既有代码按最多 5 个 symbol 分批调用 `client.quotes.get(symbols=...)`，然后映射到统一指数结果。本轮不改变指数列表、请求批大小和数值字段。

## 收紧合同

每个目标指数：
- 只接受当前请求批次内返回的 symbol；SDK 返回额外行不跨批消费；
- 同一目标 symbol 重复返回时整体拒绝，不以字典最后一行覆盖；
- 必须存在可由既有 `_format_provider_timestamp` 解析的 provider timestamp，缺失拒绝，不用本机抓取时刻替代；
- 返回 `source=tickflow:quotes.get:index` 与逐行 `as_of`；
- `current/open/high/low/prev_close/change` 的单位明确为 `index_point`；
- `change_pct` 单位为 `percent`；
- `volume_unit=unknown`、`amount_unit=unknown`，保留原数值但不借股票 quote 的份/元合同外推指数单位；
- `historical_visibility_verified=false`，当前 quote 时间不等于历史修订/发布资格。

## 红绿与回归

新增三类合同后首次定向 **3 failed / 0 passed**：缺 source/unit/as_of、重复 target symbol 静默覆盖、缺 timestamp 仍接受。

首次修复后专属出现 1 个测试夹具问题：旧 fake 每个 5+1 批次都返回全部 6 行，因此新重复校验正确拒绝。没有放宽重复门禁，而是进一步收紧生产边界：每个 batch 只消费本批请求的 symbol，忽略 SDK 意外返回的额外行；同一批内重复目标仍拒绝。随后 **3 passed**。

`test_tickflow_fetcher.py`、`test_market_structure_service.py`、`test_market_strategy.py` 合计 **60 passed / 0 failed**。修改文件 critical flake8、`py_compile`、`git diff --check` 均通过。

## 保留门禁

本叶只完成 R02.14 本地适配合同。真实 TickFlow Key/套餐权限、六指数实际覆盖、provider timestamp 源端语义、量额单位、延迟/交易阶段、目标运行与 G0-M 仍未验证；因此不宣称该指数源在线，也不将其结果用于严格历史事实。
