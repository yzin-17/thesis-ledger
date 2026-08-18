# macOS Desktop release 导航烟测

- 日期：2026-08-01
- 产物：`apps/desktop/release/Investment OS-0.1.0-arm64.dmg`，SHA-256 `b76d8236dccd70ed30ccc65c2b7c0d8905e23b857cdcb7282fc1cffe7b1474df`。
- 运行方式：只读挂载 DMG，启动 `Investment OS.app`，通过 Electron 本地 `/api` 代理连接隔离 fixture。

已在真实 release 窗口中依次打开并读取可访问性树：

- 投资组合：总市值、持仓表、账户与持仓录入均可见。
- 导入持仓：审核导入、创建草稿、暂无导入记录和重试语义可见。
- 风险中心：规则列表、历史事件、通知状态和 `warning` 事件可见。
- 收益分析：历史 Snapshot、资产配置和空数据提示可见。
- 策略实验：新建策略、策略版本、回测任务和暂无数据可见。
- 投资复盘：Single Trade Review、AI Behavior Review 可见。
- 研究助手：研究历史和暂无数据可见。
- 数据与自动化：Provider、Automation 表格可见。

同一窗口还验证了 Portfolio ready/stale/error 三态、Risk 页面字段和键盘 Tab 可到达刷新、表单控件及创建账户按钮。状态矩阵（含 loading、empty 及各页面的直接/共享证据边界）见同目录 `2026-08-18-state-matrix.md`。该烟测不替代 Windows 安装、签名、真实 Compose API 或完整 D1～D10 业务路径。

2026-08-01 后续已在同一 macOS release 窗口连接真实 Docker Compose API，补齐账户/持仓录入、截图导入草稿与提交、Risk 规则、Strategy 版本与回测、Journal Review、AI 研究任务及 Provider 健康页面烟测；详细操作和截图见 [`2026-08-18-compose-release-e2e.md`](2026-08-18-compose-release-e2e.md)。该报告仍明确保留 Windows、全量键盘 D1-D10、全新数据库 onboarding 和签名发布边界。
