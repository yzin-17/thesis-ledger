# 投资复盘工作台（统一 Trade Projection）实施任务

对应 Spec：[`../specs/2026-08-28-journal-review-trade-projection.md`](../specs/2026-08-28-journal-review-trade-projection.md)

## 执行约束

- 本任务只负责 Journal 复盘与 Trade Projection 的衔接，不重新实现成交录入、账本修正、Baseline 对账或 Trade Projection。
- LedgerEvent 是唯一经济事实源；Trade、Position、Cash 和 Journal 候选不得成为第二套可编辑事实。
- Trade Cycle 与 Close Slice 必须使用同一命名和状态语义；完整周期统计不得混入 Close Slice。
- 实际账户与影子账户严格隔离；所有 Query key、缓存、统计和复盘结果必须包含模式。
- 新主链路统一使用 decimal string DTO；旧 `CompletedTrade<number>` 仅允许存在于 legacy adapter。
- `openedAt` 允许为空，任何实现不得使用 `earliestEvidenceAt`、Baseline 记录时间或服务端时间伪造开仓时间。
- Snapshot STALE 以对象级 `evidenceFingerprint` 为主判断依据，不得仅因账户级投影变化使无关对象过期。
- 统计资格由 domain/server 统一计算；Desktop 不得自行复制资格规则。
- 周期窗口统一使用 `[start,end)`；Trade Cycle 按 `effectiveClosedAt`，Close Slice 按 `executedAt`。
- 请求读取使用 TanStack Query；分析和 AI 使用独立 mutation；UI 复用现有 shadcn 组件和原子类。
- 高级 JSON 只保留开发/调试/历史兼容，不得进入正式候选、统计或 Snapshot。
- 任务完成前不得把原 8/25 任务的旧测试数量或旧 `projectCompletedTrades` 路径当作当前证据。

## 跨任务契约

- T1 冻结统一的复盘对象契约：`TRADE_CYCLE`、`CLOSE_SLICE`、稳定 `reviewObjectId`、候选状态、证据状态、投影引用、`evidenceFingerprint`、decimal、未知时间、时间窗口和统计资格。
- T2 消费 T1 契约和 `TradeQueryService` 详情，产出候选列表、legacy 映射、显式计划来源和对象级证据指纹。
- T3 消费 T2 候选，产出确定性分析输入适配器、Snapshot 保存/读取和 STALE 判断；不得改变 Trade 源事实。
- T4 与 T5 均只消费 T1–T3 定义的字段和状态，可在 T3 完成后并行实施。
- T6 只消费 T3–T5 的确定性结果与 Snapshot，不得重新推断交易事实、生命周期或统计资格。

## 任务清单

- [ ] T1：冻结 Journal 复盘对象与数据契约
  - 覆盖验收标准：AC2、AC3、AC4、AC6、AC7、AC9、AC10、AC12、AC16
  - 依赖：无
  - 涉及范围：`TRADE_CYCLE`/`CLOSE_SLICE`、稳定 ID、ACTIVE/ENDED、退出证据、Baseline、decimal、未知 `openedAt`、`[start,end)`、统计资格、投影版本和对象级证据指纹。
  - 完成条件：
    - `reviewObjectId` 固定为 `TRADE_CYCLE:<tradeId>` / `CLOSE_SLICE:<closeSliceId>`，由 domain/server 生成。
    - 新 Journal 分析 DTO 使用 decimal string；旧 `CompletedTrade<number>` 收敛为 legacy adapter。
    - `openedAt` 为 nullable，依赖真实开仓边界的指标有统一“证据不足”语义。
    - 定义 `statisticsEligibility { eligible, reasons }` 及 exclusion reason 枚举。
    - 定义 `projectionGeneration`、`projectionFingerprint`、`evidenceFingerprint` 各自语义。
    - 定义 `[start,end)`、Trade Cycle `effectiveClosedAt`、Close Slice `executedAt` 的时间窗口契约。
    - 高级 JSON 被明确排除在正式 ReviewObject、统计和 Snapshot 之外。
  - 验证方式：
    - Schema/domain 双向类型检查。
    - 示例覆盖完整 Trade、ACTIVE Trade、部分减仓、余额观察结束、Baseline 估算、成本冲突、FX 缺失、未知 `openedAt`、时间边界和 legacy adapter。
    - 验证不存在将 JS `number`、记录时间或 Desktop 本地推断重新引入主链路的路径。

