# macOS Desktop release + Compose API 运行态证据

## 执行信息

- 日期：2026-08-01
- 产物：`apps/desktop/release/Investment OS-0.1.0-arm64.dmg`
- DMG SHA-256：`b76d8236dccd70ed30ccc65c2b7c0d8905e23b857cdcb7282fc1cffe7b1474df`
- API：Docker Compose `server`，`http://127.0.0.1:3000/api/v1`
- 运行态：PostgreSQL、Redis、DSA 和 Server 均为 healthy；`pnpm db:integration`、`pnpm v1:e2e`、`pnpm provider:failover --allow-service-stop` 和 `pnpm disaster:recovery` 已通过。
- 窗口：Electron release 窗口由 520×520 调整到 800×520，再回到 520×520；截图为 Computer Use 捕获的 Retina 窗口图像。

## 真实 API 页面烟测

在同一 release 窗口中依次打开八个主导航页面，并从可访问性树读取到实际 Compose 数据或页面结构：

- Portfolio：读取 `¥14,880.00` 总市值、`¥14,500.00` 成本和 `¥380.00` 浮盈亏。
- Import：上传仓库内 `sample.png`，创建 pending 草稿；添加并修正 `000001.SZ`、数量 `10`、成本 `100` 后提交，页面显示“导入已提交，组合已重新估值”。
- Risk：读取已有规则/事件；新增 `price-below`、证券代码 `000001.SZ`、阈值 `120` 的规则，并执行测试入口。
- Performance：读取收益分析页面及历史 Snapshot 结构。
- Strategy：保存 `Desktop Release Strategy` 新版本，排队回测并运行，任务最终显示 `succeeded` / `100%`。
- Journal：执行 Single Trade Review 与 AI Behavior Review，页面展示计划偏差、行为指标、反事实假设和 AI 来源边界。
- AI：提交“请检查当前组合风险并列出证据来源”，页面显示研究任务、`portfolio` 上下文、`mock / research-default` 和 `running` 状态。
- Provider/Automation：读取 `dsa-fork`、Provider 健康历史及自动化任务；连通性测试入口返回“已排队”。

另外，在 Portfolio 页面创建了真实 API 账户 `Desktop E2E 20260801`，并录入 `000001.SZ` 数量 `20`、成本 `100`，刷新后持仓表显示对应市值与盈亏。

## 窗口与键盘证据

- [release-520px-compose.jpeg](release-520px-compose.jpeg)：真实 Compose API 下的最小窗口布局。
- [release-800px-compose.jpeg](release-800px-compose.jpeg)：真实 Compose API 下的 800px 宽布局。
- [release-800px-compose-focus.jpeg](release-800px-compose-focus.jpeg)：800px 窗口按 Tab 后，焦点落在“导入持仓”导航按钮并保留可见焦点轮廓。
- 先前 fixture 状态的 [release-520px.jpeg](release-520px.jpeg)、[release-800px-focus.jpeg](release-800px-focus.jpeg) 保留用于状态矩阵对照，不冒充真实 Compose 数据。

## 证据边界

本报告补齐了 macOS release + 真实 Compose API 的主要页面和关键写入路径，但仍不能单独勾选 T272、T278、T283 或 T294：Windows 安装启动、全量 D1-D10 键盘流程、全新数据库 onboarding 和最终签名/tag/release 仍需目标环境或负责人批准；本版本不纳入高对比度模式优化；iOS Simulator 运行证据已独立归档于 `docs/reviews/evidence/mobile-ios/2026-08-18-ios-release-e2e.md`。
