# 投资组合快照系统 V2 Spec

- 状态：已批准，实施中
- 类型：增量设计
- 对应任务：[`../tasks/2026-08-28-portfolio-snapshot-system.md`](../tasks/2026-08-28-portfolio-snapshot-system.md)
- 关联现状：[`2026-09-07-automatic-snapshot-entry.md`](2026-09-07-automatic-snapshot-entry.md)、[`2026-09-07-portfolio-aggregate-snapshot.md`](2026-09-07-portfolio-aggregate-snapshot.md)
- 下游读模型：[`2026-09-07-portfolio-valuation-series.md`](2026-09-07-portfolio-valuation-series.md)

## 背景与问题

当前 `PortfolioSnapshot` 只保存账户、采集时间和三个汇总金额。快照可由旧公开接口和 `snapshot` 自动化直接写入，缺少来源、逻辑估值日、估算/正式版本、数据质量、幂等和修订关系。收益走势图又把返回的每条记录直接画成一个点，导致交易、导入和定时任务在短时间产生的审计快照全部成为可见打点。

产品已经取消公开手动快照：业务页面不提供创建入口，服务端也不再提供面向用户的快照创建命令。用户通过自动化中心查看、配置和立即执行系统估值任务。

## 目标

1. 建立不可变、可追溯、可幂等创建的 Snapshot V2。
2. 区分逻辑估值槽位、估算版本和正式版本，正式数据不原地覆盖估算记录。
3. 统一日终、交易后、导入后和系统维护来源，不恢复手动来源。
4. 保存单币种、多币种、行情、基金净值、汇率和覆盖率证据。
5. 让默认查询只返回每个逻辑槽位的当前有效版本，详情能够查看完整修订链。
6. 将三个系统估值任务展示在自动化中心，并保留运行记录、失败原因和立即运行能力。
7. 为独立的组合估值走势读模型提供稳定快照接口，事件快照不直接污染周期打点。

## 非目标

- Snapshot 本身不作为分钟级时序数据库；分钟和小时数据由组合估值走势读模型持久化。
- 不恢复 Portfolio 或收益分析页面的手动创建入口。
- 不提供公开 `POST /performance/snapshots`。
- 不把独立现金账户计入投资组合；只计算投资账户内现金。
- 不在本设计中迁移 Risk、AI、Report 或 Backtest 为 Snapshot 消费者。
- 不为现有外部数据库卷建立增量升级链；数据库继续遵循 fresh baseline 和显式备份/重建策略。

## 现状与约束

- `PortfolioSnapshot.capturedAt` 是旧 API 的时间字段，V2 以 `snapshotAt` 表示业务估值时点，以 `valuationDate` 表示逻辑估值日。
- `actual` 与 `shadow` 仍是账户模式；Portfolio 只聚合相同模式的启用投资账户。
- 单条 Snapshot 必须不可变。修正通过追加 revision 和替代关系完成。
- 行情、基金 NAV 和 FX 可能部分缺失。可用金额不得因单一标的缺失而全部丢弃，但必须暴露质量状态。
- 自动化立即运行是对既有系统任务的显式执行，沿用任务来源和确定性幂等键，不等价于手动快照。
- `CN/HK/US` 交易日历当前静态覆盖 2025–2026；未覆盖年份必须保守判定为不可用并跳过自动盘中采样，不能退化为仅按工作日猜测开市。

## 设计方案

### 1. 身份、来源与修订

```ts
type SnapshotScope = 'account' | 'portfolio';
type SnapshotMode = 'actual' | 'shadow';
type SnapshotSource = 'DAILY_CLOSE' | 'TRANSACTION' | 'IMPORT' | 'SYSTEM';
type SnapshotValuationBasis = 'ESTIMATED' | 'OFFICIAL';
type SnapshotStatus = 'VALID' | 'INVALID';
type SnapshotValuationStatus = 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE';
```

每个 `scope + accountId + mode + valuationDate` 构成逻辑估值槽位。`accountId` 只在 account scope 必填；portfolio scope 必须为空。

每个槽位包含一个或多个不可变 revision：

