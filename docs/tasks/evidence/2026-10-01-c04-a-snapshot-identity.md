# C04-a.1 场内冻结身份与复用校验

## 执行包

所属[规格](../../specs/2026-09-29-thesis-ledger-canonical-runtime-replacement.md)与[任务](../2026-09-29-thesis-ledger-canonical-runtime-replacement.md)。C03 已完成，本叶继续核验当前场内 Store 的冻结与复用边界。

- 输入：当前 RunConfig、Snapshot V3 与当前产物合同；保留已经完成的 NAV 执行链。
- 写集：`backtest-snapshot-v3-store.ts`、独立场内身份回归测试、本记录与主任务进度。
- 已确认问题：`load` 未核对请求 Run ID 和 manifest Run ID；幂等 `finalize` 在摘要相同后直接返回，未复核被比较指纹排除的 metadata 产物。
- 行为：目录身份及文件状态必须匹配；复用已冻结快照时执行完整重放门禁，拒绝缺失或篡改的 metadata，保持冻结文件原字节。
- 验证：真实本地 Parquet 正向冻结、离线复用、身份错配、旧格式、metadata 篡改/缺失及既有严格 PIT 负例；通过后执行 Server 包级、类型/构建和模块门禁。
- 验收边界：本叶不据本地文件测试勾选整个 C04；隔离数据库、目标 HTTP/Worker 和完整结果读取验收分别记录。

## 结果

已完成本叶源码及本地验证：

- `load` 在 Schema 解析后核对目录 Run ID 与 manifest Run ID，并核对 `building.json`/`finalized.json` 与内容状态。非法文件即使允许缺失也明确拒绝，不回退或重写。
- 已冻结快照的 `startBuild`、幂等 `finalize` 和并发 finalize 复用成功前统一经过 `replay`，复核全部产物、比较指纹及执行证据。metadata 不参与比较指纹，但仍必须通过完整性门禁。
- 新增 7 项回归使用真实 Parquet，覆盖离线复用、两种目录身份错配、两种文件状态错配、metadata 缺失和同长度字节篡改。拒绝后冻结文件字节保持不变。

| 层级 | 命令与结果 |
| --- | --- |
| 定向 | Server `vitest run`：`v3-snapshot-reuse-identity`、`current-snapshot-version-boundary`、`v3-strict-snapshot-replay-guard`、`v3-snapshot-builder`，4 文件 23 项通过。 |
| 包级 | `pnpm --filter @thesis-ledger/server exec vitest run --no-file-parallelism`：247 文件、2001 项通过；30 文件、109 项跳过。跳过项不算数据库或外部运行态通过。 |
| 类型/构建 | Server `typecheck` 与 `build` 通过。 |
| 代码与边界 | 两个代码文件定向 ESLint、四个本叶文件 Prettier、`check-boundaries.mjs` 和 `backtest-v2-isolation-audit.mjs` 通过；隔离扫描 158 文件。 |

首次定向测试中，测试构造的 building 文件保留了值为 `undefined` 的属性，canonical 序列化将其变为 `null`，因此先被 Schema 拒绝。修正测试构造为删除终态字段后，身份与状态负例均通过；生产序列化及合同未调整。

本叶只完成本地文件冻结边界，未更新目标容器、执行隔离 PostgreSQL 或目标 HTTP/Worker 验收。C04-a.2 继续核验持久化结果和运行态；C04-b/C04-c 另行对账，整个 C04 保持未完成。改动未提交。
