# 组合估值按需查询与 ETF 行情上游保护实施任务

对应 Spec：[`../specs/2026-09-14-portfolio-valuation-demand-guard.md`](../specs/2026-09-14-portfolio-valuation-demand-guard.md)

> 任务标识：`PORTFOLIO-VALUATION-DEMAND-GUARD-V1`
> 状态：T1、T2、I1、T3、I2、T4 完成（最终一致性 Review 仍有非阻塞提交范围问题）

## 执行约束

- 本任务涉及 `daily-stock-analysis`、`thesis-ledger`、`thesis-ledger-infra` 与 Desktop，遵循“一次只完成一个任务”；当前推荐依次执行 T1、T2、I1、T3、I2。
- 不得通过高频预热、提高重试次数、放宽全市场 fallback 或删除缓存解决延迟。
- 如果确认当前依赖和目标运行态无法提供 ETF 单标的 Quote，立即停止 T1/I1 并向用户请示；不得自行恢复全市场 fallback、接入新 Provider 或改变 fail-closed 语义。
- 所有 Provider 真实请求保持受控最小次数；不得用压力测试验证第三方限流。
- 保留当前用户已有未提交修改，不清理、不暂存、不提交、不覆盖账户永久删除及其他在途工作。
- 验证依次执行定向测试、包级检查、仓库门禁、目标 Docker、浏览器；低层级失败时不提前运行高成本门禁。
- DSA、Server、Desktop 的本地完成不能替代 I1/I2；两个运行态门禁未通过前，功能状态保持未完成。

## 实施前基线

- 2026-09-14 目标开发运行态：`GET /api/v1/portfolio/valuation` 为 23.286 秒；对应 AKShare `fund_etf_spot_em()` 拉取 1611 只 ETF，耗时 20.18 秒。
- 同一时刻有两条相同耗时的 valuation 请求；后续缓存命中请求为毫秒级。
- Server 实时 Quote fresh TTL 为 15 秒、last-valid 为 24 小时；分布式锁租约为 6 秒，等待后会无条件执行上游工作。
- DSA AKShare ETF 全市场缓存为进程内 1200 秒；efinance 单标的/ETF 全市场缓存为进程内 600 秒。
- `/accounts` 当前同时挂载 all-account 和 selected-account valuation；持仓保存存在 portfolio root invalidation 与 `onSaved -> refresh()` 叠加。
- 实施 T1 前再次只读确认 DSA Effective Policy、依赖版本、目标 Compose 单 DSA 拓扑和相关工作树状态；事实变化时先更新 Spec/Task。

## 任务

- [x] T1：收敛 DSA ETF 单标的执行与持久请求预算
  - 覆盖验收标准：AC1、AC2、AC3、AC5、AC10
  - 依赖：无
  - 涉及范围：`daily-stock-analysis` 的 ThesisLedger Provider runtime、Provider capability/Effective Policy、AKShare/efinance ETF Adapter、DSA 自有请求资格持久状态、熔断/限流和对应测试；主仓只同步必要的跨仓契约说明。
  - 不包含：全市场定时任务、批量行情系统、Server Redis 锁、Desktop 查询改动、其他 asset type 的 Provider 重构。
  - 完成条件：Data Contract 单 ETF Quote 只执行单标的 Adapter；AKShare 全市场路径与 efinance 全市场 fallback 不可从该入口到达；默认 600 秒请求资格跨 DSA 重启保留；每个 Provider 每个 ETF 单标逻辑请求最多一次上游调用；失败保持结构化 unavailable/provenance。
  - 停止条件：若当前依赖中的候选 Provider 经代码、契约测试和受控运行态验证后均不能提供 ETF 单标的 Quote，记录已验证范围和失败证据，保持 T1 未勾选并向用户请示后续路线；不得转入全市场 fallback 或擅自新增 Provider。
  - 验证方式：DSA Provider runtime、efinance、Control/Data Contract 定向 pytest；持久状态重开测试；通过单标的与 universe mock Adapter 的调用计数断言所有成功、失败和 fallback 场景的 universe 调用次数恒为 0；Python 编译检查。
  - 验证证据：
    - DSA `efinance` 新增严格单标入口，ETF snapshot 为空或抛错时均不调用全市场 helper；AKShare 从 `REALTIME_QUOTE / ETF` Effective Policy 排除，Desired Policy 与降级原因保留。
    - DSA SQLite 以 `provider + capability + instrumentType + symbol` 原子登记 600 秒请求资格；两个独立 store/连接并发领取同一键时恰好一个成功，重开 store 后冷却仍生效。
    - 命令 `.venv/bin/python -m pytest -q tests/test_thesis_ledger_request_budget.py tests/test_thesis_ledger_provider_runtime.py tests/test_efinance_realtime_quote.py tests/test_thesis_ledger_control.py tests/test_thesis_ledger_contract.py tests/test_thesis_ledger_data_gateway.py`：75 passed。
    - 命令 `.venv/bin/python -m py_compile data_provider/efinance_fetcher.py src/services/thesis_ledger_control.py src/services/thesis_ledger_provider_runtime.py tests/test_efinance_realtime_quote.py tests/test_thesis_ledger_provider_runtime.py tests/test_thesis_ledger_request_budget.py` 与 DSA `git diff --check` 通过。
    - 证据边界：未执行真实 Provider、网络、Docker 或 DSA 进程重启；当前仅完成 T1 的本地确定性实现，目标运行态由 I1 验收。

