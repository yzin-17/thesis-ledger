# 实验完成、采纳与策略版本生成流程审计

审计日期：2026-11-12。范围包括封存完成、结果揭示、候选审阅、采纳事务、成功响应、正式版本读取及实验回链，兼顾 Desktop 和 Mobile 的采纳恢复。此次只审计，没有修改业务代码或真实数据，没有调用模型或更新目标运行态。

后续修复已收口：F1、F2 及提交后附加读取风险的实现与隔离／受控验收见[修复记录](../archive/evidence/2026-11-12-experiment-adoption-consistency.md)。下文保留修复前的审计事实和复现边界。

## 结论

正常闭环在隔离样本中通过；现有两条真实采纳记录均可只读还原有效响应，正式版本来源和实验回链完整。另确认两个待修复问题，以及一处仍需明确呈现的响应失败边界。当前流程不能因此标记为无缺陷。

## 已复现问题

### F1：多个候选已采纳时，实验顶部仍指向第一个版本（P2）

位置：`apps/desktop/src/features/strategy/StrategyExperimentDetailPage.tsx:241`。

`persistedAdoptedCandidate` 使用 `candidates.find(...)`，按候选数组顺序选择第一个已采纳候选。当前会话采纳第二个候选时，局部 `adoptedVersion` 能暂时展示 v2；刷新后局部状态消失，顶部重新显示 v1，并将“查看策略版本”指向 v1。

受控浏览器将原实验投影为候选 1 已采纳 v1、候选 2 已采纳 v2，策略列表同时提供两个版本。页面出现两个正确的行内已采纳入口，但顶部仍显示 v1，链接仍为 `e0137741-0f5d-4da1-808b-8eb8852717b8`。未发出任何业务写请求。

影响是用户从顶部进入旧产物，容易误判第二次采纳结果或关联未保存；正式版本及行内关联记录并未丢失。修复时应明确多次采纳的概览语义，按实际正式版本选择或展示各次采纳，避免由候选顺序决定顶部结果。

复现脚本：`/tmp/audit-experiment-multiple-adoptions.cjs`。截图：`/tmp/experiment-flow-audit-qa/two-adopted-header-v1.png`。

### F2：采纳与手工发布并发时，会返回通用 500（P2）

位置：`apps/server/src/backtest/backtest.service.ts:58`、`apps/server/src/strategy-optimization/strategy-optimization-adoption.ts:170`。

采纳事务持有策略级 advisory lock，手工 `createVersion` 则使用独立的“读取最大版本号，再创建下一版本”，没有参与相同锁。手工发布可在采纳已读取当前版本、尚未创建下一版本时抢先提交。

隔离 PostgreSQL 中以正式 v1 为基线，在采纳准备创建 v2 时调用真实 `BacktestService.createVersion` 先提交手工 v2。采纳随后抛出 `P2002`；真实 `ApiExceptionFilter` 将其转换为 HTTP 500 和“服务暂时不可用”，没有稳定的版本冲突码。

事务与唯一键保护有效：失败的采纳回滚，未出现第二个 v2，也没有残留采纳记录。问题在于正常的并发版本冲突被误报为服务故障。修复时需要统一正式版本分配的并发边界，并将竞争结果收敛为明确、可恢复的版本冲突。

## 剩余响应失败边界

位置：`apps/server/src/strategy-optimization/strategy-optimization.service.ts:482`、`apps/server/src/strategy-optimization/strategy-optimization.controller.ts:179`。

采纳事务提交后，仍会构建版本上下文、读取监控计划，并在 Controller 查询现有风险应用差异。这些步骤失败时，HTTP 请求仍可能失败，而正式版本已经提交。此前的 V2/V3 兼容误拒已修复，但它不是唯一可能触发该现象的路径。

本轮向真实风险服务的 `planDiffsForTargetVersion` 注入一次读取失败，确认 Controller 报错后正式 v2 和采纳记录已存在；恢复读取后，用相同幂等请求得到同一个版本，没有重复发布。

Desktop 主详情页已有失败后对账，能在读取成功时确认已保存。Mobile 保留原请求凭据并提供“找回原候选采用”，可以幂等恢复，但没有自动读取采纳事实来消除这次失败反馈。此处记录为恢复与状态表达边界，不将暂时无法确认的响应等同于事务未提交。

## 通过项及覆盖边界

- 隔离纵向闭环通过：待封存 → 真实封存状态机 → 结果揭示 → 审阅上下文 → 真实采纳 Controller 和风险编译 → 正式 v2 → 策略列表 → 按正式版本查回原实验。状态机、数据库、采纳事务、响应 Schema 和读取服务均真实执行；配置解析及行情回测边界使用现成冻结样本适配器，没有模型调用或真实 Provider 请求。
- 原 T06 封存状态机的 7 项检查在新建隔离数据库中通过，覆盖部分失败隐藏、原批次重试、过期执行结果、取消与租约恢复。为避免默认连接误用，子进程显式设置为隔离 `DATABASE_URL`。
- 临时隔离审计 4 项通过，其中包括上述 T06 子套件、完整闭环、并发故障复现和提交后响应故障复现。故障复现通过表示实际缺陷被稳定观察到，不表示缺陷已修复。
- Server 8 个相关文件、45 项通过；API Client 10 项通过；Desktop 3 个相关文件、15 项通过。Mobile 恢复链仅作源码检查，未进行原生设备验收。
- 对当前两条真实采纳记录只读运行成功响应构造，并通过 `optimizationAdoptionReadSchema`；两个正式版本的实验列表 GET 都返回 200、总数 1 和正确原实验。
- 真实记录交叉核对未发现断链：采纳记录、候选 `adoptedStrategyVersionId`、正式版本、候选哈希、版本 `source.kind/referenceId` 均对应。
- 旧 `StrategyOptimizationWorkspace` 没有当前路由消费者；其中仍按基线或零推导采纳确认版本的旧逻辑仅记录为遗留代码，不算当前可达流程问题。

## 数据保护证据

审计前后对下列真实业务表比较行数及全行排序摘要，完全一致：

| 表 | 行数 | 前后相同的摘要 |
| --- | ---: | --- |
| OptimizationExperiment | 19 | `440815933e0521ad9e3f924c598ce44a` |
| OptimizationCandidate | 14 | `32db77a14efe7266955119843c5c95f8` |
| OptimizationAdoption | 2 | `658440575b66d5ffb2dd247132794258` |
| Strategy | 119 | `877c8b32f42d03de6128a85e1a31f94f` |
| StrategyVersion | 151 | `18d04543e8a7107889027558d3007c1c` |
| BacktestJob | 151 | `7c1ad010d27088254562205ef4db8077` |
| AiRun | 41 | `451c101cc2889c14f2cf14515470aa3a` |
| StrategyRiskApplication | 2 | `5af27d34a13b1623533952472a3f1a79` |

所有测试写入均发生在现有隔离 PostgreSQL 工具创建的临时实例中，实例已自动清理。浏览器复现仅拦截和投影 GET 响应，非 GET 业务请求计数为 0。

临时审计测试已移出仓库，证据副本为 `/tmp/experiment-flow-audit.temporary.test.ts`；复现时须放回原 `apps/server/test/strategy-optimization/` 路径以解析相对导入，并仅使用其内部隔离入口。不得直接启用默认连接的 PostgreSQL 测试来复现。

## 后续优先级

先处理 F1 的顶部版本选择和 F2 的统一发布冲突；再统一各端对“提交成功、响应待确认”的呈现与恢复。此报告只登记审计结果，没有启动这些修复，也未建立新的模型或真实数据操作授权。
