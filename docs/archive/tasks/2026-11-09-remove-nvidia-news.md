# 删除 NVIDIA 官方新闻数据源实施任务

规格：[删除 NVIDIA 官方新闻数据源](../specs/2026-11-09-remove-nvidia-news.md)

## 当前状态

已完成并归档。DSA 来源、当前政策及宿主 Desktop 页面均不再提供 NVIDIA 官方新闻；保留两个仓库其他未提交改动。

## 任务与验收

- [x] T1：DSA 来源退役（AC1）。注册及库存测试 27 项、能力边界及运行时合同检查通过。
- [x] T2：Desktop 说明清理（AC2）。新闻测试 9 项、Desktop build 通过，原布局与交互保留。
- [x] T3：目标运行态验收（AC3，依赖 T1/T2）。最小目标 `./scripts/sync-code.sh dsa` 成功；目录、政策 194 和宿主 Desktop 四种宽度页面通过。初始 `all` 的无关 Server 构建失败与实际执行面收敛依据见证据。

## 续接信息

DSA 入口：`src/services/thesis_ledger_capability_sources.py`；测试：`tests/test_thesis_ledger_inventory_export.py`、`tests/test_thesis_ledger_provider_runtime.py`。Desktop 入口：`MarketNewsSheet.tsx`、`MarketNewsResult.tsx`。

通过既有政策 API 移除一个备用目标，未直接操作数据库，未创建 Git 提交。完整命令、失败记录与验证边界见[验收证据](../evidence/2026-11-09-remove-nvidia-news.md)。

## 最终一致性审查

- [x] AC1–AC3 均有实现与证据，当前目录与政策一致，历史版本保留。
- [x] 本任务测试、配置、文档和运行态结果一致，其他工作区改动保留。
- [x] 证据区分 DSA 容器可写层、宿主 Desktop 页面及未更新的 Server 镜像。

结论：本次来源删除范围通过，无剩余验收事项。
