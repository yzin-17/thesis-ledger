# 延期实现 TODO

本文只记录**已经明确要在后续迭代实现、但当前不属于任何 active Spec/Task 完成条件**的事项。它不是当前任务清单，也不能用于把当前未完成的实现、运行时验收或外部门禁延期掉。

治理规则：

- 当前已经承诺实施或仍属于验收条件的事项，继续留在 `docs/tasks/` / `docs/reviews/`，不得迁入 TODO。
- 已经存在正式后续 Spec/Task 的事项，直接由该 Spec/Task 承接，不在 TODO 重复维护。
- TODO 只保留延期范围、来源、前置条件和重新立项触发条件；一旦启动实施，先创建成对 Spec/Task，再从本文移除对应条目。
- 普通“非目标”不自动进入 TODO；只有文档明确写明“后续实现 / 后续版本 / 另行立项 / 已确认后续范围”的事项才进入本文。

## 当前 TODO

2026-11-05：原第4～15项已完成并[归档](archive/tasks/2026-11-04-todo-4-15-delivery.md)，逐项证据见[最终验收](tasks/evidence/2026-11-05-todo-4-15-final-acceptance.md)；下方保留原第1～3项。

| ID | 延期范围 | 来源 | 重新立项前置条件 / 触发条件 |
| --- | --- | --- | --- |
| <a id="ai-provider-positive-cost-acceptance"></a>`ai-provider-positive-cost-acceptance` | 完整设计稿AC-13的真实非零上游费用验收：用户零价与供应商正金额费用分列，以及对应真实费用/结算证据；用户于2026-11-01明确延期，尚未验收通过 | [现行费用范围](specs/2026-09-21-ai-provider-model-usage-configuration.md#positive-billing-followup)；[原T5.2/T6及最终对账](archive/tasks/2026-09-21-ai-provider-model-usage-configuration.md)；[本次决定](tasks/evidence/2026-11-01-ai-fee-deferral-and-closeout.md) | 用户明确恢复后建立成对Spec/Task；先具备可归属请求的真实正金额费用、币种和结算材料，或明确Provider及总付费上限。当前费用上限0、现有配置和凭据保持，延期不授权付费请求 |
| <a id="longbridge-oauth-live-acceptance"></a>`longbridge-oauth-live-acceptance` | Longbridge 真实账号授权、行情权限与令牌刷新恢复，以及 Android/iPhone Air 的真实 OAuth 闭环验收 | [来源凭据 Spec](specs/2026-09-14-market-provider-credentials.md) AC6/AC7、[原 T5b-LB](archive/tasks/2026-09-14-market-provider-credentials.md#t5b-lb)、[手机迁移范围](specs/2026-10-22-web-mobile-feature-parity.md#longbridge-oauth-followup)及[原 M29b](archive/tasks/2026-10-22-web-mobile-feature-parity.md#m29b) | 用户明确恢复后单独立项；准备有效 OAuth 配置、获准测试账号/权限、可达回调及凭据安全写入范围。按 2026-10-26 用户确认延期，当前迁移剩余清单和 G5/G6/G7 均不依赖此项；该项尚未通过验收 |
| <a id="rqdata-live-consumption"></a>`rqdata-live-consumption` | RQData 原 `H07-K37c-live` 的真实账号正向读取与消费验收；用户于 2026-10-21 明确延期，已从当前适配层验收范围转出，实源尚未通过 | [范围决定](specs/2026-10-09-unified-data-capability-adapter.md#source-scope-20261021)；[原责任项与证据](tasks/2026-10-09-unified-data-capability-adapter.md#rqdata-deferred) | 用户明确恢复且合法账号、目标接口权限及原身份/准入输入具备后，建立成对 Spec/Task，承接原真实读取与消费断言 |

## 不属于 TODO 的当前门禁

以下类型即使受外部条件影响，也仍属于**当前任务完成条件**，不得迁入本文：

- 原共同价格与多源扩展已收尾，取消范围见[现行决定](specs/2026-10-03-multi-source-remaining-acceptance.md#scope-cancellation-20261008)；统一适配层的 Tushare 正向条件仍归[当前 Task](tasks/2026-10-09-unified-data-capability-adapter.md)，不新增开户、采购或重复探测动作。RQData 已按明确范围决定列入上方 TODO；
- Desktop / Mobile / Browser / Simulator 的当前产品运行态验收；
- 已实现功能的 Docker、Worker、PostgreSQL、Redis 或真实 Provider smoke；
- 当前 Task 明确列出的用户确认或受保护数据清理门禁。
