# HiThink 股票与 ETF 报价目标测试窗口

## 部署输入与受控范围

DSA 当前 Quote 接线输入的官方隔离 `offline-tests` 已以 7608 passed 通过，见[隔离门禁](2026-09-29-cont-r02-hithink-quote-isolated-offline-gate.md)。主仓此前 Schemas build、Server/Desktop typecheck、Server Quote Reader 11 项及 DSA Quote 定向 116 项通过，见[本地接线](2026-09-29-cont-r02-hithink-quote-runtime-local.md)。目标三容器在运行，Server package、Prisma Schema 与 DSA requirements 与容器内摘要一致；官方 infra `./scripts/sync-code.sh all` 兼容预检、宿主 Server/workspace 与 DSA WebUI 构建、三容器同步及重启健康检查均通过。目标 DSA、Server、Worker 的关键 Quote 源码/构建产物 SHA-256 与宿主一致。镜像仍为 DSA `sha256:2e75542952ca40f69c5b96b7f6ec75a184e4ea0db6ba362874c4b7607d287543`、Server/Worker `sha256:4e4df1a1e73bac5807210795ccb74d1851668134baeadc52ca08cde438d63f8e`；快更只更新可写层，容器重建后不保留。

用户明确选择在限定测试窗口将股票与 ETF 报价的 AKShare 目标临时替换为 HiThink，并在测试后恢复。目标原始 DSA V2 revision 28 中，两类报价均为 AKShare、Efinance 两目标；V3 revision 29 独立。目标未配置 HiThink Quote 准入。测试选用此前无 Redis Quote 缓存的 `000001.SZ/STOCK` 与 `159516.SZ/ETF`，只读适配器各一次返回 HTTP 200；原响应分别为 349/423 字节，SHA-256 分别为 `e86fafd9c1a0f54c90a3aa88c586f03dd3e4539f3604b06e3e943d0e8e1d4683` 与 `d37a1af6b838915d257888d9b05031b3bb06e18bf8e2d8fc6ffbc2f9290127da`。来源时点为 `2026-09-28T21:59:16+00:00`、`2026-09-28T21:59:18+00:00`；本地抓取时点分别为 `21:59:18.238651+00:00`、`21:59:18.406197+00:00`。ETF 量额单位仍为 `unknown`。原始正文和 Key 未写入文档。

将上述精确标的、上海日期 `2026-09-29`、来源、响应摘要及限制写入 DSA 内容寻址证据存储并读回核验，引用 `sha256:c80ba5359e37cac76cb1beef600a60a460370bafdeaf9e5a2da57702f1ef7ad0`。按目标实际凭据 HMAC、适配/来源修订临时签发两条精确 RouteAdmission，原定至 `2026-09-28T22:21:37.112161+00:00` 失效；未输出凭据或 HMAC。经正式 DSA Control HTTP 写入 V2 revision 29，仅替换两类报价的第一个目标，Efinance 第二目标及其他路由保持原值。两类 HiThink 目标均显示 `eligible=true`。这只是短时、精确标的的目标测试准入，不是生产持续可用性认证。

## 目标请求与恢复

| 路径 | 股票 `000001.SZ` | ETF `159516.SZ` |
| --- | --- | --- |
| Server→DSA 鉴权 V1 Quote | HTTP 200，`provider=hithink`、`upstreamSource=a-share-prices-snapshot`、`servedFromCache=false` | HTTP 200，`provider=hithink`、`upstreamSource=fund-market-snapshot`、`servedFromCache=false` |
| 时钟/新鲜度 | 上游 `2026-09-28T22:01:36+00:00`，抓取 `22:01:37.345791+00:00`，`live` | 上游 `2026-09-28T22:01:37+00:00`，抓取 `22:01:37.586757+00:00`，`live` |
| 公开单位 | `CNY/share/CNY` | `CNY/unknown/unknown` |
| 撤销后鉴权 DSA Quote | HTTP 200，实际来源 `eastmoney`；临时路由的第二目标为 Efinance | HTTP 200，实际来源 `eastmoney`；临时路由的第二目标为 Efinance |

不带 DSA 合同令牌的 Quote HTTP 返回 401。测试通过 `finally` 撤销两条 HiThink Quote 准入，正式 Control HTTP 写入 V2 revision 30 恢复原 AKShare/Efinance 路由；只读复核两类原路由完全一致、两条准入均为 `revoked`、V3 仍为 revision 29。测试前两个标的均无 Quote Redis 键；测试后清除这两个标的本轮生成的键，并复核无残留。未更改 Server Desired V3、真实数据库结构或镜像。

## 证据边界与后续

本窗口证明已同步源码在目标 Server→DSA 的真实 HiThink 股票/ETF 报价正向链路、鉴权、来源/双时钟/单位及撤销后的备用路径；本地测试另覆盖晚到撤销、策略和凭据修订拒绝、fresh/last-valid 缓存及错误合同。没有对真实 Key 做轮换、没有在目标执行晚到并发撤销故障注入、没有长期连续可用性或 ETF 原生量额单位证明；完整 `R02-quote-target`、`G0-H` 与全局验收继续开放。目标当前已恢复原有路由，HiThink Quote 不作为常驻生产来源。
