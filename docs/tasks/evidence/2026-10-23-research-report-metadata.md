# 研报元数据实现与当前阻塞证据

对应：[规格](../../specs/2026-10-23-research-report-metadata.md)、[已完成任务](../../archive/tasks/2026-10-23-research-report-metadata.md)、[来源前置核对](2026-10-22-research-report-metadata-preflight.md)。

## 当前结论

本地个人研究的最小元数据合同、正式准入入口及目标链路已通过：真实单页采证 2 条，首次精确准入、单条路由、Server 采集 201、历史/快照读取 200，以及同一 Server 容器重启后的全部字段与摘要留存。当前目录完整 30/196，研报目标为 ready；政策修订 173、20 条路由，原 19 条保留。准入只覆盖 `600519.SH`、`2026-08-01`～`2026-10-23`，有效至北京时间 `2026-10-24 02:44:05`；不自动续期，不声称全历史完整。

最终 Account 从 16 条增至 17 条，原 16 条内容摘要及其余 10 张受保护业务表与基线一致，来源配置、原能力条目、全部挂载及镜像保持。用户已确认北京时间 `2026-10-23 02:48:04.978` 的新增为预期并发操作，要求保留并继续收口；这一确认解除最后保护条件，RM0～RM5 全部完成，任务已归档。账户增量保留，未执行账户写入或回滚；本轮仅做文档接续，实源、重启及部署证据复用。

## 已实现范围

- 独立能力为 `RESEARCH_REPORT_METADATA`，精确键为 `data/CN/STOCK/RESEARCH_REPORT_METADATA`，唯一新增绑定为 `akshare/eastmoney`。静态注册与部署后目标目录均为 30 个 Provider、196 个精确目标；研报占 1 个，已在本次单标/窗口及有效期内准入。原 30/195 验收记录继续作为历史保留，目录登记不替代真实消费。
- DSA 入口为 `POST /api/v3/thesis-ledger/market/research-report-metadata`，沿原认证和执行器；只接收沪深股票规范代码、显式日期、1～1000 页码、1～20 条页大小和 500～5000 ms 请求预算。每次一个列表请求，响应体最多 256 KiB，不重试、跟随重定向、换源、翻页或请求附件。
- 严格核对 `stockCode`、`infoCode`、有效日期、最小字段、页码/条数/总页数和页内唯一性；错误页整体拒绝。引用示例为 `eastmoney:report:AP202609211829719676`。只保存日期精度及构造的原文链接，不投影零点精确时刻、EPS、评级、摘要或正文。`historyComplete=false` 始终保留。
- 规范响应携带 `metadataVersion=research-report-metadata-v1`、来源/适配器修订、政策修订和实际路由目标。单页执行要求一个有效目标和现有精确准入，读取前后核对政策/Provider 代次；未准入或变化时不消费结果。新增能力不创建目标路由、不启用 Provider。
- Server 的 `POST /api/market-data/research-report-metadata/collect` 使用既有目录身份，不创建资产或持仓。规范请求与响应写入独立 `MarketReportMetadataSnapshot`，每次采集保存独立 UUID、内容摘要、采集时间和外键身份，不覆盖旧快照。
- `GET /api/market-data/research-report-metadata/history?instrumentId=...&limit=...&cursor=...` 和 `GET /api/market-data/research-report-metadata/snapshots/:snapshotId` 只读本地记录。历史页最多 20 个快照，游标绑定标的，缺失、空历史及内容校验失败分别表达。API 为本切片消费入口，尚未新增页面或模型消费。
- 新增 migration 为 `20261023010000_report_metadata_snapshots`。Prisma 仅新增快照 model 与目录反向关系，未做整文件格式化；全部既有 migration 保持。新表属于 Prisma model，不新增 raw-owned 例外。

## 已通过验证及输入

