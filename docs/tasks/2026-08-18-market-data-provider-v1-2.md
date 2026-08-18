# 市场数据与标的中心 v1.2 实施任务

关联规格：[市场数据与标的中心 Spec v1.2](../specs/2026-08-18-market-data-provider-spec-v1.2.md)

任务标识：`market-data-provider-v1-2`

## 执行约束

- 本文描述实施任务；用户已明确授权开始实施，本轮可按本文约束修改代码、迁移、配置、Compose、UI、测试和文档。
- 开始实施前必须重新读取关联 Spec、三个仓库各自的 `AGENTS.md`、相关 ADR 和现有 Data Contract V1 文档。
- 三个仓库保持独立边界：Provider 适配器、凭证和 DSA Effective Policy 只在 `daily-stock-analysis`；ThesisLedger 只持有 Desired Policy、目录、Asset 关联、Contract Client 和产品缓存；infra 只编排和提供持久化边界。
- `ProviderConfig` 保持现有职责，不增加市场路由。任何市场路由只能进入新的 `DesiredProviderPolicy`。
- 实现范围、接口语义或验收标准变化时，先更新关联 Spec，再同步本文和实现。
- 只有实现完成且有对应验证证据后才能勾选任务；部分实现或仅有静态验证的任务保持未完成。
- 不执行 `git commit`、`git tag`、`git push`，除非用户另行明确授权。
- 不使用 `down -v` 或其他删除既有 PostgreSQL/Redis 数据卷的操作。

## 任务清单

- [x] T1 建立 Data Contract V1 扩展与 Control Contract V1：定义独立版本、consumer namespace、Control Token、handshake、Provider registry/config projection、Policy apply/ack、Effective/health、Catalog job 和稳定结构化错误；确认旧 Data Contract V1 继续兼容。
  - 涉及范围：`daily-stock-analysis` Contract、`thesis-ledger` schemas/client/API、跨仓版本矩阵。
  - 完成条件：Data Contract 与 Control Contract 的职责、版本、错误和权限边界可独立测试；客户端不能直连 DSA；旧 V1 fixture 不被破坏。
  - 验证方式：Contract schema 校验、版本握手测试、旧客户端兼容测试、Control Token 权限测试、跨仓 Contract Test。
  - 验收标准：AC-02、AC-03、AC-10。

- [x] T2 实现 Instrument、InstrumentAssetAssociation 与主系统持久化：建立归一化目录、generation、软停用、搜索字段、关联状态/来源/时间和 `DesiredProviderPolicy` revision history；按现有 `.SH/.SZ/.BJ/.OF` symbol 对既有 Asset 做确定性 backfill，不重新解析或静默改绑。
  - 涉及范围：`thesis-ledger` Prisma/domain/schema/API/migration/repository。
  - 完成条件：Asset 仍是 Ledger 事实模型；Instrument 与 Asset 关联独立；可确认类型、禁用类型和 `.OF` 语义符合 Spec；Redis 不作为策略唯一持久化来源。
  - 验证方式：迁移预检与回滚检查、唯一性和 backfill 测试、Asset identity 回归、关联状态测试、目录 generation 原子切换测试。
  - 验收标准：AC-05、AC-06、AC-10。

- [x] T3 实现 DSA Provider manifest、AKShare/efinance 适配器与 Catalog pipeline：保留 Provider ID `akshare`/`efinance`，增加严格归一化、Provider Mapping、源目录抓取/合并、snapshot/delta、generation/checksum/cursor 和 Job Manager 去重；`CHIP_SUMMARY + STOCK` 仅在真实可执行的 Provider manifest 中声明（当前为 `akshare`）。
  - 涉及范围：`daily-stock-analysis` `data_provider/`、Contract route/capability、SQLite 持久化和 fixture。
  - 完成条件：MVP 只暴露真实可执行能力；`INSTRUMENT_SEARCH` 不进入 Provider route；Tushare/RQData/Custom 不生成虚假配置 UI；DSA 能保留最新完整 snapshot 和有限 delta；定时与手工同步共用同一 Job Manager。
  - 验证方式：Provider manifest/normalization 单测、Catalog snapshot/delta fixture、checksum/cursor 过期测试、重复 job 测试、Provider failure fixture。
  - 验收标准：AC-05、AC-06、AC-11。

