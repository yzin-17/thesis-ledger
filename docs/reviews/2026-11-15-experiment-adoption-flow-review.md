# 实验完成、采纳与策略版本关联复核

日期：2026-11-15。范围：当前共享工作区的实验封存完成、结果读取、候选审阅、正式版本发布、提交后响应恢复、版本来源关联及 Desktop／Mobile 消费。接续[原流程审计](2026-11-12-experiment-adoption-flow-audit.md)和[告警及回归修复验收](../archive/evidence/2026-11-12-complexity-warning-remediation.md)。

## 原审查结论

发现并受控复现一项 P2 页面状态隔离遗漏，当前流程不能标为“没有遗漏”。未发现原 F1 的同实验最新采纳选择、原 F2 的手工／采纳并发发布、提交后响应降级或版本回链的修复回退。本次仅审查，没有修订业务代码或既有测试。

## 后续修复状态

2026-11-15，用户授权修复后，F1 已按[状态隔离合同](../specs/2026-11-15-experiment-detail-scope-isolation.md)完成。同步修复旧审阅、克隆入口、提示、忙碌状态、五类晚到回执及克隆缓存覆盖；新增 20 项回归、最终全量 2116 项和四宽度真实页面受控验收通过，见[修复证据](../archive/evidence/2026-11-15-experiment-detail-scope-isolation.md)。没有调用模型或改动真实业务数据。下文保留修复前审查、复现和当时验证边界，不将原失败事实改写为已通过。

## F1：切换实验后沿用上一个实验的采纳回执（P2）

位置：[采纳回执状态](../../apps/desktop/src/features/strategy/useExperimentDetailPage.ts:295)、[回执参与版本选择](../../apps/desktop/src/features/strategy/strategy-experiment-detail.model.ts:131)、[实验详情路由](../../apps/desktop/src/features/strategy/StrategyDashboard.tsx:292)。

adoptedVersion 在当前组件生命周期内保存，既没有关联 experimentId，也没有在实验身份变化时清除。latestExperimentAdoption 无条件以该回执作为初始结果；当前路由在 experiments/:experimentId 间切换时复用相同详情组件，未按实验身份设置 key。因此甲采纳成功后，直接进入尚无采纳记录的乙，乙的顶部仍可显示甲的正式版本和查看链接。实际可达场景包括采纳甲后克隆，再通过“查看克隆实验”直接进入乙。

受控复现使用真实 useStrategyExperimentDetailPage、TanStack Query 和 React Router：

1. 甲返回一个完成候选，调用受控采纳接口一次，获得正式 v2 回执。
2. 不卸载路由组件，导航到处于 queued／preparing 的新实验乙；乙的候选为空、没有采纳记录。
3. 当前实验身份已是乙，但 displayedAdoptedVersion 仍精确等于甲的正式版本；唯一一次采纳调用仍属于甲，真实 fetch 调用数为零。

影响是展示与导航误关联，可能让用户以为新实验已经采纳或产出了旧版本；数据库关联并未被改写。reviewCandidate、writeReceipt 和 clonedExperimentId 等局部状态同样没有按实验身份隔离，应在修复时一并核对，但本次只将已复现的正式版本回执错配计为独立缺陷。修复方向是按实验身份隔离或重建详情状态，并覆盖直接导航、克隆跳转和异步回执晚到场景；不能只清除界面标题。

复现源留档：/tmp/review-20261115-experiment-flow.temporary.test.tsx。执行前需恢复到原 apps/desktop/test/review-experiment-flow.temporary.test.tsx，以解析相对导入。最终日志：/tmp/review-20261115-experiment-state-isolation-final.log。测试通过表示缺陷已稳定观察到，不表示缺陷已修复。首次尝试仅因 Node Request 与 jsdom AbortSignal 类型不兼容失败；采用既有受控测试的 Request 适配后复现通过，断言未删减。临时测试已移出仓库正常测试集合。

## 各阶段复核

