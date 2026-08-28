# Trade Projection 影子迁移与分阶段切换手册

对应文档：

- [`交易与成交记录系统`](../specs/2026-08-26-trade-execution-ledger-system.md)
- [`Trade Projection 与收益读取模型`](../specs/2026-08-26-trade-projection-read-model.md)
- [`Trade 与 Journal 统一及迁移`](../specs/2026-08-26-trade-journal-migration.md)
- [`交易与成交记录系统实施任务`](../tasks/2026-08-26-trade-execution-ledger-system.md)

## 目的与边界

本手册用于把旧 Position、Cash、Journal 候选与统一 Trade Projection 做可追溯比较，再按 Trade 查询、账户数据、投资组合、Journal 的顺序切换读取。所有比较和 shadow rebuild 都是只读或事务回滚操作；不得修改原始 `LedgerEvent` 来“配平”差异，也不得通过 `docker compose down -v` 清理数据库卷。

当前代码已删除旧 `projectCompletedTrades` 实现及重复测试 fixture。`PROJECTION_READ_MODE` 和 `PROJECTION_SWITCH_STAGE` 是发布控制面的显式状态，并由 health 响应暴露；当前构建的业务读取固定消费物化 Trade Projection。回滚到旧读取实现必须重新部署包含旧路径的已验证应用镜像，不能把当前构建伪装成 `legacy`。

## 发布前准备

1. 在目标数据库副本上生成备份和 SHA-256 校验，记录应用镜像、Git revision、迁移数量、数据库副本名称和操作者。生产数据库必须先停写或使用一致性快照。
2. 在副本上执行当前迁移链并核对迁移矩阵：

   ```text
   DATABASE_URL=<副本 owner 连接串> pnpm db:migrate
   pnpm migration:matrix
   ```

   当前工作树应通过 34 条迁移；应用使用 app role，migration 使用 owner role。迁移完成后重新执行权限 hardening，并确认 app role 不能更新或删除 `LedgerEvent`。

3. 在副本上执行确定性回归：

   ```text
   pnpm --filter @thesis-ledger/domain build
   pnpm --filter @thesis-ledger/domain test
   pnpm --filter @thesis-ledger/schemas build
   pnpm --filter @thesis-ledger/schemas test
   pnpm --filter @thesis-ledger/api-client build
   pnpm --filter @thesis-ledger/api-client test
   pnpm --filter @thesis-ledger/server typecheck
   pnpm --filter @thesis-ledger/server test
   pnpm --filter @thesis-ledger/desktop typecheck
   pnpm --filter @thesis-ledger/desktop test
   ```

## 影子重建与差异报告

### 逐账户事务回滚重建

`projection-shadow-rebuild.mjs` 对每个账户读取当前快照，在同一事务中调用核心投影重建，再读取 shadow 快照并主动回滚事务。输出中的 `rolledBack: true` 和 `sourceLedgerMutated: false` 是必要证据；`rebuildStability.gate.status` 必须全部为 `PASS`。

主机能访问副本 `DATABASE_URL` 时可直接执行：

```text
pnpm --filter @thesis-ledger/domain build
pnpm projection:shadow-rebuild -- --output /private/tmp/trade-projection-shadow.json
```

数据库只在 Compose 网络内可访问时，使用已构建的应用镜像并挂载脚本、domain 构建产物和报告目录：

```text
docker compose -f compose.yml -f compose.dev.yml run --rm --no-deps \
  -v /Users/yzin/code/thesis-ledger-workspace/thesis-ledger/scripts:/app/scripts:ro \
  -v /Users/yzin/code/thesis-ledger-workspace/thesis-ledger/packages/domain/dist:/app/packages/domain/dist:ro \
  -v /private/tmp:/app/reports \
  thesis-ledger node /app/scripts/projection-shadow-rebuild.mjs \
  --output /app/reports/trade-projection-shadow.json
```

若要限制到账户或模式，增加 `--account-id <UUID>` 或 `--mode actual|shadow`。脚本不会替换持久化投影；正式迁移前仍需在独立数据库副本上做一次提交型重建和完整性核对，开发环境的回滚演练不能替代该门禁。

