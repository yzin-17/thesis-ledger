# 多源扩展剩余实施与验收任务

> 任务标识：`multi-source-remaining-acceptance`
> 日期：2026-10-03
> 对应规格：[剩余范围规格](../specs/2026-10-03-multi-source-remaining-acceptance.md)
> 状态：本轮可执行叶已完成；真实来源输入及发布前回退门禁继续开放。

## 基线与共享约束

原[共同价格任务](2026-09-25-multi-source-adjustment-aware-backtest.md)和[共同价格证据](evidence/2026-10-03-common-price-baseline.md)保留完成状态。原剩余编号及历史未通过条件见[交接清单](evidence/2026-10-03-multi-source-remaining-tasks.md)。RQData 注册验证已按用户决定终止；AKShare/EastMoney、Tushare、RQData、TdxAiData 不继续请求或购买。

保护三仓既有 WIP。更新前本地 Server 镜像为 `sha256:ed7f1174ba5e6d2bfe944cc4aa7166afe2c2c435feaffaf56e9651866c9896a3`（2026-10-01），DSA 为 `sha256:6a7252651a631bc15dfc6824468f8485cee181ad7827c87935b77ace2215d725`（2026-10-01）；最新源码通过可写层同步，不能视作已进入这些镜像。构建前宿主可用空间约 7.6 GiB，失败后约 0.18 GiB；Docker.raw 上限 32 GiB，实际分配约 26.18 GiB。以清理后实测空间作为再次构建前置。

## 可执行叶

- [x] D00：清理 Docker 可回收构建缓存并恢复服务。
  - 用户已授权清理；保留全部数据卷、容器和回退镜像。首次有界清理因 daemon `_ping` 超时失败；再次收到清理要求时 Docker 已恢复响应，未由本轮执行重启。
  - `docker buildx prune --all --force` 返回成功，报告回收 12.8 GB，Build Cache 从 118 条 / 12.8 GB 降为 0 条 / 0 B；宿主可用空间从 7.24 GiB 增至 18.15 GiB，Docker.raw 实际分配降至 14.6 GiB。
  - 清理前后按精确名称/ID 集合摘要核对：48 个数据卷、18 个镜像引用及 6 个容器全部保留，所有回退标签均保留。清理前 5 个项目容器已经停止，traffic-monitor healthy；通过 P01 官方更新入口恢复项目服务，不把停止状态表示为健康。
  - 完成条件：daemon 恢复、缓存清理返回成功，记录回收量和实际磁盘空间；目标 Server/Worker/DSA/PostgreSQL/Redis 及其他运行服务状态核对。
  - 最终结果：P01 后再次清理重建产生的 7.43 GB 缓存，Build Cache 为 0 条 / 0 B；收尾复查宿主可用 26.31 GiB，Docker.raw 实际分配约 15.0 GiB。5 个项目服务和 traffic-monitor 均 healthy；原有 48 个数据卷集合摘要完全一致，5 个回退镜像标签均保留。本次隔离演练产生的具名资源和 6 个匿名日志/报告卷已精确清理，没有执行全局 volume prune。