- [x] T2：修复 Server Quote 并发锁、超时重放与阶段可观察性
  - 覆盖验收标准：AC3、AC4、AC5、AC8
  - 依赖：T1
  - 涉及范围：`MarketService`、`DsaClient` Quote 调用、Redis 锁/等待策略、last-valid fallback、Portfolio 估值阶段计时及 Server 定向测试。
  - 不包含：改变 15 秒 fresh/24 小时 last-valid 时间窗、Portfolio 业务口径、FX 持久缓存、Ledger/realized PnL 性能重构。
  - 完成条件：锁租约覆盖 DSA Quote 超时预算或可靠续租；等待者在 owner 完成后重读缓存且不盲目调用 DSA；Quote 超时不自动重放；fresh/stale/unavailable 保持真实；单 trace 能区分 Portfolio、锁、DSA 和 fallback 耗时。
  - 验证方式：Server MarketService/Portfolio 定向测试；两个 MarketService 实例共享 Redis fake/测试实例的并发场景；超过旧 6 秒租约的受控慢 DSA fake；超时后 DSA 调用次数、last-valid 和日志字段断言；包级 typecheck。
  - 当前状态：Quote 锁、失败收敛、阶段日志、跨服务 trace header、定向测试、包级 `typecheck/build` 与目标运行态复验均已完成。
  - 验证证据：
    - Quote 读取已提取到 `MarketQuoteReader`：锁租约按 `DsaClient.timeoutMs + 5000ms` 推导；等待者仅轮询并重读 fresh/last-valid cache，租约结束后也不接管 DSA；Redis 锁能力缺失或异常时 fail-closed 到 fresh、last-valid 或 unavailable。
    - DSA Quote 显式使用单次尝试；同进程 single-flight 与跨实例 Redis 锁共同合并并发；fresh/last-valid 仅在 JSON 解析和 Schema 校验成功后记录命中；结构化日志覆盖锁等待、DSA、fallback 与 Portfolio 六个阶段，并携带 trace、symbol/account、状态和耗时，不记录金额。
    - 命令 `pnpm --filter @thesis-ledger/server exec vitest run test/market/services.test.ts test/market/quote-concurrency.test.ts test/portfolio/services.test.ts test/portfolio/valuation-timing.test.ts test/market-control.service.test.ts test/provider-oauth.test.ts`：6 个文件、51 项测试通过；其中 Quote 并发测试覆盖两个 `MarketService` 共享 Redis、超过旧 6 秒租约、owner 失败、last-valid、Redis 异常、损坏 fresh cache 和调用次数断言。
    - 并发 AI Provider 改动稳定后，命令 `pnpm --dir apps/server exec tsc -p tsconfig.json --noEmit` 与 `pnpm --filter @thesis-ledger/server build` 均通过；随后在最新工作树复跑同一组 6 个定向测试文件，51 项测试再次全部通过。
    - I1 已确认 `market.quote` 与 `portfolio.valuation` 阶段日志在目标 Server 容器实际输出；此前“无日志”是 RTK 摘要检索误判。真实缺口是 `DsaClient` 未发送 DSA 识别的 `x-request-id`，故 Server 与 DSA 只能按时间和 symbol 间接关联，不能满足完整 AC8。
    - `DsaClient.get()` 现从一次 `currentTraceId()` 取值，同时发送 `x-trace-id` 与 `x-request-id`；新增 `test/integration/dsa.client.test.ts` 验证两个 header 相同且认证头、URL 保持不变。定向测试、Server typecheck、build 与 `git diff --check` 通过。
    - DSA Quote 运行时补齐 `provider-selection`、`provider-qualification`、`provider-call` 的有界结构化日志，记录 requestId/traceId、symbol、Provider、状态、耗时和稳定错误码，不记录凭证或原始响应；DSA runtime/request-budget 定向测试 27 项通过，Python 编译检查通过。
    - `git diff --check` 通过；本次新增文件通过 Prettier。`market.service.ts` 的全文件 Prettier 检查在 `HEAD` 基线即失败，本次未为格式化而扩大无关差异。
    - 证据边界：本地行为与包级验证由 T2 证明；目标 Docker、真实 DSA/Redis 和受控 Provider 请求由 I1 证明。

