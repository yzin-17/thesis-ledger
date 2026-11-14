# 基础行情缓存完成阶段证据

对应[规格](../specs/2026-11-11-market-base-result-cache.md)及[任务](../archive/tasks/2026-11-11-market-base-result-cache.md)。分开记录前置门禁、实际Redis、扩展与最终运行态；未完成层级继续由Task持有。

缓存C0～C6已完成最终验收，目标结果见本页末节。本线程未执行备份或迁移：两次入口尝试被活动锁拒绝，随后复用并行正式更新的适用产物和回执。该并行回执包含备份，不能称为“不备份目标实测”；新分支的真实目标缺口由[独立证据与活动任务](2026-11-12-development-upgrade-without-backup.md)持有。下文阻塞与备份方案保留为各自时点记录。

## 前置门禁与首次成功代次

共享失败按现行合同收敛，物理数据进程7项通过；首轮完整DSA门禁8065通过、1跳过、4取消选择、323个子测试通过。随后发现catalogEntry.verification在首次来源成功后改变，会令缓存返回前的代次复核误拒绝。

生产者只排除不影响已允许读取的verification展示记录，保留真实账号、权限、启停、配置、适配修订等控制事实。新旧上下文及首次使用56项通过；生产输入变化后重验完整门禁，最终8074通过、1跳过、4取消选择、323个子测试通过，316.82秒，退出0。

原始日志位于忽略目录`.recovery-artifacts/cache-completion-20261112/ci-first-use.log`，JUnit SHA256=`3e1db57df7c9539e70e4c0e8fdd68bc7f7819214a7d995cebfde6d10c7ecb16c`。前轮全量日志及旧失败独立保留，见[DSA证据](../../../daily-stock-analysis/docs/evidence/2026-11-12-cache-prerequisite-gate-reconciliation.md)。没有使用真实Provider或写真实准入验证此机制。

## 实际隔离Redis

使用现有仓库资源入口`apps/server/test/backtest/nav-worker-redis.integration-harness.ts`：随机loopback端口、64MiB tmpfs、不挂载volume，以随机标签确认清理目标。镜像`redis:8-alpine`已存在，ID=`sha256:21090af93f8324db2f0f0f4f38a7c60369d47d917e000c3423d89d2ae2883537`，没有拉取镜像或操作业务Redis。

命令：`E11_BAR_CACHE_REDIS=1 volta run --node 24.22.2 pnpm --filter @thesis-ledger/server exec vitest run test/market/market-bar-result-cache-redis.integration.test.ts`。六项最终全部通过：跨实例仅一次加载、实际剩余TTL及到期、Lua刷新围栏、控制代次隔离及关闭、错误／损坏载荷、实际客户端断开后的降级及拒绝保持。来源和控制为受控输入，Redis命令及过期使用真实组件。

首次测试的迟到响应fixture错误使用原requestId，正确被请求关联拒绝；修正为请求自身ID后六项通过，没有改变关联门禁。Date.now固定在代表日，Redis计时未替换。测试容器按标签清理，最终docker ps该标签结果为空。

稳定键按固定字段顺序编码路由与目标，属性插入顺序变化不改变键；完整身份／代次／窗口隔离保留。缓存定向23项及Server类型检查通过，没有清理业务键或引入旧成功回退。

## 扩展边界

C5按分钟、日线分别实现；所有新增复用统一为原观察时点起60秒，已知休市和纯历史交互也使用此短上限，日历未知不新增缓存。原始来源时点、价格、指纹及复权不改，24小时历史长缓存未启用。SDK内部缓存不认证，失败来源不因实施缓存而变得可用。

C5已完成。新增49项覆盖30个分钟组合、18个日线／历史组合及主备隔离；连同原23项共72项通过。扩展后实际Redis六项再次通过。Market离线1228项通过、9项待运行、0失败，原始JSON为`server-market.json`；Server类型、边界、schemas build及Server build通过。Server首次build因并行源码新增的schemas导出而读取到旧dist失败，重建schemas后build通过，未修改或回退并行任务。文件尺寸检查退出0但仍有五个历史告警，不宣称消除了历史技术债。

