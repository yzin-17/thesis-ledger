# 历史归档有效性与 ETF 采样依赖本地验收

## 结论与范围

2026-11-25，回放 Spec AC23／AC24、本仓 R4H19／R4H20、DSA H10／H11 的本地源码与隔离验收通过。DSA 定向 103 项、Server／Python 跨语言 51 项、共享有效期合同 2 项通过；Schema 构建、Server 类型与构建、定向 ESLint、依赖和尺寸检查通过。全量检查仍有既有失败，修改前源码快照对照结果见下文，不宣称全仓通过。

本轮真实模型、真实资格探针、行情／公告来源请求和比赛操作均为零，真实业务数据库未连接。测试仅使用内存对象、受控原文和专属临时 SQLite；隔离辅助程序拒绝外网及临时目录以外的 SQLite 连接。没有 Docker 操作、目标同步、重启、来源／路由修改、暂存、提交或推送。

复用三个既有 checkout，起始未提交条目分别为主仓 1937、DSA 308、infra 18；未创建 worktree 或子代理。原始前像及日志位于主仓 `.recovery-artifacts/arena-archive-policy-20261125/`，本轮增量单独保存为 `owned-delta.patch`。先前回测整改、G02／G04、历史／实时及未受影响证据继续按原范围复用。

## 归档有效性与保留升级

仅 `CN / STOCK|ETF / HISTORICAL_EXECUTION_CONTEXT`、`historical-execution-archive / qualified-cn-execution` 允许显式 `validUntil: null`。其状态绑定适配器、来源及凭据修订，仍核验起始时刻、证券日期范围、开关和撤销；实际读取继续逐次核对索引、材料及原文字节摘要，并拒绝读取期间控制变化。其他来源保持有限时间有效期。

SQLite 仅将 `valid_until` 放宽为可空，使用事务复制原表并恢复索引／触发器，不修改既有行的字段。实际临时控制库验证了旧撤销记录完整保留、索引与触发器保留、无额外审计写入、重复初始化幂等，以及切换失败时原表和原行回滚。原有限期过期记录仍为过期，不自动提升为按版本有效。

新记录跨 40 天后，状态、有效路由及真实归档读取一致可用；修订变化、撤销、关闭、证券和日期越界仍拒绝。共享 Schema 接受该精确来源的空有效期，事件与净值继续采用有限期 Schema。

既有单日及区间维护入口写入新记录时采用空到期时间，区间入口不再固定要求从第 1 版扩展至第 2 版。受控维护流转验证第 1／2 版可经明确应用生成下一版，采证后原记录变更及重复应用仍拒绝；现有目标准入未执行任何写入。维护入口只按采样用途核验所需数据，停牌是有效状态事实，不再因某点停牌而否定整个归档。

## 采样用途与隔离业务

历史执行请求新增明确的 `purpose: sampled`，缺省 `full` 保持完整制度用途。采样上下文只包含身份、交易单位、价格步长、历史交易状态及证据引用，不包含完整结算、法定费、涨跌停和完整覆盖声明。原完整材料按需要投影，索引格式保持原义；新增按日采样材料使用自身版本 2。适配器修订为 `historical-execution-archive-v4`，完整用途继续校验原完整制度。

功能检查与采样维护明确使用采样用途；实际请求仍独立检查自身所需覆盖。只有采样资料时，完整用途在真实 HTTP 入口返回 422／`insufficient_coverage`，不把有效的采样归档误报为损坏。请求与响应的用途、证券、类型、时点、政策及目标保持严格对应，ETF 不进入股票状态组合。

隔离链路使用既存 `588000.SH`／`510300.SH` 样本、已保存官方空停复牌查询及受控身份／会话材料。临时 DSA 控制库与实际运行时输出，经主仓 JSON 解码、Schema 和 Market 读取器消费；已存两根分钟支撑非空买入、费用与现金核对、次日可卖日及重复处理幂等。受控次日报价独立标记 `controlled-next-day-reinvestment`，验证当日不可卖、次日卖出与卖款再投资；不认证 11 月 11 日真实行情或新增历史覆盖。

同一批定向测试继续覆盖三市场原有买卖／再投资、完整 ETF 规则、停牌、错币种、旧报价、已知未处理事件和模型原因码投影。集中测试夹具只将旧数字协议值对齐为当前 Schema 的 `arena-live-match-protocol-v1`；未改写保存的原决策或真实失败回执。

## 实际检查与适用范围