- [x] E01：完成浏览器交互验收。
  - 覆盖 AC01；依赖当前 Desktop dist 和目标 API。当前 dist 晚于全部 UI 源码，复用已有产物。
  - 执行面：本机浏览器与目标 `127.0.0.1:3000`；使用既有前端预览入口，不创建真实业务数据。
  - 写集：本 Task、一次性外部截图和日志；发现消费面缺陷时先拆出定向修复叶。
  - 完成条件：浏览器展示应用、标的行情/图表三口径与已有成功 Run/冻结数据；无未处理的代理/API 消费错误，已知不可用来源如实显示，截图不含凭据。
  - 范围变更：Electron 43.2.0 二进制已安装、实际进程已启动，但 Computer Use 未获准访问窗口。用户随后明确只验证浏览器并暂时跳过窗口交互；不再以原生验收阻塞本轮。
  - 实际结果：Vite preview `127.0.0.1:5173` 消费目标 API。目录搜索 `159516` 后直接打开 ETF 行情，未确认标的或创建持仓；三口径切换正确，不复权/前复权收盘 0.651、后复权 2.604，日期为 `2026-06-30..2026-09-30`，切回前复权正确，实际来源显示腾讯。实时 Quote 路由未配置时明确显示暂时不可用，不计作专业 Quote 正向通过。
  - 已有备源 Run `e784e529-6d24-4df1-908c-5d5fba4c515c` 页面显示已完成，权益/回撤图表、结果概览和数据与假设加载正确；清楚披露归一化数量、固定供应商快照、腾讯备用来源与显式零成本。未再次运行或创建任务；当前标签页捕获的 Console 错误为 0。
  - 截图：`/private/tmp/thesis-ledger-browser-hfq-20261003.jpg`、`/private/tmp/thesis-ledger-browser-backtest-20261003.jpg`；Electron 验收不计作通过。

- [x] P01：通过官方入口构建并验证当前不可变镜像。
  - 覆盖 AC02；依赖本轮应用代码稳定与已有本地门禁。先核实候选镜像及构建空间；输入变更才重跑受影响检查。
  - 执行面：infra `./scripts/update.sh all`；当前两应用镜像均早于最新源码，因此使用完整更新，不把快更当镜像证据。
  - 写集：必要的官方更新接缝及定向脚本测试、本 Task；不推送远程仓库，不改变业务策略或清库。
  - 完成条件：完整脚本成功，镜像 ID/运行代码、结构 head、三服务健康、当前协议及已有普通回测/冻结读取通过，保留构建输入和结果。
  - 当前结果：`./scripts/update.sh all` 在 DSA 镜像提交阶段报告 BuildKit `metadata_v2.db: read-only file system`，脚本有界重试仍失败，未进入数据库处理与目标服务更新；待 D00 完成后再核实构建前置。
  - 空间恢复后重新执行同一官方入口成功，日志为 `/private/tmp/thesis-ledger-remaining-update-after-cleanup-20261003.log`；构建前缓存为 0、宿主空闲 18.15 GiB，已有回退镜像仍可取回。完整 SDK/应用构建、数据库 `check` 门禁和服务健康全部通过；未重建数据库。
  - 当前 Server/Worker 镜像：`sha256:f9738d362de75b1adf4de91160ac44c630a2243a27ea2054b268bc5a0db18811`；DSA 镜像：`sha256:de21d3fc8ae44c9a15c5f35abc97de74569ccd614aa33b5a3b542faa8fb6b351`。这是本地内容寻址镜像身份，未声明已推送远程 registry。
  - 实际目标 `/api/v1/health` 为 200 / healthy，结构 head 为 `20261001120000_require_explicit_strategy_contract`；策略 revision / dsaRevision 均为 36、syncState 为 applied。回测仍为 40 succeeded / 7 failed，无活动任务；4 条共同价格 Run 的读取及冻结重放另由 P02 核实。

