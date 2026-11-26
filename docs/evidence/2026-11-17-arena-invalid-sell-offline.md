# 无效卖单约束与可卖数量反馈离线验收

## 范围与结论

对应 [Spec AC19](../specs/2026-11-12-arena-replay-live.md) 及活动 Task 的 R4F1～R4F3。本批次只修改源码、测试与说明文档，并执行本地类型、构建及内存验证；没有部署、真实模型生成、来源采集、比赛操作、真实账户或提供方配置写入。原比赛追平 R4 继续未完成。

离线修复通过：生成 Schema 直接约束卖单和市价委托，研究上下文给出历史业务日的可卖数量，明确的 Schema／卖出数量拒绝可以进入共用的一次完整决策修正。失败原文仍被拒绝，不通过修剪字段或改写旧决策制造成功。真实模型是否按新合同输出尚未验证。

## 失败事实与只读留存

来源为新比赛 `5a9817c2-e994-45af-896d-7e24bbc4633b` 的历史 2026-11-02 10:30 研究周期 `7dd9227b-fdbc-41cd-8479-9ada4f1b7805`，失败调用 `c3534c66-35d9-48b8-adf7-6a35d7927da3`。本轮只读取得已存的失败诊断、第一条用户消息中的冻结协议及账户投影，存入 `apps/server/test/model-arena/fixtures/invalid-sell-20261102.json`；其中没有凭证。成交证据在原模型消息中有意省略，测试解析为完整账户时只补充明确标识的内存占位，不将其当作真实执行资料。

原文为 754 字符，SHA-256 为 `f1c614b25e08f4dd76b548e385aed997d0405cdfb0a44959ba88024ea5130128`；输入 9,229、输出 686 tokens，完整 JSON，错误仍为 `schema_invalid`。三个原拒绝点保持：卖出父单附 `onFill`、单一附属退出只填止盈、市价单填写 `expiresOn`。该批持仓 5,000 份的实际 `availableOn` 为 11 月 3 日，当天尚不能卖出。

2026-11-17 00:32:55（Asia/Shanghai）再次只读核验：比赛仍暂停，4 个周期、9 次模型调用，活动／待执行／未知周期为零；原失败周期、错误码、原文和摘要完全保持。此核验不更新比赛或重发请求。

## 实现与边界

### 生成合同

`packages/schemas/src/arena-live-generated-orders.ts` 持有生成专用的买卖方向／委托类型分支：卖单的 `onFill`、`entryAfter` 为空或省略，市价单到期日为空，非市价单保留价格要求；单一附属保护只有一条止损。OCO、分档、逐次保护及原有跨字段校验继续保留。通用订单和历史账户读取结构不改动，新生成引用升级为 `arena-live-research-v6`，旧 v2～v5 引用继续能读取。

保护 Schema 采用稳定引用，避免每个买入分支重复展开完整保护。原生 SDK 使用 draft-7，提示使用 2020-12；测试按各自实际方言校验同一合同的完整字段及引用，未忽略引用内容。真实失败账户的新首轮消息序列化为 31,310 UTF-8 字节，此数字不是 token 数量；原模型、单次输入／输出及不限额设置没有改动。

### 可卖数量与事务反馈

Domain 的 `arenaSellAvailability` 复用原可卖数量预留算法，并以实际持仓 `availableOn` 区分总持仓、已到可卖日、尚未可卖、已有委托占用及当前可用数量；OCO 组与附属保护不重复计算占用。批次可卖日由已存在的账户事实提供，不按证券代码、自然日或周末假设推算制度。

研究消息以冻结 `asOf` 和比赛时区投影这些数量。提交失败在实际账户和本次撤单后的内存副本上生成 `ArenaSellAvailabilityError`，保留原 `insufficient_position` 错误码，并携带明确类别、请求数量、可卖日及数量。失败仍整次回滚，取消保护不能解除尚未可卖限制。反馈明确区分 `position_not_settled`、`sell_orders_reserved` 和 `insufficient_holding`。

### 有界决策修正

