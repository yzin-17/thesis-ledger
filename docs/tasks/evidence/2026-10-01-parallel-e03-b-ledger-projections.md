# E03-b 当前信封命令与投影本地收口证据

## 执行边界与状态建议

- 任务：Canonical Task 的 E03-b；执行状态建议为 `worker_done`，仅表示本地命令与投影叶完成。
- 依据：[Canonical Spec](../../specs/2026-09-29-thesis-ledger-canonical-runtime-replacement.md) 的 Ledger 经济不变量及持久格式判别、[Canonical Task](../2026-09-29-thesis-ledger-canonical-runtime-replacement.md) 的 E03-b 验收断言，以及[当前信封证据](2026-09-29-canonical-ledger-envelope-marker.md)。经济成本和结算口径沿用[Ledger Spec](../../specs/2026-08-26-trade-execution-ledger-system.md)。
- 前置 Review：E03-a 当前信封和数据库标记已具备隔离数据库证据，叶的本地执行范围就绪。源码沿用已有当前合同，不重新编写合同，不改公共 Schema/Domain。
- 共享 Spec、两份主 Task、handoff、TODO 和状态勾选本轮只读；仓库按 `handoff` / `HANDOFF` 文件名反查未发现独立交接文件，以任务正文与上述证据为恢复入口。此文件记录供主线合并的状态建议。
- 初始工作区已有大量未提交改动。本轮未重置、清理、提交或创建子代理，未改 Backtest、Market、DSA、NAV Schema、Worker 入口、Desktop/API Client、数据库 Schema/migration 或 infra。

## 核对结果与本轮改动

已有实现已覆盖命令事件 `version=3`、Repository 显式写入 `envelopeVersion=3`、锁内拒绝旧账户、修订链和幂等重放、核心投影重建、Import 原子提交和回滚、Portfolio 当前现金消费。本轮没有重做这些实现，也没有为版本后缀建立别名。当前经济 payload 仍为 `payloadVersion=1`。

本轮发现并修复现金投影的拒绝错误传播缺口：`toStoredV2Event` 原来在 `factId` 检查之后转换信封，且将不支持的信封异常包装为普通 `CashProjectionEventError`。Portfolio 因而收到普通异常，丢失 `UNSUPPORTED_CONTRACT_VERSION`。现在先检查持久信封，再解释字段和 payload；无 `factId` 的旧行同样返回稳定拒绝码。当前信封下的损坏 payload 继续返回带事件 ID 的解析异常。

本轮写集：

| 文件 | 本轮责任 |
| --- | --- |
| `apps/server/src/ledger/cash-projection.ts` | 增加前置当前信封检查，并内联原有转换输入；本轮前后均为 584 行，未扩张存量文件规模 |
| `apps/server/test/ledger/core-projection.test.ts` | 旧迁移负例匹配信封拒绝；损坏当前 payload 夹具显式标记当前信封；保留既有其余改动 |
| `apps/server/test/ledger/current-envelope-consumers.test.ts` | 新增现金、两条重建入口和 Portfolio 的旧行拒绝负例 |
| `apps/server/test/ledger/current-envelope-commands.integration.test.ts` | 新增独立 PostgreSQL 命令、投影、竞争与回滚验证 |
| 本证据文件 | 独有执行记录与主线状态建议 |

事件写入反查只有 Repository 的 `ledgerEvent.create`；生产 Ledger/Import/Portfolio 未发现 `version: 2` 创建。`scripts/check-boundaries.mjs` 已有 Ledger 禁止反向依赖 Import 的规则，本轮未改变模块 import/export 或新增跨 feature 所有权，故无需调整边界规则。

## 验收断言与证据映射

