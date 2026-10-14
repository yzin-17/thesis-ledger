# B4：费用与股票基准净收益目标闭环验收

> 日期：2026-10-06
> 对应任务：[B4与最终审查](../../archive/tasks/2026-10-06-historical-rules-primary-backup.md#benchmark-net-return-tasks)
> 结论：B1～B4有界闭环通过，新任务complete；旧partial结果保持，历史状态与其他市场继续按各自任务推进。

## 验收场景与身份

沿用600000.SH、2023-08-23～29、腾讯原生qfq、固定供应商快照和显式归一化单位模型。策略每次以10000模拟金额参与，基准以初始100000在首个对齐日收盘买入、最后对齐日收盘清算；双方按自己的成交日期、方向和金额使用同一份冻结费用规则。

| 标识 | 实际值 |
| --- | --- |
| 策略／版本 | `c2ca9a3d-fda5-48ce-9715-d69ae8a61d73`／v2 `debb3916-6eee-4b39-8175-54655991e8bd` |
| 新任务 | `873ba8dd-40c3-4f9e-b1d5-b16192f697b0` |
| 持久终态 | succeeded、executionAttempt1、result.complete |
| 新Snapshot | `0046b0759593d8a66a2a1cb9f78979a3540942801f28e359c46484005a0a39a5`，finalized |
| 新结果校验和 | `a07303d0e7c0f3ce` |
| 冻结成本版本 | `execution-model-cost-v1` |
| 成本指纹／双方兼容指纹 | `4311d8b1cb67fd6c`／均为 `54b72c25c95956fc` |
| 实际价格源 | tencent／tencent，CN／STOCK／DAILY_BAR／1d／qfq，execution与benchmark均主源 |
| 实际费用源 | official-rules／cn-stock-auction-fees，主源 |
| 冻结费率内容版本 | `official-public-fees-88ca26355bad0e1016cf46eb6beff6018bab45918eb562aeb51ed50adf64c3e7` |
| 策略配置 | revision39／dsaRevision39／applied，7条路由保持 |

标准API再次读取确认终态、attempt、Snapshot和结果；业务状态来自持久记录，不以队列状态或健康代替。旧任务 `652ba051-a4c5-493d-81e6-2cdbe3c090f0`仍succeeded／partial，Snapshot `dbcb6825…`和checksum `8c66f3f721f5e4d8`保持。

## 正式更新与验证基线

开始时主仓640条、DSA56条、infra49条dirty记录保留。“历史市场规则来源核验”确认P5.3b尚未修改Builder／Runner生产写集，当前源码冻结，目标更新与策略配置窗口由本任务使用。本轮不更新DSA、数据库结构或费用事实。

Server定向37项通过；随后当前包级303文件2463项通过，47文件217项按环境跳过。B3 Desktop最终706项与构建结果继续有效；正式脚本重新构建Server及shared／domain／schemas，均通过。脚本的兼容预检通过，没有放宽依赖、Prisma或空间门禁。

实际入口：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra/scripts/sync-code.sh thesis-ledger`；cwd为infra仓库，目标thesis-ledger与backtest-worker，默认参数，无跳过门禁，退出0。调用经 `rtk proxy`，仅对正式入口进行日志捕获。宿主检查约4.31GiB剩余，未清理缓存、镜像、卷或数据。

同步后Server／Worker均healthy，镜像保持 `95d8e518ffee019a8a29a13979b4fd9736f914153c4b78c636d6e0866c87a0b0`；DSA仍为 `08bfe1b5a0d59d6b27c54e961a5850f603885b4686d459818897c68d3bcd250e`。两消费者的成本入口、历史兼容helper和Builder实际JS哈希与宿主构建产物一致，新成本合同可解析。以下是该验收时点的构建基线：

| 构建产物 | SHA-256 |
| --- | --- |
| `backtest-v3-benchmark-cost.js` | `39fc26ac72765aacd517e0eb353aa6b67184d4e9a002ce6e172a5b28b30c63b5` |
| `backtest-v3-benchmark-cost-legacy.js` | `dbf2b7f0cb3ed318b2f3928cacb9190dae57055b7348d119ff23fc67fd455481` |
| `backtest-snapshot-v3-builder.js` | `1291641f771c978fb056da16cb37c187b44a5ea467e85a31a4376f63e7d95995` |

该更新位于容器可写层，不是不可变镜像发布证据，容器重建会恢复镜像内代码。

## 新任务、独立金额与重放

维护既有 `scripts/historical-public-fees-target.mjs` 的可选 `--benchmark`断言，默认既有场景保持。以 `FEE_TARGET_STRATEGY_VERSION_ID=debb3916-6eee-4b39-8175-54655991e8bd`运行 `--run --benchmark`，退出0；沿用策略而创建独立任务，标准准备／创建／读取API完成。policy39及全部路由保持，未触发PUT修改。

策略4笔成交、2笔平仓，费用仍为35.25；8月25日卖出按0.001税率收9.93，8月29日按0.0005收4.92。基准自己的费用如下：

| 基准项目 | 独立核对值 |
| --- | --- |
| 初始CNY现金 | 100000 |
| 首末价格／滑点 | 5.87／5.92／0 |
| 连续归一化数量 | 17030.4957410562180579216354344122657580919931 |
| 买入金额 | 99969.01，完整值比该数少5.03×10⁻⁴⁰ |
| 买入费用 | 30.99：佣金29.99、过户费1.00 |
| 买入后剩余现金 | 5.03×10⁻⁴⁰ |
| 卖出金额 | 100820.534787052810902896081771720613287904599152 |
| 卖出费用 | 81.67：佣金30.25、印花税50.41、过户费1.01 |
| 总基准费用 | 112.66；已包含规费的项目未重复扣费 |
| 期末现金 | 100738.864787052810902896081771720613287904599655 |
| 策略净收益 | −0.00265878836900613904，约−0.265879% |
| 基准净收益 | 0.00738864787052810903，约+0.738865% |
| 净收益差 | −0.01004743623953424807，约−1.004744个百分点 |

独立脚本[Decimal核对入口](/private/tmp/thesis-benchmark-independent-check-20261006.py)读取真实任务及只读冻结输入，使用Python Decimal自行计费、求可负担数量并核对现金账；没有复用Domain计算器。金额、20位收益及收益差逐项一致，同时证明下一最小连续数量会超出资金。金额很小的残余现金保持完整值，不按展示精度重算收益。

维护既有 `scripts/historical-public-fees-replay.mjs` 的可选基准读出。通过只读 `docker exec -i -w /app thesis-ledger-dev-thesis-ledger-1 node --input-type=module - <id> <checksum> source [--benchmark]`传入维护脚本；不复制文件、不保存新结果。新旧任务各运行两次，完整结果相同且分别匹配各自持久校验和，fetch网络计数均0。基准首末日与权益首末估值日核对后，再读出同一冻结组合费用供独立复算。

脚本syntax与Prettier通过。ESLint执行退出0但两份脚本被既有ignore覆盖，未将该输出记为实际lint覆盖；syntax、Schema计划和真实运行承担脚本验证。

## 真实Web与诊断下载

实际页面：[新回测结果](http://127.0.0.1:5173/strategy/jobs/873ba8dd-40c3-4f9e-b1d5-b16192f697b0)。隔离无头Chrome使用真实API，无响应拦截；请求均200、页面异常为空。

首轮5173旧Vite进程缓存旧模块，页面仍显示旧“累计收益”且没有新基准栏目。同一源码路径磁盘已有B3；增加新查询键后模块返回新标记，证明是变换缓存。确认PID78913和Desktop cwd／原 `vite --host 127.0.0.1 --strictPort --force`启动参数后，终止该宿主开发进程，经项目 `pnpm --filter @thesis-ledger/desktop dev --host 127.0.0.1 --strictPort --force`重启，同端口就绪。该操作未改Docker状态，新开发会话保持运行。

页面实际显示策略−0.27%、基准+0.74%、净收益差−1.00%、4笔成交与2笔平仓，完整性中文为“完整”，没有partial横幅。费用页显示0.1%／0.05%两段税率、冻结版本、六项来源及政府转载性质；执行模型逐笔计费、首末清算与收益差定义均可读。首次可见时间保留“尚未核验”的研究说明，不以complete伪称严格PIT。

最初浏览器断言误用了引擎warning原文，而页面使用“历史首次可见时间尚未核验”；读取组件与实际费用块后按该真实含义验收，未改产品文案或降低对时钟说明的要求。

- [净收益与比较截图](/private/tmp/thesis-benchmark-comparison-20261006.png)：已查看，策略、基准及净收益差在同屏可核对。
- [价格与记账说明截图](/private/tmp/thesis-benchmark-assumptions-20261006.png)：已查看，冻结费用与首末清算定义可读。
- [真实下载的诊断格式2](/private/tmp/thesis-benchmark-diagnostics-20261006.json)：任务身份、原始净收益、成本指纹4311d8b1…、checksum a07303d0…与持久结果一致。
- [浏览器验收入口](/private/tmp/thesis-benchmark-browser-20261006.mjs)：实际点击页签与诊断下载，保存截图并验证结果。

证据为目标Server／Worker、真实Provider价格与费用、Web及目标只读重放；未宣称Electron／Mobile、不可变镜像、券商账单或严格PIT验收。

## 最终审查与剩余范围

AC6／AC7在上述有界场景通过，B1～B4全部勾选。合同／版本、计算、兼容、持久终态、源声明、资金与费用、旧状态保留、重放与页面证据相符；没有未处理的本队列缺口。目标窗口交还原对话，P5／P6与研究覆盖、分红、专业Quote、严格PIT及发布回退继续由各自任务维护，整项父Task保持活跃。

没有修改真实凭据或路由，未stage／commit／push，保留并行WIP；没有把当前义务转移到TODO或归档。
