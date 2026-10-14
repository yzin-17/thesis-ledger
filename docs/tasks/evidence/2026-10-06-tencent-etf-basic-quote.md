# 腾讯 ETF 基础报价接入与验收

> 日期：2026-10-06；需求：[个人研究续接 Spec](../../specs/2026-10-03-multi-source-remaining-acceptance.md)；任务：[PR06～PR08](../../archive/tasks/2026-10-03-multi-source-remaining-acceptance.md)。
> 当前结论：PR06～PR08及详情接缝PR08a已完成。稳定DSA门禁、Server包检查、正式脚本同步、策略37启用、真实Quote/详情HTTP及浏览器实读通过；未知量额和原行情时间保留，镜像未发布。

## 范围与实现

腾讯 Provider 原来只登记日线；本轮增加 CN ETF 的精确 `REALTIME_QUOTE/tencent`，使现有免费报价能够走标准 DSA→Server→页面路径。未增加股票 Quote、事件/因子资格或专业行情承诺，没有改费用、Snapshot/Runner、数据库、原生客户端或 UI 样式。

| 文件/职责 | 本轮结果 |
| --- | --- |
| DSA `data_provider/tencent_etf_quote.py` | 单标 HTTPS 读取与基础价格/OHLC 校验，复用 `tencent_quote_identity.py` 的封套、正文身份和来源时间；未知量额 null/unknown |
| DSA `data_provider/tencent_fetcher.py` | 腾讯 Provider 增加薄 ETF 单标 Quote 方法，日线路径保留；287→293 行 |
| DSA `thesis_ledger_provider_manifests.py`、`thesis_ledger_current_data_route.py` | 明确登记腾讯 ETF Quote 与精确来源/适配修订 |
| DSA `thesis_ledger_price_route_access.py`、runtime | 精确基础 Quote 按当前配置执行，原其他来源准入保持；调用前后策略/目标/修订复核仍生效。巨型 runtime 仍2401行 |
| DSA 新测试与既有目录/Provider 测试 | 18 个解析/HTTP/边界反例；目录精确区分新增ETF Quote与其他受限能力。共享目录测试同时核对收费对话已增加的STOCK none/qfq，未修改该来源实现 |

完整证券代码一路传给腾讯适配器，避免把错误 `.SH/.SZ` 请求去掉后缀后误映射到另一市场。响应必须只有一条正确赋值，正文代码匹配；错误市场/代码、重复封套、附加脚本、异常价格/OHLC拒绝。缺来源时间保留 unknown，抓取时间独立保存。ETF 量额未核单位，因此不使用股票量额/市值启发式换算。

这一精确基础路由不要求临时人工准入记录；其 scope 固定为 CN/ETF/REALTIME_QUOTE、provider=tencent、source=tencent。HiThink、股票 Quote、分红与严格历史能力未扩大。`ready` 表示该精确适配可按配置调用，不代表长期来源可用性。

## 真实输入复用

复用[已完成预研](2026-10-06-personal-research-feasibility.md)的本地原文 `.recovery-artifacts/research-feasibility-2026-10-06/tencent_quote_sample.raw`，1097字节，SHA-256 `d56b2a2a267cd42ac9d3d5f20dab44a1ac3eff7fc1b3e83a733ae460223e748a`。本轮重新核对摘要并将两条实际赋值分别交给新解析器，没有重新取数或重做策略模拟。

| 实际输入 | 新解析器价格/前收 | 原上游时间 | 量额 |
| --- | --- | --- | --- |
| 510300.SH | 4.432 / 4.416 | 2026-09-30T16:14:43+08:00 | null/null，unknown |
| 159516.SZ | 0.651 / 0.671 | 2026-09-30T16:14:45+08:00 | null/null，unknown |

上述为已有真实响应的离线重验，不是新的目标 HTTP 正例，也不把旧日期改成当前时间。原文继续在忽略且权限受限的本地研究目录，不上传或写入 Git。

## 验证与并行输入变化

新适配/精确目录/鉴权 HTTP/晚到策略变更等最初17项通过；追加晚到来源目录移除反例后，新文件18项通过。报价、日线、HiThink和Control相邻6文件117项通过。关键flake8与定向差异空白检查通过。

`scripts/ci_gate.sh all` 均使用现有DSA `.venv`：

