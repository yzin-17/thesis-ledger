# 公共费用与股票回测首个目标闭环验收

> 日期：2026-10-06（Asia/Shanghai）。对应[主备来源 Spec](../../specs/2026-10-06-historical-rules-primary-backup.md)及[实施 Task](../../archive/tasks/2026-10-06-historical-rules-primary-backup.md)的 P3.4b。
> 结论：首个公共费用主源与股票策略回测闭环通过。真实价格准备、持久化成功终态、冻结收费、独立逐笔复核、固定快照离线重放和 Web 页面均已取得证据。结果仍为 partial，基准成本与历史首次可见时钟的既有限制保持披露；P4～P6未验收。

## 范围与协作

用户要求先完成费用与股票回测闭环。此前“历史市场规则来源核验”已经完成收费源、配置、Snapshot/Runner和结果披露的本地实现；用户授权与其协调共享源码和目标窗口。该对话随后收到策略中心登录需求，本次接手 P3.4b 的运行验收；登录相关实现继续由原对话维护。

本轮只修正验收脚本中的策略买入条件，维护对应 Spec/Task 和本报告，复用同一研究策略并追加版本。没有修改 Runner 的价格或单位保护，没有修改登录实现，没有提交、推送或清理既有 WIP。

场景为 `600000.SH`、`2023-08-23..2023-08-29`、腾讯原生 qfq、固定供应商快照和归一化份额研究。公共费用使用 `official-rules / cn-stock-auction-fees` 的生产规则包。佣金、取整和规费包含关系使用显式研究模型，费用基数为模拟成交额。源文件、政府转载性质与未验证历史首次可见时间均保留；不声明复原券商实际账单或严格 PIT。

## 事实输入与正式更新

初次股票正式入口的 `invalid_response` 已定位为日历和上市事实不覆盖该标的历史窗口。原对话补入上交所 2023 年八月日历及浦发银行官网上市日期事实，73项定向回归通过；DSA `scripts/ci_gate.sh all` 退出0，7869测试和626子测试通过。此结果覆盖新增事实输入，不引用报价阶段旧输入的门禁代替。

从 `thesis-ledger-infra` 执行 `./scripts/sync-code.sh dsa`，目标 dsa，默认参数；读取原对话实际命令及退出结果，退出0，耗时约41.8秒。兼容预检、WebUI构建、源码同步、重启和就绪均成功。消费者此前已经通过正式 `./scripts/sync-code.sh thesis-ledger` 同步，使用现有收费冻结和执行代码，未重复部署正在修改的登录功能。

DSA镜像仍为 `sha256:08bfe1b5a0d59d6b27c54e961a5850f603885b4686d459818897c68d3bcd250e`，Server/Worker仍为 `sha256:95d8e518ffee019a8a29a13979b4fd9736f914153c4b78c636d6e0866c87a0b0`。这些更新位于容器可写层，不是镜像发布；未执行依赖、数据库结构、卷操作或恢复演练。

运行验收前后策略 revision/dsaRevision 均为38、syncState=applied，共7条路由，股票qfq和公共收费源有效，新增腾讯ETF Quote保留。验收脚本重新读取当前修订并保留已有路由，没有覆盖报价配置。

## 首次失败及有界修正

复用研究策略 `c2ca9a3d-fda5-48ce-9715-d69ae8a61d73` 的版本1 `a445e288-9871-4a60-92ec-f1a141946ead`，股票准备已经通过；任务 `df0a2e8a-62dd-499b-9940-b4cb4542795e` 持久化为failed/DATA_UNAVAILABLE，executionAttempt=0，未finalize快照。原因是验收策略的绝对价格门槛在qfq归一化协议下没有原始价格转换资格。

读取该任务实际 RunConfig 与原策略后，领域兼容检查返回 `ABSOLUTE_PRICE_THRESHOLD_UNCONVERTIBLE`；将买入条件改为空仓状态，检查返回compatible且issues为空。修正 `scripts/historical-public-fees-target.mjs` 的entry为 `not positionState.isOpen`，保留持仓时卖出和其他输入。通过标准版本API在同一策略创建版本2，保留版本1及失败任务，不修改旧快照或放宽引擎保护。

验收脚本 `node --check`、Prettier通过；`--plan` Schema校验通过。后续 `--run` 设置 `FEE_TARGET_STRATEGY_VERSION_ID=debb3916-6eee-4b39-8175-54655991e8bd`，复用版本2，未再次创建策略。

## 持久化终态与真实来源

目标脚本退出0；独立重新读取 `/api/v1/backtests/runs/<id>`，结果与脚本一致。该读取链路由 Prisma 查询持久化 BacktestJob，不以队列状态判定成功。

