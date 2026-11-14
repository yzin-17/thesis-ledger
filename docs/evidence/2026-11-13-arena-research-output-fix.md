# 自主比赛研究输出修复证据

关联 [Spec](../specs/2026-11-13-arena-research-output-recovery.md) 与[已完成任务](../archive/tasks/2026-11-13-arena-research-output-recovery.md)。先前故障见[历史排查记录](2026-11-13-arena-us-research-recovery.md)。以下时间均为北京时间。

## 诊断与稳定运行工具

- `live-call-diagnostics.ts` 复用 AI 的 SDK 错误快照与脱敏函数，保留失败响应正文、原始长度、SHA-256、独立契约校验路径和响应标识。保存正文最多 65536 字符；诊断不改变失败异常、实际用量或预算结算。
- `arena-research-recovery.mjs` 已登记到主仓维护命令清单，默认预览。真实恢复必须持有 infra 正式更新锁，并确认精确比赛和参赛者；每次执行只发起一次恢复，周期失败后保留回执，不连续补投。
- 验收回读要求：周期成功、新预约、账户新版本、全部模型身份核验通过、调用用量已结算；窗口内两个容器 ID、镜像及启动时间保持一致。观察超时不取消请求。

## 本地验证

| 输入范围 | 命令 | 结果 |
| --- | --- | --- |
| 新增诊断、研究控制、调用预算 | `pnpm --filter @thesis-ledger/server exec vitest run test/model-arena/live-call-diagnostics.test.ts test/model-arena/live-research-control.test.ts test/model-arena/live-call-limits.test.ts` | 17 项通过 |
| 持锁恢复参数、拒绝重复恢复、终态、观察超时、接续观察及验收断言 | `pnpm exec vitest run scripts/local-runtime/arena-research-recovery.test.mjs` | 6 项通过 |
| Arena 包级回归 | `pnpm --filter @thesis-ledger/server exec vitest run test/model-arena` | 45 项通过，61 项隔离数据库集成测试因未配置数据库而跳过 |
| Server 全部源码与测试 | `pnpm --filter @thesis-ledger/server typecheck` | 通过 |
| Server 编译 | `pnpm --filter @thesis-ledger/server build` | 通过 |
| 模块边界 | `node scripts/check-boundaries.mjs` | 通过，依赖方向保持 Arena → AI；无模块导出或跨领域所有权调整 |
| 文件尺寸 | `node scripts/check-file-size-guardrails.mjs` | 通过，有既有 `JournalDashboard.tsx` 尺寸警告 |
| 修改的 Server 源码与测试 | `pnpm exec eslint` 加对应文件路径 | 无错误；本地运行脚本被既有 ESLint 配置忽略，其行为由专门 Vitest 测试覆盖 |

包级回归最初发现 `live-optional-dates.test.ts` 的数据库 mock 对所有查询都返回比赛记录，不能兼容 `ArenaLiveTimeline` 读取。已仅修正 mock 对模板字符串和 Prisma SQL 对象的分类，保留原日期、会话、撮合和投递断言。没有修改生产日期行为。

## 诊断版本部署

