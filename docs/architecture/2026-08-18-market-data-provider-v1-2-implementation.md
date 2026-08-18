# 市场数据与标的中心 v1.2 实施说明

本文记录市场数据与标的中心 v1.2 当前已落地的实现边界。产品范围和验收标准以 [市场数据与标的中心 Spec v1.2](../specs/2026-08-18-market-data-provider-spec-v1.2.md) 为准，实施拆分和完成状态以 [实施任务](../tasks/2026-08-18-market-data-provider-v1-2.md) 为准。

## 三仓职责

| 仓库                   | 当前职责                                                                                                                                                          | 不承担的职责                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `daily-stock-analysis` | Provider manifest、AKShare/efinance 适配、Control Contract、DSA Effective Policy、Provider 配置/健康/熔断、Catalog snapshot/delta，以及按 `consumer` 隔离的运行时 | 不读取 ThesisLedger 的 Desired Policy 数据库，不改变主系统 `ProviderConfig`           |
| `thesis-ledger`        | Desired Policy 与 revision history、Instrument/Asset 关联、目录同步、Control Client、产品缓存、市场数据管理 API 和 Desktop 页面                                   | 不保存 Provider 原始凭证，不让浏览器直连 DSA，不把 `provider=CACHE` 当成真实 Provider |
| `thesis-ledger-infra`  | DSA SQLite 独立卷、Control Token/Secret Key 注入、Compose 与跨仓版本/发布顺序                                                                                     | 不共享 ThesisLedger PostgreSQL/Redis 数据卷作为 DSA 控制面存储                        |

Data Contract V1 和 Control Contract V1 使用独立 Token、consumer namespace 和错误投影。旧 Data Contract V1 的 `/api/v1/thesis-ledger/*` 数据读取路径仍保留；Control Contract 只服务 `consumer=thesis-ledger`。

## Control Contract 与主系统 API

DSA 控制面当前提供以下边界：

- `POST /api/v1/thesis-ledger/control/handshake`
- `GET /api/v1/thesis-ledger/control/providers`
- `POST /api/v1/thesis-ledger/control/providers/{providerId}/config`
- `POST /api/v1/thesis-ledger/control/providers/{providerId}/test`
- `POST /api/v1/thesis-ledger/control/providers/{providerId}/remove`
- `POST /api/v1/thesis-ledger/control/policies/apply`
- `GET /api/v1/thesis-ledger/control/policies/effective`
- `POST /api/v1/thesis-ledger/control/catalog/jobs`
- `GET /api/v1/thesis-ledger/control/catalog/jobs/{jobId}`
- `POST /api/v1/thesis-ledger/control/catalog/ack`
- `GET /api/v1/thesis-ledger/catalog/snapshot`
- `GET /api/v1/thesis-ledger/catalog/delta`

ThesisLedger 对产品侧暴露 `/api/v1/market-data/*`：Policy 读取、Apply/Retry/Rollback、Provider 状态与 write-only 配置、目录搜索/确认、目录状态/同步。Desktop 的 `/market-data` 是独立管理页；移动端不持有 Control Token，也不提供控制面写操作。

## Policy、Provider 和目录语义

- `DesiredProviderPolicy` 由 ThesisLedger PostgreSQL 持久化，revision 单调递增；相同 revision 的同内容请求幂等，不同内容冲突；DSA 不可用时保持 `pending`，旧 Effective Projection 继续可读。
- DSA 只按 Effective Policy 顺序选择 Provider。MVP Provider ID 固定为 `akshare` 和 `efinance`，未配置、禁用或 circuit open 的 Provider 不进入 eligible 列表；`CHIP_SUMMARY + STOCK` 当前仅由 `akshare` manifest 声明，Indicator 通过 `DAILY_BAR` gateway 派生。
- DSA Provider 凭证只写入 DSA SQLite 的加密字段；API 和控制客户端不返回原始凭证。空 credential 表示保留已有值，只有显式 `clearCredentials` 才清除。
- Provider removal 会移除主系统 Desired routes、清理 DSA 配置、保留 DSA/ThesisLedger tombstone，并留下 route diff。
- Catalog 使用 generation、checksum、cursor 和 ACK；DSA trigger 只创建或复用异步 Job，worker 负责 Provider 抓取，ThesisLedger 通过 Job status 观察生命周期并只在完整快照 checksum 校验成功后原子切换当前目录，对旧 generation 做软停用。
- `STOCK`、`ETF`、`MUTUAL_FUND` 可以建立 Asset 关联；`LOF`、`INDEX`、`BOND`、`CONVERTIBLE_BOND` 当前只进入目录，不允许通过确认接口建立新的 Asset 关联。场外基金保持 `.OF` 语义。

