# 来源凭据最终一致性复核

日期：2026-11-01。用户要求完成当前非Tushare任务。本次完成来源凭据Task的最后两项Review；不执行Tushare操作，不启动已延期的Longbridge或手机通知验收。

## 范围与复核依据

原[来源凭据Spec](../../specs/2026-09-14-market-provider-credentials.md)AC1～AC7保持不变。当前获准在线范围、Finnhub免费范围和Longbridge延期均已由用户确认；本次核对已有实现、实际部署、浏览器及在线证据，不把范围外拒绝或延期计为读取成功，也不新增连接探针、保存凭据、启停来源、路由变更、模型调用或消息发送。

原Task T1～T5a已勾选，T5b当前范围已有逐来源证据。原最终Review未执行，是本次唯一可直接收口的来源配置工作；Tushare现金分红生产消费仍归[适配层Task](../2026-10-09-unified-data-capability-adapter.md)，原状态保持。

## AC逐项复核

| 条件 | 实现与证据 | 结论及边界 |
| --- | --- | --- |
| AC1 即时启停、失败与并发 | 原T1部分更新及T5a实际Web/重启闭环，启停只写enabled；[首次保存修复](2026-10-22-provider-first-credential-state.md)覆盖缺省enabled和已停用来源补凭据 | 通过。原状态保全证据有效，本次不再切换来源 |
| AC2 手动保存、留空、替换与清除 | 原五来源Web保存/清除及Longbridge仅换Access Token的保留验证；共享Schema、客户端内存草稿、DSA结构化加密存储 | 通过。Tushare既有配置证据及原跳过范围直接复用，不执行新操作 |
| AC3 配置生效、优先级与迟到结果 | 原T2a/T2b/T3b的版本化快照、环境恢复、旧实例隔离、OAuth条件提交和原目标重启 | 通过。配置、凭据内部版本与业务账号不变 |
| AC4 保密 | 原T5a实际SQLite密文、无测试明文日志、页面不回显；真实定制SDK存储扩展及公开响应投影 | 通过。无密钥、令牌或授权头写入本次文档/输出；未读取凭据明文 |
| AC5 草稿测试 | 原指定来源/草稿、无落库/回退/业务缓存及输入版本绑定；原138项关联回归和错误分类补验 | 通过。实际在线事实与受控失败分列，不重复探针 |
| AC6 OAuth生命周期 | 原SDK/存储、真实本地回调、取消、迟到、过期和重启恢复；实际账号及在线刷新已明确转由[Longbridge TODO](../../TODO.md#longbridge-oauth-live-acceptance)持有 | 已交付合同通过。后续真实在线尚未验，不改为通过，不阻塞当前获准范围 |
| AC7 Docker/Web与在线范围 | 原T5a实际部署/Web/持久化；[TickFlow首存目标修复](2026-10-22-provider-first-credential-state.md)、[Alpha Vantage近期与旧窗](2026-10-22-alphavantage-free-recent-daily.md)、[Finnhub免费范围](2026-10-22-finnhub-free-scope-acceptance.md) | 当前获准范围通过。TickFlow只覆盖原股票日线none/报价；Alpha Vantage旧窗not_covered且无full回退；Finnhub日线permission_denied仍是拒绝，未扩大证券、接口或账户权益 |

原首存202项、语法/确定性门禁及正式 `update.sh dsa` 的失败、获准恢复和最终成功均保留在原证据；原Alpha Vantage470项及正式快更后的真实近期读取、旧窗一次compact拒绝也保留，不提升为新的完整历史资格。原OAuth/Native/部署证据只支持其对应产物，不声称本次重新编译、部署或通过CI。

## 输入适用性与当前核对

当前DSA `src/services/thesis_ledger_control.py`仍为2395行，SHA-256为 `d271115d218cb0209c572bac94343f592971c41a9bdc156fcd7f109e19386eb3`，与首存最终已测/已部署代码完全相同。当前Alpha Vantage精确来源模块SHA-256为 `79cc547e4d484d691ca6bc70bc0fd37663d12f62e0e142b741de5e8ab53c1725`，与原目标真实近期/旧窗验收一致。

最新[UI完成记录](../../archive/tasks/2026-09-08-ui-interaction-consistency.md)已保存当前Desktop全量1140项及其后12项纯样式差集、最终类型/构建与真实Docker API消费；本次没有改变相关源码、依赖、配置或运行输入，复用已有证据，不重新执行模型、来源、OAuth或通知动作。以上原运行态证据不是本次重新在线探测的声明。

## 最终结论与保护

原AC1～AC7、T1～T5a和现行T5b范围均有实现与相应证据；接口、存储、时钟、身份、错误分类及副作用边界一致。先前阻塞的首存启停已实际修复；范围外能力和已延期事项已有明确归属，本Task不再持有未完成实施或在线门禁。原最终Review通过，归档[完整Task](../../archive/tasks/2026-09-14-market-provider-credentials.md)，Spec保留为现行合同。

本次只有文档/索引/归档变更，真实模型调用0次、外部数据请求0次、费用0、通知发送0次、Docker操作0次。三仓HEAD/index、源码输入及未提交修改保持；不保存或展示凭据，不改Tushare、默认、准入、原报告或账本。机器核对位于 `.recovery-artifacts/non-tushare-closeout-current.json` 指向的目录，含起点、源码摘要、链接及最终完整性回执。

其他非Tushare任务仍按各自合同保留：研究正向价格需要到期与合格材料；AI AC-13需要真实正金额费用；现金通知需要渠道和接收范围；P3真实对照不能使用现有2个受控样例代替至少20个合格案例、真实协议及明确调用预算。没有通过本次来源配置归档代收这些条件。
