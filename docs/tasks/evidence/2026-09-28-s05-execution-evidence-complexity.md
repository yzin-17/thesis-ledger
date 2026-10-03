# S05 执行证据校验复杂度收敛证据

## 状态与范围

`S05-execution-evidence-complexity-0928 / worker_done`。按主 Spec §10 的证据种类与执行阶段提取内部 helper，保留公共 `validateSnapshotExecutionEvidenceV3` 及 `SnapshotV3EvidenceContext`。只修改本文与下表五个 `backtest` 源码文件；其他源码、测试及主 Spec/Task 均只读。保留已有 dirty WIP，未 stage、commit、reset、clean 或进行全仓格式化。所有源码写入均由 native `apply_patch` 完成；Prettier 仅用于生成 owned patch 和检查。

Context Mode 工具发现为空，采用 RTK 与有界输出。全部本叶命令已结束，无遗留进程；本叶会话不再承担其他任务。

## 职责与行为保持

- 入口负责唯一 execution 来源、bar RouteKey、三份 Artifact 引用及顺序编排；metadata helper 校验策略、RunConfig 和 executionModel；window helper 解析冻结父窗口、pinned request 与多窗口证据，并校验覆盖及价格事实；identity helper 先校验基础身份事实，再校验路由与来源绑定；bars helper 校验指纹、逐 Bar 身份及完整日历。
- 失败顺序仍为来源与引用、metadata 结构/解析/身份、模型路径/缺失/结构/内容、窗口结构、冻结父窗口、pinned request、多窗口、各 JSON 字段与 Schema、身份事实与绑定、完整窗口、价格事实、Bar 指纹、逐 Bar、日历。身份事实拆分保留原 OR 的短路顺序及同一错误文本，未提前调用 canonicalize。
- 入口仍以 `Promise.all` 按 metadata、window evidence、execution bars 的顺序调用 `context.readRows`，每份一次；只有冻结模型存在时在 metadata 校验后读取 model 一次。无模型时不调用异步模型 helper。所有读取仍使用原 ArtifactRef，未增加 Artifact 读取或写入。
- 所有原错误文本均保留。Schema 解析、JSON 解析及 executionModel 解析的原异常处理边界保持。hash/canonicalize 的输入、调用顺序及短路条件保持；仍以原始 `barsRows` 计算 fingerprint，不重新编码 metadata 或 evidence 的 JSON 文本，不修改 row。
- prepared/routed/frozen 选择的上游校验与 Store 均未修改。raw/NAV 与严格 PIT 资格、失败关闭边界保持；本叶不赋予新的执行或历史真实性资格。

## 源码输入与尺寸

原入口 SHA-256 为 `2791c1e488f9d543da2fd537bba1a06d893b8972c6386efafba2bd6eacbe8948`，299 行；已记录的原函数复杂度 86、有效长度 247。原文副本保存在 `/private/tmp/s05-execution-before.ts`，新文件在本叶开始前不存在。

下表路径均相对于主仓；复杂度及有效函数长度由项目 ESLint 的相同规则读取，使用诊断阈值 0 收集每个函数数值，长度排除空行和注释。正式严格门禁仍使用复杂度 20、有效长度 220。

| 源码文件 | 完成后 SHA-256 | 文件行数 | 最大复杂度 | 最大有效函数长度 |
| --- | --- | ---: | ---: | ---: |
| `apps/server/src/backtest/backtest-snapshot-v3-execution-evidence.ts` | `2af794bd46b5f033f392f6e1bf52156cd0c2d92f90bb276b17b22fc79217d1ae` | 84 | 10 | 59 |
| `apps/server/src/backtest/backtest-snapshot-v3-execution-metadata.ts` | `2783c2937b369e0beb80db0935e165bed9b73e24239c9615c5f6e870873c97a6` | 89 | 16 | 44 |
| `apps/server/src/backtest/backtest-snapshot-v3-execution-window.ts` | `9291d2d5e67419063a955a86a09fa2323ffff2dc36c3e245db0ebd2979f836f3` | 171 | 13 | 100 |
| `apps/server/src/backtest/backtest-snapshot-v3-execution-identity.ts` | `83cb969712aa20fafb3eaef777dac51b9e5ffa8e07eaa5a4b9cf706a53079c95` | 76 | 13 | 37 |
| `apps/server/src/backtest/backtest-snapshot-v3-execution-bars.ts` | `930a4419b1baac543ef3ef9c196aba56cedcbff302777fe3ef1fe473d5632b4b` | 70 | 18 | 58 |

入口从 299 行降为 84 行；新增文件最大 171 行。未提高阈值、关闭规则或增加 ignore。所有 helper 仍属 `backtest`，没有新增跨 feature 依赖或公共 index。

## 本叶验证

以下实际命令均通过 `rtk proxy` 执行。ESLint/Prettier 的源码输入为上表五个路径，未选择其他源码或测试。

```sh
pnpm --filter @thesis-ledger/server exec vitest run --cache=false test/backtest/v3-snapshot-builder.test.ts test/backtest/v3-frozen-comparison.test.ts test/backtest/v3-multi-window-snapshot.test.ts test/backtest/v3-split-mapping-snapshot.test.ts test/backtest/v3-field-units-snapshot.test.ts test/backtest/v3-strict-snapshot-replay-guard.test.ts
```

结果：exit 0，6 个测试文件、15 项测试全部通过，runner Duration 6.93s；没有 skip。覆盖冻结与重放、丢失/替换证据拒绝、精确 pinned target、多窗口篡改、事件映射/覆盖、字段单位原文冻结、父窗口比较与旧严格快照首次/幂等 finalize 拒绝。

| 检查 | 实际命令及输入 | 结果 |
| --- | --- | --- |
| 普通 ESLint | `pnpm exec eslint` 加上表五个源码路径及 `--max-warnings=0` | exit 0，0 errors、0 warnings |
| 严格 ESLint | 相同五个源码路径，`--max-warnings=0 --rule 'no-nested-ternary:error' --rule 'complexity:[error,20]' --rule 'max-lines-per-function:[error,{"max":220,"skipBlankLines":true,"skipComments":true}]'` | exit 0，0 errors、0 warnings |
| Prettier | `pnpm exec prettier --check` 加上表五个源码路径 | exit 0 |
| 变更空白 | `git diff --check --` 加上表五个源码路径与本文；另以文件内容检查未跟踪文件 | exit 0；无尾空白，均有末尾换行 |
| 行为与文本自检 | 对照原文与提取后 helper，核对各条件、解析/hash/canonicalize/读取顺序；原错误文本集合检查 | 无原错误文本缺失；原条件及错误处理边界保持 |

当前源码处于未跟踪 dirty WIP，普通 Git diff 不展示其内容；本叶按原文副本逐段对照，未操作索引。

## 验证边界与交接

现有定向测试没有独立断言执行证据校验器的每一种复合坏输入下首个错误和 `readRows` 精确调用轨迹；本叶按原文对照验证其保持，没有新增镜像式测试。raw/NAV 的全部拒绝矩阵及其他依赖校验留给现有对应测试与稳定输入回归。

未运行 Server 全包测试、typecheck/build、仓库门禁、数据库、Provider、I01 诊断、部署或业务任务。兄弟叶仍有依赖/完整性校验的并行修改，本叶定向结果仅作为局部证据；全部 writer 停止后的全局验证与最终 review 由协调者安排。上述五个源码、其导入合同或本次定向测试依赖发生变化时，相关证据应重新核对。
