# 自主比赛研究输出修复实施任务

对应 [Spec](../../specs/2026-11-13-arena-research-output-recovery.md)。

## 当前执行摘要

全部任务完成。真实周期 `deda2d71-5548-46a7-860d-de7e5a71c67a` 于 2026-11-13 01:45:24 成功，模型自主观望并生成北京时间 04:45 的新观察预约；正式接口已回读确认。执行窗口内两个容器未变化，工具退出码 0 并释放更新锁。工作区为 `main`，保留既有未提交修改，本任务没有提交或推送。

证据：[本次实施与验收](../../evidence/2026-11-13-arena-research-output-fix.md)；[先前故障记录](../../evidence/2026-11-13-arena-us-research-recovery.md)。

## 任务

- [x] T1：失败输出可独立诊断（AC1）。
  - 依赖：无。入口为 `live-research-call.ts`、`ai/trace/ai-trace-error.ts` 与现有脱敏函数。
  - 写集：`apps/server/src/model-arena/live/live-call-diagnostics.ts`、调用处及对应定向测试；不修改状态机或预算。
  - 完成条件：响应文本、摘要、校验结果持久化，脱敏和大小界限通过定向测试；诊断不改变原异常和结算。
- [x] T2：正式持锁恢复工具（AC3）。
  - 依赖：infra 现有 `locked`、`ownsUpdateLock` 接口已核实。
  - 写集：`scripts/local-runtime/arena-research-recovery.mjs`、对应测试、`scripts/deployment/maintenance.json` 和私有生成回执的 `.gitignore` 规则。
  - 完成条件：精确对象确认、默认预览、正式锁校验、只恢复一次、容器启动时间核对和终态回读均有可执行检查。
  - 附带验证修复：`live-optional-dates.test.ts` 的数据库 mock 按查询区分不存在的时间线，不改变原日期、会话和执行断言。
- [x] T3：定位并修复真实输出违规（AC2）。
  - 依赖：T1、T2 完成并部署诊断代码，取得真实失败文本及问题路径。
  - 入口：新周期的失败输出和 `arena-generation-contracts.ts`、`arena-live-protocol.ts`、`live-research-runner.ts`。
  - 写集：按证据确定的生成提示或契约表达及固定样本测试；不放宽业务约束。若证据表明需要其他模块改动，先更新本任务边界。
  - 已确认写集：`arena-live-protocol.ts` 仅添加字段描述；`live-research-messages.ts` 与 runner 调用处；`live-research-messages.test.ts` 及原始 JSON 样本。
  - 完成条件：具体违规可重复复现，修复通过真实样本回放及正常、异常回归。
- [x] T5：研究阶段可见执行证据状态（AC5）。
  - 依赖：T4 真实失败回执已证明日期格式修复有效，并定位研究与提交的证据落差。
  - 写集：`live-research-quote.ts`、`live-research-tools.ts`、研究消息和对应定向测试；复用 `MarketLiveExecutionReader`，不修改 Market 或 DSA 准入规则。
  - 完成条件：模型能在报价中读取 `execution.status/reason`；合格证据、不合格、Reader 缺失和故障均有测试；提交门禁保留。
- [x] T6：收敛默认指标上下文（AC6）。
  - 依赖：真实长生成截断的回执和工具样本已取得。
  - 写集：`arena-generation-contracts.ts`、`live-research-tools.ts`、研究消息和相关测试；保留模型推理配置及不限预算、不限单轮时限。
  - 完成条件：可选 `limit` 默认 5、范围 1–100，已有无该字段请求仍有效；Reader 按请求窗口返回数据并保留原计算及精度；真实旧样本证明默认上下文减少。
- [x] T7：一次执行校验反馈（AC7）。
  - 依赖：真实回执证明模型误解执行门禁，原提交事务已拒绝且未提交账户或预约。
  - 写集：`live-decision-feedback.ts`、`live-research-runner.ts`、消息提示与定向测试。
  - 完成条件：同周期只反馈一次，仍使用原预算预留和原提交验证；重复错误、其他错误及有限步骤分别收敛，不补造决策或预约。
- [x] T4：稳定窗口真实闭环（AC4）。
  - 依赖：T3、T5、T6、T7 定向测试、包级构建及相关门禁通过。
  - 执行面：infra `sync-code.sh thesis-ledger` 或兼容性要求的 `update.sh thesis-ledger`，随后正式持锁恢复工具。
  - 完成条件：真实周期成功，产生新的观察预约，身份和用量记录完整，容器启动时间在观察窗口保持一致；未知或失败不记为通过。

## 最终一致性核对

- [x] AC1–AC7 均有明确实现与验证责任，真实格式样本、生成上下文与执行门禁保持一致。
- [x] 本地验证与真实运行态分开记录；一次反馈的真实故障注入未执行，未扩大受控测试结论。
- [x] 成功周期、新预约、账户版本、模型身份及用量均从正式结果核对；稳定窗口容器信息一致。
- [x] 原未知用量和失败周期保留，预算、步骤、时限与历史冻结语义保持原约束。
- [x] 已处理全部当前范围阻塞，未把本次验收移入 TODO；未把未来触发或来源恢复当作已验证。
- [x] Spec、任务、证据与实际实现一致；既有用户修改和未经授权的提交边界保持。

结论：通过。本次研究恢复与新预约生成已完整验收。当前仍缺执行证据的标的由模型自主观望，交易准入能力不属于本次已通过结论。任务可归档；当前 Spec 和被其引用的证据保留活动路径。