| 检查轮次 | 结果与真实原因 |
| --- | --- |
| 第一轮 | syntax/关键flake8/确定性检查通过；离线测试7858通过、2失败、1 skipped、4 deselected、626子测试通过。失败是旧测试仍假定腾讯只支持日线及bar ready数量，已按新增ETF Quote更新期待 |
| 第二轮 | 同样前三层通过；离线测试7859通过、2失败、1 skipped、4 deselected、626子测试通过。执行中收费对话扩大真实规则包窗口，旧测试仍把2023-08-24视为包外，不能标记整包通过 |
| 失败收敛 | 收费所有者更新其窗口断言；新增STOCK none/qfq也影响共享目录期待。获用户授权后协调两份目录测试写入，精确保留STOCK none/qfq、ETF三口径与ETF Quote，其他目标仍不准入。费用/报价/Provider/Control/目录六文件87项通过，没有关闭断言或忽略失败 |
| 第三轮 | 7867通过、1失败、1 skipped、4 deselected、626子测试通过；准入测试运行时加载旧的3个ready期待，当前文件已改为5个。883个源码/JSON输入摘要执行前后发生变化，不能作为稳定版本通过。当前准入文件9项定向复验通过，继续协调暂停写入并完成正式门禁 |
| 稳定整包 | `scripts/ci_gate.sh all`退出0；syntax、关键flake8、确定性检查全部通过，7868测试与626子测试通过，1 skipped/4 deselected。883个Python/JSON输入执行前后SHA-256均为 `90b5a6d9e91d0740a85f71f7611fac3c158a17eada6ff05e5a77565b3f52e7dc`，总耗时186.9秒；测试耗时171.30秒 |

本轮未重复修改收费文件，也未把跨越并行输入变化的检查结果当成同一稳定版本通过。所有已知低层失败收敛、稳定整包通过后才执行目标同步。

## 可交接生产输入

| DSA 路径 | SHA-256 |
| --- | --- |
| `data_provider/tencent_etf_quote.py` | `985e4a03aa4dc61942a116a751e9063191b5cad41c0a8a95ae2232c7bcc8a3c5` |
| `data_provider/tencent_fetcher.py` | `22df09d5b0edd267bfb6973672ba9ad0406563a34ceb53822908ad4b1e3f5f56` |
| `src/services/thesis_ledger_price_route_access.py` | `70ae84844d18d8f67e390a9187daa2689181f30077c456931441bb7a82049190` |
| `src/services/thesis_ledger_provider_runtime.py` | `b9265cc9bb668e77c805b67898575f77b00787e2b1592b2cb8cde2fdb5235824` |
| `src/services/thesis_ledger_current_data_route.py` | `64e5f4ecd92621fd74d85dc79a439d712db742963a29b9dd0ef74478457bb984` |
| `src/services/thesis_ledger_provider_manifests.py` | `f259f890b1b682bf1768ef871d5486fc1e736801f96c81a1650544f66986ca3b` |

目标开始时策略revision/dsaRevision为36，四条既有日线/NAV路由，没有Quote。后续只按新读取的当前修订增量添加ETF腾讯Quote；不覆盖收费对话正在增加的股票/收费路由。生产输入、目标变更和页面实读结果必须分开记录。

源码交付的rollback边界为本轮局部增量；不使用reset/checkout覆盖原dirty。未重启已跳过来源、不执行付费调用、迁移、清理、故障注入、备份恢复、提交或推送。

## 目标同步与真实 HTTP

获协调窗口后从 `thesis-ledger-infra` 执行 `./scripts/sync-code.sh dsa`，影响参数为 `COREPACK_NPM_REGISTRY`、`pnpm_config_registry`、`npm_config_registry` 均指定 `https://registry.npmmirror.com`；兼容预检通过，DSA WebUI构建、源码同步、重启及就绪检查成功，退出0。未更新依赖/数据库/卷；镜像仍为 `sha256:08bfe1b5a0d59d6b27c54e961a5850f603885b4686d459818897c68d3bcd250e`，仅可写层快更，容器重建后需重新同步。

只读核对六个报价生产文件的容器摘要均与宿主一致。目标目录腾讯ETF Quote为ready，其他Quote目标保持not_admitted。标准 `PUT /api/market-data/policy` 增量保存修订36→37：revision/dsaRevision均37、syncState=applied、Quote目标eligible，四条原路由内容一致。