- [x] T4 实现 DSA ProviderConfig、凭证安全、Desired Policy 校验与 Effective Policy：在 DSA 内独立保存 Provider-specific 配置、加密凭证、manifest、health/circuit projection 和 Effective Policy；实现 revision monotonic/latest-wins/idempotency、整份拒绝、原子应用、显式 rollback 和 Provider removal tombstone。
  - 涉及范围：`daily-stock-analysis` DSA control/runtime/storage；`thesis-ledger` Control Client 的 apply/ack 映射。
  - 完成条件：主系统 `ProviderConfig` 不参与市场路由；未知/重复/不兼容 route 整体拒绝并保留旧 Effective；未配置或暂时不可用状态可解释且不产生隐藏 fallback；DSA native analysis 不受 `consumer=thesis-ledger` 控制面影响。
  - 验证方式：Control Contract 黑盒测试、revision 并发/重试/断线重连测试、原子拒绝测试、旧 Effective 保留测试、凭证加密/轮换/回滚测试、removal diff/tombstone 测试。
  - 验收标准：AC-01、AC-02、AC-03、AC-08、AC-10。

- [x] T5 实现 DSA Health、Retry、Circuit、严格归一化和数据 fallback：按 `consumer + Provider + Capability + InstrumentType` 隔离运行状态，按失败分类执行有界 retry/circuit；Quote/NAV 采用 record-level，Bars/Fund NAV history 采用 sequence-level，`CHIP_SUMMARY` 采用摘要级，Indicator 继承其 `DAILY_BAR` 输入来源，并禁止字段级混源或 native manager bypass。
  - 涉及范围：`daily-stock-analysis` provider runtime、route executor、error/diagnostics、Data Contract response。
  - 完成条件：只按 Effective Policy 顺序调用；同一 upstream 每 Provider 最多一次；无隐式 Provider/cache fallback、无限 retry、默认填充或 live reconciliation；raw Provider error 只进入日志和诊断。
  - 验证方式：fault injection 覆盖 timeout/5xx/invalid/unsupported/not-covered/circuit-open；批量记录级和序列级 fallback 测试；provenance/fallbackUsed 测试；结构化错误测试。
  - 验收标准：AC-04、AC-07、AC-11。

- [x] T6 实现 ThesisLedger Control Client、Desired Policy API、Catalog pull 和产品数据读取：持久化 Desired Policy 与同步状态，支持 DSA unavailable 时 pending/old Effective/latest-wins；拉取并 ACK Catalog snapshot/delta；实现 Quote、Fund NAV、Bars、Indicator 和 `CHIP_SUMMARY` 的统一 gateway/产品读取边界，保持旧 Data Contract V1 wire 兼容、stale 和 unavailable 映射。
  - 涉及范围：`thesis-ledger` Server、domain/schema、DSA client、Redis/PostgreSQL、现有 market service。
  - 完成条件：产品缓存是用户可见 freshness 权威；保持 Quote/Fund NAV 现有 freshness/time wire 语义；`provider` 始终是真实 Provider，cache provenance 独立；stale 可展示/估值但 Risk/Backtest/Alert/AI 默认拒绝；历史数据不从 latest cache 伪造。
  - 验证方式：Server API/DSA stub 测试、断线重连和 pending 测试、目录 ACK/retry/full snapshot 测试、single-flight/lock 测试、fresh/stale/unavailable/partial 回归、旧 Contract V1 smoke。
  - 验收标准：AC-02、AC-03、AC-05、AC-07。

