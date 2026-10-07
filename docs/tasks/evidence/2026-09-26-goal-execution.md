# 全部剩余任务目标执行记录

目标：完成全部剩余任务；每个卡点首次尝试后最多重试两次，仍失败记录并跳过，继续其他任务。跳过不等于验收通过。主 Task 及 DSA 原子能力登记表继续作为范围依据。

## 当前进展

- 2026-09-27：M29-b2-identity 完成，准入绑定的 ETF 直接映射、独立分红币种与读取前后复核接入实际内容寻址/加密 SQLite/标准化读取接缝。新增 46 项、组合 193 项通过；官方 DSA 同步后两份模块导入/摘要一致，缺准入拒绝且未读取账号，服务 healthy。没有真实 RQData 请求或准入；下一前沿为 identity-wire 共享合同、Server 离线消费及生产事件入口，父项/真实门禁保持开放。见 [身份证据记录](2026-09-27-rqdata-identity-evidence.md)。本轮为实质进展，目标保持 active。

- 2026-09-27：M29-b2-credentials 完成，RQData 已接入既有 Control 加密账号配置及实际 Store 的读取前后修订核验。新增 13 项、组合 121 项回归及 lint/编译通过；官方 DSA 同步后目标 registry HTTP 200、四份源码摘要一致且 healthy，镜像不变。能力集仍为空，证券映射/币种/历史覆盖和事件 V3 接线继续开放；真实账号未请求。见 [账号配置证据](2026-09-27-rqdata-control-credentials.md)。本轮为代码和目标运行态实质进展，目标保持 active，下一前沿为上述来源事实合同及其他独立未完成单元，不重新尝试已耗尽预算的 I01/来源/浏览器卡点。

- 2026-09-27：S03-pg-facts 隔离 PostgreSQL 验证完成，完整 19 份 migration 后 4 项实际缓存读写通过，另 13 项身份/Reader 回归及类型/lint 通过。临时容器清理完成；V3 完整响应往返原卡点未重试，父门禁仍开放。见 [数据库缓存证据](2026-09-27-s03-cache-postgres.md)。

- 2026-09-27：S07 Server/Worker 已通过官方代码同步，四个关键产物摘要与宿主构建一致、服务健康；真实 HTTP/目标库只读拒绝边界通过，任务数未变。Browser 连接初次及两次重试被客户端拦截，按预算跳过，Desktop 部署与 G-UI 保持开放。见 [目标运行态证据](2026-09-27-s07-target-sync.md)。

- 2026-09-27：U03 普通复权回测已串接准备→联合预检，仅两步通过且修订一致才启用提交；配置变化/关闭取消请求链，修复请求期间更高修订被忽略的问题。组合 21 项、补充请求链 8 项及 Desktop 类型/lint/build 通过；目标交互验收保持开放，见 [消费证据](2026-09-27-u03-preflight-consumption.md)。

- 2026-09-27：S07 事件诊断已按分红/拆分能力和实际请求目标细化，部分成功不误报，控制面失败不猜测来源。定向 35 项及补充组合 32 项通过，类型/lint/边界门禁通过；详见 [事件诊断证据](2026-09-27-s07-event-diagnostics.md)。

- 2026-09-27：S07 联合预检 API 与客户端接线完成，执行行情和按需非价格依赖联合检查，返回前重新核对策略/路由。Server 59 项、客户端 11 项、Schemas/Server/API Client 构建及类型/lint/边界检查通过；U03 消费、事件精确诊断和目标验收保持开放，见 [API 证据](2026-09-27-s07-preflight-api.md)。

- 2026-09-27：S07-dependencies 只读非价格诊断入口完成，复用冻结依赖验证，收集多项失败且不暴露底层异常。新增 6 项、组合 34 项测试及 Server 类型检查/lint 通过；HTTP 联合预检接线和全量验收继续由 S07-api 承接，见 [实现证据](2026-09-27-s07-dependency-preflight.md)。

- 2026-09-27：S07-revision 本地验证完成，新增策略/配置变化及三类路由修订变化共 5 项回归；预检、诊断、HTTP 准备及创建边界合计 51 项通过，Server 类型检查通过。S07 全依赖预检与真实门禁保持开放，见 [修订失效证据](2026-09-27-s07-revision-invalidation.md)。

- 2026-09-27：目标 13 条历史回测读取通过，8 份成功 CN ETF V2 冻结快照实际离线重放校验和一致，14 张真实域表摘要未变。新增真实 PostgreSQL V3 创建/幂等/并发领取/终态/冻结重试集成 3 项通过，5 张隔离真实域表不变；Server 19 项、Domain 36 项旧路径回归及 typecheck/lint 通过。G-Legacy-pg 完成，完整 G-Legacy、其他市场/NAV 冻结重放与实际 Provider 门禁继续保留。见 [历史重放与隔离证据](2026-09-27-legacy-replay-isolation.md)。

- 2026-09-27：目标协议 smoke 增加独立 Data Token 正向鉴权，使用无效协议版本在解析阶段退出，避免消耗 Provider 行情；9 项测试和真实目标门禁通过。原定 HiThink ETF qfq 请求首次及两次重试均 `NO_ELIGIBLE_PROVIDER`，真实目录为 `not_admitted`，G-Run 本轮跳过而非通过。修正剩余清单的旧部署阻塞和已完成 U04 窗口接线状态；未创建回测/AI。详见 [目标运行态验收](2026-09-27-target-runtime-gates.md)。

- 2026-09-27：保留数据升级官方入口已实施并实际执行成功。真实备份恢复演练、四项增量事务、角色权限及完整结构检查通过；目标 head 为 `20260927090000_market_derived_series_snapshot`，68 张业务表，Server/Worker/DSA/Redis 均 healthy，Server 健康 API 与 DSA V3 协议检查通过。备份目录为 infra `.database-upgrades/run.YKDSZk/`。在线旧数据复核：65 表中 58 表旧列摘要一致，其余 7 表有运行态变化但旧主键无缺失；不宣称全表值未变。数据库升级阻塞解除，主 Task 的 G-Deploy 其他依赖和 G-Run/G-UI/G-AI 继续未完成。详细证据见 [保留数据升级任务](../../archive/tasks/2026-09-27-preserve-data-database-upgrade.md)。

- 2026-09-27：保留数据演练新增旧表/旧列逐行 SHA256 摘要与行数核对，只有摘要进入 Node，业务记录不输出；升级后按基线列投影，SchemaVersion 由独立 head 校验承担。隔离 PostgreSQL 实际四个增量前后全表数据摘要一致，新增列不误报、旧值修改明确拒绝；现有 3 项集成测试通过（含权限、旧 head 拒绝、故障回滚），临时容器已清理。自动编排和目标业务库演练仍未完成。

- 2026-09-27：保留数据升级新增隔离恢复函数。执行前核对目标不等于源容器、本次隔离标签、network none、运行状态、库/owner 和空用户表；备份摘要/大小预检后以单事务 pg_restore 恢复，再核对实际传输摘要。两个临时 PostgreSQL 17 容器验证恢复中文原数据、拒绝源/错误标签/摘要不符/非空目标，集成测试通过；容器和样本备份均已清理。目标库未备份或修改，仍需官方编排生成真实演练证据。

- 2026-09-27：实现 PostgreSQL custom 备份函数，核对实际库/owner，流式 SHA256/字节计数，0600 独占 partial、同步落盘后以不覆盖方式发布，失败不返回成功记录。独立无网络 PostgreSQL 17 实测 dump→新库 restore，中文原数据保留、摘要和权限一致、原备份不可覆盖；集成测试通过，测试文件/容器已清理。只验证隔离样本，尚未备份目标业务库；官方恢复演练与更新入口继续实施。

