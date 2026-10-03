# Canonical 剩余任务完成顺序

2026-10-02 用户授权全部完成后，已按本文顺序完成 U01/U02、E04-d/E04、D01–D03 与最终 Review。当前剩余数为0，见[最终收口证据](2026-10-02-canonical-final-completion.md)。下文保留执行前的依赖安排，不作为新的待执行任务清单。

依据[主任务](../2026-09-29-thesis-ledger-canonical-runtime-replacement.md)在 2026-10-02 的状态，以及 C03/C04、E03、E01-I1 和 NAV N1–N4 的完成证据整理。执行前仍需核对实际源码和未提交写集。

## 已完成范围

C01、C02、C03、C04、E01、E03、E01-I1、E01-N1–N4 已完成。E04-a/E02-a Data 读取叶、E04-b/E02-b Provider 消费叶和 E04-c1/E02-c1 Policy 叶亦已完成，见[Data 配对证据](2026-10-02-e04-a-e02-data-completion.md)、[Provider 配对证据](2026-10-02-e04-b-e02-provider-completion.md)、[Policy 配对证据](2026-10-02-e04-c1-e02-policy-completion.md)和[Catalog/缓存/派生父项证据](2026-10-02-e04-c-e02-c-parent-completion.md)。E04-c/E02-c、c2/c3 与 E02 父项已收口。C01/C02 最新证据见[库存与状态机收口](2026-10-02-c01-c02-completion.md)，E01 见[执行面收口](2026-10-02-e01-execution-completion.md)。后续复用其合同、经济回归、隔离运行态和目标证据；这些子项完成不自动代表最终部署与产品验收完成。

## 建议顺序

| 顺序 | 任务 | 本阶段剩余工作与依赖 |
| --- | --- | --- |
| 1 | U01 → U02 | 先收口 API Client/Desktop 的 Market、Run、Ledger 当前路径与错误展示，再检查 Portfolio、Risk/Automation、Research/Optimization/AI/Journal、导出/备份的实际消费路径。Ledger 与 NAV 已有客户端证据可复用，只核对剩余旁路与迁移断言；Provider 页面实际交互仍需 U01 验收。 |
| 2 | E04-d | U01/U02 迁移完成后删除 DSA 旧 DTO/Store/别名/缓存/夹具；确认无生产调用后才删除。保留 DSA 通用 `api/v1`、外部 Provider 原生协议和当前不可变证据格式。完成 E04 父项对账。 |
| 3 | D01 | 汇总最终 Schema、全部 migration 与原始表清单、打包输入、结构 head、权限和备份/保数据升级门禁；按变更选择官方最小更新入口，核对镜像与可写层。涉及结构变化时应随实施维护门禁，不能等到本阶段才补迁移。 |
| 4 | D02 | 验收同源 Server/Worker/DSA/客户端的创建→投递→领取→终态→读取/重放，以及旧 URL/记录拒绝、鉴权和故障恢复。复用未变化的高成本证据，补最终输入变化后的检查。 |
| 5 | D03 与最终一致性 Review | 反查并删除已确认不可达的残余代码与缓存，更新架构/API/运维及 infra 文档；核对 Spec 全部断言、任务勾选、来源/经济/运行态证据与链接。若清理改动执行输入，补受影响的部署和验收检查后再收口。 |

## 避免依赖循环

C02-d 已核对当前 Run 消费面完成迁移：旧 `jobs` 路由无生产消费者且目标返回404，API Client/Desktop 当前路径通过回归。U01/U02 继续验收其他领域消费路径，不再作为已完成 Run 入口迁移的前置任务。

E04-a/b/c 的生产合同和 Server 配对先完成；其中依赖 Desktop 的验证在 U01 补齐，E04-d 删除旧合同放在消费迁移之后。E02 与 E04 是配对推进关系，不要求等整个 E04 删除阶段完成才开始 E02。

U01-a 目录任务消费边界已完成，下一项为 U01-b 的其余 API Client/Desktop 当前消费审计，随后进行 U01-c 真实客户端验收，见[客户端执行包](2026-10-02-u01-client-execution.md)。E04-d 仍依赖 U01/U02，E04 父项保持未完成。目标 Catalog 当前提供陈旧完整目录，外部 Provider 刷新失败及 NAV 准入过期的事实见父项证据，不视为全局产品验收通过。
