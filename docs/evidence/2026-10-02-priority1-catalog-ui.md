# 第一优先级目录恢复与图表验收证据

日期：2026-10-02。授权范围为目录恢复、U04、G-UI；保留三仓既有 dirty WIP，无提交、推送或发布。目录恢复三叶完成；完整 U04/G-UI 尚受真实行情口径、窗口与兼容备用证明阻塞，父项保持未勾选。

## 来源合同与实现

开放基金排行原请求 `op=dy` 返回331字节，安装版 AKShare 的实际合同为 `op=ph,dt=kf,ft=all` 和日期参数。Reader 在整次读取开始时固定上海日期窗口，保留严格页数/总量/身份、HTTPS、禁止重定向、8 MiB单页及45秒总预算。本次完整读取20481条、21页、33.41秒，指纹 `b61ef6399e36348cf86f7746cf6647bd5e23abda7eeee153e13fe680c8787ab7`。排行日期是筛选参数，不能证明历史目录或历史可见性。

东财 ETF 端点在有界直连/宿主代理探针下失败。AKShare Catalog 的 ETF 子集合显式改用新浪 `etf_hq_fund`，使用安装版 SDK 已有端点合同；股票、基金集合保持原消费边界。新 Reader 采用普通计数→最多5000行全列表→普通计数，20秒总预算、2 MiB单响应上限；前后计数、全列表长度、原生sh/sz身份必须一致。当前普通计数1693匹配列表，Simple计数1694不用于完整性判断。只解析固定JSONP包装及精确来源注释，不执行脚本；重复JSON字段、代码/场所冲突、空名称、计数变化、截断、HTTP失败、超时均整体拒绝。

首次完整新浪读取因实际精确来源注释拒绝；核对原文后只增加该固定注释支持，唯一有依据复验成功1693条，包含 `sz159516`。指纹 `55c1b9a308af41d62f017be89df844c38fe1cce65edfa4360811ba70178cb2dc`；计数原文SHA-256 `8da2802878a712c060b00397d29cca422c7a66daceb3d71841a93ebc51a65e7e`，列表原文SHA-256 `a545ed251e7a38a500a88c88cb4a6a50ca27eb7a25a5d4f98b360751b4c140e8`。完整AKShare Loader 35280行：股票5572、ETF1693、基金28015，13.92秒；正式目录按既有身份规则去重为35278条。当前目录恢复不修改行情路由、准入、量额单位或PIT合同。Efinance股票来源仍失败，保留该Provider整体失败，不发布部分集合。

## 本地验证与输入范围

| 验证 | 输入范围 | 最后结果 |
| --- | --- | --- |
| DSA `.venv/bin/python -m pytest` 定向六文件 | 基金分页/Reader、新ETF Reader、Catalog Sources/Catalog/Job | 88 passed，3 warnings；`/private/tmp/priority1-catalog-tests-final.log` |
| `.venv/bin/python -m flake8` 限定四文件 | 两个Reader及对应专属测试 | 通过，最终修订后复核 |
| `env PATH="<DSA>/.venv/bin:$PATH" bash scripts/ci_gate.sh syntax` | 当前DSA语法门禁 | 通过；`/private/tmp/priority1-dsa-syntax.log` |
| 同上 `bash scripts/ci_gate.sh flake8` | 当前DSA关键flake8 | 通过；`/private/tmp/priority1-dsa-critical.log` |
| `pnpm --filter @thesis-ledger/desktop exec vitest run` | MarketDetailDialog、latest.integration、MarketDetailCharts三文件 | 21 passed；`/private/tmp/priority1-desktop-directed.log` |

DSA离线全包与Desktop全包本轮未重跑；不得把历史全包通过作为本轮新增文件的全包结果。未修改前端源码、依赖、数据库结构或镜像构建输入。

## 目标目录闭环

通过相邻infra官方 `./scripts/sync-code.sh dsa` 更新，日志 `/private/tmp/priority1-sync-dsa.log`，目标健康。该入口只更新容器可写层，不能作为镜像发布证据。

目标只读SQLite核对连续两次正式成功：

| Job | generation | 完成时间（UTC） | checksum |
| --- | --- | --- | --- |
| `66c6deaf-583f-407a-b755-5327a0732981` | 29 | 12:13:47.703686 | `30d9077772fe058da960aa033959b74ceffc0fa5cf19857bcedc7086afd90fab` |
| `ba7a9d80-9b9f-499b-93ca-4b393922ca01` | 30 | 13:09:31.186332 | `0486f9a8d572a2b496d081663e4563538f9cb0e930622d2670178a7218c02b5c` |

后一次来自浏览器“同步目录”，Server Job API返回 `succeeded,count=35278,acknowledged=true,idempotent=true`，附 `providerFailures.efinance=catalog_provider_unavailable`。最新目录状态ready、无activeJob；搜索159516返回活跃ETF `159516.SZ`，confirmable=true；同码OF身份继续独立呈现。未点击确认标的、创建持仓或手工修改数据库。历史generation29 Job的Server查询返回500，连续来源证据采用DSA只读持久化记录；最新Job查询正常，该历史查询缺口不算通过。

浏览器截图：`/private/tmp/priority1-catalog.png`。界面呈现35278个本地标的及159516.SZ；网络成功和目标ACK共同证明恢复，单纯截图不替代状态机验收。本次两次成功不能证明长期连续可用或历史身份完整。

## U04与G-UI边界

Server `GET /api/market/159516.SZ/detail?include=bars&barsLimit=59&start=2026-04-30&end=2026-08-07&acceptance=interactive&chartContractVersion=3&adjustment=qfq`：bars=ready、59条，ETF/1d/qfq；provenance为HiThink `fund-market-historical`、routeIndex=0、effectivePolicyRevision=32。同窗none/hfq均unavailable。默认90条、较大规划窗口qfq也unavailable。chart-options声明路由就绪，不承诺请求窗口覆盖，现有已审核短窗没有被扩大。

真实浏览器现有600519.SH持仓“行情详情”：触发器中文“前复权”；下拉三个选项均显示“尚未配置此口径路由”并禁用，详情读取失败状态可见。Network chart-options=200；Console警告/错误为空。拒绝截图 `/private/tmp/priority1-chart-rejection.png`。没有创建测试ETF持仓来充当正向UI证据。

Exchange Run `4a8694de-f8b4-4d47-b0db-5ec16b29666e` 重新打开详情和下拉前后：`resultChecksum=733135b633176f64`；稳定序列化runConfig SHA-256 `80cf3c9eee03576318495bf8f49eb91c180185a3faf283b6f97030bfc5a0fd20`，result SHA-256 `7dda94f41c9c3a48b7a1a744fa0a8ce96ad532dc769be91e0c68c97f1830a879`，均一致。整份响应含动态读取信息，不能用整份HTTP响应哈希差异判定配置或结果变化。

## 未完成门禁及接续顺序

1. 当前目录恢复已解除159516.SZ身份阻塞；历史目录和Efinance股票源恢复仍属各自原门禁。
2. 图表正向矩阵需要真实STOCK/ETF的none/qfq/hfq及覆盖实际规划窗口的合法来源准入。现有HiThink ETF qfq短窗不能替代该矩阵；NAV真实来源准入也需重新具备有效证据。
3. `U04-proof-runtime`需已审核真实兼容等价证明及安装/撤销、主源故障后整窗备用实读。当前缺少证明，不能制造proof、放宽覆盖或自动准入来关闭门禁。
4. 上述来源与证明具备后，再执行真实Browser口径切换、独立缓存、刷新/扩窗/错误切回、NAV及备用正向验收，最后关闭U04/G-UI。
