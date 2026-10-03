# C04 冻结格式边界收口

## 执行包与验收矩阵

所属[规格](../../specs/2026-09-29-thesis-ledger-canonical-runtime-replacement.md)与[任务](../2026-09-29-thesis-ledger-canonical-runtime-replacement.md)。用户授权完成整个 C04；沿用 C04-a.1 的本地文件证据，补齐结果、证据语义和真实运行态。

| 阶段 | 完成断言 | 当前状态 |
| --- | --- | --- |
| C04-a.2 持久化与消费 | 场内 manifest/结果重新计算摘要，列表和单项拒绝篡改、旧版本及错配；隔离 PostgreSQL 与真实 Worker/HTTP 正向和负例 | 已完成 |
| C04-b 证据边界 | 对账 proof1/2、series/model-v1 的所有者与用途；归档绑定不授予历史资格，严格 PIT 与伪造证据继续拒绝 | 已完成 |
| C04-c NAV 冻结/结果 | 当前来源、可见性、原文、Parquet、pending 与结果身份独立验证，复用 N2/N3/N4 的真实业务证据 | 已完成 |
| 目标部署验收 | 官方 infra 入口、源码/目标一致、Server/Worker 健康；真实目标 HTTP 当前读取与冻结重放 | 已完成 |

本轮写集限定为场内结果读取门禁及其测试、确认为必要的摘要帮助函数、现有隔离 Worker 验收扩展、本记录和主任务。PIT 与 NAV 若现行合同已正确，只补证据和回归，不机械删除不可变证据版本。保留所有无关 WIP，数据库负例放在隔离库，不改写目标已有业务记录。

消费面复核增加优化 Run 服务：成功 Run 的读取改为 `statusForRead`，评分前调用 Backtest 所有者的现行冻结守卫；研究/优化执行仍经现行 Runner 和 Store replay。该服务 317 行，补门禁不扩展其职责。需要重新验证并再次官方快更，因为首次快更之后发现这条绕过读取的消费者。

## 已确认缺口

场内当前读取只比较存储中的摘要字符串，没有重新计算 manifest 和结果摘要；字段篡改且不改摘要仍可能被返回。NAV 已在物理重放后验证结果摘要与冻结事实，沿用现行实现。

## 验证记录

| 层级 | 输入与最后一次结果 |
| --- | --- |
| Server 冻结/PIT/NAV 定向 | 11 文件、169 项通过，包含原文撤销、时钟精度、归档错配、严格 PIT 拒绝、NAV Parquet 与结果。 |
| 场内读取与执行定向 | `current-run-boundary`、`v3-runner`、`v3-research-execution`：32 项通过；当前读取另覆盖重新签名的结果身份/规则错配及优化评分入口拒绝。 |
| 优化消费回归 | 25 文件、121 项通过；11 文件、33 项外部集成测试跳过。 |
| Schemas / Domain 定向 | PIT、模型、NAV 冻结与结果 137 项；NAV 时点/申赎/模型消费 31 项通过。C03 包级基线的其他合同未改动。 |
| Server 最终包级 | `pnpm --filter @thesis-ledger/server exec vitest run --no-file-parallelism`：247 文件、2005 项通过；30 文件、109 项因外部环境未配置跳过，未将跳过项计为通过。最终源码收敛后重新执行。 |
| API Client | 8 文件、46 项通过，场内/NAV 当前响应与披露合同保留。 |
| 类型 / build | 最终 Server `typecheck`、`build` 通过；官方快更再次构建 Server 及 workspace 依赖成功。 |
| 边界 / 复杂度 | `check-boundaries.mjs`、158 文件的回测隔离扫描通过；定向 ESLint 与复杂度 20/函数长度 220 门禁无告警。读取守卫按配置、Run 身份、模型、结果职责拆分，未提高阈值或增加 ignore。 |
| 文件尺寸 | 本轮源码和测试均低于对应尺寸阈值。全仓扫描报告 10 个既有超大文件告警；未提供有效 Git baseline，不能宣称已强制验证全仓 ratchet。 |
| 隔离真实运行态 | `C04_WORKER_ISOLATED=1 E01_N3_POSTGRES=1 ... vitest run test/backtest/v3-worker-runtime.integration.test.ts test/backtest/backtest-nav-worker-postgres.integration.test.ts --no-file-parallelism`：最终 2 文件、4 项集成场景通过，19.52 秒；实际 PostgreSQL/Redis 使用唯一名称、随机 loopback 端口与 tmpfs，完成后全部清理。 |

