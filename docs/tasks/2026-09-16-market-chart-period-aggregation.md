# 行情图表周期聚合实施任务

对应 Spec：[`../specs/2026-09-16-market-chart-period-aggregation.md`](../specs/2026-09-16-market-chart-period-aggregation.md)

> 任务标识：`market-chart-period-aggregation`
> 状态：规划完成，待从 T1 开始实施（分钟内不属本任务）
> 范围说明：本文件只覆盖 `5d / 1w / 1mo / 1y` 派生周期的契约、聚合、窗口、指标与 Desktop 交互；分钟线另行立项。

## 执行约束

- 保留当前工作树全部未提交修改；不提交、不推送、不清理、不重置、不格式化整个仓库。改 Desktop 重叠文件前先读当前文件与 diff，只做局部增量。
- 本机（老板的 Mac）没有 `pnpm`，`rtk` 也不在 PATH；门禁用仓库根二进制：
  - Desktop typecheck：`cd apps/desktop && ../../node_modules/.bin/tsc -p tsconfig.json --noEmit`
  - 定向测试：`cd apps/desktop && ../../node_modules/.bin/vitest run src/features/market-detail`
  - ESLint：仓库根 `./node_modules/.bin/eslint <paths>`
- `tsc`、`eslint`、全量 `vitest` 一律后台执行（前台会被 SIGTERM 杀掉，exit 137）；Desktop 全量套件约 9 分钟，`test/date-display-contract`、`test/drawer-layout-contract`、`test/sticky-table-actions.contract`、`test/ui-contract` 需 `--testTimeout=120000` 才不误报超时。
- 验证按「定向测试 → 包级检查 → 仓库门禁 → 目标运行态 → 浏览器」推进，低层级失败时不提前跑高成本门禁。
- 跨仓顺序：T1 冻结契约后，T2/T3 在主仓、T4 在 DSA；DSA 只做既有计算层的 additive 适配与直接测试，不复制主仓实现。
- 不得为了加快验证而放宽数据口径、跳过 calendar fact 检查或伪造周期 bar。

## 实施前基线

- 2026-09-16 只读盘点：`packages/schemas/src/market.ts:79/134/160`、`market-bar-series-v2.ts:8` 的 `timeframe` 只有 `1m | 1d`；`market-v2.controller.ts:232-243` 的 `detail()` 无 `timeframe` 参数，`:286` 写死 `timeframe: '1d'`；独立 bars/indicator 路由已有 `query.timeframe ?? '1d'`。
- `market-bar-reader.ts:345` 只读 `routeStatus.DAILY_BAR`；`market-detail.service.ts:64-67` 把 bars 与 MA/MACD/RSI 绑定在 `DAILY_BAR`。
- DSA 能力声明仍为 `bars.timeframes = ['1d']`、`indicators.timeframes = ['1d']`（`services/dsa-adapter/src/index.ts:8-13`，`test/capability.test.ts` 快照锁定）。
- 指标端点已是「给定 points 的纯计算」（`market-bar-series-v2.ts:111-137`、`market-v2.controller.ts:172-198`），指标缓存键含 `inputFingerprint`，周期不同天然隔离。
- 派生先例与命名法：`backtest-bar-aggregation.service.ts:20-46` 的 `kind: 'derived'` + `provider: 'thesis-ledger-server'` + `providerRevision` + calendar fact 缺失即降级；`packages/schemas/src/backtest-data.ts:10` 的 `dataTimeframeKindSchema = z.enum(['base','derived'])`。
- 图表侧页内可比语义已冻结：Desktop 以「页 = 一次详情响应」构建 ChartPoint 并按日期合并（`market-chart-model.ts::mergeChartPoints`、`market-chart-types.ts::chartPageFromResponse`）。
- 已知既有缺陷（不属本任务，但会经过同一路径）：`/api/v2/market/:symbol/detail` 未接收客户端发送的 `calculationAnchor`（`market-v2.controller.ts:232-243`），且 `loadEarlier` 传的是上一页序列末尾日期。若 T3/T5 验证发现它影响预热正确性，先单独修复并留证，不在本任务内夹带。

## 任务

- [ ] T1：冻结周期契约、派生标识与规则版本
  - 覆盖验收标准：AC1、AC2、AC3、AC4
  - 依赖：无
  - 涉及范围：`packages/schemas/src/market.ts`、`market-bar-series-v2.ts`、`packages/api-client/`、DSA 侧 Contract/capability 声明与直接测试；Desktop 只同步类型消费。
  - 不包含：聚合算法实现、Server 窗口逻辑、Desktop UI、分钟线。
  - 完成条件：`timeframe` 枚举扩展为 `1m | 1d | 5d | 1w | 1mo | 1y`；新增基础/派生标识（沿用 `base | derived` 命名）；`/detail` 接受 `timeframe` 且默认 `1d`；派生序列的 provenance 字段（provider、规则版本、基础来源引用）命名冻结；未声明周期返回结构化错误而不是回退；旧客户端不传 `timeframe` 的响应与错误语义不变。
  - 验证方式：Schema 契约测试、API Client 契约测试、DSA Contract 测试、跨仓 payload fixture；记录主仓与 DSA HEAD。
  - 停止条件：若 `base | derived` 标识无法在不破坏既有 BarSeries V2 消费者的前提下加入，保留 T1 未勾选并记录兼容矩阵后请示，不得用「周期名映射到假 provider」绕过。

