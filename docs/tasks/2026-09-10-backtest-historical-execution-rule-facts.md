# 回测执行规则与研究假设实施任务

对应 [Spec](../specs/2026-09-10-backtest-historical-execution-rule-facts.md)；上游 [统一回测 V2 Task](2026-08-28-unified-backtest-v2.md)。

> 状态：T1 可冻结模型契约已完成；固定 CN 股票日频场景的 T4、T3.2 受控模型消费与 T3.3 API/客户端披露已完成。T3.1 整体剩余项与 V2 T13 仍未完成，状态见下。本文 T0 与 V2 原 T0 是不同任务。旧 T0 历史来源审计未通过的结论保留，但不再作为全部任务的启动门禁。

## 1. 依赖与顺序

| 任务 | 启动依赖                               | 主要交付                                 |
| ---- | -------------------------------------- | ---------------------------------------- |
| T0   | 无                                     | 首个运行的必要输入与显式模型选择         |
| T1   | Spec 已确定的三类缺失和规则语义        | 可冻结模型契约与校验，不依赖全部来源档案 |
| T2   | T1 的请求/响应契约与共享用例通过       | DSA 按范围返回实际事实与缺失原因         |
| T3.1 | T1 的模型契约通过                      | Snapshot 按需校验并冻结模型与事实        |
| T3.2 | T1 的模型契约通过                      | Runner 消费模型并计算交易、资金及费用    |
| T3.3 | T1 的披露/错误契约通过                 | 现有 API/客户端披露模型及限制            |
| T4   | T0、T2、T3.1–T3.3 的目标运行能力已验证 | 最小成功运行与隔离复验                   |

T3 保留为原任务的责任组，不额外计为完成项；拆分依据是 Snapshot、执行、消费面的独立验收边界。T2/T3 可对 T1 共享用例独立验证，真实互操作归 T4。T0 的运行取值不会阻止 T1 结构工作；真实数据不足只阻止依赖该数据的运行。先在 T3.1/T3.2 具备后通过实际 Runner 做受控输入的买卖集成，再在 T4 验收真实 Provider；不等待全市场数据接入。

## 2. 实施任务

### 2026-09-11 前一阶段接线范围（阶段记录）

该阶段交付 T1 的 RunConfig 显式模型与跨字段校验，以及 T3.1 的独立模型 Artifact、Manifest 版本/内容引用和确定性哈希；按 Spec 4.4 的保守历史时间门禁实施。阶段内保留原事实校验，旧 Runner 只增加明确拒绝模型输入的兼容保护；随后 T3.2 增量已在本 Task 后续章节接通模型消费。T1/T3.1 的剩余按需事实冲突选择与完整产品验收不能因接线通过自动勾选。T2/T3.3/T4 不扩展。

### 2026-09-10 实施边界记录

启动时主仓有 66 项已修改/未跟踪路径；DSA 亦有既有修改，包括 instrument-facts 直接实现。共享 Schema、Snapshot、Exchange/NAV adapter、SimulationLedger 的既有改动均保留。本轮增量以启动时文件内容为基线，不以 HEAD 覆盖它们。

本轮先验证 T1 的独立契约切片：显式模型结构 → 按事件选择版本/分段 → Decimal 费用计算。随后范围请求/缺失响应契约通过共享定向用例，沿该前沿接通 Server → DSA → Snapshot 失败收敛。T1 的完整完成条件继续保留；RunConfig 接入、Snapshot 模型冻结、实际 Runner 与披露不得因这些切片通过而视为就绪。下游仅能消费已经通过共享用例的契约部分，未覆盖部分保留在原 T1/T2/T3 责任中。该重划分不修改 AC、不把遗漏推入 T4。

首个模型选择为 `cn-600519-research-2024q1`、版本 `1`，仅用于 CN/STOCK/600519.SH/CNY、2024-01-02..2024-03-29 的显式研究配置。全部配置值按事后研究假设标记，配置时间与历史 knownAt 分离，不升级来源矩阵中未证的历史事实：

- 佣金按双向成交额 0.0003、每笔最低 CNY 5；包含监管费和经手费，不另扣这两项。来源依据为固定策略 cost 与矩阵 S24/S25 的包含关系资料。
- 印花税按卖出成交额 0.0005，过户费按双向成交额 0.00001；两项明确采用“本模型不设最低额”。后者沿用矩阵候选值作为研究假设，并非已证 Provider 费率。每笔每项先算最低额、再以 CNY 两位小数 halfUp 舍入，最后求和；不模拟客户汇总代收。
- 持仓成交后第 1 个交易日可卖；买入成交扣款、订单接受时占款；卖出成交款当日可再投资。均为客户资金/持仓研究模型，不代表中央交收或可提现时点。日历必须使用冻结的 CN Calendar，不能用普通工作日替代。
- 固定策略滑点 0.001 保留；raw 成交与现金公司行为一致。价格限制、身份、lot/tick、历史可交易性、必要参考价、日历、价格与公司行为覆盖必须另有适用事实；不由研究费用模型补齐。无跨币种估值时不要求 FX；NAV 生命周期不适用于这个股票场景。
- 必要事实范围由当前 Snapshot 的策略 lookback 与预热算法导出，不能固定使用来源矩阵区间；交易费用模型只覆盖运行区间。当前 DSA 静态 tradable 不证明历史上市/停牌状态，该历史状态及价格约束适用性是明确运行阻塞；价格/日历/公司行为当前可用性未做在线验证。原公告原件、客户协议、可提现凭证属于本次计算无关审计信息。

