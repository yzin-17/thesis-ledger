# 当前回测 Run 的目标生命周期验收

对应 [Spec](../../specs/2026-09-09-backtest-bullmq-lifecycle.md) 与 [T4 归档任务](../../archive/tasks/2026-09-09-backtest-bullmq-lifecycle.md)。日期使用北京时间；原始运行记录的时间戳使用 UTC。本轮由用户授权完成全部 T4，保留并行修改，不提交或推送。

## 当前结论与部署进度

T4.1–T4.12、T4 父项及最终一致性 Review 已完成。正式目标更新与保留数据升级成功，同一当前镜像上的九组保护场景、真实浏览器/Electron 和独立生产启动通过。首次 Electron 保护检查遇到并行业务写入后，等待无其他在途任务再补验通过。任务已归档，当前 Spec 保留。

首次正式执行 `./scripts/update.sh thesis-ledger` 时，脚本清理可回收 BuildKit 缓存并重新测量：宿主机 14,205 MiB，要求至少 20,480 MiB；Docker 29,250 MiB，要求至少 18,432 MiB。宿主机空间门禁失败，脚本在拉取、构建和替换服务之前退出。用户随后授权继续清理缓存。

追加使用 `pnpm store prune` 清理未使用包及元数据，清理 uv、闲置 Playwright 下载、未打开的浏览器缓存、编辑器代码及扩展安装包缓存、旧运行时下载包，并使用 `swift package clean` 清理未运行的 codex-monitor 构建中间产物。清理后宿主机实测 23,159 MiB，后续包级验证后有 22,065 MiB。

最终全量复核后系统 Swap 使用约 17 GiB，宿主机可用空间又降至 19,716 MiB，正式入口再次在构建前停止。继续清理未打开且已经解压的升级下载 zip 和无活动编译器使用的 Cargo 源码缓存，保留解压后的待安装应用、主运行时和正在使用的缓存文件。宿主机实测 20,490 MiB 后，正式入口通过空间门禁并开始构建。阈值及正式更新入口保持原要求，未删除 Swap、Docker 数据文件或共享数据卷。

## 目标与故障入口

目标为 `thesis-ledger-dev`，数据库及 owner 均为 `thesis_ledger`，应用角色为 `thesis_ledger_app`。首轮目标镜像内的结构为 32 项 migration、80 张表、64 个 Prisma model、16 张 raw-owned 表，head 为 `20261005143000_authoring_analysis_application`。首轮 Server 与 Worker 共用镜像：

`sha256:99eceddcd672da579570c6c43c32757844e14315141d018a42b005620f4da6c4`

验收期间主仓并行增加了 `20261006030000_strategy_authoring_save`，结构成为 33 项 migration、80 张表。最终更新已应用该 head；隔离生产脚本始终从实际镜像读取结构输入，避免将宿主机的新 migration 与旧镜像启动要求混用。

## 正式更新与当前镜像复核

执行 `DEV_DATABASE_MODE=upgrade DEV_DATABASE_CONFIRM=thesis-ledger-dev/thesis_ledger ./scripts/update.sh thesis-ledger` 成功，日志为 `/private/tmp/t4-target-update-final.log`。首次依赖下载失败后，官方入口按有界重试继续，最终成功；没有降低磁盘阈值或绕过入口。Server/Worker 共用当前镜像：

`sha256:3983bdfcb2ac2d0ddb1d81b756337326b328dc1d8afe0c97f8cd37f7676729b2`

保留数据升级由正式入口停止消费者、备份、隔离副本演练及事务升级完成。infra `.database-upgrades/run.4KwijU/` 的 `rehearsal.json` 确认结构完整、app role 权限和数据保留；`image-input.json` 记录 33 项 migration 与新 head，`execute.log` 记录事务成功。备份 `backup.dump` 为 18,816,400 字节，SHA-256 为 `a517dcc8b28ea49bc0ec582c04b66cce15eb11160d270ae0a529bc5a841bceb1`；计划指纹为 `2b8b011a9b386b374347d371636ab19abf29ccfd172eab0f67568977b5627293`。备份和恢复产物保持在忽略目录，没有开发清库或删除共享卷。

