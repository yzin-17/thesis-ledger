# 自选报价时段、刷新与密度验证

对应 [Spec](../specs/2026-11-07-watchlist-quote-context.md) 与 [Task](../tasks/2026-11-07-watchlist-quote-context.md)。本轮未提交；工作区有并行任务，保留其改动。

## 语义与边界

自选响应增加可选 `quoteContext`。服务端复用 Market 已导出的展示交易日历，CN 使用 Asia/Shanghai、HK 使用 Asia/Hong_Kong、US 使用 America/New_York；每市场当日复用同一个日历请求，日历读取失败不持有成功缓存。该 DSA 日历由本地 exchange-calendars 装配，不调用行情 Provider。

开市、最近时段快照、未覆盖最近交易时段、日历未知分开表达。仅当日历确认当前没有进行中的 Session，且报价属于最近结束时段的交易日、时间不早于该时段结束前 600 秒，才投影最近时段快照；10 分钟沿用报价既有时间阈值。之后开市会重新判断。来源时间缺失或未来、日历不可用或没有覆盖的 Session 分别返回稳定原因码。

最近时段快照在自选显示“休市 · 最近时段快照”，不因原报价的年龄标记显示陈旧；同时明确“来源快照，非官方收盘价”。旧时段显示“未覆盖最近交易时段”，日历未知显示“交易时段未知”。原始 `stale/freshness`、价格、来源时间和采集时间保留，严格价格消费门禁不放宽。Mobile 复用相同公共展示投影。未把普通快照认证为官方收盘价。

报价合同增加可选刷新失败码。来源失败、冷却、缓存故障分开，失败回退不会把旧获取时间改成当前时间；无旧值时冷却也保留独立错误码。DsaClient 保留结构化来源错误码，不解析中文。旧 DSA 报价网关会将冷却归并为 upstream_unavailable；本轮不猜测其内部原因，Server 自身冷却窗口则有明确码。

ETF 按控制投影确认资产类型，成功缓存改为 600 秒；请求前建立相同窗口的分布式占用，失败且没有旧报价时也不能立即再调用。手工刷新不绕过窗口；政策控制围栏、来源准入和校验保留。读缓存时重新计算年龄，不能把缓存期当成报价新鲜度。

新增边界门禁禁止 Watchlist 直接依赖 integration，继续单向消费 Market。

## 界面与受控浏览器

保留名称无下划线、原点击入口和分组短下划线。表格改为明确列宽，补充涨跌额、今开／前收、高／低、来源、行情时间和获取时间。未知值显示横线，没有为未知量额补零，也没有增加来源请求。窄屏横向滚动限制在共享表格容器内，390 宽度沿用卡片网格。

共享加载指示增加可选文字避让：优先可见交集中央，重叠时沿竖向选择最近空隙。只有自选启用；其他消费者默认行为不变。使用 es-toolkit 1.51.0 的严格 `minBy`，已核对运行时导出、声明、实现和[官方文档](https://es-toolkit.dev/reference/array/minBy.html)。与原生排序比较，minBy 不需要排序整个候选集合；DOM 文本矩形读取本身使用原生 Range/TreeWalker。

本机 Chromium 访问现有 Vite 页面，以前次真实 510300.SH 报价作受控响应，并提供受控交易时段上下文；本轮没有把该上下文声称为目标 Server 的实际回读。价格样本 4.124、前收 4.195、涨跌 -1.69%、行情时间 2026-11-06T08:14:52Z，采集时间仍为原值。正常态与慢刷新覆盖 1440、1024、768、390，均无整页横向溢出，刷新圈与数字文字的矩形交集为零。桌面／平板表格有容器内滚动，390 使用原列表网格；截图均人工查看。

本机脚本 `/tmp/watchlist-context-browser.cjs`，结果 `/tmp/watchlist-context-browser.json`，截图 `/tmp/watchlist-context-{1440,1024,768,390}.png` 与 `watchlist-context-refresh-*.png`。它们是受控样本和 UI 验收，不是新增真实行情调用或 Docker 验收。

## 验证记录

- Server 自选、时段、缓存、并发和批量报价范围定向测试通过；新增无旧值失败后的二次请求保护，以及 CN、HK、US、节假日、未来／缺失来源时间、日历未知、开市后的状态测试。最终小增量冷却错误码另做定向回归，见 `/tmp/watchlist-context-final-targeted.log`。
- Server 全包最终一轮：495 文件 / 3915 项通过，89 文件 / 398 项跳过，退出 0；需允许回环 HTTP 监听。默认沙箱一轮因 EPERM 和后续关闭失败产生假失败，未当作产品失败。之后新增的无缓存冷却错误分类已有定向回归，不扩大为该轮完整输入不变的通过结论。日志 `/tmp/watchlist-context-server-final.log`。
- Schemas 全包：1465 通过、3 跳过；新增可选原因码后 watchlist／quote 合同定向 13 项通过。Domain 全包 476 项通过，最后展示／原因增量定向 2 项通过。
- Desktop 自选与共享刷新 4 项、Mobile 自选 5 项通过；Desktop 生产构建、Mobile 类型检查通过。Server 构建在补齐隔离风险测试 Position 样本缺少的必填 `source: isolated-fixture` 后通过；没有改风险业务代码。日志使用 `/tmp/watchlist-context-*` 前缀。
- ESLint、模块边界、workspace 依赖门禁、差异空白检查通过。`GUARDRAIL_BASE_REF=HEAD` 文件尺寸 ratchet 通过，6 条现有技术债告警未增长。核心 quote reader 的新增职责放在独立缓存策略文件。
- Desktop 当前运行器为 Node 26.13.0，默认实验性 Web Storage 干扰 jsdom，默认全包产生 53 项失败。设置 `NODE_OPTIONS=--no-experimental-webstorage` 后本轮全包为 1328 通过、2 失败。该开关仅用于本轮验证，没有改项目运行时或依赖。定投导航的陈旧断言已按现有“仅有已结束计划时默认展开”行为更新，9 项通过；没有改定投产品行为。

## 当前阻塞与真实运行态

Desktop 两项剩余失败：

1. `test/ui-contract.test.tsx:168` 仍断言“启用风险规则与后台扫描”，与当前新手引导文案不一致。
2. `src/features/market-detail/MarketDetailDialog.latest.integration.test.tsx` 的基金每日误差样本缺少 `estimatedNav`，在 `FundDailyComparison.tsx:26` 调用 toFixed 时失败。

两项属于其他并行任务范围，本轮未修改相关文件。遵守“低层级失败不推进高成本验收”，尚未运行 infra `sync-code.sh` / `update.sh`，未同步本轮 Server 合同与时段逻辑，也未更新或构建目标镜像；真实运行态与真实 API 浏览器验收仍未完成，Task 保留未勾选。Desktop 生产构建成功不能替代这两项测试和目标运行态验收。

只读原日志保存在 `/tmp/watchlist-context-original-{server,dsa}.log`。Server 于 2026-11-06T17:03:13.235Z 首次开始请求，83ms 后失败，此后多次在 7–11ms 内失败。当前取得的 DSA 容器日志片段缺少该时段对应符号记录，无法独立确认首个 Server 失败而 DSA 成功的具体中断点；保持未知。本轮补充未来阶段失败日志的结构化错误码，没有重放请求以强行复现。没有新增外部行情／模型调用、购买权益、变更密钥、调整 DSA 预算或数据库结构。
