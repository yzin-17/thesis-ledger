# AI 超时治理：调用链核对与实施证据

对应[Task](../2026-10-25-ai-adaptive-execution.md)及[Spec](../../specs/2026-10-25-ai-adaptive-execution.md)。本文记录2026-10-27事实，不维护另一份计划。

当前结论：T16部署与反读通过，治理／部署阶段真实模型调用0。后续用户独立授权的[D43 Qwen候选1次](2026-10-27-g3-qwen-timeout-retest.md)已执行，因Cloudflare流缺少终态及完整JSON失败，本地600秒预算未耗尽；旧GLM冻结、候选未推广、正式G3未通过。下方T16记录保留部署时点事实。

## 实施前基线

三仓HEAD：主仓da002744bd317b7754832c6ac41d169bcf005e27、infra 3f661df1deb3de894755dcc66e584abb4165d014、DSA dd26571509e842ab230c393f5f339911ea98425d；暂存区均空。--untracked-files=all逐文件捕获主仓1615、infra119、DSA8470项，与D41按目录折叠的2349口径不同。摘要／待改文件原文在私有.recovery-artifacts/ai-timeout-governance-20261027/，原验收包保持。

已读全局／工作区／主仓／infra规则、Codex／RTK、文档指南及工作流参考，无额外apps／packages AGENTS。只读五服务健康；providers／settings／capabilities API200，默认openrouter/free、revision5、canCreate=false，Cloudflare／智谱停用。

## T6：实际超时清单

| 层／用途     | 来源、缺省与最终值                                            | 起点／重置                        | 取消与错误                                                        |
| ------------ | ------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------- |
| 页面观察     | TanStack Query，活动任务1.5秒轮询，无模型完成墙               | 每次读取；卸载停读取              | Query signal仅中止HTTP观察，取消另POST                            |
| V2准备       | ResearchPreparationBudget／AI_RESEARCH_PREPARATION_TIMEOUT_MS | 提交前材料准备，独立于已存执行    | RESEARCH_PREPARATION_TIMEOUT；断线可停准备，已存提交仍能找回      |
| API／HTTP    | main.ts未设模型响应墙，API-client继承传入signal               | 入站／观察                        | 未发现已存执行绑定浏览器signal                                    |
| 排队／领取   | AiRun数据库5秒轮询；lease60秒、heartbeat20秒，非BullMQ        | 提交即deadline，领取重写startedAt | 排队／执行预算混合，恢复需修正                                    |
| 研究总预算   | Schema默认300秒，创建即绝对deadline                           | 重试沿用但排队已消耗              | executor timer、adaptive signal及SDK total重复；Abort归因模糊     |
| 首输出／空闲 | 系统30秒，route/provider显式优先；冷启动退回余量              | SDK语义首输出／后续有效输出       | 原多为transport_unknown；D36／D41三项299910ms                     |
| 用途验证     | 全验证300秒，阶段各30秒，input timeout缺省120秒               | 验证与probe分别计时               | runner／service／probe重复裁剪，provider_timeout泛化              |
| 连接探测     | service缺省30秒，平台120秒；single按timeoutMs总等待           | 一次请求至完成                    | ceiling signal与SDK total并存，不是TCP/TLS时间                    |
| 目录         | input或Provider／平台timeout，fetch signal                    | 目录HTTP开始                      | 普通读取错误，本轮未访问外部目录                                  |
| 本地工具     | 默认10000ms独立signal                                         | 每工具开始                        | 未完整继承任务取消／余量，错误统一unavailable                     |
| HTTP／网关   | Node24.18.0、Undici7.28.0原生fetch，无独立连接阶段接口        | 响应头不代表连接建立              | 仅明确底层连接错误可归因；Compose未设模型代理墙，外部托管限制未知 |
| D41          | sdkInput三项299910ms，外层310000ms                            | 每次脚本启动，未重新解析          | Qwen300057ms客户端超时／网关499，不证明正式自适应已执行           |
| 自适应v1     | 每细组24小时299完整样本、512条／256组                         | 不足冷启动，截尾不收紧            | 低频难学习；不能仅调小样本数后声称P99                             |

实际安装ai7.0.107／Zod4.4.3，lock摘要e23bfc6db622a150f436884399e082352acd7357b66b8bdf37cf5a661c6fc496。SDK内部TimeoutError带阶段标签，firstChunk／chunk只由有效内容触发／重置，text／reasoning／工具语义按锁定源码与后续真实本地HTTP测试证明，不借最新版文档代验。adapter已有maxRetries0；研究恢复只对未发送／明确拒绝补领，未知不重放；其他业务Worker maxAttempts不代表研究授权。

