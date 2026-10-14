# Portfolio 快照与当前产品验收

> 2026-10-15 当前责任：本页统一持有快照 R3、估值走势、每日摘要和收益指标的剩余验收。各节按原 Spec、编号和证据独立闭合；合并文档不代表任一条件通过。下文原快照 Review 仅证明其当时本地范围。

> 状态对账（2026-10-03）：已实现待验收：旧“Docker 仍是旧镜像”描述已过期，当前镜像/结构见多源后继 P01/P02；本任务三个受管任务的可见、立即执行、幂等 provision 和点位质量仍需运行证据。隔离恢复成功及估值 API 空响应不证明这些行为，AC6 等义务保留在本文。 本段为当前对账结论；下文历史时点的环境与协议描述仅在其原范围有效。对账依据见[本轮 Review](../archive/reviews/2026-10-03-task-state-reconciliation.md)。

对应 Spec：[`../specs/2026-08-28-portfolio-snapshot-system.md`](../specs/2026-08-28-portfolio-snapshot-system.md)

## 执行约束

- 先扩展 Snapshot V2 契约和 fresh baseline，再迁移消费者，最后收缩旧接口。
- 已勾选任务必须附当前工作树的验证证据；历史绿灯不能替代本次验证。
- 不清理或覆盖用户现有未提交改动。

## 任务

- [x] T1：建立 Snapshot V2 不可变修订模型
  - 覆盖验收标准：AC2、AC3、AC4、AC5、AC8
  - 依赖：无
  - 涉及范围：Prisma Schema、fresh baseline、Snapshot 领域类型与服务。
  - 完成条件：逻辑槽位、revision、替代链、幂等键、覆盖率和质量状态均有数据库约束；创建与校准保持不可变并发安全。
  - 验证方式：Prisma validate、数据库约束测试、Snapshot Service 集成测试、`git diff --check`。

- [x] T2：收缩公开接口并迁移 Performance 消费者
  - 覆盖验收标准：AC1、AC4、AC7、AC9
  - 依赖：T1
  - 涉及范围：Performance Controller/Service、Schemas、Desktop API、兼容 history/summary。
  - 完成条件：公开创建 API 和 MANUAL 契约不存在；默认查询只消费当前有效 DAILY_CLOSE 槽位；详情保留修订链；兼容接口继续工作。
  - 验证方式：Server API 测试、Performance 正确性测试、Desktop 类型检查和入口回归测试。

- [x] T3：提供三个受管估值自动化任务
  - 覆盖验收标准：AC3、AC6、AC7、AC10
  - 依赖：T1
  - 涉及范围：Automation Schema、baseline provision、Runtime Handler、`CN/HK/US` 交易日历与交易时段门禁、持仓市场识别、自动化中心。
  - 完成条件：三个 systemKey 幂等存在；可启停、改计划、立即运行和查看历史；不能改类型或删除；自动盘中采样只处理至少一个实际持仓市场处于常规交易时段的账户，整批无符合条件账户时不创建运行历史；立即运行绕过市场门禁；运行使用确定性业务幂等键。
  - 验证方式：Automation Runtime/Service 测试、交易日历时区与边界测试、估值采样账户过滤测试、Desktop 自动化 UI 测试。
  - 验证证据（2026-09-09）：
    - `pnpm --filter @thesis-ledger/server test`：51 个测试文件、425 项测试通过。
    - `pnpm --filter @thesis-ledger/server exec vitest run test/automation-market-gate.test.ts test/performance/valuation-series.test.ts`：2 个测试文件、11 项测试通过。
    - 只读运行库核对：事发时刻开放市场为 `US`，当前 actual 正数持仓中的 `US` 标的数为 0；新门禁应在创建运行历史前跳过。

