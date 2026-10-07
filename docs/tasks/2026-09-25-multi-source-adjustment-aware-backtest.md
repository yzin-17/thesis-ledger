# 市场数据多源接入、手动路由与复权感知回测实施任务

> 任务标识：`multi-source-adjustment-aware-backtest`
> 日期：2026-09-25
> 对应 Spec：[市场数据多源接入、手动路由与复权感知回测](../specs/2026-09-25-multi-source-adjustment-aware-backtest.md)
> 状态：共同价格范围已完成，最终对账已通过；当前结论以 §0、§13 和 2026-10-03 验收记录为准，后文保留历次执行记录。
> 范围：按用户 2026-10-03 决定，以 HiThink/腾讯共同 ETF 价格能力交付。M1/M2/M3 非共同能力转为扩展或明确跳过，不宣称全部来源和高级模型已验收。

> 后续启动（2026-10-03）：用户停止 RQData 注册并要求完成剩余任务，由[多源扩展 Spec/Task](2026-10-03-multi-source-remaining-acceptance.md)承接。本 Task 的共同价格完成结论保留，RQData 继续跳过；下文扩展历史状态由新 Task 的实际验证结果接续。

> 2026-09-29 范围变更：整个 ThesisLedger V1/V2 链路替换及旧数据兼容删除由[单一现行链路替换 Task](2026-09-29-thesis-ledger-canonical-runtime-replacement.md)跟踪；本 Task 的 M1/M2/M3、AC01–AC20 及真实业务门禁继续有效。旧数据读取兼容类叶子以新 Spec 为准，不能把其原有勾选状态当作新链路验收。

## 0. 当前连续执行范围（2026-10-03）

最新用户要求：以 HiThink 和腾讯共同具备的能力为准，减少过度防御及证据要求，并连续完成剩余任务。Spec §1.1 是本次验收基线；此前更严的高级证据要求不再阻塞基础价格交付。原始任务和失败记录保留，非共同能力、严格 PIT、真实事件/份额、用户已跳过来源须在最终对账中明确标为扩展或跳过，不能伪记通过。本轮不用子代理，不修改无关工作，不提交或发布。

- [x] C01-common-daily-state：DSA 公共日线层从实际 Bar、日历和来源自动整理日级状态，取消完整窗口对 HiThink 专用 DataFrame 元数据的依赖。写集为日级证据 helper、相邻接口接缝及定向测试；核对完整窗、缺日、无效价格、日期重复和现有 HiThink 行为。无需新增外部证据请求。
- [x] C02-basic-price-readiness：基础 HiThink/Tencent ETF 日线按适配、凭据和精确策略启用，移除人工限标的/限窗/短期 RouteAdmission 前置；其他高级能力保持独立。写集为 DSA 就绪判定、Control/Runtime 接缝及合同测试，保持凭据缺失、错误口径、目标身份和显式停用有效。
- [x] C03-common-price-runtime：C01/C02 定向与包级检查后通过官方 infra 入口更新目标，完成 HiThink qfq、腾讯 qfq/hfq 的正常准备、创建、Worker 终态及冻结重放；沿实际支持口径验证纯价格研究，不扩为真实事件/份额验收。失败先修根因并在新输入下复验，不重复相同失败请求。
- [x] C04-common-chart-fallback：按 Spec §1.1 收敛固定快照纯价格整窗备用要求，核对 Server 选择和实际来源，完成目标图表口径、缓存隔离、失败切回及运行配置不变的交互验收。标的目录复用现有行情弹窗提供只读入口，无持仓时隐藏数量、成本和盈亏。先处理读取接缝，再做 UI；高级语义转换不纳入整窗替换。
- [x] C05-common-regression-docs：受影响测试、类型/构建、边界/依赖与目标验证完成；父叶、部署/UI、M2/M3 和 AC 已按新范围对账，用户/运维、版本、架构及三仓说明同步。14 份修改文档的相对文件链接检查通过，既有尺寸门禁失败已由 C06 修复，未执行层级分别披露。

C01–C05 已完成。此次源码、配置、四条真实 Run、重放、图表与恢复操作统一见[共同价格验收](evidence/2026-10-03-common-price-baseline.md)。此前失败、单次预算、人工准入及兼容证书要求属于历史实现，不能重新阻断用户已确认的共同价格路径。

### 0.0 收尾维护

- [x] C06-Ledger 测试职责拆分：基线观察批次的 4 项测试独立到 `baseline-observation-batch.service.test.ts`，导入草稿的 15 项留在原文件，当前 Ledger 事件及持久化夹具由 `baseline-import-ledger.fixture.ts` 复用。V3 版本字段及原断言保留；定向 19 passed、Server typecheck/lint、全包 2074 passed / 125 skipped、边界/依赖及文件尺寸门禁通过。原文件 1550→1358 行；测试调整未改变部署输入，未重复同步容器。命令和日志见[验收记录](evidence/2026-10-03-common-price-baseline.md)。

### 0.1 遗留任务对账

| 原任务 | 当前结论 |
| --- | --- |
| G0-H、D01 | HiThink ETF qfq 基础适配、实际读取、准备/创建/Worker/重放完成；股票、事件及严格历史资格分别保留原范围 |
| M2-admission-design-calibration、两个腾讯接续叶 | 已以共同能力落地：四个基本价格条目就绪，通用日级状态、腾讯 qfq/hfq 正向 Run 与重放通过 |
| U04、U04-server/options、U04-ui、U04-backup-options、U04-target-interactions、G-UI、G-UI-priority1 | 共同图表入口、三口径、扩窗、禁用/恢复、实际备源和既有运行配置不变通过；Console 无错误。原始 CDP 网络采集未获权限，Electron 未执行，不计作通过 |
| U04-backup-evidence、U04-proof-runtime | 本轮共同价格整窗备用不适用人工证据包；高级跨坐标转换的证明保留为扩展 |
| G-M2-Fallback | 真实图表 90 点备源及普通回测 `routeIndex=1` 成功，冻结重放一致；主源已恢复 |
| G-M2-Price | hfq 归一化回测完成，none 图表完成；真实 raw-events 回测仍属公司行动/真实份额扩展，未伪记通过 |
| F02、G-Deploy | 用户/运维、架构、三仓能力与契约说明完成；官方代码同步、目标健康、业务路径通过。本轮无依赖或结构变化，不新增迁移验收 |
| F01 | 当前代码同步兼容条件已验证；不可变镜像发布、状态保真回退另属发布前扩展，未以可写层代替镜像 |
| R01.5-pagination、R01.5-real-source | 已被 [2026-10-02 第一优先级证据](evidence/2026-10-02-priority1-catalog-ui.md)完成：真实基金排行 20481 条/21 页，目录正式同步 35278 条，历史超时不再是当前阻塞 |
| S05 及 reconstruction 子叶 | 固定快照研究已通过；严格历史时点重建的真实版本/日历/决策窗口是扩展 |
| M31、M29/M30、M23/M26、M32/M33、G-M2-Events | 真实事件、份额、因子及各子叶保留已完成实现和未通过来源状态，移出共同价格完成条件 |
| M24/M25/M26 | Tushare 当前免费权限不足，按用户要求跳过；保留前端凭据配置及 40203 记录 |
| M21/M22/M23 未完部分、M34 及账号/SDK 子叶 | AKShare/EastMoney 暂不可用、TdxAiData 付费/ARM64 不兼容，按用户要求跳过；未购买或申请新账号 |
| G0-R、R02-quote-target、R02.18-runtime/target、M3 非共同单元 | 辅助来源、专业行情及研究资料列入扩展；RQData 无账号，当前不继续请求。能力目录保留明确状态 |
| G-M3 | 当前基础价格条目和其余扩展/不可用状态已对账；不宣称 M3 全部在线 |

扩展范围统一由 [TODO 的 multi-source-advanced-research](../TODO.md#当前-todo)记录重新立项条件；下文未勾选且标“扩展/跳过”的叶子是历史计划与未验收边界，不属于此次基础交付待办。保留已完成证据，不为关闭父项虚构高级能力。

### 0.2 AC 对账

| 验收项 | 本轮结论与依据 |
| --- | --- |
| AC01、AC17 | HiThink ETF qfq 正确标注；真实普通 Run、Snapshot、Worker 终态及重放完成 |
| AC02 | ETF 三口径路由/图表/缓存通过；股票三口径已有适配回归，真实股票新增来源属扩展 |
| AC03–AC06、AC18 | 既有事件 golden、成交时序、数量费用和独立参考实现保持原有效结果；本轮未改领域计算，Server/Schemas 回归及四条真实重放通过 |
| AC07–AC09 | 单位敏感规则继续按需拒绝；无事件依赖的归一化路径可运行；DSA 完整、缺日、分页、重复日期与无效价格回归通过 |
| AC10–AC11 | 保留源原生口径和完整窗口，真实主备均有来源；冻结后重放不切回在线主源；高级可逆转换不纳入本轮 |
| AC12–AC14 | 固定快照性质与真实观测时间保留；严格 PIT 继续单独限制；同序列信号/基准与既有 AI 隔离回归通过，本轮无新增 AI 调用 |
| AC15–AC16 | 现行 NAV/其他市场/真实账户隔离与监控拒绝规则保持回归；旧 V1/V2 读取按替换 Spec 删除，不恢复旧兼容；本轮无账本写入 |
| AC19 | 图表选择、只读目录、禁用原因、扩窗、来源和配置隔离完成；非法提交沿用既有目标验收及当前 Server 回归 |
| AC20 | 基础交付为 HiThink/腾讯两源、三种图表口径、qfq/hfq 回测及真实整窗备用；raw-events、事件和 M3 专项按用户调整列为扩展/跳过 |

检查边界：此前既有 `baseline-import.service.test.ts` 1550/1549 行失败已通过 C06 职责拆分修复，文件尺寸门禁通过，既有未增长超限文件仍保留警告；浏览器网络采集、Electron 和新镜像发布均未声明通过。

## 1. 基线、执行约束与证据

2026-09-30，关联 `E01-I1.5` 已完成固定来源 CN 日线的稀疏获取、逐来源窗口证据、身份事实组合冻结及 Runner 消费；包级与隔离 PostgreSQL/Redis/生产 Worker 验收通过，见[缺日冻结与执行证据](evidence/2026-09-30-e01-i1-5-sparse-window-runner.md)。随后 `E01-I1.6` 完成当前目标的真实 HiThink qfq 准备、创建、独立 Worker 成功、冻结重放、缺路由/撤销拒绝和浏览器客户端验收，见[目标验收证据](evidence/2026-09-30-e01-i1-6-target-acceptance.md)。本次仅覆盖既有精确范围的固定来源归一化研究基线，未新增严格 PIT、独立备用或真实费用证据；本 Task 的其余 M1/M2/M3 门禁保持各自状态。

需求以对应 Spec 全文为准，AC01–AC20 是验收索引，不替代正文中的约束。本次原样收录用户提供的 Spec；其中远端代码和供应商能力描述仍是原文基线，不代表本地实现或账号实测。

规划轮次只核对主仓文档规则、工作区状态、包脚本及关键文件入口；未审计完整实现，未运行测试、请求 Provider、检查数据库或部署。2026-09-25 开始实施后的证据以各任务记录为准。当前 AI Provider、图表、风险及相关文档存在用户未提交修改；P01 已记录实施基线并保留这些修改。

### 1.1 共同执行契约

- 每个叶子任务只交付自己的结果；关联门禁独立勾选，不作为已经完成的证据。分组不能直接派发。
- 每个任务的上下文为本节、标注的 Spec 小节及代码入口；允许修改其责任模块的必要实现、定向测试和所属文档。共享 schema、导出、锁文件、版本矩阵和本 Task 由协调者串行维护。
- 默认停止条件：本任务检查通过、启动依赖缺失、需要未获授权的外部操作，或剩余工作超出写入边界。超出边界先拆子任务，不顺带接管下一个任务。
- 大文件只做必要接缝改动，新增职责放入语义明确的 helper/repository/component；修改跨模块依赖须同步检查并维护 `scripts/check-boundaries.mjs`。
- 启动依赖必须有可检查的交付和通过证据；未完成的同名类型、独立编造的 mock、任务编号先后都不是契约就绪证明。已完成契约及证据见各任务执行记录。
- 所有执行记录初始均为“未开始；无验证证据”。执行后在对应任务下记录源码/配置基线、实际命令、结果、证据位置、受影响输入及下一步。不能仅记录“测试通过”。
- 仅更新当前 Task 的未完成义务；本轮不迁移 TODO、不归档、不提交代码。后续明确延期才按项目文档指南处理。

### 1.2 验证入口

以下是执行入口。规划轮次均未运行；实施后的实际结果以各任务执行记录为准。新增测试文件名在所属任务实施时确定并写回记录，不把不存在的路径当作已验证入口。

| 代号 | 工作目录与入口 | 证据边界 |
| --- | --- | --- |
| V-Schema | 主仓：`rtk proxy pnpm --filter @thesis-ledger/schemas exec vitest run`，按改动指定测试文件 | wire/领域契约、非法输入和旧格式 fixture |
| V-Domain | 主仓：`rtk proxy pnpm --filter @thesis-ledger/domain exec vitest run`，按改动指定测试文件 | Decimal、资金、数量、时序和数学 golden |
| V-Server | 主仓：`rtk proxy pnpm --filter @thesis-ledger/server exec vitest run`，按改动指定测试文件 | Reader、路由、预检、快照、运行及 AI 服务行为 |
| V-Desktop | 主仓：`rtk proxy pnpm --filter @thesis-ledger/desktop exec vitest run`，按改动指定测试文件 | 组件状态、表单与请求行为，不代表浏览器验收 |
| V-DSA | DSA：P01 核实 Python 环境与现有定向测试入口后记录完整命令 | 适配器、单位、精确目标及消费契约 fixture |
| V-DB | 主仓：`rtk pnpm migration:matrix`，随后隔离 PostgreSQL 执行全部 migration 与新旧数据读写断言 | 结构、权限、索引、保留数据升级；不代表目标部署 |
| V-Repo | 定向验证通过后，受影响包 test/typecheck/build，再执行边界、依赖、复杂度、契约及秘密扫描门禁 | 记录实际执行命令和输入范围，不为文档修改启动全仓构建 |
| V-Runtime | infra：按变更选择 `./scripts/sync-code.sh [all\|dsa\|thesis-ledger]` 或 `./scripts/update.sh [all\|dsa\|thesis-ledger]` | 使用最小目标；依赖/Schema/SDK 改变须完整更新，快更不证明镜像更新 |

验证逐级推进；低层失败不提前构建镜像。高成本结果只有输入变化才重跑。生产镜像主要源码稳定后构建，故障场景复用同一环境。数据库重建、volume 清理、旧快照删除和购买/启用未授权计费接口不属于本 Task 授权。

### 1.3 公共上下文入口

| 代号 | 已核对存在的入口 | 责任 |
| --- | --- | --- |
| K-Contract | `packages/schemas/src/backtest-v2.ts`、`backtest-data.ts`、`backtest-execution-model.ts`、`market-route-v2.ts`、`market-bar-series-v2.ts` | 价格、路由、数据和运行格式 |
| K-Domain | `packages/domain/src/backtest-simulation.ts`、`simulation-ledger.ts`、`backtest-execution-model.ts`、`backtest-corporate-actions.ts`、`backtest-analytics-v2.ts` | 单一引擎与模拟事实 |
| K-Market | `apps/server/src/market/market-bar-reader.ts`、`market-bar-window.ts`、`market-data.controller.ts` | Reader 与市场读取 |
| K-Run | `apps/server/src/backtest/backtest-snapshot-builder.ts`、`backtest-snapshot.ts`、`backtest-v2-runner.ts`、`backtest-artifact-store.ts` | 冻结、执行与重放 |
| K-AI | `apps/server/src/strategy-optimization/`、`packages/schemas/src/strategy-optimization.ts` | 实验、公平比较和真实监控采纳 |
| K-UI | `apps/desktop/src/features/providers/`、`strategy/BacktestSetupDialog.tsx`、`strategy/BacktestModelConfiguration.tsx`、`strategy/BacktestModelDisclosure.tsx`、`market-detail/` | 现有设置、图表与回测界面 |
| K-DSA | 相邻 DSA 的 `src/services/thesis_ledger_provider_runtime.py`、`data_provider/`、`tests/test_thesis_ledger_contract.py`、`docs/thesis-ledger-contract-v1.md` | 实际上游访问与能力事实 |
| K-Infra | 相邻 infra 的 `scripts/sync-code.sh`、`scripts/update.sh`、`scripts/check-compatibility.mjs`、`compatibility.json` | 部署与兼容 |
| K-Docs | Spec §2 所列基线、`docs/architecture/version-matrix.md`、`docs/DOCUMENTATION-GUIDE.md` | 契约冲突消解和发布说明 |

### 1.4 子代理执行台账（2026-09-25）

总体目标与验收以本 Task 及对应 Spec 全文为准。基线是 P01/C01/C02 已完成、其余实现与真实门禁未完成；主仓已有用户未提交的 AI Provider、图表、风险与文档改动，必须保留。子代理只修改下表独占路径，其他路径只读；协调者独占本 Task、共享导出与最终集成。`worker_done` 只表示子代理已完成局部验证，不表示总体验收通过。

| ID | 结果 | 依赖 | 独占写入路径 / 共享资源 | 所有者 / 工作区 | 状态 | 交付与局部检查 |
| --- | --- | --- | --- | --- | --- | --- |
| P02-a | DSA 有限来源能力目录与 R 组叶子建议 | P01；现有 DSA 实现为只读输入 | DSA `docs/thesis-ledger-source-capabilities.md`；不得请求真实 Provider 或改公共 manifest | `p02_catalog` / DSA 共享工作区 | worker_done | 新目录覆盖 Spec §4/§14 并提出 R 组 29 个建议；13 个引用路径存在、diff check 通过，未请求 Provider。初稿把 manifest 组合误数为 14，P02-b 核实实际为 15 并纠正 |
| P02-b | 将目录登记拆成原子能力单元 | P02-a 文档当前输出 | DSA `docs/thesis-ledger-source-capabilities.md` 独占；其他文件只读 | `p02_atomic_catalog` / DSA 共享工作区 | worker_done | §2/§3/§4 整理为 34/57/38 行；Spec 来源 9/9、能力 5/5、外部前提 4/4、路径 13/13，新增文件空白检查通过；未知接口/许可保持选择待定，R 建议待 P02-c 原子化 |
| P02-c | R01–R08 建议拆为可派发叶子和选择门禁 | P02-b 原子目录当前输出 | DSA `docs/thesis-ledger-source-capabilities.md` 的 §5/自检独占；其他章节只读 | `p02_r_leaves_retake` / DSA 共享工作区 | worker_done | §5 拆成 116 个固定编号叶子及按每个显式 RSS/Atom URL 物化的 R07.8 模板；各叶有 owner/输入/输出/门禁，静态编号和空白检查通过，未实现任一叶或请求 Provider；协调者同步更新 §6 的阶段自检 |
| C03-a | 新运行/快照 Schema 与旧格式解码契约 | C01/C02 的当前源码和 fixtures | 主仓 `packages/schemas/src/backtest-v2.ts`、`backtest-data.ts`、`backtest-execution-model.ts`、`strategy-optimization.ts`、`index.ts`，`packages/schemas/test/backtest-v2.test.ts`、`backtest-data.test.ts`、`backtest-execution-model.test.ts`、`strategy-optimization.test.ts` 及新建 `packages/schemas/test/backtest-snapshot-v3.test.ts`、`packages/schemas/fixtures/backtest-snapshot-v3*.json`；Schema 构建输出串行使用 | `c03_snapshot` / 主仓共享工作区 | worker_done | V3 RunConfig/Snapshot/优化封存 Schema 与 V1/V2 解码；Schema 包 26 文件/225 测试、typecheck、Prettier、diff check 通过。Server writer 尚未切换，新运行只写 V3 的运行态证据待 S08/S09 |
| C04-d | 固定跨仓 wire/handshake 实施接缝 | C01/C02/C03-a 当前 Schema 与共享 fixtures | 三仓只读；不消费其他代理进行中的文件 | `c04_wire_discovery` / 只读勘查 | needs_split | 发现 V3 BarSeries、Data 错误码和独立 Data 能力握手缺契约；Control V1/V2 与 Data V2 版本域独立，现有 Data 错误还恒标 V1。三仓只读完成，先 C04-c1/c2 冻结，再分派 DSA/Server |
| C04-c1 | 冻结 Data Contract V3 wire | C01/C02/C03-a 当前 Schema 与 C04-d 接缝结论 | 主仓新建 `packages/schemas/src/market-data-wire-v3.ts`、`packages/schemas/test/market-data-wire-v3.test.ts`、`packages/schemas/fixtures/market-data-v3*.json`，修改 `packages/schemas/src/index.ts`；其他 Schema 文件只读 | `c04_data_wire` / 主仓共享工作区 | worker_done | 独立 `dataContractVersions`、严格 V3 bars/coverage/来源/指纹和安全错误码；4 canonical fixtures。格式后定向 5/5、Schema typecheck、协调者全包 28 文件/233 测试/build、Prettier/index diff check 通过 |
| C04-c2 | 冻结 Control V3 握手关系 | C04-c1 稳定输出与 C02 RoutePolicy V3 | 主仓新建 `packages/schemas/src/market-control-wire-v3.ts`、`packages/schemas/test/market-control-wire-v3.test.ts`、`packages/schemas/fixtures/market-control-v3*.json`，修改 `packages/schemas/src/index.ts`；其他 Schema 文件只读 | `c04_control_wire` / 主仓共享工作区 | worker_done | V3-only Control handshake/Policy Apply、旧 V1/V2 保留、Data 版本独立；4 canonical fixtures。定向 3/3、Schema typecheck、协调者全包 28 文件/233 测试/build、Prettier/diff check 通过 |
| C04-d1 | DSA Control V3 握手与 Policy 应用 | C04-c1/c2 的 canonical fixtures 与全包检查 | DSA `api/thesis_ledger.py`、`src/services/thesis_ledger_control.py`、新建 `tests/test_thesis_ledger_control_v3.py`；其他 DSA 文件只读 | `c04_dsa_control_retake` / DSA 共享工作区 | worker_done | V3 独立 SQLite 状态/revision、严格 Desired/Effective 身份顺序，旧无参数 GET/V1/V2 保留；定向 33/33、py_compile、测试 flake8、diff check 通过。Data V3/实际覆盖基准另做；全文件 flake8 有 9 个本次代码外告警 |
| C04-d2 | DSA Data V3 BarSeries 与能力声明 | C04-d1 已验证 API 接缝、C04-c1 wire | DSA `api/thesis_ledger.py`、`api/app.py` 的必要 V3 router 挂载、`src/services/thesis_ledger_provider_runtime.py`、新建 `tests/test_thesis_ledger_market_v3.py`；其他 DSA 文件只读 | `c04_dsa_data_v3` / DSA 共享工作区 | worker_done | 仅 CN 日线且 Control V3 路由可用时返回完整交易日序列；未知口径、缺覆盖与无来源安全拒绝，基准保留 provider-defined。V3 定向 8/8、V1/V2 回归 64/64、py_compile、增量 flake8 与 diff check 通过；整份旧文件 lint 有既有及并行段落告警，真实 Provider 未验证 |
| C04-d3 | DSA Control V3 精确路由目录与就绪判定 | C04-c3 wire、C04-d1/d2 当前实现 | DSA `api/thesis_ledger.py`、`src/services/thesis_ledger_provider_runtime.py`、`src/services/thesis_ledger_control.py`、新建 `thesis_ledger_market_v3_adapters.py` 与目录测试；其他文件只读 | `c04_dsa_catalog_v3` / DSA 共享工作区 | worker_done | 16 条代码可调用 CN 日线目录；原 configured→ready 缺口经 C04-d4a/b 修复，当前缺 G0 admission 一律不就绪。最初定向 18/18、V1/V2 54/54；修复后结果见 C04-d4b，真实准入未做 |
| C04-d4-d | 精确来源准入状态缺口只读审查 | C04-d3 的 16 条目录 | DSA Control/Provider runtime/catalog、准入目录只读 | `c04_readiness_audit` / DSA 共享工作区 | needs_split | 16 条当前只证明存在调用器，却在无 G0 证据时因 configured/enabled 被标 ready/eligible；Catalog 与 circuit 状态也可能不一致，Tencent amount 有合成但 Data 未披露。必须加逐 RouteKey×Target 准入证据与同判门禁后才可真实启用；审查无文件改动 |
| C04-d4a | G0 准入记录与 Control Effective 门禁 | C04-d4-d 审查、S04-c2 仅占 Data/API 文件 | DSA `src/services/thesis_ledger_control.py`、新建 `thesis_ledger_route_admission_v3.py`、独立及 Control V3 测试；provider runtime/API 只读 | `c04_admission_store` / DSA 共享工作区 | worker_done | 独立 SQLite 准入表，显式记录/读取/失效/撤销与 symbol/date scope；缺/失效/过期在 Effective 中 not_admitted，健康熔断独立，无 HTTP 写入口。准入加 V1/V2 回归 25/25、py_compile/新增文件 flake8/diff check；Control V3 7/8，余 1 是 Catalog 仍推 ready，d4b 正修 |
| C04-d4b | Catalog 按当前 G0 准入生成就绪状态 | C04-d4a Store 方法稳定、S04-c2 runtime 已交接 | DSA `src/services/thesis_ledger_provider_runtime.py` 中目录分支与必要定向测试；Control/API/Data 测试由协调者同步当前修订 fixture | `c04_dsa_catalog_v3` / DSA 共享工作区 | worker_done | 精确适配器、有效有界 admission 与 adapter/source/credential 三修订一致才 ready；Data 路由筛选及 Provider 调用前均重查，旧 Effective 不足以放行。无凭据来源显式 not-required，需凭据但无当前 credentialVersion 的来源保持未准入。V3 定向 42/42、V1/V2 与 admission store 52/52、py_compile/目标 flake8/diff check 通过；未请求真实 Provider |
| C04-s | Server DSA V3 transport consumer | C04-c1/c2 canonical fixtures 与全包检查 | 主仓 `apps/server/src/integration/dsa/dsa.client.ts`、新建 `dsa-v3-protocol.ts`、`apps/server/test/integration/dsa.client.test.ts`；其他 Server 文件只读 | `c04_server_client_retake` / 主仓共享工作区 | worker_done | V3 Control handshake/apply/Effective 与独立 Data capabilities/BarSeries 严格解析，Apply 核对 Effective 路由身份/顺序；定向 9/9、Prettier/diff check 通过。Server typecheck 因并行 Schema AST 扩展产生 9 项其他文件错误，待集成修复；真实 DSA 留后续 |
| B01-a | Typed AST 单位与规则兼容检查 | C01 当前源码；C03 写入仅作只读契约输入，若依赖其新输出须等待 | 主仓 `packages/domain/src/backtest-execution-model.ts`、新建 `packages/domain/src/backtest-rule-compatibility.ts`、`packages/domain/test/backtest-execution-model.test.ts`、新建 `packages/domain/test/backtest-rule-compatibility.test.ts`；Domain 构建输出串行使用 | `b01_rules` / 主仓共享工作区 | worker_done | 指定四文件；定向 2 文件/20 测试、隔离 tsc、ESLint、复杂度、Prettier、diff check 通过。协调者包级 `rtk proxy pnpm --filter @thesis-ledger/domain typecheck` 失败于新模块第 174 行的 `exactOptionalPropertyTypes`，需 B01-r 修复 |
| B01-r | 修复 B01 包级类型错误 | B01-a 输出与包级失败证据 | 主仓 `packages/domain/src/backtest-rule-compatibility.ts` 独占；其他文件只读，Domain 构建输出独占 | `b01_type_repair` / 主仓共享工作区 | worker_done | 只在 `sourceId`/`coordinate` 有值时写入可选字段；定向 2 文件/20 测试与 Domain 包级 typecheck 通过，判定语义未改 |
| B03-a | 归一化定仓与费用预留 | B02 与 Domain 包级检查通过 | 主仓 `packages/domain/src/backtest-sizing.ts`、`backtest-sizing-risk-adapter.ts`、`trade-costs.ts`、`simulation-ledger.ts`、`backtest-exchange.ts` 及 `packages/domain/test/` 中同名五份测试；Domain 构建输出独占 | `b03_sizing_costs` / 主仓共享工作区 | worker_done | 修改 sizing/risk adapter/exchange 及三份测试；定向 5 文件/57 测试、Domain typecheck、Prettier/diff check、协调者完整 28 文件/257 测试及 build 通过；目标 ESLint 0 错误、3 条既有复杂度警告 |
| B04-a | Domain 归一化成交时序接线 | B01/B02/B03 当前通过输出 | 主仓 `packages/domain/src/backtest-simulation.ts`、`backtest-simulation-evaluator.ts`、`backtest-engine.ts`、`backtest-exchange.ts`、`simulation-ledger.ts` 及 `packages/domain/test/` 中同名测试、`backtest-correctness.test.ts`；Domain 输出独占 | `b04_domain_execution_retake` / 主仓共享工作区 | worker_done | `runExchangeSimulation` 接通时序、DAY 尾单、预留/结算、归一化账本；事件 AST 在 M33 前 unavailable，拒绝码保留。定向 6 文件/72、typecheck、ESLint/Prettier/diff check；协调者 Domain 全包 29 文件/261 测试及 build 通过，Server 装配另派 B04-b |
| B04-b | Server V2 exchange 装配 Domain 执行闭环 | B04-a Domain 全包测试/build 当前通过 | 主仓 `apps/server/src/backtest/backtest-v2-execution-exchange.ts` 与四组 V2 exchange 定向测试；其他文件只读 | `b04_server_assembly` / 主仓共享工作区 | worker_done | 当时完成 raw V2/V3 T+1 买卖与结果 parity，四组 Server 定向 12/12、typecheck、ESLint/Prettier/diff check 通过；当时的 normalized 早拒绝已由 S07-m3 改为同坐标执行。V3 Snapshot/Runner 仍待 S08/S09，不能标 B04 总体完成 |
| B04-r | 按计划成交时点判断 T+1 可卖数量 | B04-b 定向发现信号时 settledQuantity=0，次日成交时仓位已结算 | 主仓 `packages/domain/src/backtest-engine.ts` 与对应 exchange/simulation 定向测试；其他文件只读 | `b04_t0_settlement_repair` / 主仓共享工作区 | worker_done | DAY 目标开盘投影届时已结算持仓，实际仓位仍由原队列事件入账；split 同步调整待结算投影。Domain 定向 20/20、typecheck、diff check 通过；B04-b Server 联动复测仍有 1 项不足仓位失败，Domain 全包/build 待 S07-c 结束后串行 |
| B05-a | Domain 基准与绩效比较协议 | C03/B02/B03 与 Domain 当前构建输出 | 主仓 `packages/domain/src/backtest-analytics-v2.ts`、新建 benchmark helper、对应定向测试；其他文件只读 | `b05_domain_benchmark` / 主仓共享工作区 | worker_done | 冻结价格/收益/历史/成本/来源/分红身份与指纹，旧 V2 standalone 零成本收益标 `unverified`，仅兼容且可算成本时给 excessReturn，固定费不支持时拒绝；定向 2 文件/16 项、Domain typecheck/Prettier/diff check 通过，Domain build 待 B04-r 后串行 |
| B05-d | Server 基准报告投影只读勘查 | B05-a 当前输出及 C03 V3 结果契约 | 主仓 Server 回测竖切/runner/结果 Schema 只读 | `b05_server_projection_discovery` / 主仓共享工作区 | worker_done | runner 投影漏 `benchmarkCompatibility`，且 exchange/NAV analytics 尚未传基准数据/冻结身份；严格 V3 result 需增字段，当前持久化仍 V2。先待 S07-c 释放 `backtest-v2.ts` 再扩 Schema，Server 投影与 S08/S09 输入接线分开；未改文件 |
| B05-b1 | V3 结果基准兼容报告严格契约 | B05-a Domain 报告与 S07-c Schema 已交接 | 主仓 `packages/schemas/src/backtest-v2.ts`、对应测试/必要 fixture；其他文件只读 | `b05_result_schema_projection` / 主仓共享工作区 | worker_done | V3 严格状态/16 位报告指纹、缺失/不同字段及费用假设；成本未知为 unavailable，拒绝继承 V2 隐式零成本，V2 旧结果保留。定向 17/17、Schema typecheck/diff check 通过；全包暂有 S07 新约束引发 4 个优化 fixture 失败，另派修复 |
| A03-a | 真实风险规则采纳时重编译 | C01/B01 当前已验证输出 | 主仓 `apps/server/src/strategy-optimization/strategy-risk-application.service.ts`、`strategy-risk-application.types.ts`，`apps/server/test/strategy-optimization/strategy-risk-application-{identity,update,preview}.test.ts`；Server 构建输出等待 S03 | `a03_risk_adoption` / 主仓共享工作区 | worker_done | service 与 preview test 两文件；无效 V2/风险规则未完整映射/绝对价或模拟数量直接 API 提交均在写入前拒绝，百分比用真实成本；定向 3 文件/11 测试、ESLint/Prettier/diff check 通过，Server typecheck/真实域 DB 隔离待后续 |
| S06-a | 无网络计算依赖计划纯函数 | C03-a/B01/S06-c 当前契约 | 主仓新建 `apps/server/src/backtest/backtest-dependency-plan.ts`、`backtest-dependency-price.ts`、`backtest-dependency-events.ts`、定向测试；其他文件只读 | `s06_dependency_planner` / 主仓共享工作区 | worker_done | 入口 192 行、价格/预热/B01 369 行、事件/PIT 223 行；10/10 定向及 Prettier/diff check 通过。Server typecheck 因并行 B04 exchange 文件暂错，后续串行复核；运行态接线留 S07/S08 |
| S06-c | 冻结事件 AST 与事实时间的依赖契约 | S06-a 缺口与 C03-a 当前 Schema | 主仓 `packages/schemas/src/backtest-v2.ts`、`backtest-data.ts` 及两模块定向测试；其他文件只读 | `s06_event_contract` / 主仓共享工作区 | worker_done | `effectiveDate` 与公告 `announcedAt`/来源 `visibleDate` 分离，日级可见最早下一有效时段；新增 `corporateActionEvent` AST，旧 V2 仍可解析。定向 23 项、Schema typecheck、diff check 通过；S06 planner 的依赖阻断仍待接线 |
| U04-d | 图表口径独立状态接缝与用户 WIP 盘点 | C01/C02 当前契约；现有 Desktop 未提交图表改动 | Desktop 全部只读；不运行浏览器或修改组件 | `u04_ui_discovery` / 主仓共享工作区 | needs_split | Server detail 已接收 adjustment，但共享 MarketDetailRequest/api-client/Desktop key 未带口径；Server 仍按 Control V2 读路由，缺 V3 能力/禁用原因，U04 完整实现依赖 S01/S04。用户 `MarketNavChart.tsx`/`button.tsx` WIP 可复用且不改 |
| U04-c | 图表 detail 请求口径共享契约 | C04-c1 完成后独占 Schema 包检查；现有 Server detail 接口 | 主仓 `packages/schemas/src/market.ts`、相关 Schema 测试、`packages/api-client/src/index.ts`、相关 api-client 测试；不改 Desktop/Server | `u04_market_request_contract` / 主仓共享工作区 | worker_done | 可选 `adjustment` 经 Schema 与 API Client 显式透传，省略不设默认；非法值拒绝、NAV `navLimit` 保留。Schema 定向 41 项/typecheck/build、API Client 定向 12 项/typecheck、diff check 通过；Desktop 缓存键/运行态仍待 U04 后续 |
| B02-a | 归一化持仓及公司行动记账 | C01 当前源码 | 主仓 `packages/domain/src/simulation-ledger.ts`、`backtest-corporate-actions.ts`、新建 `packages/domain/src/backtest-normalized-accounting.ts`、`packages/domain/test/simulation-ledger.test.ts`、`backtest-corporate-actions.test.ts`、新建 `packages/domain/test/backtest-normalized-accounting.test.ts`；Domain 构建输出串行使用 | `b02_accounting` / 主仓共享工作区 | worker_done | 指定六文件；定向测试 3 文件/20 项通过，ESLint/Prettier/`git diff --check` 通过；Domain typecheck 待 B01 后串行执行。Server 尚未传 `accountingBasis`，`CORPORATE_ACTION_IGNORED` 仍被引擎归入规则拒绝，后续接线处理 |
| S02-d | 只读勘查最小保留数据迁移方案 | P01/C01/C02 当前源码 | 无写入；Prisma、migrations、raw-owned、迁移矩阵、runtime 打包及其测试仅只读；不连接数据库 | `s02_discovery` / 主仓共享工作区 | worker_done | 建议两表新增 `seriesVersion` 并以 `legacy` 回填，复合唯一键加入该字段；旧值保留，S03 改读写 selector；无文件改动，未运行 DB，隔离保留数据升级另验 |
| S02-i | 行情序列身份 Schema 与新增 migration | S02-d 方案；P01/C01/C02 当前源码 | 主仓 `apps/server/prisma/schema.prisma`、新建 `apps/server/prisma/migrations/20260925100000_market_bar_series_identity_v1/migration.sql`、`apps/server/test/platform/database-structure.test.ts`；其他脚本/旧 migration 只读 | `s02_schema` / 主仓共享工作区 | worker_done | 指定三文件；占位 URL `prisma validate`、`migration:matrix`（16 SQL/66 表）、定向 10 测试、runtime 输入 check、diff check 通过；未连接 DB，S03 须显式提供版本值 |
| S02-v | 隔离 PostgreSQL 验证全量及保留数据升级 | S02-i 当前迁移输出 | 仓库只读；仅使用专属临时目录与临时 PostgreSQL 容器/端口，不触碰目标开发库或卷 | `s02_db_validation` / 隔离测试资源 | worker_done | `migration:matrix` 16 迁移/66 表，`test-dev-database-rebuild.py` 7 断言通过；另用 `postgres:17-alpine` 隔离库验证旧 Fact/Coverage 行保留、`legacy` 回填、新唯一键共存/冲突和 app role 权限；专属临时容器已销毁，目标库未触碰 |
| S03-a | 行情事实与覆盖的版本隔离读写 | S02-i/S02-v 当前 Schema 与验证输出 | 主仓 `apps/server/src/market/market-bar-reader.ts`、新建 `apps/server/src/market/market-series-identity.ts`、`apps/server/test/market-bar-series-v2.test.ts`、`apps/server/test/market/market-reader-review-regressions.test.ts`、新建 `apps/server/test/market/market-series-identity.test.ts`；Server Prisma 生成输出独占 | `s03_series_cache` / 主仓共享工作区 | worker_done | 指定五文件；版本含已证实基准或本地内容哈希，不用 manifest revision/observedAt/limit 冒充；Fact/Coverage/Redis 同版本，旧 legacy 可读、多版本歧义读穿；Prisma generate、定向 3 文件/35 测试、Server typecheck、ESLint/diff check 通过。V2 上游缺基准/页完整性，待 C04/S04 接线 |
| S03-v | 版本隔离缓存的独立 DB 读写验证 | S03-a/S05-a 当前输出与 S02 migration | 三仓只读；仅专属 `/private/tmp/thesis-ledger-s03-db-*` 和唯一临时 PostgreSQL 容器可写 | `s03_isolated_db_validation` / 隔离数据库 | env_unavailable | `desktop-linux` 的 Docker daemon 当前不可连接；未建容器/库/脚本，Reader 与 Prisma DB 断言均为 0。26.8 GiB 临时空间可用；恢复 daemon 后重派独立 DB 验证，不能标通过 |
| S05-a | 固定快照与严格 PIT 读取模式 | S03-a 当前代码与 C01 契约 | 主仓 `apps/server/src/market/market-bar-reader.ts`、可新建 `market-history-mode.ts`、Market Reader 定向测试；其他文件只读 | `s05_reader_history_mode` / 主仓共享工作区 | worker_done | 固定快照保留 history/provenance/真实时间，严格 PIT 要求重建引用与已识别序列，不前填；定向 3 文件/38 项、diff check 通过。Server typecheck 因并行 Schema AST 产生 9 项其他文件错误待修；V2 未知身份在 PIT 模式安全拒绝，S04 另派 |
| S01-d | 路由持久化 V3 接缝只读勘查 | C02/C04 Schema 已冻结，C04-s 消费器进行中 | 主仓三仓只读；无测试输出写入 | `s01_route_persistence_discovery` / 主仓共享工作区 | worker_done | 现有 routes Json 无需 SQL；V2 matrix 与 V3 array 不能无损互推，建议版本化内部联合存储保留旧选择。现有 manifest 无精确口径 ready 事实，先补 C04-c3/d3/s2 catalog，再做 S01 精确应用；无文件改动/测试 |
| S06-d | Domain AST 与事件节点类型同步 | S06-c Schema 当前输出 | 主仓 `packages/domain/src/backtest-v2.ts` 及对应定向测试；其他文件只读，evaluator 由 B04-a 独占 | `s06_domain_ast_sync` / 主仓共享工作区 | worker_done | Domain 自有 BooleanExpression 加事件节点并分类为 boolean，定向 1 项和 diff check 通过；并发引出的 indicators walker 缺口由 S06-e 修复，全包 build 待 B04 结束后串行执行 |
| S06-e | Domain 事件节点预热遍历接缝 | S06-d 新 AST 后 Domain typecheck 报错 | 主仓 `packages/domain/src/backtest-indicators.ts` 与对应定向测试；其他文件只读 | 协调者 / 主仓共享工作区 | verified | 事件节点的指标 Bar 预热计为 1，事件可见窗口另由 S06 计划处理；Domain 全包 29 文件/261 测试及 build 通过 |
| C04-c3 | 精确路由能力目录的 Control V3 wire | S01-d 发现现有 manifest 不能证明复权口径 ready | 主仓新建 `packages/schemas/src/market-route-catalog-v3.ts`、测试、fixture，`index.ts` 导出；其他文件只读 | `c04_route_catalog_wire` / 主仓共享工作区 | worker_done | 独立 GET endpoint 与严格 envelope；重复 key/target 拒绝，partial/missing 目录不给可用行。定向 4/4、Schema typecheck/Prettier、协调者 Schema 全包 29 文件/239 测试及 build 通过；DSA 生产和 Server 消费未做 |
| C04-s2 | Server 精确路由目录 transport | C04-c3 当前 wire、C04-s client 输出 | 主仓 `apps/server/src/integration/dsa/dsa.client.ts`、`dsa-v3-protocol.ts`、`apps/server/test/integration/dsa.client.test.ts`；其他文件只读 | `c04_server_catalog_client` / 主仓共享工作区 | worker_done | GET 严格解析，partial ready 行隔离、重复/错误版本/缺失拒绝；定向 12/12、Prettier/diff check 通过。Server typecheck 暂被并行市场与依赖计划文件阻断；全量 suite 首次误触发有 AI Provider 1 例及优化 4 例失败，C03-r 另查 |
| C03-r | Strategy Optimization 旧实验与 V3 Schema 的兼容失败勘查 | C03-a Schema 后 Server 全量 suite 出现四个优化失败 | 主仓相关优化源码/测试只读，不改 AI Provider WIP | `c03_optimization_compat_discovery` / 主仓共享工作区 | worker_done | 四例在 create 解析时因测试输入仍是 V2/无版本请求而失败，尚未进入成本或持久化；StrategySchemaV2 seed 应保持 V2，当前 writer 未见漏字段。仅需测试 fixture 显式升级 V3；无文件改动/测试 |
| C03-r2 | 优化创建 V3 请求测试 fixture 迁移 | C03-r 确认四例仍传 V2 RunConfig | 主仓两份 `strategy-optimization-{cost-boundary,discovery}.test.ts` 及共用 postgres fixture；其他文件只读 | `c03_optimization_v3_fixtures` / 主仓共享工作区 | worker_done | create 请求显式 V3，runConfig 含 schemaVersion/完整 executionPriceProtocol，StrategySchemaV2 seed 保留 V2；两文件 15 项、Server typecheck、diff check 通过，不改生产 fallback |
| S01-a | V2/V3 策略 JSON 存储与 revision 生命周期 | S01-d 只读结论、C02 Schema | 主仓 `apps/server/src/market/market-control.service.ts`、新建 `market-policy-storage.ts`、服务与存储定向测试；其他文件只读 | `s01_policy_storage` / 主仓共享工作区 | worker_done | V3 内部 wrapper 保留旧 V2 JSON，缺目录 Desired rejected/Effective stale 且不推 DSA；读/重试/回滚/删除分版本。21/21 定向、目标 ESLint/Prettier/diff check 通过；service 485→403 行，Server typecheck 后被并行 B04 文件阻断，精确目录留 S01-b |
| S01-b | 精确 catalog 与 V3 Desired/Effective 应用 | S01-a 与 C04-s2 当前源码/测试 | 主仓 `apps/server/src/market/market-control.service.ts`、新建 `market-policy-catalog.ts`、对应服务/目录定向测试；其他文件只读 | `s01_catalog_application` / 主仓共享工作区 | worker_done | 保存/显式重试均 GET strict exact catalog；缺失/partial/非 ready 拒绝且保留旧 Effective，ready 才 Apply 并核对 Desired/Effective revision、路由/目标顺序，审计目录 revision/时间。定向 25/25、Server typecheck、Prettier/diff check 通过；真实 DSA 联通待 C04-d3 |
| S04-a | Reader 整窗口路由选择纯逻辑 | S03/S05 Reader 当前实现、C04 wire 与 S01 exact catalog | 主仓 `apps/server/src/market/` 新建 selector 与定向测试；其他文件只读 | `s04_window_selector` / 主仓共享工作区 | needs_split | 当前 V3 coverage 未提供预期交易日/上市前证据，价格事实也没有跨来源算法兼容证明；无法安全区分缺数与上市前或批准跨来源替换，未改文件。先冻结证据契约，再重派 selector |
| S04-b | 覆盖与跨源兼容证据契约只读设计 | S04-a 确认当前 wire 不足 | 主仓 Schema/DSA/Reader 只读 | `s04_window_selector` / 主仓共享工作区 | worker_done | DSA 成功前已有本地日历日期集合检查，但 wire 未披露日历版本/预期日期/上市事实，通用 methodVersion 不证明跨源等价；分为证明契约、DSA 生产、兼容准入、Server selector、Reader 接线五叶。只读无测试，协调者已回填 Spec §8.1 |
| S07-d | 归一化执行模型缺口的只读契约勘查 | B04-b 发现冻结模型只有真实 lot/tick | 主仓 Schema/Domain/Server 相关接缝只读 | `s07_normalized_model_discovery` / 主仓共享工作区 | worker_done | 当前 normalized 因数量步长、归一化价格 tick/限价、模拟成交额费用规则未冻结而安全拒绝；建议 Schema/Domain 执行模型拥有显式研究假设、S07 预检与 S08 artifact 冻结，旧 raw 路径保留；只读无测试 |
| S07-c | 归一化研究执行模型契约 | S07-d 勘查与 Spec §5.2–5.4/§9 | 主仓 Schema `backtest-execution-model.ts`、`backtest-v2.ts`、`backtest-snapshot-v3.test.ts`、相关模型测试；Domain `backtest-execution-model.ts` 及定向测试；其他文件只读 | `s07_normalized_execution_contract` / 主仓共享工作区 | worker_done | V3 normalized 必带完整模型且各 segment 声明连续价格/数量、真实 lot/tick/涨跌停不适用、模拟成交额费用；raw 拒绝该标记，旧 V1/V2 严格解码保留。Domain 解析无 InstrumentFact 兜底。Schema 定向 36/36、Domain 13/13、两包 typecheck/diff check 通过；全包/build 串行待 S04-c1/B05-b1 |
| S07-m1 | Domain 归一化连续数量与模拟费用机制 | S07-c 契约已交接、B03 当前执行代码 | 主仓 Domain `backtest-sizing.ts`、`backtest-sizing-risk-adapter.ts`、`backtest-exchange.ts` 及同名测试；engine/ledger 只读 | `s07_normalized_domain_mechanics` / 主仓共享工作区 | worker_done | normalized 连续 Decimal 定仓、模拟成交额费用/滑点/占款，明确拒真实固定数量与缺模型；raw 原路径保留。定向 4 文件/53、typecheck/ESLint/Prettier/diff check；协调者 Domain 全包 30 文件/283 测试及 build 通过（输入含 B04-r/B05-a/S07-c），engine 接线留 S07-m2 |
| S07-m2 | Domain engine 消费归一化执行假设 | S07-c/m1 与 B04-r 当前输出 | 主仓 `packages/domain/src/backtest-engine.ts`、simulation 定向测试；其他文件只读 | `s07_normalized_engine_wiring` / 主仓共享工作区 | worker_done | basis 传 Exchange，normalized 定仓只读目标开盘冻结 segment，丢弃 callback 自带假设；缺模型/段/假设安全拒绝，保留 T+1 与 raw parity。定向 23/23、typecheck/ESLint/Prettier/diff check；协调者 Domain 全包 30 文件/286 测试及 build 通过 |
| S07-m3-d | Server 归一化执行装配语义缺口 | B04-b 当前 raw 装配与 S07-m2 待交接 | 主仓 `apps/server/src/backtest/backtest-v2-execution-exchange.ts` 只读勘查 | 协调者 / 主仓共享工作区 | confirmed_gap | 现有 Server 在读取 rows 前无条件拒绝 normalized，并将未接线描述成“缺价格转换证据”；Spec 允许供应商自身固定复权坐标的连续研究，`conversionAvailable=false` 只限制无依据的跨坐标真实转换。须在 S07-m2 后独立装配同坐标执行与规则兼容，并保持跨源/严格 PIT 安全门禁 |
| S07-m3 | Server 同坐标归一化执行装配 | S07-c/m1/m2 已完成，S07-m3-d 确认语义 | 主仓 `apps/server/src/backtest/backtest-v2-execution-exchange.ts`、`apps/server/test/backtest/v2-execution.test.ts`；其他文件只读 | `s07_server_normalized_assembly` / 主仓共享工作区 | worker_done | 移除 normalized 无条件拒绝；同坐标 qfq 在 conversionAvailable=false 时仍按下一有效开盘成交，归一化账本不二次计分红/拆分。Server 定向 3/3、typecheck、ESLint/Prettier/diff check 通过。Snapshot Builder/Runner 仍 V2 且固定 none；运行时需在装配前执行坐标兼容预检，本叶不证明端到端 |
| S07-pd | 预检 API 与 revision 接缝只读勘查 | S06-a 依赖计划已完成 | 主仓 Backtest Controller/Service、依赖计划、revision 读取只读 | `s07_preflight_discovery` / 主仓共享工作区 | worker_done | 建议新独立预检服务、复用 `planBacktestDependencies`；stamp 绑定策略版本/hash、RunConfig checksum、Desired/Effective/catalog/目标序列，创建与 Snapshot finalize 前都复核。当前 Reader 与创建链仍 V2，运行态接线待 S04-d/S08；只读未改代码 |
| S07-p1 | V3 只读预检诊断与修订契约 | S07-pd 只读接缝、S06-a planner | 主仓新建 `packages/schemas/src/backtest-preflight-v3.ts` 与定向测试；共享导出由协调者维护 | `s07_server_normalized_assembly` / 主仓共享工作区 | worker_done | 严格请求、诊断、动作及修订戳，复用 BacktestErrorCode；stamp 绑定策略版本/hash、RunConfig checksum、Desired/Effective/Catalog revision 与有序精确目标。定向 5/5、Schema typecheck/Prettier/空白检查通过，协调者已导出；与 S04-d1 共同输入的 Schema 全包 31 文件/270 项及 build 通过；预检服务/API/创建复核另叶 |
| S07-p2 | 依赖计划缺口到预检诊断的纯映射 | S07-p1 Schema、S06-a planner | 主仓新建 `apps/server/src/backtest/backtest-preflight-diagnostics.ts` 与定向测试；Service/Reader 只读 | `c04_admission_store` / 主仓共享工作区 | worker_done | `mapBacktestDependencyIssueToPreflightDiagnosticV3` 映射 8 类 planner issue，缺显式标的/窗口/规则上下文稳定拒绝，来源未知明确标记；定向 5/5、目标文件 TypeScript/ESLint/Prettier/空白检查通过。S04-d3b 修复并行类型问题后协调者复跑 Server typecheck 通过；运行态另叶 |
| S07-p3a | V3 执行行情只读预检 | S07-p1/p2、S04-d4b Reader | 主仓新建 `apps/server/src/backtest/backtest-preflight-v3-execution.ts` 与定向测试；Controller/创建链只读 | `s04_server_window_selector` / 主仓共享工作区 | worker_done | 注入统一 `readV3`，按依赖计划核对执行窗、价格口径、PIT、来源目标与三项路由修订，返回绑定策略/配置摘要的只读结果；定向 9/9、Server typecheck、ESLint、Prettier、diff check 通过。只覆盖执行行情，signal/benchmark、API 与创建前复核另叶 |
| S08-d | V3 创建、行情、冻结、执行主链只读勘查 | C03、S03/S05、S04-c4 当前源码 | 主仓 Server backtest/market 调用链只读 | `s08_s09_vertical_discovery` / 主仓共享工作区 | worker_done | 发现创建、Snapshot Builder/manifest/store、Runner、终态持久化仍严格 V2；信号/执行/基准行情固定 none，Reader 仍走 V2。建议按 V3 行情适配、Snapshot writer、创建/终态、Runner 结果四叶串接；无文件改动或测试 |
| S08-d2 | V3 Reader 结果到冻结 Snapshot 的最小接缝勘查 | S04-d4a helper 已交付、d4b Reader 接线中 | 主仓 `DsaSnapshotBuilder`、Snapshot V3 Schema/manifest/store、Market V3 helper 只读 | `s08_s09_vertical_discovery` / 主仓共享工作区 | worker_done | 首叶为执行行情源冻结：价格口径取 V3 RunConfig，market/资产/周期/窗口取依赖计划，Reader 结果封存 Bars+完整证明 artifact。发现 V3 actualSource 错用 V2 provenance 强制 providerRevision/cache 字段；须 S08-p1 修契约后再做 writer。信号用途不能从执行协议自动推断口径，只读未改代码 |
| S08-p1 | V3 Snapshot actualSource 无损 provenance 契约 | S08-d2 确认 V3 Reader 与旧 V2 provenance 字段不匹配 | 主仓 `packages/schemas/src/backtest-data.ts` 的 V3 actualSource、V3 fixtures/tests；V1/V2 只读 | `c04_admission_store` / 主仓共享工作区 | worker_done | V3 actualSource 复用 Data V3 的 provider/upstream/routeIndex/effectivePolicyRevision，严格拒绝 V2 providerRevision/fetchedAt/freshUntil/cache 伪字段；V1/V2 不改。定向 5/5、Schema typecheck/ESLint/Prettier/diff check；协调者复跑 Schema 全包 31 文件/270 项及 build 通过。catalog/逐窗 proof/sourcePriceBasis 须写入哈希 artifact，顶层 providerRevisions 不能猜 |
| S08-d3 | V3 来源证明 artifact 与离线读取边界勘查 | S08-p1 provenance 契约已修正 | 主仓 Snapshot parquet writer/manifest/store、V3 proof/price basis Schema 只读 | `s08_s09_vertical_discovery` / 主仓共享工作区 | worker_done | 现有 ArtifactRow 仅标量，可把 V3 嵌套证据 canonical JSON 字符串列写现有 parquet/zstd，LocalArtifactStore 按字节 SHA-256、manifest finalize/replay 均核对；无需新增文件格式。V3 `providerRevisions:{}` 合法，现无真实键值语义，不得从 sourcePriceBasis 冒充旧 providerRevision；只读未改代码 |
| S08-p2 | V3 执行窗口来源证明 artifact 纯装配 | S08-p1/d3 契约与 S04-d4b Reader 已完成 | 主仓新建 `apps/server/src/backtest/backtest-snapshot-v3-source.ts` 与定向测试；Builder/Store/Schema 只读 | `c04_admission_store` / 主仓共享工作区 | worker_done | 只接 selected + pinned 请求，经关联 Schema、计划与持久化 evidence 多重核对后生成严格 actualSource 与 canonical JSON 标量证据行；定向 4/4、Server typecheck、ESLint、Prettier、diff check 通过。artifact 发布与 manifest 另叶 |
| S08-p3 | V3 执行行情与来源证明 Snapshot 写入 | S08-p2 纯装配、S04-d4b Reader | 主仓新增 `backtest-snapshot-v3-store.ts`、`backtest-snapshot-v3-builder.ts` 和定向测试；旧 Builder/Store 最小委托 | `c04_admission_store` / 主仓共享工作区 | worker_done | 完整执行窗 Bars、canonical evidence 与 normalized executionModel artifact 进入 V3 manifest；Store 校验 hash、缺失/篡改 artifact、整窗及来源后 finalize/replay，旧 V2 通路保留且拒读 V3。五个定向文件 36/36、Server typecheck、目标 ESLint、新文件/Builder Prettier、diff check 通过；旧 Store 全文件 Prettier 基线失败未重排。当前仅 execution，manifest 标记 partial；Run service/Controller/engine 和其他依赖另叶 |
| S08-p4 | V3 其余策略依赖的完整冻结 | S08-p3 执行行情/模型与 §12.1 绑定、事实及完整性叶子 | 主仓 V3 Builder/Store 消费 signal、calendar、instrument facts、corporate actions 等已规划依赖及其证明 | 协调者 / 主仓共享工作区 | 部分完成 | §12.1 已闭合同标的日线的显式信号/基准绑定、Calendar、InstrumentFacts 和按需 Events 冻结及离线校验，满足该闭包可置 complete；无绑定旧记录保持 partial。独立价格、FX/NAV 和其余事件运行范围仍待实现，不能宣布 S08/S09 整组完成 |
| S09-d | V3 Run 创建、领取、终态与重放接缝勘查 | S08-p3 并行实现中、现有 V2 生命周期 | 主仓 Backtest 创建服务、队列、Runner、结果 Schema 只读 | `s08_s09_vertical_discovery` / 主仓共享工作区 | worker_done | Controller/facade/队列/领取/attempt CAS 可沿用；版本阻断集中 `backtest-v2-run.ts` 的 V2 创建/结果解析与 `backtest-v2-runner.ts` 的 V2 metadata/输出。V2/V3 共用 `strategyVersionId,idempotencyKey` 唯一索引，同键异合同须稳定冲突；建议生命周期与 Runner 分叶，未改代码或测试 |
| S09-a | V3 Run 创建与持久终态的版本化生命周期 | S09-d 勘查、S08-p3 V3 execution-only Snapshot | 主仓新建 `backtest-v3-run-lifecycle.ts`、修改 `backtest-v2-run.ts` 委托及独立定向测试；Runner/Task 只读 | `s09_v3_lifecycle` / 主仓共享工作区 | worker_done | 严格 V3 创建、全局同键异合同/内容冲突、Snapshot 身份/哈希校验；当前 partial 依赖持久化 V3 RunConfig/manifest 后以 DATA_UNAVAILABLE 终结且不入队，retry 与 Worker 误投均拦截，mode='V2' 只作为既有执行 lane。V2/V3 定向 10/10、Server typecheck、ESLint/复杂度、Prettier、diff check、Import boundaries 通过；完整 V3 Runner/结果 Schema/真实 DB 仍未验 |
| S09-r | V3 离线 Runner 消费完整冻结输入 | S08-p4 当前完整闭包与 S09-a 版本化生命周期 | 主仓独立 V3 Runner、基准与结果封装、生命周期及Worker版本接线 | 见§12.3逐叶 / 主仓共享工作区 | 部分完成 | 严格离线Runner、订单方向投影、同序列基准与逐项费用舍入已实现；状态/attempt CAS、单调重试与取消恢复已定向验证。Worker版本选择、双Module注册和严格结果验真提交已接通并有本地集成；创建入队及V3 retry待r3c3，partial Snapshot继续拒绝。真实门禁和Desktop消费未完成 |
| S08-r | V3 回测整窗行情读取适配 | S04-c4 已稳定、C04 Server client 已有 V3 | 主仓 Market Reader 与 Backtest Builder 只读 | `s07_server_normalized_assembly` / 主仓共享工作区 | needs_split | 只在 Backtest 新建直调 DSA 的适配器会绕过统一 Market Reader，违反 Spec §10；当前 `MarketBarReader.read`、Policy/Remote/cache/fact 都是 V2，Builder 注入 `Pick<MarketBarReader, 'read'>`。先完成 S04-d 的统一 V3 Reader，随后仅做回测参数/结果映射；本轮未改代码 |
| S04-c1 | 完整窗口及上市事实证明 Schema | S04-b 设计与 Spec §8.1 已回填 | 主仓 `packages/schemas/src/market-data-wire-v3.ts`、新建 `market-coverage-proof-v3.ts`、对应测试/fixture；其他文件只读 | `s04_coverage_proof_contract` / 主仓共享工作区 | worker_done | V3 成功须带日历/上市/窗口/分页证明，按市场时区核对上市后预期日期与 complete Bars，拒纯上市前成功；定向 8/8、Schema typecheck/Prettier/diff check 通过。DSA 生产与 Server mocks 待更新，全包发现优化 fixture 4 项失败另修 |
| S04-c2 | DSA 生产完整窗口证明及请求范围复核 | S04-c1 wire 已冻结，C04-d2/d3 代码已交接 | DSA `api/thesis_ledger.py`、`thesis_ledger_provider_runtime.py`、新建 `thesis_ledger_market_v3_facts.py` 与 V3 Data 测试；Control/catalog/HiThink 新适配器只读 | `s04_dsa_coverage_producer` / DSA 共享工作区 | worker_done | 仅 `159516.SZ` 的已核实 2026-05-16..08-09 深市 59 日窗口产生日历/上市/分页 proof；其他标的/日期、缺页/重复/上市前安全拒绝。每次取数复核 admission symbol/date scope，撤销/过期/越界不触达 Provider。V3/runtime 58、V1/V2 26、py_compile/新增文件 flake8/diff check 通过；Catalog 缺 G0 gate 另由 d4b 修，真实 Provider 未验 |
| S04-c3a | 跨来源整窗兼容证明 Schema | S04-b 勘查与 Spec §8.1 | 主仓新建 `packages/schemas/src/market-route-compatibility-v3.ts` 与定向测试/fixture；共享导出由协调者维护 | `s04_cross_source_proof_contract` / 主仓共享工作区 | worker_done | 严格证明/观测契约与纯判定，绑定精确目标对、标的/窗口、双方序列与价格事实、基准/量额/分红语义和证据有效期；未知 provider-defined/无锚点、范围不等、过期与事实变化拒绝。合成定向 16/16、Schema typecheck/Prettier/空白检查；协调者补 index 导出后 Schema 全包 30 文件/263 测试及 build 通过。DSA 仍缺 amount/fixedBasisRange，生产回退不可用 |
| S04-c4 | Server 整窗口主备纯选择器 | S04-c1/c3a 契约与 S01 exact catalog | 主仓新建 `apps/server/src/market/market-window-selector-v3.ts` 与定向测试；现有 Reader/Control/DSA client 只读 | `s04_server_window_selector` / 主仓共享工作区 | worker_done | 核对 Desired/Effective revision、exact catalog、目标/provenance 和完整窗；备用要求有效兼容证明及序列指纹/价格事实匹配，最多读两源且不拼 Bar；上市前/缺窗/预热不足分诊，分钟线安全拒绝。定向 10/10、Server typecheck、ESLint/Prettier/空白检查通过；Reader 接线留 S04-d |
| S04-d0 | V3 选择器接入统一 Market Reader 的边界勘查 | S04-c4 选择器及 S03 事实/缓存身份已完成 | 主仓 Market Reader、fact store、DSA client、DI 只读 | `s04_server_window_selector` / 主仓共享工作区 | worker_done | DSA V3 无目标固定字段，内部按 Effective 自动回退，Server 无法先做跨源兼容判断；V2 cache/PG 不保存 sourcePriceBasis 与逐窗 coverageProof，不能当 V3 证据复用；Reader 输入还缺规范 market。须先目标固定、V3 证据存储，再接共享 Reader；只读未改代码 |
| S04-d1 | Data V3 精确目标固定请求契约 | S04-d0 确认 DSA 现有请求会自行按 Effective 顺序回退 | 主仓 `packages/schemas/src/market-data-wire-v3.ts`、对应测试/fixture；共享导出只读 | `c04_admission_store` / 主仓共享工作区 | worker_done | 可选严格 `routeTarget:{providerId,upstreamSource,routeIndex}`（index 0/1）；新请求/响应关联 Schema 核对 requestId、symbol、RouteKey 及 pin/provenance，旧无 pin V3 可解析。定向 10/10、Schema typecheck/Prettier/diff check；与 S07-p1 共同输入的 Schema 全包 31 文件/270 项及 build 通过；DSA 授权和单目标执行另叶 |
| S04-d2s | Server DsaClient V3 固定目标请求与关联校验 | S04-d1 契约已冻结 | 主仓 `apps/server/src/integration/dsa/dsa.client.ts`、必要 `dsa-v3-protocol.ts` 与 DsaClient 定向测试；Market Reader 只读 | `s07_server_normalized_assembly` / 主仓共享工作区 | worker_done | `marketBarsV3` 发送显式 routeTarget，响应经请求/响应关联 Schema 检查并保留窗口 proof；定向 13/13 含 pin/provenance 错配拒绝和旧无 pin V3，Server typecheck、ESLint/Prettier/diff check 通过。Selector read callback 需构造 pin 后调用，本叶未改 Reader/selector |
| S04-d2d | DSA Data V3 精确单目标执行 | S04-d1 pin 契约与 C04-d4 admission 门禁 | DSA `api/thesis_ledger.py`、`thesis_ledger_provider_runtime.py`、Data V3 定向测试；Control/facts/manifest 只读 | `c04_dsa_catalog_v3` / DSA 共享工作区 | worker_done | 只执行 Effective 中唯一精确 eligible 目标，调用前复核 admission/三修订/完整日期范围，失败不隐式回退；API 与响应 provenance 三字段匹配 pin。V3 定向 55/55、旧 DataGateway/ProviderRuntime/Control 58/58、py_compile/定向 flake8/diff check；fake adapter，无真实 Provider |
| S04-d3a | V3 逐窗价格与覆盖证据存储结构 | S04-d0 指出 V2 合并 Coverage 不可携带逐请求 proof | 主仓 Prisma Schema、新增 migration、结构定向测试；动态 migration matrix/runtime 打包门禁已核查，Reader/repository 只读 | `s04_server_window_selector` / 主仓共享工作区 | worker_done | 新 MarketBarWindowEvidenceV3 表按完整 RouteKey/目标/精确窗/seriesVersion/response fingerprint 与政策 revisions 保存 sourcePriceBasis/coverageProof，不放入 V2 合并 Coverage。Prisma validate、结构测试 11/11、matrix 17 migration/60 models/67 tables、runtime 输入及 diff check 通过；隔离 PostgreSQL/目标运行态未执行 |
| S04-d3b | V3 逐窗证据 repository | S04-d3a 新结构完成 | 主仓新建 `apps/server/src/market/market-window-evidence-v3.repository.ts` 与定向测试；Reader/selector/module/schema 只读 | `s04_server_window_selector` / 主仓共享工作区 | worker_done | `record/findExact` 要求 pinned request 与严格响应、完整 RouteKey/目标/窗口/seriesVersion/fingerprint/revisions；同身份同证明幂等、冲突拒绝，不经 V2 Coverage。定向 6/6、Server typecheck、ESLint/Prettier/空白检查通过；隔离 PostgreSQL 与目标运行态未执行，Module/Reader 注册另叶 |
| S04-d4a | Market V3 读穿获取与证据记录 helper | S04-c4、S04-d2s、S04-d3b 接口已稳定；DSA pin runtime 同步实施 | 主仓新建 `apps/server/src/market/market-bar-reader-v3.ts` 与定向测试；现有 Reader/Module/selector/repository/client 只读 | `s04_server_window_selector` / 主仓共享工作区 | worker_done | 读取 applied Desired/V3 Effective/complete catalog，经 selector pinned 读取，成功后记录逐窗证据；缺证明/目录/匹配失败拒绝，V3 不借 V2 缓存。定向 6/6、Server typecheck、ESLint/Prettier/diff check；真实 DSA/DB 未验，Reader/Module 接线留 d4b |
| S04-d4b | 统一 MarketBarReader 暴露 V3 与 Module 注入 | S04-d4a helper、S04-d3b repository 已完成 | 主仓 `market-bar-reader.ts`、`market.module.ts`、`market-bar-window.ts` 与定向测试；V3 helper/repository 只读 | `s04_server_window_selector` / 主仓共享工作区 | worker_done | `readV3` 委托窗口 helper、Module 注册 helper/repository；V2 `read()` 原路径保留。窗口切片与 fingerprint helper 移入已有窗口模块并从 Reader re-export，Reader 808→790 行。V2/V3 定向 40/40、Server typecheck、ESLint/Prettier/边界/diff check 通过；真实 DSA/DB/Docker 未验 |
| S07-r | 修复优化 Schema 中缺完整归一化模型的测试 fixture | S07-c 严格 normalized guard 与 Schema 全包 4 项失败 | 主仓 `packages/schemas/test/strategy-optimization.test.ts` 独占；其他文件只读 | `s07_optimization_schema_fixture` / 主仓共享工作区 | worker_done | V3 normalized 测试输入补完整模型，旧 V2 fixture 继续剥离 V3 字段；定向 17/17、typecheck/diff check，协调者串行 Schema 全包 29 文件/247 项与 build 通过（输入含 S04-c1/B05-b1/S07-c） |
| G0-H-p | HiThink 真实探针准备检查 | P01；不消费其他子代理写入 | DSA 配置/SDK/测试入口只读；不读取或输出凭据值，不发网络请求 | `g0h_preflight` / DSA 共享工作区 | worker_done | DSA 未发现 HiThink SDK/适配器/探针入口；用户确认 Key 在 `~/.zshrc`，交互式 zsh 子进程存在性检查为 `present`，未输出值。官方接口为 HTTPS，可不依赖 SDK；真实探针另记 G0-H-e |
| G0-H-e | 159516 ETF 目标窗口与重叠窗口只读探针 | 用户确认 `HITHINK_API_KEY` 在 `~/.zshrc`；官方历史接口文档 | 仓库只读；专属临时脚本/输出仅在 `/private/tmp/thesis-ledger-g0h-etf-*`，独占 HiThink Key 探针时段 | `g0h_etf_probe` / DSA 共享工作区 | worker_done | 两次 GET 均 HTTP 200/业务 0；首窗 60 行，重叠窗 5/5 行一致、`adjust:null`；摘要哈希已记录。UTC 午夜编码可能多取本地 08-10，精确目标覆盖待 G0-H-tz 验证；原始响应/Key 未输出 |
| G0-H-tz | 以上海时区边界核实目标 ETF 覆盖 | G0-H-e 摘要和官方日期示例 | 仓库只读；新专属 `/private/tmp/thesis-ledger-g0h-tz-*`，HiThink Key 探针串行独占 | `g0h_tz_probe` / DSA 共享工作区 | worker_done | 一次 GET HTTP 200/业务 0；上海日期 2026-05-18..08-07 共 59 行，与本地 XSHG 4.13.2 的 59 个交易日逐日一致，缺口/重复/越界 0、`adjust:null`；请求边界与脱敏 SHA-256 已记录，预热未覆盖 |
| G0-H-s | 普通股票三口径只读探针 | G0-H-tz 时区结论；官方股票日线文档 | 仓库只读；专属 `/private/tmp/thesis-ledger-g0h-stock-*`，HiThink Key 探针串行独占 | `g0h_stock_probe` / DSA 共享工作区 | worker_done | `000001.SZ` 同区间 none/forward/backward 各一次均 HTTP 200/业务 0，各 59 行、口径回显一致且价格序列彼此不同；重复/越界 0。官方单位为 CNY/股，算法版本和基准未知；未有该探针环境的独立日历缺口检查 |
| G0-H-d | 选择有现金分红 ETF 与无事件对照窗口 | G0-H 已有真实行情准入；官方事件/公告资料 | 三仓只读；公开一手资料检索，不使用 HiThink Key | `g0h_dividend_research` / 只读研究 | worker_done | 上交所基金公告核实 `510300.SH` 于 2025-06-18 除息，0.088 元/份，登记 06-17、发放 06-27；2025-07 无事件仅候选，完整公告检索未完成；未请求 Provider |
| G0-H-v | 分红 ETF 行情与事件端点只读探针 | G0-H-d 上交所公告与官方 HiThink 接口 | 仓库只读；专属 `/private/tmp/thesis-ledger-g0h-dividend-*`，HiThink Key 探针串行独占 | `g0h_dividend_probe` / DSA 共享工作区 | worker_done | `510300.SH` 事件窗日线一次 HTTP 200/业务 0、12 行、`adjust:null`；分红 endpoint 一次 HTTP 200/业务 0、14 条，2025-06-18 目标事件的登记/除息/发放日期及 0.880 元/10 份与上交所公告一致；响应哈希已记录，未证明事件覆盖完整或 DSA 接入 |
| G0-H-l | ETF 长窗口与分页只读探针 | G0-H-tz 目标日期边界与官方接口 | 三仓只读；专属 `/private/tmp/thesis-ledger-g0h-long-*`，HiThink Key 探针串行独占 | `g0h_long_window_probe` / DSA 共享工作区 | worker_done | 官方 ETF 历史接口 3 次只读请求均 HTTP 200/业务 0；五年窗与分段并集同为 769 个唯一日，重叠 7/7 全字段一致，无分页字段或可见截断。最早 2023-07-27 后由 G0-H-i 官方公告确认为上市日，隐式上限仍未知，摘要仅存脱敏本地文件 |
| G0-H-w | 159516 ETF 目标预热窗只读探针 | G0-H-tz/l 与深交所 2026 休市公告 | 三仓只读；专属 `/private/tmp/thesis-ledger-g0h-warmup-*`，HiThink Key 探针独占 | `g0h_long_window_probe` / DSA 共享工作区 | worker_done | 一次官方 ETF GET HTTP 200/业务 0；2026-01-01..08-09 响应 144 日，其中目标前 85 日、目标内 59 日，日期 01-05..08-07，无重复/冲突；`adjust:null`、重叠摘要指纹已存脱敏文件。旧目标窗无逐行指纹，跨请求逐行相等未证；缺完整深市预热日历，85 日不能标完整；量额单位/算法版本/基准仍未知 |
| G0-H-n | 510300 无事件对照窗口一手资料核查 | G0-H-d 已确认分红样本 | 三仓只读；仅官方公开资料，无 HiThink Key | `g0h_no_event_research` / 只读研究 | worker_done | 2025-07 仍仅候选：上交所托管三季报支持该季度无份额拆分，既有分红在 6 月；官方公告检索未取得完整结果，不能排除 7 月分红/合并。无 Key 请求或仓库写入 |
| G0-H-i | 159516 ETF 官方上市起点证据 | G0-H-l 最早返回日原因未核实 | 三仓只读；仅交易所或基金管理人公开一手资料，无 HiThink Key | `g0h_etf_listing_evidence` / 只读研究 | worker_done | [深交所上市公告](https://www.szse.cn/disclosure/notice/fund/t20230724_602100.html)列明代码 159516 于 2023-07-27 起上市交易；基金管理人年度报告同证代码、深交所和上市日期。可作为上市前区分依据，不证明行情完整性；未请求 Key 或改仓库 |
| G0-H-cal | 深市目标窗口交易日历证据 | G0-H-tz 用 XSHG 得到 59 日，但 `exchange_calendars 4.13.2` 无 XSHE | 三仓只读；交易所官方休市公告，无 HiThink Key | `g0h_szse_calendar_evidence` / 只读研究 | worker_done | [深交所 2026 休市公告](https://www.szse.cn/disclosure/notice/t20251222_618087.html)与上交所核对：目标 2026-05-16..08-09 仅 06-19 休市，边界周末，59 个交易日与本地 XSHG 一致；只证明该窗口，不把 XSHG 当深市全历史日历。2023–2026 年度公告可人工核，深交所逐月机器接口未核实 |
| G0-M-p | M2 来源逐单元准入计划与证据入口 | P02 已固定来源能力目录 | DSA 新建 `docs/thesis-ledger-m2-source-gates.md` 独占；其他文件只读，无 Provider 请求 | `g0m_probe_matrix` / DSA 共享工作区 | worker_done | 中文 167 行、25 个计划入口（23 来源能力、AKShare endpoint 选择、TdxAiData 镜像）；M21–M30 映射，M31 归 G0-H，静态 ID/列数/空白核对通过。未请求 Provider/读凭据/改 manifest；各子门禁仍待真实执行 |
| G0-M-AK-Q | AKShare/EastMoney ETF qfq 独立只读准入探针 | G0-M-p 的 `AK-ETF-Q` 入口与目标交易日证据 | 三仓只读；仅 DSA `.venv` 公共 AKShare endpoint，主窗与短重叠窗最多两次调用，无 HiThink Key | `g0m_ak_etf_q_probe` / DSA 共享工作区 | partial_evidence | `159516` 主窗 59/59、短重叠 10/10 全字段一致，日期缺/重/越界 0；规范化数据哈希 `b8c5378adf5c7ea4cf2c46d97ad112fff029b4cce5d5f7f02195a0ac6c1bde2e`。响应无量价/币种单位标注，qfq 基准/锚点/算法/量语义未知；不能判 G0 admitted 或与 HiThink 兼容，未改仓库/读 Key |
| D01-a | HiThink ETF 历史日线独立适配器 | G0-H 已证实目标窗真实接口，C04-d2 V3 端点当前实现 | DSA 新建 `src/services/thesis_ledger_hithink_etf.py` 与对应测试；现有 runtime/API/manifest 只读 | `d01_hithink_etf_adapter` / DSA 共享工作区 | worker_done | `adjust:null` 固定 qfq，symbol/版本化日历/有来源的上市日构成完整窗证据，缺 Bar/非日历失败；methodVersion/量额单位未知保留，Key 只入请求头且禁重定向。合成定向 33/33、py_compile、flake8/新文件空白检查通过；生产注册及真实联通留 D01-b |
| D01-b1 | HiThink ETF 运行注册最小写集审查 | D01-a 与 C04-d4b 已完成 | DSA runtime/control 只读，检查 API/精确目录/分页协议接点 | `c04_dsa_catalog_v3` / DSA 共享工作区 | needs_split | API V3 仅允许 akshare/tencent，精确目录与分页协议无 HiThink；凭据 revision 也无安全解析。仅改 runtime/control 会形成影子注册，未改文件或请求 Provider；拆成 D01-b2/b3 |
| D01-b2 | HiThink ETF 精确能力与本地协议登记 | D01-b1 缺口与 D01-a 纯适配器 | DSA `thesis_ledger_market_v3_adapters.py`、`thesis_ledger_market_v3_facts.py`、`thesis_ledger_control.py` 的 HiThink ETF manifest 及独立测试；runtime/API 只读 | `c04_dsa_catalog_v3` / DSA 共享工作区 | worker_done | gated 目录登记 ETF/CN/DAILY_BAR/1d/qfq/hithink/fund-market-historical，默认 16 行不变；本地 source contract/pagination 与上游数据、算法未知分开，manifest 声明 HITHINK_API_KEY，但 V3 not_admitted。91 项定向与回归、py_compile、新文件 flake8/diff check 通过；Control 既有 3 处格式告警未改，需 D01-b2r 修旧 V1/V2 误报，D01-b3 接生产调用 |
| D01-b2r | 旧 V1/V2 HiThink ETF 路由安全门禁 | D01-b2 manifest 新增后发现旧策略可能误报就绪 | DSA `thesis_ledger_control.py` 的 V1/V2 Effective 判定及独立测试；其余文件只读 | `c04_dsa_catalog_v3` / DSA 共享工作区 | worker_done | ETF Desired 可保存，但 V1/V2 Effective 均 available=false/eligible=false/reason=not_admitted；同路由 Tencent 仍 eligible。未声明的 HiThink STOCK 为 422 UNSUPPORTED_ROUTE 且旧 Effective 不变。26 项定向及回归、py_compile/diff check/新增测试 flake8 通过；合成凭据，无 Provider 请求 |
| D01-b3 | HiThink ETF gated Catalog/Data 运行接线初版 | D01-a/b2/b2r 与 S04-d2d 已交付 | DSA runtime/API 只读勘查 | `c04_dsa_catalog_v3` / DSA 共享工作区 | needs_split | environment key 无当前 credentialVersion，HiThink 无可在调用前核对的上游数据/调整算法版本；不得据此构造准入正例，未改文件或请求 Provider。将 dormant 注册与未来准入启用拆开，见 D01-b3a |
| D01-b3a | HiThink ETF dormant Catalog/API 注册 | D01-b2 gated 目录与本地 sourceContractRevision、D01-b3 停止边界 | DSA `thesis_ledger_provider_runtime.py`、`api/thesis_ledger.py`、专属定向测试；Control/facts/纯适配器只读 | `c04_dsa_catalog_v3` / DSA 共享工作区 | worker_done | 精确 HiThink ETF qfq route 进入 V3 Catalog/runtime/API，凭据仅在 admission 后惰性读取；缺当前环境 credentialVersion 时目录 not_admitted、Data/API 拒绝且 fake adapter 0 调用。dormant/契约/旧门禁 7/7、V3 pin/admission 55/55、旧回归 58/58、py_compile/目标 flake8/diff check；未请求真实 Provider。API 全文件仍有 6 个既有无关 flake8 告警，启用门禁另做 |
| D01-cd | HiThink 环境凭据修订安全设计勘查 | D01-b3a dormant 路由已接但无可比较 credentialVersion | DSA credential snapshot/Control SQLite/registry/admission 只读 | `c04_dsa_catalog_v3` / DSA 共享工作区 | worker_done | 环境 Key 变化不更新 SQLite credentialVersion，registry 也不暴露；建议内部用途隔离 HMAC revision 随 Key/master 轮换变化，复用 admission credential_revision 列，不泄露至 API/log。上游数据版本仍未知但本地 sourceContractRevision 可作端点修订。只读未碰 Key；本地 `~/.zshrc` 未检测到 DSA master key 注入，运行态仍须单独核实 |
| D01-c1 | HiThink 环境凭据内部 HMAC 修订 | D01-cd 方案与现有 DSA master secret | DSA `thesis_ledger_control.py` 的内部快照/helper 与合成密钥定向测试；runtime/API 只读 | `c04_dsa_catalog_v3` / DSA 共享工作区 | worker_done | `_provider_credential_revision_from_snapshot` 对当前 HiThink 环境 key 与 master 派生用途隔离 HMAC，带版本前缀；同值稳定，Key/master/master-version 轮换改变，缺值为 None；不使用 SQLite credentialVersion、不进 registry/API/log/repr。合成定向+旧 Control/dormant 22/22、py_compile/diff check/新测试 flake8 通过；Control 全文件有既存格式告警，真实 Key 未读 |
| D01-c2 | Catalog/Data 比较当前凭据修订并避免调用间竞态 | D01-c1 helper 与 C04-d4 admission Store | DSA `thesis_ledger_provider_runtime.py`、新建 HiThink admission 运行测试；Control/API 只读 | `c04_dsa_catalog_v3` / DSA 共享工作区 | worker_done | HiThink current revision 改用内部 HMAC，旧数字版本准入拒绝；Data 在筛选和 Provider 调用边界两次用当前快照复核 admission/scope，再把同一不可变快照传给取数适配器，Key/master/master-version 轮换及缺失均安全拒绝。合成 fake 覆盖正反例，92 项 V3/旧 runtime 回归、py_compile、flake8、runtime diff check 通过；真实 Provider 未调用 |
| D02-a | HiThink 股票三口径独立适配器 | G0-H 股票三口径真实探针、C04-d2 V3 端点当前实现 | DSA 新建 `src/services/thesis_ledger_hithink_stock.py` 与对应测试；现有 runtime/API/manifest 只读 | `d02_hithink_stock_adapter` / DSA 共享工作区 | worker_done | none/qfq/hfq 精确传 none/forward/backward，上海日期与调用方版本化交易日逐日校验，Decimal 量价/安全错误；未知算法/锚点/成交额基准不猜。合成定向 21/21、py_compile、目标 flake8/新文件空白检查通过；生产注册及真实联通留 D02-b |
| D02-b | HiThink 股票三口径 gated 注册 | D02-a 纯适配器、D01-c2 运行态准入 | DSA runtime、`thesis_ledger_market_v3_adapters.py` 及定向测试；Control/API/Task 只读 | `c04_dsa_catalog_v3` / DSA 共享工作区 | worker_done | 精确注册 STOCK none/qfq/hfq，默认禁用；当前 HMAC 修订、精确 admission 和目标/范围校验后才调用 pinned fake，撤销/轮换/越界拒绝。协调者把目录期望扩至 20 项，工人修复旧 ETF 专属 fake store 对新股票查询的过窄断言；联合 V3/V1/V2/HiThink 170/170、py_compile、目标 flake8、diff check 通过。Control Desired/Effective、Data HTTP coverage/pagination 与真实 Provider 另叶 |
| D02-c | Control 声明股票三口径的可选择能力 | D02-b gated V3 运行时；现有 `PROVIDER_MANIFESTS['hithink']` 仅声明 ETF | DSA `thesis_ledger_control.py` 及策略选择定向测试；runtime/API/Task 只读 | `c04_dsa_catalog_v3` / DSA 共享工作区 | worker_done | Control 声明 DAILY_BAR ETF+STOCK，但 `fund-market-historical` 仅 ETF、`hithink-financial-api` 仅 STOCK；V1/V2 Desired 可保存精确股票目标，V1/V2/V3 未准入 Effective 均 not_admitted，ETF qfq 门禁保留。工人相关测试 63/63、py_compile、测试文件 flake8、diff check；协调者修复另一条旧 ETF-only manifest 断言后，HiThink/Control/V3 Data 合并回归 149/149。Control 全文件仍有既有 E305/E123，未碰真实 Provider/Key；Data HTTP 与运行态另验 |
| U01-d | 路由 UI/API 边界只读勘查 | S01-b 当前完成输出 | 主仓 Server Controller、Desktop market-data feature 只读 | `u01_route_ui_readiness` / 主仓共享工作区 | worker_done | Server V3 保存/重试已有，Desktop 类型/API/面板仍固定 V2，Server 缺面向 Desktop 的 exact catalog GET；Desktop feature 文件未列用户脏 WIP，建议 Server 目录面与 Desktop UI 串行。未改文件 |
| U01-a | Server 面向 Desktop 的精确目录读取 | U01-d 勘查与 S01-b 已完成 | 主仓 `market-data.controller.ts`、`market-control.service.ts`、必要 `market-policy-catalog.ts` 与定向测试；其他文件只读 | `u01_server_catalog_read` / 主仓共享工作区 | worker_done | `GET /api/v2/market-data/routes/capabilities?contractVersion=3` 强制版本且 no-store；complete 才透传 exact entries，partial/unavailable 空 entries 与安全原因，纯读不碰策略。定向 24/24、Server typecheck、目标 ESLint/Prettier/diff check 通过；真实 DSA 联通另验 |
| U01-b | Desktop V3 各口径路由与目录消费 | U01-a/S01-b 当前实现 | 主仓 Desktop market-data feature 的 types/api/query/mutation/面板/页面与定向测试；已脏共享组件只读 | `u01_desktop_v3_routes` / 主仓共享工作区 | worker_done | complete exact catalog ready-only、非 ready 中文原因/partial 禁用、none/qfq/hfq 独立主备、V2 摘要、Desired/Effective 修订及单一保存/显式重试。定向 UI 11/11、目标 ESLint/Prettier/diff check/文件 guardrail 通过；Page 327→321、Panel 462→256 行，用户脏组件未改。Desktop typecheck 仅被两处优化 V3 RunConfig 输入缺字段阻断，另派修复 |
| U03-d | 优化实验创建 V2/V3 边界只读勘查 | C03 V3 Schema 与 U01-b Desktop 类型检查 | 主仓两处优化创建表单、API helper、Server Service/Runner 只读 | `desktop_optimization_v3_boundary` / 主仓共享工作区 | needs_split | 两表单实际构造 V2 RunConfig，V3 创建 Schema 严格要求价格协议；Server 优化 Runner 又把配置按 V2 投给严格 V2 Backtest 创建入口。类型断言或虚构 V3 默认值均不能形成可运行闭环。待 S07 预检、S08/S09 创建与执行接线后再实施 V3 表单，或单独贯通显式 V2 兼容路径；Desktop typecheck 当前两处失败 |

共享资源约束：B01-a 与 B02-a 可并行编辑不同文件，但只运行定向测试；Domain typecheck/build 由协调者在两者结束后串行执行。C03-a 的 Schema 构建输出与这两项不共享。所有子代理禁止 broad Git 操作、提交、重置或清理；需要增加未列路径时先返回 `needs_split`。协调者在各代理交付后记录改动路径、检查结果及阻塞，再安排依赖任务；最终统一审查和真实门禁独立执行。

## 2. 里程碑、前置盘点与 G0

| 里程碑 | 交付条件 | 独立状态 |
| --- | --- | --- |
| M1 | HiThink ETF qfq、股票 none/qfq/hfq；路由、归一化回测、预检、回放、AI 接口与真实 AI 门禁、独立计算对照及 UI | 实施中；受控来源的 Reader→普通 Run→独立 Worker→重放已有本地/隔离环境证据；G0-H、D01-runtime、G-Deploy、G-Run、G-UI 与 G-AI 仍开放，首个真实普通回测未通过 |
| M2 | 目标 ETF raw/hfq 真实路径、兼容独立备用、分红/拆分能力及原始路径回归；逐单元保留接入义务 | 已有多项合同、适配与受控接线的局部证据；真实 raw/hfq、独立备用及事件准入和目标验收仍开放，逐项状态见 §9 与 §12 |
| M3 | 有限能力目录中的现有消费者接入；每个登记单元具有真实准入或明确待验证状态 | P02 已固定目录并有局部适配实施；逐叶准入、消费者与真实来源状态见 §10、§12 和 DSA 能力目录，不据登记完成推断能力就绪 |

分别维护“契约完成、实现测试通过、真实来源就绪、目标普通回测成功、AI 全链路成功”：前两项已有局部证据，整体仍未收口；后三项尚未通过。M1 普通回测成功可以独立记录，AI 失败既不能抹去该证据，也不能因此勾选 AI 门禁。

### 首个可交付回测优先路径（2026-09-28）

本路径按 Spec §1、§9、§12.2 的首个交付组织执行：用户在现有界面选择 HiThink `159516.SZ` 的 ETF 前复权日线，在 `2026-05-16..2026-08-09` 及策略所需预热范围内，完成一次归一化单位记账、固定供应商快照研究协议的普通回测，并取得明确假设、交易明细和离线重放。优先使用不依赖事件信号的已支持策略；若实际策略依赖事件信号，仍按 Spec 验证相应事实和历史可见性。目标窗口包含 7 月拆分，不能以“无事件窗口”豁免拆分核对，也不能对已复权价格重复调整份额或现金。本表仅确定执行优先级和阶段证据，任务状态、验收标准及失败预算仍由原任务与证据记录所有，不新增第二套门禁。

| 顺序 | 责任任务与最小交付证据 | 当前事实与下一动作 | 停止条件 |
| --- | --- | --- | --- |
| 1. 目标数据 | `G0-H-target`、`D01`：目标与预热区间的账号权限、精确 qfq 口径、完整交易日/多窗口一致性、来源与价格坐标；核对目标拆分事实及适用记账语义 | 目标及预热 68 日逐日覆盖、量额单位独立对账及精确准入已通过；真实目标按五年分窗规则为单窗口。供应商算法和历史修订仍未知，限固定供应商快照归一化研究；严格 PIT 资格未签发 | 凭据、准入、覆盖、口径或必要事件依据不足时保持不可用，不换标的、口径或 fixture 宣称目标就绪 |
| 2. 当前源码闭环 | `S07`、`S08`、`S09`、`I01`：本次配置的预检、冻结、正式创建、持久终态、查询及离线重放；原始响应和价格协议不被写读改变 | 受控 DSA HTTP、隔离 PostgreSQL/Redis、独立 Worker 已有闭环证据；按本次真实配置核对未闭父项和证据适用输入，只修直接阻断路径的精确缺口，已通过且输入未变的高成本检查复用 | 预检不 ready、冻结事实不一致、结果不可读或重放不一致时停止目标运行，不用局部测试勾选父项 |
| 3. 目标运行态 | `D01-runtime`、`G-Deploy-159516`：官方 infra 更新入口后的 Server/Worker/DSA 版本、数据库结构、目标策略与准入一致 | 官方 `update.sh all` 完整更新后 Server/Worker/DSA 新镜像健康且源码摘要一致，BIGINT 结构 head、Catalog 与精确路由有效；真实单窗口读取、冻结、重放与同版本受控多窗口验证分别记录 | 必要源码/包级门禁失败、目标版本或结构不一致、策略未准入时不发起正向产品验收；不绕过官方更新入口 |
| 4. 真实普通回测 | `G-Run`：正式 API 创建、独立 Worker 成功、真实响应指纹、Run/Snapshot、结果/交易明细、同一冻结输入离线重放及拆分不重复调整 | 普通 draft v2 的新版本 Run 成功；Snapshot 和业务结果均 complete，11 笔交易、22 次成交、基准可用；旧/新 Runner 各自离线重放校验一致 | 无真实成功终态、交易明细或重放一致性时保持 `G-Run` 未通过，不以受控闭环代替 |
| 5. 用户路径 | `G-UI-159516` 与所需的 `U01`–`U05` 行为：现有界面选择来源/口径、预检、创建、查看实际来源与历史性质、交易及重放信息；同环境直接请求验证非法配置拒绝 | 目标 Web 预检、创建完整结果 Run、来源/研究性质/交易/基准展示均通过；失败 v1 保留、取消不新增任务、篡改准备配置 HTTP 409 且不落库 | 界面只显示模拟结果、保存/取消或失败状态不实、服务端可绕过拒绝时不宣称首个交付完成 |

执行顺序先核对第 2 步已有证据是否适用于本次配置，并处理第 1 步的真实来源阻断；第 2 步必要检查满足后才推进第 3 步目标更新。可独立验证的窄叶继续实施，但不以增加无关来源能力替代目标门禁。第 4 步通过后立即记录普通回测里程碑，再执行第 5 步。首个交付仅在 `G-Run` 与 `G-UI-159516` 对同一真实 Run 均有适当证据后记录为通过；完整 `G0-H`、`G-Deploy`、`G-UI`、M1、AI、M2/M3、严格 PIT 正向资格及 AC01–AC20 总验收仍按原任务开放。固定快照研究必须如实披露，缺历史资格的严格 PIT 请求继续失败关闭。

2026-09-28 首个交付里程碑：同一[界面创建的完整结果 Run](evidence/2026-09-28-cont-159516-versioned-benchmark.md) `e2195b91-4cff-4dc5-9db2-0df01cf43d83` 已满足 `G-Run` 与 `G-UI-159516`，目标四叶完成。旧 Runner 的 partial 历史结果保持可重放，新版本的 Snapshot 与业务结果均 complete；其余父项及 AC 总验收仍开放。

规划预检结论：本次仅调整 Task 的执行顺序与目标验收所有权，Spec 合同和 AC 不变。来源资格、目标运行态、业务 Run、用户交互分别由独立门禁负责，新增依赖无环；顺序与责任已就绪，真实目标执行仍因 `G0-H-target` 证据缺口和 DSA 完整门禁失败而阻塞。本文档调整不构成新的来源、部署或产品验收证据。

- [x] P01：核实三仓接缝与实施入口。
  - 支持：Spec §2、§10、§13，AC15；依赖：无。
  - 范围：只读 K-Contract/K-Domain/K-Market/K-Run/K-AI/K-DSA/K-Infra，写本 Task 的入口及边界记录。
  - 产出：标明真实路由持久化、manifest、版本握手、迁移/raw-owned inventory、runtime 打包、队列状态机和 UI 入口；记录三仓基线、脏文件及可用测试命令，给后续任务固定窄写入路径。
  - 验证/停止：逐一确认入口存在及职责，不推断当前实现已符合 Spec；发现契约冲突先记录问题和受影响任务。
  - 执行记录（2026-09-25）：主仓工作区已有 AI Provider、图表、风险和相关 Spec/Task 的未提交改动，本主题 Spec/Task 为未跟踪文件；DSA 与 infra 工作区当时为干净状态。未修改既有脏文件。主仓路由以 `apps/server/src/market/market-control.service.ts` 管理，`DesiredProviderPolicy`/Revision 的 `routes` JSON 保存在 `apps/server/prisma/schema.prisma`；Reader 在 `market-bar-reader.ts` 消费 Effective Policy。DSA 的 manifest 与控制状态在 `src/services/thesis_ledger_control.py`，精确来源访问在 `src/services/thesis_ledger_provider_runtime.py`，API 与 handshake 在 `api/thesis_ledger.py`；主仓消费入口为 `apps/server/src/integration/dsa/dsa.client.ts`。快照版本与冻结入口分别为 `apps/server/src/backtest/backtest-snapshot.ts`、`backtest-snapshot-builder.ts`；队列状态由 PostgreSQL `BacktestJob` 与 `backtest-queue.service.ts`/`backtest-queue.reconciler.ts` 管理。Desktop 路由入口为 `apps/desktop/src/features/market-data/MarketPolicyPanel.tsx`，回测表单为 `strategy/BacktestSetupDialog.tsx`；AI 入口为 `apps/server/src/strategy-optimization/`。结构入口为 `apps/server/prisma/schema.prisma`、`raw-owned-tables.json` 和按目录排序的 migrations；`scripts/check-migration-matrix.mjs` 与 `scripts/check-runtime-database-input.mjs` 是矩阵和打包门禁。infra 的 `compatibility.json`、`scripts/check-compatibility.mjs`、`sync-code.sh`、`update.sh` 是版本及部署入口。
  - 验证与边界：上述路径、职责及三仓 `git status --short` 已逐项只读核对；主仓 `packages/schemas`、`packages/domain`、Server、Desktop 均有 `vitest`/`typecheck` 脚本。DSA 的系统 `python` 缺少 pytest，但现有 `.venv/bin/python -m pytest --version` 返回 pytest 9.1.1；后续定向入口为 `rtk proxy .venv/bin/python -m pytest tests/test_thesis_ledger_contract.py -q`，并有 `./scripts/ci_gate.sh`。本任务没有运行 DSA 产品测试、DB、Provider 或部署。C01–C04 的窄写入先限 `packages/schemas/src/` 的价格/路由/回测契约及其测试、DSA 控制契约/测试、主仓 DSA 消费边界；S02 单独拥有 Prisma/migration/打包门禁。具体文件仍按各叶子实际入口确认。
  - 已发现接缝：infra `compatibility.json` 和检查脚本目前固定 Control/Data Contract V1，DSA `api/thesis_ledger.py` 已有 V2 handshake、V2 bars 与 V2 policy，主仓 Reader/Schema 已用 V2。C04/F01 须确定并验证相容版本组合后再发布；不能从源码含 V2 推断目标容器已部署 V2。现有 `docs/thesis-ledger-contract-v1.md` 也只描述 V1，F02 须对照实际运行协议更新文档。旧 `MarketBarSeriesFact`/Coverage 唯一键未包含基准/版本，S02 必须处理覆盖风险。

- [x] P02：建立有限来源能力登记表。
  - 支持：Spec §3、§4、§14，AC20；依赖：P01。
  - 范围：DSA 能力文档为明细所有者；主仓只记录消费契约引用和本 Task 的任务归属。
  - 产出：每个“Provider × 实际上游 × 资产类型 × 能力 × 周期/口径”登记账号/权限状态、现有消费者、原生/派生性质、探针样本、实现任务与真实门禁；覆盖 §4 的全部来源和能力分组。
  - 验证/停止：未知保持未知；AKShare/EastMoney 等同源不能算独立备用。将下文 R 分组展开为每次一个来源能力或一个消费入口的叶子任务；无现有消费者、接口冲突等设计问题回填 Spec 后再启动相关实现。
  - 执行记录（2026-09-25）：DSA `docs/thesis-ledger-source-capabilities.md` 以静态源码/manifest 建立 34 条 Spec 候选、57 条 manifest 原子行、38 条 manifest 外与来源选择行；§5 将 R01–R08 拆为 116 个固定编号叶子和一个按显式 URL 物化的模板，逐叶记录来源、资产、能力、Consumer、owner、输入、输出及门禁。路径/编号/空白静态核对通过；账号准入、真实覆盖和各叶实现继续保持未知或待办，不把目录完成当成 M3 完成。

### 2.1 G0 准入门禁

G0 先于相应来源的生产集成；允许缺凭据时完成已知契约和 fixture 实现，但不得启用该来源或将真实门禁勾选。已知接口矛盾必须在相关编码前解决。所有探针仅在已有授权范围内调用，记录权限摘要而非凭据；原始响应用脱敏样本与指纹定位，不上传 Token。

- [x] G0-H：HiThink ETF 共同价格读取、真实运行与重放完成；股票/事件按扩展范围记录，见 §0.1。
  - 依赖：P01；执行所有者：DSA 接入执行者；环境：已授权 HiThink 账号与只读探针。
  - 覆盖：159516.SZ 的 2026-05-16..2026-08-09 及策略所需预热、另一只有已核实现金分红的 ETF、无事件窗口、一个股票的 none/qfq/hfq。
  - 证据：SDK/接口版本、实际请求范围、响应指纹、字段/单位、ETF `adjust:null` 的 qfq 语义、五年单次窗口与分页、重叠窗口基准、错误与权限分类；事件日期比例重新核实。
  - 通过/阻塞：明确可用范围及算法未知项；分红 endpoint 无权限不无条件阻断不依赖事件的 qfq 研究。缺账号保留待验证，不能换标的冒充目标验收。对应 AC01、AC02、AC09、AC10、AC17。
  - [x] G0-H-target：只验收首条 `159516.SZ` 前复权普通回测所需的真实目标数据，不代替本父项其他 ETF/股票样本。
    - 启动依赖：P01、已选定的现有策略版本及其指标预热范围；执行面为 HiThink 只读取数与目标能力/准入核对，沿用 D01 的精确路由和多窗口合同。
    - 完成：原始响应指纹、目标及预热完整交易日、口径/基准/单位、分页或窗口边界、账号权限和签发精确来源准入所需的事实均可核验；结合独立公告与实际价格坐标说明 7 月拆分的记账方式，缺失事实保留未知，不从当前抓取时间补造历史可见性。无事件信号的归一化运行按需检查事件，但不能遗漏或重复处理目标拆分。
    - 验证：[目标来源准入证据](evidence/2026-09-28-cont-g0-h-159516-target-admission.md)固定脱敏请求范围与指纹、独立日历/上市/拆分/单位事实；DSA 内部内容寻址证据和精确 RouteAdmission 仅覆盖该标的 68 日及预热，正式 Control V3 单一路由生效。目标 Data V3 真实读取 HTTP 200、68 Bar、`fund-unit/CNY`、前复权拆分两日数值与独立对账一致；超界请求返回 422。供应商算法与历史修订流未公开，按 Spec §5.2 只将该已验证序列用于 `normalized-series`、`fixed-provider-snapshot`，`dividendMeaning=provider-defined`；严格 PIT 和逆变换不授予资格。目标 Server/Worker 的实际配置、冻结与重放另由 `G-Deploy-159516` 验证。
    - [x] G0-H-units-scope：将上条独立单位证据实现为 DSA 的精确来源字段合同。仅在 `159516.SZ`、`2026-04-30..2026-08-09` 内、当前 HiThink ETF 历史端点和来源修订下报告 `fund-unit/CNY`；请求超界、不同标的、不同修订继续报告 `unknown`。HTTP 投影复核证据 ID 与请求身份，量额数值不转换；适配修订升至 `v3`。[实施、定向验证和目标快更](evidence/2026-09-28-cont-g0-h-159516-scoped-units.md)记录 97 项通过、官方 `sync-code.sh dsa` 后目标健康、精确路由仍拒绝；扩展套件另有 1 项与现存 HiThink Quote manifest 断言不一致的失败。此叶未签发 RouteAdmission，不放开 `G0-H-target`。
  - 阶段证据（2026-09-25，门禁未完成）：用户确认 Key 在 `~/.zshrc`；交互式 zsh 子进程只核对导出存在性，未输出值。官方 ETF 历史接口两次只读请求均 HTTP 200/业务 0，首次以 UTC 午夜传参取得 60 行，重叠 5/5 行一致且 `adjust:null`，但日期边界不代表精确目标范围。随后按 Asia/Shanghai 午夜边界对 `159516.SZ` 的 2026-05-16..08-09 单次请求取得 59 行，上海日期 05-18..08-07，与本地 `exchange_calendars 4.13.2` XSHG 的 59 个交易日逐日一致，缺口/重复/越界均 0；脱敏响应 SHA-256 为 `151c5af524b0b526fea181f63d4e8e8beccfa8c0f53a8e740586372a09a9d2f2`。[深交所 2026 休市公告](https://www.szse.cn/disclosure/notice/t20251222_618087.html)另核实该目标窗口深市也是 59 个交易日；不能据此推断 XSHG 与深市全历史等价。官方文档定义 `adjust:null` 仍为 ETF 固定前复权，价格按原始货币计；成交量/成交额数值单位仍未确认。预热及无事件窗口尚未验证，故 G0-H 保持未勾选。
  - 长窗口阶段证据（2026-09-25，门禁未完成）：按[官方场内基金历史日线接口](https://github.com/HiThink-Tech/Financial-API/blob/main/docs/api/fund/fund-market.md)对 `159516.SZ` 请求五年窗一次和重叠分段两次，均 HTTP 200/业务 0。五年窗 2021-09-25..2026-09-25 返回 769 行，上海日期 2023-07-27..2026-09-24；两分段并集同为 769 个唯一日，7 个重叠交易日全字段一致，未观察到分页字段或响应截断。三份脱敏响应 SHA-256 分别为 `411358307f622c2d51bf95324a6017417a8745adf1b20d97449232463cb1d1af`、`dd11747c5c763270191621f1e86b0d9dccf6ec53b98d80b6f0537052dda6b5a4`、`415fec13cbd04f7a870c9c0768631feeaee380feba74577147482c0e3b8f8e4e`。[深交所上市公告](https://www.szse.cn/disclosure/notice/fund/t20230724_602100.html)独立核实 `159516` 于 2023-07-27 起在深交所上市；是否有隐式行数上限仍未证实，不能把这次一致性当作全历史完整性保证。
  - 股票阶段证据（2026-09-25，门禁未完成）：对 `000001.SZ` 在相同上海日期边界分别请求 `none/forward/backward`，各 HTTP 200/业务 0、59 行、响应口径一致，三套价格序列彼此不同、重复/越界 0；响应体 SHA-256 分别为 `c3823c0d5d20f660acad97a00b3910349ee2ed8b5ccf46073e710ddf43a8ab8e`、`ae07c11fb069f01758768c8d4f7be0fb188c04ec6d79ef46df44ad0f345e4a85`、`974941840ed31319a781a6a80bfca3707f5623158a0139dac5d295ca06043a6e`。官方股票接口说明价格与成交额为 CNY、成交量为股；响应没有可核实的算法版本与复权基准。该探针环境没有独立 XSHG 日历，因此股票窗口交易日完整性待其他证据。无原始响应和 Key 输出。
  - 分红阶段证据（2026-09-25，门禁未完成）：[上交所托管的基金管理人公告](https://www.sse.com.cn/disclosure/fund/announcement/c/new/2025-06-11/510300_20250611_ZAU4.pdf)核实 `510300.SH` 于 2025-06-18 除息、登记日 06-17、发放日 06-27，税前现金 0.880 元/10 份。HiThink 官方 ETF 日线事件窗 2025-06-13..06-30 一次只读请求 HTTP 200/业务 0、12 行、`adjust:null`，响应 SHA-256 `09972bbf1a0a820c074511bf9e3cba463de6930dcfb176b028af26384316193d`；官方分红 REST endpoint 一次请求 HTTP 200/业务 0、14 条，其中一条的日期和每十份税前/税后金额与公告一致，响应 SHA-256 `c12b43153a3227269203eec002d5d4b067b7d615d595ca748d3b2039a6f479bf`。此证据证明样本接口可访问和事件字段匹配，不证明事件历史覆盖完整、DSA 归一化或回测接入。2025-07 的公开无事件对照窗口另见下条；预热、接口隐式上限和其余门禁仍未完成。
  - 无事件窗口核查（2026-09-28，来源完整性未完成）：[一手资料与只读探针对账](evidence/2026-09-28-cont-g0-h-510300-no-event-window.md)结合上交所托管的基金 2025 年年度报告与 6 月分红公告，确认全年每 10 份分红 `0.8800` 元全部对应 6 月事件、全年基金拆分变动份额为无；年报重大事件表中 7 月只有关联交易公告。HiThink 分红端点当前返回 14 条，7 月除息日 0 条，但 `historyComplete=false`，不是精确窗口完整空集证明；`G0-H` 父项仍开放。

- [x] G0-M：固定 M2 各来源的独立准入包。
  - 依赖：P02；执行所有者：DSA 接入执行者；范围：只建立逐单元探针任务与证据入口。
  - 产出：为 AKShare/EastMoney、Tushare、TdxAiData、RQData 及登记的现有上游分别创建 G0-M 子门禁，列出样本、权限、覆盖、单位、窗口基准、事件时间及错误断言；每个子门禁单独执行和记录。
  - 完成边界：本任务只证明准入计划完整，不证明来源就绪；M2 真实验收依赖被选路径的子门禁通过。通达信 SDK/架构条件在业务集成前核实，不能用“支持 Linux”替代当前镜像验证。
  - 执行记录（2026-09-25）：DSA `docs/thesis-ledger-m2-source-gates.md` 建立 25 个独立计划入口，覆盖 M21–M30 的来源、资产与能力，列出固定样本、权限、覆盖、量价/货币单位、窗口基准、事件生效与可见时间、错误分类、通过/阻塞及证据模板；TdxAiData 镜像/架构单独设门禁。同源包装不算独立备用；门禁 ID/表格列数/空白静态核对通过，未实际请求 M2 Provider，各子门禁保留待执行。

- [ ] G0-R：**扩展/当前跳过**。核实辅助来源的启用前提。
  - 依赖：P02；执行所有者：DSA 接入执行者；范围：a-stock-data 可复用实现的版本/来源审查、free-stockdb 镜像位置/许可/可访问性、问财等底层接口身份。
  - 产出/验证：每个候选记录采用、不可用或明确待验证及依据；free-stockdb 未提供可信镜像时不开放。第三方 SDK 不登记成官方 HiThink，自然语言答案不登记成行情事实。
  - 停止边界：本任务不下载未知数据集、不安装全部 SDK，也不采购授权；需要实现的单元进入对应 R 子任务。
  - 2026-09-29 只读进展：[固定版辅助来源审查](evidence/2026-09-29-cont-g0-r-auxiliary-source-audit.md)锁定 `a-stock-data v3.10.0` 提交、代码许可和腾讯/通达信/巨潮实际 endpoint；R07.14 腾讯报价与现有 Consumer 同源，选择不新增 Provider；通达信盘后包缺现存 Consumer，巨潮公告与既有 AKShare 链同源且缺精确发布时间。问财仅第三方代码声称服务与鉴权，官方合同未核；free-stockdb 不内置镜像地址，R08.1 unavailable。真实数据条款、响应、单位/时点和目标准入均未通过，本门禁仍开放。

## 3. M1：状态与契约阶段

以下任务先定义稳定格式及失败语义，之后才允许依赖契约的实现启动。契约不要求所有 Provider 同时部署。共享文件有重叠时串行修改。

- [x] C01：冻结价格、数量、时间协议。
  - 覆盖：Spec §5–§6，AC07、AC12、AC13；依赖：P01。
  - 写入：K-Contract 的价格/执行模型 schema 及契约测试。
  - 完成：none/qfq/hfq、记账方式、历史性质、基准/方法/修订/观测时间、量价与分红语义分别表达；未知不猜测；DSA 事实与 Server 解析的 quantityBasis 分属不同边界。
  - 验证：V-Schema 的合法组合、非法单位、严格 PIT 不降级、未知基准及固定快照案例；输出可供生产者和消费者共用的 fixtures。
  - 执行记录（2026-09-25）：新增 `packages/schemas/src/market-price-protocol.ts`，区分 DSA 来源价格事实与 Server 已解析的执行价格协议；显式表示口径、方法/版本、基准/锚点、修订来源、观测时间、量价及分红语义、数量单位、记账方式和历史性质。未知锚点保留 `null`，只有具证据的转换才可声明可用；严格时点必须携带重建依据。`packages/schemas/fixtures/execution-price.*.json` 提供原始记账与固定复权快照共享样本。
  - 验证：`rtk pnpm --filter @thesis-ledger/schemas exec vitest run test/market-price-protocol.test.ts` 通过（5/5）；`rtk proxy pnpm --filter @thesis-ledger/schemas typecheck`、`test`（24 文件、214 测试）和 `build` 通过，测试输入为当前未提交工作区中的上述 Schema、fixtures 和测试。这里仅证明本地契约；DSA 生产者、Server 消费者、真实来源和运行态仍由 C04、后续实现及真实门禁验证。

- [x] C02：冻结按能力与口径匹配的路由契约。
  - 覆盖：Spec §4、§7，AC01、AC02、AC11、AC19；依赖：P01、C01。
  - 写入：K-Contract 的 market-route schema 及测试。
  - 完成：精确 RouteTarget、一个主源最多一个备用、非价格能力无 adjustment、Desired/Effective revision 和未适配/未鉴权/额度/覆盖/故障分类明确。
  - 验证：V-Schema；拒绝第三备用、伪支持口径及缺实际目标的策略；提供同一份序列化 fixtures。
  - 执行记录（2026-09-25）：新增 `packages/schemas/src/market-route-v3.ts` 和 `fixtures/market-route-v3.etf-qfq.json`。V3 路由键显式包含市场、资产、能力、周期与价格口径；非价格能力禁止附带复权，目标仍由 `providerId + upstreamSource` 精确标识，每条主源加备用最多两个。Desired/Effective 分别携带修订和生效状态；以精确能力目录校验未适配、伪支持口径、缺凭据及额度。旧 V2 格式保持独立，C04 负责跨仓解析及版本握手，S04 负责真实完整窗口与基准兼容。
  - 验证：`rtk pnpm --filter @thesis-ledger/schemas exec vitest run test/market-route-v3.test.ts test/market-price-protocol.test.ts` 通过（10/10）；`rtk proxy pnpm --filter @thesis-ledger/schemas typecheck`、`test`（25 文件、219 测试）及 `build` 通过。新增源码/测试的定向 ESLint、`node scripts/check-boundaries.mjs`、`node scripts/check-workspace-dependencies.mjs`、`git diff --check` 均通过，输入为当前未提交工作区的 Schema、fixtures 和测试。未执行 DSA、Server、数据库、实际来源或 UI 验收；这些仍属后续任务和门禁。

- [x] C03：冻结新运行/快照格式与旧版本解码规则。
  - 2026-09-27 收口：完整 Schema 330 项与 V3 创建/冻结重试 18 项通过，写入链按显式 V3 写新格式，旧 raw 请求保留 §13 兼容语义；官方同步 Server/Worker 成功，两容器实际加载器拒绝未来版本且产物摘要一致。详细证据见下述记录。本项仅关闭契约格式与解码义务，不关闭 S09/I01 或真实来源门禁。
  - 2026-09-27 续核：[快照版本证据](evidence/2026-09-27-c03-snapshot-contract.md)记录 Schema 15 项和实际重放 12 项通过；发现并修复旧 Store 加载未知版本未拒绝的遗漏，新增文件级边界回归，相关 20 项、类型与 lint 通过。目标尚未同步，新运行写入链及完整 V-Schema 对账待完成，父项保持开放。
  - 覆盖：Spec §11、§13，AC12–AC15；依赖：C01、C02。
  - 写入：K-Contract 的 backtest/strategy-optimization schema 及旧快照 fixture 测试。
  - 完成：在现有版本机制明确递增；价格协议、比较指纹、来源和历史语义进入冻结格式；新运行只写新格式，旧快照按旧引擎语义解码，历史 adjusted=true 不猜成 qfq。
  - 验证：V-Schema；新旧格式、未知版本拒绝、旧 raw 默认、新版本缺字段及 sealed 数据边界。

- [x] C04：落实 DSA wire/handshake 的跨仓一致性。
  - 2026-09-27 收口：C03 前置项通过，补跑 DSA 旧契约/Control、事件与目标 pin 70 项通过，结合未变的 DSA 36 项、消费侧 13 项和完整 Schema 330 项完成 wire 范围对账。具体断言与限制见下述证据；未据此关闭 Provider、部署或纵向运行门禁。
  - 2026-09-27 续核：[跨仓契约证据](evidence/2026-09-27-c04-wire-contract.md)记录消费侧 13、Schema 42、DSA 36 项通过；修复目录测试遗漏未准入 SPLIT_EVENT 的完整列表预期，未弱化断言或修改生产代码。旧版本和安全错误边界已有本地证据；C03 前置项仍开放，继续核验其冻结/解码与封存条件后再判断父项完成。
  - 覆盖：Spec §10、§13，AC01、AC02、AC11、AC15；依赖：C01、C02、C03。
  - 写入：DSA 对应消费契约实现/测试与主仓 DSA 消费边界；按 P01 固定的共享 fixture 核对，主仓协调者维护共享契约。
  - 完成：两端解析同一格式、版本和错误；不兼容版本保留旧可用功能并拒绝新能力，DSA 不选择回测记账方式。
  - 验证：V-DSA 与消费侧契约测试，含旧 strict schema 拒绝和新版本 handshake；此任务只交付 wire 一致性，不包含 Provider 或部署。

## 4. M1：数据执行面

- [x] D01：HiThink ETF qfq 基础适配器完成；已有多窗口合同与回归保留，真实基础路径见本轮验收。
  - 2026-09-27 补验：[适配与路由核对](evidence/2026-09-27-d01-d03-adapter-audit.md)记录 D01–D03 相关 134 项本地测试通过；跨窗口冲突及完整目标隔离仍待核对，真实 G0-H 不由 fixture 替代。
  - 2026-09-28 当前源码核对：单次 ETF 请求限五个日历年；生产 V3 API 已接入受预算约束的多窗口采集与重叠比对，Server 已接协议读取及本地文件冻结重放。局部状态和数据库/目标剩余条件见下文与[对账证据](evidence/2026-09-28-cont-d01-window-verification.md)；单窗口覆盖测试不替代真实跨窗来源验收。
  - [x] D01-window-contract：先明确多窗口观测的输入和输出合同。重叠必须包含真实交易日；保留每窗请求范围、响应指纹、观测时间和原始口径事实；重叠一致只证明已观测交集，不提升未知上游方法版本或锚点，不把窗口局部性质改为全局序列。
    - 2026-09-27：Spec §8.3、两端完整非递归观测合同、跨语言指纹与父子时间边界已建立；最新 Schema 14 项、Python 组合/API 14 项及 Server 消费/冻结重放 13 项通过。证据见适配与路由核对；仅关闭合同定义，不关闭下述数据库和真实运行门禁。
  - [x] D01-window-execution：在 HiThink 适配边界加入受预算约束的多窗口采集与比较，并接入实际调用方；窗口分割、重叠范围和总调用上限必须可验证，任何子窗失败、无有效交集或 OHLC 冲突均拒绝生成合并成功结果；不新增隐藏重试或绕过准入。
  - [x] D01-window-verification：验证一致交集、价格冲突、不同单位/口径、无交易日交集、缺页、子窗失败和跨五年边界；保留完整观测证据后再验证 wire、冻结与离线重放。真实来源仍受 G0-H 和既有重试预算约束。
  - 当前接入拆分（2026-09-27）：
    - [x] D01-wire：依据 Spec §8.3 定义非递归 `windowObservations`，复用单窗口响应校验；校验父子身份、窗口并集、全部交集和最终 Bars，明确协议能力及适配修订。不在分页页数中夹带子窗口事实。
    - [x] D01-execution：DSA 将已实现采集器接入受准入和总预算约束的实际读取入口；生成完整子响应及父响应，保留未知方法和窗口作用域，计算覆盖全部观测的指纹。
    - [x] D01-consumption：Server 能力读取、协议解析与本地文件冻结已由既有定向测试覆盖；新增[隔离 PostgreSQL 到 Snapshot 证据闭环](evidence/2026-09-28-cont-d01-pg-consumption.md)证明父响应与两份子观测经真实仓库回读后原样进入 artifact、离线重放，改写子观测后数据库读取拒绝，旧单窗口相邻回归通过。此勾选仅表示受控 fixture 的本地/隔离数据库消费，不替代 D01-runtime 或真实 HiThink 准入。
    - [x] D01-runtime：受控 HTTP、隔离冻结/重放及独立 Worker 纵向链已有[本地证据](evidence/2026-09-28-cont-d01-controlled-http-worker.md)；官方更新后的目标 V3 协议 smoke、DSA 多窗口/运行时源码及 Server/Worker Reader/Snapshot/Runner 编译产物均与当前已验证输入一致，且精确 HiThink 路由仍 `not_admitted`，见[目标运行态核对](evidence/2026-09-28-cont-d01-target-runtime.md)。本项只关闭目标运行代码一致性，不替代 `G0-H-target` 或 `G-Deploy-159516` 的真实正向读取/冻结/重放门禁。
  - 2026-09-28 局部状态对账：[D01 多窗口证据](evidence/2026-09-28-cont-d01-window-verification.md)核对生产 V3 API、预算/准入读取、全部交集组合、协议能力、父子指纹与 Server 本地文件冻结重放；补单位/口径及实际无交集拒绝反例。此前 DSA 多窗口 20 项、准入 14 项、Schemas 14 项、Server 9 项通过；I01 JSONB 修复后新增[数据库消费证据](evidence/2026-09-28-cont-d01-pg-consumption.md)，关闭受控 D01-consumption。随后[目标运行态核对](evidence/2026-09-28-cont-d01-target-runtime.md)确认官方更新后的 V3 协议及 DSA/Server/Worker 关键运行代码与已验证输入一致，因此 `D01-runtime` 已收口；G0-H、真实目标正向读取、单位/价格基准与父 D01 继续开放，不重置真实请求预算。
  - 覆盖：Spec §4、§8，AC01、AC09、AC10；依赖：C04；真实启用依赖 G0-H。
  - 写入：K-DSA 的 ETF 历史适配器、manifest 对应单元及测试。
  - 完成：adjust:null 标为 qfq；none/hfq 拒绝；完整窗口/分页、重叠一致性、单位与观测版本保留；未公开公式用 provider-defined 表达。
  - 验证：V-DSA，覆盖缺页、重复日期、非法价格、多窗口一致/冲突及请求失败；fixture 不作为账号就绪证明。

- [x] D02：HiThink 股票三口径适配器。
  - 2026-09-27 收口：[适配与路由核对](evidence/2026-09-27-d01-d03-adapter-audit.md)记录三口径及分页修复相关 87 项、准入相关 22 项测试通过；官方 DSA 同步和容器内分页拒绝探针通过。仅收口适配器实现，真实启用仍受 G0-H 约束。
  - 覆盖：Spec §4，AC02、AC09；依赖：C04；真实启用依赖 G0-H。
  - 写入：K-DSA 的股票历史适配器、对应 manifest 及测试。
  - 完成：none/forward/backward 精确映射 none/qfq/hfq，价格和单位不串口径，不复用 ETF 固定口径假设。
  - 验证：V-DSA，三口径请求/响应、未知标签、权限/额度与缺页分类。

- [x] D03：DSA 精确策略应用与目标隔离。
  - 2026-09-27 收口：[适配与路由核对](evidence/2026-09-27-d01-d03-adapter-audit.md)补齐可重试错误的主备 pin、真实来源熔断/健康隔离与重建保持、第三目标拒绝及适配器内部调用边界。目标/准入四文件 45 项和精确适配/熔断三文件 29 项通过；数量约束此前已通过官方同步及容器探针。仅关闭本地精确路由实现范围，真实来源准入和 I01 联通仍独立开放。
  - 2026-09-27 补验：[适配与路由核对](evidence/2026-09-27-d01-d03-adapter-audit.md)新增 4 项共用执行面回归，确认来源熔断、健康更新及运行时重建后的隔离；完整 V3 准入链与限流预算尚未据此收口。
  - 覆盖：Spec §7–§8，AC11、AC19；依赖：C04。
  - 写入：K-DSA 的策略解析/Effective Policy/目标执行及定向测试。
  - 完成：按新维度应用策略；只调用指定主备，无隐藏源切换，健康/限流/熔断按真实目标隔离，返回实际命中与 revision。
  - 验证：V-DSA；不支持口径拒绝、未应用策略、同 Provider 不同 upstreamSource 隔离、不得遍历第三源。

- [x] S01：Server 路由配置持久化。
  - 2026-09-27 收口：[路由持久化证据](evidence/2026-09-27-s01-policy-persistence.md)记录 19 项服务测试及源码事务/读回核对，C02/C04 和 S02 前置已完成。验证范围为服务端受控测试，不代替真实数据库并发或目标 UI 验收。
  - 覆盖：Spec §7，AC02、AC11、AC19；依赖：C02、C04。
  - 写入：P01 定位的 providers/路由持久化与 API、必要定向测试；若需 SQL 字段，结构交付由 S02 统一负责。
  - 完成：各口径独立保存主备；服务端校验能力与账号状态；Desired/Effective 未一致时明确显示状态；旧 raw 配置和用户选择不被覆盖。
  - 验证：V-Server，含并发 revision、非法直接提交、禁用原因、保存后读回和策略未应用；如依赖新增结构，验收依赖 S02。

- [x] S02：复权序列身份的最小保留数据迁移。
  - 覆盖：Spec §8.3、§13，AC02、AC10、AC15；依赖：P01、C01、C02。
  - 写入：`apps/server/prisma/schema.prisma`、一条新增 migration、raw-owned inventory/迁移矩阵/runtime 打包检查及相关测试。
  - 完成：选择并记录最小版本字段或序列关系方案；旧事实不丢失、不同基准不能覆盖；若 S01 需要结构变更同时固定其存储契约。不改历史 migration，不清库。
  - 验证：Schema diff 只含必要变动；用一次性占位 DATABASE_URL 静态 validate；V-DB 验证全量 SQL、表/权限/自动派生 head、旧数据与新唯一性；消费者写入实现归 S03。
  - 执行记录（2026-09-25）：`schema.prisma` 两张行情序列表新增必填 `seriesVersion` 并纳入复合唯一键；新增 `20260925100000_market_bar_series_identity_v1` migration 在事务内把旧行回填为 `legacy`、设非空、重建唯一索引，无默认值，不修改历史 migration/raw-owned 清单。`database-structure.test.ts` 更新 head/数量及迁移 SQL 断言；Schema diff 仅含这两张表所需变化。新值由 S03 显式写入，S01 继续使用现有路由 JSON 结构。
  - 验证：占位 `DATABASE_URL` 的 `prisma validate`、`rtk pnpm migration:matrix`（16 迁移、66 SQL 表、59 Prisma model、7 raw-owned）、runtime 输入检查、结构定向 10 测试通过。隔离 `postgres:17-alpine` 全量建库脚本 7 项断言通过；另一隔离库从前 15 条 migration 建旧行后应用新 migration，验证 Fact/Coverage 的 ID/值保留、`legacy` 回填、版本区分共存与重复完整键冲突、索引定义和 app role 表/序列权限。临时容器已确认并销毁。目标开发数据库、Docker 应用服务和正式保留数据发布流程均未执行；S03 仍须更新消费者 selector 与显式版本写入。

- [x] S03：版本隔离的行情缓存读写。
  - 2026-09-28 收口：[父项对账证据](evidence/2026-09-28-cont-s03-parent-reconciliation.md)将原 I01 完整响应 JSONB 位模式卡点的修复与版本事实/日期覆盖缓存合同合并核对。当前定向 36 passed、默认 10 skipped；隔离 PostgreSQL 全 19 migration/68 表、独立应用角色实际 10 passed，临时容器清理。仅关闭 S03 本地和隔离数据库义务；S04/S05 的来源与 PIT 条件、当前目标源码及全局验收不随之关闭。
  - [x] S03-date-cache：独立事实覆盖判定已接入实际 repository，只有已登记完整交易日、本地日终相等及实际完整末 Bar 一致时接受日期末端；保持原事实/覆盖时间和精确窗口。新增 17 项本地及 4 项 PostgreSQL 场景，相关 134 项、独立应用角色数据库 10 项通过；类型/构建/门禁通过，官方同步后两端各 14 个生产 repository/Reader 受控场景、两份摘要一致且 healthy。Reader 减少 5 行，见 [日期缓存证据](evidence/2026-09-27-s03-date-cache.md)。不关闭 I01 完整响应往返或父项。
  - [x] S03-pg-facts：独立 PostgreSQL 应用全部 19 份 migration 后，真实 Prisma/事实缓存 4 项通过：版本共存、来源隔离、裁剪不改基准、legacy 回读和不相交窗口不扩大覆盖。另 13 项身份/Reader 回归、类型检查/lint 通过；临时容器已清理。V3 完整响应往返的 I01 阻塞保持跳过，不关闭父项，见 [隔离缓存证据](evidence/2026-09-27-s03-cache-postgres.md)。
  - 当前隔离验证叶：实际 Prisma/PostgreSQL 验证同日期多基准/修订共存、来源隔离、limit 视图不改变原始价格及版本、legacy 回读和不相交窗口不扩大覆盖。临时数据库独立名称/容器标签/localhost 端口；应用完整 migration 链，测试后清理本轮容器，不访问目标业务库。V3 完整 JSON 响应往返的 I01 卡点保持原跳过状态，本叶不重试或替代该门禁。
  - 覆盖：Spec §8.3，AC02、AC09、AC10；依赖：S02。
  - 写入：K-Market 的事实 repository/coverage 及测试。
  - 完成：价格口径、方法、基准/窗口、修订和来源共同识别序列；本地观测版本不冒充上游版本；覆盖不足、空、超时、缺页、未知覆盖不合并成成功。
  - 验证：V-Server 与隔离 DB 读写测试；同日期不同基准共存、limit 裁剪不重定基、旧事实读取、不同来源不串数据。

- [x] S04：Reader 的整窗口主备选择。
  - 2026-09-28 收口：[父项对账证据](evidence/2026-09-28-cont-s04-parent-reconciliation.md)确认 S03/C04 前置已完成，当前 Selector/Reader/委派/旧边界 28 项通过；仅有显式同口径证明才请求完整备用窗口，缺页、无证明、错目标、预热不足及第三源边界保持拒绝。I01/D01 受控 HTTP/数据库/Worker 覆盖实际主源 Reader 路径；真实 HiThink、备用准入、目标部署及 S05 PIT 分别开放。
  - 2026-09-27 补验：Reader/selector/冻结窗口及委派共 27 项通过，见 [S06 及 Reader 补验记录](evidence/2026-09-27-s06-dependency-plan.md)；S03 隔离数据库前置未关闭，不以夹具测试关闭本项。
  - 覆盖：Spec §8.1，AC09–AC11；依赖：S03、C04。
  - 写入：K-Market 的 Reader/窗口选择及测试。
  - 完成：按能力、覆盖、算法/基准兼容选择一个完整窗口，拒绝逐 Bar 混源和未经证明的跨源替换；provenance 指向实际目标。
  - 验证：V-Server；主源缺窗、兼容备用、不兼容备用、窗口重叠冲突、上市前/预热不足及没有第三源请求；DSA 真实联通由 I01 验证。

- [ ] S05：**扩展/当前跳过**。Reader 区分固定快照研究与严格 PIT。
  - [x] S05-v3-preflight：实际 V3 执行窗口预检统一拒绝晚于 `dataAsOf` 的来源观察、Bar 时间及逐 Bar 可用时间；原始响应不改写。严格 PIT 身份/供应商修订/锚点继续受限。26 项定向、相关 87 项、类型/构建/lint/边界通过，官方同步后两端各 10 个生产入口受控场景与两份摘要通过；预检文件减少 71 行。见 [历史预检证据](evidence/2026-09-27-s05-history-preflight.md)。
  - [ ] S05-reconstruction：**扩展/当前跳过**。明确实际重建证据所有权和严格内容合同；读取并绑定来源、序列版本、窗口、修订及历史可见性，贯通预检/冻结。当前非空引用不等于已核验重建证据；受控时间/身份正向测试不得关闭本叶。
    - [x] S05-reconstruction-contract：共享严格清单合同绑定精确输入、来源价格事实与逐 Bar 不可变窗口/响应摘要，拒绝自报抓取时刻或内联行情；只输出引用绑定结果，不声明 PIT 已核验。新增 28 项定向包含于全包 41 文件/395 项，Schemas 类型/构建、Server 类型、定向 lint、边界/依赖与 diff check 通过；13 项既有无基线尺寸警告保留。见 [合同证据](evidence/2026-09-27-s05-reconstruction-contract.md)。实际归档/时点和生产接线继续开放。
    - [ ] S05-reconstruction-market：**扩展/当前跳过**。Market 从可信只读清单读取原文，并解析实际不可变窗口；核对原响应摘要、来源/版本/坐标、逐 Bar 原值及抓取/观察可见时间，缺失或不一致失败关闭。`findFrozen` 的 I01 JSONB 位模式失配已修复并经隔离 PostgreSQL 与受控 Worker 闭环验证，见[修复证据](evidence/2026-09-28-cont-i01-jsonb-orm-fix.md)；受控归档仍不构成真实历史可见性证明，历史来源门禁继续开放。
      - [x] S05-reconstruction-market-content：只读文件以配置摘要绑定原文，实际 `findFrozen` 读取归档，重新核对摘要、来源/序列身份/价格坐标、逐 Bar 完整内容及冻结截点。去重读取并保留原文和完整归档，只输出 `archives-bound`；40 项新增包含于相关 104 项，类型/构建/lint/边界/依赖通过，编译模块注册与注入元数据通过。13 项既有无基线尺寸警告保留；没有实际 PostgreSQL、目标容器或 Provider 验收，生产 PIT 资格/消费仍开放，见 [内容证据](evidence/2026-09-27-s05-reconstruction-content.md)。
      - [ ] S05-reconstruction-market-time：**扩展/当前跳过**。分别验证每根 Bar 所用修订在历史决策时点的可见性，区分来源观察与 Server 抓取时钟；供应商历史版本证据与实际同期归档须有可执行依据，研究时冻结不能补造历史时间。通过后才允许返回可用于严格 PIT 的已核验结果。
        - [x] S05-reconstruction-source-times：实际内容绑定之后，逐归档核对行情/可见事实不晚于来源观察、抓取不早于观察，再核对逐 Bar 所用观察不晚于决策可见时间；不修改原始时间，只输出必要条件已绑定。新增 12 项，包含于相关 214 项；目标两端各 6 个受控时钟场景通过，迟观察和未来事实拒绝，晚 10 毫秒传输抓取保留。最终历史窗口仍开放，见 [预检与冻结门禁证据](evidence/2026-09-28-s05-reconstruction-guards.md)。
        - [ ] S05-reconstruction-decision-window：**扩展/当前跳过**。以独立历史日历/来源版本证据绑定原始历史决策窗口；研究时可见的旧 Bar 不能依靠当前 availableAt 取得历史资格。保留供应商历史版本 API 与真实同期归档的来源准入义务。
    - [ ] S05-reconstruction-consumers：**扩展/当前跳过**。生产预检及 Snapshot 冻结均消费实际 Market 核验结果，缺证据不能 ready；冻结保存原清单与完整归档、离线重验，真实 Provider/历史归档独立验收。
      - [x] S05-reconstruction-preflight-guard：联合生产预检已注入实际 Market 清单/归档及来源时钟绑定。未提供实际证据、内容不符或只有必要条件均拒绝 ready；固定快照沿用真实冻结时钟。实际 repository 消费 7 项、完整执行预检 28 项、联合入口 7 项包含于相关 214 项，目标每端 12 个受控完整预检场景通过。最终历史时点及合格证据封存/离线链仍开放，见 [门禁证据](evidence/2026-09-28-s05-reconstruction-guards.md)。
      - [x] S05-reconstruction-freeze-guard：新 Snapshot 写入前消费相同历史门禁，非空引用不能绕过预检直接冻结；稳定错误在 startBuild/Artifact 写入前抛出。新增 3 项包含于相关 214 项，固定快照仍可实际本地冻结与重放；官方同步后两端实际构造器注入、编译摘要和健康通过。目标没有执行 Snapshot 写入，最终合格证据冻结格式及旧 V3 严格快照离线重验继续开放，不替代 V2 兼容语义，见 [门禁证据](evidence/2026-09-28-s05-reconstruction-guards.md)。
  - [x] S05-legacy-clock：旧 Reader 显式冻结截点与完整固定研究验收已实施，来源/Bar 实际时间不改写；新增 22 项本地与 2 项 PostgreSQL 场景，相关 127 项、独立应用角色实际数据库 6 项通过。类型/构建/lint/门禁通过，官方同步后两端各 11 个实际 Reader 受控场景及两份摘要一致。旧 HTTP 与无重建依据的 V2 调用边界明确，真实重建仍归独立叶，见 [旧读取证据](evidence/2026-09-27-s05-legacy-clock.md)。首次数据库探针发现的日期窗口缓存问题已独立登记 `S03-date-cache`，本叶未宣称修复。
    - [x] S05-legacy-clock-precision：旧 Reader 的显式 `asOf` 在读取前用精确证据瞬时验证；固定快照和严格 PIT 的观察、Bar 原时间及可用时间按完整小数秒比较，保留既有失败类别。[微秒边界证据](evidence/2026-09-28-cont-s05-reader-asof-precision.md)记录修前红例、修后测试及目标源码同步。此局部修复不授予严格 PIT 历史来源资格，S05 父项仍开放。
  - 覆盖：Spec §6、§9，AC09、AC12；依赖：S03、C01。
  - 写入：K-Market 的读取模式及测试。
  - 完成：固定序列保留真实 observedAt/原行情时间/修订，不伪造历史 availableAt；严格模式要求可重建依据，不自动降级、不前填冒充成交或推断停牌。
  - 验证：V-Server；同一数据不同历史协议的允许/拒绝、未来 Bar、未知交易状态和缺时点依据。

## 5. M1：领域记账与运行执行面

- [x] B01：Typed AST 的单位与规则兼容检查。
  - 覆盖：Spec §5.3、§6.2，AC07、AC12；依赖：C01。
  - 写入：K-Domain 的执行模型/AST 兼容检查及测试。
  - 完成：支持已列价格趋势、相对规则、资金比例与持有期；真实 lot/tick、按份费用、绝对数量/价格、量参与率、VWAP 等缺转换时明确拒绝，保留原策略内容。
  - 验证：V-Domain；支持/拒绝矩阵、已证明统一缩放的相对规则不变性和非比例/跨序列反例。
  - 执行记录（2026-09-25）：新增独立的 `backtest-rule-compatibility.ts`，以解析后的 V2 AST 和 C01 价格协议 fixture 验证同坐标趋势/相对突破、资金比例、持有期及不兼容真实单位；拒绝报告保留原策略对象。只在有证据时接受统一缩放，非比例和跨序列反例拒绝。初次包级 typecheck 因可选字段显式写入 `undefined` 失败，后续 B01-r 在同一新模块修复且不改变判定。定向 2 文件/20 测试、目标 ESLint/复杂度/Prettier、Domain 包级 typecheck、完整 28 文件/251 测试及 build 通过。共享导出与 Server 消费接线归后续任务。

- [x] B02：归一化持仓与公司行动记账政策。
  - 覆盖：Spec §5.1–§5.4，AC03、AC04、AC15；依赖：C01。
  - 写入：K-Domain 的 SimulationLedger 记账接缝及 golden。
  - 完成：Decimal 小数单位、现金/占款/估值守恒；归一化路径不重复拆分、不另加分红；raw-events 保持原语义，不引入 Provider 分支。
  - 验证：V-Domain；纯拆分 raw 100×2→200×1、qfq 200×1、hfq 100×2 均为 200；受控现金分红样本分别验证，差异按经济假设解释。
  - 执行记录（2026-09-25）：`SimulationLedger` 增加 raw-events 默认与 normalized-series 记账分支及 Decimal 小数单位；归一化路径不重复应用拆分或现金分红。拆分三口径 golden 均为 200；受控分红 raw 为现金 20 加持仓 180，normalized 为持仓 200、不另加现金；占款后现金与估值守恒。定向 3 文件/20 测试、ESLint/Prettier/diff check、Domain 包级 typecheck、完整 28 文件/251 测试及 build 通过。Server 尚未传入 `accountingBasis`，引擎当前将 `CORPORATE_ACTION_IGNORED` 归入规则拒绝；这两项属 B04 的执行接线，不能据此宣称归一化运行已通过。

- [x] B03：归一化定仓与费用预留。
  - 覆盖：Spec §5.2–§5.4，AC06、AC07；依赖：B02。
  - 写入：K-Domain 的 sizing/费用/资金约束及测试。
  - 完成：比例费用/滑点、买卖方向、舍入、最低/固定逐笔收费有显式规则；不支持的费用模型拒绝，不忽略；全成或拒绝。
  - 验证：V-Domain；全仓含费、连续调仓、卖出资金再用、占款释放、零资金/极小金额、拒单，无负现金、超卖或重复费用。
  - 执行记录（2026-09-25）：`backtest-sizing.ts` 用精确整数向下取整 lot；sizing/risk adapter 按成交及完整费用计划寻找可负担的最大 lot，整单接受或拒绝；exchange 显式处理买卖滑点、比例/最低佣金、舍入和未知费用字段，并传递现金预留 ID。定向 5 文件/57 测试、Domain 包级 typecheck、目标格式与 diff check、完整 28 文件/257 测试及 build 通过；目标 ESLint 无错误，三条警告来自既有复杂度项。B04 仍须把统一口径 lot、可用结算现金、预留 ID 消费与成交时序接入真实执行链。

- [x] B04：现有引擎接入归一化成交时序。
  - 2026-09-27 收口：[领域与装配证据](evidence/2026-09-27-b04-b05-domain-integration.md)核对现有模拟链、下一有效开盘、DAY/全成或拒绝/只做多、尾日未成交与一次发布；Domain 全包 313 项及对应 Server 装配通过，不代替真实运行门禁。
  - 覆盖：Spec §3.1、§6、§10，AC05、AC06、AC15；依赖：B01、B02、B03。
  - 写入：K-Domain 与 K-Run 的必要执行调用接缝；Server 只装配领域行为，不重复计算。
  - 完成：Signal→TargetIntent→Order→Fill 复用现有链路，单标的/只做多/无杠杆/DAY/下一有效开盘；末尾订单保持未成交；不新增通用插件框架。
  - 验证：V-Domain 加 V-Server 定向装配测试；禁止同收盘无条件成交、未来 Bar、部分成交和重复发布模拟事实。

- [x] B05：一致语义的 Benchmark 与绩效指纹。
  - 2026-09-27 收口：[领域与装配证据](evidence/2026-09-27-b04-b05-domain-integration.md)核对同源买入持有、冻结成本及逐项舍入、缺失/不兼容拒绝、尺度敏感策略和比较指纹；前置 C03/B02/B03 已完成。独立 G-Math 与真实验收保持原状态。
  - 覆盖：Spec §5.4、§8.3、§11，AC13；依赖：C03、B02、B03。
  - 写入：K-Domain 的 backtest analytics 及 K-Run 对应结果投影。
  - 完成：同标的默认买入持有；Benchmark 成本假设明确；同价格/收益/历史协议才计算超额与进入评价组；指标与比较指纹绑定实际输入。
  - 验证：V-Domain/V-Server；缺兼容基准、尺度敏感策略、不同成本/来源/分红协议不能混排，不用零值假装有效结果。

- [x] S06：统一计算依赖计划。
  - 2026-09-27 收口：[统一依赖计划证据](evidence/2026-09-27-s06-dependency-plan.md)核对纯计划器、普通/AI 共用路径、价格/事件/预热/身份/FX/历史与转换义务；10 项计划测试及相关装配测试通过，C03/B01 前置项已完成。来源和事件缺证据仍保留 pending/blocked。
  - 覆盖：Spec §9，AC07–AC09、AC12；依赖：C03、B01。
  - 写入：Server backtest 的无网络依赖计划 helper 及测试，供普通运行和 AI 共用。
  - 完成：按策略/模型推导信号、执行、Benchmark、预热、身份/会话、事件、PIT 和真实单位转换依赖；事件按影响窗口区分生效事实与提前可见信号。
  - 验证：V-Server；无事件策略的 normalized 不索取完整事件表；raw/事件策略缺所需事实仍阻断；除权日不能冒充公告可用时间。

- [x] S07：服务端预检 API 与失效规则。
  - 2026-09-28 父项收口：三个子项均已完成；本轮联合预检/准备定向回归再次通过，缺失或不合格的严格历史事实继续诊断并拒绝，不因 S05 未取得最终资格而绕过预检。见 [S07–S09/I01 父项对账](evidence/2026-09-28-cont-s07-s09-i01-parent-reconciliation.md)。
  - [x] S07-dependencies：复用既有非价格依赖请求/验证及事件能力读取，增加只读逐项诊断入口；覆盖日历/证券事实/按需事件、多项失败、未来事实和传输失败脱敏。写入限定 Backtest 依赖收集器、预检 helper 与定向测试；不生成快照或运行引擎。前置使用 S06 已完成的依赖计划合同及 S08 现有收集验证接缝，不声明 S04/S05 真实门禁完成。新增 6 项回归，组合 34 项、Server 类型检查和定向 lint 通过，见 [非价格预检证据](evidence/2026-09-27-s07-dependency-preflight.md)。HTTP/API 消费及整体验收另由 S07-api 承接。
  - [x] S07-api：在只读非价格预检完成后接入服务端 API 与消费契约，联合执行行情修订失效结果；保留创建/冻结重新校验，不能将局部检查提升为整体就绪。2026-09-28 当前复验 Server/API Client 7 文件 75 项通过，目标非法请求继续 HTTP 400，结合既有目标任务数不变证据收口本子项；S05 真实资格、有效依赖 ready 与浏览器/Electron 仍独立开放，见[当前实现对账](evidence/2026-09-28-cont-s07-api-reconciliation.md)。
    - 目标续验：官方 `sync-code.sh thesis-ledger` 完成，Server/Worker 产物摘要一致且 healthy；真实 HTTP 的非法合同、缺失策略及缺价格绑定拒绝通过，任务数未变。浏览器初次及两次重试被客户端拦截，本轮跳过；Desktop 未由此入口部署，详见 [目标同步记录](evidence/2026-09-27-s07-target-sync.md)。
    - U03 联合消费叶：普通复权回测的既有准备操作顺序执行准备→联合预检，仅两步通过且修订一致才向父表单发布可提交配置。复用 TanStack Query 的配置键/取消信号/路由失效规则，显示诊断能力、窗口和已知目标；写入 Desktop 准备请求接缝、诊断组件与测试，不改旧 raw 路径或 AI 实验合同。浏览器/目标运行态独立保留。
      - 本地实现完成：组合 21 项及补充取消场景后请求链 8 项通过，类型检查/lint/Desktop 构建通过。更高路由修订不再因早于请求完成时间而被忽略；证据见 [U03 消费记录](evidence/2026-09-27-u03-preflight-consumption.md)。目标部署、浏览器/Electron 未执行。
    - 当前诊断叶：保留事件能力逐项观测失败及已固定请求；将已知能力、精确范围、实际请求目标和稳定失败原因转为诊断。写入 Market 事件选择结果（不改变选择策略）、Backtest 事件失败载体/诊断及定向测试；未确定目标时保持空来源，不推断或额外重试。
    - 事件诊断叶本地完成：逐能力失败、已知请求目标、精确范围、覆盖缺口和异常脱敏已接通；修复新增错误继承触发的初始化循环后首次重试 35 项通过，补充组合 32 项通过，类型/lint/边界检查通过，见 [事件诊断证据](evidence/2026-09-27-s07-event-diagnostics.md)。U03 与目标验收继续开放。
    - 本地接线已完成：`POST /backtests/run-config/preflight` 与 `backtests.preflightRunConfig`，返回前重新核对策略/路由；Server 59 项、客户端 11 项、三包构建、类型检查/lint 与架构边界通过。事件精确能力/来源诊断、U03 消费和目标运行态仍未完成，详见 [API 实施证据](evidence/2026-09-27-s07-preflight-api.md)。
  - [x] S07-revision：执行行情预检的策略/配置摘要及 Desired/Effective/Catalog 修订失效回归完成；14 项预检、37 项诊断/HTTP 准备/创建组合测试和 Server 类型检查通过。生产逻辑已有拒绝门禁，本轮新增 5 项回归；全依赖预检和真实运行态不在此叶完成范围，见 [失效验证记录](evidence/2026-09-27-s07-revision-invalidation.md)。
  - 覆盖：Spec §7.4、§9，AC08、AC09、AC12、AC19；依赖：S06、S04、S05、S01。
  - 写入：Server backtest 的预检/API 及必要 api-client 消费契约测试。
  - 完成：诊断包含标的/能力/用途/区间/缺失字段或规则/目标来源/行动建议；复用现有错误体系；配置/策略/路由 revision 改变即失效。
  - 验证：V-Server；预检不调用模型、不计算绩效、不生成另一快照；非法直接提交也拒绝；网络检查可复用但不掩盖真实缺口。

- [x] S08：冻结统一价格协议与实际输入。
  - 2026-09-28 父项收口：当前完整 Snapshot、多窗口、来源/依赖、原子 finalize 与离线重放定向共纳入 124 项回归；固定 V3 可重放，严格 PIT 在最终来源资格缺失或伪证据时继续失败关闭。冻结实现完成，S05 真实历史资格仍独立开放，见 [父项对账](evidence/2026-09-28-cont-s07-s09-i01-parent-reconciliation.md)。
  - 覆盖：Spec §8–§11、§13，AC02、AC10–AC15；依赖：C03、S04、S05、S06。
  - 写入：K-Run 的 Snapshot Builder/数据快照及测试。
  - 完成：替换固定 none 的接缝；冻结信号/执行/Benchmark 的实际价格计划、版本、主备命中、规则/成本/事件；冻结前重新核对 revision 和真实数据，Run-owned 身份不共享写入。
  - 验证：V-Server；预检后配置变化、源恢复、观测修订、分段请求不会偷换已冻结输入；完整/非法 Snapshot 的原子发布行为。

- [x] S09：Run 执行、持久终态与离线重放。
  - [x] S09-benchmark-clock-precision：V3 Benchmark 的严格 PIT 估值对齐按完整小数秒比较，不把同毫秒晚到的收盘事实计入收益；冻结快照、V2 旧路径及来源准入不因本叶改变。受控完整快照修前红例、修后相等/晚到边界及 Benchmark/Runner/Run 31 项通过；Server 类型/构建、限定 lint/边界通过，官方快更后两容器健康且编译摘要一致。源码文件仅存一处既有 Prettier 格式差异，见[精确时钟证据](evidence/2026-09-28-cont-s09-benchmark-clock-precision.md)。
  - 2026-09-28 父项收口：S08 已完成；V3 执行/生命周期、configured run 与 legacy 边界当前回归通过，结合真实隔离 PostgreSQL/Redis、BullMQ、独立 Worker 的 I01 组合，覆盖 attempt CAS、持久终态、查询与离线重放。真实 HiThink 产品 Run 仍归 G-Run，见 [父项对账](evidence/2026-09-28-cont-s07-s09-i01-parent-reconciliation.md)。
  - 2026-09-27 续核：[执行与终态证据](evidence/2026-09-27-s09-execution-audit.md)记录 51 项定向通过；完整 backtest 首轮 308 通过、1 文案断言失败、5 跳过，修正为错误类型断言后所在文件 4 项通过。真实 Worker 门禁与前置 S08/B04/B05 未关闭，父项继续开放。
  - 覆盖：Spec §10、§13，AC05、AC11、AC15、AC17；依赖：S08、B04、B05。
  - 写入：K-Run 的 runner/artifact 与已有 Worker 接缝及测试。
  - 完成：新格式进入现有队列执行，持久化结果后查询可读；重放只用冻结输入；旧快照调用旧解码/已冻结语义。
  - 验证：V-Server；领取/成功/失败提交保留 status+attempt 原子约束，队列查询失败不当作缺失，重复投递/晚到结果不覆盖；本任务不重写重试系统。

- [x] I01：最早可执行的真实领域语义联通。
  - 2026-09-28 父项收口：ORM JSONB 位模式问题修复后，受控 DSA HTTP → 实际 Reader/证据仓库 → 普通 HTTP 创建 → BullMQ → 独立生产 Worker → 数据库终态/结果查询/离线重放的隔离组合已重新通过；S07–S09 父项现均满足。该门禁按定义使用 fixture 来源，不签发 HiThink 在线资格，见 [父项对账](evidence/2026-09-28-cont-s07-s09-i01-parent-reconciliation.md)。
  - [x] I01-reader-pg：修复 Prisma ORM JSON 参数使完整响应中 22 个合成浮点数发生 1 ULP 改变的存储失配。参数化 JSON 文本写入在隔离 PostgreSQL 全 migration 后新行/空载荷填充均保持原位模式和摘要；使用当前源码重新执行实际 Reader/选择器/证据仓库、受控 DSA HTTP、普通创建、队列和独立 Worker 组合 1 项通过。见 [ORM 根因与恢复证据](evidence/2026-09-28-cont-i01-jsonb-orm-fix.md)。旧完整载荷失配仍拒绝，不在读取时重算/覆盖历史。
  - [x] I01-worker-success：独立 PostgreSQL/Redis、实际 Controller HTTP 创建、DsaClient 受控 HTTP 获取、BullMQ 投递及生产 Worker 子进程成功执行，严格 V3 结果持久化和离线重放校验和一致；扩展组合 1 项通过，另含篡改快照失败终态、HTTP 结果查询及 16 张真实域表隔离。Reader 来源选择/准入/修订仍使用 fixture，生产选择器及父项依赖仍需对账。见 [Worker 联通记录](evidence/2026-09-27-worker-runtime-integration.md)。
  - 依赖：D01、D03、S01、S07–S09；所有者：Server 集成执行者。
  - 环境/入口：隔离数据库、现有队列/Worker、受控 DSA 响应，经普通 Run 创建入口→投递→领取→冻结→真实引擎→数据库终态→结果查询→离线重放。
  - 通过：fixture 来源的完整回测与失败结果正确，真实账户表无模拟写入，候选/界面尚未完成也不阻止此门禁；修复仅限已交付接缝。
  - 证据：请求/Run/Snapshot/结果哈希、重放一致性与状态迁移。此门禁不证明 HiThink 账号在线或 AC17 通过。

## 6. M1：AI 与真实监控消费面

- [x] A01：实验与候选共享冻结比较协议。
  - 2026-09-28 父项收口：S08 前置已完成；候选绑定、版本化运行与父窗口离线比较当前 16 项通过，跨标的/周期和经济假设变更继续拒绝。见 [A01/A02 父项对账](evidence/2026-09-28-cont-a01-a02-parent-reconciliation.md)。
  - 2026-09-27 补验：[候选绑定记录](evidence/2026-09-27-a01-candidate-binding.md)新增信号更名回归，配置绑定与版本化运行共 12 项通过；不修改输入配置、不提前创建任务或申请预算。父窗口复用沿用既有独立测试，S08 前置仍开放，父项不勾选。
  - 当前执行叶 A01-cfg-bind：候选移除或更名信号时，在 Backtest 所有权内按候选实际依赖重建同坐标价格别名；保留父窗口、协议、预算及冻结时间，跨标的/周期仍拒绝。先验证完整输入计划，再进行在线预检；已有幂等任务按重建后的配置匹配并离线返回。普通配置预检仍要求提交的绑定完全准确。
  - 覆盖：Spec §11.1，AC13、AC14；依赖：C03、S06、S08。
  - 写入：K-AI 的实验配置/候选校验及测试。
  - 完成：资产、周期、成本、记账、历史性质和可比基准固定；各候选独立 Run-owned Snapshot 引用同一市场事实版本；普通/基线/候选复用依赖计划。
  - 验证：V-Server；候选改来源/口径/经济假设拒绝或新建对照实验；不能用相同 Run ID 代替可比性。

- [x] A02：AI 封存隔离与失败分层。
  - 2026-09-28 父项收口：A01、S07、S08 前置现已满足；模型反馈/评价/失败分类/SDK HTTP 当前 22 项通过，结合既有独立 PostgreSQL 封存访问与揭示生命周期证据完成本父项。真实模型 Provider 与完整实验仍由 G-AI 独立验收，见 [A01/A02 父项对账](evidence/2026-09-28-cont-a01-a02-parent-reconciliation.md)。
  - [x] A02-sealed-pg：专用 PostgreSQL 使用项目显式重建入口应用 19 份 migration、68 张表及独立 app role；SDK 2 项、封存访问/揭示生命周期 3 项通过。实际 JSONB baseline/prior candidate 的封存收益、未来日期、事件/行情、自由诊断与未知字段没有进入实收 HTTP messages，合法负收益及固定序列性质保留；部分失败、取消、缺 Run、过期 lease、晚到结果与统一揭示均验证。另 22 项定向及类型/lint 通过；临时容器清理。V2 生命周期与 V3 投影分别记录，真实 Provider/V3 Worker 与父项前置仍开放，见 [隔离数据库证据](evidence/2026-09-27-a02-sealed-postgres.md)。
  - 2026-09-27 补验：[模型反馈与失败分类记录](evidence/2026-09-27-a02-feedback-audit.md)中 22 项定向检查通过，含 SDK 本地 HTTP 实际请求；后续 `A02-sealed-pg` 已补齐隔离数据库生命周期及 JSONB 到 SDK 请求的 5 项。未调用真实模型；A01/S07 与真实来源/Worker 前置仍开放。
  - 覆盖：Spec §11.1，AC12、AC14；依赖：A01、S07、B05。
  - 写入：K-AI 的模型输入/反馈投影、排名和失败分类及测试。
  - 完成：只暴露允许的开发/验证数据；全区间未来极值/事件数/日期不泄漏；数据缺口、协议不兼容、模型格式错误与策略亏损分开。
  - 验证：V-Server 捕获实际模型请求投影并断言无封存行情/事件/指标；缺数据不以零收益入榜；固定复权研究不标为严格无前视样本外。
  - 当前执行叶A02-a：在提示词构建边界只投影development/validation的类型校验指标，禁止透传test、自由文本错误、日期、行情、事件与未知字段；向既有优化和两种探索协议附带价格/记账/历史性质标签，不传父窗口整段事实。独占新模型反馈投影helper、prompt接线和捕获实际messages的测试；不变更模型调用预算或真实请求。
  - 后续叶A02-b：为结果评价增加数据不可用、协议不兼容与策略表现分类，保留SDK模型格式错误；缺失值与策略亏损分别验证。整组仍需SDK实际HTTP投影、封存暴露生命周期及运行失败路径组合证据。
  - A02-a/b本地进展：三种实际messages投影、SDK本地HTTP实收请求均验证无封存指标/日期/事件/自由诊断；固定快照明确不声明严格无前视样本外。评价增加data-unavailable/protocol-incompatible/strategy-ineligible/strategy-performance，SDK结构化格式码和失败Run错误保持分层与脱敏。balanced/lowTurnover缺换手率拒绝，不按零评分。Server全包1181通过/49跳过、类型与目标lint通过（`/private/tmp/a02-*`）；真实Provider和封存生命周期数据库门禁仍开放。

- [x] A03：采纳到真实风险规则时重新编译。
  - 覆盖：Spec §11.2，AC15、AC16；依赖：C01、B01。
  - 写入：K-AI 中 `strategy-risk-application.service.ts` 对应编译/校验及测试。
  - 完成：百分比规则按真实账户成本重新编译；归一化绝对价/单位缺转换就拒绝；actual/shadow、真实 Ledger/Portfolio/Trade/Journal 无模拟事实写入。
  - 验证：V-Server；可转换百分比、不可转换价格/数量、直接绕过 UI 提交和已存在真实规则回归。
  - 当前执行叶A03-r：复核已落盘真实成本和直接API拒绝测试，提取风险编译/策略结构验证至本feature的独立纯接缝，使618行风险应用Service收回原尺寸基线；补绝对价离场与模拟数量只显示覆盖限制、不变成真实规则的组合证据。仅风险编译helper、Service接线与预览测试，保留真实上下文读取及持久化边界；真实数据库回归仍另验。
  - A03-r完成本地编译接缝提取；真实成本百分比、绝对价/模拟仓位不映射、直接API非法风险拒绝及既有更新/身份共11项通过，类型与边界通过。Service缩至595行，尺寸违规由原8项减为7项。
  - A03-pg：独立 PostgreSQL 的实际持仓成本读取、百分比评价、停用及启用应用和冻结规则落库、成本变化使预览失效、三类非法风险拒绝共 6 项通过；actual/shadow 持仓及 Portfolio/Journal 非空哨兵、16 张事实表摘要不变，既有风险规则未被拒绝请求覆盖。类型与 ESLint 通过。行情为显式 fixture，不声称后台定时评价或外部通知验收。C01/B01 依赖已核对，Server 全包复核 1353 项通过、68 项环境条件跳过，A03 所需隔离数据库另行实际执行通过，父项关闭。见 [组合验证记录](evidence/2026-09-27-legacy-replay-isolation.md)。

## 7. M1：Desktop 消费面

实现时必须使用 shadcn skill，核对当前 components.json、组件与锁定 CLI；沿用 TanStack Query、原子类及中文标签映射，不添加重复保存入口。共享组件与当前用户 WIP 冲突时先缩小写入范围。

- [x] U01：按口径保存路由与不可用原因。
  - 2026-09-28 父项收口：U01-a/b 的精确 V3 目录与 Desktop 三口径路由消费已完成；当前路由 UI 定向 11 项和 Desktop typecheck 通过，历史优化表单类型阻塞已解除。真实 Catalog/API 保存联通仍归 G-UI，见 [Desktop 父项对账](evidence/2026-09-28-cont-u01-u05-parent-reconciliation.md)。
  - 覆盖：Spec §7.1–§7.2，AC19；依赖：C02、C04。
  - 写入：K-UI 的现有数据源路由行及请求 hooks/组件测试。
  - 完成：三个口径保持各自主备、单一保存语义；非价格行没有复权选项；未应用/无凭据/不支持/范围不足可读，触发器与选项复用中文标签。
  - 验证：V-Desktop，口径往返切换、保存恢复、失败重试、能力变化；实际联通由 G-UI 验证。

- [x] U02：可预览的 HiThink 优先预设。
  - 2026-09-28 父项收口：U01 前置已完成；预览/取消/应用、目录失效及唯一保存入口已有本地浏览器证据，当前预设 7 项继续通过。真实服务端保存仍归 G-UI，见 [Desktop 父项对账](evidence/2026-09-28-cont-u01-u05-parent-reconciliation.md)。
  - 覆盖：Spec §7.3，AC11、AC19；依赖：U01。
  - 写入：现有路由设置的预设投影与组件测试。
  - 完成：预览只涉及已支持、已配置能力，由用户明确应用；不覆盖其他路由或自动注册付费授权。
  - 验证：V-Desktop；已有选择保留、取消预览无修改、缺凭据/不支持能力不纳入、最终保存仍遵从现有 API。
  - 执行叶U02-a：独立纯投影仅选择complete目录中ready且Provider已启用/配置的HiThink精确能力，补充未选择的路由，保留已有主备；多个同能力HiThink目标不猜选。叶U02-b：现有Panel嵌入小型预览组件，明确应用才修改父草稿，取消无修改，依赖变化使预览失效；继续复用唯一保存按钮。写入限定新helper/组件、Panel挂接及定向测试，shadcn现有Alert/Button，浏览器验收另列。
  - U02-a/b本地18项测试、Desktop类型及目标lint通过。真实浏览器合成页面已核对预览/取消/应用/目录失效/能力恢复，修复旧预览复活；不访问真实服务端，证据见[evidence/2026-09-26-hithink-preset-browser.md](evidence/2026-09-26-hithink-preset-browser.md)。真实Catalog及API保存仍由G-UI验收。

- [x] U03：回测配置与预检展示。
  - 2026-09-28 父项收口：S07 已完成；准备→联合预检、取消/晚到隔离、修订失效和诊断展示当前相关 19 项通过，Desktop typecheck 通过。目标浏览器/Electron 仍归 G-UI，见 [Desktop 父项对账](evidence/2026-09-28-cont-u01-u05-parent-reconciliation.md)。
  - 覆盖：Spec §7.4、§9，AC07、AC12、AC19；依赖：C03、S07。
  - 写入：K-UI 的 BacktestSetupDialog/ModelConfiguration 及请求、测试。
  - 完成：展示价格口径、实际数据计划、主备、记账、历史性质、成本和不兼容规则；新复权研究可预选兼容模型；改变旧 raw 模型须显式确认影响。
  - 验证：V-Desktop；策略/revision 变化清除过期预检，服务端拒绝正常显示，不复制规则引擎。

- [x] U04：共同价格图表口径独立于运行配置，目录只读入口、三口径、扩窗、失败恢复及配置隔离已通过。
  - 覆盖：Spec §7.2，AC19；依赖：C01、C02。
  - 写入：K-UI 的 market-detail 行情查询与口径控件及测试；保留现有 NAV 路径。
  - 完成：只改变图表查询与缓存键，不修改冻结运行、策略或其模型；选择受来源能力约束。
  - 验证：V-Desktop；图表切换后已运行配置不变、独立缓存、错误/切回状态和 NAV 回归。
  - 当前执行叶U04-a：先修复请求协调器缺adjustment导致不同口径共享in-flight的问题，补并发/取消隔离测试；随后U04-b将图表查询、历史分页、刷新与重试全部纳入口径身份。U04-c需Server图表读取接入精确V3路由及来源能力再开放选择，不能只有下拉框而仍读旧Control V2。保留既有图表刷新WIP及NAV。
  - U04-a/b 本地记录：协调器隔离口径，Dialog 请求世代、查询键、历史补页、最新检查和分段重试传递 adjustment；三口径挂载及并发取消测试共 20 项通过，Desktop 类型检查通过。尚未开放选择器。U04-c 拆分前提：现有 V3 完整窗口 wire 明确拒绝未收盘日线，不能直接替换图表交互读取或放松回测完整性；需独立交互读取契约及 DSA/Server 适配，并保留未收盘、刷新及 NAV 行为。
  - 2026-09-29 NAV 首次读取回归修复：基金详情首次请求显式选择净值能力，避免误进股票/ETF 图表计划门禁；Desktop 全包 509 项、类型与构建通过，目标浏览器和真实 NAV 仍待验收，详见[本地证据](evidence/2026-09-29-cont-u04-nav-opening.md)。

- [x] U05：结果语义与重放信息。
  - 2026-09-28 父项收口：当前结果/模型披露、详情与诊断相关回归通过，实际来源、口径、记账/分红/历史性质、成本、重放版本及不可比较评价组均有明确展示。真实目标 Run 页面验收仍归 G-UI-159516，见 [Desktop 父项对账](evidence/2026-09-28-cont-u01-u05-parent-reconciliation.md)。
  - 2026-09-27 补验：[结果披露记录](evidence/2026-09-27-u05-disclosure-audit.md)中 Desktop 18 项通过，确认实际备用来源、分红未知、旧响应、损坏合同与固定快照限制。不同评价组和基准状态覆盖、目标浏览器/Electron 未在本轮验证，继续保持开放。
  - 当前执行叶 U05-ai：候选对比页消费服务端已返回的实验 runConfig，严格校验 V3 后展示口径、份额、分红、冻结时间和历史性质；固定供应商快照明确不构成严格无前视样本外验证。旧记录或无效配置显示无法确认，不推断成严格历史输入。各次运行实际来源仍以具体回测结果为准。
  - 覆盖：Spec §11.3，AC12、AC13、AC19；依赖：C03、B05。
  - 写入：K-UI 的回测结果与 ModelDisclosure、AI 结果摘要及测试。
  - 完成：保留收益/回撤/交易/Benchmark，集中说明实际来源、口径、记账、单位、分红、时间性质、成本、重放版本及未知限制，不生成准确率分数。
  - 验证：V-Desktop；实际备用与配置主源不同、provider-defined 分红、旧运行、无兼容基准与不同评价组。

## 8. M1：独立验证与部署验收

- [x] G-Math：固定策略的独立实现对照。
  - 当前执行叶 G-Math-a：新增独立整数分币参考计算器，对两种等比例归一化价格坐标的固定阈值策略逐日比较信号、下一日开盘成交、逐笔费用、现金、持仓和净值；参考计算不导入引擎、信号、费用或估值计算函数。保留现有拆分/分红 Decimal golden；本叶不替代真实运行和其他策略覆盖。
  - 验证记录：`packages/domain/test/backtest-independent-reference.test.ts` 对两种坐标的 8 个交易日逐日前缀独立对照，信号/成交/分币现金/持仓精确一致，净值相对误差阈值 1e-8；连同归一化记账与公司行动 golden 共 12 项通过。Domain 类型检查和新增测试 lint 通过。仅完成本固定策略数学门禁，不关闭 G-Run/G-Legacy/G-AI。
  - 依赖：B04、B05、S09；所有者：领域验证执行者；入口：`packages/domain/test/` 中独立参考计算或 vectorbt/Backtrader 测试工具。
  - 覆盖 AC18：相同 Bar、策略、费用、舍入和成交时序对照信号/成交/现金/净值；参考实现不复用被测引擎计算函数。
  - 证据：测试预先固定误差阈值（浮点净值相对误差 ≤ 1e-8，现金按明确分币舍入），Decimal golden 精确相等；另保留拆分/分红 golden，不拿外部工具输出替代经济语义证明。

- [x] G-Legacy：旧路径与真实域回归。
  - 2026-09-28 父项收口：S09/A03 前置已完成；当前旧快照/旧运行 5 文件 29 项通过，结合既有独立 PostgreSQL、CN/HK/US/NAV Parquet 与真实域摘要不变证据，旧路径回归条件满足。真实外部 Provider 仍由各自门禁验收，见 [父项对账](evidence/2026-09-28-cont-g-legacy-parent-reconciliation.md)。
  - [x] G-Legacy-pg：独立 PostgreSQL 的真实 Prisma 创建/幂等/领取/终态/冻结重试 3 项通过，账户、账本、持仓及交易摘要不变；队列端口和行情使用明确 fixture，不替代真实 Provider/Redis。目标部署 8 份历史 CN ETF V2 快照重放校验和一致，14 张真实域表摘要未变。另有 Server 19 项、Domain 36 项回归通过。其他市场/NAV 完整冻结重放和父项依赖仍需核对，见 [验证记录](evidence/2026-09-27-legacy-replay-isolation.md)。
  - [x] G-Legacy-nav-disk-replay：复用 V2 NAV Schema/执行合同，以新测试将合成 CN 基金 NAV 信号、正式净值事实、冻结日历与元数据实际写入 `LocalSnapshotStore`，完成 `finalize`→`LocalSnapshotRunner`→重新打开本地仓库重放；NAV 申购成交、无交易配对与结果校验和一致。新测试 1 passed，相邻 V2 exchange/NAV 共 6 passed，Server typecheck、目标 ESLint/Prettier 通过；详见 [本地重放证据](evidence/2026-09-28-cont-legacy-nav-disk-replay.md)。只证明新建合成 V2 NAV Snapshot 的旧语义，不证明历史线上 NAV 工件、目标容器或真实 Provider；G-Legacy 父项继续开放。
  - [x] G-Legacy-frozen：CN/HK/US 原始价格及 NAV 的实际 Parquet 落盘、新建 Store/Runner 完整重放和 NAV 篡改拒绝共 5 项通过；合成市场规则不代表真实来源验收。见 [验证记录](evidence/2026-09-27-legacy-replay-isolation.md)。父项仍待 S09/A03 依赖核对。
  - 依赖：S09、A03；所有者：Server 集成执行者；环境：隔离数据库及旧快照样本。
  - 覆盖 AC15：旧 raw、其他市场、NAV、新旧快照读取/重放、真实域不写入；对照基线行为及真实事实表前后状态。
  - 证据：定向回归和数据库断言；不是仅凭静态 import 扫描判定隔离。

- [ ] F01：**扩展/发布前门禁开放**。M1 运行依赖与兼容发布准备。
  - [x] F01-local-recovery-artifact：2026-10-03 当前四份镜像及同批 PostgreSQL/DSA/冻结状态已形成 Git 忽略的权限受限本地包，约 0.93 GiB；压缩包导入、包文件隔离恢复及四条冻结重放通过，源数据卷集合不变。旧 Server/Worker 的重放校验值不一致，旧 DSA 改变目录身份，组件候选均拒绝；现有历史备份只有 PostgreSQL，缺同批 DSA/冻结状态。异地长期制品和合格旧状态回退仍未完成，详见[当前 P03/P04 验收](2026-10-03-multi-source-remaining-acceptance.md)。
  - [x] F01-image-retention：官方 infra 完整更新已在构建前固定 DSA、Server、Worker 当前实际镜像 ID；Compose 查询、镜像检查/标签失败或身份冲突均停止。9 个模拟场景、Shell 语法、infra 组合门禁和当前运行镜像标签/ID 核对通过。旧候选镜像已从本机消失；当前标签只为下一次更新保留本地候选，非长期制品或完整回退。另以 SQLite 在线备份与 PostgreSQL 只读 dump 核对同 generation 28，临时数据清理；尚未恢复或启动旧镜像。详见[保留与双库快照证据](evidence/2026-09-29-cont-f01-image-retention-state-snapshot.md)，F01 父项继续开放。
  - 2026-09-29 Quote 续接：官方 `sync-code.sh all` 将当前源码同步到三容器可写层，镜像 ID 与保留标签均未变化；现有镜像不能作为这次 Quote 代码的可取回制品。目标临时 V2 策略已恢复，详见[目标窗口证据](evidence/2026-09-29-cont-r02-hithink-quote-target-window.md)。完整回退仍需与对应数据状态相容的镜像制品和隔离演练，F01 不关闭。
  - 2026-10-03 剩余验收续接：清理 Docker 缓存后，官方 `update.sh all` 已构建并启动当前内容寻址镜像；当前镜像在隔离双库/DSA/冻结制品副本中完成协议、账户/目录/策略和 4 条冻结重放，源状态保持一致。旧 Server/DSA 候选虽启动健康，但目录状态改变，未取得当前状态回退资格；长期制品和合格旧状态回退仍保留未完成。精确镜像、备份、空间和结果见[剩余验收 Task](2026-10-03-multi-source-remaining-acceptance.md)。
  - 2026-09-28 隔离回退演练：上一版 Server/Worker/DSA 在当前 68 表结构上均能启动，Server 容器内健康 200、Worker ready、DSA V1 200；但临时 DSA 未恢复与数据库同批次的 SQLite 状态，Server 正确拒绝 Catalog generation 倒退，随后宿主端口黑盒出现空响应。按一次修正重试预算停止，不做第三次演练；候选结构兼容已证明，状态保真的完整回退仍未通过，见 [隔离回退记录](evidence/2026-09-28-cont-f01-rollback-rehearsal.md)。
  - 2026-09-27 续核：[发布准备证据](evidence/2026-09-27-f01-release-preparation.md)记录 infra 兼容检查、9 项协议探针通过；更新 infra 部署顺序和禁用/回退步骤，区分已完成数据库升级与未执行镜像回退。未操作目标策略或业务取消，完整发布准备条件仍待核验，保持开放。
  - 当前执行叶 F01-a：保留 V1 发布基线，单列 V3 所需 Data/Control 版本与独立协议 smoke。新增只读能力/握手/精确目录探针及无凭据拒绝验证，错误不输出响应体或 Token；使用本地夹具验证旧版本、串 requestId、partial 目录与鉴权旁路拒绝。infra 提供明确的 V3 验收入口，真实运行态尚不可用时不标记通过。
  - 支持：Spec §13，AC15、AC17；依赖：C04、P01。
  - 写入：K-Infra 的必要配置、Secret 注入说明、兼容矩阵及测试；仅确有必要时增加 SDK/系统依赖。
  - 完成：固定兼容版本组合、服务端/DSA 先于客户端启用的顺序、禁用新能力及相容镜像回退步骤；旧版本读不懂新快照时明确提示，不转换覆盖。
  - 验证：infra 兼容检查、Secret 不进入输出、版本不匹配拒绝新运行且旧功能保留；如果没有运行依赖变更，用事实记录该部分不适用。

- [x] F02：按当前共同价格范围完成用户/运维、架构、版本与三仓能力说明；发布扩展状态分别披露。
  - 2026-09-29 复核：C04、S09、A03、U05 已完成；[版本矩阵](../architecture/version-matrix.md)已补当前 `BIGINT` 结构、首条 Run/AI 局部门禁及目标目录阻断，避免继续把历史 19 migration head 当当前结构。F01 的隔离状态保真回退仍开放，故 F02 父项暂不勾选；见[文档一致性证据](evidence/2026-09-27-f02-document-consistency.md)。
  - 2026-09-27 文档范围复核已记录于 [F02 一致性证据](evidence/2026-09-27-f02-document-consistency.md)：12 份受影响文档相对链接无缺失，逐项核对记账、历史性质、来源、图表与部署边界；C04/S09/U05/F01 依赖仍开放，父项不勾选。下一执行面转回 C04 契约验证，不以文档修订代替运行验收。
  - 2026-09-27 F02-d 领域说明对账完成：移除“当前 V1 为主”的过时现状，将所有决策必须历史可见的泛化表述限定到严格历史时点；补固定供应商快照的真实观测时间、可复现与无前视的区别，以及原始实际份额/归一化序列的事件义务。同步 `CONTEXT.md` 四项领域术语，仅定义概念，不写实现细节。依据主 Spec、`market-price-protocol.ts`、`backtest-execution-model.ts`、`backtest-v3-research-clock.ts` 和执行分支核对；领域页相对链接通过。纯文档修改，无运行态变更。下一步为 F02 范围内最终一致性复核及依赖核对，不能以各文档已写入代替父项验收。
  - 2026-09-27 F02-c 用户/运维说明已修订：用户指南移除 V1 为主的过时状态，说明精确路由、原始/归一化记账、固定供应商快照、候选比较和真实风险采纳边界；运维指南以官方 update/sync 入口替换直接 compose 更新，补显式保留数据升级引用、Control URL/鉴权、准入失败、冻结重放与业务状态排查。已核对两份 infra 脚本的目标参数及预检约束、前述源码接线和现有验收证据，两文件相对链接均有效。本次纯文档修改，不增加真实验收结论。领域说明页仍有 V1 现状与普遍 PIT 表述，下一叶须按领域建模规则对账，F02 保持开放。
  - 2026-09-27 F02-a 续核：§2 六份基线 Spec 已有原始/归一化记账、事件依赖、固定快照与真实风险边界的增量条款，本轮保留。修正架构页仍称图表需迁移的过时说明，按实际 `MarketChartReaderV3` 与 DsaClient 独立 chart-bars 接线记录已实现范围及 U04 开放门禁；修正版本矩阵仍称目标数据库/协议未验收的过时状态，引用已完成保留数据升级和协议证据，保留不可变镜像与产品验收边界。两份修改文档的相对链接检查通过；未重新运行部署或真实来源。完整 F02 用户/运维说明、逐条终审仍待对账，父项不勾选。
  - 2026-09-27 F02-b（DSA 版本入口说明）已完成：修订 DSA `docs/thesis-ledger-contract-v1.md`，保留文件路径与 V1 兼容行为，明确 Data V1/V2/V3 路由、Control V3 沿用 V1 URL 并按信封分派、独立鉴权、infra 兼容基线与 marketV3 smoke 的区别；补持仓未知披露时间说明。已对照 `api/app.py` 挂载、各 router 装饰器 AST、handshake 严格字段及实际 `compatibility.json` 核验。纯文档变更，无需重新部署；不是重新执行真实门禁的证据。F02-a 基线文档与其余用户/运维说明仍需逐项对账，父项保持开放。
  - 2026-09-29 当前替换进展：上述 F02-b 是当时版本记录。DSA 文档已更新为独立 V3 URL，infra `compatibility.json` 与检查脚本收敛为唯一 Data/Control V3 组合；主仓与 infra 的 README、运维说明和合同矩阵同步当前协议/业务 smoke 边界。详见[现行合同入口](evidence/2026-09-29-canonical-contract-smoke-entry.md)与[兼容矩阵证据](evidence/2026-09-29-canonical-infra-compatibility-matrix.md)。当前目标更新仍未完成，F02 全文与三仓说明终审保持开放。
  - 当前执行叶 F02-a：修订 §2 列出的 V2 基线文档，将 raw/公司行动要求限定至原始记账路径；补 V3 精确路由、完整窗口冻结、固定快照研究及 AI/真实风险边界。版本矩阵分开记录源码协议和现有 infra 发布基线，不把本地实现宣称为目标运行态验收。
  - 支持：Spec §2、§14，AC12、AC15、AC19；依赖：C04、S09、A03、U05、F01。
  - 写入：K-Docs 中受影响的原始记账限定、按需事件、固定快照研究、比较/采纳条款与必要交叉引用；DSA/infra 明细留在各自仓库。
  - 完成：不再保留与本 Spec 冲突的“全部回测 raw/必须完整事件表”要求；文档区分已实现与待运行验收，版本矩阵一致。
  - 验证：逐条核对 Spec §2，Markdown 链接、术语、版本与源码一致；不重开旧项目任务、不提前归档本主题。

- [x] G-Deploy：目标开发运行态共同价格路径完成：官方 sync-code.sh、兼容性预检、健康、真实 Worker 与重放通过；本轮无结构变化。
  - 2026-09-30 现行策略存储衔接：目标旧双字段 Policy 与 DSA SQLite 旧当前策略均被现行合同拒绝。显式备份/归档后，主仓官方更新已将目标结构升到 `20260930100000_rebase_legacy_market_policy`，Server→DSA revision 31 重新 Apply 且精确目标 eligible；当前 V3 Run 准备通过，但创建被 `historicalTradability` 的 raw 路由缺失阻断，retry 409。DSA 官方完整构建失败也单独保留。见[策略状态转换证据](evidence/2026-09-30-canonical-policy-state-rebase.md)。
  - 2026-09-29 当前结构保数据升级：官方 `update.sh thesis-ledger` 先因旧行情缓存 6/1899 行与直接删表冲突而由隔离演练拒绝；未部署的新迁移改为同事务归档原行后，隔离旧列摘要及目标结构、权限门禁通过。目标 head 为 `20260929221000_ledger_envelope_version`，Server/Worker 同一新镜像且健康，旧 Run 详情 409、旧 `jobs` 与 Market V2 URL 404。见[目标升级证据](evidence/2026-09-29-canonical-target-database-upgrade.md)。DSA 当前镜像更新、真实来源、现行 Run 纵向链及客户端仍单独验收，父项保持未勾选。
  - 2026-09-30 DSA 目标运行层：官方 `update.sh dsa` 构建并以宿主进程环境注入 HiThink Key，`sync-code.sh dsa` 补入构建启动后的旧 URL 修复。容器关键源码摘要与宿主一致，三服务健康；目标 V3 鉴权/握手及旧 V1 POST 404 已核对。该补丁仍位于容器可写层，镜像重建会失去它；真实 RouteAdmission、运行/客户端与不可变镜像验收继续开放，见[DSA 目标证据](evidence/2026-09-30-canonical-dsa-target-runtime.md)。
  - 2026-09-29 本次三仓源码更新尝试在官方 `update.sh all` 的主仓镜像构建阶段遇到宿主磁盘耗尽，DSA 镜像虽构建完成，数据库升级与服务启动均未发生；[失败边界](evidence/2026-09-29-canonical-update-all-disk-blocked.md)不能计作当前代码的目标运行态验收。
  - 2026-09-27 数据库前置阻塞已解除：官方保留数据升级完成，真实备份恢复演练、四项增量事务、68 表与权限检查通过；Server/Worker/DSA/Redis healthy，健康 API 与 DSA V3 协议检查通过。见 [升级任务与证据](../archive/tasks/2026-09-27-preserve-data-database-upgrade.md)。完整 G-Deploy 的其余依赖及业务验收仍需独立核对，保持未勾选。
  - [x] G-Deploy-159516：首条真实普通回测的目标运行态门禁；仅验收该精确路由所需版本、结构、策略与准入，父项其余范围继续开放。
    - [x] G-Deploy-catalog-revision-64：真实目标 Catalog revision 超过 32 位，Server `MarketBarWindowEvidenceV3.catalogRevision` 的 Prisma `Int` 与 PostgreSQL `INTEGER` 使 68 日行情读后无法冻结。新增保留数据 migration 将该列升为 `BIGINT`，Prisma 保持精确读写、HTTP 仍使用安全整数；同步 migration matrix、runtime 打包输入与部署门禁。定向持久化测试、Schema validate、隔离 PostgreSQL 升级及本地 Server 构建通过；infra 官方入口保留数据升级和相同准备请求通过。[修复与部署证据](evidence/2026-09-28-cont-159516-catalog-revision-bigint.md)。原 migration 未改，旧数据保留。
    - 启动依赖：D01-window-contract/execution/verification/wire/consumption 与本次配置所用 S07/S08/S09/I01 的局部接线证据有效，F01 兼容组合已核对，受影响源码/包级及 DSA 官方离线门禁满足项目升级前置；若输入未变，复用已通过的高成本检查。
    - 验收依赖：`G0-H-target` 的来源事实已经成立；目标策略只授权该事实所证明的精确目标、窗口和口径。
    - 执行与完成：按 infra 官方入口及实际依赖变化选择最小更新目标；核对目标 Server、全部 Worker、DSA 的运行源码与协议，全部 migration、预期表和 app role，以及 `159516.SZ` 的当前 Desired/Effective/Catalog、授权目标、价格口径和读取前后准入。实际请求按五年分窗规则规划为一个窗口，故本目标验收真实单窗口读取/冻结/重放；`D01-runtime` 的两窗口受控合同在同版本另行验证。不得把真实单窗口说成真实多窗口或把快更说成镜像更新。
    - 验证：旧 DSA 离线失败的历史记录保留；新完整 Schemas 隔离输入的当前源码官方门禁已通过，见[续验](evidence/2026-09-28-cont-dsa-schemas-isolated-gate.md)。目标 Server/Worker 由[官方保留数据更新](evidence/2026-09-28-cont-159516-catalog-revision-bigint.md)启动，DSA 经官方 `sync-code.sh dsa` 更新运行层，三者健康；[D01 同版本核对](evidence/2026-09-28-cont-d01-target-runtime.md)、[精确准入](evidence/2026-09-28-cont-g0-h-159516-target-admission.md)及[真实冻结/重放](evidence/2026-09-28-cont-159516-first-real-run.md)共同覆盖本目标。Server Desired/Effective revision 29 已应用且不 stale，目标 Catalog 有效；DSA 镜像仍需后续正式更新，不作为本次运行层验收之外的发布证据。
  - 依赖：I01、G-Math、G-Legacy、D02、F01、F02、受影响包与仓库门禁通过；所有者：部署执行者。
  - 环境/入口：K-Infra 的受支持更新脚本，先记录容器/代码/Schema head，再选择最小目标与正确更新路径；新 Schema 需先通过 S02 的隔离升级。
  - 通过：实际 Server/全部 Worker/DSA 版本兼容、结构完整与 app role 正确、无缺表/入口错误；schema marker 单独相等不能代替完整检查。
  - 阻塞：默认保留数据；若当前入口不能安全完成升级，保留未勾选并制定保留数据路径，不自行清库或删除 volume。

- [x] G-Run：HiThink 159516 普通回测与重放。
  - 2026-09-27：目标服务已恢复健康，Data/Control V3 及独立鉴权通过；原标的/区间的 HiThink qfq 读取首次及两次重试均因 `NO_ELIGIBLE_PROVIDER` 拒绝，真实目录尚未准入。本轮跳过正向回测，门禁保持未通过，见 [目标运行态验收](evidence/2026-09-27-target-runtime-gates.md)。
  - 2026-09-28：管理人公告与公开源目标行核对出 07-09 登记、07-10 除权的 1:2 拆分，可能预热的 03-27/30 另有 1:2 拆分。真实运行须证明拆分事件覆盖、策略时钟可见性及实际 HiThink 价格坐标上的不漏记/不重复调整；当前证据不关闭 G-Run，见 [事件交叉核对](evidence/2026-09-28-cont-m22-159516-splits.md)。
  - 首条回测启动依赖：`G0-H-target`、`G-Deploy-159516`、本次配置所需的 S07/S08/S09/I01 证据；原 `G0-H` 与 `G-Deploy` 父项继续承担全部既定范围的验收，不以本次 Run 勾选。
  - 所有者：普通回测验收执行者；环境：目标运行态与真实已授权 HiThink。
  - 覆盖 AC17：159516.SZ、2026-05-16..2026-08-09、按实际策略确定预热，从正式 API 创建到成功终态、查询交易明细和重放。
  - 证据：真实响应指纹/请求范围、Run ID、Snapshot/价格协议/来源与版本、结果/交易、离线重放一致性；保留不调用独立事件表也能完成适用归一化运行的证据。
  - 验证：[首条真实普通回测证据](evidence/2026-09-28-cont-159516-first-real-run.md)记录 v1 绝对价格规则被拒绝、普通 draft v2 的同坐标规则、正式 API 与目标界面两条旧版成功 Run、完整冻结 Snapshot、11 笔交易和 22 次成交、独立重放校验值一致。[新版本完整结果](evidence/2026-09-28-cont-159516-versioned-benchmark.md)使基准和超额收益可用；严格 PIT、真实收费与实际份额没有验收。
  - [x] G-Run-benchmark-calendar-alignment：日线 Bar 时间戳与收盘估值时点按交易日对齐。真实目标 Bar 的 `occurredAt` 为 UTC 午夜，权益估值为上海 16:00；同日且来源可决策时间不晚于估值时才配对，重复/缺失/晚到继续拒绝。Benchmark/Runner 引入新约定及 ID，旧 Snapshot 仍由旧 Runner 得到原校验值；新 Run `e2195b91-4cff-4dc5-9db2-0df01cf43d83` 使用新 Runner，基准/超额收益可用，业务结果 complete 且重放校验一致。[版本化修复与目标证据](evidence/2026-09-28-cont-159516-versioned-benchmark.md)。
  - 阻塞：目标覆盖、凭据或有效价格失败保持原标的/区间未通过，不换标签或 fixture 补齐。

- [x] G-UI：共同价格目标 Web 界面验收完成；沿用既有非法提交验收和当前回归。Electron、原始 CDP 网络采集不计作通过。
  - [x] G-UI-159516：以 `G-Run` 已成功的同一真实 Run 验收首个交付的界面路径；其余口径、主备和市场组合仍由本父项验收。
    - 启动依赖：`G-Run` 已通过，本次交互所需的 U01/U03/U05、S01/S07 接线已有适用证据；实际目标浏览器或 Electron 可访问同一运行态。
    - 完成：用户从现有界面选择 HiThink ETF qfq 与适用模型，看到来源、预检、归一化单位、固定快照研究及拆分/分红处理说明，创建并查询该 Run 的成功终态、交易明细与重放标识；保存/取消、失败和晚到状态符合本次路径，直接 API 非法提交被服务端拒绝。
    - 验证：[真实界面路径](evidence/2026-09-28-cont-159516-first-real-run.md)记录目标 Web 配置、预检、来源/冻结时间、创建、成功终态、交易/来源/重放标识；[最终完整结果与截图](evidence/2026-09-28-cont-159516-versioned-benchmark.md)中的界面 Run `e2195b91-4cff-4dc5-9db2-0df01cf43d83` 与 `G-Run` 同一条。取消不落新任务、保留的 v1 失败状态可见、篡改准备配置在同环境 HTTP 409 且不落库；Desktop 相邻 23 项、typecheck/build 与目标浏览器展示通过。
  - 依赖：U01–U05、S01、S07、G-Run；所有者：Desktop 验收执行者。
  - 环境/入口：实际浏览器或 Electron 的既有路由、行情及回测页。
  - 覆盖 AC19：三口径各自主备、HiThink 限制/缺凭据原因、预设预览、旧 raw 模型变更确认、图表不改 frozen Run、结果实际来源；同环境直接请求验证服务端拒绝非法配置。
  - 证据：页面操作与网络/API 结果；组件测试或前端 build 不代替此门禁。
  - 2026-09-29 图表入口仍受目标目录身份阻断：`159516/SZ/ETF` 旧记录 inactive，目录 stale、真实同步 Job `catalog_all_providers_unavailable`，搜索为空且 chart-options HTTP 400。普通 Run 与 AI 实验成功不替代 U04 图表验收；见[目录阻断证据](evidence/2026-09-29-cont-159516-chart-catalog-blocker.md)。

- [x] G-AI：真实 AI 实验全链路。真实 LMStudio 成功实验、封存比较与冻结重放，目标格式失败反例，以及目标 Server 至真实 LMStudio 的脱敏出站请求边界均已核对；见[成功与重放](evidence/2026-09-28-cont-159516-ai-sealed-experiment.md)、[格式失败](evidence/2026-09-29-cont-159516-ai-format-failure-target.md)和[真实请求边界](evidence/2026-09-29-cont-159516-ai-lmstudio-request-boundary.md)。此门禁只覆盖 AC14 的 AI 全链路，不代替严格 PIT 或全局 AC01–AC20。
  - 依赖：A01、A02、G-Run；所有者：AI 验收执行者；环境：目标运行态、已授权可用模型、冻结市场输入。
  - 覆盖 AC14：基线→候选→服务端计算→比较→封存阶段，模型不可更改数据协议；核对无封存反馈泄漏、格式失败独立分类、重放版本一致。
  - 证据：实验/候选/Run 引用、脱敏模型输入边界与结果分类；模型失败记录在本门禁，不把普通回测改为失败，也不把 AI 宣称通过。
  - [x] G-AI-selection-visibility：目标实验 `0830412c-6aa6-4608-b0fd-3a59c7c50763` 的候选读模型在揭示前将编码测试终态的 `validationStatus` 投影为 `restricted`；界面现依公开的开发／验证有效性显示锁定操作，服务端仍按持久化状态复核。真实锁定和封存测试完成，未测试候选状态文案已更正；定向 5 项、Lint/格式、Desktop build 与目标页面通过。候选、基线、8 个 Run 和剩余门禁见[真实 AI 实验证据](evidence/2026-09-28-cont-159516-ai-sealed-experiment.md)，不将此叶视为 `G-AI` 总验收。
  - [x] G-AI-target-success-replay：同一真实实验在目标 LMStudio 上 2 次模型调用成功，基线／两候选开发与验证、单候选封存测试共 8 个 Run 成功；逐 split 数据协议、可比较指纹与执行版本一致，目标 Worker 从冻结 Snapshot 只读重放 8/8 校验值相同。候选测试收益及回撤弱于基线，未采纳。见[真实 AI 实验证据](evidence/2026-09-28-cont-159516-ai-sealed-experiment.md)。
  - [x] G-AI-format-failure：目标受控 Provider 返回完整但不符合 schema 的响应；持久化 `optimization_schema_invalid`、1 次调用和 13/5 token，终态 `model_format_failure`，无候选回测；开发／验证基线和既有普通 Run 保持成功，目标界面正确显示。见[目标格式失败证据](evidence/2026-09-29-cont-159516-ai-format-failure-target.md)。
  - [x] G-AI-real-request-boundary：目标 Server 经临时透传 Provider 向真实 LMStudio 发起优化调用，代理对实际请求只保存脱敏结构与 SHA256；负载只有授权参数及开发／验证摘要，无封存行情、事件、测试结果或未来元数据。模型返回后实验完成 1 个候选、6 条完整 Run 和封存比较。见[真实请求边界](evidence/2026-09-29-cont-159516-ai-lmstudio-request-boundary.md)。

## 9. M2：其他行情口径与事件能力

- [x] M2-source-prerequisite-review-1002：完成跳过 AKShare/EastMoney 后的剩余来源前置盘点：首次核对时 Tushare/RQData 目标凭据未配置，已有本地接线不重做；HiThink 进度码、因子基准和事件覆盖仍缺。通达信候选 wheel 下载超时，M34-sdk-preflight 未完成。Tushare 后续已按用户要求完成页面配置 API 保存，见下一叶；只有本次盘点勾选，第二优先级真实来源和父项保持开放。见[剩余来源前置证据](evidence/2026-10-02-priority2-provider-prerequisites.md)。
- [x] M2-tushare-page-config-target-1002：按用户授权把 zsh 已有 Token 经前端同一 Server 配置接口保存到目标 DSA；HTTP 201，registry 读回 source=control/configured=true、configVersion=3，目标密文存在且实际快照可读。三个基金接口用目标保存的凭据各一次 HTTPS 请求，均 HTTP 200/40203，未取得数据行；完成配置 API 与权限诊断，不完成浏览器验收或来源准入。见[配置与权限证据](evidence/2026-10-02-tushare-page-credentials-target.md)。
- [x] M2-tdx-free-package-probe-1002：完成无需 Key 的官网盘后包两日可行性验证，支持 Spec §4/AC09/AC20 的前置调查。目标 DSA（Linux ARM64）匿名直连 `g4day/20260709.zip`、`g4day/20260710.zip` 各一次，均 HTTP 200，约 2.7 MB/包；ZIP CRC、市场结构、代码/序号唯一性、有限数和目标 OHLC 检查通过，两包均命中 `159516.SZ`/`510300.SH`。请求预算为单次 35 秒、8 MiB，ZIP 单项 32 MiB/合计 96 MiB/最多 32 项，无重试、重定向或代理轮换，内存解析且不执行第三方代码。日期仅到包级，ETF 量额单位、完整长窗、复权因子和公司行动未准入。仅完成调查叶，未改生产代码或部署，父项及真实回测门禁保持开放；见[实际验证](evidence/2026-10-02-tdx-free-access-validation.md)。
- [x] M2-tdx-client-preflight-1002：完成官方条件与实际环境只读核验。标准应用目录和 Spotlight 未发现宿主通达信终端，目标缺 `tqcenter` 和对应进程；官方文档未明确客户端模式的 macOS/Linux aarch64 支持或目标数据免费资格。当前路径缺运行前提，未安装、登录或取数。此勾选仅表示前置调查完成，不能替代客户端运行或行情验收；见[实际验证](evidence/2026-10-02-tdx-free-access-validation.md#客户端路径前置核验)。
- [x] M2-astockdata-free-probe-1002：完成固定版的三次匿名来源验证及现有合同核对。目标 `159516.SZ`、`2026-04-30..2026-08-09` 的腾讯 none/hfq 各取到 68 行，拆分前后 hfq/raw 为 2→4，两日 raw OHLC 与既有盘后包一致；但旧 `fqkline/get` 六列缺原生成交额，现有精确路由/分页证明要求 `newfqkline/get` 九列，ETF 清单尚无 hfq，因此本轮不能直接接入。新浪因子算法取到拆分前后 `f=1`，同样不适用。按用户条件，**本次 a-stock-data ETF 回测接入为 TODO／合同不满足／当前跳过**，保留成功取样，不关闭来源父项或改变生产接线；见[免费接口实测与停止点](evidence/2026-10-02-astockdata-free-path-validation.md)。

2026-10-03 接续：用户追问改造后，腾讯十列原生 HFQ 已恢复推进并完成下述适配叶；上面的旧六列接口停止记录保留为历史证据。通达信付费后台、其他已暂停来源与第二优先级父项状态不变。

2026-10-03 用户决策：若候选来源完成合理验证后仍只有 HiThink 能适配，判定现行准入限制过严并减少限制；按策略实际需要区分基础价格研究与事件、真实份额、量价混合及严格 PIT 能力。此判断已写入 Spec §5.2，不能以当前只有一个 ready 直接宣布其他来源永久不适配。

- [x] M2-tencent-hfq-admission-review-1003：继续腾讯 HFQ，先核对现行拒绝条件是否属于基础价格回测的必要条件，再对目标窗口、跨窗价格基准和可复用量额证据作有界验证。目标只读请求限 `159516.SZ`、hfq 的 `2026-04-30..2026-08-09` 与 `2026-07-06..2026-07-17` 两窗，各一次、25 秒、1 MiB，无重试或切源；同次内核对独立交易日集合、有效 OHLC/量额、分页证明、重叠行与已记录拆分两日样本。输出明确可满足的条件、真正阻塞及需要收敛的通用门槛；不把“完整供应商能力”作为单一价格路径的前置。本叶为来源准入准备审查，真实准入写入和目标回测另立依赖就绪的叶。 完成证据见[本轮准入与目标验收](evidence/2026-10-03-tencent-hfq-price-research.md)。
- [x] M2-admission-design-calibration：以 HiThink/腾讯共同能力收敛门槛，取消基础价格人工窗口准入、专用日级元数据和算法等价证明前置；真实双源路径已完成。
- [x] M2-tencent-hfq-price-research-admission-1003：依赖本次窗口/口径审查；仅签发 `tencent/tencent × CN ETF DAILY_BAR 1d hfq`、`159516.SZ`、`2026-04-30..2026-08-09` 的短期价格研究准入。内容寻址证据先写入并读回校验，再绑定当前适配/来源修订与无凭据事实，最多有效 7 日。沿用已有 Control V3 路由流程，保留原策略并追加精确 HFQ 目标；真实 Data V3 正向仅一次、越界反例一次，不切源或自动重试。保留 `volumeBasis=unknown`、未声明量额单位、供应商定义的分红语义与不可逆转换，其他依赖这些事实的功能继续使用既有兼容检查。目标来源 HTTP 验收与 Server 回测正向验收分开记录。 完成证据见[本轮准入与目标验收](evidence/2026-10-03-tencent-hfq-price-research.md)。
- [x] M2-policy-retained-unavailable-routes-1003：腾讯来源准入后发现 Server 原 Desired revision 32 含尚未就绪的净值路由，整份配置校验会阻止保留它并新增 HFQ；DSA 已按本轮验证临时推进至 revision 33，需经 Server 正式入口完成一致性收敛。对应 Spec §5.2，仅对上一份成功 Effective 中保持原 RouteKey/目标顺序的既有路由允许保留暂不可用配置；新增/改变、全局重新启用、目录不完整和适配缺失仍拒绝。写入限 Server market 的目录验证 helper/调用接缝及专属测试；先定向和包级检查，再按官方入口同步 Server，最后通过正式 policy API 保留原两条路由并追加 HFQ，核对 Server/DSA revision、旧不可用目标及新就绪目标。不得删除原净值配置或绕过执行端准入。 完成证据见[本轮准入与目标验收](evidence/2026-10-03-tencent-hfq-price-research.md)。
- [x] M2-tencent-hfq-server-run-replay-1003：修复后腾讯 HFQ 正常准备、创建、Worker 成功及冻结重放完成，Run f66b82b3-ac55-4046-b8a2-2da33b823af4；旧失败和预算由本轮新实现接续。
- [x] M2-tencent-complete-bar-tradability-adapter：公共日级状态适配完成，完整/缺日/分页/重复/价格回归及腾讯真实 qfq/hfq 回测通过；见 C01–C03。

- [x] M2-tencent-native-hfq-feasibility-1003：完成 DSA、公共 Bar、Server 与 Desktop 消费合同核对，以及目标 `newfqkline/get` 匿名 HFQ 验证。首次探针窗口检查过严，按既有解析器筛掉窗外行后仅补验一次；两次各限 25 秒/1 MiB，无自动重试或切源。补验原生 `hfqday` 在固定 159516 窗口有 68 行，均十列并含原生成交额。可以只扩 DSA ETF HFQ 适配，不需改公共 Schema 或主仓消费者；来源准入、单位、覆盖及回测验收仍开放。对应 Spec §4–5、AC09/AC20，见[可行性与实测](evidence/2026-10-03-tencent-hfq-adapter.md)。

- [x] M2-tencent-native-hfq-adapter-1003：腾讯 ETF hfq 最小适配与目标读取已完成，对应 Spec §4.1、§5、AC09/AC20；仅扩 DSA 精确入口、库存/独立修订与测试文档。未新增 Provider、公共 Schema 或主仓消费者改动，未授予真实来源准入。见[实施与验证证据](evidence/2026-10-03-tencent-hfq-adapter.md)。
  - [x] 解析与执行：ETF 精确入口接受 hfq，只读原生 `hfqday`；缺量额、错误口径或来源仍拒绝。STOCK HFQ 不开放，年度分段、预算与 none/qfq 行为保持。
  - [x] 消费与回归：Control/adapter inventory/revision 一致登记独立 hfq，none/qfq 准入不能满足 HFQ。定向 120 项、局部编译/lint 通过；官方 `ci_gate.sh all` 为 7732 passed、1 skipped、4 deselected，626 subtests passed。首次因 PATH 未包含 `.venv/bin` 停在 flake8，修正环境后完整通过，未安装依赖。
  - [x] 目标运行态：官方 `sync-code.sh dsa` 兼容性预检与同步通过，五个生产文件摘要一致，目标 healthy；Control 目录 complete、唯一 ETF HFQ 条目为 `not_admitted`。目标当前未配置精确路由，执行以 `NO_ELIGIBLE_PROVIDER` 拒绝且来源调用为 0；新 Fetcher 独立一次实际读取固定窗口 68 行、原生量额与分页摘要通过。仅同步容器可写层，镜像不变；真实 G0-M 和回测正向验收仍开放。

M2 与 M1 共用契约，可在契约就绪后开展；无需等待 M1 全部界面验收。下表每一行是一个独立叶子，初始未开始。公共入口 K-DSA；写入仅限该来源/能力的适配器、manifest、测试和 DSA 文档。依赖 P02、C04 及对应 G0-M 子包；缺账号仅允许已知契约 fixture，真实启用必须先通过该单元 G0。全部使用 V-DSA；遇到多个独立协议/消费者必须按行号拆子任务，不扩大单次交付。

2026-10-02 执行调整：按用户要求，将 AKShare、EastMoney 在本节尚未完成的行情与事件验收统一标记为 **TODO／暂不可用／当前跳过**，涉及 M21、M22、M23 及其未完成子叶。保留已完成子叶和原始证据，不关闭父项；本轮不再请求这些来源、不推进其生产准入。此标记用于当前 M2 验收与执行顺序，不改动既有目录能力或运行时配置。恢复时须有新的来源可用性与完整合同证据。第二优先级接续从 M24/M25/M26 的账号及逐接口权限前置核对开始；既有 40203 权限拒绝在账号或权限未变化时继续跳过，不重复请求。

| 状态 / 任务 | 具体交付与局部通过断言 | Spec / AC |
| --- | --- | --- |
| [ ] M21 | **TODO／暂不可用／当前跳过**：AKShare/EastMoney 三口径行情元数据校正：原生口径、实际同源身份、范围/单位准确，不能把二者当独立备用 | §4、§8 / AC02、AC11、AC20 |
| [x] M21-a | 精确端点及原生字段单位随 DataFrame 保留：股票手/元、ETF 未知，三口径独立、同源身份 eastmoney，数值不隐式转换；8 项定向及相关回归合计 36 项通过。后续单位消费/ETF 证据与真实准入仍开放，见 DSA 来源门禁 2026-09-27 补充 | §4、§8 / AC02、AC11、AC20 |
| [x] M21-b | 来源事实可选 fieldUnits 契约、DSA 完整窗口/图表同源字段投影及 Server 冻结消费；旧缺省不补单位、ETF 未知不外推、单位改变影响身份。DSA 54 项、Server 完整快照及身份 10 项与单位落盘重放 1 项通过；先消费者契约再生产者，目标部署另验，见来源字段单位证据 | §5、§8 / AC02、AC11、AC20 |
| [ ] M21-c-target-window | 2026-10-02 第二优先级首叶：目标安装版AKShare 1.19.1的精确 `fund_etf_hist_em` 请求合同已核对；固定159516.SZ、2026-04-30..2026-08-09，逐口径核对完整68个交易日、原响应身份、量额与独立深交所来源。每口径首次至多一次、20秒外层硬期限；首次网络失败时暂停同端点后续口径，不重复旧四日样本的盲重试预算。只读来源及运行态，不改策略/准入/Run；来源条件满足后再建立必要适配修复叶 | §4、§8 / AC02、AC11、AC20 |
| [x] M21-c1-target-observation | 目标159516.SZ长窗的none/qfq/hfq首次均HTTP200，各68条唯一日期，原文代码159516/market0与请求0.159516及fqt0/1/2匹配；三口径量额总和相同。深交所独立68日日期集合与日历一致，量总和完全匹配、额相差1.74元。完成本次来源观测，不授予逐日单位、算法、稳定性或准入；见[第二优先级首叶证据](evidence/2026-10-02-priority2-m21-source-window.md) | §4、§8 / AC02、AC11、AC20 |
| [ ] M21-c2-unit-basis-verification | 三口径逐日原文与独立来源对账、完整日期集合比较、长/短窗重叠价格坐标及修订验证；2026-10-02有依据的核对请求在首次none处ConnectionError，同端点qfq/hfq暂停，不再请求。网络稳定后须先固定原文和期限预算；聚合总和不能替代逐日单位、复权锚点或连续来源证明 | §4、§8 / AC02、AC11、AC20 |
| [ ] M21-c3-scoped-consumption | 依赖c2合格事实；单位断言绑定精确标的、窗口、来源/适配修订，并核验实际响应身份。只在必要接缝实施且先定向验证，再按官方infra入口做目标HTTP、准入和冻结消费；现有ETF fieldUnits仍unknown、三口径not_admitted | §5、§8 / AC02、AC11、AC20 |

2026-10-02 M21-c2续接预检：上轮组合探针的统一异常出口未保留失败阶段，`ConnectionError`不能可靠区分目标价格读取和随后目标容器访问深交所。现按用户“继续”授权建立一轮有界证据获取：价格在目标DSA读取，深交所在宿主独立读取，分别保留阶段/原字节/摘要；固定原长窗及07-06..07-13重叠拆分短窗，每口径每窗最多一次、20秒外层硬期限，任一价格失败暂停同端点剩余请求。深交所单次15秒、2MiB上限；无重试、代理轮换或来源轮换。离线以Decimal逐日核对单位、日期、量额一致性和长短窗坐标，成功观测不自动签发准入或复权转换资格。写集为本Task、DSA来源证据说明及本叶原文/核验产物，生产源码与策略只读。

M21-c2本轮结果：新探针明确在 `eastmoney_http`、尚无原响应时ConnectionError，剩余价格请求全部暂停；宿主独立深交所原文已固定到 `/private/tmp/priority2-m21-c2-capture.json`，SHA-256与前轮一致。旧组合异常的失败端点仍无法反推，本次只确认新请求的失败阶段。接续转到独立事件前沿：M22-c3原文及映射复核，预算与交付如下。

- [x] M22-c3-source-revalidation：目标DSA固定159516.SZ、2026-01-01..08-09，现有Reader首次完整读取成功：1页/83行、两条目标观测，分页及providerRevision与既有证据一致；两份独立管理人实施PDF首次读取均200，原字节摘要匹配。已形成[精确映射草案](evidence/2026-10-02-m22-159516-split-mapping.json)，原文SHA-256 `b1a4f03f94faf27acf95d2bef9d508ec06eabec1280e04c921bb677154f5fe8e`；真实观测在隔离离线审核上下文中经现有resolver输出正确除权日期，不生成历史可见性，31项相邻守卫通过。未写生产准入，完整覆盖/目标事件HTTP/冻结门禁继续开放，见[续接证据](evidence/2026-10-02-priority2-m21-m22-continuation.md)。
| [ ] M22 | **TODO／暂不可用／当前跳过**：AKShare/EastMoney ETF 拆分：折算日与生效日有明确映射依据；无法核实则缺失，不猜测 | §4、§9 / AC08、AC20 |
| [x] M22-a | 从独立管理人公告固定 159596.SZ 的 2025-10-17 日终 1:2 拆分正样本；登记日终与开盘生效不能等同，来源行和价格坐标映射待验，见 ETF 拆分日期独立正样本证据 | §4、§9 / AC08、AC20 |
| [x] M22-b | 标准化 fund_cf_em 结构化观测，保留源日期、类型、十进制比例及观测时间；未知生效阶段不生成执行事实，不把空集当完整覆盖；16 项测试及 lint 通过，有界读取与真实日期映射后续独立验收 | §4、§9 / AC08、AC20 |
| [ ] M22-c | 有界读取 fund_cf_em 精确来源行并核验独立公告的日期映射；仅在生效阶段及价格坐标切换获得证据后接入执行事件与真实准入 | §4、§9 / AC08、AC20 |
| [x] M22-c1 | 有界拆分读取器、安全 JSON/Decimal、跨年总页预算和分页一致性；与分红共用端点传输，59 项回归通过。真实单页核实 159596 在 2025-10-17 每份折算 2，未证明日内阶段，未授予执行准入 | §4、§9 / AC08、AC20 |
| [x] M22-c2 | 管理人实施公告独立明确 159596 登记日 2025-10-17、交易除权日 2025-10-20；与源日期及比例逐项对照，修正规格中映射证据要求，未回填历史可用时间 | §4、§9 / AC08、AC20 |
| [ ] M22-c3 | 将逐事件的标的、源日期、比例、除权日及公告引用作为映射证据校验后消费；范围错配、缺证据及历史可见性不满足继续拒绝，真实准入与覆盖单独验收 | §4、§9 / AC08、AC20 |
| [x] M22-c3-validate | DSA 日期映射原字节摘要绑定当前拆分准入，严格核对逐事件标的/日期/比例、作用范围及公告摘要；补充观测而不回填历史可用时间，15 项测试通过；运行时受控证据存储接线仍待父叶完成 | §4、§9 / AC08、AC20 |
| [x] M22-c3-store | 内容寻址映射证据存储，原子发布、同摘要不覆盖、读取复核、大小上限和路径/符号链接拒绝；7 项存储测试及 15 项映射回归通过，事件入口接线仍开放 | §4、§9 / AC08、AC20 |
| [x] M22-c3-runtime | DSA 拆分精确库存及独立修订、当前准入绑定的本地存储加载、按源日期扩大读取边界、映射后保留实际观察时间；真实 SQLite 执行路径与来源准入回归 58 项通过，目标部署和完整快照证据冻结另验 | §4、§9 / AC08、AC20 |
| [x] M22-c3-freeze | 映射原文随事件响应跨服务传输，在线选择及离线冻结验证原文摘要和逐事件关联；Parquet 及合成完整快照经新 Store/V3 Runner 重放一致，篡改和不完整覆盖拒绝；真实覆盖仍未通过 | §4、§9 / AC08、AC20 |
| [x] M22-followup-calendar | Server 冻结及重放回归通过，DSA HTTP 日历端点已独立支持有界后续结算范围；配对任务 C6 的本地回归、官方同步和目标 HTTP 正反例通过。真实来源回测与日历历史可见性仍归各自门禁 | §5、§9 / AC08、AC20 |

结算日历缺口已确认存在于实际计划和请求校验，配对实施入口为 [结算日历 Task](2026-09-27-backtest-settlement-calendar.md)；须保留旧快照身份与重放，不直接扩大既有冻结合同。
| [ ] M23 | **TODO／暂不可用／当前跳过**：AKShare/EastMoney 分红与必要公告日期索引：生效/派息/可见时间分开，缺日期保留未知 | §4、§9 / AC04、AC08、AC12、AC20 |
| [ ] M24 | **TODO／当前免费版本不支持／当前跳过**：Tushare ETF 原始日线：手→股/份、千元→元转换及分页覆盖正确，权限逐接口报告 | §4 / AC02、AC09、AC20 |
| [ ] M25 | **TODO／当前免费版本不支持／当前跳过**：Tushare 复权因子：版本/基准/可转换关系明确，因子不是完整事件表 | §4、§8 / AC10、AC20 |
| [ ] M26 | **TODO／当前免费版本不支持／当前跳过**：Tushare 基金分红：日期/现金单位与修订事实保留；只有生效事实不能提前用于信号 | §4、§9 / AC04、AC08、AC12、AC20 |
| [ ] M27 | **TODO／付费后台免费资格未确认／当前跳过**：TdxAiData 行情，保留口径与查询窗口绑定、关闭无标记补 Bar、ForwardFactor 不直接冒充准确逐日因子的验收要求 | §4、§8 / AC02、AC09、AC10、AC20 |
| [ ] M28 | **TODO／付费后台免费资格未确认／当前跳过**：TdxAiData 权息，保留与行情分开准入及事件类型/日期/单位、缺失字段要求 | §4、§9 / AC03、AC04、AC08、AC20 |
| [ ] M29 | RQData 拆分：除权日/比例可用于生效记账，但无公告时点不能用于提前事件信号 | §4、§9 / AC03、AC08、AC12、AC20 |
| [ ] M30 | RQData 分红：登记/除息/派息日期分别保存，不能推断完整历史修订或公告可见性 | §4、§9 / AC04、AC08、AC12、AC20 |
| [ ] M31 | HiThink 基金分红：独立 endpoint 权限与日期/单位映射，不成为无事件依赖 qfq 的硬前置 | §4、§9 / AC04、AC08、AC20 |

M31 拆分执行：

- [ ] M31-a：**扩展/当前跳过**。每 10 份金额换算、独立日期及不完整覆盖的离线映射已实现；原官方示例 `progress="实施"` 下测试通过。真实 `510300.SH` 14 条均返回字符串 `"2"`，官方未提供该枚举含义；标准化器已改为对未知进度失败关闭，不能把本地示例通过计作真实字段映射完成。当前含反例与相邻分红 77 项通过，剩余需可信进度码字典或逐事件可审核的等价证据；见 [离线证据](evidence/2026-09-28-cont-m31-hithink-dividend-normalization.md)与[真实字段差异](evidence/2026-09-28-cont-m31-live-progress-drift.md)。
  - 2026-09-29 一次显式 `fund_type=exchange` 对照仍为 14 条 `progress="2"`；请求参数差异不能解释数字码，M31-a 不因此勾选，详见[真实字段差异](evidence/2026-09-28-cont-m31-live-progress-drift.md)。
- [ ] M31-b：**扩展/当前跳过**。精确端点读取、真实权限、标的与币种核验、完整历史覆盖和事件 V3 准入/冻结消费；目标环境及独立公告验收另按 G0-H/G-M2-Events 执行。M31-a 的离线标准化不能完成本叶。
  - [x] M31-b1：DSA 已为单个完整 `thscode` 增加有界分红端点读取；凭据仅写请求头，禁止重定向和隐式重试，限制响应字节与条数，校验 HTTP/业务状态、JSON 重复键和返回计数，保存实际响应摘要与观测时间。注入 HTTP 响应与标准化接缝离线测试新增 16 项，随后真实 `510300.SH` 两次只读响应均为 14 条且计数相符；当前相邻分红合计 77 项通过，限定 flake8、py_compile 通过。只证明单次请求的传输合同，不提升为历史全量覆盖；见 [M31-b1 读取证据](evidence/2026-09-28-cont-m31-hithink-dividend-read.md)与[真实字段差异](evidence/2026-09-28-cont-m31-live-progress-drift.md)。
    - 2026-09-29 按官方当前合同增加显式 `fund_type`，出站前拒绝与完整代码后缀不匹配的基金类型；带 `exchange` 的一次真实只读对照仍返回 14 条 `progress="2"`。本地传输/标准化/候选合同验证见[后续证据](evidence/2026-09-29-cont-m31-hithink-dividend-contract.md)，M31-b1 的历史覆盖和真实事件门禁边界不变。
  - [ ] M31-b2：**扩展/当前跳过**。调用 M31-a/b1 并接入精确来源库存、实际准入、币种/标的核验和事件 V3 冻结消费；真实权限、历史覆盖、公告对照仍归 G0-H/G-M2-Events。
    - [x] M31-b2-contract：固定 HiThink `CN/ETF/CASH_DISTRIBUTION` 单一精确来源 ID、真实凭据 HMAC 修订、来源/适配版本与 manifest；先建立不可执行合同及拒绝测试，随后在 M31-b2-runtime 接线时同步开放库存、Control/目录与生产执行，避免“目录 ready 但回落其他来源”。
      - 2026-09-29 前置合同已落地：精确身份、修订和 HMAC 拒绝 13 项通过；此阶段未登记 manifest/库存，生产路由保持不可选；见[候选合同证据](evidence/2026-09-29-cont-m31-hithink-dividend-contract.md)。随后完成的 DSA 接线见[事件路径证据](evidence/2026-09-29-cont-m31-hithink-dividend-dsa-runtime.md)。
      - 2026-09-29 增加独立 ETF 身份/币种原文的纯校验：准入绑定原始字节摘要、精确标的与日期、观察时刻、HTTPS 文件地址及文件 SHA-256，重复或越界拒绝；21 项定向测试通过，详见[身份原文证据](evidence/2026-09-29-cont-m31-hithink-dividend-identity-evidence.md)。随后接通运行时当前凭据和 Server 冻结消费；真实来源准入仍需审定原文。
    - [x] M31-b2-runtime：从当前准入和同一凭据快照读取前后复核策略、目录、准入与撤销；调用有界 HiThink 读取器和严格进度标准化，核对完整标的、ETF 身份及独立币种依据。未知 `progress="2"`、缺身份/币种、历史覆盖不明时失败关闭或返回不完整覆盖，不生成可消费的伪完整事件；Server 冻结保留来源、日期与实际观测时刻。本叶的勾选仅代表本地执行和消费合同，目标验收另见 M31-b2-target。
      - 2026-09-29 新增内部读取编排：身份原文先于凭据，环境 Key 与主密钥 HMAC 固定为单次不可变快照，读后复核准入、原文、凭据与冻结时刻；调用有界读取器及严格标准化，保留内容指纹和不完整覆盖。10 项合成正反例通过，见[内部读取证据](evidence/2026-09-29-cont-m31-hithink-dividend-mapped-read.md)。随后接通 DSA 事件入口与策略/目录。
      - 2026-09-29 Server 已加入独立 `hithinkIdentityEvidence` 协议校验，并在在线选择、离线 Snapshot 复核原始字节摘要、精确时刻、ETF 身份和分红币种；合成 Parquet 冻结读回通过，未知完整覆盖继续拒绝。见[Server wire 证据](evidence/2026-09-29-cont-m31-hithink-dividend-server-wire.md)。DSA 事件库存、策略/目录及鉴权执行入口随后接通，86 项相邻定向测试及 DSA→Schemas/Server 合成协议验证通过；隔离 DSA 官方离线门禁 7527 passed、1 skipped、4 deselected、626 subtests passed，见[事件路径证据](evidence/2026-09-29-cont-m31-hithink-dividend-dsa-runtime.md)。
    - [ ] M31-b2-target：**扩展/当前跳过**。真实权限、目标 ETF 身份/币种、独立公告与历史覆盖证据齐备后，执行 DSA 鉴权 HTTP→Server 事件选择→冻结/重放的正反例；分别核对撤销、晚到和无事件依赖的 qfq 普通 Run。目标证据未齐时不准入，不用离线测试或单次响应代替 G0-H/G-M2-Events。
      - 2026-09-29 上交所 2025-06-11 分红公告和 2025-11-24 产品概要核对了 `510300.SH` 的 ETF/上交所身份、人民币交易与当次现金分红币种；两份 PDF 原字节摘要已记录，生成仅覆盖 2025-06 月的候选原文并以合成准入通过 DSA 结构校验。未写目标 Control 或准入；后出的产品概要不能回写 6 月策略可见性。真实进度码、全历史及正路径仍缺，见[独立身份与币种证据](evidence/2026-09-29-cont-m31-510300-public-identity-currency.md)。

M31-b2 续接边界：DSA 事件库存、HiThink manifest、策略/目录和鉴权执行入口已接通，内部读取编排及 Server wire/冻结校验由合成证据覆盖。目标通过 `sync-code.sh all` 同步后 DSA、Server、Worker 均 healthy；精确 HiThink 分红目录条目为 `not_admitted`，鉴权 HTTP 返回 422 / `not_admitted`，见[事件路径证据](evidence/2026-09-29-cont-m31-hithink-dividend-dsa-runtime.md)。本次仅容器可写层更新，镜像未变。下一步在真实身份/币种原文、数字进度语义和历史覆盖证据齐备后执行 M31-b2-target。缺证据时精确路由继续不可准入；M31-a、M31-b2-target 与 G0-H/G-M2-Events 不因本地接线勾选。

M21 接续证据（2026-09-27）：DSA 精确 EastMoney 的股票/ETF × 三口径参数、窗口、来源保留与两种资产失败不切源共 8 项本地测试通过，测试文件 `tests/test_akshare_exact_eastmoney_contract.py`。官方 ETF 文档未明确量额单位；没有猜测换算、生成兼容证明或发起 Provider 请求，M21/G0 仍未完成。细节见 DSA `docs/thesis-ledger-m2-source-gates.md`。

2026-09-29 无 Tushare/RQData 账号后的公开来源续查：[目标窗口只读证据](evidence/2026-09-29-cont-m2-public-source-window.md)。AKShare/EastMoney ETF raw/hfq 对 159516 目标 59 日窗在宿主与目标 DSA 容器均连接失败，停止本组重试；此前四日 raw/hfq 和 59 日 qfq 观察不能互相补齐。Tencent `newfqkline/get` raw 在宿主及目标容器均返回 59 根，短窗 10/10 重叠一致。深交所 2026 年 7 月官方 ETF 月报与腾讯 23 日线的量额合计不一致，不能确认腾讯现有单位换算。该结果只推进 `EX-TX-ETF-N` 的目标窗口读取，原生单位、币种、许可、历史可见性和真实准入仍缺；腾讯没有已登记 hfq 能力。M21、G0-M、G-M2-Price、兼容独立备用及 AC20 继续开放。

2026-10-02 用户确认当前使用的 Tushare 免费版本不提供 fund_daily、fund_adj、fund_div 所需能力，要求记录并跳过。M24/M25/M26 及未完成子叶统一保留为 **TODO／当前免费版本不支持／当前跳过**，依赖这些接口的 M32 Tushare 派生路径一并暂停。保留已保存的页面凭据、已完成接线和目标 40203 证据，不勾选父项、不再同条件请求。此版本限制来自用户确认，目标请求直接证明的是权限拒绝，不外推所有免费账号或其他 Tushare 接口。版本或权限明确改变后重新核验；当前顺序跳过上述路径，继续其他来源的独立就绪叶。

M24 拆分执行：

- [x] M24-a：Tushare fund_daily 有界日期分段读取，原生标的与范围校验、重复/缺列/无效数值拒绝，保留每段指纹；验证手到份与千元到元的既有转换。每段最多 366 个日历日，读取预算不足时请求前拒绝，不使用未核实的 offset 协议。已接入现有 ETF fetcher；新增及既有回归 51 项通过，V3 准入另见 M24-b。
- [ ] M24-b：**扩展/当前跳过**。接入精确 V3 raw 目录、权限/凭据修订准入和冻结日历覆盖证明；分段传输完成不等于来源或历史交易日覆盖完整，真实 G0 单独验收。
- [x] M24-b1：提供 Tushare 精确 ETF/none 来源读取入口，显式窗口、独立客户端超时预算、限流拒绝及真实分段数证明；失败不重试、不切源、不返回部分结果。16 项新增及既有回归合计 67 项通过。
- [x] M24-b2：完成精确入口的 V3 库存/manifest、本地适配/来源/安全凭据修订、分段证明与独立冻结日历覆盖接线；通过隔离 SQLite 到 V3 HTTP 的离线验收，未准入时拒绝。真实权限与来源验收另列 M24-b3。
- [ ] M24-b3：**扩展/当前跳过**。在目标运行环境核实 fund_daily 的真实权限、目标窗口覆盖和原生单位，按证据写入准入，再执行真实 G0/G-M2-Price；2026-09-29 用户提供的宿主 Token 已经真实探测，`fund_daily` 返回业务码 `40203` 权限拒绝，未向目标写入准入，见[逐接口权限证据](evidence/2026-09-29-cont-m2-tushare-token-permissions.md)。
  - 2026-10-02 已完成页面配置路径保存及目标实际凭据读取；目标 fund_daily 159516.SZ 限定短窗单次仍为 200/40203，无数据，权限与来源准入仍开放，见[目标配置与权限证据](evidence/2026-10-02-tushare-page-credentials-target.md)。

M24-b2 验证：已提取并接通 API 分页证明校验，Tushare 独立协议验证最多 32 段、每段最多 366 日的连续窗口、实际段数、行数及摘要，原单页来源仍严格要求一页。目录仅增加 CN ETF/none；内部 HMAC 绑定 Token 与接入地址，执行期间轮换/撤销拒绝结果，同一修订复用限流计数。214 项接线回归与 81 项旧路径/凭据兼容测试通过，主 Task 的真实门禁未通过。日志 `/private/tmp/goal-m24-integrated-final.log`、`/private/tmp/goal-m24-compatibility-retry1.log`。

M25 拆分执行：

- [x] M25-a：实现 fund_adj 有界分段读取与精确 Fetcher 入口；固定标的/窗口，拒绝重复或越界日期、缺字段和非正有限因子，保留十进制文本、观测时间、分段和内容指纹；因子不变造成的常值序列不能自动授予转换资格。25 项新增及既有 raw/V3/凭据/分页回归合计 152 项通过，flake8、py_compile 通过。
- [ ] M25-b：**扩展/当前跳过**。以独立可靠证据确认基金因子锚点、方向、算法与基础价格的可转换关系，建立精确因子合同、准入和冻结消费。官方接口说明仅确认数值字段时，anchor/upstreamDataRevision 保持未知，不推导历史可见时间；与 M32 的派生序列接线独立验证。
- [ ] M25-c：**扩展/当前跳过**。逐接口验证真实账号权限、目标因子完整覆盖与同源 raw 对齐；2026-09-29 宿主真实 `fund_adj` 请求返回 `40203` 权限拒绝，未取得因子行，见[逐接口权限证据](evidence/2026-09-29-cont-m2-tushare-token-permissions.md)。
  - 2026-10-02 目标用已保存页面凭据单次 fund_adj 仍为 200/40203；配置缺口已解除，真实因子权限、锚点/覆盖及同源 raw 对齐未通过，见[目标配置与权限证据](evidence/2026-10-02-tushare-page-credentials-target.md)。

M29 拆分执行：

M30 子叶：

- [x] M30-a：基金 `fund.get_dividend` 结构化标准化，保留三类日期、每份税前金额精度及实际观测时间；未知公告可见性不补造，币种由调用方核验。新增 19 项测试，连同拆分回归合计 55 项通过。
- [ ] M30-b：**扩展/当前跳过**。精确读取、币种/身份与准入冻结证据；不能由拆分权限或股票分红样本替代。
  - [x] M30-b1：单基金精确读取、请求前币种/范围检查、本地响应预算、含日期索引的内容版本及晚到结果拒绝；新增 11 项读取测试，RQData 拆分/分红共 66 项通过。
  - [ ] M30-b2：**扩展/当前跳过**。隔离 SDK 账号/超时、已核验币种和目标 ETF 身份、事件 V3 准入与冻结消费，以及真实历史覆盖。
- [ ] M30-c：**扩展/当前跳过**。真实账号权限与独立公告交叉验证。

- [x] M29-a：`fund.get_split` 单基金响应标准化，明确查询代码绑定、日期索引/字段、每份比例、真实观测时间及重复冲突；24 项离线测试通过。未生成策略可见性，覆盖始终不完整。
- [ ] M29-b：**扩展/当前跳过**。目标 ETF 映射、精确有界读取与准入/冻结消费；不能以净值基金样本证明 ETF 可用。
  - [x] M29-b1：单基金 `fund.get_split` 精确读取、响应行数预算、包含日期索引的原始内容版本、调用前后预算回调与冲突拒绝；读取和标准化合计 36 项离线测试通过。调用方仍须提供已核验代码映射及已配置客户端。
  - [ ] M29-b2：**扩展/当前跳过**。SDK 传输超时、账号身份/凭据修订、目标 ETF 映射、历史覆盖及事件 V3 准入/冻结接线；调用前后预算检查不能替代 SDK 内部阻塞控制。
    - [x] M29-b2-process：以 spawn 子进程内客户端工厂隔离初始化及精确读取，总期限届满终止子进程；完整标准化结果通过私有临时文件传回，错误文本不跨进程传播。复用 M30 分红读取；真实 SDK 工厂配置、凭据修订和事件路由接入仍独立保留。真实 spawn 13 项通过，含初始化/读取阻塞、崩溃、启动失败、分红结果和子进程清理；见 [进程隔离证据](evidence/2026-09-27-rqdata-process-isolation.md)。
    - [x] M29-b2-credentials：RQData 已注册到既有 Control 加密配置入口，复用账号清除与版本合同、保留密码原值、公共结果脱敏；实际 SQLite Store 快照进入读取前后 HMAC 校验。新增 13 项、读取/修订组合 30 项及旧 Provider/Control 组合 121 项通过，lint/编译通过；原 12 个 manifest 摘要不变，Control 减少 45 行。官方 DSA 同步、目标 registry HTTP 200、四份源码摘要一致且 healthy；可路由事件能力仍为空。真实证券映射、币种、历史覆盖和事件 V3 接线另验，见 [账号配置证据](evidence/2026-09-27-rqdata-control-credentials.md)。
    - [x] M29-b2-identity：DSA 已解析当前准入摘要绑定的 ETF 直接映射与独立分红币种证据，并接入账号隔离读取；读前核对身份/能力/范围/冻结截点，读后复核准入、文件及账号修订。新增 46 项、RQData/证据存储组合 193 项及 lint/编译通过；官方 DSA 同步后两份模块导入/源码摘要一致，缺准入拒绝且未读取账号，服务 healthy。准入与 SDK 响应为明确 fixture，真实映射未审核；没有登记事件路由或改变公开 wire。见 [身份证据记录](evidence/2026-09-27-rqdata-identity-evidence.md)。
    - [x] M29-b2-identity-wire：Schemas 已交付严格映射 bundle、原文引用及事件响应关联合同，绑定准入摘要、精确来源/证券/能力/范围/观察截点，缺原文、重复 JSON 及币种不匹配拒绝。新增 23 项、事件合同合计 52 项，Schemas 最终全包 367 项及构建通过；见 [原文合同与消费证据](evidence/2026-09-27-rqdata-identity-wire-consumer.md)。
    - [x] M29-b2-identity-consumer：Server Market 原 UTF-8 字节摘要及 1 MiB 预算校验已接入在线选择和离线 Snapshot；实际 Parquet/新 Store 读回、篡改及缺覆盖拒绝通过。新增 9 项、事件/冻结/传输组合 57 项、类型/构建/lint/依赖门禁通过；官方同步后 Server 与 Worker 各五份运行代码摘要一致、受控拒绝探针通过且 healthy。真实来源仍另验，见 [消费证据](evidence/2026-09-27-rqdata-identity-wire-consumer.md)。
    - [ ] M29-b2-event-runtime：**扩展/当前跳过**。将 RQData 的精确 cash/split 事件库存、当前 policy/catalog/admission 与已完成身份/账号隔离读取接缝接入 DSA 生产入口；缺准入在读取凭据前拒绝，读后撤销及版本变化拒绝晚到结果。响应携带公开身份原文，历史覆盖保持不完整；本地 HTTP/真实 spawn、目标入口与消费者验证独立于真实账号权限和覆盖准入。
      - [x] M29-b2-event-runtime-local：生产编排、精确库存、当前 HMAC/SDK 修订、原文与账号隔离接线完成；合并事件亦可读取。新增 11 项、事件组合 33 项、相关回归 166 项及两份 DSA 到 Server 严格合同/摘要验证通过。官方同步后六份源码摘要一致且 healthy；目标两路由未就绪，缺当前准入不读账号，实际 HTTP 均因未应用 V3 策略返回 422。运行时大文件减少 29 行；见 [生产接线证据](evidence/2026-09-27-rqdata-event-runtime.md)。
      - [ ] M29-b2-event-runtime-target：**扩展/当前跳过**。真实审核 ETF 身份/分红币种及逐接口账号权限就绪后，应用匹配目标 V3 策略与当前准入，验证生产鉴权 HTTP 到 Server 消费者的正向 exchange、原字节证据和晚到拒绝。当前目标无 V3 策略/准入，未进行正向请求；目标拒绝测试和本地受控 SDK 不能替代。
- [ ] M29-c：**扩展/当前跳过**。真实账号权限与独立公告交叉核验，并验证记账与信号边界。

M26 拆分执行：

- [x] M26-a：fund_div 结构化标准化；保留公告/实施公告/登记/除息/派息等独立日期及计划进度，明确每份现金金额与调用方已核验分红币种。仅已实施记录形成经济事件，按除息日选窗；未知首次可见时间不能回填为历史 availableAt。27 项标准化测试通过。
- [ ] M26-b：**扩展/当前跳过**。精确有界读取、分页/历史覆盖证明、ETF 与基金代码身份以及事件 V3 准入/冻结消费接线；不能把单次按标的返回当作完整历史。
- [x] M26-b1：精确 Fetcher 读取入口、共享限流/超时预算、原始金额精度及内容指纹；只按明确基金代码请求，不用公告窗口排除记录；本地行数预算独立于未知上游分页。精确历史请求拒绝 HTTP 重定向，10 项读取测试及标准化/raw/因子/凭据/V3 回归合计 123 项通过。
- [ ] M26-b2：**扩展/当前跳过**。核实目标 ETF/基金代码对应、上游分页/历史覆盖；接入事件 V3 准入、撤销/修订复核和冻结消费，完整性未知时维持不完整覆盖。读取结果已补齐空响应/窗外事件的内容版本；本批已建立当前准入绑定的精确 ETF 身份/独立分红币种原文合同、Tushare 精确事件库存与 DSA/Server 本地消费，详见 §12.9。公共覆盖仍为 `complete=false`；真实身份审核、账号权限、分页/历史完整性和目标冻结消费未通过，故父叶保持未勾选。
- [ ] M26-c：**扩展/当前跳过**。真实账号 fund_div 权限、目标事件/日期/金额与独立公告交叉核验；2026-09-29 宿主 `510300.SH` 单基金请求返回 `40203` 权限拒绝，未取得事件行，见[逐接口权限证据](evidence/2026-09-29-cont-m2-tushare-token-permissions.md)。单独验证 M33 记账和信号，不借股票日线权限推断基金事件可用。
  - 2026-10-02 页面配置保存后目标单次 fund_div 510300.SH 仍为 200/40203，没有事件行；未签发事件准入，不重复同条件请求，见[目标配置与权限证据](evidence/2026-10-02-tushare-page-credentials-target.md)。

M22/M23 接续修复（2026-09-27）：修正 ETF 公告索引误判完整空事件窗口的问题；窗口前公告/窗口内生效及缺少分页完整性均不能由公告日期排除。索引入口保持不完整覆盖，结构化事件适配仍待实施。V2 依赖与行情回归 28 项通过；代码编译、关键错误 lint 和 diff check 通过，未更新目标容器。

M23 拆分执行：

- [x] M23-a：实现 `fund_fh_em` 结构化行的独立标准化，严格按基金代码过滤，按元/份保留十进制金额，分别保存登记/除息/发放日期及观测时间。无公告字段时不生成策略可见性；缺关键字段/重复冲突必须拒绝，不从空集推断完整覆盖。以官方接口文档和已安装 SDK 为输入，离线样本验证。DSA `eastmoney_fund_dividends.py` 与专属测试共 18 项通过、flake8 通过；仅标准化子叶，尚未运行时接入或真实准入。
- [ ] M23-b：**扩展/当前跳过**。通过精确 endpoint 路由和完整分页证据接入运行时/冻结消费者，逐窗口真实准入后才启用；独立于 M23-a，不以标准化测试替代在线权限与覆盖。
  - [x] M23-b1：有界来源读取模块 `eastmoney_fund_dividend_reader.py`，JSON 字面量解析、请求超时/禁止重定向/大小限制、跨年总页预算、分页变化与重复拒绝、响应指纹与日期标准化；与标准化共 31 项离线测试通过。
  - [ ] M23-b2：**扩展/当前跳过**。接入精确事件路由、来源准入及冻结消费者；读取完成只证明传输分页完整，不代表所有历史事件与历史修订覆盖。
    - [x] M23-b2-wire：建立共享事件 V3 请求/响应与关联校验合同，精确能力、目标、版本、标的、经济生效窗口和 dataAsOf 不得串用；完整覆盖绑定准入引用但运行时另行核验。`market-event-wire-v3.ts` 定向 17 项通过，Schema 全包 316 项通过、类型检查和 lint 通过。
    - [ ] M23-b2-runtime：**扩展/当前跳过**。DSA 事件入口校验当前精确 policy/catalog/admission 后才调用读取器，并核实覆盖引用；Server Client 与依赖计划按事件能力选择请求，冻结消费者拒绝不完整证据。
      - [x] M23-b2-dsa：新增鉴权 `/api/v3/thesis-ledger/market/events`，复用实际目录和准入比较，读取前后核对策略、目录与准入撤销/修订/窗口；按精确目标调用分红读取器。覆盖仍不完整，未发布完整覆盖引用。11 项事件执行/HTTP 测试通过。
      - [x] M23-b2-consumer：Server transport 与事件依赖计划已接入实际 Snapshot 收集器；完整历史事件及修订仍须经审核的覆盖证据，本地目录 ready 只允许请求，不授予完整性。本地实现通过，真实来源/部署验收保留在父任务。
        - [x] Server transport：`DsaClient.marketEventsV3` 使用 Data Token、单次请求和共享请求响应关联校验；错误分类固定且不泄露上游文案。事件/图表传输 15 项、Server typecheck、Schema build 通过。
        - [x] 事件依赖聚合及冻结证据：按 cash/split 分开读取，保留每次 V3 原始响应/请求和准入范围；完整覆盖缺失时拒绝冻结。V2 形状仅作为旧领域规划器的内存投影，冻结保存完整 V3 exchange。
          - [x] 精确选择与能力请求规划：Market 选择器验证固定 Effective/Catalog 版本、能力和目标；Backtest 分别规划 cash/split 窗口。选择成功仅表示观测，保留完整请求响应，不授予冻结完整性。12 项新增测试及 9 项传输回归、Server typecheck、定向 lint 通过。
          - [x] 多能力观测聚合：`readBacktestEventObservationsV3` 共用一次控制目录读取，分别请求各能力，保存每项 scope 和 exchange；任一能力不可用或不完整时整体拒绝完整性。完整覆盖引用必须同时通过准入快照校验；聚合 7 项、Server 类型检查、lint 通过。
          - [x] 准入快照合同：DSA 输出实际已核验记录的安全投影，完整覆盖必须关联引用与快照；共享合同核验精确来源、标的/日期范围、读取时间有效性和撤销状态。Schema 29 项、DSA 15 项、Server 传输/选择/聚合 24 项及新增聚合拒绝用例通过，Schema build、Server typecheck、lint/flake8 通过。
          - [x] 将能力请求接入实际 Snapshot 收集器，冻结各能力原始 exchange 和覆盖证明；从已冻结行情证据固定版本，离线重新核验能力集合、窗口、版本及事实指纹。旧 V2 事件读取已从该入口移除。22 项定向测试、Server 全包 1280 通过/49 跳过、build、lint、依赖边界、尺寸 ratchet 通过；没有真实 Provider 或部署验收。
    - [x] M23-b2-dates：共享事实合同及 DSA 输出保留登记/发放日期；冻结标量转换保留字段并拒绝日期篡改，兼容旧事实，不改变入账时点或策略可见性。Schema 全包 299 项、Server 冻结依赖 8 项、DSA 31 项通过；Schema build、Server typecheck 和定向 lint 通过。
  - 真实观察（2026-09-27）：单次公开只读请求 HTTP 200、12984 bytes，2025 年第一页 `pageinfo=[75,100,1]`，变量包含 `pageinfo/jjfh_data`。未抓取其余页面，未宣称 510300/159516 事件覆盖通过。

- [ ] M32：**扩展/当前跳过**。冻结基础价格到本地派生序列。
  - [x] M32-a：实现明确乘法因子/固定锚点下的纯计算核心，校验逐 Bar 对齐、观测截点及正值，保留完整输入指纹；同锚点分段与整段数值一致。11 项测试、Server typecheck 和定向 lint 通过。仅计算接缝，不授予来源准入；Reader 显示裁剪及仓储接线仍归 M32-b。
  - [ ] M32-b：**扩展/当前跳过**。接入真实可靠因子合同、准入、冻结仓储及 Reader；与源原生序列区分，完成真实 G0 后再开放。
    - [x] M32-b1：本地派生快照编码/读取接缝，冻结完整输入与算法版本，读取与外部固定指纹比较并完整重算，显示 limit 不改变锚点或完整指纹；14 项新增测试，连同计算共 25 项通过。
    - [ ] M32-b2：**扩展/当前跳过**。真实证据仓储、因子合同及准入和实际 Reader 路由接线；纯快照函数不构成持久化或真实来源验收。
      - [x] M32-b2-store-pg：独立 PostgreSQL 17 + 实际 Prisma 仓储验证 3 项通过，四路并发同内容写入仅一行、损坏载荷读取/重复写入拒绝且不覆盖、算法列不一致被数据库约束拒绝；仓储注册到 Market 模块。该测试使用专用隔离库，不替代目标应用角色和 Server/Worker 验收。
      - [x] M32-b2-store：新增独立完整输入表和 Prisma 仓储，创建/同内容幂等，冲突不覆盖；读取重算并核对算法列。仓储及结构定向 15 项、typecheck/lint、Prisma validate、迁移矩阵和运行时输入检查通过。隔离 PostgreSQL 17 顺序执行全部 19 个迁移得到 68 张表，新表重复键/JSON 身份/缺字段约束测试通过；目标运行态及真实 Provider 消费仍未验收。
      - [x] M32-b2-basis：派生结果转换为现有 SourcePriceBasis，独立记录完整输入/因子指纹及算法版本，显式声明基准范围和分红语义，已验证分红必须附证据。新增 3 项测试，派生模块共 34 项通过；完整输入仓储尚未落地。
      - [x] M32-b2-raw：复用冻结窗口仓储返回契约构造派生输入，核对完整响应哈希、请求关联、原生 raw/原始量语义及读取截点；因子转换必须绑定同一 raw 响应哈希。6 项新增测试，派生模块合计 31 项通过；尚未注册实际 Reader 或持久化派生结果。
      - [x] M32-b2-clock：修复 raw 观测、Bar、因子和锚点时钟按毫秒比较及输出丢失微秒的问题；新冻结使用 `binary64-v2` 精确时钟修订，旧 `v1` 仍按原指纹/结果读取。[微秒边界证据](evidence/2026-09-28-cont-m32-derived-instant-precision.md)记录修前红例、修后定向及 Server 全包。此项不接入真实因子 Reader、不授予来源或历史 PIT 准入，M32-b2 与父项继续开放。
  - 覆盖：Spec §5、§8，AC02、AC10、AC20；依赖：C01、S03、M24、M25。
  - 写入：Server Market 的派生序列模块及纯计算测试，不新增虚构 Provider。
  - 完成：从已冻结 raw 与可靠因子/事件得到验证后的 qfq/hfq；记录算法版本、输入引用、基准、因子/事件指纹。转换不成立则拒绝，不能从无因子 qfq 猜 raw 或叠乘跨源复权价格。
  - 验证：V-Server；整段/分段统一基准、转换反例、limit 不偷换指纹与版本不覆盖；实际派生能力开放依赖对应真实 G0。

- [ ] M33：**扩展/当前跳过**。所需公司行动进入原始记账和事件信号。
  - [x] M33-a：运行时转换保留 effectiveDate/strategyVisibility，事件表达式按冻结交易日与独立可见性求值；信号输入与记账队列分离，归一化可读取信号事实。事件/引擎/归一化回归 30 项、Server 字段转换与快照回归 7 项通过；类型检查、lint、尺寸 ratchet 通过。真实 Provider 与目标运行验收未执行。
  - [x] M33-b：raw 记账按明确 effectiveDate 对应冻结开盘调度，内部 accountingAt 与源 occurredAt/availableAt 分离，预热事件不计入期初持仓。沿用事件严格可用性：晚观测事实拒绝，不移动到窗口外或回填历史时间。缺可见性本身允许记账，信号仍拒绝；冻结派息假设不变。领域定向 16 项、Server 12 项通过，类型检查、lint、边界、尺寸 ratchet 通过；真实事件与目标运行证据仍待 G-M2-Events。
  - [x] M33-clock-precision：V3 事件依赖计划与原始记账改用完整小数秒比较事实、公告、冻结截点及开盘；非法时间失败关闭，同毫秒晚到的事件不再通过。定向 18 项、Server 类型/构建、lint/格式/边界通过；官方 `sync-code.sh thesis-ledger` 后 Server/Worker healthy 且两份编译模块摘要与宿主一致。仅更新容器可写层，镜像及真实来源门禁未完成，见[精确时间证据](evidence/2026-09-28-cont-m33-event-clock-precision.md)。
  - [x] M33-signal-clock-precision：V3 执行入口对事件策略信号按实际决策 tick 精确比较事实可用时间和公告时间；同毫秒晚到、非法时间均失败关闭，V2 冻结路径保持原语义。Server/Domain 定向及相邻回归共 41 项、Server 类型/构建、限定 lint/格式、边界通过；官方快更后两目标容器健康、编译摘要一致且各自受控晚到拒绝/相等接受，见[信号时钟证据](evidence/2026-09-28-cont-m33-signal-clock-precision.md)。真实来源与 159516 准入仍未通过。
  - 覆盖：Spec §5.1、§9，AC03、AC04、AC08、AC12、AC15；依赖：S06、M22、M23，其他来源按通过单元增加契约样本。
  - 写入：Server Market 事件消费/依赖计划接缝及测试。
  - 完成：按影响窗口请求必要事件，生效记账与策略可用时间分离；沿用冻结派息假设，不声称新建真实结算模型。
  - 验证：V-Server；窗口前公告/窗口内生效、缺可见日期的记账允许但信号拒绝、归一化不重复加现金/数量；PIT 严格性不变。

- [ ] M34：**扩展/当前跳过**。**TODO／当前跳过**：TdxAiData 运行依赖集成。按用户免费优先、否则尝试 a-stock-data 的顺序，后台免费资格未确认且当前原生库不适配；保留已完成核验及剩余验收要求。匿名盘后包和腾讯候选分别记录，不适用本 SDK 阻塞。
  - [x] M34-sdk-artifact-header：目标 DSA 固定 tdxaidata 1.2.2 的元数据/wheel 各一次读取成功，wheel 摘要匹配；默认 libTdxAiData.so 为 ELF64/e_machine=62（x86_64），目标 aarch64/64位不匹配。只读原字节/加载器核验完成，未安装、导入、执行 SDK；见[固定包架构证据](evidence/2026-10-02-tdxaidata-sdk-architecture.md)。账号申请按用户最新要求独立推进，不替代 SDK/ABI 与真实来源验收。
  - [ ] M34-sdk-artifact-architecture：**扩展/当前跳过**。剩余 ELF 依赖与加载前核验。原定目标读取、摘要和 ELF 头部分已在 M34-sdk-artifact-header 完成；固定 1.2.2 默认 Linux 库因 CPU 不匹配停止，不再重复下载同一候选。继续条件为厂商提供 CPU 匹配的固定候选，或另行明确目标架构方案；确定新输入后登记 URL、摘要及请求/展开预算，再核对 DT_NEEDED、符号版本和系统库。未完成部分保持开放，不以原字节读取成功授予 ABI、授权或真实行情准入。
  - [ ] M34-account-key：**扩展/当前跳过**。**当前跳过**。官方后台需付费订阅，未确认免费资格；按用户顺序不继续账号申请。a-stock-data 匿名取样已完成，其本次 ETF 回测接入因合同缺口也暂跳过，见[免费接口实测](evidence/2026-10-02-astockdata-free-path-validation.md)。未创建账号、Key 或购买积分；历史操作见[申请进度](evidence/2026-10-02-tdxaidata-sdk-architecture.md#账号申请进度)。
  - [ ] M34-sdk-preflight：**扩展/当前跳过**。2026-10-02 独立只读核对官方 `tdxaidata` 候选及目标平台。输入限官方 TdxAiData 说明、PyPI 固定版本元数据和一个 wheel、目标 DSA 公开运行时信息；PyPI 元数据一次、wheel 一次，各 15 秒且上限分别 1 MiB/8 MiB。在内存中核验 wheel 摘要、包内 Linux 原生库 ELF 架构及许可说明，不安装、导入或执行下载内容、不调用行情、不读取数据服务 Key、不改镜像或配置。交付为专属来源前置证据；CPU/SDK 不兼容或授权未核实时停止集成，父项和 M27/M28 保持开放。
  - 支持：Spec §4、§14，AC20；依赖：G0-M 中通达信前提已核实、M27、M28。
  - M34-sdk-preflight 本轮结果：官方后台入口 tdxaidata 已查明，固定候选 1.2.2；目标 Linux aarch64/Python 3.11.16/glibc 2.36，SDK 未安装。固定版本元数据读取成功，唯一 wheel 下载在 TLS 握手阶段超时，原字节/摘要/ELF 架构未核验。停止下载，不以 py3-none-any 标签或 pytdx 替代兼容证明；许可/授权及目标集成仍开放。见[剩余来源前置证据](evidence/2026-10-02-priority2-provider-prerequisites.md)。
  - 写入：K-Infra 的该 SDK 镜像/架构依赖与隔离配置。
  - 完成：固定 SDK、授权方式、CPU/系统库及部署检查；其他来源不依赖 Windows 客户端或通达信进程。
  - 验证：相应目标镜像 SDK 加载和只读请求；依赖未满足保留阻塞，不能用宿主机成功替代目标容器。

- [ ] G-M2-Price：**扩展/当前跳过**。目标 ETF raw/hfq 两条真实回测路径。
  - 依赖：G-Run、所选 raw/hfq 来源适配与对应 G0、M32（选择本地派生时）、M33；所有者：回测验收执行者。
  - 环境/入口：目标运行态，159516.SZ 同目标区间和策略所需预热。
  - 证据/通过：各自真实响应、冻结协议、Run/结果/重放；分红留存/再投资或 lot 差异有经济解释，不要求任意三口径收益无条件相等。覆盖 AC02–AC04、AC15、AC20。

- [x] G-M2-Fallback：HiThink/腾讯同口径整窗备用在真实图表及普通回测通过，实际 routeIndex=1，冻结重放一致；本轮基础价格不要求算法等价证明。
  - 依赖：S04、所选两源适配/真实 G0，通达信被选中时依赖 M34；所有者：Market 验收执行者。
  - 环境/入口：隔离故障注入，明确配置主备且已证明基准/算法兼容。
  - 证据/通过：主源失败后完整窗口来自备用、实际 provenance、无第三源/逐 Bar 拼接；主源恢复和窗口修订不改变 frozen Run；不兼容组合拒绝。覆盖 AC10、AC11、AC20。

- [ ] G-M2-Events：**扩展/当前跳过**。拆分/现金分红真实事实及 raw 回归。
  - 依赖：M33、所选拆分/分红适配与对应 G0；所有者：事件消费验收执行者。
  - 证据/通过：有真实事件样本、有效/可见日期区别、原始路径生效记账及归一化不重复记账；其他市场/NAV 保持基线。覆盖 AC03、AC04、AC08、AC12、AC15、AC20。

## 10. M3：研究辅助能力任务组

本节是必须保留的实施分组，**不是可一次派发或直接勾选的叶子**。P02 已在 DSA [`docs/thesis-ledger-source-capabilities.md`](../../../daily-stock-analysis/docs/thesis-ledger-source-capabilities.md) §5 为各组建立稳定子编号，并逐叶记录来源、消费者、owner、输入、输出及门禁；该组全部子任务通过后才收敛。盘点完成不能替代适配器和消费者实现。

| 分组 | 必须保留的交付范围 | 子任务拆分与完成边界 |
| --- | --- | --- |
| R01 基础身份与日历 | 标的目录、交易日历、已知交易状态；保留腾讯/Efinance/BaoStock 等现有范围 | 每个来源能力适配与一个现有目录/Reader 消费入口分别验证；缺 Bar 不判停牌、当前状态不冒充历史 |
| R02 报价与补充行情 | HiThink/现有上游报价、指数、受支持分钟线、RQData 专业历史能力及有价值的通达信盘后包接口 | 每个具体行情接口固定单位/周期/口径/覆盖；分钟数据接入不扩展 M1 日线引擎 |
| R03 基金净值 | 正式单位净值及历史、盘中估值 | 正式净值与估值独立能力及缓存；估值不作成交 K 线，NAV 原有模型回归 |
| R04 基金资料与持仓 | 基金资料、持仓、资产配置 | 逐来源与现有研究消费入口验证报告期/观测时间、空与缺权限；不建立新基金平台 |
| R05 财务与估值 | 财报、估值 | 逐字段契约验证报告期、发布/可见时间；最新数据不得自动进入历史回测 |
| R06 指数板块与资金流 | 行业/板块、受支持资金流及研究索引 | 逐来源能力与现有消费者验证口径、范围、未知状态；无消费者先解决范围问题 |
| R07 公告与资讯辅助 | 公告、新闻/研报索引；a-stock-data 有价值接口、问财等底层检索 | 固定版本并按实际上游登记；自然语言/模型总结不转成确定性行情/事件，不建设 PDF 审计平台 |
| R08 可选本地镜像 | free-stockdb 读取/导入 | G0-R 证明可信镜像/许可/覆盖后才激活；独立读取适配与受控导入任务，不替换 PostgreSQL/快照；未选用记录明确不适用依据 |

R01–R07 的具体单元依赖 P02、C04、对应来源 G0；涉及价格能力还依赖 S03–S05，涉及界面遵循 §7 共同约束。DSA 只拥有来源适配与测试，主仓消费者只通过现有 Reader/API 读取；同一子任务不包揽 DSA、Server、Desktop 和部署。

- [x] R01.5-pagination：真实基金排行分页与目录消费已由 2026-10-02 第一优先级完成，见 §0.1；历史身份与长期连续可用不属于当前目录成功声明。
  - [x] R01.5-catalog-consumer：当前 EastMoney 页面与安装版 AKShare 将目标接口限定为开放基金排行，Reader 显式固定 `dt=kf,ft=all`，只投影 `MUTUAL_FUND/OF`；Efinance 0.5.9 缺原生基金目录方法时接入既有有界 Reader，坏分页/超时使该 Provider 原子失败。红例 5 failed/1 passed 后修复，最终 parser/Reader/Catalog/Job 68 项通过，完整 lint/编译及关键门禁通过，见 [本地消费证据](evidence/2026-09-28-cont-r01-5-catalog-consumer.md)。
  - [x] R01.5-real-source：2026-10-02 修复固定查询后完整基金排行 20481 条/21 页、正式目录 35278 条成功；旧超时记录保留在此前证据。
2026-09-29 `R02.1/R02.3` 来源选择：依据当前官方股票/基金快照接口和 DSA 现有 Quote Reader，分别固定 HiThink 股票 `a-share-prices-snapshot` 与 ETF `fund-market-snapshot`，并同步 DSA 能力目录；本地适配器及 `not_admitted` 门禁 14 项通过。目标 DSA 对 `600519.SH` 与 `510300.SH` 各一次单标只读请求均 HTTP 200，原响应摘要及独立时钟已记录；只证明该账号当次端点权限。生产 `_realtime_quote` 尚未调用该适配器，ETF 量额单位、长期可用性与目标消费者未验，不关闭 `R02.2/R02.4` 或 G0-H；见[选择证据](evidence/2026-09-29-cont-r02-hithink-quote-selection.md)。

R02.2/R02.4 按 Spec §3.3 分阶段执行；当前目标 V2 revision 28 与 V3 revision 29 均无 HiThink Quote 路由，生产接通仍需以下独立门禁。现有 Quote 执行会先将完整代码转换为裸代码，不能直接复用给要求完整 `thscode` 的适配器。

- [x] R02-quote-state：DSA Control V2 已用精确 Quote RouteAdmissionV3、当前来源目录、环境凭据 HMAC 与上海日期范围重算 eligible；Runtime 读前读后复核策略、目录、准入版本和凭据，缺证据仍 `not_admitted`。隔离 SQLite 已验证缺证据、范围、撤销、凭据/策略轮换及目录移除；见[本地接线证据](evidence/2026-09-29-cont-r02-hithink-quote-runtime-local.md)。目标准入尚未签发。
  - [x] R02-quote-state-contract：纯函数已固定两种报价 RouteKey/Target、请求合同与适配器修订，检查证券身份、证据摘要/版本、上海日期范围、有效期、撤销和凭据 HMAC；新增 18 项、相邻共 32 项通过，限定 lint/编译/空白通过。该阶段尚未接入 Control/Runtime，后续接线见本节父项；[准入接缝证据](evidence/2026-09-29-cont-r02-hithink-quote-admission-core.md)。
- [x] R02.2-runtime：股票精确目标传完整 `thscode`，现有其他 Provider 裸代码合同回归通过；保留来源/双时钟，限流分类、单目标一次调用与读后修订拒绝已验证，见[本地接线证据](evidence/2026-09-29-cont-r02-hithink-quote-runtime-local.md)。
- [x] R02.4-runtime：ETF 精确目标独立接线，持久 600 秒单标预算与晚到撤销已验证；Quote HTTP 显式保留 `volume=unknown`、`turnoverCurrency=unknown`，错用股票单位返回 502，见[本地接线证据](evidence/2026-09-29-cont-r02-hithink-quote-runtime-local.md)。
- 2026-09-29 当前 Quote 接线输入的 DSA 官方隔离 `offline-tests` 复试 **7608 passed、1 skipped、4 deselected、626 subtests passed**；首次副本误排除 `src/data/` 造成收集失败，已在唯一输入修复后通过。该结果仅证明离线全包，目标准入和消费者仍开放；见[隔离门禁证据](evidence/2026-09-29-cont-r02-hithink-quote-isolated-offline-gate.md)。
- [x] R02-quote-consumer：鉴权 DSA V1 Quote HTTP 到 Server 现有 Quote Reader 分别验证股票/ETF 身份、来源、新鲜度、缓存与错误语义。2026-09-29 目标临时窗口中两类精确标的均经真实 Server→DSA HTTP 返回 HiThink 来源、双时钟、单位及非缓存结果，不带令牌的 DSA 请求为 401；撤销后原 Efinance 备用接管。缓存、last-valid、`marketTime=null` 与错误合同另由本地定向测试覆盖，合并证据见[目标窗口](evidence/2026-09-29-cont-r02-hithink-quote-target-window.md)和[本地接线](evidence/2026-09-29-cont-r02-hithink-quote-runtime-local.md)。持续目标准入、真实凭据修订及晚到并发演练仍归 `R02-quote-target`。
  - [x] R02-quote-consumer-local：隔离 DSA HTTP 鉴权/真实 Runtime、Server 模拟 DsaClient 的 Quote Reader 正向/缓存/last-valid 错误语义均已验证；`marketTime=null` 与精确来源、ETF 未知单位在两侧保留，见[本地接线证据](evidence/2026-09-29-cont-r02-hithink-quote-runtime-local.md)。真实 Server→目标 DSA 正向链路另见下述临时窗口；目标缓存/错误与持续运行仍需单独验收。
- [ ] R02-quote-target：**扩展/当前跳过**。按官方 infra 入口更新目标代码后，使用各自已审核准入分别验证真实正向请求、撤销/凭据修订及目标消费者；来源时钟、ETF 量额单位和持续可用性分别报告，未核证则保持对应来源不可用。
  - 2026-09-29 临时窗口：官方 `sync-code.sh all` 后三容器健康、关键源码摘要一致；经用户指定临时替换 AKShare，两个精确标的分别取得 Server→DSA HiThink Quote HTTP 200，撤销后转到原 Efinance 备用，随后 V2 路由恢复且临时准入撤销，详见[目标窗口证据](evidence/2026-09-29-cont-r02-hithink-quote-target-window.md)。真实 Key 修订故障注入、晚到并发撤销、长期可用性和 ETF 原生量额单位未核；本叶及 G0-H 保持开放。

2026-09-29 `R02.17` 只读候选核对：官方通用 `get_price` 可作为 CN ETF/1d/none 的单一历史 Bar 候选，消费现有 `MarketBarWindowReaderV3`；[证据](evidence/2026-09-29-cont-r02-17-rqdata-etf-bar-selection.md)已同步 DSA 能力目录。真实行情权限、证券身份、原生量额单位和历史覆盖未核，`R02.17`/`R02.18` 均未完成，不开放生产路由或目标准入。

- [x] R02.18-contract：DSA 纯 `get_price` CN ETF/1d/none 请求与 DataFrame 校验合同已实现；严格身份形状、日期/重复、OHLC、行预算、十进制精度及请求与全行指纹，量额单位未知、覆盖不完整。专属 14 项通过，限定 flake8/语法通过；未调用 SDK/账号、注册库存或准入。见[本地合同证据](evidence/2026-09-29-cont-r02-18-rqdata-etf-daily-contract.md)。
- [x] R02.18-process：DSA 已抽取原事件 `spawn` 传输并复用到 ETF 日线单窗口读取；初始化、SDK、标准化与解码共用总期限，超时清理、失败脱敏与 8 MiB 响应预算已验证。新真实 `spawn` 16 项、原事件 13 项及相邻组合 85 项通过，限定 flake8/语法通过；不接账号、准入或生产入口。见[隔离进程证据](evidence/2026-09-29-cont-r02-18-rqdata-etf-process.md)。
- [ ] R02.18-runtime：**扩展/当前跳过**。在真实账号修订、证券映射与单位证据具备后，消费 R02.18-process，接入精确 Bar 库存、当前准入及现有 Reader；生产读取前后复核账号/准入/来源修订，整窗拒绝部分结果。依赖 R02.18-process 与相应 G0-M，不借事件权限推断行情权限。
- [ ] R02.18-target：**扩展/当前跳过**。目标环境核对真实账号 `get_price` 权限、ETF 身份、原生量额单位、交易日覆盖与修订，再按官方 infra 入口验证鉴权 Data V3→Server Reader→冻结重放；严格 PIT 另验。依赖 R02.18-runtime 与真实 G0-M。

2026-09-29 目标状态只读核对：DSA Control 的 `rqdata` 投影为 `configured=false`、`credentialConfigured=false`、`capabilities={}`；容器健康不能替代账号与逐接口权限。`RQ-HIST` 门禁已将旧“接口/Consumer 待选”改为官方 `get_price × CN ETF × 1d/none` 候选，仍不执行真实请求、不接生产 Bar 路由。

- [x] R02-Tencent-amount：DSA 精确腾讯日 Bar 路径在缺原生成交额时整窗拒绝，不再把 `close × volume` 补值当作真实金额。公开 `510300.SH` 同一短窗 `none/qfq` 各一次返回 12 行六字段；红例修前 1 failed，修后相邻 58 passed、限定 lint/编译和官方 syntax/critical flake8 通过。官方离线全包首次 1 项无关 PID 文件竞态失败，定向复核通过，唯一全包复试 7557 passed/1 skipped/4 deselected；官方 `sync-code.sh dsa` 目标健康、源码摘要一致，容器同窗实际拒绝。完整范围见[原生成交额证据](evidence/2026-09-29-cont-r02-tencent-native-amount.md)。只关闭本精确失败语义叶，腾讯真实来源准入仍开放。
- [x] R02-Tencent-native：既有腾讯精确 Bar 入口消费 `newfqkline/get` 的原生成交额字段，普通 `fqkline/get` 路径保留。单标、`none/qfq`、逐年分段、量额与状态校验及总期限已实现，适配/分页修订升至 v2；相邻 119 项、官方离线全包 7574 项、官方 DSA 快更及容器短窗实读通过。详见[原生成交额接线证据](evidence/2026-09-29-cont-r02-tencent-newfqkline-native-amount.md)。真实来源单位、完整覆盖、使用条款与准入归 G0-M，未因本叶完成而通过。

- [x] G-M3：基础价格变更及其余登记单元的扩展/待验证状态已对账，见 §0.1 和 DSA 能力目录；未宣称全部在线。
  - 依赖：P02、G0-R、R01–R07 的全部实施子任务；R08 按明确激活条件；所有者：能力目录验收执行者。
  - 入口：P02 的完整登记表及对应子任务/证据，不另外维护第二份支持矩阵。
  - 通过：每个登记单元有契约、实现及测试证据，并有真实准入证据或明确的待验证状态/阻塞原因；未验证能力不伪装已就绪，既有消费者缺数据/无权限能正确展示。
  - 限制：AC20 允许 M3 登记“真实待验证”，但不能因此声称全部来源在线；缺凭据不能取消已承诺实现，当前必要门禁继续留在 Task。

## 11. 验收责任映射

下表将本地实现与组合/真实证据分开。正文中未单列 AC 的要求由其关联任务承担，不能仅逐行核对 AC 就宣告完成。

| AC | 具体断言与实现责任 | 足够的验证责任 |
| --- | --- | --- |
| AC01 | ETF null=qfq、禁止伪 raw/hfq：C01/C02、D01 | D01 fixture；G0-H-target 目标响应、G0-H 其余样本；G-Run/G-UI |
| AC02 | 股票三口径及读取/缓存/快照隔离：D02、S01–S03、S08；目标 raw/hfq：M24/M25/M32 | 各任务定向测试、V-DB、G0-H、G-M2-Price |
| AC03 | 拆分只在正确记账模型生效：B02、M22/M28/M29、M33 | B02 精确 golden；G-Math、G-Run 的目标拆分核对、G-M2-Events |
| AC04 | 分红不双记，原始模型假设明确：B02、M23/M26/M30/M31、M33 | 分红 golden；G-Math、G-Run 的归一化不重复记账、G-M2-Events |
| AC05 | 无未来 Bar、下一有效开盘、尾部未成交：B04、S09 | 定向时序测试、I01、G-Math、G-Run |
| AC06 | 数量、费用、占款及连续调仓守恒：B02/B03/B04 | Decimal golden、I01、G-Math |
| AC07 | 不兼容真实单位和量价规则拒绝：B01、S06/S07、U03 | 规则矩阵、API 绕过、G-UI |
| AC08 | 事件按需、raw/事件策略保持必要阻断：S06/S07、M33 | 三类依赖测试；G-Run、G-M2-Events |
| AC09 | 覆盖、预热、上市前、缺页/重复、状态/价格异常：D01/D02、S03–S07 | 适配/Reader 定向测试；G0-H-target 目标窗口、G0-H 其余样本、G-Run |
| AC10 | 基准/窗口隔离、统一后合并：D01、S02–S04、M27/M32 | V-DB、窗口反例；G0-H-target 目标窗口、G0-H 全范围、G-M2-Fallback |
| AC11 | 精确主备、完整窗口、不可变冻结：D03、S01/S04/S08 | I01、G-M2-Fallback |
| AC12 | 历史性质、真实可见时间及披露：C01、S05/S06、A02、U05、M33 | PIT/固定快照反例；G-UI-159516 的研究披露、G-UI 全范围、G-AI、G-M2-Events |
| AC13 | Benchmark 和排名一致：B05、A01、U05 | 评价组定向测试；G-Math、G-AI |
| AC14 | 候选公平性、封存隔离、失败分层：A01/A02 | 模型请求边界测试；G-AI |
| AC15 | 旧版本/原始路径及真实域：C03/C04、B02、S09、A03、F01/F02 | G-Legacy、G-Deploy、G-M2-Events |
| AC16 | 真实监控重新编译或拒绝：A03 | 采纳 API 定向行为、真实域隔离断言 |
| AC17 | 目标真实普通回测与重放：D01、S08/S09 | G0-H-target、G-Deploy-159516、G-Run；G0-H/G-Deploy 父项仍开放；fixture 不替代 |
| AC18 | 独立实现与经济 golden：B02–B05 | G-Math，阈值在运行前固定 |
| AC19 | 路由/表单/图表独立状态及后端防绕过：S01/S07、U01–U05 | 组件与 API 定向测试；G-UI-159516 首条用户路径、G-UI 全范围 |
| AC20 | M2 真实口径、独立备用、事件；M3 单元可追踪 | P02 所有登记任务、G-M2-Price/Fallback/Events、G-M3 |

正文附加义务：§3 非目标由 B04/R 分组约束；§4 授权/有限目录由 P02/G0/F01 约束；§8 本地派生由 M32 负责；§10 模块依赖由 P01 和各写入任务执行边界门禁；§13 版本/迁移/回滚由 C03/C04/S02/F01/G-Deploy 负责；§14 文档收口由 F02 及本 Task 的最终 Review 负责。

## 12. 执行顺序与规划预检结论

2026-09-28 起的当前优先级以 §2“首个可交付回测优先路径”为准；以下段落保留 2026-09-25 初始规划与当时的预检结论，具体任务和门禁状态以后续执行记录为准。

可先启动 P01 与不依赖新代码的 G0-H 探针准备（实际探针仍按其依赖和授权执行），随后 P02/C01；C01→C02→C03→C04 固定共享契约。之后 DSA、Domain、Market 和 UI 的无写入冲突叶子可依据真实依赖推进。S02/S03 形成持久化基础，S06/S07/S08 接通计划与冻结，S09 后立即执行 I01，再继续目标部署和产品验收，不等 M2/M3 完成才首次联通。

若来源契约未知、需要新增无定义 wire 字段、无法判定单位或实际消费者不存在，仅阻塞对应任务；先回填 Spec 问题和拆分，不按假设编码。外部未知项是目标覆盖/权限/基准、目标 raw/hfq 可靠路径、通达信 SDK/架构、可选镜像许可；本轮没有实测结论。

规划预检结论：**可进入前置盘点与已知契约规划（Ready with non-blocking assumptions）**。已覆盖 M1–M3、完整 AC 和正文关键义务；局部实现、早期联通、数据库、目标普通回测、AI、UI 及扩展来源门禁分别归属。默认沿用现有引擎/队列/错误体系/前端入口。

具体实施就绪状态：P01 与 P02 已完成入口和有限目录盘点；其后任务按依赖解锁。R01–R08 分组仍不可直接派发，具体叶子以 DSA 来源能力目录 §5 为准；涉及未核实来源的生产集成受对应 G0 阻塞。没有把整张计划标为全部可立即执行，也没有豁免任何必需真实门禁。

规划轮次文档校验记录（2026-09-25）：Python 静态检查通过，收录 Spec 与下载原件逐字节一致；当时 61 个任务/门禁编号唯一，8 个能力组明确待展开；已声明依赖及 S01 的结构验收依赖无环；AC01–AC20 映射齐全，四份相关文档的 107 个相对链接有效，实施勾选为 0，新增文件无尾随空白。限定当时四个文件的 `rtk git diff --check -- ...` 通过。逐来源 G0 与 M3 子任务展开后须重验新增依赖和覆盖；规划轮次未运行产品测试或部署。文档完整性不证明产品行为。

## 12.1 续接执行台账（2026-09-25）

本次从 `/private/tmp/thesis-ledger-backtest-handoff-2026-09-25.md` 恢复；保留现有主仓及 DSA 未提交变更。用户最后要求“收尾当前任务，然后 handoff 交接进度”，本轮收口完整冻结与双时钟叶子，不继续启动 Runner 或真实环境实施。下一会话沿 S08-p4 当前闭包 → S09-r → I01 继续，M2/M3 与真实门禁仍有效。历史 `worker_done` 仅指局部交付，历史 `confirmed_gap` 由后续明确证据收敛；协调者独占本文档。禁止 `followup_task`，每个执行包使用独立会话。

| 编号 | 单一结果 / 依赖 | 写入与资源 | 所有者 / 会话 | 派发 | 状态 / 证据 |
| --- | --- | --- | --- | --- | --- |
| S08-d4 | 核定完整冻结依赖、现有事实接口与最小实现边界；依赖 S08-p3/S06-a 当前源码 | 三仓只读，无生成文件、网络或数据库写入 | Luna / `/root/s08_dependency_seam` | closed | worker_done；核定同坐标绑定必须显式；Calendar/InstrumentFacts/按需 Events 可消费现有 DsaClient，新增响应 envelope 与事实指纹；无修改/测试/网络 |
| S09-d2 | 核定 V3 Runner/结果/生命周期接入边界；依赖 S09-a 和现有 exchange 装配 | 主仓只读，无生成文件或网络 | Luna / `/root/s09_runner_seam` | closed | worker_done；可复用 exchange vertical 和 mode=V2 队列 lane；Runner/结果分支、默认基准输入、retry/cancel 的 CAS 需分别接线；只读未运行检查 |
| S08-p4c | 显式同坐标输入绑定契约；依赖 S08-d4 已核定的信号口径缺口和 Spec §9 | Schema 新建 `backtest-price-input-bindings.ts`、`test/backtest-price-input-bindings.test.ts`，最小修改 `backtest-v2.ts`、`index.ts`；Schema build 输出已释放 | Luna / `/root/s08_price_bindings_contract` | closed | worker_done；定向 4/4、Schema typecheck/build、目标 ESLint、独立文件 Prettier、diff check 通过。V3 字段 optional 无默认，V2 严格拒绝；共享 backtest-v2.ts 的既有 Prettier 差异未重排 |
| G0-H-cal | 目标标的预热期可使用有来源的 2026 深市日历；依赖已核实的官方全年休市公告 | DSA `thesis_ledger_market_v3_facts.py`、专属日历测试及原 V3 日期边界断言、来源能力说明与 CHANGELOG；不修改 admission/credentials/runtime | 协调者 / 主仓共享工作区 | local | verified；日历/Data V3/固定目标/HiThink窗口合同四文件 79/79，py_compile、目标flake8、diff check通过；初次旧范围断言失败已迁移到2025/2027边界，目标59日不变。仅日历证据，不等同Provider准入 |
| S08-p4f | 非价格依赖事实及证据可严格冻结/离线校验；依赖 S08-d4 与现有 DSA facts Schema | 新建 Server dependencies、dependency-validation 及专属测试；不改 Builder/Store/Schema/台账 | Luna / `/root/s08_dependency_facts` | closed | worker_done；定向7/7、Server typecheck、目标ESLint/Prettier通过。可信空事件以独立证据和 empty-dataset 占位表达；后续集成归 S08-p4b/v |
| S09-hd | 核定固定快照的实际观测时间与历史决策时钟是否分离；依赖 Spec §6、S09-d2 | DSA Data V3 行时间映射、Server exchange、Domain series/evaluator 只读 | 协调者 / 主仓共享工作区 | local | verified；两次 spawn 容量拒绝均未建会话，父级完成只读核查：V3 response 调用旧 `_bar_series_point` 回填历史收盘；exchange ticks及Domain align/indicators按availableAt裁剪，不能直接消费真实观测时间。必须分别修复来源时间与显式研究clock，不能提前执行 |
| S08-p4p | 显式绑定映射为单份执行行情与真实依赖闭包；依赖 S08-p4c 和 S06 planner | 新建 input-plan 及专属测试 | 协调者 / 主仓共享工作区 | local | verified；定向4/4、Server typecheck、ESLint通过；精确 source 集合、身份/周期/基准、预热、拒绝未实现 FX/NAV。计划 helper 不伪造数据就绪 |
| S05-t1 | V3 原生行情保留真实观测可用时间；依赖 S09-hd、Spec §6/AC12 | DSA `api/thesis_ledger.py` 时间映射接缝、现有V3测试、来源说明/CHANGELOG；旧V2映射语义不变 | 协调者 / 主仓共享工作区 | local | verified；V3相关三文件44/44、旧V2回归8/8，py_compile、限定语法/未定义flake8通过；最终与日历合并五文件87/87。保留历史timestamp与complete判定，真实availableAt另由S09-hs消费；无部署或真实Provider运行证据 |
| S08-p4v1 | 将执行窗口证据校验收敛到独立模块；依赖 S08-p3 | Store 提取 execution-evidence，保留存取与生命周期 | 协调者 / 主仓共享工作区 | local | verified；原窗口/模型/输入计划三文件12/12、Server typecheck/目标ESLint通过；后续完整性接线单列验证 |
| S08-p4v2 | 完整快照离线复算闭包、绑定、事实、规则与日历一致性；依赖 S08-p4v1/p4f/p4p | completeness、calendar-alignment、Store 及完整冻结测试 | 协调者 / 主仓共享工作区 | local | verified；完整冻结5/5、九文件组合54/54通过，最终并入§12.2的65/65。拒绝缺失/篡改、日历冲突和不兼容规则，校验预热及首个交易时点事实；仅当前同坐标日线闭包 |
| S08-p4b | Builder 完整冻结显式价格别名与非价格事实；依赖 S08-p4v2/p4f/p4p | V3 Builder、DsaSnapshotBuilder最小接线及共用fixture/完整冻结测试 | 协调者 / 主仓共享工作区 | local | verified；一次价格读取对应execution/signal/benchmark三种逻辑用途，8个artifact的合成完整快照可断网回放；缺失事实不finalized。组合54/54、最终65/65通过；旧无绑定partial保留，目标运行态未验 |
| S09-hs | 显式固定快照研究clock贯通series/指标/估值/执行；依赖 S09-hd、S05-t1 | 由hs1、hs2、hs3分别承担Domain可见性、Server装配及尾日边界 | 协调者 | local | 当前日线叶子已验证；真实availableAt保持不变，显式历史决策clock仅用于固定快照研究，严格PIT保留原门禁。独立Runner/API/真实运行不属于本组已验证结果 |
| S08-p4v3 | 非价格上下文及可信空事件可进入共同区间指纹；依赖 S08-p4f/p4v2 | comparable-data 模块与3项测试，Store调用 | 协调者 / 主仓共享工作区 | local | verified；3/3通过；保留期初适用事实与真实观测，排除预热行情及日历请求范围，不把空占位当事件 |
| S09-hs1 | Domain 价格事实、指标与表达式传播显式研究时钟；依赖 S09-hd、Spec §6.1 | observation-clock；series/indicators/evaluator/simulation、valuation/sizing/risk/exchange 的可见性接缝及测试 | 协调者 / 主仓共享工作区 | local | verified；专属8/8及Domain全包31文件297/297、typecheck/build通过。覆盖真实观测保留、冻结截点、未收盘不可见、混合截点拒绝和严格PIT不变；风险派生信号使用evaluationAt，来源事实仍保留原始时间 |
| S09-hs2 | Server 从冻结日历装配研究价格时钟并贯通估值与执行；依赖 S09-hs1 与 S08-p4b/v | 日线会话时间、research-clock、exchange/指标投影及定向执行测试；Domain归一化清仓必要接缝 | 协调者 / 主仓共享工作区 | local | verified；完整快照→历史收盘信号→下一交易日开盘买卖、估值、不可变Artifact及确定性复放通过；归一化清仓采用账本派生的零目标权重，不套用真实股数。新研究执行3/3，Server组合65/65、typecheck及目标ESLint/Prettier通过；结果仍是vertical内部输出，未封装生产V3结果 |
| S09-hs3 | 尾日信号保留到期未成交原因；依赖hs1/hs2与Spec AC05 | Domain engine/sizing-adapter/exchange 的边界判定，Server最后一个tick及结果完整性投影、相应测试 | 协调者 / 主仓共享工作区 | local | verified；尾日模型按意图时间复核，缺下一Bar记录DAY_EXPIRED，区间内缺报价仍PRICE_UNAVAILABLE；尾日正常到期不导致analytics unavailable。Domain adapter新增2项、Server新增尾日1项均纳入§12.2最终回归；不取区间外行情补成交 |

S08-p4 作为完整冻结分组保留：当前同标的日线闭包已集成；独立价格、FX/NAV 及事件运行覆盖按既有任务继续处理。M1 同坐标路径通过不能替代整个分组。S09-r 仍需消费完整快照，产出严格 V3 result/benchmarkCompatibility 并接入持久化生命周期；本轮没有启动普通回测作业或AI实验。

G0-H-cal 输入证据：2026-09-25 重新检索[深交所全年休市公告](https://www.szse.cn/disclosure/notice/t20251222_618087.html)取得官方全文，2026 休市区间为 01-01..01-03、02-15..02-23、04-04..04-06、05-01..05-05、06-19..06-21、09-25..09-27、10-01..10-07，另按周末休市；不把调休周末视为交易日。此证据只覆盖该公告声明的 2026 深市交易日历，不扩成跨市场/跨年份身份或交易状态事实。Docker 只读检查当前无法连接 `desktop-linux` daemon，数据库与目标运行态门禁未执行。

## 12.2 本轮收口检查（2026-09-25）

结果适用于 §12.1 当前工作区输入：主仓 `main@fe0e871e` 加未提交改动，DSA `yzin@f497b6da` 加未提交改动；这两个 HEAD 不单独代表受测代码。收口时主仓 192 项变更、DSA 29 项变更，infra 工作区干净；保留用户其他 WIP，无提交、PR 或部署。

| 检查 | 命令或输入范围 | 最后结果与边界 |
| --- | --- | --- |
| Domain 全包 | `rtk proxy pnpm --filter @thesis-ledger/domain test` | 31 文件、297/297 通过；包含双时钟8项、sizing13项、adapter8项及原有Exchange/ledger/规则回归 |
| Domain 静态与构建 | `rtk proxy pnpm --filter @thesis-ledger/domain typecheck`；`rtk proxy pnpm --filter @thesis-ledger/domain build` | 通过；没有用编译替代真实数据/模型验收 |
| Server 定向组合 | 下方列出的13个测试文件 | 65/65通过；完整冻结、离线回放、篡改/日历冲突、共同区间指纹、双时钟买卖/尾日及V2回归 |
| Server 静态 | `rtk proxy pnpm --filter @thesis-ledger/server typecheck` | 通过；尚无独立V3 Runner/结果封装与完整生产生命周期 |
| DSA 定向组合 | 下方列出的5个测试文件 | 87/87通过，6个第三方弃用/测试收集警告；fake adapter与合成数据，不是本轮Provider请求证据 |
| 目标代码规范 | `rtk proxy pnpm exec eslint <本轮Domain/Server源文件与测试>`；`rtk proxy pnpm exec prettier --check <同范围，排除既有indicators格式差异>` | 通过；包含所有新增快照、研究时钟及其测试。旧 `backtest-indicators.ts` 的既有排版与共享 Schema 既有排版未批量重排，不据此宣称全仓格式通过 |
| 模块与依赖 | `rtk proxy node scripts/check-boundaries.mjs`；`rtk proxy node scripts/check-workspace-dependencies.mjs` | 通过；复用现有Server→Domain/Schema方向，未引入新的跨feature反向依赖 |
| 差异卫生 | 主仓及DSA：`rtk proxy git diff --check` | 通过；未stage/reset/clean用户WIP |

Server 定向组合的完整入口（主仓执行）：

```sh
rtk proxy pnpm --filter @thesis-ledger/server exec vitest run \
  test/backtest/v3-complete-snapshot.test.ts \
  test/backtest/v3-comparable-data.test.ts \
  test/backtest/v3-snapshot-builder.test.ts \
  test/backtest/backtest-snapshot-v3-input-plan.test.ts \
  test/backtest/backtest-snapshot-v3-dependencies.test.ts \
  test/backtest/v3-run-lifecycle.test.ts \
  test/backtest/v2-snapshot-builder.test.ts \
  test/backtest/snapshot.test.ts \
  test/backtest/snapshot-execution-model.test.ts \
  test/backtest/v3-research-execution.test.ts \
  test/backtest/daily-bar-session.test.ts \
  test/backtest/v2-adjusted-indicators.test.ts \
  test/backtest/v2-execution.test.ts
```

DSA 定向组合的完整入口（相邻DSA仓库执行）：

```sh
rtk proxy .venv/bin/python -m pytest -q \
  tests/test_thesis_ledger_market_v3_calendar.py \
  tests/test_thesis_ledger_market_v3.py \
  tests/test_thesis_ledger_data_v3_target_pins.py \
  tests/test_thesis_ledger_hithink_market_v3_contract.py \
  tests/test_thesis_ledger_market_v2.py
```

本轮中间发现的风险信号时间、归一化清仓与尾日模型缺失误判均已有定向回归，最终组合无失败。Schema绑定4/4及Schema typecheck/build沿用本轮较早结果，其输入此后未变。全仓test/build/格式门禁、Desktop既有V3表单类型缺口、隔离数据库、目标Docker、真实Provider普通Run、UI/Electron、AI及发布验收没有新增通过证据；不得合并计入本表的本地测试结果。

## 12.3 Runner 续接实施（2026-09-25 至 2026-09-26）

从收尾交接继续；基线仍为主仓 `main@fe0e871e` 与 192 项既有未提交改动。沿用完整 Spec、S08-p4 完整冻结和 S09-hs 双时钟结果，不重复建设已完成契约。S09-r 拆为以下独立叶子；协调者独占本文档，不修改代理独占文件。

| ID | 目标与依赖 | 独占写入范围 | 所有者 / 会话 | 派发 | 状态与验证 |
| --- | --- | --- | --- | --- | --- |
| S09-r1 | complete Snapshot 离线执行并返回严格 V3 结果；依赖 S08-p4、S09-hs | 新增 `apps/server/src/backtest/backtest-v3-runner.ts` 与 `apps/server/test/backtest/v3-runner.test.ts` | Luna / `/root/s09_r1_runner` | closed | needs_split；严格离线入口、完整 refs/metadata/hash/取消校验及 V3 披露已实现，3文件12/12测试、目标 ESLint/Prettier通过。拒单缺 side 时显式抛错，完整结果交付待 r1j；Server typecheck待组合稳定。未创建独立 result 文件 |
| S09-r2a | 同执行序列的基准计算与兼容报告；依赖已冻结绑定、领域比较契约 | 新增 `apps/server/src/backtest/backtest-v3-benchmark.ts`、`apps/server/test/backtest/v3-benchmark.test.ts` | Luna / `/root/s09_r2a_benchmark` | closed | worker_done；8/8定向测试、ESLint/Prettier通过，含真实Builder→vertical→helper组合、比例成本数值/零成本版本/不兼容/未来观察/预热/哈希。raw/NAV及非比例费用仍不可用，不能视为B05全部验收 |
| S09-r2b | 将 r2a 基准结果接入严格 V3 结果并验证组合；依赖 r1/r1j/r2a | `backtest-v3-runner.ts`、`v3-runner.test.ts` | Luna / `/root/s09_r2b_result_integration` | closed | worker_done；输出benchmarkCompatibility、合并warnings/保守完整性、最终checksum；4文件22/22与目标ESLint/Prettier通过，含比例成本数值/最低费不可用/确定性/基准改变checksum；未修改Schema |
| S09-r2e | 导出现有领域基准比较与计算能力 | `packages/domain/src/index.ts` | 协调者 / 本地 | local | worker_done；r2a测试确认现有helper未从包入口导出，已补公共export，`rtk proxy pnpm --filter @thesis-ledger/domain build`通过；边界门禁随最终组合执行，算法未变 |
| S09-r3 | 生命周期与 Worker 的版本化接线 | 依赖 r1/r2，领取、终态、取消、重试分别定界 | 见r3a/r3b/r3c叶子 | local | 部分完成；CAS与Worker注册/执行已接通，普通创建与V3 retry仍待r3c3，当前保持失败关闭 |
| S09-r3a | 现有执行领取和终态的 attempt 隔离前置；依赖 S09-d2 已有状态机 | `backtest-v2-run.ts` 的 runV2 委托、独立 `backtest-run-attempt.ts`、新 `run-attempt-isolation.test.ts` | Luna / `/root/s09_r3a_attempt` | closed | worker_done；执行按实际 attempt CAS 收敛，旧 controller 不删除新所有者；新增7项竞态，3文件14项定向测试及 ESLint/Prettier通过；组合类型检查待稳定。V3仍拒绝，手动retry代际保留r3b |
| S09-r1j | 拒单方向贯穿 simulation/vertical/结果；依赖 r1 checkpoint | `packages/domain/src/backtest-simulation.ts`、`apps/server/src/backtest/backtest-v2-execution-shared.ts`、新 Runner 及其测试、Domain新拒单方向测试 | Luna / `/root/s09_r1j_rejects` | closed | worker_done；订单/fill保留真实side，非订单诊断进入warnings，缺失半边身份仍拒绝；买卖尾单均保留DAY_EXPIRED且无区间外成交。Domain全包曾300/300、最终定向26/26，Server Runner+research8/8，Domain build和目标ESLint/Prettier通过；后续组合验收仍待完成 |
| S09-r3b | 手动重试代际与队列取消/投递竞争隔离 | r3b1/r3b2及f3共同覆盖retry、execution-owner、queue/processor/reconciler | 见对应叶子 | closed | worker_done；retry切换即分配新编号、每轮预算不变，取消/诊断/恢复均受状态与attempt保护；组合验证见v3，当前V3 retry仍待r3c接线 |
| S09-r3b1 | 队列取消与投递诊断不覆盖新 attempt 或终态；依赖 r3a | `backtest-queue.service.ts`、`backtest.service.ts` 仅cancel方法及必要导入、独立取消helper与新竞态测试 | Luna / `/root/s09_r3b1_queue_cas` | closed | worker_done；状态/attempt CAS，竞争失败不删除队列消息或中断新attempt；查询异常不add。新旧3文件15项测试及ESLint/Prettier通过 |
| S09-r3b2 | 手动retry不重用执行所有权编号；依赖 r3a | `backtest-v2-run.ts` 仅retry、execution-owner、processor、queue.reconciler 的预算上限、独立retry预算helper、新测试及两组旧测试预期 | Luna / `/root/s09_r3b2_retry_budget` | closed | worker_done；executionAttempt单调、原attempt CAS、input.retryAttemptBase；领取与reconciler共用每轮绝对上限。新增9项、6文件组合30/30，目标ESLint/Prettier通过；证据 `/private/tmp/s09-r3b2-focused-tests.log`；V3 retry仍拒绝 |
| S09-v1 | 稳定批次组合验证 | 只读源码；可生成Server构建输出及 `/private/tmp/s09-v1-*` 证据 | Luna / `/root/s09_v1_validation` | closed | blocked；Server typecheck失败53条，日志见下文；按验证阶梯停止，未执行build/full test或更高门禁，责任已分配f1/f2/f3 |
| S09-r3c | V3完整快照沿既有lane执行并持久化严格结果 | 依赖r2b/r3a/r3b1/r3b2；分r3c1及r3c3 | 协调者规划 | local | 部分完成；r3c1已验证双Module、版本/冻结身份/结果checksum拒绝、真实Runner经mock DB提交及旧V2；create→queue→claim→result→read完整闭环待r3c3，真实DB/Docker仍由I01/G门禁负责 |
| S09-r3p | 只读确定生命周期接线的最小可验证边界 | 只读已稳定的lifecycle、v2-run、service、双Module和现有测试；不读取正在修改的Runner/benchmark | Luna `/root/s09_r3p_lifecycle_scope` | closed | worker_done；创建仍失败关闭，runV2拒绝V3，双Module仅V2注册；通用queue/CAS可复用。结果读取通用透传但Desktop仅识别V2，UI须另叶。共享写入集中v2-run，创建/执行/重试须串行或提取接缝后再分工；只读无测试 |
| S09-r3c1 | Worker按合同版本执行并验真V3结果；依赖离线Runner定向、Server typecheck/build、f5/f6回测fixture通过 | `backtest-v2-run.ts` 执行委托/DI、双Module、独立版本化执行验真helper和新集成测试；V3Runner token声明；`run-attempt-isolation.test.ts`补明确V2身份 | Luna `/root/s09_r3c1_versioned_execution` | closed | worker_done；按持久版本分派、DB/Store完整清单一致、严格结果及checksum验真后CAS；双Module注册。4文件21/21、目标ESLint/Prettier通过；Server typecheck仅f5 fixture1条待f7。导出loadVerifiedBacktestV3Snapshot供retry复用；创建/retry未开放 |
| S09-r3c2 | 完整V3创建入队并允许冻结快照重试；依赖r3c1/f7 | 原计划lifecycle、v2-run创建/retry、执行helper及对应测试 | Luna `/root/s09_r3c2_create_retry` | closed | needs_split；用户要求收尾时尚未修改源码，在只读checkpoint终结；没有实现或测试证据，续接用新ID r3c3，不复用会话 |
| S09-r3c3 | 续接c2的完整V3创建入队与冻结快照重试 | `backtest-v3-run-lifecycle.ts`、`backtest-v2-run.ts`创建/retry委托、`backtest-v3-run-execution.ts`冻结Job配置校验、v3 lifecycle/execution及新闭环测试 | Luna `/root/s09_r3c3_create_retry` | closed | blocked；会话中断后活动列表已无此worker，入口仍失败关闭，未发现r3c3测试产物或完成回报；不计实现与验证完成，剩余义务转r3c4 |
| U03-p1 | Desktop V3类型与数据消费只读勘查 | 只读Desktop/api-client/Schema稳定源码；不设计或修改视觉 | Luna `/root/u03_p1_desktop_contracts` | closed | worker_done；Desktop typecheck仅2条TS2739：StrategyExperimentCreatePage:265、StrategyOptimizationExperimentPanel:239均用V2配置供V3创建。StrategySections:594仅识别2，strategy.types:87缺V3，disclosure未消费协议/actualSources/benchmarkCompatibility；显式协议和模型输入接缝须先落实，不用断言或虚构默认。日志 `/private/tmp/u03-p1-desktop-typecheck.log`；锁定shadcn查询确认Base/lucide/已有组件，无源码修改 |

r1 执行包：只从 `LocalSnapshotStore.v3.replay(runId)` 验证后的 finalized complete manifest 取冻结输入；核对调用方 Snapshot/Artifact 身份，不接受子集、重复或外来 ref。读取唯一 V3 metadata 并核对 manifest 中策略/运行配置身份，复用真实 exchange vertical；不联网、不写业务数据库。结果必须经过 `backtestResultSchemaV3`，保留协议、来源、共同数据指纹、模型披露、买卖与未成交事实及确定性 checksum。局部验证使用新 Runner 测试、既有 V3 研究/完整冻结回归和 Server typecheck；以现有 fixture 证明离线生产入口，不声称 Provider/运行态验收。若发现必须修改共享契约或 vertical，先报告接缝并拆叶。计划预检通过：结果封装是一条 Server 离线路径，写入集独占；基准、生命周期和全部真实门禁独立保留。

r3a 执行包：提取现有 `runV2` 的一次执行职责，保留 public service/Runner 合同、V2/V3 当前允许范围和队列行为；已有文件不得继续增长。领取、成功、失败、取消确认均限定状态与实际 attempt；取消请求发生于执行结束前时，成功不得覆盖取消，旧 attempt 不得取消或失败覆盖新 attempt。controller 注册/删除按本次所有权，旧回调不能删除新 controller。测试使用可控延迟和 mock Prisma CAS 验证竞争，而非只断言实现细节。定向现有 V2 执行/lifecycle 回归；共享 typecheck/build 留待所有写入稳定。手动 retry 重置编号涉及队列代际，保留 r3b 专项，不能以此叶声称全生命周期完成。

r2a 的评价约定已同步 Spec §5.4：首末评价收盘、冻结成本版本、区间内对齐及不可用语义。r2b 接入时须合并基准警告和保守完整性：基准无法比较时不得将结果描述为全部指标完整；原有 unavailable 不得降为 partial/complete。最低收费等基准经济实现仍属于 B05 的当前义务，明确不可用只证明失败关闭，不表示整个成本验收通过。

r3b2 执行包：沿用持久化 `executionAttempt` 作为不重用的所有权编号；手动 retry 用 failed+原 attempt 的 CAS 切回 queued，保留编号，在现有 `Job.input.retryAttemptBase` 记录新预算起点。该内部元数据不进入 RunConfig/Snapshot checksum；旧记录默认起点0，非法或超前起点拒绝。execution-owner 返回下一编号及本轮绝对上限，processor 转发实际上限，仍按原自动重试次数停止。旧 pending 回调的编号不能在新一轮重用，旧 attempt 结果提交仍由 r3a CAS 阻断；若 queued 取消尚未创建新 attempt，取消状态条件仍优先。测试覆盖两轮重试预算、迟到旧回调、同一failed并发retry、非法预算与旧记录兼容；不通过清零编号刷新预算。

r3b2 测试写入补充：`durable-owner-recovery.test.ts` 的两处领取返回值断言及V2 input fixture同步绝对预算上限；这些是已知接口结果形状的定向回归更新，其余恢复场景保持原义。

r2b 验证中误用 `pnpm test` 参数而启动全Server套件：171文件，5失败/151通过/15跳过；测试12失败/1044通过/49跳过。失败分布为 `ai-provider-onboarding-http` 1、`backtest-dependency-plan` 6（executionModel/normalizedExecution fixture与当前Schema冲突）、本轮 `v3-runner` 1（不支持的toBeFinite matcher，已改并在定向组合通过）、`strategy-optimization-cost-boundary` 3、`strategy-optimization-discovery` 1。未落盘完整日志；以上仅为代理保留的失败摘要。该次运行发生于并行写入期间，不是稳定全包验收，不将其余失败归类为已解决；Runner/benchmark/research/complete-snapshot四文件随后准确执行22/22通过。

本批次稳定复核发现（2026-09-26）：Server typecheck失败53条诊断，主要为新benchmark/runner的可选值与Schema推导类型、将共享vertical rejects过窄改为SimulationReject导致的旧NAV兼容、attempt可选参数与新测试fixture类型。`/private/tmp/s09-v1-server-typecheck.log`为证据，build/full test未越级执行。另有三个语义反例待修：基准连续费率公式忽略逐项分币舍入；retry在领取前沿用编号可令旧queued观察跨failed→queued再次命中CAS；reconciler未将Worker缺失且已请求取消的任务收敛为cancelled。这些发现阻断r3c开放，不能以此前定向通过替代。

| 修复叶子 | 独占写入与目标 | 所有者 / 派发 | 状态 |
| --- | --- | --- | --- |
| S09-f1 | Runner/vertical共享拒单投影及类型修复；Runner、shared vertical、Runner测试。保留NAV原有宽code及可选诊断元数据，V3单独严格校验 | Luna `/root/s09_f1_projection_types` / closed | worker_done；严格parse后适配Strategy表达式类型；缺订单ID/side仍失败关闭，NAV保留兼容。Runner/research 9/9、V2 execution/NAV 3/3及目标ESLint/Prettier/diff通过；精确现金golden由f2独立测试承担 |
| S09-f2 | 基准分币成本与类型；benchmark helper/测试、新成本helper，Domain归一化预算纯函数及adapter定向复用与包导出 | Luna `/root/s09_f2_benchmark_fees` / closed | worker_done；逐项halfUp(2)、初始现金/剩余现金、滑点及40位连续数量预算；成本身份含完整费用表、舍入与本金；异币初始现金无FX时不可用。Domain两文件11/11及build、Server benchmark 9/9、目标ESLint/Prettier/diff通过；含1/3/1.67小金额独立golden；共享静态检查待组合 |
| S09-f3 | retry切换即推进所有权编号、取消恢复；v2-run retry/可选execution、retry预算helper、reconciler与相应测试 | Luna `/root/s09_f3_retry_cancel` / closed | worker_done；retry即分配N+1并以同值为预算起点，领取再增；取消确认要求成功队列查询与status/attempt/取消字段CAS。最终6文件38/38、ESLint/Prettier通过，含3轮9次执行预算、queued ABA/probe取消/active与异常不误取消及编号溢出拒绝；组合静态检查待完成 |
| S09-v2 | f1/f2/f3稳定后的组合验证；只读源码，独占Server构建输出及 `/private/tmp/s09-v2-*` 日志 | Luna `/root/s09_v2_validation` / closed | blocked；typecheck剩5条：benchmark routeKey 2、费用fixture联合1、成本返回类型联合2。证据 `/private/tmp/s09-v2-server-typecheck.log`；未越级build/full test，交f4 |
| S09-f4 | 收敛benchmark剩余5条类型错误；仅benchmark helper、cost helper、benchmark测试 | Luna `/root/s09_f4_benchmark_types` / closed | worker_done；闭包routeKey显式bar收窄，fixture使用Schema推导的segment/费用，成本返回精确联合；Server typecheck、benchmark9/9、目标ESLint/Prettier通过；证据 `/private/tmp/s09-f4-*` |
| S09-v3 | f4后稳定组合验证；只读源码及独占Domain/Server验证输出 | Luna `/root/s09_v3_package_validation` / closed | blocked；Domain33文件303/303与Server build通过；Server4文件失败/153通过/15跳过，11项失败/1057通过/49跳过，未执行仓库门禁。证据 `/private/tmp/s09-v3-domain-tests.log`、`s09-v3-server-build.log`、`s09-v3-server-tests.log`；10项为归一化模型fixture，另1项已有AI格式重试预期差异 |
| S09-f5 | 依赖计划测试与当前归一化执行模型契约对齐；独占 `apps/server/test/backtest/backtest-dependency-plan.test.ts` | Luna `/root/s09_f5_dependency_fixture` / closed | worker_done；normalized配置提供完整模型/假设，raw保留原模型；改用有效持仓成本坐标保持signal/执行双转换断言。10/10、ESLint/Prettier通过，证据 `/private/tmp/s09-f5-{vitest,eslint,prettier}.log`；生产Schema未改 |
| S09-f6 | 优化成本/发现测试与当前归一化执行模型契约对齐；独占 `apps/server/test/strategy-optimization/strategy-optimization-postgres-fixtures.ts` 及cost-boundary/discovery两个测试 | Luna `/root/s09_f6_optimization_fixture` / closed | worker_done；新增显式createNormalizedRunConfig，原runConfig/V2 fixture不带V3字段；两mock文件15/15、ESLint/Prettier/diff通过，未连接PostgreSQL |
| S09-f7 | f5 fixture剩余类型收窄；独占 `apps/server/test/backtest/backtest-dependency-plan.test.ts` | Luna `/root/s09_f7_dependency_fixture_types` / closed | worker_done；首次spawn无会话、c1结束后成功绑定；用fees非空判别收窄完整segment联合，保留10项原断言。定向10/10、ESLint/Prettier及最终Server typecheck通过；日志 `/private/tmp/s09-f7-*` |
| S09-v4 | 按用户收尾指令验证当前稳定交付；c2已只读checkpoint终结 | Luna `/root/s09_v4_wrapup_validation` / closed | blocked；回测+优化44文件43通过/1失败，225项224通过/1失败，旧v3生命周期测试仍期待旧Runner未就绪文案；未继续build/full test/门禁。日志 `/private/tmp/s09-v4-target.log`，交f8最小修复 |
| S09-f8 | 同步旧V3缺Runner诊断断言并完成收尾验证；独占 `apps/server/test/backtest/v3-run-lifecycle.test.ts` 的旧断言及Server验证输出 | Luna `/root/s09_f8_wrapup_assertion` / closed | worker_done；仅同步缺Runner诊断，原失败/CAS/不执行断言保留；44文件225/225、目标ESLint/Prettier、Server typecheck/build通过。全Server仅已知AI失败1项，157文件/1074项通过、15文件/49项跳过；低成本边界/依赖/文件尺寸/diff门禁通过。详见§12.4 |

2026-09-26用户要求收尾并handoff：只收口当前c2已派发叶子及必要验证，遇新范围问题留下安全checkpoint；其余实施队列保持pending。最终交接放系统临时目录并引用本文，不复制台账。

v3验证的范围外失败：`ai-provider-onboarding-http.test.ts:167` 预期schema_invalid产生两次请求，当前 `ai-provider-validation-runner.ts` 仅对明确unsupported format重试，实际一次。该测试自身已有5增3删WIP，本次保留；其余“不保存、保留已报usage、schema_mismatch”断言未失败。全Server套件仍不能标通过，回测定向检查与该已有AI契约预期差异分开记录。

本轮集中复核已覆盖离线Runner的严格metadata/ref/身份校验、买卖拒单和非订单诊断投影、基准区间对齐与分币现金账本、NAV兼容、retry代际及取消恢复。发现的舍入、queued ABA、丢失Worker取消和静态类型问题分别由f1–f4及对应回归覆盖。新增生命周期接线及其最终组合证据仍需接续复核；本段不替代§13整体Review。

## 12.4 本轮收尾检查（2026-09-26）

用户要求收尾后，c2在无源码修改的只读checkpoint终结；新增实施暂停在该自然边界，下一叶为r3c3。下列证据对应本轮最终稳定源码：主仓 `main@fe0e871e`，218项dirty；DSA `f497b6da`，29项dirty；infra `9a1f037`，干净。没有stage、commit、部署或真实Provider/AI请求。

| 层级 | 命令或输入范围 | 最后结果与证据 |
| --- | --- | --- |
| Domain全包 | `rtk proxy pnpm --filter @thesis-ledger/domain exec vitest run` | 33文件303/303；源码与依赖此后未变，沿用 `/private/tmp/s09-v3-domain-tests.log`；Domain build沿用f2通过结果 |
| Server受影响组合 | `rtk proxy pnpm --filter @thesis-ledger/server exec vitest run test/backtest test/strategy-optimization/strategy-optimization-cost-boundary.test.ts test/strategy-optimization/strategy-optimization-discovery.test.ts` | 44文件225/225；`/private/tmp/s09-f8-target.log`。覆盖本地快照/Runner/结果、V2兼容、领取/重试/取消和相关优化fixture；mock环境，不代表真实DB/队列 |
| Server静态与构建 | `rtk proxy pnpm --filter @thesis-ledger/server typecheck`；同包 `build` | 通过；`/private/tmp/s09-f8-typecheck.log`、`s09-f8-build.log` |
| Server全包 | `rtk proxy pnpm --filter @thesis-ledger/server exec vitest run` | **未通过**：1文件失败/157通过/15跳过，1项失败/1074通过/49跳过；仅保留上述已有AI请求数断言差异。`/private/tmp/s09-f8-fullsuite.log`，不据此宣称全Server验收通过 |
| 本轮代码规范 | 各叶独占源文件/测试的ESLint、Prettier；最后f8目标文件 | 通过；每叶记录见§12.3，最后 `/private/tmp/s09-f8-eslint.log`、`s09-f8-prettier.log`。没有批量格式化其他WIP，不宣称全仓格式通过 |
| 低成本结构与卫生检查 | `rtk proxy node scripts/check-boundaries.mjs`；`check-workspace-dependencies.mjs`；`check-file-size-guardrails.mjs`；`rtk proxy git diff --check` | 通过；`/private/tmp/s09-f8-{boundaries,workspace-dependencies,file-size,diff-check}.log`。这些与全包测试失败分开记录，未进入更高成本运行态验证 |
| Desktop只读类型检查 | U03-p1中的Desktop typecheck | 未通过：2条TS2739（两处V2配置用于V3优化创建），`/private/tmp/u03-p1-desktop-typecheck.log`；无前端修改/构建/浏览器或Electron新增验收 |

集中复核确认：离线Runner、基准现金计算、任务所有权隔离与Worker版本化接线已通过上述局部门禁；创建/retry及冻结Job配置校验缺口明确留在r3c3，整体入口仍失败关闭。最低费等完整基准范围、Desktop/API client消费、隔离数据库、目标Docker、普通真实回测、独立数学对照、AI、M2/M3与发布门禁仍未完成。全Server已知AI测试差异保留，不更改范围外WIP。Task保持active，§13继续未勾选。

交接文档：`/private/tmp/thesis-ledger-backtest-handoff-2026-09-26-wrapup.md`；当前所有已派发worker均已终结，后续按pending叶子新建会话。

## 12.5 创建与重试续接（2026-09-26）

用户以 `/private/tmp/thesis-ledger-backtest-handoff-2026-09-26-wrapup.md` 明确要求继续实施。重新核对基线：主仓 `fe0e871e` 有218项dirty，DSA `f497b6da` 有29项dirty，infra `9a1f037` 干净。上节为上一轮历史收尾证据，本轮新增修改须重新验证其影响范围。

执行方式更新：按用户最新指令，已启动的r3c4和U03-p2完成各自限定任务后，后续实施与验证由协调者直接承担。

r3c3规划预检：复用已验证的Builder、Store、Runner及队列CAS，主要执行面为Server任务生命周期；partial失败关闭、冻结身份、幂等与attempt隔离均属于本叶的必要正确性。独占写入集见§12.3，新闭环测试限定 `apps/server/test/backtest/v3-create-retry-integration.test.ts`；其他共享契约、Schema、数据库、Desktop及部署不在本叶写入范围。worker负责局部自审和定向验证，协调者独占本Task及最终一致性复核。生产运行态由I01/G门禁继续承担。

| 续接叶子 | 目标与独占写入 | 所有者 / 会话 | 派发 | 状态与证据 |
| --- | --- | --- | --- | --- |
| S09-r3c4 | 续接r3c3中断后的创建、冻结重试及Job配置一致性；沿用r3c3写入集与本地闭环验收 | Luna `/root/s09_r3c4_create_retry` | closed | worker_done；complete创建queued/派发，partial及缺Runner/Queue失败关闭；Job双配置、checksum、日期/协议验真与原快照retry；4文件29/29、目标ESLint/Prettier通过，日志 `/private/tmp/s09-r3c4-*`。组合静态/构建与复核交v5 |
| U03-p2 | 承接p1，仅只读确定严格RunConfigV3所需价格协议与模型的真实准备/获取入口，输出可实施接缝；源码只读，报告限 `/private/tmp/u03-p2-contract-seam.md` | Luna `/root/u03_p2_contract_seam` | closed | worker_done；现有目录只有能力/revision，preflight要求既成协议且无HTTP入口；需Server从实际来源事实与用户模型/历史选择准备RunConfig。报告已落盘；无源码修改或测试 |
| S09-v5 | r3c4稳定后验证Server受影响回测/优化组合、typecheck/build及结构门禁；源码只读，独占Server构建输出，日志限 `/private/tmp/s09-v5-*` | 协调者 | local | 本地回测验证通过，整体门禁未通过；首次typecheck的12条错误由f9修复。最终受影响45文件242/242、typecheck/build通过；全Server保留1项已有AI失败，带HEAD基线的文件尺寸检查发现8处已有WIP违规，详见下表 |
| U03-c1 | 已冻结V3创建合同的API client传输支持；仅 `packages/api-client/src/index.ts` 的createRun参数与类型导出，以及新增 `packages/api-client/test/backtest-v3-transport.test.ts` | 协调者 | local | 已实现并通过局部验证；定向2文件8/8、全包4文件25/25、typecheck/build、目标ESLint/Prettier通过。V2兼容、V3协议原样传输、结果元数据与诊断保留；不构造价格协议，不接Desktop |
| S09-f9 | 修复创建manifest哈希类型与新闭环测试mock/空值类型；补齐创建时日期区间验真及自洽哈希反例 | 协调者 | local | 完成；仅lifecycle源文件及v3生命周期/新闭环测试。31/31定向、最终typecheck通过；创建区间不一致失败且不入队。最后mock类型标注后单独重跑闭环5/5及ESLint/Prettier |

U03-c1规划预检：Server Controller当前返回持久化Job，V3仍使用mode=V2且版本身份在input中；该形状可由既有passthrough响应合同读取，并不符合要求顶层contractVersion/snapshotVersion的严格V3摘要Schema。因此本叶扩展现有createRun请求类型，继续解析实际共享Job响应，不假定尚未投影的V3摘要。准备配置HTTP合同、revision失效与Desktop消费另归U03后续叶；共享合同变化须先更新Spec。

### 本次验证与证据范围

| 层级 | 命令或输入 | 结果 |
| --- | --- | --- |
| Server定向与组合 | `pnpm --filter @thesis-ledger/server exec vitest run test/backtest test/strategy-optimization/strategy-optimization-cost-boundary.test.ts test/strategy-optimization/strategy-optimization-discovery.test.ts`；f9后的全包中同一范围 | 首轮45文件240/240，`/private/tmp/s09-v5-target.log`；增加2项日期反例后，全包日志中该范围45文件242/242；最终mock类型改动后闭环5/5，`s09-v5-integration-final.log` |
| Server类型/构建 | 同包 `typecheck`、`build` | 最终通过；`/private/tmp/s09-v5-typecheck-final.log`、`s09-v5-build.log`；构建后只改了测试mock类型标注，最终typecheck与闭环已重验 |
| Server全包 | `pnpm --filter @thesis-ledger/server exec vitest run` | 未通过：1文件失败/158通过/15跳过，1项失败/1091通过/49跳过；唯一失败仍是§12.4的AI请求次数断言，`/private/tmp/s09-v5-fullsuite.log` |
| API client | 同包定向2文件、全包 `exec vitest run`、`typecheck`、`build` | 定向8/8，全包4文件25/25，类型与构建通过；仅证明共享请求/响应传输，未接Desktop或真实HTTP服务 |
| 目标代码规范 | 本轮3个Server源文件、3个测试及API client源文件/新测试的ESLint、Prettier | 通过；父级修复过mock未使用参数及局部格式，最终对应文件检查已通过 |
| 边界/依赖/差异卫生 | `node scripts/check-boundaries.mjs`、`node scripts/check-workspace-dependencies.mjs`、`git diff --check` | 通过；`/private/tmp/s09-v5-{boundaries,dependencies,diff}.log` |
| 文件尺寸ratchet | `GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs` | 未通过，8处本轮开始前已有WIP超限；`/private/tmp/s09-v5-file-size.log`。此前未提供baseline时的告警不证明ratchet通过 |

本次命令均通过RTK执行，带workspace filter时使用 `rtk proxy pnpm --filter ...`。尺寸违规位于 `ai-provider.service.ts`、`strategy-risk-application.service.ts`、`ai-provider-ui.test.tsx`、`ai-provider-management.test.ts`、`v2-execution.test.ts`、`market-bar-series-v2.test.ts`、Domain的`backtest-exchange.test.ts`和`backtest-simulation.test.ts`；本次未修改这些文件，未放宽阈值。它们继续阻断全仓门禁，按所属实施范围另行收敛，不能凭本叶局部通过消除。

本次集中复核覆盖：创建的完整性/来源身份/配置checksum/日期、缺依赖失败关闭、幂等冲突、执行与retry的双配置及Store replay一致性、attempt CAS和取消、严格结果落库与离线重跑、V2兼容、API client版本化请求与Job响应保真。发现的类型和创建日期遗漏已由f9修复；该限定本地实施范围通过复核。S09整体、I01与§13仍未完成：闭环使用真实Builder/Store/Runner及mock Prisma/Queue，读取断言针对持久化mock记录，不是隔离数据库或真实HTTP验收。

接续顺序：先为S07/U03补齐Server准备配置HTTP接缝（从实际来源事实与用户显式模型/历史选择生成RunConfigV3及revision stamp，创建前复核）；再接Desktop配置与结果消费。仍须保留最低费等B05范围、AI公平比较、隔离数据库/真实队列、目标Docker、HiThink普通回测、浏览器/Electron、M2/M3和其余全仓门禁。现有台账与TODO均未归档或移交义务。

本次结束状态：主仓220项dirty，DSA仍29项、infra未改；所有已派发worker均完成。没有stage、commit、部署、真实Provider/AI请求或数据库操作。

## 12.6 配置准备续接（2026-09-26）

剩余义务核对：上一轮创建/冻结重试及API client传输已通过局部验证，S07/U03仍缺少来源协议准备入口；Desktop、B05完整范围、AI与真实环境门禁、M2/M3均保持未完成。220项主仓dirty、29项DSA dirty及infra干净的基线未变。此次由协调者直接实施。

| 叶子 | 断言、写入与依赖 | 状态及验证 |
| --- | --- | --- |
| S09-f10 | 创建来源用途与Builder的去重语义一致；仅V3 lifecycle及真实闭环测试；AC11/AC15 | 本地完成；多个同坐标信号只要求一个signal用途记录。实际Builder→Store→Runner的本地合成测试6/6通过，未使用真实Provider |
| S07-cfg1 | 不依赖虚构价格协议即可规划信号/预热；冻结配置准备request/result；仅Schemas新合同/导出/测试及Server价格依赖计划/定向测试；AC07/AC19 | 本地完成；新增准备合同7/7，保留显式模型/历史选择；价格依赖规划与执行预检19/19。prepared限定执行行情窗口，未代表全闭包ready |
| S07-cfg2 | Server配置准备HTTP与API client消费；依赖cfg1；独立准备service/controller/helper、BacktestModule、边界检查及定向测试；AC07/AC09/AC12/AC19 | 本地完成；准备服务10/10含临时Nest HTTP，客户端传输4/4；单次统一Reader读取，来源事实/证据、配置、实际信号绑定及revision关联；不创建Snapshot/Job或调用AI。新增Market不得反向依赖Backtest的静态门禁 |
| S07-cfg3 | 准备结果在创建前失效校验及冻结期间revision复核；依赖cfg2，按下述三叶实施 | 本地完成；cfg3a/b/c已接线，创建必带preparationStamp；Market两次稳定控制面读取、创建前策略/配置/目标校验、Reader实际revisions及finalize前复核；旧幂等Run和快照retry不重新选源。定向47项（最终创建闭环18项），Schemas281项、类型/构建/目标ESLint通过；Server全包仅既有AI失败1项，1119通过/49跳过；尺寸仍8项，无新增。日志`/private/tmp/cfg3-*` |

规划预检：cfg1是纯合同/价格输入规划，cfg2是一条无正式Run写入的配置准备路径；准备成功与全依赖闭包、创建执行明确分开，新增接口语义已写入Spec §7.4。按依赖串行实施，真实运行态继续由既有门禁验收。cfg编号与已有S07-p1/p2/p3a预检叶子区分。

本轮证据：

| 检查 | 命令、输入与结果 |
| --- | --- |
| Server定向 | `pnpm --filter @thesis-ledger/server exec vitest run test/backtest test/strategy-optimization/strategy-optimization-cost-boundary.test.ts test/strategy-optimization/strategy-optimization-discovery.test.ts`：46文件253/253，`/private/tmp/s07-preparation-server-tests.log`；随后仅清理价格计划文件的未使用类型/字段解构，最终planner/preflight 19/19、准备10/10通过 |
| Schemas | `pnpm --filter @thesis-ledger/schemas exec vitest run`：33文件281/281；`build`通过；`/private/tmp/s07-preparation-schemas-{tests,build}.log` |
| API client | 同包`exec vitest run`：5文件29/29；`typecheck`、`build`通过；`/private/tmp/s07-preparation-client-{tests,typecheck,build}.log` |
| Server类型与构建 | 同包`typecheck`、`build`通过；`/private/tmp/s07-preparation-{typecheck,server-build}.log` |
| Server全包 | 1文件失败、159通过、15跳过；1项失败、1102通过、49跳过。唯一失败仍是`ai-provider-onboarding-http.test.ts:167`请求次数期望2/实际1；`/private/tmp/s07-preparation-server-full.log`。不将该既有失败归为本轮通过 |
| 规范与边界 | 本轮源文件/测试的ESLint、Prettier通过；`node scripts/check-boundaries.mjs`、`node scripts/check-workspace-dependencies.mjs`通过；`/private/tmp/s07-preparation-{eslint,prettier,boundaries,dependencies}.log` |
| 文件尺寸 | `GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs`仍为§12.5记录的8项违规，本轮未增加；`/private/tmp/s07-preparation-file-size.log` |

准备路径的负例包括：协议/绑定注入被HTTP 400拒绝、模型与策略标的不符、Desired revision变化、路由未应用、缺页、来源事实与持久证据不一致、观察时间晚于dataAsOf、来源不支持PIT。来源与证据一致更新时返回新修订事实。测试中的行情/策略/存储依赖均为本地合成输入；临时HTTP不代表目标容器验收。准备可复用Market缓存和证据，不保存正式回测快照。

cfg3执行包（已本地完成，真实运行态由I01及部署门禁继续验收）：

| 叶子 | 前置与写入责任 | 验证断言 |
| --- | --- | --- |
| S07-cfg3a | cfg2；Schemas新创建边界、预检修订契约与API client，保留旧Run持久化解码 | 提交绑定策略版本/hash、配置checksum、精确目标序列及Desired/Effective/Catalog revision；客户端提供的stamp不得代替服务端复算，旧持久化Run仍可读 |
| S07-cfg3b | cfg3a；Market控制面的当前revision读取及Backtest创建校验服务，禁止Market反向依赖Backtest | 当前路由未应用、任一revision或目标序列改变均拒绝；网络查询失败不冒充未变化，检查过程中的revision竞争有确定结果 |
| S07-cfg3c | cfg3b；V3 lifecycle、Snapshot Builder冻结边界及创建/重试集成测试 | 创建前核对策略/配置及当前路由；实际选中来源与准备上下文一致，finalize前再次核对。变化时不得入队；幂等重放和旧快照retry不重新选择在线来源 |

其余当前义务保持开放：S07全依赖预检、U03配置/诊断与U05结果消费、B05剩余语义、AI公平比较和隔离、隔离数据库/真实队列、HiThink普通回测、目标Docker、浏览器/Electron、M2/M3及仓库既有门禁。cfg2完成时主仓229项dirty、DSA29项、infra干净；没有stage、commit、部署、真实Provider/AI请求或数据库操作。

### Desktop续接执行包

| 叶子 | 范围与前置 | 完成断言与验证 |
| --- | --- | --- |
| U03-cfg1 | cfg3已本地完成；Desktop准备API、TanStack Query状态/失效与版本化提交合同 | 输入变化/关闭后晚到结果不可用于提交；blocked诊断显示；提交携带原准备配置及stamp；旧raw路径保留。定向请求/竞态测试、类型检查 |
| U03-cfg2 | cfg1；BacktestSetupDialog及独立价格准备面板、显式归一化模型确认 | qfq/hfq研究选择、历史性质、实际来源与准备范围可读；不自动修改旧raw模型；复用现有shadcn组件。组件测试、浏览器视觉验收独立记录 |
| U05-v3 | cfg3；结果类型、现有结果页与独立协议披露组件 | V3指标/交易可读，实际来源、口径、数量/分红/历史含义及基准不可用原因不丢失；旧V2回归 |

当前由协调者直接实施U03-cfg1/cfg2；已读取shadcn skill及项目Base UI/Tailwind v4配置。锁定CLI docs遇网络超时，官方组件文档经网页工具补读；不变更组件依赖或覆盖用户组件。

### AI续接执行包

| 叶子 | 范围与前置 | 完成断言与验证 |
| --- | --- | --- |
| A01-result | 既有V3结果合同；优化Run服务及独立评价器/测试 | 按持久化结果版本严格解析V2/V3；缺指标与不完整数据不计零收益；版本错误失败关闭，评分与拒单统计保留。定向测试及Server类型检查 |
| A01-config | U03配置准备；实验创建、发现模式与分段Run配置准备接缝 | 创建意图显式选择口径/历史/模型；发现模式在策略生成后完成依赖准备；各切分绑定策略及revision，不能复用全窗口stamp。先核对全窗口与分段事实版本语义，再接入 |
| A01-submit | A01-config；Desktop两处实验表单及版本化API | 以服务端准备结果构造V3实验配置；重选资产/区间/模型使准备失效；关闭/晚到响应隔离；不使用类型断言补造协议 |

A01-config先执行cfg-a：在Backtest所有权内新增已有V3配置的只读预检接缝，按真实分段策略/窗口生成stamp，不改写冻结协议；已有同配置幂等Run直接返回，不在线重选来源。优化服务按配置版本分派，只有新Run预检通过后才申请运行预算。窗口事实与冻结协议不一致时显式阻断，不能为跑通而忽略revision或observedAt；稳定冻结事实复用仍为cfg-b后续义务。cfg-a独占新Backtest服务/Module、优化Run接线及定向测试；无迁移、部署或真实AI调用。

后续配置入口拆分：cfg-c1负责Schemas中的无来源事实准备意图及实验准备request/result，复用现有校验；cfg-c2负责优化所属的已有版本/内存探索种子适配、只读HTTP及测试，Backtest只接收通用策略及意图；cfg-c3负责独立Desktop实验价格准备组件和两处表单的V3提交，替换原V2配置构造以保持大文件尺寸不增。每叶依赖前叶通过；cfg-b冻结事实复用未完成前，不宣称真实AI闭环成功。

A01-idempotency：表单接线复核发现，实验已有幂等请求只比较费用配置，改变资产、切分或RunConfig仍可能返回旧实验。独立创建身份helper负责在保留原费用确认检查后比较来源模式、策略/探索范围、授权参数、目标、切分与完整RunConfig；相同意图重放，变化返回冲突。写入仅优化创建接缝/helper/测试，验证同配置重试及口径、资金、区间和策略变化拒绝。

### 本地接线进展与当前边界（2026-09-26）

cfg-b执行包：b1负责Market逐窗证据增加可空完整响应、独立新增migration、精确身份不可变读写、旧空载荷CAS填充与测试；保留历史SQL，先定向测试/Schema/matrix/runtime输入验证，隔离PostgreSQL及目标运行态独立保留。b2在Schemas定义冻结窗口引用，并由Market拥有只读固定窗口/子窗验证与缺失/损坏诊断；不得修改原价格基准或把重新观察当作旧事实。b3接入准备、分段预检与Builder，策略/范围变化不复用错误引用；各Run独立Snapshot及模型测试集隔离由组合测试证明。b1写入限定Schema、新migration、Market证据repository/helper/测试、结构测试和数据库矩阵文档；b2/b3依赖b1完成后展开。

b1本地检查：完整响应与SHA-256配对存储，忽略仅用于传输关联的requestId计算载荷身份；读取同时复核精确身份、来源修订、价格基准、覆盖与Bars派生的seriesVersion。新旧Repository/Reader/结构23项通过，新增冻结/损坏/CAS反例后Repository16/16通过；Server类型、占位URL的Prisma validate、matrix（18 SQL/67表）与runtime打包输入通过，日志`/private/tmp/a01-b1-*`。仅生成Prisma Client，没有连接数据库。Schema diff已单独检查，本叶只新增两个载荷字段；新增SQL未修改历史migration。隔离PostgreSQL/目标运行态仍未验证。

b2细化：引用只包含版本、精确窗口身份与响应哈希；固定读取不得转向在线Provider。子窗保留原价格基准，按市场交易日裁剪Bars与已证明日历，显式记录父窗口引用及派生fingerprint，并校验当前精确路由、覆盖与warmup。request-window价格基准暂只允许原完整窗口，子窗不能伪装为相同原生窗口口径；该能力后续仍须单独证明。b3还需为探索候选定义显式warmup预算，超出冻结范围必须拒绝，不临时扩大事实版本。

b3阶段证据：准备结果已引用完整响应哈希，预检及Builder传递固定引用，Snapshot冻结父引用且离线回放检查配置/manifest/证据一致。AI比较已按持久化Run版本分派，V3通过完整Store replay后比较执行区间，包含价格协议、父窗口与实际来源。38项组合测试及Server类型检查通过，另3项真实Store组合测试覆盖不同预热长度同组、父窗口/修订变化异组、Reader忽略引用拒绝；这仍是本地证据。

b3预热预算执行叶：实验准备要求显式选择0..504个交易日预算，Desktop默认显示60；请求意图与服务器生成的RunConfig分别保存预算。准备按预算和策略需求计算取得窗口，随后从固定父窗口裁剪策略实际预检窗口；候选实际需求超过预算必须拒绝，不扩大已冻结行情。普通回测保持按自身策略预热。Schemas、规划接缝、准备逻辑、实验组件与定向测试构成该叶，真实数据准备和AI验收独立保留。

b3时点修复叶：DSA当前将请求取得时间写入sourcePriceBasis.observedAt，Desktop先生成dataAsOf会使首次固定快照准备必然可能失败。显式增加after-acquisition准备意图，仅固定快照允许；完成读取后取Server时钟冻结，不改来源观察时间。Desktop说明并披露返回时点；requested-time和PIT继续按请求时点拒绝晚到事实。测试覆盖首次取得、未来观察及PIT禁止，真实Provider仍独立验收。

- U03-cfg1/cfg2与U05-v3已接入普通回测准备/提交、旧V2兼容、详情V3指标及价格/实际来源披露；输入变化、卸载取消与晚到响应隔离有QueryObserver测试。策略/目录缓存更新后使准备失效；准备前旧缓存不覆盖较新的准备结果。
- A01-result、cfg-a、cfg-c1/c2/c3和idempotency已本地接线：版本化结果评价；分段预检后才申请Run预算；已有幂等Run离线返回；已有策略和内存探索种子的只读准备HTTP；两处Desktop表单消费服务端配置；改变实验配置不能重放旧实验。实验准备只返回控制面修订，草稿不提供Run创建stamp。
- Schemas全包282/282；Desktop全包480/480；Server在创建身份修复后1144通过、49跳过。日志分别为`/private/tmp/a01-schemas-full.log`、`a01-desktop-full.log`、`a01-server-final-full.log`。之后仅补充准备结果控制面修订与UI失效：Server准备/HTTP12项、Desktop准备/失效12项定向通过，Schema build及Desktop typecheck通过；最终组合仍需更新。
- Server类型/build、Desktop类型/build、边界和workspace依赖检查通过；Desktop构建仍有既有大chunk提示。日志`/private/tmp/a01-{final-typecheck,server-build,desktop-build,boundaries,dependencies}.log`。文件尺寸门禁仍为原8项违规，无新增，`/private/tmp/a01-size.log`；最新目标ESLint发现的两处内联import类型已改为顶部type import，需最终复核。
- 原AI HTTP失败已按`2026-09-23-ai-provider-auto-test-save`及SDK Spec §schema_invalid语义修正：完整无效输出不自动重试；仅明确unsupported format可换模式。保留不保存和reported usage断言，4/4通过，`/private/tmp/a01-ai-format-test.log`。
- cfg-b的b1/b2/b3本地接线已完成：完整响应不可变缓存、精确引用与子窗裁剪、准备/分段预检/Builder固定读取、离线引用一致性及版本化比较；旧记录缺完整窗口时失败关闭。实验预热预算及取价完成时冻结也已接入。跨真实DB/Provider和AI全链路尚未验证，request-window基准仍只允许完整原窗。
- 尚无隔离数据库、真实队列、目标Docker、HiThink普通回测、浏览器/Electron或真实AI新增验收。没有stage、commit、发布、真实Provider/AI请求、目标数据库变更或codex-cost调用。Task继续active，不以当前本地接线替代整体验收。

2026-09-26新增冻结窗口验证：Server全包168文件1169通过、49跳过（`/private/tmp/a01-b3-server-full.log`）；Schemas全包283通过，此后新增取价时点合同测试10/10；Server准备14/14、固定窗口比较4/4、实验HTTP1/1及Desktop准备12/12通过。Server/ Desktop build通过；文件尺寸以HEAD为基线仍原8项违规，无新增（`/private/tmp/a01-b3-ratchet.log`），边界通过。Docker只读查询无法连接daemon，本机无initdb/pg_ctl/psql，隔离数据库尚未执行。取价时点修复后类型、目标lint与Desktop全包正在最终复核；不得将跳过或不可执行项算作通过。

早期阶段记录：普通回测准备、版本化提交、独立详情页V3披露接入时通过8项准备/竞态/协议披露、原模型披露5项、详情9项及旧V2/UI23项。该阶段的两处AI表单类型错误已在后续cfg-c3修复，最新类型和测试以上述更新记录为准。浏览器/Electron验收仍未执行，U03/U05整体保持开放。

### 12.7 持续实施检查点（2026-09-26）

当前执行叶 V-Size：按模拟事件/队列与交易所组合执行的职责拆分 Domain 测试，复用仅属于模拟测试的输入夹具；原测试内容与断言不删减，不调整尺寸阈值。优先处理本主题涉及的超限测试，保留 AI Provider 等其他用户 WIP；定向测试、类型与 ratchet 对照确认后记录减少的违规数。

V-Size 后续叶：Exchange 原始市场规则与归一化模拟规则分开；Server 垂直运行器提取冻结 artifact/模型输入夹具；Market Reader 与事实持久化覆盖/基准隔离分开。上述移动保留既有测试文本和断言，夹具只属于对应测试领域，不新增生产共享层。

V-Size 验证完成：模拟事件/交易所组合、原始/归一化 Exchange、Server 垂直运行器与 Market 事实存储按职责拆分。移动时逐文件核对用例及断言数量未减少；后续修正了既有测试夹具的 `ETF`/`etf` 类型、可选结算事件、缺失模型属性与可选回调类型表达。Domain 定向 50 项（包含新增独立参考）、Server 定向 27 项通过，相关 lint 通过。Domain 默认 `tsconfig.json` 仅包含源码，本轮另用 `/private/tmp/thesis-ledger-domain-test-types.json` 对所改 Domain 测试及其夹具执行严格类型检查，通过；Server 类型检查通过。日志为 `/private/tmp/vsize-{domain-tests-final,server-tests,test-types,server-types,lint-final}.log`。文件尺寸 ratchet 从本轮开始时的 7 项降至 3 项，剩余 `ai-provider.service.ts`、`ai-provider-ui.test.tsx`、`ai-provider-management.test.ts` 属于已有 AI Provider WIP，本轮未改，证据 `/private/tmp/vsize-ratchet-final.log`。仓库整体尺寸门禁仍未通过。

F01-a 本地完成：主仓新增 `scripts/market-v3-contract-probe.mjs` 与独立命令，infra 新增 `bash scripts/market-v3-contract-test.sh`，也可通过 `CONTRACT_CHECK_MARKET_V3=true` 接入既有黑盒入口。清单保留 V1 基线并单列 V3 要求；探针只验证能力、握手、精确目录及无效凭据拒绝，错误不打印响应体或 Token。7 项夹具测试、目标 lint、infra 清单校验及两个 Shell 入口语法检查通过，日志 `/private/tmp/f01-probe-final.log`、`f01-probe-lint.log`、`f01-compatibility.log`。尚未针对真实 DSA 运行协议探针；发布/升级/回退演练仍开放。

本节更新当前证据，前文各次执行记录保留为历史。此前将阶段性验证通过作为停止点不符合用户“继续实施”的要求；当前任务仍按完整 M1/M2/M3 范围推进，codex-cost 保持禁用。

本轮新增完成的本地叶子：

- A01-cfg-bind：候选按实际引用信号重建同坐标别名，保留冻结协议；移除信号可运行，跨标的及超预热预算仍在 Market 读取前拒绝。幂等重放按候选配置匹配，原实验配置不变。相关 15 项定向测试通过。
- A02：提示词只投影开发/验证允许指标，封存与未知字段不透传；失败类别区分数据、协议、策略适用性及真实亏损；SDK 本地 HTTP 捕获实际请求。真实 Provider/封存数据库生命周期仍待验收。
- A03-r：风险编译职责提取，真实成本预览及非法绝对价格/模拟数量约束保留；风险 Service 从 618 行收至 595 行，11 项定向测试通过。
- U02：HiThink 预设只填充无目标路由，显式预览/应用，沿用唯一保存入口。浏览器内存夹具验证取消、目录变化、凭据可用性变化及重新预览；详情见[浏览器证据](evidence/2026-09-26-hithink-preset-browser.md)。不是目标 API 保存或真实 Provider 验收。
- U04-a/b：请求合并、查询键、请求世代、历史补页、最新检查和分段重试按口径隔离。三口径挂载及并发取消相关 20 项测试通过。交互 V3 协议、Server 图表路由与可用性选择器尚未完成。
- U05-ai：候选对比页展示实验冻结研究协议，固定快照明确不构成严格无前视样本外验证；旧/无效配置不推断历史性质。4 项定向测试通过；目标界面验收仍开放。
- G-Math：固定阈值策略的独立参考对照及事件 golden 达标，见该门禁记录。
- F02-a：统一回测、执行模型、路由、缓存、消费者、AI 基线规格及架构同步 V3 适用边界；8 份文档新增主题链接核对通过。版本矩阵明确 infra 仍为 V1 发布基线，V3 兼容发布准备尚未关闭。
- 数据库重建检查取消固定 66 张表假设，按当前结构输入逐一核对缺失/额外表；Python 语法与结构发现（67 张表）通过。没有执行数据库重建或修改目标数据库。

本轮稳定源码验证：

| 层级 | 结果 | 证据 |
| --- | --- | --- |
| Desktop 全包 | 71 文件、496 项通过 | `/private/tmp/continuation-desktop-full.log` |
| Server 全包 | 170 文件、1185 项通过；15 文件、49 项跳过 | `/private/tmp/continuation-server-full.log` |
| Domain 数学对照与事件 golden | 12 项通过 | `/private/tmp/gmath-final.log` |
| 类型与目标 lint | Server、Desktop、Domain 受影响范围通过 | `/private/tmp/a01-bind-typecheck.log`、`u05-typecheck.log`、`gmath-typecheck.log`、`u05-lint.log`、`gmath-u04-lint.log` |
| Server / Desktop build | 通过；Desktop 保留既有大 chunk 提示 | `/private/tmp/continuation-server-build.log`、`continuation-desktop-build.log` |
| 模块边界 | 通过 | `/private/tmp/continuation-boundaries.log` |
| 迁移矩阵及运行时打包输入 | 18 迁移、67 表、当前 head；通过 | `/private/tmp/continuation-matrix.log`、`continuation-runtime-input.log` |
| 文件尺寸 ratchet | 仍有 3 项已有 AI Provider WIP 违规；风险 Service 及 4 项本主题测试超限已消除 | `/private/tmp/vsize-ratchet-final.log` |

下一批仍可实施：U04 独立交互 V3 wire/DSA/Server/选择器；按本 Task 各叶继续 M2/M3 适配与事件消费。必须保留的真实门禁：隔离 PostgreSQL、旧路径数据库回归、F01 目标 V3 协议及升级/回退演练、目标 Docker、HiThink 159516 普通回测/重放、目标 UI/Electron、真实 AI、其他来源真实准入。当前 Docker daemon 不可连接，宿主机无 PostgreSQL 工具；这些门禁没有执行，不能用上述本地通过替代。整体 Task 仍 active，不是全部完成。

## 12.7 U04 续接执行叶（2026-09-26）

### 2026-10-02 第一优先级执行包

用户授权完成目录恢复、U04 与 G-UI；保留三仓 dirty WIP，不提交、推送或发布。Canonical 已完成范围与有效高成本证据复用。本轮来源请求只在合同或失败前提有依据变化后执行明确预算，不重置历史盲重试额度。

- [x] R01.5-request-contract：开放基金排行改为已核实的 `op=ph` 与整次固定上海日期窗口，保留查询及逐页原文摘要；完整真实 Reader 20481条/21页、33.41秒成功。定向组合88项及限定 lint、官方 syntax/critical 通过；历史失败预算与历史目录门禁保留。见[本轮证据](evidence/2026-10-02-priority1-catalog-ui.md)。
- [x] R01.2-sina-catalog：新增新浪精确 ETF 节点的有界 Reader，AKShare Catalog 显式消费该集合；普通计数→完整列表→普通计数均1693，包含 `sz159516`。HTTP、期限、重复字段/身份、错场所/代码、截断、计数变化及来源级失败语义已验证；固定 JSONP 包装不执行脚本。见[本轮证据](evidence/2026-10-02-priority1-catalog-ui.md)。
- [x] R01-catalog-target：官方 `sync-code.sh dsa` 成功，目标连续两次正式 Job 发布 generation29/30；最新 Job 已由 Server 投影并 ACK，目录35278条、159516.SZ活跃且可确认。Efinance股票失败仍记录 `catalog_provider_unavailable`；无手工数据库修补。仅证明本次连续恢复，不提升为长期来源或历史目录验收。见[本轮证据](evidence/2026-10-02-priority1-catalog-ui.md)。
- [x] U04-target-interactions：按 Spec §1.1 完成真实三口径、扩窗、失败恢复、备源披露及配置不变；NAV 分段隔离通过，当前不可用净值未计作正向验收。
- [x] G-UI-priority1：共同价格 Browser/Console 与独立目标 API 验收完成；CDP 网络采集权限被拒绝，停止该项且不作为基础功能阻塞。

规划预检：两条本地来源叶可实施；目标刷新依赖真实完整读取，U04 实际交互依赖行情窗口准入，备用依赖真实兼容证明。没有将来源恢复与全部 UI 验收合并为一个实施叶。

执行结果：前三叶已完成；Server 对159516.SZ准入短窗返回59条真实qfq，默认较大窗口及none/hfq不可用。浏览器现有STOCK持仓的三口径均显示中文禁用原因，Network为chart-options 200，Console无警告/错误；前后 Run 配置及结果摘要一致。真实可用口径切换、扩窗、NAV与兼容备用的完整正向矩阵仍缺有效来源/证明，U04/G-UI两叶及父项保持开放；细节和接续输入见[本轮证据](evidence/2026-10-02-priority1-catalog-ui.md)。

- [x] U04-wire：独立图表交互请求/响应 Schema；依赖现有 C01/C04 价格与 RouteKey 契约。schemas 新增用途、必需目标 pin、身份/日期窗口关联及实际边界验证。新旧契约定向 17 项通过、Schema build 通过；允许未收盘/未知而完整回测窗口仍拒绝。真实运行态归 G-UI/G-Deploy。
- [x] U04-dsa：独立交互端点，复用精确 V3 runtime，保留真实观测时间；依赖 U04-wire。新模块 `api/thesis_ledger_chart_v3.py` 与 app 挂载、15 项交互测试及协议/变更文档完成；连同原 V3 与目标 pin 回归共 56 项通过。当前仅 CN 日线，不扩展其他市场收盘推断；无真实 Provider 请求，真实部署门禁仍开放。
- [x] U04-server（已拆分）：交互 Reader、版本隔离、基础整窗备用与 options 接线完成，相关测试和目标 API 验证通过。
  - [x] U04-server-acquire：DSA Client、统一 Reader 的 `readChartV3`、Nest 注册和 `chartContractVersion=3` 详情入口已实现。保留来源价格事实与获取批次身份；不写入 V2 事实缓存或回测冻结仓库；指标从同次获取计算。传输 6 项、Reader 8 项、详情 5 项通过，原 DSA Client 13 项及指标/V2 Reader 29 项回归通过，Server 类型检查通过。主源失败不静默切源；有证明的备用接入仍归下一子叶。
  - [x] U04-server-window：V3 可见窗口上限 3000 根、指标输入上限 3650 根，旧协议保留 90/365 上限；整窗获取并同批计算指标，契约及详情定向测试通过。
  - [x] U04-server-options：逐口径可用性与中文原因已接线；基础主源不可用时可由已配置同口径备源整窗替换，并披露实际来源。
    - [x] 逐口径可用性：独立 options 契约、Server 查询与 API Client 接入完成；校验生效配置、目录、凭据、准入和额度，定向 4 项通过。
    - [x] 备用来源：共同价格整窗备用完成；算法/坐标等价证明只用于实际依赖转换的扩展功能。
      - [x] U04-backup-selector：图表选择器与 Reader 内部接缝完成；核对目标对、窗口、实际价格事实及有效期，只消费等价证明，策略修订变化立即终止。新增 14 项测试，连同 Reader/详情共 28 项通过；不接收 HTTP 客户端证明。详见 [备用整窗选择证据](evidence/2026-09-26-chart-v3-backup-selector.md)。
      - [ ] U04-backup-evidence：**扩展/当前跳过**。部署侧证明供给已实现，真实审核证据生产、目标挂载与撤销演练、来源验收尚未完成；不能由目录状态或响应自行签发证明。
        - [x] U04-proof-package：只读证明包 repository、成对配置、摘要固定、精确查找、限额及撤销完成，无数据库迁移，不生成真实证明。
        - [x] U04-proof-consumer：Reader/Module 注册证明供给，备用调用前后重查；主源成功不读取文件。图表定向 50 项通过，详见 [证明供给证据](evidence/2026-09-26-chart-v3-proof-package.md)。
        - [ ] U04-proof-runtime：**扩展/当前跳过**。准备经审核的真实来源证明包，按 infra 入口部署只读文件，验证真实备用、撤销与策略修订变化；未执行，不由合成测试替代。
        - [x] U04-backup-options：主源不可用时基础 qfq options 返回 availableVia=backup，真实腾讯备源读取和目标界面通过。
          - [x] U04-options-window-api：成对精确获取日期、逐口径证明查询、窗口回显与备用标记已完成；API Client 传递窗口并校验标的/窗口关联。不触发行情读取，图表 Server 57 项、API Client 34 项通过，详见 [剩余任务与本轮记录](evidence/2026-09-26-remaining-work-current.md)。
          - [x] U04-options-window-ui：首次读取由 Server 共用算法规划预热窗口，客户端先规划再固定日期读取并核对返回窗口；选择缓存按计划参数隔离。切换口径保留条数与指标，扩窗无证明即时禁用。Desktop 509 项、Server 1249 项、DSA 56 项及合成目录浏览器交互通过；目标全链路仍归真实门禁。见 [目标执行记录](evidence/2026-09-26-goal-execution.md)。
- [x] U04-ui（已拆分）：逐口径中文选择、失败原因、只读入口与运行配置隔离完成；目标 Web 已验收。
  - [x] U04-ui-isolation：详情合并及图表页过滤按 V3 获取批次隔离；新批次替换旧价格及指标，其他分段保留；旧/V3 请求进行中去重键分开。相关定向验证通过，Desktop 类型检查通过；界面入口由逐口径能力查询驱动。
  - [x] U04-ui-window：V3 历史加载完整扩窗，刷新及分段重试重读整窗；请求键隔离协议与窗口，保留取消和请求世代。挂载测试覆盖 90→180 根、最新刷新、分段重试；扩窗显示加载状态。
  - [x] U04-ui-options：现有 Select 与 TanStack Query 接入逐口径状态和中文原因；状态读取失败禁用选择。合成目录浏览器验证切换、禁用、凭据恢复/失效及运行配置隔离；目标服务与 Electron 验收仍归 G-UI。

本轮详细证据见 [图表 V3 本地实施记录](evidence/2026-09-26-chart-v3-local.md)。上述本地叶关闭不代表 U04 父项或完整 Task 完成；备用兼容、真实运行态及 M2/M3 继续开放。

预检：上述叶子保留 AC10/AC11/AC15/AC19，按契约→适配→消费顺序执行；本地结果不关闭真实数据与运行态门禁。主代理顺序实施，codex-cost 保持禁用。

## 12.8 9 月 28 日恢复实施与新子代理台账

本次按用户最新请求继续完整剩余范围，并启用 `codex-cost`；历史交接中的禁用状态仅属于此前轮次。M1/M2/M3、Spec 全文、AC01–AC20 和真实门禁继续有效。严格 PIT 的独立历史决策窗口是当前 S05 前沿，已完成的必要条件不授予最终资格。

共享基线：主仓 `main` 现有 156 项修改、345 项未跟踪；DSA `yzin` 为 23/133；infra `main` 为 8/3。全部既有变更保留，不提交、重置、清理或整体格式化。协调者独占本 Task、Spec 决策和共享导出；子代理只写分配路径，不创建下级代理。每项使用新的 `gpt-6-sol` 会话，按难度选择推理强度。Context Mode 当前工具发现不可用，执行器使用 RTK 和受限摘要。

| ID | 结果 | 依赖 | 独占写入路径 / 共享资源 | 所有者 / 工作区 | 子代理会话 ID | Dispatch | 状态 | 交付 / 检查 / 阻塞 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S05-window-discovery-0928 | 给出独立历史决策窗口的可实施契约和最小分叶 | 已有重建合同、内容、时钟、预检及冻结门禁 | 仅 `docs/tasks/evidence/2026-09-28-s05-window-discovery.md`；源码、日历和 Spec 只读，不构建或运行数据库 | s05_window_discovery_0928 / 主仓 | /root/s05_window_discovery_0928 | closed | worker_done | [历史窗口提案](evidence/2026-09-28-s05-window-discovery.md)；明确 v2 历史证据区、7 个实现叶、实际日历一致性与旧严格 V3 安全边界；无源码/运行态修改，推荐边界已写回 Spec §6 |
| REM-frontier-discovery-0928 | 从完整剩余台账确定可独立执行的下一前沿 | 当前剩余工作清单和 DSA 能力登记 | 仅 `docs/tasks/evidence/2026-09-28-remaining-frontier.md`；三仓源码和文档只读，不运行 Provider/浏览器/数据库 | remaining_frontier_0928 / 主仓 | /root/remaining_frontier_0928 | closed | worker_done | [前沿核对](evidence/2026-09-28-remaining-frontier.md)；产物 56 行、空白检查通过。就绪项为 F02 目录状态文档；M26-b2 缺身份/币种，R01.5 Catalog 缺基金/ETF 分类合同；M25/M32 缺锚点/修订，现有来源和真实门禁阻塞保留 |
| F02-capability-status-0928 | DSA 能力登记准确呈现已完成本地实现及仍待真实准入的单元 | REM-frontier-discovery-0928；既有实现/证据 | DSA `docs/thesis-ledger-source-capabilities.md`；主仓 `docs/tasks/evidence/2026-09-28-f02-capability-status.md`；无可变运行资源 | f02_capability_status_0928 / DSA 与主仓证据 | /root/f02_capability_status_0928 | closed | worker_done | [目录状态证据](evidence/2026-09-28-f02-capability-status.md)；摘要及 R01.5/R01.10/R07.25/R07.26 对齐现有证据，116 固定编号和四列表不变；链接/中文/空白/diff check 通过，无服务请求；F02/AC20 保持开放 |

恢复预检：两项均为有界发现任务，写入和可变资源互不相交，输入稳定；发现结果由协调者转为 Spec/Task 契约后才能启动依赖实现。`worker_done` 仅表示叶子局部完成；整体和目标运行态尚未验收。

### S05 历史窗口实施前沿

本批覆盖 AC12 的历史证据核验及 AC15 的版本安全边界，决策以 Spec §6 为准，字段/接缝细化以历史窗口提案为输入。共享既有部署 pin，不新增并行配置入口。首批解析器必须有明确原始资料和机器核验规则；选择前只实施结构合同，不授予任何真实资格。builder 388 行、Store 293 行、Schema `backtest-data.ts` 653 行为恢复基线，已有超限文件不得增长；新职责放入明确所有权模块。单独来源检查、完整依赖日历对齐、冻结、离线、目标运行态分别记录。

| ID | 结果 | 依赖 | 独占写入路径 / 共享资源 | 所有者 / 工作区 | 子代理会话 ID | Dispatch | 状态 | 交付 / 检查 / 阻塞 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S05-window-schema-0928 | 重建清单 v2 及有界历史原文/日历/见证结构合同 | Spec §6 边界已确定；S05-window-discovery-0928 | Schemas 新 `src/market-pit-historical-evidence-v1.ts`、`test/market-pit-historical-evidence-v1.test.ts`；既有 `src/market-pit-reconstruction-v3.ts`、对应 test、`src/index.ts`；主仓独立 evidence；Schemas test/typecheck/build 输出独占 | s05_window_schema_0928 / 主仓 | /root/s05_window_schema_0928 | closed | worker_done | [共享合同证据](evidence/2026-09-28-s05-window-schema.md)；65/65 定向、Schemas typecheck/build、格式/空白通过，结构335行/重建250行，dist 导出就绪；v1 API保留、v2新增联合解析绑定，不授真实历史资格 |
| S05-calendar-package-parser-0928 | 固定原发布及源码树复算 XSHG 日历投影 | S05-window-schema-0928；S05-calendar-parser-discovery-0928；Spec §6 首批解析器 | Market 新 `market-pit-calendar-package-v1.ts`、`market-pit-calendar-package-source-v1.ts`、`market-pit-calendar-package-projection-v1.ts`；对应三份新 test；独立 evidence；Server 定向 Vitest 资源独占 | s05_calendar_package_parser_0928 / 主仓 | /root/s05_calendar_package_parser_0928 | closed | worker_done | [原包解析证据](evidence/2026-09-28-s05-calendar-package-parser.md)；3文件/76项定向、实际PyPI原文/93源码与修复后Schema记录结构联合验证、213306字节wheel内存摘要、lint/格式通过；不授场所/来源/最终PIT资格，无新增fixtures |
| S05-old-strict-v3-guard-0928 | finalized 严格 V3 在最终验证器未就绪时拒绝重放及幂等 finalize 绕过 | Spec §6 旧严格快照安全边界；现有 Store 稳定源码、Schemas dist就绪 | `apps/server/src/backtest/backtest-snapshot-v3-store.ts`；新 `backtest-snapshot-v3-validation.ts` 与 `backtest-snapshot-v3-pit-guard.ts`；新 `apps/server/test/backtest/v3-strict-snapshot-replay-guard.test.ts`；独立 evidence；Vitest cache关闭/不构建/独立临时Artifact前缀 | s05_old_strict_v3_guard_0928 / 主仓 | /root/s05_old_strict_v3_guard_0928 | closed | worker_done | [旧严格快照保护证据](evidence/2026-09-28-s05-old-strict-v3-guard.md)；4文件/16项定向及旧版本回归、lint/格式/空白通过；finalize/replay及persisted严格→候选降级均拒绝，load和原字节保留；Store293→274行，无真实运行态验收 |
| S05-schema-empty-source-0928 | 真实固定包的两个零字节源码可表示，同时保持非空发布原文及全部身份约束 | parser真实93文件输入揭示缺口；schema原会话closed | Schemas `src/market-pit-historical-evidence-v1.ts`、对应test；独立evidence；Schemas定向/typecheck；build待Server定向资源释放 | s05_schema_empty_source_0928 / 主仓 | /root/s05_schema_empty_source_0928 | closed | worker_done | [空源码修复证据](evidence/2026-09-28-s05-schema-empty-source.md)；66项定向、Schemas typecheck/格式/空白通过；只允许制品rawBase64空串，来源原文保持非空；源码摘要1c941c3d…，dist刷新待集成 |
| S05-calendar-parser-discovery-0928 | 选择可核验的首批真实发布资料解析器与投影绑定规则 | Spec §6；现有 R01.10 日历发布输入 | 仅 `docs/tasks/evidence/2026-09-28-s05-calendar-parser-discovery.md`；现有 DSA 日历/发布源码与官方资料只读；不读同时修改的 Schema，不测试/构建/部署 | s05_calendar_parser_discovery_0928 / 主仓 | /root/s05_calendar_parser_discovery_0928 | closed | worker_done | [解析器输入证据](evidence/2026-09-28-s05-calendar-parser-discovery.md)；真实 PyPI JSON/wheel/93 源码树已只读核对，首批 XSHG/2026 专用解析器可实施；场所原文和 XSHE 独立证据缺失，不赋予目标159516资格 |

待结构/解析器就绪后依次锁定 Market 原文核验、逐 Bar 窗口、repository、预检、冻结、离线重验的独占写入与局部检查；不提前派发依赖任务。完整依赖预检若缺实际日历投影检查，独立分叶补齐。最终将实际数据库、目标同步/摘要、合格真实来源、Worker 与浏览器验收保留为独立门禁，原卡点预算不重置。

边界集成记录：空源码修复的定向/typecheck完成后，Store执行器确认所有Server检查停止；协调者执行 `rtk proxy pnpm --filter @thesis-ledger/schemas build` 通过并释放稳定dist给parser。该步骤未修改源契约，不重复累计66项子集。parser最终原包/结构联合验证恢复，之后再执行同一稳定输入的包级回归。

### 本批稳定输入验证

本批代码实施会话均已关闭，暂停其源文件修改。整合范围为历史结构v2/真实空源码边界、固定XSHG日历解析器、旧严格V3拒绝门禁及DSA目录状态说明；不把这些局部结果解释成合格PIT的来源/冻结/离线成功。

| ID | 结果 | 依赖 | 独占写入路径 / 共享资源 | 所有者 / 工作区 | 子代理会话 ID | Dispatch | 状态 | 交付 / 检查 / 阻塞 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S05-window-local-integration-0928 | 稳定最终源码的Schemas/Server回归、类型/构建和受影响仓库门禁 | schema/空源码/parser/旧严格guard均worker_done；无源文件writer | 仅 `docs/tasks/evidence/2026-09-28-s05-window-local-integration.md`；Schemas/Server测试与构建输出、静态门禁资源独占；源码只读 | s05_window_local_integration_0928 / 主仓 | /root/s05_window_local_integration_0928 | closed | blocked | [集成检查点](evidence/2026-09-28-s05-window-local-integration.md)；Schemas42文件/433项、Server222文件/1624项通过，另23文件/81项跳过；Schemas typecheck通过，Server typecheck失败于owned parser test139/142行字面量推断过窄；未重试、未build/高层门禁，15个输入hash无漂移且资源释放；修复另用fresh会话 |
| S05-parser-test-types-0928 | 修复负向解析器测试夹具的字符串类型推断 | local-integration发现TS2322，已停止checks；源实现不变 | 仅 `apps/server/test/market/market-pit-calendar-package-v1.test.ts` 和独立evidence；Server定向/typecheck资源 | s05_parser_test_types_0928 / 主仓 | /root/s05_parser_test_types_0928 | closed | worker_done | [测试类型证据](evidence/2026-09-28-s05-parser-test-types.md)；JS前后摘要同为810c06c5…，完整字节相同；定向75通过/1公开输入条件跳过，Server typecheck/lint/格式通过。script忽略文件参数意外全包1624通过/81跳过，已记录范围偏差；实际原包76通过证据因JS未变继续有效 |
| S05-window-local-gates-0928 | 完成类型修复后的构建及仓库门禁，核对最终证据适用性 | local-integration已有包级通过；parser-test-types类型修复/JS不变/Server typecheck通过；全部source writer已停 | 仅 `docs/tasks/evidence/2026-09-28-s05-window-local-gates.md`；Server build/静态门禁输出独占，源码只读 | s05_window_local_gates_0928 / 主仓 | /root/s05_window_local_gates_0928 | closed | blocked | [门禁检查点](evidence/2026-09-28-s05-window-local-gates.md)；Server build、边界/8包依赖/普通lint/空白/文档链接通过，15个输入无漂移；新Schema refinement复杂度66、manifest绑定27超过20，需语义拆分；13无基线尺寸警告保留，资源已释放 |
| S05-evidence-complexity-0928 | 按日历结构、引用关联和逐Bar/清单绑定职责拆分超限校验 | local-gates精确66/27缺口；外部合同及全部现有拒绝语义不变 | Schemas既有 `market-pit-historical-evidence-v1.ts`、`market-pit-reconstruction-v3.ts`；新 `market-pit-calendar-structure-v1.ts`、`market-pit-historical-references-v1.ts`、`market-pit-historical-bar-bindings-v1.ts`、`market-pit-reconstruction-manifest-validation-v3.ts`；独立evidence；Schemas测试/type/build、Server typecheck独占 | s05_evidence_complexity_0928 / 主仓 | /root/s05_evidence_complexity_0928 | closed | worker_done | [复杂度证据](evidence/2026-09-28-s05-evidence-complexity.md)；历史refinement66→2、旧v1必要binder27→7；49函数最高19/有效行最高43，严格20零warning；定向66项、Schemas433项/type/build、Server typecheck通过；13只读输入无漂移，进程停止、dist稳定；受影响Server回归/build待后续集成 |

### 下一前沿发现

以下两项只读任务使用稳定的 Spec、既有来源代码及能力登记，不消费正在拆分的 Schema；报告路径和资源独立。场所发现只核对独立原始材料，不沿用已耗尽的行情、身份批量或 AI 重试预算。R02/R03 仅梳理本地实施缺口，真实准入另外保留。

| ID | 结果 | 依赖 | 独占写入路径 / 共享资源 | 所有者 / 工作区 | 子代理会话 ID | Dispatch | 状态 | 交付 / 检查 / 阻塞 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S05-venue-parser-discovery-0928 | 确定精确证券场所原文及可登记的机器核验边界 | Spec §6；固定日历解析器发现；不读在写 Schema | 仅 `docs/tasks/evidence/2026-09-28-s05-venue-parser-discovery.md`；官方资料只读、有界网络；无构建、业务或目标请求 | s05_venue_parser_discovery_0928 / 主仓 | /root/s05_venue_parser_discovery_0928 | closed | worker_done | [场所原文证据](evidence/2026-09-28-s05-venue-parser-discovery.md)；两份官方原文446976字节离线摘要通过，4次查询/2候选零重试；仅证明首次上市事件，2026持续场所、日级公开真实性与XSHE日历缺口保留，不授严格资格 |
| M3-r02-r03-frontier-0928 | 确定补充行情/报价及净值登记单元的下一可执行本地叶子 | 完整 Spec/Task 与 DSA 登记及稳定源码 | 仅 `docs/tasks/evidence/2026-09-28-m3-r02-r03-frontier.md`；三仓只读，不网络/测试/构建 | m3_r02_r03_frontier_0928 / 主仓与DSA | /root/m3_r02_r03_frontier_0928 | closed | worker_done | [38单元对账](evidence/2026-09-28-m3-r02-r03-frontier.md)；R02.11精确身份及R02.13行选择两个就绪叶，R03事实/合同仍阻塞；路径/ID/空白检查通过，无运行请求 |

### 捕获原文及指数选择实施

以下局部行为已写入 Spec §3.3/§6。源码路径、test 和文档互不相交；DSA 两项测试使用禁写字节缓存和禁用 lint cache，避免共用生成目录。Server 项只定向测试/owned lint，不与 DSA 项共用构建或数据库。整体 G-M3/AC20 和 S05 均不因叶子完成而关闭。

| ID | 结果 | 依赖 | 独占写入路径 / 共享资源 | 所有者 / 工作区 | 子代理会话 ID | Dispatch | 状态 | 交付 / 检查 / 阻塞 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S05-source-capture-parser-0928 | 捕获原文与真实完整归档身份/摘要/原fetchedAt绑定 | Spec §6登记合同；稳定历史Schema与content输出 | Market新 `market-pit-source-capture-v1.ts`、可选新 `market-pit-evidence-instant-v1.ts`；新 `test/market/market-pit-source-capture-v1.test.ts`；独立 evidence；Server无cache定向资源 | s05_source_capture_parser_0928 / 主仓 | /root/s05_source_capture_parser_0928 | closed | worker_done | [捕获原文证据](evidence/2026-09-28-s05-source-capture-parser.md)；145/62行新模块、57项定向及strict lint/格式通过，精确亚毫秒/原字节/重复键/身份绑定；所有process停止，仅source-capture-bound，生产分派与真实资格仍未接 |
| R02-11-index-identity-0928 | 新浪指数只消费唯一精确代码行 | M3-r02-r03-frontier；既有六个映射/Consumer；Spec §3.3 | DSA新 `data_provider/sina_index_identity.py`、`tests/test_sina_index_identity.py`；既有 `data_provider/akshare_fetcher.py`仅get_main_indices；主仓独立evidence；定向Python无pycache/lint无cache | r02_11_index_identity_0928 / DSA | /root/r02_11_index_identity_0928 | closed | worker_done | [新浪身份证据](evidence/2026-09-28-r02-11-index-identity.md)；5离线测试含Manager/Fetcher/Analyzer接缝、AST通过；2638→2633行，局部diff仅方法；系统缺pandas改已有venv通过，ruff未安装未执行，SDK/网络封锁；真实R02.11/G0-M仍开放 |
| R02-13-index-row-selection-0928 | Tushare指数按精确身份/窗口/唯一日期选最新原行 | M3-r02-r03-frontier；当前SDK字段核对；Spec §3.3 | DSA新 `data_provider/tushare_index_daily_rows.py`、`tests/test_tushare_index_daily_rows.py`；既有 `data_provider/tushare_fetcher.py`仅get_main_indices；主仓独立evidence；定向Python无pycache/lint无cache | r02_13_index_row_selection_0928 / DSA | /root/r02_13_index_row_selection_0928 | closed | needs_split | [前置检查点](evidence/2026-09-28-r02-13-index-row-selection.md)；动态SDK无本地字段声明，未实施、未测试，1354行不变、进程结束；官方字段随后由协调者补齐，接续另用新会话 |

### 补齐稳定合同后的接续叶子

Tushare 本地动态 SDK 没有字段声明，首个实施会话停在前置检查。协调者于 2026-09-28 核对 [官方 index_daily 文档](https://tushare.pro/document/2?doc_id=95)：返回 `ts_code` 与 `trade_date`，请求支持原 `start_date/end_date`。仅据此补齐字段合同，不代表真实账号/权限/覆盖。原会话保留检查点；实际实现使用新 ID、新会话。Market 内容门禁仅扩至严格 v2 清单的必要绑定，不接生产 ready。

| ID | 结果 | 依赖 | 独占写入路径 / 共享资源 | 所有者 / 工作区 | 子代理会话 ID | Dispatch | 状态 | 交付 / 检查 / 阻塞 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R02-13-index-row-implementation-0928 | 已确认官方字段后的精确最新行实现 | 原前置检查点结束；官方 index_daily 字段声明；Spec §3.3 | 原R02.13相同精确write set；新evidence `2026-09-28-r02-13-index-row-implementation.md`；定向Python无cache | r02_13_index_row_implementation_0928 / DSA | /root/r02_13_index_row_implementation_0928 | closed | worker_done | [行选择证据](evidence/2026-09-28-r02-13-index-row-implementation.md)；新10/旧5项无skip、AST/关键flake8及新文件完整lint通过；1354→1351行，仅方法接缝；未授实时/权限，无网络/部署 |
| S05-manifest-v2-content-0928 | 既有真实归档内容门禁支持v2必要合同 | 稳定Schemas433/type/build；v1 binder行为保留 | 仅Market `market-pit-reconstruction-content-v3.ts`、新 `test/market/market-pit-reconstruction-content-v2.test.ts`；新evidence `2026-09-28-s05-manifest-v2-content.md`；无cache定向及Server typecheck | s05_manifest_v2_content_0928 / 主仓 | /root/s05_manifest_v2_content_0928 | closed | worker_done | [v2内容证据](evidence/2026-09-28-s05-manifest-v2-content.md)；5文件67项、Server typecheck、strict lint/格式通过，原内容行为/错误顺序保留；154行、e831152a…；v2必要链可达source-times-bound，生产仍无最终资格 |
| S05-daily-window-math-0928 | 复算逐Bar完整收盘与真实后继开盘并核对精确源时钟 | v2内容/来源时钟和固定日历parser稳定；source-capture精确瞬时helper稳定 | Market新 `market-pit-decision-window-v3.ts`、可选新 `market-pit-decision-window-calendar-v3.ts`；新 `test/market/market-pit-decision-window-v3.test.ts`；新evidence `2026-09-28-s05-daily-window-math.md`；无cache定向/typecheck | s05_daily_window_math_0928 / 主仓 | /root/s05_daily_window_math_0928 | closed | needs_split | [窗口检查点](evidence/2026-09-28-s05-daily-window-math.md)；保留222/128行草稿与test，最初34项10失败，原始schema8项时段冲突；已撤回临时v1绕行，最终v2草稿未复验，ownedlint复杂度26/unused两项仍失败，旧版type结果不适用；进程停止，修复依赖后fresh接续，不算完成 |

### 稳定 DSA 输出的组合验证

新浪与 Tushare 两个实施会话均已结束，六份 Python 输入暂时冻结。组合验证只读这些输出，不与 Server 窗口执行器共享测试/构建资源；补上新浪尚未执行的现有 flake8，记录实际门禁范围，不能将未安装工具解释为通过。

| ID | 结果 | 依赖 | 独占写入路径 / 共享资源 | 所有者 / 工作区 | 子代理会话 ID | Dispatch | 状态 | 交付 / 检查 / 阻塞 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M3-index-local-regression-0928 | 稳定指数选择修复的组合回归与适用Python门禁 | R02.11及R02.13实施worker_done，DSA source writer全部停止 | 仅主仓evidence `2026-09-28-m3-index-local-regression.md`；DSA既有venv定向/适用包级测试，禁止pycache/lintcache；源码只读 | m3_index_local_regression_0928 / DSA | /root/m3_index_local_regression_0928 | closed | worker_done | [组合回归证据](evidence/2026-09-28-m3-index-local-regression.md)；指数46项/扩展mock41项无skip/无网络，完整新增flake8/存量关键flake8/6AST/空白通过；6hash不变，2633/1351行；初次扩展logging验证封装错误3失败，撤销封装后同范围通过；全包/真实层未执行，进程停止 |

### R04–R07 独立发现

| ID | 结果 | 依赖 | 独占写入路径 / 共享资源 | 所有者 / 工作区 | 子代理会话 ID | Dispatch | 状态 | 交付 / 检查 / 阻塞 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

| M3-r04-r07-frontier-0928 | 核对研究资料/财务/资金流/资讯各登记单元的本地可执行前沿 | 完整Spec、能力登记及稳定DSA代码；不得读在写Market文件 | 仅 `docs/tasks/evidence/2026-09-28-m3-r04-r07-frontier.md`；三仓只读，无测试/build/网络/目标资源 | m3_r04_r07_frontier_0928 / 主仓与DSA | /root/m3_r04_r07_frontier_0928 | closed | needs_split | [63项对账](evidence/2026-09-28-m3-r04-r07-frontier.md)；全覆盖/路径/编号/表格/空白通过，ready=0；R05.1/R06.12缺单endpoint日期/字段/单位合同，龙虎榜日期/用途也待核；持仓与RQData不重做，无运行资源 |

### 日历投影与 Schema 接缝修复

窗口执行器发现真实 parser 输出 `01:30Z`、当地 `startMinute=570` 时，被结构层按文本小时拒绝。依赖任务暂停，不通过移除 v2 历史区改用 v1 校验绕行。修复以 Spec §6 的绝对时刻/当地分钟语义为准；原窗口草稿保留，原会话到检查点关闭，后续使用新会话。

| ID | 结果 | 依赖 | 独占写入路径 / 共享资源 | 所有者 / 工作区 | 子代理会话 ID | Dispatch | 状态 | 交付 / 检查 / 阻塞 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S05-calendar-schema-timezone-0928 | Schema按声明时区核对当地日期/分钟，真实UTC投影可重绑 | daily-window报告的确切producer/consumer冲突；Spec时刻语义补齐 | Schemas `src/market-pit-calendar-structure-v1.ts`、新 `test/market-pit-calendar-timezone-v1.test.ts`、既有历史证据/重建test仅合法时段fixture修正；Server新 `test/market/market-pit-calendar-schema-interoperability.test.ts`；新evidence `2026-09-28-s05-calendar-schema-timezone.md`；Schemas定向/全包/type/build、Server联合test/type独占 | s05_calendar_schema_timezone_0928 / 主仓 | /root/s05_calendar_schema_timezone_0928 | closed | worker_done | [时区联合证据](evidence/2026-09-28-s05-calendar-schema-timezone.md)；97行/413c3feb…，UTC/+08绝对瞬时同义，本地日期/整分钟/无损小数/排序要求保留；定向84项、Schemas451/type/build、Server真实原包联合82无skip及typecheck通过；strict lint零warning；原fixture未动，旧433证据被刷新，窗口草稿仍未完成 |

### 待依赖修复后的窗口收敛与验证

以下 ID 先保留，只有 Schema 修复输出达到局部完成条件并释放资源后才派发。原窗口会话不会重开。最终包级/仓库验证需暂停全部源码修改；已通过的 DSA 87 项输入不变时不重复统计或重跑。

| ID | 结果 | 依赖 | 独占写入路径 / 共享资源 | 所有者 / 工作区 | 子代理会话 ID | Dispatch | 状态 | 交付 / 检查 / 阻塞 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S05-daily-window-finish-0928 | 在正确UTC/local Schema上完成窗口草稿并消除owned lint失败 | timezone修复局部通过且输出稳定；旧window会话closed | 既有两份新窗口source、新 `market-pit-decision-window-source-v3.ts`（必要时按源时钟职责）；既有新window test；新evidence `2026-09-28-s05-daily-window-finish.md`；Server定向/type资源 | s05_daily_window_finish_0928 / 主仓 | /root/s05_daily_window_finish_0928 | closed | worker_done | [窗口计算证据](evidence/2026-09-28-s05-daily-window-finish.md)；172/128/147行语义模块，42项本叶及4文件87项关联、typecheck/strict lint/格式通过；完整v2绑定不绕行，归档重新hash/作用域/refs/精确clock/最后successor/不改原时间；仅decision-windows-bound，无最终PIT，进程已停止 |
| S05-final-local-regression-0928 | 验证最终稳定Schemas/Market/Store与适用仓库门禁 | 全部本批实现/修复worker_done、无source writer；DSA组合已通过 | 仅evidence `2026-09-28-s05-final-local-regression.md`；Server全包/type/build及相关仓库门禁独占；源码只读 | s05_final_local_regression_0928 / 主仓 | /root/s05_final_local_regression_0928 | closed | blocked | [稳定回归检查点](evidence/2026-09-28-s05-final-local-regression.md)；Server1736通过/88跳过，50项输入无漂移；新增JSONB诊断测试165行TS2375，typecheck失败即停，build及高层门禁未执行；进程已停止 |

### I01 已有失败的根因发现

完整响应 JSONB 往返已耗尽首次及两次重试。本叶只读调查既有复现与序列化源码，不运行该门禁或查询目标库，也不重置其预算。仅当发现并落实明确的新实现前提后，才另行评估新的验证任务；未定位到原因时保留原阻塞。

| ID | 结果 | 依赖 | 独占写入路径 / 共享资源 | 所有者 / 工作区 | 子代理会话 ID | Dispatch | 状态 | 交付 / 检查 / 阻塞 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| I01-jsonb-hash-discovery-0928 | 从已有失败证据确定完整响应摘要往返失配根因 | Worker联通证据/跳过复现与稳定hash/Reader/repository源码 | 仅evidence `2026-09-28-i01-jsonb-hash-discovery.md`；源码只读，无测试/DB/Provider/网络/运行态 | i01_jsonb_hash_discovery_0928 / 主仓 | /root/i01_jsonb_hash_discovery_0928 | closed | needs_split | [静态排除证据](evidence/2026-09-28-i01-jsonb-hash-discovery.md)；71行，排除Schema默认/Date回填/未排序直接hash假设；保留浮点但未证实精度假设，缺字段/位模式差异；未测试/查询DB，预算未重置，无已证明修复叶 |

下一项是独立的合成 SQL/驱动调查：不创建业务任务、不使用 Provider、Reader、队列或 Worker，不查询目标业务库，不执行原失败 gate。只在本轮新隔离 PostgreSQL 上，通过实际 Prisma 驱动执行表无关 `SELECT`，对严格响应 fixture 的完整 JSONB 回读做字段路径/类型/IEEE 位模式比较，并与显式文本回读对照。此诊断最多一次调用、无重试；它只定位序列化接缝，不算 I01 通过，不占用或恢复原 Worker 门禁预算。调查失败或信息不足保留卡点，不沿猜测修改完整 hash。

| ID | 结果 | 依赖 | 独占写入路径 / 共享资源 | 所有者 / 工作区 | 子代理会话 ID | Dispatch | 状态 | 交付 / 检查 / 阻塞 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| I01-jsonb-driver-diagnostic-0928 | 合成完整响应精确定位SQL/Prisma往返差异 | 静态发现closed；稳定原响应Schema/hash/现有fixture；不消费在写window | 新 `apps/server/test/market/market-window-jsonb-roundtrip-diagnostic.test.ts`；新evidence `2026-09-28-i01-jsonb-driver-diagnostic.md`；独占本轮隔离PG容器/端口/临时日志；禁写业务/公共Schema/目标资源 | i01_jsonb_driver_diagnostic_0928 / 主仓与隔离PG | /root/i01_jsonb_driver_diagnostic_0928 | closed | needs_split | [单次隔离诊断](evidence/2026-09-28-i01-jsonb-driver-diagnostic.md)；Prisma6.19.3/PG17.11，15合成Bar的内存/nativeJSONB/text三摘要相同且字段/type/bit差异0；1次/0retry，default1pass1skip；仅该向量，未解释原失败，不选修复；新容器精确删除无volume/旧资源触碰，lint/格式通过，进程停止 |

### JSONB 诊断测试类型修复与后续门禁

新增诊断的默认分支与 Server 全包已通过，但可选环境变量在 Prisma 构造处没有完成类型收窄。本叶只修复已定位问题，不增加数据库诊断预算或重跑原 Worker。若修复前后转译结果相同，可复用稳定全包结果；否则只重跑受影响定向测试，并说明全包证据的适用范围。类型通过后执行尚未完成的构建及仓库门禁；无关 WIP 的门禁失败也须保留和归因，不放宽规则。

| ID | 结果 | 依赖 | 独占写入路径 / 共享资源 | 所有者 / 工作区 | 子代理会话 ID | Dispatch | 状态 | 交付 / 检查 / 阻塞 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S05-jsonb-diagnostic-types-gates-0928 | 收窄诊断环境变量类型，补齐稳定代码的本地门禁 | final-local-regression已closed，全部源码写入者停止 | 仅新增JSONB诊断test与新evidence `2026-09-28-s05-jsonb-diagnostic-types-gates.md`；Server type/build及相关仓库门禁独占，其他源码只读 | s05_jsonb_types_gates_0928 / 主仓 | /root/s05_jsonb_types_gates_0928 | closed | needs_split | [类型及门禁检查点](evidence/2026-09-28-s05-jsonb-diagnostic-types-gates.md)；仅类型断言，双转译JS字节相同；定向1pass/1skip、type/build、边界/8包依赖/普通lint/HEAD尺寸/diff通过；6文件严格complexity及16文件格式失败，资源停止，部署未执行 |

### Snapshot V3 复杂度门禁收敛

严格检查定位到 builder 27、completeness 31、dependencies 35、dependency-validation 21、execution-evidence 86／247 行和 source 25。按 Spec §10 保持业务语义拆分，原类型门禁叶到检查点关闭；本轮不借此治理其他领域 WIP。三个叶子禁止同时执行全包、typecheck 或 build，只执行各自定向测试和 owned lint；全部输出稳定后由独立验证叶统一执行类型、构建及真实仓库门禁。若需要修改其他所有者的文件则停止并报告依赖。

| ID | 结果 | 依赖 | 独占写入路径 / 共享资源 | 所有者 / 工作区 | 子代理会话 ID | Dispatch | 状态 | 交付 / 检查 / 阻塞 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S05-build-source-complexity-0928 | 收敛构建编排和来源封装复杂度 | 精确门禁失败及Spec §10合同 | `backtest-snapshot-v3-builder.ts`、`backtest-snapshot-v3-source.ts`、本职责新helper、新evidence `2026-09-28-s05-build-source-complexity.md`；对应定向测试只读 | s05_build_source_complexity_0928 / 主仓 | /root/s05_build_source_complexity_0928 | closed | worker_done | [构建职责证据](evidence/2026-09-28-s05-build-source-complexity.md)；builder27→20/388→375行，source25→18/184→128行；两个专属helper，13文件68项无skip及严格lint/格式/空白通过，公共API/顺序副作用/PIT拒绝保留，进程停止 |
| S05-dependency-complexity-0928 | 收敛依赖响应、依赖证据及完整性校验复杂度 | 精确门禁失败及Spec §10合同 | `backtest-snapshot-v3-dependencies.ts`、`backtest-snapshot-v3-dependency-validation.ts`、`backtest-snapshot-v3-completeness.ts`、本职责新helper、新evidence `2026-09-28-s05-dependency-complexity.md`；对应定向测试只读 | s05_dependency_complexity_0928 / 主仓 | /root/s05_dependency_complexity_0928 | closed | worker_done | [依赖职责证据](evidence/2026-09-28-s05-dependency-complexity.md)；入口35→10/21→19/31→11，原文件598→291/124→108/158→97行，四个专属helper；6文件31项及owned严格lint/格式/空白通过，全部复杂度≤19/函数有效length≤92；公共接口与拒绝/副作用顺序保留，资源停止 |
| S05-execution-evidence-complexity-0928 | 按证据类别拆分执行校验 | 精确门禁失败及Spec §10合同 | `backtest-snapshot-v3-execution-evidence.ts`、本职责新helper、新evidence `2026-09-28-s05-execution-evidence-complexity.md`；对应定向测试只读 | s05_execution_complexity_0928 / 主仓 | /root/s05_execution_complexity_0928 | closed | worker_done | [执行证据职责](evidence/2026-09-28-s05-execution-evidence-complexity.md)；入口299→84行，四个helper，最大复杂度18/有效函数length100/新file171；6文件15项及owned严格lint/格式/空白通过，进程停止；精确读取轨迹与复合坏输入首错缺独立现有断言，集中Review继续核对 |

### 剩余精确格式修复与稳定验证

格式门禁还涉及十个未由上述拆分叶拥有的 S05 文件。仅允许修复这十个已报告的格式问题；不对仓库或无关 WIP 批量格式化。所有源码叶停止后再派发，以免测试读取正在写入的文件。后续稳定验证需要重跑受职责拆分影响的包级回归；Schemas 与 DSA 未变输入继续复用，不累计定向测试到全包统计。首次格式叶在写入前发现转译器保留 import 排版，严格原始字节比较不相等，故停止且未改源码。接续验证先用同一固定工具仅归一打印格式，再比较转译字节，并检查移除位置和 trivia 后的语法树及运行字面量；任何语义差异仍须停止，不能通过比较摘要前删除语句、重排 import 或忽略字面量绕行。

| ID | 结果 | 依赖 | 独占写入路径 / 共享资源 | 所有者 / 工作区 | 子代理会话 ID | Dispatch | 状态 | 交付 / 检查 / 阻塞 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S05-owned-format-0928 | 修复十个已定位S05文件的格式问题 | 三个职责拆分叶终止全部写入和测试进程 | `backtest-reconstruction-preflight-v3.ts`、`backtest-snapshot-v3-calendar-alignment.ts`、`backtest-snapshot-v3-dependency-collector.ts`、`backtest-snapshot-v3-dependency-error.ts`、`backtest-snapshot-v3-events.ts`、`backtest-snapshot-v3-multi-window.ts`、Market `market-pit-reconstruction.repository.ts`及三份对应既有test（preflight、v3-snapshot-builder、repository）；新evidence `2026-09-28-s05-owned-format.md` | s05_owned_format_0928 / 主仓 | /root/s05_owned_format_0928 | closed | blocked | [格式验证检查点](evidence/2026-09-28-s05-owned-format.md)；转译器保留import排版，原始字节比較失败，零源码写入；未跑后续lint/格式/测试，进程已停止；验证合同接续独立新叶 |
| S05-owned-format-canonical-0928 | 在打印格式归一及AST一致约束下修复十个精确文件 | 原格式叶已关闭且源码未变；三个拆分输出稳定 | 原owned-format十个文件及新evidence `2026-09-28-s05-owned-format-canonical.md`；禁写其他源码/测试 | s05_format_canonical_0928 / 主仓 | /root/s05_format_canonical_0928 | closed | worker_done | [精确格式证据](evidence/2026-09-28-s05-owned-format-canonical.md)；10/10候选、AST、归一转译JS及printer语义一致；仅打印格式，普通/strict lint、Prettier和限定diff通过，进程停止 |
| S05-stable-regression-gates-0928 | 验证职责拆分和精确格式后的最终稳定输入 | 三个拆分与格式叶局部通过并停止 | 仅新evidence `2026-09-28-s05-stable-regression-gates.md`；Server全包/type/build及相关仓库门禁独占，源码只读 | s05_stable_regression_gates_0928 / 主仓 | /root/s05_stable_regression_gates_0928 | closed | worker_done | [稳定门禁证据](evidence/2026-09-28-s05-stable-regression-gates.md)；Server1736pass/88skip及type/build、59TS严格lint20/220/格式、边界/8包依赖、HEAD尺寸ratchet（13legacy warnings）/diff/文档链接通过；70输入及21证据起终一致，Schemas103树/451与真实原包82、DSA87稳定复用；dist1935/digest195960da…，未执行真实门禁，资源已停止 |

### 本批稳定输入的最终源码 Review

以下 Review 在职责拆分、精确格式修复和稳定验证达到检查点后开始，属于本批一次集中 Review。不会以局部 Review 代替完整 Spec、真实来源或整体验收。检查以实际源码及完整验收语义为准，发现问题须独立建修复叶并刷新受影响证据；Review 叶只读，不直接实现。

| ID | 结果 | 依赖 | 独占写入路径 / 共享资源 | 所有者 / 工作区 | 子代理会话 ID | Dispatch | 状态 | 交付 / 检查 / 阻塞 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S05-proof-review-0928 | 核对v2结构、真实原包parser和source capture必要证据语义 | 最终稳定验证检查点、无source writer | 源码与Spec只读；仅新evidence `2026-09-28-s05-proof-review.md` | s05_proof_review_0928 / 主仓 | /root/s05_proof_review_0928 | closed | worker_done | [证明源码Review](evidence/2026-09-28-s05-proof-review.md)；20源码hash稳定；发现F01来源时钟及F02新v2比较的亚毫秒截断P2，代码批准待修复；必要成功状态不等同生产资格，未运行额外门禁，资源停止 |
| M3-index-review-0928 | 核对两个指数修复的身份/日期/单位及消费者语义 | 稳定DSA87项及最终稳定检查点 | DSA源码/测试/能力SSOT与Spec只读；仅新evidence `2026-09-28-m3-index-review.md` | m3_index_review_0928 / 主仓与DSA | /root/m3_index_review_0928 | closed | worker_done | [指数源码Review](evidence/2026-09-28-m3-index-review.md)；限定代码和完整现有消费者未发现代码finding，六hash与87项证据一致；无额外运行请求；目录R02.11/R02.13状态缺本轮局部完成，由协调者精确更新原两行，真实G0-M仍开放 |

父进程负责完整 Spec/Task 对账、窗口执行器、Snapshot 构建/冻结/执行校验和严格 PIT 旧快照行为，最终结论写入集中 Review 证据；全局 §13 清单仍按整体验收条件判断。

### 集中 Review 的精确时钟修复

F01/F02 的 `Date.parse` 毫秒比较会将 `.123456Z` 与 `.123455Z` 判等，错误通过必要来源时钟或 v2 决策绑定。修复按 Spec §6 将既有 Server 证据瞬时原语交回 Schemas 所有，公共出口由协调者维护；先完成共享 v2，再由 Server 消费同一原语。禁止通过删除小数、改写时间或放宽比较消除反例。此检查点当时保留的 v1 及 v2 复用 legacy 内容/截点毫秒边界，已由后续 `CONT-S05-manifest-legacy-instant-precision` 和 `CONT-S05-archive-clock-v1-precision` 分叶修复；最终资格接线前仍须核对全部响应元数据时钟，不据这些本地叶子声称历史 PIT 已完整通过。

| ID | 结果 | 依赖 | 独占写入路径 / 共享资源 | 所有者 / 工作区 | 子代理会话 ID | Dispatch | 状态 | 交付 / 检查 / 阻塞 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S05-v2-precision-0928 | 精确比较v2决策、截点、原文获取及历史修订时钟 | proof-review已关闭；F02反例及Spec §6稳定所有权合同 | Schemas新 `market-pit-evidence-instant-v1.ts`、`market-pit-reconstruction-v3.ts`、`market-pit-historical-references-v1.ts`、`market-pit-historical-bar-bindings-v1.ts`、`market-pit-calendar-structure-v1.ts`仅非法时刻投影前保护及相关精确边界test；新evidence `2026-09-28-s05-v2-precision.md`；Schemas定向/全包/type/build独占；index由协调者 | s05_v2_precision_0928 / 主仓 | /root/s05_v2_precision_0928 | closed | worker_done | sol/high；[证据](evidence/2026-09-28-s05-v2-precision.md)：新增25项，定向109/全包476通过，类型/构建/严格lint/格式通过；+24:00投影保护及RTK首轮流程偏差已记录；131输入摘要6607626460bf20ddee8b93eca846eee682a25f041840c1626a4e3cf75dae98e0；未授予最终PIT资格；无后台进程，写权交还 |
| S05-source-times-precision-0928 | Server必要来源时钟消费同一精确原语 | v2-precision输出及协调者公共export/build稳定 | Server `market-pit-evidence-instant-v1.ts`改为兼容再导出、`market-pit-reconstruction-source-times-v3.ts`、对应来源时钟test；新evidence `2026-09-28-s05-source-times-precision.md`；Server定向/type独占 | s05_source_times_precision_0928 / 主仓 | /root/s05_source_times_precision_0928 | closed | needs_split | sol/medium；[证据](evidence/2026-09-28-s05-source-times-precision.md)：来源23pass（新增11）；关联110pass/1非owned窗口断言fail；公开日历82/type/owned普通及strict lint/格式/diff通过，Schemas131树未变复用476；首失败未停止后续命令的流程偏差已记；进程停止、写权交还，窗口修复前禁止升级全包/部署 |

### 精确截点的窗口消费断言

精度修复使窗口关联测试出现一个失败：新 v2 Schema 已在输入绑定阶段拒绝晚于冻结截点一微秒的观察，现有窗口断言仍预期进入后面的 `evidence-future` 分支。先以独立叶核对实际调用顺序、稳定错误合同及 fixture，再做最小断言修正；不得跳过 Schema 或调整比较顺序来恢复已失效的精度漏洞。该关联失败解除前不派发全包及目标同步。

| ID | 结果 | 依赖 | 独占写入路径 / 共享资源 | 所有者 / 工作区 | 子代理会话 ID | Dispatch | 状态 | 交付 / 检查 / 阻塞 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S05-window-cutoff-consumer-0928 | 对齐精确Schema前置拒绝的窗口断言 | 两个精度源码叶停止；关联失败及现有窗口源码顺序 | 仅 `apps/server/test/market/market-pit-decision-window-v3.test.ts` 的失败用例和新evidence `2026-09-28-s05-window-cutoff-consumer.md`；Server定向独占，其他源码只读 | s05_window_cutoff_consumer_0928 / 主仓 | /root/s05_window_cutoff_consumer_0928 | closed | worker_done | sol/low；[消费断言证据](evidence/2026-09-28-s05-window-cutoff-consumer.md)，仅标题和预期两行；窗口42/关联111通过，lint/格式/diff通过；191依赖输入未变复用公开82及type；无后台进程、资源交还 |

### 精度修复后的稳定回归与目标运行态

来源时钟叶停止且局部检查通过后，先以冻结输入刷新 Server 全包、类型与构建及受影响仓库门禁。Schemas 476 项及 DSA 87 项只在输入摘要不变时复用；真实公开日历 82 项须适用于本轮精度原语。通过后才能核对相邻 infra 的兼容条件并调用最小官方更新入口。本轮目标同步验证编译产物、必要拒绝合同与纯指数选择器，不创建业务任务或追加已耗尽的真实 Provider、AI、I01 重试。

| ID | 结果 | 依赖 | 独占写入路径 / 共享资源 | 所有者 / 工作区 | 子代理会话 ID | Dispatch | 状态 | 交付 / 检查 / 阻塞 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S05-precision-regression-gates-0928 | 核验精度修复后最终稳定输入 | 两个精度修复叶及窗口断言局部通过并停止；集中Review受影响源码复核 | 仅新evidence `2026-09-28-s05-precision-regression-gates.md`；Server全包/type/build及受影响仓库门禁独占，源码只读 | s05_precision_regression_gates_0928 / 主仓 | /root/s05_precision_regression_gates_0928 | closed | worker_done | sol/medium；[最终精度门禁](evidence/2026-09-28-s05-precision-regression-gates.md)，SHA beb52ccf…；Server226文件/1747pass，24文件/88skip；type/build/63TS lint/strict20及220/格式/边界/8依赖/HEAD尺寸ratchet（13legacy warnings）/diff/34文档168links通过；872输入稳定，Schemas476/DSA87/public82稳定复用；dist1935/SHA b081f50f…；工具路径/链接行号错误已修正记录，资源停止 |
| S05-m3-target-sync-0928 | 官方同步及必要合同目标验证 | 精度稳定回归通过；最终源码Review无未处理局部finding | 仅新evidence `2026-09-28-s05-m3-target-sync.md`与独占临时smoke；infra官方all入口、Server/Worker/DSA运行态独占；源码只读 | s05_m3_target_sync_0928 / 三仓 | /root/s05_m3_target_sync_0928 | closed | worker_done | sol/medium；[目标同步证据](evidence/2026-09-28-s05-m3-target-sync.md)：官方sync all兼容通过/exit0，UTC2026-09-27 19:54:45–19:56:18；三目标healthy/镜像未变，仅可写层；Server/Worker各16受控项、12编译SHA三方一致，DSA6受控项/6源SHA一致；非docs输入1466/1168/24起终无漂移；固定窗口缺表/fatal/error计数0；临时脚本路径初错已修正，无源码改动；无业务/Provider/AI/I01请求，进程停止写权交还 |

### M3 财务单接口合同前置

R04–R07 发现叶确认 R05.1 尚缺唯一接口、字段、报告期与单位合同。下一叶只核对固定版本实际适配源码及官方文档，选择一个既有财务表格接缝并列出尚缺原样数据事实；不运行来源业务请求，不用合成 fixture 冒充原样来源，不提前更改消费者或登记为准入成功。

| ID | 结果 | 依赖 | 独占写入路径 / 共享资源 | 所有者 / 工作区 | 子代理会话 ID | Dispatch | 状态 | 交付 / 检查 / 阻塞 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M3-r05-single-endpoint-contract-0928 | 固定R05.1财务行选择的单接口合同 | R04–R07前沿发现完成；DSA财务源码/版本稳定 | 仅新evidence `2026-09-28-m3-r05-single-endpoint-contract.md`；DSA/主仓源码只读、官方公开文档只读；禁止Provider接口调用 | m3_r05_single_endpoint_contract_0928 / 主仓与DSA | /root/m3_r05_single_endpoint_contract_0928 | closed | needs_split | sol/medium；[合同发现](evidence/2026-09-28-m3-r05-single-endpoint-contract.md)，SHA52b0a971…；唯一聚焦stock_financial_abstract，指标行×报告期列；安装1.18.94而依赖仅下限、官方1.18.97；单位/完整字段/身份及原样fixture仍缺，不能派发安全源码实现；无来源请求/运行资源，写权交还 |

### M3 财务原样合同采集

单接口发现已明确真实表方向，但单位及响应身份不能由文档或安装源码补造。后续只采集 `stock_financial_abstract` 的官方示例 `600004` 对应固定原 endpoint 一份公开响应，以该原响应离线重放安装版转换函数，不再发第二次网络请求。限定实际外部 HTTP 请求总数 **1、重试 0**；首次请求失败即停止，不改标的、endpoint、SDK 或市场前缀。仅属当前财务合同发现，不计 G0 准入、历史修订或真实回测成功，不重置其他来源/AI/I01 预算。原文及生成表为独立采集运行产物，保留路径、字节数与摘要；说明和采集脚本用原生编辑工具维护。

| ID | 结果 | 依赖 | 独占写入路径 / 共享资源 | 所有者 / 工作区 | 子代理会话 ID | Dispatch | 状态 | 交付 / 检查 / 阻塞 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M3-r05-abstract-raw-contract-capture-0928 | 取得单endpoint原样字段及身份/单位事实 | single-endpoint发现关闭；真实请求1/0预算及安装源摘要已记录 | 仅新evidence `2026-09-28-m3-r05-abstract-raw-contract-capture.md`、独占 `/private/tmp/m3-r05-abstract-contract-0928` 原文/生成表及采集脚本；DSA/主仓源码只读，无共享运行资源 | m3_r05_abstract_raw_contract_capture_0928 / 主仓与DSA | /root/m3_r05_abstract_raw_contract_capture_0928 | closed | worker_done | sol/medium；[原样证据](evidence/2026-09-28-m3-r05-abstract-raw-contract-capture.md)，SHA169c142a…；HTTP200，1/1请求/0重试，2,277,455字节/98期；离线SDK表80×100、7491有限/349NaN/0inf、无重复；原文SHA90d1cc95…，有CNY/publish_date但无证券自证/金额倍率/比例单位；实施仍needs_split，不可派发猜测实现；进程停止写权交还；协调者同步能力原行R05.1/财务源表，117唯一ID/4列/links通过，目录SHA2a34aeb6… |

## 12.9 按交接继续实施（2026-09-28）

入口为 `/private/tmp/thesis-ledger-backtest-handoff-2026-09-28-progress.md`。用户要求继续完整 M1/M2/M3 范围，遇到卡点重试一次仍失败则记录并跳过；跳过不等于验收通过。已有耗尽请求预算沿用，不因恢复、换叶或诊断重置。当前 Context Mode 不可调用，使用 RTK 与有界派生输出。后续按用户最新要求不使用 `codex-cost` 或子代理，继续遵循 `spec-driven-workflow`；下方子代理台账仅记录已发生的历史实施与写权交还。

启动基线：主仓 HEAD `fe0e871e37a09964f7a113b82e7d09f6d4d95f7e`、156 modified/383 untracked；DSA HEAD `f497b6dad0e5519bbbcce1e51a2889d2c2634009`、23/137；infra HEAD `9a1f03756afe6831875fa2434619af6500307b00`、8/3。三仓 staged 均为 0，全部 WIP 保留。先用独立发现叶确定精确写集和前提，现有已通过检查仅在输入未变时复用。

| ID | 结果 | 依赖 | 独占写入路径 / 资源 | 所有者 / 工作区 | 状态 | 输出 / 检查 / 阻塞 |
| --- | --- | --- | --- | --- | --- | --- |
| CONT-M1-frontier | 核实 S05 与其余 M1 可实施前沿及已耗尽门禁 | 最新 Review、Spec §6、Task §3–8/12.8 | 仅 `docs/tasks/evidence/2026-09-28-cont-m1-frontier.md`；源码、临时原文及运行态只读，无业务请求 | cont_m1_frontier / 主仓 | worker_done | sol/high；[发现](evidence/2026-09-28-cont-m1-frontier.md)；最终历史资格及I01原载荷缺失；D01实际接线存在；内容精度叶Ready，进程停止、写权交还 |
| CONT-M2-currency | 核实 M26-b2 币种/身份合同的最小可实施叶 | 既有 Tushare 读取、RQData 原文合同及最新来源状态 | 仅 `docs/tasks/evidence/2026-09-28-cont-m2-currency-frontier.md`；两仓源码只读，无 Provider 请求 | cont_m2_currency / 主仓与 DSA | worker_done | sol/high；[发现](evidence/2026-09-28-cont-m2-currency-frontier.md)；纯resolver及五阶段接缝已固定；M21–M34剩余分类保留；进程停止、写权交还 |
| CONT-M3-pagination | 核实 R01.5-pagination 严格目录读取的实施边界 | 能力目录、既有 Catalog 消费者及已有采集证据 | 仅 `docs/tasks/evidence/2026-09-28-cont-m3-pagination-frontier.md`；DSA 源码/公开文档只读，不访问数据接口 | cont_m3_pagination / 主仓与 DSA | worker_done | sol/medium；[发现](evidence/2026-09-28-cont-m3-pagination-frontier.md)；现有parser/reader不重做，HTTP边界测试Ready；分类/完整请求阻塞；117唯一ID无遗漏，进程停止、写权交还 |

### 就绪实施叶与保留卡点

三个发现叶已完成，证据分别为 [M1 前沿](evidence/2026-09-28-cont-m1-frontier.md)、[M2 币种/身份](evidence/2026-09-28-cont-m2-currency-frontier.md) 和 [M3 分页](evidence/2026-09-28-cont-m3-pagination-frontier.md)。源码与已有记录两次核对确认 S05 最终原发布/场所/XSHE/修订证据缺失；I01 原 ORM 回读完整载荷未保留；目录分类原文未找到且完整请求预算耗尽，分别记录跳过，原父项和真实验收不勾选。117 个 M3 唯一编号为 116 固定项加 R07.8 模板，无遗漏；能力事实仍由原 SSOT 所有。

| ID | 结果与合同 | 依赖 | 独占写集 / 资源 | 所有者 | 状态 | 检查与停止条件 |
| --- | --- | --- | --- | --- | --- | --- |
| S05-content-cutoff-precision | v2 实际归档观察/Bar/可见/抓取截点保留亚毫秒；v1独立合同保留，仅输出archives-bound | Spec §6及已建精确瞬时原语；Schemas输入稳定 | Server `market-pit-reconstruction-content-v3.ts`、新`market-pit-reconstruction-content-clock-v3.ts`、`market-pit-reconstruction-content-v2.test.ts`；专属evidence `2026-09-28-cont-s05-content-precision.md`；无共享build/DB/运行态 | cont_m1_frontier | worker_done | [证据](evidence/2026-09-28-cont-s05-content-precision.md)；66项定向、Server类型、限定lint/格式/空白通过；先证明旧实现微秒越界，再修复必要绑定；qualified边界不变，无业务请求，进程停止/写权交还 |
| R01.5-http-boundary-tests | 用现有parser/reader验证实际_fetch_page的HTTP、流式大小、解码、期限及失败关闭边界 | parser/reader已存在；不依赖缺失的分类事实 | DSA `tests/test_eastmoney_fund_catalog_reader.py`；主仓专属evidence `2026-09-28-cont-m3-pagination-http.md`；无网络/共享运行资源 | cont_m3_pagination | worker_done | [证据](evidence/2026-09-28-cont-m3-pagination-http.md)；新增9项、parser/reader28项通过，限定flake8/编译/空白通过；源码无变、0网络，分类/真实覆盖未通过；进程停止、写权交还 |

规划预检：上述两叶 Ready，输入与写集互不相交；所有共享全包/build/仓库和目标同步检查由协调者在源码稳定后统一安排。它们各自只证明必要内容绑定或离线传输边界，不授予历史资格、目录完整性或真实准入。

Tushare 后继按 [币种/身份发现](evidence/2026-09-28-cont-m2-currency-frontier.md) 拆为纯 resolver、共享 wire、Server 消费、DSA 映射读取、事件库存/HTTP 五叶。Spec §4 已固定首版 CN ETF 同完整代码、身份与独立分红币种原文合同；NAV/OF/别名不在首版。本地合同及受控接线可实施，真实审核/账号权限/历史完整覆盖分别保留为门禁，不将外部前提用 fixture 补造。

| ID | 唯一交付 | 启动依赖 | 独占写集 / 资源 | 所有者 | 状态 | 验证 / 剩余条件 |
| --- | --- | --- | --- | --- | --- | --- |
| M26-b2-identity-resolver | 纯解析当前准入绑定的Tushare ETF身份/独立分红币种原字节 | Spec §4已固定、既有准入/存储原语稳定 | DSA新`src/services/tushare_fund_identity_evidence.py`及`tests/test_tushare_fund_identity_evidence.py`；主仓专属evidence `2026-09-28-cont-m26-identity-resolver.md`；无文件读取/账号/SDK/网络/DB | cont_m2_currency | worker_done | [证据](evidence/2026-09-28-cont-m26-identity-resolver.md)；新增155/关联197项通过，限定lint/编译/空白通过；精确原时刻先验、旧primitive仅内部validUntil投影；原准入与bytes不改写，进程停止、写权交还 |
| M26-b2-identity-wire | 独立原文bundle和事件关联合同 | resolver字段稳定 | 下方执行包列出的Schemas专属模块/测试/golden/事件合同及唯一出口；独占Schemas dist | cont_m26_identity_wire | worker_done | [证据](evidence/2026-09-28-cont-m26-identity-wire.md)；定向122、DSA真实resolver golden13、全包546项/45文件、类型/build、限定lint/strict复杂度/格式/尺寸/边界/依赖通过；源码/dist稳定、写权交还 |
| M26-b2-identity-consumer | Server在线/离线原字节摘要与范围/币种核验 | wire已验证并释放稳定dist | 下方已登记Market专属验证器、selector/冻结接缝及新定向测试 | cont_m26_server_consumer | worker_done | [证据](evidence/2026-09-28-cont-m26-identity-consumer.md)；48项、类型、normal/strict20/220 lint、格式/尺寸/空白/边界/依赖通过，真实Parquet与新Store读回；唯一selector纯格式修复前后AST一致，进程停止/写权交还 |
| M26-b2-mapped-read | DSA读前证据与读后准入/凭据/原文复核 | resolver验证完成；既有精确读取/凭据原语稳定，不依赖正在构建的wire | DSA新`src/services/thesis_ledger_tushare_mapped_read.py`及`tests/test_thesis_ledger_tushare_mapped_read.py`；专属evidence `2026-09-28-cont-m26-mapped-read.md`；既有reader/store/凭据只读 | cont_m2_currency | worker_done | [证据](evidence/2026-09-28-cont-m26-mapped-read.md)；210项、限定lint/语法/空白通过；真实环境快照/HMAC及实际受控HTTP，原文/准入/修订前后核验；空集版本及coverage=false保留，未注册库存/公共wire，无真实请求，写权交还 |
| M26-b2-event-registry-local | 单向登记精确CASH库存与适配/来源修订 | mapped-read及wire稳定；不执行消费者，不依赖进行中的Server叶 | DSA `src/services/thesis_ledger_event_v3_adapters.py`、`src/services/thesis_ledger_market_v3_revisions.py`、新`tests/test_thesis_ledger_tushare_event_registry_v3.py`；专属evidence `2026-09-28-cont-m26-event-registry.md` | cont_m26_event_registry | worker_done | [证据](evidence/2026-09-28-cont-m26-event-registry.md)；34新/关联121项、限定lint/编译/空白通过；只精确CASH，真实SQLite/HMAC current matcher及轮换/撤销；首次import collection失败唯一修复重试后通过，输入增加后重验；没有真实ready/cover，写权交还 |
| M26-b2-event-runtime-local | 生产前置guard与当前准入/修订/鉴权HTTP接线 | registry、Server consumer、mapped-read/wire通过且稳定 | 下方登记Tushare专属运行模块及必要event/provider runtime/HTTP接缝 | cont_m26_event_registry | worker_done | [证据](evidence/2026-09-28-cont-m26-event-runtime.md)；41本叶/184关联/最终输入75项通过，受控HTTP经实际Schemas dist解析；前后原文/准入/安全检查，coverage=false；runtime净减17行，限定lint/编译/空白及critical通过，普通E302债保留；0真实请求，进程停/写权交还 |

第一源码叶规划预检 Ready；其余是保留义务，尚未派发，须按上游结果固定精确写集后实施。任何局部失败按用户要求只重试一次，仍失败记录并跳过该阻塞与依赖路径，继续独立就绪任务。

mapped-read 的依赖已按实际接口收敛：只返回内部读取结果与原证据 bytes，消费已验证 resolver 和既有精确读取，不生成正在实施的公共 wire，因此可独立 Ready。生产事件叶继续等待 wire、Server consumer 与 mapped-read 全部验证。读前必须检查当前准入/适配与凭据修订、加载当前绑定文件并经 resolver 核验；缺身份时零读取账号与 SDK。以同一不可变凭据快照读取后，再核对当前准入、文件原字节及凭据修订，拒绝撤销/轮换/损坏晚到结果；不得只相信回调或纯 resolver 授权当前 runtime。公开诊断稳定脱敏，内部原时间与准入不使用微秒投影替换。若现有实际凭据接口无法从专属服务单向复用，返回 needs_split，禁止反向 import API 或修改共享服务规避边界。

`M26-b2-identity-wire` 执行包：唯一写集为 `packages/schemas/src/market-tushare-identity-v3.ts`、`test/market-tushare-identity-v3.test.ts`、`fixtures/market-tushare-identity-v3.synthetic.json`，以及 `src/market-event-wire-v3.ts`、`src/index.ts`、`test/market-event-wire-v3.test.ts` 的必要接缝；专属 evidence `2026-09-28-cont-m26-identity-wire.md`。约定只在精确 Tushare CN ETF CASH 响应使用独立字段，原字节和准入摘要/范围/币种关联一致，其他来源不可携带该字段，缺证据拒绝。复用 Schemas 已有精确瞬时与严格日期原语，不把小数秒送入 `Date.parse`。新增 fixture 明确是离线合成合同，交给已完成 DSA resolver 验证同字段/原字节/时间边界；既有 RQData/EastMoney 回归保留。完成检查：定向 Schema→DSA golden 消费→Schema 类型/全包/build→限定lint/格式/尺寸/边界，消费者只在 build 成功且输入稳定后释放。仅本叶独占 Schemas dist；没有 Provider/目标/数据库，失败只重试一次。该叶等待 resolver 完成信号，不读取进行中的实现。

| ID | 唯一交付 | 依赖 / 稳定输入 | 独占写集 / 资源 | 所有者 | 状态 | 检查与停止条件 |
| --- | --- | --- | --- | --- | --- | --- |
| CONT-M3-flow-contract | 固定R06.12单endpoint日期/金额字段及现存消费者的最小合同 | 原能力目录及R04–R07发现；只读实际SDK源码与官方文档 | 仅evidence `2026-09-28-cont-m3-flow-contract.md`；DSA源码只读，官方公开文档可读，无业务接口/账号/DB/测试 | cont_m3_flow_contract | worker_done | [证据](evidence/2026-09-28-cont-m3-flow-contract.md)；两次官方核对仍缺金额单位/完整样本，完整数值合同skip；独立请求作用域修复已拆出，无真实请求 |

该发现叶只解决已保留的单接口选择前提，不新建资金流产品；已存在通用资金流fallback与外层Consumer保持其既有边界。与三个实施写集不相交，规划Ready。

R06.12 最新日完整数值合同经两次官方核对仍缺金额单位及完整金额样本，[单接口证据](evidence/2026-09-28-cont-m3-flow-contract.md)记录跳过该阻塞。独立的默认 `sh` / 无参默认标的风险需拆开核对：`CONT-M3-flow-request-scope` 仅检查是否可向已确认 SDK 显式传递 stock/market 并拒绝未知场所，禁止无参默认目标回退；不依赖金额单位、不改数值选行/单位或授予准入。唯一写集仍为该专属发现 evidence 的补充段落，源码只读；所有者 cont_m3_flow_contract，pending。确认精确参数接缝后再派独立源码叶，缺市场身份则失败关闭而不猜测。

请求作用域发现完成：[证据 §7](evidence/2026-09-28-cont-m3-flow-contract.md)确认实际 SDK stock/market 参数和 Manager 预归一化剥离场所。`R06.12-request-scope-guard` 规划 Ready；对应 Spec §3.3 已固定，金额合同 skip 保留。独占写集：DSA 新 `data_provider/eastmoney_individual_fund_flow_request.py`、新 `tests/test_eastmoney_individual_fund_flow_request.py`、`data_provider/fundamental_adapter.py` 的 import/get_capital_flow 狭窄接缝；专属主仓 evidence `2026-09-28-cont-m3-flow-request-scope.md`。所有者 cont_m3_flow_contract，pending。原大文件净行数不得增加；其他 getter、全局行选择、数值/日期与 metadata 不在写集。用伪 AKShare 经真实候选调用证明显式 SH/SZ 精确 kwargs、缺场所零股票调用、失败/空表零股票回退及行业独立；定向→既有fundamental消费者回归→限定lint/编译。无真实来源或运行资源；失败只重试一次后记录。当前裸代码消费者将按已知缺失安全拒绝股票能力，未将此宣称为股票资金流成功或全面 Consumer 修复。

| ID | 唯一问题 / 结果 | 依赖与边界 | 独占写集 / 资源 | 所有者 | 状态 | 检查与停止条件 |
| --- | --- | --- | --- | --- | --- | --- |
| CONT-I01-request-identity | 核实同事实两次请求的传输requestId是否进入不可变完整响应身份并造成I01入参冲突 | 现有单窗口hash、repository和失败fixture；仅静态源码/原fixture离线内存比较，不复跑Worker/DB/DSA/来源门禁 | 仅evidence `2026-09-28-cont-i01-request-identity.md`；无生产源码写权或共享运行资源 | cont_i01_request_identity | worker_done | [证据](evidence/2026-09-28-cont-i01-request-identity.md)；实际生产先规范化requestId，同fixture只改requestId得到hashEqual=true，二次静态核对一致，排除此假设；原ORM响应未保留，根因与真实门禁仍未通过 |

R06.12 请求 guard 已交付：[实施证据](evidence/2026-09-28-cont-m3-flow-request-scope.md)；新5项及相关33项通过，限定lint/编译/空白通过，adapter 715→715行，无来源请求，进程停止/写权交还。独立后继 `R06.12-explicit-scope-consumer` 只恢复调用方原有完整 `.SH/.SZ` 向股票资金流 adapter 的传递，不把裸码推定为场所。独占候选写集 DSA `data_provider/base.py` 的 `get_capital_flow_context` / `get_fundamental_context` 两个调用接缝、新 `tests/test_capital_flow_request_scope_context.py`、专属主仓 evidence `2026-09-28-cont-m3-flow-scope-consumer.md`；其他价格/财务 getter 和参数规范化合同保持其已有逻辑，不增加原大文件规模。所有者 cont_m3_flow_contract，pending；先在只读原函数确认原完整参数尚可保存且没有跨 getter 语义改动后才实施，否则记录 needs_split。完成检查：实际 Manager→adapter 受控请求保留显式场所、裸码拒绝、未知格式拒绝、资金流为空不被行业聚合掩盖、其他调用仍收到原规范代码；定向与既有context回归、限定lint/语法/净规模检查。单位/最新日期/原响应身份/真实准入门禁继续未通过。

consumer 执行包补充：在 `get_fundamental_context` 自身的 CN cache_key 接缝纳入作用域约束版本及规范化前原始请求身份；公共 `_get_fundamental_cache_key` 和其他 getter 只读。该变更防止 `.SH/.SZ` 成功资金流经裸码缓存读取绕过缺身份拒绝，也拒绝旧无scope缓存复用；只读发现已证实旧公共key会剥离后缀。对应 Spec §3.3 已先更新，授权在原独占函数内实施此必要隔离。新增正反顺序缓存用例（显式→裸码、裸码→显式、不同场所、旧无scope seed）及同scope复用，其他市场/调用保持原合同。大文件净规模 ratchet 不放宽；失败一次重试后记录跳过。

R06.12 consumer 已交付：[证据](evidence/2026-09-28-cont-m3-flow-scope-consumer.md)；两个入口仅向资金流保留原场所，CN cache 以 `capital-scope-v1` 和原身份隔离，其他getter/非CN行为保持。consumer+guard 9项与关联33项通过，项目关键lint/编译/空白通过，`base.py` 3774→3774行。整文件风格lint仍有95项未触及债务，owned范围0项，不计为整文件lint通过；无真实请求，进程停止/写权交还。完整金额、日期选行、原响应身份和真实准入仍skip。

`CONT-M26-event-runtime-seams` 只读发现叶 Ready：确认现有事件库存、修订、Provider runtime、鉴权HTTP与受控测试的精确接缝及独占生产写集，不消费正在修改的Schemas/DSA mapped模块、不运行来源请求。所有者 cont_m26_runtime_seams；唯一写集 `docs/tasks/evidence/2026-09-28-cont-m26-runtime-seams.md`，源码只读。输出一份可派发执行包，明确当前安全修订和入场前/返回前检查、共享资源与测试命令；源事实未知则保留覆盖/准入阻塞，不扩大到其他来源。

`CONT-acceptance-frontier` 只读对账 Ready：按完整 Spec AC01–AC20、主Task未完成叶及唯一117单元目录，区分已有局部完成、外部前提/预算阻塞、未实施但可独立就绪项。所有者 cont_acceptance_frontier；仅写专属 `docs/tasks/evidence/2026-09-28-cont-acceptance-frontier.md`，不写主台账/Spec/SSOT，不读取进行中的wire，不运行测试/来源/账号/DB。输出可继续推进的最小叶执行包或证据支持的跳过理由，历史失败预算不重置；至少核对M1/M2/M3和真实/AI/UI，避免仅关闭本批便冒充全文完成。

`M26-b2-identity-consumer` 待 wire 稳定build释放后 Ready，执行包已固定：新 `apps/server/src/market/market-tushare-identity-v3.ts`，狭窄 `market/market-event-selector-v3.ts` 与 `backtest/backtest-snapshot-v3-events.ts` 的验证器调用；新 `apps/server/test/market/tushare-event-fixtures.ts`、`market-tushare-identity-v3.test.ts`、`test/backtest/backtest-tushare-identity-replay-v3.test.ts`；仅专属 evidence `2026-09-28-cont-m26-identity-consumer.md`。Schemas、既有RQData/EastMoney及Store实现只读；复用共享golden，真实UTF-8摘要独立重算，验证bundle范围/币种/准入，在线失败不重试/切源，离线实际Parquet及新Store读回重验。合成coverage=true只测试既有完整覆盖路径，原读取coverage=false仍拒绝冻结，不授予实际历史资格。定向自身/既有event/RQData/split→Server类型→限定lint/strict复杂度/格式/尺寸/边界；全包和Server dist待所有源码稳定后由唯一验证所有者处理。无网络/DB/账号/目标请求；失败重试一次仍失败记录，扩大写集前返回needs_split。

`CONT-M26-event-runtime-seams` 已完成并返回拆分：[证据](evidence/2026-09-28-cont-m26-runtime-seams.md)。现有事件policy/目录/通用Tushare准入检查可能在证据前读取账号，生产叶必须parse后先做不读取凭据的当前准入/原文guard；通过不等于ready，后续HMAC与policy/catalog/security前后完整复核仍必要。库存与runtime两叶串行，源码所有权不重叠；registry叶独占上述两源/新test，无共享build/目标/真实配置，定向event控制/修订回归后限定lint/编译/空白，失败重试一次后记录。Server消费者可独立并行；生产wire输出须待消费者通过。

`CONT-acceptance-frontier` 已完成：[全文对账](evidence/2026-09-28-cont-acceptance-frontier.md)覆盖AC01–AC20、M1/M21–M34及117目录单元分组，既有完成项不重做，卡点按实际尝试/缺失输入保留，没有将每项虚构成两次失败。下一独立 Ready 为 `R02.5/R02.6-eastmoney-quote-unique-row`：新 DSA `data_provider/eastmoney_quote_identity.py`、新`tests/test_eastmoney_quote_identity.py`，既有`data_provider/akshare_fetcher.py` 股票/ETF EM报价两处行选择接缝；专属 evidence `2026-09-28-cont-m3-eastmoney-quote-identity.md`。所有者待派；Spec §3.3已先补唯一精确目标行约束。缺代码列/无目标/重复目标拒绝原来源；保持endpoint/单位/时间/回退，原大文件净不增。不新增真实请求；实际Fetcher伪SDK正反例→现存报价/日志/回退回归→限定lint/语法/规模/空白，失败重试一次记录，其他源码只读。

调度卡点：报价唯一行叶两次新会话派发均返回 `agent thread limit reached`，未启动worker/测试、未修改报价源码。按用户规则记录本次调度跳过，不计为已完成或源码失败；执行包和真实准入义务仍保留。旧runtime发现会话续派也两次同类失败，已以可用新registry会话承接相同独占范围，不重置任何源码或来源请求预算。Schemas已完成会话未占源码/dist写权，不能为了工具调度复用其不相关上下文实施报价。

Server consumer限定格式检查发现原 `market-event-selector-v3.ts` 已有格式债（移除本叶两行仍不通过）。在同一worker/独占文件内追加唯一纯格式修复授权：使用项目锁定Prettier，仅此89行文件；保留所有WIP和逻辑，用规范化AST/转译证明格式前后语义不变，再重跑受影响定向/类型/限定门禁。不得扩大到其他文件或借机重构，首失败保留，只有最终检查通过后才释放局部消费者。

`M26-b2-event-runtime-local` 执行包已固定，等待Server consumer通过后释放：新 DSA `src/services/thesis_ledger_tushare_event_v3.py`、新 `tests/test_thesis_ledger_tushare_events_v3.py`；既有 `src/services/thesis_ledger_event_v3.py` 请求解析/前置guard/读返回接缝、`src/services/thesis_ledger_provider_runtime.py` 当前事件准入/目录修订分流及可信同快照Fetcher构造接缝、`api/thesis_ledger_events_v3.py` 鉴权安全配置读前/读后复核；仅专属 evidence `2026-09-28-cont-m26-event-runtime.md`。库存/修订、mapped/resolver、Schemas/Server、Control凭据实现均只读。大文件净规模ratchet不放宽，新增职责放Tushare专属服务；需要额外职责模块先返回needs_split。先真实runtime临时SQLite/原文/底层HTTP mock闭环，再实际TestClient HTTP/Bearer安全配置轮换闭环，公共成功保留原文、事实精度/源日期/空集版本/coverage=false，错误脱敏且零自动重试。验证缺原文在policy/catalog前零凭据读取（涵盖Control账号解密，不只snapshot spy），生产current matcher、读后撤销/修订/凭据/策略/目录/安全轮换、跨仓严格wire消费。定向→既有event/RQData/bar安全相关回归→限定lint/编译/规模/空白；只一次修复重试，未通过不升级目标。没有真实来源/账号/目标准入或DB请求。

`CONT-Server-stable-gates` Ready：Server/Schemas所有本批源码及局部检查已稳定，DSA生产叶只写相邻repo，不影响Server构建输入。所有者 cont_m26_server_consumer；唯一写集主仓专属 `docs/tasks/evidence/2026-09-28-cont-server-stable-gates.md`、独占 `apps/server/dist` 构建产物及 `/private/tmp/cont-server-stable-*` 日志/输入清单；所有源码/测试/manifest/lock/Schema dist只读。按稳定输入先Server全包（真实DB/公开原包默认skip独立统计）→类型/build→本批Server/Schemas限定normal/strict20/220 lint及格式→全仓边界/包依赖/真实HEAD尺寸ratchet及限定空白，失败不升级、一次重试后记录；不借旧无基线尺寸通过。保留起终源码/config输入摘要和实际dist清单，DSA/runtime/目标/Provider/AI/DB不在本叶，目标同步仍等待DSA低层门禁通过。

生产叶合同澄清：HTTP当前安全配置仅现有 `THESIS_LEDGER_DSA_TOKEN`/Bearer，策略enabled/targets名单按既有policy前后快照复查，不新造HTTP安全开关。事件公共响应仅使用既有strict wire字段；内部reader的retrieval/observations及全部独立源日期保留并验证，不新增公共顶层字段，public只投影协议已定义的facts/recordDate/paymentDate/strategyVisibility等。内部内容指纹不是供应商历史数据版本；原始其他日期未进入public不能声称公共完整封存。

`CONT-Server-stable-gates` 检查结果已回报：228文件/1769项通过，24文件/88项skip（80运行时/DB/backup、1JSONB诊断、7公开原文），不叠加定向计数；类型/build各一次，限定normal/strict20/220、格式、boundary/8包依赖、真实HEAD size ratchet、tracked/untracked空白通过。保留13条存量尺寸warning，889份source/config起终0漂移，依赖dist在内1237份及额外门禁1283份均0漂移；Server dist 1950份，聚合摘要`0fc94c7d100a5bcf3a0df692b39b64ed6f6680b543e68e3d7305c0c8039365c4`。18份事件shape消费者仅Server/Schemas，其他应用/domain无直接消费，不额外跑无关包。专属evidence仍由该worker收尾，Server dist写权已释放，目标同步待DSA稳定验证。

`M26-b2-event-runtime-local` 局部检查已回报：本叶41项及关联184项通过，真实受控HTTP exchange经Schemas稳定dist解析通过；入口在policy/catalog前、mapped前后及最终返回前各按职责复核原文/当前状态，复查期间原文变化有反例。`thesis_ledger_provider_runtime.py` 2587→2570行，同职责重复检查收敛，bar回归保留；新服务/test/event/API限定lint通过，大runtime整文件仅原line84 E302格式债，项目critical E9/F63/F7/F82通过，不把整文件风格失败叫pass。worker仍收尾专属evidence/输入hash，未释放到目标同步；覆盖依旧false，无真实权限/账号/Provider门禁。

资源条件变化后的调度恢复：Server稳定门禁与DSA生产会话已结束，报价唯一行叶 `R02.5/R02.6-eastmoney-quote-unique-row` 新鲜会话派发成功，所有者 cont_quote_final，running；精确原写集/合同不变。先前两次thread limit是历史工具失败，不计源码已完成/失败，也不重置任何已耗尽来源预算；DSA最终共享检查等待本叶源码稳定，Server/Schemas输入不受这条Python报价修改影响，其已通过结果可复用。

`CONT-Server-stable-gates` 专属[最终证据](evidence/2026-09-28-cont-server-stable-gates.md)已完成，所有命令结束、Server dist正式交还；逐文件1950项SHA清单位于 `/private/tmp/cont-server-stable-dist.json`。此前“worker仍收尾”属于历史进度，不是当前假running。

报价叶局部结果已回报：59新增及45关联项通过，helper/test限定lint、全仓projectcritical E9/F63/F7/F82通过；`akshare_fetcher.py` 2633→2630行，整文件200条存量style债仍在核对基线不增，不能计作整文件风格通过。worker仍补专属evidence，不启动共享DSA检查或目标同步；真实单位/时点/来源准入仍开放。

`CONT-DSA-stable-gates` 待报价最终交付后Ready：所有本批Python源码暂停修改；唯一执行者 cont_m26_event_registry，独占 `/private/tmp/cont-dsa-stable-*` 日志/必要隔离临时测试文件和专属 `docs/tasks/evidence/2026-09-28-cont-dsa-stable-gates.md`，全部源码/测试/配置只读。先已有定向证据核对及官方 `scripts/ci_gate.sh syntax`/`flake8` critical，再官方 `offline-tests`（`-m 'not network'`、真实timeout插件/线程watchdog保留，不降低门禁）。预检测试环境/默认DB路径与凭据隔离，不读取真实账号、不调用真实来源/目标，不因测试失败自动安装依赖或修改源；不得把单测临时SQLite叫目标结构验收。缺环境/必需检查失败只一次补查或重试后记录，暂停目标升级；成功记录实际pass/skip/deselected、起终输入摘要与路径，复用未变输入结果。前述普通style基线债单独保留，不冒充fullstyle通过；文档/Frontend/Native未改源码，不额外构建。root在稳定门禁后安排官方目标同步与一次最终集中Review。

报价叶 `R02.5/R02.6-eastmoney-quote-unique-row` 已worker_done：[证据](evidence/2026-09-28-cont-m3-eastmoney-quote-identity.md)。`unique_quote_row(frame, stock_code)` 只返回唯一精确原行；59新/45关联通过，新文件lint/编译、全仓critical、owned接缝/空白通过。精确反向恢复本叶前字节并匹配派发SHA，整文件style原202→当前200，新增诊断0；2633→2630行。所有进程停、写权交还；此前派发skip已在资源改变后恢复完成，不是当前未实施义务。原R02.5/.6父单元的其他候选、单位/时点/真实准入依旧开放。

`CONT-DSA-stable-gates` 上游全部稳定，现Ready并派cont_m26_event_registry执行；唯一共享Python检查所有者。全部三仓源码冻结，root仅对齐说明文档；Server/Schemas门禁输入未变，已通过高成本结果复用。

DSA稳定门禁环境预检：pytest9.1.1/timeout2.4.0/flake8 7.3已具备，官方offline保留not-network与120秒线程timeout/300秒栈诊断。但tests/conftest没有全局凭据/DB/网络隔离，部分测试显式load_dotenv，默认DB为`./data/stock_analysis.db`，因此不在实工作树直接跑全包。授权同验证者在独占`/private/tmp/cont-dsa-stable-*`创建源码/tests/必要非秘密配置快照（与原输入逐文件摘要对账，不复制`.env`、实际data/logs/credentials/用户配置），清空继承敏感环境并指定临时ENV_FILE/DB/LOG_DIR；辅助sitecustomize禁止真实外部socket及读取外部.env/DB，localhost只许本测试已绑定的临时端口。原源码/测试/CI参数/marker只读，不降低门禁或安装依赖；隔离前提不足失败保留并暂停升级，不将阻断网络当真实Provider通过。

DSA隔离官方门禁首失败保留：syntax/critical退出0，offline收集225 errors/2608 items、0测试执行；副本rsync `--exclude=data`误排除源码`src/data`，非源码业务回归。唯一有依据的隔离修复重试改为仅根`/data/`、`/logs/`排除，补齐源码和明确非秘密test fixture；以原工作树完整预期输入集合核对missing/extra/hash，不仅比较已复制项。新增Python输入后必要低层syntax/critical重新覆盖完整副本，再一次offline重试；再失败停止，不放宽环境限制/marker/timeout或修改source，目标同步依赖仍未释放。

DSA稳定门禁唯一重试已完整结束：7229 collected、7225 selected，7208 passed、16 failed、1 skipped、4 deselected，594 subtests passed。首轮副本遗漏源码、第二轮隔离native子进程及Node PATH存在限制，同时保留实际断言失败；不能计为全包通过。第二轮启动前最终完整输入critical未先完成，随后syntax/critical均退出0，但顺序偏差保留；HOME只从继承环境删除，未显式指向临时目录，SDK fallback账号读取全覆盖未知，不能声称OS-wide隔离或已证明零真实账号读取。原工作树完整预期1347输入与副本missing/extra/hash mismatch均0；本叶进程精确清理结束。详见即将归档的专属证据，禁止第三次同前提全包重跑，依赖本门禁的目标同步记录跳过，不用Server/Schemas通过替代DSA结果。

集中源码Review修复叶 `CONT-M26-url-authority` worker_done：[证据](evidence/2026-09-28-cont-m26-url-authority.md)。Python resolver的`urlsplit`原接受authority中反斜杠，共享wire拒绝；新测试先证明两证据角色/生产入口旧错误放行，再在`_document`拒绝该authority，不改原文bytes、路径/查询及正常Unicode URL。纯resolver159项、生产入口43项、限定lint/compile/空白通过；实际入口对非法证明在policy/catalog/环境snapshot/Control解密/adapter/来源前零调用，Schema稳定dist亦拒绝。DSA源码输入因此较失败全包快照变化；不能把该修复或定向通过倒填为全包通过，无第三次全包/目标/真实请求。

集中Review只读分类叶 `CONT-DSA-inventory-regression` worker_done：[证据](evidence/2026-09-28-cont-dsa-inventory-regression.md)。V3事件目录多Tushare精确CASH、Provider注册多空宽能力RQData、V2 HiThink provider资产并集分属两个独立source；三项失败均为旧测试固定假设，不是目前已证明的生产回归。旧V2错配拒绝、正确配对未准入仍需保持；原全包失败数不变。

`CONT-DSA-inventory-assertions` worker_done：[证据](evidence/2026-09-28-cont-dsa-inventory-assertions.md)。仅三个旧测试合同修正，原三项定向3失败→3通过，Tushare/RQData/HiThink/V2关联60通过、限定lint/编译/空白通过；生产manifest/适配器未改，旧V2错配拒绝及正确配对未准入保留。其余13项失败以及完整门禁结论不变。

全包其余实际断言只读分诊叶 `CONT-DSA-residual-gate-triage` worker_done：[证据](evidence/2026-09-28-cont-dsa-residual-gate-triage.md)。仅requirements中文注释是本批格式回归；两个无key测试与源码空串合同失配、`.env.example`两项服务器配置缺隐藏登记、LiteLLM直调prompt_cache_key透传、Yfinance两个固定日期fixture过期均为已有状态。后四类不能一律归因本批、也不能改断言就宣称安全或真实Provider通过。全包16失败原统计保持。

`CONT-DSA-requirements-ascii` worker_done：[证据](evidence/2026-09-28-cont-dsa-requirements-ascii.md)。仅两处注释改为ASCII，原byte402失败→定向1通过；44条依赖声明、版本和顺序逐条不变，全文件ASCII及限定空白通过。未安装依赖、改锁/镜像/目标，也未第三次全包。

`CONT-DSA-yfinance-clock-fixture` worker_done：[证据](evidence/2026-09-28-cont-dsa-yfinance-clock-fixture.md)。原两个断言在真实时钟均3≠4；仅测试固定观察时刻并增加刚越365天边界反例，原4次/1.05金额/收益率断言保留，本文件13通过、限定lint/compile/空白通过，生产365天逻辑未改。

集中Review新增 `CONT-M26-url-host-proof` worker_done：[证据](evidence/2026-09-28-cont-m26-url-host-proof.md)。`urlsplit`原接受畸形百分号、非法解码及代理项主机名；共享wire拒绝的14个纯解析/生产入口反例先失败，修复后相关两文件217项通过，合法百分编码/Unicode路径/前一反斜杠回归保持；非法证据在policy/catalog/环境/Control解密/adapter/来源前零调用。限定lint/compile/空白通过，原文字节与Schema dist未改；全包、真实来源与目标仍不通过/未执行。

`CONT-DSA-settings-visibility` worker_done：[证据](evidence/2026-09-28-cont-dsa-settings-visibility.md)。原配置覆盖断言1失败→配置文件59通过；两服务内部键纳入有意隐藏集合并显式断言不在注册字段/Schema投影。该集合仅用于测试，未改变生产UI或鉴权/fixture运行行为；编译/空白通过，整文件常规flake8仍有存量E302，排除存量E302/E501的限定检查通过，不称fullstyle通过。无真实凭据、目标或第三次全包。

本次[集中 Review](evidence/2026-09-28-cont-final-review.md)已覆盖当时实际改动、跨仓合同、局部回归与全部 AC01–AC20 剩余条件。Review 发现的两类 Tushare URL 原文先验差异已由定向修复关闭；`CONT-DSA-stable-gates` 状态仍为 blocked/skipped：完整门禁历史两轮失败且未第三次重跑。Server/Schemas 已通过输入逐文件复核可复用。目标同步跳过；如未来满足门禁并获准目标更新，本批同时有 Server+DSA 源码且 `requirements.txt` 已改，须先按 infra 官方 `update.sh all` 预检，不把 `sync-code.sh` 或旧容器当本批验收。该 Review 是当时检查点，后续独立叶见下文；§13 仍不勾选。

续接后的独立就绪叶 `CONT-DSA-empty-key-regression`：DSA `AlphaVantageFetcher`、`FinnhubFetcher` 早已将缺失 API key 规范化为`''`并在调用 HTTP 前拒绝，旧两个测试仍断言`None`。只修改DSA `tests/test_alphavantage_fetcher.py` 与`tests/test_finnhub_fetcher.py`的无key断言及同用例零来源调用验证，生产抓取器/凭据/配置只读；专属证据 `evidence/2026-09-28-cont-dsa-empty-key-regression.md`。先复现两断言，再修复测试并核对缺key仍拒绝实际来源；定向→两文件回归→限定lint/编译/空白，失败一次修复重试。无真实账号/网络、无第三次DSA全包或目标同步；本叶只能关闭两个定向失败，不能改变原完整门禁统计。

`CONT-DSA-empty-key-regression` worker_done：[证据](evidence/2026-09-28-cont-dsa-empty-key-regression.md)。原两个精确用例复现 2 failed，修后 2 passed、两文件 31 passed；缺 key 抛 `DataFetchError` 且 HTTP mock 零调用。限定 flake8、编译、空白通过；仅两测试文件改变，两个生产抓取器 SHA 未变。原完整离线全包仍为 7208 passed/16 failed 的历史结果，未第三次重跑。

`CONT-DSA-prompt-cache-boundary` 只读发现Ready：旧完整离线门禁的LiteLLM直调测试证明当前依赖会透传`prompt_cache_key`，但尚未证明DSA应用派发在未验证能力时发出该键。唯一写集专属 `evidence/2026-09-28-cont-dsa-prompt-cache-boundary.md`，DSA生产源码/tests/配置只读；追`apply_prompt_cache_hints`、`src/analyzer.py`所有派发与参数恢复、`extra_litellm_params`和Router/Hermes路径，查明是否存在可到达的未验证提示及测试层级错配。只用本地源码/已安装依赖与现有合成证据，不访问真实AI/账号/目标；输出可修复的精确owner、前置与定向闭环，或者在不能证明时记录待证而不删断言。

`CONT-DSA-prompt-cache-boundary` worker_done：[只读证据](evidence/2026-09-28-cont-dsa-prompt-cache-boundary.md)。LiteLLM 1.100.0 的直调透传是第三方行为；但 DSA `LITELLM_CONFIG` 的 `model_list[].litellm_params.prompt_cache_key` 经 Analyzer、Agent、screening Router 可达最终请求，且 helper 在 hints 关闭或 `doc_only` 时保留预置请求键。已用不触网合成探针确认 helper 行为；完整应用到 localhost wire 的捕获仍待修复叶验证。未读取账号或请求真实来源。

`CONT-DSA-prompt-cache-core` Ready：仅修改 DSA `src/llm/provider_cache.py`、新增有明确请求边界职责的净化 helper 模块、`src/analyzer.py` 与本叶独立测试文件，改写 `tests/test_provider_cache.py` 中错误依赖第三方自动过滤的断言为应用边界断言，另写主仓专属证据 `evidence/2026-09-28-cont-dsa-prompt-cache-core.md`。合同：预置请求 key 在 hint 关闭或能力未验证时移除；Analyzer 的 Router deployment 入站先复制并移除预置 key，不变异原配置及其他参数；只有已验证且主动启用的 HMAC 派生 key 可到达请求。先用本地合成配置/localhost 捕获复现，再修复并跑定向测试、限定质量检查。不得以删除原失败断言代替应用 wire 验证，不触真实 Provider/账号/目标；本叶不改 Agent/screening 文件。

`CONT-DSA-prompt-cache-core` worker_done：[证据](evidence/2026-09-28-cont-dsa-prompt-cache-core.md)。Analyzer Router 的 localhost wire 修前收到合成配置 key，修后关闭 hints、`doc_only` 和 streaming 均无键；模拟 verified 且开启时只发派生 HMAC，第三方 LiteLLM 直调透传保留为对照。定向 136 passed，限定 lint/编译/空白通过；`analyzer.py` 4804→4803 行、`provider_cache.py` 842→842 行。真实 Provider 接受、命中与计费未验证。

`CONT-DSA-prompt-cache-consumers` Ready，依赖上一叶统一净化 helper 的导出合同：仅修改 DSA `src/agent/llm_adapter.py`、`src/services/screening/ranker.py` 与各自独立测试文件，另写主仓专属证据 `evidence/2026-09-28-cont-dsa-prompt-cache-consumers.md`。所有 Router 初始化点使用复制净化后的 deployment 列表，保持原配置和非缓存参数；以合成配置、Mock/localhost capture 验证两个消费面未验证 key 不到请求。限定定向测试、lint/编译/空白；不改 helper/Analyzer/其他 WIP，不触真实 Provider/账号/目标。任一叶遇到卡点只重试一次，仍不行则如实记录并跳过；不得把局部通过折算为 DSA 第三次全包通过。

`CONT-DSA-prompt-cache-consumers` worker_done：[证据](evidence/2026-09-28-cont-dsa-prompt-cache-consumers.md)。Agent 两处和 screening 一处 Router 构造均接统一净化 helper；合成 Router 合并捕获中预置 key 不到请求，非缓存参数及原配置保留。专属与相邻检查 50 passed，限定 lint/编译/空白通过；真实 LiteLLM HTTP wire 只由上一核心叶覆盖，两个消费面本叶为模拟捕获，不能扩大宣称。

续接合并审阅：DSA 同一输入的九个相关测试文件 **202 passed、2 条第三方弃用 warning**，覆盖上述三个新叶与相邻 Analyzer/Router 回归。此为定向合并测试，原官方离线全包的 7208 passed/16 failed 历史结果不变，未第三次同前提运行；native/Node 隔离、真实来源、AI、目标、UI 及完整 Spec AC01–AC20 仍按原未完成状态，§13 不勾选。

`CONT-D01-window-verification` Ready，依赖现有 D01 多窗口生产入口与 Spec §8.3；仅修改 DSA `tests/test_thesis_ledger_multi_window_response.py` 的参数化拒绝矩阵，主仓新增专属证据 `evidence/2026-09-28-cont-d01-window-verification.md` 并在精确核对后更新 §4 对应局部状态。补充不同量单位/口径及已观测交易日无交集反例；已有 API 测试覆盖预算、跨五年窗口、来源失败、漏 Bar、未完成分页、晚到与价格冲突，Schema/Server 测试覆盖 wire、冻结及离线重放。先运行新反例，再跑 DSA 多窗口定向、Schema/Server 对应测试和限定质量门禁；若发现实际合同缺口，限一次修复重试，不放宽单窗口/多窗口准入，也不触真实 HiThink、目标或 DSA 第三次全包。

`CONT-D01-window-verification` done：[证据](evidence/2026-09-28-cont-d01-window-verification.md)。三条新增拒绝反例 3 passed；DSA 多窗口 20、Market V3 准入 14、Schemas 14、Server 9 项定向通过，测试文件 flake8/编译/空白通过。§4 中 D01 的 wire、执行与本地验证子项按当前源码和证据对账；数据库原样回读未由本地 Parquet 重放证明，`D01-consumption`、真实目标、G0-H、`D01-runtime` 与父 D01 继续开放。

`CONT-R02.12-efinance-index-unique-row` Ready：R02.12 仅在已有 `get_main_indices` 读取接缝补指数代码目标行唯一性。写集限 DSA `data_provider/efinance_fetcher.py` 的该 getter、`tests/test_efinance_main_indices.py`，以及本叶主仓证据 `evidence/2026-09-28-cont-r02-12-efinance-index-identity.md`；能力目录及本 Task 仅作状态对账。先用合成 DataFrame 证明重复目标会被静默取首行，再修复并验证唯一目标、重复目标拒绝、错误/缺失代码与其他唯一指数保留。无真实来源调用，不改变 endpoint、字段单位、来源时点或 Consumer；P02、G0-M 和 R02.12 父项继续开放。卡点按用户要求仅重试一次，仍失败则记录跳过。

`CONT-R02.12-efinance-index-unique-row` done：[本地证据](evidence/2026-09-28-cont-r02-12-efinance-index-identity.md)。重复目标修前 1 failed，修后本文件 5 passed、相邻指数/报价合并 32 passed；测试 flake8、编译和改动空白通过。生产大文件全文件 flake8 的存量告警仍存在，未作无关清理。R02.12 只收敛代码行唯一性，实际 endpoint/同源、时点/单位/覆盖、P02/G0-M、Consumer 和真实目标均开放。

`CONT-R02.12-efinance-full-identity` Ready：本地 `efinance 0.5.9` 的 `get_realtime_quotes('沪深系列指数')` 将 `fs=m:1 s:2,m:0 t:5` 传给 EastMoney `clist/get`，并用市场编号与六位代码生成 `行情ID`；当前 DSA getter 仅按六位代码选行，单条错市场记录可被错配。先在现有 `tests/test_efinance_main_indices.py` 补红例，再限改 DSA `data_provider/efinance_fetcher.py` 的该 getter，要求六位代码及完整 `行情ID` 同时匹配且唯一；Spec §3.3、能力目录、主仓证据 `evidence/2026-09-28-cont-r02-12-efinance-upstream-identity.md` 与交接记录只作合同/状态对账。保留现有价格字段映射与 Consumer，缺身份失败关闭；本地包源码不证明目标版本，HTTP 端点和单位/时点均不授真实准入。不请求真实来源或目标，不重跑已耗尽的 DSA 全包。

`CONT-R02.12-efinance-full-identity` done：[来源与身份分层证据](evidence/2026-09-28-cont-r02-12-efinance-upstream-identity.md)。本地及当前 DSA 容器均装 `efinance 0.5.9`，三份相关包源码哈希一致；静态链确认该指数入口指向 EastMoney `http://push2.eastmoney.com/api/qt/clist/get`，并生成市场加代码的 `行情ID`，不是独立备用。错市场/缺完整身份的反例先失败，修后 getter 7 passed、相邻合并 34 passed；限定 lint/编译/空白通过。容器应用源码未同步，依赖只限定 `>=0.5.5`，未来构建版本、实际 HTTP 传输、真实来源时点/单位/权限/G0-M 未核，R02.12 父项保持开放。

`CONT-R02.7-efinance-stock-fallback-unique-row` Ready：股票 `get_realtime_quote` 在单标 `SHSZQuoteSnapshot` 失败后仍按原合同回退全市场 `get_realtime_quotes()`，目前对目标重复行取首条。写集限 DSA `data_provider/efinance_fetcher.py` 的此回退判断、`tests/test_efinance_realtime_quote.py`、Spec §3.3、能力目录及主仓证据 `evidence/2026-09-28-cont-r02-7-efinance-fallback-identity.md`。先用合成缓存反例证明重复目标取首条，再改成恰好一条；ETF 不触全市场、其他报价映射与回退范围不变。同步以当前本地及目标安装包静态源码记录单标 HTTPS `SHSZQuoteSnapshot` 与全市场 EastMoney HTTP `clist/get`，但不作真实调用、单位/时点/传输安全或 G0-M 准入推断；卡点仅重试一次。

`CONT-R02.7-efinance-stock-fallback-unique-row` done：[本地证据](evidence/2026-09-28-cont-r02-7-efinance-fallback-identity.md)。重复目标修前 1 failed，修后四文件合并 35 passed；编译/改动空白通过，测试文件整文件 flake8 的既有 `E731` 和生产大文件存量告警保留。当前安装包源码证明单标 HTTPS 与全市场 HTTP 均属 EastMoney，行业板块也走全市场函数；实际回退请求、单位/时点/权限/G0-M 未通过，R02.7 父项继续开放。

`CONT-R03-nav-ssot-reconcile` done：按现有 `EfinanceFetcher.get_fund_nav_history` → `eastmoney_fund_nav.read_fund_nav`、ProviderRuntime 对 `FUND_NAV`/`FUND_NAV_HISTORY` 的共同入口，以及[既有目标来源证据](../../../daily-stock-analysis/docs/thesis-ledger-nav-source-evidence.md)，修正 DSA 能力目录 §3/§5 和旧证据开头的历史语义；生产归一化 docstring 去掉旧 SDK 归属。DSA 净值分页与 Efinance 相关两文件 25 passed，未发真实请求或更新目标。R03.1–R03.4 的披露时间、源端修订、成立以来覆盖和 G0-M 仍开放；此前目标样本不等于本次目标验收。

`CONT-R02-efinance-source-alias-migration` needs_contract：[R02.7 证据](evidence/2026-09-28-cont-r02-7-efinance-fallback-identity.md)发现 Control manifest 同时允许 `efinance`/`eastmoney` source，报价执行实际同一 EastMoney adapter，`ProviderExecution` 却原样记录选中 alias。[只读库存](evidence/2026-09-28-cont-source-alias-inventory.md)已确认目标当前/历史 V2 Policy 与旧健康/预算键仍有 alias、V3 证据为空；ETF 预算与健康/熔断安全前置均已独立完成。仍须在 Spec 固定逐能力真实上游、其他能力/Provider 准入与健康兼容、旧冻结/工件保真，再按“路由状态、执行面、消费/重放、目标验收”拆叶；不得仅删 manifest alias、静默重写既有路由或把两标签计为独立备用。完整迁移合同和目标验收未完成，G-M2-Fallback/G0-M 对此组合继续开放。

`CONT-R02-efinance-default-source` Ready：按 Spec §4.1 修**新建默认 V2 Desired Policy** 的 Efinance `REALTIME_QUOTE/STOCK+ETF` 与 `FUND_NAV/FUND_NAV_HISTORY/MUTUAL_FUND` RouteTarget 为 `eastmoney`，并在 DSA manifest 中只给该精确 source 登记已能分发的四组能力。写集为主仓 `apps/server/src/market/market-policy-storage.ts`、`apps/server/test/market-control.service.test.ts`；DSA `src/services/thesis_ledger_control.py` 的 Efinance manifest 构造接点、独立 Efinance manifest 模块、`tests/test_thesis_ledger_provider_route_v2.py`；主仓专属证据 `evidence/2026-09-28-cont-r02-efinance-default-source.md`。现有 DSA Runtime、既有持久化策略和版本化冻结只读。先红后绿验证新默认、精确 source Control 准入、显式旧路由字节不变；Server/DSA 各跑定向测试、类型/编译及限定质量检查。此阶段不完成旧 alias 迁移，也不触目标或真实来源；失败一次修复重试后仍失败则记录跳过。

`CONT-R02-efinance-default-source` done：[跨仓证据](evidence/2026-09-28-cont-r02-efinance-default-source.md)。Server 旧默认断言 1 failed 后 20 passed；DSA EastMoney source 缺报价能力断言 1 failed 后 Control/V2/V3 合并 36 passed。Efinance manifest version 提至 2，原 `efinance` alias 保留；Server typecheck/build、限定 lint/格式、DSA 新模块 flake8/编译与 import 边界通过。只影响新建默认路由，旧策略/冻结与目标应用未迁移，G0-M 和 alias 后继仍开放。

`CONT-R03-akshare-nav-default-source` Ready：按 Spec §4.1 将**新建默认 V2 Desired Policy** 的 AKShare `FUND_NAV/FUND_NAV_HISTORY/MUTUAL_FUND` 两条 RouteTarget 改为 `eastmoney`，DSA AKShare manifest 的该精确 source 同步登记对应净值能力并提升 manifest version。写集为主仓 `apps/server/src/market/market-policy-storage.ts`、`apps/server/test/market-control.service.test.ts`、专属证据 `evidence/2026-09-28-cont-r03-akshare-nav-default-source.md`；DSA `src/services/thesis_ledger_control.py` 的 AKShare manifest 接点、独立 AKShare manifest 模块、`tests/test_thesis_ledger_provider_route_v2.py` 及能力目录。旧显式/持久化 alias、报价回退、冻结与目标只读；先红后绿验证 Server 默认、DSA 精确 source 和旧路由保真，再跑定向测试/类型/编译/限定质量。真实来源预算与失败的 DSA 全包不重置。

`CONT-R03-akshare-nav-default-source` done：[跨仓证据](evidence/2026-09-28-cont-r03-akshare-nav-default-source.md)。Server 旧默认 1 failed 后 20 passed，DSA 精确 source 1 failed 后 Control/V2/V3/净值分页 49 passed；AKShare manifest version 提至 2，旧 alias 与其他能力原样保留。Server typecheck/build、限定 lint/格式及边界，DSA 新模块 flake8/编译/空白通过。新默认两条净值 RouteTarget 均标记 EastMoney，不计独立备用；历史策略/冻结与目标未迁移，R03/G0-M 继续开放。

`CONT-R02-akshare-stock-quote-default-source` done：[跨仓定向证据](evidence/2026-09-28-cont-r02-akshare-stock-quote-default-source.md)。AKShare 股票报价默认调用东财 `stock_zh_a_spot_em`，新建 V2 Desired Policy 的 `REALTIME_QUOTE/STOCK` 已改为 `akshare/eastmoney`；DSA manifest version 3 对精确 source 补 `STOCK` 报价能力，Runtime 将该键转换为 adapter 的 `em` 参数，执行 provenance 仍为选中 RouteTarget。Server 默认先红后 20 项通过；DSA 能力先红，修正测试接线后 V2 路由、Runtime、Control、V3 合并 66 项通过。显式旧 alias 的 Desired/Effective 原文、ETF、冻结及健康/预算键不改；两家默认股票报价同源，不算独立备用。Server 类型/build/限定质量、DSA 限定质量与编译通过；真实来源/目标及失败的 DSA 全包继续开放。

`CONT-R03-akshare-source-alias-migration` needs_contract：旧 `akshare/akshare` 股票报价及场外基金净值路由仍可显式或历史持久化，执行标签不能直接当作独立实际上游。[目标只读库存](evidence/2026-09-28-cont-source-alias-inventory.md)已确认旧 V2 Desired/Effective、历史修订及健康行；股票东财双 alias 的健康/熔断安全前置另已完成，但 V1 新浪及持仓/筹码是不同来源/能力，不可整 Provider 改名。与 Efinance alias 共用版本化迁移合同，继续确定逐能力实际上游、其他能力准入/健康兼容、旧冻结与审计保真，再分路由状态、执行面、消费/重放和目标验收；跳过破坏性改名，G0-M 与独立备用门禁继续开放。

`CONT-I01-jsonb-orm-roundtrip` done：[ORM 根因与恢复证据](evidence/2026-09-28-cont-i01-jsonb-orm-fix.md)。新隔离调查固定 15 条合成 Bar、严格 V3 响应与项目全部 migration，实际仓库 `record -> findUnique` 修前发现 22 个数值位模式各相差 1 ULP，完整摘要失配；此前仅经 `$queryRaw` SELECT 的零差异诊断不覆盖 ORM 写入。修复为参数化 JSON 文本的原子 INSERT/条件 UPDATE，不舍入或放宽摘要；修后隔离数据库中新行、同身份重记和空载荷填充全部零差异，旧损坏完整载荷仍拒绝。原 Worker 组合在源码变化后的新前提下受控运行 1 项通过，资源精确清理。Server 相邻 83 项、包级退出 0、类型/build/限定质量/边界与带 HEAD 基线尺寸门禁通过；真实 Provider、目标运行态、DSA 官方失败全包和 I01 父依赖仍开放。

`CONT-D01-multiwindow-pg-consumption` Ready：I01 原响应 JSONB 写读已修复，D01 仍缺真实数据库到 Snapshot artifact 的多窗口证据闭环。用显式命名、loopback/非默认端口的独立 PostgreSQL 应用全部 migration；固定 159516.SZ 合成父响应和两个有真实交易日交集的子观测，经实际 `MarketWindowEvidenceV3Repository.record/findFrozen` 后交给现有 `DsaSnapshotBuilder`，验证 artifact 原样、离线重放、父/子篡改拒绝及旧单窗口回归。只跑一次新隔离用例，失败后一次定向修复重试仍不通过则记录跳过；不发 HiThink、AI 或目标数据库请求，不替代 D01-runtime/G0-H。
`CONT-D01-multiwindow-pg-consumption` done：[隔离数据库消费证据](evidence/2026-09-28-cont-d01-pg-consumption.md)。独立 loopback PostgreSQL 全 migration 后，159516.SZ 合成父响应的 19 条 Bar 与两份有交集子观测经真实证据仓库写读，完整响应进入 Snapshot 的单条证据 artifact，离线重放一致；改写数据库子观测后仓库拒绝，已发布 artifact 仍可重放。隔离测试 1 passed，默认 1 skipped；旧单窗口/冻结 Reader 与相邻 Snapshot 39 项、PIT 44 项通过。容器按精确 ID 清理；D01-runtime、真实 HiThink G0-H 和目标应用版本仍开放。

`CONT-D01-controlled-http-worker` Ready：复用当前隔离 PostgreSQL/Redis、受控 DSA HTTP 与独立生产 Worker 进程，用同一多窗口合成响应覆盖 capabilities 协商、V3 Reader、证据仓库、普通创建冻结、BullMQ 领取、成功终态和离线重放；保留既有单窗口成功及损坏快照失败反例。写集仅限 Server 测试辅助函数与集成用例、本 Task、专属证据及交接记录。先跑默认跳过和定向测试，再在显式隔离容器中执行一次；失败仅允许一次定向修复重试，仍失败就记录跳过。此叶只证明受控本地纵向链，不替代 D01-runtime 的目标部署、真实 HiThink G0-H 或 DSA 官方全包门禁。
`CONT-D01-controlled-http-worker` done：[受控 HTTP 到 Worker 证据](evidence/2026-09-28-cont-d01-controlled-http-worker.md)。双窗口响应经 DSA 能力协商、Reader、PostgreSQL 仓库、Snapshot、普通 HTTP 创建和 BullMQ 后由独立生产 Worker 提交成功，离线重放 checksum 一致；同用例原单窗口成功、损坏快照失败和账本隔离仍通过。首次仅因新断言把能力读取次数误限为 1 而失败，改为验证多窗口启用后的读取增量，唯一一次修复重试 1 passed；类型、限定 lint/格式通过，专名临时容器已清理。只关闭本受控本地叶，D01-runtime 的目标阶段及真实 G0-H 继续开放。

`CONT-S03-parent-reconciliation` done：[版本隔离缓存父项证据](evidence/2026-09-28-cont-s03-parent-reconciliation.md)。I01 完整响应失配在新前提下修复、D01 父/子响应数据库消费通过；当前 Server 事实缓存/Reader/证据仓库定向 36 passed、无隔离库时 10 skipped，随后显式隔离 PostgreSQL 10 passed，完整 migration、独立 app role 与容器清理核对通过。S03 父项只按其本地/隔离数据库完成条件勾选，S04/S05、真实来源、目标同步和整体验收不倒填。

`CONT-S04-parent-reconciliation` done：[整窗口 Reader 父项证据](evidence/2026-09-28-cont-s04-parent-reconciliation.md)。S03/C04 前置收口后，当前 Selector、Reader、模块委派及相邻旧边界 28 项通过；整窗主源、受有效同口径证明保护的备用、缺页/上市前/预热、错窗口/目标/修订及无第三源请求均有定向覆盖，实际 Reader 的主源路径另经 I01/D01 受控 HTTP 与隔离数据库组合。只关闭 S04 本地实现；真实 HiThink 与备用来源资格、S05 严格 PIT、目标运行态和整体验收保留。

`CONT-efinance-etf-alias-budget` Ready：依据 Spec §4.1 已证明的同一单标 adapter 调用，仅收紧 DSA `efinance × REALTIME_QUOTE × ETF` 的持久请求冷却。新增归属 Provider 预算的纯 key helper 和专属测试，限定修改 `src/services/thesis_ledger_control.py` 的原子预留查询；旧 `efinance`、新 `eastmoney` 及无 source 的 V1 key 任一未到期都拒绝，新预留写规范 `eastmoney` key，其他 Provider/能力/source 不合并。先写旧路由切换可重复调用的受控红例，再验证修后旧→新、新→旧、V1→V2、到期和无关来源、重开 store 及实际 Runtime adapter 调用次数；运行定向测试、改动文件编译/lint/尺寸/空白。历史 Policy、准入、健康、冻结和执行 provenance 均只读；不发真实来源或目标请求，不重跑失败的 DSA 全包。失败修复一次仍不通过则记录跳过；父 alias 迁移继续 `needs_contract`。
`CONT-efinance-etf-alias-budget` done：[预算安全证据](evidence/2026-09-28-cont-efinance-etf-alias-budget.md)。旧/新 source 的 ETF 单标冷却切换修前 4 failed、1 passed，修后新叶 6 项及相邻 V2/Runtime/Control/准入合并 81 passed；旧格式行到期保真测试的夹具首次错误后定向修正重试一次通过。规范键写入、旧 alias/V1 键兼容读取均在原事务；新文件 lint、编译、空白与官方 syntax 通过，官方 flake8 首次 PATH 缺失、补齐后唯一重试 critical 0。DSA 能力目录与变更记录同步；只关闭该预算叶，旧 Policy、准入、健康/熔断、冻结身份与完整 alias 迁移仍开放。

`CONT-source-alias-readonly-inventory` done：[目标持久状态库存](evidence/2026-09-28-cont-source-alias-inventory.md)。DSA SQLite `mode=ro`/`query_only`、Server 容器内 Prisma 分组及快照 manifest 结构扫描仅输出去标识计数：两侧 V2 当前/历史 Policy 均含旧 alias，DSA 旧健康/已到期预算行存在；V3 策略/准入、Server V3 完整窗口证据与事实缓存当前为空，109 份已发布旧 manifest 未见精确 RouteTarget 对象，但 Parquet/旧格式间接引用仍未排除。未改目标数据或读取原文；两组完整 alias 迁移仍 `needs_contract`，本库存不授权重写、准入或部署。

`CONT-efinance-etf-alias-health` Ready：只对 `efinance × REALTIME_QUOTE × ETF` 已证明同一单标 adapter 的旧 `efinance`、新 `eastmoney` 和 V1 无 source 健康作用域做兼容。DSA Provider 路由所有的纯身份 helper、Control 健康读取/写入和 Runtime 断路器接线为独占源码写集；专属测试先证明当前旧 open→新 alias、新 open→旧 alias、进程内连续失败与重开 store 可绕过，修后在原 60 秒内均拒绝，过期 open 保留一次半开探测，旧行不改写，其他来源独立。V2 Effective 状态须与 Runtime 一致；RouteTarget、执行 provenance、准入、Policy 与冻结只读。定向测试→相邻 Control/Runtime→编译/限定 lint/尺寸/空白，失败仅一次修复重试后记录跳过；不重跑耗尽的 DSA 全包或触真实来源/目标。父 alias 迁移仍 `needs_contract`。
`CONT-efinance-etf-alias-health` done：[健康熔断兼容证据](evidence/2026-09-28-cont-efinance-etf-alias-health.md)。修前 4 failed、2 passed；修后旧→新、新→旧、V1→V2、过期半开、旧 open 与新 closed 并存、进程内三次失败共享及无关来源隔离均通过。专属 7 项及相邻预算/Control/Runtime/V2 合并 97 passed；官方 syntax 与 critical flake8、改动文件编译、新文件完整 lint、空白通过。新健康只写规范键，旧行保留；路由、provenance、准入、Policy、冻结均未迁移。目标和真实来源未验，DSA 失败全包未第三次运行；父 alias 迁移继续 `needs_contract`。

`CONT-akshare-stock-alias-health` Ready：只对 `akshare × REALTIME_QUOTE × STOCK` 旧 `akshare` 与新 `eastmoney` 两条已证明同 `em` adapter 调用的 V2 source 共用健康/熔断作用域；V1 无 source 实走 `sina`，必须隔离。复用 DSA 精确 source 身份和健康读取模块，新增专属旧格式 SQLite/Runtime 回归；证明最近旧 open 双向阻断、规范新写入、过期半开、旧行保留、连续失败共享及 V1/其他能力独立。RouteTarget、provenance、预算、准入、Policy、冻结均不改。先红后绿，再定向与相邻 Control/Runtime、限定 lint/编译/尺寸/空白；失败定向修复一次仍不通过则记录跳过，不触真实来源、目标或失败全包。父 AKShare alias 迁移保持 `needs_contract`。
`CONT-akshare-stock-alias-health` done：[股票报价健康兼容证据](evidence/2026-09-28-cont-akshare-stock-alias-health.md)。修前 5 failed、2 passed，修后专属 7 项及相邻 ETF alias、预算、Control、Runtime、V2 路由合并 119 passed；官方 syntax/critical flake8、新文件完整 lint 通过。只合并 `akshare/eastmoney` 与 `akshare/akshare` 的健康及进程内熔断，V1 无 source 的新浪作用域不合并；旧行和执行来源原文保留。未执行真实来源、目标或已失败的 DSA 全包，完整 alias 父项仍 `needs_contract`。

`CONT-R05.1-financial-fail-closed` Ready：依据已采集的 1.18.94 原表与 Spec §3.3，只阻止 `stock_financial_abstract` 的指标行 × 报告期列被首行财报读取并误报 `growth` 来源，移除 `stock_financial_analysis_indicator` 的无参默认 `600004` 候选。写集限 DSA `data_provider/fundamental_adapter.py` 财务候选接缝、`tests/test_fundamental_adapter.py`、DSA 能力目录 R05.1、专属证据 `evidence/2026-09-28-cont-r05-financial-fail-closed.md` 及交接记录。先用合成形状和候选参数补红例，再跑本文件及相邻研究消费者定向、限定 lint/编译/尺寸/空白；不调用来源，不修改其他候选、财务单位或报告期排序。官方说明与原响应均缺金额倍率/比例单位和响应证券自证，完整数值映射标记 `needs_contract` 并跳过，本叶完成也不授予 R05.1/G0-M/历史 PIT 准入。

`CONT-R05.1-financial-fail-closed` done：[本地证据](evidence/2026-09-28-cont-r05-financial-fail-closed.md)。矩阵误报与默认标的候选两例修前 2 failed，修后本文件 11、相邻研究消费者合并 47 passed；编译、critical lint、测试文件完整 lint、空白均通过，生产文件 715→715 行。只有财务矩阵失败关闭及请求身份收紧，无真实来源或目标调用。R05.1 完整数值/历史合同因原响应与官方说明缺身份和单位继续 `needs_contract`，既定 1/1、0 重试预算不重置；父项和 G0-M 保持开放。

`CONT-DSA-current-baseline-gate` Ready：旧 [官方门禁](evidence/2026-09-28-cont-dsa-stable-gates.md) 属于先前隔离副本与源码输入，失败后已有多处源码/测试变更。本轮先定向核实旧 16 个失败点；若当前基线均通过，建立不含真实 `.env`、数据库、日志及账号文件的新临时副本，固定临时 HOME/XDG、合成配置和 Python 外连/敏感文件 guard，并仅对已审阅的假工具 shell 测试放行原生命令。先复核完整输入摘要、guard 自检、旧失败点在新隔离下的定向测试，再按项目顺序执行官方 `syntax`、critical `flake8`、`offline-tests`；若任一前置失败，只做一次定向修复/重试，仍失败记录并跳过目标更新。新基线运行不是旧输入的第三次重试，旧失败和隔离缺口不得抹除。唯一写集为本 Task、专属证据 `evidence/2026-09-28-cont-dsa-current-baseline-gate.md` 和 `/private/tmp/cont-dsa-current-*`；三仓生产源码与目标容器只读。完整离线门禁即使通过也不替代真实来源、目标 Docker、AI/UI 验收。

`CONT-DSA-current-baseline-gate` skipped_after_retry：[新基线证据](evidence/2026-09-28-cont-dsa-current-baseline-gate.md)。旧 16 个失败 nodeid 在普通当前工作树定向均通过；新无凭据副本中合并 15 passed / 1 failed，唯一失败先为临时 HOME 下 Volta 无 Node，一次环境修复重试后转为副本缺相邻 Schemas dist 路径，按用户规则跳过。副本受控输入差异 0，guard 自检通过；当前副本官方 syntax/critical flake8 退出 0。官方 `offline-tests` 本叶未运行，低层顺序偏差和非 OS-wide 隔离均已记载，目标更新继续跳过；旧全包 16 failed 记录不抹除。

`CONT-R05.2-valuation-raw-contract` Ready：R05.2 不把当前 `get_realtime_quote` 的抓取时刻冒充来源日期；单接口候选锁定安装版 AKShare 1.18.94 `stock_value_em` 的 EastMoney `RPT_VALUEANALYSIS_DET`，只采集官方示例 `300766` 的一份公开原响应，核对响应证券身份、报告页数/总数、交易日期及字段名，并离线复放 SDK 转换。官方文档给出总/流通市值为元、PE/PB 字段但不证明披露可见时刻。请求预算为同一 endpoint/参数最多 **2 次总尝试、仅失败后 1 次重试**，不得换标的/endpoint/SDK、读取账号或顺手查其他股票；不计 G0-M 准入。仅写专属证据 `evidence/2026-09-28-cont-r05-valuation-raw-contract.md` 与 `/private/tmp/m3-r05-valuation-contract-0928` 的采集脚本/原文/派生摘要，DSA/主仓生产源码只读。只有原响应身份和字段合同足够时再分离出按日期选行/消费者实施叶；分页、历史修订、单位、披露时间缺证据则记录跳过相应准入，不用本机获取时间回填来源可见时间。

`CONT-R05.2-valuation-raw-contract` done：[原样证据](evidence/2026-09-28-cont-r05-valuation-raw-contract.md)。固定样本请求 1/2、0 重试，HTTP 200，原响应 1,824 行/1 页且代码及完整 `300766.SZ` 自证一致，交易日期唯一；安装版离线转换 1,824×13。官方文档总/流通市值单位为元；原响应无披露/修订时间，SDK 表抛弃身份。只证明此样本当前字段合同，不授予其他证券、真实延迟、历史 PIT 或 G0-M。后继按 Spec §3.3 拆原响应核验、当前研究消费及真实准入，不修改源请求预算。

`CONT-R05.2-valuation-reader` Ready：以已核对的 `RPT_VALUEANALYSIS_DET` 原响应建立有界读取器，只接受原文一致的六位代码、完整市场后缀、稳定市场代码、严格倒序且不重复的交易日期，以及全页计数。按原始数值映射最新一行 PE/PB 和元市值，输出原响应交易日期与本次观察时刻；不生成披露时刻、历史修订或 PIT 资格。使用合成多页/错误形状测试和已捕获原文离线复放；不再调用真实来源，不接现有消费入口。若接口字段或分页假设不能自证，一次修复后记录跳过。写集限 DSA 新读取器与专属测试、主仓 Task/证据和交接记录；当前研究消费另叶接线，避免影响报价复用的股息率。

`CONT-R05.2-valuation-reader` done：[读取器证据](evidence/2026-09-28-cont-r05-valuation-reader.md)。DSA 独立读取器对原响应代码/完整市场、分页总量、跨页日期和原字段数值失败关闭；只返回最新交易日，明确 `sourceAvailableAt=null`、历史可见性未证。合成定向 12 passed、原采集 1,824 行离线复放成功、限定完整 flake8 通过。没有新增真实来源请求，也没有接入当前 `get_fundamental_context`；R05.2 消费和 G0-M/PIT 仍开放。

`CONT-R05.2-current-consumer` Ready：CN 股票 `get_fundamental_context` 在保留原报价与股息率价格的条件下，以短预算读取上述原响应估值；成功时估值字段/原文身份/交易日/本次观察分开返回，状态为 `partial`，不填历史来源可见时刻。失败、超时或不支持时保留旧报价估值回退，同时记录实际来源及错误，不让任何异常阻断其他研究块。ETFs 与海外路径保持原状。先合成定向测试来源成功、回退、预算、股息率复用与不新增联网，再跑相邻研究测试、限定 lint/编译/尺寸；不运行真实来源或已失败的官方全包。写集限 DSA 新编排 helper、`data_provider/base.py` 局部替换、专属/相邻测试、主仓 Task/证据及交接；大型 base 文件不得增加行数。

`CONT-R05.2-current-consumer` done：[接线证据](evidence/2026-09-28-cont-r05-valuation-consumer.md)。CN 股票先保留原报价供股息率、剩余预算最多 1.5 秒读取东财估值；成功时估值块为 `partial` 并携原文身份、交易日、观察时刻与空历史可见时刻；失败按原报价回退并记录来源错误。显式前缀市场转换为完整后缀校验，ETFs/海外不变。读取器加流式总截止时间；新读取器/接线/相邻研究消费者 68 passed，新增文件完整 lint、旧大文件关键 lint、编译和空白通过。未发新的真实请求，未运行此前失败的官方全包或目标更新；R05.2 真实运行、披露/修订、严格 PIT 与 G0-M 仍开放。

`CONT-R05.3-yahoo-period-alignment` Ready：依据 Spec §3.3 与当前 `YfinanceFundamentalAdapter`，只修季度利润表/现金流与 `.info` 汇总混成同一财报的问题。以安装版 yfinance 1.7.0 的季度 DataFrame 公共 API 为候选合同，先加合成错期、同日期乱序、仅汇总和仅币种反例；季度值仅取同一报告日期列、缺现金流不回填汇总，只有有效季度报告期时才标季度，纯 `.info` 数值标期间/报告日未知，空数值不发布财报。写集限 DSA `data_provider/yfinance_fundamental_adapter.py`、专属测试、DSA 能力目录、主仓 Spec/Task/证据与交接；不请求真实 Yahoo，不改分红/行情/估值或其他市场。先定向、相邻上下文、编译/限定 lint/尺寸/空白；失败仅一次修复重试后记录跳过。原发布/修订/币种真实准入及 PIT 仍独立开放。

`CONT-R05.3-yahoo-period-alignment` done：[本地证据](evidence/2026-09-28-cont-r05-yahoo-period-alignment.md)。US AAPL 合成反例 4 failed，修后扩为 6 项；Yahoo 适配/既有上下文共 40 passed，完整 flake8、编译、空白通过。季度利润/现金流只按同日列映射，不回填 `.info`；无可用季度数值时 `.info` 汇总标期间/报告日未知，只有币种不生成财报。现有研究上下文保留 `period_basis` 与空 `source_available_at`。未触真实 Yahoo；R05.3/4 底层 endpoint/条款、原发布/修订、币种实际证据、目标 Consumer/G0-R/PIT 均开放。

`CONT-R05.3-yahoo-yoy-period` Ready：只修 `YfinanceFundamentalAdapter._yoy_from_row` 以 `iloc[4]` 假定去年同期的问题。合成 5 列缺去年同日、列乱序而同期在非第 5 列、重复同期及无效列日期反例；仅日期唯一且上一年同月同日确证时计算同比，否则维持现有 `.info` 增长率回退/未知。写集限 DSA Yahoo 适配器与专属测试、主仓 Spec/Task/证据及交接；不发真实请求，不改原财报字段、分红或市场路由。先红后绿、相邻研究测试、lint/编译/空白，失败一次修复重试仍不通过则记录跳过。来源访问、发布修订和 PIT 仍由 R05.3/4/G0-R 验收。

`CONT-R05.3-yahoo-yoy-period` done：[同比证据](evidence/2026-09-28-cont-r05-yahoo-yoy-period.md)。四条合成同比反例修前失败，修后按唯一报告日期寻找去年同月同日；缺期、重复、未知日期沿 `.info` 增长率回退或未知。Yahoo 适配器/上下文组合 44 passed，完整限定 flake8、编译与空白通过。没有来源请求；R05.3/4 的真实字段与公布/修订准入、G0-R/PIT 保持开放。

`CONT-R06.12-flow-latest-day` Ready：依据 Spec §3.3 和安装版 AKShare 日表，只修 `stock_individual_fund_flow` 的日期选行与净额列精确映射。合成乱序、重复/坏日期、缺净额、比例列干扰、最新日金额无效及直接/完整 Consumer 反例；只接受唯一最新日及有限净额，不推算 5/10 日。写集限 DSA 新单源行规范化 helper、`data_provider/fundamental_adapter.py` 狭窄接缝、相关测试、能力目录，以及主仓 Spec/Task/专属证据与交接；原大文件净行数不得增加。无真实请求、不修改行业/其他 getter；先定向再相邻研究回归、限定 lint/编译/尺寸/空白。失败一次修复重试后记录跳过。金额单位、原响应身份、来源可见时刻及 G0-M/PIT 独立开放。

`CONT-R06.12-flow-latest-day` done：[本地证据](evidence/2026-09-28-cont-r06-flow-latest-day.md)。安装版日表按唯一有效交易日选择最新行，精确读取净额而非占比；缺/重复/坏日期、缺净额及最新金额无效拒绝股票块，行业独立。新反例修前 7 处失败，修后定向及相邻 44 passed；旧作用域 fixture 缺日期导致相邻首次 2 个 subtest 失败，补齐后唯一重跑通过；另补 SDK `NaT` 反例。新增文件完整 lint、旧文件关键 lint/编译/空白、adapter 715→711 行通过。无真实来源请求、目标更新或历史 PIT 证明；单位、原响应身份及 G0-M 仍开放，R06.13/14 对此日表为 unavailable。

`CONT-R06.15-main-flow-candidate` done（只读合同核对）：[候选失配证据](evidence/2026-09-28-cont-r06-main-flow-candidate.md)。当前 AKShare 1.18.94 源码与官方文档独立一致：`stock_main_fund_flow` 是市场类别排名快照，今日/5日/10日仅给净占比、排名和涨跌幅，无单股净额或日期；当前 `get_capital_flow()` 未调用。原 R06.15–17 净额候选标 unavailable 并跳过该接口接线，不把百分比冒充金额。备用来源若仍需实现，必须重新选择 endpoint 并固定身份/单位/时点，P02/G0-M 与整体验收保持开放；无真实请求/源码修改。

`CONT-R06.20-dragon-consumer` done（只读消费入口核对）：[现存入口证据](evidence/2026-09-28-cont-r06-dragon-consumer.md)。`get_dragon_tiger_flag` 仅进入无目标日期/`dataAsOf` 的 `DataFetcherManager` 当前基本面上下文，由当前分析、Agent 工具和筛选读取；Server 回测无龙虎榜块消费。首次在 DSA/Server 搜索消费者，复核调用签名与三个实际入口结论不变，按用户“一次重试后跳过”将历史 Consumer 选择记 blocked，R06.21–23 不接线、不触来源。缺事件/披露日期和历史可见时刻，P02/G0-M 及整体验收保持开放。

`CONT-R06.18-sector-flow-rank` Ready：只修当前 `get_capital_flow()` 的行业 top/bottom 候选链。安装版 AKShare 1.18.94 与官方文档均区分跨行业排名和指定行业内个股汇总；请求显式“今日/行业资金流”，成功表只按唯一精确净额列与有效行业名排序，过滤官方说明的空金额，拒绝比例代净额、重复名称、缺列或无有效行；排名失败不得调用默认“电源设备”的汇总。写集限 DSA 新单源行业排名 helper、`fundamental_adapter.py` 狭窄接缝及相关测试、DSA 能力目录，主仓 Spec/Task/证据和交接；大文件净行数不得增加。先红例，再定向/相邻测试、限定 lint/编译/空白；一次修复重试仍失败记录跳过。不触真实来源、目标容器或 DSA 已失败全包；金额单位、来源时点、R06.19 独立 Consumer 及 G0-M 继续开放。

`CONT-R06.18-sector-flow-rank` done：[本地证据](evidence/2026-09-28-cont-r06-sector-flow-rank.md)。安装版与官方接口区分后，旧“行业排名失败→默认电源设备个股汇总”回退删除；行业排名显式今日/行业参数、精确净额列、无效形状拒绝。新反例修前 7 处失败，修后相邻 48 passed；旧作用域断言无参导致首次 6 个子测试失败，改为显式参数后唯一重跑通过。新文件完整 lint 一次格式修复后通过，旧适配器关键 lint、编译、空白通过，适配器 711→704 行。无来源请求/目标部署；R06.18 金额单位、来源时点/真实覆盖与 G0-M 保持开放，R06.19 另选 Consumer。

`CONT-R06.19-sector-member-consumer` blocked：[只读 Consumer 核对](evidence/2026-09-28-cont-r06-sector-member-consumer.md)。初次调用检索与逐签名复核均确认当前研究块/Agent 工具只接股票代码和跨行业榜单，主仓无指定行业成员资金流 Consumer；没有行业标识、分类版本、成员生效日期或历史口径。按本轮一次复核后停止，R06.19 接线跳过，不沿用 SDK 默认“电源设备”，不计第二来源。待有明确 Consumer 和成员合同再立独立叶；P02/G0-M 仍开放。

`CONT-M22-159516-split-discovery` done（独立公告只读核对）：[目标拆分证据](evidence/2026-09-28-cont-m22-159516-splits.md)。管理人 03-24/07-06 实施公告与 03-30/07-10 结果公告核实两次 1:2 拆分的登记、除权日期；03 月事件可能覆盖预热。四份公开 PDF 已在专名临时目录保存原字节与摘要；不把公告或抓取日当历史可见时刻，不推定 HiThink 价格坐标。目标 G-Run 的事件覆盖及不重复调整为必要验证，M22-c/G0-M/G0-H 仍开放。

`CONT-M22-159516-source-crosscheck` Ready：仅对公开 EastMoney `fund_cf_em` 既有有界读取器读取 `159516.SZ` 的 2026-01-01..08-09 拆分观测，`max_pages=4`，同一 endpoint/参数最多初次与失败后一次重试，不换目标/年份/Provider，不触账号和 HiThink。只保留目标行源日期、类型、十进制比例、页数/行数/摘要与安全错误，不输出整表或原响应。与上述独立公告逐事件核对；缺行、分页超预算、类型/比例或日期不一致则记录并跳过，不补造 canonical 事实。成功也只证明本次返回观测，不授予完整历史覆盖/修订、公告精确可见时刻、价格坐标或事件准入。写集限专属证据、Task/交接与只读临时输出；生产源码不动。一次定向执行失败后仅一次同参重试，仍失败停止。
`CONT-M22-159516-source-crosscheck` done：[公开源行证据](evidence/2026-09-28-cont-m22-159516-splits.md)。一次成功读取 2026 年第 1 页 83 行，目标仅保留 03-27、07-09 两条“份额分拆/每份 2”观测，与公告登记日和比例相符；失败重试 0 次。源行 `effectiveDate=null`、`effectivePhase=unknown`，本次分页完成不等于历史修订完备，Reader 继续 `coverage.complete=false`；未签发 canonical 事件或 G0-M/G-Run 准入。

`CONT-M22-159516-mapping-fixture` Ready：只在 DSA `tests/test_thesis_ledger_split_mapping_v3.py` 增加 159516 两次拆分的受控静态观测/公告日期映射回归，沿现有映射器和合成准入 fixture 验证标的、源转换日、比例、登记/除权日、公告引用及不产生历史 `availableAt`。公告 SHA 只作合同输入，不声称测试重验原始 PDF。先定向运行新用例，再运行本测试文件与目标 lint/编译；失败一次定向修复重试，仍失败记录跳过。写集限该测试、本 Task、证据及交接；不触真实来源/账号/目标，不能关闭 M22-c、G0-M 或 G-Run。
`CONT-M22-159516-mapping-fixture` done：[公告与映射回归证据](evidence/2026-09-28-cont-m22-159516-splits.md)。两次静态观测在合成准入下分别映射到 03-30、07-10 除权，保留源日期/登记日与公告 SHA，不生成历史可见时刻；新例 1 passed、文件 24 passed。限定 lint 首次仅续行缩进失败，修正后唯一重试通过；语法、空白通过。未重新验 PDF 原件、未签真实事件准入，M22-c/G0-M/G-Run 仍开放。

`CONT-M23-159516-dividend-observation` Ready：仅用现有公开 `fund_fh_em` 有界读取器观察 `159516.SZ` 的 `2026-01-01..2026-08-09`，`max_pages=4`；同 endpoint/参数最多初次及失败后一次重试，不换 Provider、标的或年份，不触账号/HiThink。仅记录目标观测的除息/登记/发放日期、元/份金额，分页页数/行数/摘要、稳定失败类别；不输出原整表或把读取器本次空集当成完整历史、无分红、PIT 或 G0-M 准入。与管理人独立公告交叉核对若有目标行；无目标行则只记“本次未观测”，不补造事件。写集限专属证据、Task/交接和临时安全输出，生产源码只读。失败一次同参重试仍失败即记录跳过；成功也不签发完整覆盖或 G-Run。
`CONT-M23-159516-dividend-observation` skipped_after_retry：[页预算卡点](evidence/2026-09-28-cont-m23-159516-dividend-observation.md)。同参初次与唯一重试均在年度第 1 页元数据检查处被 `基金分红总页预算不足` 拒绝，未发布目标观测或部分覆盖。四页上限不足仅说明传输预算，不证明 159516 有/无现金分红；不扩大预算或换源继续请求。M23-b/G0-M/G-Run 仍开放。

`CONT-M21-159516-three-basis-split-window` Ready：沿 DSA 已有可终止的 AKShare 精确单源调用，仅观察 `fund_etf_hist_em` 的 `159516.SZ`、`2026-07-08..2026-07-13`，逐个请求 `none/qfq/hfq`，各最多初次与失败后一次同参重试，单次硬超时 20 秒。只保留四个交易日的日期/OHLC/成交量/成交额及请求口径、安全失败类别；不读账号、不更换标的/日期/来源、不打印整源响应。依据独立 07-09 登记、07-10 除权公告核对价格坐标是否与一次 1:2 拆分一致；若其他经济事件或基准规则影响比较，仅记观察不推断算法。结果不证明 ETF 量额单位、完整历史覆盖/修订、HiThink 口径或执行准入。写集限专属证据、Task/交接和临时安全输出，生产源码只读；任何口径两次失败即记录跳过该口径，不用其他源补齐。
`CONT-M21-159516-three-basis-split-window` partial/skipped_after_retry：[短窗真实来源证据](evidence/2026-09-28-cont-m21-159516-three-basis-split-window.md)。未复权和后复权各一次成功，四交易日 OHLC 的后/未比例在 07-09 及以前为 2、07-10 起为 4，量额原值一致；与 3 月/7 月两次 1:2 拆分公告相容。前复权初次及同参唯一重试均 `ProxyError`，没有源原生 qfq 行，按用户规则跳过该口径。四日样本不证明量额单位、调整算法/锚点、全历史覆盖/修订、HiThink 坐标或任何 G0/G-Run 准入，M21/G-M2-Price 保持开放。

`CONT-S05-manifest-legacy-instant-precision` Ready：集中 Review 已指出共享 legacy 必要绑定仍按毫秒比较，当前 `reconstructionArchivesMatch` 与 `reconstructionFactsWithinCutoff` 确有 `Date.parse`。仅修改 Schemas `src/market-pit-reconstruction-manifest-validation-v3.ts` 与 `test/market-pit-reconstruction-v3.test.ts`：先以逐 Bar 引用相差一微秒、来源观察或 Bar 可用时间晚于截点一微秒补红例，再复用既有 `compareMarketPitEvidenceInstantStringsV1` 精确比较；非法/未知时刻失败关闭，等价时区瞬时保留。保持现有 `bar-archive-mismatch`/`future-fact` 分类和 v1/v2 合同，不新增 Schema 字段。执行新例→该文件/相邻精度测试→Schemas typecheck/build→限定 lint/格式/空白；首次失败仅一次定向修复重试，仍失败记录跳过。Server 内容映射及最终真实 PIT 资格为独立叶，本叶不触 Provider、目标或全包。
`CONT-S05-manifest-legacy-instant-precision` done：[精度修复证据](evidence/2026-09-28-cont-s05-manifest-legacy-instant-precision.md)。三个晚一微秒反例修前误报 `bound`、修后拒绝；等价偏移仍通过。复用现有精确瞬时比较器，Schema 字段及失败分类不变。新例4、相邻68、当前Schema全包550、Server内容绑定43项通过；Schema/Server typecheck、Schema build、限定 lint/格式、边界/尺寸/空白通过。格式首次仅新增块换行，唯一修正重试通过。只关闭本地必要绑定叶；Server归档时钟 v1、真实来源/场所及最终 PIT 资格继续开放。

`CONT-S05-archive-clock-v1-precision` 功能完成、格式门禁 `skipped_after_retry`：[本地证据](evidence/2026-09-28-cont-s05-archive-clock-v1-precision.md)。v1 归档观察晚一微秒红例修前误报 `archives-bound`，修后 v1/v2 共用精确比较并返回 `archive-future`；相邻旧毫秒断言已更新，44 项回归、Server typecheck、限定 lint、尺寸及空白通过。v3 测试文件全文件 Prettier 因既有排版初次及一次复试失败，未批量重排；其余两文件格式通过。Schema/内容映射/历史资格编排未改，真实 Provider、目标运行态和最终 PIT 门禁仍开放。

`CONT-S05-XSHE-2026-holiday-notice` done（仅固定休市原文解析）：[原文与验证证据](evidence/2026-09-28-cont-s05-xshe-2026-holiday-notice.md)。当前官方 HTML 原字节 24,892 字节及摘要固定于测试 fixture；七段休市/复市、星期、署名和顺序离线核对，得到 19 个工作日休市日期。新例 13、相邻四文件 88 passed/1 原有 skipped；Server typecheck、限定 lint、格式一次修正复试、尺寸及空白通过。没有接入生产历史资格，当前捕获不能回填旧决策可见时点；XSHE 时段/临时停市、场所持续范围、真实来源与最终 PIT 仍未完成。

`CONT-S05-XSHE-session-rule-discovery` `skipped_after_retry`：[规则版本发现卡点](evidence/2026-09-28-cont-s05-xshe-session-rule-discovery.md)。2026 修订规则发布页在官方 `investor` 与一次 `www` 路径重试中均获取超时；没有核实施行日期、目标窗口前段的适用版本或固定规则原字节。不得将 2026 规则 PDF 搜索摘录直接扩展为完整年度 XSHE 时段。此卡点不撤销已核的休市通知事实，完整日历及严格 PIT 仍开放。

`CONT-S05-shanghai-trading-date` done：[当地交易日修复证据](evidence/2026-09-28-cont-s05-shanghai-trading-date.md)。BarSeries V3 已按上海时区计算交易日，S05 决策窗口此前按时间字符串日期查日历，合法的 UTC 前一日 Bar 被误拒为 `missing-successor`。新反例先红后绿，决策窗口 43 passed、相邻内容绑定 22 passed，另有 6 项原环境条件 skipped；Server typecheck/build、限定 lint/格式与尺寸 ratchet 通过。只修本地必要计算，不签发历史日历、场所或来源资格；S05 父项、真实 G0-H/G-Run 与 §13 均保持开放。

`CONT-R02-efinance-stock-alias-health` Ready：依据 Spec §3.3，旧 `efinance`、新 `eastmoney` 与 V1 无 source 的 Efinance 股票报价共用实际 `get_realtime_quote`。仅修改 DSA `src/services/thesis_ledger_source_alias_identity.py`、`src/services/thesis_ledger_request_budget_keys.py`、新 `tests/test_thesis_ledger_efinance_stock_alias_health.py`、既有 `tests/test_thesis_ledger_source_alias_health.py` 的相邻旧断言及 `docs/thesis-ledger-source-capabilities.md` 对应股票行，并写专属证据；Control/Runtime/旧健康行、策略及冻结只读。先复现旧 open 被换 alias 绕开，再验证双向切换、V1 行、过期恢复、进程内熔断与无关路由独立；股票不扩展 ETF 专属持久请求预算。定向→相邻 alias/Control/Runtime 回归→限定 lint/编译/空白。若修复检查失败，只做一次定向重试，仍失败记录跳过；不请求真实来源、不运行已失败的 DSA 官方全包或目标同步。完成不关闭旧 alias 完整迁移、G0-M、AC20 或 §13。

`CONT-R02-efinance-stock-alias-health` done：[本地红绿及范围证据](evidence/2026-09-28-cont-r02-efinance-stock-alias-health.md)。新例修前 5 failed/1 passed，修后 alias/Control/Runtime 组合 92 passed、网关 7 passed；改动 Python 文件完整 lint/编译、仓库 critical lint 和限定空白均通过。旧/新/V1 股票报价共用健康与进程内熔断，股票不扩用 ETF 持久请求预算；旧健康行、RouteTarget、执行来源、准入与冻结均保留。无真实来源、官方 DSA 全包重跑或目标同步；完整迁移、G0-M、AC20 与 §13 仍开放。

`CONT-R03-efinance-nav-alias-health` `skipped_after_retry`：[定向卡点与撤回证据](evidence/2026-09-28-cont-r03-efinance-nav-alias-health.md)。实际正式/历史净值 Runtime 忽略 source，旧/新/V1 健康身份仍分离；新红例 10 failed/1 passed。源码尝试后的首轮和唯一修正重试均为 6 failed/12 passed：测试先错把净值 `routeStatus` 当执行阻断，后错把公开 `NO_ELIGIBLE_PROVIDER` 当内部 `circuit_open`。按预算停止并撤回本叶未通过的源码/测试，保留上一股票报价叶和 Spec 待实现合同；无第三次测试、真实来源或目标同步。失败前提未变时不机械重启；R03.3/R03.4、完整 alias 迁移、G0-M、AC20 与 §13 均开放。

`CONT-R03-akshare-nav-alias-health` Ready：只处理 AKShare 的 `FUND_NAV` 与 `FUND_NAV_HISTORY` 两个各自隔离的健康组。当前两种能力的旧 `akshare`、新 `eastmoney` 与 V1 无 source 均调用同一 `get_fund_nav_history`；为每种能力分别合并持久健康读取、规范新写入和进程内熔断键，最近旧 open 跨 alias 阻断，过期后沿原半开路径探测。写集限 DSA `src/services/thesis_ledger_source_alias_identity.py`、专属新测试、`tests/test_thesis_ledger_akshare_stock_alias_health.py` 的相邻旧独立性断言、DSA 能力目录和本 Task/Spec/专属证据；Efinance 净值已跳过叶不重启。先红后绿，再跑相邻 alias/Control/Runtime，限定 lint/编译/空白；失败仅一次定向修复重试后记录跳过。旧路由、准入、冻结及真实来源门禁保持开放。
`CONT-R03-akshare-nav-alias-health` done：[本地证据](evidence/2026-09-28-cont-r03-akshare-nav-alias-health.md)。红例 10 failed；修后新例 12 passed、相邻 8 文件 98 passed，改动 Python 的 lint/编译及文件空白通过。正式/历史净值各自合并旧/新/V1 健康与进程内熔断，过期旧 open 允许探测且旧行保留；公开 Runtime 在旧 open 时不调用读取器。DSA 目录更正当前 AKShare manifest version 3、补两条精确 source 净值行，当前 §2/§3/§4 为 35/65/38 行。未访问真实来源、未运行已失败的 DSA 全包或目标同步；Efinance 净值跳过状态、完整别名迁移、G0-M、AC20 与 §13 均开放。

`CONT-R03-efinance-nav-alias-health-resume` Ready：前叶 `skipped_after_retry` 的原始失败与撤回保留；新前提是 AKShare 同一净值 Runtime 入口已用公开请求断言验证旧 open 时零读取器调用，不再以展示层 `routeStatus` 或内部 `circuit_open` 作为公开错误合同。按现有 Spec §4.1，仅合并 Efinance 的 `FUND_NAV`、`FUND_NAV_HISTORY` 各自旧 `efinance`、新 `eastmoney` 与 V1 无 source 健康/进程内熔断身份。写集限 DSA 精确 source alias helper、新专属测试、既有无关能力独立性断言、DSA 能力目录、本 Task 与专属证据；不重试原已耗尽的任何真实来源或官方全包。先重现跨别名 open 绕过，再验证双向/V1、公开请求零读取、过期探测、旧行保留和两能力/报价隔离。定向→相邻 Control/Runtime→限定 lint/编译/空白；本次新增前提下若仍失败，仅一次定向修复重试并记录停止。完整别名迁移、G0-M 与目标门禁保持开放。
`CONT-R03-efinance-nav-alias-health-resume` done：[续接证据](evidence/2026-09-28-cont-r03-efinance-nav-alias-health-resume.md)。新红例 12 failed，修后专属 12、相邻 9 文件 110 passed；改动 Python 的完整 lint/编译通过。正式/历史净值各自共用旧/新/V1 健康与进程内熔断，公开请求遇旧 open 时零 Reader 调用；旧行保留、过期允许探测、两能力及报价隔离。前叶跳过记录不抹除，真实来源和已失败的官方 DSA 全包未重试；完整 alias 迁移、G0-M、AC20、首条回测与 §13 均开放。

`CONT-159516-draft-strategy` done：[目标策略证据](evidence/2026-09-28-cont-159516-draft-strategy.md)。经用户选择，正式 API 以现有 `159516.SZ` 实验种子创建独立普通 `draft` 策略；数据库和列表均核对版本 1 可见，合同仅名称与描述改变。目标 Server 生产依赖计划要求从 `2026-04-30` 保守取数以覆盖 1 个预热交易日。目标 HiThink 准入、ETF 量额单位、预热数据及运行态版本仍缺，`G0-H-target`、`G-Deploy-159516`、`G-Run`、`G-UI-159516` 保持开放。

`CONT-R02-efinance-daily-alias-health` Ready：仅处理当前 Efinance `DAILY_BAR` 的 `STOCK` 与 `ETF` 两个独立健康组；各组旧 `efinance`、新 `eastmoney`、V1 无 source 在无显式 adjustment 时调用同一 `get_daily_data`。写集限 DSA 精确 alias helper、新专属测试、来源能力目录、本 Task 与专属证据。先以旧 open 切换新路由的公开请求补红例，再验证双向/V1、两资产隔离、其他能力隔离、过期探测、旧行保留和执行来源原文；定向测试→相邻 Control/Runtime→限定 lint/编译/空白。请求预算、RouteTarget、V3 准入、冻结/重放及其他 Provider 不改；不访问真实来源、不运行已失败的 DSA 官方全包。本叶失败仅一次定向修复重试，仍失败记录跳过；完整 source alias 迁移和 G0-M 保持开放。

`CONT-G0-H-159516-warmup` Ready：用户再次指出授权 HiThink Key 位于宿主机 `~/.zshrc`，现已选定普通策略及 `2026-04-30` 保守预热起点；这构成此前 `2026-05-16..08-09` 目标探针之外的精确新请求范围。仅在进程内解析该变量，不打印、落盘或传入命令行；沿现有 DSA HiThink ETF 请求适配器对 `159516.SZ`、上海日期边界 `2026-04-30..08-09` 发起最多一次只读 GET，使用已核的上市公告与带版本 XSHG 交易日历验证完整覆盖。仅记录请求范围、响应指纹、行数、首尾、缺口/重复和稳定失败分类；不保留响应原文或密钥，不改目标容器/策略/数据库。若单次失败，依用户规则记录并跳过同前提重试。此叶只补目标与预热覆盖证据；量额单位、价格基准/修订、权限持久性、完整 HiThink 准入及目标运行门禁仍独立。

`CONT-G0-H-env-wiring` Ready：目标 DSA 当前 `credentialConfigured=false`，宿主 `~/.zshrc` 的 Key 不进入已运行容器；DSA 当前 HiThink 凭据走环境快照，页面旧式字符串凭据不能替代环境变量。写集限 infra `compose.yml`、`.env.example`、凭据说明及成对 Spec/Task、专属证据；只添加可选 `HITHINK_API_KEY` 透传，不落真实值。用合成值验证 Compose 渲染与原有编排合同；目标容器更新仍受 DSA 官方完整离线门禁和来源准入前置约束，不能直接 `docker compose up` 或以配置接线宣称已部署。

`CONT-G0-H-159516-warmup` done：[预热与接线证据](evidence/2026-09-28-cont-g0-h-159516-warmup-and-env.md)。新范围 1 次只读 GET 返回 68/68 日线，覆盖 `2026-04-30..08-07` 的全部独立日历交易日，无缺失/重复/越界；适配器指纹已登记。量额单位仍为 `unknown`，完整来源准入及目标运行态未通过。

`CONT-G0-H-env-wiring` done（仅源码与配置合同）：同一[证据](evidence/2026-09-28-cont-g0-h-159516-warmup-and-env.md)记录 infra Compose 可选变量接线、合成值渲染和原编排合同通过。真实 Key 未写入仓库，当前容器未更新；本叶记录时 DSA 官方全包与精确 HiThink 准入均未通过，后续官方全包进展见 `CONT-DSA-schemas-isolated-gate`。

`CONT-R02-efinance-daily-alias-health` done：[日线别名健康证据](evidence/2026-09-28-cont-r02-efinance-daily-alias-health.md)。旧 open 切新日线路由修前调用读取器，修后新例 12、相邻 8 文件合计 98 passed；限定 lint/编译/空白通过。`STOCK`、`ETF` 分组独立，旧/新/V1 键兼容，过期探测及执行来源保留。无真实来源或目标同步；完整迁移、G0-M 与首条回测仍开放，后续官方 DSA 门禁进展见 `CONT-DSA-schemas-isolated-gate`。

`CONT-DSA-schemas-isolated-gate` Ready：旧 `CONT-DSA-current-baseline-gate` 的 `skipped_after_retry` 保留，不重试其缺相邻 Schemas 构建目录的同一副本。当前 DSA 源码已加入日线 alias 修复、相邻定向 98 passed，主仓 Schemas `dist` 与源码时间戳一致；在**新完整工作区布局**下建立无真实 `.env`、数据库、日志、用户 HOME 和账号文件的临时副本，并只读复制相邻 Schemas `dist`、`package.json` 与所需 Zod 运行依赖。固定 Python/Node、外连防护和临时路径，记录输入摘要与隔离边界自检；先运行旧 16 个精确失败 nodeid，全部通过后按 `syntax`→critical `flake8`→官方 `offline-tests` 顺序执行。新前提失败时只做一次定向修复/重试，仍失败记录并跳过后续高成本门禁；不得修改测试以求通过、访问真实 Provider、覆盖用户工作树或以隔离通过声称目标已部署。写集仅专属临时目录、本 Task 与专属证据。

`CONT-DSA-schemas-isolated-gate` done：[新隔离门禁证据](evidence/2026-09-28-cont-dsa-schemas-isolated-gate.md)。旧 16 点在新完整布局通过，官方 syntax/critical flake8 通过；首次全包 7368 passed / 3 failed（仅缺 Schemas 固定 fixture），一次输入修复后三项定向通过，唯一全包复试 7371 passed / 1 skipped / 4 deselected、626 subtests passed。旧失败与跳过记录保留，未接触真实账号；本叶不证明目标已更新或 HiThink 已准入。

`CONT-worker-runtime-recover` Ready：只读目标检查发现 `backtest-worker` 已退出（exit 255），Server/DSA/PostgreSQL/Redis 运行健康；Worker 最后日志只有 `backtest.worker.ready`，不足以将退出归因于应用故障。当前 Server 源码 typecheck 与 build 退出 0，受影响定向与先前稳定回归见各叶。依 AGENTS 的目标运行态入口要求，Worker 不运行时选择相邻 infra 官方 `./scripts/update.sh thesis-ledger`，沿默认保留数据结构检查，更新 Server 镜像并启动 Server 与独立 Worker；不直接调用 Compose build/up 或手工重启。更新后核对两个服务健康、镜像身份、数据库结构门禁结果及 API/Worker 就绪；失败仅一次定向排查/重试，保留错误与消费者状态。DSA 目标凭据/来源准入、`G-Deploy-159516` 与真实回测仍独立，不因 Worker 恢复勾选。

`CONT-dsa-runtime-stage` Ready：当前源码的 DSA 官方隔离 `offline-tests` 已在完整 Schemas 输入下通过；目标 DSA 仍为旧镜像，但因 Server 官方更新时 Compose 依赖重建，现已读取宿主 HiThink Key，目录 `credentialConfigured=true`，精确 ETF `qfq` route catalog 仍为 `not_admitted`。在保持该拒绝的前提下，通过相邻 infra 官方 `./scripts/update.sh dsa` 一次性更新 DSA 源码镜像；从 `~/.zshrc` 在进程内读取 Key，仅以进程环境传给 Compose，不打印/落盘真实值。Docker CLI 使用无凭据临时配置和现有 socket，以避开沙箱对 `~/.docker/buildx/activity` 的写入拒绝；不复制 Docker 登录配置。更新后核对 DSA/Server/Worker 健康、镜像版本、目录凭据状态与精确 route 仍未准入；本叶仅为目标源码/凭据就位，不签发 G0-H-target 或 G-Deploy-159516，也不发起真实回测。失败按一次定向修复预算记录。

`CONT-worker-runtime-recover` done：[目标运行态证据](evidence/2026-09-28-cont-target-runtime-refresh.md)。首次官方更新因沙箱拒绝 Buildx 活动目录写入而停止，临时无凭据 Docker 配置下的官方 `update.sh thesis-ledger` 成功；默认保留数据结构检查、Server/Worker 健康通过，Worker 从 exit 255 恢复。未据此勾选业务部署或回测。

`CONT-dsa-runtime-stage` done（目标源码与凭据就位）：同一[证据](evidence/2026-09-28-cont-target-runtime-refresh.md)记录官方 `update.sh dsa` 成功、DSA 新镜像与抽查源码摘要一致、环境 Key 安全匹配、三服务健康。精确 HiThink ETF qfq 能力仍 `not_admitted`；来源准入、`G-Deploy-159516`、真实回测与 UI 验收保持未通过。

`CONT-G0-H-159516-unit-split-crosscheck` done（短窗实测，未准入）：[交叉核对证据](evidence/2026-09-28-cont-g0-h-159516-unit-and-split-crosscheck.md)固定 HiThink 官方仓库提交和深交所原生单位说明，另以一次不同范围的 HiThink 拆分短窗请求取得 4/4 日及响应指纹。对既有东财未复权观测，四日 HiThink 成交量精确为其 100 倍、成交额为其按百元取整值；拆分前开/收约为未复权一半，07-10 起相同。这支持本标的短窗量为份、额为人民币元及 qfq 已纳入 7 月拆分的**实测推断**，仍非 HiThink 正式单位合同或 68 日全窗/历史修订证明。适配器继续标记 `unknown`，精确目录维持 `not_admitted`；没有发起正向回测。

`CONT-D01-H-admission-path` Ready：当前 DSA Data V3 已用精确准入行、适配/来源修订和 HMAC 凭据修订保护读取及目录，但 Control V3 `_v3_target_reason` 对全部 HiThink 路由无条件 `not_admitted`，即使未来有完整证据也无法形成一致的 Effective Policy。只改 DSA Control 的 HiThink V3 分支，使其仅在内部精确准入行处于有效期、准入范围自洽且当前适配/来源/凭据修订全部匹配时可成为 eligible；实际请求是否位于范围内仍由 Data V3 逐次检查。无行、过期、撤销、换 Key、缺主密钥或不匹配仍拒绝，V1/V2 保持原门禁。用合成密钥、隔离 SQLite 和无联网 Adapter 先证旧失败，再验证正向与失效；仅运行定向测试、相邻回归及限定 lint/编译。同步 DSA 能力文档/CHANGELOG 和本 Task 专属证据。此叶不写目标准入行、不更改 `volume_unit=unknown`，不签发 `G0-H-target` 或正向运行许可。

`CONT-D01-H-admission-path` done：[准入接缝证据](evidence/2026-09-28-cont-d01-hithink-admission-path.md)。新例修前复现目录 ready 而 Control 仍拒绝，修后合成精确准入可在 V3 Effective Policy 生效；无行、旧修订、换 Key、撤销、缺主密钥均拒绝，轮换后 Data V3 未调用 Adapter。新增 6、相邻六文件 37 passed；新完整隔离输入的官方 syntax/critical flake8 与 `offline-tests` 7377 passed、1 skipped、4 deselected、626 subtests passed。目标经官方 `sync-code.sh dsa` 快更，Control 源码摘要一致、容器 healthy、精确路由仍 `not_admitted`；镜像未更新，真实准入和普通回测尚未执行。

`CONT-S05-v3-execution-clock-precision` 功能完成、两份既有测试文件格式门禁 `skipped_after_retry`：[精确时钟证据](evidence/2026-09-28-cont-s05-v3-execution-clock-precision.md)。预检、冻结和重放复用 Schemas 精确瞬时比较；来源观察、Bar 时间/可用时间、多窗口完成及 Server 实际抓取均按 `dataAsOf` 阻断无效或未来事实。定向及相邻 44 passed，Server 全包 1799 passed/90 skipped，typecheck/build/限定 lint/边界/HEAD 尺寸 ratchet 通过；官方快更后 Server/Worker 均 healthy，关键编译产物摘要相等。格式剩余情况见证据。此叶不签发 HiThink 单位、真实来源、严格 PIT 或目标业务验收资格。

`CONT-S05-v3-dependency-clock-precision` 功能完成、既有依赖测试文件格式门禁 `skipped_after_retry`：[非价格时钟证据](evidence/2026-09-28-cont-s05-v3-dependency-clock-precision.md)。非价格事实 `availableAt` 与首个执行开盘前的标的事实 `occurredAt` 都修复同毫秒亚毫秒误放行；相邻 16 passed，最终 Server 全包 1799 passed/90 skipped，typecheck/build/限定 lint/边界/HEAD 尺寸 ratchet 通过。第二次官方快更后 Server/Worker healthy、两份关键 JS 摘要相等。未据此关闭真实来源、目标或整体 S05。

`CONT-D01-target-runtime` done：[目标运行态核对](evidence/2026-09-28-cont-d01-target-runtime.md)。目标 V3 协议 smoke 通过，DSA 多窗口/HiThink/Provider Runtime 与 Server/Worker Reader/Snapshot/Runner 的宿主和目标代码摘要一致，精确 HiThink qfq 路由仍 `not_admitted`。据此只收口 `D01-runtime` 的目标运行代码一致性；真实来源单位/价格基准/修订、精确 RouteAdmission、`G0-H-target`、`G-Deploy-159516` 与 `G-Run` 保持开放，本叶未发起 Provider 行情或写数据库。

`CONT-R06-sector-ranking-source` done：[行业板块来源证据](evidence/2026-09-28-cont-r06-sector-ranking-source.md)。R06.3/R06.4 复用独立纯 helper 核对板块名唯一/非空和有限涨跌幅，并在每行保留 `akshare/eastmoney:stock_board_industry_name_em` 或 `akshare/sina:stock_sector_spot` 实际来源；EastMoney 坏合同后的 Sina 回退不再冒充主源。专属修前 3 failed/4 passed，修后 7 passed，相邻消费者合并 56 passed；限定 lint/编译/空白通过，AkshareFetcher 2630→2612 行。仅完成本地 endpoint/行合同，真实 as-of、单位、覆盖和 G0-M 仍开放。

`CONT-R06-concept-efinance-ranking-source` done：[续接来源证据](evidence/2026-09-28-cont-r06-concept-efinance-ranking-source.md)。R06.9 概念板块新增 EastMoney source 与重复身份拒绝，修前 2 failed 后通过；R06.5 Efinance 行业板块静态确认底层为 EastMoney `clist/get`，专属 2 failed/1 passed 后 3 passed，并显式标记 `efinance/eastmoney`。四文件消费者合并 61 passed、限定 lint/编译/空白通过；AkshareFetcher 降至 2594 行、EfinanceFetcher 1422 行。两入口同源关系已固定，真实分类版本、as-of、单位/覆盖及 G0-M 继续开放。

`CONT-R06-tushare-sector-ranking-source` done：[Tushare 行业排名证据](evidence/2026-09-28-cont-r06-tushare-sector-ranking-source.md)。R06.6/R06.7 分别保留 `tushare/ths:moneyflow_ind_ths` 与 `tushare/eastmoney:moneyflow_ind_dc`，共享唯一行业/有限涨跌幅合同但不合并分类；THS 坏合同按既有顺序回退东财。两红例修后通过，15:00 专属用例确认请求上一交易日、16:00 使用当日；Tushare follow-up 9 passed，组合回归 69 passed，限定质量通过，真实权限/分类版本/as-of 与 G0-M 仍开放。

`CONT-R06-tickflow-sector-ranking` done：[TickFlow SW1 证据](evidence/2026-09-28-cont-r06-tickflow-sector-ranking.md)。R06.8 保留 universes.list/batch + quotes.get 的派生来源，参与排名的实际成分 quote 必须都有同一 provider timestamp；缺失或混合时点整体拒绝。成功行携带精确 source、`classification=SW1`、`classification_version=null`、provider `as_of` 与成分数，不从 universe ID 猜分类版本。两红例修后通过，TickFlow 及当前板块消费者组合 89 passed，限定 lint/编译/空白通过；真实 SDK/套餐权限、分类版本、时点语义与 G0-M 仍开放。

`CONT-R06-sector-membership-consumer` done/blocked：[Consumer 选择证据](evidence/2026-09-28-cont-r06-sector-membership-consumer.md)。R06.10 选定现有 `screening.industry.enrich_industry_concepts`，AKShare 当前链为行业板块列表→板块成分，不新建第二套 membership Consumer；R06.11 继续 blocked，因为 provider cache 只有本地 `created_at`/mtime TTL，没有来源 as-of、分类版本或历史有效期，本地时间不能冒充截面日期，也不得回填历史。无生产代码/网络/目标变更，真实 G0-M 与历史/PIT 仍开放。

`CONT-R04-fund-holdings-source-year` done：[基金持仓来源年份证据](evidence/2026-09-28-cont-r04-fund-holdings-source-year.md)。R04.1 复用现有季度/代码/权重/披露未知合同，新增上海时区查询年和内部来源证据；仅当前年空结果才回退上一年，非空错年/坏行立即拒绝，不用 fallback 掩盖。AKShare 静态源码确认年份参数与百分比字段语义；Fetcher 集成红例修前 1 failed/6 passed，最终持仓链 28 passed，限定 lint/编译/空白通过。真实权限、完整覆盖、披露发布时间/修订和 G0-M 仍开放；R03.5/R03.6、R04.2–R04.5 均因无现存 Consumer 按 Spec 保持 blocked，不新建基金资料/估值平台。

`CONT-R05-yahoo-valuation` done：[Yahoo 美股估值证据](evidence/2026-09-28-cont-r05-yahoo-valuation.md)。R05.5 只选择 US STOCK 的 `trailingPE/priceToBook` 无量纲倍数，yfinance 1.7.0 静态核心入口为 `query2.finance.yahoo.com/v10/finance/quoteSummary/{symbol}`；current observation 只保留本机 observed_at，source_available_at=null、historical_visibility_verified=false，不纳入 marketCap。R05.6 让 US `get_fundamental_context` 优先消费独立 yfinance valuation bundle，避免混合 quote 补字段冒充 Yahoo provenance；消费红例 32.5→25.5 后修复，adapter/consumer 两文件 38 passed，限定 lint/编译/空白通过。真实 Yahoo 请求/许可/发布时间/修订、目标与 G0-R 仍开放。

`CONT-R06-market-breadth` done：[市场宽度证据](evidence/2026-09-28-cont-r06-market-breadth.md)。R06.1 选择 Efinance 0.5.9/EastMoney 全市场股票快照与现有 MarketAnalyzer Consumer，只把上涨/下跌/平盘/涨停/跌停家数纳入合同；R06.2 要求六位股票身份唯一，重复或缺身份整体拒绝，成功保留 `efinance/eastmoney` source、本地 observed_at，来源可见时刻仍未知。专属修前2 failed/1 passed→3 passed，MarketAnalyzer/TickFlow回退组合21 passed，限定 lint/编译/空白通过；`total_amount` 仅兼容保留，不作为已核单位能力。真实交易阶段/as-of/覆盖/HTTP/许可和 G0-M 仍开放。

`CONT-R02-tickflow-index-quote` done：[TickFlow 指数报价证据](evidence/2026-09-28-cont-r02-tickflow-index-quote.md)。R02.14 固定 tickflow 0.1.25 的 6 个 CN 主指数 `quotes.get` 路径；每批只消费本批请求 symbol、重复目标整体拒绝、缺 provider timestamp 拒绝，结果保留 `tickflow:quotes.get:index` 与逐行 as_of。点位/变动单位显式 `index_point`、涨跌幅 `percent`，量额单位保持 unknown。新增合同初次3 failed，修复批次额外行处理后3 passed；TickFlow/MarketAnalyzer 组合60 passed，限定 lint/编译/空白通过。真实 Key/套餐、覆盖、timestamp 源端语义、量额单位、交易阶段和 G0-M 仍开放。

## 13. 最终一致性 Review

### 历史检查点

目标执行接续（2026-09-26）：U04 本地窗口闭环已完成，目标部署入口尚未调用。全量回归重试后 Server 1249/49 skipped、Desktop 509、DSA 56 通过；当前带 HEAD 基线的尺寸门禁仍有 AI Provider 三文件增长，先按职责拆分保留全部 WIP 后重试，不能以无基线警告模式冒充通过。完整记录见 [目标执行记录](evidence/2026-09-26-goal-execution.md)。其余 M2/M3 范围不变，目标持续 active。

2026-09-28 当前检查点补充：职责拆分和精确格式后，带真实 HEAD 基线的尺寸 ratchet 已通过，保留 13 条存量警告；上段 2026-09-26 的 AI Provider 三文件增长是历史失败记录，不能当作当前失败。精度修复后的稳定回归与目标同步另按 §12.8 记录，真实来源及整体验收仍未通过。[本批集中 Review](evidence/2026-09-28-backtest-implementation-review.md) 记录实际源码覆盖、F01/F02 修复、各层证据和完整剩余范围；其局部结论不勾选本节全局清单。

### 2026-10-03 当前结论

- [x] Spec §1.1 共同价格基线与 AC01–AC20 已在 §0.2 逐项对账，非共同范围有明确扩展/跳过状态。
- [x] 本轮 C01–C05 和收口父叶均绑定实际源码、配置、测试和运行证据；历史失败没有改写为当时通过。
- [x] HiThink qfq、腾讯 qfq/hfq 及腾讯 qfq 备源四条正常 Run 均 succeeded/complete，目标冻结重放校验值一致。
- [x] 标的目录只读行情、三口径切换、扩窗、失败恢复、实际来源及运行配置隔离已在目标 Web 验证。
- [x] 官方最小代码同步、目标健康、DSA/Server/Worker 业务闭环完成；本轮无依赖/数据库结构变更，未把快更当作镜像发布。
- [x] Server、Schemas、Desktop、DSA 相关回归及构建通过；边界、依赖、修改文件 lint 与文档链接检查完成。
- [x] 唯一既有文件尺寸 ratchet 失败由 C06 测试职责拆分修复，保留当前 V3 合同和原断言，未提高阈值或增加忽略；所有其他已知未执行层级分别披露。
- [x] 真实单位、事件、严格 PIT、NAV 正向、Electron、原始浏览器网络采集和新增来源没有借用基础价格验收宣称完成。
- [x] Spec/Task、当前架构、用户/运维、版本矩阵、DSA 契约与能力目录、infra 凭据说明一致；扩展触发条件集中于 TODO。
- [x] 临时停用的来源均恢复，最终策略 revision 36 已应用；未提交、发布、购买、注册账号或写入真实账本。

结论：用户本轮确认的共同价格范围已完成，没有该范围内仍待执行的任务。扩展计划和此前明确跳过来源保留未勾选状态及原编号，以便需要时重新立项；本结论不声明原始 M1/M2/M3 的全部高级能力在线。未为关闭任务扩大证据要求或虚构通过状态。
