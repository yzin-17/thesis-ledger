# S07 非价格依赖预检

## 实现范围

新增 `backtest-preflight-v3-dependencies.ts`，按现有依赖计划读取日历、证券事实和按需公司行动。依赖请求生成、响应验证、事件能力读取及整体事件计划检查与 Snapshot 冻结共用，收集器抽出单项读取函数，未改变原冻结路径的失败条件。

每项失败转为既有 V3 结构化诊断，保留用途、标的和请求范围，附稳定缺口字段与下一步建议。多个独立请求失败一次返回；底层异常文本不进入诊断。未来事实使用 `FUTURE_DATA`，固定价格快照不会豁免其可用时间约束。无法确定的来源及精确事件 RouteKey 保持空值，不从执行行情来源推断。整体事件计划失败不错误归属到第一项事件请求。

本入口只返回非价格诊断，不提供全局 `ready` 或创建凭据，也不写文件、创建 Run、生成第二份 Snapshot、运行绩效或调用 AI。空诊断只说明本次非价格检查通过。HTTP 接入、执行行情联合结果、全依赖能力级诊断完善及消费合同仍由 S07-api 承接。

## 验证

- 定向测试：新增 6 项覆盖正常归一化策略无额外事件读取、多项失败及异常脱敏、缺证券事实、未来日历事实、事件读取能力缺失、策略与计划错配在网络读取前拒绝。
- 组合回归：`rtk proxy pnpm --filter @thesis-ledger/server exec vitest run test/backtest/backtest-preflight-v3-dependencies.test.ts test/backtest/backtest-snapshot-v3-dependencies.test.ts test/backtest/v3-create-retry-integration.test.ts`，34 项通过。覆盖既有事件冻结、完整性检查、实际本地 Snapshot Builder 与离线创建/重试行为。日志：`/private/tmp/goal-s07-dependency-integration-20260927.log`。
- Server `tsc --noEmit` 通过；三个新增/修改源码及测试文件的定向 ESLint 通过。日志：`/private/tmp/goal-s07-dependency-types-20260927.log`、`/private/tmp/goal-s07-dependency-lint-20260927.log`。

验证基线为当前未提交工作区。测试使用来源端口替身，未访问真实 Provider、修改目标数据库或部署。S07 父项及相关真实运行态门禁继续开放。