## 数据读取、缓存和新持仓入口

Quote/Fund NAV 使用 Redis fresh cache 和 last-valid cache，并用进程内 single-flight 加最佳努力 Redis lock 抑制并发请求。返回中的 `provider` 始终是实际数据 Provider，`servedFromCache` 独立表达缓存来源；stale 是数据质量状态，不伪装成实时数据。

Bars 不读取 latest Quote/NAV cache 伪造历史序列；DSA 请求失败时只从 PostgreSQL `MarketBar` 历史读取同一 symbol、timeframe 和时间范围。Performance 使用 fresh-only 读取，Risk 会拒绝带 stale data-quality 的上下文；其他消费方必须继续传递 freshness 和 provenance，不能静默放宽边界。

Desktop 新增手工持仓时先调用目录搜索，再调用 `/api/v1/market-data/instruments/{id}/confirm`，提交 `instrumentId`；不再接受新持仓表单中的任意手工 symbol。编辑既有持仓仍保留兼容路径。

## 配置与迁移

infra 通过 `THESIS_LEDGER_CONTROL_TOKEN`、`THESIS_LEDGER_DSA_SECRET_KEY`、`THESIS_LEDGER_DSA_SECRET_KEY_VERSION`，以及轮换期间临时保留的 `THESIS_LEDGER_DSA_SECRET_KEY_PREVIOUS`/`THESIS_LEDGER_DSA_SECRET_KEY_PREVIOUS_VERSION` 和独立的 `thesis-ledger-dsa-data` 卷为 DSA 提供控制面持久化。DSA 启动时仅在全部已有凭证可用旧 key 验证后原子重加密；主系统迁移为 `20260818000000_market_data_provider_v12`，包含目录、Asset 关联、Desired Policy/history、Provider tombstone，以及确定性的 `.SH/.SZ/.BJ/.OF` Asset backfill。

不得使用 `docker compose down -v` 清理 PostgreSQL 或 Redis 数据卷。发布顺序应保持 DSA/Control Contract 兼容后，再发布 ThesisLedger，最后发布 Desktop/infra 配置；回滚时先恢复使用旧 Data Contract V1 的数据读取路径，不删除已有数据卷。

## 当前验证状态

已完成：Schema build、Prisma generate、ThesisLedger Server typecheck、Server 89 项测试、Desktop typecheck/build/15 项测试、Mobile 6 项测试、DSA Python AST/65 项定向回归、DSA ControlStore/ProviderRuntime/Catalog Job/Provider timeout isolation smoke、DSA 跨层黑盒 Contract Test、infra Compose config/build、四服务健康检查、revision 3→4→5→6→7→8→9→10→11 的非破坏回滚链路、efinance-only 四项在线 smoke 和三仓 `git diff --check`。Desktop 浏览器与 Mobile Web 的只读/失败态视觉证据也已记录；原生 Mobile 证据单独保留为未完成。

尚未完成：原生 Mobile 仍需要 Android `adb` 或 iOS Simulator。efinance `DAILY_BAR` 已在 `ENABLE_EASTMONEY_PATCH=true` 下恢复，四项 efinance-only 在线 smoke 均由 `efinance` 成功返回；后续若 Eastmoney 再要求登录态，可使用 write-only Cookie 配置。完整的非破坏回滚演练已执行并保留历史/数据卷；原生缺口不能由静态检查、fixture 结果或 Mobile Web 证据替代。
