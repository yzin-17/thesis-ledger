# S05 共享重建清单瞬时精度修复

## 缺口与改动

`packages/schemas/src/market-pit-reconstruction-manifest-validation-v3.ts` 在清单 Bar 引用与原响应比对，以及来源观察/逐 Bar 时间相对冻结截点的必要绑定中，曾使用 `Date.parse` 的毫秒精度。新增受控反例修前确认三种误接收：归档 Bar 引用比响应晚一微秒、来源观察晚于 `dataAsOf` 一微秒、Bar `availableAt` 晚于截点一微秒，均错误返回 `bound`；同瞬时明确 `+08:00` 偏移的正例通过。

现复用 Schema 既有 `compareMarketPitEvidenceInstantStringsV1` 比对引用瞬时和截点。相差一微秒拒绝，非法/未知瞬时比较结果 `undefined` 也拒绝；等价时区仍接受。公共合同字段、v1/v2 版本和原失败分类不变，分别保持 `bar-archive-mismatch` 与 `future-fact`。本次不修改 Server 内容映射或最终历史资格编排。

## 验证

- 新精度反例：修前 3 failed、1 passed；修后 4 passed。
- `market-pit-reconstruction-v3.test.ts` 与相邻 v2 精度测试：68 passed；当前 Schema 全包 45 文件、550 passed。格式修正后按当前测试文件重跑全包。
- `pnpm --filter @thesis-ledger/schemas typecheck`、`build` 与 `pnpm --filter @thesis-ledger/server typecheck` 退出 0；Server 归档内容 v1/v2 两文件 43 passed。
- 两个改动文件 ESLint 通过。Prettier 首次仅新参数化测试换行失败，手工修正后唯一重试通过；限定尾随空白、`git diff --check`、`node scripts/check-boundaries.mjs` 和带真实 `HEAD` 的文件尺寸 ratchet 通过，尺寸门禁仍报告 13 条存量警告。

这些测试证明当前本地清单必要绑定的精度和相邻消费者兼容，不证明归档原文、XSHE 历史场所、供应商历史修订、真实目标容器或严格 PIT 最终资格。生产构建产物仅为本地验证，未执行目标同步。