- 2026-09-27：P2-a 升级演练记录校验完成，绑定精确目标、计划/权限/备份摘要及大小、消费者停止批次、恢复/升级 head 和结构/权限/数据保留结果，拒绝未来或倒序时间。8 项测试、Server typecheck 和定向 lint 通过。此步骤只校验证据关联，不声称已备份或恢复真实业务库；P2-b 受信备份恢复执行器仍未完成。

- 2026-09-27：保留数据升级事务生成器完成，执行前校验计划与权限脚本摘要，事务内验证精确库/owner、锁住旧 SchemaVersion，增量/权限/缺表检查成功后更新 head。14 项计划/生成器测试通过；独立无网络 PostgreSQL 17 的 3 项集成测试验证真实四个增量、旧数据保留、新表角色权限、旧 head 拒绝和故障整体回滚。测试容器已停止清理，未操作目标业务数据库。P2 真实备份恢复、P3-c 证据绑定、P4 官方入口和 P5 目标运行态继续未完成。

- 2026-09-27：为解除 G-Deploy 建立独立保留数据升级 Spec/Task。核实 infra 官方入口仅有 check/rebuild，未提供增量升级；新增只读计划器，严格识别已知 head，绑定全部源码摘要、目标库/owner 与预期表，未知起点拒绝。12 项计划测试及 11 项既有结构测试通过；以当前源码和已知部署版本生成 4 个待执行迁移。下一阶段须完成备份恢复、隔离演练、事务执行和官方入口接线，未修改实际数据库或手工 marker。

- 2026-09-27：M32-b2-store-pg 通过真实 Prisma/PostgreSQL 仓储测试 3 项，验证并发幂等、完整输入损坏拒绝/保留原行，以及算法列约束。测试仅允许 loopback 地址和 `derived_snapshot_fixture` 专用库，临时容器只映射 loopback 随机端口，结束后停止并自动清理。Market 模块已注册仓储，目标业务数据库没有修改。真实来源准入与运行态 Reader 消费仍未完成。

- 2026-09-27：M32-b2-store 完成完整派生输入的独立 Schema/migration/Prisma 仓储。Schema diff 仅新增本轮模型并保留既有 WIP；Prisma Client 已生成。仓储/结构 15 项测试、Server typecheck、定向 lint、占位 URL 的 Prisma validate、migration:matrix、runtime database input 全部通过。隔离 postgres:17-alpine（无外网、无宿主端口）顺序执行 19 个 migration 成功，共 68 张 public 表；专属 SQL 验证重复身份、载荷身份不一致及缺字段拒绝，事务回滚。该证据仅证明隔离 SQL/约束，不证明目标应用角色、Server/Worker 或真实 Provider 已完成；目标库没有修改。

- 2026-09-27：M32-b2-basis 增加现有 SourcePriceBasis 合同转换，派生计算独立输出因子指纹；基准范围与分红语义须显式提供，已验证分红缺证据拒绝。派生模块 34 项测试通过。仓储检查确认 MarketBarWindowEvidenceV3 可保存 local-derived 基准与完整响应，但没有完整派生输入存储字段；尚未修改数据库或将纯函数宣称为持久化完成，后续仍须实现完整输入存储及准入/Reader 消费。

- 2026-09-27：M32-b2-raw 增加现有冻结窗口返回契约到派生快照的桥接函数。以完整响应哈希核对因子绑定，关联原请求，拒绝非原生 raw/非原始量及晚于截点的来源；Bar 观测时间保留 Bar、来源基准与仓储读取时间的最晚值。首次测试暴露读取时间字段位置错误，修复为仓储证据 fetchedAt 后派生模块 31 项测试通过。测试使用冻结响应样本，未宣称实际数据库/Reader 已接入；剩余因子准入、派生持久化和 Reader 注册继续未完成。

- 2026-09-27：M32-b1 新增派生序列快照编码/读取函数，冻结完整输入、算法版本与输入指纹；读取核对外部固定指纹并完整重算，limit 仅裁剪输出，保持完整序列基准和指纹。14 项新增测试覆盖 JSON 往返、可修改对象隔离、隐藏前段/因子/锚点/来源引用篡改、未知算法及非法 limit；与计算核心共 25 项通过。数据库仓储和真实 Reader 准入仍未接入，M32-b2 保留未完成。

- 2026-09-27：M32-a 新增 `market-derived-series-v3.ts` 纯计算核心，显式 raw/乘法因子/固定锚点合同，严格逐项对齐及冻结截点检查，保留原始量额和最晚真实观测，完整输入与证据进入 SHA256 指纹。11 项测试覆盖固定基准分段一致、证据修订、缺失/晚到/重复/零锚点/溢出/未完成 Bar；Server typecheck、定向 ESLint 通过。真实因子可信关系及 Reader/冻结仓储尚未接入，M32 父任务继续未完成。

- 2026-09-27：M30-b1 完成单基金 `fund.get_dividend` 读取入口，预检身份/币种/预算，固定一次请求，不回退股票或拆分接口；日期索引与完整响应进入独立分红内容版本。新增 11 项测试，RQData 拆分/分红标准化和读取合计 66 项通过。空集仍不证明覆盖完整；隔离 SDK 会话、已核验币种/ETF 映射与 V3 冻结消费保持未完成，未调用真实账号或更新运行态。

- 2026-09-27：M30-a 完成 RQData 基金分红标准化，共用来源自有的基金身份/日期契约。保留每份税前金额、登记/除息/发放日期及真实观测时间，拒绝股票金额字段替代、错误币种、冲突日期/身份/重复记录；19 项新增测试与拆分回归共 55 项通过。`rqdatac`/`rqdatac_fund` 本地均未安装；只读检查 PyPI rqdatac 3.7.1 发布包源码确认 `connect_timeout`/`timeout` 和模块级客户端状态，隔离初始化尚未实现，未发起账号请求。官方文档主站抓取超时后通过官方 assets 镜像获得基金字段合同，来源已记录于 Spec。

- 2026-09-27：M29-b1 新增 `rqdata_fund_split_reader.py`，固定一次基金 endpoint 查询、预检参数及行数预算，拒绝失败重试/股票 endpoint 回退，保存包含原始日期索引的内容版本。标准化新增日期索引与同名字段冲突检查；36 项定向测试通过。SDK 阻塞超时、实际账户与目标 ETF 身份、准入及冻结链路仍归 M29-b2；未把预算回调或净值基金离线样本当作真实 ETF 验收。

- 2026-09-27：M26 币种前置经冻结模型、事件请求和准入记录核对后仍无已核验输入，暂跳过该接线，未默认 CNY。推进独立 M29-a，新增 RQData `fund.get_split` 单基金拆分标准化；日期索引/字段、精确查询绑定、比例方向、无变化比例、冲突重复、真实观测时间均有定向验证，24 项测试和 flake8 通过。来源文档已在 Spec 与 DSA 门禁记录中引用；未安装 SDK、请求真实账号或开放事件路由，M29-b/c 及目标 ETF 映射继续未完成。

- 2026-09-27：M26 分红 Reader 现在对有事件、空响应及仅窗外事件统一返回 `providerRevision`，绑定完整原始响应内容摘要；窗外记录修订也会改变版本，不能因规范化事实为空而丢失来源版本。读取、标准化和事件链路合计 56 项测试通过，相关 flake8 通过。接线核对发现事件 V3 请求没有已核验分红币种输入，规格要求调用方提供币种事实；后续须建立可冻结的币种证据契约，不能仅凭 CN/ETF 或交易所后缀默认 CNY。本轮未开放 Tushare 事件库存，M26-b2 保持未完成。

