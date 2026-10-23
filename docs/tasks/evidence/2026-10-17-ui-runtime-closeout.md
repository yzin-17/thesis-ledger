# Docker 恢复、风险审计与策略启动验收

本记录支持[全站 UI 当前任务](../2026-09-08-ui-interaction-consistency.md)的风险审计修复。2026-10-17，主仓 `main@da002744` 的未提交工作树；实际 Web `127.0.0.1:5174`、Server `127.0.0.1:3000`。本轮不执行路由故障切换，AI 真实生成保持停止。

## 环境恢复

上次同步在宿主机打包时遇到 ENOSPC，尚未进入应用部署；随后 Docker 引擎不可用。本次检查宿主已有约 18 GiB 可用空间，原五个容器和七个挂载记录均存在，但容器全部停止。

在 `thesis-ledger-infra/` 依次执行现有维护入口：

```sh
bash scripts/docker-desktop.sh start
AI_RESEARCH_EXECUTION_ENABLED=false DEV_DATABASE_MODE=check ./scripts/update.sh all
```

两项均退出 0。停机状态按规则使用完整更新，数据库保持结构检查模式；没有执行重建、清库或卷初始化。Server 的实际环境为 `AI_RESEARCH_EXECUTION_ENABLED=false`，不改写 Provider、默认用途或凭据。

五个服务全部 running/healthy。PostgreSQL、Redis、回测数据、DSA 数据和 DSA 两个匿名挂载均与恢复前一致；两个匿名卷仍为 `599903abb5be…`（`/app/logs`）、`32477b958690…`（`/app/reports`）。更新结束实测宿主余量 15,076 MiB、Docker 20,313 MiB，未将清理参考目标变成额外门禁。

| 输入 | 当前镜像或运行文件证明 |
| --- | --- |
| Server / Worker 镜像 | `sha256:01a95577d04eae13c33e284a8b1d9c441d340796be813a7365190bce9b0468a1` |
| DSA 镜像 | `sha256:ffba40664b7f59baab8c575ffef7f14c3a899ed49672156e692aac7c39385477` |
| `risk-rule.service.js` | 宿主编译结果与容器文件均为 `7229b5d6cd50e29243d20f5f18510701da47119ac8d265eb0069fd6c0d70c481` |
| `api/thesis_ledger.py` | 宿主源码与容器文件均为 `66a790ee59345407c15d424e8170ea6241c8fb297763c992bf4f0f271c63e6fd` |

本次是正式镜像更新，包含风险审计修复和此前仅通过代码同步部署的 DSA 缓存汇率修复；不等同于发布。

## 风险审计真实闭环

仅操作本轮自建规则 `928e3ff2-f23f-49a3-802f-7a3d33eb3220`。通过内部浏览器执行：

1. 从归档 v5 恢复为 v6，确认保持停用。
2. 将阈值 `0.318` 改为 `0.319`，未切换启用状态，真实保存为 v7。
3. 审计接口返回 `action=update`、`ruleVersion=7`；修改前后均为 `enabled=false`，阈值分别为 `0.318`、`0.319`。界面显示“修改 · v7”，成对快照可同时展开。
4. 历史 v2 的旧 `disable` 审计保持原样；没有改写历史记录。
5. 再次可恢复归档为 v8，最终停用，活跃规则 0、实际风险事件 0、通知 0。

本轮关闭“只改阈值被误记为启停”的目标运行态缺口。真实启用/停用的分类由四组合定向回归支持；本次没有为补截图启用全局规则，也不将该样本扩展为全部风险/收益交互通过。

## 验证与数据保护

此前 Server 风险定向 34 项、全量 `2896 passed / 217 skipped` 及构建通过；Desktop 全量 860 项、后续风险 UI 25 项与构建通过。中断后核对相关源码没有更新，复用这些有效输入，不重复全量测试。

恢复后保护检查退出 0：七张原始业务表完全一致，54 份成功 V3 回测结果校验和不变，活动回测 0；原 Provider/default、AiRun/AiInvocation 均未变。自建规则的新增版本独立保留；原用户数据未被覆盖。

本地日志和截图位于 `.recovery-artifacts/portfolio-pnl-2026-10-17/`：`docker-recovery-start.log`、`docker-recovery-update-all.log`、`risk-audit-runtime-update.png`。实际源文件/镜像核对及 API 断言支持上述结论；服务 healthy 本身不代替业务验收。

## 策略启动与后台反馈