- [x] T4：完成 Snapshot V2 一致性验证与文档同步
  - 覆盖验收标准：AC1–AC10
  - 依赖：T2、T3
  - 涉及范围：Snapshot/Performance/Automation 回归、边界门禁、相关领域文档。
  - 完成条件：全部 AC 有实现和证据；当前现状文档与 V2 状态无冲突；没有占位或未定义契约。
  - 验证方式：Server 测试、Desktop 测试、类型检查、边界检查、Prettier、`git diff --check`。
  - 验证证据（2026-09-09）：
    - `pnpm typecheck`：全工作区构建和类型检查通过；Desktop 构建仅有既有 chunk-size 提示。
    - `pnpm --filter @thesis-ledger/domain test`：9 个测试文件、106 项测试通过。
    - 目标文件 ESLint、Prettier、模块边界、文件尺寸 ratchet 与 `git diff --check` 通过；文件尺寸检查仅报告既有存量警告。

## 当前运行时验收拆分（2026-10-04）

原 T1–T4 的确定性实现证据保留，产品验收按以下依赖前沿继续，不以旧最终 Review 代替运行时条件。

- [x] R1：真实隔离 PostgreSQL 验证受管 provision、调度门禁和快照修订竞争。
  - 输入：原 Spec AC2–AC6、AC7、AC10；现行 Automation、Snapshot、估值服务与全部 migration。
  - 写入范围：本任务、专用隔离测试及入口；只在新建临时数据库写入固定经济输入。
  - 验证：三个 systemKey 幂等且配置保留；计划执行与立即运行；无合格市场账户时无历史/点位；分钟唯一键；相同证据竞争、正式替代及日终去重。
  - 边界：行情固定输入仅验证领域和存储，不代表在线 Provider；不写目标旧验收事实。
- [x] R2：目标 Scheduler、受管任务及真实点位闭环。
  - 依赖：R1；目标结构/代码核对通过。
  - 验证：任务可见、三个立即运行结果可追溯；真实 Scheduler 跳过关闭市场；启停与计划设置安全恢复；点位质量和兼容 history/summary；目标账户事实保持不变。
  - 运行策略：现有专用验收账户只读复用；新增数据必须明确标记验收。不得重写旧 Ledger、计划及发生记录。
- [ ] R3：自动化中心消费与最终验收对账。
  - 依赖：R2；与组合走势 T4 的浏览器验收共用同一目标运行态。
  - 验证：启停、计划、运行、历史和受管保护；逐项核对原 AC，不遗漏外部来源与交易日历边界。
  - 当前结果：受管 UI 运行、历史与配置恢复通过；目标正式校准因现行行情/NAV 输入缺失保持待补齐，最终门禁仍开放。[本轮证据](evidence/2026-10-04-portfolio-valuation-runtime.md)记录隔离库 8 项与目标实际边界。

## 最终一致性 Review

- [x] Spec 中的全部验收标准均有对应实现
- [x] 所有已勾选任务均有验证证据
- [x] 所有任务依赖均已满足且无错误阻塞关系
- [x] 跨任务接口、类型和命名保持一致
- [x] 不存在未解决的 Blocking 问题、占位描述或未定义的实现契约
- [x] 实现未超出 Spec 声明的范围
- [x] 测试策略、测试实现与验证结果一致
- [x] 测试与文档已同步更新
- [x] 必要实施 Step 均已验证，并记录未提交状态
- [x] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

- 结论：Snapshot V2 的修订模型、公开接口收缩与三个受管自动化任务已完成；盘中估值已按账户实际持仓识别 `CN/HK/US` 市场并通过当前工作树验证。
- 发现的问题：原实现只判断 A 股交易日，未判断交易时段，也未按持仓市场过滤账户；本轮已修复并新增独立回归测试。
- 遗留风险：交易日历静态覆盖 2025–2026，后续年度需按交易所公告更新；当前 Docker Server 仍是旧镜像，尚未在不混入其他未提交改动的前提下重建运行态。历史错误采样记录保持不变。
- 验证命令与结果：Server 51 个文件、425 项测试和 Domain 9 个文件、106 项测试通过；全工作区构建/typecheck、目标文件 ESLint/Prettier、模块边界、文件尺寸 ratchet 与 `git diff --check` 通过。

<a id="portfolio-series-acceptance"></a>
## 估值走势剩余验收

