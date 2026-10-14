# 中国内地公告获取与状态读取实施记录

> 任务标识：LOCAL-HISTORY-LIBRARY
> 对应当前规格：[产品契约](../../specs/2026-10-07-local-history-library.md)
> 状态：本轮范围全部完成，2026-10-08归档；本文为历史执行记录

## 共享边界

三仓存在并行修改，执行者仅修改公告链所需文件，不撤销、不提交其他改动。DSA拥有获取、保存、解析和资料读取；共享Schema定义目录合同；Server只读消费；Desktop保持现有列表样式。当前主题只完成中国内地状态公告，其他资料迁移不构成依赖。

读取没有逐公司人工准入门槛；检查和目录查询只读；局部未知保持未知。每个叶有一个主要执行面，定向验证跟随实现；真实部署和浏览器集中在I01验证，不能用fixture替代。

## 执行任务

- [x] T10：核实官方有界查询与当前状态调用合同。
  - 覆盖AC01／发现依据、AC04／现有调用语义。
  - 证据：巨潮 `/new/hisAnnouncement/query` 真实返回四家公司、四原件；pageSize=1返回hasMore=true,totalpages=4。状态路由源码及测试断言无准入记录仍200。
  - 边界：仅查询成功；PDF下载、解析和正式运行态尚未据此完成。

- [x] T00：核实最小存储与调用入口。
  - 覆盖AC02／实现前置、AC06／部署选型。
  - 证据：DSA DATABASE_PATH默认在data目录；infra把既有DSA持久卷挂载至/app/data。使用相邻子目录，无新增表或挂载。
  - 入口：DSA状态读取、Control认证、精确检查；Server市场数据controller；现有资料Sheet。
  - 边界：不代表目标持久化验收完成。

- [x] T01：冻结公告列表最小合同。
  - 依赖T10、T00；覆盖AC02、AC03。
  - 写入共享Schema、fixture与合同测试；条目含身份、证券、标题、发布日、原文、用途和下载／解析状态；分页50默认100上限。
  - 验证非法状态、日期、链接及分页；旧Provider清单兼容。完成后消费者复用合同，不增加现金多包协议。

- [x] T02：实现持久化公告记录与原件。
  - 依赖T00、T01；覆盖AC02。
  - 写入DSA专属repository及测试；稳定公告标识去重，原子替换单件记录；缺少库目录返回空列表。
  - 验证重复保存、重新打开、下载失败记录、部分成功、损坏记录报告及原件摘要；不操作用户业务库。

- [x] T11：实现有界获取CLI。
  - 依赖T02；覆盖AC01、AC02。
  - 写入DSA巨潮适配器、CLI及定向测试；输入规范证券列表、日期、最多页数；检索元信息立即保存，逐件下载并记录结果。
  - 验证两公司至少三原件真实下载，分页截断／失败明确统计，重跑不重复；依赖变更同步requirements与说明。
  - CLI是显式获取入口，普通请求不抓取，不启用调度。

- [x] T09：接通DSA与Server认证目录查询。
  - 依赖T01、T02；覆盖AC03／API。
  - 写入DSA独立router、Server目录controller、定向API测试；复用既有认证与DSA client，避免增加大文件职责。
  - 验证认证、分页、搜索、非法参数、失败语义与旧皇台种子去重；只读请求不写配置或准入。

- [x] T09.1：现有Sheet消费公告查询。
  - 依赖T09；覆盖AC03／客户端。
  - 写入Desktop查询hook、公告列表组件和定向测试；使用TanStack Query与现有shadcn组件；其他资料仍用原清单。
  - 验证元信息可见、未下载／未解析状态、过滤与翻页、空库／失败、查询竞态；保持来源列表与焦点修复。

- [x] T12：解析一种明确停／复牌日期表达。
  - 依赖T11；覆盖AC04／解析。
  - 写入DSA独立解析模块及测试；pypdf抽取原文，仅明确完整日期与实际状态生成事实；原文位置与摘要保留。
  - 验证真实原文逐项对照、标题与生效日期不同、歧义／进展公告、部分失败；未解析公告继续展示。