- `revision` 从 1 递增；
- `supersedesSnapshotId` 指向同一槽位的直接前一版本；
- `valuationBasis=ESTIMATED` 表示使用盘后估算值；
- `valuationBasis=OFFICIAL` 表示正式收盘价、NAV 与汇率证据已经满足本次口径；
- 默认列表只返回没有被后续有效记录替代的当前版本；
- 详情接口返回指定记录和按 revision 排序的完整修订链；
- 记录失效后，默认查询回退到同槽位最近一个仍有效版本。

`TRANSACTION` 和 `IMPORT` 可以创建事件时点审计快照，但它们不占用 `DAILY_CLOSE` 的逻辑估值槽位，也不直接成为日/周/月/年走势的周期点。

### 2. 数据模型

Snapshot V2 至少保存：

- `scope`、`accountId`、`mode`；
- `snapshotAt`、`valuationDate`、`createdAt`；
- `source`、`sourceRef`；
- `valuationBasis`、`revision`、`supersedesSnapshotId`；
- `status`、`valuationStatus`、`invalidatedAt`、`invalidatedReason`；
- `marketValue`、`costValue`、`cashValue`、`totalValue`、`baseCurrency`；
- `disclosureCoverage`、`pricedCoverage`；
- 全局唯一 `idempotencyKey`；
- `payloadVersion=2` 和冻结的 `payload`。

金额继续使用 Decimal；HTTP 层返回十进制字符串。覆盖率范围为 0 到 1。`totalValue` 在任何币种无法安全合并时可为空，原币金额仍保存在 payload。

数据库约束保证 account/portfolio 与 `accountId` 的组合合法、`revision > 0`、覆盖率位于 0 到 1、`supersedesSnapshotId` 唯一、同一槽位 revision 唯一且幂等键唯一。

### 3. 冻结 payload 与证据

`SnapshotPayloadV2` 保存账户、持仓、投资账户内现金、原币汇总、行情/NAV/FX Provider、证据版本、缺价标的、基金披露覆盖率、可定价覆盖率和数据质量问题。payload 是创建时事实，不随后续行情或 Provider 状态变化。

估算基金净值必须标明 `ESTIMATED`，正式 NAV 必须标明 `OFFICIAL`。正式版本通过替代链追加，不修改估算版 payload。

### 4. 幂等与并发

```text
DAILY_CLOSE estimate: daily-close:{scope}:{scopeId}:{mode}:{valuationDate}:estimated
DAILY_CLOSE official: daily-close:{scope}:{scopeId}:{mode}:{valuationDate}:official:{evidenceVersion}
TRANSACTION:          transaction:{ledgerEventId}
IMPORT:               import:{draftId}:{revision}
SYSTEM:               system:{operation}:{stableBusinessKey}
```

同一幂等键并发请求只保留一条。创建 revision 时在事务内读取逻辑槽位并计算下一个 revision，唯一约束作为最终竞争保护。相同正式证据重复校准返回已存在记录；Provider 更正导致证据版本变化时可追加新的 OFFICIAL revision。

### 5. 自动化任务

| systemKey | 名称 | 默认计划 | 行为 |
| --- | --- | --- | --- |
| `valuation-intraday-sample` | 盘中估值采样 | `* * * * *` | 按账户持仓市场识别交易时段，仅为至少一个持仓市场正在交易的账户写入基础估值点 |
| `snapshot-close-estimate` | 盘后估值预估 | `0 16 * * 1-5` | 对当日启用的 actual 投资账户及组合创建 ESTIMATED 版本 |
| `snapshot-official-reconcile` | 正式净值校准 | `30 6 * * *` | 扫描尚无正式版本的槽位并追加 OFFICIAL 版本 |

时区默认 `Asia/Shanghai`。盘中任务每天触发，由市场门禁过滤实际执行，以覆盖美股周五交易时段对应的上海周六凌晨；仍使用旧默认 `* * * * 1-5` 且时区为 `Asia/Shanghai` 的既有受管任务自动迁移到新默认，其他用户自定义计划保持不变。受管任务在自动化中心可见，可启停、调整 cron、查看运行历史和立即运行，但不能改变类型或删除。系统以 `systemKey` 幂等 provision，不能因重启重复创建。