规划复核：上述契约切片可以本地独立验证；没有用户范围决策阻塞。真实输入和整条运行链尚未就绪，T0/T1 与下游任务暂不勾选。

- [ ] **T0：确认首个研究运行的输入与模型**
  - 覆盖：AC0，AC2/AC9 的模型说明。
  - 范围：沿用来源矩阵已有资料，按策略实际预热/运行范围列出必需事实；选定费用、持仓可卖和再投资模型，说明来源、版本、适用范围、简化假设与必要日期分段。不开展全量公告/客户协议补证。
  - 完成条件：每个计算字段已明确为可用事实、显式配置或具体阻塞；用于成功闭环的模型值完整。仅列缺口不等于目标运行已就绪；无关审计项不计为缺失。
  - 验证：人工核对输入清单与 Spec 三类缺失；核对费用包含关系、币种/最低额/舍入、日历和公司行为所需覆盖。实际模型值应作为 T1 契约实例校验，但 T0 的范围分类可独立完成。
  - 状态：部分完成。已记录研究取值并由 `packages/schemas/fixtures/backtest-execution-model.cn-2024q1.json` 验证结构；历史可交易性、价格限制适用性及目标在线输入仍未齐，不是已启用生产预设。

- [x] **T1：建立可冻结模型契约**
  - 覆盖：AC2–AC4 的契约，AC5–AC6 的规则校验。
  - 范围：扩展现有 `packages/schemas` 的 RunConfig/执行规则结构与 `packages/domain` 规则解析。表达来源类型、版本、范围、假设、必要分段、费用币种/最低额/舍入、可卖与资金再投资时点；明确 NAV 模型的适用字段。优先单段结构，按需分段，不建设通用目录或平台。
  - 完成条件：共享契约用例证明完整配置可冻结；缺字段、错误币种、未知适用性、重叠/缺口、未来事实被拒绝；模型配置时间与历史事实知悉时间分开；旧快照按原语义可解析。费用无最低额/不适用有显式表达，不能从 null 猜值。
  - 验证：Schema/Domain 定向用例，规则分段边界与旧快照兼容；通过后运行受影响包测试/build。此任务不修改 Provider、Runner 或客户端。
  - 状态：已完成。RunConfig 显式选择、身份/范围/执行币种/历史时间跨字段校验与冻结用例保持有效；NAV 申购/赎回费用已分别固定 side、经济基数、CNY、费率/最低额、两位 `halfUp`、逐申请和确认时扣收语义，并支持带原因的显式不适用。Schema 与 Domain 拒绝非法适用契约；无模型与旧快照路径保持原语义。证据见第 11 节。

- [ ] **T2：使 DSA 事实请求覆盖实际区间**
  - 覆盖：AC1 的 Provider 端，AC3/AC9 的真实状态。
  - 范围：仅 sibling DSA 的 `instrument-facts` 及直接依赖 Provider，消费 T1 的范围请求契约，保留身份、lot/tick、状态与来源/覆盖信息；研究预设归 ThesisLedger，不要求 DSA 建两个历史目录。
  - 完成条件：真实事实缺失返回字段/范围/Provider 原因；已知停牌可识别，静态 tradable 不冒充历史状态；原始 executionRules unavailable 不被改写为 supported。规则分段只在确有事实来源时返回；不为通过首个用例伪造 capability。
  - 验证：DSA service/HTTP Contract 定向用例，真实路径与 fixture 分离、非法区间与缺失分支；通过后仅相关包门禁。
  - 状态：部分完成。仅修改 instrument-facts 路由、直接服务函数及定向测试；缺失/非法范围返回 422，真实静态路径返回 unavailable/不完整覆盖与 missingInputs，原始 executionRules 不变。尚无历史上市/停牌状态 Provider，不能声称已知停牌识别完成；缺少该事实仍阻塞首个真实运行。

- [ ] **T3.1：按需冻结 Snapshot 输入**
  - 覆盖：AC1 的 Server 端，AC2–AC4 的冻结，AC6 的输入哈希。
  - 范围：DsaClient、Snapshot Builder 与现有快照校验；不修改 Runner 或客户端。
  - 完成条件：显式传实际区间；区分数据事实不可用与可建模规则；只在必要事实齐备且模型已选择/验证后冻结。保留原始 Provider 状态和具体失败原因；冻结配置/来源/假设并计入哈希，不在 retry 中补取数据。旧快照不补假设或改写。
  - 验证：共享 T1 用例驱动 Snapshot 定向测试，断言关键数据失败不入队、审计缺项不阻塞、配置改变哈希变化、相同输入哈希不变。不能仅删除 `requireFrozenExecutionRules` 检查。
  - 状态：模型冻结接线已完成。完整模型/来源/假设写入独立 Artifact 与配置元数据，V2 Manifest 记录内容引用并校验一致性；确定性哈希、缺失/篡改拒绝、旧 V1 重放均有本地证据。执行标的的显式完整研究模型有界替代已在 T4 完成；T3.1 仍未按完整目标范围整体验收，原 `requireFrozenExecutionRules` 门禁和其他关键事实保护保留，缺关键事实仍失败，因此整体保留未勾选。T3.2 已在后续增量中消费冻结模型。

