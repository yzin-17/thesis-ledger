# AI SDK原验收断言与运行证据最终对账

## 评审范围与依据

依据[现行SDK规格](../../specs/2026-09-19-vercel-ai-sdk-integration.md)第14～15节，对[SDK任务](../tasks/2026-09-19-vercel-ai-sdk-integration.md)的AC01～48、G0/G0.1/G1/G2及[JSON Mode规格](../../specs/2026-09-22-ai-json-mode-stream-validation.md)AC1～12逐项对账。生产源码、依赖和镜像没有本批变更；本次增加的是验收入口、目标实源故障证据及文档纠偏，原已验输入不重跑。

最终结论：SDK原48项与JSON Mode原12项通过。目标共享期限595009.22ms、四个真实交付故障及最终保护已通过；当前配置Task仍保留自身真实非零费用/其他组合资格条件。

## 规格与Task的范围一致性

SDK规格AC43的明确要求是“四条显式调用路径均有本地HTTP契约测试”；第14.2节要求参数优化、探索、研究三类真实合法业务，并明确真实验证总费用为0。G0的目标数据库故障验收已包含本机Provider合成上报1.5 USD、超额事实保存及幂等停止，该事实属于目标持久化/计量自动化验证，不能当真实账单。

因此SDK当前“完整协议/费用/业务矩阵”的笼统表述应按原AC限定：四条真实适配器的本地HTTP、三类真实业务、明确的自动化费用/期限分支及独立目标门禁分别验收。原规格没有要求购买所有协议的模型或取得非零账单。SDK的自动化计量断言和配置Task中明确保留的真实非零上游费用属于不同验收范围。

