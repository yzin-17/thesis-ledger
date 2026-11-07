# 自选走势、刷新与运行态验收

关联：[规格](../specs/2026-11-07-watchlist-trends-refresh.md)、[任务](../tasks/2026-11-07-watchlist-trends-refresh.md)。本轮保留共享工作区既有修改，未提交。

## 实施结果

- Desktop 自选加入分时/近20交易日切换、可点击迷你图、日内高低价位置、振幅、来源及图表截止时间；基金读取近20期正式净值。报价和图表时间分开，禁止把读取时间作为行情时间。
- TanStack Query 管理请求、缓存、失败和取消。只为当前可见行请求图表；分时先读取现有 chart-options 资格，未准入时不请求行情。通过资格时仅 include=bars，基金仅 fund-nav-history，不额外获取指标。
- 分时以60秒为检查周期，报价采用服务端最小间隔；后台/不可见行暂停。返回可见页面时按 staleTime 补查。休市报价有最近时段覆盖证据时等待下一交易时段；未知日历5分钟降频、缺下一边界6小时复查。ETF报价继续遵守共享600秒窗口。基金/日线30分钟检查缓存与新数据。
- Server watchlist-price 合同可选增加 minRefreshSeconds、quoteContext.nextBoundaryAt；日历读取向前覆盖14日，按市场时区与经过验证的Session返回边界，未修改日历事实或原始报价质量。
- 同范围手动刷新保留原行/曲线；加载圈等待报价和图表最后一个请求结束；单项错误保留原数据与错误。保留名称无下划线、分组栏无贯穿分隔线。

## 验证

- Desktop定向8项通过：周期数据选择、缺分钟断线、平盘、净值日期、60秒及600秒节奏、休市开市边界、可见行/后台、失败保留及取消。
- Server自选定向7项通过，包含下次开市边界。
- Desktop最终全包234文件/1335项通过：`NODE_OPTIONS=--no-experimental-webstorage pnpm --filter @thesis-ledger/desktop test`，日志 `/tmp/watchlist-trends-desktop-complete.log`。使用该选项避免宿主Node26实验localStorage影响jsdom，不改项目依赖或Node要求。
- Server全包498文件通过/89文件跳过，3930项通过/399跳过：`pnpm --filter @thesis-ledger/server test`，`/tmp/watchlist-trends-server-full.log`。本地端口集成测试使用授权执行权限。
- Schemas全包1467项通过/3跳过：`pnpm --filter @thesis-ledger/schemas test`，`/tmp/watchlist-trends-schemas-full.log`。
- Desktop生产构建通过（既有大chunk警告）；Server构建及同步入口重建通过。最终前端构建 `/tmp/watchlist-trends-gate-build.log`。
- 定向ESLint、Import boundaries、8包依赖图、文件尺寸ratchet、diff空白检查通过。尺寸门禁6项既有债务警告，未新增增长。宿主Volta缺少匹配Node24时，门禁脚本使用已安装Codex Node绝对路径执行；未下载或修改版本配置。

## 实际浏览器

使用现有Vite `http://127.0.0.1:5173/watchlist` 与无头Chromium；实际名单/名称读取，本轮禁止业务写入与未许可来源调用。

1. 受控完整报价/走势资格/曲线合同：1440、1024、768、390宽度均无整页横向溢出，名称无下划线，日内区间存在，分时及近20日切换成功；只请求bars，不含指标；手工刷新先结束报价、后结束图表时加载圈持续到最后；无pageerror。脚本 `/tmp/watchlist-trends-browser.cjs`，结构化结果 `/tmp/watchlist-trends-browser.json`，截图 `/tmp/watchlist-trends-{width}.png`。桌面和窄屏人工查看。曾发现共享Button将svg缩成图标，已使用局部size类修正，重新截图核验。
2. 真实来源资格HTTP + Redis已有原始报价 + 已部署模块实际日历投影：页面显示“休市 · 最近时段快照”“报价请求间隔至少10分钟”“未配置分时来源，可切换近20交易日”。本轮未重新请求该报价，价格接口用已读取缓存回放；不能把它写成实时价格HTTP正向验收。图表资格来自实际Server HTTP，拦截所有行情获取，sourceFetches=0。证据 `/tmp/watchlist-trends-runtime-browser.json`、`/tmp/watchlist-trends-runtime-1440.png`。

首次受控图表资格样本缺少完整三种复权选项，合同正确拒绝；修正测试样本后通过。未放宽生产合同。一次本地测试在并行编译期间使用旧fixture/刷新间隔失败，更新fixture并完成最终全包1335项通过，未忽略失败用例。

## 目标运行态

执行目录 `../thesis-ledger-infra`，正式入口 `./scripts/sync-code.sh thesis-ledger`，PATH仅前置现有Codex Node运行时。退出0；日志 `/tmp/watchlist-trends-sync.log`。兼容性预检通过，Server/Worker当前代码重建并同步，目标容器重启后健康。没有数据库结构、卷或DSA改动。镜像ID保持不变（仅容器可写层更新，重建会恢复镜像内容），前端使用现有Vite源码及已验证生产构建，不宣称发布新镜像。

