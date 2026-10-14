# 统一数据能力适配层历史实施与验证记录

> 2026-10-14 按第二轮文档治理抽取。这里只保留有日期的阶段事实、已完成执行包、旧失败与修正，不是一套当前任务。当前责任、授权与未通过验收只由[原 Task](../../tasks/2026-10-09-unified-data-capability-adapter.md)维护。
> 原记录中的“当前/下一步”仅在其原时点有效，不恢复取消范围或旧授权。

# 统一数据能力适配层实施任务

> 任务标识：`unified-data-capability-adapter`；首次日期：2026-10-09
> 对应规格：[统一数据能力适配层与扩展契约](../../specs/2026-10-09-unified-data-capability-adapter.md)
> 状态核对：2026-10-14；原H07/K38及H08–H12、HiThink K37f-R与东财K37b-R证据复用；K37-C资格v2及当时写集的镜像固化完成。TF-F免费历史三个绑定、沪深六组实源/有限口径核对、正常新Run/快照、页面下载、独立计算和新旧断网重放通过；正式update.sh dsa固化及目标复验现已完成。TA1～TA5账户功能控制、目标API/页面及正式update.sh all镜像固化和运行态复验通过，原空间阻塞解除。RQ/Tushare原实现完成、真实成功受账号/权益外部条件阻塞，K37父项和整个主题保持部分完成。
> 历史实施基线：当时的本地未提交工作树 `/Users/yzin/code/thesis-ledger-workspace`；各次部署/实读只证明其记录输入。2026-10-14 本轮基于 `main@3570ab2` 只做文档对账，复用已保存验收证据，没有新增实读或部署。
> 过程与完整证据：[实施日志](../reviews/2026-10-11-unified-data-capability-implementation-log.md)；[全源差异矩阵](../../reviews/2026-10-10-provider-adaptation-and-route-matrix.md)。支持记录不维护另一套当前进度。

> 当前接续：先读 §9.5 的剩余条件。RQ 注册/试用已取消且后来仅授权代码层；Tushare 精确现金接口权限未满足。两家迁移与拒绝层完成，正向消费仍未验证；条件未变化时没有开户、采购或重复实读动作，也不重做已完成的 TF-F、TA、K37f-R、K37b-R、K37-C 和 H08～H12。

## 当前执行摘要

### TA：Tushare 账户功能权限提示（2026-10-14）

用户要求输入凭证拥有对应权限才开放功能，已选择“保留禁用条目和原因”。沿用现有只读测试入口、来源精确库存及凭证配置；新增叶只负责账户接口访问提示，K37e-live真实现金消费仍为独立外部剩余项。对应Spec AC-TA-01～04，既有HiThink/东财/TickFlow及RQ/Tushare账号证据复用。