| 阶段 | 核对结果与边界 |
| --- | --- |
| 实验完成与揭示 | 自动锁定全部有效候选，冻结基线和候选 Run 引用；部分失败保持隐藏，重试沿用原批次，过期 attempt／取消不能提交，最终统一揭示。T06 原七项隔离测试通过 |
| 评价与保存资格 | 评分失败不覆盖收益、回撤和交易事实；valid／invalid／test_valid／test_invalid 在实验已完成且已揭示后均可采纳；来源、定义哈希和未完成状态门禁保留 |
| 正式版本与采纳事务 | 正式版本、OptimizationAdoption 和候选 adoptedStrategyVersionId 同事务提交；正式版本保存 source.kind=experiment 及 referenceId；每个候选只发布一次；V2／V3 响应均支持 |
| 多次采纳与手工发布 | 同实验最新已采纳版本按版本号选择；后续候选读取实际当前正式版本；手工与采纳共用策略事务锁，稳定版本冲突和幂等行为的隔离验证通过 |
| 提交后的响应恢复 | 事务提交后附加上下文／监控／风险差异读取失败仍返回已提交核心回执；API client 只读核对实验、候选和哈希，不自动再次写入；原八项恢复测试通过 |
| 版本回链 | 服务端精确匹配基线或采纳目标版本，EXISTS 避免重复计数；Desktop 不再排除 discovery 或二次按基线过滤；无关版本、显式来源过滤与版本切换迟到响应均有通过证据 |
| 页面状态 | 同一实验内最新版本选择正常；跨实验的局部回执隔离存在本报告 F1，未通过 |
| Mobile | 源码复核当前公共资格规则、持久化原采纳意图、只读恢复和版本导航；本次没有原生编译、真机或浏览器验收，不将源码结论扩展为设备验收 |
| 旧入口 | StrategyOptimizationWorkspace 当前仍没有可达路由消费者；其按基线或零推导确认版本的旧逻辑不能作为当前用户流程缺陷，也不能重新启用而不做迁移 |

## 本次实际验证

所有命令从主仓执行，使用已安装依赖；没有调用模型或真实 Provider。

| 范围与命令 | 结果 | 日志 |
| --- | --- | --- |
| Desktop 定向原回归：pnpm --filter @thesis-ledger/desktop exec vitest run test/strategy-experiment-detail.test.ts test/strategy-version-records.ui.test.tsx test/market-experiment-recovery.ui.test.tsx src/features/strategy/strategy-experiment-detail.model.test.ts | 4 文件、32 项通过 | /tmp/review-20261115-experiment-desktop.log |
| API Client 恢复：pnpm --filter @thesis-ledger/api-client exec vitest run test/optimization-adoption-recovery.test.ts | 1 文件、8 项通过 | /tmp/review-20261115-experiment-api.log |
| Server 采纳、读取、事实、评价、并发、发现及恢复：pnpm --filter @thesis-ledger/server exec vitest run，限定本节日志所列八文件 | 8 文件、48 项通过 | /tmp/review-20261115-experiment-server.log |
| COMPLETED_ADOPTION_POSTGRES=1 ADOPTION_CONSISTENCY_POSTGRES=1，执行原 completed-adoption 与 adoption-consistency 两文件 | 2 文件、11 项通过，无跳过 | /tmp/review-20261115-experiment-isolated.log |
| RUN_STRATEGY_CENTER_T06_POSTGRES=1 node scripts/test-ai-provider-postgres.mjs test/strategy-optimization/strategy-center-t06-postgres.integration.test.ts | 1 文件、7 项通过，无跳过 | /tmp/review-20261115-experiment-finalization.log |
| 新增受控缺陷复现 | 1 文件、1 项稳定观察到 F1；不计作产品修复验收 | /tmp/review-20261115-experiment-state-isolation-final.log |

原测试合计 106 项通过，其中隔离持久化 18 项；新增缺陷复现另列。没有重复全仓构建或原十分钟期限测试，前轮证据不受本次只读审查影响。通过的既有测试没有覆盖本报告 F1，不能据此断言完整流程无缺陷。

## 数据和验证边界

- 隔离采纳套件使用仓库维护的 startIsolatedNavPostgres；T06 使用维护的 test-ai-provider-postgres.mjs。均以临时、唯一名称的 PostgreSQL 实例和当前迁移链执行，不连接原业务数据库。
- 原正式版本、采纳关系和业务表未写入；没有调用真实采纳接口、模型、Provider 或通知，没有部署、业务服务重启、暂存、提交或推送。
- 本次没有访问目标业务运行态；没有将受控样本结论冒充真实运行态或真机验收。审查期间相关流程源码无新增变动，验证适用于本次读取的源码。
- 最后只读容器核对已无本次隔离资源；保留全部原业务容器。临时缺陷复现已移出工作区，既有业务代码和测试未修改。git diff --check 通过。
