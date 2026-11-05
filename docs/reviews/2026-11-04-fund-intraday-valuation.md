# 基金盘中估值实施与验收记录

> 对应规格：[单只基金盘中估值](../specs/2026-11-04-fund-intraday-valuation.md)
> 当前任务：[实施任务](../tasks/2026-11-04-fund-intraday-valuation.md)
> 最新接续：11-05按用户最新授权完成现有HiThink快照/qfq各一次读取，均成功，费用事实仍未核实。000001官方三季报参考已通过正式DSA快更接入，更新后一次真实持仓GET为matched，目标Server契约通过。配置仍188，14张受保护表保持。11-05仍240条失败分钟、有效点0，G2.2等待下一真实交易时段及同日净值误差，见[最新证据](../tasks/evidence/2026-11-05-hithink-direct-and-disclosure.md)。下文零行、空序列、旧镜像和旧路由均为当时历史事实。

## 当前估值切片

Market 拥有共享估算、披露与复权价格 helper，Performance 单向调用；同一账户采样批次按基金复用结果，原允许陈旧证据的账户语义保持。面向当前估值的严格模式另行检查五分钟价格时效与未来输入，全缺价不呈现锚点估算。复用已有底层受控缓存，合并同基金同分钟并发计算；完成后再次读取仍复核来源，不缓存整结果绕过来源控制。此方案优先保持控制正确，不声称跨实例只计算一次。

`GET /api/market/:symbol/fund-valuation` 返回公开估值、百分数涨跌、正式净值锚点、价格/计算时间和覆盖质量。公共 Schema 与 SDK 校验完整代码、响应身份、可用性及取消信号。详情增加紧凑的盘中估值指标，分钟轮询在页面后台暂停，缺值显示横线，失败可重试。

## 本地检查

- Server：`test/market/market-fund-valuation.test.ts`、`test/market/fund-nav-estimator.test.ts` 及原估值/披露/复权回归共 6 文件 55 项通过。
- API 客户端：`test/fund-valuation.test.ts` 2 项通过，Schema 与 SDK 构建通过。
- Web：新增 `FundCurrentValuation.test.tsx` 和原详情/报价/空状态回归共 4 文件 21 项通过；Desktop 构建通过。
- 本次源码 ESLint、依赖边界通过；新增 Market 基金公共估算禁止依赖 Ledger 的边界约束。
- 最初构建发现共享缓存参数与原估算数组重名、测试 fixture 的 `never` 类型访问，已修正并重跑。同步构建依赖前，工作区另一处交易图契约的 dist 未更新，Schema 构建后恢复。行情分页新增字段的 `unknown` 类型增加了字符串守卫，保留其他工作区改动。

## 当前切片目标运行态

在相邻 `thesis-ledger-infra` 执行 `./scripts/sync-code.sh thesis-ledger`，退出 0。Server、Backtest Worker 健康，镜像 ID 均仍为 `sha256:1654b11a1f4b39c94bfff670dec539b46e373af427cd8ea14c88da80a3622b45`，没有结构或 volume 变更。日志 `/tmp/fund-valuation-current-sync.log`。此结果不代表镜像更新。

生产 Web 预览使用 4183 端口连接该真实 API。真实响应显示“盘中估值—已休市”；受控响应显示 `1.0250`、`+2.50%`、低覆盖及实际估值日期、时间。1440、768、390 像素下移入/移出、锁定/解锁的图表、读数、弹窗和滚动几何保持；浏览器没有运行错误。脚本 `/tmp/fund-current-browser.mjs`，结果 `/tmp/fund-current-browser.json`。受控输入不证明在线盘中成功。

## 后续验收边界

分钟持久化与今日曲线已交付并通过下述本地验证；真实交易日及正式净值误差验证仍属于当前任务。


## 分钟事实与今日视图

`FundValuationPoint` 不关联个人账户，按完整基金代码、UTC 分钟和算法唯一。新 migration 只创建该表、索引并推进 SchemaVersion，不改写既有交易、账户或持仓。原子写入分别维护最新观察及最后有效观察：晚到旧结果不能覆盖较新的当前状态，晚到的有效事实可补足最后有效值；新失败保留曲线缺口，不抹掉先前有效值。今日查询按上海日期隔离，保留真实失败分钟，不补造漏采点。闭市读取沿用最后有效值的原时间，空库返回缺失。

既有账户采样和当前/今日请求可以记录真实观察，不新增任务类型或启用 Provider。当前严格估值先后复核已确认的 CNY 元数据；境外持仓缺少汇率回报证据时不贡献定价覆盖。原账户采样的历史允许陈旧语义保持。`000001.OF`、`161725.OF` 的目标库关联均为 confirmed / active / CNY。

今日视图使用真实估值分钟点和带日期的正式净值水平基准线；缺价、漏采和基准改变会断线。实际失败分钟只登记时间，不填价格，悬停该时点不借邻近值。响应校验基金、日期、时区、顺序、重复分钟及未来点。图例、读数保持精简，返回历史视图后保留原净值、盈亏及可视区间涨跌幅。自动刻度纳入正式净值基准，窄屏重排后显示完整今日范围。休市仍显示最后有效值的覆盖质量；缓存数据刷新失败时保留原数据并明确提示失败和重试。

## 最终局部验证

