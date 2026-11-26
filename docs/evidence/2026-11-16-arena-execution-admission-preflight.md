# ETF 费用核对与来源准入预检

## 本次结论

佣金核对和两证券精确准入材料整理已完成；**实际来源准入未完成**。真实运行态 DSA 仍为 `historical-execution-archive-v1`，缺少 v2 索引和状态重建合同，而本次真实材料使用 v2。用户明确要求本批次不部署，因此保持未启用、未写生产归档和准入，不注入新代码，也不把重建证据降为原生快照。

本次仅有实际运行态只读查询和本地资料计算；没有外部行情／规则请求、模型请求、比赛操作、部署或业务写入。对应主仓 AC14／R1A1～R1A3、DSA H7A／H7B；前一批[真实资料离线验证](2026-11-16-arena-real-execution-offline.md)继续有效。

## 现有佣金与经手费

通过 PostgreSQL 只读事务核对原周期 `7e155817-ccfc-45bc-b812-01d9b8906beb`，冻结业务时点为 `2026-11-10T05:01:00.000Z`，完整输入摘要为 `1f8fd6a6dd243bba2c19e5cae1452e06a4f7eb1697c5e8d124472b39ef670d25`。冻结协议与全部三场现有比赛的费用均为：

```json
{"version":"fixed-v1","buyBps":0,"sellBps":0,"minimum":"0","slippageBps":0}
```

这些是 Arena 模拟账户配置，当前协议没有真实券商账户或收费方案绑定；不是券商对账单。核对范围内不存在已含非零经手费的券商佣金。该结论适用于现有零佣金配置，不能据此推断其他非零佣金或外部真实券商的含费口径。

实际运行态 `@thesis-ledger/domain/dist/arena-live-order-price.js` 与宿主已构建文件摘要相同，均为 `12abd08a02b7d933755b56635ec53eaba2e039cc9e6bbdbdb268bf7a99f1ac2b`。实际公式为配置佣金与法定收费相加；配置佣金先按买卖费率和最低额计算。公开经手费由 Market 执行资料独立提供，中国结算代收表没有再加一份同项费用。

以实际冻结费用和两证券真实归档中的费率，调用字节相同的生产 `arenaOrderFee` 做纯离线计算：

| 证券 | 成交金额 | 配置佣金 | 经手费率 | 买入总费用 | 卖出总费用 |
| --- | --- | --- | --- | --- | --- |
| 588000.SH | 10000 元 | 0 元 | 0.00004 | 0.4 元 | 0.4 元 |
| 510300.SH | 10000 元 | 0 元 | 0.00004 | 0.4 元 | 0.4 元 |

没有重复计入经手费；未修改零佣金、比赛协议、账户或历史成交。这次核对关闭的是现有模拟比赛的费用口径问题，不认证任何外部券商实际账单。

## 精确准入材料

复用 `.recovery-artifacts/arena-real-execution-20261116-final/` 的 15 份去重原文和已核验 v2 索引。对两个请求逐一使用当前宿主的真实 `ExecutionArchive` 及 Python 合同读取；审计钩子禁止所有网络及 SQLite，两个结果均正常。

| 项目 | 候选值 |
| --- | --- |
| 精确能力 | CN／ETF／`HISTORICAL_EXECUTION_CONTEXT` |
| 精确目标 | `historical-execution-archive / qualified-cn-execution` |
| 证券范围 | `588000.SH`、`510300.SH` |
| 日期范围 | 2026-11-10 至 2026-11-10 |
| 代表验证时点 | 北京时间 2026-11-10 13:01 |
| 适配器修订 | `historical-execution-archive-v2` |
| 来源修订 | `archive-v2:42b117390db03f95d4c2e0bf5542ec640e84cf64cd85f14ba74242a417b944ca` |
| 凭据修订 | `not-required` |

同一精确绑定的准入记录可持有两个证券的明确 `scopeSymbols`，不扩大为全部 ETF、股票、其他日期或整段 11 月 2 日起回放。

代表请求 `requestId` 为 `admission-preflight-20261116`、`policyRevision` 为只读观测的 200；这里只用于私有资料资格读取，没有向不存在的实际路由发送请求。固定请求的真实结果摘要：

- 588000：`3bd3ad045400c1d54689e4ddc7d674b24cc0227941e8a5a13b305f58d4a80710`，正常交易、上市日 2020-11-16、限价 1.062／1.592。
- 510300：`574e053578789efb6cadd3d68ff2a8ff4737284f1a4395338906b7868dc4492b`，正常交易、上市日 2012-05-28、限价 3.717／4.543。

候选与预检的结构化记录位于 `.recovery-artifacts/arena-execution-admission-preflight-20261116/plan.json`，状态明确为 `blocked-runtime-incompatible`、`applied: false`。该计划是可审查证据，不是已保存准入，也不是可以跳过重新预检的控制请求；正式准入有效期须在兼容实际运行态中重新生成。

## 实际运行态阻塞

