# 数据源统一身份与逐功能权限实施

规格：[数据源统一身份与逐功能权限](../../specs/2026-11-09-provider-functional-access.md)

## 当前状态

已完成并归档。TickFlow 只有一个来源及14项精确功能，真实目录、匿名日线与四屏宽浏览器通过。保留两仓其他任务改动，未提交 Git。完整命令、失败记录与证据边界见[验收证据](../../evidence/2026-11-09-provider-functional-access.md)。

## 任务

- [x] T1：权限执行契约（AC2）。精确能力凭证要求由检查、目录、修订与执行门禁共用，保留 Tushare 语义及有界检查。
- [x] T2：TickFlow 单一执行面（AC1/AC2，依赖 T1）。单一身份及目标、14项功能、库存和边界门禁通过。当前政策没有旧目标，迁移写入不适用；原启停与凭证保留。
- [x] T3：消费面（AC3，依赖 T1/T2 契约）。Desktop44项、Mobile18项、schema及Desktop build、Mobile typecheck通过；通用逐功能状态与等级字段分离。
- [x] T4：部署与集成（AC4，依赖 T1–T3）。最终修正已通过 `update.sh dsa` 完整构建进镜像 `586491761c9d`，重建容器的12个代码文件哈希一致，无代码挂载或可写层代码差异；目标目录和凭证契约复核通过。此前四屏宽真实/受控页面与三项匿名上游证据仍适用。完整服务账号权限未自动探测，不作为本任务开通权限的门禁。

## 入口与边界

DSA：`thesis_ledger_account_access.py`、`thesis_ledger_capability_registry.py`、`data_provider/thesis_ledger_sources/tickflow*.py`、`tests/test_tushare_account_access.py`。Desktop：`ProviderCredentialsSheet.tsx`、`ProviderAccountAccessPanel.tsx`、`market-provider-capabilities.ts`。

不扩大至全部外部来源的新接口接入。真实 Key、付费额度与上游可达性按实际条件验收；缺失时保留精确缺口，继续独立工作。

## 最终一致性审查

- [x] AC1–AC4 均有实现与相应证据，未自动启用来源或改写冻结记录。
- [x] 真实上游、受控输入、共享工作区与容器可写层边界分别记录。
- [x] 并发来源导致的集合断言已对齐，最终38项共享目录测试通过；其他来源功能不扩张为本任务结论。
- [x] 源码、规格、测试、配置与运行态一致，未降低 schema 或边界门禁。

结论：本次来源统一与逐功能检查范围通过，无未完成验收事项。完整服务实际账号权限由后续用户检查得到，保留现有访问边界。