- [ ] T2：核对并补齐统一 Trade Projection 候选编排
  - 覆盖验收标准：AC1、AC2、AC3、AC4、AC5、AC10、AC12、AC16
  - 依赖：T1
  - 涉及范围：Journal 候选查询、Trade 详情、Close Slice、TradePlan/Journal 证据、Projection Generation/Fingerprint、Evidence Fingerprint、legacy 候选和账户/模式筛选。
  - 完成条件：
    - 在现有 `TradeQueryService` 接入基础上确认 Journal 不直接查询或重放 Ledger 来生成交易。
    - 完整 Trade 与 Close Slice 使用 T1 统一 `reviewObjectId`。
    - 候选输出 `statisticsEligibility`，Desktop 无需自行计算。
    - 候选输出当前对象 `evidenceFingerprint`，其依赖范围只覆盖当前对象真正使用的事实和显式关联。
    - 窗口、分页和投影世代绑定；旧游标在 generation 变化时失效。
    - 旧 SELL 候选唯一映射到 Close Slice，歧义保留 legacy。
    - 高级 JSON 不进入候选编排。
  - 验证方式：
    - server service/controller 测试覆盖账户/模式隔离、稳定 ID、生命周期、统计资格、计划显式关联、无计划、legacy 唯一/多重/无匹配、时间窗口、投影变化和游标失效。
    - 增加对象级 fingerprint 测试：相关事实变化必须改变；无关标的/Trade 变化不得改变。
    - 确认候选读取无账本写入。

- [ ] T3：实现确定性分析适配与复盘 Snapshot
  - 覆盖验收标准：AC6、AC7、AC11、AC12、AC13、AC14
  - 依赖：T1、T2
  - 涉及范围：Trade/Close Slice → decimal Journal 分析 DTO、legacy number adapter、时间缺失降级、复盘输入/输出 Snapshot、Snapshot 列表/详情读取和 STALE 判断。
  - 完成条件：
    - 确定性分析只使用候选与临时证据。
    - 新分析路径不通过 `CompletedTrade<number>`。
    - 不可安全适配旧 number、缺少必要事实或时间边界时返回证据不足，不伪造零值。
    - 用户显式保存的 Snapshot 带 `reviewObjectType`、`reviewObjectId`、事实集合、投影版本、`evidenceFingerprint` 和 FX 证据。
    - 实现正式 Snapshot 保存、列表和详情读取能力。
    - STALE 主要比较 `reviewObjectId + evidenceFingerprint`；账户级 `projectionFingerprint` 变化不自动使无关 Snapshot 过期。
    - Snapshot 不写 Ledger、TradePlan 或 JournalEntry；读取不自动重算或覆盖历史结果。
  - 验证方式：
    - domain/server 测试覆盖 decimal 舍入、legacy number 适配、未知时间、反事实不可计算、当前/过期 Snapshot、Snapshot 列表/详情。
    - 相关事实修改触发 STALE；无关资产、无关 Trade 或无关事件变化不触发 STALE。
    - 覆盖确定性分析失败、Snapshot 保存失败和读取失败。

- [ ] T4：完成单笔复盘工作台
  - 覆盖验收标准：AC2、AC3、AC5、AC7、AC8、AC11、AC15、AC16
  - 依赖：T2、T3
  - 涉及范围：候选列表、对象类型标识、实际/计划/Baseline 证据核对、临时证据 Sheet、手动复盘、高级 JSON 调试入口和确定性结果入口。
  - 完成条件：
    - 默认不展示 JSON。
    - 用户能区分完整交易和减仓片段。
    - ACTIVE、Baseline、legacy、过期、未知 `openedAt` 和证据不足均有局部状态。
    - 补充证据只对本次分析生效。
    - 切换账户/模式清除旧上下文。
    - Desktop 直接消费 `statisticsEligibility`、稳定 `reviewObjectId` 和 Server 状态，不复制 domain 判断。
    - 高级 JSON 明确标记为调试/历史兼容，不创建正式候选、统计或 Snapshot。
  - 验证方式：
    - Desktop 组件测试覆盖加载、空态、读取失败、重试、完整/部分/仅实际交易、Close Slice、legacy、过期、未知时间、账户/模式切换、字段错误和键盘焦点。
    - 检查高级 JSON 不写入事实、不进入正式 Snapshot。

