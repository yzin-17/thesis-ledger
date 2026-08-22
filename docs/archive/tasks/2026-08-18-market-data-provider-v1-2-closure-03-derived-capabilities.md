# 03 — 收口 Indicator 与 CHIP_SUMMARY 的 Provider 路由

**要构建的能力：** Indicator 和 `CHIP_SUMMARY` 不再绕过 ThesisLedger consumer 的控制面。Indicator 从已路由的 `DAILY_BAR` 序列派生；`CHIP_SUMMARY` 作为显式 Capability 进入 manifest、Desired/Effective Policy route matrix 和 Provider runtime，同时继续兼容 Data Contract V1 的 chip 摘要 wire。

**阻塞于：** 01 — 兼容扩展统一数据网关。

**状态：** completed

- [x] Indicator 的输入数据来自统一网关，并保留实际 Provider provenance。
- [x] Indicator 不会再次触发原生 Provider manager 的隐藏数据请求。
- [x] `CHIP_SUMMARY` 的 `STOCK` 支持边界在 Provider manifest、Desired/Effective Policy、Contract 响应和运行时行为中保持一致；当前仅声明 `akshare`，未声明组合原子拒绝。
- [x] `CHIP_SUMMARY` 按摘要整体选择 Provider，返回实际 provider/fallback metadata，不伪造 buckets/mainPeak 或字段级混源。
- [x] Provider 禁用、fallback、circuit-open 和 unsupported 反例均有端到端回归测试。
- [x] 旧 `/market/chip` Data Contract V1 形状保持兼容，MA/MACD/RSI 仍仅允许 `1d` Bar 输入。

## 验证证据

- DSA 定向回归独立核验：46 passed；覆盖 manifest/Policy 原子拒绝、runtime fallback、禁用/circuit-open 不调用、Indicator/Chip facade provenance 和 request correlation。
- DSA `py_compile`、ThesisLedger Python stub `py_compile`、两仓 `git diff --check` 通过。
- ThesisLedger schemas 32 passed；Server 87 passed；Desktop 15 passed；schemas/server/desktop TypeScript typecheck 通过。
- 未执行 Docker、在线 Provider 和浏览器视觉验收；这些不属于本 Ticket 的确定性验收，仍需主代理在最终 Review 中确认。
