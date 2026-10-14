# 停复牌 Server 读取与独立冻结接缝验收

对应 [Task P5.3a](../../archive/tasks/2026-10-06-historical-rules-primary-backup.md) 和 [Spec](../../specs/2026-10-06-historical-rules-primary-backup.md)。本叶完成本地读取、收集和产物解析；快照创建、撮合约束、结果页及目标运行仍由 P5.3b／P5.4 验收。

## 已交付行为

- `DsaClient.marketTradingStatusV3` 复用现有 Data Token、期限及传输；正式入口为 `/api/v3/thesis-ledger/market/trading-status`。解析器绑定 requestId、精确目标、标的、区间及来源身份，拒绝错绑和不完整日分区。
- 独立收集器仅接受已有执行模型的 CN STOCK 普通固定来源研究配置；整段执行区间请求一次。主源成功不双读，unknown 不触发逐日补读；失败才尝试已配置且 eligible 的备用。
- 状态以 `frozen-trading-status-v1` 冻结，产物位置为 `metadata/trading-status-v3.parquet`。原 RunConfig、执行模型和价格协议不改写。冻结内容绑定原 RunConfig 校验和，实际响应另核对执行标的与窗口。
- 无读取能力、未配置路由、控制面失败或来源均不可用时，记录 `notIncluded` 与原因，沿用已选普通研究假设，不生成已确认正常状态。适用范围外及 point-in-time 配置不请求该未验证来源。
- 产物解析不接收 DSA；无可选引用的旧快照返回原路径，不补字段。已有 Parquet store 负责文件哈希校验；同一产物两次读取完全一致。

实际状态样本沿用 P5.1 的生产包响应：`000995.SZ`、`2023-08-16..2023-08-21`，08-17 suspended、08-18 trading，其余 unknown，历史首次可见时间仍为 notVerified。共享 fixture SHA-256 为 `32705ae45c82fce314f55da1dc398ad052105b2e06fd5e571f3996630e84f6e3`；来源核验见 [P5.1 证据](2026-10-06-trading-status-source.md)。本次不重新查询外部数据。

备用测试使用不同身份的模拟备用响应，只证明配置后的整窗选择算法；当前停复牌生产源仍只有首批官方公告包，不宣称已有第二个真实备用来源。测试以真实公告状态样本和合成运行配置配合临时 Parquet 文件，不是一次完整回测。

## 验证记录

| 检查 | 命令／输入范围 | 结果 |
| --- | --- | --- |
| Schema 定向 | `pnpm --filter @thesis-ledger/schemas exec vitest run test/backtest-trading-status-v3.test.ts test/market-trading-status-v3.test.ts --reporter=dot` | 2 文件／13 项通过 |
| Server 定向及原传输回归 | `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/trading-status-snapshot-v3.test.ts test/integration/dsa-trading-status-v3.test.ts test/integration/dsa-public-fees-v3.test.ts test/integration/dsa.client.test.ts --reporter=dot --maxWorkers=2` | 4 文件／33 项通过 |
| 最终独立能力回归 | 上述两个停复牌 Server 文件，`--maxWorkers=2` | 2 文件／16 项通过；模拟备用修为独立身份后复核 |
| Schema 包级 | `pnpm --filter @thesis-ledger/schemas test --reporter=dot` | 65 文件／722 项通过，退出 0 |
| Server 包级 | `pnpm --filter @thesis-ledger/server test --reporter=dot --maxWorkers=2` | 303 文件／2,463 项通过；47 文件／217 项按环境跳过，不计运行验收；退出 0 |
| 静态及构建 | Schema／Server 各自 `typecheck`、`build` | 全部通过；无数据库升级或目标服务更新 |
| 局部代码检查 | 本叶源码、测试与 Schema barrel 的 ESLint；本叶文件及 Spec／Task 的 Prettier、`git diff --check` | 通过 |
| 仓库结构检查 | `node scripts/check-boundaries.mjs`；`node scripts/check-workspace-dependencies.mjs` | 通过，未修改门禁规则 |
| 文件尺寸检查 | `node scripts/check-file-size-guardrails.mjs` | 退出 0；9 个未提供基线的既有超限文件提示，未据此宣称其 ratchet 已核验。本叶新增文件均未超限，Client 为 592 行 |

全包检查时源码已经稳定；随后仅将备用测试夹具改为独立来源身份，最终定向回归再次通过。格式检查和构建在最终文件状态下通过。DSA、Domain、客户端业务源码未改，沿用对应已完成叶的检查，不重复全量验证。

## 后续接入边界

P5.3b 需将可选引用、artifact writer 与新建快照收集接入 Builder，并由 Runner 按当前日期把已知停牌传给现有 suspended 约束；unknown 不改为正常，不提供替代价格，不把未来复牌日期交给策略。已 finalized 快照在任何收集之前复用，不回填状态或基准版本。

B2 的 `benchmarkCostVersion='execution-model-cost-v1'` 及缺字段时的旧基准语义保留。B3 仍在写结果说明、诊断和测试，本叶未写这些共享文件。执行／页面接入须等共享写入窗口释放，再完成其定向和受影响包验证；目标更新及真实运行继续由 P5.4 单独验收。

本轮开始有 629 个主仓 dirty 路径，全部在途工作保留；只追加本叶源码、合同、测试和文档，不提交、不推送、不改数据库／路由／目标服务。P5.3a 本地完成，P5.3 父任务未完成。