- [x] T04：通用读取新增标的并保留未知日期。
  - 依赖T02、T12；覆盖AC04、AC05。
  - 写入DSA状态库选择／合并helper、旧读取器必要调用和路由测试；没有独立准入记录的新公司可读取。
  - 验证错公司、局部未知、冲突、摘要不匹配和原000995交易／风险修订；Server响应合同继续复用，若实测需要改变则先拆消费侧叶。

- [x] I01：真实获取、展示与状态读取的目标验收。
  - 依赖以上实现叶及定向检查；覆盖AC01～06整体链。
  - 通过infra正式update入口更新受影响目标，记录依赖变更与退出结果；不调用直接Docker状态变更。
  - 核对至少两公司三原件，实际API／浏览器列表，真实解析状态经现有路由读取；无新增人工准入；重复获取无重复，失败不损旧数据。
  - 核对持久化资料路径及正式重启后保留；Desired、凭证、准入和历史冻结变化有明细。缺少证据保留未勾选。

- [x] I01.1：新增公司通过目标HTTP停复牌路由读取。
  - 依赖已完成的公告目标获取；先记录当前策略及来源配置摘要，只临时切换中国内地股票状态路由到`cn-stock-daily-suspension`。
  - 使用真实Data HTTP读取000881.SZ和600774.SH，验证已知日期与unknown，当前Schema校验响应；不写凭证、准入和公告库存。
  - 通过Server正式策略API恢复原选择；记录两次revision变化，核对全部路由内容及来源配置标记恢复。遇到并行策略修订不得覆盖其他用户修改。

- [x] I01.2：DSA镜像固化及重建后验收。
  - 依赖I01.1；当前源码定向测试已通过，使用infra正式`./scripts/update.sh dsa`构建一次，仅在入口检查空间，恢复到至少20GiB后才构建。
  - 核对新容器镜像、源码摘要、用途分类修复、六份公告及原件摘要；重新执行只读查询及原有风险警示HTTP读取，检查用户配置保持恢复值。
  - 镜像及目标重建通过后统一完成I01、最终一致性评审与Task归档；不提交并行工作。

## 验收责任

| 标准 | 实现叶 | 真实验收 |
| --- | --- | --- |
| AC01 | T10、T11 | T11、I01 |
| AC02 | T01、T02、T11 | 各叶、I01 |
| AC03 | T09、T09.1 | 各叶、I01 |
| AC04 | T12、T04 | 各叶、I01 |
| AC05 | T04 | T04、I01 |
| AC06 | 各受影响叶 | I01 |

## 检查点与最终评审

本地实现叶与I01全部完成，真实获取、列表、状态HTTP、持久化和用途修复镜像固化均通过。依赖图：T01→T02→T11→T12→T04；T02→T09→T09.1；全部→I01。范围明确、无循环、真实获取前置，页面展示不等待解析。

- [x] 所有实现叶自身定向验证通过，合同与当前实际代码一致
- [x] 真实公告、元信息、原件、解析事实数量各自准确
- [x] 状态读取继承当前配置调用和未知语义
- [x] 正式部署与浏览器证据通过，持久化验证有独立结果
- [x] 无越界修改或提交，既有冻结与配置保护有证据

最终结论：本次中国内地公告获取、展示与明确停复牌读取范围通过验收，详见末尾最终一致性评审；现金、收费、其他市场和定时获取不属于本轮范围。

### 2026-10-07 本地实施证据

