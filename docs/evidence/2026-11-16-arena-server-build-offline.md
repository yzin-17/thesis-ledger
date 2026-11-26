# Server 完整类型与构建离线补验

## 范围与结论

2026-11-16，按用户要求补齐 Server 完整类型检查和构建，不部署、不调用模型或重试比赛。

原先记录的 `session-series.test.ts` 和 `protection-snapshot.fixture.ts:29` 类型错误，在本轮开始时的工作区已不再复现。当前保护单夹具在返回前执行 `strategySchema.parse`，并提供明确的 `BacktestStrategy` 返回类型。本轮保留已有修改，没有再修改业务或测试源码，也没有修改编译配置、依赖版本或原测试超时。

完整 Server 类型检查、Nest 构建、4 个 workspace 依赖构建和 60 项相关离线测试均通过。共享工作区持续有其他在途修改，最终以完整 TypeScript Program 的固定输入及独立产物目录收口：1792 个根输入、3540 份实际编译文本、0 项诊断，成功生成 5376 份产物；补充的 5 项纯函数测试在该快照产物上通过。该结论只覆盖记录的编译快照及受控回归，不覆盖快照建立后的其他修改；指纹和历史执行接入仍未部署，真实盘中执行资料及比赛业务验收仍未完成。

## 验证结果

| 检查 | 实际结果 |
| --- | --- |
| Server 完整类型检查 | `pnpm run typecheck` 退出 0，使用原 `tsconfig.json`，包含源码、测试、Prisma 和 Vitest 配置 |
| Server 完整构建 | `pnpm run build` 退出 0，执行原 `nest build`，本地产物生成完成，没有启动服务 |
| 中间在途变更补验 | 全部非测试根输入及当时的 `authoring-prompt.test.ts`，共 938 个根输入，原编译选项、零诊断过滤，0 项诊断 |
| 最终完整编译快照 | 原配置全部 1792 个根输入、3540 份实际编译文本，完整类型诊断 0 项；同一 Program 生成 5376 份产物，未跳过生成，退出 0；唯一编译选项差异为隔离 `outDir` |
| workspace 依赖构建 | `pnpm --filter '@thesis-ledger/server^...' build` 退出 0，domain、schemas、shared、api-client 共 4 个包通过 |
| 依赖声明与产物一致性 | 重建前后 4 个依赖包全部 `dist` 文件的路径和内容摘要相同；先前 Server 类型及构建结果仍适用 |
| 相关离线回归 | 原 8 文件、55 项通过；固定快照产物上的 Schema 纯函数 3 项及提示词纯函数 2 项通过，合计 10 文件、60 项，使用 `--maxWorkers=1`，没有更改测试超时 |
| 网络保护 | 临时 Node 网络拦截启用，拒绝事件日志不存在，即没有网络访问尝试；跨 Python 样本同时核验零网络／数据库尝试 |
| 依赖方向 | `node scripts/check-boundaries.mjs` 退出 0，`Import boundaries: OK` |
| 文件尺寸 | `node scripts/check-file-size-guardrails.mjs` 退出 0，没有警告 |
| 差异卫生 | 仓库整体及本轮文档范围的 `git diff --check` 均退出 0 |

测试覆盖保护单的冻结 ATR、当前 ATR、普通止损及条件止损，交易计划冻结与离线执行，会话序列中的缺值、迟到和重复时点，以及历史执行事实、回放读取、历史指标和订单身份。

首次并发回归为 54 项通过、1 项失败：跨 Python 归档样本触发原有的 5000 毫秒测试超时，当时 Nest 编译仍在运行。保留日志 `/tmp/arena-server-blocker-offline-tests-20261116.log`，不将超时解释成协议或数据错误。编译结束后串行执行同一组测试，在相同超时配置下 55 项全部通过，用时 14.85 秒；没有放宽生产或模型参数。

首轮完整类型及构建通过后，其他在途工作修改了 AI Schema 和策略提示词源码／测试。后续完整类型检查和构建均重新通过，期间发现一份 Schema 辅助函数产物仍对应编译前的写法，因此保留中间结果并再次构建。随后 3 份 AI Schema 源码的 ESM 编译正文与产物一致；提示词测试也曾连同全部 Server 非测试根输入补查类型并通过。由于其他任务仍继续修改提示词，以上中间结果不冒充同一个最终工作树。

最终使用 `/tmp/arena-server-compile-checkpoint.cjs`：从真实 Server 目录解析原配置，将其全部根输入交给 TypeScript 编译器；只将 `outDir` 移至独立临时目录。Program 保留实际读取的 SourceFile 文本，完整诊断后由同一个 Program 生成产物，并保存全部输入文本及摘要。没有筛掉测试、诊断、编译选项或依赖，不覆盖其他任务正在使用的 Server `dist`。所有 3540 份保存文本的 SHA-256 已重新核验。

