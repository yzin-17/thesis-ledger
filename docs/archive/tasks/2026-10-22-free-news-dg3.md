# 免费官方新闻与 DG3 接入任务

> 状态：2026-10-22，F1～F4 与七项 AC 均完成，最终复核后归档。

关联[现行规格](../../specs/2026-10-22-free-news-dg3.md)、[最终复核](../../reviews/2026-10-22-free-news-dg3-final-review.md)及 [DSA 完成记录](../../../../daily-stock-analysis/docs/archive/tasks/2026-10-18-data-only-service.md#dg3-free-news-complete)。主线程保留既有修改和数据，未提交、推送或调用模型。

## 完成记录

- [x] F1：DSA 来源执行面。NVIDIA 官方有限 RSS、来源自带上限、无 Key 修订与原预算/控制/缓存语义完成，覆盖 F-AC1～3。相关回归 498 项；编码加固后定向 36 项、flake8 和来源边界通过。
- [x] F2：主仓只读消费面。共享读模型、客户端与 TanStack Query 新闻侧栏完成，覆盖 F-AC5。Schemas 60、Server 61、客户端 3+2 项通过；类型/构建、源码边界、依赖和局部 ESLint 通过。
- [x] F3：正式目标及 DG3 实源。正式前后备份、sync-code.sh all 与编码加固后的 dsa 快更、首次有界准入及只读读回、五条 V3 → Market → Web 新闻、零尝试拒绝和保全差集通过，覆盖 F-AC4～6。镜像未重建。
- [x] F4：最终 Review。七项 AC、原 DG3、任务总表与来源矩阵一致，覆盖 F-AC7；本任务及 DSA 任务归档，研究 G3 和模型条件保持原归属。

## 验证与保全

完整命令、输入范围、失败及修复、目标哈希、许可与覆盖限制由[现有新闻证据](../../../../daily-stock-analysis/docs/tasks/evidence/2026-10-18-data-only-service-news-contract.md#dg3-free-news-20261022)持有，不将临时日志单独当作完成证明。未变的 N1～N3、DG2、主仓 G1/G2 证据复用。

实际仅新增一个 NVIDIA 来源、一个 US/STOCK/NEWS_SEARCH 目标、一份 NVDA.US 准入及一条新闻路线。原十六路线和二十七来源保持，15 账户、57 个成功回测、旧凭据和 203 个 DSA 原文件保留。政策与 DSA 为 168/applied，目录为 28 来源/190 目标。准入有效至 2026-10-28T20:01:19.004992+00:00，不自动续期。个人非商业、有限近期发行方消息及未知首次可用时间均明确显示。