| 层次 | 命令或输入 | 结果 |
| --- | --- | --- |
| 来源与控制回归 | DSA `.venv/bin/python -m pytest tests/test_report_metadata_page.py tests/test_report_metadata_http.py tests/test_thesis_ledger_capability_registry.py tests/test_akshare_exact_eastmoney_contract.py -q --tb=short` | 最终 393 项通过，其中新增元数据 42 项；全部为离线/隔离 HTTP 或合成数据，无新增实源请求 |
| 共享合同 | `pnpm --filter @thesis-ledger/schemas exec vitest run test/research-report-metadata.test.ts` | 14 项通过；规范身份、请求关联、日期/引用/分页及额外字段拒绝 |
| 本地消费与历史 | `pnpm --filter @thesis-ledger/server exec vitest run test/report-metadata.test.ts` | 10 项通过；内存持久化替身下的独立快照、重新建立 repository、篡改检测、历史不联网与游标隔离；不冒充 PostgreSQL 或目标重启验收 |
| 隔离 PostgreSQL | `node scripts/test-journal-review-postgres.mjs test/report-metadata-postgres.integration.test.ts` | Docker 恢复后同一入口退出 0；36 个 migration、正确 head、3 项测试通过，临时容器已清理 |
| 编译 | `pnpm db:generate`、schemas `build`、Server `typecheck` | 通过；新 Prisma Client 已生成 |
| 包级构建 | 隔离脚本中的 `pnpm --filter @thesis-ledger/server... build` | Server 及其依赖构建通过；首轮随后 Docker 超时退出 1，Docker 恢复后同入口整体退出 0 |
| DSA 工程门禁 | `./scripts/ci_gate.sh syntax`、`deterministic`；修改 Python 文件的 `flake8 --select=E9,F63,F7,F82 --count --statistics` | 语法 390 个运行文件通过；确定性/测试清单/边界检查通过；关键 flake8 错误 0 |
| 结构与边界 | Prisma `validate`（一次性占位 `DATABASE_URL`）、`node scripts/check-boundaries.mjs`、`node scripts/check-migration-matrix.mjs` | 全部通过；36 migrations、84 SQL tables、68 Prisma models、16 raw-owned tables，head 为新 migration |
| 数据库运行输入 | `node scripts/check-runtime-database-input.mjs` | 36 个 migration SQL 和打包后的结构执行器通过 |
| 最后文档与差异核对 | 本切片涉及的 22 个主仓文件、13 个 DSA 文件；定向 `git diff --check` 与本地链接检查 | 两仓差异检查通过；166 个本地链接无缺失，所列文件无行尾空白 |

上述高成本检查仅在其源码、schema、依赖或运行输入改变时重跑；文档修改不触发来源重测。未变的 Finnhub 免费范围、Alpha Vantage、首存状态修复及原业务证据继续复用。

## 新卡点与解除条件

执行正式隔离入口：

```sh
node scripts/test-journal-review-postgres.mjs test/report-metadata-postgres.integration.test.ts
```

脚本先完成包级构建，在自身第 37 行的 `docker run --pull never -d ... --tmpfs /var/lib/postgresql/data ... postgres:17-alpine` 步骤返回 `spawnSync docker ETIMEDOUT`，超时上限 60000 ms。该入口使用随机隔离名、临时数据库和 tmpfs，不挂载目标业务数据卷。脚本没有确认容器启动成功，尚未执行新 migration 或 3 项 PostgreSQL 往返测试；本次临时容器是否实际创建亦未确认，不能声明已清理。

解除条件是 Docker 恢复响应，并先只读核对隔离执行状态；随后重跑同一维护入口。当前不自行换数据库、拉取其他镜像、改超时或直接操作 Docker 作为替代。目标 `update.sh`、新能力准入/路由和真实单标消费均未执行，仍在活动任务中保留缺口。原来源配置、原路由、研究数据、模型暂停和 Longbridge 暂缓边界保持。

## 2026-10-23 只读接续检查

用户确认先只读检查 Docker，恢复后重跑同一隔离验证。仅执行有 10 秒上限的 `docker version --format '{{.Server.Version}}'` 服务端查询，实测 10.01 秒超时，未取得 Server 版本。该结果只能证明 Docker 服务端查询当前未响应，不能据此判断具体故障原因。