只读核对时间为 2026-11-16 19:34 左右（Asia/Shanghai）。目标容器：

- DSA：`2dfe15b71762d4a79a809710c605d214e69a73d56583b86ea707b79ae7672dd6`，启动于 `2026-11-16T07:55:28.446026596Z`。
- Server：`00d1dd669ae287258490a119c865750bce9f4a0cb30236dc4e8cab81a2acfb9d`，启动于 `2026-11-16T10:19:44.180607504Z`。

DSA 实际源码情况：

- 来源为 `historical-execution-archive-v1`／`archive-v1:`，文件摘要 `a4f4ec96cb8f25bfb192c928aa19b62cdce4d37ff2d0ca2e384e421848ddf1d0`。
- 上下文合同文件摘要 `95ed04f395264532fa48ef69f0295355c738ec4a2c3bc3e3b1b40b0be8466f9b`，未支持重建证据。
- `src/services/thesis_ledger_historical_trading.py` 与 `src/services/thesis_ledger_historical_reconstruction.py` 均不存在。
- `/app/data_provider/market_reference/historical_execution/index.json` 不存在。

进一步将宿主真实归档读取出的两个完整结果，经 stdin 交给**实际运行 Server 的** `historicalExecutionResultSchema.safeParse`，两者均接受且状态为 `trading`。这只验证消费者合同，没有调用 API、Market 业务执行或写入数据。运行态 `market-historical-execution.js` 摘要为 `685115485dddf98cdc9304b50fb22e9cafea9b6e4362cf0dfa833da013bb460d`，其引用的 `market-historical-trading.js` 摘要为 `c1678ce60f2eb3f96a5ae9b9e6f7267459a7fe625025802f02c074b86a9d801a`。因此当前已证实的代码阻塞集中在 DSA，不能笼统声称 Server 也缺相同合同。

控制库以 SQLite `mode=ro` 和 `PRAGMA query_only=ON` 读取，未调用会初始化或迁移数据库的构造器：

- 政策修订 200，146 条原路由，没有 `HISTORICAL_EXECUTION_CONTEXT` 路由。
- 没有该来源显式配置，源码默认关闭；没有该来源准入记录。
- 9 条来源配置保护摘要为 `4c88356a462c9c7074fc866de23085fdfb7988aeb7ded0d77a21c5f133b86efe`。
- 9 条原准入记录保护摘要为 `783c0a29f869708321ac04982026b9e8d1e9d956b3378716f39fe785d8ed0c39`。

现有三场比赛分别为运行中、暂停、已结束，各一场；没有暂停、恢复或操作任何比赛。未来启用来源前必须重新确认消费者不会因此自动发起模型调用，不能把“没有手动启动”当作零模型副作用证明。

直接把 v2 索引复制进当前运行态会被旧合同拒绝；给当前 v1 适配器写入 v2 准入也不能产生合格执行结果。当前缺口是实际 DSA 升至与现有消费者兼容的重建版本，并安装／加载相同索引修订；来源修订在进程加载时冻结，不能在新材料安装后继续复用旧进程的空归档修订。用户本轮禁止部署，故实际准入保持未完成。没有采用注入新模块、替换证据类型或绕过准入的方式。

## 验证与接续

本批次不修改产品或测试源码，因此复用上一批 8341 项／323 个子测试、Server 50 项、完整类型／构建和架构检查，不重复全量门禁。18 份核心输入组合摘要仍为 `1031b5b96ccbc1445cc0b2e99e65a9814b18f1590665cd0640965cdd687eeff5`。新增实际核对包括只读冻结协议／运行计算器、两证券真实资料读取、相同生产公式的两侧费用计算、实际 Server Schema 接受两个真实结果，以及目标版本和控制预检。

结束前复核通过：来源配置和原准入记录的全部保护摘要相同，政策仍为修订 200／146 路由、无历史执行路由，生产归档仍不存在。原周期冻结输入摘要、三场费用与状态计数均相同；观察的 `AiInvocation`／`AiInvocationFact` 行数分别保持 3／6。本次没有模型传输代码或比赛操作；这些计数是补充核对，不替代对零调用执行边界的确认。

最终一致性审查通过：计划的范围、原材料摘要、候选修订、实际首个阻塞、零写入边界及任务勾选共 8 项核对通过，两仓 `git diff --check` 通过。最终计划摘要为 `2ccb8b5c7554165fdea7785459e0e62e14c5231523f89793b3fea69e8317e9fe`；活动 Task 保持 R1A1／R1A2、H7A 完成，R1A3／H7B 和父任务未完成，不移动到 TODO 或归档。

R1A1／R1A2 的证据已备齐；R1A3／H7B 的解除条件是实际运行态与资料兼容，并能在零模型／比赛副作用条件下通过正式控制入口完成精确准入、读回和真实执行上下文查询。本批次没有部署授权，亦未执行生产材料、来源开关、政策或准入写入；父任务 R1、R3、R4 继续保持未完成。