共享／Server／路由Schema仍多处max120000。只读数据库五个AI Provider保存timeoutMs（30000／120000），无来源，阶段覆盖均未保存；不能凭等于默认认定系统意图，旧总等待保留原作用域，system阶段值由新基准解析，不改配置行。首次盘点type='AI'空集已按实际type='ai'纠正，inventory-verified.json为有效输入，没有写库。

## 证据与实施记录

T1～T4 v1历史与原109项仅对旧输入适用。D35／D36部署、D37／D38空输出、D39内部500、D40方言400、D41超时均保留原回执，不回填根因。旧Spec／Task写前内容已复制私有基线；新Spec修订旧冷启动／窗口行为，新增T7～T16，原T5仍拥有G3。

计划预检已覆盖状态契约、执行、消费与部署；独立TCP/TLS能力不足按明确边界报告，无本地Blocking问题。已执行D41包不覆盖，维护接续入口应读取统一策略与任务ID。

初始检查点仅规则／调用链核对和Spec／Task更新，未调用模型或部署；当前进展以Task为准。

## T7：统一合同与确定性解析

- 新增packages/schemas/src/ai-execution-timeout.ts，持有三档初值、稳定时钟／错误事实合同；ai-execution原研究预算块按概念提取至ai-research-policy.ts，保留原导出，默认普通预算600秒。现存完整冻结策略里的300秒不会被重写。
- ai-generation-error增加阶段错误和安全timeout／上游状态；共享与Server Provider输入、路由阶段字段改用同一有界时间Schema，允许240秒，上限沿用任务最大一天。未改Provider配置行或研究结果Schema。
- AI timeout/ai-timeout-policy.ts统一来源／缺省、用途映射、收尾预留及任务裁剪。当前连接阶段能力明确unavailable；非流式不装首片段／空闲计时。阶段期限和任务期限重合时省略重复SDK计时器。
- 验证：pnpm --filter @thesis-ledger/schemas build通过；pnpm --dir apps/server exec vitest run test/ai/ai-timeout-policy.test.ts，1文件／11项通过。范围为纯策略、时钟合同、共享／Server 240秒输入；不代收SDK实际流、前端或整体Server类型检查。
- 本批无真实模型请求、无部署，T8开始持久化时钟；完整时序归因与消费仍由后续叶负责。

## T8：首次领取与恢复时钟

- 新增AI timeout/ai-execution-clock.ts与ai-run-claim.ts。后者用既有AiRun行锁事务，在status／executionAttempt条件下同时提交首次时钟、startedAt、lease和新attempt；原startedAt不再被恢复领取覆盖。
- V1／V2提交只冻结有限queueExpiresAt及执行策略，deadlineAt为null，首次领取才开始执行预算。已有deadline优先、未知历史首次时间／预算失败关闭；过期排队同事务失败，不创建新attempt或Provider请求。现有恢复保留元数据，再领取仍读原deadline。
- loadAiResearchPolicy按明确推理档位提供600／1200秒缺省，环境里明确maxDurationSeconds保持；没有改目标环境、配置行、Prompt、研究结果或业务数据。
- 验证：Schema build通过；Server定向ai-execution-clock、ai-timeout-policy、ai-research-submission、research-submission-v2共4文件／37项通过。覆盖恢复、不延期、排队过期、重复领取、legacy deadline和显式旧300秒预算。事务接缝使用mock；真实PostgreSQL竞争／晚到提交仍为T15必要门禁。
- 无真实模型／部署。下一T9归因，T10将任务执行截止和收尾预留接入实际执行signal；当前不把源码时钟交付当成目标已生效。

## T9：SDK计时与明确首因