固定快照目录：`/var/folders/v1/gvgmk4cx1mz59vj63jj8_9m80000gn/T/arena-server-compile-checkpoint-SbR5iz`；其中 `manifest.json` 记录完整编译选项、输入文件及摘要，`inputs/` 按内容摘要保存原文，`dist/` 保存实际产物。Server 与 Worker 入口均存在，没有执行这些入口。

固定快照的 2 个编译后测试文件、5 项纯函数测试均通过，日志 `/tmp/arena-server-checkpoint-pure-tests-20261116.log`。测试只增加快照目录的 ESM 声明、测试配置及现有本地依赖链接；未更改源码或测试断言。临时位置的 sourcemap 出现原源码路径缺失提示，影响调试定位，不影响已执行的 JavaScript；原文本仍完整保存在 `inputs/`，没有删除 sourcemap 或改变原生成选项。

## 命令与日志

以下命令均通过 `rtk proxy` 执行，临时设置 `npm_config_registry=https://registry.npmmirror.com`；没有安装依赖。

在 `apps/server` 执行：

```sh
pnpm run typecheck
pnpm run build
```

在仓库根目录执行：

```sh
pnpm --filter '@thesis-ledger/server^...' build
node scripts/check-boundaries.mjs
node scripts/check-file-size-guardrails.mjs
```

最终回归在 `apps/server` 执行：

```sh
rtk proxy env -u BACKTEST_PROTECTION_FIXED_DIR \
  NODE_OPTIONS=--require=/tmp/arena-server-offline-network-guard.cjs \
  ARENA_HISTORY_OFFLINE_DSA_ROOT=/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis \
  npm_config_registry=https://registry.npmmirror.com \
  /Users/yzin/.volta/bin/pnpm exec vitest run --maxWorkers=1 \
  test/backtest/protection-worker.test.ts \
  test/backtest/trade-plan-worker.test.ts \
  test/backtest/session-series.test.ts \
  test/market/historical-execution.test.ts \
  test/market/arena-replay-reader.test.ts \
  test/market/arena-history-source.test.ts \
  test/market/arena-history-indicators.test.ts \
  test/model-arena/live-order-identities.test.ts
```

网络拦截脚本只属于本轮临时验证设施，拦截 TCP、TLS、UDP、DNS 和 fetch 入口，没有部署到产品。`BACKTEST_PROTECTION_FIXED_DIR` 在本次命令中取消设置，保护单测试只使用临时目录，不向既有导出目录写入文件。受控 DSA 子进程使用既有测试夹具及其审计钩子，没有访问业务控制库。

日志：

- 完整类型检查：`/tmp/arena-server-typecheck-20261116.log`。
- 完整构建：`/tmp/arena-server-build-20261116.log`。
- 后续完整类型检查：`/tmp/arena-server-typecheck-final-20261116.log`、`/tmp/arena-server-typecheck-stable-20261116.log`，均退出 0。
- 后续完整构建：`/tmp/arena-server-build-final-20261116.log`、`/tmp/arena-server-build-stable-20261116.log`，均退出 0；最后一轮产物核对通过。
- 依赖构建：`/tmp/arena-server-dependency-build-20261116.log`。
- 最终回归：`/tmp/arena-server-blocker-offline-tests-final-20261116.log`。
- 新增 Schema 纯函数回归：`/tmp/arena-server-schema-pure-tests-final-20261116.log`，3 项通过。
- 提示词纯函数回归：`/tmp/arena-server-authoring-pure-tests-20261116.log`，2 项通过。
- 最后在途测试的类型补验：`/tmp/arena-server-typecheck-affected-20261116.log`，938 个根输入、0 项诊断。
- 最终固定快照：`/tmp/arena-server-compile-checkpoint-20261116.log`，1792 个根输入、0 项诊断、5376 份产物，退出 0。
- 快照产物的纯函数回归：`/tmp/arena-server-checkpoint-pure-tests-20261116.log`，2 文件、5 项通过。

类型补验脚本 `/tmp/arena-server-typecheck-affected.cjs` 从真实 Server 目录解析原 `tsconfig.json`，仅增加 `noEmit: true`，将全部非测试根输入和上述测试交给 TypeScript 编译器，检查完整传递依赖；没有删除或过滤诊断。该定向补验只承接最后在途测试的变化，其他范围复用完整检查的已通过证据。

