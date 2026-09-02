# 自动标的目录就绪 Spec

## 背景与问题

持仓录入依赖 `Instrument` 目录搜索。当前 ThesisLedger 服务在本地目录尚未投影任何 generation 时仍可对外提供搜索接口，接口会返回空数组，客户端因而把本应存在的标的展示为“未找到”。用户必须进入市场数据页面手动同步目录才能恢复搜索，这一运维动作不应成为普通用户流程的一部分。

## 目标

- 由 ThesisLedger Server 自动发起并完成目录就绪保障，普通标的搜索不依赖用户手动同步。
- 服务启动、目录为空或上一轮成功同步已超过 24 小时时，复用 DSA Catalog Job 与 snapshot/delta Contract 恢复或刷新本地目录。
- 在同步尚未完成或 DSA 不可用时，不把“目录尚不可用”误报为“标的不存在”。
- 保持 DSA 单一目录来源、generation 原子投影和 Catalog Job 去重语义。

## 非目标

- 不改变 Desktop 标的选择、人工录入或账户类型筛选规则。
- 不新增 Desktop、Mobile 到 DSA 的直连，不暴露 Control Token。
- 不重新实现 DSA Provider 目录抓取、也不通过清空数据卷恢复目录。

## 现状与约束

- DSA 通过 Catalog Job、snapshot/delta 与 ACK 提供版本化目录；ThesisLedger 负责本地投影及搜索。
- 现有手工 `POST /market-data/catalog/sync` 已能触发并投影目录，但 Server 没有把它作为目录就绪保障的一部分。
- 自动流程不得无限阻塞 Nest 启动或普通请求；并发触发必须复用既有 DSA Job Manager 的去重能力，并在 ThesisLedger 内避免重复投影。
- 目录是低频变化的参考数据，不按行情数据频率刷新。24 小时内已有成功同步记录且存在可搜索标的时，不得仅因定时检查或 Server 重启再次触发 Provider 目录构建。

## 设计方案

ThesisLedger Server 增加目录就绪协调器，由它负责刷新调度，DSA 继续负责 Provider 抓取、Catalog Job 去重和 generation 生成。协调器在启动后及运行期间执行轻量本地状态检查：目录为空、没有成功同步记录或距上次成功同步已超过 24 小时时，才触发或复用 Catalog Job。轻量检查可以高于 24 小时刷新频率，但新鲜目录的检查不得触发 DSA Job。

协调器为启动后的后台工作，不阻塞服务就绪。搜索路径只在本地没有任何完整可用目录时使用同一协调器等待最多 5 秒：若在请求时限内完成投影，继续本次搜索；若仍未就绪或 DSA 不可用，返回可区分的目录未就绪错误，而不是空搜索结果。搜索请求超时不得取消后台 Job；协调器必须保留 Job ID，并按 DSA Job 的终态与 lease 语义持续跟踪至成功、失败或超时，再决定投影、ACK 或退避。

目录状态分为：

- `ready`：存在完整目录，且距上次成功同步未超过 24 小时；
- `stale`：存在上一代完整目录，但距上次成功同步已超过 24 小时；搜索继续使用上一代目录，后台刷新失败不得使搜索不可用；
- `unavailable`：不存在完整目录；非空搜索必须等待协调器或返回目录未就绪错误。

`refreshInProgress` 与上述状态正交，用于表示后台 Job 是否正在执行。单个 Server 进程内的启动、定时检查和搜索共享一次协调工作；多个 Server 实例依赖 DSA Job Manager 复用同一 Job，并通过 PostgreSQL Serializable 投影、generation/checksum 复查和幂等 ACK，确保同一 generation 最多提交一次一致投影。并发失败方必须复查已提交状态，不得把正常并发竞争误报为目录不可用。

## 对外行为或接口变化

- 正常目录就绪时，现有 `GET /market-data/instruments/search` 响应结构不变。
- 本地目录未就绪且在 5 秒内不能恢复时，搜索接口返回 HTTP `503`，稳定错误码为 `catalog_not_ready`；响应至少包含 `errorCode`、兼容字段 `error`、`message` 与 `retryable: true`。客户端据此提示“目录正在准备或暂不可用”，不得显示“未找到”。
- `GET /market-data/catalog/status` 保留现有 generation、checksum、cursor、syncedAt 与 instrumentCount，并以兼容方式增加 `readinessState`、`refreshInProgress`、`activeJobId`、`lastAttemptAt`、`lastError` 与 `retryAt`，供运维判断目录是否可用、是否正在刷新及最近失败原因。
- 手工同步入口保留为运维诊断能力，不再是用户完成持仓录入的前置步骤。