- [x] I1：完成 DSA + Server 早期目标 Docker 门禁
  - 覆盖验收标准：AC1、AC2、AC3、AC4、AC5、AC8、AC9、AC10（Provider/Server 断言）
  - 依赖：T1、T2
  - 环境前提：目标 `thesis-ledger-infra` Compose、当前 migration head、单 DSA 实例、Redis 持久状态和可用的代表性 CN ETF；保留全部数据卷。
  - 涉及范围：部署兼容镜像，执行一次受控冷请求、并发请求、缓存命中、DSA 重启冷却和失败回退场景；只修复 T1/T2 seam 内发现的问题。
  - 完成条件：单 ETF 冷请求日志中不存在全市场函数；并发只产生一次 DSA/合格 Provider 调用；重启不突破 600 秒资格；存在旧值时返回 stale、无旧值时 unavailable；trace 阶段证据完整。
  - 停止条件：若确定性实现存在但目标运行态没有可用 ETF 单标的 Provider，保留 I1 未勾选，汇总实际 Provider、错误分类、响应字段缺口和备选方案后向用户请示；不得用 universe 请求获得表面成功。
  - 验证方式：记录镜像/源码 revision、Effective Policy、容器环境、Server 与 DSA 关联 trace、Provider 调用计数和耗时摘要；真实 Provider 调用不得超过场景所需最小次数。
  - 当前状态：镜像更新、数据库检查、受控真实 Provider、并发、跨 DSA 重启预算、fresh/stale/unavailable 与跨服务 trace 运行态断言均已完成。
  - 验证证据：
    - 已确认目标 Compose project 为 `thesis-ledger-dev`，服务包含 `dsa`、`thesis-ledger`、`postgres`、`redis`、`backtest-worker`；现有容器虽 healthy，但其旧 image digest 已无法由本地 tag 可靠反查，不能作为当前源码验收证据。
    - 已确认目标环境 `THESIS_LEDGER_FIXTURE_MODE=false`，DSA 持久数据库路径为 `/app/data/stock_analysis.db`；未输出密钥，未操作 PostgreSQL、Redis、Worker 或任何 volume。
    - `thesis-ledger:dev` 新 Server 镜像构建成功；DSA 构建在 Longbridge SDK wheel 的 Rust 编译阶段失败，错误为 `rustc-LLVM ERROR: IO failure on output stream: No space left on device`，未生成新 DSA 镜像，也未执行 `up/recreate`。
    - 只读容量检查显示主机 Data 卷约 95%、可用约 11 GiB；Docker Build Cache 约 24.84 GiB，其中约 14.55–22.72 GiB 可回收。最小解除方案是经用户明确授权后只清理未使用 BuildKit cache；禁止触碰运行镜像、容器和 volume。
    - 按项目规则调用 `./scripts/update.sh all` 后 DSA 镜像构建成功、Server 因空间不足失败；随后调用最小目标 `./scripts/update.sh thesis-ledger` 成功，脚本完成数据库结构 `check` 并更新 DSA、Server、Worker，三个容器及 PostgreSQL、Redis 均 healthy，全部业务 volume 保留。
    - 真实 Provider 成功调用严格限制为 2 次：`510300`、`159915` 各一次，均为 efinance `get_quote_snapshot(symbol)`；未发现 `fund_etf_spot_em`、`get_realtime_quotes(['ETF'])` 或其他 universe/full-market 调用，单标能力请示条件未触发。
    - `510300` 最小双并发共享一个 Provider 结果；`159915` 请求资格在只重启 DSA 且保留 `thesis-ledger-dsa-data` 后仍生效；冷却窗口内没有新增 Provider 调用。fresh、last-valid stale 和无旧值 unavailable 均得到目标运行态证据。
    - Server `market.quote` 的锁、DSA、fallback 日志与 Portfolio 六阶段日志均实际存在；但 Server→DSA header 不一致导致 trace 无法直接贯通，AC8 保持未完成。
    - 按新增项目规则分别调用 `./scripts/update.sh thesis-ledger` 与 `./scripts/update.sh dsa` 部署 trace 修复；两个脚本均完成镜像构建、数据库安全检查或目标服务启动并保持全部业务 volume。沙箱 Buildx 权限失败后仅以获准宿主权限重跑同一脚本，未绕过更新入口。
    - 最终仅执行一次零 Provider 请求 `GET /api/v1/market/000001.OF/quote`：固定 trace `i1-trace-header-final-v2` 同时出现在 Server `market.quote/http.request` 与 DSA `provider-selection rejected` 日志；DSA 返回 `NO_ELIGIBLE_PROVIDER`，Provider/adapter 与 universe 调用增量均为 0，AC8 通过。
  - 剩余条件：无。I1 证明当前目标开发运行态的 DSA + Server 门禁，不替代 T3/I2 的 Desktop 查询治理和浏览器交互验收。