| 断言 | 核验结果与证据层 |
| --- | --- |
| 创建、修订、VOID、RESTORE | 真实命令服务、Repository 和 PostgreSQL 完成四阶段；只保留有效事实，VOID 清空 Position/Cash，RESTORE 保留 factId；四条不可变行均标记信封 3 / payload 1，账户 Revision 和投影代数同步到 4 |
| 幂等与竞争修订 | 同账户两个并发创建只保存一个事件，一方幂等重放；两个竞争修订只有一个成功，另一方明确 `LEDGER_CORRECTION_NOT_CHAIN_TIP`，最终 Revision/Generation 为 2 |
| 投影失败完整回滚 | 独立数据库给 CashBalance 插入设置定向失败触发器；真实命令已追加事件并重建 Trade 后发生失败，事件、状态、Position、Trade 全部子表、CashBalance/CashSettlement 与失败前快照完全一致；触发器随后移除 |
| 经济 golden 与 T+1 | 入金 1000，买入 10×10、佣金 2；卖出 4×15、佣金 1、税费 3。剩余数量 6，原始单位成本 10，毛价差 20、净收益 15.2。T 日已结算 1000、待付 102、待收 56；显式次日 `settledAt` 到期后余额 954、待付/待收归零，事件和账户 Revision 不改变 |
| 份额与投资收入 | 当前信封 SPLIT 1→2、MERGE 2→1、BONUS_SHARE +2 与 DIVIDEND 5；数量最终 12，三条份额调整物化，分红单独归属，价差毛/净收益保持 0，现金为 -97，不自动补充值 |
| Import 当前消费 | PostgreSQL 中以 IMPORT 来源写入当前成交，真实 ImportRollbackService 追加当前 VOID，保留来源行 ID 和父事件引用；草稿 cancelled，Position/Trade/Cash 清空。已有定向测试同时覆盖审核提交、部分提交、账本变化、并发草稿及复合持仓操作 |
| 旧链拒绝 | 真实旧账户阻断创建、REPLACE、VOID 和 Import 回滚；账户状态、事件及物化快照不变，草稿保持 committed。现金、核心和简化 Position 重建及 Portfolio 在消费旧行时拒绝，无事实 ID 的旧行不被过滤；重建负例证明拒绝发生在策略创建及物化写入前 |

费用和原始成本由现有领域合同分别保存；Position 原始单位成本不含另列费用，净已实现收益扣除分配买入费用及卖出佣金/税费。本轮 T+1 验证显式结算时刻的经济投影，未增加交易日历推断或证明其他 Backtest 结算算法。

## 验证命令与结果

验证对象为当前未提交工作区。Ledger/Import/Portfolio 源码及其测试共 68 份 TypeScript 文件在最终检查时的聚合 SHA-256 为 `40a81fa5758bdf95c452016f9a7d7cfac2f78e0fc0535f6e7f7a13fb88691199`；按路径排序，依次输入路径字节与文件字节。并行任务后续改变相关输入时需重验受影响范围。