当前 Server/Worker 结构 head 为 `20261006030000_strategy_authoring_save`，80 张表与应用角色检查通过；五个服务健康，宿主机映射 `/api/v1/health` 返回 200。当前镜像内 126 个 Backtest 编译文件与宿主机对应产物逐文件摘要一致。并行工作随后新增的 AI 局部修改 Provider 探测不属于本次镜像或 T4 输入，不能把当前结论扩展为整个并行工作树已部署。

| 当前镜像场景 | Run ID | 终态及 durable owner | 关键断言 |
| --- | --- | --- | --- |
| 默认执行 | `c5b11e28-140e-48b1-87d5-ae1a351113e6` | succeeded / 1 | 心跳 TTL 42,991 ms；唯一结果和离线重放一致 |
| 领取后 SIGKILL | `870b3357-d26d-4f5a-9ec1-b96cd93533a8` | succeeded / 2 | 默认协调恢复，旧 owner 更新 0 行，唯一结果和重放一致 |
| 执行中 Redis 短停 | `f7ce5700-bff2-42cb-b9da-2764f094b730` | succeeded / 1 | 实际队列查询失败期间完整数据库行不变 |
| 投递前 Redis 短停 | `75f4161e-af43-4ac7-aa53-6d3e2e9894f6` | succeeded / 1 | 故障时持久化 queued，恢复后自动补投 |
| queued 取消 | `c6270d2f-4056-4008-a771-fc9a2b66267b` | cancelled / 0 | 重复取消幂等，不执行，无结果 |
| running 取消 | `c25eccd6-56eb-4275-999a-d304d26b275e` | cancelled / 1 | 重复取消幂等，无结果 |
| 取消后 SIGKILL | `702bd2be-7401-423e-a087-20ed4530e620` | cancelled / 1 | 恢复后不执行，无晚到成功覆盖 |
| 浏览器取消 | `b72c1d88-84e7-4eb3-bcac-6000f05b789b` | cancelled / 1 | 实际点击；正在取消、按钮禁用、已取消及无结果 |
| Electron 取消补验 | `e332f1fe-df36-4f4b-9575-f86dde811a82` | cancelled / 1 | 实际原生点击；取消请求已提交、正在取消、已取消及无结果 |

当前镜像的四个成功 checksum 依次为 `629b999b29e583f5`、`6de83185b03848ab`、`d40a6589e67267b0`、`79d48ad1235531d4`。上述九个场景的 `/private/tmp/tl-backtest-target-<scenario>-updated-20261006.json` 均成功，15 张受保护业务表摘要不变，快照恢复，原容器及镜像身份保持；Electron 最终文件名中的场景为 `electron-cancel-retry`。

当前镜像首次 Electron 点击 Run `015f89b4-0229-470b-a56e-0c2f4373f644` 已收敛 cancelled / owner 1、无结果，随后实际打开前述默认成功 Run，结果概览、图表及交易记录可读。该轮检查期间另一策略局部修改任务在 `2026-10-05T19:45:14Z` 开始，`StrategyAuthoringOperation` 摘要改变；脚本按保护约束返回失败并恢复健康。该记录只接受 UI 交互，不计作保护检查通过。

确认 Backtest、AI、策略局部修改和 Automation 均无在途任务后，按同一维护入口补验 Electron Run `e332f1fe-df36-4f4b-9575-f86dde811a82`。实际原生 UI 点击取消后依次显示“取消请求已提交”“正在取消”“已取消”，详情无可读取结果；2026-10-05T19:49:25Z 记录 15 张受保护表摘要不变、五服务健康及容器身份保持。补验退出码 0、`success=true`，截图保存于 `/private/tmp/t4-electron-cancelled-updated.jpeg`。

infra 新增维护入口：

- `scripts/backtest-target-runtime.mjs`：校验 Docker context、项目、数据库、owner、容器、镜像及自有 Run；占用正式更新锁，拒绝其他业务在途任务，记录受保护表摘要，恢复原容器和快照。
- `scripts/backtest-target-recovery.mjs`：串行运行正常执行、领取后 SIGKILL、Redis 执行中及投递前短停、queued/running 取消和取消后进程中断。
- `scripts/backtest-production-compose-smoke.mjs`：使用实际镜像、独立项目及四个专属卷，在空库应用镜像内完整结构和应用角色初始化，验证基础生产 Compose。
- `scripts/backtest-target-recovery.test.mjs`：校验自有任务、容器身份、专属卷/端口及实际 Compose 合同，共 3 项测试通过。

