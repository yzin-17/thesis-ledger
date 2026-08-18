# 09 — 完成 Mobile 原生联网与只读边界验收

**要构建的能力：** Mobile 在实际原生运行环境中能够读取 ThesisLedger API 的投资组合和风险信息，同时保持纯只读客户端，不暴露市场数据控制面写操作或 Control Token。

**阻塞于：** 当前机器没有可用的 Android 原生目标，CoreSimulatorService 也拒绝连接；需要外部设备或恢复的 iOS Simulator 服务。

**状态：** partial-native-runtime-blocked

- [ ] 原生 Mobile 能在实际网络配置下读取 actual 与 shadow 数据及错误状态。
- [x] 应用源码、运行配置和网络请求中均未发现 DSA Control Token。
- [x] Mobile 不提供 Provider 配置、Policy Apply、目录同步或凭证写入入口。
- [ ] 浅色、深色、空数据、stale 和错误状态完成原生人工视觉验收并保留外部证据。

## 已执行验证

- `pnpm --filter @thesis-ledger/mobile typecheck`：通过。
- `pnpm --filter @thesis-ledger/mobile test`：6 passed；覆盖 actual/shadow、空数据、stale、error、刷新竞态和 API base URL。
- `rg` 扫描 `apps/mobile` 源码及运行配置：未发现 `THESIS_LEDGER_CONTROL_TOKEN`、`Control Token`、Provider 配置、Policy Apply、目录同步或凭证写入入口；Mobile 只请求 ThesisLedger portfolio/risk API。
- 当前 Android SDK 内 `adb devices -l` 返回空设备列表；`xcrun simctl list devices available` 因 `CoreSimulatorService connection refused` 失败。无法执行原生联网与原生视觉验收。既有 Mobile Web 证据不替代本票的原生证据，故保留未完成状态。
