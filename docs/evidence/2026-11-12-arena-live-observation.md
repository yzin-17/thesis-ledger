# 自主比赛观战体验验收

本文件保留该轮只读观测和界面验收记录。当前开始日期与执行时间语义由[历史回放与实时衔接](../specs/2026-11-12-arena-replay-live.md)维护，后续执行和实际状态见[回放验收证据](2026-11-12-arena-replay-live.md)。

## 2026 年 11 月 13 日内边距补充

排名与图例中的模型名称虽已使用 ghost，仍继承 sm 尺寸的左右内边距。本次仅在这两处清零 padding 与透明边框，改为内容高度；排名名称、来源和模型列表头的左边缘对齐。模型选择控件继续保留完整点击区域，没有全局修改 Button。

Desktop 定向 ESLint 与 build 通过。实际开发应用在 1440、1024、768、390 宽度逐一检查：模型名计算内边距均为 0px，名称文字与来源的左边缘误差不超过 1px；图例无左右内边距，悬停、键盘焦点及点击名称进入账户均通过。同页历史决策、账户、设置入口和横向溢出检查通过；真实比赛只发出 10 次 GET、0 次写入。截图位于 /tmp/arena-model-padding-qa/，使用 scripts/local-runtime/arena-observation-runtime-browser.mjs 验证。

## 结果与范围

Desktop 自主比赛详情完成：主图桌面高 520px、窄屏高 420px；读数在图内上方避让指针和价格轴；运行中每 15 秒读取详情并推进时间轴，新增估值跟随当前时刻，手动浏览历史保留视窗，“回到最新”恢复跟随。全部视图保留首个真实估值，缺口不连接，时间轴空白不生成估值。模型图例、排名及模型切换入口去掉描边。

同页新增历史决策，按模型和研究时间倒序、每页 10 条；页签、模型、页码进入 URL，支持刷新及后退。展示摘要、委托、撤单数量、预约、观察标的和原有调用审计。账户的研究区域承载当前预约，通过“查看历史决策”进入统一历史位置。

现有只读详情接口提供全场最近 200 次研究；页面直接说明此范围，没有宣称完整长期历史。未修改 Server、接口、数据库、比赛或冻结记录。

## 时间事实

`LiveMatchesRepository` 在第一次启动时写入 `startedAt`，`LiveValuations.capture` 仅为已启动比赛记录观察。计划开始日期是日期边界，不是历史回放指令。页面分别显示计划开始、实际启动和首个估值，并解释历史日期不自动回放。

真实 `test` 比赛的计划开始为 2026-11-02，实际启动和首个估值均在 2026-11-12 22:05（Asia/Shanghai）。最终只读验收获取 52 个估值批次、1 个模型、0 次研究；空历史由真实无研究记录造成，未生成样本写入比赛。

## 定向检查

- `pnpm --dir apps/desktop test test/arena-detail-refresh.ui.test.tsx test/arena-daily-navigation.test.ts test/arena-catalog-navigation.test.ts`：3 个文件、17 项通过。原测试存在 React `act` 警告，不扩大为无警告结论。
- `pnpm --dir apps/desktop exec eslint`，输入为 `ArenaLivePage.tsx`、`ArenaLiveChart.tsx`、`useArenaLiveViewport.ts`、`ArenaLiveDecisions.tsx`、`ArenaLivePerformance.tsx`、`ArenaLiveAgent.tsx`：最终版本通过。
- `pnpm --dir apps/desktop build`：最终版本通过，包含 TypeScript 检查；仍有大于 500 kB 的 chunk 提示。
- `node scripts/check-boundaries.mjs`、`node scripts/check-file-size-guardrails.mjs`：通过。未运行全仓 lint 或全量测试，不声称全仓门禁通过。

## 受控浏览器

环境：`PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright`，无头 Microsoft Edge。

专用开发入口：`pnpm --dir apps/desktop exec vite --config test/ratio-display.vite.config.mjs --port 5187`。

`node scripts/local-runtime/arena-observation-browser.mjs` 在 1440、1024、768、390 全部通过。覆盖：实际高度、图内提示及移出隐藏、模型无描边、自动 GET、当前时刻轴、首个估值保留、新估值到达时的历史视窗保持、回到最新、刷新单圈、失败保留旧图及恢复、历史分页、模型切换、URL 刷新／后退、四个页签、空历史、暂停停止轮询和时间轴冻结；每宽记录写请求为零。测试仅在受控宿主截获图表模块响应注入图表 API 读数，不修改产品代码或图表库。

`node scripts/local-runtime/arena-live-browser.mjs` 四宽度回归通过，覆盖图例、净值、期间、账户焦点、持仓、成交审计、创建返回、开关和标的选择。原账户断言增加等待路由页签显示，适配 URL 导航的异步提交；断言本身保留。

截图：`/tmp/arena-observation-qa/{1440,1024,768,390}-chart.png` 与同目录 `*-decisions.png`；原流程截图为 `/tmp/arena-live-qa/`。人工查看桌面和 390 图表、390 历史决策，检查长名、图内读数、分隔层级和表格容器滚动。

## 真实目标应用

`node scripts/local-runtime/arena-observation-runtime-browser.mjs` 连接宿主开发页面 `http://127.0.0.1:5173` 和本地 API `http://127.0.0.1:3000`。四宽度均通过，最终一轮共 10 次本地 GET；包含实际比赛自动刷新、图表尺寸、时间说明、全部页签、模型历史空状态和页面不溢出。外壳账户接口为受控空样本，其余比赛数据来自真实目标接口；非 GET 和其他接口均拒绝。没有调用模型、外部行情或比赛写接口。

截图：`/tmp/arena-observation-runtime-qa/{1440,1024,768,390}-performance.png` 及同目录 `*-decisions.png`。人工查看真实桌面收益页，模型名无框，当前时刻位于图右侧，开始时间说明可见。

本次仅修改 Desktop 源码，实际目标为宿主 Vite，已由热更新加载并以完整应用核验。`scripts/deployment/prepare-code.sh` 的 ThesisLedger 快更载荷仅含 Server 及 domain/schemas/shared；没有本次前端输入。因此无需执行容器同步、重启或构建镜像，也没有生产发布或 Electron 安装包更新。

## 最终一致性审查

五项反馈都有实现和验证；产品行为与本次 Spec 一致，真实数据只读，现有时间和收益事实保留。新旧 Arena 详情、完整自主页签和原创建流程分别核验；此次未修改 Mobile 或原生依赖，不把网页验收扩大为原生宿主验收。其他自主执行、来源和部署门禁继续由父任务持有。