故障只操作本次脚本拥有的 Run。领取屏障置于该 Run 的快照读取处，保留原文件字节及 SHA，释放后恢复原内容；没有伪造数据库 running 状态。前七个场景保护 13 张业务表摘要，后两个 UI 场景加强为 15 张；每次都验证摘要不变，五个服务健康，原容器及镜像身份保持。没有清空共享 Redis 或删除共享数据卷。

## 首轮目标运行态证据

| 场景 | Run ID | 终态及 durable owner | 关键断言 |
| --- | --- | --- | --- |
| 默认执行 | `e51dcff4-528d-41ca-8b06-a766203a5d7f` | succeeded / 1 | 执行中健康心跳推进，TTL 41,617 ms；唯一结果、离线重放一致 |
| 领取后 SIGKILL | `1226da7e-705f-40bd-a332-22feeee1af89` | succeeded / 2 | 真实领取后硬杀；Server 自动恢复；旧 owner 条件提交为 0 行 |
| 执行中 Redis 短停 | `2dc3b78c-96b1-47ea-b7bd-1c2fe143cc19` | succeeded / 1 | 真实队列查询失败期间数据库完整行及 owner 保持，恢复后收敛 |
| 投递前 Redis 短停 | `53dc1280-5a64-4f7f-8636-fde9bbe9fb3c` | succeeded / 1 | queued 已持久化，错误为 `queue_temporarily_unavailable`；恢复后自动补投 |
| queued 取消 | `6a843485-e16a-4945-9503-68818aa551a3` | cancelled / 0 | 重复取消幂等，Worker 恢复后不执行，无结果 |
| running 取消 | `42b00dd2-a596-4a31-9ff1-e2a8f12e4a8f` | cancelled / 1 | 重复取消幂等，取消终态无结果 |
| 取消后 SIGKILL | `db7610d2-76fb-4a0e-b127-9c1e4c400e21` | cancelled / 1 | 进程恢复后不继续经济执行，无晚到成功覆盖 |
| 浏览器点击取消 | `5517613e-f45b-4763-9f83-14b9b5bdbf60` | cancelled / 1 | 真实按钮触发请求，状态由正在取消收敛为已取消 |
| Electron 点击取消 | `8f6e4fe8-6369-4dea-a3ea-5acb85c44ce8` | cancelled / 1 | 生产渲染器及代理真实消费，提示为取消请求已提交，终态无结果 |

四个成功场景的结果 checksum 依次为 `95e9854fa87c1405`、`c807079ac2b5bcf0`、`0e01160ccc348f18`、`2d6769fcfea06d10`；各自经镜像内 V3 runner 离线重放一致。重复投递并跨过协调周期后，终态完整行不变。原始记录为 `/private/tmp/tl-backtest-target-<scenario>-20261006.json`，九个文件均 `success=true`，文件权限为 0600。

实际默认 Worker 配置为并发 1、lockDuration/stalledInterval 30,000 ms、maxStalledCount 1、lockRenewTime 15,000 ms；健康心跳间隔 15 秒、TTL 45 秒。硬杀场景中 durable owner 从 1 增为 2，重建的 transport 本地 attempt 仍为 1；两者没有混用。没有为故障场景缩短默认定时器。运输记录删除/重建的独立受控场景沿用 [10 月 5 日隔离证据](2026-10-05-backtest-recovery-integration.md)，目标本轮验证实际自动恢复。

回测使用当前可运行的 common-price Tencent ETF 输入及冻结快照；这些证据只证明生命周期与重放一致，不扩大为 strict PIT 或其他 Provider 权限验收。

## 客户端及真实 Electron

