# 行情图表跨日更新、双向加载与盘中快照实施任务

> 任务标识：market-chart-refresh
> 日期：2026-09-17
> 状态：实施与运行验收进行中；T1 运行版本基线、T2 最新端和 T3 历史端本地闭环已完成。目标容器已与当前 Server 源码对齐，G1 的浏览器基础路径已复核；盘中 Provider 能力、真实失败重试与运行态乱序仍未完成
> 对应规格：[Spec](../specs/2026-09-17-market-chart-refresh.md)

## 执行边界

- 已开始实施 Desktop/Server 局部代码并曾通过快更执行在线刷新；任务勾选仍以各自完整完成条件和运行门禁为准。当前容器与工作区源码是否一致以 T1 记录的校验值为准。
- 保留已有代码和文档未提交改动，实施前记录主仓及涉及的相邻仓库基线；不自动提交、推送或清理数据。
- 复用现有 BarSeries V2 与详情接口。Desktop 负责请求、图表合并和展示；Server 负责显式刷新、窗口和指标输入；Provider 适配仍归 DSA，部署仍归 infra。
- 已过尺寸阈值的详情组件不能继续堆叠职责；最新请求编排和合并逻辑提取为有明确职责的 hook 或纯函数，不新增无所有权的通用目录。
- 既有图表 Task 的历史完成结论不证明本次新增行为。代码中已存在的部分也必须经本任务对应测试与门禁后才能验收。

## 实施任务

- [x] T1：建立复现证据与运行版本基线
  - 覆盖验收标准：AC1、AC2、AC4、AC8 的场景与证据前提。
  - 依赖：无。
  - 范围：当前 Desktop、Server、DSA 运行版本和现有边界请求链路，只收集状态与复现证据。
  - 完成条件：记录实际页面来源及应用版本对应关系；分别记录打开、最新边界和历史边界请求的参数、响应首末日、完成状态、section 状态及最终图表日期。将缺陷归入触发、参数、上游取数或合并展示，不能仅凭旧缓存推断根因。
  - 验证方式：浏览器 Network 与交互记录，配合必要的服务端日志；敏感头与凭证不进入证据。固定历史日期在隔离测试中复现，不修改用户数据或系统时钟。
  - 环境限制：若实际运行不可访问，保留 T1 未完成；T2–T4 可依据已核实的源码和稳定契约开展局部工作，不能因此跳过 G1。
  - 当前证据：2026-09-17，主仓基线 `8648d006895e175913db33d52e1f198fe534c96d`，工作区包含既有未提交图表与 Server 改动；`thesis-ledger-dev-thesis-ledger-1`、DSA、PostgreSQL、Redis 和 Worker 容器健康，`GET /api/v1/health` 返回应用版本 `0.1.0`、Schema `20260916100000_remove_legacy_market_bar`。
  - 运行态更新：2026-09-18（Asia/Shanghai），经用户确认将整个当前工作区执行 `../thesis-ledger-infra/scripts/sync-code.sh thesis-ledger`；宿主机构建通过，兼容性预检通过，Server 与 backtest-worker 可写层已替换并重启健康。两者镜像均保持 `sha256:08215d2296e25669a54355107615adf6b3cab573a13aae4281bdd0fcfc9fe90d`，脚本未修改数据库结构或外部卷。
  - 运行验收证据：2026-09-18 00:32–00:42（Asia/Shanghai），从当前工作区启动 Desktop Vite 页面 `http://127.0.0.1:5173/portfolio`。页面打开 510300.SH 详情后显示 K 线、MA、MACD、RSI，初始可见日期为 2026-05-14 至 2026-09-17，最新日为 2026-09-17；向更早方向移动后可见区间变为 2026-05-14 至 2026-08-17；普通/全屏切换、关闭后重开均成功。验收进程已停止，`127.0.0.1:5173` 不再监听；系统中另有既存 `::1:5173` 监听，来源未确认且未触碰。
  - 补充运行基线：2026-09-19（Asia/Shanghai）从当前未提交工作区启动独立 Vite 页面 `http://127.0.0.1:5174/portfolio`，打开 510300.SH 后可见日线区间为 2026-06-18 至 2026-09-18，最新日为 2026-09-18；K 线、MA、MACD、RSI 均渲染，浏览器控制台未记录 warning 或 error。页面实际调用的 Server 容器为 `thesis-ledger-dev-thesis-ledger-1`：镜像 `sha256:d0e91073cb1d1b5f3a6e4dbd00227d3be01a4df8ac4a017a16d4db09db3ea4e7`，启动时间 `2026-09-18T19:16:55Z`，health 为 healthy、应用版本 `0.1.0`、Schema `20260918153000_strategy_optimization_adoption_context`，数据库、Redis、DSA 均 healthy。
  - 请求与响应记录：同日对 510300.SH 执行实际 HTTP 请求。打开窗口为 `barsLimit=90&navLimit=90&refresh=1`，bars 为 ready、90 条（2026-05-15 至 2026-09-18）、最新条 complete、`tencent` 回源 miss；最新边界为 `start=2026-09-18&refresh=1`，bars 为 ready、1 条 2026-09-18 complete；历史边界为 `end=2026-06-18`，bars 为 ready、90 条（2026-01-30 至 2026-06-18）、`hasMoreBefore=true`。三次请求的 MA、MACD、RSI 均 ready，quote 为 stale；该状态与页面的日线和指标展示一致。
  - 版本差异：宿主机 `apps/server/src/market/market-bar-reader.ts` SHA-256 为 `b1433865a79855c8a9b0e848e2cd0f342a4f5bace1f1226efa2a47687eb86997`，容器 `/app/src/market/market-bar-reader.ts` 为 `ba9ef3129eb8f0fdc1c99231ee85228d2e7d0d62a0b0751fe5441a69ddf48d2c`。这已作为可追溯基线记录，不把当前工作区源码误称为已部署；G1 前须按 infra 更新入口重新对齐并复核。
  - 完成结论：完成。本任务只建立可复现的页面、请求、响应、section、图表日期及版本对应关系；失败重试、双向乱序和交易时段 Provider 能力分别继续由 T2、T3、T4 与 G1 验收，不是 T1 的遗漏。

