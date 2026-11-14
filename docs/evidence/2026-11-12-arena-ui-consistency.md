# 竞技场界面一致性巡检证据

## 基线与范围

对应[界面规格](../specs/2026-11-12-arena-desktop-experience.md) U01–U08。基线为当前未提交工作区，检查竞技场目录 23 个非测试 TSX 组件：列表、两个创建入口、日频四页签、自主三页签及账户内四页签、周报列表与详情。保留共享工作区的并行修改。

## 修正结果

- 日频决策、日频账户与自主账户复用模型标题带；标题、来源和分隔统一。
- 精简创建介绍、图表操作指引及日频记录的常驻说明；达到 50 轮时保留日期覆盖限制。预算消耗、现金与净值差别、行情缺失、冻结及市场时区语义仍可见。
- 统一“令牌总额度／剩余令牌”、清空筛选和结束比赛用语；自主估值时间复用共享格式化，日期范围在窄屏按完整日期换行。
- 日频创建入口复用日期、数值输入和币种选择，保留原始值及建赛契约。
- 自主调用审计、成交来源和周报观察资料使用共享折叠；成交明细和查看全部使用有可见边界的按钮。
- 周报按路由查询与报告阅读拆分组件，统一页头、返回、刷新、重试、章节与表格；比较、归因、分歧、价格观察、后续资讯、决策和成交全部保留。比赛来源的周报返回比赛设置，明细定位比赛内日期与模型，返回仍保留周报来源。

## 本地检查

`pnpm --filter @thesis-ledger/desktop test test/arena-detail-refresh.ui.test.tsx test/arena-daily-navigation.test.ts test/arena-catalog-navigation.test.ts test/date-display-contract.test.ts test/multi-select.ui.test.tsx src/features/model-arena/ArenaPriceLayer.test.tsx`：6 个文件、32 项通过。最终运行仍有 141 条既有 React `act` 警告。

`pnpm --filter @thesis-ledger/desktop exec eslint src/features/model-arena test/browser-arena-live.tsx` 与 `git diff --check` 通过。`pnpm --filter @thesis-ledger/desktop build` 类型检查及 Vite 构建通过，Vite 用时 4.48 秒；现有大包与 Node localStorage 提示保留。

## 浏览器验收

全部脚本以真实组件及共享样式运行，覆盖 1440／1024／768／390。公共参数：`PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright ARENA_QA_ORIGIN=http://127.0.0.1:5173`。

| 脚本 | 通过范围 | 截图 |
| --- | --- | --- |
| `arena-ui-consistency-browser.mjs` | 两个创建入口、日期弹层、自主全部页签、日频账户、周报列表／详情／空状态、非零归因／分歧／成交、长小数、折叠、来源返回、失败刷新保留及恢复。接口均受控。 | `/tmp/arena-ui-consistency-qa/` |
| `arena-experience-browser.mjs` | 日频部分／缺失净值、引用、成交、审计、深链、精度、创建失败恢复、暂停恢复结束。每宽 8 次写入均由受控响应接管。 | `/tmp/arena-consistency-flow-qa/` |
| `arena-live-browser.mjs` | 曲线、图例、区间、净值切换、持仓、成交、创建、返回、网页搜索及标的选择。 | `/tmp/arena-consistency-live-qa/` |
| `arena-live-list-browser.mjs` | 搜索、筛选、倒序、分页、返回条件、弹层、失败保留及空状态。 | `/tmp/arena-consistency-list-qa/` |

人工检查周报 1440／390 的非零报告与真实历史账户 390 截图。表格在容器内滚动，日期保持完整。源码扫描未发现竞技场使用裸按钮、原生折叠、日期标签格式后缀、旧令牌标签或直接展示成交 ISO 时间。

## 真实本地只读

`arena-detail-runtime-browser.mjs` 使用 `ARENA_RUNTIME_FULL_SHELL=1 ARENA_RUNTIME_QA_OUTPUT=/tmp/arena-consistency-runtime-qa`，四宽度通过完整应用外壳和已有已结束比赛的收益、账户、设置、折叠、决策与成交检查。外壳账户列表使用空样本，竞技场数据来自真实本地记录。最终通过运行 25 次本地 GET；业务写入、外部来源和模型调用均为零。

## 失败记录与审查

首次定向测试有 1 项仍用旧按钮文案定位，同步“重新读取收益”后 32 项通过，原失败恢复断言保留。首次真实页面运行在关闭页面时遇到未结束的比较请求，报 `Request context disposed`；脚本现等待收益面板提交并排空路由回调后关闭，保留请求上限、状态码及错误检查，随后四宽度通过。失败运行不计入最终通过运行的 25 次读取。

C01–C03 完成，界面修改保持历史报告、计算、额度及副作用契约；没有触发真实状态操作或外部来源。原生宿主、部署与真实自主交易继续由父任务独立验收。本次不代表应用其他业务模块已完成同等巡检。
