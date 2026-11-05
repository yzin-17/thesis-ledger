# E03 回测经济关联与最终收口

日期：2026-10-01。用户要求继续 E03；N2、N3、N4 已完成。本次补齐父任务的 Backtest 经济关联验收，并整合已有 E03-a 至 d 证据。

## 关联语义与实际入口

现行与 Git HEAD 基线中的 `packages/schemas/src/ledger-v2.ts`、账户 Ledger 命令、查询及领域事件均没有直接绑定 Backtest Run 的字段或入口；Prisma 的 `LedgerEvent` 同样没有该关系。前次记录“未找到直接关联”是库存结果，不能据此推导应新增账户事件到 Run 的业务能力。

现行关联链为：

- 场内：`LocalSnapshotV3Runner.run` 核对 Run 和冻结身份后，将 `manifest.runId` 传给 `runExchangeVertical`；Exchange 经 `SimulationLedger` 应用成交、结算和公司行动，结果携带 Run、策略版本、快照及校验和。当前读取守卫核对数据库身份与结果身份，拒绝不一致记录。
- NAV：`BacktestNavRunExecution.execute` 从实际 Job 加载已消费准备凭证和物理冻结输入；`LocalNavSnapshotV3Runner` 调用离线策略与 `CnNavSimulation`，后者使用独立 `SimulationLedger`。申请身份由 Run 派生，成交的 `orderId` 对应申请，现金及份额投影写入该 Run 的结果。`verifyNavResultV3` 核对冻结身份、来源、可见性、模型和校验和。
- 账户 Ledger 仍由账户命令及仓储写入；Backtest 不把模拟成交写入账户事件。本次只有测试、只读验收脚本及说明文档变更，没有修改 Backtest、Worker、Prisma 或 infra 的生产实现。

Spec 已将“关联 Run”明确到这些现行入口。该说明保留既有经济能力和拒绝标准，未引入账户回测成交导入流程。

## 定向及包级验证

新增 `apps/server/test/ledger/current-backtest-association.test.ts`，使用两个独立 Run 的真实 Parquet 冻结产物及现行 Runner：相同经济输入保留相同现金、份额；申请与成交身份彼此隔离；另一 Run 的结果或引用不能用于本 Run；改写 Run、策略版本或快照并重算 checksum 仍被拒绝。共 5 项通过，来源为受控 fixture。

```sh
pnpm --filter @thesis-ledger/server exec vitest run \
  test/ledger/current-backtest-association.test.ts \
  test/backtest/v3-runner.test.ts \
  test/backtest/backtest-nav-v3-runner.test.ts \
  test/backtest/current-run-boundary.test.ts
```

4 文件、43 项全部通过；日志 `/private/tmp/e03-run-association-tests.log`。其中场内 Runner 覆盖实际经济执行、离线重放、冻结身份和产物篡改；当前读取覆盖现行完整结果与错误身份拒绝。

Server 全包 247 文件通过、29 文件跳过，1996 项通过、106 项跳过，日志 `/private/tmp/e03-association-server-full.log`。跳过的基础设施用例不算通过，账本隔离 PostgreSQL 与目标运行态另有 E03-b/d 证据。Server 类型检查、测试文件 ESLint、两份新增代码 Prettier、脚本 `node --check` 和边界门禁通过。脚本目录按仓库配置不参与 ESLint，不将忽略警告写成脚本 lint 通过。

本次没有修改生产源码或依赖，复用前次 Server/Desktop build、Desktop 523 项及目标部署证据，不重复构建镜像。

## 目标只读复核

新增 `scripts/ledger-backtest-association-acceptance.mjs`，仅允许本地 HTTP 目标，使用 GET 读取既有 Run，经现行响应 Schema、身份核验及 checksum 重算，核对每笔成交和待处理申请的所属 Run。

```sh
node scripts/ledger-backtest-association-acceptance.mjs \
  52af3a15-a114-4ff1-b997-0a6533630e8c \
  cd2d2b7b-314c-42e0-9044-2e656322fac8 \
  0cca819b-1c57-43fe-8f54-ba01006d9a32
```

2026-10-01 11:06:32 UTC 对 `http://127.0.0.1:3000` 复核成功；结果 `/private/tmp/e03-association-target.json`。

| 基金 | 申请 | 成交 | 待处理 | 原有完整度 |
| --- | --- | --- | --- | --- |
| 161725.OF | 2 | 2 | 0 | partial |
| 110011.OF | 2 | 2 | 0 | partial |
| 118001.OF | 2 | 1 | 1 | unavailable |

三个 Run 均仍为 succeeded，公开响应的 Run、策略版本、Snapshot、contentHash 和 checksum 一致，申请身份没有跨 Run 重复，成交及待处理项均关联当前 Run 的申请。保留原有 partial/unavailable 与研究假设，不将身份一致性写成完整经济结果或严格 PIT 资格。实际来源和首次创建、Worker、客户端证据复用 [N4 最终验收](2026-10-01-n4-nav-target.md)。

目标 Server、Worker、DSA、PostgreSQL、Redis 均 healthy。只读 SQL 复核 E03 专用新事件账户仍为 16 行、revision 16、projectionGeneration 16；旧行账户仍为 1 行，没有 AccountLedgerState。与前次最终验收一致，本次未创建 Run、未新增账户事件或修改共享运行态。

## 收口核对

- [x] E03-a：当前信封及数据库标记，复用[信封证据](2026-09-29-canonical-ledger-envelope-marker.md)和后续实际新旧行验收。
- [x] E03-b：命令、经济投影、并发与原子回滚，见[账本验证](2026-10-01-parallel-e03-b-ledger-projections.md)。
- [x] E03-c：现行客户端动作、审计及旧行明确错误，见[最终浏览器验收](2026-10-01-parallel-e03-target-acceptance.md)。Electron 按用户已确认的验收范围不作为门槛，未记录为通过。
- [x] E03-d：官方部署结果、实际角色及同源输入、目标 HTTP 新事件与旧行拒绝，见同一[目标验收](2026-10-01-parallel-e03-target-acceptance.md)。
- [x] E03-e：本次场内及 NAV 关联回归、跨 Run 负例与目标只读复核。

E03 父任务及全部子任务可以勾选。主 Task 只更新 E03 区域，不改变其他 Canonical 任务、C03 名称与导出治理、真实 Provider 或多来源业务门禁的状态。主 Task 尚有其他开放任务，不归档整份 Canonical Task。全部变更保留未提交，既有脏工作区未清理；本次没有部署、发布或额外启动服务。
