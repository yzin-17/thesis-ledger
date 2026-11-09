# 基金净值成交标记验收

日期：2026-11-07。关联[现行规格](../../specs/2026-11-07-fund-nav-trade-markers.md)与[完成任务](../tasks/2026-11-07-fund-nav-trade-markers.md)。

## 实现与输入范围

本轮使用主仓当前工作区，保留已有趋势控件、筛选器及其他改动。成交合同增加六位 `.OF` 输入；复用原 Ledger 只读投影，不修改数据库或业务记录。Desktop 新增成交查询、按净值日期归位与精确汇总模型、图表资源 Hook 和只读明细；既有历史净值图和盈亏包装负责组合这些能力。

同日同方向合并为一个标记；详情保留各笔成交。同一事件与事实的卖出分摊，在价格、币种、日期和时间精度一致时以 `DecimalValue` 合计数量。缺净值日期不平移，缺日期与预算、投影不可用独立提示。当前账户、模式、标的及历史窗口同时进入请求、缓存键与响应身份检查。

## 自动检查

下列命令均从主仓执行，按 RTK 规则使用 `rtk proxy`；成功日志只留最终统计。

| 检查             | 命令或输入                                                                                                                                   | 结果                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 成交合同         | `pnpm --filter @thesis-ledger/schemas exec vitest run test/trade-chart.test.ts`                                                              | 7 项通过；基金请求/响应、非法代码、实时行情合同隔离 |
| 合同构建         | `pnpm --filter @thesis-ledger/schemas build`                                                                                                 | 通过                                                |
| Ledger 投影      | `pnpm --filter @thesis-ledger/server exec vitest run test/ledger/trade-chart-query.test.ts`                                                  | 7 项通过；完整基金代码、账户模式、窗口及原始值      |
| Desktop 定向回归 | 下方 8 个文件                                                                                                                                | 40 项通过                                           |
| 类型与构建       | `pnpm --filter @thesis-ledger/desktop build`；最终测试调整后另执行 `pnpm --filter @thesis-ledger/desktop exec tsc -p tsconfig.json --noEmit` | 通过；构建仍有既有大 chunk 提示                     |
| 定向 ESLint      | 修改的基金图表、新增模型/Hook/明细及其测试、浏览器 TSX 夹具，共 10 个文件                                                                    | 通过                                                |
| 依赖边界         | `pnpm exec node scripts/check-boundaries.mjs`                                                                                                | `Import boundaries: OK`                             |

Desktop 定向文件位于 `apps/desktop/src/features/market-detail/`：`fund-nav-trade-model.test.ts`、`useFundNavTrades.test.tsx`、`MarketNavChart.test.tsx`、`FundNavPnlChart.test.tsx`、`MarketDetailDialog.test.tsx`、`market-trading-overlay-model.test.ts`、`market-trading-overlay-resources.test.ts`、`useMarketTradingOverlays.test.tsx`。使用 `pnpm --filter @thesis-ledger/desktop exec vitest run` 加上述路径执行。已有行情叠层测试存在 React `act` 提示，40 项结果仍全部通过；本轮新测试的异步操作已规范处理。

测试覆盖长小数、大整数、极小非零数量、拆分合计、无净值日期、同日买卖和多笔成交、账户取消与迟到响应、失败重试、保留同范围旧数据、错误响应身份拒绝、无账户不查询，以及旧净值/盈亏刻度与日期行为。

## 受控实际浏览器

固定入口：`apps/desktop/test/browser-fund-nav-trades.html`；脚本：`apps/desktop/scripts/check-fund-nav-trades.cjs`。运行本仓开发服务器后，使用 `pnpm --filter @thesis-ledger/desktop exec node scripts/check-fund-nav-trades.cjs`。需要时由 `PLAYWRIGHT_MODULE`、`FUND_NAV_TRADES_CHROMIUM_EXECUTABLE`、`FUND_NAV_TRADES_QA_BASE_URL`、`FUND_NAV_TRADES_QA_OUTPUT` 指定本机运行环境。本轮使用本机 Playwright 与 Microsoft Edge，页面为 `http://127.0.0.1:5173`。

仅拦截 GET 的成交和盈亏响应；使用真实图表 Canvas、Base UI 弹窗和 API 客户端校验。脚本从画布识别实际卖出箭头位置后点击，不能仅靠文字按钮替代标记命中验收。

| 宽度 | Canvas 标记点击 | 精确明细与键盘入口 | 嵌套关闭/日期锁定衔接 | 刷新、重试与作用域隔离 | 横向溢出与页面异常 |
| ---- | --------------- | ------------------ | --------------------- | ---------------------- | ------------------ |
| 1440 | 通过            | 通过               | 通过                  | 通过                   | 无                 |
| 1024 | 通过            | 通过               | 通过                  | 通过                   | 无                 |
| 768  | 通过            | 通过               | 通过                  | 通过                   | 无                 |
| 390  | 通过            | 通过               | 通过                  | 通过                   | 无                 |

明细验证数量 `3.00000000000000001`、价格 `1.123456789012345678 CNY`，同日两笔买入分别保留 `10.123456789012345678` 和 `0.000000000000000001`。检查首载/刷新结果区单个加载圈、刷新失败保留旧标记、重试恢复、账户及模拟模式切换、目录入口不发成交请求、1 月/重置操作、Escape 仅关闭明细。另以实际顶层命中元素验证明细位于行情弹窗上方，并目视核对 1440 和 390 详情。

本轮修正过的验证问题：夹具盈亏响应补齐 `asOf`；Canvas 命中等待绘制帧；普通日期点击选在绘图区而非时间轴，并避开图表库 500ms 双击窗口；截图等待弹窗动画完成。最终四宽全部重新通过。实现中发现并修复父图表已销毁时继续清理标记引发的异常，以及旧日期锁定阻拦成交明细 Escape 关闭的问题。

结果与截图保存在本机 `/tmp/fund-nav-trades-qa/`，包括 `results.json`、`chart-{width}.png`、`detail-{width}.png`；这些为临时产物，持久验收结论由本记录与仓库内脚本保存。

## 只读真实运行态

按 infra 维护入口执行 `./scripts/sync-code.sh thesis-ledger`，兼容预检及快更成功，Server 和 Worker 均健康，镜像身份保持原值。本轮为容器可写层代码同步，不作为镜像构建或正式发布证据；未操作数据库结构或卷。

真实页面从收益页的组合概览进入 `000001.OF` 行情详情。成交接口 HTTP 200，`status=ready`、`mode=actual`，当前账户响应与作用域一致，1 条成交生成 1 组买入标记。点击成交记录后，明细价格与数量逐项匹配真实账本响应；Escape 关闭后原基金图仍可见。自动阻止非 GET API，请求写入数为 0，页面异常为 0。真实详情的顶层命中与截图也已核对。

本机结果为 `real-results.json`、`real-page.png`、`real-detail.png`；不在文档复制真实账户标识或完整业务响应。受控极端值与真实记录分别验收，不将固定样本当作真实卖出事实。

## 最终审查

AC1 由合同与 Ledger 测试覆盖；AC2、AC3 由精确模型、图表单元测试及真实 Canvas/明细验收覆盖；AC4 由查询竞态、刷新重试、目录与模式隔离及旧图表回归覆盖；AC5 由四宽浏览器、真实 HTTP 200 和维护入口快更覆盖。无未决义务或延期项。

本轮结论限上述输入与检查，不代表共享工作区全仓测试通过。现有数据、历史事实与无关改动保留，未提交或推送。