| 层级 | 命令 | 结果 |
| --- | --- | --- |
| 定向 | `pnpm --filter @thesis-ledger/server exec vitest run test/ledger test/imports test/portfolio` | 19 文件、156 项通过；2 文件、8 项按数据库环境条件跳过。此轮 PostgreSQL 测试尚为 6 项，后补份额调整测试由独立数据库实际执行 |
| 隔离 PostgreSQL | `LEDGER_CURRENT_TEST_DATABASE_URL=postgresql://<隔离用户>:<测试密码>@127.0.0.1:<临时端口>/ledger_current_fixture pnpm --filter @thesis-ledger/server exec vitest run test/ledger/current-envelope-commands.integration.test.ts` | 最终 7/7 通过，包含真实行锁、事件和完整投影写入/回滚 |
| Server 包级 | `pnpm --filter @thesis-ledger/server exec vitest run --maxWorkers=1` | 237 文件、1918 项通过；26 文件、90 项环境条件跳过；约 138 秒。跳过项不计为验收通过，本轮 PostgreSQL 7 项另行实际执行 |
| 类型与构建 | `pnpm --filter @thesis-ledger/server typecheck`；`pnpm --filter @thesis-ledger/server build` | 最终均通过 |
| 最终夹具修复复验 | `pnpm --filter @thesis-ledger/server exec vitest run test/ledger/current-envelope-consumers.test.ts` | 4/4 通过；此后类型与构建通过，未因单纯夹具类型修正重复全包 |
| 模块边界 | `node scripts/check-boundaries.mjs` | 通过，已有 Ledger→Import 禁止规则有效 |
| 本轮目标文件 ESLint | `pnpm exec eslint apps/server/src/ledger/cash-projection.ts apps/server/test/ledger/core-projection.test.ts apps/server/test/ledger/current-envelope-commands.integration.test.ts apps/server/test/ledger/current-envelope-consumers.test.ts --max-warnings=0` | 通过 |
| 生产修改与新增测试格式 | `pnpm exec prettier --check apps/server/src/ledger/cash-projection.ts apps/server/test/ledger/current-envelope-commands.integration.test.ts apps/server/test/ledger/current-envelope-consumers.test.ts` | 通过 |
| 既有测试整文件格式 | 将 `core-projection.test.ts` 追加到上项检查 | 不通过；既有代码格式差异保留，未整文件重排并行 WIP。其本轮两个小改动不新增格式问题，ESLint 与定向测试通过 |
| 尺寸与空白 | `node scripts/check-file-size-guardrails.mjs`；`git diff --check -- apps/server/src/ledger/cash-projection.ts apps/server/test/ledger/core-projection.test.ts` | 均退出 0；尺寸检查提示 10 处既有文件 warning，未提供有效 ratchet baseline，不将其视为已证明全部存量文件没有增长；本轮 cash 文件 584 行不增长 |

失败过程保留：首轮新增消费负例揭示错误码包装问题；修复后两项既有测试需区分旧信封与损坏当前 payload，夹具更新后定向通过。隔离首轮 golden 将原始单位成本误写为含费成本、竞争错误码误写为 Revision 冲突；核对领域成本来源和链末检查顺序后修正断言，未改变经济实现。类型/build 首轮发现新增消费夹具 `payload: unknown` 类型，显式给出 JSON payload 后局部、类型与构建通过。

隔离数据库使用已有 `postgres:17-alpine`，专属容器 `e03-b-ledger-20261001`、内存数据目录、loopback 随机端口、独立 owner/app role，没有挂载业务卷。通过 `discoverDatabaseStructure`、`buildDatabaseRebuildSql` 与现有 infra 权限 SQL 初始化完整 24 项 migration、70 张表，head 为 `20260930100000_rebase_legacy_market_policy`，入口校验数据库名和 owner。测试使用 owner 以注入专属失败触发器；该证据不替代目标应用角色 HTTP 验收。临时 SQL/日志位于 `/tmp/e03-b-*`，容器已停止并由 `--rm` 自动移除。

## 最终一致性 Review 与剩余门禁

- 本叶所需命令、经济与旧行拒绝断言已有定向及真实隔离 PostgreSQL 证据；Server 包级、类型、build、边界和目标 ESLint 通过。
- 生产改动只收敛旧信封错误传播，维持经济合同及核心模块依赖方向；未改公共合同或数据库结构。
- Review 结论：E03-b 本地叶通过，可由主线按并行基线复核后更新共享 Task。已记录整文件格式检查限制；不宣称整仓格式门禁全部通过。
- E03-c 未执行：API Client/Desktop 审计展示和动作、旧记录展示错误、浏览器/Electron 交互验收仍由对应叶负责。
- E03-d 未执行：官方 infra 更新、目标应用角色、Server/Worker/客户端同源、新事件 HTTP 纵向闭环、目标旧行拒绝及必要回滚演练均未执行；本轮未触目标运行态。
- E03 父项及 Canonical 整体继续开放。无新 TODO/归档变更，全部改动保持未提交；不存在本轮仍在运行的测试进程或占用的隔离容器。
