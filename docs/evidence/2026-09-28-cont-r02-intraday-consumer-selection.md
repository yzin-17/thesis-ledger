# R02.15 / R02.16 分钟线 Consumer 选择结论

日期：2026-09-28。范围：只读核对现有分钟线 Consumer 与 Provider；不新增分钟回测、SDK 或平行数据入口。

现有 ThesisLedger V2 Contract 确实定义 `MINUTE_BAR/1m`，fixture 模式有确定性分钟 Bar；但生产 `/v2/market/bars?timeframe=1m` 在非 fixture 下明确返回 `upstream_unavailable`，文案为“Provider 当前没有可用的 1m Bar 数据”。非 fixture capability 同样将 1m 标为 unavailable，不存在“声明可用但执行必失败”的生产错配。

来源核对：
- TickFlow 当前 Fetcher 没有生产 intraday/minute 方法；测试 fake 中存在 `klines.intraday` 不能当作实现。
- Pytdx 当前实现只有 5m/15m/30m/60m 等类别，不满足现有 1m Consumer。
- 官方 TdxAiData 分钟能力是独立 R02.25/R02.26，SDK/授权/系统依赖尚未完成，不能借用。
- 现有 5m/15m/30m/60m Contract 项标为 Server 从冻结 1m 派生；在基础 1m 不可用时也不能反向选择为 Provider。

因此 R02.15 当前选择结果为 **blocked**：已有 Consumer 固定为 ThesisLedger 1m Bar，但没有符合合同的已实现单一 Provider。R02.16 不实施，不通过测试桩或 5m Provider 补造 1m。

这不取消 M3 分钟线承诺；未来若 R02.25/26 或其他明确来源提供真实 1m，须先固定 endpoint、资产、1m 周期、none/复权语义、单位和现有 Consumer，再单独实现/准入。M1 日线引擎范围不因本结论扩大。
