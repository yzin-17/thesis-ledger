# 股票收藏项目的实现对照与覆盖清单

> 更新日期：2026-10-19；关联线程：`codex://threads/01a1370b-14e7-76d0-8481-6763891208af`。
> 本文持有覆盖与问题分类索引；逐项目源码证据和新增反例由[实现级核查结果](2026-10-18-starred-project-source-audit.md)持有，核查任务见[研究增强 T0R](../tasks/2026-10-18-research-evidence-evolution.md#star-reference-review)。

## 1. 本轮完成范围

**原清单的 13 个在范围项目已完成既定参考点的实现级对照，另 1 项按要求排除。** 此前的 5 项局部/8 项待查已由本次固定版本源码、测试阅读、本地消费者与处理决定取代；不是 13 个仓库的全部代码审计，也不是所有功能已经接入或验收。

REF05 `hello245m/free-stockdb` 不获取源码、不测试、不接入、不作为依赖。HiThink 使用可校验的官方命名空间发布包版本替代当前 404 的仓库入口，保留这一证据边界。其余 12 仓固定提交与所读函数见逐项结果。

原核查依据为当时 HEAD 加未提交修改。IR01 已修复不重做；IR02～IR06 与 IR09/IR10 已由各自领域 Task 完成修复、本地验证及独立目标验收，见[2026-10-19 目标证据](../tasks/evidence/2026-10-19-p0-target-acceptance.md)。IR07 仍为模型能力差异；IR08 仍为同端点单位待证。受控目标通过不推断真实供应商都可用。

## 2. 逐项目覆盖矩阵

| 编号 | 项目 | 完成状态 | 主要结论与归属 |
| --- | --- | --- | --- |
| [REF01](2026-10-18-starred-project-source-audit.md#ref01) | HiThink-Tech/Financial-API | 已完成参考点对照（发布包） | 分页/能力实现已查；财务、估值、成分属新能力候选，发布版本之外不推断。 |
| [REF02](2026-10-18-starred-project-source-audit.md#ref02) | simonlin1212/a-stock-data | 已完成参考点对照 | 同端点/分页/事件/财务/宏观/指数解析已查；保留 IR08 单位待证，按能力采用。 |
| [REF03](2026-10-18-starred-project-source-audit.md#ref03) | HKUDS/Vibe-Trading | 已完成参考点对照 | 假设、证据、存储、预算与 SEC 周期实现已查；增强 T3/T5/T9，不复制文件状态机。 |
| [REF04](2026-10-18-starred-project-source-audit.md#ref04) | refraction-ray/xalpha | 已完成参考点对照 | 穿透分母、净值估算和批次费用已查；保留未知和现行统一费率模型。 |
| REF05 | hello245m/free-stockdb | 明确排除 | 无实施、验证或依赖。 |
| [REF06](2026-10-18-starred-project-source-audit.md#ref06) | akfamily/akquant | 已完成参考点对照 | T+1/撤单/公司行动/费用与 Golden 已查；保留本地经济内核，复用反例方法。 |
| [REF07](2026-10-18-starred-project-source-audit.md#ref07) | ghostfolio/ghostfolio | 已完成参考点对照 | 实际 ROI/ROAI 与 TWR/MWR 占位、FX、拆股测试已查；不移植错误回退。 |
| [REF08](2026-10-18-starred-project-source-audit.md#ref08) | microsoft/qlib | 已完成参考点对照 | 拟合/切分/PIT/缓存已查；保留 holdout 隔离，触发指标时钟反例。 |
| [REF09](2026-10-18-starred-project-source-audit.md#ref09) | microsoft/RD-Agent | 已完成参考点对照 | 实验反馈/执行环境/预算已查；不引入宿主代码执行或重复模型调用。 |
| [REF10](2026-10-18-starred-project-source-audit.md#ref10) | fasiondog/hikyuu | 已完成参考点对照 | EMA/RSI/MACD/ATR 与增量定义已查；算法差异保留版本，IR09/IR10 归指标内核。 |
| [REF11](2026-10-18-starred-project-source-audit.md#ref11) | vnpy/vnpy | 已完成参考点对照 | Datafeed/累计量/聚合/事件关闭已查；不引入交易网关或内存任务事实源。 |
| [REF12](2026-10-18-starred-project-source-audit.md#ref12) | ZhuLinsen/daily_stock_analysis | 已完成参考点对照 | 报告/轨迹/历史/观察/ETF/风险质量/自选与数据中心已查；配套 DSA/研究计划采用。 |
| [REF13](2026-10-18-starred-project-source-audit.md#ref13) | myhhub/stock | 已完成参考点对照 | 三类重叠筛选及前向统计已查；只作显式 AST 模板候选，不同名照搬。 |
| [REF14](2026-10-18-starred-project-source-audit.md#ref14) | GrayJS/alpha-arena | 已完成参考点对照 | 调度/数据/榜单/指标已查；金融实现不适用，仅保留对照信息组织。 |

## 3. 已核查参考点与最小反例

每项结果均包含固定版本源码/测试定位、本地入口、实际差异、采用或不适用决定、最小反例及责任归属，正文见上表链接。新增能力只登记为候选，不自动扩大当前研究/数据服务计划；未取得的真实端点/账号事实仍保持未知。

核查采用“数据/适配、计算/账户、研究/实验”三组，但没有再建立三套进度表。现有事实完整性和冻结保护优先于参考项目的宽松默认值。参考项目本身的缺陷属于不适用依据，不直接算作本地缺陷。

<a id="local-findings"></a>
## 4. 实现问题与修复状态对账

下表保留原发现及当时源码定位，当前修复状态来自所属领域 Task 和独立验收证据。原始源码核查与反例记录保持历史证据；2026-10-19 的目标消费不由研究增强、T19、一般 UI 或 DSA 剥离叶代收。

| 编号 | 原发现及本地依据 | 本轮准确状态 | 承接与验证边界 |
| --- | --- | --- | --- |
| IR01 | 历史正式快照曾混用当前 Position 与过去价格/现金；当前 `performance-snapshot.service.ts:59–80, 440–451` 已接受 `frozenInputs`，校准传 `frozenSnapshotInputs(estimate)` | **旧远端结论已被本地修复取代**。`performance-snapshot-inputs.ts:86–135` 验冻结输入；`snapshot-reconciliation.test.ts:109–128` 明确断言不读当前 Position/Ledger/账户币种 | [Portfolio Task](../tasks/2026-08-28-portfolio-snapshot-system.md) 的 R3.I1/I3 已记录定向与股票实测。复用原证据，不重开已过项；基金校准及其他边界仍按原任务开放，本轮没有重新验收 |
| IR02 | `automation-runtime.service.ts:156–217` 自算原币市值、剔除失败持仓后求权重；`missingSymbols` 未随风险输入构成组合完整性约束 | **修复及 RVCG 目标验收通过，关闭对账完成** | [风险 Task](../tasks/2026-10-18-risk-valuation-correctness.md#rvcg)：目标实际规则/事件/历史覆盖混币等权、缺价/缺 FX 保护及过期输入；生产原记录保留。行情/FX/NAV 为受控输入，通知不外发 |
| IR03 | `performance.ts:70–79` 将区间净现金流从末值扣除；`PerformanceAnalysisService.summary()` 合并两日快照间现金流 | **修复及 PFCG 目标/浏览器验收通过** | [收益 Task](../tasks/2026-10-18-performance-correctness.md#pfcg)：缺流前/流后边界明确不可用，精确分段场景为 10%；零净额流量不丢失，浏览器显示原因。原收益 G1 独立复用 |
| IR04 | `performance.ts:126–149` 只遍历 `Object.entries(targets)`；分母却包含全部当前资产 | **修复及 PFCG 目标消费通过** | [收益 Task](../tasks/2026-10-18-performance-correctness.md#pfcg)：类别并集保留现金来源、舍入守恒，partial 拒绝建议；浏览器目标读取正确，不执行交易 |
| IR05 | `performance.ts:82–105` 为无保护的单初值 Newton 迭代 | **修复及 PFCG 目标/浏览器验收通过** | [收益 Task](../tasks/2026-10-18-performance-correctness.md#pfcg)：严重亏损得到有限有效根并验证残差，浏览器显示 −90.02%；多解、无解及搜索不足仍按数值合同分类 |
| IR06 | `performance-target.service.ts:31–47` 先停用旧目标，再查询版本并创建新目标，无共同事务 | **修复及真实数据库、PFCG 目标/浏览器验收通过** | [收益 Task](../tasks/2026-10-18-performance-correctness.md#pfcg)：失败回滚、并发连续版本和唯一 active 分别验证；浏览器 503 保稿及原 v1 保留，重试生成 v2，刷新仍可读 |
| IR07 | xalpha 按卖出批次/持有日选择费用；本地 NAV 确认对总赎回额应用统一 `redemptionFee` | **模型能力差异，未升级为确定 bug** | 若既有合同是用户冻结的统一费率，继续披露假设；若承诺真实批次费用，先补批次日期/份额与费用合同，不强制改变移动加权成本法。基金穿透已按 REF04 完成参考实现对照，不自动立项 |
| IR08 | 本地腾讯只对 `sh688` 保留股数；参考资料还提到 689 | **同端点单位待证，未确认生产错误** | 本轮已核对：参考使用 fqkline/get，本地使用 newfqkline/get；参考测试没有 689 同端点样例。DSA 来源原 Task/合同取得同一接口原文与身份/单位证据后再决定；不自动乘除 100、不切换用户路由、不因本条重启已停止的来源验证 |
| IR09 | `backtest-indicators.ts::rsi()` 的递归状态依赖超出时钟合并窗口 | **原严重程度 P1；修复及 IVAG 目标 Worker 验收通过** | [指标 Task](../tasks/2026-10-18-indicator-availability-correctness.md#ivag)：RSI/嵌套 EMA 晚到种子拒绝、目标构建/冻结/执行/重放和旧 Run 保护通过；[原始反例](2026-10-18-starred-project-source-audit.md#indicator-findings)保留 |
| IR10 | `trueRange()/atr()` 未合并前一 close 时钟，且可把 unavailable OHLC 重新输出 available | **原严重程度 P1；修复及 IVAG 目标 Worker 验收通过** | [指标 Task](../tasks/2026-10-18-indicator-availability-correctness.md#ivag)：ATR 晚到前收和不可用状态保护、目标完整消费和历史保留通过；NAV/编写保护沿未变输入复用，不推断全部历史 Run 受影响 |

原始核查时的局部指纹（SHA-256）保持历史记录，不表示修复后的当前文件；目标候选的新指纹由验收记录持有：

| 本地文件 | SHA-256 |
| --- | --- |
| `apps/server/src/performance/performance-snapshot.service.ts` | `9871a09517511efd89d1af0d085efa6b17614a9bdc6329289d286df22dcb4ede` |
| `apps/server/src/performance/performance-snapshot-inputs.ts` | `66a4d10bd2407c54023f9eae9e991071b881e9fb1696dc7c337796110a247765` |
| `apps/server/test/performance/snapshot-reconciliation.test.ts` | `0f518575180aa338359ed1e21773d3ef1ab110f11b026cc06dfe5006c51120ab` |
| `apps/server/src/automation/automation-runtime.service.ts` | `bbbc1c2a1e1b8f329ddfd517a32476afa5c86a70a31e57f7ee47c4e46c52cf1d` |
| `packages/domain/src/performance.ts` | `2c1605a9719c218a024d17415d396bb5f7f34cb7bb3fc7af501abd596cb7154b` |
| `apps/server/src/performance/performance-target.service.ts` | `36b5a44b1b9a8f40dae076afa4ffa8bca6da3e428a6a61952167101948a20d8d` |
| DSA `data_provider/tencent_native_daily.py` | `fffdf53efa0a8e08238015a2a428fd3c5671f4e7fe3583dc68a76b2ea9275f28` |

## 5. 核查收口与后续边界

T0R 的既定参考点核查已完成；不是所有参考点都要实现。与研究有关的证据有效性、数字/单位、比较/观察和预算统计进入对应 T3/T5/T6/T9/T13/T15a；来源保全维度进入 D0/N1～N3。当前 D0/T0 的完整依赖闭包、业务实现和运行门禁仍未完成。

IR02～IR06 与 IR09/IR10 已按[全局 P0 排期](../tasks/README.md#priority-p0)完成三个领域的修复及独立目标门禁，状态由原 Task 持有。目标实际消费使用明示受控输入，原数据与快照保留，真实模型继续暂停。IR01 复用已通过证据；IR07/IR08 仍保持各自限制。

原始源码核查的运行范围与指纹见[反例证据](2026-10-18-starred-project-source-audit.md#reproduction)，该阶段未运行供应商/模型、数据库或 Docker。后续修复和目标验收范围见[2026-10-19 证据](../tasks/evidence/2026-10-19-p0-target-acceptance.md)；没有开户、采购、恢复暂停路线或模型额度，没有合并上游或删除历史数据。