缓存生产代码定向ESLint退出0；新宿主脚本在仓库ESLint忽略范围，不把忽略告警算作脚本静态通过。宿主入口受控测试两项通过。

## 正式DSA与跨组件集成

在infra使用Node24执行正式`./scripts/sync-code.sh dsa`，退出0，日志`formal-sync-dsa.log`。镜像未变，未执行数据库结构或外部卷变更；这是容器可写层快更，不是镜像发布。目标DSA启动于`2026-11-12T05:21:44.735475006Z`，缓存控制模块宿主／目标SHA256同为`3be69e30be267c8257fe5c45211362ac74d3d7ffa317e23aaa42fcdae6bdb681`。

所属主仓入口`verify-market-bar-cache.mjs`通过现有隔离Redis harness执行工作区模式。真实DSA有效策略199、MarketSessionReader和控制上下文、实际Redis均参与；价格加载器为受控输入，DsaClient价格方法被替换为抛错计数器，最终价格调用0。CN600519.SH日线当前实际主源为HiThink，US AAPL.US分钟主源为富途；各口径普通两读仅加载一次，手动刷新另加载一次，来源时点保持、请求ID重新关联。CN会话open、USclosed，后者采用日历提供的最近完整交易日11月11日，不作为美股盘中来源证据。

首次集成错误假设当前CN已选腾讯而拒绝，未进行价格请求；根据真实策略选择当前已合格目标后通过，未变更路由。两次独占许可分别保留在`control-integration-01/`和`control-integration-02/`，没有复用旧许可。成功回执时间`2026-11-12T05:29:27.688Z`，工作区编译缓存SHA256=`f34c910d1e0b61635dffa408a3ab8208a01c1f33add226f860b154da785f087a`。应用容器在本次读取前后不变，隔离Redis已清理。

此为工作区编译产物加真实DSA／日历的集成，回执明确`actualTargetCacheCode=false`；不认证目标Server已部署完整扩展。

## 四宽受控浏览器

维护入口`market-bar-cache-browser.mjs`通过既有Vite受控页面加载真实MarketDetailDialog及行情图。在1440、1024、768、390四宽分别验证：刷新时原图保留，图区只有一个加载圈，请求携带refresh=true；失败后原图保持并可再次刷新恢复；弹窗边界、无页面横向溢出、关闭和重开通过，页面错误为空。截图及JSON位于`browser-01/`，人工查看390刷新及1440失败截图，失败原因和原图同时可见。

受控接口不发价格请求；浏览器不是正式Server缓存运行态证据。C6.2继续等待正式目标页面。

该证据对应13:29执行时的共享前端输入；测试结束后Vite观察到并行任务继续修改行情组件，不能把本次截图升级为随后源码的最终验收。受控Vite已停止，正式目标更新后按届时输入复核四宽。

## Server正式更新阻塞及可执行方案

正式`./scripts/sync-code.sh all`在兼容预检退出1，日志`formal-sync.log`；未执行本次容器或数据库变更。原因是并行[实验手动重试任务](../archive/tasks/2026-11-12-experiment-manual-retry.md)新增Prisma结构，不能使用快更绕过。

已只读核对数据库`thesis_ledger`、owner及current_user均为`thesis_ledger`，实际SchemaVersion=`20261112010000_autonomous_model_arena`。唯一待执行迁移`20261112020000_optimization_manual_retry`对OptimizationExperiment新增非空JSONB列retryState，默认空对象，并加对象类型约束；不属于缓存所需结构，本轮未应用。

迁移SQL SHA256=`766a5bcc1161b4e8fff5009d528043558c84f6bd9a659aba9172661a77988176`。七份本主题中文Spec／Task／证据的相对链接核对无缺失，两仓对应文档diff检查退出0。工作区AGENTS明确“脚本入口本身不扩大迁移、发布等操作的授权范围”；原用户边界为不改业务数据，因此不能把继续缓存验收解释为自动批准并行任务的业务表迁移。