最终固定快照通过 `rtk proxy env NODE_OPTIONS=--require=/tmp/arena-server-offline-network-guard.cjs node /tmp/arena-server-compile-checkpoint.cjs` 建立。完整生成与诊断使用同一份 Program 输入；独立产物目录及输入副本构成本轮确定的验收基线。

## 输入一致性

早期工作树采样覆盖 Server `src`、`test`、`prisma` 下的 `.ts`／`.json` 文件，按相对路径排序，以路径、零字节、文件内容、零字节依次计算摘要。首轮 1801 个文件为 `f72aa001170f9e01179c754def9115b8861251a5beb4f2d0031ae991a543e95e`；后续一轮 1803 个文件为 `f94d765757cb22d0e222a4df56628e7f4062a58ec834f9e4afac5f727a7150bd`。这些只属于各自采样批次，之后仍有其他工作区修改。

最终验收改为编译器实际读取的 3540 份文本，依 `path.localeCompare` 排序后，对绝对路径、零字节、文本 SHA-256、零字节依次计算摘要：`acc416d78442abfdb3cd189ef7b0f812b1338c3035df609812d05d17c2631cf5`。实际文本及文件映射保存在上述快照中，该摘要不再依赖继续变化的实时工作树。

依赖包 `dist` 使用同样的方法计算全部文件，重建前后结果相同：

| 包 | 文件数 | SHA-256 |
| --- | --- | --- |
| domain | 411 | `04728e66d335952b9d2066e0495ebd58571c826daab2522d790d5a57aa577b99` |
| schemas | 813 | `24df6717f38ca2dfffc5cc334ec2cfc62e3dff3a05b84766975e90092b418913` |
| shared | 3 | `4b5ad4eba493f194887163af1aafb3145d570bd0a40725fa127e1a21a3e8246f` |
| api-client | 153 | `0e102151770722d1dcf04750562263c1e3595390ca5a85cc64493a4985ad277d` |

关键检查输入；源码项采用固定编译快照中的文本摘要，配置项保留实际解析时的摘要：

| 文件 | SHA-256 |
| --- | --- |
| `apps/server/test/backtest/protection-snapshot.fixture.ts` | `ceaad9990582baac1a0537c8269790fa2ca18b0c5dc11b5ce489c1c55328f8fb` |
| `apps/server/test/backtest/trade-plan-snapshot.fixture.ts` | `5a397bb6cec3069a2928b289f2c4dfb5e484af4460fa773664ca3c03463d9886` |
| `apps/server/test/backtest/session-series.test.ts` | `162dc052e24a5d607b0b4d96fe3fb042a1671cf5ca18d369035e83eb5151080e` |
| `apps/server/tsconfig.json` | `97eefcb6f4f12e2cc4fedb1b389e3f809eafe643bde2d9db1bb993355b05c3f7` |
| `apps/server/nest-cli.json` | `fe31f315212f85eee8647031c8ec53b7db17abfe11533744d56c0f6532de7fb7` |
| `tsconfig.base.json` | `469891a592e66c93e6070f4b1ae89fd28eb258d1a697b2b2d48cb234710cd5d1` |
| `apps/server/package.json` | `c288246a0690ccde32bea071abc9424bd0bca92efdf710ce00d34785fb3d5d6e` |
| `apps/server/src/ai/ai-generation-schema-references.ts` | `70479f1aa5bbd2051dc5977e8c91bafbda50371d290ef742b5091e370923dbb5` |
| `apps/server/src/ai/ai-generation-schema-prompt.ts` | `5c9ed467913a23bfbbac68521e1a1f33c428010871246d2944408e859a445484` |
| `apps/server/src/ai/ai-native-strategy-schema.ts` | `899018aba8be793ca08db79d416010e30d8aba1b7111825c60140cba7e382b18` |
| `apps/server/test/ai/ai-generation-schema-references.test.ts` | `ca2691e8f56c4f7ed24456bf07d04aa77f371c877ba4ed8c14ad12e5f834ad7e` |
| `apps/server/src/strategy-authoring/authoring-prompt.ts` | `30d24c0a927b8787edee3d9b6594713b6d7bdcd65437dc9e016320ec429d8be1` |
| `apps/server/test/strategy-authoring/authoring-prompt.test.ts` | `99c4f203eb10af651bb7a037d0e5f24f83f099e9408cbeaa013ae80353fbb3c7` |

旧失败仍保留在[指纹修复证据](2026-11-16-arena-history-fingerprint-offline.md)和[历史执行接入证据](2026-11-16-arena-historical-execution-offline.md)，不改写历史验证结果。当前任务的部署、真实来源、最终业务及历史追平验收继续由[活动任务](../tasks/2026-11-12-arena-replay-live.md)持有。