- 真实CLI输入：四个标的 `000995.SZ,000881.SZ,600774.SH,300757.SZ`，2023-08-16～25，max-pages=5，隔离资料目录 `/tmp/announcement-live-library`。六份不同公告、六PDF均下载，四份识别明确状态，两份保持未解析；分页未截断，无查询／下载错误。
- 使用当前生产读取器与上述真实原件，在隔离目录读取000881.SZ和600774.SH；实际Schema校验通过。中广核技08-21停牌；汉商集团08-18停牌、08-23复牌，其他请求日未知。此证据是宿主真实原文链，不是目标Docker验收。
- DSA定向33项通过，另有状态／多市场回归6项通过；Schema5项、Server1项、Desktop16项通过。日志：`/tmp/announcement-dsa-tests.log`、`announcement-regression-tests.log`、`announcement-server-tests.log`、`announcement-desktop-final-tests.log`、`announcement-schema-tests.log`。
- Schema／Server／Desktop构建通过，定向ESLint、Python语法／F类检查、Import boundaries通过；尺寸门禁退出0，既有超限文件有九条历史警告，本次新文件均在阈值内。日志：`/tmp/announcement-{schema,server,desktop}-build.log`、`announcement-eslint.log`、`announcement-size-gate.log`。
- 正式更新尝试：infra目录 `REPAIR_BUILD_CACHE_ON_NO_SPACE=false ./scripts/update.sh all`，退出1，原因是已有更新锁；日志 `/tmp/announcement-target-update.log`。已只读核实锁持有者PID2965仍运行 `bash ./scripts/update.sh all`，其DSA基础依赖下载持续推进；未删除锁或操作该进程。
- 首次目标保护性读取摘要 `22ede303d517011ab403cd541f91003e1b425b31c5bc085064435941617da7e4`，包含完整策略和来源的providerId/enabled/configVersion/updatedAt。本轮没有调用保存策略、凭证、签发准入或目标公告获取接口。
- I01剩余：等现有正式更新结束，重新测量空间并通过正式update入口部署当前代码；在目标调用有界获取，把公告保存到已有DSA持久卷；验证目标目录、真实状态、实际浏览器和正式重启保留。当前页面尚不能据本轮代码验收。没有提交或发布。
- 更新兼容：新服务端通过`documentCatalog: announcements`声明目录能力，前端仅对该标志启用新查询；旧服务端继续走现有资料清单。对应Schema标志保留与旧清单兼容测试通过，避免目标更新期间公告列表失效。

### 2026-10-07 更新重试检查点

- 更新锁已解除。第一次重试关闭缓存整备，空间实测宿主17070MiB，低于20480MiB，正式入口退出1，未开始构建；日志`/tmp/announcement-target-retry.log`。
- 按正式入口默认空间整备回收未使用BuildKit缓存，报告3.314GB；镜像只读预览没有可删除候选，运行镜像及两份现有回滚基线保留。沙箱内镜像检查的进程读取遇到EPERM，随后使用同一正式入口的宿主权限重试。一次自动权限审核超时未执行，获准重试后脚本运行。
- 用户明确要求持续安全清理直至至少20GiB。重试构建前实际宿主22116MiB（约21.6GiB）、Docker21655MiB，门禁通过；DSA构建前复测宿主22117MiB。运行卷、数据库、回滚镜像未删除，未降低空间阈值。
- 正式执行：infra目录`./scripts/update.sh all`，默认启用空间整备；日志`/tmp/announcement-target-retry-repair.log`。当前正在生成DSA依赖和原生SDK，旧目标服务仍运行，最终退出与I01验证尚待记录。
- 更新前保护性读取摘要仍为`22ede303d517011ab403cd541f91003e1b425b31c5bc085064435941617da7e4`。公告目录当前尚未部署，更新过程中不调用保存策略或凭证接口。

### 2026-10-07 目标恢复与真实验收