- [x] T2：实现打开与最新边界更新闭环
  - 覆盖验收标准：AC1、AC2、AC3、AC5 的最新端断言、AC7。
  - 依赖：Spec 契约已就绪；T1 的可用证据在实施前纳入，运行环境缺失不阻塞定向测试。
  - 范围：详情查询、最新端请求编排、日期与指标合并、必要的 API 参数转发和指标窗口；不扩展通用 TTL 策略。
  - 完成条件：每次打开执行一次最新检查；最新边界以末日重叠请求；TanStack Query 管理请求，落实进行中保护、60 秒尝试冷却和显式重试。有效同日变化必须提交；旧响应与不可比指标不得污染新数据。历史窗口变化不取消无关最新请求。
  - 验证方式：组件交互测试验证挂载、缓存先显、请求参数、拖动、异步更新、同日修订、冷却、失败及卸载；API/Reader 定向集成证明 `refresh=1` 绕过三层读缓存并保留指标预热和显示投影。
  - 早期集成：在核心打开与最新端通过局部测试后，尽早验证一次实际 API → BarSeries/指标响应 → 图表更新，供 G1 复用有效证据，不等待盘中能力核查结束。
  - 实施进度：已实现打开时 `refresh=1` 最新检查、TanStack Query 右边界探测、共享进行中保护、60 秒尝试冷却、显式重试、按交易日接受同日修订、新响应优先合并、指标不可比时 fail-closed，以及卸载/参数变化/标的变化的迟到响应隔离。最新端编排已收敛到 `useMarketChartLatestRefresh.ts`、`useMarketChartLatestBoundary.ts` 与 `market-chart-refresh-lifecycle.ts`；`MarketDetailDialog.tsx` 降至 767 行，未继续增加存量文件尺寸债务。
  - 定向验证：通过；`rtk pnpm --filter @thesis-ledger/desktop exec vitest run src/features/market-detail`，17 个文件、67 个测试通过；覆盖真实挂载下的打开刷新、右端请求参数、冷却、显式重试、顺序响应覆盖与卸载后不提交。三个新增编排模块的定向 ESLint（`no-nested-ternary`、`complexity<=20`、`max-lines-per-function<=220`）通过；文件尺寸 ratchet 通过，仅报告与本任务无关的既存 warning。执行代理另行完成 Desktop typecheck/build、Server typecheck 和 `market-indicator-window` 9 个测试，均通过；build 仅有既有 chunk size warning。
  - 缓存绕过验证：通过；`pnpm --filter @thesis-ledger/server exec vitest run test/market-bar-series-v2.test.ts`，20 个测试通过。新增场景先以正常读取命中 Redis 并填充 Reader memory，再把 Redis 与 PostgreSQL 的 `read` mock 设为访问即失败；`refresh=true` 未访问两者、仍调用远端一次并使用新的 OHLC 返回 `cacheStatus=miss`。因此证明的是三层读缓存绕过与远端结果采用，不是对共享运行 Redis/PostgreSQL 的破坏性故障注入。
  - 证据边界：当前未提交工作区的客户端状态机、合并、指标窗口与 Server 刷新读缓存契约均已由定向测试证明；T1 的代表性 API → 图表链路可复用为早期集成证据。当前容器与工作区 Server 源码不一致，故这不构成已部署源码或 G1 的证明。
  - 运行验收证据：510300.SH 打开检查携带 `refresh=1`，返回 90 条 complete 日线，截止 2026-09-17；随后不带 refresh 的同口径请求返回 `servedFromCache=true`、`cacheStatus=memory`。`start=2026-09-17&refresh=1` 返回 1 条 2026-09-17 complete 日线，真实 UI 右端检查未改变最新日期；Server 日志显示 detail 请求 200，DSA bars 与 indicators calculate 均成功。
  - 完成结论：完成。组件交互回归覆盖失败重试、旧响应隔离与卸载；Reader 测试补齐三层读缓存绕过。真实浏览器中的失败重试和运行态乱序作为 G1 组合验收保留，不能反向否定本任务的本地完成。