- [x] **T3.2：让 Runner 执行冻结模型**
  - 覆盖：AC5、AC6，AC3 的执行期保护。
  - 范围：现有 Exchange/NAV adapter、ExecutionRules 与 SimulationLedger 的模型消费；不新增引擎或迁移运行时。
  - 完成条件：按事件日期取必要规则段，费用只扣一次，最低额/币种/舍入有效；占款与可再投资时点防止资金复用；持仓可卖和 NAV 申请/定价/确认/赎回到账按模型发生；公司行为与 raw/adjusted 口径一致。必要价格/NAV/FX/公司行为缺失不得发布正常结果；缺 Bar 不认定停牌、不前填撮合。
  - 验证：定向费用、CN 可卖约束、交易日交收边界、NAV 生命周期和公司行为用例；同冻结输入重跑结果一致，旧 snapshot 回归。与 T3.1 接通后使用实际 Runner 验证一次闭合买卖与日权益序列，明确受控数据证据边界。
  - 状态：已完成本地实现与受控输入验证。Exchange/NAV adapter 通过冻结 `execution-model-v1` 按事件日期选段；Exchange 已接通模型费用、最低额/币种/两位小数舍入、tick 价格限制、CN 可卖、现金占款/成交扣款/卖出款再投资及公司行为；NAV 已接通模型 cutoff、净值可用、延迟确认、份额可用、申购/赎回费用与现金生命周期。修复了晚于 cutoff 的 request/cutoff 消费顺序、延迟确认/申购扣款仍按 NAV 到达时点消费的问题，以及金额型 NAV 申购因份额除法尾差误判占款不足的问题。旧 V1 快照仍按旧路径回归，模型输入的相同受控运行结果可确定性复现。真实 Provider、Docker/队列运行态和 T4 目标场景仍不在本 Task 验收内。

- [x] **T3.3：披露模型与失败原因**
  - 覆盖：AC9 的 API/客户端，AC3 的用户可见失败。
  - 范围：现有回测 API/结果结构和 Desktop 配置/结果页面，复用当前组件与请求体系；不新增规则管理页面或研究/审计开关。
  - 完成条件：用户可明确选择/确认预设或配置，看到适用范围、来源版本、简化假设及完整度；关键缺失显示具体失败原因而不是普通成功警告。事实支持与模型可运行不是同一个 supported 状态。
  - 验证：API 契约与组件定向检查；真实展示归 T4；不以模拟 UI 数据证明 Provider 可用。
  - 状态：本地 API/客户端披露与定向验证完成，证据见第 9 节；固定场景的真实展示已在 T4 完成。Provider 的完整目标范围支持仍未完成。

- [x] **T4：验收最小真实闭环**
  - 覆盖：AC7–AC10；仅集成验收，不承接遗漏的核心实现。
  - 环境与范围：目标修订的 DSA、Server/Worker、数据库、队列与共享 Snapshot；执行时记录镜像与配置。“本轮文档调整不授权迁移、构建、重启或运行该任务”仅指 2026-09-10 的历史文档调整轮；后续 T4 实施与验收按对应轮次的明确授权执行。
  - 完成条件：使用策略版本 `4b01aa1c-6efb-465f-aaf0-f256e6f5c530`（不可用时以如下原 JSON 重建并记录 ID）及 T0 确认的模型运行 `600519.SH`、`2024-01-02..2024-03-29`；至少买/卖各一次、一个闭合交易、超过两个日权益点；相同 finalized Snapshot 重放 checksum 一致。成功前后真实账户域指纹不变，结果披露研究假设。关键数据缺失注入后稳定失败，再恢复；沿用仍有效的恢复/RSS证据。
  - 验证证据：runId、snapshotId、模型及事实哈希、checksum、成交/权益统计、账户指纹、模型展示和失败原因。新取数运行仅在输入 revision/内容相同时要求同哈希。
  - 状态：固定场景的真实闭环、同 Snapshot 重放、账户隔离、Artifact 缺失/恢复复验及 in-app Browser 三条链路均已通过，T4 已完成。该最小成功仅为 V2 T13 对应断言补证，不代表完整目标市场、资产与周期已完成；V2 T13 继续按其完整验收条件保持未勾选。

### 固定验收策略（沿用原记录）

```json
{
  "schemaVersion": "2",
  "name": "T13 闭合买卖真实运行时验收策略",
  "primaryTimeframe": "1d",
  "executionInstrument": {
    "market": "CN",
    "symbol": "600519.SH",
    "assetType": "stock"
  },
  "signalSources": [
    {
      "id": "execution",
      "asset": {
        "market": "CN",
        "symbol": "600519.SH",
        "assetType": "stock"
      },
      "series": ["close", "volume"],
      "timeframe": "1d"
    }
  ],
  "entry": {
    "type": "compare",
    "operator": "gt",
    "left": { "type": "series", "sourceId": "execution", "field": "close" },
    "right": { "type": "constant", "value": "10" }
  },
  "exit": {
    "type": "compare",
    "operator": "gte",
    "left": { "type": "positionState", "field": "holdingPeriods" },
    "right": { "type": "constant", "value": "1" }
  },
  "sizing": { "type": "fixedQuantity", "quantity": "100" },
  "risk": [],
  "execution": {
    "mode": "exchange",
    "timing": "nextEligibleBarOpen",
    "orderType": "market",
    "timeInForce": "DAY"
  },
  "cost": { "commissionRate": "0.0003", "slippageRate": "0.001" }
}
```

## 3. F1–F6 与验收责任

