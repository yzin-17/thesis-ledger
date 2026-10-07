# 数据库结构测试矩阵

当前结构由主仓活动 migration 目录内按名称排序的全部 SQL 共同定义，包括初始基线和后续增量；不能只执行初始基线或以 `prisma db push` 替代。结构 head 从实际输入派生，预期表包含 Prisma model 和 `raw-owned-tables.json` 登记项。

| 起点 | 执行路径 | 目标与检查 | 验收边界 |
| --- | --- | --- | --- |
| 空的隔离数据库 | 顺序执行全部活动 migration，并初始化应用角色权限 | SQL执行成功、预期表完整、权限和SchemaVersion一致；执行受影响业务回归 | 只证明隔离结构，不替代目标Server/Worker |
| 已有开发数据库，marker或结构不匹配 | 默认只检查并阻断应用；不隐式修改或清库 | 实际head、缺表、应用日志、消费者状态 | 保留数据，明确诊断缺口 |
| 明确允许丢弃数据的开发目标 | 项目显式开发重建入口；核对环境、丢弃开关、数据库名与owner并停止全部消费者 | 仅重建目标public schema；执行全部SQL、权限初始化、完整性与head检查后重启消费者 | 需精确目标确认；不得删除Docker volumes，也不是正式升级能力 |
| 需要保留数据的正式发布目标 | 另行准备备份、隔离副本迁移、兼容发布与失败恢复 | 保留数据升级及回滚演练 | 不由开发重建或静态matrix结果替代 |

## 自动检查

- `pnpm migration:matrix` 检查活动目录命名、SQL输入和模型/raw-owned表覆盖。
- `node scripts/check-runtime-database-input.mjs` 检查运行时打包完整迁移、Schema与raw-owned清单。
- `apps/server/test/platform/database-structure.test.ts` 校验自动head、表清单、事务包装及开发重建限制。
- 修改Schema后，显式提供一次性占位 `DATABASE_URL` 执行 `prisma validate`，并单独检查Schema diff；不格式化无关字段，不修改历史migration。

## 当前新增验收项

`20260928140000_market_window_catalog_revision_bigint` 保留数据地将 `MarketBarWindowEvidenceV3.catalogRevision` 从 `INTEGER` 扩为 `BIGINT`。DSA Catalog revision 可超过 32 位，但仍须落在 JavaScript 安全整数范围内；Server 写入前精确转换为 Prisma `BigInt`，读回时验证安全范围再返回协议数字。隔离 PostgreSQL 须验证旧行保留与大于 32 位的新值可往返；目标运行态需核对实际列类型、Schema head、Server/Worker 和真实 159516 窗口冻结。

`20260927090000_market_derived_series_snapshot` 新建独立派生输入表，保留完整快照、算法版本和输入指纹；数据库检查列与 JSON 身份一致，应用读取须重算完整内容。同指纹只能同内容幂等，冲突不覆盖。该增量不修改原生窗口数据；隔离 PostgreSQL 和目标运行态验证分别记录，未执行前保持未通过。

`20260926090000_market_window_frozen_response` 仅为Market逐窗证据增加可空完整响应及JSON形状约束。旧记录保留空值，不从元数据推导历史Bars。应用需验证请求/响应、来源、窗口、覆盖及seriesVersion关联；同一身份只能原子填充空载荷，已有载荷不可覆盖。

该变更的本地、隔离PostgreSQL和目标运行态结果分别记录在[多来源复权回测Task](../tasks/2026-09-25-multi-source-adjustment-aware-backtest.md)。尚未执行的环境检查不得列为通过。正式发布的保留数据升级流程仍需独立完成。
