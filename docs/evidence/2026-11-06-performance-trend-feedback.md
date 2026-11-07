# 收益趋势粒度与失败提示验收

关联 [Task](../tasks/2026-11-06-performance-trend-feedback.md)、[Spec](../specs/2026-11-06-performance-trend-feedback.md)。执行窗口：2026-11-07 00:08–00:16 UTC（任务沿用发起日）。

## 根因与数据边界

- 服务端 range/interval 矩阵明确限制分线为 1D/5D、时线为 1D/5D/1M/3M；截图选择 1Y，禁用符合服务端规则。
- 盘中仅 actual 模式可用，从 PostgreSQL `AccountValuationPoint` 读取并按分钟/小时取周期末值。自动采样按交易时段及实际投资账户持仓过滤；本轮没有触发采样、历史补写或远端 Provider 调用。
- 盈亏查询独立读取收盘历史，加当前估值点；并非分钟盈亏历史。原“计算口径”说明保持不变。
- 原控件仅在成功响应存在时读取 `availableIntervals`，首载/错误缺乏约束；现先按当前区间/模式限制，同区间成功响应仅进一步收紧。不同区间旧响应不控制当前选项。
- 两类读取失败统一使用 DataStateBanner（标题、说明、重新加载）。资产刷新失败保留已读数据，不再将请求失败标为“数据可能陈旧”；两条查询独立重试、共用图内加载圈。

## 独立真实 API 只读核验

地址 `http://127.0.0.1:3000/api/v1/performance/`，2026-11-07 00:10 UTC，baseCurrency=CNY，scope=portfolio（仅 series）：

| 请求 | 结果 |
| --- | --- |
| series，actual/1D/1min | HTTP 200，234 点，LOW_COVERAGE，可选 1min/1h |
| series，actual/5D/1h | HTTP 200，20 点，LOW_COVERAGE，可选 1min/1h/1d |
| pnl-series，actual/1Y | HTTP 200，10 个历史点，REALIZED_PLUS_UNREALIZED |
| series，actual/1Y/1min | HTTP 400，UNSUPPORTED_SERIES_INTERVAL |
| series，shadow/5D/1h | HTTP 400，UNSUPPORTED_SERIES_INTERVAL |

只读结果与父任务提供的调查一致。低覆盖度不等于完整行情。截图中的临时盈亏读取失败本轮未复现；错误恢复以受控样本验收。不使用含业务金额的完整 API 响应作为仓库产物。

## 本地测试与构建

- `pnpm --filter @thesis-ledger/desktop exec vitest run test/performance-trend-controls.test.tsx test/performance-read-state.test.tsx test/performance-analysis-trend.ui.test.tsx test/performance-ui.test.tsx`：4 文件、48 项通过。
- `pnpm --filter @thesis-ledger/server exec vitest run test/performance/valuation-series.test.ts`：8 项通过（未修改服务端源码）。
- `pnpm --filter @thesis-ledger/desktop build`：TypeScript 与 Vite 构建成功，仅既有大 chunk 提示。输入为当前共享工作区，包含其他任务未提交改动。
- `pnpm --filter @thesis-ledger/desktop test`：首次 218 文件通过、9 文件失败，1258 项通过、50 项失败。失败涉及 Node 实验性 Web Storage 与 JSDOM 的存储冲突，不归因于本任务。
- 为消除该环境条件，仅重跑失败的 9 文件，使用 `NODE_OPTIONS=--no-experimental-webstorage pnpm --filter @thesis-ledger/desktop exec vitest run <下列文件>`：9 文件、65 项全部通过；未重复全量测试。
  - `src/features/ai/NewResearchSheet.test.tsx`
  - `src/features/market-detail/MarketPeriodSelection.interaction.test.tsx`
  - `test/authoring-draft-recovery.ui.test.tsx`
  - `test/global-mode-account-journey.ui.test.tsx`
  - `test/global-mode-transition.ui.test.tsx`
  - `test/performance-workspace.ui.test.tsx`
  - `test/research-account-mode.ui.test.tsx`
  - `test/research-form-v2.ui.test.tsx`
  - `test/research-submission-v2.ui.test.tsx`
- 本次改动的 5 个趋势源码文件与新增测试定向 ESLint 通过。
- `scripts/check-boundaries.mjs`：Import boundaries OK。没有改变跨 feature import/export，无需修改边界规则。
- `scripts/check-file-size-guardrails.mjs`：通过，6 个存量尺寸警告；未提供 baseline，不能作为这些存量文件 ratchet 已验证的结论。本轮 TrendSection 从 约 400 行缩至 289 行，选择控件与区间合同提取为明确职责文件。

日志保存在 `/tmp/trend-targeted.log`、`/tmp/trend-server-targeted.log`、`/tmp/trend-desktop-tests.log`、`/tmp/trend-desktop-failed-recheck.log`、`/tmp/trend-desktop-build.log`、`/tmp/trend-eslint.log`、`/tmp/trend-boundaries.log`、`/tmp/trend-size.log`，仅供当前会话检查。

## 真实浏览器受控验收

复用本机源码 Vite 服务 `http://127.0.0.1:5173/performance?tab=analysis`，使用 Edge/Playwright 隔离上下文，所有 `/api/` 请求拦截为固定样本；不读取或提交真实业务数据。

1440、1024、768、390 四种宽度均验证：

- 首次两路失败时，近 1 年的分线/时线保持禁用，区间说明直接可见。
- 错误提示结构与动作一致；只重试资产时盈亏请求数不增加，只重试盈亏时资产请求数不增加。
- 1Y/1d → 1D/1min → 1D/1h 可选择，实际请求符合矩阵；键盘 Escape 关闭选择面板，触发器保留焦点。
- 实际 → 模拟转换为 5D/1d，模拟禁用盘中；切回实际恢复合法 1D/1h。
- 成功缓存后再次刷新失败，原折线点位不变，提示保留上次估值，盈亏区域成功不受影响；重试恢复。
- 文档无横向溢出；面板、文字与重试按钮未越界。已人工查看 1440 与 390 截图，布局正常。

脚本 `/tmp/performance-trend-feedback-qa.cjs`；摘要 `/tmp/trend-feedback-browser-results.json`；截图 `/tmp/trend-feedback-{1440,1024,768,390}.png`。这些是临时受控验收产物，不作为真实资金界面证据，也不纳入 Git。

## 运行态边界

本轮未执行 Docker 状态变更；未调用 `sync-code.sh` 或 `update.sh`。已存在的 Vite 服务直接加载本轮源码。Docker 中的应用及镜像未据此宣称更新，正式目标运行态更新与真实业务页面验收仍未完成。没有 Git commit，未修改交易筛选文件。