AI 解析层为完整但未通过 Schema 的文本 JSON／JSON Mode 候选保留诊断正文，继续使用既有脱敏、长度上限和摘要；语法错误保持原分类。Arena 只接受完整、合法 JSON、确实是决策、用量已知且身份复核通过的候选进入反馈。原生 SDK 可能在组装 completion 元数据前就抛校验异常，因此身份复核同时支持读取同一 SDK 异常的响应模型标识，仍调用原身份核验器，不以候选自报身份代替。

研究器在原失败调用已结算后，将原助手回复与字段反馈带入下一步。Schema 和实际提交拒绝共享现有的一次修正额度，仍走原预算、步骤、租约和停止信号门禁。修正必须提交完整决策；没有第三次修正，也没有保存部分撤单或订单。

`output_truncated`、未知用量／结果、身份不符、无效 JSON、越界工具与重复拒绝不进入这条修正路径。截断同时阻止实时失败处理器追加延迟研究预约，参赛者进入需处理状态，既有价格／时间预约也不会自动恢复该参赛者。本轮未运行真实比赛验证此行为。

## 验证

所有命令均从 `thesis-ledger` 执行，Shell 使用 `rtk proxy` 前缀；下列均为本地源码、受控响应或内存替身。

| 检查 | 结果 |
| --- | --- |
| `pnpm --filter @thesis-ledger/domain test` | 110 文件、990 项通过 |
| `pnpm --filter @thesis-ledger/schemas test` | 163 文件、1,674 项通过 |
| Server Arena／AI 定向回归 | 18 文件、157 项通过 |
| Domain／Schemas／Server `typecheck` | 全部退出 0 |
| Domain／Schemas `build`、Server `build` | 全部退出 0 |
| 24 个本轮相关 TypeScript 文件 ESLint | 退出 0，无警告 |
| `check-boundaries.mjs`、`check-workspace-dependencies.mjs`、`check-file-size-guardrails.mjs` | 全部退出 0 |
| 路由升级脚本 `node --check`、变更空白检查 | 通过 |

Server 定向覆盖文件为：`live-invalid-sell-flow`、`live-invalid-sell`、`live-research-call-projections`、`live-decision-feedback`、`live-research-wakeup-budget`、`live-research-messages`、`live-research-contract`、`live-call-diagnostics`，以及 AI 的 `ai-generation-output`、`ai-generation-failure-diagnostics`（单元／集成）、`ai-sdk-generation-adapter`（单元／集成）、`ai-generation-finished-output`、`ai-generation-schema-prompt`、`ai-sdk-schema-prompt`、`ai-trace`（单元／集成）。这些集成检查使用受控 HTTP，不连接真实模型或业务数据库。

新增四条完整内存链路串起实际 SDK、调用器、研究器和提交器：Schema 拒绝后提交观望；T+1 拒绝后提交观望；Schema 修正后又违反 T+1 时共用额度并整轮拒绝；即使正文完整，`length` 仍仅一次生成。前两条只写入最后合法决策，保留原现金、持仓及保护单；后两条没有账户写入。

验证中发现并修正了非原生模式候选丢失、原生异常缺少 completion 身份、引用的方言差异和测试可空值问题；前述失败没有掩盖或转为真实比赛重试。最终检查对应当前修复源码。

## 一致性审查与剩余门禁

R4F 离线范围通过：实际失败事实保持、原合法保护语义保留、同一时点与同一预算反馈、一次额度、原子拒绝、未知及截断停止均有对应证据。没有新增依赖、迁移或提交 Git 记录，共享工作区其他在途修改保持。

本补丁尚未部署，也未迁移上一运行批次使用的 v5 精确研究路由。后续部署必须在明确授权后核对对应路由、升级到 v6 并重新准入，不能直接假定旧准入可用。既有维护入口已补充读取 v5 的兼容性，但本轮没有执行该入口。目标运行态核验、真实模型效果以及新比赛从暂停点追平和实时衔接仍未验收，继续由 R4 持有。

以上为离线批次结束时状态。后续已授权的正式部署、运行态补充发现和仍受阻的 v6 准入，见[部署与路由门禁证据](2026-11-17-arena-v6-deployment.md)；不改写本批次失败和验证边界。
