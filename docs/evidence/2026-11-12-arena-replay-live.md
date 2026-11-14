# 自主比赛历史回放与实时衔接验收

## 当前结论

执行时钟、持久化回放推进、研究时点隔离、暂停恢复和两端进度消费已实施。受控资料上的隔离数据库链路通过，真实历史资料准入仍未完成，不能声称真实比赛已回放到当前。

用户已明确选择：保留现有 `test` 比赛，另建相同配置的历史回放比赛。已创建 `test · 历史回放`，新比赛 ID 为 `6f41c462-176a-4d6f-957e-331015e2af0f`，起点为 2026-11-02 00:00（Asia/Shanghai）。实际状态为历史回放待恢复，原因是历史全市场标的目录尚未就绪；只有初始本金记录，研究周期为零。原比赛保留暂停状态，账户、剩余额度、协议和研究记录哈希对账一致。[冻结创建回执](2026-11-12-arena-replay-create-receipt.json)。

## 实现范围

- `ArenaLiveTimeline` 独立表保存回放／实时阶段、已完成游标、研究时点、状态和稳定原因；已有比赛不回填或重写。原始 `startedAt` 继续记录真实启动，开始日期按市场本地午夜生成回放原点和初始本金记录。
- 历史步内的委托处理、共同估值、预约触发与游标变更在比赛行锁事务内原子提交；重复调度和同一时点估值不重复写入。所有模型的在途研究结束后才推进。
- 历史输入冻结 `asOf`，队列领取沿用该业务时刻；租约、超时和请求审计使用真实时间。历史提交后，只能在随后到达的新观察成交。未知耗用、预算耗尽及研究异常保持原恢复边界。
- 追平后原子进入实时阶段，账户、现金、持仓、预约、委托、费用和请求额度均沿用；实时行情、当前预约扫描和当前估值入口不介入回放阶段。
- Market 历史观察器只读取已发布冻结证据，核对完成状态、资料可见时点、历史执行规则、状态、限价、费用、结算和公司行动覆盖。历史工具拒绝当前目录、当前报价、当前新闻和普通网页搜索。
- Desktop/Mobile 显示阶段、推进时点和具体阻塞原因，提供显式“重试回放”。Desktop 回放图跟随历史进度；决策列表按研究业务时点显示。

## 尚未通过的真实来源门禁

当前正式接口提供的是交互分钟图表；`MarketChartReaderV3.read` 明确拒绝 `asOf` 和历史可见性验收。冻结窗口读取及已发布研究证据当前只覆盖日线，不能认证历史分钟执行。全市场当前目录也没有完整历史候选集合与可见时点证明。

因此全市场回放返回 `replay_universe_unavailable`；固定池缺少已发布分钟证据时返回 `replay_prices_unavailable`。首次失败后状态固定为阻塞，不自动重复读取来源或调用模型。历史 K 线／指标、新闻、搜索和全市场目录的真实历史适配仍由活动任务 T2 持有，不能以受控测试替代。

## 定向与隔离检查

- `node scripts/test-ai-provider-postgres.mjs test/model-arena/live-replay-postgres.integration.test.ts test/model-arena/live-storage-postgres.integration.test.ts test/model-arena/live-orders-postgres.integration.test.ts test/model-arena/live-appointments-postgres.integration.test.ts`：首次 18 项通过；回放新增暂停研究覆盖后单独 5 项通过。覆盖市场午夜／夏令时、首次本金、业务时钟／真实租约、历史研究、后续观察成交、并发去重、沿用账户切换实时、来源失败不重读、owner 隔离、暂停恢复、未知结果和未来资料拒绝。
- `node scripts/test-ai-provider-postgres.mjs test/model-arena/live-replay-postgres.integration.test.ts test/model-arena/live-http-postgres.integration.test.ts test/model-arena/live-research-postgres.integration.test.ts test/model-arena/live-valuations-postgres.integration.test.ts`：当轮 24 项通过，含原研究／HTTP／估值回归。
- `pnpm --dir apps/server test test/market/arena-replay-reader.test.ts test/model-arena/live-research-tools.test.ts test/model-arena/live-call-limits.test.ts test/platform/api-rate-limit-policy.test.ts`：最终 58 项通过。中途接口登记门禁发现并行策略采纳只读状态接口缺少登记，按实际只读行为补齐一行，最终全接口登记通过。
- 隔离容器全部由现有仓库维护入口建立和清理，使用专属 `ai_provider_concurrency_fixture` 或 `journal_review_fixture`，未操作真实业务表。全部 52 份 migration SQL 执行并核对结构 head。
- `ARENA_WITH_REDIS=1 node scripts/test-journal-review-postgres.mjs test/model-arena/live-runtime.integration.test.ts`：最终实时／历史两项均通过，使用实际 SDK、本机模型 HTTP、独立 Redis 和随机队列范围。历史工具收到冻结 `asOf`，两模型研究、统一下单、随后观察成交、成交事件唤醒和队列断线保留均通过。此前未带 Redis 开关的一次调用跳过了队列测试，不计入通过证据；已显式带开关重验。

## 构建与门禁

