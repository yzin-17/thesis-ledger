# 组合估值可用性实施与验收证据

## 基线与根因

2026-11-04，在主工作区既有未提交修改上实施，未重置、暂存、提交或推送。策略修订 183 已生效、总开关开启，但 83 条路由均未选择场外基金 FUND_NAV / FUND_NAV_HISTORY。只读控制上下文分别返回 ready=false、reason=not_selected。

原 MarketCacheControl 丢弃该原因，统一抛出“当前功能未启用或来源不可用”；组合估值捕获异常后将无价格结果标成 stale=true；桌面把 partial 直接展示成“数据可能陈旧”，反而漏报 partial=false 的真实旧价格。移动端卡片也把缺价格等同于陈旧。valuedAt 是计算时间，却标成“数据时点”。因此重新加载不会修复缺失路由，也不会消除错误提示语义。

## 实现边界与写集

- MarketCacheControl 通过既有 DsaError.sourceReason 保留 disabled / not_selected / not_eligible；不引入反向 feature 依赖。
- portfolio-position-valuation 将失败保留为价格、市值、收益 null，stale=false，附 availabilityReason；有效旧值继续 stale=true。基金返回真实 navDate。PortfolioService 仅对缺失代码去重，汇总与成本算法保持。
- schemas/api 增加可选原因枚举与 navDate，兼容旧响应。
- packages/domain/valuation-display 拥有跨客户端的纯展示投影 portfolioValuationNotice、valuationPositionLabel，消费估值结果，不读取网络、来源配置、数据库或快照。两端均已有 domain 依赖，无 package manifest、锁文件、原生依赖或数据库结构变化。check-boundaries 同步维护该模块不得反向依赖应用和 API Client 的约束。
- Desktop 的 portfolio.api 保留新增字段，查询使用公共状态判断，PortfolioDashboard 覆盖现有 DataStateBanner 的标题和说明，PortfolioOverview 显示真实状态及净值日期。DataStateBanner 仅增加可选标题属性，其他消费者保持原默认文案。
- Mobile 的 query-state、PortfolioScreen、MobilePortfolioScreen、AccountWorkspace 消费公共投影。净值信息复用卡片正文样式；AGENTS.md 增加估值状态规范。
- 回归覆盖位于 Server portfolio/valuation-availability、services，domain/valuation-display，schemas/portfolio-availability，Desktop portfolio-closed-dashboard、portfolio-table、portfolio-valuation.api，Mobile parity/m07。完整增量来源 SHA-256 保存在忽略目录 source-provenance.json。

## 配置与真实数据

通过公开 API 读取策略、来源配置和路由目录，确认 AKShare、efinance 均已配置、已启用、免凭证，且两条能力均在目录标记 ready。选择 AKShare / eastmoney，仅以 expectedRevision=183、revision=184 保存追加两条路由，返回 applied、85 条、effectiveStale=false。最终再次核对：原 83 条逐项相等，总开关不变，完整来源配置数组与基线相等，没有保存或清理任何凭证。

实际请求：`GET /api/market/000001.OF/fund-nav`、`GET /api/market/000001.OF/fund-nav/history?limit=2`、`GET /api/v1/portfolio/valuation?mode=actual`。返回来源 akshare，当前净值 0.895、navDate=2026-11-03、freshness=delayed；历史含 11 月 2 日 0.939 和 11 月 3 日 0.895。API 允许按既有规则命中缓存，未强制每次穿透来源；目录 ready 本身未作为数据成功证据。

两条原持仓仍为华夏成长混合 / 000001.OF、数量各 90；估值各 80.55，前收 0.939，组合 dailyChange.pnl=-7.92，partial=false、missingSymbols=[]、missingCurrencies=[]，各持仓 stale=false。原持仓精确成本不回填。历史接口沿用现有行情缓存及 FundNavPoint 持久化；业务历史快照未更新。

## 确定性检查

所有 pnpm 命令使用本机已有 Node 26.13.0，npm registry 使用 npmmirror，未变更依赖。主要命令及结果：

