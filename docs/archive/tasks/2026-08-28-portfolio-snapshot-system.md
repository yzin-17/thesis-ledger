# Portfolio 快照与当前产品验收

<a id="priority"></a>
> 排期（2026-10-18）：**P1｜基金校准和剩余事实门禁**。从 R3/T4.I2 的合格基金 NAV、披露和日历差集接续，不重做股票校准或触屏。IR03～IR06 的 TTWROR/XIRR/再平衡/目标保存由 [P0 修复 Task](2026-10-18-performance-correctness.md)单独负责，原收益 G1 不覆盖这些新问题。
> [全局优先级与接续规则](../../tasks/README.md#priority-policy)。本次仅调整文档，不改变下列原任务编号、checkbox、验收条件或执行授权。

> 2026-10-21 最终验收：R3.I1～I11、自动化中心、股票/基金正式校准、qfq 分钟及误差测量均完成；原 Snapshot 十项与走势九项 AC 逐条通过，见[最终对账](../../tasks/evidence/2026-10-21-portfolio-final-acceptance.md)。以下日期段落保留当时范围，不能继续把已解除的基金来源缺口列为当前阻塞。其他 Task 的历史上市事实/日历、未开放入口及模型暂停边界独立保留。

> 2026-10-15 当时责任：本页统一持有快照 R3、估值走势、每日摘要和收益指标的剩余验收。各节按原 Spec、编号和证据独立闭合；合并文档不代表任一条件通过。下文原快照 Review 仅证明其当时本地范围。

> 2026-10-17 当前进展：每日摘要、收益指标 G1 和 Safari 真实 `touch` 已通过，见[原补验](../../tasks/evidence/2026-10-17-portfolio-pnl-directory-consumers.md)。股票正式校准、两个实际分钟点及 23 个支持的区间/粒度读取组合已通过，空序列质量误报已修复，见[实际点位补验](../../tasks/evidence/2026-10-17-ui-runtime-closeout.md#实际点位补验与空序列质量)。这仅证明现存股票点位，基金 NAV/披露、基金正式校准与其余日历/事实边界仍开放；不要求补造多年历史。

> 原[10-03 对账](../reviews/2026-10-03-task-state-reconciliation.md)之后，受管 provision、立即运行和目标点位已由 R1/R2 补证；走势触屏与收益指标已补齐，仍开放 R3 最终校准/覆盖。旧“Docker 仍是旧镜像”和“所有来源不可用”不能直接作为今天的阻塞。

对应 Spec：[`../specs/2026-08-28-portfolio-snapshot-system.md`](../../specs/2026-08-28-portfolio-snapshot-system.md)

## 执行约束

- 先扩展 Snapshot V2 契约和 fresh baseline，再迁移消费者，最后收缩旧接口。
- 已勾选任务必须附当前工作树的验证证据；历史绿灯不能替代本次验证。
- 不清理或覆盖用户现有未提交改动。

## 当前执行叶（2026-10-17）

- [x] R3.I5：空点位集合统一为 `UNAVAILABLE`、`historyStart=null`，不补零。空分钟和模拟日级回归先失败后通过，最终 Docker 公开 API 已核对模式隔离与真实有点账户。[回执](../../tasks/evidence/2026-10-17-ui-runtime-closeout.md#实际点位补验与空序列质量)。

- [x] **R3.I6：当前 V3 基金 NAV 实源读取**。获准临时绑定 `efinance/eastmoney` 两项后，`161725.OF` 当前净值 0.5406 与 2026-10-12～16 五点均取得；当前和历史均未命中缓存或备用。原脚本将历史日期年龄 stale 误拒绝，修正后只复核本次 Redis/持久化留存，不重发来源请求，保留原错误退出事实。最终 11 项防护回归通过；原 16 条路由恢复、政策 154→155→156，业务保护摘要与来源配置状态相等。该叶不关闭披露/正式校准/走势业务，见[实源验收](../../tasks/evidence/2026-10-20-fund-nav-source-acceptance.md)。

- [x] **R3.I7：基金不可用及零净值的校准保护**。合法 V3 的 `unavailable`/零值已先失败复现并修复，当前及正式基金定价均要求有限正数和 delayed。59 项包级及 12 项实际 PostgreSQL 检查通过，原估算不变、缺价不追加正式修订，合格合成基金沿冻结份额/成本/现金校准并幂等。正式快更后两个容器编译摘要、受控拒绝分支及原业务/配置/路由保护核对通过，[证据](../../tasks/evidence/2026-10-20-fund-valuation-availability.md)。未写目标估值槽位，不替代实源正向父门禁。

- [x] **R3.I8：基金实源正式校准与 Web 日级消费**。见[实源校准及目录复核](../../tasks/evidence/2026-10-21-fund-calibration-acceptance.md)。
  - 2026-10-21 授权更新：用户允许本次及后续所有验收且不再逐项确认；保留原数据、只验 Web、真实模型暂停和 DG3 TODO。按具体维护预案执行并核对恢复，不将该授权扩为永久开启来源或产品功能。
  - [x] I8a：默认只读维护入口和所有权/保留/失败恢复防护已准备；19 项定向检查、语法/格式/边界/尺寸检查通过，实际只读计划登记了新账户、资产确认、正常 Ledger 记账、自有槽位、最多 4 次 Server 基金数据读取和两条临时路由。目标未新增写入；[精确预案及授权差集](../../tasks/evidence/2026-10-21-fund-calibration-plan.md)。
  - [x] I8b：按本次及后续验收授权执行，原 8 个账户不接管，`161725.OF` 正常确认身份及关联；新建专用基金账户，正常 Ledger 记账。两条临时路由恢复为原 16 条，政策 156→157→158，Provider/凭据/模型不改。
  - [x] I8c：实源 0.5406、冻结份额 100/现金 875/成本 125，估算与正式均为 929.06，revision 1→2、重复同 ID、旧估算不变；Web 正式日线/覆盖率可见，原偏好已恢复，新账户结清停用。严格收尾因既有目录后台刷新失败；保留原失败，独立只读核对第 12/13 代、23 项增量和全活动目录 checksum，通过业务及目录复核，13 张原表/57 个 V3 结果不变。基金披露、分钟及其余日历条件继续开放，不整体关闭 R3/T4。

- [x] **R3.I9：基金盘中缺价的消费保护**。合法 V3 零价被计为跌至零及成功覆盖已失败复现并修复；无效 NAV 锚点不再计算调整或请求底层证券，披露权重保留不放大。16 项定向、Performance 66 项及类型/构建通过；正式快更后两个容器实际编译摘要、纯函数拒绝分支、13 张保护表/57 个 V3 结果/来源与模型计数及 Web 原成交只读核对通过。[证据](../../tasks/evidence/2026-10-21-fund-minute-and-rule-contract.md)。没有写目标基金分钟点，不替代披露来源和分钟正向父门禁。

- [x] **R3.I10：当前真实披露日期输入的合格接续**。精确日期保持未知，DATE_ONLY 原文证据与保守可用边界分开；真实 akshare/eastmoney 74 项逐项匹配、94.77% 原权重，经实际消费类生成两个当前维护分钟，Web 显示估算/金额/覆盖率/质量。账户结清停用、政策恢复至 160、旧数据严格保护通过；原日期 400 与 BigInt 回执失败及有限恢复完整保留。[来源/消费归档任务](2026-10-21-fund-disclosure-date-evidence.md)、[实源及 Web 证据](../../tasks/evidence/2026-10-21-fund-disclosure-acceptance.md)。未冒称开市调度或全历史 PIT，其他日历/事实继续核对。

- [x] **R3.I11：基金分钟复权价格口径**。已按[复权子任务](2026-10-21-fund-adjusted-returns.md)先复现再修复同序列 qfq；42 项定向、目标四模块及真实点 5/6、Web 通过。跨日实源误差 0.02344315%，独立复算一致；原 Snapshot/走势共 19 项 AC 对账通过。旧原价点与失败证据不改写。

- [x] R3.I4：维护脚本仅对登记验收账户生成两个当前股票分钟点，总资产均为 9,973、覆盖率 100%、质量 `COMPLETE`；23 个支持的区间/粒度读取和实际分钟/正式日级 Tooltip、键盘、双主题三视口通过。账户已清仓、取回验收现金并可恢复停用；原账户点位未变。基金条件仍开放。[回执](../../tasks/evidence/2026-10-17-ui-runtime-closeout.md#实际点位补验与空序列质量)。

- [x] R3.I1：正式校准冻结数量、成本、原币现金和账户范围，缺失旧输入拒绝；相同证据幂等，更正证据追加。`performance-snapshot-inputs.ts` 持有输入和证据版本，八项回归通过；旧估算后发生买卖及账户停用不再改变校准经济输入。
- [x] R3.I2：现有 `scripts/test-portfolio-valuation-postgres.mjs` 隔离入口九项通过，覆盖原估算不可变、修订链、八路竞争幂等、更正追加和默认读模型；33 份 migration 全部应用，临时容器已清理。没有写目标旧槽位。
- [x] R3.I3：通过维护入口同步及 `scripts/portfolio-calibration-acceptance.mjs --run` 完成自有股票槽位验收。`600000.SH`、2026-10-16 原始收盘 9.73；估算后清仓停用，再校准仍为 100 股、现金 9,000、成本 1,000，总资产 9,973；正式修订为 2，重复读取复用同一 ID，旧估算逐字段不变。只对登记账户执行精确校准，原七表及 54 份结果对账通过。[当前回执与边界](../../tasks/evidence/2026-10-17-ui-runtime-closeout.md#股票正式校准与-risk-正向消费)。基金 NAV、其他日历/上市事实窗口继续保留，R3 不整体关闭。

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
- [x] R3：自动化中心消费与最终验收对账。
  - 依赖：R2；与组合走势 T4 的浏览器验收共用同一目标运行态。
  - 验证：启停、计划、运行、历史和受管保护；逐项核对原 AC，不遗漏外部来源与交易日历边界。
  - 已完成：受管 UI 运行、历史与配置恢复通过。[10-04 证据](../../tasks/evidence/2026-10-04-portfolio-valuation-runtime.md)保留原隔离八项及当时来源缺口；R3.I1～I10 已补冻结输入、更正/竞争、股票/基金实源正式校准及误差、当前实际点位、披露日期资格和缺价保护。基金日线、复权维护分钟/Web 及跨日误差均通过；[最终对账](../../tasks/evidence/2026-10-21-portfolio-final-acceptance.md)覆盖原十项 AC，保留静态日历支持年限，维护运行不冒称开市自动调度。

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
- 遗留风险：交易日历静态覆盖 2025–2026，后续年度需按交易所公告更新。原验收时 Docker Server 旧镜像的限制已由[10-17 正式恢复](../../tasks/evidence/2026-10-17-ui-runtime-closeout.md#环境恢复)解除；该时点的基金输入/校准缺口已由 10-21 实源及最终对账补齐；其他主题的历史事实资格不在本任务关闭，历史错误采样记录不改写。
- 验证命令与结果：Server 51 个文件、425 项测试和 Domain 9 个文件、106 项测试通过；全工作区构建/typecheck、目标文件 ESLint/Prettier、模块边界、文件尺寸 ratchet 与 `git diff --check` 通过。

<a id="portfolio-series-acceptance"></a>
## 估值走势剩余验收

对应 [原 Spec](../../specs/2026-09-07-portfolio-valuation-series.md)与 [原实施记录](2026-09-07-portfolio-valuation-series.md)。本节 T/G/AC 编号仅属于该原任务；T4.I1 的代码、宽窄屏鼠标/键盘及 10-17 Safari 真实触屏已通过，不重做这些交互。下列未勾选条件只保留目标历史点位与来源/校准等尚缺部分；不把新来源资格当作 Portfolio 点位验收。

- [x] T4：交付 Desktop 周期控件和坐标 Tooltip
  - 覆盖验收标准：AC4、AC6、AC7、AC8
  - 依赖：T3
  - 涉及范围：TanStack Query、区间/粒度控件、SVG 时间坐标、十字光标、Tooltip、键盘与触屏交互。
  - 完成条件：不可用粒度禁用且自动回退；鼠标、键盘和触屏均能选择最近点；Tooltip 完整展示时间、金额、状态、覆盖率和质量。
  - 验证方式：Desktop 组件测试、类型检查、真实浏览器宽窄屏与交互验收。

- [x] T5：完成跨仓库一致性 Review
  - 覆盖验收标准：AC1–AC9
  - 依赖：T1、T2、T3、T4
  - 涉及范围：DSA、Server、Desktop、Spec/Task、边界与外部证据。
  - 完成条件：全部 AC 有当前证据；无命名和口径漂移；外部 Provider 阻塞没有被误报为完成。
  - 验证方式：目标测试集、类型检查、边界检查、Prettier、`git diff --check` 和浏览器验收。

- [x] T4.I1：粒度保留、SVG 实际坐标吸附、点位更换后的激活状态及真实触屏验收。
  - 原 AC6/AC7 的行为收敛；写集限定为走势控件、图表与专用浏览器测试入口。
  - 验证：兼容粒度保留，不兼容时按矩阵回退；宽窄屏真实 SVG 坐标命中；密集、稀疏、跨日与列表缩短；键盘和真实浏览器触屏事件。
  - 已完成证据：[2026-10-04 运行记录](../../tasks/evidence/2026-10-04-portfolio-valuation-runtime.md#浏览器与应用检查)证明兼容/不兼容粒度、稀疏/密集点位、真实 SVG 坐标、切换数据清除激活，以及宽窄屏鼠标/键盘通过；这些不再列为待实现或待重跑。
  - 10-17 触屏补证：iPhone 17 Pro / iOS 26.5 Safari 实际收到 `pointerType=touch`；稀疏跨日、2,000 分钟点、低覆盖、单点和空态均核对点击与 Tooltip。见[当前证据](../../tasks/evidence/2026-10-17-portfolio-pnl-directory-consumers.md#safari-触屏)。固定输入不充作目标历史，R3/T4.I2/AC9 仍开放。

- [x] T4.I2：目标真实点位交互与来源阻塞对账。
  - 依赖：快照任务 R2 与已完成的 T4.I1；代码、鼠标/键盘和触屏不重做。固定浏览器输入仅用于补充状态矩阵，不冒充目标历史；目标点位/来源仍单独对账。
  - 验证：目标点位的时间、金额、估值口径、覆盖率、质量；自动化历史；原 AC1–AC9 的有效证据和外部输入缺口。
  - 10-04 历史实测：[运行时记录](../../tasks/evidence/2026-10-04-portfolio-valuation-runtime.md)中的零覆盖及来源失败仅说明当时条件，不作为今天的全局阻塞。
  - 当前证据：[股票点位补验](../../tasks/evidence/2026-10-17-ui-runtime-closeout.md#实际点位补验与空序列质量)已覆盖实际分钟点、正式日级点和全部支持的区间/粒度读取；[基金日级校准](../../tasks/evidence/2026-10-21-fund-calibration-acceptance.md)及[真实披露/维护分钟](../../tasks/evidence/2026-10-21-fund-disclosure-acceptance.md)补齐该基金输入、误差、口径、覆盖率和 Web 展示。触屏、已过交互和校准不重做；[qfq/误差](../../tasks/evidence/2026-10-21-fund-adjusted-returns.md)及[最终 AC 对账](../../tasks/evidence/2026-10-21-portfolio-final-acceptance.md)已补齐，不沿用已解除的基金来源阻塞。长区间只显示现存历史符合 AC8，不要求伪造多年覆盖。

- [x] Spec 中的全部验收标准均有对应实现

- [x] 所有已勾选任务均有验证证据

- [x] 所有任务依赖均已满足且无错误阻塞关系

- [x] 跨任务接口、类型和命名保持一致

- [x] 不存在未解决的 Blocking 问题、占位描述或未定义的实现契约

- [x] 实现未超出 Spec 声明的范围

- [x] 未发现实现、Spec 与任务文档之间的不一致

<a id="portfolio-summary-acceptance"></a>
## 每日摘要与详情窄屏验收

对应 [原 Spec](../../specs/2026-09-09-portfolio-daily-summary.md)与 [原实施记录](2026-09-09-portfolio-daily-summary.md)。本节 T/G/AC 编号仅属于该原任务；原实现与 10-04 宽屏证据复用，以下剩余尺寸和主题条件已由[10-16 浏览器验收](../../tasks/evidence/2026-10-16-portfolio-summary-browser.md)补齐，不代替其他节的点位、触屏或收益验收。

- [x] T3：完成本地页面视觉与交互验收
  - 覆盖验收标准：AC6
  - 依赖：T2
  - 涉及范围：真实本地 Desktop 页面宽屏、窄屏、浅色、深色，以及刷新和行情详情入口。
  - 完成条件：首屏层级清晰；窄屏表格可读且可横向访问；双主题对比度与正负值语义一致；控制台无本次修改引入的错误。
  - 验证方式：浏览器 DOM、截图、交互和控制台检查。
  - 当前证据：10-16 真实 1280×800 与 390×844、浅深主题通过；窄屏文档无横向溢出，持仓表可横向访问且操作可用，键盘刷新完成。旧工具无法改变 CSS 视口的限制已经解除。

- [x] T4：重构持仓行情详情的信息密度与图表表达
  - 覆盖验收标准：AC7、AC8、AC9
  - 依赖：T2
  - 涉及范围：Desktop `MarketDetailDialog`、行情详情区块、复用的图表原语及对应组件测试。
  - 完成条件：详情使用固定标题区和标准关闭按钮；最近日线与技术指标以可访问图表展示；加载、空态和 Provider 来源语义保持不变；正文使用单一滚动容器且整体间距收紧。
  - 验证方式：Desktop 定向组件测试、类型检查、构建、受影响文件静态检查，以及本地页面宽屏、窄屏、浅色、深色与关闭交互检查。
  - 当前证据：10-16 已加载真实 ETF 行情与日线，宽/窄 Dialog 的宽度和滚动宽度分别相等，浅深主题可读，正文滚动后关闭入口 y=32 保持，键盘关闭回到原入口。完整行情矩阵另见[行情详情验收](../../tasks/evidence/2026-10-16-market-detail-chart-acceptance.md)；Desktop 当前全量 841 项、typecheck/build 通过。

- [x] 本节每日摘要 Spec 的 AC1–AC9 均有实现与对应证据；AC6 与 AC9 的尺寸/主题条件已补齐。

- [x] 本节必要实施 Step 已验证；工作保持未提交、未推送。

<a id="portfolio-pnl-acceptance"></a>
## 收益指标运行时验收

对应 [原 Spec](../../specs/2026-09-09-portfolio-pnl-metrics.md)与 [原实施记录](2026-09-09-portfolio-pnl-metrics.md)。本节 T/G/AC 编号仅属于该原任务；已完成代码与定向证据不重做。10-04 记录只保留当时的明确场景，当前以 10-17 增量及尚缺条件为准。

- [x] G1：按原 Spec 的运行时状态核对当前 API 与浏览器收益字段、真实 Trade Close Slice 和缺失降级；复用现有合法数据，真实 FX 来源及账户/模式证据不足时保留准确原因。T1–T3 的既有确定性证据不重跑，不能用健康或空结果替代。
  - 10-17 已补：独立账户完成无卖出、部分/多次/全部卖出，三次 Close Slice 净收益合计 115；修复清仓后错误空态，API、390px Web、安装版和模式隔离通过，见[当前证据](../../tasks/evidence/2026-10-17-portfolio-pnl-directory-consumers.md)。专用账户已归零停用，原数据保护核对通过。
  - 未知成本：专用 CNY 账户经正式余额观察和卖出接口生成 `costEstimated=true`、`netRealizedPnl=null` 的 Close Slice；API、四宫格和交易详情保留不可用及缺成本原因，不生成零收益。
  - FX 与费用：专用 USD 纸面输入形成已实现净收益 8 USD；正式 DSA 同步后，真实 yfinance 缓存汇率 `6.676799774169922` 换得 `53.4144 CNY`，原 CNY 样本反向换得 `17.2238 USD`。Web 组合四宫格显示合计 `168.41 CNY`。再经正式成交接口产生 `FEE_CURRENCY_MISMATCH`，即使 FX 可用，已实现/累计仍为 null，页面显示不可用；补齐详情的中文原因映射。纸面成交不声明来源市场价格或交易资格。
  - 已修复缓存合同：DSA 无时区 `updated_at` 曾使缓存 `fetchedAt` 不符合 Server 时点校验；现对直接/反向缓存保留已知汇率，时点有时区才规范化，否则省略可选字段，既不猜 UTC，也不补成当前时间。六项新 HTTP 合同回归先失败后通过，DSA 完整门禁 `10418 passed / 1 skipped / 4 deselected`，正式 `sync-code.sh dsa` 后真实缓存重读与收益换算通过。FX 缺失分支复用既有确定性/渲染回归；修复前缓存失败回执仅作为缺陷证据，不误记为当前外部来源阻塞。
  - 清理与边界：三个本轮专用账户均通过正常现金流与可恢复停用收尾，现金/持仓为 0，保留原始事实及费用场景作废链。七张原始表、54 份成功 V3 结果与原 Provider/default、AiRun/AiInvocation 核对未变。G1 关闭不代表快照正式基金校准、历史点位覆盖或其他任务通过。
  - 2026-10-04 目标 HTTP 与浏览器：实际组合无卖出，`realizedPnl=0`；两持仓缺行情导致 `unrealizedPnl=null`、`cumulativePnl=null`；`dailyChange.basis=PREVIOUS_CLOSE_CURRENT_HOLDINGS`，金额/收益率均为 null，并列出 600519.SH、161725.OF。四宫格与“未实现盈亏”列可见，已实现显示真实 ¥0.00，累计保持不可用。
  - 10-04 原 Trade 查询为 ACTIVE、closedQuantity=0、remainingQuantity=3、净实现 0、projectionGeneration=16，仅作历史证据；10-17 的新样本与上述补验完成 G1，不重做旧样本。