- [ ] T5：完成周期复盘与统计口径
  - 覆盖验收标准：AC2、AC3、AC4、AC9、AC10、AC11、AC15
  - 依赖：T2、T3
  - 可与 T4 并行
  - 涉及范围：7 天/30 天/自定义窗口、完整 Trade 统计、Close Slice 独立统计、统计排除原因和重点交易跳转。
  - 完成条件：
    - 请求显式携带账户、模式、`start`、`end` 和分页，Server 按 `[start,end)` 处理。
    - `TRADE_CYCLE` 按 `effectiveClosedAt` 落入窗口，`CLOSE_SLICE` 按 `executedAt` 落入窗口。
    - 周期指标只使用 `statisticsEligibility.eligible=true` 的完整 Trade。
    - Close Slice 不增加完整交易次数和胜率。
    - FX/成本/Baseline/未知时间等缺口保留 explanation，不由 Desktop 再判断 eligibility。
    - 点击重点交易携带 `reviewObjectType + reviewObjectId` 进入对应单笔上下文。
  - 验证方式：
    - Desktop/server 测试覆盖 `[start,end)` 起止边界、空窗口、跨月窗口、统计资格、Close Slice 排除、余额观察结束、FX 缺失、未知 `openedAt`、投影过期、分页刷新和深链跳转。
    - 验证 T4/T5 在共享 schema 下不会产生不同统计口径。

- [ ] T6：解耦 AI 解读并同步结果审计
  - 覆盖验收标准：AC11、AC12、AC13、AC14、AC15
  - 依赖：T3、T4、T5
  - 涉及范围：确定性结果、AI mutation、Provider/模型/Prompt 元数据、来源引用、失败状态和 Snapshot 审计入口。
  - 完成条件：
    - 确定性成功前不显示 AI 主操作。
    - AI 只接收结构化 Trade/Close Slice 事实、来源引用和确定性结果。
    - AI 不计算 `statisticsEligibility`、生命周期、成本或 STALE。
    - AI 失败、Provider 不可用或 Snapshot 过期时确定性结果仍可见。
    - 结果可查看当前或历史 Snapshot 来源及其 `evidenceFingerprint`。
  - 验证方式：
    - API/UI 测试覆盖 AI 成功、失败、不可用、重复触发、账户/模式切换、当前/过期 Snapshot 和历史 Snapshot。
    - 确认 AI 请求不创建交易事实、不改变 Snapshot STALE 状态。

- [ ] T7：完成回归验证、文档和最终一致性 Review
  - 覆盖验收标准：AC1–AC16
  - 依赖：T1、T2、T3、T4、T5、T6
  - 涉及范围：domain/schema/server/api-client/Desktop 定向测试、用户指南、Spec/Task 证据、浏览器和本地 Compose 验收记录。
  - 完成条件：
    - 所有任务均有实现与验证证据。
    - 旧 `projectCompletedTrades` 主路径和旧候选假设不再被当前代码或文档引用。
    - 新主链路不依赖 `CompletedTrade<number>`。
    - `openedAt`、时间窗口、统计资格、对象 ID、`evidenceFingerprint` 和 Snapshot API 在 Spec/Schema/Server/Desktop 中一致。
    - 高级 JSON 不进入正式候选、统计或 Snapshot。
    - 测试、运行时、浏览器、真实 Provider 和正式发布门禁分别记录。
    - 完成最终一致性 Review。
  - 验证方式：
    - 运行受影响包的 build/typecheck/test、Prisma/迁移校验、定向 ESLint/Prettier、Markdown 链接扫描、`git diff --check`。
    - 本地 Compose health/integrity、Trade/Journal API 和浏览器状态矩阵单独记录。
    - 对比 Spec AC1–AC16 与实际测试证据，不以旧测试数量代替当前验收。