- [x] T3：按消费路由与账户选择状态拆分 Desktop 估值查询并精确失效
  - 覆盖验收标准：AC6、AC7、AC8
  - 依赖：无
  - 涉及范围：Desktop route/page query orchestration、`portfolioKeys`、portfolio/account-data mutations、持仓/现金/账户成功回调、时间戳参数及对应组件/查询测试。
  - 不包含：页面视觉重设计、Server API 业务 Schema 变化、Provider 配置页重构、移动端同步改造。
  - 完成条件：账户目录与全组合估值不再由一个常驻 hook 绑定；`/accounts` 选择具体账户时只启用 selected valuation，选择“全部账户”时只启用 all valuation，两套查询互斥；mutation 只有一个失效责任点；新旧账户影响范围、Ledger events、audit/reconciliation，以及 all-summary 在 active/inactive 状态下的重取或 stale 行为均按 Spec 矩阵处理；移除重复全局 refresh 和无业务意义的时间戳参数。
  - 验证方式：TanStack QueryClient + request fake 的路由/交互测试；具体账户与“全部账户”切换分别断言 all/selected query key、active/inactive 状态和请求次数；新增、编辑、跨账户移动、删除、清空、现金与账户状态场景逐项断言影响范围；Desktop typecheck、目标测试与 build。
  - 验证证据：
    - 已完成的基础实现：`AppRoutes` 不再因 `/accounts` 路由本身常驻启用 all-account valuation；查询选项默认 fail-closed，遗漏启用参数时不会请求组合汇总。
    - 持仓、现金、Ledger 与账户 mutation 不再失效整个 portfolio root；成功后的影响范围统一进入 `invalidatePortfolioChange`。活跃账户 valuation 与账户目录按需各重取一次，非活跃 all-summary 仅标记 stale，页面保存路径不再叠加根级 `refresh()`。
    - 持仓 producer 明确区分新增、同账户编辑、A→B、删除、清空与现金；账户 producer 覆盖创建、停用和永久删除。Ledger events 精确到 `accountId + mode`，audit/reconciliation 与账户 mode 隔离。
    - `fetchPortfolioValuation` 已移除无业务语义的 `t=Date.now()`；仍保留 `cache: no-store` 请求语义。
    - 既有 `portfolio-query-demand.test.ts` 使用生产 query function 与注入式 request fake，已证明具体账户状态下 `/accounts` 的 all 请求为 0、selected URL 仅一次且携带 `accountId`，并覆盖 `/portfolio`、`/risk-center`、A→B、mode 隔离及九类 producer 影响范围。
    - 实施者定向验证为 5 个文件、81 项测试通过；Desktop `typecheck`、`build` 与 `git diff --check` 通过。父级随后执行 `pnpm --filter @thesis-ledger/desktop test -- test/portfolio-query-demand.test.ts test/account-data.cash.test.tsx test/permanent-account-deletion.test.ts test/refactor-contract.test.ts test/account-data.ui.test.tsx`，当前 Vitest 配置实际运行 Desktop 全部 39 个文件、290 项测试，全部通过。
    - 2026-09-15 用户确认“全部账户”是 `/accounts` 的实际组合汇总消费状态；现已用 `accountId=all` 表达该选择，并按当前 `PortfolioMode` 启用 all valuation、禁用 selected valuation。具体账户状态执行相反启用条件；两套查询互斥。
    - “全部账户”使用现有组合摘要和持仓表展示只读汇总；账户管理和账户内编辑操作保持在具体账户状态。持仓表的详情回调改为可选，缺省时不渲染无效操作列，既有 `/portfolio` 行为保持不变。
    - all-summary 失效采用 active-only refetch：存在 active all consumer 时最多重取一次；无 active consumer 时只标记 stale。request fake 同时断言具体账户 `all=0、selected=1` 与全部账户 `all=1、selected=0`，并覆盖 URL、mode 和 mutation 后 active/inactive 请求计数。
    - 修正实施者验证：`portfolio-query-demand.test.ts` 17 项、`account-data.ui.test.tsx` 12 项、`portfolio-table.test.tsx` 6 项全部通过；Desktop `typecheck`、`build` 与 `git diff --check` 通过。父级独立执行 `pnpm --filter @thesis-ledger/desktop exec vitest run test/portfolio-query-demand.test.ts test/account-data.ui.test.tsx test/portfolio-table.test.tsx`，3 个文件、35 项测试全部通过。
    - 证据边界：T3 不执行浏览器、真实 API、Provider 或 Docker；真实 `/accounts` Network 请求次数、选择切换和跨服务 trace 由 I2 验收。

