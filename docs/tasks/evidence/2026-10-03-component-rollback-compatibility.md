# 组件回退相容性核验

本轮复用已有内容寻址镜像，不构建新镜像，也不切换目标容器。源库没有活动回测；以 PostgreSQL 一致性 dump、DSA SQLite 在线备份、完整数据目录及冻结制品创建隔离副本。每个候选使用 internal 网络和独立卷，结束后清理。

| 组合 | 镜像身份 | 通过范围 | 拒绝原因 |
| --- | --- | --- | --- |
| 旧 Server/Worker + 当前 DSA | Server `ed7f1174ba5e6d2bfe944cc4aa7166afe2c2c435feaffaf56e9651866c9896a3`；DSA `de21d3fc8ae44c9a15c5f35abc97de74569ccd614aa33b5a3b542faa8fb6b351` | 五服务健康、V3 协议及鉴权、完整目录/策略、账户、四条已有 Run 读取 | 实际冻结重放的结果校验值不一致。增加诊断后仅复核该候选一次；读取成功不能替代重放相容性。 |
| 当前 Server/Worker + 旧 DSA | Server `f9738d362de75b1adf4de91160ac44c630a2243a27ea2054b268bc5a0db18811`；DSA `6a7252651a631bc15dfc6824468f8485cee181ad7827c87935b77ace2215d725` | 五服务健康、V3 协议及鉴权 | 目录 revision 从 `4071195993804590` 变为 `4380298194303938`；entries 的 state、RouteKey 与目标字段改变。未继续业务重放。 |

两候选均不取得当前状态回退资格；不得以健康或旧版本结果读取成功标记原 F01 完成。源业务摘要、目录与策略身份前后不变，隔离资源残留为 0。

执行日志：`/private/tmp/thesis-ledger-component-restore-20261003.log`、`/private/tmp/thesis-ledger-component-server-diagnostic-20261003.log`。完整入口与本地恢复制品续验见[剩余验收 Task](../2026-10-03-multi-source-remaining-acceptance.md)。