对应 [原 Spec](../specs/2026-09-07-portfolio-valuation-series.md)与 [原实施记录](../archive/tasks/2026-09-07-portfolio-valuation-series.md)。本节 T/G/AC 编号仅属于该原任务；其已完成代码和定向证据不重做，所有下列未勾选条件保持开放。 以下“当前结果/证据”的最近记录日期为 2026-10-04，只复用其明确场景，不推断今天仍缺设备或来源，也不把新来源资格当作 Portfolio 点位/交互验收。

- [ ] T4：交付 Desktop 周期控件和坐标 Tooltip
  - 覆盖验收标准：AC4、AC6、AC7、AC8
  - 依赖：T3
  - 涉及范围：TanStack Query、区间/粒度控件、SVG 时间坐标、十字光标、Tooltip、键盘与触屏交互。
  - 完成条件：不可用粒度禁用且自动回退；鼠标、键盘和触屏均能选择最近点；Tooltip 完整展示时间、金额、状态、覆盖率和质量。
  - 验证方式：Desktop 组件测试、类型检查、真实浏览器宽窄屏与交互验收。

- [ ] T5：完成跨仓库一致性 Review
  - 覆盖验收标准：AC1–AC9
  - 依赖：T1、T2、T3、T4
  - 涉及范围：DSA、Server、Desktop、Spec/Task、边界与外部证据。
  - 完成条件：全部 AC 有当前证据；无命名和口径漂移；外部 Provider 阻塞没有被误报为完成。
  - 验证方式：目标测试集、类型检查、边界检查、Prettier、`git diff --check` 和浏览器验收。

- [ ] T4.I1：修复区间切换的粒度保留、SVG 实际坐标吸附与点位更换后的激活状态。
  - 原 AC6/AC7 的行为收敛；写集限定为走势控件、图表与专用浏览器测试入口。
  - 验证：兼容粒度保留，不兼容时按矩阵回退；宽窄屏真实 SVG 坐标命中；密集、稀疏、跨日与列表缩短；键盘和真实浏览器触屏事件。
  - 当前结果：实现、宽窄屏鼠标/键盘与状态矩阵通过；In-app Browser 不支持触屏事件，真实触屏门禁未关闭。

- [ ] T4.I2：目标真实点位交互与来源阻塞对账。
  - 依赖：快照任务 R2 与 T4.I1；固定浏览器输入仅用于补充状态矩阵，不冒充目标历史。
  - 验证：目标点位的时间、金额、估值口径、覆盖率、质量；自动化历史；原 AC1–AC9 的有效证据和外部输入缺口。
  - 当前实测：三个受管任务立即执行已生成点位和快照，定价覆盖 0；现行 Quote/NAV 来源不可用，正式校准保持待补齐。具体来源输入已向用户提出，独立实现继续。
  - 当前证据：[运行时记录](evidence/2026-10-04-portfolio-valuation-runtime.md)。目标分钟点/日级点已分别显示 LOW_COVERAGE/UNAVAILABLE；旧空点位与未见受管任务的描述仅保留为历史记录。来源、触屏及全部 AC 对账仍开放。

- [ ] Spec 中的全部验收标准均有对应实现

- [ ] 所有已勾选任务均有验证证据

- [ ] 所有任务依赖均已满足且无错误阻塞关系

- [ ] 跨任务接口、类型和命名保持一致

- [ ] 不存在未解决的 Blocking 问题、占位描述或未定义的实现契约

- [ ] 实现未超出 Spec 声明的范围

- [ ] 未发现实现、Spec 与任务文档之间的不一致

<a id="portfolio-summary-acceptance"></a>
## 每日摘要与详情窄屏验收

对应 [原 Spec](../specs/2026-09-09-portfolio-daily-summary.md)与 [原实施记录](../archive/tasks/2026-09-09-portfolio-daily-summary.md)。本节 T/G/AC 编号仅属于该原任务；其已完成代码和定向证据不重做，所有下列未勾选条件保持开放。 以下“当前结果/证据”的最近记录日期为 2026-10-04，只复用其明确场景，不推断今天仍缺设备或来源，也不把新来源资格当作 Portfolio 点位/交互验收。