API Client 保持原错误类型导出，并携带 `retryAfterMs`。Desktop HTTP 与 SSE 使用共享冷却；秒数和 HTTP 日期均可读取，等待及流读取可取消。SSE 保持一条共享连接，摘要直接更新任务和分组缓存，重连刷新事实源，非终态 30 秒兜底，终态停止轮询并刷新已打开的详情。手动刷新同时刷新分组列表。取消文案使用实际终态，running 的取消请求显示“正在取消”。

真实浏览器通过生产 Electron 静态服务及 API 代理验证：

- 注入 SSE 429，`Retry-After: 15`；两次请求间隔 15.021 秒，同源 GET 同时等待，没有提前重试。
- 客户端断网恢复后重新读取事实源。诊断期间集中刷新和并行 Electron 请求曾触发真实 429，`Retry-After: 22`，客户端冷却后恢复；该诊断记录与正常观察窗口分别计量。
- 清除注入并新建观察页面后，133,209 ms 正常观察窗口没有额外 API 请求、没有 429，持续收到 7 个心跳分片，仅一条 SSE 请求。
- 已取消详情跨越轮询窗口没有新增 API 请求，仍收到心跳。首轮页面加载生产构建资源 `index-Hzr-DtcZ.js`；正式更新后的浏览器加载 `index-B3A5DZMT.js`，实际 Electron 刷新后也验证当前取消及成功结果。

实际 Electron 使用 `main.cjs` 生产静态服务，没有 Vite 开发地址。生产代理首个 SSE 分片 261 ms 内到达，并持续收到 20 秒心跳；关闭测试下游后，对应上游 TCP socket 被释放。真实点击取消后收到 `running → running → cancelled` 摘要，全部不含 input/result；取消后的详情显示无可读取结果。正常成功详情的摘要、图表和交易记录可读取。截图：`/private/tmp/t4-electron-result.jpeg`、`/private/tmp/t4-browser-cancelling.png`、`/private/tmp/t4-browser-cancelled.png`。

## 基础生产 Compose

修复了基础配置的监听缺口：Server 在容器内监听 `0.0.0.0`，宿主机 API 端口默认绑定 `127.0.0.1`。此前容器内健康可以通过，但默认回环监听导致宿主机映射 API 不可访问。测试现在同时要求容器内健康与映射 API 返回 200。

专属项目 `thesis-ledger-t4-production-c363123a` 使用前述同源镜像，四个独立数据卷、独立空库 `t4_lifecycle`、专属 owner/app role、临时回环端口。镜像内 32 项 migration 全部执行，80 张表、正确 head、应用角色初始化通过；Server、Worker、PostgreSQL、Redis、DSA 五服务健康，宿主机 `/api/v1/health` 返回 200。全部专属容器和卷已清理，共享目标健康及身份保持，受保护摘要保持。原始日志：`/private/tmp/t4-production-compose.log`。

更新后用当前镜像复核专属项目 `thesis-ledger-t4-production-1e8a00dc`，镜像内全部 33 项 migration、80 张表、app role、五服务健康及宿主机映射 API 200 再次通过；2026-10-05T19:39:57Z 已清理专属项目和四个卷，共享目标健康及身份保持。日志为 `/private/tmp/t4-production-compose-updated.log`。

这证明基础生产配置可启动，共享开发目标也已由正式入口完成保留数据升级。外部镜像发布和真实生产数据库升级没有执行。

## 自动化与输入边界

| 检查 | 结果及输入边界 |
| --- | --- |
| API Client build / 全量测试 | 当前输入通过，12 文件 / 75 项 |
| Desktop production build / typecheck | 本轮输入通过，复核构建资源 `index-DCeG3nzW.js`；并行工作最终构建 `index-B3A5DZMT.js` 已实际用于更新后 UI 验收，首次 UI 使用 `index-Hzr-DtcZ.js` |
| Desktop 全量 `vitest run --maxWorkers=2` | 当前输入通过，98 文件 / 659 项 |
| Desktop 最终定向测试 | 通过，5 文件 / 41 项 |
| Server 全量 `vitest run --maxWorkers=2` | 当前 33 项 migration 输入通过，288 文件 / 2,370 项；另 47 文件 / 215 项环境测试跳过 |
| Server build / typecheck | 当前输入通过；本轮没有修改 Server 生命周期实现或 Schema |
| 当前结构定向测试 | 新增并行 migration 后，2 文件 / 23 项通过；head 已对齐 `20261006030000_strategy_authoring_save` |
| migration matrix | 当前 33 项 migration / 80 表通过 |
| workspace lint | 当前输入通过，9 组 / 1,681 文件 |
| complexity / boundaries / dependencies | 当前输入通过，复杂度 8 组 / 1,678 文件；既有债务仍保留警告 |
| 文件尺寸 ratchet | `GUARDRAIL_BASE_REF=HEAD` 通过，9 项存量警告，超限文件没有增长 |