[策略实验承接验收](../2026-09-09-strategy-risk-ai-optimization.md#strategy-parity-acceptance)的原 AC-13 已补齐。只使用已登记自建策略 `01f51301-5bff-4061-8e90-8435127959ce` 的 v2 `05653623-5378-4e52-a7b1-9e7c6f381c57`，没有修改原有策略。

- 真实窗口为 `600519.SH`、2025-06-23～07-04、初始 CNY 1,000,000、前复权固定供应商快照。显式连续归一化经济模型沿用已有成功研究的费用和时序假设，重新标明用户配置；不将其作为历史真实整手、价位或费用事实。
- 准备和预检通过，真实 Run `3f3691ae-a025-40a9-8cc6-4ad1ee96ca81` 于 UTC `13:21:11.723` 创建、`13:21:13.505` 完成。结果 schema 为 `3`，校验和 `ff5b3e5ac1c2bff2`，快照 `4ce583982a9619974a7a9a7dfe5693bbf9f2a6e5ebeb4d87c05aa03ec960b01f`。执行、信号、基准均冻结为 `hithink/hithink-financial-api`、主源、政策 revision 154。
- 浏览器自动进入真实结果详情，显示 v2、区间、10 个权益点、4 笔平仓/8 笔成交，终态无进度条。真实运行时 Console warning/error 为 0。
- 同时发现 `StrategyDashboard.startBacktest` 关闭弹窗后仍停留原页，直到后台创建成功才跳转。修复为同步校验和后台提交被接受后立即进入 `/strategy/jobs`，随后保留原创建成功跳转详情的回调；校验拒绝不跳转。
- 用内部浏览器仅截停本次创建请求：响应未返回时已关闭弹窗并切到回测任务。再本地返回 HTTP 503，界面显示“回测排队失败 ThesisLedger API 503”；没有发送该 POST 到 Server，没有创建第二个 Run。临时拦截随后清除。此失败样本与上面的真实成功分别计证。
- 进一步修复创建请求报错后未重读任务的问题：响应丢失不代表服务端未创建，不能只显示错误而留下旧列表。新增“创建响应丢失后仍重新读取”的断言修复前失败（只刷新一次，预期两次），在 `strategy.actions.ts` 的失败分支复用现有 `refreshStrategyData` 后通过。最终浏览器受控 503 后捕获真实 GET `/backtests/strategies` 和 `/backtests/runs`，错误提示与原成功任务仍可见，未重复提交或新增 Run。
- 旧 V1 queue/run 双请求由当前 V3 创建与 Worker 生命周期承接；已持久化任务的恢复复用 Scheduler 的真实进程证据，不操作原有失败任务。不恢复已退役的 trailing/ATR/risk sizing。

首次浏览器复验发现 Vite 提供缓存旧模块；重启本轮自建 Vite 后，核对实际服务模块已含修复，再执行暂停请求验收。没有把磁盘源码改动直接当成运行成功。

验证：最终受影响四文件 **30 项**，Desktop **145 文件 / 860 项**、类型检查与生产构建、修改文件 ESLint、`check-boundaries.mjs` 通过；文件尺寸门禁退出 0，提示九处既存大文件且未提供基线，不能声称该次已验证这些文件的 ratchet。改动文件未超过阈值。最终 `./scripts/sync-code.sh thesis-ledger` 退出 0，目标服务健康；本次跳转/失败刷新增量位于容器可写层，未重新构建镜像或安装包。

回执和截图位于 `.recovery-artifacts/strategy-parity-2026-10-16/`：`cn-run-terminal-2026-10-17.json`、`cn-run-success-2026-10-17.png`、`cn-submit-pending-jobs-2026-10-17.png`、`queue-failure-refresh-{network.json,2026-10-17.png}`、`queue-response-lost-{before,after}.log` 和 `navigation-final-{tests,build,sync}.log`。最终七张原表摘要和原 54 份成功结果校验和不变；总 Run 71，活动 0。只精确排除新增的自有 Run，不扩大原数据保护豁免。

## 共同消费门禁的未通过边界

本节记录本日较早的失败输入，保留作追溯；Risk 正向消费与股票正式校准已由下一节补齐，不再按这份早期响应重复执行空账户预览。

为核对 Risk，临时恢复上述收益验收自有空账户 `c12e0c98-3319-451f-aad6-d3fd9e9df8a0`，仅调用 `/api/v1/strategy-optimization/risk-applications/preview`，随后恢复停用。返回 HTTP 201 和三条映射规则，但全部为 `unavailable`（缺少实际持仓数量），行情 `occurredAt/availableAt` 为空。源码 `StrategyRiskContextService.directExchangeValues` 经过 `MarketBarReader.readV3`，该结果没有提供已选中完整行情的正向证据；没有建立持仓或改路由来强行通过。

政策只读核对仍为 revision 154、`applied`、`effectiveStale=false`，CN STOCK 原始日线路由仍含既有 HiThink/Tencent。政策和目录 ready 不代表本次年度窗口已通过；不把上述响应推断为收费、网络故障或全部来源不可用。回执为 `risk-consumer-preview-2026-10-17.json`。未创建风险应用、启用规则、持久化风险事件或发送通知。完整 Risk 正向消费及 Performance/Portfolio 正式校准、Automation 行情组合仍由[共同消费门禁](../2026-10-09-unified-data-capability-adapter.md#market-consumer-acceptance)保留。

## 股票正式校准与 Risk 正向消费

维护入口 `scripts/portfolio-calibration-acceptance.mjs` 默认只读，`--run` 校验 Compose 项目/服务、健康状态、AI 停止开关、实际数据库及自有账户身份后执行。内部校准允许精确账户过滤，默认定时任务行为不变；没有新增公开快照写接口。专用账户 `8cbb048e-9c15-480d-be49-6865679d76c7`、策略 `db87c738-561f-4296-bdea-5e53b275e79c` 全程留有 manifest；标的由现有目录正常确认身份，验收记账不是证券委托或银行转账。最终通过正常清仓、现金归零和可恢复停用收尾，没有永久删除数据。

Risk 修复三处问题：最近收盘价格不再固定过取 366 天；实时预览按本次读取完成时检查来源可得性，显式历史时点评价仍严格拒绝未来数据；预览将持有周期需求传入真实上下文。`600000.SH` 的 2026-10-16 单日、2026-10-15～16 完整开仓窗口均由生产 `MarketBarReader.readV3` 选中 HiThink / `hithink-financial-api`，不复权、完整覆盖、policy 154。实际持仓 100、成本价 10、收盘 9.73；HTTP 201 返回止损与止盈值 -0.027、持有周期 1，三条均为 `not_triggered`，时点非空。未创建应用或启用规则、未写风险事件及通知；不将本例扩展为自动扫描、历史评价或全部市场通过。

正式快照修复重新读取当前经济输入及固定正式幂等键的问题。原估算冻结数量、成本、原币现金、范围和披露覆盖；证据版本包括稳定的实际价格与 FX 证据，不含请求 ID/本次抓取时间。缺失旧冻结输入拒绝校准。原估算 `a51bd98a-5b1a-41eb-87a8-1977b70f0b12` 之后清仓并停用账户，生产服务校准仍使用原 100 股、成本 1,000、现金 9,000，生成正式修订 2：`ea92eafd-b368-4b52-96c4-c85e8b6719df`，证券 973、总资产 9,973。重复同一证据复用正式 ID，原估算逐字段不变；目标公开只读 API 默认列表 HTTP 200 仅返回正式版，原估算详情 HTTP 200 保留两版修订链。隔离 PostgreSQL 另验证更正证据追加修订 3、八路竞争及默认读模型。

验证：快照定向八项、隔离 PostgreSQL 九项（33 份 migration），Server 包级 369 文件 / 2,908 项通过、47 文件 / 218 项按原条件跳过；其后的实时预览与持有周期增量由 Risk/策略优化 31 文件 / 159 项通过、11 文件 / 33 项按数据库条件跳过，Server 构建通过。维护入口身份保护两项通过，重复执行已完成 manifest 复用回执，不再新增验收账本。

基金 `161725.OF` 的净值和历史两个接口仍 HTTP 503 `control-rejected`，当前未配置/未启用所需能力；不据此声称已请求上游、收费或网络失败，不自动改路由。`600519.SH` 缺独立上市事实、旧年度窗口缺完整日历的条件也不靠缩窗冒充通过。股票本例已经完成；基金正式校准、全部目标点位与日历边界仍在 Portfolio R3，Automation 的独立行情组合也未据此关闭。

原始回执：`.recovery-artifacts/risk-calibration-2026-10-17/manifest.json`，包含逐条账本命令、Risk 请求及选中窗口、两版快照与停用状态。七张原保护表摘要和 54 份成功回测校验值一致，活动回测 0；AI Provider/default、运行及调用账本不变。仅精确排除登记的新账户、策略、版本及两份快照。

## UI 加载完成态与历史快照日期补验

九入口在 `1440×900`、`1024×768`、`390×844` 和浅深主题共 54 组加载完成态通过：每页一个主标题，无骨架/忙状态残留，无整页横向溢出。另遍历账户三页签、Risk 五页签、策略三页签、复盘三页签、数据与自动化三页签、市场数据三页签，共 20 组实际选中及读取。最初的快速首屏包含加载过程，最终以 `ui-coverage/ready-root-matrix.json` 和 `ready-*.png` 为稳定态证据，不把骨架截图计作加载成功。

修复投资组合 `StatePanel` 额外渲染主标题的问题：改用已安装 `Empty` 组合，空态标题为第二级，删除无调用的四组旧样式；单主标题断言修复前失败、相关十项通过。次级页签又发现历史复盘列表/详情直接显示 ISO：统一使用现有 `formatDateTime`，当前及旧兼容快照均覆盖，原始 JSON 保持原值。三项交互测试通过；真实旧快照只读打开，在双主题三视口六组均无可见 ISO、无横向溢出，原始输入保持折叠，没有重新分析、保存或调用 AI。

Desktop 包级 145 文件 / 860 项已通过；上述日期增量三项和最终构建通过。14 个本轮源码/测试文件 ESLint、模块边界和 `git diff --check` 通过；尺寸门禁本次显式使用 `GUARDRAIL_BASE_REF=HEAD`，ratchet 通过，九处既存大文件均未增长。宿主 Vite 曾继续提供旧缓存模块，已重启本轮自建服务并重载，实际标签变为 `2026/10/14 05:07:17` 后再留证。最终应用通过 infra `sync-code.sh thesis-ledger` 同步；快更只代表容器可写层，不代表镜像或安装包重建。

截图和矩阵位于 `.recovery-artifacts/portfolio-pnl-2026-10-17/ui-coverage/`：`ready-root-matrix.json`、`tab-checks.json`、`journal-history-checks.json` 与对应 PNG。保留完整 T1–T6/T8：本轮覆盖不代替全部浮层的保存失败/成功后读取失败、模式切换草稿保护、真实 AI 结果与通知发送组合。先复用本文件及原证据中的已过项，不重复入口遍历或重新生成 AI 来凑齐状态。

## 浮层异常与写入恢复接续

本次仅在独立 IAB 页签控制请求响应，写入请求在浏览器拦截，未创建账户、自动化或复盘快照。读取既有对象与确定性复盘分析使用真实接口；没有真实 AI 生成、自动化运行或通知发送。以下回执位于 `.recovery-artifacts/ui-overlays-2026-10-17/`，测试失败态与修复后态分别保留。

| 范围 | 实际问题及修复 | 已过验收 |
| --- | --- | --- |
| 账户浮层 | 提交中仍可打开放弃确认；写入成功后未等读取就关闭；读取失败缺少恢复入口；旧失败常驻提示会残留到成功重试。提交时锁定关闭/输入，成功后等待账户读取，失败时保留明确的 GET 恢复入口；下一次提交只关闭同一操作的旧错误提示。账户区域提取为 `PortfolioAccountManagement.tsx`，原大文件按持仓职责保留，未提高尺寸阈值。 | POST 暂停时关闭无效、仅一次写入；503 保留输入并显示网络原因；201 后两个账户 GET 仍暂停时保持提交态；GET 503 明确“已保存，无需再创建”；重试仅两个 GET，旧错误提示不残留。1440/1024/390 深色视口无溢出。最终截图为 `account-toast-recovery-final.png` 与 `account-recovery-final-*-dark.png`，请求见 `account-recovery-requests-final.json`。 |
| 自动化编辑 | 原 mutation 已等待读取；原通用“数据可能陈旧”不足以解释写入成功后的失败。新增任务列表持久提示与“重新读取任务”，明确不重复保存、不运行任务。 | 模拟创建 503 保留名称/启用值；201 后 GET 503 显示恢复提示；浮层关闭动画结束后点击恢复，仅 GET 200、提示消失。见 `automation-saved-read-failed-fixed.png`、`automation-read-recovered.png`、`automation-recovery-requests.json`。 |
| 复盘工作区 | 已保存快照后对象 GET 失败走早退分支，遮蔽成功提示和分析结果。已有缓存对象时保留结果与成功状态，显示局部重读错误，恢复前禁用分析、保存及 AI。 | 首次对象 GET 503 可重试；非法草稿 `abc` 保留，更正 4.25 后本地应用；保存 503 保留结果；受控保存 201 后对象/历史 GET 503 仍显示成功和结果，GET 200 恢复，不重复分析/保存。双主题三视口通过，见 `journal-saved-read-failed-fixed.png`、`journal-recovery-layouts.json`、`journal-recovery-requests.json`。 |

复盘实际入口为 `JournalReviewWorkspace`。旧 `AdvancedJsonSheet`、`EvidenceEditorSheet`、`JournalReviewResults` 等没有当前入口调用，不能把静态文件数当作已访问入口数，也不为验收恢复旧功能。本轮未重复已过的历史日期、触屏或草稿保护组合。

## 实际点位补验与空序列质量

目标原先没有 `AccountValuationPoint`。复用前节登记的自有账户 `8cbb048e-9c15-480d-be49-6865679d76c7`，先核对零现金、零持仓和原账户点位哈希，通过 `scripts/portfolio-point-acceptance.mjs --prepare/--sample/--retire` 与 `portfolio-calibration-runtime.cjs` 的精确账户维护入口补验。本轮是保留实际模式、启用投资账户过滤的显式维护采样，未启用自动盘中的 `marketGate`；原自动采样市场门禁不变，符合 Spec AC10 对显式立即采样的区分。未增加公开接口、修改默认调度或批量采样原账户。验收现金 10,000、买入记账 100 股×10，只是专用账本事实，没有银行转账、证券委托或交易所成交。

生产采样路径产生两个当前点位：ID `1` / `2026-10-17T15:11:00Z`、ID `2` / `15:12:00Z`，均为 `ESTIMATED`，市值 973、现金 9,000、总资产 9,973，披露和可定价覆盖率均 1、质量 `COMPLETE`。真实报价为 `600000.SH` / 9.73 / `hithink` / `a-share-prices-snapshot`，第二次读取 `marketTime=15:12:33Z`、`fetchedAt=15:12:35Z`、`stale=false`、`freshness=live`、`servedFromCache=false`。这是周末当前观测，不能证明开市调度或新增历史成交。第一次采样已落库后因回执序列化 `BigInt` 失败，修复输出并核对原行，没有删除或覆盖已写点位。

公开只读 API 的 23 个支持组合全部 200：1D 分钟/小时；5D 分钟/小时/日；1M 小时/日/周；3M 小时/日/周/月；YTD 与 1Y 日/周/月；5Y 周/月/年；ALL 月/年。分钟为两个点，小时聚合为一个点，日及更粗粒度引用既有 10-16 正式修订 `ea92eafd-b368-4b52-96c4-c85e8b6719df`，金额均 9,973。长区间只显示现存一个正式日级点，不代表多年历史完整；两分钟点也不能替代收益率所需的两个完整快照。见 `series-read-matrix.json`。

IAB 实际选择该账户，键盘左右分别选中 23:11/23:12 两点，Tooltip 显示时间、9,973、估算/完整及两项覆盖 100%；正式日级点显示 10-16 16:00、正式/完整、9,973。双主题×三视口六组无整页横向溢出，Tooltip 均在视口内；见 `point-ui-checks.json`、`point-minute-keyboard-{first,second}.png`、`point-daily-official-tooltip.png`。15:15:19Z 正常卖出/取回验收现金并可恢复停用，最终现金和持仓为 0，两个点位与原估算/正式修订保留，非自有账户点位哈希未变；明细见 `point-manifest.json`。

上述矩阵发现模拟空日级序列错误返回 `COMPLETE`。`performance-series-quality.ts` 已将空集合改为 `UNAVAILABLE`，保持无点、`historyStart=null`，不补零或猜测历史；两个回归先失败后通过。最终 Docker 只读复核：模拟账户空日级、实际组合空分钟均 `UNAVAILABLE`，自有实际账户两个分钟点仍 `COMPLETE` / 9,973，见 `series-mode-read-after.json`。早期矩阵中的空质量保留为修复前证据。

## 本轮验证与仍开放条件

Desktop 全量 146 文件 / 864 项通过；Server 受影响 Performance 回归 8 文件通过、1 文件因隔离 PostgreSQL 条件跳过，57 项通过、9 项跳过；维护脚本保护测试 3 项通过。两个包最终构建通过，详见上述本地回执目录的 `desktop-tests-final.log`、`point-performance-regression-final.log`、`desktop-build-final.log`、`server-build-final.log`。17 个受影响 TS/TSX 文件 ESLint、静态 accessibility、模块边界及差异空白检查通过，尺寸门禁以 `GUARDRAIL_BASE_REF=HEAD` 通过，九处原有超限文件未增长。最终从 infra 执行 `./scripts/sync-code.sh thesis-ledger` 成功，见 `target-sync-final.log`；仅证明容器可写层与当前源码同步，不代表重建镜像或 Native 安装包。五个服务健康；原七表及 54 份成功 V3 结果一致，活动回测 0，原 Provider/default、AiRun/AiInvocation 未变。相对本轮工作树哈希基线，仅本次负责文件变化，DSA/infra 输入未变、三个仓库 HEAD 未变且暂存区为空。相对链接及锚点 71 项检查通过；跳过项不记为通过。

本节结束时基金 NAV/披露、基金正式校准与估算误差，以及其余原定日历/事实边界继续未完成。下节补齐交易/现金与基金客户端的异常恢复，不改变真实基金、AI 和路由边界；T1–T6/T8、快照 R3 与其引用这些条件的父步骤均不整体关闭。

## 交易现金与基金客户端浮层接续（10-18）

本轮跨 10-17/18，原始回执目录沿用开始日期：`.recovery-artifacts/ledger-cash-ui-2026-10-17/`。18 类操作分支分别是成交创建/更正/作废/恢复，现金入账/观察/划转，划转更正/作废/恢复，定期入账新建/修改/确认/跳过，基金客户端新建/修改/确认/跳过。它们是操作分支，不是 18 个不同组件或真实落库操作。

全部验收写入在独立 IAB 页签的请求阶段截留；成功、503、409 响应均为受控样本。正常读取复用真实 Docker API；需要已结束或已清理的分支时，使用既有验收事实的受控读取。现金/证券账户为原先登记的 `a3d195aa-ace2-48bb-8460-91c949666357` 与 `e9d5c7d7-13ce-453e-aa5c-f1e67affcacb`，仅浏览器账户目录将其显示为启用；数据库仍停用。基金账户 `00000000-0000-4000-8000-000000000071` 完全是浏览器样本，未创建于数据库。没有实际银行划转、证券委托、基金成交或原账本写入，也未请求真实 NAV、调用 AI 或变更来源路由。

| 范围 | 失败、等待及恢复的实际结果 | 证据 |
| --- | --- | --- |
| 成交创建/更正 | 503 后数量、价格及原因保留；更正实测数量 123，创建数量 10、价格 4.25。受控写入成功后仍等待估值/账本两个 GET；读取失败显示明确的无需重复提交与“重新读取账本”，恢复仅 GET。 | `execution-replace-503.png`、`ledger-saved-read-failed-fixed.png`、`controlled-request-receipts.json`。 |
| 成交作废/恢复 | 作废提交中原关闭入口会退出；503 又触发孤立 `FieldError`，导致整页 `FieldRootContext` 异常。将错误放回原因 `Field`，复用草稿关闭保护；提交中关闭无效，503 与合法 `LEDGER_REVISION_CONFLICT` 409 保留原因，取消后继续编辑也保留。恢复通过受控 VOID 审计分支验收，恢复写入成功与审计重读失败分开。 | `execution-pending-close-before.png`、`execution-pending-close-fixed.png`、`execution-void-503-fixed.png`、`execution-version-conflict.png`；崩溃回归先失败后通过，见 `execution-error-before.log` 与 `query-recovery-after.log`。 |
| 陈旧审计链 | 原先重读失败后仍可点击旧 VOID 的恢复入口，且原始/作废版本会显示“当前有效”。现在陈旧链禁用更正、作废、修改、移除和恢复；重读入口保持可用。CREATE 显示“原始录入”，VOID 仅显示“已作废”。最终生产构建 IAB 确认恢复按钮禁用，单一 GET 200 后告警消失、回到真实历史。 | `audit-stale-actions-fixed.png`、`audit-final-recovered.png`、`production-recovery-receipts.json`；新增挂载回归覆盖禁用与恢复，不仅检查静态文案。 |
| 现金入账/观察 | 入账金额 123.45、备注在 503 后保留，重试复用同一 `source.externalId`。观察余额 88.25 保留；其原写入后回调未等待 GET，新增刷新等待状态，关闭和重复提交均受保护。两者成功后读取失败仍明确已记录，恢复只读余额和流水两个 GET。最终构建再次以 123.45 观察验证页面刷新回调的真实组合，未将样本值写入原现金。 | `cash-deposit-503.png`、`cash-saved-read-failed-fixed.png`、`production-cash-read-failed.png`、`production-recovery-receipts.json`；查询挂载回归先失败后通过。 |
| 划转及更正/作废/恢复 | 当前金额 12.34、修正金额 11.12 与原因在失败后保留。双端版本预读失败或修正链不完整时不发写入；完整受控双端事实下验证写入 503 与成功后读取失败。恢复实际读取两端 events/audit 共四项，再截留恢复 POST；成功后当前估值/账本/审计三个读取失败可分别恢复。新增原因草稿及提交中关闭保护。 | `cash-transfer-503.png`、`transfer-correction-read-failed.png`、`transfer-ui-fixture.json` 与 `transfer-counterpart-ui-fixture.json` 保留真实只读来源；`controlled-request-receipts.json`。 |
| 定期入账计划/实例 | 新建/修改名称、金额 321.09，确认实际金额 99.87、时间及跳过原因在 503 后保留。新增草稿确认、提交中禁止关闭/重复提交、成功提示与“重新读取定期入账”；确认后的计划与余额两阶段刷新各两项，均独立注入失败。重读仅 GET；后续跳过使用另一个受控待确认实例，不改写真实已确认记录。 | `recurring-plan-saved-read-failed.png`、`recurring-confirm-saved-read-failed.png`、`skip-error-layouts.json`、`controlled-request-receipts.json`；关闭保护五项回归由失败转为通过，见 `close-guards-before.log`。 |
| 基金客户端 | 新建/修改、确认、跳过同样补齐草稿、提交保护、持久重读与成功提示，移除 API 错误技术前缀。确认份额 20、单位净值 1.25、费用 0.1 为固定输入；它们不证明 NAV 可用或基金真实消费。计划/实例的受控响应通过现行 Schema 校验，38 个记录内的 API 请求没有 NAV、AI 或路由请求。四类写入成功后读取失败均可仅 GET 恢复。 | `fund-ui-fixture.json`、`fund-controlled-receipts.json`、`fund-network-requests.json`、`fund-plan-saved-read-failed.png`、`fund-final-recovered.png`；客户端关闭三项回归先失败后通过，见 `fund-ui-before.log`。 |

定期入账跳过错误、基金计划错误分别在浅深主题 × `1440×900`、`1024×768`、`390×844` 检查六组，共 12 组。无整页横向溢出，确认/取消按钮在视口内；基金表单正文单独滚动，Footer 保持可达。见 `skip-error-layouts.json`、`fund-layouts.json` 与对应 PNG。主题已恢复深色，临时视口与请求截留已清除，验收页签已关闭。

代码改动仅在 Desktop 的账户数据消费面及对应测试：`AccountDataExecutionSheet`、`AccountDataAuditSheets`、现金观察/修正/读取区域、定期入账与基金定投区域。`AccountDataPage.refreshPortfolio` 返回刷新 Promise，原其他调用继续通过 void 回调消费，避免把异步函数直接传给 void 事件。复用既有 TanStack Query、`useDraftCloseGuard`、`Field`、`Alert` 与中文错误 helper，没有修改依赖、数据库、原生工程、来源资格或后台任务配置。其余现行持仓/策略浮层及市场配置的验收缺口继续按 Task 对账；禁用的导入/对账不因此恢复，也不把当前验收迁去 TODO。

最终 Desktop 全量 **147 文件 / 878 项通过**，构建通过，12 个受影响源码/测试文件 ESLint、静态 accessibility、模块边界和尺寸 ratchet 通过；原九处超限文件未增长。日志见 `desktop-tests.log`、`desktop-build.log`、`eslint.log`。Server 输入未变，不重复上一节已过的 Server 回归或原生构建。前段 IAB 使用独立 Vite，最终基金、陈旧审计及现金等待回调使用最终 Desktop 生产构建的宿主预览连接 Docker API；Docker 本身只提供 API，不能将其 `/accounts` 的 404 当成产品页面失败。目标更新从 `thesis-ledger-infra` 执行 `./scripts/sync-code.sh thesis-ledger`，结果及可写层边界见 `target-sync.log`；不代表镜像或安装包重建。

最终数据保护复核：`verify-original-state.mjs` 对原七表及 54 份成功 V3 结果比对一致，活动回测 0；两个旧验收账户的原审计事件分别 7/11 条，与本轮只读样本逐项摘要一致，仍停用；受控基金账户不存在于真实账户目录。`disabled-conversion.mjs verify` 确认原 Provider/default、AiRun/AiInvocation 均未变。五个 Docker 服务健康；主仓、DSA、infra 的 HEAD 和空暂存区保持，DSA/infra 的原有修改哈希未变。本轮只改所属 Desktop 文件、测试与 UI 文档，未提交或推送；临时预览服务已停止，原用户服务未操作。

## 持仓、策略与回测设置浮层接续（10-18）

本节对应 T2.R6–R8，使用最终 Desktop 生产构建、宿主 `5174` 预览与 Docker API。写入、配置准备及预检全部由 IAB CDP 截留并返回受控结果；浏览器临时版本、任务均未落库，不代表真实 Provider、冻结快照或回测业务验收。AI 真实生成、路由故障切换继续停止，未注册、购买、修改资格或路由。

原始回执位于 `.recovery-artifacts/position-strategy-ui-2026-10-18/`：`controlled-request-receipts.json` 共 59 条应答/恢复记录，其中 23 个受控非 GET 请求，包含标的确认、准备及预检，不等于 23 类业务；`overlay-layouts.json` 保存三类浮层的 18 组双主题/三视口布局。早期开发服务器仍缓存旧组件，曾复现提交中取消使快照表单消失；该观察不作为修复通过证据，后续均以生产构建复核。

| 入口 | 已完成的异常及恢复 | 实现与证据 |
| --- | --- | --- |
| 持仓页新建/修改快照 | 新建数量 10、成本 3，修改数量 201 在 503 后保留；修改时提交中取消无效、失败后取消须确认，继续编辑保留输入。成功后暂停估值/账本 GET，表单继续等待；读取 503 后明确已保存，恢复仅 GET。 | `portfolio.position-actions` 等待 `onSaved`，修复现金分支跨 await 使用 `event.currentTarget`；`PortfolioManagement` 统一保护主动关闭，`PositionCalibrationSection` 提供持久重读入口。`position-read-failed.png`、挂载回归。 |
| 持仓页移除/清空快照 | 两项均有受控 503 与重试成功，读取失败不清空旧列表。最终构建再次核对移除重试只留下成功通知及持仓重读入口，旧失败提示已清理；恢复不重发移除/清空。 | `position-final-read-failed.png`。账本中的快照别名移除也调整为等待刷新并阻止切换；本轮未将该别名记为独立浏览器覆盖。 |
| 手动策略创建/新版本编辑 | 两项 503 保留草稿，提交中取消无效；成功后列表读取失败，仍定位受控首版/新版本并显示无需重复保存。恢复只读策略/任务列表。同版本重新读取保留本地编辑，保存中路由离开被阻止。 | `strategy.mutations` 先缓存保存响应，再等待失效查询；`StrategyEditorPage` 区分写入成功与读取错误，`StrategyEditorSheet` 仅在打开或明确来源变化时初始化。`strategy-create-read-failed.png`、`strategy-version-read-failed.png` 与真实 TanStack hooks 挂载回归。 |
| 普通回测设置 | 无效 JSON、模型区间不覆盖时显示错误且不发准备请求；准备 503 保留配置，重试准备/预检后可继续。修改后取消须确认。后台入队 503 显示失败；受控入队确认后任务 GET 503 可只读恢复到排队详情，未点击启动或取消。 | `BacktestSetupDialog` 与 `BacktestPricePreparation` 的错误放入 `Field`，复用草稿保护。`strategy.actions` 清理前次入队失败通知，定向回归覆盖失败后再次排队。`backtest-prepare-failed.png`、`backtest-queued-read-failed.png`。保留[执行一致性 AC-13](../../specs/2026-09-08-strategy-lab-execution-parity.md)的同步校验后关窗/后台反馈语义。 |

准备响应来自 Schema 用例的显式研究模型，不能证明模型适用当前市场；第二次正向客户端链使用固定供应商快照口径。早期受控原价协议样本带严格历史时点标签，仅用于错误反馈，不作为严格 PIT 验收，也未改变其取消范围。

18 组布局为三类浮层 × 浅深主题 × `1440×900`/`1024×768`/`390×844`：文档无横向溢出，关闭及底部操作均在视口内；对应六张窄屏 PNG 保留。主题恢复深色，视口与截留已清除，自建页签关闭。此矩阵为本轮表单布局覆盖，不代替全站可访问性、所有错误长度与全部浮层组合。

最终验证：Desktop **148 文件 / 884 项通过**、类型检查与生产构建通过；15 个变动源码/测试文件 ESLint、边界、静态 accessibility 13 项和文件尺寸 ratchet 通过，原九处尺寸债务未增长。日志分别为 `desktop-tests.log`、`desktop-build.log`、`eslint-final.log`、`boundaries.log`、`accessibility.log`、`size.log`。新增六项挂载回归覆盖快照写入等待、策略两类保存/读取恢复、准备错误、同版本草稿及回测关闭保护；队列错误通知回归复用原准备测试。

目标同步从相邻 infra 目录执行 `./scripts/sync-code.sh thesis-ledger`，最终退出 0，Server/Worker 健康且镜像 ID 未变；见 `target-sync-final.log`。这是可写层快更，不是镜像发布。未改变依赖、数据库或原生输入，不重跑无变化的真实来源、Server 全量与原生编译。同步后原七表及 54 份成功 V3 结果比对一致，回测任务仍 71、活动 0；Provider/default、AiRun/AiInvocation 均未变。三仓 HEAD 与空暂存区保持，未提交或推送。其他 UI 入口、基金真实 NAV、AI 与通知业务条件按现行 Task 保留未完成。

工作树基线捕获的一段命令输出发生截断，因此 `worktree-baseline.json` 不作为完整的全仓文件哈希证明；保留它用于核对可用条目。本轮仅对列明的 Desktop 源码、测试和三份 UI 文档定点修改，没有执行还原或清理。最终临时预览服务已停止。
