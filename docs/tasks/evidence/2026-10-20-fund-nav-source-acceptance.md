# 当前 V3 基金净值实源读取验收

日期：2026-10-20。对应[组合 R3.I6](../2026-08-28-portfolio-snapshot-system.md)及[账户 T12.NAV](../../archive/tasks/2026-08-18-position-entry-account-model.md)。用户已明确授权本次临时路由验收；[原预案](2026-10-20-fund-nav-route-plan.md)中的来源、证券、窗口及恢复范围保持。

结论：当前 NAV 和指定历史窗口的实源读取合同通过。原维护命令因验收脚本错误退出 1，不能记成原命令绿灯；修正历史状态判断后，仅复核本次留存结果，没有重新请求来源。原 16 条路由已恢复，revision/dsaRevision 均为 156。

## 执行范围与返回事实

执行目录 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger`，经 `rtk proxy` 调用：

```sh
node scripts/fund-nav-route-acceptance.mjs --execute --expected-policy=154 --expected-provider=0 --output=/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/fund-nav-live-20261020-1
```

执行前重新只读确认政策 154 已应用、原 16 条绑定无两项基金路由，`efinance/eastmoney` 已启用且配置代次为 0、完整目录两项均 ready。仅临时追加 FUND_NAV、FUND_NAV_HISTORY 两条单源绑定，政策推进到 155。

本案例仅发起两个 Server 数据 GET：当前净值和 `2026-10-12`～`2026-10-16`、limit 5 的净值历史。两项均取得标准 V3 返回，来源均为 `efinance/eastmoney`，`servedFromCache=false`、`fallbackUsed=false`。未修改来源启停或凭证，不宣称已统计来源 SDK 内部请求总数。

| 接口/日期 | 单位净值 | 原 freshness |
| --- | --- | --- |
| 当前净值：2026-10-20 | 0.5406 | delayed |
| 历史：2026-10-12 | 0.5338 | stale |
| 历史：2026-10-13 | 0.5285 | delayed |
| 历史：2026-10-14 | 0.5269 | delayed |
| 历史：2026-10-15 | 0.5334 | delayed |
| 历史：2026-10-16 | 0.5397 | delayed |

当前值抓取时刻为 `2026-10-20T12:14:41.416861+00:00`；历史五点为同次 `2026-10-20T12:14:42.492749+00:00`。历史窗口完整、未超出五点，无零值或代码/来源混入。

## 校验错误与不追加来源请求的复核

原预案脚本把所有 `stale` 一律视为当前净值陈旧，历史 10 月 12 日因此触发断言。原 DSA `_real_fund_nav_history` 按抓取日与净值日年龄超过 7 天标为 stale；[来源合同 §13.46](../../specs/2026-10-09-unified-data-capability-source-contracts.md#1346-四缓存实读验收的分层与恢复)已明确保留此状态，与缓存回退分别验证。10 月 12 日在本次抓取日年龄为 8 天，原标签符合合同，不能为验收改成 delayed。

修正限于维护脚本：当前净值继续拒绝 stale/unavailable；历史逐点核对原日期年龄状态、精确窗口、真实来源、正净值及无缓存回退。本次实源历史若 `servedFromCache=true` 或 `fallbackUsed=true` 仍拒绝。补充有限原返回留存，后续校验失败也不需要为补证重发来源请求。

复核仅读取已经保存的数据：

- 当前净值由原验收回执的 payload SHA-256 精确命中本次 Redis 留存，再通过修正后的当前净值校验；原摘要为 `9ab98f466eaabd1181c087f22fa298c02db9f263aead70ae747439a14112853a`。
- 历史从该证券、该窗口、limit 5 的唯一 fresh 缓存键读取原返回体；其中原字段仍为 `servedFromCache=false`，本次读取缓存用于取证，不冒充再次从来源获取。
- PostgreSQL FundNavPoint 的同五点与留存结果在日期、单位净值、来源、新鲜度、fallback 和抓取时刻逐字段相同。Prisma 的 UTC `timestamp(3) without time zone` 显式输出 Z；时间按持久化毫秒精度比对，不按宿主机时区猜测。
- 历史抓取时刻位于当前值抓取后 30 秒内、恢复核对之前。`review-report.json` 保留 `originalExecutionPassed=false` 与 `retrievalContractPassed=true`，未重写原 recovery 或错误日志。复核额外来源请求数为 0。

`node --test scripts/fund-nav-route-case.test.mjs scripts/market-additional-cache-acceptance.test.mjs` 最终 11 项通过：本次六项与原缓存验收五项。包括历史陈旧状态保留、当前陈旧拒绝、伪造历史 delayed 拒绝、缓存/备用越界、有限返回留存、失败和回执丢失后的恢复、并行变更不覆盖。Node 语法、定向格式及 diff 检查另行通过。

## 恢复与数据保护

原命令的 finally 已在错误退出前恢复原 16 条绑定，政策按合同单调推进 154→155→156。独立 GET 核对 revision/dsaRevision=156、applied、effectiveStale=false，完整路由内容和顺序摘要与原基线相等。没有保留永久基金路由；原运行配置下的后续业务消费仍须选择合适路由。

独立比较前后摘要：11 张业务保护表、ProviderConfig/AiRoutingSettings、57 个成功 V3 回测结果、五容器身份/镜像及暂停标志相同。AiRun、AiToolCall、ResearchObservation、ResearchObservationVersion、ResearchObservationSubmission、AiInvocation、AiInvocationFact 均保持 0。来源的启停、配置代次、凭证配置状态不变。

本次允许的正常数据副作用为 NAV Redis 缓存及五点 FundNavPoint 持久化；没有写账户、账本、现金、策略或正式估值槽位。没有执行 Docker 更新或重启，没有执行模型或 DG3 新闻请求。

## 证据位置与适用边界

文件位于主仓忽略目录 `.recovery-artifacts/`：

| 文件 | SHA-256 |
| --- | --- |
| `fund-nav-live-20261020-1/recovery.json` | `031c73eb6d09ab90ba0bce97a6c77086dae27ef8fb5964fa4be55241c7148d17` |
| `fund-nav-live-20261020-1/review-report.json` | `f8f74cd06e554736f0ef9429fcebc4bccdc2a05be4d8b0be43f9e7e6645a17cb` |
| `remaining-p1-2026-10-20/fund-current-returned.json` | `6ded95aec65bba267cfadfd5130c4dcd0984691675d49aacb5a29a76e2b7621f` |
| `remaining-p1-2026-10-20/fund-history-returned.json` | `2c498ae009fd39a41306e5f72e2a51a8aaced51cc06c30cee0b0ee21a7816d7d` |
| `remaining-p1-2026-10-20/fund-history-persisted.json` | `450f85f9043a18e51529fbc66b2224479d1079477f3ff412275d389c1d68d3a3` |
| `remaining-p1-2026-10-20/fund-target-before.json` | `a6603d2f49182212d2465e3e0745c5e32bbf77acc16510a41af7cffb1fa21222` |
| `remaining-p1-2026-10-20/fund-target-after.json` | `47ad507cbfc66699d1e1098ab2f3181697b82a9abfbd113a298596a4df0fb003` |
| `remaining-p1-2026-10-20/fund-route-execution.log` | `a7040c10a92bbe078c160199962387ec080187f6654084528776fab93acd61aa` |

本证据只关闭 R3.I6 与账户 T12 的 V3 NAV 接口实读叶。历史 stale 未被提升为当前新鲜估值；基金披露资格、正式校准、走势点位、研究经济价格及用户路径仍保留原验收条件。没有声明这些业务或基金 Web 展示已通过，也不将 Electron 作为本轮要求。
