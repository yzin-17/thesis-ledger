# 159516 目标窗口的 Catalog revision 64 位修复

## 阻断与修复

目标 `159516.SZ`、`2026-04-30..2026-08-09` 的真实 Data V3 已返回 68 条行情，但 Server 初次准备回测时返回 `DATA_UNAVAILABLE`。在目标 Server 容器内沿 `DsaClient → MarketSeriesVersion → MarketBarWindowEvidenceV3Repository` 定位到 `catalogRevision` Zod 校验上限 `2,147,483,647`；真实 Catalog revision 超过该值，原 Prisma `Int` 和 PostgreSQL `INTEGER` 也无法精确落盘。这是冻结窗口证据的结构问题，不是行情覆盖或凭据失败。

新增 migration `20260928140000_market_window_catalog_revision_bigint`，只将 `MarketBarWindowEvidenceV3.catalogRevision` 升为 `BIGINT`；Prisma 写入前转为 `BigInt`，读取时确认正数且不超过 JavaScript 安全整数，再转回 V3 协议数字。原有 migration 未修改。Server runtime 包显式包含 `dist/src` 与 `prisma`，使发布包输入检查包含新增 migration。

## 验证与目标升级

- 定向 Repository、结构、升级计划与 SQL 测试合计 43 项通过；超过 32 位的 Catalog revision 写入、回读及身份比较通过。
- Prisma validate（一次性占位 `DATABASE_URL`）、Server typecheck/build、受影响 TS lint/格式、migration matrix 和 runtime package 输入检查通过。矩阵为 20 个 migration、68 张预期表，head 为本次 migration。
- 相邻 infra 官方 `./scripts/update.sh thesis-ledger` 以 `DEV_DATABASE_MODE=upgrade` 和精确目标确认执行。脚本先停 Server 与 Worker，保留数据备份、隔离恢复及 migration 演练通过，再对目标库事务升级并重启消费者。备份大小 3,177,499 字节，演练的恢复、升级、权限与完整性检查均成功；目标列类型为 `bigint`，`SchemaVersion` 等于新 head，Server、Worker、DSA 均 healthy。
- 相同普通回测准备请求升级前因统一行情 Reader 不可用而阻断；升级后 HTTP 201、`prepared`、`executionPreflight.ready`、诊断为空。目标库窗口证据实际写入超过 32 位的 `catalogRevision=936288043164777`，之后正式 Run 也完成冻结与执行。

本叶只证明目标保留数据结构升级和本次冻结入口修复。DSA 本轮的字段单位代码经官方 `sync-code.sh dsa` 放在现有容器可写层；容器重建仍需官方 `update.sh dsa` 更新镜像，不能把快更视为镜像发布。
