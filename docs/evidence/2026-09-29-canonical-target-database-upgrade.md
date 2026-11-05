# 当前结构的目标保数据升级

2026-09-29，经相邻 infra 官方 `./scripts/update.sh thesis-ledger`，以 `DEV_DATABASE_MODE=upgrade` 和精确目标 `thesis-ledger-dev/thesis_ledger` 执行。源码仓与 infra 仓的在途改动均保留，未重建或删除目标数据库卷。

## 失败与修复

首次准备阶段退出，Server/Worker 按脚本保持停止，备份保留在 infra `.database-upgrades/run.7IvToG`。增加不含业务数据或凭据的阶段诊断后重试，定位为隔离演练的旧数据保留校验失败：待删除的 `MarketBarSeriesCoverage` 有 6 行、`MarketBarSeriesFact` 有 1899 行，直接删表与保数据升级不兼容。该次备份保留在 `.database-upgrades/run.yy4Sj8`，源库 head 未改变。

未部署的新迁移改为先复制原行到两张 Market raw-owned 归档表，再删除运行时旧表。演练按升级前的列清单逐行核对归档表；无匹配表、缺行或列值变化均失败关闭。定向结构/计划测试 23 项、隔离 PostgreSQL 保数据升级 6 项、Server 全包 1699 项通过（81 项因环境跳过）；迁移矩阵为 23 份 SQL、68 张表、59 个 Prisma Model、9 张 raw-owned 表，运行时打包输入检查通过。

## 目标结果

最终官方更新成功，备份、演练记录与执行证据在 infra `.database-upgrades/run.1U7GpD`。演练记录显示源 head `20260928140000_market_window_catalog_revision_bigint`、目标 head `20260929221000_ledger_envelope_version`，结构、应用角色权限和旧列数据保留校验均通过；源库事务执行后，官方结构门禁通过。独立只读查询再次确认目标 head、归档行数 1899/6、两张运行时旧表不存在，以及 `LedgerEvent` 中空信封版本行数为 0。Server 和 Worker 均健康，镜像 ID 同为 `sha256:e4b929a4f69e3b97c4e69e9d9b41675cb14a540826524de816002b956e42d854`，Worker 报告 ready。

目标 HTTP：`GET /api/v1/backtests/runs` 返回 200 且当前列表为空；数据库有 35 条旧模式 Run，抽取其中一条详情返回 409；旧 `GET /api/v1/backtests/jobs` 和旧 `/api/v2/market/510300.SH/quote` 均返回 404。`LedgerEvent` 目前无实际行，因此目标新旧事件读写还没有纵向证据。上述观察只证明结构、健康和这些拒绝边界；新 Run 创建到终态、真实来源、完整 DSA 同源及客户端验收仍归 D02、E03-d、E01-N4 和多来源业务门禁。
