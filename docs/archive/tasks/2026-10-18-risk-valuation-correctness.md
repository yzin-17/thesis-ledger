# 后台风险估值口径与完整性修复任务

> 日期：2026-10-18；全局优先级：**P0，第一批正确性修复**。状态：RVC0～RVC2 与 RVCG 全部完成；目标受控消费及 IR02 关闭对账于 2026-10-19 通过。
> [Spec](../../specs/2026-10-18-risk-valuation-correctness.md) · [优先级索引](../../tasks/README.md#priority-p0) · [IR02 证据](../../reviews/2026-10-18-starred-project-implementation-coverage.md#local-findings)。本页是 IR02 修复进度唯一入口。

## 现在做什么

RVCG 已在正式更新后的目标 Server 内通过实际 handler、Risk 规则/状态机、事件及持久历史链；覆盖混币等权、缺价/缺 FX 事件保护、陈旧/未来/未知输入、模式与 NAV。仅写独立数据库，通知不外发；原业务数据和快照保留。IR02 关闭，本主题无剩余实施叶。详细边界见[目标验收记录](../../tasks/evidence/2026-10-19-p0-target-acceptance.md)及[本地证据](../../tasks/evidence/2026-10-18-risk-valuation-correctness.md)。

<a id="rvc0"></a>
## RVC0：固定风险估值边界与反例

- [x] **RVC0：确认所有权、分母及受影响消费者。**
  - 依赖：无。只读 `automation-runtime.service.ts`、Risk 评估合同及 Market 估值/FX 入口，核对 `weight/accountWeight/dataQuality/missingSymbols` 的实际消费与通知分支。
  - 输出：允许写入路径、精确测试清单、比较币种/分母、现行不可用状态映射和 AC1～AC5 的证据缺口；不导出凭据。
  - 完成：原位消除合同歧义，保留现行账户/模式与持仓市值分母；未覆盖调用方阻止对应代码派发。

<a id="rvc1"></a>
## RVC1：修复估值上下文与规则输入

- [x] **RVC1：统一金额口径并传播分层完整性。**
  - 依赖：RVC0。写集限于 Automation 扫描编排、Risk 所有的上下文/纯计算、必要共享合同及对应测试。
  - 完成：复用既有 Market 价格/NAV/FX；缺失不按零或 1:1；依赖权重的规则不可用，独立有效规则保留；不增加反向模块依赖。
  - 验证：RVC-AC1～AC3 的合成经济输入、模式/账户隔离和原同币种行为；新增失败用例先证明旧路径问题，再验证修复。

<a id="rvc2"></a>
## RVC2：验证真正的扫描消费者

- [x] **RVC2：完成 handler、规则与诊断受控联通。**
  - 依赖：RVC1。执行真实业务模块，仅价格/FX/通知传输受控，不 mock 掉权重与完整性判断。
  - 完成：RVC-AC4 通过；不可用不清除已有风险、不产生误导性事件或实际通知。同步必要客户端质量文案，不重做全站视觉。
  - 验证入口：`pnpm --filter @thesis-ledger/server exec vitest run test/automation-runtime.test.ts test/automation/automation-runtime-foundations.test.ts`；RVC0 确认的新增专用测试另列。定向通过后才跑受影响包和边界。

<a id="rvcg"></a>
## RVCG：目标消费与关闭

- [x] **RVCG：完成独立目标验收及 IR02 关闭对账。**
  - 本轮执行范围：用户已授权按优先级进行三个 P0 目标验收及正式脚本更新，保留现有数据，真实模型暂停。沿 infra `scripts/p0-target-acceptance.mjs` 固定目标 Server/Worker 身份及编译指纹，使用专属临时 PostgreSQL 执行实际 handler、规则、事件与历史读链；外部行情/FX/NAV 为明示受控输入，通知只捕获，不外发。原业务数据库与快照在正式更新前后独立对账。
  - 依赖：RVC2、目标输入/来源权限与明确验收范围。使用正式 infra 更新入口；必要脚本缺失时先补正式可复用入口，不直接操作容器。
  - 完成：RVC-AC5 及全部原反例有证据；不修改用户持仓/规则，不投递外部通知。目标来源不足只阻塞本门禁，不能把受控通过写成真实来源通过。
  - 已通过：目标候选 883 个当前源码对应产物一致，六组实际消费结果通过；更新前后及验收后保留对账通过。受控来源不获得真实来源资格，外部投递与模型调用均为 0。见[目标证据](../../tasks/evidence/2026-10-19-p0-target-acceptance.md#rvcg目标风险消费)。
  - 归属：风险侧 [Market Consumer](../../tasks/2026-10-09-unified-data-capability-adapter.md#market-consumer-acceptance) 引用本页匹配结果；T19 的风险预览和 UI T3 仅接续受影响断言。

## 验收映射与执行记录

| 断言 | 责任 |
| --- | --- |
| RVC-AC1～AC3 | RVC0/RVC1 |
| RVC-AC4 | RVC2 |
| RVC-AC5 | RVCG |

本地 14 项新增估值回归、共 86 项受影响定向测试与 Server 类型检查通过；原三条反例先失败后通过。最终合流的 Server 40 文件 433 项、正常构建、边界与依赖检查通过；全仓 lint 的既有三处错误保留。RVC2 的三个真实存储场景与 RVCG 独立目标门禁分别通过，未用本地测试代替目标消费。命令、写集与限制由[本地证据](../../tasks/evidence/2026-10-18-risk-valuation-correctness.md)和目标验收记录维护。
