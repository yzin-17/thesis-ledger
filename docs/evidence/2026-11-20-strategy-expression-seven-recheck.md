# 七例根因修复后的真实模型复验

对应[策略定义任务](../archive/tasks/2026-11-13-strategy-definition-authoring.md)的L04.3，承接[七例根因修复](2026-11-19-strategy-expression-seven-failure-root-causes.md)。用户明确授权原7例各一次真实复验，上限7次、0次新探针、复用原模型／路由及已有私有资格，仅写隔离库，不自动重试，保留旧26次回执。

## 最终结论

实际发送7次业务请求，3例通过、4例未通过。没有新增资格探针或自动重试。三个通过样本已完成正式校验、隔离版本保存、原样冻结、完整结果重复回放和人工中文回读；其中方向与背离的通用冻结样本没有成交，另以实际未改定义完成正反数据求值，不能把这部分称为新增Worker成交证据。

修复解决了本批可选委托误用、ADX非法输出、摆动价格与RSI取样混淆等旧问题；真实生成仍出现来源字段漏报、事件值未绑定和多周期时钟／锚点错误。不能把本批记为七例全部修复或AC09通过。13个独立业务样本按最新证据为9例通过、4例未通过；这是跨批次保留有效回执的总览，不是新基线下重跑全部13例。三批累计33次调用，其中29次业务、4次私有用途资格探针。

## 请求基线与实际执行

执行目录为 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger`。实际入口与非敏感参数如下：

```sh
rtk proxy env npm_config_registry=https://registry.npmmirror.com \
  STRATEGY_EXPRESSION_MODEL_LIVE=1 \
  STRATEGY_EXPRESSION_MAX_CALLS=7 \
  STRATEGY_EXPRESSION_REQUIRE_CACHED_QUALIFICATION=1 \
  STRATEGY_EXPRESSION_QUALIFICATION_DIR=/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/var/acceptance/strategy-expression-model-live-20261119/qualifications \
  BACKTEST_PLAN_CASES=relative-breakout,count-confirmation,statistics-gap,captured-retest,directional,confirmed-divergence,timeframes-anchor \
  node scripts/local-runtime/run-strategy-expression-model-matrix.mjs \
  /Users/yzin/code/thesis-ledger-workspace/thesis-ledger/var/acceptance/strategy-expression-model-root-cause-live-20261120
