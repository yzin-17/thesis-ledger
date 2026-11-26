# 港交所与SEC监测正文替换验证记录

规格见[轻量正文规格](../../specs/2026-11-15-rule-monitor-lightweight-document.md)，阶段见[已归档任务](../tasks/2026-11-15-rule-monitor-hkex-sec-documents.md)。

## 原失败与官方替代核验

原执行`27ae2e0d-d649-4731-984e-d115ac184f25`为29份文档中27成功、2失败。港交所通告失败间隔15.017秒，SEC通知失败间隔3.033秒；后续同容器只读诊断分别9.574秒、10.386秒成功。原错误未保留底层异常，支持读取时延及连接建立波动触及保护的判断，不能断言具体底层原因。详见[上轮记录](2026-11-15-rule-monitor-finra-document.md)。

| 对象 | 原地址 | 替代地址与核验范围 |
| --- | --- | --- |
| 港交所`LSD/086/2022` | [2022-11-14通告及附件](https://www.hkex.com.hk/-/media/HKEX-Market/Services/Circulars-and-Notices/Participant-and-Members-Circulars/SEHK/2022/086_22_SEHK_OP_Trading-Fee_e.pdf) | [同修订官方正文摘要及附件入口](https://www.hkex.com.hk/Services/Rules-and-Forms-and-Fees/Rules/SEHK/Rules-of-the-Exchange/Rules/Rule-Update_Operation-Procedures-for-Trading-Fee?sc_lang=en)：同日记录，移除每笔`$0.5`，费率`0.005%`改`0.00565%`，覆盖二级市场及发行活动，2023-01-01生效，提供对应`086_22`修订全文与标记版附件链接 |
| SEC`34-106409` | [暂停TAF通知PDF](https://www.sec.gov/files/rules/sro/finra/2026/34-106409.pdf) | [同一发布通知的联邦公报HTML](https://www.govinfo.gov/content/pkg/FR-2026-09-23/html/2026-19392.htm)：公报编号`2026-19392`，页码60435–60438，发布日2026-09-18，提案号`SR-FINRA-2026-021`，2026-10-01至12-31暂停TAF，2027-01-01恢复 |

港交所未找到原通告的独立HTML全文；替代监测范围明确为同修订摘要及附件入口，不认证原通告签署与附件全文未变。活动标题明确该范围，原资料包及原通告观察继续保留。[港交所2022-11-01政策公告](https://www.hkex.com.hk/News/Market-Communications/2022/221101news?sc_lang=en)作为费率及生效日的交叉核验，不作为替代监测地址。

SEC官方[提案登记](https://www.sec.gov/rules-regulations/self-regulatory-organization-rulemaking/sr-finra-2026-021)与公报正文发布号、提案号相同。公报PDF分页会包含相邻通知，未据共享页码推断文档编号；核对HTML头部后采用`2026-19392`。原`ex5`规则附件仍独立监测。

同步前用现有容器的`fetch_document`、原15秒及2 MiB保护只读核验：港交所7.022秒成功，规范正文快照2484字符，包含日期、费率及附件链接；SEC1.483秒成功，正文25175字符，包含发布身份与暂停日期，两者快照可用。响应正文分别357492与26324字节，低于原PDF的520624与273086字节。

## 实施与本地回归

目录使用四组完整地址精确映射，附加登记的美国现行规则来源同样投影并执行原地址及新地址安全校验。原包内容、摘要、日期与规则不改；港交所三个来源共享一次读取，SEC影响一个来源。旧地址观察和失败继续保留，新地址建立独立版本。

美国现行规则按需核验匹配实际投影地址及已人工核验的SEC正文摘要`ccda60c99fb48d162b42f18722f0513f58d43e78668dcdfd8b80fbb76ad27cd9`，不会复用原PDF成功作为新HTML成功，也不允许任意新地址继承原摘要。原始正文摘要`ae684b125951ad60d0ddce018874dbaf631452cd489d8e5220e6a08963f57cdd`；冻结输入、原规则及历史快照保持原值。

- 定向：`.venv/bin/python -m pytest tests/test_rule_monitor_official_text.py tests/test_rule_monitor_fetch.py tests/test_rule_monitor_execution.py tests/test_rule_monitor_history.py tests/test_us_live_execution_rules.py -q`，77项通过，日志`/tmp/rule-monitor-hkex-sec-focused.log`。
- 相关：`.venv/bin/python -m pytest tests/test_rule_monitor_*.py tests/test_local_rule_demand_refresh.py tests/test_thesis_ledger_*public_fee*.py tests/test_us_live_execution_rules.py -q`，206项通过，6项既有警告，日志`/tmp/rule-monitor-hkex-sec-related.log`。
- 回归覆盖四组映射、原始包身份与元数据、共享去重、新HTML成功及旧失败保留；五个读取目标均验证HTTP失败、大小、超时、认证隔离、无重定向及无重试。美国规则覆盖新HTML缺少快照、摘要变化、未核验地址、旧PDF成功不能认证新HTML及人工复验恢复。
- 语法编译、关键flake8、服务边界含语法（499运行文件）、统一能力边界、运行合同、测试范围检查（452目标）及两个仓库`git diff --check`通过。
- 读取器、运行时、依赖、数据库和保护阈值未改：300秒总读取、15秒单件、3秒连接、2 MiB正文、串行逐件释放及原快照保护。

## 同步前保护基线

- 保存配置修订4，启用，9个保存来源，计划`0 0 * * 1`，时区`Asia/Shanghai`；配置响应序列化摘要`0ce59a05ee185165f076cbf60d6c349c857bef0b0f797b7314122e62455e15ba`。
- 原执行三表摘要：
  - `6fed1d2d-a591-41ea-bb2e-8e26a51ebb1d`：`7875554cce6e005bdec69f33ad3a77010ea84900fabc14a85f4a38ab430fdca7`。
  - `3b706028-91e9-463b-be00-835ea180f693`：`bd32612812614835872c24b1b25809bea645b1fe001324fa518c68d44bfddba0`。
  - `27ae2e0d-d649-4731-984e-d115ac184f25`：`5ba024e03c21e7205259a82f98f49e40402ff9181b9b2b7e0c9b1cd080eb2a7a`。
- 三表为`runs`、`run_failures`、`run_metadata`，按字段排序序列化计算SHA-256，最后复核须相同。
- 宿主`rule_monitor_registry.py`摘要`e483198f32a461a1b3743048e25d3c03f8962afcbee311ac423a0b671dbcd18d`；`us_live_rules_refresh.py`摘要`d9782cce5ff33b3bc807cbef070c7b5c9b2099fbd61d53c9b03cb90c9e23a174`。

## 本地同步与真实检查

- 先等待其他本地验收释放维护锁，随后从infra正式执行`./scripts/sync-code.sh dsa`，退出0，日志`/tmp/rule-monitor-hkex-sec-sync.log`。没有跳过门禁、修改数据库结构或外部卷。
- 容器两个实现文件摘要与上列宿主摘要一致。独立读取容器目录确认10个来源、29个去重文档，四组映射均正确，四份旧PDF均不在活动读取地址中，SEC按需核验使用新正文摘要。
- DSA服务健康，镜像仍为`sha256:24c71dc2c20cb607e9310c15ffefbc651074565cb7b9c408b3ad25f2e5a4760a`。此次代码快更位于容器可写层，不构成镜像已更新的证据。
- Server正式`POST /api/market-data/rule-monitor/checks`返回HTTP 201。请求标识`93f24632-1436-49ad-b922-ae223ed0cf30`，来源取同次状态中的全部登记来源，发起前配置摘要与基线一致。
- 实际开始2026-11-15 19:36:38.123077、结束19:38:12.136575（Asia/Shanghai），耗时94.013秒，`attempt=1`。29份全部检查，成功27、失败2、材料指纹变化1，终态`partial`，无运行级错误，未触发总读取时限。
- 港交所在19:36:47.836586成功，正文摘要`131a0af06bb77888ab2415a002f522c4c01a8103c3a0ffa5e04e6be9503ada16`，首次建立基准；SQLite正文2484字符、`reason=null`，正式版本详情HTTP 200，日期、费率、生效日与对应附件链接均存在。
- SEC在19:38:07.139924成功，规范摘要与人工核验值一致，首次建立基准；SQLite正文25175字符、`reason=null`，正式版本详情HTTP 200，发布号、提案号、暂停起止日及恢复日均存在。规范摘要稳定，HTML原始摘要变化不作为规则变化。
- SQLite终态、统计及两条失败与正式API一致。上列三个旧执行的三表摘要和保存配置摘要均保持不变；两份旧PDF观察仍保持原`document_unavailable`及原检查时刻，没有被新地址成功覆盖。

| 来源 | 成功文档／归属文档 | 本轮结果 |
| --- | --- | --- |
| 上交所股票收费主源 | 6／6 | 全部可读 |
| 上交所股票收费备用 | 6／6 | 全部可读 |
| 港股交易费 | 2／2 | 全部可读，替代摘要及附件入口成功 |
| 港股扩展公共收费 | 4／5 | 另一份印花税通告失败 |
| 美股Section31 | 4／4 | 全部可读，既有govinfo修复保持 |
| 美股扩展公共收费 | 6／6 | 全部可读，既有FINRA修复保持 |
| 上交所ETF经手费 | 2／2 | 全部可读 |
| 港股ETF公共收费 | 5／5 | 全部可读，替代摘要及附件入口成功 |
| 美股ETF公共收费 | 6／7 | FINRA FAQ失败 |
| 美国当前现金证券执行规则 | 6／6 | 全部可读，SEC新正文成功 |

8个来源全部可读，2个来源各有一份独立失败文档。共享地址每轮只读一次，分行计数不可相加为实际请求数。材料变化仍需人工复核，未自动修改收费规则。

## 本轮其他失败逐项诊断

原错误均为`document_unavailable`，没有保存底层异常。仅在整轮结束后，各额外做一次同容器只读诊断；沿用15秒、3秒连接、2 MiB、无重定向及无重试，不创建新业务任务，不写入观察或覆盖本轮失败。

| 文档 | 本轮原始事实 | 后续同容器只读诊断 | 判断 |
| --- | --- | --- | --- |
| [港股印花税2023通告](https://www.hkex.com.hk/-/media/HKEX-Market/Services/Circulars-and-Notices/Participant-and-Members-Circulars/SEHK/2023/ce_SEHK_CT_158_2023.pdf) | 19:36:57.307760失败，前一文档完成后3.033秒 | HTTP 200，2.923秒取得响应头，211972字节，9.788秒成功；摘要`c3810abf83dd53b22f6f58a9301525a01b80bb922e52f88543e411b2f90689d3`与此前成功相同，快照可读 | 耗时接近3秒连接时限，支持连接建立波动的推断；不是大小超限，不能据后续成功覆盖原失败 |
| [FINRA交易活动费FAQ](https://www.finra.org/rules-guidance/guidance/faqs/trading-activity-fee) | 19:37:55.123877失败，前一文档完成后3.024秒 | HTTP 200，1.862秒取得响应头，122944字节，2.349秒成功；规范摘要`a164a5ee1aee6758401d1db92196621df98f7c53953d8ef0d62973ace4d81c72`与此前成功相同，正文37260字符可读 | 同样支持连接阶段短时波动的判断；HTML原始摘要变化而规范正文稳定，不能据此判断收费内容变化 |

这两份其他文档未在此次指定替换中修改；整轮没有追加重跑，历史失败保持原值。

## 最终一致性审查

AC1由四组精确映射、官方身份、港交所替代范围标注和原资料保护核验；AC2由77项定向、206项相关回归、按需核验兼容和资源保护；AC3由正式同步及容器摘要、目录和健康状态；AC4由一次全部来源真实检查、逐项诊断、正文消费、持久化与历史配置保护核验。

指定港交所与SEC修复通过真实读取、持久化和Server消费入口；全部来源本轮仍为部分成功，不认证所有外部地址本轮通过或持续可用。未触发CI，代码未提交。

回退范围为本次新增的港交所与SEC两组精确映射、港交所监测标题及SEC监测摘要适配，再从正式DSA入口同步；保留先前govinfo、FINRA映射和全部历史证据。原收费规则及冻结输入不需回滚。