- 2026-09-27：M26-b2 前置链路修复。真实 SQLite Effective Policy 原先用行情库存检查事件，导致已准入的 EastMoney 分红仍为 `not_adapted`；现在精确事件库存独立识别，并继续执行启用、凭据、准入与熔断检查。事件读取前后比较排除每次计算重新生成的 `appliedAt`，其余策略、目录和准入状态继续比较。新增真实 SQLite 纵向测试覆盖默认拒绝、准入后读取、覆盖仍不完整、撤销后禁止读取。事件与 Tushare 行情定向回归 24 项通过；未调用真实 Provider，未部署。M26-b2 的 Tushare 事件接线及真实验收仍未完成。

- U04：Server 与 Reader 共用含指标预热的窗口规划；options 支持规划参数及固定结束时间，回显计划与窗口。API Client 校验规划关联。
- Desktop：V3 实际行情请求先规划，再以计划结束日期获取，返回后校验获取窗口；只请求价格分段时补齐三种指标以保持预热一致。规划失败/无可用来源不请求行情。口径切换保留条数和指标参数，标的切换恢复默认。
- 可用性选择按条数、指标参数和刷新序号隔离缓存，加载期间不使用旧可用结论。合成目录浏览器验证 90 根后复权备用可选；180 根无证明则显示原因并禁用；冻结运行配置保持 qfq。
- 浏览器旧标签句柄失效，重新取得同一浏览器的新标签后验收通过；已停止本轮 Vite。

## 验证和重试账本

| 项目 | 首次结果 | 重试/当前结果 |
| --- | --- | --- |
| Server 全量 | 冻结比较 1 项超过 5 秒；其余 1248 项通过 | 重试 1：停止并行构建后串行运行，1249 通过、49 跳过；未提高超时阈值 |
| Desktop 全量 | 509 项通过 | 无需重试 |
| DSA 图表/精确 pin/V3 | 56 项通过 | 无需重试 |
| ESLint | 7 个类型/未使用项 | 修复后重试 1 通过 |
| 构建 | Desktop、Server 通过 | 日期时区修复后补充定向 8 项通过 |
| 目标基础设施 | Docker 可连接；业务容器均退出 | 准备通过 infra `update.sh all` 默认 check 恢复，不清库 |
| 仓库门禁 | 依赖边界、workspace 依赖、migration matrix 通过；无基线尺寸检查只报告警告，不构成 ratchet 通过 | 设置 `GUARDRAIL_BASE_REF=fe0e871e37a09964f7a113b82e7d09f6d4d95f7e` 后确认仍有 3 项超限增长，见下 |

尺寸复核纠正：`ai-provider.service.ts` 1198/基线1189，`ai-provider-ui.test.tsx` 923/890，`ai-provider-management.test.ts` 1401/1363。此前无基线脚本退出 0 的结果不能关闭该门禁。目标更新尚未执行，必须先完成该门禁的职责拆分修复或按用户重试规则记录不能完成的原因；不得提高阈值或机械删行。

infra 的 Compose 契约及 DSA Dockerfile 生成测试已通过，均为本地隔离脚本测试，不是目标数据库结构检查。下一步先检查三个超限文件可独立提取的职责/测试组，保留其中全部既有 WIP 行为及测试断言。

## 接续执行

### 尺寸门禁修复与复验

- 将生成测试的模型定价选择、费用授权判定提取到 `ai-provider-test-pricing.ts`；模型价格表存在但目标模型未填写时仍保持未知，不回退至全局费率。
- 将查询失效断言移入 `provider-query-invalidation.test.ts`，持久化管理测试的配置/健康模拟器移入 `ai-provider-management.fixtures.ts`；保留全部测试断言。
- `GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs` 通过：三个文件分别 1161/1189、865/890、1275/1363；未调整阈值。
- Server 179 文件通过、15 跳过，1249 测试通过、49 跳过；Desktop 74 文件、509 测试通过。命令中的 `--` 使 Vitest 实际执行全包，按实际结果记录，没有把它误记为定向运行。
- ESLint、依赖边界、diff check 通过。首次类型检查发现提取输入必须兼容显式 undefined，修复后重试 1 通过。日志：`/private/tmp/goal-size-typecheck-retry1.log`、`/private/tmp/goal-pricing-tests.log`、`/private/tmp/goal-query-tests.log`。
- Server build 通过（`/private/tmp/goal-size-build.log`）。

### 目标更新进程

- 已执行 infra 正式入口 `DEV_DATABASE_MODE=check REPAIR_BUILD_CACHE_ON_NO_SPACE=false ./scripts/update.sh all`。首次脚本内部两次构建均被沙箱禁止写入 `~/.docker/buildx/activity` 拦截；进程 28561 已退出 1，数据库检查尚未开始。
- 按同一卡点第二次重试提升执行权限，审批通过后完成镜像构建。2026-09-27 续接确认句柄 **77998** 已不存在，日志 `/private/tmp/goal-update-all-retry2.log` 明确结束于数据库结构检查失败；不能再等待该句柄或重复启动构建。
- 默认 check 保留数据库；未批准清库、volume 删除或破坏性重建。目标运行态与数据库验收继续未通过。
- M2 入口复核：实际 V3 执行在 DSA `src/services/thesis_ledger_provider_runtime.py:1652`，精确适配目录在 `thesis_ledger_market_v3_adapters.py`，AKShare/EastMoney 股票与 ETF 三口径已有分支，但 M21 的单位与来源元数据验收尚待完成。M22–M34 与 M3 范围保留，不以本次门禁修复代替。

### 2026-09-27 目标数据库卡点

- 上轮有实际进展：职责提取、测试/构建与正式更新。当前以最终日志和容器状态重新核实：PostgreSQL healthy；Server、Worker、DSA、Redis 仍退出，镜像成功不代表运行验收通过。
- 正式结构检查首次报 `database structure is incomplete`。之后两次只读复核均得到目标 head `20260922100000_ai_provider_test_facts`，且缺少 `MarketBarWindowEvidenceV3`；当前源码要求 `20260926090000_market_window_frozen_response`。两次复核是状态复验，没有重新构建、执行迁移或重启服务。
- 当前 migration 输入共 67 张表，目标有 66 张；缺表涉及 `20260925110000_market_bar_window_evidence_v3` 和后续完整响应字段 migration。表数及 marker 只用于诊断，不替代完整升级验收。
- 按用户卡点规则，本轮跳过依赖该结构的 G-Deploy/G-Run/G-UI/G-AI，保留未通过；没有启动破坏性 rebuild。保留数据升级仍需独立流程、备份和隔离演练，未以手工改 marker 掩盖缺失。
- 下一步切换 M21–M34 及 M3 可独立实现项；不得再次无输入变化地重建镜像或重新等待已消失句柄。

### M21 本地精确路由核验

- 新增 DSA `tests/test_akshare_exact_eastmoney_contract.py`，覆盖股票/ETF 三口径的实际分派、原生口径映射、日期窗口、来源保留及两个资产的超时不切源，共 8 项通过、2 项依赖弃用警告。定向 flake8 通过；无生产代码变化，无需重建镜像。
- 官方 ETF 文档确认三口径参数但没有提供量额单位；证据同步至主 Task、DSA 来源门禁及 CHANGELOG。仅完成映射核验，未把 M21 或真实准入标为完成。
- 下一执行面：M22/M23 事件适配，或 M24/M25 已知 Tushare 契约；先核对来源字段与既有事件消费者。没有授权/单位/日期证据的事实继续未知，不用猜测值填齐。

独立可执行的 M2/M3 适配不等待目标数据库或 AI 门禁。目标继续 active；数据库卡点按上节记录跳过，未出现新输入时不再重复构建。

### M22/M23 公告覆盖误判修复

