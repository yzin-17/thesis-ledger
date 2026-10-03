# N3 NAV Worker 执行汇合证据

当前 W01–W06 已全部完成，汇合任务已[归档](../../archive/tasks/2026-10-01-n3-nav-worker.md)，最终目标业务见 [N4 证据](2026-10-01-n4-nav-target.md)。下文按阶段保留当时验证边界，不能把历史待完成描述理解为当前状态。

## W01–W03 阶段状态与边界

完成 W01–W03：当前 `runCurrent` 按 `inputKind` 选择 NAV 或场内执行器，NAV 结果通过当前 attempt 状态机原子提交。N2.5/N2.6 的持久化与隔离 PostgreSQL 前置已就绪。W04、W05 保持未勾选，本阶段未开放 NAV 创建投递、补投或公开结果消费，没有改动 Prisma 或目标容器。

## 实现

- `backtest-nav-run-execution.ts` 独立拥有 Worker 的 NAV 冻结输入验证与结果校验。查询已消费准备凭证，按 Run 创建时刻验证凭证，核对策略版本；复用 N2 读取完整性合同检查 Run 配置、凭证关联和实际 Parquet。执行过程不调用 Market Reader 或 Provider。
- NAV Runner 收到真实冻结的两个 ArtifactRef。结果提交前再次校验凭证及物理回放，并核对 NAV 结果的身份、来源、经济字段和校验和。
- `backtest-run.service.ts` 选择 NAV `navId`，沿用 `runBacktestAttempt` 的状态及 attempt 原子条件。缺少 NAV 能力不会调用场内 Runner。失败分类提取到 `backtest-run-failure.ts`，原大文件职责和行数收敛。
- `backtest-processor.module.ts` 与 `backtest.module.ts` 注册独立 NAV Store 和执行器。创建端及队列原有拒绝门禁保持生效；注册执行器不等于已开放投递。
- 数据库连接类错误 `P1001/P1002/P1017` 进入既有有界重试；无效凭证、策略、Run 或物理输入收敛为 `DATA_UNAVAILABLE`；不合法 Runner 结果为 `RULE_REJECTED`。达到重试上限后收敛为数据库失败终态。

## 验证

测试使用受控来源、真实临时 Parquet 和内存 CAS 数据库代理；没有实际连接 PostgreSQL 或 Redis。覆盖已合法消费但现时过期的凭证、正确 NAV engine、结果提交条件、重复领取、凭证/策略/Manifest 篡改、取消、旧 attempt 晚到、结果篡改、未配置能力、有界数据库失败重试及执行后物理文件缺失。

| 检查 | 命令与输入 | 最后结果 |
| --- | --- | --- |
| NAV Worker 定向 | `rtk proxy pnpm --filter @thesis-ledger/server exec vitest run test/backtest/backtest-nav-worker.test.ts --maxWorkers=2` | 11/11 通过 |
| 相邻回归 | Worker、NAV Runner、离线经济内核、队列生命周期、CAS、现行 Run、NAV 队列门禁共 7 文件 | 72/72 通过；其中 Worker 最初 9 项通过，新增两项由最终定向及全包覆盖 |
| Server 全包 | `rtk proxy pnpm --filter @thesis-ledger/server exec vitest run --maxWorkers=2` | 243 文件通过、27 文件跳过；1976 项通过、100 项跳过；83.76 秒 |
| 类型与构建 | `rtk proxy pnpm --filter @thesis-ledger/server typecheck`、`build` | 通过；先前 N2 Controller 类型阻塞已由并行前置修复 |
| 格式与复杂度 | 本次源码/测试的 Prettier、ESLint；新增生产文件另检查 complexity 20、函数 220 行 | 通过；未调整阈值 |
| 边界与差异 | `rtk proxy node scripts/check-boundaries.mjs`、`rtk proxy git diff --check` | 通过 |

物理删除测试首次误用了临时根下的 Run 路径，实际未删除文件，因此得到 succeeded；修正为真实 `snapshots/<runId>/finalized.json` 后，该用例正确进入失败并拒绝结果提交。保留这一记录以区分夹具错误与生产错误。

