# R05.5 / R05.6 Yahoo US 当前估值合同

日期：2026-09-28。范围：只选择并实现 yfinance `.info` 的 US 股票 PE/PB 当前估值字段组，复用现有 `get_fundamental_context` Consumer；不请求真实 Yahoo、不授予 G0-R 或历史 PIT。

## 选择与语义

R05.5 选择市场为 **US STOCK**，字段组只包含：
- `trailingPE` → `pe_ratio`
- `priceToBook` → `pb_ratio`

两者单位固定为倍数（`ratio_unit=multiple`），不携带货币。`marketCap` 虽可能在 `.info/fast_info` 出现，但本叶没有冻结其单位/币种/时点合同，因此明确不进入 valuation block。

当前观察保留：
- `period_basis=current_info_period_unknown`
- `observed_at=<UTC 抓取观察时刻>`
- `source_available_at=null`
- `historical_visibility_verified=false`
- source chain 为 `valuation:yfinance.info`

因此本值只能用于当前研究展示，不能作为历史时点可见的估值事实。
