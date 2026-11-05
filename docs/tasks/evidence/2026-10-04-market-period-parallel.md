# 行情周期聚合并行交付证据

## 交付结论与边界

2026-10-04 本 worktree 完成 **T1.1 公共聚合合同**与 **T2 Domain 纯计算**。四种派生周期 `5d / 1w / 1mo / 1y` 已具备可回放的领域实现及直接合同测试。原 T1 拆为三个独立叶：T1.2 API 请求/响应接入、T1.3 DSA 周期合同仍未完成；原有 T1 全部完成条件保留。

这是本地交付，完整产品尚未完成。AC1 的聚合、完成状态与确定性断言由 T2 直接验证；AC2 的来源字段和 AC3 的原始来源合同兼容由 T1.1 验证；AC5 仅覆盖纯计算不补造桶，窗口/预热/分页仍属于 T3。AC4、AC6–AC11 的消费端或运行态义务未通过，不能依据本报告勾选。

权威需求仍为 [原主题 Spec](../../specs/2026-09-16-market-chart-period-aggregation.md)，执行状态为 [原主题 Task](../../archive/tasks/2026-09-16-market-chart-period-aggregation.md)。本报告只保存证据与集成交接，不构成第二份任务事实源。

## 工作区与基线

- 本 worktree：`/Users/yzin/.codex/worktrees/604f/thesis-ledger`，开始时工作树干净。
- 原主仓：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger`，只读比较，不写入。两者 HEAD 均为 `514abeebfe57bac0c16271439d8b777ff3b02a9f`。
- DSA 原仓：`/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis`，HEAD `d40549602d187da7bdd0e8bebb59d2a0fc271919`；只读，无写入、运行或来源调用。
- Infra 原仓只读，本次没有部署调用。
- 相关行情源码及 `market.ts` 与主仓一致，没有需要复制的行情前置。主仓的 Journal、交易成本等 dirty WIP 不复制、不覆盖。Schema/Domain 的两个公共导出文件与主仓存在 Journal 增量，合并时必须保留。
- Spec 与原主仓正文一致后增补现行字段冻结；Task 继承原主仓 2026-10-03 对账结论，并增加叶拆分与本地进度。立项时的 V2 文件名只作为历史定位，实施基于当前 Route/Data/Chart V3。
- 使用 `pnpm install --frozen-lockfile --ignore-scripts` 在本 worktree 安装独立依赖；根 manifest/lockfile 未修改。构建产物和 node_modules 未进入 Git。
- Context Mode 工具本会话未提供，查询与日志均通过 RTK 和受控过滤输出；未读取大段运行态日志。

## 具体变更文件

| 文件                                                       | 交付职责                                                   |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| `packages/schemas/src/market-period.ts`                    | 展示周期枚举、聚合输入、派生 bar/来源/上下文与独立展示合同 |
| `packages/schemas/test/market-period.test.ts`              | 13 项合同断言，包含实际 Schema→Domain→Schema 互通          |
| `packages/schemas/src/index.ts`                            | 仅新增 `market-period.js` 的公共导出                       |
| `packages/domain/src/market-period-types.ts`               | 领域输入、日历/Session、已绑定覆盖证据、输出及规则版本     |
| `packages/domain/src/market-period-calendar.ts`            | 计划 Session 核验、市场时区和四周期桶边界                  |
| `packages/domain/src/market-period-input.ts`               | 输入上下文、日线、覆盖证据核验及确定性去重                 |
| `packages/domain/src/market-period-aggregation.ts`         | OHLCV/金额归约、完成状态与规范化指纹编码                   |
| `packages/domain/test/fixtures/market-period.fixture.ts`   | 显式受控日历/日线/停牌证据，不代表真实交易所日历           |
| `packages/domain/test/market-period-aggregation.test.ts`   | 35 项 golden/失败路径/回放测试                             |
| `packages/domain/src/index.ts`                             | 三行新增：类型、聚合函数/编码、稳定错误类型                |
| `docs/specs/2026-09-16-market-chart-period-aggregation.md` | 当前链定位、字段命名和规则冻结                             |
| `docs/tasks/2026-09-16-market-chart-period-aggregation.md` | T1 独立叶、T2 契约里程碑依赖、局部状态与未完成门禁         |
| `docs/tasks/evidence/2026-10-04-market-period-parallel.md` | 本交付证据与集成顺序                                       |

## 验证命令与实际结果

全部命令在本 worktree 执行，没有使用父对话的 dist、数据库、端口或容器。

| 命令                                                                                                                                                                                                                              | 输入范围与结果                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `rtk proxy pnpm exec vitest run packages/schemas/test/market-period.test.ts packages/schemas/test/market-bar-series.test.ts packages/schemas/test/market-chart-wire-v3.test.ts packages/schemas/test/market-data-wire-v3.test.ts` | T1.1 初始定向检查，4 文件 34 项通过；旧来源身份仍仅 1m/1d                                         |
| `rtk proxy pnpm exec vitest run packages/domain/test/market-period-aggregation.test.ts packages/schemas/test/market-period.test.ts`                                                                                               | 新功能定向检查，2 文件 48 项通过                                                                  |
| `rtk proxy pnpm --filter @thesis-ledger/domain test`                                                                                                                                                                              | 最后一次领域归一化拆分后，39 文件 330 项全部通过                                                  |
| `rtk proxy pnpm --filter @thesis-ledger/schemas test`                                                                                                                                                                             | Schema 当前源码包级回归，52 文件 602 项全部通过；其后仅 Domain 内部校验职责拆分与测试类型导入修正 |
| `rtk proxy pnpm exec vitest run packages/schemas/test/market-period.test.ts`                                                                                                                                                      | Domain 最终 build 后复验，13 项通过，覆盖实际包导出的互通                                         |
| `rtk proxy pnpm --filter @thesis-ledger/shared --filter @thesis-ledger/domain --filter @thesis-ledger/schemas -r build`                                                                                                           | T1.1 build 通过；shared 后续无变更                                                                |
| `rtk proxy pnpm --filter @thesis-ledger/domain --filter @thesis-ledger/schemas -r build`                                                                                                                                          | T2 最终 Schema 源码及 Domain 的 build 通过；职责拆分后另执行 Domain build 通过                    |
| `rtk proxy pnpm --filter @thesis-ledger/domain --filter @thesis-ledger/schemas -r typecheck`                                                                                                                                      | 两包通过；职责拆分后另执行 Domain typecheck 通过                                                  |
| `rtk proxy pnpm exec eslint <本次八个新增源码/测试文件>`                                                                                                                                                                          | 定向 ESLint 通过；初始测试类型导入问题已修复                                                      |
| `rtk proxy pnpm exec eslint <本次五个新增 src 文件> --rule 'complexity:[warn,20]' --rule 'max-lines-per-function:[warn,{max:220,skipBlankLines:true,skipComments:true}]'`                                                         | 最终无告警；归一化函数初始复杂度 39 已按上下文、日线、证据职责拆分，未提高阈值                    |
| `rtk proxy node scripts/check-boundaries.mjs`                                                                                                                                                                                     | 通过，复核现行 Domain 不依赖 Schema 的门禁与新依赖方向；无新增跨 feature 依赖，无须新增规则       |
| `rtk proxy env GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs`                                                                                                                                               | ratchet 通过；10 个既有未增长的文件尺寸告警，本次新增文件无超限                                   |
| `rtk git diff --check`                                                                                                                                                                                                            | 通过；交付文档写完后再执行最终检查                                                                |

定向 ESLint 的八文件参数依次为上表的四个 Domain src、Domain fixture/test 与 Schema src/test。复杂度命令的五文件参数为四个 Domain src 和 Schema src。完整原始日志保存在 `/tmp/market-period-*.log`，本报告保留统计与失败修复事实。

高成本包级检查没有机械重复：Schema 源码稳定后复用 602 项包级结果，Domain 内部职责拆分后重跑受影响 Domain 包与互通定向测试。未执行仓库全量 lint/build、Server/API Client/DSA/Desktop 套件、数据库生成、镜像构建、目标服务更新、真实 Provider、浏览器或设备；T6/G1/P1/R1 保持未完成。

## 可观察行为与失败边界

- 四周期 OHLC 首末、最高最低、成交量/金额求和；周跨月/跨年、自然月/年和 5 日显式锚点。无有效日线的桶不输出，不补零、不补最近值。
- Session 支持分段与半日安排；US 收盘跨上海日期仍以计划 Session 开始日期分桶。日历必须覆盖完整桶，不能用已收到日线或请求 end 缩短周期。
- 周二完整日线仍为 `incomplete`；当前月/年同理。最后 Session 结束前、恰好结束、结束后有直接断言。过去缺日没有可信证据时为 `unknown`；源 `incomplete/unknown` 传播。
- 无交易证据绑定证券、日历 revision、基础输入指纹；晚于评估时刻直接拒绝。完成可得时刻不早于桶末 Session，也不早于实际使用的晚到证据。
- 混合复权、完整价格口径或证券、同日冲突日线、互相矛盾的无交易证据、重叠 Session、无效数值/日期和累计溢出 fail-closed。完全相同重复和数组乱序不改变输出。
- 领域纯函数不读取系统时钟、网络、环境变量或存储；固定 `evaluationAsOf` 可回放。不修改调用方数组或对象。
- `canonicalMarketPeriodEncoding` 包含周期、规则、日历 revision、基础输入、完整口径、评估时刻、锚点、实际使用覆盖证据、完成状态及可得时刻。T3 必须对该编码生成摘要并关联缓存，不可仅散列数值。

## 父对话需要带入的补丁与冲突点

本 worktree 内改动全部未提交。**不要对整个目录或公共 index 覆盖复制**：

1. 先带入八个新增领域/Schema 源码与测试文件（见文件表），再将 Domain index 的三行和 Schema index 的一行增量合并到主仓现有导出，保留 Journal 相关 dirty WIP。
2. 合并原主题 Spec 的字段冻结和 Task 的 T1.1–T1.3 拆分/状态更新；保留主仓 2026-10-03 对账引用及父对话后续修改。带入本证据文件。没有其他需要带入的前置补丁。
3. 在父对话最终集成基线上 build Domain/Schema 后运行两文件定向 48 项，确认 Journal 新导出与本主题无冲突；只有输入发生变化才扩大验证。
4. 单独实施 T1.2：现行公共请求/响应、默认 1d、未声明周期的结构化状态、基金排除。该叶可先拒绝尚未装配的派生周期，不需要提前等待 T3 成功序列。
5. 在独立可写 DSA 工作区实施 T1.3，再推进 T4；来源 bars 不声明派生为原生，指标消费所选周期序列并按周期声明预热/上限。
6. T3 应先拆成 calendar fact/派生能力、窗口与预热/缓存、HTTP 消费等独立可验证叶，再接入本纯函数；当前 `coverage.latestCompleteTradingDate` 及本地硬编码交易日历不能替代版本化完整 Session fact。
7. T1/T3/T4 依赖满足后推进 T5，最后 T6、G1、P1、R1。目标部署、真实来源、浏览器/设备与完整验收由父对话另行组织，本次未占用这些资源。

潜在冲突只有 `packages/domain/src/index.ts`、`packages/schemas/src/index.ts` 和本主题 Spec/Task；API Client 主仓已有 Journal 修改，不属于本次补丁。DSA/infra 未产生补丁。父对话作为统一复核与集成责任人，本报告不主动向其他对话发送消息。

## 局部一致性复核

结论：T1.1/T2 的本地完成条件与证据一致，通过。完整 T1、T3–T6、G1/P1/R1 未完成；产品最终 Review 未通过，未归档主题或转移当前义务到 TODO。日历 fixture 仅证明确定性计算，不证明真实交易所日历完整性或线上来源可用。没有 reset、clean、stage、commit、push，全仓格式化、数据库/部署变更或真实收费来源调用。

## 父对话主仓集成与复验

2026-10-04 父对话将八个新增源码/测试文件及两个公共 index 的最小增量带入主仓，保留 Journal 导出与其他未提交修改。原主题 Spec/Task 合并字段冻结和叶拆分；T3 依赖 T1.1/T1.2/T2，T4 依赖 T1.3，T5 依赖 T1.2/T3/T4，API 与 DSA 合同叶可分别推进。

主仓最终输入上的实际结果：

| 验证                                | 结果                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Domain/Schema build                 | 通过                                                                                                  |
| 两个新功能直接测试                  | 48 项通过                                                                                             |
| Domain 全包                         | 43 文件、386 项通过，包含主仓 Journal 增量                                                            |
| Schema 全包                         | 52 文件、611 项通过                                                                                   |
| API Client 全包                     | 10 文件、60 项通过                                                                                    |
| Server/API Client/Desktop typecheck | 全部通过                                                                                              |
| 新增八文件 ESLint、格式检查         | 通过                                                                                                  |
| import boundaries、依赖图测试       | 通过，依赖图 8 项                                                                                     |
| Journal 消费端复验                  | 10 文件、70 项通过；3 文件、8 项隔离数据库用例按默认条件跳过；此前隔离 PostgreSQL 的 8 项另有通过证据 |
| Desktop 最终 build                  | 通过，4.78 秒；保留既有 bundle 尺寸提示                                                               |

Domain 当前运行依赖仅有 shared。新聚合中的排序在新建数组上使用原生 Array.sort，比较器承载交易日/Session 顺序；Map 去重承载冲突拒绝规则。未为这两处领域操作新增工具包依赖、运行 manifest 或通用 utils。

按实际变更使用 infra 官方 `./scripts/sync-code.sh thesis-ledger`，兼容预检及完整脚本通过，Server/Worker healthy。镜像仍为 `sha256:27dfa6a8aa364abf0eacf21a793a2ecfb4f95a579d0285bd7aabcbb143744426`；仅容器可写层更新，未改变数据库结构或卷，不构成镜像发布。

同步后复用已有标记账户：3 个正式对象、2 份历史快照、旧 Snapshot 保持 STALE 及原结果；确定性收益 4.6、反事实 -4.4，周期独立统计 1 个 Cycle/2 个 Slice。两个受保护账本及标记账户分析前后的 Ledger 哈希未变化。此复验保护既有 Journal 消费；派生行情 HTTP、DSA、Desktop、真实 Session 来源尚未接通，T1.2/T1.3、T3～T6、G1/P1/R1 不据此关闭。

日志为 `/tmp/market-period-integrated-*.log` 与 `/tmp/parallel-integrated-*.log`；本段只记录实际执行范围。统一聚合见[父对话报告](../../archive/reviews/2026-10-04-parallel-task-integration.md)。

## 父对话继续实施 T1.2

T1.2 已完成独立叶的公开传输与结构化降级。新增 `market-period-request.ts` 拥有展示周期判断；原 Controller 的 identity/window/acceptance 解析提取至 `market-chart-request.ts`，Controller 从 407 行降至 371 行，保留原有格式与其他工作。API Client 的三端点传输集中在 `market-display-client.ts`；公共 index 复用模块，保留 Journal 增量。详情 Schema 仅新增可选展示周期，没有扩大原始 BarSeries identity。

三个端点统一处理：非法周期 400/`market_timeframe_invalid`，基金派生 422/`market_period_asset_unsupported`，股票/ETF 未装配派生 503/`market_period_unavailable`。SDK 明确传输周期、保留错误和 AbortSignal；bars 与详情不接受以 1d 伪装派生成功的响应。旧详情省略周期保持旧 URL/成功响应。

| 本次输入与命令                                                                   | 结果                                           |
| -------------------------------------------------------------------------------- | ---------------------------------------------- |
| 四文件初始定向：HTTP、既有详情、SDK、Schema                                      | 32 项通过                                      |
| `pnpm --filter @thesis-ledger/server exec vitest run test/market --maxWorkers=2` | 51 文件、614 项通过；5 文件、27 项默认条件跳过 |
| `pnpm --filter @thesis-ledger/schemas test`                                      | 53 文件、619 项通过                            |
| `pnpm --filter @thesis-ledger/api-client test`                                   | 11 文件、68 项通过                             |
| 最终 SDK 传输与旧调用定向                                                        | 2 文件、20 项通过                              |
| Server/API Client/Desktop typecheck，API Client build                            | 通过                                           |
| Desktop 最终 build                                                               | 通过，4.36 秒；保留既有 bundle 提示            |
| 新增及修改源码 ESLint、边界门禁、尺寸 ratchet                                    | 通过；9 个历史尺寸告警，无阈值或 ignore 变更   |

失败修正有界记录：初始 HTTP 测试在 Vitest 中缺少构造依赖装配，改用继承真实 Controller 的显式 fixture 构造后通过；SDK 提取后的查询键顺序与原 URL 断言不一致，已恢复旧传输；详情分段 union 的类型访问经 capability 判别收窄后 build/lint 通过。未通过的中间运行不计入最终结果。

源码稳定后再次通过官方 `sync-code.sh thesis-ledger` 完整窗口；两消费者 healthy，镜像保持原 ID，未变更数据库结构或卷。目标只读 GET 加 SDK 共 21 项拒绝路径通过；没有请求原生行情成功数据或调用收费来源。随后复盘对象/历史/分析/周期与 Ledger 哈希保护性复验再次通过。日志为 `/tmp/market-period-api-*.log`。

本叶可以勾选 T1.2，完整 T1 仍依赖 T1.3；T3/T4 的成功聚合及指标、T5 UI 和 T6/G1/P1/R1 完整门禁继续开放。目标拒绝路径通过不能替代派生产品验收。