- 执行目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`。
- 正式入口：`./scripts/sync-code.sh thesis-ledger`，退出码 0。
- 兼容性预检通过；Server、Worker 均健康。镜像 ID 不变，代码位于容器可写层，不等同于镜像更新或生产发布。
- 默认预览成功，输出位于 `var/acceptance/arena-research-91d6e8f0-fcef-4801-ab09-f9c90110479f-1794501424271.json`。
- 随后通过 `node scripts/infra.mjs locked -- node <主仓>/scripts/local-runtime/arena-research-recovery.mjs` 发起诊断恢复，指定原比赛和参赛者、`--apply`、匹配的 `--confirm`、1800 秒观察窗口与私有输出 `var/acceptance/arena-research-diagnostic-2026-11-13.json`。

## 真实失败定位与最终闭环

诊断周期 `f849609b-8fd5-4e53-b805-03bac10c8d65` 在稳定窗口内于 00:38:57 结束，状态为 `failed / model_output_invalid`。最后请求为 `1099712f-0dc4-4e24-9750-475bc5111d29`；响应为完整合法 JSON，共 736 字符，SHA-256 为 `8464e6672cc393f0f0f295209858e931dc56959585661f8167dbeab151ecc8ff`。

独立校验只发现一条错误：`decision.orders[0].expiresOn` 的 `invalid_format`。模型填入 `2026-11-12T21:00:00Z`，该字段要求市场时区下的到期交易日 `YYYY-MM-DD` 或 `null`。观察时刻则由 `wakeups.at` 承载。原始失败样本已冻结为 `apps/server/test/model-arena/fixtures/invalid-order-expiry.json`；没有改写真实周期。

修复仅增强生成语义：为两个字段增加共享 schema 描述，并在独立的研究消息构造器中明确到期交易日、未来 UTC 观察时刻及市价委托空值规则。保留全部格式及业务校验，历史回放上下文和冻结 `asOf` 继续原样消费。

固定样本仍准确拒绝时间戳；受控副本只把到期字段改为合法日期或空值后通过，市价委托带到期日期仍拒绝。新增消息测试同时检查冻结时间和历史资料边界。

最终代码验证：Arena 回归 47 项通过、61 项隔离数据库测试跳过；schema 相关测试 18 项通过；Server 类型检查和构建通过；模块边界、文件尺寸与修改范围 ESLint 通过。共享工作区的风险模块在验证期间有并发修改，一度产生三个类型错误；该模块随后由原工作完成兼容修复，本任务没有修改它，重新检查已通过。

日期修复版本经第二次 `./scripts/sync-code.sh thesis-ledger` 同步成功，正式持锁试跑周期为 `4c0a2bf2-2755-40cb-8b33-82b4e2f48faf`。模型已返回合法日期 `2026-11-12`，输出通过契约，但在 00:49:33 因 `execution_evidence_missing` 结束；委托未提交，新预约也未落库。该失败不再属于格式错误。

## 研究与提交的执行证据落差

真实模型选择 `ACM.US`，研究工具拿到价格后生成限价委托；当时研究报价只展示价格、来源和时点，没有执行准入状态。该报价也没有 `units.priceCurrency`，不能据此认证可执行；提交端的 `MarketLiveExecutionReader` 还要求独立状态、规则和其他证据。因此，正常研究报价与执行证据不可互相替代。

新增 `live-research-quote.ts` 复用同一正式执行 Reader，为实时研究报价返回 `execution.status/reason`；证据可用时带上该执行观察自身的价格和时点。Reader 不可用、缺失或故障均保守返回不可用，取消仍传播。研究提示要求模型依据该状态自主继续研究或提交观望及未来预约；提交端仍完整复核。

历史回放继续走其原冻结观察路径。未修改 Market 或 DSA 准入规则，没有推断币种、补造状态或强制生成观望决策。

新增研究报价测试与既有执行 Reader 门禁回归合计：56 项通过、61 项隔离数据库测试跳过。Server 类型检查、构建、修改范围 ESLint、边界和文件尺寸检查均通过。

包含执行状态投影的版本经第三次 `./scripts/sync-code.sh thesis-ledger` 同步，退出码 0，两服务健康且镜像不变。随后通过同一正式持锁入口开始周期 `e5a8ebf5-5897-4951-9f46-8e0d5681f0f6`，私有输出为 `var/acceptance/arena-research-complete-2026-11-13.json`。

已从该周期的正式接口回执确认：`SPY.US`、`QQQ.US`、`IWM.US` 的研究报价均带有 `execution.status=unavailable`、`reason=live_tradability_unavailable`，模型可以在最终决策前看到真实限制。该事实不代表 ETF 交易已接通；执行门禁继续保留。

该周期最终于 01:23:09 以 `model_output_invalid` 结束。最后请求 `d15812e4-360d-4744-95a5-e89c30925ead` 的错误为 `output_truncated`，Provider 结束原因为 `length`。回执输入 26121、输出 76279 tokens，总计恰好为已加载模型的 102400 上下文窗口。用量已报告并结算，不是结果未知或服务重启；用户此前也反馈 LM Studio 显示生成中。

为支持长生成的持续验收，观察工具增加 `--observe-cycle`：在正式锁下接续同一周期，从该周期首次模型调用保存的冻结账户读取原始版本和预约 ID，只观察、不再次预约或派发。原观察窗口到期不会取消研究；接续时仍核对运行容器未变化。专门测试覆盖不产生任何恢复请求。

## 默认指标上下文收敛

最后请求前，输入从约 3491 tokens 增长到 26121 tokens；其中两次指标工具默认各返回 100 个点。实际 `SPY.US`、`QQQ.US` 指标响应正文分别为 13587、13677 字符，保留原元数据并投影最近 5 点的对应样本分别为 1165、1135 字符，最新时点和原值一致。此样本分析证明默认窗口存在明显膨胀，不声称单凭输入大小就能证明模型全部长输出的内部原因。

指标请求增加兼容的可选 `limit`，默认 5，范围仍为 1–100；调用现有 Research Reader，保留其预热计算和精度。实时及历史研究都按显式窗口传入；历史已冻结记录不改写。研究消息提醒按需获取历史、已有证据足够时及时提交决策及预约。未改变模型推理配置、研究步骤、业务时限、令牌上限或预算。

最新验证：Arena 与执行门禁相关 57 项通过、62 项隔离数据库测试跳过；指标窗口及预热回归 12 项通过；共享 schema 全包 147 文件、1597 项通过；Server 类型检查、构建、修改范围 ESLint、模块边界和文件尺寸检查通过。

收敛版本经第四次正式快更部署，持锁周期 `b838db5e-5849-4036-99c6-28648ef99eca` 的两次实际指标响应均为 5 点。四次模型调用的输入分别为 2537、2832、6774、10608 tokens，输出分别为 2765、518、366、1084 tokens；本次没有上下文长生成截断，约两分钟返回最终决策。

该周期于 01:34:47 因 `execution_evidence_missing` 结束。模型输出明确写出 `execution=unavailable`，仍提出以限价单尝试买入 `QQQ.US`，说明仅靠提示不能保证其正确理解执行门禁。原提交端继续拒绝，没有落入账户或生成预约。

## 一次有界的执行校验反馈

针对已证明的误解，增加同周期一次反馈：仅当决策提交因稳定码 `execution_evidence_missing` 拒绝时，把“本次决策未提交、限价单也需要执行证据”、当前观察时刻交回模型。模型自行重新生成完整决策；仍经原 `LiveResearchCall` 预算预留、原步骤限制与原提交事务验证。反馈记录在下一次模型调用输入中，不补造订单或预约。

同周期最多反馈一次；再次拒绝保留原失败原因。账户冲突、未知用量等不触发重发，有限步骤用尽时也不增加调用；历史回放反馈使用冻结 `asOf`。

新增 4 项测试验证以上边界。最新 Arena 与执行门禁回归为 68 项通过、62 项隔离数据库测试跳过；其中另一个并发任务新增了 7 项调用费用测试，本记录不将其实现归属本任务。Server 类型检查和构建、修改范围 ESLint、边界和文件尺寸检查均通过。期间共享 schema 新增历史目录导出，重建对应包后类型检查通过，本任务未改该并发接口。

## 真实闭环结果

带校验反馈的版本经第五次 `./scripts/sync-code.sh thesis-ledger` 同步，退出码 0，Server 和 Worker 健康、镜像保持不变。随后在 infra 目录通过正式 `locked` 入口执行同一恢复脚本，目标仍为原比赛和参赛者，精确确认参数不变；观察窗口设为 7200 秒，实际提前正常结束。

- 成功周期：`deda2d71-5548-46a7-860d-de7e5a71c67a`。
- 恢复工具开始观察：2026-11-13 01:41:48；研究成功提交：01:45:24，终态 `succeeded`。
- 实际执行 4 次模型调用、10 次研究工具调用，累计报告 32199 tokens；全部模型身份核验通过、全部调用结算完成。
- 最后一次模型输入为 8784 tokens，输出 607 tokens，没有长生成截断。
- 模型依据 `SPY.US`、`QQQ.US`、`AAPL.US` 的执行证据不可用，**自行生成观望决策**，`orders=[]`；本成功周期未触发校验反馈修正。一次反馈路径由前述受控测试验证，不将其宣称为本轮真实故障注入验收。
- 新预约：`e8511dee-7286-4a8c-9009-293c22769f67`，类型为时间观察，目标 `2026-11-12T20:45:00Z`，即**北京时间 2026-11-13 04:45**，创建于 01:45:24.311，回读时尚未触发。
- 独立正式接口回读：比赛 `running`，参赛者 `waiting`、`reason=null`，账户版本 16；周期成功，新的预约已持久化，委托数量为零。
- 两个容器在整个验收窗口保持同一 ID、镜像及启动时间。Server 为 `1efa8b399f08…`，启动于 `2026-11-12T17:41:31.00476826Z`；Worker 为 `e5fef43b1682…`，启动于 `2026-11-12T17:41:30.95722701Z`；镜像均为 `sha256:6c08cbe3666e399ef084d29b951e7f46fbe00b7fd85b4544b2f6aefcf628d885`。
- 持锁工具退出码 0，更新锁正常释放。私有完整回执为 `var/acceptance/arena-research-closed-loop-2026-11-13.json`，没有将其作为源码提交。

本次验收完成“恢复预约 → 自动领取 → 模型研究 → 成功提交 → 生成下一次预约”。没有等待 04:45 的未来触发，不将当前验证扩展为未来来源恢复或 ETF 交易准入已接通的证明。

## 写集与最终核对

- 研究实现：`live-call-diagnostics.ts`、`live-research-call.ts`、`live-research-messages.ts`、`live-research-runner.ts`、`live-research-quote.ts`、`live-research-tools.ts`、`live-decision-feedback.ts`。
- 共享生成契约：`arena-live-protocol.ts` 的字段描述、`arena-generation-contracts.ts` 的指标可选窗口。
- 维护入口：`scripts/local-runtime/arena-research-recovery.mjs`、对应测试及 `scripts/deployment/maintenance.json` 登记；`.gitignore` 排除 `var/acceptance/` 私有生成回执。
- 受控验证：诊断、生成消息、研究报价、研究工具、有界反馈测试；原日期测试仅修正数据库 mock；原始格式失败 JSON 样本保留冻结内容。
- 文档：当前 Spec、已完成任务归档、本证据及先前故障记录的后续指针。

全部验收断言已对账。保留既有未提交工作；本任务未创建提交、推送、重建镜像或改写历史周期。当前 Spec 仍定义维护工具及研究接口行为，保留在活动规格目录；完成任务归档，证据继续由当前 Spec 引用。