- [ ] T2：实现 Domain 派生聚合纯函数与 golden 测试
  - 覆盖验收标准：AC1、AC5
  - 依赖：T1
  - 涉及范围：`packages/domain/`（与 `aggregateMinuteBars` 同级的新聚合函数）及其测试；不涉及 Server 装配。
  - 不包含：交易日历 fact 的采集、指标计算、缓存、UI。
  - 完成条件：`5d / 1w / 1mo / 1y` 按 Spec 的桶边界聚合 OHLCV 与 `completionStatus`/`availableAt`；桶内混合 `adjustment` 或口径不一致时 fail-closed；不补零、不补最近值；桶内无有效日线时不出 bar；同输入 + 同 calendar revision + 同规则版本输出逐字段稳定。
  - 验证方式：golden test 覆盖跨月/跨年周、半日市、停牌缺失交易日、`incomplete`/`unknown` 传播、混合复权、`5d` 锚点随窗口移动、Dedupe 与排序；Domain 包级测试与 typecheck。

- [ ] T3：接入 Server 派生能力声明、窗口/预热换算与派生视图缓存
  - 覆盖验收标准：AC2、AC3、AC5、AC9
  - 依赖：T1、T2
  - 涉及范围：`apps/server/src/market/` 的 Reader/Controller/detail 装配、calendar fact 读取、派生能力声明、Redis 派生视图与失效、窗口与预热换算；相关 Server 定向测试。
  - 不包含：新增 Provider 或路由、改变日线事实治理、新增数据库 migration、指标公式。
  - 完成条件：派生能力仅在 `DAILY_BAR` 可用且 calendar fact 可用时声明，否则带 reason 降级；`barsLimit` 表示所选周期条数；「可见窗口 + 预热窗口」换算后的日线输入不超上限，超限返回可解释参数错误；派生视图 key 含周期、基础段 identity、规则版本与 calendar revision，基础事实或日历变化时失效；跨周期页不得合并；`hasMoreBefore` 按桶边界判断。
  - 验证方式：Server 定向测试覆盖能力声明、降级 reason、缓存 key 与失效、超限报错、桶边界 `hasMoreBefore`、跨周期隔离；Server typecheck/build。

- [ ] T4：DSA 在周期序列上计算指标并声明预热
  - 覆盖验收标准：AC4
  - 依赖：T1
  - 涉及范围：DSA 既有指标计算适配层、Contract 声明与直接测试/文档；主仓不复制实现。
  - 不包含：在 DSA 内做周期聚合（聚合属主仓 Domain）、改变既有日线计算路径。
  - 完成条件：指标以传入的周期序列为输入计算，参数与公式不变；预留热不足返回 null 而不是插值；输入超过上限时返回可解释错误；旧日线调用行为不变。
  - 验证方式：DSA 定向 pytest（周期输入、预热 null、超限报错、旧路径回归）、Python 编译检查；记录 DSA HEAD。

- [ ] T5：Desktop 周期语义组、偏好正交与页隔离
  - 覆盖验收标准：AC6、AC7、AC8、AC9、AC11
  - 依赖：T1、T3、T4
  - 涉及范围：`apps/desktop/src/features/market-detail/` 的工具栏、请求装配、偏好持久化、ChartPoint 页构建与直接测试。
  - 不包含：聚合实现、指标计算、NAV 图表行为、全局 CSS。
  - 完成条件：新增「周期」语义组且只渲染真实可用周期；周期与区间偏好正交并进入请求 key、缓存失效与乱序保护；切换周期清空视口与页集合、不保留上一周期 bars、不请求整段日线做客户端聚合；口径区显示周期与「派生」来源；不可用周期回退 `1d` 并提示；读数分组、右轴末值、稳定槽位、拖动分页、实时概览隔离不回归。
  - 验证方式：Desktop 定向组件测试（可用周期渲染、偏好正交、页集合隔离、来源文案、回退提示）、既有 market-detail 套件不回归、Desktop typecheck 与目标 ESLint。

- [ ] T6：完成包级检查与仓库门禁
  - 覆盖验收标准：AC10
  - 依赖：T1–T5
  - 涉及范围：受影响 packages/apps、边界与文件尺寸脚本、锁文件（如新增依赖）。
  - 不包含：数据库 migration、Provider 配置变更。
  - 完成条件：Schema/Domain/API Client/Server/DSA/Desktop 定向测试通过；typecheck/build/lint、`node scripts/check-boundaries.mjs`、文件尺寸 ratchet 与 `git diff --check` 通过；无新增未解释告警。
  - 验证方式：按验证阶梯执行并记录失败详情、既有告警与命令原文。

