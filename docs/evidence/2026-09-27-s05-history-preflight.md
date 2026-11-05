# S05 历史协议预检时间边界证据

日期：2026-09-27。对应 `S05-v3-preflight`，依据 Spec §6、§9，AC09、AC12。本叶完成；S05 父项与全目标继续开放。

## 修复结果

实际 `preflightBacktestExecutionWindowV3` 原先在固定供应商快照分支只检查 Bar 时间，漏检 `sourcePriceBasis.observedAt` 与逐 Bar `availableAt`。这可能先返回就绪，随后被 Snapshot 冻结或研究时钟校验拒绝。

新增 Backtest 所有的独立 `backtest-history-input-v3.ts`，统一判断两种历史协议的冻结截点：来源观察、Bar 时间和逐 Bar 可用时间均不得晚于 `dataAsOf`。固定快照允许历史价格与较晚的研究观测共存，只要观测仍在冻结截点内；校验不改写任何来源时间、修订或价格。

严格 PIT 继续要求已识别序列、已知供应商修订；复权价格必须有可解析且不晚于截点的锚点。缺重建引用仍在 RunConfig 校验阶段拒绝。未知或未完成的 Bar 被既有 wire 关联校验拒绝，缺窗不推断为停牌，不补造交易状态。

诊断沿用共享合同中允许 `FUTURE_DATA` 的历史可见性类别。固定快照提示修复价格输入，严格 PIT 提示提供时点证据；没有改动诊断共享合同。原预检文件从 748 行减少到 677 行，新职责文件 76 行；测试文件 679 行。

## 本地验证

- 执行窗口预检 26 项通过，其中新增 12 项：固定快照未来来源观察、两种协议未来 Bar 可用时间、截点等时接受及响应不变、同一未知序列固定接受/PIT 拒绝、受控有效 PIT、未知/未完成交易状态、缺重建引用、未来价格、缺失/未来锚点。
- 预检、依赖、Snapshot 来源/输入计划、Reader/selector/冻结窗口及既有历史模式共 10 文件、87 项通过；26 项已包含在 87 项中，不重复累计。
- Server typecheck、build、定向 ESLint、模块边界、workspace 依赖与 diff check 通过。文件尺寸门禁保持 13 项既有警告；没有有效基线，不能据此宣称已有大文件债务完成治理。

首次定向执行有两项失败：固定快照新诊断选择的类别不允许 `FUTURE_DATA`。核对共享合同后沿用其既有历史可见性类别，第一次重试 26 项通过。没有调整错误码合同或关闭门禁。

日志：`/private/tmp/goal-s05-preflight-directed-retry1-20260927.log`、`/private/tmp/goal-s05-preflight-regression-20260927.log`、`/private/tmp/goal-s05-preflight-typecheck-20260927.log`、`/private/tmp/goal-s05-preflight-build-20260927.log`、`/private/tmp/goal-s05-preflight-lint-20260927.log`、`/private/tmp/goal-s05-preflight-boundaries-20260927.log`、`/private/tmp/goal-s05-preflight-workspace-20260927.log`、`/private/tmp/goal-s05-preflight-sizes-20260927.log`。

## 目标运行代码

通过相邻 infra 的官方 `./scripts/sync-code.sh thesis-ledger` 完成兼容预检、构建、同步及重启，Server/Worker 均 healthy。两端镜像保持 `sha256:f51e7f52e3ce141fa29517afae0005ff9c9c19d12009b0a6d8b3f4539ea49b7a`；同步只更新容器可写层，不证明镜像发布。

在两个目标容器分别导入生产预检入口，以受控 Reader 和严格共享合同夹具执行 10 个场景，每端均通过：固定接受、同源未知身份 PIT 拒绝、受控已识别 PIT 接受、未来来源观察拒绝、两种协议未来 Bar 可用时间拒绝、截点接受、未知交易状态拒绝、缺引用拒绝、未来价格拒绝。每次预检的读取次数为一，缺引用时为零；输入响应保持不变。

两端编译产物与本地摘要一致：

| 文件 | SHA-256 |
| --- | --- |
| `backtest-history-input-v3.js` | `4db5c9c4d4a3ae83293c5867672eedcb3a9c6516ea1d05e297c75c868d08520e` |
| `backtest-preflight-v3-execution.js` | `00e1ca32bfa29dbc0ec6c01d8282494150149eb52925ea2017a6d8262bb384dc` |

可复现探针：`/private/tmp/goal-s05-preflight-target-20260927.py`；日志：`/private/tmp/goal-s05-preflight-target-20260927.log`、`/private/tmp/goal-s05-preflight-sync-20260927.log`。探针不读写业务数据库、不创建任务、不调用外部来源或模型；其交易日与重建引用是受控夹具，不是实际来源/历史重建证据。

## 仍需完成

当前 `reconstructionEvidenceRef` 只经过非空校验并随协议冻结，尚未解析和验证实际证据内容、价格版本、来源/窗口及历史修订可见性的绑定。受控 PIT 就绪只证明现有时间/身份检查，不能证明真实历史重建。

旧 `MarketBarReader` 的 `asOf` 可回退到窗口结束时间，其历史辅助函数固定模式与 V3 冻结时钟尚未统一。本叶只改变 V3 执行预检，既有旧辅助函数回归通过不能用于关闭这项差异。

S05 仍需实际重建证据合同/读取/冻结与旧 Reader 时间语义核对；I01、真实来源、S08/Worker、浏览器/Electron 门禁各自保持开放。此前已耗尽重试预算的外部卡点继续保留跳过状态。全目标 active，下一步继续这些未完成叶或其他可独立实施的剩余任务。

后续更新：`S05-legacy-clock` 已完成实际旧 Reader 截点修复、本地/隔离 PostgreSQL 与目标受控验证，见 [旧读取证据](2026-09-27-s05-legacy-clock.md)。实际重建证据仍开放；新发现的日期窗口缓存缺口归 `S03-date-cache`，不以本预检叶关闭。
