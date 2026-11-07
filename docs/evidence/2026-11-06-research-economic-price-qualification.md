# 研究无事件窗口经济价格资格与实施证据

> 对应[单标的任务](../tasks/2026-11-06-research-economic-price-qualification.md)、[父研究任务](../tasks/2026-10-18-research-evidence-evolution.md) T13c/G4b.3

## 实源材料

11-06已重新成功读取HiThink官方完整说明，567826字节、SHA-256 `6bb1e9411bdd9f5cc1989b1a1147ef38378141f9acf7ba0075057687fe36db83`，与既有文档相同。协议将公司行动接口定义为单标的无分页原始事件流；无日期过滤时返回完整历史，现金分红以税前每股原币种表达、送股以每股比例表达。配股数值未有完整公开字段，本次不实现含事件的价格换算。

使用既有启用HiThink和只读凭据快照，有界采集共3次GET：

1. 600519.SH、10-29至11-05公司行动窗口请求HTTP200/code3002，按数据未就绪停止，不把它解释为无事件；未继续原定价格请求。
2. 改为同一股票的无日期过滤完整事件流，HTTP200/code0，30条记录，按日期降序、唯一，最早2002-07-25、最新2026-06-26；10-29至11-05窗口内没有任何事件日期。
3. 同一股票原始日线adjust=none，HTTP200/code0，精确覆盖10-29、10-30、11-02、11-03、11-04、11-05六个交易日。原收盘价分别1354、1392.05、1439.1、1480、1446.44、1452。

调用无自动重试、无重定向，Provider行在每次受控进程前后相同；没有实例化会建表/轮换凭据的ControlStore，仅复用其解密读者和mode=ro连接。未输出密钥、保存明文凭据、改变配置或开通付费能力。费用仍未核实，沿此前有界操作授权，不把回包成功声明为免费。

原始回执在忽略目录 `.recovery-artifacts/research-economic-price-20261106/`。公司行动保留解析后的完整JSON及原HTTP字节摘要，不声称解析后的JSON可重建原HTTP字节；另计算规范化内容摘要，用于冻结与重验。原始价格字节摘要与紧凑序列化可核对，输入引用还绑定整份捕获文件摘要。

## 经济含义与范围

这不是将原生qfq改标签。只对原固定窗口，在官方完整事件流显示所有行动日期均位于窗口外、独立合格日历与六条正成交量/额raw日线精确一致时，采用窗口末日固定锚点、单位因子1，经原Market派生算法计算。无公司行动期间经济回报为同一份raw末价/首价−1；独立十进制计算1452/1354−1=0.072378138847858197932053176。

窗口内只要出现任何事件日期，即使现金为0或类型未知也拒绝；不因源缺配股数值而猜测其影响，不泛化到含分红/送股/配股窗口。源合同若不能证明完整日期覆盖、证券身份或字段语义，则不能走该路径。本次证据依据完整30条流及协议范围，不依据过滤请求3002、价格连续或qfq/raw相等来推断事件缺失。

资格核对时刻为 `2026-11-06T14:21:18.183+00:00`，全部日点及固定锚点可见时间取该实际资格时刻，不回填至10-29或11-05。未来通过原接口提交时仍须由原可见性门槛核对实际截止。

## 实现边界与现有验证

DSA维护只读采集和源协议规范化编译；Market维护通用资格包、原派生快照及独立证书的原子不可覆盖发布，MarketBarReader只在priceResearch明确启用时消费精确窗口证书。Research原经济资格函数保持，普通原生qfq、基金估值及行情路径不变。读者前后复核现有raw/qfq策略、首源身份、eligible/catalogReady与合格日历；没有新路由或自动来源启用。发布仅由含原件摘要和精确开发库确认的维护脚本执行，普通Research请求不能提交或注入价格材料。

离线验证：只读采集9项、无事件语义5项、Market与仓储/控制15项通过；相关10文件回归通过，最终Research相关包159项通过、80个隔离PG用例跳过，不声称238项全过。新专用证书表及派生快照的真实JSON往返、幂等、身份约束及同次回滚由2项隔离PG用例通过；旧仓储/恢复未变部分继续复用。新增迁移后的结构及升级计划23项通过，迁移矩阵为46份、98张表（82个Prisma model、16个raw-owned）。实际发布及后续正向观察另由目标运行态验收。CLI维护入口3项测试通过；目标身份、摘要缺失/错误及异项目拒绝，不创建临时应用。