执行目录分别为主仓 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger` 与 DSA `/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis`。Shell 均经 `rtk proxy`；Node 固定 `/Users/yzin/.volta/tools/image/node/24.22.2/bin/node`，pnpm 使用该 Node 的 PATH，Python 为 DSA `.venv/bin/python`。没有安装依赖或改写 lockfile。

| 检查与非敏感参数 | 实际结果 |
| --- | --- |
| DSA：`.venv/bin/python -m pytest -q tests/test_historical_execution.py tests/test_historical_reconstruction.py tests/test_historical_execution_validity.py tests/test_historical_execution_sampled.py tests/test_historical_execution_admission_maintenance.py -p no:cacheprovider` | 退出 0，103 项通过。 |
| 主仓：`ARENA_HISTORY_OFFLINE_DSA_ROOT=/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis pnpm --filter @thesis-ledger/server exec vitest run test/market/historical-execution.test.ts test/market/arena-replay-etf-fallback.test.ts test/market/sampled-archive-contract.test.ts test/market/sampled-frozen-business.test.ts test/market/sampled-execution-business.test.ts` | 退出 0，51 项通过，包含原 4 项可选跨语言检查。 |
| 主仓：`pnpm --filter @thesis-ledger/schemas exec vitest run test/market-route-admission-validity.test.ts` | 退出 0，2 项通过；同时包含在全包检查的通过项中。 |
| 主仓：`pnpm --filter @thesis-ledger/schemas build`；`pnpm --filter @thesis-ledger/server typecheck`；`pnpm --filter @thesis-ledger/server build` | 均退出 0。 |
| 主仓：`pnpm exec eslint`，参数为本轮共享 Schema、DSA 客户端、回放读取／规则及新增测试、集中协议夹具；`node scripts/check-workspace-dependencies.mjs`；`node scripts/check-file-size-guardrails.mjs` | 均退出 0；尺寸无警告，控制存储大文件未因新职责增大。 |
| 主仓：`node --check scripts/local-runtime/run-arena-range-admission.mjs`；`node --check scripts/local-runtime/run-arena-execution-admission.mjs` | 均退出 0；只检查源码，没有运行维护操作。 |
| DSA：`PATH=/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis/.venv/bin:$PATH ./scripts/ci_gate.sh` | 退出 1；8174 通过、288 失败、42 跳过、4 取消选择，323 个子测试通过。语法、关键 lint、数据边界、运行清单与测试登记阶段通过。 |
| DSA：最后 HTTP 用途覆盖错误分类补充后的 `./scripts/ci_gate.sh syntax`、`./scripts/ci_gate.sh flake8` | 均退出 0；相关 103 项及跨语言链路另行定向复核，未再次重跑整个全量套件。 |
| 主仓：`pnpm --filter @thesis-ledger/schemas test` | 退出 1；1495 通过、219 失败，52 个失败文件。 |
| 主仓：`node scripts/check-boundaries.mjs` | 退出 1；唯一错误为既有 `apps/server/src/platform/named-v1-market-data-preview.ts` 导入 `MarketBarWindowEvidenceV3`。 |

## 全量失败的修改前对照

为区分本轮修复与工作区其他改动，用本轮前像在模块加载阶段只读投影回原路径，不替换实际工作树、不创建 worktree，也不回退其他在途修改。

- DSA：提取全门禁的 288 个失败节点，只对这些节点使用修改前 5 个受影响模块复验，288 个全部仍失败，节点集合完全一致；没有归档执行／重建相关失败。对照输出 `dsa-baseline-comparison.json` 记录新增集合为空。未把该定向对照描述成第二次完整门禁。
- Schemas：相同默认收集范围，用修改前 5 份 Schema 运行全包，结果为 1493 通过、219 失败；当前多出的 2 项正是本轮新增合同检查。失败集合完全一致，输出 `schemas-baseline-comparison.json` 记录新增集合为空。
- 边界：修改前源码投影输出与当前输出逐字一致。本批没有修改该非法导入文件。既有具名 V1 工作由[原任务](../archive/tasks/2026-11-24-named-v1-cutover.md)持有；其未通过的全仓层级不升级为本批源码修复前提，也不标为通过。

这些对照用于确认现有失败的归属，不证明整个工作区已通过；最终 HTTP 错误分类补充仅影响本地历史执行用途，相关源码由最后定向检查覆盖。

## 关键源码摘要

| 文件 | 最终 SHA-256 |
| --- | --- |
| `daily-stock-analysis/src/services/thesis_ledger_admission_validity.py` | `d9beaecfa70c456278722db144fb9f5c6b2e8183926de02ba0d2540675cb23ce` |
| `daily-stock-analysis/data_provider/thesis_ledger_sources/historical_execution.py` | `f6e9c235cd2037e8a74dadc668539abb0da3986342a22bf5062f55c226b37d1e` |
| `daily-stock-analysis/src/services/thesis_ledger_historical_execution.py` | `58ddc6380a3a60e39bd37e0042f567830b458e583661220425a101e437b79627` |
| `packages/schemas/src/market-historical-execution.ts` | `619e1ea5d147330fdca9ba0d35c787312fec273190e59a9556bacf05ba16e02e` |

## 初次失败与修正

新测试首次因未登记到 DSA 数据测试清单而拒绝，登记后运行；随后隔离测试的目标参数误带 `routeIndex`，已按现行控制合同修正。主仓集中夹具仍为数字协议值，已对齐具名 v1；一次校验使用了早于新增保护的 Schema 构建产物，重建后通过。新闭环的预约字段补齐后通过。维护入口最初仍按 24 小时读取空有效期，已一并收敛；HTTP 用途覆盖检查进一步修正了 502 与 422 的错误分类。这些初次失败不计为通过次数，不涉及模型、比赛或目标重试。

## 后续运行边界

本地批次当时只交付代码与隔离证据，未写入目标准入或重新认证证券／日期覆盖，回放任务 R4H2 当时保留未验收。SQLite 结构变化要求使用正式 `thesis-ledger-infra/scripts/update.sh dsa`；主仓源码同步按实际兼容预检选择正式入口。上述本地批次没有执行这些命令。

同日后续用户要求“继续”后，R4H2 已完成正式目标更新、新准入及正常消费者验证；独立结果和首次维护失败记录见[目标验收](2026-11-25-arena-archive-policy-target.md)。本文件的本地测试数量与无部署边界保留为该批实际事实。

完整制度、实时来源、模型准入、已完成比赛和原独立 CI 各保留原证据范围。源码未提交、未推送；不能将本地构建或隔离样本解释为目标运行态已经生效。
