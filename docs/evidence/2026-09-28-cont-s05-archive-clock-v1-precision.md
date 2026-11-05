# S05 旧归档时钟瞬时精度

## 缺口与修复

Server 归档内容绑定的 v1 时钟分支原用 `Date.parse` 比较来源观察、逐 Bar 时间与冻结截点。真实仓库 fixture 中，归档来源观察晚于 `dataAsOf` 一微秒、抓取 `Date` 恰在毫秒边界时，修前错误返回 `archives-bound`。复用该模块已有的精确瞬时比较器后，v1/v2 均核验原始时间字符串；非法时间也失败关闭，沿用 `archive-future` 分类。原生 `fetchedAt: Date` 只保留其实际毫秒精度，不推造微秒。

相邻 v2 测试曾明确固定旧 v1 毫秒语义。本叶把该过时预期改为一微秒越界拒绝；不修改归档内容映射、Schema 合同或最终历史资格编排。

## 验证与限制

- 新 v1 红例修前 1 failed，修后 1 passed；相邻 v1/v2 内容测试首次 43 passed、1 failed（过时预期），定向更新后 44 passed。
- `pnpm --filter @thesis-ledger/server typecheck`、三个触及代码/测试文件 ESLint、文件尺寸 ratchet 和 `git diff --check` 通过；尾随空白检查无命中。尺寸门禁仍报告 13 条存量警告。
- 实现文件与相邻 v2 测试文件 Prettier 通过。v3 测试文件全文件 Prettier 初次及一次复试均失败；格式差异覆盖既有行，新例块本身无差异。未为通过此门禁而批量重排已有测试，局部门禁记为 `skipped_after_retry`，不宣称全量格式通过。

本地必要绑定修复不证明真实归档、历史来源修订、XSHE 场所、目标容器或最终 PIT 资格；本叶未请求 Provider，也未同步目标运行态。
