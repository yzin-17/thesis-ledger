# 成交现金写入准入实施任务

## 当前状态

T1–T3 完成，最终一致性复核通过。写入端现金准入已在本地 Server／Worker 生效，历史 −82 元保持正常读取；不改写旧数据。

## 依据与边界

[规格 AC1–AC6](../../specs/2026-11-05-execution-cash-admission.md)。Ledger 拥有现金与成交准入；没有 Schema／数据库／队列变化，不改写现有记录。备份及日志位于 `/tmp/thesis-ledger-execution-cash-admission-20261105/`。

## 任务清单

- [x] T1：实现同事务现金准入（AC1–AC4）
  - 输入：`execution-write-admission.ts`、`cash-projection.ts`、`LedgerCommandService` 调用与账户写锁上下文。
  - 写入：Ledger 独立现金准入 helper、原准入调用及定向测试。
  - 验证：本金／费用、刚好足额、不同币种、未来资金／待付款、替换净差额、已有负余额修复；失败不追加事实。
- [x] T2：消费面与事务闭环（AC1、AC3、AC5、AC6；依赖 T1）
  - 输入：成交及定投真实命令测试、现有基金定投隔离 PostgreSQL 维护入口、前端错误展示。
  - 写入：必要命令／资金 fixture 修正，隔离事务／定投拒绝及客户端失败恢复回归。
  - 验证：新建、更正、恢复、移入、幂等、并发串行与失败副作用；补齐成功样本的真实资金基准，不绕过新准入。
- [x] T3：构建、目标核对与收尾（AC5、AC6；依赖 T2）
  - 验证：受影响包检查、Server 构建、ESLint／边界；通过维护入口快更本地 Server／Worker，执行不修改现有用户账本的真实只读准入检查，复核原负余额展示。
  - 记录准确运行态边界与最终一致性结果，完成后归档任务。

## 最终一致性复核

全部 AC 已按[验收记录](../../reviews/2026-11-05-execution-cash-admission.md)核对。命令 35 项、三组独立 PostgreSQL 15／13／8 项、Desktop 38 项、Mobile 37 项及类型、Server 构建、边界／格式通过；Server 全量中两项未修改的迁移断言失败已单独保留。

维护入口 `../thesis-ledger-infra/scripts/sync-code.sh thesis-ledger` 同步退出码 0；只读目标事务确认两个原账户被新准入拒绝且审计事实／版本不变，真实现金仍为 −82 元。无本次范围遗留事项。未提交、推送、改写旧账本或重新打包／安装手机应用。
