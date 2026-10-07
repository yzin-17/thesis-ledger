# F02 能力目录当前状态对齐证据

日期：2026-09-28。任务包：`F02-capability-status-0928`。结果：`worker_done`。主仓基线 `fe0e871e`；DSA 保留 `yzin` 分支既有 23 个修改及 133 个未跟踪文件。本轮仅在授权的两份文档中写入，没有修改主 Spec、Task 台账或源码，没有暂存、提交或清理 WIP。

## 已对齐状态

- 保留 2026-09-25 的 P02 候选基线，将旧“未发现 SDK/适配”表述标为盘点基线，并以增量及当前叶子状态承接后续实现。
- §5 摘要及 P02-c 自检不再概括为全部叶子待实现；当前摘要只列本轮有界核对的 R01.5、R01.10、R07.25/R07.26，区分本地实现、目标拒绝验证、真实正向准入和待选择范围。
- R01.5 补入安全解析器 13 项及分页解析/读取组合 19 项的既有本地证据。这些统计不相加为独立 32 项。Catalog 尚未消费读取器，ETF/开放式基金分类及消费者硬期限接线仍开放；完整新读取器首次及两次重试均 ReadTimeout，预算已耗尽，真实完整成功未通过。
- R01.10 保留日历专项完成与实际目标 HTTP→Client→完整冻结→离线重放的既有结论，补充可点击 Task 引用；合成行情不计真实回测，容器可写层限制继续保留。
- R07.25/R07.26 明确身份/币种原文合同与生产事件入口已接线，并引用本地及目标拒绝证据。真实身份/币种审核、逐接口权限、完整历史及目标正向请求仍开放，不授予来源 ready 状态。

## 对照依据

- [DSA 能力目录](../../../../daily-stock-analysis/docs/thesis-ledger-source-capabilities.md)：本轮状态入口。
- [DSA 目录来源证据](../../../../daily-stock-analysis/docs/thesis-ledger-catalog-source-evidence.md)：解析器、分页读取器、本地统计及三次超时边界。
- [RQData 生产事件证据](2026-09-27-rqdata-event-runtime.md)：本地生产接线、目标 ready 为 0、缺准入零账号读取及实际 HTTP 拒绝；正向子叶开放。
- [日历发布 Task](../2026-09-27-calendar-release-availability.md)：专项完成、实际目标链路及部署限制。
- [当前剩余清单](2026-09-26-remaining-work-current.md)与[剩余前沿](2026-09-28-remaining-frontier.md)：已有实现与尚缺条件分别记录。
- [主 Spec](../../specs/2026-09-25-multi-source-adjustment-aware-backtest.md) §12.3、§14.2、AC20：分层状态、跨仓文档责任及逐单元真实准入或明确待验证状态。

## 本轮文档验证

- 对照写入前临时副本核对：116 个固定叶子 ID 及顺序完全一致，R07.8/{sourceId} 模板保留；叶子表均为原四列。
- 所有新增或调整的本地证据链接均解析为实际存在文件；自审改写状态与对应证据一致，说明性新增正文为中文。
- DSA 执行 `rtk git diff --check -- docs/thesis-ledger-source-capabilities.md`，主仓执行 `rtk git diff --check -- docs/tasks/evidence/2026-09-28-f02-capability-status.md`，均通过。两文件当前未跟踪，另直接检查完整文件无行尾空白、以换行结束，补足 Git 未跟踪文件不参与 diff 的限制。

仅文档对齐，未运行测试、构建、Provider、网络、浏览器、数据库或部署；既有测试数字及目标结果来自上述证据，本轮没有重跑。未进行 117 个编号条目的完整审计，没有关闭 AC20、F02 或其他父项。主 Task §12.8 台账由协调者独占维护，本轮保持只读。
