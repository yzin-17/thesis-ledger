# 竞技场比赛内记录导航验收

规格：[Desktop 界面合同](../specs/2026-11-12-arena-desktop-experience.md) U01／U02／U04／U06／U07。任务：[比赛内记录导航](../archive/tasks/2026-11-12-arena-inline-round-navigation.md)。本证据同时由活动的自主竞技场父任务消费。

## 当前行为

日频比赛的决策及模拟成交统一在比赛详情的“决策与成交”页签展示。交易日期和参赛模型提供筛选；账户的“查看最近决策”选择本比赛最近日期及对应模型。比赛主标题和返回列表／来源入口保留，决策与成交平铺，引用、调用及冻结资料通过折叠查看。

`view`、`round`、`model` 保存选中状态。首次选择记录后把当前日期固定到 URL；切换页签保留记录选择，并保留原列表筛选来源。浏览器前进、后退和刷新可恢复状态。原 `/:match/:round#model-...` 通过 replace 统一到比赛主地址内的对应记录，保留来源状态。

原 `modelArenas.get／compare／round` 合同未改变。模型筛选复用同轮响应，日期改变使用独立查询键；旧请求晚到不能覆盖新日期。无轮次、无匹配模型、无效标识和读取失败分别呈现。后台同轮刷新保留原内容，结果区等待相关查询全部完成后收起一个加载圈。

## 本地验证

主仓中通过 `rtk proxy` 执行：

| 输入与命令 | 结果 |
| --- | --- |
| `pnpm --filter @thesis-ledger/desktop test test/arena-daily-navigation.test.ts test/arena-detail-refresh.ui.test.tsx test/arena-catalog-navigation.test.ts` | 17／17。包含旧锚点、其他 URL 上下文、模型清除、无效标识、大写标识归一及原两种响应顺序／刷新保留。 |
| Desktop 定向 ESLint | 导航 helper、ArenaPage、日频详情／筛选／记录、共享事实展示及测试入口通过。 |
| `pnpm --filter @thesis-ledger/desktop build` | 类型检查与 Vite 通过，最终构建 3.11 秒。 |
| 变更范围 `git diff --check` | 通过。 |

原 React `act`、宿主 localStorage 及 chunk 体积提示继续保留；此处不是零警告结论。没有更改数据库、接口、Worker、Mobile 或来源配置，也没有提交共享工作区。

## 受控浏览器

使用实际业务组件、TanStack Query 和路由，所有接口由隔离响应接管。环境为 `PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright`，浏览器为 msedge，入口为 5187 的 `browser-arena-live.html`。测试页仅增加路由位置及前进／后退的验证探针。

| 维护入口 | 四宽度验证结果 | 截图目录 |
| --- | --- | --- |
| `scripts/local-runtime/arena-inline-round-browser.mjs` | 1440／1024／768／390：最近日期和指定模型、同页标题、模型切换零额外轮次读取、两日期选择、前进／后退、刷新恢复、旧链接、迟到响应不覆盖、失败重试、无效链接恢复及空记录全部通过。 | `/tmp/arena-inline-navigation-qa/` |
| `scripts/local-runtime/arena-experience-browser.mjs` | 四宽部分估值、引用、成交、调用审计、模型深链、原表单精度、失败重试与隔离状态操作通过。每宽 8 次写入全部为受控响应，真实写入为零。 | `/tmp/arena-inline-flow-qa/` |
| `scripts/local-runtime/arena-live-list-browser.mjs` | 四宽列表搜索、分页、筛选和新建同行通过；比赛内页签变化后返回列表，原 `kind=history` 等条件保持。 | `/tmp/arena-inline-list-qa/` |

竞态场景：先阻塞 11月2日的响应，再选择 11月3日；显示新日期后释放旧请求，页面继续显示 11月3日。没有以请求完成顺序推断选中日期。

## 真实本地只读消费

`arena-detail-runtime-browser.mjs` 使用 `ARENA_QA_ORIGIN=http://127.0.0.1:5173 ARENA_RUNTIME_FULL_SHELL=1 ARENA_RUNTIME_QA_OUTPUT=/tmp/arena-inline-runtime-qa`，连接已确认的本地 3000 端口。四宽度均通过，完整通过运行共 21 次本地 GET；外壳账户列表每宽使用一次空样本，竞技场数据来自真实本地历史记录。

核对了当前招商银行历史比赛的标题、账户入口、比赛内决策及成交、设置、分隔、按钮描边和返回。人工查看 1440／390 的真实记录截图。真实写入、Provider、模型、外部行情及规则调用均为零。当前开发服务直接消费源码，前端产物已构建；不将该证据解释为原生宿主或真实自主交易已通过。

## 失败与修正

- 第一次列表回归发现页签 query 导航丢失原路由 state，导致返回列表失去历史类型筛选。所有内部导航统一保留 state 后，四宽列表返回通过。
- 页面导航的 React 提交有异步阶段，原脚本在选择“全部模型”后立即统计，偶发读到旧数量；改为等待对应记录实际出现后核对，仍验证两模型及零新增轮次请求。
- 原独立轮次页的定位和嵌套页签断言已按当前入口更新，引用、模拟成交及调用信息的核对继续保留。旧失败运行没有计入最终通过运行的读取统计。

## 最终一致性复核

N01–N03 与 U01／U02／U04／U06／U07 均有实现及对应证据。旧地址和来源导航保留，当前记录在比赛内消费，预算及历史事实没有改写。该任务完成范围为 Desktop 日频详情导航；父级实时执行规则、三市场来源、原生宿主和真实部署恢复义务继续独立保留。

## 模型分组层级修正

每个模型使用浅底色标题带及 `text-xl` 标题，模型名称、来源和决策状态集中展示；决策、成交和调用资料按相同内缩对齐。模型内部使用留白区分子模块，模型之间保留单条横向分隔线，消除内外分隔方式相同造成的归属混淆。每个模型的 `article` 通过 `aria-labelledby` 关联模型标题。

定向 ESLint 与 `git diff --check` 通过。重新执行 `arena-inline-round-browser.mjs` 和真实本地只读 `arena-detail-runtime-browser.mjs`，1440／1024／768／390 均通过；人工核对 1440／390 的双模型截图、真实长模型名换行及成交表格容器内滚动。截图分别位于 `/tmp/arena-model-boundaries-qa/` 和 `/tmp/arena-model-boundaries-runtime-qa/`。本次真实读取为 21 次本地 GET，业务写入、外部来源及模型调用均为零；本次仅调整样式和标题语义，未重复生产构建。

## 时间展示统一

日频记录的成交时间、接收时间及执行时间复用 `lib/date-display.ts` 的 `formatDateTime`，按客户端本地时区展示中文日期与时分秒，缺失值沿用原业务提示。真实历史记录中的 `2026-11-09T01:30:00.000Z` 在当前客户端显示为 `2026/11/09 09:30:00`，原始审计数据保持不变。现有时间展示契约测试 2 项、定向 ESLint 及 `git diff --check` 通过；四档屏宽的真实本地只读页面回归通过，截图位于 `/tmp/arena-time-display-runtime-qa/`，人工核对 1440／390 的成交时间。该次运行共 21 次本地 GET，业务写入、外部来源与模型调用均为零。