- [x] I2：完成 Desktop 与跨服务交互运行态门禁
  - 覆盖验收标准：AC6、AC7、AC8、AC9（客户端与整体验收断言）
  - 依赖：I1、T3
  - 环境前提：目标 DSA/Server 已通过 I1，Desktop 使用对应源码和 API，存在可安全编辑的代表性账户/ETF 持仓。
  - 涉及范围：真实浏览器 `/accounts` 保存、编辑、删除、清空与路由切换；Network、Server/DSA trace 和页面数据一致性。
  - 完成条件：`/accounts` 具体账户状态下每次持仓保存的 all-account valuation 请求数为 0、selected-account valuation 不超过 1；“全部账户”状态下 all-account valuation 不超过 1、selected-account valuation 为 0；受影响账户 events/audit 与估值更新；错误场景不触发全市场请求或无限重试。
  - 验证方式：浏览器 Network 记录、可见数据与 freshness 状态、对应 Server/DSA trace；明确区分 fixture、真实 Provider、浏览器交互和目标 Docker 证据。
  - 当前状态：真实浏览器保存、编辑、单条移除、清空、账户切换和消费路由切换均已完成；验收中发现的两处账户选择竞态与一处 DELETE 后同标的重录 500 已修复并复验。
  - 验证证据：
    - 使用本地 In-app Browser、真实 Desktop 源码和目标 `thesis-ledger-dev` API；DSA `THESIS_LEDGER_FIXTURE_MODE=false`，未使用 fixture 替代运行态。具体账户冷深链在账户目录 pending/error 期间保持 URL 目标，目录 settled 后正确显示临时模拟账户；“全部账户”与具体账户切换不再被旧 URL 状态回滚。
    - 首次保存 `510300.SH`：`POST /api/v1/portfolio/positions` 返回 201；仅产生一个所选账户 shadow valuation（trace `763f41e8-fda9-4bc2-bca9-472457b22da2`），all-account valuation 为 0。DSA 同 trace 仅执行一次 `ef.stock.get_quote_snapshot(stock_code=510300)`，未出现 `fund_etf_spot_em`、`get_realtime_quotes(['ETF'])` 或 universe/full-market 调用。
    - 修改快照：`PATCH /api/v1/portfolio/positions/:id` 返回 200；仅产生一个所选账户 valuation（trace `0972ba90-ad73-43e3-8cf4-2875ea97218b`，26ms），all-account valuation 为 0。DSA 返回 `request_budget_cooldown`，Provider 调用增量为 0，页面使用已有估值完成刷新。
    - 选择“全部账户”：仅产生一个 `accountId=all`、`mode=actual` valuation（trace `b0972f5c-700b-4240-94d5-0a50956bf966`，52ms），selected-account valuation 为 0；进入 `/portfolio` 仅产生一个 all-account valuation（trace `2f829e52-af47-4c3a-a023-308420aeaaa4`，56ms）。切回具体账户只产生一个 selected-account valuation（trace `7a342098-1c5a-4083-b7a9-277bef352f77`），两套查询互斥。
    - 单条移除：`DELETE /api/v1/portfolio/positions/:id` 返回 200；仅产生一个所选账户 valuation（trace `b86e6087-f0ec-474e-a089-7dc2d5d31a8a`，16ms），all-account valuation 为 0。清空：`POST /api/v1/portfolio/positions/clear` 返回 201；仅产生一个所选账户 valuation（trace `1dea0b68-d546-4ee2-9051-5ba48d35fd81`，10ms），all-account valuation 为 0，DSA 调用增量为 0。页面均与空持仓状态一致。
    - 验收发现删除事件秒级时间晚于 Desktop `datetime-local` 分钟值时，同标的重录会被旧删除覆盖并导致 500。Server 现只在“非零新快照早于同标的最新零数量事件”时把观察边界推进到删除事件，并用 `findFirst + accountId/type/payload.symbol + ledgerRevision desc` 有界查询；回归覆盖零值 `0.00`。定向测试 6 项、Server 全测试 629 项通过（11 skipped），typecheck、build 与 `git diff --check` 通过。
    - 按项目规则调用 `./scripts/update.sh thesis-ledger`；首次沙箱内因 Docker Buildx activity 权限失败，随后仅在获准宿主权限下重跑同一脚本并成功构建、执行数据库结构 check、更新 Server/Worker，所有目标容器 healthy、数据卷保留。新镜像真实复验同标的重录返回 201，随后仅产生一个 selected valuation（trace `17acbcce-b45c-4a4a-97b7-9b909f66215d`）；DSA 仍只有一次 efinance 单标调用。Review 补齐 `0.00` 零值边界后，再次通过同一更新入口构建最终镜像并复用缓存；Server、Worker 与全部依赖服务保持 healthy。
    - 临时账户最终持仓查询为空。永久删除按既有账本完整性门禁返回 409（存在审计记录），未绕过接口或直接修改数据库；临时账户已停用，正常账户未修改。该清理结果不影响 I2 的持仓删除/清空和估值查询断言。
  - 剩余条件：无。I2 证明当前目标运行态的浏览器交互和跨服务请求范围；提交粒度与同一 commit 中其他功能的规范问题由最终一致性 Review 单独记录。

