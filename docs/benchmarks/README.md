# 固定基准集

`apps/server/test/fixtures/benchmark-manifest.json` 固定 Screenshot、Chip、Backtest、Risk 四类回归样本。每次修改算法或契约时，先运行 `pnpm benchmarks:check`，再运行对应 workspace 的回归测试；新增或修改样本必须提升 `schemaVersion` 或在变更记录中说明原因。

基准集只保存脱敏输入和期望结果，不包含 Provider Secret、真实账户标识或外部服务响应。报告应同时记录代码版本、fixture 版本、Provider/引擎版本和结果差异，避免把单次人工结果当成稳定基线。
