# 观察存储的目标保留与恢复验收

日期：2026-10-20。对应 [研究增强 Task 的 G4a](../2026-10-18-research-evidence-evolution.md)及 [兼容恢复合同](../../specs/2026-10-18-research-evidence-evolution.md#7-兼容迁移和现有任务关系)。G4a.1～G4a.3 已通过；T13c 的实源正向消费及 G4b 用户路径保持未完成。

## 正式目标与输入

复用本日已经完成的正式保留升级：执行目录 `thesis-ledger-infra`，入口及非敏感参数如下；该命令本轮不重复执行。

```sh
DEV_DATABASE_MODE=upgrade DEV_DATABASE_CONFIRM=thesis-ledger-dev/thesis_ledger REUSE_DSA_IMAGE_ID=sha256:06b6054ba433de813e1bfc407872b4068ed9d9650946143c19dd5d3147c6f389 ./scripts/update.sh all
```

正式升级退出 0，回执为 `.database-upgrades/run.E3UOsT`。隔离演练与目标事务均成功，`structureComplete`、`appRolePermissions`、`preservedData` 均为 `true`；先前目标 Web 九页验证另见[页面恢复记录](../../reviews/2026-10-19-ui-consistency-and-density-audit.md#web-recovery-20261020)。

本次独立核对当前镜像导出的结构输入、正式回执、宿主机全部 migration SQL、`schema.prisma` 和 `raw-owned-tables.json`。输入一致，head 为 `20261019020000_research_observation_versions`：35 份 migration、83 张 SQL 表、67 个 Prisma model、16 张 raw-owned 表；预期表无缺失，app role 可读取全部表，三张观察表均有插入权限。目标 Server/Worker 使用同一镜像 `sha256:1562291459dea8079e7a3edf53ece29a9cfd7e14f38c7afad11546e314bae880`。

## 实际恢复入口

执行目录仍为 `thesis-ledger-infra`，命令退出 0：

```sh
node scripts/research-observation-retention.mjs --target thesis-ledger-dev --upgrade-receipt /Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra/.database-upgrades/run.E3UOsT --compatible-baseline current --output /Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra/.maintenance-backups/g4a-observation-20261020-2
```

先通过现有 `research-state-backup.mjs` 形成目标备份，再通过既有双读入口建立无外网、无宿主业务挂载和持久卷的自有副本。固定库名为 `restore_db`、owner 为 `restore_owner`；种子入口在任何业务写入前核对数据库身份及受控报告标记。目标数据库未被该入口写入。

副本包含六份明确标记的保存报告、五条工具审计。使用当前镜像内实际 `ResearchObservationStore` 为一个 V2 论点追加三次提交和三版资料不足结果，包含晚到的旧截止时点；没有模型或资料请求，不授予日历/经济价格的正向资格。

| 断言 | 实际结果 |
| --- | --- |
| 当前镜像读取报告、首版观察、当前投影、三版历史及关闭创建能力 | 5 次实际 HTTP/SDK 请求通过 |
| 封存非空观察并恢复 | 实际 `pg_dump` 与自有隔离库 `pg_restore --clean --single-transaction` 通过；恢复前后全部保留表摘要相等 |
| 对应镜像归档与加载 | 保存 `compatible-image.tar` 并实际 `docker image load`，镜像 ID 与恢复点一致 |
| 恢复后的兼容版本读取观察 | 再次 5 次实际 HTTP/SDK 请求通过；旧版仍可读，晚到版本没有覆盖当前投影 |
| 恢复后 V1/V2 及既有报告拒绝边界 | 20 次实际 HTTP/SDK 请求、33 项断言通过，含损坏材料、跨任务引用、模式与范围隔离 |
| 原报告、工具审计、Journal、默认、凭证及费用事实 | 追加观察前后、实际恢复前后、兼容读取前后摘要一致 |
| 目标状态与清理 | 目标七张业务保护表、V3 结果、配置及容器/暂停状态保持一致；自有隔离容器全部清理 |

实际目标的 AiRun、AiToolCall、三张观察表及两张模型调用事实表均为零；JournalReviewSnapshot 两条、ProviderConfig 三条、AiRoutingSettings 一条。副本恢复后为六份报告、五条审计、一条逻辑观察、三条观察版本和三条提交。目标空研究历史的保留与副本非空记录的恢复分开证明。

## 当前可恢复的镜像组合

原 G2a 基线的 `c1f3c9…` 镜像已不在本机，历史通过结果保留，但不将其视为当前可用的恢复版本。本次将实际通过 V1/V2 双读和观察读取的当前 `156229…` 镜像登记为兼容恢复点，并保留镜像归档、数据库备份、非空观察副本和校验和。恢复前后使用同一登记镜像；本项不证明其他历史二进制的降级回退。

私有回执根：`thesis-ledger-infra/.maintenance-backups/g4a-observation-20261020-2/`。

| 载荷 | SHA-256 |
| --- | --- |
| `report.json` | `522b90263f6f66e61d86f704b752e5dd666b5b11cd11b27abc6edbe47095d6b6` |
| `compatible-image.tar`，174,421,504 字节 | `e113e5598074e03642d39418014563b840e33debb437e53659329e4fe72af8c0` |
| `observations.dump` | `4051ba979887ad5053946169012adf5354fc2a2bc421f60ad501ed42d39566c8` |
| 验收执行输入 | `17e54c1edc8e40905f675b3a65235b49c438ccbe6702d9434ffd1dc45721a1ae` |

首轮同样通过；随后补齐“清理查询失败不能冒充资源不存在”的防护及反例，因此最终使用上述第二轮回执。两轮均复用当前镜像，未重新构建生产镜像。

## 验证边界

维护脚本的目标参数、完整迁移输入、错误数据库、资源归属、无卷/无外网、只读服务和清理失败反例均通过；与目标 Web 维护共 14 项定向测试通过。模块边界与 35 份 migration matrix 通过。

独立复核再次通过：正式备份的四份载荷校验和有效，V3 成功清单包含 57 条；目标状态同时匹配 G4a 前置快照和 Web 临时配置验收前置快照，Provider/default 摘要及镜像归档、观察副本校验和一致。自有双读容器查询结果为空。七份本次相关文档的 139 个相对链接无缺失，文件尺寸 ratchet 通过，八项存量超限未增长。

恢复脚本只在自己的隔离库执行清理恢复；不清目标库、不删除业务卷。实际 Server 使用只读 `research_reader`，副本的研究及策略执行开关均关闭；目标原暂停配置不变，新增真实模型请求为零。合成观察不关闭 T13c、G4b、G3 或 DG3，Electron 本轮不验。
