# 策略表达首批真实模型逐例语义复核

后续经用户授权的9例复验见[追加复验记录](2026-11-19-strategy-expression-model-recheck.md)，本页保留首批17次的原结论。

对应[主实施记录](2026-11-19-strategy-definition-remaining.md)与[上层任务](../archive/tasks/2026-11-13-strategy-definition-authoring.md)。用户授权最多17次，实际发送13次业务样本与4次私有用途资格探针，合计17次，没有自动重试。沿用原模型 `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m` 与原路由；写入仅限隔离库，行情是受控样本。

结构层结果为5例正式保存／冻结／回放通过、1例分析结构通过、7例校验或回放失败。按原始意图独立复核后，仅4例语义通过，9例未通过；趋势、逆势及同义表达的整组成对验收尚未满足。

| 样本                       | 语义结果 | 实际配置与判定                                                                                                                          |
| -------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| relative-breakout          | 未通过   | entry 仅有未持仓，遗漏排除当根的20根前高及EMA20的102%；另加未要求的日线委托。首例受控费用曾与原意不一致，后续夹具已修正，本例保持失败。 |
| count-confirmation         | 未通过   | entry 改成 close>0，缺少未持仓、五中取三和逐根连续确认；另加日线委托，冻结回放也拒绝。                                                  |
| statistics-gap             | 未通过   | entry 仅有未持仓，遗漏总体标准差、滚动分位和绝对跳空条件；另加4根冷却及日线委托。                                                       |
| trend                      | 未通过   | 上下穿方向正确，但两处明确指定的EMA20被改成MA20；结构和回放通过不能替代语义通过。                                                       |
| reversion                  | 通过     | 实际entry为未持仓且close下穿EMA20，exit为close上穿EMA20；仓位、费用和后开盘成交保持确认配置。                                           |
| trend-synonym              | 通过     | 实际entry/exit分别为close上穿/下穿EMA20，符合前<=今>与前>=今<的同义表达，未更换指标或方向。                                             |
| captured-retest            | 未通过   | 20根前高退化为上一根high；未配置capture/eventValue，等待期间阈值重新计算；另加未声明low字段的日线限价委托，正式校验拒绝。               |
| directional                | 未通过   | ADX14>25、+DI>-DI、MA20>其前值与未持仓均正确，但擅自添加dailyBarOrders；缺少该模拟撮合政策导致冻结回放拒绝，整例不通过。                |
| confirmed-divergence       | 未通过   | 价格低点比较正确，但RSI分别查找自身摆动低点；原意要求在同两个价格低点的原时点取RSI，应使用low为input、RSI为sample。                     |
| timeframes-anchor          | 未通过   | 未声明discovery-1h额外来源，两处均线条件变成close>close；累计锚点存在仍不足以满足多周期原意，正式装配拒绝。                             |
| unsupported-data-portfolio | 未通过   | 没有选择unsupported报告分支，改用嵌套sequence占位，无法表达财报修订时点、成分选股、行业上限或期货对冲；整例失败。                       |
| only-entry-period          | 通过     | 仅entry.right.params.period由20改为30；回退这一数值后与原始定义深度相等，其他字段未变。                                                 |
| unspecified-average        | 通过     | 需求保持unresolved并提出MA或EMA待确认问题，未生成或代选均线策略。                                                                       |

## 证据及边界

原始消息、真实wire、返回配置、中文回读、隔离保存及回放产物保留于 `var/acceptance/strategy-expression-model-live-20261119/`。`matrix-execution.json`记录实际发送次数；`semantic-review.json`逐例保存原意、配置、判定与输入／回执SHA256。仅改周期样本另将30回退20后与原定义深度比较，确认没有其他字段变化。

首3个探索与首个趋势样本使用初始提示；后续样本使用已补充EMA定义和完整入场核对的提示，失败不因提示更新而改判。首例费用夹具问题独立保留；不能用它解释其遗漏的入场条件。最新提示继续具体说明冻结capture、价格低点的sample、额外周期声明及能力缺口分支，定向本地合同检查另记主实施记录；这些修正尚未获得新的真实模型通过证据。

已授权17次全部用完。新增真实模型调用须另行明确授权；既有失败不得覆盖、复用名义资格冒充新探针，或把受控AST单测提升为真实模型语义通过。本轮不自动更换模型、路由或替模型改写AST。
