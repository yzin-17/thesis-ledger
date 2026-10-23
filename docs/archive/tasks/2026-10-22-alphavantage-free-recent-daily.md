# Alpha Vantage 免费近期日线实施任务

对应 Spec：[免费近期日线](../../specs/2026-10-22-alphavantage-free-recent-daily.md)
父任务：[来源凭据 T5b](../../tasks/2026-09-14-market-provider-credentials.md)

## 当前执行摘要

AV-T1、AV-G1 及本切片最终 Review 已完成：470 项定向/关联测试及本地门禁通过，正式 DSA 快更后近期真实 HTTP 读取健康、旧窗明确拒绝；30 家来源公开配置与 195 个目录目标状态保持。任务已归档，Spec 继续维护当前合同。原 T5b 其他条件保持，由父任务持有；未提交、启用来源、改路由或触及模型。详见[实施证据](../../tasks/evidence/2026-10-22-alphavantage-free-recent-daily.md)。

## 实施任务

- [x] **AV-T1：来源近期窗口与拒绝边界可独立验证**
  - 覆盖：AV1～AV3；前置：现有来源注册、凭据工厂与日线标准合同已就绪。
  - 上下文：`daily-stock-analysis/data_provider/thesis_ledger_sources/alphavantage.py`、`exact_daily_contract.py`、原来源定向及多市场日线测试。
  - 写集：Alpha Vantage 来源模块、上述两个定向测试文件、DSA `docs/CHANGELOG.md`、本 Spec/Task 与来源合同引用；不改公共执行器、Schema、依赖或其他来源。
  - 完成条件：单次 compact、证券与结构验证、近期成功、旧窗/跨界/晚端/空窗拒绝、修订及原规范化回归全部通过。
  - 验证：`.venv/bin/python -m pytest tests/test_thesis_ledger_alphavantage_capability_path.py tests/test_multimarket_exact_daily.py`；随后受影响来源注册/执行回归、语法与 deterministic 门禁。

- [x] **AV-G1：正式目标服务近期读取与旧窗限制通过**
  - 覆盖：AV4；依赖：AV-T1 的局部与门禁检查通过。
  - 执行面：infra 正式 `./scripts/sync-code.sh dsa`；仅源代码变化且兼容性预检通过时执行，预检拒绝即保留证据并停止确认。
  - 完成条件：目标 API 的 AAPL 近期日线检查健康；目标同版来源处理器真实 compact 读取对旧窗返回 `not_covered`；源修订正确，凭据/启停与路由目录的精确键、目标、准入状态保持。
  - 边界：来源保持停用，通过既有只读检查路径验证；不临时开路由，不新增业务数据。真实请求遇到新限制不重试或找替代端点。

## 规划预检

结论：Ready。两个叶分别拥有来源实现和独立部署验收，覆盖所有 AC；没有依赖循环或阻塞设计问题。旧历史限制及原任务未通过范围保留。

## 最终一致性 Review

- [x] 所有 AC 有实现与足够证据，局部结果未代替目标门禁
- [x] 未把 compact 片段当作完整旧历史，修订与原冻结边界一致
- [x] 必要定向、门禁和目标运行检查通过，未覆盖的原 T5b 条件保留
- [x] Spec、Task、来源合同、总表及实际代码一致，既有修改保留

结论：通过，范围仅为本 Spec 的免费近期日线与旧窗拒绝。真实目标近期检查 2521ms；旧窗只请求一次 compact 并返回 `not_covered`。镜像未重建，当前生效方式为正式容器可写层快更。无未完成的本切片义务或新增 TODO，原未通过条件未迁移或关闭。
