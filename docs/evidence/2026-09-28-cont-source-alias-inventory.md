# 旧 source alias 的只读持久状态库存

## 读取边界

2026-09-28 09:19（Asia/Shanghai）对当前目标容器执行只读聚合：DSA SQLite 使用 `mode=ro` 与 `PRAGMA query_only=ON`；Server 通过容器内现有 Prisma 连接只选择 Policy JSON 并在进程内计数，行情表用分组计数；快照仅扫描 `finalized.json`/`building.json` 的结构。没有输出策略原文、证券、Run ID、账号、凭据、数据库地址、日志或工件内容；没有写数据库、调用来源或更换容器源码。目标应用版本不等于本批本地源码，以下是当时数据库存，不是部署验收。

尾检确认两仓暂存区均为空、目标五个既有容器仍运行且健康，DSA 唯一来源目录固定 `R01–R08` 编号行仍为 116；这些只读状态不证明容器已加载本地修复。

## 精确库存

下表数值为各表内 `routes` 矩阵中的 RouteTarget 出现次数，历史修订会重复计入同一目标；不是独立用户数或已准入来源数。

| 存储 | 行数 | `akshare/akshare` | `akshare/eastmoney` | `efinance/efinance` | `efinance/eastmoney` |
| --- | ---: | ---: | ---: | ---: | ---: |
| DSA 当前 V2 Desired / Effective | 1 / 1 | 6 / 6 | 2 / 2 | 4 / 4 | 1 / 1 |
| DSA V2 历史 Desired / Effective | 25 / 25 | 40 / 40 | 16 / 16 | 28 / 28 | 4 / 4 |
| Server 当前 Desired / Effective | 1 / 1 | 6 / 6 | 2 / 2 | 4 / 4 | 1 / 1 |
| Server 历史 Desired / Effective | 2 / 2 | 12 / 6 | 4 / 2 | 8 / 4 | 2 / 1 |

DSA 当前 Desired 与 Effective 的旧 alias 覆盖 `REALTIME_QUOTE/STOCK+ETF`、`FUND_NAV`、`FUND_NAV_HISTORY`，另有 AKShare `FUND_HOLDINGS`/`CHIP_SUMMARY` 等不应映射为东财的能力。DSA V3 当前/历史 Policy 均 0 行，V3 route admission 0 行；这不授予 V2 路由任何 G0 准入。按持久键聚合，Efinance ETF Quote 旧 alias 预算 6 行、无 source 旧预算 3 行，读取时均已到期；另有 Efinance ETF/STOCK Quote 和 AKShare STOCK Quote/NAV 的旧 source 健康行。到期预算与健康历史不能代替新实现对未到期记录的兼容检查。

Server `MarketBarWindowEvidenceV3`、`MarketBarSeriesFact`、`MarketBarSeriesCoverage` 对这四组来源的分组计数均为 0。Server 与 Worker 可见的快照根目录同为 109 个已发布 manifest：V2 100、V1 9、V3 0；结构扫描未找到精确 `providerId + upstreamSource` 对象。该结果**不证明** Parquet 工件、旧格式自由字段或其他历史引用没有 alias；未经完整旧格式解码，不得重写或丢弃旧 Snapshot。

## 源码所有权与后继

- Server `market-policy-storage.ts` 读取并保留旧 V2 路由矩阵及 V3 的 `legacyV2Routes`；Prisma `DesiredProviderPolicy` 和修订存 JSON。新默认值不会自动迁移上述目标已有 Desired/Effective。
- DSA Control 的策略修订、V3 准入主键、健康 `scope_key`、ETF 请求预算 `request_key` 均含精确 source；Runtime 的执行 provenance 原样记录选中的 RouteTarget。Server V3 的 `seriesVersion`、完整窗口证据指纹和 Snapshot 来源也绑定原 source。改标签会改变身份，不能回写历史。
- 已关闭的 `CONT-efinance-etf-alias-budget` 只对已证明同一单标 adapter 的 Efinance ETF Quote 合并预算，兼容读旧 alias/V1 键并保留原记录。健康/熔断、STOCK/NAV、AKShare 和跨 Provider 的物理同源仍未迁移。
- 后继合同必须先逐能力确定实际上游与旧路由保留策略，再按“路由状态/准入、执行健康与预算、消费/冻结/重放、目标验收”拆叶。旧 alias 可读、历史修订与审计原文不变；新路由替换须显式产生新修订并重做准入，不得把两个包装器算独立备用。目标写入/更新仍受 DSA 官方失败全包和官方 `update.sh all` 入口约束；本库存不授权迁移或部署。
