# S05 旧 Reader 历史截点微秒精度

## 问题与范围

`validateMarketHistoryRead` 原用 `Date.parse` 毫秒比较显式 `asOf`、来源观察、Bar 原时间和 `availableAt`。固定快照与严格 PIT 的晚一微秒事实均可能被判为截点内。`MarketBarReader.validateHistoryRequest` 还用 `Date.parse` 初筛，真实日历上不存在的日期可在访问策略、缓存或远端之后才被拒绝。该行为违反 Spec §6 的显式历史截点与真实可用时间要求。

本叶只复用已有精确证据瞬时比较器，保留现有历史类型、失败原因和源时间原文。它不生成重建证据，不改变 V1/V2 快照、业务依赖计划或目标 HiThink 路由。

## 验证

- 修前两种历史模式的晚一微秒来源观察测试均误报 `accepted: true`；无效 `2025-02-30` 截点先进入数据读取再拒绝。修后来源观察、Bar 时间和 Bar 可用时间的晚一微秒反例均拒绝，非法截点在策略、远端和存储调用前拒绝。
- 历史模式与 Reader 边界 2 文件 **32 passed**；相邻 Reader 5 文件 **48 passed**。Server `typecheck`、`build`、限定 ESLint 通过；Server 全包 **1795 passed、90 skipped**。数据库条件测试仍按原条件跳过，不把本次全包当作隔离 PostgreSQL 验收。
- 三个小文件限定 Prettier 通过；已有 790 行的 `market-bar-reader.ts` 仅改精确 import 和前置判断，未为格式检查整体重排。带 `GUARDRAIL_BASE_REF=HEAD` 的尺寸 ratchet 通过，保留 13 条未增长的存量警告；`git diff --check` 通过。

官方 `./scripts/sync-code.sh thesis-ledger` 再次成功，目标 Server/独立 Worker 均为 running/healthy。两容器的 `market-history-mode.js` 与 `market-bar-reader.js` 摘要分别与宿主构建产物一致：`951c60cb6958e5d1f27de81bf0cced7f907e962b22c751b814c758206ba53dfb`、`d8d9387afed797dd14b45b588a92e4603323fb46d0d3da7c5372eec4131f3cc7`。镜像 ID 仍为 `sha256:82037ac5d35693827d679fc9d8b9341fc52cf13116f28a7095a38660b9a31f9b`；快更只存在于容器可写层，重建后会消失，不能当作镜像发布证明。

真实历史日历、同期归档、来源修订及 `G0-H-target`、`G-Run` 继续开放。未发起新的 Provider 请求或正向回测。
