# E04-c/E02-c 父项执行与验收

依据[主任务](../2026-09-29-thesis-ledger-canonical-runtime-replacement.md)与对应 Spec，用户本轮要求完成当前父项。范围为已完成的 Policy c1、Catalog c2，以及缓存、精确来源与派生 c3；其他 Canonical 阶段保留原状态。

## 执行边界

- [x] c1：复用 [Policy 证据](2026-10-02-e04-c1-e02-policy-completion.md)，改变相关输入后补受影响检查。
- [x] c2 状态与执行：DSA Job 当前响应、请求身份、终态与 owner/lease 恢复；ACK 在持久化事务内校验当前目录身份。保留现行生产者使用的 `generation:<正整数>` 游标，拒绝 `0`、`generation:0` 等无目录身份的入口。
- [x] c2 消费：DsaClient 严格解析 Snapshot/Delta/Job/ACK；成功 Job 在目录投影前绑定 generation/checksum；同 generation 游标冲突拒绝；无 CatalogSyncState 不以 Instrument 历史记录推导当前目录。
- [x] c2 运行态：隔离 SQLite/HTTP 与 PostgreSQL 验证成功、错误身份、旧信封、事务与恢复；官方代码同步后核对目标只读合同及拒绝行为。
- [x] c3：反查当前缓存、路由修订、精确来源、派生证据生产与消费，修复实际可达的兼容与竞态；复用未变化的真实来源证据，补定向及受影响运行态检查。
- [x] 最终对账：包级、构建、边界与局部门禁通过；只关闭有完整证据的父项。

## 写集与验证

c2 写集限于 DSA Catalog 专属协议与 Store、Server DsaClient/Catalog 投影、对应测试和合同文档。大文件新增职责放入 Catalog 所有的独立模块；不修改数据库结构、Provider 凭证或真实准入，不通过触发目标任务制造验收数据。c3 写集在实际调用反查后补充。

c3 反查已发现派生冻结读取仍接受旧毫秒时钟算法并按旧算法重算。该分支不属于当前精确时钟算法，按 Canonical 的旧读取拒绝要求删除；当前 `raw-times-factor-over-fixed-anchor-binary64-v2` 标识与经济计算保持。缓存及来源层继续按调用路径核对，合法的当前双来源选择和显式陈旧缓存策略不能因名称含 fallback 而删除。

验证依次执行定向测试、包级与构建、仓库门禁、隔离运行态、官方最小目标同步及目标 HTTP。当前工作区原有 943 项改动，持续保留。测试结果与未完成项在本文件记录，不以健康检查代替业务验收。

## 已完成行为

Catalog 当前传输由 `dsa-catalog-v3.ts` 校验，DSA 持久化目录读取及 ACK 由 `thesis_ledger_catalog_contract.py` 拥有，Server 投影由 `catalog-job-projection.ts` 编排。当前 Job 响应包含 owner、lease 和时间事实；触发响应绑定 requestId，轮询绑定 Job ID。成功 Job 必须在 Snapshot/Delta 进入 PostgreSQL 前匹配整份目录身份，损坏响应不会触发兼容读取。ACK 校验和提交共享 SQLite 写事务；旧 ACK、零值游标、重复条目、增删交叠及错误 checksum 拒绝。

本地当前目录依赖有效 CatalogSyncState，不再取历史 Instrument 最大 generation。同期同步拒绝 cursor 冲突，续期 CAS 同时绑定 generation/checksum/cursor。严格前进的增量及完整 checksum 重算、Serializable 事务和并发投影恢复保持。

派生冻结读取删除旧毫秒算法，仅按当前精确时钟算法重算并绑定可信输入指纹。原生 raw 窗口、转换证据、因子/事件摘要、来源修订和完整输入仍参与校验；显示裁剪不改变完整证明。当前算法标识中的 `v2` 是现行不可变算法修订，不是旧传输合同。

缓存和精确来源的反查覆盖 MarketService/MarketQuoteReader/MarketResultCache、路由修订服务、Window/Chart/Frozen Reader、派生 Repository，以及 DSA 当前来源、修订、准入和原生适配器。非 Bar 当前载荷版本及标的绑定、旧 FundNavPoint 不回读复用 Data 叶；来源别名和缺少精确目标不能进入当前 Bar/事件/NAV 路由。当前显式陈旧缓存与双来源选择仍按其业务合同执行，不补事实、复权或分钟线。

## 验证结果