日志位于 `/private/tmp/n3-nav-worker-final-test.log`、`/private/tmp/n3-nav-worker-regression.log`、`/private/tmp/n3-nav-worker-server-full.log`、`/private/tmp/n3-nav-worker-types.log`、`/private/tmp/n3-nav-worker-build.log`、`/private/tmp/n3-nav-worker-final-lint.log` 和 `/private/tmp/n3-nav-worker-boundaries.log`。输入或依赖改变后，只重跑受影响检查。

## 当时的下一阶段

先完成 W04：NAV 公开读取返回并校验结果，NAV 重试验证使用 NAV 冻结合同，创建成功与队列/补投的能力门禁显式汇合；不要把仅注册 Runner 视为投递能力已开放。再执行 W05：实际 PostgreSQL attempt、队列领取、取消/晚到/失败收敛和目标运行态。Server 全包的 100 项跳过中包含需要显式环境开关的数据库测试，不能记为已完成。

本阶段没有提交、部署、调用真实 Provider 或改动主任务与其他并行证据。

## N3/N4 全任务接续：消费面与隔离执行

用户随后授权完成 N3/N4 全部任务。以上 W01–W03 记录保留为前一阶段边界；当前实现已开放具备 NAV 执行能力时的创建投递、严格结果读取及 NAV 重试。Worker 内部入口接受现行 NAV 标记，公开场内接口继续按自身合同校验。公开结果同时核对物理回放、冻结身份、数据库 engine 与 checksum；客户端使用独立 NAV 合同和 TanStack Query。

| 检查 | 输入与命令 | 最后结果 |
| --- | --- | --- |
| 消费定向 | NAV 创建投递、读取与重试；三个文件 | 22 项通过；类型修正后消费 8 项及 lint 再次通过 |
| Server 全包 | `rtk proxy pnpm --filter @thesis-ledger/server exec vitest run --maxWorkers=2`；消费面接入后 | 1986 项通过、100 项跳过；类型/build 通过 |
| 公开合同 | NAV Run 结果绑定、失败/终态保护；全 Schemas | 587 项通过；类型/build 通过 |
| NAV 摘要合同 | 独立列表摘要，不输出未验证结果或经济指标 | 最终定向 11 项与 Schemas build 通过 |
| 客户端 | NAV typed transport 与非视觉准备意图 | transport 5 项、意图 4 项通过；API Client 类型/build 通过 |
| 实际 PG/BullMQ | `rtk proxy env E01_N3_POSTGRES=1 pnpm --filter @thesis-ledger/server exec vitest run test/backtest/backtest-nav-worker-postgres.integration.test.ts` | 3/3 通过；owned lint 通过 |

隔离执行使用完整现行 migration、`raw-owned-tables.json` 和应用角色，结构 head 为 `20261001100000_nav_backtest_preparation`。受控来源生成真实 Parquet，再经真实 PostgreSQL、BullMQ Queue/Worker 与生产 `BacktestService.runCurrent` 进入公开 NAV 读取：重复投递只领取一次，取消标记阻止晚到结果 CAS，可重试故障最多执行三次并进入数据库失败终态。测试资源使用随机 loopback 端口、tmpfs 和本次精确标签/nonce；结束后已清理，无共享 volume 操作。

该测试的来源是受控 fixture，未证明真实目标 DSA 或准入。目标部署、三个真实基金案例与客户端验收仍待完成，不能由这三项通过替代。运行态测试首次把准备响应的 `expiresAt` 错带入创建 body，被 strict schema 拒绝；去掉非创建合同字段后通过，生产合同未放宽。

本轮新增日志：`/private/tmp/n3-nav-consumption-full.log`、`/private/tmp/n3-nav-consumption-types.log`、`/private/tmp/n3-nav-consumption-build.log`、`/private/tmp/n3-nav-consumption-repair-test.log`、`/private/tmp/n3-nav-consumption-repair-lint.log`、`/private/tmp/n3-nav-schema-full.log`、`/private/tmp/n3-nav-schema-types.log`、`/private/tmp/n3-nav-list-schema-test.log`、`/private/tmp/n3-nav-list-schema-build.log`、`/private/tmp/n3-nav-api-types.log`、`/private/tmp/n3-nav-api-build.log`。隔离 Worker stdout 未另存；保留可复现命令和源码，不编造日志路径。
