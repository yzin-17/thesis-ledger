# 固定基准集

`apps/server/test/fixtures/benchmark-manifest.json` 固定 Screenshot、Chip、Backtest、Risk 四类回归样本。每次修改算法或契约时，先运行 `pnpm benchmarks:check`，再运行对应 workspace 的回归测试；新增或修改样本必须提升 `schemaVersion` 或在变更记录中说明原因。

基准集只保存**可重复执行**的脱敏输入、期望结果和必要性能基线，不包含 Provider Secret、真实账户标识或外部服务响应。报告应同时记录代码版本、fixture 版本、Provider/引擎版本和结果差异，避免把单次人工结果当成稳定基线。

一次性 closure、浏览器/设备运行记录、真实 Provider smoke 和历史来源审计属于 `docs/reviews/` 或 `docs/archive/reviews/`，不应长期放在 `benchmarks/`。已有历史文件在治理批次中逐步迁出；后续新增文件必须先确认它是否能由固定输入重复执行。
