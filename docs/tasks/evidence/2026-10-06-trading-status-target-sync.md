# 停复牌目标能力与配置同步证据

日期：2026-10-06。对应 [P5.4b](../../archive/tasks/2026-10-06-historical-rules-primary-backup.md)；真实股票回测、冻结重放和浏览器由P5.4c独立验收。

## 结论

P5.4b完成。正式代码同步退出0；目标DSA、Server、Worker关键文件与宿主验证产物一致，实际目录中的停复牌能力ready，现有Data Token认证网关实读返回正确公告状态。控制策略从revision39更新至40，dsaRevision40、applied，只追加一个精确停复牌路由，7条原路由及收费主备全部保留。

本叶没有创建真实策略／回测、修改已有结果或执行浏览器验收，P5.4父项／P5.4c／P6继续未完成。该同步更新容器可写层，镜像ID保持原值，容器重建后需要按正式入口重新同步或完整更新，不作为不可变镜像发布证据。

## 稳定输入与正式入口

读取 [C2.1完成证据](2026-10-06-research-calendar-c21.md)，核对其日历helper、API入口与本叶上市事实哈希：

| 输入 | SHA-256 |
| --- | --- |
| DSA日历helper | `50a81483059239c7b16784994d886d0d72d61fca55714313df8c945e58a2c7e1` |
| DSA `api/thesis_ledger.py` | `430d5b5101fb5f0d09672094bc140dde1a8965802a1b1cee8a68afd394899340` |
| DSA上市／日历事实库存 | `238f93fe478e750856d3feca4946e14a3c4918105aad5f15808e127464fbb41d` |

其最终后端门禁7927项与626子测试通过，包含保留的000995上市登记。主仓Schema／Server／Desktop沿用P5.3已验证且未改动的本地源码，正式同步再次构建Server及workspace依赖和DSA Web产物。没有活动更新任务，目标容器运行，宿主可用约2.6GiB，配置为policy39／dsa39／applied及7路由。

实际执行：cwd为 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`，入口 `./scripts/sync-code.sh all`，默认参数，经RTK捕获输出，退出 **0**。此次两个仓库均有兼容代码变化，`all`覆盖所需DSA、Server与Worker，在同一窗口完成一次构建和兼容预检。没有依赖、Prisma、migration、raw-owned inventory或Dockerfile变化，没有放宽预检；没有清理缓存、镜像、数据或卷。

正式脚本确认镜像保持：

| 服务 | 镜像ID |
| --- | --- |
| DSA | `sha256:08bfe1b5a0d59d6b27c54e961a5850f603885b4686d459818897c68d3bcd250e` |
| Server／Worker | `sha256:95d8e518ffee019a8a29a13979b4fd9736f914153c4b78c636d6e0866c87a0b0` |

脚本没有执行数据库结构或外部卷变更。

## 独立运行身份

DSA的API、规则网关、日历helper、上市事实、状态读取器和生产状态包6份文件与宿主源码SHA-256一致。Server与Worker各6份执行产物一致，两者对应文件也相同；Schema各3份manifest／result／状态合同产物一致。共24项运行身份核对通过。

| Server／Worker文件 | 共同SHA-256 |
| --- | --- |
| `backtest-snapshot-v3-builder.js` | `9dbda8b296aa0fa2760fb3933f1c8d702afaacd37dc5e1536e0282530ba2e766` |
| `backtest-snapshot-v3-artifact-writer.js` | `6dfa57ee3c6cabed09b24f69e1750fe7097b43e966559137cec96d6929623173` |
| `backtest-snapshot-v3-completeness-checks.js` | `14c374836eb3fab7d6605f4324c0992e026a99485868f53c73ff84b4d6e123b0` |
| `backtest-trading-status-snapshot-v3.js` | `3e4f9f0a0c8627c4a5c71217c0230079f0041c72188b5bfbaaf9821fbf0b2831` |
| `backtest-trading-status-execution-v3.js` | `c41ea8209aa5b0c9688a9f1a85901881e04ae5e0c6a7ce2fa447758570af209a` |
| `backtest-v3-runner.js` | `1aa1cc6153d959f2a280626b5c5a7ba31a980b974dc2cf61a361f315562a4d6f` |

首次独立检查误读镜像遗留的 `/app/dist` 路径而报告哈希差异；随后按正式同步脚本与实际容器Cmd核对 `/app/apps/server/dist`。Server实际启动 `node apps/server/dist/src/main.js`，Worker启动 `node apps/server/dist/src/backtest/backtest-worker.main.js`，正确运行路径全部匹配，无额外重启或重复同步。Schema核对使用实际workspace软链接解析路径。

`GET /api/v1/health`为healthy；目标完整目录新增 `CN STOCK / HISTORICAL_TRADING_STATUS / official-states / cn-stock-daily-suspension`，state为ready。健康与源码身份、实际能力分别验证，没有用健康代替功能。

## 配置与真实网关读取

重新读取最新policy与完整能力目录，确认目标ready；按现有控制接口 `PUT /api/market-data/policy`提交revision40，将单一状态路由追加到原7路由。再读策略确认revision40／dsaRevision40／applied，8条路由；原路由对象逐项相等，未轮换任何Token或供应商凭据。

新增路由为：

```json
{
  "key": {
    "kind": "data",
    "market": "CN",
    "assetType": "STOCK",
    "capability": "HISTORICAL_TRADING_STATUS"
  },
  "targets": [
    { "providerId": "official-states", "upstreamSource": "cn-stock-daily-suspension" }
  ]
}
```

通过目标DSA内部HTTP，以既有Data Token读取 `/api/v3/thesis-ledger/market/trading-status`，标的000995.SZ、08-16～21，精确target为routeIndex0。返回HTTP200：16未知、17停牌、18可交易、19～21未知，已知日期引用 `huangtai-2023-029`；实际公开公告和首次历史可见时间notVerified保留。来源版本为 `official-trading-status-da53da5f33af4372be9e15300a05ad4fe821d6694249bfaf4d457f335f98abe8`，采集时刻 `2026-10-06T14:08:20.573587+00:00`。请求／输出没有暴露Token。

读取既有目标结果确认未改写：B4任务 `873ba8dd-40c3-4f9e-b1d5-b16192f697b0`继续succeeded／complete，checksum `a07303d0e7c0f3ce`；旧任务 `652ba051-a4c5-493d-81e6-2cdbe3c090f0`继续succeeded／partial，checksum `8c66f3f721f5e4d8`。这是持久结果检查，不冒充本叶已完成Runner离线重放。

## 最终一致性审查与交接

通过，范围为P5.4b目标代码／能力／配置。稳定输入、正式入口、镜像／数据库边界、运行身份、实际目录和Data Token读取相符；原配置与旧结果保留。没有向另一对话发送工具消息，没有提交／推送、改数据库或更新Vite进程。

下一叶P5.4c维护独立状态target／replay场景，通过标准准备／创建／读取API运行真实000995窗口，核对17日无成交、复牌后原规则执行及完整未知披露，再完成两次无网络重放与真实Web。不得因本叶目录ready或HTTP200提前勾选该叶或P5.4父项。
