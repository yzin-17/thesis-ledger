# 参数优化真实闭环、探索停止与费用读取

## 参数优化已通过的范围

使用本轮新授权的现有 OpenRouter/free、费用上限 0，建立独立验收基线策略 `45634706-a322-454a-ac6e-1e3e78a8f851`，首个正式版本为 version=1、定义 schemaVersion=2，版本 ID 为 `f1b16db4-a355-4d35-b814-8c6c87623dd0`。只操作新建验收记录，不修改原 99 份策略或既有版本，不关联账户或风险应用。

首次误选不存在的 `risk.0.percent`，公开创建接口返回 400，未建实验、未调用模型；保留原失败后改用服务端实际参数描述中的 `sizing.percent`。实验 `60ea6a25-7cec-4a37-888e-0efcb66e4c83` 冻结 1 轮、最多 1 次模型、6 次回测及费用 0；公开源窗口为同花顺 `600519.SH`、2025-03-03～08-29 的固定来源归一化研究，不声明严格 PIT 或统计意义上的未见样本。

- AiRun `300ad9c1-cf67-4fb8-a66e-09ecb7205208`，唯一请求 `1cb934dc-375c-41ea-8790-60173690a58f`。
- 请求模型 OpenRouter/free；现有 checkpoint 已保存实际模型 `cohere/north-mini-code:free`，无须新增模型调用补证。SDK 首事件约 7109.98ms、首文本约 13900.30ms；发送 16:25:32.284 UTC、完成计量 16:25:47.570 UTC，约 15.286 秒。旧标量 durationMs 未填写，不以推算值回写该字段。
- 原 `optimization-parameter-v1` 合同通过，728/508 Token，上游实报 0 USD。提案只将仓位比例 0.5 改为 0.55，保留 reason 与空 evidenceRefs；未注入未提供的证据引用。
- 候选 `0e57edc9-e7ff-4037-ae9d-e1eb64c6a850`，候选版本 `3dbe7b12-da05-4ee5-a0ca-7fe15cf0ba9e`，执行摘要 `6df0d20b804dec24bff3395b09b6ea9c930aab11c26ceb5e733b170f714d21d1`。
- 基线与候选的开发、验证回测各完成一次；先锁定候选集合和预选候选，再以原剩余两次预算执行测试集，合计 6 次真实回测、仍只 1 次模型。实验 succeeded / completed，候选 test_valid；开发/验证/测试闭合交易为 20/19/21，完整性均 complete。
- 测试访问与揭示分别持久化，`testRevealed=true`、锁定集合和预选候选未重置。候选可审阅，但本次没有采纳或创建风险应用；参数优化不能冒充 T19 的从零探索首次采纳。

## 费用摘要修复

实际 SDK 账本已结算上游 0 USD，原摘要却只读取旧扁平 costStatus/costCurrency，误报 historical_missing_metadata。新增优化领域的逐请求成本投影，通过既有 AI 执行白名单读模型取最新计量修订；摘要仅合计 known 实际金额，估算和未知仍为部分结果，坏 SDK 账本不能回退旧零值，无 SDK 账本的历史读取保持。

四个定向文件 24 项通过，覆盖已报告零、估算零、未结算预留、新修订替换、多请求、多币种、未知部分、损坏账本及旧记录兼容。Server 类型、写集 ESLint、构建和边界通过；首次 ESLint 的未使用 import 已移除，原失败保留。维护入口同步后，复用同一实验 API 显示 complete / knownAmount=0 USD；两份失败探索仍为 partial / unknown_cost，没有回写任何原账本。

当前 Desktop Vite 与实际 Server 经 Edge/Playwright 只读验收，初始进入及刷新后在“运行详情”均显示 1 次 AI、6 次回测、728/508 Token、已确认 USD 0，未发任何修改请求，无 pageerror 或失败 API。截图人工核对通过。首次 networkidle 等待不适用于持续轮询页面，随后定位到实际运行详情页签；测试等待与页签定位的失败均保留。网页验收仅覆盖这些 AI 计量字段，不代收完整回测、采纳或风险界面。

## 探索的真实失败与停止

现有提示修复把完整输出 JSON Schema 送入业务消息，并提供只含可变字段的最小合法示例，保留原 Zod/冻结 seed/单位转换与数据资格门禁；本地、隔离 SDK/PostgreSQL 与目标同步已过。实际探索仍没有合法候选：

| 实验 | 实际请求与结果 |
| --- | --- |
| 111cac80-1087-4ba1-a83e-192a3d9bcba8 | bc4b4ed9-7fd9-44e3-9b81-e55414aa7f6b；TLS 断连，结果未知、预留保持 |
| 1a06741d-3135-45d2-ab00-129d22d72058 | 56fbe346 开头请求；完整响应 Schema 不合法，原失败及用量保留 |
| c788d391-6d83-4d34-9d7d-aaa09126136b | 01722f0d 开头请求；完整 Schema 提示后仍嵌套不合法，原失败保留 |
| da8be7e1-ed2c-444e-b4ee-72f4f14a2a85 | 5c40b72e-2cdd-433b-bbe5-bc21f6d2027d；流中 502，结果未知、预留保持 |
| f75f5548-c1d6-43aa-a6a4-7adeb05ca554 | a3674d9e-0cda-41f7-9ea7-9fbd386ac7cd；最小示例部署后的响应仍无法解析，schema_invalid |

另有公告准备、旧种子价格单位和目录修订变化引起的零模型阻断，均保留原终态。实验 `153a68fc-daa2-4c86-8238-194dc80e03c7` 在模型前因旧冻结窗口的 catalogRevision 与当前目录不符而失败；日线路由本身仍就绪。本次通过正常准备入口取得新冻结窗口，没有改写旧窗口或放宽修订校验。

五次探索真实请求中，三次完整响应均格式失败，两次网络结果未知；合法候选为 0，用量已知三次、未知两次。实际供应商账单未观测，估算零不作为实际账单。依据本轮预先冻结的第三次同类格式失败即停止条件，现有 OpenRouter/free discovery 路由停止，不继续换幂等或模型碰运气。该停止口径比仅按紧邻连续错误计数更保守，不把中间网络错误改写为格式错误。

因此 G1 的三类业务父门禁和 T19 均未通过。恢复条件是具备稳定且能满足探索 DTO 的授权免费执行条件，再按新冻结数据及原停止边界验收；不得由参数实验、用途探针或本地提示测试代收。

## 证据定位

执行包 `.recovery-artifacts/first-four-acceptance-20261030T134208Z` 的 `parameter-*`、`business-model-facts.json`、`cost-*`、`discovery-current-catalog*`、`discovery-frozen-preflight-bound-response.json`、`read-fixes-sync-*` 和 `real-model-final-ledger.json`。完整计量、checkpoint 与所有请求 UUID 保存在原数据库和该执行包，正文中的请求前缀只用于定位。