- Server 6 文件 60 项通过：共享估算、币种与身份、五分钟时效、零价、披露、复权、并发、闭市与公开仓储发布，以及原账户采样回归。命令为 `pnpm --filter @thesis-ledger/server exec vitest run test/market/market-fund-valuation.test.ts test/market/fund-nav-estimator.test.ts test/performance/valuation-series.test.ts test/performance/fund-adjusted-returns.test.ts test/performance/fund-minute-price-availability.test.ts test/performance/fund-disclosure-unknown.test.ts`。
- SDK 3 项通过：当前响应、取消/身份、不可用与今日跨日/重复/未来点拒绝。
- Web 相关 6 文件共 25 项通过。最终今日曲线、当前估值和分段投影子集 8 项复跑通过，其他未变断言复用前一轮证据；覆盖缺价、锁定解锁、缓存失败、休市低覆盖、基金切换及原行情详情。
- Schema、SDK、Server 与 Desktop 构建通过；最终修改源码 ESLint、依赖边界通过。新 Prisma 块单独核对，只保留本任务新增模型，其他既有 Schema 改动保留，未机械格式化。
- `pnpm exec node scripts/test-portfolio-valuation-postgres.mjs` 通过 3 文件 16 项，身份为 `portfolio_valuation_fixture / fixture_owner`，执行全部 37 个 migration，测试结束清理本次隔离容器。新增场景覆盖并发旧写、当日隔离、缺价、休市造点拒绝和失败后的最后有效值。
- `VERIFY_RUNTIME_DATABASE_INPUT=true pnpm exec node scripts/check-migration-matrix.mjs` 通过：37 个 migration、85 张 SQL 表、69 个 Prisma model、16 张 raw-owned 表；runtime package 的全部 SQL、Schema、清单与结构执行器一致。

## 保留数据升级与目标运行态

在 `thesis-ledger-infra` 执行：

```sh
DEV_DATABASE_MODE=upgrade DEV_DATABASE_CONFIRM=thesis-ledger-dev/thesis_ledger ./scripts/update.sh thesis-ledger
```

退出 0，目标为本地 `thesis-ledger-dev / thesis_ledger`，owner 为 `thesis_ledger`。没有使用重建或数据丢失开关。维护入口完成备份、恢复到隔离副本、增量演练、目标事务和结构/权限检查。证据目录 `thesis-ledger-infra/.database-upgrades/run.kjA8u3`，备份 5,334,273 字节；`rehearsal.json` 确认 `structureComplete`、`appRolePermissions`、`preservedData` 全为 true，从 `20261023010000_report_metadata_snapshots` 升至 `20261104010000_fund_intraday_valuation`。升级计划指纹为 `0c3b2790652a65d138b821ae48a5689bbfd0db13cfa13c127eabe0049494732f`。

独立只读检查确认 Server、Backtest Worker 健康，镜像均为 `sha256:5495bb265402d8d5ab2f738a9f2639927a9b94cf57c53c5f4444dbed907f6e3f`。目标 Schema head 正确，新表存在，app role 有 SELECT / INSERT / UPDATE 权限。当前表为零行，休市验证没有写入合成数据。现有“盘中估值采样”任务已启用、每分钟检查一次；没有修改任务开关或 Provider 配置。完整日志 `/tmp/fund-valuation-full-update.log`，临时日志之外的关键证据已在本文保留。

## 最终真实浏览器与证据区别

生产 Web 预览连接更新后的本地真实 API，当前与今日接口均返回 200。当前显示已休市，今日返回 `2026-11-05`、`Asia/Shanghai` 和空点列；三个视口均显示空状态，悬停、移出、返回历史视图无布局变化或运行错误。

另以明确受控的 2026-11-04 五分钟响应验证两段估值曲线、缺价分钟、正式净值基准、读数、锁定/解锁和完整窄屏范围；受控数据未进入 API 或数据库。最终脚本 `/tmp/fund-today-browser.mjs`，证据在 `/tmp/fund-today-browser/controlled.json`、`live.json` 与对应 1440/768/390 截图。真实空状态验证最初超时，定位为脚本 MutationObserver 未订阅 characterData，修正后通过；页面此前已正常显示空状态，没有将脚本问题当成来源失败。

## 尚未完成的总验收

G2.2仍开放：000001生产披露资格和现有HiThink最小可用性已通过；当前闭市，11-05真实分钟仍240个失败点，无有效估算。待下一真实交易时段至少两个有效分钟及同日正式净值公布后记录误差，161725-Q3仍需独立披露参考。盘后报价、披露匹配、受控输入和健康状态均不替代有效分钟。研究原价格门槛保持。最新执行、费用事实、正式维护入口、数据保全和回滚边界见顶部链接；不归档任务。


## 最终自审补充

开盘归属校验新增一项回归：开盘前报价即使在五分钟内，若交易归属仍为上一交易日，也不得计入当日当前估值。最终 Server 6 文件 60 项通过，Server 构建与该源码 ESLint 通过。通过维护入口 `./scripts/sync-code.sh thesis-ledger` 同步该修正，退出 0，Server/Worker 健康；没有结构或 volume 变化。日志 `/tmp/fund-valuation-session-final-sync.log`。基础镜像仍为上述 `5495bb...`；这项最终代码修正位于容器可写层，不作为不可变镜像包含修正的证明。

同步后独立请求再次确认当前接口 200 / closed / unavailable，今日接口 200 / 2026-11-05 / 0 点。旧 Performance helper 的活动源码、测试和脚本引用均已移除，边界、`git diff --check` 和站内链接核对通过。未提交、推送或发布；没有修改任务启用值。总验收仍仅剩 G2.2 的交易时段与正式净值误差证据，保留当前任务，不迁入 TODO 或归档。
