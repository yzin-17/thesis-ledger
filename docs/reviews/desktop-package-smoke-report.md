# Desktop 安装包烟测报告

## 执行环境

- 日期：2026-08-01
- 产物：`apps/desktop/release/Investment OS-0.1.0-arm64.dmg`
- 安装方式：只读挂载 DMG，直接启动 `Investment OS.app`
- Electron 本地页面：`127.0.0.1:64131/`
- API 边界：本地一次性 mock API；未把 mock 结果当作 Compose/生产验收

## 已执行路径

1. 启动后显示空组合与“四步完成第一次闭环” onboarding。
2. 创建“DMG 验收账户”，确认 onboarding 第一步显示“已创建账户”。
3. 录入 `600519.SH`、数量 `10`、成本价 `1450`，刷新后显示 `¥14,790.00`、成本 `¥14,500.00`、浮盈亏 `¥290.00` 和一条最新持仓。
4. 点击并核对 8 个主导航：投资组合、导入持仓、风险中心、收益分析、策略实验、投资复盘、研究助手、数据与自动化。
5. 依次切换 `scripts/desktop-qa-fixture.mjs` 的 `error`、`empty`、`stale`、`ready` 和 pending `loading`，观察状态提示、刷新/重试入口和陈旧数据保留语义。

## 结论

macOS DMG 可以挂载、启动并完成基本 UI/表单烟测。Windows 安装启动、真实 Compose API、签名、设备 release 和完整用户路径仍需目标环境复验，因此本报告不能单独勾选 T272、T283 或 T294。