按约定在此停止，未继续容器清单或其他方案排查，未重跑隔离脚本、重启 Docker、部署或修改业务数据。上次隔离容器的实际状态仍未确认。等待 Docker 恢复响应后，继续原只读核对与同一隔离入口；已通过源码检查的输入未变，继续复用。

## 2026-10-23 Docker 恢复与同入口验证

用户确认 Docker 已恢复并授权继续同一隔离验证、通过后继续研报验收与部署。只读服务端查询在 0.03 秒返回 Docker `29.7.2`；`ledger-journal-test-` 前缀的旧隔离容器清单为空。源码输入未比上次证据更新，复用原定向与静态检查。

重跑同一维护入口完成 Server 及依赖构建，隔离数据库为 `journal_review_fixture`、owner 为 `fixture_owner`，全部 36 个 migration 成功执行，head 为 `20261023010000_report_metadata_snapshots`。3 项测试验证真实 JSONB/摘要往返、断开重连后的历史读取、独立快照与无重叠游标、目录外键保护及载荷失真拒绝；测试于本地 `01:08:01` 开始，3 项通过，入口退出 0 并确认清理临时容器。

部署前补充既有控制界面的中文能力标签“研报元数据”，仅扩展同一标签映射；Desktop `typecheck` 通过，没有新增页面或移动端变更。

## 完整更新的基线与执行方式

用户在执行中明确“取消快速模式”。因此本次不使用 `sync-code.sh`，在 `thesis-ledger-infra` 执行完整、默认保留数据的 `rtk proxy ./scripts/update.sh all`。使用正式脚本所需的进程锁与 Docker 权限，未跳过兼容性、空间或数据库门禁；其余影响行为的参数使用默认值。

只读基线为 30 个来源、195 个精确目标，政策及有效投影均为修订 172、19 条路由；目标 schema head 为 `20261019020000_research_observation_versions`。9 行 DSA Provider 配置整体摘要为 `a4bccdba6de9a29305fc2c5dc258737fb1b9124fc256e88138a994ec710316fa`，仅保存摘要，不保存凭据值。另记录 11 张业务表的行数/内容摘要及容器镜像、卷名/挂载目标，供更新后独立比较。

基线中的关键行数为 Account 16、Asset 4、Trade 15、CashBalance 11、PortfolioSnapshot 6、Strategy 91、StrategyVersion 92；ResearchObservation、ResearchObservationVersion、ResearchObservationSubmission 和 JournalEntry 均为 0。TickFlow/Finnhub/Alpha Vantage 仍停用且配置版本为 3/1/1，Longbridge 未配置且停用；本次部署不自动增加研报路由或改动这些状态。

更新前的规范配置视图 SHA-256 为 `9e08e296493cd5a7c4fb25b8f879ae349c13e20956faadce15229c4f91fa0a7f`；原 195 项完整能力条目 SHA-256 为 `785a2577f396b66b37e9576bff443be6bcb2632e02518de5586837cbec941dc8`；原政策及历史路由投影 SHA-256 为 `404e15723a0d951e71bfc99838e1071af2f504bf191f93e6595bba525120c00d`。业务表按规范 JSONB 文本排序聚合后的只读 MD5 如下，未保存业务正文：

| 表 | 行数 | 内容摘要 |
| --- | --- | --- |
| Account | 16 | `f8721e75bfbee7045ca04a17e277d35b` |
| Asset | 4 | `6c79166c45748a979545f26efc733e20` |
| Trade | 15 | `5fa4566f181c906ead83b2de63d6725a` |
| CashBalance | 11 | `98db9c67f69b015983d925a62d0ca50f` |
| ResearchObservation | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| ResearchObservationVersion | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| PortfolioSnapshot | 6 | `de7036e64d8e27d5de10f213325aef01` |
| JournalEntry | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| Strategy | 91 | `29d9bf23213ed6ebb924820770975a71` |
| StrategyVersion | 92 | `346a8c152f8ad6f2759ff54dcd3fb95d` |
| ResearchObservationSubmission | 0 | `d41d8cd98f00b204e9800998ecf8427e` |

