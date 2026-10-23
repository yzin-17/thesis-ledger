# 基金 NAV 临时路由验收预案

日期：2026-10-20。对应 [组合 R3.I6](../2026-08-28-portfolio-snapshot-system.md)及[账户 T12/T13](../../archive/tasks/2026-08-18-position-entry-account-model.md)。本节保留授权前预案；用户随后明确允许本次临时路由验收，已经执行并恢复原绑定，当前政策为 156。实际返回、原命令的校验错误及不追加来源请求的复核见[最终证据](2026-10-20-fund-nav-source-acceptance.md)。下文 154→155→156 为本次实际范围，不是当前再次执行的授权。

## 已确认条件

通过目标只读 API 核对：政策 revision/dsaRevision 均为 154，`syncState=applied`、`effectiveStale=false`，现行 16 条路由无基金 NAV 两项绑定。efinance 已配置并启用，`configVersion=0`，无需凭证；当前完整目录中的 `efinance/eastmoney` 两项能力均为 ready。AKShare、其他来源、故障切源、新闻和模型不在本预案范围。

维护入口的默认只读预案已实际执行，退出 0：

```sh
node scripts/fund-nav-route-acceptance.mjs
```

原始预案位于主仓 `.recovery-artifacts/remaining-p1-2026-10-20/fund-route-plan.json`。

## 精确变更与恢复

获得授权后，仅在现行政策末尾临时追加：

```json
[
  {"key":{"kind":"data","market":"CN","assetType":"MUTUAL_FUND","capability":"FUND_NAV"},"targets":[{"providerId":"efinance","upstreamSource":"eastmoney"}]},
  {"key":{"kind":"data","market":"CN","assetType":"MUTUAL_FUND","capability":"FUND_NAV_HISTORY"},"targets":[{"providerId":"efinance","upstreamSource":"eastmoney"}]}
]
```

原 16 条路由内容和顺序保持，不修改 Provider 启停、凭证、准入或其他来源。只读取 `161725.OF` 当前 NAV 与 `2026-10-12`～`2026-10-16`、最多五点的 NAV 历史。读取可能产生正常行情缓存/净值事实缓存，不写账户、成交、策略、估值槽位或模型任务。

成功或失败均恢复原路由内容；政策修订按合同单调递增，154→155→156，缓存随控制代次换代。恢复前验证本案例 requestId、修订和完整内容摘要；发生并行修改时保留恢复回执并停止，禁止覆盖用户变更。政策提交已成功但回执丢失时，通过当前精确 requestId/内容确认本案例后恢复，不重试来源请求。

已准备的执行命令仅供获得授权后使用；若政策或 Provider 代次已改变，重新出只读预案：

```sh
node scripts/fund-nav-route-acceptance.mjs --execute --expected-policy=154 --expected-provider=0 --output=/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/fund-nav-live-20261020-1
```

恢复入口：`node scripts/fund-nav-route-acceptance.mjs --recover <本次 recovery.json> --authorized-recovery`。恢复仅接受该案例允许的两条绑定差集。

## 防护测试与验收上限

授权前 `node --test scripts/fund-nav-route-case.test.mjs` 四项通过，覆盖错误来源/当前陈旧/真实空不算成功、历史结果超出五点或指定日期窗即拒绝、保留已有股票绑定、禁止接管已有基金路由、未知来源与备用越界、来源失败恢复、提交回执丢失恢复，以及并行修订不覆盖。实读发现原历史 stale 断言误用了当前新鲜度条件；按既有来源合同修正为保留日期年龄状态、独立拒绝缓存回退，新增两项后与原缓存验收合计 11 项通过。

本项只接现行 V3 NAV 正向接口。当前合格实读已关闭 R3.I6/T12.NAV 接口叶；披露时间/有效性、基金持仓披露、完整经济价格、基金正式估值校准及研究 T13c/G4b 仍按各自原断言独立验收，账户 T12/T13 和共同消费者父门禁保持未完成。
