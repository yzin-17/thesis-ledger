# 指标依赖时钟与不可用状态修复任务

> 日期：2026-10-18；全局优先级：**P0，第一批正确性修复**。原审查严重程度仍为 P1。状态：IVA0～IVA3 与 IVAG 全部完成；目标 Worker 实际消费和历史保护于 2026-10-19 通过。
> [Spec](../../specs/2026-10-18-indicator-availability-correctness.md) · [优先级索引](../../tasks/README.md#priority-p0) · [IR09/IR10 反例](../../reviews/2026-10-18-starred-project-source-audit.md#indicator-findings)。本页是两项指标缺陷的唯一修复进度入口。

## 现在做什么

IVAG 已在正式更新后的目标 Worker 完成 RSI（嵌套 EMA）与 ATR 的实际构建、冻结、执行、SQL 终态和离线重放；四种旧 Run 不重算，旧引擎/结果/快照保持。生产原 Run/Snapshot 另经保留对账。本主题无剩余实施叶；计算/缓存与历史兼容见 Spec 第 3 节，[目标证据](../../tasks/evidence/2026-10-19-p0-target-acceptance.md)和[本地证据](../../tasks/evidence/2026-10-18-indicator-availability-correctness.md)分别记录各层结果。全仓 lint 的既有三处无关错误仍保留。

<a id="iva0"></a>
## IVA0：固定实际消费者和兼容入口

- [x] **IVA0：核对指标状态合同、缓存及冻结版本。**
  - 依赖：无。入口为 `backtest-indicators.ts`、`backtest-observation-clock.ts`、`backtest-series.ts` 及 Server 的 adjusted-indicators、execution-shared、V3 Runner。
  - 输出：实际调用链、精确写集/测试、普通与研究时钟、中断/重置约定、旧 Run 重放及计算版本方案。
  - 完成：确认原反例仍适用；没有因 v2 文件名误判退役，未把 scalar-ATR 探索升级为额外生产 bug。

<a id="iva1"></a>
## IVA1：修复 RSI 递归依赖

- [x] **IVA1：保持数值状态和完整依赖时钟同步。**
  - 依赖：IVA0。写集限 Domain 指标及所需稳定可见性原语、对应测试。
  - 完成：IVA-AC1 通过；旧种子离开窗口仍影响结果时不能丢掉其时钟，中断后按既定规则重置并重新预热。保留原 RSI 数值方法。

<a id="iva2"></a>
## IVA2：修复 ATR 的状态与前收依赖

- [x] **IVA2：核验 TR 必需输入并合并前收时钟。**
  - 依赖：IVA0；与 IVA1 的同文件修改串行交接，不把 RSI 完成当作 ATR 算法前置。
  - 完成：IVA-AC2/AC3 通过；不可用 OHLC 不复活，上一 close 的状态与时钟进入实际计算，首点和预热语义不被顺带改变。
  - Domain 验证入口：`pnpm --filter @thesis-ledger/domain exec vitest run test/backtest-indicators.test.ts`；IVA0 确认的新专用测试另列。

<a id="iva3"></a>
## IVA3：消费、版本与正式执行受控验收

- [x] **IVA3：验证完整消费者及版本隔离。**
  - 依赖：IVA1、IVA2。写集为 IVA0 确认的 Server 指标分派/缓存/版本入口、兼容读路径及对应测试。
  - 完成：IVA-AC4/AC5 通过；普通时钟、researchClock、嵌套、复权、NAV 及 authoring 保护有反例；在正式 V3 业务模块执行受控冻结输入，不 mock 掉指标内核。
  - 验证入口：`pnpm --filter @thesis-ledger/server exec vitest run test/backtest/v2-adjusted-indicators.test.ts`；版本与 V3 专用测试按实际写集补齐。完成定向后再跑受影响包、类型/构建和边界。
  - 版本出口：新旧计算/缓存身份隔离，旧结果可读、旧重放行为明确；不得写回原 Run 或历史 Snapshot。

<a id="ivag"></a>
## IVAG：目标执行与关闭

- [x] **IVAG：完成目标版本和端到端结果核对。**
  - 本轮执行范围：与其他 P0 门禁共用一次正式目标更新及原数据保护摘要。infra `scripts/p0-target-acceptance.mjs` 在目标 Worker 内消费明示合成的来源材料，使用实际 V3 构建、冻结、执行、重放及 Run 持久化保护；只写本轮专属临时数据库和快照目录，原 Run/Snapshot 只读核对。真实模型保持暂停。
  - 依赖：IVA3、正式运行入口和明确的独立验收范围。通过 infra 正式入口更新，使用合格冻结合成输入；不调用模型，不扩搜来源。
  - 完成：IVA-AC6 通过，目标执行没有重新放行晚到/不可用指标，原结果/快照保持；缺正式隔离入口先补可复用脚本，不直接操作容器或伪造线上来源。
  - 已通过：目标消费者时钟反例及两条 Worker 完整路径通过；计算身份为 `thesis-ledger-v3-local-runner-v3`，旧 queued Run 明确拒绝跨版执行，其他旧终态保持。源材料为明示合成输入，真实模型/实源请求均为 0，见[目标证据](../../tasks/evidence/2026-10-19-p0-target-acceptance.md#ivag目标-worker-计算身份与冻结保护)。
  - 归属：相关策略 T19/Market Consumer 引用本页匹配输入的证据；纯函数和助手复现不自动计作目标通过。

## 验收映射与执行记录

| 断言 | 责任 |
| --- | --- |
| IVA-AC1 | IVA0/IVA1 |
| IVA-AC2/AC3 | IVA0/IVA2 |
| IVA-AC4/AC5 | IVA3 |
| IVA-AC6 | IVA3/IVAG |

Domain 19 项与 Server 7 文件 35 项定向通过，含完整 V3 构建/冻结/执行/离线重放；NAV 3 文件 41 项、编写保护、包级与边界检查已通过。最终受影响 Server 集合 40 文件 433 项通过；IVAG 独立目标门禁通过，全仓 lint 的既有错误仍保留。旧审查是修复前证据，保持原文；失败→修复→通过及范围解释见[本地证据](../../tasks/evidence/2026-10-18-indicator-availability-correctness.md)和目标验收记录。