## 数据、状态或兼容性影响

- 不新增目录身份字段，不改变 `Instrument`、`Asset` 或已确认关联。
- 不删除或覆盖上一代完整目录；只接受现有 checksum/generation 校验通过的 projection。
- DSA 与 ThesisLedger 的既有 Catalog Contract 版本和 ACK 语义保持兼容。
- 新增的目录就绪诊断状态为进程级瞬时状态，不替代 PostgreSQL 中的 `CatalogSyncState`；Server 重启后以持久化的 generation、checksum、cursor 与 syncedAt 重新推导 readiness。

## 测试策略

### 关键可观察行为

- 空目录 Server 启动后自动请求目录同步并投影成功。
- 在自动同步尚未完成时的搜索不会返回空数组冒充无匹配结果。
- 搜索等待 5 秒后返回目录未就绪时，后台仍跟踪同一 Job；Job 在 30 秒后才成功也能被投影，不会创建替代 Job。
- 新鲜目录在 Server 启动和轻量定时检查时不创建 DSA Catalog Job；超过 24 小时后才触发刷新，刷新期间与失败后仍可搜索上一代完整目录。
- 同一进程和多个 Server 实例的并发就绪检查不会创建重叠 DSA Catalog Job，也不会提交重复或不一致的目录投影。
- DSA 不可用或 Job 失败时，服务保持可用并给出明确、可重试的目录未就绪结果。
- 目录状态接口能区分 ready、stale、unavailable，并暴露进行中 Job 与最近失败诊断。

### 优先测试层级

以 Server 服务及 Controller 的定向自动化测试为主；更新运行容器时，再以目录状态和搜索接口执行黑盒回归，不把本地代码完成与容器发布状态混为一体。

### 可复用的现有测试入口

`apps/server/test/instrument.service.test.ts`、目录就绪 Service 定向测试与现有市场数据 Controller、DSA Client 测试辅助设施。

### 关键边界与回归场景

验证真实 `onModuleInit` 启动路径、超过 30 秒的长 Job、24 小时刷新边界、跨实例投影竞争、已有非空目录搜索、delta 投影、ACK、手工同步端点和 DSA 不可用映射不回归。

## 风险与备选方案

启动时同步可能受外部目录源耗时影响，因此采用后台启动与请求有界等待，避免把服务存活与目录完成混为一体。只在搜索时直接触发同步会让冷启动首个用户承担不确定等待，不能满足目录由服务器自动维护的目标。

将实际目录刷新设为 24 小时，是在新增标的及时性与第三方 Provider 成本之间的默认平衡；需要立即更新时保留手工同步入口。轻量状态检查不等于目录刷新，不应调用 DSA 或外部 Provider。

## 未决问题

### Blocking

无。

### Non-blocking

- 轻量状态检查默认每 5 分钟执行一次；失败后使用有限退避，空目录也可由后续搜索提前重试。该间隔只影响自动恢复延迟，不改变 24 小时实际刷新频率、接口错误语义或目录一致性。

## 验收标准

- AC1：在本地目录为空的情况下，Server 无需用户调用手工同步接口即可自动完成目录同步和投影。
- AC2：标的搜索在目录准备完成后直接返回匹配结果；目录未就绪时不得把该状态表现为“未找到”。
- AC3：并发启动、搜索或目录检查复用 DSA Catalog Job；同一 generation 最多提交一次一致投影，并发失败方可识别已提交结果。
- AC4：DSA 不可用、同步失败或超时时，服务不被阻塞；没有完整目录时搜索返回 `503 catalog_not_ready`，已有完整目录时继续提供上一代搜索结果。
- AC5：已有目录在距上次成功同步未超过 24 小时时，Server 启动和轻量检查均不触发 DSA Catalog Job；超过 24 小时后自动刷新。
- AC6：搜索的 5 秒等待结束后不取消后台 Job；只要 Job 在 DSA lease/终态边界内成功，Server 就会完成投影和 ACK。
- AC7：目录状态接口可区分 ready、stale、unavailable，并暴露 refreshInProgress、activeJobId、最近尝试、最近错误和退避截止时间。
