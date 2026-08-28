# 交易账本写入与修正协议子 Spec

上位 Spec：[`2026-08-26-trade-execution-ledger-system.md`](2026-08-26-trade-execution-ledger-system.md)

## 背景与问题

现有 LedgerEvent 使用宽表可空字段，`correctionOf` 只保存弱引用且没有统一生效语义。历史补录、并发卖出、网络重试和跨账户更正都可能让不同投影读取到不一致事实。

本子 Spec 已由当前 V2 Ledger 实现采用；旧版 Position Entry 文档中的 `Adjustment` 仅作为历史背景，不是当前写入协议。

## 目标

- 定义不可变、可版本化、可审计的统一账本信封。
- 为成交、观察、公司行动和对账提供严格的类型化载荷。
- 统一幂等、经济顺序、修正链、账户版本和事务边界。
- 支持按旧 Ledger Revision 重放当时的有效事实。

## 非目标

- 定义 Trade 成本和生命周期算法。
- 定义订单、撤单或待确认成交状态。
- 长期兼容旧宽表载荷或旧 `correctionOf`。

## 现状与约束

- 账本资产键继续使用 `Asset.symbol`。
- 一个账户的 Position、Trade 和 Cash 必须基于同一有效事件集合。
- 业务服务不得更新或删除既有 LedgerEvent。
- 只有受控数据库迁移可以改变历史载荷版本。

## 设计方案

### 统一事件信封

领域契约采用以下结构：

```ts
interface LedgerEventEnvelope<TType extends LedgerEventType, TPayload> {
  eventId: string;
  factId: string;
  accountId: string;
  ledgerRevision: string;
  type: TType;
  occurredAt: string | null;
  timePrecision: 'INSTANT' | 'DATE' | 'UNKNOWN';
  sourceTimezone: string;
  economicOrderKey: string;
  recordedAt: string;
  payloadVersion: number;
  payload: TPayload;
  source: {
    category: 'MANUAL' | 'IMPORT' | 'INTEGRATION' | 'MIGRATION';
    channel: string;
    externalId?: string;
    draftId?: string;
    sourceRowId?: string;
  };
  actorId: string;
  revisionAction: 'CREATE' | 'REPLACE' | 'VOID' | 'RESTORE';
  supersedesEventId?: string;
  reason?: string;
}
```

- `eventId` 标识一次不可变追加记录。
- `factId` 标识稳定经济事实；同一修正链共享该值。
- `ledgerRevision` 是账户级单调递增整数，API 使用字符串传输。
- 排序使用 `occurredAt → economicOrderKey → eventId`。
- `DATE` 精度不展示伪造时分秒，仍须使用明确排序键处理同日顺序。
- 来源业务时间完全未知时允许 `occurredAt: null`，必须使用 `UNKNOWN` 精度；排序只依赖 `economicOrderKey` 和 `eventId`，不得用服务端写入时间代替。
- payload 的常用账户、资产、事件类型和时间字段在数据库中冗余索引，并由写入服务校验与 payload 一致。

### 类型化载荷

第一阶段至少定义：

- `BUY_EXECUTION`、`SELL_EXECUTION`。
- `POSITION_BASELINE_OBSERVATION`、`CASH_BALANCE_OBSERVATION`。
- `BASELINE_RECONCILIATION`。
- `BONUS_SHARE`、`SPLIT`、`MERGE`、`DIVIDEND`。
- 修正动作复用信封，不引入伪造的反向成交载荷。

BUY/SELL 必须包含已确认 `Asset.symbol`、正数量、正价格、成交币种、成交时间、可选结算时间和费用明细。费用明细包含类别、十进制金额、币种和可选说明。

### 写入命令与幂等

- 普通产品表单调用专用成交命令，不能提交任意 LedgerEvent。
- 幂等键为 `accountId + source.channel + source.externalId`；手工命令由客户端生成稳定命令 ID 作为 externalId。
- 相同幂等键且 payload 完全相同：返回原响应，`idempotentReplay=true`，不增加 Ledger Revision。
- 相同幂等键但 payload 不同：返回内容冲突，不自动覆盖。
- 状态型命令必须携带 `expectedLedgerRevision`；版本不匹配返回冲突并要求刷新。

### 修正链

- `REPLACE` 必须引用当前链末端，并提供完整替代 payload。
- `VOID` 必须引用当前有效链末端；解析后该 `factId` 没有有效版本。
- `RESTORE` 必须引用 VOID 链末端，并提供恢复后的完整 payload。
- 任何并列分支、跳过链末端或修正其他账户事实的请求均拒绝。
- 更正账户使用跨账户协调命令：按稳定账户 ID 顺序锁定两个账户，在原账户 VOID、目标账户 CREATE，并原子提交。
- 更正资产可留在同一账户，但必须同时重建旧、新两个资产投影。

### 并发与事务

