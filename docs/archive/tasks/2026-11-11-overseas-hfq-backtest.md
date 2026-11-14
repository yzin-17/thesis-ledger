# 港美股后复权回测准备修复任务

规格：[行为与验收](../../specs/2026-11-11-overseas-hfq-backtest.md)。证据：[诊断与验证](../../evidence/2026-11-11-overseas-hfq-backtest.md)。

## 当前状态

已完成。DSA 后复权研究通路、诊断脚本及消费侧覆盖错误已修复；179 个独立 DSA 用例、72 个 Server 用例及相关类型、构建和门禁通过。正式快更完成，两个标的小窗口及原年度窗口均通过实际取数校验。苹果年度窗口保留当日尚未开市的缺日假设；本轮未创建或重跑回测，不将窗口校验称为回测终态验收。工作区修改未提交。

## 执行单元

- [x] T1：DSA 研究绑定与诊断修复（AC1、AC2）。写集：`data_provider/thesis_ledger_sources/futu.py`、`src/services/thesis_ledger_reference_identity.py`、`scripts/probe_backtest_daily_sources.py` 及其定向测试；复用已核验证券身份，覆盖港股、美股、两种复权和拒绝分支。178 项定向通过，详见证据。
- [x] T2：消费侧覆盖错误投影（AC3）。写集：Market 窗口错误 helper、选择器调用处、回测提示与定向测试；不改变来源选择、补源及历史记录。72 项定向、类型、构建与边界门禁通过。
- [x] T3：部署与真实窗口验收（AC4）。从 infra 运行 `sync-code.sh all` 退出 0；独立代码摘要、健康、四个真实隔离窗口及生产控制状态核对通过。详细命令与结果见证据。
- [x] T4：最终差异、文档和证据核对完成；规格继续持有行为合同，任务归档，证据因 DSA 长期设计引用保留现位置。无新增延期事项。
