# 历史建仓时间补录 Spec

上位 Spec：[`2026-08-26-trade-execution-ledger-system.md`](2026-08-26-trade-execution-ledger-system.md)

相关子 Spec：[`Trade Projection 与收益读取模型`](2026-08-26-trade-projection-read-model.md)、[`交易与成交记录产品界面`](2026-08-26-trade-product-experience.md)

## 背景与问题

只有 `POSITION_BASELINE_OBSERVATION` 而没有历史 BUY 成交的持仓，会形成缺少明确建仓起点的 Trade。基线时间只能证明“在该时间观察到持仓”，不能证明真实买入时间；但用户可能掌握账单、券商记录或其他外部依据，能够补充一个历史建仓时间。

第一阶段需要允许用户为符合条件的 Baseline Trade 补录建仓时间，同时保留该时间是用户断言而非真实成交事实的语义。

## 目标

- 在 Trade 详情中为符合条件的记录提供“补录建仓时间”入口。
- 将补录保存为可审计的账本事实，并触发统一 Trade Projection 重建。
- 让列表和详情显示补录后的开始时间，同时明确“用户补录”来源。
- 保持原始 Baseline、成交事实、数量、成本和收益计算边界不变。

## 非目标

- 不创建虚假的 BUY_EXECUTION，不补充成交价格、数量或费用。
- 不直接编辑或覆盖物化 Trade。
- 不在本阶段支持日期级、时间范围或未知时间的建仓断言；第一阶段要求精确到分钟的时间。
- 不开放清除、作废或修改已提交断言的界面；后续修正另立任务。
- 不改变 Baseline 的观察时间，也不把服务端记录时间当作建仓时间。

## 领域边界

- `POSITION_BASELINE_OBSERVATION` 表示持仓观察事实，其 `occurredAt` 是观察时间。
- `TRADE_OPENING_BOUNDARY_ASSERTION` 表示用户对历史建仓边界的补录事实，不改变 Position 数量，也不产生现金流。
- Trade Projection 的 `openedAt` 可以采用有效的用户建仓断言作为展示边界，但必须通过 `OPENING_BOUNDARY_ASSERTION` 证据来源标识其来源。
- 只要 Trade 仍含有 Baseline Component，证据完整度仍为 `PARTIAL`，默认统计继续排除；补录时间不能把估算成本或不完整历史变成完整交易。

## 设计方案

### 可补录范围

服务端只接受同时满足以下条件的 Trade：

1. Trade 属于请求账户和当前投影模式。
2. Trade 当前没有 `openedAt`。
3. Trade 至少包含一个 Baseline Component，且请求的 `baselineFactId` 属于该 Trade。
4. Trade 不包含 Entry Leg；若用户掌握真实买入事实，应使用“录入成交”。
5. 补录时间不晚于该 Trade 的 `earliestEvidenceAt`。

不符合条件时拒绝写入并返回稳定的账本校验错误。

### 账本事件与投影

新增 `TRADE_OPENING_BOUNDARY_ASSERTION` 事件。事件包含目标 `tradeId`、`symbol` 和 `baselineFactId`，事件 envelope 的 `occurredAt` 保存用户补录的精确时间，`timePrecision` 固定为 `INSTANT`，来源为手工录入，并要求补录原因。

该事件不参与 Position、Cash 或成本来源运算。Trade Projection 在完成同一标的的生命周期重放后，根据目标 Trade 和 Baseline Component 应用断言：

- 设置 `openedAt`；
- 移除 `MISSING_OPENING_BOUNDARY`；
- 增加 `OPENING_BOUNDARY_ASSERTION` 证据来源；
- 不改变 `earliestEvidenceAt`，避免把用户断言伪装成原始证据时间。

相同来源幂等键和相同内容重复提交返回原事件；同一 Trade 已有建仓时间时拒绝再次补录。

### API 与界面

- 新增 `POST /portfolio/trades/:tradeId/opening-boundary`。
- 请求使用账户、标的、Baseline fact、精确时间、来源、操作者和原因；服务端以 URL 中的 `tradeId` 为目标，不信任客户端改变目标。
- Trade 详情在 `openedAt` 为空且满足补录条件时显示“补录建仓时间”。
- 表单使用 `datetime-local`，不预填最早证据时间；用户必须主动选择时间并填写补录依据。
- 保存成功后关闭表单、刷新 Trade 列表/详情及组合查询；失败时保留输入并展示服务端错误。
- 详情显示“用户补录”来源，仍保留“证据不完整/需复核”状态。
- 账本事件审计列表显示“建仓时间补录”，不显示内部事件枚举作为主要文案。

## 数据、状态与兼容性

- 不新增 Prisma 业务表字段；事件使用现有 `LedgerEvent` 修正/审计存储，Trade 和 Evidence Source 继续由投影物化。
- 旧事件没有新事件类型时行为不变，`openedAt` 继续允许为空。
- 新事件必须能被 Ledger effective/audit/replay 查询读取；Position 和 Cash 投影必须忽略它。
- Trade API 的 `openedAt` 保持现有 nullable 字段；`evidenceSources.kind` 增加用户建仓断言类型。

## 未决问题

### 阻塞问题

无。

### 非阻塞问题

- 日期级补录、补录断言的修正/作废以及按数量拆分的建仓断言不在第一阶段；当前实现通过精确时间和 Baseline Trade 条件限制风险。

## 验收标准

- AC1：合法的精确建仓时间补录请求通过 Schema 校验，事件带有目标 Trade、Baseline fact、来源、操作者和原因；非法时间、账户、标的或缺少原因的请求被拒绝。
- AC2：符合条件的 Baseline-only Trade 投影出补录的 `openedAt`，移除缺少建仓边界问题，保留 Baseline Component、`earliestEvidenceAt` 和 `PARTIAL` 证据完整度。
- AC3：补录事件不改变 Position 数量、Cash 投影、Entry Leg、成本分配或原始成交事实；重复幂等请求不重复写入。
- AC4：Trade 详情只在可补录状态显示入口，表单不预填历史时间，提交成功后显示用户补录时间和来源；当前已有建仓时间或含真实 Entry Leg 的 Trade 不显示入口。
- AC5：账户数据事件列表、审计查询、Trade 列表和 Trade 详情均能读取新事件或其投影结果，并保持实际/影子账户隔离。
- AC6：Schema、domain、server、api-client 和 Desktop 定向测试覆盖成功、校验失败、边界时间、重复提交和旧 Trade 兼容；类型检查、格式检查和 `git diff --check` 通过。

## 测试策略

- Schema：测试新事件、命令字段和 envelope 时间约束。
- Domain：测试 Baseline-only Trade 成功补录、时间晚于最早证据、含 Entry Leg、无目标 Baseline 和重复断言边界。
- Server：测试账户/Trade/Baseline 校验、幂等键、写入后重建和非 Position/Cash 影响。
- Desktop：测试入口可见性、表单必填、提交状态、错误保留输入和成功后的刷新。
- 回归：运行受影响包的测试、typecheck、Prettier 和 `git diff --check`；不以浏览器或旧运行时结果替代这些确定性检查。