- [x] P02：完成状态保真隔离恢复与候选相容性验证。
  - 覆盖 AC03；依赖 P01 的当前镜像和真实候选预检。
  - 执行面：独立 Docker 网络、PostgreSQL/Redis、DSA SQLite 与冻结制品副本；原目标只读。
  - 写集：本轮临时隔离验证入口、本 Task；使用官方入口或隔离测试入口，不手工替换目标容器。
  - 完成条件：SQLite 在线备份、PostgreSQL 一致性 dump 与目录 generation/策略修订一致；隔离副本健康、Worker ready、Accounts/目录/冻结 Run 读取和协议 smoke 通过。恢复前后核对目标状态，清理本轮临时资源；旧版本读取当前合同失败则明确判为不相容。
  - 一次性隔离入口：`/private/tmp/thesis-ledger-image-restore-20261003.mjs`；日志：`/private/tmp/thesis-ledger-image-restore-20261003.log`。使用 internal 网络及全新卷，HTTP 探针在隔离网络内执行。源数据卷只读，凭据仅进入权限受限临时环境文件，结束后删除。
  - 备份：PostgreSQL custom/no-owner/no-acl dump 为 18,700,246 字节、SHA-256 `97f8934f5691f68b74d59371ba0218360f3cce65dc4da5e90b283500339faa17`；SQLite 在线 backup 为 25,616,384 字节、integrity_check 为 ok、SHA-256 `5f230bc6f7d914d85f831fa2fa53464ddb79bd721582c3d0b736e8bd2924f84c`。同时复制完整 DSA 数据目录和冻结制品卷，保留持久化目录与策略关联。
  - 当前镜像副本：隔离 PostgreSQL/Redis/DSA/Server/Worker 健康，应用角色权限、Accounts、完整目录和策略修订读取通过；V3 协议及鉴权拒绝通过，catalogRevision 为 `4071195993804590`。目录核对排除每次 HTTP 生成的 `generatedAt`，完整 revision、entries 与其他合同字段均精确一致。
  - 4 条冻结重放使用实际 `assertCurrentRunForRead`、`LocalSnapshotStore.v3.replay`、`LocalSnapshotV3Runner.run`；结果校验值依次仍为 `4a11f72fb3b0ae7f`、`01fec3349070ad49`、`cb560dbe65dbe802`、`f310629effbdb556`。2 个账户、47 条回测及策略版本摘要在源与副本一致；演练前后源业务、目录和策略身份不变。
  - 旧候选 Server `sha256:ed7f1174ba5e6d2bfe944cc4aa7166afe2c2c435feaffaf56e9651866c9896a3` / DSA `sha256:6a7252651a631bc15dfc6824468f8485cee181ad7827c87935b77ace2215d725` 虽启动健康、V3 协议检查通过，但目录 revision/内容与当前备份不一致，因此不取得当前状态的回退资格。未继续以该候选执行业务重放，未操作目标回退。

- [x] H01：核实严格历史 PIT 的真实输入并推进可执行前沿。
  - 支持 AC04；当前只执行精确来源前置核验，不以此关闭 S05。
  - 只读入口：原 Task `S05-reconstruction-decision-window`、Server Market 历史重建及当前公开来源能力；真实同期归档或供应商历史版本必须实际存在。
  - 写集：本 Task 的输入矩阵；若输入就绪，先拆分合格历史窗口及冻结/重验两叶，再修改代码。
  - 停止条件：没有实际历史版本/决策可见性输入即停止依赖实现，保留 S05 及 AC04 未通过。

- [x] H02：核实 HiThink 事件、可靠因子及专业行情输入。
  - 支持 AC05；当前只核实原 Task `M31-a/b2-target`、`M32-b2`、`R02-quote-target` 的准确前置，不重做离线实现。
  - 执行面：现有证据和官方接口说明，只有新输入或明确验证目的才进行一次有界真实请求；不重复已失败的同前提请求。
  - 写集：本 Task 的输入矩阵。分别记录分红进度码/身份/币种、可靠因子/锚点、Quote 时钟/单位/修订；通过条件成立后按单一能力拆代码与目标验收叶。
  - 停止条件：官方语义或真实输入未确认时不授予事件/因子资格；单次 Quote 成功不推断长期可用性。

## 当前检查点

各叶有独立结果、执行面与停止点。D00、E01、P01/P02 通过，H01/H02 的前置核实完成；其真实能力后续实施仍依赖缺失输入。下方未勾选项保持未完成，不以文档整理代替验收。

### 来源输入核实结果

H01/H02 的勾选只表示本轮前置核实完成，AC04/AC05 与原 S05、M31/M32、R02 目标门禁仍未通过。