- [x] T3：验证并修复历史边界与双向视图稳定
  - 覆盖验收标准：AC4、AC5 的历史端与双向竞态断言、AC7 的历史缓存回归。
  - 依赖：T2 的请求隔离及日期合并局部契约经测试确认。
  - 范围：历史分页、左右手势独立记账、覆盖声明、页面合并和视口锚点。
  - 完成条件：历史端使用有界窗口并复用缓存；同手势和加载中不重复请求；双向乱序返回均保留有效数据；历史端锚点和比例稳定，最新端只在用户仍贴边时跟随。失败、空响应及重复页不直接判定历史耗尽，并能手动重试。
  - 验证方式：定向手势与合并测试、真实组件异步测试，覆盖先左后右、先右后左、请求返回前用户离开最新边界以及历史结束声明。
  - 实施进度：已实现左右边界独立手势记账、历史空响应/重复页/无进展不误判耗尽、日期页合并、新端贴边时才跟随和不可比指标隔离。
  - 定向验证：通过；`pnpm --filter @thesis-ledger/desktop exec vitest run src/features/market-detail`，18 个文件、72 个测试通过。覆盖手势、视口、页合并和图表模型；新增 `market-chart-pages.test.ts` 明确验证历史页与最新页先左后右、先右后左的任意到达顺序都保留两侧日期和可比指标。
  - 运行验收证据：`end=2026-05-14` 返回 90 条 complete 日线（2025-12-24 至 2026-05-14），继续以 `end=2025-12-23` 请求返回 90 条（2025-08-12 至 2025-12-23），两次均声明 `hasMoreBefore=true`；DSA 日志确认两个带 `end` 的 bars 请求均为 200。真实 UI 可向历史方向移动并保留最新端数据。
  - 完成结论：完成。历史端局部状态机、页合并和视口边界已由定向测试覆盖；当前目标运行态的真实拖动、乱序 Network 与离开最新边界观察属于 G1 组合验收，仍保持未验证而非视为通过。