- 发现并修正已有 ETF 公告标准化误判：公告索引不含足够生效日/比例/金额/分页完整性证据，却曾因窗口内无关键词公告而返回完整空事件集合。现在索引入口保持 `coverage.complete=false`，不会给依赖事件的回测提供错误放行依据。
- 更新回归覆盖未来公告、窗口前公告、非事件标题，以及 bare fund symbol 的真实适配调用边界。首次运行 19 通过、1 项旧完整性断言失败；修正该断言后重试 1，连同 V2 行情共 28 项通过，3 项既有依赖/收集警告。`py_compile`、关键错误 flake8、diff check 通过。
- 变更仅 DSA `fundamental_adapter.py` 及对应测试、文档。未请求 Provider、未修改目标数据库、未构建镜像；既有镜像未包含本修复。M22/M23 结构化拆分/分红适配及 M33 消费仍未完成，不能把拒绝错误覆盖等同完整事件能力。
- 日志 `/private/tmp/goal-m22-announcement-retry1.log`。下一步核实 `fund_cf_em` / `fund_fh_em` 的日期与单位契约，设计结构化事件适配；缺少可见时间时必须区分记账事实与策略可用事实。

### M23-a 结构化分红标准化

- 已按官方字段和本地 SDK 实现 DSA `data_provider/eastmoney_fund_dividends.py`；18 项定向测试与 flake8 通过，日志 `/private/tmp/goal-m23-normalize.log`。按元/份保留 Decimal 金额，日期分别留存，无公告时点不产生策略可见性；冲突重复、无效金额/日期/代码拒绝，空结果不宣布覆盖完整。
- 主 Task 将 M23 拆为 a 标准化、b 路由/分页/冻结接入；只勾选 a。本模块尚未进入真实调用链，不构成 M23/M33 完成。未发 Provider 请求，未部署。
- 后续 M23-b 需安全有界的 endpoint 读取：已安装 SDK 使用无 timeout 请求及 eval 响应解析，不应直接使用该路径进行运行态接入。M22 的拆分折算日仍不能无证据映射为经济生效日。

### M23-b1 有界来源读取

- 已实现 DSA `eastmoney_fund_dividend_reader.py`，JSON 字面量解析、超时/大小/总页预算、分页变化与重复拒绝；成功读取后保留分页内容指纹并交给已实现的标准化模块。结果不将传输完整性升级为历史事件覆盖。
- 真实只读格式探针一次成功：HTTP 200、12984 bytes、2025 年第一页页数 75/每页100/当前1；未继续抓全量。无密钥请求，无目标数据库写入。
- 标准化与读取测试合计 31 项通过、2 项依赖弃用警告，py_compile、flake8 通过，日志 `/private/tmp/goal-m23-reader-final.log`。主 Task 明确拆开已完成 b1 与未完成 b2。
- 下一步 M23-b2 精确事件路由及冻结消费，需与现有 Market 事件依赖合同对齐。旧运行时仍使用公告入口，未自动启用新来源；当前镜像不包含新增模块。M22 日期核验及全部 M2/M3 尚未完成项保留。

### M23-b2 日期冻结接缝

- 共享公司行动事实新增可选 `recordDate`/`paymentDate`，提供时要求明确生效日；日期顺序保留来源/市场适配责任，未将中国规则施加到其他市场。DSA canonical fact 输出已知两日期，未知省略。Spec/Task 已同步。
- 现有冻结依赖入口使用共享合同；新增测试证明两日期进入冻结行、策略可见性不被补齐、篡改发放日会被证据校验拒绝。无需新增平行冻结存储。
- Schema 全包 36 文件/299 项通过，Schema build 通过；Server 定向 8 项通过；DSA 31 项通过。首次 Server typecheck 因测试把领域类型直接当标量行失败，修复为修改实际冻结行后重试 1 通过；lint 的未使用解构变量修复后重试 1 通过。
- 日志 `/private/tmp/goal-event-dates-schemas-all.log`、`/private/tmp/goal-event-dates-frozen-final.log`、`/private/tmp/goal-event-dates-typecheck-retry1.log`。没有 Provider 请求或部署。
- 余下 b2 不是日期传输：V3 目录当前只有行情适配库存，真实公司行动仍走 V2 固定适配。必须接入独立 data 路由及对应来源准入/事件覆盖合同后才能开启新读取器；不能把新 helper 或可选日期字段当整个 M23 完成。

### M23-b2 事件 V3 共享合同

- 新增 `packages/schemas/src/market-event-wire-v3.ts` 并导出：现金分红/拆分为独立 data 能力，必须固定目标及 Desired/Effective/Catalog 修订；校验请求响应的标的、窗口、dataAsOf、事实来源与能力、经济生效日、可用时点及重复冲突。
- 完整覆盖与不完整结果使用独立分支；前者必须有 `admissionEvidenceRef`。此字段只是契约绑定，DSA/Server 后续必须验证其范围和有效性，不能把 schema 校验当准入证明。
- 定向 17 项、Schema 全包 37 文件/316 项通过，typecheck、lint 通过。日志 `/private/tmp/goal-event-wire.log`、`/private/tmp/goal-event-wire-all.log`。无 Provider 请求、数据库或运行态变更。
- 下一步执行明确叶 `M23-b2-runtime`，接 DSA 精确事件路由、现存 admission 和 Server 依赖消费者；当前新合同尚未用于真实 HTTP 请求。全部 M2/M3 范围保持，不关闭 M23 或 M33。

### M23-b2 DSA 事件入口与准入接线

- 新增 DSA 鉴权 HTTP `/api/v3/thesis-ledger/market/events`。请求固定分红 data RouteKey、目标、版本、范围，读取前后复核实际目录/准入及策略，拒绝撤销、禁用、来源修订漂移和晚到结果；成功也只返回不完整历史覆盖。
- 将适配修订/准入比较从过大的 Provider Runtime 提取到 `thesis_ledger_market_v3_revisions.py`，保留原导入接口；事件库存独立于行情库存，新库存默认未准入。未写真实 admission，不以本地就绪取代来源审核。
- 事件执行与鉴权 HTTP 11 项通过；连同准入、目标 pin、HiThink、分红读取回归共 83 项通过、4 项既有警告。py_compile、新增文件 flake8 通过；原模块兼容导出触发 F401，修正为显式命名空间绑定后复验通过。
- 日志 `/private/tmp/goal-events-runtime-confirmed.log`、`/private/tmp/goal-events-http.log`。本轮无 Provider 请求、数据库升级或目标部署。
- 追加行情 V3、图表 V3、HiThink 凭据准入回归 43 项通过、6 项既有警告，日志 `/private/tmp/goal-events-catalog-regression.log`；未因加入事件库存回退已有行情行为。

### Server 事件 V3 传输

- 新增 `DsaClient.marketEventsV3` 与 `dsa-events-v3.ts`：请求先解析、单次 POST、Data Token、响应逐项关联；DSA 事件错误合同显式加入共享 Schema，错误映射为准入拒绝/策略过期/不支持/不可用，不透传原始上游文案。
- 事件及图表传输 15 项通过，Server typecheck、Schema build 通过；尺寸 ratchet（HEAD 基线）通过。首次 lint 发现测试未使用参数，改为断言 HTTPS/POST 后复验。日志 `/private/tmp/goal-event-transport-final.log`、`/private/tmp/goal-event-transport-types.log`、`/private/tmp/goal-event-transport-size.log`。
- 未进行真实 HTTP/Provider 请求或部署。冻结调用尚在 V2；下一步需建立按事件能力的来源响应集合与冻结证据，保留原始请求/响应和准入绑定，不能仅返回聚合 facts 而丢来源/版本。
- 下一步为 `M23-b2-consumer`：Server Client 传输和按事件能力划分的依赖读取；现有 V2 仍是冻结消费者调用入口。完整性仍依赖独立覆盖证据，不能直接把 DSA 明确不完整响应升级为 supported。

### 事件能力选择与请求规划