场内集成场景经 HTTP 创建、真实 BullMQ 与生产 Worker 进程到数据库终态，覆盖普通、多窗口、缺日执行和损坏快照失败，离线结果校验和一致。新增 9 类持久化负例：旧 mode/config/manifest/result、manifest 与结果篡改、缺 manifest、重新签名的内容身份错配及缺模型披露；每例 HTTP 409、列表过滤、重试/取消拒绝，拒绝前后数据库记录相同，最后恢复隔离原记录并返回 HTTP 200。账户与账本哨兵未改变。NAV 的重复投递、取消晚到 CAS、有界三次故障重试分别通过。

## 目标运行态

本轮未修改运行时依赖、Prisma、migration、Dockerfile 或系统依赖，目标容器存在且运行；按 `AGENTS.md` 选择 infra 官方 `./scripts/sync-code.sh thesis-ledger`。兼容性预检通过，Server 与 Worker 同步并健康；最终启动时刻为北京时间 2026-10-02 01:13:08。镜像仍为 `sha256:ed7f1174ba5e6d2bfe944cc4aa7166afe2c2c435feaffaf56e9651866c9896a3`，更新在可写层，容器重建后需再同步或完整更新；不把快更记为镜像发布。

实际启动入口为 `/app/apps/server/dist/src/main.js` 与 `/app/apps/server/dist/src/backtest/backtest-worker.main.js`。验收脚本首次检查了未使用的 `/app/dist`，因此摘要不同；核对实际 Cmd 后改为检查真正执行的目录。脚本 SQL 的内嵌引号也改为结构化编码，避免多层字符串转义错误。未修改应用源码或数据库以绕过验收。

[可重复目标验收脚本](../../../scripts/c04-target-acceptance.mjs)核对两容器各 8 个实际运行模块，直接物理回放已有场内/NAV Run，并验证实际 HTTP 的当前响应和旧模式拒绝。批量 HTTP 遇到 429 时依服务 `Retry-After` 等待，不取消限流，不将 429 当作旧合同拒绝通过。最终脚本返回成功：16 个模块摘要相同，2 个核心容器健康，当前场内列表 2 条、NAV 列表 6 条，35 条旧模式记录逐项 HTTP 409/`UNSUPPORTED_CONTRACT_VERSION` 且不在当前列表；当前成功结果 7 条均经实际 HTTP、现行响应 Schema 和重算结果校验和验收。

| 资产 | 目标 Run | 离线与持久化结果校验和 | 完整度 / 期末待处理 |
| --- | --- | --- | --- |
| 场内 | `4a8694de-f8b4-4d47-b0db-5ec16b29666e` | `733135b633176f64` | complete / 0 |
| NAV | `0cca819b-1c57-43fe-8f54-ba01006d9a32` | `e0a6ec6408921692` | unavailable / 1 |
| NAV | `02c4e48a-b6ee-4082-84ea-44fd54146f2c` | `466917da7b8c572b` | partial / 0 |
| NAV | `3829a84b-1475-4984-be97-23b91da7117b` | `3c8e6809057cd276` | unavailable / 1 |
| NAV | `cd2d2b7b-314c-42e0-9044-2e656322fac8` | `05ba89ea99d1872b` | partial / 0 |
| NAV | `52af3a15-a114-4ff1-b997-0a6533630e8c` | `6446975b5a5b338e` | partial / 0 |
| NAV | `f0db5745-a05d-458d-8a94-7b9c415466d2` | `92f694dbabe2afbf` | unavailable / 1 |