- [ ] T4：接收盘中日线快照并确认上游能力边界
  - 覆盖验收标准：AC3 的同日盘中修订、AC6、AC7 的能力矩阵回归。
  - 依赖：T2 同日替换和来源校验通过；Provider 能力核查可先开展。
  - 范围：既有 Provider 的日线响应核查、未收盘 bar 展示、盘中指标状态及降级文案；不新增分钟线或行情源。
  - 完成条件：使用真实盘中 bar 时显示“未收盘”，同日变化及收盘状态转换正确；没有当日 bar 时保留最近完整日线并说明截止日期。fixture 展示验证与在线 Provider 能力分别记录。
  - 条件分支：现有能力无法实施时，记录目标标的、Provider、限制原因和复现证据，在 `docs/TODO.md` 登记盘中日线快照后续项及启动/验收条件，区别于分钟线 backlog。该分支证明降级与范围处置，不证明盘中能力已通过。
  - 验证方式：同日两次快照、`incomplete → complete`、缺少当日 bar、指标不足、来源不一致的定向测试；交易时段可用时执行一次在线能力核查。核心跨日故障不能转入该 TODO 分支。
  - 实施进度：已支持同日 OHLC/成交量/指标/完成状态修订，并在 `completionStatus=incomplete` 时显示“未收盘（当日未完成）”；无更新反馈包含实际截止日期。
  - 定向验证：fixture/组件测试通过，证明展示和同日替换逻辑；未执行交易时段在线 Provider 核查。
  - 剩余条件：尚不知道股票、ETF 现有 Provider 是否返回真实盘中日线；未取得受限证据前不登记 TODO，也不宣称盘中能力通过，T4 保持未完成。
  - 在线核查：510300.SH 的现有 ETF Provider 返回截至 2026-09-17 的 complete 日线，未返回 2026-09-18 未收盘 bar；验收发生在 00:32–00:42，非交易时段，该结果不能证明或否定盘中快照能力。600519.SH bars 调用返回 `market_data_unavailable`，DSA 日志为上游 transient failure/503，不能归类为 capability unsupported。ETF `chip` 为 `unsupported/capability_unsupported`，与日线盘中能力无关。
  - 条件分支结论：本轮没有形成“现有 Provider 不支持盘中日线”的充分证据，不新增 TODO；需在真实交易时段重新核查股票与 ETF 的 incomplete bar。