## 完整更新结果与新的结构门禁

正式入口为 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra/scripts/update.sh all`，执行目录为 infra 仓库，最终退出 1。用户已取消快速模式，本轮未执行 `sync-code.sh`。脚本沿用已存在的保卷恢复挂载配置；空间整备保留当前运行基线和数据卷，退役一个未引用的历史 DSA 回滚标签后，在已知正余量下继续。主应用首次系统依赖安装失败后由脚本自身保留缓存重试一次，后续依赖安装及应用编译完成；没有手动更换源或绕过门禁。

本轮构建完成但尚未发布的新镜像为：

- DSA：`sha256:8c3590c33a2c0ce69087f64ccde7dd27f70fd30bf2159748b71d32d2511d4afb`，创建于 `2026-10-22T17:22:17.020673088Z`。
- ThesisLedger：`sha256:bf8b8df3f20715a6326ee447da7dac0b34eb0dcfae794f262aba4906621d00d1`，创建于 `2026-10-22T17:25:28.286436469Z`。

失败发生在 `生成数据库结构 SQL（模式: check）` 后，输出 `database structure is incomplete`、`数据库结构校验失败；新版应用不会启动`，并提示使用 `DEV_DATABASE_MODE=upgrade` 完成目标确认及备份演练。只读确认数据库名与 owner 均为 `thesis_ledger`，Compose 项目为 `thesis-ledger-dev`；新表 `MarketReportMetadataSnapshot` 不存在，head 仍为 `20261019020000_research_observation_versions`。这不是隔离数据库验证失败，也不代表新镜像已部署。

失败后的独立只读快照与更新前比较：Provider 规范配置视图、9 行 DSA 配置完整摘要、原 195 项能力条目、政策及历史路由投影、11 张业务表行数/内容摘要、全部五个容器的运行镜像及卷挂载、schema head 均保持一致；五个服务均为 healthy。当前 API 仍为 30 来源/195 目标、政策 172/19 路由。未调用新的目标研报探针或采集接口，没有写入研报快照、启用来源或新增路由。

## 已授权的保留数据升级动作

新卡点来自正式脚本的默认结构检查模式，此前已按用户要求停止。用户随后明确选择“执行保留数据升级，随后继续验收”。现继续使用同一正式入口和本轮已完成的新镜像，对已经核对的精确目标执行 `upgrade`，保留数据并由官方流程完成备份、副本演练与结构门禁；不使用 `rebuild` 或数据丢失开关：

```sh
DEV_DATABASE_MODE=upgrade \
DEV_DATABASE_CONFIRM=thesis-ledger-dev/thesis_ledger \
REUSE_DSA_IMAGE_ID=sha256:8c3590c33a2c0ce69087f64ccde7dd27f70fd30bf2159748b71d32d2511d4afb \
./scripts/update.sh all
```

`REUSE_DSA_IMAGE_ID` 仅复用本轮同一源码已构建成功的镜像，不是可写层快更；主入口仍是完整更新。命令已在用户确认后执行并退出 0。升级前再次只读核对，来源配置、原 195 条能力、政策与历史、11 张业务表及旧结构版本均与更新前基线一致；升级后的独立结果如下。

## 保留数据升级与目标部署结果

实际执行目录为 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`，入口为该仓库的 `scripts/update.sh all`，非敏感参数如上；未使用数据丢失开关。正式流程先停止消费者、备份目标库，在隔离副本恢复并升级，确认结构、权限及数据保留后执行目标事务，最后通过默认结构检查并启动应用。执行窗口约 348 秒，退出 0。

