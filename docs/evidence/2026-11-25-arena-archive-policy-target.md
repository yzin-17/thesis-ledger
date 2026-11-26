# ETF 历史归档按版本有效的目标验收

## 结论

2026-11-25，R4H2a／R4H2b／R4H2c 通过。正式 DSA 更新和主仓代码同步均退出 0；原归档准入由第 2 版明确更新为第 3 版，`validUntil: null`、`admissionState: admitted`，绑定 `historical-execution-archive-v4`。正常消费者逐一读回 22 个证券日，实际目标执行读取器与受控内存账户完成买入、T+1 限制、卖出和卖款再投资。

实际范围保持 `510300.SH`、`588000.SH` 的 2026-11-02 至 2026-11-16，索引仍为 `dff009c696ce8e161268297fcf15c25ae69de72eb9ecb3aa0844cb7501cfc675`。本次没有扩大证券／日期覆盖，也没有调用模型、真实外部资格探针、比赛或新成交接口。受控账户使用明确标记的模拟报价，不将其描述为真实账户交易或真实历史价格验收。

## 授权与执行入口

用户在本轮剩余清单后要求“继续”，授权正式目标更新、保留 SQLite 升级、已有资料的新准入和正常入口验证。所有 Docker 状态变更经正式入口；PostgreSQL 业务数据只读。来源开关、凭据、路由和原维护队列归属保持；没有暂存、提交、推送、修改代理或新建 worktree／子代理。

Node 为 `/Users/yzin/.volta/tools/image/node/24.22.2/bin/node`，以下 Shell 均通过 `rtk proxy`。执行目录分别为 `/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis` 与 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`；目标私有目录为 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/arena-archive-policy-target-20261125/`。

| 执行目录与实际命令 | 结果与行为 |
| --- | --- |
| DSA：`PATH=<Node24>:$PATH bash scripts/local-deployment.sh snapshot-state`，输出到私有 `dsa-before.db` | 退出 0；只读在线复制，41,316,352 字节，副本完整性为 `ok`。 |
| infra：`PATH=<Node24>:$PATH ./scripts/update.sh dsa` | 退出 0；构建并替换 DSA，保留已有数据、日志及报告卷，服务健康。没有启用数据库重建、数据丢失、联合状态切换或镜像拉取参数。日志 `update-dsa.log`。 |
| infra：`PATH=<Node24>:$PATH ./scripts/sync-code.sh thesis-ledger` | 退出 0；兼容性预检后同步 Server／Worker 并重启，服务健康，镜像及容器身份保持。日志 `sync-thesis-ledger.log`。 |
| infra：`node scripts/infra.mjs locked --idle -- node ../thesis-ledger/scripts/local-runtime/run-arena-range-admission.mjs <私有目录>/admission apply .recovery-artifacts/arena-v6-deployment-20261117/queue-owner.json .recovery-artifacts/arena-archive-policy-target-20261125/preflight/diagnostic-before.json` | 退出 1；第 3 版已写入，随后对资格派生字段的过重比较拒绝，保留 `collection.json`、`apply-permit.json` 与失败日志，没有再次应用。 |
| 同一正式入口、相同目录／归属／基线，将 `apply` 改为 `verify` | 修正派生字段比较后退出 0；只读验证既有第 3 版，生成 `admission/verification-receipt.json`。没有增加准入版本或重新写入。 |

`diagnose` 也经上述已登记入口和正式维护锁执行，分别保存部署前、同步后及写入后的控制快照。实际暂停回执与 Redis 原归属一致；没有接管或恢复队列。

## 运行态与资料保全

DSA 原镜像 `sha256:ca7db13917ba1ed03a3694102b9a16a27d82d0c58e5681c74f48ec52e8cc162f`，新镜像 `sha256:5b2ab24cd84cbf3dab6e5158f131b6b1087ef4e7300e7e1353753de50f7aa27e`。新容器为 `8b9686a0c3196dff81b50361f28fa748bf5c2cce5b0b167e0c7eccbcbb5acd74`，状态健康。

Server／Worker 镜像均仍为 `sha256:a665f8ba0db7904398132c82cda61ee58486accceed84a802e7a0ba06d90a1e9`；容器身份分别仍为 `390afbd9878b7a4404e3ee8b33b9800b8c3db3682aa44c5271e1a99de931594e`、`7929eb56c452378f50e79a1b707f7e11b5f5a98a1f9e91d868b02461f9cecb2d`。主仓本次同步位于容器可写层，不作为镜像已更新的证据。

