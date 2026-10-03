# E01-N1.2 NAV 冻结产物与读取校验

## 范围与结论

2026-09-30 完成独立 NAV 资产冻结与离线读取适配器。使用真实本地文件和 Zstd Parquet，来源响应、发布时间记录和独立日历采用受控测试数据。本叶尚未接通 Run 创建、Provider 准入或 Worker 执行，N1.3、N2、N3、N4 继续保留各自验收。

## 实施内容

- `packages/schemas/src/backtest-nav-freeze-v3.ts`：Manifest 必须引用净值和上下文两份产物；事实及日历可见性按微秒核验，拒绝缺少上下文的旧格式。
- `apps/server/src/backtest/backtest-nav-freeze-validation.ts`：保存策略、配置、模型、独立日历及来源响应原文；发布时间记录必须属于冻结响应，并与基金身份、估值日、净值、发布时间及记录摘要一致。读取时重新计算 N1.1 计划并核验覆盖。
- `apps/server/src/backtest/backtest-nav-snapshot-store.ts`：沿用现行物理产物格式，验证字节摘要、Manifest 摘要、净值行和上下文。最终 Manifest 独占发布；相同输入幂等，不同输入拒绝覆盖；写入失败只清理本次创建的产物。冻结使用调用时的输入副本，拒绝非法路径和已有其他构建。

## 验证记录

| 检查 | 命令或输入范围 | 结果 |
| --- | --- | --- |
| Schema 定向 | `pnpm --filter @thesis-ledger/schemas exec vitest run test/backtest-nav-freeze-v3.test.ts` | 5/5 通过 |
| NAV 定向 | `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/backtest-nav-snapshot-store.test.ts test/backtest/backtest-nav-input-plan.test.ts` | 40/40 通过，其中冻结读写 24 项、计划 16 项 |
| Schemas 包级 | `pnpm --filter @thesis-ledger/schemas test` | 556/556 通过 |
| Server 包级 | `pnpm --filter @thesis-ledger/server test` | 1766 通过、83 跳过；254 个文件中 229 通过、25 跳过 |
| 类型与构建 | Schemas build；Server typecheck/build | 通过 |
| 样式 | 本叶六个源码/测试文件的 ESLint、Prettier check | 通过 |
| 依赖边界 | `node scripts/check-boundaries.mjs` | 通过 |

首次包级检查与构建并发时，三个既有场内 Runner 测试触发默认 5 秒超时；最终源码稳定后单独重跑 Server 全包通过，未提高超时或修改既有测试。最终 Server 类型、构建及样式门禁在最新冻结输入副本修复后执行。

负例覆盖缺净值、负净值、记录缺失/重复、错误发布时间、来源响应不匹配、日历不足/摘要不符、微秒未来事实、两类 Parquet 篡改、产物缺失、旧格式、错误 Run/模型摘要、更新摘要后内容仍不一致、并发冻结、已有其他构建以及调用方异步修改输入。

## 验收边界与后续

本叶证明当前合同下的产物自洽、原文绑定和可离线复核；受控记录不证明真实来源具有历史发布时间或 PIT 资格。进程崩溃后遗留锁/孤立产物恢复、跨资产 Run 创建与状态转换由 N2 接线阶段处理；本次失败清理验收针对进程内写入失败。

下一叶 N1.3 将已校验的冻结净值和模型转换为既有申赎 Domain 内核输入，检查金额、份额、日期、可见性及费用映射。