- 新增timeout/ai-timeout-scope.ts，应用只拥有任务／工具期限；先建立AiExecutionTimeoutError时序事实，再向下abort。父期限相同的工具不重复安装timer，close清理timer与监听器；租约丢失与用户取消分开。
- 新增ai-generation-timing.ts，只存时间／进展类型。adapter复用SDK首输出／空闲，使用单调时钟统计，第一条SDK错误保留；reasoning／正文／有效工具输入进入观测。首次上游错误不再被随后input.signal.aborted覆盖；已观察有效输出时不再将拒绝误判为生成前可重试。
- facts沿有界cause链保留HTTP状态，区分408／504的upstream_timeout及请求错误；连接UND_ERR_CONNECT_TIMEOUT只能证明阶段类型，未知连接起点／时长／阈值为null，未捏造15秒已生效。trace增加策略与身份字段，不增加正文／reasoning日志。
- 验证：6项归因／清理假时钟、7项真实本地HTTP、原20项SDK HTTP与1项边界，共34项通过。新增HTTP证明心跳不判活、持续reasoning、正文停顿、持续输出到任务预算、非流式慢完成及显式完成覆盖、上游504与单次请求；timeout后服务端确认响应close。
- Server typecheck初次仅报新增时钟测试mock.calls[0]可能undefined，修正可空访问后通过。没有放宽生产类型、计时门禁或既有断言。Schema因增加安全时序合同重新build通过。
- 本批为锁定SDK与本地HTTP证据，不包含真实模型或部署。T10尚需把新scope实际接入所有入口；T13补影子样本，T15负责完整集成。

T10执行前按独立交付面拆成T10a正式研究、T10b探针／目录、T10c用途验证。拆分仅明确原AE义务的所有者，未改变预算、验收或总体范围；不新增平行任务体系。

继续接线前核对到completeAndSettle只检查状态／attempt／租约，未在锁内判断迟到发布；这是AE9原有义务的未覆盖部分。T8改为T8a已验证时钟、T8b发布门禁，未用领取mock宣称迟到结果已验。先补T8b，再回T10a。

## T8b：原子发布时限

- 新增ai-execution-publication.ts，替换completeAndSettle原无条件成功赋值。锁内使用当前时间验证有效租约，不再信任调用方较早completedAt作为所有权检查时间；单独判断生成接收时间是否在执行截止前、发布是否在整项预算内。
- 按时接收允许使用5秒收尾预留；迟到结果或过期发布变为明确failed／research_task_budget_exhausted，不写成功result。生成完成、原outcome和已知usage／cost照实结算，预算失败不伪造Provider未完成或费用0。
- 验证：ai-execution-publication.test.ts 5项通过，含收尾内发布、迟到、锁等待超总期、缺失deadline失败关闭、纯事实结算不被改写。Server typecheck通过。数据库并发／用户取消竞争仍属T15；T10a须传入实际receivedAt。

## T10a：正式研究接线

- research生命周期使用冻结deadline和统一scope，SDK请求按同一解析器裁剪；重试新建子signal，沿用原时钟和账本。授权事务在当前时间与收尾边界下检查，不向超期请求授予派发；预留后未发送保留not_sent事实。
- 结果接收立即记录receivedAt，按时接收可收尾；迟到的完整Provider结果保留已知用量与完成事实，不能成为研究成功。SDK包装字符串取消原因的集成差异已补因果链识别与回归。
- 验证：失败账本3、生命周期4、研究HTTP集成13、executor13，共33项通过；Server typecheck通过。未执行真实Provider、部署或真实PostgreSQL竞争。

## T10b传输核对

Node24.18内置Undici7.28源码的Client响应头／正文默认均为300000毫秒。原生fetch派发未覆盖此值，故非流式20分钟任务可能被隐含5分钟截断。采用已安装且Node24兼容的undici7.29.0作为直接依赖，只通过公共getGlobalDispatcher在AI请求的dispatch参数里关闭重复headers/body计时；保留原fetch、代理及连接池，由现有SDK阶段和统一任务signal负责。独立TCP/TLS仍无法观测，不冒称15秒连接限制已执行。依赖变化要求T16完整update，不能sync-code。

- pnpm离线add触发无关可选包安装，卡在unrs安装脚本；已终止本轮进程，以写前快照恢复此次非目标lock变化，仅保留Server importer三行undici7.29.0及manifest精确版本。原lock WIP保留；未清理缓存或改全局安装。下一pnpm检查完成供给链验证和本地链接后Server typecheck通过。

## T10b／T10c／T11本地结果

- 连接探针与目录复用60秒策略；旧timeoutMs仍是非流式完成覆盖，流式用途采用明确推理档位，去除独立300秒墙。目录分页共享同一个signal；读取保存的旧完成覆盖，不注入系统数值伪装显式配置。
- 用途验证计划与执行共享600／1200秒总预算及5秒收尾，单次请求按目标档位解析首输出／空闲；验证各调用共用原截止。格式试验仍受原显式计划次数授权，不增加SDK重试或自动启用。
- 本地工具使用20秒、显式覆盖、任务余量裁剪；父signal传到底层。对不合作操作在请求取消后收敛观察，迟到结果被拒绝，并记录stopConfirmed=false，未声称停止了数据库查询或上游计算。
- 验证：ai-tool-timeout／ai-policy-fetch／ai-probe-timeout-policy／ai-provider-verified-save／ai-provider-validation-lifecycle.integration／ai-provider-model-catalog／ai-provider-catalog-configuration共7文件67项通过；既有research-executor13项通过。模型调用0，部署未执行。

