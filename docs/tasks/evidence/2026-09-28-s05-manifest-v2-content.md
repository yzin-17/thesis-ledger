# S05：v2 清单归档内容必要门禁证据

## 范围与公开契约

依据 Spec §6，归档内容入口改用 `bindMarketPitReconstructionManifestV3`，其 `archives-bound.proof` 类型由 v1 扩展为 `MarketPitReconstructionManifestV3`（v1/v2 联合）。函数名称、入参、错误原因与原归档校验次序保持不变，v1 binder 本身未修改。

仍实际读取不可变完整归档并核对身份、完整响应摘要、派生序列版本、精确来源与价格坐标、请求窗口、逐 Bar 全字段及冻结截点。v2 历史区使用 Schemas 既有结构核验，未生成任何价格或归档。内容结果仅为 `archives-bound` 或 `unavailable`；来源时钟必要链可以继续返回 `source-times-bound`，这些结果均不授予 `historical-window-bound` 或运行 `ready`。

## 文件与摘要

- 修改：`apps/server/src/market/market-pit-reconstruction-content-v3.ts`，106 行至 154 行（含现有代码格式化）。
  - 修改前 SHA-256：`2eec68a04dba0aad5e7672db18f6b70b17e7d8db1d84ffd56dabf452c142d5da`
  - 修改后 SHA-256：`e831152a1338ce7633a6c8163670b144e663585f9e5e5e0c295c7eab6bb7f768`
- 新增：`apps/server/test/market/market-pit-reconstruction-content-v2.test.ts`，175 行。
  - 修改前：不存在。
  - SHA-256：`4ded0b45e66cee1649aac37247698e9088892bd0c218e132fdd028c7a6d90aea`
- 新增：本文，修改前不存在。

业务测试复用既有 repository fixture 与真实归档创建、读回、身份派生逻辑，仅数据库端口替换。新增历史区是结构必要证据，不是真实合格日历或发布资料；未修改原 fixture 或其他模块。

## 验证

- [x] 在 `apps/server` 执行 `pnpm exec vitest run --cache=false test/market/market-pit-reconstruction-content-v2.test.ts test/market/market-pit-reconstruction-content-v3.test.ts test/market/market-pit-reconstruction-source-times-v3.test.ts test/market/market-pit-reconstruction.repository.test.ts test/backtest/backtest-reconstruction-preflight-v3.test.ts`：5 文件、67 项通过，其中新增 12 项。
- [x] `pnpm --filter @thesis-ledger/server typecheck`：通过，仅 `tsc --noEmit`，未构建。
- [x] 对上述两个源码/测试文件执行 `pnpm exec eslint … --rule 'complexity:[error,20]' --rule 'no-nested-ternary:error' --rule 'max-lines-per-function:[error,{max:220,skipBlankLines:true,skipComments:true}]' --max-warnings 0`：通过，无警告。
- [x] 对上述两个源码/测试文件执行 `pnpm exec prettier --write …` 完成格式整理；最终 `prettier --check` 与限定路径 `git diff --check` 通过。
- [ ] 未执行全包测试、全仓门禁、build、Provider、数据库、Docker、浏览器或真实历史资格验收；此任务的定向单元测试不可替代这些层级。

新增覆盖 v2 完整归档绑定与来源时钟后继链、精确输入/RouteKey 目标错配、摘要/完整 Bar/来源坐标/抓取截点/缺归档、历史引用不一致与决策时点错配，以及 v1 回归。原 v1 内容、来源时钟、repository 与生产 preflight 定向用例同时保留通过。
