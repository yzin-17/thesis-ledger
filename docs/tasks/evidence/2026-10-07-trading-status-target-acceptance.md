# 首个真实停复牌回测、重放与页面验收

日期：2026-10-07。对应 [P5.4c／P5.4／P5](../../archive/tasks/2026-10-06-historical-rules-primary-backup.md) 与 [主备来源方案](../../specs/2026-10-06-historical-rules-primary-backup.md)。

## 结论与验收基线

首个有界停复牌闭环通过：真实腾讯价格与皇台公告独立冻结，2023-08-17无成交，08-18开盘买入、08-21开盘卖出；未知日期保持未知，费用未覆盖时明确使用已选模型。同一目标Snapshot两次离线重放相同、网络调用0，旧费用／基准结果保持。真实Web说明、成交日期与下载的诊断JSON验证通过。P5.4c、P5.4及P5可勾选。

目标使用 [C3.1消费者先于DSA的正式同步版本](2026-10-07-research-window-target-c31.md)，不是旧宿主构建。开始时独立核对目标Worker当前Runner SHA-256 `f2e8989b3fe8fe01c11dd6177c5e3900eebc2fb3e2f6ccc8cc0984fd62cece4b` 与停复牌执行helper `c41ea8209aa5b0c9688a9f1a85901881e04ae5e0c6a7ce2fa447758570af209a` 同宿主构建一致；前项已有25项目标身份记录。本轮没有再次同步、重启容器、更新镜像或Vite、修改生产源码、Schema、数据库结构、配置或Provider。

验收仅覆盖000995.SZ、08-16～21、腾讯qfq、显式连续归一化单位、日级公告及费用模型场景。历史首次可见时钟未验证；公告中的其他风险维度没有应用。其他特殊状态、港股／美股和更大历史窗口仍由P6及各自任务维护，不将有限窗口声明为完整历史或严格PIT。

## 标准准备、持久任务与真实执行

新增 [独立状态target入口](../../../scripts/historical-trading-status-target.mjs)，沿用既有收费验收的标准策略／准备／创建／读取API。默认只输出计划；`--run`创建独立策略与回测，始终只读已有路由，不修改原策略、模型或结果。执行命令：

```sh
node --check scripts/historical-trading-status-target.mjs
node scripts/historical-trading-status-target.mjs
node scripts/historical-trading-status-target.mjs --run
```

三项退出0。策略采用16日收盘信号、下一有效开盘成交，持仓后发出卖出信号；原DAY／结算／缺Bar规则保留。模型显式设置归一化价格与单位、佣金／最低额、卖侧印花税0.001、过户费及取整，不把其费用配置称为真实独立收费事实。

| 身份 | 实际值 |
| --- | --- |
| 策略ID | `4aec77d0-556d-4f22-b670-7c6b2a71a069` |
| 策略版本ID | `3243c741-cb28-452a-8db6-46cc802921d9` |
| 任务／运行ID | `c2a25e3f-09d6-419f-9323-e17bf2d98442` |
| 持久终态 | succeeded，executionAttempt1，complete |
| Snapshot | `6925e8648d77c7b40e0bd624ddc201657544c4a2141334feacf2dcc04bfdcdd4` |
| 结果校验和 | `c487baed3175fbf5` |
| RunConfig身份 | `9e66603e2491bc131f6dc0f802159f1bca566d867a5bc25f2c9434a97e135b0c` |
| 冻结执行模型身份 | `e42e4880ffb7538dbbecb73cab82e5ad359f468b063bc17632052ad2b8df523f` |

使用标准 `GET /api/v1/backtests/runs/:id`读取持久终态，不将队列状态替代业务成功。创建／完成时间为上海时间2026-10-07 00:57:52／00:57:54。策略净收益 `0.00672588618316569614`，基准净收益 `0.20829038019801980198`，差 `-0.20156449401485410584`。利润因子因 `NO_LOSING_TRADES`不可计算，其他必要指标可用；保留实际complete，不在脚本中强制该状态。

| 成交 | 上海时间 | 价格 | 数量 | 模型费用 |
| --- | --- | --- | --- | --- |
| 买入 | 2023-08-18 09:30 | 18.89 | `529.3806246691371095817893065113816834303864` | CNY5.10 |
| 卖出 | 2023-08-21 09:30 | 20.20 | 同上 | CNY15.80 |

17日没有Bar，也没有成交；原16日信号在18日下一有效开盘执行，没有补17日报价。21日收盘的新买单因区间内无下一可执行Bar而返回DAY_EXPIRED，是原区间终点规则；不把它描述为停牌拒单。真实缺Bar场景与P5.3b.1已覆盖的“已有Bar时停牌拒单”分别证明。

Python Decimal按75位精度独立核对数量×价格、最低佣金、分向印花税及过户费／两位小数halfUp：买费5.10、卖费15.80，期末现金 `100672.588618316569613552143991529910005293806184`，独立收益与报告值误差小于 `1e-20`。这是所选费用模型的模拟现金账，不是实际券商费用。

## 来源与冻结

