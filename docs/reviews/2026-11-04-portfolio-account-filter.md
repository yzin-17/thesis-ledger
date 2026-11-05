# 投资组合账户筛选验证记录

日期：2026-11-04。对应[现行规格](../specs/2026-11-04-portfolio-account-filter.md)与[归档任务](../archive/tasks/2026-11-04-portfolio-account-filter.md)。

## 输入与变更

在现有未提交工作区实施本次增量，保留其他修改，不提交、不部署、不改数据。

- `apps/desktop/src/app/routes.tsx`：账户参数接线与无效参数清理。
- `apps/desktop/src/features/portfolio/portfolio.queries.ts`：核对模式及启用状态，按有效账户查询、缓存和刷新。
- 同目录 `PortfolioAccountFilter.tsx`：复用 Select、统一中文标签及原子类，弹层在触发器下方展开。
- 同目录 `PortfolioDashboard.tsx`、`PortfolioTradeView.tsx`：统一入口、交易联动和详情范围保护；独立交易组件保留原本的局部筛选用法。
- `apps/desktop/test/portfolio-account-filter.ui.test.tsx`、`portfolio-query-demand.test.ts`、`portfolio-table.test.tsx`、`portfolio-closed-dashboard.test.tsx`、`ui-contract.test.tsx`：筛选、请求、回显与调用参数验证。

## 定向与静态验证

主仓执行以下命令，代码块省略 `rtk proxy` 前缀：

```sh
env NODE_OPTIONS=--no-experimental-webstorage pnpm --filter @thesis-ledger/desktop exec vitest run test/portfolio-account-filter.ui.test.tsx test/portfolio-query-demand.test.ts test/portfolio-table.test.tsx test/portfolio-closed-dashboard.test.tsx test/portfolio-trade-mode-scope.ui.test.tsx test/portfolio-trade.ui.test.tsx test/portfolio-account-identity.test.tsx
env NODE_OPTIONS=--no-experimental-webstorage pnpm --filter @thesis-ledger/desktop exec vitest run test/global-mode-account-journey.ui.test.tsx
pnpm --filter @thesis-ledger/desktop exec vitest run test/ui-contract.test.tsx -t '所有账户选择入口复用统一账户显示格式'
pnpm --filter @thesis-ledger/desktop build
pnpm exec node scripts/check-boundaries.mjs
```

首组 7 文件 / 47 项通过；真实路由模式往返 3 项通过；账户显示格式 1 项通过，该文件其他 18 项未在最后定向命令中执行。桌面类型检查、生产静态构建、边界检查通过，保留既有大包体积提示。本次路由、查询、筛选、Dashboard、TradeView 与新交互测试的定向 ESLint 通过。

测试覆盖账户就绪前不误发全部估值、模式/账户缓存隔离、停用/未知/跨模式回退、汇总和持仓同步、迟到响应隔离、失败恢复、交易继承与清除，以及既有交易模式和详情行为。

## 发现与修正

- 新交互测试初次 ESLint 发现禁止的内联 `import()` 类型，改为显式类型导入后通过。
- 扩展路由测试首次因本机 Node 26 未初始化 Web Storage，导致 `window.localStorage` 不可用；仅在测试进程禁用该实验能力后 3 项通过。未修改应用或系统配置；jsdom 整页导航提示仍保留。
- 扩展 `ui-contract.test.tsx` 全文件时，现有 `MarketReferenceSheet.tsx` 的 `reference-start`、`reference-end` 原生日期 Input 不满足统一 DateInput 约束：18 项通过、1 项失败。本次未修改该来源文件，不声称全文件或全仓检查通过。
- 浏览器脚本最初按名称前缀命中现金账户，已改为精确基金账户；另修正页面更新前判断交易请求的等待条件。
- 真实浏览器发现 Select 按所选项对齐时，上方选项可能落到视口外。改为 `alignItemWithTrigger={false}` 后，恢复全部账户的鼠标操作和完整流程通过。

## 本地真实浏览器与 API

入口：`http://localhost:5173/portfolio`，当前 Vite 源码与现有本地 Server；实际估值和交易请求使用 `/api/v1/portfolio/` 既有接口。

| 场景 | 观察结果 |
| --- | --- |
| 全部账户 | 1 个标的、2 笔持仓；总资产 ¥79.10，证券 ¥161.10，现金 −¥82.00 |
| Android 基金账户 | `accountId=13be40c4-78e6-422b-b922-964a0706c5c3`；1 笔持仓，总资产 ¥39.55，证券 ¥80.55，现金 −¥41.00，今日收益 −¥3.96 |
| iOS 基金账户 | `accountId=02084347-96de-473a-8fc8-ecd2902a085c`；1 笔持仓，汇总与账户归属正确 |
| 交易页往返 | 请求携带对应账户编号与 `mode=actual`，没有第二个账户筛选；返回概览保持范围 |
| 刷新单账户链接 | 保持 iOS 基金账户，未先请求全部估值 |
| 恢复全部 | 移除 URL 的 `accountId`，恢复 2 笔持仓与 ¥79.10 总资产 |
| 未知账户链接 | 自动清理参数，回退全部；未发起未知账户估值 |
| 单账户切换模拟 | 清理账户参数，显示“全部账户”；请求 `mode=shadow` 且未携带实际账户编号 |

1440、768、390 像素截图已检查，筛选可见，账户列保留。完整浏览器流程退出码 0，运行异常列表为空。辅助产物在 `/tmp/portfolio-account-filter/`，脚本为 `/tmp/portfolio-account-filter-browser.mjs`；本表和仓库定向测试保存验收事实，临时文件不是唯一证据。

## 最终核对与边界

AC1 由选项/回显测试和浏览器覆盖；AC2 由请求、竞态、失败测试及真实汇总覆盖；AC3 由交易联动/清除测试及页签/刷新操作覆盖；AC4 由账户等待、无效范围、模式测试和浏览器覆盖；AC5 的本地 Web、构建与边界检查完成。

本次桌面本地 Web 筛选范围通过。现有日期控件契约失败保留，不推断全仓检查通过。未更新 Docker 静态文件、镜像、Electron 或手机安装包；这些环境不属于本次验收声明。没有新增延期功能或未解决的本次验收义务。