盘中任务按 `Asset.market` 识别账户实际持仓市场：`CN`、`SH`、`SZ`、`BJ`、`OF` 归入 `CN`，`HK` 与 `US` 分别归入港股和美股，`CASH` 与无法识别的市场不构成盘中采样资格。各市场使用自身交易日历、市场时区和常规交易时段；美股时段必须按 `America/New_York` 处理夏令时。账户存在多个市场持仓时，只要其中至少一个市场正在交易即可采样；纯现金账户或全部持仓市场均关闭时不写点。整批没有符合条件的账户时，调度器只推进 `nextRunAt`，不创建成功运行历史。

自动调度执行上述市场门禁；立即运行继续绕过计划和市场时段门禁，但仍执行领域幂等和数据质量检查。校准任务按最旧优先、每次最多 100 个未完成槽位处理，迟到 NAV 由后续运行继续补齐。

### 6. 查询接口

- 删除公开 `POST /performance/snapshots`。
- `GET /performance/snapshots` 支持 scope、accountId、mode、source、basis、status、时间范围和游标，默认只返回当前有效版本。
- `GET /performance/snapshots/:id` 返回冻结详情和 revision 链。
- `/performance/history` 与 `/performance/summary` 在迁移期继续提供兼容字段，但只消费当前有效日终槽位，不包含交易/导入事件快照。

## 数据、状态与兼容性影响

- fresh baseline 直接创建 V2 表结构和约束；不新增针对旧外部卷的自动升级脚本。
- `capturedAt` 只保留在旧接口适配层；V2 领域与新 API 使用 `snapshotAt`。
- 当前 `snapshot` 自动化记录被受管任务替代；新安装由 baseline provision，运行时以 `systemKey` 修复缺失任务。
- 当前已完成的组合聚合与自动入口工作是现状基线，不代表 V2 任务已经完成。

## 测试策略

- Prisma 与数据库约束测试覆盖 scope、revision、覆盖率、幂等和替代链。
- Snapshot Service 集成测试覆盖并发、部分估值、正式替代估算、正式证据更正和失效回退。
- API 测试证明公开创建接口不存在，默认列表不返回旧 revision 和事件快照。
- Automation 测试证明三个受管任务可见、幂等 provision、可立即运行、正确写入运行历史；盘中采样覆盖 A 股午休和盘后、港股午休与半日市、美股夏令时和提前收市、混合市场账户、纯现金账户及没有开放持仓市场时不创建运行历史。
- Performance 回归测试证明同一估值日只产生一个走势点。

## 风险与备选方案

- 原地覆盖会破坏审计性，已否决。
- 把分钟点全部写入 Snapshot 会混淆审计事实与时序读模型，已否决。
- 正式 NAV 可能长期迟到；系统保留估算版并暴露状态，不伪造正式完成。
- 交易所节假日、半日市和提前收市安排可能调整；静态日历需按年度同步交易所公告，未覆盖年份采用 fail-closed，避免在未知时段写入估值点。

## 未决问题

### Blocking

无。

### Non-blocking

无。

## 验收标准

- AC1：系统不存在公开手动快照入口、创建 API 或 `MANUAL` 来源。
- AC2：Snapshot 能表达 account/portfolio、actual/shadow、逻辑估值槽位、不可变 revision 和替代链。
- AC3：相同幂等键或相同正式证据的并发请求只生成一条记录。
- AC4：正式版本替代估算版本后，默认查询只返回正式版本，详情仍能查看完整修订链。
- AC5：部分行情、NAV 或 FX 缺失时保留可用金额，并返回覆盖率与稳定质量状态。
- AC6：三个受管估值任务在自动化中心可见、可运行、可追溯且不会重复 provision。
- AC7：日终查询不包含 TRANSACTION/IMPORT 事件快照，同一估值日只返回一个当前点。
- AC8：fresh baseline、Prisma Schema、领域类型、API 和中文文档保持一致。
- AC9：现有 `/performance/history` 和 `/performance/summary` 在迁移期保持可用并使用当前有效日终版本。
- AC10：自动盘中采样按账户实际持仓识别 `CN/HK/US` 市场，只为至少一个持仓市场处于常规交易时段的账户写点；没有符合条件的账户时不创建运行历史，立即运行仍可显式绕过该门禁。