目标内存篡改副本和伪严格 PIT 均被拒绝；未篡改实际冻结文件或数据库。物理重放前后及全部 HTTP 检查之后的 `BacktestJob` 见证相同：43 行、摘要 `459bf78cc2db44b8a984f6524df11698`。最终启动以来 Server/Worker 日志未出现缺表、模块缺失、Nest 依赖解析或 Schema 版本错误。

## 最终收口

C04-a.1 沿用[冻结身份与复用校验](2026-10-01-c04-a-snapshot-identity.md)；a.2、b、c 与目标验收均已完成，整个 C04 可以勾选。当前源码未检出旧 Snapshot V1/V2 标识、旧 manifest decoder 或迁移/回放入口；不可变证据版本与 NAV 研究假设保留其当前语义。严格 PIT 正向能力、C02 全状态机、客户端迁移和部署发布仍按各自任务验收，不因 C04 完成自动勾选。未提交改动，未清理无关 WIP。

## C04-b 证据版本归属

- `market-pit-reconstruction-v3.ts` 的 proof1 包含精确来源、价格口径、逐 Bar 归档引用和截止时刻；proof2 增加历史决策窗口、原文、日历、来源见证与逐 Bar 决策绑定。两者是当前不可变证据结构，不是旧 RunConfig 或旧 Snapshot 解码器。
- `bindMarketPitReconstructionManifestV3` 只返回 `bound`；Server 的 `bindMarketPitArchiveContentV3` 逐份读取冻结响应，重算摘要、来源/窗口/Bar 对账后只返回 `archives-bound`。来源时钟绑定最多返回 `source-times-bound`。这些必要条件均不产生 `qualified`，不授权严格 PIT 执行。
- `marketPitReconstructionRepository` 按部署配置读取原文，核对 UTF-8、大小、文件摘要和引用，撤销后不复用缓存。proof2 保留更高精度时钟，旧 proof1 也继续核对截止时刻，不能把晚抓取的整窗假定为历史当时可见。
- `assertSnapshotV3PitExecutionAvailable` 继续在 finalize/replay 拒绝 `point-in-time`；最终历史窗口核验与离线封存能力尚未提供，返回明确不可用，不回退到固定快照。C04 完成的是边界拒绝验收，不宣称补齐严格 PIT 正向执行能力。
- `market-series-v1:identified:*`、`market-frozen-window-v1`、多窗口编码及 `execution-model-v1` 是现行来源/内容身份。当前 Snapshot metadata 读取按合同解析模型并重算模型摘要、核对 id/version/格式；结果读取同步核对模型披露，不按名字删除这些标识。
- `MarketBarWindowEvidenceV3.completeResponse/completeResponseHash` 为审计归档输入。`findFrozen` 对两字段均缺失返回不可用，对单字段缺失或摘要错误拒绝；补字段仅发生在现行精确生产响应、既有身份事实一致且两字段都为空时，冲突内容拒绝。它不转换旧 Run/Snapshot，也不授予历史资格。

## C04-c NAV 独立边界

`LocalNavSnapshotStore` 在使用产物路径前验证当前 Schema、Run ID 与 manifest 摘要，物理读回 NAV/context Parquet，复核可比指纹、来源原文与事实、完整计划、模型和可见性。幂等 freeze 先 replay，已发布产物缺失不自动重建；不同输入、费用模型、跨 Run 与重新签名的原文错配继续拒绝。

NAV 公开读取先恢复物理冻结输入，再执行 `verifyNavResultV3`，核对当前 Schema、Run/策略/Snapshot、来源/可见性、模型、规则日期、精确净值定价与重算结果校验和。严格 NAV 发布时间合同和显式研究日期假设分别保留；期末 pending 与不可用指标不被补成完整结果。

复用 [N2 冻结合同](2026-09-30-e01-n1-2-nav-freeze-store.md)、[N3 结果与离线执行](2026-10-01-n3-nav-result-runner.md)、[N4 实际目标业务与浏览器验收](2026-10-01-n4-nav-target.md)，本轮另跑本地、隔离 PostgreSQL/BullMQ 和目标原 Run 重放。未重新发起 Provider 请求或收费模型调用。