- 前次DSA镜像成功构建，Server前重复空间检查退出75。遵循用户最新要求，infra入口只检查一次；保留空间不足时的有界故障恢复。精确镜像复用和空间编排测试通过，更新编排19场景通过。
- 正式执行目录为`thesis-ledger-infra`：`REUSE_DSA_IMAGE_ID=sha256:b66af4e91a4bd5fb59214ed1d20a5066c50204a0a2a7c5671325d8fbb7b0e838 ./scripts/update.sh all`，退出0。入口实际宿主20963MiB、Docker19612MiB；DSA直接复用，Server正常构建，五服务健康，回滚标签移除0。日志`/tmp/announcement-target-resume.log`。
- 目标DSA实际镜像为上述b66，Server／Worker为`sha256:87ef0df18aeb80f596f1379dc06237593e19b8d588e4e17bbcc7b99d78973499`。数据库和持久卷保留；资料位于`thesis-ledger-dsa-data:/app/data/thesis-ledger-announcements`。
- 目标Control获取2023-08-16～25的四个标的，HTTP200，matched=6、downloaded=6、parsed=4、truncated=false、errors=[]。重复获取总数仍6。Server公告GET200，600774筛选3份、第二页2份通过。最终日志`/tmp/announcement-target-final-fetch.log`。
- 实际浏览器保持既有资料Sheet，完整目录6份、筛选匹配3份、未解析公告及原文链接均可见；截图`/tmp/announcement-target-list.png`。真实页面发现高亮HTML分割标题关键词会遗漏用途，改为先清理标题再分类；定向5项通过。该修复通过`./scripts/sync-code.sh dsa`退出0生效，属于容器可写层，镜像重新构建后才能固化。
- 首次快更因同版本pypdf依赖行中文注释不同而拒绝，恢复本次原行后正式预检通过。最终同代码正式重启前后6JSON／6PDF及记录摘要均为`55e625412a8853983c02dac333f5066f1ce44a90f668da21e3abb0efbdf59cb6`；重启后Server公告查询仍200，总数6。日志`/tmp/announcement-target-final-restart.log`。
- 目标容器只读调用生产读取器：000881.SZ在08-21停牌，600774.SH在08-18停牌、08-23复牌，其他请求日unknown；两份响应通过当前Schema。结果`/tmp/announcement-target-status.json`。当前用户配置的风险警示来源HTTP读取000995.SZ返回200，6天。
- 策略revision／enabled／routes／时间及历史、Provider启用／版本／时间和凭证配置标记的保护摘要，在正式更新前后与最终重启后均为`f0ca3c3c8a300b79dfde72d1ec6a9eb5eb4f78558af8a331b572b59fd8459781`。未保存策略、凭证或签发准入；无提交和发布。
- I01剩余明确边界：用户当前中国内地状态主路由选用风险警示来源，新获取的停复牌事实已在目标生产读取器验证，但没有将主路由改为停复牌来源，未声称新增公司通过该HTTP主路由读取。Task保持活动，完整状态路由验收尚未勾选。

### 2026-10-07 剩余任务继续实施

- 用户授权继续剩余HTTP验收和镜像固化。通过Server正式策略API临时把中国内地股票状态路由选为`cn-stock-daily-suspension`，两家公司真实Data HTTP均成功：000881.SZ在08-21停牌，600774.SH在08-18停牌、08-23复牌，其余请求日unknown。两个响应均经当前Schema校验。
- 使用同一Server正式API立即恢复全部原路由内容及启用值。revision从11到12用于验收、再到13恢复，最终syncState=applied；来源配置及凭证标记摘要不变，准入记录摘要仍为`ccbdfc259eac5e6e256ddde636074e8ee4152d4abb87a31b3ca466561e5de337`。公告库存摘要仍为`55e625412a8853983c02dac333f5066f1ce44a90f668da21e3abb0efbdf59cb6`。未生成回测或修改历史冻结记录。
- HTTP验收数据：`/tmp/announcement-target-http-acceptance.json`。临时切换和恢复增加两次正式配置历史，不声明revision／历史完全未变；用户最终路由选择保持原值。
- I01.2开始通过infra目录正式`./scripts/update.sh dsa`构建；日志`/tmp/announcement-target-final-image.log`。本轮不设置镜像复用参数。公告输入摘要`da0994ec382757ebc34b47639fae11a2a51ed7da21a43c963ed0ff1d151d10b2`，涵盖巨潮适配器、资料库、解析／状态合并／读取器、公告router及requirements。
- 上述更新入口宿主20842MiB通过预检，但SDK的Debian HTTP依赖下载500／502导致安装退出100，正式缓存重试一次后仍失败，脚本退出1，旧服务未替换。已定位临时Dockerfile转换漏掉SDK单行APT命令；infra已补齐与运行镜像一致的HTTPS源、三次下载重试和45秒超时，并保留APT下载缓存。定向与Compose测试通过，源码SDK版本及源Dockerfile保持。
- SDK恢复契约和实施由相邻infra的`docs/specs/2026-10-07-dsa-sdk-build-network.md`、已归档`docs/archive/tasks/2026-10-07-dsa-sdk-build-network.md`维护；真实构建与本任务I01.2复用同一次正式更新。修复后首次入口日志`/tmp/announcement-target-sdk-network-image.log`，此历史检查点尚待最终构建结果，完成结果见下一节。
- 恢复构建首次因Docker内部空间差4MiB仍被入口拒绝，宿主已超过22GiB。infra维护入口精确移除本轮两条失败构建元数据后仍未达到门槛；随后预览并清理开发DSA四个源码目录的381个可再生成pyc缓存，释放约7.8MiB。源码、持久资料、凭证和数据卷保留，未降低空间门槛。2026-10-08正式`update.sh dsa`再次开始，最终日志`/tmp/announcement-target-sdk-solid-image.log`。

