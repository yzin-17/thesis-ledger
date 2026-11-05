# V3 执行窗口精确时钟修复

## 问题与修复

旧 V3 执行预检及快照重放使用 `Date.parse` 的毫秒比较，晚于冻结 `dataAsOf` 一微秒的来源观察、Bar 可用时间或多窗口完成时间可能被判为相等；预检和冻结还未核对 Reader 服务端 `evidence.fetchedAt`。这会让必要时间条件误通过，尽管不单独授予来源准入。

执行预检在 `backtest-history-input-v3.ts` 改用 Schemas 的 `compareMarketPitEvidenceInstantStringsV1`；共同的 `backtest-v3-evidence-clock.ts` 将非法时间与晚于截点的时间统一失败关闭。历史预检 helper 的 `fetchedAt` 输入在类型上必需，预检与冻结都传入 Reader 的实际抓取时刻；离线重放核对窗口 `fetchedAt`、来源观察、逐 Bar 原时间/可用时间和多窗口完成时间。原时间字符串及失败分类保持，迟到抓取返回 `FUTURE_DATA/evidence.fetchedAt`。旧固定快照测试的有效抓取时刻维持在相应截点内；严格 PIT 的历史窗口测试使用合成同期抓取时刻，不能将合成测试视为真实历史资格。

## 本地验证

- 修复前：来源观察和 Bar 可用时间晚一微秒的两个预检新例均错误返回 `ready`；离线 Bar 同毫秒晚一微秒用例错误通过；晚于截点的抓取在预检返回 `ready`，冻结到最终重放才失败。
- 修复后：`backtest-preflight-v3-execution.test.ts` 31、`v3-snapshot-builder.test.ts` 5、`v3-multi-window-snapshot.test.ts` 1，合计 37 passed；相邻重建预检 7 passed，合计 44。连同非价格事实相邻 16 项，最终源码定向 60 passed。最终源码的 Server 全包 229 文件通过、25 文件跳过，1799 passed、90 skipped。
- Server `typecheck`、`build`、限定 ESLint、import boundary、`GUARDRAIL_BASE_REF=HEAD` 文件尺寸 ratchet、`git diff --check` 退出 0；ratchet 有 13 条存量尺寸警告，均未增长。
- 限定 Prettier 首次报 5 文件；仅修本次源码和一份测试的排版后复查，仍有 `backtest-preflight-v3-execution.test.ts`、`v3-multi-window-snapshot.test.ts` 两份测试文件因原有大段排版未通过。两文件本身属于先存用户 WIP，整文件格式化将改动约 256/242 行 diff，故在一次局部修正后按预算标记 `skipped_after_retry`，没有批量改写。不能把整个格式门禁记为通过。
- 经相邻 infra 官方 `./scripts/sync-code.sh thesis-ledger` 快更，Server 与 Worker healthy；五份关键编译 JS 的 host、Server、Worker SHA-256 逐项相等。镜像 ID 保持 `sha256:82037ac5d35693827d679fc9d8b9341fc52cf13116f28a7095a38660b9a31f9b`，更新仅在容器可写层，容器重建后消失。
- 这些是源码、合成夹具与目标编译产物就位证据；没有目标 Docker 同版本完整重放、真实 Provider、严格 PIT 原文或 159516.SZ 正向回测结果。

## 状态

`G0-H-target`、`D01-runtime`、`G-Deploy-159516`、`G-Run`、`G-UI-159516` 保持开放。HiThink ETF 量额单位的官方 REST 字段表仍未明示，见[短窗核对证据](2026-09-28-cont-g0-h-159516-unit-and-split-crosscheck.md)。