## 验收标准映射

| Spec 验收标准 | 对应任务 |
| --- | --- |
| AC1 | T2、T7 |
| AC2 | T1、T2、T4、T5 |
| AC3 | T1、T2、T4、T5 |
| AC4 | T1、T2、T5 |
| AC5 | T2、T4 |
| AC6 | T1、T3、T7 |
| AC7 | T1、T3、T4、T7 |
| AC8 | T4 |
| AC9 | T1、T5 |
| AC10 | T1、T2、T4、T5、T7 |
| AC11 | T3、T4、T5、T6 |
| AC12 | T1、T2、T3、T6、T7 |
| AC13 | T3、T6、T7 |
| AC14 | T3、T6 |
| AC15 | T4、T5、T6、T7 |
| AC16 | T1、T2、T4、T7 |

## 当前基线与非任务范围

- 现有 Trade Projection、成交录入、Baseline、现金、多币种、Trade 列表/详情和 Journal 迁移实现作为前置能力，不在本任务重复实现。
- 原 8/25 Journal Spec/Task 保留历史验证记录；本任务完成后，后续 Journal 开发只引用本 Spec 和本 Task。
- 正式生产数据副本、在线 FX、正式 Provider、分阶段发布和生产回滚不属于本 Task 的本地验收范围。
- 如未来需要正式支持“外部交易 JSON 复盘”，另立独立 Spec，不在本任务扩展 ReviewObject 类型。

## 最终一致性 Review

- [ ] Spec 中的全部验收标准均有对应实现
- [ ] 所有已勾选任务均有验证证据
- [ ] 所有任务依赖均已满足且无错误阻塞关系
- [ ] T4 与 T5 在 T3 后可独立/并行实施，无隐式 UI 依赖
- [ ] 跨任务接口、类型和命名保持一致
- [ ] `reviewObjectId` 的稳定规则在 domain/server/Desktop 一致
- [ ] 新主链路使用 decimal string，旧 `CompletedTrade<number>` 只存在于 legacy adapter
- [ ] `openedAt=null` 不被任何观测时间替代
- [ ] `[start,end)`、`effectiveClosedAt`、`executedAt` 的时间口径一致
- [ ] `statisticsEligibility` 只由 domain/server 判断
- [ ] Snapshot STALE 由对象级 `evidenceFingerprint` 正确驱动
- [ ] 无关资产/Trade 变化不会导致当前对象 Snapshot STALE
- [ ] Snapshot 保存、列表、详情读取均有实现和测试
- [ ] 高级 JSON 不进入正式候选、统计或 Snapshot
- [ ] 实现未超出 Spec 声明的范围
- [ ] 测试策略、测试实现与验证结果一致
- [ ] 测试与文档已同步更新
- [ ] 必要实施 Step 均已验证；如已获提交授权，已形成合理 commit，否则已记录提交状态或建议边界
- [ ] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

- 结论：关键契约已在 Spec 中收敛，可从 T1 开始实施。
- 已确认：
  - 新 Journal 确定性分析使用 decimal string DTO；
  - `openedAt` 允许为空且不伪造；
  - Snapshot 使用对象级 `evidenceFingerprint`；
  - 时间窗口和统计资格由统一 domain 契约定义；
  - 正式 Snapshot 支持保存、列表与详情读取；
  - 高级 JSON 仅保留兼容/调试能力。
- 遗留风险：
  - legacy number 快照的兼容边界需在 T3 通过真实样本验证；
  - `evidenceFingerprint` 的依赖范围需要 T2/T3 测试防止过宽或过窄；
  - 旧报告与新 Trade Cycle/Close Slice 统计口径不可直接横向比较。
- 验证命令与结果：本轮为文档迭代，业务测试应在对应任务实施后记录；文档提交前仍需执行 Markdown 链接检查、格式检查和 `git diff --check`。
