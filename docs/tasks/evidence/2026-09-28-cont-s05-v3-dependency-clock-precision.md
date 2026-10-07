# V3 非价格事实时钟精度

## 修复范围

`backtest-snapshot-v3-dependency-response-checks.ts` 原用 `Date.parse` 判断 Calendar、标的和公司行动事实的 `availableAt` 是否晚于 `dataAsOf`。`backtest-snapshot-v3-calendar-alignment.ts` 原用毫秒比较证明标的事实发生在首个执行开盘前。两处都可把同毫秒晚一微秒的事实误判为相等。

现在复用 Schemas 的精确证据瞬时比较器：非价格事实通过 V3 冻结截点 helper 判断；期初适用性比较 `occurredAt` 与实际 `openedAt`，非法时间或晚到事实失败关闭。响应字段、来源与日历证据未改。红例分别在修前错误返回完整依赖或通过日历对齐，修后拒绝；相邻依赖和完整快照 16 passed。

## 验证与状态

最终源码 Server `typecheck`、`build`、限定 ESLint、import boundary、`GUARDRAIL_BASE_REF=HEAD` 文件尺寸 ratchet、`git diff --check` 通过；Server 全包 1799 passed、90 skipped，尺寸门禁保留 13 条无增长存量警告。

限定 Prettier 首次报告源文件和两份测试文件；仅修本次源文件及新增完整快照用例后复查，`backtest-snapshot-v3-dependencies.test.ts` 仍有先存排版差异，整文件格式化会改动约 60 行 diff。按本任务一次局部修复预算记 `skipped_after_retry`，未覆盖用户其他 WIP；整个格式门禁不能记通过。

经 infra 官方 `./scripts/sync-code.sh thesis-ledger` 快更，Server/Worker 与 DSA healthy；非价格检查和日历对齐两份编译 JS 的宿主、Server、Worker SHA-256 相同。镜像保持原 ID，代码仅在容器可写层，重建后需重新正式更新。未运行真实完整快照或目标 159516.SZ 正向回测；`G0-H-target`、`D01-runtime`、`G-Deploy-159516`、`G-Run`、`G-UI-159516` 与 S05 父项保持开放。
