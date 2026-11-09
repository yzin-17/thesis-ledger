# 休市快照与共享交易时段验收

## 实现与范围

共享工作区未提交修改。本次将自选原有的交易时段判断迁移为 Domain 的 `projectMarketQuoteSession` 与 Market 的 `MarketQuoteSessionReader`，自选和行情详情单向消费同一语义。新增边界禁令防止 Market 反向依赖 Watchlist。

日历使用现有 DSA 展示日历，不新增来源、依赖或数据库结构。按真实日历的市场时区、最近已结束时段、节假日、午休和提前收市核对报价。只有覆盖最近时段有效末段的报价才显示正常休市快照；不把来源快照认证为官方收盘价。

报价增加可选 `sessionContext`，自选外层 `quoteContext` 继续兼容并复用已取得的上下文。仅纯时点年龄问题可投影为 `stale=false`、`freshness=delayed`；超时、限流、缓存失败、冷却、来源明确异常继续保留。严格要求新鲜行情的读取在该展示投影之前执行原门禁，不能用休市展示状态绕过。

Desktop 正常休市快照采用信息横幅，详细原因和两个独立时点分行显示。Mobile 当前报价提取为独立组件，复用相同说明与时点投影。自选保留已有紧凑摘要与原始双时钟，不增加重复说明。其他分段仍陈旧时，休市信息不能遮盖其告警。

## 本地检查

命令通过 `rtk proxy` 执行。构建、测试日志为 `/tmp/closed-snapshot-*`，可重建产物不加入仓库。

| 检查 | 输入与命令范围 | 结果 |
| --- | --- | --- |
| 共享时段与说明定向测试 | Domain `market-quote-session`、`market-quote-freshness-display` | 9 项通过，覆盖周末、节假日、开盘边界、午休、旧交易日、同日停更、美国提前收市和夏令时、香港时区、未来与未知时点、日历不可用与覆盖不足 |
| Server 与自选回归 | `quote-closed-snapshot`、`quote-stale-reasons`、`quote-cache-window`、`quote-concurrency`、`quote-partial-fields`、`detail.service`、`detail.policy-v3`、`market-stale-reason`、后台报价与批量/类型测试、`test/watchlist` | 86 项通过，3 项按既有条件跳过；严格实时门禁与来源失败保持 |
| Desktop 行情详情模块 | `pnpm --filter @thesis-ledger/desktop exec vitest run src/features/market-detail` | 46 文件、204 项通过 |
| Mobile 报价消费者 | `pnpm --filter @thesis-ledger/mobile exec vitest run test/market-quote-reasons.ui.test.tsx` | 2 项通过，休市信息和独立时间段均验证；原生展示基元为受控替身 |
| Schema 全包 | `pnpm --filter @thesis-ledger/schemas test` | 1490 项通过，3 项按既有条件跳过 |
| Domain 全包 | `pnpm --filter @thesis-ledger/domain test` | 791 项通过 |
| API 客户端全包 | `pnpm --filter @thesis-ledger/api-client test` | 213 项通过，包括上下文经 HTTP 合同保留 |
| 构建与类型 | Schema/Domain build、Server build、Desktop build、Mobile typecheck | 通过；未修改原生依赖或构建配置 |
| 依赖与复杂度 | `scripts/check-boundaries.mjs`、受影响生产文件 ESLint 与复杂度 20 检查 | 通过；新增共享边界无逆向依赖，超阈值组件已按报价展示职责收敛 |
| 文件规模与空白 | `GUARDRAIL_BASE_REF=HEAD` 文件尺寸门禁、写集 `git diff --check` | 通过；6 个既有告警文件均未增长 |

迁移初期修正了一处函数重命名遗漏；量额测试保留完整字段比较并补充新增上下文，旧港股测试不再向仅消费时间的纯投影传入多余字面量字段。最终检查通过，未通过提高阈值或扩大 ignore 处理。

## 浏览器

沿用实际 Dialog、QuoteSection、MarketDetailNotice 与共享投影的受控入口 `/test/browser-quote-stale-reasons.html`，脚本为 `apps/desktop/scripts/check-quote-stale-reasons.cjs`，使用本机 Edge。

1440、1024、768、390 四种宽度各验证 8 种状态：正常休市快照、缺少最近时段、休市刷新失败、交易中时点超限、刷新超时、HTTP 429、冷却、旧响应缺诊断。检查正常信息层级、异常保留、重试恢复、弹窗边界与页面溢出。通过 DOM Range 测量确认“抓取时间”实际位于“行情时间”下一行，不仅检查字符串；页面无未捕获异常。

原始截图与结果为 `/tmp/quote-stale-reasons-qa/`；人工查看 `closed-1440.png` 和 `closed-390.png`，确认正常休市信息、独立时点和原操作按钮完整。

## 真实运行态

同步前只读调用既有日历读取器，确认 CN 日历可用、时区为 `Asia/Shanghai`，最近两个结束时段均属于 `2026-11-06`，下午时段于 `2026-11-06T07:00:00.000Z` 结束。未按周末猜测，未手动强刷报价来源。

在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh thesis-ledger`，使用默认非敏感参数，退出码 0。Server、Backtest Worker 均健康，镜像 ID 保持 `sha256:744b2fdee55705ffe8fdd2ca62f0ca5c7f4a8cbe6ded00f27e0c0125f235141c`。未修改 DSA；此次为容器可写层快更，容器重建后需重新同步或完整更新。

北京时间 2026-11-09 01:56:10 独立请求 `/api/market/510300.SH/detail?chartContractVersion=3&assetType=ETF&include=quote`，响应请求号 `16615c4e-aab9-4b24-a119-2e8fb484ab37`：

- 分段状态 `ready`，报价 `4.124`，`stale=false`，`freshness=delayed`。
- 来源时间保持 `2026-11-06T08:14:52+00:00`，抓取时间为来源原值 `2026-11-08T17:47:37.478415+00:00`；未改写为本次请求时间。
- `servedFromCache=true`，没有刷新失败或陈旧原因。
- `sessionContext.session=closed_snapshot`，`latestTradingDate=2026-11-06`，下一交易边界为 `2026-11-09T01:30:00.000Z`。

该证据证明真实缓存报价已采用共享休市判定；四宽度截图为受控组件页面，不冒充全产品业务页面或所有市场来源的在线验收。
