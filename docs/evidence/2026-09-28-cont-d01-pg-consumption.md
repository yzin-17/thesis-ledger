# D01 多窗口数据库到 Snapshot 消费闭环

## 固定输入与边界

`I01-reader-pg` 的 JSONB 位模式问题修复后，在新的显式命名、loopback/非默认端口 PostgreSQL 上应用全部 migration。测试标的是合成 `159516.SZ`，请求窗口 `2026-04-24..2026-05-20`；父响应 19 条日线 Bar，拆为两份有已观测交易日交集的子响应，保留完整响应、观测开始/完成时间和父内容指纹。实际 `MarketWindowEvidenceV3Repository` 写入并回读后，才将数据库返回响应交给 `DsaSnapshotBuilder`。这不是 HiThink 账号或远端市场事实。

## 执行结果

- 隔离 PostgreSQL 全 migration 成功；测试核对实际 database、owner 与连接用户，拒绝目标地址。新用例 1 passed，默认无显式环境时 1 skipped。
- 数据库回读父/子完整响应与写入前严格相等，`marketFrozenWindowHashV3` 为 `ca052473f874c06b4cc26f8eac37096a9acc0e4b4d8f56f70178f9a8eb062404`；Snapshot 的 `windowProtocol` 明确，证据 artifact 1 行原样包含 `multiWindowResponse`，离线重放与 manifest 一致。
- 改写数据库中的首份子观测完成时间后，`findFrozen` 拒绝原摘要失配；已发布的 Snapshot artifact 不随数据库晚到篡改变化，仍可独立重放。原本地 Snapshot 多窗口测试还覆盖缺证据、子观测改写和执行 Bar 改写的拒绝；旧单窗口/冻结 Reader 等相邻 39 项和 PIT 44 项通过。
- 临时容器仅使用已有 `postgres:17` 镜像与 tmpfs，无 volume；执行后按精确 ID 删除并确认不存在。没有访问目标数据库、真实 Provider、AI 或目标容器。

## 未关闭

本叶证明受控 fixture 的数据库与 Snapshot 消费，不能代替 D01 真实跨五年 HiThink 读取、G0-H 来源准入、`D01-runtime` 目标同步或完整 Spec AC01–AC20。DSA 官方完整离线门禁的原失败与请求重试预算不变，未以本地 PostgreSQL 测试倒填目标运行态。
