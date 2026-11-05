# 组合估值可用性实施任务

对应 Spec：[组合估值可用性与基金净值路由](../../specs/2026-11-04-portfolio-valuation-availability.md)

> 状态：已完成；工作区为既有未提交修改，保留全部无关工作。Docker 仅使用 infra 正式入口。不得提交、推送或清理业务数据。

## 当前执行摘要

T1–T5 已完成。策略修订 184 的两条 AKShare 净值路由已验证，原 83 条及来源配置保持；原因契约、两端公共状态投影与项目规范已生效，桌面真实 API / 隔离故障页面和 Android、iOS 原生当前 JS 验收通过。七类业务表摘要保持。详细结果与首次失败及修复见[验收证据](../../tasks/evidence/2026-11-04-portfolio-valuation-availability.md)。

## 任务

- [x] T1：基金路由和真实净值闭环（AC3）。执行面为现有策略 API，仅追加 FUND_NAV/FUND_NAV_HISTORY，expectedRevision 围栏；上下文为 MarketFundReader、marketPolicySaveInputSchema 和路由目录。核对原路由不变，有限次真实读取；来源失败保留证据并检查原因，不自动启用其他能力。
- [x] T2：服务端估值可用性契约（AC1、AC2）。执行面为 MarketCacheControl、portfolio-position-valuation、schemas/api；保留 sourceReason、价格 null 与 stale 语义、navDate，定向测试覆盖所有原因与历史净值前收。禁止业务数据写回。
- [x] T3：桌面和移动端真实状态提示（AC2、AC5）。依赖 T2；执行面为组合页面、状态投影及现有 Alert 组合。回归缺失、陈旧、汇率问题与正常数据；同步 AGENTS.md 规范。相关类型检查与构建通过。
- [x] T4：仓库门禁和目标运行态同步（AC5）。依赖 T2/T3 定向检查通过；按最小目标执行 infra sync-code，失败按既有规范处理；验证 API 实际字段和受保护业务表摘要。
- [x] T5：桌面与原生页面验收（AC4）。依赖 T1/T4；桌面真实来源页面并隔离注入故障；Android/iOS 使用已安装原生 Debug 宿主加载当前 JS，核对名称、价格、净值日期与提示。验收范围不等于发布包重编译。

## 最终一致性检查

已逐项核对 AC1–AC5、任务写集和实际证据：实现与合同一致，历史数据保留、配置最小差异成立，三端当前页面通过，必要门禁无剩余。Server 首轮全量超时和独立复验结果均保留，未将跳过、探索性 404 或发布包未编译写成通过。无确认延期事项，不修改 TODO；Spec 保留为当前行为合同，任务归档。
