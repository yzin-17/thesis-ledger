# Ledger 当前信封与持久格式门禁

`LedgerEvent.payloadVersion` 只表示经济 payload 结构。Prisma Schema 与新增 `20260929221000_ledger_envelope_version` migration 加入可空 `envelopeVersion`；SQL 仅允许空值或当前值 `3`。历史 migration 未改，既有行保留空值。当前事件信封的 `version` 已切为 `3`，Schemas 与 Domain、Server 事件构造和 Desktop 划转链判断同步；旧 `version=2` 输入在 Schema 层拒绝。

Repository 新写入显式设置 `envelopeVersion=3`。账户写入在获取账本状态锁后、执行命令前查询空标记旧行并拒绝；有效事件读取在 `factId` 过滤前检查旧标记，避免无 `factId` 旧行被隐藏；审计、现金与核心投影也在解释经济事件前拒绝空标记。API Client 共用的审计响应删除 V1 事件联合解析，Desktop 审计页只处理当前事件。`payloadVersion=1` 保持原经济含义。仓储测试覆盖旧行读取拒绝、写入操作和状态均不推进；Schema 测试覆盖旧信封及旧审计响应拒绝。旧事件没有回填或隐式转换。

本地验证：Prisma Schema validate 与 Client 生成通过；当前 migration matrix 为 23 份 SQL、68 张 SQL 表、59 个 Prisma Model、9 张 raw-owned 表，动态 head 为本 migration；runtime package 输入检查通过；数据库结构/升级计划定向 2 文件 23 项通过。Schema 包级 546 项、Domain 包级 313 项、Server Ledger 定向 91 项、Server 全包 1699 项通过且 81 项跳过、Desktop 包级 509 项、API Client 36 项通过；Server/Desktop/API Client 类型检查与构建、目标文件 ESLint/Prettier 和模块边界检查通过。Server 全包首轮有一处迁移夹具缺标记及一处并行超时，夹具修正后串行复跑通过。

审计响应收紧后的 Schemas 定向 54 项、API Client 包级 36 项、Desktop 现金定向 15 项通过；无 `factId` 旧行负例加入后 Repository 定向 11 项通过。2026-09-30 新建完全独立的 `ledger_envelope_fixture` PostgreSQL，按当前 23 份 migration 建库；`ledger-envelope-postgres.integration.test.ts` 2 项通过：空信封旧行读取和锁内写入均返回 `UNSUPPORTED_CONTRACT_VERSION`，回调未执行、账户版本与行数不变；另一账户的当前事件以 `envelopeVersion=3`、`payloadVersion=1` 原子写入并读回。临时容器已停止。目标库通过[官方保数据升级](2026-09-29-canonical-target-database-upgrade.md)到当前 head，但 `LedgerEvent` 现有行数为 0，因此目标新旧事件、浏览器/Electron 与其他消费者纵向闭环仍未验收。E03-a 的隔离结构、原子写入和旧行拒绝门禁完成；E03-b 至 E03-d 与父项保持开放。