- [ ] T3：完成本地页面视觉与交互验收
  - 覆盖验收标准：AC6
  - 依赖：T2
  - 涉及范围：真实本地 Desktop 页面宽屏、窄屏、浅色、深色，以及刷新和行情详情入口。
  - 完成条件：首屏层级清晰；窄屏表格可读且可横向访问；双主题对比度与正负值语义一致；控制台无本次修改引入的错误。
  - 验证方式：浏览器 DOM、截图、交互和控制台检查。
  - 当前证据：真实本地数据下已完成 1280×720 宽屏、浅色与深色主题检查；“行情详情”可打开；浏览器控制台无 warning/error。内置浏览器在设置 768×900 后页面 `innerWidth` 仍固定为 1280，未形成独立窄屏尺寸证据，因此本任务暂不勾选。

- [ ] T4：重构持仓行情详情的信息密度与图表表达
  - 覆盖验收标准：AC7、AC8、AC9
  - 依赖：T2
  - 涉及范围：Desktop `MarketDetailDialog`、行情详情区块、复用的图表原语及对应组件测试。
  - 完成条件：详情使用固定标题区和标准关闭按钮；最近日线与技术指标以可访问图表展示；加载、空态和 Provider 来源语义保持不变；正文使用单一滚动容器且整体间距收紧。
  - 验证方式：Desktop 定向组件测试、类型检查、构建、受影响文件静态检查，以及本地页面宽屏、窄屏、浅色、深色与关闭交互检查。
  - 当前证据：实现已完成。Desktop 行情详情 3 项测试通过，Desktop typecheck/build、定向 ESLint、依赖边界和文件尺寸 ratchet 通过；真实 1280×720 页面已确认摘要可见、最近日线折线与日内高低范围可见、MA/MACD/RSI 数据条可见、浅色与深色主题正常，标准关闭按钮固定在弹窗头部。内置浏览器无法切换真实 CSS 窄屏视口，因此 AC9 的窄屏证据仍待补，本任务暂不勾选。

- [ ] Spec 中的全部验收标准均有对应实现；AC1 至 AC5、AC7、AC8 已完成，AC6 与 AC9 的窄屏证据待补

- [ ] 必要实施 Step 均已验证；窄屏视觉证据待补，本次未获提交授权，工作保持未提交

<a id="portfolio-pnl-acceptance"></a>
## 收益指标运行时验收

对应 [原 Spec](../specs/2026-09-09-portfolio-pnl-metrics.md)与 [原实施记录](../archive/tasks/2026-09-09-portfolio-pnl-metrics.md)。本节 T/G/AC 编号仅属于该原任务；其已完成代码和定向证据不重做，所有下列未勾选条件保持开放。 以下“当前结果/证据”的最近记录日期为 2026-10-04，只复用其明确场景，不推断今天仍缺设备或来源，也不把新来源资格当作 Portfolio 点位/交互验收。

- [ ] G1：按原 Spec 的运行时状态核对当前 API 与浏览器收益字段、真实 Trade Close Slice 和缺失降级；复用现有合法数据，真实 FX 来源及账户/模式证据不足时保留准确原因。T1–T3 的既有确定性证据不重跑，不能用健康或空结果替代。
  - 2026-10-04 目标 HTTP 与浏览器：实际组合无卖出，`realizedPnl=0`；两持仓缺行情导致 `unrealizedPnl=null`、`cumulativePnl=null`；`dailyChange.basis=PREVIOUS_CLOSE_CURRENT_HOLDINGS`，金额/收益率均为 null，并列出 600519.SH、161725.OF。四宫格与“未实现盈亏”列可见，已实现显示真实 ¥0.00，累计保持不可用。
  - 真实 Trade 查询确认证券验收账户为 ACTIVE、closedQuantity=0、remainingQuantity=3、净实现为 0，projectionGeneration=16。未新增或改写旧交易事实。部分/全部/多次卖出的目标样本和外部 FX 仍不足，G1 保持开放。