- `pnpm --filter @thesis-ledger/server... build`、`pnpm --dir apps/desktop build`、Server 与 Mobile `typecheck` 通过；Desktop build 继续有大 chunk 提示。
- 修改范围定向 ESLint 退出 0；Mobile 的既有 React Native import resolver 输出解析日志，未扩大为全仓无警告结论。
- `check-boundaries.mjs`、`check-file-size-guardrails.mjs`、`check-migration-matrix.mjs`、`check-runtime-database-input.mjs` 通过。文件尺寸检查提示 5 个既有大文件且没有有效基线，不据此声称这些存量文件的 ratchet 已全面验收。
- runtime 打包检查首次在 Context Mode 缺少 pnpm PATH 时未执行成功；补齐宿主 PATH 后通过，包含 52 份 migration SQL 和打包执行器。

## 两端浏览器

`PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright node scripts/local-runtime/arena-replay-browser.mjs` 在 Desktop/Mobile 的 1440、1024、768、390 全部通过，覆盖回放阻塞、进度、原因、显式恢复和不溢出；每个组合只有一次受控重试请求，真实写入为零。Desktop 图表 API 只在受控宿主截获模块响应后注入，用于确认回放图停在历史时点。

`arena-live-browser.mjs` 四宽度原流程通过，覆盖图例、期间、净值、账户焦点、持仓、成交审计、创建、返回和选择器。人工查看 390 两端截图，截图目录 `/tmp/arena-replay-qa/`。

## 正式运行态

最终在 `thesis-ledger-infra` 执行 `BUILD_ALPINE_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/alpine DEV_DATABASE_MODE=upgrade DEV_DATABASE_CONFIRM=thesis-ledger-dev/thesis_ledger ./scripts/update.sh thesis-ledger`，退出 0。使用默认备份与恢复演练，不设置跳过备份或允许数据丢失开关。证据目录为 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra/.database-upgrades/run.QcWBzq`，`rehearsal.json` 确认恢复、结构完整、app role 权限和旧数据保留全部通过；备份 12557478 字节。

独立只读检查确认数据库／owner 均为 `thesis_ledger`，head 为 `20261112030000_arena_replay_timeline`，新表存在；Server／Worker 均健康，最近五分钟没有匹配到缺表或模块错误。两服务使用同一镜像 `sha256:6c08cbe3666e399ef084d29b951e7f46fbe00b7fd85b4544b2f6aefcf628d885`，Server 的回放运行时、详情查询、队列运行时和 Market 历史读取器四个编译文件与宿主 SHA256 一致，健康接口 HTTP 200。

创建命令为 `node scripts/local-runtime/arena-replay-create.mjs --source a36c2d69-1731-41fe-8750-86f89a236762 --apply --output <本文件同目录的回执路径>`。当轮 5 次本地 GET、2 次 POST（新建、启动）；未调用真实模型或报价来源，没有修改原比赛。

目标完整开发应用使用 `ARENA_RUNTIME_MATCH_ID=6f41c462-176a-4d6f-957e-331015e2af0f ARENA_QA_OUTPUT=/tmp/arena-replay-target-qa` 运行 `arena-observation-runtime-browser.mjs`，1440／1024／768／390 均通过，共 10 次本地 GET、零写入，覆盖全部页签、历史空状态、图表、刷新与页面边界。人工核对桌面实际截图：推进时间和曲线起点为 11 月 2 日 00:00，实际启动为 11 月 12 日 23:36，阻塞原因直接可见。外壳账户接口继续使用受控空样本，竞技场数据来自真实目标。

首次构建的 Alpine 默认 CDN 在下载 gcc 时长时间无输出；只读构建历史确认运行约 17 分钟，宿主下载探测默认源 6 秒超时，清华和阿里源均正常返回相同大小的索引。通过正式更新会话发送 SIGINT，中止退出 130；未执行数据库升级。随后使用脚本已有参数 `BUILD_ALPINE_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/alpine` 重试同一正式命令，系统依赖约 14 秒安装完成，继续构建与保留数据升级。没有直接取消 Docker 构建或绕过更新入口。

最终审查发现回放详情中的可用资金／可卖日期仍读取当前会话；已改为消费持久化模拟时点和数据库冻结日历，资料阻塞后的详情轮询不再访问当前或历史来源。最终 HTTP／回放存储 7 项通过，含该零来源读取断言；Server 类型检查随后通过。

备用镜像源的第一次构建在 Domain 冷构建失败：预算、日期和本次时间线模块反向类型引用了尚未构建的 Schemas。正式脚本内部保留缓存重试一次后退出 1，尚未停止消费者或执行数据库升级。将三个模块所需纯类型收回 Domain，并将该反向引用固化到边界门禁；未新增依赖或循环。宿主 Server／workspace 重新构建、边界及 workspace 依赖图通过后，再次执行同一正式升级入口，复用已完成的镜像依赖缓存；最终镜像输入已包含详情冻结日历修正，无需额外快更。

并行通知修改还带来 `providers` 可选字段与 Zod 输出的 `undefined` 类型不一致，已在 `risk-notification.ts` 对应输入类型补齐，未改投递行为；Server 类型检查和相关 6 项通知测试通过。来源／工具与通知组合当轮 15 项通过。

## 最终一致性审查

执行状态、实际副作用、保留数据升级和两端消费的证据已对账。已有真实比赛、账本和冻结记录未改写；当前新比赛只有初始本金，不能认证为已经完成历史研究或追到当前。源码未提交或推送。

结论：受控执行面、正式部署和新比赛创建通过；完整功能验收仍因活动任务 T2 的真实历史目录、分钟证据及研究资料适配缺失而阻塞。保留活动任务，不归档、不转为已完成或 TODO。
