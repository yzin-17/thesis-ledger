# 风险规则列表布局稳定性验收

日期：2026-11-07。关联[风险中心交互规格](../../specs/2026-08-23-risk-center-interaction.md)。

## 改动与排查

`RiskRuleWorkbench` 的网格列数原先取决于可见规则数量，只有归档规则时，展开前为满宽，展开后切换为双栏；列表刷新区域的 `grow` 与归档区域的 `mt-auto` 又将归档入口推向剩余高度底部。

本轮统一桌面双栏网格，并将内容与列表项顶端对齐，列表和归档区域按内容自然排列。移动宽度继续单栏，选中后在下方显示详情。排查了父级 `RiskCenter`、共享 Tabs 与 `ListRefreshRegion`；父级桌面可用高度和共享刷新加载圈保留，仅调整规则工作台三处布局 class。规则选择、展开、归档、恢复、请求与版本逻辑保持原实现。

## 验证

- `rtk proxy pnpm --filter @thesis-ledger/desktop exec vitest run test/risk-actions.recovery.ui.test.tsx test/risk-center-interaction.test.tsx`：2 文件、35 项通过，包含归档展开不自动选择、手动选择、收起清除选择与失败恢复。
- `rtk proxy pnpm exec eslint apps/desktop/src/features/risk/RiskRuleWorkbench.tsx`、`rtk git diff --check`：通过。
- 本机 Microsoft Edge／Playwright 在 `http://127.0.0.1:5173/risk-center?tab=rules` 验证真实 7 条归档规则。1440、1024、768、390 四宽，各检查收起、展开、选中首项、选中末项、再次收起，共 20 个状态；页面异常及业务写入均为 0。
- 四宽的列表起点、宽度与归档按钮位置在各状态间一致；选中前后首行位置、尺寸及列表高度一致。桌面列表宽度固定为 280px，归档展开后只增加条目高度，归档入口紧接空态说明。窄屏测量使用文档坐标，保留浏览器为末项正常滚动的行为。
- 详情仅在手动选择后显示，收起及再次展开不保留归档选择；页面无横向溢出。目视核对桌面收起、展开、选中及 390 展开截图。

结果与截图保存在本机 `/tmp/risk-rule-layout-qa/`。真实业务数据只读，浏览器仅放行 GET。使用现有开发服务器，未操作 Docker、数据库或原生工程，未提交或推送；工作区其他改动保留。
