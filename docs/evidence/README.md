# ThesisLedger 验证证据

- [开发库不备份升级](2026-11-12-development-upgrade-without-backup.md)：受限入口、本地及隔离验证，保留未实际执行不备份目标迁移的边界。

- [基础行情缓存完成阶段](2026-11-12-market-base-result-cache-completion.md)：完整门禁、实际Redis、正式运行态对账、目标缓存及实际Desktop四宽验收。

- [腾讯当前日线绑定真实验收](../../../daily-stock-analysis/docs/evidence/2026-11-12-tencent-daily-live-verification.md)：解除旧次数限制后，当前代表真实绑定及传输校验通过。

- [失败行情口径上午复核](2026-11-12-provider-failed-recheck.md)：AKShare今日日线样本成功、BaoStock未覆盖、pytdx失败及运行代次核对。

- [基础行情60秒缓存实施](2026-11-12-market-base-result-cache.md)：契约、本地验证、DSA全量失败与旧生产者消费者兼容恢复。

- [日期组件显示一致性验收](../archive/evidence/2026-11-11-date-input-consistency.md)：日期消费者审计、原值兼容、27 个受控场景和四宽真实复盘页检查。

- [实验候选具体差异验收](../archive/evidence/2026-11-11-experiment-candidate-diff.md)：冻结版本对比、中文规则、完整定义与四宽真实页面。

- [回测数据与假设页重设计](2026-11-11-backtest-assumptions-ui.md)：紧凑摘要、口径与假设分区、去重来源及四宽真实页面。

- [能力首次使用与自动验证](2026-11-11-capability-first-use-verification.md)：两次真实首次请求、持久记录、服务重启与四宽真实页面。

- [港美股后复权回测准备修复](2026-11-11-overseas-hfq-backtest.md)：两条真实失败的根因、修复及原窗口取数校验。

- [回测日线来源适用性](2026-11-11-backtest-source-compatibility.md)：完整窗口原因、兼容修复、来源矩阵及运行态证据。

本目录统一保存验证记录、截图、XML、JSON 和被测试或维护脚本读取的固定样本。文件按日期与主题定位，保留原文件名、任务 ID、输入版本和验证层级；原始来源响应、签名与摘要样本保持字节内容。

- 当前执行、未满足条件和最新证据指针由[任务索引](../tasks/README.md)及对应 Task 维护。
- 审查判断与结论由[Review](../reviews/README.md)维护，详细证据从本目录引用。
- 多任务、历史主题或 CI 共用的证据保持单一正文和稳定路径；任务完成时可继续引用。
- 已结案且仅属于归档任务的证据可进入 `docs/archive/evidence`，归档时同步修正所有引用。

文档分类与生命周期见[文档指南](../DOCUMENTATION-GUIDE.md)。保存证据不扩大来源、模型、通知、部署或受保护数据操作的授权。

- [自选、多模型模拟交易与周报本地验证](2026-11-06-watchlist-arena-weekly-local.md)

- [标的输入盘点与验证](2026-11-06-instrument-picker.md)

- [基金收盘估算误差精确展示](2026-11-07-fund-daily-decimal-display.md)：两端差额、非零读数与原比例兼容。

- [竞技场与周报详情刷新](2026-11-07-arena-detail-refresh.md)：两端相关请求、四宽受控浏览器、冻结输入的包级验证及共享工作区边界。