- [ ] G1：真实运行态与浏览器验收
  - 覆盖验收标准：AC2、AC3、AC6、AC7、AC8、AC10
  - 依赖：T6；Server/DSA 运行版本与 T1 契约一致
  - 涉及范围：隔离本地运行环境、Desktop 图表页、浏览器工具与 Network 证据。
  - 完成条件：四种周期均可切换并真实请求到对应 `timeframe`；派生来源文案可见；切周期后读数、右轴、涨跌幅、分页与拖动加载语义正确；1 年线在指标不可得时的空值语义正确；基金不出现周期选项；陈旧/空/不可用状态可解释；记录 revision、Contract 版本、截图与控制台结果。
  - 验证方式：浏览器检查 DOM/Network/交互/截图；在线 Provider smoke 单独标为观测证据，不用受控 fixture 代替。运行态不可用时保持未勾选并记录阻塞原因。

- [ ] P1：周期切换性能门禁
  - 覆盖验收标准：AC11
  - 依赖：T5
  - 涉及范围：Desktop 生产构建页面与浏览器性能记录。
  - 完成条件：500 点负载下周期切换不出现 >200ms 主线程长任务；切换只发出新周期的窗口请求，Network 中不存在「拉全量日线在客户端聚合」的调用；记录设备、浏览器、构建 revision 与采样方法。
  - 验证方式：浏览器 Performance 面板或等价受控测量。

- [ ] R1：最终一致性 Review
  - 覆盖验收标准：AC1–AC11
  - 依赖：T6、G1、P1
  - 涉及范围：本 Spec/Task、Contract、Domain/Server/DSA/Desktop 变更与验证证据。
  - 完成条件：逐项核对契约、桶边界、派生标识、预热与窗口、缓存失效、兼容性、非目标与证据边界；未通过门禁保持未勾选。
  - 验证方式：使用本文件唯一的最终一致性 Review 清单；不提交、不推送。

## 验收映射

| AC / 断言 | 实现责任任务 | 验证责任任务或门禁 |
| --- | --- | --- |
| AC1 / 四周期确定性聚合 | T2 | T2；T6 |
| AC2 / 派生能力声明与 provenance | T1、T3 | T3；G1 |
| AC3 / 契约兼容与结构化错误 | T1、T3 | T1；T3；G1 |
| AC4 / 周期序列上的指标与预热 | T1、T4 | T4；G1 |
| AC5 / 窗口、预热换算与桶边界覆盖 | T2、T3 | T2；T3 |
| AC6 / Desktop 周期组与偏好正交 | T5 | T5；G1 |
| AC7 / 实时概览与图表语义不回归 | T5 | T5；G1 |
| AC8 / 来源披露与基金隔离 | T3、T5 | T5；G1 |
| AC9 / 跨周期页隔离与请求 key | T3、T5 | T3；T5 |
| AC10 / 工程门禁与运行态证据 | T6 | T6；G1；R1 |
| AC11 / 周期切换性能与请求形态 | T5 | P1；R1 |

## 依赖与证据边界

- T1 是唯一跨仓契约任务；T2–T5 只能依赖其冻结字段，不得自行发明周期标识或聚合规则。
- T2 的 golden test 只证明聚合规则；不证明交易日历完整性，日历 fact 缺失时必须走降级路径。
- T6 通过只证明代码、契约与确定性测试；不证明在线 Provider 可用、Docker 镜像或浏览器 Network。
- G1 必须使用与 T1/T6 对应的主仓与 DSA revision；旧镜像或 stale 派生视图只能作为环境阻塞记录。
- 分钟线、交易标记、成本线、风险线与测量不在本任务范围。
- 分页锚点既有缺陷（`calculationAnchor` 未进入 Server、`loadEarlier` 传序列末尾日期）按 Spec 的绑定要求独立修复并单独留证。

## 当前执行记录

- 2026-09-16：按用户反馈完成 Spec/Task 立项。范围限定为 `5d / 1w / 1mo / 1y` 派生周期；分钟线只记录事实与前置条件，不进入实施。规划结论：桶边界、派生位置（Domain + Server 声明，不新增事实表）、指标可得性与兼容策略均有单一实现责任与对应验证，无 Blocking 问题；未开始 T1。

## 最终一致性 Review

- [ ] Spec 的全部验收断言均有明确实现与适当验证
- [ ] 所有已勾选任务满足自身完成条件且证据仍有效
- [ ] 必要集成、真实运行态与条件性门禁均已通过或有合法不适用依据
- [ ] 启动依赖、验收依赖与契约就绪证据正确且无循环
- [ ] 跨任务接口、类型、状态、时间、错误与副作用语义一致
- [ ] 不存在未解决的 Blocking 问题、占位要求或未定义契约
- [ ] 实现未超出 Spec 范围，未把可选设施变成强制要求
- [ ] 派生周期未被写成事实、未被伪装为 Provider 原生周期
- [ ] 证据类型、场景覆盖、代码版本与目标环境支持所声明的验收结果
- [ ] 测试、配置、文档、Spec/Task 状态与实际实现一致
- [ ] 必要实施 Step 已验证；提交处理符合授权且保留既有用户修改
- [ ] 未发现未处理的实现、Spec、任务或验收证据不一致
