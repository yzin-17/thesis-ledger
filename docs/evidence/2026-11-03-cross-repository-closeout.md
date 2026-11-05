# 跨仓三项剩余记录证据复核

日期：2026-11-03（北京时间）。先按用户要求核对既有证据，能证明完成的直接收口，不重复验证；随后用户明确要求完成 D5，再执行该项真实补验。范围仅为腾讯周期窗口、Docker Desktop D5 和空 Docker 旧结果回归；任务状态仍由各自 Task 持有。

## 处置结论

| 项目 | 原剩余条件 | 既有证据与处置 |
| --- | --- | --- |
| DSA 腾讯周期窗口 | 后续统一镜像固化与归档 | 10-05 来源／消费与 10-20 DG2a 正式镜像证据完整；[任务归档](../../../daily-stock-analysis/docs/archive/tasks/2026-10-05-tencent-period-window.md)，现行 Spec 保留 |
| infra 空 Docker 重建 | 旧结果回归另补 | 10-03 原备份的 11 条旧样本已回归；两条指定缺失资产的追补已由 10-08 用户决定取消；[任务归档](../../../thesis-ledger-infra/docs/archive/tasks/2026-10-07-empty-docker-bootstrap.md)，缺失事实保留 |
| infra Docker Desktop D5 | 真实强制停止／启动及后续应用／数据核对 | 初次复核缺证据；用户随后要求补验，真实分支、正式应用恢复、旧记录／来源／挂载通过，[任务已归档](../../../thesis-ledger-infra/docs/archive/tasks/2026-10-05-docker-desktop-start.md#d5-completion-20261103) |

## 腾讯窗口的证据链

1. [10-05 目标运行态验收](2026-10-05-market-period-runtime-closure.md)已有 118 项定向回归、四周期真实 Reader、21 项目标 HTTP 检查及实际月线不足历史的消费证据。当时 `sync-code.sh dsa` 只更新可写层，未取得镜像固化资格。
2. [10-20 DG2a](../../../daily-stock-analysis/docs/evidence/2026-10-20-dg2a-target-acceptance.md)随后经正式 `update.sh dsa` 退出 0，镜像为 `sha256:06b6054ba433de813e1bfc407872b4068ed9d9650946143c19dd5d3147c6f389`；407 文件逐字节与封存源码一致，载荷摘要 `c22cff82827114b35c4d4aafa08c7dd58380e06c13bef7bb73cb420f1ae42e6b`，合同包含 `data_provider/`。候选内 3,565 项通过、零失败／跳过，以及主仓实际 SDK 的 17 项消费断言，均保持原证据层次。
3. 本次读取腾讯适配器摘要仍为 `fffdf53efa0a8e08238015a2a428fd3c5671f4e7fe3583dc68a76b2ea9275f28`，与 10-05 来源验收一致。DG2a 验收脚本摘要仍与原报告登记的 `dcd359604286b68a7a5ffeb55354f565a05134921fe11e270cd9d7a63490eaba` 一致，实际代码会对全部运行文件执行逐字节身份断言。
4. 原始 DG2a JSON 实际 SHA-256 为 `2a13d29b471a632f8a36c60cf6e719632f9b9144f2b4b3a83157a2d3ba92f74c`；保留的 JUnit 为 `b0efcc1e13a4e6a4e28e6f2fd01fbee2d1da9c7fc56f40f13dbd62deb89dc6d6`，均与原证据登记一致。来源与指标合同未因此扩大，原实源结果按未变输入复用。

## 空环境旧结果的证据链

[M31/P6 补全证据](2026-10-07-p6-completion-gates.md#旧资产资格与实际回归)已找到 `.recovery-artifacts/2026-10-03-current/` 原备份，时间为 `2026-10-03T10:18:09.802Z`，结构 head 为 `20261001120000_require_explicit_strategy_contract`。本次只读文件摘要与原 Manifest／证据一致：

| 既有文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `postgres.dump` | 18,700,277 | `4bb6cebf4717dd801198e103c6511688ef2fd2c79d69e77a7857e0a993c9747d` |
| `backtest-snapshots.tar` | 14,993,408 | `d1e4c7bfd15af8e9875ce0e13cd9f2389b13deaf889dbded27d876d7f51e22e4` |

既有 `p6-old-snapshot-memory-replay.json` 与正式镜像后的 `p6-image-old-backup-replay.json` 均保存同一组 11 个旧任务身份，每个 `replayCount=2`，网络及文件写入均为 0，`databaseRestored=false`；两份回执 SHA-256 均为 `f7f43d174a00c95fa2233c17494f5a3b7169dd02788e117277ff39c268ef7d86`。旧校验值、Snapshot 与制品完整性通过，属于实际 Worker 的旧结果兼容回归，不能解释为已将旧数据库恢复入当前库。

B4 `873ba8dd-40c3-4f9e-b1d5-b16192f697b0` 和旧 partial `652ba051-a4c5-493d-81e6-2cdbe3c090f0` 不在该备份。其专项追补已由 [10-08 范围决定](../specs/2026-10-03-multi-source-remaining-acceptance.md#scope-cancellation-20261008)取消，并在 [P6-G2](../archive/tasks/2026-10-07-p6-market-state-expansion.md#2026-10-07-补全执行叶)收口。本次同步这一既有决定，没有将两条缺失资产计为回归通过，也不重新立项。

## D5 补验前的第一层缺口

[G3-D25](2026-10-25-g3-single-formal-response.md)明确记载 `--execute --force-stop` 返回 `engineReady=true`、`restarted=false`，命中健康幂等分支。后续正式关闭更新及保护核对通过，仍未实际覆盖 Docker Desktop 强制停止／启动。

初次核对主仓后续证据、保留的运行制品和 infra 维护备份：G3-D21 JSON 中的 `restarted=true` 对应 Server／Worker，10-30 在途恢复入口也只重启应用容器，不满足 D5。当次没有补跑该分支，D5 保持活动且未验收；这一历史判断不计为通过。

## D5 后续授权补验

用户随后要求「完成 Docker Desktop D5」。当前真实 daemon 不可连接、磁盘正余量且无活动更新时，经既有维护入口执行一次强制停止与启动，两步退出 0，独立引擎检查通过。正式 `update.sh thesis-ledger` 复用原镜像恢复应用，再经 `sync-code.sh thesis-ledger` 补回后续快更，两角色各 725 个编译文件与当前已验证构建一致。

五服务健康；12 表原 601 行全文摘要保持，99 条回测和 26 条 AI 任务终态，新旧研究记录读取通过。DSA 四表、9 条准入、12 份原件与完整挂载保持，当前 V2 配置保留；正常启动的目录与健康元数据变化单列。D5 已完成归档，[完整验收](../../../thesis-ledger-infra/docs/archive/evidence/2026-11-03-docker-desktop-d5-acceptance.md)记录真实初态、命令、保护边界及原始回执，没有重建镜像或新增模型生成。

## 最终一致性复核

首次复核完成两份 Task 归档，D5 当时保持未勾选；该阶段只执行证据／摘要／链接核对，记录保存于 `.recovery-artifacts/cross-repository-closeout-20261103/`。后续 D5 按独立授权执行，结果与保护核对保存于 `.recovery-artifacts/docker-desktop-d5-20261103/`。当前三项均已收口归档，现行 Spec 及主仓入口直接引用归档正文；主仓其他活动 Task 与 TODO 不变。