- [x] TA1 状态与合同：六个精确功能使用标准访问状态，18秒/六请求预算、5分钟配置绑定内存缓存、草稿隔离和并行变化拒绝发布。Schema/Server/客户端都核对检查用途，普通读取不能冒充账户结论。该批检查单独使用22秒Server外层超时，普通请求仍按原配置。缓存仅保留不公开的随机密钥摘要与标准结果，不留凭证副本；过期清除结果。
- [x] TA2 执行面：原HTTP客户端按传输职责小范围提取，Fetcher兼容入口、十进制解析和生产参数保持；来源负责六接口参数及2002/明确40203解释。264项原定向/受影响、29项边界通过；最后缓存/原检查/目录67项和离线HTTP控制接缝14项通过。没有Tushare供应商请求或配置/准入写入，fixture/缺凭证零尝试；并行旋转、端点变更、预算、坏响应、限频各自核对。
- [x] TA3 消费面：新权限侧栏、保存后当前配置检查、禁用候选和原因、中文标签及过期内部目录刷新完成。Schema12、原Desktop受影响41/最后10、Server23和客户端3项通过；草稿修改后的旧许可不显示，密钥不进mutation variables。Desktop/Server类型检查和桌面构建通过；仓库边界、复杂度及尺寸ratchet通过，旧警告保留。
- [x] TA4 目标验收：正式sync-code all退出0，兼容性预检及DSA/Server/Worker健康通过。实际Server账户检查返回6项credential_missing、attempted合计0；原策略逐值相同、Tushare仍configVersion=0/未配置/停用、20来源143目录完整。真实页面六功能及新检查侧栏/必填校验通过。镜像预检退出后10个DSA生产文件摘要仍匹配、运行能力仍可用。[完整证据](../reviews/2026-10-14-tushare-account-capability-access.md)。原账号实源证据复用；未变化账号不重验，未获取新凭证真实成功，不将本功能写成K37e-live通过。
- [x] TA5 镜像固化：用户要求重试后，宿主29386MiB/Docker23947MiB达到原20480/18432MiB门槛；仅为本次命令补齐本机Node PATH，正式update.sh all退出0，源码构建及数据库check通过。DSA切换3429d2609376…、Server/Worker切换6d709bc37663…，五容器健康，更新前后6卷及挂载相同，10个DSA生产文件与未变宿主源码摘要匹配，未再覆盖容器源码。实际Server账户检查HTTP201返回六项credential_missing、attempted合计0，权限支持标记为true；Tushare仍停用/未配置/configVersion=0，策略126/16路线及检查前后逐值一致，20来源/143精确目录完整。首次空间失败保留为历史，当前镜像固化阻塞已解除；定向测试、页面及HiThink/东财/TickFlow证据复用，不重采供应商或重验RQ/Tushare条件。[重试与独立复验](../reviews/2026-10-14-tushare-account-capability-access.md#镜像固化与剩余条件)。

总供应商请求预算：每个用户动作最多6次；本轮实现/验收默认不重用未保存旧Key请求供应商，目标未配置路径为0次。按来源声明的六接口做离线协议及混合权限验证，结果明确属于离线验证。当前写集为DSA来源/通用检查和目录投影、共享Schema、Server传递、Desktop凭证/功能展示与定向测试；不修改数据库结构、研究模型或已冻结结果。

2026-10-14文档对账：已将TA账户控制、实际缺凭证路径、页面及正式镜像证据补入[差异矩阵](../../reviews/2026-10-10-provider-adaptation-and-route-matrix.md)，当前AC对账与20来源/143目标口径同步；旧门禁、浏览器阻塞和移植阶段父项开放措辞明确为历史。仅维护文档与证据引用，不重跑已通过验收或未变化账号条件；K37c-live、K37e-live及K37父项保持未勾选。

### TF-F：TickFlow 免费历史（2026-10-14）

用户已授权最小接入、有界实源、口径/实际消费及离线重放。对应Spec AC-TF-01～03；原完整服务与现金已完成证据复用，RQ/Tushare不重验。

- [x] TF-F1 来源接入：免费目标仅沪深A股三日线绑定，原四绑定/Key/报价保持。每窗先确认当前股票元数据，再单次K线，两请求各2.25秒、SDK无重试/环境Key；字段坏行、重复、计数截断、空窗、身份不符各自分类。330项定向/受影响通过；最后同读取器探测入口及A股范围、原TickFlow/日历99项通过，B股/基金/指数/北交所不进入上游。20来源/143精确绑定，旧140保持。
- [x] TF-F2 有限语义核对：沪600519/深000001，2025-06-23～07-04三复权各10条，原价80个OHLC与腾讯一致；量数值相差100倍、成交额差-50～43元，保留原值/通用单位unknown。供应商type=stock元数据核对；因子跃迁日与交易所6/26除息日一致，锚点/全历史可见性未确认。复用原6K线和2标的，不重复样本。TickFlow及腾讯数据请求预算14，实际13：首个元数据字段误用1次、成功核对10次、消费者2次，余额不使用。原引擎额外两个结构化状态查询响应及2个月公告任务按原有界生命周期复用；公告各5页/180秒，均完成/0匹配/0下载，不证明公告完整。
- [x] TF-F3 真实消费者：正常新prepare/原策略3笔成交、25冻结价格（含预热）及qfq归一化新快照完成；10研究日期40OHLC等于此前qfq样本，独立费用/权益/基准复算通过。未使用未知量额信号；政策122→123→124、124→125→126两次CAS恢复原16路线，无凭据/启停保存。新checksum09741358529bd3a8、代表性旧a180c8307c637ac3两次断网重放一致、网络0；实际页面与正常下载通过。
- [x] TF-F4 部署与对账：原330项受影响/末次99项及目标消费证据复用。取消紧张期1个历史版本底线后，正式update.sh dsa只退役1个最旧未引用DSA回滚；回收后宿主21731MiB/Docker23494MiB达标即停，更新退出0。DSA新镜像d9cdba416f1f…、三生产文件哈希/SDK/绑定及无后续源码覆盖核对通过；Server/Worker、基线和6卷保持，新09741358529bd3a8/旧a180c8307c637ac3各两次断网重放一致、网络0。详见[infra正式固化证据](../../../../thesis-ledger-infra/docs/tasks/evidence/2026-10-14-shared-docker-space.md)。本轮未重采供应商或重验RQ/Tushare条件。

当前检查点：TF-F1～F4完成，正式DSA镜像固化及新旧结果复验通过；读取/展示/研究能力在目标可用，见[完整实源/口径/消费者及重放证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-tickflow-free-history)。新Run `9f2cfeaa-b8dc-4ba0-8b5f-2c275a04696c`。有限数据/研究假设限制保持，不重跑已通过样本或未变化账号；RQ/Tushare外部条件继续开放，整个主题不归档。

### K37-C：登记资格修正及镜像固化

Review已证明旧“已结算”研究约定不能用于新场内ETF权益模型。用户明确授权修订；HiThink/东财来源读取证据保持，旧结果复现与新业务规则准确性分别验收。

- [x] C1 规则与版本：510300/510050/510880一手公告确认交易结束后的登记份额，沿原policy.entitlement冻结v2；旧准备只兼容重放，新准备/创建及再次运行采用v2。
- [x] C2 执行面：quantity为成交记增减总数量、settledQuantity为可卖结算数量；登记截止事件在同刻有效成交之后采集，不依赖策略决策/自定义估值。原T+1、应收及发放限制保持。
- [x] C3 计算：A～F独立期望与原账本/队列测试相等，Server定向24、Domain受影响27项通过；独立脚本分新/旧版本，真实新29/旧36权益点全部吻合。
- [x] C4 来源事实轻量去重：五个事件移入DSA有所有权/版本/引用的共享事实表，两来源各自匹配不扩大，不补字段；112项受影响及能力边界通过。
- [x] C5 真实消费者：正常新prepare/preflight/create、原引擎登记日实际买100份，资格100/应收8.8，期末现金99600.90/权益100009.80。新快照/页面/正常下载及新旧两次断网重放通过，旧checksum保持367cabb4354f1470；总1次现金读取，其后同原包复用0次。
- [x] C6 本地固化：2026-10-14用户要求重试后，正式update.sh all退出0，DSA及Server/Worker切换新镜像；固定SDK源码/编译、应用构建和数据库check门禁通过。镜像内v2/登记checkpoint/共享五事实独立确认，新旧快照各两次断网重放保持原checksum、网络0。此前GitHub/Alpine TLS失败作为历史证据保留，当前固化阻塞解除。不重采供应商，不清库删卷或提交推送发布。

当前检查点：C1～C6全部完成；[完整规则、计算及目标证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k37-entitlement-v2)，[正式镜像固化复验](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k37-entitlement-image-solidified)。新Run `8db8879d-e27d-4d8b-8df2-96eba083fee6`、checksum `a180c8307c637ac3`。通用读取完成，默认具体事件核验范围目前有限；没有全历史自动核验或真实到账声明，K37父项不因本切片完成而全部勾选。

预期写集限资格采集、原事件队列观察接缝、policy边界及新默认、独立验证、相关UI文案和DSA五事实去重；不重做来源适配，不恢复旧严格live或窗口准入。必要真实采集最多1次，优先复用已存观察，前提不变不重试。

目标首验已完成一次正常v2采集/准备；volume口径未知被原Worker门禁拒绝，未生成快照。改用同数据唯一close触发，增加正式准备请求的有界数据引用：仅复用Server已有v2现金原包及冻结行情引用，必须同scope/价格协议/policy且当前控制复核通过，不改旧包时间或摘要、不重采集、不扩为通用情景/缓存平台。此引用只在明确的新准备流程消费，不能把旧policy包伪装成v2。

### K37b-R：东财普通现金研究执行包（2026-10-13）

用户明确授权东财沿用普通研究边界，替代下文原b正向层的逐窗口准入前置。HiThink、RQ/Tushare既有证据复用；K37父项分别记账。

- [x] K37b-R1 状态机：合同已同步；旧严格入口/旧结果保持，缺公告日和状态分别保存null及明确问题，覆盖未知独立表达。
- [x] K37b-R2 执行面：既有东财读取模块复用有界传输，注册通用研究协议；配置/前后控制和实际采集时钟保持。公告日不作为现金资格前置，不生成策略可见性。
- [x] K37b-R3 有界对账：实际3样本、51原记录/5目标事件；跨2024～2026金额、每10份单位、三现金日期及窗口合计无差异，5条均缺公告日/状态。510300空窗从同一响应核对；另3次消费者采集，总6次单页现金请求，无重试或追加。坏行等边界离线验证。
- [x] K37b-R4 消费面：3个新快照/Run完成，独立Decimal复算全部74权益点；1091.2元核对事件、未知默认不采用、显式假设2172.6元。同冻结输入由原引擎重算两个情景，解释不作为误差界。
- [x] K37b-R5 展示与导出：3个真实结果页面、2份实际下载通过；采用/未采用计数、缺字段、假设、覆盖、模拟发放和原资料清楚分列，下载逐字段等于持久结果。
- [x] K37b-R6 部署验收：正式sync-code all及必要thesis-ledger同步成功；3新快照各两次断网重放校验和一致、网络0。政策120→121临时现金选择→122 CAS恢复原主备/16路线，Provider代次未改。旧输入兼容定向测试通过，HiThink既有实源/重放证据复用。

真实结果见[东财普通研究完整证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k37b-research-v2)。采集后预检500实测由冻结JSON超过默认100KiB导致；定向修复三个POST入口8MiB预算及413分类，直接复用准备包恢复运行，不重复取数。旧严格正向live不再是普通研究交付前置。

- 2026-10-13 HiThink与东财普通读取、保存、展示和显式研究均已完成，状态未知/覆盖未知继续披露。当前现金事件正向剩余为RQ/Tushare的外部账号/权益条件；不重开已完成切片，不以普通研究成功声明完整历史收益。

### K37f-R：普通 HiThink 分红研究执行包

对应 Spec AC-CASH-01～05；以三仓未提交工作树为事实源。主代理串行拥有共享合同、原 Task、目标配置 CAS 和运行态；不使用子代理。旧现金模型/快照不重构，供应商语义只由 DSA 所有。

- [x] **R1 来源读取与标准记录**：复用同一有界HTTP读取器，新标准记录保留原状态/unknown、逐行问题、重复/冲突/未采用计数和业务原文；十进制及日期原语继续复用。认证/预算/前后配置复核保持。182项局部、63项读取/严格兼容、277项其余HiThink、语法/关键flake8及能力边界通过；真实来源层由R4/R5验收。
- [x] **R2 标准合同与冻结选择**：新known-cash标准合同/准备/冻结保存语义、质量、原业务响应及采用选择；跨语言DSA实际规范化输出7项、Schema全包1068项和Server既有冻结36项通过。旧包未带新版本时保持语义；缺发放日仅保留未采用观察，不计算应收或可用现金。后续目标兼容由R6验收。
- [x] **R3 消费与披露**：原Worker按冻结选择消费，默认排除和显式假设进入同一记账模型；未采用、问题、覆盖、应收和模拟发放在页面/诊断分列。新选择Runner及实际消费者通过，同一冻结输入用原引擎双情景重算。选择状态与请求参数由现金选择组件拥有，存量准备函数253行/复杂度38，相对本轮修改前反推256行/38未增加。原模型和真实Ledger未改。[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k37f-research-v2)。
- [x] **R4 有界来源对账**：三证券各一次采集，51条原记录/目标2、2、1条，五事件金额/单位及四日期、窗口数量和合计独立核对无差异；合计每份0.211/0.135/0.143元，510300的2025-07～08来源空窗0，覆盖仍未知。业务总预算6次，余3次用于新研究消费者的默认确定记录、默认未知排除、显式未知假设各一次（已有默认确定记录Run成功）；每次10秒、1MiB、2000行，不做前提不变重试。有限核对表及原文引用已保存供接入复用，不推广数字枚举/完整覆盖。[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k37f-research-v2)。
- [x] **R5 目标新快照与真实消费**：正式update.sh all及所需代码同步完成；现有政策120/120、16路线、HiThink配置7保持，无临时路由或凭据写入。六次业务读取预算用完且无重试：三次对账、默认已核对事件、默认未知排除、显式未知假设各一。三个新Run/不可变快照、实际Worker/页面/两份正常诊断下载通过；74个新权益时点独立Decimal复算通过，原应收29个时点复算复用兼容验证。固定输入对照期末权益97047.1/99219.7，差额2172.6为本假设敏感性，不是误差界限。[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k37f-research-v2)。
- [x] **R6 兼容重放及收口**：三个新快照、旧known-cash/旧严格现金/旧应收快照各两次断网重放，保存checksum一致、网络0；新数据未重算旧结果。新读取须带标准选择，Server对旧客户端缺省注入exclude，旧控制包只读兼容，阻止新读取套旧假设。定向/受影响检查、正式运行态、文档与矩阵已对账；未提交推送、转TODO/归档或改东财实现。金额、币种及日期不确定行只保留未采用观察；数字进度和漏报仍未知。

当前检查点：K37f-R全部完成，HiThink普通研究已收口；运行态及数据适用范围见[证据报告](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k37f-research-v2)。缺金额/关键日期等行保存而不模拟，原进度变更不沿用旧有限事件核对。RQ/Tushare及东财剩余责任按§9.5保持。用户本轮产品合同替代旧自设准入与验收要求；采购/开户/付费权益/凭据重存/真实Ledger/清库/提交推送发布不在授权内。

- 原19来源/140目标、K38与H08～H12机制验收按[最终分层对账](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h07-h12-final-obligation-reconcile)复用；H10历史CAS120恢复不当作实时政策值。公告a-live、159516拆分d-live保持，HiThink新研究验收单独列于本执行包。
- RQ无账号，Tushare同凭据daily成功而fund_div/fund_daily精确40203拒绝；实现均完成，真实成功仍受外部条件阻塞。不重复索Key或未变化权益。东财现金按K37b-R收口；RQ/Tushare外部条件未满足，不勾K37父项。TickFlow免费历史模式及严格语义仍按原独立责任处理。


## 0. 授权、状态与唯一事实源

当前以2026-10-13用户持续执行完成指令为准。它替代此前“仅一次实读、修复后复验须另行询问”等逐次限制；历史案例的授权与结果由下方证据索引保留，不再作为当前停止条件。原工作树、Spec、Task及差异矩阵是事实源，不以旧附件、远端HEAD或历史提交覆盖现场。

在本Task原范围内，允许必要代码修复、定向/受影响验证与文档更新；按实际输入选择infra正式最小同步/更新；使用已有合法配置进行有界实源及确有必要的修复后复验；按现有方案临时选择/启停对应功能路线并CAS恢复。请求须有明确目标、超时和有限次数，已通过且输入未变的验证复用。

旧严格入口的受控scope续期规则保留于兼容路径。HiThink及东财普通研究由本轮授权取消逐证券/日期项目准入依赖，按配置和研究选择读取，不需要签发或续期scope；旧严格live不作为本轮交付前置。

采购、开户、开通收费权益、自动保存凭据、写真实Ledger、清库删卷、覆盖并行修改、提交推送或发布均不在当前授权内。工具权限拒绝不得换地址、浏览器、CDP或API绕过。并行配置变化须停止覆盖并保留事实。本轮现行产品合同由用户直接授权替代旧自设准入及验收要求，其他基本正确性和权限不变。

当前已完成的公告a-live、159516拆分d-live、H09组合及H10真实UI证据按各叶保留，不重做。117是拆分旧回执恢复值，H10回执恢复120；后续操作读取实时政策并CAS。H10通过原工具同一5173入口完成，临时Vite已在验收结束时停止，不将已结束的进程当成运行中等待。

| 历史阶段 | 对应授权与执行证据 |
| --- | --- |
| 最初文档授权及后续实施启动 | [初始授权历史](../reviews/2026-10-11-unified-data-capability-initial-evidence.md#authorization-history)；[H09默认案例授权](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h09-policy-fix-default-authorization) |
| 公告现金原scope续期及读取/新冻结/离线 | [K37a-live](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k37a-notice-live-renewal) |
| 东财拆分正式入口、纯计划及局部合同 | [入口本地交付](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k37d-split-admission-entry-local) |
| 首次拆分apply/503及恢复113 | [历史执行](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k37d-split-apply-read-restored) |
| 脱敏诊断、时钟方案与随后确认的本地实施 | [诊断方案](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k37d-split-diagnostics-clock-local)；[已确认实施](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k37d-split-clock-implemented-local) |
| 正式同步、旧appliedAt误拒绝及恢复115 | [历史目标记录](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k37d-split-clock-target-single-read) |
| 修正后一次真实信封/完成截止/离线消费及恢复117 | [已通过拆分正向层](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k37d-split-clock-live-consumed) |
| 持续完成阶段的五功能真实UI及120恢复 | [H10真实界面](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h10-real-ui-save-disable-restore)；[最终分层对账](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h07-h12-final-obligation-reconcile) |

原§9.7 ETF切源、§9.10五功能、§9.19状态代次、§9.88报价/四缓存等旧单次案例均已执行恢复；其详细过程留在关联报告，后续只能按上方当前范围执行，不能把某旧案例扩大成新来源、收费权益或任意配置授权。

原[共同价格Task](2026-09-25-multi-source-adjustment-aware-backtest.md)保留历史；取消/保留范围以[2026-10-08决定](../../specs/2026-10-03-multi-source-remaining-acceptance.md#scope-cancellation-20261008)为准。S05、旧HiThink M31全历史/高级准入、M32、专业Quote高级资格、指定旧资产追补和复杂回退不恢复。

[按需历史数据](../../tasks/2026-10-09-history-data-on-demand.md)和[富途接入](../../tasks/2026-10-08-futu-openapi-full-integration.md)独立维护业务验收；本框架不成为其已完成切片的新前置，不覆盖其WIP/状态。盘口只交付契约与隔离扩展测试，真实二级行情/订阅/盘口UI/逐笔仓库不属于本轮。

### 0.1 本地文档阶段

以下勾选仅证明当时文档写回，不代表当时获得代码实施授权；其原结论、写集与核验见[初始记录](../reviews/2026-10-11-unified-data-capability-initial-evidence.md#record-8-1)。
- [x] D00-local-reconcile：已连接设备，读取工作区/主仓 Agent 规则、文档指南和本地状态；未发现同主题 Spec/Task。核对按需数据、富途当前范围、多源取消决定及实际 RouteKey、能力读取器、非 K 线库存、基础价格备用接缝。
- [x] D01-local-doc-merge：创建通用 Spec/Task，并在现有按需数据、富途、共同价格文档及两个导航中增量关联；逐文件校验编辑前内容，不覆盖并行修改。
- [x] D02-local-doc-check：检查本轮增量 diff、相对链接、任务标识/AC 映射、原任务勾选及本轮仅文档写集，区分并行源码变化；只对新文档格式化，不重排原大文档。无源码变化不执行构建、部署或 Provider 请求。

## 1. 后续实施共同约束

实现前重新读取实际源码、现行任务范围和环境，不把示意方法当作已存在实现。当前能力适配、已支持冻结版本、用户路由、配置和凭据保留；不清库、不改账户 Ledger、不启动已取消申请或旧任务。

主仓拥有能力契约、产品 API/读模型和消费者；DSA 拥有来源定义、实现绑定与运行机制；infra 只处理必要运行依赖和部署。先确认所有权，不新增无边界 common/shared 目录，不机械拆文件规避门禁。

A01 固定本轮精确迁移切片及回归集合，不将所有来源或现行业务任务合并为一次重写。选定切片迁移后，其目录和执行来自同一注册定义；未迁移能力保持原路径，不双重生成同一目标。

验证按定向 → 受影响包 → 边界/依赖门禁 → 必要真实目标递进。低层级失败先修复；输入未变的证据可复用，但改造前结果不能冒充改造后通过。

## 2. 阶段 A：能力合同与最小注册闭环

目标：先让一个既有能力通过统一绑定工作。

- [x] A01-inventory：核对当前定义、工厂、能力/修订表和消费者特判；选择已有日线与非 K 线切片，固定精确文件、原行为及测试。复用本地 BaoStock/Futu 等实现，不据早期清单重写。
- [x] A02-capability-contract：定义能力版本、强类型请求/结果关联、query/subscribe 操作及错误约束；保留 V3 路由，不接受任意名称执行。新增能力只登记自身合同/处理器，不修改既有能力。
- [x] A03-registry：建立静态能力与来源绑定，关联定义/工厂/处理器/修订；拒绝重复、缺处理器和操作不匹配，目录视图由绑定生成。
- [x] A04-first-query-path：迁移一个现有精确日线目标，保留请求、路由、账号、结果校验和来源记录；复用超时/错误/限流，不加第二层切源。

写集：选定共享契约、DSA 绑定和来源接缝、样例/测试。不包括盘口 UI 或部署。

完成条件：既有查询闭环；未知能力、错误操作、重复绑定明确拒绝，来源失败不伪装为空成功。对应 AC01、AC02、AC04、AC06。

## 3. 阶段 B：来源适配与目录收拢

目标：证明抽象适用于不同来源、不同能力。

- [x] B01-bars-adapters：迁移腾讯/HiThink 选定日线的工厂、精确范围和本地修订；供应商 SDK/字段差异留在来源模块。港美已实现接缝按 A01 范围复用，不恢复富途全量接入。
- [x] B02-non-bar-adapter：迁移至少一种现有非 K 线能力，优先选择已稳定的净值、状态或当前资料；保持其原模型，不强制 Quote/K 线字段。
- [x] B03-binding-consolidation：选定切片中其余绑定采用现行 V3 薄适配收拢，确保同一目标只有一个定义源；未迁移范围记录原有入口，不以重写全部来源作为前置。
- [x] B04-readiness-projection：静态能力由绑定派生，依赖/账号/权限/配额及启用状态动态判断；未知保持未知，测试能力不注册为生产能力。
- [x] B05-credential-lifecycle：验证工厂缓存、账号配置代次、停用、在途结果和释放；不复用失效实例，不泄漏凭据。

写集：DSA 来源定义、处理器、目录投影与凭据接缝；主仓只做必要跨仓契约变化。

完成条件：目录与执行一致、有效组合正确、不同类型保持原合同，凭据与数值不伪造。对应 AC01、AC02、AC04、AC06、AC09。

## 4. 阶段 C：消费者去供应商特判

目标：业务根据能力与语义使用数据，不因新来源改写页面或计算。

- [x] C01-basic-price-policy：收拢 DSA 基础价格放行和 Server `supportsBasicPriceFallback()` 的名称判断，包括 A01 确定的 CN/港美范围；实际绑定、配置、研究模式和响应共同判断，不用单个自声明布尔值放行。
- [x] C02-consumer-boundaries：沿用 `DsaDataCapabilityReaderV3` 和既有 Market Reader；消费标准字段，不增加供应商 DTO 分支。事件、数量与已有严格请求保持正确性，但不恢复已取消交付义务。
- [x] C03-cache-and-state：缓存身份包含必要来源、账号权限、覆盖和参数；来源停用/配置变化正确失效，用户主备顺序不变。
- [x] C04-frozen-regression：目录与政策身份按现行协议处理，已支持冻结版本及结果不改写；离线重放不依赖在线适配器/当前凭据，不追补已取消缺失旧资产。
- [x] C05-boundary-guard：固化消费者不得依赖来源实现或新增供应商执行分支的规则；显示标签不误判为执行分支，已有模块方向不反转。

写集：选定主仓 Market/契约及相邻 DSA 判断、边界门禁与测试；不涉及真实账户 Ledger。

完成条件：新实现可被原 UI/计算消费；同口径整窗、手选来源、实际披露与冻结行为回归。对应 AC05、AC09、AC10、AC11。

## 5. 阶段 D：新来源、新能力及订阅边界证明

分别证明“新增来源实现已有能力”和“首次新增能力”，不以目录搬迁代替扩展性验收。

- [x] D10-new-provider-proof：测试中新 providerId 实现已有能力，记录 changed-files；只允许来源模块、测试和显式注册，公共 Runtime/Control/Server 不增加该来源分支。
- [x] D11-order-book-contract：按 Spec §7 定义盘口、深度、单位、时钟、覆盖与错误；query/subscribe 分开，只进入测试注册表。
- [x] D12-two-adapter-fixtures：两种不同结构分别适配同一 OrderBook，覆盖已知/未知单位、缺时间、排序、权限失败、深度不足和显式降级；不是复制 JSON 换来源名。
- [x] D13-subscription-state-model：用隔离迭代器/回调验证初始状态、取消/释放、失效/重同步；缺口不能继续输出有效盘口，无序列不声称连续性已验证。
- [x] D14-switch-and-backpressure：验证重连/切源代次、旧消息隔离、有界缓冲溢出；B 增量不作用于 A 盘口，UI 合并完整状态不破坏重建。
- [x] D15-scope-isolation：验证共享不跨账号权限/来源/不兼容参数；停用或撤权影响已有消费者。仅协议/纯状态验证，不部署真实连接管理。

写集：最小盘口契约、测试注册/适配夹具、生命周期接口和纯状态测试；不新建账号、生产盘口 API、全站 WebSocket 或历史仓库。

完成条件：两种扩展独立通过且原功能不变；测试能力不进入生产目录。对应 AC03、AC04、AC06、AC07、AC08、AC09、AC10。

## 6. 阶段 E：分层验证与目标验收

- [x] E01-focused-tests：执行注册、查询、转换、错误、控制一致性、隔离和生命周期定向测试，记录实际命令与统计。
- [x] E02-packages：运行受影响 Schemas/Server/Desktop 及 DSA 检查，不触发未改原生客户端的无关编译，也不宣称原生验收通过。
- [x] E03-repository-gates：按实际 scripts 执行类型、lint、build、边界/依赖/尺寸门禁，不提高阈值或新增 ignore 隐藏问题。
- [x] E04-target-update：源码稳定且确需目标验收时，从 infra 正式 `sync-code.sh`/`update.sh` 选择最小目标并遵守预检；依赖/SDK/数据库变化走相应完整入口。纯文档阶段不执行。
- [x] E05-existing-source-runtime：对已迁移且现行可用的来源做有界真实查询、研究/冻结和必要主备故障验证；需要临时改用户政策时先取得授权并按 CAS 恢复，不自动启用已跳过来源。
- [x] E06-consumer-check：用当前浏览器入口验证目录、图表与错误，确认测试能力未作为真实能力展示，不新增供应商业务面板。

完成条件：低层级、真实来源、部署和消费面分别记录，未完成仍开放；不把当前必需门禁移到 TODO。E05 不包含真实二级行情连接。对应 AC11、AC12，并为 AC01/AC05/AC09/AC10 提供证据。

## 7. 阶段 F：文档与接入指南

- [x] F01-onboarding-guide：DSA 给出“已有能力新增来源”的最短流程与真实测试入口，主仓给出“首次新增能力”的契约/消费者边界；不把复制多个中央分支写成规范。
- [x] F02-current-architecture：实现完成后才同步 Architecture 与兼容说明，不把设计文档写成已实现事实；旧文档仅链接，不重复状态。
- [x] F03-acceptance-reconcile：核对 AC01–AC12，明确未执行层级；本地盘口测试不称为二级行情已实盘接入，也不改变原业务任务完成或取消状态。
- [x] F04-worktree-summary：核对实际 diff 与授权范围，保留并行 WIP；不自动提交、推送、发版或清理。

完成条件：不同开发者可依接入指南复用，实际改动面证明扩展局部化，文档入口与实现一致。对应 AC12。

## 8. 证据入口与来源差异约束

完整命令、写集、失败/修正、授权和历史检查点见[实施日志](../reviews/2026-10-11-unified-data-capability-implementation-log.md)。原A–F对应[初始验证](../reviews/2026-10-11-unified-data-capability-initial-evidence.md)；H01–H06及早期组合对应[功能路由验证](../reviews/2026-10-11-unified-data-capability-route-evidence.md)；H07批次对应[来源迁移验证](../reviews/2026-10-11-unified-data-capability-source-evidence.md)；当前缓存/公共接缝对应[运行时验证](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md)。测试、实源、目标服务、浏览器和离线冻结分层认定，跳过或缺证据不算通过。

### 8.2 退市证券相关来源差异（后续统一处理）

原2026-10-09事实表与授权边界保留于[原§8.2](../reviews/2026-10-11-unified-data-capability-initial-evidence.md#record-8-2)，业务证据仍由[按需历史数据Task](../../tasks/2026-10-09-history-data-on-demand.md)及其报告拥有。当前适配与消费继续遵守：

- HiThink选定证券身份失败与参数错误、窗口无覆盖、暂不可用分别表达，不能推断全部退市证券不支持；原1002精确Unknown thscode修复复用。
- 腾讯退市前价格可得不证明最后交易日、跨源等价或所有消费资格；未知单位/覆盖/时钟不补造。
- BaoStock上市/摘牌日期、日级状态独立冻结，outDate不等于最后交易日，不塞入其他价格来源coverageProof或擅增摘牌后估值。
- CN股票invalid_proof属于当前研究/兼容合同，不以名单或删除检查绕过；整窗备用单源研究方案未授权。语义改变必须先有独立合同、用户选择和冻结决定。
- 不关闭按需数据真实摘牌消费验收，不重开已通过切片或取消义务；已有Task承接，不另建TODO清单。

## 9. 全源检查与功能路由后续交付（2026-10-10 对齐）

### 9.1 当前范围与就绪契约

原目标保持：完整产品清单/精确库存/旧执行入口并集逐源逐能力检查、真实差异矩阵、功能级独立选源/启停、按需求组合与独立冻结，见[Spec §13](../../specs/2026-10-09-unified-data-capability-adapter.md#13-全源适配检查差异矩阵与功能级路由2026-10-10-对齐)。原A–F只证明AC01–AC12选定范围；H01–H12承担AC13–AC20，不因条目增多缩减。

H06强合同、H07当前140目标绑定、H08本地控制/缓存与H09本地组合冻结分别已有就绪证据；当前本地叶可消费这些已验证里程碑。各父项原验收依赖保持，未通过的真实层不能被就绪里程碑代替。共享文件及目标资源串行，真实配置/故障按§0授权。

### 9.2 顺序、范围与状态规则

先H01，再H02/H03、H04差异矩阵、H05设计、H06–H12按实际依赖推进。每源检查包括旧路径和内置资料，未配置/已跳过可完成静态检查但实读保持未验证，不强接全部上游产品。来源没有某子能力不否定其其他能力。

勾选表示该条原声明范围通过；父分组与子叶不重复计数，原父项checkbox为保留历史标识而继续存在，不作为完整交付比例。未完成当前义务不移TODO/Archive，不把历史报告中的当时“下一步”作为当前派发。文档搬迁本身不重开已通过项，也不关闭任何门禁。

### 9.3 后续任务

每叶开始前固定精确文件、输入/输出和验证命令；下列责任面不是允许批量覆盖整个目录的写集。跨仓共享文件串行修改，当前按需历史/富途已完成切片与独立业务任务保持。

- [x] H01-framework-closeout：依赖原 A–D 选定闭环及 E/F 记录，核对完整框架验收并完成仍开放的 E05。真实主备测试选择已合法配置且符合当前研究合同的双源；需临时修改策略或故障注入先取得具体授权，使用现有 CAS/恢复，不能为退市样本放宽 CN 股票 proof。记录框架完成与全部来源迁移的区别。对应 AC13。
- [x] H02-source-inventory：依赖 H01，固定当前产品所有 Provider、真实 upstreamSource、现有精确能力、旧执行入口和新绑定清单，覆盖内置公告/规则及未配置候选；产品范围外和测试来源单列。只读枚举不得实例化上游 SDK 或通过导入触发网络/配置写入。清单以实际代码派生，不新增人工运行注册表。对应 AC14。
- [x] H03-per-capability-audit：依赖 H02，逐项核对声明/实现/统一迁移/消费者、字段语义、能力参数、错误和依赖；沿已有测试及已授权配置做必要有界验证，来源无权限或已取消时标注未验证而不强行调用。对退市身份、状态/日期独立性及原 §8.2 差异分别复核；不推测跨源等价。对应 AC14、AC15、AC20。
- [x] H04-difference-report：依赖 H03，在主仓 `docs/reviews/2026-10-10-provider-adaptation-and-route-matrix.md` 写按源总表与按能力明细，包含检查输入/时间、证据、已屏蔽差异、保留限制和对应缺口；从 docs/README 与 reviews 导航登记。逐源有真实结论才完成，不以空模板或两个示例代替全清单。DSA 原始映射仍由其接入指南拥有。对应 AC15。
- [x] H05-route-split-plan：依赖 H04，补齐同报告中的旧路由→独立能力/参数/目标映射；优先拆出历史交易状态、风险警示、价格规则与基础日期，确认上市阶段等实际消费者边界。明确必需/可选输入、冲突处理、同一上游复用、用户主备意图保留、启停及 wire/冻结版本变更，先更新所属 Spec，再写代码。未提供某子能力不得整体否定来源其他能力。对应 AC16–AC19。
- [x] H06-route-contract：依赖 H05，主仓共享契约和 DSA 对应边界分别建立功能级请求/结果、逐能力覆盖与状态、独立启停及政策迁移合同；沿现行强类型扩展，不往所有 RouteKey 堆无约束参数、不仅在 UI 存影子开关。旧 frozen 格式读法保持，新增组合必要时独立版本。先跨语言合同测试。对应 AC16、AC17、AC19。
- [x] H07-adapter-batches：依赖 H06，按 H03 缺口将当前范围的既有来源能力逐切片迁入统一定义/执行或补齐准确标准投影，复用原读取器/SDK；每批固定来源、能力、旧路径删除范围及回归。供应商天然缺失的功能如实记录，未配置与范围外接口不自动安装/采购；不以整家“支持”代替精确绑定。对应 AC14、AC16、AC20。
- [x] H08-route-runtime：依赖 H06/H07，落实 DSA 单目标读取及控制检查、Server 每能力主备选择与停用语义，明确唯一切源责任。未启用不新增请求/任务；不足字段/覆盖不能误判全能力成功；共享同源批量结果不绕过功能选择。验证配置代次、并发与缓存隔离，不修改用户实际配置。对应 AC16–AC18。
- [x] H09-consumer-and-freeze：依赖 H08，消费者按本次需求组合各能力的不同来源结果，必需数据缺失只影响对应计算；分别冻结请求、RouteTarget、观察时间、覆盖与采用事实，不把状态/日期写成价格来源证明。测试同字段冲突、部分失败、新旧快照离线重放及用户原研究选择保持。对应 AC18、AC19。
- [x] H10-route-ui：依赖 H09，在原功能路由界面按业务组展示独立功能开关、精确主备候选、支持范围与不可用原因；Provider 配置不复制到每功能、不新增供应商业务页面。关闭一个功能保留其选择且不影响其他功能；只支持状态的来源不因缺风险规则从状态候选中消失。遵守现有表单/组件规则。对应 AC16、AC17。
- [x] H11-target-verification：依赖 H10，定向→受影响包→边界/依赖/尺寸→必要正式更新→真实功能消费分层验证。至少验证不同来源承担价格、交易状态、基础日期等能力，以及某可选规则失败不会遮蔽有效功能；核对功能停用无新增调用和旧快照保持。临时配置/故障注入需具体授权并 CAS 恢复，旧结果和 Ledger 不写；未通过层级分别保留。对应 AC16–AC19。
- [x] H12-matrix-reconcile：依赖 H11，更新同一差异矩阵与接入指南、必要当前架构及新 AC13–AC20 结果。每个当前来源能力有明确结论；适配/验证未完成继续列当前责任，已知能力限制不伪装成待实现全部上游 API。仅本次范围实际通过才收口，不用原 A–F 勾选代替。对应 AC13–AC20。

H06–H10 若涉及更多执行面，按仓库规则继续拆单责任子叶，不让一个叶同时重写 Schema、DSA、Server、Worker 和 UI。H07 每批做定向回归，公共层不新增供应商执行分支；不是把全部来源复制成另一套 Fetcher。

### 9.4 子叶状态、当前结果与证据

子叶保持原编号、描述和勾选。完成叶的原执行边界与详细验证可按证据链接查阅；未完成叶继续受父项及§9.5执行包约束。记录中的旧阶段描述只作为原声明范围，最新结果以本节/§9.5为准。

- [x] H01-K1：核对并补齐新能力查询的精确请求匹配、结果关联、操作及合同版本约束。精确写集为 DSA `src/services/thesis_ledger_capability_registry.py`、`src/services/thesis_ledger_order_book_contract.py`、盘口夹具/合同测试及注册测试，必要指南增量；不改现有日线/报价处理器、生产目录或用户政策。先定向失败复现，再注册/盘口/原迁移回归与语法、边界检查。
  - 证据与原执行范围：[原§9.6](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-6)。
- [x] H01-K2：固定 E05 的最小真实备用验收方案及可复用入口，先核对现行目标和 CAS。当前 Effective/Desired 均为 74；合法双源价格仅 CN STOCK none/qfq，不能绕开 proof。ETF 单源须经单独授权才可临时增加备用，真实故障注入同样单独授权；不得提前执行或声明 H01 完成。
  - 证据与原执行范围：[原§9.6](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-6)。
- [x] H01-K3：在现有 Provider 配置事务补可选期望配置代次，作为受保护恢复前置。Spec §6.3 定义兼容行为；先 DSA 输入/持久化条件及隔离测试，再 Server 输入与现有 DsaClient 透传测试，最后可复用验收入口。写集：DSA `provider_credentials.py`、`thesis_ledger_control.py`、原控制测试；主仓 `market-provider-input.ts`、`market-control.service.ts`、`integration/dsa/dsa.client.ts` 及相应定向测试。不新增数据库结构/事实系统，过大 Control 文件通过复用原输入校验减少行数；没有真实配置写操作。
  - 证据与原执行范围：[原§9.6](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-6)。
- [x] H06-K1-shared-contract：只改共享 Schema、导出和跨语言固定样例；证明五项能力参数、单位/时钟/未知/证据/关联边界，不改业务研究语义。
  - 证据与原执行范围：[原§9.8](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-8)。
- [x] H06-K2-dsa-contract：只改 DSA 强类型合同和合同测试；标准化五项能力并接通已有 registry 校验，不加入生产目录。
  - 证据与原执行范围：[原§9.8](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-8)。
- [x] H06-K3-policy-compatibility：串行修改共享 route、DSA 校验/Effective 与 Server 控制合同；旧序列化不注入字段，新功能显式关闭、禁用保留目标。纯迁移预览无写入，CAS 保护。
  - 证据与原执行范围：[原§9.8](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-8)。
- [x] H07-K1-status-and-dates：来源模块拥有 BaoStock 日级状态/粗风险/基础日期与 official-states 事实投影，逐能力准入/覆盖，不回补价格 proof；合同、统一绑定和现有实际执行入口贯通后才勾选。
  - 证据与原执行范围：[原§9.8](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-8)。
- [x] H07-K2-efinance-daily：迁移既有 CN STOCK/ETF、none/qfq/hfq 六个精确日线目标；来源模块拥有定义/工厂/绑定/修订和精确 SDK 参数投影，原 Native 库存删除对应行。保持原源修订、单位未知与失败分类，使用现有 Runtime/SDK fixture 回归，不修改未迁移报价/净值或用户路由。
  - 证据与原执行范围：[原§9.8](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-8)。
- [x] H08-K1-feature-epoch：通过现有 Runtime/Reader 的功能启停、目标匹配、代次及缓存检查，证明关闭前后无新增调用和晚到结果隔离。
  - 证据与原执行范围：[原§9.8](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-8)。
- [x] H08-K2-server-status-routes：演进现有 DsaDataCapabilityReaderV3，为五项独立功能增加按当前 Effective Policy 的读取；只用用户已选的最多两个目标、单目标请求由原 Runtime 执行，Server 是唯一切源方。功能关闭/政策变化不继续取数；部分覆盖明确返回 partial，不替代 H09 的必需字段判断。定向测试与旧 Reader 回归通过后才勾选本代码叶，目标消费单独验收。
  - 证据与原执行范围：[原§9.8](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-8)。
- [x] H07-K3-akshare-daily：完成上述 12 个既有精确日线的来源所有权迁移、原执行入口合同回归与登记等价检查。
  - 证据与原执行范围：[原§9.14](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-14)。
- [x] H07-K4-baostock-daily：完成三个既有价格目标迁移，不将独立状态/日期事实合并为价格完整性证明。
  - 证据与原执行范围：[原§9.15](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-15)。
- [x] H09-K1-composition-freeze：新建普通 STOCK 固定来源快照按当前已选独立能力获取、分别冻结请求/目标/修订/时钟/覆盖/错误和采用事实；只沿原“已知停牌日”解释约束执行。价格规则、风险、上市阶段和基础日期先作为分别披露的观察输入，不替代其已有研究资格、不变更策略或估值。必需/可选需求、冲突和部分失败由标准组合契约处理；新版本独立产物接入原 Builder/ArtifactStore/离线 Runner，旧聚合与旧资产保持原读法。
  - 证据与原执行范围：[原§9.19](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-19)。
- [x] H07-K5-pytdx-daily：上述单目标移入来源模块，保留原参数、错误、修订与有效组合，原登记删除，经过原 Runtime 与库存等价验证后勾选代码叶。
  - 证据与原执行范围：[原§9.20](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-20)。
- [x] H09-K2-target-composition：使用真实已选价格及不同来源的独立功能，经原消费入口生成新组合冻结，并证明可选功能失败保留其他事实；不得用测试原文或单独 Schema 冻结替代业务快照。涉及新增临时功能路线时先准备精确方案/恢复记录、取得独立授权；遇到真实价格资格、必需事实或现行研究合同不足时保留阻断，不新增白名单、估值假设或更宽松研究协议。
  - 证据与原执行范围：[原§9.22](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-22)；[真实组合/冻结/重放结果](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h09-real-composition-freeze-passed)。111恢复，新Run succeeded/十产物/三可选失败，原模型保持；两日指标partial如实保留，数据快照complete，两次原Worker断网一致/0网络。
- [x] H07-K6-tickflow-daily：三目标经原 Control/Runtime 走来源绑定，旧登记删除；完整 SDK 参数、日期结构、错误、凭据/配置快照、普通/probe 工厂预算、唯一库存与原修订及受影响 DSA 回归/门禁通过。代码叶勾选，最小目标同步与真实来源分别记录，不安装或保存凭据。
  - 证据与原执行范围：[原§9.23](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-23)。
- [x] H07-K7-alphavantage-daily：上述单目标实际执行通过来源绑定，删除旧登记，保留原协议/修订、工厂/缓存与错误，完成受影响验证。真实账户、目标消费与浏览器单独记录。
  - 证据与原执行范围：[原§9.25](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-25)。
- [x] H07-K8-finnhub-daily：单目标通过原真实执行器及标准结果，保留参数、时钟、原修订、错误和生命周期，删除原双重登记；受影响验证与目标层分别记录。
  - 证据与原执行范围：[原§9.26](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-26)。
- [x] H07-K9-tushare-stock-daily：两个目标沿原 Control/Runtime → 来源绑定 → 原 HTTP client → 标准结果闭环；原工厂预算、凭据/端点缓存、限流和分页回归通过，全精确库存及原修订保持。代码叶完成，目标及真实账户分层记录。
  - 证据与原执行范围：[原§9.29](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-29)。
- [x] H07-K10-yahoo-stock-etf-daily：六目标完成来源绑定与实际执行器闭环，原参数、日期、单位未知、MultiIndex 身份及工厂缓存保持；本叶完成时 US INDEX/Share 仍单一原登记，指数后续独立归 K11，受影响回归通过。
  - 证据与原执行范围：[原§9.30](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-30)。
- [x] H07-K11-yahoo-us-index-daily：既有指数单目标通过原执行器与标准结果，原身份/单位/复权/单响应语义保持，旧 Native 单登记删除，股票/ETF 及 Share 回归通过。代码叶完成，真实目标分层记录。
  - 证据与原执行范围：[原§9.31](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-31)。
- [x] H07-K12-longbridge-daily：八目标迁移与原执行器闭环，工厂/OAuth/probe/缓存/SDK 原行为和修订保持，删除旧对应登记，受影响验证及库存等价通过。真实账户与目标同步分层记录。
  - 证据与原执行范围：[原§9.34](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-34)。
- [x] H07-K13-yahoo-share-windows：两项已有有界参考窗口复用标准合同与原执行器，单一来源登记、原事实与消费边界保持，HTTP/错误/冻结相关回归和库存等价通过。参考包读取不作为当前在线来源验收。
  - 证据与原执行范围：[原§9.35](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-35)。
- [x] H07-K14-futu-daily：十二目标经原隔离入口与标准处理器完成迁移，完整分页/释放/预算/错误及原工厂缓存保持，精确登记与修订等价；目标与真实来源分层记录。
  - 证据与原执行范围：[原§9.38](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-38)。
- [x] H07-K15-retire-native-daily：空 Native 日线生产分支退役，已迁移非 HiThink 日线检查复用标准处理器，未迁移路径和 HiThink 专有语义保持，目录/修订/错误回归通过。
  - 证据与原执行范围：[原§9.39](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-39)。
- [x] H07-K16-futu-quote：四个既有精确报价迁入标准绑定，原 SDK/工厂/投影/错误保持，删除旧对应登记与供应商分支，原检查复用与回归通过。目标及真实来源分层记录。
  - 证据与原执行范围：[原§9.42](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-42)。
- [x] H07-K17-futu-static-info：既有四项当前资料迁入独立强类型合同与标准处理器，原身份/整数/未知/释放/预算/错误保持，原 HTTP/probe 复用，删除旧对应登记，门禁及库存等价通过。目标与真实来源分层记录。
  - 证据与原执行范围：[原§9.45](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-45)。
- [x] H07-K18-security-lot-size：两来源复用标准当前参考合同，来源专有投影归模块、原工厂/缓存/时钟/摘要/错误与主备保持，旧对应登记删除；目标与真实来源分层记录。
  - 证据与原执行范围：[原§9.48](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-48)。
- [x] H07-K19-longbridge-quote：四既有报价标准绑定与实际投影，原代码/时钟/结果原型/空与错误保持，删除旧对应登记/供应商分支，工厂/OAuth 回归通过。真实层分开记录。
  - 证据与原执行范围：[原§9.51](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-51)。
- [x] H07-K20-yahoo-quote：七既有报价（含 US INDEX）标准绑定与单响应校验，原代码/quoteType/未知与失败保持，删除旧对应登记/供应商分支，不为其他来源扩大指数资格。
  - 证据与原执行范围：[原§9.51](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-51)。
- [x] H07-K21-native-stock-quotes：三既有单标股票报价来源绑定，原预算/参数/时钟/错误/工厂保持，旧分支/对应登记删除。TickFlow 实际缺失修复单独升本地修订。
  - 证据与原执行范围：[原§9.54](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-54)。
- [x] H07-K22-alphavantage-quote：单标标准投影校验真实身份、缺失与零，预算/错误/原工厂保持，本地适配修订与来源协议分别表达，不改 SDK 或旧冻结。
  - 证据与原执行范围：[原§9.54](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-54)。
- [x] H07-K23-efinance-pytdx-quotes：三既有报价标准绑定，efinance 股票单标失败不走原生全市场，pytdx 校验身份/缺失，缓存/单位未知/错误与原工厂保持。
  - 证据与原执行范围：[原§9.57](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-57)。
- [x] H07-K24-akshare-etf-quote：既有 ETF/eastmoney 单标接口标准绑定，原参数/证券交易所/预算/错误/未知保持，旧对应分支与登记删除。
  - 证据与原执行范围：[原§9.57](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-57)。
- [x] H07-K25-akshare-stock-em-tencent：两既有来源报价标准绑定、源内缓存/有界次数/单位/时钟保持，原登记移除。
  - 证据与原执行范围：[原§9.58](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-58)。
- [x] H07-K26-akshare-stock-sina：响应身份/参数边界收口后迁移，保留原 SDK 原生分析与错误边界，不能把输入代码当上游身份凭据。
  - 证据与原执行范围：[原§9.58](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-58)。
- [x] H07-K27-hithink-quotes：两项标准报价绑定及原工厂/错误/单位/时钟/Guard 快照闭环，移除对应旧登记与 SDK 分发。
  - 证据与原执行范围：[原§9.59](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-59)。
- [x] H07-K28-fund-nav：首次标准化已有最新净值能力，建立强类型请求/结果与 Schema/关联校验、小型处理器和两来源绑定；来源拥有 SDK 列名投影及基金代码转换，Runtime/API 只消费标准模型，FUND_NAV_HISTORY 保留原路径。
  - 证据与原执行范围：[原§9.60](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-60)。
- [x] H07-K29-fund-nav-history：依赖 K28 的点模型/日期边界里程碑，建立独立历史请求与序列合同、窗口/limit/单调唯一校验及两绑定；保留完整来源校验后截窗/限量与原 SDK 排序/预算/分页/错误，公共 API 形状保持，旧历史路径退役。
  - 证据与原执行范围：[原§9.60](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-60)。
- [x] H07-K30-nav-diagnostics：诊断复用最新/历史合同及同一源绑定，保留原 probe 只读、cache=false、样本窗口/观察与工厂上下文；退役诊断执行对SDK列名/Frame的公共依赖。
  - 证据与原执行范围：[原§9.62](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-62)。
- [x] H07-K31-fund-holdings：单既有能力建立标准请求/持仓结果/Schema/处理器并来源绑定，字段/季度/明确百分比转换归适配器；保留原空年份回看、错误、观察与原输出/摘要。目标同步与真实消费层另记本节，不由本地通过推定。
  - 证据与原执行范围：[原§9.63](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-63)。
- [x] H07-K32-holdings-diagnostics：诊断消费同一标准合同/绑定，删除 Runtime 原 SDK 持仓方法/列名校验并固化边界；实际工厂、缓存隔离、错误、草稿和无路由诊断测试通过后做受影响门禁与最小目标同步。
  - 证据与原执行范围：[原§9.64](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-64)。
- [x] H07-K33-chip-summary：两来源绑定同一强类型估算摘要合同/处理器，来源适配拥有字段、身份、单位与报告日，业务消费删除SDK DTO/比例猜测；保留原SDK算法、调用条件、None错误、原输出和工厂缓存；诊断同合同。
  - 证据与原执行范围：[原§9.65](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-65)。
- [x] H07-K34-special-etf-daily：分开完成Tushare ETF与HiThink ETF来源绑定/工厂/修订事实迁移，保留原分页、范围、单位、原文/计算/准入与交互合同；公共Runtime/执行器供应商分派随实际迁移增量收口。
  - 证据与原执行范围：[原§9.66](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-66)。
- [x] H07-K34a-tushare-etf：一精确绑定替换三中央事实，原SDK工厂/基金日线入口、4.5s、完整分段、单位与错误不改；公共执行器删除TushareETF特判，验证真实工厂及损坏证明/半窗/迟到/权限回归。
  - 证据与原执行范围：[原§9.66](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-66)。
- [x] H07-K34b-hithink-etf：一个qfq目标绑定原专用读取，来源拥有工厂/请求元信息/错误，删除中央登记/Runtime特判并保留交互/稀疏/单位/修订/凭据代次；定向、受影响、边界与目标分层验收。
  - 证据与原执行范围：[原§9.66](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-66)。
- [x] H07-K35-public-fees：六目标分子叶迁入费用标准合同/处理器和三来源模块，来源绑定派生原目录/修订，删相应旧登记，原JSON内容/摘要/文档/覆盖/收费政策不改；原V3 API与主备消费/冻结字段兼容。
  - 证据与原执行范围：[原§9.67](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-67)。
- [x] H07-K36-legacy-status：旧聚合七目标建立强类型请求/结果/Schema及来源绑定，分别保留公告、结构化与盘中原证据/窗口/错误，删除对应旧登记与公共供应商分派；不得将本叶变为新的宽松研究协议或重写五项独立能力。
  - 证据与原执行范围：[原§9.68](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-68)。
- [x] H07-K37a-notice-cash：公告现金源事件绑定、标准请求/现金结果与类型化事件上下文，复用原执行器；动态修订从来源派生，删旧中央目标/供应商分支/工厂登记，原正常/空结果/坏证据/包变化/晚到/安全/认证/原响应字段回归。本地实施完成；真实成功消费与新冻结验收另列，不能由此勾选推定。
  - 证据与原执行范围：[原§9.69](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-69)。
- [x] H07-K37a-live：2026-10-12原正式入口续期24小时、版本2原scope；原Server真实现金读取、新Run b60471f6 succeeded、新finalized快照9产物、两次断网Runner一致/0网络及独立793.60 CNY现金账均通过。原主备/111政策/凭据保持，不重做H09，不签发HiThink/东财。[本次完整证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k37a-notice-live-renewal)。
  - 原执行包（已完成，历史步骤）：先恢复当时停止的原开发运行态（现有daemon启动入口；原容器恢复入口缺失则只补精确项目/卷/身份验证及局部测试，不构建镜像），再执行infra既有cash-notice-admission.mjs精确摘要确认/24小时入口；随后原Server鉴权事件读取→原公告现金执行入口生成一个新快照→原Runner断网消费。不据此再次恢复、续期或重跑公告验收。
  - 写入边界：只续公告精确记录和必要原文读回；原现金/价格主备、Provider凭据、HiThink/东财准入、旧快照/Ledger保持。运行证据及当前Task/矩阵由本执行者维护，运维脚本只解决本次实际运行态缺口；有并行身份变化立即停止覆盖。
  - 停止/验收条件：上述精确记录、原scope/摘要/修订、真实现金、新finalized快照和断网消费均已独立核对后勾选；Spec未改，结果partial的原基准缺项及历史PIT限制保持披露，不代收H07父项。[前置调查](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-20261012-event-admission-gaps)。
  - 证据与原执行范围：[原§9.69](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-69)。
- [x] H07-K37b-eastmoney-cash：原严格合同/拒绝兼容保持；普通研究正向按K37b-R1～R6新合同通过，真实单基金页面→标准资料→新快照→现金计算→页面/下载→断网重放闭环。分页完整不证明覆盖，缺公告日/状态保持未知。
  - 证据与原执行范围：[原§9.69](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-69)。
- [x] H07-K37c-rqdata-events：两事件目标迁入来源定义、原账号工厂、强类型现金/拆分合同与原映射/隔离执行；目录/修订/凭据与当前准入查找派生，退役公共RQ执行特判。本地与目标代码迁移完成，真实RQ账号消费另保留。
  - 证据与原执行范围：[原§9.71](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-71)。
- [x] H07-K37d-eastmoney-split：复用原持久日期映射、原页面/分页/时钟、Split合同，保留原生效日与登记日；本地与目标代码移植完成。移植阶段真实消费及H07/H08～H12父项开放是历史状态；当前d-live已通过原scope的真实信封/离线消费，H08～H12机制已收口，完整覆盖限制及K37剩余责任按§9.5保留。
  - 证据与原执行范围：[原§9.71](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-71)。
- [x] H07-K37d-live：原159516映射/证据/版本1准入复用；追加明确一次预算后，原Server单次HTTP200/observed，两条ratio=2事实/实际完成截止消费、新保存采集信封离线消费/0网络通过，CAS115→116→117恢复，原16路线/主备/配置保持。[最新运行证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k37d-split-clock-live-consumed)。仅原scope真实成功消费层收口；coverage=false/普通完整冻结/Runner及父项独立未过，原503/控制误拒绝历史保留。
  - 原首次执行包：正式入口原两SHA输入及12项局部验证复用，不重跑；新增本案例CAS/原Server selector驱动，5项局部恢复合同通过。首次准入scope仅03-30～07-10、版本1至北京时间10月13日18:53:01，原936字节摘要b1a4…；111→112临时append一拆分目标、一次数据请求attempts=1、失败后112→113恢复。当次授权/请求预算已使用，不新增证券/页请求或自动续期。
  - 当前停止点：本次已通过真实信封/实际完成截止及离线消费，原deadline交换/观察和精确准入保持，固定意图仍拒绝冒认。原503内因未知，后续appliedAt误拒绝有独立修正/验证/同步证据；本轮仅用已明确一次新预算，不续期或再次请求。普通完整冻结/Runner仍独立受coverage=false阻断，解除须满足原完整窗口覆盖证据，不能用两事实重复请求或等待账号代替。
  - 先前诊断/离线方案包：当时用户仅授权补东财拆分脱敏错误阶段/内层码诊断，离线核对最小时钟方案及新局部验证。写集限东财诊断helper、原mapped/page/capability读链的可选诊断、原验收驱动安全错误捕获、新定向测试及原记录；不改公共Schema/绑定合同、Registry供应商分派、请求/观察时刻或coverage。候选显式采集时钟信封涉及契约变更，当时先提出/离线论证，不实施或改Spec标准。该阶段局部通过后停止，不同步目标、不发实源/重签/改主备/保存凭据或重跑未变旧验证。
  - 先前诊断阶段局部结果：Python诊断16项/原159516候选时钟1项、Node脱敏3项通过；受影响原两文件25项因该轮读链输入变化而验证通过，原维护12项/CAS恢复5项/H09/未变广域检查复用。候选信封对原固定截止的相关性仍拒绝；coverage=false/普通完整冻结及Spec保持。[完整局部证据与最小下一步](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k37d-split-diagnostics-clock-local)。
  - 先前采集时钟本地包：原Spec§13.72/信封、Server采集与显式消费、原Control GET的eventAdmissions=v1视图及客户端/原驱动接入本地完成；原默认响应形状/固定事件API/共享Registry/selector/DSA实读/凭据逻辑保持。读取期限/实际完成分开，前后精确版本/范围/证据绑定，不以同ready代认相同准入。原Runtime1592行/API1665行不增长；52新测试及192受影响回归、构建/静态通过到当时本地停止点。[该阶段证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k37d-split-clock-implemented-local)。当时目标未同步、原503/live/完整冻结未过，未新签/实源/改主备/保存凭据；随后正式同步/误拒绝修正/本次真实消费按后续独立授权与证据收口，不改写该阶段事实。
  - 原真实消费/恢复条件（本次已满足）：仅临时选择原SPLIT_EVENT目标，保留其他原主备，以原CAS和当前版本执行一次原Server事件读取，源起点自动到03-27；要求两条ratio2及明确登记/生效日、原文/组合修订/观察时钟，Server observed与coverage=false分开认定，之后CAS恢复。未知并行变化、空/漏/新增无映射事实、摘要/日期/比例/晚到变化立即停止，不自行补证据或扩scope。
  - 原验收边界：当前生产总页默认10，不冒称旧max4探针预算；真实已选读取可补本叶正向层，但普通完整冻结/Runner仍被恒false覆盖阻断。原Spec AC18/19及父项保持；需要真实窗口完整覆盖证据才能解除，不把原页读全、映射或文件保存当新业务冻结，不自行改complete/标准或重开已取消M22。
  - 证据与原执行范围：[原§9.72](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-72)。
- [x] H07-K37e-tushare-cash：保留原原文先于账号的多重guard、30s总预算、实际Decimal HTTP解析/可见日和原adapter凭据缓存；原精确时钟不截断。本地与目标代码移植完成，真实账号消费另保留。HiThink现金代码亦已迁移，个别来源正向层仍开放，H08–H12按§9.5原义务对账。
  - 证据与原执行范围：[原§9.72](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-72)。
- [x] H07-K37f-hithink-cash：最后一个精确目标完成来源绑定，原文先行、全部准入symbol范围、environment/control快照、精确时钟、30s mapped读取与fetch接缝保持。本地与目标代码移植完成，真实成功消费独立未验；原分红认证不改。K37正向批次仍开放，其他机制按§9.5原义务对账。
  - 证据与原执行范围：[原§9.73](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-73)。
- [x] H07-K37f-live：依据2026-10-13用户产品决定，以普通现金研究的新合同验收；现有合法配置、用户已选来源、未知标准记录、有限具体事件核对、新快照/实际消费/页面导出/离线重放均通过。原严格mapped入口仅作兼容，本勾选不冒充其严格语义正例，亦不授予历史完整性、历史信号或真实到账。[R1～R6证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k37f-research-v2)。
  - 证据与原执行范围：[原§9.74](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-74)。
- [x] H08-K3-cache-control-context：增加原Data V3的只读缓存上下文（控制事实投影，不执行来源），先用于即时价并迁移其余受影响缓存；fresh/last-valid/flight/锁绑定同一当前控制代次，读前/读后和返回前复核，停用/失效不得以旧缓存成功。实际目标/故障验收另列。
  - 证据与原执行范围：[原§9.75](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-75)。
- [x] H08-K3a-local-and-projection：五类缓存本地移植、共享/包级/静态门禁和正式目标只读投影完成；不代表真实切代次/故障或缓存消费验收。
  - 证据与原执行范围：[原§9.77](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-77)。
- [x] H08-K3b-live-cache-generation：目标原Server消费和真实缓存代次、停用/恢复、一次有界错误验收已由quote-generation/four-cache/source-config/source-failure子叶逐次授权执行恢复；当前政策111/配置7保持，不重新执行历史故障。原始临时journal留存缺口及父项依赖另保留，默认后续授权见§0。
  - 证据与原执行范围：[原§9.77](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-77)。
- [x] H10-K1-ui-draft：原路由界面的五独立功能、精确候选/参数范围、草稿开关和显式保存CAS完成；隔离保存及真实浏览器草稿通过。
  - 证据与原执行范围：[原§9.80](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-80)。
- [x] H10-K2-target-save：原浏览器入口权限当前可用，同一5173开发服务恢复后，真实控件保存五独立功能117→118，原Server五消费全部通过；关闭状态119保持主备与其他功能，状态数据0/风险数据1；原界面清除五临时选择并CAS恢复120/120，原16路线指纹完全一致。恢复journal最终verified。本叶真实界面层通过，父项按原义务另对账，不代收个别来源正向层。[完整证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h10-real-ui-save-disable-restore)。
  - 证据与原执行范围：[原§9.80](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-80)。
- [x] H07-K38-runtime-residue：继续原Runtime/SourceDefinition接缝收敛公共来源特判。先精确核对HiThink报价Guard、工厂同次快照和当前准入/修订查找，建立来源拥有的有限类型化回调与原执行回归，保留原认证/预算/错误/核验顺序；未核定引用的旧DAILY callback不先删除，不改Yahoo研究限制。公共注册/Runtime/Task串行修改，不传Runtime或任意SDK方法给来源。
  - 证据与原执行范围：[原§9.81](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-81)。
- [x] H07-K38a-credential-revision：来源声明拥有准入修订策略及认证载荷，公共层保留用途隔离摘要；新providerId、原三家指纹字节、权限范围、旋转失效和整数版本回归通过，正式DSA同步及目标只读核对通过。
  - 证据与原执行范围：[原§9.82](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-82)。
- [x] H07-K38b-quote-guard：公共报价执行按有限来源声明准备/复核；原HiThinkGuard实现不改，同次快照、预算与后置拒绝回归通过，正式DSA同步和目标原报价读取通过。
  - 证据与原执行范围：[原§9.83](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-83)。
- [x] H07-K38c-retire-implicit-daily：通用日线SDK/attrs死分支退役，原timeframe/控制拒绝和零执行合同保持；显式V3入口回归与正式目标同步通过。
  - 证据与原执行范围：[原§9.86](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-86)。
- [x] H07-K38d-quote-admission-reader：来源拥有兼容准入reader，全部scope/有效期/同次可选快照及新provider隔离回归通过；正式目标同步/原报价读取通过。
  - 证据与原执行范围：[原§9.86](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-86)。
- [x] H07-K38e-revision-view：修订从唯一DailyBinding派生，未登记报价失败关闭；140项修订/manifest结果逐项相同，本地及目标目录回归通过。
  - 证据与原执行范围：[原§9.86](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-86)。
- [x] H08-K3b-quote-generation：本次精确授权的真实Server报价功能关闭/恢复与缓存代次验收完成；非故障注入，不替代其他Provider配置/来源失败及其余四类真实缓存门禁。
  - 证据与原执行范围：[原§9.88](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-88)。
- [x] H07-K38f-hithink-probe：HiThink三固定诊断由来源策略拥有，原SDK/代表证券/单日qfq/4.5s、安全错误和draft/non-draft生命周期保持；新provider同策略无需公共供应商分支，回归及正式目标同步通过。该勾选不代表三项真实probe成功或业务覆盖/准入。
  - 证据与原执行范围：[原§9.89](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-89)。

- [x] H07-K38g-inventory：核对通用probe四来源的工厂与参数生命周期，形成可执行迁移边界。
  - 对应既有目标：H07-K38公共来源特判残留；AC13/AC14/AC20，Spec§13.42；仅发现与就绪证据，不以此证明生产行为或新增产品范围。
  - 启动依赖：K38f有限SourceProbePolicy已通过并正式同步；原factory/probe合同和现行SourceDefinition。当前可以安全开始，不依赖新的政策/故障授权。
  - 上下文入口：DSA `thesis_ledger_provider_smoke.py::_probe_generic`、Runtime `_adapter/_daily_frame/_validate_bars`；Tushare/TickFlow/Finnhub/AlphaVantage来源模块；`test_thesis_ledger_provider_runtime.py`、`test_thesis_ledger_provider_credentials_runtime.py`、`test_thesis_ledger_source_probe_policy.py`。
  - 执行边界：主要面为DSA只读调用链/隔离合同；可写本叶定向测试、对应实施/证据记录与当前摘要。不先改生产probe、SDK、缓存/凭据逻辑、政策、业务/冻结或公共TS合同。
  - 完成条件：用真实入口的隔离测试锁定注入adapter与凭据读取次数、cache=False/probe=True、canonical报价参数、strict日线、原错误与draft零写；列出两个独立能力迁移叶的精确写集和局部检查。
  - 验证方式：只读AST/真实函数定位与定向pytest，使用原方法及确定性SDK替身，无网络/账户/目标状态变更；支持记录写明原参数轨迹和未覆盖层级。
  - 当前结果：41项定向测试通过，锁定注入零凭据读取、原工厂单次快照/5s、不发布缓存、两类参数与错误/draft零写；尚未改变生产probe。详见[接缝证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38g-inventory)。

- [x] H07-K38g-quote：依赖K38g-inventory，承接K38/AC13/14/20，迁移Tushare/TickFlow代表报价的canonical证券、STOCK及精确upstream参数。
  - 写集：DSA能力合同/registry、公共smoke、上述两来源模块、诊断合同测试及对应能力边界；Spec§13.42与当前记录。来源仅接收有限上下文，不接收Runtime；原_adapter(cache=False,probe=True)负责工厂，不预读额外凭据。能力选择须静态验证，未迁移能力保留原入口。
  - 完成条件：原工厂、缓存、错误/健康生命周期及原精确报价绑定不变；公共smoke删除两来源名单；定向、受影响回归及边界通过。真实probe与目标同步分别列证据，不以本地测试代替。
  - 当前结果：本地及正式目标代码迁移完成；96项定向、152文件2483项回归/1跳过、边界/关键flake8/diff通过。原工厂/缓存/精确报价、健康错误与未迁移能力保持，目录/修订/政策等价；[完整证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38g-migration)。真实probe未验，父K38不收口。

- [x] H07-K38g-daily：依赖K38g-quote的有限adapter诊断上下文就绪，承接K38/AC13/14/20，迁移Finnhub/AlphaVantage的AAPL.US、days=5、strict=True。
  - 写集：上述两来源、公共smoke、能力拥有的旧Bar响应校验及Runtime兼容委托、定向测试/边界；不改精确历史查询、分页/SDK、缓存、凭据或冻结。旧tuple解包/整帧校验由日线能力所有，保持原规则与错误。
  - 完成条件：两来源诊断经过原工厂、原strict SDK调用和同一旧响应校验；删除公共严格日线供应商名单；定向/受影响回归、库存等价与必要目标同步通过。
  - 当前结果：同批本地/目标代码门禁完成，原strict单次调用与整帧规则/错误、原帧身份/顺序/空量额及Runtime兼容保持；证据同上。真实来源凭据/政策资格不因迁移获得，实源未验保留父项开放。

- [x] H07-K38h-inventory：依赖K38g，承接既有K38宽manifest兼容缺口及AC13/14/20。
  - 上下文：catalog_manifest_v3、Control._v3_target_reason及HiThink原来源manifest；当前精确绑定/事件匹配事实，已有HiThink股票/事件/报价控制测试。
  - 执行边界：只读调用链和新隔离特征测试、支持证据/Task摘要；不先删除宽manifest兼容、不改Control政策或真实准入。
  - 完成条件：确定HiThink现金/股票专属分支的可达性，锁定残缺manifest与未登记目标的原允许/拒绝；确认Control供应商豁免是否实际改变已绑定能力，形成单一有界迁移包，避免重写整个Control。
  - 当前结果：全140目标正常manifest与HiThink七目标四类残缺/错配特征、Control既有绑定条件、非法data日线Key均已锁定；281项定向通过。[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38h-inventory)。兼容来源特殊行为须保留；不以此次盘点证明新资格。

- [x] H07-K38h-manifest：依赖K38h-inventory，承接原K38/AC13/14/20，迁移HiThink原现金/股票目录兼容与删除对现行绑定无效的Control豁免。
  - 精确写集：DSA能力合同/registry、catalog_manifest_v3、HiThink来源、Control仅原豁免条件一行、该兼容合同测试及能力边界；Spec§13.43与支持文档。公共文件串行，不重写Control或宽manifest。
  - 完成条件：来源有限目录策略基于精确绑定事实，保持现金严格market/source/ETF与原股票日线宽manifest兼容；报价仍严格绑定，不把旧允许扩大为新目标。Control合法输入与140目标、目录/修订/配置均等价；定向/受影响回归、正式最小目标同步与原消费通过。
  - 当前结果：287项定向、153文件2660回归/1跳过、能力边界/关键flake8/diff通过；正式sync-code.sh dsa退出0，19来源/140绑定事实等价、政策86/86/配置目录不变，原报价1数据/2控制成功。[完整证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38h-migration)。真实消费资格保留父项未验边界。

- [x] H07-K38i-inventory：依赖K38h，承接原K38公共来源分支缺口与AC13/14/20，限定环境凭据读取/方法推导。
  - 上下文：environment_credentials、Control._environment_credential_state/_credential_state/provider_credential_snapshot、provider_credentials派生定义及Longbridge原环境解析。
  - 写集/边界：只读调用链、新隔离特征测试和当前摘要/支持证据；不改生产凭据解析、加密、HMAC、配置保存、OAuth刷新/SDK或真实账户。只用临时SQLite与确定性配置/凭据替身，不读取真实秘密。
  - 完成条件：锁定六来源原字段/strip/空值/异常、method、Tushare端点附加阶段、Longbridge legacy/OAuth及失败关闭、页面坏凭据禁止环境回退；记录读取次数与新来源扩展所需公共改动，产出有限迁移叶。
  - 当前结果：56项新特征/原凭据回归通过，锁定配置来源三次读取、HiThink零通用配置读取、空值/异常/方法与最终Tushare端点阶段；原页面坏凭据禁止回退及缓存/OAuth回归保持。[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38i-inventory)。不顺手减少读取次数或改变资格。

- [x] H07-K38i-environment：依赖K38i-inventory，承接原K38/AC13/14/20，迁移六来源环境凭据字段/方法及最终快照附加。
  - 精确写集：DSA能力合同/registry、环境凭据读取器、Control三个方法中的环境分支、HiThink/Tushare/TickFlow/Finnhub/AlphaVantage/Longbridge六来源、特征测试/原凭据回归与能力边界；Spec§13.44及支持记录。单一责任为环境凭据投影，不修改加密/保存/刷新/工厂/SDK/HMAC。
  - 完成条件：有限EnvironmentCredentialPolicy由来源拥有；公共Control/环境读取器不维护供应商字段或方法名单。保持原三次配置/值读取、HiThink直读环境、Tushare仅最终快照附加httpUrl、Longbridge原只读解析/legacy与OAuth选择、错误与缓存。未声明来源沿原空值路径，不补新凭据。
  - 验证/边界：定向→受影响回归/库存/能力边界→正式最小dsa同步及只读原消费；不保存真实秘密、不创建授权、不改真实配置/准入/路由。需要改变认证/刷新行为时停止对应叶。
  - 当前结果：121项定向、154文件2691回归/1跳过、能力边界/关键flake8/diff通过，正式最小dsa同步与原消费通过；19来源/140目标、政策86/86/配置目录等价。隔离新provider仅来源声明即可生成环境快照；[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38i-migration)。真实账户验收仍由父项保留，声明不能证明资格。

- [x] H08-K3b-next-preflight：依赖H08五缓存本地合同与当前目标代码就绪，承接K3b其余四缓存/配置/来源失败真实门禁。
  - 上下文：原market-cache-generation-acceptance.mjs及case/recovery模块、原Server NAV/history/holdings/chip消费者、当前Control/目录；报价授权已执行且不可复用。
  - 边界/写集：原验收脚本的有界案例扩展、离线脚本合同测试、Task摘要/支持证据；先只读目标，无政策PUT、来源开关、秘密/准入或故障。用现有正式入口与CAS恢复，不能临时包装Docker状态操作。
  - 完成条件：确定每项实际Server入口、精确来源/证券/窗口、当前可用性、数据与控制调用计数、预期政策代次、影响时长及CAS恢复记录；先离线验证/只读预览，再对必须修改的精确案例单独请求授权。配置/故障另拆明确案例，不借功能授权扩大范围。
  - 当前状态：四缓存功能政策代次91→95已通过并独立恢复；报价及四类均有对应真实缓存证据，随后配置5→7与单次隔离报价失败已分别授权执行通过，预检叶完成。当前代码/46定向与20维护合同重新核对通过，111/配置7确认；父项依赖及历史journal留存缺口保留。[预检](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h08-next-preflight)、[四缓存结果](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h08-four-cache-passed)、[配置结果](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h08-source-config-passed)、[故障结果](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h08-source-failure-passed)。

- [x] H08-K3b-transport-observation：依赖next-preflight已确认的原入口/计数缺口，承接H08零调用真实门禁的必要证据。
  - 精确写集：Server integration/dsa的有限缓存请求观察模块、DsaClient两处fetch桥接、对应传输测试；验收脚本计数合同及Spec§13.45/当前记录。不改变GET/POST尝试数、超时、认证、JSON/错误映射或消费者。
  - 完成条件：四数据GET与cache-context控制POST有同trace下唯一transportId、开始/结束及原attempt号；只记录pathname，不记录URL查询、请求体/响应体/headers或凭据。观察失败不改变请求；计数区分控制/数据和HTTP尝试，不把SDK页数/执行次数混称。缺完整控制/请求完成记录时不得判零。
  - 验证与边界：真实DsaClient替身HTTP定向测试、脚本离线计数测试→Server受影响测试/typecheck/build/边界尺寸→正式最小thesis-ledger同步及只读原请求。没有临时政策或故障注入；为后续精确授权准备证据，不代替其实际验收。
  - 当前结果：34项定向/24项脚本、361文件2818项回归/217条件跳过、typecheck/build/精确lint/边界依赖通过；最新正式快更及四项未选读取均1控制/0数据，政策86/86/配置目录不变。独立CLI stdout保持，完整证据见[观察记录](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h08-observation)。此叶不代收真实切代次/来源配置或故障门禁。

- [x] H08-K3b-source-config-preflight：依赖五缓存功能代次就绪，承接原Provider配置代次真实门禁，先准备精确案例。
  - 盘点/边界：原报价Reader及GET有限尝试、cache-context代次、原Provider config API/CAS与源配置恢复。当前CN股票报价只选HiThink；只读核对HiThink enabled/configVersion=5/已配置，未修改开关。临时停用会影响全部HiThink产品能力，必须明确范围/时长并另次授权；H09接续期间目标串行。
  - 写集：有限Provider配置案例及离线合同、Task摘要/支持证据；先不执行配置保存或故障。仅计划enabled关闭/恢复，禁止凭据、方法、准入、价格主备或Ledger写入；不写通用Runtime分支。
  - 完成条件：固定原600519.SH报价消费、旧缓存成立/关闭拒绝零数据/恢复新配置代次首次获取再次缓存、expectedConfigVersion和政策指纹防并行/未知提交、恢复记录。来源失败另有精确隔离案例，不借本功能/配置授权注入错误，不把SDK页数与HTTP尝试混称。
  - 当前结果：market-source-cache-case/acceptance及合同已实现，复用原报价probe，日志仅有界重读不补发消费；14项相关合同及原Server报价基线通过，97政策/HiThink5→6→7只读预览通过。没有来源开关/故障操作；H09接续问题仍待用户决定，配置真实执行须另次授权并重新核对届时政策。[完整方案](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h08-source-config-packet)。真实配置/来源失败父门禁仍开放。

- [x] H08-K3b-source-failure-preflight：依赖原报价缓存合同及控制代次就绪，承接原一次有界错误目标门禁，先准备隔离HTTP故障案例。
  - 接缝/边界：原MarketQuoteReader显式DsaClient.get(...,1)，不能用Client默认2次推断报价重试。目标原Reader/真实Redis及控制投影，先正常报价基线，再仅独立验收进程内注入一次该证券quote GET 503，不改变服务或真实上游；其他HTTP原样通过。不改源/政策/凭据/准入/Ledger，不清缓存。
  - 完成条件：精确正常基线、一次注入/一次报价GET/零实际上游SDK执行的层级说明，保留同代次有效缓存的原日期/价格/来源及缓存质量状态，控制前后相等；未授权前仅离线合同/只读预览，目标故障须另次精确授权。该叶不代替新配置代次不得消费旧缓存的独立门禁。
  - 当前状态：有限故障边界/原Reader驱动/维护CLI及26项相关回归通过，配置验收后最新103/配置7只读预览与真实控制双采样稳定核对通过；[最新执行边界](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h08-source-failure-current-packet)。仅准备叶完成，尚未在目标注入；需本次单独授权，与目标同步/新业务案例串行。

- [x] H08-K3b-source-config-case：依赖source-config-preflight就绪及本次独立授权，承接原Provider配置代次真实缓存门禁。
  - 精确边界/结果：原HiThink股票单源报价600519.SH、enabled/configVersion5→6→7，政策103未PUT/目标未变；关闭control-rejected/0Reader数据，恢复新代次首次非缓存/再次缓存且1Reader数据，原Provider启用/凭据配置/版本7及103/103原路线独立确认。工厂/凭据缓存/预算保持，无凭据/准入/Ledger/故障变更。
  - 完成条件/证据：本次原API配置CAS、政策指纹、关闭零数据及恢复新缓存独立核对均通过；[完整授权与结果](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h08-source-config-passed)。计数不等同SDK页数，只完成声明的报价配置代次切片，不代收真实来源失败/凭据旋转或其他业务门禁；该授权已使用。

- [x] H08-K3b-four-cache-case：依赖next-preflight的精确方案与transport-observation就绪里程碑，承接其余四缓存真实门禁。
  - 精确方案：当前政策91下仅追加CN/MUTUAL_FUND的NAV/history/holdings及CN/STOCK筹码四单目标，均AKshare/eastmoney；读取000001.OF及历史2024-07-15～19五日、600519.SH筹码。三项真实Server HTTP，持仓沿目标原MarketService/Reader进程及真实DsaClient/Redis，未注入Prisma，不冒充绩效HTTP。
  - 生命周期：新案例预期选择92→关闭四功能93→重新启用94并证明新代次首次单次数据/再次缓存→CAS恢复原95；基线/阶段失败立即按已确认阶段恢复。提交不明或并行政策/AK配置变化停止覆盖，保存0600恢复记录。没有Provider总开关/凭据/准入/故障变更，原其他路由/顺序不变。
  - 持久化边界：原历史NAV HTTP会入库该基金五日FundNavPoint及必要Asset身份（已有身份update为空），不写账户Ledger/业务冻结；此边界必须包含在本次授权中。禁用影响全基金三功能及全股票筹码，正常禁用窗预计少于60秒；临时选源和实读整体通常数分钟。
  - 写集/验证：market-additional-cache-case/acceptance、market-cache-request-evidence、market-cache-target-reader及对应离线合同；复用原政策/schema/CAS/日志。保留历史年龄stale与最新NAV delayed，缓存标记独立；只等待本trace日志收集最多5次/总1秒，不补数据请求，缺证据仍失败，冲突不等待。28项脚本与目标未选拒绝通过；新命令`--execute --authorized-four-cache-case --expected-policy=91`，CLI flag不构成授权。
  - 当前结果：91→95本次精确案例通过，关闭窗约1.82秒，四项选源及重新启用各1数据/首次false再次true，关闭各1控制/0数据且拒绝；原路由/配置/目录恢复独立核对通过。[完整结果](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h08-four-cache-passed)。三次各自授权/失败/恢复记录保留；配置/来源失败、真实绩效消费/新冻结仍归后续门禁，父项不由本叶代收。

- [x] H09-K2-price-preflight-next：依赖原K2合法价格要求与当前绑定就绪，承接既有组合消费/新冻结的数据资格缺口。
  - 边界：沿原selectMarketWindowV3、DsaClient、当前Desired/Effective/目录，用priceResearch=true核对600519.SH及000001.SZ在2026-10-08～09的同口径qfq；最多两个窗口，各仅原选择器的有界请求。只读，不写窗口仓、路由、准入、凭据、Ledger或快照，不绕过invalid_proof/覆盖/研究条件。
  - 完成条件：逐窗口记录实际状态/错误/数据调用和政策稳定性，区分价格资格与其他必需事实；若仍不合格保持K2未完成，不能推断所有证券或换研究模型。若合格，再沿原Builder/冻结目标依赖准备后续独立功能政策授权。
  - 当前结果：88下两窗各1次原数据读取，HiThink 422/insufficient-coverage，备用incompatible_backup/invalid_proof；原研究选择器未取得合格价格，H09-K2父项保持未完成。Desired/Effective/目录事实稳定；[结果](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h09-two-window-preflight)。下一步沿实际错误接缝只读定位覆盖不足，不放宽证明或改研究语义。

- [x] H09-K2-research-options-preflight：依赖两窗预检及原K2读取接缝，修复验收驱动遗漏的既有研究读取选项，承接合格价格必要缺口。
  - 盘点：原Builder/Preparation/Preflight复用backtestResearchReadOptionsV3；固定来源normalized-series原意图同时含tradabilityMode=assume-untradable-no-bar与priceResearch=true。前述只读驱动只传后者，未完整模拟原消费；DSA研究日历识别依赖前者。此前结果只证明该不完整请求失败，不能证明原Builder同请求也失败。
  - 写集/边界：只读验收驱动、必要合同核对、当前Task/支持记录。复用既有helper而非手写供应商或新协议；最多原两个证券/2026-10-08～09窗口，当前95政策/目录。无政策/准入/账户/窗口仓/冻结写入，不改现行invalid_proof或生产研究选项。
  - 完成条件：用原helper产生既有固定来源normalized-series读取选项，记录标准请求、实际选择/错误/调用及前后控制事实；合格仅开放后续原Builder消费条件，不直接声称新冻结通过。新业务语义或必要政策变更仍停在其授权边界。
  - 当前结果：直接复用原helper，95下两窗均HiThink主源selected/两条bar/各1次数据，无错误，Desired/Effective/完整目录事实稳定；[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h09-original-options-passed)。未写新窗口仓或冻结；后续实际Builder准备窗口及其他依赖仍需验收。

- [x] H09-K2-target-packet：依赖完整原研究选项价格预检就绪，承接原H09-K2真实业务组合与冻结，准备可审查的精确执行包。
  - 边界/写集：既有支持研究模型和原策略Schema组成隔离验收输入，原Server策略/prepare/run API及现有Worker/Builder/ArtifactStore，验收脚本与离线合同。不更改生产模型、价格备用规则或真实Ledger；不改写既有策略版本、旧运行或资产。
  - 完成条件：固定证券/窗口、原研究协议/模型、必要新验收策略/Run/快照写入边界、五项独立功能路线与来源、可选源真实失败留存、CAS/配置指纹恢复；离线合同与只读预览通过再单独申请临时功能政策授权。目标成功后用原只读Worker Runner网络阻断两次重放，并逐产物核对时钟/来源/覆盖/采用事实，不以Schema或源单读替代业务快照。
  - 当前结果：原准备/接续/显式新案例及各次授权/失败/恢复证据保留，实际一个策略/版本、五条failed Run及一条succeeded Run；错误失败发生于原Server同步Snapshot创建，成功后由原Worker执行。最新109→111已生成真实五组合事实/三可选失败/十产物并两次断网重放一致，111原路线/两配置0恢复，原版本/输入/研究模型保持。[真实闭环](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h09-real-composition-freeze-passed)。
  - 下一执行边界：本执行包及K2目标切片完成，不再重跑或创建该案例Run；后续H10真实保存受浏览器权限阻塞，H07实际准入/账号与最终Review独立。临时政策按§0最新默认授权与精确CAS边界，未知提交/并行变化仍停止覆盖；结果partial及三失败如实保留。
  - 历史授权/证据：[执行包](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h09-composition-packet)、[首轮授权](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h09-composition-authorization)、[准备中及恢复](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h09-composition-preparing)、[接续授权](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h09-composition-resume-authorization)、[Worker失败及恢复](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h09-composition-worker-failure)。两次授权均已执行，不延用；公告任务零匹配不当覆盖证明，H08配置/故障独立保留。

- [x] H09-K2-status-error-envelope：依赖真实Worker失败证据，承接原标准错误/部分失败合同及新冻结阻断的必要修复。
  - A01：api/thesis_ledger_status_capabilities.py捕获ProviderCallError后使用Control/旧错误_error，detail含contractVersion=3及平铺code/message/diagnosticId；DsaDataCapabilityReaderV3按现行marketDataErrorEnvelopeV3Schema要求error对象，正确拒绝为invalid-response，导致可选源错误中断Builder。原日线已有标准信封，无需放宽消费Schema或吞异常。
  - 精确写集：共享Data错误Schema增加真实unsupported_capability及固定安全文案/对应Mapper；DSA复用日线标准安全投影的API所有权helper，原日线helper委托同一实现，独立状态端点改用标准信封；真实FastAPI错误/共享Wire/Server组合合同测试、必要CHANGELOG及原Spec/Task记录。不改SDK/预算/凭据/路由/研究或SourceRevision，不恢复旧V1/V2。
  - 完成条件：能力不支持、无可用目标、覆盖/身份/权限/凭据和参数错误的真实HTTP信封有正确请求关联/固定安全文案，消费端按原类型分类；非法/错关联信封仍拒绝，可选标准失败保留其他事实。定向→共享/受影响Server与DSA→边界/复杂度→正式最小all代码同步及只读错误核对；新的业务/临时路由另次授权。
  - 当前结果：生产投影/显式能力错误及全局HTTP处理已修复；完整DSA/Control受影响136项、Schema1044、Server全包2828通过，边界/语法/依赖/复杂度/typecheck/build通过，原尺寸警告保留。正式all及追加最小dsa同步退出0，三个服务健康/镜像不变；原DsaClient真实503/422标准信封、固定消息/请求关联及政策99/99不变核对通过。[最终证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h09-standard-error-target-passed)。只完成错误合同叶，旧Runfailed及真实新组合/冻结父门禁保留。

- [x] H09-K2-new-case-after-error-fix：依赖status-error-envelope目标核对，承接原K2真实组合/新冻结的修复后验收。
  - 边界/写集：验收脚本显式新案例入口和隔离合同；只接受原已恢复、已确认failed且没有最终快照的Run记录，通过原API只读核对身份/终态/策略版本/原输入。保留旧Run，不调用retry/cancel；新授权后仅同五功能政策、原版本与同一模型/窗口，原prepare及最多一条新Run。
  - 完成条件：未知提交、非failed、身份不符、策略/配置/输入或原政策变化均拒绝；正常原准备/新运行/恢复边界及只读预览通过，再申请本次精确授权。真实组合、可选失败、原Worker两次断网重放仍归K2父门禁，缺项不代收。
  - 当前结果：前五failed Run及各次授权/恢复保留；修复后的109→111案例原Worker succeeded，五事实/三个可选真实失败、新十产物及两次断网重放一致通过；111原路线/两配置0独立核对、原模型保持，结果按两日指标规则partial、数据快照complete。[真实结果](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h09-real-composition-freeze-passed)。没有重试/改写旧Run。

- [x] H09-K2-creation-observation：依赖本次真实晚到提交证据，承接K2真实新冻结执行包的必要生命周期缺口。
  - A01/边界：原Server create同步Snapshot后持久化/投递Worker；目标DsaClient原120秒，宿主POST90秒提前中断且仍恢复路由，晚到读取正确拒绝新政策。Run摘要无幂等键，必须读取原版本候选明细确认。只修改验收脚本/合同/文档，不改生产预算/超时/SDK、Reader修订检查或研究；不重试POST/旧Run。
  - 完成条件：保留原90秒POST，在传输提交不明时预写阶段，按原幂等键/版本/输入只读有界确认，等待期间核对本案例政策所有权；确认或截止后才收敛恢复，摘要零匹配不当缺失。离线合同/只读预览通过后新的临时政策及最多一Run仍需另次授权；真实组合/冻结/Worker离线父门禁不代收。
  - 当前结果：有界提交确认/原记录只读补证脚本已实现，10项定向及26项H08/组合回归通过，语法/diff通过；旧记录未改写，新0600旁证确认晚到failed Run。101→102→103只读预览就绪，POST仍90秒，提交不明后最多45秒GET确认及政策/配置复核，不重发POST、不改原120秒来源窗口。仅执行包修复叶完成，实际组合/新冻结/离线仍未过；[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h09-creation-observation-packet)。下一轮须新的精确授权。

- [x] H09-K2-policy-projection-fence：依赖101→103真实创建失败，承接原组合控制修订/冻结的必要接缝修复。
  - A01：market-status-composition-reader-v1.ts整份deepStrictEqual有效政策，包含每次投影重新生成的appliedAt；实际连续原Control读取103/103只有appliedAt变化，routes/其他字段相等。DSA control.py在投影处使用当前时刻，既有事件/现金身份比较已排除appliedAt；本次不是政策修订变更。
  - 精确写集/边界：Market组合Reader及合同测试、原Spec/Task/支持记录；仅比较时排除投影采样appliedAt，首份完整政策时钟仍冻结。其他全部字段、真实修订/目标/启停/资格变化仍拒绝；不改Source时间/预算、生产政策、SourceRevision、旧快照或研究，不增加消费者供应商分支。
  - 完成条件：真实投影采样时钟变化的隔离复现/通过，修订/来源Desired修订/启停/目标等变化仍失败；定向→受影响Server/typecheck/build→边界/复杂度→正式最小thesis-ledger同步及真实只读投影核对。新的组合政策/Run仍需另次授权，不能用此叶代收K2。
  - 当前状态：红测复现后定向38项、Server2836通过/217条件跳过，typecheck/build/精确lint/边界依赖复杂度通过；正式最小thesis-ledger同步及目标真实Control双采样103/103仅appliedAt不同、编译代码核对通过。[完整证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h09-policy-projection-fence-passed)。仅修复叶完成，新组合/冻结未过；下一103→105案例[执行包](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h09-policy-fix-new-packet)已只读预览，需新授权。

- [x] H08-K3b-source-failure-case：依赖source-failure-preflight、正式目标同步及本次独立故障授权，承接原报价有界错误真实缓存门禁。
  - 完成条件/边界：真实原Server基线、独立原Reader一次精确报价GET503及同代次last-valid回退，价格/来源/原时钟保持、实际质量披露、控制不变，finally还原fetch/释放Redis；无服务/上游/政策/源配置/凭据/准入/Ledger/旧资产变更或缓存清除，不自动重跑。
  - 实际结果：一次注入/一次HTTP/注入调用零SDK，实际freshness=live/stale=false，缓存价格/来源/marketTime/fetchedAt保持；0600记录verified，原政策103/103与HiThink配置7独立确认。[授权与结果](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h08-source-failure-passed)。本次授权已使用；正常基线SDK不计作零，不代收其他来源/业务或H09冻结门禁。

## 验收映射与最终一致性Review

- [x] H07-K38aa-quote-public-units：依赖K38z及API实际接缝审计，承接AC05/14/20单位适配不进入公共业务入口的既有义务。
  - A01已定位：api/thesis_ledger.py::_real_quote在Gateway完成后按provider==hithink调用api/thesis_ledger_quote_units.py；该模块校验HiThink原snake_case单位并投影camelCase。来源quote处理器仍给内部桥接对象复制units，股票share/CNY、ETF量额unknown不可混用。实际市场Schema在packages/schemas/src/market.ts，原HTTP单位失败upstream_invalid_response/502发生在完成Gateway之后，不能迁移后新增切源或SDK读取。
  - 精确写集：有限公开单位合同/来源投影声明与校验、HiThink来源拥有原单位映射/错误，原API单位模块改通用分发、_real_quote移除名称条件且净缩减；对应原HiThink/HTTP与新来源隔离合同/能力边界，原Spec/Task/支持记录/指南。主Schema按实际兼容条件决定必要写集，不先假设扩大字段；SDK/工厂/4.5s/缓存/研究/用户路线/冻结保持。
  - 完成条件：原股票/ETF量额边界及未知保持；缺失/漂移/错实际来源仍原HTTP错误，不增SDK或改变主备/错误发现时机；其他未声明来源保持原省略单位，新provider只声明同一标准单位投影即可从原HTTP路径公开、业务无供应商条件。定向→受影响包/静态及必要正式同步/原报价只读核对分层记录。
  - 当前状态：71定向/2889限定回归、14加强的新provider原Runtime/HTTP合同和静态通过；正式最小dsa同步/五文件匹配，原DsaClient单次真实报价/共享解析与Server消费通过，111政策保持。主Schema未改、单位检查时机不移前、无新增SDK/切源；完整结果/别名属K38ab。[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38aa-quote-public-units)。

- [x] H07-K38ab-quote-result-schema：依赖K38aa的单位合同就绪里程碑，承接原AC01/04/14请求/结果强Schema和标准对象隔离义务。
  - 已确认缺口：QuoteQuery为强Pydantic模型，QuoteValue当前是Protocol；validate_quote只校验必要价格/OHLC，返回原对象，pre_close缺失时原位补值。部分返回是DSA统一Quote或来源SimpleNamespace，不能笼统称全部为原SDK DTO；结果字段/副作用/Schema边界仍需按真实源与消费者核验。
  - 下一A01：逐精确报价绑定核对标准与SDK内部结果、必要/可选数值、来源/时钟、单位和原wire样例；同时api/thesis_ledger_source_identity.py仍有已确认SDK别名表，区分旧响应兼容与实际来源，不从注册事实伪造未报告上游身份。完成精确写集/原行为后才实施强Schema/标准结果投影，不把全部来源合成一次SDK重写。
  - 完成条件：原有效报价/未知量额/时钟/必要推导/实际来源及旧HTTP/缓存行为保持，标准结果无原位修改来源对象/额外SDK字段透传；坏结果与错关联按实际原合同拒绝，新增同类来源不用公共SDK别名/执行分支。原Sdk/权限/预算和冻结不变，受影响验证/目标层分别保留。
  - 当前状态：冻结QuoteResult复制校验、标准来源/单位及安全错误延后完成，SDK私有字段不透传/源对象不修改；184定向、时间观察修复79定向/2926限定回归、静态/11维护合同通过，正式最小dsa同步/六文件匹配，真实原客户端/Server首读/次缓存与111政策/配置7/140目录保持。Tushare原时间仅unverified观察，SDK不变；父项完整Review及真实资格仍保留。[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38ab-quote-result-schema)。

  - 本轮精确写集/契约：新quote_result_contract强模型，quote_validation复制校验/推导，Registry报价桥接标准来源及单位/延后错误、原Runtime二次校验复用；原API仅消费标准upstreamSource/单位或安全错误，原公开格式化保持。新结果合同/原HiThink内部断言按强类型单位调整/能力边界，原Spec§13.63/Task/支持记录/指南。14源SDK读取器/工厂/预算/分页、主Schema/用户配置/修订与冻结不改，不用SDK私有字段袋假装标准结果。

- [x] H07-K38ac-daily-public-units：依赖K38ab及实际API调用链审计，承接AC04/05/14/20字段差异由来源拥有的既有义务。
  - A01：api/thesis_ledger_source_basis.py::native_field_units由完整窗口和图表响应调用，直接解析hithink_etf_field_units/native_daily_contract并比较HiThink/AK源名。HiThink仅一个CN/ETF/1d/qfq绑定、AK/Eastmoney六个既有精确日线绑定；已有field_units测试覆盖两源单位、坏合同、请求范围、原值与指纹。
  - 精确写集：日线标准单位/有限纯投影策略合同、DailyBinding可选策略及校验、原AK日线合同/HiThink ETF适配模块拥有私有解析与来源声明；原API改为精确绑定查找/标准结果消费，边界门禁与定向合同、原Spec§13.64/Task/支持记录。无SDK/工厂/预算/分页/凭据/源修订/目录/用户路线或旧冻结变化。
  - 完成条件：原缺合同省略、AK股票hand/CNY与ETFunknown、HiThink已核验范围fund-unit/CNY及范围外unknown保持；错目标/双合同/非法单位仍原HTTP失败，数值/检查时机/指纹不变；隔离新provider声明自己的不同私有结构即可复用标准投影，不改公共来源分支。定向→受影响集合/静态→正式最小同步与必要只读目标检查分别记录。
  - 当前状态：119定向/2946限定回归、加强原Runtime/图表新来源证明36合同及静态通过；正式最小dsa同步/七文件哈希，原客户端159516合格窗口68条及fund-unit/CNY、510300交互五条/单位省略通过，111政策保持。510300旧完整窗无覆盖仍拒绝；不代收多窗口或父项Review。[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38ac-daily-public-units)。

- [x] H07-K38ad-daily-window-plan：依赖K38ac与原多窗口调用链，承接AC01/04/14/20来源参数差异隔离及原有界查询行为。
  - A01：api/thesis_ledger.py仅一处调用try_hithink_multi_window_v3；公共api/thesis_ledger_multi_window_v3.py按HiThink目标/ETF/qfq/1d判断并用来源五年算法分窗。原所有子窗先覆盖预检、再共享4.5s总期限，原执行器逐窗控制检查、交集冲突即停/并集与冻结协议保持；无全量实时窗口资格。
  - 精确写集：有限日线窗口计划上下文/强Schema/关联校验、DailyBinding可选规划器及注册校验；原HiThink ETF适配模块拥有五年/会话交集算法并仅原qfq绑定声明；公共多窗口入口查同一绑定、原API调用名及原测试同步；新计划合同/能力门禁，原Spec§13.65/Task/支持记录/指南。不得改SDK、子窗执行/控制、原8次/4.5s上限、覆盖/分页合并与旧指纹/冻结。
  - 完成条件：原三窗/预算/缺交集、冲突/权限/缺条/未完分页/迟到HTTP回归保持；未声明单窗路径保持，不自动分窗全部来源；来源规划器不执行数据，坏强Schema/越界或无交集计划在执行前拒绝，新隔离provider可声明同一计划无需公共来源分支。定向→受影响/静态→最小正式同步及原已选合格单窗只读核对分层记录，多年真实来源不借fixture冒称通过。
  - 当前状态：68定向/2964限定回归与静态通过；原来源六失败场景及不同会话规划的新provider均沿同一HTTP调度，坏计划执行前拒绝。正式最小dsa同步/六哈希，原客户端159516合格单窗68条/原单位、111政策及配置7保持；多年真实分窗未冒称通过，不代收在线资格或父项Review。[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38ad-daily-window-plan)。

- [x] H07-K38ae-query-operation-boundary：依赖K38ad与AC06/08注册操作审计，修复现有查询绑定误声明订阅的必要缺口。
  - A01：QueryBinding/EventBinding拒绝operation=subscribe，但DailyBinding/QuoteBinding只核对contract.operations；扩为query/subscribe后可将无订阅生命周期的read处理器登记为subscribe。dataclass的Literal注解本身不执行校验，现有负测只覆盖合同默认仅query时的错误操作。
  - 精确写集：DSA capability_registry.py现有查询类共同操作拒绝、原注册合同补齐四类/140目标负测与合法查询保留；原Spec§13.66/Task/支持记录/指南/CHANGELOG。不得建立生产订阅、改变SDK/工厂/超时/分页、生产目录/路由/凭据/准入或旧冻结；测试能力仍不入生产。
  - 完成条件：即使能力合同包含query/subscribe，所有现有查询绑定仍不能声明subscribe，注册前零工厂/数据调用；能力可以复用语义但来源不由合同操作全集获得生命周期资格，合法query及resolve(subscribe)原拒绝保持。定向→受影响/边界→必要最小同步及目标140项均query核对分别记录。
  - 当前状态：140负测复现97错误接受/43原拒绝，统一注册操作核验后197定向；与af共同270最终定向/3181限定回归及静态通过，正式最小同步/目标四类均拒绝/零工厂和数据调用、140项仍query，111政策/配置7保持。H07真实资格/其他父项未代收。[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38aef-registration-boundaries)。

- [x] H07-K38af-non-bar-key-boundary：依赖K38ae定向操作边界就绪，承接AC02/06精确身份及能力参数隔离义务。
  - A01：ExactKey.route_key仅在DAILY_BAR输出adjustment，其他能力会丢弃该成员；注册只拒绝QuoteBinding非空adjustment，Query/Event可携带被隐藏的日线价格口径。实际140目标的非日线键均无此成员，不需改变任何生产组合。
  - 精确写集：DSA capability_registry.py原价格口径检查推广到所有非日线绑定，原注册合同逐非日线目标证明错误成员被拒绝而不是静默归并；原Spec§13.67/Task/支持记录/指南/CHANGELOG。无RouteKey新增可选字段/能力专有参数泛化、SDK/工厂/修订/目录/政策/冻结变化。
  - 完成条件：原报价拒绝保持，Query/Event即使公开键丢弃该字段仍在注册前拒绝；所有合法非日线键及已登记日线口径保持，零工厂/数据调用、无供应商名单。与ae共同的受影响集合/边界及正式最小同步按实际输入验证，目标登记视图保持。
  - 当前状态：72负测复现43错误接受/29原报价拒绝；修复后与ae共同270最终定向/3181限定回归及静态通过。正式最小同步/目标72非法键全部拒绝、四登记/消费视图与ad完全相等、零工厂/数据调用，原有效组合/源修订保持。[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38aef-registration-boundaries)。

- [x] H07-K38ag-canonical-capability-contract：依赖ae/af实际注册边界就绪，承接AC02/03/07同一标准能力复用及新增能力契约义务。
  - A01：Registry.query要求绑定合同等于调用方标准合同，但注册未核对不同来源的同capability/version合同一致性。隔离ORDER_BOOK第二来源换请求Schema后仍注册成功，公共标准查询随后不匹配；当前140绑定的17合同组实际上全一致。
  - 精确写集：DSA capability_registry.py从注册绑定临时派生capability/version合同视图并拒绝冲突，不新建第二事实表；原注册/ORDER_BOOK合同覆盖请求Schema、结果/绑定/关联校验和操作冲突、合法同合同及不同版本；原Spec§13.68/Task/支持记录/指南/CHANGELOG/必要架构。无生产来源/SDK/工厂/目录/修订/政策/冻结或现有能力重写。
  - 完成条件：第二家同类来源复用同一标准合同，不得用同名同版本替换Schema/校验器/语义；冲突在工厂/数据调用前拒绝，等价显式合同可复用，不同合法版本分开表达。原新provider/两输入/生命周期及生产17合同/140目标保持，定向→受影响/边界→正式最小同步及目标核对分层记录。
  - 当前状态：五项红测复现后276定向/3188限定回归及静态通过；等价复用/合法版本共存保持。正式最小dsa同步、目标Registry哈希/17合同组一致、同版本冲突拒绝/零工厂及数据调用、111政策/配置7保持。剩余真实资格/浏览器/父项门禁不代收。[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38ag-canonical-contract)。

- [x] H07-K38ah-factory-error-boundary：依赖ag及Runtime实际工厂调用链，承接AC03/04/09新来源复用/标准错误与凭据隔离义务。
  - A01：同一隔离工厂抛CapabilityContractError(permission_denied)，route作用域直接逸出标准能力错误，provider作用域被_adapter通用异常改成not_configured；unscoped亦在该try之外。工厂缓存作用域不应改变标准错误分类。原OAuthStateError/ControlContractError及其他异常仍有既有独立边界。
  - 精确写集：DSA有限工厂执行模块，仅调用一次已声明factory/ReadContext，将标准能力工厂失败转公共ProviderCallError；Runtime三工厂入口复用，删除经引用核验的未使用SimpleNamespace导入以保持大文件规模，原OAuth/控制/通用异常不改；新增工厂错误隔离合同/能力边界、原Spec§13.69/Task/支持记录/指南。无来源SDK/工厂定义/快照读取/缓存键/预算/分页/目录/政策/冻结改变。
  - 完成条件：route/provider/unscoped标准权限/参数/覆盖错误代码与retryable一致，一次工厂/零数据调用、原凭据读取次数及失败不发布缓存；失败消息固定安全文本，不暴露工厂原文/诊断中的凭据。非标准异常保留原路径；新provider无需公共供应商分支。定向→受影响/边界→必要最小同步/目标原已配置消费分层验证。
  - 当前状态：九红测后110定向/3200限定回归及静态通过；Runtime行数1592不增。正式最小dsa同步/两哈希、目标三入口标准权限拒绝/安全消息/无缓存/快照读取0/1/0、原DsaClient及Server报价/原单位、111政策/配置7保持。未改SDK/其他异常/真实配置，不代收账号或浏览器门禁。[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38ah-factory-error-boundary)。

- [x] H07-K38ai-local-source-readiness：依赖ah与目录就绪实际调用链，承接AC02/03/14/20来源拥有实现差异及目录/执行一致性义务。
  - A01：Runtime目录准入先调用local_rule_source_ready，公共local_rules按CN费用、公告、港美包选择路径；四来源模块已拥有定义/工厂/读取。配置路径的local_rule_route_matches同样调用来源匹配器。实际140目标中12旧本地目标匹配且ready=true，其余None；独立公告七能力继续原配置语义，不扩大文件存在资格。
  - 精确写集：有限CatalogReadinessContext/SourceDefinition可选纯就绪声明与注册校验，四来源模块拥有原文件/公告库检查；公共local_rules由精确绑定/声明派生而不选择供应商，原匹配接口与空旧进口视图保持；新隔离就绪合同/现目录与门禁，原Spec§13.70/Task/支持记录/指南。无读取器/文件/摘要/源修订/SDK/凭据/政策/研究/冻结变化。
  - 完成条件：全部140 key/target的原match/ready逐项相等，12既有范围/文件缺失false/公告库兼容保持，其他能力None原路径；来源回调不执行工厂/SDK/保存，非bool/None拒绝。新provider声明自己的本地就绪无需公共分支；定向→受影响/边界→正式最小同步/目标目录与消费分别记录。
  - 当前状态：八红测后117定向/3214限定回归/静态通过，140原匹配/就绪逐项相等。正式最小同步/七哈希、目标140同前/十二ready、原DsaClient完整目录140项/修订1215469019685014及原报价/单位、111政策/配置7保持；独立公告七能力仍原路径。不将ready视为覆盖或准入。[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38ai-local-source-readiness)。

- [x] H07-K38ab-a-quote-source-aliases：依赖K38aa及K38ab实际来源库存，承接K38ab标准结果来源前置契约。
  - A01：api/thesis_ledger_source_identity.py全局表识别Futu/AK/EF/腾讯/HiThink SDK标识，_real_quote不传provider；其他已绑定源的未报告标识目前省略。标准结果与单位不能根据登记目标伪造SDK已报告身份，先将现有有效别名归来源声明。
  - 精确写集：SourceDefinition.quote_source_aliases/有限注册校验、五来源原别名声明、原API来源归一化查声明并传实际provider；新别名合同/原单位新来源fixture/边界，原Spec§13.62/Task/支持记录/指南。无SDK/Factory/凭据/修订/目录/政策/研究或冻结变化。
  - 完成条件：全部原有效别名/枚举/大小写归一化保持，未报告/未声明/错来源保持未知，不填目标；新provider只声明自己的已绑定别名可经原HTTP公开，不改公共表/执行分支；定向→受影响包/静态及必要正式同步/真实报价分层验证。K38ab结果Schema其他义务保留，不由别名片代收。
  - 当前状态：25新合同、102定向、fixture声明清理后97定向/2914限定回归与静态通过；正式最小dsa同步/八文件匹配，原客户端真实来源/单位/时钟与111政策/配置7/140目录保持。仅前置声明完成，完整结果/原对象修改及单位隔离义务仍归K38ab。[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38aba-quote-source-aliases)。

- [x] H07-K38z-manifest-source-facts：依赖K38y及公共构造器实际引用审计，承接AC14/20单一登记事实与公共供应商分支收拢。
  - A01：provider_manifest.build_provider_manifest按AK/Sina/DAILY_BAR删除ETF，AK来源build_akshare_manifest依赖该隐式例外。Sina已有三股票精确日线；其余旧宽声明（含腾讯资产视图）不同于精确执行范围，本片不改变。build_akshare_manifest只有AK来源一处生产调用，19生产manifest已采样作为逐字段迁移基线。
  - 精确写集：通用provider_manifest删除该供应商条件，AK来源从自身Sina DailyBinding派生资产参数、其专属模板接收参数；新manifest事实合同/能力边界及原Spec§13.60/Task/支持记录/指南。公共Runtime/Control/业务不改，不新增中央表或任意动态插件，不改SDK/修订/目录/配置/资格/研究。
  - 完成条件：19全部manifest与迁移前完全相等，Sina股票/ETF事实仅随其绑定变化，通用构造器无供应商名单；原目录/控制/报价/日线回归、静态与必要正式最小同步/只读核对分层记录，不将宽声明当作有效组合。
  - 当前状态：244定向/2875限定回归与静态通过；19生产manifest迁移前/后/目标逐字段相等，正式最小dsa同步/三文件哈希/111政策/配置7/140目录保持；未改源修订/资格。完整公共Review仍保留。[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38z-manifest-source-facts)。

- [x] H07-K38y-research-instrument-binding：依赖K38x，承接AC05/14及原研究身份/单位事实的已定位供应商分派。
  - A01已完成：API backtest_instrument_facts先validate_instrument_request再parse_data_as_of/精确路线参数完整检查，随后instrument_facts_response；reference_identity按两Yahoo名称/单证券放行none，dependency_facts按市场选择两来源包并校验同一价格来源。qfq通用身份观察不核验历史单位/状态；两源原包窗口与观察截点不等于真实交易规则。复用packages/schemas/src/backtest-data.ts的instrumentFactSchema（单位成对未知、时间/来源/修订/执行规则），不得另建事实系统或改原接口顺序。
  - 精确拟写集：DSA能力注册表的有限身份/单位策略、Yahoo来源两有界绑定、独立research_instrument契约/关联校验、reference_identity与dependency_facts公共选择，新身份绑定合同及原dependency_facts/两窗口API回归；原Spec/Task/支持记录/指南。主仓InstrumentFact Schema只读复用，API签名/冻结格式和CN其他事实不变；源私有包读取/单位/观察时钟/原错误保持，不新增用户路由/资格或研究。
  - 完成条件：原GME.US/00147.HK none精确源/窗口/单位/截止保持，qfq未核验单位与状态保持，错误源/身份/单位/时钟拒绝；无旧公共名称分派、新provider只声明同一强类型策略即可经原事实入口执行。定向→受影响包/静态及必要正式同步/分层只读核验；旧结果/原资产不写，不把来源资格拒绝当SDK成功。
  - 当前状态：91定向/2871限定回归、27加强合同与静态通过，正式最小dsa同步/五文件哈希一致；目标原DsaClient两原包身份事实/四拒绝、原111政策/配置7/140目录保持。Worker输入未改复用K38w断网核验，不称线上Yahoo或新HK/US冻结通过。[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38y-research-instrument-binding)。

- [x] H07-K38x-research-frame-projection：依赖K38w及零量真实接缝，承接AC05/14来源DTO/attrs不由公共研究消费者解析的必要缺口。
  - A01：market_tradability_input和API原桥接调用executable_research_frame；公共函数识别Yahoo及读取responseSha256/excluded attrs，原算法保护零量坏数据且不修改来源帧。需把来源元信息投影归来源，不删除零量限制或把零量推断停牌。
  - 精确写集：有限ResearchFrameContext/FrameProjection、DailyBinding可选投影校验、Yahoo来源声明及源内零量适配模块、公共zero_volume入口仅按绑定/原模式调用；新投影合同/原零量及两按股窗口测试/能力边界；原Spec§13.58/Task/支持记录/指南。保留旧帧桥接和V3冻结事实，不改SDK/网络/分页/源修订、研究或用户路线。
  - 完成条件：qfq港美股票/HK none原证券范围、坏OHLC/金额/摘要/重复拒绝、原帧不改/重复投影保持；无声明或非原研究模式零投影，新provider仅声明同一投影可从原入口执行、错误/返回类型隔离。定向→受影响包/静态及正式最小同步/原冻结只读复核分层记录，不宣称新业务能力或真实在线资格完成。
  - 当前状态：60定向、完整key fixture修正后36定向/2844限定回归、静态和正式最小dsa同步通过；五文件哈希/111政策/配置7/140目录保持。原Worker/冻结输入未改，复用本轮K38w断网核验；身份事实及真实在线资格另保留。[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38x-research-frame-projection)。

- [x] H07-K38w-research-calendar-binding：依赖K38v及研究接缝实际调用链，承接AC05/14消费者不识别供应商、旧覆盖保持的必要缺口。
  - A01：research_market_coverage_context两处调用_research_request判定是否补日历/允许上市未知；函数按腾讯/HiThink/Yahoo名选择原语义及Yahoo包，旧覆盖优先。零量入口market_tradability_input、身份入口dependency_facts另有原来源边界，后续独立迁移，不机械删判断或扩大研究。
  - 写集：DailyBinding有限日历资格声明/校验及强类型ResearchCalendarContext；腾讯/HiThink/Yahoo源内原规则；research_calendar公共唯一绑定选择，原/新定向合同和能力边界；原Spec§13.57/Task/支持记录/指南。源/适配修订、原包、SDK/分页/预算、现行日历内容、消费/冻结协议不变。
  - 完成条件：原CN none/qfq范围与证券校验、港美qfq已核验身份、两none包窗口/时钟保持；hfq/未绑定/不匹配/无原协议拒绝、旧窗口优先且旧结果相等；新来源仅声明同一资格即可参与原日历入口，不改公共供应商分支。定向→受影响包/静态及正式最小同步/必要原冻结只读复核分层记录。
  - 当前状态：100定向/2834限定回归与静态、正式最小dsa同步/六文件哈希/原111政策只读通过；同成功Run五事实/十产物及原Runner两次断网一致/0网络/hash与checksum保持。不关闭身份/零量或真实在线资格门禁。[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38w-research-calendar-binding)。

- [x] H07-K38v-policy-admission-guard：依赖K38t及实际公共接缝审计，承接AC14/20供应商后置准入守卫收拢。
  - A01：price_route_access的HiThink现金在event_admission_reader之后再取凭据/匹配修订，是仍有效的竞态防护；报价/日线已从绑定基础配置短路，末尾报价fallback不可达。腾讯ETF专属基础函数仅被旧测试引用，无生产调用；不据此扩大消费资格或删除研究边界。
  - 精确写集：DSA有限PolicyAdmissionContext/SourceDefinition守卫校验、HiThink来源守卫、公共price_route_access通用调用/删除不可达fallback及测试专用腾讯helper；新政策准入合同/原腾讯基础报价测试/能力边界，原Spec§13.56/Task/支持记录/接入指南。公共SQL和事件检查顺序保持，不传Runtime/连接；源修订、SDK、凭据缓存、预算、路由/准入和研究不变。
  - 完成条件：原现金凭据复核次数/顺序、未准入零后置读取、凭据/修订变化拒绝；基础路径不增加读取，其他来源原状态保持；隔离新provider仅声明守卫即可参与原政策入口。定向→受影响能力包/静态及正式最小同步/只读原控制分层记录，不把资格拒绝当真实SDK成功。
  - 当前状态：红测→73定向及17新合同、2779受影响/静态、正式最小dsa同步/四文件哈希与原111政策/配置7/140目录只读核对通过；未改源修订或资格。H07/K38父项未收口。[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38v-policy-admission-guard)。

- [x] H08-H09-obligation-reconcile：依赖已有缓存/功能及组合冻结真实结果，承接H08/H09父项过期摘要与依赖对账。
  - A01：K3-context/K3b-generation/next-preflight仍未勾选且保留“当前未执行”，但下游报价84→86、四缓存91→95、来源配置5→7和隔离一次错误已经逐次授权执行恢复；H09-K1/K2及当前原Worker重放通过。旧摘要不能代替当前状态，历史journal不可读也不能改写当时结论。
  - 写集/边界：仅原Task/对应支持记录/矩阵必要证据链接，核对实际MarketCacheControl及五缓存消费者、DsaDataCapabilityReaderV3组合与原Snapshot/Runner，补做定向合同；不重做故障/临时政策或新建Run，不改源码、研究/旧冻结或原授权。
  - 完成条件：逐义务列代码/合同/真实层/当前复核及未覆盖项，按完成条件收口子叶；父项未满足依赖仍保持未勾选，不用下一叶计划或原A–F代收。当前46项缓存/控制/组合/冻结定向、20维护脚本及门禁通过，逐项证据/边界对账完成；父项依赖与历史journal留存缺口保留。[对账](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h08-h09-obligation-reconcile)。

- [x] H07-K38u-all-provider-check-regression：依赖K38t扩查，承接原逐来源精确诊断回归义务。
  - A01：此前能力包限定test_thesis_ledger_*.py，不覆盖test_all_provider_exact_checks.py；本轮扩查该真实SQLite/HTTP接缝文件3失败：空政策fixture缺独立诊断实际修订、腾讯日线fake缺原逐年传输事实、HiThink仍patch公共入口已退役Adapter位置并返回旧原始列。不能将限定目录通过声明成全测试目录通过。
  - 精确写集：仅该诊断测试输入及原Task/支持记录；建立隔离实际空路线政策1（读取前）、完整腾讯传输fixture、patch当前来源拥有的Adapter与标准投影字段，原成功/源错配拒绝/生产归一化/全来源零写条件保持，不修改生产执行、门禁阈值或实际配置。
  - 完成条件：该文件及受影响来源/目录合同通过，真实SQLite/HTTP只读表不变证明保持；全测试范围据实际分别记录，不掩盖其他缺口。当前253项受影响通过，限定能力包2715通过；仅测试输入修正完成，不称整个tests目录通过。[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38tu-exact-dependencies)。

- [x] H07-K38t-exact-dependencies：依赖K38当前接缝审计，承接AC14/20的新来源不修改公共执行/环境供应商分支。
  - A01：provider_dependencies保留中央BaoStock模块表和AK ETF/eastmoney报价requests特判；前者来源已声明baostock，后者实际适配只走原requests helper，默认AK模块依赖仍属其他目标。最终审计不能按主Runtime零分支推定全链零残留；HiThink准入与Yahoo研究边界另核对，不机械删除。
  - 精确写集：DSA QuoteBinding精确dependency_modules及注册校验、AK ETF报价声明、provider_dependencies删除上述中央表/供应商特判、定向依赖合同/能力边界；原Spec/Task/支持记录/指南。绑定覆盖来源默认模块只影响该精确目标，无目标仍用来源默认；不改SDK/factory/代码执行、路由/凭据/准入、研究或源修订。
  - 完成条件：AK ETF仍只检查requests，股票报价/日线仍akshare、Bao仍baostock；缺模块/异常拒绝，无目标/未知来源兼容保持；新provider通过声明依赖即可检查，公共函数无供应商常量。定向→受影响/静态及正式最小同步/只读目录分层记录。
  - 当前状态：红测→108定向、253受影响/2715限定能力包、静态及正式最小dsa同步通过，三文件哈希/原111政策与140目录不变确认；源/适配修订未改，可写层同步不称镜像更新。H07/K38父项最终Review保留。[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38tu-exact-dependencies)。

- [x] H11-target-runtime-recovery：依赖DSA正式镜像/健康及当前政策111只读复核，承接原Server/Worker目标消费、缓存/冻结/最终门禁。
  - A01/边界：DSA已healthy，Server/Worker/PostgreSQL/Redis仍Exited；不能直接start或以旧层假设源码同步。仅从infra正式update.sh thesis-ledger恢复所需应用与依赖，默认数据库check，不清库/重建/改Ledger，不改源配置/准入或临时路由。Sdk源输入helper应在Server-only目标跳过。
  - 完成条件：原空间/并发/运行时依赖及数据库结构检查通过，Server/Worker健康、实际Schema与源码匹配；原控制/原消费/已有冻结只读核对分层记录。若结构/依赖门禁拒绝，保留未勾选并定位，不另用原始Docker操作或降低门禁。
  - 当前状态：正式update.sh thesis-ledger退出0，五服务healthy，原Schema/33输入及Server/Worker各4关键文件匹配；当前政策111只读预览、原Run五组合事实/物理产物及两次断网一致重放通过，原hash/checksum保持。无Run/策略/政策/凭据/准入/研究变更，不代收H10或H11父项其他门禁。[恢复证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h11-target-runtime-recovered)。

- [x] H07-K38s-sdk-source-build-gap：依赖本地诊断源码稳定及正式dsa构建失败，承接必要目标更新门禁，不新增SDK业务能力。
  - A01：原DSA维护脚本固定Longbridge v4.5.0/revision68080b64ee02836e2fec625e9605dc5389abdb17，先git clone，再核对SHA/应用原OAuth存储补丁/Cargo.lock；此前正式镜像第二轮clone TLS失败，不能以宿主HEAD可读代替构建内可用。
  - 精确写集/边界：DSA scripts/build_thesis_ledger_longbridge_sdk.py增加固定源fetch-only/source-dir及导入验证，独立构建源合同；infra update.sh只接入有所有权的SDK预取/清理helper、新helper及合同、update-dsa-dockerfile变换/合同、rollback-image-update阶段合同及现有compatibility CI；原Spec/Task/支持记录。共享DSA Dockerfile不改；正式入口空间/并发预检通过后仅在新临时目录宿主预取同一固定Git源码，经附加构建上下文供原SDK构建使用。导入需SHA/git对象/干净工作树验证，仍应用原补丁/Cargo.lock/原编译验证；不改SDK版本/查询预算、代理/凭据或服务数量，不增加网络重试。构建输入清理只限本入口新建的临时checkout。DSA构建override组装回归其现有模板模块，update.sh本轮净缩减，不以机械拆分规避尺寸限制。
  - 完成条件：明确构建输入/网络失败层级；必要修复保留固定SHA/补丁/SDK行为，通过本地合同及正式update.sh最小目标构建/健康/只读诊断。宿主prepare仅输入证据，不关闭镜像或运行态门禁。
  - 当前状态：原源码输入/6合同/infra受影响门禁通过后正式update.sh dsa完整退出0；固定SHA/对象/工作树/原补丁、cargo/wheel/native验证通过，SDK仍4.5.0+thesisledger.1；DSA healthy，13迁移文件匹配，原V3 API26只读检查（20官方healthy/6在线资格拒绝未尝试），111政策/19配置/140目录不变。本叶目标构建/诊断完成，不代收Server、账号消费或新冻结；TLS原因不作已确认断言。[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38s-sdk-source-build-gap)。

- [x] H07-K38p-hithink-event-probe：HiThink来源旧严格probe_read及前后准入保持兼容；原212定向/2710包级和目标零尝试证据保持。本叶只证明旧诊断实现，不作为普通研究的准入或交付前置；普通HiThink新读取及真实消费已按K37f-R完成。[原实施](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38opqr-event-exact-probe)、[新研究验收](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k37f-research-v2)。
- [x] H07-K38q-tushare-event-probe：Tushare来源拥有原mapped probe，工厂仍请求绑定cache=false/probe=True，凭据冻结、4.5秒/UTC/原异常及准入复核保持；212定向/2710包级/静态、正式同步/未配置零尝试通过，本轮运行输入一致。当前fund_div实源权限拒绝不妨碍代码/拒绝层收口；正向现金消费K37e-live继续未勾选。[原实施](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38opqr-event-exact-probe)、[正式目标](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38s-sdk-source-build-gap)、[最终对账](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h07-h12-final-obligation-reconcile)。
- [x] H07-K38r-eastmoney-event-probe：AK来源现金/拆分两probe已各自声明；现金原fetch_fund_dividend_observations/max_pages=2、拆分原read_mapped_split_events及独立映射窗口、UTC/异常/前后准入保持。212定向/2710包级/静态及正式同步/资格拒绝路径通过，本轮运行输入一致。现金缺准入和历史覆盖未知不冒称正向通过；拆分K37d-live另有真实成功消费。[原实施](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38opqr-event-exact-probe)、[正式目标](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38s-sdk-source-build-gap)、[最终对账](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h07-h12-final-obligation-reconcile)。

- [x] H07-K38o-rqdata-event-probe：依赖K38官方诊断迁移与K37事件绑定，承接原在线事件精确诊断供应商分派残留。
  - A01：read_evidence_probe公共层按RQ/HiThink/Tushare/AK供应商选择原映射读取器。公共凭据快照相等、当前admitted/首个scopeSymbol及读取后准入复核属于生命周期；RQ两目标只差dividend/split原隔离账号读取。Tushare需保留cache=false/probe工厂；东财现金原max_pages=2、拆分原映射窗口，不能共用RQ账号工厂。
  - 精确写集：DSA EventProbeReadContext/原EventCredentialContext复用、EventBinding来源probe_read声明与注册校验、exact_evidence_probe仅迁移RQ两目标、rqdata来源模块、新event_exact_probe合同、能力边界；原Spec/Task/指南/架构/支持记录。公共层只给请求绑定的凭据/准入/主密钥/工厂回调及4.5秒预算，不传Runtime或任意SDK方法；其他三来源保持旧分支，后续逐片迁移。
  - 完成条件：RQ现金/拆分经原read_exact_probe→唯一绑定→源内原映射读取器一次执行；原kind/窗口/UTC/预算/账号读取和异常保持，草稿不匹配/未准入零读取、准入变化拒绝。新provider仅声明同类probe可执行、不改公共执行分支；畸形准入样本先拒绝。定向→受影响能力包/静态及正式目标检查分层记录，不自动赋凭据/准入。
  - 当前状态：RQ两目标本地闭环、112/后续212定向、2710能力回归与静态通过；隔离新provider无需公共分支即执行，单次/原参数/异常/准入前后和畸形样本拒绝保持。正式目标更新后原API确认credential_missing/未尝试，本轮179目标代码输入匹配。代码/合同/目标拒绝层完成，真实账号正向消费独立留在K37c-live；不要求为诊断代码收口采购账号。[本地证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38opqr-event-exact-probe)、[目标证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38s-sdk-source-build-gap)、[最终对账](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h07-h12-final-obligation-reconcile)。

- [x] H07-K38n-independent-notice-probe：依赖K38l实际再现的七独立功能诊断缺口，承接原五独立能力/来源检查合同。
  - A01：来源查询已使用各自标准处理器，原诊断却将新key直传只接受HISTORICAL_TRADING_STATUS的旧Reader。独立请求Schema要求policyRevision；诊断不能虚构1或把聚合成功代作独立能力成功。
  - 精确写集：DSA ExactProbeReadContext、exact_probe_read控制代次读取/前后核对、official_states精确检查、notice_exact_probe合同；DSA指南/CHANGELOG，原Spec§13.52/Task/架构与支持记录。上下文仅增加实际policy_revision，不传Runtime/SDK/凭据；source内按现有BINDINGS校验请求、参数和标准结果，原四旧聚合入口保持。
  - 完成条件：七实际包窗口经对应强类型标准处理器成功；缺失/非法/变化政策代次拒绝，原源码包/字节变化拒绝与原业务事实保持；定向→受影响能力包/静态通过。正式目标检查独立保留，当前原SDK构建TLS失败不以本地代收。
  - 当前状态：本地定向114/公告23/后续能力包2710及静态通过；正式DSA更新、源码字节匹配及原API七独立目标全部healthy，实际政策111前后不变。本叶完成，不代收新业务消费/冻结；上轮构建失败历史保持。[本地证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38n-independent-notice-probe)、[目标证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38s-sdk-source-build-gap)。

- [x] H07-K38m-capability-regression-fixtures：依赖K38k/l扩大能力回归，承接原迁移回归及H08/H11受影响门禁。
  - A01：能力包2675通过/17失败。独立两文件再现7失败：旧AK股票报价fake仅实现已退役get_realtime_quote，EF备用缺原单标方法；净值断言仍将标准结果当DataFrame。核心HTTPfake也仍返回旧净值/筹码DTO，目录测试另有不完整来源fixture及barQuery遗漏。先逐类修正实际输入契约并保留原数据/主备/调用次数/控制拒绝要求，不能增加SDK兼容回退或降低断言。
  - 精确写集：DSA tests/test_thesis_ledger_data_gateway.py、test_thesis_ledger_current_data_route.py、test_thesis_ledger_core_facades.py；test_thesis_ledger_market_v3_admission_runtime.py与test_thesis_ledger_hithink_stock_runtime_v3.py补齐静态绑定派生的非准入来源fixture；test_thesis_ledger_hithink_dormant_v3.py严格核对已实现barQuery。跨测试污染继续定位。仅隔离测试输入/标准结果核对，不改产品执行、目录/政策/凭据或真实环境。
  - 完成条件：原HTTP成功/主备/取消准入不阻断配置读取/窗口选择义务通过；扩大能力回归和静态重新通过后才进行正式更新。17项不得忽略/移TODO，目录完整性缺口不以partial代complete掩盖。
  - 当前状态：六文件60通过；扩大能力包2692通过/40警告，全仓critical lint计数0、能力边界/diff通过。17项全部修复，未降低断言或修改生产执行；本地回归叶完成，正式update.sh dsa因原SDK获取TLS失败退出1，不代收目标门禁。[根因与证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38m-capability-regression-fixtures)。

- [x] H07-K38l-notice-exact-probe：依赖K38j/k本地接缝，承接原K38官方精确诊断残留。
  - A01：公告状态四本地文件（11绑定）与公告现金一包仍由公共_read_local选择。迁移前真实仓库基线：四旧聚合状态/一现金成功；七独立状态功能原检查返回unsupported_capability（原Reader只接受旧聚合key），属于必要诊断缺口，不能伪造通过或在迁移中悄然改结论。
  - 写集/边界：DSA official_states/official_dividends来源声明、exact_evidence_probe退役官方路径分派、exact_probe_read退役official前缀分派、独立公告诊断合同、能力边界/指南/CHANGELOG；原Task/Spec/支持记录。保留原四路径/请求/现金UTC数据时钟/字节核验、原错误及读取器，不改准入、数据包、能力查询、研究或冻结。
  - 完成条件：来源声明覆盖原诊断入口，四旧状态/现金实际仓库只读成功和七原错误均保持，文件变更/异常透出/单次调用验证；受影响回归/静态、正式目标同步与检查分层记录。独立七功能的检查修复另按原能力目标推进，不能将该缺口当成无关优化删除。
  - 当前状态：迁移阶段199及七原错误历史保持；后续K38m修复旧测试、K38n单独修复七功能诊断，当前2710回归/静态及正式DSA目标12检查全部healthy，源文件匹配/111控制不变。本叶完成，不抹去旧错误/构建失败历史或公告现金not_admitted消费限制。[本地证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38l-notice-exact-probe)、[目标证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38s-sdk-source-build-gap)。

- [x] H07-K38k-hk-us-exact-probe：依赖K38j本地来源诊断接缝，承接K38/AC14/AC20的公共供应商分派残留。
  - A01：HK/US各三绑定（两公共费用、一盘中状态）已在来源模块；公共_read_local仍按两个provider选择multimarket_rule_path/MultimarketRuleProvider，再读取包内证券与coverage。现有六包都有symbol，保留原缺字段默认600519.SH与原Reader校验，不将盘中观察改写为全天状态。
  - 精确写集：DSA两个official_hk_rules/official_us_rules来源模块、thesis_ledger_exact_evidence_probe仅退役对应分支、test_thesis_ledger_exact_source_probe、能力边界脚本、DSA指南/CHANGELOG；原Spec/Task/实施日志/运行证据、当前canonical-runtime架构事实。复用ExactProbeReadContext与标准样本，不修改公共Runtime/执行器/契约/数据包/修订、工厂缓存或路由。
  - 完成条件：六绑定经原read_exact_probe→来源声明→原Reader读取；原路径/请求/错误及字节变更拒绝保持，实际仓库六包只读回归、无前缀扩展合同、定向→受影响回归/静态通过；正式最小dsa同步/目标精确检查独立验收。
  - 当前状态：本地129/157及后续2710回归/静态通过，六实际包原路径/错误/字节保持；正式DSA更新与原API六目标全部healthy、源文件匹配/111控制不变。目标诊断完成，不代收新的业务冻结。[本地证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38k-hk-us-exact-probe)、[目标证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38s-sdk-source-build-gap)。

- [x] H07-K38j-cn-fee-exact-probe：依赖K38最终公共接缝审计，承接原精确来源检查的供应商残留。
  - A01：read_exact_probe先按official-前缀进入read_evidence_probe；后者按供应商选择文件/工厂，CN公共费用两个上游仍在公共_read_local维护。此前按等值供应商常量的AST检查不足，前缀与证据分发实际仍有公共分支，不能宣称残留已清空。
  - 写集/边界：DSA能力合同/SourceDefinition及注册校验、精确检查入口、证据检查仅退役CN费用分支、official_rules来源、对应隔离合同及边界脚本；原Spec/Task/支持记录与指南。仅迁移CN费用两目标的本地文件诊断，不改变事件/其他官方源、费用数据/摘要/修订/工厂或真实路由/准入。
  - 完成条件：来源拥有两路径及原reader.read/原字节前后核验，公共入口只依据已绑定来源声明；无前缀的新provider在隔离注册即可执行精确检查、不改Runtime。错误/不可用/文件变化保持，定向→受影响DSA/静态；正式最小dsa同步及目标检查独立保留。目标当前Server与Docker不可达，不能以本地通过关闭该目标层。
  - 当前状态：本地99/121及后续2710回归/静态通过，strict样本/无前缀扩展/单次执行/字节变化拒绝保持；正式DSA更新与原API两目标healthy、文件匹配及111控制不变。本叶完成，K38其他真实门禁不收口；原daemon不可达历史保留。[本地证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38j-cn-fee-exact-probe)、[目标证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38s-sdk-source-build-gap)。

- [x] H07-K38-probe-runtime-qualification：依赖K38g工厂/参数迁移及当前目录，承接原真实probe层的控制资格核对。
  - A01/边界：原Server providers/:id/test→DsaClient→DSA check_provider，credential_ready=false在任何run_probe/SDK执行前返回unconfigured/attempted=false。最新111政策下Tushare/TickFlow/Finnhub/Alpha均disabled/credentialConfigured=false/configVersion0。仅四个现有精确代表（前两CN股票报价，后两US股票日线qfq/none）各一次原API，不提交credentials/配置、不启源、不改政策/准入/健康或Ledger，不以此证明有凭据SDK正向读取。
  - 完成条件：原API真实资格拒绝/未尝试及请求关联、前后政策/来源配置/目录语义不变；记录未覆盖的实际SDK工厂/账号权限层。该叶不关闭K38真实成功probe父门禁，原隔离SDK/工厂合同继续独立有效。
  - 当前状态：四项原API均unconfigured/readOnly/attempted=false/credential_missing、关联正确，111原政策及四来源公开状态前后相同。[证据及当前七事件资格](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h07-probe-qualification-and-current-blocks)。只完成真实控制资格检查，账号SDK正向probe、K37实际准入/消费仍未过；H10浏览器权限拒绝独立保留。

- [x] H09-K2-two-session-result-proof：依赖实际succeeded Run ff4bbf86…、完整新快照与原Worker断网两次一致重放，承接原K2业务验收驱动的结果层级核对。
  - A01：原两日MA1案例没有平仓，原domain analytics对不足波动样本/无平仓指标返回unavailable，并将总体completeness标partial；新快照quality=complete、标准结果Schema正确、原模型完全相同。CLI新写的“所有指标complete”假设不属于原K2完成条件，与固定两日窗口不一致，不能改域计算、日期消费或扩大窗口解决。
  - 精确写集/完成条件：原验收verifyCompositionJob增加固定两会话指标证明及拒绝回归合同，仍要求succeeded/finalized/完整数据快照、原模型/协议及一致checksum；partial只允许本案例精确四项不可用原因，其余指标必须可用，两估值点/零平仓保持。只读成功补证脚本核对当前111原政策/来源配置/已生成Run，写新0600旁证，原恢复记录与业务产物不改写，不重跑/新建Run。真实五事实、三真实可选失败、内容哈希/十产物及两次网络阻断重放已分别核对，继续保留partial与全部警示。
  - 当前状态：13项脚本合同及原API只读成功补证通过，111/原指纹/两配置0确认；十产物物理哈希/五真实组合事实/三个可选失败、两次原Worker断网一致/0网络通过。[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h09-real-composition-freeze-passed)。两日原指标partial及全部警示保持，没有改研究/原Run/数据质量或覆盖要求。

- [x] H09-K2-response-diagnostics：依赖6889043e…明确失败/107恢复，承接原标准错误和真实组合缺口的必要定位。
  - A01：原HTTP三503/一502/一200，Run invalid-response；原SDK及来源绑定/合同只读诊断两能力均成功，不等同Control/Server消费，也不足以定位前案哪一能力失败。先观察原目标真实客户端完整错误/结果，不放宽Schema、覆盖或错误分类，不继续盲建Run。
  - 精确写集/执行边界：维护market-composition-response-acceptance.mjs及能力参数隔离合同，复用原组合CAS/源配置守卫；107→108同五功能→109恢复，600519.SH/2026-10-08～09，原DsaClient并发各一次。独立进程fetch仅原样转发及观察HTTP状态/标准信封/关联，无注入，不写策略/Run/窗口/冻结/凭据/准入/Ledger，不改价格主备；最多150秒目标观察，失败不自动重跑，0600记录。最新默认授权覆盖此原任务内必要案例。
  - 完成条件：五项各唯一真实HTTP观察、标准错误/requestId/标准结果分层核对、原政策/两来源配置CAS恢复；脚本隔离合同/只读预览通过后执行。实际源失败或非法格式仍如实保留；该诊断不代收H09组合/新冻结。
  - 当前状态：四项脚本合同/只读预览通过，按默认授权107→108→109执行退出0，五项各一次HTTP：BaoStock状态/日期200标准结果，公告三功能503标准错误/正确requestId；0600verified/owned=false及109/109原指纹/两配置0独立核对通过。[完整证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h09-response-diagnostics-passed)。只证明分项原客户端响应，不关闭组合/冻结；前案502具体根因仍未确定，不伪造覆盖或改错误断言。

- [x] H09-K2-response-chain：依赖已确认失败Run/107恢复及紧接107→109响应案例完整恢复，承接原真实组合执行包的必要证据连续性。
  - A01/精确写集：原新案例输入要求失败记录恢复代次等于当前，响应诊断合法改变107→109后不能拿旧107记录直接继续。只读补证CLI与原记录所有权helper/合同增加显式after-response-record，只接受紧接且verified/owned=false、同原路线/配置/五响应完整的案例，再以原API核对失败Run/原输入/策略及当前109事实；新0600旁证记录原恢复代次/两个原记录路径/已验证政策链，原记录不改写，不清除Run或绕过未知提交。
  - 完成条件：不连续代次、原路线/来源配置变化、未确认响应/提交拒绝；保留原Run/输入，旁证之后原新案例守卫仍完整执行。合同/只读补证/预览通过；无政策、Run或业务变更，该叶不代收实际冻结。
  - 当前状态：九项脚本合同及原API补证通过，新0600旁证明确107→109响应案例连续性及旧failed Run/原输入；原记录不改写，新案例守卫保持。[证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h09-snapshot-policy-fence-ready)。后续109→111业务案例已通过，不以旁证替代实际冻结。

- [x] H09-K2-snapshot-policy-projection：依赖Market比较修复及实际Snapshot调用链，承接同一政策事实在冻结前后的完整核验。
  - A01/写集：backtest-status-composition-v1.ts在组合前后及状态冻结最终复核仍对完整政策deepStrictEqual；复用Market能力组合的同一强类型事实比较，统一只排除appliedAt，全部其他字段仍拒绝，首份完整政策及旧冻结不变。写集仅两生产模块及原Snapshot合同/原Spec/Task/证据，不加供应商分支或平行冻结。
  - 完成条件：原Builder真实调用链隔离红测复现不同采样时钟，首份完整政策/产物身份冻结和原离线行为保持；两守卫的真实字段变化仍失败；定向/受影响Server及包级/门禁/正式最小同步/目标业务验收分别记录。
  - 当前状态：原Builder红测复现后41项定向/Server2839项及包级/静态门禁通过，正式最小同步及目标两守卫核对通过；原成功新业务快照/两次断网一致已验证，首份完整政策与真实控制变化拒绝保持。[本地及目标](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h09-snapshot-policy-fence-ready)、[业务证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h09-real-composition-freeze-passed)。

- [x] H09-K2-baostock-query-isolation：依赖103→105真实晚到失败与实际调用链，承接原组合不同来源事实/执行生命周期的必要缺口。
  - A01：两个独立绑定直接调用read_baostock_daily_status/read_baostock_lifecycle；_baostock_session使用SDK全局login/logout，原legacy live_daily_status已有子进程45秒隔离。目标同期两个login/一个logout、四HTTP已返回/一读取等原Server120秒；这是并发隔离风险及超时症状证据，不断言每个503的具体来源或全证券覆盖。POST90秒后提交确认实际只观察约8秒即恢复，具体中断原因尚缺安全错误记录，不擅自延长预算。
  - 精确写集：BaoStock来源独立状态/日期执行桥、来源专属有界子进程模块、并发/超时/释放及现有查询回归；DSA指南/CHANGELOG、原Spec/Task/支持记录。来源工厂/缓存身份/上游与适配修订/原SDK解析/其他日线保持，不改公共执行分支、凭据、政策、研究或旧快照。
  - 完成条件：两个能力分离SDK进程，原45秒总边界/子进程超时释放，参数与结果校验及实际错误保留；状态/粗ST共享获取仍成立，基础日期独立。定向→受影响DSA/静态→正式最小dsa同步→原目标组合/冻结分层验收。未知提交先只读确认，不自动新建另一Run。
  - 当前状态：93项定向/87项受影响回归、静态/能力边界及正式最小dsa同步通过；目标绑定引用隔离模块/45秒，两能力真实原HTTP通过并进入新业务冻结，旧状态/共享缓存/日期独立事实/全部修订保持。[实施](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h09-baostock-isolation-local)、[真实冻结](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h09-real-composition-freeze-passed)。前案invalid-response记录保留，未独断其具体根因。

原A–F的AC01–AC12映射保留各阶段；新增AC13–AC20责任保留H01–H12原条目。跨层断言由本地子叶与H08/H09/H10/H11共同承担，H12只对账，不代收缺失实现/门禁。当前[差异矩阵§7](../../reviews/2026-10-10-provider-adaptation-and-route-matrix.md#7-ac13ac20-当前验收对账)提供逐断言证据边界，完整历史映射见关联记录。

原阶段结论（历史记录，当前已由§9.5和执行摘要更新）：当时全范围未完成、最终一致性Review未通过；未解决责任为H07-K37/K38真实资格/最终残留Review、H08/H09父项依赖对账、H10-K2浏览器真实保存、H11和H12。H09-K2已凭新真实产物/失败/离线证据完成，两日指标partial保持。原F03/H01结论不扩大；结构整理时原118条勾选/依赖/授权/旧锚点全部保留，本轮仅据实际完成证据更新K2及新增必要叶，历史授权/失败不改写。提交/推送/发布均未授权。

2026-10-12门禁核对（历史，当前状态以执行摘要及§9.5为准）：当时能力边界、TL依赖边界与HEAD尺寸ratchet通过，九存量告警无增长；目标只读确认111/111与完整140目录，RQ/Tushare仍缺凭据，四现金/拆分目标仍not_admitted。当时真实来源成功层和H10权限拒绝前置未解除，曾请求账号配置位置/合法准入证据及浏览器恢复状态；未自动写凭据/准入。命令、失败纠正及原AC阶段结论见[阶段审查](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-20261012-current-gate-audit)。这些历史请求和停止点不构成当前重询Key、重跑验收或等待浏览器的前置。

2026-10-12分段核对（历史）：ab–ag标准结果/来源策略/注册合同、ah工厂作用域错误一致性、ai本地来源就绪及aj RQ准入拒绝分类已验证，SDK/快照/预算/其他异常和冻结输入保持；3218限定回归及正式目标对应当时输入，140项目录匹配/就绪沿ai逐行相同，四登记/消费视图沿aj保持。17合同组/140绑定与消费文件核对已执行；AC01–AC12见[矩阵§7.1](../../reviews/2026-10-10-provider-adaptation-and-route-matrix.md#71-ac01ac12-接缝证据与层级边界)，AC13–AC20仍原§7。公开AST按职责分类，旧任务待迁移表述已据实际代码纠正，新组合冻结不再列缺证据。当时全范围真实资格/浏览器/父项尚未齐全，[该阶段来源尝试及剩余边界](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38aj-rqdata-guard-errors-and-source-retry)保留原观察；当前完成与外部阻塞按执行摘要及§9.5维护。

- [x] H07-K38aj-rqdata-guard-errors：承接原AC04/09/11/20与K37c/K38o，2026-10-12用户确认RQ无法申请凭据，先推进代码层；真实账号义务保留。A01发现原read_event把账号修订/身份准入的已知ValueError统一投影upstream_failure，读取后失效错误分类失真。
  - 精确写集：RQ账号读取器和映射读取器各自有限准入异常、RQ事件适配器识别；原真实SQLite/HTTP和账号/映射回归测试，以及Spec/Task/指南/证据。公共Runtime/Control/Schema、SDK/进程/预算、缓存/凭据/准入/研究/旧冻结不改。
  - 完成条件：原ValueError兼容/固定安全文本、标准not_admitted分类；读取前拒绝零SDK、读取后修订/准入变化拒绝晚到结果，其他SDK错误保留upstream_failure。定向→受影响能力包/静态→正式最小dsa同步→目标原资格拒绝分层核对；无账号不代收实源成功。
  - 2026-10-12阶段结果（历史）：四原HTTP红测503→修复后422/not_admitted，77定向/3218限定回归及静态通过；正式最小dsa同步、目标三哈希/ValueError兼容/零账号与主密钥读取通过。用户提供~/.zshrc的TUSHARE_API_KEY仅草稿使用，无保存/启源；原代表报价attempted=true/upstream_failure，隔离原来源probe实际两请求均报告API40203/权限限制，当时未推断现金/日线。公告包诊断healthy但仍not_admitted；另三事件精确入口仍not_admitted/attempted=false，控制111/111、配置保持。[该阶段证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k38aj-rqdata-guard-errors-and-source-retry)。账号、事件准入及浏览器前置是当时的分层状态；当前H10与TA已通过，RQ/Tushare外部正向条件仍按§9.5保留。

## 历史章节兼容索引

以下仅将旧Task章节锚点跳转到原记录，不维护第二份历史正文或活动计划；新检查点更新当前摘要和对应条目，历史写入实施日志。

<a id="81-本地文档写回记录2026-10-09"></a>原§8.1：[8.1 本地文档写回记录（2026-10-09）](../reviews/2026-10-11-unified-data-capability-initial-evidence.md#record-8-1)。

<a id="83-a01-接缝切片与写集2026-10-10"></a>原§8.3：[8.3 A01 接缝、切片与写集（2026-10-10）](../reviews/2026-10-11-unified-data-capability-initial-evidence.md#record-8-3)。

<a id="84-abd-本地闭环及-c-启动检查点2026-10-10"></a>原§8.4：[8.4 A/B/D 本地闭环及 C 启动检查点（2026-10-10）](../reviews/2026-10-11-unified-data-capability-initial-evidence.md#record-8-4)。

<a id="85-真实错误边界修复启动2026-10-10"></a>原§8.5：[8.5 真实错误边界修复启动（2026-10-10）](../reviews/2026-10-11-unified-data-capability-initial-evidence.md#record-8-5)。

<a id="86-实际写集与扩展性证明2026-10-10"></a>原§8.6：[8.6 实际写集与扩展性证明（2026-10-10）](../reviews/2026-10-11-unified-data-capability-initial-evidence.md#record-8-6)。

<a id="87-本地验证命令结果与输入2026-10-10"></a>原§8.7：[8.7 本地验证命令、结果与输入（2026-10-10）](../reviews/2026-10-11-unified-data-capability-initial-evidence.md#record-8-7)。

<a id="88-正式目标真实消费冻结与剩余验收2026-10-10"></a>原§8.8：[8.8 正式目标、真实消费、冻结与剩余验收（2026-10-10）](../reviews/2026-10-11-unified-data-capability-initial-evidence.md#record-8-8)。

<a id="94-交付检查点"></a>原§9.4：[9.4 交付检查点](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-4)。

<a id="95-本次文档对齐记录"></a>原§9.5：[9.5 本次文档对齐记录](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-5)。

<a id="96-h01-实施启动2026-10-10"></a>原§9.6：[9.6 H01 实施启动（2026-10-10）](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-6)。

<a id="97-h01--e05-收口证据2026-10-10"></a>原§9.7：[9.7 H01 / E05 收口证据（2026-10-10）](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-7)。

<a id="98-h02h05-全来源检查与功能拆分定稿"></a>原§9.8：[9.8 H02–H05 全来源检查与功能拆分定稿](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-8)。

<a id="99-h06-与首批-h07h08-实施记录进行中"></a>原§9.9：[9.9 H06 与首批 H07/H08 实施记录（进行中）](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-9)。

<a id="910-目标同步与单次精确功能验收"></a>原§9.10：[9.10 目标同步与单次精确功能验收](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-10)。

<a id="911-参数资格目录与-h08-首批共享获取2026-10-11进行中"></a>原§9.11：[9.11 参数资格目录与 H08 首批共享获取（2026-10-11，进行中）](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-11)。

<a id="912-h08-server-独立功能主备代码叶2026-10-11"></a>原§9.12：[9.12 H08 Server 独立功能主备代码叶（2026-10-11）](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-12)。

<a id="913-h07-第二批-efinance-日线范围核对2026-10-11启动"></a>原§9.13：[9.13 H07 第二批 efinance 日线范围核对（2026-10-11，启动）](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-13)。

<a id="914-h07-第三批-akshare-精确日线2026-10-11启动"></a>原§9.14：[9.14 H07 第三批 Akshare 精确日线（2026-10-11，启动）](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-14)。

<a id="915-h07-第四批-baostock-日线2026-10-11启动"></a>原§9.15：[9.15 H07 第四批 BaoStock 日线（2026-10-11，启动）](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-15)。

<a id="916-h08-精确功能开关缓存主备目标案例准备2026-10-11待单独授权"></a>原§9.16：[9.16 H08 精确功能开关/缓存/主备目标案例准备（2026-10-11，待单独授权）](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-16)。

<a id="917-第三四批实际结果与验证对账2026-10-11"></a>原§9.17：[9.17 第三/四批实际结果与验证对账（2026-10-11）](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-17)。

<a id="918-h08-授权案例首次运行与原客户端错误边界修复2026-10-11进行中"></a>原§9.18：[9.18 H08 授权案例首次运行与原客户端错误边界修复（2026-10-11，进行中）](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-18)。

<a id="919-h08-本次授权案例闭环与-h09-首个消费切片启动2026-10-11"></a>原§9.19：[9.19 H08 本次授权案例闭环与 H09 首个消费切片启动（2026-10-11）](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-19)。

<a id="920-h09-本地闭环与后续单目标迁移2026-10-11进行中"></a>原§9.20：[9.20 H09 本地闭环与后续单目标迁移（2026-10-11，进行中）](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-20)。

<a id="921-独立选择兼容修复与本批验证2026-10-11"></a>原§9.21：[9.21 独立选择兼容修复与本批验证（2026-10-11）](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-21)。

<a id="922-当前代码叶完成与目标回归2026-10-11"></a>原§9.22：[9.22 当前代码叶完成与目标回归（2026-10-11）](../reviews/2026-10-11-unified-data-capability-route-evidence.md#record-9-22)。

<a id="923-h07-tickflow-精确日线范围核对2026-10-11启动"></a>原§9.23：[9.23 H07 TickFlow 精确日线范围核对（2026-10-11，启动）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-23)。

<a id="924-tickflow-代码叶验证与目标准备2026-10-11"></a>原§9.24：[9.24 TickFlow 代码叶验证与目标准备（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-24)。

<a id="925-tickflow-目标核对与下一来源2026-10-11"></a>原§9.25：[9.25 TickFlow 目标核对与下一来源（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-25)。

<a id="926-alpha-vantage-回归与-finnhub-单目标范围2026-10-11"></a>原§9.26：[9.26 Alpha Vantage 回归与 Finnhub 单目标范围（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-26)。

<a id="927-两项美股日线代码叶与最终本地门禁2026-10-11"></a>原§9.27：[9.27 两项美股日线代码叶与最终本地门禁（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-27)。

<a id="928-三来源阶段交付与未覆盖层级2026-10-11"></a>原§9.28：[9.28 三来源阶段交付与未覆盖层级（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-28)。

<a id="929-tushare-两目标迁移启动与精确写集2026-10-11"></a>原§9.29：[9.29 Tushare 两目标迁移启动与精确写集（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-29)。

<a id="930-tushare-本地闭环与-yahoo-六目标范围2026-10-11"></a>原§9.30：[9.30 Tushare 本地闭环与 Yahoo 六目标范围（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-30)。

<a id="931-yahoo-六目标回归与指数单目标范围2026-10-11"></a>原§9.31：[9.31 Yahoo 六目标回归与指数单目标范围（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-31)。

<a id="932-当前本地门禁与目标范围2026-10-11"></a>原§9.32：[9.32 当前本地门禁与目标范围（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-32)。

<a id="933-正式目标更新与真实-yahoo-短窗2026-10-11"></a>原§9.33：[9.33 正式目标更新与真实 Yahoo 短窗（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-33)。

<a id="934-longbridge-八目标启动与工厂接缝2026-10-11"></a>原§9.34：[9.34 Longbridge 八目标启动与工厂接缝（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-34)。

<a id="935-longbridge-本地闭环与后续有界窗口叶2026-10-11"></a>原§9.35：[9.35 Longbridge 本地闭环与后续有界窗口叶（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-35)。

<a id="936-两叶最终门禁与正式同步准备2026-10-11"></a>原§9.36：[9.36 两叶最终门禁与正式同步准备（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-36)。

<a id="937-正式目标对账与下一执行叶2026-10-11"></a>原§9.37：[9.37 正式目标对账与下一执行叶（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-37)。

<a id="938-futu-十二目标启动与迁移盘点2026-10-11"></a>原§9.38：[9.38 Futu 十二目标启动与迁移盘点（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-38)。

<a id="939-futu-最小闭环与检查接缝收敛2026-10-11"></a>原§9.39：[9.39 Futu 最小闭环与检查接缝收敛（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-39)。

<a id="940-futu-与检查叶最终门禁写集及目标范围2026-10-11"></a>原§9.40：[9.40 Futu 与检查叶最终门禁、写集及目标范围（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-40)。

<a id="941-futu-正式目标结果与未覆盖层级2026-10-11"></a>原§9.41：[9.41 Futu 正式目标结果与未覆盖层级（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-41)。

<a id="942-futu-四项报价迁移启动2026-10-11"></a>原§9.42：[9.42 Futu 四项报价迁移启动（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-42)。

<a id="943-四项报价最终门禁与目标同步范围2026-10-11"></a>原§9.43：[9.43 四项报价最终门禁与目标同步范围（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-43)。

<a id="944-报价正式目标对账与后续接缝2026-10-11"></a>原§9.44：[9.44 报价正式目标对账与后续接缝（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-44)。

<a id="945-当前证券资料四目标启动与实际接缝2026-10-11"></a>原§9.45：[9.45 当前证券资料四目标启动与实际接缝（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-45)。

<a id="946-当前资料闭环准入事实与最终本地门禁2026-10-11"></a>原§9.46：[9.46 当前资料闭环、准入事实与最终本地门禁（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-46)。

<a id="947-当前资料正式目标对账与下一叶2026-10-11"></a>原§9.47：[9.47 当前资料正式目标对账与下一叶（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-47)。

<a id="948-每手股数双来源启动2026-10-11"></a>原§9.48：[9.48 每手股数双来源启动（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-48)。

<a id="949-每手双来源本地门禁及正式真实读取范围2026-10-11"></a>原§9.49：[9.49 每手双来源本地门禁及正式真实读取范围（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-49)。

<a id="950-每手正式同步与真实原路线读取2026-10-11"></a>原§9.50：[9.50 每手正式同步与真实原路线读取（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-50)。

<a id="951-longbridgeyahoo-报价两叶启动2026-10-11"></a>原§9.51：[9.51 Longbridge/Yahoo 报价两叶启动（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-51)。

<a id="952-十一报价目标本地闭环与最终门禁2026-10-11"></a>原§9.52：[9.52 十一报价目标本地闭环与最终门禁（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-52)。

<a id="953-十一报价正式目标对账与剩余责任2026-10-11"></a>原§9.53：[9.53 十一报价正式目标对账与剩余责任（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-53)。

<a id="954-四项单标股票报价启动与真实性盘点2026-10-11"></a>原§9.54：[9.54 四项单标股票报价启动与真实性盘点（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-54)。

<a id="955-四报价闭环错误检查根因与最终门禁2026-10-11"></a>原§9.55：[9.55 四报价闭环、错误检查根因与最终门禁（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-55)。

<a id="956-四项股票报价正式同步与目标状态2026-10-11"></a>原§9.56：[9.56 四项股票报价正式同步与目标状态（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-56)。

<a id="957-沪深四报价目标启动与精确迁移范围2026-10-11"></a>原§9.57：[9.57 沪深四报价目标启动与精确迁移范围（2026-10-11）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-57)。

<a id="958-akshare-股票-eastmoneytencent-精确报价迁移h07-k25"></a>原§9.58：[9.58 AKShare 股票 Eastmoney/Tencent 精确报价迁移（H07-K25）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-58)。

<a id="959-hithink-两项报价的接缝盘点与下一执行叶h07-k27"></a>原§9.59：[9.59 HiThink 两项报价的接缝盘点与下一执行叶（H07-K27）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-59)。

<a id="960-净值下一叶的真实接缝盘点h07-k28k29"></a>原§9.60：[9.60 净值下一叶的真实接缝盘点（H07-K28/K29）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-60)。

<a id="961-普通净值历史实现与标准错误边界h07-k29"></a>原§9.61：[9.61 普通净值历史实现与标准错误边界（H07-K29）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-61)。

<a id="962-普通-nav-诊断接缝与消费者职责收敛h07-k30"></a>原§9.62：[9.62 普通 NAV 诊断接缝与消费者职责收敛（H07-K30）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-62)。

<a id="963-基金持仓单目标迁移接缝盘点h07-k31"></a>原§9.63：[9.63 基金持仓单目标迁移接缝盘点（H07-K31）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-63)。

<a id="964-基金持仓诊断收口接缝h07-k32"></a>原§9.64：[9.64 基金持仓诊断收口接缝（H07-K32）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-64)。

<a id="965-筹码摘要两目标迁移接缝h07-k33"></a>原§9.65：[9.65 筹码摘要两目标迁移接缝（H07-K33）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-65)。

<a id="966-专用-etf-日线迁移接缝h07-k34"></a>原§9.66：[9.66 专用 ETF 日线迁移接缝（H07-K34）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-66)。

<a id="967-公共费用六目标迁移接缝h07-k35"></a>原§9.67：[9.67 公共费用六目标迁移接缝（H07-K35）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-67)。

<a id="968-旧聚合交易状态七目标接缝h07-k36"></a>原§9.68：[9.68 旧聚合交易状态七目标接缝（H07-K36）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-68)。

<a id="969-现金拆分七事件目标接缝h07-k37"></a>原§9.69：[9.69 现金/拆分七事件目标接缝（H07-K37）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-69)。

<a id="970-东财现金事件迁移启动h07-k37b"></a>原§9.70：[9.70 东财现金事件迁移启动（H07-K37b）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-70)。

<a id="971-rqdata现金拆分迁移启动h07-k37c"></a>原§9.71：[9.71 RQData现金/拆分迁移启动（H07-K37c）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-71)。

<a id="972-东财拆分迁移启动h07-k37d"></a>原§9.72：[9.72 东财拆分迁移启动（H07-K37d）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-72)。

<a id="973-tushare现金迁移启动h07-k37e"></a>原§9.73：[9.73 Tushare现金迁移启动（H07-K37e）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-73)。

<a id="974-hithink现金迁移启动h07-k37f"></a>原§9.74：[9.74 HiThink现金迁移启动（H07-K37f）](../reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-74)。

<a id="975-h08剩余缓存配置代次接缝启动核对"></a>原§9.75：[9.75 H08剩余缓存/配置代次接缝启动核对](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-75)。

<a id="976-h08-k3-五类缓存本地实施与定向证据"></a>原§9.76：[9.76 H08-K3 五类缓存本地实施与定向证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-76)。

<a id="977-h08-k3门禁收敛与目标只读投影"></a>原§9.77：[9.77 H08-K3门禁收敛与目标只读投影](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-77)。

<a id="978-h08-k3b-单一报价功能缓存代次验收准备"></a>原§9.78：[9.78 H08-K3b 单一报价功能缓存代次验收准备](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-78)。

<a id="979-h09真实价格预检边界与h10原界面接缝"></a>原§9.79：[9.79 H09真实价格预检边界与H10原界面接缝](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-79)。

<a id="980-h10界面代码与真实浏览器草稿闭环"></a>原§9.80：[9.80 H10界面代码与真实浏览器草稿闭环](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-80)。

<a id="981-当前矩阵指南对账及残留接缝审计"></a>原§9.81：[9.81 当前矩阵/指南对账及残留接缝审计](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-81)。

<a id="982-h07-k38a-来源凭据修订策略迁移启动"></a>原§9.82：[9.82 H07-K38a 来源凭据修订策略迁移启动](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-82)。

<a id="983-h07-k38b-报价读取守卫迁移启动"></a>原§9.83：[9.83 H07-K38b 报价读取守卫迁移启动](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-83)。

<a id="984-h07-k38c-通用日线死分支核对与退役启动"></a>原§9.84：[9.84 H07-K38c 通用日线死分支核对与退役启动](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-84)。

<a id="985-h07-k38d-报价准入兼容查找迁移启动"></a>原§9.85：[9.85 H07-K38d 报价准入兼容查找迁移启动](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-85)。

<a id="986-h07-k38e-修订查找死分支收敛启动"></a>原§9.86：[9.86 H07-K38e 修订查找死分支收敛启动](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-86)。

<a id="987-h07-k38f-hithink连接诊断迁移启动"></a>原§9.87：[9.87 H07-K38f HiThink连接诊断迁移启动](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-87)。

<a id="988-h08缓存代次单次授权执行"></a>原§9.88：[9.88 H08缓存代次单次授权执行](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-88)。

<a id="989-k38f本地与正式目标闭环"></a>原§9.89：[9.89 K38f本地与正式目标闭环](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-9-89)。

<a id="02-本轮实施启动2026-10-10"></a>原章节：[0.2 本轮实施启动（2026-10-10）](../reviews/2026-10-11-unified-data-capability-initial-evidence.md#02-本轮实施启动2026-10-10)。

<a id="03-本次目标对齐2026-10-10"></a>原章节：[0.3 本次目标对齐（2026-10-10）](../reviews/2026-10-11-unified-data-capability-initial-evidence.md#03-本次目标对齐2026-10-10)。

<a id="8-证据记录"></a>原章节：[8. 证据记录](../reviews/2026-10-11-unified-data-capability-initial-evidence.md#8-证据记录)。

<a id="91-当前对齐与已核对输入"></a>原章节：[9.1 当前对齐与已核对输入](../reviews/2026-10-11-unified-data-capability-route-evidence.md#91-当前对齐与已核对输入)。

<a id="本地实现与回归记录"></a>原章节：[本地实现与回归记录](../reviews/2026-10-11-unified-data-capability-source-evidence.md#本地实现与回归记录)。

<a id="目标部署与只读核对"></a>原章节：[目标部署与只读核对](../reviews/2026-10-11-unified-data-capability-source-evidence.md#目标部署与只读核对)。

<a id="k25-本地实现里程碑"></a>原章节：[K25 本地实现里程碑](../reviews/2026-10-11-unified-data-capability-source-evidence.md#k25-本地实现里程碑)。

<a id="k26-实现兼容探测与验证"></a>原章节：[K26 实现、兼容探测与验证](../reviews/2026-10-11-unified-data-capability-source-evidence.md#k26-实现兼容探测与验证)。

<a id="k25k26-目标部署与未覆盖层级"></a>原章节：[K25/K26 目标部署与未覆盖层级](../reviews/2026-10-11-unified-data-capability-source-evidence.md#k25k26-目标部署与未覆盖层级)。

<a id="k27-本地实现与验证"></a>原章节：[K27 本地实现与验证](../reviews/2026-10-11-unified-data-capability-source-evidence.md#k27-本地实现与验证)。

<a id="k27-正式目标与真实来源读取"></a>原章节：[K27 正式目标与真实来源读取](../reviews/2026-10-11-unified-data-capability-source-evidence.md#k27-正式目标与真实来源读取)。

<a id="k28-最新净值实现与本地门禁"></a>原章节：[K28 最新净值实现与本地门禁](../reviews/2026-10-11-unified-data-capability-source-evidence.md#k28-最新净值实现与本地门禁)。

<a id="k28-正式目标与独立层级记录"></a>原章节：[K28 正式目标与独立层级记录](../reviews/2026-10-11-unified-data-capability-source-evidence.md#k28-正式目标与独立层级记录)。

<a id="k29-目标登记与当前路由核对"></a>原章节：[K29 目标登记与当前路由核对](../reviews/2026-10-11-unified-data-capability-source-evidence.md#k29-目标登记与当前路由核对)。

<a id="k30-实现与本地验证"></a>原章节：[K30 实现与本地验证](../reviews/2026-10-11-unified-data-capability-source-evidence.md#k30-实现与本地验证)。

<a id="k30-正式目标与层级核对"></a>原章节：[K30 正式目标与层级核对](../reviews/2026-10-11-unified-data-capability-source-evidence.md#k30-正式目标与层级核对)。


