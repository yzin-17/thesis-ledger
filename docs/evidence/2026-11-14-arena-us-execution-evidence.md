# 美股执行证据修复记录

任务：[美股执行证据](../tasks/2026-11-14-arena-us-execution-evidence.md)。最新状态：代码与部署通过，隔离真实模型委托、成交及下一周期已形成；本次报价研究工具门禁未通过，原比赛开市实时成交未验证。下文保留各阶段失败，最终状态以末节为准。

## 原因与修复

富途当前快照投影丢失证券状态、证券身份、交易单位和美元单位；实时执行 Reader 拒绝 ETF，并尝试从只返回历史身份的接口取得执行规则。新增独立当前美股执行资料合同及 Reader，股票和 ETF 同用该路径；未知、停牌、错证券、过期时钟、规则覆盖不足均保留拒绝或禁止交易语义。相邻报价差不作为法定价差。

现行规则核查：SEC [最小价差延期原文](https://www.sec.gov/files/rules/exorders/2026/34-105656.pdf)将新价差实施延至 2027 年 11 月首个工作日；[2026-2 费率公告](https://www.sec.gov/rules-regulations/fee-rate-advisories/2026-2)规定 2026-04-04 起 Section 31 卖出费率为百万分之 20.60；[FINRA 生效修订](https://www.sec.gov/files/rules/sro/finra/2026/34-106409.pdf)及[正文](https://www.sec.gov/files/rules/sro/finra/2026/34-106409-ex5.pdf)暂停 2026 年第四季度 TAF。结算遵循 [T+1 公告](https://www.sec.gov/newsroom/press-releases/2024-62)。来源与全部资料摘要绑定独立规则版本，当前核查覆盖至 2026-11-14；未来日期不能仅凭有效期自动认证。

## 已通过的验证

- Server 当前美股 Reader、旧 Reader 和研究报价共 26 项；股票及 ETF 的正式领域提交、后续撮合、资金持仓、费用、T+1 及去重均为受控输入证据。
- 领域委托和公共费用共 10 项；共享 Schema 共 1597 项；Server 类型检查和构建、领域构建、相关 ESLint、依赖边界与文件尺寸门禁通过。
- 正式隔离 PostgreSQL 脚本运行自主委托与存储 10 项，使用独立临时数据库；不写目标业务库。
- 保留数据升级计划、SQL、恢复演练及归档映射共 26 项，infra 保留数据库测试 6 项。
- DSA 相关扩展回归 145 项通过；后续上下文传递和规则刷新变更分别经 80 项与 44 项定向回归，输入范围不同，不相加声称全量覆盖。
- 新增前向恢复副本探测 4 项、维护入口参数约束 2 项、历史分钟导出 1 项、历史分钟完成及下一分钟撮合 1 项通过。

## 尚未完成的运行验收

- `sync-code.sh all` 因运行 Schema 不一致拒绝，未替换代码；首次完整 `update.sh all` 构建成功后，结构检查发现唯一缺表 `JournalPeriodReviewSnapshot`，未重启消费者。
- 用户已授权带备份的保留数据升级；待由 `DEV_DATABASE_MODE=upgrade` 的正式更新入口完成，不能改用清库或免备份模式。
- 原 DSA 运行容器健康，其旧镜像摘要却不可寻址；已完成私有备份和断网候选验证，实际前向恢复尚未执行。原镜像不可回退的事实保留。
- 富途主来源真实历史行情已取得 AAPL 2026-11-13 的 390 根分钟，私有回执 `var/acceptance/arena-us-history-capture-v2-20261114.json`。第一次导出失败为工具投影错误，成功回执不覆盖失败回执。
- 隔离模型尚未调用。受控执行条件与真实价格分别记录，不能替代历史可交易性证明。
- 原美股比赛仍休市，下一开市为北京时间 2026-11-16 22:30；原比赛实时委托成交未验证。

## 部署接续点

2026-11-14 16:26 左右，受正式维护锁保护的 DSA 前向切换完成，候选摘要为 `sha256:45f94bb6b4844482674a82272d87f6df3b75438b2a30980d76e1666420fa40af`，容器健康。原物理文件检查未通过：`rule-source-monitor.sqlite` 的存储字节改变。随后独立只读核对确认该库 8 张表的完整结构与逐行摘要全部一致；主库 45 张表和其余文件仍保持。记录 `strictPhysicalCheckPassed=false`，不能改写为逐字节一致。私有回执在 `.recovery-artifacts/arena-us-forward-20261114-v2/applied.json`，备份未覆盖。

随后从 infra 仓执行 `DEV_DATABASE_MODE=upgrade DEV_DATABASE_CONFIRM=thesis-ledger-dev/thesis_ledger DEV_DATABASE_UPGRADE_NO_BACKUP=false ./scripts/update.sh all`。入口已记录新的 DSA 可回退基线并进入构建；接续时（北京时间 16:54）Docker Desktop 已退出，原进程不在，未取得最终退出结果或成功回执。数据库升级是否开始及完成必须在引擎恢复后重新核对，不能凭已启动命令认定成功。没有改用免备份、清库或其他部署入口。

用户授权协调的 A 股回放聊天已释放维护锁并保留待执行周期。当前本聊天持有的 `live` 新任务暂停尚未恢复，私有归属文件 `.recovery-artifacts/arena-us-maintenance-20261114/queue-owner.json` 必须保留。Docker 恢复后先核对活动周期、Schema head、升级备份及消费者健康，再完成隔离验收并通过原归属恢复队列。隔离真实模型尚未出站。

## 引擎恢复后的最终核对

用户恢复 Docker Desktop 后，确认旧 head 和缺表状态，重新从 infra 仓执行上述同一带备份 `./scripts/update.sh all`，退出码 0。证据目录为相邻 infra 仓 `.database-upgrades/run.B2Lhma`：备份 14,342,088 字节；`rehearsal.json` 确认恢复前 head、迁移后 head、完整结构、app role 权限及旧数据保持全部通过；`execute.log` 返回“事务执行成功”。目标库独立读取确认 head 为 `20261114010000_journal_period_review_snapshots`、107 张表、快照表存在。Server、Worker、DSA 均健康，启动后未检出缺表错误。

原比赛完整行、所有参赛账户及全部历史研究周期的摘要，与升级前私有导出逐项一致。修复后 AAPL 股票与 SPY ETF 各实读一次，均为 `futu/futu`，返回 USD、证券身份、交易单位 1、正常证券状态及独立官方规则；交易所分别为 `US_NASDAQ`、`US_AMEX`。休市报价仍为 2026-11-13 收盘时刻且 `freshness=delayed`，没有认证为实时成交报价。私有回执 `var/acceptance/arena-us-quotes-postfix-20261114.json`。

官方资料固定单批任务 `c953639b-ae59-491d-81be-0b8c989a5a07` 成功，6 份文档、0 变化、0 不可用，原监测配置保持。回执 `var/acceptance/arena-us-rules-postfix-20261114.json`，未开启定时监测或放宽执行预算。

## 隔离真实模型结果及限制

隔离库准备首先发现 PostgreSQL 初始化临时服务造成的就绪竞态，修正为检查 TCP 就绪后再迁移；失败两次均未调用模型。正式隔离运行使用原 Provider、模型、量化身份、预算、费用和资源设置，仅修改标题与单日窗口。实际模型调用 1 次，用量 6575 tokens、费用 0，模型身份核验通过。模型不是替身，结构化决策未经人工改写。

- 比赛 `b7107ffb-c1d7-4ad3-bd5f-cd91589ac486`，成功研究周期 `0c02115a-6425-4740-bdb7-b23eba6d1a1b`。
- 模型提交 1 股 AAPL 市价买单，数据库记录 active 委托；后续正式回放撮合形成一笔成交，价格 360.29 USD、费用 0，现金为 99,639.71 USD，持仓 1 股，结算日期 2026-11-16。
- 成交使用富途真实分钟记录，保留原始摘要与真实抓取时刻；执行状态、日历和单位为受控功能条件，成交证据明确 `historicalPitCertified=false`。
- 模型同时生成成交事件预约和 2026-11-13T14:33:00Z 时间预约；正式回放生成下一待执行研究周期 `bcac0941-59e9-4f9b-a63e-2ef054fa4769`，未为该周期调用模型。隔离临时数据库已由维护脚本清理，原比赛未写入样本委托。
- 本次模型直接提交决策，没有调用 quote 工具，摘要中“读取行情”的自述不作为工具调用证据。额外工具门禁因此失败，脚本退出 1，保留 `failure.json`；不能将本次声明为研究工具完整验收通过，也不因核心成交成功而修改门禁或覆盖失败回执。

完整私有审计在 `var/acceptance/arena-us-model-run-v3-20261114/research.json` 和 `result.json`，分别包含模型原始决策、身份、已结算用量、委托、成交、资金、持仓、下一周期及时间线。此次证据证明真实模型提交到持久化、真实历史价格撮合及后续预约的功能通路；原比赛开市实时与严格历史可交易性仍不在通过范围。

## 维护收尾

通过 infra 正式持锁入口执行 `arena-maintenance-queue.mjs resume`，复用原私有归属，返回 `deliveries_resumed`、`activeCallsCancelled=0`。原待执行周期 `b9df0fca-d2da-401f-8913-9bd92d436844` 后续独立读取为 succeeded，证明队列领取已恢复。已通知用户授权协调的 A 股回放聊天继续观察。没有保留维护暂停、取消在途调用或重复创建原周期。
