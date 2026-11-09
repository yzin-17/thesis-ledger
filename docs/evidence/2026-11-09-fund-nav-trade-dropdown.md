# 基金净值图成交记录下拉列表验证

日期：2026-11-09。

## 范围与结果

`FundNavTradeDetails.tsx` 复用共享 DropdownMenu，将成交记录逐项显示在浮层中。入口保留“查看成交记录”，记录包含日期、中文买卖方向与笔数；选中后继续使用原成交详情弹窗，保留原始数量、价格精度、账户及模式信息。图上买卖点、错误提示和成交读取重试保持有效。

该组件由共享基金净值图消费，因此详情及持仓中的相同入口同步生效。`MarketNavChart.test.tsx` 和既有 `check-fund-nav-trades.cjs` 相应改为菜单项交互。实现仅组合现有组件与原子类，无新增样式表、依赖、接口或数据修改；共享工作区已有变更均保留，未创建提交。

## 验证

- `pnpm --filter @thesis-ledger/desktop exec vitest run src/features/market-detail/MarketNavChart.test.tsx`：9 项通过，覆盖成交详情原始精度、图上标记选择、列表选择、作用域切换、详情关闭及图表视区保留。
- `pnpm --filter @thesis-ledger/desktop build`：类型检查及 Vite 构建通过，保留既有大分包提示。
- `pnpm exec eslint apps/desktop/src/features/market-detail/FundNavTradeDetails.tsx`：通过。
- 运行 `apps/desktop/scripts/check-fund-nav-trades.cjs`，使用当前宿主 `http://127.0.0.1:5173`、Playwright 与受控 GET 响应；1440、1024、768、390 四宽全部通过。验证实际图上买卖标记、菜单边界、Escape 关闭菜单且保留父弹窗、键盘选择记录、详情原始精度、读取中及失败保留、重试、账户和模式隔离，以及目录入口不读取成交。
- 已人工检查桌面与窄屏菜单截图。受控截图与机器结果位于 `/tmp/fund-nav-trade-dropdown-qa/`。验收不写入真实业务数据，不认证外部行情来源。

本轮为局部界面调整；Desktop 宿主服务直接读取当前源码，无 Docker 输入变化，未重复更新容器。