并行策略权限改动加入后，全量复核曾出现 32 项失败：HTTP 合同夹具缺少守卫依赖，列表断言缺少共享策略 owner 条件；一项事件流测试在并行修改中完成适配，其余六个文件补齐共享夹具与查询断言后，七文件 / 84 项定向通过，全量通过。共享夹具模拟共享策略可访问，身份和私有访问需独立权限验收，不由这些准备/执行合同测试代替。

当前编译还暴露了新增局部修改代码的可选字段、原始查询结果类型及测试 execution 输入类型问题；分别补齐 `undefined` 的可选类型、SQL 返回行类型、执行配置解析，七项局部修改测试通过。手动构造的服务补齐类型导入，Desktop 传输兼容 `Request`、字符串和 `URL` 输入，身份 setter 移除冗余类型联合，新组件补齐 JSX 关闭标签，Tabs 回调校验字符串。上述适配保留已有运行语义，没有重写并行功能。

并行权限实现已经将 SSE 过滤收敛为顺序处理；本轮新增延迟权限查询回归，确认事件仍按 running、cancelled 顺序发送，连同当前读取及会话失效合同三项通过。构建前复核 Server、Desktop、Schemas 源码目录摘要均保持稳定；最新包级测试对应上述当前输入。

本轮最终本地全量测试对应构建前摘要稳定的输入；随后并行增加或修改的 AI 编写功能没有自动继承这些全量结果。T4 的 Backtest 编译输入在最后清理前再次逐文件比对，126 个文件与目标一致；宿主机映射健康仍为 200。

已执行的主要检查命令及日志：

- `pnpm --filter @thesis-ledger/server exec vitest run --maxWorkers=2`、`pnpm --filter @thesis-ledger/desktop exec vitest run --maxWorkers=2`、`pnpm --filter @thesis-ledger/api-client exec vitest run`；对应 `/private/tmp/t4-{server,desktop,api}-tests-current-final.log`。
- 各受影响包 `pnpm --filter <package> build` 和 `typecheck`；Server、Desktop 最终日志为 `/private/tmp/t4-{server,desktop}-{build,typecheck}-current-final.log`。API Client 与 Schemas build 单独执行。
- `node scripts/lint-workspace.mjs`、`node scripts/lint-workspace.mjs --guardrails`、`GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs`、`node scripts/check-boundaries.mjs`、`node scripts/check-workspace-dependencies.mjs`、`node scripts/check-migration-matrix.mjs` 及两仓 `git diff --check`。
- infra `node --test scripts/backtest-target-recovery.test.mjs` 与 `bash scripts/compose-contract.test.sh`；目标场景使用 `node scripts/backtest-target-recovery.mjs --confirm thesis-ledger-dev/thesis_ledger --scenario <scenario> --output <file>`，UI 取消增加 `BACKTEST_T4_UI_CANCEL=true`；独立生产使用 `node scripts/backtest-production-compose-smoke.mjs --confirm isolated-production-smoke`。

两个独立生产验收项目的容器及专属卷均为零残留；仅终止本轮启动的 Electron 和前端 preview，原有客户端、其他项目进程及共享五服务保留。文档相对链接、归档清单、零未勾选项和两仓 diff 检查通过，主任务及隔离叶的原路径只保留归档链接。

大输出保存在 `/private/tmp/t4-*.log`，不把成功日志持续加入上下文。跳过的环境测试没有计为执行通过，目标故障、浏览器及 Electron 另有上述实际运行证据。正式更新、仓库门禁和更新后验收分别记账，未经验证的新输入不自动继承旧结果。