| 目标 Server 新实读 | HTTP / 耗时 | 价格 | 原行情时间（UTC） | 抓取时间（UTC） | 字段状态 |
| --- | --- | --- | --- | --- | --- |
| `/api/market/510300.SH/quote` | 200 / 0.28秒 | 4.432 | 2026-09-30T08:14:43 | 2026-10-06T10:00:05.486742 | provider=tencent、stale=true、volume/amount=null；首次非缓存 |
| `/api/market/159516.SZ/quote` | 200 / 0.19秒 | 0.651 | 2026-09-30T08:14:45 | 2026-10-06T10:00:05.685699 | 同上；首次非缓存 |

## 详情消费接缝修复

首次真实浏览器实读中独立Quote已经成功，但详情Quote显示 `provider_policy_unavailable`，没有伪记页面通过。定位 `MarketDetailService` 的 `normalizedPolicyRoutes` 仍要求旧对象，而当前V3投影是数组。按PR-AC06拆出PR08a：market域helper复用共享 `effectiveProviderPolicyV3Schema` 校验已应用/同修订投影，只映射CN data路由的eligible目标；原服务删除旧解析函数，规模收敛。未改DSA/UI/费用或跨feature职责。

新增14个详情层回归覆盖陈旧Quote双时钟/null正例、非法/晚到修订/未应用投影、错误市场/资产/能力、不可用/禁用目标与旧对象拒绝；既有4项改用V3真实形状fixture，共18项通过。Server全包299文件/2425项通过，47文件/217项跳过；跳过不计作通过。`pnpm --filter @thesis-ledger/server typecheck`及`build`退出0；四个修改文件ESLint、Prettier、导入边界、workspace依赖门禁、复杂度脚本与`GUARDRAIL_BASE_REF=HEAD`尺寸ratchet均退出0。尺寸门禁仍有9条既有技术债告警，没有增加阈值或忽略项。旧详情服务496→453行，纯投影helper31行。

## 消费端同步与最终页面

同一协调窗口从 `thesis-ledger-infra` 执行 `./scripts/sync-code.sh thesis-ledger`，同上述三个registry参数；兼容预检、Server/workspace构建、Server/Worker同步重启和就绪成功，退出0。Server/Worker镜像均保持 `sha256:95d8e518ffee019a8a29a13979b4fd9736f914153c4b78c636d6e0866c87a0b0`。仅可写层更新，不执行依赖升级、数据库/卷操作或镜像发布。

只读核对实际启动产物位于容器 `/app/apps/server/dist`，Server/Worker均与宿主构建摘要一致：

| 实际产物 | SHA-256 |
| --- | --- |
| `dist/src/market/market-detail.service.js` | `9f32e1e55cbff45208f842ee3c086db9d8122b8149ddc62d5cb64412da28019b` |
| `dist/src/market/market-detail-policy-v3.js` | `a2a6b340a782862148942dcf6cdb50473f0e9fba57a966f0b3ef5fc481707e7a` |

真实 `/api/market/159516.SZ/detail?...&adjustment=qfq&refresh=1` 返回200，Quote分区status=stale，价格0.651、量额null、provider=tencent、原行情时间2026-09-30T08:14:45+00:00与缓存抓取时间均保留。没有用单独Quote成功代替详情成功。

隔离临时Chrome浏览器访问 `http://127.0.0.1:5173/market-data`，从标的目录搜索159516打开行情详情；未拦截或替换任何响应。Quote分区实际显示腾讯财经、¥0.65、−2.98%、前收¥0.67、行情时点2026/9/30 16:14:45，沿用现有“按上游间隔”提示；`data-section-status`保持stale，间隔提示不把原行情日期改为今天。行情详情/目录/策略等请求200，浏览器errors为空，未触发连续重试。人工查看截图通过：[真实页面截图](/private/tmp/thesis-personal-research-tencent-quote-20261006.png)。此证据是Web真实页面，不代替Electron或移动端设备验收。

已通知“历史市场规则来源核验”释放目标窗口，交接生效修订37和新增Quote保留要求；后续费用/股票任务自行按新修订增量保存。PR06～PR08和PR08a勾选，原五项严格能力保持原验收状态。新增职责边界、失败记录、真实来源与消费证据对账完成；未提交或推送。