```

矩阵在infra目录经 `node scripts/infra.mjs locked --idle -- node <应用>/scripts/local-runtime/run-backtest-trade-plan-acceptance.mjs <本批目录>` 串行调用已登记的应用隔离入口。目标是四批独立PostgreSQL／Redis验收资源，不是目标应用部署。第一批退出0，后三批各因业务验收失败退出1；总入口在末例生成失败后退出1，七份终态回执均已落盘。退出1保留失败含义，不覆盖为“执行成功”。没有通过再次启动矩阵补采样。

实际模型始终为 `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m`，沿用原LMStudio原生Schema路由。发送前重建Domain／Schemas、零网络恢复原资格，并核对7份业务消息与审阅预览一致。资格恢复只证明路由／合同版本匹配，不等于新Schema已获真实验证。

本批7份实际wire均为strict原生输出，Schema逐对象等于审阅的准备格式；准备格式SHA256为 `f4384b5cafc37bb32917b0a9f240cc796a634637618b116c453cfa45c2ca96a4`。全批保持同一基线，没有在样本之间修改提示或合同。计数只匹配 `^wire-\d+-\d+\.json$`，不把 `wire-output-*` 算成额外请求。

## 逐例语义与执行结果

| 样本 | 结果 | 实际输出、拒绝原因与独立核对 |
| --- | --- | --- |
| relative-breakout | 通过 | `close > lag(1,Highest(high,20))`且`close > EMA20*1.02`，恒假退出、权益20%、原普通开盘市价均正确。正式冻结样本5月21日开盘买入。模型没有显式空仓节点，但普通引擎只在未持仓时选择建仓；同一实际定义在条件再次成立时，持仓无新买入、空仓产生建仓信号，未补写AST。 |
| count-confirmation | 未通过：正式校验 | 五中取三与连续三根各自`close>EMA20`正确，已沿用普通成交；`series=[close]`却引用`open`。正式拒绝“探索候选引用了未声明的series”，没有保存／冻结。 |
| statistics-gap | 未通过：正式校验 | 总体标准差`ddof=0`、带宽`lte`60根线性20%分位、`abs(open/lag1close-1)<0.02`均正确；主来源漏报`open`，正式拒绝且未保存／冻结。 |
| captured-retest | 未通过：正式校验及语义 | 前20根最高已使用正确嵌套，也未额外生成委托；主来源漏报`high`，且整个sequence省略`capture`，两处`eventValue`无绑定。原理由声称已冻结，实际AST没有。对未改输出的完整正式Schema离线检查同时报告来源与事件绑定错误；不能只把首次来源错误当作唯一根因。 |
| directional | 通过 | 14期`adx>25`、`plusDI>minusDI`、`MA20>lag1(MA20)`，high／low／close依赖及普通成交正确。原输出含`holdingPeriods=0`，普通引擎仍控制空仓建仓。隔离冻结及重复回放通过；未改定义在50根严格上升受控数据产生入场，在下降数据不入场。 |
| confirmed-divergence | 通过 | 两组均按low寻找左右各2根的严格摆动低点；价格组省略sample，RSI组取对应低点的RSI14。未改定义在受控低点30<40且RSI61.8408>7.1428时成立，右侧两根未完成不入场、完成才入场。普通成交、退出与仓位正确，隔离保存／冻结及重复回放通过。 |
| timeframes-anchor | 未通过：生成合同及语义 | `hourly/60m`已声明、主源依赖close／volume正确；但两处锚点均为无时区的`2026-03-02T15:00`，SDK拒绝“不符合Schema”，原wire-output保留。小时收盘又写为`lag1(hourly.close)`，MA5却取当前已完成观测，额外滞后一根且不再是同一小时比较。运行时本已按完成及可见时间筛选来源，不能用lag额外代替可见性。未保存／冻结。 |

“空仓”省略的等价性仅适用于这几份普通建仓定义的实际引擎路径；没有用它放宽交易计划、订单、加仓或其他持仓语义。来源声明和capture都是当前合同的有效依赖，不以人工补字段、推断冻结对象或采用模型理由替换它们。

## 零新增调用的复核与证据完整性

原始证据根目录为 `var/acceptance/strategy-expression-model-root-cause-live-20261120/`：

- `matrix-execution.json`：7次实际传输、四批终态及逐例技术类别。
- `semantic-review.json`：7份输入／回执摘要、实际配置、中文、原始输出、逐例人工判定及13例最新证据引用。审计核对旧22份业务输入及回执SHA256全部一致，旧四次资格回执继续保留；未覆盖任何历史失败。
- `relative-held-guard.json`：同一实际前窗定义的持仓／空仓对照，0次模型调用。
- `offline-review.json`：方向上升／下降对照、背离右侧确认前后与价格／RSI具体值，以及四份原始失败输出的完整合同路径。实际两份定义前后摘要相同，0次模型调用。
- `audit-receipts.mjs`、`offline-review.mjs`：可重复的本地只读证据核对，均退出0；不会发送模型请求，不把离线构造的诊断装配视为保存或通过。

独立只读Docker清单确认本轮隔离PostgreSQL／Redis均已退出，原应用、Worker、DSA及其他项目容器继续运行。真实Provider／路由／资格、目标业务库与历史策略保持原值；目标应用未同步，镜像未更新，没有Git提交或推送。

## 尚未完成的层级

L04.3已按授权执行完毕，但因4例失败保持未勾选，L04及G03继续开放。既有本地与隔离修复证据继续有效，不能替代当前失败的真实生成验收。当前7次授权已全部使用，不再新增模型调用。外部时点数据、独立参考资产、组合／多腿及空头执行仍按[能力规格](../specs/2026-11-13-strategy-rule-capabilities.md)具体披露，不因本轮错误改报为已经支持或新增系统。