- [x] T4：按路由状态、选择器与全账户消费边界拆分 `AccountDataPage`
  - 覆盖验收标准：AC6、AC11
  - 依赖：T3、I2
  - 涉及范围：Desktop `account-data` 页面编排、账户选择纯状态机/导航 hook、账户选择器、全账户只读估值视图及对应 UI/查询测试。
  - 不包含：视觉重设计、文案或 DOM 层级调整、单账户 mutation/impact helper 合并、Server/DSA/infra 修改、重新构建生产镜像。
  - 完成条件：`AccountDataPage` 不再直接拥有账户选择状态机、选择器 JSX 和 all-account valuation 查询；新模块接口以选择状态与语义化动作为主，不形成传递大量内部 setter 的参数袋；具体账户页仍独占 selected valuation/Ledger/编辑编排；全部账户页仍独占 all valuation 并保持只读。
  - 验证方式：现有账户选择状态机、冷深链和 all/selected 请求互斥测试继续通过；补充新边界的定向测试；依次执行 Desktop 定向 Vitest、typecheck、build 与 `git diff --check`。本轮只有 Desktop 源码拆分，不需要调用镜像更新脚本或重复真实 Provider 请求。
  - 当前状态：实现、确定性检查和最小浏览器烟测完成。
  - 验证证据：
    - `AccountDataPage.tsx` 从 795 行降至 593 行，不再 import React Router、账户选择展示组件或 all-account valuation query；账户选择 pure helper、导航 hook、无查询 selector、all-account 只读消费视图和共用 layout 各自拥有明确职责。
    - `useAccountDataNavigation` 以 `confirmDiscard`、`clearDraft` 和账户/页签语义化 reset 动作为边界，保留 URL、sessionStorage 与冷深链收敛；账户管理内切换使用 `selectManagedAccount` 一次完成确认、上下文重置、关闭 Drawer 和 `accountId + setup` 导航，避免两个基于旧 location 的导航互相覆盖。
    - all-account 视图独占 enabled all valuation query，不再接收永远不可用的账户管理回调；具体账户页仍只启用 selected valuation。三个单账户 impact helper 未修改。
    - 实施者与父级均执行 `pnpm --filter @thesis-ledger/desktop exec vitest run test/account-data.ui.test.tsx test/portfolio-query-demand.test.ts`，2 个文件、31 项通过；Desktop `typecheck`、`build` 与 `git diff --check` 通过。build 仅保留既有 chunk size warning。
    - 本地 In-app Browser 最小烟测确认具体账户 → 全部账户 → 具体账户 URL 分别稳定为具体 `accountId`、`accountId=all`、具体 `accountId`；全部账户只读汇总不显示“管理账户”，切回具体账户恢复该按钮与成交页签。账户管理 Drawer 内选择另一账户后只保留新 `accountId` 且 Drawer 关闭，复验关闭了双导航竞态。
    - 浏览器首次读取具体账户时，因缓存/上游资格已到期产生 1 次 `510300.SH` efinance 单标调用，耗时 2063ms；随后全账户切换和切回请求均被 `request_budget_cooldown` 拦截，没有追加 Provider 调用。日志未出现 universe/full-market Adapter。本轮未调用镜像更新脚本，未执行写操作。