正式保留数据升级能力已存在。后续若获准处理该并行结构变更，应在infra以`DEV_DATABASE_MODE=upgrade DEV_DATABASE_CONFIRM=thesis-ledger-dev/thesis_ledger ./scripts/update.sh thesis-ledger`执行：由入口停止消费者、备份、隔离恢复演练及行摘要核对，再事务增量迁移和完整结构验收后重启。禁止rebuild、删除volume、伪造SchemaVersion或手工ALTER绕过。备份、演练和升级任何一步拒绝即停止，不把容器健康视为升级完成。

上述为当时未完成C6的接续方案；后续实际验收见下节。原来源失败、未覆盖、供应商确认及SDK内部时效没有由缓存验证补成成功。

## 最终目标运行态与消费验收

并行正式更新已于06:00Z完成增列及服务更新。本线程第三次准备先只读查询head，发现已为20261112020000_optimization_manual_retry，选择对账而未再次调用迁移。正式增量证据目录为infra忽略目录.database-upgrades/run.JDh3jD：execute.log记录事务成功，rehearsal.json的计划指纹为a7412a6dec7fb01df956d1965f0328cf6cca687a93ed3439ba5bd3e481d5cfef，旧head为20261112010000_autonomous_model_arena、新head与目标一致，结构、应用权限及副本旧数据核验通过。此目录包含backup.dump，属于并行默认升级，未删除或冒称本线程不备份执行。

当前Server完整ID为7cd24f3afb068efb04df174bccd786fd1efdd151247830842d11bc0e06339dc8，Worker为c1f90068529196dd090b70aff8dc3dff404eb1aaf1392e258a8c221a00f7b85a，镜像同为sha256:8066e62ea225285e281698676d3dfad77a481fa253e24fc235e8e1aa9360764f；分别于06:00:09.747Z和06:00:09.683Z启动，均healthy。DSA维持本线程05:21:44Z快更代次。retryState实际为非空jsonb、默认空对象，对象约束convalidated=true。

所属入口verify-market-bar-cache.mjs的target模式通过，回执control-integration-target-01/report.json于06:02:46.832Z完成，actualTargetCacheCode=true、目标前后未变。程序在实际Server容器内运行其编译模块，连接真实DSA策略199、真实MarketSessionReader及隔离Redis，价格加载器受控、价格方法抛错计数防止越界。CN600519.SH日线选当前HiThink，US AAPL.US分钟选当前富途；各自普通两读只加载一次，刷新另加载一次，来源时点及请求关联保持。实际运行API的数据库／Redis／DSA均healthy，SchemaVersion正确。隔离Redis最终已清理，未操作业务Redis。

宿主／目标三个编译文件SHA256均一致：market-chart-result-cache=f34c910d1e0b61635dffa408a3ab8208a01c1f33add226f860b154da785f087a；market-bar-result-cache-store=82bbc16f631f6e0a86889b88e3ec2d010898cb9b09331233f8e9a8926a56785d；market-request-coordinator=ecb44a1e82b4a3fd470b52dab77a4ca734c844586b757f2509525c9e33b56ce8。新Server／Worker自本次启动至核对的各2000行日志内，缺表、缺列、结构版本错配及ERROR均为0。

实际Desktop自选页的最终四宽检查完成于06:03:04.999Z，target-browser-final/report.json及截图保存全部结果。1440／1024／768／390均验证刷新保留原图、单个图区加载圈、refresh=true、失败文案、恢复、请求中关闭及重开、弹窗边界和页面横向溢出0。目录及行情载荷受控，业务写入0、供应商价格调用0；32个额外行情读取被拦截，未认证这些附加接口。实际页面验收与目标Server缓存机制相互补充，不表述为真实上游价格端到端验证。

最终一致性Review按契约／控制、缓存／并发、日历／时点、部署／消费分别复核，AC1～AC6证据完整。C6.1／C6.2可以勾选，缓存Task可以归档，现行Spec继续有效。不备份分支没有真实目标执行，仍由独立活动任务保留；真实来源失败／覆盖／确认及SDK内部时效边界保持原结论。没有提交、推送、恢复计划或新增供应商价格请求。