| 检查 | 结果与覆盖 |
| --- | --- |
| Server `vitest run test/portfolio/valuation-availability.test.ts test/portfolio/services.test.ts test/market/market-cache-control.test.ts` | 23 项通过，含 6 项新增可用性测试；验证控制原因、未知错误、真实旧值、正常延迟净值和金额 |
| domain `pnpm test` | 51 文件、462 项通过，含 7 项新展示语义回归 |
| schemas `pnpm test` | 121 文件、1445 项通过，3 项跳过；新字段及未知原因拒绝测试通过 |
| API Client `pnpm test` | 31 文件、185 项通过，更新 Schema 后重新构建生成声明 |
| Mobile `pnpm test` | 41 文件、161 项通过；最终布局调整后重跑当前 m07 的 7 项，另自动匹配 6 份旧验收副本，总输出 25 项，未把这些副本当新增覆盖 |
| Desktop 组合页面、表格、查询定向测试 | 30 项通过；新增归一化保留原因及日期测试另 1 项通过 |
| Server 包级 `pnpm test` | 首轮 3733 项通过、1 项失败、364 项跳过；失败为无关 basic-lifecycle-snapshot-v3 的 5 秒并发超时及随后的 WASM 错误；停止其他重负载后该文件原配置单独复验 4 项通过，813ms，未提高超时或修改其源码；未把首轮写成全绿 |
| Server build、Desktop build、Mobile typecheck | 通过；domain、schemas、API Client 构建通过。Mobile 最终正文调整后类型复验通过 |
| boundaries、workspace dependencies、guardrails:complexity | 通过；保留现有复杂度及尺寸警告，无提高阈值或增加 ignore |
| 增量 ESLint / diff | 22 个 TS 文件 0 errors / 0 warnings；React Native 依赖 Flow 解析诊断保留。相关已跟踪文件 git diff --check 通过 |

早期 Mobile 类型检查暴露精确可选字段与未重建 API Client 声明的问题，已修正字段并重建 API Client。只读数据库摘要首次使用通用 id 排序不适用于 Asset，改用任务前原查询（整行 JSONB 文本排序、竖线拼接）核对成功，没有执行写 SQL。

## 目标运行态

在相邻 thesis-ledger-infra 执行 `./scripts/sync-code.sh thesis-ledger`，执行目录 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`；参数仅 thesis-ledger，Node 26.13.0、COREPACK_NPM_REGISTRY / pnpm_config_registry / npm_config_registry 均为 npmmirror。兼容性预检和脚本通过，退出 0。Server、backtest-worker 独立健康检查通过，镜像保持 `sha256:1654b11a1f4b39c94bfff670dec539b46e373af427cd8ea14c88da80a3622b45`。这是可写层代码更新，容器重建会消失，不是正式镜像发布。

## 真实页面与原生检查

Desktop 访问既有 `http://localhost:5173/portfolio`，连接上述目标 API。实际页面显示基金名称、价格、市值与净值日期，无陈旧提示。其余 7 个场景通过浏览器隔离估值响应，覆盖 not_selected、disabled、not_eligible、unavailable、partial=false 的旧价格、缺汇率与缺前收，均有正确标题和说明，0 页面错误、0 业务写请求。没有为故障注入改动真实策略。3000 是 API 入口，不提供 /portfolio 静态页面，探索该地址返回 404，未作为产品页面验收。

Android 17 emulator-5554、iPhone Air iOS 26.5（23AB3E1A-4C30-462C-943C-B9CB5B894E96）均复用现存 Debug 宿主，清 Metro 缓存加载当前 JS。真实原生页面断言基金名称、净值 2026-11-03、单位净值 0.895、市值 80.55，以及没有估值不完整或行情陈旧。Android UIAutomator 通过；iOS 最终 XCTest 1 项、0 失败、13.742 秒，仅编译独立测试 runner。

首轮 Android 价格在视口下方，调整验收滚动后通过；首次 iOS only-testing 使用错 target，在检查 scheme 后修正为 ParityAcceptanceUITests。初轮两端文本断言虽通过，截图发现把净值放在卡片标题行会横向溢出；改到既有正文样式后，两端重新运行并人工查看最终截图，名称、日期、净值和市值均清晰可见。没有把首次截图作为最终通过证据。

本次不涉及原生依赖和工程配置，未重新构建或安装产品 APK/IPA；两端检查是实际原生运行当前 JS 的证据，不扩大为发布包编译或真机矩阵验收。

原始脚本、日志、策略前后响应、来源摘要、XCTest 结果均保存在忽略目录 `.recovery-artifacts/fund-nav-availability-20261104/`。截图、XML、iOS 界面树与 JSON 报告：

`/Users/yzin/.codex/visualizations/2026/11/04/01a1a528-98ca-7b12-98e8-3a004d9f64fc/portfolio-valuation-availability/`

## 数据保护、清理与最终结论

使用只读事务按整行 JSONB 文本排序、竖线拼接后 MD5，对比此前名称与原生任务结束时摘要，以下七类业务表行数和整表内容完全一致：Asset 4、LedgerEvent 138、Trade 20、JournalReviewSnapshot 4、RecurringFundInvestmentOccurrence 2、NotificationDelivery 2、AiRun 26。因此 Asset 原名称、精确成本、交易和历史冻结结果均未回填。

本轮 Metro 已停止，独立 iOS 测试 runner 和 Android 临时 XML 已移除；原应用、连接地址、已有 Vite、ADB 配置和两个已启动模拟器保持。未执行模型生成、通知投递或交易写入。

AC1–AC5 均有对应实现与证据。当前无未解决的本任务验收门禁；静态检查、目标 API、浏览器故障响应与原生运行证据分别记录，未相互替代。
