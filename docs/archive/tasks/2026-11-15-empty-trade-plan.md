# 空交易计划执行等价修复任务

规格：[空交易计划](../../specs/2026-11-15-empty-trade-plan.md)。

## 当前状态

已完成并归档。统一有效计划判断、本地回归和正式运行态均通过；原 v3 不变，新增回测 `becd48cb-c24a-4a63-8096-3cc873ec82a5` 成功，完整 RunConfig、282 条冻结行情及可比指纹一致。首笔数量恢复普通参考价，全部成交与既有 v2 一致；旧记录摘要保持不变。未新增 AI 调用或行情冻结。证据见[验证记录](../evidence/2026-11-15-empty-trade-plan.md)。

## 执行清单

- [x] T1：Domain 统一有效计划判断，Server 仓位／输入与 Domain 执行／说明一致消费；空壳不启用，阶段及全部显式功能继续启用（AC1）。
- [x] T2：开盘跳空下冻结 Runner 结果等价，Domain 905 项、Server 定向 4 项及相关门禁通过；并行测试类型修正后，正式快更重新构建通过（AC2）。
- [x] T3：infra 正式快更退出 0，Server／Worker 均健康；两端四个实际修复模块与宿主机构建摘要一致，空计划关闭、有效止损计划启用；镜像和数据库结构未变（AC3）。
- [x] T4：原 v3、同一完整 RunConfig／冻结行情新增回测成功；29 笔成交逐笔方向与风险验证通过，首笔数量恢复，原 6 个版本、12 个回测及实验／AI 操作摘要保持不变（AC3、AC4）。

## 执行输入与保护

实现入口为 `backtest-trade-plan-contract.ts`、`backtest-engine.ts`、`backtest-trade-plan-display.ts`、`backtest-strategy-plan-readback.ts`、`backtest-exchange-sizing.ts` 和 `backtest-trade-plan-execution.ts`。定向测试随对应领域维护，真实核验工具位于 `scripts/local-runtime/empty-trade-plan-replay.mjs`。证据独立保存到 `docs/archive/evidence/2026-11-15-empty-trade-plan.md`。

原运行 `9c7efea9-9242-494b-8bec-cef825ed4b1d`、策略版本 `893ddc7e-1e8e-4f4d-a4a5-6668d340b097` 只读。正式预检不通过时先分析，禁止伪造准备凭证或重新冻结来冒充同一输入。测试先局部、再相关包与构建、再正式运行态；高成本通过结果在输入未变时复用。并行功能的失败单独记录，不扩大修改范围。

## 规划复核

任务获得实现授权，职责与验收分为代码、本地语义、部署和冻结业务结果四项。未更换 Provider、增加模型调用或重新冻结；最终复核确认全部 AC 有对应证据，失败历史保留，说明文档为中文，旧记录不变后归档。Spec 作为有效行为合同继续保留。