## T12／T13：消费与影子观测

- 高级表单复用共享duration校验，240秒可通过，缺省留空；旧timeoutMs文案明确为非流式完成等待。详情展示冻结档位、最长执行及排队／执行时钟，阶段／上游／取消中文可区分。现有TanStack Query退出仅停止观察、显式cancel独立，16项原展示／提交测试复用通过，新增240秒输入2项通过。
- 研究派发前将统一解析的安全decision写入原请求元数据，锁内检查运行状态／attempt／有效租约／截止及dispatching；API projection返回安全来源／覆盖／裁剪，不暴露凭据或正文。Schema build通过，研究HTTP／生命周期／读取三文件20项通过；真实行锁竞争留T15。
- 影子观测版本ai-adaptive-v2-shadow，14天、512条、256组，缓存命名空间v2隔离旧规则；按时间剪除过期样本，移除输入长度细分。模型、路由、传输、推理、用途仍隔离。JSON失败保留完整阶段，完成耗时与工具耗时分开，截尾不是精确完成值。
- 历史只给可解释候选和最大观测值，不估计小样本P99，不改变确定性执行阈值，不自动增长总预算。重试仍受原账本、至多2次和确定拒绝约束，历史不能把合理基准缩短以赠送调用。
- 最终核对补齐实际模型别名场景：完整阶段不因响应模型与请求别名不同而丢弃，改存实际模型的隔离摘要分组；不会混入请求固定模型的历史。新增回归后五文件35项通过，仍为影子模式。
- 策略／历史／阶段／执行／trace五文件34项通过；原SDK trace反读证明影子字段不进入上游JSON。infra Redis合同入口同步v2命名空间，真实隔离Redis验证留T15。

## T14：只读维护入口

- 新增ai-run-observer.cli.ts及纯观察器，从正式GET ai/runs/:id反读原clock。排队时读queueExpiresAt，运行时读实际taskDeadlineAt（含收尾），领取后自然切换，不给后台新预算；没有时钟不推算新时限。CLI只允许GET，SIGINT或读取失败输出pending和runId，不调用业务取消。单次GET的10秒是观察读取等待，非模型或任务上限。
- 运行：node dist/src/ai/ai-run-observer.cli.js <run-id> <api-base-url>；需要鉴权时从THESIS_LEDGER_OBSERVER_TOKEN读取，不输出凭据。D41原已执行脚本、输入、hash和结果原样保留，新维护不复制299910／310000。
- 既有research-experiment-driver仅允许controlled-offline端点，保留其显式实验协议预算，改用统一scope／非流式完成解析；跨阶段共用截止。毫秒缩尺夹具显式cleanupReserveMs=0，真实维护缺省5秒。
- 验证：只读观察4、原离线实验21、阶段观测4、执行10，共39项通过；Server typecheck通过。观察停止不代替任务持久化终态，G3仍未运行。

## T15a／T15c：最终源码回归与职责复核

- Server完整包：`env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY -u OPENROUTER_API_KEY -u CLOUDFLARE_API_KEY DATABASE_URL=postgresql://fixture_owner:fixture@127.0.0.1:1/unavailable_fixture pnpm --dir apps/server exec vitest run`，437文件／3573项通过，69文件／359项跳过；跳过项不计通过。指定不可达夹具数据库，实际PostgreSQL另由隔离入口验证。
- Schema完整117文件／1353项通过，后续未改变输入，复用原结果。Desktop受影响的Provider配置／目录／保存／研究观察／事实显示共10文件／79项通过；Server与Desktop typecheck、build均通过。
- 仓库lint通过9组／2729文件；复杂度检查通过8组／2721文件。边界、8包依赖、17979文件密钥扫描、文件尺寸和migration matrix通过；仍为36个migration、84个SQL表、68个Prisma model、16个raw-owned表，head不变。
- 复杂度逐一对照写前版本：流语义处理归入ai-sdk-stream-lifecycle，探针可选覆盖与来源归入ai-provider-probe-timeout，晚到完成事实归入ai-research-arrival，观察器验证身份／状态，前端高级字段与期限显示分别由AiProviderTimeoutFields／ai-timeout-display持有。没有新增超过20的函数；原显示函数复杂度42、表单21保持，原Provider service减少8行，原大测试行数保持。未提高阈值或新增忽略。
- 探针不再用缺省数值伪装Provider／route显式覆盖；缺省仍由统一策略解析。完整响应因任务耗尽／取消被拒绝发布时，研究和探针都保留已知完成／用量。新增晚到探针及研究事实测试后，两文件11项通过，完整Server包包含它们。
- 本轮105个文件逐行格式复核通过。7个原文件仍有既有格式差异，确认均未与本轮改动行相交，不为格式化覆盖WIP。独立release安装包检查缺少DMG，属于未构建安装包的产物条件，本次Server部署不以此冒充桌面发行验收。
- 全部为本地／隔离证据，不包含真实模型。正式部署尚未执行；D41候选和冻结调用条件保持，不能由本地回归推断G3成功。

