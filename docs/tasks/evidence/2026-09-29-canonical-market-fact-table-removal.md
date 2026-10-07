# 停用行情事实表的结构收敛

> 2026-09-29。源码、打包输入与隔离 PostgreSQL 验证通过；目标数据库和应用容器仍需独立验收。

## 变更

- `MarketBarSeriesFact`、`MarketBarSeriesCoverage` 已无 Server 读写调用，现从 Prisma Schema 移除。新增 `20260929114800_drop_market_bar_series_v2`，在同一事务中先将原有行复制到 `MarketBarSeriesFactArchive`、`MarketBarSeriesCoverageArchive`，再删除运行时旧表；历史 migration 保持原样。归档表登记为 Market 所有的 raw-owned 表，运行时不读取或写入。
- 行情清理清单不再查询或删除这两张表，也移除旧 BarSeries 和熔断缓存前缀。当前指标缓存前缀继续保留，因为图表指标仍使用它。
- 结构测试核对新 head、68 张预期表、归档复制与删表 SQL；保留数据升级计划测试包含新迁移。结构执行器、迁移矩阵和运行时打包检查均从实际 migration 输入派生 head。

## 验证

- 定向结构、升级计划与清理测试：27 项通过。首次误用包级 `test -- <paths>` 触发全包，只有升级计划固定清单的 1 项失败；更新该清单后定向通过，再运行全包 1686 项通过、81 项跳过。
- `prisma validate`（一次性占位 `DATABASE_URL`）、`db:generate`、Server typecheck/build、`git diff --check` 均通过。Schema diff 仅涉及两张旧表删除及此前新增的当前证据/派生快照模型，没有格式化扩散。
- 当前 `check-migration-matrix.mjs`：23 个 migration、68 张 SQL 表、59 个 Prisma Model、9 张 raw-owned 表，head 为 `20260929221000_ledger_envelope_version`。
- `check-runtime-database-input.mjs` 在归档调整后通过，23 份 migration SQL 与打包执行器一致。
- 先前官方隔离重建脚本在归档调整前验证过 66 张表；该结果不适用于当前 68 表输入。归档调整后，定向结构与升级计划 23 项、隔离 PostgreSQL 保数据升级 6 项通过；实际带行目标库演练仍由官方 `update.sh` 执行。临时测试容器已停止。

## 保数据升级发现

目标库旧行情缓存实际有 `MarketBarSeriesCoverage` 6 行、`MarketBarSeriesFact` 1899 行。首次官方升级演练在旧列保留校验拒绝了直接删表，源库事务未执行，Server/Worker 保持停止。调整迁移后，隔离演练按原表名逐列核对归档表中的数据摘要；缺表、缺行或字段变化均拒绝。准备入口的失败日志只输出阶段名，不输出业务行或凭据。

## 剩余门禁

目标数据库结构 head、实际 Server/Worker/DSA、旧数据拒绝、客户端和真实来源尚未验收。正式部署须在源码与启动入口稳定后，经相邻 infra 的官方 `update.sh` 选择受影响目标执行；不可把本次隔离重建当作目标或正式保留数据升级。C01/C03/E02/D01/D02/D03 及多来源 M1/M2/M3、AC01–AC20 均保持未完成。
