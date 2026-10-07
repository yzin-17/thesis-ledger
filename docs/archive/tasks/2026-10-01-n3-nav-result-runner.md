# N3 净值结果与离线 Runner 实施

规格：[N3 净值结果与离线 Runner 合同](../../specs/2026-10-01-n3-nav-result-runner.md)。启动依赖为 N1 与已完成的 N3 离线经济执行包，不等待 N2 全组。

- [x] R01：独立 NAV 结果 Schema 与统一读取合同；公开身份、来源、可见性、成交/指标及期末待处理。对应 AC01/02/04。
- [x] R02：现行 Runner 增加 NAV 离线能力入口及冻结结果校验；验证精确 Snapshot/Artifact 与取消。对应 AC03/04/05。
- [x] R03：定向、包级、类型/构建、边界检查与最终一致性复核。

写集：新增 `packages/schemas/src/backtest-nav-result-v3.ts` 及专属测试，Schemas index 追加导出；Backtest NAV 结果投影、校验和 Runner 专属实现、现行 Runner 最小能力接线、专属测试与本轮配对文档/证据。共享主 Spec/Task/handoff 只读；不修改 N2、Prisma、Worker 或 Market/DSA Reader。

停止点：本地结果及 Runner 独立交付完成，或出现真实跨写集阻塞后记录并停止。整个 N3/N4 不勾选。

## 实施证据

实现与独立验证完成，见 [结果与 Runner 证据](../../tasks/evidence/2026-10-01-n3-nav-result-runner.md)。Schemas 全包 586 项、NAV/离线/场内 Runner 定向 36 项、独立类型/编译及复杂度/边界通过。继承 [N3 离线经济证据](../../tasks/evidence/2026-10-01-parallel-n3-nav-offline.md)，仅复用输入未变化时仍有效的验证。

初次停止时 R03 未勾选：Server 常规类型/构建失败于 N2 新增 `backtest-nav-run.controller.ts:14` 的 UUID `version: 'all'` 类型不符，当时按验证分层没有运行最终全包测试。

2026-10-01 公共集成阶段已修复该阻塞，Server 最终常规类型、build 与全包回归通过（1987 项通过、103 项跳过），边界与最终一致性复核通过，R03 完成。真实 PostgreSQL/BullMQ 的三个独立执行场景另外通过，见 [N3/N4 集成证据](../../tasks/evidence/2026-10-01-n4-nav-target.md)。本叶的完成只覆盖结果与 Runner 范围；目标业务验收由 N4 单独记录。

本任务的全部叶完成后归档；Worker/消费面与目标验收亦已完成，见 [归档汇合任务](2026-10-01-n3-nav-worker.md)。