## T15b：隔离状态与恢复验收

- infra新增维护入口`node scripts/verify-ai-timeout-postgres.mjs --run`及计划单测，复用本地精确镜像ID；UUID所有权标签、localhost随机端口、只读根及tmpfs数据库，不挂载目标卷或加入目标网络。失败保留自有夹具并输出同入口恢复／清理命令，成功核对所有权后清理。
- 最终源码15文件／79项通过，包含原AI执行／Provider并发、真实行锁、首次领取／重领时钟、240秒安全决策持久化反读、取消后的快照拒写、按时接收但超预算发布的已知完成／用量保留，以及独立进程恢复。36个migration按目录全部应用，预期表及head=`20261023010000_report_metadata_snapshots`一致；targetMutated=false、cleaned=true。
- 既有`node scripts/verify-ai-adaptive-cache.mjs`隔离双客户端合同通过：原子额度、去重、TTL、阶段观察、配置容量、损坏／宕机失败关闭；使用v2命名空间。自有容器已移除，targetWrites=0、modelCalls=0。后续职责拆分未改变其构建输入，复用该证据。
- 两个维护入口／计划单测共4项通过；只使用维护入口进行Docker变更。隔离结果不替代目标Server／Worker部署和真实G3。
- 部署前只读记录35张业务／配置表的行数及摘要、结构head、五服务镜像／健康及安全配置摘要；当时活动AI与回测任务均为0。正式部署后须反读比较，不能仅凭容器健康宣称数据保留。

## T16首次尝试：磁盘满（历史）

- infra `node scripts/check-compatibility.mjs`退出0：ThesisLedger0.1.0、DSA fork v3.28.0-thesisledger.1、Data／Control合同3、runtime profile一致。undici直接依赖属于运行时manifest变化，选择完整`./scripts/update.sh thesis-ledger`，没有使用sync-code或直接build／up／cp。
- 最后一次部署前读取：35张受保护表的行数／摘要与原基线完全一致，activeAiRuns=0、activeBacktests=0，五服务健康；原配置摘要保持。三仓原1615／119／8470个文件逐项摘要复核，没有未解释变化，HEAD及空暂存区保持，DSA无改动。
- 第一次正式入口在ps权限预检退出1，未取得更新锁或修改Docker；允许读取进程后重跑同入口，进入本地基础镜像和锁定依赖安装。入口已固定原Server／Worker回滚镜像，未报告新应用镜像构建完成或业务服务切换。
- 北京时间2026-10-27 04:54:54，Docker backend明确记录写入`Data/log/vm/init.log`失败：`no space left on device`。Docker报“disk is full”及“unable to start”；只读API随后不可用，宿主可用约2.1GiB。该错误来自Docker运行环境，不是模型请求或AI超时判定。
- 发现明确异常后对本轮正式入口发送中断，退出130；未自行删除文件／卷、重启Docker、手工替换容器或另开构建。新镜像、Server／Worker实际模块、Schema、capabilities和部署后35表反读均未取得，T16保持未通过。部署前摘要不能冒充部署后数据保护验收。
- 预备只读`runtime-check.mjs`位于本轮私有目录，待Docker恢复后比较宿主与双角色实际JS清单、SDK／undici／Schema路径及版本、三档策略和capabilities；未执行的反读不记成功。

## G3接续边界