### 2026-10-08 镜像固化与最终验收

- infra目录正式`./scripts/update.sh dsa`退出0；入口单次实测宿主22511MiB、Docker18436MiB。SDK HTTPS源与有界重试实际生效，SDK安装188.9秒完成，原生wheel及`verify_longbridge_native_storage.py`验证成功，最终启动健康通过。日志`/tmp/announcement-target-sdk-solid-image.log`。
- 当前开发DSA实际镜像为`sha256:2bb9b824a289d704fe7b097508310cf2a9832d2cc9788eba0ec4dc5be7a3f3b0`，用途分类修复已在镜像内。新容器七个公告输入文件摘要仍为`da0994ec382757ebc34b47639fae11a2a51ed7da21a43c963ed0ff1d151d10b2`；镜像内高亮标题分类定向断言通过。Server／Worker仍为87ef镜像。
- 重建后既有`thesis-ledger-dsa-data:/app/data`挂载保持，六JSON／六原件均通过摘要读取，库存摘要仍为`55e625412a8853983c02dac333f5066f1ce44a90f668da21e3abb0efbdf59cb6`。公告GET200，总数6，600774筛选3份、第二页2份均通过，真实复牌条目用途为suspension。
- 新容器上重新执行两家公司真实Data HTTP并通过当前Schema，已知停复牌日期及其余unknown均正确。临时策略13→14用于验收，再14→15恢复全部原路由内容及启用值，syncState=applied。验收响应`/tmp/announcement-target-image-http-acceptance.json`；恢复后的000995风险警示HTTP200，6天。
- 本轮累计两轮临时验收，策略历史11→12→13→14→15，最后选择保持原风险警示来源；未写凭证或准入。Provider配置标记一致，准入摘要仍为`ccbdfc259eac5e6e256ddde636074e8ee4152d4abb87a31b3ca466561e5de337`；最终策略及Provider配置保护摘要`27faec17759c4ea98371cd4dfd862251523249b6680095b873d465500ed26576`。未创建回测或修改历史冻结记录。
- SDK恢复的转换测试、Compose门禁、精确失败记录维护测试和字节码路径边界测试通过。按原政策保留两个历史DSA回滚镜像b66和18da，淘汰一条旧e6cf回滚标签；未删除数据库或数据卷。未提交、推送或发布并行改动。

## 最终一致性 Review

- [x] AC01～AC06分别有真实来源、持久化、API／浏览器、状态语义、回归和目标部署证据；各阶段数量独立准确
- [x] 全部实现叶与I01.1／I01.2满足完成条件；新增公司经真实HTTP读取，不要求逐公司人工准入
- [x] 稳定公告输入摘要、最终镜像及六份原件对应同一集成基线；新容器上已重验HTTP与Schema
- [x] 临时策略切换及恢复有修订明细，最终用户选择恢复，凭证配置标记与准入保持，历史冻结不回填
- [x] 下载／解析失败展示、未知日期及负例的定向证据有效；列表保留既有样式和真实未解析条目
- [x] SDK网络与空间恢复问题已由infra维护入口完成；未绕过正式更新或降低门槛
- [x] 当前范围无未完成门禁、Blocking问题或未定义契约，Spec／Task及导航与最终结果一致
- [x] 仅归档已完成执行记录，当前Spec保留；没有提交或撤销其他工作

结论：通过。复用仍有效的包级构建、边界和浏览器证据；只对后续用途分类修复、SDK构建环境与镜像替换重验受影响范围。现金／其他市场迁移、结构化风险解析扩展及定时获取不作为本轮交付条件。