实际执行／基准价格均来自tencent／tencent、routeIndex0、effectivePolicyRevision40，输入指纹 `a883e5618ecdefdfd04ded95e7332003f9cd859aa882d26009f59c47b720bdb5`。预热从07-31开始，冻结依赖和现行日历取得正常，执行窗只有16／18／21三根价格；17日仍保留为交易所会话，缺Bar假设和个股公告状态分别冻结。

状态读取一次整窗，来源为official-states／cn-stock-daily-suspension／routeIndex0，公告 `huangtai-2023-029`，版本 `official-trading-status-da53da5f33af4372be9e15300a05ad4fe821d6694249bfaf4d457f335f98abe8`。响应16未知、17停牌、18可交易、19～21未知；采集时间上海2026-10-07 00:57:51。独立 `metadata/trading-status-v3.parquet`及manifest `frozen-trading-status-v1`引用存在，价格文件没有新增suspended或17日报价，原模型内容身份独立保留。

现有公共收费主备均未覆盖这个整窗，冻结结果为executionModel和原因“公共收费源暂不可用，使用已选执行模型。”没有把未知费用当零，也没有修改公共费率包。基准成本版本保持 `execution-model-cost-v1`，按自身买卖和日期计费。

## 目标离线重放与旧业务保护

扩展 [既有只读replay入口](../../../scripts/historical-public-fees-replay.mjs) 的可选 `--trading-status`，默认旧行为保留；状态场景另外读取冻结产物和原价格，断言逐日状态、17日无Bar、价格没有状态回写、18买入及21卖出。通过 `docker exec -i -w /app`将该维护脚本传入目标Worker的Node模块入口，加载实际 `/app/apps/server/dist`运行模块和已有Snapshot；只读计算，不保存结果或修改容器。

新任务参数为 `c2a25e3f-09d6-419f-9323-e17bf2d98442 c487baed3175fbf5 executionModel --trading-status`；两份旧任务使用原source模式。每项入口内部运行两次，全部退出0，完整结果逐字段相同，fetch调用计数0：

| 任务 | 校验和 | 两次一致 | 网络调用 |
| --- | --- | --- | --- |
| 新停复牌任务 | `c487baed3175fbf5` | 是 | 0 |
| B4 complete任务 `873ba8dd-40c3-4f9e-b1d5-b16192f697b0` | `a07303d0e7c0f3ce` | 是 | 0 |
| 旧partial任务 `652ba051-a4c5-493d-81e6-2cdbe3c090f0` | `8c66f3f721f5e4d8` | 是 | 0 |

前后控制配置都为revision40／dsaRevision40／applied／8路由，target入口对完整policy对象断言相等。没有补旧状态引用或升级旧成本版本。

## 真实Web与诊断下载

使用真实Codex内置浏览器打开 [任务结果页](http://127.0.0.1:5173/strategy/jobs/c2a25e3f-09d6-419f-9323-e17bf2d98442)，未拦截响应或注入样本。页面无需用户登录，显示已完成、策略净收益0.67%、基准20.83%、差−20.16%、1笔已平仓交易及原利润因子不可用原因。

“数据与假设”显示实际腾讯来源、归一化协议、所选模型、费用兜底及冻结公告：17停牌、18公告披露可交易、16及19～21未知，来源链接／版本和历史时钟未核验说明齐全。“交易与订单”显示18日09:30买入、21日09:30卖出；没有17日成交。“诊断与复现”具有实际下载入口，所需新状态字段从页面及下载载荷核对，证明当前模块已加载，不使用旧缓存页面作为证据；本轮无需重启Vite。原生截图确认停复牌卡片与费用说明可读、长版本换行正常，未把临时截图写入仓库。

点击“导出诊断JSON”后文件真实落盘；浏览器自动化的download事件等待超时并重置会话，随后从实际下载文件核对成功，没有重复点击或替代生成JSON：

- [真实下载JSON](/Users/yzin/Downloads/backtest-c2a25e3f-09d6-419f-9323-e17bf2d98442-diagnostics-v2.json)
- SHA-256：`1d579876ff5b82b4d5783ffb5e8087e99b8bdf4f488b34868ae9cdd7d81e7df1`

格式2、任务ID、结果校验和、complete、逐日状态、来源文档与provenance同持久结果逐项相等；状态白名单没有routeTarget／requestId，原诊断脱敏与复现边界保留。结果页作为交付保留打开。

## 检查与最终一致性审查

两份脚本的 `node --check`、Prettier以及作用域 `git diff --check`通过；target244行、replay205行。仓库ESLint配置明确忽略.mjs，初次局部命令因“ignored”告警退出1，不能记为Lint通过；脚本验证使用Node语法检查及真实target／新旧replay断言，不改忽略配置或关门禁。没有生产代码变更，不重复未变输入的Server／Schema／Desktop全包、构建或镜像更新。

通过，范围为首个日级停复牌研究闭环：来源、冻结合同、原价格／模型边界、既有执行规则、持久终态、费用兜底、独立现金账、新旧离线身份与真实页面共同对应同一目标版本。P1～P5有界完成，P6继续未完成；整项Task保持active，不归档、不将剩余范围移入TODO。保留全部并行WIP，未stage、commit、push，未改其他策略或账户数据。
