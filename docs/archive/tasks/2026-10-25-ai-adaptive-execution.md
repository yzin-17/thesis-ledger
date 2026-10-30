# AI 超时与重试治理实施任务

> 状态：2026-10-30完成现行Spec阶段并归档；以下各时点状态和证据保留为历史。影子估计不自动应用，其他模型／方言／权限由活动责任Task管理。

> 当前G3检查点（2026-10-29 D59）：OpenRouter/free正式单次通过，实际Nvidia／Nemotron3.5免费模型；2条断言／5条数字／11条真实引用、完整trace及重建反读通过。V2保持开启、默认与配置保持；原新闻准入仅按新授权续至23:31:34。见[复测回执](../../tasks/evidence/2026-10-29-g3-openrouter-formal-retest.md)。

> 当前运行状态（2026-10-29 22:05）：按用户新授权开启V2，`canCreate=true`；本地运行配置已持久保存。默认仍为OpenRouter/free，Cloudflare保持停用。本轮模型调用0，原配置／业务记录和WIP保持。见[开关生效回执](../../tasks/evidence/2026-10-29-g3-formal-acceptance.md#v2-enable)。

对应[Spec](../../specs/2026-10-25-ai-adaptive-execution.md)，任务标识沿用ai-adaptive-execution。

> 2026-10-29 D58接续：当前获准Qwen正式路径已完成真实报告、原数值／范围、11条实际引用和Web／历史验收；完整trace与网关正文一致，原开关／配置已恢复，V2关闭、双角色重建反读、WIP保护及一致性Review通过，本轮叶收口。D41双模型推广与历史因果义务不代收，GLM冻结。见[正式回执](../../tasks/evidence/2026-10-29-g3-formal-acceptance.md)。
> 当前边界：零付费、同Cloudflare/Qwen、关闭reasoning、不加token上限；按明确证据继续尝试，每次失败收敛后再选下一步。仅为本次正式验收临时变更开关／配置，结束恢复并保留报告；保护旧数据、旧GLM冻结额度和WIP，不stage或commit。
> [核对与实施证据](../../tasks/evidence/2026-10-27-ai-timeout-governance.md)。T1～T4为v1历史交付，原部署与D37～D41证据保持，不代收本轮义务。

## 当前执行摘要

T6～T16工程证据保留；D58新增当前Qwen正式G3正向、结果／引用／历史／trace及关闭重建验收，运行态为最新1654b11a…双角色。T5正向及D60浏览器／最终Review通过，当前Spec阶段全部完成；D41候选和历史未知边界独立保留。

## 历史交付与正式G3

- [x] T1：v1纯策略历史交付；[原回执](../../tasks/evidence/2026-10-25-ai-adaptive-execution.md)，新增修正由T7／T13承担。
- [x] T2：v1缓存历史交付；原子合同与安全入口复用，新窗口／影子语义由T13承担。
- [x] T3：v1研究SDK／trace历史接线；新时钟与归因义务由T8～T11承担。
- [x] T4：v1本地集成历史交付；原109项仅对原输入适用，本轮回归T15。
- [x] T5：正式真实Provider正向；D58／D59与D60补齐原G3成功报告及Web消费。
  - [x] T5.G3-D59：用户新增授权复测OpenRouter/free正式路径，保留原时钟／模式／请求参数，1次零费用、失败即停；不改变旧实验和GLM冻结。见[复测回执](../../tasks/evidence/2026-10-29-g3-openrouter-formal-retest.md)。
  - [x] T5.G3-D58：当前Cloudflare/Qwen／JSON Mode正式路径、原校验／引用／历史、关闭重建、WIP保护及最终Review通过，报告和失败审计保留；不代收D41双模型推广。
  - 覆盖AE7及实际模型边界；依赖T15／T16、同模型／路由／用途／冻结输入就绪和明确次数／费用。D41推广和GLM冻结由研究Task独立保留，不作为当前治理阶段的推广要求。
  - 入口：正式创建→领取→账本预留／派发→持久化终态→结果／引用／历史读取；写集仅获准的受控任务及证据，不改默认配置制造成功。
  - 验证：阶段事实、用量未知、原表／配置／WIP、失败停止及关闭恢复。失败保持未勾选，阻塞留本叶。
  - 历史实验及旧冻结边界见[历史记录](../../tasks/evidence/2026-10-30-ai-timeout-governance-history.md)；D41候选由研究Task持有，不在此任务激活。

## 状态与契约

- [x] T6：实际调用链与冲突清单。
  - 覆盖AE1／AE7／AE8／AE11／AE15／AE17；只读源码、锁定包、目标非敏感配置与D41。
  - 结果：数据库轮询、提交即deadline／领取改startedAt、工具独立signal、原生SDK计时、重复策略、120秒Schema、299门槛及页面观察边界已核对，见记录。
- [x] T7：统一合同与确定性策略。
  - 覆盖AE10～AE12／AE15／AE16；依赖T6。
  - 输入：Spec初值／兼容规则、ai-execution、provider-management、AI contracts／readiness／config。
  - 写集：timeout／clock／error共享合同、AI纯解析器和定向测试，相关240秒输入读取；不改业务结果、凭据、配置行或lock。
  - 完成：三档、来源／legacy作用域、非流式、裁剪及连接能力边界独立可测，原接口可读。
  - 结果：Schema build及11项定向通过，240秒共享／Server输入通过；前端实际消费及完整读取由T12／T15验证。

### T8：持久化时间与终态

- [x] T8a：首次领取持久化时钟。
  - 覆盖AE1／AE8／AE9；依赖T7。
  - 输入：V1／V2提交、AiRun领取／恢复、已有执行元数据／锁及所有权测试。
  - 写集：AI时钟持久化helper、相邻提交／领取／恢复接线及状态测试；不改数据库结构。
  - 完成：原子首次时钟、有限排队、重领不延期、旧deadline优先及受控领取状态集成；晚到提交门禁由T8b负责。
  - 结果：10项时钟／事务接缝及原V1／V2提交测试通过，共37项；行锁并发和真实数据库终态门禁留在T15，不以mock事务代验。
- [x] T8b：行锁内的迟到结果发布门禁。
  - 覆盖AE9；依赖T7／T8a。
  - 输入：AiExecutionStateStore.completeAndSettle、既有activeOwner与冻结时钟。
  - 写集：AI发布决策helper、既有终态事务及定向边界测试；不改变已知Provider完成／用量／结算事实。
  - 完成：收到时间晚于执行截止或发布超过整项deadline时拒绝成功；按时收到可使用收尾预留。状态／attempt／有效租约依旧原子保护，真实PostgreSQL竞态由T15复核。
  - 结果：5项发布边界和Server typecheck通过；已接入completeAndSettle，实际Provider收到时间由T10a传入，真实数据库竞争由T15证明。

## 执行面

- [x] T9：SDK阶段计时与首因。
  - 覆盖AE9／AE13／AE15／AE16；依赖T7。
  - 输入：锁定SDK7.0.107、adapter／facts／trace及现有HTTP夹具。
  - 写集：单次SDK请求、归因helper和有界时序事实、假时钟／真实本地HTTP测试；不复制SDK阶段计时器。
  - 完成：心跳／reasoning／停顿／总预算／上游／取消分别归因，首因与资源清理通过，SDK不重试。
  - 结果：新增6项归因、7项真实本地HTTP，既有20项HTTP及1项SDK边界通过，共34项；Server typecheck通过。实际模型／G3未执行。

### T10：调用入口收敛

- [x] T10a：正式研究任务期限与单次请求接线。
  - 覆盖AE1／AE4／AE5／AE9／AE13／AE15／AE16；依赖T7／T8／T9。
  - 输入：executor生命周期、research-sdk-execution／contract、adaptive generate／retry及已有SDK研究集成。
  - 写集：AI研究生命周期helper与上述相邻接线／定向测试，不改模型／内容／输出格式／额度。
  - 完成：执行截止包含收尾预留，单一任务timer，每次attempt新子signal；统一阶段解析、原deadline／账本不重置、首因准确、已输出／未知／预算不足不重试。
  - 结果：失败账本／生命周期／既有研究HTTP／executor四文件33项通过，Server typecheck通过；授权跨执行截止不会发送，已知完成的迟到用量保留，真实数据库竞争留T15。
- [x] T10b：连接探针与目录共用策略。
  - 覆盖AE10／AE11／AE14～AE16；依赖T7／T9。
  - 输入：provider-connection-test、provider.service探针参数、model-catalog-query及原HTTP夹具。
  - 写集：上述入口／小型策略桥接及定向测试，不改变目录协议、模型和已保存配置。
  - 完成：连接探测60秒预算、非流式旧timeoutMs作用域保留、流式用途使用目标档位、同源来源／裁剪及准确取消，无独立300秒墙。
- [x] T10c：用途验证计划与执行使用同一预算。
  - 覆盖AE10～AE12／AE15／AE16；依赖T7／T9／T10b。
  - 输入：validation-policy、save.service、validation-runner及验证计划／指纹测试。
  - 写集：用途验证编排／策略／指纹与定向测试，不增加已授权验证调用数或自动启用用途。
  - 完成：计划显示与实际档位／deadline一致，无300秒隐藏兜底；全验证共享期限，240秒覆盖不被裁断，SDK／应用不叠加重试。
- [x] T11：工具余量与取消。
  - 覆盖AE9／AE14／AE16；依赖T7／T8／T9。
  - 写集：tool-runtime、证据收集和工具测试；不新增模型工具编排。
  - 完成：20秒基准／覆盖／余量、父取消到底层、tool_timeout独立、非合作取消边界准确，本地工具不误报模型空闲。
  - 结果：探针／用途／目录／HTTP dispatcher／工具七文件67项通过，既有executor13项通过。工具取消传递、迟到成功拒绝及监听清理已验证；Prisma等不支持取消的操作只报告请求取消，不能证明外部停止。

## 消费与观测

- [x] T12：页面预算与观察边界。
  - 覆盖AE12／AE16／AE17；依赖T7／T8／T9。
  - 写集：执行读取DTO、Desktop AI／Provider高级字段和既有Query／测试，遵守组件规则，不新建研究模式。
  - 完成：档位／最长时间可见、240秒贯通、缺省不伪装显式；退出只停观察，显式取消独立，中文错误可区分。
  - 结果：前端240秒输入2项、原事实展示／提交观察16项、Server研究HTTP／生命周期／读取20项通过。派发前安全决策快照另在行锁下持久化；真实数据库竞争由T15验证。
- [x] T13：有界影子自适应。
  - 覆盖AE2／AE3／AE6；依赖T7／T9。
  - 写集：adaptive policy／observation／history／测试，必要时同步infra缓存合同脚本，不改目标Redis配置。
  - 完成：14天／512条／256组、新版本隔离、阶段完整与业务成功解耦、截尾保留；未证实估计不应用、不依赖299样本。
  - 结果：策略／历史／阶段／执行／trace五文件34项通过。版本ai-adaptive-v2-shadow，Redis命名空间v2；首输出／间隔／完成／工具观测分别保留。真实Redis合同由T15执行。
- [x] T14：维护诊断读取实际时钟。
  - 覆盖AE11／AE16／AE17；依赖T7／T8／T9。
  - 输入：D41已执行包、既有诊断／实验入口与查询API。
  - 写集：仓库维护观察CLI／策略桥接／测试和D41接续说明，原验收hash不覆盖。
  - 完成：新入口无299910／310000固定调用墙，实际策略同源；观察超时保留ID、不取消或伪造Provider失败。
  - 结果：只读observer4项、原受控离线实验21项、阶段／执行14项共39项通过，Server typecheck通过。维护入口为node dist/src/ai/ai-run-observer.cli.js <run-id> <api-base-url>，读取原任务clock；离线实验显式预算也复用解析器。D41已执行包未改。

## 本地集成与部署

### T15：统一集成本地门禁

- [x] T15a：受影响包回归与构建。
  - 覆盖AE4～AE9／AE12～AE17的本地断言；依赖T7～T14。
  - 写集：必要集成／夹具、边界门禁与证据，不放宽guardrail或全仓格式化。
  - 验证：完整时序定向→受影响Schema／Server／Desktop测试、typecheck／build→边界／lint／尺寸／依赖／密钥／文档。只在输入变化时重验。
  - 完成：附件场景逐项有证据，API持久化／观察闭环；不代收部署和真实G3。
  - 结果：Server 437文件／3573项通过，69文件／359项跳过且不计通过；Schema 117文件／1353项不变输入复用；Desktop受影响10文件／79项通过。Server与Desktop typecheck／build通过。
- [x] T15b：隔离PostgreSQL／Redis状态验收。
  - 覆盖AE8／AE9／AE12／AE17；依赖T15a定向与类型检查。写集为真实行锁／接收／发布／恢复／240秒测试、infra维护隔离入口及其计划单测。
  - 入口只复用本地完整镜像ID，新UUID标签、localhost随机端口、tmpfs数据库，不连接目标数据库、不挂载目标卷。失败可保留自有fixture并由同一入口继续或清理，不重建镜像；先核对所有权再删除。
  - 完成：全部migration输入／结构head和隔离身份通过，真实事务竞争与缓存期限／容量证明；不代收目标部署。
  - 结果：infra维护入口最终15文件／79项PostgreSQL通过，36个migration及表清单／head通过，独立进程恢复包含在内；隔离Redis双客户端、原子额度／去重／TTL／观测／配置及故障关闭通过。自有容器已清理，目标写入0、模型调用0。
- [x] T15c：仓库边界、格式与复杂度门禁。
  - 依赖T15a源码稳定；写集仅必要职责修复与已有门禁一致性，不增加ignore或阈值。保持已有WIP，分别记录通过或具体阻断。
  - 结果：lint 9组／2729文件、复杂度8组／2721文件、边界／依赖／密钥／migration matrix通过；超标存量按写前快照复核未增长。105个本轮文件的改动行格式通过，7个文件其余历史格式差异保留。
- [x] T16：正式部署与反读。
  - 覆盖AE6／AE7／AE9／AE17目标义务；依赖T15与兼容预检。
  - 入口：infra最小thesis-ledger，兼容则sync-code，否则update，禁止绕门禁。
  - 完成：入口／参数／退出、Server／Worker／实际Schema／capabilities证据、原数据／配置／WIP保护；区分快更与镜像。真实G3仍由T5负责。
  - 历史：首次ps权限预检退出1，允许进程查询后同入口构建遇宿主磁盘满，中止退出130；失败事实保留，未改用sync绕过。
  - 接续通过：经`bash scripts/docker-desktop.sh start`恢复Docker，原五容器身份／镜像／配置与挂载保留；正式更新首轮因PATH缺Node退出1，为本次命令加入已验证Volta路径后，`update.sh thesis-ledger`退出0，新镜像3fd6cbdb…，五服务健康。
  - 模块／消费：双角色各1281份Server、191份实际Schema、76份domain、1份shared JS与当前编译输入摘要一致；实际Schema从pnpm包路径解析，SDK7.0.107／undici7.29.0／ai-timeout-v2和三档初值正确。两个capabilities均200，V2 canCreate=false，默认修订5及Provider配置保持。
  - 保全：34表完整摘要未变；PortfolioSnapshot原9行摘要未变，原snapshot-close-estimate日终调度成功新增3行，不做回写删除。结构head／配置摘要、DSA镜像与三个原数据卷保持，活动AI／回测均0。宿主编译缓存刷新后Schema1353／Server3573／Desktop79回归再次通过，无新增生产源码修改或镜像构建。

## 验收映射

| 断言          | 实现／本地责任    | 必要门禁               |
| ------------- | ----------------- | ---------------------- |
| AE1／AE8／AE9 | T7／T8／T10／T11  | T15状态集成、T16       |
| AE10～AE12    | T7／T10／T12／T14 | T15贯通、T16           |
| AE13～AE16    | T9／T10／T11／T12 | T15真实SDK本地HTTP、T5 |
| AE2／AE3／AE6 | T13及T9观测       | T15缓存、T16           |
| AE4／AE5      | T9／T10及请求账本 | T15恢复集成、T5        |
| AE7／AE17     | T12／T14／T15     | T16、T5                |

## 最终一致性 Review

- [x] AE1～AE17均有明确实现和匹配证据：T7／T8／T10a／T11持有时钟与持久化；T9／T10b-c持有SDK及探针／用途；T12／T13持有预算、重试和影子缓存；T14持有观察／取消；T15与T16持有本地、隔离数据库／Redis及正式部署。
- [x] 原最后正向门禁T5已由D58 Cloudflare/Qwen、D59 OpenRouter/free及D60只读Web完成；真实Provider、API、原业务校验、trace和重建持久化各自有证据，不由本地测试代收。
- [x] 独立TCP/TLS可观测能力不足仍按Spec明确为未知，未伪造时间；影子估计不自动应用阈值，不增加任务总预算。
- [x] 历史失败与原授权账本保留；方言候选／GLM冻结由活动研究Task持有，不属于本治理阶段的未完成实施。
- [x] 配置、开关、旧数据及WIP保护通过，本轮0新增模型；未stage或commit。无剩余实施或阻塞问题，具备归档条件。

结论：现行超时治理Spec对应阶段验收通过，2026-10-30归档；Spec继续作为稳定合同。闭环及证据索引见[最终回执](../../tasks/evidence/2026-10-30-g3-frontend-closeout.md)。