- [x] T7 实现目录搜索、身份确认和 Desktop/Mobile 客户端边界：加入本地 `pg_trgm` 搜索、固定排序、歧义并列结果、可确认类型限制和新持仓搜索选择；建立独立市场数据管理页，保留现有 `/providers` 职责；Mobile 只读。
  - 涉及范围：`thesis-ledger` API、Desktop、Mobile；与现有 Position/Asset/Provider 页面兼容。
  - 完成条件：Desktop 支持 Provider 状态、Desired route draft/Apply、last-known Effective、目录同步、write-only 凭证和逐 Capability Smoke Test；DSA unavailable 时写操作 disabled；Mobile 不持有 Control Token、不提供管理操作；新持仓不再接受手工 symbol。
  - 验证方式：API/UI 组件和路由测试、搜索排序/歧义测试、凭证空值保留/显式 clear 测试、draft 不落库测试、DSA unavailable 状态测试、Desktop/Mobile typecheck/build 和人工视觉验收。
  - 验收标准：AC-06、AC-08、AC-09。

- [x] T8 更新 infra、配置与发布/回滚矩阵：为 DSA SQLite 增加独立持久卷，注入 Control Token 和版本化 Secret Key，更新镜像/源码 override 与三仓版本矩阵，明确 DSA → ThesisLedger → Desktop/Infra 发布顺序和旧 V1 降级行为。
  - 涉及范围：`thesis-ledger-infra` Compose、环境模板、发布文档和跨仓兼容门禁。
  - 完成条件：不共享主系统数据库；重启保留 DSA ProviderConfig/Effective/Catalog/Job；不删除既有 PostgreSQL/Redis volume；DSA native analysis 和旧 Data Contract V1 可回退/继续运行。
  - 验证方式：Compose config/render、卷挂载与重启 smoke、版本矩阵检查、Control Token/Secret Key 注入检查、回滚演练或确定性静态验证。
  - 验收标准：AC-02、AC-10、AC-11。

- [x] T9 建立阻断型 fixture/fault injection、跨仓 Contract Test 和发布前真实 smoke：覆盖成功、不可用、invalid、unsupported、fallback、circuit、缓存、目录 generation、策略同步和 UI degraded 状态，并覆盖 `DAILY_BAR` 派生 Indicator、`CHIP_SUMMARY` manifest/Effective Policy 路由及旧 chip wire；受控执行 AKShare/efinance smoke，不将不稳定在线请求作为 CI 唯一证据。
  - 涉及范围：三个仓库的 tests、fixture、stub、CI gate、发布检查和视觉证据。
  - 完成条件：自动化测试覆盖真实风险层而非只 mock 掉 DSA/数据库；Contract、迁移、Server、DSA、Desktop/Mobile 和 infra 均有对应证据；真实 Provider smoke 有超时、凭证和失败记录。
  - 验证方式：pytest/Server/Schema/Domain/Client/UI 定向测试、Contract black-box、migration matrix、Docker/Compose smoke、Desktop/Mobile build、人工页面视觉验收、发布前受控真实 smoke。
  - 验收标准：AC-04、AC-05、AC-07、AC-09、AC-11。

- [x] T10 同步领域与用户可见文档：根据实现结果更新 `CONTEXT.md`、必要的 ADR、Data/Control Contract 文档、Provider 配置/运维说明和 `docs/CHANGELOG.md`；如中英文文档不同步，记录原因。
  - 涉及范围：三个仓库的 docs、ADR、CONTEXT、CHANGELOG 和用户指南。
  - 完成条件：Desired/Effective/ProviderConfig/Instrument/Asset/`.OF`/cache/fallback 等术语一致；变更的 API、配置、部署、通知和页面均有文档；`[Unreleased]` 使用仓库规定的扁平格式。
  - 验证方式：文档链接、命令、配置键、路由和版本矩阵核对；治理资产变更时执行 `python scripts/check_ai_assets.py`；人工术语一致性 Review。
  - 验收标准：AC-01、AC-02、AC-06、AC-10。

