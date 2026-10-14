# 目标保数据升级与部署基线任务

状态：本次执行范围已全部完成，2026-10-05 归档；关联产品门禁仍由各原任务持有。

对应[规格](../specs/2026-10-05-target-preserve-upgrade-baseline.md)。本轮仅交付推荐顺序第一项，后续产品任务不自动执行。

## 执行边界与依赖

单一执行者持有 migration/结构门禁及目标部署；保留主仓 321 项、DSA 10 项既有 dirty，infra 初始 clean。现有升级实现和权限脚本已就绪，旧升级任务为历史证据；本次运行态必须重新验收。目标可读前不能把交接快照当作当前身份。

写集限定本配对文档、本次证据、交接索引及本次发现的升级定向测试缺口；需要修改升级合同则先更新规格。入口为 `../thesis-ledger-infra/scripts/update.sh`，显式 `DEV_DATABASE_MODE=upgrade`、精确 Compose 项目/数据库确认及禁止自动清理构建缓存。只读核验 DSA 镜像缺少当前日历/周期指标文件，最小必要目标调整为 `all`。停止点为本项验收完成，或记录真实阻塞及保留现场。

## 分阶段验证

- [x] B1 状态/结构（AC-01）：实际目标库名/owner 均为 `thesis_ledger`，旧 head `20261001120000_require_explicit_strategy_contract`，71 表；源码 28 项 migration、76 表，head `20261004140000_strategy_authoring_records`。源码链测试补齐两项新增 migration 后 26 项通过；Server 类型/build、migration matrix、runtime 输入、边界、infra 生命周期/Compose 合同通过。DSA 两个合同文件的 31 项测试通过。
- [x] B2 升级执行（AC-02）：8 项隔离检查及真实源库备份恢复通过；官方入口绑定待部署镜像重新备份演练，提交两项增量、权限及结构门禁成功；正式备份保留于 infra `.database-upgrades/run.BiB68z/`。首次构建失败发生在源库升级前，重启/缓存清理后同一入口成功，未清库。
- [x] B3 服务消费（AC-03/04）：三个账户数据库与 HTTP 语义摘要、Journal/AI 历史和配置保留；关键文件及完整结构输入与镜像匹配，五服务健康，Worker ready、无缺表/入口/依赖错误，实际应用连接角色及逐项权限通过；18 项只读 API 检查通过。
- [x] B4 部署验收（AC-05）：[最终证据](../../tasks/evidence/2026-10-05-target-preserve-upgrade-baseline.md)记录命令、输入、备份恢复、镜像/结构、保护摘要和未执行产品门禁；交接索引转向下一推荐叶，本轮停止。

## 计划预检

本地准备可执行；初始 Docker socket 不存在，宿主启动 Docker 后确认目标容器及卷均在、消费者原已停止。阶段依赖明确，既有保数据入口作为执行合同，无清库授权或需求。实际部署首次被自动审批拒绝，2026-10-05 用户在本聊天直接确认授权后执行。

## 执行经过与最终检查点

- 本地准备通过：升级定向 26 项；真实隔离 PostgreSQL 8 项，覆盖备份恢复、旧数据、权限拒绝及失败事务回滚；DSA 31 项；Server 类型/build、结构和工程门禁通过。
- 真实源库只读备份及恢复升级演练通过：备份目录 `../thesis-ledger-infra/.database-upgrades/baseline-prepare-20261005.PNoIzG/`，18,722,959 字节，SHA256 `d966f7cf7ac28012d4ac17b38eabbdaefa6c4aa8f0e7ff75eef221ce85fd0bc9`，角色 `thesis_ledger_app`；副本全部旧列摘要、权限和结构通过。`before-summary.json` 保存三个账户和全部表的升级前摘要。该只读准备未执行源库升级，正式入口仍须绑定待部署镜像重新备份演练。
- 官方命令：`DEV_DATABASE_MODE=upgrade DEV_DATABASE_CONFIRM=thesis-ledger-dev/thesis_ledger REPAIR_BUILD_CACHE_ON_NO_SPACE=false ./scripts/update.sh all`；日志 `/private/tmp/tl-preserve-upgrade-baseline-20261005.log`。镜像构建阶段因磁盘/只读文件系统失败，退出码 1，未进入消费者停止、源库事务或服务启动阶段。
- 宿主 APFS 一度仅余 138 MiB，随后恢复约 19 GiB；Docker 报 `Docker Desktop is unable to start`。用户直接授权仅重启，官方 stop/start 成功，`traffic-monitor` 恢复健康。复核源库仍为旧 head/71 表及原保护摘要。
- 用户授权“清除所有可清空的缓存”，执行范围限定未使用 BuildKit 缓存，清理 8.788 GB，虚拟盘空闲增至约 14.6 GiB；镜像、回滚镜像、业务容器和卷未删除。同一官方更新入口重试成功；日志 `/private/tmp/tl-preserve-upgrade-baseline-20261005-retry.log`。
- 额外 HTTP 语义摘要脚本首次未通过；Docker 恢复后在真实备份副本运行，修正验收脚本的对象键序与 PostgreSQL 无时区时间 UTC 解析；升级后实际 HTTP 语义完全一致，排除 instrumentDirectory，不输出业务内容。最终结果见正式批次 `protected-http-backup-comparison.json`。
- 最终结果：官方重试退出 0，目标 head/76 表、服务/角色权限、代码输入及保护摘要全部通过。阶段失败与准备为历史检查点，最终事实以[证据](../../tasks/evidence/2026-10-05-target-preserve-upgrade-baseline.md)为准。没有活跃更新/测试进程或本轮隔离容器，不启动其他产品任务或故障注入。

## 最终一致性 Review

- [x] AC-01—AC-05 各断言由 B1—B4 与最终证据覆盖；实现/隔离/目标/API 的边界分开记录。
- [x] 所有阶段满足自身完成条件，备份恢复、失败事务回滚、实际目标与应用角色均有真实证据；计划指纹与部署镜像输入绑定。
- [x] 既有业务数据、配置与 dirty 保留；可变自动化/健康表的变化单独披露，没有以 healthy 替代代码/结构/数据检查。
- [x] 当前产品运行态/内容/设备等门禁未被移除、勾选或转为 TODO；原子升级失败路径由隔离检查证明，未在目标上注入业务故障。
- [x] 三仓职责、依赖及文档检查点一致，未引入新的实现接口或扩大到其余产品任务；提交处理符合授权。

结论：本次目标保数据升级与部署基线通过。正式发布通用升级/恢复流程及其他产品门禁仍以各原 Spec/Task 为准，不由本次开发目标结果替代。推荐下一叶为行情 T3.2b2.2，随后 T3.3c、T3.2c3；本轮已停止。

归档时保留同期外部新增的 Docker 空间门禁与操作入口规则修改，未将其纳入本轮写集或验证结论；详情见本次证据的执行边界说明。当前基线验收 Spec 保持可查，完整保数据升级合同仍由原升级 Spec 持有。