| 层级 | 命令与输入 | 最后结果 |
| --- | --- | --- |
| Catalog/派生定向 | Server 的 dsa-catalog-v3、catalog-readiness、instrument、derived-series 与 derived-snapshot 测试；最终投影补验 | 首轮 62 项；最终合同 28 项、投影 21 项通过 |
| 缓存、修订及来源定向 | quote-concurrency、services、route-revision、window-selector、frozen-window-reader、derived-raw-window、derived-price-basis、derived repository、indicator-cache | 9 文件 65 项通过 |
| Server 全包 | `pnpm --filter @thesis-ledger/server test`；最终源码与当前构建 Schema | 250 文件 2049 项通过，33 文件 125 项条件跳过；新增 6 项 PostgreSQL、3 项 Redis 单独启用验收 |
| Schemas 全包 | `pnpm --filter @thesis-ledger/schemas test` | 50 文件 586 项通过 |
| 客户端回归 | API Client/Desktop 全包 | API Client 8 文件 46 项；Desktop 79 文件 523 项通过 |
| 构建与类型 | Schemas/Server build；Server/Desktop typecheck；Desktop build | 全部通过；Desktop 既有大 chunk 警告保持，未提高阈值 |
| 局部门禁 | ESLint（复杂度20、函数220）、Prettier、边界、diff check、Node 脚本语法及 Python 关键 flake8 | 通过；门禁新增 DSA 适配器不得反向依赖 Market |
| DSA 定向 | 当前 Catalog 合同、Job、Provider runtime | 39 项通过；旧游标/信封无写入、真实 SQLite ACK 写锁、过期 lease 晚到不得发布均覆盖 |
| DSA 官方离线 | 保留系统 PATH 并前置仓库 `.venv/bin`，`./scripts/ci_gate.sh offline-tests` | 稳定输入 7703 项及 626 subtests 通过；1 跳过、4 deselected、69 warnings；218.36秒 |
| 隔离 PostgreSQL | `E04_CATALOG_POSTGRES=1`，`catalog-parent-postgres.integration.test.ts` | 6 项通过：全部 migration/app role、坏增量回滚、旧信封/游标、并发、历史投影及旧派生拒绝；临时容器清理 |
| 隔离 Redis | `E04_CACHE_REDIS=1`，`market-cache-redis.integration.test.ts` | 3 项通过：跨实例12请求只取一次来源、旧键及错配载荷拒绝、陈旧合同；临时容器清理 |
| 隔离 HTTP | `node scripts/e04-catalog-isolated-acceptance.mjs`，实际编译 DsaClient→独立 uvicorn/SQLite | Snapshot、同游标 Delta、ACK、触发→轮询→成功通过；6个旧 cursor、2个旧信封拒绝；独立目录与进程清理 |
| 目标更新 | infra 官方 `./scripts/sync-code.sh all` | 兼容预检、源码/产物同步及健康检查通过；未改变结构或外部卷 |
| 目标 Catalog/派生 | `node scripts/e04-catalog-target-acceptance.mjs` | 25 个实际运行模块一致；generation28、5920条；当前成功 Job 与快照/增量同源；当前派生计算及旧算法拒绝；6旧cursor、4旧信封、10旧URL、4旧Server请求体拒绝 |
| Policy 受影响回归 | `node scripts/e04-policy-target-acceptance.mjs` | 14模块一致、revision32 当前幂等 Apply、6旧请求、6旧路径、4旧Server请求拒绝；PostgreSQL及5张SQLite表内容不变 |

隔离 PostgreSQL 和 Redis 使用已有标签校验、随机 loopback 端口及 tmpfs harness。来源调用在 Redis 验收中为受控故障依赖，该层证明真实缓存/锁，不冒充外部 Provider 成功。真实来源输入未改变，继续复用 Data、Provider、Policy 与 NAV N4 的既有来源证据。

## 目标事实与验收边界

目标 Catalog 验收前后，PostgreSQL 的目录状态、Instrument 全行内容摘要、Policy 与派生数量一致；SQLite 的 Catalog generation/Job/ACK、Policy 当前及历史、准入、Provider 配置与健康8张表逐表摘要一致。验收没有触发新目标 Job 或 ACK。读取 Job 前要求全部 running lease 在安全窗口内，避免状态读取触发过期恢复；后台任务如自然变更会使内容见证失败，不计为通过。

目标既有目录为陈旧的完整 generation28，共5920条。同步期间首次 Server 启动出现当前响应解析拒绝；没有宽松回退。之后正常五分钟调度在 07:35:54 UTC 创建当前 pending Job `dfc4a5be-6c26-46c5-9aa2-9a070c1bdad3`，正确轮询并在 07:36:29 UTC 以“所有 Catalog Provider 均不可用”收敛失败。Server 保持 `stale` 查询，`refreshInProgress=false`，没有把外部来源故障标为成功。首次响应错误的具体原因未独立捕获；正常后续调度、实际 Job 响应解析及目标合同已通过，不将启动时序推断当作已证根因。

Policy 中 NAV 来源仍为 `admission_expired`；没有续期准入或修改凭证以制造成功。新鲜 Catalog 来源及新 NAV 创建能力不在本次声明中；全局 D02 与关联来源产品门禁保留。

Server/Worker 镜像仍为 `sha256:ed7f1174ba5e6d2bfe944cc4aa7166afe2c2c435feaffaf56e9651866c9896a3`，DSA 仍为 `sha256:6a7252651a631bc15dfc6824468f8485cee181ad7827c87935b77ace2215d725`。本次是容器可写层代码同步，不是镜像发布。

## 失败修复与最终对账

DSA 首轮失败的旧测试直接发送无信封 ACK，已更新为当前请求；测试 PATH 漏掉 rtk 的问题已通过保留系统 PATH 修复。ESLint 脚本目录不在仓库 lint 输入内，改为只检查 TypeScript 写集，脚本另行做 Node 语法与 Prettier 检查。没有提高超时、阈值或新增忽略。目标第一轮因存在活动 Job 停止；后续用实际 lease 安全窗口保护无恢复副作用的读取，并以完整内容摘要确认没有写入。

日志：`/tmp/e04-c-server-stable-gate.log`、`/tmp/e04-c-dsa-stable-gate.log`、`/tmp/e04-c-postgres-final.log`、`/tmp/e04-c-redis.log`、`/tmp/e04-c-isolated-http-final.log`、`/tmp/e04-c-sync.log`、`/tmp/e04-c-target-final.log`、`/tmp/e04-c-policy-regression-target.log`。

最终 Review 核对 Spec 的当前单合同、旧格式拒绝、来源不变量、并发、目录状态及恢复义务，与本次写集和分层证据一致。c2/c3、E04-c/E02-c 及 E02 父项可关闭。E04-d 与 E04 父项、U01/U02、D01–D03 和全局最终 Review 继续未完成。原有工作区改动保留，未提交或推送。