- [ ] T11 执行最终一致性 Review：对照本 Spec、任务、领域词汇、ADR、三仓实现、Data/Control Contract、迁移、测试、UI、Compose、发布顺序和回滚方案逐项核对；处理问题或明确记录用户接受的遗留项。
  - 涉及范围：三个仓库全部受影响入口，以及本 Spec 和本文。
  - 完成条件：没有 Desired/Effective 混用、ProviderConfig 越界、隐式 fallback、直接 DSA 客户端、旧 V1 破坏或测试证据越界；所有未验证项均有明确原因和后续动作。
  - 验证方式：最终 Spec-to-task-to-code traceability matrix、跨仓 diff review、阻断型 CI 结果、受控真实 smoke、Desktop/Mobile/运行时视觉证据。
  - 验收标准：AC-01 至 AC-11。

## 当前阶段

本轮已获得用户授权并开始实施。T1–T10 已按实现、确定性测试和受控 smoke 证据勾选；closure-04 至 closure-08 已完成确定性实现和针对性验证，closure-10 的 efinance 四项专属在线验收已在 `ENABLE_EASTMONEY_PATCH=true` 下完成。closure-09 仍保留原生设备/视觉阻塞，T11 已完成文档与代码一致性 Review 及回滚演练，但尚未获得原生运行证据。完整策略当前为 revision 11，revision 3→4→5→6→7→8→9→10→11 的非破坏回滚与 efinance-only smoke 链路已验证；最新 DSA/ThesisLedger 镜像均已成功构建并应用，ThesisLedger migration 与 facade Contract smoke 已通过；Desktop 浏览器视觉验收和 Mobile Web 只读/失败态视觉验收已完成，原生 Mobile 联网验收仍待执行。

## 本轮已实施内容

- DSA：新增独立 Control Contract、`akshare`/`efinance` manifest、SQLite ProviderConfig/Effective Policy/health/catalog/job/tombstone、write-only 凭证、Policy 原子校验、Provider smoke、scoped circuit 和 Quote/NAV/Bar fallback runtime；凭证可选 Provider 不再被错误判定为未配置，移除 Provider 会写 disabled 配置以阻止隐式复活。
- DSA Catalog：fixture 只在显式 fixture mode 下生成；生产路径改为抓取并合并 AKShare/efinance 目录，保留有限 generation、真实 delta、cursor 过期和持久化 ACK。
- DSA Catalog Job：trigger 已拆分为快速返回、状态查询和异步 worker；lease 过期可恢复，Provider 调用使用可终止子进程、有限重试/退避和并发槽，hanging worker 不会长期占用 API worker。
- ThesisLedger：新增 `Instrument`、`InstrumentAssetAssociation`、`DesiredProviderPolicy` revision history、`ProviderTombstone`、`CatalogSyncState`、目录 snapshot/delta 原子同步/搜索/确认 API、DSA Control Client、Redis single-flight/lock 和 Quote/NAV/历史 Bar cache 边界。
- Fund NAV history：补齐 DSA `FUND_NAV_HISTORY` sequence-level runtime、Data Contract 路由、跨仓 Schema、`FundNavPoint` PostgreSQL 持久化和 DSA 不可用时的历史降级读取；contract smoke 校验权限、身份和严格时序。
- Policy 与移除：主系统使用数据库行锁和单调 latest-valid revision 约束收敛并发 apply；rollback 生成新 revision；只有 DSA 确认 Policy 生效且完成 Provider removal 后才写本地 tombstone，Desktop 不再把 pending 响应显示为成功。
- Secret Key 轮换：DSA 在保留 previous key/version 时验证全部已有凭证并原子重加密；旧 key 缺失或密文校验失败时不做部分轮换，保留原密文等待补齐轮换材料。
- 客户端与 infra：新增 Desktop `/market-data` 管理页和新持仓目录确认入口；Mobile 保持只读；补充 DSA 独立 SQLite 卷、Control Token/Secret Key 配置、fixture stub、Contract smoke 和实施架构文档。
- freshness 门禁：Performance 使用 fresh-only；Risk、Backtest、AI 默认拒绝 stale/partial 数据，只有显式 `allowStale` 才可放行。

## 当前验证证据

