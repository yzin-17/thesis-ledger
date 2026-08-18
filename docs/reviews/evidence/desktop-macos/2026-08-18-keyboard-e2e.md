# macOS Desktop release 键盘流程证据

## 执行信息

- 日期：2026-08-01
- 产物：`apps/desktop/release/Investment OS-0.1.0-arm64.dmg`
- DMG SHA-256：`b76d8236dccd70ed30ccc65c2b7c0d8905e23b857cdcb7282fc1cffe7b1474df`
- API：`scripts/desktop-qa-fixture.mjs`，`127.0.0.1:3000`
- 记录方式：macOS release 窗口的 Computer Use accessibility tree、Tab/Shift+Tab/Space/Return 和文本输入；研究助手结果截图见 [keyboard-e2e-ai.jpeg](keyboard-e2e-ai.jpeg)

## 键盘路径

1. D1：最新 macOS release 在空组合 fixture 下显示四步 onboarding、空账户/持仓表单和数据源/风险入口；截图见 [onboarding-empty-latest.jpeg](onboarding-empty-latest.jpeg)。从 Portfolio 的 HTML 内容开始连续 Tab，焦点按顺序经过投资组合、导入持仓、风险中心、收益分析、策略实验、投资复盘、研究助手、数据与自动化、刷新、持仓查看和账户表单；Shift+Tab 可反向回到创建账户字段。
2. D2/D3：Shift+Tab 回到账户名称，键入 `Keyboard E2E Account`；Tab 到创建账户并用 Return 提交；再通过账户选择器的 Space、Down、Return 选择账户，Tab 到证券代码、数量、成本价和“添加持仓”，用 Space 提交 `000001.SZ`、`10`、`100`。
3. D4：Tab 到“导入持仓”，打开截图选择器，使用系统“前往”路径选择 `third_party/daily_stock_analysis/docs/assets/sample.png`；回到页面后 Tab 到“创建草稿”，用 Return 创建 pending 草稿。
4. D5：在截图草稿候选行中用键盘修改代码为 `000001.SZ`、数量为 `10`、成本价为 `100`，提交后页面显示“导入已提交，组合已重新估值”；提交结果见 [import-keyboard-submit.jpeg](import-keyboard-submit.jpeg)。
5. D6：Tab 到风险阈值，输入 `120`，跳过默认严重级别，输入证券代码 `000001.SZ`，Tab 到“创建规则”并用 Space 提交；页面显示“规则已创建并记录审计”。
6. D7：Tab 到研究问题，追加“键盘验收”，Tab 到“创建研究任务”并用 Space 提交；页面显示研究任务 ID 和“已记录研究问题”。
7. D8/D9：进入“数据与自动化”页，确认 Provider 凭证只显示“已配置/未配置”、自动化任务和健康历史可见；切换 fixture 的 error/stale/ready 后用“刷新 Provider 与自动化”观察失败/陈旧提示再恢复正常，最新 release 回归确认恢复成功后清除错误提示，截图见 [provider-onboarding-configured.jpeg](provider-onboarding-configured.jpeg)、[provider-automation-release.jpeg](provider-automation-release.jpeg)、[provider-automation-stale.jpeg](provider-automation-stale.jpeg)。
8. D10：本报告汇总 D2、D4、D6、D7 的键盘-only 验收；所有输入、选择器、提交和重试控件均通过 Tab/Shift+Tab/Space/Return 到达，焦点轮廓保持可见。

以上路径使用真实 release 包的实际按钮、表单和页面状态，不依赖开发服务 DOM 查询。`release-800px-compose-focus.jpeg` 与 `release-520px-compose.jpeg` 继续作为窗口尺寸和 focus-visible 证据。

## 边界

本证据覆盖 macOS release 的 D1、D2、D3、D4、D5、D6、D7、D8、D9、D10 键盘与状态路径和焦点可达性。Windows 安装、签名包、最终负责人发布批准仍不由本机证据替代。本版本不纳入高对比度模式优化或系统级高对比度逐页检查。
