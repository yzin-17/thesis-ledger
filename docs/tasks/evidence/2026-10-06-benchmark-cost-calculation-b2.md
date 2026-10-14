# B2：冻结执行模型基准费用计算本地交付

> 日期：2026-10-06
> 对应任务：[B2实施记录](../../archive/tasks/2026-10-06-historical-rules-primary-backup.md#benchmark-net-return-tasks)
> 结论：B2 本地计算及版本兼容通过；B3／B4保留，目标旧结果继续按原事实披露。

## 范围与行为

用户在B1交付后要求继续，执行现有B2叶。开始时主仓616条、DSA56条、infra49条dirty记录全部保留；已向获用户授权协调的“历史市场规则来源核验”说明共享基准写集。本次只实施主仓合同与计算，不占目标更新窗口。

新股票／ETF Snapshot 在同一manifest合同冻结可选 `benchmarkCostVersion: 'execution-model-cost-v1'`，由内容哈希保护。旧快照缺字段时保持旧费用摘要、成本身份与计算；已finalized快照复用不补字段。未知版本被Schema和解析入口拒绝。本次没有数据库迁移或另建引擎。

新解析入口复用冻结公共费用与用户设置的组合模型。基准首日收盘买入、末日收盘清算，按各自日期、方向和成交额调用原 `calculateExecutionModelFees`；可负担数量继续由原 `fitNormalizedQuantityToAvailableCash` 求解，逐项分币取整与费用包含关系保持。

新成本指纹覆盖完整模型范围／时区、全部费用分段、记账口径与滑点；不绑定初始本金、首末价格或已付费用。中间费段规则变化会改变身份，即使基准只在首末交易。旧版本身份保留原本金绑定，保证历史语义一致。

## 独立金额断言

本地合成算例本金100、首日价10、末日价12，佣金0.0003且每笔最低5，公共税仅卖出收取；转让费设为显式0，经手费／监管费包含于佣金。

| 项目 | 金额或数量 |
| --- | --- |
| 可负担数量 | 9.5 |
| 买入金额／费用／扣款 | 95／5／100 |
| 买入后现金 | 0 |
| 末日卖出金额 | 114 |
| 新税率0.0005时卖出费用 | 5.06，其中税费0.06 |
| 期末现金／净收益 | 108.94／0.0894 |
| 旧税率0.001时卖出费用／现金 | 5.11／108.89 |

断言使用明确预期金额，未以同一费用计算器生成预期。另核对本金4不足支付最低费时返回 `INSUFFICIENT_CASH`，零本金、日期覆盖缺口、混合币种、费用币种不匹配、取整设置和未知版本均保留局部不可用路径。更换本金或价格会改变计算结果，但保持相同费则身份。

## 历史版本兼容

在Server重新构建之前，实际导入改动前的本地构建产物进行两组对照：

1. 相同冻结费用输入的最低费拒绝、比例费结果和显式零费结果，旧构建产物与新代码历史路径完整解析结果相同。其版本／指纹及金额已固化为3项持久回归断言。
2. 同一个临时旧Snapshot由旧Runner构建产物与新源码Runner分别重放，完整结果对象及 `resultChecksum` 相同。旧快照复用、内容身份和重复重放回归持续保留；阶段对照完成后移除对旧生成产物的测试依赖。

改动前构建产物SHA-256：

- `backtest-v3-benchmark-cost.js`：`8f851ef17930876f1a60a03b614eb1e139f66aa6e8b7de28d52733ac347b6ab8`。
- `backtest-v3-runner.js`：`71b5a325370357b1c589b032b57718b65ee4f8da1e31fca0e1c2df55d1449122`。

收费Snapshot集成关闭DSA费用／策略读取后重复运行，请求计数保持原值；新版本基准净收益和超额收益可用，原执行模型哈希及RunConfig身份不变。这是本地实际Artifact／Runner集成，价格为合成输入，真实来源与目标离线重放继续归B4。

## 验证记录

命令从主仓执行，均使用 `rtk proxy`。仅记录最终统计及真实失败原因。

| 检查 | 命令或输入 | 结果 |
| --- | --- | --- |
| Server定向 | `pnpm --filter @thesis-ledger/server exec vitest run`：v3-benchmark-cost-model、v3-benchmark、public-fees-snapshot-v3、v3-sparse-benchmark、v3-runner五文件 | 39项通过 |
| Schema定向 | 新成本版本与既有Snapshot合同两文件 | 10项通过 |
| Server包级 | `pnpm --filter @thesis-ledger/server test` | 301文件2447项通过；47文件217项按环境跳过；退出0 |
| Schema包级 | `pnpm --filter @thesis-ledger/schemas test` | 64文件717项通过；退出0 |
| 构建 | Schema `build` 后Server `build` | 均退出0 |
| 类型消费 | Server、Desktop、Mobile、API Client各自 `typecheck` | 均通过；Mobile只检查类型，本次不涉及原生工程 |
| 代码门禁 | 本次10份代码／测试的ESLint与Prettier；`check-boundaries.mjs`／`check-file-size-guardrails.mjs` | 均退出0；尺寸门禁保留9项其他文件存量告警 |

初轮定向回归有两项旧Runner断言仍期待“不支持／比例摘要”，类型检查还有可选结果和故意构造非法取整的测试类型错误；修正为新版本明确语义后复验。随后剩余一项断言仍要求新结果partial；该合成场景的有效指标已齐全，改为明确complete断言，并单独保留旧版本非complete回归。生产completeness逻辑未修改，目标结果未改变。

## 写集与稳定基线

- Schema：`backtest-snapshot-manifest-v3.ts`、`backtest-data.ts`及新版本合同测试。
- Server：`backtest-v3-benchmark-cost.ts`、独立历史算法helper `backtest-v3-benchmark-cost-legacy.ts`、`backtest-snapshot-v3-builder.ts`。
- 测试：v3-benchmark、独立cost-model、v3-runner及public-fees-snapshot-v3。
- 当前Spec／Task：补充冻结版本与兼容语义，勾选B2并保留B3／B4。

测试后生产源码SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| 成本入口，284行 | `5011ba8c77dd3d046ca8824a89e92b480221e1e5994b450f96e9c2cf2724296c` |
| 历史成本helper，125行 | `40467d453d21e4706118fbf525d42df9ee1b908e993a403b3d43a0831038130a` |
| 股票／ETF Builder，382行 | `29efd0e9acab60e22696ea332e8c37fa99a2eb8c2ae594fca27f486de9b830b9` |
| manifest Schema | `37acf5d688333db066b2ca3980be9032f0d44a685a3459dcc470fc508ce4133b` |
| Schema转导出 | `fed7db465373dc63bf8e68e7f41b3e3cb2488953633d2c3111dd58e112899257` |

生产Runner和Benchmark投影未修改；后者保持 `8308b86b90b2970e3e4ece12aae21561c6a988a63721f2074a879889190ba1a3`。成本入口从345行缩至284行；新增helper拥有明确的历史费用算法职责，未更改尺寸阈值、ignore或边界方向。

## 交付审查与后续

B2局部交付通过：AC6的计算与历史兼容得到本地证明，所有本次失败均已定位并复验。B3负责用户可见成本说明、指标状态及比较消费；B4负责既有600000窗口的新结果、资金／费用独立核对、目标重放和真实页面。没有把包级跳过计为运行门禁通过。

本次未部署、未改DSA或真实路由、未改写旧任务／Snapshot／结果，未stage／commit／push；Task继续保留，当前义务没有移入TODO或归档。