- [ ] G1：完成目标运行态与浏览器验收
  - 覆盖验收标准：AC1–AC8 的产品组合行为与在线证据。
  - 依赖：T2、T3 局部验证通过；T4 已完成可用能力实现或有证据的降级/TODO 分支；T1 基线可追溯。
  - 前提：目标 Desktop、Server 与所需 DSA 版本一致，既有 Provider 配置可用；先完成必要包检查和仓库门禁。
  - 更新入口：仅应用源码变化且目标容器运行、兼容性预检通过时，使用 infra 的 `./scripts/sync-code.sh thesis-ledger`；DSA 同时改变时按实际范围选择最小目标。依赖或运行条件不满足时使用 `./scripts/update.sh [all|dsa|thesis-ledger]`，不绕过入口手工替换容器。
  - 完成条件：实际浏览器重新打开、拖动到最新端和历史端、失败重试及普通/全屏视图均符合 Spec；请求参数、响应首末日、日线和指标显示一致。在线上游无新数据时准确记录其能力，不伪造跨日成功证据。
  - 证据边界：固定 9 月 15 日 → 9 月 17 日场景由隔离测试证明；真实运行场景使用当时可用交易日并记录数据截止时间。核心更新未通过时保持 G1 未勾选；盘中能力按 T4 分支单独报告。
  - 当前状态：2026-09-19（Asia/Shanghai）完整更新成功后，Server 容器镜像为 `sha256:1082a559a7f364a9c525e689c74da0c1356a827b0f35d3fe2657cd8216d8e2c2`，启动时间 `2026-09-19T06:14:50Z`；`GET /api/v1/health` 返回 `status=healthy`、版本 `0.1.0`、Schema `20260918153000_strategy_optimization_adoption_context`，数据库、Redis、DSA 依赖均健康。宿主机与容器的 `apps/server/src/market/market-bar-reader.ts` SHA-256 均为 `b1433865a79855c8a9b0e848e2cd0f342a4f5bace1f1226efa2a47687eb86997`，T1 记录的源码不一致已解除；当前源码页面及目标 API 的代表性打开、最新/历史边界可复用。失败重试、双向乱序和在线 Provider 验收仍待在该已对齐环境完成，G1 保持未完成。
  - 部署记录：检测到 `apps/server/package.json` 与 `pnpm-lock.yaml` 已变化后，按规则使用 `../thesis-ledger-infra/scripts/update.sh thesis-ledger`，而非快更。早先两次构建在镜像内 `pnpm install --frozen-lockfile` 出现 npm 镜像 `ETIMEDOUT`/error 23；随后用户完成同一完整更新入口，上述新镜像、启动时间、健康状态和源码校验值已直接复核。
  - 浏览器复核：2026-09-19（Asia/Shanghai），从当前未提交工作区启动独立 Vite `http://127.0.0.1:5176/portfolio`，以 510300.SH 执行真实页面交互。打开详情后，日线为 2026-06-18 至 2026-09-18、最新日 2026-09-18，K 线、MA、MACD、RSI 均渲染；“查看更早日期”将可视末日移至 2026-08-27，随后“查看更晚日期”与“回到最新”恢复 2026-09-18；普通/全屏/退出全屏、关闭并重新打开均成功。重开显示上游约 10 分钟刷新间隔提示，日线和指标仍完整可用。浏览器控制台 warning/error 为零。相同容器接口的 `barsLimit=90&navLimit=90&refresh=1` 返回 90 条日线，coverage 为 2026-05-15 至 2026-09-18、`latestCompleteTradingDate=2026-09-18`、`hasMoreBefore=true`，与页面的最新日一致。
  - 本轮结论：部分通过。当前已对齐容器上的打开、前后移动、回到最新、普通/全屏和重开路径通过，日线与技术指标显示和当前接口截止日一致。未在浏览器中人为破坏 Redis/PostgreSQL 或 Provider 以制造失败重试；也没有可控地制造真实网络双向乱序。当前为非交易时段，未验证股票和 ETF 的 incomplete 盘中日线。因此 T4 与 G1 均保持未勾选。

## 验收责任映射

| 验收断言 | 实现与局部验证 | 产品验收 |
| --- | --- | --- |
| AC1：跨日重新打开更新 | T2 | T1 基线、G1 |
| AC2：最新边界请求及冷却 | T2 | G1 |
| AC3：同日内容和完成状态替换 | T2；盘中部分由 T4 | G1 |
| AC4：历史与双向乱序、视口稳定 | T3 | G1 |
| AC5：失败、缺失与过期响应隔离 | T2 最新端、T3 历史端 | G1 |
| AC6：盘中展示或有证据的降级 | T4 | G1 分别报告能力结果 |
| AC7：刷新/预热契约与回归边界 | T2、T3、T4 各自范围 | G1 |
| AC8：当前版本真实链路证据 | T1 版本基线、T2–T4 检查 | G1 |

## 验证顺序与证据记录

1. 先跑变更对应的手势、日期合并、详情交互、指标窗口和 Reader 定向测试。优先复用现有 `market-detail`、`market-bar-series-v2` 与 `market-indicator-window` 测试入口；静态渲染不替代交互。
2. 定向验证通过后，执行受影响包的测试、typecheck、lint 与 build；如 DSA 未修改，不执行无关全量 DSA 测试。
3. 通过相关仓库门禁、文档检查与 `git diff --check`；输入不变时复用已通过的高成本检查。
4. 完成 G1 的代码同步或镜像更新，再做真实浏览器与 Provider 验收。快更只能证明容器可写层运行版本，不宣称镜像已更新。