独立核验：`GET /api/v1/health` healthy，database/redis/dsa健康；`/proc/1/cmdline` 为 `node apps/server/dist/src/main.js`。首次验证使用旧路径 `/app/dist` 未找到新增模块，改为脚本实际同步并启动的 `/app/apps/server/dist` 后通过。

只读Redis已有510300.SH报价：4.124，marketTime=2026-11-06T08:14:52Z，fetchedAt=2026-11-06T19:21:17.826956Z。目标容器已部署WatchlistQuoteContext + MarketPeriodCalendarReader通过DSA本地日历返回：session=closed_snapshot，nextBoundaryAt=2026-11-09T01:30:00Z（北京时间11月9日09:30），保留calendarRevision。证据 `/tmp/watchlist-trends-runtime-context.json`。没有请求外部报价；此来源快照不是官方收盘价。

## 尚未完成的来源条件

**当前510300.SH实际分钟级行情没有实现，不将页面每分钟检查当成来源每分钟更新。**

- DSA `thesis_ledger_control.py` 中持久来源预算硬下限600秒，前台、失败和后台风险扫描共用。`background_quote` 合同同样声明600秒；本轮不改共享预算。
- 实际 `GET /api/market/510300.SH/chart-options?timeframe=1m`：none=false，reason=route_not_configured。证据 `/tmp/watchlist-trends-minute-options.json`。第一次带不完整规划参数barsLimit的请求400，按现有客户端getChartOptions协议重读成功。
- 只读现有适配器：Tencent manifest仅提供DAILY_BAR和ETF REALTIME_QUOTE；目前MINUTE_BAR精确绑定来自Futu，范围HK/US股票与ETF，不能把港美资格套用到中国ETF。
- 尚缺可用且获准的中国ETF分时适配与分钟报价请求预算。未改路由、密钥、购买权益、调用受限来源或使用报价伪造分时。真实分钟流与报价/分时同步的交易时段正向验收保留未完成。


## 来源最小周期修订（用户后续要求）

本节取代上文固定60秒目标的客户端实施描述。新增 `watchlist-source-cadence.ts`，从已有完整来源能力目录按本次实际返回的provider/upstreamSource、市场、资产类型匹配ready原生bar能力，并检查已声明账户资格有效性。当前协议原生周期仅1m/1d；派生5m等不当作原始来源粒度，跨市场、跨上游和身份不完整均不推断。

这是按用户指定最小周期制定的**检查策略**，不是对供应商真实报价更新频率的认证。报价检查间隔取该基准与Server请求下限较大值；图表按自己的实际来源计算，不套用报价的来源。不同标的分别记录检查时间，只把到期子集送入原批量报价接口；手动刷新读取显式集合并等待名单、报价、可见图表和能力目录结束。目录错误/不完整或周期未知时自动行情检查暂停；本地能力目录60秒复查用于恢复，不调用市场Provider。休市保留交易日历边界逻辑；过期边界和失败时间有退避，避免1秒错误重试。

只读实际 `/api/market-data/routes/capabilities?contractVersion=3`，status=complete；腾讯CN ETF已接入ready原生bar仅1d（none/qfq/hfq），没有1m。截图显示“检查基准：来源日线”。因此不声称腾讯服务本身只支持日线，只陈述当前项目接入的能力。分时路由仍未配置，未改预算、路由或密钥，也未新增Provider读取。

验证：

- Desktop定向共10项通过；增加精确来源/上游/市场匹配、目录不完整/资格未知、请求下限、到期子集批量、慢来源不跟随快来源、来源变化重算、休市及过去边界退避。
- 最终Desktop全包235文件/1339项通过，`/tmp/watchlist-cadence-final-full.log`；生产build通过（既有chunk警告），`/tmp/watchlist-cadence-final-build.log`。
- ESLint、Import boundaries、8包依赖图及尺寸ratchet通过，6项既有债务警告，无新增增长；`/tmp/watchlist-cadence-final-lint.log`、`/tmp/watchlist-cadence-boundaries.log`、`/tmp/watchlist-cadence-size.log`。未改Server、schemas或Mobile，所以不重复它们的已通过包级检查。
- 受控完整曲线/资格/能力目录的1440/1024/768/390实际浏览器通过，无整页横向溢出、无下划线、无pageerror，手动刷新等待最后图表结束，1分钟图表来源与日线报价来源分别显示周期；`/tmp/watchlist-cadence-browser.json`、`/tmp/watchlist-cadence-{width}.png`。桌面/窄屏截图人工查看。
- 真实来源能力目录和真实分时资格HTTP，搭配此前只读缓存及部署日历投影，页面真实来源标签通过，`sourceFetches=0`；`/tmp/watchlist-cadence-runtime-browser.json`、`/tmp/watchlist-cadence-runtime-1440.png`。报价回放与来源HTTP的界限保持，上述截图不冒充实时行情正向验收。
- 本轮只有Desktop源码与文档变化；现有Vite页面已消费，生产构建已验证，无Server/DSA变更，不重复Docker同步，不宣称新镜像发布。