- 上轮仅确认目标 active，属于无实施进展；本轮重新检查工作树与执行记录后继续独立实现，没有重试已跳过的目标部署卡点。
- 新增 Market `market-event-selector-v3.ts`，按冻结调用方提供的版本验证实际 Effective/Catalog，精确匹配事件能力和目标；单次请求失败不隐式切源，成功保留共享合同验证后的完整 exchange，仅标记 observed。
- 新增 Backtest `backtest-event-requests-v3.ts`，按分红/拆分各自依赖计算范围；raw 记账请求双能力，单一现金信号不会附带拆分要求。版本、标的及 dataAsOf 原样固定。
- 新增 12 项测试，连同传输回归共 21 项通过；Server typecheck、定向 ESLint、依赖边界通过。日志 `/private/tmp/goal-event-selection-final.log`、`/private/tmp/goal-event-selection-types.log`、`/private/tmp/goal-event-selection-lint.log`。
- 尚未接线生产 Snapshot collector，仍需持久化能力 exchange、核验覆盖引用与离线证据，并移除该入口的 V2 调用。上述 helper 不构成 M23/M33 完成；没有 Provider、目标数据库或部署变更，目标继续 active。

### 多能力事件观测聚合

- 新增 `readBacktestEventObservationsV3`，一次读取 Effective/Catalog 后固定版本分别请求各事件能力；保留各能力的完整 scope 和响应，不把独立来源压成一个 provider。
- 现金成功但拆分缺失时整体 unavailable；任一能力覆盖不完整时整体 incomplete；两者都有完整引用时仍为 coverage-review-required。没有依赖时零请求，控制失败或版本漂移时不发事件数据请求。
- 聚合 6 项、规划/选择器 12 项，共 18 项通过；Server typecheck 与新增文件 ESLint 通过。日志 `/private/tmp/goal-event-observations-final.log`、`/private/tmp/goal-event-observations-types.log`、`/private/tmp/goal-event-observations-lint.log`。
- 实际收集器接线仍未完成。检查确认 DSA 已在读取前后核验实际 admission，但响应只返回覆盖引用，Server 没有可离线重验的准入范围/修订快照。下一步扩充完整响应的准入快照合同，由 DSA 输出已核验的范围与修订，Server 核验引用、来源、范围和有效期后再冻结；不能仅因引用非空放行。当前 EastMoney 来源仍明确不完整，不改变这一结论。
- 本轮无真实 Provider、数据库或部署操作。全目标保持 active，M23/M33 父任务未完成。

### 事件准入快照与引用核验

- 按实际 ControlStore 字段新增共享准入快照合同，完整事件覆盖必须携带匹配 evidenceRef 的 admission。检查精确 RouteKey/来源、标的及完整窗口、读取时有效期、记录时点、证据 SHA-256 和撤销状态；离线检查使用原 fetchedAt，不依赖当前时间。
- DSA 从读取前后已核验一致的实际记录生成安全投影；省略 recordedBy，保留适配器/来源/凭据修订标识及记录版本。过期、未来记录、无效摘要和撤销元数据拒绝输出。当前 EastMoney 响应仍 coverage.complete=false，查询准入不替代历史完整性。
- 聚合器仅在各能力完整响应均通过快照合同后返回 complete；新增缺快照拒绝用例。此 complete 只描述多能力响应，不代表 Snapshot 已冻结或真实来源准入通过。
- Schema 定向 29 项、DSA 15 项（3 项既有警告）、Server 传输/选择/聚合 24 项通过；状态变更后聚合 7 项另行通过。Schema build、Server typecheck、ESLint、DSA flake8 通过。日志 `/private/tmp/goal-event-admission-schemas.log`、`/private/tmp/goal-event-admission-dsa.log`、`/private/tmp/goal-event-admission-server.log`、`/private/tmp/goal-event-admission-aggregate.log`、`/private/tmp/goal-event-admission-types-final.log`。
- 实际 Snapshot collector 仍待接线，需保留原始 exchange 并复核冻结计划对应的能力集合与版本，不能重新压成只剩 V2 事实的证据。下一步不再需要新增准入查询接口；DSA 输出已核验快照，Server 复核其一致性。未部署，无真实 Provider 请求，目标 active。

### 实际 Snapshot 事件 V3 冻结接线

- 将收集编排从过大的 `backtest-snapshot-v3-dependencies.ts` 提取到独立 collector；实际事件分支调用精确 V3 多能力读取，不再调用 `backtestCorporateActions`。Calendar/标的历史事实保持原行为。
- Builder 把已选且冻结的行情 Desired/Effective/Catalog 版本传入事件依赖；缺少版本、控制版本漂移、事件能力或覆盖不足均拒绝，不回退旧事件读取。
- `backtest-snapshot-v3-events.ts` 冻结独立能力的完整请求/响应/准入快照。兼容旧领域规划器的 V2 形状仅在内存中重建，事实仍保留原来源；证据保存 `snapshot-events-v3` exchange 集合及其总指纹。
- 离线校验从计划与行情证据重建所需能力、范围和版本，再校验 exchange、覆盖、准入和事实行；覆盖为空但完整时保留原有空数据哨兵。新增测试拒绝缺版本、不完整覆盖、能力丢失和版本错配，并确认不调用 V2。
- 定向 22 项通过；Server 全包 183 文件通过、15 文件跳过，1280 项通过、49 项跳过；Server build、typecheck、ESLint、依赖边界、diff check、HEAD 尺寸 ratchet（13 项存量警告）通过。日志 `/private/tmp/goal-event-frozen-final.log`、`/private/tmp/goal-event-frozen-server-all.log`、`/private/tmp/goal-event-frozen-build.log`、`/private/tmp/goal-event-frozen-types.log`、`/private/tmp/goal-event-frozen-size.log`。
- M23-b2-consumer 及冻结聚合叶标记本地实现完成；M23/M33、真实来源历史覆盖、目标 Docker/UI/AI 仍未通过。目标数据库卡点无新输入，未重复构建。下一步核对 M33 剩余记账/信号消费要求，以及 M22/M24–M34 和 M3 独立任务，不把本地接线等同全目标完成。

### M33-a 事件信号实际消费

- 复核发现冻结事件进入执行域时丢失 effectiveDate/strategyVisibility，且表达式仍显式 unavailable。已保留生效/登记/支付日期并解析独立策略可见性；旧事实不补造字段，损坏的可见性拒绝转换。
- 新增领域事件信号求值：按冻结日历对应 Bar 的 tradingDate 匹配 effectiveDate；announcement 与真实 availableAt 均须不晚于决策，conservative-day 严格要求可见日早于当前交易日。没有已核验输入或可见性时 unavailable，完整空集 false；价格研究时钟不放松事件 PIT。
- 信号事实独立于记账事件队列，经共享上下文进入引擎求值；归一化路径可消费信号，既有禁止重复现金/数量记账行为不变。将两处重复上下文构造抽出，过大的 simulation 文件净缩小。
- 领域定向 30 项通过，领域全包 37 文件/312 项通过；Server 转换与快照 7 项通过，Domain build、Server typecheck/build、ESLint、依赖边界、HEAD 尺寸 ratchet 通过。日志 `/private/tmp/goal-event-signals-final.log`、`/private/tmp/goal-event-signals-domain-all.log`、`/private/tmp/goal-event-signals-server.log`、`/private/tmp/goal-event-signals-types.log`、`/private/tmp/goal-event-signals-server-build.log`。
- 新确认的 M33-b 保留未完成：raw 引擎仍按 legacy occurredAt/availableAt 调度，必须改为明确经济生效日期并处理晚抓取事实与历史记账/决策边界。此次信号接通不代表 raw 记账时点已修复。无 Provider 请求、目标数据库或部署变更；全目标 active。

### M33-b raw 生效记账调度