当前Server类型、源码ESLint、边界检查通过。已检查现有Market→Research/Performance等依赖门禁；新实现保持原方向，Research未导入私有证书仓储或Provider DTO，不增加跨feature共享职责。DSA数据测试清单已登记新增两文件，范围检查通过；语法检查通过。

初次CLI测试使用裸node受Volta缺失的Node24范围解析阻塞，改用项目pnpm exec node后通过，没有安装依赖或改变版本。首次Python语义测试暴露不同解释器对Z时区字符串的差异，规范化为显式+00:00后通过；首次只读控制预检误传完整Policy信封，改用原desired投影后raw/qfq首源均eligible/catalogReady。以上不计作Provider故障或经济价格通过。

## 运行态发布前发现的约束及修正

初版维护发布将资格证书写入旧派生快照表，实际数据库拒绝 `MarketDerivedSeriesSnapshotV3_snapshot_check`，事务回滚后该表仍0行；两次失败尝试均保留原日志，没有放宽旧约束。新建专用 `MarketEconomicPriceCertificate` 表承接资格证书，外键绑定原派生快照，身份列与证书JSON需一致；Market原子封存两表，原派生快照结构保持。相关隔离PG测试真实覆盖了此前fixture未覆盖的数据库约束。

因新增Schema，原纯代码快更不足以交付，改用正式 `../thesis-ledger-infra/scripts/update.sh thesis-ledger`，工作目录为infra，参数 `DEV_DATABASE_MODE=upgrade`、`DEV_DATABASE_CONFIRM=thesis-ledger-dev/thesis_ledger`。第一次构建在Alpine gcc包解包处出现I/O错误，旧服务未停止、数据库尚未升级；空间预检余量充足。只读核对现有系统代理，并以该代理对Alpine官方索引HEAD得到200，后续仅在原入口失败返回后以既有BUILD_HTTP_PROXY/BUILD_HTTPS_PROXY参数恢复，不变更业务配置、Docker配置或价格请求上限。该失败不记为升级通过。

## 正式升级与材料入库

保留升级最终退出0。工作目录 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`，入口 `./scripts/update.sh thesis-ledger`，参数为 `DEV_DATABASE_MODE=upgrade`、`DEV_DATABASE_CONFIRM=thesis-ledger-dev/thesis_ledger`、既有 `BUILD_HTTP_PROXY/BUILD_HTTPS_PROXY=http://host.docker.internal:7890`，及本轮临时构建层 `BUILD_ALPINE_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/alpine`，NO_PROXY保留本地/npm镜像并加入该构建镜像。默认行为、源Dockerfile和运行层未改；可选参数由infra维护函数验证并生成临时Dockerfile，Shell测试覆盖默认保真、受控改写、签名校验保持与非法地址拒绝。