### 旧结果与统一结果比较

旧快照和统一快照必须来自相同账户、相同账户模式和同一账本版本。输入格式为：

```json
{
  "generatedAt": "2026-08-28T00:00:00.000Z",
  "legacy": {
    "accountId": "<UUID>",
    "mode": "actual",
    "positions": [],
    "trades": [],
    "cash": [],
    "journal": {}
  },
  "unified": {
    "accountId": "<UUID>",
    "mode": "actual",
    "positions": [],
    "trades": [],
    "cash": [],
    "journal": {}
  }
}
```

执行差异报告：

```text
pnpm projection:shadow-diff -- \
  --input <legacy-unified.json> \
  --output <projection-diff-report.json>
```

报告必须把每条差异归为 `EXPECTED_GRAIN_CHANGE`、`EVIDENCE_GAP`、`FX_GAP`、`MIGRATION_DEFECT`、`ALGORITHM_DEFECT` 或 `UNCLASSIFIED`。`MIGRATION_DEFECT`、`ALGORITHM_DEFECT` 和 `UNCLASSIFIED` 任一非零都阻断切换；`EVIDENCE_GAP` 与 `FX_GAP` 不得被隐藏，必须进入账户级证据和后续在线 FX 门禁。

## 分阶段切换门禁

切换必须使用同一份差异报告，且按以下固定前缀顺序完成：

1. `trade-query`
2. `account-data`
3. `portfolio`
4. `journal`

示例：

```text
pnpm projection:switch-gate -- \
  --report <projection-diff-report.json> \
  --mode unified \
  --stages trade-query,account-data,portfolio,journal
```

命令返回 `allowed: true` 后，发布控制面才可以把 `PROJECTION_READ_MODE` 设为 `unified`，并把 `PROJECTION_SWITCH_STAGE` 设为最后一个已完成阶段。每个阶段都要记录 API 读取、账户/模式隔离、游标刷新和错误态证据；阶段之间不得混用旧 Journal 候选和统一 Trade 候选。

回滚只接受已验证的数据库/应用检查点，并且必须证明原始账本没有被修改：

```text
pnpm projection:switch-gate -- \
  --report <projection-diff-report.json> \
  --mode legacy \
  --rollback-checkpoint
```

如果带 `--source-ledger-mutated`，门禁必须拒绝。回滚优先回退应用镜像；迁移采用前向修复或备份恢复，不执行破坏性 down migration。

## 验收记录模板

每次副本演练至少保存以下字段：

| 项目     | 必填证据                                                  |
| -------- | --------------------------------------------------------- |
| 范围     | 数据库副本、账户数量、`actual/shadow`、账本 Revision 范围 |
| 重建     | 每账户 `rolledBack`、Position/Trade/Cash 不变量、重建耗时 |
| 差异     | 报告路径、六类计数、阻断类别、legacy 候选歧义数量         |
| 切换     | 阶段、镜像 digest、health、integrity、API/游标结果        |
| 回滚     | 检查点校验、应用版本、原始 Ledger 未修改证明              |
| 外部门禁 | 浏览器、并发写入、在线 FX、备份恢复和性能结果             |

## 当前本地证据与范围外事项

本轮已完成：34 条迁移矩阵、domain 97/97、server 290/290、schemas 94/94、api-client 10/10、desktop 102/102；本地 Compose 新镜像、migration、权限 hardening、health 和 integrity 均通过，`integrity.issueCount = 0`；两个开发账户的事务回滚 shadow rebuild 均 `rolledBack = true` 且稳定报告为 `PASS`；固定快照差异报告为全零并允许 unified 四阶段切换。

以下项目属于未来正式发布流程参考，不纳入当前任务：生产数据副本上的提交型迁移与恢复、全量性能和并发写入演练、正式发布环境浏览器响应式验收、在线 FX 完整性，以及包含旧读取路径的应用镜像回滚。本地任务不执行这些范围外状态变更。