- 已按 Spec 的严格事件时间边界实现 `prepareEventAccountingV3`：从生效日对应的冻结开盘取得内部 accountingAt，仅选 Run 区间事件，排除只用于信号预热的事件；缺日期/开盘或晚观测时抛出 DATA_UNAVAILABLE，不在窗口末尾补记。
- 新内部时钟贯通模拟事件排序、公司行动 port 与 ledger payload；来源事实的 occurredAt/availableAt 保持原值。窗口前已记录事件在经济生效时刻入账，缺策略可见性不影响已满足记账约束的事件；事件信号仍独立拒绝缺可见性的事实。
- 依据 Spec §6 的边界，事件尚无价格式 fixed-provider-snapshot 时钟豁免：晚抓取即使早于 dataAsOf 也不能据此取得历史生效记账资格。本轮没有回填或放宽时间合同。归一化 Server 路径传递信号事实但不再投递记账事件，领域既有归一化忽略保护继续保留。
- 领域定向 16 项、Server 定向 12 项通过；领域全包 37 文件/313 项通过。Domain build、Server typecheck/build、ESLint、边界、diff check、HEAD 尺寸 ratchet 通过。日志 `/private/tmp/goal-event-accounting-domain-all.log`、`/private/tmp/goal-event-accounting-server.log`、`/private/tmp/goal-event-accounting-types.log`、`/private/tmp/goal-event-accounting-server-build.log`。
- M33-a/b 本地实现叶完成，M33 父项及 G-M2-Events 仍待真实来源和运行态证据。没有部署或 Provider 请求。下一步转向 M24 Tushare ETF raw 的单位与覆盖实现核验，同时保留 M21–M34/M3 全部范围；目标 active。

### M24-a Tushare ETF 有界 raw 读取