实施时每项证据记录命令或操作、输入文件范围/版本、环境、结果和引用位置。当前已完成局部测试、build/typecheck、容器快更及部分真实 UI/API 验收；完整 G1 与盘中能力门禁仍按上述状态保留。

## 规划审查

- 结论：方案可实施，带明确的运行环境与盘中能力核查前提。
- 已确认需求：打开与最新端都更新、历史端加载检查、交互时盘中快照、盘中能力受限可记录 TODO。
- 已明确契约：复用 `refresh=1` 与 BarSeries V2；日期未增加不阻止内容更新；双向状态隔离；历史缓存保持原策略。
- 未决产品决策：无。待核查的是实际运行版本、故障位置和 Provider 能力，分别由 T1、T4 负责。
- 本次交付边界：中文 Spec/Task、关联规格条款与导航同步；不代表 T1–T4 或 G1 已完成。
- 文档验证：2026-09-17，检查本次涉及的 6 份文档，本地链接无缺失，AC1–AC8 均有责任映射，实现任务无提前勾选；`git diff --check` 通过。检查不构成代码或运行态证据。

## 最终一致性 Review

- [ ] Spec 的全部验收断言有对应实现和充分证据
- [ ] T1–T4 满足各自完成条件，条件性盘中能力结果如实记录
- [ ] 核心浏览器与当前运行态 G1 通过，未用 fixture 替代在线证据
- [ ] 打开、最新端、历史端及指标窗口的参数、取消、合并和状态一致
- [ ] 现有用户修改保留，无范围外迁移、Provider 扩展或数据清理
- [ ] 关联文档、验收状态和 TODO 边界一致，历史完成结论未被误用
- [ ] 验证命令、输入范围、版本、结果和剩余风险可追溯

### Review 结论

- 结论：T1 运行版本基线、T2 最新端、T3 历史端本地闭环、局部实现审查与目标容器浏览器基础路径验收通过；功能整体验收仍阻塞于交易时段盘中 Provider 证据、真实浏览器失败重试和双向运行态乱序，不构成发布或在线能力完成。
- 已确认的问题及责任任务：父级审查发现并修复 opening/latest 并发与冷却、latest 页新旧优先级、卸载后 opening/latest/分段重试迟到提交，以及大组件职责继续增长；最新端状态机已抽取为有明确所有权的 hook/lifecycle 模块，对应定向回归与新增模块复杂度门禁已通过。
- 尚未通过的必要门禁与阻塞原因：完整镜像更新已由用户完成，容器源码对齐已复核；当前为非交易时段，无法验收 incomplete 盘中日线。真实浏览器失败重试与双向乱序尚未以目标运行态复核。
- 遗留风险：历史双向乱序和离端后的视口稳定、在线未收盘能力仍需目标运行态证据；600519.SH 当前为上游 transient failure，不能用于能力结论。
- 验证命令/过程、结果与证据引用：`rtk pnpm --filter @thesis-ledger/desktop exec vitest run src/features/market-detail`（17 个文件、67 个测试通过）；新增编排模块定向 ESLint 与 `node scripts/check-file-size-guardrails.mjs` 通过；执行代理报告 Desktop typecheck/build、Server typecheck、`market-indicator-window` 9 个测试通过；`../thesis-ledger-infra/scripts/sync-code.sh thesis-ledger` 成功并保持镜像 ID 不变；当前源码 Vite 页面完成 510300.SH 打开、历史/最新方向、全屏与重开检查；Server/DSA 日志复核 detail、bars、indicators 和两个历史 `end` 请求；容器状态与 `GET /api/v1/health` 正常；最终 `git diff --check` 通过。所有结果对应当前未提交工作区与本次容器可写层。