备份与演练证据目录为 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra/.database-upgrades/run.7LVZPK`，由正式入口生成，未将数据库备份加入源码：

- `backup.dump` 为 3,902,020 字节，SHA-256 为 `0183ddcbbeb607ade9f862ee4a9ecc2dd23f747b62658b86797b3017c411837c`。
- `rehearsal.json` 核对目标 database/owner 均为 `thesis_ledger`，源 head 为 `20261019020000_research_observation_versions`，升级后为 `20261023010000_report_metadata_snapshots`；`structureComplete`、`appRolePermissions`、`preservedData` 均为 true。
- 消费者停止于 `2026-10-22T17:52:08.391Z`，备份完成于 `17:52:09.527Z`，副本恢复完成于 `17:52:15.534Z`，副本升级完成于 `17:52:22.529Z`，验证完成于 `17:52:32.998Z`；这些时间对应北京时间 2026-10-23。
- `execute.log` 返回“事务执行成功。”；目标只读查询确认实际 head 已为新版本。

独立运行态核对结果：

- Server 与 backtest-worker 运行镜像均为 `sha256:bcea4a8d2c603753c89814388f5c849b7f6df41f48597fe64bfb5b7d518cdedf`；DSA 为上述复用镜像 `sha256:8c3590c33a2c0ce69087f64ccde7dd27f70fd30bf2159748b71d32d2511d4afb`。五个服务均为 healthy。
- 上表 11 张业务表的行数和内容摘要均与基线相同；来源规范配置视图、9 行 DSA 配置、原 195 条完整能力条目及政策/历史路由投影的摘要均保持。政策仍为修订 172、19 条路由，来源启停与配置版本未变。
- 按挂载目标归一化后，五个服务的全部卷名、来源和挂载目标均与基线相同；六个研报相关 DSA 运行文件的 SHA-256 与已通过检查的宿主输入相符。
- 升级完成后的 Server、Worker、DSA 日志中未发现本轮核对的缺表、结构不完整、模块缺失或 fatal 启动错误；服务健康不用于替代真实研报消费。
- 北京时间约 `01:55:29`，`GET /api/market-data/routes/capabilities?contractVersion=3` 返回 200、`status=complete`、196 个精确目标；新增研报项为 `not_admitted`。
- 同时 `GET /api/market-data/research-report-metadata/history?instrumentId=86b1de50-d50d-4007-84c0-918e7e5409ca&limit=2` 返回 200、`items=[]`、`nextCursor=null`，验证新表及本地历史 API 可用，未据此宣称已有真实快照。

## 当前卡点：精确研报目标尚未准入

目标目录已部署以下精确能力，但其状态为 `not_admitted`；现行 19 条路由保持原状。按用户要求停止在来源调用前，未发送本轮目标探针或采集请求，未自动写政策、启用来源或写入研报快照。

用户追问状态原因后补充只读核对：DSA 控制库 `thesis_ledger_route_admission_v3` 中，该 consumer、精确键及 `akshare/eastmoney` 目标的记录为 0 条；当前政策中对应研报键也为 0。实现将新绑定声明为 `admission_required=True`；目录以 `_catalog_market_v3_admission_is_current` 核对当前准入记录，记录不存在时返回 `not_admitted`。准入与业务路由是两个独立条件，单加路由不会生成准入；此状态来自本地控制面，尚无本轮来源请求或上游权限拒绝证据。

待确认的新增范围仅为一条精确路由：

```json
{
  "key": { "kind": "data", "market": "CN", "assetType": "STOCK", "capability": "RESEARCH_REPORT_METADATA" },
  "target": { "providerId": "akshare", "upstreamSource": "eastmoney" }
}
```

解除条件是用户确认在保留原 19 条路由及现有来源启停状态的前提下，对这一目标补齐正式准入流程、执行精确验证准入及单条业务路由配置。需先取得真实单页证据，再经正式维护入口记录有效准入，随后执行已计划的 600519.SH 单页采集、引用与本地历史读取及重启后留存验收；来源窗口、页大小、预算、用途和历史完整性边界保持。RM3a、RM4、RM5 继续未勾选，不把新目录登记或部署健康计为真实业务完成。用户本次追问原因不作为上述动作的授权。

## 准入生成流程的接入缺口

进一步只读核对确认：`src/services/thesis_ledger_control.py` 的 `record_route_admission_v3` 要求证据引用与 SHA-256、标的/日期范围、适配器/来源/凭据修订、有效期及记录者，并明确该方法不暴露于 Control HTTP API，普通配置与健康检查不会写入证据。

`src/services/thesis_ledger_exact_probe_read.py` 已分派研报能力到 `read_report_metadata_probe`；后者以 600519.SH、截至检查日前一天的一年窗口、单页 2 条和 3 秒预算读取，并拒绝无可核验记录的结果，但不写准入记录。已核对 DSA、主仓和 infra 的维护脚本：现有专用准入入口覆盖现金公告、东财拆分、新闻等，研报元数据尚无对应入口。因此当前是本地接入缺口；尚未发送本轮目标来源请求，不能归因于东财权限或可用性。

拟补齐的最小流程为：取得并校验既定单标单页真实证据，经正式维护脚本显式记录与证据匹配的精确准入，再仅配置该能力的业务路由并完成采集/历史/重启验收。不得以硬编码 ready、手工改库或移除 `admission_required` 绕过；其他来源、原路由及暂停边界保持。活动任务新增未完成的 RM3a，不撤销输入未变的既有测试或部署证据。

## RM3a 工程补齐与部署前检查

用户随后明确选择“补齐正式准入流程并继续验收”。新增 infra 正式入口 `scripts/report-metadata-admission.mjs` 及其目标端 Python：默认计划、显式单页采证、首次应用、只读核验互斥；核对本地端点、项目、容器/持久卷及互斥锁，保存不可变规范证据，在原记录方法的写事务内核对首次记录及控制状态。应用限制采证后 30 分钟、显式摘要/记录人和最长 24 小时有效期，不写凭据或政策、不覆盖或续期。infra README 已记录使用方法。

DSA 研报消费入口增加标的及完整日期窗口校验，并在来源返回后重新读取准入、比较起始快照，拒绝过期、替换或控制变化的晚到结果。新增 6 项围栏与正常读取测试；来源协议、适配修订和历史不完整语义不变。

| 检查 | 命令与输入 | 结果 |
| --- | --- | --- |
| 正式入口参数和目标 | infra `node --test scripts/report-metadata-admission.test.mjs` | 5 项通过；默认计划不触发 Docker，错误/冲突范围、目标和原卷检查 |
| 正式记录与证据 | infra `PYTHONPATH=../daily-stock-analysis ../daily-stock-analysis/.venv/bin/python -B scripts/report-metadata-admission.test.py` | 9 项通过；真实隔离 SQLite 首次记录/读回、不覆盖、无初始化、证据失真/过期/范围、写事务内控制变化回滚及单次采证 |
| DSA 相关回归 | 原 4 个研报/注册表/东财合同测试文件的同一 pytest 命令 | 399 项通过，包括新增 6 项；无真实来源调用 |
| DSA 门禁 | `./scripts/ci_gate.sh syntax`；使用项目 `.venv/bin` 优先 PATH 的 `./scripts/ci_gate.sh deterministic` | 390 个运行文件语法、统一能力边界、运行输入和测试清单通过；首次未指定项目 Python 的确定性入口因宿主无 pandas 失败，使用既有虚拟环境后通过，未安装新依赖 |
| 关键 lint | 新入口/测试及修改后的 DSA 文件，`flake8 --select=E9,F63,F7,F82 --count --statistics` | 0 个关键错误 |
| 差异和链接 | 本切片主仓 22、DSA 13、infra 5 个文件 | 差异/空白核对通过，176 个本地文档链接无缺失 |

采证前目标快照仍为 schema head `20261023010000_report_metadata_snapshots`、30/196 目录与原修订 172/19 路由；来源、业务表和空研报历史的既有保全证据继续保留。新消费围栏改变了 DSA 运行代码，采用正式完整 `update.sh dsa`；当前尚未执行本轮实源读取或准入写入，不复用旧 DSA 镜像冒充新代码已部署。

## 正式准入、路由与真实业务验收

### DSA 完整更新与保护核对

在 infra 目录执行正式 `rtk proxy ./scripts/update.sh dsa`，使用默认保留数据及结构检查，退出 0，窗口约 662 秒；耗时主要来自既有原生 SDK 构建。未执行快更、账号申请或模型调用。新 DSA 镜像为 `sha256:7e7711b850bea7f6e5fc87cfd820c7d8fb66ed8257ac18ddba755ef8ad2400fb`。

更新后六个相关运行文件的摘要与已验证源码一致，其中研报消费桥为 `bb116f90d64250becb23d9cfe13eddd11510aaf2b2a459099d128bcb0c95f0db`。当时 11 张业务表、Provider 配置、原 195 项能力、政策/历史、全部挂载、schema head 及其他服务镜像均与更新前相同，五个服务健康。

### 单页采证与首次准入

正式入口为 infra 的 `node scripts/report-metadata-admission.mjs`，每次都显式传入以下精确目标：

```sh
--symbol=600519.SH --start=2026-08-01 --end=2026-10-23 \
--confirm=thesis-ledger-dev/akshare/eastmoney/600519.SH/2026-08-01/2026-10-23
```

依次执行默认计划、`--collect`、`--apply --sha256=<下述摘要> --valid-hours=24 --recorded-by=codex-local-research`、`--verify`；模式分别执行，均退出 0。采证为真实单页 2 条、3000 ms 预算，不执行普通探针的额外重复读取。规范证据保存在原数据卷 `/app/data/thesis-ledger-report-metadata-evidence/f69ec76818e302dac31a4483502f7e3279f3e2a734e4a788a5fa796fd7dd400d.json`，SHA-256 为同名摘要。来源引用为：

- `eastmoney:report:AP202609211829719676`，诚通证券，日期 `2026-09-21`。
- `eastmoney:report:AP202608211828244348`，西南证券，日期 `2026-08-21`。

首次准入 `recordVersion=1`，仅覆盖上述股票和窗口；有效至 `2026-10-23T18:44:05.134486+00:00`，即北京时间 `2026-10-24 02:44:05`。应用回执确认 `policyWritten=false`、`credentialsWritten=false`，只读核验确认同一摘要、范围与记录有效；新目录项由 `not_admitted` 变为 ready。后续不自动续期。

### 单条路由与真实采集

使用既有 `PUT /api/market-data/policy`，以 `expectedRevision=172` 提交修订 173，仅在原 19 条路由之后增加研报精确目标。北京时间 `02:45:55` 返回 200，独立 GET 核对 20 条路由、原 19 条内容及顺序不变、全局启用状态不变、`syncState=applied`、`effectiveStale=false`；新增目标 `eligible=true`。请求标识为 `3d771135-9dda-42b0-98c2-dcb4eb73a7d3`。

经 Server 的目录身份接口，对 `86b1de50-d50d-4007-84c0-918e7e5409ca` 以同一日期范围、页 1、2 条、3000 ms 执行一次 `POST /api/market-data/research-report-metadata/collect`。北京时间 `02:46:36` 返回 201，保存实际快照：

- 快照：`e7a946d5-f576-4e8b-8bae-c8ebfb1426b7`。
- 请求：`904ea252-44fa-4106-ad03-0c678ac4b381`。
- 内容 SHA-256：`75eea2bb1b8092553459e150b27ded2f60020d9c624864522f6fc5b81faacbe2`。
- 返回 2 条，窗口内来源总条数 12、总页数 6；仅第一页，不扩大读取，`historyComplete=false`、日期精度为 date。来源/适配修订及 `policyRevision=173`、`routeTarget=akshare/eastmoney/0` 均保存。
- `GET /snapshots/:snapshotId` 与 `GET /history?instrumentId=...&limit=2` 均返回 200，历史仅包含同一快照、游标为空；全部字段与采集结果相同。原文链接仅保存模板链接，未请求 PDF 或正文。

### 同一 Server 重启后的留存

新增正式入口 `scripts/restart-server-for-acceptance.mjs` 及 2 项定向测试，验证默认不操作 Docker，精确项目/服务/镜像/数据卷和身份保护；2 项通过。以默认计划确认，再带 `--apply` 执行：

```sh
node scripts/restart-server-for-acceptance.mjs \
  --confirm=thesis-ledger-dev/thesis-ledger \
  --image=sha256:bcea4a8d2c603753c89814388f5c849b7f6df41f48597fe64bfb5b7d518cdedf --apply