- 核对既有代码后确认量额换算已有实现，但 ETF 历史为单次整段请求。依据 [fund_daily 官方接口文档](https://tushare.pro/document/2?doc_id=127) 的单次 5000 行和原生单位，新增每段最多 366 日、请求预算前置校验的独立读取模块，直接接入原 ETF fetcher。
- 每段固定标的/窗口/字段，独立计入限流；拒绝错标的、跨范围、重复日期、缺列、无效数值和不合理 OHLC。数值字符串先解析，避免量额转换变成字符串重复；保留各段摘要及原生单位，明确 tradingCalendarVerified=false。
- 17 项新增与 34 项既有 Tushare HTTP/获取/限流测试共 51 项通过，2 项既有弃用警告。首次 flake8 两处缩进错误修复后复验通过；py_compile、diff check 通过。日志 `/private/tmp/goal-m24-reader.log`、`/private/tmp/goal-m24-reader-final.log`。
- M24-a 本地叶完成；M24-b 精确 V3 raw 库存、凭据修订准入、冻结日历覆盖及真实权限仍待实施/验收，M24 父项未完成。没有调用真实 Tushare 接口、没有新增准入记录或部署。下一步继续 M24-b，目标 active。

### M24-b1 精确 ETF raw 入口与分段请求预算

- 上一轮仅确认目标模式，属于无实施进展；本轮已恢复代码推进。新增职责独立的 `TushareExactDailyMixin` 并接入现有 Fetcher，仅允许精确 `tushare` 来源、CN ETF 与 `none`，要求显式窗口。
- 每次读取创建独立 HTTP client，不修改缓存客户端超时；各分段共享剩余时间预算，预算耗尽前拒绝下一次请求，最终晚到结果同样拒绝。额度耗尽直接抛出限流，不进入通用等待。权限与传输失败不重试、不切 endpoint，后段失败不返回前段部分数据。
- 原始读取的单位转换与各段指纹保留；另产生真实 pagesFetched 和完整窗口的传输证明，明确交易日覆盖尚未核验。没有将多分段写成单页。
- 新增 16 项精确入口测试，覆盖实际 HTTP client 的请求 JSON、两段传输、缓存客户端不变、量额、来源/资产/口径拒绝、缺凭据、限流不等待、耗尽预算、权限拒绝、末段超时和部分结果拒绝。连同既有回归 67 项通过，2 项既有依赖弃用警告；新增模块 flake8、两仓本轮文件 diff check 通过。日志 `/private/tmp/goal-m24-exact-final.log`。
- M24-b1 本地叶完成；M24-b2 仍需修改库存/manifest、当前来源与凭据修订及运行时/API 分段证明校验。当前 API 仍要求单页，运行时会生成单页元数据，不能直接开放 Tushare 路由。未调用真实 Provider、未写准入、未部署。M24 及全部剩余目标继续 active。

### M24-b2 分段传输证明接线

- 将 API 中的分页校验提取为独立 `thesis_ledger_market_v3_pagination.py`，保持 API 错误码/HTTP 状态映射；API 文件净缩小。Tushare ETF 使用独立日期分段协议，严格核对最多 32 段、每段最多 366 日、连续起止窗口、实际段数、整数行数、行数总和及分段摘要总指纹。原始单位、端点和 none 身份也必须匹配。
- 运行时对 Tushare 结果复核并保留其真实分段证明，不再合成单页。既有 AkShare/Tencent/HiThink 单响应语义保持；精确执行支持判断复用已存在的 route inventory，移除另一份价格口径判断，运行时文件净缩小。
- 传输完整性只证明分段响应已收齐；交易日覆盖仍由独立日历比对负责。新测试明确两行结果可取得传输证明，但其 tradingCalendarVerified 仍为 false，不能外推为价格覆盖。
- 新增 22 项证明测试，连同 V3 API、日历、准入、HiThink 股票/ETF 回归 109 项通过，5 项既有警告。新模块/测试 flake8、修改 Python 文件 py_compile、diff check 通过。日志 `/private/tmp/goal-m24-pagination-final.log`。
- 核对发现当前执行期凭据修订复核仅支持 HiThink HMAC；通用 credentialVersion 对环境 Token 更换及自定义 TUSHARE_HTTP_URL 身份尚不足。下一步应完成 Tushare 来源/凭据的安全修订绑定，再开放 gated inventory 和 manifest，并测试撤销及修订漂移。尚未新增目录条目/准入记录、没有真实请求或部署；M24-b2、M24 父项及全目标保持未完成、active。

### M24-b2 安全修订、目录及 HTTP 纵向接线完成

- 新增共用 Tushare 地址解析与独立内部凭据修订模块。HiThink 原有 HMAC 输入保持一致；Tushare 环境快照同时冻结 Token 和 HTTP 地址，HMAC 绑定两者及主密钥版本，不在公共目录、日志或 HTTP 结果输出原值和指纹。移除原 Fetcher 对自定义地址的日志回显。
- manifest 补充 ETF 日线，V3 gated inventory 仅登记 CN ETF/none；当前适配/分段协议/安全凭据修订均须匹配准入。执行使用已核验快照，读取后重新检查当前准入；Token、地址、主密钥或撤销变化拒绝晚到结果。适配器缓存以安全修订为身份，同一修订保留限流累计，变更后创建新实例。
- 使用临时 SQLite 真实准入存储与实际 HTTP client（网络响应为本地 fixture）贯通 V3 API：默认未准入拒绝，显式当前准入才可读取；错误修订不发请求，读取期间轮换/撤销拒绝结果，缺交易日即使传输完整仍返回 insufficient_coverage。公开响应仅保留来源和冻结证据。
- 214 项接线/分页/日历/准入/HiThink/Tushare 回归通过，7 项既有警告；81 项旧 V2、通用控制与凭据运行时兼容回归通过，3 项既有警告。新增模块及测试 flake8、存量修改文件关键错误 lint、py_compile 和代码 diff check 通过。日志 `/private/tmp/goal-m24-integrated-final.log`、`/private/tmp/goal-m24-compatibility-retry1.log`。
- 纵向测试先修正 fixture 参数 snake_case 映射，再修正 wire 数值断言，两次修复后通过；兼容测试发现既有 HiThink 股票与事件目录断言落后于已实现库存，同步完整断言后通过，没有放宽门禁或忽略失败。
- M24-b2 本地实现叶完成，真实门禁拆列 M24-b3，M24/M24-b 父项未关闭。宿主当前执行环境只读预检仅输出配置存在性：Tushare Token=false、自定义地址=false、准入主密钥=false。目标 Docker 既有结构阻塞仍独立存在，未发出真实 Provider 请求、未写任何目标准入、未部署。
- M3 的 R02.29/R02.30 已回填复用 M24 的唯一入口与本地实现，真实 G0-M 仍未完成，不另造平行适配。下一步转向 M25 复权因子端点/锚点/版本及消费契约，继续保留 M21–M34、M3 和全部最终验收范围；目标 active。

### M25-a 基金因子原始读取完成

- 核对 [fund_adj 官方说明](https://tushare.pro/wctapi/documents/199.md)，确认单基金、交易日与因子字段及分页参数；实现独立读取和精确 Fetcher 入口，按每段最多 366 日、默认最多 32 段请求，拒绝错标的、重复/越界日期、缺列及非正/非有限因子，不切换股票 adj_factor。
- HTTP 对该端点的 JSON 数值直接使用 Decimal，输出保留十进制文本。记录实际观测时间、分段及内容指纹，未知锚点/供应商修订/算法修订保持 null，conversionAvailable=false；空集或传输完成均不证明完整交易日覆盖，也不把因子变化变成事件。
- 将日线和因子共用的日期窗口、ETF 身份与超时/限流预算提取到 Tushare 专属模块，避免维护两套预算；日期分段同时修复接近 date.max 时加 365 天溢出的边界。既有精确日线继续使用同样的预算和来源证明。
- 25 项新测试覆盖十进制 JSON、恒定/下降因子、字段/窗口/标的失败、空集、预算不足、后段超时及精确入口拒绝；连同 raw、凭据、V3 HTTP 与分页回归共 152 项通过，6 项既有警告。flake8、py_compile、代码 diff check 通过。日志 `/private/tmp/goal-m25-factors.log`、`/private/tmp/goal-m25-factors-final.log`。
- 对转换依据进一步核对 [官方仓库 data_pro.py](https://raw.githubusercontent.com/waditu/tushare/master/tushare/pro/data_pro.py)：所读版本未提供 fund_adj 的转换实现；未把股票公式或未发布说明升格为 ETF 因子锚点依据。M25-b 精确因子合同/准入/冻结及 M32 派生仍待可靠证据和实现，M25-c 真实账号权限/覆盖未执行。未发出 Provider 请求、未开放因子 V3 路由、未部署；全目标 active。

### M26-a/b1 基金分红标准化与精确读取

- [官方 fund_div 字段说明](https://tushare.pro/document/2?doc_id=120) 的 Markdown 入口不可访问，改用官方 HTML 后取得字段。仅按明确基金代码读取，不使用公告范围裁掉窗口前公告、窗口内生效的事件；本地按除息日选窗。
- 标准化保留九类独立日期、计划进度、每份现金及调用方已核验的分红币种。仅“实施”记录产生经济事实；预案/取消保留观测。相同生效日的金额或计划状态冲突要求修订证据，拒绝静默选择。未知登记/支付日不补造，净值除权日不替代除息日，base_unit 不作为现金分母。
- 已知实施公告使用 conservative-day，并取原始公告与实施公告的较晚日期；availableAt 保留本次实际观测。缺实施公告不把初始计划当作最终事件可见性。净值基金沿用 NAV_FUND 领域类型，不隐式互换 OF 与交易所代码。
- 实际 Fetcher 接入 fund_div，复用请求时间/限流预算，JSON 金额按 Decimal 解析；保存响应内容指纹，并明确 upstreamDataRevision 未知、upstreamPaginationVerified=false。默认 2000 行是本地预算，不是历史完整性证据；超限拒绝，始终 coverage.complete=false。
- 收尾确认精确历史请求原先可自动重定向，已对 raw/因子/分红共用请求关闭重定向，并测试 307 拒绝，防止冻结地址被自动替换。既有通用客户端默认行为保持。
- 27 项标准化与 10 项读取新增测试，连同 raw、因子、凭据与 V3 回归共 123 项通过，3 项既有警告；flake8、py_compile、diff check 通过。日志 `/private/tmp/goal-m26-normalize.log`、`/private/tmp/goal-m26-reader-final.log`。
- M26-a/b1 本地叶完成，M26/M26-b 父项、M26-b2 代码映射/历史覆盖/事件 V3 准入与冻结、M26-c 真实权限/独立公告仍未完成。未调用真实 Provider、未写目标准入、未部署。下一步继续 M26-b2 的事件接线或其他不依赖真实账号的 M27–M34 工作，全目标 active。

### RQData 身份原文共享合同与消费完成

- 当前目标核实为 active，范围仍为完成全部剩余任务，每个卡点首次失败后最多重试两次；本轮完成 `M29-b2-identity-wire` 与 `M29-b2-identity-consumer`，父项 M29/M30 未关闭。
- Schemas 绑定原文、准入、ETF 代码范围、观察截点与独立分红币种；Server Market 校验原始 UTF-8 摘要和字节预算，在线选择/离线 Snapshot 共用。实际 Parquet 与全新 Store 保存读回、原文空白篡改拒绝，以及不完整覆盖拒绝冻结通过。
- 新增共享合同 23 项、Server 9 项；Schemas 最终全包 367 项，Server 相关事件/冻结/传输组合 57 项通过。构建、类型、定向 lint、模块及 workspace 依赖检查通过；文件尺寸门禁保留 13 项既有警告。Schema 构建和 lint 各首次修复重试通过。
- 官方 `sync-code.sh thesis-ledger` 完成，Server/Worker healthy 且镜像不变；每端五份运行代码摘要一致。目标探针首次使用旧路径失败，核对启动路径后第一次重试通过；受控证据接受、缺原文/篡改拒绝与单次读取均通过，无真实 Provider 或 AI 请求。
- 后续已拆为 `M29-b2-event-runtime`，继续 DSA 生产事件入口，之后再验证真实身份/币种、账号接口权限和历史覆盖。详见 [本轮证据](2026-09-27-rqdata-identity-wire-consumer.md)；此前耗尽重试预算的卡点继续保留跳过状态，全目标 active。

### RQData 生产事件接线与目标拒绝验证

- 上轮为进展：共享原文合同、Server 消费及目标运行代码已完成。本轮推进 `M29-b2-event-runtime-local`，精确 cash/split 库存接入生产身份/凭据修订/30 秒真实 spawn 接缝；读后撤销、账号轮换、策略变化和文件篡改拒绝，合并事件类型兼容。
- 新增 11 项、事件组合 33 项、相关组合 166 项通过，真实 SQLite/原文文件/HTTP 到 spawn 的受控读取通过，DSA 输出的两个 exchange 通过 Server 严格合同和原字节摘要校验。lint、编译、diff check 通过，运行时大文件减少 29 行。
- 官方 DSA 同步完成，六份源码摘要一致且 healthy，镜像不变；目标两个事件路由均不就绪，缺准入不读取 RQData 账号。目标目前无 V3 策略，实际两种能力 HTTP 均返回 422；探针首次空策略假设修复后第一次重试通过，未修改目标策略/账号/准入。
- 本地与目标拒绝子叶完成，目标正向请求拆为 `M29-b2-event-runtime-target` 并保持开放；真实身份/币种、逐接口权限及完整历史仍未通过。详见 [生产接线证据](2026-09-27-rqdata-event-runtime.md)。下一步继续未依赖这些外部前提的其他剩余任务，全目标 active。

### A02 封存请求与生命周期数据库验证

- 上轮为进展：RQData 生产接线及目标拒绝已完成。本轮转向未依赖真实账号的 A02 数据库缺口，增强既有 SDK PostgreSQL 测试，实际持久化 baseline/prior candidate 的封存收益、未来日期、事件/行情、自由诊断及未知字段，检查生产 prompt/SDK 的实收 HTTP messages。
- 专用 PostgreSQL 通过项目显式开发重建入口应用全部 19 份 migration、68 张表、当前完整 head 和独立 app role；SDK 2 项、封存访问生命周期 3 项共 5 项通过。另 22 项定向、类型检查、lint 通过，两个范围不重叠；实际负收益与固定供应商序列标签保留。
- 首次准备未设置派生 head，第一次重试碰到初始化临时就绪状态；改用项目入口和最终 TCP 就绪后第二次重试通过。三轮临时容器均已按本轮目标清理，不访问业务数据库或真实模型。
- `A02-sealed-pg` 完成；V2 受控 Run 的读取生命周期与 V3 配置模型投影分别记录，真实来源/V3 Worker、A01/S07/S08 和 G-AI 仍开放。详见 [数据库证据](2026-09-27-a02-sealed-postgres.md)。继续其他可执行剩余任务，全目标 active。

### S05 历史协议预检与目标边界

- 上轮为进展：A02 实际数据库请求/封存生命周期已补验。本轮完成 `S05-v3-preflight`，修复固定快照预检漏查真实来源观察及 Bar 可用时间的截点；保持原始时间、修订和响应，严格 PIT 身份/已知修订/锚点不放宽。
- 新增 12 项，预检 26 项包含于相关组合 87 项；类型、构建、定向 lint、边界/依赖与 diff check 通过。首次诊断类别与错误码不匹配，核对合同后第一次重试通过；大文件减少 71 行，文件门禁保留 13 项既有无基线警告。
- 官方 Server/Worker 同步成功且 healthy，镜像不变；目标每端 10 个受控生产预检场景、两份摘要匹配，不读写业务库、不创建任务或发外部请求。受控 PIT 正向结果不证明真实重建依据。
- 查明实际重建引用只有非空校验，拆出 `S05-reconstruction`；旧 Reader 的 `asOf`/窗口结束回退与冻结时钟拆出 `S05-legacy-clock`。S05、真实来源/冻结/Worker 和客户端门禁继续开放，详见 [本轮证据](2026-09-27-s05-history-preflight.md)。全目标仍 active，继续剩余工作。

### S05 旧读取时间边界与实际缓存

- 上轮为进展：V3 历史预检时间边界已完成。本轮完成 `S05-legacy-clock`，声明历史协议时必须显式提供冻结截点，固定研究使用完整验收；观察、Bar 时间及 availableAt 有效且在截点内，不改写时间或补造状态。
- 新增 22 项本地与 2 项实际数据库场景；相关 127 项及独立 PostgreSQL 应用角色 6 项共 133 项通过，类型/构建/lint/边界通过。旧 Reader 减少 2 行；原文件尺寸 13 项无基线警告保持。首次 lint 的未用变量修复后第一次重试通过。
- 首次实际数据库两项未命中缓存，查明日期日终边界与最后完整 Bar 时间戳直接比较造成拒绝；登记独立 `S03-date-cache`。冻结截点叶改用实际存储时间边界，第一次重试 6 项通过；每轮临时容器已清理，没有访问目标业务库。
- 官方同步后 Server/Worker healthy 且镜像不变，每端 11 个实际旧 Reader 受控场景、两份编译摘要通过，无外部来源/模型请求。`S05-reconstruction`、新确认的日期窗口缓存问题及原真实验收继续开放。见 [本轮证据](2026-09-27-s05-legacy-clock.md)；全目标 active，继续实施剩余任务。

### S03 日期窗口缓存覆盖修复

- 上轮为进展：旧 Reader 冻结截点修复完成，并在实际数据库中确认日期日终与最后 Bar 时间直接比较导致缓存误判。本轮完成 `S03-date-cache`，独立 Market 事实覆盖职责联合校验完整交易日、本地日终与实际完整末 Bar；不改写事实时间/覆盖，不推断未来休市或缺日。
- 新增 17 项本地与 4 项数据库场景；相关 134 项和独立 PostgreSQL 应用角色 10 项共 144 项通过，类型/构建/lint/边界/依赖通过。Reader 减少 5 行，13 项原有无基线文件警告保持；全部首次通过。
- 通过项目显式入口完整应用 19 份 migration、68 张表与当前 head，实际日期窗口由生产 Reader 从缓存命中；未知完整日期、较晚日期、矛盾/缺末行、精确时间截点仍拒绝或正确裁剪。临时容器已清理，没有访问目标业务库。
- 官方同步后 Server/Worker healthy、镜像不变，每端 14 个受控生产 repository/Reader 场景与两份摘要一致。日期缓存叶完成，I01 完整响应往返、S05 实际重建内容绑定和原真实门禁继续开放。详见 [本轮证据](2026-09-27-s03-date-cache.md)；目标 active，继续所有剩余任务。

### S05 重建合同与归档内容阶段

- 目标模式确认轮仅核对 active，没有新增实施进展；本轮重新核对 490 项脏文件、合同源码和实际日志后继续实现。保留现有未提交工作，不操作 Git 索引。
- `S05-reconstruction-contract` 完成：28 项定向包含于 Schemas 41 文件/395 项；类型/构建、Server 类型、lint/边界/依赖通过，13 项既有无基线尺寸警告保留。只输出引用绑定，不能充当 PIT 已核验；详见 [合同证据](2026-09-27-s05-reconstruction-contract.md)。
- 下一阶段分为实际只读原文/归档内容绑定与历史时点核验，生产预检和冻结接线仍开放。不重新尝试已耗尽预算的 I01、真实来源或浏览器卡点；目标保持 active。
- 本轮继续完成 `S05-reconstruction-market-content`：摘要绑定只读 UTF-8 原文，实际归档 repository 读取并重验完整内容/坐标/逐 Bar 和冻结截点；40 项新增包含于相关 104 项，类型/构建/lint/边界/依赖通过。复杂度 21 经职责提取降至门禁内；13 项既有无基线尺寸警告保留。编译 Market Provider/注入元数据通过。
- 仅输出 `archives-bound`；正向迟抓取样本没有获得历史资格。未运行实际 PostgreSQL、目标同步、真实 Provider 或浏览器；历史时点核验、预检与 Snapshot 接线仍开放，详见 [内容证据](2026-09-27-s05-reconstruction-content.md)。本轮产生代码与验证实质进展，继续完整剩余范围。

### S05 来源时钟与实际预检、冻结写入门禁

- 上轮为进展：原文与归档内容绑定完成。本轮完成来源观察时钟必要条件、生产联合预检及新 Snapshot 写入门禁；非空引用、迟观察或只有必要条件均不能取得严格 ready。真正独立历史决策窗口尚未建立，保留 `historicalDecisionWindow` 诊断，未授予 PIT 资格。
- 新增 26 项包含于相关 17 文件/214 项，类型/构建/lint/核心复杂度/边界/依赖通过，13 项既有无基线尺寸警告保留。夹具缺完整执行模型和严格可选属性错误分别在第一次重试修复；入口 7 项另行重跑通过，不重复计数。
- 官方同步后 Server/Worker healthy，镜像不变；每端 12 个受控生产预检、6 个来源时钟、1 个只读 repository 和 3 个注入/导出检查通过，8 份编译摘要一致，没有探针数据库写入或外部请求。目标没有执行 Snapshot 写入，不以元数据和健康替代真实冻结验收。
- 跨午夜收尾证据为 [9 月 28 日门禁记录](2026-09-28-s05-reconstruction-guards.md)。独立历史决策窗口、合格证据封存和旧 V3 严格快照离线重验继续开放，V2 兼容路径独立；完整剩余范围与既有耗尽卡点记录保留，目标 active。
