# 统一市场开闭市状态验收

## 实现与排查范围

规格：[统一市场开闭市状态与日历消费](../../specs/2026-11-09-unified-market-session.md)。

Domain 的 `projectMarketSession` 只消费经过 Market 日历 Reader 校验的事实。`MarketSessionReader` 缓存同市场、同民用日期的日历请求，状态按实际评价时点重新投影；失败短暂缓存，避免并发重复读取。MarketService、报价适配和其他消费者共享这一入口。

已接入报价详情、自选报价、基金当前估值、基金持仓报价交易日归属、收盘误差、默认自动任务门禁、多市场盘中采样、风险最近完整收盘日和后台报价采集。Desktop 自选分时间隔改用实际会话，证券资料行情弹窗复用快照文案。Mobile 消费现行 Schema 和公共报价展示，无独立开市时钟需要保留。

源码扫描未再发现 Server 当前状态消费者和双端 feature 直接引用内置年度日历或 `openTradingMarketsAt`。Domain 的内置年度日历及历史回测输入保持独立用途；执行规则继续消费传入事实，不使用当前开闭市状态覆盖冻结语义。风险原有派生分钟分支本来就因分钟合同未接入而拒绝，本次去掉其不可达的内置日历聚合路径，保持同样的不可用行为。

当前状态区分 `open`、`closed`、`unknown`；`tradingDayState` 表达交易日门禁；最近结束时段与完整收盘日分别返回。未知日历不变成休市，不触发新分钟估值或后台报价。严格报价门禁和来源错误保持原合同。

## 自动验证

命令均在主仓运行，测试使用 `pnpm --filter <package> exec vitest run <paths>`，构建使用对应包的 `build`。

| 输入范围 | 结果 |
| --- | --- |
| Domain 全包 | 70 文件、795 测试通过 |
| Schemas 全包及新增消费者合同 | 全包 1490 通过、3 跳过；新增未知、误标休市、虚假估值和状态错配合同另 4 通过 |
| API Client 全包 | 42 文件、213 测试通过 |
| Server：`test/market`、风险运行时、自动门禁/运行时/服务、绩效采样/基金收益/分钟可得性、自选价格 | 115 文件：1194 通过、35 跳过；唯一新测试任务类型拼写错误修复后，该文件 7 测试全部通过。最终涉及 1195 个不同通过用例 |
| Desktop：自选、证券资料、基金当前估值 | 7 文件、30 测试通过 |
| Mobile：报价诊断与自选展示 | 2 文件、7 测试通过 |
| 前序图表与 Toast 合同补充检查 | 56 测试通过；为新增查询 hook 补 QueryProvider，并更新已移除阴影的旧断言，不修改产品行为 |
| Server / Desktop build、Mobile typecheck | 通过；Desktop 保留现有 bundle 尺寸提示 |
| 48 个相关源码与测试 ESLint | 0 错误、0 警告 |
| `check-boundaries.mjs`、共享状态门禁 2 测试、`check-workspace-dependencies.mjs` | 通过 |
| `check-file-size-guardrails.mjs` | 通过，保留 6 个存量文件警告；未以提高阈值绕过检查 |

早期脚本转发多余的 `--` 曾扩大为全包测试，暴露了缺少会话 fixture 的测试及前序 UI 旧断言，均在对应输入修复后定向复验。未把探索运行宣称为最终全仓通过；数据库集成跳过项不作为实际数据库验收。没有数据库结构变更。

## 浏览器

实际运行 `apps/desktop/scripts/check-market-session.cjs`，通过 1440、1024、768、390 宽度。受控页面使用真实 FundCurrentValuation、WatchlistTrend、SecurityStaticPriceDialog 组件，禁用业务请求：

- 正常休市保留最后有效估值及原日期，实际会话生成中间间隔。
- 未知日历显示“交易时段未知”和重试入口，估值为空，不显示已休市、不虚构休市分隔。
- 证券资料弹窗显示“休市快照”，弹窗边界、横向溢出与 Escape 关闭检查通过。

截图和机器结果位于 `/tmp/unified-market-session-qa/`，已人工检查窄屏未知状态与桌面证券弹窗。它们是受控样本，不代表真实 Provider 或原生设备验收。

## 本地 Docker 与真实接口

执行目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`。

入口：`./scripts/sync-code.sh thesis-ledger`，默认参数，退出 0。预检通过，更新 Server、workspace 产物和 Backtest Worker；Desktop 在宿主机构建并由 Vite 读取源码；Server 与 Worker 健康。镜像 ID 保持 `sha256:744b2fdee55705ffe8fdd2ca62f0ca5c7f4a8cbe6ded00f27e0c0125f235141c`，未修改数据库结构或卷。此更新只在容器可写层，重建会恢复镜像内代码。

在 2026-11-09 02:50 左右（上海时间）只读核验：

- `/api/v1/health`：`healthy`，数据库、Redis、DSA 健康。
- `/api/market/510300.SH/detail?chartContractVersion=3&assetType=ETF&include=quote`：`ready`，价格 4.124，`stale=false`、`freshness=delayed`、`closed_snapshot`；行情时间仍为 11 月 6 日 16:14:52。
- `/api/market/000001.OF/fund-valuation`：`marketState=closed`，保留估值 0.9905325019837131、原估值时点 11 月 6 日 14:59 和 `low_coverage`。
- 两响应均返回同一日历 revision：当前民用日期 11 月 9 日、`tradingDayState=open`、`state=closed`、最近完整收盘日 11 月 6 日、下一边界 11 月 9 日 09:30。盘前不会被解释成非交易日。

首次核验在服务启动及日历请求繁忙时遇到超时，待正式脚本确认健康后重读以上接口成功；错误的带双重前缀探测返回 404，未作为产品失败。没有手动触发真实调度、模型运行、基金估值分钟写入或收费来源请求来证明行为。后台任务、未来年份、来源失败和半日市场景由受控用例验证，不能据此声称所有市场所有年份已在线验证。

原始过滤日志、接口 JSON：`/tmp/unified-session-*`。项目规则已写入根 `AGENTS.md` 的“交易日历与休市判定”，并由边界脚本限制重新引入内置年度日历旁路。