- 每个账户维护单独 Revision Row；账本命令先锁定账户 Revision Row。
- 同账户命令串行，不同账户可并行。
- 一次成功命令必须原子提交 LedgerEvent、账户 Ledger Revision、Position、原币 Trade、各币种 Cash、待结算项和 Projection Generation。
- 证据不完整是可提交状态；超额卖出、无效修正链和载荷结构错误是事务失败。

### 不可变性与历史读取

- 业务数据库角色撤销 LedgerEvent 的 UPDATE/DELETE 权限，服务层不提供相应操作。
- 正常查询先解析每个 `factId` 在目标 Revision 下的链末端，排除已 VOID 的事实。
- 审计读取允许传入 `asOfRevision`，只读取不晚于该 Revision 的版本。
- 当前物化投影只保存最新结果；历史投影按 Revision 即时重放相关资产。

## 对外行为或接口变化

- 新增专用成交创建、替代、作废、恢复和跨账户更正命令。
- 有效事件列表默认只返回当前有效事实；审计详情返回完整版本链。
- 所有命令响应返回 Ledger Revision、Projection Generation、受影响资产和幂等重放标识。
- 公共金额与 Revision 使用字符串，避免 JavaScript 浮点和大整数精度损失。

## 数据、状态或兼容性影响

- 旧 `correctionOf` 在新字段回填完成后由独立收缩 migration 删除，不导出快照，也不迁入 metadata。
- 旧 `ADJUSTMENT` 按 `metadata.kind` 迁移为专用载荷；未知类型阻断迁移。
- 旧事件没有来源精度或来源时区时，迁移保留 `UNKNOWN` 标记，不填充 `capturedAt`，也不把 `UTC` 作为来源时区。
- payload 升级通过离线数据库迁移统一到当前版本，运行时不读取旧 payloadVersion。

### 旧事件迁移映射

| 旧类型 | 新类型 | 映射规则 |
| --- | --- | --- |
| `BUY` / `SELL` | `BUY_EXECUTION` / `SELL_EXECUTION` | 保留数量、价格和币种；`fee` / `tax` 转为费用明细；非正数数量或价格阻断迁移。 |
| `BONUS` | `BONUS_SHARE` | `quantity` 保留为送股数量。 |
| `SPLIT` | `SPLIT` | 旧 `quantity` 倍率映射为 `fromUnits=1`、`toUnits=quantity`。 |
| `MERGE` | `MERGE` | 旧 `quantity` 倍率映射为 `fromUnits=quantity`、`toUnits=1`。 |
| `DIVIDEND` | `DIVIDEND` | 保留金额与币种。 |
| `CASH_DEPOSIT` / `CASH_WITHDRAW` / `TRANSFER_IN` / `TRANSFER_OUT` / `INTEREST` / `FEE` / `TAX` | `CASH_FLOW` | 转为明确流入/流出与业务类别，保留金额和币种；这里的 `TRANSFER` 仅指现金划转，不支持证券转入转出。 |
| `ADJUSTMENT` + `opening-balance` / `position-balance` / `rollback` | `POSITION_BASELINE_OBSERVATION` | 每条旧事件形成 `PARTIAL` 检查点，批次 ID 稳定派生自旧事件 ID，成本费用口径标记为 `UNKNOWN`。 |
| `ADJUSTMENT` + `cash-balance` | `CASH_BALANCE_OBSERVATION` | 保留币种和观察金额，批次 ID 稳定派生自旧事件 ID。 |

迁移使用旧事件 ID 作为初始 `eventId` 与 `factId`，按账户内 `occurredAt → createdAt → id` 确定初始 Ledger Revision 和经济排序键。旧 `source`、`externalId`、`note` 迁入新来源与载荷字段；旧宽表字段在核对通过后删除。任何未列出类型、未知 `metadata.kind`、缺失必需值或非法数值都必须在修改数据前阻断迁移。

## 风险与备选方案

- 账户级串行化会限制单账户写入吞吐，但符合当前产品规模并简化强一致边界。
- JSONB 的数据库类型约束弱于明细表；使用共享 Schema、数据库 CHECK 和索引列一致性测试补足。
- 独立收缩 migration 删除旧 `correctionOf` 会失去弱关联线索，这是已确认迁移选择。

## 未决问题

无。

## 验收标准

1. 业务角色无法更新或删除 LedgerEvent。
2. 同一幂等命令重放不新增事件或 Revision，内容冲突不静默覆盖。
3. REPLACE、VOID、RESTORE 只能形成唯一单链。
4. 同账户并发卖出不会合计超过有效持仓。
5. 状态型命令拒绝陈旧 `expectedLedgerRevision`。
6. 相同有效事件集合始终得到相同经济顺序。
7. 账本与三个核心投影、Revision、Generation 原子提交或原子回滚。
8. 可按旧 Ledger Revision 重放当时的有效事实。