Anthropic流式用途的原`schema_invalid`、未知费用和停止事实继续保留。当前保存的三个Cloudflare模型都是`@cf/` Workers AI，官方说明其不支持Anthropic Messages，Responses只对支持该接口的模型开放；现有保存模型不含GPT-OSS。本次没有增加模型或切换来源。[官方端点说明](https://developers.cloudflare.com/ai-gateway/usage/rest-api/)、[Workers AI兼容接口](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/)。这些组合没有被记为实源成功；配置Task继续持有其实际选用组合的资格与费用条件。

## 共用证据索引

- E0：[原实施及G0/G0.1/G2](../tasks/2026-09-19-vercel-ai-sdk-integration-history.md)。包含T0～T13、四个官方适配器本地HTTP/SDK、目标数据库故障、部署/回滚、浏览器消费；历史环境和失败不改写。
- E1：[生命周期与提交](../../tasks/evidence/2026-10-04-ai-lifecycle-and-submission.md)、[当前研究执行恢复](../../tasks/evidence/2026-10-20-research-execution-recovery.md)。包括持久化领取、发送窗口、取消、未知预留、重投和旧执行器拒绝。
- E2：[配置Web/HTTP差集](../../tasks/evidence/2026-10-20-ai-zero-generation-acceptance.md)、[类型转换](../../tasks/evidence/2026-10-21-ai-credential-type-conversion.md)、[协议继承及停顿](../../tasks/evidence/2026-10-31-ai-provider-protocols-and-stall.md)。
- E3：[D58正式研究](../../tasks/evidence/2026-10-29-g3-formal-acceptance.md)、[D59现行V2原生结构化](../../tasks/evidence/2026-10-29-g3-openrouter-formal-retest.md)、[D60实际Web](../../tasks/evidence/2026-10-30-g3-frontend-closeout.md)。
- E4：[参数优化及费用摘要](../../tasks/evidence/2026-10-31-optimization-g1-and-cost.md)、[Cloudflare探索/G1/T19](../../tasks/evidence/2026-10-31-cloudflare-first-four-continuation.md)。
- E5：[目标在途重启与真实新闻](../../tasks/evidence/2026-10-31-research-source-and-restart.md)、[V2实源准备故障/截止](../../tasks/evidence/2026-10-31-research-source-fault-acceptance.md)。
- E6：[当前源码质量固定基线](../../tasks/README.md#verified-source-baseline)。各后继改动的定向/类型/构建/维护同步另由E2～E5保存，不把旧CI推广到未提交的新代码。
- E7：[本批费用拒绝与实源期限Task](../tasks/2026-10-31-ai-provider-live-fault-acceptance.md)。执行包`.recovery-artifacts/first-four-zero-20261031T040822Z`，记录公开主Server、原SDK、真实Qwen、受控交付、调用上限及原配置/数据保护。

## AC01～48覆盖

| AC | 对应断言与实际证明 | 证据 |
| --- | --- | --- |
| 01 | 原生结构化/原领域校验、三类真实合法业务与单请求 | E0、E3、E4 |
| 02 | 200后读取超时保留阶段，完整适配器HTTP失败分类 | E0、E1 |
| 03 | headers后无正文首输出截止；本批另补真实Qwen交付保持 | E0、E2、E7 |
| 04 | 仅心跳不充当有效输出；首输出和总期限独立 | E0、E2、E7 |
| 05 | 有效推理/正文进度边界与原始推理保护 | E0、E3 |
| 06 | 断流/异常EOF不发布结果、未知预留保留 | E0、E1、E5 |
| 07 | 显式流错误传播到执行/业务失败 | E0、E1 |
| 08 | usage尾帧完整消费、重复结束只提交一次 | E0、E3 |
| 09 | 空白/reasoning/refusal/length不能成功 | E0、E3 |
| 10 | 截断/局部可解析不构成完整结果 | E0、E1 |
| 11 | 原策略结构/语义严格校验，失败记录保留 | E0、E4 |
| 12 | 白名单benchmark归一化后继续领域校验 | E0 |
| 13 | Schema失败时已报Token和预算消耗保留 | E0、E4 |
| 14 | unknown/partial完整性、预留及API/Web投影 | E0、E1、E4 |
| 15 | SDK重试0、请求次数守卫、无隐式恢复 | E0、E3～E7 |
| 16 | prepared/dispatching及结果恢复不重放 | E1、E5 |
| 17 | 仅明确拒绝允许同模型有界fallback，逐请求留痕 | E0、E1 |
| 18 | 断流/超时/取消不fallback、不重置任务期限 | E0、E1、E5 |
| 19 | 零预算只允许已授权路由，拒绝未知/非零费用 | E0、E3、E4、E7 |
| 20 | 接入未就绪和明确参数失配拒绝，模式不静默降级 | E0、E2、E3 |
| 21 | 用户取消、停机、丢租约的信号/旧提交围栏 | E0、E1、E5 |
| 22 | 保存故障有限重试，无法可靠恢复时unknown | E0、E1 |
| 23 | 请求ID、计量修订及事务故障幂等对账 | E0、E1 |
| 24 | 在途冻结、旧配置兼容和指纹变更过期 | E0、E2 |
| 25 | 原引用/权限校验、真实Tool反读和范围隔离 | E1、E3、E5 |
| 26 | 诊断白名单、密钥及原始推理保护，trace按其授权边界保存 | E0、E3、E7 |
| 27 | 合法候选和回测失败分离，重用已存步骤 | E0、E4 |
| 28 | fixture与兼容适配器各自合同，无真实失败转fixture | E0、E3、E4 |
| 29 | 排队/fallback/慢尾帧不重置绝对期限，取消释放资源 | E0、E1、E2；E7为补充 |
| 30 | AE10默认600秒/2请求/Token/零费用与冻结策略 | E1、E3、E5 |
| 31 | 超额事实及合法结果持久化、停止后续和事务幂等 | E0目标数据库合成1.5 USD、E1 |
| 32 | 未知预留保留，有余额/不足/无法授权分别判断 | E0、E1、E4 |
| 33 | 估算/实报/未知、币种分组、修订和API/Web汇总一致 | E0、E2、E3、E4 |
| 34 | 本地适配器证据与连接/用途/业务资格分别计算 | E0、E2、E3 |
| 35 | json_validated/native_schema各自路径与严格校验；JSON Mode后继独立 | E0、E2、E3 |
| 36 | discovery可变字段、series、seed装配及旧结果兼容 | E0、E4 |
| 37 | 再次生成新ID/预算，预填、权限和风险确认 | E0 G2、E1、E3 D60 |
| 38 | 领取/发送窗口原子围栏及元数据并发保护 | E0、E1 |
| 39 | 分阶段部署/回滚及当前产物反读，不绕legacy | E0、E1、E3 |
| 40 | 参数、探索、研究三类完整真实合法结果，各自授权/账本 | E3、E4 |
| 41 | 同一Drawer切AI且保留名称 | E0 T12.3/G2、E2 |
| 42 | 新AI草稿中性默认值 | E0 T12.3/G2、E2 |
| 43 | 显式三格式/两Chat实现、四条实际适配器本地HTTP | E0 T12/G0.1、E2 |
| 44 | OpenRouter只读兼容标记、白名单出站及费用映射，不能迁移时阻断 | E0 T12.2/G0.1、E2 |
| 45 | 目录/连接/用途分别保存事实、目录失败可手填 | E0、E2、E3 |
| 46 | 格式/地址/模型修改使验证过期，迟到结果不覆盖 | E0 T12.3/G2、E2 |
| 47 | 统一编辑器/草稿及双向类型分派 | E0 T13/G2、E2 |
| 48 | 数据库同名转换、修订、字段/密文保护和真实冲突 | E2目标Web与PostgreSQL |

## 三类真实样本与失败保留

本次没有新增G1业务生成。参数优化复用AiRun`300ad9c1-cf67-4fb8-a66e-09ecb7205208`、请求`1cb934dc-375c-41ea-8790-60173690a58f`：原合同通过，728/508 Token、上游实报0 USD，首文本约13.90秒、总约15.286秒，随后6次回测完成。

探索复用Cloudflare两份真实合法DTO：请求`2c77eec6-2170-441a-96c3-b7d4798aaeb1`及`adff2887-7919-410b-b2fb-b42225a2d58e`，分别1891/824与1891/483 Token、费用估算0 USD，首文本约2.59/1.93秒，总约23.944/11.739秒。首份候选开发段资格失败和后继T19通过分别记录。原OpenRouter三次格式失败与两次网络未知、各自预留和停止边界保持。

研究复用D58/D59现行V2、D60 Web；D59的正式native_schema/完整trace/原Zod/数值/真实Tool/重建反读及实报0 USD按原记录验收，后继真实新闻和目标在途重启分别补强。各授权批次的请求数、完整性、错误与费用未知比例保留原账本，不混合成跨批“全成功率”或长期SLA。

## JSON Mode AC1～12

AC1～7由E0/E2的共享Schema、四个官方适配器本地HTTP/SSE、原业务严格校验及实际Web证明；Anthropic+JSON Mode按合同发送前拒绝。AC8各层分别记录。AC9～10由E3的预算前Schema消息和元组语义定向检查证明；AC11～12由D58/D59完整真实响应、原数字/范围及引用、SDK消费和trace证明。后继新闻样本的incomplete trace只作该样本的真实失败事实，不替代D59完整制品。

## 最终保护与结论

本批目标费用拒绝及四个真实Cloudflare交付故障全部通过。最终40张表聚合、598条业务/审计逐ID、658条旧健康审计及5份完整Provider保持，仅新增14条所属健康审计；全部所属目录已清理，主Server未重启。最终文档/归档链接和Git检查见本批执行包。配置Task的实际非零上游费用、未获当前Provider正向资格的协议条件继续由其原Task持有；本报告只审SDK原48项及JSON Mode原12项，不把探针或受控成本记作真实账单。
