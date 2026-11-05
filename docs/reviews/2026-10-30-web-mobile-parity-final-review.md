# 手机迁移最终一致性审查

结论：**当前约定迁移范围通过**。Android与iOS的G0～G6、G7及七项最终Review全部关闭，实施记录[已归档](../archive/tasks/2026-10-22-web-mobile-feature-parity.md)，[现行Spec](../specs/2026-10-22-web-mobile-feature-parity.md)保留。Longbridge和通知Provider实源按用户明确决定留待后续，未记作通过。

## 当前输入与分层证据

- 精确候选：4541文件、53394928字节，指纹`ba27d441bc1bc5c0afaa35dddc27e7400aa60cb112a683f8006b0ffb19d5698e`；提交`a75d6e5ddfdbef6ae56d93cead5dd245624764d2`、Git树`ea8c2f952fad3fe8668507b30c23a90e617534d7`逐文件绑定。
- [CI6运行41166240615](https://github.com/yzin-17/thesis-ledger/actions/runs/41166240615)的quality、contracts/guardrails、Android Native、iOS Native首次全部成功；desktop-packages按既有条件跳过，artifact为0，无追加修复或重跑。运行时段2026-10-31T03:52:56Z～04:05:11Z。
- 35项功能/193子动作映射完整；139映射输入中136项保持原基线，3项仅为已验报告修复，11路径修复增量匹配候选。875个手机、共享合同及原生相关输入与已验基线相同，10个相关编译模块精确匹配Server/Worker。
- Android与指定iPhone Air的新增报告、保存、来源账号、路由目录和已有标的确认分别留证。历史G6AP/G6IP、G6AR/G6IR等资源专项保留原设备/输入，不改写为Air全量重跑或专项堆内存基准。

## AC核对

| 验收标准 | 证据与结论 |
| --- | --- |
| AC01 | 35项/193子动作、139映射及责任核对无遗漏，G6A/G6I和G7通过 |
| AC02 | G0双平台及各批模式/账户/范围、未提交输入和API恢复断言按匹配输入通过 |
| AC03 | C01～C12共享合同、Web/SDK回归及边界通过；当前CI6包含完整质量与契约门禁 |
| AC04 | G1A/G1I账户、账本及数据录入闭环通过，原账本业务保护记录保留 |
| AC05 | G2A/G2I资金、计划、收益及目标交互和错误恢复通过 |
| AC06 | G1/G2的组合、交易、收益和目标分平台证据通过 |
| AC07 | G0/G2市场、图表、资讯、原文及资源断言通过，来源能力按服务端准入展示 |
| AC08 | G2风险及G4策略风险应用通过；CI6补当前实际账户约束，21项定向及两角色模块绑定通过 |
| AC09 | G3A/G3I复盘、草稿/快照、历史及引用流程通过 |
| AC10 | G3及C07T/M20T、G5RPA/G5RPI通过；复用D59/D60真实报告，11份材料及所属范围审计独立双端消费 |
| AC11 | G4A/G4I策略、回测、实验、采用与任务恢复按现行可用性和原任务边界通过；不代为关闭原策略Task的独立业务义务 |
| AC12 | G5A/G5I通过；AI原值保存、Tushare账号/daily、路由目录、自动化及诊断分别核销；明确后续的Longbridge/通知Provider实源保留未验 |
| AC13 | 文件、图片、分享/CSV、链接及系统浏览器返回由G0/G1/G2/G4/G5各平台证据核销 |
| AC14 | 定向/包级/仓库、Native compile、目标API、Android Emulator及iOS Simulator分层成立；CI编译不冒充设备运行 |
| AC15 | Spec/Task/盘点/产品文档与当前范围一致；旧消费者退休，数据与独立WIP保留，完成Task归档 |

各批完整证据入口保留在归档Task；[Air报告](../tasks/evidence/web-mobile-parity/2026-10-30-ios-air-acceptance.md)、[AI保存](../tasks/evidence/web-mobile-parity/2026-10-30-mobile-ai-save-acceptance.md)、[来源账号](../tasks/evidence/web-mobile-parity/2026-10-30-mobile-source-acceptance.md)、[六项写入](../tasks/evidence/web-mobile-parity/2026-10-30-mobile-write-acceptance.md)和[CI6](../tasks/evidence/web-mobile-parity/2026-10-31-ci6-current-inputs.md)记录新增差集。

## 数据、预算与资源

双端各一次原AI配置保存复用用途证明，新增模型请求0；Tushare独立范围共4次daily。双端各一次20条原路由保存、一个公开目录job及一次已有510300.SH确认，最终策略175、目录24代/35528，没有新Asset。已完成额度关闭，不移用未消耗模型额度；CI阶段不追加模型、来源或业务写入。

两次目录job均保留`efinance: catalog_provider_unavailable`，生产合同由可用来源完成合并，不能据此声称全部Provider健康。账本业务、凭证配置、旧历史及自动化保护限定各自执行窗口，背景估值/健康检查分别归因；独立任务的后续变化与恢复另留证，不声称窗口后全局数据始终不变。

自有Android只读副本、Metro/网关及Air状态已按本轮窗口收尾；Runtime和已装App保留，原API继续运行。三仓HEAD/空索引保持，原树不提交，临时分支不合并，不上传安装包或验收包。

## 独立WIP及后续边界

额外的研究/AI手动故障验收工具未跟踪、未纳入候选、冻结应用/CI输入无引用、Server/Worker未部署；逐文件SHA256与边界证明保留在本机CI6证据目录。原始全仓字节比较仍为false，当前迁移候选无未解释功能差异；不声称整个脏工作树已通过CI，也不改变Git忽略或门禁阈值。

本报告复核时，[Longbridge](../TODO.md#longbridge-oauth-live-acceptance)及[通知Provider实源](../archive/tasks/2026-11-03-mobile-notification-provider-live-acceptance.md)均由用户明确留待后续；当轮未创建渠道或发送通知。通知后续于 2026-11-03 按独立授权完成真实飞书投递、用户收件确认和双端页面消费，见[新增验收证据](../tasks/evidence/2026-11-03-mobile-notification-provider-live-acceptance.md)。Longbridge 继续由原 TODO 维护；原迁移 CI 输入和历史结论保持。

本机汇总：`apps/mobile/release/acceptance-ci6-2026-10-31/最终迁移候选一致性.json`、`十模块最终目标绑定.json`、`迁移候选与独立WIP边界核对.json`及原始严格比较。证据层级、输入与限制分别保留。
