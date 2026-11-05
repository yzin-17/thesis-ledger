# S05 决策窗口按市场交易日绑定 Bar

日期：2026-09-28。状态：本地修复完成；严格历史 PIT 资格仍未取得。

## 边界与原因

BarSeries V3 的完整窗口合同按市场时区计算交易日，S05 决策窗口原以 `bar.timestamp.slice(0, 10)` 查日历。`2026-05-17T16:00:00Z` 对应上海 `2026-05-18`；即使日历和声明绑定均为 5 月 18 日，旧实现仍查找 5 月 17 日并返回 `missing-successor`。这是合法输入的错误拒绝，不涉及放宽历史来源或日历准入。

写集仅为 Server `market-pit-decision-window-calendar-v3.ts`、`market-pit-decision-window-v3.ts`、`market-pit-decision-window-v3.test.ts` 及本证据和主 Task。三份源码/测试在当前工作树均为未跟踪 WIP；未暂存、提交或重置其它改动。最初怀疑的共享日历 `knownAvailableAt/acquiredAt` 毫秒比较已被同一 Schema 的精确引用校验覆盖，未据此修改源码。

## 实施与验证

- 新增合成 UTC 前一日 Bar 反例，日历声明交易日为 2026-05-18。修前定向测试失败，实际原因 `missing-successor`。
- 决策窗口使用经严格证据瞬时解析后的 `Asia/Shanghai` 当地日期，与 BarSeries V3 的交易日合同一致；原始 Bar 时间、`decisionAt`、来源归档和日历原文均未改写。日历模块仍只接受现有固定 UTC+08 模型。
- `rtk pnpm --filter @thesis-ledger/server exec vitest run test/market/market-pit-decision-window-v3.test.ts`：43 passed；包含既有错交易日、后继缺失、日历模型及截点拒绝反例。
- 相邻内容绑定与日历互操作两文件：22 passed、6 skipped。6 项依原有环境条件跳过，不计为通过。
- `rtk proxy pnpm --filter @thesis-ledger/server typecheck`、`build`：均退出 0。限定三文件 ESLint、Prettier 通过；测试文件首次 Prettier 仅指出新增函数声明换行，修正后通过。五份本叶源码、测试与文档逐行检查无尾随空白；`git diff --check` 退出 0，但当前相关文件未跟踪，不能用它单独证明这些文件的空白质量。
- `GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs`：通过，保留 13 条存量尺寸警告。未运行 DSA 官方全包、目标 Docker、真实 Provider、普通 Run、AI 或 UI。

当前三文件 SHA-256 依次为 `8612a7bcf54d3c0ab6c54d37fc443e7deda5d07b3e67ee642d5fa49706fd1892`、`5029a6331b3b7d7ea717f93ed0540532c8783456a4064c09b53492ac8f96ff96`、`427461a2cb3265b0556222239a3bd40816fab842ea4419867ac4a4ec321fd203`。本地精确日期修复不能证明 XSHE 完整历史日历、持续场所、来源修订或同期归档；S05 父项、G0-H、G-Run 与完整 AC01–AC20 保持开放。