范围拆解以 [Spec 第 4.3 节](../specs/2026-09-10-backtest-historical-execution-rule-facts.md#43-f1f6-逐项收敛) 为准。F1/F2/F3/F5/F6 的配置与校验由 T1 负责，执行由 T3.2 负责；F4 现金/持仓生命周期由 T3.2 负责。T3.1 冻结全部实际使用配置，T3.3 披露，T4 验收首个真实场景。移出范围的档案要求不计入这些任务完成条件。

| AC             | 实现/局部验证            | 真实门禁         |
| -------------- | ------------------------ | ---------------- |
| AC0            | T0                       | T4 核对所用输入  |
| AC1            | T2、T3.1                 | T4               |
| AC2            | T0、T1、T3.1             | T4               |
| AC3            | T1、T2、T3.1、T3.2、T3.3 | T4               |
| AC4            | T1、T3.1、T3.2           | 受影响旧快照重放 |
| AC5、AC6       | T1、T3.2；T3.1 哈希      | T4 仅首个场景    |
| AC7、AC8、AC10 | T4                       | V2 T13 复核      |
| AC9            | T2、T3.3                 | T4               |

## 4. 历史证据与当前门禁

[来源矩阵](../benchmarks/2026-09-10-backtest-historical-execution-rule-source-matrix.md)的 36 条来源、39 个链接、digest 和 null/unproven 均保留为旧审计记录；旧 T0 没有通过。本次范围调整使完整档案不再成为前置条件，不把旧失败改成成功。

当前源码仍在规则 unavailable 时失败，尚无新研究模型的成功闭环；[T13](../benchmarks/2026-09-09-unified-backtest-v2-t13.md)保持未完成。CN/HK/US 股票与 ETF、国内场外基金及原有周期仍是产品目标，缺失接入/验证由 V2 原 T2/T7–T9 的对应能力和 T13 继续承担，不能由本文件 T4 一个 CN 日频用例替代。

## 5. 文档一致性检查

- [x] 目标、非目标、职责、三类缺失、F1–F6 与上游引用一致。
- [x] 每项任务有主要交付、修改范围、依赖和独立验证；不以全量历史证据串行锁住全部实施。
- [x] AC0–AC10 有责任任务；保留历史证据，未勾选实施任务或 V2 T13。
- [x] 文档与现有代码差异已列入 T1–T3.3。
- [ ] 后续模型实施、真实 Provider 成功闭环与完整产品验收通过。

此前文档轮验证：11 份直接相关文档的 111 个本地链接及新增章节锚点有效；固定验收策略 JSON 未变，来源矩阵第 2–12 节逐字保留。核心 Spec/Task 与临时记录显式绕过项目忽略配置后通过 Prettier；来源矩阵及 docs/README.md 的全文件 Prettier 差异在编辑基线中已存在，未重排无关历史内容。全工作树 `git diff --check` 和四份未跟踪文档的 `git diff --no-index --check` 均无空白错误；该轮仅修改文档，没有业务或真实环境验证。

此前文档轮规划结论：文档范围与依赖检查通过，可开展有界输入确认与契约实施；具体生产模型尚待 T0 确认，依赖它的真实运行仍未就绪。无用户范围决策阻塞。该轮仅检查文档，不代表未来测试、部署或服务状态通过。

## 6. 本轮实现与验证证据

本节为 2026-09-10 首轮实施记录；第 5 节保留此前文档轮记录。后续 2026-09-11 接线证据与当前剩余依赖见第 7 节。

### 文件归属与高风险变更

- 本轮新增：Schemas/Domain 各自的 `src/backtest-execution-model.ts` 和 `test/backtest-execution-model.test.ts`，Schemas 的研究配置 JSON，以及 Server 的 `test/backtest/dsa-instrument-facts.test.ts`。
- 本轮在既有内容上增量修改：两个包的 `src/index.ts`、Schemas `src/backtest-data.ts`、Server DsaClient/Snapshot Builder 及其定向测试、本 Spec/Task；DSA 的 `api/thesis_ledger.py`、`src/services/thesis_ledger_v2_dependencies.py`、对应测试及 CHANGELOG。DSA 仅调整 instrument-facts 路由与直接依赖，没有更改公司行为 Provider。
- 既有 Exchange/NAV adapter、SimulationLedger、Portfolio/Trade/账户等工作区改动未修改、未暂存或提交。未改数据库 Schema/migration、lockfile、部署配置；构建输出为现有忽略产物。
- 高风险接口变化：instrument-facts 新增必填 `start/end/executionStart/executionEnd`，旧无范围客户端将得到 422，需要与 Server 同步升级。真实静态路径顶层由 supported 改为 unavailable，仍保留 lot/tick 及原始规则状态；该改变防止静态 tradable 被解释为历史覆盖完整。固定 fixture 使用自身时间，不能借请求 dataAsOf 重写为历史已知。
- 新模型已作为 RunConfig 的可选字段接入，并由 `snapshot-manifest-v2` 独立 Artifact/哈希承载；不能调用旧 Runner 时静默忽略新模型。原始 `requireFrozenExecutionRules`、旧快照结构和错误边界均保留，T3.2 的模型消费仅在模型快照路径启用。

### 检查结果

以下命令在已包含既有用户修改的工作树执行，不能归因为本轮单独贡献；证据仅为本地源码与受控输入。

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| Domain 包 | `pnpm --filter @thesis-ledger/domain test`；`pnpm --filter @thesis-ledger/domain build` | 24 文件、218 测试通过；构建通过 |
| Schemas 包 | `pnpm --filter @thesis-ledger/schemas test`；`pnpm --filter @thesis-ledger/schemas build` | 14 文件、154 测试通过；构建通过 |
| Server 包 | `pnpm --filter @thesis-ledger/server test`；`pnpm --filter @thesis-ledger/server build` | 71 文件、505 测试通过；构建通过 |
| DSA 直接依赖 | `.venv/bin/python -m pytest tests/test_thesis_ledger_v2_dependencies.py -q --tb=short --disable-warnings` | 14 测试通过；3 条既有依赖弃用/测试类收集警告 |
| DSA 静态 | `.venv/bin/python -m py_compile` 和 `.venv/bin/python -m flake8`，目标为上述三个 Python 文件，flake8 选择 `E9,F63,F7,F82` | 通过，0 条所选错误 |
| 仓库静态 | `node scripts/check-boundaries.mjs`；`node scripts/check-workspace-dependencies.mjs`；对 T3.2 TS 目标执行 `pnpm exec eslint ... --max-warnings=0` | 通过，无新增依赖方向或 lint 问题 |
| 本轮差异 | 两仓 `git diff --check`，新增文件及未跟踪 Spec/Task 的 `git diff --no-index --check`；对重叠源码与包导出逐项比较实施前副本 | 通过，无空白错误；只保留本轮预期增量 |

最后一次差异检查将请求 Schema 的 `dataAsOf` 日期比较与 DSA 对齐为 UTC，并补充非法时间防护。仅重验受影响边界：Schemas 的模型/数据定向测试 25 项、Schemas build、Server DsaClient/Builder 定向测试 4 项、DSA 定向测试 14 项均通过。未机械重复全部包测试。未保留失败测试；三个 Python 警告不代表运行验收。

### 准确剩余依赖

1. T0/T2：无研究模型时，真实历史上市/停牌、价格限制适用性及静态 `lot/tick` 等规则/状态缺口仍存在；固定显式模型的 CN 股票日频场景已完成，但不补齐无模型 Provider 事实，价格、日历、参考价、公司行为的完整在线覆盖仍未完成。
2. T1/T3.1：T1 已完成可冻结模型与 NAV 费用适用契约；Runner 已在 T3.2 消费冻结模型。T3.1 仍未按完整目标范围整体验收，原 Provider 门禁和其他关键事实保护保留。
3. T3.3：固定场景的 Browser/展示已完成；完整目标范围的展示与 Provider 支持仍属于 V2 T13，不能由本场景证据替代。
4. T4/V2 T13：T4 固定 CN 股票场景已完成；V2 T13 因完整市场/资产/周期仍未执行、未勾选。保留本轮真实运行、重放、隔离、Artifact 恢复与 Browser 三链路证据，不扩大为完整目标能力。

## 7. 2026-09-11 RunConfig 与模型冻结接线（前一阶段记录）

### 本轮变更与归属

- 在前轮内容上修改 Schemas 的 `src/backtest-v2.ts`、`src/backtest-execution-model.ts` 及对应模型测试：可选内联模型、运行范围/策略身份/执行币种与历史 knownAt 校验。研究 configuredAt 可晚于历史数据截止；在冻结边界拒绝晚于当前冻结时刻的配置。
- 修改 Server 的 `backtest-snapshot-builder.ts`、`backtest-snapshot.ts`、`v2-snapshot-builder.test.ts`；新增 `test/backtest/snapshot-execution-model.test.ts`。使用 `snapshot-manifest-v2` 和独立 `metadata/execution-model.parquet`，模型/配置/Manifest 相互校验；费用或来源变化改变哈希。V2 的 Artifact ID 由内容导出；模型和配置 JSON 规范化，V1 保持原路径。
- 在该阶段，`backtest-v2-runner.ts` 仅新增版本兼容拒绝：V2 模型快照或旧 Manifest 中夹带的新模型均不能进入旧 Exchange/NAV adapter。随后 T3.2 增量已在本 Task 第 8 节实现模型消费；除该增量外，没有修改 Desktop、DSA、数据库或部署配置。
- Builder 对带模型输入在异步操作前复制/校验；已 finalized 的相同输入直接校验并重放，不重新请求 Provider 或删除既有快照。标的事实身份/币种和 Calendar 时区必须与模型一致；原 unavailable 与 requireFrozenExecutionRules 保护保留。
- 现有工作区内容继续保留。Snapshot 文件原有 lint 的多余类型断言和未使用解构变量已作局部等价修正；旧快照测试验证该整理不改变其身份语义。没有暂存、提交、镜像构建或服务操作。

### 验证与边界

| 检查 | 命令/范围 | 结果 |
| --- | --- | --- |
| Schema 定向 | `pnpm --filter @thesis-ledger/schemas exec vitest run test/backtest-execution-model.test.ts test/backtest-v2.test.ts` | 28 项通过；旧配置无模型字段，不自动补假设 |
| Domain 定向 | `pnpm --filter @thesis-ledger/domain exec vitest run test/backtest-execution-model.test.ts test/execution-rules.test.ts` | 10 项通过；本轮未改 Domain 源码，未重复其全包构建 |
| Snapshot 定向 | Server 的 `snapshot-execution-model.test.ts`、`v2-snapshot-builder.test.ts`、`snapshot.test.ts` | 最终 20 项通过；覆盖相同输入重建、费用/来源变更、配置与 Artifact 不一致、缺失 Artifact、未来配置、事实币种/日历时区矛盾及旧重放 |
| 包级 | `pnpm --filter @thesis-ledger/schemas test`；`pnpm --filter @thesis-ledger/server test` | 154 项、504 项通过；包含旧执行器回归，不等于新模型执行成功 |
| 构建/调用者 | Schemas、Server、api-client 的 `pnpm --filter @thesis-ledger/<包名> build` | 均通过；共享可选字段沿 API client 类型可用，未新增披露界面 |
| 静态 | 边界、workspace-dependencies、对本轮八个 TS 文件执行 ESLint | 通过；首次发现的 4 个存量 lint 错误已修复，无遗留失败 |
| 差异 | `git diff --check`、新增测试的 `git diff --no-index --check`，对实施前副本检查重叠源码 diff | 通过；旧 hash 算法不变，无无关格式化重排 |

证据仅覆盖本地真实 Snapshot/Parquet/Manifest 实现和受控事实，不证明真实 Provider、队列、Runner 新模型结果或账户隔离。所有模型持久化验收均使用临时目录。相同 runId、策略身份、模型与事实输入得到相同 manifest 哈希；跨 runId 只承诺独立模型内容哈希稳定，manifest 仍携带运行所有权。

### 前一阶段收束与剩余任务

截至该阶段，T1 的 RunConfig 子项和 T3.1 的模型冻结接线完成；T1 整体尚需完善 NAV 费用舍入/扣收适用契约，T3.1 整体仍保留按需替代原 Provider 规则门禁的未完成项，T2 的历史状态 Provider 缺口仍阻塞真实运行。T3.2、T3.3、T4/V2 T13 当时尚未实施；后续 T3.2 结果见下一节。

## 8. 2026-09-11 T3.2 Runner 消费冻结模型

### 实现范围

- `ExchangeMarketSimulation` 消费冻结 `execution-model-v1` 的日期分段、费用、价格限制和交收语义；`VersionedExecutionRules` 支持 half-up tick 限制、最小距离 tick、CN 可卖日与模型规则版本。
- Exchange Runner 通过 `SimulationLedger` 实现订单接受时现金占款、成交扣款、失败释放、卖出款再投资和持仓交收；模型费用不再叠加旧策略/Provider 费用。
- `CnNavSimulation` 消费模型 cutoff、净值日与可用时间、确认/份额可用/赎回款生命周期及申购/赎回费用。金额型申购以申请金额作为 ledger 成交扣款，避免份额除法尾差破坏现金占款。
- 受控 Server Runner 用例覆盖冻结模型下的买入、T+1 卖出、费用、每日权益序列、NAV cutoff/费用/生命周期和相同输入重跑一致性；旧 V1 快照回归仍按原语义执行。模型快照 Builder 用例同步更新为允许进入已实现的模型 Runner。

### T3.2 验证证据

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| Domain 定向 | `pnpm --filter @thesis-ledger/domain exec vitest run test/execution-model-consumption.test.ts test/execution-rules.test.ts test/simulation-ledger.test.ts` | 3 文件、20 项通过 |
| Server 定向 | `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/v2-execution.test.ts test/backtest/v2-runner.test.ts` | 5 项通过；包含 Exchange 买卖、模型费用/权益、NAV 模型消费 |
| Domain 包级 | `pnpm --filter @thesis-ledger/domain test`；`pnpm --filter @thesis-ledger/domain build` | 24 文件、218 项通过；构建通过 |
| Schemas 包级 | `pnpm --filter @thesis-ledger/schemas test`；`pnpm --filter @thesis-ledger/schemas build` | 14 文件、154 项通过；构建通过 |
| Server 包级 | `pnpm --filter @thesis-ledger/server test`；`pnpm --filter @thesis-ledger/server build` | 71 文件、505 项通过；构建通过 |
| 仓库静态 | `node scripts/check-boundaries.mjs`；`node scripts/check-workspace-dependencies.mjs`；T3.2 目标文件 ESLint | 全部通过；`git diff --check` 通过 |

### 完成边界

T3.2 已完成本地代码与受控事实验证，但不扩大原任务范围。T3.2 阶段的证据未覆盖真实 DSA Provider 的历史上市/停牌和规则覆盖、Docker/Redis/PostgreSQL/Worker 运行态、API/客户端披露或首个 `600519.SH` 真实目标场景；其中 API/客户端披露已由后续第 9 节在 T3.3 的本地边界内补齐，真实 Provider、运行态和首个目标场景仍分别属于 T2、T3.1 和 T4。未执行数据库迁移、镜像构建、服务重启或部署验收。

## 9. 2026-09-11 T3.3 模型披露与失败原因

### 实现范围

- Schemas 新增可选 `executionModelDisclosure`，复用完整 `execution-model-v1`；任务创建、详情及摘要返回所选配置，Runner 结果附带冻结模型内容哈希。模型来源、版本、区间和假设保留，结果 `completeness` 独立表达。旧响应不补模型、不重写旧结果。
- Desktop 现有配置对话框支持完整 JSON 配置、解析预览及显式确认；修改文本后清除确认，留空维持旧运行语义。提交前校验模型范围与策略适用性。任务列表显示选择，结果展示范围、来源版本、配置时间、假设及冻结哈希；失败任务可通过“查看失败详情”进入披露区域。
- Server 保留外层 `DATA_UNAVAILABLE` 及底层诊断码、原始原因；Desktop 收到 HTTP 成功但业务状态为 failed 时显示失败，不提示已排队。英文原始原因不再被通用错误文本覆盖。
- 新增披露组件及 RunConfig 文件承接本次职责，复用现有组件和请求体系，未新增规则页、默认 fixture 预设、CSS 或组件安装。没有修改数据库、Docker、部署或 T4。

### 最终定向验证

下列结果来自未提交的共享工作树，包含最后新增的失败详情入口及格式化变更；仅证明本地契约、受控 Runner 和组件输出，不证明真实 Provider 可用。

| 范围 | 命令或检查入口 | 结果 |
| --- | --- | --- |
| Schemas | `pnpm --filter @thesis-ledger/schemas exec vitest run test/backtest-disclosure.test.ts test/backtest-execution-model.test.ts test/backtest-v2.test.ts` | 3 文件、31 项通过；覆盖旧响应、模型校验、冻结哈希及 partial 不升级 |
| Server | `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/model-disclosure.test.ts test/backtest/v2-run.test.ts test/backtest/v2-runner.test.ts test/backtest/v2-snapshot-builder.test.ts` | 4 文件、15 项通过；覆盖 controller/summary 披露、原始失败码、受控 Runner 冻结模型及旧路径 |
| Desktop | `pnpm --filter @thesis-ledger/desktop exec vitest run test/backtest-model-disclosure.test.tsx test/strategy-library-ui.test.tsx test/strategy-save-feedback.test.ts test/refactor-contract.test.ts src/features/strategy/strategy.ui.test.tsx` | 5 文件、59 项通过；覆盖配置确认输出、范围拒绝、来源/假设/完整度、失败反馈、既有错误文案本地化与旧提交兼容 |
| 构建 | `pnpm --filter @thesis-ledger/schemas build`；`pnpm --filter @thesis-ledger/server build`；`pnpm --filter @thesis-ledger/api-client build` | 全部通过 |
| Desktop 类型与构建 | `pnpm --filter @thesis-ledger/desktop build`，包含 `tsc -p tsconfig.json --noEmit && vite build` | 通过；Vite 提示分块超过 500 kB，不阻塞构建 |
| api-client 既有本轮证据 | `pnpm --filter @thesis-ledger/api-client exec vitest run test/backtest-disclosure.test.ts` | 2 项通过；最终轮仅重跑构建，测试输入未变 |
| 浏览器 | 仅建立浏览器连接，未打开页面或进行交互检查 | 未执行展示验收；静态组件渲染不等于浏览器验收 |

前一轮发现的 Desktop AST 类型问题、旧 V2 提交兼容性问题和 Server null 响应类型问题均已修复；最终指定检查无失败。用户确认交互的浏览器点击链路及真实任务展示仍未验收；组件证据覆盖确认前后输出和配置解析，真实展示保持归属 T4。

### 完成边界与剩余依赖

截至 T3.3 完成时，本地 API/客户端披露已按其定向验证边界勾选，T4 尚未完成；该历史文档轮未创建真实回测，也未执行运行态或隔离验收。后续第 10 节已完成固定 CN 股票日频场景的 T4；T1/T3.1 整体、完整历史关键事实 Provider 与 V2 T13 仍未完成。没有未定义契约 blocker。配置入口沿用完整 JSON，未提供未经确认的默认预设；所有 fixture 仅用于本地测试。共享工作树改动保留，未暂存或提交。

## 10. 2026-09-11 T4 最小真实闭环复验

### 真实环境与实现修复

- 当前 DSA 镜像为 `30a5e24076cd`；Server/Worker 使用同一新镜像 `bcae3816afa9`，均挂载 `thesis-ledger-backtest-data:/app/var/backtest`。PostgreSQL、Redis、DSA、Server、Worker 最终均为 `healthy`；未执行 migration、volume 删除、数据清理或缓存清理。
- 真实失败 `145d7946-296a-4323-a1f7-f7676ee453ae` 证明旧 Builder 会把 Provider 内嵌 `executionRules.unavailable` 当作硬门禁。按 Spec 的研究模型边界，Builder 现仅在“执行标的且已显式选择、校验完整的研究模型”时由该模型替代旧执行规则门禁；Provider 整体 unavailable、身份、币种、lot/tick、日历、公司行为及模型范围冲突仍失败关闭。
- 定向验证：`pnpm --filter @thesis-ledger/server exec vitest run test/backtest/v2-snapshot-builder.test.ts test/backtest/snapshot-execution-model.test.ts` 为 2 文件、13 项通过；`pnpm --filter @thesis-ledger/server build` 与 `node scripts/check-boundaries.mjs` 通过。

### 成功运行、重放与隔离

- 固定策略版本继续使用 `4b01aa1c-6efb-465f-aaf0-f256e6f5c530`，未重建。真实 Run `40f04c1f-12a5-4456-8413-c435f0292eed` 使用 `600519.SH`、`2024-01-02..2024-03-29`、CNY 1,000,000 及固定模型 fixture，收敛为 `succeeded`。
- `snapshotId=8d8d15f58f9f24a2cbbb75d43872e4cd409b2a5270d12d3c4c1921034b3f3523`；模型 `contentHash=0b6ac70a935bf63b1a79b1358ce5853624dce4892d6cc03d26a0565b953a5cdf`；Instrument Facts Artifact `contentHash=3ca395e617ee8afebf5a160d26cb1457efdce2c664875d0ba2a88c5e4db07f17`；raw Bar Artifact `contentHash=fd9300bb7ca209ce5365556e1fe7e6166932d02ed6cdae39c90f1dcfd256d412`。
- 首次结果与直接从同一 finalized Snapshot 重放均为 `resultChecksum=d15e188e03109748`；重放产生 2 个 fill（买入 1、卖出 1）、1 个闭合交易及 58 个日权益点，`completeness=partial`。模型来源、版本、范围、假设及冻结哈希已由真实 API Result 返回；该 API 证据不替代浏览器展示。
- 成功运行前后只记录计数和内容哈希，五张真实账户域表严格一致：`AccountLedgerState` 1=`4e7acffda11e61457079412943ba3cf5`、`JournalEntry` 0=`d41d8cd98f00b204e9800998ecf8427e`、`LedgerEvent` 1=`31d6eae0cb2c43bc9216aef03d02b111`、`PortfolioSnapshot` 15=`178a8bfc3d5f119a7d17231ca35cf5be`、`Trade` 1=`9d4e545b32c08d21784cd59d75edeaa1`；未输出业务行内容。

### 故障注入、恢复与浏览器验收

- 将该 Run 的 execution Artifact 临时改名后直接重放两次，两次均稳定得到 `ARTIFACT_NOT_FOUND`，且错误为同一逻辑 key；`finally` 恢复原文件后再次重放，snapshotId 不变、checksum 恢复为 `d15e188e03109748`、fillCount=2。首次使用 Manifest 逻辑 key 猜测物理路径时在 `access` 阶段即 `ENOENT`，没有改动文件；后续按 ArtifactStore 的 `artifacts/` 物理根目录执行成功。
- Browser blocker 已通过独立临时实例解决：未重启、修改或中断原有 healthy 服务，在空闲端口以 `pnpm --filter @thesis-ledger/desktop dev --host 0.0.0.0 --port 5174 --strictPort` 启动临时 Desktop Vite；in-app Browser 成功打开 `http://127.0.0.1:5174/strategy` 并连接现有 API。固定 fixture JSON 成功解析并展示模型范围、来源、版本与简化假设，点击后进入“已确认执行模型”状态；真实成功结果展示 `completeness=partial`、模型内容哈希 `0b6ac70a935bf63b1a79b1358ce5853624dce4892d6cc03d26a0565b953a5cdf`、58 个权益点、1 笔闭合交易、`resultChecksum=d15e188e03109748` 与完整 snapshotId；失败 Run `145d7946-296a-4323-a1f7-f7676ee453ae` 的详情展示 `DATA_UNAVAILABLE`、缺少覆盖历史区间的规则事实及 `snapshot` 路径。该失败行时间与只读 API 的 `createdAt=2026-09-10T08:56:07.883Z` 精确对应。验证后已关闭临时标签并停止 5174 进程；原 `[::1]:5173` 监听未中断。
- T4 结论：运行态 AC7、AC8、AC10 与 AC9 的真实 API/Browser 披露在固定场景均已通过，T4 完成。V2 T13 继续保持未勾选，且本次 CN 股票日频闭环不代表 ETF、NAV、FX、拆分、HK/US 或分钟周期已完成。

## 11. 2026-09-11 T1 NAV 费用适用契约收束

- NAV 费用采用独立于 Exchange 的契约：申购费按不含费用的申请本金另加，赎回费按确认份额乘确认 NAV 的费前赎回款扣除；两者均逐申请应用费率和最低额，在确认时按 CNY 两位小数 `halfUp` 扣收。不适用费用必须显式给出原因。
- Schema 与 Domain 均拒绝非法 side、basis、currency、rounding、decimal places、collection 和扣收时点；Domain 使用确定性 `DecimalValue`，先应用最低额再舍入。`CnNavSimulation` 与 Server NAV 事件编排仅替换为 NAV 专用计费入口，未改变 Provider、Snapshot Builder、队列、部署或无模型流程。
- 验证：`pnpm --filter @thesis-ledger/schemas exec vitest run test/backtest-execution-model.test.ts`，16 项通过；`pnpm --filter @thesis-ledger/domain exec vitest run test/backtest-execution-model.test.ts test/execution-model-consumption.test.ts`，14 项通过；Schemas 与 Domain build 通过；`pnpm --filter @thesis-ledger/server exec vitest run test/backtest/v2-runner.test.ts`，2 项通过。另在本轮接线后执行的 `test/backtest/v2-execution.test.ts test/backtest/v2-runner.test.ts` 共 5 项通过。
- 证据边界：以上为未提交共享工作树上的契约、受控 NAV 生命周期和类型构建证据，不证明真实 NAV Provider、T3.1 完整目标范围、Docker/Worker 或 V2 T13。

## 最终一致性 Review

- [x] 本轮新增/重叠文件按实施前内容复核，未覆盖既有修改，未改变提交状态。
- [x] 契约费用/分段、模型消费及范围请求拒绝切片具备定向证据；旧执行回归与新模型 Runner 证据分别记录。
- [x] 原 T0–T4 完成义务保持不变；T3.3 仅按其本地披露验收边界勾选。
- [x] T3.2 的 RunConfig 模型快照消费、费用/资金/NAV 生命周期和受控重跑验证已完成。
- [x] T3.3 本地 API/客户端披露及最终定向测试、相关构建通过；固定场景的模型确认、成功结果和失败详情真实展示已验收。
- [x] 固定 CN 股票场景真实 Runner 买卖闭环、同 Snapshot 重放、账户隔离及 Artifact 缺失/恢复复验通过。
- [ ] RunConfig、模型冻结/哈希、Runner 与客户端的全部产品契约就绪且完成披露。
- [x] 实际 Runner 受控买卖闭环及 T4 固定场景真实验收通过。

结论：T1 可冻结模型契约已在 NAV 费用适用性补齐并完成最小定向验证；固定 CN 股票场景的既有真实闭环、重放、账户隔离、Artifact 故障恢复及 Browser 三条展示链路状态不变。该证据不覆盖完整目标市场、资产与周期，T3.1 整体及 V2 T13 继续保持未完成。