| 能力 | 本轮核实与当前前置 | 后续启动条件 |
| --- | --- | --- |
| 严格历史 PIT | 最新镜像目标 Server 仍未配置 `MARKET_PIT_RECONSTRUCTION_FILE` 与 `MARKET_PIT_RECONSTRUCTION_SHA256`；源码要求两者成对。现有证据未提供真实历史版本和独立决策日历绑定。 | 实际同期归档或供应商历史版本及决策可见性证据就绪，再拆出历史窗口、冻结与重验叶。 |
| HiThink ETF 分红 | [官方说明](https://fuyao.aicubes.cn/docs/api-reference/fund-corporate-actions/)于 2026-10-03 仍以“实施”为示例，未定义旧真实响应 `progress="2"` 的数字语义。[510300.SH 独立身份与币种候选](evidence/2026-09-29-cont-m31-510300-public-identity-currency.md)已核实 2025 年 6 月事件，不能外推为完整历史覆盖或其他标的资格。 | 数字进度定义或逐事件可信等价证据、完整覆盖及精确范围准入齐备后执行 `M31-b2-target`；精确路由继续 `not_admitted`。 |
| 可靠因子与派生 | 既有仓储、算法、精确时钟及 SourcePriceBasis 已有本地/隔离证据；真实 ETF 因子 Reader 的实际来源输入未就绪，Tushare 权限 40203 与用户跳过决定继续有效。 | 取得可靠因子、锚点与同一 raw 响应绑定，才接入真实 Reader 和目标冻结重验。 |
| 专业 Quote | [既有目标窗口](evidence/2026-09-29-cont-r02-hithink-quote-target-window.md)只证明短时正向链路；ETF 量额单位仍 `unknown`，真实凭据修订、晚到并发撤销和持续可用性没有目标证据。 | 独立单位/时钟证据及明确修订演练前置齐备后验证 `R02-quote-target`，不由单次响应推断长期可用性。 |
| 已跳过来源 | RQData 无账号，AKShare/EastMoney 当前不可用，Tushare 权限缺失，TdxAiData 无已确认免费资格且固定 SDK 与目标 ARM64 不匹配。 | 用户明确重新启动且实际前置发生变化；本轮不重复注册、购买或同前提请求。 |

### Docker 与浏览器当前记录

官方更新日志在 `/private/tmp/thesis-ledger-remaining-update-all-authorized-20261003.log`。缓存清理请求失败，未回收 Docker 空间；`docker system df` 返回 500，`docker buildx du` 与 `_ping` 超时。随后目标 `127.0.0.1:3000` 连接被拒绝，不能以先前 healthy 状态表示当前服务健康。

本次 Electron 临时验证进程已停止，本次下载缓存 116.4 MiB 已清理；Docker 内部文件未直接修改。早期浏览器因 API 无法连接而加载失败；官方完整更新恢复服务后已通过 E01。用户再次要求清理时 daemon 已恢复，无需本轮重启；缓存再次清空，最终空间和健康状态见 D00。

## 最终一致性评审

| 验收项 | 状态与边界 |
| --- | --- |
| AC01 | 浏览器行情三口径、已有回测结果和冻结假设披露通过；Electron 窗口交互按用户决定跳过。 |
| AC02 | 当前本地内容寻址镜像、官方完整更新、结构门禁、健康和业务读取通过；远程发布未执行。 |
| AC03 | 当前镜像状态副本恢复及 4 条冻结重放通过；原旧候选不满足当前目录状态回退条件，未冒称旧版本回退成功。 |
| AC04 | 未通过；真实历史版本/决策可见性输入缺失，原 S05 保持开放。 |
| AC05 | 未通过；事件语义、可靠因子、单位/时钟及修订演练前置未齐，原 M31/M32/R02 门禁保持开放。 |
| AC06 | 完成范围、真实来源阻塞、已跳过来源和旧候选边界已对账；本轮未提交或远程发布。 |

下列后续项继续留在当前 Task，不转入 TODO、不以本地验证代替真实门禁：

- [ ] 严格历史 PIT：取得实际历史版本与独立决策日历/可见性证据后，拆出 S05 历史窗口和冻结重验叶。
- [ ] HiThink ETF 分红：取得数字进度定义、完整身份/币种及覆盖证据后，执行 M31-b2-target 正反例。
- [ ] 可靠因子：取得因子、锚点及同一 raw 响应绑定后，接入 M32-b2 真实 Reader 和目标冻结重验。
- [ ] 专业 Quote：独立核实 ETF 单位/时钟及真实修订演练前置，完成 R02-quote-target；来源持续可用性单独报告。
- [ ] 发布前镜像与旧状态回退：当前本地镜像/状态包及同批恢复已由 P04 完成；异地长期存储、旧版本对应的完整状态和合格旧候选仍未齐备，原 F01 保持开放。

## 继续实施：组件回退相容性

- [x] P03：分别验证旧 Server/Worker 与旧 DSA 的回退边界。
  - 支持 AC03 与原 F01；依赖 P02 现有镜像及当前状态一致性备份入口。
  - 执行面：隔离网络与全新 PostgreSQL、DSA、快照卷；目标容器和源数据只读。
  - 写集：现有一次性隔离入口与本 Task；不构建新镜像，不替换目标容器。
  - 候选：“旧 Server/Worker + 当前 DSA”、“当前 Server/Worker + 旧 DSA”；不重复已通过的全当前组合或已拒绝的全旧组合。
  - 完成条件：两候选各有明确结果；健康、V3 鉴权、完整目录、策略、账户及四条冻结重放按序校验，首次失败停止该候选；源状态与卷集合不变、临时资源清理完成。
  - 结果：旧 Server/Worker + 当前 DSA 的健康、V3 协议/鉴权、完整目录、策略、账户及四条 Run 读取均通过，但实际冻结重放拒绝“冻结结果校验值不一致”。首次执行未暴露具体失败阶段，增加分阶段及重放诊断后仅复核该候选一次，确认上述边界，未改变候选镜像。
  - 当前 Server/Worker + 旧 DSA 的目录 revision 从 `4071195993804590` 变成 `4380298194303938`，entries 的 state、RouteKey 和目标字段也改变，停止后续业务门禁。两个组件候选均不取得当前状态回退资格。
  - 日志：`/private/tmp/thesis-ledger-component-restore-20261003.log`、`/private/tmp/thesis-ledger-component-server-diagnostic-20261003.log`。两次演练源业务、目录及策略身份不变，临时资源残留为 0。

- [x] P04：形成可校验、可导入且已演练的本地恢复包。
  - 支持 AC02/AC03 与原 F01 制品子门禁；依赖 P01/P02 当前镜像。
  - 写集：`.gitignore` 的恢复产物忽略规则、本轮临时隔离入口及本 Task；产物只写 `.recovery-artifacts/`，不修改应用运行配置。
  - 执行面：只读源状态备份、镜像导出/导入、独立副本；不重建应用镜像。
  - 完成条件：权限、忽略规则、文件摘要与镜像身份核对通过；镜像包导入后同批状态恢复、四条冻结重放及源状态保护通过，记录包位置和空间；旧版本回退资格仍单独判定。
  - 产物：本地目录 `.recovery-artifacts/2026-10-03-current/`，说明文件为该目录的 `README.md`；跟踪证据见 [本地恢复制品验收](evidence/2026-10-03-local-recovery-artifact.md)。核心五文件合计 1,000,099,735 字节（约 0.93 GiB）。包含 Server/Worker、DSA、PostgreSQL、Redis 四份镜像及同批双库、DSA 数据目录和冻结制品。
  - `manifest.json` SHA-256：`91ff12b5bb33e90407856b2e605f2b8329e85ae670bd1ab2e22e136e961414b3`。目录权限 0700，文件权限 0600，`git check-ignore` 通过；运行环境凭据没有单独导出，业务备份按敏感数据保管。包未上传远程服务。
  - 验证：镜像压缩包完整性及实际导入通过，镜像 ID 集合未变；从已经落盘并核对 SHA-256 的包文件恢复隔离环境，五服务健康、协议/鉴权、完整目录、策略、账户、Run 读取及四条实际冻结重放通过。日志 `/private/tmp/thesis-ledger-recovery-bundle-20261003.log`。
  - 包内 `node verify.mjs` 校验五文件大小、SHA-256、权限与已通过恢复摘要，结果 passed；可选 `--load-images` 只导入镜像，不启动容器或覆盖数据库。
  - `node verify.mjs --load-images` 的实际入口验证也为 passed；应用源码、运行配置和目标业务状态未修改。
  - 收尾：原 48 卷集合 SHA-256 仍为 `fde5bc98b182f01212bc8abac1dd2c8bac2b84c7e7f59af5777b4b81260867fb`，隔离资源残留 0，六个现有容器均 healthy；构建缓存仍为 0B，主机剩余约 25.39 GiB。
  - 历史状态核对：相邻 infra `.database-upgrades/` 有 10 次操作目录、10 份 PostgreSQL dump，覆盖 2026-09-27..10-01；文件清单只有数据库备份、结构输入与升级/演练记录，没有对应 DSA SQLite 或冻结制品备份。数据库单份历史备份不能拼成已证明同批的完整旧状态；未读取业务备份正文、未向现有卷恢复历史数据。

- [x] H03：HiThink 官方 MCP 元数据补充核验。
  - 支持 H02 的准确输入判断，不授予分红或 Quote 准入。
  - 执行面：从当前 DSA 环境读取既有 HiThink 凭据，仅对官方 `https://fuyao.aicubes.cn/mcp/fund` 执行 MCP 初始化、通知及 `tools/list`；不调用金融数据工具、不保存新凭据、不改变策略。
  - 2026-10-03T10:29:21.351064+00:00 返回完整 28 工具清单，无后续分页；`get_fund_market_snapshot` 和 `get_fund_corporate_actions_dividends` 均有 outputSchema。工具说明确认前者定位 ETF 快照，后者的 timestamp 是接口响应时间戳；本次抽取未取得 `progress="2"` 的官方释义或 ETF 量额单位证明，不能关闭真实门禁。
  - 选中两个工具的规范化元数据 SHA-256 为 `0eacaef05bf646de41d5066c44f06724ecdfa0c6c17f52fa92489febe96a8e8e`；日志 `/private/tmp/thesis-ledger-hithink-metadata-20261003.log`，入口 `/private/tmp/thesis-ledger-hithink-metadata-20261003.py`。未重复执行既有失败的分红、Quote 或权限请求。

## 提交与推送

用户于 2026-10-03 授权提交推送项目改动。范围为主仓 `main`、DSA `yzin` 和 infra `main` 的当前项目源码与文档；推送至各自 origin。恢复包、运行凭据、数据库备份和生成缓存继续由忽略规则排除，不进入提交。

提交前远程同步确认三个分支均为 0 ahead / 0 behind。本次复核敏感信息、边界、依赖、migration matrix、尺寸门禁和 infra 兼容及脚本测试；主仓完整 lint/build 与 complexity 门禁通过。全范围 lint 的内存问题及既有错误已完成等价修复，见 [已完成任务](../archive/tasks/2026-10-03-workspace-lint-process-isolation.md)。受影响包重新执行全包回归：Schemas 589 项、Desktop 543 项、Server 2074 项通过，Server 125 项跳过；DSA 沿用未发生后续源码修改的 7752 项通过、1 项跳过、4 项 deselected、626 项子测试结果。

本次新增 lint 执行入口及等价修复尚未重新部署，现有 Docker、浏览器与恢复包证据对应各自已记录的运行版本。外部数据与回退资格等未完成门禁保持原状态。提交及远程分支结果以三个仓库的 Git 记录为准。