Alpine[官方镜像列表](https://mirrors.alpinelinux.org/)列出清华镜像；对实际3.24索引的只读完整GET核验为官方CDN529557字节/约12.4秒、清华529531字节/约1.3秒。此前3.23探针与其他镜像403不作为目标3.24成功证据。第一次I/O异常构建及同CDN代理续接均通过中断本任务自有buildx进程结束，正式入口各保留退出130及自动重试取消记录；未清锁或绕过入口，不据此声明自然失败或通过。最终镜像下载/应用构建通过，数据库升级才开始。

备份/隔离恢复演练及事务回执保存在infra `.database-upgrades/run.aJGzCq/`：5999246字节备份、SHA-256 `8be3e146bea8cb60aa1ab6aed53638e49146e36e165895fbdb67a706669f8b21`；消费者停止后备份，副本恢复、旧数据保全、应用角色权限及完整结构均通过。实际head从 `20261105080000_arena_weekly_reviews` 升至 `20261106010000_market_economic_price_certificate`，46份迁移/98张表；最终运行包的Schema、raw-owned清单及全部46份SQL与宿主输入逐一SHA-256相同。

正式镜像及两消费者实际ID为 `sha256:25580553140a33628f1121c5fa5fb2dd955025cebebd287283337095b1de9fa6`。维护材料入口按已审核文件摘要 `96b17a6656be63922683fc9a4f0257b081720437d4d55b774b744e26cb5c631a` 执行一次成功入库，原子产生1个原派生快照和1个专用证书：

- 证书指纹 `fee518e2f55c1853c9b86f6c57f69137dff9a00604aeb994d6f3db3fd5382903`。
- 原R01输入指纹 `d2f0561218e2acf8eb9ca4a4610cb1c3fe49ac304d5c97e6e5a91f23cd7588cc`。
- 入库后真实仓储重新读取、重算及完整载荷比对成功；策略188、86条路由和启用状态与初始规范化desired投影完全一致，来源请求0。

## 原模式日级证据补齐

首次正式提交 `7cbf0937-9103-4482-93a1-5f6cddcfcbda` 返回failed/data_read_failed、未产生版本。只读运行态诊断确认原Research请求带 `assume-untradable-no-bar`，必须绑定同批次日级证据；新读者当时缺少 `historicalTradabilityWindows`，原关联合同正确拒绝。该失败提交完整保留，不重写成成功，不归咎于Provider或经济材料。

修正从同一份已审核raw/派生日线提供六日 `observed-traded`，没有缺日、假设成交或合成价格。日历来源、修订、窗口、目标、原算法及规范化本地材料摘要均绑定；原始raw摘要另由证书持有，本地摘要不冒充上游qfq原件。16项定向、3项真实隔离PG通过，包含原请求模式经真实行情仓储写入及冻结回读，避免仅mock record漏掉协议关联。

此修正只涉及应用代码，按兼容预检后的正式 `./scripts/sync-code.sh thesis-ledger` 更新，退出0；Server/Worker健康，实际读取新代码完成后续验收。镜像ID保持上述值，修正位于容器可写层；未把快更声称为镜像重建或生产发布，容器重建须使用当前源码的正式更新入口。没有重复构建已通过的依赖和Schema镜像。

## 真实正向复核与页面

原报告 `898c9071-9c70-4cb8-9887-cd73971e8eac`、断言 `price-up-recent`，原模式shadow/标的范围。新submission `5e8cab2b-8b95-4cb3-842a-7cb61182459d` 在真实截止 `2026-11-06T15:05:00.433+00:00` 经原POST入口形成completed版本 `5d6b6c22-4530-4d1e-9707-10faf3a64155`，原逻辑观察仍为 `db500f3d-bdbe-4856-b561-9913a09d02b4`。精确截止以保存的positive-api-request.json为准，不将页面秒级格式化当成原始精度。

原5交易日窗口保持10-29至11-05，两端收盘时刻均上海15:00；经济收盘1354→1452 CNY，原方法实际计算回报 `0.072378138847858197932053175775480059084`、方向符合true，与独立十进制结果一致。sourcePriceBasis为local-derived/request-window，固定11-05锚点、embedded-verified、真实资格时刻11-06 22:21:18.183及原R01/证书引用完整。没有降低原Research资格函数或将原生qfq改标签。

同submission重放返回完全相同响应；旧not_due版本及原报告GET完整对象相同。历史恰有2个版本，提交3条（原not_due、真实失败、新completed），逻辑观察仍1条。统计为样本1/到期1/可计算1/符合1，排除项空；少于20个合格样本，sampleStatus=insufficient、directionMatchRate=null，不能据此宣称一般命中率。actual读取该shadow观察404。

实际浏览器1440及390视口均读取新completed、两端价格、7.24%展示、本次符合、两版本历史及样本不足说明；无横向溢出、页面错误或被拦截请求，12个API响应均200。只允许本地既有报告/观察等只读GET，没有页面POST、报价、模型或通知调用。截图及browser-positive-proof.json位于忽略目录，已实际查看两张截图；原浅深主题三视口的未改行为继续复用10-31证据。

## 保护与结论

目标PG逐行摘要核对：原127个行情证据全部相同，仅新增1个合格本地窗口；原100个境内原生窗口继续保留原口径。474个基金点、26个AiRun、198个AiToolCall、原观察/旧版本/旧提交、0个AiInvocation/Fact、0个Journal及2个通知旧行全部相同。研究只追加1个版本、失败与成功各1个提交；基金任务与已完成误差验收不改写。收口控制HTTP读取遇本地429时未自动重试，使用PG已存策略和原前后控制检查完成核对，没有追加外部行情请求。

本次整个价格资格补齐仅原3次HiThink源GET，后续材料入库、复核、幂等和浏览器均新增外部价格请求0、模型0、通知0；实际HiThink计费仍未核实，不声称免费。离线/包级证据分层保持：最终Research相关包159项通过/80项未执行的隔离用例明确保留，新增最终16项Market、3项自有隔离PG、23项结构/升级计划、3项CLI及infra构建网络测试通过，类型、ESLint、依赖边界和DSA范围检查通过；未声称执行远端CI。

AC1～AC4与父T13c/G4b.3全部通过；本轮研究价格复核完成，P3保留单链决定及其他配置/来源/研究门槛保持。此证据仅证明一个真实固定无事件窗口，不扩展为含事件通用复权资格或全部股票/基金精度保证。任务按原位置保留，不归档、暂存、提交、推送或发布。
