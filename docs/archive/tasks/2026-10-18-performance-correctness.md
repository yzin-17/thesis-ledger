# 收益计算、再平衡与目标保存修复任务

> 日期：2026-10-18；全局优先级：**P0，第一批正确性修复**。状态：PFC0～PFC5 与 PFCG 全部完成；保留更新、目标 HTTP 与实际浏览器验收于 2026-10-19 分别通过。
> [Spec](../../specs/2026-10-18-performance-correctness.md) · [优先级索引](../../tasks/README.md#priority-p0) · [IR03～IR06 证据](../../reviews/2026-10-18-starred-project-implementation-coverage.md#local-findings)。本页是四项问题的唯一修复进度入口。

## 现在做什么

PFCG 已完成正式保留更新、目标实际 HTTP/ORM 消费和浏览器验收。503 保存失败保留 60%/40% 草稿与原 v1，重试生成 v2，刷新仍可读；缺边界原因、严重亏损和模式隔离均通过。目标并发、当前现金信封正例及原数据/快照保护独立通过，本主题无剩余实施叶。详见[目标验收记录](../../tasks/evidence/2026-10-19-p0-target-acceptance.md)和[本地证据](../../tasks/evidence/2026-10-18-performance-correctness.md)。

<a id="pfc0"></a>
## PFC0：固定合同、消费者与结构差异

- [x] **PFC0：核对经济边界、目标身份与确切写集。**
  - 依赖：无。入口为 Domain performance、Server analysis/target/ledger-flow 服务、API Schema、客户端及目标表约束。
  - 输出：现金流边界可得性、XIRR 年长/失败映射、类别/舍入策略、目标串行化/约束与保留升级方案；列出每叶独立测试和共享文件。
  - 完成：确认四个原问题仍适用；不足历史估值不通过虚构时间或默认近似补齐，未决定结构/兼容前不派发数据库修改。

<a id="pfc1"></a>
## PFC1：IR06 目标保存原子性

- [x] **PFC1：实现目标替换与版本并发保护。**
  - 依赖：PFC0；不依赖 PFC2～PFC4。写集限 target 服务/所属 repository、必要 migration/清单和定向数据库测试。
  - 完成：PFC-AC4 通过，包含创建失败回滚、同身份并发、nullable accountId、跨账户不互相停用；不是只断言调用了 transaction。
  - 结构变更按静态 diff、隔离 PostgreSQL、保留旧目标升级和冲突预检验证；不改历史 migration 或清除冲突数据。

<a id="pfc2"></a>
## PFC2：IR03 现金流时点与 TTWROR

- [x] **PFC2：修正分段计算和条件不足行为。**
  - 依赖：PFC0。写集限 Domain 收益合同、Server summary 流量/估值投影及必要响应字段/测试。
  - 完成：PFC-AC1 通过；精确边界反例与缺边界的不可用分支同时覆盖，内外流量分类、历史 FX 与原无流量区间不回归。
  - 需新增持久化/采样时先原位补独立叶与依赖，不在本叶增加无界回填或调度。

<a id="pfc3"></a>
## PFC3：IR05 XIRR 有界求解

- [x] **PFC3：保护定义域、收敛和失败分类。**
  - 依赖：PFC0；与 PFC2/PFC4 的同文件写入串行交接。
  - 完成：PFC-AC2 通过；不将迭代失败等同无解，不改变年长而隐瞒口径，不输出非有限数。只在有证据的情况下声明根唯一。

<a id="pfc4"></a>
## PFC4：IR04 再平衡资金守恒

- [x] **PFC4：用类别并集表达完整缺口。**
  - 依赖：PFC0；与 PFC2/PFC3 的同文件写入串行交接。
  - 完成：PFC-AC3 通过；股票 +500/现金 −500、未持有目标、零目标及尾差有断言；partial/缺 FX 不生成完整建议。
  - 计算定向入口：`pnpm --filter @thesis-ledger/domain exec vitest run test/performance.test.ts`；新增边界测试按 PFC0 清单执行。

<a id="pfc5"></a>
## PFC5：服务、API 与客户端消费

- [x] **PFC5：验证修复结果能被实际读取。**
  - 依赖：PFC1～PFC4。各单项修复可先做自身消费测试，不等待整组才首次联通。
  - 完成：PFC-AC5 通过；实际 summary/targets 业务模块处理反例，客户端保留旧值/草稿、显示不可用与精确原因；不重做全站 UI。
  - Server 定向入口：`pnpm --filter @thesis-ledger/server exec vitest run test/performance-correctness.test.ts`；PostgreSQL/前端新增专用测试由 PFC0 定位，真实数据库不能被内存 mock 替代。定向通过后跑受影响包与边界。
  - 已通过：`test/performance/correctness-http-postgres.integration.test.ts` 的真实 Nest HTTP → PerformanceService/Analysis/Target/Snapshot → PostgreSQL；summary 再按客户端使用的共享响应 Schema 解析。覆盖目标拒绝后保留、历史读取不改写、零净额流量、严重亏损残差、精确边界和现金来源/partial 建议；Desktop 三文件 20 项通过。完整命令与隔离输入见证据页，浏览器留给 PFCG。

<a id="pfcg"></a>
## PFCG：目标与必要保留升级

- [x] **PFCG：完成目标运行、升级和关闭对账。**
  - 本轮执行范围：用户已授权正式更新并保留数据，使用现有 infra 保留升级路径；三个 P0 门禁共用候选产物。infra `scripts/p0-target-acceptance.mjs` 在目标 Server 内装配实际收益 HTTP/业务服务/ORM，使用专属临时数据库完成持久化及错误反例，本机浏览器读取该独立验收服务。原目标、收益、快照及 Ledger 在更新前后对账，测试不写用户账户，真实模型暂停。
  - 依赖：PFC5、必要隔离升级证据、正式维护入口和明确验收范围。
  - 完成：PFC-AC6 通过；通过正式更新入口使运行版本一致，合成反例与获准实际输入分开记账，旧目标/快照/Ledger 保留。新增结构必须做保留升级，不能用开发清库验收。
  - 已通过：正式备份/恢复演练及更新退出 0；同一候选的目标 HTTP 五组结果、实际浏览器失败→重试→刷新及模式隔离通过，最终清理和原数据对账通过。见[目标证据](../../tasks/evidence/2026-10-19-p0-target-acceptance.md#pfcg目标-http-与实际浏览器)。本主题未新增数据库结构。
  - 外部 FX/NAV 或目标条件不足时只保留对应门禁，其他定向叶可完成；不向用户账户写入测试交易或重算历史结果。

## 验收映射与执行记录

| 发现 / 断言 | 责任 |
| --- | --- |
| IR06 / PFC-AC4 | PFC0/PFC1 |
| IR03 / PFC-AC1 | PFC0/PFC2 |
| IR05 / PFC-AC2 | PFC0/PFC3 |
| IR04 / PFC-AC3 | PFC0/PFC4 |
| PFC-AC5 / PFC-AC6 | PFC5 / PFCG |

原 [Portfolio G1](2026-08-28-portfolio-snapshot-system.md#portfolio-pnl-acceptance) 只证明其已实现盈亏和 Close Slice 场景。本主题的 Domain、Server、Schema、客户端、隔离数据库/HTTP 与 PFCG 目标/浏览器分别通过，未互相代收。正常 Server/Desktop 类型与构建通过，全仓 lint 仍被既有账户操作的三处 Promise 错误阻断，未修改该既有写集。命令及精确输入范围见[本地证据](../../tasks/evidence/2026-10-18-performance-correctness.md)和目标验收记录。