- 本轮真实模型请求0。原D41候选源码、输入、trace和结果保留；没有将2020-12候选推广，也未发送冻结的GLM调用，未改默认Provider、模型、reasoning、输出合同、业务校验或V2配置。
- T16现已通过，第一未通过层回到T5真实G3。D41同模型／格式／冻结输入与正式路由前置仍需满足；不重复运行输入未变的已通过证据。
- T5仍要求同模型／路由／用途／冻结输入从正式创建到持久化终态。D41当前Qwen候选未满足双模型推广条件，应用原方言仍有已知兼容缺口，不能为通过G3更换模型或改变输出格式。明确模型调用次数／费用和正式路由就绪后才复测，失败保存阶段证据并停止，冻结额度不自动解冻。

## T16恢复接续（2026-10-27）

- 用户确认空间修复后，只读检查宿主约20GiB可用，原三仓HEAD／空暂存区／WIP无新增变化。Docker daemon尚未启动，经infra维护入口`bash scripts/docker-desktop.sh start`退出0；五个原容器均为故障退出255，ID／镜像／安全配置摘要及原数据卷保持。PostgreSQL未运行时无法提前读取表摘要，未绕过入口直接启动容器。
- 兼容性预检再次通过。执行目录为`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`，目标仅thesis-ledger。首次正式入口因提权PATH找不到Node退出1；确认绝对路径Node24.18.0可用后，仅本次命令加入`/Users/yzin/.volta/bin`，通过`rtk proxy env PATH="/Users/yzin/.volta/bin:$PATH" ./scripts/update.sh thesis-ledger`完成，退出0。没有改环境文件或绕过ps／空间／兼容性／数据库门禁。
- 新镜像`sha256:3fd6cbdb7fb0cd320b905a8737368a585aa8c1a746fccecd70a542ce265fffb2`已固化本轮代码，Server／Worker同镜像且健康；PostgreSQL／Redis为原容器恢复，DSA经入口恢复为新容器、镜像保持，data／reports／logs三个原卷逐项一致。入口最终实测宿主16270MiB、Docker25074MiB可用，参考目标未达时未重建或阻断健康服务。
- 双角色各1281份Server、191份Schema、76份domain、1份shared JS与当前编译输入SHA256逐项一致；实际Schema位于`/app/node_modules/.pnpm/@thesis-ledger+schemas@file+packages+schemas/node_modules/@thesis-ledger/schemas/dist/index.js`。运行Node24.21.0，SDK7.0.107，undici7.29.0，策略版本ai-timeout-v2；三档预算60／600／1200秒、首输出30／120／240秒、空闲20／60／90秒和5秒收尾均正确，独立连接能力仍准确返回unavailable。
- 只读核对脚本最初错误假设Server局部node_modules及`/app/packages`路径，已改用Node实际模块解析；宿主另有11份已不属于tsconfig编译输入的旧输出，原文件保留，以TypeScript官方输出清单核对而非新增忽略。刷新4份宿主过期AI编译缓存并强制重建共享包后，完整Schema117文件／1353项、Server437文件／3573项（69文件／359项跳过）及Desktop10文件／79项再次通过。生产源码无新增修改，没有重复镜像构建。
- `/api/v1/ai/runs/capabilities`与`/api/v1/research/capabilities`均200；后者canCreate=false。默认研究仍revision5／openrouter/free，Cloudflare与智谱停用，模型目录保持。Server／Worker启动后日志未发现ERROR／FATAL、缺模块或P2021／P2022缺表／字段错误。
- 35张表的保护比较：34表完整摘要与原基线相同；PortfolioSnapshot原9行摘要`6c0d75e0df642c874ba333c373fba426`完全保持，当前12行。新增3行源于既有snapshot-close-estimate调度，AutomationRun在北京时间16:06:20成功完成并输出3份快照，capturedAt均16:00、source=DAILY_CLOSE；没有清理或回写这些业务数据。结构head与配置摘要保持，活动AI／回测均0。
- 本轮真实模型调用0，V2配置和D41候选保持，冻结GLM调用未消费。当前T16通过，T5真实G3仍未执行；不会将包级、健康或模块一致性替代正式模型与研究结果验收。私有续验回执、运行态及数据保护证明保存在本轮恢复目录。

补充保全与依赖验收：D41原9份来源文件摘要未变，10份trace产物通过现有AiTraceFileStore完整性反读，captureStatus仍为incomplete、原超时失败保持；GLM计划仍frozen_after_qwen_failure、used=0／remaining=1。共享包刷新后，隔离PostgreSQL15文件／79项与Redis合同再次通过，自有夹具清理、目标写入0。三仓原10204项文件复核无未解释变化，HEAD／空暂存区保持，DSA源码无变化；私有`resume-receipt.json`汇总本次实际证据，原失败回执保留。
