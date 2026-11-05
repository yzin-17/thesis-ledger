# G3 存储恢复后的同次正式验收

## 当前范围与恢复核对

用户确认空间和 Docker 恢复，要求先核实 V2 关闭，再续原保留数据更新及单次 G3。仍用 openrouter/free、剩余 9 次共享预算、费用上限 0 元，保留推理默认、数据、来源启停和 20 条路由；失败即停、不自动重试，验后关闭 V2。原 10 月 24 日构建只读失败及其未提交事实保留在[原检查点](2026-10-24-g3-formal-free-sdk.md)。本次沿用未使用的 submissionId，不重发已通过的 D19 直连，不改用途、默认或输出模式。

北京时间 10 月 25 日恢复核对：五个容器均健康；实际 V2=false，research/capabilities 的 canCreate=false，临时策略未注入。默认仍 openrouter/free、修订 5，研究 V2/native_schema 用途就绪，配置指纹与旧证明保持，17 个已验源码输入未变。主机约 5.1 GiB 可用；构建写入由本次官方更新验证，不以只读健康检查代替。

原 17 张保护表的所有原行摘要及旧 AI 均保留；Account 26→28、Strategy 91→95、StrategyVersion 92→98 仅有新增，原样保留，并作为更新期间的保护基线。数据库／owner 仍 thesis_ledger，结构 head 为 20261023010000_report_metadata_snapshots。计划中的 submissionId 尚无任务，因此模型额度未消费。

当前有效路由为 20 条。600519.SH 的原东财／HiThink 新闻准入日期从 10 月 16 日分别覆盖至 28／29 日，有效期也覆盖本次请求；不修改准入或重取已通过的来源验收。来源控制采用恢复后只读快照建立本次前后精确保全基线，摘要协议明确记录为 sqlite-row-json-sorted-v1，避免把不同序列化协议的旧摘要直接比较。

## 执行与停止条件

官方入口仍是 thesis-ledger-infra/scripts/update.sh thesis-ledger，保留数据检查模式、原开关与环境，仅受控开启 V2／单次零费用策略。目标模块、策略、默认／用途及保护核对通过后才正式提交 600519.SH／shadow／recent-changes，最多 1 次真实模型调用。随后核对 SDK 终态、JSON／V2、报告／引用／历史；最终以同一官方入口恢复关闭并反读。

已通过的 D16 本地门禁与 D19 原样直连按输入复用；本次没有应用源码、依赖或数据库结构改动，不重复全包。上述为启动前计划，实际结果如下，机器检查点见同名 JSON。

## 实际结果与关闭恢复

官方保留数据开启更新及最终关闭更新均退出 0，均从 thesis-ledger-infra 执行 update.sh thesis-ledger；非敏感参数为 DEV_DATABASE_MODE=check、UPDATE_SPACE_MODE=auto、REPAIR_BUILD_CACHE_ON_NO_SPACE=false，开启时仅注入单次零费用策略，关闭时恢复原开关与无临时策略。两个日志分别保留在 .recovery-artifacts/g3-free-20261025/enable-1792865721742.log 与 close-1792866473711.log。开启／关闭后各 14 个目标模块均与已验构建一致，其他服务镜像及挂载保持；这是完整镜像更新证据。

唯一正式提交返回 HTTP 200／queued、reused=false；runId 为 238c6c7e-54f7-4f46-9fc6-c7ffb0188a81，requestId 为 7c00b7bd-963d-4ef0-8588-22c5d3b49d39。北京时间 02:23:26 任务收敛 failed／research_unknown_outcome，唯一请求为 transport_unknown／stream／Provider returned error，externalResult=unknown、result=null。SDK 和兼容层均未记录正文或推理分片，可解析帧为 0，jsonStatus=missing；不能把本次归因为已收到正文的 JSON 解析失败。

实际发送诊断已保留：openrouter/free、native_schema、stream=true、json_schema／strict／require_parameters、max_tokens=20000，推理参数仍为原默认；请求 22,517 字节，SHA-256 为 0beccf88684d2b4817f3143e0e391815b5936d8627af89cf8169ead3b723fb8b，实际 fetch 尝试为 1。实际 SDK 为 ai@7.0.107、@ai-sdk/openai-compatible@3.0.53、zod@4.4.3。实际模型、结束原因、用量和费用未知，只有冻结免费定价的 0 USD 估算；不把未知记为实际零费用。

首次失败后未重试、未切模式／模型，未执行报告／引用／历史正向验收。已用 1/1，共享预算剩余 8 次冻结。02:34:55 关闭更新后的实际 V2=false、canCreate=false、临时策略未注入，五容器健康，原默认及修订 5 保持。新失败完整行摘要 d5f9ca41c5b5bf72895025c1f0c3cbca 在重建后保持，错误／请求事实没有被改写；旧 AI 记录也保持。

原 17 张保护表的原行摘要均保留，来源四张控制表摘要及 20 条路由、原环境与挂载精确保持。Strategy 95→96、StrategyVersion 98→100 另有新增，所有原行均在；本轮未对新增来源归因，新增也原样保留，不删除或回退。因此不能声称全部表数量／整体摘要完全相同。

## 当前卡点与待确认动作

已保存诊断缺少真实 HTTP 响应状态和上游错误体，不能区分 HTTP 拒绝与 SSE 错误。关闭更新后的当前容器启动于 02:29:05，无法覆盖原请求时刻的容器日志；本次不继续扩搜日志或重新发送请求。

同步文档时主机再次报 ENOSPC，随后只读 df 显示约 272 MiB 可用；不把它描述成 Docker 再次只读，因为本轮尚无该证据。V2 已关闭及保护核对结果先于此错误保存。已停止进一步代码、构建和模型调用，没有清理或重启。

下一步需先确认空间处理，再补齐实际 fetch 边界的 HTTP 响应状态与脱敏限长错误信息，先做本地回放验证，不新增模型调用；不改变请求参数、解析、重试、预算、默认或路由。该后续尚未实施，剩余 8 次保持冻结。