- `apps/server`：TypeScript typecheck 通过；Vitest 89/89 通过。
- `apps/desktop`：TypeScript typecheck、Vitest 15/15 和 Vite production build 通过；仅有既有的大 chunk 警告。
- `packages/schemas`：typecheck/build 通过；Prisma schema format 和 client generate 通过。
- DSA 源码：Python 3.12 虚拟环境中的 Control/Data Contract、Provider runtime、Bars facade、Fund NAV history 严格 sequence fallback、efinance 实时行情与净值历史归一化、SQLite 文件重开、Catalog Job lease/worker、Provider timeout isolation 和 Secret Key rotation 回归共 65 项通过；受影响 Python 文件 `py_compile` 通过。测试仅使用 fixture/fake Provider 和确定性 fault injection，不等同于在线 Provider 或 Docker 镜像验收。
- 本轮缺陷修复：归回 Fund NAV fixture 函数体、修正 Bars runtime 的 frame 返回形状、将 real Bars facade 的 `limit` 截断与 fixture 语义对齐、将 fixture history limit 对齐 Contract 的 3650 上限，并保持全局异常处理器下 Contract 错误的结构化 `detail.code`；Provider runtime 现将 `.SH/.SZ/.BJ` Contract 标的归一化为适配器裸代码，AKShare 真实 Quote 使用单标的 Sina 通道，efinance 真实 Quote 优先使用 `get_quote_snapshot`；新增 `docs/CHANGELOG.md` 的 `[Unreleased]` 修复条目。
- Compose：使用 `.env.example` render 通过；PostgreSQL、Redis、DSA、ThesisLedger 四服务均 healthy，三个 `thesis-ledger-*` 外部卷均存在；DSA 与 ThesisLedger 均已切换到最新镜像。
- 最新 DSA 镜像：使用 `--env-file .env.example` 构建并应用成功；容器重启后状态为 `running/healthy`，`THESIS_LEDGER_FIXTURE_MODE=false`，`/api/health` 返回 HTTP 200。
- 当前 DSA 直连 Contract smoke：在显式 fixture 测试路径中，Capabilities、Control handshake/provider registry/effective policy、Catalog job/ACK、Fund NAV/history、Quote、60 条 1d Bars、MA/MACD/RSI、Chip 和 1m unsupported error 均通过；该确定性结果与当前真实 Provider smoke 分开记录。
- revision 11 策略验收：通过 Control API 恢复包含 `REALTIME_QUOTE`、`DAILY_BAR`、`FUND_NAV`、`FUND_NAV_HISTORY` 和显式 `CHIP_SUMMARY` 的完整策略，各适用资产类型按 `akshare -> efinance` 路由。DSA/ThesisLedger 重启与回滚 smoke 后 Policy 查询为 `revision=11`、`dsaRevision=11`、`syncState=applied`；历史 revisions `[11, 10, 9, 8, 7, 6, 5, 4, 3, 1]` 均保留。
- `CHIP_SUMMARY` 当前证据边界：完整策略 revision 11 已完成 Docker 应用、重启后 projection 和回滚恢复验收；fixture=false 的真实 API 请求实际进入 AKShare，因上游远端关闭连接返回 HTTP 503，未被 fixture 或隐藏 fallback 掩盖。在线 CHIP 数据仍待外部上游恢复或由运行负责人接受降级风险。
- 最新 ThesisLedger 工作区镜像已构建并应用；启动 migration `20260818000000_market_data_provider_v12` 已应用，重启后无 pending migrations，health 的 `schemaVersion` 与 migration 一致，数据库、Redis、DSA 均 healthy。
- 跨仓 facade Contract smoke：修正 smoke 脚本的 facade 路径分支后，Quote、Fund NAV/history、Bars、MA/MACD/RSI、Chip 和 unsupported capability 全部通过，结果为 `status=passed`。
- Desktop/Mobile 视觉：Desktop Vite `/market-data` 在 1440×900 与 390×844 下完成浏览器验收，关键管理区可滚动访问、无横向溢出，控制台无 error/warn；Mobile Expo Web 在 390×844 下完成只读界面与失败态验收，无 Provider/Policy 管理入口且无横向溢出。当前 Compose 中 `CORS_ORIGINS` 为空，Mobile Web 跨域读取 API 显示 `Failed to fetch`，但两个 API 端点宿主机直连均为 HTTP 200；因此该证据不等同于原生 Mobile 联网验收。
- 当前差异 Review：第二轮 Standards/Spec 双轴 Review 共发现 6 项遗留，包括测试 docstring、efinance 重复映射、目录拼音/别名、generation 单调性、Fund NAV history single-flight/Redis lock 和 sequence smoke；Luna 已按完整契约修复并补充回归，随后通过 DSA 定向回归、Server 89/89、Schemas 32/32、migration matrix 18/18 和三仓 `git diff --check`。本轮新增的 rollback 缺失目标 500 也已修复为稳定 404 并补测；剩余为原生设备与外部 Provider 门禁。
- 真实 Provider smoke：当前镜像在 fixture=false 下复测，主路由的 REALTIME_QUOTE、DAILY_BAR、FUND_NAV、FUND_NAV_HISTORY 和 MA API 分别返回 HTTP 200；日志显示 DAILY_BAR/Indicator 在 AKShare 失败后由新浪通道返回，CHIP_SUMMARY 因 AKShare 上游 `RemoteDisconnected` 返回 HTTP 503。临时 efinance-only revision 10 下四项 Contract API 均由 `efinance` 成功返回且 `fallbackUsed=false`；完整策略已 rollback 恢复为 revision 11。验收后保持 `THESIS_LEDGER_FIXTURE_MODE=false`，当前容器显式开启 `ENABLE_EASTMONEY_PATCH=true`。ThesisLedger 镜像构建中的 `node-pty` 因镜像内缺少 Python 未生成可选原生模块，但 Prisma generate、server build、migration、health 和 facade smoke 均已通过。
- 真实 Data Contract API：在新 DSA 镜像、fixture=false、revision 11 完整策略下，Quote、Daily Bar、Fund NAV、Fund NAV History、Indicator 均成功返回；CHIP_SUMMARY 仍可能因 AKShare 上游关闭连接返回 503。临时 efinance revision 10 下，Quote、Daily Bar、Fund NAV、Fund NAV History 均返回 `provider=efinance`、`fallbackUsed=false` 的有效响应。该结果证明 patch 开启后 efinance `DAILY_BAR` 不再需要隐藏跨 Provider 或字段级混源。
- 三仓 `git diff --check` 通过。
- closure-04 至 closure-08 任务文档已分别记录黑盒 Contract、revision 原子性、Catalog lease、异步 worker 和可终止 Provider 调用证据；closure-09/10 明确记录原生设备与外部网络缺口，未将 Mobile Web 或上一轮在线结果冒充本轮验收。
- 本轮 ThesisLedger 批次 B/C 确定性验证：`pnpm --filter @thesis-ledger/server typecheck` 无错误，`pnpm --filter @thesis-ledger/server test` 89/89（目录拼音/别名、generation 单调性/Serializable 事务、基金 NAV history single-flight/Redis lock、revision 跳号、rollback 缺失目标稳定错误）；`pnpm --filter @thesis-ledger/schemas test` 32/32；`pnpm migration:matrix` 18/18 migrations；`pnpm install --offline --frozen-lockfile --ignore-scripts` 成功，`pinyin-pro` 已写入 `apps/server/package.json` 与 lockfile。未因此勾选仍缺视觉或外部 Provider 验收的任务。

## 实施前检查清单

- [x] 用户确认开始实施，并确认本 Spec 的 Draft 语义不再需要业务调整。
- [x] 重新读取三个仓库的 `AGENTS.md`、相关 ADR、Data Contract V1 和本 Spec。
- [x] 确认当前 Git 工作区、三仓基线和可用的 DSA/数据库/浏览器验证环境。
- [x] Control Contract 路由、Schema 字段名和迁移编号已按本 Spec 语义落地，最终一致性验证仍待完成。