## 验收映射

| AC / 断言 | 实现责任任务 | 验证责任任务或门禁 |
| --- | --- | --- |
| AC1 / 单标的路径禁止 universe Adapter | T1 | T1；I1 |
| AC2 / 600 秒资格跨 DSA 重启且刷新不可绕过 | T1 | T1；I1 |
| AC3 / ETF 单标 Provider 与 Server 无多层重放 | T1、T2 | T1、T2；I1 |
| AC4 / 单进程与多 Server 实例并发合并 | T2 | T2；I1 |
| AC5 / freshness、cache、Provider 与 unavailable 真实 | T1、T2 | T1、T2；I1 |
| AC6 / `/accounts` 具体账户 all=0、selected<=1；全部账户 all<=1、selected=0 | T3 | T3；I2 |
| AC7 / mutation 按新旧影响范围精确失效 | T3 | T3；I2 |
| AC8 / 跨 Desktop、Portfolio、Market、DSA 可观察 | T1、T2、T3 | I1；I2 |
| AC9 / 确定性检查与目标运行态门禁 | T1、T2、T3 | I1；I2；最终一致性 Review |
| AC10 / 单标的能力不可实现时停止并请示 | T1 | T1；I1 |
| AC11 / `AccountDataPage` 职责拆分且行为保持 | T4 | T4 |

## 规划 Review

- 结论：Ready with non-blocking assumptions。
- 已审范围：单 ETF Data Contract、Provider 访问形态与请求预算、Server 锁/缓存/重试、Desktop route-aware query 与 mutation 失效、目标 Docker 和浏览器门禁。
- Blocking：当前无。若 T1/I1 确认没有可用 ETF 单标的 Quote Adapter，则触发 Spec 中的条件性 Blocking，受影响工作必须停止并向用户请示。
- Non-blocking：默认 600 秒请求间隔沿用当前 efinance 单标的缓存边界；当前目标拓扑限定为单 DSA 实例。两项默认均已在 Spec 中规定影响边界。
- 依赖检查：T1、T3 可独立开始；受“一次只完成一个任务”约束，推荐先完成 T1。T2 依赖 T1 的安全单标的行为；I1 依赖 T1/T2；I2 依赖 I1/T3，无循环依赖。
- 粒度检查：T1、T2、T3 分别拥有 DSA、Server、Desktop 的独立交付与定向验证；I1/I2 只承担跨运行态断言，不接收缺失核心实现。
- 证据边界：fixture/单测、包级检查、目标 Docker、真实 Provider、浏览器 Network 分开记录；任何低层级通过均不替代 I1/I2。