```

入口退出 0。Server 容器 `48a3d1adf21b3c62313e8f68aa9a6a344ccbf4d7b8b9679c926e45ad509fe7dd`、镜像及全部挂载保持相同，启动时刻更新为 `2026-10-22T18:47:16.889831045Z` 并恢复 healthy；未构建或操作其他服务。北京时间 `02:48:07` 重新读取快照和历史均为 200，快照 ID、内容摘要、日期、引用、来源/政策出处及全部字段与重启前一致。重启后正式准入只读核验仍通过，未新增来源读取。

## 已解除的停止点：并发账户新增

最终只读快照确认五个服务健康、schema head 正确、30/196 目录完整、研报目标 ready、政策 173/20 条已应用。规范 Provider 配置、9 行 DSA 凭据配置摘要、原 195 项能力及全部镜像/挂载与本轮部署基线一致；原有 19 条路由保留。

受保护表中只有 Account 发生增量：16 → 17。进一步仅只读查询创建时间及摘要，以更新开始前的 `2026-10-22T18:31:22.299Z` 为分界，原 16 条聚合摘要仍为 `f8721e75bfbee7045ca04a17e277d35b`，与初始及部署前基线完全一致；其余 10 张业务表摘要也一致。新增记录创建于 UTC `2026-10-22T18:48:04.978`、最后核对的更新时间为 `18:48:59.156`，对应北京时间 `2026-10-23 02:48:04.978`、`02:48:59.156`。未输出账户名称、财务内容或凭据。

本轮仅提交研报准入、单条政策和研报快照，未调用账户写接口；该新增可能来自并发操作，但来源尚未经用户确认，不能把整表摘要差异直接标记为已通过。按用户要求在此停止，不删除或回滚新增账户，也不扩展调查其他方案。解除条件是用户确认这是本人或其他聊天的预期新增、应保留并纳入新基线；确认后继续 RM4 的保护收口及 RM5，不重复实源读取或已通过的高成本检查。

用户随后明确选择“确认是预期新增，保留并继续收口”。原 16 条完整摘要未变的证据与其他保护核对继续有效，本次 16→17 的已知增量按用户确认纳入保护基线，未对账户执行任何写入或清理；RM4 的待确认条件因此解除。规格、来源合同、模块盘点、TODO 边界及当前总表已同步，RM5 完成并将 Task 移至 `docs/archive/tasks/2026-10-23-research-report-metadata.md`，现行 Spec 与全部历史证据保持。单项完成不代收模型研究、全历史覆盖或其他父项。

停止前最终核对覆盖主仓 22、DSA 13、infra 7 个本切片文件，共 42 个：`git diff --check` 及空白检查通过，176 个本地文档链接无缺失；最终修改文件的关键 flake8 错误为 0。未改动提交、索引或其他聊天的工作区修改。

用户确认后的归档核对覆盖主仓 23、DSA 13、infra 7 个文件，共 43 个：差异与空白检查通过，258 个本地文档链接全部可解析，归档 Task 的 7 个阶段全部勾选、无开放阶段。活动入口已改为直接引用归档，旧 Task 路径不保留重复正文；只更新文档与相对链接，没有新增实源、模型、数据库或 Docker 操作。总表已复核其余非移动端活动项：原模型/预算、合格身份/窗口/经济价格及通知授权条件仍未解除，Longbridge 暂缓，无新的已就绪实施叶；延期候选仍按 TODO 的重新立项条件处理。