| 身份 | 实际值 |
| --- | --- |
| 策略版本 | `debb3916-6eee-4b39-8175-54655991e8bd`，同一策略v2 |
| 任务 | `652ba051-a4c5-493d-81e6-2cdbe3c090f0` |
| 终态 / 执行次数 | succeeded / executionAttempt=1 |
| Snapshot内容身份 | `dbcb682568ebac75acfd5a23c9e968ba0808b097118a45f50453e78c425c558d` |
| 结果校验和 | `8c66f3f721f5e4d8` |
| 收费披露 | status=source，provider=official-rules |
| 冻结收费版本 | `official-public-fees-88ca26355bad0e1016cf46eb6beff6018bab45918eb562aeb51ed50adf64c3e7` |
| 真实成交 / 基准价格源 | tencent/tencent、CN/STOCK/DAILY_BAR/1d/qfq、主源、策略修订38 |
| 两份价格输入指纹 | `2aebb46ab7d94c5f68ce09c3b8d63f1c0efe91ab874af1d52d95d58c7b216367` |

共4笔模拟成交、2笔已平仓交易。累计收益约−0.265879%，期末资产页面显示¥99,734.12。策略费用已经影响权益，不以来源披露代替执行计算。

## 独立逐笔金额复核

使用 `/private/tmp/thesis-fees-result-independent-check-20261006.py` 只读实际任务，以Python Decimal独立计算；未复用Runner收费函数。每笔佣金按成交额0.0003、最低CNY5；监管费/经手费包含于佣金，过户费双向0.00001，卖出印花税按08-28切换，逐项halfUp两位取整后求和。

| 成交日期 | 方向 | 佣金 | 印花税率 / 金额 | 过户费 | 实际总费 / 独立计算 |
| --- | --- | --- | --- | --- | --- |
| 2023-08-24 | 买入 | 5.00 | 0 / 0.00 | 0.10 | 5.10 / 5.10 |
| 2023-08-25 | 卖出 | 5.00 | 0.001 / 9.93 | 0.10 | 15.03 / 15.03 |
| 2023-08-28 | 买入 | 5.00 | 0 / 0.00 | 0.10 | 5.10 / 5.10 |
| 2023-08-29 | 卖出 | 5.00 | 0.0005 / 4.92 | 0.10 | 10.02 / 10.02 |

四笔全部一致，总费用35.25。两个卖出成交分别落在费率切换前后，不是仅核对规则包存在两个分段。

## 固定快照离线重放

通过明确只读的容器执行，将仓库维护的 `scripts/historical-public-fees-replay.mjs` 交给目标Server的Node执行，工作目录 `/app`，参数为上述任务ID及结果校验和；不复制文件、不修改容器或目标状态。该脚本读取现有快照并执行Runner两次，禁止fetch联网。

退出0：两次完整结果deepEqual，Snapshot身份及校验和均与持久化结果一致，收费来源/版本一致，4笔成交一致，networkCalls=0。没有读取当前收费路由替代冻结收费，也没有重新创建快照或回测任务。

## 真实 Web 页面

隔离临时Chrome访问 `http://127.0.0.1:5173/strategy/jobs/652ba051-a4c5-493d-81e6-2cdbe3c090f0`，打开“数据与假设”页签，未拦截或替换响应。结果接口、策略接口、任务列表、事件流均200，浏览器errors为空。

页面显示任务已完成、同一策略v2、实际股票窗口，以及“历史公共收费：已使用冻结费率”；两段印花税0.1%/0.05%、经手费变化、监管费、过户费、六项来源及政府公开转载性质、冻结规则版本均可见。截图已人工查看：[费用结果页](/private/tmp/thesis-public-fees-stock-result-20261006.png)。

浏览器先前的检查脚本误用networkidle等待常驻事件流，以及在默认概览页等待收费内容；改为DOM加载后打开实际“数据与假设”页签。未为通过浏览器检查修改产品或替换数据。此证据为实际Web页面，不代替Electron/移动设备验收。

## 已知限制与收口

实际 `result.completeness=partial`，页面保持“结果部分可用”。基准计算虽然消费同一份冻结费率，其现有成本假设合同仅支持对称比例费，不能表达本模型最低佣金与卖出印花税，返回 `BENCHMARK_COST_MODEL_UNSUPPORTED`。本轮没有把基准净收益改为零或伪记可用；历史首次可见时钟也未核验。策略成交、费用、权益与固定快照重放均已验收。

P3/P3.4/P3.4b可按上述首个主源和策略闭环勾选。P4实际备用及整窗切换、P5历史特殊状态、P6其他状态/市场保持未完成，原严格PIT/分红/因子/专业Quote与发布回退不因本次勾选。整项主备扩展Task继续保留，未归档或转移当前义务到TODO。