## 最终一致性 Review

- [x] Spec 的全部验收断言均有明确实现与适当验证
- [x] 所有已勾选任务满足自身完成条件且证据仍有效
- [x] 必要集成、真实运行态与条件性门禁均已通过或有合法不适用依据
- [x] 启动依赖、验收依赖与契约就绪证据正确且无循环
- [x] 跨任务接口、类型、状态、时间、错误与副作用语义一致（如适用）
- [x] 不存在未解决的 Blocking 问题、占位要求或未定义契约
- [ ] 实现未超出 Spec 范围，未把可选设施变成强制要求
- [x] 证据类型、场景覆盖、代码版本与目标环境支持所声明的验收结果
- [x] 测试、配置、文档、Spec/Task 状态与实际实现一致
- [x] 必要实施 Step 已验证；本轮未创建提交，保留既有用户修改
- [ ] 未发现未处理的实现、Spec、任务或验收证据不一致

### Review 结论

- 结论：AC1–AC10 与 T1、T2、I1、T3、I2 的功能、确定性检查和目标运行态门禁均通过；最终一致性 Review 已执行，但提交范围与同一固定点后的非 Spec 变更存在非阻塞发现，因此不声明“零发现通过”。
- Standards 轴：本任务实现文件未发现新增文档化硬违规；`AccountDataPage.tsx` 同时承载路由选择、账户页和全组合编排的问题已由 T4 关闭。`portfolio.position-actions.ts` 的三个单账户 impact helper 继续保留语义化入口；其相同返回形状属于共享失效契约，不再视为需要合并调用点的实现缺陷。固定点后同一 commit 还包含非本 Spec 的 DSA OAuth/凭证实现，其中存在写死 `callback_port=60355`、新增 `THESIS_LEDGER_OAUTH_CALLBACK_HOST` 未同步 `.env.example`/配置文档、生产函数缺少 docstring 等已文档化硬违规。
- Spec 轴：ETF 单标一次调用、600 秒持久预算、禁止 universe fallback、Server 锁/失败收敛、`/accounts` 具体/全部查询互斥、mutation 单一失效和跨服务 trace 均有实现与适当证据；DELETE 后同标重录的 `0.00` 边界已在 Review 中修复，T4 的页面职责拆分与导航竞态复验已完成。固定点后的主仓差异同时包含 Provider 配置、Mobile 与账户永久删除等其他功能，超出本 Spec；既有账户永久删除工作按任务约束保留，但提交粒度仍需后续拆分或明确归属。
- 尚未通过项与阻塞判断：没有功能 Blocking；未勾选的两项只反映 commit/diff 范围不纯和已识别的非 Spec 标准问题，不影响当前组合估值运行态验收，也不授权本任务顺手修改 OAuth、Mobile 或账户删除功能。
- 遗留风险或后续范围：efinance 类中仍存在当前 Data Contract 不可达的旧 ETF universe private helper，当前生产调用链、定向测试与运行态均证明未调用；未来批量行情应另建明确的 batch/catalog 边界。DSA OAuth 标准修复、提交拆分、FX、LedgerEvent 与 realized PnL 优化均不属于本 Spec。
- 验证命令/过程、结果与证据引用：T1、T2、I1、T3、I2、T4 证据已记录在对应任务；最终补充验证为 Server 回归 6 项、Desktop 查询/账户状态机 31 项、Desktop typecheck/build、Server 全测试 629 项（11 skipped）、Server typecheck/build、两次最终源码输入对应的 `./scripts/update.sh thesis-ledger`、目标浏览器/跨服务 trace，以及 T4 最小浏览器导航烟测。最终 `git diff --check` 通过。
