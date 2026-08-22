# 10 — 收敛 efinance 在线验收结论

**要构建的能力：** 在受控环境中执行 efinance 各声明 Capability 的在线 smoke，形成能够区分实现缺陷、本地网络问题和外部上游不稳定性的发布结论。

**状态：** completed

- [x] REALTIME_QUOTE、DAILY_BAR、FUND_NAV 和 FUND_NAV_HISTORY 的 efinance 专属当前版本复测均形成响应形状与 provenance 记录。
- [x] `DAILY_BAR` 在开启 `ENABLE_EASTMONEY_PATCH=true` 后恢复成功；不需要 API key 或登录 Cookie。
- [x] 在线结果未被 fixture、隐藏 fallback 或其他 Provider 的成功结果掩盖；四项均返回 `provider=efinance`、`fallbackUsed=false`。
- [x] 发布文档已明确 patch 开关、可选的 write-only `EFINANCE_EASTMONEY_COOKIE` 和失败时的可观测降级行为。

## 当前验证边界

- 2026-08-19，使用当前工作区构建的 DSA/ThesisLedger 容器均为 `healthy`；DSA 的 `THESIS_LEDGER_FIXTURE_MODE=false`，`ENABLE_EASTMONEY_PATCH=true`，未提供 Cookie；`/api/health` 与 `/api/v1/health` 均返回 HTTP 200。
- 当前宿主 `.venv` 缺少 `efinance` 和 `akshare`，因此不能把本地 import 或 pytest 结果冒充在线验收。
- 当前真实 Data Contract API smoke 结果为：`REALTIME_QUOTE` 200、`DAILY_BAR` 200、`FUND_NAV` 200、`FUND_NAV_HISTORY` 200、`INDICATOR` 200；`CHIP_SUMMARY` 因 AKShare 上游远端关闭连接返回 503。主路由的成功/失败 provenance 与 efinance 专属结果分开记录。
- 直接 efinance 日线探测在 patch 开启后返回 151 行；此前相同上游路径在 patch 关闭时为 `RemoteDisconnected`。
- 临时 efinance-only Policy revision 10 下，四项 Contract API 均成功：Quote、Fund NAV、Fund NAV history 各返回有效结构，Bars 返回 5 行；四项均为 `provider=efinance`、`fallbackUsed=false`。随后通过 rollback 10→9 恢复完整策略并生成当前 revision 11。
- 本轮修复了 efinance adapter 的 `FUND_NAV_HISTORY` 日期升序归一化和有界调用，并新增 Cookie 注入与 NID 合并；DSA efinance/patch/logging 定向回归 15 项通过，既有 DSA 定向回归 65 项通过。
- `EFINANCE_EASTMONEY_COOKIE` 仅作为后续上游再次要求登录态时的 write-only 备用入口，本轮不需要真实 Cookie；部署环境需显式设置 `ENABLE_EASTMONEY_PATCH=true` 才能保持本次 patch 行为。