- 升级后、写准入前：原 12 条准入与 11 条来源配置逐字段一致，`valid_until` 已可空；两份 SQLite 副本完整性均为 `ok`。
- 最终副本：仍为 12 条准入，仅指定的一条更新，其他 11 条完全一致；11 条来源配置、策略修订 203、开关及 `routes_json` 全部保持。
- 目标行仅改变证据引用／摘要、适配器修订、有效起止、记录版本与记录时刻。原第 2 版完整保存在部署前副本和本次采证的 `previousRecord`，没有改写其过期历史。
- 60 个归档文件的内容摘要与宿主逐一一致，索引与 22 份日材料保持。服务核心 6 份 Python 文件逐字节一致；Server 和 Worker 各 9 份相关编译产物，包括历史客户端、回放读取／规则、共享 Schema 和领域撮合／费用，与宿主逐字节一致。
- 维护工具的后续修正在宿主执行，并由登记入口传入容器；没有为仅用于维护的比较修正重复构建服务镜像。

文件核对与保全结果位于 `runtime-file-hashes.json`、`archive-file-hashes.json`、`upgrade-preservation.json`、`final-preservation.json`。SQLite 副本按不可变只读方式打开，未连接目标业务库做写入。

## 正常读取与受控账户

正常 `DsaClient.historicalExecution` 返回 22 个证券日的精简上下文，与本地原文资格结果逐一相等；没有恢复完整结算、法定费或价格限制的共同前提。随后实际 `readReplayExecutionEvidence` 读取 `588000.SH`，使用采样用途，股票状态组合被明确禁止。

目标账户检查只在内存中创建受控对象，报价标记为 `controlled-archive-target-policy`；使用目标实际领域提交与撮合函数验证：一笔买入及幂等、当日不可卖、下一交易日卖出、卖款当日可用、再投资委托生效。共 2 笔受控成交，现金回到 10,000；没有创建真实比赛或写入真实订单。可卖日为 2026-11-11，买入时资金口径仍为 2026-11-10；再投资时钟在卖出成交之后。

最终通过的消费者验证回执记录 69 个 DSA 请求：46 次有效策略读取、23 次本地历史执行读取。没有模型、报价／行情采集或外部证明请求；这些请求按服务原行为记录数据调用预算。准入证据摘要为 `5ee28cd2c79ddae862b120ad057e77b0642b7fda700401ab6f3dcf24c1ecd799`。

## 原业务与队列保护

从部署前 2026-11-25 13:20:47.932 至最终验证 13:45:45.202（Asia/Shanghai），23 张原业务表的原记录摘要及模型记录保持，基线摘要为 `c78ef3ee92b1b6859e7fdd9e5b19f8a00cff53c337efa55ce1b72512dcf1d792`。既有后台估值自然追加 146 条，按原时间界限单列，不混入原记录未变断言，也不将它们描述成本次比赛操作。

研究队列一直暂停，`active: 0 / wait: 1 / paused: 0`。原一条旧待办的 ID、完整数据与 `waiting` 状态与先前收尾回执一致，原暂停归属保持；没有清理、恢复、重试或消费该待办。

## 现场修正与定向检查

首次诊断误读尚不存在的应用许可，修正为仅 `verify` 读取许可。维护工具原来固定引用 11 月 16 日暂停回执，已允许显式传入实际仍有效的 11 月 17 日回执；诊断目录可独立建立，部署前业务时刻作为显式基线延续到最终核验。

首次应用的写入已成功，其后检查把目标由 `admission_expired` 变为可用误判为政策修改。实际只有目标 `eligible`、目标 `reason` 和该路由汇总 `reason` 三个派生字段变化；其他来源及配置摘要不变。修正只在该精确能力／目标的静态政策比较中剔除这三类派生值，仍保留修订、开关、目标身份、次序、其他目标与所有配置比较。原采证与摘要没有重写，之后只用 `verify` 收敛。

定向回归补充了有真实策略投影的过期→可用维护流转，以及其他修订、开关、目标变化继续拒绝的反例。最终 DSA 5 组定向检查 104 项通过；受控跨语言时钟检查 4 项通过；新增时钟测试 ESLint 和维护包装的 `node --check` 通过。相关日志均保存在本次私有目录，没有重跑模型或全量基线套件。

维护包装原本被现有 ESLint 配置排除；强制 `--no-ignore` 时因 `.mjs` 没有类型解析配置退出 2，未完成 lint，不将此前忽略文件时的退出 0 算为通过。该脚本以语法检查、定向回归和实际目标执行验证，未为此扩大项目 lint 配置。

## 一致性审查与剩余边界

R4H2a／R4H2b／R4H2c、回放 AC23／AC24 的目标层级通过。原 Schema／DSA 全量失败与具名 V1 边界问题继续由[本地证据](2026-11-25-arena-archive-policy-local.md#全量失败的修改前对照)及其原任务持有；本次不宣称全仓或新的远端 CI 通过。

数据覆盖没有扩大；完整历史追平、同账户实时、Luna 准入及 G02／G03／G04 沿用原适用证据。新增代码未提交或推送，全部原未提交修改保留。本批归档修复的本地和目标验收均已完成。
